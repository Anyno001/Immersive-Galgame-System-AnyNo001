// 特质规则分文件（E2b）：羁绊加成、情绪传染、地点归属、天气季节、守约与失约。
// 由 stat-trait-rules.js 汇总；本文件不得 import stat-traits.js（避免循环），只改数值，不碰战斗与亲密对决规则，不注入正文、不加标签。
// 环境读取：地点、天气来自 ctx.place、ctx.weather（见 stat-trait-env.js），日期取 clock.lastDate；读不到一律静默不生效。
// 存档字段都挂在 state.clock：e2bDays（每天一次的标记）、e2bHome（各人最近在家的日期）、e2bPlaces（去过的地点）。
import { DIM_MAX, barsOf, clamp, withBars, withCharacter, withClock } from './stat-state.js';
import { shiftStress } from './stat-strain.js';
import { calcRow, withCalc } from './stat-status-defs.js';
import { parseDate } from './stat-date.js';

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];

const HERO = '主角';
// 一小档与每日缓变量：与 stat-trait-hooks 同量级（压力小档 5、日结算 3、好感小档 2、信任小档 1）。
const STRESS_DAY = 3;
const STRESS_SMALL = 5;
const FAVOR_SMALL = 2;
const TRUST_SMALL = 1;
const GRUDGE_SMALL = 2;
const AWAY_DAYS = 3;
const PLACES_MAX = 40;
// 认床：不在自己住处过夜，体力恢复打七五折；春困：春季体力恢复打八五折。
const BED_FACTOR = 0.75;
const SPRING_FACTOR = 0.85;

// ---- 羁绊加成 ----
// 「擅长」：特质 → 检定类别（类别名同 stat-trait-dice 的 diceCategories）；没有特质映射时，NPC 自身该技能不低于 60（同 NPC_STRONG_VALUE）也算。
export const BOND_DOMAIN_TRAITS = Object.freeze({
    学霸: ['学习'], 过目不忘: ['学习'], 黑客: ['技术'], 战斗狂: ['战斗'], 杀手: ['战斗'], 话痨: ['社交'], 社牛: ['社交'], 贤惠: ['手工'],
});
export const BOND_STRONG_SKILL = 60;

// 恋人（档案 romance 为真）或信任满的在场 NPC，在其擅长领域给主角的检定多一个奖励骰。
// has(name, id)：特质读取；skillOf(name)：该 NPC 此次检定所用技能的值（读不到传 null）。返回 { edge, from, via } 或 null。
export function bondStrengthEdge(state, { present = [], categories = [], has, skillOf = null }) {
    for (const name of present) {
        const c = state && state.characters && state.characters[name];
        if (!c) continue;
        const bonded = c.romance === true || (Number(c.dims && c.dims.信任) || 0) >= DIM_MAX;
        if (!bonded) continue;
        for (const [id, cats] of Object.entries(BOND_DOMAIN_TRAITS)) if (has(name, id) && cats.some((x) => categories.includes(x))) return { edge: 1, from: name, via: id };
        if (skillOf && skillOf(name) >= BOND_STRONG_SKILL) return { edge: 1, from: name, via: '技能' };
    }
    return null;
}

// ---- 工具 ----
const here = (api, name) => name === HERO || api.here.has(name);
const holders = (state, api, id) => [HERO, ...Object.keys(state.characters)].filter((n) => api.has(state, n, id) && here(api, n));

// 每天一次的标记：返回新 state，当天已记过返回 null。
function once(state, key) {
    const day = state.clock.day;
    const map = state.clock.e2bDays && typeof state.clock.e2bDays === 'object' ? state.clock.e2bDays : {};
    if (map[key] === day) return null;
    return withClock(state, { e2bDays: { ...map, [key]: day } });
}

function stress(state, name, delta, note, changes, source, extra = []) {
    if (!delta) return state;
    const hero = name === HERO;
    const cur = hero ? null : state.characters[name];
    if (!hero && !cur) return state;
    const bars = hero ? state.protagonist.bars : barsOf(cur);
    const moved = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(moved.stress) || 0;
    if (to === from) return state;
    changes.push(withCalc({ source, target: name, key: 'stress', from, to, note }, { calc: [calcRow('来源', note), ...extra, calcRow('基础量', delta), calcRow('结果', to - from)] }));
    return hero ? withBars(state, moved) : withCharacter(state, name, { ...cur, bars: moved });
}

