import * as vscode from 'vscode';
import { ConfigKeys, ContextKeys, VIEW_ID } from './constants';
import { LogService, type LogLevel } from './utils/logging';
import { registerCommands } from './commands/commandRegistry';
import { PatchFilesTreeProvider } from './tree/patchFilesTreeProvider';
import { GitRunner } from './git/gitRunner';
import { detectGitVersion, formatVersion, isSupported } from './git/gitVersion';
import { RepositoryResolver } from './git/repositoryResolver';
import { RevisionResolver } from './git/revisionResolver';
import { CommitProvider } from './git/commitProvider';
import { BlameProvider } from './git/blameProvider';
import { PatchService } from './patch/patchService';
import { GitCommitHoverProvider } from './hover/gitCommitHoverProvider';
import { DecorationManager, decorationConfigFromSettings } from './highlight/decorationManager';
import { HighlightSessionManager } from './highlight/highlightSessionManager';
import { HighlightController } from './highlight/highlightController';
import { EditorTracker } from './highlight/editorTracker';
import { WorktreeManager } from './git/worktreeManager';
import { WorktreeMetadataStore } from './worktree/worktreeMetadataStore';
import { FetchService } from './git/fetchService';

/**
 * Pentimento 扩展入口。
 *
 * 阶段 6:接入完整服务链(Repository/Revision/Commit/Blame/Patch/Hover/Highlight),
 * 实现当前 HEAD 精确高亮、多文件、Hunk 导航、命令真实 handler。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new LogService();
  context.subscriptions.push(logger);

  const applyLogLevel = () => {
    const level = vscode.workspace
      .getConfiguration()
      .get<LogLevel>(ConfigKeys.loggingLevel, 'info');
    logger.setLevel(level);
  };
  applyLogLevel();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigKeys.loggingLevel)) {
        applyLogLevel();
      }
    }),
  );

  await vscode.commands.executeCommand('setContext', ContextKeys.enabled, true);
  await vscode.commands.executeCommand('setContext', ContextKeys.hasActivePatches, false);
  await vscode.commands.executeCommand('setContext', ContextKeys.exactWorkspace, false);

  // Git 配置 + GitRunner
  const gitSection = vscode.workspace.getConfiguration('pentimento.git');
  const git = new GitRunner(
    {
      timeout: gitSection.get<number>('timeout', 30000),
      maxOutputBytes: gitSection.get<number>('maxOutputBytes', 52428800),
      maxConcurrent: gitSection.get<number>('maxConcurrentCommands', 4),
    },
    logger,
  );
  void detectGitVersion(git).then((info) => {
    if (info.available && info.version) {
      if (isSupported(info.version)) {
        logger.info(`git detected: ${formatVersion(info.version)}`);
      } else {
        logger.warn(`git version ${formatVersion(info.version)} is below supported minimum 2.20`);
      }
    } else {
      logger.warn('git not available or version undetectable');
    }
  });

  // 服务
  const repoResolver = new RepositoryResolver(git);
  const revisionResolver = new RevisionResolver(git);
  const commitProvider = new CommitProvider(git);
  const blameProvider = new BlameProvider(git);
  const patchService = new PatchService(git);
  const sessionManager = new HighlightSessionManager();
  const decorationManager = new DecorationManager(
    decorationConfigFromSettings(vscode.workspace.getConfiguration('pentimento')),
  );
  context.subscriptions.push(decorationManager);
  const storageRoot = context.globalStorageUri.fsPath;
  const worktreeManager = new WorktreeManager(git, storageRoot);
  const metadataStore = new WorktreeMetadataStore(storageRoot);
  const fetchService = new FetchService(git);

  // 树视图
  const treeProvider = new PatchFilesTreeProvider(sessionManager);
  context.subscriptions.push(vscode.window.registerTreeDataProvider(VIEW_ID, treeProvider));

  // 高亮控制器 + 编辑器跟踪
  const controller = new HighlightController(
    git,
    repoResolver,
    revisionResolver,
    commitProvider,
    blameProvider,
    patchService,
    sessionManager,
    decorationManager,
    treeProvider,
    logger,
    worktreeManager,
    metadataStore,
    fetchService,
    storageRoot,
  );
  context.subscriptions.push(controller);
  const editorTracker = new EditorTracker(controller);
  context.subscriptions.push(editorTracker);

  // Hover
  const hoverProvider = new GitCommitHoverProvider(repoResolver, blameProvider);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
  );

  // 命令
  registerCommands(context, logger, controller);

  // 配置变化:刷新 hover 配置 + 重建 Decoration 样式
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pentimento.hover')) {
        hoverProvider.refreshConfig();
      }
      if (e.affectsConfiguration('pentimento.blame')) {
        hoverProvider.refreshConfig();
        controller.refreshBlameOpts();
      }
      if (e.affectsConfiguration('pentimento.highlight')) {
        decorationManager.setConfig(
          decorationConfigFromSettings(vscode.workspace.getConfiguration('pentimento')),
        );
        void controller.applyVisibleEditors();
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      hoverProvider.invalidateDocument(doc.uri);
    }),
  );

  // 受控后台 autoFetch(可配置开关与间隔)
  let autoFetchTimer: ReturnType<typeof setInterval> | undefined;
  const setupAutoFetch = (): void => {
    if (autoFetchTimer) {
      clearInterval(autoFetchTimer);
      autoFetchTimer = undefined;
    }
    const afSection = vscode.workspace.getConfiguration('pentimento.git.autoFetch');
    const enabled = afSection.get<boolean>('enabled', false);
    const intervalMin = afSection.get<number>('intervalMinutes', 30);
    if (enabled && intervalMin > 0) {
      autoFetchTimer = setInterval(() => {
        void controller.fetchAndRefresh();
      }, intervalMin * 60 * 1000);
      logger.info(`autoFetch enabled: every ${intervalMin} min`);
    }
  };
  setupAutoFetch();
  context.subscriptions.push({
    dispose: () => {
      if (autoFetchTimer) {
        clearInterval(autoFetchTimer);
      }
    },
  });
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pentimento.git.autoFetch')) {
        setupAutoFetch();
      }
    }),
  );

  void controller.restoreExactWorkspaceIfApplicable();
  logger.info('Pentimento activated (stage 9: worktree + exact workspace ready)');
}

export function deactivate(): void {
  // 后续阶段在此取消 GitRunner 后台任务与清理 worktree。
}
