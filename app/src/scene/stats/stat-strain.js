// 压力满后的转换与定型（STATS_CROWD_IDOL_PLAN 第五、五点五节），只对 strengthRev ≥ 2 的楼生效。
// 生活条上的附加字段（旧楼不会出现）：
//   stressPeak：压力停在 100 的连续楼数；到 STRESS_LIMIT_FLOORS 后进入「极限」，压力回到 90 以下才解除。
//   单楼从 70 以下直接冲到 100 时当楼即进入极限（stressPeak 直接记满）。
//   stressFrom：最近几次压力上升的来源（stress 标签第四段），用来给出主要来源。
//   strain：{ name, type, final? } 转换后的状态；压力条换名换色，stress 改记新状态的深度。
// 角色档案上的定型标记：feud（芥蒂满 100，宿仇，不再自然消退）、obsessed（欲望满 100，痴迷）。
import { clamp } from './stat-state.js';

export const STRESS_LIMIT_FLOORS = 3;
export const STRESS_LIMIT_RELEASE = 90;
export const STRESS_EXTREME = 90;
const STRESS_BURST_FROM = 70;
const STRESS_FROM_MAX = 6;

export const STRESS_SOURCES = Object.freeze(['被迫', '被支配', '恐惧', '失去', '背叛', '绝境']);
const SOURCE_HINT = Object.freeze({ 被迫: '沦陷或扭曲', 被支配: '沦陷或扭曲', 恐惧: '崩溃或沦陷', 失去: '崩溃或扭曲', 背叛: '崩溃或扭曲', 绝境: '蜕变或崩溃' });

// 四类十个状态名（11-07 定稿）。沦陷只涨不跌、满了二次转换；崩溃慢慢回落、归零恢复；扭曲不自然变化；蜕变用一点少一点、用完恢复。
export const STRAIN_TYPES = Object.freeze({ 沦陷: ['堕落', '沉溺', '同化'], 崩溃: ['破碎', '疯狂', '麻木'], 扭曲: ['黑化', '执念', '封闭'], 蜕变: ['觉醒'] });
export const STRAIN_NAMES = Object.freeze(Object.values(STRAIN_TYPES).flat());
export const strainTypeOf = (name) => Object.keys(STRAIN_TYPES).find((type) => STRAIN_TYPES[type].includes(name)) || null;

export function normalizeStressSource(raw) {
    const text = String(raw ?? '').trim();
    return STRESS_SOURCES.includes(text) ? text : null;
}

// 极限：没有转换过、压力停在 100 已满 3 楼且仍不低于 90。
export function stressLimitActive(bars) {
    return Boolean(bars) && !bars.strain && (Number(bars.stressPeak) || 0) >= STRESS_LIMIT_FLOORS && (Number(bars.stress) || 0) >= STRESS_LIMIT_RELEASE;
}

// 主要来源：最近记录里出现最多的一项，次数相同取较近的。
export function mainStressSource(bars) {
    const list = Array.isArray(bars && bars.stressFrom) ? bars.stressFrom : [];
    let best = null;
    let top = 0;
    const count = new Map();
    for (const source of list) {
        const n = (count.get(source) || 0) + 1;
        count.set(source, n);
        if (n >= top) { top = n; best = source; }
    }
    return best;
}

const withoutKeys = (bars, keys) => {
    const out = { ...bars };
    for (const key of keys) delete out[key];
    return out;
};

// 压力增减（标签或日结算）：转换后按状态走向处理；delta > 0 且带来源时记一笔来源。
export function shiftStress(bars, delta, source = null) {
    let next = bars;
    if (delta > 0 && source) next = { ...next, stressFrom: [...(Array.isArray(next.stressFrom) ? next.stressFrom : []), source].slice(-STRESS_FROM_MAX) };
    const from = Number(bars.stress) || 0;
    const strain = bars.strain;
    if (!strain) {
        const to = clamp(from + delta, 0, 100);
        return to === from ? next : { ...next, stress: to };
    }
    const type = strainTypeOf(strain.name.replace(/^彻底/, '')) || strain.type;
    if (type === '沦陷') {
        if (delta <= 0 || strain.final) return next;
        const to = clamp(from + delta, 0, 100);
        return to >= 100 ? { ...next, stress: 100, strain: { ...strain, name: `彻底${strain.name}`, final: true } } : { ...next, stress: to };
    }
    if (type === '蜕变') {
        if (delta <= 0) return next;
        const to = clamp(from - delta, 0, 100);
        return to <= 0 ? { ...withoutKeys(next, ['strain', 'stressFrom']), stress: 0 } : { ...next, stress: to };
    }
    const to = clamp(from + delta, 0, 100);
    if (type === '崩溃' && to <= 0) return { ...withoutKeys(next, ['strain', 'stressFrom']), stress: 0 };
    return to === from ? next : { ...next, stress: to };
}

