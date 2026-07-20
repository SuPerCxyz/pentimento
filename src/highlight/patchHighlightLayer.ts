import type { HistoricalPatchViewMode, PatchModel, PatchSelection } from '../patch/models';
import { DEFAULT_MAX_ACTIVE_PATCHES } from '../constants';

/** 多 Patch 图层(见 docs/TECHNICAL_DESIGN.md 第 14.2 节)。 */
export interface PatchHighlightLayer {
  patchId: string;
  selection: PatchSelection;
  patch: PatchModel;
  enabled: boolean;
  displayRevision: string;
  viewMode: HistoricalPatchViewMode;
  colorSlot: number; // 0..5
  /** 自定义颜色(覆盖 colorSlot);为 hex 字符串,如 '#4ade8040'。 */
  customColor?: { background: string; border: string };
  label: string;
  createdAt: number;
  /** 提交时间(authorTimestamp),用于按 patch 时间排序;无则回退 createdAt。 */
  commitTime?: number;
}

/**
 * 生成稳定、仓库内唯一的 patchId:
 * `<repoId>:<baseHash>:<patchHash>:<viewMode>`;
 * working-tree / staged 用语义后缀。
 */
export function generatePatchId(repoId: string, selection: PatchSelection): string {
  const base =
    selection.baseRevision ??
    (selection.type === 'working-tree' ? 'working-tree' : selection.type === 'staged' ? 'staged' : '');
  const patch = selection.patchRevision ?? '';
  return `${repoId}:${base}:${patch}:${selection.viewMode}`;
}

/**
 * colorSlot 稳定哈希分配:按 patchId 哈希落到 0..5,冲突取次空槽。
 * 同一 patchId 颜色稳定;移除后释放槽位。
 */
export function assignColorSlot(patchId: string, usedSlots: Set<number>, slots = 6): number {
  let h = 0;
  for (let i = 0; i < patchId.length; i++) {
    h = (h * 31 + patchId.charCodeAt(i)) >>> 0;
  }
  const preferred = h % slots;
  if (!usedSlots.has(preferred)) {
    return preferred;
  }
  for (let s = 0; s < slots; s++) {
    if (!usedSlots.has(s)) {
      return s;
    }
  }
  return preferred; // 全满回退(不应发生,受 maxActive 限制)
}

export const DEFAULT_MAX_ACTIVE_PATCHES_CONST = DEFAULT_MAX_ACTIVE_PATCHES;
