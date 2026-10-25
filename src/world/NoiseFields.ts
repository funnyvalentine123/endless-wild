import { createNoise2D, type Noise2D } from '../math/noise';
import { createRandom } from '../math/random';

/**
 * 一个世界固定拥有的 9 层噪声。
 * 创建顺序和随机消耗顺序必须与原始版本一致，否则同一个种子会生成不同地图。
 */
export class NoiseFields {
  readonly base: Noise2D;
  readonly hill: Noise2D;
  readonly mount: Noise2D;
  readonly lake: Noise2D;
  readonly river: Noise2D;
  readonly warp: Noise2D;
  readonly forest: Noise2D;
  readonly road: Noise2D;
  readonly detail: Noise2D;

  constructor(seed: number) {
    const random = createRandom(seed);
    const next = (): Noise2D => createNoise2D(Math.floor(random() * 1_000_000_000));

    this.base = next();
    this.hill = next();
    this.mount = next();
    this.lake = next();
    this.river = next();
    this.warp = next();
    this.forest = next();
    this.road = next();
    this.detail = next();
  }
}
