// 特质规则分文件：恋爱人设剩余项（白月光、腹黑、绿茶等）与合成独有效果。由 stat-traits.js 与 stat-trait-hooks.js 汇总，本文件不得 import stat-traits.js（避免循环）。
// SCALE：[特质键, 维度, 方向(up/down/cool/fade/jealous…), 系数, 条件(character, ctx)?]
// FLAG：[标记, 特质键, 条件?]；DAILY：[特质键, 维度, 数值]
// TAG_HOOKS：每楼事件钩子 (state, api) => state；DAILY_HOOKS：日结算钩子 (state, api) => state。api 见 stat-trait-hooks.js。
// 全部只改数值，不碰战斗与亲密对决规则。事件钩子读本楼 ctx.changes（已结算的变动）与 api.directives（本楼标签）做「抵消 / 追加」，读不到的语义不接。
// 合成：hasTrait 不认 combo 键（登记表无该项），这里直接读 api.cat.traits[名]['combo:合成名']；含 NSFW 组成项的合成在 NSFW 关闭时视为未挂。

const LIKE_FROM = 26;
const HEART_FROM = 51;
const HALF = 50;
// 「一档」换算：欲望一档 4（普通档「中」）；压力一大档 20、小档 5；好感大档 6。
const DESIRE_STEP = 4;
const STRESS_BIG = 20;
const STRESS_SMALL = 5;
const FAVOR_BIG = 6;
const GRUDGE_BIG = 10;
const WORK_STAMINA = 15;
const DEFAULT_MONEY = Object.freeze({ 少量: 20, 普通: 100, 昂贵: 500, 巨额: 3000 });
const MONEY_ORDER = Object.freeze(['少量', '普通', '昂贵', '巨额']);
// 好感方向词里「冷处理」「拒绝」的近义（含旧词），以及「示好」类事件。
const COLD_WORDS = new Set(['冷淡', '嫌弃', '失望', '反感']);
const COURT_EVENTS = new Set(['约会', '告白', '交心']);

// 已被某条规则抵消过的变动，避免多条规则重复抵消同一笔。
const undone = new WeakSet();

const num = (v) => Number(v) || 0;
const dimOf = (c, dim) => num(c && c.dims && c.dims[dim]);
const stressOf = (c) => num(c && c.bars && c.bars.stress);
const gainOf = (c) => num(c.to) - num(c.from);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- 读本楼变动 ----
// 本楼某角色某维度的、尚未抵消的变动。
const mine = (api, name, key, pred = () => true) => api.ctx.changes.filter((c) => c.target === name && c.key === key && !undone.has(c) && pred(c));
const fromTag = (c) => c.source === 'tag';
// 好感类「普通」变动：排除关口突破、起始关系、误会解除、顿悟。
const plainFavor = (c) => fromTag(c) && !/突破|起始|开局|误会|顿悟/.test(String(c.note || ''));
const dirOf = (api, kind, name) => api.directives.filter((d) => d.kind === kind && d.target === name);
const isCourt = (d) => d.kind === 'gift' || (d.kind === 'event' && COURT_EVENTS.has(d.value));
const hasCold = (api, name) => dirOf(api, 'favor', name).some((d) => COLD_WORDS.has(d.value));

// ---- 写数值（直接改状态并记一笔变动）----
function putDim(state, log, name, dim, to, note) {
    const cur = state.characters[name];
    if (!cur || !cur.dims || (dim === '欲望' && !Object.hasOwn(cur.dims, '欲望'))) return state;
    const from = dimOf(cur, dim);
    const next = clamp(Math.round(to), dim === '欲望' ? 0 : -100, 100);
    if (next === from) return state;
    log.push({ source: 'trait', target: name, key: dim, from, to: next, note });
    return { ...state, characters: { ...state.characters, [name]: { ...cur, dims: { ...cur.dims, [dim]: next } } } };
}

