# 战斗扩展（卡牌战斗）

设计：`.limcode/design/combat-expansion.md`；计划：`.limcode/plans/combat-expansion.plan.md`。

## shujuku 能力核查（计划第 1 步，2026-10-22）

- 来源：本地仓库 `D:\VS项目\SP数据库\shujuku`（origin `AlbusKen/shujuku`，`main` @ `0d9cc1a5`）。
- 方法：静态源码核查，路径均相对该仓库。未启动本地酒馆实例做运行时验证，标注「推断」的条目需在真机或本地实例复核。

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | API 清单 | `window.AutoCardUpdaterAPI` 由 17 组工厂合并挂载；IGS 现用的 8 个方法均存在 | `src/presentation/bootstrap/api-registry.ts:41-69` |
| 2 | 建表 | 没有单表建表 API。唯一外部途径是 `importTemplateFromData(template, { scope: 'chat' })`。聊天作用域经协调器处理：模板里新出现的表按 introduction 引入，不动其他表数据；**模板里缺失的既有表默认被隐藏**，所以只传战斗表会把用户其他表全部隐藏，必须传「当前模板 + 新表」 | `src/presentation/bootstrap/api-groups/template-preset-api.ts:96-180`；`src/service/template/chat-template-reconciler.ts:146-190,224-240` |
| 3 | 不参与自动填表 | `updateConfig.updateFrequency = 0` 被调度器排除，有测试覆盖。陷阱：导入时若 `mate.updateConfigUiSentinel !== -1`，0 会被迁移成 -1，即改为沿用全局频率 | `src/service/table/update-scheduler.ts:131-132`；`tests/service/table/update-scheduler.test.ts:169`；`src/service/template/template-preset-service.ts:307-318` |
| 3a | 其他 AI 路径 | 手动填表在用户未手动选表时默认选中全部表；Agent 读集直接读全量表数据；没有表级「对 AI 不可见」字段。自动填表中，AI 越权写非目标表会被拒绝，但手动全选时战斗表本身就是目标表 | `src/presentation-v2/composables/useManualUpdate.ts:134-137`；`src/service/continuation/agent/agent-tables.ts:37-39`；`src/shared/models/table-data.ts:81-88`；`src/service/ai/prompt-builder/strict-json-table-fill.ts:79-81`；`src/service/table/update-orchestrator.ts:1898-1903,2157-2168` |
| 4 | 不注入世界书 | `exportConfig.injectIntoWorldbook === false` 生效；缺省按 `!== false` 视为注入 | `src/service/runtime/helpers-data-merge.ts:739-741`；`src/service/worldbook/injection-engine-custom.ts:313-318` |
| 5 | 作用域与分支 | 表数据存在 AI 楼消息对象的 `TavernDB_ACU_IsolatedData`（V2 checkpoint + logEntries）上，按聊天隔离，没有 swipe 维度；读取时从最后一个 full checkpoint 开始回放。分支会复制消息和 chat_metadata，表数据随之复制 | `src/data/models/chat-message-data.ts:100-117`；`src/service/table/storage-frame-v2-replay.ts:614-630,822-828`；SillyTavern `public/scripts/bookmarks.js:201,224-233` 与 `public/script.js:7406` |
| 6 | 写入落点 | `insertRow` 成功时返回新行号（1 起），失败返回 -1，并立即持久化。**不论哪张表，都追加到「最新的已带表数据的 AI 楼」**。删楼时只抢救 checkpoint，**该楼的 logEntries 不恢复**；源码注释称 swipe 或重填替换 frame 时，该楼的增量随之消失（推断，待运行时复核）。单元格没有长度上限，也不做截断 | `src/presentation/bootstrap/api-groups/table-crud-api.ts:446-458,840-975`；`src/service/table/table-history.ts:221-234`；`src/service/chat/checkpoint-delete-guard.ts:17-19`；`src/service/table/storage-frame-v2-types.ts:567-571` |
| 7 | 回调 | `registerTableUpdateCallback` 在写入提交、合并与世界书刷新完成之后触发，携带 `meta.persisted`；失败时不触发；swipe 或删楼后经 1.2 秒防抖重刷时也会触发 | `src/presentation/bootstrap/api-groups/callback-api.ts:32-101`；`table-crud-api.ts:490-509`；`src/presentation/bootstrap/init.ts:1059-1068`；`chat-mutation-scheduler.ts:29-31` |

### 结论（助手 2026-10-22 决定：不改 shujuku）

- 计划第 2 步（给 shujuku 补能力并提 PR）取消。主模型看不到战斗表的方式是世界书不注入：`exportConfig.injectIntoWorldbook = false`。
- 建表：IGS 读取 `getTableTemplate()`，在副本里追加战斗表，再用 `importTemplateFromData(副本, { scope: 'chat', dataMode: 'seed' })` 导入。战斗表的配置固定为：
  - `updateConfig.updateFrequency = 0`，不参与自动填表；
  - `mate.updateConfigUiSentinel = -1`，避免 0 被导入迁移成 -1；
  - `exportConfig.injectIntoWorldbook = false`。
  已存在同名表时不导入。
- 接受的残余风险（记录，不在本期处理）：
  1. 手动填表在用户未自选表时、以及 Agent 读集，仍可能读到或改写战斗表。IGS 读回时逐行做 schema 校验，非法行忽略并给出诊断，不当作有效数据。
  2. 行数据挂在最新的带数据 AI 楼上，删除或重填该楼可能丢失这批行。IGS 按锚点归并：日志丢失只会让对应成长失效；档案丢失时按「首次参战」重新生成，不伪造数据。
  3. 整体导入模板时，可能改写其他表的 orderNo 元数据。

## 实施记录

### 第 3 步：规则与数据契约

- **起始卡组构成改了**：设计 §8.2 写的是「基础攻击 5、基础防御 5、职业卡 7、个人卡 3」，但 Q6 规定同名卡最多 3 张，5 张基础攻击直接违反这条上限。实现改成基础攻击 3、基础防御 3、职业卡 10、个人卡 4，总数仍是 20 张。要换比例，只需改 `COMBAT_RULES.starterDeckShape`。
- 校验只拒收、不自动修正。错误统一返回 `{ path, reason, detail? }`，第 9 步的副 LLM 定向修正就靠这个结构。
- 验证：`node --test tests/combat-rules.test.js` 共 8 项，全部通过。

### 第 4 步：战斗引擎与托管策略

- 新增 `battle-state.js`（只读查询与估算）、`engine.js`（纯函数引擎）、`policy.js`（确定性托管），契约见 `app/src/combat/CONTRACT.md`。
- 实现时定下的结算细节（设计未写明）：
  - 荆棘反伤可被出手者的格挡吸收；中毒掉血无视格挡，结算后层数减 1；再生回血后层数减 1；易伤、虚弱在所属方回合结束时减 1。
  - 格挡在所属方回合开始时清零；手牌上限 10，抽牌超过上限时停止抽。
  - 能力牌打出后移入消耗堆；X 费用牌耗尽当前能量，按能量值重复结算效果。
  - 敌人 HP 跌破阶段阈值时立即切换技能组；若当前公示的意图技能被移除，重新公示意图。
  - 被动触发嵌套深度上限为 2，防止受击被动互相递归。
  - 队友托管每回合最多出 30 张牌，作为防止死循环的保护。
- 验证：`node --test tests/combat-engine.test.js` 共 15 项，全部通过；与 `tests/combat-rules.test.js` 合跑 23 项全部通过。

### 第 5 步：战斗标签解析

- 新增 `app/src/scene/combat-directives.js`，在 `directive-tags.js` 登记指令名 `combat` 并加入显示剥离；`scene-directives.js` 跳过 combat 标签，不计入正文段。
- 实现时定下的细节（设计未写明）：
  - 依赖方向是 combat → scene，scene 不导入 combat。标签上限复制为 `COMBAT_TAG_LIMITS`，由测试锁定与 `COMBAT_RULES` 一致。
  - 敌方单项数量写法 `名称*N` 接受全角星号、乘号与全角数字；单项数量不设单独上限，只按合计不超过 5 个单位拒收（`too-many`）。同名敌人合并计数。
  - 栏位多于协议时整条拒收（`too-many-fields`），不截断。等级词写错拒收（`unknown-tier`），不回退为普通。
  - 锚点只由规范化后的类型和栏位决定，不含字符偏移，前文增删不影响已入库条目；完全相同的标签按 `occurrence` 区分。
  - 战报楼的 exp 由程序生成，解析时传 `{ expCap: false }` 跳过剧情封顶。
- 验证：`node --test tests/combat-directives.test.js` 共 10 项，全部通过；与 fx 指令、多行指令、插图、HTML 卡片、unit、楼层准备、场景延续、旁白离场、用户角色等受影响的既有测试合跑 46 项全部通过。

### 第 6 步：提示词装配

- 新增 `app/src/scene/combat-prompt.js`：combat 提示块、`combat-narration` 段与战报待续写判定。计划写的是放在 prompts 层，但 `prompts/` 的契约只管生图提示词，主模型标签提示词一直在 scene / visual 两层（`tag-grammar`、`prompt-triggers`），因此放在 scene。
- `tag-grammar.js`、`bootstrap.js` 的旧拼接路径：扩展开启时以 combat 替代 battle；`prompt-triggers.js` 新增 `combat` 触发块，`prompt-entries.js` 登记条目「卡牌战斗」，设置页条目可按世界书方式开关、改关键词与正文。
- 实现时定下的细节（设计未写明）：
  - 宿主在 `GENERATION_STARTED` 之后才把输入框内容写成用户楼（已核对 SillyTavern `Generate` 源码顺序），所以普通发送时 narration 判定看输入框原文；为此 `collectPromptContext` 新增 `inputText` 字段，旧字段不变。
  - swipe / regenerate 重写续写楼时，末尾那条 AI 楼是被重写的对象，判定前先去掉，narration 段照常注入。
- 验证：`node --test tests/combat-prompt-assembly.test.js` 共 5 项，覆盖扩展关闭时 battle 组装结果不变、开启时 combat 替代 battle、三种结果的 narration 段、AI 楼出现后消失、输入框判定；只断言段的存在与类别，不断言提示词文字。与 bgm、unit、fx 指令及前三步 combat 测试合跑 52 项全部通过。

### 第 7 步：IGS 一侧的 shujuku 战斗表适配

- `data/shujuku/client.js` 新增 `getTableTemplate()`、`importTemplate()`；`insertRow` 增加可选 `options`（不传时保持原位置参数调用，旧调用对象形状不变）。
- 新增 `data/shujuku/combat-tables.js`：`probeCombatTableSupport`、`withCombatSheets`、`readCombatTables`、`encodeCombatRecord / decodeCombatRows`、`createCombatTables({ api })` → `probe / read / ensure / append / flush / pending / isWriting`。
- 实现时定下的细节（设计未写明）：
  - 计划写「分段上限取第 1 步实测值」，但第 1 步核查结论是宿主单元格没有长度上限，因此默认 `cellMax = 16000` 只用于控制单行体积，可由调用方覆盖。表里增加「分段」列记录 `序号/总数`。
  - 行身份：档案为 `档案ID|版本`（重新生成时追加新版本），日志为 `记录ID`。同一身份已存在且内容相同记为 `present`、不再插行；内容不同记为 `combat-record-conflict` 拒收，不覆盖。
  - 写入重试可能留下半截行：解码时同一序号后写覆盖、总数变化时按新总数重新成组；仍不完整的组只记诊断，不当作数据。
  - 待写队列在遇到第一条未核实条目时停止，保持 FIFO 顺序；读取失败、表缺失时整批保留。
  - 写行用 `skipNotify: true`，整批结束后只调用一次 `refreshDataAndWorldbook`。
- 验证：`node --test tests/combat-tables.test.js` 共 7 项，全部通过（fake API：缺方法 fail-closed、建表需确认且幂等、读回不一致保留待写、读取失败不当空表、分段还原、client 旧调用形状）。与 simulate、楼层准备及前几步 combat 测试合跑 60 项全部通过。未在真机 shujuku 上执行建表或写入（留待第 13 步逐项确认）。

### 第 8 步：成长账本归并与正文扫描入库

- 新增 `combat/ledger.js`：`normalizeSnapshot`、`indexProfiles`、`computeEffectiveState`、`scanGrowthTags`、`buildDeckEntry`，以及门面 `createCombatLedger({ tables, chat, userName, sourceFilter, now })` → `read / effectiveState / append / scan / saveDeck`。`chat` 由调用方传入消息快照（数组或函数），combat 不读宿主。
- `scene/combat-directives.js` 的 `extractGrowthDirectives` 增加 `{ raw: true }`，供战报用户楼直接扫原文；`scene/combat-prompt.js` 导出 `combatReportResult`。
- 实现时定下的细节（设计未写明）：
  - 尚无档案的角色以名字键 `nm-<hash>` 记 EXP（暂计入 `unassignedExp`），登记档案后按名字与别名归并；同一标签先后以名字键和档案 ID 各记一次时只计一次，扫描也把两种 ID 都视为已入库。
  - 同一楼层内按 exp → class → learn → upgrade → reward → deck 的顺序归并，再按 occurrence，保证奖励按当时等级核对。
  - 隐藏楼（`is_system`）仍算存在；普通用户输入楼不扫描、其中的标签也不计；只有带 `<igs-combat-report>` 的战报用户楼计标签，`result="lose"` 时 EXP 不入库，已入库的也判为失效。
  - `deck` 与 `reward` 不来自标签，只核对楼层与 swipe；`deck` 锚点 `tagHash` 固定为 `deck`，同楼同 swipe 多次保存时 occurrence 递增，`revision` 单调递增。
  - 同名职业后登记者不生效，引用它的角色改用先登记的职业（`classAlias`）。
  - 拒收条目（升级目标不存在、奖励等级未达到或重复领取、ID 冲突等）只记诊断，不生效；`revoke` 只让目标失效，不做物理删除。
- 跨聊天隔离（设计 A6）仍按「表随聊天」处理，未加角色卡作用域前缀，待第 13 步真机确认。
- 验证：`node --test tests/combat-ledger.test.js` 共 10 项，全部通过（锚点有效 / 换 swipe / 切回 / 删标签 / 删楼、分支后锚点仍有效、重复扫描不重复写、名字键归并、EXP 封顶与战报、失败战报无 EXP、待生成队列、职业复用、卡组回退与剔除、revoke、读取失败不当空状态、与真实 combat-tables 适配器联通）。与 combat 其余测试及 fx-directives 合跑 57 项全部通过。仍是内存或 fake API 验证，未在真机执行。

### 第 9 步：副 LLM 生成

- 新增 `combat/generation.js`：`resolveCombatLlm`、`readGenerationJson`、实体构造 `deckProfileEntities / skillProfileEntity / enemyEntities / growthEntity`、`templateEnemy`、`buildGenerationRequest`、`generateEntities(entities, { request, llm, signal, classes, context, now })`、`generationWrites`。`request` 由调用方注入（`createSecondaryLlm().request`），本模块不读宿主、不落账；落账由第 10 步会话经账本与战斗表完成。
- 实现时定下的细节（设计未写明）：
  - 身份字段（`kind / id / name / tier`、已定 `classRef`）由程序覆盖，模型只填数值与效果原语；起始卡组按 `COMBAT_RULES.starterDeckShape`（3/3/10/4）校验，设计 §8.2 的 5/5/7/3 已在第 3 步改定。
  - 职业已登记（传入 `classRef`，或标签职业名与已有职业同名）时请求里没有职业实体；未指定职业名且已有可复用职业时，职业实体标为 `optional`，模型可改填已有职业 ID。同批卡组档案在职业有结论前挂起，职业修好后直接重核，不重新提交。
  - 敌人档案 ID 由「档位:名称」推导，同名同档复用、同名不同档分开；learn / upgrade 产出的卡牌或技能 ID 由角色、技能名与锚点推导，重试得到同一 ID。upgrade 找不到目标时转为 learn 并记 `combat-upgrade-as-learn`。
  - 修正耗尽：敌人给出 `generated: false` 的模板敌人（不入库）、主角 `blocked`、队友 `skip`。请求本身失败时全部实体按同样规则拒收，不重试、不伪造档案。
  - 取消或迟到结果一律 `request-stale`，已通过的实体也不交付；`source: 'openai'` 缺地址或模型时返回 `combat-llm-config-incomplete`，不改走酒馆。
- 主角自动生成、其他角色手动触发由调用方（第 10、12 步）决定，本模块只提供实体构造。
- 验证：`node --test tests/combat-generation.test.js` 共 7 项，全部通过（合法回复、超封顶与超预算定向修正、已通过实体不进入修正请求、职业已登记不请求职业、同名敌人复用、修正耗尽回落、请求失败、取消与迟到、配置不完整、learn / upgrade ID 分配与转换）。与 combat 其余测试及 fx-directives 合跑 64 项全部通过。用例使用固定回复夹具，只证明解析与校验链路，不证明模型生成质量。

### 第 10 步：战斗会话、战报与自动回传

- 新增 `combat/report.js`：`collectTurns`、`buildCombatReport({ combatId, encounter, state, events, enemyTiers, expTargets, detail })`、`injuryLevel`、`reportIdFor / reportIdOf`、`COMBAT_SKIP_TEXT`。战报只写技能名（卡牌取 `skillRef`）和相对伤势（无伤 / 轻伤 / 重创 / 濒死 / 倒下），不出现卡牌、费用、能量或数值；每回合按重要度保留最多 4 条（`brief` 为 2 条），超过 8 回合时中段合并成概述。胜利时在战报块后附 `[igs-combat:exp|角色|数值|战斗:<reportId>]`，数值为各敌人档位 EXP 之和；失败与撤退不附。
- 新增 `combat/session.js`：`createCombatSession(deps)` → `prepare / start / act / finish / retrySend / skip / resume / reset / state`。账本、战斗表、副 LLM、发送、storage、聊天快照全部注入。
- 新增 `host/combat-report-regex.js`：`ensureCombatReportRegex(globalObject)` 注册一条只作用于用户楼、只改 display 的全局正则，把战报块及其后的 exp 标签行折叠成「战斗记录」；prompt 目标不处理，主模型看到原文。注册幂等，并保留其他全局正则。
- `combat/ledger.js` 的 `effectiveState()` 增加 `enemies`（敌人档案按 ID 索引），供会话复用同名同档的敌人。
- 实现时定下的细节（设计未写明）：
  - `combatId` 由开战标签锚点推导（`cb|messageId|swipeId|tagHash|occurrence`），不含 chatId，与日志锚点的分支语义一致；设计 §6.1 写的 `floorKeyOf` 含 chatId，回溯分支后已回传的战斗会被误判为未打，因此没有采用。
  - 「已回传」以开战楼之后存在同一 `reportId` 的用户楼为准；待回传战报存在 `igs-combat:outbox:<chatId>`，存档存在 `igs-combat:session:<chatId>`，二者都不在全局配置文件白名单内。
  - 发送前先写待回传；收到回执后清掉待回传和存档，再对战报楼执行一次账本扫描，EXP 由战报楼标签入库。发送失败时保留待回传，只能手动 `retrySend`；重试前若聊天里已有同一战报，直接完成，不重复发送。
  - 动作先在副本上结算，存档写入成功后才推进；开战楼换 swipe、删楼或换聊天时会话作废并清存档。续战核对存档版本、规则版本和锚点后，用同一 seed 重放；不一致时作废，不就地修补。
  - 准备阶段：主角缺档案时自动生成卡组档案；队友缺档案时生成技能档案（卡组档案只在第 12 步面板里手动生成）；敌人同名同档复用。主角生成失败或读表失败时进入 `blocked`；队友生成失败时本次不参战；敌人生成失败时用模板敌人，不入库，`lobby.templated` 会列出这些敌人。生成期间开战楼发生变化时，结果丢弃。
  - 操控角色只能从卡组合规的参战卡组角色中选；首领战不能撤退。
- 会话尚未接入 bootstrap 与界面：战斗面板、入口卡片和正则注册时机归第 11 步，真机发送与折叠显示归第 13 步。
- 验证：`node --test tests/combat-session.test.js` 7 项、`tests/combat-report-regex.test.js` 2 项，全部通过。覆盖胜、败、撤退全流程及对应战报和成长条目（失败与撤退无 EXP）；刷新后重放得到相同战局；换 swipe 后作废；发送失败保留待回传、不自动重发，手动重试；已回传的战斗只能回顾；跳过战斗不产生条目；主角生成失败与读表失败阻断；正则只折叠显示且幂等。与 combat 其余测试及 fx-directives 合跑 73 项，全部通过。发送和正则都使用 fake 宿主，没有在真机执行。

### 第 11 步：战斗面板、入口与设置项

