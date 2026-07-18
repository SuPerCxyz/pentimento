import * as vscode from 'vscode';
import * as path from 'path';
import type { HighlightSessionManager } from '../highlight/highlightSessionManager';
import type { PatchHighlightLayer } from '../highlight/patchHighlightLayer';
import type { PatchFileChange, AddedLineRange, HistoricalPatchViewMode } from '../patch/models';

export type PatchTreeNode = PatchNode | FileNode | HunkNode | GroupNode;

type SortBy = 'added' | 'name' | 'color';
type GroupBy = 'none' | 'viewMode';

interface LayerEntry {
  layer: PatchHighlightLayer;
  root: string;
  isPrimary: boolean;
}

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
    this.description = `${viewModeLabel(layer.viewMode)} · ${layer.patch.totalAddedLines} 行`;
    this.tooltip = `${hash} · ${layer.label}\n${viewModeLabel(layer.viewMode)} · ${layer.patch.files.length} files · +${layer.patch.totalAddedLines}`;
    this.contextValue = isPrimary ? 'pentimento.primaryPatch' : 'pentimento.patch';
  }
}

/** 分组节点(按 viewMode 分组时使用)。 */
class GroupNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly children: PatchNode[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'pentimento.patchGroup';
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
  constructor(index: number, range: AddedLineRange, file: string) {
    super(`Hunk ${index} · 行 ${range.startLine}-${range.endLine}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `Added lines ${range.startLine}-${range.endLine} (${range.endLine - range.startLine + 1} lines)`;
    this.command = {
      command: 'pentimento.revealHunk',
      title: '跳转到行',
      arguments: [file, range.startLine, range.endLine],
    };
  }
}

/**
 * PENTIMENTO 多级树:Patch -> 文件 -> Hunk。
 * 从 HighlightSessionManager 读取会话,懒加载。
 * 顶层支持按 sortBy 排序与按 groupBy 分组。
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
      const entries: LayerEntry[] = [];
      for (const s of this.sessionManager.allSessions()) {
        for (const layer of s.patchLayers.values()) {
          entries.push({
            layer,
            root: s.repositoryRoot,
            isPrimary: s.primaryPatchId === layer.patchId,
          });
        }
      }
      sortLayerEntries(entries, this.sortBy());
      if (this.groupBy() === 'viewMode') {
        return groupByViewMode(entries);
      }
      return entries.map((e) => new PatchNode(e.layer, e.root, e.isPrimary));
    }
    if (element instanceof GroupNode) {
      return element.children;
    }
    if (element instanceof PatchNode) {
      return element.layer.patch.files.map((f) => new FileNode(element.layer, f, element.repoRoot));
    }
    if (element instanceof FileNode) {
      const abs = path.join(element.repoRoot, element.file.newPath ?? element.file.oldPath ?? '');
      return element.file.originalAddedRanges.map((r, i) => new HunkNode(i + 1, r, abs));
    }
    return [];
  }

  private sortBy(): SortBy {
    return vscode.workspace.getConfiguration('pentimento').get<SortBy>('multiPatch.sortBy', 'added');
  }

  private groupBy(): GroupBy {
    return vscode.workspace.getConfiguration('pentimento').get<GroupBy>('multiPatch.groupBy', 'none');
  }
}

function sortLayerEntries(entries: LayerEntry[], sortBy: SortBy): void {
  switch (sortBy) {
    case 'name':
      entries.sort((a, b) => a.layer.label.localeCompare(b.layer.label) || a.layer.createdAt - b.layer.createdAt);
      break;
    case 'color':
      entries.sort(
        (a, b) => a.layer.colorSlot - b.layer.colorSlot || a.layer.createdAt - b.layer.createdAt,
      );
      break;
    case 'added':
    default:
      entries.sort((a, b) => a.layer.createdAt - b.layer.createdAt);
      break;
  }
}

function groupByViewMode(entries: LayerEntry[]): GroupNode[] {
  const order: HistoricalPatchViewMode[] = [
    'exact-patch-revision',
    'surviving-lines',
    'projected-footprint',
  ];
  const groups = new Map<HistoricalPatchViewMode, LayerEntry[]>();
  for (const e of entries) {
    const arr = groups.get(e.layer.viewMode) ?? [];
    arr.push(e);
    groups.set(e.layer.viewMode, arr);
  }
  const result: GroupNode[] = [];
  for (const mode of order) {
    const arr = groups.get(mode);
    if (!arr || arr.length === 0) {
      continue;
    }
    const label = `${viewModeLabel(mode)} (${arr.length})`;
    const children = arr.map((e) => new PatchNode(e.layer, e.root, e.isPrimary));
    result.push(new GroupNode(label, children));
  }
  return result;
}

function viewModeLabel(mode: HistoricalPatchViewMode): string {
  switch (mode) {
    case 'exact-patch-revision':
      return '精确';
    case 'surviving-lines':
      return '存活';
    case 'projected-footprint':
      return '投影';
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
