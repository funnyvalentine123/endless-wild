import type { PerspectiveCamera } from 'three';
import type { WeatherKind, WeatherLevel } from '../config/weather';
import type { PlayerState } from '../player/Player';
import type { World } from '../world/World';
import type { ChunkView, RoadView } from '../world/streaming/types';

/** 控制台调试接口；保留与原始版本同名的 window.__wild。 */
export interface WildDebugApi {
  player: PlayerState;
  world: World;
  chunks: ReadonlyMap<string, ChunkView>;
  roads: ReadonlyMap<number, RoadView>;
  camera: PerspectiveCamera;
  setAuto(value: boolean): void;
  getSpeed(): number;
  setSpeed(scale: number): void;
  height(x: number, z: number): number;
  /** 沙漠因子：1 为核心沙漠，0 为普通地形。 */
  desertAt(x: number, z: number): number;
  desertFactor(): number;
  /** 调试：传送到最近的沙漠边缘并面朝沙漠。 */
  toDesertEdge(): void;
  /** 调试：传送到最近的绿洲湖边并面朝湖心。 */
  toOasisEdge(): void;
  getHour(): number;
  setHour(hour: number): void;
  getWeather(): {
    kind: WeatherKind;
    level: WeatherLevel;
    auto: boolean;
    rain: number;
    snow: number;
    precipitation: number;
    snowCoverage: number;
    waterLevelOffset: number;
  };
  setWeather(kind: WeatherKind, level?: WeatherLevel): void;
  setWeatherAuto(enabled: boolean): void;
  wildlifePopulation(): Record<string, number>;
  wildlifeSightings(): Array<{ kind: string; x: number; y: number; z: number }>;
  villageStats(): { houses: number; villagers: number; smokeEmitters: number };
}

declare global {
  interface Window {
    __wild?: WildDebugApi;
  }
}
