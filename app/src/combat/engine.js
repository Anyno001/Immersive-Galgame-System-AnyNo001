import { COMBAT_RULES, TOKEN_CARDS, isCompatibleRulesVersion } from './rules.js';
import { hash32, nextRandom, randomInt } from './random.js';
import {
    LOW_HP_RATIO, canAfford, cardCountKey, cardView, computeBlock, computeDamage, conditionHolds,
    effectsNeedTarget, effectsPickAlly, livingIds, lowestRatioId, opposite, weakestId,
} from './battle-state.js';
import { chooseAllyPlay, chooseSkillIntent, pickCards } from './policy.js';
import { TRAIT_ACTIVE_MAX, TRAIT_KINDS, TRAIT_SKILL_COSTS, TRAIT_SLOT_MAX } from './traits.js';

export const ENGINE_VERSION = 1;
const MAX_AUTO_PLAYS = 30;
const MAX_TIMELINE_STEPS = 64;
// 操控角色倒下后时间轴的步数上限倍数（防止双方都打不动时死循环）。
const WIPE_STEP_FACTOR = 30;
const AV_SCALE = 1000000;
const MAX_PASSIVE_DEPTH = 2;
const SIDES = Object.freeze(['ally', 'enemy']);
const UNIT_KINDS = Object.freeze(['deck', 'skill']);
const ACTION_TYPES = Object.freeze(['play', 'end-turn', 'escape', 'hero-skill', 'awaken', 'item', 'choose']);
// v4：每个单位回合内总线触发（出牌、被弃、消耗、击杀、洗牌、失去生命、获得格挡、限时 BUFF、被弃时效果）最多结算次数，防止互相触发的循环。
const MAX_BUS_TRIGGERS = 40;
// 本场成长（grow）累计上限。
const GROW_MAX = 20;
// 每次本单位回合结束衰减 1 层：易伤、虚弱、脆弱；禁抽只持续本回合（1 层）。无形在本单位下次回合开始时衰减，才能覆盖其间的敌方行动。
const DECAYING = Object.freeze(['vulnerable', 'weak', 'no-draw', 'frail']);
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

const SELF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns', 'artifact']);
const DEFAULT_TARGET = Object.freeze({ damage: 'enemy', block: 'self', heal: 'self', 'heal-pct': 'self', 'damage-from-block': 'enemy', cleanse: 'self' });
// 减益：净化可移除，人工制品可抵消。
const CLEANSABLE = Object.freeze(['weak', 'vulnerable', 'poison', 'no-draw', 'frail']);

// 施加状态：承受方有人工制品时减益被抵消，消耗 1 层人工制品并发 artifact 事件；其余照常叠层。
function addStatus(c, t, status, stacks, source) {
    if (CLEANSABLE.includes(status) && (t.statuses.artifact || 0) > 0) {
        setStatus(t, 'artifact', t.statuses.artifact - 1);
        emit(c, { type: 'artifact', source, target: t.id, status });
        return;
    }
    setStatus(t, status, (t.statuses[status] || 0) + stacks);
    emit(c, { type: 'status', source, target: t.id, status, stacks });
}

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

