/** 简单异步信号量,用于限制并发 Git 命令数。 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      // 把"许可"直接转交给等待者,active 不变
      next();
    } else if (this.active > 0) {
      this.active--;
    }
  }
}
