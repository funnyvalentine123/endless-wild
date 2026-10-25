import type { Material, Scene } from 'three';
import {
  BIRD_CONFIG,
  COW_CONFIG,
  DEER_CONFIG,
  FISH_CONFIG,
  RABBIT_CONFIG,
  SNAKE_CONFIG,
} from '../config/wildlife';
import type { World } from '../world/World';
import { BirdFlock } from './Birds';
import { FishSchool } from './Fish';
import { GroundAnimalGroup } from './GroundAnimals';
import {
  createBirdGeometries,
  createCowGeometry,
  createDeerGeometry,
  createFishGeometry,
  createRabbitGeometry,
  createSnakeGeometry,
} from './models';

interface WildlifeGroup {
  readonly label: string;
  readonly count: number;
  update(dt: number, playerX: number, playerZ: number): void;
  getSightings(): Array<{ x: number; y: number; z: number }>;
  dispose(): void;
}

/**
 * 动态生物总入口。
 *
 * 设计优先级是性能：
 * - 每种地面动物 / 鱼群只占一个 InstancedMesh；
 * - 鸟群占 body + 两翼三个 InstancedMesh；
 * - 动物只在玩家周围生成，离开一定距离直接销毁，回来时重新随机生成。
 */
export class WildlifeManager {
  private readonly groups: WildlifeGroup[];

  constructor(scene: Scene, world: World, material: Material) {
    const groups: WildlifeGroup[] = [];

    const birds = new BirdFlock(scene, world, material, BIRD_CONFIG, createBirdGeometries());
    groups.push({
      label: 'birds',
      get count() {
        return birds.count;
      },
      update: (dt, x, z) => birds.update(dt, x, z),
      getSightings: () => birds.getSightings(),
      dispose: () => birds.dispose(),
    });

    const fish = new FishSchool(scene, world, material, FISH_CONFIG, createFishGeometry());
    groups.push({
      label: 'fish',
      get count() {
        return fish.count;
      },
      update: (dt, x, z) => fish.update(dt, x, z),
      getSightings: () => fish.getSightings(),
      dispose: () => fish.dispose(),
    });

    const rabbits = new GroundAnimalGroup(
      scene,
      world,
      material,
      RABBIT_CONFIG,
      createRabbitGeometry(),
    );
    groups.push({
      label: 'rabbits',
      get count() {
        return rabbits.count;
      },
      update: (dt, x, z) => rabbits.update(dt, x, z),
      getSightings: () => rabbits.getSightings(),
      dispose: () => rabbits.dispose(),
    });

    const snakes = new GroundAnimalGroup(
      scene,
      world,
      material,
      SNAKE_CONFIG,
      createSnakeGeometry(),
    );
    groups.push({
      label: 'snakes',
      get count() {
        return snakes.count;
      },
      update: (dt, x, z) => snakes.update(dt, x, z),
      getSightings: () => snakes.getSightings(),
      dispose: () => snakes.dispose(),
    });

    const cows = new GroundAnimalGroup(
      scene,
      world,
      material,
      COW_CONFIG,
      createCowGeometry(),
    );
    groups.push({
      label: 'cows',
      get count() {
        return cows.count;
      },
      update: (dt, x, z) => cows.update(dt, x, z),
      getSightings: () => cows.getSightings(),
      dispose: () => cows.dispose(),
    });

    const deer = new GroundAnimalGroup(
      scene,
      world,
      material,
      DEER_CONFIG,
      createDeerGeometry(),
    );
    groups.push({
      label: 'deer',
      get count() {
        return deer.count;
      },
      update: (dt, x, z) => deer.update(dt, x, z),
      getSightings: () => deer.getSightings(),
      dispose: () => deer.dispose(),
    });

    this.groups = groups;
  }

  update(dt: number, playerX: number, playerZ: number): void {
    for (const group of this.groups) group.update(dt, playerX, playerZ);
  }

  getPopulation(): Record<string, number> {
    const population: Record<string, number> = {};
    for (const group of this.groups) population[group.label] = group.count;
    return population;
  }

  getSightings(): Array<{ kind: string; x: number; y: number; z: number }> {
    return this.groups.flatMap((group) =>
      group.getSightings().map((spot) => ({ kind: group.label, ...spot })),
    );
  }

  dispose(): void {
    for (const group of this.groups) group.dispose();
  }
}