// v4：人物特性（setup 可选，旧 setup 没有）：面板展示用的元数据，kind 为 active / passive，最多 TRAIT_SLOT_MAX 个、其中主动最多 TRAIT_ACTIVE_MAX 个；
// 抽到的主动特性带 skill（费用为 TRAIT_SKILL_COSTS 之一，每回合各限一次）。
function traitsError(traits) {
    if (!Array.isArray(traits) || traits.length > TRAIT_SLOT_MAX) return true;
    if (traits.filter((t) => t?.kind === 'active').length > TRAIT_ACTIVE_MAX) return true;
    const skillIds = traits.filter((t) => t?.skill).map((t) => t.skill.id);
    if (new Set(skillIds).size !== skillIds.length) return true;
    return traits.some((t) => !safeId(t?.id) || !TRAIT_KINDS.includes(t.kind) || (t.skill !== undefined
        && (t.kind !== 'active' || !safeId(t.skill?.id) || !Array.isArray(t.skill.effects) || !t.skill.effects.length || !TRAIT_SKILL_COSTS.includes(t.skill.cost))));
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
    if (u.traits !== undefined && traitsError(u.traits)) return { reason: 'invalid-traits', detail: { path } };
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
    // v3 setup 不含 v4 字段，可在当前引擎上重放（进行中的 v3 战斗继续有效）。
    if (setup.rulesVersion !== undefined && !isCompatibleRulesVersion(setup.rulesVersion)) {
        return { reason: 'rules-version-mismatch', detail: { expected: COMBAT_RULES.version, actual: setup.rulesVersion } };
    }
    if (setup.awaken !== undefined && awakenError(setup.awaken)) return { reason: 'invalid-awaken' };
    if (setup.items !== undefined && itemsError(setup.items)) return { reason: 'invalid-items' };
    // setup.overkill 可选（布尔）：为 true 时开鞭尸与超杀（见 isWhipping / checkOutcome）；旧 setup 不带时规则不变，重放结果不变。
    if (setup.overkill !== undefined && typeof setup.overkill !== 'boolean') return { reason: 'invalid-setup' };
    // setup.wipe 可选（布尔，助手 10-29）：为 true 时操控角色倒下后队友继续托管作战，我方全员倒下才判负；旧 setup 不带时规则不变。
    if (setup.wipe !== undefined && typeof setup.wipe !== 'boolean') return { reason: 'invalid-setup' };
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
    const lost = s.wipe === true ? !livingIds(s, 'ally').length : !s.units[s.controlledId].alive;
    if (lost) finish(c, 'defeat');
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
    // 触发总线：攻击击杀给出手方「击杀」；存活且失去生命给承受方「失去生命」。
    const killer = source?.unitId != null ? c.s.units[source.unitId] : null;
    if (!unit.alive && kind === 'attack' && killer && killer.side !== unit.side) fireBus(c, killer, 'kill', null);
    else if (unit.alive && hpLoss > 0) fireBus(c, unit, 'hp-loss', null);
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

// v4 触发总线：出牌、被弃、被消耗、击杀、洗牌、失去生命、获得格挡由被动与限时 BUFF 接收；回合开始 / 结束只给限时 BUFF（被动仍走 triggerPassives）。
// 没有匹配的被动或 BUFF 时不发事件、不计数，旧战斗结算不变；嵌套深度沿用被动上限，每个单位回合内总次数有上限。
const BUFF_ONLY_TRIGGERS = new Set(['turn-start', 'turn-end']);
const busOpen = (c) => c.depth < MAX_PASSIVE_DEPTH && (c.s.busTriggers || 0) < MAX_BUS_TRIGGERS;

function fireBus(c, unit, trigger, primaryId, meta = {}) {
    if (!unit?.alive || c.s.outcome) return;
    const matches = (x) => x.trigger === trigger && (!x.cardType || x.cardType === meta.cardType);
    const passives = BUFF_ONLY_TRIGGERS.has(trigger) ? [] : (unit.passives || []).filter(matches);
    const buffs = (unit.buffs || []).filter(matches);
    if ((!passives.length && !buffs.length) || !busOpen(c)) return;
    c.depth += 1;
    const run = (kind, x, effects, extra) => {
        if (!unit.alive || c.s.outcome || (c.s.busTriggers || 0) >= MAX_BUS_TRIGGERS) return;
        c.s.busTriggers = (c.s.busTriggers || 0) + 1;
        emit(c, { type: kind === 'passive' ? 'passive' : 'buff-trigger', unitId: unit.id, ...extra, trigger });
        applyEffects(c, unit, effects, primaryId, { unitId: unit.id, kind, id: x.id });
    };
    for (const p of passives) run('passive', p, p.effects, { passiveId: p.id });
    for (const b of buffs) run('buff', b, b.then, { buffId: b.id });
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
                const gained = computeBlock(actor, e.amount, t);
                t.block += gained;
                emit(c, { type: 'block', source, target: t.id, amount: gained });
                if (gained > 0) fireBus(c, t, 'block-gain', null);
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
            for (const t of targets()) addStatus(c, t, e.status, e.stacks, source);
            return;
        case 'exhaust-self':
            if (source.kind === 'card') c.exhaust = true;
            return;
        case 'conditional':
            // 同名连出条件取正在结算的卡牌 ID（只在卡牌效果里成立）。
            if (conditionHolds(c.s, actor, e.when, primaryId, source?.kind === 'card' ? source.id : null)) applyEffects(c, actor, e.then, primaryId, source);
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
                    if (gained > 0) fireBus(c, t, 'block-gain', null);
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
            // at 为 turn-end 的能力在回合结束、弃牌前结算；缺省为回合开始。
            actor.powers.push(e.at === 'turn-end' ? { id: source.id, effects: clone(e.then), at: 'turn-end' } : { id: source.id, effects: clone(e.then) });
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
        // v4 第一批：弃牌、弃全手、复制、生成、重复上一张、下一张多结算、本场成长、单张减费、限时触发。
        case 'discard': {
            if (actor.kind !== 'deck') return;
            const hand = c.s.piles[actor.id].hand;
            for (const inst of pickFor(c, e.mode, hand.slice(), Math.min(e.amount, hand.length), 'discard')) discardCard(c, actor, inst);
            return;
        }
        case 'discard-hand': {
            if (actor.kind !== 'deck') return;
            const all = c.s.piles[actor.id].hand.slice();
            for (const inst of all) discardCard(c, actor, inst);
            if (e.redraw && all.length && actor.alive && !c.s.outcome) drawCards(c, actor, all.length);
            return;
        }
        case 'copy': {
            if (actor.kind !== 'deck') return;
            const from = e.from === 'self' ? selfInst(c) : pickFor(c, e.from, c.s.piles[actor.id].hand.slice(), 1, 'copy');
            for (const inst of from) for (let i = 0; i < e.amount; i += 1) copyCard(c, actor, inst, e.to);
            return;
        }
        case 'create':
            // 卡组单位生成进自己的牌堆；技能单位（敌人、队友）只能生成状态牌，塞进对方卡组单位的牌堆。
            if (actor.kind === 'deck') {
                for (let i = 0; i < e.amount; i += 1) createToken(c, actor, e.card, e.to);
            } else if (TOKEN_CARDS[e.card]?.unplayable) {
                const t = statusCardTarget(c, actor, primaryId);
                if (t) for (let i = 0; i < e.amount; i += 1) createToken(c, t, e.card, e.to);
            }
            return;
        case 'repeat-last':
            repeatLast(c, actor, e.amount, primaryId);
            return;
        case 'replay-next':
            if (actor.kind !== 'deck') return;
            if (!actor.replayNext) actor.replayNext = [];
            actor.replayNext.push(e.cardType ? { amount: e.amount, cardType: e.cardType } : { amount: e.amount });
            emit(c, { type: 'replay-next', unitId: actor.id, amount: e.amount, cardType: e.cardType || null });
            return;
        case 'grow':
            for (const inst of selfInst(c)) {
                const ref = c.s.cards[inst];
                ref.grow = Math.min(GROW_MAX, (ref.grow || 0) + e.amount);
                emit(c, { type: 'grow', unitId: actor.id, inst, grow: ref.grow });
            }
            return;
        case 'cost-mod': {
            if (actor.kind !== 'deck') return;
            const insts = e.mode === 'self' ? selfInst(c) : pickFor(c, e.mode, costable(c.s, actor), 1, 'cost');
            for (const inst of insts) modCost(c, actor, inst, e.amount, e.scope);
            return;
        }
        case 'buff':
            if (!actor.buffs) actor.buffs = [];
            actor.buffs.push({ id: source.id, trigger: e.trigger, ...(e.cardType ? { cardType: e.cardType } : {}), turns: e.turns, then: clone(e.then) });
            emit(c, { type: 'buff', unitId: actor.id, buffId: source.id, trigger: e.trigger, turns: e.turns });
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
            // 洗牌触发可能再抽牌：回来后重新检查手牌上限与牌库。
            fireBus(c, unit, 'shuffle', null);
            if (pile.hand.length >= COMBAT_RULES.handLimit || !pile.draw.length) break;
        }
        pile.hand.push(pile.draw.pop());
        drawn += 1;
    }
    if (drawn) emit(c, { type: 'draw', unitId: unit.id, count: drawn });
}

