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

test('gate:simulation:closed-multiline-dialogue-and-legacy-cg-keep-one-page-in-fullscreen', () => {
    for (const gap of ['\n\n', '\n\n\n\n']) {
        const document = createFakeDocument();
        const raw = `<content>\n[igs-char:甲|平和|完整台词。${gap}<IMG>19</IMG>${gap}]\n</content>`;
        const host = createIgsReaderHost({
            global: { document },
            getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, characters: { 甲: { 默认: 'data:image/png;base64,QQ==' } } } }, readerSettings: { titleScreen: false } }),
            getIllustrationUrl: () => 'data:image/png;base64,Q0c=',
        });
        try {
            const opened = host.openReader({ messageId: 22, message: { id: 22, text: raw }, raw }, { mode: 'fullscreen' });
            assert.equal(opened.ok, true);
            const content = host.getState().activeReader.snapshot.content;
            assert.deepEqual(content.segments, ['[甲]：完整台词。']);
            assert.equal(content.speaker, '甲');
            assert.equal(content.textType, 'dialogue');
            assert.equal(content.illustrationSlot, 19);
            assert.equal(content.cgActive, true);
            assert.equal(content.backgroundImage, 'data:image/png;base64,Q0c=');
            const html = document.getElementById('igs-text').innerHTML;
            assert.ok(html.includes('完整台词。'));
            assert.doesNotMatch(html, /\]|<IMG>|igs-char:/);
        } finally { host.destroy(); }
    }
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

test('gate:simulation:igs-ui-settings-save-updates-reader-state', () => {
    const legacyStorage = readJson('fixtures/igs/legacy-storage.json');
    const storage = createMemoryStorage(legacyStorage);
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.3',
        optionFontSize: 14,
        emptyBackgroundColor: '#24272a',
    }));
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    try {
        const opened = vn.openSettings({ tab: 'reader', mode: 'mobile' });
        const initialReader = opened.controller.getSnapshot().draft.readerSettings;
        assert.equal(initialReader.glassBackdropFilter, false);
        assert.equal(Object.hasOwn(initialReader, 'emptyBackgroundColor'), false);
        const updated = opened.controller.setValue('readerSettings.fontSize', 20);
        const optionSize = opened.controller.setValue('readerSettings.optionFontSize', 18);
        const toggled = opened.controller.toggle('readerSettings.glassBackdropFilter');
        assert.equal(updated.ok, true);
        assert.equal(optionSize.ok, true);
        assert.equal(toggled.ok, true);
        const draft = opened.controller.getSnapshot().draft.readerSettings;
        assert.equal(draft.fontSize, 20);
        assert.equal(draft.optionFontSize, 18);
        assert.equal(draft.glassBackdropFilter, true);
        assert.notEqual(vn.getUnifiedSettings({ mode: 'mobile' }).readerSettings.fontSize, 20);
        assert.notEqual(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).optionFontSize, 18);
        assert.equal(opened.controller.close().ok, true);
        const current = vn.getUnifiedSettings({ mode: 'mobile' });
        const savedStorage = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
        assert.equal(current.readerSettings.fontSize, 20);
        assert.equal(current.readerSettings.dialogFontWeight, null);
        assert.equal(current.readerSettings.optionFontSize, 18);
        assert.equal(Object.hasOwn(current.readerSettings, 'emptyBackgroundColor'), false);
        assert.equal(current.readerSettings.glassBackdropFilter, true);
        assert.equal(savedStorage.fontSize, 20);
        assert.equal(savedStorage.optionFontSize, 18);
        assert.equal(Object.hasOwn(savedStorage, 'dialogFont'), false);
        assert.equal(savedStorage._v, '0.5.7');
        assert.equal(Object.hasOwn(savedStorage, 'emptyBackgroundColor'), false);
        assert.equal(savedStorage.glassBackdropFilter, true);
    } finally {
        vn.destroy();
    }
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
        typeAndSend: async () => {
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
        vn, document, controller, put, fire, flush, eventSource,
        wait: () => document.querySelector('.igs-waitstage'),
        mutate: () => mutations.forEach((handler) => handler([{ target: chat, addedNodes: [currentMessage.element], removedNodes: [] }])),
        readWith: (fn) => { read = fn; },
        sendWith: (fn) => { send = fn; },
    };
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

