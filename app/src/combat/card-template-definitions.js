// 纯模板定义：生成与来源校验共用，不依赖规则、schema 或机制注册入口。
const damage = (amount, target = 'enemy', hits = 1) => ({ op: 'damage', amount, hits, target });
const block = (amount, target = 'self') => ({ op: 'block', amount, target });
const heal = (amount, target = 'self') => ({ op: 'heal', amount, target });
const status = (name, stacks, target) => ({ op: 'status', status: name, stacks, target });
const draw = amount => ({ op: 'draw', amount });
const energy = amount => ({ op: 'energy', amount });
const exhaustSelf = () => ({ op: 'exhaust-self' });
const conditional = (kind, value, then) => ({ op: 'conditional', when: { kind, value }, then });
const discardRandom = amount => ({ op: 'discard', amount, mode: 'random' });
const discardChoose = amount => ({ op: 'discard', amount, mode: 'choose' });
const copyChosen = (amount, to) => ({ op: 'copy', amount, from: 'choose', to });
const discardHandRedraw = () => ({ op: 'discard-hand', redraw: true });
const copySelf = (amount, to) => ({ op: 'copy', amount, from: 'self', to });
const create = (card, amount) => ({ op: 'create', card, amount, to: 'hand' });
const repeatLast = amount => ({ op: 'repeat-last', amount });
const replayNext = (amount, cardType) => ({ op: 'replay-next', amount, cardType });
const grow = amount => ({ op: 'grow', amount });
const costMod = (amount, mode, scope) => ({ op: 'cost-mod', amount: -amount, mode, scope });
const buff = (trigger, turns, then, cardType) => ({ op: 'buff', trigger, ...(cardType ? { cardType } : {}), turns, then });
const eachTurn = (then, at) => ({ op: 'each-turn', then, ...(at ? { at } : {}) });
const cleanse = (target = 'self') => ({ op: 'cleanse', target });
const delayedCounter = (amount, mult) => ({ op: 'delayed-counter', amount, mult, target: 'enemy' });
const mutualDamage = amount => ({ op: 'mutual-damage', amount, target: 'enemy' });
const randomBranch = (a, b) => ({ op: 'random-branch', a, b });
const damageFromBlock = (target = 'enemy') => ({ op: 'damage-from-block', target });
const selfDamage = amount => ({ op: 'self-damage', amount });
const doubleStat = (stat, target) => ({ op: 'double', stat, target });
const nextTurn = (gain, amount) => ({ op: 'next-turn', gain, amount });
const handCost = amount => ({ op: 'hand-cost', amount: -amount });
const heavy = (amount, scale) => ({ op: 'damage', amount, hits: 1, target: 'enemy', strengthScale: scale });
const applyStatus = (name, stacks, target) => ({ op: 'apply-status', status: name, stacks, target });
const drain = (amount, target = 'enemy', hits = 1) => ({ op: 'drain', amount, hits, target });
const search = (amount, cardType) => ({ op: 'search', amount, ...(cardType ? { cardType } : {}) });
const retrieve = (amount, from, to) => ({ op: 'retrieve', amount, from, ...(to ? { to } : {}) });
const topdeck = (amount, mode) => ({ op: 'topdeck', amount, mode });
const recur = to => ({ op: 'recur', to });
const exhaustOther = (amount, from, mode) => ({ op: 'exhaust-other', amount, from, mode });
const copyNext = (amount, from) => ({ op: 'copy-next', amount, from });
const discover = () => ({ op: 'discover' });
const transmute = (amount, mode) => ({ op: 'transmute', amount, mode });
const upgradeCard = (amount, mode) => ({ op: 'upgrade-card', amount, mode });
const energyDouble = () => ({ op: 'energy-double' });
const freeNext = (amount, cardType) => ({ op: 'free-next', amount, ...(cardType ? { cardType } : {}) });
const evolve = (stat, amount) => ({ op: 'evolve', stat, amount });
const bounty = (reward, amount) => ({ op: 'bounty', reward, ...(reward === 'upgrade' ? {} : { amount }) });
const smith = amount => ({ op: 'smith', amount });
const honeBlade = (mode, amount) => ({ op: 'hone-blade', mode, ...(mode === 'guard' ? { amount } : {}) });
const poisonTick = (amount, target = 'enemy') => ({ op: 'poison-tick', amount, target });
const shiv = amount => ({ op: 'shiv', amount });
const honeShiv = (mode, amount) => ({ op: 'hone-shiv', mode, ...(mode === 'edge' || mode === 'first' ? { amount } : {}) });
const loose = () => ({ op: 'loose' });
const radianceGain = amount => ({ op: 'radiance', amount });
const enterStance = stance => ({ op: 'enter-stance', stance });
const momentumGain = amount => ({ op: 'momentum', amount });
const foresee = amount => ({ op: 'foresee', amount });
const encore = () => ({ op: 'curtain-call' });