// ── v4 牌实例层：本回合计数、选牌、被弃、消耗、临时牌、重复上一张、单张减费 ──
// 本回合计数（同名牌键见 cardCountKey）；按需创建，单位回合开始时清空。
const freshTurnStats = () => ({ attack: 0, skill: 0, power: 0, discards: 0, temps: 0, byCard: {} });
function turnStatsOf(unit) {
    if (!unit.turnStats) unit.turnStats = freshTurnStats();
    return unit.turnStats;
}

// 本张：正在结算的卡牌实例（重复上一张时为被重复的那张）；卡牌以外的场合为空。
const selfInst = (c) => (c.inst ? [c.inst] : []);
// 可减费的手牌：数字费用且大于 0。
const costable = (s, unit) => s.piles[unit.id].hand.filter((inst) => {
    const card = cardView(s, inst);
    return card && typeof card.cost === 'number' && card.cost > 0;
});

// 选牌：choose 取玩家在待选阶段给出的选择（c.chosen）；不能暂停的场合（托管角色、重复结算）按策略自动选；random 按种子抽。
// 候选不多于要选的张数时全部选中，不消耗随机数。
function pickFor(c, mode, options, count, purpose) {
    if (mode === 'choose' && c.chosen) {
        const chosen = c.chosen;
        c.chosen = null;
        return chosen;
    }
    if (count <= 0 || !options.length) return [];
    if (count >= options.length) return options.slice();
    if (mode === 'choose') return pickCards(c.s, options, count, purpose);
    const pool = options.slice();
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(pool.splice(roll(c.s, pool.length), 1)[0]);
    return out;
}

