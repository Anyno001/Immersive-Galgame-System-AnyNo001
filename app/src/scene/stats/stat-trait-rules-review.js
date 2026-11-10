// 特质规则分文件：夸奖、批评、拒绝、背叛、求助、耳语、信仰质疑等事件。
// 事件由结算填进 ctx.reviewEvents：[{ type, name, dir }]，来源是本楼 event 标签（每楼）与副模型评定（补漏，去重）。
// 本文件不得 import stat-traits.js（避免循环）；只改数值，不碰战斗与亲密对决规则。
import { barsOf, withCharacter } from './stat-state.js';
import { shiftStress } from './stat-strain.js';
import { GRUDGE_UP_BIG, TRUST_DROP_BIG, applyEvent, betrayHate } from './stat-trait-rules-bond.js';

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];
export const DAILY_HOOKS = [];

const eventsOf = (ctx) => (Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents.filter((e) => e && e.type && e.name) : []);
/// 本楼（标签与特质）已给该角色芥蒂的上升量。
const grudgeGained = (ctx, name) => ctx.changes.filter((c) => c.target === name && c.key === '芥蒂' && (c.source === 'tag' || c.source === 'trait') && c.to > c.from).reduce((s, c) => s + (c.to - c.from), 0);
// 本楼标签结算已给该角色某维度的上升量。
const gained = (ctx, name, key) => ctx.changes.filter((c) => c.source === 'tag' && c.target === name && c.key === key && c.to > c.from).reduce((s, c) => s + (c.to - c.from), 0);

function npcStress(state, name, delta, note, ctx) {
    const cur = state.characters[name];
    if (!cur || !delta) return state;
    const bars = barsOf(cur);
    const moved = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(moved.stress) || 0;
    if (to === from) return state;
    ctx.changes.push({ source: 'trait', target: name, key: 'stress', from, to, note });
    return withCharacter(state, name, { ...cur, bars: moved });
}

// 自卑：被夸奖好感上升加倍、被批评压力上升加倍；自恋：被夸奖好感上升加倍、被批评芥蒂上升加倍；
// 声控（NSFW）：耳语类描写欲望上升加倍。加倍 = 本楼标签已给的量再补一份（没有就补一小档）。
function reviewHook(state, api) {
    const { ctx } = api;
    let next = state;
    for (const ev of eventsOf(ctx)) {
        const name = ev.name;
        if (!next.characters[name]) continue;
        const has = (id) => api.has(next, name, id);
        if (ev.type === '夸奖' && (has('自卑') || has('自恋'))) next = api.bump(next, name, '好感', Math.max(api.SMALL.好感, gained(ctx, name, '好感')), has('自卑') ? '自卑' : '自恋');
        if (ev.type === '批评' && has('自卑')) next = npcStress(next, name, Math.max(5, gained(ctx, name, 'stress')), '自卑', ctx);
        if (ev.type === '批评' && has('龙系')) next = api.bump(next, name, '芥蒂', Math.max(1, Math.round(gained(ctx, name, '芥蒂') * 0.5)), '龙系');
        if (ev.type === '批评' && has('自恋')) next = api.bump(next, name, '芥蒂', Math.max(api.SMALL.好感, gained(ctx, name, '芥蒂')), '自恋');
        // 背叛：被背叛方（主角对 TA）按恩仇「决裂」同档结算（信任大降、芥蒂大升，恩怨两难转回宿仇）；正义使者该楼芥蒂上升加倍。
        if (ev.type === '背叛' && ev.dir !== 'me') {
            next = applyEvent(next, api, { type: '决裂', target: name, dir: 'ta' });
            next = api.bump(next, name, '信任', -TRUST_DROP_BIG, '背叛');
            next = api.bump(next, name, '芥蒂', GRUDGE_UP_BIG, '背叛');
            // 背叛坐实：摘掉猜忌，挂结怨（TA 无以德报怨、尚未结怨时）。
            next = betrayHate(next, api, name);
            if (has('正义使者')) next = api.bump(next, name, '芥蒂', Math.max(api.SMALL.好感, grudgeGained(ctx, name)), '正义使者');
        }
        // 求助：老好人必然答应，按事件方向挂「欠你人情」（主角求助则主角欠 TA，TA 求助则 TA 欠主角）。
        if (ev.type === '求助' && has('老好人')) next = applyEvent(next, api, { type: '帮忙', target: name, dir: ev.dir === 'me' ? 'ta' : 'me' });
        // 信仰质疑：狂信徒芥蒂上升加倍；无神论者不受影响（无规则）。
        if (ev.type === '信仰质疑' && has('狂信徒')) next = api.bump(next, name, '芥蒂', Math.max(api.SMALL.好感, gained(ctx, name, '芥蒂')), '狂信徒');
        if (ev.type === '耳语' && has('声控')) next = api.bump(next, name, '欲望', Math.max(api.SMALL.欲望, gained(ctx, name, '欲望')), '声控');
        // 舔狗：被拒绝那一楼好感不降（退回本楼好感下降量）。
        if (ev.type === '拒绝' && has('舔狗')) {
            const drop = ctx.changes.filter((c) => c.source === 'tag' && c.target === name && c.key === '好感' && c.to < c.from).reduce((s, c) => s + (c.from - c.to), 0);
            if (drop) next = api.bump(next, name, '好感', drop, '舔狗');
        }
    }
    return next;
}

export const TAG_HOOKS = [reviewHook];
