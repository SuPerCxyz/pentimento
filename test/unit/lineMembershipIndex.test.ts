import { expect } from 'chai';
import { LineMembershipIndex } from '../../src/highlight/lineMembershipIndex';
import type { AddedLineRange } from '../../src/patch/models';

describe('lineMembershipIndex', () => {
  it('applyRanges adds memberships for each line', () => {
    const idx = new LineMembershipIndex();
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 1, endLine: 3 } as AddedLineRange], 'exact', 'high');
    expect(idx.getLine('file:///a.py', 1)).to.have.lengthOf(1);
    expect(idx.getLine('file:///a.py', 2)).to.have.lengthOf(1);
    expect(idx.getLine('file:///a.py', 3)).to.have.lengthOf(1);
    expect(idx.getLine('file:///a.py', 4)).to.deep.equal([]);
  });

  it('supports multiple patches on the same line', () => {
    const idx = new LineMembershipIndex();
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 1, endLine: 1 } as AddedLineRange], 'exact', 'high');
    idx.applyRanges('file:///a.py', 'p2', [{ startLine: 1, endLine: 1 } as AddedLineRange], 'surviving', 'medium');
    const m = idx.getLine('file:///a.py', 1);
    expect(m).to.have.lengthOf(2);
    expect(m.map((x) => x.patchId)).to.have.members(['p1', 'p2']);
  });

  it('does not duplicate the same patchId on a line', () => {
    const idx = new LineMembershipIndex();
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 1, endLine: 1 } as AddedLineRange], 'exact', 'high');
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 1, endLine: 1 } as AddedLineRange], 'exact', 'high');
    expect(idx.getLine('file:///a.py', 1)).to.have.lengthOf(1);
  });

  it('removePatch removes only that patch', () => {
    const idx = new LineMembershipIndex();
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 1, endLine: 2 } as AddedLineRange], 'exact', 'high');
    idx.applyRanges('file:///a.py', 'p2', [{ startLine: 1, endLine: 2 } as AddedLineRange], 'exact', 'high');
    idx.removePatch('p1');
    expect(idx.getLine('file:///a.py', 1)).to.have.lengthOf(1);
    expect(idx.getLine('file:///a.py', 1)[0].patchId).to.equal('p2');
  });

  it('clearDocument removes all lines of a document', () => {
    const idx = new LineMembershipIndex();
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 1, endLine: 2 } as AddedLineRange], 'exact', 'high');
    idx.clearDocument('file:///a.py');
    expect(idx.entries('file:///a.py')).to.deep.equal([]);
  });

  it('entries returns all lines with memberships', () => {
    const idx = new LineMembershipIndex();
    idx.applyRanges('file:///a.py', 'p1', [{ startLine: 5, endLine: 6 } as AddedLineRange], 'exact', 'high');
    const e = idx.entries('file:///a.py');
    expect(e).to.have.lengthOf(2);
    expect(e.map((x) => x.line)).to.have.members([5, 6]);
  });
});
