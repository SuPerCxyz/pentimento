import type { IGitRunner } from './gitRunner';
import { GitError, toUserMessage } from './gitErrors';

export interface GitCommitInfo {
  commitHash: string;
  shortHash: string;
  summary: string;
  authorName: string;
  authorEmail?: string;
  authorTimestamp: number;
  committerName?: string;
  committerTimestamp?: number;
}

/** git show -s 的格式:用 NUL 分隔字段,避免与字段内空格冲突。 */
export const COMMIT_FORMAT =
  '%H%x00%h%x00%an%x00%ae%x00%at%x00%cN%x00%ct%x00%s';

/** 解析 `git show -s --format=...` 输出。纯函数。 */
export function parseCommitShow(output: string): GitCommitInfo | undefined {
  const parts = (output ?? '').split('\0');
  if (parts.length < 8) {
    return undefined;
  }
  const authorTimestamp = Number(parts[4]);
  const committerTimestamp = parts[6] ? Number(parts[6]) : undefined;
  return {
    commitHash: parts[0].trim(),
    shortHash: parts[1].trim(),
    authorName: parts[2],
    authorEmail: parts[3] || undefined,
    authorTimestamp: Number.isFinite(authorTimestamp) ? authorTimestamp : 0,
    committerName: parts[5] || undefined,
    committerTimestamp: committerTimestamp && Number.isFinite(committerTimestamp)
      ? committerTimestamp
      : undefined,
    summary: parts[7].replace(/\n+$/, ''),
  };
}

/** 解析 `git log --format=COMMIT_FORMAT` 输出为提交列表。纯函数。 */
export function parseCommitList(output: string): GitCommitInfo[] {
  const result: GitCommitInfo[] = [];
  for (const line of (output ?? '').split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const info = parseCommitShow(line);
    if (info && info.commitHash) {
      result.push(info);
    }
  }
  return result;
}

/** 解析 `git rev-list --parents -n 1 <commit>` 输出,返回 commit 与其父提交列表。纯函数。 */
export function parseParents(revListParentsOutput: string): { commit: string; parents: string[] } | undefined {
  const line = (revListParentsOutput ?? '').trim().split('\n')[0]?.trim() ?? '';
  if (!line) {
    return undefined;
  }
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return { commit: parts[0], parents: parts.slice(1) };
}

/**
 * Commit 元数据提供者。
 * 用户输入的 Revision 应先经 RevisionResolver 校验为完整哈希后再传入。
 */
export class CommitProvider {
  constructor(private readonly git: IGitRunner) {}

  async getCommitInfo(commitHash: string, repositoryRoot: string): Promise<GitCommitInfo> {
    const out = await this.git.runText(
      ['show', '-s', `--format=${COMMIT_FORMAT}`, commitHash],
      { repositoryRoot },
    );
    const info = parseCommitShow(out);
    if (!info || !info.commitHash) {
      throw new GitError('invalid-revision', toUserMessage('invalid-revision'));
    }
    return info;
  }

  /** 列出仓库提交(默认 HEAD 历史,最多 limit 条)。 */
  async listCommits(repositoryRoot: string, limit = 200): Promise<GitCommitInfo[]> {
    const out = await this.git.runText(
      ['log', `--format=${COMMIT_FORMAT}`, '-n', String(limit), 'HEAD'],
      { repositoryRoot },
    );
    return parseCommitList(out);
  }
}
