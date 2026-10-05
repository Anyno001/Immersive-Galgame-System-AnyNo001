import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyItemFxToDom, refreshItemFxImages, cancelItemFx, settleItemFx, safeItemImageUrl, itemPlaceholderSvg } from '../src/visual/igs-ui/fx-item.js';
import { renderItemFx } from '../src/visual/igs-ui/fx-item-render.js';
import { planItemFx } from '../src/visual/igs-ui/fx-item-model.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const ID = { chatId: 'chat-1', messageId: 5, swipeId: 0, page: 2 };
const FX = { items: [{ action: 'gain', name: 'A', description: '甲' }, { action: 'lose', name: 'B', description: '' }, { action: 'use', name: 'C', description: '' }], itemOverflow: 1 };
const plan = (resolveImage = () => '', identity = ID) => planItemFx(FX, { settings: { enabled: true }, identity, resolveImage });
const stackOf = (root) => root.querySelector('#igs-fx-front').querySelector('.igs-fx-item-stack');

test('fx-item:cards-stagger-overflow-then-expire-and-same-page-does-not-replay', () => {
    const root = makeStage();
    const timers = makeTimers();
    const sounds = [];
    const result = applyItemFxToDom(root, plan((n) => (n === 'A' ? 'data:image/png;base64,A' : '')), { ...timers, onCard: (c) => sounds.push(c.name) });
    assert.deepEqual([result.played, result.count], [true, 3]);
    assert.equal(stackOf(root).querySelectorAll('.igs-fx-item-card').length, 1);
    assert.ok(stackOf(root).querySelector('img'));
    timers.advance(1300);
    const stack = stackOf(root);
    assert.equal(stack.querySelectorAll('.igs-fx-item-card').length, 3);
    assert.equal(stack.querySelector('.igs-fx-item-more').textContent, '等 1 件');
    assert.deepEqual(sounds, ['A', 'B', 'C']);
    assert.equal(applyItemFxToDom(root, plan(), timers).reason, 'same-page');
    assert.equal(stackOf(root), stack);
    timers.advance(4000);
    assert.equal(stack.querySelectorAll('[data-igs-leaving]').length > 0, true);
    timers.advance(1000);
    assert.equal(stackOf(root), null);
    assert.equal(applyItemFxToDom(root, plan(), timers).reason, 'same-page');
    assert.equal(applyItemFxToDom(root, plan(() => '', { ...ID, page: 3 }), timers).played, true);
});

test('fx-item:late-image-replaces-placeholder-only-for-same-identity-and-safe-url', () => {
    const root = makeStage();
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    timers.advance(900);
    assert.equal(refreshItemFxImages(root, { ...ID, page: 3 }, () => 'data:image/png;base64,X'), 0);
    assert.equal(refreshItemFxImages(root, ID, () => 'javascript:alert(1)'), 0);
    assert.equal(refreshItemFxImages(root, ID, (n) => (n === 'B' ? 'data:image/png;base64,B' : '')), 1);
    const icon = stackOf(root).querySelectorAll('.igs-fx-item-icon')[1];
    assert.equal(icon.getAttribute('data-igs-item-placeholder'), null);
    assert.equal(icon.querySelector('img').getAttribute('src'), 'data:image/png;base64,B');
    assert.equal(stackOf(root).querySelectorAll('.igs-fx-item-icon')[0].getAttribute('data-igs-item-placeholder'), '1');
});

test('fx-item:reduced-motion-shows-everything-statically-without-sound', () => {
    const root = makeStage();
    const timers = makeTimers();
    const sounds = [];
    applyItemFxToDom(root, plan(), { ...timers, reducedMotion: true, onCard: (c) => sounds.push(c.name) });
    const stack = stackOf(root);
    assert.equal(stack.getAttribute('data-igs-fx-static'), '1');
    assert.equal(stack.querySelectorAll('.igs-fx-item-card').length, 3);
    assert.ok(stack.querySelector('.igs-fx-item-more'));
    assert.deepEqual(sounds, []);
    assert.equal(timers.size(), 1);
});

test('fx-item:cancel-clears-timers-and-nodes-and-empty-plan-is-noop', () => {
    const root = makeStage();
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    assert.ok(timers.size() > 0);
    assert.equal(cancelItemFx(root), true);
    assert.equal(timers.size(), 0);
    assert.equal(stackOf(root), null);
    assert.equal(cancelItemFx(root), false);
    assert.equal(applyItemFxToDom(root, { cards: [], identity: ID }, timers).reason, 'empty');
});

test('fx-item:safe-image-url-whitelist', () => {
    assert.equal(safeItemImageUrl('data:image/png;base64,AA'), 'data:image/png;base64,AA');
    assert.equal(safeItemImageUrl('blob:https://x/1'), 'blob:https://x/1');
    assert.equal(safeItemImageUrl('data:image/svg+xml;base64,AA'), '');
    assert.equal(safeItemImageUrl('https://evil.example/a.png'), '');
    assert.equal(safeItemImageUrl(null), '');
});

