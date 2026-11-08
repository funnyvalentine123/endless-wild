import { DESERT } from '../config/desert';
import { DYNAMIC_GEM_KINDS, GEM_KINDS, GEM_RULES, type GemKind } from '../config/gems';
import { OASIS, OASIS_WATER_EDGE } from '../config/oasis';
import { CHUNK_SIZE, ROAD_WIDTH, WATER_LEVEL } from '../config/world';
import { createRandom, hashChunk } from '../math/random';
import { hoodooSiteAt } from '../world/desertLandmarks';
import type { World } from '../world/World';

type DynamicGemKind = (typeof DYNAMIC_GEM_KINDS)[number];
type StaticGemKind = Exclude<GemKind, DynamicGemKind>;

export interface GemSite {
  /** 稳定标识：同一区块重复扫描会得到同一把钥匙，避免重复创建。 */
  readonly key: string;
  readonly kind: StaticGemKind;
  readonly x: number;
  readonly z: number;
}

/** 每种宝石使用独立随机流，新增宝石不会挤动已有的生成结果。 */
const SALTS: Record<StaticGemKind, number> = {
  diamond: 0x1a2c4e60,
  black: 0x2b3d5f71,
  blue: 0x3c4e6072,
  green: 0x4d5f7183,
  yellow: 0x5e607294,
};

const DYNAMIC_SET = new Set<string>(DYNAMIC_GEM_KINDS);

const SITE_KINDS: readonly StaticGemKind[] = GEM_KINDS.filter(
  (kind): kind is StaticGemKind => !DYNAMIC_SET.has(kind),
);

/**
 * 计算一个 64m 区块内由地形规则决定的宝石站点。
 *
 * 结果只取决于 (seed, 区块坐标)：先加载、后卸载、再加载都会回到同一处；
 * 每个宝石都有独立低概率，所以大多数区块返回空数组。
 */
export function staticGemSitesInChunk(
  world: World,
  seed: number,
  cx: number,
  cz: number,
): GemSite[] {
  const sites: GemSite[] = [];
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  for (const kind of SITE_KINDS) {
    const random = createRandom(hashChunk(seed ^ SALTS[kind], cx, cz));
    const site = findSite(kind, world, seed, random, originX, originZ, cx, cz);
    if (site) sites.push(site);
  }

  return sites;
}

function findSite(
  kind: StaticGemKind,
  world: World,
  seed: number,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  if (kind === 'diamond') return diamondSite(world, random, originX, originZ, cx, cz);
  if (kind === 'black') return blackSite(world, seed, cx, cz);
  if (kind === 'blue') return blueSite(world, random, originX, originZ);
  if (kind === 'green') return greenSite(world, random, originX, originZ, cx, cz);
  return yellowSite(world, seed, random, originX, originZ, cx, cz);
}

/** 丛林地面：森林足够密、离公路和水面都远。 */
function diamondSite(
  world: World,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  const rules = GEM_RULES.diamond;
  if (random() >= rules.chance) return null;

  for (let i = 0; i < 8; i++) {
    const x = originX + (random() - 0.5) * CHUNK_SIZE;
    const z = originZ + (random() - 0.5) * CHUNK_SIZE;
    const height = world.height(x, z);
    if (height < WATER_LEVEL + 0.5) continue;
    if (Math.abs(x - world.roadX(z)) < ROAD_WIDTH * 0.5 + 3) continue;
    if (world.desertAt(x, z) > rules.maxDesert) continue;
    if (world.forestAt(x, z) < rules.minForest) continue;

    return { key: `diamond:${cx}:${cz}`, kind: 'diamond', x, z };
  }
  return null;
}

interface MountainPeak {
  x: number;
  z: number;
  height: number;
  /** 与地形着色一致的积雪值：height + detail * 4，≥ 雪线就开始泛白。 */
  snow: number;
}

/**
 * 区块粗采样最高点缓存：相邻区块判定“谁才是山头”时会互查，每个区块只算一次。
 * 键里带 seed，同一进程里切换世界也不会串结果。
 */