const barsOfName = (state, name) => (name === '主角' ? state.protagonist.bars : { stamina: 100, money: 0, stress: 0, ...((state.characters[name] && state.characters[name].bars) || {}) });
function withBarsOf(state, name, bars) {
    if (name === '主角') return { ...state, protagonist: { ...state.protagonist, bars } };
    const cur = state.characters[name];
    return cur ? { ...state, characters: { ...state.characters, [name]: { ...cur, bars } } } : state;
}

// 压力增减：主角走 api.bumpHeroStress（含转换状态规则）；他人直接夹在 0 到 100，处于压力转换状态的角色不动。
function moveStress(state, log, name, delta, note, api) {
    if (!delta) return state;
    if (name === '主角') return api.bumpHeroStress(state, delta, note);
    const cur = state.characters[name];
    if (!cur) return state;
    const bars = barsOfName(state, name);
    if (bars.strain) return state;
    const from = num(bars.stress);
    const to = clamp(from + delta, 0, 100);
    if (to === from) return state;
    log.push({ source: 'trait', target: name, key: 'stress', from, to, note });
    return withBarsOf(state, name, { ...bars, stress: to });
}

// 体力、金钱直接设值。
function putBar(state, log, name, key, to, note) {
    if (name !== '主角' && !state.characters[name]) return state;
    const bars = barsOfName(state, name);
    const from = num(bars[key]);
    const next = key === 'money' ? Math.round(to) : clamp(Math.round(to), 0, 100);
    if (next === from) return state;
    log.push({ source: 'trait', target: name, key, from, to: next, note });
    return withBarsOf(state, name, { ...bars, [key]: next });
}

// 自定义角色字段（用于每日一次、缺席前原值等小记录）。
const putField = (state, name, patch) => (state.characters[name] ? { ...state, characters: { ...state.characters, [name]: { ...state.characters[name], ...patch } } } : state);

// ---- 谁挂了什么 ----
const traitHolders = (api, state, id) => ['主角', ...Object.keys(state.characters)].filter((n) => api.has(state, n, id));
const hasCombo = (api, name, combo) => api.has(api.state || {}, name, `combo:${combo}`);
const comboHolders = (api, combo) => Object.keys((api.cat && api.cat.traits) || {}).filter((n) => hasCombo(api, n, combo));

// 抵消某批变动（把变动量原路还回）。
function undoAll(state, api, name, key, list, note) {
    let next = state;
    for (const c of list) {
        undone.add(c);
        if (key === 'stress') next = moveStress(next, api.ctx.changes, name, -gainOf(c), note, api);
        else if (key === 'stamina' || key === 'money') next = putBar(next, api.ctx.changes, name, key, num(c.from), note);
        else next = api.bump(next, name, key, -gainOf(c), note);
    }
    return next;
}

// 吃醋结算（好感下降、吃醋带来的芥蒂）原路还回。
function undoJealousy(state, api, name, note) {
    let next = state;
    next = undoAll(next, api, name, '好感', mine(api, name, '好感', (c) => fromTag(c) && c.note === '吃醋' && gainOf(c) < 0), note);
    next = undoAll(next, api, name, '芥蒂', mine(api, name, '芥蒂', (c) => fromTag(c) && c.note === '吃醋' && gainOf(c) > 0), note);
    return next;
}

// 金钱收入降一档：按本楼打工收入档与金钱表，扣掉高出的部分。
function incomeDown(state, api, note) {
    const work = api.ctx.flags && api.ctx.flags.work;
    const at = work ? MONEY_ORDER.indexOf(work.income) : -1;
    if (at < 0) return state;
    const table = { ...DEFAULT_MONEY, ...(api.ctx.moneyTable || {}) };
    const diff = num(table[MONEY_ORDER[at]]) - (at > 0 ? num(table[MONEY_ORDER[at - 1]]) : 0);
    return diff > 0 ? putBar(state, api.ctx.changes, '主角', 'money', num(state.protagonist.bars.money) - diff, note) : state;
}

