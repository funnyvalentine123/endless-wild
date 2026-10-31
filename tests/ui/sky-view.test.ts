import { describe, expect, it } from 'vitest';
import { SKY_RADIUS } from '../../src/config/render';
import {
  MINIMAP_RANGE_METERS,
  SKY_THUMB_INTERVAL,
  SKY_THUMB_SIZE,
  SKY_VIEW_FOG_FAR,
  SKY_VIEW_FOG_NEAR,
  SKY_VIEW_FOV,
  SKY_VIEW_HEIGHT,
  SKY_VIEW_INTERVAL,
  SKY_VIEW_MAX_SCROLL_PIXELS,
  SKY_VIEW_SIZE,
} from '../../src/config/ui';
import { CHUNK_RADIUS, CHUNK_SIZE } from '../../src/config/world';

/** 俯瞰视野的地面宽度。 */
const FOOTPRINT =
  2 * SKY_VIEW_HEIGHT * Math.tan((SKY_VIEW_FOV * Math.PI) / 360);

describe('天穹摄像机配置', () => {
  it('镜头在天空穹顶之内、玩家正上方', () => {
    expect(SKY_VIEW_HEIGHT).toBeGreaterThan(500);
    expect(SKY_VIEW_HEIGHT).toBeLessThan(SKY_RADIUS);
  });

  it('俯瞰范围比小地图大，四角又落在已加载的地形里', () => {
    expect(FOOTPRINT).toBeGreaterThan(MINIMAP_RANGE_METERS * 1.5);
    expect(FOOTPRINT).toBeLessThan(700);
    // 对角线半径不能超出区块加载半径，否则画面四角会露出虚空。
    expect(FOOTPRINT / Math.sqrt(2)).toBeLessThan(CHUNK_RADIUS * CHUNK_SIZE);
  });

  it('俯瞰用远雾，地面不会被正常雾距吞掉', () => {
    expect(SKY_VIEW_FOG_NEAR).toBeGreaterThan(SKY_VIEW_HEIGHT * 0.4);
    expect(SKY_VIEW_FOG_FAR).toBeGreaterThan(SKY_VIEW_FOG_NEAR);
    expect(SKY_VIEW_FOG_FAR).toBeGreaterThan(SKY_VIEW_HEIGHT + 200);
  });

  it('大视野每帧平移跟随，3D 重渲染仍保持 10fps 以上', () => {
    expect(SKY_VIEW_INTERVAL).toBeLessThan(SKY_THUMB_INTERVAL);
    expect(1 / SKY_VIEW_INTERVAL).toBeGreaterThanOrEqual(10);
    expect(SKY_VIEW_MAX_SCROLL_PIXELS).toBeLessThanOrEqual(32);
    expect(SKY_VIEW_SIZE).toBeGreaterThan(SKY_THUMB_SIZE);
    expect(SKY_THUMB_SIZE).toBeGreaterThanOrEqual(128);
  });
});
