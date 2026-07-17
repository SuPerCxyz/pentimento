# Implementation Status

> 状态只允许:`未开始` / `进行中` / `已完成` / `已阻塞`。功能只有同时满足"代码实现完成 + 自动测试通过 + 必要手动测试通过 + 文档更新完成 + 无阻断性缺陷"才能标记"已完成"。不得为表现进度而虚假标记。

最后更新:阶段 3(Hover)完成。

## 阶段 1 - 工程初始化(已完成)

| 模块 | 功能 | 优先级 | 状态 | 自动测试 | 手动验证 | 说明 |
|---|---|---|---|---|---|---|
| Project | 仓库名称 `pentimento` | P0 | 已完成 | 不适用 | 已通过 | `git init` |
| Project | VSCode Extension 工程 | P0 | 已完成 | 已通过 | 已通过 | package.json / engines ^1.85 / main |
| Project | TypeScript 配置 | P0 | 已完成 | 已通过 | 已通过 | tsconfig + tsconfig.test |
| Project | esbuild 打包 | P0 | 已完成 | 已通过 | 已通过 | dist/extension.js |
| Project | ESLint(flat config) | P0 | 已完成 | 已通过 | 不适用 | eslint.config.mjs |
| Project | 测试框架 | P0 | 已完成 | 已通过 | 不适用 | mocha + chai + @vscode/test-electron |
| Project | .vscode 调试/任务 | P0 | 已完成 | 不适用 | 已通过 | launch/tasks/settings |
| Project | 命令契约注册 | P0 | 已完成 | 不适用 | 已通过 | 32 个 pentimento.* 命令(占位 handler) |
| Project | 配置契约注册 | P0 | 已完成 | 不适用 | 已通过 | 全部配置项 + 默认值 |
| Project | 颜色契约注册 | P0 | 已完成 | 不适用 | 已通过 | 6 层 + overlap/modified/ambiguous |
| Project | TreeView 占位 | P0 | 已完成 | 不适用 | 已通过 | Activity Bar + 空树 |
| Project | Output Channel | P0 | 已完成 | 不适用 | 已通过 | `Pentimento` |
| README | 名称含义(英) | P0 | 已完成 | 不适用 | 已通过 | README.md |
| README | 名称含义(中) | P0 | 已完成 | 不适用 | 已通过 | README.zh-CN.md |
| Docs | TECHNICAL_DESIGN.md | P0 | 已完成 | 不适用 | 已通过 | 设计已确认 |
| Docs | IMPLEMENTATION_STATUS.md | P0 | 已完成 | 不适用 | 已通过 | 本文件 |

## 阶段 2 - Git 层(已完成)

- GitRunner:参数数组 `spawn`、取消、超时、并发信号量、字节上限、错误分类、结构化脱敏日志;`IGitRunner` 接口可注入。
- GitErrors:`GitErrorCode`(14 类)+ `classifyGitError` 纯函数 + `toUserMessage` 用户可读消息。
- GitVersion:`parseGitVersion`/`compareVersions`/`isSupported`(最低 2.20)/`detectGitVersion`。
- RepositoryResolver:`normalizeRoot`/`computeRepositoryId`/`findRepositoryForPath` 纯函数 + CLI 解析与缓存;`vscode.git` API 优先列为 P1 优化。
- RevisionResolver:`splitRangeInput` 纯函数 + `git rev-parse --verify <input>^{commit}` 校验为完整哈希;P0 不支持 `a...b` 对称差;根 commit 空树常量。
- 接入 `extension.ts`:`GitRunner` 单例(依据配置)+ 后台版本检测(不阻断激活)。
- 单元测试:**48 通过**,含真实 git 集成级 `GitRunner` 测试(临时仓库、取消、无效 Revision、非仓库目录)。

## 阶段 3 - Hover(已完成)

