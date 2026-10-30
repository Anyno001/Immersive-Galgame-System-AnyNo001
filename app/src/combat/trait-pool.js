import { CARD_TEMPLATES, FLAIR_PASSIVE_TEMPLATES, TRAIT_SKILL_TEMPLATE_KEYS, passiveAtRarity, solveCardTemplate } from './card-templates.js';
import { COMBAT_RULES, estimateEffectsValue, evaluateCardBudget } from './rules.js';
import { hash32, nextRandom } from './random.js';
import { effectsDamage } from './schema.js';
import { TRAIT_SKILL_COSTS } from './traits.js';
import { forbiddenCombos } from './combos.js';

// 人物特性抽取池（v4-p6 / v4-p9-gen，计划 3.5）：主动与被动同一个池子，效果由程序按种子抽定，副 LLM 只起名、写来历。
// 稀有度沿用 planTrait（旧结果不变）；池里的条目在派生种子 trait-pool:<seed> 上等概率抽取，主动与被动的比例就是池子组成。
// 主动：可作人物技能的卡牌模板（TRAIT_SKILL_TEMPLATE_KEYS），费用在 1 / 2 里按种子取一个有解的，按费用 × 特性稀有度求解（与 schema traitSkillAt 的预算同一口径）。
// 被动：触发时机 × 效果字段，字段数按稀有度（TRAIT_FIELD_COUNTS）；字段数 ≥ 2 时其中一个可以是条件（条件分支内放其余效果）。
// 被动数值：单次估值 × 时机的每场预期触发次数，摊到 PASSIVE_BUDGET × 稀有度系数（与 passiveAtRarity 同一口径），落在 [UNDER, OVER] 倍之间才进池。
// 华而不实被动也在池里：同一时机的几个华而不实被动凑字段数（同时机不够时少于字段数），按 passiveAtRarity 加强。
// 全部条目须过 combos.js 的禁止组合名单（被动另计卡组里可能有的被弃时效果）与队友技能伤害上限。
export const TRAIT_FIELD_COUNTS = Object.freeze({ common: 1, uncommon: 1, rare: 2, epic: 2, mythic: 3 });
// common 的每场预期估值，取现有被动模板（PASSIVE_TEMPLATES）的平均水平。
export const PASSIVE_BUDGET = 10;
const OVER = 1.35;
const UNDER = 0.5;
const EPS = 1e-9;
// 条件分支按 rules.js 的估值折 0.6，数量相应放大；字段数 ≥ 2 时有 1/3 的机会把一个字段换成条件。
const CONDITION_SCALE = 0.6;
const CONDITION_CHANCE = 1 / 3;
const rarityScale = (rarity) => (COMBAT_RULES.rarityWindows[rarity]?.target || 1) / COMBAT_RULES.rarityWindows.common.target;

// 时机（可限牌型）、每场预期触发次数、说明。对方出牌只给敌人，不进特性池。
export const TRAIT_TRIGGERS = Object.freeze([
    ['battle-start', null, 1, '开战时'], ['turn-start', null, 4, '回合开始时'], ['turn-end', null, 4, '回合结束时'],
    ['on-hit', null, 3, '受到攻击后'], ['on-low-hp', null, 0.6, '濒危时'],
    ['card-played', null, 10, '每次打出牌时'], ['card-played', 'attack', 5, '每次打出攻击牌时'], ['card-played', 'skill', 4, '每次打出技能牌时'],
    ['discard', null, 1.5, '每次弃牌时'], ['exhaust', null, 1, '每次消耗牌时'], ['kill', null, 1, '每次击杀敌人时'],
    ['shuffle', null, 1, '每次洗牌时'], ['hp-loss', null, 3, '每次失去生命时'], ['block-gain', null, 4, '每次获得格挡时'],
].map(([trigger, cardType, rate, text]) => Object.freeze({ id: cardType ? `${trigger}:${cardType}` : trigger, trigger, cardType, rate, text })));


