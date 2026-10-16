# 生图配置与架构

## 当前内置流程与配置

IGS 内置 NAI 路径不要求安装或启用 DBG。立绘、角色 DNA、表情、头像、服装／换装、背景、物品、普通 CG 及一致性重绘共用 IGS 的固定提示框架，按显式 task 装配中间任务／资料槽。默认预设可直接装配，但不会替用户填写凭据、启用生成开关或自动发请求。下文早期架构与验证记录为历史背景；与本节冲突时，以当前模块 CONTRACT 和本节为准。

1. 在「设置 → 生图 → 图像来源」选择内置 NAI，手动填写 Key、传输方式和模型；不要把凭据放进提示词预设。
2. 在「生图 → 副 LLM」选择沿用酒馆 API，或填写独立兼容接口的地址、模型与凭据。内置 NAI 的「图像来源」页固定提示词组入口直达同一管理器，支持草稿、保存、明确激活、角色／顺序／启停、任务模块、预览和导入导出；只有 PresetRegistry current 生效，草稿不影响运行。该入口和管理器仅在 `nai` 展示及允许操作。
3. 选择内置 NAI 后，在「图像来源 → 画师串库」命名、新建、编辑或删除画师串，也可导入文件或粘贴 JSON。选择条目及全局／分类目标，明确应用后点击「保存画师与设置」。编辑库不自动改变已应用文本，分类页通过按钮跳转库并选定目标；分区开关保持原值。原全局／分区画师和旧通用负面原文仅归档到草稿，保存成功才持久化一次性归档标记；坏库或满库拒改并保留原资料。旧通用负面不再参与写词或绘图，负向内容由活动预设与应用的画师条目负责。定稿只前置一次画师；生成开关仍由用户启用。
4. 角色首次立绘同次产生三景别 DNA 候选，图片成功并权威回读后采用才登记。普通 CG 的当次身份不会登记永久 DNA；缺少衍生图所需保存景别时须先补资料。
5. 默认立绘与手动新衣装先保存说明并回读，再绘图；图片失败不回滚衣装。v28 内置指定新衣装提取只给目标衣装、角色 DNA 和参考资料，不给其他衣装清单；错名回复停止，不改名套用旧描述。表情写词只给一份当前景别身份、当前衣装、用户要求及图号／角色表，只输出表情片段，不额外扫描世界书。构图、底色和完整校验资料留在程序侧。编辑角色／服装 DNA 后，立绘的重画／续画使用当前资料。普通 CG 重画使用当前身份配原衣装快照，连同原 source 保留，不重新写词。
   普通内置 CG 使用 v27 精简资料：角色输入仅含角色键与可用景别，token 取 `promptTask.characters`；衣柜目录仅含本轮编号、角色与名称。完整身份及衣装 DNA 留在程序侧。每位 named 使用本人身份槽、衣装槽，并交付现有身份字段及非空衣装名称和描述；`meta_outfit_id` 有效值选择保存衣装，显式空值选择当次描述。`at` 校验挂载位置与范围，不以剧情推导衣装否决合法选择。新衣装先用于本次 CG，图片权威回读后暂存候选，用户确认才入柜；候选暂存失败不重发图片。自定义 CG 模块需声明 `outfitCatalog` 并适配精简角色目录，详见 `docs/OUTFIT_DNA_PROMPTS.md`。
6. 楼末确认可复用在途服装写词；入柜前失败恢复确认，入柜后失败不重弹。可续画资料保存成功时在素材页继续；恢复保存失败明确反馈。已完成 imageId 的采用失败重试同图，不重发图片。关闭阅读器／切卡等目标失效后拒收迟到图片，不保证跨阅读器完成。
7. 内置 NAI 的「立绘透明底」保存为 `bridge.imageApi.naiSpriteTransparent`，默认开启。V5 支持原生透明；关闭或使用 V4.5 等不支持模型时，写词按白底要求，生成后由抠图链处理。默认立绘、自动素材、表情和重画共用此设置。定稿不会在发送层补写底色文本，手改提示词需自行保持底色要求；infill 仍为非透明请求。DBG 使用原 `dbgenSpriteTransparent`，两个开关不互相覆盖；物品图仍沿原模型能力策略，不受立绘开关控制。
8. 「一致性重绘模型／强度」在内置 NAI 与数据库生图下均可设置，沿用 `bridge.autoIllustration.consistencyModel`／`consistencyStrength`；缺省重绘强度为 `0.6`，执行范围 `[0.1,1]`，显式保存的强度保持原值。智绘姬和柏宝绘不显示这一组。关闭重开保留所选值，配置成功变更后旧任务失效，切回不复活。

