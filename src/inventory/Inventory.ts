import { DYNAMIC_GEM_KINDS, GEM_KINDS, type GemKind } from '../config/gems';

/** 存档里每种宝石的数量；数量为 0 的品类不写入，保持存档紧凑。 */
export type GemCounts = Partial<Record<GemKind, number>>;

/**
 * 背包的存档段。放在 `SaveData.sections.inventory` 里，
 * 以后加别的物品只需往这里加字段，不用动存档版本号。
 */
export interface InventoryData {
  gems?: GemCounts;
  /**
   * 已经收走的固定宝石站点（`kind:cx:cz`）。
   * 记下来后重新载入世界时这些位置不会再长出一颗新的，
   * 否则收过的宝石会在原地复活、可以无限刷。
   */
  taken?: string[];
}

/** 单种宝石的数量上限，防止一份被改坏的存档把数字撑爆 UI。 */
const MAX_PER_KIND = 9999;
/** 记录“已收走”的站点上限，长期游玩也不会让存档无限膨胀。 */
const MAX_TAKEN = 4000;

/** 动态宝石的钥匙带自增序号，不能当作“已收走”的依据。 */
const DYNAMIC_KEY_PREFIXES = DYNAMIC_GEM_KINDS.map((kind) => `${kind}:`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 固定宝石的站点钥匙（例如 `diamond:12:-8`）；动态宝石返回 false。 */
export function isStaticGemKey(key: string): boolean {
  return !DYNAMIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * 背包：目前只装收集到的宝石，其他物品可以按同样的方式加字段。
 *
 * 纯数据结构，不依赖 three.js 与 DOM，方便单元测试；渲染与存档由上层接。
 */
export class Inventory {
  private readonly counts = new Map<GemKind, number>();
  private readonly taken = new Set<string>();

  /** 收进一颗宝石，返回该品类的累计数量。 */
  add(kind: GemKind, key?: string): number {
    const next = Math.min(this.count(kind) + 1, MAX_PER_KIND);
    this.counts.set(kind, next);
    // 红 / 紫 / 荧光石会不断重新出现，只记数量，不记站点。
    if (key && isStaticGemKey(key) && this.taken.size < MAX_TAKEN) this.taken.add(key);
    return next;
  }

  count(kind: GemKind): number {
    return this.counts.get(kind) ?? 0;
  }

  /** 是否至少有 `amount` 颗该品类宝石。 */
  has(kind: GemKind, amount = 1): boolean {
    if (amount <= 0) return true;
    return this.count(kind) >= amount;
  }

  /**
   * 消耗指定数量的宝石（合成用），返回是否真的扣掉了。
   * 数量不足时不做任何改动，避免把背包扣成负数。
   */
  spend(kind: GemKind, amount = 1): boolean {
    if (amount <= 0) return true;
    const current = this.count(kind);
    if (current < amount) return false;

    const next = current - amount;
    if (next > 0) this.counts.set(kind, next);
    else this.counts.delete(kind);
    return true;
  }

  get total(): number {
    let sum = 0;
    for (const count of this.counts.values()) sum += count;
    return sum;
  }

  /** 该固定宝石站点是否已经被收走（是的话不再生成）。 */
  isTaken(key: string): boolean {
    return this.taken.has(key);
  }

  get takenKeys(): string[] {
    return [...this.taken];
  }

  /** 按 `GEM_KINDS` 的固定顺序返回每种宝石的数量，UI 直接照这个顺序排。 */
  entries(): Array<{ kind: GemKind; count: number }> {
    return GEM_KINDS.map((kind) => ({ kind, count: this.count(kind) }));
  }

  toSave(): InventoryData | undefined {
    const gems: GemCounts = {};
    for (const kind of GEM_KINDS) {
      const count = this.count(kind);
      if (count > 0) gems[kind] = count;
    }

    const data: InventoryData = {};
    if (Object.keys(gems).length > 0) data.gems = gems;
    if (this.taken.size > 0) data.taken = [...this.taken];
    return data.gems || data.taken ? data : undefined;
  }

  /** 从存档恢复；字段非法时按“忽略这一项”处理，不会把背包读成 NaN。 */
  fromSave(value: unknown): void {
    this.reset();
    if (!isRecord(value)) return;

    if (isRecord(value.gems)) {
      for (const kind of GEM_KINDS) {
        const count = value.gems[kind];
        if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
        this.counts.set(kind, Math.min(Math.floor(count), MAX_PER_KIND));
      }
    }

    if (Array.isArray(value.taken)) {
      for (const key of value.taken) {
        if (typeof key !== 'string' || key.length === 0) continue;
        if (!isStaticGemKey(key)) continue;
        if (this.taken.size >= MAX_TAKEN) break;
        this.taken.add(key);
      }
    }
  }

  reset(): void {
    this.counts.clear();
    this.taken.clear();
  }
}