// 需要玩家选牌的顶层效果：写 choose 且候选多于要选的张数时返回候选与张数，否则自动结算。
function choiceFor(s, unit, e) {
    if (unit.kind !== 'deck') return null;
    const hand = s.piles[unit.id].hand;
    let options = null;
    let count = 1;
    if (e.op === 'discard' && e.mode === 'choose') { options = hand.slice(); count = Math.min(e.amount, hand.length); }
    else if (e.op === 'copy' && e.from === 'choose') options = hand.slice();
    else if (e.op === 'cost-mod' && e.mode === 'choose') options = costable(s, unit);
    return options && count > 0 && options.length > count ? { options, count } : null;
}

// 效果弃牌：移入弃牌堆并计数，结算这张牌的被弃时效果，再给被动与限时 BUFF 发「被弃」。回合末弃手牌不走这里（助手 10-28）。
function discardCard(c, unit, inst) {
    const pile = c.s.piles[unit.id];
    const at = pile.hand.indexOf(inst);
    if (at < 0) return;
    pile.hand.splice(at, 1);
    pile.discard.push(inst);
    turnStatsOf(unit).discards += 1;
    const card = cardView(c.s, inst);
    emit(c, { type: 'discard', unitId: unit.id, inst, cardId: card?.id ?? null });
    // 被弃时效果与总线共用深度和次数上限，防止「弃牌→抽牌→再弃」的循环。
    if (card?.onDiscard && unit.alive && !c.s.outcome && busOpen(c)) {
        c.s.busTriggers = (c.s.busTriggers || 0) + 1;
        c.depth += 1;
        applyEffects(c, unit, card.onDiscard, null, { unitId: unit.id, kind: 'on-discard', id: card.id });
        c.depth -= 1;
    }
    fireBus(c, unit, 'discard', null, { cardType: card?.type });
}

// 消耗：移入消耗堆；trigger 为假时（能力牌打出后进消耗堆）不发「被消耗」。
function exhaustCard(c, unit, inst, trigger = true) {
    c.s.piles[unit.id].exhaust.push(inst);
    emit(c, { type: 'exhaust', unitId: unit.id, inst });
    if (trigger) fireBus(c, unit, 'exhaust', null, { cardType: cardView(c.s, inst)?.type });
}

// 临时牌（复制、生成）：只在本场存在，不入卡组与账本；每个单位每回合最多 tempCardsPerTurn 张。实例号按全场顺序递增，重放确定。
// 去手牌而手牌已满时改进弃牌堆；去牌库时插入随机位置。
function newTempInst(c, unit, ref, to) {
    const stats = turnStatsOf(unit);
    if (stats.temps >= COMBAT_RULES.tempCardsPerTurn) return null;
    stats.temps += 1;
    c.s.tempSeq = (c.s.tempSeq || 0) + 1;
    const inst = `${unit.id}#t${c.s.tempSeq}`;
    c.s.cards[inst] = { owner: unit.id, ...ref, temp: true };
    const pile = c.s.piles[unit.id];
    const at = to === 'hand' && pile.hand.length >= COMBAT_RULES.handLimit ? 'discard' : to;
    if (at === 'hand') pile.hand.push(inst);
    else if (at === 'draw') pile.draw.splice(roll(c.s, pile.draw.length + 1), 0, inst);
    else pile.discard.push(inst);
    emit(c, { type: 'card-created', unitId: unit.id, inst, cardId: ref.cardId, to: at });
    return inst;
}

// 复制：带上升级、本场成长与本场减费；本回合减费不带。
function copyCard(c, unit, inst, to) {
    const ref = c.s.cards[inst];
    if (!ref) return;
    const copy = { cardId: ref.cardId, upgraded: ref.upgraded === true };
    if (ref.grow) copy.grow = ref.grow;
    if (ref.costMod) copy.costMod = ref.costMod;
    newTempInst(c, unit, copy, to);
}

// 生成内置临时牌：首次生成时把牌面登记进本单位图鉴；图鉴里同 ID 已是别的牌时不生成。
function createToken(c, unit, key, to) {
    const token = TOKEN_CARDS[key];
    if (!token) return;
    const catalog = c.s.catalog[unit.id];
    if (!Object.hasOwn(catalog, token.id)) catalog[token.id] = clone(token);
    else if (catalog[token.id].name !== token.name) return;
    newTempInst(c, unit, { cardId: token.id, upgraded: false }, to);
}

