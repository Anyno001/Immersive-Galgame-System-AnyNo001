// 特质规则分文件（E2a）：通用技能向、世界观职业、二次元人设、无神论者。
// 由 stat-trait-rules.js 汇总；本文件不得 import stat-traits.js（避免循环），只改数值，不碰战斗与亲密对决规则，不注入正文、不加标签。
// 检定奖惩骰的类别名（医疗、认路、动物、灵异、术法）由 stat-trait-dice.js 的 diceCategories 给出。
// 状态读取统一走 stat-status.js 的 hasStatus。
// 公众人物：声望条正由声望重做批改写，本批不读不改 stat-fame.js，不做「归属于自己的声望条」判断，只做不依赖声望的数值效果。
import { barsOf, withBars, withCharacter } from './stat-state.js';
import { hookGrudge } from './stat-habit.js';
import { shiftStress } from './stat-strain.js';
import { calcRow, getStatusDef, withCalc } from './stat-status-defs.js';
import { applyStatusChange, hasStatus } from './stat-status.js';

const HERO = '主角';
// 一小档与每日缓变量：压力小档 5、日结算 3、好感小档 2、信任小档 1、欲望小档 2、大档 4。
const STRESS_SMALL = 5;
const STRESS_DAY = 3;
const FAVOR_SMALL = 2;
const TRUST_SMALL = 1;
const DESIRE_SMALL = 2;
const DESIRE_BIG = 4;
const GRUDGE_SMALL = 2;
// 动物系性格全集（龙族是出身，不算）。
const ANIMALS = Object.freeze(['犬系', '猫系', '狐系', '兔系', '狼系', '熊系', '蛇系', '鹰系', '鹿系', '鸟系', '龙系']);
// 抗体携带者免疫的状态；感染在定义表里叫「感染初期」。
const IMMUNE_STATUS = Object.freeze(['感冒', '感染初期', '中毒']);
// 大器晚成：技能值低于 30 惩罚、达到 60 奖励。
const SKILL_LOW = 30;
const SKILL_HIGH = 60;
const heroOnly = (c) => !c;

export const SCALE = [
    ['爱哭鬼', '压力', 'up', 1.5],
    ['抗体携带者', '压力', 'up', 0.75],
    ['御姐', '好感', 'up', 0.8],
    ['吐槽役', '压力', 'up', 0.75],
    ['圣女', '欲望', 'up', 0.5],
    ['魔王', '信任', 'up', 0.5],
    ['公众人物', '了解', 'up', 1.5],
    ['大小姐', '好感', 'up', 0.8],
];
export const FLAG = [];
export const DAILY = [];

// DICE：自身技能类只对主角本人生效（heroOnly）；御姐的社交惩罚只对「主角对其」的检定生效。
export const DICE = [
    ['医术', '医疗', 1, heroOnly],
    ['路痴', '认路', -1, heroOnly],
    ['方向感强', '认路', 1, heroOnly],
    ['手巧', '手工', 1, heroOnly],
    ['动物缘', '动物', 1, heroOnly],
    ['灵觉', '灵异', 1, heroOnly],
    ['属性亲和', '术法', 1, heroOnly],
    ['魔王', '战斗', 1, heroOnly],
    ['义体改造', '战斗', 1, heroOnly],
    ['义体改造', '技术', 1, heroOnly],
    ['义体改造', '社交', -1, heroOnly],
    ['中二病', '社交', -1, heroOnly],
    ['御姐', '社交', -1, (c) => Boolean(c)],
    ['大器晚成', '全部', -1, (c, ctx) => !c && Boolean(ctx) && Number(ctx.skillValue) > 0 && Number(ctx.skillValue) < SKILL_LOW],
    ['大器晚成', '全部', 1, (c, ctx) => !c && Boolean(ctx) && Number(ctx.skillValue) >= SKILL_HIGH],
];

// ---- 小工具：全部返回新 state，不原地改；变动带 calc 明细与特质小标签 ----
const known = (state, name) => name === HERO || Boolean(state.characters[name]);

function moveStress(state, name, delta, note, changes, source) {
    if (!delta || !known(state, name)) return state;
    const hero = name === HERO;
    const cur = hero ? null : state.characters[name];
    const bars = hero ? state.protagonist.bars : barsOf(cur);
    const moved = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(moved.stress) || 0;
    if (to === from) return state;
    changes.push(withCalc({ source, target: name, key: 'stress', from, to, note }, { calc: [calcRow('来源', note), calcRow('基础量', delta), calcRow('结果', to - from)], traitTags: [note] }));
    return hero ? withBars(state, moved) : withCharacter(state, name, { ...cur, bars: moved });
}

