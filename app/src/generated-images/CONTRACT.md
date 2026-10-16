# generated-images 模块契约

## 显示就绪通知（test-v0.36.65）

- 原图和缩略图读回后，只有对应中央缓存键存在可显示地址才发 `image-loaded`。缓存预算未接纳图片不属于文件丢失，不写永久失败状态，也不发通知推动下一轮静态页重绘；后续正常使用仍可重新读取。

## CG 锚句作用域（v0.36.63）

- 有真实 `<content>` 时，锚句只在各段正文中按精确 → 规范化 → 最长公共子串定位；后段精确命中优先于前段模糊命中。无正文容器时保留原全文查找路径。
- 锚句命中与安全插入分开判断。命中后无法越过完整结构时明确报告「已命中正文，但无法安全插入」，不再误报正文未匹配；两类失败同时出现时分别计数。只有安全标记写回成功后才调用出图。

## 正文补图恢复（v0.36.61）

- 工具栏「绘制CG」只操作楼层 CG；「补全立绘与背景」操作聊天素材，成功后发既有素材更新事件，进入「素材 → 待确认」，不自动替用户正式入库。手动补全不受自动背景/立绘开关限制，不修改这些设置。
- 差分失败记录不能作为永久已完成状态：本楼自动重绘不重复发送，手动补全或下一楼新的相同需求可重试。原图缺词时进入既有背景规划队列，保留 `variantOf`；只有确认原图已是目标时段才写 `skipped` + `skipReason: 'same-time'`。旧无原因 skipped 重新检查，用户 discarded 继续跳过。
- 缩略图能使用同一中央缓存内已经就绪的原图，文件暂时不可读不能挡住刚生成的像素；不维护第二份图片缓存。
- 数据库生图空 Blob/空 data URL 返回失败并保留提示词。CG 成功计数、槽位状态与重试判断共用非空图判断；旧 done 但没有图的槽可重新出图。重试复用已有提示词，日志明确说明，不重复规划或改动标记位置。

## 素材读取恢复（v0.36.59）

- 不把一次读空永久加入缺图集合；显示使用短期失败状态，网络失败与真实缺图分开。后续正常读取、网络 online 事件、原图读取成功和图片身份变更均可恢复，不依赖打开设置器或清缓存。
- 缩略图路径重新读到了原图时清除旧失败状态；已有原图缓存也优先于失败记录。失败、成功和恢复仍用既有素材更新事件通知阅读器。停止后解除 online 订阅，过期任务不得写失败状态或发完成通知。

## 副 LLM 请求通道（v0.36.58）

- CG、素材、物品及其它调用共用 host 的副 LLM 服务；独立 OpenAI 兼容接口经酒馆后端转发模型列表与生成。调用方继续使用原有配置、模型名单和文本结果，不各自实现跨域请求或改写主模型配置。

## 素材冷启动（v0.36.57）

- 素材服务用同一个 `ready` Promise 完成元数据恢复，显示和缩略图先取得原始记录，再建立像素缓存任务；记录恢复失败时继续使用文件适配器的本机读取后备，不能因等待恢复阻断已保存的本机图。
- 素材模式启用时启动一次记录恢复，成功发 `records-ready` 通知；原图仍按需读取，不批量预载图库或调用 provider。清理或停止后的旧读取不得发图片完成通知或回填像素。

## 跨行对白 CG 锚定（v0.36.55）

- 插图规划的段落编号与标记移植上下文使用 `scene/directive-tags.js` 的完整逻辑行，闭合的跨行对白 / 心理话只算一个段落；保留原始行号供 `imageMarkerBoundary` 向结构闭合处推移。
- 锚句命中跨行对白内部时，锚句和段落编号两条路径都在整个对白闭括号之后独占行插入。移植不得用独立 `]` 当上下文，已有槽号、原文及图片绑定保持。

## 生图点结构边界（v0.36.51）

- 精确、规范化及最长公共子串锚定均经过 `scene/image-marker-layout.js` 计算安全落点；编号段落和正文变动后的标记重定位共用相同入口。
- 标记放在完整结构和整行段落结束后，独占一行，不拆对白、心理话、其他括号指令、HTML 或代码块；`<content>` 内的点不能挪到容器外。未闭合结构没有安全落点时跳过，不强行把标记写入半截标签。
- 同一结构内的多个锚点保留原锚句顺序、槽号及图片绑定。旧标记重新规划前先规范布局，再剥离标记；模型规划、图片生成与来源插件接口保持原样。

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
- NAI HTTP 序列化边界与 DBG 对齐：仅将布尔 `tag_hint_qt`／`tag_hint_uc_preset` 转为整数 `0/1`，不修改 builder 返回值及调用方对象；普通生成、定稿与 infill 共用此边界，`qualityToggle` 和透明字段仍保持布尔值。设置试图冻结草稿且不落盘；HTTP 500 仍只发送一次，不回显服务端载荷。离线字段一致性不证明具体现场 500 的唯一根因或真实服务接受性。
- 内置 NAI 的 `resolveNaiEndpoint` 在发送前将 HTTP(S) 根地址或 `/ai`（含尾斜杠）补为 `/ai/generate-image`，留空走官方地址；完整接口及其他显式自定义路径保持原样，查询参数保留。普通生成与 infill 共用地址解析，代理包装在补全之后；不改写草稿／持久配置，不扩大旧通用图像接口的 NAI 识别范围。现场根路径 POST 与此前源码行为吻合，修正后的上游接受性仍待用户复验。
- 图像响应先保留原始二进制字节，再按魔数／Content-Type 分派，ZIP 不经 UTF-8 解码后回灌。`image-response-zip.js` 支持 stored／deflate 与中央目录中的 data descriptor 长度；保留长度明确的无目录本地头响应兼容。格式不支持、数据损坏、长度不符或浏览器缺解压能力返回白名单错误，不回显上游正文，不自动补发。内置 NAI 阅读器／测试按钮保留错误码、中文提示和 HTTP 状态，草稿不落盘。
- 文本画师库由 `artist-library.js` 管理，配置为 `bridge.autoIllustration.nai.artistLibrary = { version: 1, entries: [{ id, name, positivePrompt, negativePrompt }] }`。支持条目数组、版本 1 库与 `{ presets, images }` 导入，只接收文本白名单，不复制图片、凭据或其他字段；非法 JSON、重复字段、危险键、坏字段、超限或 ID／名称冲突整批拒绝。未知持久版本保留并拒绝修改，不以空库覆盖。
- 导入只追加，不自动应用。显式应用到全局写 `artistPrefix`／`artistNegativePrefix`，或到 `artistByKind.kinds` 的既有类别；分区开关与其他类别保持，空类别回退全局。`artistNegativePrefix` 是独立画师负向，旧通用 `negativePrompt` 不作为定稿画师负向覆盖。
- 画师正负向统一在库内命名、新建、编辑、删除、选择和应用；分类页跳转库并选择应用目标，不直接编辑活动文本。编辑／删除库条目不联动已应用文本，应用后成功保存才影响运行配置。
- 打开设置时将原全局、分区画师及旧通用负面原文归档到草稿，全部成功后随设置保存 `artistLibraryArchived: true`，避免删除条目后重开又归档。未知坏库或超过 500 条时保持原配置且不标记完成；旧 `nai.negativePrompt` 仅兼容保存／归档，不参与绘图或写词要求。
- 生图与 infill 复用既有画师三态和一次前置链，发送快照从最终 prepared request 取画师正负向。未应用的 `artistLibrary` 不进入任务配置租约或 wire；应用并成功保存的文本改变使旧任务失效。DBG 保留既有配置来源及可选兼容，柏宝绘／智绘姬沿用自己的画师设置。
- 内置 NAI 立绘透明底由 `bridge.imageApi.naiSpriteTransparent`（缺省 `true`）与实际立绘模型能力共同决定；V5 开启时发送 `straight_alpha: true`，定稿的 `tag_hint_transparent_background: false` 保持，普通请求为 `true`。关闭或模型不支持时写词要求使用白底，matte 接收 `alreadyTransparent: false`。素材补全、默认立绘、表情及存量 caption 重画共用同一决策。DBG 独立读取原 `dbgenSpriteTransparent`，外部插件沿既有非透明策略；infill 两个透明字段保持 `false`。新键进入任务快照，成功配置变更使旧租约失效，迟到结果不抠图、不存储，停止原因和 `stopGeneration` 透传。
- 内置 NAI 采用显式请求种子：合法整数范围为 `[0,4294967295]`，包含 0；缺失或非法值才随机。普通生成与 infill 共用规则，成功结果回传最终请求体中的 `seed`，429 重试复用原请求体，不重抽。图片及临时资产保存该值，额度降级也保留；不从 PNG／ZIP 推断历史种子。
- 角色立绘成功采用入库时，首次将图片种子写入所属库 `characterSeeds[规范角色键]`；后续默认立绘、新衣装、表情、续画与手改定稿重画均复用，已有种子不被新候选覆盖。场景首次采用保存 `scenes[场景键].seed`，时间／天气变体优先复用场景种子，其次读取原图记录。旧资产缺种子不自动回填，下一次成功生成并采用才建立固定值；失败、取消及未采用候选不建立角色／场景种子。
- CG 按本图明确人物绑定的 `captionIndex` 顺序，取第一个已保存种子的具名角色；不使用正文人物允许池猜测出镜者，没有命中则随机。普通重画同样按当前保存种子选取。一致性在预检冻结同一颗种子，各局部 infill 共用并归档到 `consistencyPrompt.rounds[].seed`；角色种子变化使该候选失效。相同种子只保证请求参数复用，不保证不同提示词、模型或尺寸下的图像一致性；其他来源不接入角色种子策略。


