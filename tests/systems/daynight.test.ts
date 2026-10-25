import { describe, expect, it } from 'vitest';
import { DayNightCycle } from '../../src/systems/DayNightCycle';

describe('DayNightCycle', () => {
  it('初始为白天，路灯熄灭', () => {
    const cycle = new DayNightCycle();
    const snapshot = cycle.snapshot;

    expect(snapshot.daylightFactor).toBe(1);
    expect(snapshot.lampIntensity).toBe(0);
    expect(snapshot.sunIntensity).toBeGreaterThan(2);
  });

  it('推进到夜间后路灯点亮、星空出现', () => {
    const cycle = new DayNightCycle();
    cycle.update(24, true);

    const snapshot = cycle.snapshot;
    expect(snapshot.daylightFactor).toBe(0);
    expect(snapshot.lampIntensity).toBeCloseTo(3);
    expect(snapshot.starOpacity).toBeCloseTo(1);
    expect(snapshot.sunIntensity).toBeLessThan(1);
  });

  it('可以直接设置时刻用于调试', () => {
    const cycle = new DayNightCycle();
    cycle.setHour(21);

    expect(cycle.hour).toBe(21);
    expect(cycle.snapshot.lampIntensity).toBeCloseTo(3);
    expect(cycle.snapshot.starOpacity).toBeCloseTo(1);

    cycle.setHour(-1);
    expect(cycle.hour).toBe(23);
  });

  it('太阳方向始终归一化', () => {
    const cycle = new DayNightCycle();
    for (let i = 0; i < 12; i++) {
      cycle.update(2, true);
      expect(cycle.snapshot.sunDirection.length()).toBeCloseTo(1, 6);
    }
  });
});
