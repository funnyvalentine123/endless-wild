/**
 * 地形合成参数。
 *
 * 频率越低，地貌特征越大；振幅决定起伏高度。
 * 水体通过“低频大特征 + 较高阈值”控制总量，避免每隔一段路就遇到河湖。
 */
export const TERRAIN = {
  base: {
    // 抬高基准面，让“低地”保持为陆地；水只出现在湖/河刻蚀出来的区域。
    height: 10,
    amplitude: 5,
    frequency: 0.0011,
  },
  hill: {
    // 降低高频丘陵振幅，换取更多缓坡和开阔地。
    frequency: 0.0065,
    detailFrequency: 0.016,
    amplitude: 4.5,
    weight: 0.6,
    detailWeight: 0.15,
  },
  mountain: {
    // 较高的起山阈值 + 较低振幅 + 更宽的脊线，让山体过渡更缓和。
    frequency: 0.0022,
    threshold: 0.22,
    amplitude: 52,
    exponent: 1.4,
    ridgeFrequency: 0.0065,
    ridgeWeight: 0.3,
    ridgeOffset: 40,
  },
  detail: {
    frequency: 0.06,
    amplitude: 0.22,
  },
  lake: {
    // 更低频率 → 湖更大；更高阈值 → 湖更少。start/end 之间是宽缓的湖岸。
    frequency: 0.0012,
    start: 0.68,
    end: 0.9,
    depth: -3.2,
  },
  river: {
    // 低频让河道更宽、更少；start 是外岸，end 是河心（反向 smoothstep）。
    frequency: 0.0008,
    warpFrequency: 0.003,
    warpAmplitude: 30,
    warpOffsetZ: 31,
    warpOffsetX: -17,
    start: 0.07,
    end: 0.015,
    depth: -2.2,
    /** 河畔生物群系的判定阈值。 */
    bank: 0.105,
  },
} as const;
