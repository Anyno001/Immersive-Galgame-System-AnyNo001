# prompts/adapters 模块契约

## 职责

- 根据当前 image provider 类型选择 request builder。
- 把 `scene`、`prompt-preset`、`image-provider-preset` 组合成 `promptContext`。
- 不关心 provider 如何请求网络，也不解析图片返回。

## Adapter 契约

- `selectBuilder(providerType)`
- `createPromptContext(scene, runtimeState)`
- `buildRequest(providerType, promptContext, promptPreset, providerPreset)`

## 禁止

- 禁止直接发起生图请求。
- 禁止处理轮询。
- 禁止把模型专属参数写入通用 prompt context。
