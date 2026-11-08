// 规则 v6 战斗外遗物结算（G5f-4）：人物特性里记着遗物引用、且该模型为战斗外用途时，由程序在战斗外按此结算。
// 只依赖遗物表索引（不引 schema / draw），schema 与账本都能直接用。
import { RELIC_MODELS, isCombatModel, relicById } from './index.js';

// 引用指向的战斗外模型；引用无效或为战斗内模型时返回 null。
export function offCombatModel(ref) {
    if (!ref || !RELIC_MODELS.includes(ref.model)) return null;
    const model = relicById(ref.relicId)?.[ref.model];
    return model && !isCombatModel(model) ? model : null;
}

const sameRef = (a, b) => a?.relicId === b?.relicId && a?.model === b?.model;
const refOf = (ref) => ({ relicId: ref.relicId, model: ref.model });

// 持有的某用途战斗外遗物引用（按特性顺序，同一件只计一次）。
export function heldOffCombat(traits, kind) {
    const refs = [];
    for (const trait of Array.isArray(traits) ? traits : []) {
        const model = offCombatModel(trait?.relic);
        if (model?.kind === kind && !refs.some((ref) => sameRef(ref, trait.relic))) refs.push(refOf(trait.relic));
    }
    return refs;
}

// 胜利积分加成（加金币 → 战斗胜利积分）：按遗物引用重算，定额 amount 不变。
// 固定加成相加；百分比加成按定额向下取整；hpMax 为每胜最大生命加成。没有任何加成时返回 null。
export function winPointsBonus(refs, amount) {
    const list = (Array.isArray(refs) ? refs : []).filter((ref) => offCombatModel(ref)?.kind === 'win-points');
    if (!list.length) return null;
    let add = 0;
    let percent = 0;
    let hpMax = 0;
    for (const ref of list) {
        const model = offCombatModel(ref);
        add += model.add || 0;
        percent += model.percent || 0;
        hpMax += model.hpMax || 0;
    }
    return { points: add + Math.floor((Number(amount) || 0) * percent / 100), hpMax, relics: list.map(refOf) };
}

// 引用列表是否都在持有特性里（账本重放按当时持有核对，防止伪造）。
export const refsHeld = (refs, traits) => (Array.isArray(refs) ? refs : []).every((ref) => (Array.isArray(traits) ? traits : []).some((trait) => sameRef(trait?.relic, ref)));
