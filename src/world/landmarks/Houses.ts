import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Mesh,
  type Material,
} from 'three';
import { CHUNK_SIZE, WATER_LEVEL } from '../../config/world';
import { DESERT_CORE } from '../../config/desert';
import { createRandom, hashChunk, mix32 } from '../../math/random';
import { mergeGeometries } from '../../render/geometry/mergeGeometries';
import { paintGeometry } from '../../render/geometry/paintGeometry';
import type { World } from '../World';

export type HouseStories = 1 | 2;
export type HouseRoofStyle = 'hip' | 'gable';

export interface HousePlacement {
  x: number;
  y: number;
  z: number;
  rotation: number;
  /** 沙漠区域的建筑统一生成帐篷。 */
  tent?: boolean;
}

export interface HouseStyle {
  stories: HouseStories;
  roof: HouseRoofStyle;
  chimney: boolean;
  width: number;
  depth: number;
  roofHeight: number;
  wallColor: number;
  roofColor: number;
  trimColor: number;
  shutterColor: number;
  villagerCount: number;
}

export interface HouseSite {
  x: number;
  y: number;
  z: number;
  rotation: number;
  style: HouseStyle;
  /** 门前活动点，村民围绕这里活动。 */
  doorX: number;
  doorY: number;
  doorZ: number;
  houseRadius: number;
  chimney?: { x: number; y: number; z: number };
  /** 沙漠帐篷：没有烟囱，村民使用阿拉伯风格装扮。 */
  tent?: boolean;
}

export interface HouseBuild {
  mesh: Mesh<BufferGeometry, Material>;
  site: HouseSite;
}

export const HOUSE_CLEAR_RADIUS = 18;
export const HOUSE_COLLIDER_RADIUS = 6.4;

const HOUSE_CHANCE = 0.16;
const HOUSE_SALT = 0x6a09e667;
const HOUSE_VARIANT_SALT = 0x3c6ef372;
const FOOTPRINT = 6;

const WALL_COLORS = [0xe7dcc5, 0xe3cfae, 0xdcc7ae, 0xf0e4d2, 0xd9d2c5] as const;
const ROOF_COLORS = [0xa64b3a, 0x8b4a32, 0x5f6b73, 0x7b5a3b, 0x4f6b57] as const;
const TRIM_COLORS = [0x6b4a2b, 0x7c6a52, 0x4f5a63, 0x6d4b37] as const;
const SHUTTER_COLORS = [0x5c7d67, 0x7a5a44, 0x4f6b85, 0x8a6b4a] as const;

function paintedBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return paintGeometry(geometry, hex);
}

/** 窗户单独合批，夜间用共享发光材质点亮，不参与积雪着色。 */
function windowBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}

function paintedTriangle(
  points: ReadonlyArray<readonly [number, number, number]>,
  hex: number,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(points.flatMap((point) => [point[0], point[1], point[2]]), 3),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geometry.computeVertexNormals();
  return paintGeometry(geometry, hex);
}

function pickColor<T>(colors: readonly T[], random: () => number): T {
  return colors[Math.floor(random() * colors.length)]!;
}

/**
 * 房屋只沿道路附近生成，并必须落在足够平坦、干燥的地面上。
 * 位置由 seed + chunk 坐标唯一确定，所以离开再回来还是同一栋房子。
 */
