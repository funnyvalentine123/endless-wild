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
    maxActive: 1,
    rule: '湖泊中央的水面之上',
  },
  yellow: {
    kind: 'yellow',
    label: '黄宝石',
    shape: 'tetrahedron',
    color: 0xffd23f,
    glow: 0xffd84f,
    maxActive: 2,
    rule: '沙漠风蚀岩柱附近',
  },
  green: {
    kind: 'green',
    label: '绿宝石',
    shape: 'dodecahedron',
    color: 0x37e06a,
    glow: 0x45f07a,
    maxActive: 2,
    rule: '绿洲湖岸外的小树林',
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
    /** 雪山在 320m 扫描范围内最多同时覆盖 4 座，留一点余量保证每座山都能出现。 */
    maxActive: 5,
    rule: '雪山雪线以上的峰顶，有积雪就必定出现',
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
    /** 有积雪的雪山（峰顶高于雪线）必定长出黑宝石，不再掷概率。 */
    chance: 1,
    /** 雪线：地形着色从 40m 起泛白，峰顶到这个高度才算“白色的雪山区”。 */
    minHeight: 40,
    maxDesert: 0.35,
    /** 山格：一格最多算一座山，格内最高点即峰顶。 */
    cellSize: 600,
    /** 格内采样分辨率：7×7 个点（约 86m 一个），足够盖住一座山的峰顶。 */
    samples: 7,
  },
  blue: {
    /** 每个含湖区块的概率；还需要找到四周都是水的湖心点。 */
    chance: 0.02,
    minDepth: 0.8,
    ringRadius: 18,
  },
  green: {
    /** 每个绿洲的概率。 */
    chance: 0.3,
    /** 树林带：湖岸线以外、绿洲地形渐变区以内。 */
    minWaterDistance: 40,
    maxHeight: 4.5,
  },
  yellow: {
    /** 每根风蚀岩柱附近出现宝石的概率。 */
    chance: 0.35,
    offset: 3.6,
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
