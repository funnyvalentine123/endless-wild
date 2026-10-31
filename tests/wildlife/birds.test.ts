import { describe, expect, it } from 'vitest';
import { BIRD_CONFIG } from '../../src/config/wildlife';

describe('鸟的落地 / 飞行节奏', () => {
  it('地面停留时间与飞行时间之比为 1:3', () => {
    expect(BIRD_CONFIG.groundToFlightRatio).toBeCloseTo(1 / 3, 8);

    const groundMin = BIRD_CONFIG.flightMin * BIRD_CONFIG.groundToFlightRatio;
    const groundMax = BIRD_CONFIG.flightMax * BIRD_CONFIG.groundToFlightRatio;
    expect(groundMin).toBeCloseTo(BIRD_CONFIG.flightMin / 3, 8);
    expect(groundMax).toBeCloseTo(BIRD_CONFIG.flightMax / 3, 8);
  });

  it('单次飞行 / 地面停留时长都是可观察的范围', () => {
    expect(BIRD_CONFIG.flightMin).toBeGreaterThan(5);
    expect(BIRD_CONFIG.flightMax).toBeGreaterThan(BIRD_CONFIG.flightMin);
    // 落地 5~8.7 秒：短到能频繁看到落地，长到不是一闪而过。
    expect(BIRD_CONFIG.flightMin * BIRD_CONFIG.groundToFlightRatio).toBeGreaterThan(3);
    expect(BIRD_CONFIG.flightMax * BIRD_CONFIG.groundToFlightRatio).toBeLessThan(12);
  });

  it('落地与起飞的过渡时长不会吃掉地面停留时间', () => {
    expect(BIRD_CONFIG.landingDuration).toBeGreaterThan(0.8);
    expect(BIRD_CONFIG.takeoffDuration).toBeGreaterThan(0.8);
    expect(BIRD_CONFIG.landingDuration).toBeLessThan(
      BIRD_CONFIG.flightMin * BIRD_CONFIG.groundToFlightRatio,
    );
    expect(BIRD_CONFIG.takeoffDuration).toBeLessThan(
      BIRD_CONFIG.flightMin * BIRD_CONFIG.groundToFlightRatio,
    );
  });

  it('鸟群数量仍然保持实例化渲染的低开销', () => {
    expect(BIRD_CONFIG.maxCount).toBeLessThanOrEqual(16);
    expect(BIRD_CONFIG.spawnRadiusMax).toBeGreaterThan(BIRD_CONFIG.spawnRadiusMin);
    expect(BIRD_CONFIG.despawnRadius).toBeGreaterThan(BIRD_CONFIG.spawnRadiusMax);
  });
});
