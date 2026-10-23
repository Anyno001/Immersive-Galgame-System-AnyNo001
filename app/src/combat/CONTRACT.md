# combat 模块契约

## 职责

- 战斗扩展的领域逻辑：规则常量、数据契约校验、战斗引擎、托管策略、成长日志归并、副 LLM 生成校验、战报构造与战斗会话编排。
- 设计与计划：`.limcode/design/combat-expansion.md`、`.limcode/plans/combat-expansion.plan.md`；实施核实结论见 `docs/COMBAT_EXPANSION.md`。

## 依赖方向

- combat 只依赖 scene 的解析结果与经参数注入的 data/shujuku 适配器；不导入 visual、host、core。
- visual 与 core 依赖 combat；宿主发送、副 LLM、存储均由调用方传入。

## 文件

- `rules.js`：`COMBAT_RULES`（每回合能量 3、抽牌 5、卡组 20–30 张、同名卡不超过 3 张、敌人档位、职业原型）、基础卡 `BASIC_CARDS`、卡牌价值预算 `evaluateCardBudget`、经验曲线 `levelFromExp/expProgress`、卡组校验 `validateDeck`。
- `schema.js`：效果原语、卡牌、技能、被动、档案（`class / deck-character / skill-character / enemy`）与成长日志条目的判别联合校验。
- `random.js`：确定性哈希与伪随机数，用于战斗重放。
- `battle-state.js`：只读的战局查询与数值估算（存活单位、最弱目标、卡牌视图、伤害/格挡计算、条件判定、意图描述），供引擎与策略共用。
- `engine.js`：纯函数引擎。`createBattle(setup, seed)`、`applyAction(state, action) → { ok, state, events, error? }`、`legalActions(state)`、`replayBattle(setup, seed, actions)`、`seedFor(combatId)`。结局为 `victory / defeat / escape`；操控角色倒下即 `defeat`。
- `policy.js`：确定性托管。`chooseAllyPlay`（预计受伤大于格挡先防御 → 可击杀时取最低费击杀 → 前两回合打能力牌 → 按伤害/费用攻击最弱敌人）；`chooseSkillIntent`（按权重与冷却抽取，同一技能不连续使用三次）。
- `ledger.js`：成长账本。`createCombatLedger({ tables, chat, userName, sourceFilter, now })` → `read / effectiveState / append / scan / saveDeck / claimReward`；只读归并两张战斗表，按锚点（`messageId + swipeId + tagHash + occurrence`，不含 chatId）判定条目是否生效，读取失败返回 `ok:false`，不当作空账本；`claimReward` 只在等级已达到且未领取时写入；写入只经注入的 `tables`。`effectiveState()` 另返回 `growth`（已生效的 exp / learn / upgrade / class 条目，带接手角色、锚点与生效前后等级），供成长演出只读。同名时卡组档案优先：技能档案让位但保留（诊断 `combat-profile-superseded`），其 EXP 在归并时并入卡组档案，不改表；让位档案的其他条目只记诊断 `combat-superseded-entry-skipped`。
- `generation.js`：副 LLM 生成。`generateEntities(entities, { request, llm, signal })` → `{ ok, accepted, rejected, diagnostics, blocked }`；逐实体 schema 与预算校验，不合格实体最多定向修正 2 轮，已通过实体不再提交；修正耗尽时敌人回落模板敌人、主角 `blocked`、队友不参战；取消返回 `request-stale`。只构造请求与校验，不落账。
- `report.js`：战报构造。`buildCombatReport(...)` → `{ ok, text, result, reportId, exp }`；只写技能名与相对伤势，胜利附 EXP 标签，失败与撤退不附。
- `session.js`：战斗会话。`createCombatSession(deps)` → `prepare / start / act / finish / retrySend / skip / resume / reset / state`；断点续战只存 `{ combatId, anchor, seed, setup, actions }`，核对锚点与规则版本后重放；先写待回传再发送，失败不自动重发；已回传的战斗只能回顾。宿主能力全部注入。

## 约束

- 校验只拒收不修正：未知字段、越界数值、超预算、未知效果一律返回 `{ ok: false, errors: [{ path, reason, detail? }] }`，供副 LLM 定向修正。可选字段只在缺省时取默认值。
- 副 LLM 只能组合 `EFFECT_OPS` 中的效果原语，不接受自由文本效果。
- 档案与日志带 schema 版本 `v`；不支持的版本拒收，不就地升级。
- 同一职业以已登记的 `class` 档案为准；`deck-character` 通过 `classRef` 引用职业，只持有个人部分。
- 起始卡组固定为 20 张：基础攻击 3、基础防御 3、职业卡 10、个人卡 4，且同名卡不超过 3 张。
- 成长日志除 `profile` 与 `revoke` 外必须带锚点 `{ messageId, swipeId, tagHash, occurrence }`；条目 ID 由 `ledgerEntryId` 确定性推导。
- 引擎不就地修改入参：`applyAction` 先校验，非法动作返回原 `state`、空事件和 `{ reason, detail? }`；合法动作在副本上结算。断点续战只保存 `setup`、`seed` 与动作序列，由 `replayBattle` 重建，不持久化引擎快照。
- 开局配置 fail-closed：规则版本不符、单位 ID 非法或保留名、卡组引用未知卡、操控角色不是友方卡组角色、种子非法均拒绝建局。

## 禁止

- 禁止在 combat 内直接访问 DOM、酒馆全局对象或 `AutoCardUpdaterAPI`。
- 禁止使用 `Math.random` 或当前时间影响战斗结算；随机性必须来自传入的种子。
