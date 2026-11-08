import type { GemKind } from './gems';

/**
 * 宝石合成（精炼）：按获取难度从低到高，2 颗低阶宝石合成 1 颗高阶宝石。
 *
 * 难度按「出现条件 + 生成概率 + 需要跑多远」分层：
 * - 日耀石 / 荧光石：晴天白昼 / 夜晚就在附近反复刷新，最容易；
 * - 红宝石 / 紫宝石：需要等动物靠近 / 等下雨；
 * - 黄宝石 / 蓝宝石：需要去沙漠岩柱 / 找大片开阔水面；
 * - 绿宝石 / 冰晶石：需要去绿洲 / 等雪天；
 * - 钻石：森林区块 2% 的低概率；
 * - 黑宝石：每座雪山山头一半概率，最难。
 *
 * 两条支线最终汇到钻石，再由钻石合成黑宝石：
 * 日耀 → 红 → 黄 → 绿 → 钻石 → 黑
 * 荧光 → 紫 → 蓝 → 冰晶 → 钻石 → 黑
 * 因此 32 颗最常见的日耀石（或荧光石）最终可以换到 1 颗黑宝石。
 */
export interface GemSynthesisRecipe {
  readonly id: string;
  /** 消耗的宝石。 */
  readonly from: GemKind;
  /** 产出的宝石。 */
  readonly to: GemKind;
  /** 每次消耗多少颗 `from`。 */
  readonly cost: number;
}

/** 展示与合成共用的固定顺序：按宝石难度从低到高。 */
export const GEM_SYNTHESIS_RECIPES: readonly GemSynthesisRecipe[] = [
  { id: 'sun-red', from: 'sun', to: 'red', cost: 2 },
  { id: 'glow-purple', from: 'glow', to: 'purple', cost: 2 },
  { id: 'red-yellow', from: 'red', to: 'yellow', cost: 2 },
  { id: 'purple-blue', from: 'purple', to: 'blue', cost: 2 },
  { id: 'yellow-green', from: 'yellow', to: 'green', cost: 2 },
  { id: 'blue-frost', from: 'blue', to: 'frost', cost: 2 },
  { id: 'green-diamond', from: 'green', to: 'diamond', cost: 2 },
  { id: 'frost-diamond', from: 'frost', to: 'diamond', cost: 2 },
  { id: 'diamond-black', from: 'diamond', to: 'black', cost: 2 },
];

/**
 * 宝石难度层级。合成只能从低层走向高层，测试会校验每条配方都满足这一点。
 * 同一层内的宝石获取难度接近，但合成不会横向改变种类。
 */
export const GEM_SYNTHESIS_TIERS: readonly (readonly GemKind[])[] = [
  ['sun', 'glow'],
  ['red', 'purple'],
  ['yellow', 'blue'],
  ['green', 'frost'],
  ['diamond'],
  ['black'],
];

const TIER_BY_KIND = new Map<GemKind, number>();
GEM_SYNTHESIS_TIERS.forEach((tier, index) => {
  for (const kind of tier) TIER_BY_KIND.set(kind, index);
});

/** 宝石的获取难度层级，数字越小越常见。 */
export function gemTier(kind: GemKind): number {
  return TIER_BY_KIND.get(kind) ?? 0;
}

export function findSynthesisRecipe(id: string): GemSynthesisRecipe | undefined {
  return GEM_SYNTHESIS_RECIPES.find((recipe) => recipe.id === id);
}
