import { expect } from 'chai';
import {
  classifyGitError,
  toUserMessage,
  GitError,
  type GitErrorCode,
} from '../../src/git/gitErrors';

describe('gitErrors', () => {
  it('classifies not-a-repository', () => {
    expect(classifyGitError('fatal: not a git repository (or any of the parent directories): .git', 128)).to.equal('not-a-repository');
  });
  it('classifies ambiguous-revision', () => {
    expect(classifyGitError("fatal: ambiguous argument 'main'", 128)).to.equal('ambiguous-revision');
  });
  it('classifies invalid-revision (bad revision)', () => {
    expect(classifyGitError('fatal: bad revision nope', 128)).to.equal('invalid-revision');
  });
  it('classifies invalid-revision (needed a single revision)', () => {
    expect(classifyGitError('fatal: needed a single revision', 128)).to.equal('invalid-revision');
  });
  it('classifies file-not-found', () => {
    expect(classifyGitError("fatal: pathspec 'x' did not match any files", 128)).to.equal('file-not-found');
  });
  it('classifies permission-denied', () => {
    expect(classifyGitError('error: permission denied', 1)).to.equal('permission-denied');
  });
  it('classifies worktree-conflict', () => {
    expect(classifyGitError('error: worktree already exists', 128)).to.equal('worktree-conflict');
  });
  it('classifies dirty-worktree', () => {
    expect(classifyGitError('error: Your local changes would be overwritten by checkout', 1)).to.equal('dirty-worktree');
  });
  it('classifies binary-file', () => {
    expect(classifyGitError('Binary files a and b differ', 1)).to.equal('binary-file');
  });
  it('falls back to unknown', () => {
    expect(classifyGitError('something unexpected', 1)).to.equal('unknown');
  });
  it('toUserMessage returns non-empty user-readable strings', () => {
    const codes: GitErrorCode[] = [
      'git-not-found', 'invalid-revision', 'ambiguous-revision', 'binary-file', 'unknown',
    ];
    for (const c of codes) {
      expect(toUserMessage(c)).to.be.a('string').and.not.empty;
    }
  });
  it('GitError preserves code, message and cause', () => {
    const cause = new Error('root cause');
    const e = new GitError('command-timeout', 'timed out', cause);
    expect(e).to.be.instanceOf(Error);
    expect(e.code).to.equal('command-timeout');
    expect(e.message).to.equal('timed out');
    expect(e.cause).to.equal(cause);
  });
});
