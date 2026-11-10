// 特质规则分文件（F 批）：偏好特质的送礼与每天一次的钩子。由 stat-trait-rules.js 汇总，排在其他规则文件之后。
// 读主角数值的好感倍率写在 stat-traits.js 的 SCALE_RULES（要读六维与金钱，规则文件不能导入 stat-traits.js）。
// 本文件不得 import stat-traits.js（避免循环）；只改数值，不碰战斗与亲密对决规则。

const BONUS = 1;
// 「昂贵」及以上的礼物：同楼有主角的「昂贵」「巨额」档花费。
const COSTLY = new Set(['昂贵', '巨额']);

const num = (v) => Number(v) || 0;

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];
export const DAILY_HOOKS = [];

// 主角本楼检定失败或当面战败：战斗「败」、挑战「失败」、关键事件检定失败（未到关口不算）、打工失败。
function heroFailed(ctx) {
    return (Array.isArray(ctx.events) ? ctx.events : []).some((e) => {
        if (!e) return false;
        if (e.kind === 'battle') return e.outcome === '败';
        if (e.kind === 'challenge') return e.outcome === '失败';
        if (e.kind === 'work') return String(e.tier || '').includes('失败');
        return e.event !== undefined && e.success === false && e.reason !== 'not-at-gate';
    });
}

// 花费写了具体数目时，达到「昂贵」档的金额也算（金额表取本聊天的，缺省 500）。
const costlyGift = (directives, name, table) => directives.some((d) => d.kind === 'gift' && d.target === name)
    && directives.some((d) => d.kind === 'money' && d.flow === '花费' && (COSTLY.has(d.value) || num(d.amount) >= (num(table && table.昂贵) || 500)) && (!d.target || d.target === name));

export const TAG_HOOKS = [
    (state, api) => {
        const { ctx, directives, here } = api;
        const failed = heroFailed(ctx);
        const day = num(state.clock && state.clock.day);
        let next = state;
        for (const name of Object.keys(next.characters)) {
            const has = (id) => api.has(next, name, id);
            const gifted = directives.some((d) => d.kind === 'gift' && d.target === name);
            // 拜金：送礼那一楼好感额外上升 1。
            if (gifted && has('拜金')) next = api.bump(next, name, '好感', BONUS, '拜金');
            // 清高：送礼没有额外加成，送昂贵以上礼物那一楼好感少 1。
            if (has('清高') && costlyGift(directives, name, ctx.moneyTable)) next = api.bump(next, name, '好感', -BONUS, '清高');
            // 保护欲：主角检定失败或当面战败那一楼好感 +1，每天一次。
            if (failed && has('保护欲') && here.has(name)) {
                const cur = next.characters[name];
                if (!cur || (num(cur.protectDay) === day && day)) continue;
                next = api.bump(next, name, '好感', BONUS, '保护欲');
                const after = next.characters[name];
                next = { ...next, characters: { ...next.characters, [name]: { ...after, protectDay: day } } };
            }
        }
        return next;
    },
];
