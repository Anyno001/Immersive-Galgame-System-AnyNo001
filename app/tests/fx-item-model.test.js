import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planItemFx, normalizeItemFxSettings, itemFxIdentity, isSameItemFxIdentity, itemOverflowText, itemFxLifeMs } from '../src/visual/igs-ui/fx-item-model.js';

const FX = { items: [{ action: 'gain', name: '黄铜钥匙', description: '旧钥匙' }, { action: 'lose', name: '信', description: '' }, { action: 'use', name: '药水', description: '' }], itemOverflow: 2 };
const ID = { chatId: 'chat-1', messageId: 5, swipeId: 0, page: 2 };

test('fx-item-model:default-off-and-empty-when-disabled', () => {
    assert.deepEqual(normalizeItemFxSettings(undefined), { enabled: false });
    assert.deepEqual(planItemFx(FX, { settings: {}, identity: ID }).cards, []);
});

test('fx-item-model:plans-cards-with-images-placeholders-and-overflow', () => {
    const plan = planItemFx(FX, { settings: { enabled: true }, identity: ID, resolveImage: (name) => (name === '黄铜钥匙' ? 'data:image/png;base64,A' : '') });
    assert.deepEqual(plan.cards.map((c) => [c.name, c.actionLabel, c.placeholder]), [['黄铜钥匙', '获得', false], ['信', '失去', true], ['药水', '使用', true]]);
    assert.equal(plan.cards[0].description, '旧钥匙');
    assert.equal(plan.overflowText, '等 2 件');
    assert.deepEqual(plan.identity, ID);
});

test('fx-item-model:skips-nsfw-chat-and-card-pages', () => {
    const opts = { settings: { enabled: true }, identity: ID };
    assert.deepEqual(planItemFx(FX, { ...opts, nsfw: true }).cards, []);
    assert.deepEqual(planItemFx(FX, { ...opts, pageKind: 'chat' }).cards, []);
    assert.deepEqual(planItemFx(FX, { ...opts, pageKind: 'card' }).cards, []);
    assert.deepEqual(planItemFx({ items: [] }, opts).cards, []);
});

test('fx-item-model:throwing-image-lookup-degrades-to-placeholder', () => {
    const plan = planItemFx(FX, { settings: { enabled: true }, identity: ID, resolveImage: () => { throw new Error('x'); } });
    assert.ok(plan.cards.every((c) => c.placeholder));
});

test('fx-item-model:identity-guards-late-image-replacement', () => {
    assert.equal(itemFxIdentity(ID), 'chat-1|5|0|2');
    assert.equal(isSameItemFxIdentity(ID, { ...ID }), true);
    assert.equal(isSameItemFxIdentity(ID, { ...ID, page: 3 }), false);
    assert.equal(isSameItemFxIdentity(ID, { ...ID, swipeId: 1 }), false);
    assert.equal(isSameItemFxIdentity(ID, null), false);
    assert.equal(itemOverflowText(0), '');
});

test('fx-item-model:life-scales-with-cards-and-description-and-caps', () => {
    assert.equal(itemFxLifeMs([]), 0);
    assert.equal(itemFxLifeMs([{ description: '' }]), 2400);
    assert.equal(itemFxLifeMs([{ description: '' }, { description: 'abcd' }]), 2400 + 600 + 180);
    assert.equal(itemFxLifeMs([{ description: 'x'.repeat(200) }]), 6500);
    assert.equal(planItemFx(FX, { settings: { enabled: true }, identity: ID }).lifeMs, 2400 + 1200 + 45 * 3);
});

test('fx-item-model:first-rare-gain-becomes-showcase-rare-lose-does-not', () => {
    const fx = { items: [{ action: 'lose', name: 'L', rarity: 'rare' }, { action: 'gain', name: 'G1' }, { action: 'gain', name: 'G2', rarity: 'rare' }, { action: 'gain', name: 'G3', rarity: 'rare' }] };
    const plan = planItemFx(fx, { settings: { enabled: true }, identity: ID });
    assert.equal(plan.showcase.name, 'G2');
    assert.deepEqual(plan.cards.map((c) => c.rare), [true, false, true, true]);
    assert.equal(planItemFx(FX, { settings: { enabled: true }, identity: ID }).showcase, null);
});
