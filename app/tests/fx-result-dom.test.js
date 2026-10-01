import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStage, makeTimers } from './helpers/fake-dom.js';
import { cancelResultFx, playResultFx } from '../src/visual/igs-ui/fx-result.js';

const CHECK_PLAN = Object.freeze({
    type: 'dice',
    title: '陈屿·照顾',
    reels: [{ label: '1d100', value: 17, sub: '需≤31' }],
    verdict: '困难成功',
    tone: 'success',
    rollMs: 900,
    holdMs: 1600,
});

function front(root) {
    return root.querySelector('#igs-fx-front');
}

test('gate:fx-result dom mounts card on front layer with a11y status and real value last', async () => {
    const root = makeStage();
    const timers = makeTimers();
    const played = playResultFx(root, CHECK_PLAN, { schedule: timers.schedule, cancel: timers.clear, random: () => 0.5 });
    assert.ok(played);
    const layer = front(root);
    assert.ok(layer);
    assert.equal(layer.children.length, 1);
    const card = layer.children[0];
    assert.equal(card.getAttribute('role'), 'status');
    assert.equal(card.getAttribute('aria-live'), 'polite');
    assert.equal(card.getAttribute('aria-label'), '陈屿·照顾 困难成功');
    assert.match(card.className, /is-success/);
    assert.equal(card.style.vars['--igs-fx-result-roll'], '900ms');
    const strip = card.innerHTML.match(/<div class="igs-fx-result-strip"[^>]*>(.*?)<\/div>/);
    assert.ok(strip, '应有滚动数字列');
    const values = [...strip[1].matchAll(/<span>(\d+)<\/span>/g)].map((m) => Number(m[1]));
    assert.equal(values.length, 8);
    assert.equal(values[values.length - 1], 17);
    assert.match(card.innerHTML, /困难成功/);

    let settled = null;
    played.settled.then((value) => { settled = value; });
    timers.advance(1399);
    await Promise.resolve();
    assert.equal(settled, null, '结论定格前不应放行发送');
    timers.advance(1);
    await Promise.resolve();
    assert.equal(settled, true);
    // 离场 = rollMs + holdMs = 2500ms；此前停在 1400ms。
    timers.advance(1099);
    assert.doesNotMatch(card.className, /is-leaving/);
    timers.advance(1);
    assert.match(card.className, /is-leaving/);
    timers.advance(360);
    assert.equal(layer.children.length, 0);
    assert.equal(timers.size(), 0);
});

test('gate:fx-result dom reduced motion shows final value only and releases immediately', async () => {
    const root = makeStage();
    const timers = makeTimers();
    const played = playResultFx(root, CHECK_PLAN, { schedule: timers.schedule, cancel: timers.clear, reducedMotion: true });
    const card = front(root).children[0];
    assert.match(card.className, /is-reduced/);
    assert.equal(card.style.vars['--igs-fx-result-roll'], '0ms');
    const values = [...card.innerHTML.matchAll(/<span>(\d+)<\/span>/g)].map((m) => Number(m[1]));
    assert.deepEqual(values, [17]);
    let settled = null;
    played.settled.then((value) => { settled = value; });
    timers.advance(0);
    await Promise.resolve();
    assert.equal(settled, true);
});

test('gate:fx-result dom cancel removes card, clears timers and resolves false', async () => {
    const root = makeStage();
    const timers = makeTimers();
    const played = playResultFx(root, CHECK_PLAN, { schedule: timers.schedule, cancel: timers.clear });
    let settled = null;
    played.settled.then((value) => { settled = value; });
    cancelResultFx(root);
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(front(root).children.length, 0);
    assert.equal(timers.size(), 0);
    cancelResultFx(root);
});

test('gate:fx-result dom replay replaces previous card and ignores empty plan or missing stage', () => {
    const root = makeStage();
    const timers = makeTimers();
    playResultFx(root, CHECK_PLAN, { schedule: timers.schedule, cancel: timers.clear });
    playResultFx(root, { ...CHECK_PLAN, verdict: '失败', tone: 'fail' }, { schedule: timers.schedule, cancel: timers.clear });
    assert.equal(front(root).children.length, 1);
    assert.match(front(root).children[0].className, /is-fail/);
    assert.equal(playResultFx(root, null), null);
    const bare = { querySelector: () => null, ownerDocument: null };
    assert.equal(playResultFx(bare, CHECK_PLAN), null);
    cancelResultFx(root);
});

test('gate:fx-result dom escapes plan text', () => {
    const root = makeStage();
    const timers = makeTimers();
    playResultFx(root, { ...CHECK_PLAN, title: '<img src=x onerror=1>' }, { schedule: timers.schedule, cancel: timers.clear });
    const card = front(root).children[0];
    assert.doesNotMatch(card.innerHTML, /<img/);
    cancelResultFx(root);
});


test('gate:fx-result dom settles on landing with tier and validated theme accent', () => {
    const root = makeStage();
    const timers = makeTimers();
    playResultFx(root, { ...CHECK_PLAN, tone: 'crit', tier: 'crit' }, { schedule: timers.schedule, cancel: timers.clear, accent: 'hsl(210 88% 60%)' });
    const card = front(root).children[0];
    assert.equal(card.getAttribute('data-igs-fx-result-tier'), 'crit');
    assert.equal(card.style.vars['--igs-fx-result-accent'], 'hsl(210 88% 60%)');
    timers.advance(899);
    assert.doesNotMatch(card.className, /is-settled/, '滚动结束前不应定格');
    timers.advance(1);
    assert.match(card.className, /is-settled/);
    cancelResultFx(root);
});

test('gate:fx-result dom contest marks winner/loser reels and rejects unsafe accent or unknown tier', () => {
    const root = makeStage();
    const timers = makeTimers();
    const plan = {
        type: 'dice',
        title: '对抗',
        reels: [
            { label: '林晚·理智', value: 38, sub: '', outcome: 'lose' },
            { label: '白墨·察言观色', value: 8, sub: '', outcome: 'win' },
        ],
        verdict: '白墨胜出',
        tone: 'fail',
        tier: 'bogus',
        rollMs: 900,
        holdMs: 1600,
    };
    playResultFx(root, plan, { schedule: timers.schedule, cancel: timers.clear, accent: 'red;background:url(x)' });
    const card = front(root).children[0];
    assert.ok(!card.style.vars['--igs-fx-result-accent'], '非颜色字面量不得写入样式变量');
    assert.ok(!card.getAttribute('data-igs-fx-result-tier'));
    assert.match(card.innerHTML, /igs-fx-result-reel is-lose/);
    assert.match(card.innerHTML, /igs-fx-result-reel is-win/);
    cancelResultFx(root);
});

test('gate:fx-result dom reduced motion settles immediately', () => {
    const root = makeStage();
    const timers = makeTimers();
    playResultFx(root, CHECK_PLAN, { schedule: timers.schedule, cancel: timers.clear, reducedMotion: true });
    const card = front(root).children[0];
    timers.advance(0);
    assert.match(card.className, /is-settled/);
    assert.match(card.className, /is-reduced/);
    cancelResultFx(root);
});
