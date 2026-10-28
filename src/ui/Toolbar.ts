import { requireElement } from '../core/dom';

export interface ToolbarHandlers {
  onToggleAuto: () => void;
  onToggleTime: () => void;
  onToggleView: () => void;
  onTeleportDesert: () => void;
  onTeleportOasis: () => void;
  onNewWorld: () => void;
}

/** #bar 左右各留 12px 边距，与 CSS 的 max-width 保持一致。 */
const BAR_MARGIN = 24;
const HIDDEN_CLASS = 'bar-hidden';

/**
 * 底部操作栏，按钮状态统一由 aria-pressed 表示。
 * 单行放不下时从最右侧开始逐项收进“更多”，保证永远不会换行或超出屏幕；
 * 点击“更多”把同一条栏展开成全屏半透明操作面板，控件与事件都不需要重建。
 */
export class Toolbar {
  private readonly bar = requireElement('bar');
  private readonly autoButton = requireElement<HTMLButtonElement>('bAuto');
  private readonly timeButton = requireElement<HTMLButtonElement>('bTime');
  private readonly viewButton = requireElement<HTMLButtonElement>('bView');
  private readonly desertButton = requireElement<HTMLButtonElement>('bDesert');
  private readonly oasisButton = requireElement<HTMLButtonElement>('bOasis');
  private readonly newButton = requireElement<HTMLButtonElement>('bNew');
  private readonly moreButton = requireElement<HTMLButtonElement>('barMore');
  private readonly items: HTMLElement[];

  private layoutFrame = 0;

  private readonly handleAuto = (): void => this.handlers.onToggleAuto();
  private readonly handleTime = (): void => this.handlers.onToggleTime();
  private readonly handleView = (): void => this.handlers.onToggleView();
  private readonly handleDesert = (): void => this.handlers.onTeleportDesert();
  private readonly handleOasis = (): void => this.handlers.onTeleportOasis();
  private readonly handleNew = (): void => this.handlers.onNewWorld();
  private readonly handleMore = (): void => this.setOpen(!this.bar.classList.contains('open'));
  private readonly handleBarClick = (event: MouseEvent): void => {
    if (event.target === this.bar) this.setOpen(false);
  };
  private readonly handleResize = (): void => {
    if (this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.updateLayout();
    });
  };

  constructor(private readonly handlers: ToolbarHandlers) {
    this.items = Array.from(this.bar.children).filter(
      (child): child is HTMLElement => child !== this.moreButton,
    );

    this.autoButton.addEventListener('click', this.handleAuto);
    this.timeButton.addEventListener('click', this.handleTime);
    this.viewButton.addEventListener('click', this.handleView);
    this.desertButton.addEventListener('click', this.handleDesert);
    this.oasisButton.addEventListener('click', this.handleOasis);
    this.newButton.addEventListener('click', this.handleNew);
    this.moreButton.addEventListener('click', this.handleMore);
    this.bar.addEventListener('click', this.handleBarClick);
    window.addEventListener('resize', this.handleResize);
    this.setAuto(false);
    this.setTime(false);
    this.setView(false);
    this.updateLayout();
  }

  setAuto(enabled: boolean): void {
    this.autoButton.setAttribute('aria-pressed', String(enabled));
  }

  setTime(enabled: boolean): void {
    this.timeButton.setAttribute('aria-pressed', String(enabled));
  }

  setView(thirdPerson: boolean): void {
    this.viewButton.setAttribute('aria-pressed', String(thirdPerson));
  }

  dispose(): void {
    this.autoButton.removeEventListener('click', this.handleAuto);
    this.timeButton.removeEventListener('click', this.handleTime);
    this.viewButton.removeEventListener('click', this.handleView);
    this.desertButton.removeEventListener('click', this.handleDesert);
    this.oasisButton.removeEventListener('click', this.handleOasis);
    this.newButton.removeEventListener('click', this.handleNew);
    this.moreButton.removeEventListener('click', this.handleMore);
    this.bar.removeEventListener('click', this.handleBarClick);
    window.removeEventListener('resize', this.handleResize);
    if (this.layoutFrame) cancelAnimationFrame(this.layoutFrame);
    this.setOpen(false);
    this.bar.classList.remove('has-more');
    for (const item of this.items) item.classList.remove(HIDDEN_CLASS);
  }

  private setOpen(open: boolean): void {
    this.bar.classList.toggle('open', open);
    this.moreButton.textContent = open ? '收起' : '更多';
    this.moreButton.setAttribute('aria-expanded', String(open));
  }

  /**
   * 先按完整单行测量；放不下时显示“更多”，再从右往左逐项隐藏直到宽度足够。
   * 展开状态下测量会临时移除 open 类，读写都在同一任务内完成，不会闪烁。
   */
  private updateLayout(): void {
    const wasOpen = this.bar.classList.contains('open');

    this.bar.classList.remove('open', 'has-more');
    for (const item of this.items) item.classList.remove(HIDDEN_CLASS);

    const available = window.innerWidth - BAR_MARGIN;
    if (this.bar.scrollWidth > available) {
      this.bar.classList.add('has-more');
      for (
        let index = this.items.length - 1;
        index >= 0 && this.bar.scrollWidth > available;
        index -= 1
      ) {
        this.items[index].classList.add(HIDDEN_CLASS);
      }
    }

    this.setOpen(wasOpen && this.bar.classList.contains('has-more'));
  }
}
