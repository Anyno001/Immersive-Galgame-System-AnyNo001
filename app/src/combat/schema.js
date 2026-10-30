import { ALLY_SKILL_CAP_MAX, BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES, SKILL_COUNT_MAX, TOKEN_KEYS, cardCopyLimit, evaluateCardBudget } from './rules.js';
import { hashString } from './random.js';
import { ENEMY_ART_KEYS } from './enemy-art.js';
import { ABILITY_KEYS, REL_TIERS } from './abilities.js';
import { TRAIT_BASE_SLOTS, TRAIT_KINDS, TRAIT_LINKS, TRAIT_RARITIES, TRAIT_SKILL_COSTS, TRAIT_SLOT_MAX } from './traits.js';

export const SCHEMA_VERSION = 1;
export const EFFECT_OPS = Object.freeze(['damage', 'block', 'heal', 'draw', 'energy', 'status', 'exhaust-self', 'conditional',
    'damage-from-block', 'self-damage', 'double', 'next-turn', 'each-turn', 'hand-cost', 'cleanse',
    'discard', 'discard-hand', 'copy', 'create', 'repeat-last', 'replay-next', 'grow', 'cost-mod', 'buff']);
export const STATUSES = Object.freeze(['vulnerable', 'weak', 'strength', 'dexterity', 'poison', 'regen', 'thorns', 'intangible', 'no-draw', 'endure', 'artifact', 'frail']);
export const DOUBLE_STATS = Object.freeze(['poison', 'block', 'strength']);
export const NEXT_TURN_GAINS = Object.freeze(['draw', 'energy']);
export const OFFENSE_TARGETS = Object.freeze(['enemy', 'all-enemies', 'random-enemy']);
export const SUPPORT_TARGETS = Object.freeze(['self', 'ally', 'all-allies']);
export const CARD_TYPES = Object.freeze(['attack', 'skill', 'power']);
export const RARITIES = Object.freeze(['basic', 'common', 'uncommon', 'rare', 'epic', 'mythic', 'personal', 'signature']);
export const CARD_COSTS = Object.freeze([0, 1, 2, 3, 'X']);
export const SKILL_INTENTS = Object.freeze(['attack', 'defend', 'buff', 'debuff', 'heal', 'special']);
// v4 触发总线：出牌（可限牌型）、被弃（效果弃牌，回合末弃牌不算）、被消耗、击杀、洗牌、失去生命、获得格挡；对方出牌（可限牌型，只给被动）。
export const PASSIVE_TRIGGERS = Object.freeze(['battle-start', 'turn-start', 'turn-end', 'on-hit', 'on-low-hp',
    'card-played', 'discard', 'exhaust', 'kill', 'shuffle', 'hp-loss', 'block-gain', 'foe-card-played']);
export const PROFILE_KINDS = Object.freeze(['class', 'deck-character', 'skill-character', 'enemy']);
export const LEDGER_TYPES = Object.freeze(['profile', 'exp', 'learn', 'upgrade', 'class', 'reward', 'deck', 'revoke', 'equip', 'unequip', 'item', 'consume', 'offer', 'loot', 'sell', 'rebuild', 'respec', 'ascend', 'trait', 'trait-pick', 'trait-slot', 'wound', 'heal', 'hurt']);
// 装备部位（每部位同时 1 件）与一次性道具单条数量上限；单次消耗上限覆盖一场战斗内的累计用量。
export const GEAR_SLOTS = Object.freeze(['weapon', 'armor', 'accessory', 'treasure']);
export const ITEM_GAIN_MAX = 3;
export const ITEM_CONSUME_MAX = 30;
// 剧情回血（heal 条目）：flat 为点数（1–9999），percent 为最近一场战后记录的生命上限的百分比（1–100）。
export const HEAL_MODES = Object.freeze(['flat', 'percent']);
// 剧情受伤（hurt 条目，合并计划 N3）的档位。
export const HURT_TIER_KEYS = Object.freeze(['轻伤', '中伤', '重伤']);
// 准备阶段奖励（offer，v3 §5）：每场 3 槽（再翻 4 槽）；来历不超过 30 字。类别：卡牌、装备（含宝物部位）、一次性道具、杂物（只有名称与来历）。
export const REWARD_KINDS = Object.freeze(['card', 'gear', 'item', 'keepsake']);
export const REWARD_SLOT_COUNT = 3;
export const REWARD_ORIGIN_MAX = 30;

const ALL_TARGETS = Object.freeze([...OFFENSE_TARGETS, ...SUPPORT_TARGETS]);
const SELF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns', 'intangible', 'no-draw', 'endure', 'artifact']);
// self-has：自身带某状态（助手 10-28，如「虚弱时回合开始多抽 1 张」）。
// v4 计数条件按本回合此前的计数判定（不含正在结算的这张）：已出攻击 / 技能张数、同名牌已出次数、效果弃牌张数。
const CONDITION_KINDS = Object.freeze(['target-has', 'self-has', 'self-hp-below', 'cards-played-gte',
    'attacks-played-gte', 'skills-played-gte', 'same-card-gte', 'discarded-gte']);
const COUNT_CONDITIONS = new Set(['cards-played-gte', 'attacks-played-gte', 'skills-played-gte', 'same-card-gte', 'discarded-gte']);
const DISCARD_MODES = Object.freeze(['choose', 'random']);
const PICK_MODES = Object.freeze(['self', 'choose', 'random']);
const COPY_TO = Object.freeze(['hand', 'discard', 'draw']);
const COST_SCOPES = Object.freeze(['turn', 'combat']);
const EACH_TURN_AT = Object.freeze(['turn-start', 'turn-end']);
// 限时触发 BUFF 可挂的时机（与 rules.js 的 BUFF_RATE 一致）。
export const BUFF_TRIGGERS = Object.freeze(['card-played', 'discard', 'exhaust', 'kill', 'hp-loss', 'block-gain', 'turn-start', 'turn-end']);
const POOL_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
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

