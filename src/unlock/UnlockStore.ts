import { UNLOCK_STORAGE_KEY } from '../config/unlocks';
import { safeLocalStorage } from '../save/SaveStore';
import type { UnlockSaveData } from './UnlockSystem';

/**
 * 解锁进度的独立存档槽位。
 *
 * 解锁状态同时写在完整存档的 `unlock` 扩展段里，但那份存档只在种子一致时才恢复；
 * 这里单独存一份，保证「新世界」「换种子」或世界存档损坏时，已经解锁的功能不会丢。
 */
export class UnlockStore {
  constructor(
    private readonly key: string,
    private readonly storage: Storage | null,
  ) {}

  static local(): UnlockStore {
    return new UnlockStore(UNLOCK_STORAGE_KEY, safeLocalStorage());
  }

  get available(): boolean {
    return this.storage !== null;
  }

  /** 内容损坏时按“没有进度”处理，让玩家从初始状态开始。 */
  load(): UnlockSaveData | null {
    try {
      const raw = this.storage?.getItem(this.key) ?? null;
      if (raw === null) return null;

      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as UnlockSaveData)
        : null;
    } catch {
      return null;
    }
  }

  save(data: UnlockSaveData | undefined): boolean {
    if (!this.storage) return false;

    try {
      // 没有任何进度时删掉这条记录，避免留下一条空 JSON。
      if (data === undefined) this.storage.removeItem(this.key);
      else this.storage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch {
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
