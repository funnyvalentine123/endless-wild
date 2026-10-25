import {
  Mesh,
  MeshPhongMaterial,
  PlaneGeometry,
  type IUniform,
  type Scene,
} from 'three';
import { WATER_SEGMENTS, WATER_SIZE, WATER_SNAP } from '../../config/render';
import { WATER_LEVEL } from '../../config/world';

const BASE_COLOR = 0x2f86b8;

/** 覆盖玩家周围的大水面，顶点着色器里叠加低频波浪。 */
export class Water {
  private readonly material: MeshPhongMaterial;
  private readonly mesh: Mesh<PlaneGeometry, MeshPhongMaterial>;
  private readonly timeUniform: IUniform<number> = { value: 0 };
  private brightnessValue = 1;
  private weatherDimValue = 1;

  constructor(private readonly scene: Scene) {
    this.material = new MeshPhongMaterial({
      color: BASE_COLOR,
      specular: 0x88aabb,
      shininess: 60,
      transparent: true,
      opacity: 0.82,
      flatShading: true,
    });

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 wp = modelMatrix * vec4(position, 1.0);
           transformed.z += sin(wp.x * 0.35 + uTime * 1.3) * 0.12 + cos(wp.z * 0.28 + uTime * 1.1) * 0.12;`,
        );
    };

    this.mesh = new Mesh(new PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WATER_LEVEL;
    scene.add(this.mesh);
  }

  update(elapsed: number, playerX: number, playerZ: number): void {
    this.timeUniform.value = elapsed;
    this.mesh.position.x = Math.round(playerX / WATER_SNAP) * WATER_SNAP;
    this.mesh.position.z = Math.round(playerZ / WATER_SNAP) * WATER_SNAP;
  }

  setBrightness(brightness: number): void {
    this.brightnessValue = brightness;
    this.applyColor();
  }

  /** 雨天水位上涨；晴天由天气系统逐帧插值回落到基础水位。 */
  setLevelOffset(offset: number): void {
    this.mesh.position.y = WATER_LEVEL + offset;
  }

  /** 阴雨天水面同步变暗，避免比天空还亮。 */
  setWeatherDim(dim: number): void {
    this.weatherDimValue = dim;
    this.applyColor();
  }

  private applyColor(): void {
    this.material.color
      .setHex(BASE_COLOR)
      .multiplyScalar(this.brightnessValue * this.weatherDimValue);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
