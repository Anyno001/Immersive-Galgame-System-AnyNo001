// 特质规则分文件（补漏）：登记了却没有效果的特质、没有专属结算的合成、说明里写了却没做的子效果。
// 由 stat-trait-rules.js 汇总，排在其他规则文件之后，所以可以读它们已经写进 ctx.changes 的变动并抵消或补差额。
// 本文件不得 import stat-traits.js（避免循环），只改数值，不碰战斗与亲密对决的牌组、主导权、回合与牌效。
// 合成读 api.has(state, 名, 'combo:合成名')；读不到的环境（地点、时间、声望条）一律静默不生效。
import { FAVOR_GATES, gateKey } from './stat-vocab.js';
import { fameValue } from './stat-fame.js';
import { hookGrudge } from './stat-habit.js';
import { barsOf, clamp, withBars, withCharacter, withClock } from './stat-state.js';
import { calcRow, getStatusDef, withCalc } from './stat-status-defs.js';
import { applyStatusChange, hasStatus } from './stat-status.js';
import { shiftStress, stressLimitActive, strainTypeOf } from './stat-strain.js';
import { FAVOR_DELTA, FAVOR_WORDS, START_DIMS, START_RELATIONS } from './stat-vocab.js';

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];

const HERO = '主角';
const HEART = 51;
const HALF = 50;
const STRESS_SMALL = 5;
const STRESS_BIG = 20;
const STRESS_DAY = 3;
const FAVOR_SMALL = 2;
const TRUST_SMALL = 1;
const DESIRE_BIG = 4;
const GRUDGE_SMALL = 2;
const STAMINA_SMALL = 5;
const STAMINA_SHARE = 20;
const MARK = 80;
// 一种「每天一次」的小记录：clock.fixupDays = { 键: 日期 }。
const KEEP = 'fixupDays';
const num = (v) => Number(v) || 0;
const dimOf = (c, dim) => num(c && c.dims && c.dims[dim]);
const WATER = /水|海|湖|河|溪|泳|潜|岸|港|池|浪/;
const DAYLIGHT = /白天|白日|白昼|清晨|早晨|上午|中午|正午|午后|下午|晴|阳光|烈日|日光|骄阳/;
const NIGHT = /夜|晚|黑暗|深夜|凌晨/;
const COLD_WORDS = new Set(['冷淡', '嫌弃', '失望', '反感']);
const TECH = new Set(['电脑', '开锁', '修理', '查资料', '伪造', '鉴定']);
export const TECH_SKILLS = TECH;
const DRINK = /喝酒|酒量|拼酒|对饮/;
const CARE = /照顾|看护|护理|医术|治疗|包扎|急救/;
const FORCED = new Set(['被迫', '被支配']);

const favorSign = (d) => (Object.hasOwn(FAVOR_WORDS, d.value) ? FAVOR_WORDS[d.value].sign : Math.sign(FAVOR_DELTA[d.value] || 0));
const undone = new WeakSet();

// ---- 小工具：全部返回新 state，不原地改 ----
const known = (state, name) => name === HERO || Boolean(state.characters[name]);
const barsFor = (state, name) => (name === HERO ? state.protagonist.bars : barsOf(state.characters[name]));
const putBars = (state, name, bars) => (name === HERO ? withBars(state, bars) : withCharacter(state, name, { ...state.characters[name], bars }));
const putField = (state, name, patch) => (state.characters[name] ? withCharacter(state, name, { ...state.characters[name], ...patch }) : state);
const holdersOf = (state, api, id) => [HERO, ...Object.keys(state.characters)].filter((n) => api.has(state, n, id));
const comboHolders = (state, api, combo) => Object.keys((api.cat && api.cat.traits) || {}).filter((n) => known(state, n) && api.has(state, n, `combo:${combo}`));

function moveBar(state, name, key, delta, note, changes, source = 'trait') {
    if (!delta || !known(state, name)) return state;
    const bars = barsFor(state, name);
    const from = num(bars[key]);
    const moved = key === 'stress' ? shiftStress(bars, delta) : { ...bars, [key]: key === 'stamina' ? clamp(from + delta, 0, 100) : from + delta };
    const to = num(moved[key]);
    if (to === from) return state;
    changes.push(withCalc({ source, target: name, key, from, to, note }, { calc: [calcRow('来源', note), calcRow('基础量', delta), calcRow('结果', to - from)], traitTags: [note] }));
    return putBars(state, name, moved);
}

