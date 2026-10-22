import { BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES, evaluateCardBudget } from './rules.js';
import { hashString } from './random.js';

export const SCHEMA_VERSION = 1;
export const EFFECT_OPS = Object.freeze(['damage', 'block', 'heal', 'draw', 'energy', 'status', 'exhaust-self', 'conditional']);
export const STATUSES = Object.freeze(['vulnerable', 'weak', 'strength', 'dexterity', 'poison', 'regen', 'thorns']);
export const OFFENSE_TARGETS = Object.freeze(['enemy', 'all-enemies', 'random-enemy']);
export const SUPPORT_TARGETS = Object.freeze(['self', 'ally', 'all-allies']);
export const CARD_TYPES = Object.freeze(['attack', 'skill', 'power']);
export const RARITIES = Object.freeze(['basic', 'common', 'uncommon', 'rare', 'personal']);
export const CARD_COSTS = Object.freeze([0, 1, 2, 3, 'X']);
export const SKILL_INTENTS = Object.freeze(['attack', 'defend', 'buff', 'debuff', 'heal', 'special']);
export const PASSIVE_TRIGGERS = Object.freeze(['battle-start', 'turn-start', 'turn-end', 'on-hit', 'on-low-hp']);
export const PROFILE_KINDS = Object.freeze(['class', 'deck-character', 'skill-character', 'enemy']);
export const LEDGER_TYPES = Object.freeze(['profile', 'exp', 'learn', 'upgrade', 'class', 'reward', 'deck', 'revoke']);

const ALL_TARGETS = Object.freeze([...OFFENSE_TARGETS, ...SUPPORT_TARGETS]);
const SELF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns']);
const CONDITION_KINDS = Object.freeze(['target-has', 'self-hp-below', 'cards-played-gte']);
const POOL_RARITIES = Object.freeze(['common', 'uncommon', 'rare']);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ENTRY_ID_RE = /^[A-Za-z0-9_|:.-]{1,200}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const join = (path, key) => (path ? `${path}.${key}` : String(key));

function fail(ctx, path, reason, detail) {
    ctx.errors.push(detail === undefined ? { path, reason } : { path, reason, detail });
    return undefined;
}

function checkKeys(raw, allowed, path, ctx) {
    for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail(ctx, join(path, key), 'unknown-field');
}

function int(raw, path, ctx, min, max, fallback) {
    if (raw === undefined && fallback !== undefined) return fallback;
    if (!Number.isInteger(raw) || raw < min || raw > max) return fail(ctx, path, 'out-of-range', { min, max });
    return raw;
}

function text(raw, path, ctx, max, fallback) {
    if ((raw === undefined || raw === '') && fallback !== undefined) return fallback;
    if (typeof raw !== 'string' || !raw.trim()) return fail(ctx, path, 'required-text');
    const value = raw.trim();
    if (value.length > max) return fail(ctx, path, 'too-long', { max });
    return value;
}

function oneOf(raw, path, ctx, allowed, fallback) {
    if (raw === undefined && fallback !== undefined) return fallback;
    if (!allowed.includes(raw)) return fail(ctx, path, 'invalid-enum', { allowed: [...allowed] });
    return raw;
}

function list(raw, path, ctx, min, max, item) {
    if (!Array.isArray(raw)) return fail(ctx, path, 'expected-array');
    if (raw.length < min || raw.length > max) return fail(ctx, path, 'length-out-of-range', { min, max, size: raw.length });
    return raw.map((entry, i) => item(entry, `${path}[${i}]`, ctx));
}

function idOf(raw, path, ctx, re = ID_RE) {
    if (typeof raw !== 'string' || !re.test(raw)) return fail(ctx, path, 'invalid-id');
    return raw;
}

function objectAt(raw, path, ctx) {
    if (!isObj(raw)) return fail(ctx, path, 'expected-object');
    return raw;
}

function run(fn, raw) {
    const ctx = { errors: [] };
    const value = fn(raw, '', ctx);
    return ctx.errors.length ? { ok: false, errors: ctx.errors } : { ok: true, value, errors: [] };
}

function conditionAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    checkKeys(raw, ['kind', 'value'], path, ctx);
    const kind = oneOf(raw.kind, join(path, 'kind'), ctx, CONDITION_KINDS);
    const valuePath = join(path, 'value');
    if (kind === 'target-has') return { kind, value: oneOf(raw.value, valuePath, ctx, STATUSES) };
    if (kind === 'self-hp-below') return { kind, value: int(raw.value, valuePath, ctx, 1, 99) };
    if (kind === 'cards-played-gte') return { kind, value: int(raw.value, valuePath, ctx, 1, 10) };
    return undefined;
}

