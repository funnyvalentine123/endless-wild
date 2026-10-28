import { WATER_LEVEL } from '../config/world';
import type { World } from './World';

export interface SpawnPoint {
  x: number;
  z: number;
}

const SEARCH_STEP = 4;
const SEARCH_RANGE = 320;
const MIN_LAND_CLEARANCE = 2;
const MAX_ROAD_GRADE = 0.12;

/**
 * 沿道路寻找一个干燥、平缓、且前方一小段没有水的出生点。
 * 避免玩家一进游戏就站在桥上，或走两步就遇到河。
 */
function isSuitable(world: World, z: number): boolean {
  const x = world.roadX(z);

  if (world.bridge(z) > 0.05) return false;
  if (world.bridge(z - 12) > 0.1 || world.bridge(z - 24) > 0.1) return false;
  if (world.rawHeight(x, z) < WATER_LEVEL + MIN_LAND_CLEARANCE) return false;
  // 出生点应该在普通地形上，避免玩家一睁眼就站在沙漠里。
  if (world.desertAt(x, z) > 0.2) return false;

  // 出生点周围也要开阔：避免一睁眼就是河岸悬崖或紧贴水面的路段。
  for (const offset of [-40, -24, -12, 12, 24, 40]) {
    if (world.rawHeight(x + offset, z) < WATER_LEVEL + 1) return false;
  }

  const roadHeight = world.roadHeight(z);
  for (const offset of [-40, -24, 24, 40]) {
    if (Math.abs(world.height(x + offset, z) - roadHeight) > 12) return false;
  }

  const grade = Math.abs(world.roadHeight(z + 6) - world.roadHeight(z - 6)) / 12;
  return grade <= MAX_ROAD_GRADE;
}

export function findRoadSpawn(world: World): SpawnPoint {
  for (let distance = 0; distance <= SEARCH_RANGE; distance += SEARCH_STEP) {
    const candidates = distance === 0 ? [0] : [distance, -distance];

    for (const z of candidates) {
      if (isSuitable(world, z)) return { x: world.roadX(z), z };
    }
  }

  // 极端种子下找不到完全合适的位置时，退回道路起点，避免阻塞启动。
  return { x: world.roadX(0), z: 0 };
}
