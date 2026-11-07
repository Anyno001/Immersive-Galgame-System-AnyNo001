// 特质规则分文件：题材设定（ABO/哨向/蛋糕叉/兽人/吸血鬼/人鱼/契约）、存在、剧情。由 stat-traits.js 与 stat-trait-hooks.js 汇总，本文件不得 import stat-traits.js（避免循环）。
// SCALE：[特质键, 维度, 方向(up/down/cool/fade/jealous…), 系数, 条件(character, ctx)?]
// FLAG：[标记, 特质键, 条件?]；DAILY：[特质键, 维度, 数值]
// TAG_HOOKS：每楼事件钩子 (state, api) => state；DAILY_HOOKS：日结算钩子 (state, api) => state。api 见 stat-trait-hooks.js。
//
// 约定：
// - 双向特质（已标记、精神结合、认出蛋糕、伴侣印记、血契、主从契约）挂在 NPC 身上时，对方默认为主角。
// - 无法单凭特质认出「主人 / 向导 / 叉子」是谁时，按「持有对应特质的任一角色」认定（主角视为一直在场）。
// - 钩子读本楼结算已产生的变动记录（ctx.changes 中 source 为 tag 的条目）取实际增减量，再追加差额，不重算强度表。
// - 只改数值，不碰战斗与亲密对决的牌组、主导权、回合与牌效。
// - 未接：ABO 演出标签（igs-fx）与正文关键词都进不了数值结算（directives 只含 igs-stat 标签，ctx 不带正文），见交接汇报。
// 模块级代码不使用 import 的值（这些模块与 stat-traits.js 存在互相引用），导入项只在函数里用。
import { DIM_MAX, barsOf, clamp, withBars, withCharacter } from './stat-state.js';
import { shiftStress } from './stat-strain.js';
import { FAVOR_DELTA, FAVOR_WORDS } from './stat-vocab.js';

const HERO = '主角';
// 「明确喜欢」起点（与 stat-traits.js 的 LIKE_FROM 同值，不 import 以免循环）。
const LIKE = 26;
// 档位换算：压力、体力一小档 5、一大档 20；芥蒂一大档 10。
const STRESS_SMALL = 5;
const BIG_BAR = 20;
const GRUDGE_BIG = 10;
const DAILY_CREEP = 3;
const DISGUISE_CAP = 50;
const dimOf = (c, dim) => Number(c && c.dims && c.dims[dim]) || 0;

// ---- 静态倍率 ----
export const SCALE = [
    // 精神结合：信任上升加倍。
    ['精神结合', '信任', 'up', 2],
    // 信息素契合：欲望上升 ×1.5（安抚加倍需 ABO 演出标签，未接）。
    ['信息素契合', '欲望', 'up', 1.5],
    // 认出蛋糕：叉子对蛋糕好感过「喜欢」后转为守护，叉子对蛋糕信任上升加倍。
    ['认出蛋糕', '信任', 'up', 2, (c) => dimOf(c, '好感') >= LIKE],
    // 命定之人：好感上升 ×1.5。
    ['命定之人', '好感', 'up', 1.5],
];

// ---- 布尔效果 ----
export const FLAG = [
    // 双向状态：彼此好感不冷却。
    ['noCool', '已标记'],
    ['noCool', '精神结合'],
    ['noCool', '伴侣印记'],
    ['noCool', '血契'],
    // 命定之人：冷却不低于「明确喜欢」下限；好感未到 26 时不冷却，到了 26 以上冷却本就止于所在阶段下限。
    ['noCool', '命定之人', (c) => dimOf(c, '好感') < LIKE],
];

// ---- 每日固定加减 ----
export const DAILY = [
    // 诅咒：每天压力 +5；失去该特质即解咒。
    ['诅咒', '压力', 5],
];

// ---- 工具 ----
const npcsOf = (state) => Object.keys(state.characters);
const namesOf = (state) => [HERO, ...npcsOf(state)];
const withIds = (state, api, ids) => namesOf(state).filter((n) => ids.some((id) => api.has(state, n, id)));
const present = (api, name) => name === HERO || api.here.has(name);
const favorSign = (d) => (Object.hasOwn(FAVOR_WORDS, d.value) ? FAVOR_WORDS[d.value].sign : Math.sign(FAVOR_DELTA[d.value] || 0));

