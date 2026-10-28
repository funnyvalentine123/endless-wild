/**
 * 沙漠地形参数。
 *
 * 沙漠不是用低阈值噪声撒出来的小斑块，而是“大网格 + 单个大圆”：
 * - 每个 20km 单元最多生成一块沙漠，从结构上保证成片、不零散；
 * - 圆心在单元内抖动，半径再叠加低频扰动，避免出现规则棋盘；
 * - 单块沙漠最小直径约 13km，正常步速（8m/s）下穿越需要 1.5 个游戏日以上；
 * - 沿道路每隔 28km 额外保证一块沙漠，保证沿路前后 10km 内一定能遇到沙漠；
 * - 边界过渡带宽度 1.4km，沙漠与森林、草地之间是宽缓的渐变；
 * - 单块面积比早期版本更小，全世界沙漠占比因此收缩到 1/5 左右（实测 19%）。
 */
export const DESERT = {
  /** 沙漠分布网格边长（米）。 */
  cellSize: 20_000,
  /** 每个网格单元生成沙漠的概率。 */
  cellChance: 0.5,
  /** 基础半径（米）。 */
  radius: 7_000,
  /** 半径相对扰动幅度（±6%）。 */
  radiusVariance: 0.06,
  /** 圆心在单元内的抖动比例（0–0.5）。 */
  centerJitter: 0.24,
  /** 沙漠核心到普通地形的过渡带宽度（米）。 */
  edge: 1_400,
  /** 边界低频扰动振幅（米），让轮廓更自然。 */
  edgeWarp: 340,
  warpFrequency: 0.00032,

  /**
   * 沿道路的保障沙漠链：每隔 28km 沿道路保证一块完整沙漠（圆心在道路两侧少量抖动），
   * 使玩家沿路往任意方向走，最多约 8km 就会进入沙漠。这里只加密了道路所在的
   * 一列网格，加上单块半径收缩，全世界沙漠占比仍在 1/5 左右。
   */
  roadDesertSpacing: 28_000,
  /** 保障沙漠沿路方向的圆心抖动（±米）。 */
  roadDesertCenterJitter: 1_000,
  /** 保障沙漠横向（垂直于道路）的圆心抖动（±米）。 */
  roadDesertLateralJitter: 1_500,
  /** 保障沙漠半径抖动（±米）。 */
  roadDesertRadiusJitter: 400,

  /**
   * 沙丘高度场：少而大、彼此平滑过渡的沙丘。
   * - swell：约 2.2km 波长的大沙丘，单块覆盖范围大，最高可达小山规模；
   * - mid：约 1km 波长的次级隆起，负责中景的连绵起伏；
   * - ridge/ridge2：约 385m / 180m 波长的柔和沙脊，经过 smoothstep 处理，
   *   丘顶与丘间盆地之间是宽缓过渡，而不是尖锐的棱线；
   * - ripple/detail：只做表面细沙纹。
   * 所有分量叠加后最低约 5.5m，始终高于最高水位，沙漠内部不会出现积水。
   */
  dunes: {
    base: 6.5,
    swellFrequency: 0.00045,
    swellAmplitude: 26,
    midFrequency: 0.00095,
    midAmplitude: 14,
    ridgeFrequency: 0.0026,
    ridgeAmplitude: 7,
    ridge2Frequency: 0.0055,
    ridge2Amplitude: 3.5,
    rippleFrequency: 0.012,
    rippleAmplitude: 0.6,
    detailFrequency: 0.05,
    detailAmplitude: 0.35,
  },

  /** 每个植被候选点的仙人掌生成概率（沙漠核心）。 */
  cactusDensity: 0.02,

  /**
   * 沙漠地表散件用固定间距的网格生成，保证严格的数量上限：
   * - 风蚀岩柱：600m 网格、每 3 格取 1 格，任意 1000×1000m 内最多 3 个；
   * - 石头：350m 网格，任意 1000×1000m 内最多 16 个。
   */
  hoodooCellSize: 600,
  hoodooSpacing: 3,
  rockCellSize: 350,
  rockCellChance: 0.8,

  /** 沙漠因子达到该值后完全屏蔽雨雪，并锁定为晴天。 */
  weatherBlock: 0.6,
  /** 沙漠因子达到该值后天气操控 UI 不可用。 */
  weatherUiBlock: 0.4,
} as const;

/** 雨雪从该因子开始衰减。 */
export const DESERT_WEATHER_FADE_START = 0.1;
/** 雨雪在该因子处完全停止。 */
export const DESERT_WEATHER_FADE_END = 0.7;

/** 单块沙漠的最小直径（米）；一天正常步行约 9600m。 */
export const DESERT_MIN_DIAMETER = DESERT.radius * (1 - DESERT.radiusVariance) * 2;

/** 判断某个沙漠因子是否属于“沙漠核心”。 */
export const DESERT_CORE = 0.5;
