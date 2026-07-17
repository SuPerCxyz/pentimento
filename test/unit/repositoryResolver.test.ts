import { expect } from 'chai';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { IGitRunner, GitRunResult } from '../../src/git/gitRunner';
import {
  RepositoryResolver,
  normalizeRoot,
  computeRepositoryId,
  findRepositoryForPath,
} from '../../src/git/repositoryResolver';
import { GitError } from '../../src/git/gitErrors';

interface FakeGit extends IGitRunner {
  calls: number;
}

function fakeGit(toplevel: string, bare = 'false'): FakeGit {
  let calls = 0;
  const obj: FakeGit = {
    calls,
    async runText(args: string[]): Promise<string> {
      calls++;
      obj.calls = calls;
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return toplevel + '\n';
      }
      if (args[0] === 'rev-parse' && args[1] === '--is-bare-repository') {
        return bare + '\n';
      }
      throw new GitError('unknown', 'unexpected fake call');
    },
    async run(args: string[]): Promise<GitRunResult> {
      const t = await obj.runText(args);
      return { stdout: Buffer.from(t, 'utf8'), stderr: '', exitCode: 0, durationMs: 0 };
    },
  };
  return obj;
}

describe('repositoryResolver (pure functions)', () => {
  it('computeRepositoryId is a stable 16-hex string', () => {
    const id = computeRepositoryId('/some/path');
    expect(id).to.match(/^[0-9a-f]{16}$/);
    expect(computeRepositoryId('/some/path')).to.equal(id);
  });
  it('findRepositoryForPath picks the longest matching prefix', () => {
    const a = path.resolve('/repo');
    const b = path.resolve('/repo/sub');
    const f = path.resolve('/repo/sub/file.txt');
    expect(findRepositoryForPath([a, b], f)).to.equal(b);
  });
  it('findRepositoryForPath returns undefined when nothing matches', () => {
    expect(
      findRepositoryForPath([path.resolve('/other')], path.resolve('/repo/f.txt')),
    ).to.be.undefined;
  });
});

describe('RepositoryResolver', () => {
  it('resolves a repository and caches it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-repo-'));
    try {
      const git = fakeGit(dir, 'false');
      const resolver = new RepositoryResolver(git);
      const file = path.join(dir, 'x.txt');
      const r1 = await resolver.resolveRepository(file);
      expect(r1?.root).to.equal(normalizeRoot(dir));
      expect(r1?.repositoryId).to.match(/^[0-9a-f]{16}$/);
      expect(r1?.bare).to.be.false;
      const callsAfterFirst = git.calls;
      const r2 = await resolver.resolveRepository(file);
      expect(r2).to.deep.equal(r1);
      expect(git.calls).to.equal(callsAfterFirst); // 命中缓存
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('returns undefined when not a repository', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-norepo-'));
    try {
      const git: IGitRunner = {
        runText: async () => {
          throw new GitError('not-a-repository', 'not a git repository');
        },
        run: async () => {
          throw new GitError('not-a-repository', 'not a git repository');
        },
      };
      const resolver = new RepositoryResolver(git);
      const r = await resolver.resolveRepository(path.join(dir, 'x.txt'));
      expect(r).to.be.undefined;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('invalidate clears the cache', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-repo2-'));
    try {
      const git = fakeGit(dir, 'false');
      const resolver = new RepositoryResolver(git);
      const file = path.join(dir, 'y.txt');
      await resolver.resolveRepository(file);
      const calls1 = git.calls;
      resolver.invalidate(dir);
      await resolver.resolveRepository(file);
      expect(git.calls).to.be.greaterThan(calls1); // 失效后重新调用 git
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
