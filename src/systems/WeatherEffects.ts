import {
  WEATHER_LEVEL_VALUE,
  WEATHER_SNOW_COVER,
  WEATHER_SNOW_MELT_RATE,
  WEATHER_SNOW_RATE,
  WEATHER_WATER_RECEDE_RATE,
  WEATHER_WATER_RISE_MAX,
  WEATHER_WATER_RISE_RATE,
  type WeatherSnapshot,
} from '../config/weather';

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/**
 * 雨雪留下的持续影响：积水抬升水位、积雪覆盖地表。
 * 与天气强度解耦，按“当前目标天气”缓慢累积，晴天再缓慢消退。
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

  update(dt: number, weather: WeatherSnapshot): void {
    const strength = WEATHER_LEVEL_VALUE[weather.level];

    const waterTarget = weather.kind === 'rain' ? strength * WEATHER_WATER_RISE_MAX : 0;
    this.waterOffsetValue = moveTowards(
      this.waterOffsetValue,
      waterTarget,
      dt * (waterTarget > this.waterOffsetValue ? WEATHER_WATER_RISE_RATE : WEATHER_WATER_RECEDE_RATE),
    );

    const snowTarget = weather.kind === 'snow' ? WEATHER_SNOW_COVER[weather.level] : 0;
    this.snowCoverageValue = moveTowards(
      this.snowCoverageValue,
      snowTarget,
      dt * (snowTarget > this.snowCoverageValue ? WEATHER_SNOW_RATE : WEATHER_SNOW_MELT_RATE),
    );
  }
}
