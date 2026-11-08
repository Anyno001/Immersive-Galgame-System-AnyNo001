// 特质规则分文件：极端性格、资源互换、床上专属。由 stat-traits.js 与 stat-trait-hooks.js 汇总，本文件不得 import stat-traits.js（避免循环）。
// SCALE：[特质键, 维度, 方向(up/down/cool/fade/jealous…), 系数, 条件(character, ctx)?]
// FLAG：[标记, 特质键, 条件?]；DAILY：[特质键, 维度, 数值]
// TAG_HOOKS：每楼事件钩子 (state, api) => state；DAILY_HOOKS：日结算钩子 (state, api) => state。api 见 stat-trait-hooks.js。
// 只改数值，不碰战斗与亲密对决的牌组、主导权、回合与牌效；战斗胜负、亲密只当事件读。
// 本文件经 stat-state → stat-traits → 规则汇总形成循环引用，导入的函数与常量只在函数体内使用，不在顶层求值。
import { DEFAULT_MONEY_TABLE, STRESS_STRENGTH_DELTA } from './stat-bars.js';
import { barsOf, clamp, withBars, withCharacter } from './stat-state.js';
import { shiftStress } from './stat-strain.js';
import { MONEY_TIERS } from './stat-vocab.js';

const HERO = '主角';
const HALF = 50;
// 「富裕」档的金额线：对照现有金钱分档表（少量 20 / 普通 100 / 昂贵 500 / 巨额 3000），取「昂贵」档 500 起算。
export const RICH_FROM = 500;
const stressOf = (character) => Number(character && character.bars && character.bars.stress) || 0;

export const SCALE = [
    // 极端性格
    // 花痴：人设写明的「颜值高」无法在结算里判定，这里对其自身好感、欲望上升与冷却一律生效。
    ['花痴', '好感', 'up', 2], ['花痴', '欲望', 'up', 2], ['花痴', '好感', 'cool', 2],
    ['无欲无求', '好感', 'up', 0.5],
    ['偏执狂', '信任', 'up', 0.5],
    ['没心没肺', '芥蒂', 'fade', 2], ['没心没肺', '了解', 'up', 0.5],
    ['佛系', '芥蒂', 'up', 0.5], ['佛系', '压力', 'up', 0.75],
    // 疯批：压力过半起，其欲望与好感上升更快。
    ['疯批', '欲望', 'up', 1.5, (c) => stressOf(c) >= HALF], ['疯批', '好感', 'up', 1.5, (c) => stressOf(c) >= HALF],
];
export const FLAG = [
    ['noCool', '无欲无求'],
    ['noFade:芥蒂', '偏执狂'],
];
export const DAILY = [];

// ---- 小工具：生活条与小记录，全部返回新 state，不原地改 ----
const isHero = (name) => name === HERO;
const known = (state, name) => isHero(name) || Boolean(state.characters[name]);
const barsFor = (state, name) => (isHero(name) ? state.protagonist.bars : barsOf(state.characters[name]));
const putBars = (state, name, bars) => (isHero(name) ? withBars(state, bars) : withCharacter(state, name, { ...state.characters[name], bars }));
const holders = (state) => [HERO, ...Object.keys(state.characters)];

// 体力、金钱、压力的增减：api 没有通用工具，这里基于 withBars / withCharacter 自行实现；压力走 shiftStress（沿用转换与沦陷规则）；变动记进 changes。
function moveBar(state, name, key, delta, note, changes, source = 'trait') {
    if (!delta || !known(state, name)) return state;
    const bars = barsFor(state, name);
    const from = Number(bars[key]) || 0;
    const moved = key === 'stress' ? shiftStress(bars, delta) : { ...bars, [key]: key === 'stamina' ? clamp(from + delta, 0, 100) : from + delta };
    const to = Number(moved[key]) || 0;
    if (to === from) return state;
    changes.push({ source, target: name, key, from, to, note });
    return putBars(state, name, moved);
}

