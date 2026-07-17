# Pentimento — 技术设计文档

> Illuminate the history woven into your code.
> 照亮代码中层叠的历史笔触。

| 字段 | 值 |
|---|---|
| 项目名称 | Pentimento |
| 插件包名 / 仓库名 | `pentimento` |
| 文档版本 | v0.1 (设计评审稿) |
| 状态 | 待用户确认 → 通过后进入实现阶段 |
| 适用范围 | 本文档是 Pentimento 的总体技术设计,覆盖需求理解、架构、数据模型、Git 层、Hover、Patch 解析、历史 Patch、多 Patch、表现层、缓存、安全、测试与计划 |

阅读约定:

- 本文不重复复述需求规格,只在需要**确认理解**或**做出技术决策**处展开。
- 所有"禁止/不得"项视为硬约束,设计直接遵守,不再论证。
- 标注 `【决策】` 的段落是本文给出的技术选型;标注 `【待确认】` 的条目汇总在第 43 节,需用户拍板后再实现。
- 行号约定:Git 内部统一 1-based;仅在 `highlight/` 表现层转为 VSCode 0-based。

---

## Part I — 需求与定位

### 1. 需求理解

Pentimento 解决的核心问题是:**让用户在不离开"活着的代码编辑器"的前提下,观察某个 Git Patch(Commit / Range / Ref / 工作区 / 暂存区)引入的新增内容**,并保证:

1. **真实代码上下文保留**:使用普通 `TextEditor` + 真实磁盘文件,语言服务、跳转、引用、调试、GitLens 等全部可用。
2. **只高亮新文件一侧**:纯新增行、替换后的新行、新增文件行;删除旧内容完全不显示。
3. **历史 Patch 可靠映射**:绝不把历史 Patch 的旧行号直接套到当前 HEAD;通过"存活行 / 精确 worktree / 投影"三种模式保证准确性优先。
4. **多 Patch 图层**:从数据模型第一天起即多图层,禁止单一全局 `activePatch`。
5. **纯 UI 操作**:用户全程不打开终端、不手敲 Git 命令、不手编 settings/launch、不访问远端网页;Git 仅由插件后台安全执行。
6. **通用 Git**:核心不绑定任何代码托管平台;Gerrit/GitHub/GitLab Ref 仅作为标准 Git Ref 处理。
7. **明确不引入外部 `.patch`/`.diff` 文件**:不解析、不导入、不应用外部 Unified Diff 文件。

设计第一原则(贯穿全文):**准确性优先于显示数量**。无法可靠归属的行必须标记不确定,绝不强行标绿。

### 2. 项目名称与品牌定位

- **Pentimento**(绘画术语):画家修改作品后,早期被覆盖的笔触随时间重新隐约显现。
- 品牌映射:Git 历史 = 层叠笔触;每个 Commit/Patch = 一层创作痕迹;Pentimento 让历史笔触在"活着的代码"中重新可见,而非把历史隔离进传统 Diff Viewer。
- 品牌红线:名称含义不得从 README 省略;不得使用 `pentimento-vscode` / `vscode-pentimento` / `git-patch-highlighter` 等变体名。

### 3. README 名称含义设计

README.md 与 README.zh-CN.md 各设独立章节:`## Why the name "Pentimento"?` / `## 为什么叫 Pentimento?`,内容采用规格中给定的中英文文案(见需求第二节),强调"层叠笔触 / 在活着的代码中观察历史 / 不是传统 Diff Viewer"三点。该章节属于品牌定位,实现阶段 1 即建立。

### 4. 功能边界

**做**:

- 普通 `TextEditor` 中以 `Decoration` 呈现 Patch 新增行。
- 行级 Hover 显示 Commit 元信息 + 添加/仅高亮/取消等操作。
- 历史 Patch 三模式:当前 HEAD 精确、存活行、精确 worktree;投影为 P1。
- 多 Patch 图层、主要 Patch、重叠合成、Hunk 导航。
- 工作区 / 暂存区修改高亮。
- Merge Commit 父提交选择。
- 文件重命名/删除识别。
- 多仓库 / Multi-root Workspace。
- TreeView、状态栏、QuickPick、InputBox、Progress、Settings UI、Output Channel。

**不做**(硬约束):

- `vscode.diff` / Diff Editor / Side-by-side / Inline Diff / WebView 代码查看 / 只读虚拟 Diff 文档。
- 修改用户源码、插标记注释、自动格式化、自动 checkout/switch/stash。
- 强制关闭或改配置 GitLens、调用 GitLens 私有 API、读 GitLens 缓存、替换其 Hover。
- 默认行尾虚拟文本 / CodeLens / InlayHint / Gutter Icon。
- 终端操作、手敲 Git、远端网页、手编配置文件。
- 外部 `.patch` / `.diff` 文件导入与解析(见第 5 节)。

### 5. 不支持外部 Patch 文件的边界

- `PatchSelectionType` 仅含:`'commit' | 'range' | 'working-tree' | 'staged'`,**不含** `'patch-file'`。
- 不实现 `patchFileProvider.ts` / `externalDiffParser.ts` / `importPatch.ts`。
- 不提供命令:`Import Patch File` / `Open Diff File` / `Highlight External Patch` / `Apply Patch File`。
- 拖入 `.patch`/`.diff` 不触发高亮;剪贴板 Diff、URL Patch、邮件 Patch 均不解析。
- README 明确声明该限制。该边界为永久边界,不进入 P1/P2。

### 6. 纯 VSCode UI 操作原则

- 所有用户可触达操作走标准 VSCode UI 入口(Hover / Command Palette / TreeView / Activity Bar / 右键 / 标题栏 / 状态栏 / QuickPick / InputBox / Notification / Progress / Settings / Welcome / Walkthrough / 普通编辑器标签 / 插件后台新 Window)。
- Integrated Terminal **不作为正常操作入口**;Git 命令仅由 `GitRunner` 在后台异步执行,用户只见进度、结果与可读错误。
- 任何用户提示中不得出现"请打开终端执行 git … / 请复制以下命令 / 请手动创建 worktree / 请先 checkout …"等话术。
- 开发者调试章节可含 `npm`/测试/打包命令,但须声明这是开发流程而非普通用户流程。

---

## Part II — 用户流程

### 7. 核心用户流程

设计上把流程收敛为三条主干,均由命令编排层 `commands/` 驱动,背后复用同一组服务(Git / Patch / Highlight / UI)。

**流程 A — 从当前行高亮 Commit(Hover 主入口)**

1. HoverProvider 命中 `scheme:'file'` 文件某行 → debounce 300ms → 命中文件级 blame 缓存 → 返回 `GitLineCommitInfo`。
2. Hover MarkdownString 渲染标题 + 元信息 + 受信 Command URI(编码参数)。
3. 用户点击 `[添加此提交到高亮]` → 调用 `pentimento.addCommitFromLine`(带 `repositoryRoot/commitHash/file/line`)。
4. 命令内部:重新校验仓库与 Revision → 解析父提交(单 parent 直接用;merge 弹 QuickPick)→ 判断 `patchRevision` 与 HEAD 关系 → 选定 `viewMode` → `patchService` 解析新增行 → `highlightSessionManager` 新增图层(保留现有图层)→ 刷新可见编辑器 Decoration → 更新 TreeView/状态栏。

**流程 B — 从命令面板添加 Commit/Range**

