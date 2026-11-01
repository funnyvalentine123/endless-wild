import { describe, expect, it } from 'vitest';
import { GEM_KINDS } from '../../src/config/gems';
import { Inventory, isStaticGemKey } from '../../src/inventory/Inventory';

describe('背包', () => {
  it('按品类累计宝石数量，并保持固定的展示顺序', () => {
    const inventory = new Inventory();
    expect(inventory.total).toBe(0);
    expect(inventory.entries()).toHaveLength(GEM_KINDS.length);

    expect(inventory.add('red')).toBe(1);
    expect(inventory.add('red')).toBe(2);
    expect(inventory.add('diamond', 'diamond:3:-5')).toBe(1);

    expect(inventory.count('red')).toBe(2);
    expect(inventory.count('green')).toBe(0);
    expect(inventory.total).toBe(3);
    // entries 的顺序与 GEM_KINDS 一致，UI 不会因为收集顺序不同而跳动。
    expect(inventory.entries().map((entry) => entry.kind)).toEqual([...GEM_KINDS]);
  });

  it('收走的固定宝石站点会被记住，动态宝石不会', () => {
    const inventory = new Inventory();
    inventory.add('diamond', 'diamond:3:-5');
    expect(inventory.isTaken('diamond:3:-5')).toBe(true);
    expect(inventory.isTaken('diamond:4:-5')).toBe(false);

    // 红 / 紫 / 荧光石会不断重新出现，只记数量，不记站点。
    inventory.add('red', 'red:animal');
    inventory.add('purple', 'purple:12');
    inventory.add('glow', 'glow:7');
    expect(inventory.isTaken('red:animal')).toBe(false);
    expect(inventory.isTaken('purple:12')).toBe(false);
    expect(inventory.isTaken('glow:7')).toBe(false);

    expect(isStaticGemKey('black:8:-2')).toBe(true);
    expect(isStaticGemKey('glow:7')).toBe(false);
  });

  it('存档读写：只写非零数量，恢复时忽略非法数据', () => {
    const inventory = new Inventory();
    inventory.add('blue');
    inventory.add('yellow', 'yellow:2:4');
    const saved = inventory.toSave();

    expect(saved?.gems).toEqual({ blue: 1, yellow: 1 });
    expect(saved?.taken).toEqual(['yellow:2:4']);

    const restored = new Inventory();
    restored.fromSave(saved);
    expect(restored.count('blue')).toBe(1);
    expect(restored.count('yellow')).toBe(1);
    expect(restored.isTaken('yellow:2:4')).toBe(true);

    // 被手改坏的存档不会把背包读成 NaN 或负数。
    restored.fromSave({
      gems: { red: -3, blue: 'oops', green: 2.7, black: Infinity },
      taken: ['diamond:1:1', 42, 'glow:9', '', null],
    });
    expect(restored.count('red')).toBe(0);
    expect(restored.count('blue')).toBe(0);
    expect(restored.count('green')).toBe(2);
    expect(restored.count('black')).toBe(0);
    expect(restored.isTaken('diamond:1:1')).toBe(true);
    expect(restored.isTaken('glow:9')).toBe(false);

    restored.fromSave('not-an-object');
    expect(restored.total).toBe(0);
  });

  it('空背包不产生存档段，重置会清空数量与已收站点', () => {
    const empty = new Inventory();
    expect(empty.toSave()).toBeUndefined();

    const inventory = new Inventory();
    inventory.add('black', 'black:1:-1');
    inventory.reset();
    expect(inventory.total).toBe(0);
    expect(inventory.isTaken('black:1:-1')).toBe(false);
    expect(inventory.toSave()).toBeUndefined();
  });
});
