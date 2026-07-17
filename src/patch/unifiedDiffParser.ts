import type { AddedLineRange } from './models';

/**
 * 解析 `git diff --unified=0` 输出,提取新文件一侧的新增行范围。
 *
 * 只收集 hunk 内以 `+` 开头的行(不含 `+++` 文件头、context、删除行、
 * `\ No newline at end of file` 等)。行号统一 Git 1-based inclusive。
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export interface ParsedHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  addedRanges: AddedLineRange[];
}

function isFileHeaderOrMeta(line: string): boolean {
  return (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('new file ') ||
    line.startsWith('deleted file ') ||
    line.startsWith('old mode ') ||
    line.startsWith('new mode ') ||
    line.startsWith('similarity ') ||
    line.startsWith('rename ') ||
    line.startsWith('copy ') ||
    line.startsWith('Binary files') ||
    line.startsWith('\\ ')
  );
}

export function parseHunks(diff: string): ParsedHunk[] {
  const lines = diff.split('\n');
  const hunks: ParsedHunk[] = [];
  let cur: ParsedHunk | null = null;
  let curLine = 0;
  let rangeStart: number | null = null;

  const flush = () => {
    if (cur && rangeStart !== null) {
      cur.addedRanges.push({ startLine: rangeStart, endLine: curLine - 1 });
      rangeStart = null;
    }
  };

  for (const line of lines) {
    const m = HUNK_HEADER.exec(line);
    if (m) {
      flush();
      if (cur) {
        hunks.push(cur);
      }
      cur = {
        oldStart: Number(m[1]),
        oldCount: m[2] !== undefined ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newCount: m[4] !== undefined ? Number(m[4]) : 1,
        addedRanges: [],
      };
      curLine = cur.newStart;
      rangeStart = null;
      continue;
    }
    if (!cur) {
      continue;
    }
    if (isFileHeaderOrMeta(line)) {
      flush();
      continue;
    }
    if (line.startsWith('+')) {
      if (rangeStart === null) {
        rangeStart = curLine;
      }
      curLine++;
    } else if (line.startsWith('-')) {
      flush();
    } else if (line.startsWith(' ')) {
      flush();
      curLine++;
    } else {
      flush();
    }
  }
  flush();
  if (cur) {
    hunks.push(cur);
  }
  return hunks;
}

/** 所有 hunk 的新增行范围(平铺)。 */
export function parseAddedRanges(diff: string): AddedLineRange[] {
  return parseHunks(diff).flatMap((h) => h.addedRanges);
}
