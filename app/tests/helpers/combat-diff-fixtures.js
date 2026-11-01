// 战斗差分测试共用夹具：固定种子 PRNG、覆盖多种效果的牌库与敌人、随机 setup 生成、v0.39.0 原包加载。
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const V039_BUNDLE = 'G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js';

// 原包模块；原包不在本机时返回 null，调用方应跳过测试。
export function loadV039(path) {
    try {
        require(V039_BUNDLE);
    } catch {
        return null;
    }
    return globalThis.__igsRequire(path);
}

export function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

const dmg = (amount, extra = {}) => ({ op: 'damage', amount, target: 'enemy', ...extra });
const blk = (amount, extra = {}) => ({ op: 'block', amount, target: 'self', ...extra });
const status = (name, stacks, target) => ({ op: 'status', status: name, stacks, ...(target ? { target } : {}) });
const card = (id, type, cost, effects, extra = {}) => ({ id, name: id, type, cost, rarity: 'common', effects, ...extra });

// 覆盖几乎所有 op 的牌。
export const CARD_POOL = [
    card('strike', 'attack', 1, [dmg(6)], { upgraded: { effects: [dmg(9)] } }),
    card('defend', 'skill', 1, [blk(5)], { upgraded: { cost: 0, effects: [blk(5)] } }),
    card('twin', 'attack', 1, [dmg(4, { hits: 2 })]),
    card('sweep', 'attack', 2, [dmg(5, { target: 'all-enemies' })]),
    card('scatter', 'attack', 1, [dmg(3, { target: 'random-enemy', hits: 3 })]),
    card('heavy', 'attack', 3, [dmg(16, { strengthScale: 2 })]),
    card('bash', 'attack', 2, [dmg(8), status('vulnerable', 2, 'enemy')]),
    card('venom', 'skill', 1, [status('poison', 4, 'enemy')]),
    card('hex', 'skill', 1, [status('weak', 2, 'enemy'), status('frail', 1, 'enemy')]),
    card('flex', 'skill', 0, [status('strength', 2), { op: 'exhaust-self' }]),
    card('agile', 'power', 1, [status('dexterity', 1), status('thorns', 2), status('regen', 2)]),
    card('shell', 'skill', 1, [status('artifact', 1), status('endure', 1), blk(3)]),
    card('ghost', 'skill', 2, [status('intangible', 1), { op: 'draw', amount: 1 }]),
    card('focus', 'skill', 1, [{ op: 'draw', amount: 2 }]),
    card('surge', 'skill', 0, [{ op: 'energy', amount: 1 }, { op: 'exhaust-self' }]),
    card('mend', 'skill', 1, [{ op: 'heal', amount: 6 }]),
    card('bless', 'skill', 2, [{ op: 'heal-pct', pct: 15, target: 'all-allies' }, blk(4, { target: 'all-allies' })]),
    card('rally', 'skill', 1, [status('strength', 1, 'other-allies'), blk(3, { target: 'ally' })]),
    card('rage', 'attack', 1, [{ op: 'self-damage', amount: 3 }, dmg(10)]),
    card('combo', 'attack', 1, [dmg(5), { op: 'conditional', when: { kind: 'target-has', value: 'vulnerable' }, then: [dmg(6)] }]),
    card('streak', 'attack', 0, [dmg(3), { op: 'conditional', when: { kind: 'cards-played-gte', value: 2 }, then: [dmg(5)] }]),
    card('twinplay', 'attack', 0, [dmg(2), { op: 'conditional', when: { kind: 'same-card-gte', value: 1 }, then: [dmg(4)] }]),
    card('bulwark', 'skill', 1, [blk(4), { op: 'double', stat: 'block' }]),
    card('overload', 'skill', 1, [status('strength', 1), { op: 'double', stat: 'strength' }]),
    card('slam', 'attack', 1, [{ op: 'damage-from-block' }]),
    card('prep', 'skill', 1, [{ op: 'next-turn', gain: 'energy', amount: 1 }, { op: 'next-turn', gain: 'draw', amount: 1 }, { op: 'next-turn', gain: 'status', status: 'weak', stacks: 1 }]),
    card('engine', 'power', 2, [{ op: 'each-turn', then: [blk(3)] }, { op: 'each-turn', at: 'turn-end', then: [dmg(2, { target: 'all-enemies' })] }]),
    card('discount', 'skill', 0, [{ op: 'hand-cost', amount: -1 }, { op: 'exhaust-self' }]),
    card('purge', 'skill', 1, [{ op: 'cleanse' }, blk(2)]),
    card('toss', 'skill', 0, [{ op: 'discard', amount: 1, mode: 'random' }, { op: 'draw', amount: 2 }]),
    card('select', 'skill', 0, [{ op: 'discard', amount: 2, mode: 'choose' }, { op: 'draw', amount: 2 }]),
    card('refresh', 'skill', 1, [{ op: 'discard-hand', redraw: true }]),
    card('dup', 'skill', 1, [{ op: 'copy', from: 'choose', amount: 1, to: 'hand' }, { op: 'exhaust-self' }]),
    card('dupself', 'skill', 1, [{ op: 'copy', from: 'self', amount: 1, to: 'draw' }]),
    card('conjure', 'skill', 1, [{ op: 'create', card: 'token-shard', amount: 2, to: 'hand' }, { op: 'create', card: 'token-ward', amount: 1, to: 'draw' }, { op: 'create', card: 'token-spark', amount: 1, to: 'discard' }]),
    card('again', 'skill', 1, [{ op: 'repeat-last', amount: 1 }]),
    card('echo', 'skill', 1, [{ op: 'replay-next', amount: 1 }]),
    card('echo-atk', 'skill', 1, [{ op: 'replay-next', amount: 1, cardType: 'attack' }]),
    card('whet', 'skill', 1, [{ op: 'grow', amount: 3 }, dmg(4)]),
    card('trim', 'skill', 0, [{ op: 'cost-mod', mode: 'choose', amount: -1, scope: 'turn' }]),
    card('trim-all', 'skill', 1, [{ op: 'cost-mod', mode: 'random', amount: -1, scope: 'combat' }, { op: 'cost-mod', mode: 'self', amount: 1, scope: 'combat' }]),
    card('vow', 'power', 1, [{ op: 'buff', trigger: 'card-played', cardType: 'attack', turns: 3, then: [blk(2)] }, { op: 'buff', trigger: 'discard', turns: 2, then: [dmg(2)] }]),
    card('xblast', 'attack', 'X', [dmg(4, { target: 'all-enemies' })]),
    card('xguard', 'skill', 'X', [blk(3)]),
    card('first', 'attack', 1, [dmg(7)], { innate: true }),
    card('wisp', 'skill', 1, [blk(6)], { ethereal: true }),
    card('keep', 'skill', 1, [blk(3)], { retain: true }),
    card('rot', 'skill', 0, [], { unplayable: true, onDiscard: [dmg(3, { target: 'all-enemies' })] }),
    card('guilt', 'skill', 0, [], { unplayable: true }),
    card('recoil', 'skill', 1, [blk(4)], { onDiscard: [{ op: 'draw', amount: 1 }] }),
];