- 新增 `visual/igs-ui/combat-settings.js`：归一化 `readerSettings.combatExpansion` 的 `enabled / autoOpen / difficulty（easy / normal / hard）/ reportDetail（brief / normal）`，默认关闭、普通难度、标准详略。`checkCombatExpansionReady({ api, autoIllustration })` 在开启前检查 shujuku 接口与副 LLM 配置，不满足时不开启。`battleFx` 被接管时，设置页显示接管状态。
- 新增 `combat-entry.js`（`resolveCombatEntry`）：入口只在扩展开启、处于最新 AI 楼末页且正文末尾为开战标签时出现。`autoOpen` 对同一开战楼只触发一次。
- 新增面板：纯视图模型 `combat-panel-model.js`，以及 `combat-panel.js`、`combat-panel-render.js`、`combat-panel-style.js`。面板包含战前、对局、结算、领奖候选，以及缺表时的建表确认与阻塞原因。打开时加 `panel:combat` 暂停原因，关闭时只撤销自己加的原因；Esc 关闭并恢复焦点；出招沿用 `fx-battle` 演出；常见错误码显示为中文提示。
- 新增 `core/combat-services.js`：`createCombatServices(deps)` 返回 `getSession / getLedger / ensureTables / syncRegex / resetChat / settings`。扩展关闭时不创建对象、不注册正则；会话按聊天创建并执行 `resume`；建表只在面板内确认后执行。`reader-host.js` 接入楼末入口，与地图、资料面板互斥。
- `combat/ledger.js` 新增 `REWARD_TAG_HASH`、`buildRewardEntry` 和门面方法 `claimReward(characterId, level, choice)`：先按归并状态核对等级已达到且未领取，再写一条 reward 条目。重复领取、非法选项、读失败、写失败都返回 `ok:false`。
- `combat/session.js` 与账本一致，每次调用时读取 `sourceFilter`（可传函数），设置变化后不必重建会话。
- 构建产物验收使用本机合成预览服务（工作区 `app/tools/local-preview/`，不纳入版本库）：读取真实 `app/dist`，只监听 127.0.0.1，只放行无请求体的 GET/HEAD；宿主接口与写入默认拒绝；用户、聊天、档案均为合成数据。`fixtures/record-pages/preview.html` 增加战斗页。`scripts/record-pages-capture.mjs` 的 Edge CDP 端口改为 0，从 `DevToolsActivePort` 读取实际端口。
- 验证：`combat-panel.test.js` 8 项、`combat-ledger.test.js` 11 项；战斗相关 10 个测试文件与 `settings-panel-ux.test.js` 合跑 84 项，全部通过。`npm.cmd run build` 产出 0.36.115。构建产物预览在 Edge headless 下实测：lobby 测了 1440 / 768 / 390 / 320 四个宽度，no-tables、read-fail、disabled 各测 390 宽；均无溢出、无 console error、无外站请求。VS Code 内置浏览器打开同一场景，产物指纹一致。
- 未验证：结算、战报发送、领奖界面、内存写入模式、主题切换、完整 Tab 顺序；真实酒馆、手机、shujuku、副 LLM 均未验收。

### 第 12 步：资料菜单「战斗」、卡组构筑面板与成长演出

- 资料菜单新增「战斗」项（`record-icons.js` 的 `combat` 图标），只在扩展开启时出现；开关已纳入状态栏重建签名，切换后菜单随之增减。`reader-host.js` 把 `combat` 动作直接交给卡组构筑面板，不经过 `record-panel`：资料面板只渲染 shujuku 资料表，构筑需要账本、会话与副 LLM，因此计划中列出的 `record-panel.js` 登记点没有改动。地图、资料、战斗、卡组构筑四个面板经 `anyPanelOpen` 统一互斥，Esc 优先级为战斗 > 卡组构筑 > 地图 > 资料。
- 新增卡组构筑面板 `combat-deck-panel-model.js` / `combat-deck-panel-render.js` / `combat-deck-panel-style.js` / `combat-deck-panel.js`：角色列表（卡组角色在前，显示等级与 EXP 进度、需调整标记）；角色详情（职业、HP、被动、技能）；构筑草稿实时校验 20–30 张、同名不超过 3 张、不超过拥有数，不合规时保存按钮禁用且对应卡标错；保存写一条 `deck` 日志并读回；会话处于准备、对局、结算或待回传时只读。暂停原因为 `panel:combat-deck`。
- 手动生成卡组档案（设计 A2）：`combat-services.generateDeckProfile({ name, classRef }, { signal })`。选定已有职业时沿用其职业特性，请求里不含职业部分；已有卡组档案时拒绝；取消或迟到结果返回 `request-stale`、不落表；写入后经账本读回确认档案生效。
- 同名档案规则（助手 2026-10-23 选定方案 A）：同名时卡组档案优先，技能档案让位但保留在表中（诊断 `combat-profile-superseded`）。技能档案上的 EXP 条目在读取归并时并入卡组档案，不改表、不写迁移行，换 swipe 或回溯后仍按锚点回退；让位档案上的其他条目只记诊断 `combat-superseded-entry-skipped`，不套用到卡组角色上。
- 成长演出 `combat-growth-fx-model.js` / `combat-growth-fx.js`：账本 `effectiveState()` 新增 `growth`（已生效的 exp / learn / upgrade / class 条目，带接手角色、锚点和生效前后等级）。成长标签按页归位，规则与演出标签相同，正文末尾的标签归最后一个有效页。只播本楼、本 swipe、本页已入库的条目；同一角色本页的 EXP 合并为一条，跨级时单列「升级」；尚待副 LLM 生成的项显示「整理中」占位；页内最多 3 项，超出的计数；同页重绘不重播，晚入库的条目只补播新增的。NSFW、聊天页、卡片页不播；减少动态效果时静态显示。
- 补扫时机：此前剧情楼的成长标签只在战报回传后扫描。现在 `combat-services.refreshGrowth()` 在启动、设置变更、生成结束、换聊天时补扫入库（按记录 ID 幂等），并缓存成长事件与待生成项；阅读器订阅缓存刷新后合并重绘一次。缓存不属于当前聊天或读表失败时不出演出。`retryGrowth()` 把待整理的 learn / upgrade / class 交副 LLM 生成并落账，构筑面板「待整理」行的重试按钮调用它。
- 验证：`combat-deck-panel.test.js` 5 项、`combat-growth-fx.test.js` 4 项、`combat-ledger.test.js` 12 项；战斗相关 12 个测试文件与 `settings-panel-ux.test.js`、`simulate.test.js` 合跑 105 项，全部通过。`npm.cmd run build` 产出 0.36.115。构建产物预览在 Edge headless 下实测：deck 场景测了 1440 / 390 / 320 三个宽度，经状态栏「战斗」项打开构筑面板，尺寸 900×540 / 358×540 / 288×528，无溢出，焦点在面板内，Esc 关闭；growth 场景测了 390 / 1440 两个宽度，显示「升级 林夕 Lv2」与「EXP 林夕 +45」；均无 console error、无外站请求。VS Code 内置浏览器打开 deck 场景，产物指纹与服务端一致。
- 未验证：构筑面板的保存与手动生成点击链（预览默认拒绝写入，只有单元用例覆盖）、领奖界面、主题切换、完整 Tab 顺序；真实酒馆、手机、shujuku、副 LLM 均未验收。

### 第 12.6 步：战斗界面立绘、卡面与握牌

- 新增 `visual/igs-ui/combat-card-art.js`。`describeEffects(effects)` 把效果原语转成中文说明，覆盖伤害、格挡、回复、抽牌、能量、状态、消耗和条件分支。`cardArtSvg(card)` 按卡牌类型定配色、按主效果定纹样、按「ID + 类型 + 效果」的哈希定细节，同一张卡始终得到同一张图。`portraitSilhouetteSvg(name, side)` 生成无立绘时的剪影，我方暖色、敌方冷色。SVG 只由程序常量和数值拼出，不含档案文本，也不经副 LLM，档案结构不变。
- 卡面：手牌显示费用、卡名、卡图、类型和效果说明；`aria-label` 带名称、费用和说明。
- 握牌：手牌重叠成扇形，不滚动。以手牌中点为轴，每张角度为 `min(7°, 36° / (张数 − 1))`，离中点越远位置越低。悬停、键盘聚焦或选中时，该牌抬起、摆正并置顶。窄屏卡宽 96px。
- 立绘：战前和对局都有立绘位。素材模式开启时，reader-host 的 `resolveCombatPortrait(name)` 按角色名取素材库默认立绘（含本聊天临时立绘），取不到再用状态栏头像。面板经 `safePortraitUrl` 过滤后用 `<img>` 显示，两者都没有时显示剪影。敌方立绘按 `contain`、底部对齐显示，全身图不被裁切。
- 战斗面板打开时在 overlay 上写 `data-igs-combat-open`，隐藏背后的剧情对话层 `#igs-dialog-layer`，背景保留；关闭时移除该属性。
- 验证：`combat-panel.test.js` 覆盖立绘地址过滤与剪影回退、`data-igs-combat-open` 的打开写入与关闭移除、5 张起手牌的扇形角度；与 `combat-deck-panel`、`combat-growth-fx`、`combat-session`、`simulate` 合跑 36 项，全部通过。`npm.cmd run build` 产出 0.36.115。构建产物预览使用合成立绘与背景，在 Edge headless 下测 1440 / 390 两个宽度：战前加载 3 张立绘，对局加载 4 张，背景命中；对话层在面板打开时隐藏、关闭后恢复；无溢出、无 console error、无外站请求。VS Code 内置浏览器打开同一对局场景。
- 未验证：悬停抬起与满手牌重叠的逐张命中；预览素材齐全，剪影回退只有单元用例覆盖；真实酒馆素材库作用域与相对 URL、手机均未验收。


### 第 13 步：真机端到端验证

- 环境：测试酒馆 `D:\VS项目\SP数据库\shujuku\SillyTavern`（`127.0.0.1:8000`，只监听本机），shujuku「龙血玄黄·数据库」1.2.6，酒馆助手 4.11.3；VS Code 内置浏览器打开，经其调试端口操作。IGS 为本地构建 0.36.115，经测试酒馆 `public/igs-local/` 下指向仓库 `app/dist` 与 `loader/` 的目录联接同源加载（设置 `IGS_LOADER_BASE` 后注入 loader），只在当前页生效。测试聊天为 Seraphina 新聊天，追加了一条合成 AI 楼 `[igs-combat:start|林间小径|野狼]`。
- 第 1 项「建表并确认设置」：通过。
  - 设置页「演出 → 题材 → 卡牌战斗」开启时开启前检查通过，关闭设置页后读回 `combatExpansion = { enabled: true, autoOpen: false, difficulty: 'normal', reportDetail: 'normal' }`，`battleFx.enabled` 保持 false。
  - 楼末出现开战入口；战斗面板阻塞视图显示「数据库中没有战斗表」，经「在数据库中创建战斗表 → 确认创建」两步建表。
  - 读回：表总数 9 → 11；新增 `IGS战斗·档案`（`row_id|档案ID|名称|类型|职业|版本|生成时间|分段|定义JSON`）与 `IGS战斗·日志`（`row_id|记录ID|类型|角色|锚点|时间|分段|载荷JSON`），均 0 行，`updateFrequency 0`、`injectIntoWorldbook false`。原有 9 张表未改动。
  - 表 uid 为 shujuku 导入时分配的 `sheet_igs_zhan_dou_dang_an` / `sheet_igs_zhan_dou_ri_zhi`，与 `COMBAT_TABLE_SPECS` 声明的 uid 不同；读写按表名定位，不受影响。
  - 建表后面板按设计进入 `prepare()` 并请求生成主角卡组。该测试页的副 LLM 来源为 `tavern`，主 API 为未连接的 KoboldHorde，为避免外发，本页临时拦截了 `TavernHelper.generateRaw`：拦截计数 1，面板显示「主角卡组生成失败」并提供跳过 / 重试，档案表未写入任何行。这说明生成失败时 fail-closed，但生成本身留给第 2 项。
- 生成改造（助手 2026-10-23 授权：五类一起改、越界夹回记诊断、三处缺口一并修）：
  - 根因：测试接口 GLM-5.3-Flash 为推理模型。原提示词要求模型手写职业、被动、8–16 张职业卡、4–8 张个人卡（含完整效果与升级版）及 20 张起始卡组并贴合预算公式；实测出现空回复（推理耗尽额度）与写到 `starterDeck` 中段被截断的回复。
  - 新增 `combat/card-templates.js`：24 个卡牌模板、10 个被动模板、12 个技能模板。卡牌数值由程序在费用 × 稀有度预算窗口内整数搜索，升级版由程序生成，均经 `evaluateCardBudget` 复核；1–3 费在四种稀有度下全部有解，0 费部分模板无解时取最近的有解费用。
  - 新增 `combat/generation-assembly.js`：class / profile-deck / profile-skill / enemy / skill-to-card 改为紧凑回复（卡牌 `["卡名","模板键",费用]`，技能与被动 `["名称","模板键"]`），ID、效果、升级版、首领阶段与起始卡组（3/3/10/4）由程序组装，结果仍经 `normalizeProfile` / `validateStarterDeck`。档案结构、引擎与账本不变，旧档案照常读取。
  - 缺口一：`typeAndSend` 的 TavernHelper 与 DOM 分支派发后都要看到同文新用户楼才返回 `ok:true`，否则返回 `host-send-awaiting-receipt` 交给 `recoverOperation` 的回执观察，保持单次发送、切聊天即终止。跳过战斗与战报回传共用此路径。
  - 缺口二：战斗面板 `pending === 'prepare'` 优先显示「正在准备战斗」，重试期间不再被上一次的阻塞原因遮挡。
  - 缺口三：回复无法解析时细分为空 / 截断 / 非 JSON；主角生成失败的状态行附首个错误码对应的文案（如「主角卡组生成失败：副 LLM 回复被截断」），不显示回复正文。
  - 验证：迁移 `combat-generation.test.js`、`combat-deck-panel.test.js` 的生成夹具为紧凑回复；战斗 7 个测试文件与 `turn-navigation-user-floor.test.js`、`unit.test.js` 合跑 61 项全部通过。本机探针核对：空 / 全空白 → `combat-reply-empty`，半截 JSON → `combat-reply-truncated`，纯文字 → `combat-reply-not-json`；0 费与 9 费卡分别夹到 1 / 3 费、HP 500 夹到 90，均记诊断；组装后的职业、卡组、首领通过 schema 与起始卡组校验。`node scripts/build.js` 构建通过。
  - 未验证：真实副 LLM 对新提示词的遵从度与回复时长（只能由第 2 项真机测）；DOM 发送分支的回执等待只有源码核对，无单元用例。
- 战斗界面改造（助手要求：炉石式布局、人物技能与职业特性分离、技能释放眼部特写）：
  - 人物技能：`deck-character.heroSkill` 可选，副 LLM 回复 `skill:["技能名","卡牌模板键"]`，程序按 2 费个人卡预算求值；提示词要求职业名按世界观起名、职业 `passive` 为同职业共享被动，人物技能按角色本人设定设计、不与职业特性重复。引擎动作 `hero-skill` 每回合一次、耗 2 能量（该数值沿用前一轮建议，助手未单独确认）。旧档案没有该字段时按职业原型回落默认技能，不是个性化技能。`ENGINE_VERSION` / `SESSION_VERSION` 未升级，旧记录可重放。
  - 友方目标：`cover`（一名队友）/ `rally`（全体队友）这类技能不进入选目标，按现有出牌语义自动结算（`cover` 取血量比例最低的友方，可能是自己）。
  - 人设上下文：此前生成请求只含角色名。现由 bootstrap 注入 `illustrationMessageHost.readCharacterLore`（只取用户人设与角色卡，`includeWorldInfo:false`），`withCharacterLore` 给 `profile-deck / profile-skill` 附 `input.lore`；`session.prepare` 与 `generateDeckProfile` 两处接入。本机核对：有设定时请求含 `lore`；无读取器、读取抛错或为空时实体原样返回。
  - 布局：敌方立绘在上方；底栏主战者立绘 + 人物技能按钮 + 队友小立绘在手牌左侧，能量 / 牌堆 / 撤退 / 结束回合在右侧；扇形角度改为 `min(5°, 28°/(n−1))`；选目标期间「取消」占「撤退」的位置。
  - 技能特写：复用 `.igs-fx-cutin` 样式，`resolveCutinCrop` 增加可选 `focus` 参数（不传时与旧版一致）。主角 `hero-skill` 与队友 `skill` 事件出手后各播一次，眼部取景 `CUTIN_EYE_FOCUS`；头位探测回落到 `FALLBACK_HEAD` 时改用较宽取景。此前 `combatFxSource` 不认 `hero-skill`，主角技能没有任何演出，已补上。
  - 验证：删除 `combat-panel.test.js` 中只锁扇形角度字面量的断言；战斗相关测试 54/54（generation / session / panel / deck-panel / engine / ledger）通过；`node scripts/build.js` 产出 0.36.115。本机合成预览（Edge headless，lobby 场景，开战 → 人物技能选目标 → 结束回合）实测 1440 与 390：敌方行、主战者区、手牌、控制区两两重叠面积均为 0（含选目标态），手牌没有压到主战者区或控制区、没有超出视口；主角与队友技能各播放一次特写（`data-igs-cutin-focus=eyes`）；无 console error、无外站请求。VS Code 内置浏览器打开同一场景。
  - 未验证：眼部是否准确落在分格中央（截图未经人工确认）；整幅不透明立绘的回落取景；测试酒馆实机展示；真实副 LLM 是否按 `lore` 生成个性化技能（需第 2 项授权）。
- 第 2 项「真实副 LLM 生成主角卡组」：通过（助手授权，模型 `Doubao-Seed-2.1-lite`，测试酒馆自定义 OpenAI 兼容接口，副 LLM 来源 `tavern`，`max_tokens 8192`、`reasoning_effort low`）。
  - 共 3 次请求，耗时 117s / 99s / 33s。最终请求只有 system、user 两条，`profile-deck` 的 `input.lore` 带合成测试人设。
  - 档案表写入 3 行：职业 `守林游侠`（原型 `ranger`，职业特性 `林间警觉`：开战获得 1 层敏捷）；`User` 卡组档案（人物技能 `陷足索套`：8 伤害 + 2 层虚弱，起始卡组 20 张，HP 68）；敌人 `野狼`（HP 35）。面板进入战前。
  - 第 3 次请求曾因 `skill[1]:invalid-template` 被拒：提示词通用规则写的「技能模板键」与 `profile-deck.skill` 要求的卡牌模板键冲突。只改措辞，字段不变；语法检查、generation 定向测试 27/27、构建通过。
  - 前两次请求的推理 token 为 6839 / 6482，接近 8192 上限，`reasoning_effort low` 不能当作可靠的成本上限。
  - 测试人设只写在页面内存、未主动保存，但被同页其他设置的保存连带写进 `settings.json`。之后已核实 `power_user.persona_description` 为空、全文没有合成标记；与写入前的副本相比只差该字段（65 字 → 空）及酒馆与 shujuku 自身字段。
- 测试酒馆实机展示（合成素材，非生产数据，不发模型请求）：
  - 素材：`user/images/p13-synthetic/` 下的 `user.png`（512×768）、`wolf.png`（768×512），以及取自默认背景包「竹林小径」的 `forest-path.webp`。经 IGS 设置面板「角色」「背景」页的新增与地址输入（`scene-add-char` / `scene-set-mood-url` / `scene-add-bg` / `scene-set-bg-url`）登记，关闭设置时落盘；打开了角色卡，所以写进本卡 `card:Seraphina`，保存时立绘迁移为「初始衣装」与默认服装。写入前已在 `.limcode/cache/p13-rollback/` 备份 `igs-settings.json`、`settings.json` 与测试聊天。
  - 背景：源码核对，阅读器只在本页场景状态（含向前 3 个 AI 楼的继承）有地点时才取背景；楼内没有 `[igs-scene:]` 时背景为空，`默认` 场景不会顶上。因此合成开战楼首行补 `[igs-scene:林间小径|白天|晴]`，开战标签仍在末行；聊天文件对比只有该楼 `mes` / `swipes[0]` 变化（61 → 83 字），messageId、swipe 与开战标签不变。
  - 1280×720：战前两张立绘加载成功，`#igs-bg` 为林间小径背景。开战后敌方行、主战者区、手牌、控制区两两重叠面积为 0，5 张手牌没有压到主战者区或控制区、没有越界。人物技能 `陷足索套`（2 费）面对单个敌人时直接结算，不进选目标；能量 3/3 → 1/3，野狼 35 → 27 并带 2 层虚弱，按钮变为「本回合已使用」。特写节点在战斗面板内，`data-igs-cutin-focus=eyes`，`background-size 220.69% auto`、`background-position 40.48% 7.05%`，1.4 秒后清除。
  - 390×844（CDP 视口模拟）：区块重叠为 0，5 张手牌没有越界。
  - 模型请求：页内对 fetch、XHR 与 `TavernHelper.generateRaw` 加了只拦截不放行的护栏。展示期间护栏拦下 2 次 `/api/backends/chat-completions/generate`。复现同一楼层编辑得到的调用栈来自 shujuku 扩展 `acu-star-database-iii`（`callMainApiChatCompletionText_ACU`），由楼层更新触发，不是 IGS 发起；第一次的时间与补场景标签的写入吻合。没有请求放行。
  - 截图在 `.limcode/preview/st/`（`battle-1280-*`、`cutin-1280-*`、`battle-390-*`）；VS Code 内置浏览器停在同一对局。
- 第 7 项「战斗中刷新后能续战」：通过（合成素材，不发模型请求；页内护栏拦截 0 次）。
  - 步骤：测试酒馆 Seraphina 测试聊天，经开战入口进入战斗面板并开局；按新选牌流程打 2 张牌（攻击牌点野狼、己方牌点主战者）；记下快照后刷新页面，重新注入 IGS、打开聊天与阅读器、进入战斗面板，不出牌直接读回。
  - 刷新前后快照完全一致：第 1 回合，能量 1/3，手牌 `#9 倚树避身`、`#4 防御`、`#2 攻击`，抽牌 15 / 弃牌 2；野狼 31/35、中毒 2；主战者 68/68、格挡 6、敏捷 1；人物技能可用。本地会话记录 `igs-combat:session:<chatId>` 刷新前后均为 7889 字节。刷新后面板直接回到对局，没有重新进入战前。快照存于 `.limcode/cache/p13-7-before.json` / `p13-7-after.json`。

