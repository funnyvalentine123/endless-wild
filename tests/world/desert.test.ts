import { describe, expect, it } from 'vitest';
import { HOURS_PER_DAY, NORMAL_TIME_SCALE } from '../../src/config/daynight';
import { DESERT, DESERT_CORE, DESERT_MIN_DIAMETER } from '../../src/config/desert';
import { OASIS, OASIS_DIAMETER, OASIS_WATER_EDGE } from '../../src/config/oasis';
import { WALK_SPEED } from '../../src/config/player';
import { WATER_LEVEL } from '../../src/config/world';
import { WeatherSystem } from '../../src/systems/WeatherSystem';
import { CACTUS_KINDS } from '../../src/world/assets/VegetationAssets';
import { World } from '../../src/world/World';
import { findNearestDesertEdge } from '../../src/world/desertTravel';
import { findRoadSpawn } from '../../src/world/spawn';
import { scatterVegetation } from '../../src/world/streaming/VegetationScatter';

const STEP = 250;
const LIMIT = 100_000;

interface DesertGrid {
  size: number;
  core: Uint8Array;
  coverage: number;
}

function sampleGrid(world: World): DesertGrid {
  const size = (LIMIT * 2) / STEP + 1;
  const core = new Uint8Array(size * size);
  let coreCount = 0;

  for (let row = 0; row < size; row++) {
    const z = -LIMIT + row * STEP;
    for (let column = 0; column < size; column++) {
      const x = -LIMIT + column * STEP;
      if (world.desertAt(x, z) > DESERT_CORE) {
        core[row * size + column] = 1;
        coreCount++;
      }
    }
  }

  return { size, core, coverage: coreCount / (size * size) };
}

/**
 * 四连通洪水填充，返回被采样窗口完整包住的连通块格子数。
 * 贴边的连通块只是被窗口截断，不能用来判断“是否零散”。
 */
