import { describe, expect, it } from 'vitest';
import { GEM_KINDS } from '../../src/config/gems';
import {
  GEM_SYNTHESIS_RECIPES,
  GEM_SYNTHESIS_TIERS,
  findSynthesisRecipe,
  gemTier,
} from '../../src/config/gemSynthesis';
import { synthesizeGem } from '../../src/gems/GemSynthesis';
import { Inventory } from '../../src/inventory/Inventory';

function recipe(from: string, to: string) {
  const found = GEM_SYNTHESIS_RECIPES.find(
    (entry) => entry.from === from && entry.to === to,
  );
  if (!found) throw new Error(`缺少配方 ${from} → ${to}`);
  return found;
}

/** 连续执行同一配方 `times` 次，全部应当成功。 */
function repeat(inventory: Inventory, from: string, to: string, times: number): void {
  const found = recipe(from, to);
  for (let index = 0; index < times; index++) {
    expect(synthesizeGem(found, inventory).outcome).toBe('ok');
  }
}

describe('宝石合成配方', () => {
  it('全部是 2 颗低阶宝石合成 1 颗高阶宝石，且配方 id 唯一', () => {
    const ids = new Set<string>();
    for (const entry of GEM_SYNTHESIS_RECIPES) {
      expect(entry.cost).toBe(2);
      expect(entry.from).not.toBe(entry.to);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(findSynthesisRecipe(entry.id)).toBe(entry);
    }
  });

  it('每条配方都严格从低难度层级走向高难度层级', () => {
    for (const entry of GEM_SYNTHESIS_RECIPES) {
      expect(gemTier(entry.to)).toBeGreaterThan(gemTier(entry.from));
    }
  });

  it('10 种宝石全部参与合成，黑宝石只作为最终产物', () => {
    const used = new Set<string>();
    for (const entry of GEM_SYNTHESIS_RECIPES) {
      used.add(entry.from);
      used.add(entry.to);
    }
    expect([...used].sort()).toEqual([...GEM_KINDS].sort());

    const blackRecipes = GEM_SYNTHESIS_RECIPES.filter(
      (entry) => entry.from === 'black' || entry.to === 'black',
    );
    expect(blackRecipes).toHaveLength(1);
    expect(blackRecipes[0].from).toBe('diamond');
    expect(blackRecipes[0].to).toBe('black');
  });

  it('难度层级覆盖全部宝石，且没有重复', () => {
    const tiers = GEM_SYNTHESIS_TIERS.flat();
    expect(tiers.sort()).toEqual([...GEM_KINDS].sort());
  });
});

describe('宝石合成执行', () => {
  it('数量足够时扣两颗、产出一颗，总数少一颗', () => {
    const inventory = new Inventory();
    inventory.add('sun');
    inventory.add('sun');
    inventory.add('red');

    const result = synthesizeGem(recipe('sun', 'red'), inventory);
    expect(result.outcome).toBe('ok');
    expect(result.message).toContain('日耀石');
    expect(result.message).toContain('红宝石');
    expect(inventory.count('sun')).toBe(0);
    expect(inventory.count('red')).toBe(2);
    expect(inventory.total).toBe(2);
  });

  it('数量不足时拒绝合成，背包完全不变', () => {
    const inventory = new Inventory();
    inventory.add('sun');

    const result = synthesizeGem(recipe('sun', 'red'), inventory);
    expect(result.outcome).toBe('no-stock');
    expect(inventory.count('sun')).toBe(1);
    expect(inventory.count('red')).toBe(0);
    expect(inventory.total).toBe(1);
  });

  it('32 颗日耀石可以沿主支线一路合成 1 颗黑宝石', () => {
    const inventory = new Inventory();
    for (let index = 0; index < 32; index++) inventory.add('sun');

    repeat(inventory, 'sun', 'red', 16);
    repeat(inventory, 'red', 'yellow', 8);
    repeat(inventory, 'yellow', 'green', 4);
    repeat(inventory, 'green', 'diamond', 2);
    repeat(inventory, 'diamond', 'black', 1);

    expect(inventory.count('black')).toBe(1);
    expect(inventory.total).toBe(1);
  });

  it('32 颗荧光石可以沿支线合成 1 颗黑宝石', () => {
    const inventory = new Inventory();
    for (let index = 0; index < 32; index++) inventory.add('glow');

    repeat(inventory, 'glow', 'purple', 16);
    repeat(inventory, 'purple', 'blue', 8);
    repeat(inventory, 'blue', 'frost', 4);
    repeat(inventory, 'frost', 'diamond', 2);
    repeat(inventory, 'diamond', 'black', 1);

    expect(inventory.count('black')).toBe(1);
    expect(inventory.total).toBe(1);
  });
});
