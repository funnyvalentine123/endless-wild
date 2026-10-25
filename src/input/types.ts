export type InputAction =
  | 'toggle-auto'
  | 'toggle-time'
  | 'toggle-view'
  | 'toggle-map'
  | 'close-map'
  | 'speed-down'
  | 'speed-up';

/** 视角变化量，单位弧度；Player 会把它从当前 yaw / pitch 中减去。 */
export interface LookDelta {
  yaw: number;
  pitch: number;
}

export interface TouchElements {
  joystick: HTMLElement;
  knob: HTMLElement;
  jumpButton: HTMLElement;
}
