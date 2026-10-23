import test from 'node:test';
import assert from 'node:assert/strict';
import Majiang from '@kobalab/majiang-core';
import AI from '@kobalab/majiang-ai';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';
import {
    MAHJONG_STYLES,
    MindfulAI,
    autoPersona,
    buildPersonaPrompt,
    createMind,
    createPersonaStore,
    decisionKnobs,
    feelResult,
    mindMood,
    normalizePersona,
    parsePersonaReply,
    pickLine,
    readSituation,
} from '../src/visual/igs-ui/wait-stage-mahjong-mind.js';
import { forgetMahjongTable, liveFace, startMahjong } from '../src/visual/igs-ui/wait-stage-mahjong.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';
import { buildWaitStageModel, createWaitStageRuntime } from '../src/visual/igs-ui/wait-stage-runtime.js';
import { registerWaitStageGamePack, unregisterWaitStageGamePack } from '../src/visual/igs-ui/wait-stage-games-api.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
    };
}

function fakeDoc() {
    return { createElement(tag) {
        const node = new FakeEl(this, tag);
        node.classList = { add(value) { node.className += ` ${value}`; } };
        return node;
    } };
}

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function playSeeded(players, seed) {
    const keep = Math.random;
    Math.random = seeded(seed);
    try {
        const game = new Majiang.Game(players, () => {}, Majiang.rule({ '場数': 0 }), 'test');
        game.do_sync();
        return game._paipu;
    } finally {
        Math.random = keep;
    }
}

const flush = (ms = 0) => new Promise((resolve) => { setTimeout(resolve, ms); });

function fakeService({ lore = {}, reply = null, status = { ok: true, via: 'secondary' } } = {}) {
    const calls = { lore: 0, ask: [] };
    return {
        calls,
        status: () => status,
        lore(names) {
            calls.lore += 1;
            return { ok: true, list: names.map((name) => ({ name, entries: lore[name] || [] })) };
        },
        async ask(prompt) {
            calls.ask.push(prompt);
            return reply ? { ok: true, text: reply } : { ok: false, reason: 'failed' };
        },
    };
}

test('gate:wait-stage:mahjong-mind-plain-matches-the-engine-move-for-move', () => {
    for (const seed of [11, 12]) {
        const base = playSeeded([new AI(), new AI(), new AI(), new AI()], seed);
        const plain = playSeeded([0, 1, 2, 3].map((i) => new MindfulAI({ style: 'steady' }, { plain: true, think: false, random: seeded(i) })), seed);
        assert.deepEqual(plain.log, base.log, `第 ${seed} 副牌应和原引擎一模一样`);
    }
});

test('gate:wait-stage:mahjong-mind-normalizes-and-parses-llm-personas', () => {
    const loose = normalizePersona({ style: 'nope', adjust: { push: 9 }, lines: { win: ['  好耶  ', '', 'x'.repeat(50)], riichi: '立直！', bogus: ['?'] } }, '绫', 'ai');
    assert.equal(loose.style, 'steady');
    assert.equal(loose.params.push, 0.3, 'adjust 每项最多 ±0.3');
    assert.deepEqual(loose.lines.win, ['好耶', 'x'.repeat(30)]);
    assert.deepEqual(loose.lines.riichi, ['立直！']);
    assert.equal(loose.lines.bogus, undefined);
    const reply = '好的，结果如下：\n```json\n{"绫":{"style":"gambler","adjust":{"skill":-0.2},"summary":"爱赌","lines":{"win":["赢啦"]}},"凛":{"style":"???"}}\n```';
    const parsed = parsePersonaReply(reply, ['绫', '凛', '咲']);
    assert.deepEqual(Object.keys(parsed), ['绫']);
    assert.equal(parsed['绫'].style, 'gambler');
    assert.ok(Math.abs(parsed['绫'].params.skill - (MAHJONG_STYLES.gambler.skill - 0.2)) < 1e-9);
    assert.equal(pickLine(parsed['绫'], 'win', () => 0), '赢啦', '自己的台词优先');
    assert.ok(pickLine(parsed['绫'], 'dealIn', () => 0), '没写的类别用打法自带的');
    assert.equal(autoPersona('绫').style, autoPersona('绫').style, '随机配也是同名同打法');
    const prompt = buildPersonaPrompt([{ name: '绫', entries: [{ title: '绫', content: '长'.repeat(5000) }] }]);
    assert.match(prompt.user, /【绫】/);
    assert.ok(prompt.user.includes('长'.repeat(5000)), '世界书条目整条送去，不截断');
});

