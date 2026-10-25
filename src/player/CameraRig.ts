import { Vector3, type PerspectiveCamera } from 'three';
import {
  CAMERA_AIR_SMOOTHING,
  CAMERA_GROUND_SMOOTHING,
  CAMERA_MIN_CLEARANCE,
  EYE_HEIGHT,
  THIRD_PERSON_DISTANCE,
  THIRD_PERSON_GROUND_CLEARANCE,
  THIRD_PERSON_HEIGHT,
  THIRD_PERSON_LOOK_DROP,
  THIRD_PERSON_SMOOTHING,
  THIRD_PERSON_WATER_CLEARANCE,
} from '../config/player';
import { WATER_LEVEL } from '../config/world';
import type { World } from '../world/World';
import type { PlayerState } from './Player';

const camTarget = new Vector3();
const camPosition = new Vector3();

/**
 * 第一 / 第三人称相机。
 * 视线高度做指数平滑，吸收地表小起伏；跳跃时跟随更紧，避免动作发飘。
 */
export class CameraRig {
  private smoothedEyeY: number | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly world: World,
  ) {}

  update(state: PlayerState, started: boolean, thirdPerson: boolean, dt: number): void {
    const targetEyeY = state.y + EYE_HEIGHT;

    if (this.smoothedEyeY === null || !started) {
      this.smoothedEyeY = targetEyeY;
    } else {
      const rate = state.grounded ? CAMERA_GROUND_SMOOTHING : CAMERA_AIR_SMOOTHING;
      this.smoothedEyeY += (targetEyeY - this.smoothedEyeY) * (1 - Math.exp(-rate * dt));
      this.smoothedEyeY = Math.max(this.smoothedEyeY, state.y + CAMERA_MIN_CLEARANCE);
    }

    const eyeX = state.x;
    const eyeY = this.smoothedEyeY;
    const eyeZ = state.z;

    const forwardX = -Math.sin(state.yaw) * Math.cos(state.pitch);
    const forwardY = Math.sin(state.pitch);
    const forwardZ = -Math.cos(state.yaw) * Math.cos(state.pitch);

    if (!thirdPerson) {
      this.camera.position.set(eyeX, eyeY, eyeZ);
      this.camera.lookAt(eyeX + forwardX, eyeY + forwardY, eyeZ + forwardZ);
      return;
    }

    camPosition.set(
      eyeX - forwardX * THIRD_PERSON_DISTANCE,
      eyeY + THIRD_PERSON_HEIGHT - forwardY * THIRD_PERSON_DISTANCE,
      eyeZ - forwardZ * THIRD_PERSON_DISTANCE,
    );
    camPosition.y = Math.max(
      camPosition.y,
      this.world.groundAt(camPosition.x, camPosition.z) + THIRD_PERSON_GROUND_CLEARANCE,
      WATER_LEVEL + THIRD_PERSON_WATER_CLEARANCE,
    );

    this.camera.position.lerp(camPosition, Math.min(1, dt * THIRD_PERSON_SMOOTHING));
    camTarget.set(eyeX, eyeY - THIRD_PERSON_LOOK_DROP, eyeZ);
    this.camera.lookAt(camTarget);
  }
}