- 第 6 项「换 swipe 和回溯后成长状态正确回退」：通过（合成素材，不发模型请求；页内护栏拦截 0 次；操作前聊天文件已备份到 `.limcode/cache/p13-rollback/p13-6-chat/`，sha256 前缀 `BB06D8553AD66764`）。
  - 步骤：追加合成 AI 楼（第 2 楼）`[igs-combat:exp|User|30|练剑]`，经酒馆事件总线触发 `GENERATION_ENDED`，IGS 补扫写入日志行 `exp|pc-qrm3n6|2|0|10nu9dy|0`；随后给该楼追加不带标签的 swipe 1 并切过去 → 切回 swipe 0 → 再切到 swipe 1 → 删楼，每步保存聊天并按仓库源码在页内另建账本实例只读计算 `effectiveState`。
  - 结果：基线 User Lv1、EXP 0/40；入库后 30/40、成长事件 1 条；切到 swipe 1 回到 0/40、成长事件 0；切回 swipe 0 恢复 30/40；再切走回到 0；删楼后 0/40。日志行本身不删除，失效完全由锚点决定。
  - 发现：用 `TavernHelper.createChatMessages` 追加楼后调用 `reloadCurrentChat`，IGS 的补扫没有写入该标签；改为触发 `GENERATION_ENDED` 后立即入库。正常对话里 AI 楼都经生成结束事件，不影响主路径；打开聊天时的 `CHAT_CHANGED` 全量补扫这次没有在实机单独确认。
  - 为页内只读计算，测试酒馆 `public/igs-local/app/` 下新增了指向仓库 `app/src` 的目录联接（与已有 `dist` 联接同法），只影响测试酒馆，删除联接即还原。

- 第 5 项「剧情 exp / learn 标签入库并播放演出」：通过（合成楼；learn 走真实副 LLM 1 次，助手授权）。
  - exp：合成 AI 楼 `[igs-combat:exp|User|30|练剑]` 经 `GENERATION_ENDED` 补扫入库（同第 6 项），重开最新楼阅读器后成长演出节点显示「EXP User +30」；本页护栏拦截 0 次。
  - learn：合成 AI 楼 `[igs-combat:learn|User|回风斩|借林间回旋的风势横斩一圈]` 补扫后进入待整理队列（不写日志行），阅读器播出占位「整理中 User · 回风斩」。
  - 生成：测试页状态栏没有角色，资料菜单「战斗」入口不出现，构筑面板的「重试」点不到；改为在页内按仓库源码装一份与 bootstrap 同配置的 `createCombatServices`（同一副 LLM 设置、真实 shujuku 接口），调用 `retryGrowth()`。请求前解除了本页护栏。副 LLM 1 次请求 26.4s，回复 111 字；写入日志行 `learn|pc-qrm3n6|3|0|7x6pgs|0`，卡牌 `回风斩`（attack / 2 费 / personal，全体 7 伤害，升级 9）；User 卡池 17 → 18，成长事件 `exp 30`、`learn 回风斩`。
  - 未验证：经构筑面板 UI 点「重试」的路径（实机缺资料菜单入口，只经单元测试）；learn 入库后阅读器把占位换成正式「习得」演出这一步没有在实机单独截取。

  - 本体对照：测试酒馆的状态栏为关闭状态（`statusHud.enabled false`），资料菜单入口不显示。为了不改测试设置，改用 `record-pages` 预览截取本体物品页与战斗面板：`native-inventory-1440.png`、`native-combat-1440.png`，均无 console error、无失败请求，战斗面板无横向或纵向溢出。截图完成后已关闭预览服务（4173）。
  - 未验证：眼部是否落在分格中央（待助手目视确认）；与 IGS 本体面板同屏的观感对照；本局没有队友，队友技能特写没有实机播放；整幅不透明立绘的回落取景；手机实机。
- 近大远小与人物技能按钮（助手要求；合成素材，不发模型请求）：
  - 尺寸：主战者立绘宽 160px（桌面）/ 108px（≤720px），大于敌人 112 / 72px 与队友 68 / 50px。主战者的名字与血条叠在立绘下沿（桌面 −44px、窄屏 −50px），底栏顶部内边距 8 → 2px，把高度留给立绘。
  - 人物技能按钮：圆钮 44px（窄屏 36px），内含图标与费用角标；技能名显示在圆钮下方（12px，窄屏 11px），最多两行；整个按钮宽 64 / 56px，不再是大块信息卡。技能名、费用、效果和是否已用放在 `aria-label` / `title`，可见技能名标 `aria-hidden`，读屏不会读两遍（`combat-panel-render.js` 的 `heroSkillHtml`）。
  - 窄屏收紧：标题栏与主区内边距变小，卡面最小高度 112px、卡图 24px，手牌左右各留 14px，扇形首尾两张不越出面板。
  - 验证：`combat-panel` / `combat-deck-panel` / `combat-growth-fx` 定向 17/17；`npm.cmd run build` 产出 0.36.115（构建不验证下载与启动）。测试酒馆重载、重新注入 IGS、打开合成对局：两张立绘与林间小径背景加载成功，护栏拦截计数 0。
  - 1280×720：主战者 160px、敌人 112px；敌方行、主战者区、技能按钮、手牌、控制区两两重叠面积 0；5 张手牌没有压到主战者区或控制区，相对面板的左、右、下越界均为 0；主区没有纵向溢出；技能名「陷足索套」单行显示、没有被截断（50×16）。
  - 390×844（CDP 视口模拟，不是手机实机）：主战者 108px、敌人 72px；重叠面积 0；逐张手牌相对面板越界 0；主区纵向溢出 0；技能名单行、没有被截断（46×14）。
  - 截图：`.limcode/preview/st/scale6-1280-1200.png`、`scale6-390-1200.png`，量测 JSON 同名；逐张手牌边界在 `bounds6-1280.json`、`bounds6-390.json`。
  - 未验证：本局没有队友，队友小立绘在新尺寸下的排布没有实测；本回合人物技能已用过，按钮的可用和选中状态只经过源码与定向测试；超过两行的长技能名只靠 CSS 截断，没有实测样例；观感待助手目视确认。
- 右上角两个 ×（助手反馈）：
  - 现象：战斗面板打开后，阅读器工具栏的「退出」（×）仍显示在面板「关闭」左侧。
  - 根因：面板打开时给 `#igs-overlay` 加 `igs-record-screen-open`，靠它隐藏工具栏、对话层和状态栏；但阅读器重渲染时 `applyReaderSnapshotToDom` 按快照整串改写根节点类名，快照里没有这个类。调用栈探针捕获到打开约 0.37 秒后的一次重渲染把它去掉。资料、地图、卡组构筑面板（同一个类）与楼层目录（`igs-turn-index-open`）走同一条改写路径。
  - 修复：`reader-dom-render.js` 增加 `PANEL_OPEN_CLASSES`，整串改写时保留根节点上已有的面板开关类；增删仍由各面板自己负责。
  - 验证：语法检查；`combat-panel` / `combat-deck-panel` / `combat-growth-fx` / `turn-navigation-user-floor` 18/18，`unit` / `ui-conventions` / `html-card` 12/12；构建 0.36.115。测试酒馆修复前：打开后 0.5–6 秒每次采样都没有该类，工具栏 `display:block`，「退出」可见。修复后：6 秒内该类一直在，工具栏 `display:none`；关闭面板后该类去掉、工具栏恢复，再次打开又隐藏。1280×720 与 390×844 的右上区域，IGS 内只剩战斗面板的「关闭」。护栏拦截 0。
  - 未验证：资料、地图、卡组构筑、楼层目录面板只按源码推断走同一路径，没有逐个实测。
- 可读性方案 A（助手选定：保留竖排，只改可读性，兼顾竖屏；合成数据，不发模型请求）：
  - 敌方意图：深色底标签，左侧图标（攻击＝武器、防御＝护甲、治疗＝药水、强化 / 削弱＝细线上 / 下箭头、特殊＝星芒，取自 `combat-card-art.js` 的 `intentIconSvg`），有伤害时显示放大的伤害数（17px，窄屏 15px），否则显示意图类别，后接招式名；图标与数字按意图着色（攻击红、防御蓝、治疗绿、削弱紫）。`title` 写完整说明，触屏不依赖它：伤害数与类别都是可见文字。
  - 能量与费用：能量区改为「能量」标签 + 暖色圆标（当前值 20px，`/每回合` 小字），读屏名「能量 当前/每回合」；卡牌费用角标与人物技能费用用同一暖色圆标，卡牌 `aria-label` 与角标 `title` 为「消耗 N 点能量」。抽牌 / 弃牌数量、状态层数加粗。
  - 尺寸按面板而非视口：`#igs-combat-panel` 设为尺寸容器，立绘宽度随面板 `cqw` / `cqh` 放大，下限为原参考尺寸（主战者 160 / 108px、敌人 112 / 72px、队友 68 / 50px），上限防大屏过大；面板宽 ≤720px 时用窄排布，竖向面板（`orientation:portrait`）手牌单独一排、主战者按高度放大。不支持容器查询时回落到原 `@media (max-width:720px)`。敌方行不换行，每名敌人宽 `min(立绘宽, (行宽 − 间距) / 敌人数)`，敌人数由渲染层以纯数字 `--n` 写入。
  - 验证：`combat-panel` / `combat-deck-panel` / `combat-growth-fx` 定向 17/17；`npm.cmd run build` 产出 0.36.115（构建不验证下载与启动）。
  - 本地合成预览（`tools/local-preview`，构建产物，headless Edge；夹具有野狼 ×2、队友白露）：阅读器整页模式（`mode=web`）1440×900、768×1024、390×844，以及满编 5 名敌人（`foes=5`）三个尺寸，均为：敌方行 / 主战者区 / 手牌 / 控制区两两重叠 0，意图标签互不重叠、不出面板，5 张手牌相对面板越界 0，主区溢出 0，技能名未截断，无 console error、无外站请求。尺寸：1440×900 主战者 200px、敌人 140px、队友 85px，底栏三列；768×1024 走竖向分支，底栏两排，主战者 227px、敌人 159px（5 名时 134px）；390×844 主战者 108px、敌人 72px（5 名时 66px，「削弱 低吼」折成两行）、队友 50px。浮窗模式（`pc`，面板 900 / 736 / 358 × 540）同样重叠 0、越界 0、溢出 0。截图与量测在 `.limcode/preview/combat-dist/`（`readW-*`、`foes5-*`、`measure-*`）；VS Code 内置浏览器已打开 5 名敌人的整页场景。
  - 测试酒馆（VS Code 内置浏览器，调试端口 12109；先注入只拦截不放行的请求护栏，再在同页注入本地构建 0.36.115，不刷新页面；切到 Seraphina 测试聊天后重开阅读器，进合成对局，单个野狼）：阅读器为浮窗模式，面板 1280×720 下 900×540、390×844 下 358×540、768×1024 下 736×540。三个视口均为：敌方行 / 主战者区 / 手牌 / 控制区两两重叠 0，意图标签不出面板，5 张手牌相对面板越界 0，主区溢出 0，技能名「陷足索套」未截断。意图显示为紫色「削弱 威慑低吼」，带下箭头图标，390 宽时折成两行（78×32）。能量标签可见，读屏名「能量 3/3」，数字 20px（窄面板 17px）；卡牌可访问名称为「毒淬利矢 消耗 1 点能量 …」。主战者 160px、敌人 112px，窄面板 108 / 72px。浮窗在 768×1024 下仍是横向容器，走三列底栏，竖向分支只在整页模式下触发（已在本地预览验证）。截图与量测在 `.limcode/preview/st/readA-1280*`、`readA-390*`、`readA-768*`。
  - 能量数字偏左（助手反馈）：圆标按「3/3」整串居中，大号当前值相对圆心偏左 5.3px。修复：只让当前值参与居中，「/每回合」改为绝对定位挂在数字右下（`combat-panel-style.js` 的 `.igs-combat-energy-orb`）。定向 17/17，构建 0.36.115。本地预览浮窗 1440 / 390、整页 768 / 390，以及测试酒馆 1280×720 / 390×844 实测：当前值相对圆心 dx 0、dy −0.5；卡牌与人物技能费用角标偏移 ≤0.8px，未受影响。量测在 `.limcode/preview/st/energyfix-*`、`.limcode/preview/combat-dist/energyfix-*`。
  - 测试环境插曲：在同页先 `IGS.shutdown()` 再重新注入时，页面渲染进程停止响应（`Page.enable` / `Runtime.evaluate` 均超时，无原生对话框，CPU 接近空闲），原因未查明。之后重载页面，立即重新注入请求护栏与 IGS，护栏拦截 0。
  - 竖屏优化（助手反馈：竖屏能量多了上限、角色位置别扭）：能量圆标只显示当前值，每回合上限不再可见，读屏名仍为「能量 当前/每回合」（上一条的「/每回合」绝对定位随之撤掉）。高竖向面板（`orientation:portrait` 且高 ≥700px，`combat-panel-style.js` 的 `TALL`）：底栏改为三排——主战者居中、队友在左、人物技能在右；能量 / 牌堆 / 撤退 / 结束回合横成一行放在手牌上方；立绘按面板高度放大，主战者仍大于敌人与队友。浮窗（高 540）与桌面不进此分支。
  - 验证：定向 17/17，构建 0.36.115。本地预览（构建产物，headless Edge）整页 390×844 与 768×1024 各测 1 / 3 / 5 名敌人，带队友白露；整页 1440×900（3 名）、浮窗 390 / 1440（2 名）作回归。全部：两两重叠 0，意图标签互不重叠、不出面板，5 张手牌越界 0，主区溢出 0，技能名未截断。尺寸：390×844 主战者 140px（原 108）、敌人 117px（原 72；5 名时 66px）、队友 62px；768×1024 主战者 225px、敌人 159px（5 名 134px）、队友 92px；浮窗与桌面尺寸与改动前一致（160 / 112 / 68、108 / 72 / 50、200 / 140 / 85）。截图与量测在 `.limcode/preview/combat-dist/tall-*`。
  - 未验证：测试酒馆里没有伤害意图的实机样例（本回合野狼出的是削弱），伤害数只在本地预览中测过；测试酒馆对局没有队友，多敌人与队友排布只在本地预览中测过；整页模式没有在测试酒馆实测；手机实机；观感待助手目视确认。
  - 多人队伍与人物技能按钮（助手要求：人物技能贴近主战者、给助战让位，改成实心方形并放到主战者名字同一排，费用表示与卡牌、能量一致；预览加两名助战；横屏多人对局立绘放大）：我方上限沿用 `COMBAT_TAG_LIMITS.maxAllies` 与 `COMBAT_RULES.maxAllies`，均为 3，即主战者 + 3 名队友共 4 人，规则未改。人物技能按钮放进主战者名字行（`combat-panel-render.js` 的 `unitHtml` 参数 `nameExtra`），为实心方形小按钮：底与卡面同材质（霜夜厚层），费用用与卡牌角标、能量圆标同款的暖色圆标 + 深色数字，后接技能名，高 24px（窄面板 22px），圆角取 `IGS_UI_RADIUS.small`；选中时外圈暖色描环，与选中卡牌一致；`aria-label` 与 `title` 统一写「消耗 N 点能量」；技能名单行省略，名字行放不下时按钮换到名字下一行；点击热区向外扩 8 / 4px。主战者的名字、技能与血条绝对定位贴在立绘下沿，立绘不越出主战者区。原技能列的宽度让给队友：横屏（`SCALE_WIDE`）队友 `clamp(68px,min(14cqh,8cqw),112px)`、队友区上限 `clamp(68px,26cqw,360px)`，主战者 `clamp(160px,min(26cqh,16cqw),232px)`、敌人 `clamp(112px,20cqh,176px)`。底栏写入 `data-mates`（队友数）；有 2–3 名队友时，竖向面板与窄面板走 `PARTY_ROW`：主战者与队友排成一排居中，控制区横排放在手牌上方，队友按比例收窄；宽横屏仍为 `hero hand ctrl` 三列。合成预览新增助战青岚（有立绘）、墨砚（无立绘，用剪影），参数 `mates=1|2|3`。
  - 验证：定向 27/27（combat-panel / combat-deck-panel / combat-growth-fx / combat-directives），构建 0.36.115。本地预览（构建产物，headless Edge；林夕 + 白露 / 青岚 / 墨砚对 3 名野狼），尺寸依次为敌人 / 主战者 / 队友：整页 1280×720 为 144 / 187 / 101px；整页 1440×900 为 176 / 230 / 112px；浮窗 1440（面板 900×540）为 112 / 160 / 72px；整页 768×1024 为 159 / 225 / 92px；整页 390×844 为 117 / 140 / 62px；浮窗 390（面板 358×540）为 72 / 108 / 50px。回归：整页 390×844 5 名敌人 + 1 名队友（66 / 140 / 62px）、整页 1440×900 3 名敌人 + 1 名队友。全部：区块两两重叠 0，意图标签重叠 0，5 张手牌越界 0，主区溢出 0，立绘压到手牌区 / 控制区 0，技能名与主战者名字未截断，console error 0，外站请求 0。技能名长度探测（临时换成 4 / 5 / 8 字）：均未截断、未溢出；8 字名在浮窗 1440 与 390 竖屏换到名字下一行，浮窗 390 三种长度都换行。按钮状态：选中（3 个可选目标）与已用（禁用、能量 1/3）在整页 1280 与浮窗 390 各测一次，重叠 0。费用标识（计算样式，六个视口）：人物技能费用、卡牌费用角标、能量圆标均为圆形暖色底 `rgb(242,212,155)` + 深色数字 `rgb(27,29,33)`，直径依次 18 / 28 / 44px（窄面板 16 / 25 / 38px），数字相对圆心偏移 ≤0.5px；技能按钮底与卡面同为 `rgba(31,34,37,.88)`。版面另用 DOM 命中网格核对（逐格取最上层元素归类成字符图，`tools/local-preview/layout-grid.js`）：技能按钮在主战者名字行右侧，三名队友紧接主战者排开。VS Code 内置浏览器已打开整页 1280×720 四人对局。量测与截图在 `.limcode/preview/combat-dist/fin-*`。
  - 未验证：颜色与质感只核对了计算样式，没有逐像素目视；多人排布只在本地合成预览中测过，测试酒馆与手机实机未测。
- 圆框头像布局、关闭按钮焦点、必杀底色与回合图标按钮（助手标注图与要求；合成素材，不发模型请求）：
  - 布局：我方改为圆框头像（`.igs-combat-portrait` 改为正方形 + 圆角 50%，立绘顶端对齐后按 `--crop` 放大，主战者 1.3 取半身、队友 1.75 取头肩），操控角色外圈暖色。能量 / 牌堆 / 回合按钮缩小后贴在主战者头像右侧，与头像组成 `.igs-combat-hero-core`；底栏只剩 `hero` / `hand` 两区，原 `ctrl` 区、`data-mates` 与 `PARTY_ROW` 删除。敌方行 `space-evenly` 横向散开，宽面板敌人放大到 `clamp(128px,min(28cqh,20cqw),240px)`。竖向与窄面板 `hero` 区居中；高竖向面板队友放不下时换到下一排居中。
  - 关闭按钮：右上角 × 显得突兀，是因为打开面板时程序把焦点放到关闭按钮，按钮外画出 2px 暖色焦点框。面板根加 `tabindex=-1`，打开时以及重绘找不回原控件时焦点落在面板本身（面板 `:focus` 不画框）；Tab 进入控件后照常显示 `:focus-visible`。36px 命中区与关闭行为不变。
  - 必杀底色：`probeSpriteHead` 读像素时另把立绘压到 25×25，取 alpha ≥40 的像素中亮度最高者（`brightestColor`）记为 `tint`，面板写到特写节点的 `--igs-fx-cutin-bg`；读不到像素（跨域污染、加载失败）或全透明时不写，沿用 `--igs-fx-accent` / `#e8445f`。
  - 回合按钮：撤退 / 取消 / 结束回合改为方形 SVG 图标按钮（出门箭头 / 回退箭头 / 沙漏，`record-icons.js` 同款 24 网格细线），不显示文字，`aria-label` 与 `title` 保留原文字；结束回合仍为主按钮配色。
  - 验证：定向 29/29（combat-panel / combat-deck-panel / media-cache-governance / combat-growth-fx / combat-directives），构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；林夕 + 白露 / 青岚 / 墨砚对 3 名野狼）：整页 1280×720、768×1024、390×844 与浮窗 1280 用 DOM 命中网格核对，能量 / 牌堆 / 按钮在主战者头像右侧、队友排在其后（竖屏换到下一排），手牌与头像、控制区重叠 0，主区溢出 0；敌人宽 202px（1280）/ 117px（390），主战者头像 187px（1280）/ 133px（390）。打开后焦点为 `igs-combat-panel`，关闭按钮 outline none。人物技能出手后特写底色为 `rgb(240,212,196)`（合成立绘林夕）。图标按钮 1280 为 36×36 / 44×36、390 为 32×32 / 40×32，可访问名称为「撤退」「取消」「结束回合」，可见文字为空；选目标态「取消」占「撤退」的位置，控制区尺寸不变；console error 0，外站请求 0。VS Code 内置浏览器已打开整页 1280×720 四人对局。
  - 未验证：截图读取只返回元数据，圆框裁切是否落在半身 / 头肩、图标辨识度与整体观感只核对了计算样式与网格，待助手目视；真实立绘的取色效果；测试酒馆与手机实机。
