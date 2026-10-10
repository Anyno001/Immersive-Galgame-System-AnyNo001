# generated-images 模块契约

## 职责

- 管理生图 provider。
- 内置 provider 放在 `generated-images/providers/`。
- 模型专属请求构建器放在 `generated-images/request-builders/`。
- st-chatu8 必须作为可拆卸内置 provider，而不是写死在核心逻辑里。
- 兼容 Immersive Galgame System 既有的外部插图扩展适配能力。
- 支持内置生图 API、提示词预设、轮询和失败反馈。
- 生成图持久化和图片池统一交给 `media`。
- 检测到生图段时驱动 `visual` 切换到生图层；生图段消失时回到背景+立绘。
- 自动插图由 `illustration/` 负责段落编号、标记插入、规划提示词与解析、设置规范化和事件驱动服务；tag 与图片交由 `media/illustration-store.js` 保存。
- NovelAI 官方接口由 `request-builders/nai-v4-builder.js`（`providerType: nai-official`）构建请求、`nai-official-client.js` 发起请求，并复用 `image-api-client.js` 的响应解析；不得覆盖既有 `bridge.imageApi`。

- 生图提示词公共规则在 `illustration/prompt-kit.js`：虚构/成年人框架、CG 构图指南、拒答识别与「温和模式」重试（主提示词被拦截时只让 LLM 写构图，露骨 tag 由本地模板 `nsfwExtra` 补）、内置背景/立绘 NAI 模板与背景词典兜底。
- 生图排查日志（`image-job-log.js`）：自动插图与素材补全通过 `report(level, message)` 上报进度与失败原因，由 bootstrap 写入日志（localStorage `igs_image_job_log`，按 `bridge.imageJobLog.retainDays` / `maxEntries` 自动清理）并按 `bridge.showToasts` 弹 toast；只有 `done` 楼层算已处理，失败 / 过期楼层下次渲染重试。副 LLM 系统提示词可由 `bridge.autoIllustration.llm.prompts.*` 覆盖，留空用内置。
- 正文字数门槛（`illustration/floor-body-length.js`）：自动插图与素材补全自动触发时，先按 `bridge.sourceFilter`（和阅读器同一套正文保留 / 排除标签，`scene/message-source.js` 的 `readerBodyText`）取出正文；台词 / 心理只数台词本身，指令和空白不算。不足 `MIN_AUTO_IMAGE_BODY_CHARS`（50）字返回 `body-too-short`，日志写一行原因，不记成已处理（楼层「继续」写长后下次渲染照常处理）；手动生成不受限。
- 素材补全（`illustration/asset-generation-service.js`）：场景素材模式开启且对应开关打开时，最新 AI 楼层出现素材库匹配不上的场景或无名角色 → 副 LLM 写内容 tag（`asset-prompt.js`）→ NAI 生成（立绘 V5 走原生透明底，其余模型浅灰底 + `media/alpha-matte.js` 抠图）→ 存为本聊天临时素材，状态 `review`，等待楼层结束时由阅读器询问用户加入素材库 / 仅本聊天 / 丢弃。
- 物品图（`illustration/item-image-service.js`，设置 `bridge.itemImages`，默认关闭）：关闭时入口短路，不读表、不联网。候选 = 本楼 `[igs-fx:item]` 标签物品在前 + 物品表（`data/shujuku/item-catalog.js`）在后，按归一化名称合并；缺图者每层最多 `maxPerFloor`（默认 3）件，串行队列 + 按物品键在途锁，重复事件不重复计费。存入 `igs-generated-assets`，`type: 'item'`、状态 `ready`（不进入素材审核与临时素材列表），按聊天隔离；重画失败保留原图，`discarded` 不自动重补。手动「补全物品图」单次最多 10 件。提示词见 `illustration/item-prompt.js`（副 LLM 失败时仅纯英文名兜底，中文名记失败待重试）；透明底沿用立绘分支。

