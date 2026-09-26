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

## 自动插图（本地草稿，尚未经真实酒馆验收）

独立于既有 `bridge.imageApi`。图像设置中的 NSFW 与过场开关默认均关闭，全部关闭时服务在读取消息、规划、写回和联网之前返回 `disabled`。仅处理当前聊天最新 AI 楼层：有 `[igs-scene:...|NSFW]` 时只走 NSFW 分支，开启后按 `nsfwCount` 精确规划；关闭时不借过场概率生成。非 NSFW 楼层仅在过场开关开启且 `random()*100 < interludeProbability` 时，规划 1～`interludeMaxCount` 张。

流程：监听 AI 楼层渲染事件 → 以聊天、楼层及 swipe 身份去重并记录决策 → 从正文编号段落，读取最多 `llm.contextFloors` 个先前 AI 楼层作为参考 → 副 LLM 返回每张图的 `slot`、`at` 与 `scene/scene_uc/char/char_uc` tags → 校验数量和位置 → 仅在原文仍一致时插入 `[igs-img:1]`、`[igs-img:2]` 等定位标记 → 串行向 NovelAI 官方接口生图 → 记录 tag、状态及图片并通知阅读器刷新。插图图片覆盖当前段落背景并隐藏立绘；NSFW 图片未就绪或失败时维持黑幕，遇新场景标签终止此前插图。显示正文、发给主模型的上下文剥离标记，原始消息仍保留供定位；不要求主模型输出该标记。

存储为 IndexedDB `igs-illustrations`（版本 1），`floors` 和 `slots` 两个 store；楼层键 `${chatId}|${messageId}|${swipeId}`，图片键 `${floorKey}|${slot}`。`pending/done/failed` 记录使刷新后可异步恢复图片；当前无容量清理与手动失败重试。开关启用后副 LLM 或 NovelAI 的真实请求会消耗各自额度，请勿把 API Key 放入日志或聊天文本。

| 设置路径（前缀 `bridge.autoIllustration.`） | 默认值 | 作用 |
| --- | --- | --- |
| `nsfwEnabled` / `nsfwCount` | `false` / `1` | NSFW 场景开关与每层张数（1～4） |
| `interludeEnabled` / `interludeProbability` / `interludeMaxCount` | `false` / `30` / `1` | 过场开关、百分比（0～100）、最多张数（1～4） |
| `llm.source` / `llm.endpoint` / `llm.apiKey` / `llm.model` | `tavern` / 空 / 空 / 空 | `tavern` 使用当前酒馆 API；`openai` 使用独立兼容接口及凭据 |
| `llm.contextFloors` / `llm.timeoutMs` | `1` / `90000` | 参考 AI 楼层数（0～3）与规划超时毫秒 |
| `nai.transport` / `nai.apiKey` | `direct` / 空 | 浏览器直连或 `st-proxy`（酒馆需开启 `enableCorsProxy`）；未填 Key 不请求 |
| `nai.model` / `nai.size` | `nai-diffusion-4-5-full` / `832x1216` | 官方模型与尺寸 |
| `nai.steps` / `nai.scale` | `28` / `5` | 步数（1～50）与 CFG（0～10，可小数） |
| `nai.sampler` / `nai.noiseSchedule` | `k_euler_ancestral` / `karras` | 采样器和固定噪声调度（后者暂不在面板编辑） |
| `nai.artistPrefix` / `nai.negativePrompt` | 空 / 内置负面提示词 | 正向前缀及可编辑负面提示词 |
| `nai.timeoutMs` | `120000` | 图片请求超时毫秒（暂不在面板编辑） |

验证边界：本地 fake host、fake provider 和模拟阅读器只检查契约；实际 TavernHelper `generateRaw` / 正则 API、NAI 直连及代理 CORS、真实 IndexedDB、刷新后的宿主聊天 DOM、swipe 切换和手机大图性能须在酒馆中验证，不以本地测试替代。
