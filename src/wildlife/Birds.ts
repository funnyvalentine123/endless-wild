import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { WATER_LEVEL } from '../config/world';
import type { BirdConfig } from '../config/wildlife';
import { clamp, lerp, smoothstep } from '../math/scalar';
import type { World } from '../world/World';
import type { BirdGeometries } from './models';
import { findAirSpot } from './spawn';

/**
 * 鸟的四种状态：
 * - fly：正常巡航；
 * - landing：从巡航高度降到地面（同时收翅）；
 * - perched：落在地面上休息（地面时间 : 飞行时间 = 1 : 3）；
 * - takeoff：从地面升回巡航高度（同时展开翅膀）。
 */
type BirdMode = 'fly' | 'landing' | 'perched' | 'takeoff';

interface Bird {
  /** 调试 / 观测用的稳定编号。 */
  id: number;
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
  mode: BirdMode;
  /** 当前状态的剩余秒数。 */
  modeTimer: number;
  /** 本次落地的停留时长，由飞行时长按 groundToFlightRatio 换算。 */
  groundTime: number;
  /** 本轮已经飞了多久（只累计巡航飞行，不含起降过渡）。 */
  flightElapsed: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  /** 0 = 翅膀完全展开，1 = 收翅贴住身体。 */
  fold: number;
}

const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const yawQuaternion = new Quaternion();
const wingYQuaternion = new Quaternion();
const rollQuaternion = new Quaternion();
const rotation = new Quaternion();