const topCache = new Map<string, MountainPeak>();
/** 细化后的峰顶缓存：null 表示这块区块没有雪线。 */
const peakCache = new Map<string, MountainPeak | null>();
const CACHE_LIMIT = 2048;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/**
 * 区块内 5×5 粗采样（约 13m 一个点）的最高点。
 * 采样落在区块的半开区间里，相邻区块不会抢到同一个点。
 */
function chunkTop(world: World, seed: number, cx: number, cz: number): MountainPeak {
  const cacheKey = `${seed}:${cx}:${cz}`;
  const cached = topCache.get(cacheKey);
  if (cached) return cached;

  const rules = GEM_RULES.black;
  const size = CHUNK_SIZE - 0.01;
  const minX = cx * CHUNK_SIZE - CHUNK_SIZE * 0.5;
  const minZ = cz * CHUNK_SIZE - CHUNK_SIZE * 0.5;
  const step = size / rules.samples;

  const read = (x: number, z: number): MountainPeak => {
    const height = world.height(x, z);
    return { x, z, height, snow: height + world.detailAt(x, z) * 4 };
  };

  let best = read(minX + step * 0.5, minZ + step * 0.5);
  for (let ix = 0; ix < rules.samples; ix++) {
    for (let iz = 0; iz < rules.samples; iz++) {
      const sample = read(minX + (ix + 0.5) * step, minZ + (iz + 0.5) * step);
      if (sample.snow > best.snow) best = sample;
    }
  }
  return remember(topCache, cacheKey, best);
}

/**
 * 区块最高点的细化（峰顶）：从粗采样最高点开始上山，6.4m → 3.2m → 1.6m。
 * 只有粗采样已经接近雪线才细化；否则直接判定这块区块没有积雪。
 */
function peakInChunk(world: World, seed: number, cx: number, cz: number): MountainPeak | null {
  const cacheKey = `${seed}:${cx}:${cz}`;
  const cached = peakCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rules = GEM_RULES.black;
  const top = chunkTop(world, seed, cx, cz);
  let peak: MountainPeak | null = null;

  if (top.snow >= rules.minHeight - rules.coarseSlack) {
    const size = CHUNK_SIZE - 0.01;
    const minX = cx * CHUNK_SIZE - CHUNK_SIZE * 0.5;
    const minZ = cz * CHUNK_SIZE - CHUNK_SIZE * 0.5;
    const maxX = minX + size;
    const maxZ = minZ + size;
    const read = (x: number, z: number): MountainPeak => {
      const height = world.height(x, z);
      return { x, z, height, snow: height + world.detailAt(x, z) * 4 };
    };

    let best = top;
    let span = (size / rules.samples) * 0.5;
    for (let round = 0; round < rules.refineRounds; round++) {
      let next = best;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const sample = read(
            clamp(best.x + dx * span, minX, maxX),
            clamp(best.z + dz * span, minZ, maxZ),
          );
          if (sample.snow > next.snow) next = sample;
        }
      }
      best = next;
      span *= 0.5;
    }

    // 与地形着色完全一致：height + detail * 4 ≥ 40 就是开始泛白的那片白色区域。
    peak = best.snow >= rules.minHeight ? best : null;
  }

  return remember(peakCache, cacheKey, peak);
}

/**
 * 是不是“这座山的山头”：3×3 区块里没有更高的积雪峰顶。
 *
 * 一座山横跨多个区块时，每个区块都能找到自己那一小块的高点，
 * 只有最高峰所在的那块判定为山头，因此一座山最多只出一颗黑宝石。
 * 比较用的是各区块的粗采样最高点（都已缓存），不必为邻居再细化一遍。
 */
