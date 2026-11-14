// 战斗实体生成的装配层：把后台模型返回的「名字 + 模板名 + 费用」之类的简化 JSON，
// 按模板表解算成完整的职业、卡牌、技能、被动、敌人、装备、物品、特质与奖励。
// 每个 assemble* 函数返回 { profile/value, diagnostics } 或 { errors }，
// 错误与数值夹取记录都带路径，供上层写诊断或要求模型重写。
import { BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES, combatSpeedFor, signatureSlotOf } from './rules.js';
import {
    ARCHETYPE_FAMILIES, CARD_TEMPLATES, GEAR_PASSIVE_TEMPLATES, ITEM_TEMPLATES, PASSIVE_TEMPLATES, SKILL_TEMPLATES, cardFromValues, gearPassiveFromTemplate,
    heroSkillFromTemplate, itemAtRarity, itemFromTemplate, fixedTemplateCost, nearestTemplateCost, passiveAtRarity, passiveFromTemplate,
    skillFromTemplate, solveCardTemplate, templateAllowedFor, templateFamily, templatesFor,
} from './card-templates.js';
import { forbiddenCombos } from './combos.js';
import { GEAR_BONUS_BY_RARITY, GEAR_SLOTS, REWARD_ORIGIN_MAX, effectsDamage, gearIdFor, itemIdFor, profileIdFor } from './schema.js';
import { ABILITY_KEYS, abilityKeyOf } from './abilities.js';
import { gearHasPassive, templateCandidates } from './acquire-candidates.js';
import { hash32, hashString, nextRandom } from './random.js';
import { isEnemyArtKey } from './enemy-art.js';
import { INSCRIPTION_LABELS } from './mechanics/inscription.js';
import { fixedCard, fixedClassPool } from './fixed-cards/index.js';
import { resolveRelic } from './relics/draw.js';
import { planRewardMarks } from './reward-cards.js';
import { CLASS_PASSIVE_VERSION, fixedClassPassive } from './class-passives.js';

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const indexPath = (path, index) => `${path}[${index}]`;

// 收集器：累计错误（errors）与诊断（diagnostics）。
// fail 记录错误并返回 undefined，note 记录数值被夹取，hint 记录其他提示。
function createCollector(key) {
    const errors = [];
    const diagnostics = [];
    return {
        errors,
        diagnostics,
        fail(path, reason, detail) {
            errors.push(detail === undefined ? { path, reason } : { path, reason, detail });
        },
        note(path, from, to) {
            diagnostics.push({ code: 'combat-value-clamped', key, path, from, to });
        },
        hint(code, path, from, to) {
            diagnostics.push({ code, key, path, from, to });
        },
    };
}

// 有错误则只返回 errors，否则返回结果与诊断
const finish = (collector, profile) => (collector.errors.length ? { errors: collector.errors } : { profile, diagnostics: collector.diagnostics });

// 必填文本：去空白，超长截断并记录
function requiredText(value, path, collector, maxLength) {
    if (typeof value !== 'string' || !value.trim()) return collector.fail(path, 'required-text');
    const text = value.trim();
    if (text.length <= maxLength) return text;
    collector.note(path, text.length, maxLength);
    return text.slice(0, maxLength);
}

// 整数：空值且给了默认值则取默认；字符串先转数字；四舍五入并夹到 [min, max]
function clampedInt(value, path, collector, min, max, fallback) {
    if ((value === null || value === undefined || value === '') && fallback !== undefined) return fallback;
    const number = typeof value === 'string' ? Number(value.trim()) : value;
    if (typeof number !== 'number' || !Number.isFinite(number)) return collector.fail(path, 'expected-number', { min, max });
    const clamped = Math.min(max, Math.max(min, Math.round(number)));
    if (clamped !== number) collector.note(path, number, clamped);
    return clamped;
}

// 把数组或对象按字段名顺序取成数组（数组按下标，对象按键名）
function fieldsOf(value, path, collector, keys) {
    if (Array.isArray(value)) return keys.map((_, index) => value[index]);
    if (isPlainObject(value)) return keys.map((key) => value[key]);
    return collector.fail(path, 'expected-array');
}

// 列表映射：数量不足报 too-few，超出上限截断并记录；min 为 0 时允许缺省
function mapList(value, path, collector, min, max, mapper) {
    if ((value === null || value === undefined) && min === 0) return [];
    if (!Array.isArray(value)) return collector.fail(path, 'expected-array');
    if (value.length < min) return collector.fail(path, 'too-few', { min, size: value.length });
    if (value.length > max) collector.note(path, value.length, max);
    return value.slice(0, max).map((item, index) => mapper(item, indexPath(path, index), index));
}

// 别名清洗：只留字符串，每个最长 20 字，去重去空，最多 5 个
const cleanAliases = (value) => (Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 20)).filter(Boolean))].slice(0, 5)
    : []);

// 费用最大值（0 到 3，X 费另算）
const MAX_CARD_COST = 3;

// 各类卡牌的固定费用槽位（每张卡的费用由槽位决定，模型填的费用只做提示）
export const CARD_COST_SLOTS = Object.freeze({
    personal: Object.freeze([1, 1, 2, 2]),
    signature: Object.freeze([2, 3]),
    tier: Object.freeze([1, 2, 3]),
});

const isBlank = (value) => value === null || value === undefined || value === '';

// 需要按种子随机分布费用的槽位形状：size 张卡，counts 是每个费用（0..3）的 [最少, 最多] 张数
const SLOT_SHAPES = Object.freeze({
    personal: Object.freeze({ size: 4, counts: Object.freeze([[0, 0], [1, 2], [1, 2], [0, 1]]) }),
});

// 枚举所有「每个费用的张数在范围内、总和等于 total」的组合
function enumerateCounts(ranges, total, index = 0, picked = []) {
    if (index === ranges.length) return picked.reduce((sum, count) => sum + count, 0) === total ? [picked] : [];
    const result = [];
    for (let count = ranges[index][0]; count <= ranges[index][1]; count += 1) {
        result.push(...enumerateCounts(ranges, total, index + 1, [...picked, count]));
    }
    return result;
}

// 按种子取一种费用分布，展开为逐张卡的费用列表；没有形状定义的类别取固定槽位
export function costSlotsFor(kind, seed = '') {
    const shape = SLOT_SHAPES[kind];
    if (!shape) return [...(CARD_COST_SLOTS[kind] || [])];
    const combos = enumerateCounts(shape.counts, shape.size);
    return combos[hash32(`slots:${kind}:${seed}`) % combos.length].flatMap((count, cost) => Array(count).fill(cost));
}

