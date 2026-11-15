# 敌人模板：当前可用范围与后续补录

## 当前交付范围

本轮继续按本地续加索引补齐敌人模板，保留三档模板池、出招意图与剧情适配选择。来源未闭合或明确待批准的取值继续标记，不以引擎默认值冒充来源事实；平衡校准仍暂缓。

| 档位 | 原版模板 | 程序缝合 | 特性池合计 |
|---|---:|---:|---:|
| 普通 | 57 | 57 | 114 |
| 精英 | 8 | 8 | 16 |
| 首领 | 5 | 5 | 10 |

单体池原版共70条；三档在64个确定性种子下均保持原版:缝合=1:1、可以物化。首领为 The Guardian、The Collector、Lagavulin Matriarch、Waterfall Giant、Knowledge Demon。翎风鸟已补齐正常选招与反复击落恢复；收集者已补齐数量分支、补至两只炬首侍从及第四个自身回合减益；墨滴灵只随三体遭遇展开，保留两侧戳刺、中间旋击起手及后续交替循环。眠甲虫已接入双计数睡眠、醒来卸甲与滚击后力量成长，相关定向回归6/6通过。Red Slaver 已接入首招、束缚前循环、25%一次性束缚及用后55:45选招，相关定向回归7/7通过。Living Fog 已接入烟雾、交替攻击与召唤；Gas Bomb 仅在其 kin.bomb 实现，先爆炸再自毁，不独立入池。Living Fog／Underdocks 定向3/3、64种子池1/1及S2集中汇总1/1通过。Shield Gremlin 已接入随机保护存活同伴、独处盾击和不限连用；新增技能单位专用protect-ally，校验、换算、生产装配与重放定向3/3通过，目录/集中参考值/64种子池3/3、S1汇总1/1通过。来源未证边界继续保留，数量不代表两作正式版全覆盖，也不代表平衡或真实环境验收完成。

Frog Knight既有release模板已补核生产装配：v6/v7各4种子、满血/恰好半血/低于半血三条路径，共24场景；检查点的一次性冲锋、意图及完整事件重放一致。蛙骑士与通用条件步定向2/2通过，池计数不变；镀甲和精确检查时点等来源边界见缓存151与137 §6ab，未改运行时或平衡配置。

Turret Operator仅随固定遭遇「炮手与活体盾」出现；Living Shield仍为excluded，整组不可物化，不能部分建局或拆入单体/缝合池。目录、整组准入、S2集中汇总及64种子池定向4/4，备战拒收与存量重放2/2通过；不是活体盾行为验收。Rampart绑定与时序边界见缓存153及137 §6ad，换算参考值不变。

Tunneler已入普通单体池：Bite13后潜地并获得Burrowed与格挡32，持续地底突袭23；潜地跨自身回合保盾，破盾后一次空行动，再从Bite重启。Burrowed移除时清盾，不脱离脚本进入缝合池。v6/v7各4种子、每场两轮破盾的生产装配、意图与完整事件重放，以及Hive/S2汇总和含潜地排除断言的64种子池，定向5/5通过；状态提示定向1/1通过。精确时点、多段/反伤、其他移除路径与致死/Doom竞争等边界见缓存156和137 §6ag。

The Kin已接入固定首领遭遇「血亲」：1名Kin Priest与2名Minion身份的Kin Follower初始同场，祭司四步循环，随从分别从Quick Slash与Power Dance起手并独立循环；不进入单体/缝合池。初始随从与主人绑定、继承最终伤害倍率，不额外计首领奖励；容量不足整组拒收，不拆入后备。配置/建局边界、v6/v7各4种子的循环/意图/完整事件重放、真实大厅buildSetup和退场路径定向6/6，旧召唤兼容8/8通过。左右阵位、Fatal、Doom及同回合多体死亡队列未闭合，沿用已批准Minion退场约定，见缓存158与137 §6ai。

