import * as fs from 'fs';
import * as path from 'path';
import type { PatchSelection } from '../patch/models';

/**
 * 持久化的单个 Patch 图层(用于跨重启恢复高亮会话)。
 *
 * 仅持久化 PatchSelection 与显隐/自定义颜色,不持久化解析后的 PatchModel
 * (重启后按 selection 重新 build,避免使用过期行号坐标)。
 * exact-patch-revision 不在此持久化(由独立 worktree 恢复)。
 */
export interface PersistedPatch {
  selection: PatchSelection;
  customColor?: { background: string; border: string };
  enabled: boolean;
}

/**
 * 高亮会话元数据存储(JSON on globalStorage)。
 * 按 repositoryRoot 存 PersistedPatch 列表。
 */
export class SessionMetadataStore {
  private readonly file: string;

  constructor(storageDir: string) {
    this.file = path.join(storageDir, 'sessions.json');
  }

  async load(): Promise<Record<string, PersistedPatch[]>> {
    try {
      const text = await fs.promises.readFile(this.file, 'utf8');
      const data = JSON.parse(text);
      return data && typeof data === 'object'
        ? (data as Record<string, PersistedPatch[]>)
        : {};
    } catch {
      return {};
    }
  }

  async save(data: Record<string, PersistedPatch[]>): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      await fs.promises.writeFile(this.file, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // 持久化失败不应阻断主流程
    }
  }
}
