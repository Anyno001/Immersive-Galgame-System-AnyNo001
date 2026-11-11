// 战斗数据结构校验：档案（职业/牌组角色/技能角色/敌人）、卡牌、技能、账本条目、属性记录。
// 校验器是「规范化」风格：返回清洗后的新对象，同时把问题累积到 state.errors（path/reason/detail），不抛异常。
// 常量数组均冻结只读。字段范围、文案与规则常量原样来自 v0.39.0，不要顺手调整玩法。
import {
    ALLY_SKILL_CAP_MAX, BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES, SKILL_COUNT_MAX, TOKEN_KEYS,
    cardCopyLimit, evaluateCardBudget,
} from './rules.js';
import { hashString } from './random.js';
import { BATTLE_POINTS_RANGE, BATTLE_POINT_TIERS, battlePoints, weakBattlePoints } from './points.js';
import { ENEMY_ART_KEYS } from './enemy-art.js';
import { ABILITY_KEYS, REL_TIERS, normalizeManualScores, prefsFromScores } from './abilities.js';
import { TRAIT_BASE_SLOTS, TRAIT_KINDS, TRAIT_LINKS, TRAIT_RARITIES, TRAIT_SKILL_COSTS, TRAIT_SLOT_MAX } from './traits.js';
import { DEFEAT_CAUSES, ORB_FILTER_KINDS, opHandler, reserveBuiltins } from './mechanics/registry.js';
import { INSCRIPTION_KEYS, inscribable } from './mechanics/inscription.js';
import { rewardUpgradable } from './reward-cards.js';
import { APPLY_STATUSES } from './mechanics/apply-status.js';
import { TREASURE_SLOT_MAX } from './gear-slots.js';
import { fixedCard, fixedClassPool, isFixedCardId } from './fixed-cards/index.js';
import { RELIC_MODELS, isCombatModel, relicById } from './relics/index.js';
import { winPointsBonus } from './relics/off-combat.js';
import { BIAS_CATEGORIES, TRAIT_FLIPS, biasCategoryOf, traitFlipIssue } from './trait-reward-bias.js';
import { CLASS_PASSIVE_VERSION } from './class-passives.js';
import { CARD_ARCHETYPES } from './attribute-policy.js';
// 规则 v5 机制登记入口：先于 reserveBuiltins 完成登记，机制占用内置名时在此抛错。
import './mechanics/index.js';

export const SCHEMA_VERSION = 1;

export const EFFECT_OPS = Object.freeze([
    'damage', 'block', 'heal', 'draw', 'energy', 'status', 'exhaust-self', 'conditional', 'damage-from-block', 'self-damage',
    'double', 'next-turn', 'each-turn', 'hand-cost', 'cleanse', 'discard', 'discard-hand', 'copy', 'create', 'repeat-last',
    'replay-next', 'grow', 'cost-mod', 'buff', 'delayed-counter', 'mutual-damage', 'random-branch',
]);
export const STATUSES = Object.freeze(['vulnerable', 'weak', 'strength', 'dexterity', 'poison', 'regen', 'thorns', 'intangible', 'no-draw', 'endure', 'artifact', 'frail']);
// 内置算子与状态登记为保留名，规则 v5 的新机制只能在 mechanics/ 注册表中另起名字。
reserveBuiltins(EFFECT_OPS, STATUSES);
export const DOUBLE_STATS = Object.freeze(['poison', 'block', 'strength']);
export const NEXT_TURN_GAINS = Object.freeze(['draw', 'energy']);
export const OFFENSE_TARGETS = Object.freeze(['enemy', 'all-enemies', 'random-enemy']);
export const SUPPORT_TARGETS = Object.freeze(['self', 'ally', 'all-allies']);
export const CARD_TYPES = Object.freeze(['attack', 'skill', 'power']);
export const RARITIES = Object.freeze(['basic', 'common', 'uncommon', 'rare', 'epic', 'mythic', 'personal', 'signature']);
export const CARD_COSTS = Object.freeze([0, 1, 2, 3, 'X']);
export const SKILL_INTENTS = Object.freeze(['attack', 'defend', 'buff', 'debuff', 'heal', 'special']);
export const PASSIVE_TRIGGERS = Object.freeze([
    'battle-start', 'turn-start', 'turn-end', 'on-hit', 'on-low-hp', 'card-played', 'discard', 'exhaust', 'kill', 'shuffle',
    'hp-loss', 'block-gain', 'foe-card-played',
    // 规则 v5 G20：抽牌后、生成临时牌后、使敌人陷入减益后、格挡被打破时（只在 v5 战斗中触发）。
    'draw', 'create', 'debuff-applied', 'block-broken',
    // 规则 v6 G5b（只在 v6 战斗中触发）：敌人倒下（任意死因）、获得状态后、使用道具后、预知后、凝结法珠后、消耗圣辉后、随从出手后。
    'defeated', 'status-gained', 'item-used', 'foresee', 'orb-channel', 'radiance-spent', 'minion-act',
]);
// 被动过滤字段（规则 v6 G5b）可用的触发器：status 限获得状态 / 使敌人陷入减益，orb 限凝结法珠，cause 限敌人倒下。
const FILTER_TRIGGERS = Object.freeze({ status: ['status-gained', 'debuff-applied'], orb: ['orb-channel'], cause: ['defeated'] });
export const PROFILE_KINDS = Object.freeze(['class', 'deck-character', 'skill-character', 'enemy']);
export const LEDGER_TYPES = Object.freeze([
    'profile', 'exp', 'learn', 'upgrade', 'class', 'reward', 'deck', 'revoke', 'equip', 'unequip', 'item', 'consume', 'offer',
    'loot', 'sell', 'rebuild', 'respec', 'ascend', 'trait', 'trait-pick', 'trait-slot', 'wound', 'heal', 'hurt', 'keepsake', 'lose', 'battle-growth', 'inscribe',
    'purge', 'card-upgrade', 'card-draw', 'card-flip', 'card-pick', 'battle-points', 'relic-inscribe',
]);
export const GEAR_SLOTS = Object.freeze(['weapon', 'armor', 'accessory', 'treasure']);
// 按剧情给的初始装备锚定开战楼、不来自标签，锚点 tagHash 固定为此值。
export const INIT_GEAR_TAG_HASH = 'init-gear';
export const ITEM_GAIN_MAX = 3;
// 规则 v5 G24 / G25：永久成长累计上限（每张牌的伤害、格挡各自封顶；击杀奖励的最大生命按角色累计封顶）。
export const BATTLE_GROWTH_MAX = 20;
const BATTLE_GROWTH_CARDS_MAX = 40;
export const ITEM_CONSUME_MAX = 30;
export const HEAL_MODES = Object.freeze(['flat', 'percent']);
export const HURT_TIER_KEYS = Object.freeze(['轻伤', '中伤', '重伤']);
// inscribe：规则 v5 P5b 刻印奖励槽（刻印种类与目标副本由程序按种子定）。
export const REWARD_KINDS = Object.freeze(['card', 'gear', 'item', 'keepsake', 'inscribe']);
export const REWARD_SLOT_COUNT = 3;
export const REWARD_SLOT_MAX = 4;
// 基础奖励三候选；积分抽卡独立固定为三候选。
export const REWARD_CARD_CHOICES = 3;
export const REWARD_CARD_CHOICES_MAX = 4;
export const CARD_DRAW_CHOICES = 3;
export const REWARD_ORIGIN_MAX = 30;
export const BUFF_TRIGGERS = Object.freeze(['card-played', 'discard', 'exhaust', 'kill', 'hp-loss', 'block-gain', 'turn-start', 'turn-end']);
export const GEAR_BONUS_BY_RARITY = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, mythic: 5 });
export const ATTRIBUTE_TYPES = Object.freeze(['init', 'rel', 'story', 'alloc', 'reward']);

// 以下为模块内部常量。
// status 效果的合法目标 = 攻击目标 + 辅助目标。
const STATUS_TARGETS = Object.freeze([...OFFENSE_TARGETS, ...SUPPORT_TARGETS]);
// 这些状态默认挂在自己身上，其余默认挂敌人。
const SELF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns', 'intangible', 'no-draw', 'endure', 'artifact']);
// 规则 v5 G22：目标意图为攻击、目标生命低于百分比、手牌数、本场已消耗数。
// 规则 v6 G5a（遗物条件，只在 v6 战斗成立）：本回合计数不超过 N（含 0）、第 N 回合、自身格挡阈值、本场有精英/首领、目标灾厄层数。
const LTE_CONDITIONS = new Set(['cards-played-lte', 'attacks-played-lte', 'skills-played-lte', 'discarded-lte', 'hand-lte']);
const TURN_CONDITIONS = new Set(['turn-eq', 'turn-gte']);
const BLOCK_CONDITIONS = new Set(['self-block-gte', 'self-block-lte']);
export const BATTLE_TIERS = Object.freeze(['elite', 'boss']);
const CONDITION_KINDS = Object.freeze([
    'target-has', 'self-has', 'self-hp-below', 'cards-played-gte', 'attacks-played-gte', 'skills-played-gte', 'same-card-gte', 'discarded-gte', 'target-intent-attack', 'target-hp-below', 'hand-gte', 'exhausted-gte',
    ...LTE_CONDITIONS, ...TURN_CONDITIONS, ...BLOCK_CONDITIONS, 'battle-tier', 'target-doom-gte', 'target-doom-hp',
]);
const COUNT_CONDITIONS = new Set(['cards-played-gte', 'attacks-played-gte', 'skills-played-gte', 'same-card-gte', 'discarded-gte', 'hand-gte', 'exhausted-gte']);
const DISCARD_MODES = Object.freeze(['choose', 'random']);
const PICK_MODES = Object.freeze(['self', 'choose', 'random']);
const PILES = Object.freeze(['hand', 'discard', 'draw']);
const COST_SCOPES = Object.freeze(['turn', 'combat']);
const EACH_TURN_TIMINGS = Object.freeze(['turn-start', 'turn-end']);
const LOOT_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
// sly（狡黠，规则 v5）：字段先行，结算在通用机制批次接入。
const CARD_FLAGS = Object.freeze(['retain', 'innate', 'ethereal', 'unplayable', 'sly']);
// 规则 v6 卡牌模型：fixed 为固定卡表的牌（类型、费用、效果写死），random 为模板求解的随机牌；缺省 random，只在 fixed 时写字段。
export const CARD_MODELS = Object.freeze(['fixed', 'random']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const LEDGER_ID_PATTERN = /^[A-Za-z0-9_|:.-]{1,200}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const joinPath = (base, key) => (base ? `${base}.${key}` : String(key));

// 记一条问题，返回 undefined（调用方直接 return addIssue(...)）。
function addIssue(state, path, reason, detail) {
    state.errors.push(detail === undefined ? { path, reason } : { path, reason, detail });
}

// 对象里出现白名单之外的键，每个记一条 unknown-field。
function checkKnownFields(obj, allowed, base, state) {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) addIssue(state, joinPath(base, key), 'unknown-field');
}

// 整数字段：缺省且有默认值时取默认；否则必须是 [min, max] 内的整数。
function intField(value, path, state, min, max, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    return !Number.isInteger(value) || value < min || value > max ? addIssue(state, path, 'out-of-range', { min, max }) : value;
}

// 速度字段（可选）：40..200。
function speedField(base, path, state) {
    return base.speed === undefined ? {} : { speed: intField(base.speed, joinPath(path, 'base.speed'), state, 40, 200) };
}

// 文本字段：trim 后非空且不超过 max；缺省/空串且有默认值时取默认。
function textField(value, path, state, max, fallback) {
    if ((value === undefined || value === '') && fallback !== undefined) return fallback;
    if (typeof value !== 'string' || !value.trim()) return addIssue(state, path, 'required-text');
    const text = value.trim();
    return text.length > max ? addIssue(state, path, 'too-long', { max }) : text;
}

