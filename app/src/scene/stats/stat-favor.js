// 好感与其它维度结算（§5.1、§5.2）：AI 只给方向，增量查表；越高越难涨、单楼与每日上限、关口封顶。
import { FAVOR_DELTA, FAVOR_INFERRED, FAVOR_NEG_BASE, FAVOR_POS_BASE, FAVOR_POS_BASE_HARD, FAVOR_POS_BASE_NORMAL, FAVOR_STRENGTHS, FAVOR_WORDS, GRUDGE_DOWN_BASE, GRUDGE_UP_BASE, TRUST_DOWN_BASE, TRUST_UP_BASE } from './stat-vocab.js';
import { rollOver } from './stat-rng.js';
import { DIM_MAX, DIM_MIN, clamp, dimMin } from './stat-state.js';
import { amplifyLimit, guardDrop, scaleAmount } from './stat-traits.js';

// 特质倍率（只在 strengthRev ≥ 2 由结算传入）：scale = { up, down, jealous, noGrudge }，缺省全为 1，与旧结果一致。
const unit = (scale, key) => (scale && Number.isFinite(scale[key]) ? scale[key] : 1);

export const FAVOR_GATES = Object.freeze([25, 50, 75]);
export const FLOOR_GAIN_MAX = 3;
export const DAILY_GAIN_MAX = 8;
// 好感成长档：普通为单楼 +3、每日 +8；困难为单楼 +1、每日 +4。大成功加成、关口封顶、越高越难涨与负向不设上限两档相同。
export const FAVOR_LIMITS = Object.freeze({
    normal: Object.freeze({ mode: 'normal', floor: FLOOR_GAIN_MAX, daily: DAILY_GAIN_MAX }),
    hard: Object.freeze({ mode: 'hard', floor: 1, daily: 4 }),
});
export const favorLimits = (mode) => (mode === 'hard' ? FAVOR_LIMITS.hard : FAVOR_LIMITS.normal);
// 三档好感成长（鲜明 / 普通 / 困难）。legacy 与 legacyHard 只给没有 favorTier 的旧楼重算用：legacy＝改动前的普通档，legacyHard＝改动前的困难档。
export const FAVOR_TIERS = Object.freeze(['vivid', 'normal', 'hard']);
export const TIER_LIMITS = Object.freeze({
    vivid: Object.freeze({ tier: 'vivid', floor: 15, daily: 15 }),
    normal: Object.freeze({ tier: 'normal', floor: 5, daily: 8 }),
    hard: Object.freeze({ tier: 'hard', floor: FLOOR_GAIN_MAX, daily: DAILY_GAIN_MAX }),
    legacy: Object.freeze({ tier: 'legacy', floor: FLOOR_GAIN_MAX, daily: DAILY_GAIN_MAX }),
    legacyHard: Object.freeze({ tier: 'legacyHard', floor: 1, daily: 4 }),
});
// 带 strengthRev 的新楼：普通单楼 8、每日 12，困难单楼 6、每日 8；没有 strengthRev 的旧楼仍用 TIER_LIMITS。
export const TIER_LIMITS_REV1 = Object.freeze({
    normal: Object.freeze({ tier: 'normal', floor: 8, daily: 12 }),
    hard: Object.freeze({ tier: 'hard', floor: 6, daily: 8 }),
});
export const favorTierLimits = (tier, rev = 0) => (rev >= 1 && TIER_LIMITS_REV1[tier]) || TIER_LIMITS[tier] || TIER_LIMITS.legacy;
// 设置里的档位 → 结算档位；旧楼 meta 没有 favorTier 时由 legacyTierOf 按旧 favorMode 还原。
export const normalizeFavorTier = (tier) => (FAVOR_TIERS.includes(tier) ? tier : 'vivid');
export const legacyTierOf = (favorMode) => (favorMode === 'hard' ? 'legacyHard' : 'legacy');
// 鲜明档每日上限随阶段递减；阶段倍率按 from 取。
export const vividDailyMax = (favor) => (favor <= 25 ? 15 : favor <= 50 ? 12 : favor <= 75 ? 10 : 8);
export const vividCoef = (favor) => (favor <= 25 ? 1 : favor <= 50 ? 0.8 : favor <= 75 ? 0.6 : 0.4);
export const HEART_FULL = 5;
export const HEART_BURST_GAIN = 5;
export const HEART_BURST_NOTE = '心意满溢';
const isNewTier = (tier) => FAVOR_TIERS.includes(tier);
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
    if (typeof value === 'number') return dim === '好感' && Number.isInteger(value) ? value : 0;
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

