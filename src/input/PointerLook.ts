import {
  LOOK_SENSITIVITY_DRAG,
  LOOK_SENSITIVITY_POINTER_LOCK,
} from '../config/input';
import { requestPointerLock } from './pointerLock';
import type { LookDelta } from './types';

/**
 * 鼠标视角：优先使用 Pointer Lock，也支持按住拖拽。
 *
 * 大地图 / 天穹大视野打开时不请求 Pointer Lock（要保留光标点关闭按钮），
 * 而是把它们的画布也绑成拖拽表面：按住画面拖动依然可以转向。
 */
export class PointerLook {
  private active = false;
  private allowLock = true;
  private dragging = false;
  private yaw = 0;
  private pitch = 0;
  private readonly surfaces: Array<{ element: HTMLElement; handler: () => void }> = [];

  private readonly handleMouseDown = (): void => {
    if (!this.active) return;

    this.dragging = true;
    if (
      this.allowLock &&
      !this.isTouch &&
      document.pointerLockElement !== this.canvas
    ) {
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

  /** 覆盖层打开时关掉 Pointer Lock 请求，但保留拖拽转向。 */
  setAllowLock(allow: boolean): void {
    this.allowLock = allow;
    if (!allow) this.dragging = false;
  }

  /** 额外支持按住拖拽的表面（大视野里的地图画布）。 */
  bindLookSurface(element: HTMLElement): void {
    const handler = (): void => {
      if (this.active) this.dragging = true;
    };
    element.addEventListener('mousedown', handler);
    this.surfaces.push({ element, handler });
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
    for (const { element, handler } of this.surfaces) {
      element.removeEventListener('mousedown', handler);
    }
    this.surfaces.length = 0;
  }
}
