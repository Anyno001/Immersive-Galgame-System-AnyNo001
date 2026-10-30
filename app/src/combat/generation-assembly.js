import { BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES, combatSpeedFor } from './rules.js';
import { CARD_TEMPLATES, GEAR_PASSIVE_TEMPLATES, ITEM_TEMPLATES, PASSIVE_TEMPLATES, SKILL_TEMPLATES, cardFromValues, gearPassiveFromTemplate, heroSkillFromTemplate, itemAtRarity, itemFromTemplate, fixedTemplateCost, nearestTemplateCost, passiveAtRarity, passiveFromTemplate, skillFromTemplate, solveCardTemplate } from './card-templates.js';
import { forbiddenCombos } from './combos.js';
import { GEAR_BONUS_BY_RARITY, REWARD_ORIGIN_MAX, gearIdFor, itemIdFor, profileIdFor } from './schema.js';
import { ABILITY_KEYS, abilityKeyOf } from './abilities.js';
import { hash32, hashString, nextRandom } from './random.js';
import { isEnemyArtKey } from './enemy-art.js';

// 紧凑回复 → 完整档案。副 LLM 只给模板键、名称、费用与少量数值；ID、效果、升级版与起始卡组由这里生成。
// 结构错误按紧凑回复的字段路径记入 errors（供定向修正）；数值越界夹回范围并记 combat-value-clamped 诊断。
// 组装结果仍须经 normalizeProfile / normalizeCard / normalizeSkill / validateStarterDeck。
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const at = (path, i) => `${path}[${i}]`;

function createAssembly(key) {
    const errors = [];
    const diagnostics = [];
    return {
        errors,
        diagnostics,
        fail(path, reason, detail) {
            errors.push(detail === undefined ? { path, reason } : { path, reason, detail });
            return undefined;
        },
        note(path, from, to) { diagnostics.push({ code: 'combat-value-clamped', key, path, from, to }); },
        // 其他非拒收提示（如回复里写了与槽位不符的费用）。
        hint(code, path, from, to) { diagnostics.push({ code, key, path, from, to }); },
    };
}
const finish = (a, profile) => (a.errors.length ? { errors: a.errors } : { profile, diagnostics: a.diagnostics });

function nameOf(raw, path, a, max) {
    if (typeof raw !== 'string' || !raw.trim()) return a.fail(path, 'required-text');
    const value = raw.trim();
    if (value.length <= max) return value;
    a.note(path, value.length, max);
    return value.slice(0, max);
}

function intOf(raw, path, a, min, max, fallback) {
    if ((raw === undefined || raw === null || raw === '') && fallback !== undefined) return fallback;
    const n = typeof raw === 'string' ? Number(raw.trim()) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n)) return a.fail(path, 'expected-number', { min, max });
    const value = Math.min(max, Math.max(min, Math.round(n)));
    if (value !== n) a.note(path, n, value);
    return value;
}

// ["名称","模板键",费用] 元组，或同名字段对象。
function tupleOf(raw, path, a, fields) {
    if (Array.isArray(raw)) return fields.map((_, i) => raw[i]);
    if (isObj(raw)) return fields.map((f) => raw[f]);
    return a.fail(path, 'expected-array');
}

function listOf(raw, path, a, min, max, item) {
    if ((raw === undefined || raw === null) && min === 0) return [];
    if (!Array.isArray(raw)) return a.fail(path, 'expected-array');
    if (raw.length < min) return a.fail(path, 'too-few', { min, size: raw.length });
    if (raw.length > max) a.note(path, raw.length, max);
    return raw.slice(0, max).map((v, i) => item(v, at(path, i), i));
}

const aliasesOf = (raw) => (Array.isArray(raw)
    ? [...new Set(raw.filter((s) => typeof s === 'string').map((s) => s.trim().slice(0, 20)).filter(Boolean))].slice(0, 5)
    : []);

