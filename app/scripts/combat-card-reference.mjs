// D-2 只读标定：独立参考样本与固定卡手写→落窗对照；不访问用户数据、不生成发布产物。
// node scripts/combat-card-reference.mjs [--json|--scaled] [--group warrior] [--check]
import { readFileSync } from 'node:fs';
import { REFERENCE_CARDS } from './combat-card-reference-data.mjs';
import { FIXED_CLASS_CARDS, FIXED_GENERAL_CARDS } from '../src/combat/fixed-cards/index.js';
import { DROPPED_UPGRADES, FIT_TRACE } from '../src/combat/fixed-cards/dsl.js';
import { APPLY_STATUSES } from '../src/combat/mechanics/apply-status.js';
import { CARD_BUDGET_V1, COMBAT_RULES, estimateCardValue, evaluateCardBudget } from '../src/combat/rules.js';

const EPS = 1e-9;
const round2 = x => Math.round(x * 100) / 100;
const floor05 = x => round2(Math.floor(x * 20 + EPS) / 20);
const ceil05 = x => round2(Math.ceil(x * 20 - EPS) / 20);
const round05 = x => round2(Math.round(x * 20) / 20);
const quantile = (xs, q) => {
    const s = [...xs].sort((a, b) => a - b);
    const i = (s.length - 1) * q;
    return s.length ? s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i % 1) : 0;
};
const stats = xs => ({ n: xs.length, min: round2(Math.min(...xs)), p10: round2(quantile(xs, 0.1)),
    median: round2(quantile(xs, 0.5)), p90: round2(quantile(xs, 0.9)), max: round2(Math.max(...xs)) });
const upgraded = card => ({ ...card, ...card.upgraded });
const allFixed = [...Object.values(FIXED_CLASS_CARDS).flat(), ...FIXED_GENERAL_CARDS];
const traceById = new Map(FIT_TRACE.map(t => [t.id, t]));
const sourceCache = new Map();
const rows = REFERENCE_CARDS.map(({ ref, source, line, card }) => {
    if (!sourceCache.has(source)) sourceCache.set(source, readFileSync(new URL(`../../${source}`, import.meta.url), 'utf8').split(/\r?\n/));
    if (!sourceCache.get(source)[line - 1]?.startsWith(`| ${ref} |`)) throw Error(`参考来源不匹配：${source}:${line} ${ref}`);
    const value = estimateCardValue(card);
    const upValue = estimateCardValue(upgraded(card));
    const budget = COMBAT_RULES.costBudget[card.cost];
    const upBudget = COMBAT_RULES.costBudget[card.upgraded.cost ?? card.cost];
    const check = evaluateCardBudget(card);
    return { id: card.id, ref, source, line, type: card.type, rarity: card.rarity, cost: card.cost, value, upValue,
        ratio: value / budget, upgradeRatio: upValue / value, upgradeGain: (upValue - value) / budget,
        normalizedUpgradeGain: upValue / upBudget - value / budget, inWindow: check.ok, reason: check.reason ?? '', card };
});

// 用不可变的 D-2 前基线反解，避免反复运行时把已标定窗口继续相乘。
const common = rows.filter(r => r.rarity === 'common');
const k = round05(quantile(common.map(r => r.ratio), 0.5));
const windows = Object.fromEntries(Object.entries(CARD_BUDGET_V1.rarityWindows).map(([rarity, old]) => {
    if (rarity === 'basic') return [rarity, { ...old }];
    const ratios = rows.filter(r => r.rarity === rarity).map(r => r.ratio);
    return [rarity, {
        min: Math.min(old.min, ratios.length ? floor05(Math.min(...ratios)) : old.min),
        max: Math.max(round2(old.max * k), ratios.length ? ceil05(quantile(ratios, 0.95)) : 0),
        target: round2(old.target * k),
    }];
}));
const upgradeNeeds = rows.map(r => r.upValue / (COMBAT_RULES.costBudget[r.card.upgraded.cost ?? r.cost] * windows[r.rarity].max));
const allowance = Math.max(CARD_BUDGET_V1.upgradeAllowance, ceil05(quantile(upgradeNeeds, 0.9)));
const templateGain = Math.max(0.25, round05(quantile(common.map(r => r.upgradeGain), 0.5)));
const suggestedRules = { ...COMBAT_RULES, rarityWindows: windows, upgradeAllowance: allowance, templateUpgradeGain: templateGain };
const rate = check => {
    const passed = rows.filter(check).length;
    return { passed, total: rows.length, rate: passed / rows.length, meets90: passed * 10 >= rows.length * 9 };
};
const coverage = key => Object.fromEntries([...new Set(rows.map(r => r[key]))].map(value => [value, rows.filter(r => r[key] === value).length]));
const fieldChanges = (before, after, path = '') => {
    if (Object.is(before, after)) return [];
    if (typeof before === 'number' && typeof after === 'number') return [{ path, before, after,
        kind: 'numeric', change: Math.abs(after - before) / Math.max(1, Math.abs(before)) }];
    if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
        return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key =>
            fieldChanges(before[key], after[key], path ? `${path}.${key}` : key));
    }
    return [{ path, kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'structural',
        ...(before === undefined ? {} : { before }), ...(after === undefined ? {} : { after }) }];
};
// 展开纯降费升级，避免将省略的同效果升级误报为结构丢失；展示元数据不参与效果对照。
const definitionShape = card => {
    const { id, name, model, flavor, skillRef, archetype, upgraded: up, ...base } = card;
    return { ...base, ...(up ? { upgraded: { cost: up.cost ?? card.cost, effects: up.effects ?? card.effects } } : {}) };
};
const fitRows = FIT_TRACE.map(({ id, raw, fitted }) => {
    const changes = fieldChanges(definitionShape(raw), definitionShape(fitted));
    return { id, name: raw.name, rawValue: estimateCardValue(raw), fittedValue: estimateCardValue(fitted),
        rawUpgradeValue: estimateCardValue(upgraded(raw)), fittedUpgradeValue: estimateCardValue(upgraded(fitted)),
        changes, over20: changes.some(c => c.change > 0.2 + EPS) };
});
const invalidFixed = allFixed.map(card => ({ id: card.id, ...evaluateCardBudget(card) })).filter(r => !r.ok);
const structuralFitChanges = fitRows.filter(r => r.changes.some(c => c.kind !== 'numeric'));
const referenceDiffs = rows.map(r => {
    const trace = traceById.get(r.id);
    if (!trace) return { id: r.id, differences: [], anchor: true };
    // 对照原版与项目手写值；差异不是拟合损失，单列供人工复核。
    return { id: r.id, differences: fieldChanges(definitionShape(r.card), definitionShape(trace.raw)) };
});