function isSummit(world: World, seed: number, cx: number, cz: number, top: MountainPeak): boolean {
  const radius = GEM_RULES.black.summitRadius;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx === 0 && dz === 0) continue;
      const otherX = cx + dx;
      const otherZ = cz + dz;
      const other = chunkTop(world, seed, otherX, otherZ);
      if (other.snow > top.snow) return false;
      // 完全持平的平顶：按区块坐标排一个固定先后，只让一个区块产出，结果稳定。
      if (other.snow === top.snow && (otherZ < cz || (otherZ === cz && otherX < cx))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 雪山：区块最高点越过雪线（地形着色开始泛白的那片白色区域）才算雪山，
 * 再确认它是 3×3 区块里的最高峰（一个山头只算一座），最后掷 1/2 概率。
 * 命中时黑宝石落在峰顶。
 *
 * 判定单位是区块而不是几百米的大格：山峰脊线波长只有一百多米，
 * 用 100m 网格找峰顶会严重低估高度，导致明明有白色积雪却判定“没到雪线”。
 */
function blackSite(world: World, seed: number, cx: number, cz: number): GemSite | null {
  const rules = GEM_RULES.black;
  const top = chunkTop(world, seed, cx, cz);
  if (top.snow < rules.minHeight - rules.coarseSlack) return null;
  if (world.desertAt(top.x, top.z) > rules.maxDesert) return null;
  if (world.oasisAt(top.x, top.z) > 0.2) return null;
  if (!isSummit(world, seed, cx, cz, top)) return null;

  const peak = peakInChunk(world, seed, cx, cz);
  if (!peak) return null;

  // 一个山头只有 1/2 概率长出黑宝石；随机数只由山头所在区块决定，进出山区结果不变。
  if (rules.chance < 1) {
    const roll = createRandom(hashChunk(seed ^ SALTS.black, cx, cz));
    if (roll() >= rules.chance) return null;
  }

  return { key: `black:${cx}:${cz}`, kind: 'black', x: peak.x, z: peak.z };
}

/**
 * 水面点周围是否“开阔”：8 个方向上 radius 米处都还必须是水。
 *
 * 水面点本身已确认在水下，这里只关心离岸有多远：8 个方向全过，
 * 说明以落点为圆心的这片水面直径至少有 2 * radius，窄河、浅沟与岸边都不算。
 */
function isOpenWater(world: World, x: number, z: number, radius: number): boolean {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const pz = z + Math.sin(angle) * radius;
    // 探针点本身也要有 0.2m 水深，浅滩岸边会被判成“已离岸”。
    if (world.height(px, pz) > WATER_LEVEL - 0.2) return false;
  }
  return true;
}

/**
 * 湖水：任何“开阔的大水面中心”都能长出蓝宝石。
 *
 * 不再限定湖泊 biome 与湖心深度，只看两件事：
 * 1. 落点是一块水面（比水位低 0.4m 以上）；
 * 2. 这块水面向外 24m 的 8 个方向仍然是水 —— 面积够大、离岸够远。
 *
 * 候选点按 96m 的水面格划分：每格只在格心附近的 3×3 里取点，同一格最多一颗，
 * 相邻两格的宝石至少隔开 48m，所以一片湖面上不会叠出两颗挤在一起的蓝宝石。
 */