// 与费用使用不同的种子域；固定 11 张，重试保持同一配额和位置。
export function classRaritiesFor(seed = '') {
    const rarities = [...Array(7).fill('common'), ...Array(4).fill('uncommon')];
    let state = hash32(`rarities:class:${seed}`);
    for (let i = rarities.length - 1; i > 0; i -= 1) {
        const r = nextRandom(state);
        state = r.state;
        const j = Math.floor(r.value * (i + 1));
        [rarities[i], rarities[j]] = [rarities[j], rarities[i]];
    }
    return rarities;
}
const COST_MAX = 3;
// 费用槽位：卡牌费用按出现顺序由程序给定（超出槽位数时循环），模型只给名称与模板键；回复里多写的费用忽略并记诊断。
export const CARD_COST_SLOTS = Object.freeze({
    class: Object.freeze([0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3]),
    personal: Object.freeze([1, 1, 2, 2]),
    signature: Object.freeze([2, 3]),
    // 职业升阶追加的 3 张卡（P-c）：按位置给费用，无解时取最近有解费用。
    tier: Object.freeze([1, 2, 3]),
});
const blank = (v) => v === undefined || v === null || v === '';

// 费用曲线范围（助手要求：不要太整齐，也不要太乱）：每档张数在 [min,max] 内、合计等于槽位数，
// 按角色种子在全部合法组合里确定性挑一种，同一角色重试结果一致；counts 下标即费用 0–3。
const COST_CURVE_RANGES = Object.freeze({
    class: Object.freeze({ size: 11, counts: Object.freeze([[0, 1], [4, 6], [3, 4], [1, 3]]) }),
    personal: Object.freeze({ size: 4, counts: Object.freeze([[0, 0], [1, 2], [1, 2], [0, 1]]) }),
});
function curveCombos(counts, size, i = 0, head = []) {
    if (i === counts.length) return head.reduce((s, n) => s + n, 0) === size ? [head] : [];
    const out = [];
    for (let n = counts[i][0]; n <= counts[i][1]; n += 1) out.push(...curveCombos(counts, size, i + 1, [...head, n]));
    return out;
}
// 槽位按费用升序排列；没有登记范围的种类（signature）用固定槽位。
export function costSlotsFor(kind, seedKey = '') {
    const range = COST_CURVE_RANGES[kind];
    if (!range) return [...(CARD_COST_SLOTS[kind] || [])];
    const combos = curveCombos(range.counts, range.size);
    const pick = combos[hash32(`slots:${kind}:${seedKey}`) % combos.length];
    return pick.flatMap((n, cost) => Array(n).fill(cost));
}
// 请求里带的槽位须是 0–3 的整数数组，否则用固定槽位。
const slotsIn = (raw, fallback) => (Array.isArray(raw) && raw.length && raw.every((c) => Number.isInteger(c) && c >= 0 && c <= COST_MAX) ? raw : fallback);

function templateKey(raw, path, a, table) {
    const key = typeof raw === 'string' ? raw.trim() : raw;
    if (typeof key === 'string' && Object.hasOwn(table, key)) return key;
    return a.fail(path, 'invalid-template', { allowed: Object.keys(table) });
}
// 带稀有度的正文获得物（D7–D9）：input.templates 是程序筛出的候选键，模型只能从中选；缺省时用整张表（旧路径）。
function candidateTable(table, keys) {
    if (!Array.isArray(keys) || !keys.length) return table;
    const picked = keys.filter((k) => typeof k === 'string' && Object.hasOwn(table, k));
    return picked.length ? Object.fromEntries(picked.map((k) => [k, table[k]])) : table;
}

