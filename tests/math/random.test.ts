import { describe, expect, it } from 'vitest';
import { createRandom, hashChunk } from '../../src/math/random';

describe('createRandom', () => {
  it('同一颗种子生成完全一致的序列', () => {
    const first = createRandom(2026);
    const second = createRandom(2026);
    const firstValues = Array.from({ length: 20 }, () => first());
    const secondValues = Array.from({ length: 20 }, () => second());

    expect(firstValues).toEqual(secondValues);
  });

  it('输出始终落在 [0, 1)', () => {
    const random = createRandom(7);
    for (let i = 0; i < 5000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('不同种子会得到不同序列', () => {
    const first = createRandom(1);
    const second = createRandom(2);
    const a = Array.from({ length: 10 }, () => first());
    const b = Array.from({ length: 10 }, () => second());

    expect(a).not.toEqual(b);
  });

  it('区块哈希稳定且区分坐标', () => {
    expect(hashChunk(42, 3, -5)).toBe(hashChunk(42, 3, -5));
    expect(hashChunk(42, 3, -5)).not.toBe(hashChunk(42, -5, 3));
  });
});
