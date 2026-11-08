// 战斗规则常量与纯函数：能量/抽牌/等级曲线、难度与敌人缩放、卡牌价值估算与预算校验。
// 所有常量深冻结，整局共享，只读。数值与文案原样来自 v0.39.0，不要顺手调平衡。
import { hash32 } from './random.js';
import { opHandler } from './mechanics/registry.js';
// 规则 v5 机制登记入口：导入即登记，保证估值前机制已就位。
import './mechanics/index.js';

// 难度档：affixes 是 普通/精英/首领 各自的词缀数，其余字段缺省时取「无影响」的值。
function difficultyTier({ label, hp, damage, affixes: [normal, elite, boss], curse = 0, maxHpPct = 1, extraSkills = 0, enrageAt = 50, loot = 0, healScale = 1 }) {
    return Object.freeze({ label, hp, damage, affixes: Object.freeze({ normal, elite, boss }), curse, maxHpPct, extraSkills, enrageAt, loot, healScale });
}

// 递归冻结，返回原对象。
function deepFreeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

export const COMBAT_RULES = Object.freeze({
    version: 6,
    energyPerTurn: 3,
    drawPerTurn: 5,
    handLimit: 10,
    // 规则 v6：卡组即全部持有的副本，不设张数上限；删卡后不少于 deckMin 张（D-05）。
    deckMin: 10,
    // 账本 deck 记录与卡组视图的长度护栏（防异常数据），不是玩法上限。
    deckSanityMax: 200,
    copyLimit: 3,
    tempCardsPerTurn: 10,
    starterDeckSize: 20,
    // v3–v5 档案的起始卡组形状（只用于校验旧档案与固定池缺失时的兜底）。
    starterDeckShape: Object.freeze({ basicAttack: 3, basicDefend: 3, classCards: 10, personalCards: 4 }),
    // 规则 v6 起始卡组：每类先选种类，数组为各种类的副本数（攻击 3/3/2、技能 3/3/2、能力或第三种 ×2、个人牌 ×2，合计 starterDeckSize）。
    starterDeckShapeV6: Object.freeze({ attack: Object.freeze([3, 3, 2]), skill: Object.freeze([3, 3, 2]), third: Object.freeze([2]), personal: Object.freeze([2]) }),
    storyExpCapPerFloor: 50,
    maxLevel: 20,
    maxEnemies: 50,
    // 场上敌人总位置（含爪牙）；显式 v6 的普通敌人另限 3 名，旧版本与未标版本的 setup 保留旧上限。
    maxEnemiesOnField: 5,
    maxFoesOnField: 3,
    maxAllies: 3,
    defaultSpeed: 100,
    speedJitter: 5,
    tiers: Object.freeze({
        normal: Object.freeze({ label: '普通', hp: 40, damageCap: 12, exp: 20, speed: 100, hpScale: 1.3, damageScale: 2.7, difficultyGain: 1 }),
        elite: Object.freeze({ label: '精英', hp: 80, damageCap: 18, exp: 45, speed: 104, hpScale: 1.15, damageScale: 1.75, difficultyGain: 0.5 }),
        boss: Object.freeze({ label: '首领', hp: 160, damageCap: 26, exp: 100, speed: 92, hpScale: 0.68, damageScale: 1, difficultyGain: 0.5 }),
    }),
    tierScalePerLevel: 0.05,
    levelGap: Object.freeze({ hp: 0.02, damage: 0.04 }),
    // 规则 v6 多敌折算：按开战前普通胜场取档，仅新建 setup 使用；旧战斗的单位数值不重算。
    crowd: Object.freeze([
        Object.freeze({ wins: 0, scale: 0.65 }),
        Object.freeze({ wins: 10, scale: 0.75 }),
        Object.freeze({ wins: 15, scale: 0.85 }),
        Object.freeze({ wins: 20, scale: 1 }),
    ]),
    // 生成敌人档位校准：副 LLM 生成的敌人（generated 不为 false）生命与伤害再 × 该值，模板敌人不变；首领按 scripts/combat-balance.mjs --generated 校准。
    generatedScale: Object.freeze({ boss: 0.9 }),
    difficulty: Object.freeze({
        easy: difficultyTier({ label: '轻松', hp: 0.8, damage: 0.8, affixes: [0, 0, 1] }),
        normal: difficultyTier({ label: '标准', hp: 1, damage: 1, affixes: [0, 1, 2] }),
        hard: difficultyTier({ label: '困难', hp: 1.2, damage: 1.15, affixes: [0, 1, 2], loot: 0.15 }),
        brutal: difficultyTier({ label: '严酷', hp: 1.35, damage: 1.25, affixes: [1, 1, 2], curse: 1, maxHpPct: 0.9, loot: 0.25 }),
        nightmare: difficultyTier({ label: '噩梦', hp: 1.5, damage: 1.35, affixes: [1, 2, 3], curse: 1, maxHpPct: 0.9, extraSkills: 1, enrageAt: 65, loot: 0.35, healScale: 0.5 }),
    }),
    archetypes: Object.freeze({
        warrior: Object.freeze({ label: '战士', hp: Object.freeze([70, 90]), speed: 100 }),
        guardian: Object.freeze({ label: '守护', hp: Object.freeze([80, 100]), speed: 88 }),
        ranger: Object.freeze({ label: '游侠', hp: Object.freeze([60, 75]), speed: 112 }),
        assassin: Object.freeze({ label: '刺客', hp: Object.freeze([55, 70]), speed: 120 }),
        mage: Object.freeze({ label: '法师', hp: Object.freeze([50, 65]), speed: 96 }),
        priest: Object.freeze({ label: '祈司', hp: Object.freeze([55, 70]), speed: 98 }),
        summoner: Object.freeze({ label: '召唤', hp: Object.freeze([55, 70]), speed: 94 }),
        bard: Object.freeze({ label: '乐师', hp: Object.freeze([55, 70]), speed: 106 }),
    }),
    // 单张牌的价值预算，按费用分档（X 费按 7）。
    costBudget: Object.freeze({ 0: 4, 1: 8, 2: 14, 3: 20, X: 7 }),
    // 各稀有度允许的价值区间（相对预算的倍数）与目标倍数。
    rarityWindows: Object.freeze({
        basic: Object.freeze({ min: 0.85, max: 1.15, target: 1 }),
        common: Object.freeze({ min: 0.85, max: 1.15, target: 1 }),
        uncommon: Object.freeze({ min: 0.8, max: 1.25, target: 1.1 }),
        rare: Object.freeze({ min: 0.7, max: 1.4, target: 1.2 }),
        epic: Object.freeze({ min: 0.9, max: 1.5, target: 1.3 }),
        mythic: Object.freeze({ min: 1.2, max: 1.65, target: 1.45 }),
        personal: Object.freeze({ min: 0.7, max: 1.35, target: 1.15 }),
        signature: Object.freeze({ min: 1.2, max: 1.6, target: 1.4 }),
    }),
    upgradeAllowance: 1.3,
    signatureLimit: 2,
    signatureCopyLimit: 1,
    // 专属卡按等级解锁（v0.39.2）：第 i 张在 signatureUnlockLevels[i] 级解锁，等级退回时重新锁上。
    signatureUnlockLevels: Object.freeze([5, 10]),
    allyTiers: Object.freeze({
        support: Object.freeze({ label: '陪衬', hp: 0.8, skill: 0.85, ultimateCooldown: 0 }),
        peer: Object.freeze({ label: '并肩', hp: 1, skill: 1, ultimateCooldown: 0 }),
        ace: Object.freeze({ label: '大腿', hp: 1.4, skill: 1.3, ultimateCooldown: 3 }),
        legend: Object.freeze({ label: '传说', hp: 1.8, skill: 1.5, ultimateCooldown: 2 }),
    }),
    defaultAllyTier: 'peer',
    allySkillDamageCap: 18,
    heroSkillCost: 2,
    // 觉醒类型对应的即时效果。
    awakenEffects: deepFreeze({
        rage: [{ op: 'status', status: 'strength', stacks: 3, target: 'self' }, { op: 'energy', amount: 1 }],
        guard: [{ op: 'block', amount: 10, target: 'all-allies' }, { op: 'status', status: 'dexterity', stacks: 2, target: 'self' }],
        grief: [{ op: 'status', status: 'strength', stacks: 2, target: 'self' }, { op: 'status', status: 'dexterity', stacks: 2, target: 'self' }, { op: 'heal-pct', pct: 15, target: 'self' }],
        resolve: [{ op: 'hand-cost', amount: -1 }, { op: 'draw', amount: 2 }],
        bond: [{ op: 'heal-pct', pct: 10, target: 'all-allies' }, { op: 'status', status: 'strength', stacks: 2, target: 'other-allies' }],
        limit: [{ op: 'energy', amount: 3 }, { op: 'draw', amount: 1 }, { op: 'next-turn', gain: 'status', status: 'weak', stacks: 2 }],
        vengeance: [{ op: 'status', status: 'vulnerable', stacks: 3, target: 'all-enemies' }, { op: 'status', status: 'strength', stacks: 2, target: 'self' }],
        unyielding: [{ op: 'status', status: 'endure', stacks: 1, target: 'self' }],
    }),
    awakenLineMax: 30,
    endureBlock: 8,
});

