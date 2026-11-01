import { GEM_DEFINITIONS, type GemKind } from '../config/gems';
import { requireElement } from '../core/dom';
import { createGem } from './gemIcon';

export interface InventoryEntry {
  kind: GemKind;
  count: number;
}

export interface InventoryPanelModel {
  /** 按固定顺序的八种宝石；数量为 0 的不展示。 */
  entries: InventoryEntry[];
  total: number;
}

export interface InventoryPanelActions {
  model(): InventoryPanelModel;
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

  /** 上一次渲染的签名：数量没变就不重建节点。 */
  private rendered = '';

  private readonly handleClose = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };

  constructor(
    private readonly actions: InventoryPanelActions,
    private readonly handlers: { onCloseRequest: () => void },
  ) {
    this.overlay.hidden = true;
    this.list.style.setProperty('--bag-columns', String(SLOT_COLUMNS));
    this.closeButton.addEventListener('click', this.handleClose);
    this.overlay.addEventListener('click', this.handleBackdrop);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
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
}