// 状态牌的承受方：技能指定的对方卡组单位，否则对方的操控角色，再否则对方第一名存活的卡组单位；计入承受方本回合的临时牌上限。
function statusCardTarget(c, actor, primaryId) {
    const s = c.s;
    const foe = opposite(actor.side);
    const fits = (u) => Boolean(u?.alive) && u.side === foe && u.kind === 'deck';
    const picked = primaryId != null && Object.hasOwn(s.units, primaryId) ? s.units[primaryId] : null;
    if (fits(picked)) return picked;
    if (fits(s.units[s.controlledId])) return s.units[s.controlledId];
    const id = livingIds(s, foe).find((x) => s.units[x].kind === 'deck');
    return id ? s.units[id] : null;
}

// 重复上一张：按本回合上一张已结算完的牌的当前效果再结算 amount 次；不付费、不移动那张牌、不算出牌、不能嵌套，选牌按策略自动选。
// X 费牌按一次结算重复（不乘能量）。原目标已倒下时按效果缺省目标重选。
function repeatLast(c, unit, amount, primaryId) {
    const last = unit.lastPlayed;
    if (c.repeating || !last || unit.kind !== 'deck') return;
    const card = cardView(c.s, last.inst);
    if (!card || card.unplayable) return;
    const saved = { inst: c.inst, exhaust: c.exhaust };
    const target = last.targetId != null && c.s.units[last.targetId]?.alive ? last.targetId : null;
    c.repeating = true;
    c.inst = last.inst;
    emit(c, { type: 'repeat', unitId: unit.id, inst: last.inst, cardId: card.id, times: amount });
    const source = { unitId: unit.id, kind: 'card', id: card.id };
    for (let i = 0; i < amount && unit.alive && !c.s.outcome; i += 1) applyEffects(c, unit, card.effects, target ?? primaryId ?? null, source);
    c.repeating = false;
    c.inst = saved.inst;
    c.exhaust = saved.exhaust;
}

// 单张减费：本场（写在牌实例上，复制时带走）或本回合（单位回合结束清空）；累计最多 -3，最终费用最低 0。
function modCost(c, unit, inst, amount, scope) {
    const ref = c.s.cards[inst];
    if (!ref) return;
    if (scope === 'combat') ref.costMod = Math.max(-3, (ref.costMod || 0) + amount);
    else {
        if (!unit.turnCostMod) unit.turnCostMod = {};
        unit.turnCostMod[inst] = Math.max(-3, (unit.turnCostMod[inst] || 0) + amount);
    }
    emit(c, { type: 'cost-mod', unitId: unit.id, inst, amount, scope });
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
    // v4：本回合计数、上一张与单位回合内总线次数清零（缺省不补字段，旧战斗形状不变）。
    delete unit.turnStats;
    delete unit.lastPlayed;
    delete s.busTriggers;
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
        if (unit.traitSkillsUsed) unit.traitSkillsUsed = [];
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
            addStatus(c, unit, n.status, n.stacks, { unitId: unit.id, kind: 'next-turn', id: n.status });
        }
    }
    triggerPassives(c, unit, 'turn-start', null);
    // 能力牌登记的每回合触发效果，按打出顺序结算。
    for (const p of unit.powers || []) {
        if (!unit.alive || s.outcome) return;
        if (p.at === 'turn-end') continue;
        emit(c, { type: 'power-trigger', unitId: unit.id, cardId: p.id });
        applyEffects(c, unit, p.effects, null, { unitId: unit.id, kind: 'power', id: p.id });
    }
    fireBus(c, unit, 'turn-start', null);
    if (unit.kind === 'deck' && unit.alive && !s.outcome) drawCards(c, unit, unit.drawPerTurn + extraDraw);
}


// 回合末弃手牌：保留的留在手里，虚无的消耗，其余进弃牌堆；不触发被弃时效果（助手 10-28）。
function discardHand(c, unit) {
    const pile = c.s.piles[unit.id];
    const kept = [];
    const fading = [];
    for (const inst of pile.hand) {
        const card = cardView(c.s, inst);
        if (card?.ethereal) fading.push(inst);
        else (card?.retain ? kept : pile.discard).push(inst);
    }
    pile.hand = kept;
    for (const inst of fading) exhaustCard(c, unit, inst);
}