1. `pentimento.addRef` → `revisionInput`(InputBox 接收 `HEAD`/`HEAD~1`/`origin/main`/`abc123..def456`/`refs/changes/...`/`refs/pull/.../head` 等)。
2. `revisionResolver` 校验:`git rev-parse --verify <input>^{commit}`;Range 拆 `base..patch` 两端分别校验。
3. QuickPick 选查看模式(HEAD 精确 / 存活行 / 精确 worktree;非祖先时默认推荐精确 worktree)。
4. 后续同流程 A 第 4 步。

**流程 C — 精确历史 Patch Worktree**

1. 用户在 Hover/QuickPick/TreeView 选 `打开该 Patch 的精确版本`。
2. `worktreeManager` 在 `globalStorageUri/worktrees/<repoId>/<patchHash>/` 下 `git worktree add --detach <path> <patchRevision>`(带互斥锁与元数据落盘)。
3. `exactWorkspaceLauncher` 用 `vscode.commands.executeCommand('vscode.openFolder', worktreeUri, true)` 打开**新 Window**。
4. 新 Window 中 Pentimento 激活 → 读取元数据 → 自动恢复该 Patch 高亮(exact-patch-revision 模式)→ 状态栏标记 `Exact Patch Workspace` → 提供关闭/清理按钮。
5. 清理:校验路径属管理目录、为 registered worktree、repoId+patchRevision 匹配 → `git worktree remove --force` + `git worktree prune`;**禁止** `fs.rm` 未验证路径。

---

## Part III — 架构

### 8. 总体架构

**运行模型**:Extension Host 单例。`activate()` 构建一个轻量**服务容器**(显式依赖注入,非框架),持有所有长生命周期服务的单例引用;`deactivate()` 统一取消后台任务并 dispose。

**分层**(自下而上,单向依赖,禁止逆向):

```
┌─────────────────────────────────────────────────────────────┐
│ ui/         QuickPick / InputBox / Progress / Notification / │
│             exactWorkspaceLauncher                           │
├─────────────────────────────────────────────────────────────┤
│ tree/  status/   表现层:TreeView / StatusBar                │
├─────────────────────────────────────────────────────────────┤
│ hover/          HoverProvider + Command URI 构建              │
├─────────────────────────────────────────────────────────────┤
│ highlight/      会话 / 图层 / 行归属 / Decoration 合成 / 编辑器跟踪 │
├─────────────────────────────────────────────────────────────┤
│ patch/          模型 + Diff/Numstat/NameStatus 解析 + 存活行/投影映射 │
├─────────────────────────────────────────────────────────────┤
│ git/            GitRunner + Errors/Version + 仓库/Revision/  │
│                 Commit/Blame/Patch/PathEvolution/Worktree     │
├─────────────────────────────────────────────────────────────┤
│ cache/ utils/   缓存键 / 各类缓存 / Disposable / 日志 / 取消  │
└─────────────────────────────────────────────────────────────┘
       commands/ 编排层横向调用上述服务
```

**事件总线**:轻量 `EventBus`(进程内 `vscode.EventEmitter` 封装),发布 `head-changed` / `branch-changed` / `file-saved` / `file-renamed` / `index-changed` / `config-changed` / `doc-version-changed` / `worktree-removed` / `theme-changed` 等事件,由各缓存订阅做**粒度失效**(见第 35 节)。避免一处变更全量清空。

**可见性驱动**:Decoration 只对"可见编辑器"计算与下发;`editorTracker` 监听 `onDidChangeActiveTextEditor` / `onDidChangeVisibleTextEditors` / `onDidChangeTextDocument` / `onDidSaveTextDocument`。文档关闭即释放其行级缓存与 Decoration 数据。

### 9. 模块划分

与第 40 节目录结构一一对应,职责边界:

| 目录 | 职责 | 对外关键类型 |
|---|---|---|
| `git/gitRunner.ts` | 安全异步执行 git,参数数组,取消/超时/限流/限输出 | `GitRunner.run(args, opts)` |
| `git/gitErrors.ts` | `GitErrorCode` 分类 + 用户可读消息 | `GitError` |
| `git/repositoryResolver.ts` | 文件→仓库根;优先内置 git 扩展 API,回退 CLI | `Repository` |
| `git/revisionResolver.ts` | 校验/解析 Revision→完整 hash | `ResolvedRevision` |
| `git/commitProvider.ts` | Commit 元数据 | `GitLineCommitInfo` 等 |
| `git/blameProvider.ts` | 文件级 blame 缓存 + 单行查询 | `BlameLine[]` |
| `git/patchProvider.ts` | name-status/numstat/逐文件 hunk | 原始 diff 文本 |
| `git/pathEvolutionProvider.ts` | patch→display 路径演化 | `FilePathEvolution[]` |
| `git/worktreeManager.ts` | 受管理 worktree 创建/复用/清理 | `ExactPatchWorkspace` |
| `patch/models.ts` | 全部核心数据结构 | 见第 11 节 |
| `patch/unifiedDiffParser.ts` | hunk→`AddedLineRange[]` | 纯函数,易测 |
| `patch/fileStatusParser.ts` / `numstatParser.ts` | `-z` NUL 分隔解析 | 纯函数 |
| `patch/patchService.ts` | 编排:解析 + 缓存 + 装配 `PatchModel` | `PatchModel` |
| `patch/survivingLineMapper.ts` | blame→存活行归属 | `LinePatchMembership[]` |
| `patch/projectedFootprintMapper.ts`(P1) | patch→display 投影 | `ProjectedAddedRange[]` |
| `highlight/*` | 会话/图层/归属索引/Decoration 工厂/合成/管理/编辑器跟踪 | 见第 25-29 节 |
| `hover/*` | 两个 HoverProvider + 命令 URI 构建器 | — |
| `tree/*` `status/*` | TreeView / 状态栏 | — |
| `ui/*` | QuickPick / InputBox / Progress / Notification / worktree 启动器 | — |
| `cache/*` | 缓存键 + 各缓存实现 | — |
| `worktree/*` | worktree 元数据存储 + 清理服务 | — |
| `utils/*` | Disposable 聚合 / 路径 / 取消 / 日志 | — |
| `commands/*` | 命令编排(薄层,调服务) | — |

### 10. Patch Revision 与 Display Revision 模型

这是整个设计的**坐标系基石**。严格区分五个坐标空间,任何高亮都不得默认它们相同:

| 坐标空间 | 含义 | 来源 |
|---|---|---|
| Patch 原始新增行坐标 | `git diff base patch` 的新文件侧行号(1-based) | 解析 hunk header |
| Patch Revision 文件坐标 | `patchRevision` 下该文件的真实行号 | = Patch 原始坐标(若文件未被该 Patch 之外改动) |
| 当前 HEAD 文件坐标 | `displayRevision=HEAD` 下文件行号 | 磁盘文件 |
| Working Tree 文件坐标 | 工作区磁盘行号 | 磁盘文件 |
| VSCode Document Buffer 坐标 | 未保存缓冲区行号 | `TextDocument` |

`PatchRevisionContext`:

```ts
interface PatchRevisionContext {
  baseRevision: string;     // Patch 基准(单 commit 通常为 commit^1)
  patchRevision: string;     // Patch 应用完成后的版本
  displayRevision: string;   // 当前显示/高亮的 Git 版本(HEAD 或 worktree 的 patchRevision)
}
```