function blueSite(
  world: World,
  random: () => number,
  originX: number,
  originZ: number,
): GemSite | null {
  const rules = GEM_RULES.blue;
  const size = rules.cellSize;
  const minX = originX - CHUNK_SIZE * 0.5;
  const minZ = originZ - CHUNK_SIZE * 0.5;
  // 只处理“格心落在这块 64m 区块里”的水面格：一格恰好有一个区块负责，不会重复。
  const fromX = Math.ceil(minX / size - 0.5);
  const toX = Math.ceil((minX + CHUNK_SIZE) / size - 0.5) - 1;
  const fromZ = Math.ceil(minZ / size - 0.5);
  const toZ = Math.ceil((minZ + CHUNK_SIZE) / size - 0.5) - 1;

  for (let gx = fromX; gx <= toX; gx++) {
    for (let gz = fromZ; gz <= toZ; gz++) {
      if (random() >= rules.chance) continue;

      const cellX = (gx + 0.5) * size;
      const cellZ = (gz + 0.5) * size;
      const half = ((rules.cellSamples - 1) / 2) * rules.cellSpacing;
      const candidates: { x: number; z: number; height: number }[] = [];
      for (let ix = 0; ix < rules.cellSamples; ix++) {
        for (let iz = 0; iz < rules.cellSamples; iz++) {
          const x = cellX - half + ix * rules.cellSpacing;
          const z = cellZ - half + iz * rules.cellSpacing;
          const height = world.height(x, z);
          if (height > WATER_LEVEL - rules.minDepth) continue;
          candidates.push({ x, z, height });
        }
      }
      if (candidates.length === 0) continue;

      // 越深越靠近湖心：从最深的候选点开始验算，水浅的候选点直接放弃。
      candidates.sort((a, b) => a.height - b.height);
      for (const point of candidates.slice(0, rules.candidates)) {
        if (!isOpenWater(world, point.x, point.z, rules.minOpenRadius)) continue;
        return { key: `blue:${gx}:${gz}`, kind: 'blue', x: point.x, z: point.z };
      }
    }
  }
  return null;
}

/**
 * 绿宝石有两种生境：
 * 1. 绿洲湖岸外的树林带 —— 高概率，只有绿洲中心所在区块负责，避免同一个绿洲重复撒点；
 * 2. 普通草地 —— 低概率，远离沙漠、水面与道路的绿地上偶尔出现一颗。
 */
function greenSite(
  world: World,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  const oasis = oasisGreenSite(world, random, cx, cz);
  if (oasis) return oasis;
  return meadowGreenSite(world, random, originX, originZ, cx, cz);
}

function oasisGreenSite(
  world: World,
  random: () => number,
  cx: number,
  cz: number,
): GemSite | null {
  const rules = GEM_RULES.green;
  const info = world.oasisInfo(cx * CHUNK_SIZE, cz * CHUNK_SIZE);
  if (!info || info.factor < 0.5) return null;
  if (Math.round(info.x / CHUNK_SIZE) !== cx) return null;
  if (Math.round(info.z / CHUNK_SIZE) !== cz) return null;
  if (random() >= rules.oasisChance) return null;

  const minRadius = OASIS_WATER_EDGE + rules.minWaterDistance;
  const maxRadius = OASIS.radius * OASIS.terrainFade - 8;
  if (maxRadius <= minRadius) return null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = minRadius + random() * (maxRadius - minRadius);
    const x = info.x + Math.cos(angle) * radius;
    const z = info.z + Math.sin(angle) * radius;
    const ground = world.height(x, z);
    if (ground < WATER_LEVEL + 0.5 || ground > rules.maxHeight) continue;

    const spot = world.oasisInfo(x, z);
    if (!spot || spot.factor < 0.5) continue;
    if (spot.waterDistance <= OASIS_WATER_EDGE + rules.minWaterDistance) continue;

    return { key: `green:oasis:${cx}:${cz}`, kind: 'green', x, z };
  }
  return null;
}

/** 普通绿地：草原地表、离水 / 公路 / 沙漠都够远的干燥陆地。 */
function meadowGreenSite(
  world: World,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  const rules = GEM_RULES.green;
  if (random() >= rules.meadowChance) return null;

  for (let attempt = 0; attempt < rules.meadowAttempts; attempt++) {
    const x = originX + (random() - 0.5) * CHUNK_SIZE;
    const z = originZ + (random() - 0.5) * CHUNK_SIZE;
    if (world.height(x, z) < WATER_LEVEL + 0.5) continue;
    if (world.desertAt(x, z) > rules.maxDesert) continue;
    if (world.oasisAt(x, z) > 0.2) continue;
    if (Math.abs(x - world.roadX(z)) < ROAD_WIDTH * 0.5 + 3) continue;
    if (world.biomeAt(x, z) !== '草原') continue;
    return { key: `green:meadow:${cx}:${cz}`, kind: 'green', x, z };
  }
  return null;
}

