import { OASIS, OASIS_WATER_EDGE } from '../config/oasis';
import { EYE_HEIGHT } from '../config/player';
import { WATER_LEVEL } from '../config/world';
import type { OasisSite } from './TerrainSurface';
import type { World } from './World';

export interface OasisEdgeTarget {
  /** 落脚点：绿洲里的湖岸草地。 */
  x: number;
  z: number;
  /** 面向绿洲中心（湖心）的朝向。 */
  yaw: number;
  /** 面向湖面的俯仰角。 */
  pitch: number;
  /** 绿洲中心坐标，调试用。 */
  centerX: number;
  centerZ: number;
  /** 落脚点到绿洲中心的距离（米）。 */
  distance: number;
}

/**
 * 搜索范围按 5km 网格逐级扩大，找到第一个绿洲就停止。
 * 绿洲平均间距十几公里，绝大多数情况下第一圈（±40km）就够了。
 */
const SEARCH_CELLS = [8, 16, 32, 64];
/** 落脚点到岸线的距离（米）：站在水边草地上，脚下干燥、湖水就在眼前。 */
const SHORE_MARGIN = 5;
/** 在“朝向玩家”的方向附近左右试探，按偏移从小到大排列。 */
const ANGLE_OFFSETS = [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.48, -0.48, 0.6, -0.6];

/**
 * 找到离玩家最近的绿洲，并把落脚点放在绿洲的湖岸边、面朝湖心。
 *
 * 绿洲半径 500m、湖面半径约 190m，而地形区块只加载玩家周围约 256m，
 * 站在绿洲外侧再往里看是看不到湖的（湖还在更远的加载范围之外）。
 * 因此落脚点放在绿洲里的湖岸草地上：脚下是干燥的草滩，正前方就是湖面，
 * 转过身是环绕整片湖水的树林环带。
 *
 * 只由调试按钮触发，属于一次性计算，直接复用绿洲网格的确定性数据。
 */
export function findNearestOasisEdge(
  world: World,
  x: number,
  z: number,
): OasisEdgeTarget | null {
  const site = findNearestOasisSite(world, x, z);
  if (!site) return null;

  // 从绿洲中心指向玩家的方向：优先落在离玩家最近的那一侧边缘。
  const dx = x - site.x;
  const dz = z - site.z;
  const baseAngle = Math.hypot(dx, dz) > 1 ? Math.atan2(dz, dx) : Math.PI / 2;
  const distance = Math.max(OASIS_WATER_EDGE - SHORE_MARGIN, OASIS.lakeRadius + 40);

  let fallback: OasisEdgeTarget | null = null;
  let fallbackSlope = Number.POSITIVE_INFINITY;

  for (const offset of ANGLE_OFFSETS) {
    const angle = baseAngle + offset;
    const px = site.x + Math.cos(angle) * distance;
    const pz = site.z + Math.sin(angle) * distance;
    const ground = world.groundAt(px, pz);
    // 不会落在湖里；岸边草地始终高于水位，这里只是保险。
    if (ground < WATER_LEVEL + 0.4) continue;

    // 坡度太陡的落脚点体验不好，优先选平地。
    const slope = Math.max(
      Math.abs(world.groundAt(px + 2, pz) - ground),
      Math.abs(world.groundAt(px, pz + 2) - ground),
    );
    if (slope >= 1.2) {
      if (slope < fallbackSlope) {
        fallbackSlope = slope;
        fallback = makeTarget(px, pz, ground, site, distance);
      }
      continue;
    }

    return makeTarget(px, pz, ground, site, distance);
  }

  return fallback;
}

/** 由落脚点与绿洲中心生成传送目标。 */
function makeTarget(
  px: number,
  pz: number,
  ground: number,
  site: OasisSite,
  distance: number,
): OasisEdgeTarget {
  const eye = ground + EYE_HEIGHT;
  return {
    x: px,
    z: pz,
    // 玩家前进方向是 (-sin(yaw), -cos(yaw))，指向湖心。
    yaw: Math.atan2(-(site.x - px), -(site.z - pz)),
    // 视线中心落在湖面高度上，一眼就能看到树林后面的湖。
    pitch: Math.atan2(WATER_LEVEL - eye, distance),
    centerX: site.x,
    centerZ: site.z,
    distance,
  };
}

/** 逐级扩大范围，取离玩家最近的绿洲中心。 */
function findNearestOasisSite(world: World, x: number, z: number): OasisSite | null {
  for (const cells of SEARCH_CELLS) {
    const reach = cells * OASIS.cellSize;
    const sites = world.oasisSitesInRect(x - reach, z - reach, x + reach, z + reach);
    if (sites.length === 0) continue;

    let best: OasisSite | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const site of sites) {
      const distance = Math.hypot(site.x - x, site.z - z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = site;
    }
    return best;
  }

  return null;
}
