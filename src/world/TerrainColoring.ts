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
};

const rockBlend = new Color();

/**
 * 给一个地形顶点采样颜色。
 * out 由调用方复用，避免每帧 / 每区块产生大量临时 Color。
 */
export function sampleTerrainColor(
  world: World,
  x: number,
  z: number,
  height: number,
  normalY: number,
  out: Color,
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
  if (height > 42) return [240, 243, 246];
  if (height > 22) return [139, 135, 128];

  const forest = world.forestAt(x, z);
  if (forest > 0.18) return [52, 112, 48];
  if (forest > 0) return [92, 156, 66];
  return [126, 186, 82];
}