// 好感、信任、芥蒂、欲望、了解直接加减（好感上升不越过未解锁的关口）。
function moveDim(state, name, dim, delta, note, changes, source = 'trait') {
    const cur = state.characters[name];
    if (!cur || !cur.dims || !delta || (dim === '欲望' && !Object.hasOwn(cur.dims, '欲望'))) return state;
    const from = dimOf(cur, dim);
    let to = clamp(from + delta, dim === '欲望' ? 0 : -100, 100);
    if (dim === '好感' && delta > 0) for (const gate of FAVOR_GATES) if (from <= gate && to > gate && !(cur.unlocked || []).includes(gateKey(gate))) { to = gate; break; }
    if (to === from) return state;
    changes.push(withCalc({ source, target: name, key: dim, from, to, note }, { calc: [calcRow('来源', note), calcRow('基础量', delta), calcRow('结果', to - from)], traitTags: [note] }));
    return withCharacter(state, name, { ...cur, dims: { ...cur.dims, [dim]: to } });
}

// 本楼某角色某维度、尚未抵消的变动（指定来源）。
const moves = (changes, name, key, pred = () => true, sources = ['tag']) => changes.filter((c) => c.target === name && c.key === key && sources.includes(c.source) && !undone.has(c) && pred(c));
const rise = (c) => num(c.to) > num(c.from);
const fall = (c) => num(c.to) < num(c.from);
const amountOf = (c) => num(c.to) - num(c.from);

// 把某批变动原路退回。
function undoAll(state, changes, name, key, list, note) {
    let next = state;
    for (const c of list) {
        undone.add(c);
        if (key === 'stress' || key === 'stamina' || key === 'money') next = moveBar(next, name, key, -amountOf(c), note, changes);
        else next = moveDim(next, name, key, -amountOf(c), note, changes);
    }
    return next;
}

const eventsOf = (ctx) => (Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents.filter((e) => e && e.type && e.name) : []);
const reviewed = (ctx, name, type) => eventsOf(ctx).some((e) => e.type === type && e.name === name);
const outcomes = (ctx) => (Array.isArray(ctx.events) ? ctx.events : []);

// 每天一次：返回新 state，当天已记过返回 null。
function once(state, key) {
    const map = state.clock[KEEP] && typeof state.clock[KEEP] === 'object' ? state.clock[KEEP] : {};
    if (map[key] === state.clock.day) return null;
    return withClock(state, { [KEEP]: { ...map, [key]: state.clock.day } });
}

// 主角与他人亲近：好感类正向标签、亲密、约会告白。
const closeToOther = (state, api, owner) => api.directives.some((d) => d.target && d.target !== owner && state.characters[d.target]
    && ((d.kind === 'favor' && favorSign(d) > 0) || d.kind === 'intimate' || (d.kind === 'event' && (d.value === '约会' || d.value === '告白'))));

// 摘下状态：定义表里没有的状态不动。
function purgeStatus(state, api, name, keys, note) {
    const box = api.ctx.statusBox;
    if (!box || !box.cat) return;
    for (const key of keys) {
        if (!getStatusDef(key) || !hasStatus(state, box.cat, name, key)) continue;
        const r = applyStatusChange(box.cat, name, key, { on: false, src: 'system' });
        box.cat = r.catalog;
        api.ctx.changes.push(...r.changes.map((c) => withCalc(c, { traitTags: [note] })));
    }
}

// 起始关系档的下一档（最高到 cap）。
const nextTier = (rel, cap = '恋人') => {
    const at = START_RELATIONS.indexOf(rel);
    const top = START_RELATIONS.indexOf(cap);
    return at < 0 || at >= top ? null : START_RELATIONS[at + 1];
};

// 起始关系那一楼新建档的角色：{ 名, 起始档 }。
function startedOf(ctx) {
    const out = new Map();
    for (const c of ctx.changes) {
        if (c.source !== 'tag' || c.key !== '好感' || num(c.from) !== 0 || !String(c.note || '').startsWith('起始关系·')) continue;
        out.set(c.target, String(c.note).slice('起始关系·'.length).split('+')[0]);
    }
    return out;
}