- 撤退位置、人物技能徽章与意图贴近（助手反馈；合成素材，不发模型请求）：
  - 撤退：从「结束回合」旁移到标题栏左侧，与关闭同款透明图标按钮（出门箭头），只在对局进行中且允许撤退时出现，避免与结束回合相邻误触。主战者旁的控制区只剩「取消」（选目标时）与「结束回合」。
  - 人物技能：从主战者名字行移出，改为主战者半身像右侧一列最上方的圆形徽章（44px，窄面板 38px）：深色卡面材质底 + 暖色细描环 + 星形线性图标，左上角暖色费用圆标，右侧单行技能名；选中时描环加外发光，已用时图标变淡。`unitHtml` 的 `nameExtra` 参数随之删除。
  - 意图贴近：原因是敌人立绘框固定 3:4、图片 contain 贴底，狼这类横图上方留大块空白，意图浮在框顶。现在有图的敌人立绘框按图片比例收缩，高度上限仍为 3:4，剪影不变。
  - 验证：定向 29/29，构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；四人对 3 名野狼）：意图标签下沿到图片首个不透明行的距离，整页 1280 / 768 为 2px，390 为 0px，浮窗 1280（面板 900×540）为 1px（改前框顶到图片上沿留白为横图高度差）；撤退 1280 位于 8,12（36×36）、390 位于 4,6，关闭分别在 1234,12 与 348,6；技能徽章在控制区首项、头像右侧，选中态 class 含 `is-selected`，技能名未截断；控制区、头像、手牌、敌方行两两重叠 0，控制区未出视口，主区溢出 0；console error 0，外站请求 0。
  - 未验证：截图只返回元数据，徽章与撤退位置的观感待助手目视；真实立绘（非横图）下的意图间距；测试酒馆与手机实机。
- 右下角回合组、能量位置与队友排布（助手要求；合成素材，不发模型请求）：
  - 撤退改为奔跑小人图标，与结束回合（沙漏）及选目标期间的取消合成右下角回合组 `.igs-combat-turn`，作为底栏网格区（宽屏 `hero hand turn` 第三列，竖屏 / 窄屏手牌下方靠右），不用绝对定位、不压手牌；按钮改扁平（宽大于高、无阴影，撤退透明底）。抽牌 / 弃牌数量移到回合组上方。标题栏只剩标题与关闭。
  - 能量圆标叠在主战者头像左上角，「能量」字在圆标下；头像右侧只留人物技能徽章。队友小圆头像排成一排、底边对齐、不换行。
  - 中间态问题：撤退单独绝对定位到右下角时，390 竖屏压到手牌 352px²；改为网格区后 768 竖屏仍压手牌 637px²，竖向面板手牌下补 24px 后消除。
  - 验证：定向 29/29，构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；四人对 3 名野狼）：回合组距面板右 / 底 1280、768 与浮窗 1280 为 30 / 24px，390 为 16 / 12px；牌堆在回合组内、位于按钮上方；回合组与手牌、头像重叠 0；队友头像顶边与底边落差 0、互相重叠 0、与手牌重叠 0；能量圆标相对头像 (-6,-6)；选目标态回合组为取消 + 结束回合；主区溢出 0，console error 0，外站请求 0。
  - 未验证：截图只返回元数据，扁平按钮与小人图标的观感待助手目视；测试酒馆与手机实机。

- 速度行动值时间轴、牌堆位置、队友排布与行动顺序槽（助手确认：速度程序给定并写表 / 行动值时间轴 / 同意升规则版本 / 逐个播放；合成素材，不发模型请求）：
  - 规则：`COMBAT_RULES.version` 1→2；新增 `defaultSpeed 100`、`speedJitter 5`，职业原型速度（战士 100、守护 88、游侠 112、刺客 120、法师 96、祈司 98、召唤 94、乐师 106）与敌人档位速度（普通 100、精英 104、首领 92）；`combatSpeedFor({ archetype, tier, id })` 按基准 ± 按 ID 散列浮动，确定性。
  - 档案：生成组装（deck-character 按职业原型、skill-character 用默认、enemy 与模板敌人按档位）写入 `base.speed`；schema 中 `base.speed` 可选（40–200），缺省时不补字段；旧档案由 `session.js` 按同一规则回落，旧表不改写。表结构不变（速度在定义 JSON 内）。
  - 引擎：阵营整块推进改为行动值时间轴（`startUnit` / `endUnit` 逐单位结算回合开始 / 结束效果，`act` 事件标记每次自动出手，快的单位可在主角下一回合前出手多次）；只读 `upcomingActors` 推演出手顺序。旧版本进行中战斗恢复时判规则版本不符作废。
  - 面板：抽牌 / 弃牌移到右下角回合组上方；队友头像一排底边对齐；右上角关闭按钮左侧新增行动顺序槽（接下来 6 次出手，首位放大暖色环，我方绿环、敌方红环）；结束回合后演出按出手者逐段串行播放（每段至少 600ms），出手者立绘外发光。
  - 测试调整：三条队友托管策略用例改为先模拟轮到队友（时间轴下队友在自己行动时才抽牌回能）；面板用例的敌方阶段断言改为 `act` 事件。新增时间轴（快敌两次出手、顺序推演与实际一致、非法速度拒绝）、速度规则与档案速度字段用例。
  - 验证：战斗相关 12 个测试文件 93/93，构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；四人对 3 名野狼）：顺序槽在标题栏内、与标题和关闭重叠 0、不出视口，1280 / 390 / 浮窗 1280 / 768（5 敌）均显示 6 个头像；结束回合后 0.3s 时首个出手的敌人带 `is-acting`；console error 0，外站请求 0。
  - 未验证：截图只返回元数据，顺序槽与逐个演出节奏的观感待助手目视；速度数值平衡未经实战调整；测试酒馆与手机实机。

- 行动条（助手要求：出手槽改成一长条 SVG 线，参战头像向右移动，到达出手点时出手、暂停移动，出手完毕后继续；合成素材，不发模型请求）：
  - 引擎：新增只读 `actionProgress(state)`（每个存活单位 1 − 剩余行动值 / 行动间隔，0 起点、1 出手点，三位小数）；`act` 与 `turn-start` 事件附 `track` 进度快照。结算逻辑与随机数消耗不变。
  - 面板：标题栏右侧行动顺序头像列改为 `.igs-combat-track`：SVG 细线（四分刻度）+ 右端暖色菱形出手点，头像按 `--p` 沿线定位，我方在线上、敌方在线下，操控角色暖色环。结束回合时先把头像放到动作前进度（操控角色回到起点），再逐段串行：头像 0.5s 前进到该段快照（出手者到达出手点）→ 暂停移动并播放出手演出（至少 600ms）→ 出手者瞬移回起点 → 下一段。减少动态效果时不做过渡。可访问名称仍为「行动顺序：…」。
  - 验证：战斗相关 12 个测试文件 93/93（新增断言：出牌阶段操控角色进度为 1，每个 `act` 快照中出手者为 1，`turn-start` 快照中操控角色为 1，进度均在 0–1；面板标题栏含操控角色 `--p:1` 的行动条头像），构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；四人对野狼）：整页 1280、390、浮窗 1280、768（5 敌）行动条在标题栏内，与标题、关闭重叠 0，头像不出行动条、不出视口，我方头像均在线上、敌方在线下，旧顺序槽节点 0；结束回合后 0.25s 时首个出手的敌人位于出手点并带 `is-acting`；动画全部播完后头像位置与引擎最终进度一致（操控角色 1，刚出手的青岚 0.041，野狼 0.051）；console error 0，外站请求 0。
  - 未验证：截图只返回元数据，前进与暂停的节奏、头像在出手点附近扎堆时的可辨识度待助手目视；测试酒馆与手机实机。
- 单位呼吸、能量槽与状态标签（助手要求：按 IGS 呼吸设置决定是否呼吸；能量圆标去掉「能量」字、用简单盈能动画表达资源槽；Buff / Debuff 不再顶起头像；合成素材，不发模型请求）：
  - 呼吸：绑定「立绘活动」总开关 `readerSettings.spriteMotion.enabled` 与其中的「待机呼吸」`spriteMotion.breathing`（「同屏角色呼吸」`castBreathing` 只管舞台陪衬，未复用）。reader-host 给战斗控制器注入 `breathing()`，读当前阅读器快照；控制器每次重绘在面板根写 / 撤 `data-igs-combat-breathe`，减少动态效果时不写。立绘 img / svg 用独立 `scale` 属性做 4.6s 呼吸，不占我方头像裁切用的 transform；倒下单位不呼吸，按序号错开相位；低画质档与 `prefers-reduced-motion` 由 CSS 停。
  - 能量：删去可见的「能量」字（`aria-label`「能量 当前/每回合」保留）；圆标外圈 3px 细环按 `--fill`（当前 / 每回合）顺时针填暖色、其余为暗轨，有能量时球内一道亮光自下而上循环流过（2.4s）；能量为 0 时 `is-empty` 球转暗、不流光。低画质与减少动态效果时流光停。
  - 状态标签：根因是 `.igs-combat-statuses` 在单位块正常流里、可换行，队友 / 敌方行 `align-items:flex-end` 底对齐，状态行一多单位块变高，头像被往上推。改为绝对定位在名字行上方（叠在立绘 / 头像下沿），不占单位块高度；最多两行（队友一行），超出裁掉，不盖意图标签。
  - 验证：战斗相关 12 个测试文件 + ui-conventions 97/97（新增：呼吸标记随 `breathing` / 减少动态效果写撤、能量无可见字且 `--fill` 与 `is-empty` 随能量变化），构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；三人对 3 名野狼 1280 / 390，四人对 5 名野狼 768）：给每个无状态单位注入 4 个状态标签前后，所有单位与头像矩形完全一致；状态区不出面板、与意图标签重叠 0、高度 ≤33px；能量圆标可见文字只有数字，外环 `conic-gradient` 填满、流光动画在播；呼吸属性开时立绘动画为 `igs-combat-breathe` 且 transform 未被改写，关时为 none；`#igs-overlay` 设 `data-igs-quality="low"` 时呼吸与流光均为 none；console error 0，外站请求 0。
  - 未验证：截图只返回元数据，呼吸幅度与流光观感待助手目视；`prefers-reduced-motion` 的 CSS 分支未在浏览器内模拟；测试酒馆与手机实机。
- 液体能量槽与选牌流程（助手要求：能量槽改成球内液体、用一部分少一部分、液面有波动；助手反馈：非攻击卡点击后直接使用，不能选对象或取消；合成素材，不发模型请求）：
  - 能量槽：替换上一条的外环 + 流光。深色玻璃圆槽 + 暖色细环，槽内暖色液体，液面高度 = `--fill`（当前 / 每回合）；整块重绘后控制器用 WAAPI 从上次液面过渡到新液面（520ms）；液面两层波纹横向错速流动；能量为 0 时液体沉到槽底以下、数字转淡。减少动态效果、低画质或首次渲染时液面直接到位，波纹静止。数字仍是唯一可见文字，`aria-label`「能量 当前/每回合」不变。
  - 选牌根因：引擎对不选目标的牌只给一个合法动作，`resolvePlay` 见到唯一动作就直接打出，面板从不进入选中态；`target:'ally'` 效果在引擎里固定给生命比例最低的队友，玩家无法指定。
  - 选牌改法：点牌 / 人物技能只进入选中态。要选目标的点高亮目标打出；不选目标的高亮承受方（视图模型 `affects`：自身、全体队友或全体敌人），必须点到其中一个角色才打出（助手后续要求：对自己用的点主战者，可对队友用的点我方单位，去掉「再点一次牌确认」）；再点一次已选中的牌即撤销；本地预览浮窗 1280 / 整页 1280 / 整页 390 复测：选中后只有主战者可点，再点牌撤销、能量与手牌不变，点主战者后能量 3→2、手牌 5→4；取消按钮与 Esc 撤销（Esc 先撤销选中，再按一次才关面板）。
  - 引擎：`target:'ally'` 的牌 / 技能在 `legalActions` 中为每名存活己方单位各给一个动作，`targetsFor` 指定时作用于该单位；不指定时仍按生命比例最低者（旧记录、托管、被动、敌方技能不变），敌人作目标判 `invalid-target`。规则版本不变：新记录只多出可选的己方 `targetId`。
  - 验证：战斗相关 12 个测试文件 + ui-conventions 99/99（新增：选中不打出、取消与 Esc 撤销、承受方高亮与确认、承受方外的单位判 `combat-target-invalid`、攻击牌点敌人打出；引擎「为一名队友」可指定 / 缺省 / 拒敌方），构建 0.36.115（build 输出注明未验证下载与启动）。本地预览（构建产物，headless Edge；三人对 3 名野狼 1280 / 390）：点防御类牌后能量与手牌不变、出现取消、只有主战者可点；取消后选中清空；再选并点主战者后能量 3→2、手牌 5→4；攻击牌选中后 3 名敌人可点，点敌人后能量 2→1；液面高度依次为球高的 100% / 67% / 33%，与 `--fill` 一致，波纹动画在播，低画质时为 none；console error 0，外站请求 0。
  - 未验证：截图只返回元数据，液体与波纹观感、液面下降过渡待助手目视；`prefers-reduced-motion` 分支未在浏览器内模拟；「为一名队友」类牌在预览卡组中没有，只经引擎与面板单测覆盖；测试酒馆与手机实机。




- 第 3 项「完整打一局，战报自动发送并折叠显示」：通过（真实主模型 `Doubao-Seed-2.1-lite` 1 次续写，助手授权；只做观察记录）。
  - 对局：删除第 5 / 6 项的合成成长楼后，第 1 楼开战楼重新成为最新楼；续上第 7 项的对局打到胜利（共 5 回合，出牌 13 张，野狼 0/35，User 65/68），约 32s，不发模型请求。
  - 战报：点「发送战报」后作为第 2 楼用户楼落楼（595 字，`result="win"`，末尾 `[igs-combat:exp|User|20|战斗:r1i9t8bn]`）；楼层显示为折叠的「战斗记录」（`details` 默认收起，可见文字只有「（战斗结束） 战斗记录」）。
  - 续写：主模型 92s 内写出第 3 楼（1033 字），按战报顺序把交手过程写成剧情，Seraphina 赶到；正文里没有卡牌用语（卡牌 / 手牌 / 能量 / 回合 / 格挡等 0 处）。
  - 发现一（已修）：战报落楼后面板一直停在「发送中」、待回传记录不清。根因是发送回执只读楼层的 `mes` / `text`，而 `TavernHelper.getChatMessages` 返回的行正文在 `message`；同文战报楼在场却始终匹配不上。`tavern-helper-adapter.js` 的回执改为依次读 `mes` / `message` / `text`；`turn-navigation-user-floor.test.js` 补回归用例（TavernHelper 行格式下同文新用户楼返回 `{ ok:true, sent:true, messageId }`，只发送一次）。
  - 发现二（已修）：`session.resume()` 发现战报楼已在聊天里时只清会话存档，没有清同场待回传，残留记录会让面板一直显示可重试。现在一并清掉；`combat-session.test.js` 补回归用例（落楼但回执未确认 → 续战后状态 `done`、会话与待回传均为空、不重发）。实机刷新后残留记录已清除。
  - 发现三（未改，只记录）：主模型在续写末尾自己补了一条 `[igs-combat:exp|User|20|林间击退拦路野狼]`，与战报楼的 EXP 标签同时入库，这场胜利实际计了 40 EXP（User 升到 Lv2）。剧情 EXP 每楼上限 50，所以没有越界，但等于重复计数。是否要在提示词或扫描侧排除战报后的续写楼，留给助手决定。
- 第 4 项「失败流程发送失败剧情提示」：通过（真实主模型 1 次续写，助手授权）。
  - 对局：追加合成开战楼（第 4 楼 `[igs-combat:start|林间小径|野狼]`），只结束回合直到败北（13 回合，User 0/72 倒下，野狼 39/39 无伤）。
  - 战报：第 5 楼用户楼 `result="lose"`，逐回合列出野狼出手，终局「我方力竭落败」；**没有 EXP 标签**；楼层同样折叠为「战斗记录」。
  - 续写：第 6 楼 1156 字，写新出现的更凶的野狼压制、主角倒下、Seraphina 用藤蔓和屏障护住并准备传送回庇护所；没有卡牌用语，也没有自补 EXP 标签。
  - 过程：页面刷新后测试酒馆主 API 显示未连接，DOM 发送路径把战报填进了输入框，但酒馆的发送按钮处于隐藏状态，没有真正发出；IGS 一直停在「正在读取原消息的发送回执」，没有重复发送。重新连接主 API 后点酒馆发送按钮（等同用户手动发送输入框里的内容），战报落楼，IGS 读到回执自动结清：待回传与会话均清空，面板显示「战报已发送」。
- 第 13 步收尾：7 项全部完成。测试酒馆 `public/igs-local/app/src` 目录联接（指向仓库 `app/src`，为页内只读计算账本而加）仍保留，删除联接即还原；聊天文件各阶段备份在 `.limcode/cache/p13-rollback/`。
- 未验证：手机实机；构筑面板 UI 里的「重试」按钮路径（测试页缺资料菜单入口）；learn 入库后阅读器把占位换成正式「习得」演出这一步。


## v2 实施记录

设计见 `.limcode/design/combat-expansion-v2.md`，计划见 `.limcode/plans/combat-expansion-v2.plan.md`。

### 方案 A：战报续写不写战斗标签

- `scene/combat-prompt.js` 的 `NARRATION_COMMON` 改为本层不写任何 `[igs-combat:…]` 标签，说明历练与收获已由战报结算。扫描与账本语义不变。
- 验证：`combat-prompt-assembly` / `combat-report-regex` 7/7，构建通过。后续测试酒馆的第 10 楼战报续写未写战斗标签，见下方集中复核记录；单例不代表模型持续遵从。

### 阶段 1：生成、稀有度与强度档

- 稀有度窗口：`rules.js` 改为显式 `rarityWindows`（min / max / target），下限沿用 v1，罕见 0.8–1.25、稀有 0.7–1.4、个人 0.7–1.35、专属 1.2–1.6，新卡向 target 求解（例：2 费攻击普通 10 → 专属 15）。未登记稀有度改为拒收 `invalid-rarity`。
- 模板：新增 20 个复合 / 缝合卡牌模板（如 `shatter` 伤害 + 易伤 + 虚弱、`execute` 易伤时追加伤害、`adrenal` 能量 + 抽牌后消耗、`counter` 格挡 + 虚弱 + 低血追加格挡）与 7 个复合技能模板；扫描 44 个卡牌模板 × 0–3 费 × 5 种稀有度，所有有解组合都通过 `normalizeCard`，技能模板全部通过 `normalizeSkill`。0 费只有部分模板有解，提示词列出「0 费槽可用」清单。
- 生成：费用由程序按槽位给定，模型只回 `[卡名, 模板键]`。职业卡费用曲线在范围内按角色确定性挑选（11 张：0 费 ≤1、1 费 4–6、2 费 3–4、3 费 1–3），个人卡 4 张在 1–3 费内；起始卡组按费用加权确定性抽取（助手要求：不要太整齐也不要太乱），同一角色重试结果一致。`profile-deck` 可选 `signature`（2 / 3 费专属卡），`profile-skill` 可选 `tier`。
- 专属卡：不进起始卡组、不进奖励三选一与副 LLM 升级候选；剧情 learn 写到同名技能时直接解锁，再次出现转为精进，不发副 LLM 请求；日志里不在档案登记中的专属卡拒收。
- 强度档：技能角色 ace / legend 进战斗时生命、技能数值按倍率放大，并追加带冷却的绝招，托管冷却结束即优先使用；peer 档 setup 形状与旧版一致。构筑面板可切换档位，服务层追加新版本档案并读回确认。
- 界面：稀有度外观选了不加整圈描线的方案（顶边高光 + 费用外环 + 卡图光晕，专属卡加流光），与本体扁平风格较协调；构筑面板显示未解锁专属卡与强度档按钮。
- 验证：战斗相关 7 个测试文件 75/75，构筑面板 6/6（新增稀有度窗口、可选字段、费用槽位、费用曲线范围与确定性、起始卡组形状与副本上限、专属卡解锁 / 精进 / 伪造拒收 / 奖励排除、强度档放大与绝招优先、强度档写回读回用例）。本地预览（构建产物，headless Edge，整页 1280 / 390）：手牌 `data-rarity` 与计算样式按稀有度正确，基础卡无稀有度色，手牌不越界；构筑面板显示「2 · 天翔一闪 · 未解锁」，无溢出，console error 0，外站请求 0。VS Code 内置浏览器已打开对局场景。
- 未验证：真实副 LLM 对新提示词（槽位、专属卡、强度档）的遵从度；稀有度颜色观感待助手目视；测试酒馆与手机实机。强度档倍率为暂定值。
- 后续完成：设计第 4B 节所需的新效果原语已在阶段 2 随规则 v3 实施；X 费按能量重复沿用原有行为，见下节。


### 阶段 2：觉醒与规则 v3

