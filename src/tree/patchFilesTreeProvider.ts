import * as vscode from 'vscode';
import * as path from 'path';
import type { HighlightSessionManager } from '../highlight/highlightSessionManager';
import type { RepositoryHighlightSession } from '../highlight/repositoryHighlightSession';
import type { RepositoryResolver, Repository } from '../git/repositoryResolver';
import type { PatchHighlightLayer } from '../highlight/patchHighlightLayer';
import type { PatchFileChange, AddedLineRange, HistoricalPatchViewMode } from '../patch/models';
import { PATCH_COLOR_PRESETS } from '../constants';

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
    // 色块图标:颜色与代码行高亮一致(customColor 优先,否则 colorSlot 预设)
    const colorHex =
      layer.customColor?.border ??
      PATCH_COLOR_PRESETS[layer.colorSlot % PATCH_COLOR_PRESETS.length].border;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${colorHex}"/></svg>`;
    this.iconPath = vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
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

  constructor(
    private readonly sessionManager: HighlightSessionManager,
    private readonly repoResolver: RepositoryResolver,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PatchTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PatchTreeNode): Promise<PatchTreeNode[]> {
    if (!element) {
      const entries: LayerEntry[] = [];
      // 只展示提交列表所属 repo 的 patch(与 CommitListTreeProvider 一致的 repo 解析)
      const session = await this.resolveSession();
      if (session) {
        for (const layer of session.patchLayers.values()) {
          if (!layer.enabled) {
            continue; // 隐藏的 patch 不显示在补丁图层
          }
          entries.push({
            layer,
            root: session.repositoryRoot,
            isPrimary: session.primaryPatchId === layer.patchId,
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

  /** 与提交列表一致:active editor 优先,否则第一个 workspace folder。 */
  private async resolveSession(): Promise<RepositoryHighlightSession | undefined> {
    const repo = await this.resolveRepo();
    if (!repo) {
      return undefined;
    }
    return this.sessionManager.getSession(repo.root);
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
      entries.sort((a, b) => a.layer.label.localeCompare(b.layer.label) || b.layer.createdAt - a.layer.createdAt);
      break;
    case 'color':
      entries.sort(
        (a, b) => a.layer.colorSlot - b.layer.colorSlot || b.layer.createdAt - a.layer.createdAt,
      );
      break;
    case 'added':
    default:
      // 按 patch 时间(commitTime)降序,最新 patch 在顶部;无 commitTime 回退添加时间
      entries.sort(
        (a, b) =>
          (b.layer.commitTime ?? b.layer.createdAt) - (a.layer.commitTime ?? a.layer.createdAt),
      );
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