// 枚举字段：缺省且有默认值时取默认；否则必须在 allowed 内。
function enumField(value, path, state, allowed, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    return allowed.includes(value) ? value : addIssue(state, path, 'invalid-enum', { allowed: [...allowed] });
}

// 数组字段：长度在 [min, max] 内，逐项用 validateItem(item, path, state) 校验。
function arrayField(value, path, state, min, max, validateItem) {
    if (!Array.isArray(value)) return addIssue(state, path, 'expected-array');
    if (value.length < min || value.length > max) return addIssue(state, path, 'length-out-of-range', { min, max, size: value.length });
    return value.map((item, index) => validateItem(item, `${path}[${index}]`, state));
}

function idField(value, path, state, pattern = ID_PATTERN) {
    return typeof value !== 'string' || !pattern.test(value) ? addIssue(state, path, 'invalid-id') : value;
}

function objectField(value, path, state) {
    return isObject(value) ? value : addIssue(state, path, 'expected-object');
}

// 跑一个校验器：有问题返回 { ok:false, errors }，否则 { ok:true, value }。
function runValidator(validate, input) {
    const state = { errors: [] };
    const value = validate(input, '', state);
    return state.errors.length ? { ok: false, errors: state.errors } : { ok: true, value, errors: [] };
}

// 效果条件：{ kind, value }。
function validateCondition(cond, path, state) {
    if (!objectField(cond, path, state)) return;
    checkKnownFields(cond, ['kind', 'value'], path, state);
    const kind = enumField(cond.kind, joinPath(path, 'kind'), state, CONDITION_KINDS);
    const valuePath = joinPath(path, 'value');
    if (kind === 'target-has' || kind === 'self-has') return { kind, value: enumField(cond.value, valuePath, state, STATUSES) };
    if (kind === 'self-hp-below' || kind === 'target-hp-below') return { kind, value: intField(cond.value, valuePath, state, 1, 99) };
    if (kind === 'target-intent-attack' || kind === 'target-doom-hp') return cond.value === undefined ? { kind } : addIssue(state, valuePath, 'unknown-field');
    if (COUNT_CONDITIONS.has(kind)) return { kind, value: intField(cond.value, valuePath, state, 1, 10) };
    if (LTE_CONDITIONS.has(kind)) return { kind, value: intField(cond.value, valuePath, state, 0, 10) };
    if (TURN_CONDITIONS.has(kind)) return { kind, value: intField(cond.value, valuePath, state, 1, 20) };
    if (kind === 'self-block-gte') return { kind, value: intField(cond.value, valuePath, state, 1, 99) };
    if (kind === 'self-block-lte') return { kind, value: intField(cond.value, valuePath, state, 0, 99) };
    if (kind === 'battle-tier') return { kind, value: enumField(cond.value, valuePath, state, BATTLE_TIERS) };
    if (kind === 'target-doom-gte') return { kind, value: intField(cond.value, valuePath, state, 1, 99) };
}

// 选择模式：choose 只能在顶层卡牌效果里用，self 只能用于卡牌（非技能）。
function pickMode(value, path, state, allowed, scope) {
    const mode = enumField(value, path, state, allowed);
    if (mode === 'choose' && scope !== 'top') return addIssue(state, path, 'choose-not-top-level');
    if (mode === 'self' && !scope) return addIssue(state, path, 'card-only');
    return mode;
}

// 交给已登记机制的字段校验工具，与内置算子共用同一套规则与错误码。
const FIELD_KIT = Object.freeze({ addIssue, checkKnownFields, intField, enumField, arrayField, idField, joinPath, STATUSES, OFFENSE_TARGETS, SUPPORT_TARGETS });

// 单个效果。depth 为嵌套层数（条件/每回合/增益内不得再嵌套），scope 为 'top'（卡牌顶层）、'card'（卡牌内嵌套）或空（技能/被动）。
function validateEffect(effect, path, state, depth = 0, scope) {
    if (!objectField(effect, path, state)) return;
    const handler = EFFECT_OPS.includes(effect.op) ? null : opHandler(effect.op);
    const op = handler ? effect.op : enumField(effect.op, joinPath(path, 'op'), state, EFFECT_OPS);
    const at = (key) => joinPath(path, key);
    switch (op) {
        case 'damage':
            checkKnownFields(effect, ['op', 'amount', 'hits', 'target', 'strengthScale'], path, state);
            return {
                op,
                amount: intField(effect.amount, at('amount'), state, 1, 99),
                hits: intField(effect.hits, at('hits'), state, 1, 5, 1),
                target: enumField(effect.target, at('target'), state, OFFENSE_TARGETS, 'enemy'),
                ...(effect.strengthScale === undefined ? {} : { strengthScale: intField(effect.strengthScale, at('strengthScale'), state, 1, 5) }),
            };
        case 'block':
            checkKnownFields(effect, ['op', 'amount', 'target'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 99), target: enumField(effect.target, at('target'), state, SUPPORT_TARGETS, 'self') };
        case 'heal':
            checkKnownFields(effect, ['op', 'amount', 'target'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 60), target: enumField(effect.target, at('target'), state, SUPPORT_TARGETS, 'self') };
        case 'draw':
            checkKnownFields(effect, ['op', 'amount'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 5) };
        case 'energy':
            checkKnownFields(effect, ['op', 'amount'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 3) };
        case 'status': {
            checkKnownFields(effect, ['op', 'status', 'stacks', 'target'], path, state);
            const status = enumField(effect.status, at('status'), state, STATUSES);
            const defaultTarget = SELF_STATUSES.has(status) ? 'self' : 'enemy';
            return { op, status, stacks: intField(effect.stacks, at('stacks'), state, 1, 10), target: enumField(effect.target, at('target'), state, STATUS_TARGETS, defaultTarget) };
        }
        case 'exhaust-self':
            checkKnownFields(effect, ['op'], path, state);
            return { op };
        case 'conditional': {
            checkKnownFields(effect, ['op', 'when', 'then'], path, state);
            if (depth > 0) return addIssue(state, path, 'nested-conditional');
            const when = validateCondition(effect.when, at('when'), state);
            const then = arrayField(effect.then, at('then'), state, 1, 3, (item, itemPath, st) => validateEffect(item, itemPath, st, depth + 1, scope ? 'card' : undefined));
            return { op, when, then };
        }
        case 'delayed-counter':
            checkKnownFields(effect, ['op', 'amount', 'mult', 'fizzle', 'target'], path, state);
            return {
                op,
                amount: intField(effect.amount, at('amount'), state, 1, 20),
                mult: intField(effect.mult, at('mult'), state, 1, 4, 2),
                ...(effect.fizzle === undefined ? {} : { fizzle: idField(effect.fizzle, at('fizzle'), state) }),
                target: enumField(effect.target, at('target'), state, ['enemy'], 'enemy'),
            };
        case 'mutual-damage':
            checkKnownFields(effect, ['op', 'amount', 'selfAmount', 'target'], path, state);
            return {
                op,
                amount: intField(effect.amount, at('amount'), state, 1, 40),
                ...(effect.selfAmount === undefined ? {} : { selfAmount: intField(effect.selfAmount, at('selfAmount'), state, 1, 40) }),
                target: enumField(effect.target, at('target'), state, ['enemy'], 'enemy'),
            };
        case 'random-branch': {
            checkKnownFields(effect, ['op', 'a', 'b'], path, state);
            if (depth > 0) return addIssue(state, path, 'nested-conditional');
            const branch = (key) => arrayField(effect[key], at(key), state, 0, 2, (item, itemPath, st) => validateEffect(item, itemPath, st, depth + 1, scope ? 'card' : undefined));
            return { op, a: branch('a'), b: branch('b') };
        }
        case 'damage-from-block':
            checkKnownFields(effect, ['op', 'target'], path, state);
            return { op, target: enumField(effect.target, at('target'), state, OFFENSE_TARGETS, 'enemy') };
        case 'self-damage':
            checkKnownFields(effect, ['op', 'amount'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 20) };
        case 'double': {
            checkKnownFields(effect, ['op', 'stat', 'target'], path, state);
            const stat = enumField(effect.stat, at('stat'), state, DOUBLE_STATS);
            const isPoison = stat === 'poison';
            return { op, stat, target: enumField(effect.target, at('target'), state, isPoison ? OFFENSE_TARGETS : SUPPORT_TARGETS, isPoison ? 'enemy' : 'self') };
        }
        case 'next-turn': {
            checkKnownFields(effect, ['op', 'gain', 'amount'], path, state);
            const gain = enumField(effect.gain, at('gain'), state, NEXT_TURN_GAINS);
            return { op, gain, amount: intField(effect.amount, at('amount'), state, 1, gain === 'energy' ? 3 : 5) };
        }
        case 'each-turn': {
            checkKnownFields(effect, ['op', 'then', 'at'], path, state);
            if (depth > 0) return addIssue(state, path, 'nested-each-turn');
            const then = arrayField(effect.then, at('then'), state, 1, 2, (item, itemPath, st) => validateEffect(item, itemPath, st, depth + 1));
            const timing = enumField(effect.at, at('at'), state, EACH_TURN_TIMINGS, 'turn-start');
            return timing === 'turn-end' ? { op, then, at: timing } : { op, then };
        }
        case 'hand-cost':
            checkKnownFields(effect, ['op', 'amount'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, -3, -1) };
        case 'cleanse':
            checkKnownFields(effect, ['op', 'target'], path, state);
            return { op, target: enumField(effect.target, at('target'), state, SUPPORT_TARGETS, 'self') };
        case 'discard':
            checkKnownFields(effect, ['op', 'amount', 'mode'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 5), mode: effect.mode === undefined ? 'random' : pickMode(effect.mode, at('mode'), state, DISCARD_MODES, scope) };
        case 'discard-hand':
            checkKnownFields(effect, ['op', 'redraw'], path, state);
            if (effect.redraw !== undefined && typeof effect.redraw !== 'boolean') return addIssue(state, at('redraw'), 'expected-boolean');
            return effect.redraw ? { op, redraw: true } : { op };
        case 'copy':
            checkKnownFields(effect, ['op', 'amount', 'from', 'to'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 3), from: pickMode(effect.from, at('from'), state, PICK_MODES, scope), to: enumField(effect.to, at('to'), state, PILES, 'hand') };
        case 'create':
            checkKnownFields(effect, ['op', 'card', 'amount', 'to'], path, state);
            return { op, card: enumField(effect.card, at('card'), state, TOKEN_KEYS), amount: intField(effect.amount, at('amount'), state, 1, 3, 1), to: enumField(effect.to, at('to'), state, PILES, 'hand') };
        case 'repeat-last':
            checkKnownFields(effect, ['op', 'amount'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 2, 1) };
        case 'replay-next':
            checkKnownFields(effect, ['op', 'amount', 'cardType'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, 1, 2, 1), ...(effect.cardType === undefined ? {} : { cardType: enumField(effect.cardType, at('cardType'), state, CARD_TYPES) }) };
        case 'grow':
            checkKnownFields(effect, ['op', 'amount'], path, state);
            return scope ? { op, amount: intField(effect.amount, at('amount'), state, 1, 5) } : addIssue(state, path, 'card-only');
        case 'cost-mod':
            checkKnownFields(effect, ['op', 'amount', 'mode', 'scope'], path, state);
            return { op, amount: intField(effect.amount, at('amount'), state, -3, -1), mode: pickMode(effect.mode, at('mode'), state, PICK_MODES, scope), scope: enumField(effect.scope, at('scope'), state, COST_SCOPES, 'turn') };
        case 'buff': {
            checkKnownFields(effect, ['op', 'trigger', 'cardType', 'turns', 'then'], path, state);
            if (depth > 0) return addIssue(state, path, 'nested-buff');
            const trigger = enumField(effect.trigger, at('trigger'), state, BUFF_TRIGGERS);
            if (effect.cardType !== undefined && trigger !== 'card-played') return addIssue(state, at('cardType'), 'unknown-field');
            const then = arrayField(effect.then, at('then'), state, 1, 2, (item, itemPath, st) => validateEffect(item, itemPath, st, depth + 1));
            return {
                op,
                trigger,
                ...(effect.cardType === undefined ? {} : { cardType: enumField(effect.cardType, at('cardType'), state, CARD_TYPES) }),
                turns: intField(effect.turns, at('turns'), state, 1, 5),
                then,
            };
        }
        default:
            if (!handler) return;
            return handler.validate(effect, path, state, { ...FIELD_KIT, depth, scope, nested: (item, itemPath, st) => validateEffect(item, itemPath, st, depth + 1, scope ? 'card' : undefined) });
    }
}

