// 规则体系登记表（合并计划 Q2）：日常检定统一为 d20（保留优势 / 劣势双骰），CoC 百分骰已移除。
// 旧存档里记为 coc7 的检定读取时按 d20 体系处理；第三方仍可经 registerRuleset 追加。
import * as dnd5e from './dnd5e.js';

const REGISTRY = new Map([[dnd5e.ID, dnd5e]]);
export const DEFAULT_RULESET = dnd5e.ID;
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