// 被动效果字段：数量按预算求解，不超过 max。进攻效果打随机敌人或全体敌人（多数时机没有主目标）。
const field = (key, max, build, label) => Object.freeze({ key, max, build, label });
const st = (status, target) => (n) => ({ op: 'status', status, stacks: n, target });
export const TRAIT_FIELDS = Object.freeze([
    field('block', 30, (n) => ({ op: 'block', amount: n, target: 'self' }), (n) => `获得 ${n} 点格挡`),
    field('heal', 30, (n) => ({ op: 'heal', amount: n, target: 'self' }), (n) => `回复 ${n} 点生命`),
    field('damage', 18, (n) => ({ op: 'damage', amount: n, hits: 1, target: 'random-enemy' }), (n) => `对随机敌人造成 ${n} 点伤害`),
    field('sweep', 12, (n) => ({ op: 'damage', amount: n, hits: 1, target: 'all-enemies' }), (n) => `对全体敌人造成 ${n} 点伤害`),
    field('draw', 2, (n) => ({ op: 'draw', amount: n }), (n) => `抽 ${n} 张牌`),
    field('energy', 1, (n) => ({ op: 'energy', amount: n }), (n) => `获得 ${n} 点能量`),
    field('strength', 3, st('strength', 'self'), (n) => `获得 ${n} 层攻击力`),
    field('dexterity', 3, st('dexterity', 'self'), (n) => `获得 ${n} 层防御力`),
    field('thorns', 6, st('thorns', 'self'), (n) => `获得 ${n} 层荆棘`),
    field('regen', 6, st('regen', 'self'), (n) => `获得 ${n} 层再生`),
    field('poison', 8, st('poison', 'random-enemy'), (n) => `使随机敌人中毒 ${n} 层`),
    field('weak', 3, st('weak', 'random-enemy'), (n) => `使随机敌人虚弱 ${n} 层`),
    field('vulnerable', 3, st('vulnerable', 'random-enemy'), (n) => `使随机敌人易伤 ${n} 层`),
]);
// 会自我循环的时机 × 字段：获得格挡时获得格挡、洗牌时抽牌。
const LOOPS = Object.freeze({ 'block-gain': ['block'], shuffle: ['draw'] });
// 条件字段（只用被动时机下有意义的）：条件、说明、可用时机（null 为除濒危外全部）。
export const TRAIT_CONDITIONS = Object.freeze([
    [{ kind: 'self-hp-below', value: 50 }, '若生命低于一半', null],
    [{ kind: 'cards-played-gte', value: 3 }, '若本回合已出 3 张牌', ['card-played', 'turn-end']],
    [{ kind: 'attacks-played-gte', value: 2 }, '若本回合已出 2 张攻击牌', ['card-played', 'turn-end']],
    [{ kind: 'discarded-gte', value: 1 }, '若本回合弃过牌', ['card-played', 'turn-end']],
    [{ kind: 'self-has', value: 'weak' }, '若自身虚弱', ['turn-start', 'card-played', 'on-hit']],
].map(([when, text, triggers]) => Object.freeze({ when: Object.freeze(when), text, triggers })));
const conditionsFor = (trigger) => TRAIT_CONDITIONS.filter((c) => (c.triggers ? c.triggers.includes(trigger) : trigger !== 'on-low-hp'));


// 每场预期价值 = 单次估值 × 时机次数；目标 = PASSIVE_BUDGET × 稀有度系数。
const fieldValue = (f, n) => estimateEffectsValue([f.build(n)]);
const fieldCount = (rarity) => TRAIT_FIELD_COUNTS[rarity] || 1;
const targetOf = (rarity) => PASSIVE_BUDGET * rarityScale(rarity);
const fieldOf = (key) => TRAIT_FIELDS.find((f) => f.key === key);
const triggerOf = (id) => TRAIT_TRIGGERS.find((t) => t.id === id);

// 可用字段：取最小数值时每场价值也不超过该稀有度一个字段的份额上限；会自我循环的组合不可用。
function fieldsFor(t, rarity) {
    const cap = (targetOf(rarity) * OVER) / fieldCount(rarity);
    return TRAIT_FIELDS.filter((f) => !(LOOPS[t.trigger] || []).includes(f.key) && fieldValue(f, 1) * t.rate <= cap + EPS);
}

