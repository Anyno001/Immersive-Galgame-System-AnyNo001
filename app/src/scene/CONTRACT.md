# scene 模块契约

- 0.36.93：新生成基础立绘采用到 `moods.平和`，内置、外部、自动入库和手动生成遵守同一规则；临时生成库的平面角色槽也使用平和。衣装默认选择仍由 `characterDefaultOutfits` 记录。旧图迁移的 `base`、标定及明确编辑旧基础图的槽位独立保留；不能因沿用旧默认图或旧 DNA 就把新基础表情写回默认槽。

- 0.36.92：自动立绘采用把生成时保存的正文衣装名直接登记为角色命名衣装，外部完整词和旧 DNA 路径也适用。缺独立衣装 DNA 时保留空说明及角色独立衣柜键，不从完整绘图词拆猜衣装、不借用同名全局说明、不额外请求副 API；图片和首次默认映射同次保存，不再写旧默认槽触发“初始衣装”迁移。已有衣装及用户选过的默认沿原契约保留。

- 衣柜 `prompt` 保留完整服装母版，`promptHalfBody` 保存同一母版删减得到的半身视图；上下文与生成快照对应 `description`、`descriptionHalfBody`。旧字符串衣柜可读，缺半身字段的旧记录不在读取时迁移；成功写入才补齐。同母版只补缺失半身，不覆盖已保存母版或半身；图片引用、默认选择及其它条目保持。完整母版被编辑或重新生成时清除旧半身视图，下次立绘补齐；半身字段可从角色及衣柜入口编辑。

- 衣装采用按本图角色/命名衣装合并最新所属库，不比较角色全部衣装列表。同名同说明可复用，不重复创建衣柜条目；无关衣装新增、默认选择变化保留。曾用于本图的已保存说明被删除或修改才构成目标冲突，图片候选保留；发送快照、角色绑定与归属核验继续使用原契约。

- `prompt-triggers` 的纯关键词编译缓存命中时刷新 LRU，超出 64 项后复用 media 的低水位 helper 保留最近 51 项，不再整张清空。只回收可重编结果，不改变提示词、触发规则或输入字段。

- 素材包由 `asset-archive` 调用 media 的流式 ZIP 与原图端口；角色卡、素材预设保持 version 1 清单及旧小包互读。快照统一带 DNA、命名衣装、默认映射、种子、三类立绘备注、全部 generated 注记和标定。五类图片字段含一致性基线完整导出，服务端直链/旧内联图片转为包内记录；导入逐图恢复并重映射新 ID，避免复用旧设备的服务端路径。用户主动保存的命名预设保留续画注记，主配置的 expression-notes 文件卸载规则不变。

- `character-dna-preparation.js` 判断可选外部立绘建档的缺项，并校验独立副 API 候选。旧格式 DNA 不强升，已有景别与性格不覆盖，主动清空的身份不补回。`identitySource: secondary-api` 标识先于图片建立的身份；尚无角色图槽/衣装的新角色即使已存 DNA，出图失败后仍可自动补图，成功临时图继续抑制重复请求。
- 只有旧身份/触发词可复用为旧身份资料；仅衣装或负面词不代表已有身份。景别手动清空由 `clearedViews` 记录并归一化保存，负面词占位不阻止补缺；已有非空负面词与主体均不得被候选改写。
- `effectiveSceneAssets` 按角色整体选择本卡或全局。本卡在角色图、DNA、衣装、默认选择或生成图库中拥有同名角色时，其缺少的身份/衣装/别名/生成图与注记不从全局拼接；全局其他名字仍可使用。读取不修改原库。
- 命名衣装原图确认丢失时，`asset-match` 保留衣装名并标记需补图；临时读取异常、空衣装与无效默认映射不触发付费补图。采用外部恢复图写回原命名衣装，保持默认选择。

## 旧立绘自动迁移（0.36.88 本地草稿）