// ---- 恋爱人设：倍率 / 标记 ----
export const SCALE = [
    // 舔狗：主角对其好感上升 ×0.5（越追越不值钱）。
    ['舔狗', '好感', 'up', 0.5],
    // 白莲：自身芥蒂上升 ×0.5。
    ['白莲', '芥蒂', 'up', 0.5],
    // 破碎感：其压力过半时，好感上升 ×1.5（激起保护欲）。
    ['破碎感', '好感', 'up', 1.5, (c) => stressOf(c) > HALF],
    // 显眼包：了解其的速度 ×1.5。
    ['显眼包', '了解', 'up', 1.5],
];

export const FLAG = [
    // 吃醋不加芥蒂：绿帽癖、海王、人间清醒（不受吃醋连锁影响）。
    ['noJealousGrudge', '绿帽癖'],
    ['noJealousGrudge', '海王'],
    ['noJealousGrudge', '人间清醒'],
    // 好感不因冷落冷却：舔狗、电子宠物。
    ['noCool', '舔狗'],
    ['noCool', '电子宠物'],
    // 电子宠物：主角不在身边每天压力缓升（再由日结算钩子补成 ×2）。
    ['absentStress', '电子宠物'],
];

export const DAILY = [];

// ---- 每楼事件钩子 ----
export const TAG_HOOKS = [
    // 白月光：距上次在场 ≥ 7 天后再次在场（或本楼写了「重逢」事件）那一楼，对主角好感上升一大档。
    (state, api) => {
        let next = state;
        const day = num(next.clock && next.clock.day);
        const reunion = (api.ctx.reviewEvents || []).filter((e) => e.type === '重逢').map((e) => e.name);
        for (const name of traitHolders(api, next, '白月光')) {
            if (name === '主角' || !next.characters[name]) continue;
            const seen = api.ctx.lastSeen && api.ctx.lastSeen[name];
            const long = Number.isFinite(seen) && api.here.has(name) && day - seen >= 7;
            if (long || reunion.includes(name)) next = api.bump(next, name, '好感', api.BIG.好感, '白月光');
            if (long) next = putField(next, name, { lastSeenDay: day });
        }
        return next;
    },
    // 绿茶：情敌（其他好感达「心动」的在场角色）在场那一楼，其好感上升 ×1.5，情敌的吃醋结算加倍。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '绿茶')) {
            if (!api.here.has(name)) continue;
            const rivals = [...api.here].filter((n) => n !== name && next.characters[n] && dimOf(next.characters[n], '好感') >= HEART_FROM);
            if (!rivals.length) continue;
            for (const c of mine(api, name, '好感', (x) => plainFavor(x) && gainOf(x) > 0)) next = api.bump(next, name, '好感', Math.max(1, Math.round(gainOf(c) * 0.5)), '绿茶');
            for (const r of rivals) {
                for (const c of mine(api, r, '好感', (x) => fromTag(x) && x.note === '吃醋' && gainOf(x) < 0)) { undone.add(c); next = api.bump(next, r, '好感', gainOf(c), '绿茶'); }
                for (const c of mine(api, r, '芥蒂', (x) => fromTag(x) && x.note === '吃醋' && gainOf(x) > 0)) { undone.add(c); next = api.bump(next, r, '芥蒂', gainOf(c), '绿茶'); }
            }
        }
        return next;
    },
    // 舔狗：被冷落、拒绝那一楼好感不降、芥蒂不升，压力小升。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '舔狗')) {
            if (!next.characters[name] || !hasCold(api, name)) continue;
            next = undoAll(next, api, name, '好感', mine(api, name, '好感', (c) => fromTag(c) && gainOf(c) < 0), '舔狗');
            next = undoAll(next, api, name, '芥蒂', mine(api, name, '芥蒂', (c) => fromTag(c) && gainOf(c) > 0), '舔狗');
            next = moveStress(next, api.ctx.changes, name, STRESS_SMALL, '舔狗', api);
        }
        return next;
    },
    // 绿帽癖（NSFW，hasTrait 已按开关过滤）：不按吃醋结算，改为欲望上升一档、压力小降。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '绿帽癖')) {
            if (!next.characters[name]) continue;
            if (!dirOf(api, 'favor', name).some((d) => d.value === '吃醋')) continue;
            next = undoJealousy(next, api, name, '绿帽癖');
            next = api.bump(next, name, '欲望', DESIRE_STEP, '绿帽癖');
            next = moveStress(next, api.ctx.changes, name, -STRESS_SMALL, '绿帽癖', api);
        }
        return next;
    },
    // 海王：自身不按吃醋结算；其与两名以上「心动」对象同楼在场时，每名对象每天一次芥蒂上升一大档（发现了彼此）。
    (state, api) => {
        let next = state;
        const day = num(next.clock && next.clock.day);
        for (const name of traitHolders(api, next, '海王')) {
            if (!next.characters[name]) continue;
            next = undoJealousy(next, api, name, '海王');
            if (!api.here.has(name)) continue;
            const lovers = [...api.here].filter((n) => n !== name && next.characters[n] && dimOf(next.characters[n], '好感') >= HEART_FROM);
            if (lovers.length < 2) continue;
            for (const n of lovers) {
                if (num(next.characters[n].seaKingDay) === day && day) continue;
                next = api.bump(next, n, '芥蒂', GRUDGE_BIG, '海王');
                next = putField(next, n, { seaKingDay: day });
            }
        }
        return next;
    },
    // 钓系：主角示好（送礼、约会类事件）而其被冷处理的那一楼，主角压力小升。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '钓系')) {
            if (!next.characters[name] || !hasCold(api, name)) continue;
            if (!api.directives.some((d) => d.target === name && isCourt(d))) continue;
            next = api.bumpHeroStress(next, api.SMALL.压力, '钓系');
        }
        return next;
    },
    // 人间清醒：示好类事件（送礼、约会类）对其好感上升 ×0.5；吃醋结算不影响。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '人间清醒')) {
            if (!next.characters[name]) continue;
            next = undoJealousy(next, api, name, '人间清醒');
            if (!api.directives.some((d) => d.target === name && isCourt(d))) continue;
            for (const c of mine(api, name, '好感', (x) => plainFavor(x) && gainOf(x) > 0)) {
                const cut = Math.floor(gainOf(c) / 2);
                if (cut > 0) next = api.bump(next, name, '好感', -cut, '人间清醒');
            }
        }
        return next;
    },
    // 恋爱军师：其对主角的欲望不上升。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '恋爱军师')) {
            if (!next.characters[name]) continue;
            next = undoAll(next, api, name, '欲望', mine(api, name, '欲望', (c) => fromTag(c) && gainOf(c) > 0), '恋爱军师');
        }
        return next;
    },
    // 嘴替：主角压力上升「大」及以上那一楼，其在场时主角压力小降。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '嘴替')) {
            if (api.here.has(name) && api.heroBigStress(api.directives)) next = api.bumpHeroStress(next, -api.SMALL.压力, '嘴替');
        }
        return next;
    },
    // 社畜（主角）：打工那一楼体力消耗 ×1.5。
    (state, api) => {
        if (!api.has(state, '主角', '社畜') || !(api.ctx.flags && api.ctx.flags.work)) return state;
        return putBar(state, api.ctx.changes, '主角', 'stamina', num(state.protagonist.bars.stamina) - Math.round(WORK_STAMINA * 0.5), '社畜');
    },
    // 富二代（主角）：打工收入低一档。
    (state, api) => (api.has(state, '主角', '富二代') ? incomeDown(state, api, '富二代') : state),
    // 电子宠物：主角一互动，压力清回缺席前的原值。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '电子宠物')) {
            const cur = next.characters[name];
            if (!cur || cur.petBase === undefined || !api.directives.some((d) => d.target === name)) continue;
            const { petBase, ...rest } = cur;
            next = { ...next, characters: { ...next.characters, [name]: rest } };
            next = moveStress(next, api.ctx.changes, name, num(petBase) - stressOf(cur), '电子宠物', api);
        }
        return next;
    },

    // ---- 合成独有效果（只读 combo 键）----
    // 孤狼：信任一旦过半，不再下降。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '孤狼')) {
            next = undoAll(next, api, name, '信任', mine(api, name, '信任', (c) => gainOf(c) < 0 && num(c.from) > HALF), '孤狼');
        }
        return next;
    },
    // 千年狐狸：主角对其了解不超过一半（欲望不消退见日结算）。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '千年狐狸')) if (next.characters[name] && dimOf(next.characters[name], '了解') > HALF) next = putDim(next, api.ctx.changes, name, '了解', HALF, '千年狐狸');
        return next;
    },
    // 受惊小兔、金丝雀：主角在场那一楼其压力不上升。
    (state, api) => {
        let next = state;
        for (const combo of ['受惊小兔', '金丝雀']) {
            for (const name of comboHolders(api, combo)) {
                if (!api.here.has(name)) continue;
                next = undoAll(next, api, name, 'stress', mine(api, name, 'stress', (c) => c.source !== 'trait' && gainOf(c) > 0), combo);
            }
        }
        return next;
    },
    // 意难平：其不在场时，其他角色对主角的好感上升打折扣（减半）。
    (state, api) => {
        let next = state;
        for (const holder of comboHolders(api, '意难平')) {
            if (api.here.has(holder)) continue;
            for (const name of Object.keys(next.characters)) {
                if (name === holder) continue;
                for (const c of mine(api, name, '好感', (x) => plainFavor(x) && gainOf(x) > 0)) {
                    const cut = Math.floor(gainOf(c) / 2);
                    if (cut > 0) { undone.add(c); next = api.bump(next, name, '好感', -cut, '意难平'); }
                }
            }
        }
        return next;
    },
    // 温柔刀：主角对其了解越过一半那一楼，主角压力上升一大档、其好感上升一大档。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '温柔刀')) {
            if (!mine(api, name, '了解', (c) => num(c.from) <= HALF && num(c.to) > HALF).length) continue;
            next = api.bumpHeroStress(next, STRESS_BIG, '温柔刀');
            next = api.bump(next, name, '好感', FAVOR_BIG, '温柔刀');
        }
        return next;
    },
    // 霸总：主角花钱由其承担，每天最多一次。
    (state, api) => {
        let next = state;
        const day = num(next.clock && next.clock.day);
        for (const name of comboHolders(api, '霸总')) {
            const cur = next.characters[name];
            if (!cur || (num(cur.coverDay) === day && day)) continue;
            const spent = mine(api, '主角', 'money', (c) => fromTag(c) && gainOf(c) < 0)[0];
            if (!spent) continue;
            undone.add(spent);
            next = putBar(next, api.ctx.changes, '主角', 'money', num(next.protagonist.bars.money) - gainOf(spent), '霸总');
            next = putField(next, name, { coverDay: day });
            break;
        }
        return next;
    },
    // 追妻火葬场：芥蒂清零那一楼好感上升一大档。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '追妻火葬场')) {
            if (mine(api, name, '芥蒂', (c) => num(c.from) > 0 && num(c.to) === 0).length) next = api.bump(next, name, '好感', FAVOR_BIG, '追妻火葬场');
        }
        return next;
    },
    // 干饭王：一起吃饭（其进食且同楼在场）那一楼，主角与其压力都下降一大档。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '干饭王')) {
            if (!api.here.has(name) || !api.directives.some((d) => d.kind === 'stamina' && d.value === '进食' && d.target === name)) continue;
            next = api.bumpHeroStress(next, -STRESS_BIG, '干饭王');
            next = moveStress(next, api.ctx.changes, name, -STRESS_BIG, '干饭王', api);
        }
        return next;
    },
    // 战神（主角）：战斗结束后体力不低于一成；战斗那一楼压力不上升。
    (state, api) => {
        if (!hasCombo(api, '主角', '战神') || !(api.ctx.flags && api.ctx.flags.battle)) return state;
        let next = state;
        if (num(next.protagonist.bars.stamina) < 10) next = putBar(next, api.ctx.changes, '主角', 'stamina', 10, '战神');
        return undoAll(next, api, '主角', 'stress', mine(api, '主角', 'stress', (c) => c.source !== 'trait' && gainOf(c) > 0), '战神');
    },
    // 大恶魔：主角压力过半时，其好感与欲望上升加快（×1.5）；主角压力满那一楼其欲望拉满。
    (state, api) => {
        let next = state;
        const hero = num(next.protagonist.bars.stress);
        if (hero <= HALF) return next;
        for (const name of comboHolders(api, '大恶魔')) {
            for (const dim of ['好感', '欲望']) {
                for (const c of mine(api, name, dim, (x) => (dim === '好感' ? plainFavor(x) : fromTag(x)) && gainOf(x) > 0)) next = api.bump(next, name, dim, Math.max(1, Math.round(gainOf(c) * 0.5)), '大恶魔');
            }
            if (hero >= 100 && next.characters[name]) next = putDim(next, api.ctx.changes, name, '欲望', 100, '大恶魔');
        }
        return next;
    },
    // 天使：在场所有角色对其不记芥蒂（其芥蒂不上升）。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '天使')) {
            next = undoAll(next, api, name, '芥蒂', mine(api, name, '芥蒂', (c) => c.source !== 'trait' && gainOf(c) > 0), '天使');
        }
        return next;
    },
    // 亡命鸳鸯：两人同在一楼时，双方压力不上升。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '亡命鸳鸯')) {
            if (!api.here.has(name)) continue;
            for (const who of [name, '主角']) next = undoAll(next, api, who, 'stress', mine(api, who, 'stress', (c) => c.source !== 'trait' && gainOf(c) > 0), '亡命鸳鸯');
        }
        return next;
    },
    // 永动机（NSFW）：亲密不消耗其体力。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '永动机')) {
            for (const c of mine(api, name, 'stamina', (x) => x.note === '亲密' && gainOf(x) < 0)) { undone.add(c); next = putBar(next, api.ctx.changes, name, 'stamina', num(c.from), '永动机'); }
        }
        return next;
    },
    // 主宰（NSFW，主角合成）：亲密那一楼，对方欲望下限提到一半。
    (state, api) => {
        let next = state;
        if (!hasCombo(api, '主角', '主宰')) return next;
        for (const d of api.directives) {
            if (d.kind !== 'intimate' || !d.target || !next.characters[d.target]) continue;
            if (dimOf(next.characters[d.target], '欲望') < HALF) next = putDim(next, api.ctx.changes, d.target, '欲望', HALF, '主宰');
        }
        return next;
    },
    // 专属宠物（NSFW）：亲密后其对主角芥蒂清零。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '专属宠物')) {
            if (next.characters[name] && api.directives.some((d) => d.kind === 'intimate' && d.target === name)) next = putDim(next, api.ctx.changes, name, '芥蒂', 0, '专属宠物');
        }
        return next;
    },
    // 咸鱼（主角）：打工收入低一档。
    (state, api) => (hasCombo(api, '主角', '咸鱼') ? incomeDown(state, api, '咸鱼') : state),
];

