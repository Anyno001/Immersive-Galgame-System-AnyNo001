// 与 v0.39.0 原版的差分测试：schema 的全部导出。
// 用固定种子的变异器从合法夹具出发随机改字段（改值/删字段/加未知字段/换类型），覆盖各校验分支。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/schema.js';
import { BASIC_CARDS } from '../src/combat/rules.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/combat/schema.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const JUNK = [undefined, null, 0, -1, 1, 2, 3, 5, 99, 100, 1e9, '', ' ', 'x', '中文', 'a'.repeat(90), true, false, [], {}, [1], { a: 1 }, 'X', 'self', 'enemy', 'common', 'rare', 'main'];

// 随机变异：沿路径下钻，在若干处改动。
function mutate(value, rnd, rate) {
    if (Array.isArray(value)) {
        const out = value.map((item) => mutate(item, rnd, rate));
        if (rnd() < rate) out.splice(Math.floor(rnd() * (out.length + 1)), rnd() < 0.5 ? 1 : 0, clone(out[0] ?? 1));
        return out;
    }
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const r = rnd();
            if (r < rate * 0.3) continue;
            out[k] = r < rate ? JUNK[Math.floor(rnd() * JUNK.length)] : mutate(v, rnd, rate);
        }
        if (rnd() < rate * 0.5) out[`extra${Math.floor(rnd() * 3)}`] = 1;
        return out;
    }
    return rnd() < rate ? JUNK[Math.floor(rnd() * JUNK.length)] : value;
}

const eff = {
    dmg: { op: 'damage', amount: 6, hits: 1, target: 'enemy' },
    blk: { op: 'block', amount: 5 },
    heal: { op: 'heal', amount: 4, target: 'ally' },
    draw: { op: 'draw', amount: 1 },
    st: { op: 'status', status: 'weak', stacks: 1 },
    cond: { op: 'conditional', when: { kind: 'target-has', value: 'weak' }, then: [{ op: 'damage', amount: 3 }] },
    each: { op: 'each-turn', then: [{ op: 'block', amount: 2 }], at: 'turn-end' },
    buff: { op: 'buff', trigger: 'card-played', cardType: 'attack', turns: 2, then: [{ op: 'block', amount: 2 }] },
    dbl: { op: 'double', stat: 'poison' },
    next: { op: 'next-turn', gain: 'energy', amount: 1 },
    disc: { op: 'discard', amount: 1, mode: 'choose' },
    copy: { op: 'copy', amount: 1, from: 'choose', to: 'hand' },
    create: { op: 'create', card: 'status-wound', amount: 1 },
    cmod: { op: 'cost-mod', amount: -1, mode: 'self' },
    grow: { op: 'grow', amount: 1 },
    dh: { op: 'discard-hand', redraw: true },
    ex: { op: 'exhaust-self' },
    rep: { op: 'repeat-last' },
    rpl: { op: 'replay-next', cardType: 'skill' },
    sd: { op: 'self-damage', amount: 3 },
    dfb: { op: 'damage-from-block' },
    hc: { op: 'hand-cost', amount: -1 },
    cl: { op: 'cleanse' },
    en: { op: 'energy', amount: 1 },
};
const effectList = Object.values(eff);