// 效果列表的预估总伤害：直伤 amount*hits，嵌套效果递归，依护甲结算的伤害按 999 计（必超上限）。
export function effectsDamage(effects) {
    let total = 0;
    for (const effect of Array.isArray(effects) ? effects : []) {
        if (effect?.op === 'damage') total += effect.amount * (effect.hits || 1);
        else if (effect?.op === 'conditional' || effect?.op === 'each-turn' || effect?.op === 'buff') total += effectsDamage(effect.then);
        else if (effect?.op === 'damage-from-block') total += 999;
        else if (effect?.op === 'mutual-damage') total += effect.amount;
        else if (effect?.op === 'delayed-counter') total += effect.amount * effect.mult;
        else if (effect?.op === 'random-branch') total += Math.max(effectsDamage(effect.a), effectsDamage(effect.b));
        else if (opHandler(effect?.op)?.damage) total += opHandler(effect.op).damage(effect, effectsDamage);
    }
    return total;
}

// 卡牌顶层效果：允许 choose 模式。
const validateTopEffect = (effect, path, state) => validateEffect(effect, path, state, 0, 'top');

// 卡牌。rarities 限定可用稀有度（默认全部）。
function validateCardEntry(card, path, state, rarities = RARITIES) {
    if (!objectField(card, path, state)) return;
    const errorsBefore = state.errors.length;
    const at = (key) => joinPath(path, key);
    checkKnownFields(card, ['id', 'name', 'type', 'cost', 'rarity', 'effects', 'upgraded', 'flavor', 'skillRef', ...CARD_FLAGS, 'onDiscard', 'replay', 'radiance', 'model', 'archetype'], path, state);
    const name = textField(card.name, at('name'), state, 20);
    const unplayable = card.unplayable === true;
    const result = {
        id: idField(card.id, at('id'), state),
        name,
        type: enumField(card.type, at('type'), state, CARD_TYPES),
        cost: enumField(card.cost, at('cost'), state, CARD_COSTS),
        rarity: enumField(card.rarity, at('rarity'), state, rarities),
        effects: arrayField(card.effects, at('effects'), state, unplayable ? 0 : 1, unplayable ? 0 : 4, validateTopEffect),
        flavor: textField(card.flavor, at('flavor'), state, 80, ''),
        skillRef: textField(card.skillRef, at('skillRef'), state, 20, name || ''),
    };
    if (card.archetype !== undefined) result.archetype = enumField(card.archetype, at('archetype'), state, CARD_ARCHETYPES);
    for (const flag of CARD_FLAGS) {
        if (card[flag] === undefined) continue;
        if (typeof card[flag] !== 'boolean') addIssue(state, at(flag), 'expected-boolean');
        else if (card[flag]) result[flag] = true;
    }
    // 规则 v5 关键字 replay：打出时整张额外执行 1–3 次，只付一次费、只计一次出牌；v3/v4 战斗不结算。
    if (card.replay !== undefined) result.replay = intField(card.replay, at('replay'), state, 1, 3);
    // 规则 v6：random 是缺省值，归一后不写字段，旧卡形状不变。
    if (card.model !== undefined && enumField(card.model, at('model'), state, CARD_MODELS) === 'fixed') result.model = 'fixed';
    // 规则 v5 P01 圣辉第二费用：1–5 点，或 'X'（花光圣辉，每点结算一次）；v3/v4 战斗不判定、不扣除。
    if (card.radiance !== undefined) result.radiance = card.radiance === 'X' ? 'X' : intField(card.radiance, at('radiance'), state, 1, 5);
    if (card.onDiscard !== undefined) result.onDiscard = arrayField(card.onDiscard, at('onDiscard'), state, 1, 2, validateEffect);
    if (unplayable) {
        if (card.cost !== 0) addIssue(state, at('cost'), 'unplayable-cost');
        if (card.onDiscard === undefined) addIssue(state, at('onDiscard'), 'unplayable-needs-on-discard');
        if (card.upgraded !== undefined) addIssue(state, at('upgraded'), 'unplayable-upgrade');
    }
    if (card.upgraded !== undefined && !unplayable && objectField(card.upgraded, at('upgraded'), state)) {
        const upPath = at('upgraded');
        checkKnownFields(card.upgraded, ['cost', 'effects'], upPath, state);
        const upgraded = {};
        if (card.upgraded.cost !== undefined) upgraded.cost = enumField(card.upgraded.cost, joinPath(upPath, 'cost'), state, CARD_COSTS);
        if (card.upgraded.effects !== undefined) upgraded.effects = arrayField(card.upgraded.effects, joinPath(upPath, 'effects'), state, 1, 4, validateTopEffect);
        if (card.upgraded.cost === undefined && card.upgraded.effects === undefined) addIssue(state, upPath, 'empty-upgrade');
        result.upgraded = upgraded;
    }
    // 结构都合法时再做数值预算校验。
    if (state.errors.length === errorsBefore) {
        const budget = evaluateCardBudget(result);
        if (!budget.ok) addIssue(state, joinPath(path, budget.path), budget.reason, budget.detail);
    }
    return result;
}