// base.speed 可选：生成时由程序写入；旧档案没有时不补字段（由 session 按职业原型 / 档位回落），避免改变旧档案形状。
function speedAt(base, path, ctx) {
    return base.speed === undefined ? {} : { speed: int(base.speed, join(path, 'base.speed'), ctx, 40, 200) };
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
    if (kind === 'target-has' || kind === 'self-has') return { kind, value: oneOf(raw.value, valuePath, ctx, STATUSES) };
    if (kind === 'self-hp-below') return { kind, value: int(raw.value, valuePath, ctx, 1, 99) };
    if (COUNT_CONDITIONS.has(kind)) return { kind, value: int(raw.value, valuePath, ctx, 1, 10) };
    return undefined;
}

// 选牌方式：choose 只能写在卡牌顶层效果（打出时暂停等玩家选）；self 只能写在卡牌效果里；被动、能力、限时触发、被弃时等其余场合只能 random。
function pickAt(raw, path, ctx, allowed, where) {
    const mode = oneOf(raw, path, ctx, allowed);
    if (mode === 'choose' && where !== 'top') return fail(ctx, path, 'choose-not-top-level');
    if (mode === 'self' && !where) return fail(ctx, path, 'card-only');
    return mode;
}

// where：'top' 为卡牌顶层效果，'card' 为卡牌条件分支内，缺省为其余场合。
function effectAt(raw, path, ctx, depth = 0, where) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const op = oneOf(raw.op, join(path, 'op'), ctx, EFFECT_OPS);
    const p = (key) => join(path, key);
    switch (op) {
        case 'damage':
            checkKeys(raw, ['op', 'amount', 'hits', 'target', 'strengthScale'], path, ctx);
            // strengthScale 可选（力量按倍数生效）；缺省时不补字段，旧卡形状不变。
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 99), hits: int(raw.hits, p('hits'), ctx, 1, 5, 1), target: oneOf(raw.target, p('target'), ctx, OFFENSE_TARGETS, 'enemy'),
                ...(raw.strengthScale === undefined ? {} : { strengthScale: int(raw.strengthScale, p('strengthScale'), ctx, 1, 5) }) };
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
            // 卡牌里的条件分支仍算卡牌效果（可写 self / grow），但不能暂停选牌。
            const then = list(raw.then, p('then'), ctx, 1, 3, (e, ep, c) => effectAt(e, ep, c, depth + 1, where ? 'card' : undefined));
            return { op, when, then };
        }
        case 'damage-from-block':
            checkKeys(raw, ['op', 'target'], path, ctx);
            return { op, target: oneOf(raw.target, p('target'), ctx, OFFENSE_TARGETS, 'enemy') };
        case 'self-damage':
            checkKeys(raw, ['op', 'amount'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 20) };
        case 'double': {
            checkKeys(raw, ['op', 'stat', 'target'], path, ctx);
            const stat = oneOf(raw.stat, p('stat'), ctx, DOUBLE_STATS);
            const offense = stat === 'poison';
            return { op, stat, target: oneOf(raw.target, p('target'), ctx, offense ? OFFENSE_TARGETS : SUPPORT_TARGETS, offense ? 'enemy' : 'self') };
        }
        case 'next-turn': {
            checkKeys(raw, ['op', 'gain', 'amount'], path, ctx);
            const gain = oneOf(raw.gain, p('gain'), ctx, NEXT_TURN_GAINS);
            return { op, gain, amount: int(raw.amount, p('amount'), ctx, 1, gain === 'energy' ? 3 : 5) };
        }
        case 'each-turn': {
            checkKeys(raw, ['op', 'then', 'at'], path, ctx);
            if (depth > 0) return fail(ctx, path, 'nested-each-turn');
            const then = list(raw.then, p('then'), ctx, 1, 2, (e, ep, c) => effectAt(e, ep, c, depth + 1));
            // at 缺省为回合开始；turn-end 时在本单位回合结束、弃牌前结算。缺省不写字段，旧卡形状不变。
            const at = oneOf(raw.at, p('at'), ctx, EACH_TURN_AT, 'turn-start');
            return at === 'turn-end' ? { op, then, at } : { op, then };
        }
        case 'hand-cost':
            checkKeys(raw, ['op', 'amount'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, -3, -1) };
        // 净化：移除承受方的虚弱、易伤、中毒、禁抽。
        case 'cleanse':
            checkKeys(raw, ['op', 'target'], path, ctx);
            return { op, target: oneOf(raw.target, p('target'), ctx, SUPPORT_TARGETS, 'self') };
        // v4：弃牌（choose 只在卡牌顶层，其余场合随机；托管角色按估值最低自动选）。
        case 'discard':
            checkKeys(raw, ['op', 'amount', 'mode'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 5), mode: raw.mode === undefined ? 'random' : pickAt(raw.mode, p('mode'), ctx, DISCARD_MODES, where) };
        // 弃全手：redraw 为弃完再抽同样张数。
        case 'discard-hand':
            checkKeys(raw, ['op', 'redraw'], path, ctx);
            if (raw.redraw !== undefined && typeof raw.redraw !== 'boolean') return fail(ctx, p('redraw'), 'expected-boolean');
            return raw.redraw ? { op, redraw: true } : { op };
        // 复制：from 为 self（本张）或手牌中一张（choose / random）；复制出的牌是临时牌，只在本场存在。
        case 'copy':
            checkKeys(raw, ['op', 'amount', 'from', 'to'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 3), from: pickAt(raw.from, p('from'), ctx, PICK_MODES, where), to: oneOf(raw.to, p('to'), ctx, COPY_TO, 'hand') };
        // 生成：内置临时牌（rules.js 的 TOKEN_CARDS）。
        case 'create':
            checkKeys(raw, ['op', 'card', 'amount', 'to'], path, ctx);
            return { op, card: oneOf(raw.card, p('card'), ctx, TOKEN_KEYS), amount: int(raw.amount, p('amount'), ctx, 1, 3, 1), to: oneOf(raw.to, p('to'), ctx, COPY_TO, 'hand') };
        // 重复上一张：再结算本回合上一张已打出的牌的效果 amount 次，不付费、不移动那张牌。
        case 'repeat-last':
            checkKeys(raw, ['op', 'amount'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 2, 1) };
        // 下一张多结算：本回合下一张（可限牌型）打出的牌额外结算 amount 次。
        case 'replay-next':
            checkKeys(raw, ['op', 'amount', 'cardType'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 2, 1), ...(raw.cardType === undefined ? {} : { cardType: oneOf(raw.cardType, p('cardType'), ctx, CARD_TYPES) }) };
        // 本场成长：这张牌的顶层伤害本场永久 +amount，只写在卡牌效果里。
        case 'grow':
            checkKeys(raw, ['op', 'amount'], path, ctx);
            if (!where) return fail(ctx, path, 'card-only');
            return { op, amount: int(raw.amount, p('amount'), ctx, 1, 5) };
        // 单张减费：mode 为选牌方式，scope 为本回合或本场。
        case 'cost-mod':
            checkKeys(raw, ['op', 'amount', 'mode', 'scope'], path, ctx);
            return { op, amount: int(raw.amount, p('amount'), ctx, -3, -1), mode: pickAt(raw.mode, p('mode'), ctx, PICK_MODES, where), scope: oneOf(raw.scope, p('scope'), ctx, COST_SCOPES, 'turn') };
        // 限时触发 BUFF（助手 10-28 第 8 点）：turns 回合内（含本回合）每次 trigger 就结算 then；card-played 可限牌型。
        case 'buff': {
            checkKeys(raw, ['op', 'trigger', 'cardType', 'turns', 'then'], path, ctx);
            if (depth > 0) return fail(ctx, path, 'nested-buff');
            const trigger = oneOf(raw.trigger, p('trigger'), ctx, BUFF_TRIGGERS);
            if (raw.cardType !== undefined && trigger !== 'card-played') return fail(ctx, p('cardType'), 'unknown-field');
            const then = list(raw.then, p('then'), ctx, 1, 2, (e, ep, c) => effectAt(e, ep, c, depth + 1));
            return { op, trigger, ...(raw.cardType === undefined ? {} : { cardType: oneOf(raw.cardType, p('cardType'), ctx, CARD_TYPES) }), turns: int(raw.turns, p('turns'), ctx, 1, 5), then };
        }
        default:
            return undefined;
    }
}

