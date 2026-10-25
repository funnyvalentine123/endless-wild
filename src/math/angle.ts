/** 返回从 a 转到 b 的最短角度差，范围 (-π, π]。 */
export function angularDifference(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
