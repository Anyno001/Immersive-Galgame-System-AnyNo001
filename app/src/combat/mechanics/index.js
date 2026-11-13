// 规则 v5 机制登记入口：逐个导入 mechanics/ 下的机制文件，导入即登记。
// battle-state.js、rules.js、schema.js 引入本文件，任何战斗入口在校验、估值、结算之前都已完成登记。
// 机制文件只引用 registry.js，不引用其他战斗模块（引擎能力经 engineKit、估算能力经估算工具传入），避免循环依赖。
import './apply-status.js';
import './stat-shift.js';
import './attack-window.js';
import './guard.js';
import './drain.js';
import './pile.js';
import './energy.js';
import './status-cards.js';
import './battle-growth.js';
import './rampart.js';
import './forge.js';
import './shadow.js';
import './quarry.js';
import './sanctum.js';
import './cadence.js';
import './orb.js';
import './summon.js';
import './foe.js';
import './foe-units.js';
import './foe-seize.js';
import './foe-restrict.js';
// 敌人模板库：敌方特性状态与不行动 / 自毁 / 回复至 / 卸层算子（只限技能单位）。
import './foe-traits.js';
// 敌人模板 M6 新敌方特性（减速、时间扭曲、硬壳、缠绕等）。
import './foe-afflict.js';
// 敌人模板 M7 战斗外影响（盗金）。
import './foe-heist.js';
// 敌人模板 M7 二选一诅咒（只限本场，玩家亲自选）。
import './foe-curse.js';
import './inscription.js';
// 规则 v6 固定卡缺口算子（G2）。
import './fixed-tally.js';
import './fixed-pile.js';
// 规则 v6 计数被动（G5-1，原版遗物的每 N 次 / 每回合第一次 / 每场第一次）。
import './relic-counter.js';
// 规则 v6 卡牌操作（G5d，降费到打出、升级牌堆、复制消耗堆、扣减能量）。
import './relic-cards.js';
// 规则 v6 被动修正（G5c，出伤加值、易伤 / 虚弱倍率、失血减免与上限、首次格挡翻倍）。
import './relic-modify.js';