export const BASIC_CARDS = deepFreeze({
    'basic-strike': { id: 'basic-strike', name: '攻击', type: 'attack', cost: 1, rarity: 'basic', effects: [{ op: 'damage', amount: 6, target: 'enemy' }], upgraded: { effects: [{ op: 'damage', amount: 8, target: 'enemy' }] }, skillRef: '攻击' },
    'basic-defend': { id: 'basic-defend', name: '防御', type: 'skill', cost: 1, rarity: 'basic', effects: [{ op: 'block', amount: 5, target: 'self' }], upgraded: { effects: [{ op: 'block', amount: 7, target: 'self' }] }, skillRef: '防御' },
});
export const BASIC_STRIKE_ID = 'basic-strike';
export const BASIC_DEFEND_ID = 'basic-defend';

// 旧存档的规则版本 3–6 可以互相兼容；v5 新机制在 state.rulesVersion >= 5 时启用，v6 的战斗结算与 v5 相同（v6 改的是卡组与奖励）。
export const COMPATIBLE_RULES_VERSIONS = Object.freeze([3, 4, 5, 6]);
export const isCompatibleRulesVersion = (version) => COMPATIBLE_RULES_VERSIONS.includes(version);

// 战斗中生成的临时牌与状态牌。
export const TOKEN_CARDS = deepFreeze({
    'token-shard': { id: 'token-shard', name: '碎刃', type: 'attack', cost: 0, rarity: 'basic', effects: [{ op: 'damage', amount: 4, hits: 1, target: 'enemy' }, { op: 'exhaust-self' }], skillRef: '碎刃' },
    'token-ward': { id: 'token-ward', name: '护符', type: 'skill', cost: 0, rarity: 'basic', effects: [{ op: 'block', amount: 4, target: 'self' }, { op: 'exhaust-self' }], skillRef: '护符' },
    'token-spark': { id: 'token-spark', name: '灵光', type: 'skill', cost: 0, rarity: 'basic', effects: [{ op: 'draw', amount: 1 }, { op: 'exhaust-self' }], skillRef: '灵光' },
    'status-daze': { id: 'status-daze', name: '眩晕', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, ethereal: true, skillRef: '眩晕' },
    'status-wound': { id: 'status-wound', name: '伤口', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, skillRef: '伤口' },
    // 规则 v5 G23 状态牌（结算在 mechanics/status-cards.js，只在 v5 战斗中生效；黏浊可打出，付 1 费后消耗）。
    'status-burn': { id: 'status-burn', name: '灼痕', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, skillRef: '灼痕' },
    'status-slime': { id: 'status-slime', name: '黏浊', type: 'skill', cost: 1, rarity: 'basic', effects: [{ op: 'exhaust-self' }], skillRef: '黏浊' },
    'status-void': { id: 'status-void', name: '空洞', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, ethereal: true, skillRef: '空洞' },
    'status-pain': { id: 'status-pain', name: '痛楚', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, skillRef: '痛楚' },
    // 规则 v6 乐师固定卡的衍生牌（只新增键；只由 v6 固定卡的 create 生成）。
    'token-rebuke': { id: 'token-rebuke', name: '罚音', type: 'attack', cost: 0, rarity: 'basic', retain: true, effects: [{ op: 'damage', amount: 5, hits: 1, target: 'enemy' }, { op: 'exhaust-self' }], skillRef: '罚音' },
    'token-grace': { id: 'token-grace', name: '天籁', type: 'skill', cost: 0, rarity: 'basic', retain: true, effects: [{ op: 'energy', amount: 1 }, { op: 'exhaust-self' }], skillRef: '天籁' },
    'token-miracle': { id: 'token-miracle', name: '奇迹', type: 'skill', cost: 0, rarity: 'basic', retain: true, effects: [{ op: 'energy', amount: 1 }, { op: 'exhaust-self' }], skillRef: '奇迹' },
    'token-epiphany': { id: 'token-epiphany', name: '悟弦', type: 'skill', cost: 0, rarity: 'basic', retain: true, effects: [{ op: 'draw', amount: 2 }, { op: 'exhaust-self' }], skillRef: '悟弦' },
    'token-shelter': { id: 'token-shelter', name: '护调', type: 'skill', cost: 1, rarity: 'basic', retain: true, effects: [{ op: 'block', amount: 6, target: 'self' }, { op: 'exhaust-self' }], skillRef: '护调' },
    'token-sever': { id: 'token-sever', name: '断弦', type: 'attack', cost: 1, rarity: 'basic', effects: [{ op: 'damage', amount: 3, hits: 3, target: 'enemy' }, { op: 'exhaust-self' }], skillRef: '断弦' },
    'token-pierce': { id: 'token-pierce', name: '穿云', type: 'attack', cost: 1, rarity: 'basic', retain: true, effects: [{ op: 'damage', amount: 9, hits: 1, target: 'enemy' }, { op: 'exhaust-self' }], skillRef: '穿云' },
    'token-finale': { id: 'token-finale', name: '终曲', type: 'attack', cost: 1, rarity: 'basic', effects: [{ op: 'damage', amount: 8, hits: 1, target: 'all-enemies' }, { op: 'exhaust-self' }], skillRef: '终曲' },
});
export const TOKEN_KEYS = Object.freeze(Object.keys(TOKEN_CARDS));

