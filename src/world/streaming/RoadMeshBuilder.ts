import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
} from 'three';
import { ROAD_MESH_STEP, ROAD_SEGMENT_LENGTH, ROAD_WIDTH } from '../../config/world';
import { lerp } from '../../math/scalar';
import type { InstanceTransform } from '../../render/instancing';
import { addInstances } from '../../render/instancing';
import type { WorldMaterials } from '../WorldMaterials';
import type { World } from '../World';
import type { RoadPropAssets } from '../assets/RoadPropAssets';
import type { RoadView } from './types';

const WHITE: readonly [number, number, number] = [1, 1, 1];
const lampMatrix = new Matrix4();

/**
 * 把一段 40m 的道路做成弯曲路面，并在桥上补栏杆、桥墩，
 * 在普通路段补路灯。道路与地形共用同一套世界高度采样。
 */
export class RoadMeshBuilder {
  constructor(
    private readonly world: World,
    private readonly materials: WorldMaterials,
    private readonly props: RoadPropAssets,
  ) {}

  build(key: number): RoadView {
    const z0 = key * ROAD_SEGMENT_LENGTH;
    const rows = ROAD_SEGMENT_LENGTH / ROAD_MESH_STEP + 1;
    const group = new Group();

    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const snowMasks: number[] = [];
    const indices: number[] = [];

    const posts: InstanceTransform[] = [];
    const rails: InstanceTransform[] = [];
    const pillars: InstanceTransform[] = [];
    const lamps: InstanceTransform[] = [];

    for (let j = 0; j < rows; j++) {
      const z = z0 + j * ROAD_MESH_STEP;
      const roadX = this.world.roadX(z);
      const y = this.world.roadHeight(z) + 0.06;
      const bridge = this.world.bridge(z);

      positions.push(roadX - ROAD_WIDTH / 2, y, z, roadX + ROAD_WIDTH / 2, y, z);
      uvs.push(0, z / 8, 1, z / 8);

      const shade = lerp(1, 0.72, bridge);
      colors.push(shade, shade * 0.92, shade * 0.85, shade, shade * 0.92, shade * 0.85);

      // 沙漠中的路面同样不参与积雪变白。
      const snowMask = 1 - this.world.desertAt(roadX, z);
      snowMasks.push(snowMask, snowMask);

      if (j < rows - 1) {
        const base = j * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }

      if (bridge > 0.35 && j < rows - 1) {
        const nextZ = z + ROAD_MESH_STEP;
        const nextX = this.world.roadX(nextZ);
        const nextY = this.world.roadHeight(nextZ) + 0.06;
        const length = Math.hypot(nextX - roadX, nextZ - z, nextY - y);
        const angle = Math.atan2(nextX - roadX, nextZ - z);
        const pitch = -Math.atan2(nextY - y, Math.hypot(nextX - roadX, nextZ - z));

        for (const side of [-1, 1]) {
          const px = roadX + side * (ROAD_WIDTH / 2 - 0.1);
          if (j % 2 === 0) {
            posts.push({ x: px, y, z, ry: 0, scale: 1, color: WHITE });
          }
          rails.push({
            x: (px + nextX + side * (ROAD_WIDTH / 2 - 0.1)) / 2,
            y: (y + nextY) / 2 + 1.05,
            z: z + 1,
            ry: angle,
            pitch,
            scale: 1,
            sz: length,
            color: WHITE,
          });
        }

        if (j % 6 === 0) {
          for (const side of [-1, 1]) {
            pillars.push({
              x: roadX + side * 2.2,
              y: y - 0.25,
              z,
              ry: 0,
              scale: 1,
              sy: y + 5,
              color: WHITE,
            });
          }
        }
      }

      if (j % 15 === 0 && bridge < 0.2) {
        const side = ((z / 30) & 1) ? 1 : -1;
        const lampX = roadX + side * (ROAD_WIDTH / 2 + 0.8);
        lamps.push({
          x: lampX,
          y: this.world.groundAt(lampX, z) - 0.1,
          z,
          ry: 0,
          scale: 1,
          color: WHITE,
        });
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSnowMask', new Float32BufferAttribute(snowMasks, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    group.add(new Mesh(geometry, this.materials.road));

    addInstances(group, this.props.post, this.materials.vegetation, posts);
    addInstances(group, this.props.rail, this.materials.vegetation, rails);
    addInstances(group, this.props.pillar, this.materials.vegetation, pillars);
    addInstances(group, this.props.lampPost, this.materials.vegetation, lamps);

    if (lamps.length > 0) {
      const heads = new InstancedMesh(this.props.lampHead, this.materials.lamp, lamps.length);
      lamps.forEach((lamp, index) => {
        heads.setMatrixAt(index, lampMatrix.makeTranslation(lamp.x, lamp.y, lamp.z));
      });
      heads.instanceMatrix.needsUpdate = true;
      heads.computeBoundingSphere();
      group.add(heads);
    }

    return { key, group, surfaceGeometry: geometry };
  }
}