export function findHousePlacement(
  world: World,
  seed: number,
  cx: number,
  cz: number,
): HousePlacement | null {
  const random = createRandom(hashChunk(seed ^ HOUSE_SALT, cx, cz));
  if (random() > HOUSE_CHANCE) return null;

  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  for (let attempt = 0; attempt < 24; attempt++) {
    const z = originZ + 12 + random() * (CHUNK_SIZE - 24);
    let x: number;

    if (attempt < 10) {
      if (Math.floor(world.roadX(z) / CHUNK_SIZE) !== cx) continue;
      const side = random() < 0.5 ? -1 : 1;
      const distance = 16 + random() * 18;
      x = world.roadX(z) + side * distance;
    } else {
      x = originX + 12 + random() * (CHUNK_SIZE - 24);
      if (Math.abs(x - world.roadX(z)) < 14) continue;
    }

    if (x - FOOTPRINT < originX + 2 || x + FOOTPRINT > originX + CHUNK_SIZE - 2) continue;
    if (z - FOOTPRINT < originZ + 2 || z + FOOTPRINT > originZ + CHUNK_SIZE - 2) continue;

    const heights: number[] = [];
    for (const dx of [-FOOTPRINT, 0, FOOTPRINT]) {
      for (const dz of [-FOOTPRINT, 0, FOOTPRINT]) {
        heights.push(world.groundAt(x + dx, z + dz));
      }
    }

    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    // 留出雨水上涨上限的余量，避免暴雨后房子泡在水里。
    if (minHeight < WATER_LEVEL + 2.9) continue;
    if (maxHeight - minHeight > 1.2) continue;

    const broadHeights: number[] = [];
    for (const radius of [10, 16]) {
      for (let point = 0; point < 8; point++) {
        const angle = (point / 8) * Math.PI * 2;
        broadHeights.push(
          world.groundAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius),
        );
      }
    }
    const broadMin = Math.min(...broadHeights);
    const broadMax = Math.max(...broadHeights);
    if (broadMin < WATER_LEVEL + 2.6) continue;
    if (broadMax - broadMin > 2.6) continue;

    const side = x >= world.roadX(z) ? 1 : -1;
    const rotation = -side * (Math.PI / 2) + (random() - 0.5) * 0.16;
    return {
      x,
      y: maxHeight + 0.02,
      z,
      rotation,
      tent: world.desertAt(x, z) > DESERT_CORE,
    };
  }

  return null;
}

