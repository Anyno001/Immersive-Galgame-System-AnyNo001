import { COMBAT_RULES, estimateEffectsValue, evaluateCardBudget, rarityWindow } from './rules.js';

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
// 分量规模：状态看层数，条件看追加效果，消耗恒为 1（保留），其余看数值。
function sized(e) {
    if (e.op === 'status') return e.stacks;
    if (e.op === 'conditional') return e.then.length ? sized(e.then[0]) : 0;
    return e.op === 'exhaust-self' ? 1 : e.amount;
}
// 取值为 0 的可选分量不出现在效果里。
const keep = (effects) => effects.filter((e) => sized(e) > 0);

const card = (type, label, vars, prefer, build) => Object.freeze({ type, label, vars, prefer, build: (v) => keep(build(v)) });
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
    might: card('power', '力量+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [st('strength', a, 'self'), blk(b)]),
    agility: card('power', '敏捷+格挡', [[1, 3], [1, 20]], 0.6, ([a, b]) => [st('dexterity', a, 'self'), blk(b)]),
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
    inflame: card('power', '大量力量', [[1, 6]], 1, ([a]) => [st('strength', a, 'self')]),
    bastion: card('power', '再生+荆棘', [[1, 6], [1, 6]], 0.5, ([a, b]) => [st('regen', a, 'self'), st('thorns', b, 'self')]),
    footwork: card('power', '敏捷+抽 1 张', [[1, 3], [1, 1]], 0.7, ([a, b]) => [st('dexterity', a, 'self'), draw(b)]),
});

// 被动模板：数值固定，描述由模板给出。
const passive = (trigger, label, effects) => Object.freeze({ trigger, label, effects: () => effects.map((e) => ({ ...e })) });
export const PASSIVE_TEMPLATES = Object.freeze({
    'opening-strength': passive('battle-start', '开战获得 1 层力量', [st('strength', 1, 'self')]),
    'opening-dexterity': passive('battle-start', '开战获得 1 层敏捷', [st('dexterity', 1, 'self')]),
    'opening-guard': passive('battle-start', '开战获得 8 点格挡', [blk(8)]),
    'opening-weaken': passive('battle-start', '开战使全体敌人虚弱 1 层', [st('weak', 1, 'all-enemies')]),
    'opening-poison': passive('battle-start', '开战使全体敌人中毒 3 层', [st('poison', 3, 'all-enemies')]),
    'turn-guard': passive('turn-start', '回合开始获得 3 点格挡', [blk(3)]),
    'turn-mend': passive('turn-end', '回合结束回复 2 点生命', [heal(2)]),
    'hit-guard': passive('on-hit', '受击后获得 2 点格挡', [blk(2)]),
    'last-stand': passive('on-low-hp', '濒危时回复 12 点生命', [heal(12)]),
    'last-fury': passive('on-low-hp', '濒危时获得 2 层力量', [st('strength', 2, 'self')]),
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
    roar: skill('buff', '获得力量', () => [st('strength', 2, 'self')], 1, 2),
    mend: skill('heal', '治疗队友', (cap) => [heal(Math.min(60, part(cap, 0.6)), 'ally')], 1, 1),
    // v2 复合技能（技能角色 / 敌人共用；绝招随强度档在会话侧接入）。
    gash: skill('attack', '攻击+易伤', (cap) => [dmg(part(cap, 0.5)), st('vulnerable', 2, 'enemy')], 2, 1),
    sunder: skill('attack', '全体攻击+全体虚弱', (cap) => [dmg(part(cap, 0.3), 'all-enemies'), st('weak', 1, 'all-enemies')], 2, 2),
    'guard-strike': skill('attack', '攻击+自身格挡', (cap) => [dmg(part(cap, 0.5)), blk(part(cap, 0.4))], 2),
    ward: skill('defend', '队友格挡+回复', (cap) => [blk(part(cap, 0.5), 'ally'), heal(Math.min(60, part(cap, 0.3)), 'ally')], 1, 1),
    warcry: skill('buff', '全体格挡+全体力量', (cap) => [blk(part(cap, 0.3), 'all-allies'), st('strength', 1, 'all-allies')], 1, 2),
    leech: skill('attack', '攻击+全体队友回复', (cap) => [dmg(part(cap, 0.5)), heal(Math.min(60, part(cap, 0.2)), 'all-allies')], 2, 1),
    plague: skill('debuff', '全体中毒+全体易伤', (cap) => [st('poison', Math.min(10, part(cap, 0.3)), 'all-enemies'), st('vulnerable', 1, 'all-enemies')], 1, 2),
});
export const TEMPLATE_COSTS = Object.freeze([0, 1, 2, 3]);
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

