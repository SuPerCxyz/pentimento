import * as vscode from 'vscode';
import type { HighlightController } from './highlightController';

/**
 * 监听编辑器/文档变化,触发可见编辑器 Decoration 重算。
 * 节流:短时间内多次事件合并为一次重算。
 */
export class EditorTracker implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly controller: HighlightController, private readonly delayMs = 100) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.schedule()),
      vscode.workspace.onDidChangeTextDocument(() => this.schedule()),
      vscode.workspace.onDidSaveTextDocument(() => this.schedule()),
    );
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.controller.applyVisibleEditors();
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
