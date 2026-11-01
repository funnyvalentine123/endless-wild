import { InstancedMesh, Mesh, type Scene } from 'three';
import {
  CHUNK_DETAIL_RADIUS,
  CHUNK_RADIUS,
  CHUNK_SIZE,
  CHUNK_STREAM_MS,
  CHUNK_UNLOAD_MARGIN,
  ROAD_SEGMENT_LENGTH,
} from '../../config/world';
import { PLAYER_RADIUS } from '../../config/player';
import type { ChunkMeshBuilder } from './ChunkMeshBuilder';
import type { RoadMeshBuilder } from './RoadMeshBuilder';
import type { ChunkView, RoadView } from './types';

/**
 * 世界流式管理器：只维护玩家周围的一圈区块和道路段。
 * 每帧限制构建预算，避免一次生成过多网格导致长时间卡顿。
 */
export class WorldStreamer {
  private readonly chunkMap = new Map<string, ChunkView>();
  private readonly roadMap = new Map<number, RoadView>();
  /** 地形已就绪、等待补植被与房屋的区块。 */
  private pendingDecoration: ChunkView[] = [];
  /** 上一帧是否在补内容：与建造地形交替进行，保证单个区块的工作被拆到两帧。 */
  private decoratedLastFrame = false;

  /** 构建统计：用于定位“远处生成区块时掉帧”。 */
  private buildCount = 0;
  private lastBuildMs = 0;
  private maxBuildMs = 0;
  private frameBuildMs = 0;
  private lastFrameBuilds = 0;
  private terrainBuilds = 0;
  private terrainBuildMs = 0;
  private detailBuilds = 0;
  private detailBuildMs = 0;
  private decorateBuilds = 0;
  private decorateBuildMs = 0;
  private lastDecorateMs = 0;

  constructor(
    private readonly scene: Scene,
    private readonly chunkBuilder: ChunkMeshBuilder,
    private readonly roadBuilder: RoadMeshBuilder,
  ) {}

  get chunks(): ReadonlyMap<string, ChunkView> {
    return this.chunkMap;
  }

  get roads(): ReadonlyMap<number, RoadView> {
    return this.roadMap;
  }

  /** 调试：本帧区块构建耗时与累计统计。 */
  stats(): {
    chunks: number;
    roads: number;
    builds: number;
    lastBuildMs: number;
    maxBuildMs: number;
    frameBuildMs: number;
    lastFrameBuilds: number;
    avgTerrainMs: number;
    avgDetailMs: number;
    avgDecorateMs: number;
    lastDecorateMs: number;
    pendingDecoration: number;
  } {
    return {
      chunks: this.chunkMap.size,
      roads: this.roadMap.size,
      builds: this.buildCount,
      lastBuildMs: Number(this.lastBuildMs.toFixed(2)),
      maxBuildMs: Number(this.maxBuildMs.toFixed(2)),
      frameBuildMs: Number(this.frameBuildMs.toFixed(2)),
      lastFrameBuilds: this.lastFrameBuilds,
      avgTerrainMs: Number((this.terrainBuildMs / Math.max(1, this.terrainBuilds)).toFixed(2)),
      avgDetailMs: Number((this.detailBuildMs / Math.max(1, this.detailBuilds)).toFixed(2)),
      avgDecorateMs: Number((this.decorateBuildMs / Math.max(1, this.decorateBuilds)).toFixed(2)),
      lastDecorateMs: Number(this.lastDecorateMs.toFixed(2)),
      pendingDecoration: this.pendingDecoration.length,
    };
  }

  update(
    playerX: number,
    playerZ: number,
    yaw: number,
    budget: number,
    budgetMs = CHUNK_STREAM_MS,
  ): void {
    const frameStart = performance.now();
    this.lastFrameBuilds = 0;
    // 补内容与建地形交替：一帧只做一件事，避免“地形 + 撒点”在同一个帧里叠加成一次大卡顿。
    const decorateNow = this.pendingDecoration.length > 0 && !this.decoratedLastFrame;
    this.decoratedLastFrame = decorateNow;
    const playerChunkX = Math.round(playerX / CHUNK_SIZE);
    const playerChunkZ = Math.round(playerZ / CHUNK_SIZE);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);

    const needed: Array<{
      key: string;
      cx: number;
      cz: number;
      priority: number;
      detailed: boolean;
      upgrade: boolean;
    }> = [];
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
        const distance = Math.hypot(dx, dz);
        if (distance > CHUNK_RADIUS + 0.5) continue;

        const cx = playerChunkX + dx;
        const cz = playerChunkZ + dz;
        const key = `${cx},${cz}`;
        // 只有近处才需要植被、房屋等完整内容；外圈先铺地形。
        const detailed = distance <= CHUNK_DETAIL_RADIUS;
        const existing = this.chunkMap.get(key);

        if (existing) {
          // 已经补全内容，或已经在等待补内容：都不用再排队。
          if (existing.detailed || !detailed || existing.needsDecoration) continue;
          // 走近外圈区块：把它重建为完整区块。始终排在新区块之前。
          needed.push({ key, cx, cz, priority: distance - 12, detailed: true, upgrade: true });
          continue;
        }