### 自动楼层生图

正常主生成期间合并渲染通知，结束后读取当前聊天的最终 AI 楼层再启动自动素材／CG；后台写词、dryRun 和代写不作为正文触发。停止、换聊天或卸载使待交付通知失效，停止后的迟到事件不重启，正常新一轮生成才解除拒收。

同楼在途更新合并到最新正文，成功后受控补算，失败不在原任务内自动重发。素材已完成楼层的重复通知不会重画；需要补旧楼时使用手动补全。CG 未选中状态对相同正文和决策输入不重复掷概率，正文、开关、概率、继承 NSFW 或预置 CG 命中变化后可重评；已有图不重复生成。概率 100% 不绕过有效正文 50 字、生成开关、预置 CG、最新楼层与存储等其他门禁，现场偶发未触发的具体原因尚未确认。

### 可选来源与存量数据

| 图像来源 | 写词／配置与兼容边界 |
| --- | --- |
| 内置 NAI（nai） | IGS 预设与手动配置；不探测 DBG，不复制其凭据或预设。支持内置模板和 provided 局部任务。 |
| 数据库生图插件（dbgen） | 使用插件自身写词预设、凭据与生成配置。缺失明确失败；final、provided、模型协商与配置租约缺能力时拒发，不假兼容。 |
| 柏宝绘（baibai） | 保留旧标签／公开 API 流程和既有 NAI 兜底；不接管新 DNA 模板或定稿协议。 |
| 智绘姬（extension） | 保留旧事件桥／楼层标签与既有兜底；不接管新 DNA 模板，阅读器仍沿原外部入口。 |

来源成功切换后旧任务失效，切回也不复活；柏宝绘／智绘姬从楼层词等待到外部请求、图片读取均受 IGS 租约保护，迟到失败不启动 NAI 兜底，柏宝绘阅读器保留取消与停止原因。停止等待不证明上游执行或计费已停止，不自动补发状态未知请求。IGS 租约与 DBG 的 expectedConfigToken 分开校验，不互写配置。旧 writeDbgenPrompt／writeDbgenFloorPrompts／generateDbgenCaption 保留同源别名；无模板旧图不猜测拆分，逐图手改 final 原样发送。

旧格式导入先预览与处理 ID 冲突，再明确保存／激活；召回项仅存档或报告，不运行召回。未知执行字段、宏或未映射槽不能静默丢弃后激活。默认升级只覆盖与已知基线完全相同的正文，自定义、角色、顺序与开关保留；读取或保存失败不替换 current，可按块 ID 和备份 revision 恢复。

### 安装与验收边界

先备份设置和自定义预设，只启用一份 IGS 脚本并刷新。标准远程 loader 与内嵌本地代码导入件不是同一产物；工作树改动不会自动更新已有本地包。实际导入件重建及 SHA-256 核验须按获授权的打包入口执行，不能把源码测试当成已部署。内置使用不要求同步更新 DBG；仅选择 DBG 时才按所需能力核对其版本。

当前验证为隔离 LLM／网络、真实组件装配、最终 wire 与生产存储适配器配事务 fixture 的离线证据，不代表真实模型遵从、NAI 接受性、视觉收益、浏览器 IndexedDB 或手机实机通过。环境缺资源／bundle／loader 的验收失败保持，不下载静态资源或放宽断言。最新结果以任务验收记录与 README 为准，历史测试数字不代表当前代码。

### 测试生成与 HTTP 500 排查

内置 NAI 的测试按钮使用本次草稿，不提交设置。实际模型优先使用分类中的 `imageApi.cgModel`，留空时跟随 NAI 默认模型；对比 DBG 时应核对最终模型、地址、传输、尺寸、采样器及噪声计划，而不是只比较页面默认值。

