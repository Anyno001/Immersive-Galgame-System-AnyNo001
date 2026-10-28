import { hash32 } from './random.js';

export const COMBAT_RULES = Object.freeze({
    // 规则版本 3：新增效果原语（伤害取格挡、自伤、翻倍、下回合生效、每回合触发、手牌费用修正）、
    // 新状态（无形、禁抽、不屈）与觉醒动作；v2 的行动值时间轴不变。旧版本的进行中战斗作废。
    version: 3,
    energyPerTurn: 3,
    drawPerTurn: 5,
    handLimit: 10,
    deckMin: 20,
    deckMax: 30,
    copyLimit: 3,
    starterDeckSize: 20,
    starterDeckShape: Object.freeze({ basicAttack: 3, basicDefend: 3, classCards: 10, personalCards: 4 }),
    storyExpCapPerFloor: 50,
    maxLevel: 20,
    maxEnemies: 5,
    maxAllies: 3,
    // 速度：行动间隔与速度成反比；按职业原型 / 敌人档位给基准，再按档案 ID 散列浮动 ±speedJitter。
    defaultSpeed: 100,
    speedJitter: 5,
    tiers: Object.freeze({
        normal: Object.freeze({ label: '普通', hp: 40, damageCap: 12, exp: 20, speed: 100 }),
        elite: Object.freeze({ label: '精英', hp: 80, damageCap: 18, exp: 45, speed: 104 }),
        boss: Object.freeze({ label: '首领', hp: 160, damageCap: 26, exp: 100, speed: 92 }),
    }),
    tierScalePerLevel: 0.12,
    difficulty: Object.freeze({
        easy: Object.freeze({ hp: 0.8, damage: 0.8 }),
        normal: Object.freeze({ hp: 1, damage: 1 }),
        hard: Object.freeze({ hp: 1.25, damage: 1.2 }),
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
    costBudget: Object.freeze({ 0: 4, 1: 8, 2: 14, 3: 20, X: 7 }),
    // 稀有度窗口（× 费用预算）：min / max 用于校验，target 是新卡求解的中心。下限沿用 v1，已入库的旧卡仍合法；
    // 稀有度越高上限越宽（适度超模），signature 为角色专属卡。未登记的稀有度拒收，不回落到 common。
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
    // 专属卡：每名卡组角色最多 2 张，限 1 张副本，只靠剧情解锁。
    signatureLimit: 2,
    signatureCopyLimit: 1,
    // 技能角色强度档（暂定）：hp / skill 为生命与技能数值倍率，ultimateCooldown 为绝招冷却回合（0 表示没有绝招）。
    allyTiers: Object.freeze({
        support: Object.freeze({ label: '陪衬', hp: 0.8, skill: 0.85, ultimateCooldown: 0 }),
        peer: Object.freeze({ label: '并肩', hp: 1, skill: 1, ultimateCooldown: 0 }),
        ace: Object.freeze({ label: '大腿', hp: 1.4, skill: 1.3, ultimateCooldown: 3 }),
        legend: Object.freeze({ label: '传说', hp: 1.8, skill: 1.5, ultimateCooldown: 2 }),
    }),
    defaultAllyTier: 'peer',
    allySkillDamageCap: 18,
    // 人物技能：每回合限一次，耗能固定，价值按同费用个人卡预算校验。
    heroSkillCost: 2,
    // 觉醒：每场 1 次、不耗能量，数值由程序固定。heal-pct、other-allies 与 next-turn 的 status 增益只供觉醒内部使用，不进卡牌 schema。
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
    // 不屈状态触发时（保留 1 生命）获得的格挡。
    endureBlock: 8,
});

function deepFreeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

export const BASIC_CARDS = deepFreeze({
    'basic-strike': { id: 'basic-strike', name: '攻击', type: 'attack', cost: 1, rarity: 'basic', effects: [{ op: 'damage', amount: 6, target: 'enemy' }], upgraded: { effects: [{ op: 'damage', amount: 8, target: 'enemy' }] }, skillRef: '攻击' },
    'basic-defend': { id: 'basic-defend', name: '防御', type: 'skill', cost: 1, rarity: 'basic', effects: [{ op: 'block', amount: 5, target: 'self' }], upgraded: { effects: [{ op: 'block', amount: 7, target: 'self' }] }, skillRef: '防御' },
});

export const BASIC_STRIKE_ID = 'basic-strike';
export const BASIC_DEFEND_ID = 'basic-defend';

const STATUS_VALUE = Object.freeze({ vulnerable: 1.75, weak: 1.75, strength: 5, dexterity: 5, poison: 1.2, regen: 1.5, thorns: 1.5, intangible: 7, 'no-draw': -3, endure: 6 });
const DOUBLE_VALUE = Object.freeze({ poison: 6, block: 7, strength: 9 });
const AREA_TARGETS = new Set(['all-enemies', 'all-allies']);
const EPSILON = 1e-9;

const round = (n) => Math.round(n * 100) / 100;

function targetScale(target) {
    if (AREA_TARGETS.has(target)) return 1.4;
    return target === 'random-enemy' ? 0.85 : 1;
}

function effectValue(effect) {
    if (!effect) return 0;
    const area = targetScale(effect.target);
    switch (effect.op) {
        case 'damage': return (effect.amount * (4 / 3) + ((effect.strengthScale || 1) - 1) * 2) * (effect.hits || 1) * area;
        case 'block': return effect.amount * 1.6 * area;
        case 'heal': return effect.amount * 2 * area;
        case 'draw': return effect.amount * 4;
        case 'energy': return effect.amount * 6;
        case 'status': return effect.stacks * (STATUS_VALUE[effect.status] || 0) * area;
        case 'exhaust-self': return -2;
        case 'conditional': return 0.6 * effectsValue(effect.then);
        // v3：伤害取格挡按约 6 点伤害估值；自伤计负价值；下回合生效略低于即时；每回合触发按 2.5 回合折算。
        case 'damage-from-block': return 8 * area;
        case 'self-damage': return -effect.amount * 1.5;
        case 'double': return (DOUBLE_VALUE[effect.stat] || 0) * area;
        case 'next-turn': return (effect.amount || 0) * (effect.gain === 'energy' ? 5 : effect.gain === 'draw' ? 3.5 : 0);
        case 'each-turn': return 2.5 * effectsValue(effect.then);
        case 'hand-cost': return -effect.amount * 5;
        case 'cleanse': return 4 * area;
        default: return 0;
    }
}

function effectsValue(effects) {
    return (Array.isArray(effects) ? effects : []).reduce((sum, effect) => sum + effectValue(effect), 0);
}

export function estimateEffectsValue(effects) {
    return round(effectsValue(effects));
}

const hasCost = (cost) => Object.hasOwn(COMBAT_RULES.costBudget, cost);
const hasRarity = (rarity) => typeof rarity === 'string' && Object.hasOwn(COMBAT_RULES.rarityWindows, rarity);

// 费用 × 稀有度的价值窗口；费用或稀有度未登记时返回 null。
export function rarityWindow(cost, rarity) {
    if (!hasCost(cost) || !hasRarity(rarity)) return null;
    const budget = COMBAT_RULES.costBudget[cost];
    const w = COMBAT_RULES.rarityWindows[rarity];
    return { budget, min: round(budget * w.min), max: round(budget * w.max), target: round(budget * w.target) };
}

export function evaluateCardBudget(card) {
    if (!hasCost(card?.cost)) return { ok: false, reason: 'invalid-cost', path: 'cost' };
    if (!hasRarity(card?.rarity)) return { ok: false, reason: 'invalid-rarity', path: 'rarity' };
    const window = rarityWindow(card.cost, card.rarity);
    const value = estimateEffectsValue(card.effects);
    const detail = { value, budget: window.budget, min: window.min, max: window.max };
    if (value > window.max + EPSILON) return { ok: false, reason: 'over-budget', path: 'effects', detail };
    if (value < window.min - EPSILON) return { ok: false, reason: 'under-budget', path: 'effects', detail };
    if (!card.upgraded) return { ok: true, detail };
    const upWindow = rarityWindow(card.upgraded.cost ?? card.cost, card.rarity);
    if (!upWindow) return { ok: false, reason: 'invalid-cost', path: 'upgraded.cost' };
    const upValue = estimateEffectsValue(card.upgraded.effects ?? card.effects);
    const upDetail = { value: upValue, budget: upWindow.budget, max: round(upWindow.max * COMBAT_RULES.upgradeAllowance) };
    if (upValue > upDetail.max + EPSILON) return { ok: false, reason: 'upgrade-over-budget', path: 'upgraded', detail: upDetail };
    if (upValue - upWindow.budget < value - window.budget - EPSILON) return { ok: false, reason: 'upgrade-not-better', path: 'upgraded', detail: upDetail };
    return { ok: true, detail };
}

export function expToNextLevel(level) {
    return 40 + 20 * (level - 1);
}

export function expProgress(exp) {
    let level = 1;
    let remaining = Math.max(0, Math.floor(Number(exp) || 0));
    while (level < COMBAT_RULES.maxLevel && remaining >= expToNextLevel(level)) {
        remaining -= expToNextLevel(level);
        level += 1;
    }
    const next = level >= COMBAT_RULES.maxLevel ? 0 : expToNextLevel(level);
    return { level, into: next ? remaining : 0, next };
}

export function levelFromExp(exp) {
    return expProgress(exp).level;
}

export function cardCopyLimit(rarity) {
    if (!hasRarity(rarity)) return 0;
    if (rarity === 'signature') return COMBAT_RULES.signatureCopyLimit;
    return rarity === 'mythic' ? 1 : COMBAT_RULES.copyLimit;
}

// catalog 提供已登记卡牌的稀有度；缺失卡牌或未知稀有度拒收。
export function validateDeck(deck, owned, catalog) {
    const cards = Array.isArray(deck) ? deck : [];
    const errors = [];
    if (cards.length < COMBAT_RULES.deckMin) errors.push({ path: 'cards', reason: 'deck-too-small', detail: { size: cards.length, min: COMBAT_RULES.deckMin } });
    if (cards.length > COMBAT_RULES.deckMax) errors.push({ path: 'cards', reason: 'deck-too-large', detail: { size: cards.length, max: COMBAT_RULES.deckMax } });
    const counts = new Map();
    for (const cardId of cards) counts.set(cardId, (counts.get(cardId) || 0) + 1);
    const ownedCounts = owned instanceof Map ? owned : new Map(Object.entries(owned || {}));
    for (const [cardId, count] of counts) {
        const card = catalog?.get(cardId);
        const limit = cardCopyLimit(card?.rarity);
        if (!card) errors.push({ path: 'cards', reason: 'unknown-card', cardId });
        else if (!limit) errors.push({ path: 'cards', reason: 'invalid-rarity', cardId });
        else if (count > limit) errors.push({ path: 'cards', reason: 'copy-limit', cardId, detail: { count, limit } });
        const have = ownedCounts.get(cardId) || 0;
        if (!have) errors.push({ path: 'cards', reason: 'not-owned', cardId });
        else if (count > have) errors.push({ path: 'cards', reason: 'owned-exceeded', cardId, detail: { count, owned: have } });
    }
    return { ok: errors.length === 0, size: cards.length, errors };
}

export function scaleEnemyStats(profile, partyLevel = 1, difficulty = 'normal') {
    const tier = COMBAT_RULES.tiers[profile?.tier];
    if (!tier) return null;
    const mode = COMBAT_RULES.difficulty[difficulty] || COMBAT_RULES.difficulty.normal;
    const levelFactor = 1 + COMBAT_RULES.tierScalePerLevel * Math.max(0, (Number(partyLevel) || 1) - 1);
    return { hp: Math.max(1, Math.round(profile.base.hp * levelFactor * mode.hp)), damageScale: mode.damage };
}

export function combatExpReward(enemyTiers) {
    return (Array.isArray(enemyTiers) ? enemyTiers : []).reduce((sum, tier) => sum + (COMBAT_RULES.tiers[tier]?.exp || 0), 0);
}

// 速度：职业原型 / 敌人档位给基准（都没有时用 defaultSpeed），按档案 ID 散列浮动 ±speedJitter；程序计算，不来自模型回复。
export function combatSpeedFor({ archetype, tier, id } = {}) {
    const base = COMBAT_RULES.archetypes[archetype]?.speed ?? COMBAT_RULES.tiers[tier]?.speed ?? COMBAT_RULES.defaultSpeed;
    const j = COMBAT_RULES.speedJitter;
    return base + (id ? (hash32(`speed:${id}`) % (2 * j + 1)) - j : 0);
}