const card = (id, extra = {}) => ({ id, name: `牌${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6, hits: 1 }], ...extra });
const skill = (id, extra = {}) => ({ id, name: `技${id}`, intent: 'attack', effects: [{ op: 'damage', amount: 6 }], weight: 2, cooldown: 1, description: '描述', ...extra });
const passive = (id, extra = {}) => ({ id, name: `被${id}`, trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }], description: 'd', ...extra });
const pool = (n, rarity, prefix) => Array.from({ length: n }, (_, i) => card(`${prefix}${i}`, { rarity, effects: [{ op: 'damage', amount: [3, 6, 10][i % 3] }], cost: i % 3 }));

const classProfile = { kind: 'class', v: 1, id: 'cls-1', className: '剑士', archetype: 'warrior', classPassive: passive('cp'), classPool: pool(8, 'common', 'c') };
const deckProfile = {
    kind: 'deck-character', v: 1, id: 'pc-1', name: '艾拉', aliases: ['艾', '艾', 'Ela'], classRef: 'cls-1',
    base: { hp: 80, energy: 3, draw: 5, speed: 100 }, growth: { hpPerLevel: 4 },
    personalPassive: passive('pp'), personalPool: pool(4, 'personal', 'p'),
    starterDeck: [...Array(3).fill('basic-strike'), ...Array(3).fill('basic-defend'), 'c0', 'c0', 'c1', 'c1', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'c5', 'p0', 'p1', 'p2', 'p3'].slice(0, 20),
    heroSkill: { id: 'hs', name: '英雄技', effects: [{ op: 'damage', amount: 14 }], description: 'x' },
    signatureCards: [card('sg0', { rarity: 'signature', effects: [{ op: 'damage', amount: 20 }], cost: 3 })],
};
const skillProfile = { kind: 'skill-character', v: 1, id: 'sc-1', name: '伙伴', aliases: [], className: '射手', base: { hp: 60, speed: 110 }, skills: [skill('s1'), skill('s2'), skill('s3')], passives: [passive('pa')], tier: 'peer' };
const enemyProfile = { kind: 'enemy', v: 1, id: 'en-1', name: '哥布林', tier: 'normal', art: 'goblin', base: { hp: 40, speed: 100 }, skills: [skill('k1'), skill('k2')], passives: [], phases: [], generated: true };
const bossProfile = { ...enemyProfile, id: 'en-2', tier: 'boss', base: { hp: 160 }, phases: [{ hpBelowPct: 50, addSkills: [skill('k9')], removeSkills: ['k1'], passives: [passive('ph')] }] };

const anchor = { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 };
const slotCard = (i) => ({ index: i, kind: 'card', rarity: 'rare', name: '奖励牌', origin: '来源', card: card(`rw${i}`, { rarity: 'rare' }) });
const ledger = (type, payload, extra = {}) => ({ id: `pc-1|${type}|3|0|abc|0`, type, character: 'pc-1', anchor, payload, createdAt: 100, ...extra });
const ledgerFixtures = [
    ledger('profile', deckProfile, { anchor: undefined }), ledger('profile', classProfile, { anchor: null }),
    ledger('exp', { amount: 20, reason: '击败' }), ledger('learn', { card: card('l1') }), ledger('learn', { skill: skill('l2') }),
    ledger('upgrade', { targetId: 'c0', card: card('c0') }), ledger('class', { classRef: 'cls-1' }), ledger('respec', { classRef: 'cls-1', cost: 10 }),
    ledger('ascend', { classRef: 'cls-1', tier: 2, tierName: '进阶', cards: pool(3, 'rare', 'a'), cost: 5 }),
    ledger('reward', { level: 3, choice: { kind: 'card', cardId: 'c0' } }), ledger('reward', { level: 3, choice: { kind: 'upgrade', targetId: 'c0' } }), ledger('reward', { level: 3, choice: { kind: 'skip' } }),
    ledger('rebuild', { personalPool: pool(4, 'personal', 'p'), starterDeck: deckProfile.starterDeck, cost: 0 }),
    ledger('deck', { cards: Array(22).fill('basic-strike'), revision: 2 }), ledger('revoke', { targetEntryId: 'a|b:c', reason: 'r' }, { anchor: null }),
    ledger('equip', { gearId: 'gr-1', name: '铁剑', slot: 'weapon', description: 'd', rarity: 'rare', passive: passive('gp'), bonus: { ability: 'str', amount: 2 } }),
    ledger('unequip', { gearId: 'gr-1' }), ledger('item', { itemId: 'it-1', name: '药', count: 2, effects: [{ op: 'heal', amount: 10 }], description: 'd' }),
    ledger('keepsake', { itemId: 'it-2', name: '信', origin: '母亲', rarity: 'rare' }), ledger('consume', { itemId: 'it-1', count: 1, reportId: 'r1' }),
    ledger('offer', { combatId: 'c1', tier: 'normal', exp: 20, reveal: 1, slots: [slotCard(0), slotCard(1), slotCard(2)], reserve: [slotCard(0), slotCard(1), slotCard(2)] }),
    ledger('offer', { combatId: 'c1', tier: 'elite', exp: 45, slots: [slotCard(0), { index: 1, kind: 'keepsake', rarity: 'common', name: '信' }, { index: 2, kind: 'item', rarity: 'common', name: '药', item: { itemId: 'it-1', name: '药', count: 1, effects: [{ op: 'heal', amount: 5 }], description: '' } }] }),
    ledger('loot', { combatId: 'c1', reportId: 'r1', set: 'main', slot: slotCard(1), cost: 3 }),
    ledger('sell', { lootId: 'a|b' }), ledger('sell', { gearId: 'gr-1', rarity: 'rare' }), ledger('sell', { itemId: 'it-1' }),
    ledger('trait', { traitId: 't1', name: '特质', origin: 'o', rarity: 'rare', passive: passive('tp'), link: 'reveal', cost: 5 }),
    ledger('trait', { traitId: 't2', name: '特质', origin: 'o', rarity: 'rare', kind: 'active', skill: { id: 'ts', name: '技', cost: 1, effects: [{ op: 'damage', amount: 8 }], description: 'd' }, cost: 5 }),
    ledger('trait-pick', { traitId: 't1', drop: 't0' }), ledger('trait-slot', { slot: 4, cost: 8 }),
    ledger('wound', { hp: 5, maxHp: 50, down: false, reportId: 'r1' }), ledger('heal', { amount: 30, mode: 'percent', scale: 50, reason: 'x' }), ledger('hurt', { tier: '轻伤', pct: 20, maxHp: 80 }),
];
const attrFixtures = [
    { id: 'a|init', type: 'init', character: 'pc-1', payload: { className: '剑士', role: 'warrior', major: 'str', minor: 'dex', weak: 'cha' }, createdAt: 1, change: '初始' },
    { id: 'a|rel', type: 'rel', character: 'pc-1', anchor, payload: { tier: 'even', anchorLevel: 3, offset: 2 }, createdAt: 1 },
    { id: 'a|story', type: 'story', character: 'pc-1', anchor, payload: { ability: 'free', amount: 1, reason: 'r' }, createdAt: 1 },
    { id: 'a|alloc1', type: 'alloc', character: 'pc-1', anchor, payload: { ability: 'str', amount: 2 }, createdAt: 1 },
    { id: 'a|alloc2', type: 'alloc', character: 'pc-1', anchor, payload: { picks: [{ ability: 'str', amount: 2 }, { ability: 'dex', amount: 3 }] }, createdAt: 1 },
    { id: 'a|reward', type: 'reward', character: 'pc-1', anchor, payload: { ability: 'int', amount: 2, reportId: 'r1' }, createdAt: 1 },
];

// 对一个夹具：原样 + 大量随机变异，两边结果必须深度相等。
function fuzz(label, fixture, fnName, count = 120) {
    const rnd = prng(label.length * 7919 + fixture.id?.length);
    assert.deepStrictEqual(mine[fnName](fixture), orig[fnName](fixture), `${label} 原样`);
    for (let i = 0; i < count; i += 1) {
        const input = mutate(fixture, rnd, [0.02, 0.05, 0.1, 0.25][i % 4]);
        assert.deepStrictEqual(mine[fnName](input), orig[fnName](input), `${label} #${i} ${JSON.stringify(input).slice(0, 200)}`);
    }
}

