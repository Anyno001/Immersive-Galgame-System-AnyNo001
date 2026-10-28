import { COMBAT_RULES } from './rules.js';
import { hash32, nextRandom, randomInt } from './random.js';
import {
    LOW_HP_RATIO, canAfford, cardView, computeBlock, computeDamage, conditionHolds,
    effectsNeedTarget, effectsPickAlly, livingIds, lowestRatioId, opposite, weakestId,
} from './battle-state.js';
import { chooseAllyPlay, chooseSkillIntent } from './policy.js';

export const ENGINE_VERSION = 1;
const MAX_AUTO_PLAYS = 30;
const MAX_TIMELINE_STEPS = 64;
const AV_SCALE = 1000000;
const MAX_PASSIVE_DEPTH = 2;
const SIDES = Object.freeze(['ally', 'enemy']);
const UNIT_KINDS = Object.freeze(['deck', 'skill']);
const ACTION_TYPES = Object.freeze(['play', 'end-turn', 'escape', 'hero-skill', 'awaken', 'item']);
// 每次本单位回合结束衰减 1 层：易伤、虚弱；禁抽只持续本回合（1 层）。无形在本单位下次回合开始时衰减，才能覆盖其间的敌方行动。
const DECAYING = Object.freeze(['vulnerable', 'weak', 'no-draw']);
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
const DEFAULT_TARGET = Object.freeze({ damage: 'enemy', block: 'self', heal: 'self', 'heal-pct': 'self', 'damage-from-block': 'enemy', cleanse: 'self' });
// 净化可移除的减益。
const CLEANSABLE = Object.freeze(['weak', 'vulnerable', 'poison', 'no-draw']);

// 效果的承受方（缺省值按 op / 状态推导）；面板据此高亮不需要选目标的牌的承受方。
export function targetSpec(effect) {
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
    if ((u.energy !== undefined && !isInt(u.energy, 0, 10)) || (u.draw !== undefined && !isInt(u.draw, 0, 10)) || badScale
        || (u.speed !== undefined && !isInt(u.speed, 1, 999))) {
        return { reason: 'invalid-stat', detail: { path } };
    }
    if (u.kind === 'skill') {
        if (!Array.isArray(u.skills) || !u.skills.length) return { reason: 'missing-skills', detail: { path } };
        const phaseSkills = (Array.isArray(u.phases) ? u.phases : []).flatMap((phase) => phase?.addSkills || []);
        const bad = [...u.skills, ...phaseSkills].find((skill) => !safeId(skill?.id) || !Array.isArray(skill.effects));
        return bad === undefined ? null : { reason: 'invalid-skill', detail: { path } };
    }
    const hs = u.heroSkill;
    if (hs !== undefined && hs !== null && (!safeId(hs?.id) || !Array.isArray(hs.effects) || !hs.effects.length)) {
        return { reason: 'invalid-hero-skill', detail: { path } };
    }
    if (!Array.isArray(u.deck) || !u.deck.length) return { reason: 'empty-deck', detail: { path } };
    const catalog = catalogObject(u.catalog);
    for (const entry of u.deck) {
        const cardId = deckCardId(entry);
        if (!safeId(cardId) || !Object.hasOwn(catalog, cardId)) return { reason: 'unknown-card', detail: { path, cardId: cardId ?? null } };
    }
    return null;
}

// setup.awaken 可选：{ type: 觉醒键, line?: 台词 }；缺省时不产生觉醒动作，旧 setup 照常建局。
function awakenError(a) {
    if (!a || typeof a !== 'object' || !Object.hasOwn(COMBAT_RULES.awakenEffects, a.type)) return true;
    return a.line !== undefined && (typeof a.line !== 'string' || a.line.length > COMBAT_RULES.awakenLineMax);
}

// setup.items 可选：[{ itemId, name?, count 1–99, effects[] }]，最多 12 种，itemId 不重复。
function itemsError(list) {
    if (!Array.isArray(list) || list.length > 12) return true;
    const ids = new Set();
    for (const i of list) {
        if (!i || !safeId(i.itemId) || ids.has(i.itemId) || !isInt(i.count, 1, 99) || !Array.isArray(i.effects) || !i.effects.length) return true;
        ids.add(i.itemId);
    }
    return false;
}

