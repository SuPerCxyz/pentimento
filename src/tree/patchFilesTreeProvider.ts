import * as vscode from 'vscode';
import * as path from 'path';
import type { HighlightSessionManager } from '../highlight/highlightSessionManager';
import type { PatchHighlightLayer } from '../highlight/patchHighlightLayer';
import type { PatchFileChange, AddedLineRange, HistoricalPatchViewMode } from '../patch/models';

export type PatchTreeNode = PatchNode | FileNode | HunkNode;

/** ★ 主要 / ● 启用 / ○ 隐藏。 */
class PatchNode extends vscode.TreeItem {
  constructor(
    public readonly layer: PatchHighlightLayer,
    public readonly repoRoot: string,
    isPrimary: boolean,
  ) {
    const marker = !layer.enabled ? '○' : isPrimary ? '★' : '●';
    const hash = layer.patch.selection.commitHash?.slice(0, 8) ?? '';
    super(`${marker} ${hash} ${layer.label}`.trim(), vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${viewModeLabel(layer.viewMode)} · ${layer.patch.totalAddedLines} lines`;
    this.tooltip = `${hash} · ${layer.label}\n${viewModeLabel(layer.viewMode)} · ${layer.patch.files.length} files · +${layer.patch.totalAddedLines}`;
    this.contextValue = isPrimary ? 'pentimento.primaryPatch' : 'pentimento.patch';
  }
}

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly layer: PatchHighlightLayer,
    public readonly file: PatchFileChange,
    public readonly repoRoot: string,
  ) {
    const p = file.displayPath ?? file.newPath ?? file.oldPath ?? '';
    super(`${statusLetter(file.status)} ${p}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = file.status === 'deleted' ? '+0' : `+${file.addedLineCount}`;
    this.tooltip = `${file.status} · ${p} · +${file.addedLineCount} -${file.deletedLineCount}`;
    this.contextValue = 'pentimento.patchFile';
    const abs = path.join(repoRoot, file.newPath ?? file.oldPath ?? '');
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(abs)] };
  }
}

class HunkNode extends vscode.TreeItem {
  constructor(index: number, range: AddedLineRange) {
    super(`Hunk ${index} · Lines ${range.startLine}-${range.endLine}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `Added lines ${range.startLine}-${range.endLine} (${range.endLine - range.startLine + 1} lines)`;
  }
}

/**
 * PENTIMENTO 多级树:Patch -> 文件 -> Hunk。
 * 从 HighlightSessionManager 读取会话,懒加载。
 */
export class PatchFilesTreeProvider implements vscode.TreeDataProvider<PatchTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<PatchTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly sessionManager: HighlightSessionManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PatchTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PatchTreeNode): PatchTreeNode[] {
    if (!element) {
      const nodes: PatchNode[] = [];
      for (const s of this.sessionManager.allSessions()) {
        for (const layer of s.patchLayers.values()) {
          nodes.push(new PatchNode(layer, s.repositoryRoot, s.primaryPatchId === layer.patchId));
        }
      }
      return nodes;
    }
    if (element instanceof PatchNode) {
      return element.layer.patch.files.map((f) => new FileNode(element.layer, f, element.repoRoot));
    }
    if (element instanceof FileNode) {
      return element.file.originalAddedRanges.map((r, i) => new HunkNode(i + 1, r));
    }
    return [];
  }
}

function viewModeLabel(mode: HistoricalPatchViewMode): string {
  switch (mode) {
    case 'exact-patch-revision':
      return 'Exact';
    case 'surviving-lines':
      return 'Surviving';
    case 'projected-footprint':
      return 'Projected';
  }
}

function statusLetter(status: PatchFileChange['status']): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'binary':
      return 'B';
    case 'submodule':
      return 'S';
  }
}
