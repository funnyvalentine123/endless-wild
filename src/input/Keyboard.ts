import type { InputAction } from './types';

/** 键盘状态 + F/T/V/M 与 -/= 快捷键。鼠标与触摸通过虚拟按键复用同一套状态。 */
export class Keyboard {
  private readonly keys = new Set<string>();
  private active = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;

    this.keys.add(event.code);

    if (event.code === 'KeyF') this.onAction('toggle-auto');
    if (event.code === 'KeyT') this.onAction('toggle-time');
    if (event.code === 'KeyV') this.onAction('toggle-view');
    if (event.code === 'KeyM') this.onAction('toggle-map');
    if (event.code === 'KeyN') this.onAction('toggle-sky-view');
    if (event.code === 'KeyP') this.onAction('toggle-save');
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') this.onAction('speed-down');
    if (event.code === 'Equal' || event.code === 'NumpadAdd') this.onAction('speed-up');
    if (event.code === 'Escape') this.onAction('close-map');
    if (event.code === 'Space' && this.active) event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.keys.clear();
  };

  constructor(private readonly onAction: (action: InputAction) => void) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  isDown(...codes: readonly string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  /** 触摸跳跃按钮使用虚拟 Space，避免再维护一套跳跃状态。 */
  pressVirtual(code: string): void {
    this.keys.add(code);
  }

  releaseVirtual(code: string): void {
    this.keys.delete(code);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.keys.clear();
  }
}
