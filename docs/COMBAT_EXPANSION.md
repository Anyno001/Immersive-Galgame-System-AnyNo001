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

