# scene 模块契约

## 职责

- 维护当前场景状态：楼层、说话人、情绪、正文、时间、天气、地点、背景、立绘、生图状态。
- 从楼层正文、时空栏正则预设和 shujuku 数据中解析场景上下文。
- 输出给 `visual` 的稳定 scene model。
- 检测生图段出现和消失，给 `visual` 输出对应显示策略。
- 根据时间、天气、地点输出背景规则和环境效果候选。
- 按句分页启用时，场景指令索引必须重映射到最终可见分页坐标，不得沿用分页前的原始行号计数。
- HTML 卡片（`html-cards.js`）：`bridge.sourceFilter.htmlCardTags`（默认 `htm1fenge`）命中的整块在一切正文处理前从原文抠出，原位换成独占一行的 `[igs-card#N]`，单独成页；占位不得写成 `[key:value]`（会被 `parseSceneText` 当场景标签吞掉）。未闭合块（流式中）同样占位。payload 以 `htmlCards[N]` 携带原始 HTML，渲染由 `visual/igs-ui/html-card-layer.js` 消毒后放入 Shadow DOM。
- `[igs-img:N]` 只由插件写入；原文保留标记以定位插图，显示正文与主模型上下文隐藏标记。解析时记录原文偏移，不计入 scene/char/thought 的可见段索引。当前页按 `resolveHeldSourceOffset` 从第一页往后定位（只在 `<content>` 正文里找，对不上时沿用前一页的位置），再由 `resolveIllustrationAtSourceOffset` 取该位置之后最近的一张（`[igs-img:N]` 与数据库 `<IMG>N</IMG>` 同规则），翻过最后一张后保持最后一张。阅读器经 `resolveIllustrationForPage` 按页分流：NSFW 页（本楼无场景标签时沿用上一楼）走上述整楼规则，只被下一张替换（已翻过的 NSFW 图转到 SFW 场景也保持）；SFW 页从标记前一页（锚句所在页）切入，不提前显示，至少停留 `readerSettings.cgHoldPages` 页（默认 4），之后本段未开口的角色说话即退场，最长两倍页数，换地点/时段或下一张标记也结束当前 CG，退场后恢复背景与立绘。
- igs 行内指令名只在 `scene/directive-tags.js` 登记（scene/char/thought/img/fx）；分段、正文清洗、DOM 对比与聊天块收口的正则都从这里构造，新增指令不得再复制正则。
- `[igs-fx:类型|参数…]` 为演出标签族（call/call-end、notify、flashback/flashback-end、dream/dream-end、letterbox/letterbox-end、sfx、eye），由 `scene/fx-directives.js` 解析；未知类型或参数不合法时静默剥离，永不进入正文。瞬时标签按原文偏移归属到 (上一可定位页, 当前页] 区间，每页同类只取第一个；区间状态取当前页前最近一次开/关，缺结束标签时持续到楼层结束。显式聊天块内的 fx 行移到块前。
- 弹幕标签（`DANMAKU_TAG_KINDS`）独立于 FX_TAG_KINDS，开关归 `liveFx` / `audienceFx`：`live|主播|标题|视角`…`live-end` 为直播区间（视角写 主播 为 host，其余 watch），结果在 `live`；`dm|观众|内容|类型|附加` 为直播弹幕（类型 醒目留言/礼物/上舰/进场/房管 → sc/gift/guard/enter/admin，写错按 text），每页最多 12 条进 `dms`；`danmaku|甲/乙|样式` 为观众弹幕（样式 scroll/top/flood/color），每页最多 4 个进 `danmaku`。直播属现代专属（`FX_ERA_MODERN_FEATURES`），按需注入块 `live` 由直播相关词或未闭合的 live 触发。
- `dream/dream-end` 是区间型梦境标签，语义与回忆区间相同但视觉由蓝紫低饱和柔雾、柔光和轻微漂移组成；未知类型仍静默剥离，不进入正文。