// 外部传入的费用槽位合法才用，否则回落
const validSlots = (slots, fallback) => (Array.isArray(slots) && slots.length && slots.every((cost) => Number.isInteger(cost) && cost >= 0 && cost <= MAX_CARD_COST) ? slots : fallback);

// 模板名必须在表里
function pickTemplate(value, path, collector, table) {
    const name = typeof value === 'string' ? value.trim() : value;
    return typeof name === 'string' && Object.hasOwn(table, name) ? name : collector.fail(path, 'invalid-template', { allowed: Object.keys(table) });
}

// 把模板表限制到指定名单；名单为空或全不在表里时不限制
function restrictTable(table, names) {
    if (!Array.isArray(names) || !names.length) return table;
    const kept = names.filter((name) => typeof name === 'string' && Object.hasOwn(table, name));
    return kept.length ? Object.fromEntries(kept.map((name) => [name, table[name]])) : table;
}

// 规则 v5 职业白名单：已知职业取其允许的卡牌模板子表；职业非法时不收窄（职业字段另行报错）。
const knownArchetype = (archetype) => typeof archetype === 'string' && Object.hasOwn(ARCHETYPE_FAMILIES, archetype);
const archetypeTable = (archetype) => (knownArchetype(archetype) ? templatesFor(archetype) : CARD_TEMPLATES);
// 人物技能候选：职业允许且可作人物技能的模板，越界统一报 invalid-template。
const HERO_TABLES = new Map();
function heroTableFor(archetype) {
    const key = knownArchetype(archetype) ? archetype : '*';
    if (!HERO_TABLES.has(key)) {
        HERO_TABLES.set(key, Object.freeze(Object.fromEntries(Object.entries(archetypeTable(archetype)).filter(([name]) => heroSkillFromTemplate(name, {})))));
    }
    return HERO_TABLES.get(key);
}

// 个人卡池最多 limit 张其他职业族的卡（D3）；超出的从第 limit+1 张起报 invalid-template。
function checkCrossFamily(cards, path, collector, archetype, limit = 1) {
    if (!knownArchetype(archetype) || !Array.isArray(cards)) return;
    let crossed = 0;
    cards.forEach((item, index) => {
        const raw = Array.isArray(item) ? item[1] : item?.template;
        const key = typeof raw === 'string' ? raw.trim() : raw;
        if (typeof key !== 'string' || !Object.hasOwn(CARD_TEMPLATES, key) || templateAllowedFor(key, archetype)) return;
        crossed += 1;
        if (crossed > limit) collector.fail(indexPath(indexPath(path, index), 1), 'invalid-template', { allowed: Object.keys(templatesFor(archetype)), crossLimit: limit });
    });
}

function cardArchetype(template, archetype) {
    const family = templateFamily(template);
    const owners = Object.keys(ARCHETYPE_FAMILIES).filter(key => ARCHETYPE_FAMILIES[key].includes(family));
    if (owners.length === 1) return owners[0];
    return knownArchetype(archetype) ? archetype : 'general';
}

// 组装一张卡：名字 + 模板 + 费用 -> 完整卡牌。
// paths 依次是 [名字路径, 模板路径, 费用路径]；options.slot 给定时费用以槽位为准；
// options.values 给定时按模型给出的数值反解，否则由模板按稀有度解算默认数值。
function buildCard(nameValue, templateValue, costValue, paths, collector, options) {
    const { id, rarity, slot, fixedCost = false, table = CARD_TEMPLATES, values, valuesPath = 'values' } = options;
    const name = requiredText(nameValue, paths[0], collector, 20);
    const template = pickTemplate(templateValue, paths[1], collector, table);
    let cost;
    if (slot !== undefined) {
        cost = slot;
        if (!isBlank(costValue) && Number(costValue) !== slot) collector.hint('combat-cost-slotted', paths[2], costValue, slot);
    } else {
        cost = clampedInt(costValue, paths[2], collector, 0, MAX_CARD_COST, 1);
    }
    if (!name || !template || cost === undefined) return;
    // 固定费用模板必须用其固定费用，否则取最接近的可解费用
    const solvedCost = fixedCost ? fixedTemplateCost(template, cost) : nearestTemplateCost(template, cost, rarity);
    if (solvedCost === null) return collector.fail(paths[1], 'template-unsolvable');
    if (solvedCost !== cost) collector.note(paths[2], cost, solvedCost);
    let card;
    if (values === undefined) {
        card = solveCardTemplate(template, solvedCost, rarity);
        if (!card) return collector.fail(paths[1], 'template-unsolvable', { cost: solvedCost, rarity });
    } else {
        const fromValues = cardFromValues(template, solvedCost, rarity, values);
        if (fromValues.error) return collector.fail(valuesPath, fromValues.error, fromValues.detail);
        card = fromValues.card;
    }
    // 禁用的效果组合直接拒绝
    const combos = forbiddenCombos({ cost: solvedCost, effects: card.effects, onDiscard: card.onDiscard });
    if (combos.length) return collector.fail(paths[1], 'forbidden-combo', { combos });
    const { type, effects, upgraded, ...rest } = card;
    return { id, name, type, cost: solvedCost, rarity, ...rest, archetype: cardArchetype(template, options.archetype), effects, ...(upgraded ? { upgraded } : {}) };
}

// 卡牌三元组 [名字, 模板, 费用]（数组或对象）-> 卡
function cardFromTriple(value, path, collector, options) {
    const fields = fieldsOf(value, path, collector, ['name', 'template', 'cost']);
    return fields ? buildCard(fields[0], fields[1], fields[2], [indexPath(path, 0), indexPath(path, 1), indexPath(path, 2)], collector, options) : undefined;
}

// 被动：可以只给模板名字符串（名字取模板标签），或 [名字, 模板]
function buildPassive(value, path, collector, id) {
    const isTemplateOnly = typeof value === 'string';
    const fields = isTemplateOnly ? [undefined, value] : fieldsOf(value, path, collector, ['name', 'template']);
    if (!fields) return;
    const template = pickTemplate(fields[1], isTemplateOnly ? path : indexPath(path, 1), collector, PASSIVE_TEMPLATES);
    if (!template) return;
    const name = fields[0] === undefined || fields[0] === null || fields[0] === ''
        ? PASSIVE_TEMPLATES[template].label.slice(0, 20)
        : requiredText(fields[0], indexPath(path, 0), collector, 20);
    return name ? { id, name, ...passiveFromTemplate(template) } : undefined;
}

