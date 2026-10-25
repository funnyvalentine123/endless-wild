import {
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Scene,
} from 'three';
import {
  CLOUD_COUNT,
  CLOUD_DRIFT_SPEED,
  CLOUD_HEIGHT_MIN,
  CLOUD_HEIGHT_RANGE,
  CLOUD_SPREAD,
} from '../../config/render';
import { createRandom } from '../../math/random';
import { mergeGeometries } from '../geometry/mergeGeometries';

/** 低模积云：围绕玩家漂移，超出范围后从另一侧循环。 */
export class Clouds {
  private readonly group = new Group();
  private readonly material: MeshLambertMaterial = new MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.92,
    fog: false,
    flatShading: true,
  });

  constructor(private readonly scene: Scene) {
    const random = createRandom(99);

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const parts: BufferGeometry[] = [];
      const count = 4 + Math.floor(random() * 4);

      for (let k = 0; k < count; k++) {
        const geometry = new IcosahedronGeometry(6 + random() * 7, 0);
        geometry.translate(k * 8 - count * 4 + random() * 4, random() * 3, random() * 8 - 4);
        parts.push(geometry);
      }

      const cloud = new Mesh(mergeGeometries(parts), this.material);
      cloud.scale.y = 0.55;
      cloud.position.set(
        (random() - 0.5) * 900,
        CLOUD_HEIGHT_MIN + random() * CLOUD_HEIGHT_RANGE,
        (random() - 0.5) * 900,
      );

      for (const part of parts) part.dispose();
      this.group.add(cloud);
    }

    scene.add(this.group);
  }

  update(dt: number, playerX: number, playerZ: number): void {
    for (const cloud of this.group.children) {
      cloud.position.x += dt * CLOUD_DRIFT_SPEED;

      const dx = cloud.position.x - playerX;
      const dz = cloud.position.z - playerZ;
      if (dx > CLOUD_SPREAD) cloud.position.x -= CLOUD_SPREAD * 2;
      else if (dx < -CLOUD_SPREAD) cloud.position.x += CLOUD_SPREAD * 2;
      if (dz > CLOUD_SPREAD) cloud.position.z -= CLOUD_SPREAD * 2;
      else if (dz < -CLOUD_SPREAD) cloud.position.z += CLOUD_SPREAD * 2;
    }
  }

  setEmissive(color: Color): void {
    this.material.emissive.copy(color);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    this.material.dispose();
  }
}
