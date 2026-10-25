import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Scene,
} from 'three';
import { paintGeometry } from '../render/geometry/paintGeometry';
import type { PlayerState } from './Player';

/** 第三人称可见的低模角色，走 / 跑时摆动手脚。 */
export class Hero {
  readonly group = new Group();
  private readonly material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly legLeft: Mesh;
  private readonly legRight: Mesh;
  private readonly armLeft: Mesh;
  private readonly armRight: Mesh;

  constructor(scene: Scene) {
    this.group.add(
      this.part(new BoxGeometry(0.55, 0.7, 0.32), 0xd9573b, 0, 1.15, 0),
      this.part(new IcosahedronGeometry(0.22, 1), 0xf1c9a5, 0, 1.68, 0),
      this.part(new CylinderGeometry(0.27, 0.3, 0.08, 10), 0x6b4a2b, 0, 1.86, 0),
      this.part(new BoxGeometry(0.42, 0.5, 0.2), 0x4c6b3c, 0, 1.18, 0.25),
    );

    this.legLeft = this.limb(0x34405a, -0.14, 0.8, 0.8);
    this.legRight = this.limb(0x34405a, 0.14, 0.8, 0.8);
    this.armLeft = this.limb(0xd9573b, -0.36, 1.45, 0.62);
    this.armRight = this.limb(0xd9573b, 0.36, 1.45, 0.62);

    this.group.visible = false;
    scene.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(state: PlayerState, speed: number): void {
    this.group.position.set(state.x, state.y, state.z);
    this.group.rotation.y = state.yaw;

    const swing = Math.sin(state.phase * 1.2) * Math.min(speed / 8, 1) * 0.7;
    this.legLeft.rotation.x = swing;
    this.legRight.rotation.x = -swing;
    this.armLeft.rotation.x = -swing * 0.8;
    this.armRight.rotation.x = swing * 0.8;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    this.material.dispose();
  }

  private part(geometry: BufferGeometry, hex: number, x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(paintGeometry(geometry, hex), this.material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  private limb(hex: number, x: number, y: number, height: number): Mesh {
    const geometry = new BoxGeometry(0.16, height, 0.16);
    geometry.translate(0, -height / 2, 0);
    const mesh = new Mesh(paintGeometry(geometry, hex), this.material);
    mesh.position.set(x, y, 0);
    this.group.add(mesh);
    return mesh;
  }
}
