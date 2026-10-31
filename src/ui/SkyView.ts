import { PerspectiveCamera } from 'three';
import {
  SKY_THUMB_INTERVAL,
  SKY_THUMB_SIZE,
  SKY_VIEW_FAR,
  SKY_VIEW_FOV,
  SKY_VIEW_HEIGHT,
  SKY_VIEW_INTERVAL,
  SKY_VIEW_MAX_SCROLL_PIXELS,
  SKY_VIEW_NEAR,
  SKY_VIEW_SIZE,
} from '../config/ui';
import { require2DContext, requireElement } from '../core/dom';
import type { PlayerState } from '../player/Player';
import type { SceneEnvironment } from '../render/environment/SceneEnvironment';
import type { Viewport } from '../render/Viewport';
import type { World } from '../world/World';

export interface SkyViewHandlers {
  onOpenRequest: () => void;
  onCloseRequest: () => void;
}

/**
 * 天穹摄像机：架在天空正上方、玩家头顶的垂直俯瞰镜头。
 *
 * 缩略图常驻右上角小地图下方，点击（或按 N）打开与大地图同款的大视野。
 * 两种尺寸都复用同一个相机与同一次渲染：关闭大视野时低频刷新缩略图；
 * 打开后每帧把上一张俯瞰图按玩家位移像素平移到画面中心，3D 俯瞰本身只需
 * `SKY_VIEW_INTERVAL`（12fps）重渲染一次，走起来既跟手又不掉帧。
 */
export class SkyView {
  private readonly camera = new PerspectiveCamera(
    SKY_VIEW_FOV,
    1,
    SKY_VIEW_NEAR,
    SKY_VIEW_FAR,
  );
  private readonly overlay = requireElement<HTMLElement>('skyView');
  private readonly canvas = requireElement<HTMLCanvasElement>('skyViewCanvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly thumbButton = requireElement<HTMLButtonElement>('skyOpen');
  /** 天穹视图下方的「天穹大视野」按钮，与大地图按钮同一套样式。 */
  private readonly bigButton = requireElement<HTMLButtonElement>('skyBigOpen');
  private readonly thumbCanvas = requireElement<HTMLCanvasElement>('skyCanvas');
  private readonly thumbContext: CanvasRenderingContext2D;
  private readonly meta = requireElement<HTMLElement>('skyViewMeta');
  private readonly coords = requireElement<HTMLElement>('skyViewCoords');
  private readonly closeButton = requireElement<HTMLButtonElement>('skyViewClose');
  /** 大视野的离屏底图：先渲染到这里，再按位移拷到可见画布。 */
  private readonly frameCanvas = document.createElement('canvas');
  private readonly frameContext: CanvasRenderingContext2D;

  private timer = 0;
  private coordsTimer = 0;
  /** 最近一次 3D 渲染时相机所在的水平位置。 */
  private renderedX = Number.NaN;
  private renderedZ = Number.NaN;

  private readonly handleOpenRequest = (): void => this.handlers.onOpenRequest();
  private readonly handleCloseRequest = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };

  constructor(
    private readonly viewport: Viewport,
    private readonly environment: SceneEnvironment,
    private readonly world: World,
    private readonly handlers: SkyViewHandlers,
  ) {
    this.context = require2DContext(this.canvas);
    this.thumbContext = require2DContext(this.thumbCanvas);
    this.frameCanvas.width = SKY_VIEW_SIZE;
    this.frameCanvas.height = SKY_VIEW_SIZE;
    this.frameContext = require2DContext(this.frameCanvas);

    // 相机在北向上垂直向下看：up 指向北（-Z），屏幕上方就是地图上方。
    this.camera.up.set(0, 0, -1);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();

    this.meta.textContent = `天穹 ${SKY_VIEW_HEIGHT}m 垂直俯瞰 · 视野约 ${Math.round(
      2 * SKY_VIEW_HEIGHT * Math.tan((SKY_VIEW_FOV * Math.PI) / 360),
    )}m · 北向上`;
    this.coords.textContent = '';
    this.setExpanded(false);

    this.thumbButton.addEventListener('click', this.handleOpenRequest);
    this.bigButton.addEventListener('click', this.handleOpenRequest);
    this.closeButton.addEventListener('click', this.handleCloseRequest);
    this.overlay.addEventListener('click', this.handleBackdrop);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(state: PlayerState): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
    this.setExpanded(true);
    // 不把焦点放在关闭按钮/画面上：这样开图时仍可用空格跳跃、WASD 行走。
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.timer = 999;
    this.coordsTimer = 999;
    this.renderedX = Number.NaN;
    this.renderedZ = Number.NaN;
    this.update(0, state);
  }

