import { describe, expect, it } from 'vitest';
import { angularDifference } from '../../src/math/angle';
import { clamp, lerp, smoothstep } from '../../src/math/scalar';

describe('scalar', () => {
  it('clamp / lerp', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(3, 0, 1)).toBe(1);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('smoothstep 支持反向边界', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(1, 0, 0)).toBe(1);
    expect(smoothstep(1, 0, 1)).toBe(0);
  });
});

describe('angularDifference', () => {
  it('取最短转向', () => {
    expect(angularDifference(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angularDifference(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(angularDifference(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
  });
});
