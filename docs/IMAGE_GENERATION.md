# 生图架构草案

当前阶段只实现 NAI 的位置预留，但架构必须允许未来接入 ComfyUI、GPT 图像、banana 等不同提示词框架。

## 分层

```text
prompts
├── prompt context          # 通用场景变量
├── prompt preset           # 用户可切换的提示词意图
└── prompt adapter          # 选择对应 request builder

generated-images
├── request builder         # 转成模型专属请求
├── provider                # 发请求、轮询、解析返回
└── generation queue        # 管理生成任务状态
```

## 边界

- Provider 负责网络请求、轮询和返回解析。
- Request Builder 负责模型专属请求结构。
- Prompt Preset 负责用户想表达的风格、变量和模板。
- Provider Preset 负责 endpoint、模型、工作流、轮询参数和 provider 专属配置。

## 预留 provider 类型

- `nai`
- `comfyui`
- `gpt-image`
- `banana`
- `custom`

## 预设类型

- `prompt-preset`
- `image-provider-preset`
- `image-request-builder-preset`
- `workflow-preset`

ComfyUI 这类工作流型 provider 应使用 `workflow-preset` 或 provider 专属 preset 保存工作流配置。
