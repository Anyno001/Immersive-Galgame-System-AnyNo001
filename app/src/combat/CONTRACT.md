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

## 约束

- 校验只拒收不修正：未知字段、越界数值、超预算、未知效果一律返回 `{ ok: false, errors: [{ path, reason, detail? }] }`，供副 LLM 定向修正。可选字段只在缺省时取默认值。
- 副 LLM 只能组合 `EFFECT_OPS` 中的效果原语，不接受自由文本效果。
- 档案与日志带 schema 版本 `v`；不支持的版本拒收，不就地升级。
- 同一职业以已登记的 `class` 档案为准；`deck-character` 通过 `classRef` 引用职业，只持有个人部分。
- 起始卡组固定为 20 张：基础攻击 3、基础防御 3、职业卡 10、个人卡 4，且同名卡不超过 3 张。
- 成长日志除 `profile` 与 `revoke` 外必须带锚点 `{ messageId, swipeId, tagHash, occurrence }`；条目 ID 由 `ledgerEntryId` 确定性推导。

## 禁止

- 禁止在 combat 内直接访问 DOM、酒馆全局对象或 `AutoCardUpdaterAPI`。
- 禁止使用 `Math.random` 或当前时间影响战斗结算；随机性必须来自传入的种子。
