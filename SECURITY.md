# 安全策略

## 报告漏洞

若你在 Pentimento 中发现安全漏洞,请负责任地报告。**请勿提交公开 issue。**

邮箱:**security@example.com**

请包含:

- 问题描述及其影响。
- 复现步骤或概念验证(PoC)。
- 受影响版本 / 配置。

我们会在合理时间内确认收悉,并协调修复与披露。

## 安全设计原则

Pentimento 代表用户在后台运行 Git。以下不变量属于设计的一部分,
每次变更都必须保留(详见 `docs/TECHNICAL_DESIGN.md`):

- **不使用 shell 字符串拼接。** Git 始终以参数数组方式调用。
  用户提供的 Revision 与路径绝不拼接进 shell 命令。
- **Revision 校验。** 任何用户提供的 Revision 都通过
  `git rev-parse --verify <input>^{commit}` 校验并解析为完整 hash,
  防止通过 Revision 进行参数注入。
- **输出限制。** Git 命令输出有上限(`pentimento.git.maxOutputBytes`),
  避免内存耗尽。
- **Worktree 限制。** Exact-patch worktree 仅在扩展受管的全局存储下创建。
  删除需三重校验(受管路径前缀、已注册 worktree、匹配的 repository id 与
  patch revision)。未通过校验的路径绝不使用 `fs.rm` 删除。
- **不修改用户文件。** Pentimento 绝不修改源文件,绝不 checkout /
  switch / stash 用户工作区,绝不插入标记或重排代码。
- **不记录密钥。** Output channel 绝不记录凭证、SSH key、token、敏感环境变量,
  或完整的远端认证 URL。默认不记录完整 Diff。
- **可信 Hover 命令。** Hover 命令 URI 仅调用白名单内的 `pentimento.*` 命令,
  参数 URL 编码,并在执行时重新校验 repository、revision 与文件存在性。

## 支持版本

安全修复面向最新发布版本。
