import { Color, Vector3 } from 'three';
import {
  FAST_TIME_SCALE,
  HOURS_PER_DAY,
  INITIAL_HOUR,
  NORMAL_TIME_SCALE,
} from '../config/daynight';
import { lerp, smoothstep } from '../math/scalar';
import { SKY_PALETTE, type DaylightSnapshot } from '../render/environment/Daylight';

/**
 * 只维护“现在几点”和由此推导出的光照快照；
 * 具体的天空、太阳、星星、路灯由 SceneEnvironment 应用。
 */
export class DayNightCycle {
  private hourValue = INITIAL_HOUR;

  private readonly state: DaylightSnapshot = {
    sunDirection: new Vector3(0, 1, 0),
    skyTop: new Color(),
    skyBottom: new Color(),
    fogColor: new Color(),
    sunColor: new Color(),
    skySunColor: new Color(),
    sunIntensity: 0,
    hemiColor: new Color(),
    hemiIntensity: 0,
    starOpacity: 0,
    lampIntensity: 0,
    cloudEmissive: new Color(),
    waterBrightness: 1,
    daylightFactor: 1,
    duskFactor: 0,
  };

  get hour(): number {
    return this.hourValue;
  }

  /** 调试 / 截图用：直接跳到一个时刻。 */
  setHour(hour: number): void {
    this.hourValue = ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  }

  update(dt: number, fast: boolean): void {
    this.hourValue =
      (this.hourValue + dt * (fast ? FAST_TIME_SCALE : NORMAL_TIME_SCALE)) % HOURS_PER_DAY;
  }

  get snapshot(): DaylightSnapshot {
    const state = this.state;
    const angle = ((this.hourValue - 6) / HOURS_PER_DAY) * Math.PI * 2;
    const elevation = Math.sin(angle);

    state.sunDirection.set(Math.cos(angle) * 0.85, elevation, -0.4).normalize();

    const daylight = smoothstep(-0.12, 0.25, elevation);
    const dusk =
      smoothstep(0.42, 0.02, Math.abs(elevation)) * smoothstep(-0.3, 0.02, elevation);
    const night = elevation < -0.05;

    state.skyTop.copy(SKY_PALETTE.nightTop).lerp(SKY_PALETTE.dayTop, daylight);
    state.fogColor
      .copy(SKY_PALETTE.nightBottom)
      .lerp(SKY_PALETTE.dayBottom, daylight)
      .lerp(SKY_PALETTE.dusk, dusk * 0.75);
    state.skyBottom.copy(state.fogColor);

    if (night) state.sunDirection.negate();

    const bodyColor = night ? SKY_PALETTE.moon : SKY_PALETTE.sunDay;
    state.sunColor.copy(bodyColor).lerp(SKY_PALETTE.sunDusk, night ? 0 : dusk);
    state.skySunColor
      .copy(bodyColor)
      .multiplyScalar(night ? 0.6 : 1)
      .lerp(SKY_PALETTE.sunDusk, night ? 0 : dusk);

    state.sunIntensity = night
      ? 0.35 * smoothstep(-0.05, -0.3, elevation)
      : 2.3 * smoothstep(-0.05, 0.2, elevation);

    state.hemiColor.copy(SKY_PALETTE.hemiNight).lerp(SKY_PALETTE.hemiDay, daylight);
    state.hemiIntensity = lerp(0.35, 0.95, daylight);

    state.starOpacity = 1 - smoothstep(-0.25, 0.05, elevation);
    state.lampIntensity = (1 - daylight) * 3;

    state.cloudEmissive
      .copy(SKY_PALETTE.white)
      .lerp(SKY_PALETTE.dusk, dusk * 0.7)
      .multiplyScalar(lerp(0.12, 0.6, daylight));

    state.waterBrightness = lerp(0.35, 1, daylight);
    state.daylightFactor = daylight;
    state.duskFactor = dusk;

    return state;
  }
}
