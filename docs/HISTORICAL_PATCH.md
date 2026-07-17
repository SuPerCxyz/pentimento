# 历史 Patch

历史 Patch 指非当前 HEAD 的提交引入的变化。Pentimento 严格区分坐标空间,**绝不把历史旧行号直接套到当前 HEAD**。

## 三种查看模式

| 模式 | 触发 | 坐标来源 | 准确性 |
|---|---|---|---|
| `exact-patch-revision` | patchRevision == HEAD 且文件干净 | Patch AddedLineRange == 当前文件行号 | 最高 |
| `surviving-lines` | 历史(HEAD 祖先)commit | 当前 HEAD 的 `git blame` 归属 | 高(只高亮仍归属目标 patch 的行) |
| 精确 worktree | 非 HEAD / 需像素级 | 受管 worktree(patchRevision)== 文件 | 最高(独立 Window) |
| `projected-footprint` | P1 | patch->display 投影 | 中 |

## 存活行模式(`surviving-lines`)

- `git blame --line-porcelain -M -C <displayRevision> -- <currentPath>`(对当前路径)。
- `survivingLineMapper.findSurvivingRanges(blame, targetCommits)`:只保留 `commitHash ∈ targetCommits` 的行,合并为范围。
- 单 commit:targetCommits = {patchRevision}。Range:`git rev-list base..patch` 集合(缓存)。
- **归属语义**:Commit A 新增、Commit B 后续修改该行 -> 存活行模式下该行只归 B;A 的存活行不再包含它。
- 行号移动(C 前置)后,存活行用**当前**行号,非原始小行号(由集成测试守护)。

## 非祖先 Commit

`git merge-base --is-ancestor <patch> <display>` 返回非祖先 -> QuickPick:`打开精确版本` / `取消`(投影 P1)。绝不误套旧行号。

## 精确 worktree

- `git worktree add --detach <globalStorage>/worktrees/<repoId>/<patchHash>/ <patchRevision>`(互斥 + 复用)。
- `vscode.openFolder(worktree, true)` 新 Window;激活时读元数据自动恢复 exact 高亮。
- 清理三重校验:受管路径前缀 + registered worktree + patchRevision 匹配;禁 `fs.rm` 未验证路径。

## Merge Commit

`git rev-list --parents -n 1 <commit>` 解析父提交数;>1 时 QuickPick 选 Parent1/Parent2,取消即中止。

## 脏工作区 / 未保存文档

`git status --porcelain` + `document.isDirty`;若有未提交/未保存且无可靠映射 -> 提示精确模式或保存,不静默用 HEAD 行号。
