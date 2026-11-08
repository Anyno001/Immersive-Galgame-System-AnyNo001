// 特质规则分文件：性格、天资。由 stat-traits.js 与 stat-trait-hooks.js 汇总，本文件不得 import stat-traits.js（避免循环）。
// 本文件也不 import stat-state / stat-strain / stat-bars（它们会经 stat-state 绕回 stat-traits），需要的小常量与工具在本地写。
// SCALE：[特质键, 维度, 方向(up/down/cool/fade/jealous…), 系数, 条件(character, ctx)?]
// FLAG：[标记, 特质键, 条件?]；DAILY：[特质键, 维度, 数值]
// TAG_HOOKS：每楼事件钩子 (state, api) => state；DAILY_HOOKS：日结算钩子 (state, api) => state。api 见 stat-trait-hooks.js。
// 只改数值，不碰战斗与亲密对决的牌组、主导权、回合与牌效；战斗、挑战胜负只作为事件读取。

// 「×1.5」类事件加成折成固定的 +1。
const BONUS = 1;
// 压力下降强度表（与 stat-bars 的 STRESS_STRENGTH_DELTA.下降 一致；省略强度按「中」）。
const STRESS_DOWN = Object.freeze({ 小: 5, 中: 10, 大: 20 });
const MONEY_TIERS = Object.freeze(['少量', '普通', '昂贵', '巨额']);
const HERO = '主角';

export const SCALE = [
    ['敏感', '好感', 'down', 1.5], ['敏感', '信任', 'down', 1.5],
    ['迟钝', '好感', 'down', 0.5], ['迟钝', '信任', 'down', 0.5],
    ['醋坛子', '芥蒂', 'jealous', 1.5],
    ['薄情', '好感', 'cool', 2],
    ['好奇宝宝', '了解', 'up', 1.5],
    ['老好人', '芥蒂', 'up', 0.5],
];

export const FLAG = [
    // 心大：吃醋不加芥蒂（吃醋本身仍会扣少量好感）。
    ['noJealousGrudge', '心大'],
    // 专一：成为恋人（角色档案 romance 为真）后好感不冷却。
    ['noCool', '专一', (c) => Boolean(c && c.romance === true)],
];

export const DAILY = [
    ['工作狂', '压力', 3],
];

// 本楼的检定 / 对决结果事件：战斗、挑战（含亲密对决战报）、打工。win 成功或胜利，fail 失败，great 大成功。
function outcomesOf(ctx) {
    const out = [];
    for (const e of Array.isArray(ctx.events) ? ctx.events : []) {
        if (!e) continue;
        if (e.kind === 'battle') out.push({ win: e.outcome !== '败' && e.outcome !== '撤', fail: e.outcome === '败', great: e.outcome === '大胜' });
        else if (e.kind === 'challenge') out.push({ win: e.outcome === '圆满' || e.outcome === '勉强', fail: e.outcome === '失败', great: e.outcome === '圆满' });
        else if (e.kind === 'work') {
            const tier = String(e.tier || '');
            out.push({ win: tier.includes('成功'), fail: tier.includes('失败'), great: tier === '大成功' });
        }
    }
    return out;
}

// 角色（非主角）压力改动：只做简单夹取，压力转换进行中（bars.strain）的不动。
function npcStress(state, name, delta, note, ctx) {
    const cur = state.characters[name];
    if (!cur) return state;
    const bars = cur.bars && typeof cur.bars === 'object' ? cur.bars : { stamina: 100, money: 0, stress: 0 };
    if (bars.strain) return state;
    const from = Number(bars.stress) || 0;
    const to = Math.max(0, Math.min(100, from + delta));
    if (to === from) return state;
    ctx.changes.push({ source: 'trait', target: name, key: 'stress', from, to, note });
    return { ...state, characters: { ...state.characters, [name]: { ...cur, bars: { ...bars, stress: to } } } };
}