        needed.push({
          key,
          cx,
          cz,
          priority: distance - (dx * forwardX + dz * forwardZ) * 0.6,
          detailed,
          upgrade: false,
        });
      }
    }
    needed.sort((a, b) => a.priority - b.priority);

    const buildCount = Math.min(budget, needed.length);
    for (let i = 0; i < buildCount; i++) {
      // 这一帧要补内容，就先把地形建造留到下一帧。
      if (decorateNow) break;
      const item = needed[i]!;
      if (item.upgrade) {
        const previous = this.chunkMap.get(item.key);
        if (previous) this.disposeChunk(previous);
      }

      const started = performance.now();
      const chunk = this.chunkBuilder.buildTerrain(item.cx, item.cz, item.detailed);
      const elapsed = performance.now() - started;
      this.buildCount++;
      this.lastBuildMs = elapsed;
      if (elapsed > this.maxBuildMs) this.maxBuildMs = elapsed;
      this.lastFrameBuilds++;
      if (item.detailed) {
        // 植被与房屋留给后面的帧补，避免“地形 + 撒点”一起顶出一次大卡顿。
        this.detailBuilds++;
        this.detailBuildMs += elapsed;
        this.pendingDecoration.push(chunk);
      } else {
        this.terrainBuilds++;
        this.terrainBuildMs += elapsed;
      }

      this.chunkMap.set(item.key, chunk);
      this.scene.add(chunk.group);

      // 按时间限流：这一帧已经花超预算就不再开下一个，避免高速移动时连建数个区块。
      if (performance.now() - frameStart >= budgetMs) break;
    }

    // 补内容（撒植被 + 放房屋）：本帧只做这一件事。
    if (decorateNow) {
      const chunk = this.pendingDecoration.shift()!;
      // 可能已经被卸载，只有还挂在场景上的区块才补。
      if (this.chunkMap.get(chunk.key) === chunk) {
        const started = performance.now();
        this.chunkBuilder.decorate(chunk);
        const elapsed = performance.now() - started;
        this.lastDecorateMs = elapsed;
        this.decorateBuilds++;
        this.decorateBuildMs += elapsed;
        if (elapsed > this.maxBuildMs) this.maxBuildMs = elapsed;
      }
    }

    for (const [key, chunk] of this.chunkMap) {
      const dx = chunk.cx - playerChunkX;
      const dz = chunk.cz - playerChunkZ;
      if (Math.hypot(dx, dz) > CHUNK_RADIUS + CHUNK_UNLOAD_MARGIN) {
        this.disposeChunk(chunk);
        this.chunkMap.delete(key);
      }
    }

    const centerRoad = Math.floor(playerZ / ROAD_SEGMENT_LENGTH);
    const roadSpan = Math.ceil(((CHUNK_RADIUS + 0.5) * CHUNK_SIZE) / ROAD_SEGMENT_LENGTH);
    const roadBudget = Math.max(1, budget >> 1);
    let builtRoads = 0;

    for (let distance = 0; distance <= roadSpan && builtRoads < roadBudget; distance++) {
      const keys = distance === 0 ? [centerRoad] : [centerRoad - distance, centerRoad + distance];

      for (const key of keys) {
        if (builtRoads >= roadBudget) break;
        if (this.roadMap.has(key)) continue;
        if (builtRoads > 0 && performance.now() - frameStart >= budgetMs) break;

        const road = this.roadBuilder.build(key);
        this.roadMap.set(key, road);
        this.scene.add(road.group);
        builtRoads++;
      }
    }

    for (const [key, road] of this.roadMap) {
      if (Math.abs(key - centerRoad) > roadSpan + 2) {
        this.disposeRoad(road);
        this.roadMap.delete(key);
      }
    }

    this.frameBuildMs = performance.now() - frameStart;
  }

  /** 返回被树干 / 岩石推开后的水平位置。 */
  resolveCollisions(x: number, z: number): readonly [number, number] {
    const playerChunkX = Math.round(x / CHUNK_SIZE);
    const playerChunkZ = Math.round(z / CHUNK_SIZE);
    let px = x;
    let pz = z;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.chunkMap.get(`${playerChunkX + dx},${playerChunkZ + dz}`);
        if (!chunk) continue;

        for (const collider of chunk.colliders) {
          const offsetX = px - collider.x;
          const offsetZ = pz - collider.z;
          const radius = collider.radius + PLAYER_RADIUS;
          const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;

          if (distanceSquared < radius * radius && distanceSquared > 1e-6) {
            const distance = Math.sqrt(distanceSquared);
            px = collider.x + (offsetX / distance) * radius;
            pz = collider.z + (offsetZ / distance) * radius;
          }
        }
      }
    }

    return [px, pz];
  }

  dispose(): void {
    for (const chunk of this.chunkMap.values()) this.disposeChunk(chunk);
    for (const road of this.roadMap.values()) this.disposeRoad(road);
    this.chunkMap.clear();
    this.roadMap.clear();
    this.pendingDecoration.length = 0;
  }

  private disposeChunk(chunk: ChunkView): void {
    this.pendingDecoration = this.pendingDecoration.filter((pending) => pending !== chunk);
    this.scene.remove(chunk.group);
    chunk.group.traverse((object) => {
      if (object instanceof InstancedMesh) {
        object.dispose();
      } else if (object instanceof Mesh) {
        object.geometry.dispose();
      }
    });
  }

  private disposeRoad(road: RoadView): void {
    this.scene.remove(road.group);
    road.group.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
    road.surfaceGeometry.dispose();
  }
}