export function effectsDamage(effects) {
    let total = 0;
    for (const effect of Array.isArray(effects) ? effects : []) {
        if (effect?.op === 'damage') total += effect.amount * (effect.hits || 1);
        else if (effect?.op === 'conditional' || effect?.op === 'each-turn' || effect?.op === 'buff') total += effectsDamage(effect.then);
        // 伤害随格挡变化、无法静态封顶：技能伤害上限校验按超限处理（fail-closed）。
        else if (effect?.op === 'damage-from-block') total += 999;
    }
    return total;
}

// 卡牌顶层效果：可写 choose（打出时暂停等玩家选牌）、self、grow。
const topEffectAt = (e, ep, c) => effectAt(e, ep, c, 0, 'top');
// 卡牌关键字（布尔，只在为真时落字段，旧卡形状不变）：保留、固有、虚无、不能打出。
const CARD_FLAGS = Object.freeze(['retain', 'innate', 'ethereal', 'unplayable']);

function cardAt(raw, path, ctx, rarities = RARITIES) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const before = ctx.errors.length;
    const p = (key) => join(path, key);
    checkKeys(raw, ['id', 'name', 'type', 'cost', 'rarity', 'effects', 'upgraded', 'flavor', 'skillRef', ...CARD_FLAGS, 'onDiscard'], path, ctx);
    const name = text(raw.name, p('name'), ctx, 20);
    // 不能打出的牌没有打出效果（effects 为空数组），价值全在被弃时效果。
    const unplayable = raw.unplayable === true;
    const card = {
        id: idOf(raw.id, p('id'), ctx),
        name,
        type: oneOf(raw.type, p('type'), ctx, CARD_TYPES),
        cost: oneOf(raw.cost, p('cost'), ctx, CARD_COSTS),
        rarity: oneOf(raw.rarity, p('rarity'), ctx, rarities),
        effects: list(raw.effects, p('effects'), ctx, unplayable ? 0 : 1, unplayable ? 0 : 4, topEffectAt),
        flavor: text(raw.flavor, p('flavor'), ctx, 80, ''),
        skillRef: text(raw.skillRef, p('skillRef'), ctx, 20, name || ''),
    };
    for (const flag of CARD_FLAGS) {
        if (raw[flag] === undefined) continue;
        if (typeof raw[flag] !== 'boolean') fail(ctx, p(flag), 'expected-boolean');
        else if (raw[flag]) card[flag] = true;
    }
    // 被弃时：只有效果弃牌触发，回合末弃手牌不触发（助手 10-28）；不能写选牌与本张专属效果。
    if (raw.onDiscard !== undefined) card.onDiscard = list(raw.onDiscard, p('onDiscard'), ctx, 1, 2, effectAt);
    if (unplayable) {
        if (raw.cost !== 0) fail(ctx, p('cost'), 'unplayable-cost');
        if (raw.onDiscard === undefined) fail(ctx, p('onDiscard'), 'unplayable-needs-on-discard');
        if (raw.upgraded !== undefined) fail(ctx, p('upgraded'), 'unplayable-upgrade');
    }
    if (raw.upgraded !== undefined && !unplayable && objectAt(raw.upgraded, p('upgraded'), ctx)) {
        const up = p('upgraded');
        checkKeys(raw.upgraded, ['cost', 'effects'], up, ctx);
        const upgraded = {};
        if (raw.upgraded.cost !== undefined) upgraded.cost = oneOf(raw.upgraded.cost, join(up, 'cost'), ctx, CARD_COSTS);
        if (raw.upgraded.effects !== undefined) upgraded.effects = list(raw.upgraded.effects, join(up, 'effects'), ctx, 1, 4, topEffectAt);
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
    checkKeys(raw, ['id', 'name', 'trigger', 'cardType', 'effects', 'description'], path, ctx);
    const passive = {
        id: idOf(raw.id, p('id'), ctx),
        name: text(raw.name, p('name'), ctx, 20),
        trigger: oneOf(raw.trigger, p('trigger'), ctx, PASSIVE_TRIGGERS),
        effects: list(raw.effects, p('effects'), ctx, 1, 3, effectAt),
        description: text(raw.description, p('description'), ctx, 80, ''),
    };
    // cardType 只用于出牌与对方出牌触发（限定牌型）；缺省不写字段，旧被动形状不变。
    if (raw.cardType !== undefined) {
        if (passive.trigger !== 'card-played' && passive.trigger !== 'foe-card-played') fail(ctx, p('cardType'), 'unknown-field');
        else passive.cardType = oneOf(raw.cardType, p('cardType'), ctx, CARD_TYPES);
    }
    return passive;
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

// 人物技能（可选，旧档案没有）：效果按 heroSkillCost 费用的个人卡预算校验，不带升级版。
function heroSkillAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['id', 'name', 'effects', 'description'], path, ctx);
    const before = ctx.errors.length;
    const skill = {
        id: idOf(raw.id, p('id'), ctx),
        name: text(raw.name, p('name'), ctx, 20),
        effects: list(raw.effects, p('effects'), ctx, 1, 4, effectAt),
        description: text(raw.description, p('description'), ctx, 80, ''),
    };
    if (ctx.errors.length === before) {
        const budget = evaluateCardBudget({ cost: COMBAT_RULES.heroSkillCost, rarity: 'personal', effects: skill.effects });
        if (!budget.ok) fail(ctx, join(path, budget.path), budget.reason, budget.detail);
    }
    return skill;
}