- 生图提示词公共规则在 `illustration/prompt-kit.js`：虚构/成年人框架、CG 构图指南、拒答识别与「温和模式」重试（主提示词被拦截时只让 LLM 写构图，露骨 tag 由本地模板 `nsfwExtra` 补）、内置背景/立绘 NAI 模板与背景词典兜底。
- 生图排查日志（`image-job-log.js`）：自动插图与素材补全通过 `report(level, message)` 上报进度与失败原因，由 bootstrap 写入日志（localStorage `igs_image_job_log`，按 `bridge.imageJobLog.retainDays` / `maxEntries` 自动清理）并按 `bridge.showToasts` 弹 toast；只有 `done` 楼层算已处理，失败 / 过期楼层下次渲染重试。副 LLM 系统提示词可由 `bridge.autoIllustration.llm.prompts.*` 覆盖，留空用内置。
- 正文字数门槛（`illustration/floor-body-length.js`）：自动插图与素材补全自动触发时，先按 `bridge.sourceFilter`（和阅读器同一套正文保留 / 排除标签，`scene/message-source.js` 的 `readerBodyText`）取出正文；台词 / 心理只数台词本身，指令和空白不算。不足 `MIN_AUTO_IMAGE_BODY_CHARS`（50）字返回 `body-too-short`，日志写一行原因，不记成已处理（楼层「继续」写长后下次渲染照常处理）；手动生成不受限。
- 自动插图与素材补全优先订阅 `messageHost.onImageFloorReady`，旧注入宿主回退渲染事件。同楼在途通知合并，成功后仅消费最新正文；失败不在原任务内重发。素材已完成楼层重复通知短路，仅手动补全或本次成功任务期间的新正文可重算，已有素材不重画。CG 的无图决定按正文、开关、概率、继承 NSFW、预置 CG 命中和有效字数去重，输入改变可重评；已有图不重新掷概率。100% 只保证概率门，不绕过其他门禁。
- 素材补全（`illustration/asset-generation-service.js`）：场景素材模式开启且对应开关打开时，最新 AI 楼层出现素材库匹配不上的场景或无名角色 → 既有写词入口 → 生成与 `media/alpha-matte.js`（NAI 立绘透明／白底依独立开关及模型能力，其他来源依各自策略）→ 存为本聊天临时素材，状态 `review`，等待楼层结束时由阅读器询问用户加入素材库 / 仅本聊天 / 丢弃。
- 物品图（`illustration/item-image-service.js`，设置 `bridge.itemImages`，默认关闭）：关闭时入口短路，不读表、不联网。候选 = 本楼 `[igs-fx:item]` 标签物品在前 + 物品表（`data/shujuku/item-catalog.js`）在后，按归一化名称合并；缺图者每层最多 `maxPerFloor`（默认 3）件，串行队列 + 按物品键在途锁，重复事件不重复计费。存入 `igs-generated-assets`，`type: 'item'`、状态 `ready`（不进入素材审核与临时素材列表），按聊天隔离；重画失败保留原图，`discarded` 不自动重补。手动「补全物品图」单次最多 10 件。提示词见 `illustration/item-prompt.js`（副 LLM 失败时仅纯英文名兜底，中文名记失败待重试）；透明底沿用原模型能力策略，不受立绘透明开关控制。

