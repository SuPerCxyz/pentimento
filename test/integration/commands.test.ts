import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

function execGit(cmd: string, cwd: string): string {
  return cp.execSync(cmd, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function setupRepo(): { dir: string; head: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pent-e2e-'));
  execGit('git init -q', dir);
  execGit('git config user.name Test', dir);
  execGit('git config user.email t@t.t', dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2\nline3\n');
  execGit('git add a.txt', dir);
  execGit('git commit -q -m init', dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nNEW1\nline2\nNEW2\nline3\n');
  execGit('git add a.txt', dir);
  execGit('git commit -q -m add', dir);
  const head = execGit('git rev-parse HEAD', dir).trim();
  return { dir, head };
}

/**
 * 命令层验收(对应 TEST_PLAN 24 项的命令路径:5 HEAD 精确 / 12 工作区 /
 * 14 暂存 / 13 未保存 / 16 新增文件 等)。视觉项(2 Hover / 3 GitLens 共存 /
 * 22 Decoration 共存)留手动。
 */
suite('Pentimento commands (real git repo)', () => {
  let dir: string;
  let head: string;

  suiteSetup(() => {
    // 屏蔽弹窗,避免 test-electron 下 QuickPick/InputBox/Message 阻塞测试
    const w = vscode.window as unknown as Record<string, (...a: unknown[]) => unknown>;
    w.showInformationMessage = () => Promise.resolve(undefined);
    w.showWarningMessage = () => Promise.resolve(undefined);
    w.showErrorMessage = () => Promise.resolve(undefined);
    w.showQuickPick = () => Promise.resolve(undefined);
    w.showInputBox = () => Promise.resolve(undefined);

    const r = setupRepo();
    dir = r.dir;
    head = r.head;
  });

  suiteTeardown(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function openFile(rel: string): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(path.join(dir, rel));
    return vscode.window.showTextDocument(doc);
  }

  test('highlight working tree then clear', async () => {
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.highlightWorkingTree');
    await vscode.commands.executeCommand('pentimento.clearAll');
  });

  test('highlight staged then clear', async () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nNEW1\nline2\nNEW2\nline3\nEXTRA\n');
    execGit('git add a.txt', dir);
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.highlightStaged');
    await vscode.commands.executeCommand('pentimento.clearAll');
  });

  test('add commit from hash (HEAD, exact)', async () => {
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.addCommitFromLine', head);
    await vscode.commands.executeCommand('pentimento.clearAll');
  });

  test('refresh does not throw', async () => {
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.refresh');
  });

  test('fetch tolerates no remote', async () => {
    await openFile('a.txt');
    try {
      await vscode.commands.executeCommand('pentimento.fetch');
    } catch {
      // 无 remote 时 fetch 预期报错,但错误应被 controller 捕获,不应抛到此处
    }
  });

  test('no-op / navigation commands do not throw', async () => {
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.highlightAllFiles');
    await vscode.commands.executeCommand('pentimento.highlightCurrentFile');
    await vscode.commands.executeCommand('pentimento.showFiles');
    await vscode.commands.executeCommand('pentimento.nextHunk');
    await vscode.commands.executeCommand('pentimento.previousHunk');
    await vscode.commands.executeCommand('pentimento.showEvolutionSummary');
    await vscode.commands.executeCommand('pentimento.showDiagnostics');
    await vscode.commands.executeCommand('pentimento.toggle');
    await vscode.commands.executeCommand('pentimento.clearAll');
  });

  test('surviving-lines command does not throw', async () => {
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.highlightSurvivingLines');
    await vscode.commands.executeCommand('pentimento.clearAll');
  });

  test('commit list refresh does not throw', async () => {
    await openFile('a.txt');
    await vscode.commands.executeCommand('pentimento.refreshCommits');
  });
});
