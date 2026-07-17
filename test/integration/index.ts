import Mocha from 'mocha';

/**
 * 集成测试入口(@vscode/test-electron 调用)。
 *
 * 阶段 1:空实现,直接通过,验证 Extension Host 下能成功加载插件。
 * 后续阶段在此 glob 加载 test/integration/*.test.ts 编译产物。
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });

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
