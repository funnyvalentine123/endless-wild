import { describe, expect, it } from 'vitest';
import {
  BIG_MAP_RANGE_METERS,
  BIG_MAP_TEXTURE_SIZE,
  MINIMAP_METERS_PER_CELL,
  MINIMAP_CELLS,
  MINIMAP_RANGE_METERS,
} from '../../src/config/ui';

describe('大地图配置', () => {
  it('范围是小地图的 10 倍长宽', () => {
    expect(MINIMAP_RANGE_METERS).toBe(MINIMAP_CELLS * MINIMAP_METERS_PER_CELL);
    expect(MINIMAP_RANGE_METERS).toBe(300);
    expect(BIG_MAP_RANGE_METERS).toBe(MINIMAP_RANGE_METERS * 10);
    expect(BIG_MAP_RANGE_METERS).toBe(3000);
  });

  it('地图纹理分辨率足够覆盖 3km 范围', () => {
    expect(BIG_MAP_TEXTURE_SIZE).toBeGreaterThanOrEqual(256);
    expect(BIG_MAP_RANGE_METERS / BIG_MAP_TEXTURE_SIZE).toBeLessThan(6.1);
  });
});
