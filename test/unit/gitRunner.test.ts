import { expect } from 'chai';
import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { GitRunner } from '../../src/git/gitRunner';
import { GitError } from '../../src/git/gitErrors';
import { CancellationTokenSource } from '../../src/utils/cancellation';

/** 创建一个临时 git 仓库并提交一个文件。 */
function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-gitrunner-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@t.com', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  execSync('git add a.txt', { cwd: dir });
  execSync('git commit -qm init', { cwd: dir });
  return dir;
}

function runner(): GitRunner {
  return new GitRunner({
    timeout: 15000,
    maxOutputBytes: 1024 * 1024,
    maxConcurrent: 4,
  });
}

describe('GitRunner (real git)', () => {
  it('runs git --version', async () => {
    const out = await runner().runText(['--version']);
    expect(out).to.match(/git version/);
  });

  it('rejects with command-cancelled when already cancelled', async () => {
    const cts = new CancellationTokenSource();
    cts.cancel();
    try {
      await runner().runText(['--version'], { token: cts.token });
      expect.fail('should have rejected');
    } catch (e) {
      expect(e).to.be.instanceOf(GitError);
      expect((e as GitError).code).to.equal('command-cancelled');
    }
  });

  it('classifies not-a-repository outside a repo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-norepo-'));
    try {
      await runner().runText(['rev-parse', '--show-toplevel'], { cwd: dir });
      expect.fail('should reject');
    } catch (e) {
      expect((e as GitError).code).to.equal('not-a-repository');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves HEAD in a temp repo to a 40-char hash', async () => {
    const repo = tmpRepo();
    try {
      const hash = (await runner().runText(['rev-parse', 'HEAD'], { cwd: repo })).trim();
      expect(hash).to.match(/^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('classifies an invalid revision in a repo', async () => {
    const repo = tmpRepo();
    try {
      await runner().runText(['rev-parse', '--verify', 'nope-nope^{commit}'], {
        cwd: repo,
      });
      expect.fail('should reject');
    } catch (e) {
      const code = (e as GitError).code;
      expect(['invalid-revision', 'ambiguous-revision']).to.include(code);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('passes repositoryRoot via -C and resolves HEAD', async () => {
    const repo = tmpRepo();
    try {
      const hash = (await runner().runText(['rev-parse', 'HEAD'], {
        repositoryRoot: repo,
      })).trim();
      expect(hash).to.match(/^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
