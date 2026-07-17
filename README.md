# Pentimento

> 照亮代码中层叠的历史笔触。

Pentimento 是一个 VSCode 插件,用于在普通源代码文件中直接呈现并高亮 Git Commit 或 Git Patch 引入的新增内容。它保留真实代码上下文,支持代码跳转、历史 Patch、多 Patch 图层以及普通编辑器中的完整语言服务能力,**而不需要打开传统 Diff Editor**。

它不是把历史隔离进 Side-by-side Diff 视图,而是把 Patch 的**新行**——纯新增行、替换后的新行、新增文件——直接高亮在真实、可编辑的文件里,使得 Go to Definition、Find References、Peek、语言服务、调试以及 GitLens 等其他插件都能照常工作。

## 为什么叫 Pentimento?

Pentimento 是一个绘画术语,指画家修改作品后,早期被覆盖的笔触随着时间推移重新隐约显现。

源代码也以相似的方式不断演化。每个 Commit 都会留下设计意图、修正过程和新的实现痕迹。Pentimento 将这些 Git 历史图层重新带回当前代码视野,在完整代码上下文中高亮某个 Patch 引入的新增内容。

它不是另一个传统 Diff Viewer,而是一种在"活着的代码"中观察历史笔触的方式。

## 核心特性

- **行级 Git Hover** —— 悬停任意行查看其提交、作者、时间与摘要,并可一键高亮该提交。
- **就地高亮 Patch 新增内容** —— 只高亮 Patch 的新文件一侧:新增行、替换后的新行、新增文件。删除内容完全不显示。
- **真实编辑器,而非 Diff Editor** —— 在普通 `TextEditor` 上对真实文件工作。不使用 `vscode.diff`、不 Side-by-side、不 WebView 代码页、不创建只读虚拟 Diff 文档,也不修改源码。
- **历史 Patch** —— 对非当前 HEAD 的 Patch,可在当前版本用"存活行"模式查看,或打开"精确 Patch 工作区"(受管理的临时 Git worktree)以获得像素级准确;还可"投影"到当前版本观察后续演化。历史 Patch 的旧行号绝不直接套用到当前 HEAD。
- **多 Patch 图层** —— 同时保持多个 Patch 高亮,各自配色,支持主要 Patch,重叠行使用专用样式。
- **工作区与暂存区修改** —— 高亮未提交与已暂存的新增内容。
- **纯 VSCode 操作** —— 全部通过 Hover、命令面板、TreeView、状态栏、QuickPick、InputBox、Progress 与 Settings UI 完成。**你无需打开终端、无需手敲 Git 命令、无需手编 `settings.json`、无需访问远端网页。** Git 仅由插件后台执行。
- **与其他插件共存** —— 与 GitLens、git gutter、诊断、搜索结果、测试覆盖率、断点、调试当前行共存,只管理自身 Decoration。

## 为什么不是传统 Diff Viewer?

Diff Viewer 把历史抽离到一个通常是只读的独立界面,破坏了跳转、语言服务和上下文——你无法像在真实文件里那样 Ctrl+Click 跳定义或查引用。

Pentimento 反其道而行:Patch 以 Decoration 叠加在"活着的代码"上,文件保持可编辑与全功能,Patch 只是"可见"。

## 使用方式

1. 悬停某行代码查看其提交,点击 **添加此提交到高亮**。
2. 或在命令面板执行 **Pentimento: 添加提交或范围**,输入 Revision / Range / Ref(`HEAD`、`HEAD~1`、`origin/main`、`abc123..def456`、`refs/changes/43/93143/8` 等)。
3. 在 Activity Bar 的 **PENTIMENTO** 视图中管理 Patch、在 Hunk 间跳转、打开精确 Patch 工作区。
4. 点击状态栏项使用快捷操作。

以上全部在 VSCode 内完成,不需要终端,不需要手动 Git 命令。

## 历史 Patch 模式

