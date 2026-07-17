import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BlameCacheStore } from '../../src/highlight/blameCacheStore';
import type { BlameLine } from '../../src/git/blameParser';

function makeBlame(line: number): BlameLine {
  return {
    commitHash: 'a'.repeat(40),
    shortHash: 'aaaaaaa',
    finalLine: line,
    originalLine: line,
    isBoundary: false,
    isUncommitted: false,
    summary: 'msg',
    authorName: 'T',
    authorEmail: 't@t.t',
    authorTimestamp: 1,
    content: '',
  };
}

describe('BlameCacheStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-blame-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('load returns empty when file absent', async () => {
    const store = new BlameCacheStore(dir);
    expect(await store.load()).to.deep.equal({});
  });

  it('save and load roundtrip preserves blame lines', async () => {
    const store = new BlameCacheStore(dir);
    const key = '/repo::HEAD::a.txt::abc';
    const data = { [key]: [makeBlame(1), makeBlame(2)] };
    await store.save(data);
    const loaded = await store.load();
    expect(loaded[key]).to.have.lengthOf(2);
    expect(loaded[key][0].finalLine).to.equal(1);
    expect(loaded[key][1].commitHash).to.equal('a'.repeat(40));
  });

  it('save overwrites previous data', async () => {
    const store = new BlameCacheStore(dir);
    await store.save({ k1: [makeBlame(1)] });
    await store.save({ k2: [makeBlame(2)] });
    const loaded = await store.load();
    expect(Object.keys(loaded)).to.deep.equal(['k2']);
  });
});