// 欲望设为某值（只在该角色有欲望维度时生效）。
function setDesire(state, name, to, note, changes, source = 'daily') {
    const cur = state.characters[name];
    if (!cur || !cur.dims || !Object.hasOwn(cur.dims, '欲望')) return state;
    const from = Number(cur.dims.欲望) || 0;
    const next = clamp(to, 0, 100);
    if (next === from) return state;
    changes.push({ source, target: name, key: '欲望', from, to: next, note });
    return withCharacter(state, name, { ...cur, dims: { ...cur.dims, 欲望: next } });
}

// 特质小记录 traitMarks：主角存在 protagonist，角色存在角色档案；没有要写的内容就不动。
const marksOf = (state, name) => (isHero(name) ? state.protagonist.traitMarks : state.characters[name] && state.characters[name].traitMarks) || {};
function setMarks(state, name, patch) {
    if (!known(state, name) || !Object.keys(patch).length) return state;
    const merged = { ...marksOf(state, name), ...patch };
    return isHero(name)
        ? { ...state, protagonist: { ...state.protagonist, traitMarks: merged } }
        : withCharacter(state, name, { ...state.characters[name], traitMarks: merged });
}

const intimateOf = (directives, name) => directives.some((d) => d.kind === 'intimate' && (isHero(name) ? Boolean(d.target || d.crowd) : d.target === name));
// 本楼某人某维度已发生的增量（只数 tag / trait 来源）。
const gainOf = (list, name, key) => list.filter((c) => c.target === name && c.key === key && c.to > c.from && (c.source === 'tag' || c.source === 'trait')).reduce((s, c) => s + (c.to - c.from), 0);
const half = (n) => Math.max(1, Math.round(n * 0.5));
const stressUpOf = (directives, name) => directives.filter((d) => d.kind === 'stress' && d.value === '上升' && (isHero(name) ? !d.target : d.target === name));
const forTarget = (d, name) => (isHero(name) ? !d.target : d.target === name);

