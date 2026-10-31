import { requireElement } from '../core/dom';

/** 开始遮罩：加载状态、开始按钮与错误提示。 */
export class StartScreen {
  private readonly overlay: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly handleClick = (): void => this.onStart();

  constructor(private readonly onStart: () => void) {
    this.overlay = requireElement('start');
    this.loading = requireElement('loading');
    this.button = requireElement<HTMLButtonElement>('go');
    this.button.addEventListener('click', this.handleClick);
  }

  setReady(seed: number, note: string | null = null): void {
    this.loading.textContent = `世界已就绪 · 种子 ${seed}${note ? ` · ${note}` : ''}`;
  }

  setError(message: string): void {
    this.loading.textContent = message;
  }

  focus(): void {
    this.button.focus();
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  dispose(): void {
    this.button.removeEventListener('click', this.handleClick);
  }
}
