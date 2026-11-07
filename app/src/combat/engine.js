// 战斗引擎：回合制卡牌战斗的状态机。createBattle 建局，applyAction 执行玩家动作并自动推进敌我出手，
// legalActions 列出当前可选动作，replayBattle 按种子重放。全部由种子驱动，同种子同动作得到同结果。
//
// 状态共享约定（v0.39.0 是整局 JSON 深拷贝，这里改为写时复制）：
// - applyAction 不修改传入的 state，返回新 state；没被改动的 unit、牌堆、cooldowns、history、cards、catalog
//   与输入共享同一引用，整局只读。
// - units/piles/cooldowns/history 在工作副本里用惰性访问器：第一次读取某个 id 才浅拷贝它。
//   cards 与 catalog 只在真正写入（成长、费用修正、临时牌）时才复制对应层级。
// - 效果、技能、被动这类静态定义不再深拷贝，引擎对它们只读。
// 行为、数值与事件流与 v0.39.0 一致。
import { COMBAT_RULES, TOKEN_CARDS, estimateEffectsValue, isCompatibleRulesVersion } from './rules.js';
import { BUS_FILTERS, DEFEAT_CAUSES, damageModifiers, hooksAt, isLossKind, opAllowedFor, opHandler, statusDef } from './mechanics/registry.js';
import { isInscription } from './mechanics/inscription.js';
import { hash32, nextRandom, randomInt } from './random.js';
import {
    LOW_HP_RATIO, canAfford, canPlay, cardCountKey, cardView, computeBlock, computeDamage, conditionHolds, playBlock,
    effectsNeedTarget, effectsPickAlly, livingIds, lowestRatioId, opposite, radianceOf, weakestId,
} from './battle-state.js';
import { chooseAllyPlay, chooseSkillIntent, pickCards } from './policy.js';
import { TRAIT_ACTIVE_MAX, TRAIT_KINDS, TRAIT_SKILL_COSTS, TRAIT_SLOT_MAX } from './traits.js';

