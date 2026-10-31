import { describe, expect, it } from 'vitest';
import { OASIS, OASIS_WATER_EDGE } from '../../src/config/oasis';
import { WATER_LEVEL } from '../../src/config/world';
import { World } from '../../src/world/World';
import { findNearestOasisEdge } from '../../src/world/oasisTravel';

describe('绿洲调试传送', () => {
  it('落到最近绿洲的外缘，面朝湖心且站在干燥的沙丘上', () => {
    const world = new World(123456);
    const target = findNearestOasisEdge(world, 0, 0);
    expect(target).not.toBeNull();
    if (!target) return;

    // 落脚点在绿洲里的湖岸草地上，而不是湖心或绿洲之外。
    // 湖岸是不规则形状，所以落脚点到中心的距离有一个较宽但依然合理的范围。
    expect(target.distance).toBeGreaterThan(OASIS.lakeRadius + 10);
    expect(target.distance).toBeLessThan(OASIS_WATER_EDGE + 80);

    // 前进方向 (-sin(yaw), -cos(yaw)) 应正对湖心。
    const dx = target.centerX - target.x;
    const dz = target.centerZ - target.z;
    const length = Math.hypot(dx, dz);
    const forwardX = -Math.sin(target.yaw);
    const forwardZ = -Math.cos(target.yaw);
    expect((forwardX * dx + forwardZ * dz) / length).toBeCloseTo(1, 6);

    // 俯仰角朝下，视线落在湖面上。
    expect(target.pitch).toBeLessThan(0);

    // 不会落在水里。
    expect(world.groundAt(target.x, target.z)).toBeGreaterThan(WATER_LEVEL + 0.5);
  }, 30_000);

  it('选中的确实是离玩家最近的绿洲', () => {
    const world = new World(123456);
    const target = findNearestOasisEdge(world, 0, 0);
    expect(target).not.toBeNull();
    if (!target) return;

    const chosen = Math.hypot(target.centerX, target.centerZ);
    const sites = world.oasisSitesInRect(-60_000, -60_000, 60_000, 60_000);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      // 允许圆心到玩家的距离相同（同半径），但不允许有更近的绿洲。
      expect(Math.hypot(site.x, site.z)).toBeGreaterThanOrEqual(chosen - 1e-6);
    }
  }, 30_000);

  it('在任何位置都能找到绿洲边缘（覆盖沙漠中心与远处）', () => {
    const world = new World(123456);
    for (const [x, z] of [
      [0, 0],
      [-34_000, 8_400],
      [120_000, -260_000],
      [510_000, 33_000],
    ] as const) {
      const target = findNearestOasisEdge(world, x, z);
      expect(target, `${x}, ${z} 附近没有绿洲`).not.toBeNull();
      if (!target) continue;
      expect(target.distance).toBeLessThanOrEqual(OASIS.radius);
      expect(world.groundAt(target.x, target.z)).toBeGreaterThan(WATER_LEVEL + 0.5);
    }
  }, 60_000);
});