// 日结算的压力自然变化：普通压力与崩溃 −10，沦陷、扭曲、蜕变不变。
export function relaxStress(bars) {
    const type = bars.strain ? strainTypeOf(bars.strain.name.replace(/^彻底/, '')) || bars.strain.type : null;
    if (type && type !== '崩溃') return bars;
    return shiftStress(bars, -10);
}

// break 标签：只在极限时生效；转换后同一条从 0 起计（蜕变从满格起，用一点少一点）。返回 { bars, change } 或 { reason }。
export function applyBreak(bars, name) {
    const type = strainTypeOf(name);
    if (!type) return { reason: 'stat-break-unknown' };
    if (bars.strain) return { reason: 'stat-break-strained' };
    if (!stressLimitActive(bars)) return { reason: 'stat-break-not-ready' };
    const to = type === '蜕变' ? 100 : 0;
    const next = { ...withoutKeys(bars, ['stressPeak']), stress: to, strain: { name, type } };
    return { bars: next, change: { key: 'stress', from: Number(bars.stress) || 0, to, note: `转为${name}` } };
}

// 每楼结算末尾更新连续满格楼数：100 时 +1（prevStress 为本楼开始时的压力，低于 70 直接冲到 100 则当楼记满进入极限）；90–99 且已到极限保持；其余清零。转换后不计。
export function trackStressPeak(bars, prevStress = null) {
    if (!bars) return bars;
    const n = Number(bars.stressPeak) || 0;
    const v = Number(bars.stress) || 0;
    const burst = v >= 100 && prevStress !== null && Number(prevStress) < STRESS_BURST_FROM;
    const next = bars.strain ? 0 : v >= 100 ? (burst ? Math.max(n + 1, STRESS_LIMIT_FLOORS) : n + 1) : v >= STRESS_LIMIT_RELEASE && n >= STRESS_LIMIT_FLOORS ? n : 0;
    if (next === n) return bars;
    return next ? { ...bars, stressPeak: next } : withoutKeys(bars, ['stressPeak']);
}

export const strainDegree = (value) => {
    const v = Number(value) || 0;
    return v > 66 ? '重' : v > 33 ? '中' : '轻';
};

// 提示词用的状态句（不带句号）：转换后写「已堕落（程度：中）」，极限写「已经撑到极限」并附主要来源；其余为空。
export function strainSentence(name, bars) {
    if (!bars) return '';
    if (bars.strain) return bars.strain.final ? `${name}已${bars.strain.name}` : `${name}已${bars.strain.name}（程度：${strainDegree(bars.stress)}）`;
    if (!stressLimitActive(bars)) return '';
    const source = mainStressSource(bars);
    return source ? `${name}已经撑到极限，压力主要来自${source}，容易走向${SOURCE_HINT[source]}` : `${name}已经撑到极限`;
}

// 状态栏压力条：转换后换成状态名与对应颜色（复用现有色板键）。
const STRAIN_COLOR = Object.freeze({ 沦陷: 'desire', 崩溃: 'cold', 扭曲: 'grudge', 蜕变: 'slot-3' });
export function strainBarLook(bars) {
    if (!bars || !bars.strain) return null;
    const type = strainTypeOf(bars.strain.name.replace(/^彻底/, '')) || bars.strain.type;
    return { label: bars.strain.name, colorKey: STRAIN_COLOR[type] || 'slot-4' };
}

export const BREAK_TAG_LINE = '[igs-stat:break|状态名]（撑到极限的人在剧情中崩溃或转变时写，角色写 [igs-stat:break|角色名|状态名]；沦陷：堕落/沉溺/同化，崩溃：破碎/疯狂/麻木，扭曲：黑化/执念/封闭，蜕变：觉醒）';
export const STRESS_SOURCE_TAG_LINE = `[igs-stat:stress|上升|强度|来源]（压力很高的人再受压时写来源：${STRESS_SOURCES.join('/')}，角色同样在最前加角色名）`;

// 宿仇、痴迷：芥蒂、欲望到 100 时定型，标记一经写入不再撤销。
export function markFixations(character) {
    const dims = (character && character.dims) || {};
    const feud = !character.feud && (Number(dims.芥蒂) || 0) >= 100;
    const obsessed = !character.obsessed && (Number(dims.欲望) || 0) >= 100;
    if (!feud && !obsessed) return character;
    return { ...character, ...(feud ? { feud: true } : {}), ...(obsessed ? { obsessed: true } : {}) };
}

export const OBSESSED_NOTE = '对主角念念不忘';
