// 汇总各组规则文件。新增组只在这里登记。
import * as bond from './stat-trait-rules-bond.js';
import * as genre from './stat-trait-rules-genre.js';
import * as extreme from './stat-trait-rules-extreme.js';
import * as persona from './stat-trait-rules-persona.js';
import * as body from './stat-trait-rules-body.js';
import * as romance2 from './stat-trait-rules-romance2.js';
const PARTS = [bond, genre, extreme, persona, body, romance2];
export const EXT_SCALE = PARTS.flatMap((p) => p.SCALE);
export const EXT_FLAG = PARTS.flatMap((p) => p.FLAG);
export const EXT_DAILY = PARTS.flatMap((p) => p.DAILY);
export const EXT_TAG_HOOKS = PARTS.flatMap((p) => p.TAG_HOOKS);
export const EXT_DAILY_HOOKS = PARTS.flatMap((p) => p.DAILY_HOOKS);
export const EXT_DICE = PARTS.flatMap((p) => p.DICE);
