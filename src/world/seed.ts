import { WORLD_SEED_MAX, WORLD_SEED_STORAGE_KEY } from '../config/world';

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 种子优先级：URL ?seed= → localStorage → 随机。
 * 与原始实现保持一致的“0 视为未提供”行为。
 */
export function resolveWorldSeed(
  search: string = window.location.search,
  storage: Storage | null = safeLocalStorage(),
): number {
  const urlSeed = Number(new URLSearchParams(search).get('seed'));
  const storedSeed = Number(storage?.getItem(WORLD_SEED_STORAGE_KEY));
  const seed = urlSeed || storedSeed || createRandomWorldSeed();
  persistWorldSeed(seed, storage);
  return seed;
}

export function persistWorldSeed(seed: number, storage: Storage | null = safeLocalStorage()): void {
  try {
    storage?.setItem(WORLD_SEED_STORAGE_KEY, String(seed));
  } catch {
    // 隐私模式下 localStorage 可能不可写；URL 上的种子仍然有效。
  }
}

export function createRandomWorldSeed(): number {
  return Math.floor(Math.random() * WORLD_SEED_MAX);
}

export function buildSeedUrl(seed: number): string {
  return `?seed=${seed}`;
}
