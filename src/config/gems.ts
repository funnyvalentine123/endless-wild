/**
 * 宝石系统参数。
 *
 * 宝石是散布在世界里的低概率收集物：固定地点由种子与地形规则决定，
 * 红宝石跟随动物、紫宝石只在雨雪天出现、荧光石只在夜晚出现，其余五种绑定具体生境。
 * 出现概率先按“每个区块 / 每个地标 / 每座山”给出，后续可以直接调这一张表。
 */
export type GemKind =
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'purple'
  | 'diamond'
  | 'black'
  | 'glow';

/** 每种宝石使用不同的几何体，远看轮廓就能分辨，不必只靠颜色。 */
export type GemShape =
  | 'octahedron'
  | 'icosahedron'
  | 'tetrahedron'
  | 'dodecahedron'
  | 'bipyramid'
  | 'brilliant'
  | 'crystal'
  | 'orb';

export interface GemDefinition {
  readonly kind: GemKind;
  readonly label: string;
  /** 本体几何体形状。 */
  readonly shape: GemShape;
  /** 宝石本体颜色。 */
  readonly color: number;
  /** 光晕 / 光柱颜色（黑宝石用暗紫色，否则在天空里完全看不见）。 */
  readonly glow: number;
  /** 光柱单独的颜色；不填时沿用 `glow`（黑宝石的光柱要纯黑）。 */
  readonly pillarColor?: number;
  /** 同时存在的上限，避免低概率系统堆出太多 draw call。 */
  readonly maxActive: number;
  readonly rule: string;
}

export const GEM_DEFINITIONS: Record<GemKind, GemDefinition> = {
  red: {
    kind: 'red',
    label: '红宝石',
    shape: 'octahedron',
    color: 0xff2f45,
    glow: 0xff3a50,
    maxActive: 1,
    rule: '跟随一只大型动物移动',
  },
  blue: {
    kind: 'blue',
    label: '蓝宝石',
    shape: 'icosahedron',
    color: 0x2f7bff,
    glow: 0x3d86ff,
    /** 大湖能横跨多个区块，同一片开阔水面上偶尔会同时悬着两颗。 */
    maxActive: 3,
    rule: '开阔的大水面中心（离岸 24m 内全是水），每个这样的区块 30%',
  },
  yellow: {
    kind: 'yellow',
    label: '黄宝石',
    shape: 'tetrahedron',
    color: 0xffd23f,
    glow: 0xffd84f,
    maxActive: 3,
    rule: '风蚀岩柱旁大概率出现；沙漠其他地方也有低概率',
  },
  green: {
    kind: 'green',
    label: '绿宝石',
    shape: 'dodecahedron',
    color: 0x37e06a,
    glow: 0x45f07a,
    maxActive: 3,
    rule: '绿洲湖岸外的小树林高概率；普通草地上也有低概率',
  },
  purple: {
    kind: 'purple',
    label: '紫宝石',
    shape: 'bipyramid',
    color: 0xbb5cff,
    glow: 0xc86bff,
    maxActive: 3,
    rule: '只在雨雪天出现',
  },
  diamond: {
    kind: 'diamond',
    label: '钻石',
    shape: 'brilliant',
    color: 0xd9fbff,
    glow: 0xe4fdff,
    maxActive: 2,
    rule: '丛林随机地面',
  },
  black: {
    kind: 'black',
    label: '黑宝石',
    shape: 'crystal',
    color: 0x2a2438,
    glow: 0x927cff,
    /** 光柱用纯黑，在白色雪地和天空里是一道墨色烟柱。 */
    pillarColor: 0x000000,
    /** 一个山头最多一颗，320m 内同时出现两三座雪山即可，上限保守一些。 */
    maxActive: 4,
    rule: '每座雪山（3×3 区块内的最高峰）有 1/2 概率出现，一座山最多一颗',
  },
  glow: {
    kind: 'glow',
    label: '荧光石',
    shape: 'orb',
    color: 0xffffff,
    glow: 0xffa6ff,
    maxActive: 2,
    rule: '只在夜晚随机出现，每个面一种颜色',
  },
};

