import { DESERT } from '../config/desert';
import { OASIS, OASIS_WATER_EDGE } from '../config/oasis';
import { TERRAIN } from '../config/terrain';
import { WATER_LEVEL } from '../config/world';
import { createRandom, hashChunk, mix32 } from '../math/random';
import { lerp, smoothstep } from '../math/scalar';
import type { NoiseFields } from './NoiseFields';

interface DesertCell {
  centerX: number;
  centerZ: number;
  radius: number;
}

export interface OasisSite {
  x: number;
  z: number;
  radius: number;
}

export interface OasisInfo extends OasisSite {
  /** 到绿洲中心的距离。 */
  distance: number;
  /** 0–1 的绿洲覆盖因子，边缘平滑衰减。 */
  factor: number;
}

const DESERT_SALT = 0x5f3a2b91;
const ROAD_DESERT_SALT = 0x2c9e77b3;
const OASIS_SALT = 0x6b1d4e27;
const DESERT_CELL_CACHE_LIMIT = 4096;

/**
 * 不受道路影响的原始地形：山地、丘陵、湖泊、河流、森林与沙漠。
 * 只做数值采样，不依赖 three.js，方便单测。
 */
export class TerrainSurface {
  private readonly desertCells = new Map<number, DesertCell | null>();
  /** 沿道路保障沙漠的缓存，key 为保障链上的序号。 */
  private readonly roadDeserts = new Map<number, DesertCell>();
  /** 绿洲缓存，key 为 5km 网格坐标。 */
  private readonly oasisCells = new Map<string, OasisSite | null>();

  constructor(
    private readonly noise: NoiseFields,
    private readonly seed = 0,
  ) {}

  /** 蜿蜒的河道场；值越小越接近河心。 */
  riverAt(x: number, z: number): number {
    const river = TERRAIN.river;
    const wx =
      x + river.warpAmplitude * this.noise.warp(x * river.warpFrequency, z * river.warpFrequency);
    const wz =
      z +
      river.warpAmplitude *
        this.noise.warp(
          z * river.warpFrequency + river.warpOffsetZ,
          x * river.warpFrequency + river.warpOffsetX,
        );
    return Math.abs(this.noise.river(wx * river.frequency, wz * river.frequency));
  }

