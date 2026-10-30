import { COMBAT_RULES, estimateCardValue, estimateEffectsValue, evaluateCardBudget, rarityWindow } from './rules.js';

// 战斗档案模板库：效果形状、数值与升级版由程序决定，副 LLM 只选模板键、起名、给费用。
// 卡牌数值在 rules.js 的费用 × 稀有度预算窗口内整数搜索，取最贴近预算的一组；升级版同形状、各数值不减、价值更高且不超升级上限。
const dmg = (amount, target = 'enemy', hits = 1) => ({ op: 'damage', amount, hits, target });
const blk = (amount, target = 'self') => ({ op: 'block', amount, target });
const heal = (amount, target = 'self') => ({ op: 'heal', amount, target });
const st = (status, stacks, target) => ({ op: 'status', status, stacks, target });
const draw = (amount) => ({ op: 'draw', amount });
const energy = (amount) => ({ op: 'energy', amount });
const exhaust = () => ({ op: 'exhaust-self' });
// 条件追加：满足条件时再结算 then；kind 取 schema 的 CONDITION_KINDS。
const cond = (kind, value, then) => ({ op: 'conditional', when: { kind, value }, then });
// v4 效果（形状与 schema 归一化后一致）：随机弃牌、弃全手再抽、复制本牌、生成临时牌、重复上一张、下一张多结算、本场成长、减费、限时触发、每回合触发。
const discard = (amount) => ({ op: 'discard', amount, mode: 'random' });
// 玩家选牌（choose 只写在卡牌顶层效果里；托管角色按策略自动选）：指定弃牌、从手牌选一张复制、选一张减费。
const discardChosen = (amount) => ({ op: 'discard', amount, mode: 'choose' });
const copyChosen = (amount, to) => ({ op: 'copy', amount, from: 'choose', to });
const discardHand = () => ({ op: 'discard-hand', redraw: true });
const copySelf = (amount, to) => ({ op: 'copy', amount, from: 'self', to });
const create = (token, amount) => ({ op: 'create', card: token, amount, to: 'hand' });
const repeatLast = (amount) => ({ op: 'repeat-last', amount });
const replayNext = (amount, cardType) => ({ op: 'replay-next', amount, cardType });
const grow = (amount) => ({ op: 'grow', amount });
const costMod = (amount, mode, scope) => ({ op: 'cost-mod', amount: -amount, mode, scope });
const buff = (trigger, turns, then, cardType) => ({ op: 'buff', trigger, ...(cardType ? { cardType } : {}), turns, then });
const eachTurn = (then, at) => ({ op: 'each-turn', then, ...(at ? { at } : {}) });
// 分量规模：状态看层数，条件、每回合与限时触发看内层第一个效果，消耗与弃全手恒为 1（保留），减费看减几点，其余看数值。
function sized(e) {
    switch (e.op) {
        case 'status': return e.stacks;
        case 'conditional': case 'each-turn': case 'buff': return e.then.length ? sized(e.then[0]) : 0;
        case 'exhaust-self': case 'discard-hand': return 1;
        case 'cost-mod': return -e.amount;
        default: return e.amount;
    }
}
// 取值为 0 的可选分量不出现在效果里。
const keep = (effects) => (effects || []).filter((e) => sized(e) > 0);