// 把角色的起始数值提到某档预设（只往上提），好感同时补开关口。
function lift(state, name, tier, keys, note, changes) {
    const preset = START_DIMS[tier];
    const cur = state.characters[name];
    if (!preset || !cur) return state;
    let next = state;
    const dims = { ...cur.dims };
    for (const key of keys) {
        const to = num(preset[key]);
        const from = dimOf(cur, key);
        if (to <= from) continue;
        dims[key] = to;
        changes.push({ source: 'trait', target: name, key, from, to, note });
    }
    const gates = dims.好感 > dimOf(cur, '好感') ? FAVOR_GATES.filter((g) => g < dims.好感).map(gateKey) : [];
    next = withCharacter(next, name, { ...cur, dims, unlocked: [...new Set([...(cur.unlocked || []), ...gates])] });
    return next;
}

// ---- 每楼钩子 ----
function startHook(state, api) {
    const { ctx } = api;
    let next = state;
    // 万人迷（主角合成）：新登场角色起始关系高一档（最高到「亲密」）。青梅竹马：开局了解高一档。
    const fans = comboHolders(next, api, '万人迷').includes(HERO);
    for (const [name, rel] of startedOf(ctx)) {
        if (!next.characters[name]) continue;
        if (fans) { const up = nextTier(rel, '亲密'); if (up) next = lift(next, name, up, ['好感', '信任', '了解'], '万人迷', ctx.changes); }
        if (api.has(next, name, '青梅竹马')) { const up = nextTier(rel); if (up) next = lift(next, name, up, ['了解'], '青梅竹马', ctx.changes); }
    }
    // 大佬、富二代（主角）：开局金钱高一档，一次（加一份「普通」档金额）。
    if ((api.has(next, HERO, '大佬') || api.has(next, HERO, '富二代')) && !next.clock.startMoneyDone && num(next.clock.day) <= 1) {
        const table = ctx.moneyTable || {};
        next = withClock(moveBar(next, HERO, 'money', num(table.普通) || 100, api.has(next, HERO, '大佬') ? '大佬·开局' : '富二代·开局', ctx.changes), { startMoneyDone: true });
    }
    return next;
}