- 自管 NAI／DBGen 的人物生成遵守下文 DNA 模板契约；`sprite-prompt-composition.js` 仅服务未进入新协议的兼容来源。普通立绘重画从当前人物及衣装资料重组，不从存量完整词猜测拆分身份或复用剧情动作；普通 CG 的历史重画仍沿原快照。未知画师来源不推断去重，也不伪造发送快照。逐图手改词走定稿重画。裸体只改变当次衣装要求，不修改基础 DNA；其他图像插件保持原有流程。
- 普通 CG 的新模板通过显式角色键、token、captionIndex 和景别绑定读取已保存 DNA，衣装由当次写词决定。旧 planner 的 `char: 角色名 | x,y | tags` 与 `char: x,y | tags` 保持旧解析兼容；旧图缺绑定时不能凭顺序猜人物或进入一致性重绘。数据库生图 CG 不复用立绘组合模块。
- 素材服务新增 `getEditableImage(imageId)` 与 `saveMatteEdit(imageId, expectedRevision, patch)`，按 revision 原子更新并发出 `matte-edited` 事件。
- 局部重绘能力协商：`image-backend.js` 的 `describeEdit()` / `edit()` 与普通 `generate` 分离；只有内置 NAI、客户端提供 `edit` 且所选模型存在 inpainting 版本（`request-builders/nai-inpaint-builder.js`，action `infill`）时才支持，否则返回 `image-edit-unsupported`，禁止退化为整张重画。请求形状仅经 fixture 验证，真实接口兼容性需真机确认。
- AI 修复事务（`illustration/inpaint-transaction.js`）：必须用户显式触发；预览只在内存，接受时校验 revision → 写 `workingDataUrl` → 重新自动抠图 → 原子更新；取消 / 失败 / 过期不写任何资产字段；「恢复原图」清除 `workingDataUrl` 并从原图重抠。AI 结果是生成式重建，不代表恢复原始像素。错误与日志不得包含 API Key、原图 base64 或完整请求体。
- 智绘姬出图（`chatu8-client.js`）：图像来源为 `extension` 时，剧情 CG、素材与物品图经酒馆全局 `eventSource` 的 `generate-image-request` / `generate-image-response` 事件（按 `id` 配对）交给智绘姬出图，只发送合并后的场景与角色 tag，画师串、质量词与尺寸沿用智绘姬自身设置；智绘姬按其挂在主窗口的设置函数判定已安装。未检测到智绘姬、出图失败、超时或返回视频时，填了 NAI Key 就退回内置 NAI，否则按失败上报。走智绘姬时立绘一律按非透明底出图并抠图。阅读器重画仍代点楼层内智绘姬按钮。事件协议来自上游打包源码而非公开 API，上游改名即失效，需真机确认。
- 智绘姬读取层按上游原版 DOM（`dom-image-candidates.js`）：图片取 `.st-chatu8-image-container` / `.st-chatu8-image-span` / `span[data-request-id]` 内的 `img` 与 `video`，按钮取 `.image-tag-button` / `.st-chatu8-image-button`（均带 `data-request-id`）；图片与重画按钮优先按 `data-request-id` 精确配对，slotIndex / locationHash / imageId / buttonIndex 与 DOM 顺序兜底不变。原 `img.st-chatu8-image-tag-image` 选择器在上游已不存在，不得恢复。

- 柏宝绘出图（`baibai-client.js`）：图像来源为 `baibai` 时，剧情 CG、素材、物品图与阅读器重画经柏宝绘公开接口 `globalThis.STBaiBaiImage`（apiVersion 1）出图，`save: false` 不进柏宝绘图库；后端支持多角色时分角色传，否则拼成一段 prompt；未检测到或失败时有 NAI Key 就退回内置 NAI。不保证透明底，立绘按浅灰底出图再抠图。
- 副 LLM 写词（`illustration/caption-writer.js`）：图像来源不是数据库生图时，`writePrompt` 由副 LLM 按同一份描述写 NAI v4 caption，`generateCaption` 把 caption 拆回 slot 按当前来源出图；表情差分、头像、默认立绘与衣柜共用。副 LLM 选独立 API 却没填地址或模型时直接报「还没接副 LLM」，不发请求。副 LLM 设置单独在「生图 → 副 LLM」子页。
- 来源中立入口为 `writePrompt`、`writeFloorPrompts`、`generateCaption`；旧 `writeDbgenPrompt`、`writeDbgenFloorPrompts`、`generateDbgenCaption` 保留同一实现别名。业务服务通过 `backend-methods.js` 兼容仅提供旧方法的注入后端，保留接收者、参数与结果；来源选择、DNA 协议门禁和发送快照不因名称迁移改变。活动事件覆盖新旧绘制入口，每次调用发一组开始／结束事件。
- bootstrap 通过 `image-prompt-runtime.js` 将唯一 PresetRegistry current 接到实际写词请求；`image-prompt-defaults.js` 提供共享框架、显式任务模块和中间资料槽。角色、顺序与正文经有序 messages 发送。未接入预设的独立旧调用继续使用原 `{system,user}`；非生图的副 LLM 请求不受预设影响。
- 默认框架 v21 为立绘、普通 CG 及其他内置写词任务增加独立 `user` 世界书参考块；v23 将该块放在本轮任务资料之前，未自定义的旧基线顺序随备份升级，自定义顺序及开关保持。按本次正文／描述和前文调用酒馆原生 dryRun 扫描，保留关键词、常量及宿主触发机制。写词装配与两个调用入口均异步等待扫描，失败／取消／预设失效停止交接；内置外貌参考不再按名字绕过世界书激活。关闭参考块不扫描，一致性 `provided` 继续隔离。纯资料齐全的立绘直接绘图、保存模板复用和手改定稿不新增写词或扫描。真实宿主触发及模型效果仍需复验。

- 内置 `writeFloorPrompts` 只接受显式 CG 模板任务，保留编号正文的 at，不探测 DBG；自动立绘复用模板批处理，同次输入角色设定、当楼正文、前文及用户自定义要求，生成候选后才交既有采用门禁，不提前登记 DNA。非模板兼容来源保留旧规划与词典流程，但预设读取／装配失败和过期请求禁止通过兜底继续绘图。
- 剧情衣装显式传入本楼正文，`outputs.purpose: outfit-dna` 与服装图分离，缺正文或迟到回复拒绝交接；指定衣装使用 outfit 模块，普通差分使用 expression 模块。普通 caption 字段解析仅匹配当前行，LF／CRLF 下空 char／uc 不吞下一字段。模板协议沿用既有严格解析与身份绑定，不后补模型正文。
- 内置任务由 `builtin-image-task-runtime.js` 装配配置与唯一注册表 epoch，`image-task-runtime.js` 保存私有租约并处理取消／迟到拒收。NAI 凭据、传输、全局参数、分区画师与写词 LLM 设置取同一任务快照；显式任务模型、尺寸及画师三态仍保留。`getEditConfig` 返回同源模型、画师、脱敏 token 与同步守卫。配置或 current 成功改变后再改回也不复活旧任务；失败保存和不影响绘图配置的衣装资料保存不使租约失效。复制 caption／recipe 时通过 `inheritImageTaskLease` 保留内存租约，token 不进入 wire、日志或图片来源；不承诺跨标签页强一致性。
- 选择 DBG 时，公开写词／绘图／阅读器／试图／编辑入口同时受 IGS 来源租约保护；插件 `expectedConfigToken` 原样传递，不与 IGS token 混用。编辑守卫组合两方有效性，切来源再切回不复活旧租约。组合链在写词结束后复核，取消不继续绘图；停止等待后拒收迟到结果，不声称插件请求已中止。`provided` 先过滤再捕获租约；无运行时注入的旧调用保留参数形状。兼容 caption、NAI 兜底及阅读器返回保持受控 reason／stopGeneration，不把停止伪装成可继续的普通失败。
- 柏宝绘／智绘姬适配链在等待楼层词之前捕获 IGS 私有租约；外部请求及图片读取结束后复核有效性。成功切源再切回不复活旧任务，迟到失败不能启动 NAI 兜底；柏宝绘阅读器传递取消、shouldStart 及已有租约。停止等待与拒收仅是 IGS 的交付边界，不保证外部插件实际中止请求。

