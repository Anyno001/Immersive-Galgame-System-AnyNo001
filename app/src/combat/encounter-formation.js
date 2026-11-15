// 固定编组的准入身份；不依赖敌人目录、档案校验器或引擎。
import { ENEMY_AFFIXES } from './enemy-affixes.js';

export const GARDENER_FORMATION = Object.freeze({
    id: 'enc-phantasmal-gardeners', enemyId: 'en-sts2-elite-04',
    openers: Object.freeze(['flail', 'bite', 'lash', 'enlarge']),
});

const GARDENER_CYCLE = ['bite', 'lash', 'flail', 'enlarge'];
const GARDENER_NEXT = Object.fromEntries(GARDENER_CYCLE.map((id, index) =>
    [id, [{ skill: GARDENER_CYCLE[(index + 1) % GARDENER_CYCLE.length], weight: 1 }]]));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => isObject(value) && Object.keys(value).every((key) => keys.includes(key));
const intInRange = (value, max) => Number.isInteger(value) && value >= 1 && value <= max;

function sameData(actual, expected) {
    if (actual === expected) return true;
    if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object'
        || Array.isArray(actual) !== Array.isArray(expected)) return false;
    const keys = Object.keys(expected);
    return Object.keys(actual).length === keys.length
        && keys.every((key) => Object.hasOwn(actual, key) && sameData(actual[key], expected[key]));
}

function validGardenerSkill(skill, index) {
    const id = GARDENER_CYCLE[index];
    if (!onlyKeys(skill, ['id', 'name', 'intent', 'effects', 'weight', 'cooldown', 'maxRepeat', 'description'])
        || skill.id !== id || skill.intent !== (id === 'enlarge' ? 'buff' : 'attack')
        || skill.weight !== 1 || skill.cooldown !== 0 || skill.maxRepeat !== 2
        || !Array.isArray(skill.effects) || skill.effects.length !== 1) return false;
    const effect = skill.effects[0];
    // 数值随档位、能力缩放；来源行为的算子、段数、状态和目标不得改变。
    return id === 'enlarge'
        ? intInRange(effect?.stacks, 10) && sameData(effect, { op: 'status', status: 'strength', stacks: effect.stacks, target: 'self' })
        : intInRange(effect?.amount, 99) && sameData(effect, { op: 'damage', amount: effect.amount, hits: id === 'flail' ? 3 : 1, target: 'enemy' });
}

function validGardenerPassives(passives) {
    if (!Array.isArray(passives) || passives.length < 1 || passives.length > 3) return false;
    const seen = new Set();
    for (const passive of passives) {
        if (!isObject(passive) || seen.has(passive.id)) return false;
        seen.add(passive.id);
        if (passive.id === 'skittish') {
            const effect = passive.effects?.[0];
            if (!onlyKeys(passive, ['id', 'name', 'trigger', 'effects', 'description'])
                || passive.trigger !== 'battle-start' || !Array.isArray(passive.effects) || passive.effects.length !== 1
                || !intInRange(effect?.stacks, 20)
                || !sameData(effect, { op: 'apply-status', status: 'skittish', stacks: effect.stacks, target: 'self' })) return false;
        } else {
            const key = typeof passive.id === 'string' && passive.id.startsWith('af-') ? passive.id.slice(3) : '';
            const def = Object.hasOwn(ENEMY_AFFIXES, key) ? ENEMY_AFFIXES[key] : null;
            if (!def || (def.tiers && !def.tiers.includes('elite'))
                || !onlyKeys(passive, ['id', 'name', 'trigger', 'cardType', 'effects', 'source', 'description'])
                || passive.source !== 'affix' || passive.trigger !== def.trigger || passive.cardType !== def.cardType
                || !sameData(passive.effects, def.effects)) return false;
        }
    }
    return seen.has('skittish');
}

function validGardenerBehavior(unit, index) {
    return Array.isArray(unit.skills) && unit.skills.length === GARDENER_CYCLE.length
        && GARDENER_CYCLE.every((id, slot) => validGardenerSkill(unit.skills[slot], slot))
        && sameData(unit.script, { opener: GARDENER_FORMATION.openers[index], next: GARDENER_NEXT })
        && validGardenerPassives(unit.passives)
        && (unit.phases === undefined || (Array.isArray(unit.phases) && unit.phases.length === 0))
        && (unit.actions === undefined || unit.actions === 1)
        && ['kin', 'kinScale', 'deathSpawns', 'minionOf', 'kinOf', 'kinKey'].every((key) => unit[key] === undefined);
}

export function validEncounterFormation(setup) {
    if (!setup || !Array.isArray(setup.units)) return false;
    const formation = setup.encounterFormation;
    if (!(setup.rulesVersion >= 6) || !onlyKeys(formation, ['id', 'unitIds'])
        || formation.id !== GARDENER_FORMATION.id || !Array.isArray(formation.unitIds)
        || formation.unitIds.length !== 4 || new Set(formation.unitIds).size !== 4
        || (setup.foeCap !== undefined && setup.foeCap !== 3)
        || (setup.reserve !== undefined && (!Array.isArray(setup.reserve) || setup.reserve.length))) return false;
    const enemies = setup.units.filter((unit) => unit?.side === 'enemy');
    return enemies.length === 4 && enemies.every((unit, index) => unit.id === formation.unitIds[index]
        && unit.kind === 'skill' && unit.tier === 'elite' && unit.minion === undefined
        && unit.encounter === `${GARDENER_FORMATION.id}-1`
        && unit.template?.enemyId === GARDENER_FORMATION.enemyId && unit.template.model === 'original'
        && validGardenerBehavior(unit, index));
}
