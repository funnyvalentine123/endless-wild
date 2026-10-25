import {
  BIG_MAP_FRAME_BUDGET_MS,
  BIG_MAP_GRID_METERS,
  BIG_MAP_RANGE_METERS,
  BIG_MAP_ROAD_STEP_METERS,
  BIG_MAP_SCALE_BAR_METERS,
  BIG_MAP_TEXTURE_SIZE,
  MINIMAP_RANGE_METERS,
} from '../config/ui';
import { require2DContext, requireElement } from '../core/dom';
import type { PlayerState } from '../player/Player';
import { sampleMapColor } from '../world/TerrainColoring';
import type { World } from '../world/World';

export interface BigMapHandlers {
  onOpenRequest: () => void;
  onCloseRequest: () => void;
}

const SIZE = BIG_MAP_TEXTURE_SIZE;
const HALF_RANGE = BIG_MAP_RANGE_METERS / 2;

/**
 * 大地图：以玩家为中心显示 3000m × 3000m（当前小地图长宽的 10 倍）。
 *
 * 地形采样按行分片生成，每片只花约 12ms，打开地图时不会长时间冻结主线程。
 * 地图本身是 north-up，玩家箭头会随 yaw 旋转。
 */
export class BigMap {
  private readonly overlay = requireElement<HTMLElement>('bigMap');
  private readonly canvas = requireElement<HTMLCanvasElement>('bigMapCanvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly loading = requireElement<HTMLElement>('bigMapLoading');
  private readonly meta = requireElement<HTMLElement>('bigMapMeta');
  private readonly coords = requireElement<HTMLElement>('bigMapCoords');
  private readonly closeButton = requireElement<HTMLButtonElement>('bigMapClose');
  private readonly openButton = requireElement<HTMLButtonElement>('mapOpen');
  private readonly minimap = requireElement<HTMLCanvasElement>('minimap');
  private readonly offscreen = document.createElement('canvas');
  private readonly offscreenContext: CanvasRenderingContext2D;

  private image: ImageData | null = null;
  private generation = 0;
  private row = 0;
  private centerX = 0;
  private centerZ = 0;
  private playerYaw = 0;

  private readonly handleOpenRequest = (): void => this.handlers.onOpenRequest();
  private readonly handleCloseRequest = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };

  constructor(
    private readonly world: World,
    private readonly handlers: BigMapHandlers,
  ) {
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.context = require2DContext(this.canvas);

    this.offscreen.width = SIZE;
    this.offscreen.height = SIZE;
    this.offscreenContext = require2DContext(this.offscreen);

    this.openButton.setAttribute('aria-expanded', 'false');
    this.openButton.addEventListener('click', this.handleOpenRequest);
    this.minimap.addEventListener('click', this.handleOpenRequest);
    this.closeButton.addEventListener('click', this.handleCloseRequest);
    this.overlay.addEventListener('click', this.handleBackdrop);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(state: PlayerState): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
    this.openButton.setAttribute('aria-expanded', 'true');
    this.closeButton.focus();

    this.centerX = state.x;
    this.centerZ = state.z;
    this.playerYaw = state.yaw;
    this.row = 0;
    this.image = this.offscreenContext.createImageData(SIZE, SIZE);

    this.meta.textContent = `${(BIG_MAP_RANGE_METERS / 1000).toFixed(1)} km × ${(
      BIG_MAP_RANGE_METERS / 1000
    ).toFixed(1)} km · 小地图的 ${BIG_MAP_RANGE_METERS / MINIMAP_RANGE_METERS} 倍长宽`;
    this.coords.textContent = `X ${Math.round(state.x)} · Z ${Math.round(
      state.z,
    )} · ${this.world.biomeAt(state.x, state.z)} · 种子 ${this.world.seed}`;

    this.context.clearRect(0, 0, SIZE, SIZE);
    this.loading.hidden = false;
    this.loading.textContent = '正在绘制大地图…';

    const token = ++this.generation;
    // 用 setTimeout 分片而不是 rAF：大地图是纯 CPU 采样，
    // 即使页面渲染帧率很低也能尽快画完。
    window.setTimeout(() => this.step(token), 0);
  }