export const TAG_HOOKS = [
    // 战斗狂、厌战：只读战斗胜负与撤退，改压力。
    (state, api) => {
        const { ctx, directives } = api;
        const battle = ctx.flags && ctx.flags.battle;
        if (!battle) return state;
        const retreat = battle.outcome === '撤';
        const won = battle.outcome !== '败' && !retreat;
        let next = state;
        const people = [HERO, ...(battle.ally && next.characters[battle.ally] ? [battle.ally] : [])];
        for (const name of people) {
            // 战斗狂：取胜压力下降一大档，撤退压力小升；打过仗就记下战斗日，供日结算判断多日无战斗。
            if (api.has(next, name, '战斗狂')) {
                if (won) next = moveBar(next, name, 'stress', STRESS_STRENGTH_DELTA.下降.大, '战斗狂', ctx.changes);
                else if (retreat) next = moveBar(next, name, 'stress', STRESS_STRENGTH_DELTA.上升.小, '战斗狂·撤退', ctx.changes);
                next = setMarks(next, name, { lastBattleDay: next.clock.day });
            }
            // 魔族：战斗胜利那一楼压力下降一档。
            if (api.has(next, name, '魔族') && won) next = moveBar(next, name, 'stress', STRESS_STRENGTH_DELTA.下降.中, '魔族', ctx.changes);
            // 厌战：战斗那一楼其压力上升再来一遍（共 ×2）。
            if (api.has(next, name, '厌战')) {
                const extra = stressUpOf(directives, name).reduce((s, d) => s + (STRESS_STRENGTH_DELTA.上升[d.strength || '中'] || 10), 0);
                next = moveBar(next, name, 'stress', extra, '厌战', ctx.changes);
                // 厌战：撤退压力下降一小档。
                if (retreat) next = moveBar(next, name, 'stress', STRESS_STRENGTH_DELTA.下降.小, '厌战·撤退', ctx.changes);
            }
        }
        return next;
    },
    // 金钱与压力互换：吝啬鬼、购物解压、存款即安全感（跌出富裕）。读本楼标签落下的金钱变动。
    (state, api) => {
        const { ctx, directives } = api;
        const snapshot = [...ctx.changes];
        let next = state;
        for (const name of holders(next)) {
            const money = snapshot.filter((c) => c.target === name && c.key === 'money' && c.source === 'tag');
            const earned = money.some((c) => c.to > c.from);
            const spent = money.some((c) => c.to < c.from);
            // 吝啬鬼：收入时压力下降，花钱时压力上升再翻倍（一小档的两倍）。
            if (api.has(next, name, '吝啬鬼')) {
                if (earned) next = moveBar(next, name, 'stress', -api.SMALL.压力, '吝啬鬼', ctx.changes);
                if (spent) next = moveBar(next, name, 'stress', api.SMALL.压力 * 2, '吝啬鬼', ctx.changes);
                // 送礼类好感折半：本楼对其只有送礼、没有好感标签时，退回一半增量。
                if (!isHero(name) && directives.some((d) => d.kind === 'gift' && d.target === name) && !directives.some((d) => d.kind === 'favor' && d.target === name)) {
                    const gained = gainOf(snapshot, name, '好感');
                    if (gained > 0) next = api.bump(next, name, '好感', -Math.floor(gained * 0.5), '吝啬鬼');
                }
            }
            // 购物解压：花钱那一楼压力下降一小档，每天最多一次。
            if (spent && api.has(next, name, '购物解压') && marksOf(next, name).shopDay !== next.clock.day) {
                next = moveBar(next, name, 'stress', -api.SMALL.压力, '购物解压', ctx.changes);
                next = setMarks(next, name, { shopDay: next.clock.day });
            }
            // 存款即安全感：本楼金钱跌出「富裕」，压力小升。
            if (api.has(next, name, '存款即安全感') && money.some((c) => c.from >= RICH_FROM && c.to < RICH_FROM)) next = moveBar(next, name, 'stress', api.SMALL.压力, '存款即安全感', ctx.changes);
        }
        return next;
    },
    // 资源互换：化悲愤为食欲、运动解压、睡一觉就好、压力变动力。
    (state, api) => {
        const { ctx, directives } = api;
        const snapshot = [...ctx.changes];
        let next = state;
        for (const name of holders(next)) {
            // 化悲愤为食欲：压力过半时进食，体力回复 ×1.5（补上多出的一半）。
            if ((Number(barsFor(next, name).stress) || 0) >= HALF && api.has(next, name, '化悲愤为食欲')) {
                const ate = snapshot.filter((c) => c.target === name && c.key === 'stamina' && c.source === 'tag' && c.note === '进食' && c.to > c.from).reduce((s, c) => s + (c.to - c.from), 0);
                if (ate > 0) next = moveBar(next, name, 'stamina', half(ate), '化悲愤为食欲', ctx.changes);
            }
            // 运动解压：体力消耗「中」及以上那一楼，压力下降一小档。
            if (api.has(next, name, '运动解压') && directives.some((d) => d.kind === 'stamina' && (d.value === '中' || d.value === '重') && forTarget(d, name))) {
                next = moveBar(next, name, 'stress', -api.SMALL.压力, '运动解压', ctx.changes);
            }
            // 睡一觉就好：入睡时压力下降 ×2（入睡标签不带角色，只算主角；补上与自然回落相当的一份）。
            if (isHero(name) && api.has(next, name, '睡一觉就好') && directives.some((d) => d.kind === 'sleep')) next = moveBar(next, name, 'stress', -10, '睡一觉就好', ctx.changes);
        }
        // 压力变动力：压力过半时打工收入高一档（补上与高一档的差额）。
        const work = ctx.flags && ctx.flags.work;
        if (work && work.income && api.has(next, HERO, '压力变动力') && (Number(next.protagonist.bars.stress) || 0) >= HALF) {
            const table = ctx.moneyTable || DEFAULT_MONEY_TABLE;
            const up = MONEY_TIERS[MONEY_TIERS.indexOf(work.income) + 1];
            const gap = up ? (Number(table[up]) || 0) - (Number(table[work.income]) || 0) : 0;
            next = moveBar(next, HERO, 'money', gap, '压力变动力', ctx.changes);
        }
        return next;
    },
    // 床上专属（NSFW 关闭时 has 恒为假）：本楼有亲密标签才结算，只动欲望、体力、压力、好感、信任。
    (state, api) => {
        const { ctx, directives } = api;
        const snapshot = [...ctx.changes];
        const day = state.clock.day;
        let next = state;
        for (const name of holders(next)) {
            const involved = intimateOf(directives, name);
            const has = (id) => api.has(next, name, id);
            const marks = marksOf(next, name);
            const patch = {};
            const desireGain = isHero(name) ? 0 : gainOf(snapshot, name, '欲望');
            const spent = snapshot.filter((c) => c.target === name && c.key === 'stamina' && c.note === '亲密' && c.to < c.from).reduce((s, c) => s + (c.from - c.to), 0);
            if (involved) {
                if (has('体力怪物') && spent > 0) next = moveBar(next, name, 'stamina', half(spent), '体力怪物', ctx.changes);
                if (has('一碰就软') && spent > 0) next = moveBar(next, name, 'stamina', -half(spent), '一碰就软', ctx.changes);
                if (has('秒回血')) next = moveBar(next, name, 'stamina', 10, '秒回血', ctx.changes);
                if (has('敏感体质') && desireGain > 0) next = api.bump(next, name, '欲望', desireGain, '敏感体质');
                if (has('一碰就软') && desireGain > 0) next = api.bump(next, name, '欲望', half(desireGain), '一碰就软');
                if (has('事后黏人') && !isHero(name)) {
                    next = api.bump(next, name, '好感', api.SMALL.好感, '事后黏人');
                    next = api.bump(next, name, '信任', api.SMALL.信任, '事后黏人');
                }
                // 初体验：第一次亲密好感上升一大档、压力小升；firstDone 记下，之后不再触发（特质自身的摘下由上层处理）。
                if (has('初体验') && !marks.firstDone) {
                    if (!isHero(name)) next = api.bump(next, name, '好感', api.BIG.好感, '初体验');
                    next = moveBar(next, name, 'stress', api.SMALL.压力, '初体验', ctx.changes);
                    patch.firstDone = true;
                    // 之后自动摘下：结算只记下，运行时据 flags.traitDrops 调 applyTraitChange 摘除。
                    ctx.flags.traitDrops = [...(ctx.flags.traitDrops || []), { name, id: '初体验' }];
                }
                // 调教中：每次亲密后，欲望自然消退的下限提高一小档，最高到一半（日结算落实）。
                if (has('调教中') && !isHero(name)) patch.trainFloor = Math.min(HALF, (Number(marks.trainFloor) || 0) + api.SMALL.欲望);
                if (has('反差萌') || has('夜夜笙歌')) patch.intimateDay = day;
            }
            // 反差萌：平时欲望上升折半；当天发生过亲密（含本楼）后加倍。
            if (has('反差萌') && desireGain > 0) {
                if (involved || marks.intimateDay === day) next = api.bump(next, name, '欲望', desireGain, '反差萌');
                else next = api.bump(next, name, '欲望', -Math.floor(desireGain * 0.5), '反差萌');
            }
            // 事后冷淡：亲密那一楼欲望清零，好感不因亲密上升（退回本楼好感增量）。
            if (involved && has('事后冷淡') && !isHero(name)) {
                const desire = Number(next.characters[name].dims && next.characters[name].dims.欲望) || 0;
                if (desire > 0) next = api.bump(next, name, '欲望', -desire, '事后冷淡');
                const favor = gainOf(snapshot, name, '好感');
                if (favor > 0) next = api.bump(next, name, '好感', -favor, '事后冷淡');
            }
            next = setMarks(next, name, patch);
        }
        return next;
    },
    // 无欲无求：欲望不上升（把本楼其他结算加上的欲望退回去）。放在床上专属之后，一并抵消。
    (state, api) => {
        const snapshot = [...api.ctx.changes];
        let next = state;
        for (const name of Object.keys(next.characters)) {
            if (!api.has(next, name, '无欲无求')) continue;
            const gained = gainOf(snapshot, name, '欲望');
            if (gained > 0) next = api.bump(next, name, '欲望', -gained, '无欲无求');
        }
        return next;
    },
];