const RARE_FX = { items: [{ action: 'gain', name: 'R', description: '遗物', rarity: 'rare' }, { action: 'use', name: 'U', description: '' }], itemOverflow: 0 };
const showcaseOf = (root) => root.querySelector('#igs-fx-front').querySelector('.igs-fx-item-showcase');

test('fx-item:rare-gain-plays-showcase-then-only-other-items-as-cards', () => {
    const root = makeStage();
    const timers = makeTimers();
    const sounds = [];
    const p = planItemFx(RARE_FX, { settings: { enabled: true }, identity: ID });
    assert.equal(p.showcase.name, 'R');
    const result = applyItemFxToDom(root, p, { ...timers, accent: '#ff0066', onCard: (c) => sounds.push(c.name), onShowcase: (c) => sounds.push(`rare:${c.name}`) });
    assert.equal(result.showcase, true);
    const showcase = showcaseOf(root);
    assert.ok(showcase);
    assert.equal(showcase.style.vars['--igs-item-accent'], '#ff0066');
    assert.equal(showcase.querySelector('.igs-fx-item-showcase-name').textContent, 'R');
    assert.equal(stackOf(root), null);
    showcase.fire('click');
    assert.equal(showcase.getAttribute('data-igs-leaving'), '1');
    timers.advance(400);
    assert.equal(showcaseOf(root), null);
    timers.advance(500);
    // 中央演出过的物品直接飞进背包，不再在角落重复一张卡。
    assert.equal(stackOf(root).querySelectorAll('.igs-fx-item-card').length, 1);
    assert.equal(stackOf(root).querySelector('.igs-fx-item-card').getAttribute('data-igs-item-name'), 'U');
    assert.deepEqual(sounds, ['rare:R', 'U']);
});

test('fx-item:reduced-motion-skips-showcase', () => {
    const root = makeStage();
    const timers = makeTimers();
    const p = planItemFx(RARE_FX, { settings: { enabled: true }, identity: ID });
    assert.equal(applyItemFxToDom(root, p, { ...timers, reducedMotion: true }).showcase, false);
    assert.equal(showcaseOf(root), null);
    assert.equal(stackOf(root).querySelectorAll('.igs-fx-item-card').length, 2);
});

test('fx-item:gain-cards-fly-to-hud-bag-and-pulse-it-lose-use-just-leave', () => {
    const root = makeStage({ layout: true, hud: true });
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    timers.advance(1300);
    timers.advance(3700);
    timers.advance(200);
    const front = root.querySelector('#igs-fx-front');
    const flyers = front.querySelectorAll('.igs-fx-item-flyer');
    assert.equal(flyers.length, 1);
    assert.equal(flyers[0].style.vars['--igs-item-fly-x'], '-294px');
    const cards = stackOf(root).querySelectorAll('.igs-fx-item-card');
    assert.deepEqual(cards.map((c) => c.getAttribute('data-igs-leaving')), ['fly', '1', '1']);
    timers.advance(700);
    assert.equal(root.bag.getAttribute('data-igs-item-pulse'), '1');
    assert.equal(stackOf(root), null);
    timers.advance(800);
    assert.equal(root.bag.getAttribute('data-igs-item-pulse'), null);
    assert.equal(front.querySelectorAll('.igs-fx-item-flyer').length, 0);
});

test('fx-item:without-visible-bag-gain-cards-fade-out-in-place', () => {
    const root = makeStage({ layout: true });
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    timers.advance(1300);
    timers.advance(3700);
    assert.equal(root.querySelector('#igs-fx-front').querySelectorAll('.igs-fx-item-flyer').length, 0);
    assert.equal(stackOf(root).querySelector('.igs-fx-item-card').getAttribute('data-igs-leaving'), '1');
});

test('fx-item:hover-and-tap-pause-until-released-and-settle-on-page-without-items', () => {
    const root = makeStage();
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    timers.advance(1300);
    const card = stackOf(root).querySelector('.igs-fx-item-card');
    card.fire('pointerenter', { pointerType: 'touch' });
    card.fire('pointerenter', { pointerType: 'mouse' });
    card.fire('click');
    assert.equal(card.getAttribute('data-igs-item-expanded'), '1');
    timers.advance(20000);
    assert.ok(stackOf(root));
    card.fire('pointerleave');
    timers.advance(5000);
    assert.ok(stackOf(root), 'still expanded');
    assert.equal(settleItemFx(root, ID), false);
    assert.equal(settleItemFx(root, { ...ID, page: 3 }), true);
    assert.equal(card.getAttribute('data-igs-item-expanded'), null);
    timers.advance(1400);
    timers.advance(1000);
    assert.equal(stackOf(root), null);
});

