import {
  CHUNK_SIZE,
  ROAD_WIDTH,
  VEGETATION_CANDIDATES_PER_CHUNK,
  WATER_LEVEL,
} from '../../config/world';
import { createRandom, hashChunk } from '../../math/random';
import { smoothstep } from '../../math/scalar';
import type { InstanceTransform } from '../../render/instancing';
import type { World } from '../World';
import type { VegetationKind } from '../assets/VegetationAssets';
import type { CircleCollider, ExclusionZone } from './types';

const FLOWER_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.45, 0.5],
  [1, 0.85, 0.3],
  [0.75, 0.55, 1],
  [1, 1, 1],
  [1, 0.6, 0.25],
];

export interface ScatterResult {
  instances: Record<VegetationKind, InstanceTransform[]>;
  colliders: CircleCollider[];
}

/**
 * 在一个 64m 区块内撒植被。
 *
 * 随机流由 (seed, cx, cz) 唯一决定，因此区块可以先加载、后卸载、再加载，
 * 内容始终保持一致。对随机数的消耗顺序必须与原始版本严格相同。
 */
export function scatterVegetation(
  world: World,
  seed: number,
  cx: number,
  cz: number,
  exclusions?: readonly ExclusionZone[],
): ScatterResult {
  const random = createRandom(hashChunk(seed, cx, cz));
  const variance = (amount = 0.12): number => 1 - amount + random() * amount * 2;

  const instances: Record<VegetationKind, InstanceTransform[]> = {
    pine: [],
    broad: [],
    bush: [],
    rock: [],
    flower: [],
    reed: [],
    lily: [],
  };
  const colliders: CircleCollider[] = [];

  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  for (let n = 0; n < VEGETATION_CANDIDATES_PER_CHUNK; n++) {
    const x = originX + (random() - 0.5) * CHUNK_SIZE;
    const z = originZ + (random() - 0.5) * CHUNK_SIZE;

    if (
      exclusions?.some(
        (zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius,
      )
    ) {
      continue;
    }

    const height = world.height(x, z);
    const roadDistance = Math.abs(x - world.roadX(z));
    if (roadDistance < ROAD_WIDTH * 0.5 + 1.5) continue;

    const ry = random() * Math.PI * 2;

    if (height < -0.3) {
      if (height > -3.5 && world.riverAt(x, z) > 0.07 && random() < 0.05) {
        instances.lily.push({
          x,
          y: WATER_LEVEL,
          z,
          ry,
          scale: 0.7 + random() * 0.6,
          color: [variance(), variance(), variance()],
        });
      }
      continue;
    }

    const slope =
      Math.abs(world.height(x + 1, z) - height) + Math.abs(world.height(x, z + 1) - height);
    const forest = world.forestAt(x, z);
    const river = world.riverAt(x, z);

    if (height < 2.5 && river < 0.1 && random() < 0.45) {
      instances.reed.push({
        x,
        y: height - 0.1,
        z,
        ry,
        scale: 0.8 + random() * 0.6,
        color: [variance(), variance(), variance()],
      });
      continue;
    }

    const treeChance = smoothstep(-0.05, 0.4, forest) * 0.8 + 0.035;
    if (height > 1 && height < 40 && slope < 1.3 && random() < treeChance) {
      const scale = 0.75 + random() * 0.85;
      const pine = height > 15 || random() < 0.55;
      // 注意：sy 的随机数必须先于颜色消耗，才能与原始版本的植被分布一致。
      const sy = scale * variance(0.2);
      const tree: InstanceTransform = {
        x,
        y: height - 0.2,
        z,
        ry,
        scale,
        sy,
        color: [variance(), variance(0.15), variance()],
      };

      if (pine) instances.pine.push(tree);
      else instances.broad.push(tree);

      colliders.push({ x, z, radius: 0.45 * scale });
      continue;
    }

    if (random() < 0.05 + (slope > 1.3 ? 0.25 : 0) + (height > 30 ? 0.1 : 0)) {
      const scale = 0.4 + random() * (height > 20 ? 2.6 : 1.4);
      instances.rock.push({
        x,
        y: height - 0.2 * scale,
        z,
        ry,
        pitch: random() * 0.4,
        roll: random() * 0.4,
        scale,
        sy: scale * variance(0.3),
        color: [variance(0.08), variance(0.08), variance(0.08)],
      });

      if (scale > 0.9) colliders.push({ x, z, radius: 0.8 * scale });
      continue;
    }

    if (height > 1 && height < 30 && forest > 0.05 && random() < 0.25) {
      instances.bush.push({
        x,
        y: height - 0.1,
        z,
        ry,
        scale: 0.7 + random() * 0.8,
        color: [variance(), variance(), variance()],
      });
      continue;
    }

    if (height > 1 && height < 22 && forest < 0.12 && random() < 0.5) {
      const color = FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)]!;
      const count = 3 + Math.floor(random() * 5);

      for (let j = 0; j < count; j++) {
        const fx = x + (random() - 0.5) * 3;
        const fz = z + (random() - 0.5) * 3;
        instances.flower.push({
          x: fx,
          y: world.height(fx, fz) - 0.05,
          z: fz,
          ry,
          scale: 0.8 + random() * 0.6,
          color,
        });
      }
    }
  }

  return { instances, colliders };
}
