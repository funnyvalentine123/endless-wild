import { MeshLambertMaterial, type CanvasTexture } from 'three';
import { createRoadTexture } from '../render/textures/roadTexture';

/** 世界共享材质。生命周期与 Game 一致，不能按区块释放。 */
export class WorldMaterials {
  readonly terrain: MeshLambertMaterial;
  readonly vegetation: MeshLambertMaterial;
  readonly road: MeshLambertMaterial;
  readonly window: MeshLambertMaterial;
  readonly lamp: MeshLambertMaterial;

  private readonly roadTexture: CanvasTexture;
  private readonly snowCoverage = { value: 0 };

  constructor() {
    this.terrain = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.vegetation = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

    this.roadTexture = createRoadTexture();
    this.road = new MeshLambertMaterial({ map: this.roadTexture, vertexColors: true });

    this.window = new MeshLambertMaterial({
      color: 0x9bc8d6,
      emissive: 0xffc46a,
      emissiveIntensity: 0,
    });

    this.lamp = new MeshLambertMaterial({
      color: 0xfff1c0,
      emissive: 0xffc860,
      emissiveIntensity: 0,
    });

    // 共享材质 + 一个全局 uniform：不重建区块几何，也能让地面、屋顶、树冠逐渐变白。
    this.applySnow(this.terrain, 1);
    this.applySnow(this.vegetation, 0.9);
    this.applySnow(this.road, 0.8);
  }

  /** 0–1 的积雪覆盖；晴天由天气系统缓慢降回 0。 */
  setSnowCoverage(amount: number): void {
    this.snowCoverage.value = Math.min(1, Math.max(0, amount));
  }

  /** 夜间窗户亮度由昼夜系统推导，再写回共享材质。 */
  setWindowIntensity(intensity: number): void {
    this.window.emissiveIntensity = intensity * 0.8;
  }

  /** 夜间路灯灯头亮度，与窗户一样由昼夜系统驱动。 */
  setLampIntensity(intensity: number): void {
    this.lamp.emissiveIntensity = intensity;
  }

  private applySnow(material: MeshLambertMaterial, strength: number): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSnowCoverage = this.snowCoverage;
      shader.fragmentShader =
        'uniform float uSnowCoverage;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float snowMask = 0.22 + 0.78 * smoothstep(0.3, 0.78, normal.y);
           diffuseColor.rgb = mix(
             diffuseColor.rgb,
             vec3(0.93, 0.96, 1.0),
             clamp(uSnowCoverage * ${strength.toFixed(2)} * snowMask, 0.0, 0.95)
           );`,
        );
    };
    material.customProgramCacheKey = () => `snow-${strength}`;
  }

  dispose(): void {
    this.terrain.dispose();
    this.vegetation.dispose();
    this.road.dispose();
    this.window.dispose();
    this.lamp.dispose();
    this.roadTexture.dispose();
  }
}
