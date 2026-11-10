import { attributeMultiplier, cardAbility, policyOf, scalePositive } from './attribute-policy.js';
import { cardArchetypeOf } from './card-origin.js';
import { opHandler, validAttributeSpec } from './mechanics/registry.js';
import { statusAttributeSpec } from './mechanics/apply-status.js';

const spec = (ability, key = 'amount', tier = 'normal') => ({ ability, key, tier, timing: 'static' });
const builtInSpec = effect => {
    if (['damage', 'block', 'heal'].includes(effect.op)) return spec(effect.op);
    if (effect.op === 'status') return statusAttributeSpec(effect.status);
    if (effect.op === 'next-turn' && effect.gain === 'status') return statusAttributeSpec(effect.status);
    return null;
};
const scaled = (value, meta) => {
    const amount = scalePositive(value, meta.multiplier);
    return meta.max === undefined ? amount : Math.min(meta.max, amount);
};

export const attributeAmount = (effect, value) => effect?._attribute?.timing === 'deferred'
    ? scaled(value, effect._attribute) : value;

export function attributeCardView(card, unit) {
    const policy = policyOf(unit);
    if (!policy || card.attributeScaling) return card;
    const archetype = cardArchetypeOf(card);
    const marks = [];
    const walk = (effects, path) => (effects || []).map((effect, index) => {
        const at = `${path}.${index}`;
        let out = { ...effect };
        for (const key of ['then', 'a', 'b']) if (Array.isArray(effect[key])) out[key] = walk(effect[key], `${at}.${key}`);
        const declared = opHandler(effect.op)?.attribute;
        const rule = builtInSpec(effect) ?? (typeof declared === 'function' ? declared(effect) : declared);
        if (!rule) return out;
        if (!validAttributeSpec(rule)) throw new Error('invalid-attribute-spec');
        const ability = cardAbility(policy, archetype, rule.ability);
        const meta = { ...rule, ability, multiplier: attributeMultiplier(policy, ability, rule.tier) };
        const base = effect[rule.key];
        if (rule.timing === 'static' && Number.isFinite(base)) out[rule.key] = scaled(base, meta);
        out._attribute = meta;
        marks.push({ path: `${at}.${rule.key}`, ...meta, base, value: out[rule.key] });
        return out;
    });
    const effects = walk(card.effects, 'effects');
    const onDiscard = card.onDiscard ? walk(card.onDiscard, 'onDiscard') : null;
    return { ...card, archetype, effects, ...(onDiscard ? { onDiscard } : {}), attributeScaling: marks };
}
