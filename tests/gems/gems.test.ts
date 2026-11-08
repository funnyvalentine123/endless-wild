import { describe, expect, it } from 'vitest';
import {
  GEM_COLLECT,
  GEM_DEFINITIONS,
  GEM_DYNAMIC,
  GEM_KINDS,
  GEM_RULES,
  GEM_VISUALS,
} from '../../src/config/gems';
import { DESERT } from '../../src/config/desert';
import { OASIS_WATER_EDGE } from '../../src/config/oasis';
import { ROAD_WIDTH, WATER_LEVEL } from '../../src/config/world';
import { staticGemSitesInChunk } from '../../src/gems/sites';
import { hoodooSiteAt } from '../../src/world/desertLandmarks';
import { World } from '../../src/world/World';

const SEED = 2024;

function collectSites(world: World, radius: number) {
  const sites = new Map<string, ReturnType<typeof staticGemSitesInChunk>[number]>();
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      for (const site of staticGemSitesInChunk(world, SEED, cx, cz)) {
        expect(sites.has(site.key)).toBe(false);
        sites.set(site.key, site);
      }
    }
  }
  return [...sites.values()];
}

describe('宝石系统', () => {
  it('十种宝石定义完整、形状与颜色互不相同，尺寸约为主角身高的一半', () => {
    expect(GEM_KINDS).toHaveLength(10);
    const total = GEM_KINDS.length;
    expect(new Set(GEM_KINDS.map((kind) => GEM_DEFINITIONS[kind].label)).size).toBe(total);
    expect(new Set(GEM_KINDS.map((kind) => GEM_DEFINITIONS[kind].glow)).size).toBe(total);
    // 每种宝石的几何体形状都不一样，远看轮廓就能分辨。
    expect(new Set(GEM_KINDS.map((kind) => GEM_DEFINITIONS[kind].shape)).size).toBe(total);

    for (const kind of GEM_KINDS) {
      const definition = GEM_DEFINITIONS[kind];
      expect(definition.kind).toBe(kind);
      expect(definition.maxActive).toBeGreaterThan(0);
      // 一座山最多一颗，同时存在几颗就够，上限不应放宽。
      expect(definition.maxActive).toBeLessThanOrEqual(5);
      expect(definition.rule.length).toBeGreaterThan(0);
    }

    // 主角站立高度约 1.86m：宝石直径 ≈ 0.92m，中心 ≈ 0.93m。
    expect(GEM_VISUALS.size).toBeCloseTo(0.92, 5);
    expect(GEM_VISUALS.centerHeight).toBeCloseTo(0.93, 5);
    expect(GEM_VISUALS.pillarHeight).toBeGreaterThan(GEM_VISUALS.pillarFadeStart);

    // 拾取：贴到宝石旁（水平距离大于宝石半径）就会播放“飞进身体”的动画。
    expect(GEM_COLLECT.radius).toBeGreaterThan(GEM_VISUALS.size * 0.5);
    expect(GEM_COLLECT.verticalTolerance).toBeGreaterThan(0);
    expect(GEM_COLLECT.duration).toBeGreaterThan(0);
    expect(GEM_COLLECT.endScale).toBeGreaterThan(0);
    expect(GEM_COLLECT.endScale).toBeLessThan(1);
  });

  it('天气专属宝石分别绑定雨 / 雪 / 晴天白昼', () => {
    // 三种天气宝石各自有独立的生成参数，不会在别的天气里出现。
    expect(GEM_DYNAMIC.purple.minPrecipitation).toBeGreaterThan(0);
    expect(GEM_DYNAMIC.frost.minSnow).toBeGreaterThan(0);
    expect(GEM_DYNAMIC.sun.minDaylight).toBeGreaterThan(0);
    // 日耀石要求降水基本淡出，避免雨刚停就和紫宝石重叠。
    expect(GEM_DYNAMIC.sun.maxPrecipitation).toBeLessThan(
      GEM_DYNAMIC.purple.minPrecipitation,
    );

    expect(GEM_DEFINITIONS.purple.rule).toContain('雨');
    expect(GEM_DEFINITIONS.frost.rule).toContain('雪');
    expect(GEM_DEFINITIONS.sun.rule).toContain('晴');

    for (const kind of ['purple', 'frost', 'sun'] as const) {
      expect(GEM_DYNAMIC[kind].chance).toBeGreaterThan(0);
      expect(GEM_DYNAMIC[kind].chance).toBeLessThanOrEqual(0.5);
      expect(GEM_DEFINITIONS[kind].maxActive).toBeGreaterThan(0);
    }
  });

  it('固定宝石站点只出现在对应生境，并且生成结果可复现', () => {
    const world = new World(SEED);
    const sites = collectSites(world, 16);
    expect(sites.length).toBeGreaterThan(0);

    for (const site of sites) {
      const height = world.height(site.x, site.z);
      const roadDistance = Math.abs(site.x - world.roadX(site.z));

      if (site.kind === 'diamond') {
        expect(world.forestAt(site.x, site.z)).toBeGreaterThanOrEqual(
          GEM_RULES.diamond.minForest,
        );
        expect(world.desertAt(site.x, site.z)).toBeLessThanOrEqual(
          GEM_RULES.diamond.maxDesert,
        );
        expect(height).toBeGreaterThan(WATER_LEVEL + 0.4);
        expect(roadDistance).toBeGreaterThan(ROAD_WIDTH * 0.5 + 2);
      } else if (site.kind === 'black') {
        const rules = GEM_RULES.black;
        // 每个山头 1/2 概率，不再是必定出现。
        expect(rules.chance).toBe(0.5);
        // 与地形着色一致：height + detail * 4 ≥ 40 就是开始泛白的雪线。
        expect(height + world.detailAt(site.x, site.z) * 4).toBeGreaterThanOrEqual(rules.minHeight);

        // 站点 key 带区块坐标：宝石必须落在自己那块 64m 区块里。
        const [cx, cz] = site.key.split(':').slice(1).map(Number);
        expect(Math.round(site.x / 64)).toBe(cx);
        expect(Math.round(site.z / 64)).toBe(cz);

        // 它必须是“山头”：3×3 区块里没有更高的积雪峰顶，因此一座山只会出一颗。
        const coarseTop = (gx: number, gz: number): number => {
          let top = -Infinity;
          const step = 64 / rules.samples;
          for (let ix = 0; ix < rules.samples; ix++) {
            for (let iz = 0; iz < rules.samples; iz++) {
              const x = gx * 64 - 32 + (ix + 0.5) * step;
              const z = gz * 64 - 32 + (iz + 0.5) * step;
              top = Math.max(top, world.height(x, z) + world.detailAt(x, z) * 4);
            }
          }
          return top;
        };
        const own = coarseTop(cx, cz);
        const radius = rules.summitRadius;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0) continue;
            expect(coarseTop(cx + dx, cz + dz)).toBeLessThanOrEqual(own + 0.05);
          }
        }
      } else if (site.kind === 'blue') {
        const rules = GEM_RULES.blue;
        // 只要水面开阔就可能有蓝宝石：不再要求“湖泊” biome 或更深的湖心。
        expect(height).toBeLessThan(WATER_LEVEL - rules.minDepth);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const x = site.x + Math.cos(angle) * rules.minOpenRadius;
          const z = site.z + Math.sin(angle) * rules.minOpenRadius;
          expect(world.height(x, z)).toBeLessThan(WATER_LEVEL - 0.2);
        }
        // 一个 96m 水面格最多一颗：落点和 key 里的格号必须一致。
        const [gx, gz] = site.key.split(':').slice(1).map(Number);
        expect(Math.floor(site.x / rules.cellSize)).toBe(gx);
        expect(Math.floor(site.z / rules.cellSize)).toBe(gz);
      } else if (site.kind === 'green') {
        if (site.key.startsWith('green:oasis:')) {
          const info = world.oasisInfo(site.x, site.z);
          expect(info).not.toBeNull();
          expect(info!.factor).toBeGreaterThan(0.5);
          expect(info!.waterDistance).toBeGreaterThan(
            OASIS_WATER_EDGE + GEM_RULES.green.minWaterDistance,
          );
          expect(height).toBeGreaterThan(WATER_LEVEL + 0.4);
          expect(height).toBeLessThanOrEqual(GEM_RULES.green.maxHeight);
        } else {
          // 普通草地：草原地表，远离水 / 道路 / 沙漠。
          expect(world.biomeAt(site.x, site.z)).toBe('草原');
          expect(height).toBeGreaterThan(WATER_LEVEL + 0.5);
          expect(world.desertAt(site.x, site.z)).toBeLessThanOrEqual(GEM_RULES.green.maxDesert);
          expect(roadDistance).toBeGreaterThan(ROAD_WIDTH * 0.5 + 3);
        }
      } else if (site.key.startsWith('yellow:desert:')) {
        // 沙漠任意沙地：低概率分支，离所有岩柱都有足够距离。
        expect(height).toBeGreaterThan(WATER_LEVEL + 0.4);
        expect(world.habitatDesertAt(site.x, site.z)).toBeGreaterThanOrEqual(
          GEM_RULES.yellow.minDesert,
        );
      } else {
        const [gx, gz] = site.key.split(':').slice(1).map(Number);
        const hoodoo = hoodooSiteAt(world, SEED, gx, gz);
        expect(hoodoo).not.toBeNull();
        const distance = Math.hypot(site.x - hoodoo!.x, site.z - hoodoo!.z);
        expect(distance).toBeGreaterThan(GEM_RULES.yellow.offset - 0.1);
        expect(distance).toBeLessThan(GEM_RULES.yellow.offset + 2);
        expect(world.habitatDesertAt(site.x, site.z)).toBeGreaterThan(0.5);
      }
    }

    // 同一区块重复计算必须得到完全相同的站点（区块卸载再加载不会变位置）。
    const again = staticGemSitesInChunk(world, SEED, 0, 0);
    expect(again).toEqual(staticGemSitesInChunk(world, SEED, 0, 0));

    // 绿宝石不再只长在绿洲：普通草地上也会出现。
    expect(sites.filter((site) => site.key.startsWith('green:meadow:')).length).toBeGreaterThan(0);
    // 蓝宝石出现在开阔水面上，而不是必须“湖泊 biome”。
    expect(sites.filter((site) => site.kind === 'blue').length).toBeGreaterThan(0);
  });

  it('一座雪山最多一颗黑宝石，且约一半的山头才有', () => {
    const world = new World(SEED);
    const sites = collectSites(world, 16);
    const areaKm2 = (33 * 64) ** 2 / 1_000_000;
    const blackSites = sites.filter((site) => site.kind === 'black');
    expect(blackSites.length).toBeGreaterThan(0);
    // 除黑宝石外的固定宝石仍然是稀疏地标，不会铺满地图。
    expect((sites.length - blackSites.length) / areaKm2).toBeLessThan(10);

    // 与实现同一口径（5×5 粗采样 + 3×3 内取最高）统计山头，用来核对 1/2 概率。
    const rules = GEM_RULES.black;
    const samples = rules.samples;
    const step = 64 / samples;
    const tops = new Map<string, number>();
    const topAt = (cx: number, cz: number): number => {
      const key = `${cx}:${cz}`;
      const cached = tops.get(key);
      if (cached !== undefined) return cached;
      let top = -Infinity;
      let peakX = 0;
      let peakZ = 0;
      for (let ix = 0; ix < samples; ix++) {
        for (let iz = 0; iz < samples; iz++) {
          const x = cx * 64 - 32 + (ix + 0.5) * step;
          const z = cz * 64 - 32 + (iz + 0.5) * step;
          const snow = world.height(x, z) + world.detailAt(x, z) * 4;
          if (snow > top) {
            top = snow;
            peakX = x;
            peakZ = z;
          }
        }
      }
      if (
        top < rules.minHeight ||
        world.desertAt(peakX, peakZ) > rules.maxDesert ||
        world.oasisAt(peakX, peakZ) > 0.2
      ) {
        top = -Infinity;
      }
      tops.set(key, top);
      return top;
    };

    const radius = rules.summitRadius;
    let summits = 0;
    for (let cx = -16; cx <= 16; cx++) {
      for (let cz = -16; cz <= 16; cz++) {
        const own = topAt(cx, cz);
        if (own === -Infinity) continue;
        let isTop = true;
        for (let dx = -radius; dx <= radius && isTop; dx++) {
          for (let dz = -radius; dz <= radius && isTop; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (topAt(cx + dx, cz + dz) > own) isTop = false;
          }
        }
        if (isTop) summits++;
      }
    }

    // 一座山最多一颗：任意两颗黑宝石都不能落在相邻（3×3）区块里。
    for (let i = 0; i < blackSites.length; i++) {
      const [ax, az] = blackSites[i].key.split(':').slice(1).map(Number);
      for (let j = i + 1; j < blackSites.length; j++) {
        const [bx, bz] = blackSites[j].key.split(':').slice(1).map(Number);
        expect(Math.abs(ax - bx) > radius || Math.abs(az - bz) > radius).toBe(true);
      }
    }
    // 1/2 概率：山头里约一半才有黑宝石（区间放宽，避免种子差异导致 flaky）。
    const ratio = blackSites.length / Math.max(1, summits);
    expect(summits).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.8);

    for (const kind of ['diamond', 'blue', 'green', 'yellow'] as const) {
      const count = sites.filter((site) => site.kind === kind).length;
      // 单块绿洲 / 湖泊 / 岩柱本来就稀疏，这些宝石不应该铺满地图。
      expect(count).toBeLessThan(sites.length);
    }
  });

  it('绿洲高概率、草地低概率，岩柱高概率、沙漠低概率', () => {
    // 概率关系：绿洲 ≫ 普通草地，岩柱旁 ≫ 沙漠任意沙地。
    expect(GEM_RULES.green.oasisChance).toBeGreaterThanOrEqual(0.5);
    expect(GEM_RULES.green.meadowChance).toBeGreaterThan(0);
    expect(GEM_RULES.green.meadowChance).toBeLessThanOrEqual(0.02);
    expect(GEM_RULES.yellow.hoodooChance).toBeGreaterThanOrEqual(0.5);
    expect(GEM_RULES.yellow.desertChance).toBeGreaterThan(0);
    expect(GEM_RULES.yellow.desertChance).toBeLessThanOrEqual(0.02);
    // 蓝宝石只需要“开阔水面”：判定半径远大于一条窄河。
    expect(GEM_RULES.blue.minOpenRadius).toBeGreaterThanOrEqual(16);
    expect(GEM_RULES.blue.cellSize).toBeGreaterThan(GEM_RULES.blue.minOpenRadius * 2);

    const world = new World(SEED);

    // 找一块最近的沙漠核心，确认沙漠里也会长出黄宝石。
    let desert: { x: number; z: number } | null = null;
    let bestDistance = Infinity;
    for (let x = -30_000; x <= 30_000; x += 500) {
      for (let z = -30_000; z <= 30_000; z += 500) {
        if (world.habitatDesertAt(x, z) < 0.9) continue;
        const distance = Math.hypot(x, z);
        if (distance < bestDistance) {
          bestDistance = distance;
          desert = { x, z };
        }
      }
    }
    expect(desert).not.toBeNull();

    const cx = Math.round(desert!.x / 64);
    const cz = Math.round(desert!.z / 64);
    const yellows = [];
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (const site of staticGemSitesInChunk(world, SEED, cx + dx, cz + dz)) {
          if (site.kind === 'yellow') yellows.push(site);
        }
      }
    }
    expect(yellows.length).toBeGreaterThan(0);
    for (const site of yellows) {
      expect(world.habitatDesertAt(site.x, site.z)).toBeGreaterThanOrEqual(0.5);
    }

    // 岩柱旁大概率出现：统计沙漠里若干根岩柱，有多少根的所在区块真的长出了宝石。
    const size = DESERT.hoodooCellSize;
    const fromX = Math.floor((desert!.x - 1200) / size);
    const toX = Math.floor((desert!.x + 1200) / size);
    const fromZ = Math.floor((desert!.z - 1200) / size);
    const toZ = Math.floor((desert!.z + 1200) / size);
    let hoodoos = 0;
    let withGem = 0;
    for (let gx = fromX; gx <= toX; gx++) {
      for (let gz = fromZ; gz <= toZ; gz++) {
        const hoodoo = hoodooSiteAt(world, SEED, gx, gz);
        if (!hoodoo) continue;
        hoodoos++;
        const sites = staticGemSitesInChunk(
          world,
          SEED,
          Math.round(hoodoo.x / 64),
          Math.round(hoodoo.z / 64),
        );
        const gem = sites.find((site) => site.key === `yellow:${gx}:${gz}`);
        if (!gem) continue;
        withGem++;
        const distance = Math.hypot(gem.x - hoodoo.x, gem.z - hoodoo.z);
        expect(distance).toBeGreaterThan(GEM_RULES.yellow.offset - 0.1);
        expect(distance).toBeLessThan(GEM_RULES.yellow.offset + 2);
      }
    }
    expect(hoodoos).toBeGreaterThanOrEqual(4);
    // 70% 的岩柱旁有宝石；抽样少，区间放宽但必须明显多于“偶尔”。
    expect(withGem / hoodoos).toBeGreaterThan(0.25);
  });
});