export const CURSE_CARD = deepFreeze({ id: 'curse-dread', name: '厄咒', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, skillRef: '厄咒' });

// 效果价值估算用的单位价值表。
const STATUS_VALUE = Object.freeze({ vulnerable: 1.75, weak: 1.75, strength: 5, dexterity: 5, poison: 1.2, regen: 1.5, thorns: 1.5, intangible: 7, 'no-draw': -3, endure: 6, artifact: 6, frail: 1.5 });
const DOUBLE_VALUE = Object.freeze({ poison: 6, block: 7, strength: 9 });
const BUFF_TRIGGER_VALUE = Object.freeze({ 'card-played': 2.5, discard: 1, exhaust: 1, kill: 0.5, 'hp-loss': 1, 'block-gain': 1.5, 'turn-start': 1, 'turn-end': 1 });
const AREA_TARGETS = new Set(['all-enemies', 'all-allies']);
const BUDGET_EPSILON = 1e-9;
const round2 = (value) => Math.round(value * 100) / 100;

function targetFactor(target) {
    return AREA_TARGETS.has(target) ? 1.4 : target === 'random-enemy' ? 0.85 : 1;
}

// 单个效果的价值。
function effectValue(effect) {
    if (!effect) return 0;
    const factor = targetFactor(effect.target);
    switch (effect.op) {
        case 'damage':
            return (effect.amount * (4 / 3) + ((effect.strengthScale || 1) - 1) * 2) * (effect.hits || 1) * factor;
        case 'block':
            return effect.amount * 1.6 * factor;
        case 'heal':
            return effect.amount * 2 * factor;
        case 'draw':
            return effect.amount * 4;
        case 'energy':
            return effect.amount * 6;
        case 'status':
            return effect.stacks * (STATUS_VALUE[effect.status] || 0) * factor;
        case 'exhaust-self':
            return -2;
        case 'conditional':
            return 0.6 * sumEffects(effect.then);
        case 'damage-from-block':
            return 8 * factor;
        case 'self-damage':
            return -effect.amount * 1.5;
        case 'double':
            return (DOUBLE_VALUE[effect.stat] || 0) * factor;
        case 'next-turn':
            return (effect.amount || 0) * (effect.gain === 'energy' ? 5 : effect.gain === 'draw' ? 3.5 : 0);
        case 'each-turn':
            return 2.5 * sumEffects(effect.then);
        case 'hand-cost':
            return -effect.amount * 5;
        case 'cleanse':
            return 4 * factor;
        case 'discard':
            return -effect.amount * (effect.mode === 'choose' ? 1.5 : 2.5);
        case 'discard-hand':
            return effect.redraw ? 6 : -6;
        case 'copy':
            return effect.amount * (effect.from === 'self' ? 4 : 6);
        case 'create':
            return TOKEN_CARDS[effect.card]?.unplayable ? -3 * effect.amount : effect.amount * 0.8 * sumEffects(TOKEN_CARDS[effect.card]?.effects);
        case 'repeat-last':
            return 7 * effect.amount;
        case 'replay-next':
            return (effect.cardType ? 6 : 8) * effect.amount;
        case 'grow':
            return effect.amount * 2;
        case 'cost-mod':
            return -effect.amount * (effect.mode === 'random' ? 3 : effect.mode === 'self' ? 2.5 : 5) * (effect.scope === 'combat' ? 1.5 : 1);
        case 'delayed-counter':
            return effect.amount * (4 / 3) * effect.mult * 0.8 - effect.amount;
        case 'mutual-damage':
            return effect.amount * (4 / 3) - (effect.selfAmount ?? effect.amount) * 0.5;
        case 'random-branch':
            return 0.5 * (sumEffects(effect.a) + sumEffects(effect.b));
        case 'buff':
            return effect.turns * (BUFF_TRIGGER_VALUE[effect.trigger] || 1) * (effect.cardType ? 0.5 : 1) * sumEffects(effect.then);
        default:
            // 已登记机制的算子按其自身估值，未登记的仍为 0。
            return opHandler(effect.op)?.value?.(effect, sumEffects) ?? 0;
    }
}

