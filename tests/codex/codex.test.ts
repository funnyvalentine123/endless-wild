import { describe, expect, it } from 'vitest';
import { GemCodex } from '../../src/codex/GemCodex';
import { GEM_KINDS } from '../../src/config/gems';

describe('宝石图鉴', () => {
  it('第一次拾取记录时间、种子与坐标，之后只累计数量', () => {
    const codex = new GemCodex();
    const first = codex.record('diamond', { at: 1000, seed: 7, x: 12, z: -3 });

    expect(first.first).toBe(true);
    expect(first.entry).toMatchObject({
      kind: 'diamond',
      firstAt: 1000,
      seed: 7,
      x: 12,
      z: -3,
      count: 1,
    });

    const again = codex.record('diamond', { at: 2000, seed: 7, x: 99, z: 99 });
    expect(again.first).toBe(false);
    // 首次记录不被后来的拾取覆盖，只累加数量。
    expect(again.entry).toMatchObject({ firstAt: 1000, x: 12, z: -3, count: 2 });

    expect(codex.has('diamond')).toBe(true);
    expect(codex.has('red')).toBe(false);
    expect(codex.discovered).toBe(1);
    expect(codex.total).toBe(GEM_KINDS.length);
  });

  it('按固定顺序列出全部条目，未发现的 entry 为 null', () => {
    const codex = new GemCodex();
    codex.record('sun', { at: 10, seed: 1, x: 0, z: 0 });

    const list = codex.list();
    expect(list.map((item) => item.kind)).toEqual(GEM_KINDS);
    expect(list).toHaveLength(GEM_KINDS.length);
    expect(list.find((item) => item.kind === 'sun')?.entry?.count).toBe(1);
    expect(list.find((item) => item.kind === 'red')?.entry).toBeNull();
  });

  it('存档往返保留首次地点与累计数量', () => {
    const codex = new GemCodex();
    codex.record('purple', { at: 123, seed: 456, x: 1.5, z: -2.5 });
    codex.record('purple', { at: 999, seed: 456, x: 9, z: 9 });
    codex.record('frost', { at: 321, seed: 456, x: -7, z: 8 });

    const saved = codex.toSave();
    expect(saved?.entries).toHaveLength(2);

    const restored = new GemCodex();
    restored.fromSave(saved);
    expect(restored.discovered).toBe(2);
    expect(restored.entry('purple')).toMatchObject({
      firstAt: 123,
      seed: 456,
      x: 1.5,
      z: -2.5,
      count: 2,
    });
    expect(restored.entry('frost')).toMatchObject({ firstAt: 321, x: -7, z: 8, count: 1 });
  });

  it('空图鉴不写存档，损坏的条目被跳过', () => {
    const codex = new GemCodex();
    expect(codex.toSave()).toBeUndefined();

    codex.fromSave({
      entries: [
        { kind: 'unknown', firstAt: 1, seed: 1, x: 0, z: 0, count: 1 },
        { kind: 'red', firstAt: 1, seed: 1, x: 0, z: 0 },
        { kind: 'red', firstAt: 2, seed: 1, x: 1, z: 2, count: 0 },
        { kind: 'blue', firstAt: 3, seed: 1, x: 4, z: 5, count: 2.9 },
        { kind: 'blue', firstAt: 4, seed: 1, x: 6, z: 7, count: 1 },
        { kind: 'green', firstAt: 5, seed: 1, x: 8, z: 9, count: 1 },
      ],
    });

    // 未知种类、缺字段、数量非正、重复条目都被跳过。
    expect(codex.discovered).toBe(2);
    expect(codex.has('red')).toBe(false);
    expect(codex.entry('blue')).toMatchObject({ firstAt: 3, x: 4, z: 5, count: 2 });
    expect(codex.entry('green')).toMatchObject({ count: 1 });

    codex.fromSave(null);
    expect(codex.discovered).toBe(0);
  });
});
