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
  /** 已经排进“补全植被”的队列，避免同一区块被重复安排。 */
  needsDecoration?: boolean;
}

export interface RoadView {
  key: number;
  group: Group;
  surfaceGeometry: BufferGeometry;
}
