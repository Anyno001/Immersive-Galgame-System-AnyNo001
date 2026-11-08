// 规则 v6 遗物表（G5f）的编写工具：遗物条目与原版 / 拆解两种模型。
// 原版模型：效果对照原版（战斗内为被动；战斗外按用途改写为 OFF_COMBAT_KINDS 之一），只用自有中文名与描述。
// 拆解模型：把原版效果改写成自有组合的战斗内被动。数据在同目录分组文件，汇总在 index.js；不写原版名称与文案。
import { op } from '../fixed-cards/dsl.js';

export { aoe, ap, blk, draw, energy, heal, op, rnd, st, when } from '../fixed-cards/dsl.js';

export const RELIC_TIERS = Object.freeze({ c: 'common', u: 'uncommon', r: 'rare', s: 'shop' });
export const RELIC_HOMES = Object.freeze({ t: 'trait', g: 'treasure' });
// 战斗外模型：胜利积分加成、卡牌加入卡组时、翻牌奖励、获得时一次性、每场开战给道具。
export const OFF_COMBAT_KINDS = Object.freeze(['win-points', 'card-added', 'flip', 'pickup', 'battle-item']);
const ANY_GROUPS = new Set(Object.keys(RELIC_TIERS));

const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
};

export const cnt = (mode, per, then) => op('counter', { mode, ...(per ? { per } : {}), then });
export const mod = (name, amount, filters = {}) => op('relic-mod', { mod: name, ...(amount === undefined ? {} : { amount }), ...filters });
export const next = (gain, amount) => op('next-turn', { gain, amount });
export const tg = (source, per, amount = 0) => op('tally-guard', { amount, source, per });
export const th = (source, per, amount = 0) => op('tally-heal', { amount, source, per });
export const rc = (amount, fields = {}) => op('random-card', { amount, ...fields });
export const loseEnergy = (amount) => op('lose-energy', { amount, timing: 'now' });

// 战斗内模型：触发器、效果（1–3 个）、描述，可带被动过滤字段（cardType / status / cause / orb）。
export const P = (trigger, effects, text, filter = {}) => ({ trigger, ...filter, effects, text });
// 战斗外模型：kind 取 OFF_COMBAT_KINDS，其余为该用途的参数。
export const X = (kind, params, text) => ({ kind, ...params, text });

// 一行遗物：分组（通用按稀有度 c/u/r/s，职业专属为职业原型）、编号、自有中文名、稀有度、归属（t 人物特性 / g 宝物）、原版模型、拆解模型。
// approx：原版模型受本项目机制所限与原版有出入（逐件见设计缓存）。
export function relic(group, no, name, tier, home, original, split, flags = {}) {
    return deepFreeze({
        id: `rl-${group}-${String(no).padStart(2, '0')}`, name, tier: RELIC_TIERS[tier], home: RELIC_HOMES[home],
        pool: ANY_GROUPS.has(group) ? 'any' : group, original, split, ...(flags.approx ? { approx: true } : {}),
    });
}