function sumEffects(effects) {
    return (Array.isArray(effects) ? effects : []).reduce((total, effect) => total + effectValue(effect), 0);
}

// 一组效果的总价值（保留两位小数）。
export function estimateEffectsValue(effects) {
    return round2(sumEffects(effects));
}

// 牌自身的附加价值：固有 +2，消散且没有自带耗尽 -2，弃牌触发效果按可打出与否折算；
// 规则 v5 关键字：重演按效果价值 × 次数 × 0.85 计入，狡黠 +1.5；
// 圣辉第二费用每点 -3（与获得 1 点圣辉的估值相抵），X 圣辉按平均投入 2 点计：效果再计 1 倍、减 6。
function cardTraitValue(card, effects) {
    let value = 0;
    if (card.innate) value += 2;
    if (card.ethereal && !(effects || []).some((effect) => effect?.op === 'exhaust-self')) value -= 2;
    if (card.onDiscard) value += sumEffects(card.onDiscard) * (card.unplayable ? 1 : 0.5);
    if (Number.isInteger(card.replay) && card.replay > 0) value += sumEffects(effects) * card.replay * 0.85;
    if (card.sly) value += 1.5;
    if (card.radiance === 'X') value += sumEffects(effects) - 6;
    else if (Number.isInteger(card.radiance) && card.radiance > 0) value -= card.radiance * 3;
    return value;
}