- `nai-request-queue.js` 由普通生成与 infill 共用，按实际凭据串行。排队取消零发送；在途取消停止等待、拒收迟到结果，但实际请求 settle 前保留凭据锁。每次发送及重试前复核取消和租约；仅明确 HTTP 429 有界重试，遵守 Retry-After、最多三次尝试及本次总等待预算。网络异常、408／5xx、超时和发送状态不明不自动补发；不回显上游载荷，不声称 abort 已停止宿主执行或计费。
- 设置页显式试图走独立 `testForReader`：本次草稿配置冻结在内存，不提交设置、不替换正式配置、不接管已有提示词协议；与正式生成使用同一客户端／凭据队列及取消守卫。普通 `generate`／`generateForReader` 不接受草稿凭据覆写。注入的旧后端缺该入口时保持原阅读器接口兼容；活动事件覆盖试图入口。
- 内置 infill 在 builder 校验模型白名单、强度 `[0.1,1]`、64 步长、边长 `[64,4096]` 及 1024² 像素上限；通用缺省强度 `0.7` 不改变一致性缺省 `0.75`。原图／蒙版经 `media/png-validation.js` 的容器和有界解压校验后才发送。`inpaintImg2ImgStrength` 与低于 1 时的 `img2img` 仅有离线实际请求捕获证据，V5／低强度的真实上游接受性尚未验证。

## DNA 模板与定稿发送

