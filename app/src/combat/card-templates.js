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
const delayedCounter = (amount, mult) => ({ op: 'delayed-counter', amount, mult, target: 'enemy' });
const mutualDamage = (amount) => ({ op: 'mutual-damage', amount, target: 'enemy' });
const randomBranch = (a, b) => ({ op: 'random-branch', a, b });
const damageFromBlock = (target = 'enemy') => ({ op: 'damage-from-block', target });
const selfDamage = (amount) => ({ op: 'self-damage', amount });
const doubleStat = (stat, target) => ({ op: 'double', stat, target });
const nextTurn = (gain, amount) => ({ op: 'next-turn', gain, amount });
// 本回合全体手牌减费：amount 为减少的点数（存为负数）。
const handCost = (amount) => ({ op: 'hand-cost', amount: -amount });
const heavy = (amount, scale) => ({ op: 'damage', amount, hits: 1, target: 'enemy', strengthScale: scale });
// 规则 v5 登记算子（mechanics/）：施加通用状态、吸取。
const applyStatus = (name, stacks, target) => ({ op: 'apply-status', status: name, stacks, target });
const drain = (amount, target = 'enemy', hits = 1) => ({ op: 'drain', amount, hits, target });
// 规则 v5 P2b 牌堆操作。
const search = (amount, cardType) => ({ op: 'search', amount, ...(cardType ? { cardType } : {}) });
const retrieve = (amount, from) => ({ op: 'retrieve', amount, from });
const topdeck = (amount, mode) => ({ op: 'topdeck', amount, mode });
const recur = (to) => ({ op: 'recur', to });
const exhaustOther = (amount, from, mode) => ({ op: 'exhaust-other', amount, from, mode });
const copyNext = (amount, from) => ({ op: 'copy-next', amount, from });
const discover = () => ({ op: 'discover' });
const transmute = (amount, mode) => ({ op: 'transmute', amount, mode });
const upgradeCard = (amount, mode) => ({ op: 'upgrade-card', amount, mode });
// 规则 v5 P2c 能量与免费出牌。
const energyDouble = () => ({ op: 'energy-double' });
const freeNext = (amount, cardType) => ({ op: 'free-next', amount, ...(cardType ? { cardType } : {}) });
// 规则 v5 P2e 永久成长与击杀奖励（跨战斗保留，写账本 battle-growth）。
const evolve = (stat, amount) => ({ op: 'evolve', stat, amount });
const bounty = (reward, amount) => ({ op: 'bounty', reward, ...(reward === 'upgrade' ? {} : { amount }) });
// 规则 v5 P3 战士锻刃（mechanics/forge.js）。
const smith = (amount) => ({ op: 'smith', amount });
const honeBlade = (mode, amount) => ({ op: 'hone-blade', mode, ...(mode === 'guard' ? { amount } : {}) });
// 规则 v5 P3 刺客毒与暗刃（mechanics/shadow.js）。
const poisonTick = (amount, target = 'enemy') => ({ op: 'poison-tick', amount, target });
const shiv = (amount) => ({ op: 'shiv', amount });
const honeShiv = (mode, amount) => ({ op: 'hone-shiv', mode, ...(mode === 'edge' || mode === 'first' ? { amount } : {}) });
// 规则 v5 P3 游侠引弦（mechanics/quarry.js）。
const loose = () => ({ op: 'loose' });
// 规则 v5 P3 祈司圣辉（mechanics/sanctum.js）。
const radianceGain = (amount) => ({ op: 'radiance', amount });
// 规则 v5 P3 乐师心境、乐势、预知与加演（mechanics/cadence.js）。
const enterStance = (stance) => ({ op: 'enter-stance', stance });
const momentumGain = (amount) => ({ op: 'momentum', amount });
const foresee = (amount) => ({ op: 'foresee', amount });
const encore = () => ({ op: 'curtain-call' });
// 规则 v5 P3 法师法珠与专注（mechanics/orb.js）。
const orbChannel = (orb, amount = 1) => ({ op: 'channel', orb, amount });
const orbEvoke = (amount) => ({ op: 'evoke', amount });
const orbPulse = (amount) => ({ op: 'orb-pulse', amount });
const orbSlot = (amount) => ({ op: 'orb-slot', amount });
const orbFocus = (amount) => ({ op: 'focus', amount });
// 规则 v5 P3 召唤随从、灾厄与魂牌（mechanics/summon.js）。
const summonOp = (amount) => ({ op: 'summon', amount });
const minionStrike = (amount, target = 'enemy', bonus) => ({ op: 'minion-strike', amount, target, ...(bonus ? { bonus } : {}) });
const sacrificeOp = (mode) => ({ op: 'sacrifice', mode });
const soulOp = (amount) => ({ op: 'soul', amount });

// 效果的「主数值」：用来过滤掉数值为 0 的效果。
function primaryNumber(effect) {
    switch (effect.op) {
        case 'status':
        case 'apply-status':
            return effect.stacks;
        case 'conditional':
        case 'each-turn':
        case 'buff':
            return effect.then.length ? primaryNumber(effect.then[0]) : 0;
        case 'random-branch':
            return Math.max(0, ...[...effect.a, ...effect.b].map(primaryNumber));
        case 'exhaust-self':
        case 'discard-hand':
        case 'damage-from-block':
        case 'double':
        case 'cleanse':
        case 'recur':
        case 'discover':
        case 'energy-double':
        case 'loose':
        case 'enter-stance':
        case 'curtain-call':
        case 'sacrifice':
            return 1;
        case 'bounty':
            return effect.reward === 'upgrade' ? 1 : effect.amount;
        case 'hone-blade':
            return effect.mode === 'guard' ? effect.amount : 1;
        case 'hone-shiv':
            return effect.mode === 'edge' || effect.mode === 'first' ? effect.amount : 1;
        case 'focus':
            return Math.abs(effect.amount);
        case 'cost-mod':
        case 'hand-cost':
            return -effect.amount;
        default:
            return effect.amount;
    }
}
const keepPositive = (effects) => (effects || []).filter((effect) => primaryNumber(effect) > 0);

