import { WATER_LEVEL } from '../config/world';
import { smoothstep } from '../math/scalar';
import type { World } from '../world/World';

export interface SpawnSpot {
  x: number;
  y: number;
  z: number;
}

export interface LandSpawnOptions {
  minDistance: number;
  maxDistance: number;
  maxSlope: number;
  maxForest?: number;
  /** 生境沙漠因子下限 / 上限，用于把普通动物与沙漠动物分开。 */
  minDesert?: number;
  maxDesert?: number;
}

function randomDistance(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomPoint(px: number, pz: number, min: number, max: number): readonly [number, number] {
  const angle = Math.random() * Math.PI * 2;
  const distance = randomDistance(min, max);
  return [px + Math.sin(angle) * distance, pz + Math.cos(angle) * distance];
}

function terrainSlope(world: World, x: number, z: number): number {
  return Math.hypot(
    (world.height(x + 2, z) - world.height(x - 2, z)) / 4,
    (world.height(x, z + 2) - world.height(x, z - 2)) / 4,
  );
}

/** 在玩家周围找一个干燥、坡度合适的陆地生成点。 */
export function findLandSpot(
  world: World,
  playerX: number,
  playerZ: number,
  options: LandSpawnOptions,
): SpawnSpot | null {
  for (let attempt = 0; attempt < 18; attempt++) {
    const [x, z] = randomPoint(
      playerX,
      playerZ,
      options.minDistance,
      options.maxDistance,
    );
    const y = world.groundAt(x, z);

    if (y < WATER_LEVEL + 0.6) continue;
    if (options.maxForest !== undefined && world.forestAt(x, z) > options.maxForest) continue;

    // 生境用 habitatDesertAt：绿洲从沙漠因子里扣掉，普通动物可以在绿洲
    // 里生成、但不能走出绿洲；沙漠动物则进不来。
    const desert = world.habitatDesertAt(x, z);
    if (options.minDesert !== undefined && desert < options.minDesert) continue;
    if (options.maxDesert !== undefined && desert > options.maxDesert) continue;

    // 靠近沙漠时逐步降低普通动物的刷新概率：生境边缘不会出现“突然一只都没有”的硬切。
    if (options.maxDesert !== undefined) {
      const fadeStart = options.maxDesert * 0.4;
      if (desert > fadeStart) {
        const chance = 1 - smoothstep(fadeStart, options.maxDesert, desert);
        if (Math.random() > chance) continue;
      }
    }

    if (terrainSlope(world, x, z) > options.maxSlope) continue;

    return { x, y, z };
  }

  return null;
}

/** 找一块有足够水深的河 / 湖水面，鱼只在水里生成。 */
export function findWaterSpot(
  world: World,
  playerX: number,
  playerZ: number,
  minDistance: number,
  maxDistance: number,
): SpawnSpot | null {
  for (let attempt = 0; attempt < 32; attempt++) {
    const [x, z] = randomPoint(playerX, playerZ, minDistance, maxDistance);
    if (world.rawHeight(x, z) > WATER_LEVEL - 0.5) continue;
    return { x, y: WATER_LEVEL - 0.22, z };
  }

  return null;
}

/** 空中生成点，保证高于地形和湖面。 */
export function findAirSpot(
  world: World,
  playerX: number,
  playerZ: number,
  minDistance: number,
  maxDistance: number,
  altitudeMin: number,
  altitudeMax: number,
): SpawnSpot | null {
  const [x, z] = randomPoint(playerX, playerZ, minDistance, maxDistance);
  const y =
    Math.max(world.groundAt(x, z), WATER_LEVEL) + randomDistance(altitudeMin, altitudeMax);
  return { x, y, z };
}
