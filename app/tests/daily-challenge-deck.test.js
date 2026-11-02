import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TEMPLATES, solveCardTemplate } from '../src/combat/card-templates.js';
import { buildChallengeDeck, challengeTierIndex, DOMAIN_CARDS, DOMAIN_CARD_KEYS, LIFE_CARDS } from '../src/combat/challenge-cards.js';
import { COMBAT_RULES, estimateCardValue, validateDeck } from '../src/combat/rules.js';

const SKILL_VALUES = [0, 29, 30, 59, 60, 79, 80, 100];
const deckCounts = (deck) => deck.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map());
const catalogMap = (catalog) => new Map(Object.entries(catalog));

test('每个领域在每个技能档都恰好 20 张牌并通过卡组校验', () => {
    for (const domain of Object.keys(DOMAIN_CARDS)) {
        for (const skillValue of SKILL_VALUES) {
            const { deck, catalog } = buildChallengeDeck({ domain, skillValue });
            assert.equal(deck.length, COMBAT_RULES.starterDeckSize, `${domain} ${skillValue}`);
            const result = validateDeck(deck, deckCounts(deck), catalogMap(catalog));
            assert.ok(result.ok, `${domain} ${skillValue} ${JSON.stringify(result.errors)}`);
        }
    }
});

test('领域不在映射表时走通用牌组，仍是合法 20 张', () => {
    for (const domain of [undefined, '', '侦查']) {
        const { deck, catalog, domain: used } = buildChallengeDeck({ domain, skillValue: 50 });
        assert.equal(used, '通用');
        assert.ok(validateDeck(deck, deckCounts(deck), catalogMap(catalog)).ok);
    }
});

test('技能值越高，同一模板键求出的牌价值不降，整副牌价值不降', () => {
    for (const keys of Object.values(DOMAIN_CARD_KEYS)) {
        for (const key of keys) {
            for (const cost of [1, 2]) {
                const values = ['common', 'uncommon', 'rare', 'epic'].map((rarity) => solveCardTemplate(key, cost, rarity)).filter(Boolean).map(estimateCardValue);
                assert.deepEqual(values, [...values].sort((a, b) => a - b), `${key}@${cost}`);
            }
        }
    }
    for (const domain of Object.keys(DOMAIN_CARDS)) {
        const totals = SKILL_VALUES.map((skillValue) => {
            const { deck, catalog } = buildChallengeDeck({ domain, skillValue });
            return deck.reduce((sum, id) => sum + estimateCardValue(catalog[id]), 0);
        });
        assert.deepEqual(totals, [...totals].sort((a, b) => a - b), domain);
    }
});

test('技能档位边界；独门牌只在技能值 80 以上出现，且至多一张', () => {
    assert.deepEqual(SKILL_VALUES.map(challengeTierIndex), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.equal(challengeTierIndex(undefined), 0);
    for (const skillValue of SKILL_VALUES) {
        const { deck, catalog } = buildChallengeDeck({ domain: '话术', skillValue });
        const epics = deck.filter((id) => catalog[id].rarity === 'epic');
        assert.equal(epics.length, skillValue >= 80 ? 1 : 0, String(skillValue));
    }
});

test('低技能也有至少 4 张可打出的生活牌，且生活牌与领域无关', () => {
    const low = buildChallengeDeck({ domain: '烹饪', skillValue: 0 });
    const playable = LIFE_CARDS.filter((life) => low.deck.includes(life.id) && !low.catalog[life.id].unplayable && low.catalog[life.id].cost <= COMBAT_RULES.energyPerTurn);
    assert.ok(playable.length >= 4);
    const other = buildChallengeDeck({ domain: '运动', skillValue: 95 });
    for (const life of LIFE_CARDS) assert.deepEqual(low.catalog[life.id], other.catalog[life.id]);
});

test('用到的模板键都存在于模板库，稀有度只出现既有档位', () => {
    for (const keys of Object.values(DOMAIN_CARD_KEYS)) for (const key of keys) assert.ok(Object.hasOwn(CARD_TEMPLATES, key), key);
    for (const skillValue of SKILL_VALUES) {
        const { catalog } = buildChallengeDeck({ domain: '学习', skillValue });
        for (const card of Object.values(catalog)) assert.ok(['basic', 'common', 'uncommon', 'rare', 'epic'].includes(card.rarity), card.rarity);
    }
});
