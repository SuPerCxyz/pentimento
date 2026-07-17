import type { IGitRunner } from './gitRunner';

/**
 * 解析文件的历史路径演化(git log --follow,跟随 rename)。
 *
 * 返回该文件在历史 commit 中曾用过的所有路径(含当前路径)。
 * 用于 Patch 文件匹配:当历史 Patch 的文件在当前 HEAD 已被 rename,
 * 通过历史路径关联到当前文件,避免因路径变化丢失高亮。
 *
 * 注意:--follow 仅对单个文件路径有效,且较慢,调用方应缓存结果。
 */
export async function resolveHistoricalPaths(
  git: IGitRunner,
  repoRoot: string,
  currentPath: string,
): Promise<string[]> {
  const out = await git.runText(
    ['log', '--follow', '--name-only', '--format=format:', '--', currentPath],
    { repositoryRoot: repoRoot },
  );
  const paths = new Set<string>();
  for (const line of out.split('\n')) {
    const t = line.trim();
    if (t) {
      paths.add(t);
    }
  }
  return [...paths];
}