function dim(state, name, key, amount, note, changes) {
    const cur = state.characters[name];
    if (!cur || !cur.dims || !amount) return state;
    const from = Number(cur.dims[key]) || 0;
    const to = clamp(from + amount, -DIM_MAX, DIM_MAX);
    if (to === from) return state;
    changes.push(withCalc({ source: 'trait', target: name, key, from, to, note }, { calc: [calcRow('来源', note), calcRow('基础量', amount), calcRow('结果', to - from)] }));
    return withCharacter(state, name, { ...cur, dims: { ...cur.dims, [key]: to } });
}

// 体力恢复打折：以日结算已记的恢复量为基础，按当前体力补差额。
function scaleRecovery(state, name, factor, note, changes) {
    const rec = [...changes].reverse().find((c) => c.source === 'daily' && c.target === name && c.key === 'stamina' && c.note === '日结算' && c.to > c.from);
    if (!rec) return state;
    const hero = name === HERO;
    const cur = hero ? null : state.characters[name];
    if (!hero && !cur) return state;
    const bars = hero ? state.protagonist.bars : barsOf(cur);
    const now = Number(bars.stamina) || 0;
    const gain = now - rec.from;
    if (gain <= 0) return state;
    const to = clamp(rec.from + Math.round(gain * factor), 0, 100);
    if (to >= now) return state;
    changes.push(withCalc({ source: 'daily', target: name, key: 'stamina', from: now, to, note }, { calc: [calcRow('来源', note), calcRow('原恢复量', gain), calcRow('系数', factor), calcRow('结果', to - now)] }));
    const next = { ...bars, stamina: to };
    return hero ? withBars(state, next) : withCharacter(state, name, { ...cur, bars: next });
}

// 住处：地点名里带家、卧室等字样，排除他人的家与旅店。
const HOME = /家|住处|住所|寝室|卧室|宿舍|公寓|自宅|寓所|闺房|寝宫/;
const OTHER_HOME = /他家|她家|别人家|对方家|邻居家|朋友家|亲戚家|客栈|旅馆|酒店|旅店/;
export const isHomePlace = (place) => { const p = String(place || ''); return HOME.test(p) && !OTHER_HOME.test(p); };
const RAIN = /雨/;
// 春季：公历 3 至 5 月，农历正、二、三月；日期读不到不算。
export function isSpring(date) {
    const d = parseDate(date);
    if (!d) return false;
    return d.kind === 'lunar' ? d.month >= 1 && d.month <= 3 : d.month >= 3 && d.month <= 5;
}
const placeKey = (place) => String(place || '').trim().slice(0, 30);

// ---- 每楼钩子 ----

// 镇定剂：在场其他人本楼标签带来的压力上升减半（补回一半）。
function calmerHook(state, api) {
    const { ctx } = api;
    const calmers = holders(state, api, '镇定剂');
    if (!calmers.length) return state;
    let next = state;
    for (const c of ctx.changes.slice()) {
        if (c.source !== 'tag' || c.key !== 'stress' || c.to <= c.from) continue;
        if (!here(api, c.target) || calmers.every((n) => n === c.target)) continue;
        next = stress(next, c.target, -Math.floor((c.to - c.from) / 2), '镇定剂', ctx.changes, 'trait', [calcRow('本楼上升', c.to - c.from)]);
    }
    return next;
}

