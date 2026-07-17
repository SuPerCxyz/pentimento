import { expect } from 'chai';
import { composeLine } from '../../src/highlight/decorationComposer';
import type { PatchLineMembership } from '../../src/highlight/lineMembershipIndex';

function m(patchId: string, status: PatchLineMembership['status']): PatchLineMembership {
  return { patchId, status, confidence: 'high' };
}

describe('decorationComposer', () => {
  it('empty memberships returns single-patch with no ids', () => {
    const c = composeLine([]);
    expect(c.style).to.equal('single-patch');
    expect(c.patchIds).to.deep.equal([]);
  });

  it('single patch exact -> single-patch', () => {
    const c = composeLine([m('p1', 'exact')]);
    expect(c.style).to.equal('single-patch');
    expect(c.patchIds).to.deep.equal(['p1']);
  });

  it('two patches -> multi-patch-overlap', () => {
    const c = composeLine([m('p1', 'exact'), m('p2', 'surviving')]);
    expect(c.style).to.equal('multi-patch-overlap');
    expect(c.patchIds).to.have.members(['p1', 'p2']);
  });

  it('any modified membership -> modified', () => {
    const c = composeLine([m('p1', 'exact'), m('p2', 'modified')]);
    expect(c.style).to.equal('modified');
  });

  it('all ambiguous -> ambiguous', () => {
    const c = composeLine([m('p1', 'ambiguous'), m('p2', 'ambiguous')]);
    expect(c.style).to.equal('ambiguous');
  });

  it('mixed exact+ambiguous different patches -> overlap (not ambiguous)', () => {
    const c = composeLine([m('p1', 'exact'), m('p2', 'ambiguous')]);
    expect(c.style).to.equal('multi-patch-overlap');
  });

  it('passes primaryPatchId through', () => {
    const c = composeLine([m('p1', 'exact'), m('p2', 'exact')], 'p2');
    expect(c.primaryPatchId).to.equal('p2');
  });
});
