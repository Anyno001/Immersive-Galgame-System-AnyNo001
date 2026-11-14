// 卡牌/被动/技能/道具模板库：模板只描述「形状」，数值由 solveCardTemplate 按费用与稀有度的价值窗口反解。
// 所有模板对象冻结，整局共享；对外返回的牌/效果一律是新对象，调用方可随意修改。
import { COMBAT_RULES, estimateCardValue, estimateEffectsValue, evaluateCardBudget, rarityWindow } from './rules.js';
import { templateUpgradeDecision } from './card-template-upgrades.js';
import { CARD_TEMPLATES, TEMPLATE_COSTS, TEMPLATE_BUILDERS, templateCardFace } from './card-template-definitions.js';
export { CARD_TEMPLATES, TEMPLATE_COSTS } from './card-template-definitions.js';

const { damage, block, heal, status, draw, energy, applyStatus, cleanse } = TEMPLATE_BUILDERS;
// ---- 被动模板（开战/回合/受击/濒危触发）----
// effects() 每次返回新的浅拷贝，调用方可随意改。
const passive = (trigger, label, effects) => Object.freeze({ trigger, label, effects: () => effects.map((effect) => ({ ...effect })) });

export const PASSIVE_TEMPLATES = Object.freeze({
    'opening-strength': passive('battle-start', '开战获得 1 层攻击力', [status('strength', 1, 'self')]),
    'opening-dexterity': passive('battle-start', '开战获得 1 层防御力', [status('dexterity', 1, 'self')]),
    'opening-guard': passive('battle-start', '开战获得 8 点格挡', [block(8)]),
    'opening-weaken': passive('battle-start', '开战使全体敌人虚弱 1 层', [status('weak', 1, 'all-enemies')]),
    'opening-poison': passive('battle-start', '开战使全体敌人中毒 3 层', [status('poison', 3, 'all-enemies')]),
    'turn-guard': passive('turn-start', '回合开始获得 3 点格挡', [block(3)]),
    'turn-mend': passive('turn-end', '回合结束回复 2 点生命', [heal(2)]),
    'hit-guard': passive('on-hit', '受击后获得 2 点格挡', [block(2)]),
    'last-stand': passive('on-low-hp', '濒危时回复 12 点生命', [heal(12)]),
    'last-fury': passive('on-low-hp', '濒危时获得 2 层攻击力', [status('strength', 2, 'self')]),
    // 规则 v5 P2a：开战获得通用状态（G03、G05、G06）与削弱（G02）。
    'opening-vigor': passive('battle-start', '开战获得 3 层蓄势', [applyStatus('vigor', 3, 'self')]),
    'opening-ambush': passive('battle-start', '开战获得先手', [applyStatus('first-strike', 1, 'self')]),
    'opening-buffer': passive('battle-start', '开战获得 1 层护命', [applyStatus('buffer', 1, 'self')]),
    'opening-enfeeble': passive('battle-start', '开战使全体敌人攻击力下降 1 层', [applyStatus('atk-down', 1, 'all-enemies')]),
});

// 华而不实的风味被动：效果几乎没用，只用于人物特性与装备被动。
export const FLAIR_PASSIVE_TEMPLATES = Object.freeze({
    'flair-glint': passive('battle-start', '开战获得 1 点格挡', [block(1)]),
    'flair-thorn': passive('battle-start', '开战获得 1 层荆棘', [status('thorns', 1, 'self')]),
    'flair-miasma': passive('battle-start', '开战使全体敌人中毒 1 层', [status('poison', 1, 'all-enemies')]),
    'flair-halo': passive('turn-start', '回合开始获得 1 点格挡', [block(1)]),
    'flair-breath': passive('turn-end', '回合结束回复 1 点生命', [heal(1)]),
    'flair-pride': passive('on-hit', '受击后获得 1 点格挡', [block(1)]),
    'flair-sigh': passive('on-low-hp', '濒危时回复 1 点生命', [heal(1)]),
    'flair-pose': passive('on-low-hp', '濒危时获得 1 点格挡', [block(1)]),
    'flair-aura': passive('battle-start', '开战获得 1 层再生', [status('regen', 1, 'self')]),
    'flair-dawn': passive('turn-start', '回合开始回复 1 点生命', [heal(1)]),
    'flair-vow': passive('turn-end', '回合结束获得 1 点格挡', [block(1)]),
    'flair-echo': passive('on-hit', '受击后回复 1 点生命', [heal(1)]),
});

export const GEAR_PASSIVE_TEMPLATES = Object.freeze({ ...PASSIVE_TEMPLATES, ...FLAIR_PASSIVE_TEMPLATES });
// 华而不实被动在人物特性池与装备奖励候选里的抽取权重（规则 v5 D10），其余被动为 1。
export const FLAIR_PASSIVE_WEIGHT = 2;
export const passiveTemplateWeight = (key) => (Object.hasOwn(FLAIR_PASSIVE_TEMPLATES, key) ? FLAIR_PASSIVE_WEIGHT : 1);

// ---- 敌人/同伴技能模板 ----
// 数值 = floor(基准伤害 × 比例)，至少 1。
const scaled = (base, ratio) => Math.max(1, Math.floor(base * ratio));
// weight 是出招权重，cooldown 是冷却回合数。
const skill = (intent, label, build, weight = 1, cooldown = 0) => Object.freeze({ intent, label, build, weight, cooldown });

