import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import type { IGitRunner } from './gitRunner';
import { GitError } from './gitErrors';

export interface Repository {
  /** 规范化(符号链接解析)的绝对路径。 */
  root: string;
  /** 仓库匿名 ID(sha256(root) 前 16 位)。 */
  repositoryId: string;
  bare: boolean;
}

/** 规范化仓库根:解析符号链接,统一用于路径比较与 ID 派生。 */
export function normalizeRoot(root: string): string {
  try {
    return fs.realpathSync.native(root);
  } catch {
    return path.resolve(root);
  }
}

/** 派生仓库匿名 ID。 */
export function computeRepositoryId(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 16);
}

/** 在已知仓库根集合中,定位某文件所属仓库(最长前缀匹配)。纯函数。 */
export function findRepositoryForPath(
  roots: readonly string[],
  filePath: string,
): string | undefined {
  const target = normalizeRoot(filePath);
  let best: string | undefined;
  let bestLen = -1;
  for (const r of roots) {
    const rn = normalizeRoot(r);
    if (target === rn || target.startsWith(rn + path.sep)) {
      if (rn.length > bestLen) {
        best = r;
        bestLen = rn.length;
      }
    }
  }
  return best;
}

/**
 * 仓库识别器。
 *
 * P0 使用 CLI(`git rev-parse --show-toplevel`)解析;
 * 优先复用内置 `vscode.git` 扩展 API 的优化(更稳、更省进程)列入 P1。
 * 每仓库结果按"文件所在目录"缓存;HEAD/分支切换等失效由上层事件触发。
 */
export class RepositoryResolver {
  private readonly cache = new Map<string, Repository>();

  constructor(private readonly git: IGitRunner) {}

  invalidate(repositoryRoot?: string): void {
    if (repositoryRoot) {
      this.cache.delete(normalizeRoot(repositoryRoot));
    } else {
      this.cache.clear();
    }
  }

  async resolveRepository(filePath: string): Promise<Repository | undefined> {
    const dir = path.dirname(filePath);
    const dirKey = normalizeRoot(dir);

    const cached = this.cache.get(dirKey);
    if (cached) {
      return cached;
    }

    try {
      const topText = await this.git.runText(['rev-parse', '--show-toplevel'], { cwd: dir });
      const top = topText.trim();
      if (!top) {
        return undefined;
      }
      const bareText = await this.git.runText(['rev-parse', '--is-bare-repository'], { cwd: dir });
      const bare = bareText.trim() === 'true';
      const root = normalizeRoot(top);
      const repo: Repository = {
        root,
        repositoryId: computeRepositoryId(root),
        bare,
      };
      this.cache.set(dirKey, repo);
      return repo;
    } catch (e) {
      if (e instanceof GitError && e.code === 'not-a-repository') {
        return undefined;
      }
      throw e;
    }
  }
}
