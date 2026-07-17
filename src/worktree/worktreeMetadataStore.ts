import * as fs from 'fs';
import * as path from 'path';
import type { ExactPatchWorkspace } from '../git/worktreeManager';

/**
 * Worktree 元数据存储(JSON on globalStorage)。
 * 用于跨重启识别受管 worktree、复用与崩溃后清理残留。
 */
export class WorktreeMetadataStore {
  private readonly file: string;

  constructor(storageDir: string) {
    this.file = path.join(storageDir, 'worktrees.json');
  }

  async load(): Promise<ExactPatchWorkspace[]> {
    try {
      const text = await fs.promises.readFile(this.file, 'utf8');
      const data = JSON.parse(text);
      return Array.isArray(data) ? (data as ExactPatchWorkspace[]) : [];
    } catch {
      return [];
    }
  }

  async save(list: ExactPatchWorkspace[]): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    await fs.promises.writeFile(this.file, JSON.stringify(list, null, 2), 'utf8');
  }

  async upsert(ws: ExactPatchWorkspace): Promise<void> {
    const list = await this.load();
    const idx = list.findIndex((w) => w.worktreePath === ws.worktreePath);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...ws, lastOpenedAt: Date.now() };
    } else {
      list.push(ws);
    }
    await this.save(list);
  }

  async remove(worktreePath: string): Promise<void> {
    const list = await this.load();
    await this.save(list.filter((w) => w.worktreePath !== worktreePath));
  }

  async findByPath(worktreePath: string): Promise<ExactPatchWorkspace | undefined> {
    const list = await this.load();
    return list.find((w) => w.worktreePath === worktreePath);
  }
}