- `blameParser`:`parseBlamePorcelain` 纯函数解析 `--line-porcelain`(hash/作者/时间/summary/边界 commit/未提交行/原始路径)+ `findBlameLine` + `isUncommitted`。
- `commitProvider`:`parseCommitShow`(NUL 分隔)+ `CommitProvider`(用完整哈希)。
- `blameProvider`:文件级 blame 调用(`-w/-M/-C`)+ 行查询。
- `hoverCommandBuilder`:受信 command URI(白名单 + URI 编码 JSON 参数)+ `buildHoverContent`(纯字符串,不依赖 vscode)+ `escapeInline`。
- `gitCommitHoverProvider`:`registerHoverProvider({scheme:'file'})` + 文件级 blame 缓存(键含 `doc.version`)+ in-flight 去重 + 异步 CancellationToken 软取消 + compact/full 模式。
- 接入 `extension.ts`:RepositoryResolver / BlameProvider / GitCommitHoverProvider;config 变更 `refreshConfig`;文件保存清缓存。
- GitLens 共存:代码层为标准 HoverProvider(不替换/不覆盖/不依赖顺序/不读 GitLens),默认无行尾文字;GUI 手动验证待 F5。
- Hover "添加到高亮"按钮调用 `pentimento.*` 命令;真实高亮逻辑在阶段 5 接入。
- 单元测试:**70 通过**(新增 blameParser 9 + commitProvider 5 + hoverCommandBuilder 8)。

## P0 功能实现进度

| 模块 | 功能 | 优先级 | 状态 | 自动测试 | 手动验证 | 说明 |
|---|---|---|---|---|---|---|
| Git | GitRunner | P0 | 已完成 | 已通过 | 不适用 | 参数数组/取消/超时/限流/限输出 |
| Git | GitErrors | P0 | 已完成 | 已通过 | 不适用 | 14 类错误码 + 可读消息 |
| Git | GitVersion | P0 | 已完成 | 已通过 | 不适用 | 解析/比较/检测,最低 2.20 |
| Git | RepositoryResolver | P0 | 已完成 | 已通过 | 待 GUI | CLI 路径;vscode.git API 优先列 P1 |
| Git | RevisionResolver | P0 | 已完成 | 已通过 | 不适用 | rev-parse 校验/Range 拆分/空树 |
| Git | CommitProvider | P0 | 已完成 | 已通过 | 不适用 | parseCommitShow + service |
| Git | BlameProvider | P0 | 已完成 | 已通过 | 不适用 | 文件级 blame + 行查询 |
| Hover | 行级 Commit Hover | P0 | 已完成 | 已通过 | 待 GUI | HoverProvider + 缓存 + 命令 URI |
| Hover | GitLens 共存 | P0 | 已完成 | 不适用 | 待 GUI | 标准 provider 无冲突;GUI 验证待 F5 |
| Patch | Patch 数据模型 | P0 | 未开始 | 未开始 | 未开始 | 阶段 4 |
| Patch | FileStatusParser | P0 | 未开始 | 未开始 | 未开始 | 阶段 4 |
| Patch | NumstatParser | P0 | 未开始 | 未开始 | 未开始 | 阶段 4 |
| Patch | UnifiedDiffParser | P0 | 未开始 | 未开始 | 未开始 | 阶段 4 |
| Highlight | PatchHighlightLayer | P0 | 未开始 | 未开始 | 未开始 | 阶段 5 |
| Highlight | RepositoryHighlightSession | P0 | 未开始 | 未开始 | 未开始 | 阶段 5 |
| Highlight | LineMembershipIndex | P0 | 未开始 | 未开始 | 未开始 | 阶段 5 |
| Highlight | DecorationFactory/Manager/Composer | P0 | 未开始 | 未开始 | 未开始 | 阶段 5 |
| Highlight | 当前 HEAD 精确高亮 | P0 | 未开始 | 未开始 | 未开始 | 阶段 6 |
| Highlight | 多文件 / 当前文件 / 全部文件 | P0 | 未开始 | 未开始 | 未开始 | 阶段 6 |
| Highlight | Hunk 导航 | P0 | 未开始 | 未开始 | 未开始 | 阶段 6 |
| Patch | 工作区修改高亮 | P0 | 未开始 | 未开始 | 未开始 | 阶段 7 |
| Patch | 暂存区修改高亮 | P0 | 未开始 | 未开始 | 未开始 | 阶段 7 |
| Patch | 未保存文档保护 | P0 | 未开始 | 未开始 | 未开始 | 阶段 7 |
| Git | 祖先关系检测 | P0 | 未开始 | 未开始 | 未开始 | 阶段 8 |
| Patch | 历史 Commit 存活行模式 | P0 | 未开始 | 未开始 | 未开始 | 阶段 8 |
| Git | 文件重命名处理 | P0 | 未开始 | 未开始 | 未开始 | 阶段 8 |
| Worktree | WorktreeManager | P0 | 未开始 | 未开始 | 未开始 | 阶段 9 |
| Worktree | 精确历史 Patch Workspace | P0 | 未开始 | 未开始 | 未开始 | 阶段 9 |
| Worktree | 安全清理 | P0 | 未开始 | 未开始 | 未开始 | 阶段 9 |
| Git | Merge Commit 检测+父选择 | P0 | 未开始 | 未开始 | 未开始 | 阶段 9/10 |
| MultiPatch | 多层添加/显隐/移除 | P0 | 未开始 | 未开始 | 未开始 | 阶段 10 |
| MultiPatch | 主要 Patch | P0 | 未开始 | 未开始 | 未开始 | 阶段 10 |
| MultiPatch | 重叠行合成 | P0 | 未开始 | 未开始 | 未开始 | 阶段 10 |
| MultiPatch | Patch 数量限制(6) | P0 | 未开始 | 未开始 | 未开始 | 阶段 10 |
| UI | TreeView 完整 | P0 | 未开始 | 未开始 | 未开始 | 阶段 11 |
| UI | 状态栏 | P0 | 未开始 | 未开始 | 未开始 | 阶段 11 |
| UI | QuickPick / InputBox / Progress | P0 | 未开始 | 未开始 | 未开始 | 阶段 11 |
| UI | Settings UI(已契约化) | P0 | 已完成 | 不适用 | 已通过 | contributes.configuration |
| Compat | 默认无行尾/CodeLens/Inlay/Gutter | P0 | 已完成 | 不适用 | 已通过 | 默认值已设 |
| Compat | 兼容模式 / border-only | P0 | 已完成 | 不适用 | 已通过 | 配置已契约化 |
| Compat | 不依赖 GitLens | P0 | 已完成 | 不适用 | 已通过 | 无 GitLens 依赖 |
| Boundary | 不支持外部 .patch/.diff | P0 | 已完成 | 不适用 | 已通过 | 无导入命令/类型 |