// 技能：名字 + 模板 + 伤害上限 -> 技能
function buildSkill(nameValue, templateValue, paths, collector, id, damageCap, table = SKILL_TEMPLATES) {
    const name = requiredText(nameValue, paths[0], collector, 20);
    const template = pickTemplate(templateValue, paths[1], collector, table);
    return name && template ? { id, name, ...skillFromTemplate(template, damageCap) } : undefined;
}

// 技能二元组 [名字, 模板]
function skillFromPair(value, path, collector, id, damageCap, table) {
    const fields = fieldsOf(value, path, collector, ['name', 'template']);
    return fields ? buildSkill(fields[0], fields[1], [indexPath(path, 0), indexPath(path, 1)], collector, id, damageCap, table) : undefined;
}

const expectObject = (raw) => (isPlainObject(raw) ? null : { errors: [{ path: '', reason: 'expected-object' }] });
// 被动字段兼容单数 passive 与复数 passives
const passivesField = (raw) => raw.passives ?? (raw.passive !== undefined && raw.passive !== null ? [raw.passive] : undefined);
// 生命值：缺省取区间中点
const hpValue = (value, path, collector, [min, max]) => clampedInt(value, path, collector, min, max, Math.round((min + max) / 2));

// 一组卡：rarity 可为数组（逐张稀有度）；slots 给定时按槽位循环取费用；序号从 1 起
const cardList = (value, path, collector, min, max, owner, tag, rarity, slots, fixedCost = false, table, archetype) => mapList(value, path, collector, min, max, (item, itemPath, index) => cardFromTriple(item, itemPath, collector, {
    id: `${owner}-${tag}${index + 1}`, archetype,
    rarity: Array.isArray(rarity) ? rarity[index] : rarity,
    fixedCost,
    ...(table ? { table } : {}),
    ...(slots ? { slot: slots[index % slots.length] } : {}),
}));
const skillList = (value, path, collector, min, max, owner, damageCap) => mapList(value, path, collector, min, max, (item, itemPath, index) => skillFromPair(item, itemPath, collector, `${owner}-s${index + 1}`, damageCap));
const passiveList = (value, path, collector, min, max, owner) => mapList(value, path, collector, min, max, (item, itemPath, index) => buildPassive(item, itemPath, collector, `${owner}-p${index + 1}`));
// 必填的单个被动
const requiredPassive = (value, path, collector, id) => (isBlank(value) ? collector.fail(path, 'required') : buildPassive(value, path, collector, id));

// 英雄技能：[名字, 卡牌模板]，借卡牌模板解算
function buildHeroSkill(value, path, collector, id, table = heroTableFor(null)) {
    if (isBlank(value)) return collector.fail(path, 'required');
    const fields = fieldsOf(value, path, collector, ['name', 'template']);
    if (!fields) return;
    const name = requiredText(fields[0], indexPath(path, 0), collector, 20);
    const template = pickTemplate(fields[1], indexPath(path, 1), collector, table);
    if (!name || !template) return;
    return heroSkillFromTemplate(template, { id, name }) || collector.fail(indexPath(path, 1), 'template-unsolvable');
}

// 起始牌组各费用的抽取权重（X 费与未知费用按 1）
const STARTER_COST_WEIGHT = Object.freeze({ 0: 2, 1: 3, 2: 2, 3: 1, X: 1 });
// 规则 v6 起始卡组的稀有度权重：只取普通、罕见，约 3:1。
const STARTER_RARITY_WEIGHT = Object.freeze({ common: 3, uncommon: 1 });

// 按权重不放回地选出 count 种不同的牌；rng 为 { state }，抽取后推进。
function pickDistinct(rng, cards, count, weightOf) {
    const left = [...cards];
    const out = [];
    while (out.length < count && left.length) {
        const weights = left.map(weightOf);
        const step = nextRandom(rng.state);
        rng.state = step.state;
        let roll = step.value * weights.reduce((sum, weight) => sum + weight, 0);
        let picked = 0;
        while (picked < left.length - 1 && roll >= weights[picked]) {
            roll -= weights[picked];
            picked += 1;
        }
        out.push(left.splice(picked, 1)[0]);
    }
    return out;
}

function starterDirectValue(card, op) {
    if (!Number.isInteger(card.cost) || card.cost > 2 || card.radiance != null || card.ethereal) return 0;
    if (card.effects.some((effect) => ['exhaust-self', 'exhaust-other', 'end-turn', 'requires', 'transmute', 'morph-hand', 'discard-hand'].includes(effect.op)
        || (['status', 'apply-status'].includes(effect.op) && effect.status === 'no-draw')
        || (effect.op === 'create' && /^(status-|curse-)/.test(effect.card)))) return 0;
    const amount = card.effects.reduce((sum, effect) => {
        if (effect.op !== op) return sum;
        const targets = op === 'damage' ? ['enemy', 'all-enemies', 'random-enemy'] : ['self', 'all-allies'];
        if (!targets.includes(effect.target || (op === 'damage' ? 'enemy' : 'self'))) return sum;
        return sum + effect.amount * (op === 'damage' ? effect.hits || 1 : 1);
    }, 0);
    const loss = card.effects.filter((effect) => effect.op === 'self-damage').reduce((sum, effect) => sum + effect.amount, 0);
    return Math.max(0, amount - loss) / Math.max(1, card.cost);
}

const channels = (card, orb) => card.effects.some((effect) => effect.op === 'channel' && effect.orb === orb);
const grantsStatus = (card, status) => card.effects.some((effect) => ['status', 'apply-status'].includes(effect.op) && effect.status === status);
const STARTER_ENGINES = Object.freeze({
    mage: { attack: (card) => channels(card, 'lightning'), skill: (card) => channels(card, 'frost') },
    priest: {
        attack: (card) => Number.isInteger(card.radiance) && card.radiance <= 2
            && card.effects.some((effect) => effect.op === 'damage' && effect.amount * (effect.hits || 1) >= 6),
        skill: (card) => card.effects.some((effect) => effect.op === 'radiance')
            && card.effects.some((effect) => effect.op === 'block'),
        third: (card) => card.type === 'power' && grantsStatus(card, 'halo-strike'),
    },
    guardian: { third: (card) => card.type === 'power' && (grantsStatus(card, 'dexterity') || grantsStatus(card, 'plated')) },
});

