# 测试计划

## 自动测试

- **单元测试**(`test/unit/`,纯 Node + Mocha/Chai,CI 跑):167 通过。
  - 解析器:`unifiedDiffParser` / `fileStatusParser` / `numstatParser` / `blameParser`(含真实 `--line-porcelain` 格式:无空行 header、逐行/分组兼容、orig/final 行号)。
  - Git 层:`gitErrors`(分类)/ `gitVersion` / `revisionResolver`(注入)/ `repositoryResolver`(纯函数 + 缓存)/ `gitRunner`(真实 git:版本/取消/非仓库/无效 Revision/`-C`)/ `commitProvider`(`parseCommitShow` + `parseParents`)。
  - Patch:`patchService`(注入 fake git,组装 PatchModel,含 binary/delete/rename/working-tree)/ `survivingLineMapper`。
  - Highlight:`patchHighlightLayer`(patchId/colorSlot)/ `repositoryHighlightSession`(add/remove/primary/limit/mismatch)/ `lineMembershipIndex` / `decorationComposer` / `decorationSpec`(纯)。
  - 契约:`constants`(命名空间 + 不含 patch-file + 与 package.json 一致)/ `hoverCommandBuilder`(白名单 + URI 编码)/ `worktreeManager`(路径越界防护)。
- **集成测试**(`test/unit/commitGraphIntegration`,真实临时仓库 commit 图 A-F+X):
  - buildPatch A..B(新增)/ D..E(rename)/ surviving of B in HEAD(行号移动后用当前行号)/ revisionResolver(HEAD/range/非祖先 X)/ worktree create+remove / 越界拒绝。
- **vscode 集成测试**(`test/integration`,`@vscode/test-electron`):入口就绪(空通过),端到端(Hover/Decoration/命令)留 GUI 手动。

## 手动验收(规格第 44 节,24 项)

F5 启动 Extension Host(或安装 CI 产出的 vsix),在**有提交历史**的 Git 仓库文件上验证:
1 纯页面操作 / 2 Hover / 3 GitLens Hover 共存 / 4 GitLens 行尾共存 / 5 HEAD 精确 / 6 历史行号移动 / 7 后续修改 / 8 重命名 / 9 删除 / 10 精确 worktree / 11 非祖先 / 12 工作区 / 13 未保存 / 14 暂存 / 15 纯删除 / 16 新增文件 / 17 Merge / 18 路径含空格 / 19 多 Patch / 20 重叠 / 21 不同精确版本 / 22 Decoration 共存 / 23 多仓库 / 24 不支持外部 patch。

## CI

`.github/workflows/build.yml`:check / lint / compile / test:unit / `vsce package` -> 上传 `pentimento-*.vsix` artifact。
