# 交接说明：漫画演出重做与性能优化（2026-09-28）

新窗口的主 Agent 请先读完本文件，再读 [perf-audit.md](perf-audit.md)。

## 项目

- 路径：`G:/奶龙Code/gal/Immersive-Galgame-System-AnyNo001/app`。这个目录不是 git 仓库，改动之前没有提交记录可以回退。
- 项目是一个 SillyTavern 沉浸式 galgame 阅读器插件，用原生 JS 写，没有框架。
- 样式以字符串形式注入，主要在 `src/visual/igs-ui/*-style.js`、`original-reader-source.js` 和 `dialog-theme-*.js` 里。
- 门禁：`npm run gate`，依次跑结构检查、静态检查、单元测试（402 项）、模拟（135 项）、性能冒烟和构建。**交接时全部通过。**
- 代码风格：注释用中文，只写「为什么」；新代码要和周围的写法保持一致。

## 用户偏好

- 用中文沟通。
- 审计类工作**不要自己派子代理**：写成任务文档交给用户，由用户手动派发。
- 保留同一页重渲染时的重复震屏。这是用户明确要的效果，不要当成问题修掉。
- 做全屏演出时临时关掉毛玻璃，用户可以接受。

## 已完成的工作

### 漫画演出视觉

- 新增 `src/visual/igs-ui/fx-symbols.js`：
  - 7 种符号改成内联 SVG 贴纸（白边、墨线、高光，部件分开做动画）。「阴沉」改成波浪黑线。
  - `pickFxAccent(theme)`：从主题色里取最鲜艳的一个，只保留色相，再提成鲜亮的 `hsl(h 88% 60%)`。主题整体偏灰时返回空串。
  - `speedLinesImage` 和 `warmSpeedLines`：离屏把速度线画一次并缓存成图片；空闲时预先生成。
- `fx-style.js` 的配色规则：
  - 符号主色 = 各符号固有色 74% + 主题强调色（oklab 空间混合）。
  - 主题强调色 `--igs-fx-pop` 用在冲击线、小爱心和小星星、对话泡底色上。
  - 用 oklch 混色时，色相会跑偏（比如爱心变成橙色），所以没有采用。
  - 黑白漫画皮肤强制黑白。
- 睁眼效果：眼睑边缘改成平缓的弧线并做羽化，节奏是「睁开一条缝 → 眯回去 → 完全睁开」，时长 1.6s；闭眼改成合拢式。
- `reader-dom-render.js` 把 `theme: resolveActiveTheme(snapshot)` 传给 `applyFxToDom`。

### 性能

- `fx-runtime.js`：
  - 翻页时清理上一页的演出（`clearTransients`）。
  - 速度线、心跳、睁眼播放期间，以及开着回忆滤镜时，给舞台挂上 `data-igs-fx-busy`，样式据此暂停毛玻璃。
  - 符号的位置推迟到下一帧再计算。
  - 常驻节点只在值变化时才写入。
- `fx-style.js`：
  - 去掉了全局 `will-change`。
  - 电影黑边改用 `scaleY` 动画。
  - 回忆滤镜去掉了滤镜过渡，并通过 `--igs-bg-brightness` 叠加在用户设置的亮度上，不再覆盖。
- `fx-anchor.js`：立绘加载失败的结果也缓存下来，解码改成异步（`img.decode()`）。
- `stage-shake-runtime.js`：只认舞台自身的 `animationend`，防止符号动画结束时误把震屏也结束掉。
- 新增 `reduced-motion.js`：「减少动态效果」的查询只建一次，5 个模块共用。
- `reader-dom-render.js`：状态栏按内容签名跳过重建（`statusHudKeys`）。
- `reader-host.js`：图片轮询只在拿到新地址时才重渲染（`previousUrl`）。
- `host/chat-stream-observer.js`：先做廉价的「是否在生成中」判断，不是就直接返回。
- `host/magic-wand-entry.js`：跳过 `#igs-overlay` 内部的 DOM 变动。

### 新增测试

- `tests/fx-runtime.test.js`：
  - 翻页后清理上一页的演出
  - busy 标记的开启和关闭
  - 符号 SVG 与主题强调色
  - 加载失败的探测不会重试
- `tests/stage-shake-runtime.test.js`：冒泡上来的 `animationend` 不会结束震屏。

## 待办

1. **全插件性能审计**：任务书在 [perf-audit.md](perf-audit.md)，分为 A、B、C、D 四个任务，由用户手动派发。拿到审计结果后，由主 Agent 核实并落地修复。
   - 建议的优先顺序：
     - D1：字体。圆体每个字重约 19MB，文楷约 25MB，都没有 `unicode-range` 分片。
     - D3：chami 图源的 blob URL 泄漏（`generated-images/providers/chami-provider.js` 第 118 行）。它可能导致上面「地址不变就不重渲染」的修复失效。**已修复，见 perf-audit.md 的处理记录。**
     - D2：打包产物里约 1.7MB 内联的 base64 PNG。
     - 然后是 A 和 B。
2. **还没在真机上验证**：本轮只看了截图，也跑了门禁，但没有测过帧率。可以请用户在常用设备上开启演出翻页，看卡顿有没有改善。
3. **兼容性**：`color-mix()` 需要 Chrome/Edge 111+ 或 Safari 16.2+。如果用户反馈符号没有颜色，考虑加回退方案。

## 预览工具

- 目录：`../.tmp/fx-preview/`，位于 app 的上一级。
- 启动预览服务：`node server.mjs`，端口 8766。
- 截图：`PAGE=<页面> sh shot.sh <输出名> "<查询参数>" <宽> <高>`，使用无头 Edge，截图输出到 `out/`。
  - `gallery.html`：符号 × 主题的对照矩阵，加上速度线和睁眼效果。参数 `t` 控制符号动画停在第几秒，`eye` 控制睁眼动画停在第几秒。
  - `preview.html`：按立绘头部定位的实际效果，参数有 `kinds`（表情列表）、`w`、`h`、`s` 等。注意：每个表情会被当成一次翻页，所以截图里只会留下最后一个符号。