// 高副本槽以打击 6 / 防御 5 的净收益为参照；池不足时取实际前列，至少保留一个低费核心。
function pickStarterTypes(rng, cards, count, op, weightOf, engine) {
    const ranked = cards.map((card) => ({ card, value: starterDirectValue(card, op) }))
        .filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
    const coreCount = Math.min(2, count, ranked.length);
    const benchmark = op === 'damage' ? 6 : 5;
    const threshold = Math.min(benchmark, ranked[coreCount - 1]?.value ?? 0);
    const cheap = ranked.filter((item) => item.card.cost <= 1);
    const cheapThreshold = Math.min(benchmark, cheap[0]?.value ?? 0);
    const core = pickDistinct(rng, cheap.filter((item) => item.value >= cheapThreshold).map((item) => item.card), Math.min(1, coreCount), weightOf);
    const first = new Set(core.map((card) => card.id));
    if (engine && core.length < coreCount) {
        core.push(...pickDistinct(rng, cards.filter((card) => !first.has(card.id) && Number.isInteger(card.cost) && card.cost <= 2
            && !card.ethereal && !card.effects.some((effect) => ['exhaust-self', 'exhaust-other'].includes(effect.op)) && engine(card)), 1, weightOf));
    }
    const reserved = new Set(core.map((card) => card.id));
    core.push(...pickDistinct(rng, ranked.filter((item) => item.value >= threshold && !reserved.has(item.card.id))
        .map((item) => item.card), coreCount - core.length, weightOf));
    const taken = new Set(core.map((card) => card.id));
    return [...core, ...pickDistinct(rng, cards.filter((card) => !taken.has(card.id)), count - core.length, weightOf)];
}

// 规则 v6 起始卡组：从本职业固定池（普通、罕见、可打出）先选种类、再按 starterDeckShapeV6 定份数，不放基础打击 / 防御。
// 攻击、技能各选 3 种，第三种从能力牌与剩下的攻击 / 技能里选，个人牌选 1 种；固定池凑不齐形状时返回 null。
function buildFixedStarterDeck(fixedPool, personalPool, seed, archetype) {
    const shape = COMBAT_RULES.starterDeckShapeV6;
    const rng = { state: hash32(`starter-v6:${seed}`) };
    const costWeight = (card) => STARTER_COST_WEIGHT[card.cost] ?? 1;
    const fixedWeight = (card) => costWeight(card) * STARTER_RARITY_WEIGHT[card.rarity];
    const usable = (Array.isArray(fixedPool) ? fixedPool : []).filter((card) => Object.hasOwn(STARTER_RARITY_WEIGHT, card.rarity) && !card.unplayable
        && !card.effects.some((effect) => effect.op === 'exhaust-other'
            || (effect.op === 'grant-flag' && effect.flag === 'ethereal')));
    const engine = STARTER_ENGINES[archetype];
    const attacks = pickStarterTypes(rng, usable.filter((card) => card.type === 'attack'), shape.attack.length, 'damage', fixedWeight, engine?.attack);
    const skills = pickStarterTypes(rng, usable.filter((card) => card.type === 'skill'), shape.skill.length, 'block', fixedWeight, engine?.skill);
    const taken = new Set([...attacks, ...skills].map((card) => card.id));
    const remaining = usable.filter((card) => !taken.has(card.id));
    const support = engine?.third ? remaining.filter(engine.third) : [];
    const third = pickDistinct(rng, support.length ? support : remaining, shape.third.length, fixedWeight);
    const personal = pickDistinct(rng, Array.isArray(personalPool) ? personalPool : [], shape.personal.length, costWeight);
    const groups = [[attacks, shape.attack], [skills, shape.skill], [third, shape.third], [personal, shape.personal]];
    if (groups.some(([cards, copies]) => cards.length < copies.length)) return null;
    return groups.flatMap(([cards, copies]) => cards.flatMap((card, index) => Array(copies[index]).fill(card.id)));
}

// 起始牌组。传入职业原型且本职业有固定池时按规则 v6 生成（见 buildFixedStarterDeck）；
// 否则为 v3–v5 形状：基础攻击 + 基础防御 + 职业牌 + 个人牌。
// 抽取用确定性随机；同一张已抽得越多权重越低，且不超过 perCardLimit。
export function buildStarterDeck(classPool, personalPool, seed = '', archetype) {
    if (archetype !== undefined) {
        const fixedDeck = buildFixedStarterDeck(fixedClassPool(archetype), personalPool, seed, archetype);
        if (fixedDeck) return fixedDeck;
    }
    const shape = COMBAT_RULES.starterDeckShape;
    let state = hash32(`starter:${seed}`);
    const draw = (pool, count, perCardLimit) => {
        const cards = Array.isArray(pool) ? pool : [];
        const drawn = new Map();
        while ([...drawn.values()].reduce((sum, n) => sum + n, 0) < count) {
            const candidates = cards.filter((card) => (drawn.get(card.id) || 0) < perCardLimit);
            if (!candidates.length) break;
            const weights = candidates.map((card) => (STARTER_COST_WEIGHT[card.cost] ?? 1) / (1 + 1.5 * (drawn.get(card.id) || 0)));
            const step = nextRandom(state);
            state = step.state;
            let roll = step.value * weights.reduce((sum, weight) => sum + weight, 0);
            let picked = 0;
            while (picked < candidates.length - 1 && roll >= weights[picked]) {
                roll -= weights[picked];
                picked += 1;
            }
            drawn.set(candidates[picked].id, (drawn.get(candidates[picked].id) || 0) + 1);
        }
        return cards.flatMap((card) => Array(drawn.get(card.id) || 0).fill(card.id));
    };
    return [
        ...Array(shape.basicAttack).fill(BASIC_STRIKE_ID),
        ...Array(shape.basicDefend).fill(BASIC_DEFEND_ID),
        ...draw((classPool || []).filter((card) => card.rarity === 'common' || card.rarity === 'uncommon'), shape.classCards, COMBAT_RULES.copyLimit),
        ...draw(personalPool, shape.personalCards, 2),
    ];
}

