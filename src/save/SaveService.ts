import { SAVE_FORMAT, SAVE_VERSION } from './types';
import { SaveStore } from './SaveStore';
import { parseSave, saveFileName, stringifySave } from './codec';
import type { PlayerSave, SaveData } from './types';

/** 由顶层（Game）提供的读写钩子：存档模块只关心“现在是什么、怎么回到那里”。 */
export interface SaveContext {
  readonly seed: number;
  getHour(): number;
  setHour(hour: number): void;
  getPlayer(): PlayerSave;
  restorePlayer(player: PlayerSave): void;
  /** 存档属于另一个种子：由顶层整页重载到该种子。 */
  reloadToSeed(seed: number): void;
}

/**
 * 预留的扩展点：以后新增系统（背包、任务、成就…）实现这个接口并注册即可。
 *
 * ```ts
 * save.registerSection({
 *   key: 'inventory',
 *   capture: () => inventory.toSave(),
 *   restore: (value) => inventory.fromSave(value),
 * });
 * ```
 */
export interface SaveSection<T = unknown> {
  readonly key: string;
  /** 返回 undefined 表示本次没有可保存的数据（该键不会写进文件）。 */
  capture(): T | undefined;
  restore(value: T): void;
}

export type SaveOutcome =
  | 'saved'
  | 'removed'
  | 'applied'
  | 'reloaded'
  | 'missing'
  | 'invalid'
  | 'unavailable';

export interface SaveResult {
  outcome: SaveOutcome;
  /** 可直接展示给玩家的中文提示。 */
  message: string;
  data?: SaveData;
}

/**
 * 存档业务：快照采集、本地读写、导入导出、载入与扩展段恢复。
 * 不直接碰 DOM，方便单元测试；导出下载与文件选择放在 UI / Game 层。
 */
export class SaveService {
  private readonly sections: SaveSection[] = [];

  constructor(
    private readonly context: SaveContext,
    private readonly local: SaveStore = SaveStore.local(),
  ) {}

  get localAvailable(): boolean {
    return this.local.available;
  }

  registerSection(section: SaveSection): void {
    this.sections.push(section);
  }

  /** 把当前进度打包成存档结构（包含所有已注册系统扩展段）。 */
  snapshot(now = Date.now()): SaveData {
    const sections: Record<string, unknown> = {};
    for (const section of this.sections) {
      try {
        const value = section.capture();
        if (value !== undefined) sections[section.key] = value;
      } catch {
        // 单个系统采集失败不应让整份存档失败。
      }
    }

    const data: SaveData = {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: now,
      seed: this.context.seed,
      hour: this.context.getHour(),
      player: this.context.getPlayer(),
    };
    if (Object.keys(sections).length > 0) data.sections = sections;

    return data;
  }

  readLocal(): SaveData | null {
    return this.local.load();
  }

  saveLocal(): SaveResult {
    const data = this.snapshot();
    if (!this.local.save(data)) {
      return {
        outcome: 'unavailable',
        message: '本地存储不可用，无法保存；可以改用「导出存档文件」保存到磁盘。',
        data,
      };
    }
    return { outcome: 'saved', message: '已保存到本机浏览器。', data };
  }

  /** 启动时自动续档：只有存档属于当前种子时才恢复，避免把位置套到别的世界。 */
  restoreOnStart(): boolean {
    const data = this.readLocal();
    if (!data || data.seed !== this.context.seed) return false;

    this.restore(data);
    return true;
  }

  loadLocal(): SaveResult {
    const raw = this.local.readRaw();
    if (raw === null) {
      return { outcome: 'missing', message: '还没有本地存档，请先点「保存到本地」。' };
    }

    const parsed = parseSave(raw);
    if (!parsed.ok) {
      return { outcome: 'invalid', message: `本地存档无法读取：${parsed.reason}。` };
    }
    return this.apply(parsed.data);
  }

  createExport(): { name: string; text: string } {
    const data = this.snapshot();
    return { name: saveFileName(data), text: stringifySave(data) };
  }

  /** 导入存档：先落到本地槽位，再按种子决定立即恢复还是重载到对应世界。 */
  importText(raw: string): SaveResult {
    const parsed = parseSave(raw);
    if (!parsed.ok) {
      return { outcome: 'invalid', message: `存档文件无法读取：${parsed.reason}。` };
    }

    const data = parsed.data;
    const stored = this.local.save(data);
    if (data.seed !== this.context.seed && !stored) {
      return {
        outcome: 'unavailable',
        message: '本地存储不可用，无法切换到存档所在的世界。',
        data,
      };
    }
    return this.apply(data);
  }

  removeLocal(): SaveResult {
    this.local.clear();
    return { outcome: 'removed', message: '已删除本地存档。' };
  }

  private apply(data: SaveData): SaveResult {
    if (data.seed !== this.context.seed) {
      this.context.reloadToSeed(data.seed);
      return {
        outcome: 'reloaded',
        message: `存档属于种子 ${data.seed}，正在切换到那个世界…`,
        data,
      };
    }

    this.restore(data);
    return { outcome: 'applied', message: '已载入存档。', data };
  }

  private restore(data: SaveData): void {
    this.context.restorePlayer(data.player);
    this.context.setHour(data.hour);

    for (const section of this.sections) {
      const value = data.sections?.[section.key];
      if (value === undefined) continue;

      try {
        section.restore(value);
      } catch {
        // 扩展系统恢复失败时仍然进入世界，避免一份坏数据把玩家挡在门外。
      }
    }
  }
}