// 抽到的主动特性（v4，助手 10-28）：效果按自身费用（1 或 2）× 特性稀有度的卡牌预算校验，不带升级版；与人物技能一样不能写选牌与本牌专属效果。
function traitSkillAt(raw, path, ctx, rarity) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['id', 'name', 'cost', 'effects', 'description'], path, ctx);
    const before = ctx.errors.length;
    const skill = {
        id: idOf(raw.id, p('id'), ctx),
        name: text(raw.name, p('name'), ctx, 20),
        cost: oneOf(raw.cost, p('cost'), ctx, TRAIT_SKILL_COSTS),
        effects: list(raw.effects, p('effects'), ctx, 1, 4, effectAt),
        description: text(raw.description, p('description'), ctx, 80, ''),
    };
    if (ctx.errors.length === before) {
        const budget = evaluateCardBudget({ cost: skill.cost, rarity, effects: skill.effects });
        if (!budget.ok) fail(ctx, join(path, budget.path), budget.reason, budget.detail);
    }
    return skill;
}

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
    checkKeys(raw, ['kind', 'v', 'id', 'name', 'aliases', 'classRef', 'base', 'growth', 'personalPassive', 'personalPool', 'starterDeck', 'heroSkill', 'signatureCards'], path, ctx);
    const base = objectAt(raw.base, join(path, 'base'), ctx) || {};
    if (isObj(raw.base)) checkKeys(raw.base, ['hp', 'energy', 'draw', 'speed'], join(path, 'base'), ctx);
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
            ...speedAt(base, path, ctx),
        },
        growth: { hpPerLevel: int(growth.hpPerLevel, join(path, 'growth.hpPerLevel'), ctx, 1, 8, 4) },
        personalPassive: passiveAt(raw.personalPassive, join(path, 'personalPassive'), ctx),
        personalPool: list(raw.personalPool, join(path, 'personalPool'), ctx, 4, 8, poolCard(['personal', ...POOL_RARITIES])),
        starterDeck: list(raw.starterDeck, join(path, 'starterDeck'), ctx, COMBAT_RULES.starterDeckSize, COMBAT_RULES.starterDeckSize, (v, vp, c) => idOf(v, vp, c)),
    };
    if (raw.heroSkill !== undefined) profile.heroSkill = heroSkillAt(raw.heroSkill, join(path, 'heroSkill'), ctx);
    // 专属卡（可选，旧档案没有时不补字段）：只收 signature 稀有度，不进起始卡组，靠剧情解锁。
    if (raw.signatureCards !== undefined) {
        profile.signatureCards = list(raw.signatureCards, join(path, 'signatureCards'), ctx, 0, COMBAT_RULES.signatureLimit, poolCard(['signature']));
        uniqueIds(profile.signatureCards, join(path, 'signatureCards'), ctx);
    }
    uniqueIds(profile.personalPool, join(path, 'personalPool'), ctx);
    return profile;
}

