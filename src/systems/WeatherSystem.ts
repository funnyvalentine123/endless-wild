import {
  DESERT,
  DESERT_WEATHER_FADE_END,
  DESERT_WEATHER_FADE_START,
} from '../config/desert';
import {
  WEATHER_FADE_SECONDS,
  WEATHER_HOLD_HOURS,
  WEATHER_INITIAL_CLEAR_HOURS,
  WEATHER_LEVEL_VALUE,
  type WeatherKind,
  type WeatherLevel,
  type WeatherSnapshot,
} from '../config/weather';
import { clamp, smoothstep } from '../math/scalar';

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/**
 * 天气状态机：只负责“现在是什么天气、强度多少”，
 * 不接触 Three.js 对象，方便单测和调试。
 *
 * 自动模式下晴天与雨/雪交替，各持续半天；手动切换会关闭自动调度。
 */
export class WeatherSystem {
  private kindValue: WeatherKind = 'clear';
  private levelValue: WeatherLevel = 'medium';
  private autoValue = true;
  private isWeather = false;
  private remainingHours = WEATHER_INITIAL_CLEAR_HOURS;

  private rainValue = 0;
  private snowValue = 0;
  private windXValue = 0.8;
  private windZValue = 0;
  private desertFactorValue = 0;

  private readonly state: WeatherSnapshot = {
    kind: 'clear',
    level: 'medium',
    auto: true,
    rain: 0,
    snow: 0,
    precipitation: 0,
    windX: 0.8,
    windZ: 0,
  };

  constructor(private readonly random: () => number = Math.random) {}

  get kind(): WeatherKind {
    return this.kindValue;
  }

  get level(): WeatherLevel {
    return this.levelValue;
  }

  get auto(): boolean {
    return this.autoValue;
  }

  get snapshot(): WeatherSnapshot {
    return this.state;
  }

  /** 玩家当前所在位置的沙漠因子（0–1），由 Game 每帧写入。 */
  setDesertFactor(factor: number): void {
    this.desertFactorValue = clamp(factor, 0, 1);
  }

  /** hoursPerSecond 与昼夜系统一致，保证“半天”按游戏内时间计算。 */
  update(dt: number, hoursPerSecond: number): void {
    if (this.autoValue) {
      this.remainingHours -= dt * hoursPerSecond;
      if (this.remainingHours <= 0) this.advanceAuto();
    }

    // 沙漠核心强制晴天：进入后不会再触发雨雪。
    if (this.desertFactorValue >= DESERT.weatherBlock && this.kindValue !== 'clear') {
      this.isWeather = false;
      this.applyTarget('clear', this.levelValue);
      if (this.autoValue) this.remainingHours = WEATHER_HOLD_HOURS;
    }

    // 过渡带里雨雪强度随沙漠因子平滑衰减到 0，不会出现雨雪接触沙地。
    const suppression =
      1 -
      smoothstep(
        DESERT_WEATHER_FADE_START,
        DESERT_WEATHER_FADE_END,
        this.desertFactorValue,
      );
    const fade = dt / WEATHER_FADE_SECONDS;
    const rainTarget =
      (this.kindValue === 'rain' ? WEATHER_LEVEL_VALUE[this.levelValue] : 0) * suppression;
    const snowTarget =
      (this.kindValue === 'snow' ? WEATHER_LEVEL_VALUE[this.levelValue] : 0) * suppression;
    this.rainValue = moveTowards(this.rainValue, rainTarget, fade);
    this.snowValue = moveTowards(this.snowValue, snowTarget, fade);

    this.publish();
  }

  /** 手动选择天气：关闭自动调度，立即开始平滑过渡。沙漠中不可用。 */
  setManual(kind: WeatherKind, level: WeatherLevel): void {
    if (this.desertFactorValue >= DESERT.weatherBlock) return;

    this.autoValue = false;
    this.isWeather = kind !== 'clear';
    this.remainingHours = WEATHER_HOLD_HOURS;
    this.applyTarget(kind, level);
    this.publish();
  }

  /** 打开自动调度后从当前状态继续，半天后再切换。 */
  setAuto(enabled: boolean): void {
    this.autoValue = enabled;
    if (enabled) {
      this.isWeather = this.kindValue !== 'clear';
      this.remainingHours = WEATHER_HOLD_HOURS;
    }
    this.publish();
  }

  private advanceAuto(): void {
    // 沙漠里自动调度只会安排晴天。
    if (this.desertFactorValue >= DESERT.weatherBlock) {
      this.isWeather = false;
      this.applyTarget('clear', this.levelValue);
      this.remainingHours = WEATHER_HOLD_HOURS;
      return;
    }

    if (this.isWeather) {
      this.isWeather = false;
      this.applyTarget('clear', this.levelValue);
    } else {
      const kind: WeatherKind = this.random() < 0.5 ? 'rain' : 'snow';
      const roll = this.random();
      const level: WeatherLevel = roll < 0.4 ? 'light' : roll < 0.75 ? 'medium' : 'heavy';
      this.isWeather = true;
      this.applyTarget(kind, level);
    }
    this.remainingHours = WEATHER_HOLD_HOURS;
  }

  private applyTarget(kind: WeatherKind, level: WeatherLevel): void {
    this.kindValue = kind;
    this.levelValue = level;

    if (kind === 'rain') {
      const strength = WEATHER_LEVEL_VALUE[level];
      this.windXValue = 3.5 + strength * 2;
      this.windZValue = -0.8;
    } else if (kind === 'snow') {
      const strength = WEATHER_LEVEL_VALUE[level];
      this.windXValue = 1.2 + strength * 1.4;
      this.windZValue = 0.5;
    } else {
      this.windXValue = 0.8;
      this.windZValue = 0;
    }
  }

  private publish(): void {
    const state = this.state;
    state.kind = this.kindValue;
    state.level = this.levelValue;
    state.auto = this.autoValue;
    state.rain = this.rainValue;
    state.snow = this.snowValue;
    state.precipitation = Math.max(this.rainValue, this.snowValue);
    state.windX = this.windXValue;
    state.windZ = this.windZValue;
  }
}
