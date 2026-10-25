import { MeshLambertMaterial, type CanvasTexture } from 'three';
import { createRoadTexture } from '../render/textures/roadTexture';

/** 世界共享材质。生命周期与 Game 一致，不能按区块释放。 */
export class WorldMaterials {
  readonly terrain: MeshLambertMaterial;
  readonly vegetation: MeshLambertMaterial;
  readonly road: MeshLambertMaterial;
  readonly lamp: MeshLambertMaterial;

  private readonly roadTexture: CanvasTexture;

  constructor() {
    this.terrain = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.vegetation = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

    this.roadTexture = createRoadTexture();
    this.road = new MeshLambertMaterial({ map: this.roadTexture, vertexColors: true });

    this.lamp = new MeshLambertMaterial({
      color: 0xfff1c0,
      emissive: 0xffc860,
      emissiveIntensity: 0,
    });
  }

  /** 夜间路灯亮度由昼夜系统推导，再写回共享材质。 */
  setLampIntensity(intensity: number): void {
    this.lamp.emissiveIntensity = intensity;
  }

  dispose(): void {
    this.terrain.dispose();
    this.vegetation.dispose();
    this.road.dispose();
    this.lamp.dispose();
    this.roadTexture.dispose();
  }
}