// 职业卡锁定费用槽（X 费模板放在 1–3 费位置时改为 X 费）；其他卡保留最近有解费用规则。无槽位的成长卡取回复费用。
// table：可选模板的范围（带稀有度的学会卡只给候选）；values：模型给的模板变量数值（D9），缺省时由程序求解。
function buildCard(nameRaw, keyRaw, costRaw, paths, a, { id, rarity, slot, fixedCost = false, table = CARD_TEMPLATES, values, valuesPath = 'values' }) {
    const name = nameOf(nameRaw, paths[0], a, 20);
    const key = templateKey(keyRaw, paths[1], a, table);
    let wanted;
    if (slot !== undefined) {
        wanted = slot;
        if (!blank(costRaw) && Number(costRaw) !== slot) a.hint('combat-cost-slotted', paths[2], costRaw, slot);
    } else {
        wanted = intOf(costRaw, paths[2], a, 0, COST_MAX, 1);
    }
    if (!name || !key || wanted === undefined) return undefined;
    const cost = fixedCost ? fixedTemplateCost(key, wanted) : nearestTemplateCost(key, wanted, rarity);
    if (cost === null) return a.fail(paths[1], 'template-unsolvable');
    if (cost !== wanted) a.note(paths[2], wanted, cost);
    let solved;
    if (values === undefined) {
        solved = solveCardTemplate(key, cost, rarity);
        if (!solved) return a.fail(paths[1], 'template-unsolvable', { cost, rarity });
    } else {
        const given = cardFromValues(key, cost, rarity, values);
        if (given.error) return a.fail(valuesPath, given.error, given.detail);
        solved = given.card;
    }
    // 内部禁止组合名单（combos.js）：与人物特性抽取共用同一判定，命中时按模板键路径拒收，定向修正换模板。
    const combos = forbiddenCombos({ cost, effects: solved.effects, onDiscard: solved.onDiscard });
    if (combos.length) return a.fail(paths[1], 'forbidden-combo', { combos });
    // 关键字（innate / ethereal / unplayable）与被弃时效果随模板带出，字段名与 schema 卡牌一致。
    const { type, effects, upgraded, ...keywords } = solved;
    return { id, name, type, cost, rarity, ...keywords, effects, ...(upgraded ? { upgraded } : {}) };
}

function cardOf(raw, path, a, opts) {
    const t = tupleOf(raw, path, a, ['name', 'template', 'cost']);
    return t ? buildCard(t[0], t[1], t[2], [at(path, 0), at(path, 1), at(path, 2)], a, opts) : undefined;
}

// 被动：["名称","模板键"] 或只给模板键（名称取模板说明）。
function passiveOf(raw, path, a, id) {
    const bare = typeof raw === 'string';
    const t = bare ? [undefined, raw] : tupleOf(raw, path, a, ['name', 'template']);
    if (!t) return undefined;
    const key = templateKey(t[1], bare ? path : at(path, 1), a, PASSIVE_TEMPLATES);
    if (!key) return undefined;
    const name = t[0] === undefined || t[0] === null || t[0] === '' ? PASSIVE_TEMPLATES[key].label.slice(0, 20) : nameOf(t[0], at(path, 0), a, 20);
    return name ? { id, name, ...passiveFromTemplate(key) } : undefined;
}

function buildSkill(nameRaw, keyRaw, paths, a, id, cap, table = SKILL_TEMPLATES) {
    const name = nameOf(nameRaw, paths[0], a, 20);
    const key = templateKey(keyRaw, paths[1], a, table);
    return name && key ? { id, name, ...skillFromTemplate(key, cap) } : undefined;
}

function skillOf(raw, path, a, id, cap, table) {
    const t = tupleOf(raw, path, a, ['name', 'template']);
    return t ? buildSkill(t[0], t[1], [at(path, 0), at(path, 1)], a, id, cap, table) : undefined;
}
const requireObject = (value) => (isObj(value) ? null : { errors: [{ path: '', reason: 'expected-object' }] });
const passivesIn = (value) => value.passives ?? (value.passive !== undefined && value.passive !== null ? [value.passive] : undefined);
const hpOf = (raw, path, a, [lo, hi]) => intOf(raw, path, a, lo, hi, Math.round((lo + hi) / 2));
const poolOf = (raw, path, a, min, max, owner, tag, rarity, slots, fixedCost = false) => listOf(raw, path, a, min, max,
    (v, p, i) => cardOf(v, p, a, { id: `${owner}-${tag}${i + 1}`, rarity: Array.isArray(rarity) ? rarity[i] : rarity,
        fixedCost, ...(slots ? { slot: slots[i % slots.length] } : {}) }));
