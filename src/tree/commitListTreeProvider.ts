import * as vscode from 'vscode';
import type { CommitProvider, GitCommitInfo } from '../git/commitProvider';
import type { RepositoryResolver, Repository } from '../git/repositoryResolver';

/** 提交列表节点:点击即高亮该提交的新增代码。 */
export class CommitNode extends vscode.TreeItem {
  constructor(public readonly info: GitCommitInfo) {
    super(`${info.shortHash} ${info.summary}`, vscode.TreeItemCollapsibleState.None);
    const date = new Date(info.authorTimestamp * 1000);
    this.description = `${info.authorName} · ${date.toLocaleDateString()}`;
    this.tooltip = `${info.commitHash}\n${info.summary}\n${info.authorName} <${info.authorEmail ?? ''}>\n${date.toLocaleString()}`;
    this.contextValue = 'pentimento.commit';
    this.command = {
      command: 'pentimento.addCommitFromLine',
      title: '高亮此提交',
      arguments: [info.commitHash],
    };
  }
}

/**
 * 提交列表 TreeView:列出当前仓库的提交历史(HEAD 历史,最多 200 条)。
 * 点击提交节点即触发高亮该提交新增代码。
 */
export class CommitListTreeProvider implements vscode.TreeDataProvider<CommitNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CommitNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly commitProvider: CommitProvider,
    private readonly repoResolver: RepositoryResolver,
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
    try {
      const commits = await this.commitProvider.listCommits(repo.root);
      return commits.map((c) => new CommitNode(c));
    } catch {
      return [];
    }
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
