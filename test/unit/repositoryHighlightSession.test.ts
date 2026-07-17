import { expect } from 'chai';
import {
  createSession,
  addPatch,
  removePatch,
  setLayerEnabled,
  setPrimary,
  showOnly,
  showAll,
  hideAll,
  clearAll,
  activeLayerCount,
} from '../../src/highlight/repositoryHighlightSession';
import type { PatchModel } from '../../src/patch/models';
import { generatePatchId } from '../../src/highlight/patchHighlightLayer';

function makePatch(type: 'commit' | 'range' | 'working-tree' | 'staged', base?: string, p?: string, display?: string): PatchModel {
  return {
    selection: {
      repositoryRoot: '/repo',
      type,
      baseRevision: base,
      patchRevision: p,
      displayRevision: display,
      displayName: type === 'commit' ? `commit ${p}` : type,
      viewMode: 'surviving-lines',
    },
    files: [],
    totalAddedLines: 0,
    totalDeletedLines: 0,
    createdAt: 1,
  };
}

describe('repositoryHighlightSession', () => {
  it('creates an empty session', () => {
    const s = createSession('/repo', 'HEAD');
    expect(s.patchLayers.size).to.equal(0);
    expect(s.primaryPatchId).to.be.undefined;
    expect(s.enabled).to.be.true;
  });

  it('adds a layer and sets primary', () => {
    const s = createSession('/repo', 'HEAD');
    const res = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    expect(res.reason).to.equal('ok');
    expect(res.layer).to.not.be.undefined;
    expect(s.patchLayers.size).to.equal(1);
    expect(s.primaryPatchId).to.equal(res.layer!.patchId);
  });

  it('adding a second layer keeps the first (no silent clear)', () => {
    const s = createSession('/repo', 'HEAD');
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c2'));
    expect(s.patchLayers.size).to.equal(2);
  });

  it('is idempotent for the same patchId', () => {
    const s = createSession('/repo', 'HEAD');
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    expect(s.patchLayers.size).to.equal(1);
  });

  it('replace clears existing layers', () => {
    const s = createSession('/repo', 'HEAD');
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    const res = addPatch(s, 'repoA', makePatch('commit', 'b', 'c2'), { replace: true });
    expect(s.patchLayers.size).to.equal(1);
    expect(res.removed).to.have.lengthOf(1);
    expect(s.primaryPatchId).to.equal(res.layer!.patchId);
  });

  it('returns limit-exceeded beyond maxActive', () => {
    const s = createSession('/repo', 'HEAD');
    for (let i = 0; i < 3; i++) {
      addPatch(s, 'repoA', makePatch('commit', 'b', `c${i}`), { maxActive: 3 });
    }
    const res = addPatch(s, 'repoA', makePatch('commit', 'b', 'c3'), { maxActive: 3 });
    expect(res.reason).to.equal('limit-exceeded');
    expect(s.patchLayers.size).to.equal(3);
  });

  it('returns display-revision-mismatch', () => {
    const s = createSession('/repo', 'HEAD');
    const res = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1', 'OTHER'));
    expect(res.reason).to.equal('display-revision-mismatch');
  });

  it('removes a layer and reassigns primary to a remaining one', () => {
    const s = createSession('/repo', 'HEAD');
    const first = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1')).layer!;
    const second = addPatch(s, 'repoA', makePatch('commit', 'b', 'c2')).layer!;
    setPrimary(s, second.patchId);
    expect(s.primaryPatchId).to.equal(second.patchId);
    removePatch(s, second.patchId);
    expect(s.patchLayers.size).to.equal(1);
    expect(s.primaryPatchId).to.equal(first.patchId);
  });

  it('toggles layer visibility', () => {
    const s = createSession('/repo', 'HEAD');
    const l = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1')).layer!;
    expect(setLayerEnabled(s, l.patchId, false)).to.be.true;
    expect(l.enabled).to.be.false;
    expect(activeLayerCount(s)).to.equal(0);
  });

  it('setPrimary changes primary without disabling others', () => {
    const s = createSession('/repo', 'HEAD');
    const a = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1')).layer!;
    const b = addPatch(s, 'repoA', makePatch('commit', 'b', 'c2')).layer!;
    setPrimary(s, a.patchId);
    expect(s.primaryPatchId).to.equal(a.patchId);
    expect(b.enabled).to.be.true;
  });

  it('showOnly enables only the target', () => {
    const s = createSession('/repo', 'HEAD');
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    const b = addPatch(s, 'repoA', makePatch('commit', 'b', 'c2')).layer!;
    showOnly(s, b.patchId);
    expect(activeLayerCount(s)).to.equal(1);
    expect(s.primaryPatchId).to.equal(b.patchId);
  });

  it('showAll / hideAll / clearAll', () => {
    const s = createSession('/repo', 'HEAD');
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c1'));
    addPatch(s, 'repoA', makePatch('commit', 'b', 'c2'));
    hideAll(s);
    expect(activeLayerCount(s)).to.equal(0);
    showAll(s);
    expect(activeLayerCount(s)).to.equal(2);
    clearAll(s);
    expect(s.patchLayers.size).to.equal(0);
    expect(s.primaryPatchId).to.be.undefined;
  });

  it('colorSlot is stable across re-add', () => {
    const s = createSession('/repo', 'HEAD');
    const l = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1')).layer!;
    const slotBefore = l.colorSlot;
    removePatch(s, l.patchId);
    const l2 = addPatch(s, 'repoA', makePatch('commit', 'b', 'c1')).layer!;
    expect(generatePatchId('repoA', l2.selection)).to.equal(generatePatchId('repoA', l.selection));
    expect(l2.colorSlot).to.equal(slotBefore);
  });
});