- 标签：`[igs-combat:awaken|角色|类型|台词]` 只认紧邻开战标签上一非空行的那一条，并入 `start.awaken`；类型为 8 种中文名（怒火 / 守护 / 悲恸 / 决意 / 羁绊 / 极限 / 复仇 / 不屈）或内部键，台词 ≤30 字可空。错位记 `combat-awaken-misplaced`，栏位非法记 `combat-awaken-invalid`，开战照常；开战锚点与 tagHash 不变，awaken 不进成长账本。
- 会话：只有点名角色是本场被操控者（主角可写「我」/ 主角名 / 别名）时写入 `setup.awaken = { type, line }`；点名他人或换人操控时不写入，`start()` 返回 `awakenDropped`。无觉醒时 setup 形状与旧版一致。
- 提示词：开战语法加入 awaken 写法与触发约束（只在重大情绪节点写），战报续写同样禁写觉醒标签。
- 规则 v3：`COMBAT_RULES.version = 3`，v2 进行中战斗按 `rules-version-mismatch` 作废（已确认接受）。新增效果 `damage-from-block`、`self-damage`、`double`（中毒 / 格挡 / 力量）、`next-turn`（抽牌 / 能量）、`each-turn`（能力牌每回合开始触发）、`hand-cost`（本回合手牌费用修正，最低 0，X 费不变），伤害可选 `strengthScale`；新状态 `intangible`（受伤降为 1，下次本单位回合开始衰减）、`no-draw`（本回合禁抽）、`endure`（首次致死保留 1 生命并获 8 格挡）。各效果都有估值；`damage-from-block` 在技能伤害上限校验中按超限处理。X 费按能量重复沿用原有行为。
- 觉醒动作：`{ type: 'awaken' }` 每场 1 次、不耗能量，效果由 `COMBAT_RULES.awakenEffects` 固定（与设计第 6.2 节一致）；非法 `setup.awaken` 拒绝建局。
- 界面与战报：人物技能徽章上方的觉醒按钮按情绪着色，用后消失；觉醒特写为全屏情绪色幕 + 母题纹样 + 粒子 + 眼部裁切窄带 + 类型名与台词，台词只经 `textContent` 写入；低画质去粒子，减少动态效果时静态淡入淡出。战报在觉醒回合首写「角色 觉醒：类型『台词』」。
- 验证：战斗相关 12 个测试文件 116/116（新增觉醒解析 / 错位 / 非法栏位、setup 只给主战者与续战保留、v3 各效果结算与估值、schema 接受与拒收、觉醒动作次数与决意降费恢复、不屈重放一致、面板视图 / 特写 / 战报觉醒行）；构建 0.36.115 通过（下载、loader、启动未验证）。本地预览（构建产物，headless Edge，整页）1280 决意 / 390 怒火：按钮 104×44、情绪色正确、控制区不压手牌；点击后全屏特写含眼部裁切，台词在视口内，用后按钮消失，console error 0，外站请求 0。VS Code 内置浏览器已打开觉醒场景。
- 后续实机：测试酒馆已验证一次怒火标签、效果与特写，见集中复核记录。仍未验证：长期触发频率、其余觉醒类型的实机效果、手机实机；特写与情绪色观感待助手目视。
- 未做：特写分型（专属卡特写、队友侧边竖条、绝招竖向切入）仍是待办 `v2-cutin-variety`，尚未写入设计。

### 阶段 3：装备与一次性道具

- 标签：`[igs-combat:equip|角色|名称|部位|简述]`（部位 武器 / 防具 / 饰品 / 宝物）、`[igs-combat:unequip|角色|名称]`、`[igs-combat:item|角色|名称|数量|简述]`（数量 1–3，缺省 1）；非法部位与超量只记诊断。提示词加入三种写法。
- 账本：新类型 `equip` / `unequip` / `item` / `consume`；同部位后装备顶替、旧装备留在背包；道具同名累加，消耗超余量整条拒收；`gearIdFor` / `itemIdFor` 由名称确定性推导。锚点规则同 EXP，换 swipe 或删楼自动回退。
- 生成：equip / item 标签进待整理队列，副 LLM 新类型 `equip-to-passive` / `item-to-consumable` 只回模板键，名称、部位、数量与 ID 由程序给定；宝物被动按 rare / common 求解中心之比加强；道具模板 6 种（回复、格挡、全体伤害、净化、能量、抽牌），新增效果 `cleanse`。unequip 扫描时直接落账。
- 战斗：已装备的被动随角色进入 setup；被操控者持有的道具写入 `setup.items`；道具动作不耗能量、每回合 1 次；战报落楼后按用量写 `consume`（锚定战报用户楼，ID 确定、重复落账幂等）。战报与演出把道具使用视为一次出手。
- 界面：战斗道具栏（人物技能下方圆钮 + 余量，用完不显示）；构筑面板装备栏（四部位固定顺序、空部位标「空」）、背包「装上」、已装备「卸下」与道具余量，换装锚定最新楼层并排在同楼标签之后，战斗进行中只读。
- 验证：战斗相关 12 个测试文件 123/123（新增标签解析、账本顶替 / 卸下 / 消耗 / swipe 回退、生成与定向修正、宝物加强、道具动作次数与净化、setup 带入与 consume 落账读回、面板换装与只读、道具栏使用与提示）；构建 0.36.115 通过（下载、loader、启动未验证）。本地预览（构建产物，headless Edge，整页，`gear=1`）1280 / 390：道具栏 1 个按钮余量 2，使用后余量 1 且本回合禁用，手牌不越界；构筑面板列出「武器 · 玄铁剑 / 防具 · 空 / 饰品 · 空 / 宝物 · 空」、背包青锋剑、回春丹 ×2，装上后按钮数正确，无横向溢出；console error 0，外站请求 0。VS Code 内置浏览器已打开道具场景。
- 后续实机：测试酒馆已验证青铜短剑与疗伤药水的生成、换装、消耗及 swipe 回退，见集中复核记录。仍未验证：更多场景下的模板选择质量与主模型标签遵从度、手机实机；观感待助手目视。
- 技术债：本体物品系统与战斗装备不同步（设计第 7.3 节确定）；道具模板数值为暂定值。

### 阶段 4：NAI 卡面

- 服务：新建 `generated-images/illustration/card-image-service.js`，不改物品图服务的类型与键；写词沿用物品图提示词（`imagePrompt.task:'item'`），出图 `imageKind:'item'`，尺寸跟随 `itemImages.size`，抠图与透明底判定同物品图。资产 `type:'card'`、键 `chatId|card|卡ID`，存 `igs-generated-assets`，按聊天隔离，不写 shujuku。存储与物品图共用 `withTavernGeneratedAssetFiles` 包装：酒馆接口可用时记录随 `igs-asset-records.json` 备份、图片上传到 `user/images/igs-media/`。集中复核已确认记录备份、图片上传及当前浏览器重载后读回；同酒馆另一浏览器或设备读回尚未验证。`createItemRecordCache` 增加 `owner` 参数（缺省 `item-records`），卡面登记 `card-records`。
- 触发：只有构筑面板「生成卡面 / 重画卡面 / 重试卡面」调用 `generate`，一次点击只为该卡写词、出图各一次；同卡在途复用，任务串行；换聊天或停止后结果作废、不落库。打开面板、重绘与战斗取图只读本地：首次分页读本聊天 ready 记录建索引，图片后台补载后发 `igs:card-image-updated`。
- 失败：重画失败保留旧图，失败原因按卡显示（只存会话内存），重试成功清除；成功后删旧图。
- 界面：构筑面板卡牌行加 36px 缩略，有图用图、无图回退线条图标；战斗手牌有图用 `<img>`，无图回退 SVG。卡面更新时结算中不重绘，演出计时未走完则推迟到演出结束；战斗进行中构筑面板只读，不显示卡面按钮。升级三选一奖励原本只显示名称与费用的文字按钮、没有卡图，本阶段未接入卡面。
- 验证：新增 `card-image-service.test.js` 4 项，构筑面板与战斗面板各新增 1 项；卡面服务、两块面板、物品图服务与生命周期、媒体缓存治理 6 个文件共 30/30。构建 0.36.115 通过；`dist/igs.bundle.js` 经 `scripts/bundle-startup-check.js` 冷启动、关闭、重启通过（auto / manual 两种模式）；下载与 loader 未验证。本地预览（构建产物，headless Edge，`mode=web`，合成参数 `cardart=1` 在启动前写入 c1 / c2 / m1 三张合成卡面）1280 / 390 结果如下：
  - 构筑面板：3 张缩略图已解码，5 张回退 SVG，8 个卡面按钮（其中 3 个为「重画卡面」）；卡牌行不超出面板，无横向溢出。
  - 战斗手牌：2 张用图（m1 ×2），3 张回退 SVG。
  - 全程未点卡面按钮；console error 0，外站请求 0，写词与出图请求 0。
  - VS Code 内置浏览器已打开卡面构筑场景。
- 后续实机：测试酒馆已完成一次真实卡面生成并解码显示，见集中复核记录。仍未验证：NAI 请求路径与次数、跨浏览器读回、手机实机；卡面观感待助手目视。
- 技术债：卡面沿用物品静物提示词，画面偏单体图标风格，是否需要专用卡面提示词待实机出图后再定；失败原因不跨重载保留（按设计）；聊天删除后的卡面记录清理沿用生成素材存储的现有机制，未单独核验；设计第 8 节写「换设备不同步」，实际沿用物品图存储包装、会随酒馆文件备份同步；助手已确认保持现状（方案 A，与物品图一致），代价是占用酒馆磁盘。

### 测试酒馆集中复核（计划第 13 项）

助手授权真实主模型、副 LLM、战斗表写入与 1 次卡面生成。环境：测试酒馆 `127.0.0.1:8000`，VS Code 内置浏览器调试端口 7346，本地构建 0.36.115 经 `/igs-local` 同源注入。Seraphina 测试聊天复核前备份在 `.limcode/cache/p13-rollback/p13v2/`（`chat-before.jsonl` sha256 前缀 `27CE7485FA4C91B2`，`igs-settings-before.json` `5B48C94CB7BD2C61`，`st-settings-before.json` `DA5320C164E15FB3`）。

- 标签：主模型 1 次续写（第 8 楼）写出 `equip|我|青铜短剑`、`item|我|疗伤药水|2`、`awaken|我|怒火`、`start|林缘突袭|野狼*3|Seraphina|普通`，awaken 紧邻开战标签，解析无诊断。副 LLM 1 次请求（约 52s）落账：青铜短剑被动为开战获得 1 层力量，疗伤药水回复 12、余量 2。战前为 Seraphina 生成技能档案（职业「翠林守愈者」，约 59s）。
- 觉醒与道具：开战后 `setup.awaken` 为怒火，`setup.items` 带疗伤药水 ×2，装备被动进入单位 `passives`。觉醒按钮 104×44，点击后播全屏怒火特写（眼部裁切，台词在视口内），按钮消失，能量 3/3 → 4/3、力量 1 → 4。道具用后余量 2 → 1 并禁用，同回合再点提示「本回合已经用过道具或道具已用完」。
- 对局与战报：6 回合胜利（约 38s），User 72/72、Seraphina 33/62。第 9 楼战报落楼，写入 `consume`（消耗 1 瓶）。主模型续写第 10 楼 1594 字，没有战斗标签（方案 A 的首个实机样本，只有一例）。
- 构筑面板换装：入口在状态栏资料菜单，测试设置里状态栏原为关闭，复核期间临时开启，结束后已关回。卸下后武器槽空、短剑进背包；装上后恢复。两条面板条目都锚定第 10 楼。
- 卡面（同步方案 A）：点「绊足射击」后副 LLM 写词 1 次（约 54.5s），按钮变为「重画卡面」，图片解码为 970×686。IndexedDB 记录键为 `<chatId>|card|cls-14kilbs-c6`、类型 `card`，`dataUrl` 指向 `user/images/igs-media/`；酒馆 `igs-asset-records.json` 有卡面记录，图片目录新增一张 PNG（191416 字节）。页内请求计数器只捕获到写词请求，NAI 出图请求的路径与次数未核实；另一浏览器读回未验证。
- swipe 回退（发现并已修）：第 8 楼追加不带标签的 swipe 1 并切过去后，道具回到空，青铜短剑却仍在。根因：第 10 楼的面板 equip 条目载荷带完整装备字段，`HANDLERS.equip` 按载荷重写拥有记录，来源标签楼失效后又把装备带回。修复：`ledger.js` 的 equip 遇到 `tagHash = GEAR_TAG_HASH` 时只把已拥有的装备放进槽位，未拥有记 `combat-gear-missing`；标签 equip 行为不变。回归：`combat-ledger.test.js` 新增 1 项（标签 equip → 面板卸下 / 装上 → 来源楼换 swipe 后不复活并记诊断 → 切回恢复），账本 15/15；`combat-deck-panel` 与 `combat-session` 合跑 18/18（deck-panel 单跑 8/8，包含在前述 18 项内）。构建 0.36.115，调试包包含修复片段；`checkBundleStartup` 对 `dist/igs.bundle.js` 的 auto / manual 启动、关闭、重启通过。本地同源 loader 加载见下条；远程下载与发布导入件未验证。
- 修复后实机复验（不发模型请求）：页内强制重取的 bundle 与本地 dist sha256 前缀一致（js `7096E3A700B5137B`、css `9B02FC61BD37D2A1`），整页刷新后重新注入 0.36.115，状态 ready、无报错。切到 swipe 1：构筑面板四部位全空，没有背包与道具。切回 swipe 0：按仓库源码另建账本只读读回，武器为青铜短剑、疗伤药水 ×1，无装备 / 道具诊断；关闭并重开构筑面板，显示一致。
- 发现（未改，记录）：构筑面板只在打开和写入后重读账本，不订阅聊天变化。本次由探针在面板打开时换 swipe，面板显示旧状态，关闭重开后正确。
- 收尾状态：状态栏已关回（统一设置与本地阅读器设置读回均为 false），NAI 配置按助手要求保留（模型名仍在，Key 未回显）。测试聊天停在第 8 楼 swipe 0，该楼保留合成 swipe 1；第 9、10 楼与战斗表新增数据未删除，需要时按上述备份还原。
- 未验证：NAI 出图请求的路径与次数；另一浏览器或设备读回卡面；手机实机；主模型写 awaken / equip / item 的遵从度与战报续写不写标签都只有一例样本。

### 收尾与后续事项（计划第 15 项）

- 本轮授权范围：v2 阶段 1–4、本地构建、定向行为验证与测试酒馆集中复核已完成。装备回退修复复用现有账本处理函数，无新增运行时抽象或表结构迁移。
- 交付产物仍为本地 `0.36.115`；最后一次运行逻辑变更后已构建并完成启动与实机复验，后续仅更新文档。未升版本、提交、推送或打标签；全局 `p14` 发布事项等待单独授权。
- 临时实机探针位于 `app/tools/st-probe/`，CDP 工具为 `app/tools/st-cdp.mjs`，当前未受 Git 忽略规则覆盖；它们属于本地调试材料，发布暂存时必须排除。备份与测试聊天保留，不整体回滚设置，以保留助手要求的 NAI 配置。

| 后续事项 | 当前边界与保留原因 | 下一步与触发时机 |
|---|---|---|
| 构筑面板外部变更刷新 | 面板打开期间由探针换 swipe 会继续显示旧快照；关闭重开后与账本一致。本轮已修复拥有记录回退，未扩展面板订阅机制。 | 后续面板同步任务中接入聊天变更通知，并验证换 swipe、删楼与切聊天时的草稿处理；当前需关闭重开。 |
| 模型遵从与数值平衡 | 觉醒、装备、道具和战报续写只有单例实机样本；强度档倍率、速度与道具数值仍需实战调整。 | 后续获授权的真实对局中积累样本；不为收尾重复付费请求。 |
| 卡面同步与存储生命周期 | 已确认酒馆文件备份、图片上传和本浏览器重载读图；其他设备及聊天删除后的清理未独立验收。同步按助手选择的方案 A，使用酒馆磁盘。 | 跨设备验收时用同一酒馆、同一聊天只读验证；后续缓存治理任务核验聊天删除清理。 |
| 卡面生成观察 | 一张卡面已生成并解码，但未捕获 NAI 请求路径与次数；沿用物品静物提示词，风格是否合适仍需反馈。 | 下一次获授权生图前完善请求观察；若需要专用卡面风格，再单独确认提示词任务。 |
| 其他显示验收与特写分型 | 手机实机、部分视觉观感尚未验收；`v2-cutin-variety`（专属卡、队友、绝招分型）不在本次已批准计划内，仍待处理。 | 具备手机环境后做实机验收；分型经单独设计与实施确认后推进。 |
| 发布 | 当前仅完成本地交付，未验证远程下载或新版发布导入件。 | 助手授权 `p14` 后再升版本、生成发布文件、验证远程加载并提交、推送、打标签。 |

### v2 后续：主角卡组预生成与生成重试（本地，未升版本）

- 需求（助手 2026-10-25）：开启扩展后提前生成主角卡组，已获得卡牌可随时构筑；生成出错自动重试，并提供手动重试按钮。
- 预生成：`combat-services.prepareProtagonist()` 在启动、设置变更、换聊天时由 bootstrap 调用，建表成功后也在后台调用一次。只在战斗表已存在、当前主角没有卡组档案时以 `role:'protagonist'` 生成一次；缺表或读表失败记 `idle`，不代为建表，也不当作没有档案。开战准备进行中不另起请求；`session.prepare` 经 `awaitProtagonist` 先等在途预生成结束，不重复请求、不为同一档案写两份。同一档案已有未核实写入留在队列时先补写（`combat-profile-write-pending`），不重新生成。
- 自动重试：新增 `combat/generation-retry.js` 的 `generateWithRetry`，间隔 2s / 6s，最多重发 2 次，只重发 HTTP 408 / 425 / 429 / 500 / 502 / 503 这类上游明确拒绝的请求。取消与迟到、配置不完整、副 LLM 不可用、回复格式修正耗尽、发送状态未知的传输失败与 504 不自动重发（上游可能已执行，避免重复计费），交给手动重试。预生成、`generateDeckProfile`、`retryGrowth`、开战准备都经它生成；生成本身不落账，重试不会重复写表。第 7 步「请求本身失败时不重试」的记录由本节取代。
- 手动重试：已发出请求后失败不再自动重发，构筑面板「待整理」区首行显示主角卡组状态（生成中 / 自动重试第 n 次 / 失败原因 + 「重试」）。缺战斗表时构筑面板错误区可二次确认后建表，建表成功后自动预生成。待整理成长沿用原「重试」，开战准备沿用战斗面板「重试」。请求本身失败的原因统一为 `combat-llm-request-failed`（「副 LLM 请求失败」）。
- 卡包：已拥有的卡在构筑面板按拥有数列出并可加入 / 移出 / 保存（既有能力，本次未改）；主角卡组预生成后无需先开战即可构筑。
- 验证：`combat-generation.test.js` 新增 1 项（503 重试成功、400 / 未知传输 / 504 / 普通错误不重发、502 耗尽带回状态、等待中取消），`combat-deck-panel.test.js` 新增 4 项（缺表不请求、建表后后台生成且 503 重试后写入读回、已有档案不再请求；重试耗尽后不自动重发、手动重试再请求、关闭扩展不请求；面板失败行与重试按钮、自动重试状态、退订；缺表建表二次确认与未注入时只给重试）。与 `combat-session`、`combat-panel`、`combat-ledger`、`combat-prompt-assembly` 合跑 67/67。
- 未验证：bootstrap 的触发接线只经源码核对，无启动测试覆盖；真实副 LLM 的 503 / 429 重试、真实 shujuku 建表后预生成、测试酒馆与手机实机均未验收。


### v2 后续：职业与技能生成接入剧情与世界书（本地，未升版本）

- 需求（助手 2026-10-25）：职业与技能生成贴合剧情，并接入世界书内容。
- 做法：新增 `host/combat-story-context.js`。剧情取最近 3 楼 AI 正文（去掉 IGS 标签、HTML 与插图标记，末尾 ≤1600 字）；世界书不再全量读取，改走写词同一条原生扫描（`image-world-info.js` 的 `getWorldInfoPrompt`），以剧情与参战者名触发，结果 ≤3000 字。`combat/generation.js` 的 `withStoryContext` 只在读到内容时给请求 `context` 加 `story` / `worldInfo`，提示词增加一句用法说明（贴合世界观、势力、能力体系与当前事件，不照抄、不矛盾）。`readLore` 仍只取用户人设与角色卡（`includeWorldInfo:false`）。
- 接入点：开战准备（主角、队友、敌人名）、主角卡组预生成与手动卡组生成（角色名 + 主角名）、待整理成长（相关角色名）。世界书扫描不可用或失败时不阻断生成，只带剧情节选；取消时跳过扫描。
- 验证：战斗 6 个测试文件与 `image-job-reporter` 合跑 68/68（`withStoryContext` 未注入或读不到时请求形状不变，原有用例照常通过）；本机临时探针核对剧情截尾 1600 字且不含标签、世界书截 3000 字、名字去重、扫描抛错或 `ok:false` 只返回剧情、已取消不调用扫描、空聊天返回空对象，探针已删除。
- 未验证：真实酒馆原生扫描的触发结果与体积；模型是否按剧情与世界书起名（属生成质量，本地测试无法证明）。


### v2 后续：战斗特写改为立绘 + 特效 + 运镜 cut-in（本地，未升版本）

- 需求（助手 2026-10-25）：战斗特写不再用眼部窄条，改为立绘、特效与运镜组成的二次元式 cut-in。
- 做法：新增 `visual/igs-ui/combat-cutin.js`（纯 DOM 构造）与 `combat-cutin-style.js`（样式），独立命名空间 `.igs-combat-cutin-*`。战斗面板不再生成 `.igs-fx-cutin` / `.igs-fx-cutin-face` / `.igs-fx-cut-flash` / `.igs-combat-awaken-face`，阅读器 `[igs-fx:cutin]` 的样式与关键帧未改。觉醒特写在减少动态效果时的淡入淡出改用本命名空间的 `igs-combat-cutin-fade`，不再借用阅读器关键帧；删去已无引用的 `.igs-combat-awaken-face` 样式与 `fx-runtime.js` 的 `CUTIN_EYE_FOCUS` / `CUTIN_FALLBACK_FOCUS`。
- 技能特写：暗幕 + 速度线 + 斜向色带 + 右侧半身立绘（推入 → 漂移 → 拉出）+ 角色名与招式名 + 一次闪白，1.8s；窄面板立绘居中、文字移到下方。觉醒特写保留情绪色幕、纹样与粒子，眼部窄带换成居中半身立绘，2.6s。取景头宽约占分格 38%、对焦胸口，放大倍数不超过整幅图铺满分格；头位只是默认值时取较宽景。
- 节奏：同段多个特写首尾相接（后一个在前一个 85% 处进场），命中演出在最后一个特写开始淡出时落下，没有特写的段节奏不变。立绘头位探测在出手时发起，到点取缓存，未就绪最多再等 160ms，超时按默认头位，不拖后时间轴。减少动态效果：整体淡入淡出，无运镜与闪白；低画质：速度线静止、去投影。
- 调试工具：`tools/local-preview/host.js` 的特写与觉醒探针改读新类名；`tools/st-probe/` 下的 p13 系列历史探针仍查旧类名，属阶段记录，未改。
- 验证：`combat-panel.test.js` 新增 3 项（节点命名空间、`textContent`、地址转义、减少动态效果 / 低画质分支与取景封顶；人物技能特写先播、命中在 1530ms 落下、特写 1800ms 后移除、无立绘时命中立即落下；觉醒半身立绘、关闭后清节点与计时器、迟到的探测不再挂节点），本文件 17/17；删去 `fx-runtime.js` 两个常量后，战斗相关 12 个测试文件与 `ui-conventions`、`media-cache-governance` 合跑 138/138。
- 未验证：真实立绘的取景与运镜观感、竖屏与手机实机、测试酒馆展示；构建与本地导入件待各项完成后统一重建。


