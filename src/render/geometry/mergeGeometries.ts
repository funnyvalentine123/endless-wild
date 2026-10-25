import { BufferAttribute, BufferGeometry } from 'three';

/**
 * 合并若干非索引几何体。属性集合以第一个几何体为准；
 * 需要所有几何体拥有同名属性（原始单文件版本也是这个约定）。
 */
export function mergeGeometries(geometries: readonly BufferGeometry[]): BufferGeometry {
  const first = geometries[0];
  if (!first) throw new Error('mergeGeometries 至少需要一个几何体');

  const output = new BufferGeometry();

  for (const name of Object.keys(first.attributes)) {
    const firstAttribute = first.getAttribute(name) as BufferAttribute;
    const arrays: Float32Array[] = [];
    let totalLength = 0;

    for (const geometry of geometries) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      const attribute = source.getAttribute(name) as BufferAttribute | undefined;
      if (!attribute) throw new Error(`几何体缺少属性：${name}`);

      const array = attribute.array as Float32Array;
      arrays.push(array);
      totalLength += array.length;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const array of arrays) {
      merged.set(array, offset);
      offset += array.length;
    }

    output.setAttribute(
      name,
      new BufferAttribute(merged, firstAttribute.itemSize, firstAttribute.normalized),
    );
  }

  return output;
}
