// 规则 v6 固定卡表的编写工具：效果简写、卡牌构造、按 IGS 预算窗口缩放数值（只改数值，不改效果结构）。
// 只引用 rules.js 与机制登记表；卡表数据在同目录 <职业>.js，汇总与校验在 index.js。
import { COMBAT_RULES, estimateCardValue, evaluateCardBudget, rarityWindow } from '../rules.js';
import { APPLY_STATUSES } from '../mechanics/apply-status.js';

export const atk = (amount, hits = 1, target = 'enemy') => ({ op: 'damage', amount, hits, target });
export const aoe = (amount, hits = 1) => atk(amount, hits, 'all-enemies');
export const rnd = (amount, hits = 1) => atk(amount, hits, 'random-enemy');
export const blk = (amount, target = 'self') => ({ op: 'block', amount, target });
export const heal = (amount, target = 'self') => ({ op: 'heal', amount, target });
export const draw = (amount) => ({ op: 'draw', amount });
export const energy = (amount) => ({ op: 'energy', amount });
export const lose = (amount) => ({ op: 'self-damage', amount });
export const st = (status, stacks, target) => ({ op: 'status', status, stacks, ...(target ? { target } : {}) });
export const ap = (status, stacks, target) => ({ op: 'apply-status', status, stacks, ...(target ? { target } : {}) });
export const ex = () => ({ op: 'exhaust-self' });
export const when = (kind, value, then) => ({ op: 'conditional', when: value === undefined ? { kind } : { kind, value }, then });
export const turn = (then, at) => ({ op: 'each-turn', then, ...(at === 'end' ? { at: 'turn-end' } : {}) });
export const buff = (trigger, turns, then, cardType) => ({ op: 'buff', trigger, ...(cardType ? { cardType } : {}), turns, then });
export const op = (name, fields = {}) => ({ op: name, ...fields });

const TYPES = Object.freeze({ a: 'attack', s: 'skill', p: 'power' });
const RARITY = Object.freeze({ c: 'common', u: 'uncommon', r: 'rare' });
// 预算缩放只动这些「强度」字段；抽牌、能量、计数步长等结构性数值保持原样。
const SCALE = Object.freeze({
    damage: ['amount', 99], block: ['amount', 99], heal: ['amount', 60], status: ['stacks', 10], drain: ['amount', 40],
    splash: ['amount', 40], 'tally-strike': ['amount', 40], 'minion-strike': ['amount', 30], summon: ['amount', 20],
});
// 强度字段缩放后仍落不进窗口时，再连同这些次要数值一起缩放：[字段, 下限, 上限]。代价类字段（自伤、自身减攻）反向缩放。
const SECONDARY = Object.freeze({
    draw: [['amount', 1, 5]], energy: [['amount', 1, 3]], 'next-turn': [['amount', 1, 3]], copy: [['amount', 1, 3]],
    retrieve: [['amount', 1, 2]], search: [['amount', 1, 2]], autoplay: [['amount', 1, 3]], 'random-card': [['amount', 1, 3]],
    'exhaust-hand': [['per', 1, 10]], 'tally-strike': [['per', 1, 10]], 'tally-guard': [['amount', 0, 40], ['per', 1, 10]],
    buff: [['turns', 1, 5]], 'replay-next': [['amount', 1, 2]], 'free-next': [['amount', 1, 2]], grow: [['amount', 1, 5]],
});
const PENALTY = Object.freeze({ 'self-damage': ['amount', 1, 20], 'self-weaken': ['stacks', 1, 5] });
const NESTED = ['then', 'a', 'b'];

function scaleSpec(effect) {
    if (effect?.op === 'apply-status') return ['stacks', APPLY_STATUSES[effect.status]?.max ?? 1];
    return SCALE[effect?.op] || null;
}

const scaled = (value, m, lo, hi) => Math.min(hi, Math.max(lo, Math.round(value * m)));

function scaleList(effects, m, wide = false) {
    return effects.map((effect) => {
        let next = effect;
        const spec = scaleSpec(effect);
        if (spec && Number.isFinite(effect[spec[0]])) next = { ...next, [spec[0]]: scaled(effect[spec[0]], m, 1, spec[1]) };
        if (wide) {
            for (const [key, lo, hi] of SECONDARY[effect?.op] || []) {
                if (Number.isFinite(effect[key]) && !(spec && spec[0] === key)) next = { ...next, [key]: scaled(effect[key], m, lo, hi) };
            }
            const penalty = PENALTY[effect?.op];
            if (penalty && Number.isFinite(effect[penalty[0]])) next = { ...next, [penalty[0]]: scaled(effect[penalty[0]], 1 / m, penalty[1], penalty[2]) };
        }
        for (const key of NESTED) if (Array.isArray(effect[key])) next = { ...next, [key]: scaleList(effect[key], m, wide) };
        return next;
    });
}

