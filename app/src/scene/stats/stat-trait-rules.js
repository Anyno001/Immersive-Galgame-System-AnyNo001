// 汇总各组规则文件。新增组只在这里登记。
import * as bond from './stat-trait-rules-bond.js';
import * as genre from './stat-trait-rules-genre.js';
import * as extreme from './stat-trait-rules-extreme.js';
import * as persona from './stat-trait-rules-persona.js';
import * as body from './stat-trait-rules-body.js';
import * as romance2 from './stat-trait-rules-romance2.js';
import * as review from './stat-trait-rules-review.js';
import * as e2b from './stat-trait-rules-e2b.js';
import * as e2a from './stat-trait-rules-e2a.js';
import * as fixup from './stat-trait-rules-fixup.js';
const PARTS = [bond, genre, extreme, persona, body, romance2, review, e2b, e2a, fixup];
export const EXT_SCALE = PARTS.flatMap((p) => p.SCALE);
export const EXT_FLAG = PARTS.flatMap((p) => p.FLAG);
export const EXT_DAILY = PARTS.flatMap((p) => p.DAILY);
export const EXT_TAG_HOOKS = PARTS.flatMap((p) => p.TAG_HOOKS);
export const EXT_DAILY_HOOKS = PARTS.flatMap((p) => p.DAILY_HOOKS);
export const EXT_DICE = PARTS.flatMap((p) => p.DICE);
