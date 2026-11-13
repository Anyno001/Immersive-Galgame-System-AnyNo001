# 敌人模板：当前可用范围与后续补录

## 当前交付范围

助手已将本轮范围收窄为三档可用模板池、出招意图与剧情适配选择；暂停全量扩库及平衡校准。

| 档位 | 原版模板 | 程序缝合 | 特性池合计 |
|---|---:|---:|---:|
| 普通 | 50 | 50 | 100 |
| 精英 | 8 | 8 | 16 |
| 首领 | 4 | 4 | 8 |

原版共62条；三档在64个确定性种子下均保持原版:缝合=1:1、可以物化。首领为 The Guardian、Lagavulin Matriarch、Waterfall Giant、Knowledge Demon。数量不代表两作正式版全覆盖，也不代表平衡或真实环境验收完成。

候选请求携带 `code/text/fit`：`text` 概括特性，`fit` 根据最终技能、被动、阶段预写适合的敌人类型。战斗准备AI结合剧情和世界书选择已有编码，不决定概率、数值或缝合组合；指引不是种族、名字或立绘的硬限制。已落账敌人复用，缺选及失败沿用确定性兜底。

## 意图口径

- 读当前已规划技能及实时修正，攻击逐组显示“每段伤害×段数”，不把总伤害冒充每段数值。保留总伤害供调用方使用；显示值在格挡、护命、无实体等防伤结算之前，不是预言最终扣血。
- 原版S1采用组合类别，S2采用并列类别；睡眠、眩晕、逃跑、状态牌、附着、召唤与自爆有独立图标。S1未知意图不展示伤害数字。缝合项根据实际效果分类，不冒称某作原版。
- 多段成长、有效敏捷和积蓄爆发读取同一估算入口；意图改写读取新状态，不额外消耗随机数。默认与九套画布皮肤共用渲染内容。
- SVG为本项目自制符号，不复制原作素材。攻击图案随伤害档位变化、强力减益的细分类及完整原作显示细节尚未逐项复刻。S2意图来源带施工标记，不将其视为官方或永久完整规范。
- 来源：Slay the Spire Wiki贡献者，[S1 Intent固定修订66353](https://slaythespire.wiki.gg/wiki/Intent?oldid=66353)、[S2 Intent固定修订52043](https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Intent?oldid=52043)。此处为自写摘要；站点声明[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，游戏代码与素材不由该声明授权。研究边界见缓存128。

## 后续补录口径

当前目录171条：S1可抽26、excluded30、pending10；S2可抽36、仅遭遇成员3、excluded33、pending24、beta8、deprecated1。后续清单共97条（S1 40、S2 57），另列隔离内容。

下表是尚未接入模板的续加索引，不是重新完成的全量原作审计。`E`=缺证据或冲突；`M`=缺专用能力；`W`=已有部分原语、尚未完成接线/核验；`K`=随从，必须随召唤者处理；`X`=事件或版本隔离。既有条目中的旧“机制不支持”可能已过时，以下以当前契约和已核审计细化，不能据旧理由重复造机制。续加时先读来源、当前实现和已有测试，证据未闭合不入池。

表内省略统一前缀 `en-`，其余即稳定条目ID。随从不得单独入池，固定同场成员不得拆散抽取。

## S1 第一幕（11条）

| ID | 来源敌人 | 后续工作 |
|---|---|---|
| sts1-act1-01 | Cultist | E：Ritual获得当回合是否成长 |
| sts1-act1-03 | RedLouse | E/M：Curl Up受击边界、开战定值随机伤害 |
| sts1-act1-04 | Green Louse | E/M：同上，进阶连用冲突 |
| sts1-act1-06 | Spike Slime (L) | E/W：分裂原语已有；子体最大HP、继承、致死边界 |
| sts1-act1-09 | Acid Slime (L) | E/W：同上，通常选招及连用限制复核 |
| sts1-act1-11 | Acid Slime (S) | E：首招、循环和概率 |
| sts1-act1-13 | Mad Gremlin | E/M：Angry逐段、完全格挡及间接伤害 |
| sts1-act1-14 | Shield Gremlin | M/W：随机同伴目标、固定遭遇关系 |
| sts1-act1-18 | Red Slaver | M/E：已使用技能条件、前后两套选招；Entangled生命周期 |
| sts1-act1-24 | Slime Boss | E/W：共享kin与二次分裂已有；子体继承、致死、倍率方案 |
| sts1-act1-26 | Hexaghost | M/E：HP成长伤害已有；战斗内升级灼痕、循环接线 |

## S1 第二幕（13条）

| ID | 来源敌人 | 后续工作 |
|---|---|---|
| sts1-act2-01 | Byrd | E/W：击落序列原语已有；飞行零伤/全格挡计数及落地时序待核 |
| sts1-act2-02 | Chosen | E：Hex层数及完整定义 |
| sts1-act2-05 | Centurion | E/M：同伴定向保护、Fury权重；与Mystic固定同场 |
| sts1-act2-06 | Mystic | M/E：同伴失血条件、连续治疗及首招 |
| sts1-act2-07 | Snake Plant | E：Malleable逐击、完全格挡与重置 |
| sts1-act2-08 | Snecko | M/E：Confused费用随机及费用修正交互 |
| sts1-act2-09 | Book of Stabbing | E：连刺起算冲突、Painful Stabs初值 |
| sts1-act2-10 | Gremlin Leader | M/E：其他同伴目标、召唤分支与满员行为 |
| sts1-act2-12 | The Champ | M/W：周期插招、候选重定向与半血后优先级 |
| sts1-act2-13 | The Collector | W/E：指定召唤与数量条件已有；随从档案、时点仍需收录核验 |
| sts1-act2-14 | Torch Head | K：仅随Collector收录，不独立入池 |
| sts1-act2-15 | Bronze Automaton | M/E：按稀有度暂扣牌与死亡返还、铜球保护目标 |
| sts1-act2-16 | Bronze Orb | K/M：随Automaton；Stasis与向召唤者给格挡 |

## S1 第三/四幕（16条）

| ID | 来源敌人 | 后续工作 |
|---|---|---|
| sts1-act3-04 | Darkling | E/M：群体复活计时冲突、阵位起手与开战随机伤害 |
| sts1-act3-06 | The Maw | E/W：回合起算；条件选招与加段原语已有 |
| sts1-act3-07 | Spire Growth | M/E：按目标状态替换候选、来源死亡解除 |
| sts1-act3-08 | Transient | E/W：回合起算与Shifting/Fading时点；原语已有 |
| sts1-act3-09 | Writhing Mass | E/W：重掷、永久寄生原语已有；Malleable等仍缺证 |
| sts1-act3-10 | Giant Head | E/W：Slow当张计入与成长起算 |
| sts1-act3-11 | Nemesis | M/E：隔回合无实体的进入/移除边界 |
| sts1-act3-12 | Reptomancer | M/E：满员替换候选、指定随从与新生行动资格 |
| sts1-act3-13 | Dagger | K/E：随Reptomancer；伤口→自爆序列及新生时点 |
| sts1-act3-14 | Time Eater | M/E：清除自身减益、半血Haste刷新；跨回合chrono已有 |
| sts1-act3-15 | Donu | E/W：起手与双体固定遭遇 |
| sts1-act3-16 | Deca | E/W：起手与双体固定遭遇 |
| sts1-act3-17 | Awakened One | E/W：归零重生已有；二阶段再生及状态保留 |
| sts1-act4-01 | Spire Shield | M/E：周期插招与随机两步组合、初始朝向 |
| sts1-act4-02 | Spire Spear | M/E：首招与周期组合衔接、初始朝向 |
| sts1-act4-03 | Corrupt Heart | M/E：逐次增益、第六次后行为、逐牌反伤与周期组合 |

## S2 Overgrowth（9条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-overgrowth-07 | Eye With Teeth | excluded | K/E：随Fogmog；幻影死亡后复活时点 |
| sts2-overgrowth-09 | Fogmog | pending | E/W：指定召唤已有；后续禁连用作用域冲突 |
| sts2-overgrowth-11 | Inklet | excluded | M/W：滑溜已有；三体阵位首招及遭遇接线 |
| sts2-overgrowth-12 | Leaf Slime (M) | pending | E：S2黏液状态牌定义 |
| sts2-overgrowth-13 | Leaf Slime (S) | pending | E：首招权重、S2黏液状态牌定义 |
| sts2-overgrowth-16 | Shrinker Beetle | pending | M/E：绑定来源存活的缩身、交替段起始相位 |
| sts2-overgrowth-19 | Twig Slime (M) | pending | E/W：不限连用已有；黏液牌定义、67:33选招核验 |
| sts2-overgrowth-21 | Vine Shambler | pending | M/E：Tangled层数、持续期及加费优先级 |
| sts2-overgrowth-22 | Wriggler（事件版） | pending | E/M：Infection牌定义、召唤与多体错位首招 |

## S2 Underdocks（9条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-underdocks-02 | Corpse Slug | excluded | W：ravenous已有；吞食、眩晕、成长接线及错位首招 |
| sts2-underdocks-04 | Fossil Stalker | pending | E/W：suck与不限连用已有；多段归并、反伤时序 |
| sts2-underdocks-05 | Gremlin Merc | excluded | M/W：盗金、死亡生成已有；盗金转交指定随从 |
| sts2-underdocks-06 | Fat Gremlin（S2） | excluded | K/M：随Merc；继承盗金、立即遁逃与返金 |
| sts2-underdocks-07 | Sneaky Gremlin（S2） | excluded | K/W：随Merc；随从档案与死亡生成接线 |
| sts2-underdocks-09 | Living Fog | excluded | W：smoggy及指定召唤已有；随从档案、行为核验 |
| sts2-underdocks-10 | Gas Bomb | excluded | K/W：随Living Fog；爆炸后自毁序列核验 |
| sts2-underdocks-14 | Sludge Spinner | pending | E：后三招权重、历史HP冲突 |
| sts2-underdocks-16 | Two-Tailed Rat | excluded | E/W：召唤原语已有；概率、单体与整组计数规则 |

## S2 Hive（10条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-hive-03 | Bowlbug (Silk) | pending | E：织网与连打的首招 |
| sts2-hive-07 | Hunter Killer | pending | E/M：穿刺连用、Tender嵌套出牌与来源生命周期 |
| sts2-hive-10 | Myte | pending | E：双体首招与循环相位、Toxic牌定义 |
| sts2-hive-11 | Ovicopter | excluded | M/W：指定召唤及数量分支已有；硬壳卵孵化变形 |
| sts2-hive-12 | Tough Egg | excluded | K/M：随Ovicopter；倒计时变形为另一单位 |
| sts2-hive-13 | Slumbering Beetle | excluded | E/W：睡眠及失血计时已有；唤醒顺序细节 |
| sts2-hive-15 | The Obscura | excluded | E/W：指定召唤已有；后三招权重 |
| sts2-hive-16 | Parafright | excluded | K/M：随Obscura；幻影随从复活 |
| sts2-hive-17 | Thieving Hopper | excluded | M/E：偷长期副本已有；Flutter、Escape Artist及偷牌优先级 |
| sts2-hive-18 | Tunneler | excluded | M/E：破盾打断已有；潜地保留格挡与切换时点 |

## S2 Glory（10条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-glory-02 | Scroll of Biting | pending | E/M：HP、咀嚼分支权重、最大生命削减 |
| sts2-glory-04 | Fabricator | excluded | M/W：指定召唤与数量条件已有；Guardbot定向给召唤者格挡 |
| sts2-glory-05 | Zapbot | excluded | K/E：随Fabricator；High Voltage成长时点冲突 |
| sts2-glory-06 | Stabbot | excluded | K/W：随Fabricator；随从档案及召唤接线 |
| sts2-glory-07 | Guardbot | excluded | K/M：随Fabricator；格挡目标绑定召唤者 |
| sts2-glory-08 | Noisebot | excluded | K/E：随Fabricator；眩晕牌两牌堆分配 |
| sts2-glory-10 | Globe Head | pending | M/E：Galvanic附着牌区、新生成牌、复制与来源死亡 |
| sts2-glory-12 | Slimed Berserker | pending | E：HP版本冲突、Slimed牌定义 |
| sts2-glory-13 | Living Shield | excluded | M：炮手身份存活条件、定向保护目标 |
| sts2-glory-16 | The Forgotten | pending | E/W：敏捷伤害及返还已有；Miasma顺序缺证，固定搭档The Lost |

## S2 精英（9条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-elite-01 | Bygone Effigy | pending | E/W：slow已有；当张计入与重置事件 |
| sts2-elite-03 | Phrog Parasite | excluded | E/W：死亡生成已有；Infection牌定义、Wriggler随从档案 |
| sts2-elite-04 | Phantasmal Gardener | excluded | M/W：遭遇分组已有；四体错位首招 |
| sts2-elite-06 | Terror Eel | pending | E/M：阈值眩晕改写与恢复时点、易伤99层范围 |
| sts2-elite-07 | Decimillipede | excluded | E/M：同体多节复活、复活后的随机续招 |
| sts2-elite-09 | Infested Prism | pending | E：Tainted文本、施加时点与范围 |
| sts2-elite-10 | Flail Knight | pending | E：后三招权重，不套用事件骑士 |
| sts2-elite-11 | Spectral Knight | pending | E/M：S2 Hex虚无附着及新生成牌范围，不等同S1 Hex |
| sts2-elite-12 | Magi Knight | pending | E/M：Dampen解除时升级恢复及临时升级交互 |

## S2 首领（6条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-boss-01 | Ceremonial Beast | pending | E/W：打断已有；Ringing定义、持续期及阈值意图时点 |
| sts2-boss-02 | Kin Priest / Kin Follower | excluded | E/W：指定随从已有；三体遭遇、随从HP与循环接线 |
| sts2-boss-03 | Vantom | pending | E：基础伤害27/26、滑溜9/8版本冲突 |
| sts2-boss-07 | The Insatiable | excluded | M/W：sandpit已有；专属逃脱牌及吞食胜负链 |
| sts2-boss-12 | Torch Head Amalgam | excluded | K/X：仅随Queen，召唤者为beta，继续隔离 |
| sts2-boss-13 | Test Subject（Phase 1 / 2 / 3） | excluded | E/M：归零转阶段已有；无界段数、跨阶段计数继承与重置 |

## S2 事件（4条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-event-01 | The Merchant??? | excluded | E/W：八段已有；受限随机权重、狂怒冷却锚点 |
| sts2-event-02 | Battle Friend V1.0 | excluded | X/M：倒计时挑战，胜负与奖励由事件决定 |
| sts2-event-03 | Battle Friend V2.0 | excluded | X/M：同上，非普通敌人模板 |
| sts2-event-04 | Battle Friend V3.0 | excluded | X/M：同上，非普通敌人模板 |

## 隔离记录（12条，不计入上述97条）

| ID | 来源敌人 | 隔离状态 | 恢复条件 |
|---|---|---|---|
| sts2-hive-06 | Exoskeleton | beta | 正式版本与碎步随机规则核定后重审 |
| sts2-hive-08 | Louse Progenitor | beta | 正式版本、蜷身受击与清除时序核定后重审 |
| sts2-glory-03 | Axebot | beta | 正式版本及原位补货实例规则核定后重审 |
| sts2-elite-08 | Entomancer | beta | 正式版本、逐伤害实例塞牌边界核定后重审 |
| sts2-elite-13 | Mecha Knight | beta | 正式版本、满手牌与伤害/塞牌顺序核定后重审 |
| sts2-boss-05 | Soul Fysh | beta | 正式版本与召引卡牌定义核定后重审 |
| sts2-boss-10 | Aeonglass | beta | 正式版本、X求值顺序与跨回合计数核定后重审 |
| sts2-boss-11 | Queen | beta | 正式版本、随从存亡改意图与束缚牌生命周期核定后重审 |
| sts2-boss-14 | Doormaker | deprecated | 仅保留目录记录，不进入正式池 |
| sts2-glory-15 | The Lost | encounterOnly | 仅随固定遭遇；The Forgotten缺证时整个遭遇不可物化 |
| sts2-boss-09 | Kaiser Crab（Crusher） | encounterOnly | 已实现，仅随遭遇「帝蟹」物化，不独立抽取 |
| sts2-boss-15 | Kaiser Crab（Rocket） | encounterOnly | 已实现，仅随遭遇「帝蟹」物化，不独立抽取 |

## 续加与验证入口

- 条目权威目录：`app/src/combat/enemies/`；来源与历史审计：`.limcode/cache/enemy-research/`。本文按当前目录逐ID对账，不代表重新核验了全部原作来源。
- 续加时先闭合该行的来源/机制缺口，再经档案归一化、正式建局、逐段结算与重放核验；随从和固定遭遇必须连同所属关系接入，不拆成单体填池。
- 现有回归入口：在 `app/` 执行 `node --test --test-reporter=spec tests/combat-enemy-templates.test.js`。数值校准、真实酒馆/手机验收及视觉反馈分别记录，测试通过不替代这些验收。
- 当前范围只做本地实现；可见预览按助手要求跳过，视觉未验收，真实模板的备战与建局链已验证。暂停逐条扩库和 `#balance`，不升版本、构建、提交、推送或发布。