export const CATALOG = Object.fromEntries(CARD_POOL.map((c) => [c.id, c]));
const CARD_IDS = CARD_POOL.map((c) => c.id);

const SKILL_POOL = [
    { id: 'claw', name: '利爪', intent: 'attack', effects: [dmg(7)] },
    { id: 'bite', name: '撕咬', intent: 'attack', effects: [dmg(4, { hits: 2 })] },
    { id: 'roar', name: '咆哮', intent: 'buff', effects: [status('strength', 2)] },
    { id: 'curse', name: '诅咒', intent: 'debuff', effects: [status('weak', 2, 'enemy'), { op: 'create', card: 'status-daze', amount: 1, to: 'draw' }] },
    { id: 'wall', name: '壁垒', intent: 'defend', effects: [blk(8)] },
    { id: 'spit', name: '毒液', intent: 'debuff', effects: [status('poison', 3, 'enemy'), status('vulnerable', 1, 'enemy')] },
    { id: 'rend', name: '撕裂', intent: 'attack', weight: 2, effects: [dmg(5, { target: 'all-enemies' })] },
    { id: 'mend', name: '再生', intent: 'heal', effects: [{ op: 'heal-pct', pct: 10 }] },
];

function buildEnemy(rng, index, tier) {
    const skills = [];
    const pool = SKILL_POOL.slice();
    for (let i = 0; i < 3; i += 1) skills.push({ ...pool.splice(Math.floor(rng() * pool.length), 1)[0] });
    if (tier !== 'normal') skills.push({ id: 'ultimate', name: '大招', intent: 'attack', ultimate: true, cooldown: 3, effects: [dmg(12, { target: 'all-enemies' })] });
    skills[0].cooldown = 2;
    const unit = {
        id: `e${index}`,
        name: `敌${index}`,
        side: 'enemy',
        kind: 'skill',
        maxHp: tier === 'boss' ? 90 : tier === 'elite' ? 55 : 30,
        speed: 80 + Math.floor(rng() * 40),
        damageScale: 1 + Math.floor(rng() * 3) * 0.25,
        skills,
    };
    if (rng() < 0.6) unit.passives = [{ id: 'spiky', trigger: 'on-hit', effects: [status('strength', 1)] }, { id: 'frenzy', trigger: 'on-low-hp', effects: [blk(10), status('strength', 2)] }];
    if (tier === 'boss') {
        unit.phases = [{ hpBelowPct: 60, addSkills: [{ id: 'rage1', name: '狂暴', intent: 'attack', effects: [dmg(9, { hits: 2 })] }], passives: [{ id: 'p-start', trigger: 'turn-start', effects: [blk(4)] }] }, { hpBelowPct: 30, removeSkills: ['wall'], addSkills: [{ id: 'rage2', name: '暴走', intent: 'attack', weight: 3, effects: [dmg(6, { target: 'all-enemies' })] }] }];
    }
    return unit;
}