/** 鸟身盒体半高，落地时身体中心抬高这么多才刚好站在地面上。 */
const BIRD_FOOT_OFFSET = 0.1;
/** 收翅时翼根绕 Y 轴向后折叠的角度。 */
const WING_FOLD_ANGLE = 1.25;
/** 飞行时的振翅幅度。 */
const WING_FLAP_AMPLITUDE = 0.7;
/** 落地等待时的最小地面高度（避免停在水面/浅滩上）。 */
const LANDING_MIN_HEIGHT = WATER_LEVEL + 0.4;

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
  private nextId = 1;

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

  getSightings(): Array<{ id: number; x: number; y: number; z: number; mode: BirdMode }> {
    return this.birds.map((bird) => ({
      id: bird.id,
      x: bird.x,
      y: bird.y,
      z: bird.z,
      mode: bird.mode,
    }));
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

      this.stepBird(bird, dt);
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

  private stepBird(bird: Bird, dt: number): void {
    switch (bird.mode) {
      case 'fly':
        this.stepFly(bird, dt);
        break;
      case 'landing':
        this.stepLanding(bird, dt);
        break;
      case 'perched':
        this.stepPerched(bird, dt);
        break;
      case 'takeoff':
        this.stepTakeoff(bird, dt);
        break;
    }
  }

  private stepFly(bird: Bird, dt: number): void {
    bird.phase += dt;
    bird.flightElapsed += dt;
    bird.flapPhase += dt * 9;
    bird.heading += (bird.turnBias + Math.sin(bird.phase * 0.7) * 0.18) * dt;
    bird.x += Math.sin(bird.heading) * bird.speed * dt;
    bird.z += Math.cos(bird.heading) * bird.speed * dt;

    const ground = this.world.groundAt(bird.x, bird.z);
    bird.y = Math.max(bird.baseY, ground + 16) + Math.sin(bird.phase * 1.4) * 1.1;
    bird.fold = Math.max(0, bird.fold - dt * 3);

    bird.modeTimer -= dt;
    if (bird.modeTimer <= 0) this.beginLanding(bird);
  }

  /** 选择一块可落脚的地面并开始下降；找不到就再多飞一会儿。 */
  private beginLanding(bird: Bird): void {
    const spot = this.findLandingSpot(bird);
    if (!spot) {
      bird.modeTimer = randomBetween(2, 4);
      return;
    }

    bird.mode = 'landing';
    bird.modeTimer = this.config.landingDuration;
    // 地面停留按“这一轮实际飞了多久”折算，保证地面 : 飞行 = 1 : 3。
    bird.groundTime = bird.flightElapsed * this.config.groundToFlightRatio;
    bird.fromX = bird.x;
    bird.fromY = bird.y;
    bird.fromZ = bird.z;
    bird.toX = spot.x;
    bird.toY = spot.y + BIRD_FOOT_OFFSET * bird.scale;
    bird.toZ = spot.z;
  }

  private findLandingSpot(bird: Bird): { x: number; y: number; z: number } | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = bird.heading + randomBetween(-0.8, 0.8);
      const distance = randomBetween(6, 24);
      const x = bird.x + Math.sin(angle) * distance;
      const z = bird.z + Math.cos(angle) * distance;
      const y = this.world.groundAt(x, z);
      if (y >= LANDING_MIN_HEIGHT) return { x, y, z };
    }
    return null;
  }

  private stepLanding(bird: Bird, dt: number): void {
    bird.phase += dt;
    bird.flapPhase += dt * 9;
    bird.modeTimer -= dt;

    const total = Math.max(this.config.landingDuration, 1e-3);
    const t = smoothstep(0, 1, clamp(1 - bird.modeTimer / total, 0, 1));
    bird.x = lerp(bird.fromX, bird.toX, t);
    bird.y = lerp(bird.fromY, bird.toY, t);
    bird.z = lerp(bird.fromZ, bird.toZ, t);
    bird.fold = Math.min(1, bird.fold + dt / total);

    if (bird.modeTimer > 0) return;
    bird.x = bird.toX;
    bird.y = bird.toY;
    bird.z = bird.toZ;
    bird.fold = 1;
    bird.mode = 'perched';
    bird.modeTimer = bird.groundTime;
  }

  private stepPerched(bird: Bird, dt: number): void {
    bird.phase += dt;
    bird.flapPhase += dt * 1.4;
    bird.modeTimer -= dt;

    const ground = this.world.groundAt(bird.x, bird.z);
    // 水位上涨把落脚点淹了，或者停留结束，就立刻起飞。
    if (ground < LANDING_MIN_HEIGHT || bird.modeTimer <= 0) {
      this.beginTakeoff(bird);
      return;
    }

    bird.y = ground + BIRD_FOOT_OFFSET * bird.scale + Math.sin(bird.phase * 0.6) * 0.02;
    bird.heading += Math.sin(bird.phase * 0.5) * 0.25 * dt;
    bird.fold = 1;
  }

  private beginTakeoff(bird: Bird): void {
    bird.mode = 'takeoff';
    bird.modeTimer = this.config.takeoffDuration;
    bird.fromX = bird.x;
    bird.fromY = bird.y;
    bird.fromZ = bird.z;
  }

  private stepTakeoff(bird: Bird, dt: number): void {
    bird.phase += dt;
    bird.flapPhase += dt * 9;
    bird.modeTimer -= dt;

    const total = Math.max(this.config.takeoffDuration, 1e-3);
    const t = smoothstep(0, 1, clamp(1 - bird.modeTimer / total, 0, 1));
    const ground = this.world.groundAt(bird.x, bird.z);
    const cruise = Math.max(bird.baseY, ground + 16);

    bird.x += Math.sin(bird.heading) * bird.speed * t * dt;
    bird.z += Math.cos(bird.heading) * bird.speed * t * dt;
    bird.y = lerp(bird.fromY, cruise, t);
    bird.fold = Math.max(0, 1 - t * 1.6);

    if (bird.modeTimer > 0) return;
    bird.mode = 'fly';
    bird.modeTimer = randomBetween(this.config.flightMin, this.config.flightMax);
    bird.groundTime = bird.modeTimer * this.config.groundToFlightRatio;
    bird.flightElapsed = 0;
    bird.y = cruise;
    bird.fold = 0;
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

    const flightTime = randomBetween(this.config.flightMin, this.config.flightMax);

    this.birds.push({
      id: this.nextId++,
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
      mode: 'fly',
      // 首轮飞行时长随机：让 12 只鸟错开落地，而不是同时落下。
      modeTimer: randomBetween(1.5, flightTime),
      groundTime: flightTime * this.config.groundToFlightRatio,
      flightElapsed: 0,
      fromX: spot.x,
      fromY: spot.y,
      fromZ: spot.z,
      toX: spot.x,
      toY: spot.y,
      toZ: spot.z,
      fold: 0,
    });
  }

  private writeBird(index: number, bird: Bird): void {
    position.set(bird.x, bird.y, bird.z);
    scale.set(bird.scale, bird.scale, bird.scale);

    yawQuaternion.setFromAxisAngle(Y_AXIS, bird.heading);

    // 身体轻微侧倾；落地时收翅后不再摇晃。
    rollQuaternion.setFromAxisAngle(Z_AXIS, Math.sin(bird.phase * 0.9) * 0.08 * (1 - bird.fold));
    rotation.copy(yawQuaternion).multiply(rollQuaternion);
    matrix.compose(position, rotation, scale);
    this.bodies.setMatrixAt(index, matrix);

    // 收翅时翼根绕 Y 轴转到贴近身体，同时振翅幅度衰减。
    const foldAngle = WING_FOLD_ANGLE * bird.fold;
    const flap = Math.sin(bird.flapPhase) * WING_FLAP_AMPLITUDE * (1 - bird.fold * 0.85);

    wingYQuaternion.setFromAxisAngle(Y_AXIS, foldAngle);
    rollQuaternion.setFromAxisAngle(Z_AXIS, flap);
    rotation.copy(yawQuaternion).multiply(wingYQuaternion).multiply(rollQuaternion);
    matrix.compose(position, rotation, scale);
    this.rightWings.setMatrixAt(index, matrix);

    wingYQuaternion.setFromAxisAngle(Y_AXIS, -foldAngle);
    rollQuaternion.setFromAxisAngle(Z_AXIS, -flap);
    rotation.copy(yawQuaternion).multiply(wingYQuaternion).multiply(rollQuaternion);
    matrix.compose(position, rotation, scale);
    this.leftWings.setMatrixAt(index, matrix);
  }
}
