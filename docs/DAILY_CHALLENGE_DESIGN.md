# 日常挑战设计稿（卡牌对决用于关键事件）

本地设计稿，不推送。2026-11-02 起草，只含设计，未改任何代码。所有「文件:行号」以起草当天的工作区为准，实施前请先复核，行号会随提交漂移。

## 0. 给实施者的必读

### 0.1 仓库规则

1. **只跑定向测试，不跑 gate，不跑全量。** 只测本次新增或改动的行为，不凑数量（见 `AGENTS.md`「门禁与测试精简」）。测试放 `app/tests/`，写法参照 `combat-report.test.js`（`node:test` + `node:assert/strict`）。
2. **Edit 工具写出的文件是 CRLF。** 每次改完用 `sed -i 's/\r$//'` 转回 LF，并核对字节数。heredoc 会吃反斜杠，`/tmp` 在本机 shell 里不通，写文件用 Write 工具。
3. **改了 `app/src` 必须 build**（`cd app && npm run build`），否则 `dist` 不更新。
4. **build 之后 `dist` 里的皮肤 webp 会被改写，要用 `git checkout` 还原。** 删 worktree 会清空 `node_modules`，需要 `npm install` 恢复。
5. **只做本地提交。** 要推送时，先拉云端的 PR 合并检查，再推内测版。代理断了用 `git -c http.proxy= push` 直连。
6. 改核心模块前先读该模块契约（本设计涉及 `app/src/combat/CONTRACT.md`），契约写法是「文件：职责 + 约束」，新增模块要补进去（见 §6.6）。

### 0.2 用户的长期规则

1. **骰子由脚本真随机，AI 不碰任何数字。** AI 只能写离散词（事件名、领域、难度档、代价类别），数值全部由脚本查表。
2. **提示词写少，不加反向规则对冲。** 只写「怎样开启」，不写「不要滥用」；节制放在脚本门禁里（§3）。
3. **界面文案用书面语。** 不用口语和祈使句；中文与英文、数字之间不加空格；界面写「剧情CG」「导入JSON」这类连写。
4. **界面配色用实色，不用半透明和 color-mix 混色。** 深色用近黑（`#121212` / `#1c1c1e` 档），不用棕色；不写内联 style 与写死数值，复用 class 与主题变量；按钮实色不描边。
5. **美术细腻、不卡通、元素不滥用。** 不要做成某款现成游戏的复刻：不照搬某游戏的牌框、术语、界面布局或特效。
6. **不得擅自收缩范围**：用户点名要的东西照做；拿不准的先去问卷（§9）。

### 0.3 前置依赖：哪些没完成前不能动哪些部分

| 前置 | 内容 | 没完成时不能做的部分 |
| --- | --- | --- |
| `docs/STATS_VISIBLE_WALLET_PLAN.md` | 金钱与积分合并为「金钱」；状态栏显示压力、体力、金钱 | 失败扣钱的结算、面板里显示金钱、状态栏上的变化反馈。第一阶段可先不接扣钱，只扣压力与体力 |
| `docs/STATS_NOVICE_UI_RELATIVE_NPC_PLAN.md` | 数值设置页新手版面、NPC 相对档 | 「关系裂痕」里按 NPC 相对档取值的部分；设置页里放日常挑战开关的位置 |
| 「战斗」设置页三选一（见 §5） | 战斗设置正由另一个窗口迁成独立侧栏 | 一切修改 `settings-*.js`、`settings-host*.js`、`fx-settings-fields.js` 的工作。**这些文件在迁移合回前不要碰** |

**可以立刻开工的部分：** 纯函数模块（新词表、卡组生成、结算映射、标签解析）与它们的测试，它们不依赖上面任何一项。

> 起草时未能在源码里找到「关闭 / 剧情演出 / 卡牌战斗」三选一的单一枚举。目前只能看到 `readerSettings.battleFx.enabled`（剧情演出，`core/bootstrap.js:1233`）与 `readerSettings.combatExpansion.enabled`（卡牌战斗，`visual/igs-ui/settings-host.js:512`）两个独立开关，三选一应是迁移后的新界面。实施者开工前先确认迁移后的字段路径，本文的设置字段名按现有路径写，以迁移后的为准。

---

## 1. 目标与总体思路

用户主要玩都市日常。日常里偶尔有一件事成败攸关：面试、厨艺比赛、吵架后和好、熬夜赶截稿、说服父母。现有「掷一次骰」太单薄，卡牌战斗又太像打架。本设计把卡牌引擎当作「过程」使用：玩家在若干回合内用自己擅长的手段一步步推进，决定这件事能不能做成。

按事情大小分三层：

| 层级 | 触发 | 机制 |
| --- | --- | --- |
| 小事 | 默认 | 不检定 |
| 普通事 | `[igs-fx:roll|…]` 等现有检定标签 | 掷一次骰（现有数值系统，不改） |
| 关键挑战 | 新标签 `[igs-challenge:…]` | 卡牌对决（本设计） |

**核心取舍：引擎不改，改「入口、说法、后果」。** 卡牌引擎本身是通用的回合制数值对决，与「打架」无关；战斗专属的是外围（开战标签、伤势账本、战利品、战报措辞、面板皮肤）。因此本设计的做法是：

- 引擎、卡牌模板、效果原语、种子与重放原样复用；
- 在引擎之外新增一层「挑战适配层」，负责把日常事件翻译成引擎能吃的 `setup`，再把引擎的结局翻译成数值系统能吃的结算；
- 说法（难关、意志、进展、稳住）只做显示层映射，内部字段名不变。

---

## 2. 复用清单

### 2.1 原样复用（不改）