// 正向：d100 大于当前值（负值按 0 算）才按增量加，否则只加 1；再受单楼与每日上限约束（缺省普通档 +3、+8）。负向直接扣，不设上限。
export function applyDim(character, dim, value, { random, coef = 1, floorRoom = FLOOR_GAIN_MAX, dailyMax = DAILY_GAIN_MAX, scale = null } = {}) {
    const from = Number(character.dims[dim]) || 0;
    const base = baseDelta(dim, value);
    if (!base) return { character, change: null };
    let delta = base;
    let roll = null;
    if (base > 0) {
        const check = rollOver(from, random);
        roll = check.roll;
        const gained = character.daily.gained[dim] || 0;
        const scaled = check.passed ? Math.max(1, Math.round(base * coef * unit(scale, 'up'))) : 1;
        delta = Math.max(0, Math.min(scaled, floorRoom, dailyMax - gained));
    } else if (unit(scale, 'down') !== 1) delta = -guardDrop(dim, scaleAmount(-base, unit(scale, 'down')));
    let to = clamp(from + delta, dimMin(dim), DIM_MAX);
    if (dim === '好感') to = gateCap(from, to, character.unlocked);
    const change = { dim, value, from, to, roll };
    if (to === from) return { character, change };
    const gain = Math.max(0, to - from);
    const daily = gain
        ? { ...character.daily, gained: { ...character.daily.gained, [dim]: (character.daily.gained[dim] || 0) + gain } }
        : character.daily;
    return { character: { ...character, dims: { ...character.dims, [dim]: to }, daily }, change };
}

// 标签的有效强度：显式强度优先，省略时按方向推定（旧方向词读 FAVOR_INFERRED，新方向词读 FAVOR_WORDS）；平淡无强度。
export function favorStrength(directive) {
    if (!directive || directive.value === '平淡') return null;
    if (FAVOR_STRENGTHS.includes(directive.strength)) return directive.strength;
    return FAVOR_INFERRED[directive.value] || (FAVOR_WORDS[directive.value] && FAVOR_WORDS[directive.value].strength) || null;
}

// 好感方向词对好感的正负：1 正、-1 负、0 无（平淡）。旧方向词按 FAVOR_DELTA，新方向词按 FAVOR_WORDS。
export function favorSign(directive) {
    const value = directive && directive.value;
    if (Object.hasOwn(FAVOR_WORDS, value)) return FAVOR_WORDS[value].sign;
    return Math.sign(FAVOR_DELTA[value] || 0);
}

// 正向强度表：鲜明档不变；带 strengthRev 的普通、困难档各用自己的表；旧楼沿用鲜明表。
export const posBaseOf = (tier, rev = 0) => (rev >= 1 && tier === 'normal' ? FAVOR_POS_BASE_NORMAL : rev >= 1 && tier === 'hard' ? FAVOR_POS_BASE_HARD : FAVOR_POS_BASE);

// 带符号的强度增量，供同楼去重比较；旧三档沿用方向表。
export function favorWeight(directive, tier = 'legacy', rev = 0) {
    if (isNewTier(tier) && rev >= 1 && directive.dim === '芥蒂') {
        const level = grudgeStrength(directive);
        return Math.abs(directive.value === '上升' ? GRUDGE_UP_BASE[level] : GRUDGE_DOWN_BASE[level]);
    }
    if (isNewTier(tier) && directive.dim === '信任') {
        const level = trustStrength(directive);
        return Math.abs(directive.value === '上升' ? TRUST_UP_BASE[level] : TRUST_DOWN_BASE[level]);
    }
    if (!isNewTier(tier) || directive.dim !== '好感') return Math.abs(baseDelta(directive.dim, directive.value));
    const level = favorStrength(directive);
    if (!level) return 0;
    return Math.abs(favorSign(directive) > 0 ? posBaseOf(tier, rev)[level] : FAVOR_NEG_BASE[level]);
}

