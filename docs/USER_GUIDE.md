# 用户指南

Pentimento 在普通代码编辑器中高亮 Git Patch 引入的新增内容,保留真实代码上下文与全部语言服务能力。

## 安装

- 从 CI Artifacts 下载 `pentimento-*.vsix`,命令面板 `Extensions: Install from VSIX`;或 F5 调试。
- 要求:VSCode 1.85+,Git 2.20+。

## 快速开始

1. 打开一个**有提交历史**的 Git 仓库源文件。
2. 悬停任意代码行 -> 见 `hash · 作者 · 时间 · summary` + 操作链接。
3. 点 `添加此提交到高亮` -> 该提交新增行高亮(当前 HEAD 精确模式)。
4. 左侧 `PENTIMENTO` 视图显示 Patch / 文件 / Hunk;状态栏显示摘要。

## 查看 Patch

- **当前 HEAD**:悬停行 -> `添加此提交到高亮`(exact)。
- **历史 commit**:悬停历史行 -> 添加 -> 存活行模式(高亮当前仍归属该 commit 的行)。
- **Commit/Range/Ref**:命令面板 `Pentimento: Add Commit or Range`,输入 `HEAD~1` / `abc123..def456` / `origin/main` / `refs/changes/.../head`。
- **工作区 / 暂存区**:`Pentimento: Highlight Working Tree Changes` / `Highlight Staged Changes`。
- **精确历史版本**:`Pentimento: Open Exact Patch Revision` -> 新 Window 打开受管 worktree,像素级准确,自动恢复高亮。

## 多 Patch

- 依次添加多个 Patch,各自配色;重叠行用专用样式,Hover 列出全部。
- `Set Primary Patch` / `Show Only Primary` / `Show All` / `Hide All` / `Clear All`。
- 默认上限 6 个(`pentimento.multiPatch.maxActivePatches`)。

## Hunk 导航

`Pentimento: Next/Previous Added Hunk` 在当前文件新增行间跳转。

## 管理

- TreeView 顶部:添加 / 刷新 / 清除。
- 状态栏点击:管理菜单。
- 精确 worktree 窗口:`Close Exact Patch Workspace` / `Remove Temporary Worktree` / `Clean Stale Temporary Worktrees`。

## 配置

Settings UI 搜索 `Pentimento`:
- `pentimento.hover.*`:开关 / 延迟 / compact|full|disabled。
- `pentimento.highlight.*`:样式 / 整行 / gutter / inlineLabel / overviewRuler / currentFileOnly。
- `pentimento.blame.*`:-w / -M / -C。
- `pentimento.multiPatch.*`:开关 / 上限 / hover 默认动作 / overlap 样式。
- `pentimento.historical.*`:默认模式 / 非祖先优先 worktree。
- `pentimento.exactPatch.*`:复用 / 退出清理。
- `pentimento.git.*`:超时 / 并发 / 输出上限。
- `pentimento.logging.level`。

## 不支持

- 不导入/解析外部 `.patch` / `.diff` 文件。
- 不显示删除行 / Side-by-side / Inline Diff。
- 不要求打开终端或手动 Git。

## 排查

- Hover 不显示:确认文件在 Git 仓库且有提交;打开 `Pentimento` Output Channel 看日志;确认 `pentimento.hover.enabled`。
- `Pentimento: Show Diagnostics` / `Open Output Log` 查看诊断与日志。