| 模块 | 用途 | 证据 |
| --- | --- | --- |
| 回合制引擎 | `createBattle(setup, seed)`、`applyAction`、`legalActions`、`replayBattle`、`seedFor`；纯函数、种子可重放，满足「脚本真随机」 | `combat/engine.js:1347`、`:1488`、`:1527`、`:1572`；`:63`（`seedFor`） |
| 效果原语 | `damage / block / heal / draw / energy / status …` 24 个 op，12 种状态。日常卡只是给这些原语换名字 | `combat/schema.js:15-20` |
| 卡牌模板与数值求解 | 模板库固定效果形状，`solveCardTemplate(key, cost, rarity)` 按稀有度预算求数值；副 LLM 只选键 | `combat/card-templates.js:58`（`CARD_TEMPLATES`）、`:261`（`solveCardTemplate`）、`:468`（`templateCatalogText`） |
| 敌方技能模板 | `SKILL_TEMPLATES`（slash / heavy / combo / curse 等），难关的「出招」直接用它 | `combat/card-templates.js:173-180` |
| 敌人数值缩放 | `scaleEnemyStats(profile, level, difficulty, { gap })`，用「难度」档控制难关厚度 | `combat/rules.js:343` |
| 托管策略 | 玩家选择「交给托管」时，用现有 `chooseAllyPlay` | `combat/policy.js:64` |
| 种子与随机 | 重放用确定性哈希，禁用 `Math.random` | `combat/random.js`；契约「禁止」一节 |
| 结局事件 | 引擎的 `battle-end` 事件给出 `win / lose`，撤退给 `escape` | `combat/engine.js:374-378`；`combat/report.js:7`（`REPORT_RESULT`） |
| 会话编排 | `prepare → start → act → finish` 的流程骨架、断点续战、重试 | `combat/session.js`（`prepare` 在 `:802`；会话键 `:30`） |
| 副 LLM 组装与校验 | `assembleEnemy` 等只收模板键与少量数值，schema 只拒收不修正 | `combat/generation-assembly.js:384`；`combat/generation.js` |
| 数值侧技能匹配 | `matchSkill` 把「做饭 / 说服」这类词匹配到技能，`detectDifficulty` 给难度词 | `scene/stats/stat-skill-match.js:100-120` 附近（`matchSkill`、`detectDifficulty`） |
| 数值侧结算框架 | `settleCombat` 对一楼的指令逐个结算，`shiftBar` 改体力 / 金钱，`markSkill` 标记技能成长 | `scene/stats/stat-battle.js:140-162`、`:77-85` |
| 生活条与档位表 | `STAMINA_DELTA`、`STRESS_DELTA`、金钱档位表 | `scene/stats/stat-bars.js:7-8`、`:16`（`walletBalance`）、`:27`（`applyBarDirective`） |
| 好感写入 | `applyDim` 为好感加减并带每楼上限 | `scene/stats/stat-favor.js:49` |
| 每日重置 | 跨天、软跨天时清零每日上限，是「一天几次」计数的天然挂点 | `scene/stats/stat-day.js:80`（`settleDay`）、`:117`（`settleSoftDay`）；`scene/stats/stat-favor-events.js:41`（`resetDaily`） |
| 标签扫描基础设施 | 「只认正文最后一行」的位置规则、诊断码、全角转半角 | `scene/combat-directives.js:297-323`（`START_OR_AWAKEN_RE`、`combat-start-not-tail`）、`:101-117`（工具函数） |
| 面板皮肤机制 | 皮肤注册表与画布皮肤，日常皮肤沿用 | `visual/igs-ui/combat-skin-registry.js`、`combat-skin-canvas.js`、`combat-settings.js:8-10` |

### 2.2 需要参数化（改动小，加参数而非复制）

| 模块 | 要参数化什么 | 说明与证据 |
| --- | --- | --- |
| 显示词表 | 把「敌人 / 生命 / 伤害 / 格挡 / 战斗」换成「难关 / 意志 / 进展 / 稳住 / 挑战」 | 面板文案在 `visual/igs-ui/combat-panel-render.js`、`combat-panel-model.js`；做一张 `labels` 表，由「模式」选择，**只改显示，不改内部字段名**（内部仍是 `hp`、`damage`、`block`）。状态也要换名：`weak`→慌乱、`vulnerable`→破绽、`poison`→煎熬，定义在 `combat/schema.js:20` |
| 战报措辞 | `buildCombatReport` 目前输出「伤势、击倒、EXP」等战斗措辞 | `combat/report.js:209`。不改它，新写 `buildChallengeReport`（见 2.3），因为日常战报要写的是「处境与结局」，两者差别大于参数能表达的范围 |
| 开战入口 | `scanCombatTags` 的标签名固定为 `igs-combat` | `scene/combat-directives.js:48`。**不扩展它**，另起 `igs-challenge`（理由见 4.1），但复用同文件里的位置规则与诊断思路 |
| 面板皮肤 | 日常皮肤 | 在 `combat-skin-registry.js` 注册一个新键，不改既有九套，并行落盘规则见该文件首行注释（只改自己的 `combat-skin-<键>.js`） |
| 数值结算 | `settleCombat` 目前只认 `battle` 与 `work` 两种指令 | `scene/stats/stat-battle.js:156-162`；增加 `challenge` 指令，写法对齐 `applyBattle` |
| 战斗接管开关 | 卡牌战斗开启时，数值侧丢弃 `battle` 标签 | `scene/stats/stat-settle.js:207`（`noBattle`）。`challenge` 指令**不受此开关影响**，否则卡牌战斗一开日常挑战就无法结算 |

### 2.3 必须新写

| 新模块（建议路径） | 职责 |
| --- | --- |
| `app/src/combat/challenge-labels.js` | 说法映射表（战斗词 → 日常词），含状态名、技能模板名的日常别名。纯常量，供面板、战报共用 |
| `app/src/combat/challenge-cards.js` | 日常卡牌库：把「领域技能 + 技能值」翻译成一组引擎能吃的卡（见 3.2 与 §4） |
| `app/src/combat/challenge-foes.js` | 难关模板：面试官的追问、评委的挑剔、对方的沉默、截稿时限、父母的顾虑等。只登记「模板键 + 日常名称 + 出招模板键」 |
| `app/src/combat/challenge-setup.js` | 纯函数 `buildChallengeSetup(...)`：把标签、技能、生活条翻译成引擎 `setup`（意志、卡组、难关） |
| `app/src/combat/challenge-report.js` | 纯函数 `buildChallengeReport(...)`：战报写成日常措辞，并附脚本生成的结局标记 |
| `app/src/scene/challenge-directives.js` | 解析 `[igs-challenge:…]`（语法见 §6.2），含诊断码与每日上限门禁 |
| `app/src/scene/stats/stat-challenge.js` | 数值结算：结局 → 压力 / 体力 / 金钱 / 好感 / 技能成长（映射表见 3.4） |
| 面板日常皮肤 | `combat-skin-daily.js` 与 `combat-skin-daily-concept-style.js`，沿用画布皮肤机制 |

### 2.4 战斗专属、日常挑战不用的部分

下面这些在日常挑战里**不启用**，不要为了复用而硬接：

- **伤势账本**（`wound` / `hurt` / `heal` 类型，`combat/ledger.js:41`、`:53`、`:274`）：日常挑战每次从满意志开始，不写持续伤势，失败的代价走 3.4 的生活条，不进战斗账本。
- **战利品、翻牌、卖出**（`combat/flip.js`、`combat/rewards.js:114` 的 `planRewardSlots`、`combat/points.js`）：日常挑战第一阶段没有卡牌奖励。胜利的收获是生活条与技能成长。
- **职业、转职、特性、装备、背包**：不参与。
- **敌人图集与题材**（`enemy-art.js`、`encounter-theme`）：难关不用立绘，面板用文字与图形符号。
- **觉醒、鞭尸、全队覆灭**：这些 `setup` 开关保持关闭（`wipe` 等字段缺省即旧规则）。
- **对 `igs-combat` 成长标签的依赖**（`exp / learn / upgrade / equip / rel …`）：日常挑战不产出这些。

