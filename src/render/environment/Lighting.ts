import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  type Scene,
} from 'three';
import { SUN_DISTANCE } from '../../config/daynight';
import type { DaylightSnapshot } from './Daylight';

/** 半球光 + 太阳/月亮平行光 + 极弱环境光。 */
export class Lighting {
  private readonly hemi: HemisphereLight;
  private readonly sun: DirectionalLight;
  private readonly ambient: AmbientLight;

  constructor(private readonly scene: Scene) {
    this.hemi = new HemisphereLight(0xcfe8ff, 0x4a5a2a, 0.9);
    this.sun = new DirectionalLight(0xfff1d6, 2.2);
    this.ambient = new AmbientLight(0xffffff, 0.12);

    scene.add(this.hemi, this.sun, this.sun.target, this.ambient);
  }

  apply(daylight: DaylightSnapshot, x: number, y: number, z: number): void {
    const direction = daylight.sunDirection;

    this.sun.color.copy(daylight.sunColor);
    this.sun.intensity = daylight.sunIntensity;
    this.sun.position.set(
      x + direction.x * SUN_DISTANCE,
      y + direction.y * SUN_DISTANCE,
      z + direction.z * SUN_DISTANCE,
    );
    this.sun.target.position.set(x, y, z);

    this.hemi.color.copy(daylight.hemiColor);
    this.hemi.intensity = daylight.hemiIntensity;
  }

  /** 雨雪天在昼夜光照基础上再压暗；由 apply 之后调用，避免逐帧累积。 */
  setWeatherDim(dim: number): void {
    this.sun.intensity *= dim;
    this.hemi.intensity *= dim;
  }

  dispose(): void {
    this.scene.remove(this.hemi, this.sun, this.sun.target, this.ambient);
    this.hemi.dispose();
    this.sun.dispose();
  }
}