const orbChannel = (orb, amount = 1) => ({ op: 'channel', orb, amount });
const orbEvoke = amount => ({ op: 'evoke', amount });
const orbPulse = amount => ({ op: 'orb-pulse', amount });
const orbSlot = amount => ({ op: 'orb-slot', amount });
const orbFocus = amount => ({ op: 'focus', amount });
const summonOp = amount => ({ op: 'summon', amount });
const minionStrike = (amount, target = 'enemy', bonus) => ({ op: 'minion-strike', amount, target, ...(bonus ? { bonus } : {}) });
const sacrificeOp = mode => ({ op: 'sacrifice', mode });
const soulOp = amount => ({ op: 'soul', amount });

export function primaryNumber(effect) {
    switch (effect.op) {
        case 'status': case 'apply-status': return effect.stacks;
        case 'conditional': case 'each-turn': case 'buff': case 'on-event': return effect.then.length ? primaryNumber(effect.then[0]) : 0;
        case 'random-branch': return Math.max(0, ...[...effect.a, ...effect.b].map(primaryNumber));
        case 'draw-play': return effect.times;
        case 'evoke-x': return 1;
        case 'delay-attack': case 'extra-turn': case 'discard-shivs': case 'transform-minion':
        case 'blade-double': return 1;
        case 'exhaust-self': case 'discard-hand': case 'damage-from-block': case 'double': case 'cleanse':
        case 'recur': case 'discover': case 'energy-double': case 'loose': case 'enter-stance':
        case 'curtain-call': case 'sacrifice': return 1;
        case 'bounty': return effect.reward === 'upgrade' ? 1 : effect.amount;
        case 'hone-blade': return effect.mode === 'guard' ? effect.amount : 1;
        case 'hone-shiv': return effect.mode === 'edge' || effect.mode === 'first' ? effect.amount : 1;
        case 'focus': return Math.abs(effect.amount);
        case 'cost-mod': case 'hand-cost': return -effect.amount;
        default: return effect.amount;
    }
}
const keepPositive = effects => (effects || []).filter(effect => primaryNumber(effect) > 0);
const template = (type, label, vars, prefer, builder, extra = {}) => Object.freeze({
    type, label, vars, prefer, ...extra,
    build: values => {
        const built = builder(values);
        return Array.isArray(built) ? keepPositive(built) : { effects: keepPositive(built.effects), onDiscard: keepPositive(built.onDiscard) };
    },
});
export const TEMPLATE_COSTS = Object.freeze([0, 1, 2, 3]);
export const TEMPLATE_BUILDERS = Object.freeze({ damage, block, heal, status, draw, energy, applyStatus, cleanse });