const skillsOf = (raw, path, a, min, max, owner, cap) => listOf(raw, path, a, min, max, (v, p, i) => skillOf(v, p, a, `${owner}-s${i + 1}`, cap));
const passivesOf = (raw, path, a, min, max, owner) => listOf(raw, path, a, min, max, (v, p, i) => passiveOf(v, p, a, `${owner}-p${i + 1}`));

function requiredPassive(raw, path, a, id) {
    if (raw === undefined || raw === null || raw === '') return a.fail(path, 'required');
    return passiveOf(raw, path, a, id);
}

// 人物技能：["技能名","卡牌模板键"]，按 heroSkillCost 费用、个人稀有度求值；逐人设计，必填。
function heroSkillOf(raw, path, a, id) {
    if (raw === undefined || raw === null || raw === '') return a.fail(path, 'required');
    const t = tupleOf(raw, path, a, ['name', 'template']);
    if (!t) return undefined;
    const name = nameOf(t[0], at(path, 0), a, 20);
    const key = templateKey(t[1], at(path, 1), a, CARD_TEMPLATES);
    if (!name || !key) return undefined;
    return heroSkillFromTemplate(key, { id, name }) || a.fail(at(path, 1), 'template-unsolvable');
}

// 起始卡组：基础攻击 / 防御各 3，职业卡 10、个人卡 4。按 seed 确定性加权抽取：低费略多、已抽到的卡权重递减，
// 职业卡单卡最多 3 张、个人卡单卡最多 2 张；同一角色结果固定，结果按卡池顺序排列便于查看。
const STARTER_COST_WEIGHT = Object.freeze({ 0: 2, 1: 3, 2: 2, 3: 1, X: 1 });
export function buildStarterDeck(classPool, personalPool, seed = '') {
    const shape = COMBAT_RULES.starterDeckShape;
    let state = hash32(`starter:${seed}`);
    const draw = (pool, n, cap) => {
        const cards = Array.isArray(pool) ? pool : [];
        const copies = new Map();
        while ([...copies.values()].reduce((s, k) => s + k, 0) < n) {
            const open = cards.filter((c) => (copies.get(c.id) || 0) < cap);
            if (!open.length) break;
            const weights = open.map((c) => (STARTER_COST_WEIGHT[c.cost] ?? 1) / (1 + 1.5 * (copies.get(c.id) || 0)));
            const r = nextRandom(state);
            state = r.state;
            let x = r.value * weights.reduce((s, w) => s + w, 0);
            let i = 0;
            while (i < open.length - 1 && x >= weights[i]) { x -= weights[i]; i += 1; }
            copies.set(open[i].id, (copies.get(open[i].id) || 0) + 1);
        }
        return cards.flatMap((c) => Array(copies.get(c.id) || 0).fill(c.id));
    };
    return [
        ...Array(shape.basicAttack).fill(BASIC_STRIKE_ID), ...Array(shape.basicDefend).fill(BASIC_DEFEND_ID),
        ...draw((classPool || []).filter((c) => c.rarity === 'common' || c.rarity === 'uncommon'), shape.classCards, COMBAT_RULES.copyLimit),
        ...draw(personalPool, shape.personalCards, 2),
    ];
}

// class：{ className, archetype, passive, cards:[[名, 模板键], ...11] }；fixed.className 优先。
export function assembleClass(value, { key, owner = key, fixed = {}, input = {} } = {}) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const className = fixed.className ?? nameOf(value.className, 'className', a, 12);
    const archetype = Object.hasOwn(COMBAT_RULES.archetypes, value.archetype) ? value.archetype
        : a.fail('archetype', 'invalid-enum', { allowed: Object.keys(COMBAT_RULES.archetypes) });
    if (!className) return finish(a, null);
    const id = profileIdFor('class', className);
    const classPassive = requiredPassive(value.passive, 'passive', a, `${id}-p1`);
    const classPool = poolOf(value.cards, 'cards', a, 11, 11, id, 'c', classRaritiesFor(owner),
        slotsIn(input?.costSlots, CARD_COST_SLOTS.class), true);
    return finish(a, { kind: 'class', id, className, archetype, classPassive, classPool });
}

