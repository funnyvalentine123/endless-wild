const MAX_FRAME_DELTA = 0.05;

/** requestAnimationFrame 主循环；对长帧做上限，避免切标签页回来时物理瞬移。 */
export class GameLoop {
  private frameId = 0;
  private running = false;
  private lastTime = 0;

  constructor(private readonly onFrame: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();

    // 先同步跑一帧，开始界面出现前就能预生成附近区块。
    this.onFrame(0);
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;

    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DELTA);
    this.lastTime = now;
    this.onFrame(dt);
    this.frameId = requestAnimationFrame(this.tick);
  };
}
