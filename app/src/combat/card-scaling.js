import { abilityMod } from './abilities.js';

// 卡牌属性性能（v3 §3.8）：开战时按持有者六维换算卡牌与技能数值，产出新对象，不改档案、图鉴与模板，不经 cardAt。
// 要求属性取主效果（第一个非固定效果）；要求值按稀有度；倍率每差 1 点 ±8%，夹 0.7–1.3。
export const CARD_REQUIREMENTS = Object.freeze({ common: 10, uncommon: 12, rare: 14, epic: 16, mythic: 18, personal: 13, signature: 16 });
// 技能没有稀有度，要求值取罕见档（实施取值）。
export const SKILL_REQUIREMENT = 12;
export const SCALING_STEP = 0.08;
export const SCALING_RANGE = Object.freeze([0.7, 1.3]);

// 主效果 → 要求属性；phys 表示力量与敏捷取持有者较高的一项。固定效果（抽牌、能量、减费、消耗等）不参与。
const MAIN_ABILITY = Object.freeze({
    damage: 'phys', 'damage-from-block': 'phys', block: 'con', heal: 'wis', status: 'cha',
    double: 'int', 'next-turn': 'int', 'each-turn': 'int',
});
// 换算的数值字段与上限（与 schema 的取值域一致）。
const SCALED = Object.freeze({
    damage: Object.freeze({ key: 'amount', max: 99 }),
    block: Object.freeze({ key: 'amount', max: 99 }),
    heal: Object.freeze({ key: 'amount', max: 60 }),
    status: Object.freeze({ key: 'stacks', max: 10 }),
});
const NESTED = new Set(['conditional', 'each-turn']);

const list = (effects) => (Array.isArray(effects) ? effects : []);

function mainOp(effects) {
    for (const e of list(effects)) {
        if (e?.op === 'conditional') {
            const inner = mainOp(e.then);
            if (inner) return inner;
        } else if (Object.hasOwn(MAIN_ABILITY, e?.op)) return e.op;
    }
    return null;
}

// 要求属性：没有可换算主效果时为 null。
export function requiredAbility(effects, attr) {
    const op = mainOp(effects);
    if (!op) return null;
    const key = MAIN_ABILITY[op];
    if (key !== 'phys') return key;
    const s = attr?.scores || {};
    return (s.dex ?? 0) > (s.str ?? 0) ? 'dex' : 'str';
}

export function scalingMultiplier(attr, ability, required) {
    if (!attr?.scores || !ability || !Number.isFinite(required)) return 1;
    const own = abilityMod(attr.scores[ability]) + (Number(attr.proficiency) || 0);
    const diff = own - (abilityMod(required) + 2);
    const [lo, hi] = SCALING_RANGE;
    return Math.round(Math.min(hi, Math.max(lo, 1 + SCALING_STEP * diff)) * 100) / 100;
}

// 按出现顺序列出可换算数值（含条件与每回合效果内层）；用于判断固定卡与显示增减。
export function effectNumbers(effects) {
    const out = [];
    for (const e of list(effects)) {
        if (NESTED.has(e?.op)) out.push(...effectNumbers(e.then));
        else if (Object.hasOwn(SCALED, e?.op)) out.push(e[SCALED[e.op].key]);
    }
    return out;
}

export function scaleEffects(effects, k) {
    if (k === 1) return effects;
    return list(effects).map((e) => {
        if (NESTED.has(e?.op)) return { ...e, then: scaleEffects(e.then, k) };
        const rule = SCALED[e?.op];
        if (!rule) return e;
        return { ...e, [rule.key]: Math.min(rule.max, Math.max(1, Math.round(e[rule.key] * k))) };
    });
}

// 固定卡：基础卡，或本体与升级形态都没有可换算数值的卡。
export function isFixedCard(card) {
    if (!card || card.rarity === 'basic') return true;
    return effectNumbers(card.effects).length === 0 && effectNumbers(card.upgraded?.effects).length === 0;
}

// 换算一张卡：没有属性视图、固定卡或未登记稀有度时原样返回（形状与旧版一致）。
// 换算后的卡带 scaling：{ ability, required, multiplier, base[, baseUpgraded] }，base 为换算前数值（按 effectNumbers 顺序），供显示增减。
export function scaleCard(card, attr) {
    if (!attr?.scores || isFixedCard(card) || !Object.hasOwn(CARD_REQUIREMENTS, card.rarity)) return card;
    const ability = requiredAbility(card.effects, attr) || requiredAbility(card.upgraded?.effects, attr);
    if (!ability) return card;
    const required = CARD_REQUIREMENTS[card.rarity];
    const multiplier = scalingMultiplier(attr, ability, required);
    const scaling = { ability, required, multiplier, base: effectNumbers(card.effects) };
    const out = { ...card, effects: scaleEffects(card.effects, multiplier) };
    if (card.upgraded?.effects) {
        out.upgraded = { ...card.upgraded, effects: scaleEffects(card.upgraded.effects, multiplier) };
        scaling.baseUpgraded = effectNumbers(card.upgraded.effects);
    }
    out.scaling = scaling;
    return out;
}

// 图鉴（Map 或普通对象）→ 换算后的普通对象，可 JSON 持久化后原样重放。
export function scaleCatalog(catalog, attr) {
    const entries = catalog instanceof Map ? [...catalog] : Object.entries(catalog || {});
    return Object.fromEntries(entries.map(([id, card]) => [id, scaleCard(card, attr)]));
}

// 技能角色与敌人技能：按效果类型取属性，要求值固定为 SKILL_REQUIREMENT；没有属性视图时原样返回。
export function scaleSkills(skills, attr) {
    if (!attr?.scores || !Array.isArray(skills)) return skills;
    return skills.map((s) => {
        const ability = requiredAbility(s?.effects, attr);
        if (!ability || !effectNumbers(s.effects).length) return s;
        const k = scalingMultiplier(attr, ability, SKILL_REQUIREMENT);
        return k === 1 ? s : { ...s, effects: scaleEffects(s.effects, k) };
    });
}

// 显示用：逐项比较换算前后数值，返回 'up' / 'down' / 'same' 列表（与 effectNumbers 顺序一致）。
export function scalingMarks(effects, base) {
    const now = effectNumbers(effects);
    return now.map((n, i) => (!Array.isArray(base) || base[i] === undefined || n === base[i] ? 'same' : n > base[i] ? 'up' : 'down'));
}
