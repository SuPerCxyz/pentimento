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
import type { PatchSelection } from '../patch/models';
import { findSurvivingRanges } from '../patch/survivingLineMapper';
import { WorktreeManager, type ExactPatchWorkspace, worktreePathFor } from '../git/worktreeManager';
import type { WorktreeMetadataStore } from '../worktree/worktreeMetadataStore';
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
} from './repositoryHighlightSession';
import { ContextKeys, ConfigKeys, DEFAULT_MAX_ACTIVE_PATCHES } from '../constants';
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
  private readonly blameCache = new Map<string, BlameLine[]>();
  private readonly targetCommitsCache = new Map<string, Set<string>>();
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
      await this.reportError(e, '解析 Revision 失败');
      return;
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
    await this.applyVisibleEditors();
    this.updateChrome();
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
      const file = layer.patch.files.find((f) => f.newPath === rel || f.oldPath === rel);
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
      }
    }

    const entries = this.membership.entries(uri);
    const slotRanges = new Map<number, vscode.Range[]>();
    const overlap: vscode.Range[] = [];
    const modified: vscode.Range[] = [];
    const ambiguous: vscode.Range[] = [];

    for (const e of entries) {
      const composed = composeLine(e.memberships, session.primaryPatchId);
      const range = new vscode.Range(e.line - 1, 0, e.line - 1, 0);
      if (composed.style === 'single-patch') {
        const layer = session.patchLayers.get(composed.patchIds[0]);
        if (layer) {
          const arr = slotRanges.get(layer.colorSlot) ?? [];
          arr.push(range);
          slotRanges.set(layer.colorSlot, arr);
        }
      } else if (composed.style === 'multi-patch-overlap') {
        overlap.push(range);
      } else if (composed.style === 'modified') {
        modified.push(range);
      } else {
        ambiguous.push(range);
      }
    }

    for (const [slot, ranges] of slotRanges) {
      this.decorationManager.apply(editor, this.decorationManager.getLayerType(slot), ranges);
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
    const key = `${repoRoot}::${head}::${doc.uri.fsPath}::${doc.version}`;
    const cached = this.blameCache.get(key);
    if (cached) {
      return cached;
    }
    const blame = await this.blameProvider.blameFile(repoRoot, doc.uri.fsPath, this.blameOpts);
    this.blameCache.set(key, blame);
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
    const items = parents.map((p, i) => ({ label: `Parent ${i + 1}: ${p.slice(0, 8)}`, value: p }));
    items.push({ label: '取消', value: '' });
    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: 'Pentimento: 该提交为 Merge commit,请选择 Patch 比较基准',
    });
    if (!choice || choice.value === '') {
      return undefined;
    }
    return choice.value;
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
      this.statusItem.text = `Pentimento: ${totalPatches} patch${totalPatches > 1 ? 'es' : ''} · ${totalFiles} files · ${totalLines} lines`;
      this.statusItem.show();
    } else {
      this.statusItem.hide();
    }
    this.treeProvider.refresh();
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
    this.statusItem.dispose();
  }
}
