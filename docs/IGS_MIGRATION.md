# Immersive Galgame System 迁移说明

本文件记录 `Immersive Galgame System v9.6.6` 到 IGS 的分阶段迁移面，避免后续重构时一边搬代码一边猜行为。

## 当前参考源

- 原版项目逻辑参考：`D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System 原版备份`
- 本轮实际对照源优先使用这些文件：
  - `Immersive Galgame System/tavern helper/bridge/src/source.js`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/reader/original-reader.js`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/settings/shell.html`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/settings/style.css`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/settings/tabs/basic.html`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/settings/tabs/regex.html`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/settings/tabs/image.html`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/settings/tabs/reader.html`
  - `Immersive Galgame System/tavern helper/bridge/src/ui/shared/icons.js`

## 原版公开 API

`source.js` 中的兼容面：

```text
openSettings()
getConfig()
getUnifiedSettings()
openViewerFromMessage()
openLatestAvailable()
generateImage()
destroy()
```

## 原版旧存储键

```text
igs_bridge_config
igs-reader-settings-v9-pc
igs-reader-settings-v9-mobile
igs-reader-settings-v9-web
igs-reader-settings-v9-fullscreen
igs-display-mode
```

## 第一阶段目标

- 在 `window.IGS` 上保留同名兼容方法。
- 支持只读读取旧 `igs_*` 配置。
- 用 fixtures 和 `npm run gate` 固化兼容行为。
- 不直接迁移完整阅读器 DOM。
- 不修改原版 `Immersive Galgame System` 项目。

## 第一阶段不做

- 不挂载 `window.ImmersiveGalgameSystemBridge` 旧全局别名。
- 不实现真实设置面板。
- 不实现真实 provider 请求。
- 不恢复完整上一轮/下一轮、楼层图片缓存和阅读器 UI。

## 第二阶段已接入

- `app/src/visual/reader-state.js`：把 reader mode、legacy reader settings、viewport 和 `data-igs-*` / `--igs-*` 桥接字段归一化。
- `app/src/visual/stage-model.js`：把 scene 转成稳定槽位的 stage model，供 style contract 和模拟测试直接校验。
- `app/src/visual/stage-renderer.js` 与 `app/src/visual/layer-controller.js`：渲染结果不再只透传 scene，而是返回包含 `stage`、`renderedLayers` 的可测试结构。
- 当前仍不迁移原版完整阅读器 DOM；第二阶段的目标是先固定 reader state 与视觉槽位边界。

## 第三阶段已接入

- `app/src/presets/text-presets.js`：补上 `text-filter-preset`、`text-format-preset`、`scene-regex-preset` 的运行时 normalizer 和坏正则校验。
- `app/src/scene/text-pipeline.js`：新增正文过滤、正文格式化和 scene regex 串联管线，坏正则只写入 `textPipelineErrors`，不让 `refresh()` 抛出。
- `app/src/scene/text-parser.js` 与 `app/src/core/bootstrap.js`：`refresh()` 现在可接收三类正文预设，并把 `textSource`、`formattedText`、`sourceKind`、`formatSourceKind` 等 metadata 带入 scene。
- `app/fixtures/text/*` 与对应 gate：用 fake TavernHelper message 固定 `<content>` 标签过滤、Bubble 文本格式化和 scene regex 字段提取，不迁移原版 DOM 图片探测或完整阅读器句子切分。

## 第四阶段已接入

- `app/src/visual/igs-ui/original-reader-source.js`：固定原版阅读器 overlay 的 HTML/CSS/selectors 契约，保留 `#igs-overlay`、`.igs-dialog`、`.igs-ctrl-bar`、`#igs-input`、`#igs-send-btn`、`#igs-settings`、`#igs-toast` 等结构。
- `app/src/visual/igs-ui/settings-shell.js`、`settings-style.js`、`settings-tabs.js`、`icons.js`：拆出原版统一设置面板的 shell、样式、四个 tab 模板和 reader mode 图标，作为 IGS 内部的原版 UI 等价层。
- `app/src/visual/igs-ui/reader-host.js`：提供浏览器真 DOM 挂载和 Node snapshot/controller 双轨宿主，接通 `openSettings()`、`openLatestAvailable()`、`openViewerFromMessage()` 与 `typeAndSend()` 的最小闭环。
- `app/src/storage/legacy-igs.js`：从只读旧 `igs_*` 存储升级为读写兼容，统一设置面板即时保存后会同步回写旧 key。
- `app/fixtures/igs-ui/*` 与对应 gate：新增原版阅读器 selector/几何快照、统一设置面板 tab/字段/动作快照，以及 `Enter` 发送 / `Shift+Enter` 不发送的模拟验收。

## 第四阶段仍不做

- 不接真实 NAI/provider 网络请求，只走 fake provider / fake 检测结果。
- 不把 `window.ImmersiveGalgameSystemBridge` 旧全局别名重新挂回。
- 不做真实酒馆 DOM 实机验真；本轮验收继续以 `npm run gate` 的模拟测试为准。
