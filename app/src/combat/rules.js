import { hash32 } from './random.js';

export const COMBAT_RULES = Object.freeze({
    // 规则版本 4（助手 10-28 第一批）：牌实例层（临时牌、单张费用、本场成长）、选牌阶段、触发总线、关键字（固有、虚无、不能打出、被弃时）
    // 与弃牌 / 复制 / 生成 / 重放 / 成长 / 减费 / 限时触发效果。v3 setup 不含这些字段，在 v4 引擎上重放结果不变，进行中的 v3 战斗继续有效。
    // 规则版本 3：新增效果原语（伤害取格挡、自伤、翻倍、下回合生效、每回合触发、手牌费用修正）、
    // 新状态（无形、禁抽、不屈）与觉醒动作；v2 的行动值时间轴不变。旧版本的进行中战斗作废。
    version: 4,
    energyPerTurn: 3,
    drawPerTurn: 5,
    handLimit: 10,
    deckMin: 20,
    deckMax: 30,
    copyLimit: 3,
    // 每个单位每回合最多新增的临时牌（复制、生成），防止自我复制循环。
    tempCardsPerTurn: 10,
    starterDeckSize: 20,
    starterDeckShape: Object.freeze({ basicAttack: 3, basicDefend: 3, classCards: 10, personalCards: 4 }),
    storyExpCapPerFloor: 50,
    maxLevel: 20,
    // 敌人（P8b）：开战标签合计最多 maxEnemies，场上同时最多 maxEnemiesOnField，其余在场外按序补上。
    maxEnemies: 50,
    maxEnemiesOnField: 5,
    maxAllies: 3,
    // 速度：行动间隔与速度成反比；按职业原型 / 敌人档位给基准，再按档案 ID 散列浮动 ±speedJitter。
    defaultSpeed: 100,
    speedJitter: 5,
    tiers: Object.freeze({
        // hpScale / damageScale：开战时的档位校准倍率（计划 5.6，按 scripts/combat-balance.mjs 的托管模拟取值），与难度倍率相乘写进 setup；
        // 档案生命区间与技能伤害上限仍按 hp / damageCap 校验，已入库的档案不受影响。
        // difficultyGain：难度表生命 / 伤害倍率高出 1 的部分按此比例计入（助手 10-29：精英、首领的高难度增幅减半）；轻松档低于 1 的倍率照原值。
        normal: Object.freeze({ label: '普通', hp: 40, damageCap: 12, exp: 20, speed: 100, hpScale: 1.3, damageScale: 2.7, difficultyGain: 1 }),
        elite: Object.freeze({ label: '精英', hp: 80, damageCap: 18, exp: 45, speed: 104, hpScale: 1.15, damageScale: 1.75, difficultyGain: 0.5 }),
        boss: Object.freeze({ label: '首领', hp: 160, damageCap: 26, exp: 100, speed: 92, hpScale: 0.68, damageScale: 1, difficultyGain: 0.5 }),
    }),
    // 敌人生命每级成长（计划 5.6 校准：主角的生命、六维与卡牌换算已随等级成长，敌人只需缓升）。
    tierScalePerLevel: 0.05,
    // 敌人比我方平均等级高出的每一级（只算敌方更强的一侧，计划 S8）：生命与伤害再按比例上调，相对档「稍强 / 强敌」体现在敌人数值上。
    // 没有属性视图时等级差为 0。
    levelGap: Object.freeze({ hp: 0.02, damage: 0.04 }),
    // 难度档位（助手 10-28，参考杀戮尖塔进阶，高档包含低档的追加规则）：hp / damage 为敌人生命与伤害倍率；affixes 为普通 / 精英 / 首领的常驻效果数；
    // curse 为每场往主角牌堆加的不能打出的临时诅咒牌数；maxHpPct 为我方生命上限比例；extraSkills 为敌人追加技能数；
    // enrageAt 为首领狂暴阶段的生命阈值（%）；loot 为每个翻牌槽稀有度上调一档的概率；healScale 为剧情回血倍率（噩梦减半）。
    // setup 写入按当场难度算好的数值，重放不受之后改设置影响。
    difficulty: Object.freeze({
        easy: difficultyEntry({ label: '轻松', hp: 0.8, damage: 0.8, affixes: [0, 0, 1] }),
        normal: difficultyEntry({ label: '标准', hp: 1, damage: 1, affixes: [0, 1, 2] }),
        // 常驻效果数（助手 10-29）：困难起精英、首领各比原表少 1，且不少于低一档。
        hard: difficultyEntry({ label: '困难', hp: 1.2, damage: 1.15, affixes: [0, 1, 2], loot: 0.15 }),
        brutal: difficultyEntry({ label: '严酷', hp: 1.35, damage: 1.25, affixes: [1, 1, 2], curse: 1, maxHpPct: 0.9, loot: 0.25 }),
        nightmare: difficultyEntry({ label: '噩梦', hp: 1.5, damage: 1.35, affixes: [1, 2, 3], curse: 1, maxHpPct: 0.9, extraSkills: 1, enrageAt: 65, loot: 0.35, healScale: 0.5 }),
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

// 可在当前引擎上重放的规则版本（v3 setup 不含 v4 字段，结算不变）。
export const COMPATIBLE_RULES_VERSIONS = Object.freeze([3, 4]);
export const isCompatibleRulesVersion = (v) => COMPATIBLE_RULES_VERSIONS.includes(v);

// 生成的临时牌（create 效果）：只在本场存在，不入卡组与账本。碎刃 / 护符 / 灵光 0 费、打出后消耗；
// 状态牌（status-*）不能打出、没有效果：眩晕带虚无（回合末还在手里就消耗），伤口留在本场牌堆里。敌方技能与被动只能生成状态牌，塞进对方卡组单位的牌堆。
export const TOKEN_CARDS = deepFreeze({
    'token-shard': { id: 'token-shard', name: '碎刃', type: 'attack', cost: 0, rarity: 'basic', effects: [{ op: 'damage', amount: 4, hits: 1, target: 'enemy' }, { op: 'exhaust-self' }], skillRef: '碎刃' },
    'token-ward': { id: 'token-ward', name: '护符', type: 'skill', cost: 0, rarity: 'basic', effects: [{ op: 'block', amount: 4, target: 'self' }, { op: 'exhaust-self' }], skillRef: '护符' },
    'token-spark': { id: 'token-spark', name: '灵光', type: 'skill', cost: 0, rarity: 'basic', effects: [{ op: 'draw', amount: 1 }, { op: 'exhaust-self' }], skillRef: '灵光' },
    'status-daze': { id: 'status-daze', name: '眩晕', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, ethereal: true, skillRef: '眩晕' },
    'status-wound': { id: 'status-wound', name: '伤口', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, skillRef: '伤口' },
});
export const TOKEN_KEYS = Object.freeze(Object.keys(TOKEN_CARDS));
// 难度表的诅咒牌（严酷、噩梦每场往主角牌堆加 curse 张）：不能打出、没有效果，只在本场 setup 里，不入卡组与账本。
export const CURSE_CARD = deepFreeze({ id: 'curse-dread', name: '厄咒', type: 'skill', cost: 0, rarity: 'basic', effects: [], unplayable: true, skillRef: '厄咒' });

const STATUS_VALUE = Object.freeze({ vulnerable: 1.75, weak: 1.75, strength: 5, dexterity: 5, poison: 1.2, regen: 1.5, thorns: 1.5, intangible: 7, 'no-draw': -3, endure: 6, artifact: 6, frail: 1.5 });
const DOUBLE_VALUE = Object.freeze({ poison: 6, block: 7, strength: 9 });
// 限时触发 BUFF：每回合预期触发次数（限定牌型再 ×0.5）。
const BUFF_RATE = Object.freeze({ 'card-played': 2.5, discard: 1, exhaust: 1, kill: 0.5, 'hp-loss': 1, 'block-gain': 1.5, 'turn-start': 1, 'turn-end': 1 });
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
        // v4：弃牌本身是代价（指定弃低于随机弃），弃全手再抽按换手估正值；复制、生成、重放、成长、减费、限时触发按预期收益折算。
        case 'discard': return -effect.amount * (effect.mode === 'choose' ? 1.5 : 2.5);
        case 'discard-hand': return effect.redraw ? 6 : -6;
        case 'copy': return effect.amount * (effect.from === 'self' ? 4 : 6);
        // 状态牌塞进自己牌堆是代价。
        case 'create': return TOKEN_CARDS[effect.card]?.unplayable ? -3 * effect.amount : effect.amount * 0.8 * effectsValue(TOKEN_CARDS[effect.card]?.effects);
        case 'repeat-last': return 7 * effect.amount;
        case 'replay-next': return (effect.cardType ? 6 : 8) * effect.amount;
        case 'grow': return effect.amount * 2;
        case 'cost-mod': return -effect.amount * (effect.mode === 'random' ? 3 : effect.mode === 'self' ? 2.5 : 5) * (effect.scope === 'combat' ? 1.5 : 1);
        case 'buff': return effect.turns * (BUFF_RATE[effect.trigger] || 1) * (effect.cardType ? 0.5 : 1) * effectsValue(effect.then);
        default: return 0;
    }
}

function effectsValue(effects) {
    return (Array.isArray(effects) ? effects : []).reduce((sum, effect) => sum + effectValue(effect), 0);
}

export function estimateEffectsValue(effects) {
    return round(effectsValue(effects));
}

// v4 关键字：固有加值；虚无为代价（已自带消耗时不重复计）；被弃时效果按 0.5 折算，不能打出的牌全额计。没有关键字的牌估值不变。
function keywordValue(card, effects) {
    let v = 0;
    if (card.innate) v += 2;
    if (card.ethereal && !(effects || []).some((e) => e?.op === 'exhaust-self')) v -= 2;
    if (card.onDiscard) v += effectsValue(card.onDiscard) * (card.unplayable ? 1 : 0.5);
    return v;
}

const cardValue = (card, effects) => round(effectsValue(effects) + keywordValue(card, effects));

// 一张卡（或卡形对象）的估值，含关键字与被弃时效果；模板求解与 evaluateCardBudget 同一口径。
export const estimateCardValue = (card) => cardValue(card || {}, card?.effects);

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
    const value = cardValue(card, card.effects);
    const detail = { value, budget: window.budget, min: window.min, max: window.max };
    if (value > window.max + EPSILON) return { ok: false, reason: 'over-budget', path: 'effects', detail };
    if (value < window.min - EPSILON) return { ok: false, reason: 'under-budget', path: 'effects', detail };
    if (!card.upgraded) return { ok: true, detail };
    const upWindow = rarityWindow(card.upgraded.cost ?? card.cost, card.rarity);
    if (!upWindow) return { ok: false, reason: 'invalid-cost', path: 'upgraded.cost' };
    const upValue = cardValue(card, card.upgraded.effects ?? card.effects);
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

function difficultyEntry({ label, hp, damage, affixes: [normal, elite, boss], curse = 0, maxHpPct = 1, extraSkills = 0, enrageAt = 50, loot = 0, healScale = 1 }) {
    return Object.freeze({ label, hp, damage, affixes: Object.freeze({ normal, elite, boss }), curse, maxHpPct, extraSkills, enrageAt, loot, healScale });
}

// 难度键按难度表顺序（轻松 → 噩梦）；非法键一律按标准档。
export const COMBAT_DIFFICULTY_KEYS = Object.freeze(Object.keys(COMBAT_RULES.difficulty));
export function difficultyRule(key) {
    return COMBAT_RULES.difficulty[key] || COMBAT_RULES.difficulty.normal;
}

// 技能数（助手 10-28 S7）：max(3, ⌈等级/3⌉)，敌人精英 +1、首领 +2，上限 SKILL_COUNT_MAX。
export const SKILL_COUNT_MAX = 10;
export function skillTarget(level, tier) {
    const base = Math.max(3, Math.ceil((Number(level) || 1) / 3));
    const bonus = tier === 'elite' ? 1 : tier === 'boss' ? 2 : 0;
    return Math.min(SKILL_COUNT_MAX, base + bonus);
}

// 队友按等级补技能（D10，助手 10-30）：补技能的伤害折算上限按等级分档 Lv1–5 18、Lv6–10 21、Lv11 起 25；
// Lv6 起只能选复合技能模板（card-templates.js 的 COMPOSITE_SKILL_KEYS）。只作用于新补的技能；剧情习得 / 精进、新档案与绝招仍按 allySkillDamageCap。
export const ALLY_FILL_TIERS = Object.freeze([
    Object.freeze({ minLevel: 11, cap: 25 }),
    Object.freeze({ minLevel: 6, cap: 21 }),
]);
export const ALLY_FILL_COMPOSITE_LEVEL = 6;
// 技能角色档案的技能伤害校验上限取最高一档（旧档案的技能都不超过 allySkillDamageCap，仍合法）。
export const ALLY_SKILL_CAP_MAX = ALLY_FILL_TIERS[0].cap;
export function allyFillCap(level) {
    const n = Number(level) || 1;
    return ALLY_FILL_TIERS.find((t) => n >= t.minLevel)?.cap ?? COMBAT_RULES.allySkillDamageCap;
}

// partyLevel 为敌人推导等级（相对档；没有属性视图时为我方平均等级）；gap 为敌人等级 − 我方平均等级，只取正值。
export function scaleEnemyStats(profile, partyLevel = 1, difficulty = 'normal', { gap = 0 } = {}) {
    const tier = COMBAT_RULES.tiers[profile?.tier];
    if (!tier) return null;
    const mode = difficultyRule(difficulty);
    const levelFactor = 1 + COMBAT_RULES.tierScalePerLevel * Math.max(0, (Number(partyLevel) || 1) - 1);
    const g = Math.max(0, Number(gap) || 0);
    const gain = (m) => (m > 1 ? 1 + (m - 1) * (tier.difficultyGain ?? 1) : m);
    const hp = Math.max(1, Math.round(profile.base.hp * levelFactor * gain(mode.hp) * (tier.hpScale ?? 1) * (1 + COMBAT_RULES.levelGap.hp * g)));
    // 伤害倍率取两位小数、不超过引擎上限 5，setup 持久化后原样重放。
    const damage = gain(mode.damage) * (tier.damageScale ?? 1) * (1 + COMBAT_RULES.levelGap.damage * g);
    return { hp, damageScale: Math.min(5, Math.round(damage * 100) / 100) };
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
