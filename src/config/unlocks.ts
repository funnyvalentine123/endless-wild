import { GEM_KINDS, type GemKind } from './gems';

/**
 * 功能合成解锁：配方、槽位形状与难度梯度。
 *
 * 每个功能对应一张「宝石图纸」：图纸是一个字符网格，
 * `.` 表示这一格不在形状内，其余字符表示需要摆入的宝石种类。
 * 合成时必须把宝石按种类摆满所有非空格子，形状与种类完全匹配才会消耗宝石并永久解锁。
 */
export type FeatureId =
  | 'walk'
  | 'jump'
  | 'bag'
  | 'speed1'
  | 'album'
  | 'speed2'
  | 'sprint'
  | 'codex'
  | 'time'
  | 'speed3'
  | 'weather'
  | 'view'
  | 'radar'
  | 'save'
  | 'sky'
  | 'speed4'
  | 'speed5'
  | 'speed6'
  | 'speed7';

/** 开局就拥有、不需要合成的基础能力。 */
export const DEFAULT_UNLOCKED_FEATURES: readonly FeatureId[] = ['walk', 'jump', 'bag'];

const DEFAULT_SET = new Set<FeatureId>(DEFAULT_UNLOCKED_FEATURES);

export function isDefaultFeature(id: FeatureId): boolean {
  return DEFAULT_SET.has(id);
}

/** 图纸里的单字符缩写 → 宝石品类。 */
export type RecipeGem = 'b' | 'g' | 'y' | 'p' | 'd' | 'k' | 'r' | 'o' | 'f' | 's';

export const RECIPE_GEM_KINDS: Record<RecipeGem, GemKind> = {
  b: 'blue',
  g: 'green',
  y: 'yellow',
  p: 'purple',
  d: 'diamond',
  k: 'black',
  r: 'red',
  o: 'glow',
  f: 'frost',
  s: 'sun',
};

/** 图纸里表示“这一格是空白”的字符。 */
export const RECIPE_VOID = '.';

/** 一个槽位：行列位置与需要的宝石；`kind === null` 表示该格只是形状留白、不能放宝石。 */
export interface FeatureCell {
  readonly row: number;
  readonly col: number;
  readonly kind: GemKind | null;
}

/** 某个功能需要的宝石品类与数量（按 `GEM_KINDS` 顺序排列，界面稳定）。 */
export interface GemNeed {
  readonly kind: GemKind;
  readonly count: number;
}

export interface FeatureDefinition {
  readonly id: FeatureId;
  readonly label: string;
  /** 解锁后能做什么 / 为什么要先解锁它。 */
  readonly summary: string;
  /** 图纸：每行一个字符串，`.` 为空白。 */
  readonly layout: readonly string[];
}

export interface FeatureSpec extends FeatureDefinition {
  /** 图纸宽度（最长行的字符数）。 */
  readonly cols: number;
  readonly rows: number;
  /** 按行优先展开的全部格子，包含留白格。 */
  readonly cells: readonly FeatureCell[];
  /** 需要摆放的宝石汇总。 */
  readonly needs: readonly GemNeed[];
  /** 需要摆放的宝石总数（留白格不计）。 */
  readonly total: number;
}

/**
 * 图纸文案里的形状说明只是给玩家看的；真实形状由 `layout` 决定。
 *
 * 难度与宝石分布原则：
 * - 前两张速度图纸（1 / 2 档）只用路边就能遇到的日耀石、红宝石，配一点雨天紫宝石与夜间荧光石，
 *   不要求玩家为了第一次加速跑去沙漠 / 绿洲找黄绿蓝；
 * - 从「奔跑」开始消耗蓝 / 绿 / 黄，正好接上新手礼包；
 * - 紫 / 荧光 / 冰晶从基础功能逐步出现，钻石、黑宝石只留在中高阶；
 * - 所有宝石都尽量分散到多张图纸里，避免某一种宝石只在两三个功能里出现；
 * - 越靠后的功能图纸越大，速度 1~7 档拆成 7 个独立功能，档位越高格子越多。
 *
 * 行走、跳跃、背包是开局默认能力，不参与合成（图纸为空）。
 */
