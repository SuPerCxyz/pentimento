import type { AddedLineRange, ProjectedAddedRange, ProjectedLineStatus, MappingConfidence } from './models';

/**
 * 投影模式(见 docs/TECHNICAL_DESIGN.md 第 20 节)。
 *
 * 把 Patch 在 patchRevision 文件侧的新增行,通过 patchRevision -> displayRevision
 * 的 diff 映射到当前版本,产出每段的 ProjectedAddedRange(状态 + 置信度)。
 * 不使用历史旧行号直接高亮;deleted 不显示,ambiguous 弱提示。
 */

interface MappedLine {
  displayLine?: number;
  status: ProjectedLineStatus;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function isMetaLine(line: string): boolean {
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

export interface LineMapResult {
  map: Map<number, MappedLine>;
  /** 累积偏移(末尾 newLine - oldLine),用于推断未在 diff 中的行。 */
  offset: number;
}

/**
 * 构建 patchRevision(行号)-> display(行号)映射。纯函数。
 * - context 行:映射到 display 行(unchanged 或 moved);
 * - `-` 行(被删除/修改):status=deleted;
 * - `+` 行:display 新增,patch 无对应,跳过;
 * - 不在 diff 的行:用累积偏移推断(unchanged/moved)。
 */
export function buildLineMapFromDiff(diff: string): LineMapResult {
  const map = new Map<number, MappedLine>();
  if (!diff) {
    return { map, offset: 0 };
  }
  const lines = diff.split('\n');
  let oldLine = 1;
  let newLine = 1;
  let inHunk = false;
  let curHunkHasAdded = false;
  let curHunkNewStart = 0;
  const pendingDeleted: number[] = [];

  const flushHunk = () => {
    for (const dl of pendingDeleted) {
      if (curHunkHasAdded) {
        // hunk 同时含 + 与 -:视为 modified(行被后续修改),位置近似取 hunk newStart
        map.set(dl, { status: 'modified', displayLine: curHunkNewStart });
      } else {
        map.set(dl, { status: 'deleted' });
      }
    }
    pendingDeleted.length = 0;
    curHunkHasAdded = false;
  };

  for (const line of lines) {
    const m = HUNK_HEADER.exec(line);
    if (m) {
      flushHunk();
      const oldStart = Number(m[1]);
      const newStart = Number(m[3]);
      while (oldLine < oldStart) {
        map.set(oldLine, { displayLine: newLine, status: 'unchanged' });
        oldLine++;
        newLine++;
      }
      oldLine = oldStart;
      newLine = newStart;
      inHunk = true;
      curHunkHasAdded = false;
      curHunkNewStart = newStart;
      continue;
    }
    if (!inHunk || isMetaLine(line)) {
      continue;
    }
    if (line.startsWith('+')) {
      curHunkHasAdded = true;
      newLine++;
    } else if (line.startsWith('-')) {
      pendingDeleted.push(oldLine);
      oldLine++;
    } else if (line.startsWith(' ')) {
      map.set(oldLine, { displayLine: newLine, status: 'unchanged' });
      oldLine++;
      newLine++;
    }
  }
  flushHunk();
  return { map, offset: newLine - oldLine };
}

function confidenceFor(status: ProjectedLineStatus): MappingConfidence {
  switch (status) {
    case 'unchanged':
      return 'high';
    case 'moved':
      return 'medium';
    case 'modified':
      return 'medium';
    case 'deleted':
      return 'high';
    case 'ambiguous':
      return 'low';
    default:
      return 'low';
  }
}

/**
 * 将 Patch 新增行范围投影到当前版本。连续同状态(且 display 连续)合并为一段。
 * deleted 不产生可显示段(仅统计意义),此处仍输出以便上层统计。
 */
export function projectRanges(
  patchDisplayDiff: string,
  patchRanges: readonly AddedLineRange[],
): ProjectedAddedRange[] {
  const { map, offset } = buildLineMapFromDiff(patchDisplayDiff);
  const results: ProjectedAddedRange[] = [];

  for (const range of patchRanges) {
    let segStart = range.startLine;
    let segEnd = range.startLine;
    let segStatus: ProjectedLineStatus | undefined;
    let segDispStart: number | undefined;
    let segDispEnd: number | undefined;

    const flush = () => {
      if (segStatus !== undefined) {
        results.push({
          originalStartLine: segStart,
          originalEndLine: segEnd,
          currentStartLine: segDispStart,
          currentEndLine: segDispEnd,
          status: segStatus,
          confidence: confidenceFor(segStatus),
        });
      }
      segStatus = undefined;
      segDispStart = undefined;
      segDispEnd = undefined;
    };

    for (let L = range.startLine; L <= range.endLine; L++) {
      const entry = map.get(L);
      let st: ProjectedLineStatus;
      let disp: number | undefined;
      if (!entry) {
        // 未在 diff 中:用累积偏移推断
        st = offset === 0 ? 'unchanged' : 'moved';
        disp = L + offset;
      } else if (entry.status === 'deleted') {
        st = 'deleted';
        disp = undefined;
      } else if (entry.status === 'modified') {
        st = 'modified';
        disp = entry.displayLine;
      } else {
        st = entry.displayLine === L ? 'unchanged' : 'moved';
        disp = entry.displayLine;
      }

      const contiguous =
        segStatus === st &&
        (st === 'deleted' || st === 'modified' || (disp !== undefined && segDispEnd !== undefined && disp === segDispEnd + 1));
      if (segStatus === undefined || !contiguous) {
        flush();
        segStart = L;
        segEnd = L;
        segStatus = st;
        segDispStart = disp;
        segDispEnd = disp;
      } else {
        segEnd = L;
        if (disp !== undefined) {
          if (segDispStart === undefined) {
            segDispStart = disp;
          }
          segDispEnd = disp;
        }
      }
    }
    flush();
  }
  return results;
}
