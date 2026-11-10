import { abilityMod, ABILITY_KEYS } from './abilities.js';

export const ATTRIBUTE_POLICY_VERSION = 1;
export const OFFENSE_ABILITY = Object.freeze({ warrior: 'str', guardian: 'str', assassin: 'str', ranger: 'str', mage: 'int', priest: 'wis', summoner: 'cha', bard: 'cha' });
export const ATTRIBUTE_SIFT_AT = 16;
export const CARD_ARCHETYPES = Object.freeze([...Object.keys(OFFENSE_ABILITY), 'general']);

export function validAttributePolicy(value) {
    return Boolean(value && value.version === ATTRIBUTE_POLICY_VERSION && Object.hasOwn(OFFENSE_ABILITY, value.role)
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
    const diff = abilityMod(policy.scores[ability]) + policy.proficiency - 2;
    const conservative = tier === 'support';
    const step = conservative ? 0.04 : 0.08;
    const low = conservative ? 0.85 : 0.70;
    const high = conservative ? 1.15 : 1.30;
    return Math.round(Math.max(low, Math.min(high, 1 + step * diff)) * 100) / 100;
}

export const scalePositive = (value, multiplier) => Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value * multiplier)) : value;
export const canAttributeSift = unit => (policyOf(unit)?.scores.dex ?? 0) >= ATTRIBUTE_SIFT_AT;
