import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CommitGraph {
  root: string;
  commits: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'X', string>;
  head: string;
}

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}

function writeFile(cwd: string, rel: string, content: string): void {
  const full = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function fooLines(): string {
  return Array.from({ length: 20 }, (_, i) => `def foo(): line ${i}`).join('\n');
}

/**
 * 构造规格第 43 节的 commit 图(简化):
 * A 基础 file.py;B 新增 foo(20 行);C 前置 30 行(行号移动);
 * D 修改 foo 中 5 行;E 重命名 file.py -> src/new_file.py;F 删除 foo 中 3 行。
 * HEAD = F。X 从 A 分叉(非 F 祖先)。
 */
export function createCommitGraph(): CommitGraph {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-graph-'));
  git('init -q -b main', root);
  git('config user.email t@t.com', root);
  git('config user.name t', root);

  writeFile(root, 'file.py', 'class Base:\n    pass\n');
  git('add file.py', root);
  git('commit -qm A', root);
  const A = git('rev-parse HEAD', root);

  writeFile(root, 'file.py', 'class Base:\n    pass\n\n' + fooLines() + '\n');
  git('add file.py', root);
  git('commit -qm B-add-foo', root);
  const B = git('rev-parse HEAD', root);

  const prepend = Array.from({ length: 30 }, (_, i) => `# header ${i}`).join('\n') + '\n';
  writeFile(root, 'file.py', prepend + 'class Base:\n    pass\n\n' + fooLines() + '\n');
  git('add file.py', root);
  git('commit -qm C-prepend', root);
  const C = git('rev-parse HEAD', root);

  const dLines = fs.readFileSync(path.join(root, 'file.py'), 'utf8').split('\n');
  let fooStart = dLines.findIndex((l) => l.startsWith('def foo'));
  for (let i = 0; i < 5; i++) {
    dLines[fooStart + i] = `def foo(): MODIFIED ${i}`;
  }
  writeFile(root, 'file.py', dLines.join('\n'));
  git('add file.py', root);
  git('commit -qm D-modify-foo', root);
  const D = git('rev-parse HEAD', root);

  fs.mkdirSync(path.join(root, 'src'));
  git('mv file.py src/new_file.py', root);
  git('commit -qm E-rename', root);
  const E = git('rev-parse HEAD', root);

  const fLines = fs.readFileSync(path.join(root, 'src/new_file.py'), 'utf8').split('\n');
  fooStart = fLines.findIndex((l) => l.startsWith('def foo'));
  fLines.splice(fooStart, 3);
  writeFile(root, 'src/new_file.py', fLines.join('\n'));
  git('add src/new_file.py', root);
  git('commit -qm F-delete-foo', root);
  const F = git('rev-parse HEAD', root);

  // X: 从 A 分叉(非 F 祖先)
  git(`checkout -q ${A}`, root);
  git('checkout -q -b feature-x', root);
  writeFile(root, 'file.py', 'class Base:\n    pass\n# X branch\n');
  git('add file.py', root);
  git('commit -qm X', root);
  const X = git('rev-parse HEAD', root);
  git('checkout -q main', root);

  const head = git('rev-parse HEAD', root);
  return { root, commits: { A, B, C, D, E, F, X }, head };
}

export function cleanupGraph(g: CommitGraph): void {
  try {
    fs.rmSync(g.root, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