### v2 后续：战斗面板演出音效（本地，未升版本）

- 需求（助手 2026-10-25）：增强己方出牌特效与打击感、放慢演出、增加音效与战斗音乐。本节只记音效；打击感、节奏与战斗音乐分项另记。
- 做法：`fx-battle-sfx.js` 新增 `battle-card`（出牌挥出）、`battle-cutin`（特写进场）、`battle-awaken`（觉醒）三种合成音，开关与音量判断沿用 `playBattleSfx`。战斗面板经宿主注入的 `playSfx(kind)` 出声：开战遭遇与命中 / 格挡 / 击倒 / 治疗走 `applyBattleFxToDom` 的 `onEvent`，由 `battleSfxKind` 按世界观取变体（如 `battle-hit-magic`）；己方 `play` / `hero-skill` / `item` 结算成功后立即一声 `battle-card`，命中音随命中演出落下；特写与觉醒节点挂载时各一声。减少动态效果时面板不出声；音效抛错不影响演出与结算。
- 宿主：`reader-host.js` 注入 `getFxSkin`（读当前阅读器 `_worldview`）与 `playSfx`（每次按当前 `readerSettings.fxSound` 正规化后播放，即「演出音效」开关与音量）。未注入 `audioScheduler`，走 `playSynthPartials` 默认合成路径。
- 验证：`combat-panel.test.js` 新增 1 项（魔法世界观开战听到 `battle-encounter-magic`；出牌后首个音为 `battle-card`，命中后出现 `battle-hit|crit|ko` 或其魔法变体；减少动态效果时无任何音），与 `combat-deck-panel`、`ui-conventions` 合跑 32/32。
- 未验证：真实浏览器中的合成音观感、音量平衡、与 BGM 叠放；测试酒馆与手机实机。


### v2 后续：战斗面板打击感（本地，未升版本）

- 需求：同上节（需求 6-b：受击反馈、伤害 / 格挡 / 治疗飘字、血条随命中落下、己方出牌卡牌飞向目标）。
- 做法：`combat-panel-model.combatHitMarks(events)` 按单位、按首次出现顺序把引擎事件归为掉血（`hpLoss`）、全挡（`hpLoss=0` 且 `blocked>0`）、治疗、获得格挡与击倒，只取事件里已有的数值。新增 `visual/igs-ui/combat-hit-fx.js`（DOM 小件）与 `combat-hit-fx-style.js`（样式，并入 `COMBAT_PANEL_STYLE_TEXT`）。
- 血条随命中落下：己方动作结算前记下各单位血量；结算后整块重绘时，本次有变化的单位先按旧血量补画，命中演出里同名目标出现时才落到新值（宽度过渡 + 0.32s 后收拢的浅色残影）；没有对应命中的变化（格挡、中毒、荆棘）在本段命中开始时落下；时间轴走完后按会话真实值落笔。新动作开始或面板关闭后，旧时间轴不再改血条与飘字。
- 飘字与受击：落下时在单位块里挂飘字（`-6`、`格挡`、`+5 格挡`、`+7`；同一单位多条错开 120ms；击倒不另写字），数字只经 `textContent`。受击立绘抖动并闪红，格挡与获得格挡下沉泛光，治疗轻微放大泛光（`data-igs-combat-react`，0.42s 后摘除）。
- 出牌飞行卡：打出手牌时复制该牌为影子卡（去掉交互属性），从原位飞向目标并缩小淡出，0.38s；不选目标的牌飞向第一个有变化的单位，都没有时飞向第一名敌人。第一段命中等影子卡飞到再落下；量不到尺寸或不支持 Web Animations 时不飞，节奏与之前一致。
- 降级：减少动态效果时不暂存血量（直接显示结果）、不飞卡、不抖动，飘字只淡入淡出；低画质不飞卡、不做受击反馈。
- 验证：`combat-panel.test.js` 新增 1 项（事件分组与数值、暂存落笔保留其他类名、飘字文本 / 序号 / 到时移除、减少动态效果的飘字、受击反馈到时摘除、影子卡舞台坐标与终点变换、无 WAAPI 或无目标尺寸时不飞），与 `combat-deck-panel`、`ui-conventions` 合跑 33/33；原有特写时序与音效用例未改动并通过。
- 未验证：测试用假 DOM 不解析 `innerHTML`，面板内「重绘后按暂存补画 → 命中时落笔、挂飘字、飞卡」整条链路只经源码核对，未在真实浏览器运行；观感、手机竖屏与测试酒馆未验收。


### v2 后续：战斗面板演出节奏放慢（本地，未升版本）

- 需求：同上节（需求 6-c：放慢演出，保持无特写段与时间轴一致）。
- 做法：`combat-panel.js` 的逐单位最短间隔 `ACT_GAP_MS` 600 → 900ms；面板调用 `planBattleFx` 时传 `holdScale: COMBAT_FX_HOLD_SCALE`（1.35），遭遇、出招间隔、命中停留、击倒与结算一起放慢。段时长仍按放慢后的 `plan.totalMs` 累计，命中落点（打击感）读同一计划的 `at`，无特写段的时间轴与演出一致。特写时长、特写衔接比例与行动条 0.5s 移动不变；阅读器正文里的 `[igs-fx:battle]` 仍按演出风格的停留档位，不受影响。
- 验证：`combat-panel.test.js`、`combat-deck-panel`、`ui-conventions` 合跑 33/33（含特写时序、音效与开战 / 敌方回合推进用例）。
- 未验证：真实浏览器中的节奏观感（是否过慢）；倍率为固定值，未接入设置项。


### v2 后续：战斗音乐（本地，未升版本）

- 需求：同上节（需求 6-d：战斗面板打开时切到战斗情绪曲，沿用 BGM 开关与曲库，关闭后恢复剧情配乐）。
- 做法：`scene-audio.js` 新增 `setBgmMoodOverride(root, mood)`：按 root 记住临时情绪覆盖，之后每次 `applySceneAudio` 都按覆盖情绪选曲（不写回情绪记忆、不计留白页），并用该 root 最近一次的选项立即重放；清除时把选曲记录（`sig` / `id` / `played`）放回覆盖前的状态再重放，回到原来那首剧情曲（从头播放）。换曲沿用现有情绪过渡（进战斗快切、出战斗慢淡）。`cancelSceneAudio` 同时清掉覆盖与重放选项。战斗面板打开 / 关闭时调用注入的 `setBattleMusic(overlay, on)`，reader-host 实现为 `setBgmMoodOverride(overlay, on ? 'battle' : '')`；未注入时面板不动配乐。
- 曲库：沿用现有曲库与世界观曲包筛选，未新增或下载任何音频；曲包里没有 battle 曲时按现有选曲回落规则选曲。BGM 开关关闭时不起播；只配了关键词曲目（无情绪分类）的曲库不受覆盖影响。
- 验证：`bgm-library.test.js` 新增 1 项（覆盖切到 battle 曲、重绘保持、重复设置不重放、清除后回到原曲、BGM 关闭不起播、cancel 后不再重放），`combat-panel.test.js` 音效用例加面板开合各调用一次 `setBattleMusic`；与 `audio-bus`、`combat-panel`、`combat-deck-panel`、`ui-conventions` 合跑 39/39。
- 未验证：真实浏览器的切歌与淡入淡出观感、自动播放策略下的起播；测试酒馆与手机实机。


## v3 实施记录

### 第 16 步：自动准备、自动弹出与聊天记录留档（本地，未升版本）

- 需求（助手 2026-10-26）：正文完成后识别到开战标签就开始准备；准备结果与战斗结果记进开战楼聊天记录，避免重复生成与重复刷分；主界面翻到开战标签时自动弹出战斗界面。
- 聊天记录留档：新增 `host/combat-chat-record.js`，按 combatId 读写开战楼的 `extra.igsCombat`，同步写当前 swipe 的 `swipe_info[swipeId].extra`，经宿主 `saveChat` 保存后读回核对；不改正文 `mes`。`session.js` 在首次准备到战前时写 `prepared`，出结果当即写 `result`（战报 ID、胜负、正文、回合数，有道具用量时附用量与操控角色），不等发送。
  - 读到 `result`：只能重发同一份战报。换设备、清理浏览器存储、删掉战报楼之后都不能重打，EXP 只随战报楼入账一次。
  - 读到 `prepared`：只补缺失的主角档案，队友与敌人不再请求生成，缺档案的敌人用模板敌人。
  - 读取失败或格式不对时 fail-closed 阻断；写前核对锚点；写失败不阻断开战与发送，面板提示「战斗留档未能写入聊天记录」，结算与重发前补写结果。
- 与计划的偏差：
  - 计划写「已准备的不再生成」。主角档案缺失时仍会补生成，因为缺主角无法开战；其余参战者不再生成。
  - 结果记录附带本场道具用量，重发同一份战报时照样扣除。否则删掉战报楼再重发会退回道具，属于同一个刷分缺口，计划里没有单列。
- 后台准备：`combat-services.autoPrepare(messageId)` 由 bootstrap 经 `onImageFloorReady` 调用，沿用其 dry-run、quiet、中止与换聊天过滤。会话正在准备、对局中、待结算或待回传时不打断；同一场已到战前、阻断、已回传或已跳过时不重跑。同一场并发 `prepare` 共用一次请求，结束后经 `subscribe` 通知面板刷新。
- 自动弹出：取消 `autoOpen` 设置与设置页的勾选项，旧设置里的该字段读取时丢弃。翻到开战页即自动打开；面板确实打开后才记为已弹出，被地图、资料或构筑面板挡住时下一次渲染再弹，同一开战楼只自动弹一次。
- 预览工具：`tools/local-preview/host.js` 增加 `gen=1`（启动后模拟一次主生成结束）、`saveChat`（`write=deny` 时拒绝，`write=memory` 时只记日志）与 `record` 探针；`capture.mjs` 透传 `--gen`。
- 验证：`combat-session.test.js` 新增 4 项（留档与不能重打、prepared 只补主角、写失败不阻断、并发去重与损坏 fail-closed）；`combat-panel.test.js` 新增 1 项（后台准备结束后面板刷新），按新契约改 2 项旧断言（`autoOpen` 取消、seen 由调用方记）；`combat-deck-panel.test.js` 新增 1 项（自动准备触发条件）。与 `combat-ledger`、`combat-generation`、`ui-conventions` 合跑 82/82；再与其余 combat 测试、`settings-panel-ux`、`image-job-reporter` 合跑 156/156。`npm.cmd run build` 通过。本地预览 `1568×743 write=memory gen=1`：后台准备写入 `prepared`，阅读器打开后自动弹出战前；`430×932 write=deny gen=1`：保存被拒、留档撤回，仍到战前并显示留档失败提示；两场均无 console 错误、意外请求与站外请求。
- 未验证：真实酒馆里 `saveChat` 之后换 swipe、删楼、重新载入聊天时 extra 是否保留；真机主生成事件顺序下后台准备的时机；手机端。

### 第 17 步：格斗游戏风格（本地，未升版本）

- 需求（助手 2026-10-26）：战前画面太板正，改成格斗游戏的张力；看过预览后追加：我方每个角色一块街霸式立绘框、铺满背景色块，外侧框斜边以外的背景直接裁掉；敌人不用立绘框，站立立绘错落排开。
- 战前对阵：遭遇名改为顶部斜切横幅并带档位，标题栏退回默认标题；舞台底层是斜切分屏（我方偏暖、敌方偏冷红并压暗），竖屏改上下斜切；VS 是大号斜体字，只带一层投影。
  - 我方立绘框：每人一块同形平行四边形框，铺满本侧色块（框高随舞台，框宽按人数均分），相邻框斜边相扣、留窄缝，立绘贴顶裁切。底层色块 `.igs-combat-lobby-fx` 沿外侧框斜边裁掉框外部分：横排外轮廓是两端同向斜切的平行四边形，竖排裁我方一排的左右两端（裁切上沿取舞台半高 + VS 半高 + 行距，与三行网格一致）。横排我方色块止于最后一个立绘框的斜边，敌方色块从敌方区左缘起铺、斜边同向；竖排敌方色块止于敌方区下缘，我方色块从我方一排上沿起铺；VS 所在的中间一段不铺色块，露出场景底图。白闪是舞台下单独一层 `.igs-combat-lobby-flash`，压在立绘之上，`pointer-events:none`，不拦选择按钮。
  - 框色调：我方每个立绘框的整体色调取该角色立绘压到 25×25 后的最亮不透明像素（复用立绘探测缓存，与技能特写同源）；取不到时用默认暖金。框底是面板同系深色，头部位置打一圈该色调光晕，名牌色带同色；选中的主战者光晕与色带加强。名牌一行：名字、Lv、职业各自成段，放不下的段整段落到被裁掉的第二行，不出现截断残片。
  - 敌人：不用立绘框，站立立绘下接斜切名牌，按数量逐个画出（最多 5 个），偶数位抬高一截错落排开；首领档放大 1.2 倍。敌人不缩小：4 名及以上分前后两排（前排 ceil(n/2) 人，后排其余，后排略暗、被前排压住下沿），每排按本排人数均分宽度（以 `--l-foe` 为上限），不按总人数压缩；横排两排时最外侧立绘可越过红色斜块边缘。
  - 名牌：我方是框底色带，名字在前，Lv 与职业缩小；可操控角色整框即选择按钮（`aria-pressed`），选中的主战者框底提亮（`data-picked`）；托管、首领为斜标。键盘焦点画在名字上。
  - 操作：「开始战斗」改大号斜切主按钮，「跳过战斗」降为透明次级。
- 入场：双方冲入、一次白闪与轻微震屏，每次打开只在第一次画战前时播；减少动态效果时不带 `data-intro`，只留静态斜切；低画质隐藏白闪。
- 开战过场：`combat-cutin.js` 新增 `buildOpeningCutin`，点「开始战斗」后全屏闪入「开战」大字，停留 `COMBAT_CUTIN_MS.opening`（800ms），走完再播开局演出；过场期间有新动作或面板已关闭时不补播；减少动态效果时不播；不画速度线，低画质不闪白。
- 战斗与结算：标题后加斜切回合横幅「第 N 回合」；单位名牌底与血条轨道改斜切（我方暖色、敌方冷红）；结算大标题改斜体并加两端渐隐的斜切暗色带。全部不用描边与侧边色条。
- 与计划的偏差：计划写「立绘放大，可互相叠压」；按助手追加要求，我方改为每人一块立绘框、斜边相扣不叠压，敌人不用立绘框、错落排开。
- 验证：`combat-panel.test.js` 新增 1 项（入场与开战过场每次打开只播一次、过场走完才播开局演出、减少动态效果时都不播、过场无速度线、低画质过场无闪白），按新结构改 3 处旧断言（夹具默认减少动态效果不再带入场标记、名牌与横幅结构、回合横幅）。`combat-panel`、`combat-generation`、`combat-deck-panel`、`combat-session`、`ui-conventions` 合跑 68/68。`npm.cmd run build` 通过（0.36.115）。本地预览 `1568×743`、`430×932`、`720×900`，另加 `1568×743` 四人对 3 名野狼（`write=memory gen=1`）：无 console 错误、意外请求与站外请求（只有按设计拒绝的 2 条 404）；战前主区域溢出 `[0,0]`；我方框与本侧舞台同高（357 / 167 / 394px），相邻框缝隙 4–6px；底层裁切线与外侧框斜边重合（横排两者都从舞台左上 48.6px 斜到左下；竖排裁切上沿 678.9px 对我方一排上沿 679px，两端斜边 24.3px 与框一致）；敌人 `clip-path` 为 `none`，偶数位抬高 25px（1568）/ 7–8px（430、720）；我方框中心命中选择按钮与托管名牌，白闪层不拦点击。内置浏览器已打开同一场景。
- 框色调验证：`combat-panel.test.js` 新增 1 项（`tintTriplet` 只放行合法 `rgb()`，注入串与越界值返回空；有立绘且色值合法的我方框才写 `--igs-combat-ally-tint`，敌人与无立绘角色不写），名牌断言按一行结构更新。上述 5 个文件合跑 69/69；`npm.cmd run build` 通过（0.36.115）。本地预览 `1568×743`、`430×932`、`720×900`（四人对 3 名野狼）：林夕框 `240,212,196`（选中，光晕加强），白露、青岚框均为 `233,228,226`，墨砚无预览立绘回落默认暖金 `242,196,128`，敌人背景 `none`；四个名字三档都完整（宽 28–34px），`Lv1` 都显示，林夕的「剑士」在 430 整段显示、在 1568 与 720 整段落到被裁掉的第二行；无 console 错误、意外请求与站外请求（只有按设计拒绝的 2 条 404）。异步补色路径只在真实浏览器预览中覆盖，假 DOM 不解析 `innerHTML`。
- 中缝验证：上述 5 个文件合跑 69/69，`npm.cmd run build` 通过（0.36.115）。本地预览（四人对 3 名野狼）：`1568×743` VS 列 730–838，我方色块右斜边 713.6→665 与最后一个立绘框斜边重合，敌方色块左斜边 903→854.4 起于敌方区左缘 854，两斜边同向，中间不铺色块；`720×900` 我方色块右斜边 309.6→261、敌方色块左斜边 459→410.4，VS 列 320–400 不铺色块；`430×932` 敌方色块止于 640.6、我方色块起于 700.4，VS 行 650–690 不铺色块。三档主区域溢出 `[0,0]`，无 console 错误、意外请求与站外请求。
- 精简演出：战前舞台去掉速度线层；VS 去掉光晕、斜划线与砸下动画，只留一层投影；开战过场只保留暗幕、斜向色带、「开战」大字与闪白，不画速度线；技能特写的速度线不变。上述 5 个文件合跑 69/69，`npm.cmd run build` 通过（0.36.115）；本地预览三档主区域溢出 `[0,0]`，无 console 错误、意外请求与站外请求。
- 敌人两排与手牌命中验证：撤回敌方区内收（内收会把立绘压小，`1568×743` 每只约 79px、`720×900` 约 55px）。`combat-panel`、`combat-generation`、`combat-deck-panel`、`combat-session`、`combat-engine`、`ui-conventions` 合跑 94/94，`npm.cmd run build` 通过（0.36.115）。战前四人对 5 名野狼：`1568×743` 后排 2 只、前排 3 只，每只 111px，同排相邻错落 25px，前排最外侧越过红块斜边约 24–39px；`720×900` 每只 88px，全部在敌方区 410–694 内；`430×932` 每只 97px，全部在敌方区 26–404 内，主区域溢出 `[0,0]`；无 console 错误、意外请求与站外请求。战斗界面 `1212×722` 选中一张牌（与悬停同一套抬起变换）后，牌下沿以下 12px 仍命中这张牌。手牌加宽：横向面板宽 721–1279px 时底栏改紧凑排布（有助战时人物技能 / 觉醒 / 道具排在助战头像上方 6px，并贴近主战者头像右侧 4px；没有助战时控件位于主战者上方；撤退叠到结束回合上方），更宽的面板与窄面板不变。浮窗面板（900px 宽，`1212×722` 与 `1568×743`）手牌区 203→349px，前四张每张可点宽度 24–26→60–62px、末张 120px；整页 `1568×743` 仍为原三列，手牌区 749px、每张 102–118px；`720×900` 仍为窄屏三排，每张 66–70px。撤退按钮位置只由样式核对，预览夹具未覆盖可撤退的战斗。竖向面板（容器高于宽）我方一排：主战者与队友是同宽 3:4 半身立绘（下沿渐隐），队友按奇偶分到主战者两侧（3 名队友时左 2 右 1）。面板宽 ≤720px 时，原能量槽与技能控件移动至手牌下方的左下角 `.igs-combat-dock`，右下角保留回合操作；宽窄切换复用同一份节点、保持焦点，关闭时解绑尺寸监听。名字只占单行，格挡与状态覆盖在立绘右下角，可上下排列，不占名牌或队列宽度。`430×932`（面板 398×540）四人每人 70px，手牌区 366px、每张可点 66–90px；能量槽在 (32,867)、技能在 (74,864)，名牌高 22px，立绘与操作区、手牌均无重叠，主区域纵向滚动余量 6px。技能使用后能量 3→1、液面 0.333，目标生命 40→28，技能标记已用。`720×900` 的面板是 688×540 横向浮窗，不命中竖向规则，仍为圆框（主战者 96px、队友 40px），与战前在这一档按横排一致。立绘排序只由样式核对；截图未逐像素审阅，选中 / 出手外发光未截帧核对。行动顺序（助手反馈：出一张牌后冒出队友「疾风步」再轮到自己）：引擎逐人串行，`runTimeline` 每步只取一人，`autoAct` 内 `act → startUnit → 出牌 / 技能 → endUnit` 同步走完，同速由 `avSeq` 决胜，没有交错。根因在面板回放：结束回合时引擎一次结算完队友与敌人，面板逐段回放数秒，期间手牌仍可点，旧时间轴的后续段只认面板 `token`、不认新动作，所以新出的牌之后还会接着播上一轮队友的技能特写。修法：回放含自动行动段时根节点带 `data-igs-combat-auto`，`act` 返回 `combat-busy`（「上一步还在进行中」），底栏 `pointer-events:none`；时间轴走完、关闭或重开面板时解除。`combat-panel.test.js` 的 `playToEnd` 改为每步前先推进计时器等锁解除（与玩家操作一致）；6 个文件合跑 94/94，`npm.cmd run build` 通过（0.36.115）。
- 未验证：真实酒馆与手机显示；配色与动效观感需助手目视（截图未逐像素审阅，字符画分辨率不足以核对斜边，斜边对齐只由计算样式与几何量测核对）；入场白闪只核对了样式与命中，未截到闪帧；预览探针不采集开战过场节点，过场在真实浏览器里的显示只由假 DOM 测试覆盖。

