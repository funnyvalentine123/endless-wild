import { HUD_UPDATE_INTERVAL } from '../config/ui';
import { requireElement } from '../core/dom';
import type { PlayerState } from '../player/Player';
import type { World } from '../world/World';
import {
  formatAltitude,
  formatClock,
  formatCompass,
  formatDistance,
} from './format';
import { FpsMeter } from './fps';

interface HudElements {
  biome: HTMLElement;
  distance: HTMLElement;
  altitude: HTMLElement;
  clock: HTMLElement;
  weather: HTMLElement;
  gemCount: HTMLElement;
  seed: HTMLElement;
  compass: HTMLElement;
  fps: HTMLElement;
  toast: HTMLElement;
}

/** 左上角信息面板与右上角罗盘文字。内部按固定频率节流。 */
export class Hud {
  private readonly elements: HudElements;
  private readonly fpsMeter = new FpsMeter();
  private timer = 0;
  private toastTimer = 0;

  constructor(
    private readonly world: World,
    seed: number,
  ) {
    this.elements = {
      biome: requireElement('biome'),
      distance: requireElement('dist'),
      altitude: requireElement('alt'),
      clock: requireElement('clock'),
      weather: requireElement('weatherNow'),
      gemCount: requireElement('gemCount'),
      seed: requireElement('seed'),
      compass: requireElement('compass'),
      fps: requireElement('fps'),
      toast: requireElement('toast'),
    };
    this.elements.seed.textContent = String(seed);
  }

  /** 最近一次统计出的实时帧率，供调试接口读取。 */
  get fps(): number {
    return this.fpsMeter.value;
  }

  /** 背包里的宝石总数，收进一颗或载入存档后调用。 */
  setGemCount(total: number): void {
    this.elements.gemCount.textContent = String(total);
  }

  /** 收集提示：短暂浮现后自动淡出，连续收宝石时只重置同一条提示。 */
  announce(text: string): void {
    const toast = this.elements.toast;
    toast.textContent = text;
    toast.dataset.visible = 'true';
    if (this.toastTimer !== 0) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = 0;
      toast.dataset.visible = 'false';
    }, 1800);
  }

  update(dt: number, state: PlayerState, hour: number, weather: string): void {
    this.renderFps(this.fpsMeter.sample());

    this.timer += dt;
    if (this.timer < HUD_UPDATE_INTERVAL) return;
    this.timer = 0;
    this.render(state, hour, weather);
  }

  forceUpdate(state: PlayerState, hour: number, weather: string): void {
    this.timer = 0;
    this.render(state, hour, weather);
  }

  private renderFps(fps: number | null): void {
    if (fps === null) return;

    const rounded = Math.round(fps);
    this.elements.fps.textContent = String(rounded);
    // 低于 50 / 30 帧时用颜色提示，方便判断掉帧程度。
    this.elements.fps.dataset.level = rounded >= 50 ? 'good' : rounded >= 30 ? 'warn' : 'bad';
  }

  private render(state: PlayerState, hour: number, weather: string): void {
    this.elements.biome.textContent = this.world.biomeAt(state.x, state.z);
    this.elements.distance.textContent = formatDistance(state.walked);
    this.elements.altitude.textContent = formatAltitude(state.y);
    this.elements.clock.textContent = formatClock(hour);
    this.elements.weather.textContent = weather;
    this.elements.compass.textContent = formatCompass(state.yaw);
  }
}