  close(): void {
    this.generation++;
    this.image = null;
    this.overlay.hidden = true;
    this.openButton.setAttribute('aria-expanded', 'false');
    this.loading.hidden = true;
    // 不把焦点留在隐藏的按钮上，避免回到游戏后按空格误触。
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  dispose(): void {
    this.generation++;
    this.image = null;
    this.overlay.hidden = true;
    this.openButton.removeEventListener('click', this.handleOpenRequest);
    this.minimap.removeEventListener('click', this.handleOpenRequest);
    this.closeButton.removeEventListener('click', this.handleCloseRequest);
    this.overlay.removeEventListener('click', this.handleBackdrop);
  }

  private step(token: number): void {
    if (token !== this.generation || !this.image) return;

    const data = this.image.data;
    const deadline = performance.now() + BIG_MAP_FRAME_BUDGET_MS;

    while (this.row < SIZE && performance.now() < deadline) {
      const row = this.row;
      const worldZ = this.centerZ + (row / (SIZE - 1) - 0.5) * BIG_MAP_RANGE_METERS;

      for (let column = 0; column < SIZE; column++) {
        const worldX = this.centerX + (column / (SIZE - 1) - 0.5) * BIG_MAP_RANGE_METERS;
        const color = sampleMapColor(this.world, worldX, worldZ);
        const offset = (row * SIZE + column) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }

      this.row++;
    }

    if (this.row < SIZE) {
      this.loading.textContent = `正在绘制大地图 ${Math.round((this.row / SIZE) * 100)}%`;
      window.setTimeout(() => this.step(token), 0);
      return;
    }

    this.offscreenContext.putImageData(this.image, 0, 0);
    this.draw();
    this.loading.hidden = true;
  }

  private draw(): void {
    this.context.clearRect(0, 0, SIZE, SIZE);
    this.context.imageSmoothingEnabled = true;
    this.context.drawImage(this.offscreen, 0, 0, SIZE, SIZE);

    this.drawGrid();
    this.drawRoad();
    this.drawScaleBar();
    this.drawNorth();
    this.drawPlayer();
  }

  private drawGrid(): void {
    const context = this.context;
    const minX = this.centerX - HALF_RANGE;
    const maxX = this.centerX + HALF_RANGE;
    const minZ = this.centerZ - HALF_RANGE;
    const maxZ = this.centerZ + HALF_RANGE;

    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.14)';
    context.lineWidth = 1;

    for (let x = Math.ceil(minX / BIG_MAP_GRID_METERS) * BIG_MAP_GRID_METERS; x <= maxX; x += BIG_MAP_GRID_METERS) {
      const [px] = this.toCanvas(x, this.centerZ);
      context.beginPath();
      context.moveTo(px, 0);
      context.lineTo(px, SIZE);
      context.stroke();
    }

    for (let z = Math.ceil(minZ / BIG_MAP_GRID_METERS) * BIG_MAP_GRID_METERS; z <= maxZ; z += BIG_MAP_GRID_METERS) {
      const [, py] = this.toCanvas(this.centerX, z);
      context.beginPath();
      context.moveTo(0, py);
      context.lineTo(SIZE, py);
      context.stroke();
    }

    context.restore();
  }

  private drawRoad(): void {
    const path = new Path2D();
    const minZ = this.centerZ - HALF_RANGE;
    const maxZ = this.centerZ + HALF_RANGE;
    let started = false;

    for (let z = minZ; z <= maxZ; z += BIG_MAP_ROAD_STEP_METERS) {
      const [px, py] = this.toCanvas(this.world.roadX(z), z);
      if (!started) {
        path.moveTo(px, py);
        started = true;
      } else {
        path.lineTo(px, py);
      }
    }

    this.context.save();
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.strokeStyle = 'rgba(54,38,22,0.92)';
    this.context.lineWidth = 5;
    this.context.stroke(path);
    this.context.strokeStyle = '#e8d1a6';
    this.context.lineWidth = 1.5;
    this.context.stroke(path);
    this.context.restore();
  }

  private drawPlayer(): void {
    const context = this.context;

    context.save();
    context.translate(SIZE / 2, SIZE / 2);
    context.rotate(-this.playerYaw);
    context.beginPath();
    context.moveTo(0, -11);
    context.lineTo(8, 9);
    context.lineTo(0, 4);
    context.lineTo(-8, 9);
    context.closePath();
    context.fillStyle = '#ff5a3c';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawScaleBar(): void {
    const context = this.context;
    const barWidth = (BIG_MAP_SCALE_BAR_METERS / BIG_MAP_RANGE_METERS) * SIZE;
    const margin = 18;
    const y = SIZE - margin;

    context.save();
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(0,0,0,0.55)';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(margin, y);
    context.lineTo(margin + barWidth, y);
    context.stroke();

    context.strokeStyle = 'rgba(255,255,255,0.92)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(margin, y);
    context.lineTo(margin + barWidth, y);
    context.stroke();

    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.font = '12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = 'left';
    context.fillText('1 km', margin, y - 7);
    context.restore();
  }

  private drawNorth(): void {
    this.context.save();
    this.context.fillStyle = 'rgba(255,255,255,0.92)';
    this.context.font = 'bold 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    this.context.textAlign = 'center';
    this.context.fillText('N', SIZE / 2, 20);
    this.context.restore();
  }

  private toCanvas(worldX: number, worldZ: number): readonly [number, number] {
    return [
      SIZE / 2 + ((worldX - this.centerX) / BIG_MAP_RANGE_METERS) * SIZE,
      SIZE / 2 + ((worldZ - this.centerZ) / BIG_MAP_RANGE_METERS) * SIZE,
    ];
  }
}