  close(): void {
    if (!this.isOpen) return;

    this.overlay.hidden = true;
    this.setExpanded(false);
    // 关闭后缩略图恢复低频刷新，下次打开重新渲染。
    this.timer = 0;
    this.renderedX = Number.NaN;
    this.renderedZ = Number.NaN;
  }

  dispose(): void {
    this.overlay.hidden = true;
    this.thumbButton.removeEventListener('click', this.handleOpenRequest);
    this.bigButton.removeEventListener('click', this.handleOpenRequest);
    this.closeButton.removeEventListener('click', this.handleCloseRequest);
    this.overlay.removeEventListener('click', this.handleBackdrop);
  }

  /** 缩略图与下方按钮都带 aria-expanded，同步大视野的开关状态。 */
  private setExpanded(expanded: boolean): void {
    const value = expanded ? 'true' : 'false';
    this.thumbButton.setAttribute('aria-expanded', value);
    this.bigButton.setAttribute('aria-expanded', value);
  }

  /**
   * 每帧调用：镜头始终在玩家正上方，按“大视野打开/关闭”选择刷新策略。
   */
  update(dt: number, state: PlayerState): void {
    this.timer += dt;
    this.coordsTimer += dt;

    if (!this.isOpen) {
      if (this.timer < SKY_THUMB_INTERVAL) return;
      this.timer = 0;
      this.placeCamera(state);
      this.renderOverview(this.thumbContext, SKY_THUMB_SIZE);
      this.drawPlayerMarker(this.thumbContext);
      return;
    }

    // 大视野打开：先把上一张俯瞰图按位移平移到主角仍居中。
    const stale = !Number.isFinite(this.renderedX);
    let shiftX = stale ? 0 : (state.x - this.renderedX) / this.metersPerPixel;
    let shiftZ = stale ? 0 : (state.z - this.renderedZ) / this.metersPerPixel;
    const drifting =
      Math.abs(shiftX) > SKY_VIEW_MAX_SCROLL_PIXELS ||
      Math.abs(shiftZ) > SKY_VIEW_MAX_SCROLL_PIXELS;

    if (stale || drifting || this.timer >= SKY_VIEW_INTERVAL) {
      this.placeCamera(state);
      this.renderOverview(this.frameContext, SKY_VIEW_SIZE);
      this.renderedX = state.x;
      this.renderedZ = state.z;
      this.timer = 0;
      shiftX = 0;
      shiftZ = 0;
    }

    this.context.drawImage(this.frameCanvas, -shiftX, -shiftZ);
    this.drawPlayerMarker(this.context);

    if (this.coordsTimer >= 0.4) {
      this.coordsTimer = 0;
      this.coords.textContent = `X ${Math.round(state.x)} · Z ${Math.round(state.z)} · ${this.world.biomeAt(
        state.x,
        state.z,
      )} · 种子 ${this.world.seed}`;
    }
  }

  private get metersPerPixel(): number {
    return (
      (2 * SKY_VIEW_HEIGHT * Math.tan((SKY_VIEW_FOV * Math.PI) / 360)) / this.canvas.width
    );
  }

  /** 借用主画布渲染一帧俯瞰，拷进目标 2D 画布；雾与云在期间临时调整。 */
  private renderOverview(
    context: CanvasRenderingContext2D,
    size: number,
  ): void {
    this.environment.beginSkyView();
    this.viewport.renderOverview(this.camera, context, size);
    this.environment.endSkyView();
  }

  private placeCamera(state: PlayerState): void {
    this.camera.position.set(state.x, SKY_VIEW_HEIGHT, state.z);
    this.camera.lookAt(state.x, 0, state.z);
  }

  /**
   * 画面中心就是主角所在区域：只画一团从红到透明的渐变标记。
   * 不画圆环、不画箭头——线条会挡住主角脚下的地形（尤其第三人称时挡住角色本体）。
   */
  private drawPlayerMarker(context: CanvasRenderingContext2D): void {
    const size = context.canvas.width;
    const center = size / 2;
    const radius = Math.max(5, size * 0.042);
    const gradient = context.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      radius,
    );
    gradient.addColorStop(0, 'rgba(255, 72, 44, 0.95)');
    gradient.addColorStop(0.32, 'rgba(255, 72, 44, 0.5)');
    gradient.addColorStop(0.7, 'rgba(255, 72, 44, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 72, 44, 0)');

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
  }
}