### v3 第 8 步：稀有度规则与外观

- 新职业池固定 11 张，按角色种子独立分配 common 7、uncommon 4；费用仍取费用槽。指定费用与稀有度下模板无解时进入生成纠错，不移动职业卡费用槽。新起始卡组职业卡只抽 common / uncommon，个人卡保持原抽取规则，总计 20 张。
- 登记 epic / mythic 预算窗口及 schema 白名单；旧 rare 职业卡继续接受。`cardCopyLimit` 统一供卡组校验、日志回放、自动入组、构筑按钮与现有奖励候选使用：基础至史诗及个人卡 3，神话与专属 1。收藏可保留多份，入组受限。
- 已存档稀有度及起始卡组不重算、不自动写回。超限起始卡组保留原值并标记需调整；deck 日志按当前拥有数与上限只读归并，剔除时保留诊断，原日志不改写。
- 手牌与构筑共用 `combatRarityStyle`；史诗／神话用名称、费用标记及手牌色晕区分，卡面和费用标记不新增描边。神话流光周期 6.8 秒，减少动态效果时关闭。
- 定向验证：规则、生成、日志、构筑四文件合跑 60/60；补入奖励候选回归后单跑构筑文件 15/15；战斗面板与 UI 约定 31/31。`npm.cmd run build` 成功，产物仍为 0.36.115。未使用这些结果证明真实模型生成质量或真实宿主持久化。
- 本地 Edge 实际产物预览：1280×720 手牌、430×932 构筑使用同一套五档色值，史诗／神话费用标记 `boxShadow:none`、卡牌 `borderWidth:0px`；神话 `igs-rarity-sheen / 6.8s`，通过 CDP 启用系统 `prefers-reduced-motion:reduce` 后为 `animation:none / backgroundImage:none`。两次报告无 console 错误、意外请求或站外请求。证据：`.limcode/preview/combat-dist/report-rarity-final-hand-1280x720.json`、`report-rarity-final-deck-430x932.json`。预览的 saveChat 拒写及宿主资源 404 为隔离模式预期行为。
- 助手确认从低到高白、蓝、紫、金、红：普通 `#eceae6`、罕见 `#7fb8d9`、稀有 `#ad94f0`、史诗 `#f2d49b`、神话 `#ef7777`；基础、个人与专属卡保持原规则。预览入口 `http://127.0.0.1:4174/__preview?compare=rarity` 同屏展示手牌与构筑，合成首手覆盖五档。
- 范围：R3 跨模块运行时变更；第 8 步完成，继续第 9 步属性系统。真实 Tavern 与手机尚未验收；0.37.0、loader、模拟 CDN 下载执行及最终本地导入包留待后续步骤。按本任务授权仅本地准备，未 commit、push 或 tag。

### v3 第 10b 步：战斗表自动创建（本地，未升版本）

- 助手要求：扩展开启且数据库可用时缺表自动补建，shujuku 是战斗数据唯一合法的本地数据源，不另设存储后备。账本读表发现缺 `IGS战斗·档案 / 日志 / 属性` 时，`combat-services` 经 `combat-tables.ensure()` 直接补建后重读；面板去掉「在数据库中创建战斗表 → 确认创建」两步。战斗面板阻断态、人物状态面板错误区与加点页的「重试」在原因属于数据库表（`combat-table-*`）时，先经 `ensureTables` 清掉建表失败记忆再补建一次。
- 对照 shujuku 源码补的防护：① 换聊天时宿主把运行时表置空，载入后导出至少带 `mate`（`injection-engine-state.ts:97`、`pipeline.ts:644-663`、`core-data-api.ts:35-36`）。导出为空对象记为 `combat-table-not-ready`，不当作缺表、不导入，待写条目留在队列。② 聊天作用域导入是整份快照，模板缺的当前表会被隐藏（`chat-template-reconciler.ts:224-243`），所以只在「模板 = 当前聊天的表 + 要补的战斗表」时导入，否则返回 `combat-table-template-diverged` 并列出 `hidden / extra`。③ 导入成功但 `runtimeReady:false`（`template-preset-api.ts:161-167`）时返回 `combat-table-runtime-not-ready`。`initGameSession` 默认重置现有表数据（`plot-preset-api.ts:295-302`），不用于建战斗表。
- 单飞与失败记忆：同一聊天、同一数据库实例同一时刻只导入一次；建表失败按聊天记住，之后读表直接返回原因，直到「重试」、换聊天或数据库实例变化；未载入、读表失败不记。补建了表时后台预生成主角卡组。
- 定向验证：`combat-tables / combat-deck-panel / combat-ledger / combat-panel / combat-session` 合跑 103/103（含未载入、模板不一致、`runtimeReady:false`、并发单次导入与失败记忆、面板重试用例），`ui-conventions` 2/2；`npm.cmd run build` 成功，产物仍为 0.36.115。真实 shujuku 自动建表、SQLite 模式、测试酒馆与手机均未验收；本地预览未查看去掉确认按钮后的阻断视图。`tools/st-probe/p13-create-tables.js` 已改为打开面板后直接读回表结构，未在真机重跑。
- 未改的既有不一致：`client.refresh()` 不检查 `refreshDataAndWorldbook` 的返回值，宿主出错返回 `false` 时也当成功（侦察结论，未在本步修改）。战斗进度存档与待回传战报仍存在注入的 storage（键 `igs-combat:session:* / igs-combat:outbox:*`），战报结果留档在开战楼 `extra.igsCombat`，演出速度偏好仍存 `igs:combat-fx-speed:v1`：助手确认「唯一本地源」只覆盖三张战斗表，这些保持现状（1a）。第 11 步奖励选项（offer）改存 shujuku，不存开战楼聊天记录（助手决定 2b）。助手已看过缺表阻断视图（拒写停在「战斗表创建失败 · 跳过战斗 / 重试」，内存写入自动补建后进入下一步）。
- 范围：R3；按本任务授权仅本地准备，未 commit、push 或 tag。

### v3 第 11 步：准备阶段奖励（本地，未升版本）

- 槽位规划（按助手反馈 2）：`rewards.js` 的 `planRewardSlots` 按遭遇档位定 EXP（与战报同口径，敌人只数 × 档位求和）与 3 槽（再翻 4 槽）；每槽类别、稀有度、卡牌费用、装备部位与道具数量由 `combatId` 与角色的种子抽取，重算一致。类别为杂物（`keepsake`，没有战斗效果，只有名称、来历与稀有度，稀有度供翻牌爆光）、卡牌（杂兵不超过罕见，技能角色不出）、装备（武器 / 防具 / 饰品）、宝物（`gear` 的 `treasure` 部位，只在稀有以上，稀有以下抽到时改为武器 / 防具 / 饰品）与一次性道具（史诗以上 2 个，其余 1 个）。奖励不出属性点、卡牌升级与人物特性（助手反馈 3：人物特性只能花积分抽）。杂兵每槽 85% 杂物；精英与首领首槽保底非杂物、其余每槽 80% 杂物；首领保底槽至少史诗。稀有度权重：杂兵 普通 75 / 罕见 22 / 稀有 3，精英 罕见 40 / 稀有 40 / 史诗 20，首领 稀有 50 / 史诗 40 / 神话 10；首领杂物另用 稀有 20 / 史诗 50 / 神话 30（助手要求拉高首领杂物品质，具体权重为实施取值）。天运把 1 个非杂物槽位上调一档，可越过杂兵卡牌上限。
- 生成：新 kind `battle-reward`，模型只见类别、稀有度与命名线索（卡牌费用、装备部位），每槽回 `[名称, 模板键, 来历]`，杂物的模板键为 `null`；`generation-assembly.js` 的 `assembleReward` 复用 `buildCard` / `templateKey` 组装，卡牌 ID 由种子与槽位推导；装备与宝物的被动经 `passiveAtRarity` 按稀有度加强（说明标「加强」），一次性道具取道具模板效果、数量取计划。组装结果过 schema 与队友技能伤害上限，非法模板按字段路径定向修正；修正耗尽只拒收奖励，不影响同批档案。
- 两套奖励（助手反馈 3）：`planRewardSlots` 同时给出主套 `slots` 与备用套 `reserve`，规则、槽位数与再翻 / 天运联动相同，备用套用派生种子 `${seed}|reserve`；同一 `battle-reward` 实体一次生成两套，模型回 `{ slots, reserve }`，备用套名称不与主套重复，两套同成同败；备用套卡牌 ID 用派生种子，与主套同位不重复。offer 载荷新增可选 `reserve`（与 `slots` 等长，逐槽同样校验，长度不符记 `reserve-length-mismatch`）；本步之前写入的 offer 没有 `reserve`，翻牌时不可重抽。重抽本身（花积分换上备用套）在第 12 步实现。
- 落账：日志表新类型 `offer`（`{ combatId, tier, exp, reveal, slots, reserve? }`），锚定开战楼的开战标签锚点，只核对楼层与 swipe；`effectiveState().offers` 按 combatId 归并，同场先生效的为准。按助手决定 2b，offer 只存 shujuku 日志表，不写开战楼聊天记录；计划第 11 步原文（存聊天记录、不新增 offer 类型）以此为准，计划文本未改。
- 会话：首次准备且日志表没有本场 offer 时与缺档案实体同批请求；已有 offer 或已准备过的场次（重开、重新准备）不自动请求；奖励失败不阻断开战；`retryReward()` 只重新请求奖励（沿用自动重试分类），写入并读回后更新大厅。
- 大厅（助手反馈）：生成成功不显示奖励行；失败只显示「奖励生成失败」与「重试」，不显示 EXP 与原因（原因留在会话 `reward.reason` 供诊断）；重试进行中显示「奖励生成中」。
- 第 10b 步残余：`ensureTables()` 没有聊天 ID 时返回 `combat-session-unavailable`，不导入模板（与读表补建同一边界）。
- 定向验证：反馈 2 后 `combat-generation / combat-ledger / combat-session` 57/57、`combat-panel / combat-deck-panel / combat-tables / ui-conventions` 70/70；两套奖励后 `combat-generation / combat-ledger / combat-session / combat-deck-panel / combat-panel` 113/113；`npm.cmd run build` 成功，产物仍为 0.36.115。真实副模型生成奖励、真实 shujuku 写 offer、测试酒馆与手机均未验收；本地预览没有副模型，只能看到奖励失败态。
- 暂定与技术债：掉率与稀有度权重暂定，待实机调整；翻牌联动 `links` 暂不传入，第 12 步接上；奖励在开战前请求，战败场次的请求白费（设计 §8 已列）。
- 范围：R3；仅本地准备，未 commit、push 或 tag。

### v3 第 12 步：翻牌兑现与积分（本地，未升版本）

- 12a 标签与战报：`scene/combat-directives.js` 新增成长 kind `loot`，写法 `[igs-combat:loot|角色|战报ID|槽位 0–3|main 或 reserve]`（缺省 main），战报 ID 形如 `r` + base36，非法栏位只记 `combat-tag-invalid`。loot 只由程序写在胜利战报块之后，主模型不写；续写提示词允许把战报里的「战利品：」一行写进剧情。`report.js` 的 `attachLoot` 在块内末尾加「战利品：角色 + 动词 +「名称」」一行、块后附 loot 标签；折叠正则把块后的 exp 与 loot 标签行一并折进「战斗记录」。
- 12a 账本：日志表新类型 `loot` / `sell`。扫描只认胜利且战报 ID 一致的战报楼，槽位从开战楼 offer 整份拷入，备用套记 30 积分花费；offer 暂时读不到时只记诊断，补扫入账。归并以 offer 为准，每场一条；卡牌进图鉴与卡组，装备只进背包、已有同名时整条拒收，道具累加，杂物进收藏。`ledger.sellKeepsake(lootId)` 串行写 sell，锚定当时最新楼层，只能卖主角收藏里现有的杂物，售价按稀有度（普通 10 / 罕见 20 / 稀有 40 / 史诗 80 / 神话 150）。积分只主角有收支，余额由 sell 加分、备用套 loot 扣分按楼层推导，不另存；余额不足时备用套 loot 整条拒收；条目所在楼换 swipe 或删除时收支随之回退。角色视图新增 `collection` 与 `points`，`effectiveState()` 新增 `loots`。
- 定向验证：`combat-directives / combat-report-regex` 20/20；`combat-ledger / combat-session / combat-deck-panel / combat-generation / combat-growth-fx` 81/81（新增用例覆盖 loot 补扫入账、杂物入收藏、重扫幂等、失败战报不入账、卖出与重复卖出、备用套扣分、卖出楼换 swipe 后卖出回退与余额不足拒收、战报改为失败后战利品失效）；`combat-prompt-assembly / combat-panel / combat-tables` 57/57；`npm.cmd run build` 成功，产物仍为 0.36.115，构建输出注明未验证下载与启动。真实 shujuku 写 loot / sell、测试酒馆与手机均未验收。
- 12b 会话：`combat/flip.js` 纯函数决定翻牌。背面位置按 combatId 与套别的种子打乱，重开一致；透视先亮出 1–2 张，只亮不算翻；再翻（4 槽）翻两张后二选一，否则翻一张即选定；花 30 积分重抽换上备用套重新翻，每场一次，与再翻并存，旧 offer 没有备用套、领取者不是主角或余额不足时不可用。会话胜利结束后读本场 offer 建 `session.flip`（loading / none / error / ready）；`flip / choose / reroll` 的进度先存会话存档，再写开战楼聊天记录该场的 `flip` 字段（不改 `result`），同机续战与换设备都恢复已选的牌，不能重翻。有 offer 时未选不能发（`combat-flip-required`），选定后 `finish` / `retrySend` 附战利品行与 loot 标签再发送；没有 offer 时照发不带战利品；账本读不到或进度损坏时不发。会话只按当时余额放行重抽，实际扣分与拒收由账本按真实余额裁决。
- 12b 定向验证：combat 相关 10 个测试文件合跑 160/160（新增用例覆盖翻牌、未翻不能发、不能重翻、同机续战与换设备恢复已选的牌、重发附战利品并入账、重抽换备用套且每场一次、积分由账本按真实余额裁决、进度损坏时不发送、没有 offer 照发）；`npm.cmd run build` 成功，产物仍为 0.36.115，构建输出注明未验证下载与启动。
- 12c 翻牌界面：战斗面板的结算画面与「战报未发送」行接入 `session.flip`。卡背一律相同；点一张翻开即选定（再翻时翻两张后二选一），自己翻开的牌按稀有度出光效（普通 / 罕见柔光、稀有闪光加粒子、史诗光环、神话光柱加全屏白闪），其余牌随后翻开、降一档；标题只写「战利品」；选定后才出「重新抽取（消耗30积分）」，积分不足置灰；未选定时发送置灰，会话层门禁不变。减少动态效果时直接显示结果，低画质去掉粒子、光柱与白闪。宽横屏有战利品时队伍与战利品左右并排，避免 540px 高的 PC 浮窗裁掉卡牌与「发送战报」。
- 12d 胜利过渡：面板内的结果横幅改为最后一次命中落下后 600ms 出现、停留至多 1700ms，放到 70% 时换结算画面，横幅叠在结算画面上淡出；结算入场整块淡入后依次升起，只在第一次画出后的 1.3s 内播放，重绘不重播（翻牌时标题不再反复弹跳）。阅读器正文的战斗演出时长不变。
- 本地预览：`tools/local-preview` 新增 `loot=3|4`（开战楼 offer 已入库的合成杂物，4 槽带再翻与 1 张透视），需配合 `write=memory`；`capture.mjs` 同步支持该参数。
- 12c / 12d 验证：`combat-panel` 43/43（新增翻牌、再翻与透视、神话白闪与低画质、战报未发送门禁四组用例；结算过渡用例补上横幅提前换画面与入场标记断言）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 213/213；`npm.cmd run build` 成功，产物仍为 0.36.115，构建输出注明未验证下载与启动。无头 Edge 在 1440×900 与 390×844 下截图核对了翻牌前后的布局与置灰；横幅到结算的过渡与光效动画需在可见预览中目视确认，真实酒馆与手机未验收。
- P-a 背包：人物状态面板「收藏」页改名「背包」，列未装备的装备（保留「装上」）与杂物，装备页只留四个部位与道具；主角顶部显示积分，每件可「卖出」，点后在该行确认售价或取消；非主角只能装上、不能卖，战斗进行中只读。日志 `sell` 载荷扩为 `{ lootId }` 或 `{ gearId }`（恰有其一，旧条目照常归并），新增写口 `ledger.sellGear(gearId)`；穿戴中的装备在写口与归并两层都拒收（`combat-gear-equipped`）。售价由 `points.js` 的 `sellPrice(rarity, key)` 计算：以普通 10 / 罕见 20 / 稀有 40 / 史诗 80 / 神话 150 为中心，按物品身份确定性浮动 ±20%（`SELL_PRICE_SPREAD`），没有稀有度（剧情 equip 标签得到的装备）按普通；翻牌得到的装备入背包时带上槽位稀有度。面板换装与卖出共用串行队列与同楼 occurrence 序列，排在同楼标签条目之后，同楼先卸下再卖出成立。
- P-a 验证：`combat-ledger / combat-deck-panel` 44/44（新增装备卖出、写口与归并两层拒收穿戴中装备、同楼卸下后卖出、卖出楼换 swipe 回退、sell 载荷二选一与售价区间、背包页确认 / 取消 / 只读用例；12a 杂物卖出断言改按 `sellPrice` 推导）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 216/216；`npm.cmd run build` 成功，产物仍为 0.36.115，构建输出注明未验证下载与启动。±20% 浮动幅度为实施时取值，待助手确认。
- P-b 重新生成基础卡组：卡组页主角给「重新生成基础卡组（消耗200积分）」，积分不足置灰，点后在原处确认或取消，战斗进行中不显示。服务层 `regenerateDeck` 在扩展关闭、战斗进行中、非主角或积分不足时不请求副 LLM；按主角现职业请求 profile-deck，只取个人卡池与起始卡组，新卡 ID 追加本次标记，不与旧卡相撞。日志新类型 `rebuild`（`{ personalPool, starterDeck, cost }`，cost 固定 200）锚定最新楼层，写前试归并，会被拒收时不写、不扣；归并扣回旧起始卡组计入的张数、移出旧个人池的卡，领悟 / 翻牌 / 奖励得到的卡、装备、道具、EXP 与属性保留，卡组重置为新起始卡组。rebuild 与换装、卖出同属面板操作；同楼在它之后保存的卡组与领取的奖励改用 `panel` 标签排在其后，旧条目排序不变；所在楼换 swipe 或删除时扣分与新卡池一并回退。
- P-b 验证：`combat-ledger / combat-deck-panel` 47/47（新增 rebuild 扣分换池、不合规 / 非主角 / 积分不足拒收且不写表、同楼之后保存的排序、换 swipe 回退；面板按钮置灰、确认 / 取消、转发与只读；服务层守卫不请求副 LLM）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 219/219；`npm.cmd run build` 成功，产物仍为 0.36.115，未验证下载与启动。完整的副 LLM 重生链路只有服务层守卫用例，未用合成回复跑通。
- P-c 转职与职业升阶：卡组页主角在「重新生成基础卡组」下方给「转职（消耗150积分）」与「职业升阶（需 Lv5 · 消耗300积分）」（三阶为 Lv10 · 600，已到三阶不显示），积分或 EXP 等级不足置灰，点后在原处确认或取消，战斗进行中不显示。转职可选其他已登记职业（不请求副 LLM），或选「新职业」按剧情由副 LLM 生成（不得与已登记职业同名），先写档案再写日志；转职被拒时不扣分，已写入的新职业留作可选职业。升阶请副 LLM 按世界观生成阶名与 3 张追加职业卡（kind `class-tier`；二阶 rare、三阶 epic，费用槽 1 / 2 / 3，ID 由程序给定并带本次标记）。日志新类型 `respec`（`{ classRef, cost }`）与 `ascend`（`{ classRef, tier, tierName, cards, cost }`）锚定最新楼层，写前试归并，会被拒收时不写、不扣；归并核对只主角、cost、余额、逐阶（当前阶 +1）、仍是当前职业、EXP 等级门槛、追加卡稀有度与 ID 不相撞。追加卡进图鉴（可在升级三选一中出现），不计入拥有。职业被动由角色视图按阶派生：每升一阶按 rare / common 求解中心比 1.2 向上取整加强一档、逐阶叠加（如力量 1 → 2 → 3、格挡 4 → 5 → 6），登记的职业档案不改。换到另一个职业（respec 或剧情 class 标签）时阶数回到一阶，已有卡牌保留。同楼在 rebuild / respec / ascend 之后写的卡组与奖励排在它们之后。重新生成、转职、升阶共用服务层前置检查与账本写口（`heroPanelReady` / `writeHeroPanel`）。
- P-c 验证：`combat-ledger / combat-generation / combat-deck-panel` 70/70（新增转职 / 升阶归并与拒收不写表、二阶 / 三阶加强与追加卡、同楼领奖排序、转职楼换 swipe 回退；class-tier 组装与 cards[i] 定向修正、转职新职业重名拒收、被动逐阶加强；面板置灰、确认 / 取消、转发与只读；服务层守卫不请求副 LLM）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 223/223；`npm.cmd run build` 成功，产物仍为 0.36.115，未验证下载与启动。副 LLM 生成阶名、追加卡与新职业的完整链路只有组装校验与服务层守卫用例，未用合成回复跑通服务层成功路径；转职 / 升阶按钮尚无可见预览审阅。
- P-d 人物特性：状态页主角给「抽人物特性（消耗100积分）」，点后在原处确认或取消，积分不足置灰，战斗进行中不显示。稀有度由程序按主角 ID 与已生效抽取次数确定（普通 50 / 罕见 30 / 稀有 14 / 史诗 5 / 神话 1），楼层回退后再抽仍是同一稀有度，不能靠回退刷稀有度；副 LLM 按人设、剧情与世界书起名、选被动模板、写来历（kind `trait`），被动按稀有度加强。日志新类型 `trait`（扣 100）与 `trait-pick`（已满时决定 drop：替换一个已装特性，或放弃新特性，被 drop 的永久消失、积分不退），都锚定当时最新楼、随楼层回退；最多装 2 个，有待定特性时不能再抽。装着的特性被动随主角进入战斗 setup；准备战斗时按主角特性汇总翻牌联动（再翻多 1 槽、天运上调一档、透视亮 1 张、神话透视亮 2 张）写进 offer。抽取时附带联动的比例规格只写「部分」，待助手给出比例；确认前抽到的特性不带联动，联动的消费链路已接通并测试。饰品、宝物装备的翻牌联动仍未接入。
- P-d 验证：`combat-ledger` 30、`combat-generation` 21、`combat-session` 19、`combat-deck-panel` 24（新增 trait / trait-pick 归并、替换 / 放弃、非主角 / 伤害超限 / 重复 / 积分不足 / 有待定特性拒收且不写表、抽取楼换 swipe 回退；稀有度确定性与分布、联动汇总；会话再翻 4 槽、神话透视 2 张、特性被动进 setup；trait 实体组装、template 定向修正与附人设；面板置灰、确认 / 取消、替换 / 放弃转发与只读；服务层守卫不请求副 LLM）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 229/229；`npm.cmd run build` 成功，产物仍为 0.36.115，未验证下载与启动。副 LLM 生成特性的服务层成功路径未用合成回复跑通；特性行与按钮尚无可见预览审阅。
- P-e 时尚小垃圾：新增 12 个华而不实被动模板（开战 1 点格挡 / 1 层荆棘 / 全体中毒 1 层 / 1 层再生，回合开始 1 点格挡或回复 1 点生命，回合结束回复 1 点生命或获得 1 点格挡，受击后 1 点格挡或回复 1 点生命，濒危时回复 1 点生命或获得 1 点格挡），名称由副 LLM 起得气派，效果几乎没用；只供人物特性、装备被动与奖励装备槽选用，照原规则随稀有度与宝物加强；职业、个人、技能角色与敌人被动不可选。「提高权重」规格未给机制与比例，待助手确认，确认前不加权。
- P-e 验证：`combat-generation` 22（新增华而不实被动：人物特性、装备、宝物与奖励装备槽可选并照原规则加强，职业 / 个人 / 技能角色 / 敌人被动与道具槽按字段路径拒收，基础量级为 1）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 230/230；`npm.cmd run build` 成功，产物仍为 0.36.115，未验证下载与启动。
- P-f 抽特性动画：确认抽取后状态页主区换成揭晓舞台，标题栏与关闭保留。蓄力时背面卡居中呼吸，光圈旋转、粒子向中心聚拢，颜色按程序预定的稀有度；写入成功后翻开，第一次画出时翻面爆光，神话另加整面板闪白与震屏，之后重绘不重播；卡面写稀有度与名称，下方写效果与来历。未满时「确定」关闭；已满时下方并排已装的两个特性各带「替换」，另给「放弃」。生成失败不翻开、不扣分，原因在提示条。减少动态效果时直接显示结果，低画质去掉粒子与闪白。
- P-f 验证：`combat-deck-panel` 26（新增两组：蓄力按预定稀有度着色、神话第一次翻开带闪白且重绘不重播、「确定」关闭、减少动态效果直出；已满时并排两个已装特性与替换 / 放弃、成功后关闭、生成失败不翻开）；combat 相关 12 个测试文件与 `ui-conventions` 合跑 232/232；背面淡出修正后 `combat-deck-panel` 与 `ui-conventions` 28/28；`npm.cmd run build` 成功，产物仍为 0.36.115，未验证下载与启动。本地预览新增 `trait=1`（配合 `scenario=deck&write=memory`）：聊天末尾追加三场已胜利的战斗与入账的神话杂物，合成 `generateRaw` 只应答 trait 实体、延迟 1.8 秒，不发网络请求；`capture.mjs` 同步支持。无头 Edge 1280×720 卖出三件得 477 积分，三次抽取依次为普通、罕见、罕见；蓄力、翻开与已满并排三态截图经读图核对，发现并修正翻面后背面残留的竖条；390 宽度开启减少动态效果走完三态，无溢出、无控制台错误。预览主角前 120 次抽取不出神话，神话闪白与震屏只由测试覆盖；动画观感待助手在可见预览中确认，真实酒馆与手机未验收。