- **精确(当前 HEAD)** —— 当 Patch 版本等于 HEAD 且文件干净时,新增行与当前文件 1:1 对应。
- **存活行** —— 只高亮当前版本中仍可可靠归属于目标 Patch 的行(基于 `git blame`),不复用旧行号。
- **精确 Patch 工作区** —— 在新 VSCode 窗口中打开位于 Patch 版本的受管理临时 worktree,像素级准确。当前工作区永不被 checkout 或修改。
- **投影(P1)** —— 将 Patch 新增行映射到当前版本,标注未变/移动/被修改/已删除。

准确性优先于覆盖量:无法可靠归属的行会被标记为不确定,而非强行标绿。

## 多 Patch

可同时高亮多个 Patch(默认上限 6)。每个 Patch 分配颜色槽位;被多个 Patch 触及的行使用专用重叠样式,Hover 列出所有相关 Patch。其中一个为*主要 Patch*,用于 Hunk 导航与状态栏。

## 与 GitLens 共存

Pentimento 是守规矩的 Hover Provider:不替换、不覆盖、不依赖 GitLens,不修改其配置或读取其缓存。默认不使用行尾虚拟文字、CodeLens、Inlay Hint、Gutter Icon,因此不与 GitLens 当前行 blame 争抢行尾空间。

## 配置

所有选项均可在 VSCode **Settings** 页面的 `Pentimento` 下修改。常用项:

| 配置 | 默认 | 说明 |
|---|---|---|
| `pentimento.hover.enabled` | `true` | 行级 Git Hover 开关 |
| `pentimento.hover.delay` | `300` | Hover 防抖延迟(毫秒) |
| `pentimento.hover.mode` | `compact` | `compact` / `full` / `disabled` |
| `pentimento.highlight.style` | `background-and-border` | 高亮样式 |
| `pentimento.highlight.gutterIcon` | `false` | Gutter 图标(默认关) |
| `pentimento.multiPatch.enabled` | `true` | 多 Patch 图层 |
| `pentimento.multiPatch.maxActivePatches` | `6` | 同时启用上限 |
| `pentimento.git.timeout` | `30000` | Git 命令超时(毫秒) |
| `pentimento.logging.level` | `info` | 日志级别 |

## 性能

所有 Git 操作异步,不阻塞 Extension Host。Hover 使用防抖与文件级 blame 缓存,只对可见编辑器下发 Decoration。大 Patch 有上限(`pentimento.largePatch.*`),TreeView 懒加载。

## 安全

Git 始终以参数数组调用(绝不拼接 shell 字符串)。用户输入的 Revision 先用 `git rev-parse` 校验。精确 Patch worktree 仅在插件受管理目录下创建,且仅在通过三重校验(受管路径前缀、registered worktree、元数据匹配)后才删除。未验证路径绝不删除。

## Pentimento 不做的事

- 不导入或解析外部 `.patch` / `.diff` 文件。仅支持当前 Git 仓库中的 Commit、Range、Ref、工作区与暂存区修改。
- 不显示删除行、Side-by-side Diff、Inline Diff 块。
- 不要求打开终端或手动执行 Git 命令。
- 不登录 Gerrit/GitHub/GitLab,不修改远端 Review。

## 开发与调试

> 以下为插件开发流程,非普通用户操作流程。

依赖:Node.js 20+ 与 npm。

```bash
npm install
npm run compile      # esbuild 打包
npm run watch        # 监听模式
npm run lint
npm run test:unit    # 单元测试(mocha)
npm run test         # 集成测试(@vscode/test-electron)
```

在 VSCode 中按 <kbd>F5</kbd> 启动 Extension Development Host 加载 Pentimento。架构见 `docs/ARCHITECTURE.md`,进度见 `docs/IMPLEMENTATION_STATUS.md`。

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。参与贡献即表示接受 [行为准则](./CODE_OF_CONDUCT.md)。

## License

[MIT](./LICENSE) © Pentimento Contributors
