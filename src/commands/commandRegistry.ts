import * as vscode from 'vscode';
import { Commands } from '../constants';
import type { LogService } from '../utils/logging';
import type { HighlightController } from '../highlight/highlightController';

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
  [Commands.setPatchColor, 'Set Patch Color'],
  [Commands.fetch, 'Fetch and Refresh'],
  [Commands.highlightLineCommit, 'Highlight Current Line Commit'],
  [Commands.revealHunk, 'Reveal Hunk'],
  [Commands.toggleCommitHighlight, 'Toggle Commit Highlight'],
  [Commands.setPatchColorCurrentLine, 'Set Current Line Patch Color'],
  [Commands.removeCurrentLineHighlight, 'Remove Current Line Highlight'],
];

/** 真实 handler:接收 controller 与命令参数。 */
type Handler = (c: HighlightController, ...args: unknown[]) => Promise<void> | void;

const REAL_HANDLERS: Record<string, Handler> = {
  [Commands.addCommitFromLine]: (c, ...args) => c.addCommitFromHash(String(args[0] ?? ''), false),
  [Commands.highlightOnlyCommitFromLine]: (c, ...args) => c.addCommitFromHash(String(args[0] ?? ''), true),
  [Commands.toggleCommitFromLine]: (c, ...args) => c.addCommitFromHash(String(args[0] ?? ''), false),
  [Commands.addRef]: (c) => c.addRef(),
  [Commands.highlightWorkingTree]: (c) => c.addWorkingTree(),
  [Commands.highlightStaged]: (c) => c.addStaged(),
  [Commands.clearAll]: (c) => c.clearAll(),
  [Commands.toggle]: (c) => c.toggleHighlight(),
  [Commands.refresh]: (c) => c.refresh(),
  [Commands.removePatch]: (c) => c.removeActivePatch(),
  [Commands.showOnlyPrimary]: (c) => c.showOnlyPrimary(),
  [Commands.showAll]: (c) => c.showAll(),
  [Commands.hideAll]: (c) => c.hideAll(),
  [Commands.nextHunk]: (c) => c.nextHunk(),
  [Commands.previousHunk]: (c) => c.previousHunk(),
  [Commands.openExactPatchRevision]: (c, ...args) =>
    c.openExactPatchRevision(args[0] ? String(args[0]) : undefined),
  [Commands.projectOntoCurrentRevision]: (c) => c.projectOntoCurrentRevision(),
  [Commands.showEvolutionSummary]: (c) => c.showEvolutionSummary(),
  [Commands.removeTemporaryWorktree]: (c) => c.removePrimaryWorktree(),
  [Commands.cleanStaleWorktrees]: (c) => c.cleanStaleWorktrees(),
  [Commands.setPatchColor]: (c, ...args) => c.setPatchColor(args[0] ? String(args[0]) : undefined),
  [Commands.fetch]: (c) => c.fetchAndRefresh(),
  [Commands.setPrimaryPatch]: (c, ...args) => c.setPrimaryPatchCommand(args[0] ? String(args[0]) : undefined),
  [Commands.togglePatchVisibility]: (c, ...args) =>
    c.togglePatchVisibilityCommand(args[0] ? String(args[0]) : undefined),
  [Commands.switchHistoricalViewMode]: (c, ...args) =>
    c.switchHistoricalViewModeCommand(args[0] ? String(args[0]) : undefined),
  [Commands.highlightCurrentFile]: (c) => c.highlightCurrentFile(),
  [Commands.highlightAllFiles]: (c) => c.highlightAllFiles(),
  [Commands.highlightSurvivingLines]: (c) => c.highlightSurvivingLines(),
  [Commands.showFiles]: (c) => c.showFiles(),
  [Commands.managePatches]: (c) => c.managePatches(),
  [Commands.showDiagnostics]: (c) => c.showDiagnostics(),
  [Commands.closeExactWorkspace]: (c) => c.closeExactWorkspace(),
  [Commands.highlightLineCommit]: (c) => c.highlightLineCommit(),
  [Commands.revealHunk]: (c, ...args) =>
    c.revealHunk(String(args[0] ?? ''), Number(args[1] ?? 1), Number(args[2] ?? 1)),
  [Commands.toggleCommitHighlight]: (c, ...args) => c.toggleCommitHighlight(String(args[0] ?? '')),
  [Commands.setPatchColorCurrentLine]: (c) => c.setPatchColorCurrentLine(),
  [Commands.removeCurrentLineHighlight]: (c) => c.removeCurrentLineHighlight(),
};

/**
 * 注册全部 pentimento.* 命令。
 * 已实现的命令接入 controller;其余为占位。
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  logger: LogService,
  controller: HighlightController,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.openOutputLog, () => {
      logger.show();
    }),
  );

  for (const [id, title] of COMMAND_DEFS) {
    const handler = REAL_HANDLERS[id];
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        if (handler) {
          await handler(controller, ...args);
        } else {
          logger.debug(`command stub invoked: ${id}`, { argCount: args.length });
          await vscode.window.showInformationMessage(
            `Pentimento: "${title}" 将在后续阶段实现。`,
          );
        }
      }),
    );
  }
}
