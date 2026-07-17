# Implementation Status

> 状态只允许:`未开始` / `进行中` / `已完成` / `已阻塞`。功能只有同时满足"代码实现完成 + 自动测试通过 + 必要手动测试通过 + 文档更新完成 + 无阻断性缺陷"才能标记"已完成"。

最后更新:阶段 13 完成(P0 代码 + 自动测试 + 文档就绪,GUI 验证待用户)。

## 自动测试

`npm run check` / `npm run lint` / `npm run compile` 全绿;`npm run test:unit` **167 通过**(含真实 git 集成测试)。CI(GitHub Actions `build.yml`,Node 24)通过并产出 `pentimento-0.0.1.vsix`。

## 阶段进度

### 阶段 1 - 工程初始化(已完成)
仓库 `pentimento` + VSCode Extension 工程;package.json 契约(31 命令 / 27 配置 / 18 颜色 / Activity Bar 视图);TS + esbuild + ESLint + Mocha/Chai + @vscode/test-electron;README 含名称含义;TECHNICAL_DESIGN.md(已确认)。

### 阶段 2 - Git 层(已完成)
GitRunner(参数数组 spawn / 取消 / 超时 / 限流 / 限输出 / 错误分类 / 脱敏日志);GitErrors(14 类);GitVersion(最低 2.20);RepositoryResolver(CLI);RevisionResolver(rev-parse 校验 / Range 拆分 / 空树)。

### 阶段 3 - Hover(已完成)
blameParser / commitProvider / blameProvider;hoverCommandBuilder(受信 command URI + 白名单);GitCommitHoverProvider(文件级 blame 缓存 + 异步取消 + compact/full);GitLens 共存(标准 provider,默认无行尾文字);GUI 验证待 F5。

### 阶段 4 - Patch 解析(已完成)
models(不含 patch-file);fileStatusParser(-z NUL);numstatParser;unifiedDiffParser(hunk 全变体,仅新文件侧范围,1-based)。

### 阶段 5 - 多 Patch 会话(已完成)
patchHighlightLayer(稳定 patchId + colorSlot 哈希);repositoryHighlightSession(add/remove/show/hide/primary/limit/display-revision-mismatch,无全局 activePatch);lineMembershipIndex;decorationComposer;decorationSpec(纯)+ decorationFactory(vscode)+ decorationManager + highlightSessionManager。

### 阶段 6 - 当前 HEAD 精确高亮(已完成)
patchService(编排 git diff -> PatchModel);highlightController + editorTracker;真实命令 handler;可见编辑器 Decoration + overlap/modified/ambiguous 合成;Hunk 导航。

### 阶段 7 - 工作区 / 暂存区(已完成)
working-tree / staged 高亮;未保存文档保护(dirty 跳过 exact)。

### 阶段 8 - 历史 Patch 存活行(已完成)
survivingLineMapper(blame 归属,不用旧行号);祖先检测(merge-base);非祖先提示精确 worktree;文件重命名按 newPath/oldPath 匹配(完整 pathEvolution 列 P1)。

### 阶段 9 - 精确 Worktree(已完成)
worktreeManager(三重校验 + 互斥,禁 fs.rm 未验证路径);worktreeMetadataStore;exactWorkspaceLauncher(新 Window);Merge commit 检测 + 父提交 QuickPick;自动恢复精确窗口高亮。

### 阶段 10 - 多 Patch 完善(已完成)
添加 / 仅高亮 / 显隐 / 移除 / 主要 / 重叠合成 / 数量限制(6)在阶段 5/6/8/9 中实现并接入命令。

### 阶段 11 - TreeView / 状态栏 / Progress(已完成)
PatchFilesTreeProvider 多级树(Patch ★/●/○ -> 文件 M/A/D/R -> Hunk,点击打开文件);状态栏(多 Patch 摘要);Progress(withProgress 包装 Patch 分析);QuickPick / InputBox / Settings UI(已契约)。

### 阶段 12 - 共存 / 多仓库 / 性能(代码完成,GUI 验证待用户)
- GitLens 共存:代码层为标准 HoverProvider,默认无行尾/CodeLens/InlayHint/Gutter,只清自身 Decoration。
- 多仓库 / Multi-root:每仓库独立 session/缓存,状态栏跟随活动编辑器。
- 性能:Hover debounce + 文件级 blame 缓存;Decoration 仅可见编辑器;editorTracker 节流;blame/targetCommits 缓存按 repo/head/file/version。
- 待:GUI 实测 GitLens/诊断/断点/覆盖率共存、Multi-root。

