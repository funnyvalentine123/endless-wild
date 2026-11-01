import { requireElement } from '../core/dom';
import type { WeatherKind, WeatherLevel, WeatherSnapshot } from '../config/weather';

export interface WeatherControlHandlers {
  onAutoChange: (enabled: boolean) => void;
  onManualChange: (kind: WeatherKind, level: WeatherLevel) => void;
}

/** 底部栏天气控制：自动开关 + 天气类型 + 强度。手动选择会自动关闭自动调度。 */
export class WeatherControl {
  private readonly autoBox = requireElement<HTMLInputElement>('weatherAuto');
  private readonly kindSelect = requireElement<HTMLSelectElement>('weatherKind');
  private readonly levelSelect = requireElement<HTMLSelectElement>('weatherLevel');
  private readonly group = this.autoBox.closest('.weather');
  /** 沙漠核心区不允许操纵天气。 */
  private desertBlocked = false;
  /** 合成系统：还没解锁「天气控制」。 */
  private locked = false;

  private readonly handleAuto = (): void => this.handlers.onAutoChange(this.autoBox.checked);
  private readonly handleManual = (): void => {
    this.updateLevelEnabled();
    this.handlers.onManualChange(
      this.kindSelect.value as WeatherKind,
      this.levelSelect.value as WeatherLevel,
    );
  };

  constructor(private readonly handlers: WeatherControlHandlers) {
    this.autoBox.addEventListener('change', this.handleAuto);
    this.kindSelect.addEventListener('change', this.handleManual);
    this.levelSelect.addEventListener('change', this.handleManual);
  }

  setState(weather: WeatherSnapshot): void {
    this.autoBox.checked = weather.auto;
    this.kindSelect.value = weather.kind;
    this.levelSelect.value = weather.level;
    this.updateLevelEnabled();
  }

  /** 沙漠中天气操控不可用：整组控件禁用，并给出提示。 */
  setDisabled(disabled: boolean): void {
    if (disabled === this.desertBlocked) return;
    this.desertBlocked = disabled;
    this.applyBlocked();
  }

  /** 合成系统：未解锁「天气控制」时整组控件禁用。 */
  setLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    this.applyBlocked();
  }

  dispose(): void {
    this.autoBox.removeEventListener('change', this.handleAuto);
    this.kindSelect.removeEventListener('change', this.handleManual);
    this.levelSelect.removeEventListener('change', this.handleManual);
  }

  private get blocked(): boolean {
    return this.desertBlocked || this.locked;
  }

  private applyBlocked(): void {
    const blocked = this.blocked;
    const hint = this.locked
      ? '还没解锁「天气控制」：到合成台 (C) 合成后可用'
      : this.desertBlocked
        ? '沙漠中无法操纵天气'
        : '';

    this.autoBox.title = hint;
    this.kindSelect.title = hint;
    this.levelSelect.title = hint;
    this.group?.classList.toggle('is-disabled', blocked);
    this.updateLevelEnabled();
  }

  private updateLevelEnabled(): void {
    const blocked = this.blocked;
    this.autoBox.disabled = blocked;
    this.kindSelect.disabled = blocked;
    this.levelSelect.disabled = blocked || this.kindSelect.value === 'clear';
  }
}
