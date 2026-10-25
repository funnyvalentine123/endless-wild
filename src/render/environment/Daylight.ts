import { Color, Vector3 } from 'three';

/**
 * 一帧内可复用的昼夜光照快照。
 * DayNightCycle 原地更新这些 Color，渲染层只读取 / copy，避免每帧分配。
 */
export interface DaylightSnapshot {
  sunDirection: Vector3;
  skyTop: Color;
  skyBottom: Color;
  fogColor: Color;
  sunColor: Color;
  skySunColor: Color;
  sunIntensity: number;
  hemiColor: Color;
  hemiIntensity: number;
  starOpacity: number;
  lampIntensity: number;
  cloudEmissive: Color;
  waterBrightness: number;
  daylightFactor: number;
  duskFactor: number;
}

/** 天空与光照调色板。保持原始单文件版本的配色。 */
export const SKY_PALETTE = {
  dayTop: new Color(0x3b86d8),
  nightTop: new Color(0x070f26),
  dayBottom: new Color(0xc4e4f8),
  nightBottom: new Color(0x141d36),
  dusk: new Color(0xf4a06a),
  sunDay: new Color(0xfff1d6),
  sunDusk: new Color(0xffa060),
  moon: new Color(0x9fb4ff),
  hemiDay: new Color(0xcfe8ff),
  hemiNight: new Color(0x3a4a7a),
  white: new Color(0xffffff),
} as const;