// 好感、信任、芥蒂、欲望：走 api.bump（守好感关口与欲望维度），再给刚写入的那条补明细。
function bumpDim(api, state, name, dim, amount, note) {
    const changes = api.ctx.changes;
    const at = changes.length;
    const next = api.bump(state, name, dim, amount, note);
    if (changes.length > at) {
        const c = changes[at];
        changes[at] = withCalc(c, { calc: [calcRow('来源', note), calcRow('基础量', amount), calcRow('结果', c.to - c.from)], traitTags: [note] });
    }
    return next;
}

// 本楼战斗、挑战的结果。
function outcomesOf(ctx) {
    const out = [];
    for (const e of Array.isArray(ctx.events) ? ctx.events : []) {
        if (!e) continue;
        if (e.kind === 'battle') out.push({ battle: true, win: e.outcome !== '败' && e.outcome !== '撤', fail: e.outcome === '败' });
        else if (e.kind === 'challenge') out.push({ battle: false, win: e.outcome === '圆满' || e.outcome === '勉强', fail: e.outcome === '失败' });
    }
    return out;
}

const tagMoves = (ctx, name, key, up) => ctx.changes.filter((c) => c.source === 'tag' && c.target === name && c.key === key && (up ? c.to > c.from : c.to < c.from));
const sumMove = (list) => list.reduce((s, c) => s + Math.abs(c.to - c.from), 0);
const FORCED = new Set(['被迫', '被支配']);

// ---- 每楼钩子 ----
function e2aTags(state, api) {
    const { ctx, directives, here } = api;
    const reviews = (Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents : []).filter((e) => e && e.type && e.name);
    const outs = outcomesOf(ctx);
    const battleWin = outs.some((o) => o.battle && o.win);
    const hurt = api.heroHurt(directives);
    const bigStress = api.heroBigStress(directives);
    const forcedUp = directives.some((d) => d.kind === 'stress' && !d.target && d.value === '上升' && FORCED.has(d.source));
    const stressUps = (name) => directives.filter((d) => d.kind === 'stress' && d.value === '上升' && (name === HERO ? !d.target : d.target === name));
    const snapshot = ctx.changes.slice();
    let next = state;
    const has = (name, id) => api.has(next, name, id);
    const reviewed = (name, type) => reviews.some((e) => e.type === type && e.name === name);
    for (const name of [HERO, ...Object.keys(next.characters)]) {
        const hero = name === HERO;
        const near = hero || here.has(name);
        // 医术：主角受伤时其在场，主角压力小降。
        if (!hero && near && hurt && has(name, '医术')) next = moveStress(next, HERO, -STRESS_SMALL, '医术', ctx.changes, 'trait');
        // 勇者：战斗取胜那一楼其压力小降；同伴（主角挂时为在场角色，NPC 挂时为其自身）对主角信任小升。
        if (near && battleWin && has(name, '勇者')) {
            next = moveStress(next, name, -STRESS_SMALL, '勇者', ctx.changes, 'trait');
            for (const mate of hero ? [...here].filter((n) => next.characters[n]) : [name]) next = bumpDim(api, next, mate, '信任', TRUST_SMALL, '勇者');
        }
        // 圣职者：主角压力上升「大」及以上时其在场，主角压力额外小降；被质疑信仰那一楼自身压力小升。
        if (!hero && near && bigStress && has(name, '圣职者')) next = moveStress(next, HERO, -STRESS_SMALL, '圣职者', ctx.changes, 'trait');
        if (!hero && has(name, '圣职者') && reviewed(name, '信仰质疑')) next = moveStress(next, name, STRESS_SMALL, '圣职者', ctx.changes, 'trait');
        // 中二病：主角战斗或挑战取胜压力小降、失败压力小升。
        if (hero && has(name, '中二病')) for (const o of outs) next = moveStress(next, HERO, o.win ? -STRESS_SMALL : o.fail ? STRESS_SMALL : 0, '中二病', ctx.changes, 'trait');
        // 大小姐：被批评那一楼压力小升。
        if (!hero && has(name, '大小姐') && reviewed(name, '批评')) next = moveStress(next, name, STRESS_SMALL, '大小姐', ctx.changes, 'trait');
        // 爱哭鬼：压力上升「大」及以上那一楼，哭过之后压力小降。
        if (has(name, '爱哭鬼') && stressUps(name).some((d) => api.HEAVY.has(d.strength))) next = moveStress(next, name, -STRESS_SMALL, '爱哭鬼', ctx.changes, 'trait');
        // 兄弟姐妹控（只对亲人有效）：主角挂时看「亲人」角色，角色挂时看其本身是否是主角的亲人。
        if (has(name, '兄弟姐妹控')) {
            const kin = hero ? Object.keys(next.characters).filter((n) => has(n, 'kin')) : has(name, 'kin') ? [name] : [];
            for (const n of kin) {
                for (const c of snapshot) if (c.source === 'tag' && c.target === n && (c.key === '好感' || c.key === '信任') && c.to > c.from) next = bumpDim(api, next, n, c.key, c.key === '好感' ? FAVOR_SMALL : TRUST_SMALL, '兄弟姐妹控');
                if (hero ? stressUps(n).length : hurt || bigStress) next = moveStress(next, name, STRESS_SMALL, '兄弟姐妹控', ctx.changes, 'trait');
            }
        }
        // 动物缘：主角挂时，有动物系性格的角色本楼信任上升的，再补一小档。
        if (hero && has(name, '动物缘')) {
            for (const c of snapshot) if (c.source === 'tag' && c.key === '信任' && c.to > c.from && next.characters[c.target] && ANIMALS.some((a) => has(c.target, a))) next = bumpDim(api, next, c.target, '信任', TRUST_SMALL, '动物缘');
        }
        // 无神论者：信仰质疑那一楼，本楼标签带来的好感、信任下降，芥蒂、压力上升全部退回。事件词表里信仰类只有「信仰质疑」，没有更细的分类。
        if (!hero && has(name, '无神论者') && reviewed(name, '信仰质疑')) {
            for (const key of ['好感', '信任']) { const lost = sumMove(tagMoves(ctx, name, key, false)); if (lost) next = bumpDim(api, next, name, key, lost, '无神论者'); }
            const grudge = sumMove(tagMoves(ctx, name, '芥蒂', true));
            if (grudge) next = bumpDim(api, next, name, '芥蒂', -grudge, '无神论者');
            const stress = sumMove(tagMoves(ctx, name, 'stress', true));
            if (stress) next = moveStress(next, name, -stress, '无神论者', ctx.changes, 'trait');
        }
        // 女王：主角被迫、被支配那一楼其在场为顺从，好感小升；主角拒绝其为违逆，芥蒂小升。
        // 合成「女王様」（仅 NSFW）：顺从那一楼其欲望上升一大档；违逆改为欲望小升、不记芥蒂。
        if (!hero && has(name, '女王')) {
            const queen = has(name, 'combo:女王様');
            if (near && forcedUp) {
                next = bumpDim(api, next, name, '好感', FAVOR_SMALL, '女王');
                if (queen) next = bumpDim(api, next, name, '欲望', DESIRE_BIG, '女王様');
            }
            if (reviewed(name, '拒绝')) next = queen ? bumpDim(api, next, name, '欲望', DESIRE_SMALL, '女王様') : bumpDim(api, next, name, '芥蒂', hookGrudge(ctx, name, '拒绝', GRUDGE_SMALL), '女王');
        }
        // 御姐：主角压力上升「大」及以上那一楼其在场，主角压力额外小降（照顾）。
        if (!hero && near && bigStress && has(name, '御姐')) next = moveStress(next, HERO, -STRESS_SMALL, '御姐', ctx.changes, 'trait');
        // 抗体携带者：感冒、感染、中毒挂上即摘下。
        if (ctx.statusBox && ctx.statusBox.cat && has(name, '抗体携带者')) {
            for (const key of IMMUNE_STATUS) {
                if (!getStatusDef(key) || !hasStatus(next, ctx.statusBox.cat, name, key)) continue;
                const r = applyStatusChange(ctx.statusBox.cat, name, key, { on: false, src: 'system' });
                ctx.statusBox.cat = r.catalog;
                ctx.changes.push(...r.changes.map((c) => withCalc(c, { traitTags: ['抗体携带者'] })));
            }
        }
    }
    return next;
}
export const TAG_HOOKS = [e2aTags];

