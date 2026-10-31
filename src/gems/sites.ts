import { DESERT } from '../config/desert';
import { GEM_KINDS, GEM_RULES, type GemKind } from '../config/gems';
import { OASIS, OASIS_WATER_EDGE } from '../config/oasis';
import { CHUNK_SIZE, ROAD_WIDTH, WATER_LEVEL } from '../config/world';
import { createRandom, hashChunk } from '../math/random';
import { hoodooSiteAt } from '../world/desertLandmarks';
import type { World } from '../world/World';

type StaticGemKind = Exclude<GemKind, 'red' | 'purple' | 'glow'>;

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

const SITE_KINDS: readonly StaticGemKind[] = GEM_KINDS.filter(
  (kind): kind is StaticGemKind => kind !== 'red' && kind !== 'purple' && kind !== 'glow',
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
  if (kind === 'black') return blackSite(world, seed, originX, originZ);
  if (kind === 'blue') return blueSite(world, random, originX, originZ, cx, cz);
  if (kind === 'green') return greenSite(world, random, originX, originZ, cx, cz);
  return yellowSite(world, seed, originX, originZ);
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
}

/** 峰顶缓存：相邻区块会反复查询同一座山，算一次就够（结果只取决于 seed 与格号）。 */
const peakCache = new Map<string, MountainPeak | null>();
const PEAK_CACHE_LIMIT = 512;

/** 在 600m 山格里采样，最高点即这座山的峰顶。 */
function mountainPeakAt(
  world: World,
  seed: number,
  gx: number,
  gz: number,
): MountainPeak | null {
  const cacheKey = `${seed}:${gx}:${gz}`;
  const cached = peakCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { cellSize, samples } = GEM_RULES.black;
  const step = cellSize / (samples - 1);
  let best: MountainPeak | null = null;
  for (let ix = 0; ix < samples; ix++) {
    for (let iz = 0; iz < samples; iz++) {
      const x = gx * cellSize + ix * step;
      const z = gz * cellSize + iz * step;
      const height = world.height(x, z);
      if (!best || height > best.height) best = { x, z, height };
    }
  }

  if (peakCache.size >= PEAK_CACHE_LIMIT) {
    const oldest = peakCache.keys().next().value;
    if (oldest !== undefined) peakCache.delete(oldest);
  }
  peakCache.set(cacheKey, best);
  return best;
}

/**
 * 雪山雪线以上：以 600m 山格为单位，格内最高点就是这座山的峰顶。
 * 峰顶达到雪线高度（地形着色开始泛白的那片白色区域）后，按 1/2 概率长出黑宝石；
 * 只由“峰顶所在区块”负责生成，同一座山不会在相邻区块里重复出现。
 */
function blackSite(
  world: World,
  seed: number,
  originX: number,
  originZ: number,
): GemSite | null {
  const rules = GEM_RULES.black;
  const size = rules.cellSize;
  const half = CHUNK_SIZE * 0.5;
  const fromX = Math.floor((originX - half) / size);
  const toX = Math.ceil((originX + half) / size) - 1;
  const fromZ = Math.floor((originZ - half) / size);
  const toZ = Math.ceil((originZ + half) / size) - 1;

  for (let gx = fromX; gx <= toX; gx++) {
    for (let gz = fromZ; gz <= toZ; gz++) {
      const peak = mountainPeakAt(world, seed, gx, gz);
      if (!peak || peak.height < rules.minHeight) continue;
      // 峰顶不在本区块内：交给峰顶所在的那个区块，避免同一座山生成多次。
      if (
        peak.x < originX - half ||
        peak.x >= originX + half ||
        peak.z < originZ - half ||
        peak.z >= originZ + half
      ) {
        continue;
      }
      if (world.desertAt(peak.x, peak.z) > rules.maxDesert) continue;
      if (world.oasisAt(peak.x, peak.z) > 0.2) continue;

      // 有积雪就必定出现（chance = 1）；保留随机分支方便以后把概率调低。
      if (rules.chance < 1) {
        const roll = createRandom(hashChunk(seed ^ SALTS.black, gx, gz));
        if (roll() >= rules.chance) continue;
      }

      return { key: `black:${gx}:${gz}`, kind: 'black', x: peak.x, z: peak.z };
    }
  }
  return null;
}