interface HoodooRef {
  readonly x: number;
  readonly z: number;
  readonly gx: number;
  readonly gz: number;
}

/** 列出与给定矩形相交的所有风蚀岩柱（岩柱位置由 600m 格号决定）。 */
function hoodoosInRect(
  world: World,
  seed: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): HoodooRef[] {
  const size = DESERT.hoodooCellSize;
  const fromX = Math.floor(minX / size);
  const toX = Math.ceil(maxX / size) - 1;
  const fromZ = Math.floor(minZ / size);
  const toZ = Math.ceil(maxZ / size) - 1;

  const hoodoos: HoodooRef[] = [];
  for (let gx = fromX; gx <= toX; gx++) {
    for (let gz = fromZ; gz <= toZ; gz++) {
      const hoodoo = hoodooSiteAt(world, seed, gx, gz);
      if (hoodoo) hoodoos.push({ x: hoodoo.x, z: hoodoo.z, gx, gz });
    }
  }
  return hoodoos;
}

/**
 * 黄宝石有两种生境：
 * 1. 风蚀岩柱旁 3.6–5.2m —— 大概率，站点由真实的岩柱格号决定，不会出现在空沙地上；
 * 2. 沙漠里普通的沙地 —— 低概率，拉开与所有岩柱的距离，避免和岩柱旁那颗挤在一起。
 */
function yellowSite(
  world: World,
  seed: number,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  const rules = GEM_RULES.yellow;
  const half = CHUNK_SIZE * 0.5;
  const margin = rules.offset + rules.hoodooClearance;
  const hoodoos = hoodoosInRect(
    world,
    seed,
    originX - half - margin,
    originZ - half - margin,
    originX + half + margin,
    originZ + half + margin,
  );

  for (const hoodoo of hoodoos) {
    // 岩柱的宝石只由“岩柱所在区块”生成，相邻区块不会重复撒点。
    if (hoodoo.x < originX - half || hoodoo.x >= originX + half) continue;
    if (hoodoo.z < originZ - half || hoodoo.z >= originZ + half) continue;

    // 岩柱的外观随机流已经用掉，这里再用独立流决定“是否有宝石”。
    const roll = createRandom(hashChunk(seed ^ SALTS.yellow, hoodoo.gx, hoodoo.gz));
    if (roll() >= rules.hoodooChance) continue;

    const angle = roll() * Math.PI * 2;
    const distance = rules.offset + roll() * 1.6;
    const x = hoodoo.x + Math.cos(angle) * distance;
    const z = hoodoo.z + Math.sin(angle) * distance;
    if (world.height(x, z) < WATER_LEVEL + 0.4) continue;
    if (world.habitatDesertAt(x, z) < 0.5) continue;

    return { key: `yellow:${hoodoo.gx}:${hoodoo.gz}`, kind: 'yellow', x, z };
  }

  if (random() >= rules.desertChance) return null;

  const clearance = rules.offset + rules.hoodooClearance;
  for (let attempt = 0; attempt < rules.desertAttempts; attempt++) {
    const x = originX + (random() - 0.5) * CHUNK_SIZE;
    const z = originZ + (random() - 0.5) * CHUNK_SIZE;
    if (world.height(x, z) < WATER_LEVEL + 0.4) continue;
    if (world.habitatDesertAt(x, z) < rules.minDesert) continue;

    let tooClose = false;
    for (const hoodoo of hoodoos) {
      if (Math.hypot(x - hoodoo.x, z - hoodoo.z) < clearance) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    return { key: `yellow:desert:${cx}:${cz}`, kind: 'yellow', x, z };
  }
  return null;
}

/** 让测试与调试能列出站点规则，而不必自己维护一份宝石种类表。 */
export const STATIC_GEM_KINDS = SITE_KINDS;
