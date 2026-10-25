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
import type { FishConfig } from '../config/wildlife';
import { WATER_LEVEL } from '../config/world';
import type { World } from '../world/World';
import { findWaterSpot } from './spawn';

interface Fish {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
  turnBias: number;
  scale: number;
}

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 鱼群只生成在水里，一个 InstancedMesh 承担全部鱼。 */
export class FishSchool {
  private readonly mesh: InstancedMesh;
  private readonly fish: Fish[] = [];
  private spawnTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    material: Material,
    private readonly config: FishConfig,
    private readonly geometry: BufferGeometry,
  ) {
    this.mesh = new InstancedMesh(geometry, material, config.maxCount);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  get count(): number {
    return this.fish.length;
  }

  getSightings(): Array<{ x: number; y: number; z: number }> {
    return this.fish.map((fish) => ({ x: fish.x, y: fish.y, z: fish.z }));
  }

  update(dt: number, playerX: number, playerZ: number): void {
    this.spawnTimer -= dt;

    for (let index = this.fish.length - 1; index >= 0; index--) {
      const fish = this.fish[index]!;
      const dx = fish.x - playerX;
      const dz = fish.z - playerZ;

      if (dx * dx + dz * dz > this.config.despawnRadius ** 2) {
        this.fish.splice(index, 1);
        continue;
      }

      fish.phase += dt;
      fish.heading +=
        (fish.turnBias + Math.sin(fish.phase * 0.8) * 0.35) * dt;

      const nextX = fish.x + Math.sin(fish.heading) * fish.speed * dt;
      const nextZ = fish.z + Math.cos(fish.heading) * fish.speed * dt;

      if (this.world.rawHeight(nextX, nextZ) > WATER_LEVEL - 0.35) {
        fish.heading += Math.PI * randomBetween(0.4, 1.1);
      } else {
        fish.x = nextX;
        fish.z = nextZ;
      }

      fish.y = WATER_LEVEL - 0.22 + Math.sin(fish.phase * 2.5) * 0.055;
    }

    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.config.spawnInterval;
      if (this.fish.length < this.config.maxCount) this.spawn(playerX, playerZ);
    }

    for (let index = 0; index < this.fish.length; index++) {
      this.writeFish(index, this.fish[index]!);
    }

    this.mesh.count = this.fish.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
  }

  private spawn(playerX: number, playerZ: number): void {
    const spot = findWaterSpot(
      this.world,
      playerX,
      playerZ,
      this.config.spawnRadiusMin,
      this.config.spawnRadiusMax,
    );
    if (!spot) return;

    this.fish.push({
      x: spot.x,
      y: spot.y,
      z: spot.z,
      heading: Math.random() * Math.PI * 2,
      speed: randomBetween(this.config.speedMin, this.config.speedMax),
      phase: Math.random() * Math.PI * 2,
      turnBias: randomBetween(-0.3, 0.3),
      scale: randomBetween(this.config.scaleMin, this.config.scaleMax),
    });
  }

  private writeFish(index: number, fish: Fish): void {
    position.set(fish.x, fish.y, fish.z);
    quaternion.setFromEuler(
      euler.set(0, fish.heading, Math.sin(fish.phase * 2) * 0.12),
    );
    scale.set(fish.scale, fish.scale, fish.scale);
    matrix.compose(position, quaternion, scale);
    this.mesh.setMatrixAt(index, matrix);
  }
}
