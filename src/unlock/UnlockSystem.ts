import { GEM_DEFINITIONS, GEM_KINDS, type GemKind } from '../config/gems';
import {
  DEFAULT_UNLOCKED_FEATURES,
  FEATURES,
  FEATURE_ORDER,
  SPEED_FEATURE_PRESETS,
  isDefaultFeature,
  isFeatureId,
  type FeatureId,
  type FeatureSpec,
} from '../config/unlocks';
import type { Inventory } from '../inventory/Inventory';

/** 功能当前的解锁状态：未解锁 / 已由调试启用 / 已合成完成。 */
export type FeatureStatus = 'locked' | 'unlocked' | 'completed';

export type PlaceOutcome =
  | 'ok'
  | 'unknown'
  | 'unlocked'
  | 'no-cell'
  | 'void-cell'
  | 'occupied'
  | 'no-stock';

export type CraftOutcome = 'ok' | 'unknown' | 'unlocked' | 'incomplete' | 'mismatch' | 'missing';

export interface CraftResult {
  readonly outcome: CraftOutcome;
  /** 可以直接显示给玩家的中文提示。 */
  readonly message: string;
  readonly feature?: FeatureSpec;
}

/**
 * 解锁存档段。放在 `SaveData.sections.unlock` 里，同时也会单独写一份到独立的
 * localStorage 键，保证换世界 / 清空世界存档后解锁进度仍然保留。
 */
export interface UnlockSaveData {
  /** 已解锁的功能（包含合成完成与调试启用）。 */
  unlocked?: string[];
  /** 已经成功合成过的功能，界面据此保留图纸特效。 */
  completed?: string[];
  /** 各功能当前摆在槽位里的宝石（与图纸格子一一对应，null 为空）。 */
  drafts?: Record<string, Array<string | null>>;
  /** 新手礼包是否已经发放过，避免刷新后重复领取。 */
  starterGranted?: boolean;
  /** 调试“一键全部解锁”是否用过（用于放行调试传送按钮）。 */
  debug?: boolean;
}