export const SKILL_TEMPLATES = Object.freeze({
    slash: skill('attack', '单体攻击', (n) => [damage(scaled(n, 0.6))], 3),
    heavy: skill('attack', '重击', (n) => [damage(scaled(n, 1))], 2, 2),
    combo: skill('attack', '两段攻击', (n) => [damage(scaled(n, 0.3), 'enemy', 2)], 2),
    cleave: skill('attack', '全体攻击', (n) => [damage(scaled(n, 0.4), 'all-enemies')], 2, 1),
    drain: skill('attack', '攻击并回复', (n) => [damage(scaled(n, 0.5)), heal(scaled(n, 0.3))], 2, 1),
    venom: skill('debuff', '中毒', (n) => [status('poison', Math.min(10, scaled(n, 0.3)), 'enemy')], 1, 1),
    curse: skill('debuff', '虚弱', () => [status('weak', 2, 'enemy')], 1, 2),
    expose: skill('debuff', '易伤', () => [status('vulnerable', 2, 'enemy')], 1, 2),
    guard: skill('defend', '格挡', (n) => [block(scaled(n, 0.6))], 1),
    shelter: skill('defend', '全体格挡', (n) => [block(scaled(n, 0.4), 'all-allies')], 1, 1),
    roar: skill('buff', '获得攻击力', () => [status('strength', 2, 'self')], 1, 2),
    mend: skill('heal', '治疗队友', (n) => [heal(Math.min(60, scaled(n, 0.6)), 'ally')], 1, 1),
    gash: skill('attack', '攻击+易伤', (n) => [damage(scaled(n, 0.5)), status('vulnerable', 2, 'enemy')], 2, 1),
    sunder: skill('attack', '全体攻击+全体虚弱', (n) => [damage(scaled(n, 0.3), 'all-enemies'), status('weak', 1, 'all-enemies')], 2, 2),
    'guard-strike': skill('attack', '攻击+自身格挡', (n) => [damage(scaled(n, 0.5)), block(scaled(n, 0.4))], 2),
    ward: skill('defend', '队友格挡+回复', (n) => [block(scaled(n, 0.5), 'ally'), heal(Math.min(60, scaled(n, 0.3)), 'ally')], 1, 1),
    warcry: skill('buff', '全体格挡+全体攻击力', (n) => [block(scaled(n, 0.3), 'all-allies'), status('strength', 1, 'all-allies')], 1, 2),
    leech: skill('attack', '攻击+全体队友回复', (n) => [damage(scaled(n, 0.5)), heal(Math.min(60, scaled(n, 0.2)), 'all-allies')], 2, 1),
    plague: skill('debuff', '全体中毒+全体易伤', (n) => [status('poison', Math.min(10, scaled(n, 0.3)), 'all-enemies'), status('vulnerable', 1, 'all-enemies')], 1, 2),
    triple: skill('attack', '三段攻击', (n) => [damage(scaled(n, 0.2), 'enemy', 3)], 2),
    punish: skill('attack', '攻击，目标易伤时追加伤害', (n) => [damage(scaled(n, 0.4)), conditional('target-has', 'vulnerable', [damage(scaled(n, 0.4))])], 2, 1),
    volley: skill('attack', '随机敌人三段攻击', (n) => [damage(scaled(n, 0.25), 'random-enemy', 3)], 2, 1),
    crush: skill('attack', '攻击+虚弱', (n) => [damage(scaled(n, 0.5)), status('weak', 1, 'enemy')], 2, 1),
    barb: skill('defend', '格挡+荆棘', (n) => [block(scaled(n, 0.4)), status('thorns', 2, 'self')], 1, 1),
    steady: skill('defend', '格挡+防御力', (n) => [block(scaled(n, 0.4)), status('dexterity', 1, 'self')], 1, 2),
    absolve: skill('heal', '净化队友并回复', (n) => [cleanse('ally'), heal(Math.min(60, scaled(n, 0.4)), 'ally')], 1, 2),
    bloom: skill('heal', '全体再生', () => [status('regen', 3, 'all-allies')], 1, 2),
    swift: skill('buff', '全体防御力', () => [status('dexterity', 1, 'all-allies')], 1, 2),
    detonate: skill('debuff', '中毒+中毒翻倍', (n) => [status('poison', Math.min(10, scaled(n, 0.2)), 'enemy'), { op: 'double', stat: 'poison', target: 'enemy' }], 1, 2),
    brittle: skill('debuff', '脆弱', () => [status('frail', 2, 'enemy')], 1, 2),
    relic: skill('buff', '获得人工制品', () => [status('artifact', 1, 'self')], 1, 3),
    // 规则 v5 P2a：敌人与队友可用的通用状态与吸取（不进补技能表，已有敌人的补技能结果不变）。
    'battle-flex': skill('buff', '本回合临时攻击力', () => [applyStatus('flex', 3, 'self')], 1, 2),
    enfeeble: skill('debuff', '攻击力下降', () => [applyStatus('atk-down', 2, 'enemy')], 1, 2),
    gather: skill('buff', '蓄势', () => [applyStatus('vigor', 4, 'self')], 1, 2),
    bloodsip: skill('attack', '吸取：攻击并按实际扣除的生命回复', (n) => [drain(scaled(n, 0.5))], 2, 1),
    // 规则 v5 P4a：晕厥与飞行（mechanics/foe.js），敌人与技能型队友可用；不进补技能表。
    concuss: skill('attack', '攻击+晕厥（目标跳过下一次行动）', (n) => [damage(scaled(n, 0.4)), applyStatus('stun', 1, 'enemy')], 1, 3),
    soar: skill('buff', '飞行（受攻击伤害减半，被命中数次后坠落晕厥）', () => [applyStatus('flying', 3, 'self')], 1, 4),
    // 规则 v5 P4b E12 / E13：召唤爪牙（mechanics/foe-units.js），只限敌方技能单位；召唤者倒下时爪牙退场。不进补技能表。
    'call-minion': skill('special', '召唤爪牙（场上敌人最多 5 名，召唤者倒下时爪牙退场）', (n) => [{ op: 'summon-minion', amount: 1, hp: Math.min(60, scaled(n, 1.5)), damage: Math.min(20, scaled(n, 0.3)) }], 1, 3),
    // 规则 v5 P4c E14 夺牌、E15 夺力（mechanics/foe-seize.js），只限敌方技能单位，倒下后归还。不进补技能表。
    pilfer: skill('debuff', '夺牌：封存对方一张手牌，倒下后归还', () => [{ op: 'seize-card', amount: 1, target: 'enemy' }], 1, 3),
    siphon: skill('debuff', '夺力：偷取对方攻击力，倒下后归还', () => [{ op: 'seize-might', stat: 'strength', amount: 2, target: 'enemy' }], 1, 3),
    'siphon-guard': skill('debuff', '夺守：偷取对方防御力，倒下后归还', () => [{ op: 'seize-might', stat: 'dexterity', amount: 2, target: 'enemy' }], 1, 3),
    // 规则 v5 P4d E18 行动限制、E20 降级（mechanics/foe-restrict.js），只限敌方技能单位；不进补技能表。
    shackle: skill('debuff', '禁攻：对方下一回合不能打出攻击牌', () => [applyStatus('no-attack', 1, 'enemy')], 1, 4),
    'tax-strike': skill('debuff', '攻击加费：对方下一回合攻击牌费用 +1', () => [applyStatus('attack-tax', 1, 'enemy')], 1, 3),
    'break-guard': skill('debuff', '禁守：对方下一回合无法获得格挡', () => [applyStatus('no-block', 1, 'enemy')], 1, 4),
    'dull-mind': skill('debuff', '少抽：对方下一回合少抽 1 张', () => [applyStatus('draw-down', 1, 'enemy')], 1, 3),
    unmake: skill('debuff', '降级：本场对方卡牌失去升级效果', () => [applyStatus('downgrade', 1, 'enemy')], 1, 5),
    // 规则 v5 P4d E21 塞垃圾牌扩展：往对方弃牌堆塞 G23 状态牌（灼痕、黏浊、空洞、痛楚）。
    'scorch-junk': skill('debuff', '塞入灼痕', () => [{ op: 'create', card: 'status-burn', amount: 1, to: 'discard' }], 1, 2),
    'slime-junk': skill('debuff', '塞入黏浊', () => [{ op: 'create', card: 'status-slime', amount: 1, to: 'discard' }], 1, 2),
    'void-junk': skill('debuff', '塞入空洞', () => [{ op: 'create', card: 'status-void', amount: 1, to: 'discard' }], 1, 2),
    'pain-junk': skill('debuff', '塞入痛楚', () => [{ op: 'create', card: 'status-pain', amount: 1, to: 'discard' }], 1, 2),
    // 规则 v5 P4d E19 牌面附着（mechanics/foe-restrict.js 的 mark-card），只限敌方技能单位；不进补技能表。
    'bind-card': skill('debuff', '绑定：对方 2 张牌每回合只能打出其中一张', () => [{ op: 'mark-card', mark: 'bound', amount: 2, target: 'enemy' }], 1, 3),
    'tax-card': skill('debuff', '加费：对方 2 张牌费用 +1', () => [{ op: 'mark-card', mark: 'taxed', amount: 2, target: 'enemy' }], 1, 3),
    'barb-card': skill('debuff', '痛刺：对方 2 张牌打出时失去生命', () => [{ op: 'mark-card', mark: 'pain', amount: 2, target: 'enemy' }], 1, 3),
    'fade-card': skill('debuff', '附加虚无：对方 2 张牌回合结束仍在手中则消耗', () => [{ op: 'mark-card', mark: 'ethereal', amount: 2, target: 'enemy' }], 1, 3),
    'scar-card': skill('debuff', '受创：对方 1 张牌打出后受到的攻击伤害增加', () => [{ op: 'mark-card', mark: 'scar', amount: 1, target: 'enemy' }], 1, 3),
});

