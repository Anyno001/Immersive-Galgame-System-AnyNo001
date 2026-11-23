// 敌人行动脚本专用条件：自己召出仍在场的随从数（kin）、同阵营其他存活单位数（allies）、
// 对方存活单位是否带有某状态（target-status / target-no-status）、同阵营任一存活单位已损失生命不低于阈值（ally-missing-hp-gte）。
// 只用于脚本的条件步与加权候选；纯函数，不引用其他战斗模块，供 schema、engine、policy 共用。
export const SCRIPT_COUNT_CONDITIONS = Object.freeze(['kin-lt', 'kin-gte', 'allies-lt', 'allies-gte']);
export const SCRIPT_STATUS_CONDITIONS = Object.freeze(['target-status', 'target-no-status']);
export const SCRIPT_MISSING_HP_CONDITIONS = Object.freeze(['ally-missing-hp-gte']);
export const SCRIPT_CONDITION_KINDS = Object.freeze([
    ...SCRIPT_COUNT_CONDITIONS,
    ...SCRIPT_STATUS_CONDITIONS,
    ...SCRIPT_MISSING_HP_CONDITIONS,
]);
export const SCRIPT_CONDITION_MAX = 5;
export const SCRIPT_MISSING_HP_MAX = 999;
export const isScriptCondition = (when) => SCRIPT_CONDITION_KINDS.includes(when?.kind);

const countOthers = (state, unit, keep) => Object.values(state?.units || {}).filter((other) => other && other.id !== unit.id && other.alive && keep(other)).length;
const foesWithStatus = (state, unit, status) => Object.values(state?.units || {}).some((other) => other && other.alive && other.side !== unit.side && (other.statuses?.[status] || 0) > 0);
const allyMissingHp = (state, unit, minLoss) => Object.values(state?.units || {}).some((other) => other && other.alive && other.side === unit.side && (other.maxHp - other.hp) >= minLoss);

export function scriptConditionHolds(state, unit, when) {
    switch (when?.kind) {
        case 'kin-lt':
            return countOthers(state, unit, (other) => other.kinOf === unit.id) < when.value;
        case 'kin-gte':
            return countOthers(state, unit, (other) => other.kinOf === unit.id) >= when.value;
        case 'allies-lt':
            return countOthers(state, unit, (other) => other.side === unit.side) < when.value;
        case 'allies-gte':
            return countOthers(state, unit, (other) => other.side === unit.side) >= when.value;
        case 'target-status':
            return foesWithStatus(state, unit, when.status);
        case 'target-no-status':
            return !foesWithStatus(state, unit, when.status);
        case 'ally-missing-hp-gte':
            return allyMissingHp(state, unit, when.value);
        default:
            return false;
    }
}