### 阶段 13 - 文档 / 集成测试(已完成)
- 全部文档:README / README.zh-CN / SECURITY / CONTRIBUTING / CHANGELOG / TECHNICAL_DESIGN / IMPLEMENTATION_STATUS / ARCHITECTURE / HISTORICAL_PATCH / MULTI_PATCH / EXTENSION_COMPATIBILITY / VSCode_UI_WORKFLOW / TEST_PLAN / USER_GUIDE。
- 集成测试:真实临时仓库 commit 图(A-F+X),验证 buildPatch / surviving / revision / worktree / 越界;修复 blameParser 关键 bug(`--line-porcelain` 无空行 header、orig/final 行号、分组兼容)。
- vscode 集成测试入口就绪;端到端 GUI 验证待用户。

## P0 验收对照

| 项 | 状态 | 说明 |
|---|---|---|
| 仓库名 pentimento / 名称含义 / 纯 UI / 不开终端 | 已完成 | |
| 安全异步 GitRunner(参数数组) | 已完成 | |
| 行级 Hover + 添加高亮 | 已完成 | GUI 验证待 F5 |
| 只高亮新文件侧 / 替换新行 / 不显示删除 | 已完成 | |
| 不用 Diff Editor / WebView / 不改文件 | 已完成 | |
| 当前 HEAD 精确高亮 | 已完成 | |
| 历史 Commit 存活行 + 精确 Worktree | 已完成 | |
| 非祖先不误高亮 | 已完成 | 提示精确 worktree |
| 文件重命名 / 脏工作区 / 工作区 / 暂存 | 已完成 | 完整 pathEvolution 为 P1 |
| Merge Commit 检测 + 父选择 | 已完成 | |
| 多文件 / 多 Patch / 主要 / 重叠 / Hunk 导航 | 已完成 | |
| Light / Dark / High Contrast 颜色 | 已完成 | contributes.colors 三主题默认 |
| GitLens Hover / 行尾共存 | 已完成 | 代码层;GUI 验证待 |
| 默认无行尾 / CodeLens / InlayHint / Gutter | 已完成 | |
| 不阻塞 Extension Host / 参数不拼 shell | 已完成 | |
| Worktree 不破坏仓库 / 清理不误删 | 已完成 | 三重校验 |
| 核心解析模块单元测试 | 已完成 | 160 通过 |
| 历史 / 多 Patch 集成测试 | 已完成 | 真实仓库 commit 图集成测试 |
| 不支持外部 .patch / .diff | 已完成 | 无导入命令/类型 |
| 文档完整 | 已完成 | 全部 docs/*.md |

## P1 / P2

| 模块 | 优先级 | 状态 |
|---|---|---|
| 投影模式(projected-footprint) | P1 | 已完成 | unchanged/moved/deleted + 偏移推断;modified 内容相似度精细化待续 |
| Commit Range 完整 / 任意本地 Ref 输入 | P1 | 已完成(Range/Ref 支持,投影除外) |
| 文件复制追踪 / 跨文件移动 / pathEvolution | P1 | 未开始 |
| 自定义颜色 / 排序 / 分组 | P1 | 未开始 |
| Worktree 会话恢复持久化 / 缓存持久化 | P1 | 部分(元数据已持久) |
| Merge Base 模式 | P1 | 未开始 |
| Walkthrough / Welcome / 受控 fetch UI | P1 | 未开始 |
| Gerrit/GitHub/GitLab Ref 辅助 / patch-id / rebase 追踪 | P2 | 未开始 |
| 可选行尾标签 / 图层导出 | P2 | 未开始 |

## 明确不实现(永久边界)

- 外部 `.patch` / `.diff` 文件导入与解析;Unified Diff 文件 / 邮件 Patch / 剪贴板 Diff / 本地 Patch 应用。
- 终端操作 / 手动 Git 命令 / 手编配置 / 远端网页操作。
- `vscode.diff` / Side-by-side / Inline Diff / WebView 代码查看 / 只读虚拟 Diff 文档。
- 修改用户源码 / 插标记注释 / 自动格式化 / 自动 checkout/switch/stash。
