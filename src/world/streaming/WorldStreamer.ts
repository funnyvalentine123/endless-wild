import { InstancedMesh, Mesh, type Scene } from 'three';
import {
  CHUNK_DETAIL_RADIUS,
  CHUNK_RADIUS,
  CHUNK_SIZE,
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

  update(playerX: number, playerZ: number, yaw: number, budget: number): void {
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
          if (existing.detailed || !detailed) continue;
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
      const item = needed[i]!;
      if (item.upgrade) {
        const previous = this.chunkMap.get(item.key);
        if (previous) this.disposeChunk(previous);
      }

      const chunk = this.chunkBuilder.build(item.cx, item.cz, item.detailed);
      this.chunkMap.set(item.key, chunk);
      this.scene.add(chunk.group);
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
  }

  private disposeChunk(chunk: ChunkView): void {
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