// 复合效果的技能模板键（供选型时优先）。
export const COMPOSITE_SKILL_KEYS = Object.freeze(['drain', 'gash', 'sunder', 'guard-strike', 'ward', 'warcry', 'leech', 'plague', 'punish', 'crush', 'barb', 'steady', 'absolve', 'detonate']);

// 模板允许的费用列表（新数组）；模板不存在返回空数组。
export function templateCosts(key) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    return tpl ? [...(tpl.costs || TEMPLATE_COSTS)] : [];
}

// ---- 数值反解 ----
const EPSILON = 1e-9;
const clone = (value) => JSON.parse(JSON.stringify(value));
// 模板的稀有度下限（extra.minRarity）：personal 与 uncommon 同级，signature 与 epic 同级。
const RARITY_RANK = Object.freeze({ basic: 0, common: 1, uncommon: 2, personal: 2, rare: 3, epic: 4, signature: 4, mythic: 5 });
const meetsMinRarity = (tpl, rarity) => !tpl.minRarity || (RARITY_RANK[rarity] ?? -1) >= RARITY_RANK[tpl.minRarity];

// 枚举基础数值的全部组合；升级由来源规则单独构造。
function enumerateValues(vars) {
    let combos = [[]];
    vars.forEach(([min, max]) => {
        const next = [];
        for (const combo of combos) for (let v = min; v <= max; v += 1) next.push([...combo, v]);
        combos = next;
    });
    return combos;
}

