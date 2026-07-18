import * as vscode from 'vscode';
import * as path from 'path';
import type { IGitRunner } from '../git/gitRunner';
import type { RepositoryResolver, Repository } from '../git/repositoryResolver';
import type { RevisionResolver, ResolvedRevision } from '../git/revisionResolver';
import { EMPTY_TREE_HASH } from '../git/revisionResolver';
import type { CommitProvider } from '../git/commitProvider';
import type { BlameProvider, BlameOptions } from '../git/blameProvider';
import type { BlameLine } from '../git/blameParser';
import { PatchService } from '../patch/patchService';
import type { PatchSelection, HistoricalPatchViewMode } from '../patch/models';
import { findSurvivingRanges } from '../patch/survivingLineMapper';
import { projectRanges } from '../patch/projectedFootprintMapper';
import { resolveHistoricalPaths } from '../git/pathEvolutionResolver';
import type { PatchLineMembership } from './lineMembershipIndex';
import { WorktreeManager, type ExactPatchWorkspace, worktreePathFor } from '../git/worktreeManager';
import type { WorktreeMetadataStore } from '../worktree/worktreeMetadataStore';
import { SessionMetadataStore, type PersistedPatch } from './sessionMetadataStore';
import { BlameCacheStore } from './blameCacheStore';
import type { PatchHighlightLayer } from './patchHighlightLayer';
import type { FetchService } from '../git/fetchService';
import { openExactWorkspace } from '../ui/exactWorkspaceLauncher';
import { parseParents } from '../git/commitProvider';
import { HighlightSessionManager } from './highlightSessionManager';
import { LineMembershipIndex } from './lineMembershipIndex';
import { DecorationManager } from './decorationManager';
import { composeLine } from './decorationComposer';
import {
  addPatch,
  removePatch,
  clearAll as clearSession,
  showOnly,
  showAll as showAllLayers,
  hideAll as hideAllLayers,
  setLayerColor,
  setLayerEnabled,
  setPrimary,
  type RepositoryHighlightSession,
} from './repositoryHighlightSession';
import { ContextKeys, ConfigKeys, DEFAULT_MAX_ACTIVE_PATCHES, PATCH_COLOR_PRESETS, isValidHexColor, VIEW_ID } from '../constants';
import type { LogService } from '../utils/logging';
import type { PatchFilesTreeProvider } from '../tree/patchFilesTreeProvider';
import { GitError, toUserMessage } from '../git/gitErrors';

/**
 * 高亮编排控制器(阶段 6-8)。
 *
 * 坐标约束:
 * - exact-patch-revision:patchRevision == HEAD(或 working-tree/staged),文件干净;
 * - surviving-lines:历史祖先 commit,用当前 HEAD blame 归属,不用旧行号;
 * - 非 HEAD 且非祖先:提示精确 worktree(阶段 9)。
 */
export class HighlightController implements vscode.Disposable {
  private readonly membership = new LineMembershipIndex();
  private readonly statusItem: vscode.StatusBarItem;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private blamePersistTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly blameCache = new Map<string, BlameLine[]>();
  private readonly targetCommitsCache = new Map<string, Set<string>>();
  private readonly patchDisplayDiffCache = new Map<string, string>();
  private readonly pathEvolutionCache = new Map<string, string[]>();
  private blameOpts: BlameOptions = {
    ignoreWhitespace: false,
    detectMovedLines: true,
    detectCopiedLines: true,
  };

  constructor(
    private readonly git: IGitRunner,
    private readonly repoResolver: RepositoryResolver,
    private readonly revisionResolver: RevisionResolver,
    private readonly commitProvider: CommitProvider,
    private readonly blameProvider: BlameProvider,
    private readonly patchService: PatchService,
    private readonly sessionManager: HighlightSessionManager,
    private readonly decorationManager: DecorationManager,
    private readonly treeProvider: PatchFilesTreeProvider,
    private readonly logger: LogService,
    private readonly worktreeManager: WorktreeManager,
    private readonly metadataStore: WorktreeMetadataStore,
    private readonly sessionStore: SessionMetadataStore,
    private readonly blameStore: BlameCacheStore,
    private readonly fetchService: FetchService,
    private readonly storageRoot: string,
  ) {
    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusItem.command = 'pentimento.managePatches';
    this.refreshBlameOpts();
  }

  refreshBlameOpts(): void {
    const cfg = vscode.workspace.getConfiguration();
    this.blameOpts = {
      ignoreWhitespace: cfg.get<boolean>(ConfigKeys.blameIgnoreWhitespace, false),
      detectMovedLines: cfg.get<boolean>(ConfigKeys.blameDetectMovedLines, true),
      detectCopiedLines: cfg.get<boolean>(ConfigKeys.blameDetectCopiedLines, true),
    };
  }