// 单位行动后：回合结束被动、回合结束时机的能力与限时 BUFF、卡组单位弃牌、限时 BUFF 计时、易伤与虚弱衰减。
function endUnit(c, unit) {
    if (c.s.outcome || !unit.alive) return;
    triggerPassives(c, unit, 'turn-end', null);
    if (!unit.alive) return;
    for (const p of unit.powers || []) {
        if (p.at !== 'turn-end') continue;
        if (!unit.alive || c.s.outcome) return;
        emit(c, { type: 'power-trigger', unitId: unit.id, cardId: p.id });
        applyEffects(c, unit, p.effects, null, { unitId: unit.id, kind: 'power', id: p.id });
    }
    fireBus(c, unit, 'turn-end', null);
    if (!unit.alive) return;
    if (unit.kind === 'deck') {
        discardHand(c, unit);
        delete unit.handCost;
        delete unit.turnCostMod;
        delete unit.replayNext;
    }
    // 限时 BUFF：本单位每个回合结束减 1，到 0 移除（turns 含施加的这一回合）。
    if (unit.buffs?.length) unit.buffs = unit.buffs.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    for (const key of DECAYING) if (unit.statuses[key] > 0) setStatus(unit, key, unit.statuses[key] - 1);
}


// 出牌：付费、离开手牌后逐次结算效果。X 费按付出的能量重复；「下一张多结算」再乘次数。
// 操控角色打出的牌，顶层效果需要选牌（候选多于要选的张数）时暂停：进度存在 s.play、候选在 s.pending，choose 动作给出选择后续算。
function playCard(c, unit, inst, targetId) {
    const s = c.s;
    const pile = s.piles[unit.id];
    const card = cardView(s, inst);
    const spend = card.cost === 'X' ? unit.energy : card.cost;
    let runs = card.cost === 'X' ? spend : 1;
    pile.hand.splice(pile.hand.indexOf(inst), 1);
    unit.energy -= spend;
    emit(c, { type: 'card', unitId: unit.id, inst, cardId: card.id, name: card.name, skillRef: card.skillRef || card.name, targetId: targetId ?? null, cost: spend });
    const boost = (unit.replayNext || []).findIndex((r) => !r.cardType || r.cardType === card.type);
    if (boost >= 0) {
        const [r] = unit.replayNext.splice(boost, 1);
        runs *= 1 + r.amount;
        emit(c, { type: 'replay', unitId: unit.id, inst, times: r.amount });
    }
    // 本次结算的效果在出牌时定下（同一张牌中途成长不影响本次）。
    s.play = { unitId: unit.id, inst, cardId: card.id, effects: card.effects, targetId: targetId ?? null, runs, run: 0, index: 0, exhaust: false };
    resumePlay(c);
}

function resumePlay(c) {
    const s = c.s;
    const play = s.play;
    const unit = s.units[play.unitId];
    const source = { unitId: unit.id, kind: 'card', id: play.cardId };
    const pausable = unit.id === s.controlledId;
    c.inst = play.inst;
    c.exhaust = play.exhaust;
    while (play.run < play.runs && !s.outcome && unit.alive) {
        while (play.index < play.effects.length && !s.outcome && unit.alive) {
            const e = play.effects[play.index];
            const choice = pausable ? choiceFor(s, unit, e) : null;
            play.index += 1;
            if (choice) {
                play.exhaust = c.exhaust;
                s.pending = { kind: e.op, unitId: unit.id, inst: play.inst, count: choice.count, options: choice.options };
                emit(c, { type: 'choose-start', unitId: unit.id, kind: e.op, count: choice.count, options: choice.options.slice() });
                c.inst = null;
                return;
            }
            applyEffect(c, unit, e, play.targetId, source);
        }
        if (s.outcome || !unit.alive) break;
        play.run += 1;
        play.index = 0;
    }
    finishPlay(c);
}

// 结算完：计数、进弃牌堆或消耗堆、记为本回合上一张，再给被动与限时 BUFF 发「出牌」。
function finishPlay(c) {
    const s = c.s;
    const play = s.play;
    delete s.play;
    const unit = s.units[play.unitId];
    const card = cardView(s, play.inst);
    c.inst = null;
    unit.cardsPlayed += 1;
    const stats = turnStatsOf(unit);
    stats[card.type] += 1;
    const key = cardCountKey(card.id);
    stats.byCard[key] = (stats.byCard[key] || 0) + 1;
    if (card.type === 'power' || c.exhaust) exhaustCard(c, unit, play.inst, card.type !== 'power');
    else s.piles[unit.id].discard.push(play.inst);
    c.exhaust = false;
    unit.lastPlayed = { inst: play.inst, targetId: play.targetId };
    checkOutcome(c);
    fireBus(c, unit, 'card-played', play.targetId, { cardType: card.type });
    // 对方出牌：对侧存活单位的被动按行动顺序接收，主目标为出牌者；没有匹配被动时不发事件。
    for (const id of livingIds(s, opposite(unit.side))) fireBus(c, s.units[id], 'foe-card-played', unit.id, { cardType: card.type });
}

