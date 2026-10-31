import { parseSave, stringifySave } from './codec';
import { SAVE_STORAGE_KEY, type SaveData } from './types';

/**
 * 访问存档所在的 Web Storage。
 * 隐私模式、被浏览器禁用或配额已满时都可能抛错，所以统一在这里兜住。
 */
function safeStorage(get: () => Storage): Storage | null {
  try {
    return get();
  } catch {
    return null;
  }
}

export function safeLocalStorage(): Storage | null {
  return safeStorage(() => window.localStorage);
}

/**
 * 一个存档槽位。目前只用一个本地槽位，但接口按“键 + 存储”设计，
 * 以后要加多槽位存档只需要多创建几个 SaveStore。
 */
export class SaveStore {
  constructor(
    private readonly key: string,
    private readonly storage: Storage | null,
  ) {}

  static local(): SaveStore {
    return new SaveStore(SAVE_STORAGE_KEY, safeLocalStorage());
  }

  get available(): boolean {
    return this.storage !== null;
  }

  readRaw(): string | null {
    try {
      return this.storage?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

  load(): SaveData | null {
    const raw = this.readRaw();
    if (raw === null) return null;

    const parsed = parseSave(raw);
    return parsed.ok ? parsed.data : null;
  }

  save(data: SaveData): boolean {
    if (!this.storage) return false;

    try {
      this.storage.setItem(this.key, stringifySave(data));
      return true;
    } catch {
      // 配额已满或被无痕模式拒绝：调用方可以提示改用导出文件。
      return false;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // 删不掉也只影响下一次读取，忽略。
    }
  }
}
