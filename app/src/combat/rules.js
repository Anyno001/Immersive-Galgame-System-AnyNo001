export const COMBAT_RULES = Object.freeze({
    version: 1,
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
    tiers: Object.freeze({
        normal: Object.freeze({ label: '普通', hp: 40, damageCap: 12, exp: 20 }),
        elite: Object.freeze({ label: '精英', hp: 80, damageCap: 18, exp: 45 }),
        boss: Object.freeze({ label: '首领', hp: 160, damageCap: 26, exp: 100 }),
    }),
    tierScalePerLevel: 0.12,
    difficulty: Object.freeze({
        easy: Object.freeze({ hp: 0.8, damage: 0.8 }),
        normal: Object.freeze({ hp: 1, damage: 1 }),
        hard: Object.freeze({ hp: 1.25, damage: 1.2 }),
    }),
    archetypes: Object.freeze({
        warrior: Object.freeze({ label: '战士', hp: Object.freeze([70, 90]) }),
        guardian: Object.freeze({ label: '守护', hp: Object.freeze([80, 100]) }),
        ranger: Object.freeze({ label: '游侠', hp: Object.freeze([60, 75]) }),
        assassin: Object.freeze({ label: '刺客', hp: Object.freeze([55, 70]) }),
        mage: Object.freeze({ label: '法师', hp: Object.freeze([50, 65]) }),
        priest: Object.freeze({ label: '祈司', hp: Object.freeze([55, 70]) }),
        summoner: Object.freeze({ label: '召唤', hp: Object.freeze([55, 70]) }),
        bard: Object.freeze({ label: '乐师', hp: Object.freeze([55, 70]) }),
    }),
    costBudget: Object.freeze({ 0: 4, 1: 8, 2: 14, 3: 20, X: 7 }),
    rarityTolerance: Object.freeze({ basic: 0.15, common: 0.15, uncommon: 0.2, rare: 0.3, personal: 0.3 }),
    upgradeAllowance: 1.3,
    allySkillDamageCap: 18,
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

const STATUS_VALUE = Object.freeze({ vulnerable: 1.75, weak: 1.75, strength: 5, dexterity: 5, poison: 1.2, regen: 1.5, thorns: 1.5 });
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
        case 'damage': return effect.amount * (4 / 3) * (effect.hits || 1) * area;
        case 'block': return effect.amount * 1.6 * area;
        case 'heal': return effect.amount * 2 * area;
        case 'draw': return effect.amount * 4;
        case 'energy': return effect.amount * 6;
        case 'status': return effect.stacks * (STATUS_VALUE[effect.status] || 0) * area;
        case 'exhaust-self': return -2;
        case 'conditional': return 0.6 * effectsValue(effect.then);
        default: return 0;
    }
}

function effectsValue(effects) {
    return (Array.isArray(effects) ? effects : []).reduce((sum, effect) => sum + effectValue(effect), 0);
}

export function estimateEffectsValue(effects) {
    return round(effectsValue(effects));
}

function budgetWindow(cost, rarity) {
    const budget = COMBAT_RULES.costBudget[cost];
    if (budget === undefined) return null;
    const tolerance = COMBAT_RULES.rarityTolerance[rarity] ?? COMBAT_RULES.rarityTolerance.common;
    return { budget, min: round(budget * (1 - tolerance)), max: round(budget * (1 + tolerance)) };
}

export function evaluateCardBudget(card) {
    const window = budgetWindow(card?.cost, card?.rarity);
    if (!window) return { ok: false, reason: 'invalid-cost', path: 'cost' };
    const value = estimateEffectsValue(card.effects);
    const detail = { value, budget: window.budget, min: window.min, max: window.max };
    if (value > window.max + EPSILON) return { ok: false, reason: 'over-budget', path: 'effects', detail };
    if (value < window.min - EPSILON) return { ok: false, reason: 'under-budget', path: 'effects', detail };
    if (!card.upgraded) return { ok: true, detail };
    const upWindow = budgetWindow(card.upgraded.cost ?? card.cost, card.rarity);
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

export function validateDeck(deck, owned) {
    const cards = Array.isArray(deck) ? deck : [];
    const errors = [];
    if (cards.length < COMBAT_RULES.deckMin) errors.push({ path: 'cards', reason: 'deck-too-small', detail: { size: cards.length, min: COMBAT_RULES.deckMin } });
    if (cards.length > COMBAT_RULES.deckMax) errors.push({ path: 'cards', reason: 'deck-too-large', detail: { size: cards.length, max: COMBAT_RULES.deckMax } });
    const counts = new Map();
    for (const cardId of cards) counts.set(cardId, (counts.get(cardId) || 0) + 1);
    const ownedCounts = owned instanceof Map ? owned : new Map(Object.entries(owned || {}));
    for (const [cardId, count] of counts) {
        if (count > COMBAT_RULES.copyLimit) errors.push({ path: 'cards', reason: 'copy-limit', cardId, detail: { count, limit: COMBAT_RULES.copyLimit } });
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
