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
import type { GroundSpeciesConfig } from '../config/wildlife';
import { WATER_LEVEL } from '../config/world';
import { angularDifference } from '../math/angle';
import type { World } from '../world/World';
import { findLandSpot } from './spawn';

type AnimalMode = 'idle' | 'move' | 'flee';

interface GroundAnimal {
  x: number;
  y: number;
  z: number;
  heading: number;
  targetHeading: number;
  mode: AnimalMode;
  timer: number;
  phase: number;
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

/** 按物种参数驱动的地面动物群；所有个体共用一个 InstancedMesh。 */
export class GroundAnimalGroup {
  private readonly mesh: InstancedMesh;
  private readonly animals: GroundAnimal[] = [];
  private spawnTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    material: Material,
    private readonly config: GroundSpeciesConfig,
    private readonly geometry: BufferGeometry,
  ) {
    this.mesh = new InstancedMesh(geometry, material, config.maxCount);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  get count(): number {
    return this.animals.length;
  }

  getSightings(): Array<{ x: number; y: number; z: number }> {
    return this.animals.map((animal) => ({ x: animal.x, y: animal.y, z: animal.z }));
  }

  update(dt: number, playerX: number, playerZ: number): void {
    this.spawnTimer -= dt;

    for (let index = this.animals.length - 1; index >= 0; index--) {
      const animal = this.animals[index]!;
      const dx = animal.x - playerX;
      const dz = animal.z - playerZ;

      if (dx * dx + dz * dz > this.config.despawnRadius ** 2) {
        this.animals.splice(index, 1);
        continue;
      }

      this.updateAnimal(animal, dt, playerX, playerZ);
    }

    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.config.spawnInterval;
      if (this.animals.length < this.config.maxCount) this.spawn(playerX, playerZ);
    }

    for (let index = 0; index < this.animals.length; index++) {
      this.writeMatrix(this.animals[index]!, index);
    }

    this.mesh.count = this.animals.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
  }

  private spawn(playerX: number, playerZ: number): void {
    const spot = findLandSpot(this.world, playerX, playerZ, {
      minDistance: this.config.spawnRadiusMin,
      maxDistance: this.config.spawnRadiusMax,
      maxSlope: this.config.maxSlope,
      maxForest: this.config.maxForest,
      minDesert: this.config.minDesert,
      maxDesert: this.config.maxDesert,
    });
    if (!spot) return;

    const heading = Math.random() * Math.PI * 2;
    this.animals.push({
      x: spot.x,
      y: spot.y,
      z: spot.z,
      heading,
      targetHeading: heading,
      mode: 'idle',
      timer: randomBetween(this.config.idleMin, this.config.idleMax),
      phase: Math.random() * Math.PI * 2,
      scale: randomBetween(this.config.scaleMin, this.config.scaleMax),
    });
  }

  private updateAnimal(
    animal: GroundAnimal,
    dt: number,
    playerX: number,
    playerZ: number,
  ): void {
    const config = this.config;
    const dx = animal.x - playerX;
    const dz = animal.z - playerZ;
    const distance = Math.hypot(dx, dz);

    if (config.fleeRadius > 0 && distance < config.fleeRadius && animal.mode !== 'flee') {
      animal.mode = 'flee';
      animal.timer = randomBetween(1.4, 2.8);
      animal.targetHeading = Math.atan2(dx, dz);
    }

    animal.timer -= dt;

    if (animal.mode === 'idle') {
      if (animal.timer <= 0) {
        animal.mode = 'move';
        animal.timer = randomBetween(config.moveMin, config.moveMax);
        animal.targetHeading = Math.random() * Math.PI * 2;
      }
    } else if (animal.timer <= 0) {
      const wasFleeing = animal.mode === 'flee';
      animal.mode = 'idle';
      animal.timer =
        (wasFleeing ? 0.5 : 1) * randomBetween(config.idleMin, config.idleMax);
    }

    if (animal.mode !== 'idle') {
      animal.heading +=
        angularDifference(animal.heading, animal.targetHeading) *
        Math.min(1, dt * config.turnRate);

      const speed = animal.mode === 'flee' ? config.fleeSpeed : config.walkSpeed;
      const nextX = animal.x + Math.sin(animal.heading) * speed * dt;
      const nextZ = animal.z + Math.cos(animal.heading) * speed * dt;
      const nextY = this.world.groundAt(nextX, nextZ);

      // 动物不会离开自己的生境：普通动物不进沙漠深处，沙漠动物也不进绿洲/森林。
      const nextDesert = this.world.habitatDesertAt(nextX, nextZ);
      const outsideHabitat =
        (config.minDesert !== undefined && nextDesert < config.minDesert) ||
        (config.maxDesert !== undefined && nextDesert > config.maxDesert);

      if (nextY < WATER_LEVEL + 0.35 || outsideHabitat) {
        animal.targetHeading += Math.PI * randomBetween(0.6, 1.4);
        animal.timer = Math.min(animal.timer, 0.35);
      } else {
        animal.x = nextX;
        animal.z = nextZ;
        animal.y = nextY;
      }
    } else {
      animal.y = this.world.groundAt(animal.x, animal.z);
    }

    const moving = animal.mode !== 'idle';
    animal.phase += dt * (moving ? config.hopFrequency : 1.5);
  }

  private writeMatrix(animal: GroundAnimal, index: number): void {
    const config = this.config;
    const moving = animal.mode !== 'idle';
    const hop =
      moving && config.hopHeight > 0
        ? Math.abs(Math.sin(animal.phase)) * config.hopHeight
        : 0;
    const bob =
      moving && config.hopHeight === 0 ? Math.sin(animal.phase * 2) * 0.025 : 0;
    const sway = config.sway > 0 ? Math.sin(animal.phase * 2) * config.sway : 0;
    const roll = config.sway > 0 ? Math.sin(animal.phase * 1.7) * 0.12 : 0;

    position.set(animal.x, animal.y + hop + bob, animal.z);
    quaternion.setFromEuler(euler.set(0, animal.heading + sway, roll));
    scale.set(animal.scale, animal.scale, animal.scale);

    matrix.compose(position, quaternion, scale);
    this.mesh.setMatrixAt(index, matrix);
  }
}
