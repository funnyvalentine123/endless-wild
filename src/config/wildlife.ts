export type GroundSpeciesKind = 'rabbit' | 'snake' | 'cow' | 'deer' | 'lizard' | 'camel';

export interface GroundSpeciesConfig {
  readonly kind: GroundSpeciesKind;
  readonly maxCount: number;
  readonly spawnInterval: number;
  readonly spawnRadiusMin: number;
  readonly spawnRadiusMax: number;
  readonly despawnRadius: number;
  readonly walkSpeed: number;
  readonly fleeSpeed: number;
  readonly fleeRadius: number;
  readonly idleMin: number;
  readonly idleMax: number;
  readonly moveMin: number;
  readonly moveMax: number;
  readonly maxSlope: number;
  readonly maxForest: number;
  /** 生境下限：沙漠因子低于该值时不会生成 / 进入。 */
  readonly minDesert?: number;
  /** 生境上限：沙漠因子高于该值时不会生成 / 进入。 */
  readonly maxDesert?: number;
  readonly turnRate: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly hopHeight: number;
  readonly hopFrequency: number;
  readonly sway: number;
}

/** 兔子：短距离蹦跳、频繁停顿、靠近时快速逃走。 */
export const RABBIT_CONFIG: GroundSpeciesConfig = {
  kind: 'rabbit',
  maxCount: 8,
  spawnInterval: 0.7,
  spawnRadiusMin: 22,
  spawnRadiusMax: 95,
  despawnRadius: 190,
  walkSpeed: 2.6,
  fleeSpeed: 6.5,
  fleeRadius: 10,
  idleMin: 1.2,
  idleMax: 3.2,
  moveMin: 0.4,
  moveMax: 1.4,
  maxSlope: 0.35,
  maxForest: Number.POSITIVE_INFINITY,
  maxDesert: 0.3,
  turnRate: 5,
  scaleMin: 0.8,
  scaleMax: 1.15,
  hopHeight: 0.22,
  hopFrequency: 12,
  sway: 0,
};

/** 蛇：低伏、缓慢蛇行，受惊后加速离开。 */
export const SNAKE_CONFIG: GroundSpeciesConfig = {
  kind: 'snake',
  maxCount: 5,
  spawnInterval: 1.2,
  spawnRadiusMin: 18,
  spawnRadiusMax: 80,
  despawnRadius: 170,
  walkSpeed: 0.8,
  fleeSpeed: 2.4,
  fleeRadius: 7,
  idleMin: 1.5,
  idleMax: 4,
  moveMin: 0.8,
  moveMax: 2.2,
  maxSlope: 0.45,
  maxForest: Number.POSITIVE_INFINITY,
  maxDesert: 0.35,
  turnRate: 2.2,
  scaleMin: 0.8,
  scaleMax: 1.2,
  hopHeight: 0,
  hopFrequency: 3,
  sway: 0.22,
};

/** 牛：只在平坦开阔地慢慢吃草，不主动逃跑。 */
export const COW_CONFIG: GroundSpeciesConfig = {
  kind: 'cow',
  maxCount: 4,
  spawnInterval: 2,
  spawnRadiusMin: 35,
  spawnRadiusMax: 100,
  despawnRadius: 210,
  walkSpeed: 0.9,
  fleeSpeed: 1.4,
  fleeRadius: 0,
  idleMin: 3,
  idleMax: 8,
  moveMin: 2,
  moveMax: 5,
  maxSlope: 0.12,
  maxForest: 0.18,
  maxDesert: 0.2,
  turnRate: 0.8,
  scaleMin: 0.9,
  scaleMax: 1.15,
  hopHeight: 0,
  hopFrequency: 1.5,
  sway: 0,
};

