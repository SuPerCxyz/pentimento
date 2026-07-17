/**
 * 解析 `git diff --name-status -z` 输出。
 *
 * -z 以 NUL 分隔记录。rename/copy 记录为:状态(Rxx/Cxx)\0 oldPath \0 newPath \0;
 * 其他状态(A/M/D/T)为:状态 \0 path \0。
 */

export interface FileStatusEntry {
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-change';
  oldPath?: string;
  newPath: string;
  similarity?: number;
}

export function parseFileStatus(input: string): FileStatusEntry[] {
  if (!input) {
    return [];
  }
  const tokens = input.split('\0');
  const entries: FileStatusEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i];
    if (status === undefined || status === '') {
      i++;
      continue;
    }
    const code = status[0];
    if (code === 'R' || code === 'C') {
      const sim = Number(status.slice(1));
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (newPath === undefined) {
        break;
      }
      entries.push({
        status: code === 'R' ? 'renamed' : 'copied',
        oldPath,
        newPath,
        similarity: Number.isFinite(sim) ? sim : undefined,
      });
      i += 3;
    } else if (code === 'A' || code === 'M' || code === 'D' || code === 'T') {
      const newPath = tokens[i + 1];
      if (newPath === undefined) {
        break;
      }
      entries.push({
        status:
          code === 'A'
            ? 'added'
            : code === 'D'
              ? 'deleted'
              : code === 'T'
                ? 'type-change'
                : 'modified',
        newPath,
      });
      i += 2;
    } else {
      i += 1;
    }
  }
  return entries;
}
