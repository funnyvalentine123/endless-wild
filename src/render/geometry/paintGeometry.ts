import { BufferAttribute, BufferGeometry, Color } from 'three';

/**
 * 把单一颜色烘焙成顶点色，供共享材质下的植被 / 道具使用。
 * 返回的几何体一定是非索引的，方便后续合并。
 */
export function paintGeometry(geometry: BufferGeometry, hex: number): BufferGeometry {
  const target = geometry.index ? geometry.toNonIndexed() : geometry;
  const color = new Color(hex);
  const count = (target.getAttribute('position') as BufferAttribute).count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  target.setAttribute('color', new BufferAttribute(colors, 3));
  return target;
}