**图层存活约束**(第 14.3 节):一个 `PatchHighlightLayer` 始终绑定一个 `displayRevision`。同一编辑器(同一真实文件版本)只能叠加**同 `displayRevision`** 的图层:

- 多个 surviving-lines / projected 图层 → 均以 `displayRevision=HEAD` 叠加 ✅
- 工作区 + 暂存区图层 → 均以工作区磁盘为 display 基准,可叠加 ✅
- 两个不同 `patchRevision` 的 exact 图层 → 各自独立 worktree / 独立 Window,**不**在同一文件版本叠加 ❌
- 历史 Patch 旧行号 → 永不直接套到当前 HEAD ❌

`viewMode` 三态:`'exact-patch-revision' | 'surviving-lines' | 'projected-footprint'`。模式决定坐标映射算法(见第 18-20 节)。

### 11. 数据结构

核心模型(落地于 `patch/models.ts`,与规格第 27 节一致,补充实现细节):

```ts
type PatchSelectionType = 'commit' | 'range' | 'working-tree' | 'staged'; // 不含 patch-file
type HistoricalPatchViewMode = 'exact-patch-revision' | 'surviving-lines' | 'projected-footprint';

interface PatchSelection {
  repositoryRoot: string;
  type: PatchSelectionType;
  baseRevision?: string;     // working-tree/staged 时为 HEAD/index 基准
  patchRevision?: string;    // working-tree/staged 时缺省
  displayRevision?: string;
  commitHash?: string;
  displayName: string;
  viewMode: HistoricalPatchViewMode;
}

interface AddedLineRange { startLine: number; endLine: number; } // Git 1-based inclusive

interface ProjectedAddedRange {
  originalStartLine: number; originalEndLine: number;
  currentStartLine?: number; currentEndLine?: number;
  status: 'unchanged' | 'moved' | 'modified' | 'deleted' | 'ambiguous';
  confidence: 'high' | 'medium' | 'low';
}

interface PatchFileChange {
  oldPath?: string; newPath?: string; displayPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'binary' | 'submodule';
  similarity?: number;
  addedLineCount: number; deletedLineCount: number;
  originalAddedRanges: AddedLineRange[];
  projectedRanges?: ProjectedAddedRange[]; // P1
}

interface PatchModel {
  selection: PatchSelection;
  files: PatchFileChange[];
  totalAddedLines: number; totalDeletedLines: number;
  createdAt: number;
}
```

会话与图层(落地于 `highlight/`,与规格第 14.2 节一致):

```ts
interface PatchHighlightLayer {
  patchId: string;            // <repoId>:<baseHash>:<patchHash>:<viewMode>  (working-tree/staged 用 :working-tree / :staged)
  selection: PatchSelection;
  patch: PatchModel;
  enabled: boolean;
  displayRevision: string;
  viewMode: HistoricalPatchViewMode;
  colorSlot: number;          // 0..5,稳定分配(见第 28 节)
  label: string;
  createdAt: number;
}

interface RepositoryHighlightSession {
  repositoryRoot: string;
  patchLayers: Map<string, PatchHighlightLayer>;
  primaryPatchId?: string;
  enabled: boolean;
  displayRevision: string;
  currentFileOnly: boolean;
  createdAt: number; updatedAt: number;
}
```

行归属与合成(落地于 `highlight/`):

```ts
interface PatchLineMembership {
  patchId: string;
  status: 'exact' | 'surviving' | 'moved' | 'modified' | 'ambiguous';
  confidence: 'high' | 'medium' | 'low';
  originalPath?: string; originalStartLine?: number; originalEndLine?: number;
}

interface ComposedLineDecoration {
  line: number; // VSCode 0-based,仅表现层
  style: 'single-patch' | 'multi-patch-overlap' | 'modified' | 'ambiguous';
  primaryPatchId?: string;
  patchIds: string[];
}
```

patchId 稳定性:`patchId` 由 `repoId + baseHash + patchHash + viewMode` 派生,保证"同一 Patch 重复添加"可去重且跨重启可识别;working-tree/staged 用语义后缀,不依赖具体 hash。

---

## Part IV - Git 层

### 12. GitRunner 设计

【决策】统一 `GitRunner`,**仅** `child_process.spawn('git', argArray, {env, cwd})`,**禁** `execSync`、**禁** 拼接 shell 字符串。所有用户输入(Redvission/路径)先进 `revisionResolver`/路径规范化,绝不直接进参数。

接口:

```ts
interface GitRunOptions {
  repositoryRoot?: string;
  cwd?: string;
  timeout?: number;            // 默认 pentimento.git.timeout
  token?: CancellationToken;
  maxOutputBytes?: number;     // 默认 pentimento.git.maxOutputBytes
  stdin?: string | Buffer;     // 支持标准输入
  env?: Record<string,string>;
  nullSeparated?: boolean;     // -z 输出按 NUL 拆
}

interface GitRunResult { stdout: Buffer; stderr: string; exitCode: number; durationMs: number; }

class GitRunner {
  async run(args: string[], opts?: GitRunOptions): Promise<GitRunResult>;
  async runText(args: string[], opts?: GitRunOptions): Promise<string>; // stdout->utf8
}
```

关键能力与约束:

- **参数数组**:如 `spawn('git', ['-C', repoRoot, 'diff', '--unified=0', '--no-color', base, patch, '--', filePath])`。路径与 Revision 以独立参数传递,彻底杜绝 shell/参数注入。
- **取消**:`opts.token` 触发即 `child.kill('SIGTERM')`,映射为 `GitErrorCode 'command-cancelled'`。
- **超时**:超时 `child.kill()` -> `'command-timeout'`。
- **输出上限**:stdout 累积字节达 `maxOutputBytes` 即 kill -> `'output-limit-exceeded'`;用增量计数而非事后截断,防内存爆。
- **并发限制**:`p-limit` 风格信号量,`pentimento.git.maxConcurrentCommands`(默认 4)全局节流,避免大型仓库 blame 风暴。
- **错误分类**:进程未找到 -> `git-not-found`;stderr/exit 映射 `not-a-repository` / `invalid-revision` / `ambiguous-revision` / `worktree-conflict` / `dirty-worktree` / `permission-denied` / `file-not-found` / `binary-file`;其余 `unknown`。`gitErrors.ts` 提供 `toUserMessage(error)`。
- **版本检测**:`gitVersion.ts` 启动时 `git --version` 一次,缓存;低于最低版本(【决策】最低 2.20,因 `--find-renames`/`--porcelain=v2` 稳定)置 `unsupported-git-version`。
- **可注入测试**:`GitRunner` 以接口暴露,测试可注入 fake 实现返回固定 diff。
- **结构化日志**:经 `utils/logging.ts`(Output Channel `Pentimento`)记录子命令、参数数量、耗时、exit、输出大小、仓库匿名 ID;**不**打印完整 diff、凭证、token、远端认证地址;参数脱敏(Revision 显示前 8 位+`…`)。
- **NUL 分隔**:`name-status`/`numstat`/`status -z` 解析按 `\0` 拆,正确处理含空格/非 ASCII 路径与 quoted path。

### 13. 仓库识别

【决策】优先复用 VSCode 内置 git 扩展 API(soft dep),失败回退 CLI:

