import * as vscode from 'vscode';
import { ConfigKeys, ContextKeys, VIEW_ID } from './constants';
import { LogService, type LogLevel } from './utils/logging';
import { registerCommands } from './commands/commandRegistry';
import { PatchFilesTreeProvider } from './tree/patchFilesTreeProvider';
import { GitRunner } from './git/gitRunner';
import { detectGitVersion, formatVersion, isSupported } from './git/gitVersion';
import { RepositoryResolver } from './git/repositoryResolver';
import { BlameProvider } from './git/blameProvider';
import { GitCommitHoverProvider } from './hover/gitCommitHoverProvider';

/**
 * Pentimento 扩展入口。
 *
 * 阶段 3:接入 RepositoryResolver / BlameProvider / GitCommitHoverProvider,
 * 提供行级 Git Hover(与 GitLens 共存)。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new LogService();
  context.subscriptions.push(logger);

  // 配置日志级别并跟随变更
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

  // context key 初始状态
  await vscode.commands.executeCommand('setContext', ContextKeys.enabled, true);
  await vscode.commands.executeCommand('setContext', ContextKeys.hasActivePatches, false);
  await vscode.commands.executeCommand('setContext', ContextKeys.exactWorkspace, false);

  // 树视图
  const treeProvider = new PatchFilesTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(VIEW_ID, treeProvider),
  );

  // 命令
  registerCommands(context, logger);

  // GitRunner 初始化(依据配置)+ 后台版本检测
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
        logger.warn(
          `git version ${formatVersion(info.version)} is below supported minimum 2.20`,
        );
      }
    } else {
      logger.warn('git not available or version undetectable');
    }
  });

  // 阶段 3:Repository / Blame / Hover
  const repoResolver = new RepositoryResolver(git);
  const blameProvider = new BlameProvider(git);
  const hoverProvider = new GitCommitHoverProvider(repoResolver, blameProvider);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pentimento.hover') || e.affectsConfiguration('pentimento.blame')) {
        hoverProvider.refreshConfig();
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      hoverProvider.invalidateDocument(doc.uri);
    }),
  );

  logger.info('Pentimento activated (stage 3: hover ready)');
}

export function deactivate(): void {
  // 后续阶段在此取消 GitRunner 后台任务与清理 worktree。
}