test('fx-item:tap-again-collapses-and-resumes-countdown', () => {
    const root = makeStage();
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    const card = stackOf(root).querySelector('.igs-fx-item-card');
    card.fire('click');
    timers.advance(20000);
    card.fire('click');
    assert.equal(card.getAttribute('data-igs-item-expanded'), null);
    timers.advance(1400);
    timers.advance(1000);
    assert.equal(stackOf(root), null);
});

test('fx-item:late-image-fades-in-over-placeholder', () => {
    const root = makeStage();
    const timers = makeTimers();
    applyItemFxToDom(root, plan(), timers);
    assert.equal(refreshItemFxImages(root, ID, (n) => (n === 'A' ? 'data:image/png;base64,A' : '')), 1);
    const img = stackOf(root).querySelector('img');
    assert.equal(img.getAttribute('data-igs-item-fade'), '1');
    timers.advance(420);
    assert.equal(img.getAttribute('data-igs-item-fade'), null);
    assert.equal(refreshItemFxImages(root, ID, () => ''), 0);
});

test('fx-item:render-wires-action-sounds-and-theme-accent', () => {
    const root = makeStage();
    const timers = makeTimers();
    const played = [];
    const snapshot = {
        chatId: 'c', messageId: 1, swipeId: 0,
        readerSettings: { itemFx: { enabled: true } },
        content: { currentIndex: 0, fx: RARE_FX },
    };
    const result = renderItemFx(root, snapshot, { ...timers, playSfx: (kind) => played.push(kind), theme: { nameColor: '#e0306a' } });
    assert.equal(result.played, true);
    assert.ok(showcaseOf(root).style.vars['--igs-item-accent']);
    timers.advance(2600);
    timers.advance(400);
    timers.advance(500);
    assert.deepEqual(played, ['item-rare', 'item-use']);
    const next = renderItemFx(root, { ...snapshot, content: { currentIndex: 1, fx: { items: [] } } }, timers);
    assert.equal(next.reason, 'no-items');
});

test('fx-item:ancient-era-snapshot-switches-cards-and-showcase-to-seal-skin-modern-unchanged', () => {
    const timers = makeTimers();
    const snapshot = (ancient) => ({
        chatId: 'c', messageId: 1, swipeId: 0,
        readerSettings: { itemFx: { enabled: true }, ...(ancient ? { _ancientEra: true } : {}) },
        content: { currentIndex: 0, fx: RARE_FX },
    });
    const old = makeStage();
    renderItemFx(old, snapshot(true), { ...timers, playSfx: () => {} });
    const showcase = showcaseOf(old);
    assert.equal(showcase.getAttribute('data-igs-era'), 'ancient');
    assert.equal(showcase.querySelector('.igs-fx-item-showcase-seal').textContent, '得');
    showcase.fire('click');
    timers.advance(400);
    timers.advance(500);
    const stack = stackOf(old);
    assert.equal(stack.getAttribute('data-igs-era'), 'ancient');
    assert.deepEqual(stack.querySelectorAll('.igs-fx-item-card').map((c) => c.querySelector('.igs-fx-item-seal').textContent), ['用']);
    assert.equal(stack.querySelector('.igs-fx-item-icon').getAttribute('data-igs-item-placeholder'), '1');
    const modern = makeStage();
    renderItemFx(modern, snapshot(false), { ...timers, playSfx: () => {} });
    assert.equal(showcaseOf(modern).getAttribute('data-igs-era'), null);
    assert.equal(showcaseOf(modern).querySelector('.igs-fx-item-seal'), null);
    showcaseOf(modern).fire('click');
    timers.advance(400);
    timers.advance(500);
    assert.equal(stackOf(modern).getAttribute('data-igs-era'), null);
    assert.equal(stackOf(modern).querySelector('.igs-fx-item-seal'), null);
    assert.equal(stackOf(modern).querySelector('.igs-fx-item-card').children.length, 2);
});


