// 好感事件（§5.2、§5.3）：送礼重复递减、关键事件突破关口、冷落冷却（易错点 E4/E6）。
import { FAVOR_GATES, HEART_FULL, applyDim, gateKey, stageOf } from './stat-favor.js';
import { DIM_MAX, DIM_MIN, clamp } from './stat-state.js';
import { rollStatCheck } from './stat-rng.js';
import { hasTrait } from './stat-traits.js';
import { withCalc } from './stat-status-defs.js';

export const RECENT_MAX = 10;
export const COOLDOWN_DAYS = 3;
// 关键事件四档（EVENT_GRADES）：大成功额外好感、大失败扣好感与加芥蒂、失败后同关口可再试的天数。
export const KEY_CRIT_BONUS = 3;
export const KEY_FUMBLE_FAVOR = 3;
export const KEY_FUMBLE_GRUDGE = 2;
export const KEY_RETRY_DAYS = 2;

// 四档由检定等级得出：成功里的「大成功」、失败里的「大失败」各为一档，其余为成功 / 失败。
export const keyGrade = (check) => (check.success ? (check.tier === '大成功' ? '大成功' : '成功') : (check.tier === '大失败' ? '大失败' : '失败'));

// 送礼按「开心」结算；近期送过一次同类礼物收益减半，两次及以上不再加分。
// damp：习惯倍率，与同类礼物递减取较小者（不叠乘）。
export function applyGift(character, gift, { random, coef = 1, floorRoom, dailyMax, scale = null, damp = 1 } = {}) {
    const key = `送礼:${gift}`;
    const repeats = character.recent.filter((item) => item === key).length;
    const recent = [...character.recent, key].slice(-RECENT_MAX);
    if (repeats >= 2) return { character: { ...character, recent }, change: null };
    const result = applyDim(character, '好感', '开心', { random, coef: coef * Math.min(repeats ? 0.5 : 1, damp), floorRoom, scale, ...(dailyMax !== undefined ? { dailyMax } : {}) });
    return { character: { ...result.character, recent }, change: result.change };
}

// 好感停在关口（25/50/75）时，关键事件用魅力检定突破：成功则解锁该关口并升入下一阶段。
// 每道关口只解锁一次，之后跌回再涨不再封顶，也不能拿同一次解锁去过别的关口。
// roll：由检定引擎提供的魅力检定（按当前规则体系）；未给时按 v1 的百分骰直接掷。
// extraGates：这些关口要成功两次关键事件才解锁（白月光），第一次成功只记 gateStep。
// grades：只有数结算的关键事件标签传真；开启后按四档结算，大成功好感额外 +3 并充满心意槽，大失败不解锁、好感 −3、芥蒂 +2，失败记下关口与日期（两天内同关口再试一次记为 retry）。
// 战斗、挑战等其他调用方不传，仍按成功 / 失败两档，结果里也带 grade。
export function applyKeyEvent(character, event, { charm = 50, modifiers = {}, random, roll, extraGates = [], grades = false, day = 0 } = {}) {
    const favor = Number(character.dims.好感) || 0;
    const gate = FAVOR_GATES.find((value) => value === favor && !character.unlocked.includes(gateKey(value)));
    if (gate === undefined) return { character, result: { event, gate: null, success: false, reason: 'not-at-gate' } };
    const check = typeof roll === 'function' ? roll() : rollStatCheck(charm, modifiers, random);
    const grade = keyGrade(check);
    const result = { event, gate, roll: check.roll, target: check.target, tier: check.tier, success: check.success, grade };
    if (!check.success) {
        if (!grades) return { character, result };
        if (grade === '大失败') {
            const grudge = Number(character.dims.芥蒂) || 0;
            const dims = { ...character.dims, 好感: clamp(favor - KEY_FUMBLE_FAVOR, DIM_MIN, DIM_MAX), 芥蒂: clamp(grudge + KEY_FUMBLE_GRUDGE, DIM_MIN, DIM_MAX) };
            return { character: { ...character, dims }, result: { ...result, fumble: { favor: [favor, dims.好感], grudge: [grudge, dims.芥蒂] } } };
        }
        const prev = character.keyFail;
        const retry = Boolean(prev && prev.gate === gate && day - (Number(prev.day) || 0) <= KEY_RETRY_DAYS);
        return { character: { ...character, keyFail: { gate, day } }, result: { ...result, retry } };
    }
    if (extraGates.includes(gate) && !(character.gateStep || {})[gateKey(gate)]) {
        return { character: { ...character, gateStep: { ...character.gateStep, [gateKey(gate)]: 1 } }, result: { ...result, success: false, reason: 'extra-step' } };
    }
    const crit = grades && grade === '大成功';
    const dims = { ...character.dims, 好感: clamp(gate + 1 + (crit ? KEY_CRIT_BONUS : 0), DIM_MIN, DIM_MAX) };
    const next = { ...character, dims, unlocked: [...character.unlocked, gateKey(gate)] };
    if (crit) next.heart = HEART_FULL - 1;
    if (next.keyFail) delete next.keyFail;
    return { character: next, result: crit ? { ...result, bonus: KEY_CRIT_BONUS } : result };
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
    if (to === from) return { character, change: null };
    // 小心结只会淡到 25，再往下需要剧情和解（D 批）。
    const calc = [{ label: `芥蒂 ${from}：每天−1${scale === 1 ? '' : `×${scale}`}，共${days}天，最低${GRUDGE_FADE_FLOOR}`, value: from - to }, { label: '小心结需要剧情和解', value: '—' }, { label: '结果', value: to }];
    return { character: { ...character, dims: { ...character.dims, 芥蒂: to } }, change: withCalc({ key: '芥蒂', from, to, note: '淡忘' }, { calc }) };
}

