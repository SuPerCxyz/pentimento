import * as path from 'path';
import { runTests } from '@vscode/test-electron';

/**
 * @vscode/test-electron 入口。
 * 下载临时 VSCode 实例,加载本插件,并运行 out-test/test/integration 下的集成测试。
 */
async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '..');
    const extensionTestsPath = path.resolve(
      __dirname,
      '..',
      'out-test',
      'test',
      'integration',
      'index.js',
    );
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
    });
  } catch (err) {
    console.error('Failed to run Pentimento integration tests:', err);
    process.exit(1);
  }
}

main();
