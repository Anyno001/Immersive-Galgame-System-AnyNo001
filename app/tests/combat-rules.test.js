import test from 'node:test';
import assert from 'node:assert/strict';
import { BASIC_CARDS, COMBAT_RULES, estimateEffectsValue, evaluateCardBudget, expProgress, levelFromExp, validateDeck } from '../src/combat/rules.js';
import { effectsDamage, ledgerEntryId, normalizeCard, normalizeLedgerEntry, normalizeProfile, normalizeSkill, validateStarterDeck } from '../src/combat/schema.js';

const attack = (id, amount = 6) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });

const classProfile = () => ({
    kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior',
    classPassive: { id: 'p-edge', name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
    classPool: [attack('c1'), attack('c2'), guard('c3'), guard('c4'), attack('c5'), attack('c6'), guard('c7'), guard('c8')],
});

const deckCharacter = () => ({
    kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: { id: 'p-will', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
    personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')],
    starterDeck: [
        'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
        'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4',
        'm1', 'm1', 'm2', 'm2',
    ],
});

test('combat-rules: basic cards sit inside their cost budget', () => {
    for (const card of Object.values(BASIC_CARDS)) assert.equal(evaluateCardBudget(card).ok, true, card.id);
});

test('combat-rules: budget rejects over, under and non-improving upgrades with a field path', () => {
    const over = evaluateCardBudget(attack('x', 12));
    assert.equal(over.ok, false);
    assert.equal(over.reason, 'over-budget');
    assert.equal(over.path, 'effects');
    assert.equal(evaluateCardBudget(attack('x', 3)).reason, 'under-budget');
    const worse = { ...attack('x'), upgraded: { effects: [{ op: 'damage', amount: 4 }] } };
    assert.equal(evaluateCardBudget(worse).reason, 'upgrade-not-better');
    assert.equal(evaluateCardBudget({ ...attack('x'), cost: 4 }).reason, 'invalid-cost');
});

test('combat-rules: deck size 20-30 and at most three copies of one card', () => {
    const owned = new Map([['a', 9], ['b', 9], ['c', 9], ['d', 9], ['e', 9], ['f', 9], ['g', 9], ['h', 9], ['i', 9], ['j', 9], ['k', 9]]);
    const ids = [...owned.keys()];
    const catalog = new Map(ids.map((id) => [id, attack(id)]));
    const deckOf = (n) => Array.from({ length: n }, (_, i) => ids[i % ids.length]);
    assert.equal(validateDeck(deckOf(19), owned, catalog).errors[0].reason, 'deck-too-small');
    assert.equal(validateDeck(deckOf(20), owned, catalog).ok, true);
    assert.equal(validateDeck(deckOf(30), owned, catalog).ok, true);
    assert.ok(validateDeck(deckOf(31), owned, catalog).errors.some((e) => e.reason === 'deck-too-large'));
    const fourCopies = [...deckOf(19).filter((id) => id !== 'a'), 'a', 'a', 'a', 'a'];
    assert.ok(validateDeck(fourCopies, owned, catalog).errors.some((e) => e.reason === 'copy-limit' && e.cardId === 'a'));
    assert.ok(validateDeck([...deckOf(19), 'zz'], owned, catalog).errors.some((e) => e.reason === 'not-owned' && e.cardId === 'zz'));
    assert.ok(validateDeck(deckOf(20), owned).errors.some((e) => e.reason === 'unknown-card'));
    assert.ok(validateDeck(['a', 'a'], { a: 1 }, catalog).errors.some((e) => e.reason === 'owned-exceeded'));
});

test('稀有度分档：基础至史诗三张、神话与专属一张；旧 rare 保留且未知档拒收', async () => {
    const { cardCopyLimit, rarityWindow } = await import('../src/combat/rules.js');
    const { normalizeCard } = await import('../src/combat/schema.js');
    for (const rarity of ['basic', 'common', 'uncommon', 'rare', 'epic', 'personal', 'mythic', 'signature']) {
        const limit = ['mythic', 'signature'].includes(rarity) ? 1 : 3;
        assert.equal(cardCopyLimit(rarity), limit);
        const catalog = new Map([['x', { rarity }]]);
        const check = (n) => validateDeck(Array(n).fill('x'), { x: 4 }, catalog).errors.filter((e) => e.reason === 'copy-limit');
        assert.deepEqual(check(limit), []);
        assert.equal(check(limit + 1)[0].detail.limit, limit);
    }
    assert.equal(cardCopyLimit('legendary'), 0);
    assert.equal(rarityWindow(1, 'legendary'), null);
    assert.ok(validateDeck(['x'], { x: 1 }, new Map([['x', { rarity: 'legendary' }]])).errors.some((e) => e.reason === 'invalid-rarity'));
    for (const [rarity, min, max, target] of [['epic', 7.2, 12, 10.4], ['mythic', 9.6, 13.2, 11.6]]) {
        assert.deepEqual(rarityWindow(1, rarity), { budget: 8, min, max, target });
        const c = { ...attack('x'), rarity, effects: [{ op: 'block', amount: 7 }] };
        assert.equal(normalizeCard(c).ok, true, JSON.stringify(normalizeCard(c).errors));
        assert.equal(evaluateCardBudget({ ...c, effects: [{ op: 'block', amount: 4 }] }).reason, 'under-budget');
        assert.equal(evaluateCardBudget({ ...c, effects: [{ op: 'block', amount: 9 }] }).reason, 'over-budget');
        assert.equal(evaluateCardBudget({ ...c, upgraded: { effects: [{ op: 'block', amount: 8 }] } }).ok, true);
        assert.equal(evaluateCardBudget({ ...c, upgraded: { effects: [{ op: 'block', amount: 11 }] } }).reason, 'upgrade-over-budget');
        const cls = classProfile();
        cls.classPool[0] = { ...c, id: 'c1' };
        assert.equal(normalizeProfile(cls).ok, true);
    }
    const legacy = classProfile();
    legacy.classPool[0].rarity = 'rare';
    const normalized = normalizeProfile(legacy);
    assert.equal(normalized.ok, true);
    assert.equal(normalized.value.classPool[0].rarity, 'rare');
    assert.equal(validateStarterDeck(deckCharacter(), normalized.value).ok, true);
});


test('combat-rules: experience curve is monotonic and capped', () => {
    assert.equal(levelFromExp(0), 1);
    assert.equal(levelFromExp(39), 1);
    assert.equal(levelFromExp(40), 2);
    let last = 1;
    for (let exp = 0; exp < 20000; exp += 25) {
        const level = levelFromExp(exp);
        assert.ok(level >= last);
        last = level;
    }
    assert.equal(last, COMBAT_RULES.maxLevel);
    assert.deepEqual(expProgress(50), { level: 2, into: 10, next: 60 });
});

test('combat-schema: valid class and deck character pass and the starter deck matches the fixed shape', () => {
    const cls = normalizeProfile(classProfile());
    assert.equal(cls.ok, true, JSON.stringify(cls.errors));
    const hero = normalizeProfile(deckCharacter());
    assert.equal(hero.ok, true, JSON.stringify(hero.errors));
    assert.equal(hero.value.base.energy, COMBAT_RULES.energyPerTurn);
    assert.deepEqual(validateStarterDeck(hero.value, cls.value), { ok: true, errors: [] });
    const shifted = { ...hero.value, starterDeck: hero.value.starterDeck.map((id) => (id === 'm2' ? 'c4' : id)) };
    assert.ok(validateStarterDeck(shifted, cls.value).errors.some((e) => e.reason === 'starter-shape'));
});

test('combat-schema: rejects bad fields with a field path instead of repairing them', () => {
    const unknownOp = classProfile();
    unknownOp.classPool[0] = { ...attack('c1'), effects: [{ op: 'teleport', amount: 3 }] };
    assert.ok(normalizeProfile(unknownOp).errors.some((e) => e.path === 'classPool[0].effects[0].op' && e.reason === 'invalid-enum'));
    const extra = { ...classProfile(), secret: 1 };
    assert.ok(normalizeProfile(extra).errors.some((e) => e.path === 'secret' && e.reason === 'unknown-field'));
    const noClass = deckCharacter();
    delete noClass.classRef;
    assert.ok(normalizeProfile(noClass).errors.some((e) => e.path === 'classRef' && e.reason === 'invalid-id'));
    const greedy = classProfile();
    greedy.classPool[1] = attack('c2', 15);
    assert.ok(normalizeProfile(greedy).errors.some((e) => e.path === 'classPool[1].effects' && e.reason === 'over-budget'));
    assert.equal(normalizeProfile({ ...classProfile(), v: 99 }).errors[0].reason, 'unsupported-version');
});

test('combat-schema: enemies respect tier damage caps and bosses need a phase', () => {
    const skill = (id, amount) => ({ id, name: `\u6280${id}`, intent: 'attack', effects: [{ op: 'damage', amount }] });
    const enemy = { kind: 'enemy', id: 'en-boss', name: '\u9996\u9886', tier: 'boss', base: { hp: 160 }, skills: [skill('s1', 10), skill('s2', 12)] };
    assert.ok(normalizeProfile(enemy).errors.some((e) => e.reason === 'boss-needs-phase'));
    const capped = { ...enemy, tier: 'normal', base: { hp: 40 }, skills: [skill('s1', 10), skill('s2', 13)] };
    assert.ok(normalizeProfile(capped).errors.some((e) => e.path === 'skills[1].effects' && e.reason === 'damage-cap'));
    const phased = { ...enemy, phases: [{ hpBelowPct: 50, addSkills: [skill('s3', 20)] }] };
    assert.equal(normalizeProfile(phased).ok, true, JSON.stringify(normalizeProfile(phased).errors));
});

test('combat-schema: ledger entries require anchors except profile and revoke', () => {
    const anchor = { messageId: 12, swipeId: 0, tagHash: 'abc', occurrence: 0 };
    const exp = { id: ledgerEntryId('exp', 'pc-hero', anchor), type: 'exp', character: 'pc-hero', anchor, payload: { amount: 30 }, createdAt: 1 };
    assert.equal(normalizeLedgerEntry(exp).ok, true, JSON.stringify(normalizeLedgerEntry(exp).errors));
    assert.ok(normalizeLedgerEntry({ ...exp, anchor: null }).errors.some((e) => e.path === 'anchor' && e.reason === 'anchor-required'));
    const profile = { id: ledgerEntryId('profile', 'cls-blade'), type: 'profile', character: 'cls-blade', anchor: null, payload: classProfile(), createdAt: 1 };
    assert.equal(normalizeLedgerEntry(profile).ok, true, JSON.stringify(normalizeLedgerEntry(profile).errors));
    assert.ok(normalizeLedgerEntry({ ...profile, character: 'cls-other' }).errors.some((e) => e.reason === 'profile-id-mismatch'));
    const learn = { ...exp, type: 'learn', payload: {} };
    assert.ok(normalizeLedgerEntry(learn).errors.some((e) => e.reason === 'card-or-skill'));
});


test('档案 base.speed 可选：有值时校验范围并保留，缺省时不补字段', () => {
    const kept = normalizeProfile({ ...deckCharacter(), base: { hp: 80, speed: 130 } });
    assert.equal(kept.ok, true);
    assert.equal(kept.value.base.speed, 130);
    assert.equal(normalizeProfile({ ...deckCharacter(), base: { hp: 80, speed: 500 } }).ok, false);
    const legacy = normalizeProfile(deckCharacter());
    assert.equal(legacy.ok, true);
    assert.equal(Object.hasOwn(legacy.value.base, 'speed'), false);
});


test('稀有度窗口：未登记稀有度拒收，v1 旧卡仍合法，高稀有度上限更宽，signature 有下限', () => {
    assert.equal(evaluateCardBudget({ ...attack('x'), rarity: 'legendary' }).reason, 'invalid-rarity');
    const at = (amount, cost, rarity) => evaluateCardBudget({ ...attack('x', amount), cost, rarity });
    assert.equal(at(13, 2, 'rare').ok, true);
    assert.equal(at(14, 2, 'rare').ok, true);
    assert.equal(at(14, 2, 'common').reason, 'over-budget');
    assert.equal(at(13, 2, 'signature').ok, true);
    assert.equal(at(12, 2, 'signature').reason, 'under-budget');
    assert.equal(at(17, 2, 'signature').reason, 'over-budget');
});

test('专属卡与强度档为可选字段：旧档案不补字段，越界与混入起始卡组按字段路径拒收', () => {
    const sig = (id) => ({ id, name: `终${id}`, type: 'attack', cost: 2, rarity: 'signature', effects: [{ op: 'damage', amount: 14 }] });
    const legacy = normalizeProfile(deckCharacter());
    assert.equal(Object.hasOwn(legacy.value, 'signatureCards'), false);
    const withSig = normalizeProfile({ ...deckCharacter(), signatureCards: [sig('s1')] });
    assert.equal(withSig.ok, true, JSON.stringify(withSig.errors));
    assert.equal(withSig.value.signatureCards.length, 1);
    assert.ok(normalizeProfile({ ...deckCharacter(), signatureCards: [{ ...sig('s1'), rarity: 'rare' }] }).errors.some((e) => e.path === 'signatureCards[0].rarity' && e.reason === 'invalid-enum'));
    assert.ok(normalizeProfile({ ...deckCharacter(), signatureCards: [sig('s1'), sig('s2'), sig('s3')] }).errors.some((e) => e.path === 'signatureCards' && e.reason === 'length-out-of-range'));
    const cls = normalizeProfile(classProfile()).value;
    const starter = { ...withSig.value, starterDeck: withSig.value.starterDeck.map((id, i) => (i === 19 ? 's1' : id)) };
    assert.ok(validateStarterDeck(starter, cls).errors.some((e) => e.reason === 'signature-in-starter' && e.cardId === 's1'));

    const skill = (id) => ({ id, name: `技${id}`, intent: 'attack', effects: [{ op: 'damage', amount: 5 }] });
    const ally = { kind: 'skill-character', id: 'sc-a', name: '甲', base: { hp: 50 }, skills: [skill('s1'), skill('s2'), skill('s3')],
        passives: [{ id: 'pa1', name: '守', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }] };
    const plain = normalizeProfile(ally);
    assert.equal(plain.ok, true, JSON.stringify(plain.errors));
    assert.equal(Object.hasOwn(plain.value, 'tier'), false);
    assert.equal(normalizeProfile({ ...ally, tier: 'ace' }).value.tier, 'ace');
    assert.ok(normalizeProfile({ ...ally, tier: 'god' }).errors.some((e) => e.path === 'tier' && e.reason === 'invalid-enum'));
    assert.ok(COMBAT_RULES.allyTiers[COMBAT_RULES.defaultAllyTier]);
});


test('combat-rules v3: new effect ops are valued; rules version is 4', () => {
    assert.equal(COMBAT_RULES.version, 4);
    const v = (effects) => estimateEffectsValue(effects);
    assert.equal(v([{ op: 'damage-from-block', target: 'enemy' }]), 8);
    assert.equal(v([{ op: 'self-damage', amount: 3 }]), -4.5);
    assert.equal(v([{ op: 'double', stat: 'block', target: 'self' }]), 7);
    assert.equal(v([{ op: 'next-turn', gain: 'energy', amount: 1 }, { op: 'next-turn', gain: 'draw', amount: 2 }]), 12);
    assert.equal(v([{ op: 'each-turn', then: [{ op: 'status', status: 'poison', stacks: 2, target: 'all-enemies' }] }]), 8.4);
    assert.equal(v([{ op: 'hand-cost', amount: -1 }]), 5);
    assert.equal(v([{ op: 'damage', amount: 4, target: 'enemy', strengthScale: 3 }]), 9.33);
    assert.equal(v([{ op: 'status', status: 'intangible', stacks: 1, target: 'self' }]), 7);
    assert.ok(Object.keys(COMBAT_RULES.awakenEffects).length === 8);
});

test('combat-rules v3: schema accepts new ops with defaults, keeps old card shape, rejects out-of-range and nesting', () => {
    const withPool = (cards) => {
        const p = classProfile();
        cards.forEach((c, i) => { p.classPool[i] = { id: `c${i + 1}`, name: `新${i + 1}`, rarity: 'common', cost: 1, ...c }; });
        return normalizeProfile(p);
    };
    const ok = withPool([
        { type: 'attack', effects: [{ op: 'damage-from-block' }] },
        { type: 'attack', effects: [{ op: 'damage', amount: 6 }] },
        { type: 'power', effects: [{ op: 'each-turn', then: [{ op: 'status', status: 'poison', stacks: 2, target: 'all-enemies' }] }] },
    ]);
    assert.equal(ok.ok, true, JSON.stringify(ok.errors));
    const pool = ok.value.classPool;
    assert.deepEqual(pool[0].effects, [{ op: 'damage-from-block', target: 'enemy' }]);
    assert.equal('strengthScale' in pool[1].effects[0], false);
    const reasons = (effects) => {
        const r = withPool([{ type: 'skill', effects }]);
        assert.equal(r.ok, false);
        return r.errors.map((e) => `${e.path.replace(/^.*effects\[0\]\.?/, '')}:${e.reason}`);
    };
    assert.ok(reasons([{ op: 'hand-cost', amount: 1 }]).includes('amount:out-of-range'));
    assert.ok(reasons([{ op: 'double', stat: 'dexterity' }]).includes('stat:invalid-enum'));
    assert.ok(reasons([{ op: 'damage', amount: 6, strengthScale: 9 }]).includes('strengthScale:out-of-range'));
    assert.ok(reasons([{ op: 'next-turn', gain: 'status', amount: 1 }]).includes('gain:invalid-enum'));
    assert.ok(reasons([{ op: 'heal-pct', pct: 10 }]).includes('op:invalid-enum'));
    assert.ok(reasons([{ op: 'conditional', when: { kind: 'self-hp-below', value: 50 }, then: [{ op: 'each-turn', then: [{ op: 'draw', amount: 1 }] }] }])
        .some((x) => x.endsWith(':nested-each-turn')));
    assert.ok(effectsDamage([{ op: 'damage-from-block' }]) > COMBAT_RULES.allySkillDamageCap);
});


import {
    REL_TIERS, abilityKeyOf, asiBalance, baseScores, deriveAbilities, isAsiLevel, normalizePrefs, proficiencyBonus, relLevel, relOffset, relTierOf,
} from '../src/combat/abilities.js';

test('六维：标准数组按主次擅长与短板分配，其余三项按名字种子固定', () => {
    const prefs = { major: '力量', minor: 'con', weak: '智' };
    const a = baseScores(prefs, '甲');
    assert.deepEqual([a.str, a.con, a.int], [15, 14, 8]);
    assert.deepEqual(Object.values(a).sort((x, y) => x - y), [8, 10, 12, 13, 14, 15]);
    assert.deepEqual(baseScores(prefs, '甲'), a);
    assert.equal(normalizePrefs({ major: '力量', minor: '力', weak: '智' }), null);
    assert.equal(normalizePrefs({ major: '力量', minor: '体质', weak: '幸运' }), null);
    assert.deepEqual([abilityKeyOf('感知'), abilityKeyOf('CHA'), abilityKeyOf('速度')], ['wis', 'cha', null]);
});

test('六维：调整值、熟练加值与属性提升余额按 DND 节奏', () => {
    assert.deepEqual([1, 4, 5, 9, 13, 17, 20, 21, 29, 30].map(proficiencyBonus), [2, 2, 3, 4, 5, 6, 6, 7, 9, 9]);
    assert.deepEqual([3, 4, 8, 19, 20].map((lv) => asiBalance(lv)), [0, 2, 4, 10, 10]);
    assert.equal(asiBalance(8, 3), 1);
    assert.deepEqual([isAsiLevel(4), isAsiLevel(5), isAsiLevel(24), isAsiLevel(24, false)], [true, false, false, true]);
});

test('相对档：偏移落在区间内且确定；低等级各档仍有六维差距；非主角自动属性提升', () => {
    for (const [tier, rule] of Object.entries(REL_TIERS)) {
        const off = relOffset('乙', tier);
        assert.ok(off >= rule.offset[0] && off <= rule.offset[1], tier);
        assert.equal(relOffset('乙', tier), off);
    }
    assert.deepEqual([relTierOf('强敌'), relTierOf('even'), relTierOf('无敌')], ['formidable', 'even', null]);
    assert.equal(relLevel({ name: '乙', tier: 'outclassed', anchorLevel: 1 }), 1);
    assert.equal(relLevel({ name: '乙', tier: 'overwhelming', anchorLevel: 25 }), 30);
    const prefs = { major: 'str', minor: 'con', weak: 'int' };
    const weak = deriveAbilities({ prefs, name: '丙', level: 1, tier: 'outclassed' });
    const strong = deriveAbilities({ prefs, name: '丙', level: 1, tier: 'formidable' });
    assert.equal(strong.scores.str - weak.scores.str, 4);
    const lv8 = deriveAbilities({ prefs: { major: '力量', minor: 'con', weak: '智' }, name: '甲', level: 8, tier: 'formidable' });
    assert.deepEqual([lv8.scores.str, lv8.scores.con, lv8.mods.str, lv8.proficiency, lv8.cap], [21, 16, 5, 3, 30]);
});

test('主角：不加档位修正与自动提升，只按记录调整且不超过 20', () => {
    const prefs = { major: 'dex', minor: 'wis', weak: 'cha' };
    const base = deriveAbilities({ prefs, name: '主角', level: 8, protagonist: true, tier: 'overwhelming' });
    assert.deepEqual([base.scores.dex, base.scores.wis, base.scores.cha, base.cap], [15, 14, 8, 20]);
    const raised = deriveAbilities({ prefs, name: '主角', level: 8, protagonist: true, adjustments: [{ ability: '敏捷', amount: 4 }, { ability: 'dex', amount: 4 }, { ability: '未知', amount: 2 }] });
    assert.equal(raised.scores.dex, 20);
    assert.equal(raised.mods.dex, 5);
});

import { isFixedCard, scaleCard, scaleCatalog, scaleSkills } from '../src/combat/card-scaling.js';
import { describeEffectParts, describeEffects } from '../src/visual/igs-ui/combat-card-art.js';
import { cardScalingView } from '../src/visual/igs-ui/combat-panel-model.js';
import { cardTextHtml } from '../src/visual/igs-ui/combat-panel-render.js';

test('卡牌属性性能：按要求属性与稀有度换算新卡对象，夹 0.7–1.3；固定卡与无属性原样；不改原卡；显示标记增减', () => {
    const strong = { scores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 }, proficiency: 2 };
    const weak = { scores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, proficiency: 2 };
    const card = { id: 'c1', name: '斩', type: 'attack', cost: 1, rarity: 'common',
        effects: [{ op: 'damage', amount: 6, hits: 1, target: 'enemy' }, { op: 'draw', amount: 1 }],
        upgraded: { effects: [{ op: 'damage', amount: 9, hits: 1, target: 'enemy' }] } };
    const snapshot = JSON.stringify(card);

    // 力量调整值 3 + 熟练 2 − (要求 10 的调整值 0 + 2) = 3 → ×1.24；抽牌不变；升级形态同样换算。
    const up = scaleCard(card, strong);
    assert.deepEqual(up.scaling, { ability: 'str', required: 10, multiplier: 1.24, base: [6], baseUpgraded: [9] });
    assert.deepEqual([up.effects[0].amount, up.effects[1].amount, up.upgraded.effects[0].amount], [7, 1, 11]);
    assert.equal(JSON.stringify(card), snapshot);
    // 神话要求 18：差 −5 → 夹到 0.7。
    const down = scaleCard({ ...card, rarity: 'mythic' }, weak);
    assert.deepEqual([down.scaling.multiplier, down.effects[0].amount], [0.7, 4]);
    // 伤害取力量与敏捷中较高的一项。
    assert.equal(scaleCard(card, { scores: { ...strong.scores, str: 10, dex: 18 }, proficiency: 2 }).scaling.ability, 'dex');

    const basic = { ...card, rarity: 'basic' };
    const drawOnly = { id: 'd1', name: '思', type: 'skill', cost: 0, rarity: 'rare', effects: [{ op: 'draw', amount: 2 }] };
    assert.equal(scaleCard(basic, strong), basic);
    assert.equal(isFixedCard(drawOnly), true);
    assert.equal(scaleCard(drawOnly, strong), drawOnly);
    assert.equal(scaleCard(card, null), card);
    const catalog = scaleCatalog(new Map([['c1', card], ['b', basic]]), strong);
    assert.deepEqual([catalog.c1.effects[0].amount, catalog.b === basic], [7, true]);

    // 技能要求值 12：感知 18 → 调整值 4 + 2 − 3 = 3 → ×1.24。
    const healer = { scores: { ...weak.scores, wis: 18 }, proficiency: 2 };
    const skill = { id: 's1', name: '愈', intent: 'heal', effects: [{ op: 'heal', amount: 10, target: 'self' }] };
    assert.equal(scaleSkills([skill], healer)[0].effects[0].amount, 12);
    assert.equal(scaleSkills([skill], null)[0], skill);

    const parts = describeEffectParts(up.effects, ['up']);
    assert.equal(parts.map((p) => p.text).join(''), describeEffects(up.effects));
    const view = cardScalingView(up);
    // 牌面不再单列要求属性：带标记的数字附加成详情（点开查看），同样内容的整句并入卡牌 aria-label。
    assert.equal(view.scaleNote, '力量要求 10，倍率 ×1.24，6 变为 7');
    assert.deepEqual(view.textParts.filter((p) => p.mark), [{ text: '7', mark: 'up', tip: '力量要求 10 · 倍率 ×1.24\n6 → 7（+1）' }]);
    assert.match(cardTextHtml(view), /<span class="igs-scale-up" data-scale-tip="[^"]*6 → 7（\+1）">7<\/span>/);
    // 手牌升级形态按升级前数值比较。
    const upView = cardScalingView({ ...up, upgraded: true, effects: up.upgraded.effects });
    assert.deepEqual(upView.textParts.filter((p) => p.mark).map((p) => [p.text, p.mark]), [['11', 'up']]);
    assert.deepEqual(cardScalingView(card), {});
    assert.equal(cardTextHtml({ text: describeEffects(card.effects) }), describeEffects(card.effects));
});


test('v4 schema：选牌只在卡牌顶层、本张专属效果只在卡牌里、不能打出的牌靠被弃时效果；新效果按收益估值', () => {
    const reasons = (r) => r.errors.map((e) => e.reason);
    const sk = (id, effects) => normalizeSkill({ id, name: id, intent: 'special', effects });
    const cd = (id, extra) => normalizeCard({ id, name: id, type: 'skill', cost: 1, rarity: 'common', ...extra });
    assert.ok(!reasons(cd('sift', { effects: [{ op: 'discard', amount: 1, mode: 'choose' }, { op: 'draw', amount: 2 }] })).includes('choose-not-top-level'));
    const branch = cd('sift2', { effects: [{ op: 'conditional', when: { kind: 'self-has', value: 'weak' }, then: [{ op: 'discard', amount: 1, mode: 'choose' }] }] });
    assert.ok(reasons(branch).includes('choose-not-top-level'));
    assert.ok(reasons(sk('k1', [{ op: 'discard', amount: 1, mode: 'choose' }])).includes('choose-not-top-level'));
    assert.ok(reasons(sk('k2', [{ op: 'grow', amount: 1 }])).includes('card-only'));
    assert.ok(reasons(sk('k3', [{ op: 'copy', amount: 1, from: 'self' }])).includes('card-only'));
    const buffInBranch = cd('b1', { effects: [{ op: 'conditional', when: { kind: 'self-has', value: 'weak' }, then: [{ op: 'buff', trigger: 'turn-end', turns: 1, then: [{ op: 'draw', amount: 1 }] }] }] });
    assert.ok(reasons(buffInBranch).includes('nested-buff'));
    assert.ok(reasons(cd('b2', { effects: [{ op: 'buff', trigger: 'turn-end', cardType: 'attack', turns: 1, then: [{ op: 'draw', amount: 1 }] }] })).includes('unknown-field'));
    const lazy = { cost: 0, effects: [], unplayable: true };
    assert.ok(reasons(cd('lazy', lazy)).includes('unplayable-needs-on-discard'));
    assert.ok(reasons(cd('lazy2', { ...lazy, cost: 1, onDiscard: [{ op: 'energy', amount: 1 }] })).includes('unplayable-cost'));
    assert.ok(!reasons(cd('lazy3', { ...lazy, onDiscard: [{ op: 'energy', amount: 1 }] })).some((r) => String(r).startsWith('unplayable')));
    assert.equal(estimateEffectsValue([{ op: 'cost-mod', amount: -1, mode: 'choose', scope: 'turn' }]), 5);
    assert.ok(estimateEffectsValue([{ op: 'discard', amount: 1, mode: 'random' }]) < 0);
    assert.equal(estimateEffectsValue([{ op: 'buff', trigger: 'card-played', cardType: 'attack', turns: 2, then: [{ op: 'block', amount: 2 }] }]), 8);
});


test('敌人参战配置：技能数公式；常驻效果按身份与难度种子确定、首个削弱我方、数量随难度表；模板敌人按等级补技能，生成敌人只加难度追加；形状合 schema，开战生效', async () => {
    const { skillTarget, SKILL_COUNT_MAX } = await import('../src/combat/rules.js');
    const { ENEMY_AFFIXES, enemyAffixes, enemyFillSkills } = await import('../src/combat/enemy-loadout.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { createBattle, seedFor } = await import('../src/combat/engine.js');
    const { unitDetailView } = await import('../src/visual/igs-ui/combat-panel-model.js');
    assert.deepEqual([skillTarget(1, 'normal'), skillTarget(9, 'normal'), skillTarget(10, 'normal'), skillTarget(3, 'elite'), skillTarget(3, 'boss'), skillTarget(30, 'boss')], [3, 3, 4, 4, 5, SKILL_COUNT_MAX]);

    const wolf = templateEnemy('狼', 'normal');
    const elite = templateEnemy('狼头领', 'elite');
    const boss = templateEnemy('狼王', 'boss');
    assert.deepEqual(enemyAffixes(wolf, 'normal'), []);
    assert.deepEqual(enemyAffixes(elite, 'normal'), enemyAffixes(elite, 'normal'));
    for (const [p, diff, n] of [[elite, 'normal', 1], [boss, 'normal', 2], [boss, 'nightmare', 3], [elite, 'hard', 1], [wolf, 'brutal', 1], [boss, 'easy', 1]]) {
        const list = enemyAffixes(p, diff);
        assert.equal(list.length, n, `${p.tier}/${diff}`);
        assert.ok(ENEMY_AFFIXES[list[0].id.slice(3)].debuff, '首个常驻效果削弱我方');
        assert.equal(new Set(list.map((a) => a.id)).size, n);
        assert.ok(list.every((a) => a.source === 'affix'));
    }
    assert.deepEqual(enemyAffixes(boss, 'insane'), enemyAffixes(boss, 'normal'));
    for (const [key, a] of Object.entries(ENEMY_AFFIXES)) {
        const passive = { id: `af-${key}`, name: a.name, trigger: a.trigger, ...(a.cardType ? { cardType: a.cardType } : {}), effects: a.effects };
        const r = normalizeProfile({ ...wolf, passives: [passive] });
        assert.equal(r.ok, true, `${key}: ${JSON.stringify(r.errors)}`);
    }

    const fills = enemyFillSkills(wolf, 1, 'normal');
    assert.equal(fills.length, 1);
    assert.deepEqual(enemyFillSkills(wolf, 1, 'normal'), fills);
    assert.equal(enemyFillSkills(boss, 1, 'normal').length, 3);
    assert.equal(enemyFillSkills(wolf, 12, 'normal').length, 2);
    const night = enemyFillSkills(wolf, 1, 'nightmare');
    assert.equal(night.length, 2);
    assert.deepEqual(night.slice(0, 1), fills, '难度只追加，前面的不变');
    const generated = { ...wolf, id: 'en-gen', generated: true, skills: [...wolf.skills, { ...wolf.skills[0], id: 'en-gen-s3', name: '撕咬' }] };
    assert.deepEqual(enemyFillSkills(generated, 12, 'normal'), []);
    assert.equal(enemyFillSkills(generated, 12, 'nightmare').length, 1);
    const all = [...wolf.skills, ...enemyFillSkills(wolf, 30, 'nightmare')];
    assert.equal(all.length, SKILL_COUNT_MAX);
    assert.equal(new Set(all.map((s) => s.id)).size, all.length);
    assert.equal(new Set(all.map((s) => s.name)).size, all.length);
    const full = normalizeProfile({ ...wolf, skills: all });
    assert.equal(full.ok, true, JSON.stringify(full.errors));

    const passives = Object.keys(ENEMY_AFFIXES).map((k) => ({ id: `af-${k}`, name: ENEMY_AFFIXES[k].name, trigger: ENEMY_AFFIXES[k].trigger,
        ...(ENEMY_AFFIXES[k].cardType ? { cardType: ENEMY_AFFIXES[k].cardType } : {}), effects: JSON.parse(JSON.stringify(ENEMY_AFFIXES[k].effects)), source: 'affix' }));
    const heroUnit = { id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck: Array(10).fill('basic-strike'), catalog: BASIC_CARDS };
    const foeUnit = { id: 'foe', name: '狼', side: 'enemy', kind: 'skill', maxHp: 60, skills: wolf.skills, passives };
    const battle = createBattle({ controlledId: 'hero', units: [heroUnit, foeUnit] }, seedFor('affix-test'));
    assert.equal(battle.ok, true, JSON.stringify(battle.error));
    const s = battle.state;
    assert.deepEqual([s.units.hero.statuses.weak, s.units.hero.statuses.vulnerable, s.units.hero.statuses.frail], [2, 2, 2]);
    assert.deepEqual([s.units.foe.statuses.artifact, s.units.foe.statuses.thorns], [2, 3]);
    assert.equal(s.piles.hero.draw.filter((inst) => s.cards[inst].cardId === 'status-wound').length, 2);
    const labels = unitDetailView(s, 'foe').groups.map((g) => g.label);
    assert.ok(labels.includes('常驻效果') && !labels.includes('被动'), JSON.stringify(labels));
});

test('多敌折算：1 只为 1；2 只约 0.70；3 只起不低于下限 0.65；按在场上限截断；非法输入按 1 只；生成首领倍率登记', async () => {
    const { crowdScaleFor } = await import('../src/combat/rules.js');
    assert.equal(crowdScaleFor(1), 1);
    assert.equal(crowdScaleFor(0), 1);
    assert.equal(crowdScaleFor(undefined), 1);
    assert.ok(Math.abs(crowdScaleFor(2) - 1 / 1.43) < 1e-9, String(crowdScaleFor(2)));
    for (const n of [3, 4, 5, 8, 50]) assert.equal(crowdScaleFor(n), COMBAT_RULES.crowd.floor, `n=${n}`);
    assert.equal(COMBAT_RULES.crowd.floor, 0.65);
    assert.equal(COMBAT_RULES.generatedScale.boss, 0.9);
    assert.equal(COMBAT_RULES.generatedScale.normal, undefined);
});