const FEATURE_SEEDS: readonly FeatureDefinition[] = [
  {
    id: 'walk',
    label: '自由行走',
    summary: '默认可用：WASD / 方向键 / 摇杆行走。',
    layout: [],
  },
  {
    id: 'jump',
    label: '跳跃',
    summary: '默认可用：空格 / 跳跃键，能跨过矮坡与石块。',
    layout: [],
  },
  {
    id: 'bag',
    label: '背包',
    summary: '默认可用：B 键背包，随时查看已经收集到的宝石。',
    layout: [],
  },
  {
    id: 'speed1',
    label: '速度 · 1 档',
    summary: '速度上限提到 ×1.5。只用晴天白昼的日耀石与跟随动物的红宝石，不必离开道路去找沙漠 / 绿洲宝石。',
    layout: ['.s.', 'r.r', '.s.'],
  },
  {
    id: 'album',
    label: '旅途相册',
    summary: '解锁 K 键拍照与底部「相册」面板，把沿途风景存进旅途相册。',
    layout: ['ss.', 'r.r', '.r.'],
  },
  {
    id: 'speed2',
    label: '速度 · 2 档',
    summary: '速度上限提到 ×2。仍然以日耀石、红宝石为主，加一点雨天紫宝石与夜间荧光石。',
    layout: ['.ss', 'rr.', 'po.'],
  },
  {
    id: 'sprint',
    label: '奔跑',
    summary: '解锁 Shift 奔跑。开始用到蓝 / 绿 / 黄宝石，正好消耗新手礼包。',
    layout: ['sro', 'bgy', 'b.p'],
  },
  {
    id: 'codex',
    label: '宝石图鉴',
    summary: '解锁底部「图鉴」面板：查看所有宝石的首次发现记录与出现条件。',
    layout: ['srp', 'bgo', 'psr'],
  },
  {
    id: 'time',
    label: '时间流逝',
    summary: '解锁 T 键，昼夜可以加速推进，方便等荧光石、日耀石与夜空。',
    layout: ['sgo.', 'gyp.', 'sboo'],
  },
  {
    id: 'speed3',
    label: '速度 · 3 档',
    summary: '速度上限提到 ×3，跨越草原来去如风。',
    layout: ['ssby', 'gbpy', 'bgy.'],
  },
  {
    id: 'weather',
    label: '天气控制',
    summary: '解锁底部天气组：手动切换晴 / 雨 / 雪与强度，图鉴里的天气宝石都能稳定刷取。',
    layout: ['spsp', 'foof', 'obgf'],
  },
  {
    id: 'view',
    label: '第三人称',
    summary: '解锁 V 键，在第三人称与第一人称之间切换；第一次需要一颗钻石。',
    layout: ['sbygb', 'pg..f', 'sypyd'],
  },
  {
    id: 'radar',
    label: '宝石雷达',
    summary: '在小地图与大地图上用彩色光点标出附近的宝石位置。',
    layout: ['ybgyo', 'bgf.p', 'sybgo'],
  },
  {
    id: 'save',
    label: '存档面板',
    summary: '解锁 P 键存档：保存、载入、导入导出世界进度。',
    layout: ['ybgyd', 'gybyp', 'ggbod'],
  },
  {
    id: 'sky',
    label: '天穹视角',
    summary: '解锁 N 键天穹大视野，从正上方俯瞰整片山野。',
    layout: ['sogo.', 'py..y', 'sbgof', 'pbgy.'],
  },
  {
    id: 'speed4',
    label: '速度 · 4 档',
    summary: '速度上限提到 ×4，一路冲上山脊也不费时间。',
    layout: ['sgybg', 'yr.f.', 'bdop.', 'sbggy'],
  },
  {
    id: 'speed5',
    label: '速度 · 5 档',
    summary: '速度上限提到 ×5，冰晶石与紫宝石一起压阵的高阶图纸。',
    layout: ['yygyr', 'bpg.b', 'fyosd', 'dgygs'],
  },
  {
    id: 'speed6',
    label: '速度 · 6 档',
    summary: '速度上限提到 ×6，需要红宝石与冰晶石的持续供奉。',
    layout: ['gyyygg', 'by..yb', 'gppf.o', 'srrofd'],
  },
  {
    id: 'speed7',
    label: '速度 · 7 档',
    summary: '速度上限提到 ×7。终极图纸，需要一颗黑宝石。',
    layout: ['gyygg', 'ybby.', 'grkog', 'dpfrd', 'sfopy'],
  },
];

