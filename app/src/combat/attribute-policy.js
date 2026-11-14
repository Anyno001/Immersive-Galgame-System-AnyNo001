import { abilityMod, ABILITY_KEYS } from './abilities.js';

// v1：属性修正 + 熟练加值；v2（规则 v7 起）：只看属性修正，曲线放大，等级不再带来倍率成长。
export const ATTRIBUTE_POLICY_VERSION = 2;
export const ATTRIBUTE_POLICY_VERSIONS = Object.freeze([1, 2]);
const ATTRIBUTE_RULES_MIN_VERSION = Object.freeze({ 1: 6, 2: 7 });
const CURVES = Object.freeze({
    1: { normal: { step: 0.08, low: 0.90, high: 1.30 }, support: { step: 0.04, low: 0.95, high: 1.15 } },
    2: { normal: { step: 0.30, low: 0.70, high: 3.00 }, support: { step: 0.15, low: 0.85, high: 2.00 } },
});
export const OFFENSE_ABILITY = Object.freeze({ warrior: 'str', guardian: 'str', assassin: 'str', ranger: 'str', mage: 'int', priest: 'wis', summoner: 'cha', bard: 'cha' });
export const ATTRIBUTE_SIFT_AT = 16;
export const CARD_ARCHETYPES = Object.freeze([...Object.keys(OFFENSE_ABILITY), 'general']);

// setup.attributeRules 与规则版本的配对：1 需 rulesVersion ≥ 6，2 需 ≥ 7。
export const validAttributeRules = (rules, rulesVersion) => Object.hasOwn(ATTRIBUTE_RULES_MIN_VERSION, rules)
    && ATTRIBUTE_POLICY_VERSIONS.includes(rules) && rulesVersion >= ATTRIBUTE_RULES_MIN_VERSION[rules];

// version 给定时策略版本必须与 setup.attributeRules 一致。
export function validAttributePolicy(value, version) {
    return Boolean(value && ATTRIBUTE_POLICY_VERSIONS.includes(value.version) && (version === undefined || value.version === version)
        && Object.hasOwn(OFFENSE_ABILITY, value.role)
        && value.scores && ABILITY_KEYS.every(key => Number.isInteger(value.scores[key]) && value.scores[key] >= 1 && value.scores[key] <= 30)
        && Number.isInteger(value.proficiency) && value.proficiency >= 2 && value.proficiency <= 9);
}

export function createAttributePolicy(character) {
    const attr = character?.attributes || character;
    if (!attr?.scores) return null;
    const role = character?.classProfile?.archetype ?? attr.role;
    const policy = { version: ATTRIBUTE_POLICY_VERSION, role, scores: { ...attr.scores }, proficiency: attr.proficiency };
    if (!validAttributePolicy(policy)) throw new Error('invalid-attribute-policy');
    return policy;
}

export function policyOf(unit) {
    if (unit?.attributePolicy === undefined) return null;
    if (!validAttributePolicy(unit.attributePolicy)) throw new Error('invalid-attribute-policy');
    return unit.attributePolicy;
}

export function cardAbility(policy, archetype, role) {
    if (!CARD_ARCHETYPES.includes(archetype)) throw new Error('invalid-card-archetype');
    if (role === 'damage') return OFFENSE_ABILITY[archetype === 'general' ? policy.role : archetype];
    if (role === 'block') return ['mage', 'priest', 'summoner', 'bard'].includes(archetype) ? OFFENSE_ABILITY[archetype] : 'dex';
    if (role === 'heal') return 'wis';
    return ABILITY_KEYS.includes(role) ? role : null;
}

export function attributeMultiplier(policy, ability, tier = 'normal') {
    if (!validAttributePolicy(policy) || !ABILITY_KEYS.includes(ability)) throw new Error('invalid-attribute-policy');
    const curve = CURVES[policy.version][tier === 'support' ? 'support' : 'normal'];
    const diff = abilityMod(policy.scores[ability]) + (policy.version === 1 ? policy.proficiency - 2 : 0);
    return Math.round(Math.max(curve.low, Math.min(curve.high, 1 + curve.step * diff)) * 100) / 100;
}

export const scalePositive = (value, multiplier) => Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value * multiplier)) : value;
export const canAttributeSift = unit => (policyOf(unit)?.scores.dex ?? 0) >= ATTRIBUTE_SIFT_AT;
