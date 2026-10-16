# v0.23.32 性能审计汇报

**依据**：`.limcode/plans/v0.23.32-楼层内嵌阅读器与轻量化.md`。本报告只记录已读代码和实际命令结果，不把推测写成结论。

## 结论

阅读器翻页缓存已接入，但计划要求的解析次数门禁尚未纳入性能冒烟；版本整体仍处于“回归、性能门禁、构建发布和真实酒馆终验”未闭环状态。当前 `npm.cmd run perf` 通过：总冒烟 **2.89ms < 500ms**，地图生成 **398ms < 1500ms**。

## 高风险

- **H1 Blob URL 可能泄漏** — `src/generated-images/providers/chami-provider.js:118–123`：`recordImageUrl()` 每次对 Blob 调用 `URL.createObjectURL(data)`，该模块未见对应 `revokeObjectURL` 或按图片 ID 复用。若图片轮询重复进入，将累积图片内存并使地址变化持续触发重渲染。**修复**：按图片 ID 缓存 URL，替换/清理时释放旧 URL；补轮询次数、URL 数量和释放断言。调用频率仍需真实路径验证。

## 中风险

- **渲染仍存在重复 DOM 写入** — `src/visual/igs-ui/reader-dom-render.js:921,971,995,1012`：每次渲染直接写 `root.className`、背景图和立绘相关内联样式。即使值未变，也可能触发样式失效、重绘或资源处理。**修复**：统一“先比较、后写入”，并用 Performance 面板录制翻页、状态回调和图片完成场景。
- **实时正文读取仍在每次重渲染路径** — `src/visual/igs-ui/reader-host.js:1337–1356`：`rerenderActiveReader()` 每次先调用 `readLiveVisibleText()`，随后构建 snapshot；长楼层下可能重复读取/复制消息 DOM。**修复**：按消息 ID + 内容指纹缓存，只在宿主回写或显式刷新后重新读取。

## 低风险/已落地项

- **阅读源缓存已接入** — `reader-host.js:110,213–214,1794–1795` 使用 `createReaderSourceCache`，命中后复用解析结果；销毁时在 `568–570` 失效。**但**当前 `scripts/perf-smoke.js` 仅覆盖规则匹配、队列、响应式布局和地图生成，未证明“同消息连续翻页只解析一次”。

## 未闭环与下一步

尚无本轮 `test`、`simulate`、`gate`、`build:loader` 或真实酒馆结果；计划中的发布、远端一致性和标签验收不能宣称完成。下一步应先把 reader cache 的“解析次数 + LRU 上限 + 正文变更失效”加入 `perf-smoke.js`，再逐条执行计划要求的回归与构建门禁，最后补真实宿主观察。
## 处理记录（2026-09-28，主 Agent 核实后落地）

- **H1 已修复**：`chami-provider.js` 按图片 ID 缓存 blob URL，内容指纹（大小 + 类型）不变时复用同一个地址；同一 ID 换图或超过 48 条时释放旧地址。已确认原问题会让图片轮询每一轮都判定「地址变化」并整页重渲染。测试：`unit.test.js` 中的 `chami-provider-reuses-blob-url-per-image-and-revokes-replaced`。
- **重复 DOM 写入已修复**：`applyReaderSnapshotToDom` 先算出最终类名，与现值不同才写入；原先「整串覆盖后再 toggle」的写法每次都会先删掉再加回 `igs-default-reader-chrome`、`igs-scene-nsfw` 等类。`#igs-bg`、`#igs-bg-blur`、`#igs-sprite` 的 `backgroundImage` 改为同值跳过，避免数 MB 的 data: URL 被反复解析。测试：`simulate.test.js` 中的 `page-turn-skips-unchanged-root-class-and-background-writes`。修复前，翻 3 页会让类名实际变更 10 次、背景图各重写 5 次；修复后都是 0 次。
- **实时正文读取已优化**：`readLiveVisibleText` 以同一节点加 `textContent` 作为指纹，指纹不变就复用上次结果，不再每次翻页都深克隆整条消息 DOM。宿主（如 Veridis）回写正文时，`textContent` 一定会变，所以仍能读到最新文本。测试：`simulate.test.js` 中的 `page-turn-reuses-live-visible-text-until-host-rewrites-it`。
- **阅读源缓存已纳入性能冒烟**：`perf-smoke.js` 使用真实的 `buildIgsTextPayload` 解析 400 句的长楼层，断言 200 次翻页只解析 1 次、正文改写后重新解析、38 个楼层之后缓存仍不超过 LRU 上限。
- **门禁**：`npm run gate` 全部通过（单元测试 411 项、模拟 137 项；perf 2.04ms，map-gen 345ms，reader-source 98ms；build ok）。
- **仍未闭环**：没有做真机帧率和 Performance 面板录制，也没有执行 `build:loader` 和真实酒馆终验。
