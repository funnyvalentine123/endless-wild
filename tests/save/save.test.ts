import { describe, expect, it } from 'vitest';
import {
  parseSave,
  saveFileName,
  stringifySave,
  summarizeSave,
  validateSave,
} from '../../src/save/codec';
import { SaveService } from '../../src/save/SaveService';
import { SaveStore } from '../../src/save/SaveStore';
import {
  SAVE_FORMAT,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  type PlayerSave,
  type SaveData,
} from '../../src/save/types';

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

function fullSave(overrides: Partial<SaveData> = {}): SaveData {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    seed: 1234,
    hour: 18.5,
    player: { x: 12.5, y: 8, z: -33, yaw: 0.7, pitch: -0.1, walked: 456 },
    ...overrides,
  };
}

describe('存档格式', () => {
  it('快照可以序列化并原样解析回来', () => {
    const data = fullSave({ sections: { inventory: { apples: 3 } } });
    const parsed = parseSave(stringifySave(data));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data).toEqual(data);
  });

  it('拒绝非 JSON、错误格式、超前版本与无效坐标', () => {
    expect(parseSave('not json').ok).toBe(false);
    expect(parseSave('[1,2]').ok).toBe(false);

    const wrongFormat = validateSave({ ...fullSave(), format: 'other-game' });
    expect(wrongFormat.ok).toBe(false);

    const future = validateSave({ ...fullSave(), version: SAVE_VERSION + 1 });
    expect(future.ok).toBe(false);

    const badPlayer = validateSave({ ...fullSave(), player: { x: Number.NaN, z: 1 } });
    expect(badPlayer.ok).toBe(false);

    const badSeed = validateSave({ ...fullSave(), seed: 0 });
    expect(badSeed.ok).toBe(false);
  });

  it('缺失的可选字段有安全默认值，超范围时刻会归一化', () => {
    const parsed = validateSave({
      format: SAVE_FORMAT,
      version: 1,
      seed: 99,
      hour: 25.5,
      player: { x: 1, z: 2 },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data.hour).toBeCloseTo(1.5, 6);
    expect(parsed.data.player).toEqual({ x: 1, y: 0, z: 2, yaw: 0, pitch: 0, walked: 0 });
  });

  it('扩展段与未知字段会被保留，便于以后加背包等系统', () => {
    const parsed = validateSave({
      ...fullSave(),
      sections: { inventory: { apples: 2 }, quests: { step: 4 } },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.sections).toEqual({
      inventory: { apples: 2 },
      quests: { step: 4 },
    });
  });

  it('导出文件名带种子与保存时间', () => {
    expect(saveFileName(fullSave())).toContain('endless-wild-1234-');
    expect(saveFileName(fullSave())).toMatch(/\.json$/);
  });
});

describe('本地存档槽位', () => {
  it('写入、读取与删除', () => {
    const store = new SaveStore(SAVE_STORAGE_KEY, memoryStorage());

    expect(store.load()).toBeNull();
    expect(store.save(fullSave())).toBe(true);
    expect(store.load()?.seed).toBe(1234);
    expect(store.available).toBe(true);

    store.clear();
    expect(store.load()).toBeNull();
  });

  it('存储被禁用时安全降级，不会抛错', () => {
    const store = new SaveStore(SAVE_STORAGE_KEY, null);

    expect(store.available).toBe(false);
    expect(store.save(fullSave())).toBe(false);
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });

  it('内容损坏时按“没有存档”处理', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_STORAGE_KEY, '{broken');

    const store = new SaveStore(SAVE_STORAGE_KEY, storage);
    expect(store.load()).toBeNull();
  });
});

interface Harness {
  readonly save: SaveService;
  readonly player: PlayerSave;
  restores: number;
  reloads: number[];
}

function createHarness(seed: number): Harness {
  const player: PlayerSave = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, walked: 0 };
  let hour = 8;
  let restores = 0;
  const reloads: number[] = [];

  const save = new SaveService(
    {
      seed,
      getHour: () => hour,
      setHour: (value) => {
        hour = value;
      },
      getPlayer: () => ({ ...player }),
      restorePlayer: (value) => {
        Object.assign(player, value);
        restores += 1;
      },
      reloadToSeed: (value) => {
        reloads.push(value);
      },
    },
    new SaveStore(SAVE_STORAGE_KEY, memoryStorage()),
  );

  return {
    save,
    player,
    get restores() {
      return restores;
    },
    reloads,
  };
}

describe('存档业务', () => {
  it('保存后可以载入同一世界的存档并恢复位置与时刻', () => {
    const harness = createHarness(1234);
    harness.player.x = 100;
    harness.player.z = -50;
    harness.save.saveLocal();

    expect(harness.save.readLocal()?.player.x).toBe(100);
    expect(summarizeSave(harness.save.readLocal()!).x).toBe(100);

    // 模拟继续游玩后回档。
    harness.player.x = 900;
    const result = harness.save.loadLocal();

    expect(result.outcome).toBe('applied');
    expect(harness.player.x).toBe(100);
    expect(harness.restores).toBe(1);
  });

  it('启动时只在种子一致时自动续档', () => {
    const source = createHarness(1234);
    source.player.x = 77;
    source.save.saveLocal();
    const raw = source.save.readLocal()!;

    const same = createHarness(1234);
    same.save.importText(stringifySave(raw));
    expect(same.save.restoreOnStart()).toBe(true);
    expect(same.player.x).toBe(77);

    const other = createHarness(4321);
    other.save.importText(stringifySave(raw));
    expect(other.save.restoreOnStart()).toBe(false);
    expect(other.reloads).toEqual([1234]);
  });

  it('载入其它种子的存档会请求重载到那个世界', () => {
    const harness = createHarness(500);
    const result = harness.save.importText(stringifySave(fullSave({ seed: 1234 })));

    expect(result.outcome).toBe('reloaded');
    expect(harness.reloads).toEqual([1234]);
    expect(harness.save.readLocal()?.seed).toBe(1234);
    expect(harness.restores).toBe(0);
  });

  it('导入损坏文件不会覆盖已有存档', () => {
    const harness = createHarness(1234);
    harness.player.x = 55;
    harness.save.saveLocal();

    const result = harness.save.importText('{"format":"other"}');

    expect(result.outcome).toBe('invalid');
    expect(harness.save.readLocal()?.player.x).toBe(55);
  });

  it('注册的扩展段随存档保存并在载入时恢复', () => {
    const harness = createHarness(1234);
    let apples = 5;
    let restoredApples = 0;

    harness.save.registerSection({
      key: 'inventory',
      capture: () => ({ apples }),
      restore: (value) => {
        restoredApples = (value as { apples: number }).apples;
      },
    });

    apples = 9;
    harness.save.saveLocal();

    apples = 0;
    harness.save.loadLocal();

    expect(harness.save.readLocal()?.sections).toEqual({ inventory: { apples: 9 } });
    expect(restoredApples).toBe(9);
  });

  it('没有本地存档时给出明确提示', () => {
    const harness = createHarness(1234);

    expect(harness.save.loadLocal().outcome).toBe('missing');
    expect(harness.save.removeLocal().outcome).toBe('removed');
  });
});
