import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD_SEED_STORAGE_KEY } from '../../src/config/world';
import {
  buildSeedUrl,
  createRandomWorldSeed,
  resolveWorldSeed,
} from '../../src/world/seed';

function memoryStorage(initial: string | null = null): Storage {
  let value = initial;

  return {
    get length() {
      return value === null ? 0 : 1;
    },
    clear() {
      value = null;
    },
    getItem(key: string) {
      return key === WORLD_SEED_STORAGE_KEY ? value : null;
    },
    key(index: number) {
      return index === 0 && value !== null ? WORLD_SEED_STORAGE_KEY : null;
    },
    removeItem(key: string) {
      if (key === WORLD_SEED_STORAGE_KEY) value = null;
    },
    setItem(key: string, next: string) {
      if (key === WORLD_SEED_STORAGE_KEY) value = next;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('世界种子', () => {
  it('URL 种子优先于本地存储，并被持久化', () => {
    const storage = memoryStorage('77');

    expect(resolveWorldSeed('?seed=42', storage)).toBe(42);
    expect(storage.getItem(WORLD_SEED_STORAGE_KEY)).toBe('42');
  });

  it('没有 URL 种子时使用本地种子', () => {
    const storage = memoryStorage('88');

    expect(resolveWorldSeed('', storage)).toBe(88);
    expect(storage.getItem(WORLD_SEED_STORAGE_KEY)).toBe('88');
  });

  it('两者都没有时回退到随机种子', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    const storage = memoryStorage();

    expect(resolveWorldSeed('?seed=0', storage)).toBe(123_456);
    expect(storage.getItem(WORLD_SEED_STORAGE_KEY)).toBe('123456');
  });

  it('随机种子范围稳定', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(createRandomWorldSeed()).toBe(999_999);
  });

  it('生成可写入 URL 的种子', () => {
    expect(buildSeedUrl(123)).toBe('?seed=123');
  });
});
