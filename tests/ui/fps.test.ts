import { describe, expect, it } from 'vitest';
import { FpsMeter } from '../../src/ui/fps';

describe('实时帧率统计', () => {
  it('按真实时间窗口统计，不依赖游戏内 dt', () => {
    const meter = new FpsMeter(100);
    const values: number[] = [];

    // 模拟稳定 60fps：每 1/60 秒一帧。
    let time = 0;
    for (let frame = 0; frame < 180; frame++) {
      time += 1000 / 60;
      const value = meter.sample(time);
      if (value !== null) values.push(value);
    }

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).toBeGreaterThan(59);
      expect(value).toBeLessThan(61);
    }
    expect(meter.value).toBeCloseTo(values[values.length - 1]!, 6);
  });

  it('窗口未结束时返回 null，保持上一次的帧率', () => {
    const meter = new FpsMeter(100);
    // 第一帧只作为窗口起点。
    expect(meter.sample(0)).toBeNull();
    expect(meter.sample(50)).toBeNull();
    expect(meter.value).toBe(0);

    // 100ms 窗口内两帧（50ms / 100ms）=> 20fps
    const value = meter.sample(100);
    expect(value).not.toBeNull();
    expect(value!).toBeCloseTo(20, 6);
    expect(meter.value).toBeCloseTo(value!, 6);

    // 新窗口尚未结束：返回 null，数值保持不变。
    expect(meter.sample(150)).toBeNull();
    expect(meter.sample(180)).toBeNull();
    expect(meter.value).toBeCloseTo(value!, 6);
  });

  it('掉帧时帧率会明显下降', () => {
    const meter = new FpsMeter(100);
    let time = 0;
    let slow: number | null = null;

    for (let frame = 0; frame < 7; frame++) {
      time += 50; // 20fps
      slow = meter.sample(time);
    }

    expect(slow).not.toBeNull();
    expect(slow!).toBeGreaterThan(18);
    expect(slow!).toBeLessThan(22);
  });
});
