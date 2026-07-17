/**
 * 解析 `git diff --numstat -z` 输出。
 *
 * 每条记录:`<added>\t<deleted>\t<path>`,以 NUL 分隔。
 * 二进制文件的 added/deleted 为 `-`。
 */

export interface NumstatEntry {
  added: number; // 二进制为 -1
  deleted: number; // 二进制为 -1
  path: string;
  isBinary: boolean;
}

export function parseNumstat(input: string): NumstatEntry[] {
  if (!input) {
    return [];
  }
  const records = input.split('\0').filter((r) => r !== '');
  const entries: NumstatEntry[] = [];
  for (const rec of records) {
    const parts = rec.split('\t');
    if (parts.length < 3) {
      continue;
    }
    const addedStr = parts[0];
    const deletedStr = parts[1];
    const path = parts.slice(2).join('\t');
    const isBinary = addedStr === '-' || deletedStr === '-';
    entries.push({
      added: isBinary ? -1 : Number(addedStr) || 0,
      deleted: isBinary ? -1 : Number(deletedStr) || 0,
      path,
      isBinary,
    });
  }
  return entries;
}