// class-tier（职业升阶，P-c）：{ tierName, cards:[[名, 卡牌模板键], ...3] }。稀有度取该阶规则（input.rarity），费用按 input.costSlots 的位置给定、
// 无解时取最近有解费用，卡牌 ID 由程序给定（fixed.cardIds）。
export function assembleClassTier(value, { key, fixed = {}, input = {} } = {}) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const tierName = nameOf(value.tierName, 'tierName', a, 12);
    const ids = Array.isArray(fixed.cardIds) ? fixed.cardIds : [];
    const slots = slotsIn(input?.costSlots, CARD_COST_SLOTS.tier);
    const cards = listOf(value.cards, 'cards', a, 3, 3, (v, p, i) => cardOf(v, p, a, { id: ids[i], rarity: input?.rarity, slot: slots[i % slots.length] }));
    if (a.errors.length) return { errors: a.errors };
    return { value: { tierName, cards }, diagnostics: a.diagnostics };
}

// profile-deck：{ aliases?, hp?, hpPerLevel?, passive, skill:[名, 卡牌模板键], cards:[[名, 模板键], ...4–8], signature?:[[名, 模板键], ...0–2] }；cls 为所用职业档案。
export function assembleDeck(value, { key, fixed, cls, input = {} }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const range = COMBAT_RULES.archetypes[cls.archetype]?.hp || [40, 120];
    const id = fixed.id;
    const profile = {
        kind: 'deck-character', id, name: fixed.name, aliases: aliasesOf(value.aliases), classRef: cls.id,
        base: { hp: hpOf(value.hp, 'hp', a, range), speed: combatSpeedFor({ archetype: cls.archetype, id }) },
        growth: { hpPerLevel: intOf(value.hpPerLevel, 'hpPerLevel', a, 1, 8, 4) },
        personalPassive: requiredPassive(value.passive, 'passive', a, `${id}-p1`),
        personalPool: poolOf(value.cards, 'cards', a, 4, 8, id, 'm', 'personal', slotsIn(input?.costSlots, CARD_COST_SLOTS.personal)),
        heroSkill: heroSkillOf(value.skill, 'skill', a, `${id}-h1`),
    };
    // 专属卡：可选，不进起始卡组，剧情 learn 同名技能时解锁；没有时不写字段。
    const signature = poolOf(value.signature, 'signature', a, 0, COMBAT_RULES.signatureLimit, id, 'g', 'signature', CARD_COST_SLOTS.signature);
    if (Array.isArray(signature) && signature.length) profile.signatureCards = signature;
    if (!a.errors.length) profile.starterDeck = buildStarterDeck(cls.classPool, profile.personalPool, id);
    return finish(a, profile);
}

// profile-skill：{ aliases?, className?, hp?, tier?, skills:[[名, 模板键], ...3–5], passives:[1–2 个] }；tier 缺省不写（按 defaultAllyTier）。
export function assembleSkillCharacter(value, { key, fixed }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const id = fixed.id;
    const className = typeof value.className === 'string' && value.className.trim() ? nameOf(value.className, 'className', a, 12) : '';
    const tier = blank(value.tier) ? undefined
        : Object.hasOwn(COMBAT_RULES.allyTiers, value.tier) ? value.tier : a.fail('tier', 'invalid-enum', { allowed: Object.keys(COMBAT_RULES.allyTiers) });
    return finish(a, {
        kind: 'skill-character', id, name: fixed.name, aliases: aliasesOf(value.aliases), className,
        base: { hp: hpOf(value.hp, 'hp', a, [20, 120]), speed: combatSpeedFor({ id }) },
        skills: skillsOf(value.skills, 'skills', a, 3, 5, id, COMBAT_RULES.allySkillDamageCap),
        passives: passivesOf(passivesIn(value), 'passives', a, 1, 2, id),
        ...(tier ? { tier } : {}),
    });
}

