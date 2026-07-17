import * as vscode from 'vscode';

/**
 * 在新 VSCode Window 中打开精确 Patch worktree。
 * 不修改用户当前工作区、不 checkout、不 stash。
 */
export async function openExactWorkspace(worktreePath: string): Promise<void> {
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), true);
}
