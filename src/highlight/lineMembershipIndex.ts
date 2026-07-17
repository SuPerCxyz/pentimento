import type { AddedLineRange } from '../patch/models';

/** 单行对某 Patch 的归属。 */
export interface PatchLineMembership {
  patchId: string;
  status: 'exact' | 'surviving' | 'moved' | 'modified' | 'ambiguous';
  confidence: 'high' | 'medium' | 'low';
  originalPath?: string;
  originalStartLine?: number;
  originalEndLine?: number;
}

/** 每行合成后的最终视觉样式(表现层,行号为 0-based)。 */
export interface ComposedLineDecoration {
  line: number;
  style: 'single-patch' | 'multi-patch-overlap' | 'modified' | 'ambiguous';
  primaryPatchId?: string;
  patchIds: string[];
}

/**
 * 行归属索引:Map<docUri, Map<line(1-based), PatchLineMembership[]>>。
 * 按可见文件增量维护;图层隐藏/移除后释放其贡献。
 */
export class LineMembershipIndex {
  private readonly map = new Map<string, Map<number, PatchLineMembership[]>>();

  setLine(uri: string, line: number, memberships: PatchLineMembership[]): void {
    let docMap = this.map.get(uri);
    if (!docMap) {
      docMap = new Map();
      this.map.set(uri, docMap);
    }
    if (memberships.length === 0) {
      docMap.delete(line);
    } else {
      docMap.set(line, memberships);
    }
  }

  addMembership(uri: string, line: number, membership: PatchLineMembership): void {
    let docMap = this.map.get(uri);
    if (!docMap) {
      docMap = new Map();
      this.map.set(uri, docMap);
    }
    const arr = docMap.get(line) ?? [];
    if (!arr.some((m) => m.patchId === membership.patchId)) {
      arr.push(membership);
      docMap.set(line, arr);
    }
  }

  getLine(uri: string, line: number): PatchLineMembership[] {
    return this.map.get(uri)?.get(line) ?? [];
  }

  /** 用 AddedLineRange(1-based)批量写入某 patch 的行归属。 */
  applyRanges(uri: string, patchId: string, ranges: AddedLineRange[], status: PatchLineMembership['status'], confidence: PatchLineMembership['confidence']): void {
    for (const r of ranges) {
      for (let line = r.startLine; line <= r.endLine; line++) {
        this.addMembership(uri, line, { patchId, status, confidence });
      }
    }
  }

  removePatch(patchId: string): void {
    for (const docMap of this.map.values()) {
      for (const [line, arr] of docMap) {
        const filtered = arr.filter((m) => m.patchId !== patchId);
        if (filtered.length === 0) {
          docMap.delete(line);
        } else {
          docMap.set(line, filtered);
        }
      }
    }
  }

  clearDocument(uri: string): void {
    this.map.delete(uri);
  }

  clearAll(): void {
    this.map.clear();
  }

  /** 收集某文档所有有归属的行(用于 Decoration 下发)。 */
  entries(uri: string): Array<{ line: number; memberships: PatchLineMembership[] }> {
    const docMap = this.map.get(uri);
    if (!docMap) {
      return [];
    }
    return [...docMap.entries()].map(([line, memberships]) => ({ line, memberships }));
  }
}