// 日结算钩子：压力一律用本文件的 moveBar（来源 daily），不用 api.shiftStress，免得与本钩子里写的小记录互相覆盖。
export const DAILY_HOOKS = [
    (state, api) => {
        const { changes, day } = api;
        let next = state;
        for (const name of holders(next)) {
            const marks = marksOf(next, name);
            const patch = {};
            // 战斗狂：两天以上没有战斗，每天压力缓升；首次见到时从当天起算。
            if (api.has(next, name, '战斗狂')) {
                if (marks.lastBattleDay === undefined) patch.lastBattleDay = day;
                else if (day - marks.lastBattleDay >= 2) next = moveBar(next, name, 'stress', api.TRAIT_STRESS_DAILY, '战斗狂', changes, 'daily');
            }
            // 存款即安全感：金钱在「富裕」档及以上，每天压力额外下降一小档。
            if (api.has(next, name, '存款即安全感') && (Number(barsFor(next, name).money) || 0) >= RICH_FROM) next = moveBar(next, name, 'stress', -api.TRAIT_STRESS_DAILY, '存款即安全感', changes, 'daily');
            // 夜夜笙歌：欲望每天自然回升一档；连续两天未亲密，压力小升。
            if (api.has(next, name, '夜夜笙歌')) {
                if (!isHero(name)) next = setDesire(next, name, (Number(next.characters[name].dims && next.characters[name].dims.欲望) || 0) + 2, '夜夜笙歌', changes);
                if (marks.intimateDay === undefined) patch.intimateDay = day;
                else if (day - marks.intimateDay >= 2) next = moveBar(next, name, 'stress', 5, '夜夜笙歌', changes, 'daily');
            }
            // 调教中：欲望自然消退不低于已累积的下限（只拦「从下限以上掉到下限以下」的那次淡忘）。
            if (!isHero(name) && api.has(next, name, '调教中') && Number(marks.trainFloor) > 0) {
                const faded = changes.some((c) => c.target === name && c.key === '欲望' && c.note === '淡忘' && c.from >= marks.trainFloor && c.to < marks.trainFloor);
                if (faded) next = setDesire(next, name, marks.trainFloor, '调教中', changes);
            }
            next = setMarks(next, name, patch);
        }
        return next;
    },
];

// DICE：[特质键, 检定类别(社交/战斗/技术/敏捷/手工/学习/全部…), 奖惩骰数(+1 奖励 / -1 惩罚), 条件(character, ctx)?]
export const DICE = [
    ['战斗狂', '战斗', 1],
    // 越累越清醒：体力低于三成。主角没有角色档案，调用方在 ctx.stamina 传入检定者体力；NPC 读自身 bars。
    ['越累越清醒', '全部', 1, (c, ctx) => {
        const own = ctx && Number.isFinite(Number(ctx.stamina)) ? Number(ctx.stamina) : Number(c && c.bars && c.bars.stamina);
        return Number.isFinite(own) && own < 30;
    }],
];
