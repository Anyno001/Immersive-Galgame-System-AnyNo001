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
