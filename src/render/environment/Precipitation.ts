import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Scene,
} from 'three';
import { PIXEL_RATIO_CAP } from '../../config/render';
import {
  WEATHER_BOX,
  WEATHER_PARTICLE_MAX,
  type WeatherSnapshot,
} from '../../config/weather';
import { createRandom } from '../../math/random';

const RAIN_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uBox;
  uniform vec2 uWind;
  uniform float uPixelRatio;
  varying float vFade;

  void main() {
    float h = uBox.y;
    float y = mod(position.y - uTime * (17.0 + aSeed * 9.0), h);
    float x = mod(position.x + uWind.x * (h - y) * 0.03 + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
    float z = mod(position.z + uWind.y * (h - y) * 0.03 + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;

    vec4 mv = viewMatrix * vec4(uOrigin + vec3(x, y - h * 0.35, z), 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(0.5, -mv.z);
    gl_PointSize = clamp(aSize * uPixelRatio * 8.0 / dist, 2.0, 34.0);
    vFade = smoothstep(0.0, 2.0, y)
      * (1.0 - smoothstep(h - 3.0, h, y))
      * (1.0 - smoothstep(18.0, 40.0, dist));
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSlant;
  varying float vFade;

  void main() {
    vec2 uv = gl_PointCoord;
    uv.x += (uv.y - 0.5) * uSlant;

    float line = smoothstep(0.40, 0.48, uv.x) * (1.0 - smoothstep(0.52, 0.60, uv.x));
    float ends = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.88, 1.0, uv.y));
    float alpha = line * ends * vFade * uOpacity;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

const SNOW_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uBox;
  uniform vec2 uWind;
  uniform float uPixelRatio;
  varying float vFade;

  void main() {
    float h = uBox.y;
    float y = mod(position.y - uTime * (1.4 + aSeed * 1.8), h);
    float sway = sin(uTime * 0.8 + aSeed * 41.0 + y * 0.6) * 0.7;
    float drift = cos(uTime * 0.55 + aSeed * 27.0) * 0.4;

    float x = mod(position.x + sway + uWind.x * (h - y) * 0.05 + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
    float z = mod(position.z + drift + uWind.y * (h - y) * 0.05 + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;

    vec4 mv = viewMatrix * vec4(uOrigin + vec3(x, y - h * 0.35, z), 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(0.5, -mv.z);
    gl_PointSize = clamp(aSize * uPixelRatio * 7.0 / dist, 1.5, 16.0);
    vFade = smoothstep(0.0, 2.0, y)
      * (1.0 - smoothstep(h - 3.0, h, y))
      * (1.0 - smoothstep(16.0, 36.0, dist));
  }
`;

const SNOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.16, d) * vFade * uOpacity;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function createGeometry(
  count: number,
  seed: number,
  sizeMin: number,
  sizeMax: number,
): BufferGeometry {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const { width, height, depth } = WEATHER_BOX;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * width;
    positions[i * 3 + 1] = random() * height;
    positions[i * 3 + 2] = (random() - 0.5) * depth;
    seeds[i] = random();
    sizes[i] = sizeMin + random() * (sizeMax - sizeMin);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}

/**
 * GPU 驱动的雨雪粒子：每帧只写 uniform 和 drawRange，位置全部在顶点着色器里循环，
 * 雨、雪各一次 draw call。体积跟随相机，不会因玩家移动而耗尽。
 */
export class Precipitation {
  private readonly rain: Points<BufferGeometry, ShaderMaterial>;
  private readonly snow: Points<BufferGeometry, ShaderMaterial>;
  private readonly origin = new Vector3();
  private readonly box = new Vector3(WEATHER_BOX.width, WEATHER_BOX.height, WEATHER_BOX.depth);
  private readonly wind = new Vector2();

  constructor(private readonly scene: Scene) {
    this.rain = this.createPoints(
      WEATHER_PARTICLE_MAX.rain,
      101,
      10,
      20,
      new Color(0xbfd8ea),
      0.5,
      RAIN_VERTEX,
      RAIN_FRAGMENT,
    );
    this.snow = this.createPoints(
      WEATHER_PARTICLE_MAX.snow,
      707,
      3,
      6,
      new Color(0xffffff),
      0.9,
      SNOW_VERTEX,
      SNOW_FRAGMENT,
    );

    this.rain.renderOrder = 2;
    this.snow.renderOrder = 3;
    scene.add(this.rain, this.snow);
  }

  applyWeather(weather: WeatherSnapshot): void {
    this.setVolume(this.rain, weather.rain, 0.5);
    this.setVolume(this.snow, weather.snow, 0.9);

    this.rain.material.uniforms.uSlant.value = Math.max(-0.6, Math.min(0.6, weather.windX * 0.06));

    this.wind.set(weather.windX, weather.windZ);
    this.rain.material.uniforms.uWind.value.copy(this.wind);
    this.snow.material.uniforms.uWind.value.copy(this.wind);
  }

  update(elapsed: number, cameraPosition: Vector3): void {
    this.origin.copy(cameraPosition);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);

    for (const points of [this.rain, this.snow]) {
      points.material.uniforms.uTime.value = elapsed;
      points.material.uniforms.uOrigin.value.copy(this.origin);
      points.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  dispose(): void {
    for (const points of [this.rain, this.snow]) {
      this.scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
    }
  }

  private setVolume(
    points: Points<BufferGeometry, ShaderMaterial>,
    volume: number,
    baseOpacity: number,
  ): void {
    const count = Math.round(points.geometry.attributes.position.count * volume);
    points.geometry.setDrawRange(0, count);
    points.visible = count > 1;
    points.material.uniforms.uOpacity.value = baseOpacity * (0.35 + 0.65 * volume);
  }

  private createPoints(
    count: number,
    seed: number,
    sizeMin: number,
    sizeMax: number,
    color: Color,
    opacity: number,
    vertexShader: string,
    fragmentShader: string,
  ): Points<BufferGeometry, ShaderMaterial> {
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new Vector3() },
        uBox: { value: this.box },
        uWind: { value: new Vector2() },
        uPixelRatio: { value: 1 },
        uColor: { value: color },
        uOpacity: { value: opacity },
        uSlant: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    const points = new Points(createGeometry(count, seed, sizeMin, sizeMax), material);
    points.frustumCulled = false;
    points.visible = false;
    return points;
  }
}