// enemy：{ hp?, skills:[[名, 模板键], ...2–5], passives?, enrage?:[名, 模板键] }；首领由程序补一个半血阶段。
export function assembleEnemy(value, { key, fixed }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const tier = COMBAT_RULES.tiers[fixed.tier] ? fixed.tier : 'normal';
    const rule = COMBAT_RULES.tiers[tier];
    const id = fixed.id;
    // 外观格位只影响战斗面板的敌人图：非法值丢弃并记诊断，不拒收、不触发修正；缺省时不写字段，由 session 按名字推断。
    if (!blank(value.art) && !isEnemyArtKey(value.art)) a.hint('combat-art-dropped', 'art', value.art, null);
    const profile = {
        kind: 'enemy', id, name: fixed.name, tier,
        ...(isEnemyArtKey(value.art) ? { art: value.art } : {}),
        base: { hp: intOf(value.hp, 'hp', a, Math.round(rule.hp * 0.5), Math.round(rule.hp * 1.5), rule.hp), speed: combatSpeedFor({ tier, id }) },
        skills: skillsOf(value.skills, 'skills', a, 2, 5, id, rule.damageCap),
        passives: passivesOf(passivesIn(value), 'passives', a, 0, 2, id),
        phases: [],
        generated: true,
    };
    if (tier === 'boss') {
        const enrageId = `${id}-s9`;
        const enrage = value.enrage !== undefined && value.enrage !== null
            ? skillOf(value.enrage, 'enrage', a, enrageId, rule.damageCap)
            : { id: enrageId, name: '狂怒', ...skillFromTemplate('roar', rule.damageCap) };
        if (enrage) profile.phases = [{ hpBelowPct: 50, addSkills: [enrage] }];
    }
    return finish(a, profile);
}

// skill-fill：{ skills:[[名, 模板键], ...恰好 input.count 个] } → 在 fixed.profile 末尾追加技能（计划 5.4，只增不删）。
// ID 接着现有技能数用 -k 序号（不与生成时的 -s 序号和首领阶段技能撞号）；名称不得与已有技能（档案技能与 input.existing）或同批补充的重复；伤害按档案类型封顶。
export function assembleSkillFill(value, { key, fixed, input }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const { profile } = fixed;
    // 队友按等级补技能（D10）：fixed.cap 为按等级放大的折算上限，input.templates 为 Lv6 起的复合技能候选；缺省时与旧路径一致。
    const enemy = profile.kind === 'enemy';
    const cap = enemy ? (COMBAT_RULES.tiers[profile.tier]?.damageCap ?? COMBAT_RULES.allySkillDamageCap) : (fixed.cap ?? COMBAT_RULES.allySkillDamageCap);
    const table = enemy ? SKILL_TEMPLATES : candidateTable(SKILL_TEMPLATES, input.templates);
    const start = profile.skills.length;
    const added = listOf(value.skills, 'skills', a, input.count, input.count, (v, p, i) => skillOf(v, p, a, `${profile.id}-k${start + i + 1}`, cap, table)) || [];
    const names = new Set([...profile.skills.map((s) => s.name), ...(Array.isArray(input.existing) ? input.existing : [])]);
    added.forEach((s, i) => {
        if (!s) return;
        if (names.has(s.name)) a.fail(`${at('skills', i)}[0]`, 'skill-name-exists');
        names.add(s.name);
    });
    return finish(a, { ...profile, skills: [...profile.skills, ...added] });
}


// skill-to-card：{ name?, template, cost?, targetId? } → { card | skill, targetId? }；ID 由调用方分配。
export function assembleGrowth(value, { key, input }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const name = value.name === undefined || value.name === null || value.name === '' ? String(input.skill || '').trim() : value.name;
    // 卡组角色学会的卡牌（D9）：input.rarity 存在时取该稀有度、只能选 input.templates 候选、可给 values；否则照旧按个人稀有度求解。
    const tagged = input.output === 'card' && input.rarity;
    const cardOpts = tagged
        ? { id: undefined, rarity: input.rarity, table: candidateTable(CARD_TEMPLATES, input.templates), ...(value.values !== undefined ? { values: value.values } : {}) }
        : { id: undefined, rarity: 'personal' };
    const item = input.output === 'card'
        ? buildCard(name, value.template, value.cost, ['name', 'template', 'cost'], a, cardOpts)
        : buildSkill(name, value.template, ['name', 'template'], a, undefined, COMBAT_RULES.allySkillDamageCap);
    if (a.errors.length) return { errors: a.errors };
    return { value: { [input.output]: item, ...(value.targetId !== undefined ? { targetId: value.targetId } : {}) }, diagnostics: a.diagnostics };
}

