# 贡献指南

感谢你关注 Pentimento 贡献!本文档描述开发工作流。这是**开发者**工作流,
非普通用户流程。

## 开发前置要求

- Node.js 20+ 与 npm
- Git 2.20+
- VSCode 1.85+(用于 Extension Development Host 调试)

## 快速开始

```bash
git clone https://example.com/pentimento.git
cd pentimento
npm install
npm run compile      # esbuild bundle -> dist/extension.js
npm run watch        # watch 模式
npm run lint
npm run test:unit    # mocha 单元测试
npm run test         # @vscode/test-electron 集成测试
```

在 VSCode 中按 <kbd>F5</kbd> 启动 Extension Development Host 并加载 Pentimento。

## 架构与边界

进行非平凡修改前请阅读 `docs/TECHNICAL_DESIGN.md`。硬性规则:

- **不使用外部 Patch 文件。** 禁止添加 `.patch` / `.diff` 导入或解析。
  `PatchSelectionType` 不得包含 `'patch-file'`。
- **不使用 Diff Editor / WebView 代码查看器。** 仅使用
  `createTextEditorDecorationType` + `setDecorations`。
- **不向用户提供终端操作。** Git 仅通过 `GitRunner` 以参数数组方式调用
  (绝不使用 shell 字符串)。
- **准确优先于覆盖。** 禁止将历史 Patch 行号应用到当前 HEAD。
  不确定的行标记为 ambiguous。
- **多 Patch 自第一天起支持。** 不允许单一全局 `activePatch`。
- **与 GitLens 等扩展共存。** 不得替换 hovers、修改配置,或触碰其他扩展的
  decorations。

## Commit 信息规范

遵循 OpenStack / Gerrit 风格:

- 首行:祈使句,<= 50 字符,末尾无句号,不使用 `feat:`/`fix:` 前缀。
- 空行,然后是 <= 72 字符折行的正文,解释为何与改了什么,以及兼容性影响。
- 按需添加 footer(`Closes-Bug: #...`、`Related-Task: #...`、
  `Depends-On: I...`)。`Change-Id` 由 commit-msg hook 生成,不要手写。

## 测试

- 为解析器与纯逻辑添加单元测试(`test/unit/`)。
- 使用真实临时 Git 仓库添加集成测试以验证端到端行为
  (`test/integration/`)。
- 任何新增或变更功能请更新 `docs/IMPLEMENTATION_STATUS.md`。
  代码 + 测试 + 文档全部完成前,不得标记功能为 "已完成/completed"。

## Pull requests

- 保持 PR 聚焦;拆分无关变更。
- 确保 `npm run lint`、`npm run check`、`npm run test:unit` 通过。
- 描述变更内容、理由与测试覆盖。

提交贡献即表示你同意遵守[行为准则](./CODE_OF_CONDUCT.md)。
