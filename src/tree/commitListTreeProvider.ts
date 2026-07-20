import * as vscode from 'vscode';
import type { CommitProvider, GitCommitInfo } from '../git/commitProvider';
import type { RepositoryResolver, Repository } from '../git/repositoryResolver';
import type { HighlightSessionManager } from '../highlight/highlightSessionManager';
import type { PatchHighlightLayer } from '../highlight/patchHighlightLayer';
import { PATCH_COLOR_PRESETS } from '../constants';

/**
 * 提交列表节点:点击切换高亮/不高亮。
 * 已高亮的提交显示色块图标(颜色与代码行高亮一致),并标注「高亮中/已隐藏」。
 */
export class CommitNode extends vscode.TreeItem {
  constructor(info: GitCommitInfo, layer?: PatchHighlightLayer) {
    super(`${info.shortHash} ${info.summary}`, vscode.TreeItemCollapsibleState.None);
    const date = new Date(info.authorTimestamp * 1000);
    this.tooltip = `${info.commitHash}\n${info.summary}\n${info.authorName} <${info.authorEmail ?? ''}>\n${date.toLocaleString()}`;
    this.contextValue = 'pentimento.commit';
    if (layer) {
      // 色块图标:颜色与代码行高亮一致(customColor 优先,否则 colorSlot 预设)
      const opacity = layer.enabled ? 1 : 0.35;
      const colorHex =
        layer.customColor?.border ??
        PATCH_COLOR_PRESETS[layer.colorSlot % PATCH_COLOR_PRESETS.length].border;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${colorHex}" opacity="${opacity}"/></svg>`;
      this.iconPath = vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      this.description = layer.enabled ? '高亮中' : '已隐藏';
    } else {
      // 未高亮:空圈图标,与已高亮色块形成明显对比
      const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="#888888" stroke-width="1.5"/></svg>`;
      this.iconPath = vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(emptySvg)}`);
      this.description = `${info.authorName} · ${date.toLocaleDateString()}`;
    }
    this.command = {
      command: 'pentimento.toggleCommitHighlight',
      title: '切换高亮',
      arguments: [info.commitHash],
    };
  }
}

/**
 * 提交列表 TreeView:列出当前仓库的提交历史(HEAD 历史,最多 200 条)。
 * 点击提交节点切换高亮:未高亮则添加,已高亮则切换显隐。
 */
export class CommitListTreeProvider implements vscode.TreeDataProvider<CommitNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CommitNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly commitProvider: CommitProvider,
    private readonly repoResolver: RepositoryResolver,
    private readonly sessionManager: HighlightSessionManager,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CommitNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CommitNode): Promise<CommitNode[]> {
    if (element) {
      return [];
    }
    const repo = await this.resolveRepo();
    if (!repo) {
      return [];
    }
    const session = this.sessionManager.getSession(repo.root);
    let commits: GitCommitInfo[];
    try {
      const limit = vscode.workspace.getConfiguration('pentimento').get<number>(
        'commitList.maxCommits',
        1000,
      );
      commits = await this.commitProvider.listCommits(repo.root, limit);
    } catch {
      return [];
    }
    // 补充已高亮但不在 HEAD 历史中的提交
    // (跨分支 / 超过 maxCommits / fetch 后未合并到 HEAD 的 patch 提交)
    if (session && session.patchLayers.size > 0) {
      const existing = new Set(commits.map((c) => c.commitHash));
      const missingHashes = new Set<string>();
      for (const layer of session.patchLayers.values()) {
        const hash = layer.patch.selection.commitHash;
        if (hash && !existing.has(hash) && !missingHashes.has(hash)) {
          missingHashes.add(hash);
        }
      }
      for (const hash of missingHashes) {
        try {
          const info = await this.commitProvider.getCommitInfo(hash, repo.root);
          commits.push(info);
          existing.add(hash);
        } catch {
          // 提交不存在或解析失败,跳过
        }
      }
      // 合并后按 authorTimestamp 降序,保持最新在上
      commits.sort((a, b) => b.authorTimestamp - a.authorTimestamp);
    }
    return commits.map((c) => {
      const layer = session
        ? [...session.patchLayers.values()].find((l) => l.patch.selection.commitHash === c.commitHash)
        : undefined;
      return new CommitNode(c, layer);
    });
  }

  private async resolveRepo(): Promise<Repository | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const r = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
      if (r) {
        return r;
      }
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const r = await this.repoResolver.resolveRepository(folders[0].uri.fsPath);
      if (r) {
        return r;
      }
    }
    return undefined;
  }
}