// 本楼结算已产生的变动量（只统计正文标签带来的）。dir>0 取上升量，dir<0 取下降量；note 给定时只取该备注。
function applied(ctx, name, key, dir, note) {
    return (ctx.changes || [])
        .filter((c) => c.source === 'tag' && c.target === name && c.key === key && (dir > 0 ? c.to > c.from : c.to < c.from) && (!note || c.note === note))
        .reduce((sum, c) => sum + Math.abs(c.to - c.from), 0);
}

// 改体力 / 压力（主角或 NPC）；压力走 shiftStress 以遵守压力转换规则；返回新 state，不原地改。
function shiftBar(state, name, key, delta, note, ctx) {
    if (!delta) return state;
    const hero = name === HERO;
    if (!hero && !state.characters[name]) return state;
    const bars = hero ? state.protagonist.bars : barsOf(state.characters[name]);
    const from = Number(bars[key]) || 0;
    const next = key === 'stress' ? shiftStress(bars, delta) : { ...bars, [key]: clamp(from + delta, 0, 100) };
    const to = Number(next[key]) || 0;
    if (to === from) return state;
    ctx.changes.push({ source: 'trait', target: name, key, from, to, note });
    return hero ? withBars(state, next) : withCharacter(state, name, { ...state.characters[name], bars: next });
}

// 本楼某角色压力上升达「大」及以上（主角为不带角色名的标签）。
const heavyUp = (api, name) => api.directives.some((d) => d.kind === 'stress' && d.value === '上升' && api.HEAVY.has(d.strength) && (name === HERO ? !d.target : d.target === name));

// 主角本楼与别的角色亲近：好感上升、亲密、约会 / 告白。
const closeToOther = (state, api, owner) => api.directives.some((d) => d.target && d.target !== owner && state.characters[d.target]
    && ((d.kind === 'favor' && favorSign(d) > 0) || d.kind === 'intimate' || (d.kind === 'event' && (d.value === '约会' || d.value === '告白'))));

// ---- 每楼钩子 ----

// 已标记（压力上升一大档）、伴侣印记（芥蒂上升一大档）：主角与他人亲近时，另一方（NPC）受影响。NPC 之间的亲近读不到。
function jealousBond(state, api) {
    for (const name of npcsOf(state)) {
        const marked = api.has(state, name, '已标记');
        const imprint = api.has(state, name, '伴侣印记');
        if ((!marked && !imprint) || !closeToOther(state, api, name)) continue;
        if (marked) state = shiftBar(state, name, 'stress', BIG_BAR, '已标记：另一方与他人亲近', api.ctx);
        if (imprint) state = api.bump(state, name, '芥蒂', GRUDGE_BIG, '伴侣印记：另一方与他人亲近');
    }
    return state;
}

// 体力消耗倍率：兽人 ×0.75、哨兵 ×0.5、式神 / 使魔在主人在场时 ×0.5（叠乘，夹在 0.5–2）。按本楼已扣的体力返还差额。
function staminaScale(state, api) {
    for (const name of namesOf(state)) {
        let factor = 1;
        if (api.has(state, name, '兽人')) factor *= 0.75;
        if (api.has(state, name, '哨兵')) factor *= 0.5;
        const servant = api.has(state, name, '式神') || api.has(state, name, '使魔');
        if (servant && withIds(state, api, ['契约者']).some((m) => m !== name && present(api, m))) factor *= 0.5;
        if (factor === 1) continue;
        factor = Math.max(0.5, factor);
        const spent = applied(api.ctx, name, 'stamina', -1);
        if (spent) state = shiftBar(state, name, 'stamina', Math.round(spent * (1 - factor)), '体力消耗修正', api.ctx);
    }
    return state;
}

