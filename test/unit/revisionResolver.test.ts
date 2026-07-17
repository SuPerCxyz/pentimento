import { expect } from 'chai';
import type { IGitRunner, GitRunResult } from '../../src/git/gitRunner';
import {
  RevisionResolver,
  splitRangeInput,
  EMPTY_TREE_HASH,
} from '../../src/git/revisionResolver';
import { GitError } from '../../src/git/gitErrors';

/** 用映射表伪造 IGitRunner:args.join(' ') 作为键。 */
function fakeGit(map: Record<string, string | Error>): IGitRunner {
  const runText = async (args: string[]): Promise<string> => {
    const key = args.join(' ');
    const val = map[key];
    if (val instanceof Error) {
      throw val;
    }
    return val ?? '';
  };
  return {
    runText,
    run: async (args: string[]): Promise<GitRunResult> => {
      const t = await runText(args);
      return { stdout: Buffer.from(t, 'utf8'), stderr: '', exitCode: 0, durationMs: 0 };
    },
  };
}

describe('splitRangeInput', () => {
  it('treats a plain revision as single', () => {
    expect(splitRangeInput('HEAD')).to.deep.equal({ type: 'single', value: 'HEAD' });
  });
  it('splits a..b into range', () => {
    expect(splitRangeInput('abc..def')).to.deep.equal({
      type: 'range',
      base: 'abc',
      patch: 'def',
    });
  });
  it('treats a...b as unsupported symmetric', () => {
    expect(splitRangeInput('a...b')).to.deep.equal({
      type: 'unsupported-symmetric',
      value: 'a...b',
    });
  });
  it('a...b is detected before a..b', () => {
    expect(splitRangeInput('a...b').type).to.equal('unsupported-symmetric');
  });
});

describe('RevisionResolver', () => {
  it('resolves a single commit to its full hash', async () => {
    const git = fakeGit({ 'rev-parse --verify HEAD^{commit}': 'abc123def456' });
    const r = new RevisionResolver(git);
    const res = await r.resolve('HEAD', '/repo');
    expect(res.isRange).to.be.false;
    if (!res.isRange) {
      expect(res.fullHash).to.equal('abc123def456');
    }
  });
  it('resolves a range into base and patch hashes', async () => {
    const git = fakeGit({
      'rev-parse --verify abc^{commit}': 'AAA',
      'rev-parse --verify def^{commit}': 'DDD',
    });
    const r = new RevisionResolver(git);
    const res = await r.resolve('abc..def', '/repo');
    expect(res.isRange).to.be.true;
    if (res.isRange) {
      expect(res.baseHash).to.equal('AAA');
      expect(res.patchHash).to.equal('DDD');
    }
  });
  it('rejects a symmetric range with invalid-revision', async () => {
    const r = new RevisionResolver(fakeGit({}));
    try {
      await r.resolve('a...b', '/repo');
      expect.fail('should reject');
    } catch (e) {
      expect((e as GitError).code).to.equal('invalid-revision');
    }
  });
  it('rejects an unknown revision with invalid-revision', async () => {
    const r = new RevisionResolver(fakeGit({}));
    try {
      await r.resolve('nope', '/repo');
      expect.fail('should reject');
    } catch (e) {
      expect((e as GitError).code).to.equal('invalid-revision');
    }
  });
  it('classifies ambiguous revision', async () => {
    const git = fakeGit({
      'rev-parse --verify main^{commit}': new GitError('unknown', "fatal: ambiguous argument 'main'"),
    });
    const r = new RevisionResolver(git);
    try {
      await r.resolve('main', '/repo');
      expect.fail('should reject');
    } catch (e) {
      expect((e as GitError).code).to.equal('ambiguous-revision');
    }
  });
  it('exposes the empty-tree hash constant', () => {
    expect(EMPTY_TREE_HASH).to.equal('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  });
});