const cardValueOf = (card, effects) => round2(sumEffects(effects) + cardTraitValue(card, effects));
export const estimateCardValue = (card) => cardValueOf(card || {}, card?.effects);

const hasCostBudget = (cost) => Object.hasOwn(COMBAT_RULES.costBudget, cost);
const hasRarity = (rarity) => typeof rarity === 'string' && Object.hasOwn(COMBAT_RULES.rarityWindows, rarity);

// 某费用+稀有度下的价值窗口；参数无效返回 null。
export function rarityWindow(cost, rarity) {
    if (!hasCostBudget(cost) || !hasRarity(rarity)) return null;
    const budget = COMBAT_RULES.costBudget[cost];
    const window = COMBAT_RULES.rarityWindows[rarity];
    return { budget, min: round2(budget * window.min), max: round2(budget * window.max), target: round2(budget * window.target) };
}

// 卡牌预算校验：本体必须落在窗口内，升级后不得超过放宽上限且要比本体更优。
export function evaluateCardBudget(card) {
    if (!hasCostBudget(card?.cost)) return { ok: false, reason: 'invalid-cost', path: 'cost' };
    if (!hasRarity(card?.rarity)) return { ok: false, reason: 'invalid-rarity', path: 'rarity' };
    const window = rarityWindow(card.cost, card.rarity);
    const value = cardValueOf(card, card.effects);
    const detail = { value, budget: window.budget, min: window.min, max: window.max };
    if (value > window.max + BUDGET_EPSILON) return { ok: false, reason: 'over-budget', path: 'effects', detail };
    if (value < window.min - BUDGET_EPSILON) return { ok: false, reason: 'under-budget', path: 'effects', detail };
    if (!card.upgraded) return { ok: true, detail };
    const upWindow = rarityWindow(card.upgraded.cost ?? card.cost, card.rarity);
    if (!upWindow) return { ok: false, reason: 'invalid-cost', path: 'upgraded.cost' };
    const upValue = cardValueOf(card, card.upgraded.effects ?? card.effects);
    const upDetail = { value: upValue, budget: upWindow.budget, max: round2(upWindow.max * COMBAT_RULES.upgradeAllowance) };
    if (upValue > upDetail.max + BUDGET_EPSILON) return { ok: false, reason: 'upgrade-over-budget', path: 'upgraded', detail: upDetail };
    if (upValue - upWindow.budget < value - window.budget - BUDGET_EPSILON) return { ok: false, reason: 'upgrade-not-better', path: 'upgraded', detail: upDetail };
    return { ok: true, detail };
}