## P1 / P2

| 模块 | 功能 | 优先级 | 状态 | 说明 |
|---|---|---|---|---|
| Patch | Commit Range 完整支持 | P1 | 未开始 | |
| Git | 任意本地 Ref 输入 | P1 | 未开始 | |
| Patch | 投影模式(后续修改黄标) | P1 | 未开始 | |
| Git | 文件复制追踪 / 跨文件移动 | P1 | 未开始 | |
| MultiPatch | 自定义颜色 / 排序 / 分组 | P1 | 未开始 | |
| Worktree | 会话恢复 / 缓存持久化 | P1 | 未开始 | |
| Git | Merge Base 模式 | P1 | 未开始 | |
| UI | Walkthrough / Welcome | P1 | 未开始 | |
| Git | 受控后台 fetch UI | P1 | 未开始 | |
| Remote | Gerrit/GitHub/GitLab Ref 辅助 | P2 | 未开始 | 远端适配器 |
| Remote | patch-id / rebase / cherry-pick 追踪 | P2 | 未开始 | |
| UI | 可选行尾标签 / 图层导出 | P2 | 未开始 | |

## 明确不实现(永久边界)

- 外部 `.patch` / `.diff` 文件导入与解析
- Unified Diff 文件解析 / 邮件 Patch / 剪贴板 Diff / 本地 Patch 文件应用
- 终端操作入口 / 手动 Git 命令 / 手编配置文件 / 远端网页操作
- `vscode.diff` / Side-by-side / Inline Diff / WebView 代码查看 / 只读虚拟 Diff 文档
- 修改用户源码 / 插标记注释 / 自动格式化 / 自动 checkout/switch/stash