function componentSizes(grid: DesertGrid): number[] {
  const { size, core } = grid;
  const visited = new Uint8Array(core.length);
  const stack: number[] = [];
  const sizes: number[] = [];

  for (let start = 0; start < core.length; start++) {
    if (!core[start] || visited[start]) continue;

    let count = 0;
    let truncated = false;
    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      count++;
      const row = Math.floor(index / size);
      const column = index % size;
      if (row === 0 || column === 0 || row === size - 1 || column === size - 1) {
        truncated = true;
      }

      if (column > 0) {
        const next = index - 1;
        if (core[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (column < size - 1) {
        const next = index + 1;
        if (core[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (row > 0) {
        const next = index - size;
        if (core[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (row < size - 1) {
        const next = index + size;
        if (core[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    if (!truncated) sizes.push(count);
  }

  return sizes;
}

function edgeDistance(world: World, x: number, z: number, dx: number, dz: number): number {
  for (let distance = 20; distance <= 16_000; distance += 20) {
    if (world.desertAt(x + dx * distance, z + dz * distance) < DESERT_CORE) return distance;
  }
  return 16_000;
}

/** 找一块远离绿洲、四面八方都是沙漠核心的地方，用来统计沙漠专属内容。 */
function desertCorePoint(world: World, range = 30_000): { x: number; z: number } {
  const offsets = [
    [0, 0],
    [900, 0],
    [-900, 0],
    [0, 900],
    [0, -900],
  ] as const;

  for (let x = -range; x <= range; x += 500) {
    for (let z = -range; z <= range; z += 500) {
      if (offsets.some(([dx, dz]) => world.desertAt(x + dx, z + dz) < 0.99)) continue;
      if (world.oasisSitesInRect(x - 1_200, z - 1_200, x + 1_200, z + 1_200).length > 0) continue;
      return { x, z };
    }
  }
  throw new Error('找不到远离绿洲的沙漠核心');
}

/** 统计一个正方形窗口内实际生成的岩柱与石头数量。 */
function landmarksInWindow(
  world: World,
  seed: number,
  x0: number,
  z0: number,
  size: number,
): { hoodoo: number; rock: number } {
  let hoodoo = 0;
  let rock = 0;

  for (let cx = Math.floor(x0 / 64); cx <= Math.floor((x0 + size) / 64); cx++) {
    for (let cz = Math.floor(z0 / 64); cz <= Math.floor((z0 + size) / 64); cz++) {
      const scatter = scatterVegetation(world, seed, cx, cz);
      // 只统计沙漠里的散件：普通地形自带的石头不计入。
      const inDesert = (item: { x: number; z: number }): boolean =>
        item.x >= x0 &&
        item.x < x0 + size &&
        item.z >= z0 &&
        item.z < z0 + size &&
        world.habitatDesertAt(item.x, item.z) > 0.5;
      for (const item of scatter.instances.hoodoo) if (inDesert(item)) hoodoo++;
      for (const item of scatter.instances.rock) if (inDesert(item)) rock++;
    }
  }

  return { hoodoo, rock };
}

describe('沙漠地形系统', () => {
  it('全球沙漠占比约为 1/5，且每个沙漠都是连续的大块区域', () => {
    const world = new World(123456);
    const grid = sampleGrid(world);
    console.log('desert coverage:', grid.coverage.toFixed(3));

    // 单块沙漠半径收缩后，全世界沙漠占比降到约 1/5。
    expect(grid.coverage).toBeGreaterThan(0.11);
    expect(grid.coverage).toBeLessThan(0.22);

    const sizes = componentSizes(grid);
    expect(sizes.length).toBeGreaterThan(0);
    // 不允许出现零散的小沙斑：最小的连通块也应该是一整片沙漠。
    expect(Math.min(...sizes)).toBeGreaterThan(400);
  });

  it('沿道路任意位置，前后 10km 内一定能遇到沙漠', () => {
    let worst = 0;
    let worstAt = '';

    for (const seed of [1, 42, 7, 2024, 123456]) {
      const world = new World(seed);
      const spawn = findRoadSpawn(world);
      // 出生点本身必须是普通地形，不能一睁眼就在沙漠里。
      expect(world.desertAt(spawn.x, spawn.z)).toBeLessThan(0.2);

      // 每 500m 找一个道路点，再按 10m 步长双向扫描，覆盖所有间隙最深处。
      for (let z = -100_000; z <= 100_000; z += 500) {
        const x = world.roadX(z);
        if (world.desertAt(x, z) > DESERT_CORE) continue;

        let nearest: number | null = null;
        for (const direction of [1, -1]) {
          for (let distance = 10; distance <= 10_000; distance += 10) {
            const nextZ = z + direction * distance;
            if (world.desertAt(world.roadX(nextZ), nextZ) > DESERT_CORE) {
              if (nearest === null || distance < nearest) nearest = distance;
              break;
            }
          }
        }

        expect(nearest, `种子 ${seed} 在 z=${z} 前后 10km 内没有沙漠`).not.toBeNull();
        if (nearest !== null && nearest > worst) {
          worst = nearest;
          worstAt = `seed=${seed} z=${z}`;
        }
      }
    }

    console.log(`worst distance to desert core along road: ${worst}m (${worstAt})`);
    expect(worst).toBeLessThanOrEqual(10_000);
  }, 120_000);

  it('单块沙漠的最小跨度超过一天的正常步行距离', () => {
    const dayTravel = WALK_SPEED * (HOURS_PER_DAY / NORMAL_TIME_SCALE);
    expect(DESERT_MIN_DIAMETER).toBeGreaterThan(dayTravel);

    const world = new World(123456);
    // 找一块最“厚”的沙漠中心，测四个方向的跨度。
    let best = { x: 0, z: 0, minEdge: 0 };
    for (let x = -40_000; x <= 40_000; x += 2_000) {
      for (let z = -40_000; z <= 40_000; z += 2_000) {
        if (world.desertAt(x, z) < 0.98) continue;
        const minEdge = Math.min(
          edgeDistance(world, x, z, 1, 0),
          edgeDistance(world, x, z, -1, 0),
          edgeDistance(world, x, z, 0, 1),
          edgeDistance(world, x, z, 0, -1),
        );
        if (minEdge > best.minEdge) best = { x, z, minEdge };
      }
    }

    expect(best.minEdge * 2).toBeGreaterThan(dayTravel);
  });

  it('沙漠核心没有河流、湖泊，群系判定为沙漠', () => {
    const world = new World(123456);
    let samples = 0;

    for (let x = -60_000; x <= 60_000; x += 3_000) {
      for (let z = -60_000; z <= 60_000; z += 3_000) {
        if (world.desertAt(x, z) < 0.98) continue;
        // 绿洲是唯一允许在沙漠里出现的水体。
        if (world.oasisAt(x, z) > 0) continue;
        samples++;

        expect(world.rawHeight(x, z)).toBeGreaterThan(WATER_LEVEL + 1);
        const biome = world.biomeAt(x, z);
        expect(biome).toBe('沙漠');
      }
    }

    expect(samples).toBeGreaterThan(10);
  });

  it('沙漠核心只生成稀疏的仙人掌，普通植被完全消失', () => {
    const world = new World(123456);
    const chunks: Array<{ cx: number; cz: number }> = [];

    for (let cx = -700; cx <= 700 && chunks.length < 12; cx++) {
      for (let cz = -700; cz <= 700; cz++) {
        const x = cx * 64 + 32;
        const z = cz * 64 + 32;
        // 绿洲自己长树林，不属于“沙漠核心植被”统计。
        if (world.oasisSitesInRect(x - 64, z - 64, x + 64, z + 64).length > 0) continue;
        if (
          world.desertAt(x - 32, z - 32) > 0.99 &&
          world.desertAt(x + 32, z - 32) > 0.99 &&
          world.desertAt(x - 32, z + 32) > 0.99 &&
          world.desertAt(x + 32, z + 32) > 0.99
        ) {
          chunks.push({ cx, cz });
          if (chunks.length >= 12) break;
        }
      }
    }

    expect(chunks.length).toBeGreaterThan(0);

    let cacti = 0;
    let hoodoos = 0;
    const cactiByKind = Object.fromEntries(CACTUS_KINDS.map((kind) => [kind, 0])) as Record<
      (typeof CACTUS_KINDS)[number],
      number
    >;

    for (const chunk of chunks) {
      const scatter = scatterVegetation(world, 123456, chunk.cx, chunk.cz);
      expect(scatter.instances.pine).toHaveLength(0);
      expect(scatter.instances.broad).toHaveLength(0);
      expect(scatter.instances.bush).toHaveLength(0);
      expect(scatter.instances.flower).toHaveLength(0);
      expect(scatter.instances.reed).toHaveLength(0);
      expect(scatter.instances.lily).toHaveLength(0);
      for (const kind of CACTUS_KINDS) {
        cactiByKind[kind] += scatter.instances[kind].length;
        cacti += scatter.instances[kind].length;
      }
      hoodoos += scatter.instances.hoodoo.length;
    }

    expect(cacti).toBeGreaterThan(0);
    // 仙人掌只是稀疏点缀：平均每 64m 区块远少于一片“仙人掌林”。
    expect(cacti / chunks.length).toBeLessThan(12);
    // 三种株型都要出现，避免整片沙漠只有同一种仙人掌。
    for (const kind of CACTUS_KINDS) expect(cactiByKind[kind]).toBeGreaterThan(0);
    // 风蚀岩柱是偶发地标，不应该铺满沙漠。
    expect(hoodoos / chunks.length).toBeLessThan(4);
  });

  it('接近沙漠边界时雨雪平滑减弱，核心锁定晴天且无法手动改天气', () => {
    const weather = new WeatherSystem(() => 0);
    weather.setManual('snow', 'heavy');
    weather.update(8, 0);
    expect(weather.snapshot.snow).toBeCloseTo(1);

    weather.setDesertFactor(0.4);
    weather.update(8, 0);
    const fadeSnow = weather.snapshot.snow;
    expect(fadeSnow).toBeLessThan(1);
    expect(fadeSnow).toBeGreaterThan(0);

    weather.setDesertFactor(1);
    weather.update(8, 0);
    expect(weather.snapshot.snow).toBeCloseTo(0);
    expect(weather.kind).toBe('clear');

    weather.setManual('rain', 'heavy');
    expect(weather.kind).toBe('clear');
  });

  it('沙丘参数保证沙漠内部始终高于水位', () => {
    const world = new World(2024);
    const minHeight = DESERT.dunes.base - DESERT.dunes.rippleAmplitude - DESERT.dunes.detailAmplitude;
    expect(minHeight).toBeGreaterThan(WATER_LEVEL + 1);

    let checked = 0;
    for (let x = -60_000; x <= 60_000; x += 5_000) {
      for (let z = -60_000; z <= 60_000; z += 5_000) {
        if (world.desertAt(x, z) < 0.98) continue;
        if (world.oasisAt(x, z) > 0) continue;
        expect(world.rawHeight(x, z)).toBeGreaterThan(WATER_LEVEL + 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('沙丘少而大：大沙丘达到小山规模，且坡间过渡平缓', () => {
    const world = new World(123456);
    const core = desertCorePoint(world, 20_000);

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let dx = -2_000; dx <= 2_000; dx += 50) {
      for (let dz = -2_000; dz <= 2_000; dz += 50) {
        if (world.oasisAt(core.x + dx, core.z + dz) > 0) continue;
        if (world.desertAt(core.x + dx, core.z + dz) < 0.9) continue;
        const height = world.rawHeight(core.x + dx, core.z + dz);
        min = Math.min(min, height);
        max = Math.max(max, height);
      }
    }

    // 起伏幅度明显大于旧版沙丘；最高处超过 40m，达到小山规模。
    expect(max - min).toBeGreaterThan(30);
    expect(max).toBeGreaterThan(WATER_LEVEL + 40);

    // 起伏虽然大，但沙丘内部没有陡崖：相邻采样点之间的坡度保持平缓。
    let steepest = 0;
    for (let dx = -1_000; dx <= 990; dx += 10) {
      for (let dz = -1_000; dz <= 990; dz += 10) {
        if (world.oasisAt(core.x + dx, core.z + dz) > 0) continue;
        if (world.desertAt(core.x + dx, core.z + dz) < 0.9) continue;
        if (world.desertAt(core.x + dx + 10, core.z + dz) < 0.9) continue;
        const here = world.rawHeight(core.x + dx, core.z + dz);
        const ahead = world.rawHeight(core.x + dx + 10, core.z + dz);
        steepest = Math.max(steepest, Math.abs(ahead - here) / 10);
      }
    }
    expect(steepest).toBeLessThan(0.8);
  });

  it('风蚀岩柱每 1000×1000m 最多 3 个，沙漠石头最多 20 个', () => {
    const world = new World(123456);
    const core = desertCorePoint(world, 20_000);

    for (const offset of [0, 100, 250, 500]) {
      const window = landmarksInWindow(
        world,
        123456,
        core.x + offset,
        core.z + offset,
        1_000,
      );
      expect(window.hoodoo, `offset ${offset} 的岩柱超量`).toBeLessThanOrEqual(3);
      expect(window.rock, `offset ${offset} 的石头超量`).toBeLessThanOrEqual(20);
    }

    // 岩柱只是偶发地标，但也不能完全消失。
    let hoodoos = 0;
    for (let cx = Math.floor((core.x - 750) / 64); cx <= Math.floor((core.x + 750) / 64); cx++) {
      for (let cz = Math.floor((core.z - 750) / 64); cz <= Math.floor((core.z + 750) / 64); cz++) {
        const scatter = scatterVegetation(world, 123456, cx, cz);
        for (const item of scatter.instances.hoodoo) {
          if (Math.abs(item.x - core.x) <= 750 && Math.abs(item.z - core.z) <= 750) hoodoos++;
        }
      }
    }
    expect(hoodoos).toBeGreaterThan(0);

    // 岩柱变少之后单根要更醒目：高度明显超过仙人掌。
    let tallest = 0;
    for (let cx = Math.floor((core.x - 750) / 64); cx <= Math.floor((core.x + 750) / 64); cx++) {
      for (let cz = Math.floor((core.z - 750) / 64); cz <= Math.floor((core.z + 750) / 64); cz++) {
        for (const item of scatterVegetation(world, 123456, cx, cz).instances.hoodoo) {
          tallest = Math.max(tallest, item.sy ?? item.scale);
        }
      }
    }
    // 基础几何高约 7.3m，sy ≥ 1.4 时高度超过 10m。
    expect(tallest).toBeGreaterThanOrEqual(1.4);
  }, 120_000);

  it('绿洲每 5000×5000m 最多一个，湖泊与树林环带清晰可辨', () => {
    const world = new World(123456);
    const sites = world.oasisSitesInRect(-40_000, -40_000, 40_000, 40_000);
    expect(sites.length).toBeGreaterThan(0);

    // 绿洲只在 5km 网格的格子内部生成，每个格子最多一个。
    for (let x = -40_000; x <= 40_000; x += 5_000) {
      for (let z = -40_000; z <= 40_000; z += 5_000) {
        expect(
          world.oasisSitesInRect(x, z, x + 5_000, z + 5_000).length,
          `(${x}, ${z}) 的 5km 窗口内出现了多个绿洲`,
        ).toBeLessThanOrEqual(1);
      }
    }

    // 相邻绿洲中心至少隔开一个格子内缩量，实际间距远大于 1 个绿洲的直径。
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        nearest = Math.min(nearest, Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.z - sites[j]!.z));
      }
    }
    expect(nearest).toBeGreaterThan(3_000);

    for (const site of sites.slice(0, 12)) {
      // 直径不小于 1km，在地图上一眼就能看到。
      expect(site.radius * 2).toBeGreaterThanOrEqual(OASIS_DIAMETER);
      expect(OASIS_DIAMETER).toBeGreaterThanOrEqual(1_000);

      // 湖面低于水位，全局水面会直接铺成湖泊。
      expect(world.rawHeight(site.x, site.z)).toBeLessThan(WATER_LEVEL);
      expect(world.oasisAt(site.x, site.z)).toBe(1);

      // 湖岸之外的树林台地高于水面，树才长得起来。
      const ringX = site.x + OASIS_WATER_EDGE + 30;
      expect(world.rawHeight(ringX, site.z)).toBeGreaterThan(WATER_LEVEL + 0.5);

      // 绿洲只出现在沙漠核心；在植被与动物的生境里，它不算沙漠。
      expect(world.desertAt(site.x, site.z)).toBeGreaterThan(OASIS.minDesert);
      expect(world.habitatDesertAt(site.x, site.z)).toBe(0);
      expect(world.habitatDesertAt(ringX, site.z)).toBe(0);

      // 水面上是“湖泊”，岸上是“绿洲”。
      expect(world.biomeAt(site.x, site.z)).toBe('湖泊');
      expect(world.biomeAt(ringX, site.z)).toBe('绿洲');

      // 绿洲边界之外不再属于绿洲（留出边界扰动可能凸出的最大距离）。
      const outside =
        site.radius + OASIS.edgeWarp.amplitude + OASIS.edgeWarp.detailAmplitude + 10;
      expect(world.oasisAt(site.x + outside, site.z)).toBe(0);
    }
  }, 60_000);

  it('绿洲湖泊被小树林环绕，湖里没有仙人掌', () => {
    const world = new World(123456);
    const site = world.oasisSitesInRect(-40_000, -40_000, 40_000, 40_000)[0]!;

    let trees = 0;
    let cacti = 0;
    let lily = 0;
    const fromX = Math.floor((site.x - site.radius - 80) / 64);
    const toX = Math.floor((site.x + site.radius + 80) / 64);
    const fromZ = Math.floor((site.z - site.radius - 80) / 64);
    const toZ = Math.floor((site.z + site.radius + 80) / 64);

    for (let cx = fromX; cx <= toX; cx++) {
      for (let cz = fromZ; cz <= toZ; cz++) {
        const scatter = scatterVegetation(world, 123456, cx, cz);
        for (const kind of ['pine', 'broad'] as const) {
          for (const item of scatter.instances[kind]) {
            if (Math.hypot(item.x - site.x, item.z - site.z) <= site.radius) trees++;
          }
        }
        for (const kind of CACTUS_KINDS) {
          for (const item of scatter.instances[kind]) {
            if (Math.hypot(item.x - site.x, item.z - site.z) <= site.radius * 0.76) cacti++;
          }
        }
        for (const item of scatter.instances.lily) {
          if (Math.hypot(item.x - site.x, item.z - site.z) <= site.radius) lily++;
        }
      }
    }

    expect(trees).toBeGreaterThan(60);
    expect(cacti).toBe(0);
    expect(lily).toBeGreaterThan(0);
  }, 120_000);

  it('绿洲湖泊与外围森林的轮廓都不规则，而不是正圆', () => {
    const world = new World(123456);
    const sites = world.oasisSitesInRect(-40_000, -40_000, 40_000, 40_000);
    expect(sites.length).toBeGreaterThan(0);

    const DIRECTIONS = 48;
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);

    for (const site of sites.slice(0, 4)) {
      // 水线半径：沿每个方向由内向外扫，取第一次高出水位的位置。
      const shoreRadii: number[] = [];
      // 绿洲外围半径：沿每个方向扫到 oasisAt 刚好降为 0 的位置。
      const edgeRadii: number[] = [];

      for (let i = 0; i < DIRECTIONS; i++) {
        const angle = (i / DIRECTIONS) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        let shore = OASIS_WATER_EDGE + 80;
        for (let d = OASIS.lakeRadius - 60; d <= OASIS_WATER_EDGE + 80; d += 2) {
          if (world.rawHeight(site.x + cos * d, site.z + sin * d) > WATER_LEVEL) {
            shore = d;
            break;
          }
        }
        shoreRadii.push(shore);

        let edge = OASIS.radius + 120;
        for (let d = OASIS.radius - 120; d <= OASIS.radius + 120; d += 2) {
          if (world.oasisAt(site.x + cos * d, site.z + sin * d) <= 0) {
            edge = d;
            break;
          }
        }
        edgeRadii.push(edge);
      }

      // 一圈半径的极差就是“圆不圆”的量化指标：正圆为 0。
      expect(spread(shoreRadii)).toBeGreaterThan(20);
      expect(spread(edgeRadii)).toBeGreaterThan(30);

      // 扰动只是把圆形揉软，不应该破坏湖泊与树林环带的基本尺度。
      expect(Math.min(...shoreRadii)).toBeGreaterThan(OASIS.lakeRadius - 20);
      expect(Math.max(...shoreRadii)).toBeLessThan(OASIS_WATER_EDGE + 40);
      expect(Math.min(...edgeRadii)).toBeGreaterThan(
        OASIS.radius - OASIS.edgeWarp.amplitude - OASIS.edgeWarp.detailAmplitude,
      );
      expect(Math.max(...edgeRadii)).toBeLessThan(
        OASIS.radius + OASIS.edgeWarp.amplitude + OASIS.edgeWarp.detailAmplitude,
      );
    }
  }, 120_000);

  it('调试传送能落到最近的沙漠边缘并面朝沙漠', () => {
    const world = new World(123456);
    const spawn = findRoadSpawn(world);

    for (const dz of [0, 6_000, -9_000]) {
      const target = findNearestDesertEdge(world, spawn.x, spawn.z + dz);
      expect(target, `z=${spawn.z + dz} 附近应该能找到沙漠`).not.toBeNull();

      const { x, z, yaw } = target!;
      // 落在视觉上的沙漠边缘：脚下已经是沙地，但还没有深入沙漠核心。
      expect(world.desertAt(x, z)).toBeLessThan(0.72);
      expect(world.groundAt(x, z)).toBeGreaterThan(WATER_LEVEL + 0.4);

      // 沿朝向走 600m 就应该进入沙漠核心。
      const aheadX = x - Math.sin(yaw) * 600;
      const aheadZ = z - Math.cos(yaw) * 600;
      expect(world.desertAt(aheadX, aheadZ)).toBeGreaterThan(DESERT_CORE);
    }
  }, 60_000);
});
