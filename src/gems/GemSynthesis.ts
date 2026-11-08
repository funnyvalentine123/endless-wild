import { GEM_DEFINITIONS } from '../config/gems';
import type { GemSynthesisRecipe } from '../config/gemSynthesis';
import type { Inventory } from '../inventory/Inventory';

export type SynthesisOutcome = 'ok' | 'no-stock';

export interface SynthesisResult {
  readonly outcome: SynthesisOutcome;
  readonly message: string;
  readonly recipe: GemSynthesisRecipe;
}

/**
 * 执行一次 2 → 1 的宝石合成。
 *
 * 只有库存足够时才同时扣料与产出，失败不会改动背包。
 */
export function synthesizeGem(recipe: GemSynthesisRecipe, inventory: Inventory): SynthesisResult {
  const from = GEM_DEFINITIONS[recipe.from];
  const to = GEM_DEFINITIONS[recipe.to];
  const label = `${recipe.cost} 颗${from.label} → 1 颗${to.label}`;

  if (!inventory.spend(recipe.from, recipe.cost)) {
    return { outcome: 'no-stock', message: `背包里不足 ${recipe.cost} 颗${from.label}。`, recipe };
  }

  inventory.add(recipe.to);
  return { outcome: 'ok', message: `合成成功：${label}。`, recipe };
}