接口地址留空使用官方；填写中转根地址或 `/ai` 时，内置客户端在发送前补成 `/ai/generate-image`，完整接口及其他显式自定义路径保持原样。代理模式先补全目标，再包装 `/proxy/`，设置草稿和已保存地址不被改写。现场日志曾显示直接 POST 到中转根路径，与此前客户端原样发送行为吻合；DBG 对同类地址会补全生成路径。修正后可检查 Network 中实际请求是否已到生成路径，但这不证明中转服务不会再返回其他错误。旧通用图像接口的来源识别保持不变。

发送层已与 DBG 对齐 `tag_hint_qt`／`tag_hint_uc_preset` 的整数 `0/1` 编码；其余布尔开关、定稿正文和 infill 契约不变。V4.5／V5、直连／酒馆代理以及根地址、`/ai`、完整接口的按钮链有隔离请求捕获验证。先前仅字段编码的修正未消除助手现场的 500；地址补全后的真实接受性仍待复验，不将离线通过当作现场修复证明。500 或发送状态未知时不自动重试，避免重复执行或计费。重新导入当前本地包后，按需自行复验；若仍失败，仅提供脱敏的模型、传输、目标地址路径、参数值与 HTTP 状态，不提供 Key、完整请求正文或图片数据。

### 副 LLM 通道与图片响应诊断

独立副 LLM 使用 IGS 自己配置的地址、模型与 Key，优先经酒馆 `ChatCompletionService` 的 custom 通道调用，与 DBG 的宿主调用方式靠拢，无需安装 DBG。宿主缺少发送能力时才直连；请求失败后不换通道补发，422 不重试，也不继续绘图。未配置的温度或 JSON schema 不主动追加，预设消息正文及角色顺序保持。模型列表在宿主具备发送与请求头能力时通过 custom status 接口获取。

JSON／SSE 回文只去除前置且闭合的思考块，未闭合思考不作为正式写词结果。失败提示保留 HTTP 状态、实际通道与白名单字段名，不回显上游正文或凭据。若 MiniMax 仍返回 422，请提供脱敏模型名、状态和受控诊断；仅凭此前日志不能确定服务端拒绝的具体字段。

NAI 图片响应先读取原始字节，兼容缺失／误标 Content-Type 的 ZIP、PNG、JPEG 与 WebP，以及原有 JSON 图片结果。ZIP 支持 stored、deflate 和中央目录提供长度的 data descriptor；解析失败显示受控原因，不再只有通用文案，也不自动重发。缺浏览器 deflate 解压能力、数据不完整或格式不支持时，依据具体提示处理。

当前改动有隔离请求与真实字节夹具验证，未访问 MiniMax、NAI 或用户中转。重新导入本地包并刷新后，先确认 NAI 测试生成，再按需复验原过场插图入口；失败只提供状态、错误码／提示、模型与传输方式，不提供 Key、完整请求／响应正文或图片 base64。

### 自定义方案与身份分层（默认框架 v9）

v8 以助手的 `1001适配gal前端生图预设.json` 中 `preset-imagegen-97-v5` 为迁移依据，将完整构图、连续状态、自然语言、权重、可见性和自检规则适配到 IGS 的共享框架与十种任务模块。适用的 Scene／Char 分工、衣装空值分支和字段自检直接复用源预设原句；CG 选点、`at` 及用途输出协议按 IGS 实际入口适配。无需导入根预设即可使用新版内置正文；原文件未修改。实际发送仍经活动预设的任务槽、资料槽和对应输出协议，不把所有用途强行改成同一种人物格式。

CG 模块提供完整 `dna-template` 示例。`char` 使用实际数字坐标与动态正文，例如 `char: 0.5,0.5 | <<dna:r0>> <<outfit:r0>> and waves.`；索引、kind、角色键及 token 各自写入 meta 字段，不写成多列混合格式或字面 `x,y`。身份旁路不替代 Char 中自身的身份／衣装槽，衣装名称不作 token。普通 CG 的 `meta_identity`／`meta_signature` 描述稳定身份及锚点，不包含可更换衣装或当次表情；程序不做关键词清洗来替模型完成分层。

