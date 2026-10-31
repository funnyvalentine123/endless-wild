/** HUD 与小地图的刷新频率。 */
export const HUD_UPDATE_INTERVAL = 0.2;
export const MINIMAP_UPDATE_INTERVAL = 0.4;
export const MINIMAP_CELLS = 50;
export const MINIMAP_METERS_PER_CELL = 6;
export const MINIMAP_RANGE_METERS = MINIMAP_CELLS * MINIMAP_METERS_PER_CELL;

/** 大地图：当前小地图的 10 倍长宽 = 3000m × 3000m。 */
export const BIG_MAP_RANGE_METERS = MINIMAP_RANGE_METERS * 10;
export const BIG_MAP_TEXTURE_SIZE = 512;
/** 每个分片最多花多少毫秒生成地图，剩余部分下一次继续。 */
export const BIG_MAP_FRAME_BUDGET_MS = 12;
export const BIG_MAP_GRID_METERS = 500;
export const BIG_MAP_ROAD_STEP_METERS = 12;
export const BIG_MAP_SCALE_BAR_METERS = 1000;
/** 大地图打开时的实时滚动刷新间隔（秒）。 */
export const BIG_MAP_LIVE_INTERVAL = 0.1;
/** 大地图坐标/生物群系文字的刷新间隔（秒）。 */
export const BIG_MAP_COORDS_INTERVAL = 0.4;

/**
 * 天穹摄像机：站在天穹最顶端、玩家正上方垂直向下俯瞰。
 * 高度与视角决定俯瞰范围：2 * 760 * tan(21°) ≈ 583m 宽。
 */
export const SKY_VIEW_HEIGHT = 760;
export const SKY_VIEW_FOV = 42;
export const SKY_VIEW_NEAR = 10;
export const SKY_VIEW_FAR = 1600;
/** 俯瞰时用远雾代替天气雾，避免整片地面被雾吞掉。 */
export const SKY_VIEW_FOG_NEAR = 460;
export const SKY_VIEW_FOG_FAR = 1500;
/** 缩略图/大视野的渲染尺寸（CSS 像素正方形）与刷新间隔。 */
export const SKY_THUMB_SIZE = 256;
export const SKY_VIEW_SIZE = 512;
export const SKY_THUMB_INTERVAL = 0.25;
/**
 * 大视野的 3D 重渲染间隔（12fps）。画面本身每帧都用像素平移跟随主角，
 * 因此 3D 俯瞰不必每帧重画，走动时既跟手又不会让主视角掉帧。
 */
export const SKY_VIEW_INTERVAL = 1 / 12;
/** 平移超过这么多像素就立刻重渲染一次，避免画面边缘露出旧内容。 */
export const SKY_VIEW_MAX_SCROLL_PIXELS = 24;
