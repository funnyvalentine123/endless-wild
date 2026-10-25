import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
} from 'three';
import { createRandom } from '../../math/random';
import { mergeGeometries } from '../../render/geometry/mergeGeometries';
import { paintGeometry } from '../../render/geometry/paintGeometry';

export const VEGETATION_KINDS = ['pine', 'broad', 'bush', 'rock', 'flower', 'reed', 'lily'] as const;

export type VegetationKind = (typeof VEGETATION_KINDS)[number];
export type VegetationGeometryMap = Record<VegetationKind, BufferGeometry>;

function translated<T extends BufferGeometry>(geometry: T, x: number, y: number, z: number): T {
  geometry.translate(x, y, z);
  return geometry;
}

function createRockGeometry(): BufferGeometry {
  const rock = paintGeometry(new DodecahedronGeometry(1, 0), 0x8d8a84);
  const positions = rock.getAttribute('position') as BufferAttribute;
  const random = createRandom(5);

  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(
      i,
      positions.getX(i) * (0.8 + random() * 0.3),
      positions.getY(i) * 0.7,
      positions.getZ(i) * (0.8 + random() * 0.3),
    );
  }

  rock.computeVertexNormals();
  return rock;
}

/** 所有植被共享的低模几何体；整个游戏生命周期只创建一次。 */
export class VegetationAssets {
  readonly pine: BufferGeometry;
  readonly broad: BufferGeometry;
  readonly bush: BufferGeometry;
  readonly rock: BufferGeometry;
  readonly flower: BufferGeometry;
  readonly reed: BufferGeometry;
  readonly lily: BufferGeometry;

  constructor() {
    this.pine = mergeGeometries([
      paintGeometry(translated(new CylinderGeometry(0.22, 0.32, 1.8, 6), 0, 0.9, 0), 0x6b4a2b),
      paintGeometry(translated(new ConeGeometry(1.9, 3.0, 7), 0, 2.8, 0), 0x2e6a3a),
      paintGeometry(translated(new ConeGeometry(1.4, 2.5, 7), 0, 4.2, 0), 0x347640),
      paintGeometry(translated(new ConeGeometry(0.9, 1.9, 7), 0, 5.4, 0), 0x3b8247),
    ]);

    this.broad = mergeGeometries([
      paintGeometry(translated(new CylinderGeometry(0.25, 0.38, 2.6, 6), 0, 1.3, 0), 0x77502e),
      paintGeometry(translated(new IcosahedronGeometry(1.9, 0), 0, 3.8, 0), 0x55a03e),
      paintGeometry(translated(new IcosahedronGeometry(1.4, 0), 1.0, 3.1, 0.4), 0x4b9438),
      paintGeometry(translated(new IcosahedronGeometry(1.3, 0), -0.9, 3.4, -0.5), 0x62ad45),
    ]);

    this.bush = mergeGeometries([
      paintGeometry(translated(new IcosahedronGeometry(0.8, 0), 0, 0.45, 0), 0x3f8a3a),
      paintGeometry(translated(new IcosahedronGeometry(0.6, 0), 0.6, 0.35, 0.2), 0x4a9a40),
    ]);

    this.rock = createRockGeometry();

    this.flower = mergeGeometries([
      paintGeometry(translated(new CylinderGeometry(0.03, 0.03, 0.4, 3), 0, 0.2, 0), 0x3d7a2a),
      paintGeometry(translated(new OctahedronGeometry(0.17, 0), 0, 0.45, 0), 0xffffff),
    ]);

    this.reed = mergeGeometries(
      [0, 1, 2, 3].map((i) =>
        paintGeometry(
          translated(
            new ConeGeometry(0.08, 1.3 + i * 0.25, 3),
            Math.cos(i * 1.7) * 0.3,
            0.65 + i * 0.12,
            Math.sin(i * 1.7) * 0.3,
          ),
          0x7c9a3d,
        ),
      ),
    );

    this.lily = paintGeometry(
      translated(new CylinderGeometry(0.7, 0.7, 0.05, 8), 0, 0.06, 0),
      0x3f8f3a,
    );
  }

  geometries(): BufferGeometry[] {
    return [this.pine, this.broad, this.bush, this.rock, this.flower, this.reed, this.lily];
  }

  dispose(): void {
    for (const geometry of this.geometries()) geometry.dispose();
  }
}
