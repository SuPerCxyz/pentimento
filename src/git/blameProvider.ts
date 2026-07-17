import type { IGitRunner } from './gitRunner';
import { parseBlamePorcelain, findBlameLine, type BlameLine } from './blameParser';

export interface BlameOptions {
  ignoreWhitespace?: boolean;
  detectMovedLines?: boolean;
  detectCopiedLines?: boolean;
}

/**
 * 文件级 blame 提供者。
 *
 * 调用 `git blame --line-porcelain` 获取整文件 blame 并解析为按行索引。
 * 缓存(含 HEAD/版本失效)由上层 hover/highlight 按事件维护,
 * 此处只负责解析与查询。
 */
export class BlameProvider {
  constructor(private readonly git: IGitRunner) {}

  async blameFile(
    repositoryRoot: string,
    filePath: string,
    opts?: BlameOptions,
  ): Promise<BlameLine[]> {
    const args = ['blame', '--line-porcelain'];
    if (opts?.ignoreWhitespace) {
      args.push('-w');
    }
    if (opts?.detectMovedLines) {
      args.push('-M');
    }
    if (opts?.detectCopiedLines) {
      args.push('-C');
    }
    args.push('--', filePath);
    const out = await this.git.runText(args, { repositoryRoot });
    return parseBlamePorcelain(out);
  }

  /** 按 1-based 行号在已解析 blame 中查找。 */
  getLine(blame: readonly BlameLine[], line1Based: number): BlameLine | undefined {
    return findBlameLine(blame, line1Based);
  }
}
