# 数据库表格精修计划（11-07，用户定）

本地文档，不推送。取代 `STATS_TABLE_DECOUPLE_PLAN.md`（11-05）中「AI 填了也盖回」的做法：不让 AI 碰，从源头避免冲突。

## 目标

- 减轻填表 AI 负担与 token：IGS 记录的表不发给填表 AI。
- 消除冲突：AI 不改数值，IGS 不用盖回。
- 保留用途：数值写进表格，随数据库插件按楼保存，方便读存档、回档、查看。
- 不在 AI 填的表里提 IGS（不写「好感不在本表」「六维不要填」这类粉红大象）。

## 一、两类表彻底分开

**IGS 记录表**（与战斗表、物品账同一写法，复用 `combat-tables.js` 的 `buildIgsSheet` 外壳）：

- 角色数值表、才艺技能表。
- `updateConfig.updateFrequency = 0`（数据库插件源码确认：0 = 不参与自动更新，不进填表请求；`backups/index.js:17711`、`28445`）。
- `exportConfig.injectIntoWorldbook = false`、`enabled = false`。
- `sourceData.note` 只写一句：「{表名}，由 IGS 程序维护。AI 不得填写、修改或删除此表。」；四个 Node 写「禁止。」。删除现有长释义（信任、好感各档含义等）与 ddl 以外的说明。
- 列不变（角色数值表：角色姓名｜好感度｜信任度｜了解程度｜芥蒂程度｜体力｜金钱｜压力；才艺技能表：角色姓名｜技能｜数值）。

**AI 填的表**：删除所有提到 IGS、前端、角色数值表、才艺技能表的句子（`stats-template-adapt.js` 中往重要角色表、主角信息表、物品表、检定建议表塞的 `${M}…` 段，共约六处）。只描述本表自己的内容。

## 二、重要角色表

- 删列「交互选项」（代码无读取方，实施时再 grep 核对）。
- 说明里「【IGS 数值系统】…」整段删除。

## 三、检定建议表（选项仍由数据库生成）

- 保留：填表 AI 每轮生成 5 条「展示文本｜骰子命令」，更新频率不变。
- 说明里删除「数值一律从才艺技能表取得」、六维规则、数值范围、特有技能规则、【角色属性来源】查询块等所有取值说明（`CHECK_RULE_BLOCK`、`CHECK_SOURCE_BLOCK` 及 updateNode 里的替换）。
- 改为：骰子命令只写角色名与技能名，不写数值；**不给技能清单**，技能名由 AI 按剧情自由写（短、明确、可用于检定）。
- 掷骰：数值系统开启时 IGS 用自己的数值（现状不变，`stats-runtime.js` `resolveDice`）；遇到不认识的技能按现有逻辑自动登记、近义归并。未开数值系统时走骰子插件，读不到再查才艺技能表（`reader-host.js` `skillTableReader`，保留这条兜底）。
- 核对 `dice-check.js` 的 `parseDiceCommand`：命令里不带数值时仍能解析；若 DSL 要求数值，调整说明里的格式示例而不是改解析。

## 四、写回

- IGS 每楼结算后把数值写入角色数值表、才艺技能表（`stats-push.js` 现有写回）。
- **用了 IGS 适配版模板的聊天自动开启写回**（检测到这两张表且其 updateFrequency 为 0 / note 为 IGS 维护时，视为开启，不必用户手动开）；其他聊天维持现有开关。
- 用户在表格里手改：照旧同步回 IGS（`adoptTableEdits`）。填表窗口检测（`FILL_WINDOW_MAX` 等）对频率 0 的表已无意义，但保留不删（旧模板仍可能被 AI 改）。
- 才艺技能表不再接收 AI 新增行；`readSkillAdoptions` 采纳 AI 新增技能的逻辑保留给旧模板，适配版模板下自然不会触发。

## 五、迁移

- `table-migrate.js`：已用旧版适配模板的聊天，迁移时把角色数值表、才艺技能表的 updateConfig、exportConfig、sourceData 换成第一节的写法；重要角色表删「交互选项」列（旧行按列名搬，丢弃该列）；AI 填的表的说明换成新模板版本。迁移前备份（沿用现有备份）。
- 重新生成 `docs/templates/` 下的适配版模板（`node scripts/build-stats-template.mjs`），并同步 `app/dist/templates/` 与 `G:\奶龙Code\gal\` 根目录的副本（根目录副本与 docs 版目前已不一致，以重新生成的为准）。

## 测试

只补针对性用例，`node --test` 跑 `tests/stats-template.test.js`、`tests/stats-skill-table.test.js` 及迁移相关测试，不跑全量、不跑 gate：

- 适配版模板：两张 IGS 表 updateFrequency 为 0、不注入、note 为一句；AI 填的表 note 中不含「IGS」「前端」「角色数值表」「才艺技能表」；重要角色表无「交互选项」列；检定建议表说明不含「才艺技能表」。
- 迁移：旧适配模板迁移后满足上条；旧行数据不丢。
- 骰子命令不带数值仍能被 IGS 解析掷骰。