1. `vscode.extensions.getExtension<GitAPI>('vscode.git')` -> 若可用,取其 `repositories`,按 `rootUri.fsPath` 建索引;对活动编辑器文件用最长前缀匹配定位。
2. 不可用或未命中 -> `GitRunner.run(['rev-parse','--show-toplevel'], {cwd: fileDir})`。
3. `repositoryResolver` 维护 `Map<normalizedRepoRoot, Repository>`,键做大小写规范化(`fs.realpath` + 平台 case 处理)以兼容符号链接与大小写差异。
4. **仓库 ID**:`repoId = sha256(realpath(repoRoot))` 前 16 位,用于 patchId/worktree 目录,避免泄露路径。
5. 多仓库/Multi-root:每仓库独立 `RepositoryHighlightSession`、独立缓存;状态栏跟随活动编辑器所属仓库;Workspace Folder 关闭释放其缓存。
6. **跨仓库隔离**:输入的 Commit 若在多仓库均存在,**仅**基于当前活动编辑器所属仓库处理,不猜测。
7. Bare repo:`git rev-parse --is-bare-repository` 为真 -> 明确提示"Pentimento 不支持 bare 仓库直接浏览,请用普通 worktree"。

### 14. Revision 解析

`revisionResolver.ts`:

1. 拆 Range:`a..b` / `a...b`(后者语义为对称差,本插件 P0 不支持,提示用 `a..b`)-> `baseRevision=a, patchRevision=b`;否则整体视为单 Revision。
2. 校验:`GitRunner.run(['rev-parse','--verify','--quiet', `${input}^{commit}`])`;失败 -> `invalid-revision` / `ambiguous-revision`(用 `--verify` 配合 stderr 判定)。
3. **解析为完整 hash** 后,后续所有命令只用完整 hash,杜绝通过 Revision 注入额外参数(如 `--upload-pack`)。
4. `refs/changes/...`、`refs/pull/.../head`、`refs/merge-requests/.../head` 一律走标准 `rev-parse`,本地不存在 -> 明确错误(不自动 fetch;受控 fetch 为 P1 UI 可选功能,仍不要求终端)。
5. 单 commit 的 `baseRevision`:若 `commit^1` 解析失败(根 commit),则该 commit 视为"新增全仓"基准(用空树 `4b825dc642cb6eb9a060e54bf8d69288fbee4904`)。
6. Merge commit 检测见第 24 节。

---

## Part V - Hover

### 15. Hover 实现

**注册**:`vscode.languages.registerHoverProvider({ scheme: 'file' }, provider)`,收窄 scheme,不无条件注册所有文档类型。

**性能模型**(规格第 12.5 节硬要求):

- **不**在每次鼠标移动同步跑 git。HoverProvider `provideHover` 内:
  1. 取 `document.uri` + `position.line`;若该文件非 git 仓库 / scheme 非 file / hover 配置关闭 -> 返回 `undefined`。
  2. 取**文件级 blame 缓存**(键含 `repoRoot + HEAD + filePath + document.version`);未命中则一次性 `git blame --line-porcelain [-M -C] -- <file>` 取整文件,解析为 `Map<line, BlameLine>` 入缓存;超大文件(行数阈值)退化为单行 `-L l,l`。
  3. 从缓存按行读 `BlameLine` -> 组装 `GitLineCommitInfo`。
- **debounce**:用一个 per-document 的 `CancellationTokenSource`,新请求来即取消上一个,保证"多个快速 Hover 只保留最新请求"。
- **缓存失效**:HEAD 变 / 分支切 / 文件保存 / 文件重命名 / doc.version 变 -> 按粒度失效(第 35 节)。
- **取消**:`provideHover` 收到 token 取消即停止后续工作。

**Hover 内容**(`MarkdownString`,支持 command URI):

- 受信:`markdown.isTrusted = true`(仅允许 `command:` URI 指向 pentimento 命令白名单);`supportHtml` 关闭。
- 标题行:`Pentimento`。
- 未提交(blame 全零 hash):显示 `Uncommitted Changes` + `[添加工作区修改到高亮]` `[添加暂存区修改到高亮]` `[仅高亮工作区修改]` `[清除高亮]`。
- 已提交:短 hash · 作者 · 相对时间 · summary。未选中状态:`[添加此提交到高亮]` `[仅高亮此提交]` `[打开精确 Patch 版本]` `[查看提交文件]` `[复制提交哈希]`。已选中状态:`[取消此提交高亮]` `[设为主要 Patch]` `[显示或隐藏此 Patch]` `[打开精确 Patch]` `[管理全部 Patch]`。
- **命令参数安全**:URI 参数 JSON 序列化后 `encodeURIComponent`;命令执行入口统一 `revalidate`(重新校验仓库 + Revision + 文件仍存在)后再行动;**禁** 拼接到任何 shell 调用。
- **重叠行 Hover**(第二个 provider `patchMembershipHoverProvider`):行被多 Patch 命中时,列出每个 patch 的短 hash / summary / 状态 / 置信度,并提供 `[设 X 为主要 Patch]` `[仅显示 X]` `[取消 Y]` `[管理全部 Patch]`。

**配置**:`pentimento.hover.enabled`(总开关,关则返回 undefined)、`pentimento.hover.delay`(debounce ms,默认 300)、`pentimento.hover.mode`(`compact | full | disabled`)。Compact 仅 hash+summary+两个主操作;Full 含作者/时间/Patch 状态/全部操作。

### 16. 与 GitLens Hover 共存方案

原则:**Pentimento 是一个普通的、守规矩的 HoverProvider**,不感知 GitLens 是否存在。

- 用标准 `registerHoverProvider`,不替换、不覆盖、不依赖显示顺序、不修改 GitLens 配置/缓存/私有 API。
- Pentimento Hover 带明确标题块,关闭后 GitLens 不受影响;GitLens 未安装时 Pentimento 完整运行。
- **行尾零占用**(第 29.1 节):默认不使用 `before`/`after`/CodeLens/InlayHint/InlineValue/行尾虚拟文本 -> 天然不与 GitLens Current Line Blame 抢行尾空间。
- 信息走背景 + 左边框 + Overview Ruler + Hover + TreeView + 状态栏,不靠行尾文字表达关键语义。
- 兼容模式 `pentimento.compatibility.mode=true`(默认)进一步收敛视觉(见第 29 节)。
- DocumentSelector 收窄为 `{ scheme: 'file' }`,避免抢所有文档类型。

---

## Part VI - Patch 解析与历史高亮

### 17. Diff 解析

【决策】**多阶段解析,禁止单一正则吞整份 diff**(规格第 26 节硬要求)。三阶段:

1. **文件状态**:`git diff --name-status -z --find-renames --find-copies <base> <target>` -> `fileStatusParser` 按 NUL 拆,识别 `A/M/D/Rxx/Cxx/T`(R/C 带相似度),产出 `{oldPath,newPath,status,similarity}`。正确处理 quoted path、含空格、非 ASCII、mode change。
2. **统计**:`git diff --numstat -z <base> <target>` -> `numstatParser`,产出 `added/deleted/path`(二进制显示 `-\t-\t`)。
3. **逐文件 hunk**:对每个需高亮文件,`git diff --unified=0 --no-color <base> <target> -- <filePath>` -> `unifiedDiffParser` 仅取新文件侧 `+` 行。

Hunk header 解析(支持所有规格变体):

```
@@ -oldStart,oldCount +newStart,newCount @@
@@ -oldStart +newStart @@
@@ -0,0 +1,20 @@      (新增文件)
@@ -10,5 +10,0 @@     (纯删除,newCount=0)
```