  /**
   * 沙漠因子：核心为 1，向普通地形过渡带平滑降到 0。
   *
   * 用大网格单元里的大圆来分布沙漠，因此不会出现噪声阈值法常见的零散小岛。
   * 圆心与半径都由 (seed, cx, cz) 唯一确定，离开再回来仍是同一片沙漠。
   */
  desertAt(x: number, z: number): number {
    const cellX = Math.floor(x / DESERT.cellSize);
    const cellZ = Math.floor(z / DESERT.cellSize);
    const warp =
      this.noise.desert(x * DESERT.warpFrequency, z * DESERT.warpFrequency) * DESERT.edgeWarp;

    let factor = 0;
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const cell = this.desertCell(cellX + offsetX, cellZ + offsetZ);
        if (!cell) continue;

        const distance = Math.hypot(x - cell.centerX, z - cell.centerZ);
        const radius = cell.radius + warp;
        // 过渡带在沙漠内侧，沙漠外围仍是完全正常的普通地形。
        if (distance >= radius) continue;

        const value = 1 - smoothstep(radius - DESERT.edge, radius, distance);
        if (value > factor) factor = value;
      }
    }

    // 沿道路的保障沙漠：任意一段路上，前后 10km 内一定能遇到一块沙漠。
    const roadCell = this.roadDesertCell(
      Math.round(z / DESERT.roadDesertSpacing - 0.5),
    );
    const roadDx = x - roadCell.centerX;
    const roadDz = z - roadCell.centerZ;
    const roadRadius = roadCell.radius + warp;
    if (roadDx * roadDx + roadDz * roadDz < roadRadius * roadRadius) {
      const value =
        1 - smoothstep(roadRadius - DESERT.edge, roadRadius, Math.hypot(roadDx, roadDz));
      if (value > factor) factor = value;
    }

    return factor;
  }

  /** 未与道路融合的基础高度。 */
  rawHeight(x: number, z: number): number {
    const { base, hill, mountain, detail, lake } = TERRAIN;

    let height =
      base.height + this.noise.base(x * base.frequency, z * base.frequency) * base.amplitude;
    height +=
      (this.noise.hill(x * hill.frequency, z * hill.frequency) * hill.weight +
        this.noise.hill(x * hill.detailFrequency + 9, z * hill.detailFrequency) * hill.detailWeight) *
      hill.amplitude;

    const mountainNoise = this.noise.mount(x * mountain.frequency, z * mountain.frequency);
    if (mountainNoise > mountain.threshold) {
      const ridge =
        1 -
        Math.abs(
          this.noise.mount(
            x * mountain.ridgeFrequency + mountain.ridgeOffset,
            z * mountain.ridgeFrequency,
          ),
        );
      height +=
        Math.pow(mountainNoise - mountain.threshold, mountain.exponent) *
        mountain.amplitude *
        (1 - mountain.ridgeWeight + mountain.ridgeWeight * ridge);
    }

    height += this.noise.detail(x * detail.frequency, z * detail.frequency) * detail.amplitude;

    const lakeNoise = this.noise.lake(x * lake.frequency, z * lake.frequency);
    height = lerp(height, lake.depth, smoothstep(lake.start, lake.end, lakeNoise));

    const river = this.riverAt(x, z);
    height = lerp(
      height,
      TERRAIN.river.depth,
      smoothstep(TERRAIN.river.start, TERRAIN.river.end, river),
    );

    // 沙漠核心直接替换为沙丘高度：河床与湖床也被整体抬到水位之上，
    // 从数值源头消除沙漠内部的河流、湖泊；过渡带则自然渐变。
    const desert = this.desertAt(x, z);
    if (desert > 0) height = lerp(height, this.duneHeight(x, z), desert);

    // 绿洲：在最低的沙丘洼地里挖出湖盆，外圈留出高出水面的树林台地，
    // 再向四周沙丘平滑过渡。湖面直接复用全局水面。
    const oasis = this.nearestOasis(x, z);
    if (oasis) {
      const blend = this.oasisBlend(oasis.distance);
      if (blend > 0) height = lerp(height, this.oasisFloorHeight(oasis.distance), blend);
    }

    return height;
  }

  /** 0–1 的绿洲覆盖因子：湖面与树林台地为 1，边缘平滑衰减到 0。 */
  oasisAt(x: number, z: number): number {
    const oasis = this.nearestOasis(x, z);
    return oasis ? this.oasisBlend(oasis.distance) : 0;
  }

  /** 最近的绿洲信息；不在任何绿洲范围内时返回 null。 */
  oasisInfo(x: number, z: number): OasisInfo | null {
    const oasis = this.nearestOasis(x, z);
    if (!oasis) return null;
    return {
      x: oasis.x,
      z: oasis.z,
      radius: oasis.radius,
      distance: oasis.distance,
      factor: this.oasisBlend(oasis.distance),
    };
  }

  /** 与给定矩形相交的所有绿洲。 */
  oasisSitesInRect(minX: number, minZ: number, maxX: number, maxZ: number): OasisSite[] {
    const cells = OASIS.cellSize;
    const fromX = Math.floor(minX / cells) - 1;
    const toX = Math.floor(maxX / cells) + 1;
    const fromZ = Math.floor(minZ / cells) - 1;
    const toZ = Math.floor(maxZ / cells) + 1;
    const sites: OasisSite[] = [];

    for (let cx = fromX; cx <= toX; cx++) {
      for (let cz = fromZ; cz <= toZ; cz++) {
        const site = this.oasisSite(cx, cz);
        if (!site) continue;
        if (site.x + site.radius < minX || site.x - site.radius > maxX) continue;
        if (site.z + site.radius < minZ || site.z - site.radius > maxZ) continue;
        sites.push(site);
      }
    }

    return sites;
  }

  /** 森林密度场，越高越容易长树。 */
  forestAt(x: number, z: number): number {
    return this.noise.forest(x * 0.0045, z * 0.0045) + 0.25 * this.noise.forest(x * 0.02, z * 0.02);
  }

  /**
   * 连绵起伏的沙丘高度：低频大起伏 + 中频次级隆起 + 锐利沙脊 + 细沙纹。
   * 全部振幅叠加后的最低点仍在 4.6m 左右，高于最高水位。
   */
  private duneHeight(x: number, z: number): number {
    const dunes = DESERT.dunes;
    const swell =
      0.5 + 0.5 * this.noise.desert(x * dunes.swellFrequency, z * dunes.swellFrequency);
    const mid =
      0.5 +
      0.5 *
        this.noise.desert(
          x * dunes.midFrequency + 12.7,
          z * dunes.midFrequency - 41.3,
        );
    // 1 - |noise| 让沙丘顶部形成清晰的脊线，而不是又一个平滑的圆包；
    // 再用 smoothstep 把脊顶和丘间盆地压平，得到宽缓的过渡而不是尖锐棱线。
    const ridge = smoothstep(
      0.12,
      0.88,
      1 -
        Math.abs(
          this.noise.desert(
            x * dunes.ridgeFrequency + 37.2,
            z * dunes.ridgeFrequency - 18.6,
          ),
        ),
    );
    // 第二层更细的沙脊，用不同偏移和方向交叉，近处也不会出现平坦沙面。
    const ridge2 = smoothstep(
      0.2,
      0.8,
      1 -
        Math.abs(
          this.noise.desert(
            x * dunes.ridge2Frequency - 63.4,
            z * dunes.ridge2Frequency + 24.9,
          ),
        ),
    );
    const ripple = this.noise.detail(x * dunes.rippleFrequency, z * dunes.rippleFrequency);
    const detail = this.noise.detail(
      x * dunes.detailFrequency + 5.5,
      z * dunes.detailFrequency + 11.2,
    );

    return (
      dunes.base +
      swell * dunes.swellAmplitude +
      mid * dunes.midAmplitude +
      ridge * dunes.ridgeAmplitude +
      ridge2 * dunes.ridge2Amplitude +
      ripple * dunes.rippleAmplitude +
      detail * dunes.detailAmplitude
    );
  }

  /**
   * 绿洲的地形混合权重：0 表示完全交给沙丘，1 表示完全使用绿洲地面。
   * 湖岸与树林台地是平的，之后再向外平滑爬升回沙丘。
   */
  private oasisBlend(distance: number): number {
    if (distance >= OASIS.radius) return 0;
    const inner = OASIS.radius * OASIS.terrainFade;
    if (distance <= inner) return 1;
    return 1 - smoothstep(inner, OASIS.radius, distance);
  }

  /** 绿洲地面高度：湖盆低于水位，湖岸与树林环带略高于水位。 */
  private oasisFloorHeight(distance: number): number {
    if (distance <= OASIS.lakeRadius) return WATER_LEVEL - OASIS.depth;
    if (distance <= OASIS_WATER_EDGE) {
      return lerp(
        WATER_LEVEL - OASIS.depth,
        WATER_LEVEL + OASIS.shoreHeight,
        smoothstep(OASIS.lakeRadius, OASIS_WATER_EDGE, distance),
      );
    }
    return WATER_LEVEL + OASIS.shoreHeight;
  }

  /** 最近的绿洲中心；超出半径时返回 null。每帧/每顶点最多查 3×3 个缓存单元。 */
  private nearestOasis(x: number, z: number): (OasisSite & { distance: number }) | null {
    const cellX = Math.floor(x / OASIS.cellSize);
    const cellZ = Math.floor(z / OASIS.cellSize);
    const radius = OASIS.radius;

    let best: (OasisSite & { distance: number }) | null = null;
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const site = this.oasisSite(cellX + offsetX, cellZ + offsetZ);
        if (!site) continue;
        const distance = Math.hypot(x - site.x, z - site.z);
        if (distance >= radius) continue;
        if (best === null || distance < best.distance) best = { ...site, distance };
      }
    }

    return best;
  }

  /**
   * 取（并缓存）一个网格单元里的绿洲；null 表示该单元没有绿洲。
   *
   * 每个 5km 单元最多一个绿洲，而且只有 chance 比例的单元会生成，
   * 所以任意 5000×5000m 范围内最多只有一个。
   * 中心在单元中部 3×3 个候选点里选沙丘最低的那个，并避开公路与沙漠过渡带。
   */
  private oasisSite(cx: number, cz: number): OasisSite | null {
    const key = `${cx}:${cz}`;
    const cached = this.oasisCells.get(key);
    if (cached !== undefined) return cached;

    const random = createRandom(mix32(hashChunk(this.seed ^ OASIS_SALT, cx, cz)));
    let site: OasisSite | null = null;

    if (random() < OASIS.chance) {
      const centerX = (cx + 0.5) * OASIS.cellSize;
      const centerZ = (cz + 0.5) * OASIS.cellSize;
      let bestHeight = Number.POSITIVE_INFINITY;

      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
          const x = centerX + offsetX * OASIS.depressionSearch;
          const z = centerZ + offsetZ * OASIS.depressionSearch;
          // 公路沿 x≈0 延伸，保持足够距离，避免湖面把路面淹没。
          if (Math.abs(x) < OASIS.roadClearance) continue;
          // 绿洲只出现在沙漠核心，过渡带里不放湖。
          if (this.desertAt(x, z) < OASIS.minDesert) continue;

          const height = this.duneHeight(x, z);
          if (height < bestHeight) {
            bestHeight = height;
            site = { x, z, radius: OASIS.radius };
          }
        }
      }
    }

    if (this.oasisCells.size > DESERT_CELL_CACHE_LIMIT) this.oasisCells.clear();
    this.oasisCells.set(key, site);
    return site;
  }

  /** 取（并缓存）一个网格单元里的沙漠圆；null 表示该单元没有沙漠。 */
  private desertCell(cx: number, cz: number): DesertCell | null {
    const key = cx * 0x100000 + cz;
    const cached = this.desertCells.get(key);
    if (cached !== undefined) return cached;

    const random = createRandom(mix32(hashChunk(this.seed ^ DESERT_SALT, cx, cz)));
    let cell: DesertCell | null = null;

    if (random() < DESERT.cellChance) {
      const jitter = DESERT.centerJitter;
      cell = {
        centerX: (cx + 0.5 + (random() - 0.5) * jitter) * DESERT.cellSize,
        centerZ: (cz + 0.5 + (random() - 0.5) * jitter) * DESERT.cellSize,
        radius:
          DESERT.radius *
          (1 - DESERT.radiusVariance + random() * DESERT.radiusVariance * 2),
      };
    }

    if (this.desertCells.size > DESERT_CELL_CACHE_LIMIT) this.desertCells.clear();
    this.desertCells.set(key, cell);
    return cell;
  }

  /**
   * 沿道路的保障沙漠：圆心固定在道路附近，间隔为 roadDesertSpacing。
   *
   * 间距 28km、半径约 8km 时，相邻两块沙漠边缘最多相隔约 15km，
   * 因此路上任意位置前后 10km 内一定能遇到沙漠，同时道路一带
   * 不会变成连续的沙海。沙漠半径远小于间距，所以只需查询最近的一个。
   */
  private roadDesertCell(index: number): DesertCell {
    const cached = this.roadDeserts.get(index);
    if (cached) return cached;

    const random = createRandom(mix32(hashChunk(this.seed ^ ROAD_DESERT_SALT, 0, index)));
    const cell: DesertCell = {
      centerX: (random() - 0.5) * 2 * DESERT.roadDesertLateralJitter,
      centerZ:
        (index + 0.5) * DESERT.roadDesertSpacing +
        (random() - 0.5) * 2 * DESERT.roadDesertCenterJitter,
      radius: DESERT.radius + (random() - 0.5) * 2 * DESERT.roadDesertRadiusJitter,
    };

    if (this.roadDeserts.size > DESERT_CELL_CACHE_LIMIT) this.roadDeserts.clear();
    this.roadDeserts.set(index, cell);
    return cell;
  }
}
