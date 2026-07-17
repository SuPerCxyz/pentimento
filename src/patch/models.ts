/**
 * Patch 核心数据结构(见 docs/TECHNICAL_DESIGN.md 第 11 节)。
 *
 * 硬约束:PatchSelectionType 永不含 'patch-file'(不支持外部 patch 文件)。
 */

export type PatchSelectionType = 'commit' | 'range' | 'working-tree' | 'staged';

export type HistoricalPatchViewMode =
  | 'exact-patch-revision'
  | 'surviving-lines'
  | 'projected-footprint';

export interface PatchSelection {
  repositoryRoot: string;
  type: PatchSelectionType;
  baseRevision?: string;
  patchRevision?: string;
  displayRevision?: string;
  commitHash?: string;
  displayName: string;
  viewMode: HistoricalPatchViewMode;
}

/** Git 1-based inclusive 行范围。 */
export interface AddedLineRange {
  startLine: number;
  endLine: number;
}

export type ProjectedLineStatus =
  | 'unchanged'
  | 'moved'
  | 'modified'
  | 'deleted'
  | 'ambiguous'
  | 'file-missing';

export type MappingConfidence = 'high' | 'medium' | 'low';

export interface ProjectedAddedRange {
  originalStartLine: number;
  originalEndLine: number;
  currentStartLine?: number;
  currentEndLine?: number;
  status: ProjectedLineStatus;
  confidence: MappingConfidence;
}

export type PatchFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'binary'
  | 'submodule';

export interface PatchFileChange {
  oldPath?: string;
  newPath?: string;
  displayPath?: string;
  status: PatchFileStatus;
  similarity?: number;
  addedLineCount: number;
  deletedLineCount: number;
  originalAddedRanges: AddedLineRange[];
  projectedRanges?: ProjectedAddedRange[];
}

export interface PatchModel {
  selection: PatchSelection;
  files: PatchFileChange[];
  totalAddedLines: number;
  totalDeletedLines: number;
  createdAt: number;
}

/** 契约:合法的 PatchSelectionType 集合(不含 patch-file)。 */
export const PATCH_SELECTION_TYPES: readonly PatchSelectionType[] = [
  'commit',
  'range',
  'working-tree',
  'staged',
];
