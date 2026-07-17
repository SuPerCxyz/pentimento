import type { PatchLineMembership } from './lineMembershipIndex';

export interface ComposedStyle {
  style: 'single-patch' | 'multi-patch-overlap' | 'modified' | 'ambiguous';
  primaryPatchId?: string;
  patchIds: string[];
}

/**
 * 合成单行最终视觉样式(见 docs/TECHNICAL_DESIGN.md 第 27 节)。
 * 每行只产出一种样式,禁无序半透明叠加。
 */
export function composeLine(
  memberships: PatchLineMembership[],
  primaryPatchId?: string,
): ComposedStyle {
  if (memberships.length === 0) {
    return { style: 'single-patch', patchIds: [] };
  }
  const patchIds = uniquePatchIds(memberships);

  if (memberships.some((m) => m.status === 'modified')) {
    return { style: 'modified', primaryPatchId, patchIds };
  }
  if (memberships.every((m) => m.status === 'ambiguous')) {
    return { style: 'ambiguous', primaryPatchId, patchIds };
  }
  if (patchIds.length > 1) {
    return { style: 'multi-patch-overlap', primaryPatchId, patchIds };
  }
  return { style: 'single-patch', primaryPatchId: patchIds[0], patchIds };
}

function uniquePatchIds(memberships: PatchLineMembership[]): string[] {
  const seen: string[] = [];
  for (const m of memberships) {
    if (!seen.includes(m.patchId)) {
      seen.push(m.patchId);
    }
  }
  return seen;
}
