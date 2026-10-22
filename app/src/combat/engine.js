import { COMBAT_RULES } from './rules.js';
import { hash32, nextRandom, randomInt } from './random.js';
import {
    LOW_HP_RATIO, canAfford, cardView, computeBlock, computeDamage, conditionHolds,
    effectsNeedTarget, livingIds, lowestRatioId, opposite, weakestId,
} from './battle-state.js';
import { chooseAllyPlay, chooseSkillIntent } from './policy.js';

export const ENGINE_VERSION = 1;
const MAX_AUTO_PLAYS = 30;
const MAX_PASSIVE_DEPTH = 2;
const SIDES = Object.freeze(['ally', 'enemy']);
const UNIT_KINDS = Object.freeze(['deck', 'skill']);
const ACTION_TYPES = Object.freeze(['play', 'end-turn', 'escape']);
const DECAYING = Object.freeze(['vulnerable', 'weak']);
const UNIT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const deckCardId = (entry) => (typeof entry === 'string' ? entry : entry?.cardId);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const safeId = (id) => typeof id === 'string' && id.length > 0 && !RESERVED_IDS.has(id);
const emit = (c, event) => { c.events.push({ turn: c.s.turn, ...event }); };

function reject(state, reason, detail) {
    return { ok: false, state, events: [], error: detail === undefined ? { reason } : { reason, detail } };
}

export function seedFor(combatId) {
    return hash32(`igs-combat:${combatId ?? ''}`);
}

function roll(s, n) {
    const { value, state } = randomInt(s.rng, n);
    s.rng = state;
    return value;
}

function rollFloat(s) {
    const { value, state } = nextRandom(s.rng);
    s.rng = state;
    return value;
}