// 哨兵：结合向导（双方都有精神结合、对方是向导）在场时压力不上升；战斗那一楼压力上升 ×1.5。
// 向导：与哨兵同在场那一楼，哨兵压力下降一大档。（「进行疏导时体力小降」需疏导关键词，未接。）
function sentinelGuide(state, api) {
    const guides = withIds(state, api, ['向导']);
    const battle = api.directives.some((d) => d.kind === 'battle');
    for (const s of withIds(state, api, ['哨兵'])) {
        const others = guides.filter((g) => g !== s && present(api, g));
        const bonded = others.some((g) => api.has(state, g, '精神结合') && api.has(state, s, '精神结合'));
        const up = applied(api.ctx, s, 'stress', 1);
        if (bonded) state = shiftBar(state, s, 'stress', -up, '结合向导在场', api.ctx);
        else if (battle && up) state = shiftBar(state, s, 'stress', Math.round(up * 0.5), '战斗场景', api.ctx);
        if (present(api, s) && others.length) state = shiftBar(state, s, 'stress', -BIG_BAR, '向导在场', api.ctx);
    }
    return state;
}

// 精神结合：一方压力上升「大」及以上时，另一方压力小升（NPC 与主角互为对方）。
function bondedStress(state, api) {
    for (const name of npcsOf(state)) {
        if (!api.has(state, name, '精神结合')) continue;
        if (heavyUp(api, HERO)) state = shiftBar(state, name, 'stress', STRESS_SMALL, '精神结合', api.ctx);
        if (heavyUp(api, name)) state = shiftBar(state, HERO, 'stress', STRESS_SMALL, '精神结合', api.ctx);
    }
    return state;
}

// 式神 / 使魔：任一主人（契约者）压力上升「大」及以上时，其压力同步小升。
function servantSync(state, api) {
    const masters = withIds(state, api, ['契约者']);
    for (const s of withIds(state, api, ['式神', '使魔'])) {
        if (masters.some((m) => m !== s && heavyUp(api, m))) state = shiftBar(state, s, 'stress', STRESS_SMALL, '主人压力同步', api.ctx);
    }
    return state;
}

// 蛋糕叉（主角为蛋糕、NPC 为叉子，或反之）：
// - 蛋糕：叉子在场时，叉子欲望上升加倍（本楼已涨的量再补一份）；
// - 叉子：进食回复体力减半；与蛋糕亲密那一楼体力回复一大档、压力下降一小档。
function cakeFork(state, api) {
    const heroCake = api.has(state, HERO, '蛋糕');
    for (const fork of withIds(state, api, ['叉子'])) {
        const eaten = applied(api.ctx, fork, 'stamina', 1, '进食');
        if (eaten) state = shiftBar(state, fork, 'stamina', -Math.floor(eaten / 2), '叉子尝不出味道', api.ctx);
        if (fork !== HERO && heroCake && api.here.has(fork)) {
            const gain = applied(api.ctx, fork, '欲望', 1);
            if (gain) state = api.bump(state, fork, '欲望', gain, '蛋糕：叉子在场');
        }
        const close = fork === HERO
            ? api.directives.some((d) => d.kind === 'intimate' && d.target && api.has(state, d.target, '蛋糕'))
            : heroCake && api.directives.some((d) => d.kind === 'intimate' && d.target === fork);
        if (close) {
            state = shiftBar(state, fork, 'stamina', BIG_BAR, '叉子与蛋糕亲密', api.ctx);
            state = shiftBar(state, fork, 'stress', -STRESS_SMALL, '叉子与蛋糕亲密', api.ctx);
        }
    }
    return state;
}

// 主从契约：信任不下降（本楼下降量补回）；从者（式神 / 使魔 / 血仆）对主人芥蒂上升减半。违约解除需剧情判定，未接。
function masterServantPact(state, api) {
    for (const name of npcsOf(state)) {
        if (!api.has(state, name, '主从契约')) continue;
        const drop = applied(api.ctx, name, '信任', -1);
        if (drop) state = api.bump(state, name, '信任', drop, '主从契约：信任不下降');
        if (['式神', '使魔', '血仆'].some((id) => api.has(state, name, id))) {
            const grudge = applied(api.ctx, name, '芥蒂', 1);
            if (grudge) state = api.bump(state, name, '芥蒂', -Math.floor(grudge / 2), '主从契约：芥蒂上升减半');
        }
    }
    return state;
}

