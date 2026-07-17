import { expect } from 'chai';
import { generatePatchId, assignColorSlot } from '../../src/highlight/patchHighlightLayer';
import type { PatchModel } from '../../src/patch/models';

function sel(type: 'commit' | 'range' | 'working-tree' | 'staged', base?: string, patch?: string, viewMode: 'exact-patch-revision' | 'surviving-lines' | 'projected-footprint' = 'surviving-lines') {
  return {
    repositoryRoot: '/repo',
    type,
    baseRevision: base,
    patchRevision: patch,
    displayName: 'p',
    viewMode,
  };
}
function patch(type: 'commit' | 'range' | 'working-tree' | 'staged', base?: string, p?: string, view: 'exact-patch-revision' | 'surviving-lines' | 'projected-footprint' = 'surviving-lines'): PatchModel {
  return { selection: sel(type, base, p, view), files: [], totalAddedLines: 0, totalDeletedLines: 0, createdAt: 1 };
}

describe('patchHighlightLayer', () => {
  it('generates stable patchId from repo/base/patch/viewMode', () => {
    const id1 = generatePatchId('repoA', sel('commit', 'bbb', 'ccc', 'surviving-lines'));
    const id2 = generatePatchId('repoA', sel('commit', 'bbb', 'ccc', 'surviving-lines'));
    expect(id1).to.equal(id2);
    expect(id1).to.equal('repoA:bbb:ccc:surviving-lines');
  });

  it('uses semantic suffix for working-tree', () => {
    const id = generatePatchId('repoA', sel('working-tree', undefined, undefined, 'surviving-lines'));
    expect(id).to.equal('repoA:working-tree::surviving-lines');
  });

  it('uses semantic suffix for staged', () => {
    const id = generatePatchId('repoA', sel('staged', undefined, undefined, 'exact-patch-revision'));
    expect(id).to.equal('repoA:staged::exact-patch-revision');
  });

  it('differs by viewMode', () => {
    const a = generatePatchId('r', sel('commit', 'b', 'p', 'surviving-lines'));
    const b = generatePatchId('r', sel('commit', 'b', 'p', 'exact-patch-revision'));
    expect(a).to.not.equal(b);
  });

  it('assignColorSlot is stable for same patchId with free slots', () => {
    const s1 = assignColorSlot('p1', new Set());
    const s2 = assignColorSlot('p1', new Set());
    expect(s1).to.be.within(0, 5);
    expect(s2).to.equal(s1);
  });

  it('assignColorSlot avoids used slots', () => {
    const used = new Set<number>([0, 1, 2, 3, 4]);
    const s = assignColorSlot('any', used);
    expect(s).to.equal(5);
  });

  it('assignColorSlot stays in 0..5', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const s = assignColorSlot(id, new Set());
      expect(s).to.be.within(0, 5);
    }
  });

  it('patch model fixture compiles', () => {
    const p = patch('commit', 'b', 'p');
    expect(p.selection.type).to.equal('commit');
  });
});