const GEM_SET = new Set<string>(GEM_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGemKind(value: unknown): value is GemKind {
  return typeof value === 'string' && GEM_SET.has(value);
}

/**
 * 功能解锁系统：纯逻辑，不碰 DOM 与存档后端，方便单元测试。
 *
 * 关键约束：
 * - 同一颗宝石可能被多个功能的草稿同时“占用”，因此有 `reserved()` 统一计算预留数；
 * - 合成成功才会真正从背包扣宝石，失败不会改动任何库存；
 * - 已解锁的功能不再接受摆放与合成。
 */
export class UnlockSystem {
  /** 行走 / 跳跃 / 背包开局就在里面，其余功能要合成或调试解锁。 */
  private readonly unlockedIds = new Set<FeatureId>(DEFAULT_UNLOCKED_FEATURES);
  private readonly completedIds = new Set<FeatureId>();
  private readonly drafts = new Map<FeatureId, Array<GemKind | null>>();
  private starterGrantedFlag = false;
  private debugFlag = false;

  isUnlocked(id: FeatureId): boolean {
    return this.unlockedIds.has(id);
  }

  isCompleted(id: FeatureId): boolean {
    return this.completedIds.has(id);
  }

  status(id: FeatureId): FeatureStatus {
    if (this.completedIds.has(id)) return 'completed';
    return this.unlockedIds.has(id) ? 'unlocked' : 'locked';
  }

  get starterGranted(): boolean {
    return this.starterGrantedFlag;
  }

  get debugUnlocked(): boolean {
    return this.debugFlag;
  }

  /** 已解锁的功能列表，顺序与功能定义一致（开局默认能力在最前面）。 */
  unlocked(): FeatureId[] {
    return FEATURE_ORDER.filter((id) => this.unlockedIds.has(id));
  }

  completed(): FeatureId[] {
    return FEATURE_ORDER.filter((id) => this.completedIds.has(id));
  }

  /** 当前速度倍率上限：没有任何速度档位时保持基础 ×1。 */
  speedLimit(): number {
    let limit = 1;
    for (const id of FEATURE_ORDER) {
      const preset = SPEED_FEATURE_PRESETS[id];
      if (preset !== undefined && this.unlockedIds.has(id)) limit = Math.max(limit, preset);
    }
    return limit;
  }

  /** 是否解锁了任意一个速度档位（决定底部速度控件能否操作）。 */
  speedUnlocked(): boolean {
    return this.speedLimit() > 1;
  }

  /** 某个功能的草稿（长度固定为图纸格子数，缺省补 null）。 */
  draft(id: FeatureId): Array<GemKind | null> {
    const spec = FEATURES[id];
    const saved = this.drafts.get(id);
    const cells: Array<GemKind | null> = [];
    for (let index = 0; index < spec.cells.length; index++) {
      cells.push(saved?.[index] ?? null);
    }
    return cells;
  }

  /** 草稿里已经摆了几颗宝石（只算非空格子）。 */
  filledCount(id: FeatureId): number {
    const spec = FEATURES[id];
    const saved = this.drafts.get(id);
    if (!saved) return 0;

    let filled = 0;
    for (let index = 0; index < spec.cells.length; index++) {
      if (spec.cells[index].kind !== null && saved[index]) filled += 1;
    }
    return filled;
  }

  /** 所有草稿里占用的某种宝石数量；`except` 用于排除当前正在编辑的功能。 */
  reserved(kind: GemKind, except?: FeatureId): number {
    let count = 0;
    for (const [id, cells] of this.drafts) {
      if (id === except || this.unlockedIds.has(id)) continue;
      for (const gem of cells) if (gem === kind) count += 1;
    }
    return count;
  }

  /** 背包里还能摆进槽位的数量（总量减去其它草稿的预留）。 */
  available(kind: GemKind, inventory: Inventory, except?: FeatureId): number {
    return Math.max(0, inventory.count(kind) - this.reserved(kind, except));
  }

  placeGem(
    id: FeatureId,
    index: number,
    kind: GemKind,
    inventory: Inventory,
  ): PlaceOutcome {
    if (!isFeatureId(id)) return 'unknown';
    if (this.unlockedIds.has(id)) return 'unlocked';

    const spec = FEATURES[id];
    if (!Number.isInteger(index) || index < 0 || index >= spec.cells.length) return 'no-cell';
    if (spec.cells[index].kind === null) return 'void-cell';

    const draft = this.ensureDraft(id);
    if (draft[index]) return 'occupied';
    if (this.available(kind, inventory, id) <= 0) return 'no-stock';

    draft[index] = kind;
    return 'ok';
  }

  removeGem(id: FeatureId, index: number): boolean {
    if (!isFeatureId(id) || this.unlockedIds.has(id)) return false;

    const draft = this.drafts.get(id);
    if (!draft || !Number.isInteger(index) || index < 0 || index >= draft.length) return false;
    if (!draft[index]) return false;

    draft[index] = null;
    if (!draft.some(Boolean)) this.drafts.delete(id);
    return true;
  }

  clearDraft(id: FeatureId): boolean {
    return this.drafts.delete(id);
  }

  /**
   * 合成：校验槽位是否摆满、种类是否与图纸完全一致、库存是否足够。
   * 通过后消耗宝石、永久解锁，并清空草稿（图纸由功能定义决定，完成后仍会渲染出来）。
   */
  craft(id: FeatureId, inventory: Inventory): CraftResult {
    if (!isFeatureId(id)) {
      return { outcome: 'unknown', message: '找不到这个功能。' };
    }

    const spec = FEATURES[id];
    if (this.unlockedIds.has(id)) {
      return { outcome: 'unlocked', message: `${spec.label} 已经解锁了。`, feature: spec };
    }

    const draft = this.draft(id);
    const empty = spec.cells.reduce(
      (sum, cell, index) => sum + (cell.kind !== null && !draft[index] ? 1 : 0),
      0,
    );
    if (empty > 0) {
      return { outcome: 'incomplete', message: `图纸还差 ${empty} 个槽位没摆满。`, feature: spec };
    }

    const mismatch = this.describeMismatch(spec, draft);
    if (mismatch) {
      return { outcome: 'mismatch', message: `宝石与图纸不符：${mismatch}`, feature: spec };
    }

    for (const need of spec.needs) {
      if (inventory.count(need.kind) < need.count) {
        return {
          outcome: 'missing',
          message: `${this.gemLabel(need.kind)} 不够（需要 ${need.count} 颗）。`,
          feature: spec,
        };
      }
    }

    for (const need of spec.needs) {
      if (!inventory.spend(need.kind, need.count)) {
        return { outcome: 'missing', message: '宝石消耗失败，请再试一次。', feature: spec };
      }
    }

    this.drafts.delete(id);
    this.unlockedIds.add(id);
    this.completedIds.add(id);
    return { outcome: 'ok', message: `合成成功：${spec.label} 已永久解锁！`, feature: spec };
  }

  /** 调试：一键启用所有功能（不消耗宝石，也不会标记为“已合成”）。 */
  unlockAll(): FeatureId[] {
    const added: FeatureId[] = [];
    for (const id of FEATURE_ORDER) {
      if (isDefaultFeature(id) || this.unlockedIds.has(id)) continue;
      this.unlockedIds.add(id);
      added.push(id);
    }
    // 摆了一半的草稿在原功能被解锁后没有意义，清掉避免槽位里残留“幽灵宝石”。
    this.drafts.clear();
    this.debugFlag = true;
    return added;
  }

  markStarterGranted(): void {
    this.starterGrantedFlag = true;
  }

  toSave(): UnlockSaveData | undefined {
    const data: UnlockSaveData = {};

    // 默认能力不需要写进存档：任何一次读取都会重新放进解锁集合。
    const craftableUnlocked = this.unlocked().filter((id) => !isDefaultFeature(id));
    if (craftableUnlocked.length > 0) data.unlocked = craftableUnlocked;
    if (this.completedIds.size > 0) data.completed = this.completed();

    const drafts: Record<string, Array<string | null>> = {};
    for (const [id, cells] of this.drafts) {
      // 已解锁的功能不再需要草稿（调试解锁后残留的草稿不写进存档）。
      if (this.unlockedIds.has(id) || !cells.some(Boolean)) continue;
      drafts[id] = cells.map((gem) => gem ?? null);
    }
    if (Object.keys(drafts).length > 0) data.drafts = drafts;

    if (this.starterGrantedFlag) data.starterGranted = true;
    if (this.debugFlag) data.debug = true;

    const empty =
      !data.unlocked && !data.completed && !data.drafts && !this.starterGrantedFlag && !this.debugFlag;
    return empty ? undefined : data;
  }

  /**
   * 从存档恢复（完整替换）。草稿会按当前背包重新校验：超出库存或多出在留白格上的宝石会被丢弃，
   * 避免一份被改坏的存档凭空生成宝石。
   */
  fromSave(value: unknown, inventory: Inventory): void {
    this.reset();
    this.applySave(value, inventory, false);
  }

  /**
   * 合并存档：只增加进度，不会抹掉当前已经解锁的功能。
   *
   * 完整存档里的 `unlock` 扩展段可能比独立槽位旧（例如调试解锁之后没有再次保存世界），
   * 因此世界存档恢复时用合并，保证“解锁一次就永久保留”。
   */
  mergeFromSave(value: unknown, inventory: Inventory): void {
    this.applySave(value, inventory, true);
  }

  reset(): void {
    this.unlockedIds.clear();
    // 行走 / 跳跃 / 背包是默认能力，不属于“进度”，清空后立即放回。
    for (const id of DEFAULT_UNLOCKED_FEATURES) this.unlockedIds.add(id);
    this.completedIds.clear();
    this.drafts.clear();
    this.starterGrantedFlag = false;
    this.debugFlag = false;
  }

  private ensureDraft(id: FeatureId): Array<GemKind | null> {
    const spec = FEATURES[id];
    let draft = this.drafts.get(id);
    if (!draft) {
      draft = new Array<GemKind | null>(spec.cells.length).fill(null);
      this.drafts.set(id, draft);
    }
    return draft;
  }

  /**
   * 读存档的公共实现：`merge` 为 false 时整体替换（调用方已 `reset()`），
   * 为 true 时只增不减，并保留当前已有的草稿与标记。
   */
  private applySave(value: unknown, inventory: Inventory, merge: boolean): void {
    if (!isRecord(value)) {
      this.validateDrafts(inventory);
      return;
    }

    if (Array.isArray(value.unlocked)) {
      for (const id of value.unlocked) {
        if (isFeatureId(id)) this.unlockedIds.add(id);
      }
    }
    if (Array.isArray(value.completed)) {
      for (const id of value.completed) {
        if (!isFeatureId(id)) continue;
        this.completedIds.add(id);
        // 合成完成必然也已解锁，坏存档里缺了 unlocked 时这里补齐。
        this.unlockedIds.add(id);
      }
    }

    if (isRecord(value.drafts)) {
      for (const [key, cells] of Object.entries(value.drafts)) {
        if (!isFeatureId(key) || this.unlockedIds.has(key)) continue;
        if (!Array.isArray(cells)) continue;
        // 合并时以当前（更新的）草稿为准。
        if (merge && this.drafts.has(key)) continue;

        const spec = FEATURES[key];
        const draft: Array<GemKind | null> = [];
        for (let index = 0; index < spec.cells.length; index++) {
          const gem = cells[index];
          draft.push(isGemKind(gem) ? gem : null);
        }
        this.drafts.set(key, draft);
      }
    }

    if (merge) {
      if (value.starterGranted === true) this.starterGrantedFlag = true;
      if (value.debug === true) this.debugFlag = true;
    } else {
      this.starterGrantedFlag = value.starterGranted === true;
      this.debugFlag = value.debug === true;
    }

    this.validateDrafts(inventory);
  }

  /** 逐个槽位核对图纸；返回不一致的描述，完全匹配时返回 null。 */
  private describeMismatch(spec: FeatureSpec, draft: ReadonlyArray<GemKind | null>): string | null {
    const need = new Map<GemKind, number>();
    const placed = new Map<GemKind, number>();

    spec.cells.forEach((cell, index) => {
      const gem = draft[index];
      if (!gem) return;
      placed.set(gem, (placed.get(gem) ?? 0) + 1);
      if (cell.kind) need.set(cell.kind, (need.get(cell.kind) ?? 0) + 1);
    });

    const parts: string[] = [];
    for (const kind of GEM_KINDS) {
      const want = need.get(kind) ?? 0;
      const have = placed.get(kind) ?? 0;
      if (want === have) continue;
      const label = this.gemLabel(kind);
      parts.push(have < want ? `${label} 少 ${want - have} 颗` : `${label} 多 ${have - want} 颗`);
    }

    return parts.length > 0 ? parts.join('，') : null;
  }

  private gemLabel(kind: GemKind): string {
    // 复用宝石定义里的中文名，避免在这里重复维护一份文案。
    return GEM_DEFINITIONS[kind].label;
  }

  /** 恢复草稿后按库存裁剪：先到先得，超出库存的宝石被退回（置空）。 */
  private validateDrafts(inventory: Inventory): void {
    const used = new Map<GemKind, number>();

    for (const [id, draft] of [...this.drafts]) {
      if (this.unlockedIds.has(id)) {
        this.drafts.delete(id);
        continue;
      }

      const spec = FEATURES[id];
      for (let index = 0; index < draft.length; index++) {
        const gem = draft[index];
        if (!gem) continue;

        if (spec.cells[index].kind === null) {
          draft[index] = null;
          continue;
        }

        const left = inventory.count(gem) - (used.get(gem) ?? 0);
        if (left <= 0) {
          draft[index] = null;
          continue;
        }
        used.set(gem, (used.get(gem) ?? 0) + 1);
      }

      if (!draft.some(Boolean)) this.drafts.delete(id);
    }
  }
}
