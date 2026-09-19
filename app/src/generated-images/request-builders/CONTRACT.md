# generated-images/request-builders 模块契约

## 职责

- 把通用 `promptContext`、`prompt-preset`、`image-provider-preset` 转成模型专属请求。
- 隔离 NAI、ComfyUI、GPT 图像、banana 等模型之间完全不同的提示词框架。
- 为 provider 提供已验证的 request，不直接发起网络请求。

## Builder 契约

- `providerType`
- `schemaVersion`
- `buildRequest(promptContext, promptPreset, providerPreset)`
- `validateRequest(request)`

## 预留模型

- `nai`
- `comfyui`
- `gpt-image`
- `banana`
- `custom`

## 禁止

- 禁止在 builder 中执行网络请求。
- 禁止持久化图片。
- 禁止读取或写入 DOM。
- 禁止把 API Key 写入导出的 preset。