// 按变量值构造模板并估值：返回效果、牌形状、总价值，以及首效果占总价值的比例 share。
function evaluateTemplate(tpl, values) {
    const shape = templateCardFace(tpl, values);
    const { effects, onDiscard } = shape;
    const total = estimateCardValue(shape);
    const firstValue = estimateEffectsValue((effects.length ? effects : onDiscard || []).slice(0, 1));
    return { effects, shape, total, share: total ? firstValue / total : 0 };
}

// 在候选组合里挑出总价值满足 accept、且最接近 target 的一个（多变量时兼顾首效果比例 prefer）。
// 得分相同取先出现者。
function bestCombo(tpl, combos, target, accept) {
    let best = null;
    for (const values of combos) {
        const evaluated = evaluateTemplate(tpl, values);
        if (!accept(evaluated.total, evaluated)) continue;
        const score = Math.abs(evaluated.total - target) / target + (tpl.vars.length > 1 ? Math.abs(evaluated.share - tpl.prefer) : 0);
        if (!best || score < best.score - EPSILON) best = { v: values, score, ...evaluated };
    }
    return best;
}

const solveCache = new Map();

function upgradedTemplate(key, cost, rarity, plain) {
    const decision = templateUpgradeDecision(key, { cost, ...plain });
    if (decision.error) return decision;
    const { upgradeModel, upgraded, reason } = decision;
    const card = { ...plain, upgradeModel, ...(upgraded ? { upgraded } : { upgradeReason: reason }) };
    const budget = evaluateCardBudget({ cost, rarity, ...card });
    return budget.ok ? { card } : { error: budget.reason, detail: budget.detail };
}

// 数值只按基础窗口求解；固定策略决定升级轴，不能用预算换成其他效果。
// 无解返回 null；结果缓存，每次返回深拷贝。
export function solveCardTemplate(key, cost, rarity) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(cost) || !meetsMinRarity(tpl, rarity)) return null;
    const cacheKey = `${key}|${cost}|${rarity}`;
    if (!solveCache.has(cacheKey)) {
        const window = rarityWindow(cost, rarity);
        const base = window ? bestCombo(tpl, enumerateValues(tpl.vars), window.target, (total, evaluated) => {
            if (total < window.min - EPSILON || total > window.max + EPSILON) return false;
            const result = upgradedTemplate(key, cost, rarity, evaluated.shape);
            if (result.error) return false;
            evaluated.card = result.card;
            return true;
        }) : null;
        solveCache.set(cacheKey, base?.card || null);
    }
    const cached = solveCache.get(cacheKey);
    return cached ? clone(cached) : null;
}

// 用调用方给定的变量值直接生成一张牌，并校验。成功 { card }，失败 { error, detail }。
export function cardFromValues(key, cost, rarity, values) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(cost) || !meetsMinRarity(tpl, rarity)) return { error: 'template-unsolvable', detail: { cost, rarity } };
    if (!Array.isArray(values) || values.length !== tpl.vars.length) return { error: 'values-length', detail: { expected: tpl.vars.length } };
    const ranges = tpl.vars.map((range) => [...range]);
    if (values.some((v, i) => !Number.isInteger(v) || v < tpl.vars[i][0] || v > tpl.vars[i][1])) return { error: 'values-out-of-range', detail: { ranges } };
    const window = rarityWindow(cost, rarity);
    if (!window) return { error: 'template-unsolvable', detail: { cost, rarity } };
    const base = evaluateTemplate(tpl, values);
    if (base.total < window.min - EPSILON || base.total > window.max + EPSILON) return { error: 'values-out-of-window', detail: { cost, rarity } };
    const result = upgradedTemplate(key, cost, rarity, base.shape);
    return result.error ? result : { card: clone(result.card) };
}

// 离期望费用最近、且能解出来的费用。priceFor 可以是固定稀有度，或「费用 -> 稀有度」函数。
// X 费模板：期望为 X 时优先 X，否则 X 排在数字费用之后。
export function nearestTemplateCost(key, wanted, priceFor) {
    const costs = templateCosts(key);
    const anchor = TEMPLATE_COSTS.includes(wanted) ? wanted : 1;
    const rarityOf = typeof priceFor === 'function' ? priceFor : () => priceFor;
    const numeric = costs.filter((cost) => typeof cost === 'number').sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor) || a - b);
    const ordered = costs.includes('X') ? (wanted === 'X' ? ['X', ...numeric] : [...numeric, 'X']) : numeric;
    return ordered.find((cost) => solveCardTemplate(key, cost, rarityOf(cost))) ?? null;
}

// 把期望费用对齐到模板支持的费用：X 费模板接受任意 >=1 的数字费用并改为 X。
export function fixedTemplateCost(key, wanted) {
    const costs = templateCosts(key);
    return costs.includes(wanted) ? wanted : costs.includes('X') && typeof wanted === 'number' && wanted >= 1 ? 'X' : wanted;
}

// ---- 被动取用 ----
// 按模板键取被动：{ trigger, effects（新对象）, description }。
export function passiveFromTemplate(key) {
    const tpl = Object.hasOwn(GEAR_PASSIVE_TEMPLATES, key) ? GEAR_PASSIVE_TEMPLATES[key] : null;
    return tpl ? { trigger: tpl.trigger, effects: tpl.effects(), description: tpl.label } : null;
}