- 素材匹配分级（`scene-directives.js` 的 `classifySceneKey`）：exact / alias / fuzzy-strong / fuzzy-weak / none，「默认」兜底记为 default。
- 立绘情绪匹配分级（`lookupSceneAssetUrls` 的 `spriteQuality`）：exact（槽位名）/ group（组词）/ fuzzy / default / none。fuzzy 仅在 `bridge.sceneAssets.moodFuzzyMatch` 开启（默认关）时启用，由 `mood-groups.js` 的 `fuzzyResolveMoodGroup` 判定：只认在整个词库中只属于一组的字，跨组字忽略，有效字指向多组视为冲突不命中。词库外的情绪词（fuzzy / default / none 且不在任何组）记入 `mood-review-store.js`（localStorage `igs:mood-review:v1`，按词去重、最多 50 条，不进设置与场景预设），供设置页「待确认情绪词」一键入组；可删除条件：情绪词改为由模型严格从固定池输出且不再出现池外词。
- `asset-match.js` 决定背景 / 立绘取哪一区：用户上传区 → 生成区素材库（`bridge.sceneAssets.generated`）→ 本聊天临时生成素材 → 占位；「精准生图优先」下弱模糊与默认只当占位并触发生成。生成区图片地址统一为 `igs-gen:<imageId>`，由调用方解析。
- 场景时段：查 `times` 依次按 精确名 → 时段组 → 四档（`time-bucket.js`：清晨/白天/黄昏/夜晚，深夜并入夜晚）兜底。已登记（exact/alias/fuzzy-strong）且主图是 `igs-gen:` 的场景缺当前档时，`resolveBackgroundAsset` 返回 `timeVariant`，补图服务按原图存下的提示词换时间标签直接出图（不写词、不走副 LLM），记成本聊天的待确认背景（`variantOf` 指向原图），确认后写进该场景 `times`。本聊天同场景同档只补一次（含失败、丢弃、原图本就是该档的 `skipped`）；手动上传的场景不补，天气不参与；跟随「自动补背景」开关。
- 角色 DNA（`character-dna.js`）：`bridge.sceneAssets.characterDna = { 主名: { identity, defaultAppearance, negative, triggerWords } }`，与情绪槽映射 `characters` 并列、互不混入。键为主角色名；查询先经既有别名归约（`resolveCharacterKey`）再取主名记录，不维护第二套身份解析。规范化只保留四个文本字段并拒绝原型污染键，空记录保留（DNA-only 角色）。角色改名保序迁移，目标名已有 DNA 时拒绝；删除角色时清理。场景预设保存/应用/导入/导出携带 `characterDna`，旧预设或导入文件缺该字段时保留当前 DNA、不清空。DNA 不代表已有立绘，不影响缺失立绘检测。
- 服装差分（`character-outfits.js`，v0.30.0）：`bridge.sceneAssets.characterOutfits = { 主名: { 服装名: { words: [服装词], moods: { 槽: url } } } }`，与 `characters`、`characterDna` 并列，别名经 `resolveCharacterKey` 复用主角色服装。规范化拒绝空名、含 `|` `]` 换行、保留字「默认」与原型污染键；同一角色内一个词只归一套服装（与服装名重复的词丢弃）；服装内不设「默认」槽。
- 服装栏：`[igs-char:角色|表情|服装|对白]` / `[igs-thought:角色|表情|服装|心里话]`，字段构造只在 `directive-tags.js`（`matchOutfitDirectiveAt` / `stripOutfitFields`），只在传入 resolver（场景素材模式，未登记任何服装时也传）时识别，未传时与旧版一致。第 3 栏三分：已登记服装名、词池词或保留字「默认」→ 服装；像服装名的短词（无空白与句读、≤12 字）→ 未登记服装：丢弃该栏、照常显示对白与原有立绘，指令带 `unknownOutfit`，阅读器记入 `outfit-review-store.js`（localStorage `igs:outfit-review:v1`，按角色 + 词去重、最多 50 条，不进设置与预设）供设置页「待确认服装词」归入或新建；三个本地 store（`scene-preset-store`、`mood-review-store`、`outfit-review-store`）写入失败时返回 `{ ok:false, reason:'store-write-failed', saveError }` 交给设置页提示，不再静默丢弃；渲染时记录待确认词仍不打扰；其余视为对白里的「|」，拼回对白。正文格式化与插图定位前先 `stripOutfitFields` 按同一规则改写为三栏，对白内残留的「|」显示为全角「｜」，只认三栏的格式化正则不会漏出服装名或把整句打成旁白。
- 服装取值（`resolveSpriteOutfit`）：① 本楼当前页原文偏移前该角色最近一次服装栏 → 跨楼 `payload.inheritedOutfits`（`api/igs-compat.js` 在既有 3 个 AI 楼层追溯窗口内汇总，不扩大窗口）；「默认」直接复位原有立绘，不再兜底；② 标签从未写服装时依次按服装名 / 词池匹配 `data/shujuku/outfit-clues.js` 给出的角色表「穿着打扮」等列 → 装备表正在穿戴的衣物 → `characterDna[主名].defaultAppearance`；③ 都未命中显示原有立绘。服装可选 `scenes`（适用场景，存场景主名）：最近一次场景标签之后本楼明确写出的服装照用；更早写的或跨楼继承来的服装若不适用当前场景（主名或原文写法）则失效，兜底也只在适用当前场景的服装里匹配；当前场景未知或服装未填场景时不限制。场景改名 / 删除经 `renameOutfitScene` 同步。表格读取由宿主层注入 `readClues`，场景层不访问宿主；读取失败返回原因并跳过 ②，不阻塞渲染。只读匹配，不回写标签、表格或 DNA。`matchOutfitByText` 不做单字匹配，同一来源多套等长命中视为冲突、交给下一来源。服装可选 `avatar`：状态栏说话人与立绘角色一致时优先显示服装头像，未设时沿用角色头像。
- 服装查图（`asset-match.js` 的 `resolveSpriteAsset(角色, 表情, ctx, 服装)`）：服装内 精确槽 → 情绪组 → 模糊（沿用 `moodFuzzyMatch`）→ 退回原有 `characters` 查表（含原有「默认」）；命中返回 `source: 'user-outfit'`。生成区与自动生图、缺失检测不含服装维度。
- 注入规则：`DEFAULT_SCENE_PROMPT_RULE` 为精简的【场景与台词】块（四栏语法、服装说明与 `{{outfit_groups}}`），通用标签规则由 `visual/igs-ui/tag-grammar.js` 统一写在最前。只有空值或逐字等于旧默认（V1 / V2 / V3）的规则自动升级，自定义规则原样保留，设置页在缺 `{{outfit_groups}}` 时提示一行。按需注入开启时词表走精简写法：表情池每组只列 3 个代表词（立绘建了槽位的词全部保留），场景只列主名，时间/天气/服装各限 400 字、超出写「等」；服装只列在场角色（角色卡名、群聊成员、最近 6 层正文与本轮输入里出现主名或别名），拿不到名单时退回全量。解析端不变：AI 写出词库里未列出的词照样按完整词库精确归组。
- 按需触发（`prompt-triggers.js`）：聊天、日常、战斗、亲密四块在最近 3 层出现对应标签、本轮用户输入命中触发词，或最近 12 层内有未闭合的成对标签时才发完整说明，否则只在索引行列出类型名。
- 在场名单只由 `stage-cast.js` 的 `resolveStageCast` 推断：纯函数，不读宿主、不读 DOM；换 `[igs-scene]` 清空，每层楼从空名单开始。
- 陪衬挑选由 `stage-cast.js` 的 `pickCastMembers` 负责：调用方以 `STAGE_CAST_SCAN_LIMIT`（6）宽扫名单，再按有无立绘跳过无图角色，凑满 `STAGE_CAST_MAX_SEATS`（3）减说话人即停止解析；窄屏上限仍由渲染层 `layoutCastSlots` 截断。无图角色不得占用同屏名额。
- 世界观（`worldview.js`）：`WORLDVIEWS` 为唯一注册表（modern / ancient / fantasy / scifi / apocalypse / taisho / magic 均已启用；`ready:false` 仍表示预留项，下拉中不可选、`applyWorldview` 拒绝写入），设置页一键档位条的「适配世界」下拉、`worldview:<id>` 动作与场景预设保存 / 应用 / 导入 / 导出只经 `resolveWorldview` / `applyWorldview` 读写，不直接碰存储字段。存储为枚举 `bridge.sceneAssets.worldview`，并同步写布尔 `ancient`（古代为 true，其余为 false）供既有消费方读取；读取时 `ancient: true` 优先按古代，`ancient` 为假时 `worldview: 'ancient'` 按现代，缺字段或未知值按现代。演出过滤与时代提示词由 `fx-era.js` 的 `applyFxWorldview` / `resolveWorldviewPromptRule` 负责（古代、现代与 `applyFxEra` / `ANCIENT_ERA_PROMPT_RULE` 逐值等价）；阅读器快照携带 `_worldview`，`_ancientEra` 保留。在现代结构上换皮的世界观统一登记在 `WORLD_SKIN_IDS`，演出 / 音效层只经 `worldSkinOf` 判断，不各自维护列表；新增世界观时先注册为 `ready:false`，补齐 `FX_WORLDVIEW_OFF`、时代规则、`fx-sfx` 的 `notify-<id>` 音色与 `fx-style` 的 `is-<id>` 换皮后再启用；日常（`fx-daily-style` 的 `is-<id>`）、物品（`data-igs-era="<id>"`）、战斗（`is-<id>`）、聊天（`data-igs-chat-world`）四类演出也各有一套样式分支，新增世界观须同步补齐，古代与现代不挂这些标记；世界观专属日常演出统一登记在 `FX_WORLDVIEW_ONLY`（古代 `FX_ERA_ANCIENT_ONLY`、魔法 `FX_MAGIC_ONLY`），当前世界观以外的表一律拨成关；未知 id 一律不改动。


## 场景来源优先级

1. 当前楼层正文显式标签或正则解析结果。
2. shujuku 数据库中的时间、天气、地点、角色状态。
3. 上一轮场景状态。
4. 默认场景。

## 禁止

- 不直接渲染 DOM。
- 不直接调用生图 API。
- 不直接发送用户输入。