---

## 3. 数据流

### 3.1 总览

```
AI 写正文（楼 N，末尾一行）
   [igs-challenge:事件名|领域|难度|代价]                       ← 唯一由 AI 产出的东西，全是离散词
        │
        ▼
scene/challenge-directives.js  解析 + 门禁（本日上限、冷却、领域/难度/代价必须在白名单）
        │  通过                       │  被拒：记诊断，不开局，正文照常显示
        ▼
面板出现「挑战」入口（与战斗开战入口同一位置，进入前玩家可选择放弃，见 §7）
        │
        ▼  玩家点开始
challenge-setup.js  ← 读数值系统：领域技能值、体力、压力、难度档
   ├─ 主角方：意志（由体力、压力推出）、卡组（由技能值推出）
   └─ 难关方：从 challenge-foes 取模板，scaleEnemyStats 按难度缩放
        │
        ▼
combat/engine.js（原样）  createBattle(setup, seed) → 玩家逐张出牌 / 托管
        │  battle-end: win | lose | escape
        ▼
challenge-report.js  生成战报文本（含 reportId 与脚本生成的结局标记）
        │  由 session.finish 写入下一楼用户楼（同战斗战报的做法）
        ▼
数值侧读到该楼的战报标记 → 合成 `challenge` 指令（脚本生成，不是 AI 写的）
        ▼
stat-challenge.js  按结局与代价类别，查表扣加压力 / 体力 / 金钱 / 好感，标记技能成长
        ▼
AI 下一楼续写：它读到的是战报文本（处境与结局），据此写剧情
```

**两个设计要点：**

1. **AI 不碰数字。** 标签里只有词；意志、卡牌强度、难关厚度、各项增减量全部由脚本查表。AI 在下一楼看到的战报只含「进展顺利 / 勉强过关 / 功亏一篑」这类结局词与「压力上升」这类相对描述，不含数值（与 `report.js` 现有「只写技能名与相对伤势」的口径一致）。
2. **结算由战报楼驱动，不由 AI 标签驱动。** 这样刷新、重新生成、回退楼层时结果一致：战报楼被删，结算随楼层回退自然消失（数值系统本来就是逐楼存档，见 `scene/stats/stat-persist.js:13-16` 的存档键与版本）。结算按 `reportId` 去重，同一战报不会结算两次。

### 3.2 与数值系统的接口：技能如何变成卡组与卡牌强度

数值侧每个技能有一个值（百分制下 0–100 左右）与 `rank`（见 `scene/stats/stat-skill-match.js` 里 `profile.rank` 的用法）。接口是一个纯函数：

```
buildChallengeDeck({ domain, skillValue, otherSkills }) → 20 张牌的 cardId 列表 + 卡牌目录
```

规则（**全部用现有模板与现有稀有度预算，不发明新效果**）：

1. **固定骨架（保证引擎的 20 张规则成立，`COMBAT_RULES.deckMin` 为 20，`combat/rules.js:24`）：**
   - 3 张基础「进展」牌（对应基础攻击，日常名「尽力」）。
   - 3 张基础「稳住」牌（对应基础防御，日常名「镇定」）。
2. **领域牌 10 张：** 由「领域」决定用哪几个模板键，由技能值决定稀有度档：

   | 技能值 | 稀有度档（沿用现有 `RARITIES`，`combat/schema.js:29`） | 效果 |
   | --- | --- | --- |
   | 0–29 | common | 只有基础形状的牌 |
   | 30–59 | uncommon | 开始带抽牌、复合效果 |
   | 60–79 | rare | 出现「拿手」牌：高进展或进展加稳住 |
   | 80 以上 | epic | 出现一张独门牌，每局最多一张 |

   「拿手菜」「据理力争」这类名字是**模板键的日常别名**，登记在 `challenge-labels.js`，效果仍由 `solveCardTemplate(key, cost, rarity)` 求出。厨艺越高，同一个模板键求出的数值越大、复合模板越多，这就是「技能决定抽到哪些卡」。
3. **生活牌 4 张：** 取自一个与领域无关的通用池（「深呼吸」「喝口水」「回忆练习」等），所有人都有，保证低技能的人也有出路。
4. **相关技能加成：** 领域之外的相关技能可以顶替 1–2 张领域牌（例如「做饭」比赛里「应变」高的人多一张应急牌）。这条放到第二阶段，第一阶段不做。
5. **同名上限、稀有度上限直接走 `validateDeck`（`combat/rules.js:297`）与 `cardCopyLimit`**，不另写校验。

**领域 → 模板键的映射表**放在 `challenge-cards.js`，例如（示意，实施时由设计者与用户确认名字）：

- 烹饪：拿手菜（重击形）、火候（稳住形）、摆盘（复合：进展加稳住）。
- 话术：据理力争（单体进展）、以退为进（稳住加抽牌）、一针见血（易伤形，日常名「抓住破绽」）。
- 学习 / 写作：灵感闪现（抽牌）、一气呵成（多段进展）、校对（稳住）。
- 应变、魅力、照顾等：各一套。

领域名**必须**取自数值系统的技能清单（`DEFAULT_SKILL_LIST`，`scene/stats/stat-skill-match.js` 末段附近），保证「技能值」可查；标签里领域留空或不在清单内时，用 `matchSkill(事件名)` 兜底匹配，仍匹配不到则取该主角最高的特有技能（对齐 `applyWork` 的兜底做法，`scene/stats/stat-battle.js:126-130`）。

### 3.3 意志、难关厚度、回合数

- **意志（主角生命）：** 基础值固定，再按体力与压力折算。体力低或压力高的人起手意志低。折算用阶梯而非连续公式，便于测试与用户理解（建议：体力低于 `STAMINA_LOW`、压力高于 `STRESS_HIGH` 各让意志降一档；这两个阈值已在 `scene/stats/stat-bars.js:57-58` 使用）。**不**读战斗侧伤势（`readVitals`，`core/combat-services.js:436`），每局满意志起步。
- **难关（敌人生命）：** 由难度档查表：轻松 / 普通 / 艰难 对应引擎的 `normal / elite / boss`（与 `COMBAT_TIERS` 同一套，`scene/combat-directives.js:40`），再经 `scaleEnemyStats`（`combat/rules.js:343`）缩放。
- **回合数：** 由难关厚度与卡组平均进展量共同决定。目标是一局平均 4–6 回合（问卷题 3）。第一阶段用现有 `scripts/combat-balance.mjs` 的托管模拟做一次校准，把「难关厚度」调到托管模拟平均 5 回合左右，再让真人玩调。
- **难关的「出招」：** 全部用 `SKILL_TEMPLATES`（`combat/card-templates.js:173`）：施压（slash / heavy，扣意志）、刁难（curse，慌乱）、拖延（防御型，难关自己稳住）。日常名由 `challenge-labels.js` 提供。

