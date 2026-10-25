import {
  GRAVITY,
  AUTO_WALK_LOOKAHEAD,
  AUTO_WALK_TURN_RATE,
  JUMP_SPEED,
  PITCH_MAX,
  PITCH_MIN,
  RUN_SPEED,
  SPEED_PRESETS,
  SPEED_SCALE_DEFAULT,
  SPEED_SCALE_MAX,
  SPEED_SCALE_MIN,
  SWIM_DEPTH,
  SWIM_FLOOR_OFFSET,
  SWIM_SPEED_FACTOR,
  WALK_PHASE_PER_METER,
  WALK_SPEED,
} from '../config/player';
import { WATER_LEVEL } from '../config/world';
import { angularDifference } from '../math/angle';
import { clamp } from '../math/scalar';
import type { World } from '../world/World';
import { findRoadSpawn } from '../world/spawn';

export interface PlayerIntent {
  forward: number;
  strafe: number;
  run: boolean;
  jump: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  walked: number;
  phase: number;
}

export interface CollisionResolver {
  resolveCollisions(x: number, z: number): readonly [number, number];
}

/**
 * 玩家状态与物理。完全不碰 three.js：
 * 输入层给 intent，世界层给高度/碰撞，这里只负责位移、跳跃和游泳。
 */
export class Player {
  readonly state: PlayerState;
  private speedScaleValue = SPEED_SCALE_DEFAULT;
  private waterLevelValue = WATER_LEVEL;

  constructor(
    private readonly world: World,
    private readonly collisions: CollisionResolver,
  ) {
    const spawn = findRoadSpawn(world);
    this.state = {
      x: spawn.x,
      y: world.groundAt(spawn.x, spawn.z),
      z: spawn.z,
      vy: 0,
      yaw: 0,
      pitch: -0.05,
      grounded: true,
      walked: 0,
      phase: 0,
    };
  }

  /** 累加视角变化（弧度）。 */
  applyLook(yawDelta: number, pitchDelta: number): void {
    this.state.yaw -= yawDelta;
    this.state.pitch = clamp(this.state.pitch - pitchDelta, PITCH_MIN, PITCH_MAX);
  }

  /** 当前移动速度倍率。 */
  get speedScale(): number {
    return this.speedScaleValue;
  }

  /** 设置移动速度倍率，返回夹紧到合法范围后的值。 */
  setSpeedScale(scale: number): number {
    this.speedScaleValue = clamp(scale, SPEED_SCALE_MIN, SPEED_SCALE_MAX);
    return this.speedScaleValue;
  }

  /** 在预设档位间加速（1）或减速（-1），返回新的倍率。 */
  stepSpeedScale(direction: -1 | 1): number {
    const current = this.speedScaleValue;
    const target =
      direction > 0
        ? SPEED_PRESETS.find((preset) => preset > current + 0.001)
        : [...SPEED_PRESETS].reverse().find((preset) => preset < current - 0.001);

    return this.setSpeedScale(target ?? current);
  }

  /** 雨天水位会上涨，游泳判定跟随动态水面而不是固定常量。 */
  setWaterLevel(level: number): void {
    this.waterLevelValue = level;
  }

  /** 返回本帧水平移动速度（米/秒），用于角色动画。 */
  update(dt: number, intent: PlayerIntent, autoWalk: boolean): number {
    const state = this.state;
    let forward = intent.forward;
    let strafe = intent.strafe;

    if (autoWalk) {
      const direction = -Math.cos(state.yaw) <= 0 ? -1 : 1;
      const targetZ = state.z + direction * AUTO_WALK_LOOKAHEAD;
      const targetX = this.world.roadX(targetZ);
      const wantedYaw = Math.atan2(-(targetX - state.x), -(targetZ - state.z));
      state.yaw +=
        angularDifference(state.yaw, wantedYaw) *
        Math.min(1, dt * AUTO_WALK_TURN_RATE * this.speedScaleValue);
      forward = Math.max(forward, 1);
    }

    const ground = this.world.groundAt(state.x, state.z);
    const swimming = ground < this.waterLevelValue - SWIM_DEPTH;
    const speed =
      (intent.run ? RUN_SPEED : WALK_SPEED) *
      (swimming ? SWIM_SPEED_FACTOR : 1) *
      this.speedScaleValue;

    const length = Math.hypot(forward, strafe);
    if (length > 1) {
      forward /= length;
      strafe /= length;
    }

    const sinYaw = Math.sin(state.yaw);
    const cosYaw = Math.cos(state.yaw);
    const velocityX = (-sinYaw * forward + cosYaw * strafe) * speed;
    const velocityZ = (-cosYaw * forward - sinYaw * strafe) * speed;

    const previousX = state.x;
    const previousZ = state.z;
    state.x += velocityX * dt;
    state.z += velocityZ * dt;

    const [resolvedX, resolvedZ] = this.collisions.resolveCollisions(state.x, state.z);
    state.x = resolvedX;
    state.z = resolvedZ;

    const moved = Math.hypot(state.x - previousX, state.z - previousZ);
    state.walked += moved;
    state.phase += moved * WALK_PHASE_PER_METER;

    const floor = swimming
      ? this.waterLevelValue - SWIM_FLOOR_OFFSET
      : this.world.groundAt(state.x, state.z);

    if (intent.jump && state.grounded && !swimming) {
      state.vy = JUMP_SPEED * this.speedScaleValue;
      state.grounded = false;
    }

    state.vy -= GRAVITY * dt;
    state.y += state.vy * dt;

    if (state.y <= floor) {
      state.y = floor;
      state.vy = 0;
      state.grounded = true;
    } else if (state.grounded && state.vy <= 0 && state.y - floor < 0.8) {
      state.y = floor;
      state.vy = 0;
    } else {
      state.grounded = false;
    }

    return moved / Math.max(dt, 1e-4);
  }
}