export function templateCardFace(tpl, values) {
    const built = tpl.build(values);
    const effects = Array.isArray(built) ? built : built.effects;
    const onDiscard = Array.isArray(built) ? tpl.onDiscard : built.onDiscard;
    return { type: tpl.type, ...(tpl.flags || {}), effects,
        ...(onDiscard?.length ? { onDiscard: structuredClone(onDiscard) } : {}) };
}

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
    scout: template('skill', '从抽牌堆检索 1 张牌加入手牌+格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [search(a), block(b)]),
    hunt: template('skill', '从抽牌堆检索 1 张攻击牌加入手牌+格挡', [[1, 1], [1, 20]], 0.5, ([a, b]) => [search(a, 'attack'), block(b)]),
    headbutt: template('attack', '头槌：伤害；将弃牌堆的 1 张牌放到抽牌堆顶', [[1, 30]], 1, ([a]) => [damage(a), retrieve(1, 'discard', 'top')], { costs: [1, 2, 3], hero: false }),
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
    interrupt: template('attack', '伤害；目标意图为攻击时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('target-intent-attack', undefined, [damage(b)])]),
    coup: template('attack', '伤害；目标生命低于一半时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('target-hp-below', 50, [damage(b)])]),
    brim: template('skill', '格挡；手牌不少于 4 张时追加格挡', [[1, 30], [1, 30]], 0.6, ([a, b]) => [block(a), conditional('hand-gte', 4, [block(b)])]),
    ashen: template('attack', '伤害；本场已消耗 3 张牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [damage(a), conditional('exhausted-gte', 3, [damage(b)])]),
    linger: template('skill', '格挡；本回合结束时多保留 1 张手牌', [[1, 20], [1, 1]], 0.7, ([a, b]) => [block(a), { op: 'retain-hand', amount: b }]),
    whetstone: template('attack', '伤害；打出后本牌伤害永久提高', [[1, 30], [1, 3]], 0.7, ([a, b]) => [damage(a), evolve('damage', b)], { hero: false }),
    carapace: template('skill', '格挡；打出后本牌格挡永久提高', [[1, 30], [1, 3]], 0.7, ([a, b]) => [block(a), evolve('block', b)], { hero: false }),
    trophy: template('attack', '伤害；本牌击倒非爪牙敌人时最大生命永久提高', [[1, 30], [1, 5]], 0.8, ([a, b]) => [damage(a), bounty('hp-max', b)], { hero: false }),
    barricade: template('power', '固守：格挡本场不再清空，并获得格挡（限史诗以上）', [[1, 1], [0, 30]], 1, ([a, b]) => [applyStatus('barricade', a, 'self'), block(b)], { minRarity: 'epic' }),
    hunker: template('skill', '接下来数回合格挡不清空，并获得格挡', [[1, 3], [1, 20]], 0.5, ([a, b]) => [applyStatus('retain-block', a, 'self'), block(b)]),
    redouble: template('skill', '本回合前几次获得格挡翻倍，并获得格挡', [[1, 2], [1, 20]], 0.5, ([a, b]) => [applyStatus('block-surge', a, 'self'), block(b)]),
    'armor-plate': template('power', '甲层：回合结束获得等于层数的格挡；受到未格挡的攻击伤害时减 1 层', [[1, 10]], 1, ([a]) => [applyStatus('plated', a, 'self')]),
    rebuke: template('skill', '反震：到自身下回合前，被格挡掉的攻击伤害反射给攻击者，并获得格挡', [[1, 1], [1, 20]], 0.4, ([a, b]) => [applyStatus('recoil', a, 'self'), block(b)]),
    bramble: template('skill', '临时荆棘：到自身下回合前每次受击反伤，并获得格挡', [[1, 10], [1, 20]], 0.5, ([a, b]) => [applyStatus('bramble', a, 'self'), block(b)]),
    juggernaut: template('power', '坚壁反击：每次获得格挡时对随机敌人造成伤害', [[1, 5]], 1, ([a]) => [applyStatus('juggernaut', a, 'self')]),
    bodyguard: template('skill', '掩护：到自身下回合前，指向队友的单体攻击改由自己承受，并获得格挡', [[1, 1], [1, 20]], 0.3, ([a, b]) => [applyStatus('cover', a, 'self'), block(b)]),
    phalanx: template('power', '共盾：自己获得格挡时，其余队友获得一半', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('share-block', a, 'self'), block(b)]),
    warpath: template('power', '战意：每回合开始获得攻击力', [[1, 2]], 1, ([a]) => [eachTurn([status('strength', a, 'self')])]),
    bloodoath: template('skill', '血祭：本回合每次失去生命时获得攻击力，并失去少量生命', [[1, 2], [1, 6]], 1.4, ([a, b]) => [buff('hp-loss', 1, [status('strength', a, 'self')]), selfDamage(b)]),
    pyre: template('power', '焚身：技能牌 0 费，但打出后消耗（限史诗以上）', [[1, 1]], 1, ([a]) => [applyStatus('pyre', a, 'self')], { minRarity: 'epic' }),
    ember: template('power', '余烬：每消耗一张牌获得格挡', [[1, 6]], 1, ([a]) => [applyStatus('ember', a, 'self')]),
    smith: template('skill', '锻造：锻刃伤害提高（本场首次锻造把锻刃加入手牌）', [[1, 6]], 1, ([a]) => [smith(a)]),
    'blade-sweep': template('skill', '锻刃改为攻击全体敌人，并获得格挡', [[0, 20]], 1, ([a]) => [honeBlade('aoe'), block(a)], { hero: false }),
    'blade-echo': template('skill', '锻刃获得重演 1，并获得格挡（限稀有以上）', [[0, 20]], 1, ([a]) => [honeBlade('replay'), block(a)], { minRarity: 'rare', hero: false }),
    'blade-guard': template('skill', '锻刃打出时另获得格挡', [[1, 20]], 1, ([a]) => [honeBlade('guard', a)], { hero: false }),
    bloodthirst: template('skill', '嗜血：本回合攻击牌按实际扣除的生命回复，并获得格挡', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('bloodthirst', a, 'self'), block(b)]),
    rupture: template('skill', '施加中毒，再让目标立即按中毒层数结算一次（层数不减）', [[1, 8]], 1, ([a]) => [status('poison', a, 'enemy'), poisonTick(1)]),
    envenom: template('power', '淬刃：每段未被格挡的攻击伤害施加中毒', [[1, 5]], 1, ([a]) => [applyStatus('envenom', a, 'self')]),
    miasma: template('power', '毒雾：每回合开始全体敌人中毒', [[1, 4]], 1, ([a]) => [eachTurn([status('poison', a, 'all-enemies')])]),
    'toxic-burst': template('power', '毒爆：每施毒 3 次对全体敌人造成伤害', [[1, 10]], 1, ([a]) => [applyStatus('venom-burst', a, 'self')]),
    shiv: template('skill', '把数张暗刃（0 费、打出后消耗的攻击牌）加入手牌', [[1, 3]], 1, ([a]) => [shiv(a)]),
    'shiv-edge': template('skill', '暗刃伤害提高，并获得格挡', [[1, 4], [0, 20]], 0.6, ([a, b]) => [honeShiv('edge', a), block(b)], { hero: false }),
    'shiv-fan': template('skill', '暗刃改为攻击全体敌人，并获得格挡（限稀有以上）', [[0, 20]], 1, ([a]) => [honeShiv('fan'), block(a)], { minRarity: 'rare', hero: false }),
    'shiv-keep': template('skill', '暗刃获得保留，并获得格挡', [[0, 20]], 1, ([a]) => [honeShiv('keep'), block(a)], { hero: false }),
    'shiv-first': template('skill', '每回合第一张暗刃伤害提高', [[1, 10]], 1, ([a]) => [honeShiv('first', a)], { hero: false }),
    sleight: template('skill', '数回合内每弃一张牌对随机敌人造成伤害，并随机弃 1 张牌', [[1, 3], [1, 10]], 1, ([a, b]) => [buff('discard', a, [damage(b, 'random-enemy')]), discardRandom(1)]),
    'palm-off': template('skill', '数回合内每弃一张牌使随机一张手牌本回合费用 -1，并获得格挡', [[1, 3], [0, 20]], 0.6, ([a, b]) => [buff('discard', a, [costMod(1, 'random', 'turn')]), block(b)]),
    garrote: template('skill', '扼喉：本回合每打出一张牌，目标失去生命，并获得格挡', [[1, 5], [0, 20]], 0.6, ([a, b]) => [applyStatus('garrote', a, 'enemy'), block(b)]),
    carrion: template('attack', '尸裂：带此状态的敌人倒下时按其最大生命的比例伤害其他敌人，并造成伤害', [[1, 2], [1, 30]], 0.4, ([a, b]) => [applyStatus('carrion', a, 'enemy'), damage(b)]),
    bladestorm: template('power', '千刃：每打出一张牌对全体敌人造成伤害', [[1, 2]], 1, ([a]) => [applyStatus('bladestorm', a, 'self')]),
    'quarry-mark': template('attack', '伤害+猎印（叠在敌人身上，引弦时令其失去生命）', [[1, 30], [1, 10]], 0.6, ([a, b]) => [damage(a), applyStatus('hunt-mark', b, 'enemy')]),
    nock: template('attack', '引弦：伤害；所有带猎印的敌人失去等于层数的生命', [[1, 30]], 1, ([a]) => [damage(a), loose()]),
    snare: template('attack', '伤害+迟滞（攻击者本回合每已打出一张牌，目标受到的攻击伤害 +10%）', [[1, 30], [1, 2]], 0.7, ([a, b]) => [damage(a), applyStatus('snare', b, 'enemy')]),
    deadeye: template('power', '专精先手：每回合前数张攻击牌伤害 +50%', [[1, 3]], 1, ([a]) => [applyStatus('deadeye', a, 'self')]),
    'rising-shot': template('skill', '连段：本回合每次攻击命中后，之后的攻击伤害提高，并获得格挡', [[1, 3], [0, 20]], 0.5, ([a, b]) => [applyStatus('combo-rise', a, 'self'), block(b)]),
    skybreak: template('power', '破空：多段攻击命中飞行敌人时，每段额外计 1 次命中，并获得格挡', [[1, 1], [0, 20]], 1, ([a, b]) => [applyStatus('skybreaker', a, 'self'), block(b)]),
    consecrate: template('skill', '获得圣辉（跨回合保留），并获得格挡', [[1, 3], [0, 20]], 0.6, ([a, b]) => [radianceGain(a), block(b)]),
    smite: template('attack', '圣辉 2：高额伤害（另需 2 点圣辉）', [[1, 50]], 1, ([a]) => [damage(a)], { flags: { radiance: 2 } }),
    judgment: template('attack', '圣辉 X：花光圣辉，每点造成一次伤害', [[1, 20]], 1, ([a]) => [damage(a)], { flags: { radiance: 'X' } }),
    'halo-strike': template('power', '辉击：每次获得或消耗圣辉，对生命最低的敌人造成伤害', [[1, 6]], 1, ([a]) => [applyStatus('halo-strike', a, 'self')]),
    'halo-mend': template('power', '辉愈：每次获得或消耗圣辉，回复生命', [[1, 4]], 1, ([a]) => [applyStatus('halo-mend', a, 'self')]),
    verdant: template('skill', '全体友方获得再生，并获得格挡', [[1, 4], [0, 20]], 0.6, ([a, b]) => [status('regen', a, 'all-allies'), block(b)]),
    'steady-mend': template('power', '恒愈：每回合开始回复固定生命（不随回合衰减）', [[1, 5]], 1, ([a]) => [applyStatus('steady-mend', a, 'self')]),
    aftercare: template('power', '战后回复：战斗胜利后回复生命（不在战斗内生效），并获得格挡', [[1, 10], [0, 20]], 0.6, ([a, b]) => [applyStatus('after-mend', a, 'self'), block(b)]),
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
    hellraiser: template('power', '抽到名称含 Strike／打击的牌时，免费向随机敌人打出', [], 1, () => [applyStatus('strike-auto', 1, 'self')], { hero: false }),
    'dark-embrace': template('power', '本场每真正消耗一张牌抽 1 张', [], 1, () => [{ op: 'on-event', trigger: 'exhaust', then: [draw(1)] }], { hero: false }),
    'fiend-fire': template('attack', '消耗整手，按实际消耗张数攻击指定敌人，本牌消耗', [[1, 20]], 1, ([a]) => [{ op: 'exhaust-strike', amount: a, target: 'enemy' }, exhaustSelf()], { hero: false }),
    feed: template('attack', '伤害；击倒非爪牙敌人永久提高最大生命，本牌消耗', [[1, 30], [1, 4]], 0.7, ([a, b]) => [damage(a), bounty('hp-max', b), exhaustSelf()], { hero: false }),
    'shadow-step': template('skill', '弃整手；下回合整回合攻击翻倍', [], 1, () => [{ op: 'discard-hand' }, { op: 'delay-attack' }], { hero: false }),
    nightmare: template('skill', '选一张手牌，下回合获得其 3 张临时副本，本牌消耗', [], 1, () => [copyNext(3, 'choose'), exhaustSelf()], { hero: false }),
    'grand-finale': template('attack', '只有抽牌堆为空才能打出，对全体敌人造成伤害', [[1, 75]], 1, ([a]) => [{ op: 'finale-hit', amount: a, target: 'all-enemies' }], { hero: false }),
    'storm-of-steel': template('skill', '弃整手，每实际弃一张生成一张暗刃，升级生成强化暗刃', [], 1, () => [{ op: 'discard-shivs' }], { hero: false }),
    'phantom-blades': template('power', '暗刃获得保留；每回合第一张暗刃额外加伤', [[1, 10]], 1, ([a]) => [honeShiv('keep'), honeShiv('first', a)], { hero: false }),
    'calculated-gamble': template('skill', '弃整手后抽等量，本牌消耗；升级获得保留', [], 1, () => [discardHandRedraw(), exhaustSelf()], { hero: false }),
    'wraith-form': template('power', '获得无实体；此后每回合开始永久失去 1 敏捷', [[1, 2]], 1, ([a]) => [status('intangible', a, 'self'), applyStatus('dex-decay', 1, 'self')], { hero: false }),
    strangle: template('attack', '伤害；本回合每出一张牌，使指定敌人失去生命', [[1, 30], [1, 4]], 0.6, ([a, b]) => [damage(a), applyStatus('garrote', b, 'enemy')], { hero: false }),
    'echo-form': template('power', '每回合第一张牌额外执行一次；基础有虚无', [], 1, () => [applyStatus('echo-play', 1, 'self')], { flags: { ethereal: true }, hero: false }),
    barrage: template('attack', '每持有一颗法珠，对指定敌人攻击一次', [[1, 20]], 1, ([a]) => [{ op: 'orb-barrage', amount: a, target: 'enemy' }], { hero: false }),
    'multi-cast': template('skill', 'X 费，引发同一颗最右法珠 X 次；升级多引发一次', [], 1, () => [{ op: 'evoke-x', bonus: 0 }], { costs: ['X'], hero: false }),
    'biased-cognition': template('power', '获得专注；此后每回合开始失去 1 专注', [[2, 5]], 1, ([a]) => [orbFocus(a), applyStatus('focus-decay', 1, 'self')], { hero: false }),
    reboot: template('skill', '把其余全部牌堆洗回抽牌堆再抽牌，本牌消耗', [[1, 6]], 1, ([a]) => [{ op: 'reboot', amount: a }, exhaustSelf()], { hero: false }),
    'creative-ai': template('power', '每回合开始随机生成一张本职业能力牌', [], 1, () => [eachTurn([{ op: 'random-card', amount: 1, cardType: 'power', pool: 'class' }])], { hero: false }),
    hologram: template('skill', '格挡并回收一张弃牌；升级增加格挡且移除本牌消耗', [[1, 20]], 1, ([a]) => [block(a), retrieve(1, 'discard'), exhaustSelf()], { hero: false }),
    'foresight-power': template('power', '每回合开始抽牌前自动预知', [[1, 4]], 1, ([a]) => [eachTurn([foresee(a)])], { hero: false }),
    establishment: template('power', '每次回合结束保留牌时，本场永久降低其费用 1', [], 1, () => [applyStatus('retain-save', 1, 'self')], { hero: false }),
    'deva-form': template('power', '每回合开始获得能量，获得量逐回合增加 1；基础有虚无', [], 1, () => [applyStatus('deva-flow', 1, 'self')], { flags: { ethereal: true }, hero: false }),
    'master-reality': template('power', '本场生成的可升级牌自动升级', [], 1, () => [applyStatus('reality', 1, 'self')], { hero: false }),
    vault: template('skill', '结束当前回合并获得额外回合，本牌消耗，不限每场次数', [], 1, () => [{ op: 'extra-turn' }, exhaustSelf()], { hero: false }),
    omniscience: template('skill', '从抽牌堆选一张牌免费打出两次并消耗，本牌消耗', [], 1, () => [{ op: 'draw-play', times: 2 }, exhaustSelf()], { hero: false }),
    'necro-mastery': template('power', '召唤随从；随从失去生命时使全体敌人失去等量生命', [[1, 12]], 1, ([a]) => [summonOp(a), applyStatus('minion-bond', 1, 'self')], { hero: false }),
    oblivion: template('skill', '本回合每出一张牌，对此次指定的敌人施加灾厄', [[1, 4]], 1, ([a]) => [{ op: 'bind-doom', amount: a, target: 'enemy' }], { hero: false }),
    'capture-spirit': template('skill', '使指定敌人失去生命，并将魂随机加入抽牌堆', [[1, 12], [1, 4]], 0.3, ([a, b]) => [{ op: 'spirit-loss', amount: a, target: 'enemy' }, { op: 'soul-draw', amount: b }], { hero: false }),
    dirge: template('skill', 'X 费同时决定召唤次数与入堆魂数量，本牌消耗', [[1, 4]], 1, ([a]) => [{ op: 'dirge', amount: a }, exhaustSelf()], { costs: ['X'], hero: false }),
    rattle: template('attack', '随从攻击，按本回合此前随从攻击次数增加段数', [[1, 20]], 1, ([a]) => [{ op: 'rattle', amount: a, target: 'enemy' }], { hero: false }),
    'end-of-days': template('skill', '对全体敌人施加灾厄，立即处决灾厄不低于生命的敌人', [[1, 52]], 1, ([a]) => [{ op: 'doom-all', amount: a, target: 'all-enemies' }], { hero: false }),
    'refine-blade': template('skill', '锻造；下回合获得 1 点能量', [[1, 10]], 1, ([a]) => [smith(a), nextTurn('energy', 1)], { hero: false }),
    'black-hole': template('power', '每次获得或消耗圣辉，对全体敌人造成伤害', [[1, 6]], 1, ([a]) => [{ op: 'on-event', trigger: 'radiance-shift', then: [damage(a, 'all-enemies')] }], { hero: false }),
    arsenal: template('power', '每生成一张牌（含状态与诅咒）获得 1 攻击力', [], 1, () => [{ op: 'on-event', trigger: 'create', then: [status('strength', 1, 'self')] }], { hero: false }),
    'pillar-of-creation': template('power', '每生成一张牌（含状态与诅咒）获得格挡', [[1, 5]], 1, ([a]) => [{ op: 'on-event', trigger: 'create', then: [block(a)] }], { hero: false }),
    genesis: template('power', '每回合开始获得圣辉', [[1, 3]], 1, ([a]) => [eachTurn([radianceGain(a)])], { hero: false }),
    'sealed-throne': template('power', '每打出一张牌获得 1 圣辉；另需 3 圣辉', [], 1, () => [{ op: 'on-event', trigger: 'card-played', then: [radianceGain(1)] }], { flags: { radiance: 3 }, hero: false }),
    furnace: template('power', '每回合开始自动锻造', [[1, 7]], 1, ([a]) => [eachTurn([smith(a)])], { hero: false }),
    conqueror: template('skill', '锻造，并使本回合锻刃对指定敌人的伤害翻倍', [[1, 10]], 1, ([a]) => [smith(a), { op: 'blade-double', target: 'enemy' }], { hero: false }),
    begone: template('skill', '选择一张其余手牌，变成指定仆从打击牌面', [], 1, () => [{ op: 'transform-minion' }], { hero: false }),
});