/** 生成顺序固定，调试与测试都依赖这个顺序。 */
export const GEM_KINDS: readonly GemKind[] = [
  'red',
  'blue',
  'yellow',
  'green',
  'purple',
  'diamond',
  'black',
  'glow',
];

/** 外观：宝石中心与主角身高中心齐平，大小约为身高的一半。 */
export const GEM_VISUALS = {
  /** 主角站立高度约 1.86m，宝石约一半高。 */
  size: 0.92,
  /** 离地高度 = 主角身高中心。 */
  centerHeight: 0.93,
  /** 原地转圈速度（弧度 / 秒）。 */
  spinSpeed: 1.15,
  haloScale: 3.4,
  haloOpacity: 0.55,
  /** 光柱半径等于宝石尺寸，直径约为宝石的 2 倍。 */
  pillarRadius: 0.92,
  /**
   * 柱高：120m。太矮不像“直冲天际”，太高（300m）则玩家在 300m 外也看不到柱顶，
   * 渐变消失就永远看不见；120m 在 200m 外就能看到柱顶淡出。
   */
  pillarHeight: 120,
  /** 光柱是普通透明混合（不是加色），近看保留宝石本身的颜色。 */
  pillarOpacity: 0.5,
  /** 光柱从柱顶往下 30% 处开始淡出，在到达最高点前完全透明。 */
  pillarFadeStart: 0.3,
  /** 荧光石光晕的旋转速度（弧度/秒）。 */
  glowHaloSpin: 0.35,
  /** 荧光石光柱贴图沿柱面周向滚动的速度（圈/秒），让多色一直在流动。 */
  glowPillarScroll: 0.03,
} as const;

/**
 * 拾取：走到宝石旁边就会把它收进背包，宝石先“飞进身体”再消失。
 * 判定用玩家胸口高度（主角身高中心 0.93m）对宝石中心，所以站在宝石旁就能碰到。
 */
export const GEM_COLLECT = {
  /** 水平距离：宝石直径 0.92m，贴到身边才算碰到。 */
  radius: 1.4,
  /** 宝石中心与胸口的高度差上限；跳到空中时不会隔空把宝石吸走。 */
  verticalTolerance: 1.3,
  /** “飞进身体”的动画时长（秒）。 */
  duration: 0.6,
  /** 动画结束时宝石缩到原来的比例，看起来是被吸进去而不是穿模。 */
  endScale: 0.18,
  /** 飞行途中向上拱起的高度（米）。 */
  arc: 0.45,
  /** 收进身体时宝石自转加速到多少（弧度/秒）。 */
  spinSpeed: 10,
} as const;

/** 扫描与回收：只在玩家附近生成，走远后回收，回来可以重新生成。 */
export const GEM_SPAWN = {
  chunkRadius: 5,
  despawnRadius: 480,
  scanInterval: 0.3,
  /** 每次扫描最多新建几个区块的站点，避免一帧里集中计算。 */
  chunkBudget: 10,
  chunkCacheLimit: 1200,
} as const;