function skillCharacterAt(raw, path, ctx) {
    checkKeys(raw, ['kind', 'v', 'id', 'name', 'aliases', 'className', 'base', 'skills', 'passives', 'tier'], path, ctx);
    const base = objectAt(raw.base, join(path, 'base'), ctx) || {};
    if (isObj(raw.base)) checkKeys(raw.base, ['hp', 'speed'], join(path, 'base'), ctx);
    const profile = {
        kind: 'skill-character',
        v: SCHEMA_VERSION,
        id: idOf(raw.id, join(path, 'id'), ctx),
        name: text(raw.name, join(path, 'name'), ctx, 20),
        aliases: aliasesAt(raw.aliases, join(path, 'aliases'), ctx),
        className: text(raw.className, join(path, 'className'), ctx, 12, ''),
        base: { hp: int(base.hp, join(path, 'base.hp'), ctx, 20, 120), ...speedAt(base, path, ctx) },
        // 3–SKILL_COUNT_MAX：参战准备按等级补技能后写新版本档案（计划 5.4）；旧档 3–5 仍合法。
        skills: list(raw.skills, join(path, 'skills'), ctx, 3, SKILL_COUNT_MAX, skillAt),
        passives: list(raw.passives, join(path, 'passives'), ctx, 1, 2, passiveAt),
    };
    // 强度档（可选，旧档案没有时不补字段，由 session 按 defaultAllyTier 读取）。
    if (raw.tier !== undefined) profile.tier = oneOf(raw.tier, join(path, 'tier'), ctx, Object.keys(COMBAT_RULES.allyTiers));
    uniqueIds(profile.skills, join(path, 'skills'), ctx);
    // 按等级补的技能可到最高一档（D10，ALLY_SKILL_CAP_MAX）；新档案与剧情习得的技能仍由生成 / 账本按 allySkillDamageCap 拒收。
    capDamage(profile.skills, join(path, 'skills'), ctx, ALLY_SKILL_CAP_MAX);
    return profile;
}
function enemyAt(raw, path, ctx) {
    checkKeys(raw, ['kind', 'v', 'id', 'name', 'tier', 'art', 'base', 'skills', 'passives', 'phases', 'generated'], path, ctx);
    const base = objectAt(raw.base, join(path, 'base'), ctx) || {};
    if (isObj(raw.base)) checkKeys(raw.base, ['hp', 'speed'], join(path, 'base'), ctx);
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
        // art 可选：外观格位键（enemy-art.js）；旧档案没有时不补字段，非法值拒收。
        ...(raw.art === undefined ? {} : { art: oneOf(raw.art, join(path, 'art'), ctx, ENEMY_ART_KEYS) }),
        base: { hp: int(base.hp, join(path, 'base.hp'), ctx, hpMin, hpMax), ...speedAt(base, path, ctx) },
        // 2–SKILL_COUNT_MAX：参战准备按等级补技能后写新版本档案（计划 5.4）；旧档 2–5 仍合法。
        skills: list(raw.skills, join(path, 'skills'), ctx, 2, SKILL_COUNT_MAX, skillAt),
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
    const signatureIds = new Set((character.signatureCards || []).map((card) => card.id));
    for (const id of personalIds) {
        if (classIds.has(id) || BASIC_CARDS[id]) errors.push({ path: 'personalPool', reason: 'id-collision', cardId: id });
    }
    for (const id of signatureIds) {
        if (classIds.has(id) || personalIds.has(id) || BASIC_CARDS[id]) errors.push({ path: 'signatureCards', reason: 'id-collision', cardId: id });
    }
    const counts = { basicAttack: 0, basicDefend: 0, classCards: 0, personalCards: 0 };
    const copies = new Map();
    character.starterDeck.forEach((id, i) => {
        copies.set(id, (copies.get(id) || 0) + 1);
        if (id === BASIC_STRIKE_ID) counts.basicAttack += 1;
        else if (id === BASIC_DEFEND_ID) counts.basicDefend += 1;
        else if (classIds.has(id)) counts.classCards += 1;
        else if (personalIds.has(id)) counts.personalCards += 1;
        else if (signatureIds.has(id)) errors.push({ path: `starterDeck[${i}]`, reason: 'signature-in-starter', cardId: id });
        else errors.push({ path: `starterDeck[${i}]`, reason: 'unknown-card', cardId: id });
    });
    for (const [key, expected] of Object.entries(COMBAT_RULES.starterDeckShape)) {
        if (counts[key] !== expected) errors.push({ path: 'starterDeck', reason: 'starter-shape', detail: { slot: key, expected, actual: counts[key] } });
    }
    const catalog = buildCardCatalog(character, classProfile);
    for (const [id, count] of copies) {
        const limit = cardCopyLimit(catalog.get(id)?.rarity);
        if (count > limit) errors.push({ path: 'starterDeck', reason: 'copy-limit', cardId: id, detail: { count, limit } });
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

function gearAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['gearId', 'name', 'slot', 'passive', 'description', 'rarity', 'bonus'], path, ctx);
    // 正文获得的带稀有度装备（D7）：rarity 与六维加成 bonus 可选；普通 / 罕见及未抽中被动的装备没有 passive。
    // 旧条目（无 rarity）必须带被动，形状不变。
    const rarity = raw.rarity === undefined ? undefined : oneOf(raw.rarity, p('rarity'), ctx, POOL_RARITIES);
    const passive = raw.passive === undefined && raw.rarity !== undefined ? undefined : passiveAt(raw.passive, p('passive'), ctx);
    return {
        gearId: idOf(raw.gearId, p('gearId'), ctx), name: text(raw.name, p('name'), ctx, 20), slot: oneOf(raw.slot, p('slot'), ctx, GEAR_SLOTS),
        ...(passive === undefined ? {} : { passive }), description: text(raw.description, p('description'), ctx, 80, ''),
        ...(rarity === undefined ? {} : { rarity }),
        ...(raw.bonus === undefined ? {} : { bonus: gearBonusAt(raw.bonus, p('bonus'), ctx) }),
    };
}

// 装备六维加成：{ ability: 六维键, amount: 1–5 }（普通 +1 … 神话 +5，D7）。
export const GEAR_BONUS_BY_RARITY = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, mythic: 5 });
function gearBonusAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['ability', 'amount'], path, ctx);
    return { ability: oneOf(raw.ability, p('ability'), ctx, ABILITY_KEYS), amount: int(raw.amount, p('amount'), ctx, 1, 5) };
}

function gainItemAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    checkKeys(raw, ['itemId', 'name', 'count', 'effects', 'description'], path, ctx);
    return {
        itemId: idOf(raw.itemId, p('itemId'), ctx), name: text(raw.name, p('name'), ctx, 20), count: int(raw.count, p('count'), ctx, 1, ITEM_GAIN_MAX),
        effects: list(raw.effects, p('effects'), ctx, 1, 3, effectAt), description: text(raw.description, p('description'), ctx, 80, ''),
    };
}

