import { describe, expect, it } from 'vitest';
import { WATER_LEVEL } from '../../src/config/world';
import { World } from '../../src/world/World';
import { findRoadSpawn } from '../../src/world/spawn';

describe('findRoadSpawn', () => {
  for (const seed of [123456, 2024, 7, 42, 999999]) {
    it(`种子 ${seed} 的出生点是干燥平缓的路段`, () => {
      const world = new World(seed);
      const spawn = findRoadSpawn(world);
      const x = world.roadX(spawn.z);

      expect(Math.abs(spawn.z)).toBeLessThanOrEqual(320);
      expect(spawn.x).toBeCloseTo(x, 10);
      expect(world.bridge(spawn.z)).toBeLessThanOrEqual(0.05);
      expect(world.bridge(spawn.z - 12)).toBeLessThanOrEqual(0.1);
      expect(world.bridge(spawn.z - 24)).toBeLessThanOrEqual(0.1);
      expect(world.rawHeight(x, spawn.z)).toBeGreaterThan(WATER_LEVEL + 2);
    });
  }
});
