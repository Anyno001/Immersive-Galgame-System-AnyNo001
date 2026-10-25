import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WAIT_STAGE_DEFAULTS,
    WAIT_STAGE_FALLBACK_LINES,
    normalizeWaitStageSettings,
    weaveWaitStageLines,
} from '../src/visual/igs-ui/wait-stage.js';
import { buildWaitStageModel, collectWaitStageCast, createWaitStageRuntime } from '../src/visual/igs-ui/wait-stage-runtime.js';
import { attachWaitStageGames, detachWaitStageGames, getWaitStageGamePack, registerWaitStageGamePack, unregisterWaitStageGamePack } from '../src/visual/igs-ui/wait-stage-games-api.js';
import { createWaitStageGamePack } from '../src/visual/igs-ui/wait-stage-games.js';
import { installWaitStageGames, uninstallWaitStageGames } from '../src/plugins/wait-stage-games-entry.js';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';

function runtimeHarness(settings = {}, { games = false, play = false } = {}) {
    unregisterWaitStageGamePack();
    if (games) registerWaitStageGamePack(createWaitStageGamePack());
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
    const root = runtime.open(host, { settings, play, model: buildWaitStageModel({ settings, random: () => 0 }) });
    return { runtime, root, timers, ready: () => ready, dismissed: () => dismissed };
}

