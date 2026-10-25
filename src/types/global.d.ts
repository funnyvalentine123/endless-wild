import type { PerspectiveCamera } from 'three';
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
  height(x: number, z: number): number;
  getHour(): number;
  setHour(hour: number): void;
  wildlifePopulation(): Record<string, number>;
  wildlifeSightings(): Array<{ kind: string; x: number; y: number; z: number }>;
  villageStats(): { houses: number; villagers: number; smokeEmitters: number };
}

declare global {
  interface Window {
    __wild?: WildDebugApi;
  }
}
