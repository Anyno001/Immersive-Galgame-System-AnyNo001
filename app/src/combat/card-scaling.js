// 技能随能力缩放：按角色六维相对技能门槛，给技能数值乘一个 0.7~1.3 的倍率；另给旧 setup 牌面的涨跌标记。纯函数。
import { abilityMod } from './abilities.js';
import { scaleSpecOf } from './mechanics/registry.js';
// 规则 v5 机制登记入口：已登记算子可声明 scale（关键能力、数值字段、上限）参与缩放。
import './mechanics/index.js';

// 英雄技能的能力门槛。
export const SKILL_REQUIREMENT = 12;
// 每点差距对应的倍率步长，与倍率范围。
export const SCALING_STEP = 0.08;
export const SCALING_RANGE = Object.freeze([0.7, 1.3]);

// 效果 op 对应的关键能力；phys 表示取力量/敏捷中较高者。
const OP_ABILITY = Object.freeze({ damage: 'phys', 'damage-from-block': 'phys', block: 'con', heal: 'wis', status: 'cha', double: 'int', 'next-turn': 'int', 'each-turn': 'int' });
// 可缩放的数值字段及上限。
const SCALABLE = Object.freeze({
    damage: Object.freeze({ key: 'amount', max: 99 }),
    block: Object.freeze({ key: 'amount', max: 99 }),
    heal: Object.freeze({ key: 'amount', max: 60 }),
    status: Object.freeze({ key: 'stacks', max: 10 }),
});
// 内含子效果（then）的容器 op；requires 为规则 v6 固定卡的打出条件（mechanics/fixed-pile.js）。
const CONTAINER_OPS = new Set(['conditional', 'each-turn', 'buff', 'requires']);
const CONDITION_OPS = new Set(['conditional', 'requires']);

const asArray = (value) => (Array.isArray(value) ? value : []);
// 内置算子查固定表，已登记算子查其 scale 声明；都没有时为 null。
const abilityOf = (op) => (Object.hasOwn(OP_ABILITY, op) ? OP_ABILITY[op] : scaleSpecOf(op)?.ability ?? null);
const scalableOf = (op) => {
    if (Object.hasOwn(SCALABLE, op)) return SCALABLE[op];
    const spec = scaleSpecOf(op);
    return spec ? { key: spec.key, max: spec.max } : null;
};

// 效果列表里第一个有对应能力的 op（条件效果递归进 then）。
function firstScalingOp(effects) {
    for (const effect of asArray(effects)) {
        if (CONDITION_OPS.has(effect?.op)) {
            const inner = firstScalingOp(effect.then);
            if (inner) return inner;
        } else if (abilityOf(effect?.op)) return effect.op;
    }
    return null;
}

// 效果所需的关键能力键；无可缩放效果返回 null。
export function requiredAbility(effects, character) {
    const op = firstScalingOp(effects);
    if (!op) return null;
    const ability = abilityOf(op);
    if (ability !== 'phys') return ability;
    const scores = character?.scores || {};
    return (scores.dex ?? 0) > (scores.str ?? 0) ? 'dex' : 'str';
}

// 缩放倍率：（角色能力修正 + 熟练）与（门槛修正 + 2）之差，每点 8%，夹到范围内，保留两位小数。
export function scalingMultiplier(character, ability, required) {
    if (!character?.scores || !ability || !Number.isFinite(required)) return 1;
    const diff = abilityMod(character.scores[ability]) + (Number(character.proficiency) || 0) - (abilityMod(required) + 2);
    const [low, high] = SCALING_RANGE;
    return Math.round(Math.min(high, Math.max(low, 1 + SCALING_STEP * diff)) * 100) / 100;
}

// 按出现顺序收集所有可缩放数值（容器 op 递归进 then）。
export function effectNumbers(effects) {
    const numbers = [];
    for (const effect of asArray(effects)) {
        if (CONTAINER_OPS.has(effect?.op)) numbers.push(...effectNumbers(effect.then));
        else {
            const spec = scalableOf(effect?.op);
            if (spec && Number.isFinite(effect[spec.key])) numbers.push(effect[spec.key]);
        }
    }
    return numbers;
}

// 按倍率缩放效果列表，返回新数组；倍率为 1 时原样返回。数值夹到 [1, 上限]。
export function scaleEffects(effects, multiplier) {
    if (multiplier === 1) return effects;
    return asArray(effects).map((effect) => {
        if (CONTAINER_OPS.has(effect?.op)) return { ...effect, then: scaleEffects(effect.then, multiplier) };
        const spec = scalableOf(effect?.op);
        return spec && Number.isFinite(effect[spec.key]) ? { ...effect, [spec.key]: Math.min(spec.max, Math.max(1, Math.round(effect[spec.key] * multiplier))) } : effect;
    });
}

// 缩放技能列表（统一用 SKILL_REQUIREMENT 门槛）；倍率为 1 的技能原样保留。
export function scaleSkills(skills, character) {
    if (!character?.scores || !Array.isArray(skills)) return skills;
    return skills.map((skill) => {
        const ability = requiredAbility(skill?.effects, character);
        if (!ability || !effectNumbers(skill.effects).length) return skill;
        const multiplier = scalingMultiplier(character, ability, SKILL_REQUIREMENT);
        return multiplier === 1 ? skill : { ...skill, effects: scaleEffects(skill.effects, multiplier) };
    });
}

// 缩放后相对基础数值的涨跌标记：'same' | 'up' | 'down'，与 effectNumbers 一一对应。
export function scalingMarks(effects, baseNumbers) {
    return effectNumbers(effects).map((value, index) => (!Array.isArray(baseNumbers) || baseNumbers[index] === undefined || value === baseNumbers[index] ? 'same' : value > baseNumbers[index] ? 'up' : 'down'));
}
