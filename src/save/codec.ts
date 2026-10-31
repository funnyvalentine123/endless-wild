import { HOURS_PER_DAY, INITIAL_HOUR } from '../config/daynight';
import { WORLD_SEED_MAX } from '../config/world';
import {
  SAVE_FORMAT,
  SAVE_VERSION,
  type PlayerSave,
  type SaveData,
} from './types';

export type SaveParseResult =
  | { ok: true; data: SaveData }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const number = finite(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

/** 时刻统一归一到 [0, 24)，越界或缺失时回落到游戏默认的初始时刻。 */
function normalizeHour(value: unknown, fallback: number): number {
  const hour = finite(value);
  if (hour === null) return fallback;
  return ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

/**
 * 校验任意来源的存档对象（本地、导入文件、调试接口）。
 * 所有被采纳的字段都会被重新收窄，避免 NaN / 字符串混进世界坐标。
 */
export function validateSave(value: unknown): SaveParseResult {
  if (!isRecord(value)) return { ok: false, reason: '存档内容为空' };
  if (value.format !== SAVE_FORMAT) return { ok: false, reason: '不是《无尽山野》的存档文件' };

  const version = integer(value.version);
  if (version === null || version < 1) return { ok: false, reason: '缺少有效的存档版本号' };
  if (version > SAVE_VERSION) {
    return { ok: false, reason: `存档版本 v${version} 高于当前支持的 v${SAVE_VERSION}` };
  }

  const seed = integer(value.seed);
  // 种子 0 在世界解析里等同“未提供”，存档里也不可能出现，直接视为无效。
  if (seed === null || seed < 1 || seed >= WORLD_SEED_MAX) {
    return { ok: false, reason: '世界种子无效' };
  }

  if (!isRecord(value.player)) return { ok: false, reason: '缺少玩家位置' };
  const player = value.player;
  const x = finite(player.x);
  const z = finite(player.z);
  if (x === null || z === null) return { ok: false, reason: '玩家坐标无效' };

  const restoredPlayer: PlayerSave = {
    x,
    y: finite(player.y) ?? 0,
    z,
    yaw: finite(player.yaw) ?? 0,
    pitch: finite(player.pitch) ?? 0,
    walked: Math.max(0, finite(player.walked) ?? 0),
  };

  const sections = isRecord(value.sections) ? { ...value.sections } : undefined;

  const data: SaveData = {
    format: SAVE_FORMAT,
    version,
    savedAt: Math.max(0, finite(value.savedAt) ?? 0),
    seed,
    hour: normalizeHour(value.hour, INITIAL_HOUR),
    player: restoredPlayer,
  };
  if (sections) data.sections = sections;

  return { ok: true, data };
}

/** 从 JSON 文本解析存档；解析失败与字段不合法都会给出可展示的中文原因。 */
export function parseSave(raw: string): SaveParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: '不是合法的 JSON 文件' };
  }
  return validateSave(value);
}

/** 导出文件用的缩进 JSON，方便玩家自己查看或手工备份。 */
export function stringifySave(data: SaveData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** 导出的文件名：种子 + 保存时间，避免多次导出相互覆盖。 */
export function saveFileName(data: SaveData): string {
  const date = data.savedAt > 0 ? new Date(data.savedAt) : new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `endless-wild-${data.seed}-${stamp}.json`;
}

export interface SaveSummary {
  seed: number;
  x: number;
  z: number;
  hour: number;
  walked: number;
  savedAt: number;
}

export function summarizeSave(data: SaveData): SaveSummary {
  return {
    seed: data.seed,
    x: data.player.x,
    z: data.player.z,
    hour: data.hour,
    walked: data.player.walked,
    savedAt: data.savedAt,
  };
}