- 技术债：sell 与卡组保存等面板条目一样只核对楼层号与 swipe；删除中间楼层使后续楼号前移时，沿用现有锚点语义，不另做迁移。
- 范围：R3；仅本地准备，未 commit、push 或 tag。


## v4 第一批实施记录（本地，未提交，未升版本）

依据 `.limcode/plans/combat-v4-batch1.plan.md`；机制形状参照杀戮尖塔归类，命名与说明自有。

- 规则与引擎：`COMBAT_RULES.version = 4`，`COMPATIBLE_RULES_VERSIONS = [3, 4]`，v3 进行中战斗与记录照常重放；战局状态的 `rulesVersion` 取 setup 的值（缺省为当前版本）。新增弃牌、弃全手再抽、复制、生成临时牌、重复上一张、下一张多结算、本场成长、减费、限时触发 BUFF；新增出牌 / 被弃 / 消耗 / 击杀 / 洗牌 / 失去生命 / 获得格挡触发与对应条件；卡牌关键字固有、虚无、不能打出、保留与被弃时效果；`choose` 待选阶段已在引擎实现，面板可在手牌里点选并按「弃掉 / 复制 / 减费 k/N」确认（派发 `choose` 动作，随会话动作重放）。
- 模板与生成：新增 28 个模板（含 X 费 `whirl` / `xguard`，限定费用 `mimic` / `hone` / `reflex` / `scrap` / `forge` / `talisman` / `replicate` / `temper`；玩家选牌的 `cull` 指定弃牌、`toss` 伤害并指定弃牌、`replicate` 从手牌选一张复制、`temper` 选一张本回合减费，只作卡牌、不作人物技能）；`buildCard` 透传关键字与被弃时效果；职业卡固定位置放 X 费模板时在 1–3 费位置改为 X 费，费用不符的限定模板返回 `template-unsolvable`；`chain` 等本牌专属模板不能用作人物技能。
- 托管：v4 战斗没有伤害牌时按效果估值 / 费用挑牌，此刻会落空的「重复上一张」「下一张多结算」不计价，无牌可打就结束回合；v3 记录仍回退到手牌第一张。
- 面板：手牌显示关键字行、临时牌降饱和度、减费费用球转青绿并在读屏附原费用；牌库面板 X 费排在 3 费之后。战报、成就与命中演出只处理已知事件，v4 新事件不报错、不入战报；临时牌只在本场引擎状态中，不进账本、奖励与卡组。
- 卡面纹样与关键字注释（助手 10-28 确认：类型文字保留，用 SVG 区分并按名称与效果模糊匹配；关键字像数字一样点开看注释）：新增 `visual/igs-ui/combat-card-motifs.js`，共 101 种纹样；先按卡名在全部纹样里匹配（每字 5 分、整词再加 10 分，不受牌型限制，如攻击牌「流光」配流光纹样），同分再看效果结构，卡名一个字都没命中时才在本类型的纹样里按效果结构选，仍同分按卡牌 ID 哈希定一张（助手 10-28：SVG 按名字来，不跟牌型）；卡名只参与匹配、不进 SVG。三种生成牌各有专属纹样（碎刃、护符、灵光），本场临时牌（生成 / 复制）加虚线描边与错位残影。关键字固有、保留、虚无、临时与效果说明里的「消耗」带 `data-scale-tip`，点开弹出注释，与数字加成详情同一套交互；「不能打出」「被丢弃时」不带注释（助手 10-28：字面已自明）；普通卡手牌视图形状不变。`record-icons.js` 导出同规格外壳 `lineIconSvg`，意图箭头与纹样共用。
- 交互调整（助手 10-28）：关键字「被丢弃时」与「不能打出」不带注释；再点一次已选中的牌撤销选中，整块重绘时指针所在的手牌带 `.is-hover` 保持抬起，重绘后不先落回扇形；不选目标的牌拖出手牌区后松在空处也打出，松回手牌区撤销，量不到手牌区时按撤销处理。窄面板（390 宽等竖向排布，牌宽 88px）手牌的关键字与效果说明同排，说明最多两行、超出以省略号截断（全文在读屏标签里），牌高与普通牌一致，回合按钮与选牌确认钮不被长说明挤出面板。
- 预览：本地预览 `scenario=lobby&v4=1&start=1`（加 `awaken=resolve` 可看减费；加 `choose=1` 时首手「先机」换成「筛选」，打出后进入待选阶段，预览选牌界面）。
- 验证：12 个战斗测试文件 243/243 通过；卡面纹样与关键字注释后，12 个战斗测试文件与 `ui-conventions` 合跑 247/247（新增关键字注释、纹样匹配两项）；交互调整与按名匹配后合跑 247/247（改写再点、拖牌与纹样用例，未新增测试项）；纹样扩充到 101 种与选牌界面预览后合跑 248/248（新增待选阶段视图与渲染一项）；`npm.cmd run build` 生成成功，`dist/igs.bundle.js` 与 `dist/igs.bundle.debug.js` 冷启动、关闭与重启检查通过（远程下载、真实酒馆与手机未验证）。
- 未完成：牌面纹样（101 种）、关键字注释、临时牌残影与选牌界面预览的视觉效果待助手确认，确认后选牌确认钮再派发引擎 `choose` 动作；内部禁止组合名单、人物特性字段池、正文获得的装备 / 技能 / 道具，以及计划第 2 节的自定数值待确认；未提交、未升版本。

## v4 第二批：平衡模拟与校准（本地，未提交，未升版本）

- 脚本 `app/scripts/combat-balance.mjs`（不进 bundle、不进测试门禁）：模板卡组主角（剑士职业 11 张 + 个人 4 张，经 `generateEntities` 组装）由托管策略（`chooseAllyPlay` / `pickCards`）驾驶，对战模板敌人。主角等级与敌人相对档走正文 EXP / rel 标签扫描入账，属性提升点按主擅长、次擅长优先全部分配；setup 由 `buildSetup` 按当场难度生成，满血开战；种子确定，同参数重跑结果一致。参数：`--runs --levels --count --tiers --rels --diffs --hero-skill --generated --brief --try --out`。
- 基线（`app/docs/bench/combat-balance-baseline.md`，校准前规则，每格 20 场）：相当 · 普通与精英胜率 100%，胜利损失 1–38%；稍强、强敌 · 普通也全胜；首领胜率 5–30%。原因：模板敌人伤害（普通 7、精英 11）对 80 生命以上的卡组主角威胁很小；相对档只抬高敌人等级，生命每级 +12%，伤害不随等级变化。
- 校准（`rules.js`）：档位校准倍率 `tiers.*.hpScale / damageScale`（普通 1.3 / 2.7、精英 1.15 / 1.75、首领 0.68 / 1）与难度倍率相乘写进 setup；敌人生命每级成长 `tierScalePerLevel` 由 0.12 降到 0.05；新增 `levelGap`，敌人比我方平均等级每高 1 级，生命 +2%、伤害 +4%。档案校验与旧战斗记录重放不受影响。
- 结果（`app/docs/bench/combat-balance-v4.md`，每格 40 场，标准档，胜率 / 胜利损失生命）：

| 对局（目标） | 1 级 | 5 级 | 10 级 |
|---|---|---|---|
| 相当 · 普通（85–95% / 25–45%） | 93% / 32% | 100% / 33% | 95% / 43% |
| 相当 · 精英（70–85% / 45–65%） | 83% / 59% | 85% / 63% | 50% / 70% |
| 相当 · 首领（55–70% / 60–85%） | 65% / 61% | 90% / 56% | 65% / 62% |
| 稍强 · 普通（65–80% / 45–70%） | 83% / 45% | 83% / 47% | 68% / 53% |
| 强敌 · 普通（50–65% / 45–70%） | 50% / 66% | 48% / 61% | 45% / 66% |

- 难度梯度调平（助手 10-29 同意）：调平前精英、首领从标准到困难一档胜率降 40–67 个百分点，严酷以上几乎不胜。现改为：精英、首领的难度生命 / 伤害倍率只计高出 1 的一半（`tiers.*.difficultyGain` 0.5，轻松档的下调不变，普通档位不变）；常驻效果数困难 0 / 1 / 2、严酷 1 / 1 / 2、噩梦 1 / 2 / 3（困难起精英、首领各比原表少 1，且不少于低一档）。
- 调平后相当档胜率（1 / 5 / 10 级，每格 40 场）：
  - 精英：轻松 100 / 100 / 100%，标准 83 / 85 / 50%，困难 63 / 63 / 33%，严酷 40 / 45 / 20%，噩梦 0 / 5 / 8%。
  - 首领：轻松 100 / 100 / 98%，标准 65 / 90 / 65%，困难 68 / 68 / 50%，严酷 40 / 48 / 25%，噩梦 8 / 10 / 0%。
  - 普通：轻松 100%，标准 93–100%，困难 83–93%，严酷 50–63%，噩梦 33–43%。
  - 标准到严酷每档约降 10–25 个百分点；噩梦仍接近不可胜（诅咒牌、生命上限 −10%、追加技能与狂暴阈值叠加），未再下调。首领困难档与标准档接近，差值在 ±7 个百分点的抽样误差内。
- 生成敌人近似形状（`--generated`，技能全部按模板在伤害上限求解）：相当 · 普通 98–100%、精英 45–80%、首领 40–83%，与模板敌人接近，个别格偏难。
- 局限：托管策略不用人物技能与道具，也不做多回合规划，真人通常打得更好；只测单只敌人、无队友；每格 40 场的胜率标准误约 ±7 个百分点。

## v4 第二批：抽特性的上下文核对（只读核对，未改代码）

- 抽人物特性（`core/combat-services.js` `drawTrait`）的副 LLM 请求带三类参考：
  - 人设：`withCharacterLore` 经宿主 `readCharacterLore(names, { includeWorldInfo: false })` 读用户人设（名字等于 `ctx.name1` 时）与同名角色卡描述，写进实体 `input.lore`。主角档案名取自 `getUserName()`，即 `ctx.name1`，所以能对上用户人设。
  - 剧情：`withStoryContext` 经 `host/combat-story-context.js` 读最近 3 楼 AI 正文，去掉标签后保留末尾 1600 字，写进 `context.story`。
  - 世界书：同一读取器以主角名为触发词，走原生世界书扫描（与写词同一 `getWorldInfoPrompt` 链路），保留开头 3000 字，写进 `context.worldInfo`。
  - 三者都由 `buildGenerationRequest` 放进请求的 `context` 与 `entities[].input`。系统提示要求 trait 的名称与来历依据这三项。
- 失败语义与开战准备一致：任一读取抛错、宿主缺 API 或读到空内容时，只是不带该项，照常抽取；不阻断，不扣积分以外的状态。不记诊断，界面也不提示（`generation.js` `withCharacterLore` / `withStoryContext` 的 catch 只做降级）。
- 与开战准备的差异：抽特性的 context 不带 `encounter` / `tier`（抽特性没有遭遇）；世界书触发词只有主角名，开战准备是全部参战者。
- 未验证：真实酒馆里的世界书扫描结果与人设文本，只核对了代码路径。

## v4 第二批：持续伤势与剧情回血（本地，未提交，未升版本）

- 规则（助手 10-29 确认）：战后生命入账，胜利、战败、撤退都记；下一场按「本场上限 − 上一场损失」开战（至少 1），升级或换装提高上限时不扣当前值；队友倒下后在剧情回血前不参战，战前单列「倒下」；主角必须参战，倒下后下一场按 1 点生命开战；旧存档没有记录按满血。
- 回血只靠正文 `[igs-combat:heal|角色|恢复量|原因]`：点数或生命上限的百分比（全角数字与 ％ 都认），不设每楼上限；噩梦档回血减半（难度表 `healScale`，扫描时记进条目）；战报续写段不回血，写了只记诊断。战斗内道具回血照旧只在本场生效。
- 落点：`schema.js` 日志类型 `wound` / `heal`；`ledger.js` 归并与 `characterView().wound`；`session.js` 战报留档 `wounds`、落楼写 `wound`、`buildLobby` 的 `downed`、`buildSetup` 的开战 `hp`、`lobbyVitals` / `vitalsOf`；`combat-directives.js` 解析 heal；`combat-prompt.js` 标签说明，续写段禁写 heal；`prompt-triggers.js` 战斗块触发词含 heal；战前名牌写开战生命、人物状态页写当前生命与伤势词。
- 测试：账本（入账、战报 ID 核对、点数 / 百分比回血、噩梦倍率、续写段 heal、swipe 回退）、会话（胜 / 败 / 撤退写 wound、重发不重复、倒下队友不参战、主角 1 点开战、回血后带剩余生命参战）、面板（战前生命与「倒下」行）、提示词触发。
## v4 第二批：正文注入主角团状态（本地，未提交，未升版本）

- 范围（D3）：主角 + 最近一场参战的队友。最近一场取账本最后一批生效的 `wound` 条目所在的战报楼（`computeEffectiveState().lastParty`），楼层回退或 swipe 后随条目失效自动回退到上一场；还没有战斗时只列主角。
- 内容：每人一行名字、等级、生命当前 / 上限与伤势词（`report.js` `injuryLevel`），倒下的同伴写「回血前不能参战」、主角写「再遇战斗只剩 1 点生命」；六维；附剧情回血标签写法与使用时机。不写具体数值的要求留给正文。
- 链路：`core/combat-services.js` `refreshGrowth` 在同一次归并里算 `partyStatus` 放进成长缓存；生成开始时 `partyPromptInput` 同步读缓存，`bootstrap.js` 用 `resolveCombatPartySegment` 生成 depth 0 段，与 `combat-narration`、骰序同走 `segments`。
- 失败语义：扩展关闭、代写 / 静默生成、战报续写时不注入；缓存缺失、换聊天、账本读取失败或状态计算抛错时不注入，并记诊断 `combat-party-status-unavailable`（带原因）。
- 测试：会话（`partyStatus` 主角 + 最近一场队友、倒下标记、无战斗只列主角）、构筑面板服务（缓存未刷新时不注入并记诊断、刷新后列出主角、静默生成不注入）。模型是否照状态写伤势只能实机观察。





## 日常挑战（本地，未提交，未升版本）

设计稿：`docs/DAILY_CHALLENGE_DESIGN.md`（§9 开头记着用户的拍板结果）。把卡牌引擎当作「过程」使用，处理日常里成败攸关的一件事；引擎、模板与重放不改，只换入口、说法与后果。

- 入口与设置：设置器「战斗」页选卡牌战斗后，增加「对决类型」（战斗 / 日常挑战 / 两者，缺省战斗，旧存档行为不变）、「仅日常挑战」预设与日常字段（每个游戏日次数、间隔楼数、失败代价轻重、允许放弃）；字段在 `combatExpansion.kind` 与 `combatExpansion.daily`，归一化在 `combat-settings.js`。皮肤沿用现有战斗皮肤，只换文案，不另画日常皮肤。
- 标签与提示词：AI 在楼末写 `[igs-challenge:事件名|领域|难度|代价|对方]`，只含离散词，数值全部由脚本查表。语法行单独成段（`combat-prompt.js` 的 `resolveChallengePromptSegment`），不进战斗语法块；额度用完或冷却中时该段不出现。选「仅日常挑战」时战斗语法、战报续写段与队伍状态段都不注入。
- 会话：`combat/session.js` 的 `locateCombatStart` 按对决类型认战斗或挑战标签，挑战的 `combatId` 前缀为 `ch`；备战不读账本、不写档案，副 LLM 只用来选难关（失败退回本地）；`autoPlay`（托管）、`abandon`（放弃，发出放弃战报）、`pickChallengeAllies`（大厅挑最多两名协助者）；结束时不翻牌、不写伤势、不扫描战斗账本；回合上限到时在适配层补胜负。
- 面板与入口：楼底入口「迎接挑战：事件名」，旁边「放弃」（二次确认）与「交给托管」，不自动弹出；面板按 `view.challenge` 换文案（难关、意志、进展、稳住，状态名与出招别名取自 `challenge-labels.js`），九套画布皮肤只替换少数固定词；结束页展示奖金档位与经验牌；「挑战记录」页列出历史与成就（仅日常挑战时工具栏「人物状态」按钮打开它）。
- 结算：战报是用户楼，由紧随其后的 AI 楼结算（`core/stats-runtime.js` 把战报合成的指令经 `settleFloorText` 的 `extraDirectives` 交给 `stat-challenge.js`），回退或重新生成该楼时一并撤销；按战报编号去重。
- 经验牌：圆满且难关登记了经验时，战报发出后写一条挂在战报楼上的 `learn` 记录（`ledger.js` 的 `CHALLENGE_REWARD_TAG_HASH`，战报不是圆满即失效）；没有主角卡组档案时账本按缺角色记诊断，不入库。
- 测试：`app/tests/daily-challenge-*.test.js`。