function effectAt(raw, path, ctx, depth = 0) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const op = oneOf(raw.op, join(path, 'op'), ctx, EFFECT_OPS);
    const p = (key) => join(path, key);
    switch (op) {
        case 'damage':
            checkKeys(raw, ['op', 'amount', 'hits', 'target'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 99), hits: int(raw.hits, p('hits'), ctx, 1, 5, 1), target: oneOf(raw.target, p('target'), ctx, OFFENSE_TARGETS, 'enemy') };
        case 'block':
            checkKeys(raw, ['op', 'amount', 'target'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 99), target: oneOf(raw.target, p('target'), ctx, SUPPORT_TARGETS, 'self') };
        case 'heal':
            checkKeys(raw, ['op', 'amount', 'target'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 60), target: oneOf(raw.target, p('target'), ctx, SUPPORT_TARGETS, 'self') };
        case 'draw':
            checkKeys(raw, ['op', 'amount'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 5) };
        case 'energy':
            checkKeys(raw, ['op', 'amount'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 3) };
        case 'status': {
            checkKeys(raw, ['op', 'status', 'stacks', 'target'], path, ctx);
            const status = oneOf(raw.status, p('status'), ctx, STATUSES);
            const fallback = SELF_STATUSES.has(status) ? 'self' : 'enemy';
            return { op, status, stacks: int(raw.stacks, p('stacks'), ctx, 1, 10), target: oneOf(raw.target, p('target'), ctx, ALL_TARGETS, fallback) };
        }
        case 'exhaust-self':
            checkKeys(raw, ['op'], path, ctx);
            return { op };
        case 'conditional': {
            checkKeys(raw, ['op', 'when', 'then'], path, ctx);
            if (depth > 0) return fail(ctx, path, 'nested-conditional');
            const when = conditionAt(raw.when, p('when'), ctx);
            const then = list(raw.then, p('then'), ctx, 1, 3, (e, ep, c) => effectAt(e, ep, c, depth + 1));
            return { op, when, then };
        }
        default:
            return undefined;
    }
}

export function effectsDamage(effects) {
    let total = 0;
    for (const effect of Array.isArray(effects) ? effects : []) {
        if (effect?.op === 'damage') total += effect.amount * (effect.hits || 1);
        else if (effect?.op === 'conditional') total += effectsDamage(effect.then);
    }
    return total;
}

function cardAt(raw, path, ctx, rarities = RARITIES) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const before = ctx.errors.length;
    const p = (key) => join(path, key);
    checkKeys(raw, ['id', 'name', 'type', 'cost', 'rarity', 'effects', 'upgraded', 'flavor', 'skillRef', 'retain'], path, ctx);
    const name = text(raw.name, p('name'), ctx, 20);
    const card = {
        id: idOf(raw.id, p('id'), ctx),
        name,
        type: oneOf(raw.type, p('type'), ctx, CARD_TYPES),
        cost: oneOf(raw.cost, p('cost'), ctx, CARD_COSTS),
        rarity: oneOf(raw.rarity, p('rarity'), ctx, rarities),
        effects: list(raw.effects, p('effects'), ctx, 1, 4, effectAt),
        flavor: text(raw.flavor, p('flavor'), ctx, 80, ''),
        skillRef: text(raw.skillRef, p('skillRef'), ctx, 20, name || ''),
    };
    if (raw.retain !== undefined) {
        if (typeof raw.retain !== 'boolean') fail(ctx, p('retain'), 'expected-boolean');
        else if (raw.retain) card.retain = true;
    }
    if (raw.upgraded !== undefined && objectAt(raw.upgraded, p('upgraded'), ctx)) {
        const up = p('upgraded');
        checkKeys(raw.upgraded, ['cost', 'effects'], up, ctx);
        const upgraded = {};
        if (raw.upgraded.cost !== undefined) upgraded.cost = oneOf(raw.upgraded.cost, join(up, 'cost'), ctx, CARD_COSTS);
        if (raw.upgraded.effects !== undefined) upgraded.effects = list(raw.upgraded.effects, join(up, 'effects'), ctx, 1, 4, effectAt);
        if (raw.upgraded.cost === undefined && raw.upgraded.effects === undefined) fail(ctx, up, 'empty-upgrade');
        card.upgraded = upgraded;
    }
    if (ctx.errors.length === before) {
        const budget = evaluateCardBudget(card);
        if (!budget.ok) fail(ctx, join(path, budget.path), budget.reason, budget.detail);
    }
    return card;
}

function skillAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['id', 'name', 'intent', 'effects', 'weight', 'cooldown', 'description'], path, ctx);
    return {
        id: idOf(raw.id, p('id'), ctx),
        name: text(raw.name, p('name'), ctx, 20),
        intent: oneOf(raw.intent, p('intent'), ctx, SKILL_INTENTS),
        effects: list(raw.effects, p('effects'), ctx, 1, 4, effectAt),
        weight: int(raw.weight, p('weight'), ctx, 1, 10, 1),
        cooldown: int(raw.cooldown, p('cooldown'), ctx, 0, 5, 0),
        description: text(raw.description, p('description'), ctx, 80, ''),
    };
}

function passiveAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['id', 'name', 'trigger', 'effects', 'description'], path, ctx);
    return {
        id: idOf(raw.id, p('id'), ctx),
        name: text(raw.name, p('name'), ctx, 20),
        trigger: oneOf(raw.trigger, p('trigger'), ctx, PASSIVE_TRIGGERS),
        effects: list(raw.effects, p('effects'), ctx, 1, 3, effectAt),
        description: text(raw.description, p('description'), ctx, 80, ''),
    };
}

function phaseAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['hpBelowPct', 'addSkills', 'removeSkills', 'passives'], path, ctx);
    return {
        hpBelowPct: int(raw.hpBelowPct, p('hpBelowPct'), ctx, 10, 90),
        addSkills: raw.addSkills === undefined ? [] : list(raw.addSkills, p('addSkills'), ctx, 0, 3, skillAt),
        removeSkills: raw.removeSkills === undefined ? [] : list(raw.removeSkills, p('removeSkills'), ctx, 0, 3, (v, vp, c) => idOf(v, vp, c)),
        passives: raw.passives === undefined ? [] : list(raw.passives, p('passives'), ctx, 0, 2, passiveAt),
    };
}

function aliasesAt(raw, path, ctx) {
    if (raw === undefined) return [];
    const values = list(raw, path, ctx, 0, 5, (v, vp, c) => text(v, vp, c, 20));
    return Array.isArray(values) ? [...new Set(values.filter(Boolean))] : [];
}

function uniqueIds(items, path, ctx) {
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item, i) => {
        if (!item?.id) return;
        if (seen.has(item.id)) fail(ctx, `${path}[${i}].id`, 'duplicate-id');
        seen.add(item.id);
    });
}

function capDamage(items, path, ctx, cap) {
    (Array.isArray(items) ? items : []).forEach((item, i) => {
        const damage = effectsDamage(item?.effects);
        if (damage > cap) fail(ctx, `${path}[${i}].effects`, 'damage-cap', { damage, cap });
    });
}

const poolCard = (rarities) => (v, vp, c) => cardAt(v, vp, c, rarities);

function classProfileAt(raw, path, ctx) {
    checkKeys(raw, ['kind', 'v', 'id', 'className', 'archetype', 'classPassive', 'classPool'], path, ctx);
    const profile = {
        kind: 'class',
        v: SCHEMA_VERSION,
        id: idOf(raw.id, join(path, 'id'), ctx),
        className: text(raw.className, join(path, 'className'), ctx, 12),
        archetype: oneOf(raw.archetype, join(path, 'archetype'), ctx, Object.keys(COMBAT_RULES.archetypes)),
        classPassive: passiveAt(raw.classPassive, join(path, 'classPassive'), ctx),
        classPool: list(raw.classPool, join(path, 'classPool'), ctx, 8, 16, poolCard(POOL_RARITIES)),
    };
    uniqueIds(profile.classPool, join(path, 'classPool'), ctx);
    return profile;
}