- 显式 `promptRecipe.mode: dna_template` 由 `character-caption.js` 唯一展开；正负令牌仅绑定自身 Char，Scene、动态正文、权重及坐标保真。不推断任务用途，候选与 reference 必须带显式 `promptTask`；保存 recipe 的普通重画只读取当前保存 DNA。
- `image-backend.js` 接收 DBGen 写词失败时，将 `error.context`、`diagnostic` 与 `diagnostics` 收拢至受控诊断：阶段、错误码、字段、原因、合法 `slotId`／角色或 Char 索引、HTTP 状态及可关联 `traceId`。本地 IGS 校验使用 `igs-prompt-input`／`igs-prompt-output` 区分；DBGen 原样阶段为 `prompt-input`／`prompt-parse`／`prompt-output`／`prompt-write`。写词接口异常、等待超时和空返回分别标记 `DBGEN_PROMPT_EXCEPTION`、`DBGEN_PROMPT_TIMEOUT`、`DBGEN_PROMPT_EMPTY`；超时仅停止等待，不证明上游停止。错误提示使用固定文案与受控诊断，不回显外部 message/hint、模型回复、DNA、token、衣装正文或 JSON。
- 景别校验保持原有拒收条件，`DNA_VIEW_INVALID` 诊断区分对象形状、未知／缺失景别、缺少／空主语、文本类型／长度和递归身份占位；`field` 限定为 `dna.views` 及已知景别的 `subject`／`negative`，`detail` 为固定原因标签。候选交接保留 Char 索引和 slotId；扁平回复中确实存在对应字段才附 lineNumber，不为缺失字段伪造行号。后端双写词入口白名单透传，失败不补发、不绘图、不回显正文或未知键。
- 角色元数据校验保留 `character-meta-*` 原因码及原拒收规则，诊断区分角色键／索引的重复与不匹配、文本类型／长度、坐标和区域错误，仅包含固定字段名、原因与有效 Char 索引。模板解析补充本图 slotId，并只为实际存在且可映射的 meta 字段附 lineNumber；后端诊断白名单保留这些固定错误码，CG 规划失败回执在既有 `plan-failed` 外附带诊断。日志不回显角色名、身份、衣装正文、token 或模型载荷；诊断改善不构成具体现场根因已确认的证据。
- 人物新任务缺 recipe、未知／重复／跨角色／递归令牌均停止发送。只有显式普通 `cg` 在保存 DNA 或所需景别缺失时可消费有效当次身份；非法 DNA、未知版本及其他任务用途仍拒发。`captionMode: final` 与 recipe／任务／候选互斥，手改定稿不得再次套身份。
- 纯场景不要求 DNA、人物任务或 recipe。无人 DBGen CG 不构造空身份任务；CG 允许池中无 Char、无候选、无身份占位且无具名元数据的纯 Scene 可不带 recipe。无任务的空模板及明确 `generic/object` 模板仍校验版本、绑定数量、索引及正负占位；`named/reference` 和 DNA 候选仍要求显式任务。纯场景发送关闭 DBGen 角色关键字替换，不读取人物库；有空场景模板时保留该模板直至定稿准备，不因缺人物任务丢失它。人物预检失败仍保存原模板与绑定，补齐资料后仅重试失败图。
- 内置 NAI 与 DBGen 的定稿正文只允许画师前置一次；质量、UC、透明底文字等在完整画面写词或立绘程序模板组装阶段完成，发送层不后补。DBGen 必须声明 `getPromptCapabilities().finalCaption === 1`，并以 `replaceCharacterKeywords: false`、`capturePrompt: true` 发送。通用生成、阅读器及局部重绘都遵守该边界，其他图像插件拒绝新协议且不兜底。
- 新模板图片返回 `promptRecipe`、`dnaSnapshot` 与 `sentPrompt`；发送快照从最终 prepared request 提取文本、坐标、model/action 和画师，不含凭据、图片或参数全量。历史记录缺这些字段时保持缺省，不从正文或图片反推来源。
- 旧四字段／中文 DNA 不自动拆分景别；显式立绘在同次写词中生成保留原身份的 `full_body`、`half_body`、`portrait` 三景别候选，经实际发送与权威图片回读后采用才补齐。缺任一必需景别均拒绝；历史 `partial` 可保留但不得新建，空历史视图不作为可用候选。旧字段、触发词、权重、身份来源及已有景别保持；普通 CG 缺景别按下述当次身份规则处理，衍生图及一致性重绘仍拒发，不转换、不自动补立绘。
- 默认框架 v9 与旧独立调用的兼容提示词将字段职责分为稳定身份、独立衣装和当次动态。新 DNA 的三个身份主语只写有依据且一致的年龄感、发型发色、瞳色、脸型五官、肤色体型、非人身体特征及明确标志饰物；未知外貌不以衣装、职业或表情补全。制服、战斗服、护甲、鞋帽、武器、普通战术耳机等可更换穿戴物归 `meta_outfit_description`，喜怒、严肃／镇定表情、警戒、视线和姿态归 Char 动态；明确的角色标志饰物仍按身份保留。普通 CG 的新 `meta_identity`／`meta_signature` 同样只承担身份与锚点，不作为完整画面词。
- v8 依据工作区 `1001适配gal前端生图预设.json` 的 `preset-imagegen-97-v5` 适配通用语义：完整构图骨架、同一可见瞬间、英文自然语言、连续状态、可见性、闭合权重及输出自检；适用的 Scene／Char 分工、衣装空值分支和字段自检复用源原句。保留五块固定框架和十种任务模块，由 `createImagePromptLlm()` 按活动预设装配；只消费本轮实际提供资料，不引入召回服务。物品与批量背景在写词前提供绘图要求，严格对账编号及字段后以 `captionMode: final` 交接，发送只前置画师，不追加旧模板；活动预设写词失败停止，不重试或本地兜底绘图。旧独立调用兼容行为保持，已保存衣柜参考词直接绘图仍不增加写词请求。
- CG 模块包含完整 `dna-template` 示例：Char 只含实际数字坐标与动态正文，meta 以连续索引独立绑定角色；身份／衣装占位使用自身输入 token，衣装名称不作 token。缺身份或景别的 CG 仍使用当次旁路，不能省略身份槽，不登记永久 DNA。
- 编号正文 CG 以 `outputs.selection: numbered-text` 声明选点，写词入口将本轮 `outputs` 传入模板解析器。解析器在生成点上下文回调前核验 `at`：缺失为 `missing`，空值、非正整数字符串或超出已提供的整数 `paragraphCount` 为 `invalid`，诊断保留实际 slotId；提供生成点上下文回调的 CG 同样不能缺号。不自动填段号、猜衣装或增加请求；非编号且无选点回调的模板任务仍允许省略 `at`。默认提示块 v17 明确段号字段及示例，自定义块沿用基线保护。
- 模板解析器严格拒收代码围栏，提供 `field=response_format`、`issue=invalid`、`detail=code-fence` 和实际行号，后端受控诊断白名单保留这两个固定标签；不剥围栏、补槽、猜 token 或增加请求。前置思考块仅由既有副 LLM transport 提取层处理，解析器不解释推理正文。
- 编辑面展示三景别身份与景别负面词、独立性格和触发词，旧公共身份／负面词及 `partial` 隐藏但兼容持久字段。旧 `defaultAppearance` 保留，不参与新默认选择；当前命名衣装按独立衣装资料解析。新分工约束只用于新提取，已有 DNA 不以关键词过滤、清洗或自动迁移；完整／锁定身份及已有景别按原契约保真复用。默认升级保留自定义块、角色、顺序、开关和备份。提示词要求不保证真实模型遵从。
- 新候选写词逐项核对有来源的角、尾巴、翅膀、非人耳、身体标记及标志饰品，检查遗漏、互斥和 UC 误排除。全身身份不因输入立绘裁切而删除已知尾翼；头像保留头颈可见锚点，不描述画外尾巴或扩大构图。换装不自动移除身份饰品；程序不猜测、补词或自动改写存量 DNA。候选、权威采用资料与最终发送正文保持身份文本保真。
- 自管 NAI／DBGen 的默认立绘、换装和表情以 `half_body` 程序模板组装；头像仍按 `portrait` 完整画面协议处理。新立绘资料提取产生缺失的景别／性格候选，图片生成本身不登记身份。普通立绘重画使用本次当前 DNA、衣装和独立表情，不复用旧候选或剧情正文；手改 `final/exact` 原样发送，历史旁路仅作追溯。
- v7 将立绘、换装和表情的 `half_body` 明确为完整头顶至腰胯，保留头发、双肩、躯干和画内手势并留少量余白；明确全身／头像任务、普通 CG 和局部一致性各自镜头保持。旧内置立绘正负模板仅迁移已知原样副本，自定义模板不覆盖，阅读器布局和显示缩放不变。
- 衣柜角色换装和表情差分分别使用 `sprite-data` 与 `expression-fragments`：每槽首行 `slotid`，完整写完本槽字段后以独立行 `---` 分隔下一槽；编号与角色按本轮任务核验，不按回文顺序绑定。服装静物和独立 `outfit-dna` 提取保持各自协议。派生衣装、表情和多槽资料不补编号；仅下述单份立绘允许缺号兼容，不清洗回复或放宽其他拒收。`slotid` 缺失行号不能单独证明整条回复没有图号。
- 一致性模块使用 named/reference 双 Char；全部 `meta_*` 使用本图 `captionIndex | 值`，角色键、token、景别及 reference 空衣装字段保留索引。内置任务的 named 衣装槽展开预检冻结的有效衣装，reference 通过同源人物图对应身份与衣装，不产生第二份衣装候选。重复字段、错绑、递归占位和非法身份模式严格拒收，不自动补索引或修复回文。
- 一致性衣装模板的空说明沿用通用复用协议：named 名称保真、说明字段保留索引及竖线，空值引用本次冻结原文。一致性后续对账使用 `checkPromptOutput` 已解析并校验的 `outfitSnapshot`，按人物键、Char 索引及 token 取衣装，再与冻结目标比较；非模板分支仍按返回说明核验。非空说明改写、标点变化及缺字段继续拒收，不改动保存原文。默认模块 v19、独立调用和示例同步此分工，原图及来源／配置门禁保持。
- 一致性预检进入生成时接入本次进度回调，保留原任务的取消及目标守卫，不修改调用方选项对象。每槽 `outputs.size` 与 `writingRequirements.size` 均取包含参考区的完整计划画布，不使用局部 `work` 或原图尺寸，也不覆写原任务要求快照。并发分支收敛后保留按发生顺序记录的首个失败，不以同组停发产生的 `stale-config` 覆盖它；取消和真实配置失效仍拒收。默认模块 v18 展示完整单槽示例，明确每人 `char_uc` 不带坐标、reference 空衣装及校正模式下逐人非空主语；程序校验与原图保护保持。
- 立绘采用必须回读权威图片与候选、任务、身份快照和发送快照，核验角色／作用域及任务期间资料变化。成功采用才登记候选；保存失败恢复设置，临时素材状态保存成功后才更新内存。设置保存与图片数据库不共有事务，失败恢复是顺序补偿，不是跨系统原子提交。
- 普通 CG 复用现有一次规划／写词调用，按显式角色键、token、captionIndex 与真实取景预检，不强制半身或齐全景别。v24 提示要求每位实际出镜且正文有标签的人物独立交齐 Char/UC 与完整 meta，Scene 人数及身份指向与人物组一致，不将未出镜者强行加入。每个 named 同次统一输出立绘同等详细程度的 `meta_identity` 英文身份主语和 `meta_signature` 摘要，保留已确定外貌并协调落实未限定的普通视觉细节；身份、衣装与当次动态分开。程序仍优先展开匹配保存景别，否则消费有效当次主语，不拼补正文、不登记永久 DNA、不增加写词或补立绘请求。两种来源都缺失时拒绝对应图；失败重画保留原图及对应正文与来源，不以旧图存在冒报成功。提示要求不构成对模型出镜语义或视觉效果的程序保证。
- CG 一致性重绘通过当前选择的编辑后端执行 infill；内置 NAI 使用既有任务运行时、凭据队列和配置租约。独立选择器 `bridge.autoIllustration.consistencyModel` 提供 V4.5 Full 与 V5 Full Inpainting，缺键默认 V5，显式非法值拒发，不跨模型回退。冻结当前 CG、revision/token、身份、有效衣装、参考图、写词要求、模型及强度；各局部工作 slot 复用同一原 CG 基线，全部成功后按固定 `captionIndex` 顺序合成。失败或取消不提供部分候选，不增加看图定位、身份提取或补立绘请求。以下显式标注 DBG 的条目仅描述既有兼容入口，本轮命名衣装实施与验收限内置链路。
- 独立模型要求 DBGen 声明 `infillModelNegotiation: 1`，能力探测 `describeInfill({ model })` 与实际请求 `params.model` 使用同一任务值；确认不支持、模型不匹配或旧插件缺能力时在写词前停止。选择只影响一致性重绘，不修改 DBGen 全局模型或普通生成；模型设置变化后停止未发送请求并拒绝接受旧候选，配置租约、取消及提交门禁保持。各工作轮次的实际模型仍从 `sentPrompt.model` 归档。
- 每个一致性写词请求显式使用 `contextMode: 'provided'`，要求 DBGen 声明 `providedPromptContext: 1`；仅携带原 CG 提示词、当前 slot 的裁剪布局、任务、角色资料及输出清单，不读取楼层正文、历史、世界书、角色库或标签库。本图 `captionIndex` 零基连续编号，named/reference 的 token 与索引独立；reference 的两项 `meta_outfit_*` 在自己的索引各写一次空值。重复字段拒收，日志仅保留受控诊断，不回显上游正文。
- 重复字段继续 fail-closed，解析失败不发起绘图并保留原图。单数 `diagnostic` 与复数 `diagnostics` 均收拢至受控诊断，记录允许的解析阶段、字段、issue、slotId 与 captionIndex，不记录模型回复、DNA、衣装正文或凭据。一致性只按保存 DNA 和原图可见依据核对角、尾翼、非人耳及标志饰品，不强补画外或被遮挡部位。
- 内置一致性工作轮次显式使用 `appearance_correction` 与 `outfitMode: 'template'`，由 `prepareCharacterCaption` 展开临时身份支持及预检冻结的有效衣装；永久 DNA、原 CG recipe 和衣装快照不被重写。named/reference 保持独立 token 和连续索引；reference 不展开衣装槽。所需保存身份景别仍须存在，普通任务不能借临时校正模式绕过校验。
- `bridge.autoIllustration.consistencyStrength` 默认 `0.6`，仅缺省或空值使用该值，显式保存的强度保持，执行范围 `[0.1,1]`，非法值保留读取但拒发。入口要求 `infillImg2imgStrength: 1`，V5 infill 发送 `inpaintImg2ImgStrength`，低于 1 时另含 `img2img: { strength, color_correct: true }`，满强度省略嵌套对象；`noise: 0` 保持。内置写词说明辅助图与目标是同一角色，以参考图的可见身份和同源有效衣装为校正目标，不迁移立绘的姿态、表情、视线、光照或画风。`prepareCharacterCaption` 展开 DNA／衣装后，仅对带 reference 绑定的一致性请求，在正向 Scene 发送副本开头前置 `reference inset`。旧的标点分隔独立技术标签归一化为一个前缀，自然语言中的同名短语保持；模板与原 CG 提示词不变，各轮实际 `sentPrompt` 记录前置后的发送来源。普通生成、旧提示词与手改定稿不参与前置。上传蒙版与回贴范围独立，回贴采用有界窄带；离线验证不证明真实模型效果。
- 内置一致性先只读预检；发生跨衣装回退时一次列齐角色、要求衣装与有效衣装，确认前写词和绘图均不启动，无回退不额外确认。确认绑定本次目标、来源和配置，变化后失效。生成中不弹变衣确认框；工具栏用于停止，关闭阅读器或切换目标取消。完成后展示原图与未保存候选，仅接受且通过复核后替换原槽位。
- 一致性保姿优先于身份相似度：裁剪内姿势、朝向、表情、视线、遮挡与互动尽量沿用原 CG 提示词，不依据 DNA 重塑轮廓或移动接触点。画外元素和不适用的全图构图描述从局部模板省略，未知物件位置不猜测。程序不拼补动态文本，语义约束不保证真实模型保姿。
- 一致性任务要求 `getPromptCapabilities()` 声明 `generationConfig: 1`、`generationConfigLease: 1`，并提供返回 `Result` 的 `getGenerationConfig()` 与同步布尔接口 `isGenerationConfigCurrent(token)`。`getEditConfig` 返回配置令牌、画师正文和仅留在任务内存的 `isCurrent` 守卫；能力缺失、异步守卫或读取失败均拒绝开始。各轮显式传 `expectedConfigToken`，DBGen 从核验的私有快照装配，在排队发送前复核同 ID 的接口实体及实际并行凭据池。
- 接受候选时，文件上传后由 `beforeCommit` 异步复核配置、原记录、DNA 与写词要求；实际存储事务只用同步 `shouldCommit` 检查租约、当前目标和身份，不在 IndexedDB 事务里等待读取。DBGen 同一 `docDb` 的配置／画师 Repository 共享提交通知，修改后再改回也使旧令牌失效；该通知不保证跨客户端或标签页同步。配置／画师／DNA／写词要求变化、取消及目标冲突保留原图。令牌与守卫不进入 wire 或持久化来源，旧调用缺省不追加租约字段。离线请求捕获不能代表真实 provider 接受性或模型效果。
- 衣装模板显式使用 `outfitMode: 'template'` 与扁平 `outfit_mode: template`；缺省字段的历史任务保持旧协议。named 正向 Char 恰有本人的 `<<outfit:token>>`，Scene、reference 和所有 UC 禁止衣装占位。reference 的两项 `meta_outfit_*` 在自己的索引各写一次空值，双端解析实际核验。
- 衣装只在 `prepareCharacterCaption()` 展开，独立保存 `outfitSnapshot`。立绘、表情、DBGen、历史旧 CG 与一致性继续使用各自既有名称及说明校验。内置默认立绘成功采用后将衣装 DNA、人物图写入命名衣装，并建立 `characterDefaultOutfits`；生成未采用或保存失败不设默认，不再新写人物 DNA 的服装字段。CG 的新衣装经权威图片回读暂存候选，用户确认前不自动入柜。
- 内置普通 CG 显式启用 `purpose: cg`、`outfitMode: template`、`outfitSelection: catalog`。写词前冻结完整衣柜，模型只接收 `outfitCatalog` 的 `id/characterKey/name`，角色输入不再重复注入 `outfit/outfits` 或说明型衣装时间线。每个 named 始终交非空名称与描述、本人衣装槽及 `meta_outfit_id`；有效编号须属于本人，展开保存 DNA；显式空值展开当次描述。缺失、重复、非法或错角色引用拒收，不补发。`at` 仍校验挂载、范围与既有多图约束，不裁决衣装名称。
- catalog 解析后仅保存实际 `{name, description, source}` 到 recipe 绑定及 `outfitSnapshot`，临时编号不参与历史重画；统一 provenance 白名单、IDB 与文件备份保真。普通重画读取当前身份并保留原衣装及来源，真实衣柜基线用于候选采用核验；成功图片的 `outfitAnchor` 记录 `cg-selection` 和实际选中衣装，供一致性读取。候选暂存失败只警告，不重发已成功图片；同名已有说明不被候选覆盖。
- 普通内置 CG 的模型可见 `characterContext` 仅含 `characterKey/availableFrames`，角色 token 取 `promptTask.characters`；完整身份 DNA、性格及来源标识留在程序侧冻结上下文，仍用于解析校验、发送与来源快照，不由精简目录代替。模型提示只描述任务、字段用法和画面要求，CG 动态 description 不重复整段协议。
- 默认框架 v28：仅内置 `derived + outfit + sprite-data` 的模型副本删除其他 `outfits` 和绘图 `userPrompts`，保留目标 `outfit`、角色 DNA 与参考资料；调用说明明确角色与目标衣装名。完整冻结上下文及本地构图仍交 `parseSpriteData`，错名拒收，保存回读后绘图流程保持。
- 内置 `expression-fragments` 使用 `expressionWritingInput` 构造独立模型副本：当前景别身份（经既有视图读取含性格）、当前衣装名称／说明、用户要求、`outputs.rows[{slotId,characterKey}]` 和可选 `nsfw`。强制提供资料模式，不扫描世界书；不发送完整任务、其他衣装、重复身份景别或绘图配置。解析仍消费完整冻结角色上下文、原任务与本地 `userPrompts`，返回原任务保留来源证据；模型输出仅四个表情资料字段。其他用途不进入该裁剪路径。
- 默认升级沿用快照备份与自定义正文保护；仅未修改的旧 CG `dataFields` 补入 `outfitCatalog`，用户删改的资料范围保持。自定义 CG 模块须适配角色／衣装目录及输出协议，版本号不代表自定义正文已更新。
- 立绘资料由 `illustration/sprite-data.js` 严格解析：`sprite-data` 每槽交 `slotid/character/outfit_name/outfit_description`，仅 `sprite` 任务补缺失的三景别及独立 `personality` 候选；`derived` 不建立身份或性格。`expression-fragments` 仅允许 `derived`，每槽只交 `slotid/character/expression/expression_uc`。槽号、角色键、重复或未知字段、已有资料及候选均经校验；无效回复不修词、不绘图。DBGen 必须声明 `spriteData: 1`，返回 `{ format, text, llmCallCount }` 供 IGS 解析，不能用完整 caption 冒充资料。
- v25 提示仍要求单人单份先交 `slotid`，再交 `character`；解析兼容仅限已通过 `checkPromptTask` 的 `purpose: sprite`、`format: sprite-data`、唯一角色及唯一单 token 槽，且回复首字段为 `character`。漏号时只绑定请求中的实际槽号；未声明 slots 时沿用既有单槽 1 语义，不按回文数量或顺序推断。多槽、派生衣装、表情片段、显式错号、重复字段、错角色及其他协议错误仍拒收；不补发、不修写正文。三景别只描述稳定身体外貌，衣装独立写 `outfit_description`，可选 `dna_uc_*` 只写实际英文排除项，无额外项可省略或空白，不写默认说明。候选保存与用户采用边界保持。

