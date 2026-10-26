import { describe, expect, it } from 'vitest';
import { NORMAL_TIME_SCALE } from '../../src/config/daynight';
import {
  formatWeatherLabel,
  WEATHER_FADE_SECONDS,
  WEATHER_INITIAL_CLEAR_HOURS,
  WEATHER_LEVEL_VALUE,
  WEATHER_SNOW_COVER,
  WEATHER_SNOW_MELT_HOURS,
  WEATHER_WATER_RISE_MAX,
  type WeatherSnapshot,
} from '../../src/config/weather';
import { WeatherEffects } from '../../src/systems/WeatherEffects';
import { WeatherSystem } from '../../src/systems/WeatherSystem';

/** 把“游戏小时”换算成正常速度下的真实秒数。 */
function secondsForHours(hours: number): number {
  return hours / NORMAL_TIME_SCALE;
}

function createRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('WeatherSystem', () => {
  it('默认是自动模式的晴天', () => {
    const weather = new WeatherSystem(createRandom([0, 0]));
    expect(weather.kind).toBe('clear');
    expect(weather.auto).toBe(true);
    expect(weather.snapshot.rain).toBe(0);
    expect(weather.snapshot.snow).toBe(0);
  });

  it('开局若干小时后自动进入随机雨雪，并按半天持续', () => {
    const weather = new WeatherSystem(createRandom([0, 0]));
    weather.update(1, WEATHER_INITIAL_CLEAR_HOURS + 1);

    expect(weather.kind).toBe('rain');
    expect(weather.level).toBe('light');
    expect(weather.snapshot.rain).toBeGreaterThan(0);

    // 过渡完成后应达到该档位的目标强度。
    weather.update(WEATHER_FADE_SECONDS, 0);
    expect(weather.snapshot.rain).toBeCloseTo(WEATHER_LEVEL_VALUE.light);
  });

  it('晴天与雨雪按半天交替', () => {
    const weather = new WeatherSystem(createRandom([1, 0.9]));
    weather.update(1, WEATHER_INITIAL_CLEAR_HOURS + 1);
    expect(weather.kind).toBe('snow');
    expect(weather.level).toBe('heavy');

    weather.update(1, 24);
    expect(weather.kind).toBe('clear');
  });

  it('手动切换会关闭自动调度并平滑过渡', () => {
    const weather = new WeatherSystem(createRandom([0, 0]));
    weather.setManual('snow', 'heavy');

    expect(weather.auto).toBe(false);
    expect(weather.kind).toBe('snow');
    expect(weather.level).toBe('heavy');

    weather.update(WEATHER_FADE_SECONDS, 0);
    expect(weather.snapshot.snow).toBeCloseTo(1);

    // 关闭自动后再推进一天也不会换天气。
    weather.update(1, 24);
    expect(weather.kind).toBe('snow');
  });

  it('重新开启自动后继续从当前状态计时', () => {
    const weather = new WeatherSystem(createRandom([0, 0]));
    weather.setManual('rain', 'medium');
    weather.setAuto(true);

    expect(weather.auto).toBe(true);
    weather.update(1, 1);
    expect(weather.kind).toBe('rain');
  });

  it('天气文案按强度与类型组合', () => {
    expect(formatWeatherLabel('clear', 'medium')).toBe('晴');
    expect(formatWeatherLabel('rain', 'light')).toBe('小雨');
    expect(formatWeatherLabel('snow', 'heavy')).toBe('大雪');
  });
});

function snapshot(
  kind: WeatherSnapshot['kind'],
  level: WeatherSnapshot['level'],
): WeatherSnapshot {
  return {
    kind,
    level,
    auto: false,
    rain: kind === 'rain' ? WEATHER_LEVEL_VALUE[level] : 0,
    snow: kind === 'snow' ? WEATHER_LEVEL_VALUE[level] : 0,
    precipitation: WEATHER_LEVEL_VALUE[level],
    windX: 0,
    windZ: 0,
  };
}

describe('WeatherEffects', () => {
  it('雨天水位明显上涨并停在合理上限内', () => {
    const effects = new WeatherEffects();
    effects.update(secondsForHours(8), snapshot('rain', 'medium'), NORMAL_TIME_SCALE);

    expect(effects.waterLevelOffset).toBeGreaterThan(0.2);
    expect(effects.waterLevelOffset).toBeLessThanOrEqual(WEATHER_WATER_RISE_MAX);

    // 持续大雨也不会无限上涨。
    effects.update(secondsForHours(48), snapshot('rain', 'heavy'), NORMAL_TIME_SCALE);
    expect(effects.waterLevelOffset).toBeCloseTo(WEATHER_WATER_RISE_MAX);
  });

  it('雪停后两个游戏小时内完全融化，水位也会慢慢退回', () => {
    const effects = new WeatherEffects();
    effects.update(secondsForHours(8), snapshot('snow', 'heavy'), NORMAL_TIME_SCALE);
    expect(effects.snowCoverage).toBeCloseTo(WEATHER_SNOW_COVER.heavy);

    effects.update(
      secondsForHours(WEATHER_SNOW_MELT_HOURS),
      snapshot('clear', 'light'),
      NORMAL_TIME_SCALE,
    );
    expect(effects.snowCoverage).toBe(0);

    const rainy = new WeatherEffects();
    rainy.update(secondsForHours(8), snapshot('rain', 'heavy'), NORMAL_TIME_SCALE);
    expect(rainy.waterLevelOffset).toBeGreaterThan(0);

    rainy.update(secondsForHours(48), snapshot('clear', 'light'), NORMAL_TIME_SCALE);
    expect(rainy.waterLevelOffset).toBe(0);
  });

  it('大雨水位上涨比小雨多', () => {
    const light = new WeatherEffects();
    const heavy = new WeatherEffects();
    light.update(secondsForHours(1), snapshot('rain', 'light'), NORMAL_TIME_SCALE);
    heavy.update(secondsForHours(1), snapshot('rain', 'heavy'), NORMAL_TIME_SCALE);

    expect(heavy.waterLevelOffset).toBeGreaterThan(light.waterLevelOffset);
  });
});
