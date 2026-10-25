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
  CLOUD_WEATHER_COUNT,
} from '../../config/render';
import { createRandom } from '../../math/random';
import { mergeGeometries } from '../geometry/mergeGeometries';

/** 低模积云：围绕玩家漂移，超出范围后从另一侧循环。 */
export class Clouds {
  private readonly group = new Group();
  private readonly weatherClouds: Mesh[] = [];
  private weatherAmount = 0;
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

    for (let i = 0; i < CLOUD_COUNT + CLOUD_WEATHER_COUNT; i++) {
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
      if (i >= CLOUD_COUNT) {
        cloud.visible = false;
        this.weatherClouds.push(cloud);
      }
      this.group.add(cloud);
    }

    scene.add(this.group);
  }

  update(dt: number, playerX: number, playerZ: number): void {
    const drift = CLOUD_DRIFT_SPEED * (1 + this.weatherAmount * 1.2);
    for (const cloud of this.group.children) {
      cloud.position.x += dt * drift;

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

  /** 坏天气：增加预分配的云、压暗云色并加快漂移。 */
  setWeather(amount: number): void {
    const p = Math.max(0, Math.min(1, amount));
    this.weatherAmount = p;

    const visible = Math.round(this.weatherClouds.length * p);
    for (let i = 0; i < this.weatherClouds.length; i++) {
      this.weatherClouds[i].visible = i < visible;
    }

    this.material.color.setRGB(1 - 0.42 * p, 1 - 0.43 * p, 1 - 0.38 * p);
    this.material.opacity = 0.92 + 0.08 * p;
    this.material.emissiveIntensity = 0.55 * (1 - 0.45 * p);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    this.material.dispose();
  }
}
