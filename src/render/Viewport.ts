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