// offer 槽位：公共字段 + 类别专属字段；杂物也有稀有度（只决定品相与翻牌爆光），没有任何战斗效果。
const REWARD_SLOT_FIELDS = Object.freeze({ card: ['card'], gear: ['gear'], item: ['item'], keepsake: [] });
function rewardSlotAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    const kind = oneOf(raw.kind, p('kind'), ctx, REWARD_KINDS);
    if (kind === undefined) return undefined;
    checkKeys(raw, ['index', 'kind', 'rarity', 'name', 'origin', ...REWARD_SLOT_FIELDS[kind]], path, ctx);
    const out = { index: int(raw.index, p('index'), ctx, 0, REWARD_SLOT_COUNT), kind, rarity: oneOf(raw.rarity, p('rarity'), ctx, POOL_RARITIES) };
    out.name = text(raw.name, p('name'), ctx, 20);
    out.origin = text(raw.origin, p('origin'), ctx, REWARD_ORIGIN_MAX, '');
    if (kind === 'card') {
        out.card = cardAt(raw.card, p('card'), ctx, POOL_RARITIES);
        if (out.card?.rarity && out.rarity && out.card.rarity !== out.rarity) fail(ctx, p('card.rarity'), 'rarity-mismatch');
    } else if (kind === 'gear') out.gear = gearAt(raw.gear, p('gear'), ctx);
    else if (kind === 'item') out.item = gainItemAt(raw.item, p('item'), ctx);
    return out;
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
        // 转职（花积分）：classRef 为换到的已登记职业，cost 为花费的积分，由归并核对。
        case 'respec':
            checkKeys(raw, ['classRef', 'cost'], path, ctx);
            return { classRef: idOf(raw.classRef, p('classRef'), ctx), cost: int(raw.cost, p('cost'), ctx, 0, 100000) };
        // 职业升阶：升到第 tier 阶（2 或 3），tierName 为按世界观生成的阶名，cards 为追加进职业池的 3 张卡；稀有度、等级门槛与 cost 由归并核对。
        case 'ascend': {
            checkKeys(raw, ['classRef', 'tier', 'tierName', 'cards', 'cost'], path, ctx);
            const cards = list(raw.cards, p('cards'), ctx, 3, 3, poolCard(POOL_RARITIES));
            if (Array.isArray(cards)) uniqueIds(cards, p('cards'), ctx);
            return {
                classRef: idOf(raw.classRef, p('classRef'), ctx), tier: int(raw.tier, p('tier'), ctx, 2, 3),
                tierName: text(raw.tierName, p('tierName'), ctx, 12), cards, cost: int(raw.cost, p('cost'), ctx, 0, 100000),
            };
        }
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
        // 重新生成基础卡组：新个人卡池与起始卡组整份写入（职业不变），cost 为花费的积分，由归并核对。
        case 'rebuild': {
            checkKeys(raw, ['personalPool', 'starterDeck', 'cost'], path, ctx);
            const personalPool = list(raw.personalPool, p('personalPool'), ctx, 4, 8, poolCard(['personal', ...POOL_RARITIES]));
            if (Array.isArray(personalPool)) uniqueIds(personalPool, p('personalPool'), ctx);
            return {
                personalPool,
                starterDeck: list(raw.starterDeck, p('starterDeck'), ctx, COMBAT_RULES.starterDeckSize, COMBAT_RULES.starterDeckSize, (v, vp, c) => idOf(v, vp, c)),
                cost: int(raw.cost, p('cost'), ctx, 0, 100000),
            };
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
        // 装备：名称 → 程序推导的 gearId；被动由副 LLM 按模板生成后写入。
        case 'equip':
            return gearAt(raw, path, ctx);
        case 'unequip':
            checkKeys(raw, ['gearId'], path, ctx);
            return { gearId: idOf(raw.gearId, p('gearId'), ctx) };
        case 'item':
            return gainItemAt(raw, path, ctx);
        // 消耗：战报楼落楼后按本场实际用量写入，锚定战报用户楼；战报楼换 swipe 或删除时自然回退。
        case 'consume':
            checkKeys(raw, ['itemId', 'count', 'reportId'], path, ctx);
            return { itemId: idOf(raw.itemId, p('itemId'), ctx), count: int(raw.count, p('count'), ctx, 1, ITEM_CONSUME_MAX), reportId: text(raw.reportId, p('reportId'), ctx, 40, '') };
        // 准备阶段奖励：锚定开战楼，每场一条；槽位按 index 0.. 依次排列。
        // reserve 是翻牌花积分重抽时换上的备用套，与 slots 等长；旧条目没有 reserve，不可重抽。
        case 'offer': {
            checkKeys(raw, ['combatId', 'tier', 'exp', 'reveal', 'slots', 'reserve'], path, ctx);
            const slotsAt = (key) => {
                const out = list(raw[key], p(key), ctx, REWARD_SLOT_COUNT, REWARD_SLOT_COUNT + 1, rewardSlotAt);
                if (Array.isArray(out)) out.forEach((s, i) => { if (s && s.index !== i) fail(ctx, `${p(key)}[${i}].index`, 'slot-index-mismatch'); });
                return out;
            };
            const slots = slotsAt('slots');
            const reserve = raw.reserve === undefined ? undefined : slotsAt('reserve');
            if (Array.isArray(slots) && Array.isArray(reserve) && reserve.length !== slots.length) fail(ctx, p('reserve'), 'reserve-length-mismatch');
            return {
                combatId: text(raw.combatId, p('combatId'), ctx, 120), tier: oneOf(raw.tier, p('tier'), ctx, Object.keys(COMBAT_RULES.tiers)),
                exp: int(raw.exp, p('exp'), ctx, 0, 1000), reveal: int(raw.reveal, p('reveal'), ctx, 0, 2, 0), slots,
                ...(reserve === undefined ? {} : { reserve }),
            };
        }
        // 翻牌兑现：战报楼 loot 标签 → 开战楼 offer 的一个槽位，内容整份拷入；set 为 reserve（花积分换上的备用套）时 cost 是扣的积分。
        case 'loot':
            checkKeys(raw, ['combatId', 'reportId', 'set', 'slot', 'cost'], path, ctx);
            return {
                combatId: text(raw.combatId, p('combatId'), ctx, 120), reportId: text(raw.reportId, p('reportId'), ctx, 40),
                set: oneOf(raw.set, p('set'), ctx, ['main', 'reserve']), slot: rewardSlotAt(raw.slot, p('slot'), ctx),
                cost: int(raw.cost, p('cost'), ctx, 0, 100000, 0),
            };
        // 背包卖出：杂物写 lootId（指向那件杂物的 loot 条目），装备写 gearId，二者恰有其一；积分由程序按稀有度与物品身份计算，不写进载荷。
        case 'sell':
            checkKeys(raw, ['lootId', 'gearId'], path, ctx);
            if (('lootId' in raw) === ('gearId' in raw)) return fail(ctx, path, 'sell-target-invalid');
            return 'gearId' in raw ? { gearId: idOf(raw.gearId, p('gearId'), ctx) } : { lootId: idOf(raw.lootId, p('lootId'), ctx, ENTRY_ID_RE) };
        // 人物特性（P-d）：抽取成功写 trait（traitId 由程序给定；passive 复用被动模板按稀有度加强；link 为可选的翻牌联动；cost 为花费的积分，由归并核对）。
        // v4（助手 10-28）：kind 缺省为被动（旧条目没有 kind，形状不变）；主动特性写 kind: 'active' 与 skill，不带 passive。
        // 已满时新特性待定，再写 trait-pick 决定 drop：已装特性的 ID 为替换它，新特性自己的 ID 为放弃；被 drop 的永久消失。
        case 'trait': {
            checkKeys(raw, ['traitId', 'name', 'origin', 'rarity', 'kind', 'passive', 'skill', 'link', 'cost'], path, ctx);
            const kind = raw.kind === undefined ? 'passive' : oneOf(raw.kind, p('kind'), ctx, TRAIT_KINDS);
            const out = {
                traitId: idOf(raw.traitId, p('traitId'), ctx), name: text(raw.name, p('name'), ctx, 20),
                origin: text(raw.origin, p('origin'), ctx, REWARD_ORIGIN_MAX, ''), rarity: oneOf(raw.rarity, p('rarity'), ctx, TRAIT_RARITIES),
            };
            if (kind === 'active') {
                if (raw.passive !== undefined) fail(ctx, p('passive'), 'unknown-field');
                Object.assign(out, { kind, skill: traitSkillAt(raw.skill, p('skill'), ctx, out.rarity) });
            } else {
                if (raw.skill !== undefined) fail(ctx, p('skill'), 'unknown-field');
                Object.assign(out, raw.kind === undefined ? {} : { kind }, { passive: passiveAt(raw.passive, p('passive'), ctx) });
            }
            return {
                ...out, ...(raw.link === undefined ? {} : { link: oneOf(raw.link, p('link'), ctx, TRAIT_LINKS) }),
                cost: int(raw.cost, p('cost'), ctx, 0, 100000),
            };
        }
        case 'trait-pick':
            checkKeys(raw, ['traitId', 'drop'], path, ctx);
            return { traitId: idOf(raw.traitId, p('traitId'), ctx), drop: idOf(raw.drop, p('drop'), ctx) };
        // 解锁特性槽（v4，助手 10-28）：slot 为要解锁的槽（须为下一个，由归并核对），cost 为该槽价格（traits.js 的 TRAIT_SLOT_COSTS，由归并核对）。
        case 'trait-slot':
            checkKeys(raw, ['slot', 'cost'], path, ctx);
            return { slot: int(raw.slot, p('slot'), ctx, TRAIT_BASE_SLOTS + 1, TRAIT_SLOT_MAX), cost: int(raw.cost, p('cost'), ctx, 0, 100000) };
        // 持续伤势（v4，助手 10-29）：战报楼落楼后按我方每名角色的战后生命写入，锚定战报用户楼；reportId 须与楼里的战报一致（由归并核对）；down 为本场倒下。
        case 'wound': {
            checkKeys(raw, ['hp', 'maxHp', 'down', 'reportId'], path, ctx);
            const maxHp = int(raw.maxHp, p('maxHp'), ctx, 1, 9999);
            const hp = int(raw.hp, p('hp'), ctx, 0, 9999);
            if (Number.isInteger(hp) && Number.isInteger(maxHp) && hp > maxHp) fail(ctx, p('hp'), 'out-of-range', { min: 0, max: maxHp });
            if (typeof raw.down !== 'boolean') fail(ctx, p('down'), 'expected-boolean');
            return { hp, maxHp, down: raw.down === true, reportId: text(raw.reportId, p('reportId'), ctx, 40) };
        }
        // 剧情回血：正文 heal 标签；scale 为写入时难度的回血倍率（百分比，噩梦 50），之后改难度不影响已记的回血。
        case 'heal': {
            checkKeys(raw, ['amount', 'mode', 'scale', 'reason'], path, ctx);
            const mode = oneOf(raw.mode, p('mode'), ctx, HEAL_MODES);
            const amount = int(raw.amount, p('amount'), ctx, 1, mode === 'percent' ? 100 : 9999);
            return { amount, mode, scale: int(raw.scale, p('scale'), ctx, 1, 100), reason: text(raw.reason, p('reason'), ctx, 80, '') };
        }
        // 剧情受伤（合并计划 N3）：正文 [igs-stat:hurt|档位]；pct 为扣除的生命上限百分比，maxHp 为写入时的生命上限（之后升级不影响已记的伤势）。
        case 'hurt': {
            checkKeys(raw, ['tier', 'pct', 'maxHp'], path, ctx);
            return {
                tier: oneOf(raw.tier, p('tier'), ctx, HURT_TIER_KEYS),
                pct: int(raw.pct, p('pct'), ctx, 1, 100),
                maxHp: int(raw.maxHp, p('maxHp'), ctx, 1, 9999),
            };
        }
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

// 属性表记录：init 无锚点（每角色首写为准）；rel / story 来自正文标签；alloc 来自面板分配（锚点 tagHash 固定）；reward 来自翻牌。
export const ATTRIBUTE_TYPES = Object.freeze(['init', 'rel', 'story', 'alloc', 'reward']);
const ABILITY_OR_FREE = Object.freeze([...ABILITY_KEYS, 'free']);

function attributePayloadAt(type, raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    const p = (key) => join(path, key);
    switch (type) {
        case 'init': {
            checkKeys(raw, ['className', 'role', 'major', 'minor', 'weak'], path, ctx);
            const out = {
                className: text(raw.className, p('className'), ctx, 12, ''),
                role: oneOf(raw.role, p('role'), ctx, Object.keys(COMBAT_RULES.archetypes)),
                major: oneOf(raw.major, p('major'), ctx, ABILITY_KEYS),
                minor: oneOf(raw.minor, p('minor'), ctx, ABILITY_KEYS),
                weak: oneOf(raw.weak, p('weak'), ctx, ABILITY_KEYS),
            };
            if (new Set([out.major, out.minor, out.weak]).size !== 3) fail(ctx, path, 'prefs-duplicate');
            return out;
        }
        case 'rel':
            checkKeys(raw, ['tier', 'anchorLevel', 'offset'], path, ctx);
            return {
                tier: oneOf(raw.tier, p('tier'), ctx, Object.keys(REL_TIERS)),
                anchorLevel: int(raw.anchorLevel, p('anchorLevel'), ctx, 1, COMBAT_RULES.maxLevel),
                offset: int(raw.offset, p('offset'), ctx, -12, 12),
            };
        case 'story':
            checkKeys(raw, ['ability', 'amount', 'reason'], path, ctx);
            return { ability: oneOf(raw.ability, p('ability'), ctx, ABILITY_OR_FREE), amount: int(raw.amount, p('amount'), ctx, 1, 2), reason: text(raw.reason, p('reason'), ctx, 80, '') };
        case 'alloc':
            if (Object.hasOwn(raw, 'picks')) {
                checkKeys(raw, ['picks'], path, ctx);
                if (!Array.isArray(raw.picks) || !raw.picks.length || raw.picks.length > ABILITY_KEYS.length) {
                    fail(ctx, p('picks'), 'invalid-picks');
                    return undefined;
                }
                const picks = raw.picks.map((pick, i) => {
                    const at = `${p('picks')}[${i}]`;
                    if (!objectAt(pick, at, ctx)) return {};
                    checkKeys(pick, ['ability', 'amount'], at, ctx);
                    return { ability: oneOf(pick.ability, join(at, 'ability'), ctx, ABILITY_KEYS), amount: int(pick.amount, join(at, 'amount'), ctx, 1, 19) };
                });
                if (new Set(picks.map(pick => pick.ability)).size !== picks.length) fail(ctx, p('picks'), 'duplicate-ability');
                return { picks };
            }
            checkKeys(raw, ['ability', 'amount'], path, ctx);
            return { ability: oneOf(raw.ability, p('ability'), ctx, ABILITY_KEYS), amount: int(raw.amount, p('amount'), ctx, 1, 2) };
        case 'reward':
            checkKeys(raw, ['ability', 'amount', 'reportId'], path, ctx);
            return { ability: oneOf(raw.ability, p('ability'), ctx, ABILITY_OR_FREE), amount: int(raw.amount, p('amount'), ctx, 1, 4), reportId: text(raw.reportId, p('reportId'), ctx, 40, '') };
        default:
            return undefined;
    }
}

function attributeRecordAt(raw, path, ctx) {
    if (!objectAt(raw, path, ctx)) return undefined;
    checkKeys(raw, ['id', 'type', 'character', 'anchor', 'payload', 'createdAt', 'change'], path, ctx);
    const type = oneOf(raw.type, join(path, 'type'), ctx, ATTRIBUTE_TYPES);
    return {
        id: idOf(raw.id, join(path, 'id'), ctx, ENTRY_ID_RE),
        type,
        character: idOf(raw.character, join(path, 'character'), ctx),
        anchor: anchorAt(raw.anchor, join(path, 'anchor'), ctx, type !== undefined && type !== 'init'),
        payload: type === undefined ? undefined : attributePayloadAt(type, raw.payload, join(path, 'payload'), ctx),
        createdAt: int(raw.createdAt, join(path, 'createdAt'), ctx, 0, Number.MAX_SAFE_INTEGER),
        change: text(raw.change, join(path, 'change'), ctx, 40, ''),
    };
}

export function normalizeAttributeRecord(raw) {
    return run(attributeRecordAt, raw);
}

export function ledgerEntryId(type, character, anchor) {
    if (!anchor) return `${type}|${character}`;
    return [type, character, anchor.messageId, anchor.swipeId, anchor.tagHash, anchor.occurrence].join('|');
}

export function profileIdFor(kind, name) {
    const prefix = { class: 'cls', 'deck-character': 'pc', 'skill-character': 'sc', enemy: 'en' }[kind] || 'x';
    return `${prefix}-${hashString(String(name || '').trim().toLowerCase())}`;
}

// 装备与道具 ID 由名称确定性推导（NFKC、去空白、小写），同名即同一件，标签重写或换写法时不产生重复。
const itemNameKey = (name) => String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
export const gearIdFor = (name) => `gr-${hashString(itemNameKey(name))}`;
export const itemIdFor = (name) => `it-${hashString(itemNameKey(name))}`;


