# Architecture

Pentimento 在普通 VSCode `TextEditor` 中高亮 Git Patch 引入的新增内容,不使用 Diff Editor / WebView / 虚拟文档,也不修改用户文件。本文描述模块分层与数据流,详见 `TECHNICAL_DESIGN.md`。

## 分层

```
ui/            QuickPick / InputBox / Progress / Notification / exactWorkspaceLauncher
tree/ status/  TreeView / StatusBar
hover/         HoverProvider + command URI
highlight/     会话 / 图层 / 行归属 / Decoration 合成 / 编辑器跟踪 / 控制器
patch/         模型 + Diff/Numstat/NameStatus 解析 + 存活行/投影映射
git/           GitRunner + Errors/Version + 仓库/Revision/Commit/Blame/Patch/PathEvolution/Worktree
cache/ utils/  缓存键 / Disposable / 日志 / 取消 / 信号量
commands/      命令编排(薄层,调服务)
```

依赖单向自上而下;`git/` 与 `patch/` 的纯函数不依赖 `vscode`,可在纯 Node 测试。

## 运行模型

`activate()` 装配服务:GitRunner → RepositoryResolver / RevisionResolver / CommitProvider / BlameProvider / PatchService → HighlightSessionManager / DecorationManager → HighlightController + EditorTracker + GitCommitHoverProvider。`deactivate()` 统一 dispose。

## 关键约束

- **坐标分离**:Patch 原始新增行 / patchRevision / HEAD / working tree / doc buffer 五个空间;历史旧行号绝不套到当前 HEAD。
- **三模式**:`exact-patch-revision`(HEAD 精确)、`surviving-lines`(blame 归属)、`projected-footprint`(P1)。
- **多 Patch**:每仓库 `RepositoryHighlightSession`,无全局 `activePatch`;同 `displayRevision` 才能叠加。
- **安全**:Git 参数数组(无 shell);Revision 先 `rev-parse --verify`;worktree 三重校验;不修改用户文件/分支。
- **共存**:标准 HoverProvider,默认无行尾/CodeLens/InlayHint/Gutter,只清自身 Decoration。

## 数据流(Hover -> 高亮)

1. HoverProvider 取文件级 blame 缓存 -> 行 commit -> MarkdownString + command URI。
2. 点 `添加此提交到高亮` -> `addCommitFromHash` -> resolve repo/revision/parent -> 判断 HEAD/祖先 -> 选 exact/surviving -> `patchService.buildPatch` -> `session.addPatch` -> `applyVisibleEditors`。
3. `applyToEditor`:按 enabled layers 计算 `LineMembershipIndex` -> `composeLine` 合成 -> `decorationManager` 下发。
4. `editorTracker` 节流触发重算;`updateChrome` 更新 TreeView/状态栏/context keys。
