import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionMetadataStore } from '../../src/highlight/sessionMetadataStore';
import type { PatchSelection } from '../../src/patch/models';

function makeSelection(viewMode: PatchSelection['viewMode'] = 'surviving-lines'): PatchSelection {
  return {
    repositoryRoot: '/repo',
    type: 'commit',
    baseRevision: 'b',
    patchRevision: 'c1',
    displayRevision: 'HEAD',
    displayName: 'commit c1',
    viewMode,
  };
}

describe('SessionMetadataStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-sess-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('load returns empty when file absent', async () => {
    const store = new SessionMetadataStore(dir);
    const data = await store.load();
    expect(data).to.deep.equal({});
  });

  it('save and load roundtrip preserves selections and colors', async () => {
    const store = new SessionMetadataStore(dir);
    const data = {
      '/repo': [
        { selection: makeSelection(), enabled: true },
        {
          selection: makeSelection('projected-footprint'),
          enabled: false,
          customColor: { background: '#4ade8040', border: '#4ade80ff' },
        },
      ],
    };
    await store.save(data);
    const loaded = await store.load();
    expect(loaded['/repo']).to.have.lengthOf(2);
    expect(loaded['/repo'][1].customColor).to.deep.equal({
      background: '#4ade8040',
      border: '#4ade80ff',
    });
    expect(loaded['/repo'][1].enabled).to.be.false;
  });

  it('save overwrites previous data', async () => {
    const store = new SessionMetadataStore(dir);
    await store.save({ '/repo': [{ selection: makeSelection(), enabled: true }] });
    await store.save({ '/other': [{ selection: makeSelection(), enabled: true }] });
    const loaded = await store.load();
    expect(Object.keys(loaded)).to.deep.equal(['/other']);
  });
});