function deckCharacterAt(raw, path, ctx) {
    checkKeys(raw, ['kind', 'v', 'id', 'name', 'aliases', 'classRef', 'base', 'growth', 'personalPassive', 'personalPool', 'starterDeck'], path, ctx);
    const base = objectAt(raw.base, join(path, 'base'), ctx) || {};
    if (isObj(raw.base)) checkKeys(raw.base, ['hp', 'energy', 'draw'], join(path, 'base'), ctx);
    const growth = isObj(raw.growth) ? raw.growth : {};
    if (raw.growth !== undefined && objectAt(raw.growth, join(path, 'growth'), ctx)) checkKeys(raw.growth, ['hpPerLevel'], join(path, 'growth'), ctx);
    const profile = {
        kind: 'deck-character',
        v: SCHEMA_VERSION,
        id: idOf(raw.id, join(path, 'id'), ctx),
        name: text(raw.name, join(path, 'name'), ctx, 20),
        aliases: aliasesAt(raw.aliases, join(path, 'aliases'), ctx),
        classRef: idOf(raw.classRef, join(path, 'classRef'), ctx),
        base: {
            hp: int(base.hp, join(path, 'base.hp'), ctx, 40, 120),
            energy: int(base.energy, join(path, 'base.energy'), ctx, 3, 4, COMBAT_RULES.energyPerTurn),
            draw: int(base.draw, join(path, 'base.draw'), ctx, 4, 6, COMBAT_RULES.drawPerTurn),
        },
        growth: { hpPerLevel: int(growth.hpPerLevel, join(path, 'growth.hpPerLevel'), ctx, 1, 8, 4) },
        personalPassive: passiveAt(raw.personalPassive, join(path, 'personalPassive'), ctx),
        personalPool: list(raw.personalPool, join(path, 'personalPool'), ctx, 4, 8, poolCard(['personal', ...POOL_RARITIES])),
        starterDeck: list(raw.starterDeck, join(path, 'starterDeck'), ctx, COMBAT_RULES.starterDeckSize, COMBAT_RULES.starterDeckSize, (v, vp, c) => idOf(v, vp, c)),
    };
    uniqueIds(profile.personalPool, join(path, 'personalPool'), ctx);
    return profile;
}

function skillCharacterAt(raw, path, ctx) {
    checkKeys(raw, ['kind', 'v', 'id', 'name', 'aliases', 'className', 'base', 'skills', 'passives'], path, ctx);
    const base = objectAt(raw.base, join(path, 'base'), ctx) || {};
    if (isObj(raw.base)) checkKeys(raw.base, ['hp'], join(path, 'base'), ctx);
    const profile = {
        kind: 'skill-character',
        v: SCHEMA_VERSION,
        id: idOf(raw.id, join(path, 'id'), ctx),
        name: text(raw.name, join(path, 'name'), ctx, 20),
        aliases: aliasesAt(raw.aliases, join(path, 'aliases'), ctx),
        className: text(raw.className, join(path, 'className'), ctx, 12, ''),
        base: { hp: int(base.hp, join(path, 'base.hp'), ctx, 20, 120) },
        skills: list(raw.skills, join(path, 'skills'), ctx, 3, 5, skillAt),
        passives: list(raw.passives, join(path, 'passives'), ctx, 1, 2, passiveAt),
    };
    uniqueIds(profile.skills, join(path, 'skills'), ctx);
    capDamage(profile.skills, join(path, 'skills'), ctx, COMBAT_RULES.allySkillDamageCap);
    return profile;
}
function enemyAt(raw, path, ctx) {
    checkKeys(raw, ['kind', 'v', 'id', 'name', 'tier', 'base', 'skills', 'passives', 'phases', 'generated'], path, ctx);
    const base = objectAt(raw.base, join(path, 'base'), ctx) || {};
    if (isObj(raw.base)) checkKeys(raw.base, ['hp'], join(path, 'base'), ctx);
    const tier = oneOf(raw.tier, join(path, 'tier'), ctx, Object.keys(COMBAT_RULES.tiers));
    const tierRule = COMBAT_RULES.tiers[tier];
    const hpMax = tierRule ? Math.round(tierRule.hp * 1.5) : 999;
    const hpMin = tierRule ? Math.round(tierRule.hp * 0.5) : 1;
    const profile = {
        kind: 'enemy',
        v: SCHEMA_VERSION,
        id: idOf(raw.id, join(path, 'id'), ctx),
        name: text(raw.name, join(path, 'name'), ctx, 20),
        tier,
        base: { hp: int(base.hp, join(path, 'base.hp'), ctx, hpMin, hpMax) },
        skills: list(raw.skills, join(path, 'skills'), ctx, 2, 5, skillAt),
        passives: raw.passives === undefined ? [] : list(raw.passives, join(path, 'passives'), ctx, 0, 2, passiveAt),
        phases: raw.phases === undefined ? [] : list(raw.phases, join(path, 'phases'), ctx, 0, 2, phaseAt),
        generated: raw.generated === false ? false : true,
    };
    uniqueIds(profile.skills, join(path, 'skills'), ctx);
    if (tierRule) {
        capDamage(profile.skills, join(path, 'skills'), ctx, tierRule.damageCap);
        (profile.phases || []).forEach((phase, i) => capDamage(phase?.addSkills, join(path, `phases[${i}].addSkills`), ctx, tierRule.damageCap));
    }
    if (tier === 'boss' && !(profile.phases || []).length) fail(ctx, join(path, 'phases'), 'boss-needs-phase');
    return profile;
}

function profileAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    if (raw.v !== undefined && raw.v !== SCHEMA_VERSION) return fail(ctx, join(path, 'v'), 'unsupported-version', { supported: SCHEMA_VERSION });
    const kind = oneOf(raw.kind, join(path, 'kind'), ctx, PROFILE_KINDS);
    if (kind === 'class') return classProfileAt(raw, path, ctx);
    if (kind === 'deck-character') return deckCharacterAt(raw, path, ctx);
    if (kind === 'skill-character') return skillCharacterAt(raw, path, ctx);
    if (kind === 'enemy') return enemyAt(raw, path, ctx);
    return undefined;
}

export function normalizeProfile(raw) {
    return run(profileAt, raw);
}

export function normalizeCard(raw) {
    return run((value, path, ctx) => cardAt(value, path, ctx), raw);
}

export function normalizeSkill(raw) {
    return run(skillAt, raw);
}

export function buildCardCatalog(character, classProfile) {
    const catalog = new Map(Object.entries(BASIC_CARDS));
    for (const card of classProfile?.classPool || []) catalog.set(card.id, card);
    for (const card of character?.personalPool || []) catalog.set(card.id, card);
    return catalog;
}

export function validateStarterDeck(character, classProfile) {
    const errors = [];
    if (!classProfile || classProfile.kind !== 'class') return { ok: false, errors: [{ path: 'classRef', reason: 'class-missing' }] };
    if (character.classRef !== classProfile.id) errors.push({ path: 'classRef', reason: 'class-mismatch' });
    const classIds = new Set(classProfile.classPool.map((card) => card.id));
    const personalIds = new Set(character.personalPool.map((card) => card.id));
    for (const id of personalIds) {
        if (classIds.has(id) || BASIC_CARDS[id]) errors.push({ path: 'personalPool', reason: 'id-collision', cardId: id });
    }
    const counts = { basicAttack: 0, basicDefend: 0, classCards: 0, personalCards: 0 };
    const copies = new Map();
    character.starterDeck.forEach((id, i) => {
        copies.set(id, (copies.get(id) || 0) + 1);
        if (id === BASIC_STRIKE_ID) counts.basicAttack += 1;
        else if (id === BASIC_DEFEND_ID) counts.basicDefend += 1;
        else if (classIds.has(id)) counts.classCards += 1;
        else if (personalIds.has(id)) counts.personalCards += 1;
        else errors.push({ path: `starterDeck[${i}]`, reason: 'unknown-card', cardId: id });
    });
    for (const [key, expected] of Object.entries(COMBAT_RULES.starterDeckShape)) {
        if (counts[key] !== expected) errors.push({ path: 'starterDeck', reason: 'starter-shape', detail: { slot: key, expected, actual: counts[key] } });
    }
    for (const [id, count] of copies) {
        if (count > COMBAT_RULES.copyLimit) errors.push({ path: 'starterDeck', reason: 'copy-limit', cardId: id, detail: { count } });
    }
    return { ok: errors.length === 0, errors };
}

function anchorAt(raw, path, ctx, required) {
    if (raw === null || raw === undefined) return required ? fail(ctx, path, 'anchor-required') : null;
    if (!objectAt(raw, path, ctx)) return undefined;
    checkKeys(raw, ['messageId', 'swipeId', 'tagHash', 'occurrence'], path, ctx);
    return {
        messageId: int(raw.messageId, join(path, 'messageId'), ctx, 0, 1e7),
        swipeId: int(raw.swipeId, join(path, 'swipeId'), ctx, 0, 1e4, 0),
        tagHash: idOf(raw.tagHash, join(path, 'tagHash'), ctx),
        occurrence: int(raw.occurrence, join(path, 'occurrence'), ctx, 0, 1e4, 0),
    };
}

