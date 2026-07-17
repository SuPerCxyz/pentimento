import { expect } from 'chai';
import { buildLineMapFromDiff, projectRanges } from '../../src/patch/projectedFootprintMapper';
import type { AddedLineRange } from '../../src/patch/models';

function file(p: string, ...hunks: string[]): string {
  return ['diff --git a/' + p + ' b/' + p, 'index 1..2 100644', '--- a/' + p, '+++ b/' + p, ...hunks].join('\n');
}

function range(start: number, end: number): AddedLineRange {
  return { startLine: start, endLine: end };
}

describe('projectedFootprintMapper', () => {
  it('maps unchanged lines when there is no diff (file unchanged)', () => {
    const projected = projectRanges('', [range(1, 3)]);
    // 无 diff = 文件未变 -> unchanged,display 行号与 patch 一致
    expect(projected).to.have.lengthOf(1);
    expect(projected[0].status).to.equal('unchanged');
    expect(projected[0].currentStartLine).to.equal(1);
    expect(projected[0].currentEndLine).to.equal(3);
  });

  it('marks lines as unchanged when diff has no changes', () => {
    // 一个 hunk,全是 context(patch 行未变,display 行号一致)
    const diff = file('a.py', '@@ -1,3 +1,3 @@', ' x', ' y', ' z');
    const projected = projectRanges(diff, [range(1, 3)]);
    expect(projected).to.have.lengthOf(1);
    expect(projected[0].status).to.equal('unchanged');
    expect(projected[0].currentStartLine).to.equal(1);
    expect(projected[0].currentEndLine).to.equal(3);
    expect(projected[0].confidence).to.equal('high');
  });

  it('marks lines as moved when preceding insertion shifts them', () => {
    // patch 行 2-3 在 display 中因前面插入 1 行而后移到 3-4
    const diff = file('a.py', '@@ -1,2 +1,3 @@', ' ctx', '+inserted', ' line2', ' line3');
    // line2/line3 在 patch 是 2/3,在 display 是 3/4
    const projected = projectRanges(diff, [range(2, 3)]);
    expect(projected).to.have.lengthOf(1);
    expect(projected[0].status).to.equal('moved');
    expect(projected[0].currentStartLine).to.equal(3);
    expect(projected[0].currentEndLine).to.equal(4);
  });

  it('marks deleted lines', () => {
    const diff = file('a.py', '@@ -1,2 +0,0 @@', '-line1', '-line2');
    const projected = projectRanges(diff, [range(1, 2)]);
    expect(projected[0].status).to.equal('deleted');
    expect(projected[0].currentStartLine).to.be.undefined;
  });

  it('splits a range by status change', () => {
    // patch 行 1 context(unchanged),行 2 deleted
    const diff = file('a.py', '@@ -1,2 +1,1 @@', ' line1', '-line2');
    const projected = projectRanges(diff, [range(1, 2)]);
    expect(projected).to.have.lengthOf(2);
    expect(projected[0].status).to.equal('unchanged');
    expect(projected[1].status).to.equal('deleted');
  });

  it('handles multiple hunks with line shift', () => {
    const diff = file('a.py', '@@ -1,1 +1,2 @@', '+ins', ' a', '@@ -5,1 +6,1 @@', ' b');
    const projected = projectRanges(diff, [range(1, 1), range(5, 5)]);
    // 行 1 -> display 2(moved);行 5 -> display 6(moved)
    expect(projected).to.have.lengthOf(2);
    expect(projected[0].status).to.equal('moved');
    expect(projected[0].currentStartLine).to.equal(2);
    expect(projected[1].currentStartLine).to.equal(6);
  });

  it('buildLineMap skips meta lines', () => {
    const diff = file('a.py', '@@ -1,1 +1,1 @@', ' ctx');
    const { map } = buildLineMapFromDiff(diff);
    expect(map.get(1)?.status).to.equal('unchanged');
  });
});
