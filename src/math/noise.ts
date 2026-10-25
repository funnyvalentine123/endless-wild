import { createRandom } from './random';

/** 二维 simplex 噪声，取值范围约 [-1, 1]。 */
export type Noise2D = (x: number, y: number) => number;

const GRADIENTS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * 用种子打乱排列表，构造可复现的二维 simplex 噪声。
 * 同一份种子在不同机器、不同加载顺序下都会得到相同地形。
 */
export function createNoise2D(seed: number): Noise2D {
  const random = createRandom(seed);
  const permutation = Array.from({ length: 256 }, (_, index) => index);

  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = permutation[i]!;
    permutation[i] = permutation[j]!;
    permutation[j] = tmp;
  }

  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = permutation[i & 255]!;

  return (x: number, y: number): number => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;

    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    let value = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = GRADIENTS[p[ii + p[jj]!]! & 7]!;
      t0 *= t0;
      value += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = GRADIENTS[p[ii + i1 + p[jj + j1]!]! & 7]!;
      t1 *= t1;
      value += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = GRADIENTS[p[ii + 1 + p[jj + 1]!]! & 7]!;
      t2 *= t2;
      value += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    return 70 * value;
  };
}
