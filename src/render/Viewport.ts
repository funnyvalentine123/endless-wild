import {
  ACESFilmicToneMapping,
  Fog,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_FAR,
  FOG_NEAR,
  INITIAL_FOG_COLOR,
  PIXEL_RATIO_CAP,
  TONE_MAPPING_EXPOSURE,
} from '../config/render';

/**
 * Three.js r163 起 WebGLRenderer 只支持 WebGL 2。
 * 用一个临时 canvas 探测能力，避免提前创建主 canvas 的上下文而改变渲染器属性。
 */
function supportsWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** WebGL 渲染器、场景与相机的最小封装，只负责尺寸与全局渲染设置。 */
export class Viewport {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;

  private readonly resizeHandler = (): void => this.resize();

  constructor(readonly canvas: HTMLCanvasElement) {
    if (!supportsWebGL2()) {
      throw new Error('当前浏览器不支持 WebGL 2，请升级浏览器或开启硬件加速后重试');
    }

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

    this.scene = new Scene();
    this.scene.fog = new Fog(INITIAL_FOG_COLOR, FOG_NEAR, FOG_FAR);

    this.camera = new PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );

    this.resize();
    window.addEventListener('resize', this.resizeHandler);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 用第二台相机渲染一块正方形俯瞰视野，并把结果拷贝到 2D 画布。
   *
   * 渲染只占用主画布左下角的正方形区域，因此必须在 render() 之前调用：
   * 紧随其后的主视角渲染会把整块画布重新覆盖，画面不会留下这块区域。
   * 这样不需要离屏渲染目标，也避免了 readPixels 的同步回读。
   *
   * 设备像素数被限制在 2D 画布分辨率（square）以内：目标画布本身只有
   * square×square，Retina 屏上再按 2~3 倍像素渲染只是白白多出 4~9 倍填充成本，
   * 天穹大视野打开并移动时就会掉帧。
   */
  renderOverview(
    camera: PerspectiveCamera,
    context: CanvasRenderingContext2D,
    square: number,
  ): void {
    const renderer = this.renderer;
    const canvas = renderer.domElement;
    const pixelRatio = renderer.getPixelRatio();
    // 正方形必须完整落在画布内；WebGL 视口原点在左下角。
    const size = Math.max(32, Math.min(square, window.innerWidth, window.innerHeight));
    const device = Math.min(
      Math.round(size * pixelRatio),
      square,
      canvas.width,
      canvas.height,
    );
    const logical = Math.max(32, Math.floor(device / pixelRatio));
    // 视口按像素比放大后可能差 1px，用实际生效的设备像素做拷贝源矩形。
    const source = Math.min(Math.floor(logical * pixelRatio), canvas.height);

    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, logical, logical);
    renderer.setScissor(0, 0, logical, logical);
    renderer.render(this.scene, camera);

    context.drawImage(
      canvas,
      0,
      canvas.height - source,
      source,
      source,
      0,
      0,
      context.canvas.width,
      context.canvas.height,
    );

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.renderer.dispose();
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
