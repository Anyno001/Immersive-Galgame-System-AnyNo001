import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeLlmHost } from './helpers/fake-llm-host.js';
import fs from 'node:fs';
import path from 'node:path';

import { bootstrapIGS, createMemoryStorage, createPresetRegistry, PRESET_STORE_KEY } from '../src/index.js';
import { writeLegacyIgsSettings } from '../src/storage/legacy-igs.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { createDbTabClickGuard, toShujukuApiRowIndex } from '../src/shujuku-panel/panel-controller.js';
import { renderDbPanelInner } from '../src/shujuku-panel/panel-render.js';
import { createImageResourceCache, createResourceCache } from '../src/media/resource-cache.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createIndexedDbGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-generated-assets.js';
import { localImageCacheFor } from '../src/media/tavern-image-cache.js';
import { stopMediaJournals } from '../src/media/media-record-journal.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { fakeMediaServer, pixel } from './helpers/fake-media-server.js';
// 同步假 setTimeout 的重入深度：回调内再次排定的定时器视为永不到期。
let syncTimerDepth = 0;

// 阅读器里的确认挂在遮罩上，不走浏览器 confirm。点「确定」后再等动作完成。
async function acceptPageModal(doc, pending) {
    let settled = false;
    const done = Promise.resolve(pending).finally(() => { settled = true; });
    for (let i = 0; i < 40 && !settled; i += 1) {
        const modal = doc.querySelector('.igs-page-modal');
        if (modal) {
            modal.dispatchEvent({ type: 'click', target: { closest: () => ({ getAttribute: () => 'ok' }) } });
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return done;
}

// 删除、清空、恢复默认、切世界观会先弹面板内的确认条：点「确定」后再等动作完成。
async function invokeConfirmed(controller, doc, action) {
    const pending = controller.invoke(action);
    for (let i = 0; i < 50; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bar = doc.querySelector('.igs-settings-dialog');
        if (bar) {
            bar.dispatchEvent({ type: 'click', target: { closest: () => ({ getAttribute: () => 'ok' }) } });
            break;
        }
    }
    return pending;
}
import { loadMoodReview, recordMoodReview } from '../src/scene/mood-review-store.js';
import { advanceChatReveal, applyChatToDom, cancelChatShow, getChatRevealState } from '../src/visual/igs-ui/chat-layer.js';
import { buildChatPageModel, normalizeChatShowSettings } from '../src/visual/igs-ui/chat-show-runtime.js';
import { resolveChatTheme } from '../src/visual/igs-ui/chat-themes.js';
import { ORIGINAL_READER_ICONS } from '../src/visual/igs-ui/original-reader-source.js';
import { createMapPanelController } from '../src/visual/igs-ui/map-panel.js';
import { createRecordPanelController } from '../src/visual/igs-ui/record-panel.js';
import { DEFAULT_SCENE_PROMPT_RULE } from '../src/visual/igs-ui/reader-host-constants.js';
import { applyTypewriterEffect } from '../src/visual/igs-ui/typewriter-runtime.js';
import { createAutoPlayClock } from './helpers/auto-play-clock.js';
import { waitForReaderPage } from './helpers/reader-render.js';
import { setStagePauseReason } from '../src/visual/igs-ui/stage-pause.js';
import { VISUAL_MODES } from '../src/visual/visual-mode.js';

import { createWaitStageRuntime, buildWaitStageModel } from '../src/visual/igs-ui/wait-stage-runtime.js';
import { installWaitStageGames, uninstallWaitStageGames } from '../src/plugins/wait-stage-games-entry.js';
import { COMBAT_TABLE_REQUIRED_API } from '../src/data/shujuku/combat-tables.js';

const appRoot = path.resolve(import.meta.dirname, '..');

test('gate:simulation:legacy-native-marker-inside-dialogue-keeps-one-page-and-visible-speaker', () => {
    const document = createFakeDocument();
    const raw = '<content>\n[igs-char:白墨|温和|先把画挂起来，你觉得呢？\n<IMG>\n19\n</IMG>\n]\n</content>';
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, characters: { 白墨: { 默认: 'data:image/png;base64,QkFJ' } } } }, readerSettings: { titleScreen: false } }),
        getIllustrationUrl: () => '',
    });
    try {
        const opened = host.openReader({ messageId: 22, message: { id: 22, text: raw }, raw }, { mode: 'fullscreen' });
        assert.equal(opened.ok, true);
        const content = host.getState().activeReader.snapshot.content;
        assert.deepEqual(content.segments, ['[白墨]：先把画挂起来，你觉得呢？']);
        assert.equal(content.speaker, '白墨');
        assert.equal(content.spriteImage, 'data:image/png;base64,QkFJ');
        assert.equal(content.cgActive, false);
        assert.equal(content.cgWaiting, true);
        assert.equal(content.illustrationSlot, 19);
        assert.equal(document.getElementById('igs-sprite').style.display, 'block');
    } finally { host.destroy(); }
});

test('gate:simulation:legacy-cg-marker-after-closed-dialogue-hides-orphan-bracket-without-losing-slot', () => {
    const document = createFakeDocument();
    const raw = '<content>\n[igs-char:白墨|温和|先把画挂起来，你觉得呢？]\n[igs-img:19]\n]\n下一句。\n</content>';
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, characters: { 白墨: { 默认: 'data:image/png;base64,QkFJ' } } } }, readerSettings: { titleScreen: false } }),
        getIllustrationUrl: () => '',
    });
    try {
        const opened = host.openReader({ messageId: 22, message: { id: 22, text: raw }, raw }, { mode: 'fullscreen' });
        assert.equal(opened.ok, true);
        const content = () => host.getState().activeReader.snapshot.content;
        assert.deepEqual(content().segments, ['[白墨]：先把画挂起来，你觉得呢？', '下一句。']);
        assert.equal(content().illustrationSlot, 19);
        assert.equal(content().cgWaiting, true);
        opened.controller.invokeAction('next');
        assert.equal(content().text, '下一句。');
    } finally { host.destroy(); }
});