- `sprite-system-migration` 对全局及所有卡库分别规划纯数据迁移，由 core 经持久设置提交后启用。旧默认图独立存衣装 `base`，平和/其余表情不改名；默认自动指向同一套旧图，已选新默认不覆盖。旧生成槽同名不同图另存，所有引用保留。
- 自动默认映射的 `migrated: true` 保持旧 DNA 衣装线索的原显示优先级；明确选默认后移除此标记。旧 `resolveDna` 回调保留；version 2 不消费旧服装字段。
- 图片和 DNA 协议分别迁移；`legacyOriginal: 1` 仅标记旧注记归属，不代表三景别完备。位置/头部标定复用 scene 的 `sprite-key-migration`，同名角色跨库时复制各自衣装身份后再清旧键；重复执行幂等。
- `character-appearance` 统一解析命名衣装（包括没有默认映射但已明确指定的衣装），`base` 对普通衣装也有效，默认槽与平和槽保留各自标定。只有衣柜图而没有旧原装时，不猜测用户默认选择。
- 原装提升统一为设置默认，禁止搬回旧结构。保存失败不替换运行时，持久中断日志和旧续画资料备份的提交/恢复由 storage 管理。


## CG 跨场景切换（v0.36.75）

- NSFW 页只提前显示下一张属于 NSFW 场景的 CG，不提前取后续 SFW 场景的图。已翻过的 NSFW 图在转为 SFW 场景后保持，直到新的 SFW CG 锚句页接管；整楼预备和独立逐页解析遵守同一规则。本节优先于下文旧的整楼前瞻说明。

## CG 正文边界（v0.36.63）

- 闭合的 `thinking` / `think` / `Subtext_think` 整块屏蔽内部标签、括号与代码示例；其中未闭合的示例不能污染后续正文。代码与注释里的 `<content>` 示例不作为正文容器。
- `imageMarkerContentRanges` 保留原始字符偏移，每段真实 `<content>` 独立检查结构。容器外或另一段正文中的未闭合结构不得覆盖当前正文；当前正文内部真正未闭合的对白、HTML 与代码仍拒绝插图。

## 背景槽与补图兜底（v0.36.61）

- 同场景天气图 → 时段图 → 主图逐级选可用图片；空槽和已知不可用的内部图不得截断后续候选，回落主图时保持正确的 `timed` 标记。`lookupSceneBackground` 的可选第三参数只提供图片可用性判断，场景层不读图片、不发请求。
- 已登记空场景仍继续查同场景生成图库、当前聊天图和默认占位；默认占位不代表素材已经齐全，保留 `needsGeneration`。差分匹配读取临时记录的状态与跳过原因，手动或新楼可重试失败，明确丢弃仍跳过。

## 立绘读取与兜底（v0.36.59）

- 原装未命中后继续查同角色生成图库和当前聊天素材，角色已登记不能截断显示兜底；登记状态只在所有现成图均未命中后参与自动补图判断。角色主名与已登记别名保持同一身份，不借其他角色或未选服装。
- `isUnavailableImage` 只用于显示时跳过暂不可读的候选；`isMissingImage` 才表示确认缺图并参与补图判断。临时读取失败不得要求重新生图。已有原装可用时保持原有优先级。

## 跨行对白结构（v0.36.55）

- `directive-tags.js` 的 `normalizeClosedIgsDialogueLines` 先识别具有对应闭括号的 `igs-char` / `igs-thought`，将结构内部换行折叠为布局空白；`splitIgsDirectiveLines` 提供逻辑行及原始行号 / 字符偏移，正文、服装识别、指令提取与 CG 段落编号共用。
- 在对应闭括号之前遇到下一条角色、心理、场景、演出或聊天指令，或 `<content>` / `<now_plot>` 边界时，不借用后面的闭括号；未闭合标签继续按既有行尾收口规则处理，避免吞并旁白和下一角色。
- 指令提取保留原始字符偏移，空白行也计入坐标。已闭合对白、心理话在按句分页之前必须作为完整单元，分页后保持角色、情绪和服装归属，闭括号本身不成为可见页。
- 旧 CG 标记移出括号时清理其两侧连续的插入换行；原消息、图片槽号和图片绑定不修改。CG 重新规划及标记移植使用完整逻辑行作为上下文，不把独占行 `]` 作为锚句。

