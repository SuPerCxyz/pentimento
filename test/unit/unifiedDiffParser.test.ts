import { expect } from 'chai';
import { parseHunks, parseAddedRanges } from '../../src/patch/unifiedDiffParser';

function file(p: string, ...hunks: string[]): string {
  return ['diff --git a/' + p + ' b/' + p, 'index 111..222 100644', '--- a/' + p, '+++ b/' + p, ...hunks].join('\n');
}

describe('unifiedDiffParser', () => {
  it('parses a pure-add hunk after a context line', () => {
    const diff = file('a.py', '@@ -20,3 +20,8 @@', ' existing', '+new1', '+new2', ' existing2');
    const hunks = parseHunks(diff);
    expect(hunks).to.have.lengthOf(1);
    expect(hunks[0]).to.include({ oldStart: 20, oldCount: 3, newStart: 20, newCount: 8 });
    // context 占第 20 行,新增行在第 21-22 行
    expect(hunks[0].addedRanges).to.deep.equal([{ startLine: 21, endLine: 22 }]);
  });

  it('parses a replace hunk (only the new side)', () => {
    const diff = file('a.py', '@@ -1,2 +1,2 @@', '-old', '+new', ' ctx');
    expect(parseAddedRanges(diff)).to.deep.equal([{ startLine: 1, endLine: 1 }]);
  });

  it('parses a new file hunk', () => {
    const diff = file('new.py', '@@ -0,0 +1,3 @@', '+line1', '+line2', '+line3');
    expect(parseAddedRanges(diff)).to.deep.equal([{ startLine: 1, endLine: 3 }]);
  });

  it('parses a pure-delete hunk (no added ranges)', () => {
    const diff = file('a.py', '@@ -10,5 +10,0 @@', '-gone1', '-gone2', '-gone3');
    expect(parseAddedRanges(diff)).to.deep.equal([]);
    expect(parseHunks(diff)[0].newCount).to.equal(0);
  });

  it('counts added empty lines', () => {
    const diff = file('a.py', '@@ -1,1 +1,2 @@', ' ctx', '+');
    expect(parseAddedRanges(diff)).to.deep.equal([{ startLine: 2, endLine: 2 }]);
  });

  it('merges contiguous added lines into one range', () => {
    const diff = file('a.py', '@@ -1,1 +1,4 @@', ' ctx', '+a', '+b', '+c');
    expect(parseAddedRanges(diff)).to.deep.equal([{ startLine: 2, endLine: 4 }]);
  });

  it('splits ranges separated by context', () => {
    const diff = file('a.py', '@@ -1,3 +1,5 @@', '+x', ' ctx', '+y');
    expect(parseAddedRanges(diff)).to.deep.equal([
      { startLine: 1, endLine: 1 },
      { startLine: 3, endLine: 3 },
    ]);
  });

  it('handles no-newline marker', () => {
    const diff = file('a.py', '@@ -1,1 +1,1 @@', '-old', '\\ No newline at end of file', '+new');
    expect(parseAddedRanges(diff)).to.deep.equal([{ startLine: 1, endLine: 1 }]);
  });

  it('parses multiple hunks', () => {
    const diff = file('a.py', '@@ -1,1 +1,2 @@', '+a', '@@ -10,1 +11,2 @@', ' ctx', '+b');
    const ranges = parseAddedRanges(diff);
    expect(ranges).to.deep.equal([
      { startLine: 1, endLine: 1 },
      { startLine: 12, endLine: 12 },
    ]);
  });

  it('returns empty for binary file diff', () => {
    const diff = ['diff --git a/bin b/bin', 'index 1..2 100644', 'Binary files a/bin and b/bin differ'].join('\n');
    expect(parseHunks(diff)).to.deep.equal([]);
  });

  it('handles omitted counts (default 1)', () => {
    const diff = file('a.py', '@@ -1 +1 @@', '+x');
    const h = parseHunks(diff)[0];
    expect(h.oldCount).to.equal(1);
    expect(h.newCount).to.equal(1);
  });

  it('handles CRLF line endings in diff', () => {
    const diff = file('a.py', '@@ -1,1 +1,2 @@', ' ctx', '+new').replace(/\n/g, '\r\n');
    expect(parseAddedRanges(diff)).to.deep.equal([{ startLine: 2, endLine: 2 }]);
  });
});
