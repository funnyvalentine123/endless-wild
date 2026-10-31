/**
 * 存档结构定义。
 *
 * 分成“核心字段 + sections 扩展区”两层：
 * - 核心字段只包含让世界能回到原处的最小信息（种子、位置、时刻）；
 * - 以后的系统（背包、任务、成就、载具…）各自把数据写进 `sections`，
 *   由 `SaveService.registerSection` 注册读写，核心存档代码不需要再改。
 */
export const SAVE_FORMAT = 'endless-wild-save';

/**
 * 存档版本号。
 * 新增可选字段属于兼容改动，不必改版本；只有结构不兼容（字段含义变化）时才 +1，
 * 旧版本文件仍能读，更新版本的文件会被明确拒绝，避免读出一个错位的世界。
 */
export const SAVE_VERSION = 1;

/** 本地存档在 localStorage 里的键。 */
export const SAVE_STORAGE_KEY = 'wild-save-v1';

export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** 已行进距离（米），恢复后 HUD 继续累计。 */
  walked: number;
}

export interface SaveData {
  format: string;
  version: number;
  /** 保存时刻（毫秒时间戳），用于面板显示“上次保存时间”。 */
  savedAt: number;
  seed: number;
  /** 保存时的游戏内时刻（0~24）。 */
  hour: number;
  player: PlayerSave;
  /**
   * 预留的扩展区。键是系统名（例如 `inventory`），值由该系统自己解释。
   * 读取时未知的键会被保留在存档里，不会因为暂时不认识就丢掉。
   */
  sections?: Record<string, unknown>;
}