// 职业：职业名、原型与固定职业被动。
export function assembleClass(raw, { key, fixed = {} } = {}) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const className = fixed.className ?? requiredText(raw.className, 'className', collector, 12);
    const archetype = Object.hasOwn(COMBAT_RULES.archetypes, raw.archetype)
        ? raw.archetype
        : collector.fail('archetype', 'invalid-enum', { allowed: Object.keys(COMBAT_RULES.archetypes) });
    if (!className) return finish(collector, null);
    const id = profileIdFor('class', className);
    const classPassive = fixedClassPassive(archetype, 1, `${id}-p1`);
    return finish(collector, { kind: 'class', id, className, archetype, classPassive, classPassiveVersion: CLASS_PASSIVE_VERSION, classPool: [] });
}

// 职业进阶档：档名 + 3 张卡（id 可由 fixed.cardIds 指定）
export function assembleClassTier(raw, { key, fixed = {}, input = {} } = {}) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const tierName = requiredText(raw.tierName, 'tierName', collector, 12);
    const cardIds = Array.isArray(fixed.cardIds) ? fixed.cardIds : [];
    const slots = validSlots(input?.costSlots, CARD_COST_SLOTS.tier);
    const cards = mapList(raw.cards, 'cards', collector, 3, 3, (item, itemPath, index) => cardFromTriple(item, itemPath, collector, { id: cardIds[index], rarity: input?.rarity, slot: slots[index % slots.length], table: archetypeTable(input?.archetype), archetype: input?.archetype }));
    return collector.errors.length ? { errors: collector.errors } : { value: { tierName, cards }, diagnostics: collector.diagnostics };
}

// 牌组角色：生命、速度、个人被动、个人牌池、英雄技能、专属卡与起始牌组
export function assembleDeck(raw, { key, fixed, cls, input = {} }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const hpRange = COMBAT_RULES.archetypes[cls.archetype]?.hp || [40, 120];
    const id = fixed.id;
    const profile = {
        kind: 'deck-character',
        id,
        name: fixed.name,
        aliases: cleanAliases(raw.aliases),
        classRef: cls.id,
        base: { hp: hpValue(raw.hp, 'hp', collector, hpRange), speed: combatSpeedFor({ archetype: cls.archetype, id }) },
        growth: { hpPerLevel: clampedInt(raw.hpPerLevel, 'hpPerLevel', collector, 1, 8, 4) },
        personalPassive: requiredPassive(raw.passive, 'passive', collector, `${id}-p1`),
        personalPool: cardList(raw.cards, 'cards', collector, 4, 8, id, 'm', 'personal', validSlots(input?.costSlots, CARD_COST_SLOTS.personal), false, undefined, cls.archetype),
        heroSkill: buildHeroSkill(raw.skill, 'skill', collector, `${id}-h1`, heroTableFor(cls.archetype)),
    };
    checkCrossFamily(raw.cards, 'cards', collector, cls.archetype);
    const signature = cardList(raw.signature, 'signature', collector, 0, COMBAT_RULES.signatureLimit, id, 'g', 'signature', CARD_COST_SLOTS.signature, false, undefined, cls.archetype);
    if (Array.isArray(signature) && signature.length) profile.signatureCards = signature;
    if (!collector.errors.length) profile.starterDeck = buildStarterDeck(cls.classPool, profile.personalPool, id, cls.archetype);
    return finish(collector, profile);
}

// 专属卡到期生成（signature-card，v0.39.2）：{ cards:[[名, 卡牌模板键], …] }，与 input.slots 逐位对应；
// ID 为「档案ID-g<槽位>」，费用按 input.costSlots 固定，稀有度 signature；名称不得与档案已有的专属卡重复。
// 结果是追加了这几张卡（按槽位排序）的同 ID 档案，由调用方写成新版本。
export function assembleSignature(raw, { key, fixed, input = {} }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const profile = fixed.profile;
    const slots = Array.isArray(input.slots) ? input.slots : [];
    const costs = validSlots(input.costSlots, slots.map((slot) => CARD_COST_SLOTS.signature[slot - 1] ?? CARD_COST_SLOTS.signature[0]));
    const cards = mapList(raw.cards, 'cards', collector, slots.length, slots.length, (item, itemPath, index) => cardFromTriple(item, itemPath, collector, {
        id: `${profile.id}-g${slots[index]}`, rarity: 'signature', slot: costs[index % costs.length], archetype: input.archetype,
    }));
    const seen = new Set((profile.signatureCards || []).map((card) => card.name));
    (Array.isArray(cards) ? cards : []).forEach((card, index) => {
        if (!card) return;
        if (seen.has(card.name)) collector.fail(indexPath(indexPath('cards', index), 0), 'name-duplicate');
        seen.add(card.name);
    });
    if (collector.errors.length) return { errors: collector.errors };
    const fresh = new Set(cards.map((card) => card.id));
    const merged = [...(profile.signatureCards || []).filter((card) => !fresh.has(card.id)), ...cards];
    const ordered = merged.map((card, index) => [signatureSlotOf(card, index), card]).sort((a, b) => a[0] - b[0]).map(([, card]) => card);
    return finish(collector, { ...profile, signatureCards: ordered });
}

// 技能型角色（不用卡牌）：3~5 个技能、1~2 个被动，可带档位 tier
export function assembleSkillCharacter(raw, { key, fixed }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const id = fixed.id;
    const className = typeof raw.className === 'string' && raw.className.trim() ? requiredText(raw.className, 'className', collector, 12) : '';
    const tier = isBlank(raw.tier)
        ? undefined
        : Object.hasOwn(COMBAT_RULES.allyTiers, raw.tier) ? raw.tier : collector.fail('tier', 'invalid-enum', { allowed: Object.keys(COMBAT_RULES.allyTiers) });
    return finish(collector, {
        kind: 'skill-character',
        id,
        name: fixed.name,
        aliases: cleanAliases(raw.aliases),
        className,
        base: { hp: hpValue(raw.hp, 'hp', collector, [20, 120]), speed: combatSpeedFor({ id }) },
        skills: skillList(raw.skills, 'skills', collector, 3, 5, id, COMBAT_RULES.allySkillDamageCap),
        passives: passiveList(passivesField(raw), 'passives', collector, 1, 2, id),
        ...(tier ? { tier } : {}),
    });
}

