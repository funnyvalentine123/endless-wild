import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import type { BirdConfig } from '../config/wildlife';
import type { World } from '../world/World';
import type { BirdGeometries } from './models';
import { findAirSpot } from './spawn';

interface Bird {
  x: number;
  y: number;
  z: number;
  baseY: number;
  heading: number;
  speed: number;
  phase: number;
  flapPhase: number;
  turnBias: number;
  scale: number;
}

const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const yawQuaternion = new Quaternion();
const rollQuaternion = new Quaternion();
const rotation = new Quaternion();

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 12 只鸟只产生 body / leftWing / rightWing 三个 draw call。 */
export class BirdFlock {
  private readonly bodies: InstancedMesh;
  private readonly leftWings: InstancedMesh;
  private readonly rightWings: InstancedMesh;
  private readonly birds: Bird[] = [];
  private spawnTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    material: Material,
    private readonly config: BirdConfig,
    private readonly geometries: BirdGeometries,
  ) {
    this.bodies = this.createMesh(geometries.body, material);
    this.leftWings = this.createMesh(geometries.leftWing, material);
    this.rightWings = this.createMesh(geometries.rightWing, material);
  }

  get count(): number {
    return this.birds.length;
  }

  getSightings(): Array<{ x: number; y: number; z: number }> {
    return this.birds.map((bird) => ({ x: bird.x, y: bird.y, z: bird.z }));
  }

  update(dt: number, playerX: number, playerZ: number): void {
    this.spawnTimer -= dt;

    for (let index = this.birds.length - 1; index >= 0; index--) {
      const bird = this.birds[index]!;
      const dx = bird.x - playerX;
      const dz = bird.z - playerZ;

      if (dx * dx + dz * dz > this.config.despawnRadius ** 2) {
        this.birds.splice(index, 1);
        continue;
      }

      bird.phase += dt;
      bird.flapPhase += dt * 9;
      bird.heading += (bird.turnBias + Math.sin(bird.phase * 0.7) * 0.18) * dt;
      bird.x += Math.sin(bird.heading) * bird.speed * dt;
      bird.z += Math.cos(bird.heading) * bird.speed * dt;

      const ground = this.world.groundAt(bird.x, bird.z);
      bird.y =
        Math.max(bird.baseY, ground + 16) + Math.sin(bird.phase * 1.4) * 1.1;
    }

    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.config.spawnInterval;
      if (this.birds.length < this.config.maxCount) this.spawn(playerX, playerZ);
    }

    for (let index = 0; index < this.birds.length; index++) {
      this.writeBird(index, this.birds[index]!);
    }

    for (const mesh of [this.bodies, this.leftWings, this.rightWings]) {
      mesh.count = this.birds.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of [this.bodies, this.leftWings, this.rightWings]) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.geometries.body.dispose();
    this.geometries.leftWing.dispose();
    this.geometries.rightWing.dispose();
  }

  private createMesh(geometry: BirdGeometries['body'], material: Material): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, this.config.maxCount);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  private spawn(playerX: number, playerZ: number): void {
    const spot = findAirSpot(
      this.world,
      playerX,
      playerZ,
      this.config.spawnRadiusMin,
      this.config.spawnRadiusMax,
      this.config.altitudeMin,
      this.config.altitudeMax,
    );
    if (!spot) return;

    this.birds.push({
      x: spot.x,
      y: spot.y,
      z: spot.z,
      baseY: spot.y,
      heading: Math.random() * Math.PI * 2,
      speed: randomBetween(this.config.speedMin, this.config.speedMax),
      phase: Math.random() * Math.PI * 2,
      flapPhase: Math.random() * Math.PI * 2,
      turnBias: randomBetween(-0.32, 0.32),
      scale: randomBetween(this.config.scaleMin, this.config.scaleMax),
    });
  }

  private writeBird(index: number, bird: Bird): void {
    position.set(bird.x, bird.y, bird.z);
    scale.set(bird.scale, bird.scale, bird.scale);

    yawQuaternion.setFromAxisAngle(Y_AXIS, bird.heading);

    // 身体轻微侧倾。
    rollQuaternion.setFromAxisAngle(Z_AXIS, Math.sin(bird.phase * 0.9) * 0.08);
    rotation.copy(yawQuaternion).multiply(rollQuaternion);
    matrix.compose(position, rotation, scale);
    this.bodies.setMatrixAt(index, matrix);

    const flap = Math.sin(bird.flapPhase) * 0.7;

    rollQuaternion.setFromAxisAngle(Z_AXIS, flap);
    rotation.copy(yawQuaternion).multiply(rollQuaternion);
    matrix.compose(position, rotation, scale);
    this.rightWings.setMatrixAt(index, matrix);

    rollQuaternion.setFromAxisAngle(Z_AXIS, -flap);
    rotation.copy(yawQuaternion).multiply(rollQuaternion);
    matrix.compose(position, rotation, scale);
    this.leftWings.setMatrixAt(index, matrix);
  }
}