// 登记了却没有效果的特质：花心、控制狂、百毒不侵、酒仙、地头蛇、口嫌体正直、贤惠。
function deadTraitHook(state, api) {
    const { ctx, here } = api;
    let next = state;
    const place = String(ctx.place || '').trim().slice(0, 30);
    const heroStaminaGain = ctx.changes.filter((c) => c.target === HERO && c.key === 'stamina' && c.source === 'tag' && c.note === '进食' && rise(c));
    for (const name of Object.keys(next.characters)) {
        const has = (id) => api.has(next, name, id);
        const cur = () => next.characters[name];
        // 花心：与另一名角色好感同在「心动」以上时，其好感上升补一半（×1.5）。
        if (has('花心') && dimOf(cur(), '好感') >= HEART && Object.keys(next.characters).some((n) => n !== name && dimOf(next.characters[n], '好感') >= HEART)) {
            const gain = moves(ctx.changes, name, '好感', rise).reduce((s, c) => s + amountOf(c), 0);
            if (gain > 0) next = moveDim(next, name, '好感', Math.max(1, Math.round(gain * 0.5)), '花心', ctx.changes);
        }
        // 控制狂：主角顺从（被迫、被支配）那一楼好感小升；主角拒绝其那一楼芥蒂小升。
        if (has('控制狂')) {
            if (here.has(name) && api.directives.some((d) => d.kind === 'stress' && !d.target && d.value === '上升' && FORCED.has(d.source))) next = moveDim(next, name, '好感', FAVOR_SMALL, '控制狂', ctx.changes);
            if (reviewed(ctx, name, '拒绝')) next = moveDim(next, name, '芥蒂', hookGrudge(ctx, name, '拒绝', GRUDGE_SMALL), '控制狂', ctx.changes);
        }
        // 口嫌体正直：其被拒绝的那一楼，欲望不降反小升。
        if (has('口嫌体正直') && reviewed(ctx, name, '拒绝')) {
            next = undoAll(next, ctx.changes, name, '欲望', moves(ctx.changes, name, '欲望', fall), '口嫌体正直');
            next = moveDim(next, name, '欲望', FAVOR_SMALL, '口嫌体正直', ctx.changes);
        }
        // 地头蛇：常驻地点取其首次在场的地点；在常驻地点压力不上升、他人对其芥蒂上升减半；离开常驻地点那一楼压力小升。
        if (has('地头蛇') && place && here.has(name)) {
            const home = cur().homePlace;
            if (!home) next = putField(next, name, { homePlace: place, lastPlace: place });
            else if (home === place) {
                next = undoAll(next, ctx.changes, name, 'stress', moves(ctx.changes, name, 'stress', rise, ['tag', 'battle', 'daily']), '地头蛇');
                for (const c of moves(ctx.changes, name, '芥蒂', rise)) next = moveDim(next, name, '芥蒂', -Math.floor(amountOf(c) / 2), '地头蛇', ctx.changes);
                next = putField(next, name, { lastPlace: place });
            } else {
                if (cur().lastPlace === home) next = moveBar(next, name, 'stress', STRESS_SMALL, '地头蛇', ctx.changes);
                next = putField(next, name, { lastPlace: place });
            }
        }
        // 贤惠：其在场时，主角进食回复体力略多。
        if (has('贤惠') && here.has(name)) for (const c of heroStaminaGain) next = moveBar(next, HERO, 'stamina', STAMINA_SMALL, '贤惠', ctx.changes);
    }
    // 百毒不侵：宿醉、中毒挂上即摘下；酒仙：宿醉挂上即摘下（下一楼起生效）。
    for (const name of [HERO, ...Object.keys(next.characters)]) {
        if (api.has(next, name, '百毒不侵')) purgeStatus(next, api, name, ['中毒', '宿醉'], '百毒不侵');
        if (api.has(next, name, '酒仙')) purgeStatus(next, api, name, ['宿醉'], '酒仙');
        if (api.has(next, name, '蛇妖')) purgeStatus(next, api, name, ['中毒'], '蛇妖');
    }
    return next;
}

// 说明里写了没做的子效果：冷血、厌战、腹黑、小笨蛋、公众人物的数据标记等。
function subEffectHook(state, api) {
    const { ctx, here, directives } = api;
    let next = state;
    const info = ctx.checkInfo || null;
    for (const name of Object.keys(next.characters)) {
        const has = (id) => api.has(next, name, id);
        // 冷血：共患难事件好感上升减半。
        if (has('冷血') && directives.some((d) => d.kind === 'event' && d.value === '共患难' && d.target === name)) {
            for (const c of moves(ctx.changes, name, '好感', rise)) next = moveDim(next, name, '好感', -Math.floor(amountOf(c) / 2), '冷血', ctx.changes);
        }
        // 腹黑：主角对其了解未过半时，角色卡好感记为隐藏（只写数据标记，显示交给界面）。
        if (has('腹黑')) {
            const cur = next.characters[name];
            const hidden = (ctx.heroSide && cur.hero && cur.hero.dims ? num(cur.hero.dims.了解) : dimOf(cur, '了解')) <= HALF;
            if (Boolean(next.characters[name].favorHidden) !== hidden) {
                const { favorHidden, ...rest } = next.characters[name];
                next = withCharacter(next, name, hidden ? { ...rest, favorHidden: true } : rest);
            }
        }
        // 小笨蛋：主角对其发起的检定失败时，其对主角好感小升；笨蛋美人再小升一档。
        if (info && info.target === name && info.success === false) {
            if (has('小笨蛋')) next = moveDim(next, name, '好感', FAVOR_SMALL, '小笨蛋', ctx.changes);
            if (api.has(next, name, 'combo:笨蛋美人')) next = moveDim(next, name, '好感', FAVOR_SMALL, '笨蛋美人', ctx.changes);
        }
        // 病美人：主角照顾其（照顾、医术类检定或技能成长）那一楼，其好感、信任各小升。
        if (api.has(next, name, 'combo:病美人')) {
            const cared = (info && info.target === name && CARE.test(String(info.skill || ''))) || directives.some((d) => d.kind === 'grow' && d.target === name && CARE.test(String(d.skill || '')));
            if (cared) { next = moveDim(next, name, '好感', FAVOR_SMALL, '病美人', ctx.changes); next = moveDim(next, name, '信任', TRUST_SMALL, '病美人', ctx.changes); }
        }
    }
    // 厌战（主角）：挑战圆满或和解事件，压力下降一大档。
    if (api.has(next, HERO, '厌战') && (outcomes(ctx).some((e) => e && e.kind === 'challenge' && e.outcome === '圆满') || (Array.isArray(ctx.bondEvents) && ctx.bondEvents.some((e) => e && e.type === '和解')))) {
        next = moveBar(next, HERO, 'stress', -STRESS_BIG, '厌战·化解冲突', ctx.changes);
    }
    void here;
    return next;
}

