import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

export interface InstanceTransform {
  x: number;
  y: number;
  z: number;
  /** 绕 Y 轴旋转。 */
  ry: number;
  /** 基础缩放；未指定的轴会继承它。 */
  scale: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** 绕 X 轴旋转（岩石倾斜、栏杆俯仰）。 */
  pitch?: number;
  /** 绕 Z 轴旋转。 */
  roll?: number;
  color?: readonly [number, number, number];
}

const matrix = new Matrix4();
const quaternion = new Quaternion();
const euler = new Euler();
const position = new Vector3();
const scale = new Vector3();
const tint = new Color();
const WHITE: readonly [number, number, number] = [1, 1, 1];

/**
 * 用 InstancedMesh 一次性提交同类实例。
 * 返回 null 表示该区块没有这种物体，避免创建空 mesh。
 */
export function addInstances(
  parent: Object3D,
  geometry: BufferGeometry,
  material: Material,
  instances: readonly InstanceTransform[],
): InstancedMesh | null {
  if (instances.length === 0) return null;

  const mesh = new InstancedMesh(geometry, material, instances.length);

  instances.forEach((instance, index) => {
    euler.set(instance.pitch ?? 0, instance.ry, instance.roll ?? 0);
    quaternion.setFromEuler(euler);
    position.set(instance.x, instance.y, instance.z);
    scale.set(
      instance.sx ?? instance.scale,
      instance.sy ?? instance.scale,
      instance.sz ?? instance.scale,
    );

    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);

    const color = instance.color ?? WHITE;
    mesh.setColorAt(index, tint.setRGB(color[0], color[1], color[2]));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  parent.add(mesh);
  return mesh;
}