test('gate:simulation:network-recovery-restores-the-original-sprite-without-settings', async () => {
    const { localImageCacheFor } = await import('../src/media/tavern-image-cache.js');
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    for (const mode of ['mobile', 'fullscreen']) {
        const signals = new EventTarget(), document = createFakeDocument();
        const global = { document, addEventListener: signals.addEventListener.bind(signals), removeEventListener: signals.removeEventListener.bind(signals) };
        const cache = localImageCacheFor(global);
        let offline = true, notify = () => {}, reads = 0;
        const images = { target: 'data:image/png;base64,VEFSR0VU', calm: 'data:image/png;base64,Q0FMTQ==' };
        const service = createAssetGenerationService({
            global, mediaCache: cache, getSettings: () => ({}),
            messageHost: { getChatId: () => 'fixture', on: () => () => {} },
            store: { getImage: async id => { reads++; if (id === 'target' && offline) throw new Error('image-file-unreadable'); return { dataUrl: images[id] }; } },
            events: { emit: (_name, detail) => notify(detail) },
        });
        const raw = '[igs-thought:白墨|惊艳|她竟会这样说。]';
        const host = createIgsReaderHost({
            global, media: { cache }, generatedAssets: service,
            onGeneratedAssetUpdated: handler => { notify = handler; return () => {}; },
            getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, characters: { 白墨: { 惊艳: 'igs-gen:target', 平和: 'igs-gen:calm' } } } }, readerSettings: { titleScreen: false } }),
        });
        try {
            service.start(); host.openReader({ messageId: 40, message: { id: 40, text: raw }, raw }, { mode });
            await new Promise(resolve => setTimeout(resolve, 400));
            assert.equal(host.getState().activeReader.snapshot.content.spriteImage, images.calm);
            const before = reads; await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(reads, before, '静置不重试或轮询');
            offline = false; signals.dispatchEvent(new Event('online'));
            await new Promise(resolve => setTimeout(resolve, 400));
            assert.equal(host.getState().activeReader.snapshot.content.spriteImage, images.target);
            assert.equal(document.getElementById('igs-sprite').style.display, 'block');
            assert.equal(host.getState().activeSettings, null);
        } finally { host.destroy(); service.stop(); await cache.destroy(); }
    }
});

function coldReaderFixture() {
    const server = fakeMediaServer(), records = {};
    for (const [id, type] of [['hero', 'sprite'], ['room', 'background']]) {
        const dataUrl = `user/images/igs-media/${id}.png`;
        records[`image:${id}`] = { version: '0000000000001:000000:fixture', deleted: false, value: { id, type, dataUrl } };
        server.images.set(dataUrl, pixel(id));
    }
    server.files.set('igs-asset-records.json', { version: 2, savedAt: 1, records });
    const host = server.host(); host.document = createFakeDocument();
    const context = host.SillyTavern.getContext();
    host.SillyTavern.getContext = () => ({ ...context, characterId: 0, name1: '玩家', name2: '冷启动角色卡',
        characters: [{ name: '冷启动角色卡', avatar: 'cold-card.png' }], getCurrentChatId: () => 'chat' });
    const sceneAssets = { enabled: true, scenes: {}, characters: {}, cards: { 'card:冷启动角色卡': {
        scenes: { Room: { url: 'igs-gen:room', times: { 白天: 'igs-gen:room' } } }, characters: { 玉子: { 默认: 'igs-gen:hero' } },
    } } };
    const raw = '[igs-scene:Room|白天|晴天]\n[igs-char:玉子|平和|你好。]';
    return { server, host, sceneAssets, raw };
}

test('gate:simulation:dialogue-thought-paging-saves-and-preserves-speaker-across-pages', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({
        sceneAssets: { enabled: true, scenes: {}, characters: {} },
    }) });
    const raw = [
        '<now_plot>', '<content>',
        '*先别急。*',
        '[igs-char:玉子|平和|你好呀。请坐。]',
        '[igs-thought:玉子|平和|先别急。再等等。]',
        '*先别急。*',
        '旁白第一句。旁白第二句。',
        '</content>', '</now_plot>',
    ].join('\n');
    const vn = bootstrapIGS({
        global: { document, localStorage: storage }, autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 9, text: raw }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const controller = opened.reader.controller;
        assert.equal(vn.getState().igsUi.activeReader.snapshot.content.segments.length, 5);
        const settings = (await controller.invokeAction('settings')).controller;
        settings.setValue('bridge.dialogueSentencePaging', true);
        assert.equal(settings.close().ok, true);
        assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).bridge.dialogueSentencePaging, true);
        const first = vn.getState().igsUi.activeReader.snapshot.content;
        assert.equal(first.segments.length, 7);
        assert.ok(first.segments[3].includes('先别急。'));
        assert.ok(first.segments[4].includes('再等等。'));
        const pages = [];
        for (let i = 0; i < first.segments.length; i += 1) {
            const content = vn.getState().igsUi.activeReader.snapshot.content;
            pages.push([content.textType, content.speaker, content.text]);
            if (i < first.segments.length - 1) await controller.invokeAction('next');
            await waitForReaderPage(vn);
        }
        assert.deepEqual(pages.map(([kind, speaker]) => [kind, speaker]), [
            ['narration', ''],
            ['dialogue', '玉子'], ['dialogue', '玉子'],
            ['thought', '玉子'], ['thought', '玉子'],
            ['narration', ''], ['narration', ''],
        ]);
        assert.ok(pages[1][2].includes('你好呀。') && pages[2][2].includes('请坐。'), '两句对白必须全部显示');
        assert.ok(pages[3][2].includes('先别急。') && pages[4][2].includes('再等等。'), '两句心理话必须全部显示');
        assert.ok(pages[6][2].includes('旁白第一句。旁白第二句。'), '对白分页关闭旁白开关时不能切错或丢句');
    } finally { vn.destroy(); }
});

test('gate:simulation:text-fx-sentence-pages-render-without-leaking-markers', async () => {
    const raw = '<content>\n[igs-char:李伯|谨慎|便服|{小:堂上已经认出来了。}这件事以后再说。]\n[igs-char:小雨|平和|好。]\n</content>';
    for (const enabled of [true, false]) {
        const document = createFakeDocument();
        const storage = createMemoryStorage({
            igs_bridge_config: JSON.stringify({ dialogueSentencePaging: true, sceneAssets: { enabled: true } }),
            'igs-reader-settings-v9-default': JSON.stringify({ textFx: { enabled } }),
        });
        const vn = bootstrapIGS({
            global: { document, localStorage: storage }, autoAttachMagicWand: false,
            hostAdapter: { getCurrentMessage: async () => ({ id: 9, text: raw }), typeAndSend: async () => ({ ok: true }) },
        });
        try {
            const opened = await vn.openLatestAvailable('pc');
            const controller = opened.reader.controller;
            const text = () => document.getElementById('igs-overlay').querySelector('#igs-text').innerHTML;
            const content = () => vn.getState().igsUi.activeReader.snapshot.content;
            assert.equal(content().segments.length, 3);
            assert.equal(content().speaker, '李伯');
            assert.equal(content().textType, 'dialogue');
            assert.ok(text().includes('堂上已经认出来了。'));
            assert.doesNotMatch(text(), /\{小[:：]|\}/);
            assert.equal(text().includes('igs-tfx-small'), enabled);
            await controller.invokeAction('next');
            await waitForReaderPage(vn);
            assert.equal(content().speaker, '李伯');
            assert.ok(text().includes('这件事以后再说。'));
            assert.doesNotMatch(text(), /\{小[:：]|\}|igs-tfx-small/);
            await controller.invokeAction('next');
            await waitForReaderPage(vn);
            assert.equal(content().speaker, '小雨');
            assert.ok(text().includes('好。'));
        } finally { vn.destroy(); }
    }
});