// 敌人：按档位（普通/精英/Boss）限制生命与伤害上限；Boss 附带半血狂怒阶段
export function assembleEnemy(raw, { key, fixed }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const tierName = COMBAT_RULES.tiers[fixed.tier] ? fixed.tier : 'normal';
    const tier = COMBAT_RULES.tiers[tierName];
    const id = fixed.id;
    // 画风键不认识就丢弃并留提示
    if (!isBlank(raw.art) && !isEnemyArtKey(raw.art)) collector.hint('combat-art-dropped', 'art', raw.art, null);
    const enemy = {
        kind: 'enemy',
        id,
        name: fixed.name,
        tier: tierName,
        ...(isEnemyArtKey(raw.art) ? { art: raw.art } : {}),
        base: { hp: clampedInt(raw.hp, 'hp', collector, Math.round(tier.hp * 0.5), Math.round(tier.hp * 1.5), tier.hp), speed: combatSpeedFor({ tier: tierName, id }) },
        skills: skillList(raw.skills, 'skills', collector, 2, 5, id, tier.damageCap),
        passives: passiveList(passivesField(raw), 'passives', collector, 0, 2, id),
        phases: [],
        generated: true,
    };
    if (tierName === 'boss') {
        const enrageId = `${id}-s9`;
        const enrage = raw.enrage !== undefined && raw.enrage !== null
            ? skillFromPair(raw.enrage, 'enrage', collector, enrageId, tier.damageCap)
            : { id: enrageId, name: '狂怒', ...skillFromTemplate('roar', tier.damageCap) };
        if (enrage) enemy.phases = [{ hpBelowPct: 50, addSkills: [enrage] }];
    }
    return finish(collector, enemy);
}

// 补技能：给已有角色再生成 input.count 个技能，名字不能与已有技能重名
export function assembleSkillFill(raw, { key, fixed, input }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const { profile } = fixed;
    const isEnemy = profile.kind === 'enemy';
    const damageCap = isEnemy ? COMBAT_RULES.tiers[profile.tier]?.damageCap ?? COMBAT_RULES.allySkillDamageCap : fixed.cap ?? COMBAT_RULES.allySkillDamageCap;
    const table = isEnemy ? SKILL_TEMPLATES : restrictTable(SKILL_TEMPLATES, input.templates);
    const existingCount = profile.skills.length;
    const added = mapList(raw.skills, 'skills', collector, input.count, input.count, (item, itemPath, index) => skillFromPair(item, itemPath, collector, `${profile.id}-k${existingCount + index + 1}`, damageCap, table)) || [];
    const usedNames = new Set([...profile.skills.map((skill) => skill.name), ...(Array.isArray(input.existing) ? input.existing : [])]);
    added.forEach((skill, index) => {
        if (!skill) return;
        if (usedNames.has(skill.name)) collector.fail(`${indexPath('skills', index)}[0]`, 'skill-name-exists');
        usedNames.add(skill.name);
    });
    return finish(collector, { ...profile, skills: [...profile.skills, ...added] });
}

// 成长奖励：input.output 为 card 或 skill；card 且给了稀有度时按稀有度与可选模板/数值生成
export function assembleGrowth(raw, { key, input }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const name = raw.name === undefined || raw.name === null || raw.name === '' ? String(input.skill || '').trim() : raw.name;
    const cardOptions = input.output === 'card' && input.rarity
        ? { id: undefined, rarity: input.rarity, table: restrictTable(CARD_TEMPLATES, input.templates), ...(raw.values !== undefined ? { values: raw.values } : {}) }
        : { id: undefined, rarity: 'personal' };
    const result = input.output === 'card'
        ? buildCard(name, raw.template, raw.cost, ['name', 'template', 'cost'], collector, { ...cardOptions, archetype: input.archetype })
        : buildSkill(name, raw.template, ['name', 'template'], collector, undefined, COMBAT_RULES.allySkillDamageCap);
    if (collector.errors.length) return { errors: collector.errors };
    return { value: { [input.output]: result, ...(raw.targetId !== undefined ? { targetId: raw.targetId } : {}) }, diagnostics: collector.diagnostics };
}

// 描述：优先取用户给的，其次取模板的，截到 maxLength
const describe = (given, fallback, maxLength) => (String(given || '').trim() || String(fallback || '')).slice(0, maxLength);

// 装备：给了稀有度时走「能力加成 + 可选被动」，否则必须选被动模板
export function assembleGear(raw, { key, input }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const gearId = gearIdFor(input.name);
    const name = String(input.name || '').trim().slice(0, 20);
    if (input.rarity) {
        const ability = abilityKeyOf(raw.ability);
        if (!ability || !ABILITY_KEYS.includes(ability)) collector.fail('ability', 'invalid-ability', { allowed: [...ABILITY_KEYS] });
        const passiveTemplate = Array.isArray(input.templates) && input.templates.length > 0
            ? pickTemplate(raw.template, 'template', collector, restrictTable(GEAR_PASSIVE_TEMPLATES, input.templates))
            : null;
        if (collector.errors.length) return { errors: collector.errors };
        const passive = passiveTemplate ? { id: `${gearId}-p`, name, ...passiveAtRarity(passiveTemplate, input.rarity) } : null;
        const bonus = { ability, amount: GEAR_BONUS_BY_RARITY[input.rarity] };
        return {
            value: { gearId, name, slot: input.slot, ...(passive ? { passive } : {}), description: describe(input.description, passive?.description, 80), rarity: input.rarity, bonus },
            diagnostics: collector.diagnostics,
        };
    }
    const template = pickTemplate(raw.template, 'template', collector, GEAR_PASSIVE_TEMPLATES);
    if (!template) return { errors: collector.errors };
    const passive = { id: `${gearId}-p`, name, ...gearPassiveFromTemplate(template, input.slot) };
    return { value: { gearId, name, slot: input.slot, passive, description: describe(input.description, passive.description, 80) }, diagnostics: collector.diagnostics };
}