// 合成：状态、好感、压力类。
function comboHook(state, api) {
    const { ctx, here, directives } = api;
    let next = state;
    const heroStressUps = () => moves(ctx.changes, HERO, 'stress', rise, ['tag', 'challenge', 'battle']);
    const bigStress = api.heroBigStress(directives);
    for (const name of comboHolders(next, api, '大型犬')) {
        // 大型犬：主角冷落那一楼不记芥蒂。
        if (next.characters[name] && directives.some((d) => d.kind === 'favor' && d.target === name && COLD_WORDS.has(d.value))) next = undoAll(next, ctx.changes, name, '芥蒂', moves(ctx.changes, name, '芥蒂', rise), '大型犬');
    }
    for (const name of comboHolders(next, api, '独占')) {
        // 独占：主角与他人亲近那一楼，其欲望上升一大档。
        if (next.characters[name] && closeToOther(next, api, name)) next = moveDim(next, name, '欲望', DESIRE_BIG, '独占', ctx.changes);
    }
    for (const name of comboHolders(next, api, '守护者')) {
        // 守护者：主角处于压力极限时，其在场把主角拉回（压力落到 80，极限计数清零）。
        if (here.has(name) && stressLimitActive(next.protagonist.bars)) {
            const bars = next.protagonist.bars;
            const { stressPeak, ...rest } = bars;
            const from = num(bars.stress);
            ctx.changes.push({ source: 'trait', target: HERO, key: 'stress', from, to: MARK, note: '守护者' });
            next = withBars(next, { ...rest, stress: MARK });
        }
    }
    for (const name of comboHolders(next, api, '灵魂伴侣')) {
        // 灵魂伴侣：一方压力上升「大」及以上时，另一方在场可抵消一半。
        if (!next.characters[name] || !here.has(name)) continue;
        if (bigStress) for (const c of heroStressUps()) next = moveBar(next, HERO, 'stress', -Math.floor(amountOf(c) / 2), '灵魂伴侣', ctx.changes);
        const own = moves(ctx.changes, name, 'stress', (c) => rise(c) && amountOf(c) >= STRESS_BIG, ['tag', 'battle']);
        for (const c of own) next = moveBar(next, name, 'stress', -Math.floor(amountOf(c) / 2), '灵魂伴侣', ctx.changes);
    }
    for (const name of comboHolders(next, api, '命定之味')) {
        // 命定之味：叉子进食回复体力恢复正常（退回「尝不出味道」的扣减）。
        next = undoAll(next, ctx.changes, name, 'stamina', moves(ctx.changes, name, 'stamina', (c) => String(c.note || '').startsWith('叉子尝不出味道'), ['trait']), '命定之味');
    }
    for (const name of comboHolders(next, api, '狼王之选')) {
        // 狼王之选：主角与他人亲近时，其不因伴侣印记增加芥蒂。
        next = undoAll(next, ctx.changes, name, '芥蒂', moves(ctx.changes, name, '芥蒂', (c) => String(c.note || '').startsWith('伴侣印记'), ['trait']), '狼王之选');
    }
    for (const name of comboHolders(next, api, '天使')) {
        // 天使：被背叛那一楼，其好感不降，只降信任。
        if (reviewed(ctx, name, '背叛')) next = undoAll(next, ctx.changes, name, '好感', moves(ctx.changes, name, '好感', fall, ['tag', 'trait']), '天使');
    }
    for (const name of comboHolders(next, api, '追妻火葬场')) {
        // 追妻火葬场：芥蒂达到「明显」起，主角拒绝其那一楼好感不降、压力小升。
        if (reviewed(ctx, name, '拒绝') && dimOf(next.characters[name], '芥蒂') >= 26) {
            next = undoAll(next, ctx.changes, name, '好感', moves(ctx.changes, name, '好感', fall, ['tag', 'trait']), '追妻火葬场');
            next = moveBar(next, name, 'stress', STRESS_SMALL, '追妻火葬场', ctx.changes);
        }
    }
    for (const name of comboHolders(next, api, '以身相许')) {
        // 以身相许：好感直接升到「心动」（主角挂时取 TA 欠你救命之恩的角色，开启关口）。
        const targets = name === HERO ? Object.keys(next.characters).filter((n) => (next.characters[n].relStates || []).some((r) => r.id === '救命之恩' && r.dir === 'ta')) : [name];
        for (const n of targets) {
            const cur = next.characters[n];
            if (!cur || dimOf(cur, '好感') >= HEART) continue;
            const from = dimOf(cur, '好感');
            ctx.changes.push({ source: 'trait', target: n, key: '好感', from, to: HEART, note: '以身相许' });
            next = withCharacter(next, n, { ...cur, dims: { ...cur.dims, 好感: HEART }, unlocked: [...new Set([...(cur.unlocked || []), ...FAVOR_GATES.filter((g) => g < HEART).map(gateKey)])] });
        }
    }
    for (const name of [...comboHolders(next, api, '百炼成钢'), ...comboHolders(next, api, '唯一向导')]) {
        // 百炼成钢、唯一向导：压力转换不会进入「崩溃」类状态（本楼刚转入的撤回，压力落在 80）。
        const hit = ctx.changes.find((c) => c.target === name && c.key === 'stress' && c.source === 'tag' && /^转为/.test(String(c.note || '')) && strainTypeOf(String(c.note).slice(2)) === '崩溃');
        const bars = known(next, name) ? barsFor(next, name) : null;
        if (hit && bars && bars.strain && strainTypeOf(String(bars.strain.name || '').replace(/^彻底/, '')) === '崩溃') {
            const { strain, ...rest } = bars;
            ctx.changes.push({ source: 'trait', target: name, key: 'stress', from: num(bars.stress), to: MARK, note: api.has(next, name, 'combo:百炼成钢') ? '百炼成钢' : '唯一向导' });
            next = putBars(next, name, { ...rest, stress: MARK });
        }
    }
    for (const name of comboHolders(next, api, '暴君')) {
        // 暴君：亲密对决胜利后，其对主角欲望不再自然消退（记标记，日结算读）。
        const won = outcomes(ctx).some((e) => e && e.kind === 'intimate' && ['我方主导', '险胜', '水到渠成', '小插曲', '心意相通'].includes(e.ending));
        if (won && here.has(name)) next = putField(next, name, { tyrantHold: true });
    }
    for (const name of comboHolders(next, api, '生死契阔')) {
        // 生死契阔：主从任一方体力归零时，另一方分出体力使其不倒下（每天一次）。
        const cur = next.characters[name];
        if (!cur || !ctxSafe(ctx)) continue;
        const heroStamina = num(next.protagonist.bars.stamina);
        const mateStamina = num(barsOf(cur).stamina);
        const [from, to] = heroStamina <= 0 && mateStamina > STAMINA_SHARE ? [name, HERO] : mateStamina <= 0 && heroStamina > STAMINA_SHARE ? [HERO, name] : [null, null];
        if (!from) continue;
        const marked = once(next, `生死契阔:${name}`);
        if (!marked) continue;
        next = moveBar(marked, from, 'stamina', -STAMINA_SHARE, '生死契阔', ctx.changes);
        next = moveBar(next, to, 'stamina', STAMINA_SHARE, '生死契阔', ctx.changes);
    }
    return next;
}
const ctxSafe = (ctx) => Boolean(ctx && Array.isArray(ctx.changes));