const stepDown = (level) => FAVOR_STRENGTHS[FAVOR_STRENGTHS.indexOf(level) - 1] || null;

// 检定失败降档：方向降一档，强度也降一档（小降为无）。
export function downgradeStrength(directive) {
    const level = favorStrength(directive);
    const lower = level ? stepDown(level) : null;
    return lower ? { strength: lower } : { strength: null };
}

// 新三档的好感结算。AI 只给方向与强度档，数值全在这里查表。
// 鲜明＝强度基础值 × 阶段倍率 + 心意槽（不掷骰）；普通＝基础值 + d100（失败减半，至少 1）；困难＝现行方向表。负向三档共用强度表。
// 返回 { character, change, burst }；心意槽只在鲜明档读写，切档后保留。
export function applyFavorTier(character, d, { tier, random, coef: coef0 = 1, floorRoom, dailyMax, rev = 0, scale = null } = {}) {
    const coef = coef0 * unit(scale, 'up');
    const from = Number(character.dims.好感) || 0;
    const heart0 = Math.max(0, Math.min(HEART_FULL - 1, Math.round(Number(character.heart) || 0)));
    let level = favorStrength(d);
    if (!level) return { character, change: null };
    const positive = favorSign(d) > 0;
    const vivid = tier === 'vivid';
    let heart = heart0;
    let delta;
    let roll = null;
    let burst = false;
    let note = null;
    if (!positive) {
        delta = FAVOR_NEG_BASE[level];
        if (unit(scale, 'down') !== 1) delta = -guardDrop('好感', scaleAmount(-delta, unit(scale, 'down')));
        if (vivid) heart = level === '小' ? Math.max(0, heart0 - 2) : 0;
    } else {
        const daily = character.daily;
        if (vivid && level === '大') level = daily.bigUsed ? '中' : level;
        const base = posBaseOf(tier, rev)[level];
        const gained = daily.gained.好感 || 0;
        const cap = vivid ? amplifyLimit(vividDailyMax(from), unit(scale, 'up')) : dailyMax;
        const room = (amount) => Math.max(0, Math.min(amount, floorRoom, cap - gained));
        if (vivid) {
            const amount = Math.max(1, Math.round(base * (from > 0 ? vividCoef(from) : 1) * coef));
            if (level === '小') {
                const total = heart0 + amount;
                if (total >= HEART_FULL) {
                    delta = room(HEART_BURST_GAIN);
                    if (delta > 0) { heart = total - HEART_FULL; burst = true; note = HEART_BURST_NOTE; } else { heart = HEART_FULL - 1; delta = 0; }
                } else { heart = total; delta = 0; }
            } else delta = room(amount);
        } else if (tier === 'normal') {
            const check = rollOver(from, random);
            roll = check.roll;
            const full = Math.max(1, Math.round(base * coef));
            delta = room(check.passed ? full : Math.max(1, Math.floor(full / 2)));
        } else if (rev >= 1) {
            // 困难档读强度：失败只给 1。
            const check = rollOver(from, random);
            roll = check.roll;
            delta = room(check.passed ? Math.max(1, Math.round(base * coef)) : 1);
        } else {
            const check = rollOver(from, random);
            roll = check.roll;
            const scaled = check.passed ? Math.max(1, Math.round(FAVOR_DELTA[d.value] * coef)) : 1;
            delta = room(scaled);
        }
    }
    let to = clamp(from + delta, DIM_MIN, DIM_MAX);
    to = gateCap(from, to, character.unlocked);
    // 满溢被关口封顶压成 0 时不扣槽，处理与每日上限满时一致。
    if (burst && to === from) { heart = HEART_FULL - 1; burst = false; note = null; }
    const gain = Math.max(0, to - from);
    const bigUsed = vivid && positive && level === '大';
    let daily = character.daily;
    if (gain || bigUsed) daily = { ...daily, ...(bigUsed ? { bigUsed: true } : {}), gained: gain ? { ...daily.gained, 好感: (daily.gained.好感 || 0) + gain } : daily.gained };
    const next = { ...character, dims: to === from ? character.dims : { ...character.dims, 好感: to }, daily };
    if (vivid) next.heart = heart;
    return { character: next, change: { dim: '好感', value: note || d.value, from, to, roll }, burst };
}

