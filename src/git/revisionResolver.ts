import type { IGitRunner } from './gitRunner';
import { GitError, classifyGitError, toUserMessage } from './gitErrors';

/**
 * Git 空树对象哈希,用作根 commit 的 base(无父提交时的 diff 基准)。
 */
export const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface ResolvedCommit {
  input: string;
  fullHash: string;
  isRange: false;
}

export interface ResolvedRange {
  baseInput: string;
  patchInput: string;
  baseHash: string;
  patchHash: string;
  isRange: true;
}

export type ResolvedRevision = ResolvedCommit | ResolvedRange;

export type SplitResult =
  | { type: 'single'; value: string }
  | { type: 'range'; base: string; patch: string }
  | { type: 'unsupported-symmetric'; value: string };

/**
 * 拆分用户输入的 Revision/Range。纯函数。
 * 注意:必须先判断 `...`(对称差),它也含 `..`。
 * P0 不支持 `a...b` 对称差,需提示用户改用 `a..b`。
 */
export function splitRangeInput(input: string): SplitResult {
  const trimmed = input.trim();
  if (trimmed.includes('...')) {
    return { type: 'unsupported-symmetric', value: trimmed };
  }
  const idx = trimmed.indexOf('..');
  if (idx >= 0) {
    return {
      type: 'range',
      base: trimmed.slice(0, idx),
      patch: trimmed.slice(idx + 2),
    };
  }
  return { type: 'single', value: trimmed };
}

/**
 * Revision 解析器。
 *
 * 安全约束:任何用户输入先经 `git rev-parse --verify <input>^{commit}`
 * 解析为完整哈希后再使用,杜绝通过 Revision 注入额外 git 参数。
 */
export class RevisionResolver {
  constructor(private readonly git: IGitRunner) {}

  async resolve(input: string, repositoryRoot: string): Promise<ResolvedRevision> {
    const split = splitRangeInput(input);
    if (split.type === 'unsupported-symmetric') {
      throw new GitError(
        'invalid-revision',
        '对称差 `a...b` 暂不支持,请使用 `a..b` 表示范围。',
      );
    }
    if (split.type === 'range') {
      const baseHash = await this.verifyOne(split.base, repositoryRoot);
      const patchHash = await this.verifyOne(split.patch, repositoryRoot);
      return {
        baseInput: split.base,
        patchInput: split.patch,
        baseHash,
        patchHash,
        isRange: true,
      };
    }
    const fullHash = await this.verifyOne(split.value, repositoryRoot);
    return { input: split.value, fullHash, isRange: false };
  }

  private async verifyOne(revision: string, repositoryRoot: string): Promise<string> {
    if (!revision) {
      throw new GitError('invalid-revision', toUserMessage('invalid-revision'));
    }
    const ref = `${revision}^{commit}`;
    try {
      const out = await this.git.runText(
        ['rev-parse', '--verify', ref],
        { repositoryRoot },
      );
      const hash = out.trim();
      if (!hash) {
        throw new GitError('invalid-revision', toUserMessage('invalid-revision'));
      }
      return hash;
    } catch (e) {
      if (e instanceof GitError) {
        if (e.code === 'unknown') {
          // 根据 stderr 进一步分类
          const code = classifyGitError(e.message, -1);
          throw new GitError(code, toUserMessage(code), e);
        }
        throw e;
      }
      throw e;
    }
  }
}
