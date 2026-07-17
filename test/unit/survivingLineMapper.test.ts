import { expect } from 'chai';
import { findSurvivingRanges } from '../../src/patch/survivingLineMapper';
import type { BlameLine } from '../../src/git/blameParser';

function bl(line: number, hash: string): BlameLine {
  return {
    commitHash: hash,
    shortHash: hash.slice(0, 8),
    finalLine: line,
    originalLine: line,
    isBoundary: false,
    isUncommitted: false,
    summary: '',
    authorName: '',
    authorTimestamp: 0,
    content: '',
  };
}

const TARGET = 'aaa111111122223333444455556666777788889999a';
const OTHER = 'bbb222222233334444555566667777888899990000b';

describe('survivingLineMapper', () => {
  it('returns ranges of surviving lines', () => {
    const blame = [bl(1, OTHER), bl(2, TARGET), bl(3, TARGET), bl(4, OTHER)];
    const ranges = findSurvivingRanges(blame, new Set([TARGET]));
    expect(ranges).to.deep.equal([{ startLine: 2, endLine: 3 }]);
  });

  it('merges contiguous surviving lines', () => {
    const blame = [bl(1, TARGET), bl(2, TARGET), bl(3, TARGET)];
    expect(findSurvivingRanges(blame, new Set([TARGET]))).to.deep.equal([
      { startLine: 1, endLine: 3 },
    ]);
  });

  it('splits ranges separated by non-target lines', () => {
    const blame = [bl(1, TARGET), bl(2, OTHER), bl(3, TARGET)];
    expect(findSurvivingRanges(blame, new Set([TARGET]))).to.deep.equal([
      { startLine: 1, endLine: 1 },
      { startLine: 3, endLine: 3 },
    ]);
  });

  it('supports multiple target commits (range)', () => {
    const a = 'aaa0000000000000000000000000000000000000aa';
    const b = 'bbb1111111111111111111111111111111111111bb';
    const blame = [bl(1, a), bl(2, b), bl(3, OTHER)];
    expect(findSurvivingRanges(blame, new Set([a, b]))).to.deep.equal([
      { startLine: 1, endLine: 2 },
    ]);
  });

  it('returns empty when no line belongs to target', () => {
    const blame = [bl(1, OTHER), bl(2, OTHER)];
    expect(findSurvivingRanges(blame, new Set([TARGET]))).to.deep.equal([]);
  });

  it('handles trailing surviving range', () => {
    const blame = [bl(1, OTHER), bl(2, TARGET)];
    expect(findSurvivingRanges(blame, new Set([TARGET]))).to.deep.equal([
      { startLine: 2, endLine: 2 },
    ]);
  });
});