function setupError(setup) {
    if (!setup || typeof setup !== 'object' || !Array.isArray(setup.units)) return { reason: 'invalid-setup' };
    if (setup.rulesVersion !== undefined && setup.rulesVersion !== COMBAT_RULES.version) {
        return { reason: 'rules-version-mismatch', detail: { expected: COMBAT_RULES.version, actual: setup.rulesVersion } };
    }
    if (setup.awaken !== undefined && awakenError(setup.awaken)) return { reason: 'invalid-awaken' };
    if (setup.items !== undefined && itemsError(setup.items)) return { reason: 'invalid-items' };
    // setup.overkill 可选（布尔）：为 true 时开鞭尸与超杀（见 isWhipping / checkOutcome）；旧 setup 不带时规则不变，重放结果不变。
    if (setup.overkill !== undefined && typeof setup.overkill !== 'boolean') return { reason: 'invalid-setup' };
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

// 鞭尸：overkill 战斗里操控角色在出牌阶段出手。玩家连续出牌时引擎逐张立即结算、面板依次演出，还没显示倒下的敌人仍可被选为目标。
export const isWhipping = (s, unit) => s?.overkill === true && s.phase === 'player' && Boolean(unit) && unit.id === s.controlledId;

// whip 为真时：单体敌方目标可以是倒下的敌人；全体 / 随机敌人在敌人全灭后改打倒下的敌人（超杀），仍有存活敌人时只打存活的。
function targetsFor(c, actor, spec, primaryId, whip = false) {
    const s = c.s;
    const foe = opposite(actor.side);
    const units = (ids) => ids.map((id) => s.units[id]);
    const foes = () => {
        const alive = livingIds(s, foe);
        return alive.length || !whip ? alive : s.order.filter((id) => s.units[id].side === foe);
    };
    switch (spec) {
        case 'enemy': {
            if (primaryId == null) {
                const id = weakestId(s, foe);
                return id ? [s.units[id]] : [];
            }
            const t = Object.hasOwn(s.units, primaryId) ? s.units[primaryId] : null;
            return t && t.side === foe && (t.alive || whip) ? [t] : [];
        }
        case 'all-enemies': return units(foes());
        case 'random-enemy': {
            const ids = foes();
            return ids.length ? [s.units[ids[roll(s, ids.length)]]] : [];
        }
        case 'self': return actor.alive ? [actor] : [];
        case 'ally': {
            // 玩家指定了存活的己方单位时作用于该单位；否则（旧记录、托管、敌方技能、被动）按生命比例最低者。
            const picked = primaryId != null && Object.hasOwn(s.units, primaryId) ? s.units[primaryId] : null;
            if (picked?.alive && picked.side === actor.side) return [picked];
            const id = lowestRatioId(s, actor.side);
            return id ? [s.units[id]] : [];
        }
        case 'all-allies': return units(livingIds(s, actor.side));
        case 'other-allies': return units(livingIds(s, actor.side).filter((id) => id !== actor.id));
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
    // overkill 战斗在己方出牌阶段打空最后一名敌人：不立即判胜，还可以继续出牌鞭尸（超杀），结束回合时判胜。
    else if (!livingIds(s, 'enemy').length && !(s.overkill === true && s.phase === 'player')) finish(c, 'victory');
}

// strike：攻击伤害的段号（同一批事件内递增，见 applyDamage），只有提供时才写进伤害事件；其余伤害（中毒、荆棘等）不带。
function loseHp(c, unit, amount, source, kind, blockable, strike = 0) {
    if (c.s.outcome || !unit.alive || amount <= 0) return 0;
    // 无形：每次受到的伤害降为 1。
    if ((unit.statuses.intangible || 0) > 0) amount = Math.min(amount, 1);
    const blocked = blockable ? Math.min(unit.block, amount) : 0;
    unit.block -= blocked;
    let hpLoss = Math.min(unit.hp, amount - blocked);
    // 不屈：首次受到致死伤害时保留 1 生命并获得格挡，之后移除。
    const endured = hpLoss >= unit.hp && (unit.statuses.endure || 0) > 0;
    if (endured) {
        hpLoss = unit.hp - 1;
        setStatus(unit, 'endure', 0);
    }
    unit.hp -= hpLoss;
    const event = { type: 'damage', kind, source, target: unit.id, amount, blocked, hpLoss };
    if (strike) event.strike = strike;
    emit(c, event);
    if (endured) {
        unit.block += COMBAT_RULES.endureBlock;
        emit(c, { type: 'endure', unitId: unit.id, block: COMBAT_RULES.endureBlock });
    }
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
        case 'heal-pct':
            for (const t of targets()) healUnit(c, t, Math.max(1, Math.round((t.maxHp * e.pct) / 100)), source);
            return;
        case 'damage-from-block':
            if (actor.block > 0) applyDamage(c, actor, { op: 'damage', amount: actor.block, target: e.target || 'enemy' }, primaryId, source);
            return;
        case 'self-damage':
            loseHp(c, actor, e.amount, source, 'self', false);
            return;
        case 'double':
            for (const t of targets()) {
                if (e.stat === 'block') {
                    const gained = t.block;
                    t.block += gained;
                    emit(c, { type: 'block', source, target: t.id, amount: gained });
                } else {
                    const cur = t.statuses[e.stat] || 0;
                    if (cur <= 0) continue;
                    setStatus(t, e.stat, Math.min(99, cur * 2));
                    emit(c, { type: 'status', source, target: t.id, status: e.stat, stacks: cur });
                }
            }
            return;
        case 'next-turn':
            actor.nextTurn.push(e.gain === 'status' ? { gain: 'status', status: e.status, stacks: e.stacks } : { gain: e.gain, amount: e.amount });
            emit(c, { type: 'next-turn', unitId: actor.id, gain: e.gain });
            return;
        case 'each-turn':
            actor.powers.push({ id: source.id, effects: clone(e.then) });
            return;
        case 'hand-cost':
            if (actor.kind !== 'deck') return;
            actor.handCost = Math.max(-3, (actor.handCost || 0) + e.amount);
            emit(c, { type: 'hand-cost', unitId: actor.id, amount: actor.handCost });
            return;
        case 'cleanse':
            for (const t of targets()) {
                const cleared = CLEANSABLE.filter((k) => (t.statuses[k] || 0) > 0);
                for (const k of cleared) setStatus(t, k, 0);
                if (cleared.length) emit(c, { type: 'cleanse', source, target: t.id, statuses: cleared });
            }
            return;
        default:
    }
}

function applyDamage(c, actor, e, primaryId, source) {
    const spec = targetSpec(e);
    const struck = [];
    const whip = isWhipping(c.s, actor);
    for (let hit = 0; hit < (e.hits || 1); hit += 1) {
        const targets = targetsFor(c, actor, spec, primaryId, whip);
        if (!targets.length) break;
        // 每段一个段号：范围攻击这一段打到的各目标共用同一个，随机目标每段重新选人、各段段号不同。面板据此让同一段同时落下、各段依次落下。
        c.strikes = (c.strikes || 0) + 1;
        const strike = c.strikes;
        for (const t of targets) {
            if (c.s.outcome || !actor.alive) return;
            // 打在倒下的敌人身上（鞭尸 / 超杀）：记一次不掉血的命中（overkill），不触发荆棘与受击被动。
            if (!t.alive) {
                if (whip) emit(c, { type: 'damage', kind: 'attack', source, target: t.id, amount: computeDamage(actor, t, e.amount, e.strengthScale), blocked: 0, hpLoss: 0, overkill: true, strike });
                continue;
            }
            loseHp(c, t, computeDamage(actor, t, e.amount, e.strengthScale), source, 'attack', true, strike);
            if (!struck.includes(t)) struck.push(t);
            const thorns = t.statuses.thorns || 0;
            if (thorns > 0 && t.id !== actor.id) loseHp(c, actor, thorns, { unitId: t.id, kind: 'status', id: 'thorns' }, 'thorns', true);
        }
    }
    for (const t of struck) if (t.alive && !c.s.outcome) triggerPassives(c, t, 'on-hit', actor.id);
}

function drawCards(c, unit, n) {
    if ((unit.statuses['no-draw'] || 0) > 0) return;
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

// 单位行动前：格挡清零、中毒 / 再生结算、卡组单位回满能量并重置人物技能、回合开始被动、抽牌。
function startUnit(c, unit) {
    const s = c.s;
    if (s.outcome || !unit.alive) return;
    unit.block = 0;
    unit.cardsPlayed = 0;
    if ((unit.statuses.intangible || 0) > 0) setStatus(unit, 'intangible', unit.statuses.intangible - 1);
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
    if (!unit.alive || s.outcome) return;
    if (unit.kind === 'deck') {
        unit.energy = unit.energyPerTurn;
        unit.heroSkillUsed = false;
        // 一次性道具：操控角色每个己方回合限用 1 次。
        if (unit.id === s.controlledId && s.items) s.items.used = false;
    }
    // 下回合生效：上回合登记的能量 / 状态此时结算，抽牌并入本回合抽牌数。
    let extraDraw = 0;
    const pending = unit.nextTurn || [];
    unit.nextTurn = [];
    for (const n of pending) {
        if (n.gain === 'draw') extraDraw += n.amount;
        else if (n.gain === 'energy' && unit.kind === 'deck') {
            unit.energy += n.amount;
            emit(c, { type: 'energy', unitId: unit.id, amount: n.amount });
        } else if (n.gain === 'status') {
            setStatus(unit, n.status, (unit.statuses[n.status] || 0) + n.stacks);
            emit(c, { type: 'status', source: { unitId: unit.id, kind: 'next-turn', id: n.status }, target: unit.id, status: n.status, stacks: n.stacks });
        }
    }
    triggerPassives(c, unit, 'turn-start', null);
    // 能力牌登记的每回合触发效果，按打出顺序结算。
    for (const p of unit.powers || []) {
        if (!unit.alive || s.outcome) return;
        emit(c, { type: 'power-trigger', unitId: unit.id, cardId: p.id });
        applyEffects(c, unit, p.effects, null, { unitId: unit.id, kind: 'power', id: p.id });
    }
    if (unit.kind === 'deck' && unit.alive && !s.outcome) drawCards(c, unit, unit.drawPerTurn + extraDraw);
}


function discardHand(c, unit) {
    const pile = c.s.piles[unit.id];
    const kept = [];
    for (const inst of pile.hand) (cardView(c.s, inst)?.retain ? kept : pile.discard).push(inst);
    pile.hand = kept;
}

// 单位行动后：回合结束被动、卡组单位弃牌、易伤与虚弱衰减。
function endUnit(c, unit) {
    if (c.s.outcome || !unit.alive) return;
    triggerPassives(c, unit, 'turn-end', null);
    if (!unit.alive) return;
    if (unit.kind === 'deck') {
        discardHand(c, unit);
        delete unit.handCost;
    }
    for (const key of DECAYING) if (unit.statuses[key] > 0) setStatus(unit, key, unit.statuses[key] - 1);
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
    return targetError(s, unit, card.effects, targetId);
}

function targetError(s, unit, effects, targetId) {
    const needEnemy = effectsNeedTarget(effects);
    // 不需要敌方目标的牌：可以不带目标；只有「为一名队友」类效果可以带一名存活的己方单位作目标。
    if (!needEnemy && targetId == null) return null;
    if (!needEnemy && !effectsPickAlly(effects)) return { reason: 'unexpected-target' };
    const target = typeof targetId === 'string' && Object.hasOwn(s.units, targetId) ? s.units[targetId] : null;
    const side = needEnemy ? opposite(unit.side) : unit.side;
    // 鞭尸：需要敌方目标时可以选倒下的敌人；己方目标仍须存活。
    const whip = needEnemy && isWhipping(s, unit);
    if (!target || target.side !== side || (!target.alive && !whip)) return { reason: 'invalid-target' };
    return null;
}

// 人物技能：每回合一次，耗 heroSkillCost 能量；目标规则与出牌相同。
function validateHeroSkill(s, unit, targetId) {
    if (!unit.heroSkill) return { reason: 'hero-skill-missing' };
    if (unit.heroSkillUsed) return { reason: 'hero-skill-used' };
    const cost = COMBAT_RULES.heroSkillCost;
    if (unit.energy < cost) return { reason: 'insufficient-energy', detail: { cost, energy: unit.energy } };
    return targetError(s, unit, unit.heroSkill.effects, targetId);
}

function useHeroSkill(c, unit, targetId) {
    const skill = unit.heroSkill;
    const cost = COMBAT_RULES.heroSkillCost;
    unit.energy -= cost;
    unit.heroSkillUsed = true;
    emit(c, { type: 'hero-skill', unitId: unit.id, skillId: skill.id, name: skill.name, targetId: targetId ?? null, cost });
    applyEffects(c, unit, skill.effects, targetId ?? null, { unitId: unit.id, kind: 'hero-skill', id: skill.id });
    checkOutcome(c);
}

// 觉醒：每场 1 次、不耗能量，只给本场主战者；效果取 COMBAT_RULES.awakenEffects。
function validateAwaken(s) {
    if (!s.awaken) return { reason: 'awaken-unavailable' };
    if (s.awaken.used) return { reason: 'awaken-used' };
    return null;
}

function useAwaken(c, unit) {
    const a = c.s.awaken;
    a.used = true;
    emit(c, { type: 'awaken', unitId: unit.id, awakenType: a.type, line: a.line });
    applyEffects(c, unit, COMBAT_RULES.awakenEffects[a.type], null, { unitId: unit.id, kind: 'awaken', id: a.type });
    checkOutcome(c);
}

// 一次性道具（v2 阶段 3）：setup.items 为操控角色带入本场的道具与数量；使用不耗能量，每回合 1 次，目标规则与出牌相同。
function validateItem(s, unit, itemId, targetId) {
    const it = (s.items?.list || []).find((i) => i.itemId === itemId);
    if (!it) return { reason: 'item-unavailable' };
    if (it.count <= 0) return { reason: 'item-empty' };
    if (s.items.used) return { reason: 'item-used' };
    return targetError(s, unit, it.effects, targetId);
}

function useItem(c, unit, itemId, targetId) {
    const it = c.s.items.list.find((i) => i.itemId === itemId);
    it.count -= 1;
    c.s.items.used = true;
    emit(c, { type: 'item', unitId: unit.id, itemId, name: it.name, targetId: targetId ?? null });
    applyEffects(c, unit, it.effects, targetId ?? null, { unitId: unit.id, kind: 'item', id: itemId });
    checkOutcome(c);
}

// 行动值时间轴：每个单位的行动间隔为 AV_SCALE / 速度；每步取剩余行动值最小者出手（相同时先计时者先动），全员扣除这段行动值后该单位重新计时。
// 操控角色轮到时进入出牌阶段；其余单位自动行动，快的单位可能在操控角色下一回合前出手多次。
const avDistance = (unit) => Math.max(1, Math.round(AV_SCALE / (unit.speed || COMBAT_RULES.defaultSpeed)));

// 行动条进度：每个存活单位为 1 − 剩余行动值 / 行动间隔，0 为刚出手（起点），1 为到达出手点；保留三位小数，只读。
export function actionProgress(state) {
    const out = {};
    if (!state?.units || !Array.isArray(state.order)) return out;
    for (const id of state.order) {
        const u = state.units[id];
        if (!u?.alive) continue;
        const p = 1 - (u.av || 0) / avDistance(u);
        out[id] = Math.max(0, Math.min(1, Math.round(p * 1000) / 1000));
    }
    return out;
}

function resetAv(s, unit) {
    s.avSeq += 1;
    unit.av = avDistance(unit);
    unit.avSeq = s.avSeq;
}

function nextActorId(s) {
    let best = null;
    for (const id of s.order) {
        const u = s.units[id];
        if (!u.alive) continue;
        if (!best || u.av < best.av || (u.av === best.av && u.avSeq < best.avSeq)) best = u;
    }
    return best ? best.id : null;
}

// 自动行动：卡组单位（托管队友）按策略出牌直到无牌可出，技能单位（技能队友与敌人）用一次已公示的意图技能。
function autoAct(c, unit) {
    const s = c.s;
    emit(c, { type: 'act', unitId: unit.id, side: unit.side, track: actionProgress(s) });
    startUnit(c, unit);
    if (!unit.alive || s.outcome) return;
    if (unit.kind === 'deck') {
        for (let n = 0; n < MAX_AUTO_PLAYS && unit.alive && !s.outcome; n += 1) {
            const choice = chooseAllyPlay(s, unit.id);
            if (!choice || validatePlay(s, unit, choice.inst, choice.targetId)) break;
            playCard(c, unit, choice.inst, choice.targetId);
        }
    } else {
        useSkill(c, unit);
    }
    endUnit(c, unit);
}

function beginHeroTurn(c, first = false) {
    const s = c.s;
    if (!first) s.turn += 1;
    s.phase = 'player';
    emit(c, { type: 'turn-start', side: 'ally', unitId: s.controlledId, track: actionProgress(s) });
    startUnit(c, s.units[s.controlledId]);
}

function runTimeline(c) {
    const s = c.s;
    s.phase = 'auto';
    for (let step = 0; step < MAX_TIMELINE_STEPS && !s.outcome; step += 1) {
        const id = nextActorId(s);
        if (!id) return;
        const unit = s.units[id];
        const elapsed = unit.av;
        for (const other of s.order) if (s.units[other].alive) s.units[other].av -= elapsed;
        if (id === s.controlledId) {
            beginHeroTurn(c);
            return;
        }
        autoAct(c, unit);
        if (unit.alive) resetAv(s, unit);
    }
    if (!s.outcome) beginHeroTurn(c);
}

function endTurn(c) {
    const s = c.s;
    // overkill 战斗敌人已全灭（面板在演出放完后自动发出结束回合）：直接判胜，不走回合结束与时间轴。
    if (!livingIds(s, 'enemy').length) { finish(c, 'victory'); return; }
    const hero = s.units[s.controlledId];
    emit(c, { type: 'turn-end', side: 'ally', unitId: hero.id });
    endUnit(c, hero);
    if (s.outcome) return;
    resetAv(s, hero);
    runTimeline(c);
}

// 只读：从当前状态推演接下来 count 次出手者（出牌阶段时首位为操控角色）；不改状态、不消耗随机数，供面板显示行动顺序槽。
export function upcomingActors(state, count = 6) {
    if (!state || state.outcome || !state.units) return [];
    const sim = {};
    for (const id of state.order) {
        const u = state.units[id];
        if (u.alive) sim[id] = { av: u.av || 0, seq: u.avSeq || 0, d: avDistance(u) };
    }
    let seq = state.avSeq || 0;
    const out = [];
    const heroId = state.controlledId;
    if (state.phase === 'player' && sim[heroId]) {
        out.push(heroId);
        seq += 1;
        sim[heroId].av = sim[heroId].d;
        sim[heroId].seq = seq;
    }
    while (out.length < count) {
        let best = null;
        for (const id of state.order) {
            const u = sim[id];
            if (!u) continue;
            if (best === null || u.av < sim[best].av || (u.av === sim[best].av && u.seq < sim[best].seq)) best = id;
        }
        if (best === null) break;
        const dt = sim[best].av;
        for (const u of Object.values(sim)) u.av -= dt;
        out.push(best);
        seq += 1;
        sim[best].av = sim[best].d;
        sim[best].seq = seq;
    }
    return out;
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
        speed: u.speed ?? COMBAT_RULES.defaultSpeed,
        av: 0,
        avSeq: 0,
        nextTurn: [],
        powers: [],
    };
    // 外观格位只供面板取敌人图，不参与结算；setup 没有时不写字段。
    if (typeof u.art === 'string' && u.art) unit.art = u.art;
    if (u.kind === 'deck') {
        unit.energy = 0;
        unit.energyPerTurn = u.energy ?? COMBAT_RULES.energyPerTurn;
        unit.drawPerTurn = u.draw ?? COMBAT_RULES.drawPerTurn;
        unit.heroSkillUsed = false;
        if (u.heroSkill) unit.heroSkill = clone(u.heroSkill);
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
        order: [], units: {}, cards: {}, catalog: {}, piles: {}, intents: {}, cooldowns: {}, history: {}, avSeq: 0,
        ...(setup.overkill === true ? { overkill: true } : {}),
        ...(setup.awaken ? { awaken: { type: setup.awaken.type, line: setup.awaken.line || '', used: false } } : {}),
        ...(setup.items?.length ? { items: { used: false, list: setup.items.map((i) => ({ itemId: i.itemId, name: typeof i.name === 'string' ? i.name : i.itemId, count: i.count, effects: clone(i.effects) })) } } : {}),
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
    // 开局操控角色先出牌；其余单位按出场顺序开始计时，同速时先出场的先动。
    for (const id of s.order) if (id !== s.controlledId) resetAv(s, s.units[id]);
    beginHeroTurn(c, true);
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
    } else if (action.type === 'hero-skill') {
        const error = validateHeroSkill(state, state.units[state.controlledId], action.targetId);
        if (error) return reject(state, error.reason, error.detail);
    } else if (action.type === 'awaken') {
        const error = validateAwaken(state);
        if (error) return reject(state, error.reason);
    } else if (action.type === 'item') {
        const error = validateItem(state, state.units[state.controlledId], action.itemId, action.targetId);
        if (error) return reject(state, error.reason, error.detail);
    } else if (action.type === 'escape' && (!state.canEscape || !livingIds(state, 'enemy').length)) {
        // 敌人已全灭（等结束回合判胜）时不能撤退。
        return reject(state, 'escape-unavailable');
    }
    const s = clone(state);
    const c = { s, events: [], depth: 0, exhaust: false };
    if (action.type === 'play') playCard(c, s.units[s.controlledId], action.inst, action.targetId ?? null);
    else if (action.type === 'hero-skill') useHeroSkill(c, s.units[s.controlledId], action.targetId ?? null);
    else if (action.type === 'awaken') useAwaken(c, s.units[s.controlledId]);
    else if (action.type === 'item') useItem(c, s.units[s.controlledId], action.itemId, action.targetId ?? null);
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
    // 可选目标：需要敌方目标的给每名存活敌人（鞭尸时含倒下的敌人），「为一名队友」类给每名存活的己方单位，其余不带目标。
    const foes = isWhipping(state, unit) ? state.order.filter((id) => state.units[id].side === opposite(unit.side)) : livingIds(state, opposite(unit.side));
    const pickable = (effects) => (effectsNeedTarget(effects) ? foes : effectsPickAlly(effects) ? livingIds(state, unit.side) : null);
    for (const inst of state.piles[unit.id]?.hand || []) {
        const card = cardView(state, inst);
        if (!card || !canAfford(card, unit.energy)) continue;
        const ids = pickable(card.effects);
        if (!ids) actions.push({ type: 'play', inst });
        else for (const targetId of ids) actions.push({ type: 'play', inst, targetId });
    }
    const skillIds = unit.heroSkill ? pickable(unit.heroSkill.effects) : null;
    if (!skillIds) { if (!validateHeroSkill(state, unit, undefined)) actions.push({ type: 'hero-skill' }); }
    else for (const targetId of skillIds) if (!validateHeroSkill(state, unit, targetId)) actions.push({ type: 'hero-skill', targetId });
    if (!validateAwaken(state)) actions.push({ type: 'awaken' });
    for (const it of state.items?.list || []) {
        const ids = pickable(it.effects);
        if (!ids) { if (!validateItem(state, unit, it.itemId, undefined)) actions.push({ type: 'item', itemId: it.itemId }); }
        else for (const targetId of ids) if (!validateItem(state, unit, it.itemId, targetId)) actions.push({ type: 'item', itemId: it.itemId, targetId });
    }
    actions.push({ type: 'end-turn' });
    if (state.canEscape && livingIds(state, 'enemy').length) actions.push({ type: 'escape' });
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