// 契约变更后补回：新图落「平和」槽仍刷新舞台；旧默认图迁移为命名衣装后的跨楼继承与回退。
test('gate:simulation:settings-generated-sprite-refreshes-current-stage', async () => {
    const document = createFakeDocument();
    const raw = '[igs-char:玉子|平和|你好。]';
    let revision = 0;
    let imageUpdated = () => {};
    const resolved = [];
    let stored = {
        bridge: { openMode: 'pc', sceneAssets: { enabled: true, scenes: {}, characters: { 玉子: { 默认: 'igs-gen:old' } } } },
        readerSettings: { titleScreen: false },
    };
    const images = new Map([['igs-gen:old', 'data:image/png;base64,T0xE'], ['igs-gen:new', 'data:image/png;base64,TkVX']]);
    const host = createIgsReaderHost({
        global: { document, localStorage: createMemoryStorage() },
        onGeneratedAssetUpdated: (handler) => { imageUpdated = handler; return () => {}; },
        getUnifiedSettings: () => stored,
        getSettingsRevision: () => revision,
        saveUnifiedSettings(next) { stored = next; revision += 1; return { ok: true }; },
        generatedAssets: {
            resolveUrl: (ref) => { resolved.push(ref); return images.get(ref) || ''; },
            getImagePrompt: async () => ({ caption: { v4_prompt: { caption: { base_caption: 'portrait', char_captions: [] } } }, edited: true }),
            generateCharacterSprite: async () => ({ ok: true, imageId: 'new' }),
        },
    });
    try {
        host.openReader({ messageId: 7, message: { id: 7, text: raw }, raw }, { mode: 'pc' });
        assert.equal(host.getState().activeReader.snapshot.content.spriteImage, images.get('igs-gen:old'));
        const sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
        assert.match(sprite.style.backgroundImage, /T0xE/, '舞台起初使用旧立绘');
        const settings = host.openSettings({ tab: 'scene' });
        const generated = await settings.controller.invoke('char-generate-sprite:%E7%8E%89%E5%AD%90');
        assert.notEqual(generated && generated.ok, false);
        assert.equal(stored.bridge.sceneAssets.characters.玉子.平和, 'igs-gen:new');
        resolved.length = 0;
        imageUpdated({ reason: 'image-loaded', imageId: 'new' });
        assert.ok(resolved.includes('igs-gen:new'), '图片到达后预热新立绘');
        assert.ok(!resolved.includes('igs-gen:old'), '设置保存后不能继续预热旧立绘');
        assert.equal(host.getState().activeReader.snapshot.content.spriteImage, images.get('igs-gen:new'));
        assert.equal(settings.controller.close().ok, true);
        assert.equal(host.getState().activeReader.snapshot.content.spriteImage, images.get('igs-gen:new'));
        assert.match(sprite.style.backgroundImage, /TkVX/, '设置器关闭后舞台必须立即显示新立绘');
    } finally { host.destroy(); }
});