const textOr = (raw, fallback, max) => (String(raw || '').trim() || String(fallback || '')).slice(0, max);

// equip-to-passive：{ template:"被动模板键" } → equip 载荷；名称、部位、gearId 由程序给定，宝物按 rare 口径加强。
// 带 input.rarity（D7）：{ ability:"六维键", template?:"被动模板键" } → 六维加成按稀有度（+1…+5）；
// 被动只在 input.templates 存在（程序已按装备 ID 抽中）时出现，只能从候选里选，强度按装备稀有度（passiveAtRarity），宝物不再另加强。
export function assembleGear(value, { key, input }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const gearId = gearIdFor(input.name);
    const name = String(input.name || '').trim().slice(0, 20);
    if (input.rarity) {
        const ability = abilityKeyOf(value.ability);
        if (!ability || !ABILITY_KEYS.includes(ability)) a.fail('ability', 'invalid-ability', { allowed: [...ABILITY_KEYS] });
        const withPassive = Array.isArray(input.templates) && input.templates.length > 0;
        const tpl = withPassive ? templateKey(value.template, 'template', a, candidateTable(GEAR_PASSIVE_TEMPLATES, input.templates)) : null;
        if (a.errors.length) return { errors: a.errors };
        const passive = tpl ? { id: `${gearId}-p`, name, ...passiveAtRarity(tpl, input.rarity) } : null;
        const bonus = { ability, amount: GEAR_BONUS_BY_RARITY[input.rarity] };
        return { value: { gearId, name, slot: input.slot, ...(passive ? { passive } : {}), description: textOr(input.description, passive?.description, 80), rarity: input.rarity, bonus }, diagnostics: a.diagnostics };
    }
    const tpl = templateKey(value.template, 'template', a, GEAR_PASSIVE_TEMPLATES);
    if (!tpl) return { errors: a.errors };
    const passive = { id: `${gearId}-p`, name, ...gearPassiveFromTemplate(tpl, input.slot) };
    return { value: { gearId, name, slot: input.slot, passive, description: textOr(input.description, passive.description, 80) }, diagnostics: a.diagnostics };
}

// item-to-consumable：{ template:"道具模板键" } → item 载荷；数量取标签，itemId 由名称推导。
// 带 input.rarity 时只能选 input.templates 里的候选，数值按稀有度放大（itemAtRarity，D8）；载荷形状不变。
export function assembleItem(value, { key, input }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const rarity = input.rarity;
    const tpl = templateKey(value.template, 'template', a, rarity ? candidateTable(ITEM_TEMPLATES, input.templates) : ITEM_TEMPLATES);
    if (!tpl) return { errors: a.errors };
    const made = rarity ? itemAtRarity(tpl, rarity) : itemFromTemplate(tpl);
    const name = String(input.name || '').trim().slice(0, 20);
    return { value: { itemId: itemIdFor(input.name), name, count: input.count, effects: made.effects, description: textOr(input.description, made.description, 80) }, diagnostics: a.diagnostics };
}

// trait（人物特性，P-d）：{ name, template:"被动模板键", origin } → 特性；traitId 与稀有度由程序给定（fixed），被动按稀有度加强（passiveAtRarity）。
// v4 特性池（trait-pool.js）：fixed.shape 存在时效果已由程序抽定（主动技能或被动），模型只回 name 与 origin，template 不读。
export function assembleTrait(value, { key, fixed = {} } = {}) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const shape = fixed.shape || null;
    const name = nameOf(value.name, 'name', a, 20);
    const tpl = shape ? null : templateKey(value.template, 'template', a, GEAR_PASSIVE_TEMPLATES);
    if (!name || (!shape && !tpl)) return { errors: a.errors };
    const origin = typeof value.origin === 'string' ? value.origin.trim() : '';
    if (origin.length > REWARD_ORIGIN_MAX) a.note('origin', origin.length, REWARD_ORIGIN_MAX);
    const head = { traitId: fixed.traitId, name, origin: origin.slice(0, REWARD_ORIGIN_MAX), rarity: fixed.rarity };
    const copy = (v) => JSON.parse(JSON.stringify(v));
    if (shape?.kind === 'active') {
        const { cost, effects, description } = shape.skill;
        return { value: { ...head, kind: 'active', skill: { id: `${fixed.traitId}-s`, name, cost, effects: copy(effects), description } }, diagnostics: a.diagnostics };
    }
    const passive = { id: `${fixed.traitId}-p`, name, ...(shape ? copy(shape.passive) : passiveAtRarity(tpl, fixed.rarity)) };
    // v4：新抽到的特性带 kind（合计上限按固有 + 抽到的计，traits.js）。
    return { value: { ...head, kind: 'passive', passive }, diagnostics: a.diagnostics };
}

