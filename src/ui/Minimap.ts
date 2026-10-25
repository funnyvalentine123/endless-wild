import {
  MINIMAP_CELLS,
  MINIMAP_METERS_PER_CELL,
  MINIMAP_UPDATE_INTERVAL,
} from '../config/ui';
import { require2DContext, requireElement } from '../core/dom';
import type { PlayerState } from '../player/Player';
import { sampleMapColor } from '../world/TerrainColoring';
import type { World } from '../world/World';

/**
 * 圆形小地图：离屏画布逐格采样地形色，再叠加道路与旋转箭头。
 * 采样范围 50 格 × 6m = 300m，与原始版本一致。
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly offscreen: HTMLCanvasElement;
  private readonly offscreenContext: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private timer = 0;

  constructor(private readonly world: World) {
    this.canvas = requireElement<HTMLCanvasElement>('minimap');
    this.context = require2DContext(this.canvas);

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = MINIMAP_CELLS;
    this.offscreen.height = MINIMAP_CELLS;
    this.offscreenContext = require2DContext(this.offscreen);
    this.image = this.offscreenContext.createImageData(MINIMAP_CELLS, MINIMAP_CELLS);
  }

  update(dt: number, state: PlayerState): void {
    this.timer += dt;
    if (this.timer < MINIMAP_UPDATE_INTERVAL) return;
    this.timer = 0;
    this.draw(state);
  }

  private draw(state: PlayerState): void {
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
    const scale = width / (MINIMAP_CELLS * MINIMAP_METERS_PER_CELL);
    const context = this.context;

    context.save();
    context.clearRect(0, 0, width, width);
    context.beginPath();
    context.arc(width / 2, width / 2, width / 2, 0, Math.PI * 2);
    context.clip();
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
    context.restore();
  }
}
