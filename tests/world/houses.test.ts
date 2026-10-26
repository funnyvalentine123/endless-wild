import { describe, expect, it } from 'vitest';
import { WEATHER_WATER_RISE_MAX } from '../../src/config/weather';
import { CHUNK_SIZE, WATER_LEVEL } from '../../src/config/world';
import { World } from '../../src/world/World';
import {
  findHousePlacement,
  type HousePlacement,
} from '../../src/world/landmarks/Houses';

function collectHouses(world: World, seed: number): HousePlacement[] {
  const houses: HousePlacement[] = [];
  for (let cx = -6; cx <= 6; cx++) {
    for (let cz = -6; cz <= 6; cz++) {
      const house = findHousePlacement(world, seed, cx, cz);
      if (house) houses.push(house);
    }
  }
  return houses;
}

describe('固定房屋', () => {
  for (const seed of [123456, 2024, 7]) {
    it(`种子 ${seed} 的房屋位置固定、平坦且避开水面`, () => {
      const world = new World(seed);
      const houses = collectHouses(world, seed);

      expect(houses.length).toBeGreaterThan(0);

      for (const house of houses) {
        expect(Math.abs(house.x - world.roadX(house.z))).toBeGreaterThan(14);

        const heights: number[] = [];
        for (const dx of [-6, 0, 6]) {
          for (const dz of [-6, 0, 6]) {
            heights.push(world.groundAt(house.x + dx, house.z + dz));
          }
        }
        const min = Math.min(...heights);
        const max = Math.max(...heights);

        // 暴雨把水位抬到上限后，房屋地基与周围院落仍应保持在水面之上。
        expect(min).toBeGreaterThan(WATER_LEVEL + WEATHER_WATER_RISE_MAX + 0.2);
        expect(max - min).toBeLessThanOrEqual(1.2);
        expect(house.y).toBeGreaterThanOrEqual(max);

        const broad: number[] = [];
        for (const radius of [10, 16]) {
          for (let point = 0; point < 8; point++) {
            const angle = (point / 8) * Math.PI * 2;
            broad.push(
              world.groundAt(
                house.x + Math.cos(angle) * radius,
                house.z + Math.sin(angle) * radius,
              ),
            );
          }
        }
        expect(Math.min(...broad)).toBeGreaterThan(WATER_LEVEL + WEATHER_WATER_RISE_MAX - 0.2);
        expect(Math.max(...broad) - Math.min(...broad)).toBeLessThanOrEqual(2.6);

        const again = findHousePlacement(world, seed, Math.floor(house.x / CHUNK_SIZE), Math.floor(house.z / CHUNK_SIZE));
        expect(again).not.toBeNull();
      }
    });
  }
});
