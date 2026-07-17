import * as vscode from 'vscode';
import { Commands } from '../constants';
import type { LogService } from '../utils/logging';

/** 命令定义:[commandId, 用户可读标题]。标题与 package.json contributes.commands 一致。 */
type CommandDef = [string, string];

const COMMAND_DEFS: readonly CommandDef[] = [
  [Commands.addCommitFromLine, 'Add Commit From Current Line'],
  [Commands.highlightOnlyCommitFromLine, 'Highlight Only Commit From Current Line'],
  [Commands.toggleCommitFromLine, 'Toggle Commit From Current Line'],
  [Commands.addRef, 'Add Commit or Range'],
  [Commands.highlightWorkingTree, 'Highlight Working Tree Changes'],
  [Commands.highlightStaged, 'Highlight Staged Changes'],
  [Commands.highlightSurvivingLines, 'Highlight Surviving Lines in Current Revision'],
  [Commands.openExactPatchRevision, 'Open Exact Patch Revision'],
  [Commands.projectOntoCurrentRevision, 'Project Patch onto Current Revision'],
  [Commands.setPrimaryPatch, 'Set Primary Patch'],
  [Commands.togglePatchVisibility, 'Show or Hide Patch'],
  [Commands.removePatch, 'Remove Patch'],
  [Commands.managePatches, 'Manage Highlighted Patches'],
  [Commands.highlightCurrentFile, 'Highlight Current File Only'],
  [Commands.highlightAllFiles, 'Highlight All Changed Files'],
  [Commands.showFiles, 'Show Changed Files'],
  [Commands.nextHunk, 'Next Added Hunk'],
  [Commands.previousHunk, 'Previous Added Hunk'],
  [Commands.showOnlyPrimary, 'Show Only Primary Patch'],
  [Commands.showAll, 'Show All Patches'],
  [Commands.hideAll, 'Hide All Patches'],
  [Commands.toggle, 'Toggle Highlight'],
  [Commands.refresh, 'Refresh Highlight'],
  [Commands.clearAll, 'Clear All Patches'],
  [Commands.switchHistoricalViewMode, 'Switch Historical View Mode'],
  [Commands.showEvolutionSummary, 'Show Patch Evolution Summary'],
  [Commands.closeExactWorkspace, 'Close Exact Patch Workspace'],
  [Commands.removeTemporaryWorktree, 'Remove Temporary Worktree'],
  [Commands.cleanStaleWorktrees, 'Clean Stale Temporary Worktrees'],
  [Commands.showDiagnostics, 'Show Diagnostics'],
];

/**
 * 注册全部 pentimento.* 命令。
 *
 * 阶段 1:除 `openOutputLog` 外,其余命令为占位实现,
 * 提示用户该功能将在后续阶段提供。后续阶段逐个替换为真实 handler。
 */
export function registerCommands(context: vscode.ExtensionContext, logger: LogService): void {
  // 真实实现:打开输出日志
  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.openOutputLog, () => {
      logger.show();
    }),
  );

  // 占位实现
  for (const [id, title] of COMMAND_DEFS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        logger.debug(`command stub invoked: ${id}`, { argCount: args.length });
        await vscode.window.showInformationMessage(
          `Pentimento: "${title}" will be available in a later development stage.`,
        );
      }),
    );
  }
}
