# host 模块契约

## 固定版本启动器（test-v0.36.66）

- 固定版 loader 的 tag 属于脚本内部常量，不允许页面残留的 `IGS_LOADER_REF`、配置 ref 或 base 改写。该版本失败明确报错，禁止请求 main 或其他版本。
- 只有已记录的来源 ref、base 与实际 API 版本均匹配时复用实例；来源未知或不匹配先等待现有 `shutdown()` 完成。关闭失败停止替换，不能让两个媒体所有者并存。
- 模块加载完成还要核实 API 的实际版本；返回错误版本时关闭该实例并报要求版本与实际版本，不把脚本 load 事件当作指定版本就绪。

## 副 LLM 转发（v0.36.58）

- 独立 OpenAI 兼容接口的模型列表与生成，分别 POST 到酒馆同源 `/api/backends/chat-completions/status` 和 `/generate`；使用宿主 `getRequestHeaders` 的 CSRF 头和当前酒馆会话，不向浏览器直连上游，也不依赖通用 `/proxy`。
- 两种请求均使用 `custom` 来源，地址和插件密钥通过请求内的 `custom_url/custom_include_headers` 传递，不更改主连接或酒馆密钥库。空密钥显式覆盖 Authorization，不能借用主连接密钥。
- HTTP 错误和 HTTP 200 的 `error` 响应都返回可展示失败；文案隐藏插件密钥。超时覆盖响应体读取并中止网络请求。宿主请求头不可用时明确报错，不退回跨域直连。

## 职责

- 适配 TavernHelper、SillyTavern DOM 和酒馆魔法棒菜单。
- 统一定位聊天楼层、当前楼层、输入框、发送按钮和消息图片。
- 副 LLM 请求（`secondary-llm.js`）。
- 自动插图楼层读写、生成事件订阅及 `[igs-img]` 标记对外隐藏（`illustration-message-host.js`）。
- 自动插图 `writeFloor(messageId, text, expectedFloor)` 写回前复核聊天、楼层、swipe、最新 AI 身份与原文；发生变化返回 `stale`，不写入。宿主 API 未提供原子条件写入，复核与实际调用之间的极窄竞态仍需真机验证。
- `illustration-message-host.on(eventKey, handler)` 同步调用内部处理后返回 `undefined`，内部 Promise 自行收尾；同步异常与异步拒绝只记录事件键，不进入宿主派发链。宿主继续向后续插件派发原参数，不用定时调度、不接管 `emit` 或重发事件。取消订阅仅移除本实例的包装监听器。自动插图与素材补全的事件处理器应返回内部任务 Promise，由此边界捕获失败。同步内部处理仍占用当前调用栈，不承诺在处理开始前通知完其它监听器；真实酒馆插件组合需现场复验。
- 提供 `typeIntoInputAndSend(text)`，供阅读器输入框和选项浮窗调用。
- `input-channel.js` 是输入框发送的默认骨架入口。
- `magic-wand-entry.js` 是酒馆魔法棒菜单入口的唯一实现，负责向 `#extensionsMenu`、`#extensions_menu`、`.extensions_block .list-group` 注入 `Immersive Galgame System` 菜单项；入口保留原版书本图标和单入口魔法棒契约。
- `extension-panel.js` 在扩展设置面板（`#extensions_settings2` 等锚点）挂 inline-drawer 抽屉，提供启用魔法棒开关与打开设置/打开阅读器快捷入口。
- 酒馆助手 QR 按钮入口由 `loader/igs-loader.js` 负责：按钮名固定为 `Gal模拟`，点击通过宿主 `eventOn(getButtonEvent('Gal模拟'))` 委托公开 API 打开最新阅读器；该入口不使用自定义 CSS，也不承载业务逻辑。
- 入口启用状态由 `bridge.entry = { magic }` 驱动（默认 magic:true）；魔法棒由 bootstrap attach/destroy。
- 隔离宿主 DOM 选择器变化，避免其它模块直接依赖 `#send_textarea`、`#send_but` 等选择器。
- 提供 `setInputText(text)` 只填入酒馆默认输入框，以及 `typeAndSend(text)` 填入并发送；内嵌阅读器不得维护第二套发送框。
- 地图独用 `fillEmptyInputText(text)`：必须读取酒馆真实草稿，只有确知为空才纯文本填入并触发输入事件；非空、不可读取或失败均返回诊断，不改变原 `setInputText` / `typeAndSend` 调用语义。
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
