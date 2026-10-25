import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import { SKY_HEIGHT_SEGMENTS, SKY_RADIUS, SKY_WIDTH_SEGMENTS } from '../../config/render';
import type { DaylightSnapshot } from './Daylight';

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 top;
  uniform vec3 bottom;
  uniform vec3 sunDir;
  uniform vec3 sunCol;
  uniform float sunVisibility;
  varying vec3 vDir;

  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 color = mix(bottom, top, pow(max(h, 0.0), 0.55));
    float sun = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
    color += sunCol * (pow(sun, 900.0) * 1.6 + pow(sun, 12.0) * 0.25) * sunVisibility;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const RAIN_TOP = new Color(0x6f7f8a);
const RAIN_BOTTOM = new Color(0x9fadb6);
const SNOW_TOP = new Color(0x93a4b0);
const SNOW_BOTTOM = new Color(0xd0dde5);

/** 跟随相机的渐变天空穹顶。 */
export class SkyDome {
  private readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly overcastTop = new Color();
  private readonly overcastBottom = new Color();
  private readonly uniforms = {
    top: { value: new Color(0x3d8fe0) },
    bottom: { value: new Color(0xbfe3ff) },
    sunDir: { value: new Vector3(0, 1, 0) },
    sunCol: { value: new Color(0xfff2c0) },
    sunVisibility: { value: 1 },
  };

  constructor(private readonly scene: Scene) {
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      side: BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    this.mesh = new Mesh(
      new SphereGeometry(SKY_RADIUS, SKY_WIDTH_SEGMENTS, SKY_HEIGHT_SEGMENTS),
      material,
    );
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  apply(daylight: DaylightSnapshot): void {
    this.uniforms.top.value.copy(daylight.skyTop);
    this.uniforms.bottom.value.copy(daylight.skyBottom);
    this.uniforms.sunDir.value.copy(daylight.sunDirection);
    this.uniforms.sunCol.value.copy(daylight.skySunColor);
  }

  /** 阴天时压暗天空、隐藏太阳圆盘；snowRatio 控制偏冷还是偏灰。 */
  applyWeather(amount: number, snowRatio: number): void {
    this.uniforms.sunVisibility.value = 1 - amount * 0.95;
    if (amount <= 0) return;

    this.overcastTop.copy(RAIN_TOP).lerp(SNOW_TOP, snowRatio);
    this.overcastBottom.copy(RAIN_BOTTOM).lerp(SNOW_BOTTOM, snowRatio);
    const blend = Math.min(1, amount) * 0.72;
    this.uniforms.top.value.lerp(this.overcastTop, blend);
    this.uniforms.bottom.value.lerp(this.overcastBottom, blend);
  }

  follow(cameraPosition: Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