## 文字演出分页（v0.36.52）

- `text-fx-markup.js` 是九种 `{效果:文字}` 标记与半角 / 全角冒号的统一语法来源，正文分页与视觉渲染共用，不在场景层依赖渲染层。
- 按句分页完整消费已闭合、无嵌套的文字演出标记，不在标记内部断页；标记正文以句末符号结束时，在完整 `}` 之后断页，保留紧随的闭引号及译文。开关关闭时也保留结构，交给渲染层剥离已知标记。
- 原消息不改写；对白与心理话的说话人、后续场景指令索引继续按同一份分页结果重映射。未知与未闭合写法不吞后续行，渲染层原有长度、转义与未知效果规则保持。

## 立绘可用性（v0.36.51）

- `image-marker-layout.js` 统一决定生图标记的结构边界与独占行布局：完整括号结构、HTML 元素和代码块不可拆开；`<content>` 作为正文容器，标记保留在容器内。锚句所在整行保留，不在句子中间插入；同一结构上的多个生成点保留锚句顺序和槽号。
- 读取旧的错插 `[igs-img:N]` / `<IMG>N</IMG>` 时，只在阅读副本移出结构，去掉错误插入对白时产生的相邻换行；如果标记前后紧邻（可隔空行）独占一行、且不闭合任何括号的 `]`/`】`/`］`，也只在阅读副本剥掉该闭符，其他位置的独立括号不动。原消息 `raw` 不变，`markerLayoutSource` 为修正后的原文副本，阅读器定位服装、CG 和演出使用同一副本。重新规划旧楼也先整理标记再剥离，避免保留孤立闭括号。