// 按倍率放大效果数值：层数封顶 10，回复封顶 60，其余封顶 99；向上取整。计数被动（counter）放大其 then。
const scaleUp = (effects, factor) => effects.map((effect) => (effect.op === 'counter'
    ? { ...effect, then: scaleUp(effect.then, factor) }
    : effect.op === 'status'
    ? { ...effect, stacks: Math.min(10, Math.ceil(effect.stacks * factor)) }
    : typeof effect.amount === 'number' ? { ...effect, amount: Math.min(effect.op === 'heal' ? 60 : 99, Math.ceil(effect.amount * factor)) } : effect));

// 被动按稀有度加强：倍率 = 该稀有度窗口目标 / 普通窗口目标；倍率 <= 1 不变。
export function passiveAtRarity(key, rarity) {
    const base = passiveFromTemplate(key);
    const window = COMBAT_RULES.rarityWindows[rarity];
    const factor = window ? window.target / COMBAT_RULES.rarityWindows.common.target : 1;
    return !base || factor <= 1 ? base : { ...base, effects: scaleUp(base.effects, factor), description: `${base.description}（加强）` };
}

// 被动按阶数加强：每升一阶再乘一次「稀有/普通」倍率。阶数非整数或 <=1 原样返回。
export function passiveAtTier(passiveValue, tier) {
    if (!passiveValue || !Number.isInteger(tier) || tier <= 1) return passiveValue;
    const factor = COMBAT_RULES.rarityWindows.rare.target / COMBAT_RULES.rarityWindows.common.target;
    let effects = passiveValue.effects;
    for (let i = 1; i < tier; i += 1) effects = scaleUp(effects, factor);
    return { ...passiveValue, effects };
}

// 装备被动：宝物槽按「稀有」加强一次并标注。
export function gearPassiveFromTemplate(key, slot) {
    const base = passiveFromTemplate(key);
    return !base || slot !== 'treasure' ? base : { ...passiveAtRarity(key, 'rare'), description: `${base.description}（宝物加强）` };
}

// ---- 道具模板 ----
const item = (label, effects) => Object.freeze({ label, effects: () => effects.map((effect) => ({ ...effect })) });

export const ITEM_TEMPLATES = Object.freeze({
    potion: item('回复 12 点生命', [heal(12, 'ally')]),
    barrier: item('获得 12 点格挡', [block(12, 'ally')]),
    bomb: item('对全体敌人造成 10 点伤害', [damage(10, 'all-enemies')]),
    purify: item('净化减益并回复 4 点生命', [cleanse('ally'), heal(4, 'ally')]),
    tonic: item('获得 2 点能量', [energy(2)]),
    scroll: item('抽 3 张牌', [draw(3)]),
    dagger: item('对一名敌人造成 16 点伤害', [damage(16)]),
    'poison-dart': item('使一名敌人中毒 6 层', [status('poison', 6, 'enemy')]),
    'weaken-powder': item('使一名敌人虚弱 2 层', [status('weak', 2, 'enemy')]),
    sunder: item('使一名敌人易伤 2 层', [status('vulnerable', 2, 'enemy')]),
    'frail-dust': item('使一名敌人脆弱 2 层', [status('frail', 2, 'enemy')]),
    'toxic-cloud': item('使全体敌人中毒 4 层', [status('poison', 4, 'all-enemies')]),
    smoke: item('使全体敌人虚弱 1 层', [status('weak', 1, 'all-enemies')]),
    'war-tonic': item('一名己方角色获得 2 层攻击力', [status('strength', 2, 'ally')]),
    'war-drum': item('全体己方获得 1 层攻击力', [status('strength', 1, 'all-allies')]),
});

// 战斗中道具的「自身」目标改为「队友」（治疗/格挡/净化），条件效果递归处理。
const SELF_TARGET_OPS = new Set(['heal', 'block', 'cleanse']);
export function itemEffectsForBattle(effects) {
    return (effects || []).map((effect) => {
        if (effect?.op === 'conditional') return { ...effect, then: itemEffectsForBattle(effect.then) };
        return SELF_TARGET_OPS.has(effect?.op) && (effect.target === undefined || effect.target === 'self') ? { ...effect, target: 'ally' } : effect;
    });
}

export function itemFromTemplate(key) {
    const tpl = Object.hasOwn(ITEM_TEMPLATES, key) ? ITEM_TEMPLATES[key] : null;
    return tpl ? { effects: tpl.effects(), description: tpl.label } : null;
}

// 道具放大时各效果的数值上限，其余 99。
const ITEM_VALUE_CAPS = Object.freeze({ heal: 60, energy: 3, draw: 5 });
const scaleItemEffects = (effects, factor) => effects.map((effect) => (effect.op === 'status'
    ? { ...effect, stacks: Math.min(10, Math.ceil(effect.stacks * factor)) }
    : typeof effect.amount === 'number' ? { ...effect, amount: Math.min(ITEM_VALUE_CAPS[effect.op] ?? 99, Math.ceil(effect.amount * factor)) } : effect));
// 效果里的全部数值（按出现顺序），用来同步改写描述里的数字。
const numbersOf = (effects) => effects.flatMap((effect) => (effect.op === 'status' ? [effect.stacks] : typeof effect.amount === 'number' ? [effect.amount] : []));