export const ENGINE_VERSION = 1;
// 同伴一次出手最多打出的牌数。
const MAX_AI_PLAYS = 30;
// 自动推进阶段最多处理的出手次数；主角倒下后继续跑到战斗结束，上限放大。
const AUTO_STEP_LIMIT = 64;
const DEAD_HERO_STEP_FACTOR = 30;
// 行动值（av）的基数，延迟 = 基数 / 速度。
const AV_SCALE = 1e6;
// 被动/触发的嵌套深度上限。
const MAX_DEPTH = 2;
const SIDES = Object.freeze(['ally', 'enemy']);
const UNIT_KINDS = Object.freeze(['deck', 'skill']);
const ACTION_TYPES = Object.freeze(['play', 'end-turn', 'escape', 'hero-skill', 'awaken', 'item', 'choose']);
// 一回合里 buff/被动触发的总次数上限。
const BUS_TRIGGER_LIMIT = 40;
const GROW_MAX = 20;
// 回合结束时每回合减 1 层的状态。
const DECAYING_STATUSES = Object.freeze(['vulnerable', 'weak', 'no-draw', 'frail']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// 施加给自己的状态；其余状态默认打在敌人身上。
const SELF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns', 'artifact']);
const DEFAULT_TARGETS = Object.freeze({ damage: 'enemy', block: 'self', heal: 'self', 'heal-pct': 'self', 'damage-from-block': 'enemy', cleanse: 'self' });
// 负面状态：会被「神器」挡掉、被净化清除。
const DEBUFFS = Object.freeze(['weak', 'vulnerable', 'poison', 'no-draw', 'frail']);
const PASSIVE_FREE_TRIGGERS = new Set(['turn-start', 'turn-end']);

// 仅 createBattle 复制外部输入时使用的深拷贝；战斗中的热路径不用。
const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const cardIdOf = (entry) => (typeof entry === 'string' ? entry : entry?.cardId);
const intInRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const validId = (value) => typeof value === 'string' && value.length > 0 && !FORBIDDEN_KEYS.has(value);

// ctx：一次 createBattle/applyAction 的运行上下文。state 是工作状态，events 收集事件，
// depth 是触发嵌套深度，exhaust 标记当前牌是否要耗尽，inst 是当前正在结算的牌实例。
const emit = (ctx, event) => {
    ctx.events.push({ turn: ctx.state.turn, ...event });
};

function reject(state, reason, detail) {
    return { ok: false, state, events: [], error: detail === undefined ? { reason } : { reason, detail } };
}

export function seedFor(key) {
    return hash32(`igs-combat:${key ?? ''}`);
}

// rng 状态存在 holder.rng 上（holder 是 state）。
function rollInt(holder, bound) {
    const { value, state } = randomInt(holder.rng, bound);
    holder.rng = state;
    return value;
}

function rollFloat(holder) {
    const { value, state } = nextRandom(holder.rng);
    holder.rng = state;
    return value;
}

// Fisher-Yates 原地洗牌。
function shuffle(holder, list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = rollInt(holder, i + 1);
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// stacks 大于 0 才保留该状态，否则删除。
function setStatus(unit, status, stacks) {
    if (stacks > 0) unit.statuses[status] = stacks;
    else delete unit.statuses[status];
}

// 规则 v5 时机钩子：只在 v5 战斗调用，v3/v4 重放不进入。钩子按登记顺序执行，嵌套深度不超过 MAX_DEPTH；
// payload 里的单位是工作副本，改动其他单位须经 ctx.state.units[id] 取得。
const PLAY_RUNS_MAX = 20;
function runHooks(ctx, point, payload) {
    if (!(ctx.state.rulesVersion >= 5) || ctx.state.outcome) return;
    const hooks = hooksAt(point);
    const depth = ctx.hookDepth || 0;
    if (!hooks.length || depth >= MAX_DEPTH) return;
    ctx.hookDepth = depth + 1;
    try {
        for (const hook of hooks) {
            if (ctx.state.outcome) break;
            hook.run(ctx, payload, engineKit(null));
        }
    } finally {
        ctx.hookDepth = depth;
    }
}

// 内置减益或已登记机制声明的减益。
const isDebuff = (status) => DEBUFFS.includes(status) || Boolean(statusDef(status)?.debuff);
// 状态牌（含规则 v5 可打出的「黏浊」）：技能单位的 create 只往对方卡组塞这类牌。
const isStatusCard = (cardId) => typeof cardId === 'string' && cardId.startsWith('status-');

// 施加状态；负面状态先被神器抵消一层。
function addStatus(ctx, unit, status, stacks, source) {
    if (isDebuff(status) && (unit.statuses.artifact || 0) > 0) {
        setStatus(unit, 'artifact', unit.statuses.artifact - 1);
        emit(ctx, { type: 'artifact', source, target: unit.id, status });
        return;
    }
    setStatus(unit, status, (unit.statuses[status] || 0) + stacks);
    emit(ctx, { type: 'status', source, target: unit.id, status, stacks });
    // 规则 v6 G5b：获得状态后（被动可按 status 过滤）。
    if (ctx.state.rulesVersion >= 6) fireBus(ctx, unit, 'status-gained', null, { status });
    if (!isDebuff(status)) return;
    runHooks(ctx, 'debuff-applied', { target: unit, status, stacks, source });
    // 规则 v5 G20：施加方「使敌人陷入减益后」的被动（被人工制品抵消时不算）。
    const applier = ctx.state.rulesVersion >= 5 && source?.unitId != null ? ctx.state.units[source.unitId] : null;
    if (applier && applier.side !== unit.side) fireBus(ctx, applier, 'debuff-applied', unit.id, { status });
}

// 效果的目标类型：显式 target 优先，其次按 op/状态推断。
export function targetSpec(effect) {
    if (effect.target) return effect.target;
    if (effect.op === 'status') return SELF_STATUSES.has(effect.status) ? 'self' : 'enemy';
    return DEFAULT_TARGETS[effect.op] || 'self';
}

// catalog 可以是 Map 或普通对象，统一成普通对象。
function toPlainObject(value) {
    if (value instanceof Map) return Object.fromEntries(value);
    return value && typeof value === 'object' ? value : {};
}

// ---------- 入参校验：返回 null 表示通过，否则 { reason, detail } ----------

// 天赋列表是否非法（数量、主动数、技能 id 重复、字段类型）。
function traitsInvalid(traits) {
    if (!Array.isArray(traits) || traits.length > TRAIT_SLOT_MAX || traits.filter((t) => t?.kind === 'active').length > TRAIT_ACTIVE_MAX) return true;
    const skillIds = traits.filter((t) => t?.skill).map((t) => t.skill.id);
    if (new Set(skillIds).size !== skillIds.length) return true;
    return traits.some((t) => !validId(t?.id) || !TRAIT_KINDS.includes(t.kind)
        || (t.skill !== undefined && (t.kind !== 'active' || !validId(t.skill?.id) || !Array.isArray(t.skill.effects) || !t.skill.effects.length || !TRAIT_SKILL_COSTS.includes(t.skill.cost))));
}

function validateUnit(unit, path) {
    const fail = (reason) => ({ reason, detail: { path } });
    if (!SIDES.includes(unit.side)) return fail('invalid-side');
    if (!UNIT_KINDS.includes(unit.kind)) return fail('invalid-kind');
    if (unit.side === 'enemy' && unit.kind !== 'skill') return fail('enemy-must-use-skills');
    if (!intInRange(unit.maxHp, 1, 9999)) return fail('invalid-hp');
    if (unit.hp !== undefined && !intInRange(unit.hp, 1, unit.maxHp)) return fail('invalid-hp');
    const badScale = unit.damageScale !== undefined && !(typeof unit.damageScale === 'number' && unit.damageScale > 0 && unit.damageScale <= 5);
    const badActions = unit.actions !== undefined && !(unit.kind === 'skill' && intInRange(unit.actions, 1, 2));
    if ((unit.energy !== undefined && !intInRange(unit.energy, 0, 10)) || (unit.draw !== undefined && !intInRange(unit.draw, 0, 10)) || badScale || badActions || (unit.speed !== undefined && !intInRange(unit.speed, 1, 999))) return fail('invalid-stat');
    if (unit.kind === 'skill') {
        if (!Array.isArray(unit.skills) || !unit.skills.length) return fail('missing-skills');
        const phaseSkills = (Array.isArray(unit.phases) ? unit.phases : []).flatMap((phase) => phase?.addSkills || []);
        const bad = [...unit.skills, ...phaseSkills].find((skill) => !validId(skill?.id) || !Array.isArray(skill.effects));
        return bad === undefined ? null : fail('invalid-skill');
    }
    const heroSkill = unit.heroSkill;
    if (heroSkill != null && (!validId(heroSkill?.id) || !Array.isArray(heroSkill.effects) || !heroSkill.effects.length)) return fail('invalid-hero-skill');
    if (unit.traits !== undefined && traitsInvalid(unit.traits)) return fail('invalid-traits');
    if (!Array.isArray(unit.deck) || !unit.deck.length) return fail('empty-deck');
    const catalog = toPlainObject(unit.catalog);
    for (const entry of unit.deck) {
        const cardId = cardIdOf(entry);
        if (!validId(cardId) || !Object.hasOwn(catalog, cardId)) return { reason: 'unknown-card', detail: { path, cardId: cardId ?? null } };
    }
    return null;
}

function awakenInvalid(awaken) {
    if (!awaken || typeof awaken !== 'object' || !Object.hasOwn(COMBAT_RULES.awakenEffects, awaken.type)) return true;
    return awaken.line !== undefined && (typeof awaken.line !== 'string' || awaken.line.length > COMBAT_RULES.awakenLineMax);
}

function itemsInvalid(items) {
    if (!Array.isArray(items) || items.length > 12) return true;
    const seen = new Set();
    for (const item of items) {
        if (!item || !validId(item.itemId) || seen.has(item.itemId) || !intInRange(item.count, 1, 99) || !Array.isArray(item.effects) || !item.effects.length) return true;
        seen.add(item.itemId);
    }
    return false;
}

function validateSetup(setup) {
    if (!setup || typeof setup !== 'object' || !Array.isArray(setup.units)) return { reason: 'invalid-setup' };
    if (setup.rulesVersion !== undefined && !isCompatibleRulesVersion(setup.rulesVersion)) return { reason: 'rules-version-mismatch', detail: { expected: COMBAT_RULES.version, actual: setup.rulesVersion } };
    if (setup.awaken !== undefined && awakenInvalid(setup.awaken)) return { reason: 'invalid-awaken' };
    if (setup.items !== undefined && itemsInvalid(setup.items)) return { reason: 'invalid-items' };
    if (setup.overkill !== undefined && typeof setup.overkill !== 'boolean') return { reason: 'invalid-setup' };
    if (setup.wipe !== undefined && typeof setup.wipe !== 'boolean') return { reason: 'invalid-setup' };
    // openingCharged（v0.39.2）：开局先手计入操控角色的行动条；randomTargets（v0.39.2）：敌人随机选攻击对象。旧 setup 不带时规则不变。
    if (setup.openingCharged !== undefined && typeof setup.openingCharged !== 'boolean') return { reason: 'invalid-setup' };
    if (setup.randomTargets !== undefined && typeof setup.randomTargets !== 'boolean') return { reason: 'invalid-setup' };
    // foeCap（规则 v6 敌方编制）：场上普通敌人（不含爪牙）上限，空出的总位置只给爪牙；旧 setup 不带时只按总位置算。
    if (setup.foeCap !== undefined && !(Number.isInteger(setup.foeCap) && setup.foeCap >= 1 && setup.foeCap <= COMBAT_RULES.maxEnemiesOnField)) return { reason: 'invalid-setup' };
    const ids = new Set();
    for (const [index, unit] of setup.units.entries()) {
        const path = `units[${index}]`;
        if (!unit || typeof unit.id !== 'string' || !ID_PATTERN.test(unit.id) || FORBIDDEN_KEYS.has(unit.id) || ids.has(unit.id)) return { reason: 'invalid-unit-id', detail: { path } };
        ids.add(unit.id);
        const problem = validateUnit(unit, path);
        if (problem) return problem;
    }
    const enemyCount = setup.units.filter((unit) => unit.side === 'enemy').length;
    if (!enemyCount || enemyCount === setup.units.length) return { reason: 'missing-side' };
    if (enemyCount > COMBAT_RULES.maxEnemies) return { reason: 'too-many-enemies', detail: { max: COMBAT_RULES.maxEnemies } };
    const reserve = setup.reserve ?? [];
    const isEnemy = (id) => setup.units.some((unit) => unit.id === id && unit.side === 'enemy');
    if (!Array.isArray(reserve) || reserve.length >= enemyCount || reserve.some((id, index) => typeof id !== 'string' || reserve.indexOf(id) !== index || !isEnemy(id))) return { reason: 'invalid-reserve' };
    if (enemyCount - reserve.length > COMBAT_RULES.maxEnemiesOnField) return { reason: 'too-many-enemies', detail: { max: COMBAT_RULES.maxEnemiesOnField } };
    if (setup.foeCap !== undefined && enemyCount - reserve.length > setup.foeCap) return { reason: 'too-many-enemies', detail: { max: setup.foeCap } };
    const hero = setup.units.find((unit) => unit.id === setup.controlledId);
    return !hero || hero.side !== 'ally' || hero.kind !== 'deck' ? { reason: 'invalid-controlled' } : null;
}

function validatePassives(setup) {
    for (const [index, unit] of setup.units.entries()) {
        const phasePassives = (Array.isArray(unit.phases) ? unit.phases : []).flatMap((phase) => phase?.passives || []);
        const passives = unit.passives === undefined ? [] : unit.passives;
        if (!Array.isArray(passives) || [...passives, ...phasePassives].some((p) => !validId(p?.id) || !Array.isArray(p.effects))) return { reason: 'invalid-passive', detail: { path: `units[${index}]` } };
    }
    return null;
}

// 「趁胜追击」模式：玩家阶段、以 unit 为主角、setup 开了 overkill 时，可以继续打已倒下的敌人。
export const isWhipping = (state, unit) => state?.overkill === true && state.phase === 'player' && !!unit && unit.id === state.controlledId;

// ---------- 写时复制 ----------

// 惰性映射：返回与 source 同键的对象，第一次读取某个键时才用 clone 复制该项。
// 没被读取的键在 finishLazy 里还原成指向 source 的普通值（共享引用）。
const lazySources = new WeakMap();
function lazyMap(source, clone) {
    const map = {};
    lazySources.set(map, source);
    for (const key of Object.keys(source)) {
        Object.defineProperty(map, key, {
            configurable: true,
            enumerable: true,
            get() {
                const copy = clone(source[key]);
                Object.defineProperty(map, key, { value: copy, writable: true, configurable: true, enumerable: true });
                return copy;
            },
            set(value) {
                Object.defineProperty(map, key, { value, writable: true, configurable: true, enumerable: true });
            },
        });
    }
    return map;
}

function finishLazy(map) {
    const source = lazySources.get(map);
    for (const key of Object.keys(map)) {
        if (Object.getOwnPropertyDescriptor(map, key).get) {
            Object.defineProperty(map, key, { value: source[key], writable: true, configurable: true, enumerable: true });
        }
    }
}

// 复制单位：只复制会被原地修改的容器，静态定义（技能、被动、阶段、天赋）共享。
function cloneUnit(unit) {
    const copy = { ...unit, statuses: { ...unit.statuses }, nextTurn: unit.nextTurn.slice(), powers: unit.powers.slice() };
    if (unit.buffs) copy.buffs = unit.buffs.slice();
    if (unit.replayNext) copy.replayNext = unit.replayNext.slice();
    if (unit.traitSkillsUsed) copy.traitSkillsUsed = unit.traitSkillsUsed.slice();
    if (unit.turnCostMod) copy.turnCostMod = { ...unit.turnCostMod };
    if (unit.turnStats) copy.turnStats = { ...unit.turnStats, byCard: { ...unit.turnStats.byCard } };
    // 规则 v5 单位资源容器（心境、法珠槽、随从等，可能含嵌套数组），整体深拷贝。
    if (unit.res) copy.res = deepCopy(unit.res);
    return copy;
}

const clonePile = (pile) => ({ draw: pile.draw.slice(), hand: pile.hand.slice(), discard: pile.discard.slice(), exhaust: pile.exhaust.slice() });

// 为一次 applyAction 建工作副本：顶层与小对象立即浅拷贝，大对象惰性复制。
// cards 与 catalog 保持共享，由 ownCard/ownCatalog 在写入前复制。
function forkState(source) {
    const work = { ...source };
    work.units = lazyMap(source.units, cloneUnit);
    work.piles = lazyMap(source.piles, clonePile);
    work.cooldowns = lazyMap(source.cooldowns, (cooldown) => ({ ...cooldown }));
    work.history = lazyMap(source.history, (list) => list.slice());
    work.order = source.order.slice();
    work.intents = { ...source.intents };
    if (source.reserve) work.reserve = source.reserve.slice();
    if (source.awaken) work.awaken = { ...source.awaken };
    if (source.items) work.items = { ...source.items, list: source.items.list.map((item) => ({ ...item })) };
    if (source.play) work.play = { ...source.play };
    return work;
}

// 收尾：把没被碰过的惰性项还原成共享引用。
function finishState(state) {
    finishLazy(state.units);
    finishLazy(state.piles);
    finishLazy(state.cooldowns);
    finishLazy(state.history);
}

// 写 cards[inst] 前调用：保证 cards 和该条目是本次工作副本私有的。
function ownCard(ctx, inst) {
    const state = ctx.state;
    if (!ctx.fresh) {
        if (!ctx.cardCopies) {
            state.cards = { ...state.cards };
            ctx.cardCopies = new Set();
        }
        if (!ctx.cardCopies.has(inst) && state.cards[inst]) {
            state.cards[inst] = { ...state.cards[inst] };
            ctx.cardCopies.add(inst);
        }
    }
    return state.cards[inst];
}

// 新增 cards 条目前调用：只需要 cards 本身是私有的。
function ownCardsMap(ctx) {
    if (!ctx.fresh && !ctx.cardCopies) {
        ctx.state.cards = { ...ctx.state.cards };
        ctx.cardCopies = new Set();
    }
    return ctx.state.cards;
}

// 写 catalog[ownerId] 前调用，返回该单位私有的牌定义表。
function ownCatalog(ctx, ownerId) {
    const state = ctx.state;
    if (!ctx.fresh) {
        if (!ctx.catalogCopies) {
            state.catalog = { ...state.catalog };
            ctx.catalogCopies = new Set();
        }
        if (!ctx.catalogCopies.has(ownerId)) {
            state.catalog[ownerId] = { ...state.catalog[ownerId] };
            ctx.catalogCopies.add(ownerId);
        }
    }
    return state.catalog[ownerId];
}

const newCtx = (state, fresh = false) => ({ state, events: [], depth: 0, exhaust: false, fresh });

// ---------- 目标选择 ----------

// 解析效果目标。aimId 是动作指定的目标；allowDead 为真时（趁胜追击）已倒下的敌人也算。
function resolveTargets(ctx, source, spec, aimId, allowDead = false) {
    const state = ctx.state;
    const foeSide = opposite(source.side);
    const toUnits = (ids) => ids.map((id) => state.units[id]);
    const foeIds = () => {
        const alive = livingIds(state, foeSide);
        return alive.length || !allowDead ? alive : state.order.filter((id) => state.units[id].side === foeSide);
    };
    switch (spec) {
        case 'enemy': {
            if (aimId == null) {
                const picked = attackTargetId(ctx, source);
                return picked ? [state.units[picked]] : [];
            }
            const aimed = Object.hasOwn(state.units, aimId) ? state.units[aimId] : null;
            return aimed && aimed.side === foeSide && (aimed.alive || allowDead) ? [aimed] : [];
        }
        case 'all-enemies':
            return toUnits(foeIds());
        case 'random-enemy': {
            const ids = foeIds();
            return ids.length ? [state.units[ids[rollInt(state, ids.length)]]] : [];
        }
        case 'self':
            return source.alive ? [source] : [];
        case 'ally': {
            const aimed = aimId != null && Object.hasOwn(state.units, aimId) ? state.units[aimId] : null;
            if (aimed?.alive && aimed.side === source.side) return [aimed];
            const lowest = lowestRatioId(state, source.side);
            return lowest ? [state.units[lowest]] : [];
        }
        case 'all-allies':
            return toUnits(livingIds(state, source.side));
        case 'other-allies':
            return toUnits(livingIds(state, source.side).filter((id) => id !== source.id));
        default:
            return [];
    }
}

// ---------- 胜负、伤害、治疗 ----------

function endBattle(ctx, outcome) {
    if (ctx.state.outcome) return;
    ctx.state.outcome = outcome;
    ctx.state.phase = 'ended';
    emit(ctx, { type: 'battle-end', outcome });
}

// 检查胜负：主角倒下（或 wipe 模式下全员倒下）判负；敌人全灭判胜（趁胜追击的玩家阶段除外）。
function checkOutcome(ctx) {
    const state = ctx.state;
    if (state.outcome) return;
    if (ctx.holdOutcome) return;
    const lost = state.wipe === true ? !livingIds(state, 'ally').length : !state.units[state.controlledId].alive;
    if (lost) endBattle(ctx, 'defeat');
    else if (!livingIds(state, 'enemy').length && !(state.overkill === true && state.phase === 'player')) endBattle(ctx, 'victory');
}

// 敌人倒下后，后备队的下一个顶上它的出手位（规则 v5 爪牙与待复生单位倒下不顶位）。
function reinforce(ctx, fallen) {
    const state = ctx.state;
    if (fallen.side !== 'enemy' || fallen.minion === true || fallen.res?.reviveAt != null || !state.reserve?.length) return;
    const nextId = state.reserve.shift();
    if (!state.reserve.length) delete state.reserve;
    state.order[state.order.indexOf(fallen.id)] = nextId;
    const recruit = state.units[nextId];
    emit(ctx, { type: 'reinforce', unitId: nextId, replaced: fallen.id });
    enterUnit(ctx, recruit);
}

// 单位入场（后备补位与规则 v5 运行时召唤共用）：排进行动条、技能单位规划意图，再触发战斗开始被动。
function enterUnit(ctx, unit) {
    scheduleUnit(ctx.state, unit);
    if (unit.kind === 'skill') planIntent(ctx, unit);
    fireTrigger(ctx, unit, 'battle-start', null);
}

// 规则 v5 运行时新增敌方技能单位（E10 分裂、E13 召唤爪牙共用）：在场存活敌人不足 maxEnemiesOnField 时建出单位并补齐 cooldowns / history，
// 追加到出手顺序末尾；id 取 `<来源>-<tag><n>`，序号顺延避开已有单位。只建不入场（调用方发事件后再 enterUnit），满员返回 null。
// state.foeCap 存在时，新单位不是爪牙（minion 为假）还要求在场普通敌人少于 foeCap；爪牙只受总位置限制，占普通敌人空出的位置。
function spawnUnit(ctx, owner, def, tag, minion = false) {
    const state = ctx.state;
    const living = livingIds(state, 'enemy');
    if (living.length >= COMBAT_RULES.maxEnemiesOnField) return null;
    if (!minion && state.foeCap && living.filter((id) => state.units[id].minion !== true).length >= state.foeCap) return null;
    const base = String(owner.id).slice(0, 56);
    let n = 1;
    while (Object.hasOwn(state.units, `${base}-${tag}${n}`)) n += 1;
    const id = `${base}-${tag}${n}`;
    const unit = buildUnit({ ...def, id, side: 'enemy', kind: 'skill' });
    state.units[id] = unit;
    state.cooldowns[id] = {};
    state.history[id] = [];
    state.order.push(id);
    return unit;
}

// 规则 v5 E13 召唤爪牙：只限存活敌方召唤者，写 minion / minionOf；返回新单位，未入场返回 null。v3/v4 不调用。
function summonUnit(ctx, owner, def) {
    const state = ctx.state;
    if (!(state.rulesVersion >= 5) || state.outcome || !owner?.alive || owner.side !== 'enemy') return null;
    const unit = spawnUnit(ctx, owner, def, 'm', true);
    if (!unit) return null;
    unit.minion = true;
    unit.minionOf = owner.id;
    emit(ctx, { type: 'minion-enter', unitId: unit.id, ownerId: owner.id, name: unit.name });
    enterUnit(ctx, unit);
    return unit;
}

// 规则 v5 E10 分裂：原单位退场（left = 'split'，不发 defeated、不补位），按当前生命分出至多两只子体（最大与当前生命都取原单位当前生命），
// 沿用技能、被动、速度、伤害系数、阶级与立绘，写 splitFrom（子体不再分裂）；原单位是爪牙时子体仍是同一召唤者的爪牙。返回子体列表。
function splitUnit(ctx, unit) {
    const state = ctx.state;
    if (!(state.rulesVersion >= 5) || state.outcome || !unit?.alive || unit.side !== 'enemy' || unit.kind !== 'skill' || unit.splitFrom) return [];
    const hp = unit.hp;
    unit.alive = false;
    unit.block = 0;
    unit.left = 'split';
    delete state.intents[unit.id];
    const def = {
        name: unit.name, maxHp: hp, hp, speed: unit.speed, damageScale: unit.damageScale, skills: unit.skills, passives: unit.passives,
        ...(unit.art ? { art: unit.art } : {}), ...(unit.tier ? { tier: unit.tier } : {}), ...(unit.actions ? { actions: unit.actions } : {}),
    };
    const children = [];
    for (let i = 0; i < 2; i += 1) {
        const child = spawnUnit(ctx, unit, def, 's', unit.minion === true);
        if (!child) break;
        child.splitFrom = unit.id;
        if (unit.minion === true) {
            child.minion = true;
            child.minionOf = unit.minionOf;
        }
        children.push(child);
    }
    emit(ctx, { type: 'split', unitId: unit.id, into: children.map((child) => child.id), hp });
    for (const child of children) enterUnit(ctx, child);
    return children;
}

// 规则 v5 E11 复生：已倒下（未退场）的单位以 hp 生命复活，状态只留 keep 里的，重新排进行动条并规划意图；不触发战斗开始被动。
function reviveUnit(ctx, unit, hp, keep = {}) {
    const state = ctx.state;
    if (!(state.rulesVersion >= 5) || state.outcome || !unit || unit.alive || unit.left) return false;
    unit.alive = true;
    unit.hp = Math.max(1, Math.min(unit.maxHp, Math.floor(hp)));
    unit.block = 0;
    unit.statuses = { ...keep };
    emit(ctx, { type: 'revive', unitId: unit.id, hp: unit.hp });
    scheduleUnit(state, unit);
    if (unit.kind === 'skill') planIntent(ctx, unit);
    return true;
}

// 规则 v5 E12 爪牙退场：不算倒下（不发 defeated、不触发击杀与补位），记 left，战报与面板写「退场」。
function dismissUnit(ctx, unit) {
    if (!unit?.alive) return;
    unit.alive = false;
    unit.block = 0;
    unit.left = true;
    delete ctx.state.intents[unit.id];
    emit(ctx, { type: 'minion-leave', unitId: unit.id, ownerId: unit.minionOf ?? null });
}

// 规则 v5 E17 自爆、限时撤离：单位离场（不发 defeated、不触发击杀），记 left = reason（'explode' / 'fled'），非爪牙照原规则由后备顶位；
// 敌方撤离使本场不给战利品（D11，state.noLoot）。离场后按原规则判胜负；战斗已结束或单位已不在场时不动。
function retireUnit(ctx, unit, reason) {
    const state = ctx.state;
    if (!(state.rulesVersion >= 5) || state.outcome || !unit?.alive) return false;
    unit.alive = false;
    unit.block = 0;
    unit.left = reason;
    delete state.intents[unit.id];
    if (reason === 'fled' && unit.side === 'enemy') state.noLoot = true;
    emit(ctx, { type: 'unit-leave', unitId: unit.id, reason });
    reinforce(ctx, unit);
    checkOutcome(ctx);
    return true;
}

// 结算一次伤害，返回实际扣掉的生命。blockable 为假时无视格挡（中毒、自伤）。
// source 是事件里的来源；kind 是 attack/thorns/poison/self。strike 是同一次攻击的序号。
function dealDamage(ctx, target, amount, source, kind, blockable, strike = 0) {
    if (ctx.state.outcome || !target.alive || amount <= 0) return 0;
    // 规则 v5：中毒、自伤等「失去生命」不算受到伤害，不触发伤害前后钩子，只走失去生命钩子。
    const v5 = ctx.state.rulesVersion >= 5;
    const loss = v5 && isLossKind(kind);
    if (v5 && !loss) {
        const pre = { target, amount, source, kind, blockable };
        runHooks(ctx, 'damage-before', pre);
        if (Number.isFinite(pre.amount)) amount = Math.max(0, Math.floor(pre.amount));
        if (ctx.state.outcome || !target.alive || amount <= 0) return 0;
    }
    if ((target.statuses.intangible || 0) > 0) amount = Math.min(amount, 1);
    const blocked = blockable ? Math.min(target.block, amount) : 0;
    target.block -= blocked;
    // 规则 v5 G20：本次伤害把格挡打空。
    const broke = v5 && blocked > 0 && target.block === 0;
    let hpLoss = Math.min(target.hp, amount - blocked);
    if (hpLoss > 0 && ctx.state.rulesVersion >= 5) {
        const pre = { target, hpLoss, source, kind };
        runHooks(ctx, 'hp-loss-before', pre);
        if (ctx.state.outcome || !target.alive) return 0;
        if (Number.isFinite(pre.hpLoss)) hpLoss = Math.max(0, Math.min(target.hp, Math.floor(pre.hpLoss)));
    }
    const endured = hpLoss >= target.hp && (target.statuses.endure || 0) > 0;
    if (endured) {
        hpLoss = target.hp - 1;
        setStatus(target, 'endure', 0);
    }
    target.hp -= hpLoss;
    const event = { type: 'damage', kind, source, target: target.id, amount, blocked, hpLoss };
    if (strike) event.strike = strike;
    if (loss) event.loss = true;
    emit(ctx, event);
    if (endured) {
        target.block += COMBAT_RULES.endureBlock;
        emit(ctx, { type: 'endure', unitId: target.id, block: COMBAT_RULES.endureBlock });
    }
    if (target.hp <= 0) {
        target.alive = false;
        target.block = 0;
        delete ctx.state.intents[target.id];
        emit(ctx, { type: 'defeated', unitId: target.id });
        runHooks(ctx, 'defeated', { unit: target, source, kind });
        reinforce(ctx, target);
    } else if (hpLoss > 0) {
        checkHpThresholds(ctx, target);
    }
    if (!loss) runHooks(ctx, 'damage-after', { target, source, kind, amount, blocked, hpLoss });
    if (hpLoss > 0) runHooks(ctx, 'hp-loss-after', { target, source, kind, hpLoss });
    checkOutcome(ctx);
    const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
    // 规则 v5：爪牙倒下、分裂或退场（left）不算击杀。
    if (!target.alive && kind === 'attack' && attacker && attacker.side !== target.side && target.minion !== true && !target.left) fireBus(ctx, attacker, 'kill', null);
    else if (target.alive && hpLoss > 0) fireBus(ctx, target, 'hp-loss', null);
    // 规则 v6 G5b：敌方单位因任意原因倒下（爪牙、分裂、退场不算），对面每个存活单位各触发一次，被动可按 cause 过滤死因。
    if (!target.alive && ctx.state.rulesVersion >= 6 && target.minion !== true && !target.left) {
        const cause = DEFEAT_CAUSES.includes(kind) ? kind : 'other';
        for (const id of ctx.state.order) if (ctx.state.units[id]?.side !== target.side) fireBus(ctx, ctx.state.units[id], 'defeated', null, { cause });
    }
    if (broke && target.alive) fireBus(ctx, target, 'block-broken', null);
    return hpLoss;
}

function heal(ctx, target, amount, source) {
    if (!target.alive) return;
    const healed = Math.min(target.maxHp - target.hp, amount);
    target.hp += healed;
    emit(ctx, { type: 'heal', source, target: target.id, amount: healed });
}

// 获得格挡：加到目标并发 block 事件（数值为 0 也发，与 v3/v4 事件流一致），再触发「获得格挡」总线。
// 规则 v5 在两者之间走 block-gained 钩子；extra 同时写进事件与钩子（如共盾分出的格挡带 shared: true）。
function gainBlock(ctx, target, amount, source, extra = {}) {
    target.block += amount;
    emit(ctx, { type: 'block', source, target: target.id, amount, ...extra });
    if (amount <= 0) return;
    runHooks(ctx, 'block-gained', { target, amount, source, ...extra });
    fireBus(ctx, target, 'block-gain', null, { amount });
}

// 血量低于阈值时触发一次性的低血被动，并依次进入满足条件的阶段。
function checkHpThresholds(ctx, unit) {
    if (!unit.lowHpTriggered && unit.hp < unit.maxHp * LOW_HP_RATIO) {
        unit.lowHpTriggered = true;
        fireTrigger(ctx, unit, 'on-low-hp', null);
    }
    while (unit.alive && unit.phasesApplied < unit.phases.length && unit.hp * 100 < unit.maxHp * unit.phases[unit.phasesApplied].hpBelowPct) {
        enterPhase(ctx, unit, unit.phases[unit.phasesApplied]);
    }
}

// 进入下一阶段：替换技能、追加被动；当前意图已不存在时重新规划。
function enterPhase(ctx, unit, phase) {
    unit.phasesApplied += 1;
    const removed = new Set(phase.removeSkills || []);
    const added = phase.addSkills || [];
    const addedIds = new Set(added.map((skill) => skill.id));
    unit.skills = [...unit.skills.filter((skill) => !removed.has(skill.id) && !addedIds.has(skill.id)), ...added];
    unit.passives = [...unit.passives, ...(phase.passives || [])];
    emit(ctx, { type: 'phase', unitId: unit.id, index: unit.phasesApplied });
    const intent = ctx.state.intents[unit.id];
    if (intent && !unit.skills.some((skill) => skill.id === intent.skillId)) planIntent(ctx, unit);
}

// ---------- 被动与触发总线 ----------

// 固定触发点（战斗开始、受击、低血）上的被动。深度超限时不触发。
function fireTrigger(ctx, unit, trigger, aimId) {
    if (ctx.depth >= MAX_DEPTH) return;
    ctx.depth += 1;
    for (const passive of unit.passives) {
        if (passive.trigger !== trigger || !unit.alive || ctx.state.outcome) continue;
        emit(ctx, { type: 'passive', unitId: unit.id, passiveId: passive.id, trigger });
        runEffects(ctx, unit, passive.effects, aimId, { unitId: unit.id, kind: 'passive', id: passive.id });
    }
    ctx.depth -= 1;
}

const busOpen = (ctx) => ctx.depth < MAX_DEPTH && (ctx.state.busTriggers || 0) < BUS_TRIGGER_LIMIT;

// 事件总线：打牌/弃牌/获得格挡等时机触发被动与限时 buff。每回合总次数受 BUS_TRIGGER_LIMIT 限制。
// extra 为本次触发的附带信息（BUS_FILTERS：cardType / status / orb / cause）：被动或 buff 带同名过滤字段时必须相等才触发。
// 规则 v6：正在结算的被动不会被自己的效果再次触发（如「施加中毒时再施加 1 层」不连锁）。
function fireBus(ctx, unit, trigger, aimId, extra = {}) {
    if (!unit?.alive || ctx.state.outcome) return;
    const matches = (entry) => entry.trigger === trigger && BUS_FILTERS.every((key) => !entry[key] || entry[key] === extra[key]);
    const passives = PASSIVE_FREE_TRIGGERS.has(trigger) ? [] : (unit.passives || []).filter(matches);
    const buffs = (unit.buffs || []).filter(matches);
    if ((!passives.length && !buffs.length) || !busOpen(ctx)) return;
    ctx.depth += 1;
    const guard = ctx.state.rulesVersion >= 6 ? (ctx.running ||= new Set()) : null;
    const run = (kind, entry, effects, eventExtra) => {
        if (!unit.alive || ctx.state.outcome || (ctx.state.busTriggers || 0) >= BUS_TRIGGER_LIMIT) return;
        const key = `${unit.id}|${kind}|${entry.id}`;
        if (guard?.has(key)) return;
        ctx.state.busTriggers = (ctx.state.busTriggers || 0) + 1;
        emit(ctx, { type: kind === 'passive' ? 'passive' : 'buff-trigger', unitId: unit.id, ...eventExtra, trigger });
        guard?.add(key);
        runEffects(ctx, unit, effects, aimId, { unitId: unit.id, kind, id: entry.id });
        guard?.delete(key);
    };
    for (const passive of passives) run('passive', passive, passive.effects, { passiveId: passive.id });
    for (const buff of buffs) run('buff', buff, buff.then, { buffId: buff.id });
    ctx.depth -= 1;
}

// ---------- 效果结算 ----------

function runEffects(ctx, unit, effects, aimId, source) {
    for (const effect of effects || []) {
        if (ctx.state.outcome || !unit.alive) return;
        applyEffect(ctx, unit, effect, aimId, source);
    }
}

// 当前正在结算的牌实例（没有则空）。
const currentInst = (ctx) => (ctx.inst ? [ctx.inst] : []);

// 交给已登记机制的引擎工具（只在规则 v5 战斗中调用；运行时取用，避免模块加载顺序问题）。
// 单位资源容器：只在 v5 战斗中按需创建；v3/v4 返回 null，旧战斗的单位形状不变。
function resOf(ctx, unit) {
    if (!(ctx.state.rulesVersion >= 5) || !unit) return null;
    if (!unit.res) unit.res = {};
    return unit.res;
}
// 规则 v5 B08 加演（D8）：登记后，本单位这次出手结束时行动值归 0 并立即再出手一次，期间其他单位不行动；每场一次。
// 记在 res.encore（ready / used），由 endPlayerTurn 与 runAutoPhase 消费；v3/v4 没有 res，登记与消费都不发生。
function grantEncore(ctx, unit) {
    const res = resOf(ctx, unit);
    if (!res || res.encore) return false;
    res.encore = 'ready';
    emit(ctx, { type: 'encore-ready', unitId: unit.id });
    return true;
}
function takeEncore(ctx, unit) {
    if (unit.res?.encore !== 'ready' || !unit.alive || ctx.state.outcome) return false;
    unit.res.encore = 'used';
    unit.av = 0;
    emit(ctx, { type: 'encore', unitId: unit.id });
    return true;
}
const engineKit = (targets) => ({
    emit, dealDamage, addStatus, setStatus, heal, gainBlock, strike, runEffects, drawCards, fireBus, rollInt, computeDamage, computeBlock, resOf, ownCatalog, targets,
    // 规则 v5 牌堆操作用：弃牌、消耗、临时牌、写时复制、选牌（choose 时消费玩家选择或按策略选）、牌面视图与效果估值。
    discardCard, exhaustCard, addTempCard, copyCard, ownCard, selectCards, cardView, cardValue: estimateEffectsValue, handLimit: COMBAT_RULES.handLimit,
    // 规则 v5 B08 加演（mechanics/cadence.js）：只登记，行动顺序由本文件处理。
    grantEncore,
    // 规则 v5 P5b 预燃（mechanics/inscription.js）：免费打出，与狡黠同一流程。
    freePlay: slyPlay,
    // 规则 v5 E04 应变：技能单位重选意图；E08 时滞：请求在本次玩家动作结算完后结束玩家回合。
    replanIntent: (ctx, unit) => {
        if (unit?.kind === 'skill' && unit.alive && !ctx.state.outcome) planIntent(ctx, unit);
    },
    requestEndTurn: (ctx) => {
        ctx.endTurnRequested = true;
    },
    // 规则 v5 E10–E13：运行时新增、移除与复活单位只经这些入口（mechanics/foe-units.js）。
    summonUnit, dismissUnit, splitUnit, reviveUnit, retireUnit,
});

// 单个效果的结算。source 记录来源（单位、种类、id），写进事件。
function applyEffect(ctx, unit, effect, aimId, source) {
    const state = ctx.state;
    const targets = () => resolveTargets(ctx, unit, targetSpec(effect), aimId);
    switch (effect.op) {
        case 'damage':
            strike(ctx, unit, effect, aimId, source);
            return;
        case 'block':
            for (const target of targets()) gainBlock(ctx, target, computeBlock(unit, effect.amount, target, state.rulesVersion, source?.kind), source);
            return;
        case 'heal':
            for (const target of targets()) heal(ctx, target, effect.amount, source);
            return;
        case 'draw':
            if (unit.kind === 'deck') drawCards(ctx, unit, effect.amount);
            return;
        case 'energy':
            if (unit.kind !== 'deck') return;
            unit.energy += effect.amount;
            emit(ctx, { type: 'energy', unitId: unit.id, amount: effect.amount });
            return;
        case 'status':
            for (const target of targets()) addStatus(ctx, target, effect.status, effect.stacks, source);
            return;
        case 'exhaust-self':
            if (source.kind === 'card') ctx.exhaust = true;
            return;
        case 'conditional':
            if (conditionHolds(state, unit, effect.when, aimId, source?.kind === 'card' ? source.id : null)) runEffects(ctx, unit, effect.then, aimId, source);
            return;
        case 'heal-pct':
            for (const target of targets()) heal(ctx, target, Math.max(1, Math.round((target.maxHp * effect.pct) / 100)), source);
            return;
        case 'delayed-counter': {
            const [target] = targets();
            const lost = dealDamage(ctx, unit, effect.amount, source, 'self', false);
            if (!target || !unit.alive || state.outcome || lost <= 0) return;
            const intentSkill = state.intents[target.id]?.skillId;
            unit.nextTurn.push({ gain: 'counter', amount: lost * effect.mult, targetId: target.id, fizzled: effect.fizzle != null && intentSkill === effect.fizzle });
            emit(ctx, { type: 'next-turn', unitId: unit.id, gain: 'counter' });
            return;
        }
        case 'mutual-damage': {
            const foes = targets();
            ctx.holdOutcome = true;
            for (const foe of foes) dealDamage(ctx, foe, effect.amount, source, 'mutual', false);
            dealDamage(ctx, unit, effect.selfAmount ?? effect.amount, source, 'mutual', false);
            ctx.holdOutcome = false;
            checkOutcome(ctx);
            return;
        }
        case 'random-branch': {
            const pick = rollInt(state, 2) === 0 ? 'a' : 'b';
            emit(ctx, { type: 'random-branch', source, pick });
            runEffects(ctx, unit, effect[pick], aimId, source);
            return;
        }
        case 'damage-from-block':
            if (unit.block > 0) strike(ctx, unit, { op: 'damage', amount: unit.block, target: effect.target || 'enemy' }, aimId, source);
            return;
        case 'self-damage':
            dealDamage(ctx, unit, effect.amount, source, 'self', false);
            return;
        case 'double':
            for (const target of targets()) {
                if (effect.stat === 'block') {
                    gainBlock(ctx, target, target.block, source);
                } else {
                    const stacks = target.statuses[effect.stat] || 0;
                    if (stacks <= 0) continue;
                    setStatus(target, effect.stat, Math.min(99, stacks * 2));
                    emit(ctx, { type: 'status', source, target: target.id, status: effect.stat, stacks });
                }
            }
            return;
        case 'next-turn':
            unit.nextTurn.push(effect.gain === 'status' ? { gain: 'status', status: effect.status, stacks: effect.stacks } : { gain: effect.gain, amount: effect.amount });
            emit(ctx, { type: 'next-turn', unitId: unit.id, gain: effect.gain });
            return;
        case 'each-turn':
            unit.powers.push(effect.at === 'turn-end' ? { id: source.id, effects: effect.then, at: 'turn-end' } : { id: source.id, effects: effect.then });
            return;
        case 'hand-cost':
            if (unit.kind !== 'deck') return;
            unit.handCost = Math.max(-3, (unit.handCost || 0) + effect.amount);
            emit(ctx, { type: 'hand-cost', unitId: unit.id, amount: unit.handCost });
            return;
        case 'cleanse':
            for (const target of targets()) {
                // 规则 v5 另清已登记机制声明的减益（排在内置减益之后）；v3/v4 只清内置减益。
                const registered = state.rulesVersion >= 5
                    ? Object.keys(target.statuses).filter((status) => !DEBUFFS.includes(status) && statusDef(status)?.debuff && (target.statuses[status] || 0) > 0) : [];
                const removed = [...DEBUFFS.filter((status) => (target.statuses[status] || 0) > 0), ...registered];
                for (const status of removed) setStatus(target, status, 0);
                if (removed.length) emit(ctx, { type: 'cleanse', source, target: target.id, statuses: removed });
            }
            return;
        case 'discard': {
            if (unit.kind !== 'deck') return;
            const hand = state.piles[unit.id].hand;
            for (const inst of selectCards(ctx, effect.mode, hand.slice(), Math.min(effect.amount, hand.length), 'discard')) discardCard(ctx, unit, inst);
            return;
        }
        case 'discard-hand': {
            if (unit.kind !== 'deck') return;
            const hand = state.piles[unit.id].hand.slice();
            for (const inst of hand) discardCard(ctx, unit, inst);
            if (effect.redraw && hand.length && unit.alive && !state.outcome) drawCards(ctx, unit, hand.length);
            return;
        }
        case 'copy': {
            if (unit.kind !== 'deck') return;
            const picked = effect.from === 'self' ? currentInst(ctx) : selectCards(ctx, effect.from, state.piles[unit.id].hand.slice(), 1, 'copy');
            for (const inst of picked) for (let i = 0; i < effect.amount; i += 1) copyCard(ctx, unit, inst, effect.to);
            return;
        }
        case 'create':
            if (unit.kind === 'deck') {
                for (let i = 0; i < effect.amount; i += 1) createToken(ctx, unit, effect.card, effect.to);
            } else if (TOKEN_CARDS[effect.card]?.unplayable || isStatusCard(effect.card)) {
                // 敌人「塞垃圾牌」：塞进对面的卡牌单位（不算对方自己生成临时牌）。
                const victim = pickDeckOpponent(ctx, unit, aimId);
                if (victim) for (let i = 0; i < effect.amount; i += 1) createToken(ctx, victim, effect.card, effect.to, true);
            }
            return;
        case 'repeat-last':
            repeatLast(ctx, unit, effect.amount, aimId);
            return;
        case 'replay-next':
            if (unit.kind !== 'deck') return;
            if (!unit.replayNext) unit.replayNext = [];
            unit.replayNext.push(effect.cardType ? { amount: effect.amount, cardType: effect.cardType } : { amount: effect.amount });
            emit(ctx, { type: 'replay-next', unitId: unit.id, amount: effect.amount, cardType: effect.cardType || null });
            return;
        case 'grow':
            for (const inst of currentInst(ctx)) {
                const card = ownCard(ctx, inst);
                card.grow = Math.min(GROW_MAX, (card.grow || 0) + effect.amount);
                emit(ctx, { type: 'grow', unitId: unit.id, inst, grow: card.grow });
            }
            return;
        case 'cost-mod': {
            if (unit.kind !== 'deck') return;
            const picked = effect.mode === 'self' ? currentInst(ctx) : selectCards(ctx, effect.mode, costlyCards(state, unit), 1, 'cost');
            for (const inst of picked) modifyCost(ctx, unit, inst, effect.amount, effect.scope);
            return;
        }
        case 'buff':
            if (!unit.buffs) unit.buffs = [];
            unit.buffs.push({ id: source.id, trigger: effect.trigger, ...(effect.cardType ? { cardType: effect.cardType } : {}), turns: effect.turns, then: effect.then });
            emit(ctx, { type: 'buff', unitId: unit.id, buffId: source.id, trigger: effect.trigger, turns: effect.turns });
            return;
        default:
            // 已登记机制的算子：只在 v5 战斗、且单位类型被允许时结算；v3/v4 重放与未知算子照旧不做任何事。
            if (!(state.rulesVersion >= 5) || !opAllowedFor(effect.op, unit.kind)) return;
            opHandler(effect.op).apply(ctx, unit, effect, aimId, source, engineKit(targets));
    }
}

// 规则 v5 D07 掩护：单体攻击每次选定存活目标后走 attack-target 钩子（payload { attacker, target }），
// 机制可把 target 换成同阵营另一名存活单位；全体、随机目标与 v3/v4 战斗不经过钩子。
function coverTargets(ctx, unit, spec, targets) {
    if (!(ctx.state.rulesVersion >= 5) || spec !== 'enemy' || targets.length !== 1 || !targets[0].alive) return targets;
    const aim = { attacker: unit, target: targets[0] };
    runHooks(ctx, 'attack-target', aim);
    const next = aim.target;
    return next && next !== targets[0] && next.alive && next.side === targets[0].side ? [next] : targets;
}

// 攻击：按 hits 次数逐次选目标并结算伤害，荆棘反伤，最后触发受击被动。
function strike(ctx, unit, effect, aimId, source) {
    const spec = targetSpec(effect);
    const hitUnits = [];
    const whipping = isWhipping(ctx.state, unit);
    // 规则 v6 G5c：牌造成的伤害把当前牌面视图交给修正阶段（出伤加值按牌名、升级、X 费、刻印过滤）。
    const card = ctx.state.rulesVersion >= 6 && source?.kind === 'card' && ctx.inst ? cardView(ctx.state, ctx.inst) : null;
    const hitFor = (target) => computeDamage(unit, target, effect.amount, effect.strengthScale, ctx.state.rulesVersion, card);
    for (let hit = 0; hit < (effect.hits || 1); hit += 1) {
        const targets = coverTargets(ctx, unit, spec, resolveTargets(ctx, unit, spec, aimId, whipping));
        if (!targets.length) break;
        ctx.strikes = (ctx.strikes || 0) + 1;
        const strikeNo = ctx.strikes;
        for (const target of targets) {
            if (ctx.state.outcome || !unit.alive) return;
            if (!target.alive) {
                // 趁胜追击：打已倒下的敌人，只出事件不扣血。
                if (whipping) emit(ctx, { type: 'damage', kind: 'attack', source, target: target.id, amount: hitFor(target), blocked: 0, hpLoss: 0, overkill: true, strike: strikeNo });
                continue;
            }
            dealDamage(ctx, target, hitFor(target), source, 'attack', true, strikeNo);
            if (!hitUnits.includes(target)) hitUnits.push(target);
            const thorns = target.statuses.thorns || 0;
            if (thorns > 0 && target.id !== unit.id) dealDamage(ctx, unit, thorns, { unitId: target.id, kind: 'status', id: 'thorns' }, 'thorns', true);
        }
    }
    for (const target of hitUnits) if (target.alive && !ctx.state.outcome) fireTrigger(ctx, target, 'on-hit', unit.id);
}

// ---------- 牌堆操作 ----------

// 抽牌：被「禁抽」时不抽；手牌满了停止；抽牌堆空了把弃牌堆洗回来。
function drawCards(ctx, unit, amount) {
    if ((unit.statuses['no-draw'] || 0) > 0) return;
    const pile = ctx.state.piles[unit.id];
    const drawnInsts = [];
    for (let i = 0; i < amount; i += 1) {
        if (pile.hand.length >= COMBAT_RULES.handLimit) break;
        if (!pile.draw.length) {
            if (!pile.discard.length) break;
            pile.draw = shuffle(ctx.state, pile.discard);
            pile.discard = [];
            emit(ctx, { type: 'reshuffle', unitId: unit.id, count: pile.draw.length });
            fireBus(ctx, unit, 'shuffle', null);
            runHooks(ctx, 'shuffle', { unit, count: pile.draw.length });
            if (pile.hand.length >= COMBAT_RULES.handLimit || !pile.draw.length) break;
        }
        const inst = pile.draw.pop();
        pile.hand.push(inst);
        drawnInsts.push(inst);
    }
    if (drawnInsts.length) {
        emit(ctx, { type: 'draw', unitId: unit.id, count: drawnInsts.length });
        runHooks(ctx, 'draw', { unit, insts: drawnInsts });
        if (ctx.state.rulesVersion >= 5) fireBus(ctx, unit, 'draw', null);
    }
}

const newTurnStats = () => ({ attack: 0, skill: 0, power: 0, discards: 0, temps: 0, byCard: {} });

function turnStatsOf(unit) {
    if (!unit.turnStats) unit.turnStats = newTurnStats();
    return unit.turnStats;
}

// 规则 v5 E18 下回合少抽：登记的 draw-count 阶段改写回合开始的抽牌数（不低于 0）；v3/v4 不变。
function drawCount(state, unit, count) {
    if (!(state.rulesVersion >= 5)) return count;
    let n = count;
    for (const mod of damageModifiers('draw-count')) {
        const out = mod.fn(state, unit, n);
        if (Number.isFinite(out)) n = Math.max(0, Math.floor(out));
    }
    return n;
}

// 手牌里费用大于 0 的牌（费用修正的候选）。
const costlyCards = (state, unit) => state.piles[unit.id].hand.filter((inst) => {
    const view = cardView(state, inst);
    return view && typeof view.cost === 'number' && view.cost > 0;
});

// 从 list 里选 count 张：玩家刚做过选择就用选择结果；mode 为 choose 时由策略自动选，否则随机。
function selectCards(ctx, mode, list, count, purpose) {
    if (mode === 'choose' && ctx.chosen) {
        const chosen = ctx.chosen;
        ctx.chosen = null;
        return chosen;
    }
    if (count <= 0 || !list.length) return [];
    if (count >= list.length) return list.slice();
    if (mode === 'choose') return pickCards(ctx.state, list, count, purpose);
    const rest = list.slice();
    const picked = [];
    for (let i = 0; i < count; i += 1) picked.push(rest.splice(rollInt(ctx.state, rest.length), 1)[0]);
    return picked;
}

// 需要玩家亲自选牌的效果：返回 { options, count }，不需要选（候选不多于要选的张数）返回 null。
function pendingChoiceFor(state, unit, effect) {
    if (unit.kind !== 'deck') return null;
    const hand = state.piles[unit.id].hand;
    let options = null;
    let count = 1;
    if (effect.op === 'discard' && effect.mode === 'choose') {
        options = hand.slice();
        count = Math.min(effect.amount, hand.length);
    } else if (effect.op === 'copy' && effect.from === 'choose') {
        options = hand.slice();
    } else if (effect.op === 'cost-mod' && effect.mode === 'choose') {
        options = costlyCards(state, unit);
    } else if (state.rulesVersion >= 5 && opAllowedFor(effect.op, unit.kind)) {
        // 规则 v5 已登记算子：自己声明手牌待选。
        const picked = opHandler(effect.op).choice?.(state, unit, effect, { cardView });
        if (picked && Array.isArray(picked.options)) {
            options = picked.options.slice();
            count = picked.count;
        }
    }
    return options && count > 0 && options.length > count ? { options, count } : null;
}

function discardCard(ctx, unit, inst) {
    const pile = ctx.state.piles[unit.id];
    const index = pile.hand.indexOf(inst);
    if (index < 0) return;
    pile.hand.splice(index, 1);
    pile.discard.push(inst);
    turnStatsOf(unit).discards += 1;
    const card = cardView(ctx.state, inst);
    emit(ctx, { type: 'discard', unitId: unit.id, inst, cardId: card?.id ?? null });
    if (card?.onDiscard && unit.alive && !ctx.state.outcome && busOpen(ctx)) {
        ctx.state.busTriggers = (ctx.state.busTriggers || 0) + 1;
        ctx.depth += 1;
        runEffects(ctx, unit, card.onDiscard, null, { unitId: unit.id, kind: 'on-discard', id: card.id });
        ctx.depth -= 1;
    }
    // 规则 v5 关键字「狡黠」：被效果主动弃掉时免费打出；回合末自然弃牌走 settleHand，不经此处。
    if (ctx.state.rulesVersion >= 5 && card?.sly && !card.unplayable && unit.kind === 'deck' && unit.alive && !ctx.state.outcome && busOpen(ctx)) slyPlay(ctx, unit, inst, card);
    fireBus(ctx, unit, 'discard', null, { cardType: card?.type });
}

// 免费打出（狡黠、规则 v5 P5b 预燃）：不付费、不计出牌数，需要敌方目标时取最弱的敌人（没有则不打出）；牌留在弃牌堆，自带消耗时移入消耗堆。tag 为事件类型。
function slyPlay(ctx, unit, inst, card, tag = 'sly') {
    const state = ctx.state;
    const needFoe = effectsNeedTarget(card.effects);
    const aim = needFoe ? weakestId(state, opposite(unit.side)) : effectsPickAlly(card.effects) ? unit.id : null;
    if (needFoe && !aim) return;
    const saved = { inst: ctx.inst, exhaust: ctx.exhaust, recur: ctx.recur, chosen: ctx.chosen };
    state.busTriggers = (state.busTriggers || 0) + 1;
    ctx.depth += 1;
    ctx.inst = inst;
    ctx.exhaust = false;
    ctx.recur = null;
    ctx.chosen = null;
    emit(ctx, { type: tag, unitId: unit.id, inst, cardId: card.id, targetId: aim });
    runEffects(ctx, unit, card.effects, aim, { unitId: unit.id, kind: 'card', id: card.id });
    if (ctx.exhaust) {
        const pile = state.piles[unit.id];
        const index = pile.discard.indexOf(inst);
        if (index >= 0) {
            pile.discard.splice(index, 1);
            exhaustCard(ctx, unit, inst);
        }
    }
    ctx.depth -= 1;
    ctx.inst = saved.inst;
    ctx.exhaust = saved.exhaust;
    ctx.recur = saved.recur;
    ctx.chosen = saved.chosen;
}

function exhaustCard(ctx, unit, inst, fireTriggers = true) {
    ctx.state.piles[unit.id].exhaust.push(inst);
    emit(ctx, { type: 'exhaust', unitId: unit.id, inst });
    if (fireTriggers) fireBus(ctx, unit, 'exhaust', null, { cardType: cardView(ctx.state, inst)?.type });
    runHooks(ctx, 'exhaust', { unit, inst });
}

// 生成一张临时牌放进 where（hand/draw/discard）；手牌满了改放弃牌堆。每回合有张数上限。
// foreign 为真：由对方塞入（敌人塞状态牌），不算本单位「生成临时牌」。
function addTempCard(ctx, unit, entry, where, foreign = false) {
    const state = ctx.state;
    const stats = turnStatsOf(unit);
    if (stats.temps >= COMBAT_RULES.tempCardsPerTurn) return null;
    stats.temps += 1;
    state.tempSeq = (state.tempSeq || 0) + 1;
    const inst = `${unit.id}#t${state.tempSeq}`;
    ownCardsMap(ctx)[inst] = { owner: unit.id, ...entry, temp: true };
    const pile = state.piles[unit.id];
    const place = where === 'hand' && pile.hand.length >= COMBAT_RULES.handLimit ? 'discard' : where;
    if (place === 'hand') pile.hand.push(inst);
    else if (place === 'draw') pile.draw.splice(rollInt(state, pile.draw.length + 1), 0, inst);
    else pile.discard.push(inst);
    emit(ctx, { type: 'card-created', unitId: unit.id, inst, cardId: entry.cardId, to: place });
    runHooks(ctx, 'create', { unit, inst, cardId: entry.cardId, to: place });
    if (state.rulesVersion >= 5 && !foreign) fireBus(ctx, unit, 'create', null);
    return inst;
}

// 复制一张已有的牌（带升级、成长、费用修正）。
function copyCard(ctx, unit, inst, where) {
    const source = ctx.state.cards[inst];
    if (!source) return;
    const entry = { cardId: source.cardId, upgraded: source.upgraded === true };
    if (source.grow) entry.grow = source.grow;
    if (source.costMod) entry.costMod = source.costMod;
    if (source.inscription) entry.inscription = source.inscription;
    addTempCard(ctx, unit, entry, where);
}

// 生成内置临时牌/状态牌；同名定义已在该单位的 catalog 里时复用，id 冲突但名字不同则放弃。
function createToken(ctx, unit, cardId, where, foreign = false) {
    const def = TOKEN_CARDS[cardId];
    if (!def) return;
    const known = ctx.state.catalog[unit.id];
    if (!Object.hasOwn(known, def.id)) ownCatalog(ctx, unit.id)[def.id] = deepCopy(def);
    else if (known[def.id].name !== def.name) return;
    addTempCard(ctx, unit, { cardId: def.id, upgraded: false }, where, foreign);
}

// 敌人塞垃圾牌的对象：指定目标 > 主角 > 对面第一个卡牌单位。
function pickDeckOpponent(ctx, unit, aimId) {
    const state = ctx.state;
    const foeSide = opposite(unit.side);
    const isDeckFoe = (candidate) => !!candidate?.alive && candidate.side === foeSide && candidate.kind === 'deck';
    const aimed = aimId != null && Object.hasOwn(state.units, aimId) ? state.units[aimId] : null;
    if (isDeckFoe(aimed)) return aimed;
    if (isDeckFoe(state.units[state.controlledId])) return state.units[state.controlledId];
    const found = livingIds(state, foeSide).find((id) => state.units[id].kind === 'deck');
    return found ? state.units[found] : null;
}

// 重复上一张打出的牌的效果 times 次（不递归，不重复耗尽/出牌记录）。
function repeatLast(ctx, unit, times, aimId) {
    const last = unit.lastPlayed;
    if (ctx.repeating || !last || unit.kind !== 'deck') return;
    const card = cardView(ctx.state, last.inst);
    if (!card || card.unplayable) return;
    const saved = { inst: ctx.inst, exhaust: ctx.exhaust, recur: ctx.recur };
    const aim = last.targetId != null && ctx.state.units[last.targetId]?.alive ? last.targetId : null;
    ctx.repeating = true;
    ctx.inst = last.inst;
    emit(ctx, { type: 'repeat', unitId: unit.id, inst: last.inst, cardId: card.id, times });
    const source = { unitId: unit.id, kind: 'card', id: card.id };
    for (let i = 0; i < times && unit.alive && !ctx.state.outcome; i += 1) runEffects(ctx, unit, card.effects, aim ?? aimId ?? null, source);
    ctx.repeating = false;
    ctx.inst = saved.inst;
    ctx.exhaust = saved.exhaust;
    ctx.recur = saved.recur;
}

// 费用修正：combat 范围写进牌自身（持续整场），否则记在单位的本回合表里。
function modifyCost(ctx, unit, inst, amount, scope) {
    if (!ctx.state.cards[inst]) return;
    if (scope === 'combat') {
        const card = ownCard(ctx, inst);
        card.costMod = Math.max(-3, (card.costMod || 0) + amount);
    } else {
        if (!unit.turnCostMod) unit.turnCostMod = {};
        unit.turnCostMod[inst] = Math.max(-3, (unit.turnCostMod[inst] || 0) + amount);
    }
    emit(ctx, { type: 'cost-mod', unitId: unit.id, inst, amount, scope });
}

// ---------- 敌人意图与技能 ----------

// 默认攻击对象：setup.randomTargets 时敌方单位在存活的对方单位中按种子随机挑一个（消耗一次随机数）；
// 否则（含我方托管单位）取生命 + 格挡最低者，不消耗随机数。
function attackTargetId(ctx, unit) {
    const state = ctx.state;
    const foeSide = opposite(unit.side);
    if (state.randomTargets !== true || unit.side !== 'enemy') return weakestId(state, foeSide);
    const ids = livingIds(state, foeSide);
    return ids.length ? ids[rollInt(state, ids.length)] : null;
}

// 为技能单位规划下一次行动；没有可选技能则清掉意图。
function planIntent(ctx, unit) {
    const intent = chooseSkillIntent(ctx.state, unit.id, rollFloat(ctx.state));
    if (!intent) {
        delete ctx.state.intents[unit.id];
        return;
    }
    if (intent.targetId != null && ctx.state.randomTargets === true && unit.side === 'enemy') intent.targetId = attackTargetId(ctx, unit);
    ctx.state.intents[unit.id] = intent;
    emit(ctx, { type: 'intent', unitId: unit.id, skillId: intent.skillId, targetId: intent.targetId });
}

// 技能单位出手：执行已定意图（目标倒下则改打最弱的敌人），更新冷却与历史，再规划下一次。
function takeSkillTurn(ctx, unit) {
    const state = ctx.state;
    const intent = state.intents[unit.id];
    const skill = intent && unit.skills.find((item) => item.id === intent.skillId);
    if (!skill) {
        planIntent(ctx, unit);
        return;
    }
    let targetId = intent.targetId ?? null;
    if (targetId !== null && !state.units[targetId]?.alive) targetId = attackTargetId(ctx, unit);
    delete state.intents[unit.id];
    emit(ctx, { type: 'skill', unitId: unit.id, skillId: skill.id, name: skill.name, targetId });
    runEffects(ctx, unit, skill.effects, targetId, { unitId: unit.id, kind: 'skill', id: skill.id });
    if (unit.alive) runHooks(ctx, 'action-after', { unit, kind: 'skill', skill, effects: skill.effects });
    const cooldowns = state.cooldowns[unit.id];
    for (const id of Object.keys(cooldowns)) {
        if (cooldowns[id] > 1) cooldowns[id] -= 1;
        else delete cooldowns[id];
    }
    if (skill.cooldown > 0) cooldowns[skill.id] = skill.cooldown;
    const history = state.history[unit.id];
    history.push(skill.id);
    if (history.length > 4) history.shift();
    if (unit.alive && !state.outcome) planIntent(ctx, unit);
}

// ---------- 回合起止 ----------

// 单位回合开始：清格挡与本回合统计，结算中毒/再生，补能量，应用「下回合」收益，触发回合开始，抽牌。
function startUnitTurn(ctx, unit) {
    const state = ctx.state;
    if (state.outcome || !unit.alive) return;
    const before = { unit, clearBlock: true };
    runHooks(ctx, 'turn-start-before', before);
    if (state.outcome || !unit.alive) return;
    if (before.clearBlock) unit.block = 0;
    unit.cardsPlayed = 0;
    delete unit.turnStats;
    delete unit.lastPlayed;
    delete state.busTriggers;
    if ((unit.statuses.intangible || 0) > 0) setStatus(unit, 'intangible', unit.statuses.intangible - 1);
    const poison = unit.statuses.poison || 0;
    if (poison > 0) {
        setStatus(unit, 'poison', poison - 1);
        dealDamage(ctx, unit, poison, { unitId: unit.id, kind: 'status', id: 'poison' }, 'poison', false);
    }
    const regen = unit.statuses.regen || 0;
    if (regen > 0 && unit.alive) {
        setStatus(unit, 'regen', regen - 1);
        heal(ctx, unit, regen, { unitId: unit.id, kind: 'status', id: 'regen' });
    }
    if (!unit.alive || state.outcome) return;
    if (unit.kind === 'deck') {
        unit.energy = unit.energyPerTurn;
        unit.heroSkillUsed = false;
        if (unit.traitSkillsUsed) unit.traitSkillsUsed = [];
        if (unit.id === state.controlledId && state.items) state.items.used = false;
    }
    let extraDraw = 0;
    const queued = unit.nextTurn || [];
    unit.nextTurn = [];
    for (const gain of queued) {
        if (gain.gain === 'draw') {
            extraDraw += gain.amount;
        } else if (gain.gain === 'energy' && unit.kind === 'deck') {
            unit.energy += gain.amount;
            emit(ctx, { type: 'energy', unitId: unit.id, amount: gain.amount });
        } else if (gain.gain === 'status') {
            addStatus(ctx, unit, gain.status, gain.stacks, { unitId: unit.id, kind: 'next-turn', id: gain.status });
        } else if (gain.gain === 'counter') {
            const foe = state.units[gain.targetId];
            emit(ctx, { type: 'counter', unitId: unit.id, target: gain.targetId, amount: gain.amount, fizzled: gain.fizzled === true });
            if (gain.fizzled !== true && foe?.alive) dealDamage(ctx, foe, computeDamage(unit, foe, gain.amount, 1, state.rulesVersion), { unitId: unit.id, kind: 'counter', id: 'counter' }, 'attack', true);
            if (state.outcome) return;
        }
    }
    fireTrigger(ctx, unit, 'turn-start', null);
    for (const power of unit.powers || []) {
        if (!unit.alive || state.outcome) return;
        if (power.at !== 'turn-end') {
            emit(ctx, { type: 'power-trigger', unitId: unit.id, cardId: power.id });
            runEffects(ctx, unit, power.effects, null, { unitId: unit.id, kind: 'power', id: power.id });
        }
    }
    fireBus(ctx, unit, 'turn-start', null);
    if (unit.kind === 'deck' && unit.alive && !state.outcome) drawCards(ctx, unit, drawCount(state, unit, unit.drawPerTurn + extraDraw));
    if (unit.alive) runHooks(ctx, 'turn-start-after', { unit });
}

// 回合结束处理手牌：消散牌耗尽，保留牌留在手里，其余进弃牌堆。
function settleHand(ctx, unit) {
    const pile = ctx.state.piles[unit.id];
    const kept = [];
    const faded = [];
    const rest = [];
    for (const inst of pile.hand) {
        const card = cardView(ctx.state, inst);
        if (card?.ethereal) faded.push(inst);
        else (card?.retain ? kept : rest).push(inst);
    }
    keepExtra(ctx, unit, kept, rest);
    pile.hand = kept;
    pile.discard.push(...rest);
    for (const inst of faded) exhaustCard(ctx, unit, inst);
}

// 规则 v5 L06：本回合登记的「回合结束多保留 N 张」，从其余手牌里留下估值最高的 N 张（不能打出的牌不留），用后清掉。
function keepExtra(ctx, unit, kept, rest) {
    const extra = ctx.state.rulesVersion >= 5 ? unit.res?.retainHand || 0 : 0;
    if (!extra) return;
    delete unit.res.retainHand;
    if (!Object.keys(unit.res).length) delete unit.res;
    const worth = (inst) => {
        const card = cardView(ctx.state, inst);
        return card && !card.unplayable ? estimateEffectsValue(card.effects) : null;
    };
    const picks = rest.map((inst) => [inst, worth(inst)]).filter(([, value]) => value !== null).sort((a, b) => b[1] - a[1]).slice(0, extra);
    for (const [inst] of picks) {
        rest.splice(rest.indexOf(inst), 1);
        kept.push(inst);
    }
}

// 单位回合结束：回合结束触发、持续能力、手牌结算、buff 计时、负面状态衰减。
function endUnitTurn(ctx, unit) {
    if (ctx.state.outcome || !unit.alive) return;
    runHooks(ctx, 'turn-end-before', { unit });
    if (ctx.state.outcome || !unit.alive) return;
    fireTrigger(ctx, unit, 'turn-end', null);
    if (!unit.alive) return;
    for (const power of unit.powers || []) {
        if (power.at !== 'turn-end') continue;
        if (!unit.alive || ctx.state.outcome) return;
        emit(ctx, { type: 'power-trigger', unitId: unit.id, cardId: power.id });
        runEffects(ctx, unit, power.effects, null, { unitId: unit.id, kind: 'power', id: power.id });
    }
    fireBus(ctx, unit, 'turn-end', null);
    if (!unit.alive) return;
    if (unit.kind === 'deck') {
        settleHand(ctx, unit);
        delete unit.handCost;
        delete unit.turnCostMod;
        delete unit.replayNext;
    }
    if (unit.buffs?.length) unit.buffs = unit.buffs.map((buff) => ({ ...buff, turns: buff.turns - 1 })).filter((buff) => buff.turns > 0);
    for (const status of DECAYING_STATUSES) if (unit.statuses[status] > 0) setStatus(unit, status, unit.statuses[status] - 1);
    if (ctx.state.rulesVersion >= 5) {
        for (const status of Object.keys(unit.statuses)) if (statusDef(status)?.decay) setStatus(unit, status, unit.statuses[status] - 1);
    }
    if (unit.alive) runHooks(ctx, 'turn-end-after', { unit });
}

// ---------- 打牌 ----------

// 付费、移出手牌并开始结算。X 费牌花光能量，按能量数重复结算。
function playCard(ctx, unit, inst, aimId) {
    const state = ctx.state;
    const pile = state.piles[unit.id];
    const card = cardView(state, inst);
    const spent = card.cost === 'X' ? unit.energy : card.cost;
    let runs = card.cost === 'X' ? spent : 1;
    pile.hand.splice(pile.hand.indexOf(inst), 1);
    unit.energy -= spent;
    emit(ctx, { type: 'card', unitId: unit.id, inst, cardId: card.id, name: card.name, skillRef: card.skillRef || card.name, targetId: aimId ?? null, cost: spent });
    const replayIndex = (unit.replayNext || []).findIndex((item) => !item.cardType || item.cardType === card.type);
    if (replayIndex >= 0) {
        const [replay] = unit.replayNext.splice(replayIndex, 1);
        runs *= 1 + replay.amount;
        emit(ctx, { type: 'replay', unitId: unit.id, inst, times: replay.amount });
    }
    // 规则 v5 关键字「重演」：整张额外执行 card.replay 次，费用与出牌计数不变。
    if (state.rulesVersion >= 5 && Number.isInteger(card.replay) && card.replay > 0) {
        runs = Math.min(runs * (1 + card.replay), PLAY_RUNS_MAX);
        emit(ctx, { type: 'replay', unitId: unit.id, inst, times: card.replay, keyword: true });
    }
    // 规则 v5 play-before 钩子可置 exhaust = true，让这张牌打出后消耗（W04 焚身）。
    let exhaustOnPlay = false;
    if (state.rulesVersion >= 5) {
        const before = { unit, inst, card, aimId: aimId ?? null, runs, exhaust: false };
        runHooks(ctx, 'play-before', before);
        if (before.runs !== runs && Number.isInteger(before.runs) && before.runs >= 1) runs = Math.min(before.runs, PLAY_RUNS_MAX);
        exhaustOnPlay = before.exhaust === true;
    }
    state.play = { unitId: unit.id, inst, cardId: card.id, effects: card.effects, targetId: aimId ?? null, runs, run: 0, index: 0, exhaust: exhaustOnPlay };
    resolvePlay(ctx);
}

// 推进 state.play：逐个效果结算；遇到需要玩家选牌的效果就挂起（pending）并返回，选完再续。
function resolvePlay(ctx) {
    const state = ctx.state;
    const play = state.play;
    const unit = state.units[play.unitId];
    const source = { unitId: unit.id, kind: 'card', id: play.cardId };
    const isHero = unit.id === state.controlledId;
    ctx.inst = play.inst;
    ctx.exhaust = play.exhaust;
    ctx.recur = play.recur;
    while (play.run < play.runs && !state.outcome && unit.alive) {
        while (play.index < play.effects.length && !state.outcome && unit.alive) {
            const effect = play.effects[play.index];
            const choice = isHero ? pendingChoiceFor(state, unit, effect) : null;
            play.index += 1;
            if (choice) {
                play.exhaust = ctx.exhaust;
                if (ctx.recur) play.recur = ctx.recur;
                state.pending = { kind: effect.op, unitId: unit.id, inst: play.inst, count: choice.count, options: choice.options };
                emit(ctx, { type: 'choose-start', unitId: unit.id, kind: effect.op, count: choice.count, options: choice.options.slice() });
                ctx.inst = null;
                return;
            }
            applyEffect(ctx, unit, effect, play.targetId, source);
        }
        if (state.outcome || !unit.alive) break;
        play.run += 1;
        play.index = 0;
    }
    finishPlay(ctx);
}

// 一张牌结算完：计入统计，能力牌/耗尽牌进耗尽堆，其余进弃牌堆，然后触发出牌相关被动。
function finishPlay(ctx) {
    const state = ctx.state;
    const play = state.play;
    delete state.play;
    const unit = state.units[play.unitId];
    const card = cardView(state, play.inst);
    ctx.inst = null;
    unit.cardsPlayed += 1;
    const stats = turnStatsOf(unit);
    stats[card.type] += 1;
    const key = cardCountKey(card.id);
    stats.byCard[key] = (stats.byCard[key] || 0) + 1;
    // 规则 v5 打出后去向（recur 算子）：回到手牌（手牌满则照常进弃牌堆）或放回抽牌堆顶；消耗与能力牌优先。
    const recur = state.rulesVersion >= 5 ? ctx.recur : null;
    ctx.recur = null;
    const pile = state.piles[unit.id];
    if (card.type === 'power' || ctx.exhaust) exhaustCard(ctx, unit, play.inst, card.type !== 'power');
    else if (recur === 'hand' && pile.hand.length < COMBAT_RULES.handLimit) {
        pile.hand.push(play.inst);
        emit(ctx, { type: 'recur', unitId: unit.id, inst: play.inst, to: 'hand' });
    } else if (recur === 'top') {
        pile.draw.push(play.inst);
        emit(ctx, { type: 'recur', unitId: unit.id, inst: play.inst, to: 'top' });
    } else pile.discard.push(play.inst);
    ctx.exhaust = false;
    unit.lastPlayed = { inst: play.inst, targetId: play.targetId };
    checkOutcome(ctx);
    fireBus(ctx, unit, 'card-played', play.targetId, { cardType: card.type });
    for (const foeId of livingIds(state, opposite(unit.side))) fireBus(ctx, state.units[foeId], 'foe-card-played', unit.id, { cardType: card.type });
    if (unit.alive) runHooks(ctx, 'play-after', { unit, inst: play.inst, card, targetId: play.targetId });
    if (unit.alive) runHooks(ctx, 'action-after', { unit, kind: 'card', card, effects: card.effects });
}

// ---------- 动作合法性检查：返回 null 表示可行，否则 { reason, detail } ----------

// 目标是否合法：需要敌方目标的效果必须指向敌人，需要友方目标的必须指向己方；不需要目标却给了目标会被拒绝。
function validateTarget(state, unit, effects, aimId) {
    const needFoe = effectsNeedTarget(effects);
    if (!needFoe && aimId == null) return null;
    if (!needFoe && !effectsPickAlly(effects)) return { reason: 'unexpected-target' };
    const target = typeof aimId === 'string' && Object.hasOwn(state.units, aimId) ? state.units[aimId] : null;
    const wantedSide = needFoe ? opposite(unit.side) : unit.side;
    const whipping = needFoe && isWhipping(state, unit);
    return !target || target.side !== wantedSide || (!target.alive && !whipping) ? { reason: 'invalid-target' } : null;
}

function validatePlay(state, unit, inst, aimId) {
    if (typeof inst !== 'string' || !(state.piles[unit.id]?.hand || []).includes(inst)) return { reason: 'card-not-in-hand' };
    const card = cardView(state, inst);
    if (!card) return { reason: 'card-not-in-hand' };
    if (card.unplayable) return { reason: 'card-unplayable' };
    // 规则 v5 E18 等出牌限制（battle-state.js playBlock，与 legalActions、托管共用）；v3/v4 恒为 null。
    const blocked = playBlock(state, unit, card);
    if (blocked) return { reason: 'card-restricted', detail: { why: blocked } };
    if (!canAfford(card, unit.energy)) return { reason: 'insufficient-energy', detail: { cost: card.cost, energy: unit.energy } };
    // 规则 v5 P01：圣辉第二费用不足时拒绝（v3/v4 radianceOf 为 undefined，不判定）。
    if (!canAfford(card, unit.energy, radianceOf(state, unit))) return { reason: 'insufficient-radiance', detail: { radiance: card.radiance, have: radianceOf(state, unit) } };
    return validateTarget(state, unit, card.effects, aimId);
}

// 英雄技能（skillId 缺省）或天赋技能的来源信息。
function heroSkillSource(unit, skillId) {
    if (skillId === undefined) return unit.heroSkill ? { skill: unit.heroSkill, cost: COMBAT_RULES.heroSkillCost, used: unit.heroSkillUsed === true } : null;
    const trait = (unit.traits || []).find((item) => item.skill?.id === skillId);
    return trait ? { skill: trait.skill, cost: trait.skill.cost, used: (unit.traitSkillsUsed || []).includes(skillId) } : null;
}

function validateHeroSkill(state, unit, aimId, skillId) {
    const source = heroSkillSource(unit, skillId);
    if (!source) return { reason: 'hero-skill-missing' };
    if (source.used) return { reason: 'hero-skill-used' };
    if (unit.energy < source.cost) return { reason: 'insufficient-energy', detail: { cost: source.cost, energy: unit.energy } };
    return validateTarget(state, unit, source.skill.effects, aimId);
}

function useHeroSkill(ctx, unit, aimId, skillId) {
    const { skill, cost } = heroSkillSource(unit, skillId);
    unit.energy -= cost;
    if (skillId === undefined) unit.heroSkillUsed = true;
    else unit.traitSkillsUsed = [...(unit.traitSkillsUsed || []), skillId];
    emit(ctx, { type: 'hero-skill', unitId: unit.id, skillId: skill.id, name: skill.name, targetId: aimId ?? null, cost });
    runEffects(ctx, unit, skill.effects, aimId ?? null, { unitId: unit.id, kind: 'hero-skill', id: skill.id });
    if (unit.alive) runHooks(ctx, 'action-after', { unit, kind: 'hero-skill', skill, effects: skill.effects });
    checkOutcome(ctx);
}

function validateAwaken(state) {
    if (!state.awaken) return { reason: 'awaken-unavailable' };
    return state.awaken.used ? { reason: 'awaken-used' } : null;
}

function useAwaken(ctx, unit) {
    const awaken = ctx.state.awaken;
    awaken.used = true;
    emit(ctx, { type: 'awaken', unitId: unit.id, awakenType: awaken.type, line: awaken.line });
    runEffects(ctx, unit, COMBAT_RULES.awakenEffects[awaken.type], null, { unitId: unit.id, kind: 'awaken', id: awaken.type });
    checkOutcome(ctx);
}

function validateItem(state, unit, itemId, aimId) {
    const item = (state.items?.list || []).find((entry) => entry.itemId === itemId);
    if (!item) return { reason: 'item-unavailable' };
    if (item.count <= 0) return { reason: 'item-empty' };
    if (state.items.used) return { reason: 'item-used' };
    return validateTarget(state, unit, item.effects, aimId);
}

function useItem(ctx, unit, itemId, aimId) {
    const item = ctx.state.items.list.find((entry) => entry.itemId === itemId);
    item.count -= 1;
    ctx.state.items.used = true;
    emit(ctx, { type: 'item', unitId: unit.id, itemId, name: item.name, targetId: aimId ?? null });
    runEffects(ctx, unit, item.effects, aimId ?? null, { unitId: unit.id, kind: 'item', id: itemId });
    // 规则 v6 G5b：使用道具后。
    if (ctx.state.rulesVersion >= 6) fireBus(ctx, unit, 'item-used', null);
    checkOutcome(ctx);
}

// ---------- 行动条（行动值调度） ----------

// 单位出手一次需要的行动值：基数除以速度。
const actionDelay = (unit) => Math.max(1, Math.round(AV_SCALE / (unit.speed || COMBAT_RULES.defaultSpeed)));

// 每个存活单位距离下次出手的进度（0 到 1，保留三位小数），给界面画行动条。
export function actionProgress(state) {
    const progress = {};
    if (!state?.units || !Array.isArray(state.order)) return progress;
    for (const id of state.order) {
        const unit = state.units[id];
        if (!unit?.alive) continue;
        const ratio = 1 - (unit.av || 0) / actionDelay(unit);
        progress[id] = Math.max(0, Math.min(1, Math.round(ratio * 1e3) / 1e3));
    }
    return progress;
}

// 把单位排到下一次出手的位置；avSeq 用来在行动值相同时决定先后。
function scheduleUnit(state, unit) {
    state.avSeq += 1;
    unit.av = actionDelay(unit);
    unit.avSeq = state.avSeq;
}

// 下一个出手的单位 id：行动值最小，相同取排得早的。
function nextActorId(state) {
    let best = null;
    for (const id of state.order) {
        const unit = state.units[id];
        if (unit.alive && (!best || unit.av < best.av || (unit.av === best.av && unit.avSeq < best.avSeq))) best = unit;
    }
    return best ? best.id : null;
}

// 预测接下来 count 个出手者（给界面显示，不改 state）。
export function upcomingActors(state, count = 6) {
    if (!state || state.outcome || !state.units) return [];
    const slots = {};
    for (const id of state.order) {
        const unit = state.units[id];
        if (unit.alive) slots[id] = { av: unit.av || 0, seq: unit.avSeq || 0, delay: actionDelay(unit) };
    }
    let seq = state.avSeq || 0;
    const result = [];
    const heroId = state.controlledId;
    if (state.phase === 'player' && slots[heroId]) {
        result.push(heroId);
        seq += 1;
        slots[heroId].av = slots[heroId].delay * (state.openingDebt ? 2 : 1);
        slots[heroId].seq = seq;
    }
    while (result.length < count) {
        let best = null;
        for (const id of state.order) {
            const slot = slots[id];
            if (slot && (best === null || slot.av < slots[best].av || (slot.av === slots[best].av && slot.seq < slots[best].seq))) best = id;
        }
        if (best === null) break;
        const elapsed = slots[best].av;
        for (const slot of Object.values(slots)) slot.av -= elapsed;
        result.push(best);
        seq += 1;
        slots[best].av = slots[best].delay;
        slots[best].seq = seq;
    }
    return result;
}

// ---------- 回合推进 ----------

// 非主角单位出手：同伴按策略连续出牌（最多 MAX_AI_PLAYS 张），敌人按意图用技能；最后结束回合。
function takeAutoTurn(ctx, unit) {
    const state = ctx.state;
    emit(ctx, { type: 'act', unitId: unit.id, side: unit.side, track: actionProgress(state) });
    startUnitTurn(ctx, unit);
    if (!unit.alive || state.outcome) return;
    if (skipsAction(ctx, unit)) {
        endUnitTurn(ctx, unit);
        return;
    }
    if (unit.kind === 'deck') {
        for (let i = 0; i < MAX_AI_PLAYS && unit.alive && !state.outcome; i += 1) {
            const choice = chooseAllyPlay(state, unit.id);
            if (!choice || validatePlay(state, unit, choice.inst, choice.targetId)) break;
            playCard(ctx, unit, choice.inst, choice.targetId);
        }
    } else {
        // 技能单位每次出手用技能的次数：setup 带 actions 时按它（技能队友 2 次），没有字段时 1 次，旧战斗重放不变。
        const uses = unit.actions || 1;
        for (let n = 0; n < uses && unit.alive && !state.outcome; n += 1) takeSkillTurn(ctx, unit);
    }
    endUnitTurn(ctx, unit);
}

// 轮到主角：进入玩家阶段。firstTurn 为真时不加回合数（开局那次）。
function startPlayerTurn(ctx, firstTurn = false) {
    const state = ctx.state;
    if (!firstTurn) state.turn += 1;
    state.phase = 'player';
    emit(ctx, { type: 'turn-start', side: 'ally', unitId: state.controlledId, track: actionProgress(state) });
    const hero = state.units[state.controlledId];
    startUnitTurn(ctx, hero);
    // 规则 v5 E01：主角晕厥时直接结束这个玩家回合（回合开始与结束照常结算）。
    if (hero.alive && !state.outcome && skipsAction(ctx, hero)) endPlayerTurn(ctx);
}

// 规则 v5 E01 晕厥：act-before 钩子可置 skip 跳过这一次行动；意图保留到下一次行动。v3/v4 不调用钩子。
function skipsAction(ctx, unit) {
    if (!(ctx.state.rulesVersion >= 5)) return false;
    const before = { unit, skip: false };
    runHooks(ctx, 'act-before', before);
    return before.skip === true && unit.alive && !ctx.state.outcome;
}

// 自动阶段：按行动值依次让其他单位出手，直到轮到主角。主角倒下后会继续跑完整场（步数上限放大）。
function runAutoPhase(ctx) {
    const state = ctx.state;
    state.phase = 'auto';
    const heroDown = () => !state.units[state.controlledId].alive;
    for (let step = 0; !state.outcome && step < (heroDown() ? AUTO_STEP_LIMIT * DEAD_HERO_STEP_FACTOR : AUTO_STEP_LIMIT); step += 1) {
        const actorId = nextActorId(state);
        if (!actorId) return;
        const actor = state.units[actorId];
        const elapsed = actor.av;
        for (const id of state.order) if (state.units[id].alive) state.units[id].av -= elapsed;
        if (actorId === state.controlledId) {
            startPlayerTurn(ctx);
            return;
        }
        takeAutoTurn(ctx, actor);
        // 规则 v5 B08 加演：本单位立即再出手一次，其他单位不行动。
        while (takeEncore(ctx, actor)) takeAutoTurn(ctx, actor);
        if (actor.alive) scheduleUnit(state, actor);
    }
    if (state.outcome) return;
    if (heroDown()) endBattle(ctx, 'defeat');
    else startPlayerTurn(ctx);
}

// wipe 模式下主角倒下后，战斗不结束：清掉挂起的选择，转入自动阶段让同伴继续打。
function settleWipe(ctx) {
    const state = ctx.state;
    if (state.wipe !== true || state.outcome || state.phase !== 'player' || state.units[state.controlledId].alive) return;
    delete state.pending;
    state.phase = 'auto';
    checkOutcome(ctx);
    if (!state.outcome) runAutoPhase(ctx);
}

function endPlayerTurn(ctx) {
    const state = ctx.state;
    if (!livingIds(state, 'enemy').length) {
        endBattle(ctx, 'victory');
        return;
    }
    const hero = state.units[state.controlledId];
    emit(ctx, { type: 'turn-end', side: 'ally', unitId: hero.id });
    endUnitTurn(ctx, hero);
    if (!state.outcome) {
        // 规则 v5 B08 加演：主角行动值归 0，立即开始下一个玩家回合，敌人这段时间不行动。
        if (takeEncore(ctx, hero)) {
            startPlayerTurn(ctx);
            return;
        }
        scheduleUnit(state, hero);
        // 开局先手计入行动条（setup.openingCharged）：先手那一手占掉一个行动间隔，下一次出手再顺延一个间隔，首轮不再连动两回合。
        if (state.openingDebt) {
            hero.av += actionDelay(hero);
            delete state.openingDebt;
        }
        runAutoPhase(ctx);
    }
}

// ---------- 建局 ----------

// 由 setup 里的单位定义建出运行时单位。外部传入的定义深拷贝一份，之后引擎只读它们。
function buildUnit(def) {
    const unit = {
        id: def.id,
        name: typeof def.name === 'string' && def.name ? def.name : def.id,
        side: def.side,
        kind: def.kind,
        maxHp: def.maxHp,
        hp: def.hp ?? def.maxHp,
        block: 0,
        alive: true,
        statuses: {},
        damageScale: def.damageScale ?? 1,
        cardsPlayed: 0,
        lowHpTriggered: false,
        passives: deepCopy(def.passives || []),
        skills: def.kind === 'skill' ? deepCopy(def.skills) : [],
        phases: def.kind === 'skill' && Array.isArray(def.phases) ? deepCopy(def.phases).sort((a, b) => b.hpBelowPct - a.hpBelowPct) : [],
        phasesApplied: 0,
        speed: def.speed ?? COMBAT_RULES.defaultSpeed,
        av: 0,
        avSeq: 0,
        nextTurn: [],
        powers: [],
    };
    if (typeof def.art === 'string' && def.art) unit.art = def.art;
    if (def.tier === 'elite' || def.tier === 'boss') unit.tier = def.tier;
    // 每次出手连用技能次数（只技能单位）：大于 1 时才写字段，旧战斗形状不变。
    if (def.kind === 'skill' && Number.isInteger(def.actions) && def.actions > 1) unit.actions = def.actions;
    if (def.kind === 'deck') {
        unit.energy = 0;
        unit.energyPerTurn = def.energy ?? COMBAT_RULES.energyPerTurn;
        unit.drawPerTurn = def.draw ?? COMBAT_RULES.drawPerTurn;
        unit.heroSkillUsed = false;
        if (def.heroSkill) unit.heroSkill = deepCopy(def.heroSkill);
        if (Array.isArray(def.traits)) {
            unit.traits = deepCopy(def.traits);
            if (unit.traits.some((trait) => trait.skill)) unit.traitSkillsUsed = [];
        }
    }
    return unit;
}

// 建局。seed 是 0 到 2^32-1 的整数。成功返回 { ok: true, state, events }，失败返回 { ok: false, state: null, events: [], error }。
export function createBattle(setup, seed) {
    const problem = validateSetup(setup) || validatePassives(setup) || (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295 ? null : { reason: 'invalid-seed' });
    if (problem) return { ok: false, state: null, events: [], error: problem };
    const reserve = new Set(setup.reserve || []);
    const state = {
        version: ENGINE_VERSION,
        rulesVersion: setup.rulesVersion ?? COMBAT_RULES.version,
        seed,
        rng: seed,
        turn: 1,
        phase: 'player',
        outcome: null,
        controlledId: setup.controlledId,
        canEscape: setup.canEscape === true,
        order: [],
        units: {},
        cards: {},
        catalog: {},
        piles: {},
        intents: {},
        cooldowns: {},
        history: {},
        avSeq: 0,
        ...(setup.overkill === true ? { overkill: true } : {}),
        ...(setup.wipe === true ? { wipe: true } : {}),
        ...(setup.openingCharged === true ? { openingDebt: true } : {}),
        ...(setup.randomTargets === true ? { randomTargets: true } : {}),
        ...(setup.foeCap !== undefined ? { foeCap: setup.foeCap } : {}),
        ...(setup.awaken ? { awaken: { type: setup.awaken.type, line: setup.awaken.line || '', used: false } } : {}),
        ...(setup.items?.length ? { items: { used: false, list: setup.items.map((item) => ({ itemId: item.itemId, name: typeof item.name === 'string' ? item.name : item.itemId, count: item.count, effects: deepCopy(item.effects) })) } } : {}),
        ...(reserve.size ? { reserve: [...setup.reserve] } : {}),
    };
    const ctx = newCtx(state, true);
    for (const def of setup.units) {
        if (!reserve.has(def.id)) state.order.push(def.id);
        state.units[def.id] = buildUnit(def);
        state.cooldowns[def.id] = {};
        state.history[def.id] = [];
        if (def.kind !== 'deck') continue;
        const source = toPlainObject(def.catalog);
        const defs = {};
        const deck = def.deck.map((entry, index) => {
            const cardId = cardIdOf(entry);
            defs[cardId] = deepCopy(source[cardId]);
            const inst = `${def.id}#${index}`;
            const card = { owner: def.id, cardId, upgraded: typeof entry === 'object' && entry.upgraded === true };
            // 规则 v5 P5a 单张副本：卡组条目带 copyId 与本张永久成长 bonus 时写进牌实例；旧 setup 不带，牌实例形状不变。
            if (typeof entry?.copyId === 'string' && entry.copyId) card.copyId = entry.copyId;
            const bonus = entry?.bonus;
            if (bonus && (intInRange(bonus.damage, 1, 99) || intInRange(bonus.block, 1, 99))) {
                card.bonus = { damage: intInRange(bonus.damage, 0, 99) ? bonus.damage : 0, block: intInRange(bonus.block, 0, 99) ? bonus.block : 0 };
            }
            // 规则 v5 P5b：本张副本的刻印；旧 setup 不带，牌实例形状不变。
            if (isInscription(entry?.inscription)) card.inscription = entry.inscription;
            state.cards[inst] = card;
            return inst;
        });
        state.catalog[def.id] = defs;
        // 规则 v6 造牌池快照（random-card 的 class / general 来源）：setup 带 pools 时才写，旧 setup 的战局形状不变；整局只读。
        if (def.pools && typeof def.pools === 'object') {
            const pools = {};
            for (const key of ['class', 'general']) if (def.pools[key] && typeof def.pools[key] === 'object') pools[key] = deepCopy(toPlainObject(def.pools[key]));
            if (Object.keys(pools).length) state.pools = { ...(state.pools || {}), [def.id]: pools };
        }
        // 洗牌后把「固有」牌挪到牌堆顶（抽牌从末尾取）；固有牌多于首回合抽牌数时，超出的部分顺延到下回合再抽。
        const shuffled = shuffle(state, deck);
        // 规则 v5 P5b 御准：带该刻印的牌也按固有处理。
        const innate = shuffled.filter((inst) => defs[state.cards[inst].cardId]?.innate || (state.rulesVersion >= 5 && state.cards[inst].inscription === 'sovereign'));
        const drawPile = innate.length ? [...shuffled.filter((inst) => !innate.includes(inst)), ...innate] : shuffled;
        state.piles[def.id] = { draw: drawPile, hand: [], discard: [], exhaust: [] };
        const overflow = innate.length - (def.draw ?? COMBAT_RULES.drawPerTurn);
        if (overflow > 0) state.units[def.id].nextTurn.push({ gain: 'draw', amount: overflow });
    }
    emit(ctx, { type: 'battle-start', controlledId: state.controlledId });
    for (const id of state.order) if (state.units[id].kind === 'skill') planIntent(ctx, state.units[id]);
    for (const id of state.order) if (id !== state.controlledId) scheduleUnit(state, state.units[id]);
    startPlayerTurn(ctx, true);
    // 规则 v5 开战钩子（P5b 预燃）：首个玩家回合抽完牌之后、开战被动之前。
    runHooks(ctx, 'battle-start', {});
    for (const id of [...state.order]) {
        if (state.outcome) break;
        fireTrigger(ctx, state.units[id], 'battle-start', null);
    }
    settleWipe(ctx);
    return { ok: true, state, events: ctx.events };
}

// ---------- 选牌挂起 ----------

function validateChoice(state, insts) {
    const pending = state.pending;
    return !Array.isArray(insts) || insts.length !== pending.count || new Set(insts).size !== insts.length || insts.some((inst) => !pending.options.includes(inst))
        ? { reason: 'invalid-choice', detail: { count: pending.count } }
        : null;
}

// 玩家选完牌：把选择交给挂起的那个效果执行，再继续结算这张牌剩下的效果。
function resolveChoice(ctx, insts) {
    const state = ctx.state;
    const play = state.play;
    const unit = state.units[play.unitId];
    delete state.pending;
    emit(ctx, { type: 'choose', unitId: unit.id, insts: insts.slice() });
    ctx.inst = play.inst;
    ctx.exhaust = play.exhaust;
    ctx.chosen = insts.slice();
    ctx.recur = play.recur;
    applyEffect(ctx, unit, play.effects[play.index - 1], play.targetId, { unitId: unit.id, kind: 'card', id: play.cardId });
    ctx.chosen = null;
    play.exhaust = ctx.exhaust;
    if (ctx.recur) play.recur = ctx.recur;
    resolvePlay(ctx);
}

// 从 items 里选 size 个的所有组合（保持原顺序）。
function combinations(items, size) {
    const result = [];
    const walk = (start, picked) => {
        if (picked.length === size) {
            result.push(picked.slice());
            return;
        }
        for (let i = start; i <= items.length - (size - picked.length); i += 1) {
            picked.push(items[i]);
            walk(i + 1, picked);
            picked.pop();
        }
    };
    walk(0, []);
    return result;
}

// ---------- 对外接口 ----------

// 校验动作；不合法返回 { reason, detail }，合法返回 null。
function validateAction(state, action) {
    if (state.pending) {
        if (action.type !== 'choose') return { reason: 'choice-pending', detail: { kind: state.pending.kind } };
        return validateChoice(state, action.insts);
    }
    const hero = state.units[state.controlledId];
    switch (action.type) {
        case 'choose':
            return { reason: 'no-choice-pending' };
        case 'play':
            return validatePlay(state, hero, action.inst, action.targetId);
        case 'hero-skill':
            if (action.skillId !== undefined && typeof action.skillId !== 'string') return { reason: 'invalid-action' };
            return validateHeroSkill(state, hero, action.targetId, action.skillId);
        case 'awaken':
            return validateAwaken(state);
        case 'item':
            return validateItem(state, hero, action.itemId, action.targetId);
        case 'escape':
            return !state.canEscape || !livingIds(state, 'enemy').length ? { reason: 'escape-unavailable' } : null;
        default:
            return null;
    }
}

// 执行一个玩家动作，返回 { ok, state, events }；动作不合法时 ok 为 false，state 原样返回。
// 不修改传入的 state：内部用写时复制的工作副本，没被改动的部分与输入共享引用。
export function applyAction(state, action) {
    if (!state || typeof state !== 'object' || state.version !== ENGINE_VERSION) return reject(state, 'invalid-state');
    if (state.outcome) return reject(state, 'battle-ended', { outcome: state.outcome });
    if (!action || typeof action !== 'object' || !ACTION_TYPES.includes(action.type)) return reject(state, 'invalid-action');
    if (state.phase !== 'player') return reject(state, 'not-player-phase');
    const problem = validateAction(state, action);
    if (problem) return reject(state, problem.reason, problem.detail);
    const work = forkState(state);
    const ctx = newCtx(work);
    const hero = work.units[work.controlledId];
    switch (action.type) {
        case 'choose':
            resolveChoice(ctx, action.insts);
            break;
        case 'play':
            playCard(ctx, hero, action.inst, action.targetId ?? null);
            break;
        case 'hero-skill':
            useHeroSkill(ctx, hero, action.targetId ?? null, action.skillId);
            break;
        case 'awaken':
            useAwaken(ctx, hero);
            break;
        case 'item':
            useItem(ctx, hero, action.itemId, action.targetId ?? null);
            break;
        case 'end-turn':
            endPlayerTurn(ctx);
            break;
        default:
            emit(ctx, { type: 'escape', unitId: work.controlledId });
            endBattle(ctx, 'escape');
    }
    // 规则 v5 E08 时滞等机制经 engineKit.requestEndTurn 请求结束玩家回合；有挂起选择时不执行。
    if (ctx.endTurnRequested && !work.outcome && work.phase === 'player' && !work.pending) {
        delete ctx.endTurnRequested;
        endPlayerTurn(ctx);
    }
    settleWipe(ctx);
    finishState(work);
    return { ok: true, state: work, events: ctx.events };
}

// 当前所有合法动作（带目标的牌/技能按目标展开）。
export function legalActions(state) {
    if (!state || state.outcome || state.phase !== 'player') return [];
    if (state.pending) return combinations(state.pending.options, state.pending.count).map((insts) => ({ type: 'choose', insts }));
    const hero = state.units[state.controlledId];
    const actions = [];
    const foeIds = isWhipping(state, hero) ? state.order.filter((id) => state.units[id].side === opposite(hero.side)) : livingIds(state, opposite(hero.side));
    const targetsFor = (effects) => (effectsNeedTarget(effects) ? foeIds : effectsPickAlly(effects) ? livingIds(state, hero.side) : null);
    for (const inst of state.piles[hero.id]?.hand || []) {
        const card = cardView(state, inst);
        if (!card || !canPlay(state, hero, card)) continue;
        const targets = targetsFor(card.effects);
        if (!targets) actions.push({ type: 'play', inst });
        else for (const targetId of targets) actions.push({ type: 'play', inst, targetId });
    }
    const heroTargets = hero.heroSkill ? targetsFor(hero.heroSkill.effects) : null;
    if (!heroTargets) {
        if (!validateHeroSkill(state, hero, undefined, undefined)) actions.push({ type: 'hero-skill' });
    } else {
        for (const targetId of heroTargets) if (!validateHeroSkill(state, hero, targetId, undefined)) actions.push({ type: 'hero-skill', targetId });
    }
    for (const trait of hero.traits || []) {
        if (!trait.skill) continue;
        const targets = targetsFor(trait.skill.effects);
        if (!targets) {
            if (!validateHeroSkill(state, hero, undefined, trait.skill.id)) actions.push({ type: 'hero-skill', skillId: trait.skill.id });
        } else {
            for (const targetId of targets) if (!validateHeroSkill(state, hero, targetId, trait.skill.id)) actions.push({ type: 'hero-skill', skillId: trait.skill.id, targetId });
        }
    }
    if (!validateAwaken(state)) actions.push({ type: 'awaken' });
    for (const item of state.items?.list || []) {
        const targets = targetsFor(item.effects);
        if (!targets) {
            if (!validateItem(state, hero, item.itemId, undefined)) actions.push({ type: 'item', itemId: item.itemId });
        } else {
            for (const targetId of targets) if (!validateItem(state, hero, item.itemId, targetId)) actions.push({ type: 'item', itemId: item.itemId, targetId });
        }
    }
    actions.push({ type: 'end-turn' });
    if (state.canEscape && livingIds(state, 'enemy').length) actions.push({ type: 'escape' });
    return actions;
}

// 按种子重放：建局后依次执行 actions。某一步失败时返回当时的 state 和 applied（已成功的步数）。
// 每步 applyAction 本身是写时复制，这里不需要再拷贝整局。
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
