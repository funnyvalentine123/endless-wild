import { requireElement } from '../core/dom';

export interface ToolbarHandlers {
  onToggleAuto: () => void;
  onToggleTime: () => void;
  onToggleView: () => void;
  onNewWorld: () => void;
}

/** 底部操作栏，按钮状态统一由 aria-pressed 表示。 */
export class Toolbar {
  private readonly autoButton = requireElement<HTMLButtonElement>('bAuto');
  private readonly timeButton = requireElement<HTMLButtonElement>('bTime');
  private readonly viewButton = requireElement<HTMLButtonElement>('bView');
  private readonly newButton = requireElement<HTMLButtonElement>('bNew');

  private readonly handleAuto = (): void => this.handlers.onToggleAuto();
  private readonly handleTime = (): void => this.handlers.onToggleTime();
  private readonly handleView = (): void => this.handlers.onToggleView();
  private readonly handleNew = (): void => this.handlers.onNewWorld();

  constructor(private readonly handlers: ToolbarHandlers) {
    this.autoButton.addEventListener('click', this.handleAuto);
    this.timeButton.addEventListener('click', this.handleTime);
    this.viewButton.addEventListener('click', this.handleView);
    this.newButton.addEventListener('click', this.handleNew);
    this.setAuto(false);
    this.setTime(false);
    this.setView(false);
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
    this.newButton.removeEventListener('click', this.handleNew);
  }
}