function numericDistance(before, after) {
    if (typeof before === 'number') return Math.abs(after - before) / Math.max(1, Math.abs(before));
    if (!before || typeof before !== 'object') return 0;
    return Object.keys(before).reduce((total, key) => total + numericDistance(before[key], after[key]), 0);
}

// 优先保留手写值，其余候选按数值改动幅度排序，求解中心只用于同幅度时择优。
function fitCandidates(card, effects, lo, hi, target) {
    const valueOf = (list) => estimateCardValue({ ...card, effects: list });
    const inside = (v) => v >= lo - 1e-9 && v <= hi + 1e-9;
    const found = new Map();
    if (inside(valueOf(effects))) found.set(JSON.stringify(effects), { list: effects, distance: 0, score: 0 });
    for (const wide of [false, true]) {
        for (let i = 4; i <= 120; i += 1) {
            const list = scaleList(effects, i * 0.025, wide);
            const v = valueOf(list);
            const key = JSON.stringify(list);
            if (inside(v) && !found.has(key)) found.set(key, { list, distance: numericDistance(effects, list), score: Math.abs(v - target) });
        }
        if (found.size) break;
    }
    return [...found.values()].sort((a, b) => a.distance - b.distance || a.score - b.score).map((item) => item.list);
}

// 编写期记录：升级版无论怎样缩放都落不进窗口、只好去掉升级的卡（ID、本体估值、升级允许区间；核对脚本与测试要求为空）。
export const DROPPED_UPGRADES = [];
// 编写期记录：每张固定卡的卡表手写值与落窗后的定义（只读，供标定脚本对照「手写值 → 落窗值」）。
export const FIT_TRACE = [];

// 本体落进稀有度窗口；升级版落在「比本体更优」与放宽上限之间。按本体候选逐个找能配上的升级版，
// 仅调整数值，不以本体替代手写升级效果。无解时记录丢失升级，由标定检查拒绝交付。
export function fitCard(card) {
    // 来源定义只允许被校验，不能因预算冲突改写；无效标记由 schema 拒收。
    if (card.sourceModel !== undefined || card.upgradeModel !== undefined) return card;
    const window = rarityWindow(card.cost, card.rarity);
    if (!window || !card.effects.length) return card;
    if (evaluateCardBudget(card).ok) return card;
    const bases = fitCandidates(card, card.effects, window.min, window.max, window.target);
    if (!bases.length) return card;
    if (!card.upgraded) return { ...card, effects: bases[0] };
    const upCost = card.upgraded.cost ?? card.cost;
    const upWindow = rarityWindow(upCost, card.rarity);
    if (!upWindow) return { ...card, effects: bases[0] };
    const upHi = upWindow.max * COMBAT_RULES.upgradeAllowance;
    for (const effects of bases) {
        const lo = estimateCardValue({ ...card, effects }) - window.budget + upWindow.budget + 0.01;
        const [up] = fitCandidates({ ...card, cost: upCost }, card.upgraded.effects ?? effects, lo, upHi, Math.min(upHi, Math.max(lo, upWindow.target)));
        if (!up) continue;
        const upgraded = card.upgraded.cost === undefined ? {} : { cost: upCost };
        if (JSON.stringify(up) !== JSON.stringify(effects)) upgraded.effects = up;
        if (upgraded.cost === undefined && upgraded.effects === undefined) continue;
        return { ...card, effects, upgraded };
    }
    const baseValue = estimateCardValue({ ...card, effects: bases[0] });
    DROPPED_UPGRADES.push({
        id: card.id, value: baseValue, upLo: baseValue - window.budget + upWindow.budget, upHi, upCost,
    });
    const { upgraded, ...rest } = card;
    return { ...rest, effects: bases[0] };
}

const upgradeOf = (up) => {
    if (up === undefined) return undefined;
    if (Array.isArray(up)) return { effects: up };
    if (typeof up === 'number' || up === 'X') return { cost: up };
    return up;
};

// 一行卡表：编号、自有中文名、类型 a/s/p、费用、稀有度 c/u/r、效果、升级（效果数组 / 新费用 / { cost, effects }）、关键字。
export function card(cls, no, name, type, cost, rarity, effects, up, flags = {}) {
    const base = {
        id: `fx-${cls}-${String(no).padStart(2, '0')}`, name, type: TYPES[type], cost, rarity: RARITY[rarity], effects,
        ...flags, model: 'fixed',
    };
    const upgraded = upgradeOf(up);
    const raw = upgraded ? { ...base, upgraded } : base;
    const fitted = fitCard(raw);
    FIT_TRACE.push({ id: base.id, raw, fitted });
    return fitted;
}
