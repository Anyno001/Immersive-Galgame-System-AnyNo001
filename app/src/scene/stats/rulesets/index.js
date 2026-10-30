// 规则体系登记表（数值 v2 §2）：本期内置 CoC 第七版与 D&D 第五版；第三方可经 registerRuleset 追加。
// 每个体系提供 resolve / contest / passiveOpposition / chance / rawRoll / rawNeed，均为纯函数。
import * as coc7 from './coc7.js';
import * as dnd5e from './dnd5e.js';

const REGISTRY = new Map([[coc7.ID, coc7], [dnd5e.ID, dnd5e]]);
export const DEFAULT_RULESET = coc7.ID;
const REQUIRED = ['resolve', 'contest', 'passiveOpposition', 'chance', 'rawRoll', 'rawNeed'];

export function registerRuleset(ruleset) {
    if (!ruleset || typeof ruleset.ID !== 'string' || !/^[a-z0-9-]{2,24}$/.test(ruleset.ID)) return false;
    if (REGISTRY.has(ruleset.ID) || REQUIRED.some((key) => typeof ruleset[key] !== 'function')) return false;
    REGISTRY.set(ruleset.ID, ruleset);
    return true;
}

export function getRuleset(id) {
    return REGISTRY.get(id) || REGISTRY.get(DEFAULT_RULESET);
}

export function hasRuleset(id) {
    return REGISTRY.has(id);
}

export function rulesetOptions() {
    return [...REGISTRY.values()].map((r) => [r.ID, r.LABEL || r.ID]);
}
