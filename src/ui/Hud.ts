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

interface HudElements {
  biome: HTMLElement;
  distance: HTMLElement;
  altitude: HTMLElement;
  clock: HTMLElement;
  seed: HTMLElement;
  compass: HTMLElement;
}

/** 左上角信息面板与右上角罗盘文字。内部按固定频率节流。 */
export class Hud {
  private readonly elements: HudElements;
  private timer = 0;

  constructor(
    private readonly world: World,
    seed: number,
  ) {
    this.elements = {
      biome: requireElement('biome'),
      distance: requireElement('dist'),
      altitude: requireElement('alt'),
      clock: requireElement('clock'),
      seed: requireElement('seed'),
      compass: requireElement('compass'),
    };
    this.elements.seed.textContent = String(seed);
  }

  update(dt: number, state: PlayerState, hour: number): void {
    this.timer += dt;
    if (this.timer < HUD_UPDATE_INTERVAL) return;
    this.timer = 0;
    this.render(state, hour);
  }

  forceUpdate(state: PlayerState, hour: number): void {
    this.timer = 0;
    this.render(state, hour);
  }

  private render(state: PlayerState, hour: number): void {
    this.elements.biome.textContent = this.world.biomeAt(state.x, state.z);
    this.elements.distance.textContent = formatDistance(state.walked);
    this.elements.altitude.textContent = formatAltitude(state.y);
    this.elements.clock.textContent = formatClock(hour);
    this.elements.compass.textContent = formatCompass(state.yaw);
  }
}
