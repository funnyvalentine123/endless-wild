import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/world/Biomes';
import { World } from '../../src/world/World';

const SAMPLES = [
  [0, 0],
  [12.5, -37.2],
  [-120.75, 88.4],
  [420, -260],
] as const;

function heightsOf(world: World): number[] {
  return SAMPLES.map(([x, z]) => world.height(x, z));
}

describe('World', () => {
  it('同种子完全可复现', () => {
    const a = new World(12345);
    const b = new World(12345);

    expect(heightsOf(a)).toEqual(heightsOf(b));
    expect(a.roadX(30)).toBe(b.roadX(30));
    expect(a.roadHeight(30)).toBe(b.roadHeight(30));
  });

  it('不同种子生成不同地图', () => {
    const a = new World(12345);
    const b = new World(54321);
    const heightsA = heightsOf(a);
    const heightsB = heightsOf(b);

    expect(heightsA.some((height, index) => Math.abs(height - heightsB[index]!) > 1e-6)).toBe(
      true,
    );
  });

  it('高度在任意采样点都是有限值', () => {
    const world = new World(777);
    for (let x = -300; x <= 300; x += 47) {
      for (let z = -300; z <= 300; z += 53) {
        expect(Number.isFinite(world.height(x, z))).toBe(true);
        expect(Number.isFinite(world.groundAt(x, z))).toBe(true);
      }
    }
  });

  it('路面中心不会低于路面高度', () => {
    const world = new World(2024);
    for (const z of [-160, -40, 0, 25, 150]) {
      const x = world.roadX(z);
      expect(world.groundAt(x, z)).toBeGreaterThanOrEqual(world.roadHeight(z) + 0.05 - 1e-9);
    }
  });

  it('所有位置都会归入已知群系', () => {
    const world = new World(9);
    for (const [x, z] of SAMPLES) {
      expect(BIOMES).toContain(world.biomeAt(x, z));
    }
  });
});