test('导出名集合与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(orig).sort());
    for (const k of Object.keys(orig)) {
        if (typeof orig[k] === 'function') continue;
        assert.deepStrictEqual(mine[k], orig[k], k);
        assert.ok(Object.isFrozen(mine[k]), `${k} frozen`);
    }
});

test('夹具本身能走通合法路径（防止全是错误分支）', () => {
    for (const p of [classProfile, deckProfile, skillProfile, enemyProfile, bossProfile]) assert.deepStrictEqual(mine.normalizeProfile(p), orig.normalizeProfile(p));
    const okCount = ledgerFixtures.filter((e) => orig.normalizeLedgerEntry(e).ok).length;
    assert.ok(okCount >= ledgerFixtures.length - 2, `合法夹具过少: ${okCount}/${ledgerFixtures.length}`);
    assert.ok(attrFixtures.every((e) => orig.normalizeAttributeRecord(e).ok));
    assert.ok([classProfile, deckProfile, skillProfile, enemyProfile, bossProfile].every((p) => orig.normalizeProfile(p).ok));
});

test('normalizeProfile 变异差分', () => {
    for (const [name, p] of Object.entries({ classProfile, deckProfile, skillProfile, enemyProfile, bossProfile })) fuzz(name, p, 'normalizeProfile', 250);
    for (const bad of [undefined, null, 5, 'x', [], {}, { kind: 'class', v: 2 }, { kind: 'zzz' }]) assert.deepStrictEqual(mine.normalizeProfile(bad), orig.normalizeProfile(bad));
});

