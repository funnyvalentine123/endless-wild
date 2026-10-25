/** 天气类型与强度。 */
export type WeatherKind = 'clear' | 'rain' | 'snow';
export type WeatherLevel = 'light' | 'medium' | 'heavy';

/** 每档强度对应的连续系数，0–1。 */
export const WEATHER_LEVEL_VALUE: Record<WeatherLevel, number> = {
  light: 0.35,
  medium: 0.65,
  heavy: 1,
};

/** 自动天气：每种天气持续半天（12 个游戏小时）。 */
export const WEATHER_HOLD_HOURS = 12;
/** 开局先给一小段晴天，避免一进游戏就被雨雪盖住。 */
export const WEATHER_INITIAL_CLEAR_HOURS = 2;
/** 雨雪淡入淡出的真实秒数。 */
export const WEATHER_FADE_SECONDS = 8;

/** 粒子上限；强度只通过 drawRange 缩放，不重建 Buffer。 */
export const WEATHER_PARTICLE_MAX = {
  rain: 10000,
  snow: 7000,
} as const;

/** 跟随相机的降水体积（米）。 */
export const WEATHER_BOX = { width: 44, height: 22, depth: 44 } as const;

/** 坏天气时额外显示多少朵预分配的云。 */
export const CLOUD_WEATHER_COUNT = 14;

/** 降水时的雾参数与色调。 */
export const WEATHER_FOG_NEAR = 22;
export const WEATHER_FOG_FAR = 90;
export const RAIN_FOG_COLOR = 0x8b9aa6;
export const SNOW_FOG_COLOR = 0xd3dfe8;

/** 雨天水位上涨上限与速度（米、米/秒）。 */
export const WEATHER_WATER_RISE_MAX = 0.24;
export const WEATHER_WATER_RISE_RATE = 0.0025;
export const WEATHER_WATER_RECEDE_RATE = 0.0015;

/** 雪天积雪覆盖目标与累积/融化速度（0–1、1/秒）。 */
export const WEATHER_SNOW_COVER: Record<WeatherLevel, number> = {
  light: 0.3,
  medium: 0.6,
  heavy: 0.85,
};
export const WEATHER_SNOW_RATE = 0.005;
export const WEATHER_SNOW_MELT_RATE = 0.003;

/** 天气系统对外暴露的可变快照，避免每帧分配对象。 */
export interface WeatherSnapshot {
  kind: WeatherKind;
  level: WeatherLevel;
  auto: boolean;
  /** 当前可见的雨量 0–1（含淡入淡出）。 */
  rain: number;
  /** 当前可见的雪量 0–1（含淡入淡出）。 */
  snow: number;
  /** max(rain, snow)，用于雾、光照和云层。 */
  precipitation: number;
  windX: number;
  windZ: number;
}

/** HUD / 下拉框使用的天气文案。 */
export function formatWeatherLabel(kind: WeatherKind, level: WeatherLevel): string {
  if (kind === 'clear') return '晴';
  const size = level === 'light' ? '小' : level === 'medium' ? '中' : '大';
  return `${size}${kind === 'rain' ? '雨' : '雪'}`;
}
