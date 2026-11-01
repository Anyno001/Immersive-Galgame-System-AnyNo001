// 特性池：按稀有度列出可抽的特性形状（主动技能模板 / 被动 / 风味被动），并按种子规划具体内容。
// 池按稀有度缓存；被动的数值按预算（PASSIVE_BUDGET）反推，保证强度落在窗口内。
import { CARD_TEMPLATES, FLAIR_PASSIVE_TEMPLATES, TRAIT_SKILL_TEMPLATE_KEYS, passiveAtRarity, solveCardTemplate } from './card-templates.js';
import { COMBAT_RULES, estimateEffectsValue, evaluateCardBudget } from './rules.js';
import { hash32, nextRandom } from './random.js';
import { effectsDamage } from './schema.js';
import { TRAIT_SKILL_COSTS } from './traits.js';
import { forbiddenCombos } from './combos.js';

// 各稀有度的被动字段数（越稀有越多效果）。
export const TRAIT_FIELD_COUNTS = Object.freeze({ common: 1, uncommon: 1, rare: 2, epic: 2, mythic: 3 });
// 被动预算基准；上限容差、下限比例、浮点容差、带条件字段的折扣、加条件的概率。
export const PASSIVE_BUDGET = 10;
const BUDGET_OVER = 1.35;
const BUDGET_UNDER = 0.5;
const EPSILON = 1e-9;
const CONDITION_DISCOUNT = 0.6;
const CONDITION_CHANCE = 1 / 3;
// 随机种子失败时，多字段被动的最大重试次数。
const MULTI_FIELD_TRIES = 8;

// 稀有度相对普通的预算倍率。
const budgetScale = (rarity) => (COMBAT_RULES.rarityWindows[rarity]?.target || 1) / COMBAT_RULES.rarityWindows.common.target;

// 触发器表：[触发事件, 牌类型限定, 每场触发频率权重, 文案]。rate 越高，单次数值越低。
export const TRAIT_TRIGGERS = Object.freeze([
    ['battle-start', null, 1, '开战时'],
    ['turn-start', null, 4, '回合开始时'],
    ['turn-end', null, 4, '回合结束时'],
    ['on-hit', null, 3, '受到攻击后'],
    ['on-low-hp', null, 0.6, '濒危时'],
    ['card-played', null, 10, '每次打出牌时'],
    ['card-played', 'attack', 5, '每次打出攻击牌时'],
    ['card-played', 'skill', 4, '每次打出技能牌时'],
    ['discard', null, 1.5, '每次弃牌时'],
    ['exhaust', null, 1, '每次消耗牌时'],
    ['kill', null, 1, '每次击杀敌人时'],
    ['shuffle', null, 1, '每次洗牌时'],
    ['hp-loss', null, 3, '每次失去生命时'],
    ['block-gain', null, 4, '每次获得格挡时'],
].map(([trigger, cardType, rate, text]) => Object.freeze({ id: cardType ? `${trigger}:${cardType}` : trigger, trigger, cardType, rate, text })));

// 被动字段：key、数值上限、效果构造器、文案。
const field = (key, max, build, label) => Object.freeze({ key, max, build, label });
const statusField = (status, target) => (stacks) => ({ op: 'status', status, stacks, target });

export const TRAIT_FIELDS = Object.freeze([
    field('block', 30, (n) => ({ op: 'block', amount: n, target: 'self' }), (n) => `获得 ${n} 点格挡`),
    field('heal', 30, (n) => ({ op: 'heal', amount: n, target: 'self' }), (n) => `回复 ${n} 点生命`),
    field('damage', 18, (n) => ({ op: 'damage', amount: n, hits: 1, target: 'random-enemy' }), (n) => `对随机敌人造成 ${n} 点伤害`),
    field('sweep', 12, (n) => ({ op: 'damage', amount: n, hits: 1, target: 'all-enemies' }), (n) => `对全体敌人造成 ${n} 点伤害`),
    field('draw', 2, (n) => ({ op: 'draw', amount: n }), (n) => `抽 ${n} 张牌`),
    field('energy', 1, (n) => ({ op: 'energy', amount: n }), (n) => `获得 ${n} 点能量`),
    field('strength', 3, statusField('strength', 'self'), (n) => `获得 ${n} 层攻击力`),
    field('dexterity', 3, statusField('dexterity', 'self'), (n) => `获得 ${n} 层防御力`),
    field('thorns', 6, statusField('thorns', 'self'), (n) => `获得 ${n} 层荆棘`),
    field('regen', 6, statusField('regen', 'self'), (n) => `获得 ${n} 层再生`),
    field('poison', 8, statusField('poison', 'random-enemy'), (n) => `使随机敌人中毒 ${n} 层`),
    field('weak', 3, statusField('weak', 'random-enemy'), (n) => `使随机敌人虚弱 ${n} 层`),
    field('vulnerable', 3, statusField('vulnerable', 'random-enemy'), (n) => `使随机敌人易伤 ${n} 层`),
]);