function shuffleInPlace(s, items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = roll(s, i + 1);
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

function setStatus(unit, key, value) {
    if (value > 0) unit.statuses[key] = value;
    else delete unit.statuses[key];
}

const SELF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns']);
const DEFAULT_TARGET = Object.freeze({ damage: 'enemy', block: 'self', heal: 'self' });

function targetSpec(effect) {
    if (effect.target) return effect.target;
    if (effect.op === 'status') return SELF_STATUSES.has(effect.status) ? 'self' : 'enemy';
    return DEFAULT_TARGET[effect.op] || 'self';
}

function catalogObject(catalog) {
    if (catalog instanceof Map) return Object.fromEntries(catalog);
    return catalog && typeof catalog === 'object' ? catalog : {};
}

function unitError(u, path) {
    if (!SIDES.includes(u.side)) return { reason: 'invalid-side', detail: { path } };
    if (!UNIT_KINDS.includes(u.kind)) return { reason: 'invalid-kind', detail: { path } };
    if (u.side === 'enemy' && u.kind !== 'skill') return { reason: 'enemy-must-use-skills', detail: { path } };
    if (!isInt(u.maxHp, 1, 9999)) return { reason: 'invalid-hp', detail: { path } };
    if (u.hp !== undefined && !isInt(u.hp, 1, u.maxHp)) return { reason: 'invalid-hp', detail: { path } };
    const badScale = u.damageScale !== undefined && !(typeof u.damageScale === 'number' && u.damageScale > 0 && u.damageScale <= 5);
    if ((u.energy !== undefined && !isInt(u.energy, 0, 10)) || (u.draw !== undefined && !isInt(u.draw, 0, 10)) || badScale) {
        return { reason: 'invalid-stat', detail: { path } };
    }
    if (u.kind === 'skill') {
        if (!Array.isArray(u.skills) || !u.skills.length) return { reason: 'missing-skills', detail: { path } };
        const phaseSkills = (Array.isArray(u.phases) ? u.phases : []).flatMap((phase) => phase?.addSkills || []);
        const bad = [...u.skills, ...phaseSkills].find((skill) => !safeId(skill?.id) || !Array.isArray(skill.effects));
        return bad === undefined ? null : { reason: 'invalid-skill', detail: { path } };
    }
    if (!Array.isArray(u.deck) || !u.deck.length) return { reason: 'empty-deck', detail: { path } };
    const catalog = catalogObject(u.catalog);
    for (const entry of u.deck) {
        const cardId = deckCardId(entry);
        if (!safeId(cardId) || !Object.hasOwn(catalog, cardId)) return { reason: 'unknown-card', detail: { path, cardId: cardId ?? null } };
    }
    return null;
}

function setupError(setup) {
    if (!setup || typeof setup !== 'object' || !Array.isArray(setup.units)) return { reason: 'invalid-setup' };
    if (setup.rulesVersion !== undefined && setup.rulesVersion !== COMBAT_RULES.version) {
        return { reason: 'rules-version-mismatch', detail: { expected: COMBAT_RULES.version, actual: setup.rulesVersion } };
    }
    const ids = new Set();
    for (const [i, u] of setup.units.entries()) {
        const path = `units[${i}]`;
        const badId = !u || typeof u.id !== 'string' || !UNIT_ID_RE.test(u.id) || RESERVED_IDS.has(u.id) || ids.has(u.id);
        if (badId) return { reason: 'invalid-unit-id', detail: { path } };
        ids.add(u.id);
        const error = unitError(u, path);
        if (error) return error;
    }
    const enemies = setup.units.filter((u) => u.side === 'enemy').length;
    if (!enemies || enemies === setup.units.length) return { reason: 'missing-side' };
    if (enemies > COMBAT_RULES.maxEnemies) return { reason: 'too-many-enemies', detail: { max: COMBAT_RULES.maxEnemies } };
    const controlled = setup.units.find((u) => u.id === setup.controlledId);
    if (!controlled || controlled.side !== 'ally' || controlled.kind !== 'deck') return { reason: 'invalid-controlled' };
    return null;
}

function targetsFor(c, actor, spec, primaryId) {
    const s = c.s;
    const foe = opposite(actor.side);
    const units = (ids) => ids.map((id) => s.units[id]);
    switch (spec) {
        case 'enemy': {
            if (primaryId == null) {
                const id = weakestId(s, foe);
                return id ? [s.units[id]] : [];
            }
            const t = Object.hasOwn(s.units, primaryId) ? s.units[primaryId] : null;
            return t?.alive && t.side === foe ? [t] : [];
        }
        case 'all-enemies': return units(livingIds(s, foe));
        case 'random-enemy': {
            const ids = livingIds(s, foe);
            return ids.length ? [s.units[ids[roll(s, ids.length)]]] : [];
        }
        case 'self': return actor.alive ? [actor] : [];
        case 'ally': {
            const id = lowestRatioId(s, actor.side);
            return id ? [s.units[id]] : [];
        }
        case 'all-allies': return units(livingIds(s, actor.side));
        default: return [];
    }
}

function finish(c, outcome) {
    if (c.s.outcome) return;
    c.s.outcome = outcome;
    c.s.phase = 'ended';
    emit(c, { type: 'battle-end', outcome });
}

function checkOutcome(c) {
    const s = c.s;
    if (s.outcome) return;
    if (!s.units[s.controlledId].alive) finish(c, 'defeat');
    else if (!livingIds(s, 'enemy').length) finish(c, 'victory');
}

function loseHp(c, unit, amount, source, kind, blockable) {
    if (c.s.outcome || !unit.alive || amount <= 0) return 0;
    const blocked = blockable ? Math.min(unit.block, amount) : 0;
    unit.block -= blocked;
    const hpLoss = Math.min(unit.hp, amount - blocked);
    unit.hp -= hpLoss;
    emit(c, { type: 'damage', kind, source, target: unit.id, amount, blocked, hpLoss });
    if (unit.hp <= 0) {
        unit.alive = false;
        unit.block = 0;
        delete c.s.intents[unit.id];
        emit(c, { type: 'defeated', unitId: unit.id });
    } else if (hpLoss > 0) {
        afterHpLoss(c, unit);
    }
    checkOutcome(c);
    return hpLoss;
}

function healUnit(c, unit, amount, source) {
    if (!unit.alive) return;
    const gained = Math.min(unit.maxHp - unit.hp, amount);
    unit.hp += gained;
    emit(c, { type: 'heal', source, target: unit.id, amount: gained });
}

function afterHpLoss(c, unit) {
    if (!unit.lowHpTriggered && unit.hp < unit.maxHp * LOW_HP_RATIO) {
        unit.lowHpTriggered = true;
        triggerPassives(c, unit, 'on-low-hp', null);
    }
    while (unit.alive && unit.phasesApplied < unit.phases.length
        && unit.hp * 100 < unit.maxHp * unit.phases[unit.phasesApplied].hpBelowPct) {
        applyPhase(c, unit, unit.phases[unit.phasesApplied]);
    }
}

function applyPhase(c, unit, phase) {
    unit.phasesApplied += 1;
    const removed = new Set(phase.removeSkills || []);
    const added = clone(phase.addSkills || []);
    const addedIds = new Set(added.map((k) => k.id));
    unit.skills = [...unit.skills.filter((k) => !removed.has(k.id) && !addedIds.has(k.id)), ...added];
    unit.passives = [...unit.passives, ...clone(phase.passives || [])];
    emit(c, { type: 'phase', unitId: unit.id, index: unit.phasesApplied });
    const intent = c.s.intents[unit.id];
    if (intent && !unit.skills.some((k) => k.id === intent.skillId)) pickIntent(c, unit);
}



function triggerPassives(c, unit, trigger, primaryId) {
    if (c.depth >= MAX_PASSIVE_DEPTH) return;
    c.depth += 1;
    for (const passive of unit.passives) {
        if (passive.trigger !== trigger || !unit.alive || c.s.outcome) continue;
        emit(c, { type: 'passive', unitId: unit.id, passiveId: passive.id, trigger });
        applyEffects(c, unit, passive.effects, primaryId, { unitId: unit.id, kind: 'passive', id: passive.id });
    }
    c.depth -= 1;
}

function applyEffects(c, actor, effects, primaryId, source) {
    for (const effect of effects || []) {
        if (c.s.outcome || !actor.alive) return;
        applyEffect(c, actor, effect, primaryId, source);
    }
}

function applyEffect(c, actor, e, primaryId, source) {
    const targets = () => targetsFor(c, actor, targetSpec(e), primaryId);
    switch (e.op) {
        case 'damage':
            applyDamage(c, actor, e, primaryId, source);
            return;
        case 'block':
            for (const t of targets()) {
                const gained = computeBlock(actor, e.amount);
                t.block += gained;
                emit(c, { type: 'block', source, target: t.id, amount: gained });
            }
            return;
        case 'heal':
            for (const t of targets()) healUnit(c, t, e.amount, source);
            return;
        case 'draw':
            if (actor.kind === 'deck') drawCards(c, actor, e.amount);
            return;
        case 'energy':
            if (actor.kind !== 'deck') return;
            actor.energy += e.amount;
            emit(c, { type: 'energy', unitId: actor.id, amount: e.amount });
            return;
        case 'status':
            for (const t of targets()) {
                setStatus(t, e.status, (t.statuses[e.status] || 0) + e.stacks);
                emit(c, { type: 'status', source, target: t.id, status: e.status, stacks: e.stacks });
            }
            return;
        case 'exhaust-self':
            if (source.kind === 'card') c.exhaust = true;
            return;
        case 'conditional':
            if (conditionHolds(c.s, actor, e.when, primaryId)) applyEffects(c, actor, e.then, primaryId, source);
            return;
        default:
    }
}

function applyDamage(c, actor, e, primaryId, source) {
    const spec = targetSpec(e);
    const struck = [];
    for (let hit = 0; hit < (e.hits || 1); hit += 1) {
        const targets = targetsFor(c, actor, spec, primaryId);
        if (!targets.length) break;
        for (const t of targets) {
            if (c.s.outcome || !actor.alive) return;
            if (!t.alive) continue;
            loseHp(c, t, computeDamage(actor, t, e.amount), source, 'attack', true);
            if (!struck.includes(t)) struck.push(t);
            const thorns = t.statuses.thorns || 0;
            if (thorns > 0 && t.id !== actor.id) loseHp(c, actor, thorns, { unitId: t.id, kind: 'status', id: 'thorns' }, 'thorns', true);
        }
    }
    for (const t of struck) if (t.alive && !c.s.outcome) triggerPassives(c, t, 'on-hit', actor.id);
}

function drawCards(c, unit, n) {
    const pile = c.s.piles[unit.id];
    let drawn = 0;
    for (let i = 0; i < n; i += 1) {
        if (pile.hand.length >= COMBAT_RULES.handLimit) break;
        if (!pile.draw.length) {
            if (!pile.discard.length) break;
            pile.draw = shuffleInPlace(c.s, pile.discard);
            pile.discard = [];
            emit(c, { type: 'reshuffle', unitId: unit.id, count: pile.draw.length });
        }
        pile.hand.push(pile.draw.pop());
        drawn += 1;
    }
    if (drawn) emit(c, { type: 'draw', unitId: unit.id, count: drawn });
}


function pickIntent(c, unit) {
    const intent = chooseSkillIntent(c.s, unit.id, rollFloat(c.s));
    if (!intent) {
        delete c.s.intents[unit.id];
        return;
    }
    c.s.intents[unit.id] = intent;
    emit(c, { type: 'intent', unitId: unit.id, skillId: intent.skillId, targetId: intent.targetId });
}

function useSkill(c, unit) {
    const s = c.s;
    const intent = s.intents[unit.id];
    const skill = intent && unit.skills.find((k) => k.id === intent.skillId);
    if (!skill) {
        pickIntent(c, unit);
        return;
    }
    let targetId = intent.targetId ?? null;
    if (targetId !== null && !s.units[targetId]?.alive) targetId = weakestId(s, opposite(unit.side));
    delete s.intents[unit.id];
    emit(c, { type: 'skill', unitId: unit.id, skillId: skill.id, name: skill.name, targetId });
    applyEffects(c, unit, skill.effects, targetId, { unitId: unit.id, kind: 'skill', id: skill.id });
    const cooldowns = s.cooldowns[unit.id];
    for (const key of Object.keys(cooldowns)) {
        if (cooldowns[key] > 1) cooldowns[key] -= 1;
        else delete cooldowns[key];
    }
    if (skill.cooldown > 0) cooldowns[skill.id] = skill.cooldown;
    const history = s.history[unit.id];
    history.push(skill.id);
    if (history.length > 4) history.shift();
    if (unit.alive && !s.outcome) pickIntent(c, unit);
}

function startSide(c, side) {
    const s = c.s;
    emit(c, { type: 'turn-start', side });
    for (const id of livingIds(s, side)) {
        const unit = s.units[id];
        if (s.outcome) return;
        if (!unit.alive) continue;
        unit.block = 0;
        unit.cardsPlayed = 0;
        const poison = unit.statuses.poison || 0;
        if (poison > 0) {
            setStatus(unit, 'poison', poison - 1);
            loseHp(c, unit, poison, { unitId: unit.id, kind: 'status', id: 'poison' }, 'poison', false);
        }
        const regen = unit.statuses.regen || 0;
        if (regen > 0 && unit.alive) {
            setStatus(unit, 'regen', regen - 1);
            healUnit(c, unit, regen, { unitId: unit.id, kind: 'status', id: 'regen' });
        }
        if (!unit.alive || s.outcome) continue;
        if (unit.kind === 'deck') unit.energy = unit.energyPerTurn;
        triggerPassives(c, unit, 'turn-start', null);
        if (unit.kind === 'deck' && unit.alive && !s.outcome) drawCards(c, unit, unit.drawPerTurn);
    }
}

function discardHand(c, unit) {
    const pile = c.s.piles[unit.id];
    const kept = [];
    for (const inst of pile.hand) (cardView(c.s, inst)?.retain ? kept : pile.discard).push(inst);
    pile.hand = kept;
}

function endSide(c, side) {
    const s = c.s;
    for (const id of livingIds(s, side)) {
        const unit = s.units[id];
        if (s.outcome) return;
        if (!unit.alive) continue;
        triggerPassives(c, unit, 'turn-end', null);
        if (!unit.alive) continue;
        if (unit.kind === 'deck') discardHand(c, unit);
        for (const key of DECAYING) if (unit.statuses[key] > 0) setStatus(unit, key, unit.statuses[key] - 1);
    }
}

function playCard(c, unit, inst, targetId) {
    const s = c.s;
    const pile = s.piles[unit.id];
    const card = cardView(s, inst);
    const spend = card.cost === 'X' ? unit.energy : card.cost;
    const repeat = card.cost === 'X' ? spend : 1;
    pile.hand.splice(pile.hand.indexOf(inst), 1);
    unit.energy -= spend;
    emit(c, { type: 'card', unitId: unit.id, inst, cardId: card.id, name: card.name, skillRef: card.skillRef || card.name, targetId: targetId ?? null, cost: spend });
    c.exhaust = false;
    const source = { unitId: unit.id, kind: 'card', id: card.id };
    for (let i = 0; i < repeat && !s.outcome && unit.alive; i += 1) applyEffects(c, unit, card.effects, targetId ?? null, source);
    unit.cardsPlayed += 1;
    if (card.type === 'power' || c.exhaust) {
        pile.exhaust.push(inst);
        emit(c, { type: 'exhaust', unitId: unit.id, inst });
    } else {
        pile.discard.push(inst);
    }
    c.exhaust = false;
    checkOutcome(c);
}

function validatePlay(s, unit, inst, targetId) {
    if (typeof inst !== 'string' || !(s.piles[unit.id]?.hand || []).includes(inst)) return { reason: 'card-not-in-hand' };
    const card = cardView(s, inst);
    if (!card) return { reason: 'card-not-in-hand' };
    if (!canAfford(card, unit.energy)) return { reason: 'insufficient-energy', detail: { cost: card.cost, energy: unit.energy } };
    if (!effectsNeedTarget(card.effects)) return targetId == null ? null : { reason: 'unexpected-target' };
    const target = typeof targetId === 'string' && Object.hasOwn(s.units, targetId) ? s.units[targetId] : null;
    if (!target?.alive || target.side !== opposite(unit.side)) return { reason: 'invalid-target' };
    return null;
}

function runAllies(c) {
    const s = c.s;
    for (const id of livingIds(s, 'ally')) {
        const unit = s.units[id];
        if (id === s.controlledId || unit.kind !== 'deck') continue;
        for (let n = 0; n < MAX_AUTO_PLAYS && unit.alive && !s.outcome; n += 1) {
            const choice = chooseAllyPlay(s, id);
            if (!choice || validatePlay(s, unit, choice.inst, choice.targetId)) break;
            playCard(c, unit, choice.inst, choice.targetId);
        }
        if (s.outcome) return;
    }
    for (const id of livingIds(s, 'ally')) {
        if (s.outcome) return;
        if (s.units[id].kind === 'skill' && s.units[id].alive) useSkill(c, s.units[id]);
    }
}

function endTurn(c) {
    const s = c.s;
    emit(c, { type: 'turn-end', side: 'ally' });
    runAllies(c);
    if (!s.outcome) endSide(c, 'ally');
    if (s.outcome) return;
    s.phase = 'enemy';
    startSide(c, 'enemy');
    for (const id of livingIds(s, 'enemy')) {
        if (s.outcome) return;
        if (s.units[id].alive) useSkill(c, s.units[id]);
    }
    if (!s.outcome) endSide(c, 'enemy');
    if (s.outcome) return;
    s.turn += 1;
    s.phase = 'player';
    startSide(c, 'ally');
}



function passivesError(setup) {
    for (const [i, u] of setup.units.entries()) {
        const phasePassives = (Array.isArray(u.phases) ? u.phases : []).flatMap((phase) => phase?.passives || []);
        const own = u.passives === undefined ? [] : u.passives;
        if (!Array.isArray(own) || [...own, ...phasePassives].some((p) => !safeId(p?.id) || !Array.isArray(p.effects))) {
            return { reason: 'invalid-passive', detail: { path: `units[${i}]` } };
        }
    }
    return null;
}

function buildUnit(u) {
    const unit = {
        id: u.id,
        name: typeof u.name === 'string' && u.name ? u.name : u.id,
        side: u.side,
        kind: u.kind,
        maxHp: u.maxHp,
        hp: u.hp ?? u.maxHp,
        block: 0,
        alive: true,
        statuses: {},
        damageScale: u.damageScale ?? 1,
        cardsPlayed: 0,
        lowHpTriggered: false,
        passives: clone(u.passives || []),
        skills: u.kind === 'skill' ? clone(u.skills) : [],
        phases: u.kind === 'skill' && Array.isArray(u.phases) ? clone(u.phases).sort((a, b) => b.hpBelowPct - a.hpBelowPct) : [],
        phasesApplied: 0,
    };
    if (u.kind === 'deck') {
        unit.energy = 0;
        unit.energyPerTurn = u.energy ?? COMBAT_RULES.energyPerTurn;
        unit.drawPerTurn = u.draw ?? COMBAT_RULES.drawPerTurn;
    }
    return unit;
}

export function createBattle(setup, seed) {
    const error = setupError(setup) || passivesError(setup)
        || (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? null : { reason: 'invalid-seed' });
    if (error) return { ok: false, state: null, events: [], error };
    const s = {
        version: ENGINE_VERSION, rulesVersion: COMBAT_RULES.version, seed, rng: seed,
        turn: 1, phase: 'player', outcome: null, controlledId: setup.controlledId, canEscape: setup.canEscape === true,
        order: [], units: {}, cards: {}, catalog: {}, piles: {}, intents: {}, cooldowns: {}, history: {},
    };
    const c = { s, events: [], depth: 0, exhaust: false };
    for (const u of setup.units) {
        s.order.push(u.id);
        s.units[u.id] = buildUnit(u);
        s.cooldowns[u.id] = {};
        s.history[u.id] = [];
        if (u.kind !== 'deck') continue;
        const catalog = catalogObject(u.catalog);
        const owned = {};
        const draw = u.deck.map((entry, i) => {
            const cardId = deckCardId(entry);
            owned[cardId] = clone(catalog[cardId]);
            const inst = `${u.id}#${i}`;
            s.cards[inst] = { owner: u.id, cardId, upgraded: typeof entry === 'object' && entry.upgraded === true };
            return inst;
        });
        s.catalog[u.id] = owned;
        s.piles[u.id] = { draw: shuffleInPlace(s, draw), hand: [], discard: [], exhaust: [] };
    }
    emit(c, { type: 'battle-start', controlledId: s.controlledId });
    for (const id of s.order) if (s.units[id].kind === 'skill') pickIntent(c, s.units[id]);
    startSide(c, 'ally');
    for (const id of s.order) {
        if (s.outcome) break;
        triggerPassives(c, s.units[id], 'battle-start', null);
    }
    return { ok: true, state: s, events: c.events };
}

export function applyAction(state, action) {
    if (!state || typeof state !== 'object' || state.version !== ENGINE_VERSION) return reject(state, 'invalid-state');
    if (state.outcome) return reject(state, 'battle-ended', { outcome: state.outcome });
    if (!action || typeof action !== 'object' || !ACTION_TYPES.includes(action.type)) return reject(state, 'invalid-action');
    if (state.phase !== 'player') return reject(state, 'not-player-phase');
    if (action.type === 'play') {
        const error = validatePlay(state, state.units[state.controlledId], action.inst, action.targetId);
        if (error) return reject(state, error.reason, error.detail);
    } else if (action.type === 'escape' && !state.canEscape) {
        return reject(state, 'escape-unavailable');
    }
    const s = clone(state);
    const c = { s, events: [], depth: 0, exhaust: false };
    if (action.type === 'play') playCard(c, s.units[s.controlledId], action.inst, action.targetId ?? null);
    else if (action.type === 'end-turn') endTurn(c);
    else {
        emit(c, { type: 'escape', unitId: s.controlledId });
        finish(c, 'escape');
    }
    return { ok: true, state: s, events: c.events };
}


export function legalActions(state) {
    if (!state || state.outcome || state.phase !== 'player') return [];
    const unit = state.units[state.controlledId];
    const actions = [];
    for (const inst of state.piles[unit.id]?.hand || []) {
        const card = cardView(state, inst);
        if (!card || !canAfford(card, unit.energy)) continue;
        if (!effectsNeedTarget(card.effects)) actions.push({ type: 'play', inst });
        else for (const targetId of livingIds(state, opposite(unit.side))) actions.push({ type: 'play', inst, targetId });
    }
    actions.push({ type: 'end-turn' });
    if (state.canEscape) actions.push({ type: 'escape' });
    return actions;
}

export function replayBattle(setup, seed, actions = []) {
    const created = createBattle(setup, seed);
    if (!created.ok) return { ...created, applied: 0 };
    let { state } = created;
    const events = [...created.events];
    for (const [index, action] of actions.entries()) {
        const result = applyAction(state, action);
        if (!result.ok) return { ok: false, state, events, applied: index, error: { ...result.error, index } };
        state = result.state;
        events.push(...result.events);
    }
    return { ok: true, state, events, applied: actions.length };
}