// 失忆：获得时了解暂存后清零、好感保留；失去时了解恢复为暂存值与当前值中较高者。
// 自定义存处：character.relStates.失忆 = { stash }，有它表示「已处于失忆」；以它与当前特质的差异判定获得 / 失去，写入返回新对象。
const AMNESIA = '失忆';
function amnesia(state, api) {
    for (const name of npcsOf(state)) {
        const c = state.characters[name];
        if (!c || !c.dims) continue;
        const rel = c.relStates && typeof c.relStates === 'object' ? c.relStates : {};
        const has = api.has(state, name, '失忆');
        const mark = rel[AMNESIA];
        const know = dimOf(c, '了解');
        if (has && !mark) {
            if (know) api.ctx.changes.push({ source: 'trait', target: name, key: '了解', from: know, to: 0, note: '失忆' });
            state = withCharacter(state, name, { ...c, dims: { ...c.dims, 了解: 0 }, relStates: { ...rel, [AMNESIA]: { stash: know } } });
        } else if (!has && mark) {
            const to = clamp(Math.max(Number(mark.stash) || 0, know), -DIM_MAX, DIM_MAX);
            const { [AMNESIA]: gone, ...rest } = rel;
            const { relStates, ...body } = c;
            if (to !== know) api.ctx.changes.push({ source: 'trait', target: name, key: '了解', from: know, to, note: '恢复记忆' });
            state = withCharacter(state, name, { ...body, dims: { ...c.dims, 了解: to }, ...(Object.keys(rest).length ? { relStates: rest } : {}) });
        }
    }
    return state;
}

// 伪装身份：了解上限 50；失去（被揭穿）后不再封顶。
function disguiseCap(state, api) {
    for (const name of npcsOf(state)) {
        const know = dimOf(state.characters[name], '了解');
        if (know > DISGUISE_CAP && api.has(state, name, '伪装身份')) state = api.bump(state, name, '了解', DISGUISE_CAP - know, '伪装身份：了解上限');
    }
    return state;
}

export const TAG_HOOKS = [jealousBond, staminaScale, sentinelGuide, bondedStress, servantSync, cakeFork, masterServantPact, amnesia, disguiseCap];

// ---- 日结算钩子 ----

// 已故：冻结全部冷却与消退——把本次日结算对已故角色的好感、信任、了解、芥蒂、欲望变动按原值退回。
// 时间跳跃（settleSkip）不经日结算钩子，其冷却冻结需 stat-day 配合，见汇报。
const FROZEN_DIMS = new Set(['好感', '信任', '了解', '芥蒂', '欲望']);
function deceasedFreeze(state, api) {
    const logged = api.changes.slice();
    for (let i = logged.length - 1; i >= 0; i -= 1) {
        const c = logged[i];
        if (c.source !== 'daily' || !FROZEN_DIMS.has(c.key) || !api.has(state, c.target, '已故')) continue;
        const own = state.characters[c.target];
        if (!own || !own.dims || Number(own.dims[c.key]) !== c.to) continue;
        api.changes.push({ source: 'trait', target: c.target, key: c.key, from: c.to, to: c.from, note: '已故：冻结' });
        state = withCharacter(state, c.target, { ...own, dims: { ...own.dims, [c.key]: c.from } });
    }
    return state;
}

// 认出蛋糕：叉子在场、对蛋糕好感未到「喜欢」时，蛋糕（主角）压力缓升；到了「喜欢」转为守护，不再紧张。
function recognizedCake(state, api) {
    for (const name of npcsOf(state)) {
        if (!api.present.has(name) || !api.has(state, name, '认出蛋糕') || dimOf(state.characters[name], '好感') >= LIKE) continue;
        state = api.shiftStress(HERO, DAILY_CREEP, '认出蛋糕');
    }
    return state;
}

// 血仆：主人（持有吸血鬼的主角或在场角色）在场时每天压力下降。
function bloodServantRelief(state, api) {
    const masters = namesOf(state).filter((n) => api.has(state, n, '吸血鬼'));
    for (const name of npcsOf(state)) {
        if (!api.present.has(name) || !api.has(state, name, '血仆')) continue;
        if (masters.some((m) => m !== name && (m === HERO || api.present.has(m)))) state = api.shiftStress(name, -DAILY_CREEP, '主人在场');
    }
    return state;
}

export const DAILY_HOOKS = [deceasedFreeze, recognizedCake, bloodServantRelief];

// DICE：[特质键, 检定类别(社交/战斗/技术/敏捷/手工/学习/全部…), 奖惩骰数(+1 奖励 / -1 惩罚), 条件(character, ctx)?]
export const DICE = [];
