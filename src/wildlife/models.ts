import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from '../render/geometry/mergeGeometries';
import { paintGeometry } from '../render/geometry/paintGeometry';

function box(
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

function ico(
  radius: number,
  detail: number,
  x: number,
  y: number,
  z: number,
  hex: number,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, detail);
  geometry.scale(scaleX, scaleY, scaleZ);
  geometry.translate(x, y, z);
  return paintGeometry(geometry, hex);
}

function cone(
  radius: number,
  height: number,
  segments: number,
  x: number,
  y: number,
  z: number,
  hex: number,
  rotateX = 0,
): BufferGeometry {
  const geometry = new ConeGeometry(radius, height, segments);
  if (rotateX !== 0) geometry.rotateX(rotateX);
  geometry.translate(x, y, z);
  return paintGeometry(geometry, hex);
}

export function createRabbitGeometry(): BufferGeometry {
  return mergeGeometries([
    ico(0.3, 0, 0, 0.4, 0, 0xa9825b, 1, 0.9, 1.35),
    ico(0.19, 0, 0, 0.57, 0.42, 0xb89066),
    box(0.09, 0.36, 0.09, -0.09, 0.84, 0.44, 0x8a5a3a),
    box(0.09, 0.36, 0.09, 0.09, 0.84, 0.44, 0x8a5a3a),
    ico(0.1, 0, 0, 0.42, -0.4, 0xe7dccb),
    box(0.12, 0.1, 0.3, -0.14, 0.06, 0.18, 0x9a7350),
    box(0.12, 0.1, 0.3, 0.14, 0.06, 0.18, 0x9a7350),
    box(0.12, 0.1, 0.3, -0.14, 0.06, -0.2, 0x9a7350),
    box(0.12, 0.1, 0.3, 0.14, 0.06, -0.2, 0x9a7350),
  ]);
}

export function createSnakeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (let index = 0; index < 7; index++) {
    const t = index / 6;
    const radius = 0.08 + Math.sin(Math.PI * t) * 0.045;
    const x = Math.sin(t * Math.PI * 2) * 0.12;
    parts.push(
      ico(radius, 0, x, 0.12, -0.9 + t * 1.8, index % 2 === 0 ? 0x4e7a38 : 0x3e642c, 1, 0.8, 1.2),
    );
  }

  parts.push(
    ico(0.15, 0, 0.05, 0.16, 1.05, 0x5b8a43, 1, 0.9, 1.2),
    box(0.045, 0.045, 0.045, -0.07, 0.23, 1.13, 0x151515),
    box(0.045, 0.045, 0.045, 0.12, 0.23, 1.1, 0x151515),
    cone(0.09, 0.4, 3, -0.06, 0.1, -1.15, 0x3e642c, -Math.PI / 2),
  );

  return mergeGeometries(parts);
}

export function createCowGeometry(): BufferGeometry {
  return mergeGeometries([
    box(1.2, 0.85, 1.9, 0, 1.0, 0, 0xe8e2d6),
    box(0.9, 0.5, 0.65, 0, 1.02, -0.15, 0x2d2b28),
    box(0.02, 0.45, 0.7, -0.61, 1.05, 0.3, 0x2d2b28),
    box(0.02, 0.4, 0.55, 0.61, 0.92, -0.3, 0x2d2b28),
    box(0.5, 0.55, 0.55, 0, 1.2, 1.18, 0xe8e2d6),
    box(0.34, 0.24, 0.14, 0, 1.04, 1.49, 0xcaa79c),
    box(0.16, 0.1, 0.12, -0.29, 1.35, 1.12, 0xe8e2d6),
    box(0.16, 0.1, 0.12, 0.29, 1.35, 1.12, 0xe8e2d6),
    cone(0.06, 0.24, 4, -0.2, 1.5, 1.12, 0xcfc6ae),
    cone(0.06, 0.24, 4, 0.2, 1.5, 1.12, 0xcfc6ae),
    box(0.18, 0.8, 0.18, -0.42, 0.4, 0.65, 0xe8e2d6),
    box(0.18, 0.8, 0.18, 0.42, 0.4, 0.65, 0xe8e2d6),
    box(0.18, 0.8, 0.18, -0.42, 0.4, -0.65, 0xe8e2d6),
    box(0.18, 0.8, 0.18, 0.42, 0.4, -0.65, 0xe8e2d6),
    box(0.06, 0.6, 0.06, 0, 1.1, -0.98, 0x2d2b28),
  ]);
}