test('gate:simulation:settings-generated-sprite-cold-image-arrival-refreshes-stage-once', async () => {
    const document = createFakeDocument();
    const raw = '[igs-char:玉子|平和|你好。]';
    let revision = 0;
    let stored = {
        bridge: { openMode: 'pc', sceneAssets: { enabled: true, scenes: {}, characters: { 玉子: { 默认: 'igs-gen:old' } } } },
        readerSettings: { titleScreen: false },
    };
    let notify = () => {};
    const resolved = [];
    const images = new Map([['igs-gen:old', 'data:image/png;base64,T0xE']]);
    const host = createIgsReaderHost({
        global: { document, localStorage: createMemoryStorage() },
        getUnifiedSettings: () => stored,
        getSettingsRevision: () => revision,
        saveUnifiedSettings(next) { stored = next; revision += 1; return { ok: true }; },
        onGeneratedAssetUpdated(handler) { notify = handler; return () => {}; },
        generatedAssets: {
            resolveUrl(ref) { resolved.push(ref); return images.get(ref) || ''; },
            getImagePrompt: async () => ({ caption: { v4_prompt: { caption: { base_caption: 'portrait', char_captions: [] } } }, edited: true }),
            generateCharacterSprite: async () => ({ ok: true, imageId: 'new' }),
        },
    });
    try {
        host.openReader({ messageId: 7, message: { id: 7, text: raw }, raw }, { mode: 'pc' });
        const sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
        let background = sprite.style.backgroundImage;
        let paints = 0;
        Object.defineProperty(sprite.style, 'backgroundImage', {
            configurable: true,
            get: () => background,
            set(value) { background = value; paints += 1; },
        });
        const settings = host.openSettings({ tab: 'scene' });
        assert.notEqual((await settings.controller.invoke('char-generate-sprite:%E7%8E%89%E5%AD%90'))?.ok, false);
        assert.equal(stored.bridge.sceneAssets.characters.玉子.平和, 'igs-gen:new');
        assert.equal(host.getState().activeReader.snapshot.content.pendingSpriteRef, 'igs-gen:new');
        resolved.length = 0;
        images.set('igs-gen:new', 'data:image/png;base64,TkVX');
        notify({ reason: 'image-loaded', imageId: 'new' });
        assert.ok(resolved.includes('igs-gen:new'), '新引用必须进入预热清单');
        assert.ok(!resolved.includes('igs-gen:old'), '不再预热已被替换的立绘');
        paints = 0;
        resolved.length = 0;
        assert.equal(settings.controller.close().ok, true);
        assert.equal(paints, 1, '设置保存已重绘舞台，不得再因过期标记重复绘制');
        assert.equal(host.getState().activeReader.snapshot.content.spriteImage, images.get('igs-gen:new'));
        assert.match(sprite.style.backgroundImage, /TkVX/, '关闭设置器后舞台显示已到达的新图');
        assert.ok(resolved.filter((ref) => ref === 'igs-gen:new').length <= 3, '关闭设置器不得重复解析新立绘');
        resolved.length = 0;
        notify({ reason: 'image-loaded', imageId: 'new' });
        assert.ok(!resolved.includes('igs-gen:old'), '相同修订号的重复通知不得重建旧清单');
    } finally { host.destroy(); }
});

test('gate:simulation:outfit-inherits-across-ai-floors-within-window', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({ igs_bridge_config: outfitBridgeConfig() });
    const messages = [
        { id: 1, text: '[igs-char:小林海斗|喜悦|制服|太久远了。]' },
        { id: 2, text: '[igs-char:小林海斗|喜悦|泳装|换好了。]' },
        { id: 3, text: '没有角色的一楼。' },
        { id: 4, text: '[igs-char:小林海斗|喜悦|继续说话。]' },
    ];
    const hostAdapter = () => ({
        getCurrentMessage: async () => messages[messages.length - 1],
        getMessageById: async (id) => messages.find((m) => m.id === Number(id)) || null,
        getAdjacentMessage: async (id, delta) => {
            const index = messages.findIndex((m) => m.id === Number(id));
            return index < 0 ? null : messages[index + (delta < 0 ? -1 : 1)] || null;
        },
        typeAndSend: async () => ({ ok: true }),
    });
    const near = bootstrapIGS({ global: { document, localStorage: storage }, autoAttachMagicWand: false, hostAdapter: hostAdapter() });
    try {
        const opened = await near.openLatestAvailable('pc');
        assert.equal(opened.reader.snapshot.content.spriteOutfit, '泳装');
        assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/swim-joy.png');
    } finally {
        near.destroy();
    }
    // 服装栏落在 3 个 AI 楼层窗口之外时不再继承，回到原有立绘。
    messages.splice(1, 1, { id: 2, text: '平静的一楼。' });
    messages.splice(2, 0, { id: 3.5, text: '又一楼。' });
    messages.unshift({ id: 0, text: '[igs-char:小林海斗|喜悦|泳装|更早。]' });
    const far = bootstrapIGS({ global: { document, localStorage: storage }, autoAttachMagicWand: false, hostAdapter: hostAdapter() });
    try {
        const opened = await far.openLatestAvailable('pc');
        assert.equal(opened.reader.snapshot.content.spriteOutfit, '小林海斗·初始衣装');
        assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/base-joy.png');
    } finally {
        far.destroy();
    }
});

