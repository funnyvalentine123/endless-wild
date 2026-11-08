import { GEM_KINDS, type GemKind } from '../config/gems';

/** 图鉴里的一条记录：首次发现的时间 / 世界 / 地点，以及累计拾取数量。 */
export interface CodexEntry {
  readonly kind: GemKind;
  /** 首次发现的时间戳（毫秒）。 */
  readonly firstAt: number;
  readonly seed: number;
  readonly x: number;
  readonly z: number;
  /** 累计拾取数量（消耗掉也不减少，记录的是“收集过多少颗”）。 */
  readonly count: number;
}

/** 存档段：`sections.codex`。只写已经发现的宝石。 */
export interface CodexData {
  entries?: CodexEntry[];
}

export interface CodexSample {
  at: number;
  seed: number;
  x: number;
  z: number;
}

/** 单种宝石的累计上限，防止被改坏的存档把数字撑爆 UI。 */
const MAX_COUNT = 9999;

const GEM_SET = new Set<string>(GEM_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isGemKind(value: unknown): value is GemKind {
  return typeof value === 'string' && GEM_SET.has(value);
}

/**
 * 宝石图鉴：第一次拾取某类宝石时记下时间、种子与坐标，之后只累加数量。
 *
 * 纯数据结构，不碰 DOM 与 three.js，方便单元测试；面板由上层接。
 */
export class GemCodex {
  private readonly entries = new Map<GemKind, CodexEntry>();

  /** 记录一次拾取；`first` 表示这是该类宝石第一次被发现。 */
  record(kind: GemKind, sample: CodexSample): { first: boolean; entry: CodexEntry } {
    const existing = this.entries.get(kind);
    if (existing) {
      const entry: CodexEntry = {
        ...existing,
        count: Math.min(existing.count + 1, MAX_COUNT),
      };
      this.entries.set(kind, entry);
      return { first: false, entry };
    }

    const entry: CodexEntry = {
      kind,
      firstAt: sample.at,
      seed: sample.seed,
      x: sample.x,
      z: sample.z,
      count: 1,
    };
    this.entries.set(kind, entry);
    return { first: true, entry };
  }

  has(kind: GemKind): boolean {
    return this.entries.has(kind);
  }

  entry(kind: GemKind): CodexEntry | undefined {
    return this.entries.get(kind);
  }

  /** 已发现的种类数。 */
  get discovered(): number {
    return this.entries.size;
  }

  /** 图鉴总条目数（当前所有宝石种类）。 */
  get total(): number {
    return GEM_KINDS.length;
  }

  /** 按 `GEM_KINDS` 的固定顺序返回每一条；未发现的 `entry` 为 null。 */
  list(): Array<{ kind: GemKind; entry: CodexEntry | null }> {
    return GEM_KINDS.map((kind) => ({ kind, entry: this.entries.get(kind) ?? null }));
  }

  toSave(): CodexData | undefined {
    if (this.entries.size === 0) return undefined;

    // 按固定顺序写，方便对比存档 / 调试。
    const entries = GEM_KINDS.flatMap((kind) => {
      const entry = this.entries.get(kind);
      return entry ? [{ ...entry }] : [];
    });
    return { entries };
  }

  /** 从存档恢复；字段非法的条目直接跳过，不影响其它已发现的宝石。 */
  fromSave(value: unknown): void {
    this.entries.clear();
    if (!isRecord(value) || !Array.isArray(value.entries)) return;

    for (const raw of value.entries) {
      if (!isRecord(raw)) continue;
      if (!isGemKind(raw.kind) || this.entries.has(raw.kind)) continue;
      if (
        !isFiniteNumber(raw.firstAt) ||
        !isFiniteNumber(raw.seed) ||
        !isFiniteNumber(raw.x) ||
        !isFiniteNumber(raw.z) ||
        !isFiniteNumber(raw.count)
      ) {
        continue;
      }
      if (raw.count <= 0) continue;

      this.entries.set(raw.kind, {
        kind: raw.kind,
        firstAt: raw.firstAt,
        seed: raw.seed,
        x: raw.x,
        z: raw.z,
        count: Math.min(Math.floor(raw.count), MAX_COUNT),
      });
    }
  }

  reset(): void {
    this.entries.clear();
  }
}
