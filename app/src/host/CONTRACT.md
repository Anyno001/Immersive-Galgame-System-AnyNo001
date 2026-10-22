# host 模块契约

- 0.36.90：宿主入口未就绪与已发送等待回执分别发布明确状态；保持原消息观察和单次发送，观察到原回执后自动继续，不把等待解释成发送失败后重发正文。

## 宿主事件接收隔离（PR #11，0.36.88 本地草稿）

- `illustration-message-host.on(eventKey, handler)` 同步调用内部处理后返回 `undefined`。共用的私有 `invokeListener` 收束内部 Promise、同步异常与异步拒绝，诊断只记录事件键；`onImageFloorReady` 的即时和主生成结束后交付同样经过此入口。自动插图和素材补全的处理器返回内部任务 Promise，交由适配器收束。
- 保留宿主原事件及参数，不接管 `emit`、不重发公共事件。启动时事件端口尚未就绪的订阅保留在同一待绑定集合，由一个退避计时器探测端口；绑定完成即停止，不轮询正文或补跑历史。取消订阅与销毁同时释放待绑定项、计时器及本实例监听器，迟到回调不得复活订阅。同步内部处理仍占当前调用栈，楼层就绪的微任务汇总保留；真实酒馆插件组合尚未复验。

## 阅读器回复续接（0.36.88 本地草稿）

发送恢复先检查宿主是否已收到原用户消息，避免重复发送。`resumeReply` 使用宿主 `generate` 继续已有正文、重新生成空回复或从既有用户消息开始回复；宿主没有该端口时沿酒馆助手的公开 `/trigger` 入口恢复。用户停止事件保留；读取/显示失败只继续读取，不重复故事生成。普通选项仍经输入框发送。


- `prompt-context` 为规则注入和复制规则收集完整的非系统 `history/previousAiTexts`，不引用已删除的历史截断常量；标签触发的 `recentAiTexts` 窗口仍由 `lookback` 独立决定，保留输入框与最近用户消息的取值语义，不写宿主。

## 固定版本启动器（test-v0.36.66）

- 固定版 loader 的 tag 属于脚本内部常量，不允许页面残留的 `IGS_LOADER_REF`、配置 ref 或 base 改写。该版本失败明确报错，禁止请求 main 或其他版本。
- 只有已记录的来源 ref、base 与实际 API 版本均匹配时复用实例；来源未知或不匹配先等待现有 `shutdown()` 完成。关闭失败停止替换，不能让两个媒体所有者并存。
- 模块加载完成还要核实 API 的实际版本；返回错误版本时关闭该实例并报要求版本与实际版本，不把脚本 load 事件当作指定版本就绪。

## 副 LLM 转发（v0.36.58）

- 0.36.88 的消息/结果处理与自定义通道拆分继续服从本节同源转发要求。`image-world-info.js` 统一生图世界书扫描；关闭参考块、provided 任务及编辑预览不调用宿主扫描，不在 generated-images 中另造世界书读取路径。
- 独立 OpenAI 兼容接口的模型列表与生成，分别 POST 到酒馆同源 `/api/backends/chat-completions/status` 和 `/generate`；使用宿主 `getRequestHeaders` 的 CSRF 头和当前酒馆会话，不向浏览器直连上游，也不依赖通用 `/proxy`。
- 两种请求均使用 `custom` 来源，地址和插件密钥通过请求内的 `custom_url/custom_include_headers` 传递，不更改主连接或酒馆密钥库。空密钥显式覆盖 Authorization，不能借用主连接密钥。
- HTTP 错误和 HTTP 200 的 `error` 响应都返回受控失败，保留状态码和参数诊断，文案隐藏插件密钥。生成请求的计时仅报告仍在处理，继续接收同一次响应正文；用户取消仍中止请求。只读模型列表保留原超时。宿主请求头不可用时明确报错，不退回跨域直连。

## 职责