一致性模块另有 named/reference 双 Char 完整格式示例。所有 `meta_*` 均使用本轮 `outputs.rows[].captionIndex | 值`，例如 `meta_key: 0 | 输入角色键`、`meta_token: 0 | r0`、`meta_frame: 0 | half_body`；同人参考 Char 使用自己的索引和 token，空衣装字段仍保留 `索引 |`。一致性写词不输出普通 CG 身份旁路，参考关系只写在参考 Char 中，不新增 `reference:`、`reference_uc:` 或独立 `reference inset` 行。衣装模板模式下，named Char 用衣装槽引用原 CG 衣装快照，不重复穿戴清单。已有模块路由和参考标签发送封装保持，解析器仍拒收缺索引及协议外字段，不自动修复回复。这些是输入指导和协议边界，不保证模型遵从。

三景别 DNA 是稳定人物外貌，不是完整立绘词。发型发色、眼睛、脸型、肤色体型、非人身体特征和明确的标志饰物属于身份；战斗服、护甲、鞋帽和普通战术耳机属于本套衣装；严肃／镇定表情、警戒、视线与动作属于 Char 动态。新身份不能复制衣装说明或当次 Char 正文，也不能用衣装补全未知外貌。

v9 对新提取资料加强细节锚定：人物写出有依据的发型结构、发色层次、五官、肤色和身材；服装写出颜色、材质光泽、剪裁层次、纹样与装饰数量／形状／位置。未提供的信息不编造；已有 DNA 与衣装说明逐字复用，不自动清洗或重设计。已有半身 DNA、保存衣装说明和内置情绪、无额外要求时，基础平和图／预设表情直接使用固定双 DNA 模板，通过严格校验后绘图，不请求写词；有额外要求、自定义情绪或缺衣装说明时保留写词／提取流程。

各用途保持职责：CG 表达人数、互动与真实取景，只有编号正文选点任务输出 `at`；立绘可同次提供缺失的身份候选；表情、头像、换装和一致性复用保存身份；背景为空镜，物品为单件静物。服装 DNA 提取只产独立穿着谓语，不套用绘图的底色／质量词。已保存的衣柜参考图提示词继续直接绘图，不新增写词调用。

默认立绘、换装和表情的 `half_body` 在 Scene 中明确为完整头顶至腰胯，保留头发、双肩、躯干及画内手势，留少量余白，不缩成胸像或脸部特写。旧内置模板同步为正常上半身，负面不再排除 `upper body`；只迁移可确认的旧默认原样副本，自定义模板保留。明确全身／头像任务和 CG／一致性各自镜头不受此规则覆盖。

衣柜角色换装与表情差分的每张图片都独立以 `slotid: 本轮编号` 开始，完整写完动态、UC 和该图全部 meta 字段后，才用独立行 `---` 分隔下一张；其后下一非空行必须是新 `slotid`，单图不写分隔符。不要将服装名、表情名、`#编号` 或 `slot` 当作 `slotid`。服装静物／服装 DNA 提取不套用人物协议。阅读器的角色布局和显示比例另行控制，本轮未改缩放；缺少现场回文和设置时，不能确认取景过紧来自生成还是显示。

物品与批量背景把构图、底色、质量和 UC 要求提前交给写词预设，合法正文按定稿发送，只前置画师一次。编号、重复字段、缺项及无人任务混入 Char 均按对应协议拒收；活动预设失败不会通过英文名称、词典或温和重试继续绘图。背景 `caption-slots` 要求 `scene` 非空，`char`、`uc` 字段必须出现；非法回复提供受控字段、原因、slot 与实际行号，缺失字段不伪造行号。这些是运行时契约，不保证模型服从自然语言语义。

v1 至 v8 升级到 v9 只替换与已知持久基线一致的默认正文，并保留备份、自定义正文、角色、顺序和开关。自定义块不会强行覆盖，版本号不能证明全部正文已经更新。程序不会自动清洗已保存的 DNA：已有三景别含衣服或表情时，先备份，再在角色 DNA 编辑器按原角色资料修正，仅保留有依据的稳定外貌；默认外观服装保留独立衣装说明。不要清空整套 DNA 或图片来触发重新生成。