test('normalizeCard / normalizeSkill：效果覆盖与变异', () => {
    for (const [key, e] of Object.entries(eff)) {
        const c = card(`e-${key}`, { effects: [e] });
        assert.deepStrictEqual(mine.normalizeCard(c), orig.normalizeCard(c), key);
        fuzz(`card-${key}`, c, 'normalizeCard', 80);
        const s = skill(`e-${key}`, { effects: [e] });
        assert.deepStrictEqual(mine.normalizeSkill(s), orig.normalizeSkill(s), key);
        fuzz(`skill-${key}`, s, 'normalizeSkill', 80);
    }
    for (const c of Object.values(BASIC_CARDS)) fuzz(`basic-${c.id}`, c, 'normalizeCard', 60);
    // 特殊卡：不可打出、升级、各标记。
    const specials = [
        card('u1', { unplayable: true, cost: 0, effects: [], onDiscard: [{ op: 'damage', amount: 3 }] }),
        card('u2', { unplayable: true, cost: 1, effects: [{ op: 'damage', amount: 1 }], upgraded: { cost: 0 } }),
        card('u3', { upgraded: { cost: 1, effects: [{ op: 'damage', amount: 7 }] } }),
        card('u4', { upgraded: {} }),
        card('u5', { retain: true, innate: true, ethereal: false, onDiscard: [{ op: 'draw', amount: 1 }] }),
        card('u6', { retain: 'yes' }),
        card('u7', { effects: [{ op: 'conditional', when: { kind: 'self-hp-below', value: 50 }, then: [{ op: 'conditional', when: { kind: 'self-has', value: 'weak' }, then: [{ op: 'block', amount: 1 }] }] }] }),
        card('u8', { effects: [{ op: 'discard', amount: 2, mode: 'random' }, { op: 'copy', amount: 1, from: 'random' }] }),
    ];
    for (const c of specials) {
        assert.deepStrictEqual(mine.normalizeCard(c), orig.normalizeCard(c), c.id);
        fuzz(`special-${c.id}`, c, 'normalizeCard', 80);
    }
    // 随机组合多个效果。
    const rnd = prng(99);
    for (let i = 0; i < 300; i += 1) {
        const n = 1 + Math.floor(rnd() * 4);
        const effects = Array.from({ length: n }, () => clone(effectList[Math.floor(rnd() * effectList.length)]));
        const c = card(`r${i}`, { effects, cost: [0, 1, 2, 3, 'X'][i % 5], type: ['attack', 'skill', 'power'][i % 3], rarity: ['common', 'rare', 'epic', 'personal', 'signature'][i % 5] });
        assert.deepStrictEqual(mine.normalizeCard(c), orig.normalizeCard(c), JSON.stringify(c));
        const s = skill(`r${i}`, { effects, intent: ['attack', 'basic-defend', 'buff'][i % 3] });
        assert.deepStrictEqual(mine.normalizeSkill(s), orig.normalizeSkill(s), JSON.stringify(s));
    }
    for (const bad of [undefined, null, 1, 'x', []]) {
        assert.deepStrictEqual(mine.normalizeCard(bad), orig.normalizeCard(bad));
        assert.deepStrictEqual(mine.normalizeSkill(bad), orig.normalizeSkill(bad));
    }
});

test('normalizeLedgerEntry 变异差分', () => {
    for (const e of ledgerFixtures) fuzz(`ledger-${e.type}-${e.id.length}`, e, 'normalizeLedgerEntry', 120);
    for (const bad of [undefined, null, 5, 'x', {}, { type: 'zzz' }, ledger('exp', null), ledger('profile', deckProfile, { character: 'other' })]) {
        assert.deepStrictEqual(mine.normalizeLedgerEntry(bad), orig.normalizeLedgerEntry(bad));
    }
});

