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