// 地点与天气：恋家（在家压力下降）、旅行者（新地点压力下降，NPC 另对主角好感小升）、雨天忧郁（雨天压力小升）。每人每天各一次。
function placeWeatherHook(state, api) {
    const { ctx } = api;
    const place = placeKey(ctx.place);
    let next = state;
    if (place && isHomePlace(place)) {
        for (const name of holders(next, api, '恋家')) {
            const marked = once(next, `恋家:${name}`);
            if (!marked) continue;
            next = stress(marked, name, -STRESS_DAY, '恋家·在家', ctx.changes, 'trait');
        }
        const map = next.clock.e2bHome && typeof next.clock.e2bHome === 'object' ? next.clock.e2bHome : {};
        const seen = holders(next, api, '恋家');
        if (seen.length) next = withClock(next, { e2bHome: { ...map, ...Object.fromEntries(seen.map((n) => [n, next.clock.day])) } });
    }
    if (place && [HERO, ...Object.keys(next.characters)].some((n) => api.has(next, n, '旅行者'))) {
        const known = Array.isArray(next.clock.e2bPlaces) ? next.clock.e2bPlaces : null;
        if (!known) next = withClock(next, { e2bPlaces: [place] });
        else if (!known.includes(place)) {
            next = withClock(next, { e2bPlaces: [...known, place].slice(-PLACES_MAX) });
            for (const name of holders(next, api, '旅行者')) {
                const marked = once(next, `旅行者:${name}`);
                if (!marked) continue;
                next = stress(marked, name, -STRESS_SMALL, '旅行者·新地点', ctx.changes, 'trait', [calcRow('地点', place)]);
                if (name !== HERO) next = dim(next, name, '好感', FAVOR_SMALL, '旅行者·好心情', ctx.changes);
            }
        }
    }
    if (RAIN.test(String(ctx.weather || ''))) {
        for (const name of holders(next, api, '雨天忧郁')) {
            const marked = once(next, `雨天忧郁:${name}`);
            if (!marked) continue;
            next = stress(marked, name, STRESS_DAY, '雨天忧郁', ctx.changes, 'trait', [calcRow('天气', String(ctx.weather))]);
        }
    }
    return next;
}

// 守约与失约（本楼 event 标签，不新开标签）：守约好感 +2、信任 +1；失约好感 -2、芥蒂 +2。同一人同一类每天一次。
function promiseHook(state, api) {
    const { ctx } = api;
    let next = state;
    for (const ev of ctx.reviewEvents || []) {
        if ((ev.type !== '守约' && ev.type !== '失约') || !next.characters[ev.name]) continue;
        const marked = once(next, `${ev.type}:${ev.name}`);
        if (!marked) continue;
        next = marked;
        if (ev.type === '守约') {
            next = dim(next, ev.name, '好感', FAVOR_SMALL, '守约', ctx.changes);
            next = dim(next, ev.name, '信任', TRUST_SMALL, '守约', ctx.changes);
        } else {
            next = dim(next, ev.name, '好感', -FAVOR_SMALL, '失约', ctx.changes);
            next = dim(next, ev.name, '芥蒂', GRUDGE_SMALL, '失约', ctx.changes);
        }
    }
    return next;
}

export const TAG_HOOKS = [calmerHook, placeWeatherHook, promiseHook];

// ---- 日结算钩子 ----

// 感染力强 / 低气压：其在场的日子，在场其他人压力每天 -3 / +3（每人每种取一次，不叠加）；
// 恋家：离家满三天压力每天 +3；认床、春困：体力恢复打折。
function dailyHook(state, api) {
    const { ctx, changes, present, day } = api;
    const near = (name) => name === HERO || present.has(name);
    const everyone = [HERO, ...Object.keys(state.characters)];
    let next = state;
    const owners = (id) => everyone.filter((n) => api.has(next, n, id) && near(n));
    for (const [id, delta] of [['感染力强', -STRESS_DAY], ['低气压', STRESS_DAY]]) {
        const who = owners(id);
        if (!who.length) continue;
        for (const name of everyone.filter(near)) if (who.some((o) => o !== name)) next = stress(next, name, delta, id, changes, 'daily');
    }
    const home = next.clock.e2bHome && typeof next.clock.e2bHome === 'object' ? next.clock.e2bHome : {};
    const place = placeKey(ctx.place);
    const atHome = Boolean(place) && isHomePlace(place);
    for (const name of everyone.filter((n) => api.has(next, n, '恋家'))) {
        const last = Number(home[name]);
        if (atHome) continue;
        if (Number.isFinite(last) && day - last >= AWAY_DAYS) next = stress(next, name, STRESS_DAY, '恋家·离家多日', changes, 'daily', [calcRow('离家天数', day - last)]);
    }
    const spring = isSpring(next.clock.lastDate);
    const away = Boolean(place) && !atHome;
    for (const name of everyone) {
        if (away && api.has(next, name, '认床') && near(name)) next = scaleRecovery(next, name, BED_FACTOR, '认床', changes);
        if (spring && api.has(next, name, '春困')) next = scaleRecovery(next, name, SPRING_FACTOR, '春困', changes);
    }
    return next;
}

export const DAILY_HOOKS = [dailyHook];