test('normalizeAttributeRecord 变异差分', () => {
    for (const e of attrFixtures) fuzz(`attr-${e.id}`, e, 'normalizeAttributeRecord', 150);
    const withScores = { ...attrFixtures[0], payload: { ...attrFixtures[0].payload, scores: { str: 15, dex: 14, con: 12, int: 10, wis: 10, cha: 8 } } };
    fuzz('attr-scores', withScores, 'normalizeAttributeRecord', 100);
    for (const bad of [undefined, null, 5, {}, { type: 'zzz' }]) assert.deepStrictEqual(mine.normalizeAttributeRecord(bad), orig.normalizeAttributeRecord(bad));
});

test('buildCardCatalog / validateStarterDeck', () => {
    const cls = orig.normalizeProfile(classProfile).value;
    const deck = orig.normalizeProfile(deckProfile).value;
    const catA = mine.buildCardCatalog(deck, cls);
    const catB = orig.buildCardCatalog(deck, cls);
    assert.deepStrictEqual([...catA.entries()], [...catB.entries()]);
    assert.deepStrictEqual([...mine.buildCardCatalog().entries()], [...orig.buildCardCatalog().entries()]);
    assert.deepStrictEqual(mine.validateStarterDeck(deck, cls), orig.validateStarterDeck(deck, cls));
    assert.deepStrictEqual(mine.validateStarterDeck(deck, null), orig.validateStarterDeck(deck, null));
    assert.deepStrictEqual(mine.validateStarterDeck(deck, { ...cls, kind: 'enemy' }), orig.validateStarterDeck(deck, { ...cls, kind: 'enemy' }));
    const rnd = prng(5);
    const ids = ['basic-strike', 'basic-defend', ...cls.classPool.map((c) => c.id), ...deck.personalPool.map((c) => c.id), 'sg0', 'zzz'];
    for (let i = 0; i < 300; i += 1) {
        const variant = {
            ...clone(deck),
            classRef: i % 7 === 0 ? 'other' : deck.classRef,
            starterDeck: Array.from({ length: 20 }, () => ids[Math.floor(rnd() * ids.length)]),
        };
        if (i % 5 === 0) variant.personalPool = [...variant.personalPool, clone(cls.classPool[0]), clone(BASIC_CARDS['basic-strike'] ?? Object.values(BASIC_CARDS)[0])];
        if (i % 6 === 0) variant.signatureCards = [...(variant.signatureCards || []), { id: 'c0', rarity: 'signature' }, { id: 'p0', rarity: 'signature' }];
        assert.deepStrictEqual(mine.validateStarterDeck(variant, cls), orig.validateStarterDeck(variant, cls), `starter ${i}`);
    }
});

test('ledgerEntryId / profileIdFor / gearIdFor / itemIdFor / effectsDamage', () => {
    for (const a of [anchor, null, undefined, { messageId: 1, swipeId: 2, tagHash: 'z', occurrence: 3 }]) {
        assert.strictEqual(mine.ledgerEntryId('pc', 'exp', a), orig.ledgerEntryId('pc', 'exp', a));
    }
    for (const kind of ['class', 'deck-character', 'skill-character', 'enemy', 'other', undefined]) {
        for (const name of ['艾拉', ' Ela ', '', null, undefined, 12]) assert.strictEqual(mine.profileIdFor(kind, name), orig.profileIdFor(kind, name));
    }
    for (const name of ['铁 剑', '铁剑', 'Ｉron  Sword', '', null, undefined, '  A b  ']) {
        assert.strictEqual(mine.gearIdFor(name), orig.gearIdFor(name));
        assert.strictEqual(mine.itemIdFor(name), orig.itemIdFor(name));
    }
    const lists = [undefined, null, 'x', [], effectList, [null, 1, { op: 'damage', amount: 5, hits: 3 }], [{ op: 'conditional', then: [{ op: 'damage', amount: 4 }] }], [{ op: 'buff', then: [eff.cond] }], [eff.dfb]];
    for (const l of lists) assert.strictEqual(mine.effectsDamage(l), orig.effectsDamage(l));
});