- 原装及生成图库先保留既有精确 / 情绪组 / 可选模糊 / 同向档 / 默认顺序；全部未命中但同角色仍有可用图时，再选平和、最后选该角色其余可用槽，不跨角色或借其他服装。
- 已确认丢失的内部图先从候选中排除；内置裸体服装的底图丢失时不阻断同套平和 / 任意槽兜底。正常服装优先级保持不变。
- CG 标记只定位槽位，不能证明图片可显示；没有图片时阅读器保留正常背景和立绘，图片到达后再让位给 CG。

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
- 场景时段：查 `times` 依次按 精确名 → 时段组 → 四档（`time-bucket.js`：清晨/白天/黄昏/夜晚，深夜并入夜晚）兜底。已登记（exact/alias/fuzzy-strong）且主图是 `igs-gen:` 的场景缺当前档时，`resolveBackgroundAsset` 返回 `timeVariant`，补图服务按原图存下的提示词换时间标签直接出图（不写词、不走副 LLM），记成本聊天的待确认背景（`variantOf` 指向原图），确认后写进该场景 `times`。同楼重复通知不自动重发；失败可由手动补全或下一楼恢复，丢弃与已确认同档的 `skipped` 仍不自动重补；手动上传的场景不补，天气不参与；跟随「自动补背景」开关。
- 角色 DNA（`character-dna.js`）：`bridge.sceneAssets.characterDna` 以主角色名为键，与图片槽分离。旧 `identity/defaultAppearance/negative/triggerWords` 保留，新增 `personality`、显式 `version: 2` 与 `views`；新协议景别为 `full_body/half_body/portrait`，`partial` 仅兼容历史任务。别名仍经 `resolveCharacterKey` 归约，拒绝危险键；改名/删除、预设导入导出携带新旧字段，缺字段旧预设不清空现有 DNA。旧文本不自动推导三景别，升级由用户按角色明确确认。DNA-only 或只有衣装的已登记角色不自动收费补全。
- 服装差分（`character-outfits.js`，v0.30.0）：`bridge.sceneAssets.characterOutfits = { 主名: { 服装名: { words: [服装词], moods: { 槽: url } } } }`，与 `characters`、`characterDna` 并列，别名经 `resolveCharacterKey` 复用主角色服装。规范化拒绝空名、含 `|` `]` 换行、保留字「默认」与原型污染键；同一角色内一个词只归一套服装（与服装名重复的词丢弃）；服装内不设「默认」槽。
- 服装栏：`[igs-char:角色|表情|服装|对白]` / `[igs-thought:角色|表情|服装|心里话]`，字段构造只在 `directive-tags.js`（`matchOutfitDirectiveAt` / `stripOutfitFields`），只在传入 resolver（场景素材模式，未登记任何服装时也传）时识别，未传时与旧版一致。第 3 栏三分：已登记服装名、词池词或保留字「默认」→ 服装；像服装名的短词（无空白与句读、≤12 字）→ 未登记服装：丢弃该栏、照常显示对白与原有立绘，指令带 `unknownOutfit`，阅读器记入 `outfit-review-store.js`（localStorage `igs:outfit-review:v1`，按角色 + 词去重、最多 50 条，不进设置与预设）供设置页「待确认服装词」归入或新建；三个本地 store（`scene-preset-store`、`mood-review-store`、`outfit-review-store`）写入失败时返回 `{ ok:false, reason:'store-write-failed', saveError }` 交给设置页提示，不再静默丢弃；渲染时记录待确认词仍不打扰；其余视为对白里的「|」，拼回对白。正文格式化与插图定位前先 `stripOutfitFields` 按同一规则改写为三栏，对白内残留的「|」显示为全角「｜」，只认三栏的格式化正则不会漏出服装名或把整句打成旁白。
- 服装取值（`resolveSpriteOutfit`）：① 本楼当前页原文偏移前该角色最近一次服装栏 → 跨楼 `payload.inheritedOutfits`（`api/igs-compat.js` 按当前聊天倒序查找各角色最近一次服装栏，不随三个 AI 楼层窗口过期；收齐有效衣柜角色即停止，本卡素材先归入当前有效视图）；「默认」读取明确设置的默认衣装映射，未设新映射时复位旧原装槽；② 标签从未写服装时依次按服装名 / 词池匹配 `data/shujuku/outfit-clues.js` 给出的角色表「穿着打扮」等列 → 装备表正在穿戴的衣物 → `characterDna[主名].defaultAppearance`；③ 都未命中显示原有立绘。服装可选 `scenes`（适用场景，存场景主名）：最近一次场景标签之后本楼明确写出的服装照用；更早写的或跨楼继承来的服装若不适用当前场景（主名或原文写法）则失效，兜底也只在适用当前场景的服装里匹配；当前场景未知或服装未填场景时不限制。场景改名 / 删除经 `renameOutfitScene` 同步。表格读取由宿主层注入 `readClues`，场景层不访问宿主；读取失败返回原因并跳过 ②，不阻塞渲染。只读匹配，不回写标签、表格或 DNA。`matchOutfitByText` 不做单字匹配，同一来源多套等长命中视为冲突、交给下一来源。服装可选 `avatar`：状态栏说话人与立绘角色一致时优先显示服装头像，未设时沿用角色头像。
- 服装查图（`asset-match.js`）：命名衣装先按既有情绪组和模糊规则找同衣装图片；默认通过 `character-appearance.js` 读取显式映射，没有新映射时保留旧原装槽与生成区归档图。临时生成图按角色和衣装匹配，不借其他卡；缓存绑定只保存轻量键。图片暂不可读可走同角色可用图兜底，但不等于自动收费生成替代。
- 注入规则：`DEFAULT_SCENE_PROMPT_RULE` 为精简的【场景与台词】块（四栏语法、服装说明与 `{{outfit_groups}}`），通用标签规则由 `visual/igs-ui/tag-grammar.js` 统一写在最前。只有空值或逐字等于旧默认（V1 / V2 / V3）的规则自动升级，自定义规则原样保留，设置页在缺 `{{outfit_groups}}` 时提示一行。按需注入开启时词表走精简写法：表情池每组只列 3 个代表词（立绘建了槽位的词全部保留），场景只列主名，时间/天气/服装各限 400 字、超出写「等」；服装只列在场角色（角色卡名、群聊成员、最近 6 层正文与本轮输入里出现主名或别名），拿不到名单时退回全量。解析端不变：AI 写出词库里未列出的词照样按完整词库精确归组。占位符展开集中在 `prompt-rule-content.js` 的 `resolvePromptRuleContent`（`compact` 为按需注入的精简词表，否则为完整词表），注入与设置页「复制到酒馆预设」共用。
- 自动注入开关 `bridge.sceneAssets.promptRuleEnabled`（缺省开，经 `scenePromptRuleEnabled` 判断，只有存了 `false` 才算关）：关闭时按需注入与旧拼接两条路径都不再带【场景与台词】块，演出等其它语法块、时代规则与交互摘要照常；全部关闭时清空注入。设置页「复制到酒馆预设」给出通用标签规则 + 完整词表展开的场景规则 + 示例（输入框未保存的草稿优先），不含 `{{…}}` 占位符，供用户贴进酒馆预设后关闭自动注入。
- 按需触发（`prompt-triggers.js`）：聊天、日常、战斗、亲密四块在最近 3 层出现对应标签、本轮用户输入命中触发词，或最近 12 层内有未闭合的成对标签时才发完整说明，否则只在索引行列出类型名。
- 阅读器整楼准备的在场名单由 `reader-floor-plan.js` 与 `reader-floor-assets.js` 共用场景继承结果：`[igs-scene]` 可选第 5 栏为在场角色名单，第 4 栏仍只表示 NSFW；未写名单时按 `sceneCarryMode`（strict / smart / loose，默认 smart）和正文判断同行，跳时或分开时不无条件沿用。旧三栏、四栏写法保持兼容。
- 旁白焦点由 `narration-focus.js` 按页序解析名字、别名、感知对象与代词；临时焦点只使用同屏空座，不挤占已经开口的角色。独立 `resolveStageCast` 仍为不读宿主或 DOM 的纯函数。
- 陪衬挑选由 `stage-cast.js` 的 `pickCastMembers` 负责：调用方以 `STAGE_CAST_SCAN_LIMIT`（6）宽扫名单，再按有无立绘跳过无图角色，凑满 `STAGE_CAST_MAX_SEATS`（3）减说话人即停止解析；窄屏上限仍由渲染层 `layoutCastSlots` 截断。无图角色不得占用同屏名额。
- 世界观（`worldview.js`）：`WORLDVIEWS` 为唯一注册表（modern / ancient / fantasy / scifi / apocalypse / taisho / magic 均已启用；`ready:false` 仍表示预留项，下拉中不可选、`applyWorldview` 拒绝写入），设置页一键档位条的「适配世界」下拉、`worldview:<id>` 动作与场景预设保存 / 应用 / 导入 / 导出只经 `resolveWorldview` / `applyWorldview` 读写，不直接碰存储字段。存储为枚举 `bridge.sceneAssets.worldview`，并同步写布尔 `ancient`（古代为 true，其余为 false）供既有消费方读取；读取时 `ancient: true` 优先按古代，`ancient` 为假时 `worldview: 'ancient'` 按现代，缺字段或未知值按现代。演出过滤与时代提示词由 `fx-era.js` 的 `applyFxWorldview` / `resolveWorldviewPromptRule` 负责（古代、现代与 `applyFxEra` / `ANCIENT_ERA_PROMPT_RULE` 逐值等价）；阅读器快照携带 `_worldview`，`_ancientEra` 保留。在现代结构上换皮的世界观统一登记在 `WORLD_SKIN_IDS`，演出 / 音效层只经 `worldSkinOf` 判断，不各自维护列表；新增世界观时先注册为 `ready:false`，补齐 `FX_WORLDVIEW_OFF`、时代规则、`fx-sfx` 的 `notify-<id>` 音色与 `fx-style` 的 `is-<id>` 换皮后再启用；日常（`fx-daily-style` 的 `is-<id>`）、物品（`data-igs-era="<id>"`）、战斗（`is-<id>`）、聊天（`data-igs-chat-world`）四类演出也各有一套样式分支，新增世界观须同步补齐，古代与现代不挂这些标记；世界观专属日常演出统一登记在 `FX_WORLDVIEW_ONLY`（古代 `FX_ERA_ANCIENT_ONLY`、魔法 `FX_MAGIC_ONLY`），当前世界观以外的表一律拨成关；未知 id 一律不改动。
- 地点氛围（`place-ambience.js`）：`resolvePlaceAmbience(location, { worldview })` 是「人在车里 / 船上 / 浴室 / 水底 / 真空里」的唯一词表，返回 `{ kind, variant }` 或 null；日常演出的常驻氛围层（`fx-daily` 的 `.igs-dfx-amb`）与环境音（`scene-audio` 的 car / carriage / bath / underwater / space 层、水下闷音色调）都只经它判断，不各自维护地点词。古代与西幻（`isHorseDrawnWorld`）的「车里」按马车；水下与太空不分世界观。`STILL_PLACE_KINDS`（浴室、水下、太空）在 NSFW 页照常挂氛围层，`VEHICLE_KINDS` 只在 SFW 页挂。水下与真空在环境音里独占（不叠雨、风、人声）。