// ---- 吃醋分两路（第八节）：芥蒂低时好感不降，芥蒂高时才扣好感；旧楼不走这里 ----
export const JEALOUS_FAVOR_MIN = 50;
export const JEALOUS_GRUDGE_MIN = 26;
export const JEALOUS_NOTE = '吃醋';
export const JEALOUS_GRUDGE_LOW = 2;
export const JEALOUS_GRUDGE_DAILY = 8;
// 吃醋路径的芥蒂单独记账，不占普通芥蒂标签的每日额度。
export const JEALOUS_GRUDGE_KEY = '吃醋芥蒂';
export const JEALOUS_GRUDGE_GAIN = Object.freeze({ 小: 3, 中: 5, 大: 8, 重大: 8 });

const addGrudge = (character, amount) => {
    const from = Number(character.dims.芥蒂) || 0;
    const to = clamp(from + amount, DIM_MIN, DIM_MAX);
    return to === from ? { character, change: null } : { character: { ...character, dims: { ...character.dims, 芥蒂: to } }, change: { dim: '芥蒂', value: JEALOUS_NOTE, from, to, roll: null } };
};

// 返回 { character, changes: [...], burst }；changes 里好感与芥蒂的变动 value 都带「吃醋」或心意满溢。
export function applyJealousy(character, d, opts) {
    const { tier, random, coef = 1, floorRoom, dailyMax, rev = 0, scale = null } = opts;
    const jealous = unit(scale, 'jealous');
    const noGrudge = Boolean(scale && scale.noGrudge);
    const grudge = Number(character.dims.芥蒂) || 0;
    const favor = Number(character.dims.好感) || 0;
    const level = favorStrength(d) || '中';
    const changes = [];
    if (grudge >= JEALOUS_GRUDGE_MIN) {
        const hit = applyFavorTier(character, { ...d, strength: level }, { tier, random, coef, floorRoom, dailyMax, rev, scale });
        let next = hit.character;
        if (hit.change) changes.push({ ...hit.change, value: JEALOUS_NOTE });
        const check = rollOver(grudge, random);
        const gained = next.daily.gained[JEALOUS_GRUDGE_KEY] || 0;
        const room = Math.max(0, amplifyLimit(JEALOUS_GRUDGE_DAILY, jealous) - gained);
        if (!check.passed && room > 0 && !noGrudge) {
            const gain = Math.min(scaleAmount(JEALOUS_GRUDGE_GAIN[level] || 0, jealous), room);
            const r = addGrudge(next, gain);
            if (r.change) {
                next = { ...r.character, daily: { ...next.daily, gained: { ...next.daily.gained, [JEALOUS_GRUDGE_KEY]: gained + (r.change.to - r.change.from) } } };
                changes.push({ ...r.change, roll: check.roll });
            }
        }
        return { character: next, changes, burst: false };
    }
    let next = character;
    let burst = false;
    if (favor >= JEALOUS_FAVOR_MIN && !character.daily.jealousUp) {
        const check = rollOver(0, random);
        // 好感不低于 50 时掷 d100，点数不超过当前好感才算触动；rollOver 只用来取点数。
        if (check.roll <= favor) {
            const hit = applyFavorTier(character, { ...d, value: '开心', strength: '小' }, { tier, random, coef, floorRoom, dailyMax, rev, scale });
            next = { ...hit.character, daily: { ...hit.character.daily, jealousUp: true } };
            burst = Boolean(hit.burst);
            if (hit.change) changes.push({ ...hit.change, value: burst ? hit.change.value : JEALOUS_NOTE });
        }
    }
    const r = noGrudge ? { character: next, change: null } : addGrudge(next, scaleAmount(JEALOUS_GRUDGE_LOW, jealous));
    if (r.change) { next = r.character; changes.push(r.change); }
    return { character: next, changes, burst };
}

