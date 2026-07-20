import * as vscode from 'vscode';
import type { HighlightController } from './highlightController';
import type { PatchFilesTreeProvider } from '../tree/patchFilesTreeProvider';
import type { CommitListTreeProvider } from '../tree/commitListTreeProvider';

/**
 * 监听编辑器/文档变化,触发可见编辑器 Decoration 重算。
 * 节流:短时间内多次事件合并为一次重算。
 *
 * active editor / visible editors 变化时,额外刷新补丁图层与提交列表,
 * 使两个视图随当前 repo 切换更新(补丁图层只展示当前 repo 的 patch)。
 */
export class EditorTracker implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private pendingTreeRefresh = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly controller: HighlightController,
    private readonly treeProvider: PatchFilesTreeProvider,
    private readonly commitListProvider: CommitListTreeProvider,
    private readonly delayMs = 100,
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.schedule(true)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.schedule(true)),
      vscode.workspace.onDidChangeTextDocument(() => this.schedule(false)),
      vscode.workspace.onDidSaveTextDocument(() => this.schedule(false)),
    );
  }

  private schedule(refreshTrees: boolean): void {
    if (refreshTrees) {
      this.pendingTreeRefresh = true;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.controller.applyVisibleEditors();
      if (this.pendingTreeRefresh) {
        this.pendingTreeRefresh = false;
        this.treeProvider.refresh();
        this.commitListProvider.refresh();
      }
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