// 描述里的数字与原效果数值一一对应时逐个替换，否则在末尾加「（加强）」。
function rewriteNumbers(description, before, after) {
    const text = String(description);
    const found = text.match(/\d+/g) || [];
    if (found.length !== before.length || found.some((n, i) => Number(n) !== before[i])) return `${text}（加强）`;
    let index = 0;
    return text.replace(/\d+/g, () => String(after[index++]));
}

// 道具按稀有度加强（窗口目标比例，<=1 不变）。
export function itemAtRarity(key, rarity) {
    const base = itemFromTemplate(key);
    const window = Object.hasOwn(COMBAT_RULES.rarityWindows, rarity) ? COMBAT_RULES.rarityWindows[rarity] : null;
    const factor = window ? window.target / COMBAT_RULES.rarityWindows.common.target : 1;
    if (!base || factor <= 1) return base;
    const effects = scaleItemEffects(base.effects, factor);
    return { effects, description: rewriteNumbers(base.description, numbersOf(base.effects), numbersOf(effects)) };
}

// ---- 技能取用 ----
// 按模板键与基准伤害 power 生成技能。
export function skillFromTemplate(key, power) {
    const tpl = Object.hasOwn(SKILL_TEMPLATES, key) ? SKILL_TEMPLATES[key] : null;
    return tpl ? { intent: tpl.intent, effects: tpl.build(power), weight: tpl.weight, cooldown: tpl.cooldown, description: tpl.label } : null;
}

// 可作英雄技能的模板：未禁用 hero、无特殊 flags/onDiscard，且支持英雄技能费用。
const isHeroEligible = (tpl) => !!tpl && tpl.hero !== false && !tpl.flags && !tpl.onDiscard && !tpl.minRarity && (!tpl.costs || tpl.costs.includes(COMBAT_RULES.heroSkillCost));
// 可用于特性主动技能的模板键。
export const TRAIT_SKILL_TEMPLATE_KEYS = Object.freeze(Object.keys(CARD_TEMPLATES).filter((key) => {
    const tpl = CARD_TEMPLATES[key];
    return tpl.hero !== false && !tpl.flags && !tpl.onDiscard && !tpl.minRarity;
}));

// 把卡牌模板解成英雄技能（个人稀有度、英雄技能费用）。
export function heroSkillFromTemplate(key, { id, name } = {}) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    const solved = isHeroEligible(tpl) ? solveCardTemplate(key, COMBAT_RULES.heroSkillCost, 'personal') : null;
    return solved ? { id, name, effects: solved.effects, description: tpl.label } : null;
}

// 绝招：重击 + 易伤 2 层。
export function ultimateSkill(power, { id, name = '绝招', cooldown = 3 } = {}) {
    return { id, name, intent: 'attack', effects: [damage(scaled(power, 1)), status('vulnerable', 2, 'enemy')], weight: 1, cooldown, description: '绝招：重击并使目标易伤', ultimate: true };
}

// 各职业原型的默认英雄技能：[技能名, 卡牌模板键]。
const DEFAULT_HERO_SKILLS = Object.freeze({
    warrior: ['奋战', 'strike'], guardian: ['坚守', 'guard'], ranger: ['连射', 'scatter'], assassin: ['淬毒', 'venom'],
    mage: ['奥术涌动', 'sweep'], priest: ['祈愈', 'mend'], summoner: ['荆棘护体', 'spikes'], bard: ['激昂', 'prepare'],
});
export function defaultHeroSkill(archetype, characterId) {
    const [name, templateKey] = DEFAULT_HERO_SKILLS[archetype] || ['奋战', 'strike'];
    return heroSkillFromTemplate(templateKey, { id: `${characterId}-h0`, name });
}

// 各职业原型优先选用的卡牌模板（复合效果优先，单一效果补位）。
const ARCHETYPE_PREFERRED = Object.freeze({
    warrior: ['bash', 'shatter', 'thunder', 'desperate', 'reap', 'inflame', 'brace', 'counter', 'rampage', 'momentum', 'whirl', 'fleeting'],
    guardian: ['bash', 'guard', 'bulwark', 'counter', 'trip', 'cover', 'rally', 'bastion', 'plating', 'xguard', 'talisman', 'opener'],
    ranger: ['twin', 'scatter', 'quick', 'finisher', 'trip', 'footwork', 'prepare', 'rend', 'chain', 'encore', 'sift', 'glance', 'cull'],
    assassin: ['flurry', 'venom', 'venom-draw', 'execute', 'jab', 'toxin', 'finisher', 'agility', 'gut', 'scrap', 'reflex', 'sift', 'toss'],
    mage: ['sweep', 'thunder', 'wail', 'hex', 'surge', 'adrenal', 'flask', 'expose', 'echo', 'quicken', 'rhythm', 'purge', 'temper'],
    priest: ['mend', 'aegis', 'rally-draw', 'reap', 'regrow', 'hex', 'guard', 'prepare', 'talisman', 'opener', 'plating'],
    summoner: ['spikes', 'bastion', 'regrow', 'toxin', 'flask', 'scatter', 'rally', 'might', 'forge', 'mimic', 'scavenge', 'replicate'],
    bard: ['prepare', 'rally-draw', 'footwork', 'wail', 'quick', 'surge', 'cripple', 'might', 'echo', 'encore', 'frenzy', 'hone', 'replicate'],
});