// battle-reward：{ slots:[["名称","模板键","来历"], …], reserve:[…] }，与 input.slots / input.reserve 逐位对应 → offer 槽位。
// 类别、稀有度、费用、部位与数量由 planRewardSlots 给定；卡牌 ID 由种子与槽位推导（备用套用派生种子），重试不变；杂物只有名称与来历，模板键填 null。
const rewardIdFor = (seed, index, prefix) => `${prefix}-${hashString(`${seed}|${index}`)}`;

function rewardSlotOf(raw, path, a, slot, seed) {
    const t = tupleOf(raw, path, a, ['name', 'template', 'origin']);
    if (!t) return undefined;
    const [nameRaw, tplRaw, originRaw] = t;
    const paths = [at(path, 0), at(path, 1), at(path, 2)];
    const origin = typeof originRaw === 'string' ? originRaw.trim() : '';
    if (origin.length > REWARD_ORIGIN_MAX) a.note(paths[2], origin.length, REWARD_ORIGIN_MAX);
    const head = { index: slot.index, kind: slot.kind, rarity: slot.rarity, origin: origin.slice(0, REWARD_ORIGIN_MAX) };
    if (slot.kind === 'card') {
        const card = buildCard(nameRaw, tplRaw, undefined, [paths[0], paths[1], `${path}.cost`], a, { id: rewardIdFor(seed, slot.index, 'rc'), rarity: slot.rarity, slot: slot.cost });
        return card ? { ...head, name: card.name, card } : undefined;
    }
    const name = nameOf(nameRaw, paths[0], a, 20);
    const table = slot.kind === 'gear' ? GEAR_PASSIVE_TEMPLATES : slot.kind === 'item' ? ITEM_TEMPLATES : null;
    const tpl = table ? templateKey(tplRaw, paths[1], a, table) : null;
    if (!name || (table && !tpl)) return undefined;
    if (slot.kind === 'gear') {
        const gearId = gearIdFor(name);
        const passive = { id: `${gearId}-p`, name, ...passiveAtRarity(tpl, slot.rarity) };
        return { ...head, name, gear: { gearId, name, slot: slot.gearSlot, passive, description: passive.description } };
    }
    if (slot.kind === 'item') {
        const made = itemFromTemplate(tpl);
        return { ...head, name, item: { itemId: itemIdFor(name), name, count: slot.count, effects: made.effects, description: made.description } };
    }
    return { ...head, name };
}

export function assembleReward(value, { key, input }) {
    const bad = requireObject(value);
    if (bad) return bad;
    const a = createAssembly(key);
    const setOf = (field, seed) => {
        const planned = Array.isArray(input?.[field]) ? input[field] : [];
        return listOf(value[field], field, a, planned.length, planned.length, (raw, path, i) => rewardSlotOf(raw, path, a, planned[i], seed));
    };
    const slots = setOf('slots', input?.seed);
    // 备用套：只在计划里有 reserve 时要求模型给出；卡牌 ID 用派生种子，与主套同位不重复。
    const reserve = Array.isArray(input?.reserve) ? setOf('reserve', `${input.seed}|reserve`) : undefined;
    if (a.errors.length) return { errors: a.errors };
    return { value: { slots, ...(reserve ? { reserve } : {}) }, diagnostics: a.diagnostics };
}


