/** 世界生成与流式加载的固定参数。 */
export const WORLD_SEED_STORAGE_KEY = 'wild-seed';
export const WORLD_SEED_MAX = 1_000_000;

export const WATER_LEVEL = 0;
export const ROAD_WIDTH = 6;
/** 公路与桥面的最低高度：暴雨最高水位为 2.4m，保持路面在洪水之上。 */
export const ROAD_MIN_HEIGHT = 3.4;

export const CHUNK_SIZE = 64;
export const CHUNK_SEGMENTS = 32;
/**
 * 区块加载半径（格）：7 格 ≈ 448m，配合 FOG_FAR 420 让远处地形一直延伸到雾里。
 * 外圈只生成地形，靠近到 CHUNK_DETAIL_RADIUS 以内才补上植被与房屋。
 */
export const CHUNK_RADIUS = 7;
/** 完整内容（植被、房屋、岩柱）的半径；之外暂时只铺地形。 */
export const CHUNK_DETAIL_RADIUS = 5;
export const CHUNK_UNLOAD_MARGIN = 1.6;
export const VEGETATION_CANDIDATES_PER_CHUNK = 170;

export const ROAD_SEGMENT_LENGTH = 40;
export const ROAD_MESH_STEP = 2;
export const ROAD_HEIGHT_SAMPLE_SPACING = 14;
export const ROAD_HEIGHT_SAMPLE_STEPS = 3;
export const ROAD_HEIGHT_CACHE_LIMIT = 20_000;
