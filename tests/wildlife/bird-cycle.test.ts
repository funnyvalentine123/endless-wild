import { MeshBasicMaterial, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BIRD_CONFIG } from '../../src/config/wildlife';
import type { World } from '../../src/world/World';
import { BirdFlock } from '../../src/wildlife/Birds';
import { createBirdGeometries } from '../../src/wildlife/models';

/** 平坦地面：所有采样点高度相同，落地永远成功。 */
const FLAT_GROUND = 10;
const stubWorld = { groundAt: () => FLAT_GROUND } as unknown as World;

describe('鸟的落地 / 飞行状态机', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('长时间运行后地面停留时间与飞行时间约为 1:3', () => {
    // 固定随机数让 12 只鸟同步，测量到的就是单个周期的稳定比例。
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const scene = new Scene();
    const material = new MeshBasicMaterial();
    const flock = new BirdFlock(scene, stubWorld, material, BIRD_CONFIG, createBirdGeometries());

    const dt = 1 / 60;
    let playerX = 0;
    let playerZ = 0;
    let groundTime = 0;
    let airTime = 0;

    for (let frame = 0; frame < 60 * 240; frame++) {
      flock.update(dt, playerX, playerZ);

      const sightings = flock.getSightings();
      if (sightings.length > 0) {
        // 用鸟群中心当作玩家位置，避免鸟飞出销毁半径。
        playerX = sightings.reduce((sum, bird) => sum + bird.x, 0) / sightings.length;
        playerZ = sightings.reduce((sum, bird) => sum + bird.z, 0) / sightings.length;
      }

      for (const bird of sightings) {
        // 只比较巡航飞行与地面停留；落地 / 起飞过渡不计入两边。
        if (bird.mode === 'perched') groundTime += dt;
        else if (bird.mode === 'fly') airTime += dt;
      }
    }

    const share = groundTime / (groundTime + airTime);
    // 地面 : 飞行 = 1 : 3，即地面占 25%。
    expect(share).toBeGreaterThan(0.24);
    expect(share).toBeLessThan(0.26);

    flock.dispose();
    material.dispose();
  });
});
