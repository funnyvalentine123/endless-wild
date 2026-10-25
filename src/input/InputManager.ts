import { JOYSTICK_RUN_THRESHOLD } from '../config/input';
import type { PlayerIntent } from '../player/Player';
import { Keyboard } from './Keyboard';
import { PointerLook } from './PointerLook';
import { isTouchDevice, TouchControls } from './TouchControls';
import type { InputAction, LookDelta, TouchElements } from './types';

/**
 * 输入门面：把键盘、鼠标、触摸统一成每帧读取的 PlayerIntent 与视角增量。
 * 快捷键以回调形式抛出，不直接修改游戏状态。
 */
export class InputManager {
  readonly isTouch: boolean;

  private readonly keyboard: Keyboard;
  private readonly pointer: PointerLook;
  private readonly touch: TouchControls | null;

  constructor(
    canvas: HTMLCanvasElement,
    touchElements: TouchElements,
    onAction: (action: InputAction) => void,
  ) {
    this.isTouch = isTouchDevice();
    this.keyboard = new Keyboard(onAction);
    this.pointer = new PointerLook(canvas, this.isTouch);
    this.touch = this.isTouch ? new TouchControls(touchElements, canvas, this.keyboard) : null;
  }

  setActive(active: boolean): void {
    this.keyboard.setActive(active);
    this.pointer.setActive(active);
  }

  getIntent(): PlayerIntent {
    let forward = 0;
    let strafe = 0;

    if (this.keyboard.isDown('KeyW', 'ArrowUp')) forward += 1;
    if (this.keyboard.isDown('KeyS', 'ArrowDown')) forward -= 1;
    if (this.keyboard.isDown('KeyD', 'ArrowRight')) strafe += 1;
    if (this.keyboard.isDown('KeyA', 'ArrowLeft')) strafe -= 1;

    const axis = this.touch?.getAxis() ?? { x: 0, y: 0 };
    forward -= axis.y;
    strafe += axis.x;

    return {
      forward,
      strafe,
      run:
        this.keyboard.isDown('ShiftLeft', 'ShiftRight') ||
        Math.hypot(axis.x, axis.y) > JOYSTICK_RUN_THRESHOLD,
      jump: this.keyboard.isDown('Space'),
    };
  }

  consumeLook(): LookDelta {
    const pointer = this.pointer.consume();
    const touch = this.touch?.consumeLook() ?? { yaw: 0, pitch: 0 };
    return { yaw: pointer.yaw + touch.yaw, pitch: pointer.pitch + touch.pitch };
  }

  dispose(): void {
    this.touch?.dispose();
    this.pointer.dispose();
    this.keyboard.dispose();
  }
}
