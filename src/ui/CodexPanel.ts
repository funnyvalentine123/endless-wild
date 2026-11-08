import type { CodexEntry } from '../codex/GemCodex';
import { GEM_DEFINITIONS, type GemKind } from '../config/gems';
import { requireElement } from '../core/dom';
import { createGem } from './gemIcon';

export interface CodexCardModel {
  kind: GemKind;
  entry: CodexEntry | null;
}

export interface CodexPanelActions {
  model(): readonly CodexCardModel[];
}

/** 首次发现时间用本机时区显示，和存档面板里的“保存于”保持一致。 */
function formatFoundAt(at: number): string {
  const date = new Date(at);
  if (!Number.isFinite(at) || Number.isNaN(date.getTime())) return '—';

  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * 宝石图鉴面板：按固定顺序列出所有宝石，已发现的显示首次地点与累计数量，
 * 未发现的只显示剪影与出现条件。打开时不暂停游戏，关闭后由 Game 交还鼠标锁定。
 */
export class CodexPanel {
  private readonly overlay = requireElement<HTMLElement>('codexPanel');
  private readonly closeButton = requireElement<HTMLButtonElement>('codexClose');
  private readonly grid = requireElement<HTMLElement>('codexGrid');
  private readonly foundText = requireElement<HTMLElement>('codexFound');
  private readonly totalText = requireElement<HTMLElement>('codexTotal');

  /** 上一次渲染的签名：内容没变就不重建节点。 */
  private rendered = '';

  private readonly handleClose = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };

  constructor(
    private readonly actions: CodexPanelActions,
    private readonly handlers: { onCloseRequest: () => void },
  ) {
    this.overlay.hidden = true;
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

  /** 首次拾取或载入存档后刷新；内容没变时跳过重建。 */
  refresh(): void {
    const cards = this.actions.model();
    const discovered = cards.filter((card) => card.entry !== null).length;
    this.foundText.textContent = String(discovered);
    this.totalText.textContent = String(cards.length);

    const signature = cards.map((card) => `${card.kind}:${card.entry?.count ?? 0}`).join('|');
    if (signature === this.rendered) return;
    this.rendered = signature;

    this.grid.replaceChildren(...cards.map((card) => this.item(card)));
  }

  dispose(): void {
    this.closeButton.removeEventListener('click', this.handleClose);
    this.overlay.removeEventListener('click', this.handleBackdrop);
  }

  private item(card: CodexCardModel): HTMLElement {
    const definition = GEM_DEFINITIONS[card.kind];
    const item = document.createElement('article');
    item.className = 'codex-item';
    item.dataset.kind = card.kind;

    const icon = document.createElement('div');
    icon.className = 'codex-icon';
    icon.append(createGem(card.kind));

    const text = document.createElement('div');
    text.className = 'codex-text';

    const name = document.createElement('h3');
    name.className = 'codex-name';
    name.textContent = card.entry ? definition.label : '？？？';
    text.append(name);

    const rule = document.createElement('p');
    rule.className = 'codex-rule';
    rule.textContent = definition.rule;
    text.append(rule);

    const meta = document.createElement('p');
    meta.className = 'codex-meta';

    if (card.entry) {
      const entry = card.entry;
      item.classList.add('is-found');
      meta.textContent = `首次 ${formatFoundAt(entry.firstAt)} · 种子 ${entry.seed} · ${Math.round(
        entry.x,
      )} , ${Math.round(entry.z)} m · 累计 ${entry.count} 颗`;
    } else {
      item.classList.add('is-locked');
      meta.textContent = '走到它旁边收下，就会记录首次发现的时间与地点';
    }
    text.append(meta);

    item.append(icon, text);
    return item;
  }
}
