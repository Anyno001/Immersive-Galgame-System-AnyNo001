// 卡牌/被动/技能/道具模板库：模板只描述「形状」，数值由 solveCardTemplate 按费用与稀有度的价值窗口反解。
// 所有模板对象冻结，整局共享；对外返回的牌/效果一律是新对象，调用方可随意修改。
import { COMBAT_RULES, estimateCardValue, estimateEffectsValue, evaluateCardBudget, rarityWindow } from './rules.js';

// ---- 效果构造器（返回新对象，目标缺省值见各函数）----
const damage = (amount, target = 'enemy', hits = 1) => ({ op: 'damage', amount, hits, target });
const block = (amount, target = 'self') => ({ op: 'block', amount, target });
const heal = (amount, target = 'self') => ({ op: 'heal', amount, target });
const status = (name, stacks, target) => ({ op: 'status', status: name, stacks, target });
const draw = (amount) => ({ op: 'draw', amount });
const energy = (amount) => ({ op: 'energy', amount });
const exhaustSelf = () => ({ op: 'exhaust-self' });
const conditional = (kind, value, then) => ({ op: 'conditional', when: { kind, value }, then });
const discardRandom = (amount) => ({ op: 'discard', amount, mode: 'random' });
const discardChoose = (amount) => ({ op: 'discard', amount, mode: 'choose' });
const copyChosen = (amount, to) => ({ op: 'copy', amount, from: 'choose', to });
const discardHandRedraw = () => ({ op: 'discard-hand', redraw: true });
const copySelf = (amount, to) => ({ op: 'copy', amount, from: 'self', to });
const create = (card, amount) => ({ op: 'create', card, amount, to: 'hand' });
const repeatLast = (amount) => ({ op: 'repeat-last', amount });
const replayNext = (amount, cardType) => ({ op: 'replay-next', amount, cardType });
const grow = (amount) => ({ op: 'grow', amount });
const costMod = (amount, mode, scope) => ({ op: 'cost-mod', amount: -amount, mode, scope });
const buff = (trigger, turns, then, cardType) => ({ op: 'buff', trigger, ...(cardType ? { cardType } : {}), turns, then });
const eachTurn = (then, at) => ({ op: 'each-turn', then, ...(at ? { at } : {}) });
const cleanse = (target = 'self') => ({ op: 'cleanse', target });

// 效果的「主数值」：用来过滤掉数值为 0 的效果。
function primaryNumber(effect) {
    switch (effect.op) {
        case 'status':
            return effect.stacks;
        case 'conditional':
        case 'each-turn':
        case 'buff':
            return effect.then.length ? primaryNumber(effect.then[0]) : 0;
        case 'exhaust-self':
        case 'discard-hand':
            return 1;
        case 'cost-mod':
            return -effect.amount;
        default:
            return effect.amount;
    }
}
const keepPositive = (effects) => (effects || []).filter((effect) => primaryNumber(effect) > 0);

// 定义一个卡牌模板。vars 是各变量的 [最小, 最大]；prefer 是首效果占总价值的偏好比例；
// builder 接收变量值，返回效果数组，或 { effects, onDiscard }。extra 可带 costs / hero / flags / onDiscard。
const template = (type, label, vars, prefer, builder, extra = {}) => Object.freeze({
    type, label, vars, prefer, ...extra,
    build: (values) => {
        const built = builder(values);
        return Array.isArray(built) ? keepPositive(built) : { effects: keepPositive(built.effects), onDiscard: keepPositive(built.onDiscard) };
    },
});

