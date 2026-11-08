import { GEM_DEFINITIONS, type GemKind } from '../config/gems';
import { GEM_SYNTHESIS_RECIPES } from '../config/gemSynthesis';
import { requireElement } from '../core/dom';
import { createGem } from './gemIcon';

export interface InventoryEntry {
  kind: GemKind;
  count: number;
}

export interface InventoryPanelModel {
  /** 按固定顺序的全部宝石；数量为 0 的不展示。 */
  entries: InventoryEntry[];
  total: number;
}

export interface InventoryPanelActions {
  model(): InventoryPanelModel;
  /** 合成一条宝石配方；返回结果后由面板刷新数量与按钮状态。 */
  synthesize(recipeId: string): { ok: boolean; message: string };
}

/** 背包固定 4 行 6 列的空格子：有宝石的优先占前几格，其余始终保留空格子。 */
const SLOT_COLUMNS = 6;
const SLOT_ROWS = 4;
const SLOT_COUNT = SLOT_COLUMNS * SLOT_ROWS;

/**
 * 背包面板：固定格子的收纳格，每格显示宝石的形状与堆叠数量。
 * 打开时不暂停游戏，关闭后由 Game 交还鼠标锁定。
 */
export class InventoryPanel {
  private readonly overlay = requireElement<HTMLElement>('bagPanel');
  private readonly closeButton = requireElement<HTMLButtonElement>('bagClose');
  private readonly list = requireElement<HTMLElement>('bagList');
  private readonly empty = requireElement<HTMLElement>('bagEmpty');
  private readonly totalText = requireElement<HTMLElement>('bagTotal');
  private readonly refineList = requireElement<HTMLElement>('bagRefineList');
  private readonly refineStatus = requireElement<HTMLElement>('bagRefineStatus');

  /** 上一次渲染的签名：数量没变就不重建节点。 */
  private rendered = '';

  private readonly handleClose = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };
  private readonly handleRefineClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.refine-button');
    const id = button?.dataset.recipe;
    if (!button || button.disabled || !id) return;

    const result = this.actions.synthesize(id);
    this.setRefineStatus(result.message, result.ok);
    this.refresh();
  };

  constructor(
    private readonly actions: InventoryPanelActions,
    private readonly handlers: { onCloseRequest: () => void },
  ) {
    this.overlay.hidden = true;
    this.list.style.setProperty('--bag-columns', String(SLOT_COLUMNS));
    this.closeButton.addEventListener('click', this.handleClose);
    this.overlay.addEventListener('click', this.handleBackdrop);
    this.refineList.addEventListener('click', this.handleRefineClick);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
    this.setRefineStatus('', true);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.refresh();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  /** 收进宝石或载入存档后刷新；内容没变时直接跳过重建。 */
  refresh(): void {
    const model = this.actions.model();
    const rows = model.entries.filter((entry) => entry.count > 0);
    this.totalText.textContent = String(model.total);

    // 合成配方依赖实时数量，先渲染它；收纳格仍用签名短路避免重建。
    this.renderRefine(new Map(model.entries.map((entry) => [entry.kind, entry.count] as const)));

    const signature = rows.map((entry) => `${entry.kind}:${entry.count}`).join('|');
    if (signature === this.rendered) return;
    this.rendered = signature;

    this.empty.hidden = rows.length > 0;
    // 空格子也要画出来，所以列表永远整格铺满。
    const slots: HTMLElement[] = [];
    for (let index = 0; index < SLOT_COUNT; index++) {
      slots.push(this.slot(rows[index]));
    }
    this.list.replaceChildren(...slots);
  }

  dispose(): void {
    this.closeButton.removeEventListener('click', this.handleClose);
    this.overlay.removeEventListener('click', this.handleBackdrop);
    this.refineList.removeEventListener('click', this.handleRefineClick);
  }

  private slot(entry: InventoryEntry | undefined): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'bag-slot';

    if (!entry) {
      cell.classList.add('is-empty');
      return cell;
    }

    const definition = GEM_DEFINITIONS[entry.kind];
    // 保留 bag-item 类，调试脚本 / 外部样式仍按原有名称找得到有宝石的格子。
    cell.classList.add('is-filled', 'bag-item');
    cell.dataset.kind = entry.kind;
    cell.title = `${definition.label} ×${entry.count}`;

    const gem = createGem(entry.kind);

    const count = document.createElement('span');
    count.className = 'bag-count';
    count.textContent = String(entry.count);

    cell.append(gem, count);
    return cell;
  }

  /** 2 → 1 的宝石合成列表：数量不足时按钮禁用，成功后由 refresh 重算。 */
  private renderRefine(counts: Map<GemKind, number>): void {
    const rows = GEM_SYNTHESIS_RECIPES.map((recipe) => {
      const from = GEM_DEFINITIONS[recipe.from];
      const to = GEM_DEFINITIONS[recipe.to];
      const have = counts.get(recipe.from) ?? 0;
      const ready = have >= recipe.cost;

      const row = document.createElement('div');
      row.className = 'refine-row';
      row.dataset.recipe = recipe.id;
      row.classList.toggle('is-ready', ready);
      row.title = `${from.label}：${from.rule} → ${to.label}：${to.rule}`;

      const gems = document.createElement('span');
      gems.className = 'refine-gems';

      const cost = document.createElement('span');
      cost.className = 'refine-count';
      cost.textContent = `×${recipe.cost}`;

      const arrow = document.createElement('span');
      arrow.className = 'refine-arrow';
      arrow.textContent = '→';

      gems.append(createGem(recipe.from), cost, arrow, createGem(recipe.to));

      const meta = document.createElement('span');
      meta.className = 'refine-meta';
      meta.textContent = `${from.label} ${have}/${recipe.cost}`;
      meta.title = `产出：${to.label}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'refine-button';
      button.dataset.recipe = recipe.id;
      button.disabled = !ready;
      button.textContent = '合成';

      row.append(gems, meta, button);
      return row;
    });

    this.refineList.replaceChildren(...rows);
  }

  private setRefineStatus(message: string, ok: boolean): void {
    this.refineStatus.textContent = message;
    this.refineStatus.dataset.empty = String(message.length === 0);
    this.refineStatus.dataset.ok = String(ok);
  }
}