/** 湖泊中央：区块内最深的湖心点，并且四周一圈都是水。 */
function blueSite(
  world: World,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  const rules = GEM_RULES.blue;
  if (random() >= rules.chance) return null;

  const step = CHUNK_SIZE / 4;
  let best: { x: number; z: number; height: number } | null = null;
  for (let ix = -2; ix <= 2; ix++) {
    for (let iz = -2; iz <= 2; iz++) {
      const x = originX + ix * step;
      const z = originZ + iz * step;
      const height = world.height(x, z);
      if (height > WATER_LEVEL - rules.minDepth) continue;
      if (world.biomeAt(x, z) !== '湖泊') continue;
      if (!best || height < best.height) best = { x, z, height };
    }
  }
  if (!best) return null;

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x = best.x + Math.cos(angle) * rules.ringRadius;
    const z = best.z + Math.sin(angle) * rules.ringRadius;
    if (world.height(x, z) > WATER_LEVEL - 0.3) return null;
  }

  return { key: `blue:${cx}:${cz}`, kind: 'blue', x: best.x, z: best.z };
}

/**
 * 绿洲树林：只有“绿洲中心所在”的那个区块负责生成，避免同一个绿洲被相邻
 * 区块重复撒出多颗宝石；落点在湖岸外的树林环带里。
 */
function greenSite(
  world: World,
  random: () => number,
  originX: number,
  originZ: number,
  cx: number,
  cz: number,
): GemSite | null {
  const rules = GEM_RULES.green;
  const info = world.oasisInfo(originX, originZ);
  if (!info || info.factor < 0.5) return null;
  if (Math.round(info.x / CHUNK_SIZE) !== cx) return null;
  if (Math.round(info.z / CHUNK_SIZE) !== cz) return null;
  if (random() >= rules.chance) return null;

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

    return { key: `green:${cx}:${cz}`, kind: 'green', x, z };
  }
  return null;
}

/** 风蚀岩柱附近：宝石站点由真实的岩柱格号决定，不会出现在空沙地上。 */
function yellowSite(
  world: World,
  seed: number,
  originX: number,
  originZ: number,
): GemSite | null {
  const rules = GEM_RULES.yellow;
  const size = DESERT.hoodooCellSize;
  const half = CHUNK_SIZE * 0.5;
  const fromX = Math.floor((originX - half) / size);
  const toX = Math.ceil((originX + half) / size) - 1;
  const fromZ = Math.floor((originZ - half) / size);
  const toZ = Math.ceil((originZ + half) / size) - 1;

  for (let gx = fromX; gx <= toX; gx++) {
    for (let gz = fromZ; gz <= toZ; gz++) {
      const hoodoo = hoodooSiteAt(world, seed, gx, gz);
      if (!hoodoo) continue;
      if (
        hoodoo.x < originX - half ||
        hoodoo.x >= originX + half ||
        hoodoo.z < originZ - half ||
        hoodoo.z >= originZ + half
      ) {
        continue;
      }

      // 岩柱的外观随机流已经用掉，这里再用独立流决定“是否有宝石”。
      const roll = createRandom(hashChunk(seed ^ SALTS.yellow, gx, gz));
      if (roll() >= rules.chance) continue;

      const angle = roll() * Math.PI * 2;
      const distance = rules.offset + roll() * 1.6;
      const x = hoodoo.x + Math.cos(angle) * distance;
      const z = hoodoo.z + Math.sin(angle) * distance;
      if (world.height(x, z) < WATER_LEVEL + 0.4) continue;
      if (world.habitatDesertAt(x, z) < 0.5) continue;

      return { key: `yellow:${gx}:${gz}`, kind: 'yellow', x, z };
    }
  }

  // 该区块没有岩柱：不消耗后续随机数也无所谓，本函数只返回本站点结果。
  return null;
}

/** 让测试与调试能列出站点规则，而不必自己维护一份宝石种类表。 */
export const STATIC_GEM_KINDS = SITE_KINDS;