test('gate:wait-stage:mahjong-mind-store-asks-the-secondary-api-once-per-worldbook-version', async () => {
    const storage = memoryStorage();
    const lore = { 绫: [{ title: '绫', content: '好胜，爱赌。' }] };
    const reply = JSON.stringify({ 绫: { style: 'gambler', summary: '好胜', lines: { win: ['赢了！'] } } });
    const svc = fakeService({ lore, reply });
    const store = createPersonaStore({ storage, service: svc });
    const pending = store.ensure(['绫', '凛']);
    assert.equal(store.state('绫'), 'pending');
    await pending;
    assert.equal(svc.calls.ask.length, 1);
    assert.match(svc.calls.ask[0].user, /好胜，爱赌/);
    assert.doesNotMatch(svc.calls.ask[0].user, /【凛】/, '世界书里没有的人不送去问');
    assert.equal(store.state('绫'), 'ai');
    assert.equal(store.get('绫').style, 'gambler');
    assert.equal(store.state('凛'), 'auto');
    assert.match(store.note('凛'), /没有她的条目/);

    const again = fakeService({ lore, reply });
    const reopened = createPersonaStore({ storage, service: again });
    await reopened.ensure(['绫']);
    assert.equal(again.calls.ask.length, 0, '世界书没变就用存下的');
    assert.equal(reopened.get('绫').style, 'gambler');

    const edited = fakeService({ lore: { 绫: [{ title: '绫', content: '改了设定，变胆小。' }] }, reply: JSON.stringify({ 绫: { style: 'cautious' } }) });
    const third = createPersonaStore({ storage, service: edited });
    await third.ensure(['绫']);
    assert.equal(edited.calls.ask.length, 1, '世界书改了重配');
    assert.equal(third.get('绫').style, 'cautious');

    third.setStyle('绫', 'swift');
    assert.equal(third.state('绫'), 'user');
    assert.equal(third.get('绫').style, 'swift');
    assert.equal(third.baseStyle('绫'), 'cautious');
    third.setStyle('绫', '');
    assert.equal(third.get('绫').style, 'cautious');
});

test('gate:wait-stage:mahjong-mind-store-skips-the-tavern-api-while-the-reply-streams', async () => {
    const svc = fakeService({ lore: { 绫: [{ title: '绫', content: '冷静' }] }, reply: '{}', status: { ok: false, reason: 'busy' } });
    const store = createPersonaStore({ storage: memoryStorage(), service: svc });
    await store.ensure(['绫']);
    assert.equal(svc.calls.ask.length, 0);
    assert.equal(store.state('绫'), 'auto');
    assert.match(store.note('绫'), /正文还在写/);
    await store.ensure(['绫']);
    assert.equal(svc.calls.lore, 2, '稍后再选人会重试');
});

test('gate:wait-stage:mahjong-mind-feels-the-scoreboard-and-the-last-hand', () => {
    const behind = readSituation({ player_id: [0, 1, 2, 3], defen: [30000, 20000, 34000, 16000], zhuangfeng: 0, jushu: 3 }, 3);
    assert.equal(behind.rank, 4);
    assert.equal(behind.allLast, true);
    assert.ok(behind.push > 0.5, '最后一局垫底要推');
    const leader = readSituation({ player_id: [0, 1, 2, 3], defen: [30000, 20000, 34000, 16000], zhuangfeng: 0, jushu: 3 }, 2);
    assert.ok(leader.push < 0 && leader.dama > 0, '最后一局领先求稳');

    const hot = createMind();
    for (let i = 0; i < 2; i += 1) feelResult(hot, MAHJONG_STYLES.attack, { kind: 'dealIn', points: 8000 });
    assert.equal(mindMood(hot), '愤怒');
    const shy = createMind();
    for (let i = 0; i < 2; i += 1) feelResult(shy, MAHJONG_STYLES.cautious, { kind: 'dealIn', points: 8000 });
    assert.equal(mindMood(shy), '紧张');
    const steady = decisionKnobs(MAHJONG_STYLES.attack, null, null);
    assert.ok(decisionKnobs(MAHJONG_STYLES.attack, null, hot).push > steady.push, '上头了更冲');
    assert.ok(decisionKnobs(MAHJONG_STYLES.cautious, null, shy).push < decisionKnobs(MAHJONG_STYLES.cautious, null, null).push, '吓到了更怂');
});

