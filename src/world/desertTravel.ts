import { WATER_LEVEL } from '../config/world';
import type { World } from './World';

export interface DesertEdgeTarget {
  /** 落脚点：沙漠外围、普通地形上。 */
  x: number;
  z: number;
  /** 面向沙漠内部的朝向。 */
  yaw: number;
  /** 落脚点到刚进入沙漠核心的距离（米），调试用。 */
  distance: number;
}

/** 粗搜索步长与半径：覆盖玩家周围最近的一块沙漠。 */
const SEARCH_STEP = 400;
const SEARCH_RADIUS = 32_000;
/** 从核心向外退到边缘时的采样步长。 */
const EDGE_STEP = 12;
/** 退出沙漠核心后继续后退，直到沙地刚刚占主导（视觉上的沙漠边缘）。 */
const EDGE_EXIT_FACTOR = 0.62;
/** 边缘外侧留出的余量，避免一落地就站在过渡带里。 */
const EDGE_MARGIN = 8;
/** 向外探测的方向数。 */
const PROBE_DIRECTIONS = 16;

/**
 * 找到离玩家最近的沙漠，并把落脚点放在沙漠边缘外侧、面朝沙漠。
 *
 * 只由调试按钮触发，属于一次性计算，因此直接粗网格搜索 + 径向退边，
 * 不需要缓存，也不影响主循环性能。
 */
export function findNearestDesertEdge(
  world: World,
  x: number,
  z: number,
): DesertEdgeTarget | null {
  let coreX = 0;
  let coreZ = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  // 1. 粗网格找最近的沙漠核心点。
  for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz += SEARCH_STEP) {
    for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += SEARCH_STEP) {
      const squared = dx * dx + dz * dz;
      if (squared >= bestDistance) continue;
      const sampleX = x + dx;
      const sampleZ = z + dz;
      if (world.desertAt(sampleX, sampleZ) < 0.9) continue;
      bestDistance = squared;
      coreX = sampleX;
      coreZ = sampleZ;
    }
  }
  if (!Number.isFinite(bestDistance)) return null;

  // 2. 在粗结果附近细化，落脚点会更贴近沙丘。
  let refinedDistance = bestDistance;
  for (let dz = -SEARCH_STEP; dz <= SEARCH_STEP; dz += 50) {
    for (let dx = -SEARCH_STEP; dx <= SEARCH_STEP; dx += 50) {
      const sampleX = coreX + dx;
      const sampleZ = coreZ + dz;
      if (world.desertAt(sampleX, sampleZ) < 0.9) continue;
      const squared = (sampleX - x) ** 2 + (sampleZ - z) ** 2;
      if (squared >= refinedDistance) continue;
      refinedDistance = squared;
      coreX = sampleX;
      coreZ = sampleZ;
    }
  }

  // 3. 从核心向四周放射，取最短的退边方向。
  let bestExitX = coreX;
  let bestExitZ = coreZ;
  let bestExitDistance = Number.POSITIVE_INFINITY;
  let bestYaw = 0;

  for (let index = 0; index < PROBE_DIRECTIONS; index++) {
    const angle = (index / PROBE_DIRECTIONS) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    let distance = 0;
    let exitX = coreX;
    let exitZ = coreZ;

    for (distance = EDGE_STEP; distance <= 12_000; distance += EDGE_STEP) {
      exitX = coreX + dirX * distance;
      exitZ = coreZ + dirZ * distance;
      if (world.desertAt(exitX, exitZ) < EDGE_EXIT_FACTOR) break;
    }

    // 落在水里或者太陡的斜坡上时，这条方向的优先级降低。
    const marginX = exitX + dirX * EDGE_MARGIN;
    const marginZ = exitZ + dirZ * EDGE_MARGIN;
    const ground = world.groundAt(marginX, marginZ);
    const penalty = ground < WATER_LEVEL + 0.6 ? 6_000 : 0;
    const cost = distance + penalty;

    if (cost >= bestExitDistance) continue;

    bestExitDistance = cost;
    bestExitX = marginX;
    bestExitZ = marginZ;
    // 朝向沙漠核心：玩家前进方向是 (-sin(yaw), -cos(yaw))。
    bestYaw = Math.atan2(-(coreX - bestExitX), -(coreZ - bestExitZ));
  }

  return {
    x: bestExitX,
    z: bestExitZ,
    yaw: bestYaw,
    distance: Math.hypot(coreX - x, coreZ - z),
  };
}