`DNA_VIEW_INVALID` 提供受控 `field`、`issue`、`detail`、图号与 Char 索引；对应回复字段存在时才提供行号。缺主语、空主语、缺景别、超长和递归身份占位仍严格拒收，不自动修词或继续绘图。失败只提供这些诊断与模型／HTTP 状态，不提供完整回文、DNA、凭据或图片。

模板回复中的代码围栏仍严格拒收，诊断为 `field=response_format`、`issue=invalid`、`detail=code-fence` 并保留行号；不会剥除围栏后补槽、猜 token 或自动重试。前置已闭合思考块仍只由既有副 LLM transport 提取层处理。

提示词工作不以字面量匹配、进入请求或固定假模型回复证明模型效果；程序回归验证调度、严格拒收、取消、租约、角色绑定、候选采用及持久化保护。本地导入件与实际验证结果见 `.limcode/outputs/igs-local/README.md`，本轮记录见 `.limcode/cache/igs-default-auto-artists-delivery.md`。未调用真实酒馆、MiniMax、NAI 或用户中转；模型遵从率和图像效果未验证。历史全量门禁和稀疏检出下的标准构建限制不因本地打包关闭。


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
| `nsfwEnabled` / `nsfwCount` | `false` / `1` | NSFW 场景开关与每层张数（1～16） |
| `interludeEnabled` / `interludeProbability` / `interludeMaxCount` | `false` / `30` / `1` | 过场开关、百分比（0～100）、最多张数（1～16） |
| `llm.source` / `llm.endpoint` / `llm.apiKey` / `llm.model` | `tavern` / 空 / 空 / 空 | `tavern` 使用当前酒馆 API；`openai` 使用独立兼容接口及凭据 |
| `llm.contextFloors` / `llm.timeoutMs` | `1` / `90000` | 参考 AI 楼层数（0～3）与规划超时毫秒 |
| `nai.transport` / `nai.apiKey` | `direct` / 空 | 浏览器直连或 `st-proxy`（酒馆需开启 `enableCorsProxy`）；未填 Key 不请求 |
| `nai.model` / `nai.size` | `nai-diffusion-4-5-full` / `832x1216` | 官方模型与尺寸 |
| `nai.steps` / `nai.scale` | `28` / `5` | 步数（1～50）与 CFG（0～10，可小数） |
| `nai.sampler` / `nai.noiseSchedule` | `k_euler_ancestral` / `karras` | 采样器和固定噪声调度（后者暂不在面板编辑） |
| `nai.artistPrefix` / `nai.artistNegativePrefix` | 空 / 空 | 由画师库显式应用的正负向前缀 |
| `nai.negativePrompt` | 空 | 旧通用负面仅兼容保存与归档，不参与生成 |
| `nai.artistLibrary` | 版本 1 空文本库 | 命名、增改删和导入；显式应用前不参与请求或任务租约 |
| `nai.artistLibraryArchived` | 缺省 | 成功保存的一次性存量归档标记；不影响运行请求 |
| `nai.timeoutMs` | `120000` | 图片请求超时毫秒（暂不在面板编辑） |

验证边界：本地 fake host、fake provider 和模拟阅读器只检查契约；实际 TavernHelper `generateRaw` / 正则 API、NAI 直连及代理 CORS、真实 IndexedDB、刷新后的宿主聊天 DOM、swipe 切换和手机大图性能须在酒馆中验证，不以本地测试替代。


## 素材补全（无名角色立绘 / 缺失场景背景）

自动素材补全独立于既有用户上传素材区。当前实现支持在阅读器解析到缺失场景背景或无名角色立绘时，根据设置规划生成任务；所有相关开关默认关闭，关闭时服务在规划、写回和网络请求前返回 `disabled`，不会向副 LLM 或 NovelAI 发请求。

素材解析优先级为：用户上传区 → 生成区素材库 → 本聊天临时素材 → 占位。普通匹配允许弱模糊结果；开启 `bridge.autoIllustration.assets.strictMatch` 后，弱模糊结果按未命中处理，但生成期间仍保留弱命中或默认占位，避免阅读器出现空白。场景名、别名和强模糊命中可以直接使用，不重复生成。

生成素材分为本聊天临时记录和生成区素材库：楼层完成后，阅读器可以显示审核卡片；用户可确认入库、改名、删除或丢弃。入库条目写入 `bridge.sceneAssets.generated`，与手动上传的 `bridge.sceneAssets` 素材分开保存；设置页的「场景 → 生成素材」子标签管理生成区条目和本聊天未入库条目。