// 被动形状：份额平分到各字段，cond 存在时最后一个字段放进条件分支（数量按条件折算放大）；
// 每场价值落在目标的 [UNDER, OVER] 倍内、单次伤害不超过队友技能上限、不命中禁止组合时返回 { trigger, cardType?, effects, description }，否则 null。
function passiveShape(t, fields, cond, rarity) {
    const target = targetOf(rarity);
    const share = target / fields.length;
    const parts = fields.map((f, i) => {
        const inCond = Boolean(cond) && i === fields.length - 1;
        const unit = fieldValue(f, 1) * t.rate * (inCond ? CONDITION_SCALE : 1);
        const n = Math.max(1, Math.min(f.max, Math.round(share / unit)));
        const e = f.build(n);
        return inCond ? { effect: { op: 'conditional', when: { ...cond.when }, then: [e] }, text: `${cond.text}则${f.label(n)}` } : { effect: e, text: f.label(n) };
    });
    const effects = parts.map((p) => p.effect);
    const value = estimateEffectsValue(effects) * t.rate;
    if (value > target * OVER + EPS || value < target * UNDER - EPS) return null;
    if (effectsDamage(effects) > COMBAT_RULES.allySkillDamageCap) return null;
    const shape = { trigger: t.trigger, ...(t.cardType ? { cardType: t.cardType } : {}), effects };
    if (forbiddenCombos(shape, { withDeck: true }).length) return null;
    return { ...shape, description: `${t.text}${parts.map((p) => p.text).join('，')}` };
}

// 主动：模板在该费用 × 稀有度下的解，须过预算、禁止组合与队友技能伤害上限；不带升级版。
function activeSkill(key, cost, rarity) {
    const solved = solveCardTemplate(key, cost, rarity);
    if (!solved) return null;
    const { effects } = solved;
    if (!evaluateCardBudget({ cost, rarity, effects }).ok || forbiddenCombos({ cost, effects }).length) return null;
    if (effectsDamage(effects) > COMBAT_RULES.allySkillDamageCap) return null;
    return { cost, effects, description: CARD_TEMPLATES[key].label };
}


// 按种子的确定性随机流。
function stream(seed) {
    let state = hash32(seed);
    return () => {
        const r = nextRandom(state);
        state = r.state;
        return r.value;
    };
}
const pickOf = (list, rnd) => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];

// 某稀有度下的抽取池（缓存）：主动为 { kind:'active', key, costs }；被动为 { kind:'passive', trigger, field }（主字段，单字段时须成立）；华而不实为 { kind:'flair', key }。
const pools = new Map();
export function traitPool(rarity) {
    if (pools.has(rarity)) return pools.get(rarity);
    const out = [];
    for (const key of TRAIT_SKILL_TEMPLATE_KEYS) {
        const costs = TRAIT_SKILL_COSTS.filter((cost) => activeSkill(key, cost, rarity));
        if (costs.length) out.push(Object.freeze({ kind: 'active', key, costs: Object.freeze(costs) }));
    }
    for (const t of TRAIT_TRIGGERS) {
        for (const f of fieldsFor(t, rarity)) if (passiveShape(t, [f], null, rarity)) out.push(Object.freeze({ kind: 'passive', trigger: t.id, field: f.key }));
    }
    for (const key of Object.keys(FLAIR_PASSIVE_TEMPLATES)) out.push(Object.freeze({ kind: 'flair', key }));
    const frozen = Object.freeze(out);
    pools.set(rarity, frozen);
    return frozen;
}


// 按种子与稀有度抽一个特性形状（同一种子与稀有度结果相同）：
// { kind:'active', template, skill:{ cost, effects, description } } 或 { kind:'passive', template?, passive:{ trigger, cardType?, effects, description } }。
// 多字段组合不成立时按种子换一组（最多 8 次），都不成立时退回单字段（单字段已在入池时验证）。
export function planTraitShape(seed, rarity) {
    const rnd = stream(`trait-pool:${seed}|${rarity}`);
    const entry = pickOf(traitPool(rarity), rnd);
    if (entry.kind === 'active') {
        const cost = pickOf(entry.costs, rnd);
        return { kind: 'active', template: entry.key, skill: activeSkill(entry.key, cost, rarity) };
    }
    if (entry.kind === 'flair') {
        const p = passiveAtRarity(entry.key, rarity);
        return { kind: 'passive', template: entry.key, passive: { trigger: p.trigger, effects: p.effects, description: p.description } };
    }
    const t = triggerOf(entry.trigger);
    const primary = fieldOf(entry.field);
    const n = fieldCount(rarity);
    const others = fieldsFor(t, rarity).filter((f) => f.key !== primary.key);
    const conds = conditionsFor(t.trigger);
    for (let attempt = 0; attempt < 8 && n > 1 && others.length; attempt += 1) {
        const fields = [primary];
        const rest = [...others];
        while (fields.length < n && rest.length) fields.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
        const cond = conds.length && rnd() < CONDITION_CHANCE ? pickOf(conds, rnd) : null;
        const shape = passiveShape(t, fields, cond, rarity);
        if (shape) return { kind: 'passive', passive: shape };
    }
    return { kind: 'passive', passive: passiveShape(t, [primary], null, rarity) };
}
