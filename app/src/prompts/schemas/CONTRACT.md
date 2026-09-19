# prompts/schemas 模块契约

## 职责

- 保存不同模型提示词和参数结构的 schema 草案。
- 让 NAI、ComfyUI、GPT 图像、banana 等模型可以拥有不同 prompt / workflow 格式。
- 为导入预设和 request builder 提供校验依据。

## 预留 schema 类型

- `nai-prompt-schema`
- `comfyui-workflow-schema`
- `gpt-image-instruction-schema`
- `banana-model-schema`
- `custom-provider-schema`

## 禁止

- 禁止保存真实 API Key。
- 禁止保存大图资源。
- 禁止把 schema 当作可执行 JS。
