// 特质规则分文件：副模型顺带识别的事件（夸奖、批评、拒绝、背叛、求助、耳语、信仰质疑）。
// 事件由评定流程填进 ctx.reviewEvents：[{ type, name, dir }]，只在触发评定的那几楼有，其余楼读不到就静默不生效。
// 本文件不得 import stat-traits.js（避免循环）；只改数值，不碰战斗与亲密对决规则。
import { barsOf, withCharacter } from './stat-state.js';
import { shiftStress } from './stat-strain.js';

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];
export const DAILY_HOOKS = [];

const eventsOf = (ctx) => (Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents.filter((e) => e && e.type && e.name) : []);
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
        if (ev.type === '批评' && has('自恋')) next = api.bump(next, name, '芥蒂', Math.max(api.SMALL.好感, gained(ctx, name, '芥蒂')), '自恋');
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