### 3.4 结果写回：压力、体力、金钱、好感

结局来源是引擎的 `battle-end`（`combat/engine.js:374-378`）加「剩余意志比例」。映射为四档，**全部是脚本查表**：

| 结局 | 判定 | 说明 |
| --- | --- | --- |
| 圆满 | `win`，且剩余意志不低于六成 | 无代价，有收获 |
| 勉强 | `win`，剩余意志不足六成 | 小代价，小收获 |
| 失败 | `lose` | 付出标签里声明的代价 |
| 放弃 | `escape`（玩家主动放弃） | 代价减半，无收获（见 §7） |

**代价类别**由标签里的第四项给出（压力 / 体力 / 金钱 / 关系，默认压力），**数量**由难度档查表：

| 类别 | 轻松 | 普通 | 艰难 | 落点 |
| --- | --- | --- | --- | --- |
| 压力 | 上升 1 次 | 上升 2 次 | 上升 3 次 | `STRESS_DELTA.上升` 的倍数（`stat-bars.js:8`），`shiftBar` 钳在 0–100 |
| 体力 | 中 | 重 | 重加熬夜 | `STAMINA_DELTA`（`stat-bars.js:7`）：中 −15、重 −30、熬夜 −20 |
| 金钱 | 少量 | 普通 | 昂贵 | 金钱档位表（`DEFAULT_MONEY_TABLE`，见钱包计划）；扣在 `bars.money`，允许为负 |
| 关系 | 好感 −1 | 好感 −2 | 好感 −3 | `applyDim(character, '好感', −n)`（`stat-favor.js:49`），对象取标签里的「对方」或在场被点名者 |

**胜利的收获：** 勉强与圆满都给「压力下降」一次（`STRESS_DELTA.下降` −10），圆满再按难度给一次小额收入（对应 `applyBarDirective` 的收入档，`stat-bars.js:27`，仅当事件本身带钱，如比赛奖金；是否带钱由问卷题决定）。两种胜利都 `markSkill(领域技能)`，让技能在跨天时有机会成长（成长逻辑在 `stat-day.js` 的 `grow`，`settleSkip` 内，`:95-110`）。

**金钱与钱包合并（`STATS_VISIBLE_WALLET_PLAN.md`）：**

- 金钱扣减一律记在数值侧 `bars.money`，这与钱包计划第二节第 3 点一致（扣款记在 `bars.money`，可为负）。
- 判断「付得起 / 付不起」用合并余额，也就是 `walletBalance(bars, walletExtra)`（`stat-bars.js:16`），`walletExtra` 由 `core/stats-runtime.js:603`、`:655` 传入，**不要**在新代码里直接读全局或读战斗账本。
- 失败扣钱的上限：不超过合并余额的两成（沿用 `DEFEAT_MONEY_LOSS`，`stat-battle.js:19`），避免一次挑战把人扣到负数。
- 日常挑战**不**往战斗账本写积分条目，所以不触碰 `combat/ledger.js:591-595` 的积分不足拒收。
- 钱包计划未完成时：第一阶段**不接金钱代价**，题目里选金钱类别的标签降级为压力（并在诊断里记一条），等钱包计划落地后再放开（§8）。

### 3.5 写回剧情

战报文本由 `buildChallengeReport` 生成，以用户楼形式插入，措辞示例：

> （挑战：公司终面。结果：勉强通过。过程中几次被追问到词穷，最后靠平时的积累稳住了局面。压力有所上升。）

要求：

- 带 `reportId`（用 `reportIdFor(combatId)`，`combat/report.js:26`，格式 `r` + 小写字母数字），便于去重与定位。
- 只含结局词与相对描述，不含数值。
- 不列牌名清单；`REPORT_DETAIL` 的 `brief / normal`（`report.js:9`）直接沿用，`brief` 只写结局，`normal` 加两三句过程（过程句由出过的牌类型与难关的出招类型挑模板拼，不由 AI 写）。
- 玩家选择「不使用卡牌结算」时，沿用 `COMBAT_SKIP_TEXT` 的做法（`report.js:248`）写一句让 AI 自己决定结果的话，**此时不做数值结算**，与战斗跳过一致，也是问卷题 4 的兜底。

---

## 4. 玩家视角：一局完整流程

### 4.1 为什么另起一个标签

`igs-combat:start` 带有敌人列表、友军、阶级，并且触发敌人档案生成、成长、背包等一整套战斗专属流程（`scene/combat-directives.js:148`）。若给它加一个「日常」参数，每个战斗分支都要判断模式，侵入大、容易漏。另起 `igs-challenge` 标签，语法更短、更不容易写错（符合「提示词写少」），解析与结算也各自独立，卡牌战斗关闭、只开日常挑战时，战斗那一大段语法不进提示词。

### 4.2 流程

1. **剧情走到关键时刻。** 正文写到主角坐在面试官对面。AI 在这一楼的最后一行写：
   `[igs-challenge:终面|话术|普通|压力]`
   正文本身不写结果，停在悬念上（与开战标签「只认末尾一行」的规则相同）。
2. **玩家看到什么。** 这一楼底部出现「迎接挑战：终面」入口，样式与战斗开战入口同类（同位置、同一个面板容器 `combat-panel.js`，换日常皮肤）。入口旁有两个次要选项：「放弃」与「交给托管」。玩家可以什么都不点，继续往下翻页，这相当于选择让 AI 自己写结果（见 §7）。
3. **进入对决。** 点击后面板展开，顶部是难关名称与「进展」条，底部是主角的「意志」条、手牌、能量。没有立绘、没有伤害数字飞溅。
4. **怎么出牌。** 每回合有 3 点精力（沿用 `energyPerTurn`，`combat/rules.js:21`），从牌库抽 5 张，点牌出牌，结束回合。难关随后「出招」（施压、刁难、拖延），玩家在面板上看到下回合的意图（意图预告沿用 `battle-state.js` 的意图描述）。
5. **几个回合。** 目标 4–6 回合。到回合数上限仍未分胜负，按「进展比例」判胜负（避免拖死局，问卷题 3）。
6. **结束。** 难关进展满则胜；意志归零则败；中途点「放弃」则为放弃。面板给出一句结局文字，随后战报楼写入聊天，AI 收到战报后续写。
7. **数值怎么变。** 状态栏开启时，压力、体力、金钱、好感的变化走现有的状态栏反馈（钱包计划第一节），不新建组件。状态栏关闭时，数值只在提示词与二级页里变化，面板结束页给一句「压力略有上升」这样的相对描述即可。