// 欲望缓慢消退：每天 −1，最低到 floor（非恋爱对象 0，恋爱对象 DESIRE_ROMANCE_FLOOR）；没有欲望维度的角色不新增字段。
export const DESIRE_ROMANCE_FLOOR = 25;
export function fadeDesire(character, days = 1, floor = 0) {
    const from = Number(character.dims.欲望) || 0;
    if (from <= floor || !(days > 0)) return { character, change: null };
    const to = Math.max(floor, from - Math.floor(days));
    if (to === from) return { character, change: null };
    const calc = [{ label: `欲望 ${from}：每天−1，共${days}天，最低${floor}${floor ? '（恋爱对象）' : ''}`, value: from - to }, { label: '结果', value: to }];
    return { character: { ...character, dims: { ...character.dims, 欲望: to } }, change: withCalc({ key: '欲望', from, to, note: '淡忘' }, { calc }) };
}

// 近 7 天信任下降、芥蒂上升的账：[{ day, dim, amount }]，超过 7 天的作废。
export function liveHurts(character, day, span = RECENT_HURT_DAYS) {
    const list = Array.isArray(character.recentHurts) ? character.recentHurts : [];
    return list.filter((e) => e && Number(e.amount) > 0 && day - (Number(e.day) || 0) <= span);
}

// 误会账存活天数（D 批改名，原 hurtDaysOf，行为不变）：自愈减半（向上取整），伤口难愈加倍。身体伤势的回血倍率另见 stat-day.js 的 healMultiplier。
export function misunderstandDaysOf(state, catalog, name) {
    if (hasTrait(state, catalog, name, '自愈')) return Math.ceil(RECENT_HURT_DAYS / 2);
    return hasTrait(state, catalog, name, '伤口难愈') ? RECENT_HURT_DAYS * 2 : RECENT_HURT_DAYS;
}

// days：本次推进的天数（日结算 1，时间跳跃为跳过的天数，软跨天 0）；信任受伤标记 trustWound 每天减 1，没有该字段的角色不新增字段。
export function resetDaily(character, day, days = 1) {
    const next = { ...character, daily: { day, gained: {} } };
    if (Number(character.trustWound) > 0 && days > 0) next.trustWound = Math.max(0, Math.floor(character.trustWound) - days);
    return next;
}