test('gate:wait-stage:mahjong-mind-only-pauses-on-real-decisions', () => {
    const ai = new MindfulAI({ style: 'swift' }, { random: () => 0.5 });
    ai.noteThink(0);
    assert.equal(ai.thinkDelay({}), 0, '没做决定不停顿');
    ai.noteThink(0);
    const fast = ai.thinkDelay({ dapai: 'm1' });
    const slow = new MindfulAI({ style: 'cautious' }, { random: () => 0.5 });
    slow.noteThink(0);
    assert.ok(slow.thinkDelay({ dapai: 'm1' }) > fast, '谨慎型想得久');
    const sync = new MindfulAI({ style: 'cautious' }, { think: false });
    sync.noteThink(400);
    assert.equal(sync.thinkDelay({ dapai: 'm1' }), 0);
});

test('gate:wait-stage:mahjong-picker-shows-and-cycles-each-rivals-style', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const svc = fakeService({
        lore: { 绫: [{ title: '绫', content: '赌徒' }] },
        reply: JSON.stringify({ 绫: { style: 'gambler', summary: '赌上一切' } }),
    });
    const model = { names: ['绫', '凛', '咲'], art: { sprites: [], pictures: [] } };
    startMahjong({ doc, board, model, storage: memoryStorage(), persona: svc, setNote() {}, requestClose() {} });
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    const chips = () => board.querySelectorAll('.igs-mj-style');
    assert.ok(chips().every((chip) => chip.textContent === '配打法中…'), '还没读完不先显示随机的打法');
    await flush(1300);
    assert.equal(chips().length, 3);
    assert.equal(svc.calls.ask.length, 1, '三个人凑一次问');
    assert.equal(chips()[0].textContent, '赌徒型');
    assert.match(chips()[0].title, /赌上一切/);
    assert.match(chips()[1].textContent, /· 随机$/);
    chips()[0].fire('click');
    assert.match(chips()[0].textContent, /· 手选$/);
    assert.notEqual(chips()[0].textContent.replace(' · 手选', ''), '赌徒型');
    for (let i = 0; i < 10 && /手选/.test(chips()[0].textContent); i += 1) chips()[0].fire('click');
    assert.equal(chips()[0].textContent, '赌徒型', '转一圈回到世界书配的');
    forgetMahjongTable();
});

test('gate:wait-stage:card-worldbook-hits-by-name-in-keys-and-titles-only-enabled', async () => {
    const books = {
        main: { entries: {
            1: { key: ['绫', '白石绫'], comment: '人物', content: '绫：好胜。' },
            2: { key: ['学园'], comment: '绫的过去', content: '小时候输过一次麻将。' },
            3: { key: ['凛'], comment: '凛', content: '凛的设定' },
            4: { key: ['绫'], comment: '关掉的', content: '不该出现', disable: true },
            5: { key: ['绫'], comment: '空的', content: '  ' },
        } },
        extra: { entries: { 1: { key: ['咲'], comment: '', content: '咲的设定' } } },
    };
    const ctx = {
        characterId: 0,
        characters: [{ name: '主角卡', data: { extensions: { world: 'main' } } }],
        loadWorldInfo: async (name) => books[name],
    };
    const host = createIllustrationMessageHost({
        SillyTavern: { getContext: () => ctx },
        TavernHelper: { getCharWorldbookNames: () => ({ primary: 'main', additional: ['extra'] }) },
    });
    const list = await host.readCardWorldbook(['绫', '咲', '无名']);
    assert.deepEqual(list.map((item) => item.name), ['绫', '咲', '无名']);
    assert.deepEqual(list[0].entries.map((entry) => entry.content), ['绫：好胜。', '小时候输过一次麻将。']);
    assert.deepEqual(list[1].entries.map((entry) => entry.content), ['咲的设定']);
    assert.deepEqual(list[2].entries, []);
});

