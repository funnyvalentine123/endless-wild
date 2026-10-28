import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
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

export function createVillagerGeometry(): BufferGeometry {
  const head = new IcosahedronGeometry(0.19, 1);
  head.translate(0, 1.5, 0);
  const hat = new CylinderGeometry(0.23, 0.23, 0.07, 8);
  hat.translate(0, 1.69, 0);
  const brim = new CylinderGeometry(0.34, 0.34, 0.035, 8);
  brim.translate(0, 1.65, 0);

  return mergeGeometries([
    box(0.14, 0.7, 0.14, -0.12, 0.35, 0, 0x4a3a2a),
    box(0.14, 0.7, 0.14, 0.12, 0.35, 0, 0x4a3a2a),
    box(0.44, 0.62, 0.28, 0, 1.0, 0, 0x3f6f8f),
    box(0.46, 0.07, 0.3, 0, 0.72, 0, 0x2b2118),
    box(0.12, 0.55, 0.12, -0.29, 1.03, 0, 0x3f6f8f),
    box(0.12, 0.55, 0.12, 0.29, 1.03, 0, 0x3f6f8f),
    paintGeometry(head, 0xe0b48f),
    paintGeometry(hat, 0xc9a45c),
    paintGeometry(brim, 0xb8934e),
  ]);
}

/**
 * 沙漠村民：白色长袍 + 深色坎肩 + 头巾与头箍，保持与普通村民相同的骨架比例。
 */
export function createDesertVillagerGeometry(): BufferGeometry {
  const head = new IcosahedronGeometry(0.19, 1);
  head.translate(0, 1.5, 0);

  const scarfTop = new CylinderGeometry(0.22, 0.24, 0.1, 7);
  scarfTop.translate(0, 1.68, 0);
  const scarfBack = new BoxGeometry(0.16, 0.42, 0.34);
  scarfBack.translate(0, 1.5, -0.06);
  const headband = new CylinderGeometry(0.23, 0.23, 0.055, 8);
  headband.translate(0, 1.63, 0);

  return mergeGeometries([
    box(0.14, 0.62, 0.14, -0.12, 0.31, 0, 0x5a4634),
    box(0.14, 0.62, 0.14, 0.12, 0.31, 0, 0x5a4634),
    // 长袍下摆与腰带
    box(0.5, 0.82, 0.32, 0, 0.85, 0, 0xece2cd),
    box(0.5, 0.06, 0.33, 0, 0.72, 0, 0x8a3b2c),
    // 深色坎肩
    box(0.52, 0.34, 0.34, 0, 1.2, 0, 0x6b4a34),
    box(0.13, 0.52, 0.13, -0.3, 1.04, 0, 0xece2cd),
    box(0.13, 0.52, 0.13, 0.3, 1.04, 0, 0xece2cd),
    paintGeometry(head, 0xd8a67c),
    paintGeometry(scarfTop, 0xf1e9da),
    paintGeometry(scarfBack, 0xe4d8c2),
    paintGeometry(headband, 0x8a3b2c),
    box(0.2, 0.08, 0.1, 0, 1.36, 0.12, 0x4a3428),
  ]);
}