// 合成：检定、金钱、罪犯事件、环境类。
function worldComboHook(state, api) {
    const { ctx, here, directives } = api;
    let next = state;
    const info = ctx.checkInfo || null;
    const won = ctx.checkSuccess;
    // 赌神（主角）：押注成功收入再增一半；每天第一次押注失败不扣钱。
    if (api.has(next, HERO, 'combo:赌神') && won !== undefined && api.has(next, HERO, '赌徒')) {
        const money = ctx.changes.filter((c) => c.target === HERO && c.key === 'money' && !undone.has(c) && (c.source === 'tag' || c.source === 'battle' || (c.source === 'trait' && String(c.note || '').startsWith('赌徒'))));
        if (won) for (const c of money.filter(rise)) next = moveBar(next, HERO, 'money', Math.round(amountOf(c) * 0.5), '赌神', ctx.changes);
        else {
            const lost = money.filter(fall).reduce((s, c) => s - amountOf(c), 0);
            const marked = lost > 0 ? once(next, '赌神') : null;
            if (marked) next = moveBar(marked, HERO, 'money', lost, '赌神·保本', ctx.changes);
        }
    }
    // 江湖豪客：本楼有喝酒类检定或技能成长，其在场则对主角信任小升。
    const drinking = (info && DRINK.test(String(info.skill || ''))) || directives.some((d) => d.kind === 'grow' && DRINK.test(String(d.skill || '')));
    if (drinking) for (const name of comboHolders(next, api, '江湖豪客')) if (here.has(name) && next.characters[name]) next = moveDim(next, name, '信任', TRUST_SMALL, '江湖豪客', ctx.changes);
    // 金牌骗子：谎言被揭穿每天第一次不结算（退回骗子的信任下降、芥蒂上升）。网络幽灵：被追查那一楼不加压力。
    for (const ev of Array.isArray(ctx.bondEvents) ? ctx.bondEvents : []) {
        if (!ev || !ev.who) continue;
        if (ev.type === '谎言揭穿' && api.has(next, ev.who, 'combo:金牌骗子')) {
            const marked = once(next, `金牌骗子:${ev.who}`);
            if (marked) {
                next = marked;
                for (const key of ['信任', '芥蒂']) for (const n of Object.keys(next.characters)) next = undoAll(next, ctx.changes, n, key, moves(ctx.changes, n, key, () => true, ['trait']).filter((c) => c.note === '骗子'), '金牌骗子');
            }
        }
        if (ev.type === '被追查' && api.has(next, ev.who, 'combo:网络幽灵')) next = undoAll(next, ctx.changes, ev.who, 'stress', moves(ctx.changes, ev.who, 'stress', (c) => c.note === '黑客', ['trait']), '网络幽灵');
    }
    // 吸血鬼：白天体力消耗 ×1.5、夜晚 ×0.5（永夜伴侣取消白天惩罚）。
    const sky = `${ctx.time || ''} ${ctx.weather || ''}`;
    const day = DAYLIGHT.test(sky) && !NIGHT.test(String(ctx.time || ''));
    const night = NIGHT.test(String(ctx.time || ''));
    if (day || night) {
        for (const name of holdersOf(next, api, '吸血鬼')) {
            for (const c of moves(ctx.changes, name, 'stamina', (x) => fall(x) && x.note !== '吸血', ['tag', 'battle'])) {
                const drop = -amountOf(c);
                if (night) next = moveBar(next, name, 'stamina', Math.floor(drop / 2), '吸血鬼·夜晚', ctx.changes);
                else if (!api.has(next, name, 'combo:永夜伴侣')) next = moveBar(next, name, 'stamina', -Math.round(drop * 0.5), '吸血鬼·白天', ctx.changes);
            }
        }
    }
    // 人鱼：记下在水边的日期（离水满三天后日结算扣体力）。
    if (WATER.test(String(ctx.place || ''))) {
        for (const name of holdersOf(next, api, '人鱼')) {
            const map = next.clock.waterDays && typeof next.clock.waterDays === 'object' ? next.clock.waterDays : {};
            if (map[name] !== next.clock.day && (name === HERO || here.has(name))) next = withClock(next, { waterDays: { ...map, [name]: next.clock.day } });
        }
    }
    return next;
}