test('gate:wait-stage:mahjong-picks-up-sprites-the-gallery-reads-back-later', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const listeners = new Set();
    let model = { names: ['绫', '凛', '咲'], art: { sprites: [], pictures: [] } };
    const ctx = {
        doc, board, model, storage: memoryStorage(), setNote() {}, requestClose() {},
        getModel: () => model,
        onModel(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
    const push = (next) => { model = next; for (const fn of [...listeners]) fn(next); };
    const face = (url) => ({ 平和: { url }, 喜悦: { url: `${url}-joy` } });
    startMahjong(ctx);
    const crops = (scope) => board.querySelectorAll(`${scope} .igs-mj-crop`).map((node) => node.src).sort();
    assert.deepEqual(crops('.igs-mj-reel'), [], '图库还没读回：只有首字');
    board.querySelectorAll('.igs-mj-person')[0].fire('click');
    push({ ...model, cast: [
        { name: '绫', outfit: '校服', faces: face('aya'), wardrobe: [{ outfit: '校服', faces: face('aya') }, { outfit: '泳装', faces: face('aya-swim') }] },
        { name: '凛', outfit: '便服', faces: face('rin') },
    ] });
    assert.deepEqual(crops('.igs-mj-reel'), ['aya', 'rin'], '读回来的人换上立绘');
    assert.deepEqual(crops('.igs-mj-slot'), ['aya'], '已选的格子也换');
    board.querySelectorAll('.igs-mj-outfit-step')[1].fire('click');
    for (const button of board.querySelectorAll('.igs-mj-person').slice(1)) button.fire('click');
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    await flush(80);
    assert.deepEqual(crops('.igs-mj-crowd'), ['aya-swim', 'rin']);
    push({ ...model, cast: [...model.cast, { name: '咲', outfit: '运动服', faces: face('saki') }] });
    assert.deepEqual(crops('.igs-mj-crowd'), ['aya-swim', 'rin', 'saki'], '牌桌上也补上，衣装照旧');
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-asks-the-host-only-for-the-portraits-it-shows', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const asked = [];
    const pending = new Map();
    const loadImage = (url) => {
        asked.push(url);
        if (url === 'igs-gen:rin') return 'blob:rin';
        return new Promise((resolve) => pending.set(url, resolve));
    };
    const face = (id) => ({ 平和: { url: `igs-gen:${id}` }, 喜悦: { url: `igs-gen:${id}-joy` } });
    const model = { names: ['绫', '凛', '咲'], art: { sprites: [], pictures: [] }, cast: [
        { name: '绫', outfit: '校服', faces: face('aya') },
        { name: '凛', outfit: '便服', faces: face('rin') },
        { name: '咲', outfit: '运动服', faces: face('saki') },
    ] };
    startMahjong({ doc, board, model, loadImage, storage: memoryStorage(), setNote() {}, requestClose() {} });
    assert.deepEqual([...new Set(asked)].sort(), ['igs-gen:aya', 'igs-gen:rin', 'igs-gen:saki'], '只读露脸的那张，别的表情不读');
    const crops = () => board.querySelectorAll('.igs-mj-reel .igs-mj-crop').map((node) => node.src || '');
    assert.deepEqual(crops().sort(), ['', '', 'blob:rin'], '缓存里有的立刻显示，没读回的先空着');
    pending.get('igs-gen:aya')('blob:aya');
    pending.get('igs-gen:saki')('');
    await flush(0);
    assert.deepEqual(crops().sort(), ['blob:aya', 'blob:rin'], '读回的换上，读不到的撤掉留首字');
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-table-face-drops-the-old-layer-even-on-a-cache-hit', async () => {
    forgetMahjongTable();
    const doc = { createElement(tag) {
        const node = new FakeEl(this, tag);
        node.classList = { add(value) { node.className += ` ${value}`; } };
        if (tag === 'img') {
            let src = '';
            Object.defineProperty(node, 'src', { get: () => src, set(value) { src = value; node.complete = true; node.naturalWidth = 712; node.naturalHeight = 1024; } });
        }
        return node;
    } };
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const listeners = new Set();
    const face = (url) => ({ 平和: { url } });
    let model = { names: ['绫', '凛', '咲'], art: { sprites: [], pictures: [] }, cast: [
        { name: '绫', outfit: '校服', faces: face('aya') },
        { name: '凛', outfit: '便服', faces: face('rin') },
        { name: '咲', outfit: '运动服', faces: face('saki') },
    ] };
    startMahjong({ doc, board, model, storage: memoryStorage(), setNote() {}, requestClose() {},
        getModel: () => model, onModel(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    try {
        await flush(80);
        const ayaLayers = () => board.querySelectorAll('.igs-mj-crowd .igs-mj-crop').filter((node) => /^aya/.test(node.src));
        assert.equal(ayaLayers().length, 1);
        model = { ...model, cast: [{ ...model.cast[0], faces: face('aya-new') }, ...model.cast.slice(1)] };
        for (const fn of [...listeners]) fn(model);
        assert.deepEqual(ayaLayers().map((node) => node.src), ['aya-new'], '缓存命中当场读好，旧图层当场撤，不留残影');
        assert.match(ayaLayers()[0].className, /is-swap/, '换图是硬切，不淡入');
    } finally {
        forgetMahjongTable();
    }
});

test('gate:wait-stage:mahjong-table-face-holds-still-between-moods', async () => {
    const doc = { createElement(tag) {
        const node = new FakeEl(this, tag);
        if (tag === 'img') {
            let src = '';
            Object.defineProperty(node, 'src', { get: () => src, set(value) { src = value; node.complete = true; node.naturalWidth = 712; node.naturalHeight = 1024; } });
        }
        return node;
    } };
    const head = { x: 0.5, top: 0.12, w: 0.24 };
    const person = { faces: { 平和: { url: 'calm', head }, 喜悦: { url: 'joy' }, 愤怒: { url: 'angry' } } };
    const face = liveFace(doc, person, '绫');
    const layers = () => face.node.querySelectorAll('.igs-mj-crop');
    face.show('平和');
    const calm = layers()[0];
    face.show('喜悦');
    face.show('愤怒');
    assert.deepEqual(layers().map((node) => node.src), ['calm'], '刚换过表情，1.5 秒内不再换');
    await flush(1600);
    assert.deepEqual(layers().map((node) => node.src), ['angry'], '只认最新的表情，旧图层当场撤');
    const angry = layers()[0];
    assert.match(angry.className, /is-swap/);
    assert.deepEqual([angry.style.width, angry.style.left, angry.style.top], [calm.style.width, calm.style.left, calm.style.top],
        '没标头部的表情借「平和」的裁切框，脸不跳位');
});

test('gate:wait-stage:mahjong-table-face-keeps-one-frame-per-outfit', async () => {
    const doc = { createElement(tag) {
        const node = new FakeEl(this, tag);
        if (tag === 'img') {
            let src = '';
            Object.defineProperty(node, 'src', { get: () => src, set(value) { src = value; node.complete = true; node.naturalWidth = 712; node.naturalHeight = 1024; } });
        }
        return node;
    } };
    const person = { faces: {
        平和: { url: 'calm', head: { x: 0.5, top: 0.12, w: 0.24, hh: 0.3 } },
        喜悦: { url: 'joy', head: { x: 0.53, top: 0.14, w: 0.22, hh: 0.28 } },
    } };
    const face = liveFace(doc, person, '绫');
    const layer = () => face.node.querySelector('.igs-mj-crop');
    face.show('平和');
    const calm = layer();
    const frame = [calm.style.width, calm.style.left, calm.style.top];
    await flush(1600);
    face.show('喜悦');
    assert.equal(layer().src, 'joy');
    assert.deepEqual([layer().style.width, layer().style.left, layer().style.top], frame, '各表情的头部标定差几像素，同尺寸的图沿用同一个取景框');
});

test('gate:wait-stage:mahjong-table-face-swaps-only-after-the-new-image-decodes', async () => {
    const decodes = [];
    const doc = { createElement(tag) {
        const node = new FakeEl(this, tag);
        if (tag === 'img') {
            let src = '';
            Object.defineProperty(node, 'src', { get: () => src, set(value) { src = value; node.complete = true; node.naturalWidth = 712; node.naturalHeight = 1024; } });
            node.decode = () => new Promise((resolve) => decodes.push(resolve));
        }
        return node;
    } };
    const person = { faces: { 平和: { url: 'calm' }, 喜悦: { url: 'joy' } } };
    const face = liveFace(doc, person, '绫');
    const srcs = () => face.node.querySelectorAll('.igs-mj-crop').map((node) => node.src);
    face.show('平和');
    decodes.shift()();
    await flush(0);
    await flush(1600);
    face.show('喜悦');
    assert.deepEqual(srcs(), ['calm', 'joy'], '新图还没解码完，旧图留着');
    assert.doesNotMatch(face.node.querySelectorAll('.igs-mj-crop')[1].className, /is-ready/);
    decodes.shift()();
    await flush(0);
    assert.deepEqual(srcs(), ['joy'], '解码完同一帧里顶上并撤掉旧图');
});

test('gate:wait-stage:runtime-keeps-gallery-addresses-and-lends-the-loader', () => {
    const seen = [];
    unregisterWaitStageGamePack();
    registerWaitStageGamePack({ id: 'probe', list: () => ['probe'], label: () => '探针', start(ctx) { seen.push(ctx); } });
    const timers = makeTimers();
    const doc = { createElement(tag) {
        const node = new FakeEl(doc, tag);
        node.classList = { add(value) { node.className += ` ${value}`; }, remove() {}, toggle() {}, contains: () => false };
        return node;
    } };
    let released = 0;
    const runtime = createWaitStageRuntime({
        doc, random: () => 0, timers: { setTimeout: timers.schedule, clearTimeout: timers.clear },
        loadImage: (url) => `loaded:${url}`,
        releaseImages: () => { released += 1; },
    });
    const model = buildWaitStageModel({ sceneAssets: { characterOutfits: { 绫: { 校服: { moods: { 平和: 'igs-gen:aya' } } } } } });
    assert.equal(model.cast[0].faces['平和'].url, 'igs-gen:aya', '建模型不读图，留原地址');
    const root = runtime.open(new FakeEl(doc, 'div'), { settings: {}, play: true, model });
    root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    assert.equal(seen[0].loadImage('igs-gen:aya'), 'loaded:igs-gen:aya');
    const before = released;
    seen[0].requestClose();
    assert.equal(released, before + 1, '收起小游戏放掉读过的图');
    unregisterWaitStageGamePack();
});

test('gate:wait-stage:runtime-passes-model-updates-to-the-running-game', () => {
    const seen = [];
    unregisterWaitStageGamePack();
    registerWaitStageGamePack({ id: 'probe', list: () => ['probe'], label: () => '探针', start(ctx) { seen.push(ctx); } });
    const timers = makeTimers();
    const doc = { createElement(tag) {
        const node = new FakeEl(doc, tag);
        node.classList = { add(value) { node.className += ` ${value}`; }, remove() {}, toggle() {}, contains: () => false };
        return node;
    } };
    const runtime = createWaitStageRuntime({ doc, random: () => 0, timers: { setTimeout: timers.schedule, clearTimeout: timers.clear } });
    const first = { names: ['绫'], art: { sprites: [], pictures: [] }, lines: [] };
    const root = runtime.open(new FakeEl(doc, 'div'), { settings: {}, play: true, model: first });
    root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    const got = [];
    seen[0].onModel((model) => got.push(model));
    const second = { ...first, cast: [{ name: '绫', faces: { 平和: { url: 'aya' } } }] };
    runtime.update(second);
    unregisterWaitStageGamePack();
    assert.equal(got.length, 1);
    assert.deepEqual(got[0].cast, second.cast);
    assert.deepEqual(seen[0].getModel().cast, second.cast);
});

test('gate:wait-stage:runtime-hands-the-persona-service-to-the-game', () => {
    const seen = [];
    unregisterWaitStageGamePack();
    registerWaitStageGamePack({ id: 'probe', list: () => ['probe'], label: () => '探针', start(ctx) { seen.push(ctx); } });
    const timers = makeTimers();
    const doc = { createElement(tag) {
        const node = new FakeEl(doc, tag);
        node.classList = { add(value) { node.className += ` ${value}`; }, remove() {}, toggle() {}, contains: () => false };
        return node;
    } };
    const host = new FakeEl(doc, 'div');
    const persona = { status: () => ({ ok: false }), lore: () => ({ ok: false }), ask: async () => ({ ok: false }) };
    const runtime = createWaitStageRuntime({ doc, random: () => 0, persona, timers: { setTimeout: timers.schedule, clearTimeout: timers.clear } });
    const root = runtime.open(host, { settings: {}, play: true, model: { names: ['绫'], art: { sprites: [], pictures: [] }, lines: [] } });
    root.querySelector('.igs-ws-games').querySelector('button').fire('click');
    unregisterWaitStageGamePack();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].persona, persona);
});
