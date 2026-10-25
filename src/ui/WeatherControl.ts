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

  dispose(): void {
    this.autoBox.removeEventListener('change', this.handleAuto);
    this.kindSelect.removeEventListener('change', this.handleManual);
    this.levelSelect.removeEventListener('change', this.handleManual);
  }

  private updateLevelEnabled(): void {
    this.levelSelect.disabled = this.kindSelect.value === 'clear';
  }
}