- count 省略默认 1;`newCount=0` 无新增行。
- 仅收集 hunk 内行首为 `+` 的行(不含 `+++++` 文件头、`---`、context、`\ No newline at end of file`、`diff --git`、`index`)。
- 合并连续 `+` 行为 `AddedLineRange{startLine,newStart; endLine=newStart+count-1}`(Git 1-based inclusive)。
- 新增空行(纯 `+` 无内容)也算 Patch 行,支持整行 Decoration。
- 二进制:`Binary files …` -> `status:'binary'`,跳过 hunk。
- Submodule:`Submodule …` -> `status:'submodule'`,不按文本解析。
- **行号基准**:全链路 1-based;**仅** 在 `highlight/` 表现层转 0-based 生成 `vscode.Range`。各模块不得混用。

### 18. 当前 HEAD 精确高亮(`exact-patch-revision`,patchRevision==HEAD)

触发条件全部满足:

- `patchRevision == HEAD`(完整 hash 相等);
- 当前文件磁盘内容与 HEAD 一致(`git status --porcelain=v2 -z` 该文件无变更);
- `document.isDirty === false`。

此时 `Patch 原始新增行坐标 == 当前文件行号`,可直接在当前 `TextEditor` 用 `AddedLineRange` 生成 Decoration。这是最便宜、最准确的路径。

任一条件不满足 -> **不得** 假定行号一致,转入存活行模式或提示精确 worktree(第 19/23 节)。

### 19. 历史 Patch 存活行模式(`surviving-lines`)

语义:**只**高亮 `displayRevision`(通常 HEAD)中仍可可靠归属于目标 Patch 的行;**不**用历史旧行号。

- 单 commit:`git blame --line-porcelain -M -C <displayRevision> -- <currentPath>`(对当前路径 blame;路径经第 22 节演化解析定位)。`survivingLineMapper` 将 blame commit 完整 hash == 目标 commit 的行标记为 `surviving`(confidence high)。
- Commit Range:先 `git rev-list <base>..<patch>` 得 commit 集合(大 Range 做集合成员判定,必要时用 `git cat-file --batch` 加速;超大 Range 触发 `largePatch` 限制);blame commit 落在集合内即存活。
- **归属语义**(规格 15.5):Commit A 新增、Commit B 后续修改该行 -> 存活行模式下该行只归 B,不再归 A;只有投影模式(P1)能表达"A 引入、B 修改"。
- 后续仅移动行号(M/C 识别)尽量继续归属;后续被改的行不再作存活行;已删除行不显示;无法确认的行不强行高亮。
- 状态栏:`Pentimento: 3f68c71a -> HEAD · Surviving · 86 lines`。

### 20. 精确历史 Patch Worktree 模式(`exact-patch-revision`,历史)

最准确的历史查看方式。**不** checkout/stash 用户当前工作区。

创建(`worktreeManager`):

- 目录:`<globalStorageUri>/worktrees/<repoId>/<patchHash>/`。
- 命令:`git worktree add --detach <worktreePath> <patchRevision>`(带 `--detach` 不创建分支)。
- **互斥锁**:per `<repoId>:<patchHash>` 的进程内 Promise 锁 + 元数据文件锁,防并发重复创建。
- **复用**:`pentimento.exactPatch.reuseWorktree=true`(默认)时,若已有同 patchRevision 的受管 worktree 且健康,直接复用。
- 元数据 `worktreeMetadataStore`(JSON 于 globalStorage):`repositoryRoot/repositoryId/worktreePath/baseRevision/patchRevision/createdAt/lastOpenedAt/vscodeWorkspaceOpened`。

打开(`exactWorkspaceLauncher`):

- `vscode.commands.executeCommand('vscode.openFolder', Uri.file(worktreePath), true)` 打开**新 Window**(true=新窗)。
- 新 Window 中 Pentimento 激活 -> 读元数据 -> 自动恢复 exact-patch-revision 高亮(在该 worktree 内 `git diff base patch` 新文件侧 == worktree 文件坐标)。
- 状态栏标记 `Exact Patch Workspace`,提供 `[关闭并清理]` `[仅关闭]` 按钮。

清理(`worktreeCleanupService`,见规格第 19 节安全要求):

1. 校验路径**严格位于** `<globalStorageUri>/worktrees/<repoId>/` 之内(规范化后前缀匹配)。
2. 校验其为该仓库 registered worktree(`git worktree list --porcelain`)。
3. 校验元数据 `repositoryId + patchRevision` 匹配。
4. `git worktree remove --force <path>` + `git worktree prune`。
5. **禁** 对未通过 1-3 的路径 `fs.rm`;插件崩溃后启动时扫描元数据,识别残留 worktree 并提供 `Clean Stale Temporary Worktrees`。
6. `pentimento.exactPatch.cleanupOnExit=false`(默认)不在 deactivate 强删,保留可复用;`true` 则停用时清理。

### 21. 非祖先 Commit 处理

`git merge-base --is-ancestor <patchRevision> <displayRevision>` 返回非祖先 -> 弹 QuickPick:

```
目标 Patch 不在当前分支祖先链上,无法可靠判断它在当前版本中的代码演化关系。
 1. 打开该 Patch 的精确版本     (默认推荐)
 2. 尝试映射到当前版本          (P1,投影)
 3. 取消
```

**绝不**把旧 Patch 行号套到当前 HEAD。`pentimento.historical.preferExactWorktreeForNonAncestor=true`(默认)使选项 1 置顶且为默认。

### 22. 文件重命名和删除

`pathEvolutionProvider`:`git diff --name-status -z --find-renames --find-copies <patchRevision> <displayRevision>` -> `FilePathEvolution[]`(`patchPath/currentPath/status{unchanged,renamed,copied,deleted,unknown}/similarity`)。

- 重命名:TreeView/Hover 显示 `Patch 路径: a.py` / `当前路径: connectors/a.py`;存活行模式对**当前路径** blame。
- 删除:`Patch 中新增 N 行,当前版本中文件已删除` -> 当前版本不打开不存在文件;精确 worktree 仍可查看 patchRevision 版文件。
- 仅重命名且内容未变:**不**把整个文件当新增(`status:'renamed'`,非 `'added'`)。
- 路径含空格/非 ASCII:全程经参数数组传递,不拼字符串。

### 23. 脏工作区和未保存文档

检测:`git status --porcelain=v2 -z`(该文件 index/working 变更)+ `document.isDirty`。

- 若当前文件有未提交/未保存内容,且无可靠多阶段映射 -> **不**静默用 HEAD 行号,弹提示:

```
当前文件包含未提交或未保存修改,历史 Patch 行号无法安全直接应用。
 1. 打开精确 Patch 版本
 2. 仅高亮 blame 可确认的存活行
 3. 保存文件后重新计算
 4. 取消
```

- 工作区 Patch(`type:'working-tree'`)新行坐标对应**磁盘** working tree;若文档有未保存修改,MVP 提示"请用 VSCode 保存按钮保存后重算"或"当前不支持未保存缓冲区精确高亮",**不**要求终端。
- 暂存区 Patch(`type:'staged'`)用 `git diff --cached --unified=0 --no-color` 语义(HEAD->index),只高亮暂存区新增/替换后新行。

### 24. Merge Commit

**禁**默认 `commit^1`。`git rev-list --parents -n 1 <commit>` 解析 parent 数:

