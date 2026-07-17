import { expect } from 'chai';
import type { IGitRunner, GitRunResult } from '../../src/git/gitRunner';
import { PatchService, diffArgs } from '../../src/patch/patchService';
import type { PatchSelection } from '../../src/patch/models';

function selection(type: PatchSelection['type'], base?: string, patch?: string): PatchSelection {
  return {
    repositoryRoot: '/repo',
    type,
    baseRevision: base,
    patchRevision: patch,
    displayName: 'p',
    viewMode: 'exact-patch-revision',
  };
}

/** fake git:按 args.join(' ') 映射输出。 */
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

describe('diffArgs', () => {
  it('commit name-status uses find-renames and base/target', () => {
    const args = diffArgs(selection('commit', 'AAA', 'BBB'), 'name-status');
    expect(args).to.deep.equal([
      'diff', '--name-status', '-z', '--find-renames', '--find-copies', 'AAA', 'BBB',
    ]);
  });

  it('working-tree has no revisions', () => {
    const args = diffArgs(selection('working-tree'), 'numstat');
    expect(args).to.deep.equal(['diff', '--numstat', '-z']);
  });

  it('staged adds --cached', () => {
    const args = diffArgs(selection('staged'), 'numstat');
    expect(args).to.deep.equal(['diff', '--cached', '--numstat', '-z']);
  });

  it('unified per-file appends -- path', () => {
    const args = diffArgs(selection('commit', 'A', 'B'), 'unified', 'os_brick/x.py');
    expect(args[args.length - 2]).to.equal('--');
    expect(args[args.length - 1]).to.equal('os_brick/x.py');
  });
});

describe('PatchService.buildPatch', () => {
  it('assembles PatchModel from name-status + numstat + hunks', async () => {
    const git = fakeGit({
      'diff --name-status -z --find-renames --find-copies AAA BBB': 'M\x00a.py\x00A\x00b.py\x00',
      'diff --numstat -z AAA BBB': '5\t2\ta.py\x000\t0\tb.py\x00',
      'diff --unified=0 --no-color AAA BBB -- a.py': [
        'diff --git a/a.py b/a.py', 'index 1..2 100644', '--- a/a.py', '+++ b/a.py',
        '@@ -1,2 +1,4 @@', ' ctx', '+new1', '+new2',
      ].join('\n'),
      'diff --unified=0 --no-color AAA BBB -- b.py': [
        'diff --git a/b.py b/b.py', 'index 1..2 100644', '--- a/b.py', '+++ b/b.py',
        '@@ -0,0 +1,3 @@', '+x', '+y', '+z',
      ].join('\n'),
    });
    const svc = new PatchService(git);
    const model = await svc.buildPatch(selection('commit', 'AAA', 'BBB'));
    expect(model.files).to.have.lengthOf(2);
    const a = model.files.find((f) => f.newPath === 'a.py')!;
    expect(a.status).to.equal('modified');
    expect(a.addedLineCount).to.equal(5);
    expect(a.originalAddedRanges).to.deep.equal([{ startLine: 2, endLine: 3 }]);
    const b = model.files.find((f) => f.newPath === 'b.py')!;
    expect(b.status).to.equal('added');
    expect(b.addedLineCount).to.equal(0); // numstat 0,0 (rename-only, no content)
    expect(b.originalAddedRanges).to.deep.equal([{ startLine: 1, endLine: 3 }]);
    expect(model.totalAddedLines).to.equal(5);
  });

  it('handles binary files', async () => {
    const git = fakeGit({
      'diff --name-status -z --find-renames --find-copies AAA BBB': 'M\x00bin\x00',
      'diff --numstat -z AAA BBB': '-\t-\tbin\x00',
      'diff --unified=0 --no-color AAA BBB -- bin': 'Binary files a/bin and b/bin differ',
    });
    const svc = new PatchService(git);
    const model = await svc.buildPatch(selection('commit', 'AAA', 'BBB'));
    expect(model.files[0].status).to.equal('binary');
    expect(model.files[0].addedLineCount).to.equal(0);
    expect(model.files[0].originalAddedRanges).to.deep.equal([]);
  });

  it('handles a pure-delete file (no added ranges)', async () => {
    const git = fakeGit({
      'diff --name-status -z --find-renames --find-copies AAA BBB': 'D\x00gone.py\x00',
      'diff --numstat -z AAA BBB': '0\t3\tgone.py\x00',
      'diff --unified=0 --no-color AAA BBB -- gone.py': [
        'diff --git a/gone.py b/gone.py', 'deleted file mode 100644', '--- a/gone.py', '+++ /dev/null',
        '@@ -1,3 +0,0 @@', '-a', '-b', '-c',
      ].join('\n'),
    });
    const svc = new PatchService(git);
    const model = await svc.buildPatch(selection('commit', 'AAA', 'BBB'));
    expect(model.files[0].status).to.equal('deleted');
    expect(model.files[0].originalAddedRanges).to.deep.equal([]);
    expect(model.files[0].addedLineCount).to.equal(0);
    expect(model.files[0].deletedLineCount).to.equal(3);
  });

  it('handles rename with similarity', async () => {
    const git = fakeGit({
      'diff --name-status -z --find-renames --find-copies AAA BBB': 'R100\x00old.py\x00new.py\x00',
      'diff --numstat -z AAA BBB': '0\t0\tnew.py\x00',
      'diff --unified=0 --no-color AAA BBB -- new.py': [
        'diff --git a/old.py b/new.py', 'similarity index 100%', 'rename from old.py', 'rename to new.py',
      ].join('\n'),
    });
    const svc = new PatchService(git);
    const model = await svc.buildPatch(selection('commit', 'AAA', 'BBB'));
    expect(model.files[0].status).to.equal('renamed');
    expect(model.files[0].oldPath).to.equal('old.py');
    expect(model.files[0].newPath).to.equal('new.py');
    expect(model.files[0].similarity).to.equal(100);
  });

  it('works for working-tree diff (no revisions)', async () => {
    const git = fakeGit({
      'diff --name-status -z --find-renames --find-copies': 'M\x00a.py\x00',
      'diff --numstat -z': '2\t0\ta.py\x00',
      'diff --unified=0 --no-color -- a.py': [
        'diff --git a/a.py b/a.py', '@@ -1,1 +1,3 @@', ' ctx', '+w', '+z',
      ].join('\n'),
    });
    const svc = new PatchService(git);
    const model = await svc.buildPatch(selection('working-tree'));
    expect(model.files[0].originalAddedRanges).to.deep.equal([{ startLine: 2, endLine: 3 }]);
  });
});
