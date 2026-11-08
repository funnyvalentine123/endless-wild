import { describe, expect, it } from 'vitest';
import { Album, MAX_PHOTOS, type AlbumPhotoInput } from '../../src/album/Album';

const THUMB = `data:image/jpeg;base64,${'A'.repeat(64)}`;

function photo(overrides: Partial<AlbumPhotoInput> = {}): AlbumPhotoInput {
  return {
    at: 1_700_000_000_000,
    seed: 1234,
    x: 10,
    z: -20,
    y: 3.5,
    yaw: 0.25,
    pitch: -0.1,
    hour: 14.5,
    weather: '晴',
    biome: '草原',
    title: '晴 · 草原 · 14:30',
    thumb: THUMB,
    ...overrides,
  };
}

describe('Album', () => {
  it('收进照片并保留拍摄地信息', () => {
    const album = new Album();
    const saved = album.add(photo());

    expect(album.count).toBe(1);
    expect(saved.id).toMatch(/^photo-/);
    expect(album.list[0]).toMatchObject({
      seed: 1234,
      x: 10,
      z: -20,
      weather: '晴',
      biome: '草原',
    });
  });

  it(`超过 ${MAX_PHOTOS} 张时丢掉最旧的一张`, () => {
    const album = new Album();
    const first = album.add(photo({ title: '第一张' }));
    for (let index = 0; index < MAX_PHOTOS; index++) {
      album.add(photo({ at: 1_700_000_000_000 + index + 1, title: `第 ${index + 2} 张` }));
    }

    expect(album.count).toBe(MAX_PHOTOS);
    expect(album.list.some((entry) => entry.id === first.id)).toBe(false);
    expect(album.list.at(-1)?.title).toBe(`第 ${MAX_PHOTOS + 1} 张`);
  });

  it('按 id 删除，删不存在的返回 false', () => {
    const album = new Album();
    const saved = album.add(photo());

    expect(album.remove('missing')).toBe(false);
    expect(album.remove(saved.id)).toBe(true);
    expect(album.count).toBe(0);
  });

  it('存档往返：toSave 的副本不会被后续修改带偏', () => {
    const album = new Album();
    album.add(photo());

    const data = album.toSave();
    expect(data?.photos).toHaveLength(1);

    const restored = new Album();
    restored.fromSave(data);
    expect(restored.list[0]).toMatchObject({ seed: 1234, x: 10, z: -20, biome: '草原' });

    album.clear();
    expect(data?.photos).toHaveLength(1);
  });

  it('空相册不写存档段', () => {
    const album = new Album();
    expect(album.toSave()).toBeUndefined();
  });

  it('坏存档：跳过缩略图非法、字段缺失与重复 id 的条目', () => {
    const album = new Album();
    album.fromSave({
      photos: [
        { ...photo(), id: 'ok-1' },
        { ...photo(), id: 'bad-thumb', thumb: 'not-a-data-url' },
        { ...photo(), id: 'bad-number', x: Number.NaN },
        { ...photo(), id: 'ok-1', title: '重复 id' },
        photo(),
      ],
    });

    expect(album.list.map((entry) => entry.id)).toEqual(['ok-1']);
  });

  it('坏存档：整体结构不对时按空相册处理，不抛错', () => {
    const album = new Album();
    album.fromSave({ photos: 'nope' });
    expect(album.count).toBe(0);

    album.fromSave(null);
    expect(album.count).toBe(0);
  });

  it('fromSave 会先清空旧内容', () => {
    const album = new Album();
    album.add(photo({ title: '旧照片' }));
    album.fromSave({ photos: [] });

    expect(album.count).toBe(0);
  });
});