function buildDeckUnit(rng, id, isHero, side, allCards) {
    const size = 12 + Math.floor(rng() * 8);
    const deck = [];
    for (let i = 0; i < size; i += 1) {
        const cardId = i < 3 ? 'strike' : i < 5 ? 'defend' : pick(rng, allCards);
        deck.push(rng() < 0.2 ? { cardId, upgraded: true } : rng() < 0.5 ? cardId : { cardId });
    }
    const unit = { id, name: id, side, kind: 'deck', maxHp: isHero ? 70 : 55, speed: 90 + Math.floor(rng() * 30), deck, catalog: rng() < 0.5 ? CATALOG : new Map(Object.entries(CATALOG)) };
    if (isHero) {
        unit.heroSkill = { id: 'hs', name: '英雄技', effects: [dmg(10), blk(4)] };
        if (rng() < 0.7) {
            unit.traits = [
                { id: 'tr1', kind: 'active', skill: { id: 'tr1s', name: '天赋一', cost: 1, effects: [{ op: 'heal', amount: 5 }, status('strength', 1)] } },
                { id: 'tr2', kind: 'active', skill: { id: 'tr2s', name: '天赋二', cost: 2, effects: [dmg(6, { target: 'all-enemies' })] } },
                { id: 'tr3', kind: 'passive' },
            ];
        }
        unit.passives = [{ id: 'hero-start', trigger: 'battle-start', effects: [blk(3)] }, { id: 'hero-card', trigger: 'card-played', effects: [{ op: 'heal', amount: 1 }] }];
    }
    return unit;
}

