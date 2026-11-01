import { BufferAttribute, Color, Group, Mesh, PlaneGeometry } from 'three';
import { CHUNK_SEGMENTS, CHUNK_SEGMENTS_FAR, CHUNK_SIZE } from '../../config/world';
import type { WorldMaterials } from '../WorldMaterials';
import type { World } from '../World';
import { sampleTerrainColor } from '../TerrainColoring';
import { VEGETATION_KINDS, type VegetationAssets, type VegetationKind } from '../assets/VegetationAssets';
import { addInstances } from '../../render/instancing';
import {
  HOUSE_CLEAR_RADIUS,
  createHouse,
  findHousePlacement,
  type HousePlacement,
  type HouseSite,
} from '../landmarks/Houses';
import { createTent } from '../landmarks/Tents';
import { scatterVegetation } from './VegetationScatter';
import type { ChunkView, ExclusionZone } from './types';

/** 负责把一个区块的世界数据变成可渲染的 Group（地形 + 实例化植被）。 */
export class ChunkMeshBuilder {
  constructor(
    private readonly world: World,
    private readonly seed: number,
    private readonly materials: WorldMaterials,
    private readonly assets: VegetationAssets,
  ) {}

  private readonly houseCache = new Map<string, HousePlacement | null>();

  /**
   * 构建一个区块（同步）。需要分帧时请分别用 buildTerrain / decorate：
   * 地形网格是所有区块都要付的成本，植被与房屋可以晚一两帧再补。
   */
  build(cx: number, cz: number, detailed = true): ChunkView {
    const chunk = this.buildTerrain(cx, cz, detailed);
    if (detailed) this.decorate(chunk);
    return chunk;
  }

  /**
   * 只铺地形网格：外圈区块在雾里几乎看不出来，不撒植被、不放房屋，
   * 并且用更低的分段数（CHUNK_SEGMENTS_FAR），顶点采样只有近处的 40% 左右。
   */
  buildTerrain(cx: number, cz: number, detailed: boolean): ChunkView {
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;
    const key = `${cx},${cz}`;
    const group = new Group();

    const segments = detailed ? CHUNK_SEGMENTS : CHUNK_SEGMENTS_FAR;
    const geometry = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, this.world.height(positions.getX(i) + originX, positions.getZ(i) + originZ));
    }
    geometry.computeVertexNormals();

    const normals = geometry.getAttribute('normal') as BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const snowMasks = new Float32Array(positions.count);
    const color = new Color();

    for (let i = 0; i < positions.count; i++) {
      const worldX = positions.getX(i) + originX;
      const worldZ = positions.getZ(i) + originZ;
      const desert = this.world.desertAt(worldX, worldZ);
      // 沙漠地面永远不参与积雪变白，过渡带按沙漠因子平滑衰减。
      snowMasks[i] = 1 - desert;
      sampleTerrainColor(
        this.world,
        worldX,
        worldZ,
        positions.getY(i),
        normals.getY(i),
        color,
        desert,
      );
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSnowMask', new BufferAttribute(snowMasks, 1));

    const terrain = new Mesh(geometry, this.materials.terrain);
    terrain.position.set(originX, 0, originZ);
    group.add(terrain);

    return {
      key,
      cx,
      cz,
      group,
      colliders: [],
      detailed: false,
      needsDecoration: detailed,
    };
  }

  /** 补全内容：撒植被、放房屋。detailed 请求的区块才需要调用，通常晚一帧。 */
  decorate(chunk: ChunkView): void {
    const { cx, cz, group } = chunk;
    const house = this.houseAt(cx, cz);

    // 把相邻区块的房屋空地也纳入排除，避免树从隔壁长进院子里。
    const exclusions: ExclusionZone[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const neighbor = this.houseAt(cx + dx, cz + dz);
        if (neighbor) {
          exclusions.push({
            x: neighbor.x,
            z: neighbor.z,
            radius: HOUSE_CLEAR_RADIUS,
          });
        }
      }
    }

    const scatter = scatterVegetation(this.world, this.seed, cx, cz, exclusions);

    for (const kind of VEGETATION_KINDS) {
      addInstances(group, this.geometryFor(kind), this.materials.vegetation, scatter.instances[kind]);
    }

    let site: HouseSite | undefined;
    if (house) {
      const built = house.tent
        ? createTent(house, this.seed, cx, cz, this.world, this.materials.vegetation)
        : createHouse(
            house,
            this.seed,
            cx,
            cz,
            this.world,
            this.materials.vegetation,
            this.materials.window,
          );
      group.add(built.mesh);
      site = built.site;
      scatter.colliders.push({ x: house.x, z: house.z, radius: built.site.houseRadius });
    }

    chunk.colliders = scatter.colliders;
    chunk.house = site;
    chunk.detailed = true;
    chunk.needsDecoration = false;
  }

  private geometryFor(kind: VegetationKind) {
    return this.assets[kind];
  }

  private houseAt(cx: number, cz: number): HousePlacement | null {
    const key = `${cx},${cz}`;
    if (this.houseCache.has(key)) return this.houseCache.get(key)!;

    const placement = findHousePlacement(this.world, this.seed, cx, cz);
    if (this.houseCache.size > 5000) this.houseCache.clear();
    this.houseCache.set(key, placement);
    return placement;
  }
}
