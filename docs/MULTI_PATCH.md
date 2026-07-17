# Multi Patch

Pentimento 从数据模型第一天即支持多 Patch 图层,**无单一全局 `activePatch`**。

## 会话与图层

- `RepositoryHighlightSession`(每仓库):`patchLayers: Map<patchId, PatchHighlightLayer>` + `primaryPatchId` + `displayRevision`。
- `PatchHighlightLayer`:patchId / selection / patch / enabled / displayRevision / viewMode / colorSlot(0..5)。
- `patchId = <repoId>:<baseHash>:<patchHash>:<viewMode>`(working-tree/staged 用语义后缀),稳定可去重。
- 同 `displayRevision` 的图层才能在同一编辑器叠加(精确 worktree 各自独立 Window/会话)。

## 操作语义

- **添加(Add)**:保留现有,新增;同 patchId 幂等。
- **仅高亮(Replace)**:清除其他,仅留当前。
- **显隐 / 移除 / 设为主要**:不影响其他图层。
- **数量限制**:`pentimento.multiPatch.maxActivePatches`(默认 6);超限返回 `limit-exceeded`,提示隐藏/移除。

## 行归属与合成

- `LineMembershipIndex`:`Map<docUri, Map<line, PatchLineMembership[]>>`。
- `decorationComposer.composeLine`:每行只产一种样式:
  - 单 patch -> `single-patch`(用 layer colorSlot);
  - 多 patch -> `multi-patch-overlap`(专用 overlap 样式);
  - 含 modified -> `modified`;
  - 全 ambiguous -> `ambiguous`。
- 重叠行 Hover 列出全部相关 patch + 设主要/仅显示/取消。

## 主要 Patch

用于 Hunk 导航、TreeView 默认展开、状态栏、重叠排序、默认打开文件。切换主要**不**关闭其他图层。

## colorSlot

稳定哈希分配(`patchId` 哈希 % 6,冲突取次空槽),同 patchId 颜色稳定;移除后释放槽位。6 个主题兼容颜色槽位 + overlap/modified/ambiguous 专用色。