const inWindow = {
    baseline: rate(r => evaluateCardBudget(r.card, CARD_BUDGET_V1).ok),
    current: rate(r => r.inWindow), suggested: rate(r => evaluateCardBudget(r.card, suggestedRules).ok),
};
const assumptions = {
    eachTurn: { coefficient: COMBAT_RULES.cardValue.eachTurn, decision: '保留；按折现后的预期触发次数估值，不是持续回合上限，待 D3 实战分组复核' },
    area: { coefficient: COMBAT_RULES.cardValue.area, decision: '保留 1.4；参考样本中的全体攻击与单体牌同窗，不能从原版数值唯一反解敌人数' },
    damageFromBlock: { expectedBlock: COMBAT_RULES.cardValue.expectedBlock, value: estimateCardValue({ effects: [{ op: 'damage-from-block' }] }),
        decision: '按 8 点预期格挡×伤害单位价值估值；实际使用当前格挡，不更改技能伤害上限的保守判定' },
    powerStatuses: Object.fromEntries(['barricade', 'plated', 'ember', 'juggernaut'].map(key => [key, {
        coefficient: APPLY_STATUSES[key].value, decision: '保留每层估值；实际收益依赖存活、漏伤及触发次数，不因整场有效直接上调',
    }])),
};
const report = {
    sample: rows.length, coverage: { rarity: coverage('rarity'), cost: coverage('cost'), type: coverage('type') },
    inWindow, ratio: Object.fromEntries([...new Set(rows.map(r => r.rarity))].map(rarity => [rarity, stats(rows.filter(r => r.rarity === rarity).map(r => r.ratio))])),
    upgradeRatio: stats(rows.map(r => r.upgradeRatio)), upgradeGain: stats(rows.map(r => r.normalizedUpgradeGain)),
    suggest: { k, rarityWindows: windows, upgradeAllowance: allowance, templateUpgradeGain: templateGain }, assumptions,
    outOfWindow: rows.filter(r => !r.inWindow).map(({ id, ref, reason }) => ({ id, ref, reason })),
    fixed: { total: allFixed.length, invalid: invalidFixed, droppedUpgrades: DROPPED_UPGRADES,
        structuralChanges: structuralFitChanges, scaledOver20: fitRows.filter(r => r.over20) },
    referenceDiffs, rows: rows.map(({ card, ...row }) => row), fits: fitRows,
};
const argAt = process.argv.indexOf('--group');
const group = argAt < 0 ? '' : process.argv[argAt + 1];
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else if (process.argv.includes('--scaled')) {
    for (const row of report.fixed.scaledOver20.filter(r => !group || r.id.startsWith(`fx-${group}-`))) console.log(JSON.stringify(row));
} else {
    console.log(JSON.stringify({ ...report, rows: undefined, fits: undefined, referenceDiffs: undefined,
        fixed: { ...report.fixed, scaledOver20: report.fixed.scaledOver20.length } }, null, 2));
}
if (process.argv.includes('--check') && (!inWindow.current.meets90 || invalidFixed.length || DROPPED_UPGRADES.length || structuralFitChanges.length)) process.exitCode = 1;