- 1 parent:普通 commit,`baseRevision=commit^1`。
- ≥2 parent:merge commit -> QuickPick `请选择 Patch 比较基准: Parent1(短hash+分支名若可推断) / Parent2 / Merge base(P1) / 取消`;用户取消则不执行高亮。
- P0 最少要求:识别 merge、不静默选父、允许选 Parent1/Parent2、取消即中止。Merge base 模式为 P1。

---

## Part VII - 多 Patch

### 25. 多 Patch 会话模型

【硬约束】**从数据模型第一天即多图层,禁止单一全局 `activePatch`**。`highlightSessionManager` 维护 `Map<repoRoot, RepositoryHighlightSession>`,每个 session 内 `patchLayers: Map<patchId, PatchHighlightLayer>`。

- **添加(Add)**:保留现有图层,新增当前;`patchId` 已存在则幂等(可选 focus/提升)。
- **仅高亮(Replace)**:清当前仓库其他图层,仅留当前。
- **Toggle**:已存在则取消,否则添加。
- **隐藏/显示/移除**:仅改 `enabled` 或删图层,不影响其他。
- **数量限制**:`pentimento.multiPatch.maxActivePatches`(默认 6);超限弹 QuickPick 让用户隐藏/移除已有图层再添加。**禁** 无限创建 DecorationType 或无限保留数据。
- **同 displayRevision 约束**(第 10 节):新增图层若 `displayRevision` 与当前会话不一致(如当前是 exact worktree window 而 display=HEAD)-> 拒绝或提示"请在主工作区窗口添加 HEAD 模式图层"。
- 跨重启:`patchLayers` 序列化到 workspace/globalState(仅 selection 元数据,不存 diff);激活时按需重算。

### 26. 行级 Membership

`lineMembershipIndex`:`Map<docUri, Map<line(0-based), PatchLineMembership[]>>`,按可见文件**增量**计算:

- 流程:Patch 原始范围 -> 各图层对该文件产出 `PatchLineMembership`(exact/surviving/moved/modified/ambiguous + confidence)-> 写入索引。
- 同一行可关联多 Patch(范围/项目重叠、后续修改、cherry-pick、工作区覆盖历史 Patch 等)。
- 图层隐藏后释放其贡献的行级缓存(第 38 节 15)。
- 文档关闭释放该 doc 整个条目。

### 27. 重叠 Decoration 合成

`decorationComposer` 把每行的 `PatchLineMembership[]` 合成单一 `ComposedLineDecoration`,**每行只产出一种最终视觉样式**(规格 15.2 硬要求,禁无序半透明叠加):

- 命中 1 个 patch -> `single-patch`,用其 `colorSlot` 样式。
- 命中 ≥2 patch -> `multi-patch-overlap`,用专用 overlap 样式(特殊背景 + 左边框 + Overview Ruler 标记),`primaryPatchId` 决定排序/默认。
- 含 `modified` 成员 -> `modified`(黄/橙)。
- 全 `ambiguous` -> `ambiguous`(弱提示或默认不高亮,Hover 说明原因并推荐精确 worktree)。

合成仅对可见文件增量计算;缓存键含 `(repoRoot, displayRevision, filePath, doc.version, 各启用图层 patchId 集合)`。

### 28. 主要 Patch

- 必须存在 primary(多 Patch 模式下);用于:下一/上一 Hunk、TreeView 默认展开、状态栏主信息、重叠行排序、默认打开文件、默认 Patch 详情。
- 切换 primary **不**关闭其他图层。
- `pentimento.multiPatch.hoverDefaultAction`(`add|replace|ask`,默认 `add`)决定 Hover 默认操作语义。
- colorSlot 分配【决策】:**稳定哈希分配**——按 `patchId` 哈希落到 0..5,保证同一 Patch 颜色稳定;冲突时取次空槽;移除后释放槽位。

---

## Part VIII - 表现层

### 29. Decoration 与插件兼容

- **仅** `vscode.window.createTextEditorDecorationType()` + `editor.setDecorations()`;`decorationManager` 统一 dispose。
- 默认视觉:淡色整行背景 + 左细边框 + Overview Ruler;不改文本色/字体/粗细/行高/字距;默认无行尾文字、无 Gutter Icon。
- **主题适配**:`contributes.colors` 声明 6 层 ×(background+border)+ overlap/modified/ambiguous ×(background+border),用 `ThemeColor`/`themeColor` 机制为 light/dark/high-contrast 各给合理默认(不只设计浅色)。
- **样式开关** `pentimento.highlight.style`:`background-and-border`(默认)/`background-only`/`border-only`/`overview-ruler-only`。`border-only` 适配多背景高亮插件共存;`overview-ruler-only` 最大限度减干扰。
- **Gutter** 默认关(`pentimento.highlight.gutterIcon=false`),避免与 git gutter/断点/测试/覆盖率抢 gutter。
- **行尾零占用**(第 29.1):默认禁 before/after/CodeLens/InlayHint/InlineValue;Patch 信息走背景/边框/Overview Ruler/Hover/TreeView/状态栏。
- **兼容模式** `pentimento.compatibility.mode=true`(默认):上述全部保守设置聚合开关。
- **可选 inlineLabel** `pentimento.highlight.inlineLabel=false`(默认),后续版本可开。
- **共存保证**:只管理自身 DecorationType;清除只清自身;不读/改其他插件 Decoration、配置、主题;不清诊断;不遮断点;不依赖渲染顺序表达关键语义。

### 30. TreeView

`patchFilesTreeProvider`(`TreeDataProvider`)提供 `PENTIMENTO`,**懒加载**(规格第 38 节):

- 顶层 Patch 节点:标记 `★ 主要` / `● 已启用` / `○ 已隐藏` / `! 不确定映射`。展示短 hash + summary + 模式 + 存活行数 + 文件行(如 `M alcubierre.py 60`)。
- 文件节点:`M/A/D/R old->new +新增行数`;`D` 显示 `+0`。
- Hunk 节点:`Hunk 1 · Lines 34-52`。
- 顶部操作(视图标题栏):添加 / 显示全部 / 隐藏全部 / 仅显示主要 / 清除全部 / 管理。
- 上下文菜单(节点):设为主要 / 显示隐藏 / 仅显示此 Patch / 打开精确 Patch / 刷新 / 查看文件 / 移除。
- 点击文件:打开真实文件 + 跳首个新增 Hunk + 应用 Decoration(不开 Diff Editor);点击 Hunk 跳转并设其 Patch 为 primary。
- 更新节流,避免闪烁。

### 31. 状态栏

`patchStatusBar`:单一 `StatusBarItem`(alignment Left,priority 适中)。

- 单 Patch:`Pentimento: 3f68c71a · Surviving · 86 lines`。
- 多 Patch:`Pentimento: 3 patches · 5 files · 214 lines`;有重叠:`· 18 overlaps`。
- Exact Worktree:`Pentimento: 3f68c71a · Exact · 3 files · +126`。
- 点击 -> 管理菜单(查看修改文件 / 添加 / 设主要 / 显隐 / 仅显示主要 / 显示全部 / 下一/上一 Hunk / 刷新 / 打开精确 Patch / 清除全部)。
- 跟随活动编辑器所属仓库;无 Patch 时隐藏或显示 idle。

### 32. QuickPick 和 InputBox

