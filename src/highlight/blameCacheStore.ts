import * as fs from 'fs';
import * as path from 'path';
import type { BlameLine } from '../git/blameParser';

/**
 * Blame 缓存持久化存储(JSON on globalStorage)。
 *
 * key 形如 `${repoRoot}::${head}::${rel}::${blobHash}`,其中 blobHash
 * 为 `git rev-parse <head>:<rel>`,确保文件内容变更后失效。
 * 跨重启复用 blame 结果,加速存活行高亮的首次应用。
 */
export class BlameCacheStore {
  private readonly file: string;

  constructor(storageDir: string) {
    this.file = path.join(storageDir, 'blame-cache.json');
  }

  async load(): Promise<Record<string, BlameLine[]>> {
    try {
      const text = await fs.promises.readFile(this.file, 'utf8');
      const data = JSON.parse(text);
      return data && typeof data === 'object'
        ? (data as Record<string, BlameLine[]>)
        : {};
    } catch {
      return {};
    }
  }

  async save(data: Record<string, BlameLine[]>): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      await fs.promises.writeFile(this.file, JSON.stringify(data), 'utf8');
    } catch {
      // 持久化失败不阻断主流程
    }
  }
}
