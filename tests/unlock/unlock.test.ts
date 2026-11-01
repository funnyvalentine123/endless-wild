import { describe, expect, it } from 'vitest';
import {
  CRAFT_FEATURE_ORDER,
  DEFAULT_UNLOCKED_FEATURES,
  FEATURES,
  FEATURE_ORDER,
  SPEED_FEATURE_PRESETS,
  UNLOCK_STORAGE_KEY,
  parseLayout,
  type FeatureId,
  type FeatureSpec,
} from '../../src/config/unlocks';
import { Inventory } from '../../src/inventory/Inventory';
import { UnlockStore } from '../../src/unlock/UnlockStore';
import { UnlockSystem, type UnlockSaveData } from '../../src/unlock/UnlockSystem';

/** 按图纸把宝石摆进槽位（每种宝石按格子顺序对应）。 */
function fillFeature(unlock: UnlockSystem, id: FeatureId, inventory: Inventory): void {
  FEATURES[id].cells.forEach((cell, index) => {
    if (!cell.kind) return;
    expect(unlock.placeGem(id, index, cell.kind, inventory)).toBe('ok');
  });
}

/** 背包里补足某个功能需要的全部宝石。 */
function grantNeeds(inventory: Inventory, id: FeatureId, extra = 0): void {
  for (const need of FEATURES[id].needs) {
    for (let index = 0; index < need.count + extra; index++) inventory.add(need.kind);
  }
}