// profile-gear（初始装备，v0.39.2）：{ gear:[[名称, 部位, 稀有度, 简述?], …] } → equip 载荷列表（0–4 件，每部位至多 1 件）。
// 模型只定名称、部位与稀有度；加成量按稀有度，加成六维按装备 ID 种子抽定；是否带被动同正文获得物（gearHasPassive），
// 带被动时取按名称与简述排序、按该稀有度加强后不超队友伤害上限的候选模板中的第一个。input.required（主角）时至少 1 件。
export const INITIAL_GEAR_MAX = 4;
const gearAbilityOf = (gearId) => ABILITY_KEYS[hash32(`gear-ability:${gearId}`) % ABILITY_KEYS.length];
function gearPassiveTemplate(gearId, rarity, text) {
    const allowed = Object.keys(GEAR_PASSIVE_TEMPLATES).filter((name) => effectsDamage(passiveAtRarity(name, rarity)?.effects) <= COMBAT_RULES.allySkillDamageCap);
    return templateCandidates(allowed, (name) => GEAR_PASSIVE_TEMPLATES[name].label, text, gearId)[0] || null;
}
export function assembleInitialGear(raw, { key, input } = {}) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const list = raw.gear ?? [];
    if (!Array.isArray(list) || list.length > INITIAL_GEAR_MAX) return { errors: [{ path: 'gear', reason: 'invalid-length', detail: { max: INITIAL_GEAR_MAX } }] };
    if (input?.required && !list.length) return { errors: [{ path: 'gear', reason: 'invalid-length', detail: { min: 1, max: INITIAL_GEAR_MAX } }] };
    const rarities = Object.keys(GEAR_BONUS_BY_RARITY);
    const slots = new Set();
    const ids = new Set();
    const out = [];
    list.forEach((item, i) => {
        const at = (n) => `gear[${i}][${n}]`;
        if (!Array.isArray(item)) { collector.fail(`gear[${i}]`, 'expected-array'); return; }
        const name = requiredText(item[0], at(0), collector, 20);
        const slot = GEAR_SLOTS.includes(item[1]) ? item[1] : collector.fail(at(1), 'invalid-enum', { allowed: [...GEAR_SLOTS] });
        const rarity = rarities.includes(item[2]) ? item[2] : collector.fail(at(2), 'invalid-enum', { allowed: rarities });
        if (!name || !slot || !rarity) return;
        const gearId = gearIdFor(name);
        if (slots.has(slot)) { collector.fail(at(1), 'slot-duplicate'); return; }
        if (ids.has(gearId)) { collector.fail(at(0), 'name-duplicate'); return; }
        slots.add(slot);
        ids.add(gearId);
        const text = typeof item[3] === 'string' ? item[3] : '';
        const template = gearHasPassive(gearId, rarity) ? gearPassiveTemplate(gearId, rarity, `${name} ${text}`) : null;
        const passive = template ? { id: `${gearId}-p`, name, ...passiveAtRarity(template, rarity) } : null;
        out.push({ gearId, name, slot, ...(passive ? { passive } : {}), description: describe(text, passive?.description, 80), rarity, bonus: { ability: gearAbilityOf(gearId), amount: GEAR_BONUS_BY_RARITY[rarity] } });
    });
    return collector.errors.length ? { errors: collector.errors } : { value: out, diagnostics: collector.diagnostics };
}

// 物品：给了稀有度时按稀有度（可限制模板），否则用模板默认
export function assembleItem(raw, { key, input }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const rarity = input.rarity;
    const template = pickTemplate(raw.template, 'template', collector, rarity ? restrictTable(ITEM_TEMPLATES, input.templates) : ITEM_TEMPLATES);
    if (!template) return { errors: collector.errors };
    const item = rarity ? itemAtRarity(template, rarity) : itemFromTemplate(template);
    const name = String(input.name || '').trim().slice(0, 20);
    return {
        value: { itemId: itemIdFor(input.name), name, count: input.count, effects: item.effects, description: describe(input.description, item.description, 80) },
        diagnostics: collector.diagnostics,
    };
}

const deepCopy = (value) => JSON.parse(JSON.stringify(value));

// 特质：fixed.shape 给定时直接用其形状（主动技能或被动），否则按被动模板与稀有度生成
// fixed.relic（规则 v6 遗物特性）给定时名称与被动都由遗物表还原，模型只写来历；战斗外模型的遗物特性不带被动，只记引用。
export function assembleTrait(raw, { key, fixed = {} } = {}) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const relic = fixed.relic ? resolveRelic(fixed.relic.relicId, fixed.relic.model) : null;
    if (fixed.relic && !relic) return { errors: [{ path: 'relic', reason: 'relic-trait-invalid' }] };
    // 遗物被动的 id / name 换成本特性自己的，其余（触发器、过滤、效果、描述）原样保留。
    const relicPassiveBody = relic?.passive ? (({ id: _id, name: _name, ...rest }) => rest)(relic.passive) : null;
    const shape = relic ? (relicPassiveBody ? { kind: 'passive', passive: relicPassiveBody } : null) : fixed.shape || null;
    const name = relic ? relic.name : requiredText(raw.name, 'name', collector, 20);
    const template = shape || relic ? null : pickTemplate(raw.template, 'template', collector, GEAR_PASSIVE_TEMPLATES);
    if (!name || (!shape && !relic && !template)) return { errors: collector.errors };
    const origin = typeof raw.origin === 'string' ? raw.origin.trim() : '';
    if (origin.length > REWARD_ORIGIN_MAX) collector.note('origin', origin.length, REWARD_ORIGIN_MAX);
    const base = {
        traitId: fixed.traitId, name, origin: origin.slice(0, REWARD_ORIGIN_MAX), rarity: fixed.rarity, ...(fixed.link ? { link: fixed.link } : {}),
        ...(relic ? { relic: { relicId: relic.relicId, model: relic.model } } : {}),
    };
    if (relic && !relic.passive) return { value: { ...base, kind: 'passive' }, diagnostics: collector.diagnostics };
    if (shape?.kind === 'active') {
        const { cost, effects, description } = shape.skill;
        return { value: { ...base, kind: 'active', skill: { id: `${fixed.traitId}-s`, name, cost, effects: deepCopy(effects), description } }, diagnostics: collector.diagnostics };
    }
    const passive = { id: `${fixed.traitId}-p`, name, ...(shape ? deepCopy(shape.passive) : passiveAtRarity(template, fixed.rarity)) };
    return { value: { ...base, kind: 'passive', passive }, diagnostics: collector.diagnostics };
}

// 奖励条目 id：前缀 + 种子与序号的哈希
const rewardId = (seed, index, prefix) => `${prefix}-${hashString(`${seed}|${index}`)}`;

