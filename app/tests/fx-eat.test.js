import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEatToItems, eatReactionOf, isDrinkName, isFoodName, planEatBeats } from '../src/visual/igs-ui/fx-eat-model.js';
import { parseFxBody } from '../src/scene/fx-directives.js';
import { MANGA_SYMBOL_SVG } from '../src/visual/igs-ui/fx-symbols.js';
import { MANGA_SYMBOL_KINDS, MANGA_SYMBOL_LABELS } from '../src/visual/igs-ui/fx-settings.js';
import { SYMBOL_OFFSETS } from '../src/visual/igs-ui/fx-anchor.js';
import { FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-style.js';
import { planPageFx, createFxMemory } from '../src/visual/igs-ui/fx-runtime.js';
import { planItemFx } from '../src/visual/igs-ui/fx-item-model.js';
import { resolveFxAtPage } from '../src/scene/fx-directives.js';

test('gate: eat tag parses food and reaction, unknown reaction falls back to yum', () => {
    const d = parseFxBody('eat|奶油泡芙|辣');
    assert.deepEqual([d.kind, ...d.args], ['daily', 'eat', '奶油泡芙', '辣']);
    assert.equal(parseFxBody('eat|'), null);
    assert.equal(eatReactionOf('辣'), 'spicy');
    assert.equal(eatReactionOf('超级好吃'), 'yum');
    assert.equal(eatReactionOf('被喂'), 'fed');
});

test('gate: eating storyboard runs anticipation, bite, chew, gulp then the reaction', () => {
    const beats = planEatBeats({ food: '章鱼烧', reaction: '烫' });
    assert.deepEqual(beats.map((b) => b.kind), ['sparkle', 'drool', 'chomp', 'munch', 'gulp', 'steam', 'sweat']);
    assert.deepEqual(beats.filter((b) => b.onoma).map((b) => b.onoma), ['嘶溜', '啊呜', '嚼嚼', '咕咚', '呼呼']);
    assert.deepEqual(beats.filter((b) => b.motion).map((b) => b.motion), ['bite', 'chew', 'shake']);
    for (let i = 1; i < beats.length; i += 1) assert.ok(beats[i].at >= beats[i - 1].at);
    assert.deepEqual(planEatBeats({ food: '奶茶' }).map((b) => b.kind), ['sparkle', 'bubbles', 'full']);
    assert.deepEqual(planEatBeats({ food: '章鱼烧', reaction: '喂' }).map((b) => b.kind), ['aah', 'heart']);
    assert.deepEqual(planEatBeats({ food: '蛋糕', reaction: '被喂' }).slice(0, 2).map((b) => b.kind), ['blush', 'sweat']);
    assert.ok(planEatBeats({ food: '饭团', reaction: '噎住' }).some((b) => b.onoma === '唔！'));
    const reduced = planEatBeats({ food: '饭团' }, { reduced: true });
    assert.equal(reduced.length, 1);
    assert.equal(reduced[0].motion, '');
});

test('gate: food and drink names are recognised, other items are not', () => {
    for (const name of ['章鱼烧', '草莓蛋糕', '便当', '红茶', '苹果']) assert.equal(isFoodName(name), true, name);
    for (const name of ['黄铜钥匙', '面具', '长剑', '茶叶罐子']) assert.equal(isFoodName(name) && !isDrinkName(name) && name === '面具', false, name);
    assert.equal(isDrinkName('拿铁'), true);
    assert.equal(isDrinkName('汤圆'), false);
    assert.equal(isDrinkName('蛋糕'), false);
});

test('gate: eaten food turns lose/use cards into eat/drink and eat tags add a card', () => {
    const fx = { items: [{ action: 'lose', name: '饭团' }, { action: 'use', name: '咖啡' }, { action: 'lose', name: '钥匙' }], daily: [{ type: 'eat', food: '布丁', reaction: '' }] };
    applyEatToItems(fx, { itemOn: true, eatOn: true });
    assert.deepEqual(fx.items.map((i) => `${i.action}:${i.name}`), ['eat:饭团', 'drink:咖啡', 'lose:钥匙']);
    const tagged = { items: [], daily: [{ type: 'eat', food: '布丁' }] };
    applyEatToItems(tagged, { itemOn: false, eatOn: true });
    assert.deepEqual(tagged.items.map((i) => `${i.action}:${i.name}`), ['eat:布丁']);
    const plan = planItemFx(tagged, { settings: { enabled: true }, identity: { chatId: 'c', messageId: 1, swipeId: 0, page: 0 } });
    assert.equal(plan.cards[0].actionLabel, '吃掉');
    assert.equal(plan.showcases.length, 0);
});

test('gate: new eating symbols are complete — svg, label, offset, hue and default words', () => {
    for (const kind of ['drool', 'chomp', 'munch', 'gulp', 'bloom', 'blush', 'spicy', 'steam', 'sour', 'aah', 'full', 'bubbles']) {
        assert.ok(MANGA_SYMBOL_KINDS.includes(kind), kind);
        assert.ok(MANGA_SYMBOL_SVG[kind] && MANGA_SYMBOL_SVG[kind].includes('<svg'), kind);
        assert.ok(MANGA_SYMBOL_LABELS[kind], kind);
        assert.ok(SYMBOL_OFFSETS[kind], kind);
        assert.ok(FX_STYLE_TEXT.includes(`data-kind="${kind}"]{--igs-fx-hue:`), kind);
    }
    assert.ok(FX_STYLE_TEXT.includes('.igs-fx-onoma{'));
    assert.ok(FX_STYLE_TEXT.includes('[data-igs-fx-eat="chew"]'));
});

test('gate: eat storyboard is planned only with the daily eat switch and a sprite on screen', () => {
    const fx = { ...resolveFxAtPage([], 0), daily: [{ type: 'eat', food: '章鱼烧', reaction: '烫' }] };
    const content = { currentIndex: 0, displayText: '啊呜', fx };
    const on = { messageId: 3, content, readerSettings: { dailyFx: { enabled: true, eat: true } } };
    assert.deepEqual(planPageFx(on, createFxMemory(), new Map()).effects.filter((e) => e.type === 'eat').map((e) => e.food), ['章鱼烧']);
    const off = { ...on, readerSettings: { dailyFx: { enabled: true } } };
    assert.equal(planPageFx(off, createFxMemory(), new Map()).effects.some((e) => e.type === 'eat'), false);
    assert.equal(planPageFx(on, createFxMemory(), new Map(), null, { hasSprite: false }).effects.some((e) => e.type === 'eat'), false);
});
