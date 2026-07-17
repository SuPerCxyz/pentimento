import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitRunner } from '../../src/git/gitRunner';
import { PatchService } from '../../src/patch/patchService';
import { RevisionResolver } from '../../src/git/revisionResolver';
import { BlameProvider } from '../../src/git/blameProvider';
import { findSurvivingRanges } from '../../src/patch/survivingLineMapper';
import { WorktreeManager } from '../../src/git/worktreeManager';
import { resolveHistoricalPaths } from '../../src/git/pathEvolutionResolver';
import { GitError } from '../../src/git/gitErrors';
import { createCommitGraph, cleanupGraph, type CommitGraph } from '../fixtures/commitGraph';

function runner() {
  return new GitRunner({ timeout: 20000, maxOutputBytes: 8 * 1024 * 1024, maxConcurrent: 4 });
}

describe('integration: commit graph (real git)', function () {
  this.timeout(60000);
  let graph: CommitGraph;

  before(() => {
    graph = createCommitGraph();
  });
  after(() => cleanupGraph(graph));

  it('buildPatch A..B adds foo lines to file.py', async () => {
    const svc = new PatchService(runner());
    const model = await svc.buildPatch({
      repositoryRoot: graph.root,
      type: 'range',
      baseRevision: graph.commits.A,
      patchRevision: graph.commits.B,
      displayRevision: graph.commits.B,
      displayName: 'B',
      viewMode: 'exact-patch-revision',
    });
    expect(model.files).to.have.lengthOf(1);
    expect(model.files[0].newPath).to.equal('file.py');
    expect(model.files[0].status).to.equal('modified');
    expect(model.totalAddedLines).to.be.gte(20);
  });

  it('buildPatch D..E detects rename file.py -> src/new_file.py', async () => {
    const svc = new PatchService(runner());
    const model = await svc.buildPatch({
      repositoryRoot: graph.root,
      type: 'range',
      baseRevision: graph.commits.D,
      patchRevision: graph.commits.E,
      displayRevision: graph.commits.E,
      displayName: 'E',
      viewMode: 'exact-patch-revision',
    });
    const renamed = model.files.find((f) => f.status === 'renamed');
    expect(renamed, 'expected a renamed file').to.not.be.undefined;
    expect(renamed!.oldPath).to.equal('file.py');
    expect(renamed!.newPath).to.equal('src/new_file.py');
  });

  it('surviving lines of B still exist in HEAD (no old line numbers)', async () => {
    const blameProvider = new BlameProvider(runner());
    const blame = await blameProvider.blameFile(graph.root, 'src/new_file.py');
    const surviving = findSurvivingRanges(blame, new Set([graph.commits.B]));
    expect(surviving.length).to.be.greaterThan(0);
    // 行号移动后(C 前置 30 行),存活行 > 30,而非 B 原始的小行号
    expect(surviving[0].startLine).to.be.greaterThan(30);
    // D 修改了 5 行 -> 这些行不再归属 B
    const survivingLineCount = surviving.reduce((s, r) => s + (r.endLine - r.startLine + 1), 0);
    expect(survivingLineCount).to.be.lessThan(20);
  });

  it('revisionResolver resolves HEAD, range, and non-ancestor X', async () => {
    const rev = new RevisionResolver(runner());
    const head = await rev.resolve('HEAD', graph.root);
    expect(head.isRange).to.be.false;
    const range = await rev.resolve(`${graph.commits.A}..${graph.commits.B}`, graph.root);
    expect(range.isRange).to.be.true;
    // X 不在 HEAD 祖先链
    const g = runner();
    let isAncestor = true;
    try {
      await g.run(['merge-base', '--is-ancestor', graph.commits.X, graph.head], {
        repositoryRoot: graph.root,
      });
    } catch {
      isAncestor = false;
    }
    expect(isAncestor).to.be.false;
  });

  it('creates and removes a managed worktree at F', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-wt-'));
    try {
      const wm = new WorktreeManager(runner(), storageRoot);
      const repo = { root: graph.root, repositoryId: 'testrepo' };
      const ws = await wm.createOrReuse(repo, graph.commits.F, graph.commits.E);
      expect(fs.existsSync(path.join(ws.worktreePath, 'src/new_file.py'))).to.be.true;
      await wm.remove(repo, ws);
      // reuse:再次创建应成功(已 remove 则重新 add)
      const ws2 = await wm.createOrReuse(repo, graph.commits.F, graph.commits.E);
      await wm.remove(repo, ws2);
    } finally {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('rejects removal of a path outside managed storage', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-wt2-'));
    try {
      const wm = new WorktreeManager(runner(), storageRoot);
      const repo = { root: graph.root, repositoryId: 'testrepo' };
      const outside = path.join(os.tmpdir(), 'pent-outside-' + Date.now());
      fs.mkdirSync(outside, { recursive: true });
      try {
        await wm.remove(repo, {
          repositoryRoot: graph.root,
          repositoryId: 'testrepo',
          worktreePath: outside,
          baseRevision: '',
          patchRevision: graph.commits.F,
          createdAt: 0,
          lastOpenedAt: 0,
          vscodeWorkspaceOpened: false,
        });
        expect.fail('should reject outside path');
      } catch (e) {
        expect((e as GitError).code).to.equal('worktree-conflict');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('resolveHistoricalPaths follows rename file.py -> src/new_file.py', async () => {
    const paths = await resolveHistoricalPaths(runner(), graph.root, 'src/new_file.py');
    expect(paths).to.include('src/new_file.py');
    expect(paths).to.include('file.py');
  });
});