### 4.3 例一：面试

> 铺垫：主角为转行投了简历，进入终面。

- 标签：`[igs-challenge:终面|话术|普通|压力]`
- 领域「话术」，主角话术 62，落在 rare 档：卡组里有「据理力争」「以退为进」，以及一张「抓住破绽」。
- 难关：面试官的追问（普通，对应 elite 缩放）。出招：「追问细节」（扣意志）、「沉默施压」（使人慌乱）、「抛出陷阱题」（重击）。
- 过程：第一回合抽到「以退为进」稳住，打出「据理力争」推进；第三回合被「陷阱题」打掉一大截意志；第五回合用「抓住破绽」收尾。
- 结局：勉强。压力上升 0 次（勉强不扣），压力下降一次；话术标记成长。战报：「面试结果：勉强通过。后半程被连续追问，靠准备充分撑到了最后。」AI 接着写入职通知。

若失败：代价为压力，普通档上升 2 次（约 +20）。AI 收到「面试未通过」的战报，写剧情时自然带出沮丧。

### 4.4 例二：吵架后和好

> 铺垫：与恋人冷战三天，主角决定上门道歉。

- 标签：`[igs-challenge:冷战后的和解|魅力|艰难|关系]`（对方为恋人，由在场人物决定，见 §6.2 的「对方」字段说明）。
- 领域「魅力」，主角 45，uncommon 档。
- 难关：「余怒未消」。出招：「冷处理」（难关给自己稳住）、「翻旧账」（扣意志并使慌乱）。
- 过程：卡组里有「真诚道歉」（稳住加抽牌）、「回忆旧事」（多段进展）。玩家先稳住防御，再用回忆打进展。
- 结局：失败。代价类别是关系，艰难档好感 −3，并触发好感阶段门槛的现有保护（好感门槛只升不降的规则以 `stat-favor.js` 为准，实施时核实）。战报：「和解没有成功，对方沉默着关上了门。两人之间多了一道裂痕。」
- 若胜利：圆满时压力下降，AI 写出和好，好感加成沿用 `applyKeyEvent` 的关键事件机制（`scene/stats/stat-favor-events.js:21`），而不是直接加数字，避免好感膨胀（用户规则：防好感膨胀）。

---

## 5. 与「战斗」设置页的关系

### 5.1 现状

目前能看到的开关：`readerSettings.battleFx.enabled`（剧情演出，只是视觉演出，`core/bootstrap.js:1233`）、`readerSettings.combatExpansion.enabled`（卡牌战斗，`visual/igs-ui/settings-host.js:512`）。卡牌战斗开启时，数值系统被强制开启且不能单独关（`settings-host.js:512-526`），并且数值侧丢弃 `battle` 标签（`scene/stats/stat-settle.js:207`）。归一化在 `visual/igs-ui/combat-settings.js:14-21`（目前字段只有 `enabled / difficulty / reportDetail / skin`）。

### 5.2 三个方案

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. 第四个选项 | 三选一变四选一：关闭 / 剧情演出 / 卡牌战斗 / 日常挑战 | 界面直观 | 日常玩家想要「日常挑战 + 偶尔真打一场」时无法并存；而日常挑战和战斗共用整套存储、副 LLM、会话，拆成并列选项会让「谁启用哪套表」变复杂 |
| B. 卡牌战斗下的子模式 | 开卡牌战斗后，再选「对决类型：战斗 / 日常挑战 / 两者」 | 共用前置检查（数据库表、副 LLM）；不需要重复检查；一目了然 | 要进卡牌战斗才能找到日常挑战，对只玩日常的用户多一层 |
| C. 完全并存、独立开关 | 日常挑战独立一个总开关，与卡牌战斗互不影响 | 灵活 | 两个开关共用同一后端，容易出现「战斗关着、日常开着，但后端检查要求战斗开着」这类状态矛盾 |

### 5.3 推荐：方案 B，并让「仅日常挑战」成为一键预设

理由：

1. 日常挑战依赖的基础设施（数据库表、副 LLM 独立 API、会话与断点续战、数值系统强制开启）与卡牌战斗完全相同，开启前检查只需要一份（`checkCombatExpansionReady`，`combat-settings.js:35-41`）。
2. 并存需求真实存在：都市日常也会有街头冲突、突发事件，用户可能想两种都开。
3. 对只玩日常的用户，在「对决类型」里选「仅日常挑战」后，**提示词里不注入战斗标签语法**（`scene/combat-prompt.js` 的 `COMBAT_GRAMMAR_INDEX` 等），也不显示战斗背包、转职、翻牌等入口，体验上就是一个独立玩法。
4. 不增加三选一的互斥关系，不影响迁移中的设置页重构。

设置项（建议字段，路径以迁移后的为准）：

- `readerSettings.combatExpansion.kind`：`'combat' | 'daily' | 'both'`，缺省 `'combat'`（旧存档行为不变）。
- `readerSettings.combatExpansion.daily.perDay`：每个游戏日上限，缺省 1。
- `readerSettings.combatExpansion.daily.cooldownFloors`：两次挑战之间至少间隔多少楼，缺省 8。
- `readerSettings.combatExpansion.daily.stake`：代价轻重，`'light' | 'normal' | 'heavy'`，缺省 `'normal'`。
- `readerSettings.combatExpansion.daily.allowEscape`：是否允许放弃，缺省 `true`。
- 皮肤沿用 `combatExpansion.skin`，新增 `'daily'` 取值（日常皮肤，选了「仅日常挑战」时默认用它）。

---

## 6. 落盘方案

按阶段给出：改哪些文件、新增哪些函数与存储、测试、验收。**所有新文件放在已有目录下，不新增顶层目录。** 校验写法对齐现有契约：schema 只拒收不修正，版本字段不就地升级，随机来自种子。

### 6.1 存储总表

| 存什么 | 放哪里 | 形状与规则 |
| --- | --- | --- |
| 本局对决（断点续战） | 沿用 `igs-combat:session:<chatId>` | 现有会话（`combat/session.js:30`）只存 `{ combatId, anchor, seed, setup, actions }`；日常局在 `setup` 里带 `challenge: { event, domain, tier, stake, foe }`，`combatId` 的前缀改为 `ch`，避免与战斗局相撞（`combatIdFor` 在 `session.js:38`） |
| 战报 | 聊天楼文本 | 带 `reportId`，与战斗战报同一套去重与定位 |
| 每日挑战计数 | 数值存档 `clock` 内 | 新增可选字段 `clock.challenges`（整数，缺省 0）与 `clock.lastChallengeFloor`（楼号或 null）。数值存档本来逐楼，回退楼层自然回退。`settleDay` 与 `settleSoftDay` 里清零 `challenges`（`stat-day.js:80`、`:117`）。**存档版本**：`STATS_SAVE_VERSION` 为 2（`stat-persist.js:16`），新增字段全部是可选并带缺省，读旧档补默认值，不升版本号；实施者先确认 `deserializeLedger`（`stat-persist.js:137`）对未知字段的处理是保留而非拒收，若拒收则需要显式处理 |
| 战败累计 / 关系裂痕 | 好感维度现有字段 | 不新增存储，直接 `applyDim` |
| 设置 | `readerSettings.combatExpansion.*` | 见 5.3；归一化函数 `normalizeCombatExpansionSettings`（`combat-settings.js:14`）补字段并保证缺省值使旧存档行为不变 |
| 技能成长 | 数值存档现有 `skill.marked` | `markSkill`（`stat-battle.js:77-85`） |