Phantasmal Gardener已接入固定精英遭遇「幻影园丁」：四名非爪牙从左到右以Flail、Bite、Lash、Enlarge起手，随后逐只独立循环。经批准仅完整四园丁编组例外初始同场，普通foeCap仍为3、总位置仍为5；混编、重复编组和后备拆分拒收。开场Skittish6按格挡比例换算；首次完整牌效果后给盾，多段之间不给盾，下一次重演会遇到格挡，挂起选择时保存待发格挡。准入、v6/v7循环/意图、真实大厅buildSetup、重演/选择恢复、四体终局及集中汇总定向8/8，既有兼容13/13通过。重置归属、零伤害、完全格挡、致死、多目标和Osty边界继续保留，见缓存160与137 §6ak。

候选请求携带 `code/text/fit`：`text` 概括特性，`fit` 根据最终技能、被动、阶段预写适合的敌人类型。战斗准备AI结合剧情和世界书选择已有编码，不决定概率、数值或缝合组合；指引不是种族、名字或立绘的硬限制。已落账敌人复用，缺选及失败沿用确定性兜底。

## 意图口径

- 读当前已规划技能及实时修正，攻击逐组显示“每段伤害×段数”，不把总伤害冒充每段数值。保留总伤害供调用方使用；显示值在格挡、护命、无实体等防伤结算之前，不是预言最终扣血。
- 原版S1采用组合类别，S2采用并列类别；睡眠、眩晕、逃跑、状态牌、附着、召唤与自爆有独立图标。S1未知意图不展示伤害数字。缝合项根据实际效果分类，不冒称某作原版。
- 多段成长、有效敏捷和积蓄爆发读取同一估算入口；意图改写读取新状态，不额外消耗随机数。默认与九套画布皮肤共用渲染内容。
- SVG为本项目自制符号，不复制原作素材。攻击图案随伤害档位变化、强力减益的细分类及完整原作显示细节尚未逐项复刻。S2意图来源带施工标记，不将其视为官方或永久完整规范。
- 来源：Slay the Spire Wiki贡献者，[S1 Intent固定修订66353](https://slaythespire.wiki.gg/wiki/Intent?oldid=66353)、[S2 Intent固定修订52043](https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Intent?oldid=52043)。此处为自写摘要；站点声明[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，游戏代码与素材不由该声明授权。研究边界见缓存128。

## 后续补录口径

当前目录171条：S1可抽30、excluded26、pending10；S2可抽40、仅遭遇成员7、excluded27、pending22、beta8、deprecated1。excluded中的Torch Head与Gas Bomb已在各自召唤者内实现，仅保留禁止独立入池标记，不计未完成；后续清单共83条（S1 35、S2 48），另列16条隔离内容。动态参考A中S1普通档为30/12，S2普通档为48/11、精英档为78.75/15.5、首领档为215.5/19.5，Act1批次为30/10、Hive为74/16、Underdocks为53.5/9.5；仅遭遇成员仍参与参考值，未做平衡校准。已登记6组固定遭遇，其中帝蟹、墨滴灵、血亲、幻影园丁4组可物化，迷失与遗忘、炮手与活体盾因成员未就绪仍整组拒收。

Leaf Slime (M)与Twig Slime (M)已入普通单体池：独立S2黏液`status-slime-sts2`为1费、抽1张后消耗，S1旧`status-slime`仍为1费仅消耗。中叶首招塞2张、后与攻击8交替；中枝首招塞1张、后续攻击11/塞牌按67:33，塞牌禁二连、攻击`maxRepeat:0`不限连用。本地受限加权不宣称复现原作RNG。新旧牌、v6/v7各4种子生产物化/意图/事件重放、真实大厅buildSetup与64种子池复验7/7，既有兼容16/16；来源及边界见缓存164与137 §6ao。小叶首招权重仍未给，保持pending；不登记Easy/Hard Slimes遭遇。S2普通参考由52/11变为48/11，影响同组归一换算，#balance仍暂缓。

已批准的召唤约定：新随从入场后等待一个自身行动间隔，不立即插队；绑定爪牙随召唤者倒下退场，不另计击杀或奖励；继承召唤者最终`damageScale`，不再额外乘首领倍率。收集者的`kin.torch`使用来源生命区间38–40的既有中点39换算、冲撞7；活雾的`kin.bomb`使用基础HP7、爆炸8后自毁，均不作为独立档案或遭遇成员。活雾交替段第二回合、烟雾来源死亡解除及爆炸精确队列仍缺证，见缓存146与137 §6w。分裂生命、状态继承等未在此次批准范围内。

下表是尚未接入模板的续加索引，不是重新完成的全量原作审计。`E`=缺证据或冲突；`M`=缺专用能力；`W`=已有部分原语、尚未完成接线/核验；`K`=随从，必须随召唤者处理；`X`=事件或版本隔离。既有条目中的旧“机制不支持”可能已过时，以下以当前契约和已核审计细化，不能据旧理由重复造机制。续加时先读来源、当前实现和已有测试，证据未闭合不入池。

表内省略统一前缀 `en-`，其余即稳定条目ID。随从不得单独入池，固定同场成员不得拆散抽取。

## S1 第一幕（9条）

| ID | 来源敌人 | 后续工作 |
|---|---|---|
| sts1-act1-01 | Cultist | E：Ritual获得当回合是否成长 |
| sts1-act1-03 | RedLouse | E/M：Curl Up受击边界、开战定值随机伤害 |
| sts1-act1-04 | Green Louse | E/M：同上，进阶连用冲突 |
| sts1-act1-06 | Spike Slime (L) | E/W：分裂原语已有；子体最大HP、继承、致死边界 |
| sts1-act1-09 | Acid Slime (L) | E/W：同上，通常选招及连用限制复核 |
| sts1-act1-11 | Acid Slime (S) | E：首招、循环和概率 |
| sts1-act1-13 | Mad Gremlin | E/M：Angry逐段、完全格挡及间接伤害 |
| sts1-act1-24 | Slime Boss | E/W：共享kin与二次分裂已有；子体继承、致死、倍率方案 |
| sts1-act1-26 | Hexaghost | E/M/W：目标回合生命伤害、六段及基础Burn已有；升级牌堆范围/顺序未证，Burn升级结算、批量升级与后续Sear造牌链未接，保持excluded（162；137 §6am） |

## S1 第二幕（10条）

| ID | 来源敌人 | 后续工作 |
|---|---|---|
| sts1-act2-02 | Chosen | E：组间随机交替与S1妖术已有；Hex施加层数、持续/来源死亡清除未证，估值不是初值，保持excluded（161；137 §6al） |
| sts1-act2-05 | Centurion | E/M：同伴定向保护、Fury权重；与Mystic固定同场 |
| sts1-act2-06 | Mystic | M/E：同伴失血条件、连续治疗及首招 |
| sts1-act2-07 | Snake Plant | E：Malleable触发/递增、完全格挡与重置未证；A17后续序列有编辑疑问，保持pending（161；137 §6al） |
| sts1-act2-08 | Snecko | M/E：Confused费用随机及费用修正交互 |
| sts1-act2-09 | Book of Stabbing | E：连刺起算冲突、Painful Stabs初值 |
| sts1-act2-10 | Gremlin Leader | M/E：其他同伴目标、召唤分支与满员行为 |
| sts1-act2-12 | The Champ | E/M/W：首招、Taunt相位、重复候选转移及半血优先级待证；概率插招/一次性阶段不等于周期触发，见缓存152 |
| sts1-act2-15 | Bronze Automaton | M/E：按稀有度暂扣牌与死亡返还、铜球保护目标 |
| sts1-act2-16 | Bronze Orb | K/M：随Automaton；Stasis与向召唤者给格挡 |

## S1 第三/四幕（16条）

| ID | 来源敌人 | 后续工作 |
|---|---|---|
| sts1-act3-04 | Darkling | E/M：群体复活计时冲突、阵位起手与开战随机伤害 |
| sts1-act3-06 | The Maw | E/W：script.next条件转移、foe-volley每两回合加段已有；Nom Nom原作回合计数与玩家回合/自身行动次数的对应未闭合，保留excluded（159） |
| sts1-act3-07 | Spire Growth | M/E：按目标状态替换候选、来源死亡解除 |
| sts1-act3-08 | Transient | E/W：回合起算与Shifting/Fading时点；原语已有 |
| sts1-act3-09 | Writhing Mass | E/W：重掷、永久寄生原语已有；Malleable等仍缺证 |
| sts1-act3-10 | Giant Head | E/W：Slow当张计入与成长起算 |
| sts1-act3-11 | Nemesis | E：项目无实体已有；原作首次生效、获得/移除及伤害限制未证，保持pending（163；137 §6an） |
| sts1-act3-12 | Reptomancer | E/W：指定召唤、初始随从与数量条件已有；满员改用Snake Strike与连用限制的优先级待证，非替换存活单位，保持excluded（163；137 §6an） |
| sts1-act3-13 | Dagger | K/E/W：仅随Reptomancer完整接线；伤口→爆炸后自死原语已有，沿用已批准新生等待/绑定退场，精确队列和槽位待证，保持excluded（163；137 §6an） |
| sts1-act3-14 | Time Eater | M/E：清除自身减益、半血Haste刷新；跨回合chrono已有 |
| sts1-act3-15 | Donu | E/W：起手与双体固定遭遇 |
| sts1-act3-16 | Deca | E/W：起手与双体固定遭遇 |
| sts1-act3-17 | Awakened One | E/W：归零重生已有；二阶段再生及状态保留 |
| sts1-act4-01 | Spire Shield | M/E：周期插招与随机两步组合、初始朝向 |
| sts1-act4-02 | Spire Spear | M/E：首招与周期组合衔接、初始朝向 |
| sts1-act4-03 | Corrupt Heart | M/E：逐次增益、第六次后行为、逐牌反伤与周期组合 |

## S2 Overgrowth（6条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-overgrowth-07 | Eye With Teeth | excluded | K/E：随Fogmog；幻影死亡后复活时点 |
| sts2-overgrowth-09 | Fogmog | pending | E/W：指定召唤已有；后续禁连用作用域冲突 |
| sts2-overgrowth-13 | Leaf Slime (S) | pending | E：仅首招权重未给；S2黏液牌面已核，不能由禁连用反推等权（164） |
| sts2-overgrowth-16 | Shrinker Beetle | pending | M/E：绑定来源存活的缩身、交替段起始相位 |
| sts2-overgrowth-21 | Vine Shambler | pending | M/E：Tangled层数、持续期及加费优先级 |
| sts2-overgrowth-22 | Wriggler（事件版） | pending | E/M：Infection牌定义、召唤与多体错位首招 |

## S2 Underdocks（7条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-underdocks-02 | Corpse Slug | excluded | E/W：ravenous及逐只首招配置已有；双体起手集合、三体阵位映射与晕厥后恢复相位待证，不能据技能表顺序登记遭遇（148） |
| sts2-underdocks-04 | Fossil Stalker | pending | E/M/W：Suck3为未格挡攻击后力量成长，非吸血，专用结算未实现；不限连用与逐段/行动后钩子已有，多段累计/提交、Osty穿透去重及致死/反伤顺序待证（157） |
| sts2-underdocks-05 | Gremlin Merc | excluded | E/M/W：盗金及死亡生成已有；转交指定Fat未接，Thievery按段/行动、格挡与致死顺序待证（155） |
| sts2-underdocks-06 | Fat Gremlin（S2） | excluded | K/E/M：随Merc；先Spawned后Flee，遁逃/返金已有，盗金继承及奖励边界未闭合（155） |
| sts2-underdocks-07 | Sneaky Gremlin（S2） | excluded | K/W：先Spawned后Tackle9；须随Merc完整接线，Type不代替绑定退场特性（155） |
| sts2-underdocks-14 | Sludge Spinner | pending | E：后三招权重、历史HP冲突 |
| sts2-underdocks-16 | Two-Tailed Rat | excluded | E/M/W：指定召唤与单体maxUses已有，cap非整组累计额度；首招阵位、权重/概率、回合起算及新生资格待证（154） |

## S2 Hive（8条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-hive-03 | Bowlbug (Silk) | pending | E：织网与连打的首招 |
| sts2-hive-07 | Hunter Killer | pending | E/M：穿刺连用、Tender嵌套出牌与来源生命周期 |
| sts2-hive-10 | Myte | pending | E：双体首招与循环相位、Toxic牌定义 |
| sts2-hive-11 | Ovicopter | excluded | M/E：指定召唤及数量分支已有；孵化需非死亡换生命与清状态，计时及行动占用待证 |
| sts2-hive-12 | Tough Egg | excluded | K/M/E：随Ovicopter；同单位孵化换形态、生命与状态，不以死亡生成近似 |
| sts2-hive-15 | The Obscura | excluded | E/W：指定召唤已有；后三招权重 |
| sts2-hive-16 | Parafright | excluded | K/M：随Obscura；幻影随从复活 |
| sts2-hive-17 | Thieving Hopper | excluded | M/E：偷长期副本已有；Flutter、Escape Artist及偷牌优先级 |

## S2 Glory（10条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-glory-02 | Scroll of Biting | pending | E/M：HP、咀嚼分支权重、最大生命削减 |
| sts2-glory-04 | Fabricator | excluded | E/M/W：allies数量分支及指定召唤已有；召唤去重历史、绑定支援及机器人来源缺口阻断整组接线（149） |
| sts2-glory-05 | Zapbot | excluded | K/E：随Fabricator；High Voltage2在回合开始/结束成长的来源冲突未解（101、149） |
| sts2-glory-06 | Stabbot | excluded | K/W：刺击11并脆弱1已证；只随Fabricator完整接线，不独立入池（149） |
| sts2-glory-07 | Guardbot | excluded | K/M：给Fabricator格挡15须绑定身份，不能用ally最低生命比例回落替代（149） |
| sts2-glory-08 | Noisebot | excluded | K/E：两牌堆的Dazed数量分配及位置未闭合（101、149） |
| sts2-glory-10 | Globe Head | pending | M/E：Galvanic附着牌区、新生成牌、复制与来源死亡 |
| sts2-glory-12 | Slimed Berserker | pending | E：HP版本冲突、Slimed牌定义 |
| sts2-glory-13 | Living Shield | excluded | E/M/W：固定搭档身份及Rampart25链路未接；来源死亡、清盾/加盾顺序和意图刷新待证，整组不可物化（153） |
| sts2-glory-16 | The Forgotten | pending | E/W：敏捷伤害及返还已有；Miasma顺序缺证，固定搭档The Lost |

## S2 精英（8条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-elite-01 | Bygone Effigy | pending | E/W：slow已有；当张计入与重置事件 |
| sts2-elite-03 | Phrog Parasite | excluded | E/W：死亡生成已有；Infection牌定义、Wriggler随从档案 |
| sts2-elite-06 | Terror Eel | pending | E/M：阈值眩晕改写与恢复时点、易伤99层范围 |
| sts2-elite-07 | Decimillipede | excluded | E/M：同体多节复活、复活后的随机续招 |
| sts2-elite-09 | Infested Prism | pending | E：Tainted文本、施加时点与范围 |
| sts2-elite-10 | Flail Knight | pending | E：后三招权重，不套用事件骑士 |
| sts2-elite-11 | Spectral Knight | pending | E/M：S2 Hex虚无附着及新生成牌范围，不等同S1 Hex |
| sts2-elite-12 | Magi Knight | pending | E/M：Dampen解除时升级恢复及临时升级交互 |

## S2 首领（5条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-boss-01 | Ceremonial Beast | pending | E/W：打断已有；Ringing定义、持续期及阈值意图时点 |
| sts2-boss-03 | Vantom | pending | E：基础伤害27/26、滑溜9/8版本冲突 |
| sts2-boss-07 | The Insatiable | excluded | M/W：sandpit已有；专属逃脱牌及吞食胜负链 |
| sts2-boss-12 | Torch Head Amalgam | excluded | K/X：仅随Queen，召唤者为beta，继续隔离 |
| sts2-boss-13 | Test Subject（Phase 1 / 2 / 3） | excluded | E/M：foe-volley加段已有；阶段击杀/Fatal、复活前不可选中及非最终胜利暂缓缺完整链路；复活时点/占行动、首招、Painful Stabs数量、Nemesis首周期与跨阶段计数仍缺证（51；137 §6x） |

## S2 事件（4条）

| ID | 来源敌人 | 状态 | 后续工作 |
|---|---|---|---|
| sts2-event-01 | The Merchant??? | excluded | E/W：八段已有；受限随机权重、狂怒冷却锚点 |
| sts2-event-02 | Battle Friend V1.0 | excluded | X/M：倒计时挑战，胜负与奖励由事件决定 |
| sts2-event-03 | Battle Friend V2.0 | excluded | X/M：同上，非普通敌人模板 |
| sts2-event-04 | Battle Friend V3.0 | excluded | X/M：同上，非普通敌人模板 |

## 隔离记录（16条，不计入上述83条）

| ID | 来源敌人 | 隔离状态 | 恢复条件 |
|---|---|---|---|
| sts2-overgrowth-11 | Inklet | encounterOnly | 已实现，仅随三体遭遇「墨滴灵」物化，不独立抽取 |
| sts2-hive-06 | Exoskeleton | beta | 正式版本与碎步随机规则核定后重审 |
| sts2-hive-08 | Louse Progenitor | beta | 正式版本、蜷身受击与清除时序核定后重审 |
| sts2-glory-03 | Axebot | beta | 正式版本及原位补货实例规则核定后重审 |
| sts2-elite-04 | Phantasmal Gardener | encounterOnly | 已实现，仅随固定四体「幻影园丁」物化；非爪牙完整同场、阵位首招与独立循环，不独立抽取 |
| sts2-elite-08 | Entomancer | beta | 正式版本、逐伤害实例塞牌边界核定后重审 |
| sts2-elite-13 | Mecha Knight | beta | 正式版本、满手牌与伤害/塞牌顺序核定后重审 |
| sts2-boss-05 | Soul Fysh | beta | 正式版本与召引卡牌定义核定后重审 |
| sts2-boss-10 | Aeonglass | beta | 正式版本、X求值顺序与跨回合计数核定后重审 |
| sts2-boss-11 | Queen | beta | 正式版本、随从存亡改意图与束缚牌生命周期核定后重审 |
| sts2-boss-14 | Doormaker | deprecated | 仅保留目录记录，不进入正式池 |
| sts2-glory-15 | The Lost | encounterOnly | 仅随固定遭遇；The Forgotten缺证时整个遭遇不可物化 |
| sts2-glory-14 | Turret Operator | encounterOnly | 仅随「炮手与活体盾」；Living Shield未就绪时整个遭遇不可物化，不独立抽取 |
| sts2-boss-02 | Kin Priest / Kin Follower | encounterOnly | 已实现，仅随固定三体遭遇「血亲」物化；两随从为绑定Minion，错位首招，不独立抽取 |
| sts2-boss-09 | Kaiser Crab（Crusher） | encounterOnly | 已实现，仅随遭遇「帝蟹」物化，不独立抽取 |
| sts2-boss-15 | Kaiser Crab（Rocket） | encounterOnly | 已实现，仅随遭遇「帝蟹」物化，不独立抽取 |

## 续加与验证入口

- 条目权威目录：`app/src/combat/enemies/`；来源与历史审计：`.limcode/cache/enemy-research/`。本文按当前目录逐ID对账，不代表重新核验了全部原作来源。
- 续加时先闭合该行的来源/机制缺口，再经档案归一化、正式建局、逐段结算与重放核验；随从和固定遭遇必须连同所属关系接入，不拆成单体填池。
- 现有回归入口：在 `app/` 使用 `node --test --test-reporter=spec --test-name-pattern '<本批准确用例名>' tests/combat-enemy-templates.test.js` 定向运行，并核对实际命中项；本轮不运行整份模板测试。数值校准、真实酒馆/手机验收及视觉反馈分别记录，测试通过不替代这些验收。
- 当前按续加索引恢复本地补录；来源以外取值中已明确待批准的约定须先确认。`#balance` 仍暂缓，不升版本、构建、提交、推送或发布。可见预览此前按助手要求跳过，视觉及真实酒馆/手机未验收；本轮Node验证不替代这些验收。