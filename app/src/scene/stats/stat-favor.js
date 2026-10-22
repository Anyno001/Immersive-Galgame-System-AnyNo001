// 好感与其它维度结算（§5.1、§5.2）：AI 只给方向，增量查表；越高越难涨、单楼与每日上限、关口封顶。
import { FAVOR_DELTA } from './stat-vocab.js';
import { rollOver } from './stat-rng.js';
import { DIM_MAX, DIM_MIN, clamp } from './stat-state.js';

export const FAVOR_GATES = Object.freeze([25, 50, 75]);
export const FLOOR_GAIN_MAX = 3;
export const DAILY_GAIN_MAX = 8;
const DIM_DELTA = Object.freeze({ 上升: 2, 下降: -2 });

export const FAVOR_STAGES = Object.freeze([
    { name: '仇恨', min: -100, max: -76 },
    { name: '强烈反感', min: -75, max: -51 },
    { name: '厌烦排斥', min: -50, max: -26 },
    { name: '淡淡不喜', min: -25, max: -1 },
    { name: '无感', min: 0, max: 0 },
    { name: '初步好感', min: 1, max: 25 },
    { name: '明确喜欢', min: 26, max: 50 },
    { name: '强烈在意', min: 51, max: 75 },
    { name: '深爱', min: 76, max: 100 },
]);

export function stageOf(favor) {
    const value = clamp(Math.round(Number(favor) || 0), DIM_MIN, DIM_MAX);
    return FAVOR_STAGES.find((stage) => value >= stage.min && value <= stage.max);
}

// 信任建立缓慢、崩塌迅速：正向增量减半（至少 1），负向加倍。
export function baseDelta(dim, value) {
    const delta = dim === '好感' ? FAVOR_DELTA[value] : DIM_DELTA[value];
    if (!Number.isFinite(delta)) return 0;
    if (dim !== '信任') return delta;
    return delta > 0 ? Math.max(1, Math.floor(delta / 2)) : delta * 2;
}

export function gateKey(gate) {
    return `gate-${gate}`;
}

// 跨越未解锁的关口时停在关口值；负向区间往回涨不设关口。
function gateCap(from, to, unlocked) {
    for (const gate of FAVOR_GATES) {
        if (from <= gate && to > gate && !unlocked.includes(gateKey(gate))) return gate;
    }
    return to;
}

// 正向：d100 大于当前值（负值按 0 算）才按增量加，否则只加 1；再受单楼 +3、每日 +8 约束。负向直接扣，不设上限。
export function applyDim(character, dim, value, { random, coef = 1, floorRoom = FLOOR_GAIN_MAX } = {}) {
    const from = Number(character.dims[dim]) || 0;
    const base = baseDelta(dim, value);
    if (!base) return { character, change: null };
    let delta = base;
    let roll = null;
    if (base > 0) {
        const check = rollOver(from, random);
        roll = check.roll;
        const gained = character.daily.gained[dim] || 0;
        const scaled = check.passed ? Math.max(1, Math.round(base * coef)) : 1;
        delta = Math.max(0, Math.min(scaled, floorRoom, DAILY_GAIN_MAX - gained));
    }
    let to = clamp(from + delta, DIM_MIN, DIM_MAX);
    if (dim === '好感') to = gateCap(from, to, character.unlocked);
    const change = { dim, value, from, to, roll };
    if (to === from) return { character, change };
    const gain = Math.max(0, to - from);
    const daily = gain
        ? { ...character.daily, gained: { ...character.daily.gained, [dim]: (character.daily.gained[dim] || 0) + gain } }
        : character.daily;
    return { character: { ...character, dims: { ...character.dims, [dim]: to }, daily }, change };
}
