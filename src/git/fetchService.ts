import type { IGitRunner } from './gitRunner';
import { GitError, toUserMessage } from './gitErrors';

/** 受信的 ref 字符集,防止通过 ref 注入额外 git 参数。 */
const SAFE_REF = /^[A-Za-z0-9._/+:~-]+$/;

/**
 * 受控 Git fetch 服务(P1)。
 *
 * 仅 fetch 指定 ref,不切换分支、不修改工作区、不 checkout。
 * 用于本地不存在 `refs/changes/...` / `refs/pull/.../head` 等远端 ref 时,
 * 在 VSCode UI 内安全 fetch(不要求用户打开终端)。
 */
export class FetchService {
  constructor(private readonly git: IGitRunner) {}

  async fetchRef(repoRoot: string, ref: string): Promise<void> {
    if (!SAFE_REF.test(ref)) {
      throw new GitError('invalid-revision', toUserMessage('invalid-revision'));
    }
    await this.git.run(['fetch', '--', 'origin', ref], { repositoryRoot: repoRoot });
  }

  /**
   * fetch origin(不指定 ref):拉取默认 refspec。
   * 仅更新 remote-tracking ref,不切换分支、不修改工作区、不 checkout。
   */
  async fetchOrigin(repoRoot: string): Promise<void> {
    await this.git.run(['fetch', 'origin'], { repositoryRoot: repoRoot });
  }
}