- 外貌、性格与衣装独立保存：`personality` 在 DNA 对象顶层，缺键与显式空值区分；展开所选景别时经既有 `<<dna:token>>` 合并，不复制到景别、不新增性格 token。`wardrobe[key].prompt` 保存服装 DNA，衣装分栏经 `.wardrobe` 引用。默认立绘及手动新衣装补齐说明后，经 `onOutfitDna` 保存并复核目标与回读资料才绘图；保存失败零绘图，图片失败保留已保存衣装，成功采用图片后才设默认及登记身份候选。自动补图保留候选审核，不因提取而提前采用。
- 新衣装立绘在设置页或剧情衣装入口成功回读并采用保存时，若角色尚无默认，使用 `prepareInitialDefaultOutfitSelection` 建立本套默认；已有默认保持。设置页只将本批已回读核验的图片视为可用，并将 `characterDefaultOutfits` 纳入保存失败回滚；剧情入口的图片槽与默认写入同一待提交设置副本。仅入柜文字、图片失败及未采用候选不设默认。自动补全 `sprite-data` 在公共衣装校验前复用 `bindAutoSpriteOutfitNames`，按实际槽号及规范角色键绑定名称，描述和身份候选仍按原规则校验。
- 普通立绘重画及续画读取当前角色 DNA、同名衣装与独立表情片段，由程序重组默认构图，不复用历史 Scene／Char 的剧情动作。恢复前校验历史人物与衣装绑定；旧非平和表情没有片段时仅重新提取该表情，已有片段直接复用，历史图片与发送快照不变。逐图手改 `final/exact` 仍原样发送，历史旁路仅供追溯。实际 caption、`dnaSnapshot/outfitSnapshot/sentPrompt` 与可复用模板、表情片段分别保存。
- 保存资料齐全时，默认／平和图由 `savedExpressionTemplate` 组装构图及平和表情，通过 `prepareCharacterCaption` 后绘图；其他表情只请求面部正负片段，替换默认表情而不重写身份、衣装、姿势或背景。缺衣装先提取并保存，再绘制平和图或请求表情。取消、任务租约、迟到拒收、权威回读及失败补偿沿既有边界执行。
- 默认框架版本为 v25：`image-prompt-defaults.js` 通过 taskMap 选择具体用途，再由模块 `contentByFormat` 按 `outputs.format` 选择唯一协议。`prompt-tasks/` 分别维护立绘、DNA、表情、衣装、头像、衣柜提取、背景、物品、普通 CG 与一致性重绘规则，共享块只放通用来源及交付要求。立绘支持 `sprite-data/dna-template/caption-slots`，DNA 支持 `sprite-data`，表情支持 `expression-fragments/dna-template`，衣装支持 `sprite-data/expression-fragments/dna-template`，头像支持 `dna-template/caption-slots`，衣柜提取支持 `caption-slots`，背景支持 `caption-slots/asset-plan`，物品支持 `asset-plan`，CG 支持 `dna-template/cg-plan`，一致性仅支持 `dna-template`；未映射组合 fail-closed。`sprite-data` 使用无索引 `dna_*`，模板仍用带本图索引的 `meta_*`；CG 示例在同一 slot 内完整列出所有人物，仅不同图片之间使用 `---`。三景别母版、命名衣装和严格绑定契约保持，不合并错误分段、不修写模型正文。参考 `1001适配gal前端生图预设.json` 的身份／动态分离及画面表达，按当前任务和内置数据契约裁剪；一致性使用当前授权模式及冻结衣装，不照搬参考文件的旧持久化约定。默认升级与恢复整体处理正文及格式映射，保留自定义内容、顺序、角色与开关。已有角色／衣装资料不自动清洗，离线测试不证明真实模型遵从或视觉稳定性。
- v16 首次立绘仅在 `purpose: sprite` 且需要缺失身份候选时，保留明确设定并协调细化未限定的普通发型、五官、肤色与体态；已有景别逐字保留，`saved-only`／`identity-cleared` 不重建，不新增无来源的特殊身份特征或具体身体数值。新衣装缺说明时逐件落实颜色、材质、剪裁和层次，资料格式不表示禁止设计；用户明确禁止设计时遵守。v24 普通 CG 统一要求详细当次身份，不建立永久候选；一致性使用授权身份与冻结衣装。严格解析、角色合批调度、采用门禁及存量资料保持。
- 自动补立绘保持按人物去重和既有临时记录键；`collectAssetNeeds` 的可选 `characterTriggers` 保留首次触发角色标签的服装原名为 `need.outfitName`，缺服装栏不借后续标签。本次写词强调该原名，模板上下文采用同名资料；没有显式原名时沿既有首次出场与继承规则。`autoSpriteOutfitNames` 仅作为本地交接资料，按本批 `slotId` 与规范 `characterKey` 唯一绑定，在自动立绘回复的公共衣装校验前固定已有 metadata 的名称，模型仍负责描述，不加工 caption 正文，不补身份或缺失 metadata；公共严格校验保持。外部插件若先行拒收，仍停止，不绕过其门禁。图片与临时记录保存同一生成 `outfitSnapshot`。
- 聊天临时立绘只在唯一规范角色绑定时复用。角色没有任何已登记的正式立绘 URL 时，仅按人物名显示有效 `review`／`chat` 图，不要求衣装快照，显示结果的 `outfit` 留空；已有正式立绘时，显式衣装仍须版本 1 单角色生成快照与衣装名精确匹配。正式图与原默认回退优先，读取／解码错误不降级成“从未有图”；显示不采用候选、登记 DNA 或设默认。
- 内置编号正文 CG 的解析入口接收仅在本地使用的 `characterContextForEntry`：先核验返回的 `at` 并取得该段上下文，再执行原 `checkPromptOutput`，生成与锚点使用相同偏移。该回调不进入模型资料或持久化；缺失／无效生成点、错名及非法绑定仍拒收。普通历史重画沿用原图快照。外部 DBGen 写词流程保持原契约。

