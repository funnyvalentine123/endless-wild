export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * 平滑阶跃。允许 edge0 > edge1，此时会得到反向过渡。
 * 世界生成里大量使用了这一点（例如 smoothstep(0.42, 0.02, x)）。
 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
