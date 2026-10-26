import {
  ROAD_HEIGHT_CACHE_LIMIT,
  ROAD_HEIGHT_SAMPLE_SPACING,
  ROAD_HEIGHT_SAMPLE_STEPS,
  ROAD_MIN_HEIGHT,
} from '../config/world';
import type { Noise2D } from '../math/noise';
import { lerp, smoothstep } from '../math/scalar';

/**
 * 沿着 z 轴延伸、无限生成的小路。
 *
 * 路面高度按整数 z 采样并缓存，再在中间线性插值，避免以“米”为单位取高度
 * 造成走路时的台阶感。
 */
export class RoadTrack {
  private readonly heightCache = new Map<number, number>();
  private readonly rawHeight: (x: number, z: number) => number;

  constructor(
    private readonly noise: Noise2D,
    rawHeight: (x: number, z: number) => number,
  ) {
    this.rawHeight = rawHeight;
  }

  roadX(z: number): number {
    return 90 * this.noise(0.37, z * 0.0022) + 22 * Math.sin(z * 0.0105);
  }

  /** 平滑后的路面高度。 */
  roadHeight(z: number): number {
    const base = Math.floor(z);
    const t = z - base;
    return lerp(this.roadHeightAt(base), this.roadHeightAt(base + 1), t);
  }

  /** 0 = 普通路面，1 = 需要架桥的深谷 / 水面。 */
  bridge(z: number): number {
    return smoothstep(1.6, -0.4, this.rawHeight(this.roadX(z), z));
  }

  private roadHeightAt(k: number): number {
    const cached = this.heightCache.get(k);
    if (cached !== undefined) return cached;

    let sum = 0;
    let samples = 0;
    for (let i = -ROAD_HEIGHT_SAMPLE_STEPS; i <= ROAD_HEIGHT_SAMPLE_STEPS; i++) {
      const z = k + i * ROAD_HEIGHT_SAMPLE_SPACING;
      sum += Math.max(this.rawHeight(this.roadX(z), z), ROAD_MIN_HEIGHT);
      samples++;
    }

    const value = sum / samples;
    if (this.heightCache.size > ROAD_HEIGHT_CACHE_LIMIT) this.heightCache.clear();
    this.heightCache.set(k, value);
    return value;
  }
}
