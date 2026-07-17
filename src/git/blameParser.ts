/**
 * 解析 `git blame --line-porcelain` 输出。
 *
 * --line-porcelain 对每个被 blame 的行输出完整 header:
 *   <hash> <orig-line> <final-line> [num-lines]
 *   header...
 *   <空行>
 *   \t<content>
 *
 * 边界 commit 的 hash 前缀 `^`;未提交行的 hash 为 40 个 0。
 */

export interface BlameLine {
  commitHash: string;
  shortHash: string;
  /** 当前文件中的行号(1-based)。 */
  finalLine: number;
  /** 原始文件中的行号(1-based)。 */
  originalLine: number;
  isBoundary: boolean;
  isUncommitted: boolean;
  summary: string;
  authorName: string;
  authorEmail?: string;
  authorTimestamp: number;
  committerName?: string;
  committerTimestamp?: number;
  originalPath?: string;
  content: string;
}

/** 未提交行的 hash 为 40 个 0。 */
export function isUncommitted(hash: string): boolean {
  return /^0{40}$/.test(hash);
}

function stripMail(raw: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const m = /<([^>]+)>/.exec(raw);
  return m ? m[1] : raw;
}

const HASH_LINE = /^(\^?)([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/;

export function parseBlamePorcelain(input: string): BlameLine[] {
  if (!input) {
    return [];
  }
  const lines = input.split('\n');
  const result: BlameLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = HASH_LINE.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const isBoundary = m[1] === '^';
    const commitHash = m[2];
    const finalLine = Number(m[3]);
    const originalLine = Number(m[4]);
    i++;

    const headers: Record<string, string> = {};
    while (i < lines.length && lines[i] !== '') {
      const h = lines[i];
      const sp = h.indexOf(' ');
      const key = sp >= 0 ? h.slice(0, sp) : h;
      const val = sp >= 0 ? h.slice(sp + 1) : '';
      headers[key] = val;
      i++;
    }
    // 跳过分隔空行
    if (i < lines.length && lines[i] === '') {
      i++;
    }

    let content = '';
    if (i < lines.length && lines[i].startsWith('\t')) {
      content = lines[i].slice(1);
      i++;
    }

    result.push({
      commitHash,
      shortHash: commitHash.slice(0, 8),
      finalLine,
      originalLine,
      isBoundary,
      isUncommitted: isUncommitted(commitHash),
      summary: headers['summary'] ?? '',
      authorName: headers['author'] ?? '',
      authorEmail: stripMail(headers['author-mail'] ?? ''),
      authorTimestamp: headers['author-time'] ? Number(headers['author-time']) : 0,
      committerName: headers['committer'] ?? undefined,
      committerTimestamp: headers['committer-time']
        ? Number(headers['committer-time'])
        : undefined,
      originalPath: headers['filename'] ?? undefined,
      content,
    });
  }
  return result;
}

/** 在已解析的 blame 中按当前行号(1-based)查找。 */
export function findBlameLine(blame: readonly BlameLine[], line1Based: number): BlameLine | undefined {
  return blame.find((b) => b.finalLine === line1Based);
}