- `revisionInput`:InputBox 接收 Revision/Range/Ref,prompt 说明支持格式(`HEAD`/`HEAD~1`/`origin/main`/`feature/x`/`abc123`/`a..b`/`refs/changes/...`/`refs/pull/.../head`/`refs/merge-requests/.../head`)。
- `patchQuickPick`:查看模式选择(HEAD 精确 / 存活行 / 精确 worktree / 投影 P1)、merge 父提交选择、非祖先处理选择、超限时的隐藏/移除选择、管理菜单。
- 所有 QuickPick 支持取消;取消即中止,不改状态。

### 33. Progress 和通知

- 长操作用 `vscode.window.withProgress({ location: Notification | Window }, ...)` 且 `cancellable: true`:正在分析 Patch / 读取 Git 历史 / 创建精确 Patch 工作区 / 映射历史代码 / 刷新高亮。
- 错误用 `showErrorMessage` 给**用户可读**消息(经 `gitErrors.toUserMessage`),**不**直接抛原始 stderr;附 `查看日志` 按钮打开 Output Channel。
- 典型可读错误:无法找到 Git 仓库 / 目标 Commit 不存在 / 当前文件含未保存修改无法精确高亮 / 目标 Patch 不在祖先链 / 创建临时工作区失败。

### 34. Settings 图形页面

`package.json contributes.configuration` 暴露规格第 33 节全部键,每键含 title/英文 description/默认/enum 说明。分组:`Hover / Compatibility / Highlight / Blame / MultiPatch / Historical / ExactPatch / LargePatch / Git / Logging`。默认值与规格第 38 节一致。用户在 Settings UI 即可改全部常用配置,无需手编 settings.json。

---

## Part IX - 非功能

### 35. 缓存和性能

**缓存族**(规格第 37 节):Repository / CommitMetadata / FileBlame / PatchDiff / PatchFileStatus / PathEvolution / WorktreeMetadata / LineMembership / ComposedDecoration。各缓存键至少含 `repositoryRoot + HEAD + filePath + document.version + baseRevision + patchRevision + displayRevision + viewMode + layerId`。

**失效策略(粒度,不全量清空)**:

- HEAD 变 / 分支切 -> 清该仓库 blame/patch/pathEvolution/lineMembership(依赖 HEAD 的);worktree 元数据保留。
- 文件保存 -> 清该文件 blame + doc.version 相关。
- 文件创建/删除/重命名 -> 清对应文件条目 + pathEvolution。
- Workspace Folder 变 -> 释放该 folder 缓存。
- index 变 -> 清 staged/working-tree 相关图层缓存。
- doc.version 变 -> 清该文档 lineMembership/composed。
- 配置变 / 主题变 -> 重建 Decoration 样式,缓存可保留。
- 手动 Refresh / worktree 被外部删 -> 对应清理。

**大型仓库性能(OpenStack/Linux/K8s/Chromium 级)**:

1. 所有 git 异步、不阻塞 Extension Host。
2. 长任务可取消。
3. git 并发由 `GitRunner` 信号量节流。
4. Hover debounce 300ms + 文件级 blame 缓存;不预先全仓 blame。
5. 只对可见编辑器下 Decoration。
6. 不一次打开 Patch 全部文件;TreeView 懒加载。
7. `largePatch.maxFiles=500` / `maxAddedLines=20000` 超限截断并在 TreeView/通知 `log()` 说明被裁剪项(不静默截断)。
8. TreeView/状态栏更新节流;UI 不闪烁。
9. DecorationType 统一管理 dispose。
10. 同 worktree 不重复并发创建。
11. 图层隐藏释放其行级缓存。
12. 合成按可见文件增量。
13. 插件停用取消后台任务。
14. 文档关闭释放对应数据。
15. Hover 阶段**不**解析完整大型 Patch(只读 blame 缓存)。
16. 多快速 Hover 只留最新请求。

### 36. 安全方案

- **无 shell**:全参数数组;用户输入先 `rev-parse --verify`/路径规范化再入参;防 shell/参数注入/路径转义/Revision 注入额外 git 参数。
- **Worktree 路径越界防护**:创建仅在 `<globalStorageUri>/worktrees/<repoId>/<patchHash>/`;清理前严格校验(第 20 节);**禁** 对未验证路径 `fs.rm`、**禁** 递归删用户输入路径、**禁** 误删普通工作目录;崩溃后识别残留 worktree。
- **输出上限**:`maxOutputBytes` 防 OOM。
- **Command URI**:参数 `encodeURIComponent`;仅 pentimento 命令白名单;执行前重校验仓库+Revision+文件存在;**禁** 拼接到任何 shell。
- **日志脱敏**:不输出凭证/SSH 私钥/HTTP token/敏感环境变量/完整 Command URI 参数/未处理远端认证地址;不默认打印完整 diff;仓库用匿名 ID;Git 命令日志只含子命令+参数数+耗时+exit+输出大小。
- **诊断脱敏**:`Show Diagnostics` 复制前对路径与敏感信息处理。
- **取消与超时**:防挂起。
- **不修改用户文件 / 不 checkout / 不 stash / 不切分支**(精确 worktree 用 `--detach` 独立目录)。

### 37. 错误处理

- `GitErrorCode`(规格第 35 节)`git-not-found | unsupported-git-version | not-a-repository | invalid-revision | ambiguous-revision | command-timeout | command-cancelled | output-limit-exceeded | worktree-conflict | dirty-worktree | permission-denied | file-not-found | binary-file | unknown`。
- `gitErrors.toUserMessage(err)` 映射为可读中文/英文文案;关键错误附 `查看日志` 按钮。
- Git 失败不致插件崩溃:每条命令 try/catch,降级为"该图层不可用 + 原因"。
- 用户只见进度、结果、可读错误,不见后台 git 命令。

---

## Part X - 测试

### 38. 单元测试计划

`test/unit/`,纯函数与可注入实现,不依赖真实 git(用 fake `GitRunner`):

- `unifiedDiffParser`:hunk header 全变体、纯新增、替换、纯删除、新增文件、`newCount=0`、空行、no-newline、binary、submodule、quoted path、含空格/非 ASCII、CRLF/LF、行号基准(1-based)。
- `fileStatusParser` / `numstatParser`:`-z` NUL 拆分、Rxx/Cxx 相似度、二进制 `-\t-\t`。
- `blameParser`:`--line-porcelain` 解析、boundary、uncommitted(全零 hash)、移动/复制标记。
- `revisionResolver`:单/Range/Ref、非法、歧义、根 commit(空树基准)、`refs/...`。
- `survivingLineMapper`:行号移动后仍归属、后续修改不再归属、Range 集合成员判定。
- `lineMembershipIndex` / `decorationComposer`:单 Patch/重叠/modified/ambiguous 合成、primary 排序、colorSlot 稳定分配与释放。
- `worktreeManager`(注入 fake git):路径越界拒绝、未验证路径不 `fs.rm`、互斥锁、复用、残留识别。

### 39. 集成测试计划

`test/integration/`,用真实临时 git 仓库构造规格第 43 节 commit 图(A-F + X 分叉 + G/H + Merge M + 路径含空格/非 ASCII/空行/纯删除/新增文件/二进制/submodule + 工作区/暂存区修改 + 未保存文档 + Multi-root 两仓库 + 多 Patch 重叠):