/** 鹿：开阔林地边缘活动，警觉距离更远、逃跑更快。 */
export const DEER_CONFIG: GroundSpeciesConfig = {
  kind: 'deer',
  maxCount: 4,
  spawnInterval: 1.8,
  spawnRadiusMin: 35,
  spawnRadiusMax: 110,
  despawnRadius: 210,
  walkSpeed: 2.8,
  fleeSpeed: 7.5,
  fleeRadius: 15,
  idleMin: 1.5,
  idleMax: 4,
  moveMin: 1.2,
  moveMax: 3,
  maxSlope: 0.22,
  maxForest: 0.6,
  maxDesert: 0.25,
  turnRate: 3,
  scaleMin: 0.9,
  scaleMax: 1.15,
  hopHeight: 0,
  hopFrequency: 3,
  sway: 0,
};

/** 小蜥蜴：沙漠核心的小型动物，移动快、受惊后迅速钻走。 */
export const LIZARD_CONFIG: GroundSpeciesConfig = {
  kind: 'lizard',
  // 数量比普通地形略多，但撒得比较开：沙丘视野里通常只有一两只，不会铺满沙地。
  maxCount: 12,
  spawnInterval: 0.5,
  spawnRadiusMin: 30,
  spawnRadiusMax: 140,
  despawnRadius: 220,
  walkSpeed: 2.1,
  fleeSpeed: 5.6,
  fleeRadius: 6,
  idleMin: 0.8,
  idleMax: 2.4,
  moveMin: 0.3,
  moveMax: 1.2,
  maxSlope: 0.4,
  maxForest: Number.POSITIVE_INFINITY,
  minDesert: 0.55,
  turnRate: 6,
  scaleMin: 0.8,
  scaleMax: 1.2,
  hopHeight: 0,
  hopFrequency: 8,
  sway: 0.18,
};

/** 骆驼：沙漠里缓慢行走的大型动物，体型大、转向慢。 */
export const CAMEL_CONFIG: GroundSpeciesConfig = {
  kind: 'camel',
  maxCount: 4,
  spawnInterval: 2.8,
  spawnRadiusMin: 45,
  spawnRadiusMax: 140,
  despawnRadius: 250,
  walkSpeed: 1.6,
  fleeSpeed: 3,
  fleeRadius: 0,
  idleMin: 4,
  idleMax: 9,
  moveMin: 3,
  moveMax: 7,
  maxSlope: 0.18,
  maxForest: 0.2,
  minDesert: 0.5,
  turnRate: 0.9,
  scaleMin: 0.95,
  scaleMax: 1.15,
  hopHeight: 0,
  hopFrequency: 1.6,
  sway: 0,
};

export interface BirdConfig {
  readonly maxCount: number;
  readonly spawnInterval: number;
  readonly spawnRadiusMin: number;
  readonly spawnRadiusMax: number;
  readonly despawnRadius: number;
  readonly speedMin: number;
  readonly speedMax: number;
  readonly altitudeMin: number;
  readonly altitudeMax: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
}

export const BIRD_CONFIG: BirdConfig = {
  maxCount: 12,
  spawnInterval: 0.35,
  spawnRadiusMin: 35,
  spawnRadiusMax: 150,
  despawnRadius: 240,
  speedMin: 7,
  speedMax: 11,
  altitudeMin: 28,
  altitudeMax: 50,
  scaleMin: 0.8,
  scaleMax: 1.2,
};

export interface FishConfig {
  readonly maxCount: number;
  readonly spawnInterval: number;
  readonly spawnRadiusMin: number;
  readonly spawnRadiusMax: number;
  readonly despawnRadius: number;
  readonly speedMin: number;
  readonly speedMax: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
}

export const FISH_CONFIG: FishConfig = {
  maxCount: 10,
  spawnInterval: 0.8,
  spawnRadiusMin: 12,
  spawnRadiusMax: 85,
  despawnRadius: 160,
  speedMin: 0.8,
  speedMax: 1.7,
  scaleMin: 0.7,
  scaleMax: 1.3,
};