// 与触发器相冲突的字段（会自我循环）。
const TRIGGER_EXCLUDED_FIELDS = Object.freeze({ 'block-gain': ['block'], shuffle: ['draw'] });

// 附加条件：when 是效果条件，text 是文案，triggers 限定可用的触发器（null 表示除 on-low-hp 外都行）。
export const TRAIT_CONDITIONS = Object.freeze([
    [{ kind: 'self-hp-below', value: 50 }, '若生命低于一半', null],
    [{ kind: 'cards-played-gte', value: 3 }, '若本回合已出 3 张牌', ['card-played', 'turn-end']],
    [{ kind: 'attacks-played-gte', value: 2 }, '若本回合已出 2 张攻击牌', ['card-played', 'turn-end']],
    [{ kind: 'discarded-gte', value: 1 }, '若本回合弃过牌', ['card-played', 'turn-end']],
    [{ kind: 'self-has', value: 'weak' }, '若自身虚弱', ['turn-start', 'card-played', 'on-hit']],
].map(([when, text, triggers]) => Object.freeze({ when: Object.freeze(when), text, triggers })));

// 某触发器可用的条件。
const conditionsFor = (trigger) => TRAIT_CONDITIONS.filter((cond) => (cond.triggers ? cond.triggers.includes(trigger) : trigger !== 'on-low-hp'));
// 字段在数值为 n 时的估值。
const fieldValue = (f, n) => estimateEffectsValue([f.build(n)]);
const fieldCount = (rarity) => TRAIT_FIELD_COUNTS[rarity] || 1;
const budgetOf = (rarity) => PASSIVE_BUDGET * budgetScale(rarity);
const findField = (key) => TRAIT_FIELDS.find((f) => f.key === key);
const findTrigger = (id) => TRAIT_TRIGGERS.find((t) => t.id === id);

// 某触发器在某稀有度下，数值 1 也不超预算的可用字段。
function usableFields(trigger, rarity) {
    const limit = (budgetOf(rarity) * BUDGET_OVER) / fieldCount(rarity);
    return TRAIT_FIELDS.filter((f) => !(TRIGGER_EXCLUDED_FIELDS[trigger.trigger] || []).includes(f.key) && fieldValue(f, 1) * trigger.rate <= limit + EPSILON);
}

// 用若干字段拼出一个被动：预算均分到各字段反推数值；末字段可挂条件（该字段估值打折）。
// 总估值越出 [下限, 上限] 窗口、伤害超过同伴上限或命中禁用联动，返回 null。
function buildPassive(trigger, fields, condition, rarity) {
    const budget = budgetOf(rarity);
    const share = budget / fields.length;
    const parts = fields.map((f, i) => {
        const conditional = !!condition && i === fields.length - 1;
        const perUnit = fieldValue(f, 1) * trigger.rate * (conditional ? CONDITION_DISCOUNT : 1);
        const amount = Math.max(1, Math.min(f.max, Math.round(share / perUnit)));
        const effect = f.build(amount);
        return conditional
            ? { effect: { op: 'conditional', when: { ...condition.when }, then: [effect] }, text: `${condition.text}则${f.label(amount)}` }
            : { effect, text: f.label(amount) };
    });
    const effects = parts.map((part) => part.effect);
    const value = estimateEffectsValue(effects) * trigger.rate;
    if (value > budget * BUDGET_OVER + EPSILON || value < budget * BUDGET_UNDER - EPSILON || effectsDamage(effects) > COMBAT_RULES.allySkillDamageCap) return null;
    const passive = { trigger: trigger.trigger, ...(trigger.cardType ? { cardType: trigger.cardType } : {}), effects };
    return forbiddenCombos(passive, { withDeck: true }).length ? null : { ...passive, description: `${trigger.text}${parts.map((part) => part.text).join('，')}` };
}

