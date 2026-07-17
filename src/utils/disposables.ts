import * as vscode from 'vscode';

/**
 * Disposable 聚合。按添加顺序的逆序释放。
 */
export class DisposableStore implements vscode.Disposable {
  private readonly items: vscode.Disposable[] = [];
  private disposed = false;

  add<T extends vscode.Disposable>(disposable: T): T {
    if (this.disposed) {
      disposable.dispose();
      return disposable;
    }
    this.items.push(disposable);
    return disposable;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].dispose();
      } catch {
        // 释放过程中单个 dispose 失败不阻断其余释放
      }
    }
    this.items.length = 0;
  }
}

/** 将一个清理函数包装为 Disposable。 */
export function toDisposable(fn: () => void): vscode.Disposable {
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      fn();
    },
  };
}
