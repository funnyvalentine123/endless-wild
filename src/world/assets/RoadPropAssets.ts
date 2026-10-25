import { BoxGeometry, BufferGeometry, CylinderGeometry } from 'three';
import { paintGeometry } from '../../render/geometry/paintGeometry';

function translated<T extends BufferGeometry>(geometry: T, x: number, y: number, z: number): T {
  geometry.translate(x, y, z);
  return geometry;
}

/** 道路附属设施的低模几何体；实例化后重复使用。 */
export class RoadPropAssets {
  readonly post: BufferGeometry;
  readonly rail: BufferGeometry;
  readonly pillar: BufferGeometry;
  readonly lampPost: BufferGeometry;
  readonly lampHead: BufferGeometry;

  constructor() {
    this.post = paintGeometry(translated(new BoxGeometry(0.22, 1.2, 0.22), 0, 0.6, 0), 0x7a5634);
    this.rail = paintGeometry(new BoxGeometry(0.14, 0.14, 1), 0x8a6640);
    this.pillar = paintGeometry(translated(new CylinderGeometry(0.5, 0.6, 1, 8), 0, -0.5, 0), 0x9a958c);
    this.lampPost = paintGeometry(translated(new CylinderGeometry(0.08, 0.12, 3.6, 5), 0, 1.8, 0), 0x3a3631);
    this.lampHead = translated(new BoxGeometry(0.45, 0.5, 0.45), 0, 3.8, 0);
  }

  dispose(): void {
    this.post.dispose();
    this.rail.dispose();
    this.pillar.dispose();
    this.lampPost.dispose();
    this.lampHead.dispose();
  }
}
