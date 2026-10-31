import { DESERT } from '../config/desert';
import { WATER_LEVEL } from '../config/world';
import { createRandom, hashChunk } from '../math/random';
import type { World } from './World';

/** 风蚀岩柱使用独立随机流，避免影响普通植被的既有分布。 */
export const HOODOO_SALT = 0x3b7f21c5;

export interface HoodooSite {
  x: number;
  z: number;
  /** 岩柱底座高度（略低于地表，稳稳插进沙里）。 */
  base: number;
  scale: number;
  sy: number;
  ry: number;
  color: readonly [number, number, number];
}

/**
 * 按 600m 网格计算一根风蚀岩柱：坐标与外形完全由格号决定。
 *
 * 植被撒点与宝石生成共用这一个函数，保证“宝石出现在岩柱附近”时看到的
 * 就是场景里真实存在的那根岩柱，而不是另一套近似规则。
 */
export function hoodooSiteAt(
  world: World,
  seed: number,
  gx: number,
  gz: number,
): HoodooSite | null {
  const spacing = DESERT.hoodooSpacing;
  if ((((2 * gx + gz) % spacing) + spacing) % spacing !== 0) return null;

  const size = DESERT.hoodooCellSize;
  const random = createRandom(hashChunk(seed ^ HOODOO_SALT, gx, gz));
  const x = (gx + 0.2 + random() * 0.6) * size;
  const z = (gz + 0.2 + random() * 0.6) * size;

  const desert = world.habitatDesertAt(x, z);
  if (desert < 0.6) return null;
  const height = world.height(x, z);
  if (height < WATER_LEVEL + 0.5) return null;

  // 底座取周围最低点，避免岩柱悬空。
  const base = Math.min(
    height,
    world.height(x + 2, z),
    world.height(x - 2, z),
    world.height(x, z + 2),
    world.height(x, z - 2),
  );
  const scale = 1.4 + random() * 1.0;
  const sy = scale * (0.95 + random() * 0.45);
  const ry = random() * Math.PI * 2;
  const color: readonly [number, number, number] = [
    0.94 + random() * 0.1,
    0.92 + random() * 0.1,
    0.86 + random() * 0.1,
  ];

  return { x, z, base, scale, sy, ry, color };
}