- 适配 TavernHelper、SillyTavern DOM 和酒馆魔法棒菜单。
- 统一定位聊天楼层、当前楼层、输入框、发送按钮和消息图片。
- 副 LLM 请求（`secondary-llm.js`）。
- `illustration-message-host.readCharacterLore` 按本轮角色筛选并完整收集角色卡、用户人设及匹配的世界书条目，不按每人或总字符数截断；`includeWorldInfo:false` 仍由内置预设的原生世界书扫描负责参考。
- `illustration-message-host.readCardWorldbook(names)` 只读当前角色卡绑定的世界书（卡上主世界书与 TavernHelper 报告的主/附加世界书；都没绑才读卡内嵌的那份），返回每个名字命中的启用、非空条目 `{title, content}`；命中只看关键字（含次关键字）与条目标题，不扫正文。供等待小游戏的麻将对手配打法用，条目整条返回、整条送给副 API，不截断。
- 自动插图楼层读写、生成事件订阅及 `[igs-img]` 标记对外隐藏（`illustration-message-host.js`）。
- 自动插图 `writeFloor(messageId, text, expectedFloor)` 写回前复核聊天、楼层、swipe、最新 AI 身份与原文；发生变化返回 `stale`，不写入。宿主 API 未提供原子条件写入，复核与实际调用之间的极窄竞态仍需真机验证。
- 提供 `typeIntoInputAndSend(text)`，供阅读器输入框和选项浮窗调用。
- `input-channel.js` 是输入框发送的默认骨架入口。
- `magic-wand-entry.js` 是酒馆魔法棒菜单入口的唯一实现，负责向 `#extensionsMenu`、`#extensions_menu`、`.extensions_block .list-group` 注入 `Immersive Galgame System` 菜单项；入口保留原版书本图标和单入口魔法棒契约。
- `extension-panel.js` 在扩展设置面板（`#extensions_settings2` 等锚点）挂 inline-drawer 抽屉，提供启用魔法棒开关与打开设置/打开阅读器快捷入口。
- 酒馆助手 QR 按钮入口由 `loader/igs-loader.js` 负责：按钮名固定为 `Gal模拟`，点击通过宿主 `eventOn(getButtonEvent('Gal模拟'))` 委托公开 API 打开最新阅读器；该入口不使用自定义 CSS，也不承载业务逻辑。
- 入口启用状态由 `bridge.entry = { magic }` 驱动（默认 magic:true）；魔法棒由 bootstrap attach/destroy。
- 隔离宿主 DOM 选择器变化，避免其它模块直接依赖 `#send_textarea`、`#send_but` 等选择器。
- 提供 `setInputText(text)` 只填入酒馆默认输入框，以及 `typeAndSend(text)` 填入并发送；内嵌阅读器不得维护第二套发送框。
- `fillEmptyInputText(text)` 默认保留只填空输入框的调用契约；地图和物品显式传入 `{ append:true }`，读取酒馆真实草稿后追加纯文本命令，保留已有内容并触发输入事件。`appendInputDraft` 统一命令拼接和续接防重复；读取暂时失败由原操作恢复，不发送消息，不改变 `setInputText` / `typeAndSend` 的调用语义。
- `chat-stream-observer.js` 在五种阅读器模式打开时观察阅读器实际挂载文档的 `#chat`，不得观察整个 document 或按固定间隔扫描正文。`onActivity` 按 `activityThrottleMs`（默认 150ms）首尾节流：首批变更立即回调，窗口内其余合并为窗口末一次；稳定 / 空闲判定仍按每批变更重置，`stop` / `cancelPending` 清掉节流定时器。
- 酒馆 `GENERATION_STARTED / GENERATION_ENDED / GENERATION_STOPPED` 是流式起止主信号；DOM 静默窗口仅作兼容兜底。非流式生成可通过启动后有界探测宿主停止按钮来报告活动，不必等整段正文写入；代写不走该探测，过期 revision 不触发载入。
- `GENERATION_STARTED` 的 `dryRun === true` 与 `type === 'quiet'`（非 `quietToLoud`）是插件后台请求/提示词组装，不得武装载入态；quiet 的结束和 IGS 自身后台生成的结束也不能完成前台等待。
- 静默和 120s 无活动超时不代表完成：后者仅调用 `onTimeout` 提醒，不解除观察；每批外部活动重置时限。完成需要结束事件，或宿主停止按钮已收起且有生成/回复活动证据、静默满 10s。停止按钮仍显示时不收尾，按钮不可读取不能推断已结束。
- `onStable({ reason, revision })` 只在完成信号和稳定窗口后调用；`reason` 区分 ended、stopped、failed（失败事件仅在宿主暴露该 eventType 时订阅）。每批写入、生成起止和取消更新 revision，异步读完后用 `isCurrentRevision` 丢弃过期结果；停止后再发 ended 不覆盖 stopped。
- 流式 mutation 只同步载入状态与最新 AI 楼层挂载，不在 token 回调中解析正文或扫描图片；生成结束后一次性换源。
- 标签语法注入（`prompt-injector.js`，由 `core/bootstrap.js` 的 `syncSceneAssetsInjection` 驱动）：`bridge.sceneAssets.promptPlacement` 默认 `system`，主规则以 `IN_PROMPT` 写入 `igs-scene-assets-format-rule`（相对静态、可命中前缀缓存），本轮提醒与按需展开的块、交互摘要以 `IN_CHAT` depth 0 写入 `igs-scene-assets-depth0`；`depth0` 为旧行为，两段合并成一条 `IN_CHAT` depth 0。`bridge.sceneAssets.promptEntries.<块>.position/depth` 写了位置的条目不走上述两段，按位置与深度（system 为 IN_PROMPT，depth0 / depth 为 IN_CHAT，深度即 @D）分段，位置与深度相同的合并为一段，key 为 `igs-scene-assets-entry-system|depth0|d<N>`。`clear()` 清掉以上全部 key。酒馆助手回退只有聊天内位置，始终合并。`bridge.sceneAssets.promptRuleEnabled === false` 时主规则不含【场景与台词】块（用户改由酒馆预设提供），其余已开启的语法块照常注入，都没有时两个 key 都清掉。
- `bridge.sceneAssets.promptAdaptive` 默认开：`GENERATION_STARTED` 时按本轮上下文（`prompt-context.js`：最近 12 层 AI 正文、输入框或最近一条用户消息、角色卡名与群聊成员）重算，`impersonate` / `quiet` 生成期间清空，`GENERATION_ENDED` / `GENERATION_STOPPED` 与换聊天时恢复；预算上限约 1500 token，按「场景 > 文字演出 > 演出 > 物品 > 聊天 > 日常 > 战斗 > 亲密」填入，超出的块降级为索引行。关闭时按旧版全量拼接（未自定义的场景规则用 V3 长版原文），与改版前逐字一致，代写与静默生成也不清空。

## 输入发送契约

- 写入酒馆输入框。
- 触发 `input` / `change` 等必要事件。
- 再点击发送按钮或调用等价宿主行为。
- 不直接创建聊天消息，避免绕过 shujuku 剧情推进。

## 禁止

- 禁止业务模块直接扫全局 DOM 发送消息。
- 禁止绕过 `magic-wand-entry.js` 在其它模块重复注入魔法棒入口。
- 禁止在 host 层修改 shujuku 表格数据。
- 禁止吞掉宿主错误；必须向 `actions` 或 `visual` 返回可展示错误。
