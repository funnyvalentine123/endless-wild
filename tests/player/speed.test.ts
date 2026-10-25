import { describe, expect, it } from 'vitest';
import {
  JUMP_SPEED,
  SPEED_SCALE_MAX,
  SPEED_SCALE_MIN,
  SPEED_PRESETS,
  GRAVITY,
} from '../../src/config/player';
import { Player, type PlayerIntent } from '../../src/player/Player';
import { World } from '../../src/world/World';

const WALK_INTENT: PlayerIntent = { forward: 1, strafe: 0, run: false, jump: false };

function createPlayer(): Player {
  const world = new World(123456);
  return new Player(world, { resolveCollisions: (x, z) => [x, z] });
}

describe('Player 速度倍率', () => {
  it('默认倍率为 1', () => {
    expect(createPlayer().speedScale).toBe(1);
  });

  it('倍率会被夹紧在配置范围内', () => {
    const player = createPlayer();
    expect(player.setSpeedScale(99)).toBe(SPEED_SCALE_MAX);
    expect(player.setSpeedScale(0)).toBe(SPEED_SCALE_MIN);
  });

  it('快捷键按预设档位逐级加速与减速', () => {
    const player = createPlayer();

    for (const preset of SPEED_PRESETS.filter((preset) => preset > 1)) {
      expect(player.stepSpeedScale(1)).toBe(preset);
    }
    expect(player.stepSpeedScale(1)).toBe(SPEED_SCALE_MAX);

    for (const preset of [...SPEED_PRESETS].reverse().slice(1)) {
      expect(player.stepSpeedScale(-1)).toBe(preset);
    }
    expect(player.stepSpeedScale(-1)).toBe(SPEED_SCALE_MIN);
  });

  it('倍率按比例放大水平移动速度', () => {
    const normal = createPlayer();
    const fast = createPlayer();
    fast.setSpeedScale(2);

    const normalSpeed = normal.update(0.01, WALK_INTENT, false);
    const fastSpeed = fast.update(0.01, WALK_INTENT, false);
    expect(fastSpeed).toBeCloseTo(normalSpeed * 2, 5);
  });

  it('倍率同时放大跳跃初速，重力保持不变', () => {
    const player = createPlayer();
    const scale = 2;
    player.setSpeedScale(scale);

    player.update(0.01, WALK_INTENT, false);
    player.update(0.01, { ...WALK_INTENT, jump: true }, false);

    expect(player.state.vy).toBeCloseTo(JUMP_SPEED * scale - GRAVITY * 0.01, 5);
  });
});