// 卡牌模板的机制族（规则 v5 职业白名单）：每个模板恰好属于一个族，general 为通用族，所有职业可用。
// ARCHETYPE_PREFERRED 仍只决定推荐顺序；各职业的推荐模板与默认人物技能都落在其允许的族内（加载时自检）。
const TEMPLATE_FAMILY_TABLE = Object.freeze({
    general: ['strike', 'twin', 'bash', 'cripple', 'rend', 'quick', 'guard', 'brace', 'prepare', 'jab', 'trip', 'opener', 'might', 'foresight', 'reserve', 'steadfast', 'trance',
        'battlecry', 'stance', 'disarm', 'breach', 'wind-up', 'fervor', 'zenith', 'apex', 'ambush', 'lifeguard', 'siphon', 'spite',
        'reverb', 'resound', 'gambit', 'feint', 'quickdraw', 'flow', 'generator', 'hoard', 'overcharge', 'xdraw', 'xforge', 'interrupt', 'coup', 'brim', 'ashen', 'linger',
        'whetstone', 'carapace', 'trophy'],
    // 牌堆操作（P2b），所有职业可用。
    pile: ['scout', 'hunt', 'headbutt', 'salvage', 'exhume', 'stack', 'boomerang', 'rebound', 'purify', 'cinder', 'reprise', 'glimpse', 'morph', 'refine', 'polish'],
    fury: ['shatter', 'desperate', 'inflame', 'tear', 'fleeting', 'rampage', 'momentum', 'whirl', 'bloodlet', 'bloodrush', 'bloodrage', 'overdrive', 'heavy-blade', 'warpath', 'bloodoath',
        'hellraiser', 'dark-embrace', 'fiend-fire', 'feed'],
    cleave: ['sweep', 'scatter', 'thunder'],
    fortify: ['bulwark', 'counter', 'lure', 'xguard', 'plating', 'slam', 'entrench'],
    thorns: ['spikes', 'bastion'],
    // 规则 v5 P3 守护壁垒，只给守护。
    rampart: ['barricade', 'hunker', 'redouble', 'armor-plate', 'rebuke', 'bramble', 'juggernaut', 'bodyguard', 'phalanx'],
    // 规则 v5 P3 战士锻刃，只给战士。
    blade: ['pyre', 'ember', 'smith', 'blade-sweep', 'blade-echo', 'blade-guard', 'bloodthirst', 'refine-blade', 'furnace', 'conqueror'],
    // 规则 v5 P3 游侠猎印，只给游侠。
    quarry: ['quarry-mark', 'nock', 'snare', 'deadeye', 'rising-shot', 'skybreak'],
    ward: ['cover', 'rally', 'aegis', 'rally-draw', 'talisman'],
    restore: ['mend', 'regrow', 'reap'],
    volley: ['finisher', 'footwork', 'glance', 'chain', 'sift', 'encore', 'cull'],
    venom: ['flurry', 'venom', 'toxin', 'execute', 'venom-draw', 'flask', 'catalyst'],
    shadow: ['agility', 'gut', 'scrap', 'reflex', 'toss', 'sap', 'rupture', 'envenom', 'miasma', 'toxic-burst', 'shiv', 'shiv-edge', 'shiv-fan', 'shiv-keep', 'shiv-first', 'sleight', 'palm-off', 'garrote', 'carrion', 'bladestorm',
        'shadow-step', 'nightmare', 'grand-finale', 'storm-of-steel', 'phantom-blades', 'calculated-gamble', 'wraith-form', 'strangle'],
    hex: ['expose', 'hex', 'wail'],
    arcane: ['surge', 'adrenal', 'purge', 'echo', 'quicken', 'rhythm', 'temper', 'conflux', 'cascade'],
    conjure: ['mimic', 'forge', 'scavenge', 'replicate', 'craft-might', 'craft-guard'],
    cadence: ['fumble', 'hone', 'frenzy', 'tempo', 'serene', 'fury', 'compose', 'crescendo', 'chant', 'simmer', 'stance-ward', 'rage-flow', 'still-water', 'foretell', 'third-eye', 'sustain', 'resonance', 'curtain-call',
        'foresight-power', 'establishment', 'deva-form', 'master-reality', 'vault', 'omniscience'],
    orb: ['zap', 'chill', 'shade', 'ion-core', 'prism', 'dualcast', 'orb-loop', 'capacitor', 'attune', 'overload', 'flare', 'arc-storm', 'lock-on', 'power-spark', 'static-shell', 'orb-burst', 'amplify',
        'echo-form', 'barrage', 'multi-cast', 'biased-cognition', 'reboot', 'creative-ai', 'hologram'],
    summon: ['bone-call', 'bone-poke', 'bone-sweep', 'bone-rush', 'bone-wall', 'bone-nova', 'bone-armor', 'soul-bind', 'doom-mark', 'doom-touch', 'doom-reap', 'soul-harvest', 'soul-feast', 'soul-blight', 'void-draw', 'void-guard',
        'necro-mastery', 'oblivion', 'capture-spirit', 'dirge', 'rattle', 'end-of-days'],
    sanctum: ['absolution', 'sigil', 'phase', 'deathward', 'consecrate', 'smite', 'judgment', 'halo-strike', 'halo-mend', 'verdant', 'steady-mend', 'aftercare',
        'black-hole', 'arsenal', 'pillar-of-creation', 'genesis', 'sealed-throne', 'begone'],
});
export const ARCHETYPE_FAMILIES = Object.freeze({
    // pile（牌堆操作，规则 v5 P2b）与 general 一样所有职业可用。
    warrior: Object.freeze(['general', 'pile', 'fury', 'cleave', 'fortify', 'restore', 'blade']),
    guardian: Object.freeze(['general', 'pile', 'fortify', 'thorns', 'ward', 'rampart']),
    ranger: Object.freeze(['general', 'pile', 'cleave', 'volley', 'quarry']),
    assassin: Object.freeze(['general', 'pile', 'venom', 'shadow', 'volley']),
    mage: Object.freeze(['general', 'pile', 'cleave', 'hex', 'arcane', 'venom', 'orb']),
    priest: Object.freeze(['general', 'pile', 'ward', 'restore', 'hex', 'fortify', 'sanctum']),
    summoner: Object.freeze(['general', 'pile', 'thorns', 'ward', 'restore', 'venom', 'conjure', 'cleave', 'summon']),
    bard: Object.freeze(['general', 'pile', 'ward', 'volley', 'hex', 'arcane', 'conjure', 'cadence']),
});
export const TEMPLATE_FAMILIES = Object.freeze(Object.fromEntries(Object.entries(TEMPLATE_FAMILY_TABLE).flatMap(([family, keys]) => keys.map((key) => [key, family]))));
export const templateFamily = (key) => TEMPLATE_FAMILIES[key] ?? null;
export function templateAllowedFor(key, archetype) {
    const families = Object.hasOwn(ARCHETYPE_FAMILIES, archetype) ? ARCHETYPE_FAMILIES[archetype] : null;
    return Boolean(families && Object.hasOwn(CARD_TEMPLATES, key) && families.includes(TEMPLATE_FAMILIES[key]));
}
// 该职业允许的卡牌模板子表（未知职业为空表）。
export const templatesFor = (archetype) => Object.fromEntries(Object.entries(CARD_TEMPLATES).filter(([key]) => templateAllowedFor(key, archetype)));