test('gate:simulation:outfit-falls-back-to-role-table-equipment-and-dna', async () => {
    const run = async (sheets, dna) => {
        const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
        const storage = createMemoryStorage({ igs_bridge_config: outfitBridgeConfig(dna ? { characterDna: { 小林海斗: { defaultAppearance: dna } } } : {}) });
        const api = sheets === null ? undefined : { exportTableAsJson: () => Object.fromEntries(sheets.map((s) => [s.uid, s])) };
        const vn = bootstrapIGS({
            global: { document, localStorage: storage, AutoCardUpdaterAPI: api },
            autoAttachMagicWand: false,
            hostAdapter: {
                getCurrentMessage: async () => ({ id: 5, text: '[igs-char:小林|喜悦|没写服装。]' }),
                typeAndSend: async () => ({ ok: true }),
            },
        });
        try {
            const opened = await vn.openLatestAvailable('pc');
            return [opened.reader.snapshot.content.spriteOutfit, opened.reader.snapshot.content.spriteImage];
        } finally {
            vn.destroy();
        }
    };
    const role = { uid: 'sheet_role', name: '重要角色表', orderNo: 1, content: [['姓名', '穿着打扮'], ['小林海斗', '一身制服']] };
    const worn = (status) => ({ uid: 'sheet_item', name: '装备表', orderNo: 2, content: [['物品名称', '持有者', '状态'], ['比基尼', '小林', status]] });
    assert.deepEqual(await run([role, worn('已穿戴')], '睡衣'), ['校服', 'https://example.com/school-joy.png']);
    assert.deepEqual(await run([worn('已穿戴')], '制服'), ['泳装', 'https://example.com/swim-joy.png']);
    assert.deepEqual(await run([worn('已收纳')], '制服'), ['校服', 'https://example.com/school-joy.png']);
    assert.deepEqual(await run(null, '比基尼'), ['泳装', 'https://example.com/swim-joy.png']);
    assert.deepEqual(await run(null, ''), ['小林海斗·初始衣装', 'https://example.com/base-joy.png']);
});

test('gate:simulation:outfit-scene-bound-expires-after-scene-change', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const config = JSON.parse(outfitBridgeConfig({ scenes: { 海边: { url: '', times: {} }, 教室: { url: '', times: {} } } }));
    config.sceneAssets.characterOutfits.小林海斗.泳装.scenes = ['海边'];
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify(config) });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 40,
                text: [
                    '[igs-scene:海边|下午|晴天]',
                    '[igs-char:小林海斗|喜悦|泳装|海风好舒服。]',
                    '[igs-scene:教室|傍晚|晴天]',
                    '[igs-char:小林海斗|喜悦|回到学校了。]',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const content = () => vn.getState().igsUi.activeReader.snapshot.content;
        assert.equal(content().spriteOutfit, '泳装');
        assert.equal(content().spriteImage, 'https://example.com/swim-joy.png');
        await opened.reader.controller.invokeAction('next');
        assert.equal(content().displayText, '回到学校了。');
        assert.equal(content().spriteOutfit, '小林海斗·初始衣装');
        assert.equal(content().spriteImage, 'https://example.com/base-joy.png');
    } finally {
        vn.destroy();
    }
});
