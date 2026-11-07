// 好感事件（§5.2、§5.3）：送礼重复递减、关键事件突破关口、冷落冷却（易错点 E4/E6）。
import { FAVOR_GATES, applyDim, gateKey, stageOf } from './stat-favor.js';
import { rollStatCheck } from './stat-rng.js';
import { hasTrait } from './stat-traits.js';

export const RECENT_MAX = 10;
export const COOLDOWN_DAYS = 3;

// 送礼按「开心」结算；近期送过一次同类礼物收益减半，两次及以上不再加分。
export function applyGift(character, gift, { random, coef = 1, floorRoom, dailyMax, scale = null } = {}) {
    const key = `送礼:${gift}`;
    const repeats = character.recent.filter((item) => item === key).length;
    const recent = [...character.recent, key].slice(-RECENT_MAX);
    if (repeats >= 2) return { character: { ...character, recent }, change: null };
    const result = applyDim(character, '好感', '开心', { random, coef: repeats ? coef / 2 : coef, floorRoom, scale, ...(dailyMax !== undefined ? { dailyMax } : {}) });
    return { character: { ...result.character, recent }, change: result.change };
}

// 好感停在关口（25/50/75）时，关键事件用魅力检定突破：成功则解锁该关口并升入下一阶段。
// 每道关口只解锁一次，之后跌回再涨不再封顶，也不能拿同一次解锁去过别的关口。
// roll：由检定引擎提供的魅力检定（按当前规则体系）；未给时按 v1 的百分骰直接掷。
// extraGates：这些关口要成功两次关键事件才解锁（白月光），第一次成功只记 gateStep。
export function applyKeyEvent(character, event, { charm = 50, modifiers = {}, random, roll, extraGates = [] } = {}) {
    const favor = Number(character.dims.好感) || 0;
    const gate = FAVOR_GATES.find((value) => value === favor && !character.unlocked.includes(gateKey(value)));
    if (gate === undefined) return { character, result: { event, gate: null, success: false, reason: 'not-at-gate' } };
    const check = typeof roll === 'function' ? roll() : rollStatCheck(charm, modifiers, random);
    const result = { event, gate, roll: check.roll, target: check.target, tier: check.tier, success: check.success };
    if (!check.success) return { character, result };
    if (extraGates.includes(gate) && !(character.gateStep || {})[gateKey(gate)]) {
        return { character: { ...character, gateStep: { ...character.gateStep, [gateKey(gate)]: 1 } }, result: { ...result, success: false, reason: 'extra-step' } };
    }
    const dims = { ...character.dims, 好感: gate + 1 };
    return { character: { ...character, dims, unlocked: [...character.unlocked, gateKey(gate)] }, result };
}

// 冷却：超过 3 天没有互动，正值好感每天 −1，止于当前阶段下限；负值与 0 不变。
// scale：冷却速度倍率（特质），为 1 时与旧结果一致。
export function coolDown(character, day, days = 1, scale = 1) {
    const favor = Number(character.dims.好感) || 0;
    const idle = day - (Number(character.lastSeenDay) || day);
    if (favor <= 0 || idle <= COOLDOWN_DAYS) return character;
    const drop = Math.min(days, idle - COOLDOWN_DAYS);
    const to = Math.max(stageOf(favor).min, favor - (scale === 1 ? drop : Math.max(1, Math.round(drop * scale))));
    return to === favor ? character : { ...character, dims: { ...character.dims, 好感: to } };
}

// 以下为 strengthRev ≥ 2 的新楼专用的日结算项，按天数一次算完，不逐日循环。
export const GRUDGE_FADE_FLOOR = 25;
export const RECENT_HURT_DAYS = 7;
export const INSIGHT_COOLDOWN_DAYS = 30;

// 芥蒂缓慢消退：芥蒂 >25 每天 −1，最低降到 25（不掉回吃醋低路）；返回 { character, change }，没有变化时 change 为 null。
export function fadeGrudge(character, days = 1, scale = 1) {
    const from = Number(character.dims.芥蒂) || 0;
    if (from <= GRUDGE_FADE_FLOOR || !(days > 0)) return { character, change: null };
    const to = Math.max(GRUDGE_FADE_FLOOR, from - Math.floor(days * scale));
    return to === from ? { character, change: null } : { character: { ...character, dims: { ...character.dims, 芥蒂: to } }, change: { key: '芥蒂', from, to, note: '淡忘' } };
}

// 欲望缓慢消退：非恋爱对象每天 −1，最低到 0；没有欲望维度的角色不新增字段。
export function fadeDesire(character, days = 1) {
    const from = Number(character.dims.欲望) || 0;
    if (from <= 0 || !(days > 0)) return { character, change: null };
    const to = Math.max(0, from - Math.floor(days));
    return to === from ? { character, change: null } : { character: { ...character, dims: { ...character.dims, 欲望: to } }, change: { key: '欲望', from, to, note: '淡忘' } };
}

// 近 7 天信任下降、芥蒂上升的账：[{ day, dim, amount }]，超过 7 天的作废。
export function liveHurts(character, day, span = RECENT_HURT_DAYS) {
    const list = Array.isArray(character.recentHurts) ? character.recentHurts : [];
    return list.filter((e) => e && Number(e.amount) > 0 && day - (Number(e.day) || 0) <= span);
}

// 伤势恢复天数：自愈减半（向上取整），伤口难愈加倍。
export function hurtDaysOf(state, catalog, name) {
    if (hasTrait(state, catalog, name, '自愈')) return Math.ceil(RECENT_HURT_DAYS / 2);
    return hasTrait(state, catalog, name, '伤口难愈') ? RECENT_HURT_DAYS * 2 : RECENT_HURT_DAYS;
}

// days：本次推进的天数（日结算 1，时间跳跃为跳过的天数，软跨天 0）；信任受伤标记 trustWound 每天减 1，没有该字段的角色不新增字段。
export function resetDaily(character, day, days = 1) {
    const next = { ...character, daily: { day, gained: {} } };
    if (Number(character.trustWound) > 0 && days > 0) next.trustWound = Math.max(0, Math.floor(character.trustWound) - days);
    return next;
}