test('gate:wait-stage:playing-a-game-waits-for-an-explicit-next-floor-click', () => {
    const h = runtimeHarness({}, { games: true });
    h.root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    assert.equal(h.runtime.replyArrived(), false);
    h.root.querySelector('.igs-ws-hands').querySelector('button').fire('click');
    h.timers.advance(850);
    assert.equal(h.ready(), 0, '楼层写好后仍停在小游戏');
    assert.equal(h.runtime.isOpen(), true);
    const next = h.root.querySelector('[data-igs-waitstage-next="1"]');
    assert.equal(next.hidden, false);
    assert.match(h.root.querySelector('.igs-ws-state').textContent, /加载下一楼/);
    next.fire('click');
    assert.equal(h.ready(), 1);
    assert.match(h.root.querySelector('.igs-ws-state').textContent, /正在打开下一楼/);
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

test('gate:wait-stage:cast-faces-use-the-default-outfit-and-fall-back-to-calm', () => {
    const cast = collectWaitStageCast({
        characterOutfits: {
            绫: { 校服: { moods: { 平和: 'aya-school-calm', 喜悦: 'aya-school-joy' } }, 泳装: { moods: { 平和: 'aya-swim-calm', 愤怒: 'aya-swim-angry' } } },
            凛: { 便服: { moods: { 思考: 'rin-think' }, base: 'rin-base' }, 礼服: { moods: { 平和: 'rin-dress' } } },
        },
        characterDefaultOutfits: { 绫: { version: 1, outfitName: '泳装' } },
        characters: { 咲: { 平和: 'saki-calm' } },
    }, { spriteHeads: { '绫|泳装::愤怒': { x: 0.5, top: 0.1, w: 0.2 } } });
    const byName = Object.fromEntries(cast.map((person) => [person.name, person]));
    assert.equal(byName.绫.outfit, '泳装');
    assert.equal(byName.绫.faces.愤怒.url, 'aya-swim-angry');
    assert.equal(byName.绫.faces.喜悦.url, 'aya-swim-calm');
    assert.ok(byName.绫.faces.愤怒.head);
    assert.equal(byName.凛.outfit, '便服');
    assert.equal(byName.凛.faces.思考.url, 'rin-think');
    assert.equal(byName.凛.faces.平和.url, 'rin-base');
    assert.equal(byName.咲.faces.害羞.url, 'saki-calm');
});

test('gate:wait-stage:cast-carries-the-nude-outfit-for-the-next-match', () => {
    const cast = collectWaitStageCast({
        characterOutfits: {
            绫: { 裸体: { moods: { 害羞: 'aya-nude-shy' }, base: 'aya-nude' }, 校服: { moods: { 平和: 'aya-school-calm' } } },
            凛: { 礼服: { moods: { 平和: 'rin-dress' } } },
        },
    });
    const byName = Object.fromEntries(cast.map((person) => [person.name, person]));
    assert.equal(byName.绫.outfit, '校服');
    assert.equal(byName.绫.faces.平和.url, 'aya-school-calm');
    assert.equal(byName.绫.nude.平和.url, 'aya-nude');
    assert.equal(byName.绫.nude.害羞.url, 'aya-nude-shy');
    assert.equal(byName.凛.nude, undefined);
});

test('gate:wait-stage:cast-lists-every-outfit-she-can-change-into', () => {
    const cast = collectWaitStageCast({
        characterOutfits: {
            凛: {
                便服: { moods: { 平和: 'rin-casual' } },
                礼服: { moods: { 平和: 'rin-dress', 喜悦: 'rin-dress-joy' } },
                裸体: { base: 'rin-nude' },
                空衣装: { moods: {} },
            },
        },
        characterDefaultOutfits: { 凛: { version: 1, outfitName: '礼服' } },
    });
    const [rin] = cast;
    assert.equal(rin.outfit, '礼服');
    assert.deepEqual(rin.wardrobe.map((look) => look.outfit), ['礼服', '便服']);
    assert.equal(rin.wardrobe[1].faces.喜悦.url, 'rin-casual');
    assert.equal(rin.nude.平和.url, 'rin-nude');
});

test('gate:wait-stage:games-stay-hidden-until-the-pack-is-installed', () => {
    const h = runtimeHarness();
    const row = h.root.querySelector('.igs-ws-games');
    assert.equal(row.hidden, true);
    assert.equal(row.querySelector('button'), null);
    assert.equal(h.runtime.replyArrived(), true);
    h.runtime.close();
});

test('gate:wait-stage:toolbar-play-opens-games-without-a-pending-reply', () => {
    // 等待过场和等待小游戏都关了，主动来玩的照样能玩。
    const h = runtimeHarness({ enabled: false, games: false }, { games: true, play: true });
    assert.equal(h.runtime.isPlaying(), true);
    assert.equal(h.root.querySelector('.igs-ws-dots').hidden, true);
    assert.equal(h.root.querySelector('.igs-ws-line').children[0].innerHTML, '挑一个玩吧', '没在等回复，不轮「正在写」的兜底句');
    assert.equal(h.timers.size(), 0);
    const row = h.root.querySelector('.igs-ws-games');
    assert.equal(row.hidden, false);
    assert.ok(row.querySelector('button'));
    const back = h.root.querySelector('[data-igs-waitstage-back="1"]');
    assert.equal(back.textContent, '返回阅读');
    assert.equal(h.root.querySelector('.igs-ws-actions').hidden, false);
    h.runtime.showSlow();
    assert.doesNotMatch(h.root.querySelector('.igs-ws-state').textContent, /等待较久/);
    back.fire('click');
    assert.equal(h.dismissed(), 0, '返回阅读只收起这一层，不当成放弃等回复');
    assert.equal(h.runtime.isOpen(), false);
    assert.equal(h.timers.size(), 0);
});

test('gate:wait-stage:toolbar-play-turns-into-the-wait-without-dropping-the-game', () => {
    const h = runtimeHarness({}, { games: true, play: true });
    h.root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    assert.equal(h.runtime.enterWait(), true);
    assert.equal(h.runtime.isPlaying(), false);
    assert.equal(h.root.querySelector('.igs-ws-dots').hidden, false);
    assert.equal(h.root.querySelector('[data-igs-waitstage-back="1"]').textContent, '返回当前楼');
    assert.equal(h.root.getAttribute('data-igs-waitstage-game'), 'rps');
    assert.equal(h.runtime.replyArrived(), false, '牌局还在，写好的楼等玩家自己点');
    assert.equal(h.root.querySelector('[data-igs-waitstage-next="1"]').hidden, false);
    assert.equal(h.runtime.enterWait(), false);
    h.runtime.close();
});

test('gate:wait-stage:games-get-the-back-and-next-floor-buttons-for-their-own-toolbar', () => {
    const h = runtimeHarness({}, { games: true });
    const real = createWaitStageGamePack();
    let ctx = null;
    registerWaitStageGamePack({ ...real, start(next) { ctx = next; return real.start(next); } });
    h.root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    assert.deepEqual(ctx.host.state(), { back: '', next: false, nextBusy: false }, '等回复时不给返回');
    const seen = [];
    const off = ctx.host.onChange((state) => seen.push(state));
    assert.equal(h.runtime.replyArrived(), false);
    assert.deepEqual(seen.pop(), { back: '', next: true, nextBusy: false });
    ctx.host.back();
    assert.equal(h.dismissed(), 0);
    ctx.host.next();
    assert.equal(h.ready(), 1, '工具栏里的「加载下一楼」和底栏按钮走同一条路');
    assert.equal(seen.pop().nextBusy, true);
    off();
    h.runtime.close();

    const play = runtimeHarness({}, { games: true, play: true });
    registerWaitStageGamePack({ ...real, start(next) { ctx = next; return real.start(next); } });
    play.root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    assert.equal(ctx.host.state().back, '返回阅读');
    ctx.host.back();
    assert.equal(play.runtime.isOpen(), false);
    assert.equal(play.dismissed(), 0);
});

test('gate:wait-stage:toolbar-button-is-registered-for-the-reader', () => {
    const src = (file) => fs.readFileSync(path.resolve(import.meta.dirname, '../src/visual/igs-ui', file), 'utf8');
    assert.match(src('original-reader-source.js'), /id: 'mini-games', group: 'view'.*ORIGINAL_READER_ICONS\.games/);
    assert.match(src('reader-host-constants.js'), /\['mini-games', '小游戏'\]/);
    assert.match(src('reader-host.js'), /normalizedAction === 'mini-games'/);
    assert.match(src('reader-dom-render.js'), /if \(!getWaitStageGamePack\(\)\) hiddenSet\.add\('mini-games'\)/);
});

test('gate:wait-stage:separate-script-installs-the-pack-onto-the-host-window', () => {
    unregisterWaitStageGamePack();
    const root = {};
    const pack = installWaitStageGames(root);
    assert.equal(root.__IGS_WAIT_GAME_PACK__, pack);
    assert.equal(Array.isArray(root.IGS_WAIT_GAMES), true);
    attachWaitStageGames(root);
    assert.equal(getWaitStageGamePack(), pack);
    assert.deepEqual(pack.list({ art: {}, replay: [], names: [] }), ['rps', 'mahjong', 'tiles', 'snake', 'ludo']);
    uninstallWaitStageGames(root);
    detachWaitStageGames(root);
    assert.equal(getWaitStageGamePack(), null);
    assert.equal(root.__IGS_WAIT_GAME_PACK__, undefined);
});

test('gate:wait-stage:main-frontend-does-not-import-the-game-pack', () => {
    const srcRoot = path.resolve(import.meta.dirname, '../src');
    const entry = path.join(srcRoot, 'index.js');
    const seen = new Set();
    const stack = [entry];
    while (stack.length) {
        const file = stack.pop();
        if (seen.has(file) || !fs.existsSync(file)) continue;
        seen.add(file);
        const text = fs.readFileSync(file, 'utf8');
        for (const match of text.matchAll(/from '(\.[^']+)'/g)) {
            let next = path.resolve(path.dirname(file), match[1]);
            if (!next.endsWith('.js')) next += '.js';
            stack.push(next);
        }
    }
    const names = [...seen].map((file) => path.relative(srcRoot, file));
    assert.equal(names.includes('visual/igs-ui/wait-stage-games.js'), false);
    assert.equal(names.includes('plugins/wait-stage-games-entry.js'), false);
    assert.equal(names.includes('visual/igs-ui/wait-stage-games-api.js'), true);
});

test('wait-stage games pack: decorate 把文字按钮画成带图标的卡片', async () => {
    const { createWaitStageGamePack, WAIT_STAGE_GAMES } = await import('../src/visual/igs-ui/wait-stage-games.js');
    const { FakeEl } = await import('./helpers/fake-dom.js');
    const pack = createWaitStageGamePack();
    const doc = { createElement(tag) { return new FakeEl(doc, tag); } };
    for (const [index, id] of WAIT_STAGE_GAMES.entries()) {
        const button = doc.createElement('button');
        button.className = 'igs-ws-chip';
        pack.decorate(button, id, index);
        assert.equal(button.className, 'igs-ws-game');
        assert.equal(button.getAttribute('data-game'), id);
        assert.match(button.innerHTML, /<svg/);
        assert.ok(button.innerHTML.includes(pack.label(id)));
        assert.ok(button.innerHTML.includes(String(index + 1).padStart(2, '0')));
    }
    assert.match(pack.style, /\.igs-ws-game-ico\{/);
});