// extra（可选）：flags 卡牌关键字（innate / ethereal / unplayable）；onDiscard 固定的被弃时效果；costs 限定可用费用（可含 'X'）；hero:false 不能用作人物技能。
// build 返回效果数组，或 { effects, onDiscard }（只用于不能打出的牌：被弃时效果随数值求解）。
const card = (type, label, vars, prefer, build, extra = {}) => Object.freeze({
    type, label, vars, prefer, ...extra,
    build: (v) => {
        const out = build(v);
        return Array.isArray(out) ? keep(out) : { effects: keep(out.effects), onDiscard: keep(out.onDiscard) };
    },
});
export const CARD_TEMPLATES = Object.freeze({
    strike: card('attack', '单体伤害', [[1, 40]], 1, ([a]) => [dmg(a)]),
    twin: card('attack', '两段伤害', [[1, 20]], 1, ([a]) => [dmg(a, 'enemy', 2)]),
    flurry: card('attack', '三段伤害', [[1, 12]], 1, ([a]) => [dmg(a, 'enemy', 3)]),
    sweep: card('attack', '全体伤害', [[1, 30]], 1, ([a]) => [dmg(a, 'all-enemies')]),
    scatter: card('attack', '随机敌人三段伤害', [[1, 12]], 1, ([a]) => [dmg(a, 'random-enemy', 3)]),
    bash: card('attack', '伤害+格挡', [[1, 30], [1, 20]], 0.6, ([a, b]) => [dmg(a), blk(b)]),
    cripple: card('attack', '伤害+虚弱', [[1, 30], [1, 3]], 0.7, ([a, b]) => [dmg(a), st('weak', b, 'enemy')]),
    rend: card('attack', '伤害+易伤', [[1, 30], [1, 3]], 0.7, ([a, b]) => [dmg(a), st('vulnerable', b, 'enemy')]),
    venom: card('attack', '伤害+中毒', [[1, 30], [1, 6]], 0.7, ([a, b]) => [dmg(a), st('poison', b, 'enemy')]),
    quick: card('attack', '伤害+抽 1 张', [[1, 30], [1, 1]], 0.5, ([a, b]) => [dmg(a), draw(b)]),
    guard: card('skill', '格挡', [[1, 40]], 1, ([a]) => [blk(a)]),
    brace: card('skill', '格挡+抽 1 张', [[1, 30], [1, 1]], 0.5, ([a, b]) => [blk(a), draw(b)]),
    mend: card('skill', '治疗+格挡', [[1, 20], [1, 20]], 0.6, ([a, b]) => [heal(a), blk(b)]),
    cover: card('skill', '为一名队友格挡', [[1, 40]], 1, ([a]) => [blk(a, 'ally')]),
    rally: card('skill', '全体队友格挡', [[1, 30]], 1, ([a]) => [blk(a, 'all-allies')]),
    expose: card('skill', '易伤+格挡', [[1, 4], [1, 20]], 0.6, ([a, b]) => [st('vulnerable', a, 'enemy'), blk(b)]),
    hex: card('skill', '全体虚弱+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [st('weak', a, 'all-enemies'), blk(b)]),
    toxin: card('skill', '中毒+格挡', [[1, 10], [1, 20]], 0.6, ([a, b]) => [st('poison', a, 'enemy'), blk(b)]),
    surge: card('skill', '能量 1 点+格挡', [[1, 1], [1, 20]], 0.7, ([a, b]) => [energy(a), blk(b)]),
    prepare: card('skill', '抽牌+格挡', [[1, 2], [1, 20]], 0.5, ([a, b]) => [draw(a), blk(b)]),
    might: card('power', '攻击力+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [st('strength', a, 'self'), blk(b)]),
    agility: card('power', '防御力+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [st('dexterity', a, 'self'), blk(b)]),
    spikes: card('power', '荆棘+格挡', [[1, 6], [1, 20]], 0.6, ([a, b]) => [st('thorns', a, 'self'), blk(b)]),
    regrow: card('power', '再生+格挡', [[1, 6], [1, 20]], 0.6, ([a, b]) => [st('regen', a, 'self'), blk(b)]),
    // v2 复合模板（机制形状参照杀戮尖塔归类，命名自有）：每张最多 3 个分量。
    shatter: card('attack', '伤害+易伤+虚弱', [[1, 30], [1, 3], [1, 3]], 0.6, ([a, b, c]) => [dmg(a), st('vulnerable', b, 'enemy'), st('weak', c, 'enemy')]),
    thunder: card('attack', '全体伤害+全体易伤', [[1, 20], [1, 2]], 0.7, ([a, b]) => [dmg(a, 'all-enemies'), st('vulnerable', b, 'all-enemies')]),
    jab: card('attack', '小伤害+虚弱（适合 0 费）', [[1, 6], [1, 1]], 0.6, ([a, b]) => [dmg(a), st('weak', b, 'enemy')]),
    reap: card('attack', '全体伤害+自身回复', [[1, 20], [1, 10]], 0.7, ([a, b]) => [dmg(a, 'all-enemies'), heal(b)]),
    execute: card('attack', '伤害；目标易伤时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [dmg(a), cond('target-has', 'vulnerable', [dmg(b)])]),
    desperate: card('attack', '伤害；自身生命低于一半时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [dmg(a), cond('self-hp-below', 50, [dmg(b)])]),
    finisher: card('attack', '伤害；本回合已出 3 张牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [dmg(a), cond('cards-played-gte', 3, [dmg(b)])]),
    'venom-draw': card('attack', '伤害+中毒+抽 1 张', [[1, 20], [1, 6], [1, 1]], 0.5, ([a, b, c]) => [dmg(a), st('poison', b, 'enemy'), draw(c)]),
    trip: card('skill', '格挡+虚弱', [[1, 20], [1, 3]], 0.6, ([a, b]) => [blk(a), st('weak', b, 'enemy')]),
    wail: card('skill', '全体虚弱+全体易伤', [[1, 3], [1, 3]], 0.5, ([a, b]) => [st('weak', a, 'all-enemies'), st('vulnerable', b, 'all-enemies')]),
    flask: card('skill', '全体中毒', [[1, 8]], 1, ([a]) => [st('poison', a, 'all-enemies')]),
    adrenal: card('skill', '能量+抽牌，用后消耗', [[1, 2], [1, 2]], 0.5, ([a, b]) => [energy(a), draw(b), exhaust()]),
    bulwark: card('skill', '大量格挡，用后消耗', [[1, 60]], 1, ([a]) => [blk(a), exhaust()]),
    aegis: card('skill', '为一名队友格挡+回复', [[1, 20], [1, 15]], 0.6, ([a, b]) => [blk(a, 'ally'), heal(b, 'ally')]),
    'rally-draw': card('skill', '全体队友格挡+抽 1 张', [[1, 20], [1, 1]], 0.6, ([a, b]) => [blk(a, 'all-allies'), draw(b)]),
    counter: card('skill', '格挡+虚弱；自身生命低于一半时追加格挡', [[1, 20], [1, 2], [1, 20]], 0.5, ([a, b, c]) => [blk(a), st('weak', b, 'enemy'), cond('self-hp-below', 50, [blk(c)])]),
    inflame: card('power', '大量攻击力', [[1, 6]], 1, ([a]) => [st('strength', a, 'self')]),
    bastion: card('power', '再生+荆棘', [[1, 6], [1, 6]], 0.5, ([a, b]) => [st('regen', a, 'self'), st('thorns', b, 'self')]),
    footwork: card('power', '防御力+抽 1 张', [[1, 3], [1, 1]], 0.7, ([a, b]) => [st('dexterity', a, 'self'), draw(b)]),
    // v4 第一批（助手 10-28）：弃牌、被弃时、关键字、复制与生成、重复与重放、同名连出、成长、减费、限时触发、X 费。
    // 需要玩家选牌的模板（cull / toss / replicate / temper）在选牌界面接入后放开（助手 10-28），只作卡牌，不作人物技能。
    glance: card('attack', '伤害；被丢弃时抽 1 张', [[1, 30]], 1, ([a]) => [dmg(a)], { onDiscard: [draw(1)] }),
    gut: card('attack', '伤害；本回合已弃过牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [dmg(a), cond('discarded-gte', 1, [dmg(b)])]),
    fleeting: card('attack', '高伤害，虚无（回合结束仍在手中则消耗）', [[1, 40]], 1, ([a]) => [dmg(a)], { flags: { ethereal: true } }),
    mimic: card('attack', '伤害，复制本牌加入弃牌堆（不能 0 费）', [[1, 30]], 1, ([a]) => [dmg(a), copySelf(1, 'discard')], { costs: [1, 2, 3], hero: false }),
    chain: card('attack', '伤害；本回合已打出过同名牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [dmg(a), cond('same-card-gte', 1, [dmg(b)])], { hero: false }),
    rampage: card('attack', '伤害，本场每打出一次本牌伤害提高', [[1, 30], [1, 5]], 0.7, ([a, b]) => [dmg(a), grow(b)], { hero: false }),
    momentum: card('attack', '伤害；本回合已出 2 张攻击牌时追加伤害', [[1, 30], [1, 30]], 0.6, ([a, b]) => [dmg(a), cond('attacks-played-gte', 2, [dmg(b)])]),
    whirl: card('attack', 'X 费：每点能量对全体敌人造成一次伤害', [[1, 20]], 1, ([a]) => [dmg(a, 'all-enemies')], { costs: ['X'] }),
    hone: card('attack', '伤害，本场本牌费用 -1（不能 0 费）', [[1, 30]], 1, ([a]) => [dmg(a), costMod(1, 'self', 'combat')], { costs: [1, 2, 3], hero: false }),
    sift: card('skill', '抽牌后随机弃 1 张，并获得格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [draw(a), discard(1), blk(b)]),
    purge: card('skill', '弃掉全部手牌再抽同样张数，并获得格挡', [[1, 30]], 1, ([a]) => [discardHand(), blk(a)]),
    scrap: card('skill', '随机弃 1 张牌，获得能量', [[1, 2]], 1, ([a]) => [discard(1), energy(a)], { costs: [0, 1] }),
    reflex: card('skill', '不能打出（0 费）；被丢弃时抽牌并获得格挡', [[1, 2], [0, 10]], 0.8, ([a, b]) => ({ effects: [], onDiscard: [draw(a), blk(b)] }), { flags: { unplayable: true }, costs: [0] }),
    opener: card('skill', '固有（开战就在手牌中）：格挡+抽 1 张', [[1, 30], [1, 1]], 0.6, ([a, b]) => [blk(a), draw(b)], { flags: { innate: true } }),
    echo: card('skill', '重复本回合上一张牌的效果，并获得格挡', [[1, 20]], 1, ([a]) => [repeatLast(1), blk(a)]),
    encore: card('skill', '本回合下一张攻击牌多结算 1 次，并获得格挡', [[1, 20]], 1, ([a]) => [replayNext(1, 'attack'), blk(a)]),
    quicken: card('skill', '本回合随机 1 张手牌费用 -1，并获得格挡', [[1, 20]], 1, ([a]) => [costMod(1, 'random', 'turn'), blk(a)]),
    forge: card('skill', '生成「碎刃」（0 费小伤害）加入手牌', [[1, 3]], 1, ([a]) => [create('token-shard', a)], { costs: [0, 1] }),
    talisman: card('skill', '生成「护符」（0 费格挡）加入手牌', [[1, 3]], 1, ([a]) => [create('token-ward', a)], { costs: [0, 1, 2] }),
    frenzy: card('skill', '数回合内，每打出一张攻击牌获得格挡', [[1, 3], [1, 6]], 1, ([a, b]) => [buff('card-played', a, [blk(b)], 'attack')]),
    rhythm: card('skill', '数回合内，每打出一张技能牌对随机敌人造成伤害', [[1, 3], [1, 8]], 1, ([a, b]) => [buff('card-played', a, [dmg(b, 'random-enemy')], 'skill')]),
    scavenge: card('skill', '数回合内，每弃一张牌获得格挡', [[1, 3], [1, 8]], 1, ([a, b]) => [buff('discard', a, [blk(b)])]),
    xguard: card('skill', 'X 费：每点能量获得一次格挡', [[1, 20]], 1, ([a]) => [blk(a)], { costs: ['X'] }),
    plating: card('power', '每回合结束时获得格挡', [[1, 12]], 1, ([a]) => [eachTurn([blk(a)], 'turn-end')]),
    cull: card('skill', '抽牌后从手牌选 1 张弃掉，并获得格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [draw(a), discardChosen(1), blk(b)], { hero: false }),
    toss: card('attack', '伤害；从手牌选 1 张弃掉', [[1, 30]], 1, ([a]) => [dmg(a), discardChosen(1)], { hero: false }),
    replicate: card('skill', '从手牌选 1 张复制（本场临时牌）加入手牌，并获得格挡（不能 0 费）', [[1, 20]], 1, ([a]) => [copyChosen(1, 'hand'), blk(a)], { costs: [1, 2, 3], hero: false }),
    temper: card('skill', '从手牌选 1 张本回合费用 -1，并获得格挡（不能 0 费）', [[1, 20]], 1, ([a]) => [costMod(1, 'choose', 'turn'), blk(a)], { costs: [1, 2, 3], hero: false }),
});

// 被动模板：数值固定，描述由模板给出。
const passive = (trigger, label, effects) => Object.freeze({ trigger, label, effects: () => effects.map((e) => ({ ...e })) });
export const PASSIVE_TEMPLATES = Object.freeze({
    'opening-strength': passive('battle-start', '开战获得 1 层攻击力', [st('strength', 1, 'self')]),
    'opening-dexterity': passive('battle-start', '开战获得 1 层防御力', [st('dexterity', 1, 'self')]),
    'opening-guard': passive('battle-start', '开战获得 8 点格挡', [blk(8)]),
    'opening-weaken': passive('battle-start', '开战使全体敌人虚弱 1 层', [st('weak', 1, 'all-enemies')]),
    'opening-poison': passive('battle-start', '开战使全体敌人中毒 3 层', [st('poison', 3, 'all-enemies')]),
    'turn-guard': passive('turn-start', '回合开始获得 3 点格挡', [blk(3)]),
    'turn-mend': passive('turn-end', '回合结束回复 2 点生命', [heal(2)]),
    'hit-guard': passive('on-hit', '受击后获得 2 点格挡', [blk(2)]),
    'last-stand': passive('on-low-hp', '濒危时回复 12 点生命', [heal(12)]),
    'last-fury': passive('on-low-hp', '濒危时获得 2 层攻击力', [st('strength', 2, 'self')]),
});
// 华而不实的被动（P-e，助手反馈 3「时尚小垃圾」）：只供人物特性与装备被动选用，名称可以起得很气派，效果几乎没用；职业、个人与敌人被动不可选。
export const FLAIR_PASSIVE_TEMPLATES = Object.freeze({
    'flair-glint': passive('battle-start', '开战获得 1 点格挡', [blk(1)]),
    'flair-thorn': passive('battle-start', '开战获得 1 层荆棘', [st('thorns', 1, 'self')]),
    'flair-miasma': passive('battle-start', '开战使全体敌人中毒 1 层', [st('poison', 1, 'all-enemies')]),
    'flair-halo': passive('turn-start', '回合开始获得 1 点格挡', [blk(1)]),
    'flair-breath': passive('turn-end', '回合结束回复 1 点生命', [heal(1)]),
    'flair-pride': passive('on-hit', '受击后获得 1 点格挡', [blk(1)]),
    'flair-sigh': passive('on-low-hp', '濒危时回复 1 点生命', [heal(1)]),
    'flair-pose': passive('on-low-hp', '濒危时获得 1 点格挡', [blk(1)]),
    'flair-aura': passive('battle-start', '开战获得 1 层再生', [st('regen', 1, 'self')]),
    'flair-dawn': passive('turn-start', '回合开始回复 1 点生命', [heal(1)]),
    'flair-vow': passive('turn-end', '回合结束获得 1 点格挡', [blk(1)]),
    'flair-echo': passive('on-hit', '受击后回复 1 点生命', [heal(1)]),
});
// 人物特性与装备被动可选的全部被动模板。
export const GEAR_PASSIVE_TEMPLATES = Object.freeze({ ...PASSIVE_TEMPLATES, ...FLAIR_PASSIVE_TEMPLATES });

// 技能模板（技能角色、敌人、技能成长）：数值按单技能伤害封顶 cap 折算，总伤害不超过 cap。
const part = (cap, ratio) => Math.max(1, Math.floor(cap * ratio));
const skill = (intent, label, build, weight = 1, cooldown = 0) => Object.freeze({ intent, label, build, weight, cooldown });
export const SKILL_TEMPLATES = Object.freeze({
    slash: skill('attack', '单体攻击', (cap) => [dmg(part(cap, 0.6))], 3),
    heavy: skill('attack', '重击', (cap) => [dmg(part(cap, 1))], 2, 2),
    combo: skill('attack', '两段攻击', (cap) => [dmg(part(cap, 0.3), 'enemy', 2)], 2),
    cleave: skill('attack', '全体攻击', (cap) => [dmg(part(cap, 0.4), 'all-enemies')], 2, 1),
    drain: skill('attack', '攻击并回复', (cap) => [dmg(part(cap, 0.5)), heal(part(cap, 0.3))], 2, 1),
    venom: skill('debuff', '中毒', (cap) => [st('poison', Math.min(10, part(cap, 0.3)), 'enemy')], 1, 1),
    curse: skill('debuff', '虚弱', () => [st('weak', 2, 'enemy')], 1, 2),
    expose: skill('debuff', '易伤', () => [st('vulnerable', 2, 'enemy')], 1, 2),
    guard: skill('defend', '格挡', (cap) => [blk(part(cap, 0.6))], 1),
    shelter: skill('defend', '全体格挡', (cap) => [blk(part(cap, 0.4), 'all-allies')], 1, 1),
    roar: skill('buff', '获得攻击力', () => [st('strength', 2, 'self')], 1, 2),
    mend: skill('heal', '治疗队友', (cap) => [heal(Math.min(60, part(cap, 0.6)), 'ally')], 1, 1),
    // v2 复合技能（技能角色 / 敌人共用；绝招随强度档在会话侧接入）。
    gash: skill('attack', '攻击+易伤', (cap) => [dmg(part(cap, 0.5)), st('vulnerable', 2, 'enemy')], 2, 1),
    sunder: skill('attack', '全体攻击+全体虚弱', (cap) => [dmg(part(cap, 0.3), 'all-enemies'), st('weak', 1, 'all-enemies')], 2, 2),
    'guard-strike': skill('attack', '攻击+自身格挡', (cap) => [dmg(part(cap, 0.5)), blk(part(cap, 0.4))], 2),
    ward: skill('defend', '队友格挡+回复', (cap) => [blk(part(cap, 0.5), 'ally'), heal(Math.min(60, part(cap, 0.3)), 'ally')], 1, 1),
    warcry: skill('buff', '全体格挡+全体攻击力', (cap) => [blk(part(cap, 0.3), 'all-allies'), st('strength', 1, 'all-allies')], 1, 2),
    leech: skill('attack', '攻击+全体队友回复', (cap) => [dmg(part(cap, 0.5)), heal(Math.min(60, part(cap, 0.2)), 'all-allies')], 2, 1),
    plague: skill('debuff', '全体中毒+全体易伤', (cap) => [st('poison', Math.min(10, part(cap, 0.3)), 'all-enemies'), st('vulnerable', 1, 'all-enemies')], 1, 2),
    // v4 第二批（计划 5.4）：只用现有效果原语。
    triple: skill('attack', '三段攻击', (cap) => [dmg(part(cap, 0.2), 'enemy', 3)], 2),
    punish: skill('attack', '攻击，目标易伤时追加伤害', (cap) => [dmg(part(cap, 0.4)), cond('target-has', 'vulnerable', [dmg(part(cap, 0.4))])], 2, 1),
    volley: skill('attack', '随机敌人三段攻击', (cap) => [dmg(part(cap, 0.25), 'random-enemy', 3)], 2, 1),
    crush: skill('attack', '攻击+虚弱', (cap) => [dmg(part(cap, 0.5)), st('weak', 1, 'enemy')], 2, 1),
    barb: skill('defend', '格挡+荆棘', (cap) => [blk(part(cap, 0.4)), st('thorns', 2, 'self')], 1, 1),
    steady: skill('defend', '格挡+防御力', (cap) => [blk(part(cap, 0.4)), st('dexterity', 1, 'self')], 1, 2),
    absolve: skill('heal', '净化队友并回复', (cap) => [{ op: 'cleanse', target: 'ally' }, heal(Math.min(60, part(cap, 0.4)), 'ally')], 1, 2),
    bloom: skill('heal', '全体再生', () => [st('regen', 3, 'all-allies')], 1, 2),
    swift: skill('buff', '全体防御力', () => [st('dexterity', 1, 'all-allies')], 1, 2),
    detonate: skill('debuff', '中毒+中毒翻倍', (cap) => [st('poison', Math.min(10, part(cap, 0.2)), 'enemy'), { op: 'double', stat: 'poison', target: 'enemy' }], 1, 2),
    brittle: skill('debuff', '脆弱', () => [st('frail', 2, 'enemy')], 1, 2),
    relic: skill('buff', '获得人工制品', () => [st('artifact', 1, 'self')], 1, 3),
});
// 复合技能模板（同时带两个效果，D10）：队友 Lv6 起按等级补技能时只能从这里选。
export const COMPOSITE_SKILL_KEYS = Object.freeze(['drain', 'gash', 'sunder', 'guard-strike', 'ward', 'warcry', 'leech', 'plague', 'punish', 'crush', 'barb', 'steady', 'absolve', 'detonate']);

export const TEMPLATE_COSTS = Object.freeze([0, 1, 2, 3]);
// 模板可用费用：没有限定时为 0–3；限定的（X 费、不能打出、不能 0 费）按模板。
export function templateCosts(key) {
    const t = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    return t ? [...(t.costs || TEMPLATE_COSTS)] : [];
}
const EPS = 1e-9;
const clone = (v) => JSON.parse(JSON.stringify(v));

function combos(vars, floor = []) {
    let out = [[]];
    vars.forEach(([lo, hi], i) => {
        const next = [];
        for (const head of out) for (let n = Math.max(lo, floor[i] ?? lo); n <= hi; n += 1) next.push([...head, n]);
        out = next;
    });
    return out;
}

// 估值含关键字与被弃时效果（与 evaluateCardBudget 同一口径）；占比取第一个效果（不能打出的牌取第一个被弃时效果）。
function measure(t, v) {
    const out = t.build(v);
    const effects = Array.isArray(out) ? out : out.effects;
    const onDiscard = Array.isArray(out) ? t.onDiscard : out.onDiscard;
    const shape = { ...(t.flags || {}), effects, ...(onDiscard?.length ? { onDiscard: clone(onDiscard) } : {}) };
    const total = estimateCardValue(shape);
    const first = estimateEffectsValue((effects.length ? effects : onDiscard || []).slice(0, 1));
    return { effects, shape, total, share: total ? first / total : 0 };
}

function pick(t, candidates, target, accept) {
    let best = null;
    for (const v of candidates) {
        const m = measure(t, v);
        if (!accept(m.total)) continue;
        const score = Math.abs(m.total - target) / target + (t.vars.length > 1 ? Math.abs(m.share - t.prefer) : 0);
        if (!best || score < best.score - EPS) best = { v, score, ...m };
    }
    return best;
}

const solved = new Map();
// 模板在指定费用与稀有度下的数值解；无解返回 null。结果经 evaluateCardBudget 复核。
export function solveCardTemplate(key, cost, rarity) {
    const t = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!t || !(t.costs || TEMPLATE_COSTS).includes(cost)) return null;
    const memo = `${key}|${cost}|${rarity}`;
    if (!solved.has(memo)) {
        // 校验窗口取 rarityWindow（与 evaluateCardBudget 同一口径），求解目标取该稀有度的中心值。
        const w = rarityWindow(cost, rarity);
        const base = w ? pick(t, combos(t.vars), w.target, (x) => x >= w.min - EPS && x <= w.max + EPS) : null;
        let out = null;
        if (base) {
            const upMax = w.max * COMBAT_RULES.upgradeAllowance;
            const target = Math.min(upMax, base.total + w.budget * 0.25);
            // 不能打出的牌没有升级版（schema 拒收）；关键字与被弃时效果随基础形态带出，升级只改效果。
            const up = t.flags?.unplayable ? null : pick(t, combos(t.vars, base.v), target, (x) => x > base.total + EPS && x <= upMax + EPS);
            const head = { type: t.type, ...base.shape };
            const cardShape = { cost, rarity, ...base.shape, ...(up ? { upgraded: { effects: up.effects } } : {}) };
            if (evaluateCardBudget(cardShape).ok) out = { ...head, ...(up ? { upgraded: { effects: up.effects } } : {}) };
            else if (up && evaluateCardBudget({ cost, rarity, ...base.shape }).ok) out = head;
        }
        solved.set(memo, out);
    }
    const hit = solved.get(memo);
    return hit ? clone(hit) : null;
}
// 正文学会的卡牌（D9，助手 10-30）：模型在模板变量范围内给出的数值。个数不符、越界或不在费用 × 稀有度窗口内时返回 { error, detail }，由调用方定向修正；
// 升级版仍由程序在不低于给定数值的组合里求解（与 solveCardTemplate 同一口径），结果经 evaluateCardBudget 复核。
export function cardFromValues(key, cost, rarity, values) {
    const t = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!t || !(t.costs || TEMPLATE_COSTS).includes(cost)) return { error: 'template-unsolvable', detail: { cost, rarity } };
    if (!Array.isArray(values) || values.length !== t.vars.length) return { error: 'values-length', detail: { expected: t.vars.length } };
    const ranges = t.vars.map((r) => [...r]);
    if (values.some((n, i) => !Number.isInteger(n) || n < t.vars[i][0] || n > t.vars[i][1])) return { error: 'values-out-of-range', detail: { ranges } };
    const w = rarityWindow(cost, rarity);
    if (!w) return { error: 'template-unsolvable', detail: { cost, rarity } };
    const m = measure(t, values);
    if (m.total < w.min - EPS || m.total > w.max + EPS) return { error: 'values-out-of-window', detail: { cost, rarity } };
    const upMax = w.max * COMBAT_RULES.upgradeAllowance;
    const target = Math.min(upMax, m.total + w.budget * 0.25);
    const up = t.flags?.unplayable ? null : pick(t, combos(t.vars, values), target, (x) => x > m.total + EPS && x <= upMax + EPS);
    const head = { type: t.type, ...m.shape };
    if (up && evaluateCardBudget({ cost, rarity, ...m.shape, upgraded: { effects: up.effects } }).ok) return { card: clone({ ...head, upgraded: { effects: up.effects } }) };
    if (evaluateCardBudget({ cost, rarity, ...m.shape }).ok) return { card: clone(head) };
    return { error: 'values-out-of-window', detail: { cost, rarity } };
}


// 给定费用无解时按距离取最近的可用费用；全部无解返回 null。rarity 可以是按费用给稀有度的函数。
// 只在模板可用费用里找：数字费用按距离排序；X 费在要求 X 时最先，否则最后。
export function nearestTemplateCost(key, cost, rarity) {
    const allowed = templateCosts(key);
    const want = TEMPLATE_COSTS.includes(cost) ? cost : 1;
    const rarityAt = typeof rarity === 'function' ? rarity : () => rarity;
    const numeric = allowed.filter((c) => typeof c === 'number').sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b);
    const order = !allowed.includes('X') ? numeric : cost === 'X' ? ['X', ...numeric] : [...numeric, 'X'];
    return order.find((c) => solveCardTemplate(key, c, rarityAt(c))) ?? null;
}
// 固定费用位置（职业卡）：模板可用该费用时照用；可用 X 费的模板放在 1–3 费位置时改为 X 费；否则原样返回（求解无解，由调用方拒收）。
export function fixedTemplateCost(key, cost) {
    const allowed = templateCosts(key);
    if (allowed.includes(cost)) return cost;
    return allowed.includes('X') && typeof cost === 'number' && cost >= 1 ? 'X' : cost;
}

// 按键取被动（含华而不实被动）；哪些角色可选哪张表由调用方的模板键校验决定。
export function passiveFromTemplate(key) {
    const t = Object.hasOwn(GEAR_PASSIVE_TEMPLATES, key) ? GEAR_PASSIVE_TEMPLATES[key] : null;
    return t ? { trigger: t.trigger, effects: t.effects(), description: t.label } : null;
}

// 被动效果按 k 加强：层数与数值向上取整，层数 ≤10、治疗 ≤60、其他 ≤99；没有数值的效果不变。
const scalePassiveEffects = (effects, k) => effects.map((e) => (e.op === 'status' ? { ...e, stacks: Math.min(10, Math.ceil(e.stacks * k)) }
    : typeof e.amount === 'number' ? { ...e, amount: Math.min(e.op === 'heal' ? 60 : 99, Math.ceil(e.amount * k)) } : e));

// 被动按稀有度加强：按该稀有度与 common 求解中心之比向上取整（common 及以下、未登记的稀有度不变），说明标注「加强」。
export function passiveAtRarity(key, rarity) {
    const base = passiveFromTemplate(key);
    const w = COMBAT_RULES.rarityWindows[rarity];
    const k = w ? w.target / COMBAT_RULES.rarityWindows.common.target : 1;
    if (!base || k <= 1) return base;
    return { ...base, effects: scalePassiveEffects(base.effects, k), description: `${base.description}（加强）` };
}

// 职业升阶（P-c）：每升一阶，职业被动按 rare 与 common 求解中心之比加强一档（逐阶叠加，每档向上取整）；一阶原样返回。
export function passiveAtTier(passive, tier) {
    if (!passive || !Number.isInteger(tier) || tier <= 1) return passive;
    const k = COMBAT_RULES.rarityWindows.rare.target / COMBAT_RULES.rarityWindows.common.target;
    let effects = passive.effects;
    for (let t = 1; t < tier; t += 1) effects = scalePassiveEffects(effects, k);
    return { ...passive, effects };
}

// 装备被动：武器 / 防具 / 饰品按被动模板原值（common 口径）；宝物按 rare 口径加强。
export function gearPassiveFromTemplate(key, slot) {
    const base = passiveFromTemplate(key);
    if (!base || slot !== 'treasure') return base;
    return { ...passiveAtRarity(key, 'rare'), description: `${base.description}（宝物加强）` };
}

// 一次性道具模板（v2 阶段 3）：战斗中使用、不耗能量，数值固定。
// 目标（助手 10-30）：回复、格挡、净化对己方参战角色使用（target 'ally'：玩家选一名存活的己方单位，含自己）；伤害与减益对敌方；
// 能量与抽牌只作用于使用者（引擎只给卡组角色结算）。
const cleanse = (target = 'self') => ({ op: 'cleanse', target });
const item = (label, effects) => Object.freeze({ label, effects: () => effects.map((e) => ({ ...e })) });
export const ITEM_TEMPLATES = Object.freeze({
    potion: item('回复 12 点生命', [heal(12, 'ally')]),
    barrier: item('获得 12 点格挡', [blk(12, 'ally')]),
    bomb: item('对全体敌人造成 10 点伤害', [dmg(10, 'all-enemies')]),
    purify: item('净化减益并回复 4 点生命', [cleanse('ally'), heal(4, 'ally')]),
    tonic: item('获得 2 点能量', [energy(2)]),
    scroll: item('抽 3 张牌', [draw(3)]),
    // 助手 10-30 扩充（数值为初版，计划 3.8）：单体伤害、单体 / 群体减益、单体 / 群体攻击增幅。
    dagger: item('对一名敌人造成 16 点伤害', [dmg(16)]),
    'poison-dart': item('使一名敌人中毒 6 层', [st('poison', 6, 'enemy')]),
    'weaken-powder': item('使一名敌人虚弱 2 层', [st('weak', 2, 'enemy')]),
    sunder: item('使一名敌人易伤 2 层', [st('vulnerable', 2, 'enemy')]),
    'frail-dust': item('使一名敌人脆弱 2 层', [st('frail', 2, 'enemy')]),
    'toxic-cloud': item('使全体敌人中毒 4 层', [st('poison', 4, 'all-enemies')]),
    smoke: item('使全体敌人虚弱 1 层', [st('weak', 1, 'all-enemies')]),
    'war-tonic': item('一名己方角色获得 2 层攻击力', [st('strength', 2, 'ally')]),
    'war-drum': item('全体己方获得 1 层攻击力', [st('strength', 1, 'all-allies')]),
});
// 旧道具（账本里 target 为 self 的回复 / 格挡 / 净化）带入新战斗时改为对己方单位使用；只在建局时换算，已存的战斗 setup 不变，重放结果不变。
const ALLY_ITEM_OPS = new Set(['heal', 'block', 'cleanse']);
export function itemEffectsForBattle(effects) {
    return (effects || []).map((e) => {
        if (e?.op === 'conditional') return { ...e, then: itemEffectsForBattle(e.then) };
        return ALLY_ITEM_OPS.has(e?.op) && (e.target === undefined || e.target === 'self') ? { ...e, target: 'ally' } : e;
    });
}
export function itemFromTemplate(key) {
    const t = Object.hasOwn(ITEM_TEMPLATES, key) ? ITEM_TEMPLATES[key] : null;
    return t ? { effects: t.effects(), description: t.label } : null;
}
// 正文获得的道具按稀有度放大（D8，助手 10-30）：与被动加强同一口径（该稀有度与 common 求解中心之比，向上取整）；
// 层数 ≤10、治疗 ≤60、能量 ≤3、抽牌 ≤5、其他 ≤99（与 schema 上限一致）；common 与未登记的稀有度原样返回。说明里的数字按效果顺序换成放大后的值。
const ITEM_AMOUNT_CAPS = Object.freeze({ heal: 60, energy: 3, draw: 5 });
const scaleItemEffects = (effects, k) => effects.map((e) => (e.op === 'status' ? { ...e, stacks: Math.min(10, Math.ceil(e.stacks * k)) }
    : typeof e.amount === 'number' ? { ...e, amount: Math.min(ITEM_AMOUNT_CAPS[e.op] ?? 99, Math.ceil(e.amount * k)) } : e));
const effectNumbers = (effects) => effects.flatMap((e) => (e.op === 'status' ? [e.stacks] : typeof e.amount === 'number' ? [e.amount] : []));
function relabelNumbers(label, before, after) {
    const text = String(label);
    const found = text.match(/\d+/g) || [];
    if (found.length !== before.length || found.some((n, i) => Number(n) !== before[i])) return `${text}（加强）`;
    let i = 0;
    return text.replace(/\d+/g, () => String(after[i++]));
}
export function itemAtRarity(key, rarity) {
    const base = itemFromTemplate(key);
    const w = Object.hasOwn(COMBAT_RULES.rarityWindows, rarity) ? COMBAT_RULES.rarityWindows[rarity] : null;
    const k = w ? w.target / COMBAT_RULES.rarityWindows.common.target : 1;
    if (!base || k <= 1) return base;
    const effects = scaleItemEffects(base.effects, k);
    return { effects, description: relabelNumbers(base.description, effectNumbers(base.effects), effectNumbers(effects)) };
}


export function skillFromTemplate(key, cap) {
    const t = Object.hasOwn(SKILL_TEMPLATES, key) ? SKILL_TEMPLATES[key] : null;
    return t ? { intent: t.intent, effects: t.build(cap), weight: t.weight, cooldown: t.cooldown, description: t.label } : null;
}
// 人物技能：卡牌模板按 heroSkillCost 费用、个人稀有度求值，不带升级版。
// 带关键字、被弃时效果、限定费用且不含 heroSkillCost，或带本牌专属效果（复制本牌、成长、本牌减费、同名连出条件）的模板不能用作人物技能。
const heroTemplate = (t) => Boolean(t) && t.hero !== false && !t.flags && !t.onDiscard && (!t.costs || t.costs.includes(COMBAT_RULES.heroSkillCost));
// 主动人物特性可用的卡牌模板键（trait-pool.js）：与人物技能同样排除关键字、被弃时与本牌专属效果；费用 1 / 2 是否可用由求解决定。
export const TRAIT_SKILL_TEMPLATE_KEYS = Object.freeze(Object.keys(CARD_TEMPLATES).filter((k) => { const t = CARD_TEMPLATES[k]; return t.hero !== false && !t.flags && !t.onDiscard; }));
export function heroSkillFromTemplate(key, { id, name } = {}) {
    const t = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    const solved = heroTemplate(t) ? solveCardTemplate(key, COMBAT_RULES.heroSkillCost, 'personal') : null;
    return solved ? { id, name, effects: solved.effects, description: t.label } : null;
}

// 绝招：强度档 ace / legend 的技能角色由会话追加（不在 SKILL_TEMPLATES 目录里，模型不能选）；重击 + 易伤，按放大后的封顶折算。
export function ultimateSkill(cap, { id, name = '绝招', cooldown = 3 } = {}) {
    return { id, name, intent: 'attack', effects: [dmg(part(cap, 1)), st('vulnerable', 2, 'enemy')], weight: 1, cooldown, description: '绝招：重击并使目标易伤', ultimate: true };
}

// 旧档案没有人物技能时按职业原型回落一个默认技能；原型未知时用单体伤害。
const ARCHETYPE_HERO_SKILL = Object.freeze({
    warrior: ['奋战', 'strike'], guardian: ['坚守', 'guard'], ranger: ['连射', 'scatter'], assassin: ['淬毒', 'venom'],
    mage: ['奥术涌动', 'sweep'], priest: ['祈愈', 'mend'], summoner: ['荆棘护体', 'spikes'], bard: ['激昂', 'prepare'],
});
export function defaultHeroSkill(archetype, ownerId) {
    const [name, key] = ARCHETYPE_HERO_SKILL[archetype] || ['奋战', 'strike'];
    return heroSkillFromTemplate(key, { id: `${ownerId}-h0`, name });
}


// 提示词用的模板目录：键 + 说明，只描述效果形状，不含数值。
export function templateCatalogText() {
    const line = (title, table, extra) => `${title}：${Object.entries(table).map(([k, t]) => `${k}=${extra ? extra(t) : ''}${t.label}`).join('；')}`;
    const zeroCost = Object.keys(CARD_TEMPLATES).filter((k) => solveCardTemplate(k, 0, 'common'));
    const limited = Object.entries(CARD_TEMPLATES).filter(([, t]) => t.costs).map(([k, t]) => `${k}=${t.costs.join('/')} 费`).join('；');
    const notHero = Object.entries(CARD_TEMPLATES).filter(([, t]) => !heroTemplate(t)).map(([k]) => k).join(',');
    const byArchetype = Object.entries(ARCHETYPE_TEMPLATES).map(([arch, keys]) => `${arch}=${keys.join(',')}`).join('；');
    return [
        line('卡牌模板', CARD_TEMPLATES, (t) => `${{ attack: '攻击', skill: '技能', power: '能力' }[t.type]}·`),
        `0 费槽可用的卡牌模板：${zeroCost.join(',')}`,
        `限定费用的卡牌模板（只放在费用相符的位置；X 费模板可放在 1–3 费的位置，由程序改为 X 费）：${limited}`,
        `不能用作人物技能（skill）的卡牌模板：${notHero}`,
        `各职业原型优先选用的卡牌模板（复合效果优先，单一效果补位）：${byArchetype}`,
        line('被动模板', PASSIVE_TEMPLATES),
        line('华而不实被动模板（只用于人物特性与装备被动，名称可起得气派，效果几乎没用）', FLAIR_PASSIVE_TEMPLATES),
        line('技能模板', SKILL_TEMPLATES),
        line('道具模板', ITEM_TEMPLATES),
    ].join('\n');
}

// 原型推荐模板：只用于提示词引导，校验仍接受目录中的任一模板键。
const ARCHETYPE_TEMPLATES = Object.freeze({
    warrior: ['bash', 'shatter', 'thunder', 'desperate', 'reap', 'inflame', 'brace', 'counter', 'rampage', 'momentum', 'whirl', 'fleeting'],
    guardian: ['bash', 'guard', 'bulwark', 'counter', 'trip', 'cover', 'rally', 'bastion', 'plating', 'xguard', 'talisman', 'opener'],
    ranger: ['twin', 'scatter', 'quick', 'finisher', 'trip', 'footwork', 'prepare', 'rend', 'chain', 'encore', 'sift', 'glance', 'cull'],
    assassin: ['flurry', 'venom', 'venom-draw', 'execute', 'jab', 'toxin', 'finisher', 'agility', 'gut', 'scrap', 'reflex', 'sift', 'toss'],
    mage: ['sweep', 'thunder', 'wail', 'hex', 'surge', 'adrenal', 'flask', 'expose', 'echo', 'quicken', 'rhythm', 'purge', 'temper'],
    priest: ['mend', 'aegis', 'rally-draw', 'reap', 'regrow', 'hex', 'guard', 'prepare', 'talisman', 'opener', 'plating'],
    summoner: ['spikes', 'bastion', 'regrow', 'toxin', 'flask', 'scatter', 'rally', 'might', 'forge', 'mimic', 'scavenge', 'replicate'],
    bard: ['prepare', 'rally-draw', 'footwork', 'wail', 'quick', 'surge', 'cripple', 'might', 'echo', 'encore', 'frenzy', 'hone', 'replicate'],
});