async function openStageCastReader({ mode = 'pc', stageCast = true, characters, lines, readerSettings = {}, spriteEnhance, sceneAssetsEnabled = true }) {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: sceneAssetsEnabled, promptRule: '规则', scenes: {}, characters, ...(spriteEnhance ? { spriteEnhance } : {}) },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ stageCast: { enabled: stageCast }, ...readerSettings }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 51, text: ['<now_plot>', '<content>', ...lines, '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable(mode);
    assert.equal(opened.ok, true);
    const ctrl = opened.reader.controller;
    let snap = vn.getState().igsUi.activeReader.snapshot;
    let guard = 0;
    while (snap.content.progress && guard < 30 && snap.content.currentIndex < snap.content.segments.length - 1) {
        await ctrl.invokeAction('next');
        snap = vn.getState().igsUi.activeReader.snapshot;
        guard += 1;
    }
    const overlay = document.getElementById('igs-overlay');
    const castLayer = overlay.querySelector('#igs-cast');
    const castEls = castLayer ? castLayer.children.filter((el) => el.getAttribute('data-igs-cast-char') != null) : [];
    return { vn, ctrl, snap, overlay, castLayer, castEls };
}

const STAGE_CAST_CHARACTERS = {
    Alice: { 默认: 'https://example.com/alice.png' },
    Bob: { 默认: 'https://example.com/bob.png' },
    Cara: { 默认: 'https://example.com/cara.png' },
};
const STAGE_CAST_LINES = ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-char:Cara|默认|Hey.]'];

const ROMANCE_DUO_SETTINGS = { stageCast: { enabled: true, romanceDuo: true }, romanceFx: { enabled: true } };
const romanceCastLines = (tag) => ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', tag, '[igs-char:Bob|默认|Yo.]', '[igs-char:Cara|默认|Hey.]'];

const CAST_ALIVE_SETTINGS = { stageCast: { enabled: true }, spriteMotion: { enabled: true } };
const castStyleOf = (el, key) => String((el && el.style && (typeof el.style.getPropertyValue === 'function' ? el.style.getPropertyValue(key) : el.style[key])) || '');
const castElOf = (r, name) => r.castEls.find((el) => el.getAttribute('data-igs-cast-char') === name);

const CAST_REACT_SETTINGS = { stageCast: { enabled: true, castReact: true } };
const CAST_CALLED_FILTER = 'brightness(0.86) saturate(0.9)';

const CAST_STAGE_SETTINGS = { stageCast: { enabled: true, castStage: true } };
const castPosXOf = (el) => parseFloat(String((el && el.style && el.style.backgroundPosition) || '').split(/\s+/)[0]);

test('G8 小游戏权限：第三方同名玩法只获公共ctx，markDone不能自报积分', async () => {
    const { registerWaitStageGamePack } = await import('../src/visual/igs-ui/wait-stage-games-api.js');
    const doc = createFakeDocument(), root = {};
    installWaitStageGames(root);
    let received, args, rounds = 0;
    registerWaitStageGamePack({ id: 'external-test', list: () => ['rps'], start(...values) {
        args = values; received = values[0]; received.markDone();
    } });
    const runtime = createWaitStageRuntime({ doc, timers: { setTimeout: () => 1, clearTimeout() {} },
        gamePointsRounds: () => () => { rounds += 1; return {}; }, getPointsMessageId: () => 7 });
    try {
        const layer = runtime.open(doc.body, { play: true, model: { art: {} }, settings: { games: true } });
        layer.querySelector('.igs-ws-games').querySelector('button').click();
        assert.equal(args.length, 1);
        assert.equal(rounds, 0);
        for (const key of ['points', 'wallet', 'award', 'rounds', 'gamePointsRounds']) assert.equal(received[key], undefined);
    } finally { runtime.dispose(); uninstallWaitStageGames(root); }
});

function waitPointsHarness(id, model = {}, options = {}) {
    const doc = createFakeDocument(), board = doc.createElement('div');
    doc.body.appendChild(board);
    const results = [], rounds = [];
    let done = false, start;
    const ctx = { id, doc, board, model, random: () => 0, timers: { setTimeout: () => 1, clearTimeout() {} },
        setNote() {}, onVoice() {}, loadImage: url => url, isSettled: () => done, isExiting: () => false,
        markDone() { done = true; }, requestClose() {}, ...options };
    const factory = () => {
        const own = { results: [] };
        rounds.push(own);
        return { finish: async result => {
            own.results.push(result); results.push(result);
            return { ok: true, settled: true, approved: 3, amount: 3 };
        }, retry: async () => ({ ok: true, settled: true, approved: 3, amount: 3 }) };
    };
    return { doc, board, ctx, factory, results, rounds, start: async () => {
        const { createWaitStageGamePack } = await import('../src/visual/igs-ui/wait-stage-games.js');
        createWaitStageGamePack(fn => { start = fn; });
        return start(ctx, factory);
    } };
}

const waitPointsFlush = () => new Promise(resolve => setImmediate(resolve));

test('G8 小游戏回执：失败只显示未入账，明确重试后才显示实发且不重复提交', async () => {
    const { beginWaitStagePoints } = await import('../src/visual/igs-ui/wait-stage-game-points.js');
    const h = waitPointsHarness('rps');
    let finishCalls = 0, retryCalls = 0, release;
    const points = beginWaitStagePoints(h.ctx, () => ({
        finish() { finishCalls += 1; return Promise.resolve({ ok: false, reason: 'points-write-unverified' }); },
        retry() { retryCalls += 1; return new Promise(resolve => { release = resolve; }); },
    }));
    await points.finish({ win: true });
    const node = h.board.querySelector('.igs-ws-points');
    const text = node.querySelector('span'), retry = node.querySelector('button');
    assert.match(text.textContent, /未入账/);
    assert.doesNotMatch(text.textContent, /实发/);
    assert.equal(retry.hidden, false);
    retry.click(); retry.click();
    await waitPointsFlush();
    assert.equal(retryCalls, 1);
    release({ ok: true, settled: true, approved: 2, amount: 1, limitReason: 'points-game-limit' });
    await waitPointsFlush();
    assert.match(text.textContent, /核准 2，实发 1/);
    assert.match(text.textContent, /额度限制/);
    assert.equal(retry.hidden, true);
    assert.equal(finishCalls, 1);
});