// 技能（敌人/技能角色用）。
function validateSkill(skill, path, state) {
    if (!objectField(skill, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(skill, ['id', 'name', 'intent', 'effects', 'weight', 'cooldown', 'description'], path, state);
    return {
        id: idField(skill.id, at('id'), state),
        name: textField(skill.name, at('name'), state, 20),
        intent: enumField(skill.intent, at('intent'), state, SKILL_INTENTS),
        effects: arrayField(skill.effects, at('effects'), state, 1, 4, validateEffect),
        weight: intField(skill.weight, at('weight'), state, 1, 10, 1),
        cooldown: intField(skill.cooldown, at('cooldown'), state, 0, 5, 0),
        description: textField(skill.description, at('description'), state, 80, ''),
    };
}

// 被动。cardType 只在出牌类触发器下允许。
function validatePassive(passive, path, state) {
    if (!objectField(passive, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(passive, ['id', 'name', 'trigger', 'cardType', 'status', 'orb', 'cause', 'effects', 'description'], path, state);
    const result = {
        id: idField(passive.id, at('id'), state),
        name: textField(passive.name, at('name'), state, 20),
        trigger: enumField(passive.trigger, at('trigger'), state, PASSIVE_TRIGGERS),
        effects: arrayField(passive.effects, at('effects'), state, 1, 3, validateEffect),
        description: textField(passive.description, at('description'), state, 80, ''),
    };
    if (passive.cardType !== undefined) {
        if (result.trigger !== 'card-played' && result.trigger !== 'foe-card-played') addIssue(state, at('cardType'), 'unknown-field');
        else result.cardType = enumField(passive.cardType, at('cardType'), state, CARD_TYPES);
    }
    const allowed = { status: [...STATUSES, ...Object.keys(APPLY_STATUSES)], orb: ORB_FILTER_KINDS, cause: DEFEAT_CAUSES };
    for (const key of Object.keys(FILTER_TRIGGERS)) {
        if (passive[key] === undefined) continue;
        if (!FILTER_TRIGGERS[key].includes(result.trigger)) addIssue(state, at(key), 'unknown-field');
        else result[key] = enumField(passive[key], at(key), state, allowed[key]);
    }
    return result;
}

// 敌人阶段：血量低于阈值时增删技能/被动。
function validatePhase(phase, path, state) {
    if (!objectField(phase, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(phase, ['hpBelowPct', 'addSkills', 'removeSkills', 'passives'], path, state);
    return {
        hpBelowPct: intField(phase.hpBelowPct, at('hpBelowPct'), state, 10, 90),
        addSkills: phase.addSkills === undefined ? [] : arrayField(phase.addSkills, at('addSkills'), state, 0, 3, validateSkill),
        removeSkills: phase.removeSkills === undefined ? [] : arrayField(phase.removeSkills, at('removeSkills'), state, 0, 3, (id, idPath, st) => idField(id, idPath, st)),
        passives: phase.passives === undefined ? [] : arrayField(phase.passives, at('passives'), state, 0, 2, validatePassive),
    };
}

// 别名列表：最多 5 个，去空去重。
function validateAliases(value, path, state) {
    if (value === undefined) return [];
    const list = arrayField(value, path, state, 0, 5, (alias, aliasPath, st) => textField(alias, aliasPath, st, 20));
    return Array.isArray(list) ? [...new Set(list.filter(Boolean))] : [];
}

// 列表内 id 不得重复。
function checkDuplicateIds(list, path, state) {
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item, index) => {
        if (!item?.id) return;
        if (seen.has(item.id)) addIssue(state, `${path}[${index}].id`, 'duplicate-id');
        seen.add(item.id);
    });
}

// 技能列表里每个技能的预估伤害不得超过上限。
function checkDamageCap(skills, path, state, cap) {
    (Array.isArray(skills) ? skills : []).forEach((skill, index) => {
        const damage = effectsDamage(skill?.effects);
        if (damage > cap) addIssue(state, `${path}[${index}].effects`, 'damage-cap', { damage, cap });
    });
}

// 限定稀有度的卡牌校验器工厂。
const cardValidatorFor = (rarities) => (card, path, state) => validateCardEntry(card, path, state, rarities);

// 英雄技能：固定费用与 personal 稀有度做预算校验。
function validateHeroSkill(skill, path, state) {
    if (!objectField(skill, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(skill, ['id', 'name', 'effects', 'description'], path, state);
    const errorsBefore = state.errors.length;
    const result = {
        id: idField(skill.id, at('id'), state),
        name: textField(skill.name, at('name'), state, 20),
        effects: arrayField(skill.effects, at('effects'), state, 1, 4, validateEffect),
        description: textField(skill.description, at('description'), state, 80, ''),
    };
    if (state.errors.length === errorsBefore) {
        const budget = evaluateCardBudget({ cost: COMBAT_RULES.heroSkillCost, rarity: 'personal', effects: result.effects });
        if (!budget.ok) addIssue(state, joinPath(path, budget.path), budget.reason, budget.detail);
    }
    return result;
}

// 特质主动技能：费用取 TRAIT_SKILL_COSTS，稀有度沿用特质的稀有度做预算校验。
function validateTraitSkill(skill, path, state, rarity) {
    if (!objectField(skill, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(skill, ['id', 'name', 'cost', 'effects', 'description'], path, state);
    const errorsBefore = state.errors.length;
    const result = {
        id: idField(skill.id, at('id'), state),
        name: textField(skill.name, at('name'), state, 20),
        cost: enumField(skill.cost, at('cost'), state, TRAIT_SKILL_COSTS),
        effects: arrayField(skill.effects, at('effects'), state, 1, 4, validateEffect),
        description: textField(skill.description, at('description'), state, 80, ''),
    };
    if (state.errors.length === errorsBefore) {
        const budget = evaluateCardBudget({ cost: result.cost, rarity, effects: result.effects });
        if (!budget.ok) addIssue(state, joinPath(path, budget.path), budget.reason, budget.detail);
    }
    return result;
}

// 职业档案。
function validateClassProfile(profile, path, state) {
    checkKnownFields(profile, ['kind', 'v', 'id', 'className', 'archetype', 'classPassive', 'classPassiveVersion', 'classPool'], path, state);
    const result = {
        kind: 'class',
        v: SCHEMA_VERSION,
        id: idField(profile.id, joinPath(path, 'id'), state),
        className: textField(profile.className, joinPath(path, 'className'), state, 12),
        archetype: enumField(profile.archetype, joinPath(path, 'archetype'), state, Object.keys(COMBAT_RULES.archetypes)),
        classPassive: validatePassive(profile.classPassive, joinPath(path, 'classPassive'), state),
        classPool: arrayField(profile.classPool, joinPath(path, 'classPool'), state, 0, 16, cardValidatorFor(LOOT_RARITIES)),
    };
    if (profile.classPassiveVersion !== undefined) result.classPassiveVersion = intField(profile.classPassiveVersion, joinPath(path, 'classPassiveVersion'), state, CLASS_PASSIVE_VERSION, CLASS_PASSIVE_VERSION);
    checkDuplicateIds(result.classPool, joinPath(path, 'classPool'), state);
    return result;
}

// 牌组角色档案（主角/同伴，有卡组）。
function validateDeckCharacter(profile, path, state) {
    const at = (key) => joinPath(path, key);
    checkKnownFields(profile, ['kind', 'v', 'id', 'name', 'aliases', 'classRef', 'base', 'growth', 'personalPassive', 'personalPool', 'starterDeck', 'heroSkill', 'signatureCards'], path, state);
    const base = objectField(profile.base, at('base'), state) || {};
    if (isObject(profile.base)) checkKnownFields(profile.base, ['hp', 'energy', 'draw', 'speed'], at('base'), state);
    const growth = isObject(profile.growth) ? profile.growth : {};
    if (profile.growth !== undefined && objectField(profile.growth, at('growth'), state)) checkKnownFields(profile.growth, ['hpPerLevel'], at('growth'), state);
    const result = {
        kind: 'deck-character',
        v: SCHEMA_VERSION,
        id: idField(profile.id, at('id'), state),
        name: textField(profile.name, at('name'), state, 20),
        aliases: validateAliases(profile.aliases, at('aliases'), state),
        classRef: idField(profile.classRef, at('classRef'), state),
        base: {
            hp: intField(base.hp, at('base.hp'), state, 40, 120),
            energy: intField(base.energy, at('base.energy'), state, 3, 4, COMBAT_RULES.energyPerTurn),
            draw: intField(base.draw, at('base.draw'), state, 4, 6, COMBAT_RULES.drawPerTurn),
            ...speedField(base, path, state),
        },
        growth: { hpPerLevel: intField(growth.hpPerLevel, at('growth.hpPerLevel'), state, 1, 8, 4) },
        personalPassive: validatePassive(profile.personalPassive, at('personalPassive'), state),
        personalPool: arrayField(profile.personalPool, at('personalPool'), state, 4, 8, cardValidatorFor(['personal', ...LOOT_RARITIES])),
        starterDeck: arrayField(profile.starterDeck, at('starterDeck'), state, COMBAT_RULES.starterDeckSize, COMBAT_RULES.starterDeckSize, (id, idPath, st) => idField(id, idPath, st)),
    };
    if (profile.heroSkill !== undefined) result.heroSkill = validateHeroSkill(profile.heroSkill, at('heroSkill'), state);
    if (profile.signatureCards !== undefined) {
        result.signatureCards = arrayField(profile.signatureCards, at('signatureCards'), state, 0, COMBAT_RULES.signatureLimit, cardValidatorFor(['signature']));
        checkDuplicateIds(result.signatureCards, at('signatureCards'), state);
    }
    checkDuplicateIds(result.personalPool, at('personalPool'), state);
    return result;
}

// 技能角色档案（只有技能、没有卡组的同伴）。
function validateSkillCharacter(profile, path, state) {
    const at = (key) => joinPath(path, key);
    checkKnownFields(profile, ['kind', 'v', 'id', 'name', 'aliases', 'className', 'base', 'skills', 'passives', 'tier'], path, state);
    const base = objectField(profile.base, at('base'), state) || {};
    if (isObject(profile.base)) checkKnownFields(profile.base, ['hp', 'speed'], at('base'), state);
    const result = {
        kind: 'skill-character',
        v: SCHEMA_VERSION,
        id: idField(profile.id, at('id'), state),
        name: textField(profile.name, at('name'), state, 20),
        aliases: validateAliases(profile.aliases, at('aliases'), state),
        className: textField(profile.className, at('className'), state, 12, ''),
        base: { hp: intField(base.hp, at('base.hp'), state, 20, 120), ...speedField(base, path, state) },
        skills: arrayField(profile.skills, at('skills'), state, 3, SKILL_COUNT_MAX, validateSkill),
        passives: arrayField(profile.passives, at('passives'), state, 1, 2, validatePassive),
    };
    if (profile.tier !== undefined) result.tier = enumField(profile.tier, at('tier'), state, Object.keys(COMBAT_RULES.allyTiers));
    checkDuplicateIds(result.skills, at('skills'), state);
    checkDamageCap(result.skills, at('skills'), state, ALLY_SKILL_CAP_MAX);
    return result;
}

// 敌人档案。血量范围随阶级定（阶级基础血量的 0.5 到 1.5 倍），首领必须有阶段。
function validateEnemyProfile(profile, path, state) {
    const at = (key) => joinPath(path, key);
    checkKnownFields(profile, ['kind', 'v', 'id', 'name', 'tier', 'art', 'base', 'skills', 'passives', 'phases', 'generated'], path, state);
    const base = objectField(profile.base, at('base'), state) || {};
    if (isObject(profile.base)) checkKnownFields(profile.base, ['hp', 'speed'], at('base'), state);
    const tier = enumField(profile.tier, at('tier'), state, Object.keys(COMBAT_RULES.tiers));
    const tierRule = COMBAT_RULES.tiers[tier];
    const hpMax = tierRule ? Math.round(tierRule.hp * 1.5) : 999;
    const hpMin = tierRule ? Math.round(tierRule.hp * 0.5) : 1;
    const result = {
        kind: 'enemy',
        v: SCHEMA_VERSION,
        id: idField(profile.id, at('id'), state),
        name: textField(profile.name, at('name'), state, 20),
        tier,
        ...(profile.art === undefined ? {} : { art: enumField(profile.art, at('art'), state, ENEMY_ART_KEYS) }),
        base: { hp: intField(base.hp, at('base.hp'), state, hpMin, hpMax), ...speedField(base, path, state) },
        skills: arrayField(profile.skills, at('skills'), state, 2, SKILL_COUNT_MAX, validateSkill),
        passives: profile.passives === undefined ? [] : arrayField(profile.passives, at('passives'), state, 0, 2, validatePassive),
        phases: profile.phases === undefined ? [] : arrayField(profile.phases, at('phases'), state, 0, 2, validatePhase),
        generated: profile.generated !== false,
    };
    checkDuplicateIds(result.skills, at('skills'), state);
    if (tierRule) {
        checkDamageCap(result.skills, at('skills'), state, tierRule.damageCap);
        (result.phases || []).forEach((phase, index) => checkDamageCap(phase?.addSkills, at(`phases[${index}].addSkills`), state, tierRule.damageCap));
    }
    if (tier === 'boss' && !(result.phases || []).length) addIssue(state, at('phases'), 'boss-needs-phase');
    return result;
}

// 档案总入口：按 kind 分派；v 缺省视为当前版本。
function validateProfile(profile, path, state) {
    if (!objectField(profile, path, state)) return;
    if (profile.v !== undefined && profile.v !== SCHEMA_VERSION) return addIssue(state, joinPath(path, 'v'), 'unsupported-version', { supported: SCHEMA_VERSION });
    const kind = enumField(profile.kind, joinPath(path, 'kind'), state, PROFILE_KINDS);
    if (kind === 'class') return validateClassProfile(profile, path, state);
    if (kind === 'deck-character') return validateDeckCharacter(profile, path, state);
    if (kind === 'skill-character') return validateSkillCharacter(profile, path, state);
    if (kind === 'enemy') return validateEnemyProfile(profile, path, state);
}

export const normalizeProfile = (input) => runValidator(validateProfile, input);
export const normalizeCard = (input) => runValidator((card, path, state) => validateCardEntry(card, path, state), input);
export const normalizeSkill = (input) => runValidator(validateSkill, input);
// 被动单独规范化（补默认字段）：遗物被动比对时让程序还原值与账本值走同一套归一。
export const normalizePassive = (input) => runValidator(validatePassive, input);

// 卡牌目录：基础牌 + 职业牌池 + 个人牌池（后者覆盖同 id 的前者）。
// 规则 v6：起始卡组里的固定卡 ID 从固定卡表补进目录（只补尚未出现的 ID）；v3–v5 起始卡组不含固定卡 ID，目录不变。
export function buildCardCatalog(deckCharacter, classProfile) {
    const catalog = new Map(Object.entries(BASIC_CARDS));
    for (const card of classProfile?.classPool || []) catalog.set(card.id, card);
    for (const card of deckCharacter?.personalPool || []) catalog.set(card.id, card);
    for (const id of deckCharacter?.starterDeck || []) {
        if (!catalog.has(id) && isFixedCardId(id)) catalog.set(id, fixedCard(id));
    }
    return catalog;
}

// 规则 v6 起始卡组形状：本职业固定卡（普通、罕见）的份数为 starterDeckShapeV6 攻击 / 技能 / 第三种合起来的份数，
// 攻击、技能各至少有形状要求的种类数；个人牌份数同形状；不含基础牌与其他来源的牌。
function starterShapeV6Errors(starterDeck, fixedIds, personalIds) {
    const shape = COMBAT_RULES.starterDeckShapeV6;
    const fixedCopies = new Map();
    const personalCopies = new Map();
    let other = 0;
    for (const id of starterDeck) {
        if (fixedIds.has(id)) fixedCopies.set(id, (fixedCopies.get(id) || 0) + 1);
        else if (personalIds.has(id)) personalCopies.set(id, (personalCopies.get(id) || 0) + 1);
        else other += 1;
    }
    const kinds = { attack: 0, skill: 0 };
    const errors = [];
    for (const id of fixedCopies.keys()) {
        const card = fixedCard(id);
        if (Object.hasOwn(kinds, card.type)) kinds[card.type] += 1;
        if (card.rarity !== 'common' && card.rarity !== 'uncommon') errors.push({ path: 'starterDeck', reason: 'starter-rarity', cardId: id });
    }
    const copies = (list) => [...list].sort((a, b) => b - a).join('/');
    const check = (slot, expected, actual) => {
        if (expected !== actual) errors.push({ path: 'starterDeck', reason: 'starter-shape', detail: { slot, expected, actual } });
    };
    check('fixedCopies', copies([...shape.attack, ...shape.skill, ...shape.third]), copies(fixedCopies.values()));
    check('personalCopies', copies(shape.personal), copies(personalCopies.values()));
    if (kinds.attack < shape.attack.length) check('attackKinds', shape.attack.length, kinds.attack);
    if (kinds.skill < shape.skill.length) check('skillKinds', shape.skill.length, kinds.skill);
    check('other', 0, other);
    return errors;
}

// 校验起始卡组：职业匹配、牌池 id 无冲突、卡组结构符合起始形状、重复张数不超过稀有度限制。
// 含本职业固定卡 ID 的起始卡组按规则 v6 形状校验；v3–v5 档案不含固定卡 ID，照旧按 starterDeckShape。
export function validateStarterDeck(deckCharacter, classProfile) {
    const errors = [];
    if (!classProfile || classProfile.kind !== 'class') return { ok: false, errors: [{ path: 'classRef', reason: 'class-missing' }] };
    if (deckCharacter.classRef !== classProfile.id) errors.push({ path: 'classRef', reason: 'class-mismatch' });
    const classIds = new Set(classProfile.classPool.map((card) => card.id));
    const personalIds = new Set(deckCharacter.personalPool.map((card) => card.id));
    const signatureIds = new Set((deckCharacter.signatureCards || []).map((card) => card.id));
    for (const id of personalIds) if (classIds.has(id) || BASIC_CARDS[id]) errors.push({ path: 'personalPool', reason: 'id-collision', cardId: id });
    for (const id of signatureIds) if (classIds.has(id) || personalIds.has(id) || BASIC_CARDS[id]) errors.push({ path: 'signatureCards', reason: 'id-collision', cardId: id });
    const fixedIds = new Set(fixedClassPool(classProfile.archetype).map((card) => card.id));
    const v6 = deckCharacter.starterDeck.some((id) => fixedIds.has(id));
    const shape = { basicAttack: 0, basicDefend: 0, classCards: 0, personalCards: 0 };
    const counts = new Map();
    deckCharacter.starterDeck.forEach((id, index) => {
        counts.set(id, (counts.get(id) || 0) + 1);
        if (id === BASIC_STRIKE_ID) shape.basicAttack += 1;
        else if (id === BASIC_DEFEND_ID) shape.basicDefend += 1;
        else if (classIds.has(id)) shape.classCards += 1;
        else if (personalIds.has(id)) shape.personalCards += 1;
        else if (signatureIds.has(id)) errors.push({ path: `starterDeck[${index}]`, reason: 'signature-in-starter', cardId: id });
        else if (!(v6 && fixedIds.has(id))) errors.push({ path: `starterDeck[${index}]`, reason: 'unknown-card', cardId: id });
    });
    if (v6) errors.push(...starterShapeV6Errors(deckCharacter.starterDeck, fixedIds, personalIds));
    else {
        for (const [slot, expected] of Object.entries(COMBAT_RULES.starterDeckShape)) {
            if (shape[slot] !== expected) errors.push({ path: 'starterDeck', reason: 'starter-shape', detail: { slot, expected, actual: shape[slot] } });
        }
    }
    const catalog = buildCardCatalog(deckCharacter, classProfile);
    for (const [id, count] of counts) {
        const limit = cardCopyLimit(catalog.get(id)?.rarity);
        if (count > limit) errors.push({ path: 'starterDeck', reason: 'copy-limit', cardId: id, detail: { count, limit } });
    }
    return { ok: errors.length === 0, errors };
}

// 账本锚点：指向某楼某次滑动里的某个标签。required 时缺失报错，否则 null/undefined 视为无锚点。
function validateAnchor(anchor, path, state, required) {
    if (anchor == null) return required ? addIssue(state, path, 'anchor-required') : null;
    if (!objectField(anchor, path, state)) return;
    checkKnownFields(anchor, ['messageId', 'swipeId', 'tagHash', 'occurrence'], path, state);
    return {
        messageId: intField(anchor.messageId, joinPath(path, 'messageId'), state, 0, 1e7),
        swipeId: intField(anchor.swipeId, joinPath(path, 'swipeId'), state, 0, 1e4, 0),
        tagHash: idField(anchor.tagHash, joinPath(path, 'tagHash'), state),
        occurrence: intField(anchor.occurrence, joinPath(path, 'occurrence'), state, 0, 1e4, 0),
    };
}

// 装备属性加成：属性 + 1..5 点。
function validateGearBonus(bonus, path, state) {
    if (!objectField(bonus, path, state)) return;
    checkKnownFields(bonus, ['ability', 'amount'], path, state);
    return { ability: enumField(bonus.ability, joinPath(path, 'ability'), state, ABILITY_KEYS), amount: intField(bonus.amount, joinPath(path, 'amount'), state, 1, 5) };
}

// 规则 v6 遗物引用（G5f）：宝物与人物特性来自遗物表时记条目 ID 与模型，效果由 relics/draw.js 的 resolveRelic 按此还原。
function validateRelicRef(relic, path, state) {
    if (!objectField(relic, path, state)) return;
    checkKnownFields(relic, ['relicId', 'model'], path, state);
    const relicId = idField(relic.relicId, joinPath(path, 'relicId'), state);
    if (typeof relicId === 'string' && !relicById(relicId)) addIssue(state, joinPath(path, 'relicId'), 'relic-unknown');
    return { relicId, model: enumField(relic.model, joinPath(path, 'model'), state, RELIC_MODELS) };
}
// 遗物引用指向战斗外模型（规则 v6 G5f-4）：这类遗物特性只记引用，不带战斗被动。
function offCombatRelic(ref) {
    if (!ref || !RELIC_MODELS.includes(ref.model)) return false;
    const model = relicById(ref.relicId)?.[ref.model];
    return Boolean(model) && !isCombatModel(model);
}

// 装备。有稀有度而无被动时，被动视为缺省（不报错）。
function validateGear(gear, path, state) {
    if (!objectField(gear, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(gear, ['gearId', 'name', 'slot', 'passive', 'description', 'rarity', 'bonus', 'link', 'relic'], path, state);
    const rarity = gear.rarity === undefined ? undefined : enumField(gear.rarity, at('rarity'), state, LOOT_RARITIES);
    const passive = gear.passive === undefined && (gear.rarity !== undefined || gear.relic !== undefined) ? undefined : validatePassive(gear.passive, at('passive'), state);
    return {
        gearId: idField(gear.gearId, at('gearId'), state),
        name: textField(gear.name, at('name'), state, 20),
        slot: enumField(gear.slot, at('slot'), state, GEAR_SLOTS),
        ...(passive === undefined ? {} : { passive }),
        description: textField(gear.description, at('description'), state, 80, ''),
        ...(rarity === undefined ? {} : { rarity }),
        ...(gear.bonus === undefined ? {} : { bonus: validateGearBonus(gear.bonus, at('bonus'), state) }),
        ...(gear.link === undefined ? {} : { link: enumField(gear.link, at('link'), state, TRAIT_LINKS) }),
        ...(gear.relic === undefined ? {} : { relic: validateRelicRef(gear.relic, at('relic'), state) }),
    };
}

// 消耗品。
function validateItem(item, path, state) {
    if (!objectField(item, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(item, ['itemId', 'name', 'count', 'effects', 'description'], path, state);
    return {
        itemId: idField(item.itemId, at('itemId'), state),
        name: textField(item.name, at('name'), state, 20),
        count: intField(item.count, at('count'), state, 1, ITEM_GAIN_MAX),
        effects: arrayField(item.effects, at('effects'), state, 1, 3, validateEffect),
        description: textField(item.description, at('description'), state, 80, ''),
    };
}

// 战利品槽位里除公共字段外允许的载荷字段。
// 卡牌槽的 choices（规则 v6）：REWARD_CARD_CHOICES 张候选（固定卡与随机卡 2:1），card 为其中的随机卡；旧槽位不带。
// 杂物槽的 junk（规则 v6 G3d 弱敌战）：劣等杂物，卖价按 1/4；只在为真时写。
const REWARD_PAYLOAD_FIELDS = Object.freeze({ card: ['card', 'choices', 'marks', 'upgradeNoDamage'], gear: ['gear'], item: ['item'], keepsake: ['junk'], inscribe: ['inscription', 'cardId', 'copyId', 'cardName'] });

// 战利品槽位（offer / loot 用）。
function validateRewardSlot(slot, path, state) {
    if (!objectField(slot, path, state)) return;
    const at = (key) => joinPath(path, key);
    const kind = enumField(slot.kind, at('kind'), state, REWARD_KINDS);
    if (kind === undefined) return;
    checkKnownFields(slot, ['index', 'kind', 'rarity', 'name', 'origin', ...REWARD_PAYLOAD_FIELDS[kind]], path, state);
    const result = {
        index: intField(slot.index, at('index'), state, 0, REWARD_SLOT_MAX - 1),
        kind,
        rarity: enumField(slot.rarity, at('rarity'), state, LOOT_RARITIES),
    };
    result.name = textField(slot.name, at('name'), state, 20);
    result.origin = textField(slot.origin, at('origin'), state, REWARD_ORIGIN_MAX, '');
    if (kind === 'card') {
        result.card = validateCardEntry(slot.card, at('card'), state, LOOT_RARITIES);
        if (result.card?.rarity && result.rarity && result.card.rarity !== result.rarity) addIssue(state, at('card.rarity'), 'rarity-mismatch');
        if (slot.choices !== undefined) {
            result.choices = arrayField(slot.choices, at('choices'), state, REWARD_CARD_CHOICES, REWARD_CARD_CHOICES_MAX, (card, cardPath, st) => validateCardEntry(card, cardPath, st, LOOT_RARITIES));
            if (Array.isArray(result.choices)) {
                checkDuplicateIds(result.choices, at('choices'), state);
                if (result.card && !result.choices.some((card) => card?.id === result.card.id)) addIssue(state, at('choices'), 'choice-card-missing');
            }
        }
        const cards = result.choices || [result.card];
        if (slot.upgradeNoDamage !== undefined) {
            if (slot.upgradeNoDamage !== true) addIssue(state, at('upgradeNoDamage'), 'expected-true');
            else result.upgradeNoDamage = true;
        }
        if (slot.marks !== undefined) result.marks = arrayField(slot.marks, at('marks'), state, cards.length, cards.length, (mark, markPath, st) => {
            if (!objectField(mark, markPath, st)) return;
            checkKnownFields(mark, ['upgraded', 'inscription'], markPath, st);
            const card = cards[Number(markPath.match(/\[(\d+)\]$/)?.[1])];
            const value = {};
            if (mark.upgraded !== undefined) {
                if (mark.upgraded !== true || !rewardUpgradable(card)) addIssue(st, `${markPath}.upgraded`, 'invalid-value');
                else value.upgraded = true;
            }
            if (mark.inscription !== undefined) {
                value.inscription = enumField(mark.inscription, `${markPath}.inscription`, st, INSCRIPTION_KEYS);
                if (!inscribable(card, value.inscription) || !inscribable(card?.upgraded ? { ...card, ...card.upgraded } : card, value.inscription)) addIssue(st, `${markPath}.inscription`, 'inscription-inapplicable');
            }
            return value;
        });
    } else if (kind === 'gear') {
        result.gear = validateGear(slot.gear, at('gear'), state);
    } else if (kind === 'item') {
        result.item = validateItem(slot.item, at('item'), state);
    } else if (kind === 'keepsake' && slot.junk !== undefined) {
        if (slot.junk !== true) addIssue(state, at('junk'), 'expected-true');
        else result.junk = true;
    } else if (kind === 'inscribe') {
        result.inscription = enumField(slot.inscription, at('inscription'), state, INSCRIPTION_KEYS);
        result.cardId = idField(slot.cardId, at('cardId'), state);
        result.copyId = idField(slot.copyId, at('copyId'), state, LEDGER_ID_PATTERN);
        result.cardName = textField(slot.cardName, at('cardName'), state, 40);
    }
    return result;
}

// 账本条目的载荷：按 type 分派。未知 type 返回 undefined。
function addedFlag(payload, path, state, eligible = true) {
    if (payload.added === undefined) return {};
    if (payload.added !== true || !eligible) addIssue(state, joinPath(path, 'added'), 'invalid-value');
    return { added: payload.added };
}


function validateLedgerPayload(type, payload, path, state) {
    if (!objectField(payload, path, state)) return;
    const at = (key) => joinPath(path, key);
    switch (type) {
        case 'profile':
            return validateProfile(payload, path, state);
        case 'exp':
            checkKnownFields(payload, ['amount', 'reason', 'added'], path, state);
            return { amount: intField(payload.amount, at('amount'), state, 1, 1e3), reason: textField(payload.reason, at('reason'), state, 80, ''), ...addedFlag(payload, path, state) };
        case 'learn':
        case 'upgrade': {
            checkKnownFields(payload, type === 'learn' ? ['card', 'skill', 'merge', 'added'] : ['targetId', 'card', 'skill'], path, state);
            const result = {};
            if (type === 'upgrade') result.targetId = idField(payload.targetId, at('targetId'), state);
            if (payload.card !== undefined && payload.skill !== undefined) addIssue(state, path, 'card-or-skill');
            if (payload.card !== undefined) result.card = validateCardEntry(payload.card, at('card'), state);
            else if (payload.skill !== undefined) result.skill = validateSkill(payload.skill, at('skill'), state);
            else if (type === 'learn') addIssue(state, path, 'card-or-skill');
            // 规则 v5 P5a 同模型并卡标记：只有新写入的学牌记录带。
            if (type === 'learn' && payload.merge !== undefined) {
                if (typeof payload.merge !== 'boolean') addIssue(state, at('merge'), 'expected-boolean');
                else if (payload.merge) result.merge = true;
            }
            return { ...result, ...(type === 'learn' ? addedFlag(payload, path, state, !!payload.card) : {}) };
        }
        case 'class':
            checkKnownFields(payload, ['classRef'], path, state);
            return { classRef: idField(payload.classRef, at('classRef'), state) };
        case 'respec':
            checkKnownFields(payload, ['classRef', 'cost'], path, state);
            return { classRef: idField(payload.classRef, at('classRef'), state), cost: intField(payload.cost, at('cost'), state, 0, 1e5) };
        case 'ascend': {
            checkKnownFields(payload, ['classRef', 'tier', 'tierName', 'cards', 'cost'], path, state);
            const cards = arrayField(payload.cards, at('cards'), state, 3, 3, cardValidatorFor(LOOT_RARITIES));
            if (Array.isArray(cards)) checkDuplicateIds(cards, at('cards'), state);
            return {
                classRef: idField(payload.classRef, at('classRef'), state),
                tier: intField(payload.tier, at('tier'), state, 2, 3),
                tierName: textField(payload.tierName, at('tierName'), state, 12),
                cards,
                cost: intField(payload.cost, at('cost'), state, 0, 1e5),
            };
        }
        case 'reward': {
            checkKnownFields(payload, ['level', 'choice', 'added'], path, state);
            const choice = objectField(payload.choice, at('choice'), state) || {};
            const choiceKind = enumField(choice.kind, at('choice.kind'), state, ['card', 'upgrade', 'skip']);
            const result = { level: intField(payload.level, at('level'), state, 2, COMBAT_RULES.maxLevel), choice: { kind: choiceKind } };
            if (choiceKind === 'card' || choiceKind === 'upgrade') {
                const refKey = choiceKind === 'card' ? 'cardId' : 'targetId';
                checkKnownFields(choice, choiceKind === 'upgrade' ? ['kind', refKey, 'copyId'] : ['kind', refKey], at('choice'), state);
                result.choice[refKey] = idField(choice[refKey], at(`choice.${refKey}`), state);
                // 规则 v5 P5a：升级可指定副本；旧记录不带时按 cardId 记升级张数。
                if (choiceKind === 'upgrade' && choice.copyId !== undefined) result.choice.copyId = idField(choice.copyId, at('choice.copyId'), state, LEDGER_ID_PATTERN);
            } else if (choiceKind === 'skip') {
                checkKnownFields(choice, ['kind'], at('choice'), state);
            }
            return { ...result, ...addedFlag(payload, path, state, choiceKind === 'card') };
        }
        case 'rebuild': {
            checkKnownFields(payload, ['personalPool', 'starterDeck', 'cost'], path, state);
            const pool = arrayField(payload.personalPool, at('personalPool'), state, 4, 8, cardValidatorFor(['personal', ...LOOT_RARITIES]));
            if (Array.isArray(pool)) checkDuplicateIds(pool, at('personalPool'), state);
            return {
                personalPool: pool,
                starterDeck: arrayField(payload.starterDeck, at('starterDeck'), state, COMBAT_RULES.starterDeckSize, COMBAT_RULES.starterDeckSize, (id, idPath, st) => idField(id, idPath, st)),
                cost: intField(payload.cost, at('cost'), state, 0, 1e5),
            };
        }
        case 'deck': {
            checkKnownFields(payload, ['cards', 'copies', 'revision'], path, state);
            const result = {
                cards: arrayField(payload.cards, at('cards'), state, COMBAT_RULES.deckMin, COMBAT_RULES.deckSanityMax, (id, idPath, st) => idField(id, idPath, st)),
                revision: intField(payload.revision, at('revision'), state, 0, 1e9),
            };
            // 规则 v5 P5a：可选的副本 ID 列表，与 cards 逐张对应。
            if (payload.copies !== undefined) {
                result.copies = arrayField(payload.copies, at('copies'), state, 0, COMBAT_RULES.deckSanityMax, (id, idPath, st) => idField(id, idPath, st, LEDGER_ID_PATTERN));
                if (Array.isArray(result.cards) && Array.isArray(result.copies) && result.copies.length !== result.cards.length) addIssue(state, at('copies'), 'length-mismatch');
            }
            return result;
        }
        case 'revoke':
            checkKnownFields(payload, ['targetEntryId', 'reason'], path, state);
            return { targetEntryId: idField(payload.targetEntryId, at('targetEntryId'), state, LEDGER_ID_PATTERN), reason: textField(payload.reason, at('reason'), state, 80, '') };
        case 'equip': {
            // 规则 v6：宝物部位最多 TREASURE_SLOT_MAX 件，可选 slotIndex 指定替换第几格（只对宝物有效）。
            if (!payload || typeof payload !== 'object' || payload.slotIndex === undefined) return validateGear(payload, path, state);
            const { slotIndex, ...gear } = payload;
            const result = validateGear(gear, path, state);
            const index = intField(slotIndex, at('slotIndex'), state, 0, TREASURE_SLOT_MAX - 1);
            if (gear.slot !== 'treasure') addIssue(state, at('slotIndex'), 'slot-index-not-treasure');
            return result ? { ...result, slotIndex: index } : result;
        }
        case 'unequip':
            checkKnownFields(payload, ['gearId'], path, state);
            return { gearId: idField(payload.gearId, at('gearId'), state) };
        case 'item':
            return validateItem(payload, path, state);
        case 'keepsake':
            checkKnownFields(payload, ['itemId', 'name', 'origin', 'rarity'], path, state);
            return {
                itemId: idField(payload.itemId, at('itemId'), state),
                name: textField(payload.name, at('name'), state, 20),
                origin: textField(payload.origin, at('origin'), state, 80, ''),
                ...(payload.rarity === undefined ? {} : { rarity: enumField(payload.rarity, at('rarity'), state, LOOT_RARITIES) }),
            };
        case 'lose':
            checkKnownFields(payload, ['name', 'count', 'all', 'reason'], path, state);
            if (payload.all !== undefined && payload.all !== true) addIssue(state, at('all'), 'invalid-value');
            return {
                name: textField(payload.name, at('name'), state, 20),
                ...(payload.all === true ? { all: true } : { count: intField(payload.count, at('count'), state, 1, ITEM_CONSUME_MAX) }),
                reason: textField(payload.reason, at('reason'), state, 80, ''),
            };
        case 'consume':
            checkKnownFields(payload, ['itemId', 'count', 'reportId'], path, state);
            return {
                itemId: idField(payload.itemId, at('itemId'), state),
                count: intField(payload.count, at('count'), state, 1, ITEM_CONSUME_MAX),
                reportId: textField(payload.reportId, at('reportId'), state, 40, ''),
            };
        case 'offer': {
            checkKnownFields(payload, ['combatId', 'randomKey', 'tier', 'exp', 'reveal', 'slots', 'reserve', 'flipRelics', 'traitBias', 'traitFlip', 'traitHeld', 'weak', 'afterPanel'], path, state);
            // 槽位数组：长度 3 或 4，每项的 index 必须等于其下标。
            const slotList = (key) => {
                const list = arrayField(payload[key], at(key), state, REWARD_SLOT_COUNT, REWARD_SLOT_MAX, validateRewardSlot);
                if (Array.isArray(list)) {
                    list.forEach((slot, index) => {
                        if (slot && slot.index !== index) addIssue(state, `${at(key)}[${index}].index`, 'slot-index-mismatch');
                    });
                }
                return list;
            };
            const slots = slotList('slots');
            const reserve = payload.reserve === undefined ? undefined : slotList('reserve');
            if (Array.isArray(slots) && Array.isArray(reserve) && reserve.length !== slots.length) addIssue(state, at('reserve'), 'reserve-length-mismatch');
            const flipRelics = payload.flipRelics === undefined ? undefined : arrayField(payload.flipRelics, at('flipRelics'), state, 1, TRAIT_SLOT_MAX, validateRelicRef);
            if (flipRelics) {
                const seen = new Set();
                for (const ref of flipRelics) {
                    if (!ref) continue;
                    const key = `${ref.relicId}:${ref.model}`;
                    if (seen.has(key) || relicById(ref.relicId)?.[ref.model]?.kind !== 'flip') addIssue(state, at('flipRelics'), 'invalid-flip-relic');
                    seen.add(key);
                }
            }
            if (payload.weak !== undefined && payload.weak !== true) addIssue(state, at('weak'), 'expected-true');
            // 特质来源（B/C 类）：只记生效来源，供界面标注与账本累计；弱小战不带翻牌类来源。
            let traitBias;
            if (payload.traitBias !== undefined) {
                if (!objectField(payload.traitBias, at('traitBias'), state)) traitBias = undefined;
                else {
                    checkKnownFields(payload.traitBias, ['trait', 'category'], at('traitBias'), state);
                    const { trait, category } = payload.traitBias;
                    if (biasCategoryOf(trait) !== category || !BIAS_CATEGORIES.includes(category)) addIssue(state, at('traitBias'), 'invalid-trait-bias');
                    else traitBias = { trait, category };
                }
            }
            const traitHeld = payload.traitHeld === undefined ? undefined : arrayField(payload.traitHeld, at('traitHeld'), state, 1, TRAIT_FLIPS.length, (name, namePath, st) => {
                if (!TRAIT_FLIPS.some((spec) => spec.counter === true && spec.trait === name)) return addIssue(st, namePath, 'invalid-trait-held');
                return name;
            });
            let traitFlip;
            if (payload.traitFlip !== undefined) {
                if (!objectField(payload.traitFlip, at('traitFlip'), state)) traitFlip = undefined;
                else {
                    checkKnownFields(payload.traitFlip, ['trait', 'effect', 'noDamage'], at('traitFlip'), state);
                    const issue = traitFlipIssue(payload.traitFlip, { held: traitHeld, tier: payload.tier, weak: payload.weak === true });
                    if (issue) addIssue(state, at('traitFlip'), issue);
                    else {
                        const { trait, effect, noDamage } = payload.traitFlip;
                        traitFlip = { trait, effect, ...(noDamage === true ? { noDamage: true } : {}) };
                    }
                }
            }
            return {
                combatId: textField(payload.combatId, at('combatId'), state, 120),
                ...(payload.randomKey === undefined ? {} : { randomKey: textField(payload.randomKey, at('randomKey'), state, 120) }),
                tier: enumField(payload.tier, at('tier'), state, Object.keys(COMBAT_RULES.tiers)),
                exp: intField(payload.exp, at('exp'), state, 0, 1e3),
                reveal: intField(payload.reveal, at('reveal'), state, 0, 2, 0),
                slots,
                ...(reserve === undefined ? {} : { reserve }),
                ...(flipRelics === undefined ? {} : { flipRelics }),
                ...(traitBias ? { traitBias } : {}),
                ...(traitFlip ? { traitFlip } : {}),
                ...(traitHeld === undefined ? {} : { traitHeld }),
                ...(payload.weak === true ? { weak: true } : {}),
                ...(payload.afterPanel === undefined ? {} : { afterPanel: intField(payload.afterPanel, at('afterPanel'), state, 0, Number.MAX_SAFE_INTEGER) }),
            };
        }
        case 'loot':
            checkKnownFields(payload, ['combatId', 'reportId', 'set', 'slot', 'cost', 'merge', 'pick', 'added'], path, state);
            if (payload.merge !== undefined && typeof payload.merge !== 'boolean') addIssue(state, at('merge'), 'expected-boolean');
            // 规则 v6：带 choices 的卡牌槽须写 pick（候选序号或 skip）；旧记录不带。
            if (payload.pick !== undefined && payload.pick !== 'skip' && !(Number.isInteger(payload.pick) && payload.pick >= 0 && payload.pick < (payload.slot?.choices?.length || REWARD_CARD_CHOICES))) addIssue(state, at('pick'), 'invalid-pick');
            return {
                combatId: textField(payload.combatId, at('combatId'), state, 120),
                reportId: textField(payload.reportId, at('reportId'), state, 40),
                set: enumField(payload.set, at('set'), state, ['main', 'reserve']),
                slot: validateRewardSlot(payload.slot, at('slot'), state),
                cost: intField(payload.cost, at('cost'), state, 0, 1e5, 0),
                ...(payload.merge === true ? { merge: true } : {}),
                ...(payload.pick !== undefined ? { pick: payload.pick } : {}),
                ...addedFlag(payload, path, state, payload.slot?.kind === 'card' && payload.pick !== 'skip'),
            };
        case 'sell': {
            checkKnownFields(payload, ['lootId', 'gearId', 'itemId', 'rarity', 'junk', 'count'], path, state);
            // lootId / gearId / itemId 必须恰好有一个。
            if (['lootId', 'gearId', 'itemId'].filter((key) => key in payload).length !== 1) return addIssue(state, path, 'sell-target-invalid');
            const rarity = payload.rarity === undefined ? {} : { rarity: enumField(payload.rarity, at('rarity'), state, LOOT_RARITIES) };
            const count = payload.count === undefined ? {} : { count: intField(payload.count, at('count'), state, 1, 'lootId' in payload ? 1 : Number.MAX_SAFE_INTEGER) };
            if (payload.junk !== undefined && !('itemId' in payload)) addIssue(state, at('junk'), 'sell-junk-target-invalid');
            if ('gearId' in payload) return { gearId: idField(payload.gearId, at('gearId'), state), ...rarity, ...count };
            // 规则 v6 G3d：主角背包里劣等杂物的卖出带 junk（卖价按 1/4）；只在为真时写。
            if (payload.junk !== undefined && payload.junk !== true) addIssue(state, at('junk'), 'expected-true');
            if ('itemId' in payload) return { itemId: idField(payload.itemId, at('itemId'), state), ...rarity, ...count, ...(payload.junk === true ? { junk: true } : {}) };
            return { lootId: idField(payload.lootId, at('lootId'), state, LEDGER_ID_PATTERN), ...rarity, ...count };
        }
        case 'trait': {
            checkKnownFields(payload, ['traitId', 'name', 'origin', 'rarity', 'kind', 'passive', 'skill', 'link', 'relic', 'pickup', 'added', 'cost'], path, state);
            const traitKind = payload.kind === undefined ? 'passive' : enumField(payload.kind, at('kind'), state, TRAIT_KINDS);
            const result = {
                traitId: idField(payload.traitId, at('traitId'), state),
                name: textField(payload.name, at('name'), state, 20),
                origin: textField(payload.origin, at('origin'), state, REWARD_ORIGIN_MAX, ''),
                rarity: enumField(payload.rarity, at('rarity'), state, TRAIT_RARITIES),
            };
            if (traitKind === 'active') {
                if (payload.passive !== undefined) addIssue(state, at('passive'), 'unknown-field');
                Object.assign(result, { kind: traitKind, skill: validateTraitSkill(payload.skill, at('skill'), state, result.rarity) });
            } else {
                if (payload.skill !== undefined) addIssue(state, at('skill'), 'unknown-field');
                if (offCombatRelic(payload.relic)) {
                    if (payload.passive !== undefined) addIssue(state, at('passive'), 'unknown-field');
                    Object.assign(result, payload.kind === undefined ? {} : { kind: traitKind });
                } else Object.assign(result, payload.kind === undefined ? {} : { kind: traitKind }, { passive: validatePassive(payload.passive, at('passive'), state) });
            }
            if (payload.pickup !== undefined && (payload.pickup !== true || traitKind !== 'passive' || relicById(payload.relic?.relicId)?.[payload.relic?.model]?.kind !== 'pickup')) {
                addIssue(state, at('pickup'), 'invalid-value');
            }
            return {
                ...result, ...(payload.link === undefined ? {} : { link: enumField(payload.link, at('link'), state, TRAIT_LINKS) }),
                ...(payload.pickup === undefined ? {} : { pickup: payload.pickup }),
                ...addedFlag(payload, path, state, payload.pickup === true && relicById(payload.relic?.relicId)?.[payload.relic?.model]?.copy > 0),
                ...(payload.relic === undefined ? {} : { relic: validateRelicRef(payload.relic, at('relic'), state) }), cost: intField(payload.cost, at('cost'), state, 0, 1e5),
            };
        }
        case 'trait-pick':
            checkKnownFields(payload, ['traitId', 'drop'], path, state);
            return { traitId: idField(payload.traitId, at('traitId'), state), drop: idField(payload.drop, at('drop'), state) };
        case 'trait-slot':
            checkKnownFields(payload, ['slot', 'cost'], path, state);
            return { slot: intField(payload.slot, at('slot'), state, TRAIT_BASE_SLOTS + 1, TRAIT_SLOT_MAX), cost: intField(payload.cost, at('cost'), state, 0, 1e5) };
        // 规则 v6 删卡：删去卡组里的一张副本；battle 为获得这次机会时的普通战斗胜场数，reportId 为写下删卡标签的那场战报。
        // 规则 v6 积分抽卡：card-draw 付费抽出 REWARD_CARD_CHOICES 张本职业候选（背面朝上待翻），card-flip 翻开其中一张（每抽只能翻一次），
        // card-pick 把翻开的那张加入卡组（pick 为翻开的位置）或 skip 放弃（翻前翻后都可，不退款）。
        case 'card-draw': {
            checkKnownFields(payload, ['drawId', 'choices', 'cost', 'free'], path, state);
            const choices = arrayField(payload.choices, at('choices'), state, CARD_DRAW_CHOICES, CARD_DRAW_CHOICES, (card, cardPath, st) => validateCardEntry(card, cardPath, st, LOOT_RARITIES));
            if (Array.isArray(choices)) checkDuplicateIds(choices, at('choices'), state);
            const cost = intField(payload.cost, at('cost'), state, 0, 1e5);
            let free;
            if (payload.free !== undefined) {
                const freePath = at('free');
                checkKnownFields(payload.free, ['level'], freePath, state);
                free = { level: intField(payload.free?.level, joinPath(freePath, 'level'), state, 2, COMBAT_RULES.maxLevel) };
                if (cost !== 0) addIssue(state, at('cost'), 'free-cost-not-zero');
            }
            return { drawId: idField(payload.drawId, at('drawId'), state), choices, cost, ...(free ? { free } : {}) };
        }
        case 'card-flip': {
            checkKnownFields(payload, ['drawId', 'position'], path, state);
            return { drawId: idField(payload.drawId, at('drawId'), state), position: intField(payload.position, at('position'), state, 0, CARD_DRAW_CHOICES - 1) };
        }
        case 'card-pick': {
            checkKnownFields(payload, ['drawId', 'pick', 'added'], path, state);
            const pick = payload.pick === 'skip' ? 'skip' : intField(payload.pick, at('pick'), state, 0, CARD_DRAW_CHOICES - 1);
            return { drawId: idField(payload.drawId, at('drawId'), state), pick, ...addedFlag(payload, path, state, pick !== 'skip') };
        }
        case 'card-upgrade': {
            checkKnownFields(payload, ['copyId', 'cardId', 'battle', 'reportId', 'level'], path, state);
            const free = payload.level !== undefined;
            if (free && (payload.battle !== undefined || payload.reportId !== undefined)) addIssue(state, path, 'upgrade-source-conflict');
            return {
                copyId: idField(payload.copyId, at('copyId'), state, LEDGER_ID_PATTERN),
                cardId: idField(payload.cardId, at('cardId'), state),
                ...(free ? { level: intField(payload.level, at('level'), state, 2, COMBAT_RULES.maxLevel) } : {
                    battle: intField(payload.battle, at('battle'), state, 1, 1e6),
                    reportId: textField(payload.reportId, at('reportId'), state, 40),
                }),
            };
        }
        case 'purge':
            checkKnownFields(payload, ['copyId', 'cost', 'battle', 'reportId', 'costVersion'], path, state);
            return {
                copyId: idField(payload.copyId, at('copyId'), state, LEDGER_ID_PATTERN), cost: intField(payload.cost, at('cost'), state, 0, 1e5), battle: intField(payload.battle, at('battle'), state, 1, 1e6),
                reportId: textField(payload.reportId, at('reportId'), state, 40),
                ...(payload.costVersion === undefined ? {} : { costVersion: intField(payload.costVersion, at('costVersion'), state, 1, 1) }),
            };
        // 规则 v6 G5g 战斗胜利积分：锚定胜利战报楼，amount 由程序按档位与战斗 ID 定额（10–30）。
        // G5f-4c：bonus 为写入时持有的加金币遗物特性快照（relics），points / hpMax 必须等于按引用与定额重算的值。
        case 'battle-points': {
            checkKnownFields(payload, ['amount', 'tier', 'combatId', 'reportId', 'weak', 'bonus'], path, state);
            const tier = enumField(payload.tier, at('tier'), state, BATTLE_POINT_TIERS);
            // 规则 v6 G3d：weak 为弱敌战，金额为定额的 1/4，不带加成；只在为真时写。
            if (payload.weak !== undefined && payload.weak !== true) addIssue(state, at('weak'), 'expected-true');
            const weak = payload.weak === true;
            const range = BATTLE_POINTS_RANGE[tier] || [BATTLE_POINTS_RANGE.normal[0], BATTLE_POINTS_RANGE.boss[1]];
            const amount = intField(payload.amount, at('amount'), state, weak ? 0 : range[0], range[1]);
            const combatId = textField(payload.combatId, at('combatId'), state, 120);
            // 金额必须等于按档位与战斗 ID 重算的定额，账本重放可独立复核。
            if (BATTLE_POINTS_RANGE[tier] && typeof combatId === 'string' && amount !== (weak ? weakBattlePoints : battlePoints)(tier, combatId)) addIssue(state, at('amount'), 'battle-points-mismatch');
            const value = { amount, tier, combatId, reportId: textField(payload.reportId, at('reportId'), state, 40), ...(weak ? { weak: true } : {}) };
            if (payload.bonus === undefined) return value;
            if (weak) addIssue(state, at('bonus'), 'battle-points-weak-bonus');
            const bonusPath = at('bonus');
            if (!objectField(payload.bonus, bonusPath, state)) return value;
            checkKnownFields(payload.bonus, ['points', 'hpMax', 'relics'], bonusPath, state);
            const sub = (key) => joinPath(bonusPath, key);
            const points = intField(payload.bonus.points, sub('points'), state, 0, 1e4);
            const hpMax = intField(payload.bonus.hpMax, sub('hpMax'), state, 0, 100);
            const relics = arrayField(payload.bonus.relics, sub('relics'), state, 1, TRAIT_SLOT_MAX, (item, itemPath, st) => {
                if (!objectField(item, itemPath, st)) return;
                checkKnownFields(item, ['relicId', 'model'], itemPath, st);
                return { relicId: textField(item.relicId, joinPath(itemPath, 'relicId'), st, 40), model: enumField(item.model, joinPath(itemPath, 'model'), st, RELIC_MODELS) };
            });
            const expected = Array.isArray(relics) && Number.isInteger(amount) ? winPointsBonus(relics, amount) : null;
            const distinct = Array.isArray(relics) && new Set(relics.map((ref) => `${ref?.relicId}|${ref?.model}`)).size === relics.length;
            if (!expected || !distinct || expected.relics.length !== relics.length || expected.points !== points || expected.hpMax !== hpMax) addIssue(state, bonusPath, 'battle-points-bonus-mismatch');
            return { ...value, bonus: { points, hpMax, relics } };
        }
        case 'wound': {
            checkKnownFields(payload, ['hp', 'maxHp', 'down', 'reportId'], path, state);
            const maxHp = intField(payload.maxHp, at('maxHp'), state, 1, 9999);
            const hp = intField(payload.hp, at('hp'), state, 0, 9999);
            if (Number.isInteger(hp) && Number.isInteger(maxHp) && hp > maxHp) addIssue(state, at('hp'), 'out-of-range', { min: 0, max: maxHp });
            if (typeof payload.down !== 'boolean') addIssue(state, at('down'), 'expected-boolean');
            return { hp, maxHp, down: payload.down === true, reportId: textField(payload.reportId, at('reportId'), state, 40) };
        }
        case 'battle-growth': {
            checkKnownFields(payload, ['cards', 'hpMax', 'reportId'], path, state);
            const cards = arrayField(payload.cards ?? [], at('cards'), state, 0, BATTLE_GROWTH_CARDS_MAX, (item, itemPath, st) => {
                if (!objectField(item, itemPath, st)) return;
                checkKnownFields(item, ['cardId', 'copyId', 'damage', 'block'], itemPath, st);
                const sub = (key) => joinPath(itemPath, key);
                // 规则 v5 P5a：copyId 可选，带时成长只记在那一张副本上。
                const copy = item.copyId !== undefined ? { copyId: idField(item.copyId, sub('copyId'), st, LEDGER_ID_PATTERN) } : {};
                return { cardId: idField(item.cardId, sub('cardId'), st), ...copy, damage: intField(item.damage, sub('damage'), st, 0, BATTLE_GROWTH_MAX, 0), block: intField(item.block, sub('block'), st, 0, BATTLE_GROWTH_MAX, 0) };
            });
            const hpMax = intField(payload.hpMax, at('hpMax'), state, 0, BATTLE_GROWTH_MAX, 0);
            if (Array.isArray(cards) && !cards.length && hpMax === 0) addIssue(state, path, 'empty-growth');
            return { cards, hpMax, reportId: textField(payload.reportId, at('reportId'), state, 40) };
        }
        // 规则 v5 P5b 刻印：给一张副本刻一个刻印。copyId 可选，不带时重放按卡组顺序取第一张可刻的同名副本。
        case 'inscribe': {
            checkKnownFields(payload, ['cardId', 'copyId', 'inscription', 'reason'], path, state);
            return {
                cardId: idField(payload.cardId, at('cardId'), state),
                ...(payload.copyId === undefined ? {} : { copyId: idField(payload.copyId, at('copyId'), state, LEDGER_ID_PATTERN) }),
                inscription: enumField(payload.inscription, at('inscription'), state, INSCRIPTION_KEYS),
                reason: textField(payload.reason, at('reason'), state, 80, ''),
            };
        }
        // 规则 v6 G5f-4d 御印：选定一张卡组副本完成遗物挂起的刻印；relicId / model 指向挂起它的遗物特性，重放核对挂起项、副本与刻印。
        case 'relic-inscribe': {
            checkKnownFields(payload, ['relicId', 'model', 'copyId', 'cardId', 'inscription'], path, state);
            const relicId = idField(payload.relicId, at('relicId'), state);
            if (typeof relicId === 'string' && !relicById(relicId)) addIssue(state, at('relicId'), 'relic-unknown');
            return {
                relicId,
                model: enumField(payload.model, at('model'), state, RELIC_MODELS),
                copyId: idField(payload.copyId, at('copyId'), state, LEDGER_ID_PATTERN),
                cardId: idField(payload.cardId, at('cardId'), state),
                inscription: enumField(payload.inscription, at('inscription'), state, INSCRIPTION_KEYS),
            };
        }
        case 'heal': {
            checkKnownFields(payload, ['amount', 'mode', 'scale', 'reason'], path, state);
            const mode = enumField(payload.mode, at('mode'), state, HEAL_MODES);
            return {
                amount: intField(payload.amount, at('amount'), state, 1, mode === 'percent' ? 100 : 9999),
                mode,
                scale: intField(payload.scale, at('scale'), state, 1, 100),
                reason: textField(payload.reason, at('reason'), state, 80, ''),
            };
        }
        case 'hurt':
            checkKnownFields(payload, ['tier', 'pct', 'maxHp'], path, state);
            return {
                tier: enumField(payload.tier, at('tier'), state, HURT_TIER_KEYS),
                pct: intField(payload.pct, at('pct'), state, 1, 100),
                maxHp: intField(payload.maxHp, at('maxHp'), state, 1, 9999),
            };
        default:
            return;
    }
}

// 这两类账本条目不需要锚点。
const ANCHORLESS_TYPES = new Set(['profile', 'revoke']);

function validateLedgerEntry(entry, path, state) {
    if (!objectField(entry, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(entry, ['id', 'type', 'character', 'anchor', 'payload', 'createdAt'], path, state);
    const type = enumField(entry.type, at('type'), state, LEDGER_TYPES);
    const result = {
        id: idField(entry.id, at('id'), state, LEDGER_ID_PATTERN),
        type,
        character: idField(entry.character, at('character'), state),
        anchor: validateAnchor(entry.anchor, at('anchor'), state, type !== undefined && !ANCHORLESS_TYPES.has(type)),
        payload: type === undefined ? undefined : validateLedgerPayload(type, entry.payload, at('payload'), state),
        createdAt: intField(entry.createdAt, at('createdAt'), state, 0, Number.MAX_SAFE_INTEGER),
    };
    if (type === 'profile' && result.payload?.id && result.payload.id !== result.character) addIssue(state, at('character'), 'profile-id-mismatch');
    return result;
}

export const normalizeLedgerEntry = (input) => runValidator(validateLedgerEntry, input);

// 属性记录里可加点的属性：六维 + 自由点。
const ATTRIBUTE_ABILITIES = Object.freeze([...ABILITY_KEYS, 'free']);

// 属性记录载荷：按 type 分派。
function validateAttributePayload(type, payload, path, state) {
    if (!objectField(payload, path, state)) return;
    const at = (key) => joinPath(path, key);
    switch (type) {
        case 'init': {
            checkKnownFields(payload, ['className', 'role', 'major', 'minor', 'weak', 'scores'], path, state);
            const result = {
                className: textField(payload.className, at('className'), state, 12, ''),
                role: enumField(payload.role, at('role'), state, Object.keys(COMBAT_RULES.archetypes)),
                major: enumField(payload.major, at('major'), state, ABILITY_KEYS),
                minor: enumField(payload.minor, at('minor'), state, ABILITY_KEYS),
                weak: enumField(payload.weak, at('weak'), state, ABILITY_KEYS),
            };
            if (new Set([result.major, result.minor, result.weak]).size !== 3) addIssue(state, path, 'prefs-duplicate');
            if (Object.hasOwn(payload, 'scores')) {
                const scores = normalizeManualScores(payload.scores);
                if (!scores) {
                    addIssue(state, at('scores'), 'invalid-scores');
                } else {
                    const prefs = prefsFromScores(scores);
                    if (prefs.major !== result.major || prefs.minor !== result.minor || prefs.weak !== result.weak) addIssue(state, at('scores'), 'prefs-mismatch');
                    result.scores = scores;
                }
            }
            return result;
        }
        case 'rel':
            checkKnownFields(payload, ['tier', 'anchorLevel', 'offset'], path, state);
            return {
                tier: enumField(payload.tier, at('tier'), state, Object.keys(REL_TIERS)),
                anchorLevel: intField(payload.anchorLevel, at('anchorLevel'), state, 1, COMBAT_RULES.maxLevel),
                offset: intField(payload.offset, at('offset'), state, -12, 12),
            };
        case 'story':
            checkKnownFields(payload, ['ability', 'amount', 'reason'], path, state);
            return {
                ability: enumField(payload.ability, at('ability'), state, ATTRIBUTE_ABILITIES),
                amount: intField(payload.amount, at('amount'), state, 1, 2),
                reason: textField(payload.reason, at('reason'), state, 80, ''),
            };
        case 'alloc':
            // 批量分配（picks）或单点分配。
            if (Object.hasOwn(payload, 'picks')) {
                checkKnownFields(payload, ['picks'], path, state);
                if (!Array.isArray(payload.picks) || !payload.picks.length || payload.picks.length > ABILITY_KEYS.length) {
                    addIssue(state, at('picks'), 'invalid-picks');
                    return;
                }
                const picks = payload.picks.map((pick, index) => {
                    const pickPath = `${at('picks')}[${index}]`;
                    if (!objectField(pick, pickPath, state)) return {};
                    checkKnownFields(pick, ['ability', 'amount'], pickPath, state);
                    return { ability: enumField(pick.ability, joinPath(pickPath, 'ability'), state, ABILITY_KEYS), amount: intField(pick.amount, joinPath(pickPath, 'amount'), state, 1, 19) };
                });
                if (new Set(picks.map((pick) => pick.ability)).size !== picks.length) addIssue(state, at('picks'), 'duplicate-ability');
                return { picks };
            }
            checkKnownFields(payload, ['ability', 'amount'], path, state);
            return { ability: enumField(payload.ability, at('ability'), state, ABILITY_KEYS), amount: intField(payload.amount, at('amount'), state, 1, 2) };
        case 'reward':
            checkKnownFields(payload, ['ability', 'amount', 'reportId'], path, state);
            return {
                ability: enumField(payload.ability, at('ability'), state, ATTRIBUTE_ABILITIES),
                amount: intField(payload.amount, at('amount'), state, 1, 4),
                reportId: textField(payload.reportId, at('reportId'), state, 40, ''),
            };
        default:
            return;
    }
}

function validateAttributeRecord(record, path, state) {
    if (!objectField(record, path, state)) return;
    const at = (key) => joinPath(path, key);
    checkKnownFields(record, ['id', 'type', 'character', 'anchor', 'payload', 'createdAt', 'change'], path, state);
    const type = enumField(record.type, at('type'), state, ATTRIBUTE_TYPES);
    return {
        id: idField(record.id, at('id'), state, LEDGER_ID_PATTERN),
        type,
        character: idField(record.character, at('character'), state),
        anchor: validateAnchor(record.anchor, at('anchor'), state, type !== undefined && type !== 'init'),
        payload: type === undefined ? undefined : validateAttributePayload(type, record.payload, at('payload'), state),
        createdAt: intField(record.createdAt, at('createdAt'), state, 0, Number.MAX_SAFE_INTEGER),
        change: textField(record.change, at('change'), state, 40, ''),
    };
}

export const normalizeAttributeRecord = (input) => runValidator(validateAttributeRecord, input);

// 账本条目 id：有锚点时拼接楼层/滑动/标签哈希/序号，否则只用前两段。
export function ledgerEntryId(character, type, anchor) {
    return anchor ? [character, type, anchor.messageId, anchor.swipeId, anchor.tagHash, anchor.occurrence].join('|') : `${character}|${type}`;
}

// 档案 id：类型前缀 + 名称哈希。
export function profileIdFor(kind, name) {
    const prefix = { class: 'cls', 'deck-character': 'pc', 'skill-character': 'sc', enemy: 'en' }[kind] || 'x';
    return `${prefix}-${hashString(String(name || '').trim().toLowerCase())}`;
}

// 装备/物品 id 的名称归一：NFKC、去空白、小写。
const normalizeIdName = (name) => String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
export const gearIdFor = (name) => `gr-${hashString(normalizeIdName(name))}`;
export const itemIdFor = (name) => `it-${hashString(normalizeIdName(name))}`;
