import {
  MINIMAP_CELLS,
  MINIMAP_METERS_PER_CELL,
  MINIMAP_RANGE_METERS,
  MINIMAP_UPDATE_INTERVAL,
} from '../config/ui';
import { require2DContext, requireElement } from '../core/dom';
import type { GemSighting } from '../gems/GemManager';
import type { PlayerState } from '../player/Player';
import { sampleMapColor } from '../world/TerrainColoring';
import type { World } from '../world/World';
import { gemGlowColor } from './gemIcon';

/**
 * 圆形小地图：离屏画布逐格采样地形色，再叠加道路、宝石光点与旋转箭头。
 * 采样范围 50 格 × 6m = 300m，与原始版本一致。
 *
 * 地形采样仍然每 `MINIMAP_UPDATE_INTERVAL` 秒一次（这是最贵的部分），
 * 但地形 + 道路会先合成到一张底图上，宝石光点与玩家箭头改为每帧重绘：
 * 转视角、动物身上的红宝石移动时都跟手，而采样频率不变。
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly offscreen: HTMLCanvasElement;
  private readonly offscreenContext: CanvasRenderingContext2D;
  private readonly image: ImageData;
  /** 地形 + 道路的缓存底图，避免每帧重采样。 */
  private readonly base: HTMLCanvasElement;
  private readonly baseContext: CanvasRenderingContext2D;
  /** 已经落后于第一次采样，第一帧就画一次地形。 */
  private timer = MINIMAP_UPDATE_INTERVAL;
  /** 宝石雷达点位：未解锁「宝石雷达」时为 null。 */
  private gems: readonly GemSighting[] | null = null;

  constructor(private readonly world: World) {
    this.canvas = requireElement<HTMLCanvasElement>('minimap');
    this.context = require2DContext(this.canvas);

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = MINIMAP_CELLS;
    this.offscreen.height = MINIMAP_CELLS;
    this.offscreenContext = require2DContext(this.offscreen);
    this.image = this.offscreenContext.createImageData(MINIMAP_CELLS, MINIMAP_CELLS);

    this.base = document.createElement('canvas');
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.width;
    this.baseContext = require2DContext(this.base);
  }

  /** 宝石雷达开关：由 Game 在解锁状态变化时写入点位，未解锁传 null。 */
  setGems(spots: readonly GemSighting[] | null): void {
    this.gems = spots;
  }

  update(dt: number, state: PlayerState): void {
    this.timer += dt;
    if (this.timer >= MINIMAP_UPDATE_INTERVAL) {
      this.timer = 0;
      this.drawBase(state);
    }
    this.render(state);
  }

  /** 采样地形 + 道路，存进缓存底图；真正的采样成本都在这里。 */
  private drawBase(state: PlayerState): void {
    const half = MINIMAP_CELLS / 2;
    const data = this.image.data;

    for (let row = 0; row < MINIMAP_CELLS; row++) {
      for (let column = 0; column < MINIMAP_CELLS; column++) {
        const color = sampleMapColor(
          this.world,
          state.x + (column - half) * MINIMAP_METERS_PER_CELL,
          state.z + (row - half) * MINIMAP_METERS_PER_CELL,
        );
        const offset = (row * MINIMAP_CELLS + column) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }

    this.offscreenContext.putImageData(this.image, 0, 0);

    const width = this.canvas.width;
    const scale = width / MINIMAP_RANGE_METERS;
    const context = this.baseContext;

    context.clearRect(0, 0, width, width);
    context.imageSmoothingEnabled = true;
    context.drawImage(this.offscreen, 0, 0, width, width);

    context.strokeStyle = 'rgba(120,92,60,0.95)';
    context.lineWidth = 3;
    context.beginPath();
    const range = half * MINIMAP_METERS_PER_CELL;
    for (let z = -range; z <= range; z += 6) {
      const worldZ = state.z + z;
      const px = width / 2 + (this.world.roadX(worldZ) - state.x) * scale;
      const py = width / 2 + z * scale;
      if (z === -range) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  }

  /** 每帧：底图贴到圆形画布，再叠加宝石光点与玩家箭头。 */
  private render(state: PlayerState): void {
    const width = this.canvas.width;
    const context = this.context;

    context.save();
    context.clearRect(0, 0, width, width);
    context.beginPath();
    context.arc(width / 2, width / 2, width / 2, 0, Math.PI * 2);
    context.clip();
    context.imageSmoothingEnabled = true;
    context.drawImage(this.base, 0, 0, width, width);

    this.drawGems(state, width);
    this.drawPlayer(state, width);
    context.restore();
  }

  /** 宝石雷达：按宝石光晕色画小圆点，超出 150m 半径的不画。 */
  private drawGems(state: PlayerState, width: number): void {
    if (!this.gems || this.gems.length === 0) return;

    const scale = width / MINIMAP_RANGE_METERS;
    const half = MINIMAP_RANGE_METERS / 2;
    const context = this.context;

    context.save();
    context.shadowBlur = 7;
    for (const gem of this.gems) {
      const dx = gem.x - state.x;
      const dz = gem.z - state.z;
      if (Math.abs(dx) > half || Math.abs(dz) > half) continue;

      const color = gemGlowColor(gem.kind);
      const px = width / 2 + dx * scale;
      const py = width / 2 + dz * scale;
      context.shadowColor = color;
      context.fillStyle = color;
      context.beginPath();
      context.arc(px, py, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawPlayer(state: PlayerState, width: number): void {
    const context = this.context;

    context.translate(width / 2, width / 2);
    context.rotate(-state.yaw);
    context.fillStyle = '#ff5a3c';
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(6, 6);
    context.lineTo(0, 3);
    context.lineTo(-6, 6);
    context.closePath();
    context.fill();
    context.stroke();
  }
}