export const CARD_TEMPLATES = Object.freeze({
    strike: template('attack', '单体伤害', [[1, 40]], 1, ([a]) => [damage(a)]),
    twin: template('attack', '两段伤害', [[1, 20]], 1, ([a]) => [damage(a, 'enemy', 2)]),
    flurry: template('attack', '三段伤害', [[1, 12]], 1, ([a]) => [damage(a, 'enemy', 3)]),
    sweep: template('attack', '全体伤害', [[1, 30]], 1, ([a]) => [damage(a, 'all-enemies')]),
    scatter: template('attack', '随机敌人三段伤害', [[1, 12]], 1, ([a]) => [damage(a, 'random-enemy', 3)]),
    bash: template('attack', '伤害+格挡', [[1, 30], [1, 20]], 0.6, ([a, b]) => [damage(a), block(b)]),
    cripple: template('attack', '伤害+虚弱', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), status('weak', b, 'enemy')]),
    rend: template('attack', '伤害+易伤', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), status('vulnerable', b, 'enemy')]),
    venom: template('attack', '伤害+中毒', [[1, 30], [1, 6]], 0.7, ([a, b]) => [damage(a), status('poison', b, 'enemy')]),
    quick: template('attack', '伤害+抽 1 张', [[1, 30], [1, 1]], 0.5, ([a, b]) => [damage(a), draw(b)]),
    guard: template('skill', '格挡', [[1, 40]], 1, ([a]) => [block(a)]),
    brace: template('skill', '格挡+抽 1 张', [[1, 30], [1, 1]], 0.5, ([a, b]) => [block(a), draw(b)]),
    mend: template('skill', '治疗+格挡', [[1, 20], [1, 20]], 0.6, ([a, b]) => [heal(a), block(b)]),
    cover: template('skill', '为一名队友格挡', [[1, 40]], 1, ([a]) => [block(a, 'ally')]),
    rally: template('skill', '全体队友格挡', [[1, 30]], 1, ([a]) => [block(a, 'all-allies')]),
    expose: template('skill', '易伤+格挡', [[1, 4], [1, 20]], 0.6, ([a, b]) => [status('vulnerable', a, 'enemy'), block(b)]),
    hex: template('skill', '全体虚弱+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [status('weak', a, 'all-enemies'), block(b)]),
    toxin: template('skill', '中毒+格挡', [[1, 10], [1, 20]], 0.6, ([a, b]) => [status('poison', a, 'enemy'), block(b)]),
    surge: template('skill', '能量 1 点+格挡', [[1, 1], [1, 20]], 0.7, ([a, b]) => [energy(a), block(b)]),
    prepare: template('skill', '抽牌+格挡', [[1, 2], [1, 20]], 0.5, ([a, b]) => [draw(a), block(b)]),
    might: template('power', '攻击力+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [status('strength', a, 'self'), block(b)]),
    agility: template('power', '防御力+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [status('dexterity', a, 'self'), block(b)]),
    spikes: template('power', '荆棘+格挡', [[1, 6], [1, 20]], 0.6, ([a, b]) => [status('thorns', a, 'self'), block(b)]),
    regrow: template('power', '再生+格挡', [[1, 6], [1, 20]], 0.6, ([a, b]) => [status('regen', a, 'self'), block(b)]),
    shatter: template('attack', '伤害+易伤+虚弱', [[1, 30], [1, 3], [1, 3]], 0.6, ([a, b, c]) => [damage(a), status('vulnerable', b, 'enemy'), status('weak', c, 'enemy')]),
    thunder: template('attack', '全体伤害+全体易伤', [[1, 20], [1, 2]], 0.7, ([a, b]) => [damage(a, 'all-enemies'), status('vulnerable', b, 'all-enemies')]),
    jab: template('attack', '小伤害+虚弱（适合 0 费）', [[1, 6], [1, 1]], 0.6, ([a, b]) => [damage(a), status('weak', b, 'enemy')]),
    reap: template('attack', '全体伤害+自身回复', [[1, 20], [1, 10]], 0.7, ([a, b]) => [damage(a, 'all-enemies'), heal(b)]),
    execute: template('attack', '伤害；目标易伤时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('target-has', 'vulnerable', [damage(b)])]),
    desperate: template('attack', '伤害；自身生命低于一半时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('self-hp-below', 50, [damage(b)])]),
    finisher: template('attack', '伤害；本回合已出 3 张牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('cards-played-gte', 3, [damage(b)])]),
    'venom-draw': template('attack', '伤害+中毒+抽 1 张', [[1, 20], [1, 6], [1, 1]], 0.5, ([a, b, c]) => [damage(a), status('poison', b, 'enemy'), draw(c)]),
    trip: template('skill', '格挡+虚弱', [[1, 20], [1, 3]], 0.6, ([a, b]) => [block(a), status('weak', b, 'enemy')]),
    wail: template('skill', '全体虚弱+全体易伤', [[1, 3], [1, 3]], 0.5, ([a, b]) => [status('weak', a, 'all-enemies'), status('vulnerable', b, 'all-enemies')]),
    flask: template('skill', '全体中毒', [[1, 8]], 1, ([a]) => [status('poison', a, 'all-enemies')]),
    adrenal: template('skill', '能量+抽牌，用后消耗', [[1, 2], [1, 2]], 0.5, ([a, b]) => [energy(a), draw(b), exhaustSelf()]),
    bulwark: template('skill', '大量格挡，用后消耗', [[1, 60]], 1, ([a]) => [block(a), exhaustSelf()]),
    aegis: template('skill', '为一名队友格挡+回复', [[1, 20], [1, 15]], 0.6, ([a, b]) => [block(a, 'ally'), heal(b, 'ally')]),
    'rally-draw': template('skill', '全体队友格挡+抽 1 张', [[1, 20], [1, 1]], 0.6, ([a, b]) => [block(a, 'all-allies'), draw(b)]),
    counter: template('skill', '格挡+虚弱；自身生命低于一半时追加格挡', [[1, 20], [1, 2], [1, 20]], 0.5, ([a, b, c]) => [block(a), status('weak', b, 'enemy'), conditional('self-hp-below', 50, [block(c)])]),
    inflame: template('power', '大量攻击力', [[1, 6]], 1, ([a]) => [status('strength', a, 'self')]),
    bastion: template('power', '再生+荆棘', [[1, 6], [1, 6]], 0.5, ([a, b]) => [status('regen', a, 'self'), status('thorns', b, 'self')]),
    footwork: template('power', '防御力+抽 1 张', [[1, 3], [1, 1]], 0.7, ([a, b]) => [status('dexterity', a, 'self'), draw(b)]),
    glance: template('attack', '伤害；被丢弃时抽 1 张', [[1, 30]], 1, ([a]) => [damage(a)], { onDiscard: [draw(1)] }),
    gut: template('attack', '伤害；本回合已弃过牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('discarded-gte', 1, [damage(b)])]),
    fleeting: template('attack', '高伤害，虚无（回合结束仍在手中则消耗）', [[1, 40]], 1, ([a]) => [damage(a)], { flags: { ethereal: true } }),
    mimic: template('attack', '伤害，复制本牌加入弃牌堆（不能 0 费）', [[1, 30]], 1, ([a]) => [damage(a), copySelf(1, 'discard')], { costs: [1, 2, 3], hero: false }),
    chain: template('attack', '伤害；本回合已打出过同名牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('same-card-gte', 1, [damage(b)])], { hero: false }),
    rampage: template('attack', '伤害，本场每打出一次本牌伤害提高', [[1, 30], [1, 5]], 0.7, ([a, b]) => [damage(a), grow(b)], { hero: false }),
    momentum: template('attack', '伤害；本回合已出 2 张攻击牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('attacks-played-gte', 2, [damage(b)])]),
    whirl: template('attack', 'X 费：每点能量对全体敌人造成一次伤害', [[1, 20]], 1, ([a]) => [damage(a, 'all-enemies')], { costs: ['X'] }),
    hone: template('attack', '伤害，本场本牌费用 -1（不能 0 费）', [[1, 30]], 1, ([a]) => [damage(a), costMod(1, 'self', 'combat')], { costs: [1, 2, 3], hero: false }),
    sift: template('skill', '抽牌后随机弃 1 张，并获得格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [draw(a), discardRandom(1), block(b)]),
    purge: template('skill', '弃掉全部手牌再抽同样张数，并获得格挡', [[1, 30]], 1, ([a]) => [discardHandRedraw(), block(a)]),
    scrap: template('skill', '随机弃 1 张牌，获得能量', [[1, 2]], 1, ([a]) => [discardRandom(1), energy(a)], { costs: [0, 1] }),
    reflex: template('skill', '不能打出（0 费）；被丢弃时抽牌并获得格挡', [[1, 2], [0, 10]], 0.8, ([a, b]) => ({ effects: [], onDiscard: [draw(a), block(b)] }), { flags: { unplayable: true }, costs: [0] }),
    opener: template('skill', '固有（开战就在手牌中）：格挡+抽 1 张', [[1, 30], [1, 1]], 0.6, ([a, b]) => [block(a), draw(b)], { flags: { innate: true } }),
    echo: template('skill', '重复本回合上一张牌的效果，并获得格挡', [[1, 20]], 1, ([a]) => [repeatLast(1), block(a)]),
    encore: template('skill', '本回合下一张攻击牌多结算 1 次，并获得格挡', [[1, 20]], 1, ([a]) => [replayNext(1, 'attack'), block(a)]),
    quicken: template('skill', '本回合随机 1 张手牌费用 -1，并获得格挡', [[1, 20]], 1, ([a]) => [costMod(1, 'random', 'turn'), block(a)]),
    forge: template('skill', '生成「碎刃」（0 费小伤害）加入手牌', [[1, 3]], 1, ([a]) => [create('token-shard', a)], { costs: [0, 1] }),
    talisman: template('skill', '生成「护符」（0 费格挡）加入手牌', [[1, 3]], 1, ([a]) => [create('token-ward', a)], { costs: [0, 1, 2] }),
    frenzy: template('skill', '数回合内，每打出一张攻击牌获得格挡', [[1, 3], [1, 6]], 1, ([a, b]) => [buff('card-played', a, [block(b)], 'attack')]),
    rhythm: template('skill', '数回合内，每打出一张技能牌对随机敌人造成伤害', [[1, 3], [1, 8]], 1, ([a, b]) => [buff('card-played', a, [damage(b, 'random-enemy')], 'skill')]),
    scavenge: template('skill', '数回合内，每弃一张牌获得格挡', [[1, 3], [1, 8]], 1, ([a, b]) => [buff('discard', a, [block(b)])]),
    xguard: template('skill', 'X 费：每点能量获得一次格挡', [[1, 20]], 1, ([a]) => [block(a)], { costs: ['X'] }),
    plating: template('power', '每回合结束时获得格挡', [[1, 12]], 1, ([a]) => [eachTurn([block(a)], 'turn-end')]),
    cull: template('skill', '抽牌后从手牌选 1 张弃掉，并获得格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [draw(a), discardChoose(1), block(b)], { hero: false }),
    toss: template('attack', '伤害；从手牌选 1 张弃掉', [[1, 30]], 1, ([a]) => [damage(a), discardChoose(1)], { hero: false }),
    replicate: template('skill', '从手牌选 1 张复制（本场临时牌）加入手牌，并获得格挡（不能 0 费）', [[1, 20]], 1, ([a]) => [copyChosen(1, 'hand'), block(a)], { costs: [1, 2, 3], hero: false }),
    temper: template('skill', '从手牌选 1 张本回合费用 -1，并获得格挡（不能 0 费）', [[1, 20]], 1, ([a]) => [costMod(1, 'choose', 'turn'), block(a)], { costs: [1, 2, 3], hero: false }),
});

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
});

// 复合效果的技能模板键（供选型时优先）。
export const COMPOSITE_SKILL_KEYS = Object.freeze(['drain', 'gash', 'sunder', 'guard-strike', 'ward', 'warcry', 'leech', 'plague', 'punish', 'crush', 'barb', 'steady', 'absolve', 'detonate']);
// 卡牌可选费用（X 以外）。
export const TEMPLATE_COSTS = Object.freeze([0, 1, 2, 3]);

// 模板允许的费用列表（新数组）；模板不存在返回空数组。
export function templateCosts(key) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    return tpl ? [...(tpl.costs || TEMPLATE_COSTS)] : [];
}

// ---- 数值反解 ----
const EPSILON = 1e-9;
const clone = (value) => JSON.parse(JSON.stringify(value));

// 枚举变量取值的全部组合；minimums 给出各变量的下限（升级时不得低于基础值）。
function enumerateValues(vars, minimums = []) {
    let combos = [[]];
    vars.forEach(([min, max], index) => {
        const next = [];
        for (const combo of combos) for (let v = Math.max(min, minimums[index] ?? min); v <= max; v += 1) next.push([...combo, v]);
        combos = next;
    });
    return combos;
}

// 按变量值构造模板并估值：返回效果、牌形状、总价值，以及首效果占总价值的比例 share。
function evaluateTemplate(tpl, values) {
    const built = tpl.build(values);
    const effects = Array.isArray(built) ? built : built.effects;
    const onDiscard = Array.isArray(built) ? tpl.onDiscard : built.onDiscard;
    const shape = { ...(tpl.flags || {}), effects, ...(onDiscard?.length ? { onDiscard: clone(onDiscard) } : {}) };
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
        if (!accept(evaluated.total)) continue;
        const score = Math.abs(evaluated.total - target) / target + (tpl.vars.length > 1 ? Math.abs(evaluated.share - tpl.prefer) : 0);
        if (!best || score < best.score - EPSILON) best = { v: values, score, ...evaluated };
    }
    return best;
}

const solveCache = new Map();

// 为 (模板, 费用, 稀有度) 反解一张牌：基础数值落在稀有度价值窗口内，并尽量带一个更强的升级版。
// 无解返回 null；结果缓存，每次返回深拷贝。
export function solveCardTemplate(key, cost, rarity) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(cost)) return null;
    const cacheKey = `${key}|${cost}|${rarity}`;
    if (!solveCache.has(cacheKey)) {
        const window = rarityWindow(cost, rarity);
        const base = window ? bestCombo(tpl, enumerateValues(tpl.vars), window.target, (total) => total >= window.min - EPSILON && total <= window.max + EPSILON) : null;
        let result = null;
        if (base) {
            const upgradeCap = window.max * COMBAT_RULES.upgradeAllowance;
            const upgradeTarget = Math.min(upgradeCap, base.total + window.budget * 0.25);
            // 升级版：各变量不低于基础值，总价值严格高于基础且不超过上限；不可打出的牌没有升级。
            const upgrade = tpl.flags?.unplayable ? null : bestCombo(tpl, enumerateValues(tpl.vars, base.v), upgradeTarget, (total) => total > base.total + EPSILON && total <= upgradeCap + EPSILON);
            const plain = { type: tpl.type, ...base.shape };
            const candidate = { cost, rarity, ...base.shape, ...(upgrade ? { upgraded: { effects: upgrade.effects } } : {}) };
            if (evaluateCardBudget(candidate).ok) result = { ...plain, ...(upgrade ? { upgraded: { effects: upgrade.effects } } : {}) };
            else if (upgrade && evaluateCardBudget({ cost, rarity, ...base.shape }).ok) result = plain;
        }
        solveCache.set(cacheKey, result);
    }
    const cached = solveCache.get(cacheKey);
    return cached ? clone(cached) : null;
}

// 用调用方给定的变量值直接生成一张牌，并校验。成功 { card }，失败 { error, detail }。
export function cardFromValues(key, cost, rarity, values) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(cost)) return { error: 'template-unsolvable', detail: { cost, rarity } };
    if (!Array.isArray(values) || values.length !== tpl.vars.length) return { error: 'values-length', detail: { expected: tpl.vars.length } };
    const ranges = tpl.vars.map((range) => [...range]);
    if (values.some((v, i) => !Number.isInteger(v) || v < tpl.vars[i][0] || v > tpl.vars[i][1])) return { error: 'values-out-of-range', detail: { ranges } };
    const window = rarityWindow(cost, rarity);
    if (!window) return { error: 'template-unsolvable', detail: { cost, rarity } };
    const base = evaluateTemplate(tpl, values);
    if (base.total < window.min - EPSILON || base.total > window.max + EPSILON) return { error: 'values-out-of-window', detail: { cost, rarity } };
    const upgradeCap = window.max * COMBAT_RULES.upgradeAllowance;
    const upgradeTarget = Math.min(upgradeCap, base.total + window.budget * 0.25);
    const upgrade = tpl.flags?.unplayable ? null : bestCombo(tpl, enumerateValues(tpl.vars, values), upgradeTarget, (total) => total > base.total + EPSILON && total <= upgradeCap + EPSILON);
    const plain = { type: tpl.type, ...base.shape };
    if (upgrade && evaluateCardBudget({ cost, rarity, ...base.shape, upgraded: { effects: upgrade.effects } }).ok) return { card: clone({ ...plain, upgraded: { effects: upgrade.effects } }) };
    return evaluateCardBudget({ cost, rarity, ...base.shape }).ok ? { card: clone(plain) } : { error: 'values-out-of-window', detail: { cost, rarity } };
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

// 按倍率放大效果数值：层数封顶 10，回复封顶 60，其余封顶 99；向上取整。
const scaleUp = (effects, factor) => effects.map((effect) => (effect.op === 'status'
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
const isHeroEligible = (tpl) => !!tpl && tpl.hero !== false && !tpl.flags && !tpl.onDiscard && (!tpl.costs || tpl.costs.includes(COMBAT_RULES.heroSkillCost));
// 可用于特性主动技能的模板键。
export const TRAIT_SKILL_TEMPLATE_KEYS = Object.freeze(Object.keys(CARD_TEMPLATES).filter((key) => {
    const tpl = CARD_TEMPLATES[key];
    return tpl.hero !== false && !tpl.flags && !tpl.onDiscard;
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

// 给提示词用的模板目录文本（每类一行）。
export function templateCatalogText() {
    const section = (title, templates, prefix) => `${title}：${Object.entries(templates).map(([key, tpl]) => `${key}=${prefix ? prefix(tpl) : ''}${tpl.label}`).join('；')}`;
    const zeroCost = Object.keys(CARD_TEMPLATES).filter((key) => solveCardTemplate(key, 0, 'common'));
    const costLimited = Object.entries(CARD_TEMPLATES).filter(([, tpl]) => tpl.costs).map(([key, tpl]) => `${key}=${tpl.costs.join('/')} 费`).join('；');
    const notHero = Object.entries(CARD_TEMPLATES).filter(([, tpl]) => !isHeroEligible(tpl)).map(([key]) => key).join(',');
    const preferred = Object.entries(ARCHETYPE_PREFERRED).map(([key, list]) => `${key}=${list.join(',')}`).join('；');
    return [
        section('卡牌模板', CARD_TEMPLATES, (tpl) => `${{ attack: '攻击', skill: '技能', power: '能力' }[tpl.type]}·`),
        `0 费槽可用的卡牌模板：${zeroCost.join(',')}`,
        `限定费用的卡牌模板（只放在费用相符的位置；X 费模板可放在 1–3 费的位置，由程序改为 X 费）：${costLimited}`,
        `不能用作人物技能（skill）的卡牌模板：${notHero}`,
        `各职业原型优先选用的卡牌模板（复合效果优先，单一效果补位）：${preferred}`,
        section('被动模板', PASSIVE_TEMPLATES),
        section('华而不实被动模板（只用于人物特性与装备被动，名称可起得气派，效果几乎没用）', FLAIR_PASSIVE_TEMPLATES),
        section('技能模板', SKILL_TEMPLATES),
        section('道具模板', ITEM_TEMPLATES),
    ].join('\n');
}
