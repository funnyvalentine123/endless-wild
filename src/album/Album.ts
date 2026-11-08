/** 旅途相册里的一张照片。缩略图是压缩后的 data URL，跟着存档一起走。 */
export interface AlbumPhoto {
  readonly id: string;
  /** 拍摄时间戳（毫秒）。 */
  readonly at: number;
  readonly seed: number;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly hour: number;
  readonly weather: string;
  readonly biome: string;
  readonly title: string;
  /** 压缩后的缩略图（`data:image/jpeg;base64,...`）。 */
  readonly thumb: string;
}

export interface AlbumData {
  photos?: AlbumPhoto[];
}

/** 最多保留的照片数：再多会让本地存档变得很重。 */
export const MAX_PHOTOS = 16;
/** 单张缩略图的字符上限：防止被改坏的存档把内存撑爆。 */
const MAX_THUMB_CHARS = 160_000;
const MAX_TEXT_CHARS = 120;

export type AlbumPhotoInput = Omit<AlbumPhoto, 'id'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_TEXT_CHARS);
}

/**
 * 旅途相册：按拍摄顺序保存照片与拍摄地信息。
 *
 * 纯数据结构，不碰 DOM 与 three.js，方便单元测试；截图与面板由上层接。
 */
export class Album {
  private photos: AlbumPhoto[] = [];
  private sequence = 0;

  get list(): readonly AlbumPhoto[] {
    return this.photos;
  }

  get count(): number {
    return this.photos.length;
  }

  /** 收进一张照片；超过上限时丢掉最旧的一张。返回实际写入的照片。 */
  add(input: AlbumPhotoInput): AlbumPhoto {
    this.sequence += 1;
    const photo: AlbumPhoto = {
      ...input,
      id: `photo-${input.at}-${this.sequence}`,
    };

    this.photos.push(photo);
    while (this.photos.length > MAX_PHOTOS) this.photos.shift();
    return photo;
  }

  remove(id: string): boolean {
    const index = this.photos.findIndex((photo) => photo.id === id);
    if (index < 0) return false;
    this.photos.splice(index, 1);
    return true;
  }

  clear(): void {
    this.photos = [];
  }

  toSave(): AlbumData | undefined {
    if (this.photos.length === 0) return undefined;
    return { photos: this.photos.map((photo) => ({ ...photo })) };
  }

  /** 从存档恢复；任何一项字段不合法都直接跳过，不会让相册整段失效。 */
  fromSave(value: unknown): void {
    this.resetInternal();
    if (!isRecord(value) || !Array.isArray(value.photos)) return;

    const seen = new Set<string>();
    for (const raw of value.photos) {
      const photo = parsePhoto(raw);
      if (!photo || seen.has(photo.id)) continue;
      seen.add(photo.id);
      this.photos.push(photo);
      if (this.photos.length >= MAX_PHOTOS) break;
    }
  }

  private resetInternal(): void {
    this.photos = [];
    this.sequence = 0;
  }
}

function parsePhoto(value: unknown): AlbumPhoto | null {
  if (!isRecord(value)) return null;

  const thumb = value.thumb;
  if (typeof thumb !== 'string' || thumb.length < 32 || thumb.length > MAX_THUMB_CHARS) return null;
  if (!thumb.startsWith('data:image/')) return null;

  const id = value.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;

  if (
    !isFiniteNumber(value.at) ||
    !isFiniteNumber(value.seed) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.z) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.yaw) ||
    !isFiniteNumber(value.pitch) ||
    !isFiniteNumber(value.hour)
  ) {
    return null;
  }

  return {
    id,
    at: value.at,
    seed: value.seed,
    x: value.x,
    z: value.z,
    y: value.y,
    yaw: value.yaw,
    pitch: value.pitch,
    hour: value.hour,
    weather: readText(value.weather),
    biome: readText(value.biome),
    title: readText(value.title),
    thumb,
  };
}