- 内置立绘采用须核验图片成功及权威回读、角色／作用域、冻结衣装基线、模板与实际发送来源，再提交身份及命名衣装补丁。身份初始化／主动清空与衣装建立分别处理；存量字段及显式裸体语义保持。设置或素材状态保存失败沿既有补偿恢复，保留候选，不假装跨系统原子提交。
- 内置默认立绘、头像、表情和续画解析命名衣装及所属库；「原装」仅映射新默认，不另存图或 DNA。旧 `defaultAppearance`、衣装默认标记及旧原装图只保留，不推断新默认。普通 CG 历史重画及手改 final 不被新默认自动改写；普通立绘重画按当前目标衣装重组，存在历史衣装绑定时必须一致。
- 立绘与服装差分采用通过 `readWardrobe` 读取当前有效共享衣柜来解析所属角色的衣装说明；返回补丁仍基于角色所属库，不复制共享衣柜，新增衣柜键避开共享键。衣装拒收保留 `OUTFIT_ADOPTION_CONFLICT`，提示和受控诊断区分资料变化、模板复核、快照、发送正文／坐标及证据缺失；诊断不含身份、衣装正文或凭据，失败保留已生成图片。
- `saved-outfits-changed` 的拒绝摘要仅返回冻结基线／当前读取条数、新增／移除／说明／默认标记差异、匿名归属及所属库／有效视图相等性；缺失历史列表标为未知，不据此断言历史为空。摘要不返回角色名、衣装名、图片或正文，不参与采用判定或补丁；三个 UI 采用入口保留具体错误码、摘要及保存前 `writeAttempted: false`。首次入库前不要求编辑不存在的衣装，空库合成回归通过不代表现场根因已确认。
- 普通 CG 写词前冻结作用域及角色归属，暂存候选前复核槽位 key、revision/token、当前目标及衣装资料；多人物候选全部核验后一次暂存。图片已经提交而候选暂存失败时保留图片并警告，不重复生图、不写入半成品。剧情衣装发现阶段只保存待选候选，不请求写词或绘图；候选绑定 scope／owner／chat-floor／message／正文哈希，翻页、稍后和重开均不自动请求。用户选择仅入库衣柜后才提取并保存独立衣装描述；选择入库并生成立绘后，先保存并回读衣装，再生成单张平和立绘。同候选在途采用去重，重试必须已有明确入库选择。已登记衣装、同规范角色同衣装的有效首次立绘临时快照抑制重复确认和迟到点击的重复生成；其他衣装不受影响，临时图丢弃后可恢复候选。确认同步隐藏候选；写词或衣装入库失败恢复待确认，衣装成功入库后的 DNA、绘图、权威回读或立绘保存失败不回滚衣装、不重新确认。绘图失败的已完成提示词和恢复旁路写入所属库衣装表情注记，并建立空平和槽供设置页继续生图；恢复保存失败单独报错。已生成图片 ID 保留且显式重试复用同图。用户确认前不改衣柜或 DNA，已入库失败候选重开不再弹框。采用沿冻结角色归属写回，仅写对应衣装 moods 槽，不覆盖原默认立绘或基础 DNA；关闭阅读器、切卡、切楼或正文变化拒绝后续发送和迟到提交。待确认图片纳入清理保护，候选读取失败保守保留图片。图片、候选与设置存储不共享事务。
- 剧情衣装写词前先持久化 `writing` 状态，保存失败不发送写词或绘图。候选容量按 scene 存储契约只替换无恢复资料的纯发现记录；无安全位置时返回 `candidate-limit`，阅读器明确区分尚未入库和已入库后续停止，不以通用恢复警告覆盖同一容量原因。