  async addCommitFromHash(commitHash: string, replace = false): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以确定仓库。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      await vscode.window.showWarningMessage('Pentimento: 当前文件不在 Git 仓库中。');
      return;
    }

    let full: string;
    let head: string;
    try {
      full = await this.revParse(commitHash, repo.root);
      head = (await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })).trim();
    } catch (e) {
      await this.reportError(e, '解析提交失败');
      return;
    }
    const parent = await this.resolveBaseParent(full, repo);
    if (parent === undefined) {
      return; // 用户取消父提交选择
    }

    let summary = full.slice(0, 8);
    try {
      summary = (await this.commitProvider.getCommitInfo(full, repo.root)).summary;
    } catch {
      // 降级使用短哈希
    }

    await this.resolveAndAdd(repo, editor, full, parent, head, summary, replace);
  }

  async addRef(): Promise<void> {
    const input = await vscode.window.showInputBox({
      prompt: '输入 Commit / Range / Ref(如 HEAD、HEAD~1、abc123..def456、origin/main)',
      placeHolder: 'HEAD',
    });
    if (!input) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以确定仓库。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      await vscode.window.showWarningMessage('Pentimento: 当前文件不在 Git 仓库中。');
      return;
    }

    let resolved: ResolvedRevision;
    try {
      resolved = await this.revisionResolver.resolve(input, repo.root);
    } catch (e) {
      if (e instanceof GitError && e.code === 'invalid-revision' && input.startsWith('refs/')) {
        const choice = await vscode.window.showQuickPick(
          ['从远端 fetch 后重试', '取消'],
          { placeHolder: `Pentimento: 本地不存在「${input}」,是否从远端 fetch?` },
        );
        if (choice !== '从远端 fetch 后重试') {
          return;
        }
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Pentimento: 正在 fetch ${input}…`,
              cancellable: false,
            },
            () => this.fetchService.fetchRef(repo.root, input),
          );
        } catch (fe) {
          await this.reportError(fe, 'fetch 失败');
          return;
        }
        try {
          resolved = await this.revisionResolver.resolve(input, repo.root);
        } catch (e2) {
          await this.reportError(e2, 'fetch 后仍无法解析');
          return;
        }
      } else {
        await this.reportError(e, '解析 Revision 失败');
        return;
      }
    }

    let base: string;
    let patch: string;
    if (resolved.isRange) {
      base = resolved.baseHash;
      patch = resolved.patchHash;
    } else {
      base = (await this.tryParse(`${resolved.fullHash}^1`, repo.root)) ?? EMPTY_TREE_HASH;
      patch = resolved.fullHash;
    }

    const head = (await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })).trim();
    let summary = input;
    try {
      summary = (await this.commitProvider.getCommitInfo(patch, repo.root)).summary;
    } catch {
      // 降级
    }

    await this.resolveAndAdd(repo, editor, patch, base, head, summary, false);
  }

  async addWorkingTree(): Promise<void> {
    await this.addUncommitted('working-tree', 'Working Tree Changes');
  }

  async addStaged(): Promise<void> {
    await this.addUncommitted('staged', 'Staged Changes');
  }

  async clearAll(): Promise<void> {
    for (const session of this.sessionManager.allSessions()) {
      clearSession(session);
    }
    this.membership.clearAll();
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  async toggleHighlight(): Promise<void> {
    for (const session of this.sessionManager.allSessions()) {
      session.enabled = !session.enabled;
    }
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  async refresh(): Promise<void> {
    this.membership.clearAll();
    this.blameCache.clear();
    this.pathEvolutionCache.clear();
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  /**
   * 受控 fetch:fetch origin 后刷新当前仓库的高亮。
   * fetch 不切换分支、不修改工作区;完成后清缓存重 apply。
   */
  async fetchAndRefresh(): Promise<void> {
    const repoRoot = await this.resolveCurrentRepoRoot();
    if (!repoRoot) {
      await vscode.window.showWarningMessage('Pentimento: 未找到当前仓库,请先打开一个文件。');
      return;
    }
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pentimento: 正在 fetch origin…',
          cancellable: false,
        },
        () => this.fetchService.fetchOrigin(repoRoot),
      );
      this.blameCache.clear();
      this.targetCommitsCache.clear();
      this.patchDisplayDiffCache.clear();
      this.pathEvolutionCache.clear();
      this.membership.clearAll();
      await this.applyVisibleEditors();
      this.updateChrome();
      this.logger.info(`fetch 完成: ${repoRoot}`);
    } catch (e) {
      await this.reportError(e, 'fetch 失败');
    }
  }

  private async resolveCurrentRepoRoot(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
      if (repo) {
        return repo.root;
      }
    }
    const sessions = this.sessionManager.allSessions();
    return sessions[0]?.repositoryRoot;
  }

  async removeActivePatch(): Promise<void> {
    const session = this.currentSession();
    if (!session || !session.primaryPatchId) {
      return;
    }
    removePatch(session, session.primaryPatchId);
    this.membership.removePatch(session.primaryPatchId);
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  /**
   * 为某个 Patch 设置自定义颜色(覆盖图层默认色)。
   * 不传 patchId 时弹出 QuickPick 选择 Patch,再选颜色预设或自定义 hex。
   */
  async setPatchColor(patchId?: string): Promise<void> {
    const session = this.currentSession();
    if (!session || session.patchLayers.size === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前没有可设置颜色的 Patch。');
      return;
    }
    let targetId = patchId;
    if (!targetId || !session.patchLayers.has(targetId)) {
      const items = [...session.patchLayers.values()].map((l) => ({
        label: `${l.patch.selection.commitHash?.slice(0, 8) ?? ''} ${l.label}`.trim(),
        description: this.viewModeLabelOf(l.viewMode),
        patchId: l.patchId,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Pentimento: 选择要设置颜色的 Patch',
      });
      if (!picked) {
        return;
      }
      targetId = picked.patchId;
    }
    const layer = session.patchLayers.get(targetId);
    if (!layer) {
      return;
    }
    const clearItem: vscode.QuickPickItem = { label: '清除自定义颜色', description: '使用图层默认色' };
    const customItem: vscode.QuickPickItem = { label: '自定义 hex…' };
    const presetItems = PATCH_COLOR_PRESETS.map((p) => ({
      label: p.label,
      background: p.background,
      border: p.border,
    }));
    const colorPick = await vscode.window.showQuickPick([clearItem, ...presetItems, customItem], {
      placeHolder: `Pentimento: 为「${layer.label}」选择颜色`,
    });
    if (!colorPick) {
      return;
    }
    let customColor: { background: string; border: string } | undefined;
    if (colorPick === customItem) {
      const bg = await vscode.window.showInputBox({
        prompt: '输入背景 hex(如 #4ade8040)',
        validateInput: (v) => (isValidHexColor(v) ? undefined : '格式应为 #RGB / #RRGGBB / #RRGGBBAA'),
      });
      if (!bg) {
        return;
      }
      const border = await vscode.window.showInputBox({
        prompt: '输入边框 hex(如 #4ade80ff)',
        value: bg,
        validateInput: (v) => (isValidHexColor(v) ? undefined : '格式应为 #RGB / #RRGGBB / #RRGGBBAA'),
      });
      if (!border) {
        return;
      }
      customColor = { background: bg, border };
    } else if (colorPick === clearItem) {
      customColor = undefined;
    } else {
      const preset = presetItems.find((p) => p.label === colorPick.label);
      if (!preset) {
        return;
      }
      customColor = { background: preset.background, border: preset.border };
    }
    setLayerColor(session, targetId, customColor);
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  /**
   * 右键高亮当前行所在提交:QuickPick 选「仅存活行」或「精确 Patch(打开工作区)」。
   */
  async highlightLineCommit(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      return;
    }
    if (editor.document.isDirty) {
      await vscode.window.showWarningMessage('Pentimento: 请先保存当前文件以计算 blame。');
      return;
    }
    const lineIdx = editor.selection.active.line;
    let commitHash: string;
    try {
      const head = (
        await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })
      ).trim();
      const blame = await this.getCachedBlame(repo.root, head, editor.document);
      const bl = blame[lineIdx];
      if (!bl) {
        await vscode.window.showInformationMessage('Pentimento: 无法获取当前行提交。');
        return;
      }
      commitHash = bl.commitHash;
    } catch {
      await vscode.window.showWarningMessage('Pentimento: 无法获取当前行 blame。');
      return;
    }
    const modes = [
      { label: '仅高亮存活行(当前版本仍存活)', value: 'surviving' },
      { label: '切换到提交时 Patch(精确新增,打开工作区)', value: 'exact' },
    ];
    const pick = await vscode.window.showQuickPick(modes, {
      placeHolder: `Pentimento: 选择「${commitHash.slice(0, 8)}」的高亮方式`,
    });
    if (!pick) {
      return;
    }
    if (pick.value === 'surviving') {
      await this.addCommitFromHash(commitHash, false);
    } else {
      await this.openExactPatchRevision(commitHash);
    }
  }

  /** 打开文件并跳转到指定行范围(Hunk 点击)。 */
  async revealHunk(file: string, startLine: number, endLine: number): Promise<void> {
    const uri = vscode.Uri.file(file);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const start = Math.max(0, startLine - 1);
    const end = Math.max(0, endLine - 1);
    editor.revealRange(new vscode.Range(start, 0, end, 0), vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(start, 0, start, 0);
  }

  /**
   * 切换某提交的高亮:未高亮则添加,已高亮则切换显隐。
   * 提交列表点击调用;变更后刷新提交列表以更新色块/状态。
   */
  async toggleCommitHighlight(commitHash: string): Promise<void> {
    const session = this.currentSession();
    if (session) {
      const layer = [...session.patchLayers.values()].find(
        (l) => l.patch.selection.commitHash === commitHash,
      );
      if (layer) {
        setLayerEnabled(session, layer.patchId, !layer.enabled);
        await this.applyVisibleEditors();
        this.updateChrome();
        await vscode.commands.executeCommand('pentimento.refreshCommits');
        return;
      }
    }
    await this.addCommitFromHash(commitHash, false);
    await vscode.commands.executeCommand('pentimento.refreshCommits');
  }

  private viewModeLabelOf(mode: HistoricalPatchViewMode): string {
    switch (mode) {
      case 'exact-patch-revision':
        return '精确';
      case 'surviving-lines':
        return '存活';
      case 'projected-footprint':
        return '投影';
    }
  }

  /** QuickPick 选择当前会话中的 Patch。 */
  private async pickPatch(
    session: RepositoryHighlightSession,
    placeHolder: string,
  ): Promise<PatchHighlightLayer | undefined> {
    const items = [...session.patchLayers.values()].map((l) => ({
      label: `${l.patch.selection.commitHash?.slice(0, 8) ?? '?'} ${l.label}`,
      description: this.viewModeLabelOf(l.viewMode),
      layer: l,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked?.layer;
  }

  /** 设某个 Patch 为主要 Patch。 */
  async setPrimaryPatchCommand(patchId?: string): Promise<void> {
    const session = this.currentSession();
    if (!session || session.patchLayers.size === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前没有活跃 Patch。');
      return;
    }
    const layer = patchId
      ? session.patchLayers.get(patchId)
      : await this.pickPatch(session, 'Pentimento: 选择要设为主要 Patch');
    if (!layer) {
      return;
    }
    setPrimary(session, layer.patchId);
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  /** 切换单个 Patch 的显隐。 */
  async togglePatchVisibilityCommand(patchId?: string): Promise<void> {
    const session = this.currentSession();
    if (!session || session.patchLayers.size === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前没有活跃 Patch。');
      return;
    }
    const layer = patchId
      ? session.patchLayers.get(patchId)
      : await this.pickPatch(session, 'Pentimento: 选择要切换显隐的 Patch');
    if (!layer) {
      return;
    }
    setLayerEnabled(session, layer.patchId, !layer.enabled);
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  /** 切换历史查看模式(surviving / projected;exact 请用「打开精确 Patch 版本」)。 */
  async switchHistoricalViewModeCommand(patchId?: string): Promise<void> {
    const session = this.currentSession();
    if (!session || session.patchLayers.size === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前没有活跃 Patch。');
      return;
    }
    const layer = patchId
      ? session.patchLayers.get(patchId)
      : await this.pickPatch(session, 'Pentimento: 选择要切换模式的 Patch');
    if (!layer) {
      return;
    }
    const sel = layer.patch.selection;
    if ((sel.type !== 'commit' && sel.type !== 'range') || !sel.patchRevision) {
      await vscode.window.showInformationMessage('Pentimento: 仅 Commit/Range 支持模式切换。');
      return;
    }
    const modes = [
      { label: '存活行(surviving)', value: 'surviving-lines' as const },
      { label: '投影到当前版本(projected)', value: 'projected-footprint' as const },
      { label: '精确 Patch 版本(exact,需 Patch==HEAD)', value: 'exact-patch-revision' as const },
    ];
    const pick = await vscode.window.showQuickPick(modes, {
      placeHolder: 'Pentimento: 选择查看模式',
    });
    if (!pick) {
      return;
    }
    const repo = await this.repoResolver.resolveRepository(session.repositoryRoot);
    if (!repo) {
      return;
    }
    if (pick.value === 'exact-patch-revision') {
      if (sel.patchRevision !== session.displayRevision) {
        await vscode.window.showInformationMessage(
          'Pentimento: exact 模式要求 Patch 版本 == 当前 HEAD,请使用「打开精确 Patch 版本」。',
        );
        return;
      }
      removePatch(session, layer.patchId);
      this.membership.removePatch(layer.patchId);
      await this.buildAndAddPatch(repo, { ...sel, viewMode: 'exact-patch-revision' }, false);
      return;
    }
    const head = (
      await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })
    ).trim();
    removePatch(session, layer.patchId);
    this.membership.removePatch(layer.patchId);
    await this.buildAndAddPatch(
      repo,
      { ...sel, viewMode: pick.value, displayRevision: head },
      false,
    );
  }

  /** 仅高亮当前文件(清空其他可见编辑器的高亮)。 */
  async highlightCurrentFile(): Promise<void> {
    const active = vscode.window.activeTextEditor;
    if (!active) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件。');
      return;
    }
    for (const e of vscode.window.visibleTextEditors) {
      if (e !== active) {
        this.decorationManager.clearEditor(e);
      }
    }
    await this.applyToEditor(active);
    this.updateChrome();
  }

  /** 高亮全部变更文件(对全部可见编辑器应用)。 */
  async highlightAllFiles(): Promise<void> {
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  /** 对当前行所属提交以存活行模式高亮(祖先 commit 自动用 surviving)。 */
  async highlightSurvivingLines(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      return;
    }
    if (editor.document.isDirty) {
      await vscode.window.showWarningMessage('Pentimento: 请先保存当前文件以计算 blame。');
      return;
    }
    const lineIdx = editor.selection.active.line;
    let blame: BlameLine[];
    try {
      const head = (
        await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })
      ).trim();
      blame = await this.getCachedBlame(repo.root, head, editor.document);
    } catch {
      await vscode.window.showWarningMessage('Pentimento: 无法获取当前行 blame。');
      return;
    }
    const bl = blame[lineIdx];
    if (!bl) {
      await vscode.window.showInformationMessage('Pentimento: 无法获取当前行提交。');
      return;
    }
    await this.addCommitFromHash(bl.commitHash, false);
  }

  /** 聚焦变更文件树视图。 */
  async showFiles(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  /** 管理面板:选择 Patch 后执行操作。 */
  async managePatches(): Promise<void> {
    const session = this.currentSession();
    if (!session || session.patchLayers.size === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前没有活跃 Patch。');
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      return;
    }
    const layer = await this.pickPatch(session, 'Pentimento: 选择要管理的 Patch');
    if (!layer) {
      return;
    }
    const actions = [
      { label: '设为主要 Patch', value: 'primary' },
      { label: layer.enabled ? '隐藏该 Patch' : '显示该 Patch', value: 'toggle' },
      { label: '设置颜色', value: 'color' },
      { label: '移除该 Patch', value: 'remove' },
      { label: '取消', value: '' },
    ];
    const pick = await vscode.window.showQuickPick(actions, {
      placeHolder: `Pentimento:${layer.label}`,
    });
    if (!pick || pick.value === '') {
      return;
    }
    switch (pick.value) {
      case 'primary':
        await this.setPrimaryPatchCommand(layer.patchId);
        break;
      case 'toggle':
        await this.togglePatchVisibilityCommand(layer.patchId);
        break;
      case 'color':
        await this.setPatchColor(layer.patchId);
        break;
      case 'remove':
        setPrimary(session, layer.patchId);
        removePatch(session, layer.patchId);
        this.membership.removePatch(layer.patchId);
        await this.applyVisibleEditors();
        this.updateChrome();
        break;
    }
  }

  /** 显示诊断信息:会话/缓存/仓库状态。 */
  async showDiagnostics(): Promise<void> {
    const sessions = this.sessionManager.allSessions();
    let patchCount = 0;
    let enabledCount = 0;
    for (const s of sessions) {
      for (const l of s.patchLayers.values()) {
        patchCount++;
        if (l.enabled) {
          enabledCount++;
        }
      }
    }
    const lines: string[] = [
      `会话数:${sessions.length}`,
      `Patch 总数:${patchCount}(启用 ${enabledCount})`,
      `blame 缓存:${this.blameCache.size}`,
      `target commits 缓存:${this.targetCommitsCache.size}`,
      `patch diff 缓存:${this.patchDisplayDiffCache.size}`,
      `path evolution 缓存:${this.pathEvolutionCache.size}`,
    ];
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
      if (repo) {
        try {
          const head = (
            await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })
          ).trim();
          lines.push(`当前仓库:${repo.root}`);
          lines.push(`HEAD:${head.slice(0, 12)}`);
        } catch {
          lines.push(`当前仓库:${repo.root}(HEAD 读取失败)`);
        }
      }
    }
    const items = lines.map((l) => ({ label: l }));
    await vscode.window.showQuickPick(items, {
      placeHolder: 'Pentimento: 诊断信息(按 Esc 关闭)',
      canPickMany: false,
    });
  }

  /** 关闭精确 Patch 工作区窗口并清理 worktree。 */
  async closeExactWorkspace(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前无打开的工作区。');
      return;
    }
    const wsPath = folders[0].uri.fsPath;
    const ws = await this.metadataStore.findByPath(wsPath);
    if (!ws) {
      await vscode.window.showInformationMessage('Pentimento: 当前窗口不是精确 Patch 工作区。');
      return;
    }
    try {
      const repo: Repository = {
        root: ws.repositoryRoot,
        repositoryId: ws.repositoryId,
        bare: false,
      };
      await this.worktreeManager.remove(repo, ws);
      await this.metadataStore.remove(ws.worktreePath);
    } catch (e) {
      await this.reportError(e, '关闭精确工作区失败');
      return;
    }
    await vscode.commands.executeCommand('setContext', ContextKeys.exactWorkspace, false);
    await vscode.commands.executeCommand('workbench.action.closeWindow');
  }

  async showOnlyPrimary(): Promise<void> {
    const session = this.currentSession();
    if (session?.primaryPatchId) {
      showOnly(session, session.primaryPatchId);
      await this.applyVisibleEditors();
      this.updateChrome();
    }
  }

  async showAll(): Promise<void> {
    for (const s of this.sessionManager.allSessions()) {
      showAllLayers(s);
    }
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  async hideAll(): Promise<void> {
    for (const s of this.sessionManager.allSessions()) {
      hideAllLayers(s);
    }
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  async nextHunk(): Promise<void> {
    await this.navigateHunk(1);
  }

  async previousHunk(): Promise<void> {
    await this.navigateHunk(-1);
  }

  async applyVisibleEditors(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('pentimento');
    const currentOnly = cfg.get<boolean>('highlight.currentFileOnlyByDefault', false);
    const editors =
      currentOnly && vscode.window.activeTextEditor
        ? [vscode.window.activeTextEditor]
        : vscode.window.visibleTextEditors;
    for (const editor of editors) {
      await this.applyToEditor(editor);
    }
  }

  private async addUncommitted(
    type: 'working-tree' | 'staged',
    displayName: string,
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以确定仓库。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      await vscode.window.showWarningMessage('Pentimento: 当前文件不在 Git 仓库中。');
      return;
    }
    if (editor.document.isDirty) {
      await vscode.window.showInformationMessage('Pentimento: 请先保存文件,再高亮未提交修改。');
      return;
    }
    let head: string;
    try {
      head = (await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })).trim();
    } catch (e) {
      await this.reportError(e, '解析 HEAD 失败');
      return;
    }
    const selection: PatchSelection = {
      repositoryRoot: repo.root,
      type,
      displayRevision: head,
      displayName,
      viewMode: 'exact-patch-revision',
    };
    await this.buildAndAddPatch(repo, selection, false);
  }

  private async resolveAndAdd(
    repo: Repository,
    editor: vscode.TextEditor,
    full: string,
    parent: string,
    head: string,
    displayName: string,
    replace: boolean,
  ): Promise<void> {
    let viewMode: 'exact-patch-revision' | 'surviving-lines';
    if (full === head) {
      const clean = await this.isFileClean(repo, editor.document);
      if (!clean || editor.document.isDirty) {
        await vscode.window.showInformationMessage(
          'Pentimento: 当前文件包含未提交 / 未保存修改,精确高亮不可用。请保存或使用存活行模式。',
        );
        return;
      }
      viewMode = 'exact-patch-revision';
    } else {
      const ancestor = await this.isAncestor(full, head, repo.root);
      if (!ancestor) {
        await vscode.window.showQuickPick(
          ['打开该 Patch 的精确版本(阶段 9)', '取消'],
          {
            placeHolder:
              'Pentimento: 目标 Patch 不在当前分支祖先链上,无法可靠映射到当前版本。',
          },
        );
        return;
      }
      viewMode = 'surviving-lines';
    }
    const selection: PatchSelection = {
      repositoryRoot: repo.root,
      type: 'commit',
      baseRevision: parent,
      patchRevision: full,
      displayRevision: head,
      commitHash: full,
      displayName,
      viewMode,
    };
    await this.buildAndAddPatch(repo, selection, replace);
  }

  private async buildAndAddPatch(
    repo: Repository,
    selection: PatchSelection,
    replace: boolean,
  ): Promise<void> {
    let patch;
    try {
      patch = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pentimento: 正在分析 Patch…',
          cancellable: false,
        },
        () => this.patchService.buildPatch(selection),
      );
    } catch (e) {
      await this.reportError(e, '解析 Patch 失败');
      return;
    }
    const session = this.sessionManager.getOrCreateSession(repo.root, selection.displayRevision ?? '');
    const res = addPatch(session, repo.repositoryId, patch, {
      replace,
      maxActive: DEFAULT_MAX_ACTIVE_PATCHES,
    });
    if (res.reason === 'limit-exceeded') {
      await vscode.window.showWarningMessage(
        `Pentimento: 已达上限(${DEFAULT_MAX_ACTIVE_PATCHES})个 Patch,请先隐藏或移除已有 Patch。`,
      );
      return;
    }
    if (res.reason === 'display-revision-mismatch') {
      await vscode.window.showWarningMessage('Pentimento: 目标 Patch 的显示版本与当前会话不一致。');
      return;
    }
    await this.applyVisibleEditors();
    this.updateChrome();
  }

  private async applyToEditor(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const repo = await this.repoResolver.resolveRepository(doc.uri.fsPath);
    this.decorationManager.clearEditor(editor);
    if (!repo) {
      return;
    }
    const session = this.sessionManager.getSession(repo.root);
    if (!session || !session.enabled || session.patchLayers.size === 0) {
      return;
    }
    const rel = path.relative(repo.root, doc.uri.fsPath);
    const uri = doc.uri.toString();

    this.membership.clearDocument(uri);
    for (const layer of session.patchLayers.values()) {
      if (!layer.enabled) {
        continue;
      }
      let file = layer.patch.files.find((f) => f.newPath === rel || f.oldPath === rel);
      if (!file) {
        // pathEvolution:文件可能已被 rename,查历史路径关联
        const historical = await this.getHistoricalPaths(repo.root, rel);
        if (historical.length > 0) {
          file = layer.patch.files.find(
            (f) =>
              (f.newPath !== undefined && historical.includes(f.newPath)) ||
              (f.oldPath !== undefined && historical.includes(f.oldPath)),
          );
        }
      }
      if (!file) {
        continue;
      }
      if (layer.viewMode === 'exact-patch-revision') {
        const sel = layer.patch.selection;
        const applicable =
          sel.type === 'commit' || sel.type === 'range'
            ? sel.patchRevision === session.displayRevision
            : sel.type === 'working-tree' || sel.type === 'staged';
        if (!applicable) {
          continue;
        }
        if (doc.isDirty) {
          continue; // 未保存文档保护
        }
        this.membership.applyRanges(uri, layer.patchId, file.originalAddedRanges, 'exact', 'high');
      } else if (layer.viewMode === 'surviving-lines') {
        if (doc.isDirty) {
          continue; // blame on dirty 文档不可靠
        }
        try {
          const blame = await this.getCachedBlame(repo.root, session.displayRevision, doc);
          const targets = await this.getTargetCommits(layer, repo.root);
          const ranges = findSurvivingRanges(blame, targets);
          this.membership.applyRanges(uri, layer.patchId, ranges, 'surviving', 'high');
        } catch {
          // blame 失败(二进制等)跳过
        }
      } else if (layer.viewMode === 'projected-footprint') {
        if (doc.isDirty) {
          continue;
        }
        const patchRev = layer.patch.selection.patchRevision;
        if (!patchRev) {
          continue;
        }
        const filePath = file.newPath ?? file.oldPath;
        if (!filePath) {
          continue;
        }
        try {
          const diff = await this.getCachedPatchDisplayDiff(repo.root, patchRev, session.displayRevision, filePath);
          const projected = projectRanges(diff, file.originalAddedRanges);
          for (const p of projected) {
            if (p.status === 'deleted' || p.currentStartLine === undefined || p.currentEndLine === undefined) {
              continue;
            }
            const mstatus: PatchLineMembership['status'] =
              p.status === 'modified'
                ? 'modified'
                : p.status === 'moved'
                  ? 'moved'
                  : p.status === 'ambiguous'
                    ? 'ambiguous'
                    : 'surviving';
            this.membership.applyRanges(
              uri,
              layer.patchId,
              [{ startLine: p.currentStartLine, endLine: p.currentEndLine }],
              mstatus,
              p.confidence,
            );
          }
        } catch {
          // 投影失败跳过
        }
      }
    }

    const entries = this.membership.entries(uri);
    const layerRanges = new Map<string, vscode.Range[]>();
    const overlap: vscode.Range[] = [];
    const modified: vscode.Range[] = [];
    const ambiguous: vscode.Range[] = [];

    for (const e of entries) {
      const composed = composeLine(e.memberships, session.primaryPatchId);
      const range = new vscode.Range(e.line - 1, 0, e.line - 1, 0);
      if (composed.style === 'single-patch') {
        const layer = session.patchLayers.get(composed.patchIds[0]);
        if (layer) {
          const arr = layerRanges.get(layer.patchId) ?? [];
          arr.push(range);
          layerRanges.set(layer.patchId, arr);
        }
      } else if (composed.style === 'multi-patch-overlap') {
        overlap.push(range);
      } else if (composed.style === 'modified') {
        modified.push(range);
      } else {
        ambiguous.push(range);
      }
    }

    for (const [patchId, ranges] of layerRanges) {
      const layer = session.patchLayers.get(patchId);
      if (layer) {
        this.decorationManager.apply(
          editor,
          this.decorationManager.getLayerType(layer.colorSlot, layer.customColor),
          ranges,
        );
      }
    }
    if (overlap.length) {
      this.decorationManager.apply(editor, this.decorationManager.getSpecialType('overlap'), overlap);
    }
    if (modified.length) {
      this.decorationManager.apply(editor, this.decorationManager.getSpecialType('modified'), modified);
    }
    if (ambiguous.length) {
      this.decorationManager.apply(editor, this.decorationManager.getSpecialType('ambiguous'), ambiguous);
    }
  }

  private async navigateHunk(direction: 1 | -1): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const uri = editor.document.uri.toString();
    const entries = this.membership.entries(uri).sort((a, b) => a.line - b.line);
    if (entries.length === 0) {
      return;
    }
    const cursorLine = editor.selection.active.line + 1;
    const target =
      direction > 0
        ? entries.find((e) => e.line > cursorLine)
        : [...entries].reverse().find((e) => e.line < cursorLine);
    if (target) {
      const pos = new vscode.Position(target.line - 1, 0);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(pos, pos);
    }
  }

  private currentSession() {
    const sessions = this.sessionManager.allSessions();
    return sessions.length > 0 ? sessions[0] : undefined;
  }

  private async isFileClean(repo: Repository, doc: vscode.TextDocument): Promise<boolean> {
    try {
      const rel = path.relative(repo.root, doc.uri.fsPath);
      const out = await this.git.runText(['status', '--porcelain', '--', rel], {
        repositoryRoot: repo.root,
      });
      return out.trim() === '';
    } catch {
      return false;
    }
  }

  private async revParse(rev: string, repo: string): Promise<string> {
    return (await this.git.runText(['rev-parse', '--verify', `${rev}^{commit}`], { repositoryRoot: repo })).trim();
  }

  private async tryParse(rev: string, repo: string): Promise<string | undefined> {
    try {
      return await this.revParse(rev, repo);
    } catch {
      return undefined;
    }
  }

  private async isAncestor(ancestor: string, descendant: string, repo: string): Promise<boolean> {
    try {
      await this.git.run(['merge-base', '--is-ancestor', ancestor, descendant], { repositoryRoot: repo });
      return true;
    } catch {
      return false;
    }
  }

  private async getTargetCommits(
    layer: { patchId: string; patch: { selection: PatchSelection } },
    repoRoot: string,
  ): Promise<Set<string>> {
    const sel = layer.patch.selection;
    if (sel.type === 'commit' && sel.patchRevision) {
      return new Set([sel.patchRevision]);
    }
    if (sel.type === 'range') {
      const cached = this.targetCommitsCache.get(layer.patchId);
      if (cached) {
        return cached;
      }
      const out = await this.git.runText(['rev-list', sel.baseRevision!, sel.patchRevision!], {
        repositoryRoot: repoRoot,
      });
      const set = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
      this.targetCommitsCache.set(layer.patchId, set);
      return set;
    }
    return new Set();
  }

  private async getCachedBlame(
    repoRoot: string,
    head: string,
    doc: vscode.TextDocument,
  ): Promise<BlameLine[]> {
    const rel = path.relative(repoRoot, doc.uri.fsPath);
    let blobHash = '';
    try {
      blobHash = (
        await this.git.runText(['rev-parse', `${head}:${rel}`], { repositoryRoot: repoRoot })
      ).trim();
    } catch {
      // 新文件/二进制等无 blob:blobHash 留空,key 仍唯一(rel + head)
    }
    const key = `${repoRoot}::${head}::${rel}::${blobHash}`;
    const cached = this.blameCache.get(key);
    if (cached) {
      return cached;
    }
    const blame = await this.blameProvider.blameFile(repoRoot, doc.uri.fsPath, this.blameOpts);
    this.blameCache.set(key, blame);
    this.scheduleBlamePersist();
    return blame;
  }

  async openExactPatchRevision(commitHash?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以确定仓库。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      await vscode.window.showWarningMessage('Pentimento: 当前文件不在 Git 仓库中。');
      return;
    }
    let full: string;
    if (commitHash) {
      try {
        full = await this.revParse(commitHash, repo.root);
      } catch (e) {
        await this.reportError(e, '解析提交失败');
        return;
      }
    } else {
      const session = this.currentSession();
      const layer = session?.primaryPatchId ? session.patchLayers.get(session.primaryPatchId) : undefined;
      if (layer?.patch.selection.commitHash) {
        full = layer.patch.selection.commitHash!;
      } else {
        const input = await vscode.window.showInputBox({ prompt: 'Commit / Ref', placeHolder: 'HEAD' });
        if (!input) {
          return;
        }
        try {
          full = await this.revParse(input, repo.root);
        } catch (e) {
          await this.reportError(e, '解析提交失败');
          return;
        }
      }
    }
    const parent = await this.resolveBaseParent(full, repo);
    if (parent === undefined) {
      return;
    }
    let ws: ExactPatchWorkspace;
    try {
      ws = await this.worktreeManager.createOrReuse(repo, full, parent);
    } catch (e) {
      await this.reportError(e, '创建精确 Patch 工作区失败');
      return;
    }
    await this.metadataStore.upsert(ws);
    await openExactWorkspace(ws.worktreePath);
  }

  async removePrimaryWorktree(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以确定仓库。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      return;
    }
    const session = this.sessionManager.getSession(repo.root);
    const layer = session?.primaryPatchId ? session.patchLayers.get(session.primaryPatchId) : undefined;
    const patchHash = layer?.patch.selection.patchRevision;
    if (!patchHash) {
      await vscode.window.showInformationMessage('Pentimento: 无可移除的精确 Patch worktree。');
      return;
    }
    const ws: ExactPatchWorkspace = {
      repositoryRoot: repo.root,
      repositoryId: repo.repositoryId,
      worktreePath: worktreePathFor(this.storageRoot, repo.repositoryId, patchHash),
      baseRevision: layer!.patch.selection.baseRevision ?? '',
      patchRevision: patchHash,
      createdAt: 0,
      lastOpenedAt: 0,
      vscodeWorkspaceOpened: false,
    };
    try {
      await this.worktreeManager.remove(repo, ws);
      await this.metadataStore.remove(ws.worktreePath);
    } catch (e) {
      await this.reportError(e, '移除 worktree 失败');
    }
  }

  async cleanStaleWorktrees(): Promise<void> {
    const list = await this.metadataStore.load();
    let removed = 0;
    for (const ws of list) {
      const repo: Repository = { root: ws.repositoryRoot, repositoryId: ws.repositoryId, bare: false };
      try {
        await this.worktreeManager.remove(repo, ws);
        await this.metadataStore.remove(ws.worktreePath);
        removed++;
      } catch {
        // 跳过无效项
      }
    }
    await vscode.window.showInformationMessage(`Pentimento: 清理了 ${removed} 个残留 worktree。`);
  }

  /** 在精确 Patch worktree 窗口激活时,自动恢复高亮。 */
  async restoreExactWorkspaceIfApplicable(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return;
    }
    const wsPath = folders[0].uri.fsPath;
    const ws = await this.metadataStore.findByPath(wsPath);
    if (!ws) {
      return;
    }
    await vscode.commands.executeCommand('setContext', ContextKeys.exactWorkspace, true);
    const repo = await this.repoResolver.resolveRepository(wsPath);
    if (!repo) {
      return;
    }
    const parent = await this.resolveBaseParent(ws.patchRevision, repo);
    if (parent === undefined) {
      return;
    }
    const selection: PatchSelection = {
      repositoryRoot: repo.root,
      type: 'commit',
      baseRevision: parent,
      patchRevision: ws.patchRevision,
      displayRevision: ws.patchRevision,
      commitHash: ws.patchRevision,
      displayName: `Exact: ${ws.patchRevision.slice(0, 8)}`,
      viewMode: 'exact-patch-revision',
    };
    await this.buildAndAddPatch(repo, selection, false);
  }

  /**
   * 恢复持久化的高亮会话(activate 时调用)。
   * exact-patch-revision 不在此恢复(由 worktree 恢复);其余按 selection 重建。
   */
  async restoreSessions(): Promise<void> {
    let data: Record<string, PersistedPatch[]>;
    try {
      data = await this.sessionStore.load();
    } catch {
      return;
    }
    const repos = Object.entries(data).filter(([, list]) => Array.isArray(list) && list.length > 0);
    if (repos.length === 0) {
      return;
    }
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pentimento: 正在恢复高亮会话…',
        cancellable: false,
      },
      async () => {
        for (const [repoRoot, list] of repos) {
          try {
            const repo = await this.repoResolver.resolveRepository(repoRoot);
            if (!repo) {
              continue;
            }
            const head = (
              await this.git.runText(['rev-parse', 'HEAD'], { repositoryRoot: repo.root })
            ).trim();
            for (const p of list) {
              const displayRevision =
                p.selection.viewMode === 'exact-patch-revision'
                  ? p.selection.displayRevision
                  : head;
              const sel: PatchSelection = { ...p.selection, displayRevision };
              try {
                const patch = await this.patchService.buildPatch(sel);
                const session = this.sessionManager.getOrCreateSession(
                  repo.root,
                  displayRevision ?? head,
                );
                const res = addPatch(session, repo.repositoryId, patch, {
                  maxActive: DEFAULT_MAX_ACTIVE_PATCHES,
                });
                if (res.layer) {
                  if (p.customColor) {
                    setLayerColor(session, res.layer.patchId, p.customColor);
                  }
                  if (!p.enabled) {
                    setLayerEnabled(session, res.layer.patchId, false);
                  }
                }
              } catch {
                // 单个 patch 恢复失败:跳过
              }
            }
          } catch {
            // 单个仓库恢复失败:跳过
          }
        }
        await this.applyVisibleEditors();
        this.updateChrome();
      },
    );
  }

  /** 防抖持久化当前会话(变更后 500ms 落盘)。 */
  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.persistSessionsNow();
    }, 500);
  }

  private async persistSessionsNow(): Promise<void> {
    const data: Record<string, PersistedPatch[]> = {};
    for (const s of this.sessionManager.allSessions()) {
      const list: PersistedPatch[] = [];
      for (const l of s.patchLayers.values()) {
        if (l.viewMode === 'exact-patch-revision') {
          continue; // exact 由 worktree 恢复
        }
        list.push({
          selection: l.selection,
          customColor: l.customColor,
          enabled: l.enabled,
        });
      }
      if (list.length > 0) {
        data[s.repositoryRoot] = list;
      }
    }
    try {
      await this.sessionStore.save(data);
    } catch (e) {
      this.logger.warn('persist sessions failed', e instanceof Error ? e.message : String(e));
    }
  }

  /** 恢复持久化的 blame 缓存到内存(activate 时调用)。 */
  async restoreBlameCache(): Promise<void> {
    try {
      const data = await this.blameStore.load();
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) {
          this.blameCache.set(k, v);
        }
      }
    } catch {
      // 加载失败忽略,运行时按需重算
    }
  }

  /** 防抖持久化 blame 缓存(变更后 2s 落盘,blame 数据较大)。 */
  private scheduleBlamePersist(): void {
    if (this.blamePersistTimer) {
      clearTimeout(this.blamePersistTimer);
    }
    this.blamePersistTimer = setTimeout(() => {
      this.blamePersistTimer = undefined;
      void this.persistBlameNow();
    }, 2000);
  }

  private async persistBlameNow(): Promise<void> {
    const data: Record<string, BlameLine[]> = {};
    for (const [k, v] of this.blameCache) {
      data[k] = v;
    }
    try {
      await this.blameStore.save(data);
    } catch (e) {
      this.logger.warn('persist blame cache failed', e instanceof Error ? e.message : String(e));
    }
  }

  /** 获取文件的历史路径(跟随 rename),缓存结果。 */
  private async getHistoricalPaths(repoRoot: string, rel: string): Promise<string[]> {
    const key = `${repoRoot}:${rel}`;
    const cached = this.pathEvolutionCache.get(key);
    if (cached) {
      return cached;
    }
    let paths: string[] = [];
    try {
      paths = await resolveHistoricalPaths(this.git, repoRoot, rel);
    } catch {
      paths = [];
    }
    this.pathEvolutionCache.set(key, paths);
    return paths;
  }

  /** 解析 commit 的父提交;merge commit 弹 QuickPick 选择,取消返回 undefined。 */
  private async resolveBaseParent(full: string, repo: Repository): Promise<string | undefined> {
    let parents: string[];
    try {
      const out = await this.git.runText(['rev-list', '--parents', '-n', '1', full], {
        repositoryRoot: repo.root,
      });
      const parsed = parseParents(out);
      parents = parsed?.parents ?? [];
    } catch {
      parents = [];
    }
    if (parents.length === 0) {
      return EMPTY_TREE_HASH;
    }
    if (parents.length === 1) {
      return parents[0];
    }
    // merge commit:选择父提交
    const items: { label: string; value: string }[] = parents.map((p, i) => ({
      label: `父提交 ${i + 1}:${p.slice(0, 8)}`,
      value: p,
    }));
    try {
      const mb = (
        await this.git.runText(['merge-base', parents[0], parents[1]], { repositoryRoot: repo.root })
      ).trim();
      if (mb) {
        items.push({ label: `Merge Base:${mb.slice(0, 8)}`, value: mb });
      }
    } catch {
      // 无 merge-base(理论上不发生)
    }
    items.push({ label: '取消', value: '' });
    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: 'Pentimento: 该提交为 Merge commit,请选择 Patch 比较基准',
    });
    if (!choice || choice.value === '') {
      return undefined;
    }
    return choice.value;
  }

  /** 把当前主要 Patch 以投影模式重新映射到当前版本。 */
  async projectOntoCurrentRevision(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以确定仓库。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      return;
    }
    const session = this.sessionManager.getSession(repo.root);
    if (!session?.primaryPatchId) {
      await vscode.window.showInformationMessage('Pentimento: 无主要 Patch 可投影。');
      return;
    }
    const layer = session.patchLayers.get(session.primaryPatchId);
    if (!layer) {
      return;
    }
    const sel = layer.patch.selection;
    if ((sel.type !== 'commit' && sel.type !== 'range') || !sel.patchRevision) {
      await vscode.window.showInformationMessage('Pentimento: 仅 Commit/Range 支持投影。');
      return;
    }
    if (sel.patchRevision === session.displayRevision) {
      await vscode.window.showInformationMessage('Pentimento: 当前 HEAD Patch 无需投影。');
      return;
    }
    removePatch(session, session.primaryPatchId);
    this.membership.removePatch(session.primaryPatchId);
    await this.buildAndAddPatch(repo, { ...sel, viewMode: 'projected-footprint' }, false);
  }

  /**
   * 显示当前活跃 Patch 的演化统计:模式/文件/增删行;
   * 对存活模式 Patch 额外计算当前文件的存活率(基于当前 HEAD blame)。
   */
  async showEvolutionSummary(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showWarningMessage('Pentimento: 请先打开一个文件以查看演化统计。');
      return;
    }
    const repo = await this.repoResolver.resolveRepository(editor.document.uri.fsPath);
    if (!repo) {
      return;
    }
    const session = this.sessionManager.getSession(repo.root);
    if (!session || session.patchLayers.size === 0) {
      await vscode.window.showInformationMessage('Pentimento: 当前没有活跃 Patch。');
      return;
    }
    const items = [...session.patchLayers.values()].map((l) => ({
      label: `${l.patch.selection.commitHash?.slice(0, 8) ?? '?'} ${l.label}`,
      description: this.viewModeLabelOf(l.viewMode),
      detail: `${l.patch.files.length} 文件 · +${l.patch.totalAddedLines} -${l.patch.totalDeletedLines}`,
      layer: l,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Pentimento: 选择 Patch 查看演化统计',
    });
    if (!picked) {
      return;
    }
    const layer = picked.layer;
    const statLines: string[] = [
      `Patch:${layer.patch.selection.commitHash?.slice(0, 8) ?? '?'} ${layer.label}`,
      `模式:${this.viewModeLabelOf(layer.viewMode)}`,
      `文件数:${layer.patch.files.length}`,
      `新增:+${layer.patch.totalAddedLines}  删除:-${layer.patch.totalDeletedLines}`,
    ];
    if (layer.viewMode === 'surviving-lines') {
      if (editor.document.isDirty) {
        statLines.push('');
        statLines.push('提示:请先保存当前文件,以计算存活统计。');
      } else {
        const rel = path.relative(repo.root, editor.document.uri.fsPath);
        const file = layer.patch.files.find((f) => f.newPath === rel || f.oldPath === rel);
        if (!file) {
          statLines.push('');
          statLines.push('当前文件不在该 Patch 中。');
        } else {
          const original = file.originalAddedRanges.reduce(
            (s, r) => s + (r.endLine - r.startLine + 1),
            0,
          );
          try {
            const blame = await this.getCachedBlame(
              repo.root,
              session.displayRevision,
              editor.document,
            );
            const targets = await this.getTargetCommits(layer, repo.root);
            const survivingRanges = findSurvivingRanges(blame, targets);
            const surviving = survivingRanges.reduce(
              (s, r) => s + (r.endLine - r.startLine + 1),
              0,
            );
            const pct = original > 0 ? Math.round((surviving / original) * 100) : 0;
            statLines.push('');
            statLines.push(`当前文件 ${rel}:`);
            statLines.push(`  原始新增 ${original} 行`);
            statLines.push(`  存活 ${surviving} 行(${pct}%)`);
            statLines.push(`  未存活 ${original - surviving} 行(被修改/删除/移动)`);
          } catch {
            statLines.push('');
            statLines.push('当前文件存活统计计算失败(blame 不可用)。');
          }
        }
      }
    }
    const statItems = statLines.map((l) => ({ label: l }));
    await vscode.window.showQuickPick(statItems, {
      placeHolder: 'Pentimento: Patch 演化统计(按 Esc 关闭)',
      canPickMany: false,
    });
  }

  private async getCachedPatchDisplayDiff(
    repoRoot: string,
    patchRevision: string,
    displayRevision: string,
    filePath: string,
  ): Promise<string> {
    const key = `${repoRoot}::${patchRevision}::${displayRevision}::${filePath}`;
    const cached = this.patchDisplayDiffCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const out = await this.git.runText(
      [
        'diff',
        '--unified=0',
        '--no-color',
        '--diff-algorithm=histogram',
        '--find-renames=50%',
        '--find-copies=50%',
        patchRevision,
        displayRevision,
        '--',
        filePath,
      ],
      { repositoryRoot: repoRoot },
    );
    this.patchDisplayDiffCache.set(key, out);
    return out;
  }

  private updateChrome(): void {
    const sessions = this.sessionManager.allSessions();
    let totalPatches = 0;
    let totalFiles = 0;
    let totalLines = 0;
    for (const s of sessions) {
      for (const l of s.patchLayers.values()) {
        if (!l.enabled) {
          continue;
        }
        totalPatches++;
        totalFiles += l.patch.files.length;
        totalLines += l.patch.totalAddedLines;
      }
    }
    const hasActive = totalPatches > 0;
    void vscode.commands.executeCommand('setContext', ContextKeys.hasActivePatches, hasActive);
    void vscode.commands.executeCommand(
      'setContext',
      ContextKeys.hasPrimaryPatch,
      !!sessions.find((s) => s.primaryPatchId),
    );
    if (hasActive) {
      this.statusItem.text = `Pentimento:${totalPatches} 个 Patch · ${totalFiles} 个文件 · ${totalLines} 行`;
      this.statusItem.show();
    } else {
      this.statusItem.hide();
    }
    this.treeProvider.refresh();
    this.schedulePersist();
  }

  private async reportError(e: unknown, prefix: string): Promise<void> {
    this.logger.error(prefix, e instanceof Error ? e.message : String(e));
    if (e instanceof GitError) {
      await vscode.window.showErrorMessage(`Pentimento: ${prefix}:${toUserMessage(e.code)}`);
    } else {
      await vscode.window.showErrorMessage(`Pentimento: ${prefix}`);
    }
  }

  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    if (this.blamePersistTimer) {
      clearTimeout(this.blamePersistTimer);
    }
    this.statusItem.dispose();
  }
}
