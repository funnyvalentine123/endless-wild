/** 帧率统计窗口：0.5 秒，既能及时反映掉帧，又不会数字乱跳。 */
const FPS_WINDOW_MS = 500;

/**
 * 实时帧率统计。
 *
 * 不走游戏循环的 dt：主循环通常会把 dt 截断（避免长帧把玩家推出地图），
 * 用截断后的 dt 算出来的“帧率”会偏高，所以这里直接用 performance.now()。
 */
export class FpsMeter {
  private windowStart = Number.NaN;
  private frames = 0;
  private current = 0;

  constructor(private readonly windowMs = FPS_WINDOW_MS) {}

  /** 每帧调用一次：窗口结束时返回新帧率，否则返回 null。 */
  sample(now = performance.now()): number | null {
    // 第一帧只作为窗口起点，不计数：否则窗口边界那一帧会被重复计入，
    // 100ms 窗口下 60fps 会显示成 70fps。
    if (!Number.isFinite(this.windowStart)) {
      this.windowStart = now;
      this.frames = 0;
      return null;
    }
    this.frames += 1;

    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return null;

    this.current = (this.frames * 1000) / elapsed;
    this.windowStart = now;
    this.frames = 0;
    return this.current;
  }

  /** 最近一次统计出的帧率（尚未统计时为 0）。 */
  get value(): number {
    return this.current;
  }
}
