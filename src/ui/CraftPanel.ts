import { GEM_DEFINITIONS, GEM_KINDS, type GemKind } from '../config/gems';
import { CRAFT_FEATURE_ORDER, type FeatureId } from '../config/unlocks';
import { requireElement } from '../core/dom';
import type { FeatureStatus } from '../unlock/UnlockSystem';
import { createGem, gemGlowColor } from './gemIcon';

/** 标签栏上的功能卡片。 */
export interface CraftFeatureCard {
  id: FeatureId;
  label: string;
  status: FeatureStatus;
  /** 草稿里已经摆好的宝石数 / 图纸要求的宝石数。 */
  filled: number;
  total: number;
}

/** 单个槽位的展示数据。 */
export interface CraftCellView {
  /** 图纸要求这一格摆什么；null 表示该格只是形状留白。 */
  need: GemKind | null;
  /** 槽位里当前摆着的宝石；合成完成后是图纸本身。 */
  gem: GemKind | null;
  /** 在图纸里的行列，粒子特效据此判断哪些格子相邻。 */
  row: number;
  col: number;
}

export interface CraftNeedView {
  kind: GemKind;
  need: number;
  placed: number;
  /** 背包里还有多少颗可用（已扣除其它功能的预留）。 */
  have: number;
}

export interface CraftFeatureDetail {
  id: FeatureId;
  label: string;
  summary: string;
  cols: number;
  status: FeatureStatus;
  cells: CraftCellView[];
  needs: CraftNeedView[];
  /** 图纸要求的宝石总数。 */
  total: number;
  /** 已经摆好的宝石数。 */
  filled: number;
}

export interface CraftMaterial {
  kind: GemKind;
  /** 还能摆进槽位的数量（总量减去其它草稿的预留）。 */
  available: number;
  /** 背包里的总数。 */
  total: number;
}

export interface CraftActionResult {
  ok: boolean;
  message: string;
}

export interface CraftPanelActions {
  features(): CraftFeatureCard[];
  detail(id: FeatureId): CraftFeatureDetail;
  materials(): CraftMaterial[];
  place(id: FeatureId, index: number, kind: GemKind): CraftActionResult;
  remove(id: FeatureId, index: number): CraftActionResult;
  clear(id: FeatureId): CraftActionResult;
  craft(id: FeatureId): CraftActionResult;
  debugUnlock(): CraftActionResult;
}

const STATUS_TEXT: Record<FeatureStatus, string> = {
  locked: '未解锁',
  unlocked: '已启用（调试）',
  completed: '已合成',
};

/** 一次特效最多生成多少颗粒子，防止连续操作时 DOM 堆积。 */
const MAX_PARTICLES = 320;

function isGemKind(value: string | null | undefined): value is GemKind {
  return typeof value === 'string' && (GEM_KINDS as readonly string[]).includes(value);
}

/**
 * 功能合成台：标签切换不同功能的图纸、从背包拖拽宝石到槽位、
 * 摆满后按图纸形状放粒子特效，合成成功保留完成态光效。
 */
export class CraftPanel {
  private readonly overlay = requireElement<HTMLElement>('craftPanel');
  private readonly closeButton = requireElement<HTMLButtonElement>('craftClose');
  private readonly tabs = requireElement<HTMLElement>('craftTabs');
  private readonly grid = requireElement<HTMLElement>('craftGrid');
  private readonly fx = requireElement<HTMLElement>('craftFx');
  private readonly name = requireElement<HTMLElement>('craftName');
  private readonly summary = requireElement<HTMLElement>('craftSummary');
  private readonly tier = requireElement<HTMLElement>('craftTier');
  private readonly stateText = requireElement<HTMLElement>('craftState');
  private readonly needs = requireElement<HTMLElement>('craftNeeds');
  private readonly materials = requireElement<HTMLElement>('craftMaterials');
  private readonly craftButton = requireElement<HTMLButtonElement>('craftCraft');
  private readonly clearButton = requireElement<HTMLButtonElement>('craftClear');
  private readonly debugButton = requireElement<HTMLButtonElement>('craftDebug');
  private readonly statusText = requireElement<HTMLElement>('craftStatus');

  private selected: FeatureId = CRAFT_FEATURE_ORDER[0];
  private selectedGem: GemKind | null = null;
  private dragKind: GemKind | null = null;
  private currentStatus: FeatureStatus = 'locked';

  /** 上一次渲染的快照：用来判断“刚好摆满”和“刚好合成完成”。 */
  private last: { id: FeatureId; filled: number; status: FeatureStatus } | null = null;
  private fxTimer = 0;

