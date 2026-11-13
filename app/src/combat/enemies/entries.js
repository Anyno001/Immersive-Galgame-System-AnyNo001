// 正式条目汇总；各来源模块在条目录入阶段逐批接入，不以占位技能补足来源缺口。
import { STS1_ACT1 } from './sts1-act1.js';
import { STS1_ACT2 } from './sts1-act2.js';
import { STS1_ACT3 } from './sts1-act3.js';
import { STS1_ACT4, STS1_EVENTS } from './sts1-late.js';
import { STS2_OVERGROWTH } from './sts2-overgrowth.js';
import { STS2_UNDERDOCKS } from './sts2-underdocks.js';
import { STS2_HIVE } from './sts2-hive.js';
import { STS2_GLORY } from './sts2-glory.js';
import { STS2_ELITES } from './sts2-elites.js';
import { STS2_BOSSES, STS2_EVENTS } from './sts2-late.js';

export const ENEMY_ENTRIES = Object.freeze([
    ...STS1_ACT1, ...STS1_ACT2, ...STS1_ACT3, ...STS1_ACT4, ...STS1_EVENTS,
    ...STS2_OVERGROWTH, ...STS2_UNDERDOCKS, ...STS2_HIVE, ...STS2_GLORY, ...STS2_ELITES,
    ...STS2_BOSSES, ...STS2_EVENTS,
]);
