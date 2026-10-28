import { Color } from 'three';
import { ROAD_WIDTH, WATER_LEVEL } from '../config/world';
import { smoothstep } from '../math/scalar';
import type { World } from './World';

const PALETTE = {
  deep: new Color(0x8c7f5c),
  sand: new Color(0xdcc98f),
  grass: new Color(0x74b34c),
  grass2: new Color(0x9cc65a),
  forest: new Color(0x3d7a34),
  rock: new Color(0x8b8780),
  rock2: new Color(0x6c6762),
  snow: new Color(0xf2f5f8),
  dirt: new Color(0xa08559),
  /** 沙漠地表：谷底暖暗、丘脊泛白，让沙丘的高度差在平视时也看得出来。 */
  desert: new Color(0xe7cb93),
  desert2: new Color(0xc9a063),
  desertLight: new Color(0xf6e4b8),
  /** 绿洲：比普通草地更深、更饱和，在沙色里一眼就能认出来。 */
  oasis: new Color(0x4f9e3f),
  oasisDeep: new Color(0x2f7432),
};

const rockBlend = new Color();
const desertBlend = new Color();
const oasisBlendColor = new Color();
const DESERT_MAP_COLOR = [228, 199, 138] as const;
const OASIS_MAP_COLOR = [44, 128, 56] as const;

/**
 * 给一个地形顶点采样颜色。
 * out 由调用方复用，避免每帧 / 每区块产生大量临时 Color。
 * desert 可由调用方传入，避免重复采样沙漠因子。
 */
export function sampleTerrainColor(
  world: World,
  x: number,
  z: number,
  height: number,
  normalY: number,
  out: Color,
  desert = world.desertAt(x, z),
): Color {
  const detail = world.detailAt(x, z);

  if (height < -0.2) return out.copy(PALETTE.sand).lerp(PALETTE.deep, smoothstep(-0.2, -3, height));
  if (height < 0.9 + detail * 0.4) return out.copy(PALETTE.sand);

  out.copy(PALETTE.grass).lerp(PALETTE.grass2, smoothstep(-0.4, 0.6, detail));
  out.lerp(PALETTE.forest, smoothstep(0.0, 0.35, world.forestAt(x, z)) * 0.85);
  out.lerp(PALETTE.sand, smoothstep(1.6, 0.9, height));

  const rockAmount = Math.max(
    smoothstep(0.84, 0.66, normalY),
    smoothstep(24, 38, height + detail * 4) * 0.8,
  );
  rockBlend.copy(PALETTE.rock).lerp(PALETTE.rock2, smoothstep(-0.5, 0.5, detail));
  out.lerp(rockBlend, rockAmount);

  out.lerp(
    PALETTE.snow,
    smoothstep(40, 48, height + detail * 4) * smoothstep(0.55, 0.78, normalY),
  );

  // 沙质地表：在过渡带里随沙漠因子逐渐覆盖草/林颜色，完成自然渐变。
  if (desert > 0) {
    const crest = smoothstep(14, 30, height);
    const trough = 1 - smoothstep(7, 16, height);
    const steep = 1 - smoothstep(0.7, 0.96, normalY);
    desertBlend
      .copy(PALETTE.desert)
      .lerp(PALETTE.desert2, trough * 0.75 + smoothstep(-0.6, 0.6, detail) * 0.15 + steep * 0.35);
    desertBlend.lerp(PALETTE.desertLight, crest * 0.7);
    out.lerp(desertBlend, desert);
  }

  // 绿洲：沙丘之间的一片深绿，边缘与沙地平滑过渡。
  const oasis = world.oasisAt(x, z);
  if (oasis > 0) {
    oasisBlendColor
      .copy(PALETTE.oasis)
      .lerp(PALETTE.oasisDeep, smoothstep(-0.6, 0.6, detail) * 0.55);
    out.lerp(oasisBlendColor, smoothstep(0, 0.45, oasis));
  }

  const roadDistance = Math.abs(x - world.roadX(z));
  if (roadDistance < ROAD_WIDTH * 0.5 + 3) {
    out.lerp(
      PALETTE.dirt,
      smoothstep(ROAD_WIDTH * 0.5 + 3, ROAD_WIDTH * 0.5 + 0.5, roadDistance) * (1 - world.bridge(z)),
    );
  }

  return out;
}

/** 小地图使用的纯色分类，保持与地形视觉一致的色系。 */
export function sampleMapColor(world: World, x: number, z: number): readonly [number, number, number] {
  const height = world.height(x, z);
  if (height < WATER_LEVEL) return [58, 140, 196];
  if (height < 0.9) return [220, 201, 143];

  const desert = world.desertAt(x, z);
  const base = mapBaseColor(world, x, z, height);
  const oasis = world.oasisAt(x, z);
  const sand = desert <= 0 ? base : blendColor(base, DESERT_MAP_COLOR, desert);
  if (oasis <= 0) return sand;
  // 小地图上绿洲保持一块清晰的绿色，便于远距离辨认。
  return blendColor(sand, OASIS_MAP_COLOR, smoothstep(0, 0.4, oasis));
}

function blendColor(
  base: readonly [number, number, number],
  target: readonly [number, number, number],
  amount: number,
): readonly [number, number, number] {
  return [
    Math.round(base[0] + (target[0] - base[0]) * amount),
    Math.round(base[1] + (target[1] - base[1]) * amount),
    Math.round(base[2] + (target[2] - base[2]) * amount),
  ];
}

function mapBaseColor(
  world: World,
  x: number,
  z: number,
  height: number,
): readonly [number, number, number] {
  if (height > 42) return [240, 243, 246];
  if (height > 22) return [139, 135, 128];

  const forest = world.forestAt(x, z);
  if (forest > 0.18) return [52, 112, 48];
  if (forest > 0) return [92, 156, 66];
  return [126, 186, 82];
}
