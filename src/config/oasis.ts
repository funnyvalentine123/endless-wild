/**
 * 绿洲参数。
 *
 * 绿洲按 5km 网格生成：每个网格单元最多一个，并且只有约 40% 的单元会真的生成，
 * 因此任意一个 5000×5000m 的范围内最多只有一个绿洲。
 * 位置会落在网格内最低的沙丘洼地里，湖面低于水位、四周是一圈树林，
 * 在游戏中和小地图上都能清楚辨认。
 */
export const OASIS = {
  /** 绿洲分布网格边长（米）。 */
  cellSize: 5_000,
  /** 每个网格单元生成绿洲的概率。 */
  chance: 0.4,
  /** 绿洲整体半径：湖面 + 岸边 + 树林带。 */
  radius: 500,
  /** 湖面半径（米），水面直接复用全局水位。 */
  lakeRadius: 190,
  /** 从湖面到高出水面的岸边的宽度。 */
  shoreWidth: 80,
  /** 湖底低于水位的高度（米）。 */
  depth: 3.4,
  /** 树林地面高出水面（米）。 */
  shoreHeight: 1.4,
  /** 地形从该比例半径开始向沙丘平滑过渡（留出约 110m 宽的树林环带）。 */
  terrainFade: 0.76,
  /** 选址必须是沙漠核心。 */
  minDesert: 0.92,
  /** 与公路保持的距离，避免道路穿过湖面。 */
  roadClearance: 800,
  /** 在网格中心附近寻找低洼点的搜索步长（米）。 */
  depressionSearch: 900,
} as const;

/** 湖面 + 岸边的半径；岸边以外才是树林带。 */
export const OASIS_WATER_EDGE = OASIS.lakeRadius + OASIS.shoreWidth;

/** 绿洲的最小可辨认直径（米）。 */
export const OASIS_DIAMETER = OASIS.radius * 2;
