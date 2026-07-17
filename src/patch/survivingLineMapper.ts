import type { BlameLine } from '../git/blameParser';
import type { AddedLineRange } from './models';

/**
 * 从当前版本的 blame 中,找出 commitHash 仍属于目标 Patch 的行(存活行),
 * 合并为 1-based 行范围。纯函数(见 docs/TECHNICAL_DESIGN.md 第 18 节)。
 *
 * 不使用历史 Patch 的旧行号;只依据当前 displayRevision 的 blame 归属。
 */
export function findSurvivingRanges(
  blame: readonly BlameLine[],
  targetCommits: Set<string>,
): AddedLineRange[] {
  const ranges: AddedLineRange[] = [];
  let start: number | null = null;
  let end = 0;
  for (const b of blame) {
    if (targetCommits.has(b.commitHash)) {
      if (start === null) {
        start = b.finalLine;
      }
      end = b.finalLine;
    } else if (start !== null) {
      ranges.push({ startLine: start, endLine: end });
      start = null;
    }
  }
  if (start !== null) {
    ranges.push({ startLine: start, endLine: end });
  }
  return ranges;
}