// ---- 日结算钩子 ----
// 魔王（同场其他人压力缓升）、圣女（缓降）、灵觉（与鬼同场压力缓升）、吐槽役（主角压力缓降）、公众人物（有人同场被围观，压力缓升）。
function e2aDaily(state, api) {
    const { changes, present } = api;
    const has = (name, id) => api.has(state, name, id);
    const crowd = [HERO, ...[...present].filter((n) => state.characters[n])];
    let next = state;
    for (const name of crowd) {
        const others = crowd.filter((n) => n !== name);
        if (has(name, '魔王')) for (const o of others) next = moveStress(next, o, STRESS_DAY, '魔王', changes, 'daily');
        if (has(name, '圣女')) for (const o of others) next = moveStress(next, o, -STRESS_DAY, '圣女', changes, 'daily');
        if (has(name, '灵觉') && others.some((o) => has(o, '鬼'))) next = moveStress(next, name, STRESS_DAY, '灵觉', changes, 'daily');
        if (name !== HERO && has(name, '吐槽役')) next = moveStress(next, HERO, -STRESS_DAY, '吐槽役', changes, 'daily');
        if (has(name, '公众人物') && others.length) next = moveStress(next, name, STRESS_DAY, '公众人物', changes, 'daily');
    }
    return next;
}
export const DAILY_HOOKS = [e2aDaily];