(function checkTemplateFamilies() {
    const fail = (reason) => { throw new Error(`template-families-invalid:${reason}`); };
    const listed = Object.values(TEMPLATE_FAMILY_TABLE).flat();
    if (new Set(listed).size !== listed.length) fail('duplicate');
    for (const key of listed) if (!Object.hasOwn(CARD_TEMPLATES, key)) fail(`unknown:${key}`);
    for (const key of Object.keys(CARD_TEMPLATES)) if (!Object.hasOwn(TEMPLATE_FAMILIES, key)) fail(`unassigned:${key}`);
    for (const archetype of Object.keys(COMBAT_RULES.archetypes)) {
        const families = ARCHETYPE_FAMILIES[archetype];
        if (!families || !families.includes('general') || !families.every((family) => Object.hasOwn(TEMPLATE_FAMILY_TABLE, family))) fail(`archetype:${archetype}`);
        for (const key of ARCHETYPE_PREFERRED[archetype] || []) if (!templateAllowedFor(key, archetype)) fail(`preferred:${archetype}:${key}`);
        if (!templateAllowedFor(DEFAULT_HERO_SKILLS[archetype]?.[1], archetype)) fail(`hero:${archetype}`);
    }
})();


// 给提示词用的模板目录文本（每类一行）。
export function templateCatalogText() {
    const section = (title, templates, prefix) => `${title}：${Object.entries(templates).map(([key, tpl]) => `${key}=${prefix ? prefix(tpl) : ''}${tpl.label}`).join('；')}`;
    const zeroCost = Object.keys(CARD_TEMPLATES).filter((key) => solveCardTemplate(key, 0, 'common'));
    const costLimited = Object.entries(CARD_TEMPLATES).filter(([, tpl]) => tpl.costs).map(([key, tpl]) => `${key}=${tpl.costs.join('/')} 费`).join('；');
    const notHero = Object.entries(CARD_TEMPLATES).filter(([, tpl]) => !isHeroEligible(tpl)).map(([key]) => key).join(',');
    // 写「从手牌选牌」（choose）的模板：只能作为卡牌，按最小变量值构造后扫描效果树。
    const usesChoose = (effects) => (effects || []).some((effect) => effect?.mode === 'choose' || effect?.from === 'choose' || ['draw-play', 'transform-minion'].includes(effect?.op) || usesChoose(effect?.then));
    const chooseKeys = Object.entries(CARD_TEMPLATES).filter(([, tpl]) => {
        const built = tpl.build(tpl.vars.map(([min]) => min));
        return usesChoose(Array.isArray(built) ? built : built.effects);
    }).map(([key]) => key).join(',');
    const preferred = Object.entries(ARCHETYPE_PREFERRED).map(([key, list]) => `${key}=${list.join(',')}`).join('；');
    return [
        section('卡牌模板', CARD_TEMPLATES, (tpl) => `${{ attack: '攻击', skill: '技能', power: '能力' }[tpl.type]}·`),
        `0 费槽可用的卡牌模板：${zeroCost.join(',')}`,
        `限定费用的卡牌模板（只放在费用相符的位置；X 费模板可放在 1–3 费的位置，由程序改为 X 费）：${costLimited}`,
        `不能用作人物技能（skill）的卡牌模板：${notHero}`,
        `需要选牌的卡牌模板（抽牌堆选择由独立候选列表显示，其余选择手牌；只能作为卡牌；托管及自动打出的内层选牌由程序按策略处理）：${chooseKeys}`,
        `各职业原型优先选用的卡牌模板（复合效果优先，单一效果补位）：${preferred}`,
        section('被动模板', PASSIVE_TEMPLATES),
        section('华而不实被动模板（只用于人物特性与装备被动，名称可起得气派，效果几乎没用）', FLAIR_PASSIVE_TEMPLATES),
        section('技能模板', SKILL_TEMPLATES),
        section('道具模板', ITEM_TEMPLATES),
    ].join('\n');
}