  private readonly handleClose = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };

  private readonly handleTabsClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('.craft-tab');
    const id = button?.dataset.id;
    if (!id || !(CRAFT_FEATURE_ORDER as readonly string[]).includes(id)) return;
    if (id === this.selected) return;

    this.selected = id as FeatureId;
    // 换图纸时放下已选中的宝石，避免下一次点击槽位放错品类。
    this.selectedGem = null;
    this.setStatus('', true);
    this.refresh();
  };

  private readonly handleGridClick = (event: MouseEvent): void => {
    const cell = this.cellFromEvent(event);
    if (!cell || cell.dataset.slot !== 'true') return;
    if (this.currentStatus !== 'locked') return;

    const index = Number(cell.dataset.index);
    if (cell.dataset.filled === 'true') {
      this.applyResult(this.actions.remove(this.selected, index));
      return;
    }
    if (!this.selectedGem) {
      this.setStatus('先在下面的背包里点一颗宝石，再点这个槽位。', false);
      return;
    }
    this.applyResult(this.actions.place(this.selected, index, this.selectedGem));
  };

  private readonly handleDragStart = (event: DragEvent): void => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('.craft-chip');
    const kind = chip?.dataset.kind;
    if (!isGemKind(kind)) return;

    this.dragKind = kind;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', kind);
      event.dataTransfer.setData('application/x-wild-gem', kind);
    }
    chip?.classList.add('is-dragging');
  };

  private readonly handleDragEnd = (): void => {
    this.dragKind = null;
    for (const chip of this.materials.querySelectorAll('.craft-chip')) {
      chip.classList.remove('is-dragging');
    }
    this.clearDropTargets();
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    const cell = this.cellFromEvent(event);
    if (!cell || cell.dataset.slot !== 'true') return;
    if (this.currentStatus !== 'locked' || cell.dataset.filled === 'true') return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    cell.classList.add('is-drop-target');
  };

  private readonly handleDragLeave = (event: DragEvent): void => {
    const cell = this.cellFromEvent(event);
    cell?.classList.remove('is-drop-target');
  };

  private readonly handleDrop = (event: DragEvent): void => {
    const cell = this.cellFromEvent(event);
    this.clearDropTargets();
    if (!cell || cell.dataset.slot !== 'true') return;

    event.preventDefault();
    const kind = this.readDropKind(event);
    if (!kind) return;

    this.applyResult(this.actions.place(this.selected, Number(cell.dataset.index), kind));
  };

  private readonly handleMaterialsClick = (event: MouseEvent): void => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('.craft-chip');
    const kind = chip?.dataset.kind;
    if (!isGemKind(kind) || chip?.classList.contains('is-empty')) return;

    this.selectedGem = this.selectedGem === kind ? null : kind;
    this.renderMaterials(this.actions.materials());
    this.setStatus(
      this.selectedGem
        ? `已拿起 ${GEM_DEFINITIONS[this.selectedGem].label}：点槽位放置，或直接拖过去。`
        : '',
      true,
    );
  };

  private readonly handleCraft = (): void => {
    this.applyResult(this.actions.craft(this.selected));
  };

  private readonly handleClear = (): void => {
    this.applyResult(this.actions.clear(this.selected));
  };

  private readonly handleDebug = (): void => {
    this.applyResult(this.actions.debugUnlock());
  };

  constructor(
    private readonly actions: CraftPanelActions,
    private readonly handlers: { onCloseRequest: () => void },
  ) {
    this.overlay.hidden = true;
    this.closeButton.addEventListener('click', this.handleClose);
    this.overlay.addEventListener('click', this.handleBackdrop);
    this.tabs.addEventListener('click', this.handleTabsClick);
    this.grid.addEventListener('click', this.handleGridClick);
    this.grid.addEventListener('dragover', this.handleDragOver);
    this.grid.addEventListener('dragleave', this.handleDragLeave);
    this.grid.addEventListener('drop', this.handleDrop);
    this.materials.addEventListener('click', this.handleMaterialsClick);
    this.materials.addEventListener('dragstart', this.handleDragStart);
    this.materials.addEventListener('dragend', this.handleDragEnd);
    this.craftButton.addEventListener('click', this.handleCraft);
    this.clearButton.addEventListener('click', this.handleClear);
    this.debugButton.addEventListener('click', this.handleDebug);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
    this.last = null;
    this.setStatus('', true);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.refresh();
  }

  close(): void {
    this.overlay.hidden = true;
    this.last = null;
    this.setStatus('', true);
    this.clearFx();
  }

  /** 背包、存档、合成之后刷新；面板没打开时跳过 DOM 重建。 */
  refresh(): void {
    if (!this.isOpen) return;

    const cards = this.actions.features();
    if (!cards.some((card) => card.id === this.selected)) {
      this.selected = cards[0]?.id ?? CRAFT_FEATURE_ORDER[0];
    }

    this.renderTabs(cards);

    const detail = this.actions.detail(this.selected);
    this.renderDetail(detail);
    this.renderMaterials(this.actions.materials());
    this.updateButtons(detail);

    this.detectEffect(detail);
  }

  dispose(): void {
    this.closeButton.removeEventListener('click', this.handleClose);
    this.overlay.removeEventListener('click', this.handleBackdrop);
    this.tabs.removeEventListener('click', this.handleTabsClick);
    this.grid.removeEventListener('click', this.handleGridClick);
    this.grid.removeEventListener('dragover', this.handleDragOver);
    this.grid.removeEventListener('dragleave', this.handleDragLeave);
    this.grid.removeEventListener('drop', this.handleDrop);
    this.materials.removeEventListener('click', this.handleMaterialsClick);
    this.materials.removeEventListener('dragstart', this.handleDragStart);
    this.materials.removeEventListener('dragend', this.handleDragEnd);
    this.craftButton.removeEventListener('click', this.handleCraft);
    this.clearButton.removeEventListener('click', this.handleClear);
    this.debugButton.removeEventListener('click', this.handleDebug);
    this.clearFx();
  }

  private renderTabs(cards: CraftFeatureCard[]): void {
    const nodes = cards.map((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'craft-tab';
      button.dataset.id = card.id;
      button.dataset.status = card.status;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(card.id === this.selected));
      if (card.id === this.selected) button.classList.add('is-active');

      const label = document.createElement('span');
      label.className = 'craft-tab-label';
      label.textContent = card.label;

      const count = document.createElement('span');
      count.className = 'craft-tab-count';
      count.textContent =
        card.status === 'completed'
          ? '✓'
          : card.status === 'unlocked'
            ? '已启用'
            : `${card.filled}/${card.total}`;

      button.append(label, count);
      button.title = `第 ${index + 1} 阶 · ${STATUS_TEXT[card.status]}`;
      return button;
    });

    this.tabs.replaceChildren(...nodes);
  }

  private renderDetail(detail: CraftFeatureDetail): void {
    this.currentStatus = detail.status;

    this.name.textContent = detail.label;
    this.summary.textContent = detail.summary;

    const order = CRAFT_FEATURE_ORDER.findIndex((id) => id === detail.id);
    this.tier.textContent = `第 ${order + 1} 阶 · ${detail.total} 颗宝石`;
    this.stateText.textContent =
      detail.status === 'locked'
        ? `${STATUS_TEXT.locked} · 已摆 ${detail.filled}/${detail.total}`
        : STATUS_TEXT[detail.status];

    this.renderNeeds(detail);
    this.renderGrid(detail);
  }

  private renderNeeds(detail: CraftFeatureDetail): void {
    if (detail.needs.length === 0) {
      this.needs.replaceChildren();
      return;
    }

    const nodes = detail.needs.map((need) => {
      const item = document.createElement('li');
      item.className = 'craft-need';
      item.dataset.kind = need.kind;

      const icon = createGem(need.kind);
      icon.classList.add('craft-need-gem');

      const text = document.createElement('span');
      text.className = 'craft-need-text';
      text.textContent = `${GEM_DEFINITIONS[need.kind].label} ×${need.need}`;
      text.title =
        detail.status === 'locked' ? `已摆 ${need.placed}，背包可用 ${need.have}` : '合成完成';

      const progress = document.createElement('span');
      progress.className = 'craft-need-progress';
      progress.textContent = `${need.placed}/${need.need}`;

      item.append(icon, text, progress);
      item.classList.toggle('is-ready', detail.status !== 'locked' || need.placed === need.need);
      return item;
    });

    this.needs.replaceChildren(...nodes);
  }

  private renderGrid(detail: CraftFeatureDetail): void {
    const grid = this.grid;
    grid.style.setProperty('--craft-cols', String(detail.cols));
    grid.classList.toggle('is-completed', detail.status === 'completed');
    grid.classList.toggle('is-disabled', detail.status !== 'locked');
    grid.dataset.feature = detail.id;

    const cells = detail.cells.map((cell, index) => {
      const node = document.createElement('div');
      node.className = 'craft-cell';
      node.dataset.index = String(index);

      if (cell.need === null) {
        node.classList.add('is-void');
        node.dataset.slot = 'false';
        return node;
      }

      node.dataset.slot = 'true';
      node.dataset.need = cell.need;
      node.dataset.filled = String(cell.gem !== null);
      node.title = `${index + 1} 号槽位：${GEM_DEFINITIONS[cell.need].label}`;
      if (cell.gem) node.classList.add('is-filled', 'has-gem');
      if (cell.gem && cell.gem !== cell.need) node.classList.add('is-wrong');

      // 空格子用淡色剪影提示需要的形状；摆上后换成真正的宝石图标。
      if (!cell.gem) {
        const ghost = createGem(cell.need);
        ghost.classList.add('craft-ghost');
        node.append(ghost);
      } else {
        node.append(createGem(cell.gem));
      }

      return node;
    });

    grid.replaceChildren(...cells);
  }

  private renderMaterials(materials: CraftMaterial[]): void {
    // 选中的宝石被用完时自动放下，避免下一次点击才提示“没有库存”。
    if (this.selectedGem) {
      const entry = materials.find((material) => material.kind === this.selectedGem);
      if (!entry || entry.available <= 0) this.selectedGem = null;
    }

    const nodes = materials.map((material) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'craft-chip';
      chip.dataset.kind = material.kind;
      chip.draggable = material.available > 0;
      chip.classList.toggle('is-empty', material.available <= 0);
      chip.classList.toggle('is-selected', this.selectedGem === material.kind);
      chip.setAttribute('aria-pressed', String(this.selectedGem === material.kind));
      chip.title = `${GEM_DEFINITIONS[material.kind].label}：背包 ${material.total} 颗，可用 ${material.available} 颗`;

      const icon = createGem(material.kind);
      icon.classList.add('craft-chip-gem');

      const label = document.createElement('span');
      label.className = 'craft-chip-label';
      label.textContent = GEM_DEFINITIONS[material.kind].label.replace('宝石', '');

      const count = document.createElement('span');
      count.className = 'craft-chip-count';
      count.textContent = String(material.available);

      chip.append(icon, label, count);
      return chip;
    });

    this.materials.replaceChildren(...nodes);
    this.materials.classList.toggle('is-empty-all', materials.every((m) => m.available <= 0));
  }

  private updateButtons(detail: CraftFeatureDetail): void {
    const locked = detail.status === 'locked';
    this.craftButton.disabled = !locked;
    this.craftButton.textContent =
      detail.status === 'completed' ? '已完成' : detail.status === 'unlocked' ? '已启用' : '合成解锁';
    this.clearButton.disabled = !locked || detail.filled === 0;
  }

  /** 刚摆满 → 形状粒子；刚合成完成 → 更华丽的一轮庆祝。 */
  private detectEffect(detail: CraftFeatureDetail): void {
    const previous = this.last;
    this.last = { id: detail.id, filled: detail.filled, status: detail.status };
    if (!previous || previous.id !== detail.id) return;

    if (detail.status === 'completed' && previous.status !== 'completed') {
      this.playEffect(detail, 'craft');
    } else if (
      detail.status === 'locked' &&
      detail.total > 0 &&
      previous.filled < detail.total &&
      detail.filled === detail.total
    ) {
      this.playEffect(detail, 'charge');
    }
  }

  /**
   * 按图纸形状发射粒子：
   * 每个已填槽位向外爆开一圈，同时沿相邻槽位之间的连线补点，形成“描边”的效果。
   */
  private playEffect(detail: CraftFeatureDetail, mode: 'charge' | 'craft'): void {
    const fx = this.fx;
    const origin = fx.getBoundingClientRect();
    if (origin.width === 0 || origin.height === 0) return;

    const slots = Array.from(this.grid.querySelectorAll<HTMLElement>('.craft-cell[data-slot="true"]'));
    const points: Array<{ x: number; y: number; color: string }> = [];
    const centers = new Map<number, { x: number; y: number; color: string }>();

    for (const node of slots) {
      const index = Number(node.dataset.index);
      const cell = detail.cells[index];
      const kind = cell.gem ?? cell.need;
      if (!kind) continue;

      const rect = node.getBoundingClientRect();
      const point = {
        x: rect.left - origin.left + rect.width / 2,
        y: rect.top - origin.top + rect.height / 2,
        color: gemGlowColor(kind),
      };
      centers.set(index, point);
      points.push(point);
    }

    // 相邻槽位（含斜向）之间补点，让粒子的轨迹勾出形状轮廓。
    const step = mode === 'craft' ? 6 : 9;
    for (const [index, point] of centers) {
      const cell = detail.cells[index];
      for (const [otherIndex, other] of centers) {
        if (otherIndex <= index) continue;
        const target = detail.cells[otherIndex];
        if (Math.abs(cell.row - target.row) > 1 || Math.abs(cell.col - target.col) > 1) continue;

        const distance = Math.hypot(other.x - point.x, other.y - point.y);
        const count = Math.max(1, Math.round(distance / step));
        for (let i = 1; i < count; i++) {
          const t = i / count;
          points.push({
            x: point.x + (other.x - point.x) * t,
            y: point.y + (other.y - point.y) * t,
            color: point.color,
          });
        }
      }
    }

    this.burst(points, mode);
  }

  private burst(
    points: Array<{ x: number; y: number; color: string }>,
    mode: 'charge' | 'craft',
  ): void {
    if (points.length === 0) return;

    const max = mode === 'craft' ? MAX_PARTICLES : Math.round(MAX_PARTICLES * 0.75);
    const perPoint = mode === 'craft' ? 6 : 5;
    const spread = mode === 'craft' ? 96 : 64;
    const fragment = document.createDocumentFragment();
    let created = 0;

    for (const point of points) {
      for (let i = 0; i < perPoint; i++) {
        if (created >= max) break;
        created += 1;

        const particle = document.createElement('span');
        particle.className = 'craft-particle';
        const angle = Math.random() * Math.PI * 2;
        const distance = 12 + Math.random() * spread;
        particle.style.left = `${point.x}px`;
        particle.style.top = `${point.y}px`;
        particle.style.setProperty('--p-x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--p-y', `${Math.sin(angle) * distance}px`);
        particle.style.setProperty('--p-color', point.color);
        particle.style.setProperty('--p-size', `${4 + Math.random() * 5}px`);
        particle.style.setProperty('--p-duration', `${620 + Math.random() * 520}ms`);
        particle.style.setProperty('--p-delay', `${Math.random() * (mode === 'craft' ? 260 : 140)}ms`);
        fragment.append(particle);
      }
    }

    this.clearFxTimer();
    this.fx.replaceChildren(fragment);
    this.fx.classList.remove('is-firing');
    this.fx.classList.toggle('is-celebrating', mode === 'craft');
    // 重新开始 CSS 动画：读一次布局强制回流后再加类。
    void this.fx.offsetWidth;
    this.fx.classList.add('is-firing');

    this.grid.classList.remove('is-charged');
    void this.grid.offsetWidth;
    this.grid.classList.add('is-charged');

    this.fxTimer = window.setTimeout(() => {
      this.fxTimer = 0;
      this.fx.replaceChildren();
      this.fx.classList.remove('is-firing', 'is-celebrating');
      this.grid.classList.remove('is-charged');
    }, mode === 'craft' ? 1700 : 1300);
  }

  private clearFx(): void {
    this.clearFxTimer();
    this.fx.replaceChildren();
    this.fx.classList.remove('is-firing', 'is-celebrating');
    this.grid.classList.remove('is-charged');
  }

  private clearFxTimer(): void {
    if (this.fxTimer !== 0) {
      window.clearTimeout(this.fxTimer);
      this.fxTimer = 0;
    }
  }

  private clearDropTargets(): void {
    for (const cell of this.grid.querySelectorAll('.is-drop-target')) {
      cell.classList.remove('is-drop-target');
    }
  }

  private readDropKind(event: DragEvent): GemKind | null {
    const custom = event.dataTransfer?.getData('application/x-wild-gem') ?? '';
    if (isGemKind(custom)) return custom;

    const plain = event.dataTransfer?.getData('text/plain') ?? '';
    if (isGemKind(plain)) return plain;

    return this.dragKind;
  }

  private cellFromEvent(event: Event): HTMLElement | null {
    return (event.target as HTMLElement | null)?.closest<HTMLElement>('.craft-cell') ?? null;
  }

  private applyResult(result: CraftActionResult): void {
    this.setStatus(result.message, result.ok);
    this.refresh();
  }

  private setStatus(message: string, ok: boolean): void {
    this.statusText.textContent = message;
    this.statusText.dataset.empty = String(message.length === 0);
    this.statusText.dataset.ok = String(ok);
  }
}