function measure(t, v) {
    const effects = t.build(v);
    const total = estimateEffectsValue(effects);
    const first = estimateEffectsValue(effects.slice(0, 1));
    return { effects, total, share: total ? first / total : 0 };
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
    if (!t || !TEMPLATE_COSTS.includes(cost)) return null;
    const memo = `${key}|${cost}|${rarity}`;
    if (!solved.has(memo)) {
        // 校验窗口取 rarityWindow（与 evaluateCardBudget 同一口径），求解目标取该稀有度的中心值。
        const w = rarityWindow(cost, rarity);
        const base = w ? pick(t, combos(t.vars), w.target, (x) => x >= w.min - EPS && x <= w.max + EPS) : null;
        let out = null;
        if (base) {
            const upMax = w.max * COMBAT_RULES.upgradeAllowance;
            const target = Math.min(upMax, base.total + w.budget * 0.25);
            const up = pick(t, combos(t.vars, base.v), target, (x) => x > base.total + EPS && x <= upMax + EPS);
            const cardShape = { cost, rarity, effects: base.effects, ...(up ? { upgraded: { effects: up.effects } } : {}) };
            if (evaluateCardBudget(cardShape).ok) out = { type: t.type, effects: base.effects, ...(up ? { upgraded: { effects: up.effects } } : {}) };
            else if (up && evaluateCardBudget({ cost, rarity, effects: base.effects }).ok) out = { type: t.type, effects: base.effects };
        }
        solved.set(memo, out);
    }
    const hit = solved.get(memo);
    return hit ? clone(hit) : null;
}

// 给定费用无解时按距离取最近的可用费用；全部无解返回 null。rarity 可以是按费用给稀有度的函数。
export function nearestTemplateCost(key, cost, rarity) {
    const want = TEMPLATE_COSTS.includes(cost) ? cost : 1;
    const rarityAt = typeof rarity === 'function' ? rarity : () => rarity;
    const order = [...TEMPLATE_COSTS].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b);
    return order.find((c) => solveCardTemplate(key, c, rarityAt(c))) ?? null;
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

// 一次性道具模板（v2 阶段 3）：战斗中使用、不耗能量，数值固定；全部不需要选敌方目标。
const cleanse = (target = 'self') => ({ op: 'cleanse', target });
const item = (label, effects) => Object.freeze({ label, effects: () => effects.map((e) => ({ ...e })) });
export const ITEM_TEMPLATES = Object.freeze({
    potion: item('回复 12 点生命', [heal(12)]),
    barrier: item('获得 12 点格挡', [blk(12)]),
    bomb: item('对全体敌人造成 10 点伤害', [dmg(10, 'all-enemies')]),
    purify: item('净化自身减益并回复 4 点生命', [cleanse(), heal(4)]),
    tonic: item('获得 2 点能量', [energy(2)]),
    scroll: item('抽 3 张牌', [draw(3)]),
});
export function itemFromTemplate(key) {
    const t = Object.hasOwn(ITEM_TEMPLATES, key) ? ITEM_TEMPLATES[key] : null;
    return t ? { effects: t.effects(), description: t.label } : null;
}

export function skillFromTemplate(key, cap) {
    const t = Object.hasOwn(SKILL_TEMPLATES, key) ? SKILL_TEMPLATES[key] : null;
    return t ? { intent: t.intent, effects: t.build(cap), weight: t.weight, cooldown: t.cooldown, description: t.label } : null;
}
// 人物技能：卡牌模板按 heroSkillCost 费用、个人稀有度求值，不带升级版。
export function heroSkillFromTemplate(key, { id, name } = {}) {
    const solved = Object.hasOwn(CARD_TEMPLATES, key) ? solveCardTemplate(key, COMBAT_RULES.heroSkillCost, 'personal') : null;
    return solved ? { id, name, effects: solved.effects, description: CARD_TEMPLATES[key].label } : null;
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
    const byArchetype = Object.entries(ARCHETYPE_TEMPLATES).map(([arch, keys]) => `${arch}=${keys.join(',')}`).join('；');
    return [
        line('卡牌模板', CARD_TEMPLATES, (t) => `${{ attack: '攻击', skill: '技能', power: '能力' }[t.type]}·`),
        `0 费槽可用的卡牌模板：${zeroCost.join(',')}`,
        `各职业原型优先选用的卡牌模板（复合效果优先，单一效果补位）：${byArchetype}`,
        line('被动模板', PASSIVE_TEMPLATES),
        line('华而不实被动模板（只用于人物特性与装备被动，名称可起得气派，效果几乎没用）', FLAIR_PASSIVE_TEMPLATES),
        line('技能模板', SKILL_TEMPLATES),
        line('道具模板', ITEM_TEMPLATES),
    ].join('\n');
}

// 原型推荐模板：只用于提示词引导，校验仍接受目录中的任一模板键。
const ARCHETYPE_TEMPLATES = Object.freeze({
    warrior: ['bash', 'shatter', 'thunder', 'desperate', 'reap', 'inflame', 'brace', 'counter'],
    guardian: ['bash', 'guard', 'bulwark', 'counter', 'trip', 'cover', 'rally', 'bastion'],
    ranger: ['twin', 'scatter', 'quick', 'finisher', 'trip', 'footwork', 'prepare', 'rend'],
    assassin: ['flurry', 'venom', 'venom-draw', 'execute', 'jab', 'toxin', 'finisher', 'agility'],
    mage: ['sweep', 'thunder', 'wail', 'hex', 'surge', 'adrenal', 'flask', 'expose'],
    priest: ['mend', 'aegis', 'rally-draw', 'reap', 'regrow', 'hex', 'guard', 'prepare'],
    summoner: ['spikes', 'bastion', 'regrow', 'toxin', 'flask', 'scatter', 'rally', 'might'],
    bard: ['prepare', 'rally-draw', 'footwork', 'wail', 'quick', 'surge', 'cripple', 'might'],
});


