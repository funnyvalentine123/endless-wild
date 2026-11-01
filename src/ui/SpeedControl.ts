import { requireElement } from '../core/dom';

export interface SpeedControlHandlers {
  /** 按预设档位加速（1）或减速（-1）。 */
  onStep: (direction: -1 | 1) => void;
  /** 滑杆连续调节后的倍率。 */
  onSet: (scale: number) => void;
}

/** 底部栏的速度控制：减档 / 滑杆 / 加档 + 倍率读数。滑杆使用百分比整数，避免浮点步进误差。 */
export class SpeedControl {
  private readonly downButton = requireElement<HTMLButtonElement>('speedDown');
  private readonly upButton = requireElement<HTMLButtonElement>('speedUp');
  private readonly range = requireElement<HTMLInputElement>('speedRange');
  private readonly value = requireElement('speedValue');
  private readonly group = this.range.closest('.speed');

  private readonly handleDown = (): void => this.handlers.onStep(-1);
  private readonly handleUp = (): void => this.handlers.onStep(1);
  private readonly handleInput = (): void =>
    this.handlers.onSet(Number(this.range.value) / 100);

  constructor(private readonly handlers: SpeedControlHandlers) {
    this.downButton.addEventListener('click', this.handleDown);
    this.upButton.addEventListener('click', this.handleUp);
    this.range.addEventListener('input', this.handleInput);
  }

  /** 同步滑杆与读数，倍率变化后由 Game 调用。 */
  setValue(scale: number): void {
    this.range.value = String(Math.round(scale * 100));
    this.value.textContent = `×${scale.toFixed(2)}`;
  }

  /**
   * 按已解锁的速度档位设置可用区间。没有解锁任何档位时整组控件禁用，
   * 只显示基础的 ×1.00，提示玩家去合成台解锁。
   */
  setLimits(min: number, max: number, locked: boolean): void {
    this.range.min = String(Math.round(min * 100));
    this.range.max = String(Math.round(max * 100));

    this.range.disabled = locked;
    this.downButton.disabled = locked;
    this.upButton.disabled = locked;
    this.group?.classList.toggle('is-locked', locked);

    const hint = locked ? '还没解锁速度档位：到合成台 (C) 合成「速度 · 1 档」' : '';
    this.range.title = hint;
    this.downButton.title = hint;
    this.upButton.title = hint;
  }

  dispose(): void {
    this.downButton.removeEventListener('click', this.handleDown);
    this.upButton.removeEventListener('click', this.handleUp);
    this.range.removeEventListener('input', this.handleInput);
  }
}
