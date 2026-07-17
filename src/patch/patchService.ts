import type { IGitRunner } from '../git/gitRunner';
import { GitError } from '../git/gitErrors';
import { parseFileStatus, type FileStatusEntry } from './fileStatusParser';
import { parseNumstat, type NumstatEntry } from './numstatParser';
import { parseHunks } from './unifiedDiffParser';
import type {
  AddedLineRange,
  PatchFileChange,
  PatchFileStatus,
  PatchModel,
  PatchSelection,
} from './models';

export type DiffMode = 'name-status' | 'numstat' | 'unified';

/**
 * 构造 git diff 参数。纯函数。
 *
 * - commit/range:带 base/target;
 * - working-tree:无 rev(index<->worktree);
 * - staged:`--cached`(HEAD<->index)。
 */
export function diffArgs(selection: PatchSelection, mode: DiffMode, filePath?: string): string[] {
  const args = ['diff'];
  if (selection.type === 'staged') {
    args.push('--cached');
  }
  if (mode === 'name-status') {
    args.push('--name-status', '-z', '--find-renames', '--find-copies');
  } else if (mode === 'numstat') {
    args.push('--numstat', '-z');
  } else {
    args.push('--unified=0', '--no-color');
  }
  if (selection.type === 'commit' || selection.type === 'range') {
    if (selection.baseRevision) {
      args.push(selection.baseRevision);
    }
    if (selection.patchRevision) {
      args.push(selection.patchRevision);
    }
  }
  if (filePath) {
    args.push('--', filePath);
  }
  return args;
}

function matchNumstat(numstats: NumstatEntry[], st: FileStatusEntry): NumstatEntry | undefined {
  return numstats.find((n) => n.path === st.newPath || (st.oldPath !== undefined && n.path === st.oldPath));
}

function toFileStatus(st: FileStatusEntry, isBinary: boolean): PatchFileStatus {
  if (isBinary) {
    return 'binary';
  }
  return st.status as PatchFileStatus;
}

function countFromRanges(ranges: AddedLineRange[]): number {
  return ranges.reduce((s, r) => s + (r.endLine - r.startLine + 1), 0);
}

/**
 * Patch 编排服务:运行 git diff(name-status / numstat / 逐文件 unified),
 * 组装 PatchModel。仅依赖 IGitRunner,可注入测试。
 */
export class PatchService {
  constructor(private readonly git: IGitRunner) {}

  async buildPatch(selection: PatchSelection): Promise<PatchModel> {
    const repo = selection.repositoryRoot;
    const statusOut = await this.git.runText(diffArgs(selection, 'name-status'), {
      repositoryRoot: repo,
    });
    const statuses = parseFileStatus(statusOut);
    const numstatOut = await this.git.runText(diffArgs(selection, 'numstat'), {
      repositoryRoot: repo,
    });
    const numstats = parseNumstat(numstatOut);

    const files: PatchFileChange[] = [];
    for (const st of statuses) {
      const numstat = matchNumstat(numstats, st);
      let isBinary = numstat?.isBinary ?? false;
      let addedRanges: AddedLineRange[] = [];
      if (!isBinary) {
        try {
          const diffOut = await this.git.runText(
            diffArgs(selection, 'unified', st.newPath),
            { repositoryRoot: repo },
          );
          addedRanges = parseHunks(diffOut).flatMap((h) => h.addedRanges);
        } catch (e) {
          if (e instanceof GitError && e.code === 'binary-file') {
            isBinary = true;
          } else {
            throw e;
          }
        }
      }
      files.push({
        oldPath: st.oldPath,
        newPath: st.newPath,
        displayPath: st.newPath,
        status: toFileStatus(st, isBinary),
        similarity: st.similarity,
        addedLineCount: isBinary ? 0 : (numstat?.added ?? countFromRanges(addedRanges)),
        deletedLineCount: isBinary ? 0 : (numstat?.deleted ?? 0),
        originalAddedRanges: addedRanges,
      });
    }

    const totalAddedLines = files.reduce((s, f) => s + Math.max(0, f.addedLineCount), 0);
    const totalDeletedLines = files.reduce((s, f) => s + Math.max(0, f.deletedLineCount), 0);

    return {
      selection,
      files,
      totalAddedLines,
      totalDeletedLines,
      createdAt: Date.now(),
    };
  }
}
