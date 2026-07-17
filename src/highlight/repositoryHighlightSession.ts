import type { PatchModel } from '../patch/models';
import {
  type PatchHighlightLayer,
  generatePatchId,
  assignColorSlot,
} from './patchHighlightLayer';
import { DEFAULT_MAX_ACTIVE_PATCHES } from '../constants';

/** 仓库级高亮会话(见 docs/TECHNICAL_DESIGN.md 第 14.2 节)。 */
export interface RepositoryHighlightSession {
  repositoryRoot: string;
  patchLayers: Map<string, PatchHighlightLayer>;
  primaryPatchId?: string;
  enabled: boolean;
  displayRevision: string;
  currentFileOnly: boolean;
  createdAt: number;
  updatedAt: number;
}

export function createSession(
  repositoryRoot: string,
  displayRevision: string,
): RepositoryHighlightSession {
  const now = Date.now();
  return {
    repositoryRoot,
    patchLayers: new Map(),
    primaryPatchId: undefined,
    enabled: true,
    displayRevision,
    currentFileOnly: false,
    createdAt: now,
    updatedAt: now,
  };
}

export type AddPatchReason = 'ok' | 'limit-exceeded' | 'display-revision-mismatch';

export interface AddPatchOptions {
  replace?: boolean;
  maxActive?: number;
}

export interface AddPatchResult {
  reason: AddPatchReason;
  layer?: PatchHighlightLayer;
  removed?: PatchHighlightLayer[];
}

/**
 * 向会话添加一个 Patch 图层。
 *
 * - replace=true:清除现有图层,仅留当前;
 * - 同 patchId 幂等:更新 patch 数据,保留 enabled/colorSlot;
 * - 超过 maxActive 且非已存在:返回 limit-exceeded;
 * - displayRevision 不一致:返回 mismatch(精确 worktree 有独立会话)。
 */
export function addPatch(
  session: RepositoryHighlightSession,
  repoId: string,
  patch: PatchModel,
  opts: AddPatchOptions = {},
): AddPatchResult {
  const patchId = generatePatchId(repoId, patch.selection);
  const max = opts.maxActive ?? DEFAULT_MAX_ACTIVE_PATCHES;

  if (
    patch.selection.displayRevision &&
    patch.selection.displayRevision !== session.displayRevision
  ) {
    return { reason: 'display-revision-mismatch' };
  }

  if (!opts.replace && !session.patchLayers.has(patchId) && session.patchLayers.size >= max) {
    return { reason: 'limit-exceeded' };
  }

  let removed: PatchHighlightLayer[] | undefined;
  if (opts.replace) {
    removed = [...session.patchLayers.values()];
    session.patchLayers.clear();
    session.primaryPatchId = undefined;
  }

  const existing = session.patchLayers.get(patchId);
  if (existing) {
    existing.patch = patch;
    if (!session.primaryPatchId) {
      session.primaryPatchId = patchId;
    }
    session.updatedAt = Date.now();
    return { reason: 'ok', layer: existing, removed };
  }

  const usedSlots = new Set<number>();
  for (const l of session.patchLayers.values()) {
    if (l.enabled) {
      usedSlots.add(l.colorSlot);
    }
  }
  const colorSlot = assignColorSlot(patchId, usedSlots);
  const layer: PatchHighlightLayer = {
    patchId,
    selection: patch.selection,
    patch,
    enabled: true,
    displayRevision: session.displayRevision,
    viewMode: patch.selection.viewMode,
    colorSlot,
    label: patch.selection.displayName,
    createdAt: Date.now(),
  };
  session.patchLayers.set(patchId, layer);
  if (!session.primaryPatchId) {
    session.primaryPatchId = patchId;
  }
  session.updatedAt = Date.now();
  return { reason: 'ok', layer, removed };
}

export function removePatch(session: RepositoryHighlightSession, patchId: string): PatchHighlightLayer | undefined {
  const layer = session.patchLayers.get(patchId);
  if (!layer) {
    return undefined;
  }
  session.patchLayers.delete(patchId);
  if (session.primaryPatchId === patchId) {
    session.primaryPatchId = [...session.patchLayers.keys()][0];
  }
  session.updatedAt = Date.now();
  return layer;
}

export function setLayerEnabled(
  session: RepositoryHighlightSession,
  patchId: string,
  enabled: boolean,
): boolean {
  const layer = session.patchLayers.get(patchId);
  if (!layer) {
    return false;
  }
  layer.enabled = enabled;
  session.updatedAt = Date.now();
  return true;
}

export function setPrimary(session: RepositoryHighlightSession, patchId: string): boolean {
  if (!session.patchLayers.has(patchId)) {
    return false;
  }
  session.primaryPatchId = patchId;
  session.updatedAt = Date.now();
  return true;
}

export function showOnly(session: RepositoryHighlightSession, patchId: string): boolean {
  if (!session.patchLayers.has(patchId)) {
    return false;
  }
  for (const [id, layer] of session.patchLayers) {
    layer.enabled = id === patchId;
  }
  session.primaryPatchId = patchId;
  session.updatedAt = Date.now();
  return true;
}

export function showAll(session: RepositoryHighlightSession): void {
  for (const layer of session.patchLayers.values()) {
    layer.enabled = true;
  }
  session.updatedAt = Date.now();
}

export function hideAll(session: RepositoryHighlightSession): void {
  for (const layer of session.patchLayers.values()) {
    layer.enabled = false;
  }
  session.updatedAt = Date.now();
}

export function clearAll(session: RepositoryHighlightSession): void {
  session.patchLayers.clear();
  session.primaryPatchId = undefined;
  session.updatedAt = Date.now();
}

export function activeLayerCount(session: RepositoryHighlightSession): number {
  let n = 0;
  for (const l of session.patchLayers.values()) {
    if (l.enabled) {
      n++;
    }
  }
  return n;
}
