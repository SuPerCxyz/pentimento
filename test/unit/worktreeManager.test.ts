import { expect } from 'chai';
import {
  worktreePathFor,
  managedRootFor,
  isUnderManagedPath,
} from '../../src/git/worktreeManager';

describe('worktreeManager (pure functions)', () => {
  it('worktreePathFor joins storage/worktrees/repoId/patchHash', () => {
    const p = worktreePathFor('/storage', 'repoAB12', 'deadbeef');
    expect(p).to.equal(['/storage', 'worktrees', 'repoAB12', 'deadbeef'].join('/'));
  });

  it('managedRootFor is storage/worktrees/repoId', () => {
    expect(managedRootFor('/storage', 'repoAB12')).to.equal(['/storage', 'worktrees', 'repoAB12'].join('/'));
  });

  it('isUnderManagedPath accepts a child path', () => {
    const root = managedRootFor('/storage', 'repoAB12');
    expect(isUnderManagedPath(root, worktreePathFor('/storage', 'repoAB12', 'deadbeef'))).to.be.true;
  });

  it('isUnderManagedPath rejects the managed root itself', () => {
    const root = managedRootFor('/storage', 'repoAB12');
    expect(isUnderManagedPath(root, root)).to.be.false;
  });

  it('isUnderManagedPath rejects a sibling or outside path', () => {
    const root = managedRootFor('/storage', 'repoAB12');
    expect(isUnderManagedPath(root, '/storage/worktrees/repoAB12')).to.be.false; // equals root
    expect(isUnderManagedPath(root, '/storage/worktrees/repoCD34/deadbeef')).to.be.false;
    expect(isUnderManagedPath(root, '/home/user/project')).to.be.false;
    expect(isUnderManagedPath(root, '/storage/worktrees/repoAB12X/extra')).to.be.false; // prefix without sep
  });

  it('resists path traversal (..)', () => {
    const root = managedRootFor('/storage', 'repoAB12');
    expect(isUnderManagedPath(root, '/storage/worktrees/repoAB12/../../etc/passwd')).to.be.false;
  });
});
