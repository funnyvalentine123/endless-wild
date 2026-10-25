import type { Material, Scene } from 'three';
import type { HouseSite } from '../world/landmarks/Houses';
import type { ChunkView } from '../world/streaming/types';
import type { World } from '../world/World';
import { SmokeSystem, type SmokeEmitter } from './Smoke';
import { createVillagerGeometry } from './models';
import { Villagers } from './Villagers';

interface VillageHome {
  site: HouseSite;
  smoke?: SmokeEmitter;
}

/**
 * 房屋的动态附属物：
 * - 有烟囱的房子自动注册烟雾发射器；
 * - 每栋房子在门前生成 1~3 个村民，围绕门口活动；
 * - 房屋所在区块卸载时，对应的村民和烟囱一起移除。
 */
export class VillageManager {
  private readonly homes = new Map<string, VillageHome>();
  private readonly villagers: Villagers;
  private readonly smoke: SmokeSystem;

  constructor(scene: Scene, world: World, material: Material) {
    this.villagers = new Villagers(scene, world, material, createVillagerGeometry());
    this.smoke = new SmokeSystem(scene);
  }

  update(dt: number, chunks: ReadonlyMap<string, ChunkView>): void {
    this.sync(chunks);
    this.villagers.update(dt);
    this.smoke.update(dt);
  }

  getStats(): { houses: number; villagers: number; smokeEmitters: number } {
    return {
      houses: this.homes.size,
      villagers: this.villagers.count,
      smokeEmitters: this.smoke.emitterCount,
    };
  }

  dispose(): void {
    this.homes.clear();
    this.villagers.dispose();
    this.smoke.dispose();
  }

  private sync(chunks: ReadonlyMap<string, ChunkView>): void {
    for (const [key, chunk] of chunks) {
      const site = chunk.house;
      if (!site || this.homes.has(key)) continue;

      const home: VillageHome = { site };
      if (site.chimney) {
        home.smoke = this.smoke.addEmitter(
          site.chimney.x,
          site.chimney.y,
          site.chimney.z,
        );
      }

      this.homes.set(key, home);
      this.villagers.addHome(key, site);
    }

    for (const [key, home] of this.homes) {
      if (chunks.get(key)?.house) continue;

      if (home.smoke) this.smoke.removeEmitter(home.smoke);
      this.villagers.removeHome(key);
      this.homes.delete(key);
    }
  }
}
