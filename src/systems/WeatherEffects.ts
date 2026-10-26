import {
  WEATHER_LEVEL_VALUE,
  WEATHER_SNOW_COVER,
  WEATHER_SNOW_MELT_PER_HOUR,
  WEATHER_SNOW_PER_HOUR,
  WEATHER_WATER_RECEDE_PER_HOUR,
  WEATHER_WATER_RISE_MAX,
  WEATHER_WATER_RISE_PER_HOUR,
  type WeatherSnapshot,
} from '../config/weather';

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/**
 * 雨雪留下的持续影响：积水抬升水位、积雪覆盖地表。
 * 水位与融雪都按游戏小时推进，这样快进时间时表现也一致：
 * - 水位上涨有上限，晴天以更慢的速度退回；
 * - 雪停后最多 2 个游戏小时完全融化。
 */
export class WeatherEffects {
  private waterOffsetValue = 0;
  private snowCoverageValue = 0;

  get waterLevelOffset(): number {
    return this.waterOffsetValue;
  }

  get snowCoverage(): number {
    return this.snowCoverageValue;
  }

  update(dt: number, weather: WeatherSnapshot, hoursPerSecond: number): void {
    const hours = dt * hoursPerSecond;
    const strength = WEATHER_LEVEL_VALUE[weather.level];

    const waterTarget = weather.kind === 'rain' ? strength * WEATHER_WATER_RISE_MAX : 0;
    const waterRate =
      waterTarget > this.waterOffsetValue
        ? WEATHER_WATER_RISE_PER_HOUR
        : WEATHER_WATER_RECEDE_PER_HOUR;
    this.waterOffsetValue = moveTowards(
      this.waterOffsetValue,
      waterTarget,
      hours * waterRate,
    );

    const snowTarget = weather.kind === 'snow' ? WEATHER_SNOW_COVER[weather.level] : 0;
    const snowRate =
      snowTarget > this.snowCoverageValue
        ? WEATHER_SNOW_PER_HOUR
        : WEATHER_SNOW_MELT_PER_HOUR;
    this.snowCoverageValue = moveTowards(
      this.snowCoverageValue,
      snowTarget,
      hours * snowRate,
    );
  }
}
