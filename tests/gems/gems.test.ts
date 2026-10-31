import { describe, expect, it } from 'vitest';
import { GEM_DEFINITIONS, GEM_KINDS, GEM_RULES, GEM_VISUALS } from '../../src/config/gems';
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
  it('八种宝石定义完整、形状与颜色互不相同，尺寸约为主角身高的一半', () => {
    expect(GEM_KINDS).toHaveLength(8);
    expect(new Set(GEM_KINDS.map((kind) => GEM_DEFINITIONS[kind].label)).size).toBe(8);
    expect(new Set(GEM_KINDS.map((kind) => GEM_DEFINITIONS[kind].glow)).size).toBe(8);
    // 每种宝石的几何体形状都不一样，远看轮廓就能分辨。
    expect(new Set(GEM_KINDS.map((kind) => GEM_DEFINITIONS[kind].shape)).size).toBe(8);

    for (const kind of GEM_KINDS) {
      const definition = GEM_DEFINITIONS[kind];
      expect(definition.kind).toBe(kind);
      expect(definition.maxActive).toBeGreaterThan(0);
      // 黑宝石要覆盖雪山群（320m 内最多 4 座山），上限比其它宝石宽松。
      expect(definition.maxActive).toBeLessThanOrEqual(5);
      expect(definition.rule.length).toBeGreaterThan(0);
    }

    // 主角站立高度约 1.86m：宝石直径 ≈ 0.92m，中心 ≈ 0.93m。
    expect(GEM_VISUALS.size).toBeCloseTo(0.92, 5);
    expect(GEM_VISUALS.centerHeight).toBeCloseTo(0.93, 5);
    expect(GEM_VISUALS.pillarHeight).toBeGreaterThan(GEM_VISUALS.pillarFadeStart);
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
        // 有积雪的峰顶必定出现黑宝石。
        expect(rules.chance).toBe(1);
        expect(height).toBeGreaterThanOrEqual(rules.minHeight);

        // 黑宝石必须落在 600m 山格里的最高点（雪线以上那片白色区域的山顶）。
        const cellSize = rules.cellSize;
        const samples = rules.samples;
        const step = cellSize / (samples - 1);
        const gx = Math.floor(site.x / cellSize);
        const gz = Math.floor(site.z / cellSize);
        let isPeak = false;
        for (const cx of [gx, gx - 1]) {
          for (const cz of [gz, gz - 1]) {
            let top = -Infinity;
            let peakX = 0;
            let peakZ = 0;
            for (let ix = 0; ix < samples; ix++) {
              for (let iz = 0; iz < samples; iz++) {
                const x = cx * cellSize + ix * step;
                const z = cz * cellSize + iz * step;
                const sample = world.height(x, z);
                if (sample > top) {
                  top = sample;
                  peakX = x;
                  peakZ = z;
                }
              }
            }
            if (Math.abs(peakX - site.x) < 1e-6 && Math.abs(peakZ - site.z) < 1e-6) {
              isPeak = true;
            }
          }
        }
        expect(isPeak).toBe(true);
      } else if (site.kind === 'blue') {
        expect(height).toBeLessThan(WATER_LEVEL - GEM_RULES.blue.minDepth);
        expect(world.biomeAt(site.x, site.z)).toBe('湖泊');
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const x = site.x + Math.cos(angle) * GEM_RULES.blue.ringRadius;
          const z = site.z + Math.sin(angle) * GEM_RULES.blue.ringRadius;
          expect(world.height(x, z)).toBeLessThan(WATER_LEVEL - 0.3);
        }
      } else if (site.kind === 'green') {
        const info = world.oasisInfo(site.x, site.z);
        expect(info).not.toBeNull();
        expect(info!.factor).toBeGreaterThan(0.5);
        expect(info!.waterDistance).toBeGreaterThan(
          OASIS_WATER_EDGE + GEM_RULES.green.minWaterDistance,
        );
        expect(height).toBeGreaterThan(WATER_LEVEL + 0.4);
        expect(height).toBeLessThanOrEqual(GEM_RULES.green.maxHeight);
      } else {
        const size = DESERT.hoodooCellSize;
        const hoodoo = hoodooSiteAt(world, SEED, Math.floor(site.x / size), Math.floor(site.z / size));
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
  });

  it('低概率生成：固定宝石不会铺满地图，每座雪山最多一颗黑宝石', () => {
    const world = new World(SEED);
    const sites = collectSites(world, 16);
    const areaKm2 = (33 * 64) ** 2 / 1_000_000;
    // 黑宝石现在“有积雪就 100% 出现”，整体仍应远低于每平方公里十颗。
    expect(sites.length / areaKm2).toBeLessThan(10);

    const blackSites = sites.filter((site) => site.kind === 'black');
    expect(blackSites.length).toBeGreaterThan(0);
    // 山格 600m：一格最多一座山，因此黑宝石数量不会超过格网数量。
    const cellsPerAxis = Math.ceil((33 * 64) / GEM_RULES.black.cellSize) + 2;
    expect(blackSites.length).toBeLessThanOrEqual(cellsPerAxis ** 2);
    expect(blackSites.length / areaKm2).toBeLessThan(3.5);

    // 100% 出现：扫描范围内每个有积雪的山格都必须能在站点里找到黑宝石。
    const cell = GEM_RULES.black.cellSize;
    const samples = GEM_RULES.black.samples;
    const step = cell / (samples - 1);
    const range = 16 * 64 + 32;
    const from = Math.floor(-range / cell) - 1;
    const to = Math.ceil(range / cell) + 1;
    let snowy = 0;
    for (let gx = from; gx <= to; gx++) {
      for (let gz = from; gz <= to; gz++) {
        let top = -Infinity;
        let peakX = 0;
        let peakZ = 0;
        for (let ix = 0; ix < samples; ix++) {
          for (let iz = 0; iz < samples; iz++) {
            const x = gx * cell + ix * step;
            const z = gz * cell + iz * step;
            const sample = world.height(x, z);
            if (sample > top) {
              top = sample;
              peakX = x;
              peakZ = z;
            }
          }
        }
        if (top < GEM_RULES.black.minHeight) continue;
        if (peakX < -range || peakX >= range || peakZ < -range || peakZ >= range) continue;
        if (world.desertAt(peakX, peakZ) > GEM_RULES.black.maxDesert) continue;
        if (world.oasisAt(peakX, peakZ) > 0.2) continue;

        snowy++;
        expect(
          blackSites.some(
            (site) => Math.abs(site.x - peakX) < 1e-6 && Math.abs(site.z - peakZ) < 1e-6,
          ),
        ).toBe(true);
      }
    }
    expect(snowy).toBe(blackSites.length);

    for (const kind of ['diamond', 'blue', 'green', 'yellow'] as const) {
      const count = sites.filter((site) => site.kind === kind).length;
      // 单块绿洲 / 湖泊 / 岩柱本来就稀疏，这些宝石不应该铺满地图。
      expect(count).toBeLessThan(sites.length);
    }
  });
});
