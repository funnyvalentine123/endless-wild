export type RandomSource = () => number;

/**
 * 与原始单文件版本一致的 xorshift32 随机数生成器。
 * 先预热 6 轮，保证相邻种子不会输出相似序列；返回值落在 [0, 1)。
 */
export function createRandom(seed: number): RandomSource {
  let state = (seed >>> 0) || 1;
  for (let i = 0; i < 6; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
  }

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4_294_967_296;
  };
}

/** 每个区块使用独立随机流，保证生成结果与加载顺序无关。 */
export function hashChunk(seed: number, cx: number, cz: number): number {
  return ((cx * 73_856_093) ^ (cz * 19_349_663) ^ seed) >>> 0;
}

/**
 * Murmur3 32 位收尾混合。
 * hashChunk 是线性的，不同用途如果只 XOR 不同盐值，首个随机数仍可能相关；
 * 房屋样式这类“同一坐标的第二次抽样”需要先做一次强混合。
 */
export function mix32(value: number): number {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
