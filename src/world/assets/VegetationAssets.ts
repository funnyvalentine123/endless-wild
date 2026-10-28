import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
} from 'three';
import { createRandom } from '../../math/random';
import { mergeGeometries } from '../../render/geometry/mergeGeometries';
import { paintGeometry } from '../../render/geometry/paintGeometry';

export const CACTUS_KINDS = ['cactus', 'cactusTall', 'cactusBarrel'] as const;
export type CactusKind = (typeof CACTUS_KINDS)[number];

export const VEGETATION_KINDS = [
  'pine',
  'broad',
  'bush',
  'rock',
  'flower',
  'reed',
  'lily',
  ...CACTUS_KINDS,
  'hoodoo',
] as const;

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
  readonly cactus: BufferGeometry;
  readonly cactusTall: BufferGeometry;
  readonly cactusBarrel: BufferGeometry;
  readonly hoodoo: BufferGeometry;

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

    // 沙漠专属植被：低模仙人掌，主干 + 两条折角手臂。
    const leftArm = new CylinderGeometry(0.1, 0.12, 0.5, 6);
    leftArm.rotateZ(Math.PI / 2);
    leftArm.translate(-0.38, 1.12, 0);

    const rightArm = new CylinderGeometry(0.09, 0.11, 0.44, 6);
    rightArm.rotateZ(Math.PI / 2);
    rightArm.translate(0.34, 1.46, 0);

    this.cactus = mergeGeometries([
      paintGeometry(translated(new CylinderGeometry(0.2, 0.26, 2.0, 7), 0, 1.0, 0), 0x4f7a3e),
      paintGeometry(translated(new ConeGeometry(0.21, 0.3, 7), 0, 2.08, 0), 0x47723a),
      paintGeometry(leftArm, 0x47723a),
      paintGeometry(translated(new CylinderGeometry(0.1, 0.12, 0.66, 6), -0.62, 1.42, 0), 0x47723a),
      paintGeometry(rightArm, 0x44703c),
      paintGeometry(translated(new CylinderGeometry(0.09, 0.11, 0.58, 6), 0.55, 1.68, 0), 0x44703c),
    ]);

    // 高柱仙人掌：更高的主干与错落的手臂，用来打破高度一致感。
    const tallLeft = new CylinderGeometry(0.1, 0.13, 0.62, 6);
    tallLeft.rotateZ(Math.PI / 2);
    tallLeft.translate(-0.52, 1.55, 0);

    const tallRight = new CylinderGeometry(0.09, 0.12, 0.5, 6);
    tallRight.rotateZ(Math.PI / 2);
    tallRight.translate(0.44, 2.25, 0);

    this.cactusTall = mergeGeometries([
      paintGeometry(translated(new CylinderGeometry(0.23, 0.3, 3.5, 7), 0, 1.75, 0), 0x4d7b3b),
      paintGeometry(translated(new ConeGeometry(0.24, 0.42, 7), 0, 3.71, 0), 0x466f36),
      paintGeometry(tallLeft, 0x466f36),
      paintGeometry(translated(new CylinderGeometry(0.1, 0.13, 1.25, 6), -0.85, 2.48, 0), 0x466f36),
      paintGeometry(tallRight, 0x437039),
      paintGeometry(translated(new CylinderGeometry(0.09, 0.12, 0.95, 6), 0.7, 2.7, 0), 0x437039),
    ]);

    // 桶状仙人掌：矮胖的球形，顶部开一朵小黄花，和柱状仙人掌形成对比。
    const barrelBody = new SphereGeometry(0.5, 9, 6);
    barrelBody.scale(0.92, 1.12, 0.92);
    barrelBody.translate(0, 0.55, 0);

    this.cactusBarrel = mergeGeometries([
      paintGeometry(barrelBody, 0x5b8a44),
      paintGeometry(translated(new SphereGeometry(0.16, 6, 4), 0, 1.12, 0), 0xe8b93f),
      paintGeometry(translated(new SphereGeometry(0.1, 5, 4), 0.16, 1.02, 0.06), 0xd94f3d),
    ]);

    // 风蚀岩柱：沙漠里显眼的地标，分层砂岩让远景不再只有沙丘。
    this.hoodoo = mergeGeometries([
      paintGeometry(translated(new CylinderGeometry(1.05, 1.55, 3.1, 7), 0, 1.55, 0), 0xb08a5f),
      paintGeometry(translated(new CylinderGeometry(0.66, 0.98, 2.5, 7), 0, 4.3, 0), 0x9b7649),
      paintGeometry(translated(new CylinderGeometry(0.42, 0.64, 1.9, 6), 0, 6.4, 0), 0xc09a6a),
      paintGeometry(translated(new DodecahedronGeometry(0.75, 0), 0.9, 0.55, 0.35), 0xa8834f),
    ]);
  }

  geometries(): BufferGeometry[] {
    return [
      this.pine,
      this.broad,
      this.bush,
      this.rock,
      this.flower,
      this.reed,
      this.lily,
      this.cactus,
      this.cactusTall,
      this.cactusBarrel,
      this.hoodoo,
    ];
  }

  dispose(): void {
    for (const geometry of this.geometries()) geometry.dispose();
  }
}
