# 更新日志

Pentimento 所有重要变更将记录在本文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### Added - Stage 1(项目脚手架)

- 初始化 `pentimento` 仓库与 VSCode 扩展项目。
- `package.json` 包含完整命令契约(32 个 `pentimento.*` 命令)、
  完整配置契约、颜色契约(6 层 + overlap/modified/ambiguous)、
  以及 `PENTIMENTO` Activity Bar view container。
- TypeScript + esbuild + ESLint(flat config)+ Mocha + Chai +
  `@vscode/test-electron` 工具链。
- `README.md` 与 `README.zh-CN.md`,分别包含 "Why the name Pentimento?" /
  "为什么叫 Pentimento?" 章节。
- `docs/TECHNICAL_DESIGN.md`(技术设计,已确认)与
  `docs/IMPLEMENTATION_STATUS.md`(进度跟踪)。
- 最小化 `src/extension.ts` 激活:Output Channel `Pentimento`、
  context keys、命令桩、空 Patches tree view。
- 最小化单元测试脚手架。

### Notes

- 尚无面向用户的高亮功能;命令以占位符形式注册。
  实现从 Stage 2(GitRunner)开始。