// 打工收入高一档：按本楼打工收入档的下一档补差额。
function raiseWorkIncome(state, ctx, note) {
    const flag = ctx.flags && ctx.flags.work;
    const tier = flag && flag.income;
    const at = MONEY_TIERS.indexOf(tier);
    const table = ctx.moneyTable;
    if (at < 0 || at >= MONEY_TIERS.length - 1 || !table) return state;
    const extra = (Number(table[MONEY_TIERS[at + 1]]) || 0) - (Number(table[tier]) || 0);
    if (extra <= 0) return state;
    const bars = state.protagonist.bars;
    const from = Number(bars.money) || 0;
    ctx.changes.push({ source: 'trait', target: HERO, key: 'money', from, to: from + extra, note });
    return { ...state, protagonist: { ...state.protagonist, bars: { ...bars, money: from + extra } } };
}

const stressDown = (d) => d.kind === 'stress' && d.value === '下降';

export const TAG_HOOKS = [
    // 主角侧：好胜 / 淡泊 / 完美主义者（胜负、成败结果）、外向 / 内向（压力下降加倍）、工作狂（打工收入）。
    (state, api) => {
        const { ctx, directives, here } = api;
        const changes = ctx.changes.slice();
        const outcomes = outcomesOf(ctx);
        const heroHas = (id) => api.has(state, HERO, id);
        let next = state;
        // 好胜：失败压力小升，胜利压力小降。
        if (heroHas('好胜')) {
            for (const o of outcomes) {
                if (o.fail) next = api.bumpHeroStress(next, api.SMALL.压力, '好胜');
                else if (o.win) next = api.bumpHeroStress(next, -api.SMALL.压力, '好胜');
            }
        }
        // 淡泊：挑战的压力变动（失败的上升、胜利的下降）全部撤销。
        const challengeStress = changes.filter((c) => c.source === 'challenge' && c.target === HERO && c.key === 'stress');
        if (heroHas('淡泊')) for (const c of challengeStress) next = api.bumpHeroStress(next, c.from - c.to, '淡泊');
        // 完美主义者：大成功压力小降；挑战失败的压力上升再加一份（加倍）；普通成功无变化。
        if (heroHas('完美主义者')) {
            for (const o of outcomes) if (o.great) next = api.bumpHeroStress(next, -api.SMALL.压力, '完美主义者');
            for (const c of challengeStress) if (c.to > c.from && String(c.note || '').includes('失败')) next = api.bumpHeroStress(next, c.to - c.from, '完美主义者');
        }
        // 外向：与人相处时压力下降加倍；内向：独处或休息（入睡、小憩）时压力下降加倍。
        const rested = directives.some((d) => d.kind === 'sleep' || (d.kind === 'stamina' && !d.target && d.value === '小憩'));
        const alone = Array.isArray(ctx.present) && here.size === 0;
        for (const d of directives) {
            if (!stressDown(d) || d.target) continue;
            const amount = STRESS_DOWN[d.strength] || STRESS_DOWN.中;
            if (heroHas('外向') && here.size > 0) next = api.bumpHeroStress(next, -amount, '外向');
            if (heroHas('内向') && (alone || rested)) next = api.bumpHeroStress(next, -amount, '内向');
        }
        // 工作狂：打工收入高一档。
        if (heroHas('工作狂')) next = raiseWorkIncome(next, ctx, '工作狂');
        return next;
    },
    // 角色侧：外向 / 内向（自身压力下降）、害羞、慕强、讲义气、浪漫、务实、过目不忘。
    (state, api) => {
        const { ctx, directives, here } = api;
        const changes = ctx.changes.slice();
        const win = outcomesOf(ctx).some((o) => o.win);
        const present = Array.isArray(ctx.present) ? ctx.present : null;
        let next = state;
        // 讲义气的受益名单：共患难事件的对象，以及并肩取胜的战友。
        const comrades = new Set(directives.filter((d) => d.kind === 'event' && d.value === '共患难' && d.target).map((d) => d.target));
        for (const e of Array.isArray(ctx.events) ? ctx.events : []) if (e && e.kind === 'battle' && e.outcome !== '败' && e.outcome !== '撤') for (const n of (Array.isArray(e.allies) && e.allies.length ? e.allies : e.ally ? [e.ally] : [])) comrades.add(n);
        for (const name of Object.keys(next.characters)) {
            const has = (id) => api.has(next, name, id);
            // 外向 / 内向：自身压力下降加倍（外向须与主角在一起，内向须不在场）。
            for (const d of directives) {
                if (!stressDown(d) || d.target !== name) continue;
                const amount = STRESS_DOWN[d.strength] || STRESS_DOWN.中;
                if (has('外向') && present && present.includes(name)) next = npcStress(next, name, -amount, '外向', ctx);
                if (has('内向') && present && !present.includes(name)) next = npcStress(next, name, -amount, '内向', ctx);
            }
            // 害羞：欲望上升时压力同步小升；亲密那一楼好感额外小升。
            if (has('害羞')) {
                if (changes.some((c) => c.target === name && c.key === '欲望' && c.to > c.from)) next = npcStress(next, name, api.SMALL.压力, '害羞', ctx);
                if (directives.some((d) => d.kind === 'intimate' && d.target === name)) next = api.bump(next, name, '好感', api.SMALL.好感, '害羞');
            }
            // 慕强：主角检定成功或战斗胜利的那一楼，在场的其对主角好感额外上升。
            if (has('慕强') && win && here.has(name)) next = api.bump(next, name, '好感', api.SMALL.好感, '慕强');
            // 讲义气：共患难事件好感与信任额外上升。
            if (has('讲义气') && comrades.has(name)) {
                next = api.bump(next, name, '好感', BONUS, '讲义气');
                next = api.bump(next, name, '信任', BONUS, '讲义气');
            }
            // 浪漫：约会、告白事件好感额外上升。
            if (has('浪漫') && directives.some((d) => d.kind === 'event' && d.target === name && (d.value === '约会' || d.value === '告白'))) next = api.bump(next, name, '好感', BONUS, '浪漫');
            // 务实：送礼好感额外上升。
            if (has('务实') && directives.some((d) => d.kind === 'gift' && d.target === name)) next = api.bump(next, name, '好感', BONUS, '务实');
            // 过目不忘：了解不下降（失忆除外），把本楼已发生的下降补回。
            if (has('过目不忘') && !has('失忆')) {
                for (const c of changes) {
                    if (c.target !== name || c.key !== '了解' || !(c.to < c.from) || ['trait', 'manual', 'register'].includes(c.source)) continue;
                    next = api.bump(next, name, '了解', c.from - c.to, '过目不忘');
                }
            }
        }
        return next;
    },
];

