import { Fog, type Scene, type Vector3 } from 'three';
import type { DaylightSnapshot } from './Daylight';
import { Clouds } from './Clouds';
import { Lighting } from './Lighting';
import { SkyDome } from './SkyDome';
import { Stars } from './Stars';
import { Water } from './Water';

/**
 * 场景级环境组合：光照、天空、星空、水、云。
 * 把“时间系统算出的快照”应用到具体对象，并负责它们随玩家/相机的更新。
 */
export class SceneEnvironment {
  private readonly lighting: Lighting;
  private readonly sky: SkyDome;
  private readonly stars: Stars;
  private readonly water: Water;
  private readonly clouds: Clouds;

  constructor(private readonly scene: Scene) {
    this.lighting = new Lighting(scene);
    this.sky = new SkyDome(scene);
    this.stars = new Stars(scene);
    this.water = new Water(scene);
    this.clouds = new Clouds(scene);
  }

  applyDaylight(daylight: DaylightSnapshot, x: number, y: number, z: number): void {
    this.lighting.apply(daylight, x, y, z);
    this.sky.apply(daylight);
    this.stars.setOpacity(daylight.starOpacity);
    this.water.setBrightness(daylight.waterBrightness);
    this.clouds.setEmissive(daylight.cloudEmissive);

    if (this.scene.fog instanceof Fog) this.scene.fog.color.copy(daylight.fogColor);
  }

  update(
    dt: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    cameraPosition: Vector3,
  ): void {
    this.sky.follow(cameraPosition);
    this.stars.follow(cameraPosition);
    this.water.update(elapsed, playerX, playerZ);
    this.clouds.update(dt, playerX, playerZ);
  }

  dispose(): void {
    this.clouds.dispose();
    this.water.dispose();
    this.stars.dispose();
    this.sky.dispose();
    this.lighting.dispose();
  }
}