**不新增战斗账本条目类型。** 战斗账本的日志类型有锚点、哈希与回放规则（`combat/ledger.js`，契约「成长日志除 profile 与 revoke 外必须带锚点」），日常挑战的结果完全由「战报楼 + 数值存档」承载，不进账本，这样不会触碰账本的 `FLOOR_ONLY_TYPES`、归并、积分预检等复杂逻辑。若第三阶段确需记录（例如挑战历史页），再评估新增类型 `challenge`，并按契约要求带 `v`、锚点、`ledgerEntryId`。

### 6.2 新标签语法

```
[igs-challenge:事件名|领域|难度|代价|对方]
```

| 字段 | 必填 | 取值 | 校验 |
| --- | --- | --- | --- |
| 事件名 | 是 | 1–20 字 | `NAME_MAX` 20（`scene/combat-directives.js`） |
| 领域 | 否 | 数值系统技能清单中的技能名；留空则脚本匹配 | 不在清单内报 `challenge-domain-unknown`，降级为脚本匹配，不拒收整条标签 |
| 难度 | 否 | 轻松 / 普通 / 艰难，缺省普通 | 未知词拒收：`challenge-tier-unknown` |
| 代价 | 否 | 压力 / 体力 / 金钱 / 关系，缺省压力 | 未知词拒收；金钱在钱包计划完成前降级为压力 |
| 对方 | 否 | 在场人物名（仅代价为关系时有意义，也用来给难关命名） | 1–20 字；不在场人物名时忽略 |

位置规则：与开战标签一致，**只认正文最后一行的最后一个标签**，其余记 `challenge-not-tail` 诊断（对应 `combat-start-not-tail`，`scene/combat-directives.js:297-323`）。字段超过 5 个报 `too-many-fields`（对应 `:149`）。全角数字、全角分隔符的容错沿用现有工具函数。

提示词只加一行规则，不写反向约束（用户规则）。建议文案（书面语）：

> `[igs-challenge:事件名|领域|难度|代价|对方]`：剧情走到一件成败攸关、值得认真对待的事时，在该楼末尾写一次，随后停笔，不写结果。

**每日上限用脚本门禁，不写进提示词：** 本日额度用完或冷却中，则本楼提示词里不出现这一行（语法行被条件性省略），解析时遇到标签记 `challenge-quota` 诊断并忽略。这也是「触发节制」的主要手段（§8 第 1 条）。

### 6.3 第一阶段：最小可玩版本

目标：关闭一切战斗专属外围，只用「压力 / 体力」两种代价，用现有面板加一个日常文案映射，跑通一局。

**新建文件（均在 `app/src` 下）：**

- `combat/challenge-labels.js`：`CHALLENGE_LABELS`（战斗词→日常词）、`challengeStatusName(status)`、`challengeSkillName(templateKey)`。
- `combat/challenge-cards.js`：`DOMAIN_CARD_KEYS`（领域→模板键数组）、`buildChallengeDeck({ domain, skillValue })`。第一阶段只实现「骨架 + 领域牌 + 生活牌」，不做相关技能顶替。
- `combat/challenge-foes.js`：`CHALLENGE_FOES`（难关模板，第一阶段 6 个：面试官、评委、对方、截稿、长辈、考官）、`pickFoe(event, domain)`。
- `combat/challenge-setup.js`：`buildChallengeSetup({ start, state, user, seed })` → 引擎 `setup`；`willFor(bars)` → 意志；`foeThickness(tier)`。
- `combat/challenge-report.js`：`buildChallengeReport({ combatId, event, outcome, will, detail })` → `{ ok, text, result, reportId }`；`challengeOutcomeOf(result, willRatio)` → 圆满 / 勉强 / 失败 / 放弃。
- `scene/challenge-directives.js`：`parseChallengeStart(text)` → `{ start, diagnostics }`；`challengeQuota(state, settings)` → `{ ok, reason }`。
- `scene/stats/stat-challenge.js`：`applyChallenge(state, directive, ctx)`（对齐 `applyBattle` 的签名，`stat-battle.js:114` 一带）；`settleChallenge`。

**修改文件：**

- `scene/stats/stat-battle.js`：`settleCombat` 增加 `challenge` 指令的分支（紧接 `battle` 与 `work`），保持「一楼最多一场」。
- `scene/stats/stat-settle.js:207`：`noBattle` 过滤不得丢弃 `challenge`（只丢 `battle`，现状已是只过滤 `battle`，所以通常无需改，但要加测试保护）。
- `scene/stats/stat-day.js`：`settleDay` 与 `settleSoftDay` 清零 `clock.challenges`；`stat-state.js` 的时钟初值补两个字段（`:23` 附近的 `STATS_VERSION` 同文件）。
- `core/combat-services.js`：在会话创建处增加「日常模式」分支，调用 `buildChallengeSetup` 取代 `enemyUnits` 的档案生成路径；准备阶段**不调用副 LLM**（第一阶段难关模板全部本地登记，见下）。
- `combat/session.js`：`prepare` 在 `setup.challenge` 存在时跳过档案生成（`:802` 起），`finish` 调用 `buildChallengeReport`，跳过翻牌与奖励。
- `visual/igs-ui/combat-panel-render.js`、`combat-panel-model.js`：读 `setup.challenge`，若存在则用 `CHALLENGE_LABELS` 渲染文案；不改引擎事件。
- `visual/igs-ui/combat-settings.js:14`：`normalizeCombatExpansionSettings` 补 5.3 的字段（**等设置页迁移合回后再做**；在此之前用代码里的缺省值，设置用 devtools 或存档手工写入测试）。
- `scene/combat-prompt.js`：新增日常语法行与门禁条件，不进战斗语法块。
- `combat/CONTRACT.md`：见 6.6。

**第一阶段有意不做：** 副 LLM 生成难关（难关全部本地模板）、金钱代价与关系代价、NPC 协助、相关技能顶替、日常皮肤（先用现有一套皮肤加文案映射）、挑战历史页。