export const DAILY_HOOKS = [
    // 外向：独处（主角身边没人 / 角色多日不在主角身边）压力缓升；内向：与人相处压力缓升。需要在场名单，读不到时不生效。
    (state, api) => {
        if (!Array.isArray(api.ctx.present)) return state;
        let next = state;
        for (const name of [HERO, ...Object.keys(state.characters)]) {
            const hero = name === HERO;
            const together = hero ? api.present.size > 0 : api.present.has(name);
            const seen = hero ? api.day : Number(next.characters[name] && next.characters[name].lastSeenDay) || 0;
            if (api.has(next, name, '外向') && !together && (hero || seen < api.day - 1)) next = api.shiftStress(name, api.TRAIT_STRESS_DAILY, '外向·独处');
            if (api.has(next, name, '内向') && together) next = api.shiftStress(name, api.TRAIT_STRESS_DAILY, '内向·社交');
        }
        return next;
    },
];

// DICE：[特质键, 检定类别(社交/战斗/技术/敏捷/手工/学习/全部…), 奖惩骰数(+1 奖励 / -1 惩罚), 条件(character, ctx)?]
export const DICE = [
    ['幸运儿', '全部', 1],
    ['倒霉蛋', '全部', -1],
    ['冒失鬼', '敏捷', -1],
    ['冒失鬼', '手工', -1],
];
