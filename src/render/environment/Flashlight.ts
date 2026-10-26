import { SpotLight, type Scene } from 'three';
import {
  FLASHLIGHT_AIM_DISTANCE,
  FLASHLIGHT_ANGLE,
  FLASHLIGHT_DISTANCE,
  FLASHLIGHT_DOWN_TILT,
  FLASHLIGHT_HEIGHT,
  FLASHLIGHT_INTENSITY,
  FLASHLIGHT_PENUMBRA,
} from '../../config/player';
import type { PlayerState } from '../../player/Player';
import type { DaylightSnapshot } from './Daylight';

/**
 * 夜间跟随主角的聚光手电筒。
 * 只用一个不投影的 SpotLight，亮度随入夜程度渐亮，
 * 照到地面形成圆形亮斑，光源开销固定且不随场景规模增长。
 */
export class Flashlight {
  private readonly light: SpotLight;

  constructor(scene: Scene) {
    this.light = new SpotLight(
      0xfff2d2,
      0,
      FLASHLIGHT_DISTANCE,
      FLASHLIGHT_ANGLE,
      FLASHLIGHT_PENUMBRA,
      1,
    );
    this.light.target.position.set(0, 0, -1);
    scene.add(this.light, this.light.target);
  }

  update(daylight: DaylightSnapshot, state: PlayerState): void {
    const night = 1 - daylight.daylightFactor;
    this.light.intensity = FLASHLIGHT_INTENSITY * night;

    const pitch = state.pitch - FLASHLIGHT_DOWN_TILT;
    const cosPitch = Math.cos(pitch);
    const forwardX = -Math.sin(state.yaw) * cosPitch;
    const forwardZ = -Math.cos(state.yaw) * cosPitch;

    const eyeY = state.y + FLASHLIGHT_HEIGHT;
    this.light.position.set(state.x, eyeY, state.z);
    this.light.target.position.set(
      state.x + forwardX * FLASHLIGHT_AIM_DISTANCE,
      eyeY + Math.sin(pitch) * FLASHLIGHT_AIM_DISTANCE,
      state.z + forwardZ * FLASHLIGHT_AIM_DISTANCE,
    );
  }

  dispose(): void {
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.light.dispose();
  }
}
