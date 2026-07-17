# 扩展兼容性

Pentimento 是守规矩的 VSCode 扩展,与 GitLens、git gutter、诊断、搜索、覆盖率、断点、调试等共存。

## 与 GitLens 共存

- 标准 `vscode.languages.registerHoverProvider({ scheme: 'file' })`,不替换/不覆盖/不依赖显示顺序。
- 不修改 GitLens 配置、不读其缓存、不调其私有 API。
- **默认无行尾虚拟文字 / CodeLens / InlayHint / Gutter Icon** -> 不与 GitLens Current Line Blame 抢行尾空间。
- 关闭 `pentimento.hover.enabled` 后 GitLens 照常;GitLens 未安装时 Pentimento 完整运行。

## 与其他 Decoration 共存

- 只管理 Pentimento 创建的 `TextEditorDecorationType`(`DecorationManager` 统一 dispose)。
- 清除高亮只清自身;不读/改其他插件 Decoration、配置、主题;不清诊断;不遮断点。
- `border-only` / `overview-ruler-only` 样式适配多背景高亮插件共存。
- 颜色用 `ThemeColor` + `contributes.colors`,适配 Light/Dark/High Contrast 三主题。

## 兼容模式

`pentimento.compatibility.mode = true`(默认):聚合保守设置(无行尾/CodeLens/InlayHint/Gutter,仅淡背景 + 左边框 + Overview Ruler)。

## 不做

- 不强制关闭/改配置其他插件;不替换其他 Hover Provider;不依赖 Decoration 渲染顺序表达关键语义。