function makeAutoPlayReader(raw = '第一段。\n第二段。\n第三段。', readerSettings = {}) {
    const document = createFakeDocument();
    const timers = createAutoPlayClock();
    let savedSettings = { bridge: {}, readerSettings };
    const host = createIgsReaderHost({
        global: { document, localStorage: createMemoryStorage() },
        autoPlayTimers: timers,
        getUnifiedSettings: () => savedSettings,
        saveUnifiedSettings: (value) => {
            savedSettings = value;
            return { ok: true };
        },
    });
    const opened = host.openReader({ messageId: 881, message: { id: 881, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const overlay = document.getElementById('igs-overlay');
    return { document, timers, host, opened, overlay, getSavedSettings: () => savedSettings };
}

async function openOptionSourcesReader({ tables = {}, text = '[角色: 艾莉]\n艾莉: 最后一段。', optionBubble = {}, itemImageService = null } = {}) {
    const document = createFakeDocument();
    const sent = [];
    const vn = bootstrapIGS({
        global: {
            document,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return tables;
                },
            },
        },
        autoAttachMagicWand: false,
        ...(itemImageService ? { itemImageService } : {}),
        config: { optionBubble: { enabled: true, position: 'top-left', clickAction: 'send', ...optionBubble } },
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 9, text }),
            typeAndSend: async (value) => { sent.push(value); return { ok: true }; },
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const layer = overlay.querySelector('#igs-option-bubbles');
    const last = { hidden: true, texts: [], entry: false };
    const open = async () => {
        const live = () => document.getElementById('igs-overlay').querySelector('#igs-option-bubbles');
        live().setAttribute('hidden', '');
        const dialog = () => document.getElementById('igs-overlay').querySelector('#igs-dialog');
        const content = () => vn.getState().igsUi.activeReader.snapshot.content;
        for (let i = 0; i < 12 && content().currentIndex < content().segments.length - 1; i += 1) {
            dialog().dispatchEvent({ type: 'click', target: dialog(), clientX: 120 });
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        let el = live();
        last.hidden = true;
        const origRemove = el.removeAttribute.bind(el);
        el.removeAttribute = (name) => {
            origRemove(name);
            if (name === 'hidden' && last.hidden) {
                last.hidden = false;
                last.texts = el.querySelectorAll('.igs-option-bubble').map((btn) => btn.textContent);
                last.entry = Boolean(el.querySelector('.igs-item-entry-bubble'));
            }
        };
        dialog().dispatchEvent({ type: 'click', target: dialog(), clientX: 120 });
        await new Promise((resolve) => setTimeout(resolve, 20));
        el.removeAttribute = origRemove;
        return el;
    };
    return { vn, overlay, layer, open, sent, last, controller: opened.reader.controller };
}

const ITEM_TABLE = { sheet_items: { uid: 'sheet_items', name: '物品表', orderNo: 2, content: [['row_id', '物品名称', '描述'], ['1', '回复药', '红色的小瓶'], ['2', '手帕', '']] } };
const OPTION_TABLE = { sheet_options: { uid: 'sheet_options', name: '选项表', orderNo: 1, content: [['row_id', '选项'], ['1', '留在广场'], ['2', '前往酒店']] } };

async function createReplyWaitHarness(mode = 'fullscreen') {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const stop = document.createElement('button');
    stop.id = 'mes_stop';
    stop.style.display = 'none';
    document.body.appendChild(stop);
    const messages = new Map();
    let currentMessage;
    let read = () => currentMessage;
    let send = () => ({ ok: true });
    const put = (id, text, fields = {}) => {
        const element = createFakeMessageElement(document, { messageId: id, textContent: text });
        chat.appendChild(element);
        currentMessage = { id, text, visibleText: text, element, ...fields };
        messages.set(id, currentMessage);
        return currentMessage;
    };
    put(90, '旧楼正文。');
    put(100, '当前楼正文。');
    const listeners = new Map();
    const eventSource = {
        on(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
        off(name, handler) { listeners.set(name, (listeners.get(name) || []).filter((item) => item !== handler)); },
        emit(name, ...args) { for (const handler of listeners.get(name) || []) handler(...args); },
    };
    const mutations = [];
    globalObject.MutationObserver = class {
        constructor(handler) { mutations.push(handler); }
        observe() {}
        disconnect() {}
    };
    let seq = 0;
    const timers = new Map();
    globalObject.setTimeout = (handler, delay) => { timers.set(++seq, { handler, delay }); return seq; };
    globalObject.clearTimeout = (id) => timers.delete(id);
    globalObject.SillyTavern = { getContext: () => ({ eventSource, event_types: {
        GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended',
        GENERATION_STOPPED: 'generation_stopped', GENERATION_FAILED: 'generation_failed',
    } }) };
    const vn = bootstrapIGS({ global: globalObject, autoAttachMagicWand: false, hostAdapter: {
        getCurrentMessage: async () => read(),
        getMessageById: async (id) => messages.get(Number(id)),
        listMessages: async () => [...messages.values()],
        typeAndSend: async () => {
            stop.style.display = 'block';
            eventSource.emit('generation_started', 'normal', {}, false);
            return send();
        },
    } });
    const opened = await vn.openLatestAvailable(mode);
    assert.equal(opened.ok, true);
    const controller = opened.reader.controller;
    const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); };
    const fire = async (delay) => {
        const entry = [...timers].find(([, timer]) => timer.delay === delay);
        assert.ok(entry, `missing ${delay}ms timer`);
        timers.delete(entry[0]); entry[1].handler();
        await flush();
    };
    return {
        vn, document, controller, put, fire, flush, eventSource, stop,
        wait: () => document.querySelector('.igs-waitstage'),
        mutate: () => mutations.forEach((handler) => handler([{ target: chat, addedNodes: [currentMessage.element], removedNodes: [] }])),
        readWith: (fn) => { read = fn; },
        sendWith: (fn) => { send = fn; },
    };
}

for (const mode of ['fullscreen', 'web', 'mobile', 'pc', 'embedded']) {
    for (const floor of [90, 100]) test(`等待页菜单：${mode} 设置和目录可用，回看第 ${floor} 楼不被生成拉回`, async () => {
        const h = await createReplyWaitHarness(mode);
        try {
            assert.equal((await h.controller.submit('继续。')).ok, true);
            assert.ok(h.wait());
            const click = (node) => {
                assert.ok(node);
                node.dispatchEvent({ type: 'click', target: node });
            };
            click(h.wait().querySelector('[data-igs-waitstage-settings]'));
            assert.ok(h.document.querySelector('#igs-unified-settings'));
            click(h.document.querySelector('.igs-settings-close'));
            assert.ok(h.wait(), '关设置继续等待');
            click(h.wait().querySelector('[data-igs-waitstage-directory]'));
            await h.flush();
            let panel = h.document.querySelector('#igs-turn-index');
            assert.ok(panel);
            assert.notEqual(panel.parentNode.style.display, 'none', '目录挂在未隐藏的宿主上');
            const close = h.document.createElement('button');
            close.setAttribute('data-ti-act', 'close');
            panel.dispatchEvent({ type: 'click', target: close });
            await h.flush();
            assert.ok(h.wait(), '关目录继续等待');
            click(h.wait().querySelector('[data-igs-waitstage-directory]'));
            await h.flush();
            panel = h.document.querySelector('#igs-turn-index');
            const target = h.document.createElement('button');
            target.setAttribute('data-ti-act', 'floor');
            target.setAttribute('data-ti-value', floor);
            panel.dispatchEvent({ type: 'click', target });
            await h.flush();
            assert.equal(h.vn.getState().igsUi.activeReader.snapshot.messageId, floor);
            assert.equal(h.wait(), null, '切楼后收起等待层');
            h.put(floor === 100 ? 100 : 101, '新楼生成完成。');
            h.mutate();
            await h.flush();
            assert.equal(h.wait(), null, '后续 token 不盖回等待层');
            h.stop.style.display = 'none';
            h.eventSource.emit('generation_ended');
            await h.fire(800);
            assert.equal(h.vn.getState().igsUi.activeReader.snapshot.messageId, floor, '生成结束不抢回阅读位置');
            if (floor === 100) {
                assert.equal(h.vn.getState().igsUi.activeReader.snapshot.content.fullText, '当前楼正文。', '同楼重新生成也保持原阅读快照');
                await h.controller.invokeAction('turn-index');
                await h.flush();
                const latest = h.document.createElement('button');
                latest.setAttribute('data-ti-act', 'latest');
                h.document.querySelector('#igs-turn-index').dispatchEvent({ type: 'click', target: latest });
                await h.flush();
                assert.equal(h.vn.getState().igsUi.activeReader.snapshot.content.fullText, '新楼生成完成。', '主动点最新后可读取同楼的新内容');
            }
        } finally { h.vn.destroy(); }
    });
}

// 严格仿 NAI 官方：只认 /ai/generate-image、Bearer Key 与 V4 请求体，返回 zip 包的 PNG。
function createStrictNaiServer(expectedUrl) {
    const calls = [];
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f0005fe02fea57d7fa60000000049454e44ae426082', 'hex');
    const name = Buffer.from('image_0.png');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(png.length, 18);
    header.writeUInt32LE(png.length, 22);
    header.writeUInt16LE(name.length, 26);
    const zip = Buffer.concat([header, name, png]);
    async function fetch(url, init = {}) {
        calls.push({ url, init });
        if (url !== expectedUrl) return new Response('not found', { status: 404 });
        if (init.method !== 'POST' || init.headers.Authorization !== 'Bearer pst-fake') return new Response('unauthorized', { status: 401 });
        const body = JSON.parse(init.body);
        const p = body.parameters || {};
        const valid = body.action === 'generate' && /^nai-diffusion-[45]/.test(body.model) && String(body.input || '').trim()
            && p.v4_prompt && String(p.v4_prompt.caption.base_caption || '').trim() && p.v4_negative_prompt
            && p.width % 64 === 0 && p.height % 64 === 0 && p.steps >= 1 && p.steps <= 50;
        if (!valid) return new Response('{"statusCode":400,"message":"invalid body"}', { status: 400 });
        return new Response(zip, { status: 200, headers: { 'content-type': 'application/x-zip-compressed' } });
    }
    return { calls, fetch };
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

// 设置面板里的 prompt/confirm 由面板内的输入条（settings-dialog.js）承接：填入文字后点「确定」。
// 假 DOM 的事件不冒泡，所以直接在输入条上派发、target 指向确定按钮。
function answerSettingsDialog(document, value) {
    const bar = document.querySelector('.igs-settings-dialog');
    assert.ok(bar, 'settings dialog bar is mounted in the panel');
    const input = bar.querySelector('.igs-settings-dialog-input');
    if (input && value != null) input.value = value;
    bar.dispatchEvent({ type: 'click', target: bar.querySelector('[data-settings-dialog="ok"]') });
}

// 包一层设置控制器：invoke 期间出现面板内对话框就按 respond(kind, message, value) 作答，返回 null / false 视为取消。
function withSettingsDialogs(document, settings, respond) {
    async function answerWhile(pending) {
        let settled = false;
        Promise.resolve(pending).then(() => { settled = true; }, () => { settled = true; });
        for (let turn = 0; turn < 500 && !settled; turn += 1) {
            await new Promise((resolve) => setImmediate(resolve));
            const bar = document.querySelector('.igs-settings-dialog');
            if (!bar) continue;
            const input = bar.querySelector('.igs-settings-dialog-input');
            const message = bar.getAttribute('aria-label') || '';
            const answer = input ? respond('prompt', message, input.value) : respond('confirm', message);
            if (answer == null || answer === false) {
                bar.dispatchEvent({ type: 'click', target: bar.querySelector('[data-settings-dialog="cancel"]') });
            } else {
                answerSettingsDialog(document, input ? String(answer) : null);
            }
        }
        return pending;
    }
    return new Proxy(settings, {
        get(target, key) {
            if (key === 'invoke') return (action) => answerWhile(target.invoke(action));
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

function createFakeDocument(viewOptions = {}) {
    const document = {
        defaultView: null,
        documentElement: null,
        head: null,
        body: null,
        fullscreenElement: null,
        webkitFullscreenElement: null,
        createElement(tagName) {
            return createFakeElement(tagName, document);
        },
        getElementById(id) {
            return findFirst(document.documentElement, (element) => element.id === id) || null;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            return queryAll(document.documentElement, selector);
        },
        elementFromPoint() {
            return document.getElementById('igs-overlay') || document.body;
        },
        exitFullscreen() {
            document.fullscreenElement = null;
            document.dispatchEvent({ type: 'fullscreenchange', target: document });
            return Promise.resolve();
        },
        webkitExitFullscreen() {
            document.webkitFullscreenElement = null;
            document.dispatchEvent({ type: 'webkitfullscreenchange', target: document });
            return Promise.resolve();
        },
    };
    attachEventTarget(document);
    document.documentElement = createFakeElement('html', document);
    document.head = createFakeElement('head', document);
    document.body = createFakeElement('body', document);
    document.documentElement.appendChild(document.head);
    document.documentElement.appendChild(document.body);

    const visualViewport = viewOptions.visualViewport
        ? attachEventTarget({ ...viewOptions.visualViewport })
        : null;
    const defaultView = attachEventTarget({
        document,
        innerWidth: viewOptions.innerWidth ?? 1280,
        innerHeight: viewOptions.innerHeight ?? 720,
        scrollY: viewOptions.scrollY ?? 0,
        visualViewport,
        setTimeout: viewOptions.setTimeout || setTimeout,
        clearTimeout: viewOptions.clearTimeout || clearTimeout,
        requestAnimationFrame: viewOptions.requestAnimationFrame || ((callback) => {
            callback(Date.now());
            return 1;
        }),
        scrollTo(_x, y) {
            this.scrollY = Number(y) || 0;
        },
    });
    document.defaultView = defaultView;
    return document;
}

function createFakeElement(tagName, ownerDocument) {
    const listeners = new Map();
    const style = {
        setProperty(name, value) {
            this[name] = String(value);
        },
        removeProperty(name) {
            this[name] = '';
        },
    };
    const element = {
        tagName: String(tagName || '').toUpperCase(),
        ownerDocument,
        parentNode: null,
        parentElement: null,
        children: [],
        attributes: new Map(),
        style,
        dataset: {},
        innerHTML: '',
        textContent: '',
        href: '',
        className: '',
        id: '',
        type: '',
        value: '',
        placeholder: '',
        get classList() {
            return {
                contains: (name) => splitClasses(element.className).includes(name),
                add: (...names) => {
                    const next = new Set(splitClasses(element.className));
                    for (const name of names) next.add(name);
                    element.className = Array.from(next).join(' ');
                },
                remove: (...names) => {
                    const next = splitClasses(element.className).filter((name) => !names.includes(name));
                    element.className = next.join(' ');
                },
                toggle: (name, force) => {
                    const has = splitClasses(element.className).includes(name);
                    const shouldAdd = force === undefined ? !has : Boolean(force);
                    if (shouldAdd && !has) {
                        element.className = splitClasses(element.className).concat(name).join(' ');
                    } else if (!shouldAdd && has) {
                        element.className = splitClasses(element.className).filter((item) => item !== name).join(' ');
                    }
                    return shouldAdd;
                },
            };
        },
        get clientWidth() {
            return Math.round(element.getBoundingClientRect().width);
        },
        get clientHeight() {
            return Math.round(element.getBoundingClientRect().height);
        },
        get offsetWidth() {
            return element.clientWidth;
        },
        get offsetHeight() {
            return element.clientHeight;
        },
        appendChild(child) {
            if (child.parentNode && child.parentNode !== element && typeof child.remove === 'function') child.remove();
            child.parentNode = element;
            child.parentElement = element;
            element.children.push(child);
            return child;
        },
        append(...children) {
            for (const child of children) element.appendChild(child);
        },
        insertBefore(child, referenceNode) {
            if (!referenceNode) return element.appendChild(child);
            if (child.parentNode && child.parentNode !== element && typeof child.remove === 'function') child.remove();
            child.parentNode = element;
            child.parentElement = element;
            const index = element.children.indexOf(referenceNode);
            if (index < 0) element.children.push(child);
            else element.children.splice(index, 0, child);
            return child;
        },
        remove() {
            if (!element.parentNode) return;
            element.parentNode.children = element.parentNode.children.filter((child) => child !== element);
            element.parentNode = null;
            element.parentElement = null;
        },
        removeChild(child) {
            const index = element.children.indexOf(child);
            if (index < 0) throw new Error('NotFoundError: node is not a child of this element');
            element.children.splice(index, 1);
            child.parentNode = null;
            child.parentElement = null;
            return child;
        },
        contains(target) {
            let cursor = target;
            while (cursor) {
                if (cursor === element) return true;
                cursor = cursor.parentNode;
            }
            return false;
        },
        setAttribute(name, value) {
            element.attributes.set(name, String(value));
            if (name === 'id') element.id = String(value);
            if (name === 'class') element.className = String(value);
        },
        getAttribute(name) {
            if (name === 'id') return element.id || null;
            if (name === 'class') return element.className || null;
            return element.attributes.has(name) ? element.attributes.get(name) : null;
        },
        hasAttribute(name) {
            if (name === 'id') return Boolean(element.id);
            if (name === 'class') return Boolean(element.className);
            return element.attributes.has(name);
        },
        removeAttribute(name) {
            element.attributes.delete(name);
            if (name === 'id') element.id = '';
            if (name === 'class') element.className = '';
        },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        removeEventListener(type, handler) {
            const next = (listeners.get(type) || []).filter((item) => item !== handler);
            listeners.set(type, next);
        },
        dispatchEvent(event) {
            const payload = event || {};
            payload.target = payload.target || element;
            payload.currentTarget = element;
            payload.preventDefault = payload.preventDefault || (() => {});
            payload.stopPropagation = payload.stopPropagation || (() => {});
            const results = (listeners.get(payload.type) || []).map((handler) => handler(payload));
            return results[results.length - 1];
        },
        setPointerCapture() {},
        releasePointerCapture() {},
        click(eventOverrides = {}) {
            return element.dispatchEvent({
                type: 'click',
                clientX: eventOverrides.clientX,
                target: element,
            });
        },
        closest(selector) {
            let cursor = element;
            while (cursor) {
                if (matchesAnySelector(cursor, selector)) return cursor;
                cursor = cursor.parentNode;
            }
            return null;
        },
        querySelector(selector) {
            return element.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            return queryAll(element, selector);
        },
        getBoundingClientRect() {
            const width = readRectValue(element.style.width, element.style.maxWidth, 0);
            const height = readRectValue(element.style.height, element.style.maxHeight, 0);
            let left = readRectValue(element.style.left, null, 0);
            const top = readRectValue(element.style.top, null, 0);
            if (String(element.style.transform || '').includes('translateX(-50%)')) {
                left -= width / 2;
            }
            return {
                left,
                top,
                width,
                height,
                right: left + width,
                bottom: top + height,
            };
        },
    };
    return element;
}

function queryAll(root, selector) {
    if (!root) return [];
    const output = [];
    for (const child of root.children || []) {
        if (matchesAnySelector(child, selector)) output.push(child);
        output.push(...queryAll(child, selector));
    }
    return output;
}

function findFirst(root, predicate) {
    if (!root) return null;
    if (predicate(root)) return root;
    for (const child of root.children || []) {
        const found = findFirst(child, predicate);
        if (found) return found;
    }
    return null;
}

function matchesAnySelector(element, selector) {
    return String(selector || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .some((item) => matchesSelector(element, item));
}

function matchesSelector(element, selector) {
    if (!element) return false;
    const tagWithAttr = selector.match(/^([a-z0-9_-]+)(\[[^\]]+\])$/i);
    if (tagWithAttr) {
        return element.tagName.toLowerCase() === tagWithAttr[1].toLowerCase()
            && matchesSelector(element, tagWithAttr[2]);
    }
    if (selector === '#extensionsMenu') return element.id === 'extensionsMenu';
    if (selector === '#extensions_menu') return element.id === 'extensions_menu';
    if (selector === '.extensions_block .list-group') {
        return element.classList.contains('list-group')
            && Boolean(element.parentNode && element.parentNode.classList && element.parentNode.classList.contains('extensions_block'));
    }
    if (selector === '[data-igs-magic-entry="1"]') {
        return element.getAttribute('data-igs-magic-entry') === '1';
    }
    if (selector === '[data-igs-magic-entry="1"]') {
        return element.getAttribute('data-igs-magic-entry') === '1';
    }
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    if (selector.startsWith('.')) {
        return Boolean(element.classList && typeof element.classList.contains === 'function' && element.classList.contains(selector.slice(1)));
    }
    if (selector.startsWith('[')) {
        const exactMatch = selector.match(/^\[([^=\]]+)="([^"]*)"\]$/);
        if (exactMatch) return element.getAttribute(exactMatch[1]) === exactMatch[2];
        const existsMatch = selector.match(/^\[([^=\]]+)\]$/);
        return existsMatch ? element.getAttribute(existsMatch[1]) !== null : false;
    }
    return element.tagName.toLowerCase() === selector.toLowerCase();
}

function splitClasses(value) {
    return String(value || '').split(/\s+/).filter(Boolean);
}

function attachEventTarget(target) {
    const listeners = new Map();
    target.addEventListener = function addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
    };
    target.removeEventListener = function removeEventListener(type, handler) {
        const next = (listeners.get(type) || []).filter((item) => item !== handler);
        listeners.set(type, next);
    };
    target.dispatchEvent = function dispatchEvent(event = {}) {
        const payload = { ...event, type: event.type };
        payload.target = payload.target || target;
        payload.currentTarget = target;
        payload.preventDefault = payload.preventDefault || (() => {});
        payload.stopPropagation = payload.stopPropagation || (() => {});
        const results = (listeners.get(payload.type) || []).map((handler) => handler(payload));
        return results[results.length - 1];
    };
    return target;
}

function readRectValue(primary, secondary, fallback) {
    const first = readNumeric(primary);
    if (first > 0) return first;
    const second = readNumeric(secondary);
    if (second > 0) return second;
    return fallback;
}

function readNumeric(value) {
    const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
}

function createFakeMessageElement(ownerDocument, options = {}) {
    const images = Array.isArray(options.imageNodes) ? options.imageNodes : (options.imageUrls || []).map((url) => createFakeMediaNode({
        ownerDocument,
        tagName: 'IMG',
        src: url,
    }));
    const genericNodes = Array.isArray(options.genericNodes) ? options.genericNodes : [];
    const outsideGenericNodes = Array.isArray(options.outsideGenericNodes) ? options.outsideGenericNodes : [];
    const regenButtons = Array.isArray(options.regenButtons) ? options.regenButtons : [];
    const frameDocuments = Array.isArray(options.frameDocuments) ? options.frameDocuments : [];
    const messageRoot = createFakeElement('div', ownerDocument);
    const mesText = createFakeElement('div', ownerDocument);
    const messageId = Number.isFinite(Number(options.messageId)) ? Number(options.messageId) : 1;
    const originalRootQuerySelectorAll = messageRoot.querySelectorAll.bind(messageRoot);
    const originalMesTextQuerySelectorAll = mesText.querySelectorAll.bind(mesText);

    messageRoot.className = 'mes';
    messageRoot.setAttribute('mesid', String(messageId));
    messageRoot.setAttribute('data-message-id', String(messageId));
    mesText.className = 'mes_text';
    mesText.textContent = String(options.textContent || '');
    mesText.innerText = mesText.textContent;
    messageRoot.appendChild(mesText);

    for (const node of images) attachNodeToFakeParent(node, mesText, ownerDocument);
    for (const node of genericNodes) attachNodeToFakeParent(node, mesText, ownerDocument);
    for (const node of regenButtons) attachNodeToFakeParent(node, mesText, ownerDocument);
    for (const node of outsideGenericNodes) attachNodeToFakeParent(node, messageRoot, ownerDocument);

    const frameNodes = frameDocuments.map((doc) => ({
        contentDocument: doc,
        contentWindow: { document: doc },
        getAttribute() {
            return null;
        },
        closest(selector) {
            return matchesAnySelector(messageRoot, selector) ? messageRoot : null;
        },
    }));
    const resolveSpecialSelector = (selector, includeOutsideGeneric = false) => {
        if (selector === '.mes_text') return [mesText];
        if (
            selector === '.st-chatu8-image-container img'
            || selector === '.st-chatu8-image-container video'
            || selector === '.st-chatu8-image-span img'
            || selector === '.st-chatu8-image-span video'
            || selector === 'span[data-request-id] img'
            || selector === 'span[data-request-id] video'
        ) {
            return images;
        }
        if (
            selector === 'button.image-tag-button'
            || selector === 'button.st-chatu8-image-button'
            || selector === 'button[class*="image-tag-button"]'
            || selector === 'button[class*="st-chatu8-image-button"]'
        ) {
            return regenButtons;
        }
        if (
            selector === '.mes_text img[src]'
            || selector === '.mes_text img[data-src]'
            || selector === 'img[src]'
            || selector === 'img[data-src]'
            || selector === 'img[src^="blob:"]'
            || selector === 'img[src^="data:image"]'
            || selector === 'video'
            || selector === 'a[href^="blob:"]'
            || selector === 'a[href^="data:image"]'
            || selector === '[style*="background-image"]'
        ) {
            return includeOutsideGeneric ? genericNodes.concat(outsideGenericNodes) : genericNodes;
        }
        if (selector === 'iframe') {
            return frameNodes;
        }
        return null;
    };

    messageRoot.__images = images;
    messageRoot.__genericNodes = genericNodes;
    messageRoot.__outsideGenericNodes = outsideGenericNodes;
    messageRoot.__regenButtons = regenButtons;
    messageRoot.__frameDocuments = frameDocuments;
    messageRoot.__mesText = mesText;
    messageRoot.querySelectorAll = function querySelectorAll(selector) {
        const special = resolveSpecialSelector(selector, true);
        return special || originalRootQuerySelectorAll(selector);
    };
    mesText.querySelectorAll = function querySelectorAll(selector) {
        const special = resolveSpecialSelector(selector, false);
        return special || originalMesTextQuerySelectorAll(selector);
    };
    return messageRoot;
}

function createFakeRegenerateButton(onClick, options = {}) {
    const attributes = new Map(Object.entries(options.attributes || {}));
    return {
        tagName: 'BUTTON',
        parentNode: null,
        parentElement: null,
        children: [],
        className: String(options.className || ''),
        textContent: String(options.textContent || options.text || ''),
        innerText: String(options.innerText || options.textContent || options.text || ''),
        value: String(options.value || ''),
        clickCount: 0,
        getAttribute(name) {
            if (name === 'class') return this.className || null;
            if (name === 'value') return this.value || null;
            return attributes.has(name) ? attributes.get(name) : null;
        },
        setAttribute(name, value) {
            if (name === 'class') {
                this.className = String(value);
                return;
            }
            attributes.set(name, String(value));
        },
        closest(selector) {
            let cursor = this;
            while (cursor) {
                if (matchesAnySelector(cursor, selector)) return cursor;
                cursor = cursor.parentNode;
            }
            return null;
        },
        remove() {
            if (!this.parentNode || !Array.isArray(this.parentNode.children)) return;
            const index = this.parentNode.children.indexOf(this);
            if (index >= 0) this.parentNode.children.splice(index, 1);
            this.parentNode = null;
            this.parentElement = null;
        },
        click() {
            this.clickCount += 1;
            onClick();
        },
    };
}

function createFakeMediaNode(options = {}) {
    const attributes = new Map(Object.entries(options.attributes || {}));
    return {
        ownerDocument: options.ownerDocument || null,
        tagName: String(options.tagName || 'IMG').toUpperCase(),
        parentNode: null,
        parentElement: null,
        children: [],
        currentSrc: options.currentSrc || options.src || '',
        src: options.src || options.currentSrc || '',
        href: options.href || '',
        className: String(options.className || ''),
        style: {
            backgroundImage: options.backgroundImage || '',
        },
        getAttribute(name) {
            if (name === 'src') return this.src || null;
            if (name === 'data-src') return attributes.get('data-src') || options.dataSrc || null;
            if (name === 'href') return attributes.get('href') || options.href || null;
            if (name === 'class') return this.className || null;
            return attributes.has(name) ? attributes.get(name) : null;
        },
        setAttribute(name, value) {
            if (name === 'class') {
                this.className = String(value);
                return;
            }
            attributes.set(name, String(value));
            if (name === 'data-src') {
                this.currentSrc = '';
                this.src = '';
            }
        },
        closest(selector) {
            let cursor = this;
            while (cursor) {
                if (matchesAnySelector(cursor, selector)) return cursor;
                cursor = cursor.parentNode;
            }
            return null;
        },
        querySelector() {
            return null;
        },
        remove() {
            if (!this.parentNode || !Array.isArray(this.parentNode.children)) return;
            const index = this.parentNode.children.indexOf(this);
            if (index >= 0) this.parentNode.children.splice(index, 1);
            this.parentNode = null;
            this.parentElement = null;
        },
    };
}

function createFakeScopedRoot(map = {}) {
    return {
        querySelector(selector) {
            const matches = this.querySelectorAll(selector);
            return matches[0] || null;
        },
        querySelectorAll(selector) {
            return Array.isArray(map[selector]) ? map[selector] : [];
        },
    };
}

function attachNodeToFakeParent(node, parent, ownerDocument) {
    if (!node || !parent) return node;
    node.ownerDocument = node.ownerDocument || ownerDocument || null;
    node.parentNode = parent;
    node.parentElement = parent;
    if (Array.isArray(parent.children) && !parent.children.includes(node)) {
        parent.children.push(node);
    }
    return node;
}

function outfitBridgeConfig(extra = {}) {
    return JSON.stringify({
        sceneAssets: {
            enabled: true,
            promptRule: '规则',
            scenes: {},
            characters: { 小林海斗: { 喜悦: 'https://example.com/base-joy.png', 默认: 'https://example.com/base.png' } },
            characterAliases: { 小林海斗: ['小林'] },
            characterOutfits: {
                小林海斗: {
                    校服: { words: ['制服'], moods: { 喜悦: 'https://example.com/school-joy.png' } },
                    泳装: { words: ['比基尼'], moods: { 喜悦: 'https://example.com/swim-joy.png' } },
                },
            },
            ...extra,
        },
    });
}

test('酒馆主界面没进对话：阅读器不开并提醒进入对话，设置器照常打开', async () => {
    const document = createFakeDocument();
    const toasts = [];
    const global = { document, localStorage: createMemoryStorage({}),
        toastr: { warning: (text) => toasts.push(text) },
        SillyTavern: { getContext: () => ({ name2: 'SillyTavern System', getCurrentChatId: () => undefined }) } };
    let read = 0;
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => { read += 1; return { id: 1, text: '你好。' }; }, typeAndSend: async () => ({ ok: true }) } });
    try {
        const opened = await vn.openLatestAvailable('pc');
        assert.equal(opened.reason, 'no-chat');
        assert.equal(read, 0);
        assert.deepEqual(toasts, ['当前无法启用阅读器，请进入对话后再生成。']);
        assert.equal(vn.getState().igsUi.activeReader, null);
        const settings = vn.openSettings({});
        assert.notEqual(settings && settings.ok, false);
    } finally {
        vn.destroy();
    }
});
