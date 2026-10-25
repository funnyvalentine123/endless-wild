import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[index]!;
}

interface TerrainStats {
  waterFraction: number;
  meanSlope: number;
  p95Slope: number;
  gentleFraction: number;
  steepFraction: number;
  verySteepFraction: number;
  roadBridgeRuns: number;
  roadBridgeMeters: number;
}

function measureTerrain(world: World): TerrainStats {
  const step = 10;
  const limit = 1000;
  const slopes: number[] = [];
  let water = 0;
  let samples = 0;
  let gentle = 0;
  let steep = 0;
  let verySteep = 0;

  for (let x = -limit; x <= limit; x += step) {
    for (let z = -limit; z <= limit; z += step) {
      if (world.rawHeight(x, z) < 0) water++;
      samples++;

      const slope = Math.hypot(
        (world.rawHeight(x + 2, z) - world.rawHeight(x - 2, z)) / 4,
        (world.rawHeight(x, z + 2) - world.rawHeight(x, z - 2)) / 4,
      );
      slopes.push(slope);
      if (slope < 0.15) gentle++;
      if (slope > 0.5) steep++;
      if (slope > 1.0) verySteep++;
    }
  }

  slopes.sort((a, b) => a - b);

  let roadBridgeRuns = 0;
  let roadBridgeMeters = 0;
  let inBridge = false;
  for (let z = -2000; z <= 2000; z += 4) {
    if (world.bridge(z) > 0.5) {
      roadBridgeMeters += 4;
      if (!inBridge) roadBridgeRuns++;
      inBridge = true;
    } else {
      inBridge = false;
    }
  }

  return {
    waterFraction: water / samples,
    meanSlope: slopes.reduce((sum, value) => sum + value, 0) / slopes.length,
    p95Slope: percentile(slopes, 0.95),
    gentleFraction: gentle / samples,
    steepFraction: steep / samples,
    verySteepFraction: verySteep / samples,
    roadBridgeRuns,
    roadBridgeMeters,
  };
}

/**
 * 这组断言就是这次地形调整的验收标准：
 * 水体更少但单块更大，道路穿越频率下降，缓坡占比上升，陡坡减少。
 */
describe('地形性格回归', () => {
  for (const seed of [123456, 2024, 7]) {
    it(`种子 ${seed} 的水体密度、道路穿越与坡度处于合理范围`, () => {
      const stats = measureTerrain(new World(seed));

      expect(stats.waterFraction).toBeGreaterThan(0.02);
      expect(stats.waterFraction).toBeLessThan(0.1);
      expect(stats.roadBridgeRuns).toBeLessThanOrEqual(8);
      expect(stats.roadBridgeMeters).toBeLessThanOrEqual(700);

      expect(stats.meanSlope).toBeLessThanOrEqual(0.25);
      expect(stats.p95Slope).toBeLessThanOrEqual(0.65);
      expect(stats.gentleFraction).toBeGreaterThanOrEqual(0.62);
      expect(stats.steepFraction).toBeLessThanOrEqual(0.08);
      expect(stats.verySteepFraction).toBeLessThanOrEqual(0.035);
    });
  }
});
