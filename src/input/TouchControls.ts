import { LOOK_SENSITIVITY_TOUCH } from '../config/input';
import type { Keyboard } from './Keyboard';
import type { LookDelta, TouchElements } from './types';

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** 左下摇杆 + 右侧跳跃按钮 + 空白处拖动视角。 */
export class TouchControls {
  private joystickX = 0;
  private joystickY = 0;
  private joystickId: number | null = null;
  private lookId: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private lookYaw = 0;
  private lookPitch = 0;

  private readonly handleTouchStart = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      const rect = this.elements.joystick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      if (
        this.joystickId === null &&
        Math.hypot(touch.clientX - centerX, touch.clientY - centerY) < rect.width
      ) {
        this.joystickId = touch.identifier;
        this.moveJoystick(touch);
      } else if (this.lookId === null && touch.target === this.canvas) {
        this.lookId = touch.identifier;
        this.lookX = touch.clientX;
        this.lookY = touch.clientY;
      }
    }
  };

  private readonly handleTouchMove = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier === this.joystickId) {
        this.moveJoystick(touch);
      } else if (touch.identifier === this.lookId) {
        this.lookYaw += (touch.clientX - this.lookX) * LOOK_SENSITIVITY_TOUCH;
        this.lookPitch += (touch.clientY - this.lookY) * LOOK_SENSITIVITY_TOUCH;
        this.lookX = touch.clientX;
        this.lookY = touch.clientY;
      }
    }
  };

  private readonly handleTouchEnd = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier === this.joystickId) {
        this.joystickId = null;
        this.joystickX = 0;
        this.joystickY = 0;
        this.elements.knob.style.transform = '';
      }
      if (touch.identifier === this.lookId) this.lookId = null;
    }
  };

  private readonly handleJumpStart = (event: TouchEvent): void => {
    event.preventDefault();
    this.keyboard.pressVirtual('Space');
  };

  private readonly handleJumpEnd = (): void => {
    this.keyboard.releaseVirtual('Space');
  };

  constructor(
    private readonly elements: TouchElements,
    private readonly canvas: HTMLCanvasElement,
    private readonly keyboard: Keyboard,
  ) {
    document.body.classList.add('touch');
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('touchend', this.handleTouchEnd);
    window.addEventListener('touchcancel', this.handleTouchEnd);
    elements.jumpButton.addEventListener('touchstart', this.handleJumpStart, { passive: false });
    elements.jumpButton.addEventListener('touchend', this.handleJumpEnd);
    elements.jumpButton.addEventListener('touchcancel', this.handleJumpEnd);
  }

  getAxis(): Readonly<{ x: number; y: number }> {
    return { x: this.joystickX, y: this.joystickY };
  }

  consumeLook(): LookDelta {
    const delta = { yaw: this.lookYaw, pitch: this.lookPitch };
    this.lookYaw = 0;
    this.lookPitch = 0;
    return delta;
  }

  dispose(): void {
    document.body.classList.remove('touch');
    window.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('touchcancel', this.handleTouchEnd);
    this.elements.jumpButton.removeEventListener('touchstart', this.handleJumpStart);
    this.elements.jumpButton.removeEventListener('touchend', this.handleJumpEnd);
    this.elements.jumpButton.removeEventListener('touchcancel', this.handleJumpEnd);
    this.elements.knob.style.transform = '';
    this.keyboard.releaseVirtual('Space');
  }

  private moveJoystick(touch: Touch): void {
    const rect = this.elements.joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const max = rect.width / 2;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const length = Math.hypot(dx, dy);

    if (length > max) {
      dx *= max / length;
      dy *= max / length;
    }

    this.joystickX = dx / max;
    this.joystickY = dy / max;
    this.elements.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
