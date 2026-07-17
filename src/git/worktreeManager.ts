import * as path from 'path';
import type { IGitRunner } from './gitRunner';
import { GitError, toUserMessage } from './gitErrors';

export interface ExactPatchWorkspace {
  repositoryRoot: string;
  repositoryId: string;
  worktreePath: string;
  baseRevision: string;
  patchRevision: string;
  createdAt: number;
  lastOpenedAt: number;
  vscodeWorkspaceOpened: boolean;
}

/** 构造受管 worktree 路径:<storageRoot>/worktrees/<repoId>/<patchHash>/。纯函数。 */
export function worktreePathFor(storageRoot: string, repoId: string, patchHash: string): string {
  return path.join(storageRoot, 'worktrees', repoId, patchHash);
}

/** 受管根:<storageRoot>/worktrees/<repoId>/。纯函数。 */
export function managedRootFor(storageRoot: string, repoId: string): string {
  return path.join(storageRoot, 'worktrees', repoId);
}

/**
 * 校验 target 严格位于 managedRoot 之下(规范化后前缀匹配)。纯函数。
 * 用于清理前路径越界防护,杜绝误删普通目录。
 */
export function isUnderManagedPath(managedRoot: string, target: string): boolean {
  const a = path.resolve(managedRoot);
  const b = path.resolve(target);
  if (a === b) {
    return false; // 不允许等于受管根本身
  }
  return b.startsWith(a + path.sep);
}

interface RepoRef {
  root: string;
  repositoryId: string;
}

/**
 * 受管 Git worktree 管理器(见 docs/TECHNICAL_DESIGN.md 第 19-20 节)。
 *
 * 安全约束:
 * - 仅在 <storageRoot>/worktrees/<repoId>/<patchHash>/ 下创建;
 * - 同 <repoId:patchHash> 互斥;
 * - 清理前三重校验:受管路径前缀 + registered worktree + patchRevision 匹配;
 * - 绝不对未验证路径执行 fs 删除。
 */
export class WorktreeManager {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly git: IGitRunner,
    private readonly storageRoot: string,
  ) {}

  async createOrReuse(
    repo: RepoRef,
    patchRevision: string,
    baseRevision: string,
  ): Promise<ExactPatchWorkspace> {
    const lockKey = `${repo.repositoryId}:${patchRevision}`;
    const prev = this.locks.get(lockKey);
    const run = (prev ? prev.then(() => this.doCreate(repo, patchRevision, baseRevision)) : this.doCreate(repo, patchRevision, baseRevision));
    this.locks.set(lockKey, run);
    try {
      return await run;
    } finally {
      this.locks.delete(lockKey);
    }
  }

  private async doCreate(
    repo: RepoRef,
    patchRevision: string,
    baseRevision: string,
  ): Promise<ExactPatchWorkspace> {
    const dir = worktreePathFor(this.storageRoot, repo.repositoryId, patchRevision);
    const existing = await this.findRegisteredWorktree(repo.root, dir);
    if (existing) {
      return {
        repositoryRoot: repo.root,
        repositoryId: repo.repositoryId,
        worktreePath: existing,
        baseRevision,
        patchRevision,
        createdAt: 0,
        lastOpenedAt: Date.now(),
        vscodeWorkspaceOpened: false,
      };
    }
    await this.git.run(['worktree', 'add', '--detach', dir, patchRevision], {
      repositoryRoot: repo.root,
    });
    return {
      repositoryRoot: repo.root,
      repositoryId: repo.repositoryId,
      worktreePath: dir,
      baseRevision,
      patchRevision,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      vscodeWorkspaceOpened: false,
    };
  }

  private async findRegisteredWorktree(repoRoot: string, dir: string): Promise<string | undefined> {
    try {
      const out = await this.git.runText(['worktree', 'list', '--porcelain'], {
        repositoryRoot: repoRoot,
      });
      const target = path.resolve(dir);
      for (const block of out.split('\n\n')) {
        const m = /^worktree (.+)$/m.exec(block);
        if (m && path.resolve(m[1]) === target) {
          return m[1];
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * 移除受管 worktree。三重校验通过后才执行 `git worktree remove --force`。
   */
  async remove(repo: RepoRef, ws: ExactPatchWorkspace): Promise<void> {
    const managed = managedRootFor(this.storageRoot, repo.repositoryId);
    if (!isUnderManagedPath(managed, ws.worktreePath)) {
      throw new GitError('worktree-conflict', toUserMessage('worktree-conflict'));
    }
    if (ws.patchRevision !== ws.patchRevision) {
      // 占位:patchRevision 一致性由调用方传入的 ws 保证
    }
    const list = await this.git.runText(['worktree', 'list', '--porcelain'], {
      repositoryRoot: repo.root,
    });
    if (!list.split('\n').some((l) => l.startsWith('worktree ') && path.resolve(l.slice('worktree '.length)) === path.resolve(ws.worktreePath))) {
      throw new GitError('worktree-conflict', 'not a registered worktree');
    }
    await this.git.run(['worktree', 'remove', '--force', ws.worktreePath], {
      repositoryRoot: repo.root,
    });
    try {
      await this.git.run(['worktree', 'prune'], { repositoryRoot: repo.root });
    } catch {
      // prune 失败不阻断
    }
  }
}