- 角色 DNA（`scene/character-dna.js`）进入提示词链：立绘补全按 `triggerWords → identity → defaultAppearance → 副 LLM tag → 模板` 合并，负向插在模板负面词之后；CG 只合并 `triggerWords → identity` 与 DNA `negative`，`defaultAppearance` 只交给 planner 作默认资料。planner 输出 `char: 角色名 | x,y | tags`，旧格式 `char: x,y | tags` 仍可解析；无名角色只在「本张单人且上下文唯一角色」时绑定，否则不注入并上报 warning。数据库生图模式下素材经既有 `meta.userPrompts` 传递合并结果；剧情 CG 使用插件返回的 caption 原样出图，不把 DNA 拼进 char caption。智绘姬链路不变。
- 素材服务新增 `getEditableImage(imageId)` 与 `saveMatteEdit(imageId, expectedRevision, patch)`，按 revision 原子更新并发出 `matte-edited` 事件。
- 局部重绘能力协商：`image-backend.js` 的 `describeEdit()` / `edit()` 与普通 `generate` 分离；只有内置 NAI、客户端提供 `edit` 且所选模型存在 inpainting 版本（`request-builders/nai-inpaint-builder.js`，action `infill`）时才支持，否则返回 `image-edit-unsupported`，禁止退化为整张重画。请求形状仅经 fixture 验证，真实接口兼容性需真机确认。
- AI 修复事务（`illustration/inpaint-transaction.js`）：必须用户显式触发；预览只在内存，接受时校验 revision → 写 `workingDataUrl` → 重新自动抠图 → 原子更新；取消 / 失败 / 过期不写任何资产字段；「恢复原图」清除 `workingDataUrl` 并从原图重抠。AI 结果是生成式重建，不代表恢复原始像素。错误与日志不得包含 API Key、原图 base64 或完整请求体。
- 智绘姬出图（`chatu8-client.js`）：图像来源为 `extension` 时，剧情 CG、素材与物品图经酒馆全局 `eventSource` 的 `generate-image-request` / `generate-image-response` 事件（按 `id` 配对）交给智绘姬出图，只发送合并后的场景与角色 tag，画师串、质量词与尺寸沿用智绘姬自身设置；智绘姬按其挂在主窗口的设置函数判定已安装。未检测到智绘姬、出图失败、超时或返回视频时，填了 NAI Key 就退回内置 NAI，否则按失败上报。走智绘姬时立绘一律按非透明底出图并抠图。阅读器重画仍代点楼层内智绘姬按钮。事件协议来自上游打包源码而非公开 API，上游改名即失效，需真机确认。
- 智绘姬读取层按上游原版 DOM（`dom-image-candidates.js`）：图片取 `.st-chatu8-image-container` / `.st-chatu8-image-span` / `span[data-request-id]` 内的 `img` 与 `video`，按钮取 `.image-tag-button` / `.st-chatu8-image-button`（均带 `data-request-id`）；图片与重画按钮优先按 `data-request-id` 精确配对，slotIndex / locationHash / imageId / buttonIndex 与 DOM 顺序兜底不变。原 `img.st-chatu8-image-tag-image` 选择器在上游已不存在，不得恢复。

- 柏宝绘出图（`baibai-client.js`）：图像来源为 `baibai` 时，剧情 CG、素材、物品图与阅读器重画经柏宝绘公开接口 `globalThis.STBaiBaiImage`（apiVersion 1）出图，`save: false` 不进柏宝绘图库；后端支持多角色时分角色传，否则拼成一段 prompt；未检测到或失败时有 NAI Key 就退回内置 NAI。不保证透明底，立绘按浅灰底出图再抠图。
- 副 LLM 写词（`illustration/caption-writer.js`）：图像来源不是数据库生图时，`writeDbgenPrompt` 改由副 LLM 按同一份描述写 NAI v4 caption，`generateDbgenCaption` 把 caption 拆回 slot 按当前来源出图；表情差分、头像、默认立绘与衣柜共用。副 LLM 选独立 API 却没填地址或模型时直接报「还没接副 LLM」，不发请求。副 LLM 设置单独在「生图 → 副 LLM」子页。

## Provider 契约

- `detect(context)`
- `generate(request)`
- `poll(task)`
- `extractImages(messageContext)`

## Request Builder 契约

- `providerType`
- `schemaVersion`
- `buildRequest(promptContext, promptPreset, providerPreset)`
- `validateRequest(request)`

Provider 负责发请求和解析返回；Request Builder 负责把通用场景变量、提示词预设和 provider 配置转成模型专属请求。NAI、ComfyUI、GPT 图像、banana 等模型必须各自拥有独立 builder。

## 导入位置

只在生图插件页导入、导出和管理 provider，不设置全局 Mod 管理页。

## 禁止

- 禁止把本地文件缓存逻辑写进 provider。
- 禁止 provider 直接操作视觉 DOM。
- 禁止把模型专属提示词框架写死进通用 `prompts`。
- 禁止默认联网，必须由用户启用 provider 后才发起请求。
- 禁止在 provider 禁用后继续扫描对应 DOM。