- 角色卡级覆盖（`asset-scope.js`）：卡上可记 `worldview` 与 `dialogSkin`（由第 0 层主界面写入），二者进入 `effectiveSceneAssets` 合并视图与 `libraryHasContent` 判断；全局根上不写 `dialogSkin`。

## 身份与衣装候选（0.36.88 本地草稿）

- 剧情新衣装候选的 `prompt`、可选 `promptHalfBody` 随恢复记录保留，采用时一并保存到衣柜；旧候选缺半身字段仍可读。立绘使用已保存的半身衣装与人物 DNA，不重新生成已完成的新衣装资料。
- `character-identity`、`character-appearance` 与 `outfit-identity` 分离身份、命名衣装和默认映射；衣装文字保存与图片采用分开，失败不得撤销已经保存的说明或擅自覆盖旧默认图。
- `outfit-review-store` 同时保存逐项剧情衣装候选与恢复状态。采用前比较目标、资料和图片证据；旧路径校验生成目标/DNA，新协议校验模板/快照，入库失败复用已生成结果，不重复发图。
- 新衣装/模板进入 `effectiveSceneAssets` 的全局加当前卡视图。其它卡数据只参与全库引用保护，不能作为显示或生成的取材范围。

## 场景来源优先级

1. 当前楼层正文显式标签或正则解析结果。
2. shujuku 数据库中的时间、天气、地点、角色状态。
3. 上一轮场景状态。
4. 默认场景。

## 禁止

- 不直接渲染 DOM。
- 不直接调用生图 API。
- 不直接发送用户输入。

## 楼层准备（v0.36.62）

- `prepareIllustrationPages` 与 `prepareEventCgPages` 一次建立整楼 CG 页计划，沿用原有停留、NSFW、场景变更和新说话人退场规则。
- `createFxPageResolver` 顺序消费新增演出指令、保留区间状态；既有 `resolveFxAtPage` 仍支持独立单页解析，准备后的页不能被后续页回写。`createNarrationSpriteTracker` 与原有离场/回来规则共用状态推导。
- 立绘可用性先确定当前角色及其别名，再只检查同角色槽位；不因任意一张图片读取失败而遍历其他角色图片。
# 0.36.106 场景时间来源

正文、台词、心里话与衣装对白里的钟点均为叙述内容，不收集为场景时间、不覆盖 `[igs-scene]` 的时间栏。场景时间继续由显式标签与原有数据库、跨楼继承、默认来源确定；`time-bucket` 只解析调用方提供的时间字段，用于既有时段归档与素材选择，不扫描正文。显式场景、时间跳跃演出与背景过渡仍沿原入口处理，无新增配置或数据迁移。
