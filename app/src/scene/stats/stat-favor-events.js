// 好感事件（§5.2、§5.3）：送礼重复递减、关键事件突破关口、冷落冷却（易错点 E4/E6）。
import { FAVOR_GATES, applyDim, gateKey, stageOf } from './stat-favor.js';
import { rollStatCheck } from './stat-rng.js';

export const RECENT_MAX = 10;
export const COOLDOWN_DAYS = 3;

// 送礼按「开心」结算；近期送过一次同类礼物收益减半，两次及以上不再加分。
export function applyGift(character, gift, { random, coef = 1, floorRoom } = {}) {
    const key = `送礼:${gift}`;
    const repeats = character.recent.filter((item) => item === key).length;
    const recent = [...character.recent, key].slice(-RECENT_MAX);
    if (repeats >= 2) return { character: { ...character, recent }, change: null };
    const result = applyDim(character, '好感', '开心', { random, coef: repeats ? coef / 2 : coef, floorRoom });
    return { character: { ...result.character, recent }, change: result.change };
}

// 好感停在关口（25/50/75）时，关键事件用魅力检定突破：成功则解锁该关口并升入下一阶段。
// 每道关口只解锁一次，之后跌回再涨不再封顶，也不能拿同一次解锁去过别的关口。
export function applyKeyEvent(character, event, { charm = 50, modifiers = {}, random } = {}) {
    const favor = Number(character.dims.好感) || 0;
    const gate = FAVOR_GATES.find((value) => value === favor && !character.unlocked.includes(gateKey(value)));
    if (gate === undefined) return { character, result: { event, gate: null, success: false, reason: 'not-at-gate' } };
    const check = rollStatCheck(charm, modifiers, random);
    const result = { event, gate, roll: check.roll, target: check.target, tier: check.tier, success: check.success };
    if (!check.success) return { character, result };
    const dims = { ...character.dims, 好感: gate + 1 };
    return { character: { ...character, dims, unlocked: [...character.unlocked, gateKey(gate)] }, result };
}

// 冷却：超过 3 天没有互动，正值好感每天 −1，止于当前阶段下限；负值与 0 不变。
export function coolDown(character, day, days = 1) {
    const favor = Number(character.dims.好感) || 0;
    const idle = day - (Number(character.lastSeenDay) || day);
    if (favor <= 0 || idle <= COOLDOWN_DAYS) return character;
    const to = Math.max(stageOf(favor).min, favor - Math.min(days, idle - COOLDOWN_DAYS));
    return to === favor ? character : { ...character, dims: { ...character.dims, 好感: to } };
}

export function resetDaily(character, day) {
    return { ...character, daily: { day, gained: {} } };
}