立绘透明底策略为：provider 返回原生透明图时直接保留 alpha；非透明图使用本地浅灰底连通区域抠图兜底。该抠图策略只移除与画面边缘连通的浅灰区域，不保证对浅灰或银色角色服饰、头发在真实模型输出下完全无误，需在真实酒馆中复验。

生成图不把二进制数据写入设置。IndexedDB 使用数据库 `igs-generated-assets`、版本 `1`，store 为 `images`、`assets`、`floors`；阅读器和设置页使用 `igs-gen:<id>` 形式的图片地址，再由生成素材服务解析为本地对象 URL。楼层身份同时包含 `chatId`、`messageId` 和 `swipeId`，格式为 `${chatId}|${messageId}|${swipeId}`。

为降低请求被拦截的概率，生成流程使用温和模式，并在本地组合 `nsfwExtra`；背景生成失败时可以回退到内置场景词典，避免因单次请求失败清空阅读器背景。API Key 只用于实际请求，不应进入日志、异常文本、快照或聊天输出。

相关设置路径为：

| 设置路径 | 作用 |
| --- | --- |
| `bridge.autoIllustration.assets.spriteEnabled` | 开启无名角色透明/抠图立绘补全 |
| `bridge.autoIllustration.assets.backgroundEnabled` | 开启缺失场景背景补全 |
| `bridge.autoIllustration.assets.strictMatch` | 将弱模糊场景命中视为未命中并允许生成 |
| `bridge.autoIllustration.assets.maxPerFloor` | 单个楼层最多生成的立绘数量（1～16，默认 2）。背景按本楼尚未生成的场景各出一张，不受这个上限限制 |
| `bridge.autoIllustration.assets.spriteSize` / `backgroundSize` | 立绘和背景生成尺寸 |
| `bridge.autoIllustration.assets.templates.background` / `templates.sprite` | 背景和立绘提示词模板 |

### 手动补全与失败重试

阅读器工具栏新增「生图」（手动生图）按钮，仅补全当前聊天最新 AI 楼层缺失的背景和立绘。先在设置中开启场景素材、自动背景或自动立绘，并配置自动插图区的 NovelAI Key；保存设置后打开最新 AI 楼层、展开工具栏即可点击，不必等待下一条 AI 回复。

按钮复用 `generatedAssets.processMessage(messageId, { manual: true })`，仍使用 `bridge.autoIllustration` 的副 LLM、NAI 和素材存储；不走旧 `bridge.imageApi`，也不重试自动 CG 插图。手动操作仅绕过楼层 `done` 去重，不绕过功能开关、楼层身份和素材匹配；已有素材不重复生成。

生成失败的楼层保存为 `failed` 并返回失败结果，后续可重新处理，不再因误标 `done` 永久跳过。按钮开始、完成、失败及跳过原因会显示在阅读器提示和现有生图日志中；聊天或 swipe 已切换时提示重新打开最新楼层。

升号前素材测试 15/15、手动入口模拟 3/3、完整 `npm test` 390/390、`npm run simulate` 135/135、`npm run build` 和 `npm run perf` 均通过（退出码 0）。合并魔法棒改动并升至 `v0.29.3` 后，重新构建 bundle、版本化自动更新 loader，完整 `npm run gate` 通过（退出码 0，含魔法棒独立回归，模拟 135/135）。真实 TavernHelper 事件、NovelAI Key/额度、直连或代理 CORS、IndexedDB 与酒馆视觉均未验收，不打 tag；下一步在目标酒馆点击最新 AI 楼层的「生图」，结合日志与网络面板确认请求及结果。

此前版本的本地 `npm test`、`npm run simulate`、`npm run structure`、`npm run static` 与 `npm run perf` 通过记录不代表本轮验证；本轮结果以上述记录为准。真实 TavernHelper、NovelAI/provider、真实酒馆 DOM、IndexedDB 迁移、跨设备 `igs-gen:` 失效回退和真实视觉质量仍需在目标环境中验证。


## 角色 DNA 与抠图修复（本地内测候选，尚未经真实酒馆验收）