// ---- 日结算钩子 ----
export const DAILY_HOOKS = [
    // 显眼包：其在场的日子，主角压力每天额外小降。
    (state, api) => {
        let next = state;
        for (const name of traitHolders(api, next, '显眼包')) if (api.present.has(name)) next = api.shiftStress('主角', -api.TRAIT_STRESS_DAILY, '显眼包');
        return next;
    },
    // 电子宠物：主角多日不在，压力上升 ×2（基础缓升之外再补一份），并记下缺席前的压力原值，互动时清回。
    // api.shiftStress 以内部状态为准，所以先全部调完压力，再统一写原值记录。
    (state, api) => {
        let next = state;
        const bases = [];
        for (const name of traitHolders(api, state, '电子宠物')) {
            const cur = state.characters[name];
            if (!cur || api.present.has(name) || num(cur.lastSeenDay) >= api.day - 1) continue;
            if (cur.petBase === undefined) bases.push([name, (api.changes.find((c) => c.target === name && c.key === 'stress' && c.note === '主角不在身边') || { from: stressOf(cur) }).from]);
            next = api.shiftStress(name, api.TRAIT_STRESS_DAILY, '电子宠物');
        }
        for (const [name, base] of bases) next = putField(next, name, { petBase: num(base) });
        return next;
    },
    // 小太阳：其在场的日子，在场所有角色（含主角）压力每天额外下降。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '小太阳')) {
            if (!api.present.has(name)) continue;
            for (const who of ['主角', ...api.present]) if (who === '主角' || next.characters[who]) next = api.shiftStress(who, -api.TRAIT_STRESS_DAILY, '小太阳');
        }
        return next;
    },
    // 咸鱼：压力每天下降一大档。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '咸鱼')) next = api.shiftStress(name, -STRESS_BIG, '咸鱼');
        return next;
    },
    // 金丝雀：离开主角多日，压力加速上升（每天额外一份缓升）。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '金丝雀')) {
            const cur = next.characters[name];
            if (cur && !api.present.has(name) && num(cur.lastSeenDay) < api.day - 1) next = api.shiftStress(name, api.TRAIT_STRESS_DAILY, '金丝雀');
        }
        return next;
    },
    // 高冷猫猫：好感过「喜欢」后不再冷却（把当日的冷却还回）。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '高冷猫猫')) {
            const hit = api.changes.find((c) => c.target === name && c.key === '好感' && c.note === '冷却' && num(c.from) >= LIKE_FROM);
            if (hit) next = putDim(next, api.changes, name, '好感', num(hit.from), '高冷猫猫');
        }
        return next;
    },
    // 千年狐狸、禁欲系破戒：欲望不自然消退（千年狐狸全程，禁欲系破戒仅过半后）。
    (state, api) => {
        let next = state;
        for (const [combo, over] of [['千年狐狸', -1], ['禁欲系破戒', HALF]]) {
            for (const name of comboHolders(api, combo)) {
                const hit = api.changes.find((c) => c.target === name && c.key === '欲望' && c.note === '淡忘' && num(c.from) > over);
                if (hit) next = putDim(next, api.changes, name, '欲望', num(hit.from), combo);
            }
        }
        return next;
    },
    // 一撩就倒（NSFW）：主角在场的日子，其欲望每天自然回升一档。
    (state, api) => {
        let next = state;
        for (const name of comboHolders(api, '一撩就倒')) if (api.present.has(name) && next.characters[name]) next = putDim(next, api.changes, name, '欲望', dimOf(next.characters[name], '欲望') + DESIRE_STEP, '一撩就倒');
        return next;
    },
];

// ---- 检定骰 ----
const DICE_HERE = (c, ctx) => Boolean(ctx && ctx.here === true);
export const DICE = [
    // 腹黑：主角对其社交检定多一个惩罚骰，了解过半后恢复。
    ['腹黑', '社交', -1, (c) => dimOf(c, '了解') <= HALF],
    // 小笨蛋：自身各类检定多一个惩罚骰。
    ['小笨蛋', '全部', -1],
    // 绿茶：主角对其社交检定多一个惩罚骰。
    ['绿茶', '社交', -1],
    // 恋爱军师：在场时，主角对他人示好的检定多一个奖励骰。
    ['恋爱军师', '社交', 1, DICE_HERE],
    // 键盘侠：社交（言语对抗）检定多一个奖励骰。
    ['键盘侠', '社交', 1],
];
