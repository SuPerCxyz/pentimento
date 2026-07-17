import { MIN_GIT_VERSION } from '../constants';
import type { IGitRunner } from './gitRunner';

export type GitVersion = readonly [number, number, number];

/** 解析 `git --version` 输出,如 "git version 2.53.0" 或 "git version 2.53.0.windows.1"。 */
export function parseGitVersion(stdout: string): GitVersion | undefined {
  const m = /git version\s+(\d+)\.(\d+)\.(\d+)/.exec((stdout ?? '').trim());
  if (!m) {
    return undefined;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 比较两个版本号。a>b 返回正数,a<b 返回负数,相等返回 0。 */
export function compareVersions(a: GitVersion, b: GitVersion): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

export function isSupported(version: GitVersion, min: GitVersion = MIN_GIT_VERSION): boolean {
  return compareVersions(version, min) >= 0;
}

export function formatVersion(v: GitVersion): string {
  return `${v[0]}.${v[1]}.${v[2]}`;
}

export interface GitVersionInfo {
  version?: GitVersion;
  available: boolean;
  error?: string;
}

/** 探测 Git 是否可用及其版本。失败不抛错,返回 available:false。 */
export async function detectGitVersion(git: IGitRunner): Promise<GitVersionInfo> {
  try {
    const out = await git.runText(['--version']);
    const version = parseGitVersion(out);
    return { version, available: !!version };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : String(e) };
  }
}