### 角色 DNA

`bridge.sceneAssets.characterDna = { 主角色名: { identity, defaultAppearance, negative, triggerWords } }`，与情绪槽映射 `characters` 并列。键为主名，查询先经既有别名归约；空字段不注入；旧配置缺该字段时规范化为 `{}`。唯一编辑入口在「场景 → 素材 → 角色立绘」：角色卡内折叠编辑器、「仅有 DNA 的角色」列表（可先录资料后补立绘）、审核卡「加入素材库并编辑 DNA」（`tags` 仅作候选，点「采用」才写入 `defaultAppearance` 且不覆盖已填内容）；生图页「管理角色 DNA」只跳转。角色改名保序迁移、删除清理；场景预设保存 / 应用 / 导入 / 导出携带 DNA，旧预设缺字段时保留当前 DNA。

合并顺序：

- 立绘补全：`triggerWords → identity → defaultAppearance → 副 LLM tag → 立绘模板`；负向为 `模板负面词 → DNA negative → NSFW 防护词 → 素材 uc`。
- 剧情 CG：`triggerWords → identity → 规划得到的当前外观 / 动作`；`defaultAppearance` 只交给 planner 作默认资料，剧情换装时不强行追加；负向 `DNA negative → char_uc`。planner 输出 `char: 角色名 | x,y | tags`，旧格式 `char: x,y | tags` 仍兼容；无名角色仅在「本张单人且上下文唯一角色」时绑定，多人无法判定时不注入并写 warning 日志。
- 数据库生图：合并结果照旧经 `meta.userPrompts` 传给插件，插件是否采纳不作保证。智绘姬链路不变。

### 非破坏抠图记录

新生成立绘写 schema v2：`originalDataUrl`（provider 原图，不可变）、`workingDataUrl`（最近接受的 AI 重建原图）、`dataUrl`（当前透明结果，旧消费者继续读取）、`alphaMaskDataUrl`、`matteCrop`（自动抠图裁边偏移）、`revision`。同一 IndexedDB `images` store 懒兼容，不升库版本。旧记录只有 `dataUrl`，按 legacy 只读，界面提示「无原图，不能恢复已丢失像素」，不伪造原图。写完整记录遇存储额度错误时只保存透明结果，素材记录标 `sourceUnavailable: 'quota'`。新立绘额外保存原图与 Alpha 遮罩，单张占用明显高于旧版（原图 + 透明结果 + 遮罩，接受 AI 修复后另存工作原图）；实际增幅取决于图片尺寸与内容，尚未实测。

### 本地遮罩修复编辑器

生成区立绘行的「修复抠图」打开编辑器（首版只编辑 `igs-gen:` 立绘）：保留 / 删除 / 软边发丝画笔、画笔大小、撤销重做（会话内最多 20 步）、恢复自动抠图、保存 / 取消；Pointer Events 同时支持鼠标与触控，坐标始终映射回原像素。保存经 `saveMatteEdit` 按 `revision` 原子更新，另一会话已修改时拒绝并保留编辑内容；取消、关闭不写任何字段。

### AI 局部重绘

只能由用户在编辑器中圈出「AI 选区」后点击触发。`image-backend.describeEdit()` 协商能力：仅内置 NAI、所选模型存在 inpainting 版本（V4 / V4.5，action `infill`）时可用；数据库生图、智绘姬与 V5 模型返回 `image-edit-unsupported`，按钮置灰并说明原因，绝不退化为整张重画。候选只在内存中预览；点「接受」才写 `workingDataUrl`、重新自动抠图并原子更新；取消、失败、超时、过期不写入；恢复首次原图清除 `workingDataUrl`。提示词自动附带该角色 DNA 与「保持发色 / 发型 / 脸 / 视角 / 光照」项。AI 结果是生成式重建，不代表恢复被抠掉的原始像素。API Key、原图 base64 与请求体不进入日志、错误与测试输出。

### 验证边界

本地只用 fake provider / fake store / 假 DOM 验证契约与请求结构。NAI inpaint 的真实请求字段与返回、直连及代理 CORS、IndexedDB 配额、大图内存、触屏画笔手感与实际发丝质量均需在真实酒馆中验证；验证前不打 tag。
