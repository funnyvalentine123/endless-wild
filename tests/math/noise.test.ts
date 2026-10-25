import { describe, expect, it } from 'vitest';
import { createNoise2D } from '../../src/math/noise';

describe('createNoise2D', () => {
  it('同种子同坐标可复现', () => {
    const first = createNoise2D(123);
    const second = createNoise2D(123);

    for (const [x, y] of [[0, 0], [0.37, -12.5], [100.25, 3.75]]) {
      expect(first(x, y)).toBeCloseTo(second(x, y), 12);
    }
  });

  it('不同种子产生不同地形场', () => {
    const first = createNoise2D(1);
    const second = createNoise2D(2);
    const valuesA = Array.from({ length: 10 }, (_, i) => first(i * 0.13, i * -0.27));
    const valuesB = Array.from({ length: 10 }, (_, i) => second(i * 0.13, i * -0.27));

    expect(valuesA).not.toEqual(valuesB);
  });

  it('在常用采样范围内保持有限', () => {
    const noise = createNoise2D(999);
    for (let i = 0; i < 200; i++) {
      const value = noise((i - 100) * 0.37, (100 - i) * 0.21);
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(1.5);
    }
  });
});
