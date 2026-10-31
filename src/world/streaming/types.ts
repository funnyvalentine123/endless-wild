import type { BufferGeometry, Group } from 'three';
import type { HouseSite } from '../landmarks/Houses';

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

export interface ExclusionZone {
  x: number;
  z: number;
  radius: number;
}

export interface ChunkView {
  key: string;
  cx: number;
  cz: number;
  group: Group;
  colliders: CircleCollider[];
  house?: HouseSite;
  /** 是否已经补全植被、房屋等内容；外圈只有地形的区块为 false。 */
  detailed: boolean;
}

export interface RoadView {
  key: number;
  group: Group;
  surfaceGeometry: BufferGeometry;
}