// 主动技能：模板在 (费用, 稀有度) 下能解出数值，且过预算、无禁用联动、伤害不超上限。
function buildActiveSkill(templateKey, cost, rarity) {
    const solved = solveCardTemplate(templateKey, cost, rarity);
    if (!solved) return null;
    const { effects } = solved;
    if (!evaluateCardBudget({ cost, rarity, effects }).ok || forbiddenCombos({ cost, effects }).length || effectsDamage(effects) > COMBAT_RULES.allySkillDamageCap) return null;
    return { cost, effects, description: CARD_TEMPLATES[templateKey].label };
}

function randomFrom(seed) {
    let state = hash32(seed);
    return () => {
        const next = nextRandom(state);
        state = next.state;
        return next.value;
    };
}

const pickFrom = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
const poolCache = new Map();

// 某稀有度的特性形状池（冻结，按稀有度缓存）：
// active：主动模板及其可用费用；passive：触发器 + 字段；flair：风味被动。
export function traitPool(rarity) {
    if (poolCache.has(rarity)) return poolCache.get(rarity);
    const shapes = [];
    for (const key of TRAIT_SKILL_TEMPLATE_KEYS) {
        const costs = TRAIT_SKILL_COSTS.filter((cost) => buildActiveSkill(key, cost, rarity));
        if (costs.length) shapes.push(Object.freeze({ kind: 'active', key, costs: Object.freeze(costs) }));
    }
    for (const trigger of TRAIT_TRIGGERS) {
        for (const f of usableFields(trigger, rarity)) {
            if (buildPassive(trigger, [f], null, rarity)) shapes.push(Object.freeze({ kind: 'passive', trigger: trigger.id, field: f.key }));
        }
    }
    for (const key of Object.keys(FLAIR_PASSIVE_TEMPLATES)) shapes.push(Object.freeze({ kind: 'flair', key }));
    const pool = Object.freeze(shapes);
    poolCache.set(rarity, pool);
    return pool;
}

// 按种子从池里抽一个形状并生成具体内容。
// 返回 { kind: 'active', template, skill } 或 { kind: 'passive', passive[, template] }。
export function planTraitShape(seed, rarity) {
    const random = randomFrom(`trait-pool:${seed}|${rarity}`);
    const shape = pickFrom(traitPool(rarity), random);
    if (shape.kind === 'active') {
        const cost = pickFrom(shape.costs, random);
        return { kind: 'active', template: shape.key, skill: buildActiveSkill(shape.key, cost, rarity) };
    }
    if (shape.kind === 'flair') {
        const flair = passiveAtRarity(shape.key, rarity);
        return { kind: 'passive', template: shape.key, passive: { trigger: flair.trigger, effects: flair.effects, description: flair.description } };
    }
    const trigger = findTrigger(shape.trigger);
    const mainField = findField(shape.field);
    const wanted = fieldCount(rarity);
    const extras = usableFields(trigger, rarity).filter((f) => f.key !== mainField.key);
    const conditions = conditionsFor(trigger.trigger);
    // 稀有度要求多字段时，随机再拼若干字段，必要时挂条件；多次失败退回单字段。
    for (let attempt = 0; attempt < MULTI_FIELD_TRIES && wanted > 1 && extras.length; attempt += 1) {
        const fields = [mainField];
        const remaining = [...extras];
        while (fields.length < wanted && remaining.length) fields.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
        const condition = conditions.length && random() < CONDITION_CHANCE ? pickFrom(conditions, random) : null;
        const passive = buildPassive(trigger, fields, condition, rarity);
        if (passive) return { kind: 'passive', passive };
    }
    return { kind: 'passive', passive: buildPassive(trigger, [mainField], null, rarity) };
}