function validatePlay(s, unit, inst, targetId) {
    if (typeof inst !== 'string' || !(s.piles[unit.id]?.hand || []).includes(inst)) return { reason: 'card-not-in-hand' };
    const card = cardView(s, inst);
    if (!card) return { reason: 'card-not-in-hand' };
    if (card.unplayable) return { reason: 'card-unplayable' };
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

// 人物技能与主动特性：skillId 缺省为固有人物技能（heroSkill，耗 heroSkillCost），否则为抽到的主动特性（耗 skill.cost）；各自每回合一次，目标规则与出牌相同。
function activeSkill(unit, skillId) {
    if (skillId === undefined) return unit.heroSkill ? { skill: unit.heroSkill, cost: COMBAT_RULES.heroSkillCost, used: unit.heroSkillUsed === true } : null;
    const trait = (unit.traits || []).find((t) => t.skill?.id === skillId);
    return trait ? { skill: trait.skill, cost: trait.skill.cost, used: (unit.traitSkillsUsed || []).includes(skillId) } : null;
}

function validateHeroSkill(s, unit, targetId, skillId) {
    const active = activeSkill(unit, skillId);
    if (!active) return { reason: 'hero-skill-missing' };
    if (active.used) return { reason: 'hero-skill-used' };
    if (unit.energy < active.cost) return { reason: 'insufficient-energy', detail: { cost: active.cost, energy: unit.energy } };
    return targetError(s, unit, active.skill.effects, targetId);
}

function useHeroSkill(c, unit, targetId, skillId) {
    const { skill, cost } = activeSkill(unit, skillId);
    unit.energy -= cost;
    if (skillId === undefined) unit.heroSkillUsed = true;
    else unit.traitSkillsUsed = [...(unit.traitSkillsUsed || []), skillId];
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
    // 操控角色已倒下（只有 wipe 战斗会出现）：队友与敌人一直自动行动到分出胜负。
    // 步数上限只防双方都打不动的僵持：到上限仍未分出时判负（队友仍站着，战报写落败而不是全队覆灭）。
    const heroDown = () => !s.units[s.controlledId].alive;
    for (let step = 0; !s.outcome && step < (heroDown() ? MAX_TIMELINE_STEPS * WIPE_STEP_FACTOR : MAX_TIMELINE_STEPS); step += 1) {
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
    if (s.outcome) return;
    if (heroDown()) { finish(c, 'defeat'); return; }
    beginHeroTurn(c);
}

// wipe 战斗里操控角色在自己的出牌阶段倒下（自伤、荆棘、回合开始的中毒等）：放弃待选，直接交给时间轴自动推进。
// 先按自动阶段判一次胜负：overkill 战斗里操控角色打空最后一名敌人的同时倒下，此时应直接判胜，而不是交给打不到敌人的队友空转。
function continueWithoutHero(c) {
    const s = c.s;
    if (s.wipe !== true || s.outcome || s.phase !== 'player' || s.units[s.controlledId].alive) return;
    delete s.pending;
    s.phase = 'auto';
    checkOutcome(c);
    if (!s.outcome) runTimeline(c);
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
        // v4：人物特性随单位进局（setup 没有时不写字段）；有抽到的主动特性时才记本回合已用的特性技能。
        if (Array.isArray(u.traits)) {
            unit.traits = clone(u.traits);
            if (unit.traits.some((t) => t.skill)) unit.traitSkillsUsed = [];
        }
    }
    return unit;
}

export function createBattle(setup, seed) {
    const error = setupError(setup) || passivesError(setup)
        || (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? null : { reason: 'invalid-seed' });
    if (error) return { ok: false, state: null, events: [], error };
    const s = {
        // 规则版本取 setup 的（v3 记录在 v4 引擎上重放时仍为 3，托管策略据此保持旧行为）；setup 不带时为当前版本。
        version: ENGINE_VERSION, rulesVersion: setup.rulesVersion ?? COMBAT_RULES.version, seed, rng: seed,
        turn: 1, phase: 'player', outcome: null, controlledId: setup.controlledId, canEscape: setup.canEscape === true,
        order: [], units: {}, cards: {}, catalog: {}, piles: {}, intents: {}, cooldowns: {}, history: {}, avSeq: 0,
        ...(setup.overkill === true ? { overkill: true } : {}),
        ...(setup.wipe === true ? { wipe: true } : {}),
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
        // 固有：洗牌后移到牌库顶（从末尾抽），保证进首手；固有张数多于每回合抽牌数时首回合多抽。没有固有牌时顺序与随机数消耗不变。
        const shuffled = shuffleInPlace(s, draw);
        const innate = shuffled.filter((inst) => owned[s.cards[inst].cardId]?.innate);
        const piled = innate.length ? [...shuffled.filter((inst) => !innate.includes(inst)), ...innate] : shuffled;
        s.piles[u.id] = { draw: piled, hand: [], discard: [], exhaust: [] };
        const extra = innate.length - (u.draw ?? COMBAT_RULES.drawPerTurn);
        if (extra > 0) s.units[u.id].nextTurn.push({ gain: 'draw', amount: extra });
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
    continueWithoutHero(c);
    return { ok: true, state: s, events: c.events };
}

// 选牌动作：insts 为不重复、来自候选、张数等于要求的实例列表。
function validateChoose(s, insts) {
    const p = s.pending;
    if (!Array.isArray(insts) || insts.length !== p.count || new Set(insts).size !== insts.length
        || insts.some((i) => !p.options.includes(i))) return { reason: 'invalid-choice', detail: { count: p.count } };
    return null;
}

// 按玩家的选择结算暂停的那个效果，再续算这张牌的其余效果。
function chooseCards(c, insts) {
    const s = c.s;
    const play = s.play;
    const unit = s.units[play.unitId];
    delete s.pending;
    emit(c, { type: 'choose', unitId: unit.id, insts: insts.slice() });
    c.inst = play.inst;
    c.exhaust = play.exhaust;
    c.chosen = insts.slice();
    applyEffect(c, unit, play.effects[play.index - 1], play.targetId, { unitId: unit.id, kind: 'card', id: play.cardId });
    c.chosen = null;
    play.exhaust = c.exhaust;
    resumePlay(c);
}

function combinations(items, k) {
    const out = [];
    const walk = (start, picked) => {
        if (picked.length === k) { out.push(picked.slice()); return; }
        for (let i = start; i <= items.length - (k - picked.length); i += 1) {
            picked.push(items[i]);
            walk(i + 1, picked);
            picked.pop();
        }
    };
    walk(0, []);
    return out;
}

export function applyAction(state, action) {
    if (!state || typeof state !== 'object' || state.version !== ENGINE_VERSION) return reject(state, 'invalid-state');
    if (state.outcome) return reject(state, 'battle-ended', { outcome: state.outcome });
    if (!action || typeof action !== 'object' || !ACTION_TYPES.includes(action.type)) return reject(state, 'invalid-action');
    if (state.phase !== 'player') return reject(state, 'not-player-phase');
    // 待选阶段只接受 choose；没有待选时不接受 choose。
    if (state.pending) {
        if (action.type !== 'choose') return reject(state, 'choice-pending', { kind: state.pending.kind });
        const error = validateChoose(state, action.insts);
        if (error) return reject(state, error.reason, error.detail);
    } else if (action.type === 'choose') {
        return reject(state, 'no-choice-pending');
    } else if (action.type === 'play') {
        const error = validatePlay(state, state.units[state.controlledId], action.inst, action.targetId);
        if (error) return reject(state, error.reason, error.detail);
    } else if (action.type === 'hero-skill') {
        if (action.skillId !== undefined && typeof action.skillId !== 'string') return reject(state, 'invalid-action');
        const error = validateHeroSkill(state, state.units[state.controlledId], action.targetId, action.skillId);
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
    if (action.type === 'choose') chooseCards(c, action.insts);
    else if (action.type === 'play') playCard(c, s.units[s.controlledId], action.inst, action.targetId ?? null);
    else if (action.type === 'hero-skill') useHeroSkill(c, s.units[s.controlledId], action.targetId ?? null, action.skillId);
    else if (action.type === 'awaken') useAwaken(c, s.units[s.controlledId]);
    else if (action.type === 'item') useItem(c, s.units[s.controlledId], action.itemId, action.targetId ?? null);
    else if (action.type === 'end-turn') endTurn(c);
    else {
        emit(c, { type: 'escape', unitId: s.controlledId });
        finish(c, 'escape');
    }
    continueWithoutHero(c);
    return { ok: true, state: s, events: c.events };
}


export function legalActions(state) {
    if (!state || state.outcome || state.phase !== 'player') return [];
    // 待选阶段只列出合法的选牌组合。
    if (state.pending) return combinations(state.pending.options, state.pending.count).map((insts) => ({ type: 'choose', insts }));
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
    // 抽到的主动特性：动作带 skillId；固有人物技能的动作不带，旧记录形状不变。
    for (const t of unit.traits || []) {
        if (!t.skill) continue;
        const ids = pickable(t.skill.effects);
        if (!ids) { if (!validateHeroSkill(state, unit, undefined, t.skill.id)) actions.push({ type: 'hero-skill', skillId: t.skill.id }); }
        else for (const targetId of ids) if (!validateHeroSkill(state, unit, targetId, t.skill.id)) actions.push({ type: 'hero-skill', skillId: t.skill.id, targetId });
    }
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