- 内置一致性按 CG 自身衣装锚点或可靠历史快照恢复要求，预检图与 DNA 同源；跨衣装回退须集中确认。未知／缺失来源、读取／解码失败均受控停止，不自动补图。发送前与候选接受前复核目标、图片、资料、所属库及配置；失效或取消后拒收迟到结果，来源改回也不复活旧任务。
- 接受候选保留原 CG 提示词、caption、recipe、身份／衣装快照和手改标记；局部模板、展开快照及实际 infill 来源归档于 `consistencyPrompt.rounds`。新内置轮次可附受控 `appearance`：要求／有效衣装、选择来源、回退及确认状态、参考槽／16 位来源标识／revision 和可用归属；仅 `igs-gen:` 引用保留 URL，不持久化图片载荷、外部凭据 URL、完整配置或内存租约。合成图清除旧整图 wire，首次基线保留旧来源；无新字段的历史记录不回填，备份恢复保持兼容。


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

## 媒体交接（v0.36.39）

- 生成服务共用装配层注入的 `mediaCache`。素材、CG、物品只保存身份/元数据和有界任务状态，原图、缩略图、Blob URL 不得另存业务缓存。
- `getImagePrompt/saveImagePrompt` 等元数据操作不 hydrate 图片；修图/导出显式读取原图和遮罩，读取不完整则失败。revision 冲突保留当前图并补偿上传。
- 临时素材保存引用失败须补偿新图片；成功替换后释放旧图片。CG 单张/整楼重画在成功提交前保留旧记录；读取只加载当前槽位，不因显示一张读完整楼 16 张。
- 停止、销毁和清缓存后不接受旧任务像素或更新事件。外部插件图片保持外部所有权，显示预热复用浏览器 HTTP 缓存，不复制为另一份 Blob 磁盘缓存。

v0.36.44：当前聊天临时素材/物品元数据共用媒体层 `asset-record-cache.js`，记录与仅含键的分页索引共享中央注册表中的所有者预算。同步展示 miss 按需补载，生图前的缺失确认、入库/丢弃/重画必须 fresh 查询完整权威记录；缓存容量只能影响驻留，不能停止补图或把淘汰当缺失。查询失败保留已有引用并暂停该次操作，待确认页的重新读取可恢复当前聊天的暂停补图；手动物品补全可再次点击。聊天切换、清理、销毁以及查询期间的新写入使旧结果失效。CG 状态及缺图 TTL 仍由注册表管理。消息关联保存资源键，读取时解析当前显示 URL，失效则重新向消息/provider 取图。bootstrap 不手动逐个调用服务清缓存。
