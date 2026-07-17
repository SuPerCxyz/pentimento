/**
 * Git 错误分类与用户可读消息。
 *
 * 用户输入与 Git 输出在 GitRunner 层被结构化分类,
 * 上层只面对 GitError + GitErrorCode,不直接处理原始 stderr。
 */

export type GitErrorCode =
  | 'git-not-found'
  | 'unsupported-git-version'
  | 'not-a-repository'
  | 'invalid-revision'
  | 'ambiguous-revision'
  | 'command-timeout'
  | 'command-cancelled'
  | 'output-limit-exceeded'
  | 'worktree-conflict'
  | 'dirty-worktree'
  | 'permission-denied'
  | 'file-not-found'
  | 'binary-file'
  | 'unknown';

export class GitError extends Error {
  constructor(
    public readonly code: GitErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * 根据 git 进程的 stderr 与 exit code 推断错误类别。
 * 纯函数,便于单元测试。
 */
export function classifyGitError(stderr: string, _exitCode: number | null): GitErrorCode {
  const text = stderr ?? '';
  if (/not a git repository|not in a git repository/i.test(text)) {
    return 'not-a-repository';
  }
  if (/ambiguous argument/i.test(text)) {
    return 'ambiguous-revision';
  }
  if (/unknown revision|bad revision|needed a single revision|unknown revision or path/i.test(text)) {
    return 'invalid-revision';
  }
  if (/pathspec .* did not match any/i.test(text)) {
    return 'file-not-found';
  }
  if (/permission denied/i.test(text)) {
    return 'permission-denied';
  }
  if (/worktree/i.test(text) && /(already exists|another git|conflict|locked)/i.test(text)) {
    return 'worktree-conflict';
  }
  if (/your local changes .*(overwritten|lost)|please commit your changes/i.test(text)) {
    return 'dirty-worktree';
  }
  if (/binary files? .* differ/i.test(text)) {
    return 'binary-file';
  }
  return 'unknown';
}

/**
 * 将错误类别映射为用户可读消息。
 * 不暴露原始 git stderr。
 */
export function toUserMessage(code: GitErrorCode): string {
  switch (code) {
    case 'git-not-found':
      return '未找到 Git。请确认系统已安装 Git 并在 PATH 中。';
    case 'unsupported-git-version':
      return 'Git 版本过低,请升级到 2.20 或以上。';
    case 'not-a-repository':
      return '当前路径不在 Git 仓库中。';
    case 'invalid-revision':
      return '目标 Revision 不存在或无法解析。';
    case 'ambiguous-revision':
      return '目标 Revision 存在歧义,请使用更完整的引用。';
    case 'command-timeout':
      return 'Git 命令执行超时。';
    case 'command-cancelled':
      return 'Git 命令已取消。';
    case 'output-limit-exceeded':
      return 'Git 命令输出过大,已中止以防内存耗尽。';
    case 'worktree-conflict':
      return 'Git worktree 操作冲突。';
    case 'dirty-worktree':
      return '当前工作区有未提交修改,操作中止以保护用户改动。';
    case 'permission-denied':
      return 'Git 操作被拒绝(权限不足)。';
    case 'file-not-found':
      return '未找到目标文件。';
    case 'binary-file':
      return '该文件为二进制内容,无法按文本高亮。';
    default:
      return 'Git 操作失败。';
  }
}