// 单个奖励槽：[名字, 模板, 来历]，按槽位种类（卡/装备/物品/杂物）生成
function buildRewardEntry(value, path, collector, slot, seed) {
    const fields = fieldsOf(value, path, collector, ['name', 'template', 'origin']);
    if (!fields) return;
    const [nameValue, templateValue, originValue] = fields;
    const paths = [indexPath(path, 0), indexPath(path, 1), indexPath(path, 2)];
    const origin = typeof originValue === 'string' ? originValue.trim() : '';
    if (origin.length > REWARD_ORIGIN_MAX) collector.note(paths[2], origin.length, REWARD_ORIGIN_MAX);
    const base = { index: slot.index, kind: slot.kind, rarity: slot.rarity, origin: origin.slice(0, REWARD_ORIGIN_MAX) };
    if (slot.kind === 'card') {
        // 规则 v6 预定卡槽（rewards.js 的 withCardCandidates）：只有固定卡（不带 randomAt）时就是那张牌，模型只写来历；
        // 带随机卡时随机卡只能用本职业允许的模板，与程序定的固定卡一起按 randomAt 排成 choices（旧 offer 的三选一同此）。
        const fixedIds = Array.isArray(slot.fixedIds) ? slot.fixedIds : null;
        const fixed = (fixedIds || []).map((id) => fixedCard(id));
        if (fixed.some((item) => !item)) return collector.fail(path, 'reward-choice-invalid');
        const choices = fixed.map((item) => JSON.parse(JSON.stringify(item)));
        let card = choices[0];
        if (!fixedIds || slot.randomAt !== undefined) {
            const table = fixedIds ? archetypeTable(slot.archetype) : CARD_TEMPLATES;
            card = buildCard(nameValue, templateValue, undefined, [paths[0], paths[1], `${path}.cost`], collector, { id: rewardId(seed, slot.index, 'rc'), rarity: slot.rarity, slot: slot.cost, table, archetype: slot.archetype });
            if (!card) return undefined;
            choices.splice(Math.max(0, Math.min(choices.length, Number(slot.randomAt) || 0)), 0, card);
        }
        if (!card) return collector.fail(path, 'reward-choice-invalid');
        // 预定固定卡可能因固定池逐档降低而低于槽位稀有度：槽位稀有度随这张牌，与校验的 card.rarity 一致。
        return {
            ...base, rarity: card.rarity || slot.rarity, name: card.name, card, ...(fixedIds ? { choices } : {}),
            ...(slot.inscribe > 0 ? { marks: planRewardMarks(choices, `${seed}|${slot.index}`, slot.inscribe) } : {}),
            ...(slot.upgradeNoDamage === true ? { upgradeNoDamage: true } : {}),
        };
    }
    // 规则 v5 P5b 刻印槽：刻印种类、目标副本与名称都由程序定，模型只写来历。
    if (slot.kind === 'inscribe') {
        const label = INSCRIPTION_LABELS[slot.inscription];
        if (!label || !slot.cardId || !slot.copyId) return collector.fail(path, 'inscribe-slot-invalid');
        return { ...base, name: `${label}·${String(slot.cardName || '')}`.slice(0, 20), inscription: slot.inscription, cardId: slot.cardId, copyId: slot.copyId, cardName: String(slot.cardName || slot.cardId).slice(0, 40) };
    }
    // 规则 v6 遗物宝物槽（rewards.js 的 withRelics）：条目、模型、名称与效果都由程序定，模型只写来历。
    if (slot.kind === 'gear' && slot.relic) {
        const relic = resolveRelic(slot.relic.relicId, slot.relic.model);
        if (!relic) return collector.fail(path, 'relic-slot-invalid');
        const gearId = gearIdFor(relic.name);
        const passive = relic.passive ? { ...relic.passive, id: `${gearId}-p`, name: relic.name } : null;
        const description = passive ? passive.description : relic.description;
        return {
            ...base, name: relic.name,
            gear: { gearId, name: relic.name, slot: slot.gearSlot, ...(passive ? { passive } : {}), description, relic: { relicId: relic.relicId, model: relic.model } },
        };
    }
    const name = requiredText(nameValue, paths[0], collector, 20);
    // 装备槽带程序给的候选（规则 v5 D10）时只能从候选里选；旧槽位不带候选，照旧用全表。
    const gearTable = Array.isArray(slot.templates) && slot.templates.length ? restrictTable(GEAR_PASSIVE_TEMPLATES, slot.templates) : GEAR_PASSIVE_TEMPLATES;
    const table = slot.kind === 'gear' ? gearTable : slot.kind === 'item' ? ITEM_TEMPLATES : null;
    const template = table ? pickTemplate(templateValue, paths[1], collector, table) : null;
    if (!name || (table && !template)) return;
    if (slot.kind === 'gear') {
        const gearId = gearIdFor(name);
        const passive = { id: `${gearId}-p`, name, ...passiveAtRarity(template, slot.rarity) };
        return { ...base, name, gear: { gearId, name, slot: slot.gearSlot, passive, description: passive.description } };
    }
    if (slot.kind === 'item') {
        const item = itemFromTemplate(template);
        return { ...base, name, item: { itemId: itemIdFor(name), name, count: slot.count, effects: item.effects, description: item.description } };
    }
    // 规则 v6 G3d 弱敌战的劣等杂物：junk 由程序定，随奖励单与战利品记录保存。
    return { ...base, name, ...(slot.kind === 'keepsake' && slot.junk === true ? { junk: true } : {}) };
}

// 奖励：按 input.slots（以及可选 input.reserve 备选）逐槽生成
export function assembleReward(raw, { key, input }) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const build = (field, seed) => {
        const slots = Array.isArray(input?.[field]) ? input[field] : [];
        return mapList(raw[field], field, collector, slots.length, slots.length, (item, itemPath, index) => buildRewardEntry(item, itemPath, collector, slots[index], seed));
    };
    const slots = build('slots', input?.seed);
    const reserve = Array.isArray(input?.reserve) ? build('reserve', `${input.seed}|reserve`) : undefined;
    return collector.errors.length
        ? { errors: collector.errors }
        : { value: { slots, ...(reserve ? { reserve } : {}) }, diagnostics: collector.diagnostics };
}

// 规则 v6 积分抽卡的随机候选：{ card: [名称, 模板键] }。稀有度、费用、ID 与本职业模板范围由程序定（rewards.js 的 planCardDraw）。
export function assembleDrawCard(raw, { key, fixed = {} } = {}) {
    const invalid = expectObject(raw);
    if (invalid) return invalid;
    const collector = createCollector(key);
    const fields = fieldsOf(raw.card, 'card', collector, ['name', 'template']);
    if (!fields) return { errors: collector.errors };
    const card = buildCard(fields[0], fields[1], undefined, [indexPath('card', 0), indexPath('card', 1), 'card.cost'], collector, {
        id: fixed.cardId, rarity: fixed.rarity, slot: fixed.cost, table: archetypeTable(fixed.archetype), archetype: fixed.archetype,
    });
    return card && !collector.errors.length ? { value: card, diagnostics: collector.diagnostics } : { errors: collector.errors };
}