export function createHouse(
  placement: HousePlacement,
  seed: number,
  cx: number,
  cz: number,
  world: World,
  material: Material,
  windowMaterial: Material,
): HouseBuild {
  const random = createRandom(mix32(hashChunk(seed ^ HOUSE_VARIANT_SALT, cx, cz)));
  const wallBottom = 0.2;
  const stories: HouseStories = random() < 0.38 ? 2 : 1;
  const wallHeight = stories === 1 ? 3.6 : 6.2;
  const wallTop = wallBottom + wallHeight;
  const style: HouseStyle = {
    stories,
    roof: random() < 0.55 ? 'hip' : 'gable',
    chimney: random() < 0.72,
    width: 8.6 + random() * 1.2,
    depth: 6.8 + random() * 1.1,
    roofHeight: stories === 1 ? 2.6 + random() * 0.6 : 3.0 + random() * 0.5,
    wallColor: pickColor(WALL_COLORS, random),
    roofColor: pickColor(ROOF_COLORS, random),
    trimColor: pickColor(TRIM_COLORS, random),
    shutterColor: pickColor(SHUTTER_COLORS, random),
    villagerCount: 1 + Math.floor(random() * 3),
  };

  const { width, depth } = style;
  const parts: BufferGeometry[] = [
    paintedBox(width + 1.8, 0.2, depth + 1.8, 0, 0, 0, 0xb49a6a),
    paintedBox(width + 0.8, 1.4, depth + 0.8, 0, -0.5, 0, 0x8d8a84),
    paintedBox(width, wallHeight, depth, 0, wallBottom + wallHeight / 2, 0, style.wallColor),
    paintedBox(1.2, 2.2, 0.16, 0, 1.3, depth / 2 + 0.08, 0x5a3a24),
    paintedBox(1.8, 0.25, 1.0, 0, 0.05, depth / 2 + 1, 0x8d8a84),
  ];

  const windowRows = stories === 1 ? [2.75] : [2.45, 5.05];
  const windowX = width * 0.27;
  const windowParts: BufferGeometry[] = [];
  for (const rowY of windowRows) {
    for (const x of [-windowX, windowX]) {
      windowParts.push(windowBox(0.95, 1.0, 0.12, x, rowY, depth / 2 + 0.07));
      parts.push(
        paintedBox(0.18, 1.12, 0.08, x - 0.62, rowY, depth / 2 + 0.1, style.shutterColor),
        paintedBox(0.18, 1.12, 0.08, x + 0.62, rowY, depth / 2 + 0.1, style.shutterColor),
      );
    }
    for (const z of [-depth * 0.22, depth * 0.22]) {
      windowParts.push(
        windowBox(0.12, 1.0, 0.9, width / 2 + 0.07, rowY, z),
        windowBox(0.12, 1.0, 0.9, -width / 2 - 0.07, rowY, z),
      );
    }
  }

  if (stories === 2) {
    parts.push(
      paintedBox(width + 0.12, 0.16, depth + 0.12, 0, wallBottom + 3.6, 0, style.trimColor),
    );
  }

  if (style.roof === 'hip') {
    const roof = new ConeGeometry((width / 2 + 0.65) * Math.SQRT2, style.roofHeight, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(1, 1, (depth + 0.8) / (width + 0.8));
    roof.translate(0, wallTop + style.roofHeight / 2, 0);
    parts.push(paintGeometry(roof, style.roofColor));
  } else {
    const span = width / 2 + 0.65;
    const angle = Math.atan2(style.roofHeight, span);
    const slabLength = Math.hypot(span, style.roofHeight) + 0.2;

    const right = new BoxGeometry(slabLength, 0.22, depth + 1.0);
    right.rotateZ(-angle);
    right.translate(span / 2, wallTop + style.roofHeight / 2, 0);
    parts.push(paintGeometry(right, style.roofColor));

    const left = new BoxGeometry(slabLength, 0.22, depth + 1.0);
    left.rotateZ(angle);
    left.translate(-span / 2, wallTop + style.roofHeight / 2, 0);
    parts.push(paintGeometry(left, style.roofColor));

    const frontZ = depth / 2 + 0.01;
    const backZ = -depth / 2 - 0.01;
    parts.push(
      paintedTriangle(
        [
          [-width / 2, wallTop, frontZ],
          [width / 2, wallTop, frontZ],
          [0, wallTop + style.roofHeight, frontZ],
        ],
        style.wallColor,
      ),
      paintedTriangle(
        [
          [width / 2, wallTop, backZ],
          [-width / 2, wallTop, backZ],
          [0, wallTop + style.roofHeight, backZ],
        ],
        style.wallColor,
      ),
    );
  }

  let chimneyTopLocalY = 0;
  if (style.chimney) {
    const chimneyX = width * 0.25;
    const chimneyZ = -depth * 0.2;
    const top = wallTop + style.roofHeight + 0.3;
    const bottom = wallTop - 0.2;
    chimneyTopLocalY = top;
    parts.push(
      paintedBox(
        0.7,
        top - bottom,
        0.7,
        chimneyX,
        (top + bottom) / 2,
        chimneyZ,
        0x6d6a66,
      ),
      paintedBox(0.9, 0.14, 0.9, chimneyX, top, chimneyZ, 0x575451),
    );
  }

  const mesh = new Mesh(mergeGeometries(parts), material);
  mesh.position.set(placement.x, placement.y, placement.z);
  mesh.rotation.y = placement.rotation;

  if (windowParts.length > 0) {
    mesh.add(new Mesh(mergeGeometries(windowParts), windowMaterial));
  }

  const frontHomeZ = depth / 2 + 3.2;
  const doorX = placement.x + Math.sin(placement.rotation) * frontHomeZ;
  const doorZ = placement.z + Math.cos(placement.rotation) * frontHomeZ;
  const doorY = world.groundAt(doorX, doorZ);

  let chimney: HouseSite['chimney'];
  if (style.chimney) {
    const localX = width * 0.25;
    const localZ = -depth * 0.2;
    chimney = {
      x:
        placement.x +
        localX * Math.cos(placement.rotation) +
        localZ * Math.sin(placement.rotation),
      y: placement.y + chimneyTopLocalY + 0.12,
      z:
        placement.z -
        localX * Math.sin(placement.rotation) +
        localZ * Math.cos(placement.rotation),
    };
  }

  const site: HouseSite = {
    x: placement.x,
    y: placement.y,
    z: placement.z,
    rotation: placement.rotation,
    style,
    doorX,
    doorY,
    doorZ,
    houseRadius: HOUSE_COLLIDER_RADIUS,
    chimney,
  };

  return { mesh, site };
}
