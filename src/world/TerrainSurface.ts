import { TERRAIN } from '../config/terrain';
import { lerp, smoothstep } from '../math/scalar';
import type { NoiseFields } from './NoiseFields';

/**
 * 不受道路影响的原始地形：山地、丘陵、湖泊、河流与森林分布。
 * 只做数值采样，不依赖 three.js，方便单测。
 */
export class TerrainSurface {
  constructor(private readonly noise: NoiseFields) {}

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

    return height;
  }

  /** 森林密度场，越高越容易长树。 */
  forestAt(x: number, z: number): number {
    return this.noise.forest(x * 0.0045, z * 0.0045) + 0.25 * this.noise.forest(x * 0.02, z * 0.02);
  }
}
