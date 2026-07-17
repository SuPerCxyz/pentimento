import * as vscode from 'vscode';
import { ConfigKeys } from '../constants';
import type { RepositoryResolver } from '../git/repositoryResolver';
import type { BlameProvider } from '../git/blameProvider';
import type { BlameLine } from '../git/blameParser';
import type { BlameOptions } from '../git/blameProvider';
import { buildHoverContent } from './hoverCommandBuilder';

/**
 * 行级 Git Commit Hover 提供者。
 *
 * 设计要点(见 docs/TECHNICAL_DESIGN.md 第 15 节):
 * - DocumentSelector 收窄为 { scheme: 'file' };
 * - 非文件 / 非 git 仓库 / 配置关闭时返回 undefined;
 * - 文件级 blame 缓存(键含 doc.version),in-flight 去重防止快速 hover 重复请求;
 * - 异步,await 后检查 CancellationToken;
 * - 是守规矩的 HoverProvider,不替换/覆盖其他 provider,与 GitLens 共存。
 */
export class GitCommitHoverProvider implements vscode.HoverProvider {
  private readonly cache = new Map<string, BlameLine[]>();
  private readonly inflight = new Map<string, Promise<BlameLine[]>>();

  private enabled = true;
  private mode: 'compact' | 'full' = 'compact';
  private blameOpts: BlameOptions = {
    ignoreWhitespace: false,
    detectMovedLines: true,
    detectCopiedLines: true,
  };

  constructor(
    private readonly repoResolver: RepositoryResolver,
    private readonly blameProvider: BlameProvider,
  ) {
    this.refreshConfig();
  }

  refreshConfig(): void {
    const cfg = vscode.workspace.getConfiguration();
    const mode = cfg.get<string>(ConfigKeys.hoverMode, 'compact');
    this.mode = mode === 'full' ? 'full' : 'compact';
    this.enabled =
      cfg.get<boolean>(ConfigKeys.hoverEnabled, true) && mode !== 'disabled';
    this.blameOpts = {
      ignoreWhitespace: cfg.get<boolean>(ConfigKeys.blameIgnoreWhitespace, false),
      detectMovedLines: cfg.get<boolean>(ConfigKeys.blameDetectMovedLines, true),
      detectCopiedLines: cfg.get<boolean>(ConfigKeys.blameDetectCopiedLines, true),
    };
  }

  invalidateDocument(uri: vscode.Uri): void {
    const path = uri.fsPath;
    for (const key of [...this.cache.keys()]) {
      if (key.includes(`::${path}::`)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async provideHover(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    if (!this.enabled || doc.uri.scheme !== 'file') {
      return undefined;
    }

    const repo = await this.repoResolver.resolveRepository(doc.uri.fsPath);
    if (!repo || token.isCancellationRequested) {
      return undefined;
    }

    let blame: BlameLine[];
    try {
      blame = await this.getOrLoadBlame(repo.root, doc);
    } catch {
      // blame 失败(如二进制文件、非 git 文件)时静默返回,不抛错给用户
      return undefined;
    }
    if (token.isCancellationRequested) {
      return undefined;
    }

    const line1 = pos.line + 1; // 0-based -> Git 1-based
    const bl = this.blameProvider.getLine(blame, line1);
    if (!bl) {
      return undefined;
    }

    const timeText = bl.isUncommitted ? '未提交' : relativeTime(bl.authorTimestamp);
    const content = buildHoverContent({
      shortHash: bl.shortHash,
      authorName: bl.authorName,
      timeText,
      summary: bl.summary,
      isUncommitted: bl.isUncommitted,
      // 阶段 5 接入 highlight session 后动态判断
      alreadyHighlighted: false,
      mode: this.mode,
    });

    const md = new vscode.MarkdownString(content, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.supportHtml = false;

    return new vscode.Hover(md, doc.lineAt(pos.line).range);
  }

  private cacheKey(repoRoot: string, doc: vscode.TextDocument): string {
    return `${repoRoot}::${doc.uri.fsPath}::${doc.version}`;
  }

  private async getOrLoadBlame(
    repoRoot: string,
    doc: vscode.TextDocument,
  ): Promise<BlameLine[]> {
    const key = this.cacheKey(repoRoot, doc);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const p = this.blameProvider
      .blameFile(repoRoot, doc.uri.fsPath, this.blameOpts)
      .then((b) => {
        this.cache.set(key, b);
        this.inflight.delete(key);
        return b;
      })
      .catch((e) => {
        this.inflight.delete(key);
        throw e;
      });
    this.inflight.set(key, p);
    return p;
  }
}

function relativeTime(timestamp: number): string {
  if (!timestamp) {
    return '';
  }
  const now = Date.now();
  const diff = Math.max(0, now - timestamp * 1000);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) {
    return `${sec} 秒前`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min} 分钟前`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr} 小时前`;
  }
  const day = Math.floor(hr / 24);
  if (day < 30) {
    return `${day} 天前`;
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}
