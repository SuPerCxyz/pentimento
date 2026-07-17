/**
 * 取消信号抽象。
 *
 * 与 vscode.CancellationToken 形状兼容:运行时可直接传入
 * vscode.CancellationTokenSource 的 token;单元测试可传入简单对象。
 */
export interface Disposable {
  dispose(): void;
}

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
  onCancellationRequested?(listener: () => void): Disposable;
}

class CancellationSignalImpl implements CancellationSignal {
  private cancelled = false;
  private listeners: Array<() => void> = [];

  get isCancellationRequested(): boolean {
    return this.cancelled;
  }

  onCancellationRequested(listener: () => void): Disposable {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    const pending = this.listeners.slice();
    this.listeners = [];
    for (const l of pending) {
      try {
        l();
      } catch {
        // 监听器异常不影响其余监听器
      }
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

/**
 * 不依赖 vscode 的简易 CancellationTokenSource,便于在纯 Node 上下文
 * (单元测试、GitRunner)中使用取消语义。
 */
export class CancellationTokenSource {
  private readonly impl = new CancellationSignalImpl();

  get token(): CancellationSignal {
    return this.impl;
  }

  cancel(): void {
    this.impl.cancel();
  }

  dispose(): void {
    this.impl.dispose();
  }
}
