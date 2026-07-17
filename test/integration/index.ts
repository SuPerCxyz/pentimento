import Mocha from 'mocha';
import * as fs from 'fs';
import * as path from 'path';

/** 递归收集 *.test.js。 */
function findTests(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      findTests(p, out);
    } else if (e.name.endsWith('.test.js')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 集成测试入口(@vscode/test-electron 调用)。
 * 加载 out-test/test/integration 下所有 .test.js 文件。
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
  const testsRoot = __dirname;
  for (const f of findTests(testsRoot)) {
    mocha.addFile(f);
  }
  return new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration tests failed`));
      } else {
        resolve();
      }
    });
  });
}
