import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WAIT_STAGE_DEFAULTS,
    WAIT_STAGE_FALLBACK_LINES,
    WAIT_STAGE_GAME_LINES,
    WAIT_STAGE_GAMES,
    availableWaitStageGames,
    normalizeWaitStageSettings,
    waitStageGameLine,
    weaveWaitStageLines,
} from '../src/visual/igs-ui/wait-stage.js';
import {
    buildMemoryDeck,
    buildMoodRound,
    buildWaitStageModel,
    buildWhoSaidRound,
    collectWaitStageArt,
    collectWaitStageLines,
    createWaitStageRuntime,
    rpsLineKey,
    rpsOutcome,
} from '../src/visual/igs-ui/wait-stage-runtime.js';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';

function runtimeHarness(settings = {}) {
    const timers = makeTimers();
    const doc = { createElement(tag) {
        const node = new FakeEl(doc, tag);
        node.classList = {
            add(value) { node.className += ` ${value}`; },
            remove(value) { node.className = node.className.split(' ').filter((item) => item !== value).join(' '); },
        };
        return node;
    } };
    const host = doc.createElement('div');
    let ready = 0;
    let dismissed = 0;
    const runtime = createWaitStageRuntime({
        doc, random: () => 0,
        timers: { setTimeout: timers.schedule, clearTimeout: timers.clear },
        onExitReady: () => { ready += 1; },
        onDismiss: () => { dismissed += 1; runtime.close(); },
    });
    const root = runtime.open(host, { settings, model: buildWaitStageModel({ settings, random: () => 0 }) });
    return { runtime, root, timers, ready: () => ready, dismissed: () => dismissed };
}

test('gate:wait-stage:finished-game-keeps-the-layer-during-reply-mount', () => {
    const h = runtimeHarness();
    h.root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    assert.equal(h.runtime.replyArrived(), false);
    h.root.querySelector('.igs-ws-hands').querySelector('button').fire('click');
    h.timers.advance(850);
    assert.equal(h.ready(), 1);
    assert.equal(h.runtime.isOpen(), true, '切楼成功前仍保留等待层');
    assert.match(h.root.querySelector('.igs-ws-state').textContent, /正在打开/);
    h.runtime.close();
    assert.equal(h.timers.size(), 0);
});

test('gate:wait-stage:settings-default-on-and-clamp-seconds', () => {
    const fallback = normalizeWaitStageSettings(null);
    assert.deepEqual(fallback, WAIT_STAGE_DEFAULTS);
    assert.equal(normalizeWaitStageSettings({ enabled: false }).enabled, false);
    assert.equal(normalizeWaitStageSettings({ games: false }).games, false);
    assert.equal(normalizeWaitStageSettings({ voice: false }).voice, false);
    assert.equal(normalizeWaitStageSettings({ lineSeconds: 1 }).lineSeconds, 3);
    assert.equal(normalizeWaitStageSettings({ lineSeconds: 99 }).lineSeconds, 16);
    assert.equal(normalizeWaitStageSettings({ lineSeconds: '8' }).lineSeconds, 8);
    assert.equal(normalizeWaitStageSettings({ lineSeconds: 'abc' }).lineSeconds, 6);
});

test('gate:wait-stage:weave-mixes-replay-and-fallback-without-double-quote', () => {
    const replay = [
        { who: '艾莉', text: '第一句。' },
        { who: '露娜', text: '第二句。' },
    ];
    let seed = 7;
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    const out = weaveWaitStageLines(replay, WAIT_STAGE_FALLBACK_LINES, { random, limit: 8 });
    assert.equal(out.length, 8);
    for (let i = 1; i < out.length; i += 1) {
        assert.equal(Boolean(out[i].who) && Boolean(out[i - 1].who), false);
    }
    assert.equal(out.filter((line) => line.who).length, 2);
    assert.equal(out.filter((line) => !line.who).length, 6);
});