export const TAG_HOOKS = [startHook, deadTraitHook, subEffectHook, comboHook, worldComboHook];

// ---- 日结算钩子 ----
const dailyMove = (state, api, name, key, delta, note) => (key === 'stress' ? (api.shiftStress(name, delta, note), api.shiftStressState()) : moveBar(state, name, key, delta, note, api.changes, 'daily'));

export const DAILY_HOOKS = [
    (state, api) => {
        let next = state;
        const stress = (name, delta, note) => { next = api.shiftStress(name, delta, note); };
        const day = api.day;
        const present = api.present;
        // 铁公鸡：每天少量利息（与「小有积蓄」不叠加）。
        for (const name of comboHolders(next, api, '铁公鸡')) if (!api.has(next, name, '小有积蓄')) next = moveBar(next, name, 'money', 5, '铁公鸡·利息', api.changes, 'daily');
        // 贤惠：其在场的日子，主角入睡回复体力略多。
        const rec = [...api.changes].reverse().find((c) => c.source === 'daily' && c.target === HERO && c.key === 'stamina' && c.note === '日结算' && c.to > c.from);
        if (rec && Object.keys(next.characters).some((n) => present.has(n) && api.has(next, n, '贤惠'))) next = moveBar(next, HERO, 'stamina', STAMINA_SMALL, '贤惠', api.changes, 'daily');
        // 天才（主角合成）：技能成长涨幅额外加一。
        if (comboHolders(next, api, '天才').includes(HERO)) {
            const boosted = new Set(api.changes.filter((c) => c.source === 'trait' && c.target === HERO && c.note === '学霸').map((c) => c.key));
            let skills = next.protagonist.skills;
            for (const c of api.changes.filter((x) => x.source === 'daily' && x.target === HERO && x.note === '成长' && x.to > x.from && skills[x.key])) {
                if (boosted.has(c.key)) continue;
                const to = Math.min(90, skills[c.key].value + 1);
                if (to === skills[c.key].value) continue;
                api.changes.push({ source: 'trait', target: HERO, key: c.key, from: skills[c.key].value, to, note: '天才' });
                skills = { ...skills, [c.key]: { ...skills[c.key], value: to } };
            }
            if (skills !== next.protagonist.skills) next = { ...next, protagonist: { ...next.protagonist, skills } };
        }
        // 花心：好感冷却加倍（当日冷却再扣一份）。
        for (const name of Object.keys(next.characters)) {
            if (!api.has(next, name, '花心')) continue;
            const hit = api.changes.find((c) => c.target === name && c.key === '好感' && c.note === '冷却' && fall(c) && !undone.has(c));
            if (hit) { undone.add(hit); next = moveDim(next, name, '好感', amountOf(hit), '花心', api.changes, 'daily'); }
        }
        // 暴君：亲密对决胜利后，其对主角欲望不再自然消退（退回当日淡忘）。
        for (const name of comboHolders(next, api, '暴君')) {
            if (!next.characters[name] || !next.characters[name].tyrantHold) continue;
            const hit = api.changes.find((c) => c.target === name && c.key === '欲望' && c.note === '淡忘' && fall(c) && !undone.has(c));
            if (hit) { undone.add(hit); next = moveDim(next, name, '欲望', -amountOf(hit), '暴君', api.changes, 'daily'); }
        }
        // 人鱼：离水满三天后，每天体力额外小降；深海之心的主角在场时取消。
        const waterMap = next.clock.waterDays && typeof next.clock.waterDays === 'object' ? next.clock.waterDays : {};
        for (const name of holdersOf(next, api, '人鱼')) {
            const last = num(waterMap[name]);
            if (!last || day - last < 3) continue;
            if (api.has(next, name, 'combo:深海之心') && (name === HERO || present.has(name))) continue;
            next = moveBar(next, name, 'stamina', -STAMINA_SMALL, '人鱼·离水', api.changes, 'daily');
        }
        // 公众人物：有归属于自己的声望条且数值较高（66 以上）时，被围观的压力再缓升一份。
        const bars = Array.isArray(api.ctx.fameBars) ? api.ctx.fameBars : [];
        for (const name of holdersOf(next, api, '公众人物')) {
            const crowd = [HERO, ...present].filter((n) => n !== name && known(next, n));
            if (!crowd.length) continue;
            const mine = bars.filter((b) => b && b.owner === name && !b.pair);
            if (mine.some((b) => fameValue(next, b) >= 66)) stress(name, STRESS_DAY, '公众人物·声望');
        }
        return next;
    },
];
void dailyMove;