// 从 level 升到 level+1 所需经验。
export function expToNextLevel(level) {
    return 40 + 20 * (level - 1);
}

// 累计经验换算成 { level, into 当前级已得, next 升级所需 }，满级 next 为 0。
export function expProgress(totalExp) {
    let level = 1;
    let remain = Math.max(0, Math.floor(Number(totalExp) || 0));
    while (level < COMBAT_RULES.maxLevel && remain >= expToNextLevel(level)) {
        remain -= expToNextLevel(level);
        level += 1;
    }
    const next = level >= COMBAT_RULES.maxLevel ? 0 : expToNextLevel(level);
    return { level, into: next ? remain : 0, next };
}

export function levelFromExp(totalExp) {
    return expProgress(totalExp).level;
}

// 同一张牌最多带几张；稀有度无效返回 0。
export function cardCopyLimit(rarity) {
    if (!hasRarity(rarity)) return 0;
    if (rarity === 'signature') return COMBAT_RULES.signatureCopyLimit;
    return rarity === 'mythic' ? 1 : COMBAT_RULES.copyLimit;
}

// 专属卡槽位（从 1 起）：ID 以「-g<槽位>」结尾时按槽位，否则按档案里的位置（兼容旧档案预生成的卡）。
export function signatureSlotOf(card, index = 0) {
    const match = /-g(\d+)$/.exec(String(card?.id || ''));
    const slot = match ? Number(match[1]) : index + 1;
    return slot >= 1 && slot <= COMBAT_RULES.signatureUnlockLevels.length ? slot : index + 1;
}

// 某槽位的解锁等级；槽位不存在时永不解锁。
export const signatureUnlockLevel = (slot) => COMBAT_RULES.signatureUnlockLevels[slot - 1] ?? Infinity;

// 档案里登记在该槽位的专属卡，没有返回 null。
export function signatureCardAt(profile, slot) {
    return (profile?.signatureCards || []).find((card, index) => signatureSlotOf(card, index) === slot) || null;
}

// 牌组校验：张数下限、是否拥有、目录与稀有度。规则 v6 卡组即持有，不再限总张数与同名张数（同名上限只约束获得来源）。
// owned 可以是 Map 或普通对象，catalog 是 id 到牌定义的 Map。
export function validateDeck(cardIds, owned, catalog) {
    const ids = Array.isArray(cardIds) ? cardIds : [];
    const errors = [];
    if (ids.length < COMBAT_RULES.deckMin) errors.push({ path: 'cards', reason: 'deck-too-small', detail: { size: ids.length, min: COMBAT_RULES.deckMin } });
    if (ids.length > COMBAT_RULES.deckSanityMax) errors.push({ path: 'cards', reason: 'deck-too-large', detail: { size: ids.length, max: COMBAT_RULES.deckSanityMax } });
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const ownedMap = owned instanceof Map ? owned : new Map(Object.entries(owned || {}));
    for (const [id, count] of counts) {
        const card = catalog?.get(id);
        if (!card) errors.push({ path: 'cards', reason: 'unknown-card', cardId: id });
        else if (!cardCopyLimit(card.rarity)) errors.push({ path: 'cards', reason: 'invalid-rarity', cardId: id });
        const ownedCount = ownedMap.get(id) || 0;
        if (!ownedCount) errors.push({ path: 'cards', reason: 'not-owned', cardId: id });
        else if (count > ownedCount) errors.push({ path: 'cards', reason: 'owned-exceeded', cardId: id, detail: { count, owned: ownedCount } });
    }
    return { ok: errors.length === 0, size: ids.length, errors };
}

