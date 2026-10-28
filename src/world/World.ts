import { DESERT_CORE } from '../config/desert';
import { TERRAIN } from '../config/terrain';
import { ROAD_WIDTH, WATER_LEVEL } from '../config/world';
import { lerp, smoothstep } from '../math/scalar';
import type { Biome } from './Biomes';
import { NoiseFields } from './NoiseFields';
import { RoadTrack } from './RoadTrack';
import { TerrainSurface, type OasisInfo, type OasisSite } from './TerrainSurface';

/**
 * 世界采样门面：地形、道路、生物群系之间唯一的组合点。
 *
 * 上层（网格构建、小地图、玩家物理）只通过这里取世界数据，
 * 从而可以独立替换噪声、道路或渲染实现。
 */
export class World {
  readonly seed: number;

  private readonly noise: NoiseFields;
  private readonly surface: TerrainSurface;
  private readonly track: RoadTrack;

  constructor(seed: number) {
    this.seed = seed;
    this.noise = new NoiseFields(seed);
    this.surface = new TerrainSurface(this.noise, seed);
    this.track = new RoadTrack(this.noise.road, (x, z) => this.surface.rawHeight(x, z));
  }

  rawHeight(x: number, z: number): number {
    return this.surface.rawHeight(x, z);
  }

  roadX(z: number): number {
    return this.track.roadX(z);
  }

  roadHeight(z: number): number {
    return this.track.roadHeight(z);
  }

  bridge(z: number): number {
    return this.track.bridge(z);
  }

  /** 与道路融合后的最终地形高度。 */
  height(x: number, z: number): number {
    let height = this.surface.rawHeight(x, z);
    const distance = Math.abs(x - this.roadX(z));
    const blend = 1 - smoothstep(ROAD_WIDTH * 0.5 + 1.2, ROAD_WIDTH * 0.5 + 14, distance);

    if (blend > 0) {
      const bridge = this.bridge(z);
      height = lerp(height, this.roadHeight(z) - 0.12, blend * (1 - bridge));
    }

    return height;
  }

  /** 玩家脚下的支撑高度；在路面范围内至少与路面齐平。 */
  groundAt(x: number, z: number): number {
    let height = this.height(x, z);
    if (Math.abs(x - this.roadX(z)) < ROAD_WIDTH * 0.5 + 0.2) {
      height = Math.max(height, this.roadHeight(z) + 0.05);
    }
    return height;
  }

  forestAt(x: number, z: number): number {
    return this.surface.forestAt(x, z);
  }

  /**
   * 沙漠因子：1 为沙漠核心，0 为普通地形，中间是平滑过渡带。
   * 天气、植被、地表颜色和生物刷新都通过这一个字段渐变。
   */
  desertAt(x: number, z: number): number {
    return this.surface.desertAt(x, z);
  }

  riverAt(x: number, z: number): number {
    return this.surface.riverAt(x, z);
  }

  /** 0–1 的绿洲覆盖因子：湖面与树林台地为 1，边缘平滑衰减到 0。 */
  oasisAt(x: number, z: number): number {
    return this.surface.oasisAt(x, z);
  }

  /** 最近的绿洲信息；不在任何绿洲范围内时返回 null。 */
  oasisInfo(x: number, z: number): OasisInfo | null {
    return this.surface.oasisInfo(x, z);
  }

  /** 与给定矩形相交的所有绿洲。 */
  oasisSitesInRect(minX: number, minZ: number, maxX: number, maxZ: number): OasisSite[] {
    return this.surface.oasisSitesInRect(minX, minZ, maxX, maxZ);
  }

  /**
   * 供植被、动物使用的沙漠生境因子。
   *
   * 绿洲属于“沙漠里的一片绿”，对普通动植物都是可生存的岛屿，但沙漠物种
   * 不会走进绿洲；把绿洲从沙漠因子里扣掉后，两边的生境边界都会自动生效。
   */
  habitatDesertAt(x: number, z: number): number {
    return this.desertAt(x, z) * (1 - this.oasisAt(x, z));
  }

  /** 顶点着色使用的细节噪声。 */
  detailAt(x: number, z: number): number {
    return this.noise.detail(x * 0.03, z * 0.03);
  }

  biomeAt(x: number, z: number): Biome {
    const height = this.surface.rawHeight(x, z);
    if (Math.abs(x - this.roadX(z)) < ROAD_WIDTH * 0.5 + 0.3 && this.bridge(z) > 0.5) return '桥上';
    const river = this.riverAt(x, z);
    const oasis = this.oasisAt(x, z);
    if (height < WATER_LEVEL + 0.2) {
      // 绿洲湖水远离河道，不能按河谷规则判成“河流”。
      if (oasis > 0.5) return '湖泊';
      return river < TERRAIN.river.start ? '河流' : '湖泊';
    }
    if (oasis > 0.5) return '绿洲';
    if (this.desertAt(x, z) > DESERT_CORE) return '沙漠';
    if (river < TERRAIN.river.bank) return '河畔';
    if (height > 42) return '雪山';
    if (height > 20) return '山坡';
    if (this.forestAt(x, z) > 0.18) return '森林';
    return '草原';
  }
}
