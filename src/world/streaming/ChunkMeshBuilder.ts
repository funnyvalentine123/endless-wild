import { BufferAttribute, Color, Group, Mesh, PlaneGeometry } from 'three';
import { CHUNK_SEGMENTS, CHUNK_SIZE } from '../../config/world';
import type { WorldMaterials } from '../WorldMaterials';
import type { World } from '../World';
import { sampleTerrainColor } from '../TerrainColoring';
import { VEGETATION_KINDS, type VegetationAssets, type VegetationKind } from '../assets/VegetationAssets';
import { addInstances } from '../../render/instancing';
import {
  HOUSE_CLEAR_RADIUS,
  HOUSE_COLLIDER_RADIUS,
  createHouse,
  findHousePlacement,
  type HousePlacement,
  type HouseSite,
} from '../landmarks/Houses';
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

  build(cx: number, cz: number): ChunkView {
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;
    const group = new Group();

    const geometry = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, this.world.height(positions.getX(i) + originX, positions.getZ(i) + originZ));
    }
    geometry.computeVertexNormals();

    const normals = geometry.getAttribute('normal') as BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const color = new Color();

    for (let i = 0; i < positions.count; i++) {
      sampleTerrainColor(
        this.world,
        positions.getX(i) + originX,
        positions.getZ(i) + originZ,
        positions.getY(i),
        normals.getY(i),
        color,
      );
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));

    const terrain = new Mesh(geometry, this.materials.terrain);
    terrain.position.set(originX, 0, originZ);
    group.add(terrain);

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
      const built = createHouse(
        house,
        this.seed,
        cx,
        cz,
        this.world,
        this.materials.vegetation,
      );
      group.add(built.mesh);
      site = built.site;
      scatter.colliders.push({ x: house.x, z: house.z, radius: HOUSE_COLLIDER_RADIUS });
    }

    return {
      key: `${cx},${cz}`,
      cx,
      cz,
      group,
      colliders: scatter.colliders,
      house: site,
    };
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