export const COMBAT_DIFFICULTY_KEYS = Object.freeze(Object.keys(COMBAT_RULES.difficulty));

export function difficultyRule(key) {
    return COMBAT_RULES.difficulty[key] || COMBAT_RULES.difficulty.normal;
}

export const SKILL_COUNT_MAX = 10;

// 目标技能数：等级每 3 级一个（至少 3），精英 +1、首领 +2，封顶 SKILL_COUNT_MAX。
export function skillTarget(level, tier) {
    const base = Math.max(3, Math.ceil((Number(level) || 1) / 3));
    return Math.min(SKILL_COUNT_MAX, base + (tier === 'elite' ? 1 : tier === 'boss' ? 2 : 0));
}

// 同伴技能补齐的伤害上限，按等级分档（档位从高到低排）。
export const ALLY_FILL_TIERS = Object.freeze([Object.freeze({ minLevel: 11, cap: 25 }), Object.freeze({ minLevel: 6, cap: 21 })]);
export const ALLY_FILL_COMPOSITE_LEVEL = 6;
export const ALLY_SKILL_CAP_MAX = ALLY_FILL_TIERS[0].cap;

export function allyFillCap(level) {
    const value = Number(level) || 1;
    return ALLY_FILL_TIERS.find((tier) => value >= tier.minLevel)?.cap ?? COMBAT_RULES.allySkillDamageCap;
}

// 敌人缩放：血量与伤害倍率随等级、难度、与玩家的等级差变化；tier 无效返回 null。
export function scaleEnemyStats(template, level = 1, difficulty = 'normal', { gap = 0 } = {}) {
    const tier = COMBAT_RULES.tiers[template?.tier];
    if (!tier) return null;
    const rule = difficultyRule(difficulty);
    const levelScale = 1 + COMBAT_RULES.tierScalePerLevel * Math.max(0, (Number(level) || 1) - 1);
    const levelGap = Math.max(0, Number(gap) || 0);
    // 难度倍率大于 1 的部分按档位的 difficultyGain 打折，小于 1 的部分原样生效。
    const gained = (multiplier) => multiplier > 1 ? 1 + (multiplier - 1) * (tier.difficultyGain ?? 1) : multiplier;
    const hp = Math.max(1, Math.round(template.base.hp * levelScale * gained(rule.hp) * (tier.hpScale ?? 1) * (1 + COMBAT_RULES.levelGap.hp * levelGap)));
    const damage = gained(rule.damage) * (tier.damageScale ?? 1) * (1 + COMBAT_RULES.levelGap.damage * levelGap);
    return { hp, damageScale: Math.min(5, Math.round(damage * 100) / 100) };
}

// 新建战斗的多敌折算：1 名不削弱；2、3 名普通敌人使用同一胜场档位，后备不增加削弱。
export function crowdScaleFor(total, battleWins = 0) {
    const n = Math.min(COMBAT_RULES.maxFoesOnField, Math.max(1, Math.floor(Number(total) || 1)));
    if (n <= 1) return 1;
    const wins = Number.isSafeInteger(battleWins) && battleWins >= 0 ? battleWins : 0;
    return COMBAT_RULES.crowd.filter((tier) => wins >= tier.wins).at(-1).scale;
}

// 一组敌人的战斗经验合计。
export function combatExpReward(tiers) {
    return (Array.isArray(tiers) ? tiers : []).reduce((total, tier) => total + (COMBAT_RULES.tiers[tier]?.exp || 0), 0);
}

// 出手速度：职业速度优先，其次档位速度，带按 id 稳定的抖动。
export function combatSpeedFor({ archetype, tier, id } = {}) {
    const base = COMBAT_RULES.archetypes[archetype]?.speed ?? COMBAT_RULES.tiers[tier]?.speed ?? COMBAT_RULES.defaultSpeed;
    const jitter = COMBAT_RULES.speedJitter;
    return base + (id ? hash32(`speed:${id}`) % (2 * jitter + 1) - jitter : 0);
}
