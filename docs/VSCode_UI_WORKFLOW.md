# VSCode UI 工作流

Pentimento 的所有用户操作通过标准 VSCode UI 完成。**不需要打开终端、不手敲 Git 命令、不手编 settings/launch、不访问远端网页。** Git 仅由插件后台安全执行。

## 入口

- 行 Hover(commit 信息 + 操作链接)
- Command Palette(`Pentimento: …`)
- Activity Bar `PENTIMENTO` -> Patches 树
- 状态栏(点击 -> 管理菜单)
- 编辑器右键 / 文件右键(可扩展)
- Settings UI(`Pentimento` 配置组)

## 典型流程

### 从当前行高亮 Commit
1. 悬停某行 -> 见 `hash · 作者 · 时间 · summary` + `[添加此提交到高亮]` 等。
2. 点击 `添加此提交到高亮`。
3. 后台:识别仓库 -> 解析 Revision/parent -> 判断 HEAD/祖先 -> 选 exact/surviving -> 解析 Patch 新增行 -> 应用 Decoration -> 更新 Tree/状态栏。
4. 该 commit 新增行高亮;TreeView 显示 Patch/文件/Hunk。

### 从命令面板添加 Commit/Range
`Pentimento: Add Commit or Range` -> InputBox 输入 `HEAD` / `HEAD~1` / `abc123..def456` / `origin/main` / `refs/changes/...` -> 自动选模式。

### 历史 Patch
- 历史(祖先)commit -> 存活行模式(高亮当前仍归属的行)。
- 非 HEAD 且需像素级 -> `Pentimento: Open Exact Patch Revision` -> 后台建受管 worktree -> 新 Window 自动恢复高亮。
- 非祖先 -> QuickPick 推荐精确 worktree。

### 多 Patch
依次添加多个 commit;每个独立颜色;重叠行专用样式;`Pentimento: Set Primary Patch` / `Show Only Primary` / `Show All` / `Hide All` / `Clear All`。

### Hunk 导航
`Pentimento: Next/Previous Added Hunk` 在当前文件新增行间跳转。

## 精确 Patch Workspace

- 状态栏标记 `Exact`;`Pentimento: Close Exact Patch Workspace` / `Remove Temporary Worktree` / `Clean Stale Temporary Worktrees` 安全清理(三重校验)。
- 主工作区永不被 checkout / switch / stash。

## 配置

全部在 Settings UI(`pentimento.*`):hover / highlight / blame / multiPatch / historical / exactPatch / largePatch / git / logging。
