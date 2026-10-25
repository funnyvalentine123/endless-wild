import { TERRAIN } from '../config/terrain';
import { ROAD_WIDTH, WATER_LEVEL } from '../config/world';
import { lerp, smoothstep } from '../math/scalar';
import type { Biome } from './Biomes';
import { NoiseFields } from './NoiseFields';
import { RoadTrack } from './RoadTrack';
import { TerrainSurface } from './TerrainSurface';

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
    this.surface = new TerrainSurface(this.noise);
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

  riverAt(x: number, z: number): number {
    return this.surface.riverAt(x, z);
  }

  /** 顶点着色使用的细节噪声。 */
  detailAt(x: number, z: number): number {
    return this.noise.detail(x * 0.03, z * 0.03);
  }

  biomeAt(x: number, z: number): Biome {
    const height = this.surface.rawHeight(x, z);
    if (Math.abs(x - this.roadX(z)) < ROAD_WIDTH * 0.5 + 0.3 && this.bridge(z) > 0.5) return '桥上';
    const river = this.riverAt(x, z);
    if (height < WATER_LEVEL + 0.2) return river < TERRAIN.river.start ? '河流' : '湖泊';
    if (river < TERRAIN.river.bank) return '河畔';
    if (height > 42) return '雪山';
    if (height > 20) return '山坡';
    if (this.forestAt(x, z) > 0.18) return '森林';
    return '草原';
  }
}
