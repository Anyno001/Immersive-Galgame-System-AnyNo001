// 来源×档位归一：只改生命、伤害和格挡数值，保留段数、触发器与行动结构。
import { COMBAT_RULES } from '../rules.js';
import { effectsDamage } from '../schema.js';
import { APPLY_STATUSES } from '../mechanics/apply-status.js';
import { freezeEnemyData } from './dsl.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const positive = (value) => Number.isFinite(value) && value > 0;
export const modelSkills = (model) => [...(model?.skills || []), ...(model?.phases || []).flatMap((p) => p.addSkills || [])];
export const modelDamage = (model) => Math.max(0,
    ...modelSkills(model).map((s) => effectsDamage(s.effects)),
    ...Object.values(model?.kin || {}).map((def) => modelDamage(def)),
);
export function sourceHp(value) {
    if (positive(value)) return value;
    if (Array.isArray(value) && value.length === 2 && value.every(positive) && value[0] <= value[1]) return (value[0] + value[1]) / 2;
    return null;
}
const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// 每敌人贡献一个HP中点和一个最大单招总伤害；无直伤条目不参与伤害中位数。
export function enemyReferences(entries) {
    const groups = {};
    for (const item of entries) {
        if (item.status !== 'release' || item.excluded) continue;
        const hp = sourceHp(item.hp);
        if (hp === null) throw new Error(`enemy-source-hp:${item.id}`);
        const key = `${item.source}|${item.tier}`;
        const group = groups[key] || (groups[key] = { hp: [], damage: [] });
        group.hp.push(hp);
        const damage = modelDamage(item.original);
        if (positive(damage)) group.damage.push(damage);
    }
    return freezeEnemyData(Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, {
        hp: median(group.hp), damage: group.damage.length ? median(group.damage) : null,
    }])));
}

const DAMAGE_OPS = new Set(['damage', 'drain', 'mutual-damage', 'delayed-counter', 'foe-volley', 'foe-surge']);
// 数值成长（M5）的增量与上限随伤害一同换算；target-hp 的除数按生命比例，不换算。
const SURGE_KEYS = ['per', 'cap'];
// M6 层数即绝对数值的特性：硬壳额度、胆怯格挡、金属化格挡随格挡（生命比例）换算，蒸汽存量随伤害换算，不超过单次施加上限。
const STATUS_SCALE = Object.freeze({ shell: 'block', skittish: 'block', metallicize: 'block', steam: 'damage' });
const scaledStacks = (stacks, ratio, max) => Math.min(max, Math.max(1, Math.round(stacks * ratio)));
function scaleEffects(effects, scale) {
    return (effects || []).map((effect) => {
        const next = { ...effect };
        if (DAMAGE_OPS.has(effect.op)) next.amount = Math.max(1, Math.floor(effect.amount * scale.damage + 1e-9));
        else if (effect.op === 'block') next.amount = Math.max(1, Math.round(effect.amount * scale.block));
        if (effect.op === 'foe-surge') for (const key of SURGE_KEYS) if (effect[key] !== undefined) next[key] = Math.max(1, Math.floor(effect[key] * scale.damage + 1e-9));
        if (effect.op === 'apply-status' && STATUS_SCALE[effect.status]) next.stacks = scaledStacks(effect.stacks, scale[STATUS_SCALE[effect.status]], APPLY_STATUSES[effect.status].max);
        // 缠绕每回合造成层数伤害，随伤害换算。
        if (effect.op === 'constrict') next.stacks = scaledStacks(effect.stacks, scale.damage, 20);
        for (const key of ['then', 'a', 'b']) if (Array.isArray(effect[key])) next[key] = scaleEffects(effect[key], scale);
        return next;
    });
}
// 累计失血打断（M4 hp-lost）的阈值与递增随生命比例换算，触发格挡随格挡比例换算；
// 换算探测（只给 damage / block）不带 hpRatio 时保持原值。
const scaledInt = (value, ratio, max) => Math.min(max, Math.max(1, Math.round(value * ratio)));
function scaleInterrupt(rule, scale) {
    const next = { ...rule };
    if (rule.on === 'hp-lost' && Number.isFinite(scale.hpRatio)) {
        next.amount = scaledInt(rule.amount, scale.hpRatio, 999);
        if (rule.step !== undefined) next.step = scaledInt(rule.step, scale.hpRatio, 99);
    }
    if (rule.block !== undefined && Number.isFinite(scale.block)) next.block = scaledInt(rule.block, scale.block, 99);
    return next;
}
export function scaleEnemyModel(model, scale) {
    const next = copy(model);
    const map = (list) => (list || []).map((item) => ({ ...item, effects: scaleEffects(item.effects, scale) }));
    next.skills = map(next.skills);
    if (next.passives) next.passives = map(next.passives);
    if (next.phases) next.phases = next.phases.map((p) => ({ ...p, addSkills: map(p.addSkills), passives: map(p.passives) }));
    if (next.script?.interrupts) next.script = { ...next.script, interrupts: next.script.interrupts.map((rule) => scaleInterrupt(rule, scale)) };
    if (next.kin) next.kin = Object.fromEntries(Object.entries(next.kin).map(([key, def]) => [key, {
        ...scaleEnemyModel(def, scale),
        maxHp: Number.isFinite(scale.hpRatio) ? scaledInt(def.maxHp, scale.hpRatio, 9999) : def.maxHp,
    }]));
    return next;
}

// 同一敌人的两种模型共用换算系数；伤害超限时统一缩小，绝不裁段数或删效果。
export function enemyScale(item, models, references) {
    const tier = COMBAT_RULES.tiers[item.tier];
    const ref = references[`${item.source}|${item.tier}`];
    const hp = sourceHp(item.hp);
    if (!tier || !ref || !positive(ref.hp) || hp === null) throw new Error(`enemy-reference:${item.id}`);
    const tune = item.scale || {};
    for (const key of ['hp', 'damage', 'block']) {
        if (tune[key] !== undefined && !positive(tune[key])) throw new Error(`enemy-scale:${item.id}:${key}`);
    }
    const hasDamage = Object.values(models).some((model) => modelDamage(model) > 0);
    if (hasDamage && !positive(ref.damage)) throw new Error(`enemy-reference-damage:${item.id}`);
    const hpRatio = tier.hp / ref.hp;
    const baseDamage = (hasDamage ? tier.damageCap / ref.damage : 1) * (tune.damage ?? 1);
    const maxDamage = Math.max(...Object.values(models).map(modelDamage));
    let capRatio = maxDamage > 0 ? Math.min(1, tier.damageCap / (maxDamage * baseDamage)) : 1;
    const block = hpRatio * (tune.block ?? 1);
    // 每段至少1点；向下取整不可能降低到上限时明确拒绝，不偷偷裁掉攻击。
    let damage = baseDamage * capRatio;
    const fits = () => Object.values(models).every((model) => modelDamage(scaleEnemyModel(model, { damage, block })) <= tier.damageCap);
    if (!fits()) {
        damage = 0;
        if (!fits()) throw new Error(`enemy-damage-floor:${item.id}`);
        let low = 0;
        let high = baseDamage * capRatio;
        for (let i = 0; i < 48; i += 1) {
            damage = (low + high) / 2;
            if (fits()) low = damage;
            else high = damage;
        }
        damage = low;
        capRatio = damage / baseDamage;
    }
    const convertedHp = Math.round(hp * hpRatio * (tune.hp ?? 1));
    return freezeEnemyData({
        hp: Math.min(Math.round(tier.hp * 1.5), Math.max(Math.round(tier.hp * 0.5), convertedHp)),
        hpRatio, damage, block, capRatio,
    });
}
