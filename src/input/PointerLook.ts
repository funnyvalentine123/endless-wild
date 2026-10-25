import {
  LOOK_SENSITIVITY_DRAG,
  LOOK_SENSITIVITY_POINTER_LOCK,
} from '../config/input';
import { requestPointerLock } from './pointerLock';
import type { LookDelta } from './types';

/** 鼠标视角：优先使用 Pointer Lock，也支持按住拖拽。 */
export class PointerLook {
  private active = false;
  private dragging = false;
  private yaw = 0;
  private pitch = 0;

  private readonly handleMouseDown = (): void => {
    if (!this.active) return;

    this.dragging = true;
    if (!this.isTouch && document.pointerLockElement !== this.canvas) {
      requestPointerLock(this.canvas);
    }
  };

  private readonly handleMouseUp = (): void => {
    this.dragging = false;
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      this.yaw += event.movementX * LOOK_SENSITIVITY_POINTER_LOCK;
      this.pitch += event.movementY * LOOK_SENSITIVITY_POINTER_LOCK;
    } else if (this.dragging) {
      this.yaw += event.movementX * LOOK_SENSITIVITY_DRAG;
      this.pitch += event.movementY * LOOK_SENSITIVITY_DRAG;
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly isTouch: boolean,
  ) {
    canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.dragging = false;
  }

  consume(): LookDelta {
    const delta = { yaw: this.yaw, pitch: this.pitch };
    this.yaw = 0;
    this.pitch = 0;
    return delta;
  }

  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }
}
