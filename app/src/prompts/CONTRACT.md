# prompts 模块契约

## 职责

- 管理生图提示词预设。
- 支持变量替换、负面提示词、provider 参数映射和测试生成输入。
- 维护通用 prompt context，并交给 `prompts/adapters` 选择对应 request builder。
- 为 `generated-images` 提供标准化 prompt context，而不是直接发起模型请求。

## 子目录

- `adapters/`：根据 provider 类型选择 `generated-images/request-builders/` 中的 builder。
- `schemas/`：保存不同模型的提示词、工作流和参数 schema 草案。

## 预设边界

- 提示词预设是配置，不是 JS 代码。
- provider 专属参数必须放在 `providerOptions`，不能污染通用字段。
- 模型专属提示词框架必须放进 provider 对应 schema / builder，不写死在通用 preset。
- 导入错误时只进入草稿或错误状态，不覆盖当前启用预设。

## 禁止

- 禁止把真实密钥写入提示词预设。
- 禁止提示词预设直接发起网络请求。
- 禁止把 provider 的轮询逻辑放进 prompts。