- `commitHighlight`:当前 HEAD 精确高亮、替换新行高亮、删除不显示、上下文不高亮、跳转正常。
- `historicalPatch`:Commit F 工作区选 Commit B 不用旧行号;Commit D 修改后存活行不再归 B;Commit E 重命名后开当前路径;Commit F 删除不误标相邻行。
- `multiPatch` / `patchOverlap`:依次加 B/G/H 三图层不清除、单独显隐移除、重叠行专用样式、Hover 列全部、设主要。
- `renamedFile` / `dirtyWorkspace` / `exactWorktree`(后台建 worktree、新 Window 流程可 mock `openFolder`)、`vscodeUiWorkflow`(纯 UI 无终端)、`extensionCompatibility`(与诊断/搜索/覆盖率/断点共存,清自身不清他人)。
- 集成测试用 `@vscode/test-electron` 在真实 Extension Host 跑。

### 40. VSCode UI 手动测试计划

按规格第 44 节 24 项验收逐条手测并记录于 `docs/IMPLEMENTATION_STATUS.md` 的"手动验证"列。重点:纯页面操作无终端、Hover、GitLens Hover/行尾共存、HEAD 精确、历史行号移动、后续修改、重命名、删除、精确 worktree、非祖先、工作区/未保存/暂存、纯删除/新增文件、Merge、路径含空格、多 Patch、重叠、不同精确版本、Decoration 共存、多仓库、不支持外部 Patch 文件。

---

## Part XI - 计划与风险

### 41. P0 / P1 / P2 计划

**P0**(见规格第 42 节,共 56 项):工程骨架 + 名称含义 README + 纯 UI + 安全 GitRunner + 仓库/Revision/Commit/Blame + Hover(含 GitLens 共存)+ 单 parent Patch 解析 + 新增/替换新行高亮 + TextEditor Decoration(禁 Diff Editor)+ 多文件 + 当前/全部文件模式 + Hunk 导航 + 工作区/暂存高亮 + HEAD 等值与祖先检测 + 存活行模式 + 精确 worktree + 非祖先默认推荐 worktree + 脏/未保存检测 + Merge 检测+父选择 + 重命名基本识别 + 多 Patch 数据模型(添加/显隐/移除/主要/6 上限)+ 行 Membership + 合成 + 重叠样式 + TreeView + 状态栏 + 默认无行尾/CodeLens/Inlay/Gutter + 兼容模式 + border-only + 不依赖 GitLens + Settings UI + Progress/QuickPick/通知 + 自动测试 + 手动测试文档 + README/zh-CN + 架构/安全/UI 工作流文档 + IMPLEMENTATION_STATUS。

**P1**:Commit Range 完整支持、任意本地 Ref 输入、投影模式(后续修改黄标)、文件复制追踪、跨文件移动、Patch 演化统计、Merge Base 模式、Worktree 会话恢复、缓存持久化、多 Patch 投影重叠分析、自定义颜色、Patch 排序/分组、多 commit 合 Range、修改链、Walkthrough/Welcome、受控后台 fetch UI。

**P2**:Gerrit/GitHub/GitLab Ref 辅助获取、可选远端适配器、patch-id 相似提交、rebase/cherry-pick 来源追踪、可选行尾标签、图层导出为会话配置。

**明确不进入任何阶段**:外部 `.patch`/`.diff` 导入、Unified Diff 文件解析、邮件 Patch、剪贴板 Diff、本地 Patch 文件应用。

### 42. 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 大仓 blame 成本高 | Hover/存活行慢 | 文件级缓存+debounce+并发节流+大文件退化单行 blame;不预跑全仓 |
| 历史行号误套到 HEAD | 错误高亮(致命) | 三模式严格区分坐标;非祖先强制 worktree;脏/未保存拦截;ambiguous 不标绿 |
| worktree 清理误删 | 数据丢失(致命) | 路径前缀+registered+元数据三重校验;禁 fs.rm 未验证路径;崩溃后扫描 |
| exact window 语言服务冷启动慢 | 体验下降 | 复用 worktree;提示进度;后续优化索引预热 |
| Decoration 颜色与主题/其他插件冲突 | 视觉干扰 | 6 槽 + overlap/modified/ambiguous;ThemeColor;border-only/overview-ruler-only 降冲突 |
| Hover 快速移动抖动 | UI 闪烁 | per-doc CTS 取消旧请求;debounce;只留最新 |
| `vscode.git` 扩展 API 不可用 | 仓库识别退化 | CLI 回退;两者都不可用给明确错误 |
| 不同 displayRevision 图层误叠加 | 逻辑错误 | session 级 displayRevision 约束 + 拒绝/提示 |
| 大 Patch 截断静默 | 覆盖不全 | `log()` 裁剪项 + 通知 |
| Range rev-list 过大 | 性能 | 集合判定 + largePatch 限制 |

### 43. 需要确认的技术决策

以下为本文给出推荐但需用户拍板的项;确认后进入阶段 1 实现。

1. **目标 VSCode 引擎版本**【待确认】:推荐 `engines.vscode: ^1.85.0`(覆盖 `openFolder` 新窗、`withProgress` cancellable、ThemeColor 稳定)。是否上调到 1.90+?
2. **仓库识别主路径**【待确认】:推荐优先内置 `vscode.git` 扩展 API(soft dep,API 更稳)+ CLI 回退。是否同意,还是纯 CLI?
3. **精确 worktree 打开方式**【待确认】:推荐 `vscode.openFolder(uri, true)` 开**新 Window**(规格要求新窗)。Window 内自动恢复高亮靠新 Window 激活时读元数据;确认该 UX。
4. **最低 Git 版本**【待确认】:推荐 2.20。是否上调(如 2.25 以更好支持 `--find-renames` 默认)?
5. **colorSlot 分配**【待确认】:推荐 `patchId` 稳定哈希到 0..5(同 Patch 颜色稳定)。是否改用首次空槽轮询?
6. **historical.defaultMode**【待确认】:推荐 `ask`(非祖先/历史时弹 QuickPick)。是否默认 `surviving-lines` 以减少打断?
7. **多 Patch 上限**【待确认】:推荐默认 6(规格值)。确认。
8. **仓库 ID 派生**【待确认】:推荐 `sha256(realpath(repoRoot))` 前 16 位(匿名、稳定)。确认。
9. **打包方式**【待确认】:推荐 `esbuild` 打 bundle(启动快、`.vscodeignore` 瘦包)。是否接受 esbuild 依赖?
10. **测试框架**【待确认】:推荐单元用 `mocha`+`chai` 或 `node:test`;集成用 `@vscode/test-electron`;真实临时仓库用 `tmp`/`node-tmp`。确认选型。
11. **License**【待确认】:推荐 MIT。确认。
12. **持久化范围**【待确认】:推荐 `patchLayers` selection 元数据存 `workspaceState`/`globalState`(不存 diff,激活重算);worktree 元数据存 globalStorage JSON。确认。
13. **Range 的 `...` 对称差**【待确认】:P0 明确**不支持** `a...b`,提示用 `a..b`。确认。
14. **未保存缓冲区精确高亮**【待确认】:MVP 不支持,提示保存或开精确版本。确认是否接受 MVP 该限制。
15. **远端 Ref 自动 fetch**【待确认】:P0 不自动 fetch;`refs/changes/...` 本地不存在即报错。受控 fetch UI 列 P1。确认。

---

> 待用户对第 43 节确认后,按规格第 47 节 13 个阶段依次实现;每阶段结束输出阶段报告并更新 `docs/IMPLEMENTATION_STATUS.md`。本设计文档作为各阶段实现的依据,后续 `ARCHITECTURE.md`/`SECURITY_DESIGN.md` 等结构化文档由实现阶段产出并对齐本文。