function shapeKey(spec: FeatureSpec): string {
  return `${spec.cols}x${spec.rows}|${spec.cells.map((cell) => cell.kind ?? '.').join('')}`;
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();

  return {
    get length() {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  };
}

describe('合成图纸', () => {
  it('每张可合成图纸都能解析，汇总数量与格子数一致', () => {
    for (const id of CRAFT_FEATURE_ORDER) {
      const spec = FEATURES[id];
      const filled = spec.cells.filter((cell) => cell.kind !== null);

      expect(spec.total).toBe(filled.length);
      expect(spec.needs.reduce((sum, need) => sum + need.count, 0)).toBe(spec.total);
      // 每行长度相同，格子下标可以直接换算成行列（粒子特效依赖这个顺序）。
      expect(spec.cells).toHaveLength(spec.rows * spec.cols);
      spec.cells.forEach((cell, index) => {
        expect(cell.row).toBe(Math.floor(index / spec.cols));
        expect(cell.col).toBe(index % spec.cols);
      });
      // 每种需要的宝石都要真的出现在图纸上。
      for (const need of spec.needs) {
        expect(filled.some((cell) => cell.kind === need.kind)).toBe(true);
      }
    }
  });

  it('图纸出现未知字符时直接报错', () => {
    expect(() => parseLayout(['gy', 'z'])).toThrow(/无法识别/);
  });

  it('所有可合成功能的形状互不相同', () => {
    const keys = CRAFT_FEATURE_ORDER.map((id) => shapeKey(FEATURES[id]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('行走 / 跳跃 / 背包是默认能力，不出现在合成台里', () => {
    for (const id of DEFAULT_UNLOCKED_FEATURES) {
      expect(FEATURE_ORDER).toContain(id);
      expect(FEATURES[id].total).toBe(0);
      expect(FEATURES[id].cells).toHaveLength(0);
      expect(CRAFT_FEATURE_ORDER).not.toContain(id);
    }
    // 去掉三个默认能力后，合成台仍然有足够多的待解锁功能。
    expect(CRAFT_FEATURE_ORDER).toHaveLength(FEATURE_ORDER.length - DEFAULT_UNLOCKED_FEATURES.length);
    expect(CRAFT_FEATURE_ORDER.length).toBeGreaterThanOrEqual(12);
  });

  it('难度梯度：宝石总数只增不减，且每张图纸至少是旧版的两倍', () => {
    const totals = CRAFT_FEATURE_ORDER.map((id) => FEATURES[id].total);
    for (let index = 1; index < totals.length; index++) {
      expect(totals[index]).toBeGreaterThanOrEqual(totals[index - 1]);
    }
    // 旧版最简单的一张只要 2 颗宝石，这里至少翻倍到 4 颗。
    for (const total of totals) expect(total).toBeGreaterThanOrEqual(4);
    // 最高一阶要 20 颗以上，整体节奏才够长。
    expect(FEATURES.speed7.total).toBeGreaterThanOrEqual(20);

    // 旧版各功能的宝石总数（不含默认能力与新加的雷达）：新版必须至少翻倍。
    const legacyTotals: Partial<Record<FeatureId, number>> = {
      speed1: 2,
      speed2: 3,
      sprint: 4,
      time: 5,
      speed3: 5,
      weather: 5,
      view: 5,
      sky: 5,
      save: 6,
      speed4: 6,
      speed5: 7,
      speed6: 9,
      speed7: 10,
    };
    for (const [id, legacy] of Object.entries(legacyTotals) as Array<[FeatureId, number]>) {
      expect(FEATURES[id].total).toBeGreaterThanOrEqual(legacy * 2);
    }

    // 7 个速度档位：每档都要单独合成，档位越高需要的宝石越多。
    const speeds: FeatureId[] = ['speed1', 'speed2', 'speed3', 'speed4', 'speed5', 'speed6', 'speed7'];
    const speedTotals = speeds.map((id) => FEATURES[id].total);
    for (let index = 1; index < speedTotals.length; index++) {
      expect(speedTotals[index]).toBeGreaterThan(speedTotals[index - 1]);
    }
    for (let index = 0; index < speeds.length; index++) {
      const preset = SPEED_FEATURE_PRESETS[speeds[index]];
      expect(preset).toBeDefined();
      if (index > 0) {
        expect(preset!).toBeGreaterThan(SPEED_FEATURE_PRESETS[speeds[index - 1]]!);
      }
    }

    // 顶级图纸要稀有宝石，普通功能不会出现黑宝石。
    expect(FEATURES.speed7.needs.some((need) => need.kind === 'black')).toBe(true);
    for (const id of CRAFT_FEATURE_ORDER) {
      if (id === 'speed7') continue;
      expect(FEATURES[id].needs.some((need) => need.kind === 'black')).toBe(false);
    }
  });

  it('越靠后的功能消耗越多常见的绿 / 黄宝石', () => {
    const count = (id: FeatureId, kind: 'green' | 'yellow' | 'blue'): number =>
      FEATURES[id].needs.find((need) => need.kind === kind)?.count ?? 0;

    // 前两阶只需要个位数的绿 / 黄宝石，终阶要各 5 颗以上。
    expect(count('speed1', 'green')).toBeLessThanOrEqual(2);
    expect(count('speed7', 'green')).toBeGreaterThanOrEqual(5);
    expect(count('speed7', 'yellow')).toBeGreaterThanOrEqual(5);
    expect(count('speed6', 'green')).toBeGreaterThanOrEqual(4);

    // 宝石雷达是中阶功能，要同时消耗蓝 / 绿 / 黄。
    for (const kind of ['blue', 'green', 'yellow'] as const) {
      expect(count('radar', kind)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('槽位摆放', () => {
  it('拒绝越界、留白格、已占用与库存不足', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();

    // speed1 第一行是「.b.」，0 号格是留白；1 号格要蓝宝石。
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('no-stock');
    expect(unlock.placeGem('speed1', 99, 'blue', inventory)).toBe('no-cell');
    expect(unlock.placeGem('speed1', 0, 'green', inventory)).toBe('void-cell');

    inventory.add('blue');
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('occupied');
    expect(unlock.filledCount('speed1')).toBe(1);

    expect(unlock.removeGem('speed1', 1)).toBe(true);
    expect(unlock.removeGem('speed1', 1)).toBe(false);
    expect(unlock.filledCount('speed1')).toBe(0);
    expect(unlock.toSave()).toBeUndefined();
  });

  it('不同功能的草稿会互相预留同一颗宝石', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    inventory.add('blue');

    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('ok');
    // 唯一一颗蓝宝石已经被「速度 · 1 档」的草稿占用。
    expect(unlock.available('blue', inventory, 'speed2')).toBe(0);
    expect(unlock.placeGem('speed2', 0, 'blue', inventory)).toBe('no-stock');
    // 排除自身时，当前功能仍然能继续摆。
    expect(unlock.available('blue', inventory, 'speed1')).toBe(1);

    unlock.removeGem('speed1', 1);
    expect(unlock.placeGem('speed2', 0, 'blue', inventory)).toBe('ok');
    expect(unlock.reserved('blue', 'speed2')).toBe(0);
    expect(unlock.reserved('blue')).toBe(1);
  });

  it('已解锁或已合成的功能不再接受摆放', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    inventory.add('blue');

    unlock.unlockAll();
    expect(unlock.isUnlocked('speed1')).toBe(true);
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('unlocked');
    expect(unlock.removeGem('speed1', 1)).toBe(false);
    expect(unlock.clearDraft('speed1')).toBe(false);
    // 调试解锁不会把功能标成“已合成”，图纸特效保持未完成态。
    expect(unlock.isCompleted('speed1')).toBe(false);
    expect(unlock.status('speed1')).toBe('unlocked');
    // 默认能力同样始终处于已解锁态。
    expect(unlock.isUnlocked('walk')).toBe(true);
    expect(unlock.isUnlocked('jump')).toBe(true);
    expect(unlock.isUnlocked('bag')).toBe(true);
  });

  it('默认能力开局就是已解锁状态', () => {
    const unlock = new UnlockSystem();
    expect(unlock.status('walk')).toBe('unlocked');
    expect(unlock.status('jump')).toBe('unlocked');
    expect(unlock.status('bag')).toBe('unlocked');
    expect(unlock.status('speed1')).toBe('locked');
    expect(unlock.speedLimit()).toBe(1);
  });
});

describe('合成校验', () => {
  it('槽位没摆满时拒绝合成', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    grantNeeds(inventory, 'speed1');

    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('ok');
    const result = unlock.craft('speed1', inventory);
    expect(result.outcome).toBe('incomplete');
    expect(result.message).toContain('3');
    // 失败不动库存。
    expect(inventory.count('blue')).toBe(1);
    expect(inventory.count('green')).toBe(2);
    expect(inventory.count('yellow')).toBe(1);
  });

  it('宝石种类数量不对时拒绝合成', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    for (let index = 0; index < 4; index++) inventory.add('blue');

    // 图纸要「蓝1 绿2 黄1」，这里四个槽位全摆蓝宝石。
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 3, 'blue', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 4, 'blue', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 5, 'blue', inventory)).toBe('ok');
    const result = unlock.craft('speed1', inventory);
    expect(result.outcome).toBe('mismatch');
    expect(result.message).toContain('多');
    expect(inventory.count('blue')).toBe(4);
  });

  it('摆放正确但库存被别人花掉时拒绝合成', () => {
    const unlock = new UnlockSystem();
    const rich = new Inventory();
    grantNeeds(rich, 'speed1');
    fillFeature(unlock, 'speed1', rich);

    const empty = new Inventory();
    const result = unlock.craft('speed1', empty);
    expect(result.outcome).toBe('missing');
    expect(unlock.status('speed1')).toBe('locked');
  });

  it('完全匹配时消耗宝石并永久解锁', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    grantNeeds(inventory, 'speed1');
    inventory.add('purple');

    fillFeature(unlock, 'speed1', inventory);
    expect(unlock.filledCount('speed1')).toBe(4);

    const result = unlock.craft('speed1', inventory);
    expect(result.outcome).toBe('ok');
    expect(result.feature?.id).toBe('speed1');
    expect(inventory.count('blue')).toBe(0);
    expect(inventory.count('green')).toBe(0);
    expect(inventory.count('yellow')).toBe(0);
    // 别的宝石不受影响。
    expect(inventory.count('purple')).toBe(1);
    expect(unlock.status('speed1')).toBe('completed');
    expect(unlock.isUnlocked('speed1')).toBe(true);
    expect(unlock.isCompleted('speed1')).toBe(true);
    // 草稿被清掉，但图纸仍然能渲染出完成态。
    expect(unlock.draft('speed1').every((gem) => gem === null)).toBe(true);
    expect(unlock.toSave()?.drafts).toBeUndefined();
    expect(unlock.toSave()?.unlocked).toEqual(['speed1']);

    expect(unlock.craft('speed1', inventory).outcome).toBe('unlocked');
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('unlocked');
  });

  it('不存在的功能返回 unknown', () => {
    const unlock = new UnlockSystem();
    expect(unlock.craft('nope' as FeatureId, new Inventory()).outcome).toBe('unknown');
  });

  it('只校验宝石种类与数量，同一图纸内的排列顺序不限', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    grantNeeds(inventory, 'speed1');

    // 图纸要求 蓝1 绿2 黄1，这里把蓝 / 绿故意反着摆。
    expect(unlock.placeGem('speed1', 1, 'green', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 3, 'blue', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 4, 'green', inventory)).toBe('ok');
    expect(unlock.placeGem('speed1', 5, 'yellow', inventory)).toBe('ok');
    expect(unlock.craft('speed1', inventory).outcome).toBe('ok');
  });
});

describe('速度档位', () => {
  it('没有任何速度档位时上限保持 ×1', () => {
    const unlock = new UnlockSystem();
    expect(unlock.speedLimit()).toBe(1);
    expect(unlock.speedUnlocked()).toBe(false);
  });

  it('上限取已解锁档位里的最高一档', () => {
    const unlock = new UnlockSystem();
    unlock.fromSave({ unlocked: ['speed1', 'speed5'] }, new Inventory());

    expect(unlock.speedLimit()).toBe(5);
    expect(unlock.speedUnlocked()).toBe(true);
    expect(unlock.unlocked()).toEqual([...DEFAULT_UNLOCKED_FEATURES, 'speed1', 'speed5']);
  });

  it('调试一键解锁后直接到 ×7', () => {
    const unlock = new UnlockSystem();
    const added = unlock.unlockAll();
    expect(added.length).toBeGreaterThanOrEqual(12);
    expect(unlock.speedLimit()).toBe(7);
    // 默认能力本来就在，不会再被算进“新增”里。
    expect(added).not.toContain('walk');
  });

  it('调试解锁会清掉残留草稿，宝石仍留在背包里', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    inventory.add('blue');
    unlock.placeGem('speed1', 1, 'blue', inventory);
    expect(unlock.filledCount('speed1')).toBe(1);

    unlock.unlockAll();
    expect(unlock.filledCount('speed1')).toBe(0);
    // 调试解锁不消耗宝石。
    expect(inventory.count('blue')).toBe(1);
  });
});

describe('解锁存档', () => {
  it('存档往返：解锁状态、草稿与新手礼包标记都会保留', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    grantNeeds(inventory, 'time');
    unlock.placeGem('time', 1, 'green', inventory);
    unlock.markStarterGranted();

    const saved = unlock.toSave();
    expect(saved?.drafts?.time?.[1]).toBe('green');
    expect(saved?.starterGranted).toBe(true);

    const restored = new UnlockSystem();
    const restoredInventory = new Inventory();
    grantNeeds(restoredInventory, 'time');
    restored.fromSave(saved, restoredInventory);

    expect(restored.starterGranted).toBe(true);
    expect(restored.filledCount('time')).toBe(1);
    expect(restored.draft('time')[1]).toBe('green');
    expect(restored.status('time')).toBe('locked');
  });

  it('合成完成与调试标记都会写进存档', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    grantNeeds(inventory, 'speed1');
    fillFeature(unlock, 'speed1', inventory);
    unlock.craft('speed1', inventory);

    const saved = unlock.toSave();
    expect(saved?.completed).toEqual(['speed1']);
    expect(saved?.unlocked).toEqual(['speed1']);

    const restored = new UnlockSystem();
    restored.fromSave(saved, new Inventory());
    expect(restored.status('speed1')).toBe('completed');
    // 默认能力不依赖存档，读取后仍然是已解锁。
    expect(restored.status('walk')).toBe('unlocked');

    const debugged = new UnlockSystem();
    debugged.unlockAll();
    const debugSave = debugged.toSave();
    expect(debugSave?.debug).toBe(true);
    // 默认能力不写进存档，只记录调试解锁出来的那些。
    expect(debugSave?.unlocked).toEqual([...CRAFT_FEATURE_ORDER]);
    expect(debugSave?.completed).toBeUndefined();
  });

  it('坏存档：多余宝石被裁剪、留白格宝石被丢弃、已解锁功能的草稿被删除', () => {
    const unlock = new UnlockSystem();
    const inventory = new Inventory();
    inventory.add('blue');
    inventory.add('blue');

    const { cells } = FEATURES.time;
    const value: UnlockSaveData = {
      unlocked: ['speed1'],
      drafts: {
        // 已解锁的功能不该再有草稿。
        speed1: ['blue', 'green'],
        // 背包只有 2 颗蓝宝石，其余要被退回；留白格上的宝石直接丢弃。
        time: cells.map(() => 'blue'),
        // 未知功能直接忽略。
        mystery: ['blue'],
      },
    };
    unlock.fromSave(value, inventory);

    expect(unlock.status('speed1')).toBe('unlocked');
    expect(unlock.draft('speed1').every((gem) => gem === null)).toBe(true);
    expect(unlock.filledCount('time')).toBe(2);
    const timeDraft = unlock.draft('time');
    expect(timeDraft.filter(Boolean)).toHaveLength(2);
  });

  it('非法输入按“没有进度”处理，空状态不产生存档段', () => {
    const unlock = new UnlockSystem();
    unlock.fromSave(null, new Inventory());
    unlock.fromSave('nope', new Inventory());
    unlock.fromSave({ unlocked: [42, 'nope'], completed: 'oops', drafts: [] }, new Inventory());

    // 只剩开局默认能力，它们不写进存档。
    expect(unlock.unlocked()).toEqual([...DEFAULT_UNLOCKED_FEATURES]);
    expect(unlock.toSave()).toBeUndefined();
  });

  it('世界存档恢复是合并：旧存档不会抹掉更新的解锁进度', () => {
    const unlock = new UnlockSystem();
    unlock.fromSave(
      { unlocked: [...CRAFT_FEATURE_ORDER], debug: true, starterGranted: true },
      new Inventory(),
    );
    expect(unlock.speedLimit()).toBe(7);

    // 世界存档里只有 speed1：合并后仍然保留全部解锁，草稿也不会复活。
    unlock.mergeFromSave(
      {
        unlocked: ['speed1'],
        completed: ['speed1'],
        starterGranted: true,
        drafts: { speed2: ['blue', 'green', 'yellow'] },
      },
      new Inventory(),
    );

    expect(unlock.unlocked()).toEqual([...DEFAULT_UNLOCKED_FEATURES, ...CRAFT_FEATURE_ORDER]);
    expect(unlock.status('speed1')).toBe('completed');
    expect(unlock.debugUnlocked).toBe(true);
    expect(unlock.draft('speed2').filter(Boolean)).toHaveLength(0);
  });

  it('合并时以当前草稿为准，不会被旧存档覆盖', () => {
    const inventory = new Inventory();
    grantNeeds(inventory, 'speed1');

    const unlock = new UnlockSystem();
    expect(unlock.placeGem('speed1', 1, 'blue', inventory)).toBe('ok');
    unlock.mergeFromSave({ drafts: { speed1: ['green', 'green'] } }, inventory);

    expect(unlock.draft('speed1')[1]).toBe('blue');
    expect(unlock.filledCount('speed1')).toBe(1);
  });
});

describe('解锁独立存档槽', () => {
  it('读写往返，空进度删除记录，损坏内容按无进度处理', () => {
    const storage = memoryStorage();
    const store = new UnlockStore(UNLOCK_STORAGE_KEY, storage);

    expect(store.available).toBe(true);
    expect(store.load()).toBeNull();

    expect(store.save({ unlocked: ['speed1'], starterGranted: true })).toBe(true);
    expect(store.load()).toEqual({ unlocked: ['speed1'], starterGranted: true });

    store.save(undefined);
    expect(storage.getItem(UNLOCK_STORAGE_KEY)).toBeNull();
    expect(store.load()).toBeNull();

    storage.setItem(UNLOCK_STORAGE_KEY, '{broken');
    expect(store.load()).toBeNull();
    storage.setItem(UNLOCK_STORAGE_KEY, '[1,2]');
    expect(store.load()).toBeNull();

    store.clear();
    expect(storage.getItem(UNLOCK_STORAGE_KEY)).toBeNull();
  });

  it('没有存储时保存失败但不抛错', () => {
    const store = new UnlockStore(UNLOCK_STORAGE_KEY, null);
    expect(store.available).toBe(false);
    expect(store.save({ unlocked: ['speed1'] })).toBe(false);
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });
});
