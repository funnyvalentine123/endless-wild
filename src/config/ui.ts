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