/**
 * 解析图纸：行优先展开为格子列表。
 * 未知字符直接抛错，避免配方笔误悄悄变成一格留白。
 */
export function parseLayout(layout: readonly string[]): FeatureCell[] {
  const cells: FeatureCell[] = [];

  layout.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char === RECIPE_VOID) {
        cells.push({ row, col, kind: null });
        continue;
      }

      const kind = RECIPE_GEM_KINDS[char as RecipeGem];
      if (!kind) throw new Error(`图纸字符无法识别：${char}（第 ${row + 1} 行）`);
      cells.push({ row, col, kind });
    }
  });

  return cells;
}

export function buildFeatureSpec(definition: FeatureDefinition): FeatureSpec {
  const cells = parseLayout(definition.layout);
  const rows = definition.layout.length;
  const cols = definition.layout.reduce((max, line) => Math.max(max, line.length), 0);

  const counts = new Map<GemKind, number>();
  for (const cell of cells) {
    if (!cell.kind) continue;
    counts.set(cell.kind, (counts.get(cell.kind) ?? 0) + 1);
  }

  const needs: GemNeed[] = GEM_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({
    kind,
    count: counts.get(kind) ?? 0,
  }));

  return {
    ...definition,
    rows,
    cols,
    cells,
    needs,
    total: cells.filter((cell) => cell.kind !== null).length,
  };
}

/** 全部功能，顺序与存档 / 解锁列表一致（前三个是默认能力）。 */
export const FEATURE_ORDER: readonly FeatureId[] = FEATURE_SEEDS.map((seed) => seed.id);

/** 合成台里可以解锁的功能：排除开局默认拥有的行走 / 跳跃 / 背包。 */
export const CRAFT_FEATURE_ORDER: readonly FeatureId[] = FEATURE_ORDER.filter(
  (id) => !isDefaultFeature(id),
);

export const FEATURES: Record<FeatureId, FeatureSpec> = Object.fromEntries(
  FEATURE_SEEDS.map((seed) => [seed.id, buildFeatureSpec(seed)]),
) as Record<FeatureId, FeatureSpec>;

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FEATURES, value);
}

/** 速度档位 → 对应的倍率上限。基础 ×1 一直可用，所以 1 档从 ×1.5 开始。 */
export const SPEED_FEATURE_PRESETS: Partial<Record<FeatureId, number>> = {
  speed1: 1.5,
  speed2: 2,
  speed3: 3,
  speed4: 4,
  speed5: 5,
  speed6: 6,
  speed7: 7,
};

/** 始终可用的核心能力：地图、视角控制、F 自动前进，以及行走 / 跳跃 / 背包。 */
export const CORE_FEATURES = {
  map: '大地图 (M)',
  look: '鼠标 / 触摸视角控制',
  autoWalk: 'F 键自动前进',
  walk: 'WASD / 摇杆行走',
  jump: '空格 / 跳跃键',
  bag: 'B 键背包',
} as const;

/**
 * 新手礼包：初始只能沿路自动前进，宝石大多长在离路较远的地方，
 * 不给几颗启动宝石会陷入“走不到宝石 → 永远合不成第一张图纸”的死锁。
 */
export const STARTER_GEMS: Partial<Record<GemKind, number>> = {
  blue: 2,
  green: 2,
  yellow: 1,
};

/** 解锁进度的独立本地存档键：不依赖世界种子，换世界也保留。 */
export const UNLOCK_STORAGE_KEY = 'endless-wild-unlocks-v1';
