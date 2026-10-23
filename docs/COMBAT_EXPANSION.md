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