function payloadAt(type, raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    switch (type) {
        case 'profile':
            return profileAt(raw, path, ctx);
        case 'exp':
            checkKeys(raw, ['amount', 'reason'], path, ctx);
            return { amount: int(raw.amount, p('amount'), ctx, 1, 1000), reason: text(raw.reason, p('reason'), ctx, 80, '') };
        case 'learn':
        case 'upgrade': {
            checkKeys(raw, type === 'learn' ? ['card', 'skill'] : ['targetId', 'card', 'skill'], path, ctx);
            const out = {};
            if (type === 'upgrade') out.targetId = idOf(raw.targetId, p('targetId'), ctx);
            if (raw.card !== undefined && raw.skill !== undefined) fail(ctx, path, 'card-or-skill');
            if (raw.card !== undefined) out.card = cardAt(raw.card, p('card'), ctx);
            else if (raw.skill !== undefined) out.skill = skillAt(raw.skill, p('skill'), ctx);
            else if (type === 'learn') fail(ctx, path, 'card-or-skill');
            return out;
        }
        case 'class':
            checkKeys(raw, ['classRef'], path, ctx);
            return { classRef: idOf(raw.classRef, p('classRef'), ctx) };
        case 'reward': {
            checkKeys(raw, ['level', 'choice'], path, ctx);
            const choice = objectAt(raw.choice, p('choice'), ctx) || {};
            const kind = oneOf(choice.kind, p('choice.kind'), ctx, ['card', 'upgrade', 'skip']);
            const out = { level: int(raw.level, p('level'), ctx, 2, COMBAT_RULES.maxLevel), choice: { kind } };
            if (kind === 'card' || kind === 'upgrade') {
                checkKeys(choice, ['kind', kind === 'card' ? 'cardId' : 'targetId'], p('choice'), ctx);
                const key = kind === 'card' ? 'cardId' : 'targetId';
                out.choice[key] = idOf(choice[key], p(`choice.${key}`), ctx);
            } else if (kind === 'skip') checkKeys(choice, ['kind'], p('choice'), ctx);
            return out;
        }
        case 'deck': {
            checkKeys(raw, ['cards', 'revision'], path, ctx);
            return {
                cards: list(raw.cards, p('cards'), ctx, COMBAT_RULES.deckMin, COMBAT_RULES.deckMax, (v, vp, c) => idOf(v, vp, c)),
                revision: int(raw.revision, p('revision'), ctx, 0, 1e9),
            };
        }
        case 'revoke':
            checkKeys(raw, ['targetEntryId', 'reason'], path, ctx);
            return { targetEntryId: idOf(raw.targetEntryId, p('targetEntryId'), ctx, ENTRY_ID_RE), reason: text(raw.reason, p('reason'), ctx, 80, '') };
        default:
            return undefined;
    }
}

const ANCHORLESS_TYPES = new Set(['profile', 'revoke']);

function ledgerEntryAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    checkKeys(raw, ['id', 'type', 'character', 'anchor', 'payload', 'createdAt'], path, ctx);
    const type = oneOf(raw.type, join(path, 'type'), ctx, LEDGER_TYPES);
    const entry = {
        id: idOf(raw.id, join(path, 'id'), ctx, ENTRY_ID_RE),
        type,
        character: idOf(raw.character, join(path, 'character'), ctx),
        anchor: anchorAt(raw.anchor, join(path, 'anchor'), ctx, type !== undefined && !ANCHORLESS_TYPES.has(type)),
        payload: type === undefined ? undefined : payloadAt(type, raw.payload, join(path, 'payload'), ctx),
        createdAt: int(raw.createdAt, join(path, 'createdAt'), ctx, 0, Number.MAX_SAFE_INTEGER),
    };
    if (type === 'profile' && entry.payload?.id && entry.payload.id !== entry.character) fail(ctx, join(path, 'character'), 'profile-id-mismatch');
    return entry;
}

export function normalizeLedgerEntry(raw) {
    return run(ledgerEntryAt, raw);
}

export function ledgerEntryId(type, character, anchor) {
    if (!anchor) return `${type}|${character}`;
    return [type, character, anchor.messageId, anchor.swipeId, anchor.tagHash, anchor.occurrence].join('|');
}

export function profileIdFor(kind, name) {
    const prefix = { class: 'cls', 'deck-character': 'pc', 'skill-character': 'sc', enemy: 'en' }[kind] || 'x';
    return `${prefix}-${hashString(String(name || '').trim().toLowerCase())}`;
}


