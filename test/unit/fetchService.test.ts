import { expect } from 'chai';
import { GitRunner } from '../../src/git/gitRunner';
import { FetchService } from '../../src/git/fetchService';
import { GitError } from '../../src/git/gitErrors';

describe('FetchService', () => {
  const runner = () => new GitRunner({ timeout: 5000, maxOutputBytes: 1024, maxConcurrent: 1 });

  it('rejects unsafe ref characters (injection guard)', async () => {
    const svc = new FetchService(runner());
    for (const bad of ['evil;rm -rf', 'a --upload-pack=x', 'a$(shell)', 'a b']) {
      try {
        await svc.fetchRef('/repo', bad);
        expect.fail(`should reject ${bad}`);
      } catch (e) {
        expect((e as GitError).code).to.equal('invalid-revision');
      }
    }
  });

  it('accepts typical remote refs', async () => {
    const svc = new FetchService(runner());
    // 仅校验 ref 字符合法即放行到 git fetch(此处不实际执行远程 fetch,
    // 用一个不存在的仓库路径,期望 git 报错而非 ref 校验失败)
    for (const ok of ['refs/changes/43/93143/8', 'refs/pull/123/head', 'refs/merge-requests/123/head', 'origin/main']) {
      try {
        await svc.fetchRef('/nonexistent-repo-' + Date.now(), ok);
      } catch (e) {
        // 期望错误不是 invalid-revision(而是 git 报 not-a-repository 等)
        expect((e as GitError).code).to.not.equal('invalid-revision');
      }
    }
  });

  it('fetchOrigin runs git fetch origin without ref validation', async () => {
    const svc = new FetchService(runner());
    try {
      await svc.fetchOrigin('/nonexistent-repo-' + Date.now());
      expect.fail('should error on non-repo path');
    } catch (e) {
      // fetchOrigin 不做 ref 校验,错误应为 git 仓库相关,而非 invalid-revision
      expect((e as GitError).code).to.not.equal('invalid-revision');
    }
  });
});