/** 每种固定宝石的生成概率与地形门槛。 */
export const GEM_RULES = {
  diamond: {
    /** 每个森林区块的出现概率。 */
    chance: 0.02,
    minForest: 0.2,
    maxDesert: 0.2,
  },
  black: {
    /** 每个山头 1/2 概率长出黑宝石（同一座山结果固定，进出山区不会变）。 */
    chance: 0.5,
    /** 雪线：地形着色从 height + detail * 4 = 40 起泛白，区块最高点达到这里就算“白色覆盖区”。 */
    minHeight: 40,
    maxDesert: 0.35,
    /** 判定山头时互相比较的区块半径：1 → 3×3 个区块内最高的一峰才算一座山。 */
    summitRadius: 1,
    /** 区块内粗采样：5×5（约 13m 一个点），先花 25 次高度采样把够不到雪线的区块排除。 */
    samples: 5,
    /** 粗筛余量：区块最高点低于 雪线 - 5m 时不再细化，避免为普通丘陵白采样。 */
    coarseSlack: 5,
    /** 山爬细化轮数：6.4m → 3.2m → 1.6m，落点误差约 1m。 */
    refineRounds: 3,
  },
  blue: {
    /**
     * 每个“有大片开阔水面”的水面格的出现概率。
     * 只要求水面开阔，不再限定湖泊 biome 或湖心深度，因此大湖、宽河湾都会命中。
     */
    chance: 0.4,
    /** 落点至少要比水位低这么多，浅滩 / 河滩上不算“水面中心”。 */
    minDepth: 0.4,
    /**
     * 开阔半径：以落点为圆心，8 个方向上 24m 处都还必须是水，
     * 也就是一片宽度至少约 48m 的连续水面（窄沟、细河与岸边都被排除）。
     */
    minOpenRadius: 24,
    /**
     * 水面格：以 96m 方格为单位，每格最多一颗，相邻两格的宝石至少隔开 48m，
     * 不会出现两颗蓝宝石挤在同一片湖心的观感问题。
     */
    cellSize: 96,
    /** 格内候选点：以格心为中心的 3×3，步长 24m，全部落在格子的中央区。 */
    cellSamples: 3,
    cellSpacing: 24,
    /** 依深度从深到浅最多验算几个候选点。 */
    candidates: 2,
  },
  green: {
    /** 绿洲：每个绿洲（中心所在区块）高概率出现。 */
    oasisChance: 0.85,
    /** 普通草地：每个草地区块低概率出现，绿宝石因此不必只在绿洲找。 */
    meadowChance: 0.005,
    /** 草地取点尝试次数。 */
    meadowAttempts: 6,
    /** 树林带：湖岸线以外、绿洲地形渐变区以内。 */
    minWaterDistance: 40,
    maxHeight: 4.5,
    /** 普通草地距离沙漠的最大因子，太靠近沙漠的旱地不算绿地。 */
    maxDesert: 0.2,
  },
  yellow: {
    /** 每根风蚀岩柱附近出现宝石的概率（大概率）。 */
    hoodooChance: 0.7,
    offset: 3.6,
    /** 沙漠里远离岩柱的普通沙地：每个沙漠区块低概率出现。 */
    desertChance: 0.006,
    /** 沙漠取点尝试次数。 */
    desertAttempts: 6,
    /** 沙漠生境门槛：沙漠核心附近才可能生成（绿洲被 habitatDesertAt 扣掉）。 */
    minDesert: 0.6,
    /** 沙漠落点与所有岩柱的最小间距，避免和岩柱旁那颗挤在一起。 */
    hoodooClearance: 6,
  },
} as const;

export const GEM_DYNAMIC = {
  purple: {
    /** 雨雪天每隔多久尝试生成一次。 */
    interval: 2.2,
    chance: 0.3,
    minDistance: 55,
    maxDistance: 250,
    /** 低于该降水强度就视为晴天并回收紫宝石。 */
    minPrecipitation: 0.08,
  },
  glow: {
    /** 夜晚每隔多久尝试生成一次。 */
    interval: 3.5,
    chance: 0.3,
    minDistance: 60,
    maxDistance: 260,
    /** 日照因子低于该值就算夜晚；天亮后荧光石立即回收。 */
    maxDaylight: 0.35,
  },
  red: {
    /** 没有红宝石时，每隔多久尝试选中一只动物。 */
    retryInterval: 16,
    chance: 0.4,
    maxDistance: 130,
    /** 允许驮着宝石的动物；体型太小的动物看起来像挂了个大灯笼。 */
    animals: ['cows', 'deer', 'camels'] as const,
    /** 红宝石额外抬到动物背上方，否则 0.93m 的中心会埋进牛/鹿的身体里。 */
    rideHeight: 1.15,
    /** 目标消失多久后回收红宝石。 */
    lostGrace: 1.5,
  },
} as const;