test('fx-item:world-skin-snapshot-marks-showcase-stack-and-style-without-seal', async () => {
    const { WORLD_SKIN_IDS } = await import('../src/scene/worldview.js');
    const { ITEM_FX_STYLE_TEXT } = await import('../src/visual/igs-ui/fx-item.js');
    for (const id of WORLD_SKIN_IDS) {
        const timers = makeTimers();
        const root = makeStage();
        renderItemFx(root, { chatId: 'c', messageId: 1, swipeId: 0, readerSettings: { itemFx: { enabled: true }, _worldview: id }, content: { currentIndex: 0, fx: RARE_FX } }, { ...timers, playSfx: () => {} });
        const showcase = showcaseOf(root);
        assert.ok(showcase, id);
        assert.equal(showcase.getAttribute('data-igs-era'), id, id);
        assert.ok(!showcase.querySelector('.igs-fx-item-showcase-seal'), `${id}: no ancient seal`);
        showcase.fire('click');
        timers.advance(400);
        timers.advance(500);
        const stack = stackOf(root);
        assert.ok(stack, id);
        assert.equal(stack.getAttribute('data-igs-era'), id, id);
        assert.ok(!stack.querySelector('.igs-fx-item-seal'), `${id}: no ancient seal`);
        assert.ok(ITEM_FX_STYLE_TEXT.includes(`.igs-fx-item-stack[data-igs-era="${id}"]`), id);
        assert.ok(ITEM_FX_STYLE_TEXT.includes(`.igs-fx-item-showcase[data-igs-era="${id}"]`), id);
        assert.ok(ITEM_FX_STYLE_TEXT.includes(`.igs-fx-item-flyer[data-igs-era="${id}"]`), id);
    }
});

test('gate: first-time showcase clears sprites and dialog, then brings the stage back and cards the rest', () => {
    const root = makeStage({ layout: true, hud: true });
    const timers = makeTimers();
    const p = planItemFx({ items: [{ action: 'gain', name: '新钥匙', first: true }, { action: 'gain', name: '旧书', first: false }] }, { settings: { enabled: true }, identity: ID });
    applyItemFxToDom(root, p, timers);
    const motion = root.querySelector('#igs-stage-motion');
    assert.equal(motion.getAttribute('data-igs-item-stage'), 'out');
    assert.ok(root.querySelector('#igs-fx-front').querySelector('.igs-fx-item-showcase-burst'));
    assert.equal(stackOf(root), null);
    timers.advance(3000);
    timers.advance(400);
    assert.equal(motion.getAttribute('data-igs-item-stage'), 'in');
    assert.deepEqual(stackOf(root).querySelectorAll('.igs-fx-item-card').map((c) => c.getAttribute('data-igs-item-name')), ['旧书']);
    timers.advance(500);
    assert.equal(motion.getAttribute('data-igs-item-stage'), null);
    applyItemFxToDom(root, planItemFx({ items: [{ action: 'gain', name: 'X', first: true }] }, { settings: { enabled: true }, identity: { ...ID, page: 9 } }), timers);
    assert.equal(motion.getAttribute('data-igs-item-stage'), 'out');
    cancelItemFx(root);
    assert.equal(motion.getAttribute('data-igs-item-stage'), null);
});

test('gate: same page plays only newly arrived items, placeholder icon follows the item name', () => {
    const root = makeStage();
    const timers = makeTimers();
    const first = planItemFx({ items: [{ action: 'lose', name: '信' }] }, { settings: { enabled: true }, identity: ID });
    applyItemFxToDom(root, first, timers);
    const later = planItemFx({ items: [{ action: 'lose', name: '信' }, { action: 'use', name: '药水' }] }, { settings: { enabled: true }, identity: ID });
    assert.equal(applyItemFxToDom(root, later, timers).played, true);
    assert.deepEqual(stackOf(root).querySelectorAll('.igs-fx-item-card').map((c) => c.getAttribute('data-igs-item-name')), ['药水']);
    assert.equal(applyItemFxToDom(root, later, timers).reason, 'same-page');
    const icon = stackOf(root).querySelector('.igs-fx-item-icon');
    assert.equal(icon.getAttribute('data-igs-item-placeholder'), '1');
    assert.notEqual(icon.innerHTML, itemPlaceholderSvg('无法识别的东西'));
});

test('gate: clicking a highlighted item name pops an expanded card without replaying the page', async () => {
    const { showItemMention } = await import('../src/visual/igs-ui/fx-item-render.js');
    const root = makeStage();
    const timers = makeTimers();
    const snapshot = { chatId: 'c', messageId: 1, swipeId: 0, readerSettings: { itemFx: { enabled: true } }, content: { currentIndex: 0, fx: { items: [], itemMentions: [{ name: '黄铜钥匙', description: '刻着校徽' }] } } };
    assert.equal(showItemMention(root, snapshot, '没见过', timers), false);
    assert.equal(showItemMention(root, snapshot, '黄铜钥匙', timers), true);
    const card = stackOf(root).querySelector('.igs-fx-item-card');
    assert.equal(card.getAttribute('data-igs-item-action'), 'view');
    assert.equal(card.getAttribute('data-igs-item-expanded'), '1');
    assert.equal(card.querySelector('.igs-fx-item-desc').textContent, '刻着校徽');
    const off = { ...snapshot, readerSettings: { itemFx: { enabled: true, mention: false } } };
    assert.equal(showItemMention(root, off, '黄铜钥匙', timers), false);
});
