# scene 模块契约

## 职责

- 维护当前场景状态：楼层、说话人、情绪、正文、时间、天气、地点、背景、立绘、生图状态。
- 从楼层正文、时空栏正则预设和 shujuku 数据中解析场景上下文。
- 输出给 `visual` 的稳定 scene model。
- 检测生图段出现和消失，给 `visual` 输出对应显示策略。
- 根据时间、天气、地点输出背景规则和环境效果候选。
- 按句分页启用时，场景指令索引必须重映射到最终可见分页坐标，不得沿用分页前的原始行号计数。
- HTML 卡片（`html-cards.js`）：`bridge.sourceFilter.htmlCardTags`（默认 `htm1fenge`）命中的整块在一切正文处理前从原文抠出，原位换成独占一行的 `[igs-card#N]`，单独成页；占位不得写成 `[key:value]`（会被 `parseSceneText` 当场景标签吞掉）。未闭合块（流式中）同样占位。payload 以 `htmlCards[N]` 携带原始 HTML，渲染由 `visual/igs-ui/html-card-layer.js` 消毒后放入 Shadow DOM。
- `[igs-img:N]` 只由插件写入；原文保留标记以定位插图，显示正文与主模型上下文隐藏标记。解析时记录原文偏移，不计入 scene/char/thought 的可见段索引；新场景指令终止此前插图。
- igs 行内指令名只在 `scene/directive-tags.js` 登记（scene/char/thought/img/fx）；分段、正文清洗、DOM 对比与聊天块收口的正则都从这里构造，新增指令不得再复制正则。
- `[igs-fx:类型|参数…]` 为演出标签族（call/call-end、notify、flashback/flashback-end、dream/dream-end、letterbox/letterbox-end、sfx、eye），由 `scene/fx-directives.js` 解析；未知类型或参数不合法时静默剥离，永不进入正文。瞬时标签按原文偏移归属到 (上一可定位页, 当前页] 区间，每页同类只取第一个；区间状态取当前页前最近一次开/关，缺结束标签时持续到楼层结束。显式聊天块内的 fx 行移到块前。
- `dream/dream-end` 是区间型梦境标签，语义与回忆区间相同但视觉由蓝紫低饱和柔雾、柔光和轻微漂移组成；未知类型仍静默剥离，不进入正文。

- 素材匹配分级（`scene-directives.js` 的 `classifySceneKey`）：exact / alias / fuzzy-strong / fuzzy-weak / none，「默认」兜底记为 default。
- 立绘情绪匹配分级（`lookupSceneAssetUrls` 的 `spriteQuality`）：exact（槽位名）/ group（组词）/ fuzzy / default / none。fuzzy 仅在 `bridge.sceneAssets.moodFuzzyMatch` 开启（默认关）时启用，由 `mood-groups.js` 的 `fuzzyResolveMoodGroup` 判定：只认在整个词库中只属于一组的字，跨组字忽略，有效字指向多组视为冲突不命中。词库外的情绪词（fuzzy / default / none 且不在任何组）记入 `mood-review-store.js`（localStorage `igs:mood-review:v1`，按词去重、最多 50 条，不进设置与场景预设），供设置页「待确认情绪词」一键入组；可删除条件：情绪词改为由模型严格从固定池输出且不再出现池外词。
- `asset-match.js` 决定背景 / 立绘取哪一区：用户上传区 → 生成区素材库（`bridge.sceneAssets.generated`）→ 本聊天临时生成素材 → 占位；「精准生图优先」下弱模糊与默认只当占位并触发生成。生成区图片地址统一为 `igs-gen:<imageId>`，由调用方解析。

## 场景来源优先级

1. 当前楼层正文显式标签或正则解析结果。
2. shujuku 数据库中的时间、天气、地点、角色状态。
3. 上一轮场景状态。
4. 默认场景。

## 禁止

- 不直接渲染 DOM。
- 不直接调用生图 API。
- 不直接发送用户输入。
