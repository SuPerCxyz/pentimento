import { expect } from 'chai';
import * as vscode from 'vscode';
import { Commands } from '../../src/constants';

const EXTENSION_ID = 'pentimento-contributors.pentimento';

/** 激活与命令注册验收(对应 TEST_PLAN 24 项的第 1 项:纯页面操作可用)。 */
suite('Pentimento activation', () => {
  test('extension is installed and active', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    expect(ext, `extension ${EXTENSION_ID} not found`).to.not.be.undefined;
    if (!ext!.isActive) {
      await ext!.activate();
    }
    expect(ext!.isActive, 'extension should be active').to.be.true;
  });

  test('all 36 commands are registered', async () => {
    const cmds = await vscode.commands.getCommands(true);
    const ids = Object.values(Commands) as string[];
    expect(ids).to.have.lengthOf(36);
    for (const id of ids) {
      expect(cmds, `command not registered: ${id}`).to.include(id);
    }
  });

  test('patches tree view is registered', async () => {
    // createTreeView 在 view 未注册时抛错;此处仅断言不抛。
    const tree = vscode.window.createTreeView('pentimento.patches', {
      treeDataProvider: {
        getChildren: () => [],
        getTreeItem: () => ({ id: '' }) as vscode.TreeItem,
      },
    });
    tree.dispose();
  });
});
