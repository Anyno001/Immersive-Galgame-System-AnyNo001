import test from 'node:test';
import assert from 'node:assert/strict';
import { BASIC_CARDS, COMBAT_RULES, evaluateCardBudget, expProgress, levelFromExp, validateDeck } from '../src/combat/rules.js';
import { ledgerEntryId, normalizeLedgerEntry, normalizeProfile, validateStarterDeck } from '../src/combat/schema.js';

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
    const deckOf = (n) => Array.from({ length: n }, (_, i) => ids[i % ids.length]);
    assert.equal(validateDeck(deckOf(19), owned).errors[0].reason, 'deck-too-small');
    assert.equal(validateDeck(deckOf(20), owned).ok, true);
    assert.equal(validateDeck(deckOf(30), owned).ok, true);
    assert.ok(validateDeck(deckOf(31), owned).errors.some((e) => e.reason === 'deck-too-large'));
    const fourCopies = [...deckOf(19).filter((id) => id !== 'a'), 'a', 'a', 'a', 'a'];
    assert.ok(validateDeck(fourCopies, owned).errors.some((e) => e.reason === 'copy-limit' && e.cardId === 'a'));
    assert.ok(validateDeck([...deckOf(19), 'zz'], owned).errors.some((e) => e.reason === 'not-owned' && e.cardId === 'zz'));
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
