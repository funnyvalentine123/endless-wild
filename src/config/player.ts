/** 玩家移动、跳跃与相机跟随的参数。 */
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.35;

export const WALK_SPEED = 8;
export const RUN_SPEED = 17;
export const SWIM_SPEED_FACTOR = 0.45;
export const JUMP_SPEED = 7.5;
export const GRAVITY = 22;

/** 速度倍率：滑杆连续调节的范围，快捷键按预设档位切换。 */
export const SPEED_SCALE_MIN = 0.5;
export const SPEED_SCALE_MAX = 7;
export const SPEED_SCALE_DEFAULT = 1;
export const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7] as const;

export const SWIM_DEPTH = 1.0;
export const SWIM_FLOOR_OFFSET = 1.25;

export const PITCH_MIN = -1.35;
export const PITCH_MAX = 1.2;

export const AUTO_WALK_LOOKAHEAD = 14;
export const AUTO_WALK_TURN_RATE = 2.2;
export const WALK_PHASE_PER_METER = 1.4;

export const CAMERA_GROUND_SMOOTHING = 5;
export const CAMERA_AIR_SMOOTHING = 14;
export const CAMERA_MIN_CLEARANCE = 1.2;

export const THIRD_PERSON_DISTANCE = 7;
export const THIRD_PERSON_HEIGHT = 1.2;
export const THIRD_PERSON_LOOK_DROP = 0.2;
export const THIRD_PERSON_SMOOTHING = 10;
export const THIRD_PERSON_GROUND_CLEARANCE = 0.6;
export const THIRD_PERSON_WATER_CLEARANCE = 0.4;