// ---- 信任分强度（第九节） ----
export const TRUST_FLOOR_MAX = 6;
export const TRUST_DAILY_MAX = 10;
export const TRUST_WOUND_DAYS = 3;
export const trustStrength = (directive) => (FAVOR_STRENGTHS.includes(directive && directive.strength) ? directive.strength : '小');

// 新三档下的信任：上升按强度表（受伤期间减半，至少 1），单楼 6、每日 10，不掷骰；下降按强度表，不设上限，重大下降记受伤天数。
export function applyTrustTier(character, d, { coef = 1, floorRoom = TRUST_FLOOR_MAX, scale = null } = {}) {
    const from = Number(character.dims.信任) || 0;
    const level = trustStrength(d);
    const up = d.value === '上升';
    let delta;
    if (up) {
        const wounded = Number(character.trustWound) > 0;
        const raw = Math.max(1, Math.round(TRUST_UP_BASE[level] * coef * unit(scale, 'up')));
        const base = wounded ? Math.max(1, Math.floor(raw / 2)) : raw;
        const gained = character.daily.gained.信任 || 0;
        delta = Math.max(0, Math.min(base, floorRoom, amplifyLimit(TRUST_DAILY_MAX, unit(scale, 'up')) - gained));
    } else delta = unit(scale, 'down') !== 1 ? -guardDrop('信任', scaleAmount(-TRUST_DOWN_BASE[level], unit(scale, 'down'))) : TRUST_DOWN_BASE[level];
    const to = clamp(from + delta, DIM_MIN, DIM_MAX);
    const wound = !up && level === '重大';
    let next = character;
    if (to !== from) {
        const gain = Math.max(0, to - from);
        const daily = gain ? { ...character.daily, gained: { ...character.daily.gained, 信任: (character.daily.gained.信任 || 0) + gain } } : character.daily;
        next = { ...character, dims: { ...character.dims, 信任: to }, daily };
    }
    if (wound) next = { ...next, trustWound: TRUST_WOUND_DAYS };
    return { character: next, change: { dim: '信任', value: d.value, from, to, roll: null } };
}

// ---- 芥蒂分强度（strengthRev ≥ 1 的新楼，三档好感成长共用） ----
export const GRUDGE_DOWN_DAILY_MAX = 10;
// 下降（化解）当日已用额度记在 daily.gained 的这个键下，跨天随 resetDaily 清零。
export const GRUDGE_DOWN_KEY = '芥蒂下降';
export const grudgeStrength = (directive) => (FAVOR_STRENGTHS.includes(directive && directive.strength) ? directive.strength : '小');

// 上升按强度表，不掷骰、不设单楼与每日上限；下降按强度表，每日最多 -10。重大下降是否成立由 capMajorStrength 在上游处理。
export function applyGrudgeTier(character, d, { scale = null } = {}) {
    const from = Number(character.dims.芥蒂) || 0;
    const level = grudgeStrength(d);
    const up = d.value === '上升';
    let delta;
    if (up) delta = scaleAmount(GRUDGE_UP_BASE[level], unit(scale, 'up'));
    else {
        const used = character.daily.gained[GRUDGE_DOWN_KEY] || 0;
        delta = -Math.max(0, Math.min(-GRUDGE_DOWN_BASE[level], GRUDGE_DOWN_DAILY_MAX - used));
    }
    const to = clamp(from + delta, DIM_MIN, DIM_MAX);
    let next = character;
    if (to !== from) {
        const daily = up ? character.daily : { ...character.daily, gained: { ...character.daily.gained, [GRUDGE_DOWN_KEY]: (character.daily.gained[GRUDGE_DOWN_KEY] || 0) + (from - to) } };
        next = { ...character, dims: { ...character.dims, 芥蒂: to }, daily };
    }
    return { character: next, change: { dim: '芥蒂', value: d.value, from, to, roll: null } };
}
