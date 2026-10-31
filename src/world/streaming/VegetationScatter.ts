import {
  CHUNK_SIZE,
  ROAD_WIDTH,
  VEGETATION_CANDIDATES_PER_CHUNK,
  WATER_LEVEL,
} from '../../config/world';
import { DESERT } from '../../config/desert';
import { OASIS, OASIS_WATER_EDGE } from '../../config/oasis';
import { createRandom, hashChunk } from '../../math/random';
import { smoothstep } from '../../math/scalar';
import type { InstanceTransform } from '../../render/instancing';
import type { World } from '../World';
import { hoodooSiteAt } from '../desertLandmarks';
import type { VegetationKind } from '../assets/VegetationAssets';
import type { CircleCollider, ExclusionZone } from './types';

/** 沙漠植被使用独立随机流，避免影响普通地形的既有植被分布。 */
const DESERT_SCATTER_SALT = 0x7d3f9a21;
const ROCK_SALT = 0x5c1d8e43;

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
  const desertRandom = createRandom(hashChunk(seed ^ DESERT_SCATTER_SALT, cx, cz));
  const variance = (amount = 0.12): number => 1 - amount + random() * amount * 2;

  const instances: Record<VegetationKind, InstanceTransform[]> = {
    pine: [],
    broad: [],
    bush: [],
    rock: [],
    flower: [],
    reed: [],
    lily: [],
    cactus: [],
    cactusTall: [],
    cactusBarrel: [],
    hoodoo: [],
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
    // 沙漠因子决定普通植被的稀疏程度；绿洲是沙漠里独立的生境岛，
    // 沙漠物种（仙人掌）不会进去，绿洲自己长出树林与芦苇。
    const desert = world.desertAt(x, z);
    const oasis = world.oasisAt(x, z);
    const habitat = desert * (1 - oasis);
    const wild = 1 - desert;

    if (height < -0.3) {
      if (height > -3.5) {
        if (oasis > 0.3 && random() < 0.07) {
          instances.lily.push({
            x,
            y: WATER_LEVEL,
            z,
            ry,
            scale: 0.7 + random() * 0.7,
            color: [variance(), variance(), variance()],
          });
        } else if (world.riverAt(x, z) > 0.07 && random() < 0.05) {
          instances.lily.push({
            x,
            y: WATER_LEVEL,
            z,
            ry,
            scale: 0.7 + random() * 0.6,
            color: [variance(), variance(), variance()],
          });
        }
      }
      continue;
    }

    const slope =
      Math.abs(world.height(x + 1, z) - height) + Math.abs(world.height(x, z + 1) - height);
    const forest = world.forestAt(x, z);
    const river = world.riverAt(x, z);

    // 绿洲：水岸长芦苇，湖岸之外是一圈小树林；树木只长在平坦的岸台上，
    // 不会顺着沙丘斜坡爬到沙子里。
    if (oasis > 0.25 && height > 0.2) {
      const lush = smoothstep(0.25, 0.6, oasis);
      // 用扰动后的湖岸距离，芦苇与树林带才会贴着弯曲的岸线，而不是围绕正圆排布。
      const waterDistance = world.oasisInfo(x, z)?.waterDistance ?? OASIS.radius;
      if (waterDistance <= OASIS_WATER_EDGE + 20 && height < 2 && random() < 0.3 * lush) {
        instances.reed.push({
          x,
          y: height - 0.1,
          z,
          ry,
          scale: 0.8 + random() * 0.7,
          color: [variance(), variance(), variance()],
        });
        continue;
      }
      // 湖边留出一圈开阔的草岸，树林从岸台外侧才成片长出，
      // 这样从岸上看过去湖面不会被树冠完全挡住，同时也形成“树林环绕湖泊”的轮廓。
      if (
        waterDistance > OASIS_WATER_EDGE + 40 &&
        height < 4.5 &&
        slope < 1.8 &&
        random() < 0.24 * lush
      ) {
        const scale = 0.75 + random() * 0.8;
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
        if (random() < 0.35) instances.pine.push(tree);
        else instances.broad.push(tree);
        colliders.push({ x, z, radius: 0.45 * scale });
        continue;
      }
      if (height < 4.5 && slope < 1.5 && random() < 0.16 * lush) {
        instances.bush.push({
          x,
          y: height - 0.1,
          z,
          ry,
          scale: 0.7 + random() * 0.8,
          color: [variance(), variance(), variance()],
        });
      }
      // 绿洲内部不再生成沙漠植被或普通草地植被。
      continue;
    }

    // 沙漠专属植被：稀疏、多种形态的仙人掌。过渡带里先长草，
    // 沙色明显占优之后才出现仙人掌，避免草地上突兀地立着仙人掌。
    if (habitat > 0.35 && height > 1 && slope < 1.5) {
      const cactusChance = smoothstep(0.35, 0.65, habitat) * DESERT.cactusDensity;
      if (desertRandom() < cactusChance) {
        const pick = desertRandom();
        const kind: VegetationKind =
          pick < 0.42 ? 'cactusBarrel' : pick < 0.68 ? 'cactusTall' : 'cactus';
        const base =
          kind === 'cactusBarrel'
            ? 0.45 + desertRandom() * 0.45
            : kind === 'cactusTall'
              ? 0.7 + desertRandom() * 0.45
              : 0.5 + desertRandom() * 0.7;
        // 高度单独缩放：同一种株型也能长出明显不同的高矮（但保持合理上限）。
        const sy = base * (0.8 + desertRandom() * 0.5);
        const tint = desertRandom();
        instances[kind].push({
          x,
          y: height - 0.05,
          z,
          ry,
          scale: base,
          sy,
          color: [0.9 + tint * 0.18, 0.93 + tint * 0.15, 0.88 + tint * 0.16],
        });
        colliders.push({
          x,
          z,
          radius: (kind === 'cactusBarrel' ? 0.48 : 0.4) * base,
        });
        continue;
      }
    }

    if (wild > 0.25 && height < 2.5 && river < 0.1 && random() < 0.45 * wild) {
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

    const treeChance = (smoothstep(-0.05, 0.4, forest) * 0.8 + 0.035) * wild;
    if (wild > 0.55 && height > 1 && height < 40 && slope < 1.3 && random() < treeChance) {
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

    // 岩石属于地质而不是植被；沙漠里的石头由固定间距网格单独生成，
    // 数量严格可控，不会被 170 个候选点的随机撒点放大。
    const rockChance =
      (0.05 + (slope > 1.3 ? 0.25 : 0) + (height > 30 ? 0.1 : 0)) * wild;
    if (random() < rockChance) {
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

    if (wild > 0.5 && height > 1 && height < 30 && forest > 0.05 && random() < 0.25 * wild) {
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

    if (wild > 0.6 && height > 1 && height < 22 && forest < 0.12 && random() < 0.5 * wild) {
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

  scatterDesertLandmarks(world, seed, cx, cz, instances, colliders, exclusions);

  return { instances, colliders };
}

/**
 * 沙漠里的风蚀岩柱与石头。
 *
 * 不用随机撒点，而是按固定间距的格网生成：每格最多一个、坐标由格号唯一确定，
 * 所以任意窗口内的数量都有上界（岩柱每 1000×1000m ≤3 个，石头 ≤16 个）。
 */
function scatterDesertLandmarks(
  world: World,
  seed: number,
  cx: number,
  cz: number,
  instances: Record<VegetationKind, InstanceTransform[]>,
  colliders: CircleCollider[],
  exclusions?: readonly ExclusionZone[],
): void {
  const half = CHUNK_SIZE / 2;
  const minX = cx * CHUNK_SIZE - half;
  const maxX = cx * CHUNK_SIZE + half;
  const minZ = cz * CHUNK_SIZE - half;
  const maxZ = cz * CHUNK_SIZE + half;

  const blocked = (x: number, z: number): boolean =>
    exclusions?.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius) ?? false;

  // 风蚀岩柱：600m 网格，每 3 格选 1 格，取格内随机点。
  const hoodooSize = DESERT.hoodooCellSize;
  const hoodooFromX = Math.floor(minX / hoodooSize);
  const hoodooToX = Math.ceil(maxX / hoodooSize) - 1;
  const hoodooFromZ = Math.floor(minZ / hoodooSize);
  const hoodooToZ = Math.ceil(maxZ / hoodooSize) - 1;

  for (let gx = hoodooFromX; gx <= hoodooToX; gx++) {
    for (let gz = hoodooFromZ; gz <= hoodooToZ; gz++) {
      const site = hoodooSiteAt(world, seed, gx, gz);
      if (!site) continue;

      const { x, z } = site;
      if (x < minX || x >= maxX || z < minZ || z >= maxZ) continue;
      if (blocked(x, z)) continue;

      // 数量很少，所以每根都做成高大的地标岩柱。
      instances.hoodoo.push({
        x,
        z,
        y: site.base - 0.25 * site.scale,
        ry: site.ry,
        scale: site.scale,
        sy: site.sy,
        color: site.color,
      });
      colliders.push({ x, z, radius: 1.55 * site.scale });
    }
  }

  // 石头：350m 网格，每格最多一个，任意 1000×1000m 内不超过 16 个。
  const rockSize = DESERT.rockCellSize;
  const rockFromX = Math.floor(minX / rockSize);
  const rockToX = Math.ceil(maxX / rockSize) - 1;
  const rockFromZ = Math.floor(minZ / rockSize);
  const rockToZ = Math.ceil(maxZ / rockSize) - 1;

  for (let gx = rockFromX; gx <= rockToX; gx++) {
    for (let gz = rockFromZ; gz <= rockToZ; gz++) {
      const random = createRandom(hashChunk(seed ^ ROCK_SALT, gx, gz));
      if (random() > DESERT.rockCellChance) continue;

      const x = (gx + 0.1 + random() * 0.8) * rockSize;
      const z = (gz + 0.1 + random() * 0.8) * rockSize;
      if (x < minX || x >= maxX || z < minZ || z >= maxZ) continue;
      if (blocked(x, z)) continue;

      if (world.habitatDesertAt(x, z) < 0.55) continue;
      const height = world.height(x, z);
      if (height < WATER_LEVEL + 0.4) continue;

      const scale = 0.6 + random() * 1.5;
      instances.rock.push({
        x,
        y: height - 0.2 * scale,
        z,
        ry: random() * Math.PI * 2,
        pitch: random() * 0.4,
        roll: random() * 0.4,
        scale,
        sy: scale * (0.75 + random() * 0.5),
        color: [0.94 + random() * 0.08, 0.91 + random() * 0.08, 0.85 + random() * 0.08],
      });

      if (scale > 0.9) colliders.push({ x, z, radius: 0.8 * scale });
    }
  }
}
