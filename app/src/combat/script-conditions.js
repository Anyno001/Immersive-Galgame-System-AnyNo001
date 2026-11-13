// 敌人行动脚本专用条件：自己召出、仍在场的随从数（kin），同阵营其他存活单位数（allies）。
// 只用于脚本的条件步与加权候选；纯函数，不引用其他战斗模块，供 schema、engine、policy 共用。
export const SCRIPT_CONDITION_KINDS = Object.freeze(['kin-lt', 'kin-gte', 'allies-lt', 'allies-gte']);
export const SCRIPT_CONDITION_MAX = 5;
export const isScriptCondition = (when) => SCRIPT_CONDITION_KINDS.includes(when?.kind);

const countOthers = (state, unit, keep) => Object.values(state?.units || {}).filter((other) => other && other.id !== unit.id && other.alive && keep(other)).length;

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
        default:
            return false;
    }
}
