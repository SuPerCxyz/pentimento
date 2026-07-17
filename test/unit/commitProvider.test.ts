import { expect } from 'chai';
import type { IGitRunner, GitRunResult } from '../../src/git/gitRunner';
import { CommitProvider, parseCommitShow, COMMIT_FORMAT } from '../../src/git/commitProvider';
import { GitError } from '../../src/git/gitErrors';

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

describe('parseCommitShow', () => {
  it('parses NUL-separated commit fields', () => {
    const out = ['abc123', 'abc123', 'Zhang San', 'zhang@example.com', '1721068800', 'Zhang San', '1721068800', 'Harden multipath detach handling'].join('\0');
    const info = parseCommitShow(out);
    expect(info?.commitHash).to.equal('abc123');
    expect(info?.shortHash).to.equal('abc123');
    expect(info?.authorName).to.equal('Zhang San');
    expect(info?.authorEmail).to.equal('zhang@example.com');
    expect(info?.authorTimestamp).to.equal(1721068800);
    expect(info?.summary).to.equal('Harden multipath detach handling');
  });

  it('returns undefined for malformed output', () => {
    expect(parseCommitShow('only\tone\tfield')).to.be.undefined;
    expect(parseCommitShow('')).to.be.undefined;
  });

  it('handles missing optional fields gracefully', () => {
    const out = ['abc', 'abc', 'Author', '', '0', '', '', 'Summary'].join('\0');
    const info = parseCommitShow(out);
    expect(info?.authorEmail).to.be.undefined;
    expect(info?.committerTimestamp).to.be.undefined;
  });
});

describe('CommitProvider', () => {
  it('returns parsed commit info', async () => {
    const fields = ['FULLHASH', 'FULLHASH', 'Zhang San', 'z@e.com', '100', 'Zhang San', '100', 'Harden multipath detach handling'];
    const git = fakeGit({
      [`show -s --format=${COMMIT_FORMAT} FULLHASH`]: fields.join('\0'),
    });
    const provider = new CommitProvider(git);
    const info = await provider.getCommitInfo('FULLHASH', '/repo');
    expect(info.commitHash).to.equal('FULLHASH');
    expect(info.summary).to.equal('Harden multipath detach handling');
  });

  it('throws invalid-revision when output is empty', async () => {
    const git = fakeGit({});
    const provider = new CommitProvider(git);
    try {
      await provider.getCommitInfo('nope', '/repo');
      expect.fail('should reject');
    } catch (e) {
      expect((e as GitError).code).to.equal('invalid-revision');
    }
  });
});