### 6.4 第二阶段

- 日常皮肤 `combat-skin-daily.js`（按审美画像：细腻、实色、不卡通、元素少），注册到 `combat-skin-registry.js`。
- 金钱代价（依赖钱包计划完成）与关系代价（依赖新手版面与 NPC 相对档计划）。
- 副 LLM 选难关模板：`generation.js` 新增实体 `challenge-foe`，输入事件名与领域，回模板键与名称，走 `assembleEnemy` 一类的组装与「只拒收不修正」校验（`generation-assembly.js:384`）。
- 相关技能顶替领域牌。
- 设置页开关与五个字段（等迁移合回）。

### 6.5 第三阶段

- NPC 协助出牌（对应战斗里的友军，`COMBAT_TAG_LIMITS.maxAllies` 为 3，`scene/combat-directives.js:10`，日常限 1 个，且必须是好感达标的人物）。
- 挑战历史页、挑战成就（沿用 `feats.js` 的只读推导思路）。
- 胜利奖励（一张可选的「经验卡」，走现有 `planRewardSlots` 的简化版）。
- 若需要持久化挑战记录，再评估账本新类型。

### 6.6 测试清单（只跑定向，不跑 gate）

放 `app/tests/`，文件名前缀 `daily-challenge-`。不写「锁定源码字面量」的测试，每条都对应一个要保护的行为。

**第一阶段：**

1. `daily-challenge-directives.test.js`：
   - 末行唯一标签被解析；非末行记 `challenge-not-tail`；
   - 未知难度 / 代价拒收，字段超 5 个拒收，超长事件名拒收；
   - 领域不在清单降级而非拒收；
   - 额度用完时 `challengeQuota` 返回不通过；
   - 与 `[igs-combat:start]` 同楼出现时互不干扰。
2. `daily-challenge-deck.test.js`：
   - 同一技能值在不同领域都产出恰好 20 张牌并通过 `validateDeck`；
   - 技能值越高，同一模板键求出的数值不降（单调）；
   - 低技能也有至少 4 张可用生活牌；
   - 不出现 `mythic / signature` 以外的越界稀有度。
3. `daily-challenge-setup.test.js`：
   - 同一输入与种子，`buildChallengeSetup` 结果完全相同（重放一致）；
   - 体力低或压力高时意志降档；
   - `setup` 被引擎接受（`createBattle` 不返回 `invalid-setup`），托管跑完能得出 `win / lose`；
   - 难度越高难关越厚（单调）。
4. `daily-challenge-settle.test.js`（数值结算）：
   - 四档结局到压力 / 体力的增减量符合 3.4 的表；
   - 同一 `reportId` 重复出现只结算一次；
   - 回退楼层后结算被撤销（用现有逐楼回放测试方法）；
   - 卡牌战斗开启（`noBattle` 为真）时 `challenge` 指令仍被结算；
   - 放弃的代价为半数；
   - 压力、体力钳在 0–100，不出现 NaN。
5. `daily-challenge-quota.test.js`：每天上限、冷却楼数、跨天与软跨天清零。
6. `daily-challenge-report.test.js`：战报只含结局词与相对描述（用正则断言不含数字）；带合法 `reportId`；跳过文案不触发结算。

**第二阶段补：** 金钱扣减按合并余额、不超过两成上限；关系代价走 `applyDim` 并受每楼上限；副 LLM 回复非法模板键时拒收并重试；皮肤注册后 `normalizeCombatExpansionSettings` 接受新值，旧存档缺省行为不变。

**第三阶段补：** NPC 协助必须好感达标；协助者不在场时拒收。

### 6.7 验收标准

**第一阶段验收：**

1. 在测试聊天里手动构造一条带 `[igs-challenge:终面|话术|普通|压力]` 的末行，面板出现入口；点开始进入对决，能逐张出牌并结束，托管能自动打完。
2. 结束后聊天里多一楼战报，措辞为日常口吻，无数字；压力或体力按表变化；回退该楼，数值回到变化前。
3. 同一天再标一次，被门禁忽略，提示词里不再出现标签语法行。
4. 卡牌战斗开启时，旧战斗流程（开战、战报、翻牌、伤势）行为不变，既有 `combat-*.test.js` 仍通过（只跑受影响文件，不跑全量）。
5. 用户亲自在酒馆里玩一局，确认「不像打架」。这一条需要用户验收，本设计不能替代真机。

**第二阶段验收：** 日常皮肤在设置里可选，截图自看（审美规则：细腻、实色）；金钱代价与钱包余额一致；设置页开关与字段读写正确，旧存档缺省行为不变。

**第三阶段验收：** NPC 协助出牌流程可用；历史页能回看。

### 6.8 `CONTRACT.md` 需要同步的内容

在 `app/src/combat/CONTRACT.md` 的「文件」一节新增六条，写法与既有条目一致（文件：职责 + 约束）：

- `challenge-labels.js`：说法映射表，只读常量，不含逻辑。
- `challenge-cards.js`：领域到模板键映射与 `buildChallengeDeck`，只用既有模板与稀有度窗口，结果必须通过 `validateDeck`。
- `challenge-foes.js`：难关模板登记，只登记模板键与日常名称。
- `challenge-setup.js`：`buildChallengeSetup`，纯函数，不读写存储；setup 带 `challenge` 字段；`combatId` 前缀 `ch`。
- `challenge-report.js`：`buildChallengeReport`，只写结局词与相对描述，不含数值；复用 `reportIdFor`。
- 「依赖方向」一节补一句：`challenge-*` 只依赖 combat 内部与数值侧传入的参数，不导入 visual、host、core；数值结算放在 `scene/stats/stat-challenge.js`，由数值侧自己读战报，combat 不读数值存档。

「约束」一节补：日常局不写伤势、不写战斗账本；`setup.challenge` 存在时 `session.prepare` 不调用档案生成。若 `combat-services.js` 或 `session.js` 增加了分支，也在其条目里补一句。另外 `docs/COMBAT_EXPANSION.md` 末尾加一节「日常挑战」，指向本设计稿。

---

## 7. 玩家不想打时怎么办

1. **不理会入口。** 玩家直接翻页或在输入框继续写，挑战入口失效，AI 看到的是普通续写请求，按自己的判断写结果；这一楼不做数值结算。标签对应的额度**不**扣（没有开局，不算一次挑战）。
2. **点「放弃」。** 若 `daily.allowEscape` 为真：记为「放弃」结局，写战报「放弃了这次挑战」，代价减半，无收获。放弃要有轻量代价，否则等于无代价逃避，节制就破了；代价写死为半数，不由 AI 决定（问卷题 5）。
3. **点「交给托管」。** 用 `chooseAllyPlay`（`combat/policy.js:64`）自动出牌，直至结束，结算与手动完全相同。托管不加成也不减成。
4. **对决中途离开。** 沿用断点续战：会话存档在 `igs-combat:session:<chatId>`，回来能继续。超过若干楼未续战则自动按「放弃」处理（实施时定具体楼数，问卷未列，建议沿用现有战斗断点的过期规则）。
5. **整段不想玩。** 设置里把「对决类型」改回「战斗」，或在设置中关闭日常，提示词里不再出现标签语法，AI 不会再开局。