export function createDeerGeometry(): BufferGeometry {
  return mergeGeometries([
    box(0.85, 0.7, 1.55, 0, 1.0, 0, 0x9b6d45),
    box(0.25, 0.55, 0.25, 0, 1.35, 0.66, 0xa77a52),
    box(0.36, 0.3, 0.45, 0, 1.72, 0.92, 0xa77a52),
    box(0.16, 0.1, 0.1, -0.24, 1.85, 0.86, 0x9b6d45),
    box(0.16, 0.1, 0.1, 0.24, 1.85, 0.86, 0x9b6d45),
    box(0.14, 0.95, 0.14, -0.3, 0.48, 0.5, 0x8b5f3b),
    box(0.14, 0.95, 0.14, 0.3, 0.48, 0.5, 0x8b5f3b),
    box(0.14, 0.95, 0.14, -0.3, 0.48, -0.5, 0x8b5f3b),
    box(0.14, 0.95, 0.14, 0.3, 0.48, -0.5, 0x8b5f3b),
    box(0.05, 0.55, 0.05, -0.15, 2.1, 0.88, 0xd8c6a2),
    box(0.05, 0.55, 0.05, 0.15, 2.1, 0.88, 0xd8c6a2),
    box(0.05, 0.24, 0.05, -0.22, 2.2, 0.88, 0xd8c6a2),
    box(0.05, 0.24, 0.05, 0.22, 2.2, 0.88, 0xd8c6a2),
    ico(0.1, 0, 0, 1.1, -0.82, 0xe8e2d6),
  ]);
}

/** 沙漠小蜥蜴：贴地、细长、带一条逐渐变细的尾巴。 */
export function createLizardGeometry(): BufferGeometry {
  return mergeGeometries([
    ico(0.16, 0, 0, 0.1, 0.02, 0xa89058, 0.85, 0.5, 1.5),
    ico(0.09, 0, 0, 0.12, 0.22, 0xbda46a, 1, 0.78, 1.2),
    cone(0.05, 0.48, 4, 0, 0.08, -0.4, 0x937c4d, -Math.PI / 2),
    box(0.05, 0.06, 0.11, -0.15, 0.04, 0.14, 0x8f7748),
    box(0.05, 0.06, 0.11, 0.15, 0.04, 0.14, 0x8f7748),
    box(0.05, 0.06, 0.11, -0.15, 0.04, -0.12, 0x8f7748),
    box(0.05, 0.06, 0.11, 0.15, 0.04, -0.12, 0x8f7748),
    box(0.035, 0.035, 0.035, -0.07, 0.18, 0.29, 0x1c1a16),
    box(0.035, 0.035, 0.035, 0.07, 0.18, 0.29, 0x1c1a16),
  ]);
}

/** 沙漠骆驼：双峰、长腿、长脖子，米黄色皮毛。 */
export function createCamelGeometry(): BufferGeometry {
  return mergeGeometries([
    box(1.0, 0.78, 1.85, 0, 1.62, 0, 0xc9a36a),
    ico(0.46, 0, 0, 2.02, 0.28, 0xbf975e, 1.1, 0.8, 1.1),
    ico(0.4, 0, 0, 1.96, -0.4, 0xb88f57, 1, 0.75, 1),
    box(0.3, 0.95, 0.3, 0, 2.28, 0.72, 0xc9a36a),
    box(0.3, 0.8, 0.28, 0, 2.75, 0.98, 0xc9a36a),
    box(0.36, 0.3, 0.62, 0, 3.0, 1.26, 0xc9a36a),
    box(0.36, 0.2, 0.2, 0, 2.94, 1.58, 0xb08a55),
    box(0.1, 0.1, 0.1, -0.15, 3.1, 1.22, 0x8d6b45),
    box(0.1, 0.1, 0.1, 0.15, 3.1, 1.22, 0x8d6b45),
    box(0.18, 1.4, 0.18, -0.36, 0.7, 0.6, 0xb08a55),
    box(0.18, 1.4, 0.18, 0.36, 0.7, 0.6, 0xb08a55),
    box(0.18, 1.4, 0.18, -0.36, 0.7, -0.62, 0xb08a55),
    box(0.18, 1.4, 0.18, 0.36, 0.7, -0.62, 0xb08a55),
    box(0.06, 0.55, 0.06, 0, 1.45, -0.98, 0x8d6b45),
  ]);
}

export function createFishGeometry(): BufferGeometry {
  return mergeGeometries([
    ico(0.22, 0, 0, 0, 0, 0x5b9bb5, 0.7, 0.5, 1.5),
    cone(0.16, 0.42, 3, 0, 0, -0.42, 0x4a8199, -Math.PI / 2),
    box(0.04, 0.24, 0.3, 0, 0.16, 0.02, 0x4a8199),
    box(0.04, 0.04, 0.04, -0.1, 0.07, 0.27, 0x172126),
    box(0.04, 0.04, 0.04, 0.1, 0.07, 0.27, 0x172126),
  ]);
}

export interface BirdGeometries {
  body: BufferGeometry;
  leftWing: BufferGeometry;
  rightWing: BufferGeometry;
}

export function createBirdGeometries(): BirdGeometries {
  return {
    body: mergeGeometries([
      box(0.26, 0.18, 0.62, 0, 0, 0, 0x3f4a52),
      ico(0.13, 0, 0, 0.04, 0.38, 0x4d5a63),
      cone(0.05, 0.18, 3, 0, 0.04, 0.55, 0xd9a441, Math.PI / 2),
      box(0.18, 0.035, 0.26, 0, 0, -0.4, 0x39434b),
    ]),
    leftWing: box(1.25, 0.045, 0.36, -0.65, 0, 0, 0x4d5a63),
    rightWing: box(1.25, 0.045, 0.36, 0.65, 0, 0, 0x4d5a63),
  };
}
