# host 模块契约

## 职责

- 适配 TavernHelper、SillyTavern DOM 和酒馆魔法棒菜单。
- 统一定位聊天楼层、当前楼层、输入框、发送按钮和消息图片。
- 提供 `typeIntoInputAndSend(text)`，供阅读器输入框和选项浮窗调用。
- `input-channel.js` 是输入框发送的默认骨架入口。
- `magic-wand-entry.js` 是酒馆魔法棒菜单入口的唯一实现，负责向 `#extensionsMenu`、`#extensions_menu`、`.extensions_block .list-group` 注入 `Immersive Galgame System` 菜单项；入口保留原版书本图标和单入口魔法棒契约。
- `extension-panel.js` 在扩展设置面板（`#extensions_settings2` 等锚点）挂 inline-drawer 抽屉，提供启用魔法棒开关与打开设置/打开阅读器快捷入口。
- 酒馆助手 QR 按钮入口由 `loader/igs-loader.js` 负责：按钮名固定为 `Gal模拟`，点击通过宿主 `eventOn(getButtonEvent('Gal模拟'))` 委托公开 API 打开最新阅读器；该入口不使用自定义 CSS，也不承载业务逻辑。
- 入口启用状态由 `bridge.entry = { magic }` 驱动（默认 magic:true）；魔法棒由 bootstrap attach/destroy。
- 隔离宿主 DOM 选择器变化，避免其它模块直接依赖 `#send_textarea`、`#send_but` 等选择器。
- 提供 `setInputText(text)` 只填入酒馆默认输入框，以及 `typeAndSend(text)` 填入并发送；内嵌阅读器不得维护第二套发送框。
- 地图独用 `fillEmptyInputText(text)`：必须读取酒馆真实草稿，只有确知为空才纯文本填入并触发输入事件；非空、不可读取或失败均返回诊断，不改变原 `setInputText` / `typeAndSend` 调用语义。
- `chat-stream-observer.js` 只在楼层内嵌阅读器打开时观察阅读器实际挂载文档的 `#chat`，不得观察整个 document 或按固定间隔轮询。
- 酒馆 `GENERATION_STARTED / GENERATION_ENDED / GENERATION_STOPPED` 是流式起止主信号；DOM 静默窗口仅作兼容兜底。
- 流式 mutation 只同步载入状态与最新 AI 楼层挂载，不在 token 回调中解析正文或扫描图片；生成结束后一次性换源。

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