---

## 8. 触发节制

关键挑战泛滥有两个来源：AI 觉得什么都「关键」，玩家被频繁打断。对策放在脚本，不放进提示词（用户规则：不加反向规则对冲）。

1. **每个游戏日上限**（缺省 1，可设 1–3）：计数存数值存档 `clock.challenges`（6.1），跨天与软跨天清零（`stat-day.js:80`、`:117`）。额度用完时，本楼提示词里**不出现**日常语法行，AI 根本不知道可以开，比写「今天不许再开」更干净。
2. **楼数冷却**（缺省 8 楼，可设）：两次挑战之间至少间隔 N 楼，同样用「条件性省略语法行」实现。
3. **只有 AI 写了标签才开**：脚本绝不主动发起挑战。没有「每 N 楼自动触发」。
4. **标签位置规则**：只认末行，对话中间写的一律忽略，减少误触发。
5. **标签校验失败不开局**：未知难度、代价拒收，诊断显示在现有诊断里。
6. **开局前要玩家确认**：标签只让入口出现，不会自动弹出对决。玩家不点就不开，这也是对 AI 滥用的天然缓冲。
7. **新聊天默认关闭**：「对决类型」缺省为 `combat`，旧存档行为不变；用户主动选「日常挑战」或「两者」才会注入语法。
8. **统计与可见性**：设置页「日常挑战」一栏显示「今天已用 N / 上限」，用户随时能调。

---

## 9. 待用户拍板的问题清单

实施前请先让用户回答。每题给 2–4 个选项，推荐项标 ★。

**用户已拍板（2026-11-02）：** 1-B；2-A；3-B；4-B；5-C（最多 2 名协助者，每人一张专属牌，仍放第三阶段）；6-D（按事件类型决定收获，金钱收入随钱包计划落地后放开，经验牌放第三阶段）；7-A；8-C（复用现有战斗皮肤，只换文案，不另画日常皮肤）；9-A。

**1. 失败后果的轻重**
- A. 轻：压力 +10，体力 −5，不扣钱、不伤关系
- B. 中（★）：按 3.4 的表，轻松 / 普通 / 艰难分别 1 / 2 / 3 档
- C. 重：在 B 基础上再叠加一项（如压力同时伤体力）
- D. 由用户在设置里自选 A / B / C 三档（`daily.stake`）

**2. 一天最多几次关键挑战**
- A. 1 次（★，稀缺感最强）
- B. 2 次
- C. 3 次
- D. 不限，仅靠楼数冷却

**3. 一局的回合数**
- A. 3–4 回合，快节奏
- B. 4–6 回合（★）
- C. 6–8 回合，偏策略
- D. 由难度决定：轻松 3、普通 5、艰难 7

**4. 能不能放弃或交给 AI 自己写结果**
- A. 不能放弃，进了就打完
- B. 能放弃，代价减半（★）
- C. 能放弃，无代价
- D. 额外允许「不使用卡牌结算，交给 AI 写结果」，这一次不做数值结算（对应 `COMBAT_SKIP_TEXT`）

**5. NPC 能不能协助出牌**
- A. 第一阶段不做，后续再说（★）
- B. 可以，最多 1 名，好感达标的在场人物
- C. 可以，最多 2 名，并为每个人物提供一张专属牌
- D. 不做，永远只有主角一人

**6. 胜利有没有实质收获**
- A. 只有压力下降和技能成长（★）
- B. 另有小额金钱收入（比赛奖金这类事件）
- C. 另有一张可选的「经验」牌作为奖励（第三阶段）
- D. 都有，按事件类型决定

**7. 设置入口形态（见 §5）**
- A. 卡牌战斗下的「对决类型」子选项，并提供「仅日常」预设（★）
- B. 并列的第四个选项
- C. 独立总开关

**8. 日常皮肤的方向（沿用审美规则：细腻、不卡通、元素少）**
- A. 纸页与墨线风（安静克制）
- B. 近黑实色卡面加单一点缀色（★，与现有深色皮肤一致）
- C. 复用现有九套里的一套，只换文案
- D. 由我先出两套小样给你选

**9. 挑战入口的出现方式**
- A. 楼底出现入口，玩家点了才开（★）
- B. 自动弹出面板，可点「稍后」
- C. 只在 AI 写了标签且好感或某些条件成立时出现

---

## 10. 风险与我没把握的地方

1. **「战斗」设置页三选一的字段路径未确认。** 现有源码里看到的是两个独立开关，三选一似乎是另一窗口迁移后的新界面，本文的设置字段是按现有路径写的，迁移合回后要对齐。
2. **引擎对「非战斗」卡组的假设。** 契约里起始卡组固定 20 张（基础攻击 3、基础防御 3、职业卡 10、个人卡 4）。本设计用同样 20 张骨架以避免改引擎，但我没有逐行确认 `createBattle` 是否要求「职业」档案（`classRef`）存在。若必须有，需要为日常主角造一个虚拟职业档案；这是第一阶段最大的未知项，建议实施者开工第一件事是用最小 `setup` 跑通 `createBattle`。
3. **回合数上限与「按进展比例判胜负」。** 引擎目前没有回合数上限，我写的「到上限按进展比例判」要么在适配层靠「超过 N 回合后强制结束」实现，要么需要改引擎。优先走适配层，不改引擎。
4. **战报驱动结算的读取点。** 我确认了数值侧的结算框架（`settleCombat`）与战报格式，但未逐行核对 `core/stats-runtime.js` 里「读到战报楼后合成 `challenge` 指令」应该挂在哪个钩子上；实施者需先对照 `walletExtra`、`noBattle` 的传入点（`:603`、`:655`）与 `flags.battle` 的处理，找一个同类位置。
5. **`STATS_SAVE_VERSION` 与新增 `clock` 字段。** 我判断「可选字段、缺省补齐」不需要升版本，但没有核对 `deserializeLedger` 是否会拒收未知字段，需要先验证。
6. **难关数值校准。** 3.3 里的目标回合数是设计意图，实际平衡必须用 `scripts/combat-balance.mjs` 与真人试玩共同调，我没有跑模拟。
7. **好感门槛保护。** 失败扣好感时是否会触碰「好感阶段只升不降」之类的保护，我只读了 `applyDim` 的入口，未核实细节。
