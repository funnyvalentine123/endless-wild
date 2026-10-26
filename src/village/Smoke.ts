import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Scene,
} from 'three';

interface SmokePuff {
  age: number;
  life: number;
  offsetX: number;
  offsetZ: number;
  phase: number;
}

export interface SmokeEmitter {
  x: number;
  y: number;
  z: number;
  puffs: SmokePuff[];
}

const MAX_PUFFS = 320;
const PUFFS_PER_CHIMNEY = 8;

const VERTEX_SHADER = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (380.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float distanceToCenter = length(centered);
    float alpha = smoothstep(0.5, 0.05, distanceToCenter) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.8, 0.82, 0.85, alpha);
  }
`;

/**
 * 所有烟囱共用一个 Points 对象和一笔 draw call。
 * 每个烟囱维护少量烟雾粒子，上升、扩散、淡出后循环；
 * 粒子尺寸和透明度偏大，保证在远处和夜间也能看清。
 */
export class SmokeSystem {
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly positions = new Float32Array(MAX_PUFFS * 3);
  private readonly alphas = new Float32Array(MAX_PUFFS);
  private readonly sizes = new Float32Array(MAX_PUFFS);
  // 注意：Float32BufferAttribute 会复制传入数组；动态更新的烟雾必须直接持有原数组。
  private readonly positionAttribute = new BufferAttribute(this.positions, 3);
  private readonly alphaAttribute = new BufferAttribute(this.alphas, 1);
  private readonly sizeAttribute = new BufferAttribute(this.sizes, 1);
  private readonly emitters = new Set<SmokeEmitter>();

  constructor(private readonly scene: Scene) {
    this.positionAttribute.setUsage(DynamicDrawUsage);
    this.alphaAttribute.setUsage(DynamicDrawUsage);
    this.sizeAttribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aAlpha', this.alphaAttribute);
    this.geometry.setAttribute('aSize', this.sizeAttribute);
    this.geometry.setDrawRange(0, 0);

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  get emitterCount(): number {
    return this.emitters.size;
  }

  addEmitter(x: number, y: number, z: number): SmokeEmitter {
    const puffs: SmokePuff[] = [];
    for (let index = 0; index < PUFFS_PER_CHIMNEY; index++) {
      const life = 3.4 + Math.random() * 2.2;
      puffs.push({
        age: Math.random() * life,
        life,
        offsetX: (Math.random() - 0.5) * 0.8,
        offsetZ: (Math.random() - 0.5) * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const emitter = { x, y, z, puffs };
    this.emitters.add(emitter);
    return emitter;
  }

  removeEmitter(emitter: SmokeEmitter): void {
    this.emitters.delete(emitter);
  }

  update(dt: number): void {
    let count = 0;

    for (const emitter of this.emitters) {
      for (const puff of emitter.puffs) {
        if (count >= MAX_PUFFS) break;

        puff.age += dt;
        if (puff.age >= puff.life) {
          puff.age -= puff.life;
          puff.life = 3.4 + Math.random() * 2.2;
          puff.offsetX = (Math.random() - 0.5) * 0.8;
          puff.offsetZ = (Math.random() - 0.5) * 0.8;
          puff.phase = Math.random() * Math.PI * 2;
        }

        const t = puff.age / puff.life;
        const swirl = 0.35 + t * 1.5;
        this.positions[count * 3] =
          emitter.x + puff.offsetX + Math.sin(puff.phase + puff.age * 1.1) * swirl;
        this.positions[count * 3 + 1] = emitter.y + t * 6.5;
        this.positions[count * 3 + 2] =
          emitter.z + puff.offsetZ + Math.cos(puff.phase + puff.age * 0.9) * swirl;
        this.alphas[count] = Math.sin(t * Math.PI) * 0.6;
        this.sizes[count] = 1.5 + t * 3.0;
        count++;
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
