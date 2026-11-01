/** 世界生成与流式加载的固定参数。 */
export const WORLD_SEED_STORAGE_KEY = 'wild-seed';
export const WORLD_SEED_MAX = 1_000_000;

export const WATER_LEVEL = 0;
export const ROAD_WIDTH = 6;
/** 公路与桥面的最低高度：暴雨最高水位为 2.4m，保持路面在洪水之上。 */
export const ROAD_MIN_HEIGHT = 3.4;

export const CHUNK_SIZE = 64;
/**
 * 近处区块的分段数（每格 2.67m）。
 *
 * 地形里最高频的成分是 16m 波长的细节噪声（振幅 0.22m），2.67m 采样已经足够，
 * 从 32 降到 24 能少掉 44% 的顶点采样（height + 颜色），近处肉眼几乎无差别。
 */
export const CHUNK_SEGMENTS = 24;
/**
 * 外圈（只有地形、没有植被）区块的网格分段。
 *
 * 远处的区块在雾里几乎看不清细节，用更低的分辨率（每格 4m）就够：
 * 顶点数只有近处的 40% 左右，单个外圈区块的构建耗时从 ~8ms 降到 ~2.5ms，
 * 高速前进时“远处不断冒出新山”就不会再顶出一帧三四十毫秒的卡顿。
 */
export const CHUNK_SEGMENTS_FAR = 16;
/**
 * 区块加载半径（格）：7 格 ≈ 448m，配合 FOG_FAR 420 让远处地形一直延伸到雾里。
 * 外圈只生成地形，靠近到 CHUNK_DETAIL_RADIUS 以内才补上植被与房屋。
 */
export const CHUNK_RADIUS = 7;
/** 完整内容（植被、房屋、岩柱）的半径；之外暂时只铺地形。 */
export const CHUNK_DETAIL_RADIUS = 5;
export const CHUNK_UNLOAD_MARGIN = 1.6;
export const VEGETATION_CANDIDATES_PER_CHUNK = 170;
/**
 * 每帧最多花在区块构建上的时间（毫秒）：按耗时而不是个数限流，
 * 保证再快也不会把一帧的预算吃光。至少还是会建 1 个，避免加载停滞。
 */
export const CHUNK_STREAM_MS = 3.5;
/** 开始界面（预生成阶段）允许更大的每帧预算，先把周围铺满再开始玩。 */
export const CHUNK_STREAM_MS_BOOT = 9;

export const ROAD_SEGMENT_LENGTH = 40;
export const ROAD_MESH_STEP = 2;
export const ROAD_HEIGHT_SAMPLE_SPACING = 14;
export const ROAD_HEIGHT_SAMPLE_STEPS = 3;
export const ROAD_HEIGHT_CACHE_LIMIT = 20_000;
