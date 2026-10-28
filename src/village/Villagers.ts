import {
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { WATER_LEVEL } from '../config/world';
import { angularDifference } from '../math/angle';
import type { HouseSite } from '../world/landmarks/Houses';
import type { World } from '../world/World';

interface Villager {
  homeId: string;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeZ: number;
  houseX: number;
  houseZ: number;
  houseRadius: number;
  heading: number;
  targetHeading: number;
  targetX: number;
  targetZ: number;
  mode: 'idle' | 'move';
  timer: number;
  phase: number;
  scale: number;
}

interface VillagerPool {
  mesh: InstancedMesh;
  villagers: Villager[];
}

const MAX_VILLAGERS_PER_POOL = 48;
const WANDER_RADIUS = 5.5;
const MAX_HOME_DISTANCE = 9;
const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * 村民按建筑类型分成两个 InstancedMesh：普通房屋村民与沙漠帐篷村民（阿拉伯装扮）。
 * 每栋建筑固定 1~3 人，围绕门口活动；区块卸载时按 homeId 移除。
 */
export class Villagers {
  private readonly pools: VillagerPool[];

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    material: Material,
    countryGeometry: BufferGeometry,
    desertGeometry: BufferGeometry,
  ) {
    this.pools = [
      this.createPool(material, countryGeometry),
      this.createPool(material, desertGeometry),
    ];
  }

  get count(): number {
    return this.pools[0]!.villagers.length + this.pools[1]!.villagers.length;
  }

  addHome(id: string, site: HouseSite): void {
    const pool = this.pools[site.tent ? 1 : 0]!;
    const villagers = pool.villagers;

    for (let index = 0; index < site.style.villagerCount; index++) {
      if (villagers.length >= MAX_VILLAGERS_PER_POOL) return;

      let x = site.doorX;
      let z = site.doorZ;
      for (let attempt = 0; attempt < 10; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = randomBetween(1.5, 4.5);
        const candidateX = site.doorX + Math.cos(angle) * radius;
        const candidateZ = site.doorZ + Math.sin(angle) * radius;
        if (
          Math.hypot(candidateX - site.x, candidateZ - site.z) < site.houseRadius + 1 ||
          this.world.groundAt(candidateX, candidateZ) < WATER_LEVEL + 0.5
        ) {
          continue;
        }
        x = candidateX;
        z = candidateZ;
        break;
      }

      const heading = Math.random() * Math.PI * 2;
      villagers.push({
        homeId: id,
        x,
        y: this.world.groundAt(x, z),
        z,
        homeX: site.doorX,
        homeZ: site.doorZ,
        houseX: site.x,
        houseZ: site.z,
        houseRadius: site.houseRadius,
        heading,
        targetHeading: heading,
        targetX: x,
        targetZ: z,
        mode: 'idle',
        timer: randomBetween(1.5, 4.5),
        phase: Math.random() * Math.PI * 2,
        scale: randomBetween(0.92, 1.06),
      });
    }
  }

  removeHome(id: string): void {
    for (const pool of this.pools) {
      for (let index = pool.villagers.length - 1; index >= 0; index--) {
        if (pool.villagers[index]!.homeId === id) pool.villagers.splice(index, 1);
      }
    }
  }

  update(dt: number): void {
    for (const pool of this.pools) {
      const villagers = pool.villagers;

      for (let index = 0; index < villagers.length; index++) {
        const villager = villagers[index]!;

        if (
          Math.hypot(villager.x - villager.homeX, villager.z - villager.homeZ) >
          MAX_HOME_DISTANCE
        ) {
          this.setTarget(villager, villager.homeX, villager.homeZ);
        }

        villager.timer -= dt;

        if (villager.mode === 'idle' && villager.timer <= 0) {
          this.chooseTarget(villager);
        } else if (villager.mode === 'move') {
          const distanceToTarget = Math.hypot(
            villager.targetX - villager.x,
            villager.targetZ - villager.z,
          );
          if (villager.timer <= 0 || distanceToTarget < 0.6) {
            villager.mode = 'idle';
            villager.timer = randomBetween(2, 6);
          }
        }

        if (villager.mode === 'move') {
          const dx = villager.targetX - villager.x;
          const dz = villager.targetZ - villager.z;
          const desiredHeading = Math.atan2(dx, dz);
          villager.heading +=
            angularDifference(villager.heading, desiredHeading) * Math.min(1, dt * 3.2);

          const nextX = villager.x + Math.sin(villager.heading) * 1.1 * dt;
          const nextZ = villager.z + Math.cos(villager.heading) * 1.1 * dt;
          const nextY = this.world.groundAt(nextX, nextZ);
          const insideHouse =
            Math.hypot(nextX - villager.houseX, nextZ - villager.houseZ) <
            villager.houseRadius + 0.7;

          if (nextY < WATER_LEVEL + 0.45 || insideHouse) {
            this.chooseTarget(villager);
          } else {
            villager.x = nextX;
            villager.z = nextZ;
            villager.y = nextY;
          }
        } else {
          villager.y = this.world.groundAt(villager.x, villager.z);
        }

        villager.phase += dt * (villager.mode === 'move' ? 7 : 2);
        this.writeMatrix(pool.mesh, villager, index);
      }

      pool.mesh.count = villagers.length;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const pool of this.pools) {
      this.scene.remove(pool.mesh);
      pool.mesh.dispose();
      pool.mesh.geometry.dispose();
    }
  }

  private createPool(material: Material, geometry: BufferGeometry): VillagerPool {
    const mesh = new InstancedMesh(geometry, material, MAX_VILLAGERS_PER_POOL);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return { mesh, villagers: [] };
  }

  private chooseTarget(villager: Villager): void {
    let targetX = villager.homeX;
    let targetZ = villager.homeZ;

    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(0.8, WANDER_RADIUS);
      const candidateX = villager.homeX + Math.cos(angle) * radius;
      const candidateZ = villager.homeZ + Math.sin(angle) * radius;

      if (
        Math.hypot(candidateX - villager.houseX, candidateZ - villager.houseZ) <
        villager.houseRadius + 0.8
      ) {
        continue;
      }
      if (this.world.groundAt(candidateX, candidateZ) < WATER_LEVEL + 0.5) continue;

      targetX = candidateX;
      targetZ = candidateZ;
      break;
    }

    this.setTarget(villager, targetX, targetZ);
    villager.timer = randomBetween(2.5, 6);
  }

  private setTarget(villager: Villager, x: number, z: number): void {
    villager.targetX = x;
    villager.targetZ = z;
    villager.targetHeading = Math.atan2(x - villager.x, z - villager.z);
    villager.mode = 'move';
  }

  private writeMatrix(mesh: InstancedMesh, villager: Villager, index: number): void {
    const bob = villager.mode === 'move' ? Math.sin(villager.phase) * 0.025 : 0;
    position.set(villager.x, villager.y + bob, villager.z);
    quaternion.setFromEuler(euler.set(0, villager.heading, 0));
    scale.set(villager.scale, villager.scale, villager.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
}