// 随机战斗配置。变化点：敌人数/档位/后备、同伴数、牌库、觉醒、道具、逃跑、趁胜追击、wipe。
export function randomSetup(rng) {
    const allCards = CARD_IDS.slice();
    const enemyCount = 1 + Math.floor(rng() * 4);
    const units = [buildDeckUnit(rng, 'hero', true, 'ally', allCards)];
    const allyCount = Math.floor(rng() * 3);
    for (let i = 0; i < allyCount; i += 1) units.push(buildDeckUnit(rng, `ally${i}`, false, 'ally', allCards));
    if (rng() < 0.3) units.push({ id: 'npc', name: 'npc', side: 'ally', kind: 'skill', maxHp: 40, skills: [{ id: 'jab', name: '戳', effects: [dmg(5)] }, { id: 'aid', name: '援护', effects: [blk(6, { target: 'ally' })] }] });
    const tiers = ['normal', 'elite', 'boss'];
    for (let i = 0; i < enemyCount; i += 1) units.push(buildEnemy(rng, i, pick(rng, tiers)));
    const setup = { units, controlledId: 'hero', canEscape: rng() < 0.7 };
    if (rng() < 0.3 && enemyCount >= 3) setup.reserve = [`e${enemyCount - 1}`];
    if (rng() < 0.7) setup.awaken = { type: pick(rng, ['rage', 'guard', 'grief', 'resolve', 'bond', 'limit', 'vengeance', 'unyielding']), line: '不会输' };
    if (rng() < 0.7) {
        setup.items = [
            { itemId: 'potion', name: '药水', count: 2, effects: [{ op: 'heal', amount: 12 }] },
            { itemId: 'bomb', name: '炸弹', count: 1, effects: [dmg(15)] },
            { itemId: 'tonic', count: 1, effects: [{ op: 'heal', amount: 5, target: 'ally' }] },
        ];
    }
    if (rng() < 0.25) setup.overkill = true;
    if (rng() < 0.25) setup.wipe = true;
    if (rng() < 0.2) setup.rulesVersion = 3;
    return setup;
}

export const ACTION_KINDS = ['play', 'end-turn', 'escape', 'hero-skill', 'trait-skill', 'awaken', 'item', 'choose'];

export function kindOf(action) {
    return action.type === 'hero-skill' && action.skillId ? 'trait-skill' : action.type;
}

// 从合法动作里挑一个。prefer 为偏好的动作种类，偏好存在时有较大概率选它。
export function chooseAction(rng, legal, prefer) {
    const choose = legal.filter((a) => a.type === 'choose');
    if (choose.length) return pick(rng, choose);
    const preferred = legal.filter((a) => kindOf(a) === prefer);
    if (preferred.length && rng() < (prefer === 'escape' ? 0.12 : 0.5)) return pick(rng, preferred);
    const plays = legal.filter((a) => a.type === 'play');
    if (plays.length && rng() < 0.8) return pick(rng, plays);
    const nonEnd = legal.filter((a) => a.type !== 'end-turn' && a.type !== 'escape');
    if (nonEnd.length && rng() < 0.7) return pick(rng, nonEnd);
    const end = legal.find((a) => a.type === 'end-turn');
    return end && rng() < 0.9 ? end : pick(rng, legal);
}

// 打若干场随机战斗，收集每一步之后的 state（含开局），给 battle-state、policy 的差分测试当输入。
export function collectStates(engine, games, maxPerGame = 400) {
    const states = [];
    for (let game = 0; game < games; game += 1) {
        const rng = makeRng(5000 + game);
        const setup = randomSetup(rng);
        let state = engine.createBattle(setup, Math.floor(rng() * 4294967295)).state;
        states.push(state);
        for (let step = 0; step < maxPerGame && !state.outcome; step += 1) {
            const legal = engine.legalActions(state);
            if (!legal.length) break;
            state = engine.applyAction(state, chooseAction(rng, legal, 'play')).state;
            states.push(state);
        }
    }
    return states;
}
