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
}

export interface RoadView {
  key: number;
  group: Group;
  surfaceGeometry: BufferGeometry;
}
