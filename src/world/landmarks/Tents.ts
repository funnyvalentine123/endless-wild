import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  type Material,
} from 'three';
import { createRandom, hashChunk, mix32 } from '../../math/random';
import { mergeGeometries } from '../../render/geometry/mergeGeometries';
import { paintGeometry } from '../../render/geometry/paintGeometry';
import type { World } from '../World';
import type { HouseBuild, HousePlacement, HouseSite, HouseStyle } from './Houses';

export const TENT_COLLIDER_RADIUS = 4.6;

const TENT_SALT = 0x2c1b3d4e;
const CANVAS_COLORS = [0xb08a55, 0x9c7448, 0xc2a06a, 0x8e6a45] as const;
const RUG_COLORS = [0x8c3b2e, 0x6d4a7a, 0x3f6b5a] as const;

function paintedBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return paintGeometry(geometry, hex);
}

function paintedTriangle(
  points: ReadonlyArray<readonly [number, number, number]>,
  hex: number,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(points.flatMap((point) => [point[0], point[1], point[2]]), 3),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geometry.computeVertexNormals();
  return paintGeometry(geometry, hex);
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]!;
}

/**
 * 沙漠建筑：双坡布面帐篷 + 木杆 + 门帘与地毯。
 * 与房屋共用同一套 HouseSite 管线，因此村民、区块卸载逻辑无需特殊处理。
 */
export function createTent(
  placement: HousePlacement,
  seed: number,
  cx: number,
  cz: number,
  world: World,
  material: Material,
): HouseBuild {
  const random = createRandom(mix32(hashChunk(seed ^ TENT_SALT, cx, cz)));
  const canvasColor = pick(CANVAS_COLORS, random);
  const rugColor = pick(RUG_COLORS, random);

  const width = 7.0 + random() * 1.0;
  const depth = 5.2 + random() * 0.9;
  const eave = 0.55;
  const ridge = 2.8 + random() * 0.4;
  const span = width / 2 + 0.35;
  const angle = Math.atan2(ridge - eave, width / 2);
  const slabLength = Math.hypot(span, ridge - eave) + 0.25;

  const parts: BufferGeometry[] = [
    paintedBox(width + 2.6, 0.06, depth + 2.6, 0, 0.03, 0, 0x7a5a3c),
    paintedBox(width * 0.62, 0.03, depth * 0.56, 0, 0.07, 0, rugColor),
  ];

  for (const side of [-1, 1]) {
    const panel = new BoxGeometry(slabLength, 0.12, depth + 1.0);
    panel.rotateZ(-side * angle);
    panel.translate(side * (span / 2), (eave + ridge) / 2, 0);
    parts.push(paintGeometry(panel, canvasColor));
  }

  const frontZ = depth / 2 + 0.02;
  const backZ = -depth / 2 - 0.02;
  const canvasDark = canvasColor;
  parts.push(
    paintedTriangle(
      [
        [-width / 2, eave, frontZ],
        [width / 2, eave, frontZ],
        [0, ridge, frontZ],
      ],
      canvasDark,
    ),
    paintedTriangle(
      [
        [width / 2, eave, backZ],
        [-width / 2, eave, backZ],
        [0, ridge, backZ],
      ],
      canvasDark,
    ),
    // 门帘与门前小遮棚
    paintedBox(1.5, 1.8, 0.1, 0, 0.9, depth / 2 + 0.08, 0x3a2a1e),
    paintedBox(2.2, 0.08, 1.1, 0, 1.86, depth / 2 + 0.6, 0x8b6740),
    paintedBox(0.06, 1.86, 0.06, -0.98, 0.93, depth / 2 + 1.08, 0x6b4a2b),
    paintedBox(0.06, 1.86, 0.06, 0.98, 0.93, depth / 2 + 1.08, 0x6b4a2b),
    // 脊杆与四角立柱
    paintedBox(0.1, 0.1, depth + 1.2, 0, ridge, 0, 0x6b4a2b),
    paintedBox(0.12, ridge, 0.12, -width / 2 + 0.1, ridge / 2, depth / 2, 0x6b4a2b),
    paintedBox(0.12, ridge, 0.12, width / 2 - 0.1, ridge / 2, depth / 2, 0x6b4a2b),
    paintedBox(0.12, ridge, 0.12, -width / 2 + 0.1, ridge / 2, -depth / 2, 0x6b4a2b),
    paintedBox(0.12, ridge, 0.12, width / 2 - 0.1, ridge / 2, -depth / 2, 0x6b4a2b),
    // 帐篷顶的小旗，增加沙漠营地辨识度
    paintedBox(0.05, 0.6, 0.05, 0, ridge + 0.3, -depth / 2 + 0.6, 0x6b4a2b),
    paintedBox(0.04, 0.34, 0.5, 0, ridge + 0.46, -depth / 2 + 0.36, rugColor),
  );

  const style: HouseStyle = {
    stories: 1,
    roof: 'hip',
    chimney: false,
    width,
    depth,
    roofHeight: ridge,
    wallColor: canvasColor,
    roofColor: canvasColor,
    trimColor: 0x6b4a2b,
    shutterColor: rugColor,
    villagerCount: 1 + Math.floor(random() * 2),
  };

  const mesh = new Mesh(mergeGeometries(parts), material);
  mesh.position.set(placement.x, placement.y, placement.z);
  mesh.rotation.y = placement.rotation;

  const frontHomeZ = depth / 2 + 3.2;
  const doorX = placement.x + Math.sin(placement.rotation) * frontHomeZ;
  const doorZ = placement.z + Math.cos(placement.rotation) * frontHomeZ;
  const doorY = world.groundAt(doorX, doorZ);

  const site: HouseSite = {
    x: placement.x,
    y: placement.y,
    z: placement.z,
    rotation: placement.rotation,
    style,
    doorX,
    doorY,
    doorZ,
    houseRadius: TENT_COLLIDER_RADIUS,
    tent: true,
  };

  return { mesh, site };
}
