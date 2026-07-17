import * as vscode from 'vscode';

/**
 * PENTIMENTO 视图树节点。
 * 阶段 1:仅展示提示节点,后续阶段替换为 Patch / 文件 / Hunk 三级结构。
 */
class PatchTreeNode extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = description ?? label;
  }
}

/**
 * Patches 树视图数据提供者。
 *
 * 阶段 1:空状态占位。后续阶段由 highlightSessionManager 驱动,
 * 呈现 ★主要/●启用/○隐藏/!不确定 的多 Patch 多级树。
 */
export class PatchFilesTreeProvider implements vscode.TreeDataProvider<PatchTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<PatchTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PatchTreeNode): PatchTreeNode {
    return element;
  }

  getChildren(element?: PatchTreeNode): PatchTreeNode[] {
    if (element) {
      return [];
    }
    return [
      new PatchTreeNode(
        'No active patches',
        'Run "Pentimento: Add Commit or Range" to highlight a patch.',
      ),
    ];
  }
}