// 定义一个卡牌模板。vars 是各变量的 [最小, 最大]；prefer 是首效果占总价值的偏好比例；
// builder 接收变量值，返回效果数组，或 { effects, onDiscard }。extra 可带 costs / hero / flags / onDiscard / minRarity。
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
    lure: template('attack', '自损生命，下回合按倍数反击（对方意图被指定时落空）', [[1, 12]], 1, ([a]) => [delayedCounter(a, 2)]),
    tear: template('attack', '对目标与自身同时造成等量伤害', [[1, 40]], 1, ([a]) => [mutualDamage(a)]),
    fumble: template('attack', '随机：无效果，或造成高额伤害', [[1, 40]], 1, ([a]) => [randomBranch([], [damage(a)])]),
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
    slam: template('attack', '获得格挡，再造成等同当前格挡的伤害', [[1, 20]], 1, ([a]) => [block(a), damageFromBlock()], { hero: false }),
    entrench: template('skill', '获得格挡，再使自身格挡翻倍', [[1, 20]], 1, ([a]) => [block(a), doubleStat('block', 'self')]),
    bloodlet: template('skill', '抽牌，失去少量生命', [[1, 3], [1, 6]], 1.4, ([a, b]) => [draw(a), selfDamage(b)]),
    bloodrush: template('skill', '获得能量，失去少量生命', [[1, 2], [1, 8]], 1.4, ([a, b]) => [energy(a), selfDamage(b)], { costs: [0, 1] }),
    bloodrage: template('power', '获得攻击力，失去少量生命', [[1, 4], [1, 10]], 1.4, ([a, b]) => [status('strength', a, 'self'), selfDamage(b)]),
    overdrive: template('skill', '获得攻击力，再使自身攻击力翻倍，用后消耗', [[1, 3]], 1, ([a]) => [status('strength', a, 'self'), doubleStat('strength', 'self'), exhaustSelf()]),
    'heavy-blade': template('attack', '重击：攻击力加成 ×3', [[1, 30]], 1, ([a]) => [heavy(a, 3)]),
    catalyst: template('skill', '施加中毒，再使目标中毒层数翻倍', [[1, 8]], 1, ([a]) => [status('poison', a, 'enemy'), doubleStat('poison', 'enemy')]),
    sap: template('attack', '伤害+脆弱（目标获得的格挡减少）', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), status('frail', b, 'enemy')]),
    foresight: template('skill', '格挡，下回合多抽牌', [[1, 20], [1, 2]], 0.5, ([a, b]) => [block(a), nextTurn('draw', b)]),
    reserve: template('skill', '格挡，下回合多获得能量', [[1, 20], [1, 2]], 0.5, ([a, b]) => [block(a), nextTurn('energy', b)]),
    steadfast: template('skill', '保留（回合结束不被弃掉）：格挡', [[1, 40]], 1, ([a]) => [block(a)], { flags: { retain: true } }),
    trance: template('skill', '抽牌，获得 1 层禁抽（本回合不能再抽；层数回合结束减 1，叠加会延续到下回合）', [[1, 4]], 1, ([a]) => [draw(a), status('no-draw', 1, 'self')]),
    conflux: template('skill', '本回合全体手牌费用 -1，并抽牌（限稀有以上）', [[1, 1], [1, 2]], 0.5, ([a, b]) => [handCost(a), draw(b)], { minRarity: 'rare' }),
    cascade: template('attack', '伤害；本回合已出 2 张技能牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('skills-played-gte', 2, [damage(b)])]),
    tempo: template('skill', '格挡；自身有防御力时追加抽 1 张', [[1, 20], [1, 1]], 0.7, ([a, b]) => [block(a), conditional('self-has', 'dexterity', [draw(b)])]),
    absolution: template('skill', '净化全体队友的减益，并获得格挡', [[1, 20]], 1, ([a]) => [cleanse('all-allies'), block(a)]),
    sigil: template('skill', '获得人工制品（抵消下一次减益）+格挡', [[1, 2], [1, 20]], 0.6, ([a, b]) => [status('artifact', a, 'self'), block(b)]),
    phase: template('skill', '获得 1 层无实体（受伤降为 1）+格挡，用后消耗（限史诗以上）', [[1, 20]], 1, ([a]) => [status('intangible', 1, 'self'), block(a), exhaustSelf()], { minRarity: 'epic' }),
    deathward: template('skill', '获得保命（首次致死保留 1 生命）+格挡，用后消耗（限史诗以上）', [[1, 20]], 1, ([a]) => [status('endure', 1, 'self'), block(a), exhaustSelf()], { minRarity: 'epic' }),
    // 规则 v5 P2a：通用状态与伤害（G01–G07、G21）。
    battlecry: template('skill', '本回合临时攻击力（回合结束撤销）+格挡', [[1, 6], [1, 20]], 0.6, ([a, b]) => [applyStatus('flex', a, 'self'), block(b)]),
    stance: template('skill', '本回合临时防御力（回合结束撤销）+抽 1 张', [[1, 6], [1, 1]], 0.7, ([a, b]) => [applyStatus('poise', a, 'self'), draw(b)]),
    disarm: template('attack', '伤害+攻击力下降', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), applyStatus('atk-down', b, 'enemy')]),
    breach: template('attack', '伤害+防御力下降', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), applyStatus('def-down', b, 'enemy')]),
    'wind-up': template('skill', '蓄势（下一次攻击每段额外加伤）+格挡', [[1, 8], [1, 20]], 0.6, ([a, b]) => [applyStatus('vigor', a, 'self'), block(b)]),
    fervor: template('skill', '接下来 N 次攻击伤害翻倍', [[1, 2]], 1, ([a]) => [applyStatus('empower', a, 'self')]),
    zenith: template('power', '数回合内攻击伤害翻倍（限稀有以上）', [[1, 2]], 1, ([a]) => [applyStatus('empower-turns', a, 'self')], { minRarity: 'rare' }),
    apex: template('skill', '下一次攻击伤害 ×3，用后消耗（限稀有以上）', [[1, 1]], 1, ([a]) => [applyStatus('overpower', a, 'self'), exhaustSelf()], { minRarity: 'rare' }),
    ambush: template('power', '先手（每回合第一张攻击牌伤害 +50%）+格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [applyStatus('first-strike', a, 'self'), block(b)]),
    lifeguard: template('skill', '护命（抵消接下来的失去生命，按次消耗）+格挡', [[1, 2], [1, 20]], 0.6, ([a, b]) => [applyStatus('buffer', a, 'self'), block(b)]),
    siphon: template('attack', '吸取：伤害，并按实际扣除的生命回复', [[1, 30]], 1, ([a]) => [drain(a)]),
    spite: template('power', '恶意：每成功施加一次减益，对目标造成伤害', [[1, 4]], 1, ([a]) => [applyStatus('malice', a, 'self')]),
    // 规则 v5 P2b：牌堆操作（G08–G15）。
    scout: template('skill', '从抽牌堆检索 1 张牌加入手牌+格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [search(a), block(b)]),
    hunt: template('skill', '从抽牌堆检索 1 张攻击牌加入手牌+格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [search(a, 'attack'), block(b)]),
    salvage: template('skill', '从弃牌堆取回 1 张牌加入手牌+格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [retrieve(a, 'discard'), block(b)]),
    exhume: template('skill', '从消耗堆取回 1 张牌加入手牌+格挡，用后消耗（限史诗以上）', [[1, 1], [1, 30]], 0.5, ([a, b]) => [retrieve(a, 'exhaust'), block(b), exhaustSelf()], { minRarity: 'epic' }),
    stack: template('skill', '从手牌选 1 张放到抽牌堆顶，并获得格挡', [[1, 1], [1, 20]], 0.3, ([a, b]) => [topdeck(a, 'choose'), block(b)], { hero: false }),
    boomerang: template('attack', '伤害，打出后放回抽牌堆顶', [[1, 30]], 1, ([a]) => [damage(a), recur('top')], { hero: false }),
    rebound: template('attack', '伤害；本回合已出 2 张牌时打出后回到手牌（不能 0 费）', [[1, 30]], 1, ([a]) => [damage(a), conditional('cards-played-gte', 2, [recur('hand')])], { costs: [1, 2, 3], hero: false }),
    purify: template('skill', '从手牌选 1 张消耗，并获得格挡', [[1, 1], [1, 20]], 0.3, ([a, b]) => [exhaustOther(a, 'hand', 'choose'), block(b)], { hero: false }),
    cinder: template('skill', '随机消耗抽牌堆的牌，并获得格挡', [[1, 2], [1, 20]], 0.3, ([a, b]) => [exhaustOther(a, 'draw', 'random'), block(b)]),
    reprise: template('skill', '格挡；下回合开始时把本牌的临时副本加入手牌', [[1, 1], [1, 20]], 0.5, ([a, b]) => [copyNext(a, 'self'), block(b)], { hero: false }),
    glimpse: template('skill', '从卡组随机三张中挑 1 张作为临时牌加入手牌，并获得格挡', [[1, 20]], 0.5, ([a]) => [discover(), block(a)]),
    morph: template('skill', '本场把选中的 1 张手牌变成卡组里的另一张牌，并获得格挡', [[1, 1], [1, 20]], 0.3, ([a, b]) => [transmute(a, 'choose'), block(b)], { hero: false }),
    refine: template('skill', '本场升级选中的 1 张手牌，并获得格挡', [[1, 1], [1, 20]], 0.4, ([a, b]) => [upgradeCard(a, 'choose'), block(b)], { hero: false }),
    polish: template('skill', '本场随机升级手牌，并获得格挡', [[1, 2], [1, 20]], 0.4, ([a, b]) => [upgradeCard(a, 'random'), block(b)]),
    // 规则 v5 P2c：重演、狡黠、免费出牌与能量扩展（G16–G19）。
    reverb: template('attack', '重演 1：伤害，打出时整张额外执行 1 次（限稀有以上）', [[1, 20]], 1, ([a]) => [damage(a)], { flags: { replay: 1 }, minRarity: 'rare', hero: false }),
    resound: template('skill', '重演 1：格挡，打出时整张额外执行 1 次（限稀有以上）', [[1, 20]], 1, ([a]) => [block(a)], { flags: { replay: 1 }, minRarity: 'rare', hero: false }),
    gambit: template('attack', '狡黠：伤害；被效果弃掉时免费打出', [[1, 30]], 1, ([a]) => [damage(a)], { flags: { sly: true }, hero: false }),
    feint: template('skill', '狡黠：格挡+抽 1 张；被效果弃掉时免费打出', [[1, 20], [1, 1]], 0.7, ([a, b]) => [block(a), draw(b)], { flags: { sly: true }, hero: false }),
    quickdraw: template('skill', '下一张攻击牌免费打出，并获得格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [freeNext(a, 'attack'), block(b)]),
    flow: template('power', '每回合前 N 张牌免费打出（限神话）', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('freeplay', a, 'self'), block(b)], { minRarity: 'mythic' }),
    generator: template('power', '充能：每回合开始额外获得能量（限史诗以上）', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('dynamo', a, 'self'), block(b)], { minRarity: 'epic' }),
    hoard: template('power', '蓄能：回合结束时未用完的能量留到下回合', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('conserve', a, 'self'), block(b)]),
    overcharge: template('skill', '能量翻倍，并获得格挡，用后消耗（限稀有以上）', [[0, 20]], 1, ([a]) => [energyDouble(), block(a), exhaustSelf()], { minRarity: 'rare' }),
    xdraw: template('skill', 'X 费：每点能量抽 1 张牌并获得格挡', [[1, 1], [0, 20]], 1, ([a, b]) => [draw(a), block(b)], { costs: ['X'] }),
    xforge: template('skill', 'X 费：每点能量生成 1 张「碎刃」加入手牌并获得格挡', [[1, 1], [0, 20]], 1, ([a, b]) => [create('token-shard', a), block(b)], { costs: ['X'] }),
    // 规则 v5 P2d：G22 新条件、L06 回合结束多保留手牌。
    interrupt: template('attack', '伤害；目标意图为攻击时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('target-intent-attack', undefined, [damage(b)])]),
    coup: template('attack', '伤害；目标生命低于一半时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('target-hp-below', 50, [damage(b)])]),
    brim: template('skill', '格挡；手牌不少于 4 张时追加格挡', [[1, 30], [1, 30]], 0.6, ([a, b]) => [block(a), conditional('hand-gte', 4, [block(b)])]),
    ashen: template('attack', '伤害；本场已消耗 3 张牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('exhausted-gte', 3, [damage(b)])]),
    linger: template('skill', '格挡；本回合结束时多保留 1 张手牌', [[1, 20], [1, 1]], 0.7, ([a, b]) => [block(a), { op: 'retain-hand', amount: b }]),
    // 规则 v5 P2e：G24 永久成长、G25 击杀奖励（成长按卡牌 ID 记账、同名副本共享；需要出牌实例，不作人物技能）。
    whetstone: template('attack', '伤害；打出后本牌伤害永久提高', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), evolve('damage', b)], { hero: false }),
    carapace: template('skill', '格挡；打出后本牌格挡永久提高', [[1, 30], [1, 3]], 0.7, ([a, b]) => [block(a), evolve('block', b)], { hero: false }),
    trophy: template('attack', '伤害；本牌击倒非爪牙敌人时最大生命永久提高', [[1, 30], [1, 5]], 0.8, ([a, b]) => [damage(a), bounty('hp-max', b)], { hero: false }),
    // 规则 v5 P3 守护「壁垒」（rampart 族，只给守护）：D01–D08；状态结算见 mechanics/rampart.js。
    barricade: template('power', '固守：格挡本场不再清空，并获得格挡（限史诗以上）', [[1, 1], [0, 30]], 1, ([a, b]) => [applyStatus('barricade', a, 'self'), block(b)], { minRarity: 'epic' }),
    hunker: template('skill', '接下来数回合格挡不清空，并获得格挡', [[1, 3], [1, 20]], 0.5, ([a, b]) => [applyStatus('retain-block', a, 'self'), block(b)]),
    redouble: template('skill', '本回合前几次获得格挡翻倍，并获得格挡', [[1, 2], [1, 20]], 0.5, ([a, b]) => [applyStatus('block-surge', a, 'self'), block(b)]),
    'armor-plate': template('power', '甲层：回合结束获得等于层数的格挡；受到未格挡的攻击伤害时减 1 层', [[1, 10]], 1, ([a]) => [applyStatus('plated', a, 'self')]),
    rebuke: template('skill', '反震：到自身下回合前，被格挡掉的攻击伤害反射给攻击者，并获得格挡', [[1, 1], [1, 20]], 0.4, ([a, b]) => [applyStatus('recoil', a, 'self'), block(b)]),
    bramble: template('skill', '临时荆棘：到自身下回合前每次受击反伤，并获得格挡', [[1, 10], [1, 20]], 0.5, ([a, b]) => [applyStatus('bramble', a, 'self'), block(b)]),
    juggernaut: template('power', '坚壁反击：每次获得格挡时对随机敌人造成伤害', [[1, 5]], 1, ([a]) => [applyStatus('juggernaut', a, 'self')]),
    bodyguard: template('skill', '掩护：到自身下回合前，指向队友的单体攻击改由自己承受，并获得格挡', [[1, 1], [1, 20]], 0.3, ([a, b]) => [applyStatus('cover', a, 'self'), block(b)]),
    phalanx: template('power', '共盾：自己获得格挡时，其余队友获得一半', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('share-block', a, 'self'), block(b)]),
    // 规则 v5 P3 战士：W02 战意、W03 血祭（fury 族）；W04 焚身与余烬、W05 锻刃、W06 嗜血（blade 族，只给战士）。
    warpath: template('power', '战意：每回合开始获得攻击力', [[1, 2]], 1, ([a]) => [eachTurn([status('strength', a, 'self')])]),
    bloodoath: template('skill', '血祭：本回合每次失去生命时获得攻击力，并失去少量生命', [[1, 2], [1, 6]], 1.4, ([a, b]) => [buff('hp-loss', 1, [status('strength', a, 'self')]), selfDamage(b)]),
    pyre: template('power', '焚身：技能牌 0 费，但打出后消耗（限史诗以上）', [[1, 1]], 1, ([a]) => [applyStatus('pyre', a, 'self')], { minRarity: 'epic' }),
    ember: template('power', '余烬：每消耗一张牌获得格挡', [[1, 6]], 1, ([a]) => [applyStatus('ember', a, 'self')]),
    smith: template('skill', '锻造：锻刃伤害提高（本场首次锻造把锻刃加入手牌）', [[1, 6]], 1, ([a]) => [smith(a)]),
    'blade-sweep': template('skill', '锻刃改为攻击全体敌人，并获得格挡', [[0, 20]], 1, ([a]) => [honeBlade('aoe'), block(a)], { hero: false }),
    'blade-echo': template('skill', '锻刃获得重演 1，并获得格挡（限稀有以上）', [[0, 20]], 1, ([a]) => [honeBlade('replay'), block(a)], { minRarity: 'rare', hero: false }),
    'blade-guard': template('skill', '锻刃打出时另获得格挡', [[1, 20]], 1, ([a]) => [honeBlade('guard', a)], { hero: false }),
    bloodthirst: template('skill', '嗜血：本回合攻击牌按实际扣除的生命回复，并获得格挡', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('bloodthirst', a, 'self'), block(b)]),
    // 规则 v5 P3 刺客：A01–A09（shadow 族，只给刺客）；A10 脆弱沿用 sap。
    rupture: template('skill', '施加中毒，再让目标立即按中毒层数结算一次（层数不减）', [[1, 8]], 1, ([a]) => [status('poison', a, 'enemy'), poisonTick(1)]),
    envenom: template('power', '淬刃：每段未被格挡的攻击伤害施加中毒', [[1, 5]], 1, ([a]) => [applyStatus('envenom', a, 'self')]),
    miasma: template('power', '毒雾：每回合开始全体敌人中毒', [[1, 4]], 1, ([a]) => [eachTurn([status('poison', a, 'all-enemies')])]),
    'toxic-burst': template('power', '毒爆：每施毒 3 次对全体敌人造成伤害', [[1, 10]], 1, ([a]) => [applyStatus('venom-burst', a, 'self')]),
    shiv: template('skill', '把数张暗刃（0 费、打出后消耗的攻击牌）加入手牌', [[1, 3]], 1, ([a]) => [shiv(a)]),
    'shiv-edge': template('skill', '暗刃伤害提高，并获得格挡', [[1, 6], [0, 20]], 0.6, ([a, b]) => [honeShiv('edge', a), block(b)], { hero: false }),
    'shiv-fan': template('skill', '暗刃改为攻击全体敌人，并获得格挡（限稀有以上）', [[0, 20]], 1, ([a]) => [honeShiv('fan'), block(a)], { minRarity: 'rare', hero: false }),
    'shiv-keep': template('skill', '暗刃获得保留，并获得格挡', [[0, 20]], 1, ([a]) => [honeShiv('keep'), block(a)], { hero: false }),
    'shiv-first': template('skill', '每回合第一张暗刃伤害提高', [[1, 10]], 1, ([a]) => [honeShiv('first', a)], { hero: false }),
    sleight: template('skill', '数回合内每弃一张牌对随机敌人造成伤害，并随机弃 1 张牌', [[1, 3], [1, 10]], 1, ([a, b]) => [buff('discard', a, [damage(b, 'random-enemy')]), discardRandom(1)]),
    'palm-off': template('skill', '数回合内每弃一张牌使随机一张手牌本回合费用 -1，并获得格挡', [[1, 3], [0, 20]], 0.6, ([a, b]) => [buff('discard', a, [costMod(1, 'random', 'turn')]), block(b)]),
    garrote: template('skill', '扼喉：本回合每打出一张牌，目标失去生命，并获得格挡', [[1, 5], [0, 20]], 0.6, ([a, b]) => [applyStatus('garrote', a, 'enemy'), block(b)]),
    carrion: template('attack', '尸裂：带此状态的敌人倒下时按其最大生命的比例伤害其他敌人，并造成伤害', [[1, 2], [1, 30]], 0.4, ([a, b]) => [applyStatus('carrion', a, 'enemy'), damage(b)]),
    bladestorm: template('power', '千刃：每打出一张牌对全体敌人造成伤害', [[1, 2]], 1, ([a]) => [applyStatus('bladestorm', a, 'self')]),
    // 规则 v5 P3 游侠：R01–R04（quarry 族，只给游侠）；R05 牌库顶操控沿用 pile 族；R06 破空随 P4 E02 飞行实施。
    'quarry-mark': template('attack', '伤害+猎印（叠在敌人身上，引弦时令其失去生命）', [[1, 30], [1, 10]], 0.6, ([a, b]) => [damage(a), applyStatus('hunt-mark', b, 'enemy')]),
    nock: template('attack', '引弦：伤害；所有带猎印的敌人失去等于层数的生命', [[1, 30]], 1, ([a]) => [damage(a), loose()]),
    snare: template('attack', '伤害+迟滞（攻击者本回合每已打出一张牌，目标受到的攻击伤害 +10%）', [[1, 30], [1, 2]], 0.7, ([a, b]) => [damage(a), applyStatus('snare', b, 'enemy')]),
    deadeye: template('power', '专精先手：每回合前数张攻击牌伤害 +50%', [[1, 3]], 1, ([a]) => [applyStatus('deadeye', a, 'self')]),
    'rising-shot': template('skill', '连段：本回合每次攻击命中后，之后的攻击伤害提高，并获得格挡', [[1, 3], [0, 20]], 0.5, ([a, b]) => [applyStatus('combo-rise', a, 'self'), block(b)]),
    // 规则 v5 P4 R06 破空（mechanics/foe.js 结算，quarry 族只给游侠）。
    skybreak: template('power', '破空：多段攻击命中飞行敌人时，每段额外计 1 次命中，并获得格挡', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('skybreaker', a, 'self'), block(b)]),
    // 规则 v5 P3 祈司：P01 圣辉、P02 圣辉联动、P04 群体再生与不衰减回复、P05 战后回复（sanctum 族，只给祈司）；P03、P06 沿用 absolution、sigil、phase、deathward。
    consecrate: template('skill', '获得圣辉（跨回合保留），并获得格挡', [[1, 3], [0, 20]], 0.6, ([a, b]) => [radianceGain(a), block(b)]),
    smite: template('attack', '圣辉 2：高额伤害（另需 2 点圣辉）', [[1, 50]], 1, ([a]) => [damage(a)], { flags: { radiance: 2 } }),
    judgment: template('attack', '圣辉 X：花光圣辉，每点造成一次伤害', [[1, 20]], 1, ([a]) => [damage(a)], { flags: { radiance: 'X' } }),
    'halo-strike': template('power', '辉击：每次获得或消耗圣辉，对生命最低的敌人造成伤害', [[1, 6]], 1, ([a]) => [applyStatus('halo-strike', a, 'self')]),
    'halo-mend': template('power', '辉愈：每次获得或消耗圣辉，回复生命', [[1, 4]], 1, ([a]) => [applyStatus('halo-mend', a, 'self')]),
    verdant: template('skill', '全体友方获得再生，并获得格挡', [[1, 4], [0, 20]], 0.6, ([a, b]) => [status('regen', a, 'all-allies'), block(b)]),
    'steady-mend': template('power', '恒愈：每回合开始回复固定生命（不随回合衰减）', [[1, 5]], 1, ([a]) => [applyStatus('steady-mend', a, 'self')]),
    aftercare: template('power', '战后回复：战斗胜利后回复生命（不在战斗内生效），并获得格挡', [[1, 10], [0, 20]], 0.6, ([a, b]) => [applyStatus('after-mend', a, 'self'), block(b)]),
    // 规则 v5 P3 乐师：B01 心境、B02 乐势、B03 乐势来源、B04 心境联动、B05 预知、B06 保留减费、B07 回响、B08 加演（cadence 族，只给乐师）；B09 沿用 fumble。
    serene: template('skill', '进入静心（离开时获得 2 点能量），并获得格挡', [[0, 30]], 1, ([a]) => [enterStance('calm'), block(a)]),
    fury: template('attack', '伤害，并进入怒意（造成与受到的攻击伤害 ×2）', [[1, 30]], 1, ([a]) => [damage(a), enterStance('wrath')]),
    compose: template('skill', '回到中立心境，并获得格挡', [[1, 30]], 1, ([a]) => [block(a), enterStance('neutral')]),
    crescendo: template('skill', '获得乐势（累计 10 点进入神临：+3 能量，攻击伤害 ×3，下回合开始退出），并获得格挡', [[1, 5], [0, 20]], 0.6, ([a, b]) => [momentumGain(a), block(b)]),
    chant: template('power', '吟诵：每回合开始获得乐势', [[1, 3]], 1, ([a]) => [applyStatus('chant', a, 'self')]),
    simmer: template('power', '酝怒：下回合开始进入怒意，并获得格挡', [[1, 1], [0, 20]], 0.5, ([a, b]) => [applyStatus('seethe', a, 'self'), block(b)]),
    'stance-ward': template('power', '心盾：每次切换心境时获得格挡', [[1, 6]], 1, ([a]) => [applyStatus('stance-ward', a, 'self')]),
    'rage-flow': template('power', '怒思：每次进入怒意时抽牌', [[1, 2]], 1, ([a]) => [applyStatus('wrath-draw', a, 'self')]),
    'still-water': template('power', '止水：回合结束仍在静心时获得格挡', [[1, 10]], 1, ([a]) => [applyStatus('calm-guard', a, 'self')]),
    foretell: template('skill', '预知：查看抽牌堆顶数张，弃掉其中无用的牌（不触发弃牌收益），并获得格挡', [[1, 5], [0, 20]], 0.5, ([a, b]) => [foresee(a), block(b)]),
    'third-eye': template('power', '观兆：每次预知时获得格挡', [[1, 6]], 1, ([a]) => [applyStatus('scry-ward', a, 'self')]),
    sustain: template('power', '余韵：被保留到下回合的手牌费用 -1（限稀有以上）', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('keep-discount', a, 'self'), block(b)], { minRarity: 'rare' }),
    resonance: template('power', '回响：每回合前数张牌多执行一次（限神话）', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('echo-play', a, 'self'), block(b)], { minRarity: 'mythic', hero: false }),
    'curtain-call': template('skill', '加演：本回合结束后立即再行动一次，敌人不动（每场一次），用后消耗（限史诗以上）', [[0, 20]], 1, ([a]) => [encore(), block(a), exhaustSelf()], { minRarity: 'epic', hero: false }),
    // 规则 v5 P3 法师：M01 法珠槽、M02 五种法珠、M03 专注、M04 多重引发与额外触发、M05 雷暴、M06 锁定、M07 法珠触发、M08 能力牌重复（orb 族，只给法师）；全体减费沿用 conflux。
    zap: template('attack', '伤害，并凝结 1 颗雷珠（回合结束打随机敌人，引发时伤害更高）', [[1, 20], [1, 1]], 0.6, ([a, b]) => [damage(a), orbChannel('lightning', b)]),
    chill: template('skill', '凝结霜珠（回合结束获得格挡），并获得格挡', [[1, 2], [0, 20]], 0.6, ([a, b]) => [orbChannel('frost', a), block(b)]),
    shade: template('skill', '凝结蚀珠（每回合蓄积伤害，引发时打生命最低的敌人），并获得格挡', [[1, 1], [0, 20]], 0.6, ([a, b]) => [orbChannel('dark', a), block(b)]),
    'ion-core': template('skill', '凝结源珠（回合开始获得 1 点能量），并获得格挡（限稀有以上）', [[1, 1], [0, 20]], 0.6, ([a, b]) => [orbChannel('plasma', a), block(b)], { minRarity: 'rare' }),
    prism: template('skill', '凝结晶珠（回合结束打全体敌人，逐次递减），并获得格挡（限稀有以上）', [[1, 1], [0, 20]], 0.6, ([a, b]) => [orbChannel('glass', a), block(b)], { minRarity: 'rare' }),
    dualcast: template('skill', '引发最前一颗法珠数次，并获得格挡', [[1, 3], [0, 20]], 0.6, ([a, b]) => [orbEvoke(a), block(b)]),
    'orb-loop': template('skill', '最前一颗法珠的被动额外触发数次（不引发），并获得格挡', [[1, 2], [0, 20]], 0.6, ([a, b]) => [orbPulse(a), block(b)]),
    capacitor: template('power', '法珠槽增加（至多 10 槽），并获得格挡', [[1, 2], [0, 20]], 0.6, ([a, b]) => [orbSlot(a), block(b)]),
    attune: template('power', '获得专注（法珠数值提高，源珠除外），并获得格挡', [[1, 3], [0, 20]], 0.6, ([a, b]) => [orbFocus(a), block(b)]),
    overload: template('skill', '获得能量，失去 1 点专注', [[1, 2], [1, 1]], 1, ([a, b]) => [energy(a), orbFocus(-b)], { costs: [0] }),
    flare: template('skill', '本回合临时专注，并获得格挡', [[1, 4], [0, 20]], 0.6, ([a, b]) => [applyStatus('flux', a, 'self'), block(b)]),
    'arc-storm': template('power', '雷暴：雷珠改为攻击全体敌人（限稀有以上）', [[1, 1]], 1, ([a]) => [applyStatus('arc-storm', a, 'self')], { minRarity: 'rare' }),
    'lock-on': template('attack', '伤害+锁定（目标受雷珠、蚀珠伤害 +50%）', [[1, 20], [1, 2]], 0.7, ([a, b]) => [damage(a), applyStatus('lock-on', b, 'enemy')]),
    'power-spark': template('power', '雷心：每打出一张能力牌凝结 1 颗雷珠', [[1, 1]], 1, ([a]) => [applyStatus('storm-heart', a, 'self')]),
    'static-shell': template('power', '静电：每次受到未被格挡的攻击伤害凝结 1 颗雷珠', [[1, 1]], 1, ([a]) => [applyStatus('static-shell', a, 'self')]),
    'orb-burst': template('power', '雷涌：引发雷珠时追加伤害', [[1, 6]], 1, ([a]) => [applyStatus('arc-boost', a, 'self')]),
    amplify: template('skill', '下一张能力牌多执行一次，并获得格挡', [[1, 1], [0, 20]], 0.6, ([a, b]) => [replayNext(a, 'power'), block(b)]),
    // 规则 v5 P3 召唤：S01 随从、S02 随从攻击、S03 随从转化、S04 灾厄、S05 灾厄来源、S06 魂牌、S07 虚无联动（summon 族，只给召唤）；S08 造牌联动归 conjure 族。
    'bone-call': template('skill', '召唤随从（依附于你，替你承受攻击伤害），并获得格挡', [[1, 10], [0, 20]], 0.6, ([a, b]) => [summonOp(a), block(b)]),
    'bone-poke': template('attack', '随从攻击：随从造成伤害（随从不在时无效）', [[1, 20]], 1, ([a]) => [minionStrike(a)]),
    'bone-sweep': template('attack', '随从攻击：随从对全体敌人造成伤害（随从不在时无效）', [[1, 12]], 1, ([a]) => [minionStrike(a, 'all-enemies')]),
    'bone-rush': template('attack', '随从攻击：伤害追加随从当前生命（限稀有以上）', [[1, 10]], 1, ([a]) => [minionStrike(a, 'enemy', 'hp')], { minRarity: 'rare' }),
    'bone-wall': template('skill', '牺牲随从：获得等于其最大生命 2 倍的格挡', [[0, 20]], 1, ([a]) => [sacrificeOp('block'), block(a)]),
    'bone-nova': template('skill', '牺牲随从：对全体敌人造成等于其最大生命的伤害（限稀有以上）', [[0, 20]], 1, ([a]) => [sacrificeOp('nova'), block(a)], { minRarity: 'rare' }),
    'bone-armor': template('power', '骨甲：随从攻击伤害提高', [[1, 6]], 1, ([a]) => [applyStatus('minion-might', a, 'self')]),
    'soul-bind': template('power', '魂契：随从失去生命时，全体敌人失去等量生命（限史诗以上）', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('minion-bond', a, 'self'), block(b)], { minRarity: 'epic' }),
    'doom-mark': template('skill', '施加灾厄（敌人回合结束时生命不高于灾厄则倒下），并获得格挡', [[1, 20], [0, 20]], 0.6, ([a, b]) => [applyStatus('doom', a, 'enemy'), block(b)]),
    'doom-touch': template('power', '缠厄：每打出一张指定敌人的牌，给目标灾厄', [[1, 4]], 1, ([a]) => [applyStatus('doom-touch', a, 'self')]),
    'doom-reap': template('power', '噬厄：攻击造成伤害时给目标等量灾厄（限史诗以上）', [[1, 1]], 1, ([a]) => [applyStatus('doom-reap', a, 'self')], { minRarity: 'epic' }),
    'soul-harvest': template('skill', '把魂牌（0 费、抽 1 张、打出后消耗）加入手牌', [[1, 3]], 1, ([a]) => [soulOp(a)]),
    'soul-feast': template('power', '噬魂：每打出一张魂牌召唤随从', [[1, 3]], 1, ([a]) => [applyStatus('soul-feast', a, 'self')]),
    'soul-blight': template('power', '魂蚀：每打出一张魂牌，随机敌人失去生命', [[1, 6]], 1, ([a]) => [applyStatus('soul-blight', a, 'self')]),
    'void-draw': template('power', '虚引：抽到虚无牌时再抽 1 张', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('void-draw', a, 'self'), block(b)]),
    'void-guard': template('power', '虚护：打出虚无牌时获得格挡', [[1, 6]], 1, ([a]) => [applyStatus('void-guard', a, 'self')]),
    'craft-might': template('power', '匠力：每生成一张临时牌获得攻击力（限稀有以上）', [[1, 1]], 1, ([a]) => [applyStatus('craft-might', a, 'self')], { minRarity: 'rare' }),
    'craft-guard': template('power', '匠盾：每生成一张临时牌获得格挡', [[1, 6]], 1, ([a]) => [applyStatus('craft-guard', a, 'self')]),
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
// 模板的稀有度下限（extra.minRarity）：personal 与 uncommon 同级，signature 与 epic 同级。
const RARITY_RANK = Object.freeze({ basic: 0, common: 1, uncommon: 2, personal: 2, rare: 3, epic: 4, signature: 4, mythic: 5 });
const meetsMinRarity = (tpl, rarity) => !tpl.minRarity || (RARITY_RANK[rarity] ?? -1) >= RARITY_RANK[tpl.minRarity];

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
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(cost) || !meetsMinRarity(tpl, rarity)) return null;
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
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(cost) || !meetsMinRarity(tpl, rarity)) return { error: 'template-unsolvable', detail: { cost, rarity } };
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
    pile: ['scout', 'hunt', 'salvage', 'exhume', 'stack', 'boomerang', 'rebound', 'purify', 'cinder', 'reprise', 'glimpse', 'morph', 'refine', 'polish'],
    fury: ['shatter', 'desperate', 'inflame', 'tear', 'fleeting', 'rampage', 'momentum', 'whirl', 'bloodlet', 'bloodrush', 'bloodrage', 'overdrive', 'heavy-blade', 'warpath', 'bloodoath'],
    cleave: ['sweep', 'scatter', 'thunder'],
    fortify: ['bulwark', 'counter', 'lure', 'xguard', 'plating', 'slam', 'entrench'],
    thorns: ['spikes', 'bastion'],
    // 规则 v5 P3 守护壁垒，只给守护。
    rampart: ['barricade', 'hunker', 'redouble', 'armor-plate', 'rebuke', 'bramble', 'juggernaut', 'bodyguard', 'phalanx'],
    // 规则 v5 P3 战士锻刃，只给战士。
    blade: ['pyre', 'ember', 'smith', 'blade-sweep', 'blade-echo', 'blade-guard', 'bloodthirst'],
    // 规则 v5 P3 游侠猎印，只给游侠。
    quarry: ['quarry-mark', 'nock', 'snare', 'deadeye', 'rising-shot', 'skybreak'],
    ward: ['cover', 'rally', 'aegis', 'rally-draw', 'talisman'],
    restore: ['mend', 'regrow', 'reap'],
    volley: ['finisher', 'footwork', 'glance', 'chain', 'sift', 'encore', 'cull'],
    venom: ['flurry', 'venom', 'toxin', 'execute', 'venom-draw', 'flask', 'catalyst'],
    shadow: ['agility', 'gut', 'scrap', 'reflex', 'toss', 'sap', 'rupture', 'envenom', 'miasma', 'toxic-burst', 'shiv', 'shiv-edge', 'shiv-fan', 'shiv-keep', 'shiv-first', 'sleight', 'palm-off', 'garrote', 'carrion', 'bladestorm'],
    hex: ['expose', 'hex', 'wail'],
    arcane: ['surge', 'adrenal', 'purge', 'echo', 'quicken', 'rhythm', 'temper', 'conflux', 'cascade'],
    conjure: ['mimic', 'forge', 'scavenge', 'replicate', 'craft-might', 'craft-guard'],
    cadence: ['fumble', 'hone', 'frenzy', 'tempo', 'serene', 'fury', 'compose', 'crescendo', 'chant', 'simmer', 'stance-ward', 'rage-flow', 'still-water', 'foretell', 'third-eye', 'sustain', 'resonance', 'curtain-call'],
    orb: ['zap', 'chill', 'shade', 'ion-core', 'prism', 'dualcast', 'orb-loop', 'capacitor', 'attune', 'overload', 'flare', 'arc-storm', 'lock-on', 'power-spark', 'static-shell', 'orb-burst', 'amplify'],
    summon: ['bone-call', 'bone-poke', 'bone-sweep', 'bone-rush', 'bone-wall', 'bone-nova', 'bone-armor', 'soul-bind', 'doom-mark', 'doom-touch', 'doom-reap', 'soul-harvest', 'soul-feast', 'soul-blight', 'void-draw', 'void-guard'],
    sanctum: ['absolution', 'sigil', 'phase', 'deathward', 'consecrate', 'smite', 'judgment', 'halo-strike', 'halo-mend', 'verdant', 'steady-mend', 'aftercare'],
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
    const usesChoose = (effects) => (effects || []).some((effect) => effect?.mode === 'choose' || effect?.from === 'choose' || usesChoose(effect?.then));
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
        `从手牌选牌的卡牌模板（只能作为卡牌；人物技能、特性主动技能、敌人与队友技能都不能用，托管出牌时由程序按策略选牌）：${chooseKeys}`,
        `各职业原型优先选用的卡牌模板（复合效果优先，单一效果补位）：${preferred}`,
        section('被动模板', PASSIVE_TEMPLATES),
        section('华而不实被动模板（只用于人物特性与装备被动，名称可起得气派，效果几乎没用）', FLAIR_PASSIVE_TEMPLATES),
        section('技能模板', SKILL_TEMPLATES),
        section('道具模板', ITEM_TEMPLATES),
    ].join('\n');
}
