import type { RepositoryHighlightSession } from './repositoryHighlightSession';
import { createSession } from './repositoryHighlightSession';

/**
 * 多仓库高亮会话管理器:Map<repositoryRoot, RepositoryHighlightSession>。
 * 每仓库独立会话/缓存;切换编辑器恢复对应会话。
 */
export class HighlightSessionManager {
  private readonly sessions = new Map<string, RepositoryHighlightSession>();

  getOrCreateSession(repositoryRoot: string, displayRevision: string): RepositoryHighlightSession {
    const existing = this.sessions.get(repositoryRoot);
    if (existing) {
      if (existing.displayRevision !== displayRevision) {
        // displayRevision 变(HEAD 切换):失效所有图层坐标,清空会话
        existing.displayRevision = displayRevision;
        existing.patchLayers.clear();
        existing.primaryPatchId = undefined;
        existing.updatedAt = Date.now();
      }
      return existing;
    }
    const session = createSession(repositoryRoot, displayRevision);
    this.sessions.set(repositoryRoot, session);
    return session;
  }

  getSession(repositoryRoot: string): RepositoryHighlightSession | undefined {
    return this.sessions.get(repositoryRoot);
  }

  removeSession(repositoryRoot: string): void {
    this.sessions.delete(repositoryRoot);
  }

  clear(): void {
    this.sessions.clear();
  }

  allSessions(): RepositoryHighlightSession[] {
    return [...this.sessions.values()];
  }
}
