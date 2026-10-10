import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootstrapIGS, createMemoryStorage, createPresetRegistry, PRESET_STORE_KEY } from '../src/index.js';
import { writeLegacyIgsSettings } from '../src/storage/legacy-igs.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { createDbTabClickGuard, toShujukuApiRowIndex } from '../src/shujuku-panel/panel-controller.js';
import { renderDbPanelInner, getDbPanelStyles } from '../src/shujuku-panel/panel-render.js';
import { createImageResourceCache, createResourceCache } from '../src/media/resource-cache.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';

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
import { CHAT_LAYER_STYLE_TEXT, advanceChatReveal, applyChatToDom, cancelChatShow, getChatRevealState } from '../src/visual/igs-ui/chat-layer.js';
import { buildChatPageModel, normalizeChatShowSettings } from '../src/visual/igs-ui/chat-show-runtime.js';
import { resolveChatTheme } from '../src/visual/igs-ui/chat-themes.js';
import { ORIGINAL_READER_ICONS, getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';
import { createMapPanelController } from '../src/visual/igs-ui/map-panel.js';
import { createRecordPanelController } from '../src/visual/igs-ui/record-panel.js';
import { getSettingsStyleText } from '../src/visual/igs-ui/settings-style.js';
import { DEFAULT_SCENE_PROMPT_RULE } from '../src/visual/igs-ui/reader-host-constants.js';
import { applyTypewriterEffect } from '../src/visual/igs-ui/typewriter-runtime.js';
import { createAutoPlayClock } from './helpers/auto-play-clock.js';
import { setStagePauseReason } from '../src/visual/igs-ui/stage-pause.js';
import { VISUAL_MODES } from '../src/visual/visual-mode.js';

const appRoot = path.resolve(import.meta.dirname, '..');

test('gate:simulation:virtual-regex-extra-rules-render-add-save-and-remove', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument();
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '正则设置测试。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const settings = opened.reader.controller.openSettings('regex').controller;
        let snapshot = settings.getSnapshot();
        assert.match(snapshot.html, /自定义规则（依上下顺序生效）/);
        // 内置的 HTML 注释剥离规则随默认值一起下发（用户删掉后不会再长回来）。
        const builtinRule = { pattern: '\\s*<!--[\\s\\S]*?-->\\s*\\n?', flags: 'g', replacement: '' };
        assert.deepEqual(snapshot.draft.bridge.virtualRegex.rules, [builtinRule]);

        const added = await settings.invoke('add-virtual-regex');
        assert.equal(added.ok, true);
        snapshot = settings.getSnapshot();
        assert.match(snapshot.html, /data-path="bridge\.virtualRegex\.rules\.0\.pattern"/);
        settings.setValue('bridge.virtualRegex.rules.1.pattern', 'foo');
        settings.setValue('bridge.virtualRegex.rules.1.flags', 'g');
        settings.setValue('bridge.virtualRegex.rules.1.replacement', 'bar');
        assert.deepEqual(settings.getSnapshot().draft.bridge.virtualRegex.rules, [builtinRule, { pattern: 'foo', flags: 'g', replacement: 'bar' }]);
        assert.equal(settings.close().ok, true);
        assert.deepEqual(vn.getUnifiedSettings({ mode: 'pc' }).bridge.virtualRegex.rules, [builtinRule, { pattern: 'foo', flags: 'g', replacement: 'bar' }]);

        const reopened = vn.openSettings({ tab: 'regex', mode: 'pc' }).controller;
        const removed = await invokeConfirmed(reopened, document, 'remove-virtual-regex:1');
        assert.equal(removed.ok, true);
        assert.deepEqual(reopened.getSnapshot().draft.bridge.virtualRegex.rules, [builtinRule]);
        assert.deepEqual(vn.getUnifiedSettings({ mode: 'pc' }).bridge.virtualRegex.rules, [builtinRule]);
        assert.equal(reopened.close().ok, true);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:virtual-regex-strips-html-comments-and-keeps-deleted-builtins-deleted', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument();
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '注释测试。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const settings = opened.reader.controller.openSettings('regex').controller;
        const builtinRule = { pattern: '\\s*<!--[\\s\\S]*?-->\\s*\\n?', flags: 'g', replacement: '' };

        // 内置规则真的生效：注释整段消失，正文一个字不丢。
        const cleaned = vn.getUnifiedSettings({ mode: 'pc' }).bridge.virtualRegex;
        const { applyImmersiveGalgameSystemBodyFormat } = await import('../src/scene/message-source.js');
        const formatted = applyImmersiveGalgameSystemBodyFormat(
            '前文<!-- 这是给AI看的注释\n第二行 -->后文',
            cleaned,
        ).formattedRaw;
        assert.equal(formatted, '前文后文');

        // 用户删掉内置规则并保存后，重新打开不会又冒出来。
        const removed = await invokeConfirmed(settings, document, 'remove-virtual-regex:0');
        assert.equal(removed.ok, true);
        assert.deepEqual(settings.getSnapshot().draft.bridge.virtualRegex.rules, []);
        assert.equal(settings.close().ok, true);
        const reopened = vn.openSettings({ tab: 'regex', mode: 'pc' }).controller;
        assert.deepEqual(reopened.getSnapshot().draft.bridge.virtualRegex.rules, []);
        assert.equal(reopened.close().ok, true);
    } finally {
        vn.destroy();
    }
});

test('gate:igs-ui:toolbar-top-first-row-aligns-with-toggle-and-close', () => {
    const css = getOriginalReaderStyleText();
    // 外层不换行、靠右收成一团：按钮、收纳、关闭贴在一起，不再铺满整条。
    assert.match(css, /#igs-overlay\.igs-toolbar-top \.igs-ctrl-bar\{[^}]*justify-content:flex-end[^}]*align-items:flex-start[^}]*flex-wrap:nowrap/);
    assert.doesNotMatch(css, /#igs-overlay\.igs-toolbar-top \.igs-ctrl-bar\{[^}]*space-between/);
    // 按钮区限宽（约 8 个一行）提前换行，行内左对齐。
    assert.match(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*max-width:336px[^}]*justify-content:flex-start[^}]*flex-wrap:wrap/);
    // 贴右上角，左右仍留 14px，窄屏不会撑出屏幕。
    assert.match(css, /#igs-overlay\.igs-toolbar-top #igs-toolbar-layer\{inset:14px 14px auto auto;width:auto;max-width:calc\(100% - 28px\)/);
});


test('gate:simulation:minimal loop reads fake message, resolves scene, renders layer, and sends choice text', async () => {
    const message = readJson('fixtures/tavern/standard-message.json');
    const sent = [];
    const rendered = [];
    const globalObject = {};
    const vn = bootstrapIGS({
        global: globalObject,
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async (text) => {
                sent.push(text);
                return { ok: true };
            },
        },
        layers: {
            dialogue: {
                render(stage) {
                    rendered.push({ layer: 'dialogue', stage });
                },
            },
        },
    });

    const result = await vn.refresh({
        backgroundRules: [
            { id: 'bg.library.rain', priority: 20, match: { location: ['图书馆'], time: ['夜晚'], weather: ['雨'] } },
        ],
        characterRules: [
            { id: 'char.eli.smile', character: '艾莉', emotion: '微笑' },
        ],
    });
    const sendResult = await vn.typeAndSend('选择：继续调查');

    assert.equal(globalObject.IGS, vn);
    assert.equal(result.ok, true);
    assert.equal(result.scene.speaker, '艾莉');
    assert.equal(result.scene.background.id, 'bg.library.rain');
    assert.equal(rendered.length, 1);
    assert.equal(result.render.stage.layers.dialogue.text, '艾莉: 我们从这里开始。');
    assert.equal(result.render.stage.layers.hud.toolbar.layout, 'horizontal');
    assert.equal(result.render.stage.attributes['data-igs-toolbar-placement'], 'top-right');
    assert.equal(rendered[0].stage.layers.dialogue.speaker, '艾莉');
    assert.deepEqual(sendResult, { ok: true });
    assert.deepEqual(sent, ['选择：继续调查']);
    assert.deepEqual(vn.destroy(), { ok: true });
});

test('gate:simulation:reader-stage-generated-image-slot', async () => {
    const message = readJson('fixtures/tavern/generated-message.json');
    const vn = bootstrapIGS({
        global: {},
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const result = await vn.refresh();
    assert.equal(result.scene.visualMode, VISUAL_MODES.GENERATED_FIRST);
    assert.equal(result.scene.generatedImage.value, 'prompt://moon-rooftop');
    assert.equal(result.render.stage.layers.generated.visible, true);
    assert.equal(result.render.stage.layers.background.visible, false);
    assert.equal(result.render.stage.layers.character.visible, false);
    vn.destroy();
});

test('gate:simulation:fake shujuku update calls refresh worldbook', async () => {
    const calls = [];
    const client = createShujukuClient({
        updateRow: async (tableName, rowIndex, patch) => {
            calls.push(['updateRow', tableName, rowIndex, patch]);
            return { success: true };
        },
        refreshDataAndWorldbook: async () => {
            calls.push(['refreshDataAndWorldbook']);
            return { success: true };
        },
    });

    const fixture = readJson('fixtures/shujuku/basic-table.json');
    const result = await client.updateRowAndRefresh('角色状态', 1, fixture.rowPatch);

    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], 'refreshDataAndWorldbook');
});

test('gate:simulation:shujuku client writes row indexes, not row_id values', async () => {
    const calls = [];
    const client = createShujukuClient({
        updateCell: async (tableName, rowIndex, colName, value) => {
            calls.push(['updateCell', tableName, rowIndex, colName, value]);
            return { success: true };
        },
        deleteRow: async (tableName, rowIndex) => {
            calls.push(['deleteRow', tableName, rowIndex]);
            return { success: true };
        },
    });

    assert.equal((await client.updateCell('主角技能表', 1, '技能名称', '敏锐观察')).ok, true);
    assert.equal((await client.deleteRow('主角技能表', 1)).ok, true);
    assert.deepEqual(calls, [
        ['updateCell', '主角技能表', 1, '技能名称', '敏锐观察'],
        ['deleteRow', '主角技能表', 1],
    ]);
});

test('gate:simulation:db-panel converts rendered rows to shujuku api row indexes', () => {
    assert.equal(toShujukuApiRowIndex(0), 1);
    assert.equal(toShujukuApiRowIndex(3), 4);
    assert.equal(Number.isNaN(toShujukuApiRowIndex(NaN)), true);
});

test('gate:simulation:db-tab-drag-click-guard-does-not-block-later-tab-clicks', () => {
    let clock = 1000;
    const strip = {};
    const tab = {
        closest(selector) {
            return selector === '.igs-shujuku-tabs' ? strip : null;
        },
    };
    const guard = createDbTabClickGuard(() => clock);

    assert.equal(guard.shouldSuppress({ clientX: 120, clientY: 32 }, tab), false);

    guard.arm({ strip, clientX: 120, clientY: 32 });
    assert.equal(guard.shouldSuppress({ clientX: 123, clientY: 34 }, tab), true);
    assert.equal(guard.shouldSuppress({ clientX: 123, clientY: 34 }, tab), false);

    guard.arm({ strip, clientX: 220, clientY: 40 });
    clock += 200;
    assert.equal(guard.shouldSuppress({ clientX: 220, clientY: 40 }, tab), false);

    clock = 2000;
    guard.arm({ strip, clientX: 320, clientY: 48 });
    assert.equal(guard.shouldSuppress({ clientX: 380, clientY: 48 }, tab), false);
});

test('gate:simulation:db-tab-drag-scroll-captures-only-after-move-threshold', () => {
    const source = fs.readFileSync(path.join(appRoot, 'src/shujuku-panel/panel-controller.js'), 'utf8');
    const pointerDown = source.match(/panel\.addEventListener\('pointerdown',[\s\S]*?\n        \}\);/)[0];
    const pointerMove = source.match(/panel\.addEventListener\('pointermove',[\s\S]*?\n        \}\);/)[0];

    assert.doesNotMatch(pointerDown, /setPointerCapture/);
    assert.match(pointerMove, /Math\.abs\(dx\) < 4/);
    assert.match(pointerMove, /setPointerCapture/);
});

test('gate:simulation:resource cache preserves local resource entry', () => {
    const pack = readJson('fixtures/media/resource-pack.json');
    const cache = createResourceCache();

    const putResult = cache.put(pack.items[0].id, pack.items[0]);
    assert.equal(putResult.ok, true);
    assert.equal(cache.get('bg.library.night').url, 'placeholder://library-night');
    assert.equal(cache.list().length, 1);
});

test('gate:simulation:image-resource-cache-loads-on-demand-and-deduplicates-url', async () => {
    let fetchCount = 0;
    const revoked = [];
    const cache = createImageResourceCache({
        async fetch(url, options) {
            fetchCount += 1;
            assert.equal(url, 'https://example.com/scene.png');
            assert.deepEqual(options, { cache: 'force-cache', mode: 'cors' });
            return { ok: true, async blob() { return { type: 'image/png' }; } };
        },
        URL: {
            createObjectURL() { return 'blob:scene-cache'; },
            revokeObjectURL(url) { revoked.push(url); },
        },
    });

    assert.equal(fetchCount, 0);
    assert.equal(cache.get('https://example.com/scene.png'), '');
    const first = cache.load('https://example.com/scene.png');
    const second = cache.load('https://example.com/scene.png');
    assert.equal(first, second);
    assert.equal(fetchCount, 1);
    assert.equal(await first, 'blob:scene-cache');
    assert.equal(await second, 'blob:scene-cache');
    assert.equal(cache.get('https://example.com/scene.png'), 'blob:scene-cache');
    assert.equal(cache.size(), 1);
    cache.clear();
    assert.deepEqual(revoked, ['blob:scene-cache']);
    assert.equal(cache.size(), 0);
});

test('gate:simulation:igs-open-latest-and-open-message-use-compat-api', async () => {
    const latestMessage = readJson('fixtures/tavern/standard-message.json');
    const specificMessage = readJson('fixtures/igs/igs-message.json');
    const rendered = [];
    const vn = bootstrapIGS({
        global: {},
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            getMessageById: async (messageId) => {
                return Number(messageId) === specificMessage.id ? specificMessage : null;
            },
            typeAndSend: async () => ({ ok: true }),
        },
        layers: {
            dialogue: {
                render(stage) {
                    rendered.push(stage);
                },
            },
        },
    });

    const latestResult = await vn.openLatestAvailable('mobile');
    const byIdResult = await vn.openViewerFromMessage(specificMessage.id, 'pc');
    const missingResult = await vn.openViewerFromMessage(999, 'pc');

    assert.equal(latestResult.ok, true);
    assert.equal(latestResult.scene.speaker, '艾莉');
    assert.equal(latestResult.reader.snapshot.mode, 'mobile');
    assert.ok(latestResult.reader.snapshot.selectors.includes('#igs-overlay'));
    assert.equal(byIdResult.ok, true);
    assert.equal(byIdResult.scene.speaker, '玉子');
    assert.equal(byIdResult.scene.generatedImage.value, 'prompt://library-rain-night');
    assert.ok(byIdResult.reader.snapshot.selectors.includes('#igs-send-btn'));
    assert.equal(missingResult.ok, false);
    assert.equal(missingResult.reason, 'message-not-found');
    assert.equal(rendered.length, 2);
    assert.equal(rendered[0].layers.dialogue.visible, true);
    assert.equal(rendered[1].layers.generated.visible, true);

    vn.destroy();
});

test('gate:simulation:compat-api-reports-excluded-only-text-without-opening-blank-reader', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({
        sourceFilter: { textExcludeTags: 'thinking' },
    }) });
    const excluded = { id: 42, text: '<content><thinking>不能显示</thinking></content>' };
    const readable = { id: 43, text: '<content>保留正文。</content>' };
    let current = excluded;
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => current,
            getMessageById: async id => Number(id) === 42 ? excluded : readable,
            typeAndSend: async () => { throw Error('reader opening must not send'); },
        },
    });

    const empty = await vn.openLatestAvailable('pc');
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, 'no-readable-text');
    assert.equal(empty.reader.reason, 'no-readable-text');
    assert.equal(vn.getState().igsUi.activeReader, null);
    assert.equal(document.getElementById('igs-overlay'), null);

    current = readable;
    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.ok, true);
    const replaced = await vn.openViewerFromMessage(42, 'pc', { replaceActive: true });
    assert.equal(replaced.ok, false);
    assert.equal(replaced.reason, 'no-readable-text');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.segments.join(''), '保留正文。');
    vn.destroy();
});

test('gate:simulation:magic-wand-entry-opens-latest-reader', async () => {
    const document = createFakeDocument();
    const menu = document.createElement('div');
    menu.id = 'extensionsMenu';
    document.body.appendChild(menu);
    const legacyEntry = document.createElement('a');
    legacyEntry.setAttribute('data-igs-magic-entry', '1');
    legacyEntry.setAttribute('data-igs-version', '0.2.10');
    menu.appendChild(legacyEntry);

    const latestMessage = readJson('fixtures/tavern/standard-message.json');
    const sent = [];
    const vn = bootstrapIGS({
        global: {
            document,
            setInterval: () => 1,
            clearInterval: () => {},
        },
        magicWandEntryOptions: {
            retryIntervalMs: false,
        },
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async (text) => {
                sent.push(text);
                return { ok: true };
            },
        },
    });

    try {
        const entry = menu.querySelector('[data-igs-magic-entry="1"]');
        const pkgVersion = readJson('package.json').version;
        assert.ok(entry);
        assert.equal(entry.getAttribute('data-igs-version'), pkgVersion);
        assert.match(entry.innerHTML, /fa-book-open/);
        assert.match(entry.innerHTML, /沉浸式Galgame系统/);
        assert.equal(vn.getMagicWandEntryState().attached, true);
        assert.equal(menu.querySelectorAll('[data-igs-magic-entry="1"]').length, 1);
        assert.equal(menu.querySelector('[data-igs-version="0.2.10"]'), null);
        assert.deepEqual(vn.ensureMagicWandEntry(), { ok: true, menus: 1, entries: 1 });
        assert.equal(menu.querySelector('[data-igs-magic-entry="1"]'), entry);
        assert.equal(menu.querySelectorAll('[data-igs-magic-entry="1"]').length, 1);

        const clickResult = entry.click();
        await clickResult;
        const state = vn.getState();

        assert.equal(state.igsUi.activeReader.mode, 'pc');
        assert.equal(state.igsUi.activeReader.snapshot.content.speaker, '艾莉');
        assert.equal(sent.length, 0);
    } finally {
        vn.destroy();
    }
    assert.equal(menu.querySelector('[data-igs-magic-entry="1"]'), null);
});

test('gate:simulation:igs-reader-falls-back-to-visible-text-when-raw-message-is-host-ui-html', async () => {
    const latestMessage = readJson('fixtures/tavern/host-ui-leak-message.json');
    const vn = bootstrapIGS({
        global: {},
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const snapshot = opened.reader.snapshot;

    assert.equal(opened.ok, true);
    assert.match(snapshot.content.displayText, /玉子: 今晚我们先从这里开始。/);
    assert.equal(snapshot.content.displayText.includes('API Connections'), false);
    assert.equal(snapshot.content.displayText.includes('rightNavHolder'), false);
    assert.equal(snapshot.content.displayText.includes('<div'), false);
    assert.equal(snapshot.content.errors.some((item) => item.code === 'host-ui-html-leaked'), false);

    vn.destroy();
});

test('gate:simulation:igs-ui-open-settings-renders-five-tabs', () => {
    const legacyStorage = readJson('fixtures/igs/legacy-storage.json');
    const storage = createMemoryStorage(legacyStorage);
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const result = vn.openSettings({ tab: 'basic', mode: 'pc' });

    assert.equal(result.ok, true);
    assert.deepEqual(result.snapshot.tabs.map((item) => item.label), ['基础', '阅读器', '素材', '生图']);
    assert.equal(result.snapshot.tabs[0].active, true);
    assert.ok(result.snapshot.selectors.includes('#igs-unified-settings'));

    vn.destroy();
});
test('gate:simulation:settings-last-page-restores-subtab-after-reopen-and-restart', () => {
    const storage = createMemoryStorage();
    const createApp = () => bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    const vn = createApp();
    try {
        let opened = vn.openSettings();
        assert.equal(opened.snapshot.tabs.find((tab) => tab.active).label, '基础');
        opened.controller.switchTab('reader');
        opened.controller.switchReaderSubTab('text');
        assert.equal(JSON.parse(storage.getItem('igs:settings-last-page:v1'))?.tab, 'reader', 'navigation writes last tab');
        assert.equal(opened.controller.close().ok, true);
        assert.equal(JSON.parse(storage.getItem('igs:settings-last-page:v1'))?.readerSubTab, 'text', 'close preserves last subtab');

        opened = vn.openSettings();
        assert.equal(opened.snapshot.tabs.find((tab) => tab.active).label, '阅读器');
        assert.equal(opened.snapshot.readerSubTab, 'text');
        assert.equal(opened.controller.close().ok, true);

        opened = vn.openSettings({ tab: 'scene' });
        assert.equal(opened.snapshot.tabs.find((tab) => tab.active).label, '素材', 'explicit navigation wins');
        opened.controller.switchSceneSubTab('review');
        assert.equal(opened.controller.close().ok, true);
    } finally {
        vn.destroy();
    }
    const restarted = createApp();
    try {
        let opened = restarted.openSettings();
        assert.equal(opened.snapshot.tabs.find((tab) => tab.active).label, '素材');
        assert.equal(opened.snapshot.sceneSubTab, 'review');
        opened.controller.switchTab('image');
        opened.controller.switchImageSubTab('logs');
        assert.equal(opened.controller.close().ok, true);
        opened = restarted.openSettings();
        assert.equal(opened.snapshot.tabs.find((tab) => tab.active).label, '生图');
        assert.equal(opened.snapshot.imageSubTab, 'logs');
        assert.equal(opened.controller.close().ok, true);
        storage.setItem('igs:settings-last-page:v1', '{broken');
        opened = restarted.openSettings();
        assert.equal(opened.snapshot.tabs.find((tab) => tab.active).label, '基础', 'broken preference falls back safely');
        assert.equal(opened.controller.close().ok, true);
    } finally {
        restarted.destroy();
    }
});



test('gate:simulation:scene-assets-injects-prompt-and-renders-single-configured-assets', async () => {
    const extensionPrompts = {};
    const timers = [];
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: DEFAULT_SCENE_PROMPT_RULE,
                scenes: {
                    'B班教室': { url: 'https://example.com/classroom.png', times: {} },
                },
                characters: {
                    '小林海斗': {
                        '平静': 'https://example.com/kaito.png',
                    },
                },
            },
        }),
    });
    const message = {
        id: 38,
        text: '<now_plot>\n<content>\n[igs-scene:B班教室|下午|晴天]\n[igs-char:小林海斗|平静|できるもん！]\n</content>\n</now_plot>',
    };
    const vn = bootstrapIGS({
        global: {
            localStorage: storage,
            SillyTavern: {
                getContext() {
                    return {
                        extensionPrompts,
                        setExtensionPrompt(key, value, position, depth, scan, role) {
                            extensionPrompts[key] = { value, position, depth, scan, role };
                        },
                    };
                },
            },
            setTimeout(callback, delay) {
                timers.push({ callback, delay });
                return timers.length;
            },
            clearTimeout() {},
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    assert.equal(timers[0].delay, 3000);
    timers[0].callback();

    const injected = extensionPrompts['igs-scene-assets-format-rule'];
    // 默认注入到系统说明区（IN_PROMPT），depth 0 只留一行提醒。
    assert.equal(injected.position, 0);
    assert.equal(injected.role, 0);
    assert.equal(extensionPrompts['igs-scene-assets-depth0'].position, 1);
    assert.match(extensionPrompts['igs-scene-assets-depth0'].value, /本轮按系统说明/);
    assert.match(injected.value, /\[igs-scene:/);
    assert.match(injected.value, /NSFW场景加第4栏大写NSFW/);
    assert.doesNotMatch(injected.value, /\{\{mood_groups\}\}/);
    assert.match(injected.value, /喜悦：开心、高兴、愉快/);
    assert.match(injected.value, /\[igs-char:角色名\|表情\|服装\|对白\]/);
    assert.doesNotMatch(injected.value, /\{\{outfit_groups\}\}/);
    assert.match(injected.value, /对上哪套就写哪套的名字/);
    assert.match(injected.value, /不要照抄上一句/);
    assert.match(injected.value, /不许再写原来那套/);

    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/classroom.png');
    assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/kaito.png');

    vn.destroy();
    assert.equal(Object.hasOwn(extensionPrompts, 'igs-scene-assets-format-rule'), false);
    assert.equal(Object.hasOwn(extensionPrompts, 'igs-scene-assets-depth0'), false);
});

test('gate:simulation:nsfw-scene-hides-character-visuals-and-applies-neutral-veil', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                characters: { Alice: { calm: 'https://example.com/alice.png' } },
                characterAliases: { Alice: [] },
                moodGroups: [],
                statusAvatars: { Alice: 'data:image/png;base64,AAA' },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, showEmotion: true, showLocation: true, showSpriteOnNsfw: false },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 39,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-scene:Room|night|rain|NSFW]',
                    '[igs-char:Alice|calm|Stay.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const content = opened.reader.snapshot.content;
    const overlay = document.getElementById('igs-overlay');
    const sprite = overlay.querySelector('#igs-sprite');
    const hud = document.getElementById('igs-status-hud');
    const location = hud.querySelector('.igs-hud-location-label');
    assert.equal(content.sceneNsfw, true);
    assert.equal(content.spriteImage, null);
    assert.equal(sprite.style.backgroundImage, '');
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), true);
    assert.equal(sprite.style.display, 'none');
    assert.equal(content.statusHud.location, 'Room');
    assert.equal(hud.hasAttribute('hidden'), false);
    assert.equal(hud.querySelector('.igs-hud-avatar'), null);
    assert.equal(hud.querySelector('.igs-hud-emotion'), null);
    assert.ok(hud.querySelector('.igs-hud-location'));
    assert.equal(location && location.textContent, 'Room');
    const styleText = getOriginalReaderStyleText();
    assert.doesNotMatch(styleText, /#igs-overlay\.igs-scene-nsfw #igs-bg\{[^}]*filter:/);
    assert.match(styleText, /#igs-overlay\.igs-scene-nsfw #igs-bg::after\{[^}]*radial-gradient\(ellipse at center,rgba\(12,14,18,var\(--igs-nsfw-veil-center,\.30\)\) 20%,rgba\(12,14,18,var\(--igs-nsfw-veil-edge,\.72\)\) 100%\)/);
    // 默认档（medium）中心不再接近透明，消除「只有四角发黑」。
    assert.equal(overlay.style['--igs-nsfw-veil-center'], '.30');
    assert.equal(overlay.style['--igs-nsfw-veil-edge'], '.72');
    vn.destroy();
});

test('gate:assets:reader-open-routes-service-notices-to-strip', async () => {
    const document = createFakeDocument();
    const raw = '[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。';
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } }, readerSettings: {} }),
    });
    try {
        assert.equal(host.showImageNotice('error', '素材「教室」生成失败：超时'), false, '阅读器没开时交回 toastr');
        host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
        assert.equal(host.showImageNotice('error', '素材「教室」生成失败：超时'), true);
        const strip = document.getElementById('igs-gen-strip');
        assert.equal(strip.getAttribute('data-state'), 'failed');
        assert.equal(strip.querySelector('.igs-gen-tip').textContent, '素材「教室」生成失败：超时');
        assert.ok(!host.getState().activeReader.toastMessage, '不再弹阅读器旧提示');
    } finally { host.destroy(); }
});

test('gate:assets:reader-manual-generation-feedback', async () => {
    const document = createFakeDocument();
    const raw = '[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。';
    const calls = [];
    const logs = [];
    let result = { ok: true, reason: 'done', count: 1 };
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } }, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 39, swipeId: 0, isAi: true, isLatest: true, text: raw }),
        generatedAssets: { async processMessage(...args) { calls.push(args); return result; } },
        imageJobLog: { add: (level, message) => logs.push({ level, message }) },
    });
    try {
        const opened = host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        const overlay = document.getElementById('igs-overlay');
        const button = overlay.querySelector('[data-act="generate-assets"]');
        assert.ok(button, '阅读器必须有可点击的手动生图按钮');
        await overlay.parentNode.dispatchEvent({ type: 'click', target: button });
        assert.deepEqual(calls, [[39, { manual: true }]]);
        assert.match(host.getState().activeReader.generationTip, /已生成 1 项/);
        assert.equal(logs.at(-1).level, 'success');
        for (const [next, text, level] of [
            [{ ok: false, reason: 'generation-failed' }, /补全素材失败/, 'error'],
            [{ ok: false, reason: 'plan-failed', error: '副 LLM 规划失败' }, /副 LLM 规划失败/, 'error'],
            [{ ok: true, reason: 'disabled' }, /开启自动背景或自动立绘/, 'warn'],
            [{ ok: true, reason: 'scene-assets-disabled' }, /开启场景素材/, 'warn'],
            [{ ok: true, reason: 'nothing-missing' }, /没有未登记/, 'warn'],
        ]) {
            result = next;
            assert.equal(await opened.controller.invokeAction('generate-assets'), next);
            assert.match(host.getState().activeReader.generationTip, text);
            assert.equal(logs.at(-1).level, level);
        }
    } finally { host.destroy(); }
});

test('gate:assets:reader-manual-retries-settled-floor', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const document = createFakeDocument();
    const raw = '[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。';
    const floor = { chatId: 'chat-1', messageId: 39, swipeId: 0, isAi: true, isLatest: true, text: raw };
    const store = createMemoryGeneratedAssetStore();
    await store.putFloor('chat-1|39|0', { status: 'done', count: 0 });
    let calls = 0;
    const logs = [];
    const bridge = { autoIllustration: { assets: { backgroundEnabled: true } }, sceneAssets: { enabled: true, scenes: {}, characters: {} } };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => floor.chatId, readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { return 'id: bg1\ntags: factory, night'; } },
        nai: { async generate() {
            calls += 1;
            return calls === 1 ? { ok: false, error: '模拟 NAI 请求失败' } : { ok: true, dataUrl: 'data:image/png;base64,AAA' };
        } },
        store,
        getSettings: () => bridge,
        report: (level, message) => logs.push({ level, message }),
    });
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge, readerSettings: {} }),
        getIllustrationSource: () => floor,
        generatedAssets: service,
        imageJobLog: { add: (level, message) => logs.push({ level, message }) },
    });
    try {
        assert.equal((await service.processMessage(39)).reason, 'already-decided');
        assert.equal(calls, 0);
        const opened = host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        const overlay = document.getElementById('igs-overlay');
        const button = overlay.querySelector('[data-act="generate-assets"]');
        await overlay.parentNode.dispatchEvent({ type: 'click', target: button });
        assert.equal(calls, 1);
        assert.equal((await store.getFloor('chat-1|39|0')).status, 'failed');
        assert.match(host.getState().activeReader.generationTip, /补全素材失败/);
        assert.ok(logs.some((entry) => entry.message.includes('模拟 NAI 请求失败')));
        const retry = await opened.controller.invokeAction('generate-assets');
        assert.deepEqual([retry.ok, retry.count, calls], [true, 1, 2]);
        assert.equal((await store.getFloor('chat-1|39|0')).status, 'done');
        assert.equal(service.listReview('chat-1|39|0').length, 1);
        assert.match(host.getState().activeReader.generationTip, /已生成 1 项/);
    } finally { host.destroy(); }
});

// 旧楼（isLatest:false）不再拒绝：续读停在哪一楼，工具栏就按哪一楼出图。
test('gate:assets:reader-manual-rejects-ineligible-or-changed-floor', async () => {
    const document = createFakeDocument();
    const raw = '最新回复。';
    const initial = { chatId: 'chat-1', messageId: 39, swipeId: 0, isAi: true, isLatest: true, text: raw };
    let floor = initial;
    let calls = 0;
    const host = createIgsReaderHost({
        global: { document },
        getIllustrationSource: () => floor,
        generatedAssets: { async processMessage() { calls += 1; return { ok: true, reason: 'done', count: 1 }; } },
    });
    try {
        const opened = host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
        for (const [change, reason] of [
            [{ isAi: false }, 'not-eligible'],
            [{ chatId: 'chat-2' }, 'stale-floor'],
            [{ swipeId: 1 }, 'stale-floor'],
            [{ messageId: 40 }, 'stale-floor'],
        ]) {
            floor = { ...initial, ...change };
            assert.equal((await opened.controller.invokeAction('generate-assets')).reason, reason);
            assert.match(host.getState().activeReader.generationTip, /已跳过/);
        }
        assert.equal(calls, 0);
    } finally { host.destroy(); }
});

test('gate:simulation:html-card-page-hides-inherited-sprite-and-restores-it-after-paging', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = `<content>
[igs-scene:Room|night|clear]
[igs-char:Alice|calm|Before the card.]
<htm1fenge><span style="display:none;">（一句话: 物件状态/材质/核心视觉/情绪基调）</span><div style="width:100%;box-sizing:border-box;padding:8px;font-size:13px;word-break:break-word;"><!-- 按载体类型选择渲染范式 --></div></htm1fenge>
[igs-char:Alice|calm|After the card.]
</content>`;
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: {
                sceneAssets: {
                    enabled: true,
                    scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                    characters: { Alice: { calm: 'https://example.com/alice.png' } },
                    moodGroups: [],
                },
            },
            readerSettings: {},
        }),
    });
    const opened = host.openReader({ messageId: 49, message: { id: 49, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    try {
        const overlay = document.getElementById('igs-overlay');
        const sprite = overlay.querySelector('#igs-sprite');
        const current = () => host.getState().activeReader.snapshot.content;
        assert.match(current().spriteImage, /alice\.png/);
        assert.equal(sprite.style.display, 'block');

        opened.controller.invokeAction('next');
        assert.equal(current().htmlCardPage, true);
        assert.equal(current().spriteImage, null);
        assert.equal(sprite.style.display, 'none');
        assert.equal(sprite.style.backgroundImage, '');
        assert.equal(overlay.classList.contains('igs-html-card-page'), true);

        opened.controller.invokeAction('next');
        assert.equal(current().htmlCardPage, false);
        assert.match(current().spriteImage, /alice\.png/);
        assert.equal(sprite.style.display, 'block');
        assert.equal(overlay.classList.contains('igs-html-card-page'), false);

        opened.controller.invokeAction('prev');
        assert.equal(current().htmlCardPage, true);
        assert.equal(sprite.style.display, 'none');
    } finally {
        host.destroy();
    }
});

test('gate:illustration:reader-rerenders-after-marker-write-and-keeps-veil-until-image-ready', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const original = '[igs-scene:Room|night|rain|NSFW]\n一段。\n二段。';
    let raw = original;
    let imageUrl = '';
    let trigger;
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } }, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 39, swipeId: 0, text: raw }),
        getIllustrationUrl: ({ chatId, messageId, swipeId, slot }) => {
            assert.deepEqual([chatId, messageId, swipeId, slot], ['chat-1', 39, 0, 1]);
            return imageUrl;
        },
        onIllustrationUpdated: (handler) => { trigger = handler; return () => {}; },
    });
    const opened = host.openReader({ messageId: 39, message: { id: 39, text: original }, raw: original }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const before = host.getState().activeReader.snapshot;
    assert.equal(before.content.illustrationActive, false);
    raw = '[igs-scene:Room|night|rain|NSFW]\n[igs-img:1]\n更新后正文。\n二段。';
    trigger({ chatId: 'chat-1', messageId: 39, swipeId: 1, slot: 1 });
    assert.equal(host.getState().activeReader.snapshot.content.illustrationActive, false);
    trigger({ chatId: 'chat-1', messageId: 39, swipeId: 0, slot: 1 });
    assert.ok(host.getState().activeReader.snapshot.content.segments.some((segment) => segment.includes('更新后正文')));
    assert.equal(host.getState().activeReader.snapshot.content.illustrationActive, false);
    imageUrl = 'data:image/png;base64,AAAA';
    trigger({ chatId: 'chat-1', messageId: 39, swipeId: 0, slot: 1 });
    const after = host.getState().activeReader.snapshot;
    assert.equal(after.content.illustrationActive, true);
    assert.equal(after.content.backgroundImage, imageUrl);
    assert.equal(after.content.spriteImage, null);
    assert.ok(after.content.segments.every((segment) => !segment.includes('[igs-img:')));
    assert.equal(document.getElementById('igs-overlay').classList.contains('igs-scene-nsfw'), false);
    host.destroy();
});

test('gate:illustration:failed-cg-point-can-reroll-and-does-not-borrow-another-image', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '[igs-scene:Room|night|clear]\n[igs-img:1]\n这一页的 CG 没画出来。';
    const calls = [];
    const host = createIgsReaderHost({
        global: { document, confirm: () => true },
        getUnifiedSettings: () => ({
            bridge: {
                sceneAssets: {
                    enabled: true,
                    scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                    characters: {},
                },
            },
            readerSettings: {},
        }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 39, swipeId: 0, text: raw }),
        getIllustrationUrl: () => '',
        illustrations: {
            async rerollSlot(query) {
                calls.push(query);
                return { ok: true, reason: 'done' };
            },
        },
    });
    try {
        const opened = host.openReader({
            messageId: 39,
            message: { id: 39, text: raw },
            raw,
            imageState: {
                images: [{ url: 'https://example.com/other.png', slotIndex: 0 }],
                unboundImages: [{ url: 'https://example.com/other.png', slotIndex: 0 }],
            },
        }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        const content = host.getState().activeReader.snapshot.content;
        assert.equal(content.illustrationSlot, 1);
        assert.equal(content.illustrationActive, false);
        assert.equal(content.cgActive, true);
        assert.equal(content.backgroundImage, '');
        assert.equal(document.getElementById('igs-stage-motion').getAttribute('data-igs-cg'), '1');
        assert.equal(document.getElementById('igs-bg').style.backgroundImage, '');
        const reroll = document.getElementById('igs-btn-reroll-cg');
        const clear = document.getElementById('igs-btn-clear-cg');
        assert.equal(reroll.disabled, false);
        assert.equal(clear.disabled, true);
        const result = await acceptPageModal(document, opened.controller.invokeAction('reroll-cg'));
        assert.equal(result.ok, true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].slot, 1);
        assert.equal(calls[0].messageId, 39);
    } finally {
        host.destroy();
    }
});

test('gate:scene:new-mood-auto-classifies-by-existing-group-habit', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    const raw = '[igs-char:Alice|迟疑|这话让她停了一下。]';
    let settings = {
        bridge: {
            sceneAssets: {
                enabled: true,
                moodAutoClassify: true,
                characters: { Alice: { 默认: 'https://example.com/alice.png' } },
                moodGroups: [
                    { label: '思考', words: ['沉思', '犹豫', '琢磨'] },
                    { label: '喜悦', words: ['开心', '高兴'] },
                ],
            },
            autoIllustration: { llm: { source: 'openai', endpoint: 'https://llm.example/v1', model: 'habit-model', apiKey: 'k' } },
        },
        readerSettings: {},
    };
    let sent;
    const host = createIgsReaderHost({
        global: { document, localStorage: storage },
        getUnifiedSettings: () => settings,
        saveUnifiedSettings: (next) => {
            settings = { bridge: next.bridge, readerSettings: next.readerSettings, readerMode: next.readerMode };
            return { ok: true };
        },
        requestMoodClassification: async (input, llm) => {
            sent = { input, llm };
            return '{"assignments":[{"word":"迟疑","group":"思考"}]}';
        },
    });
    try {
        const opened = host.openReader({ messageId: 7, message: { id: 7, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.equal(sent.llm.model, 'habit-model');
        assert.match(sent.input.system, /分类习惯/);
        const payload = JSON.parse(sent.input.user);
        assert.deepEqual(payload.words, ['迟疑']);
        assert.deepEqual(payload.groups[0].words, ['沉思', '犹豫', '琢磨']);
        const thinking = settings.bridge.sceneAssets.moodGroups.find((group) => group.label === '思考');
        assert.equal(thinking.words.includes('迟疑'), true);
        assert.equal(loadMoodReview(storage).some((item) => item.word === '迟疑'), false);
    } finally {
        host.destroy();
    }
});

test('gate:scene:one-floor-of-new-moods-classifies-in-one-request', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    const raw = '[igs-char:Alice|迟疑|第一句。]\n[igs-char:Alice|心虚|第二句。]';
    let settings = {
        bridge: {
            sceneAssets: {
                enabled: true,
                moodAutoClassify: true,
                characters: { Alice: { 默认: 'https://example.com/alice.png' } },
                moodGroups: [{ label: '思考', words: ['沉思', '犹豫'] }],
            },
            autoIllustration: { llm: { source: 'openai', endpoint: 'https://llm.example/v1', model: 'habit-model' } },
        },
        readerSettings: {},
    };
    const sent = [];
    const host = createIgsReaderHost({
        global: { document, localStorage: storage },
        getUnifiedSettings: () => settings,
        saveUnifiedSettings: (next) => {
            settings = { bridge: next.bridge, readerSettings: next.readerSettings, readerMode: next.readerMode };
            return { ok: true };
        },
        requestMoodClassification: async (input) => {
            sent.push(JSON.parse(input.user).words);
            return JSON.stringify({
                assignments: [
                    { word: '迟疑', group: '思考' },
                    { word: '心虚', group: '思考' },
                ],
            });
        },
    });
    try {
        const opened = host.openReader({ messageId: 8, message: { id: 8, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        opened.controller.invokeAction('next');
        opened.controller.invokeAction('prev');
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.equal(sent.length, 1);
        assert.deepEqual([...sent[0]].sort(), ['心虚', '迟疑'].sort());
        const words = settings.bridge.sceneAssets.moodGroups[0].words;
        assert.equal(words.includes('迟疑') && words.includes('心虚'), true);
    } finally {
        host.destroy();
    }
});

test('gate:scene:mood-auto-classify-stays-off-until-the-switch-is-on', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    recordMoodReview(storage, { word: '迟疑', quality: 'default' });
    const raw = '[igs-char:Alice|迟疑|她没有立刻回答。]';
    let calls = 0;
    const host = createIgsReaderHost({
        global: { document, localStorage: storage },
        getUnifiedSettings: () => ({
            bridge: {
                sceneAssets: {
                    enabled: true,
                    characters: { Alice: { 默认: 'https://example.com/alice.png' } },
                    moodGroups: [{ label: '思考', words: ['沉思'] }],
                },
            },
            readerSettings: {},
        }),
        requestMoodClassification: async () => { calls += 1; return '{"assignments":[]}'; },
    });
    try {
        host.openReader({ messageId: 7, message: { id: 7, text: raw }, raw }, { mode: 'pc' });
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.equal(calls, 0);
        assert.equal(loadMoodReview(storage).some((item) => item.word === '迟疑'), true);
    } finally {
        host.destroy();
    }
});

test('gate:illustration:reader-clear-cg-removes-only-current-slot-and-rerenders', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '[igs-img:1]\n当前 CG。';
    const slots = new Map([[1, 'data:image/png;base64,CURRENT'], [2, 'data:image/png;base64,OTHER']]);
    const clearCalls = [];
    let urlReads = 0;
    const host = createIgsReaderHost({
        global: { document, confirm: () => true },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 39, swipeId: 0, text: raw }),
        getIllustrationUrl: ({ slot }) => {
            urlReads += 1;
            return slots.get(slot) || '';
        },
        illustrations: {
            async clearIllustration(query) {
                clearCalls.push(query);
                slots.delete(query.slot);
                return { ok: true };
            },
        },
    });
    try {
        const opened = host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        assert.equal(host.getState().activeReader.snapshot.content.illustrationActive, true);
        const readsBeforeClear = urlReads;

        const result = await acceptPageModal(document, opened.controller.invokeAction('clear-cg'));

        assert.deepEqual(clearCalls, [{ chatId: 'chat-1', messageId: 39, swipeId: 0, slot: 1 }]);
        assert.deepEqual(result, { ok: true, reason: 'cleared', removed: true, rendered: true });
        assert.equal(slots.has(1), false);
        assert.equal(slots.get(2), 'data:image/png;base64,OTHER');
        assert.ok(urlReads > readsBeforeClear, '清扫成功后必须重新读取并渲染当前阅读器');
        const content = host.getState().activeReader.snapshot.content;
        assert.equal(content.illustrationActive, false);
        assert.equal(content.illustrationUrl, '');
        assert.equal(document.getElementById('igs-btn-clear-cg').disabled, true);
        assert.match(host.getState().activeReader.toastMessage, /当前 CG 已清扫/);
    } finally {
        host.destroy();
    }
});

test('gate:illustration:reader-clear-cg-no-current-does-not-delete', async () => {
    const document = createFakeDocument();
    const raw = '[igs-img:1]\n尚未生成。';
    let clearCalls = 0;
    const host = createIgsReaderHost({
        global: { document, confirm: () => true },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 40, swipeId: 0, text: raw }),
        getIllustrationUrl: () => '',
        illustrations: { async clearIllustration() { clearCalls += 1; return { ok: true }; } },
    });
    try {
        const opened = host.openReader({ messageId: 40, message: { id: 40, text: raw }, raw }, { mode: 'pc' });
        const result = await opened.controller.invokeAction('clear-cg');
        assert.equal(clearCalls, 0);
        assert.deepEqual(result, { ok: true, reason: 'no-current-cg', removed: false, rendered: false });
        assert.match(host.getState().activeReader.toastMessage, /没有可清扫的 CG/);
    } finally {
        host.destroy();
    }
});

test('gate:illustration:reader-clear-cg-delete-failure-keeps-current-and-reports-failure', async () => {
    const document = createFakeDocument();
    const raw = '[igs-img:1]\n当前 CG。';
    let urlReads = 0;
    const host = createIgsReaderHost({
        global: { document, confirm: () => true },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 41, swipeId: 0, text: raw }),
        getIllustrationUrl: () => {
            urlReads += 1;
            return 'data:image/png;base64,CURRENT';
        },
        illustrations: { async clearIllustration() { return { ok: false, reason: 'storage-failed' }; } },
    });
    try {
        const opened = host.openReader({ messageId: 41, message: { id: 41, text: raw }, raw }, { mode: 'pc' });
        const readsBeforeClear = urlReads;
        const result = await acceptPageModal(document, opened.controller.invokeAction('clear-cg'));
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'storage-failed');
        assert.equal(urlReads, readsBeforeClear, '删除失败不得触发成功路径重绘');
        assert.equal(host.getState().activeReader.snapshot.content.illustrationActive, true);
        assert.match(host.getState().activeReader.toastMessage, /清扫当前 CG 失败：storage-failed/);
        assert.doesNotMatch(host.getState().activeReader.toastMessage, /已清扫/);
    } finally {
        host.destroy();
    }
});

test('gate:illustration:reader-activates-only-after-marker-and-keeps-veil-without-image', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '[igs-scene:Room|night|rain|NSFW]\n一段。\n[igs-img:1]\n二段。\n[igs-scene:Garden|day|sun]\n三段。';
    let imageUrl = '';
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } }, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 39, swipeId: 0, text: raw }),
        getIllustrationUrl: ({ slot }) => slot === 1 ? imageUrl : '',
    });
    const opened = host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const overlay = document.getElementById('igs-overlay');
    assert.equal(host.getState().activeReader.snapshot.content.illustrationActive, false);
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), true);
    opened.controller.invokeAction('next');
    assert.equal(host.getState().activeReader.snapshot.content.illustrationActive, false);
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), true);
    imageUrl = 'data:image/png;base64,AAAA';
    opened.controller.invokeAction('prev');
    opened.controller.invokeAction('next');
    const after = host.getState().activeReader.snapshot.content;
    assert.equal(after.illustrationActive, true);
    assert.equal(after.backgroundImage, imageUrl);
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), false);
    assert.ok(after.segments.every((segment) => !segment.includes('[igs-img:')));
    opened.controller.invokeAction('next');
    const held = host.getState().activeReader.snapshot.content;
    assert.equal(held.illustrationActive, true);
    assert.equal(held.backgroundImage, imageUrl);
    host.destroy();
});

test('gate:illustration:cg-page-keeps-cg-and-does-not-paint-scene-background', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '[igs-scene:Room|night|clear]\n[igs-img:1]\n这一页同时有背景和 CG。\n下一句。';
    let imageUrl = '';
    let trigger;
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: {
                sceneAssets: {
                    enabled: true,
                    scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                    characters: {},
                },
            },
            readerSettings: {},
        }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 52, swipeId: 0, text: raw }),
        getIllustrationUrl: () => imageUrl,
        onIllustrationUpdated: (handler) => { trigger = handler; return () => {}; },
    });
    const opened = host.openReader({ messageId: 52, message: { id: 52, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const content = () => host.getState().activeReader.snapshot.content;
    const bg = document.getElementById('igs-bg');
    assert.equal(content().backgroundImage, '');
    assert.equal(content().cgActive, true);
    assert.equal(bg.style.backgroundImage, '');
    assert.equal(document.getElementById('igs-stage-motion').getAttribute('data-igs-cg'), '1');

    imageUrl = 'data:image/png;base64,CG';
    trigger({ chatId: 'chat-1', messageId: 52, swipeId: 0, slot: 1 });
    assert.equal(content().backgroundImage, imageUrl);
    assert.equal(content().illustrationActive, true);
    assert.match(bg.style.backgroundImage, /base64,CG/);
    assert.doesNotMatch(bg.style.backgroundImage, /room\.png/);
    host.destroy();
});



test('gate:simulation:nsfw-scene-keeps-sprite-when-hide-toggle-off', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                characters: { Alice: { calm: 'https://example.com/alice.png' } },
                characterAliases: { Alice: [] },
                moodGroups: [],
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: false },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 41,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-scene:Room|night|rain|NSFW]',
                    '[igs-char:Alice|calm|Stay.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const sprite = overlay.querySelector('#igs-sprite');
    assert.equal(opened.reader.snapshot.content.sceneNsfw, true);
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), true);
    assert.equal(sprite.style.display, 'block');
    assert.match(sprite.style.backgroundImage, /alice\.png/);
    // 默认「显示立绘」：NSFW 场景立绘原样显示，不加剪影。
    const stage = overlay.querySelector('#igs-stage-motion');
    assert.equal(stage.getAttribute('data-igs-rm-shade'), null);
    vn.destroy();
});
test('gate:simulation:page-turn-skips-unchanged-root-class-and-background-writes', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = [
        '[igs-scene:Room|night|rain|NSFW]',
        '[igs-char:Alice|calm|One.]',
        '[igs-char:Alice|calm|Two.]',
        '[igs-char:Alice|calm|Three.]',
    ].join('\n');
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: {
                sceneAssets: {
                    enabled: true,
                    scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                    characters: { Alice: { calm: 'https://example.com/alice.png' } },
                    characterAliases: { Alice: [] },
                    moodGroups: [],
                },
            },
            readerSettings: { statusHud: { enabled: false } },
        }),
    });
    const opened = host.openReader({ messageId: 42, message: { id: 42, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const overlay = document.getElementById('igs-overlay');
    const sprite = overlay.querySelector('#igs-sprite');
    const bg = overlay.querySelector('#igs-bg');
    assert.match(sprite.style.backgroundImage, /alice\.png/);
    assert.match(bg.style.backgroundImage, /room\.png/);
    // 类名只统计改变了值的写入（同值不引起样式失效，先删后加才会）；背景图同值重写也要解析整段地址，全部计数。
    const writes = { className: 0, sprite: 0, bg: 0 };
    const trap = (target, prop, counter, changesOnly = false) => {
        let value = target[prop];
        Object.defineProperty(target, prop, {
            configurable: true,
            get: () => value,
            set: (next) => { if (!changesOnly || next !== value) writes[counter] += 1; value = next; },
        });
    };
    trap(overlay, 'className', 'className', true);
    trap(sprite.style, 'backgroundImage', 'sprite');
    trap(bg.style, 'backgroundImage', 'bg');

    opened.controller.invokeAction('next');
    opened.controller.invokeAction('next');
    opened.controller.invokeAction('prev');
    assert.equal(host.getState().activeReader.index, 1);
    // 同一场景同一立绘翻页：最终值不变就不应重写，避免反复样式失效与大图地址重解析
    assert.deepEqual(writes, { className: 0, sprite: 0, bg: 0 });
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), true);
    host.destroy();
});

test('gate:simulation:page-turn-reuses-live-visible-text-until-host-rewrites-it', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '第一段。\n\n第二段。\n\n第三段。';
    let clones = 0;
    const mesText = {
        textContent: raw,
        cloneNode() {
            clones += 1;
            return { textContent: mesText.textContent, querySelectorAll: () => [] };
        },
    };
    const element = {
        get textContent() { return mesText.textContent; },
        querySelector: (selector) => (selector === '.mes_text' ? mesText : null),
    };
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: { statusHud: { enabled: false } } }),
    });
    const opened = host.openReader({ messageId: 43, message: { id: 43, text: raw, element }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    opened.controller.invokeAction('next');
    const clonesAfterFirstTurn = clones;
    assert.ok(clonesAfterFirstTurn >= 1);
    opened.controller.invokeAction('next');
    opened.controller.invokeAction('prev');
    // 正文未变：翻页不再深克隆消息 DOM
    assert.equal(clones, clonesAfterFirstTurn);

    // 模拟 Veridis 等插件异步回写正文：下一次翻页必须读到新文本
    mesText.textContent = '第一段。\n\n第二段已替换。\n\n第三段。';
    opened.controller.invokeAction('next');
    assert.equal(clones, clonesAfterFirstTurn + 1);
    assert.ok(host.getState().activeReader.snapshot.content.segments.some((segment) => segment.includes('第二段已替换')));
    host.destroy();
});
test('gate:simulation:nsfw-veil-level-strong-applies-and-clears-on-safe-scene', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: { Room: { url: 'https://example.com/room.png', times: {} } },
                characters: { Alice: { calm: 'https://example.com/alice.png' } },
                characterAliases: { Alice: [] },
                moodGroups: [],
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: false, nsfwVeilLevel: 'strong' },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 43,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-scene:Room|night|rain|NSFW]',
                    '旁白。',
                    '[igs-scene:Room|morning|sunny]',
                    '[igs-char:Alice|calm|Morning.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), true);
    assert.equal(overlay.style['--igs-nsfw-veil-center'], '.55');
    assert.equal(overlay.style['--igs-nsfw-veil-edge'], '.88');
    // 走到下一条不带 NSFW 的场景后变量清除，回落 CSS 内默认值。
    await opened.reader.controller.invokeAction('next');
    assert.equal(overlay.classList.contains('igs-scene-nsfw'), false);
    assert.equal(overlay.style['--igs-nsfw-veil-center'], '');
    vn.destroy();
});


test('gate:simulation:status-hud-location-scale-lands-on-dom', async () => {
    for (const [size, expected] of [['small', '1.2'], ['medium', '1.45'], ['large', '1.7']]) {
        const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
        const storage = createMemoryStorage({
            igs_bridge_config: JSON.stringify({
                sceneAssets: { enabled: true, promptRule: '规则', scenes: { Room: { url: 'https://example.com/room.png', times: {} } }, characters: {}, characterAliases: {}, moodGroups: [] },
            }),
        });
        storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
            statusHud: { enabled: true, size, showLocation: true },
        }));
        const vn = bootstrapIGS({
            global: { document, localStorage: storage },
            autoAttachMagicWand: false,
            hostAdapter: {
                getCurrentMessage: async () => ({
                    id: 42,
                    text: ['<now_plot>', '<content>', '[igs-scene:Room|night|rain]', '旁白。', '</content>', '</now_plot>'].join('\n'),
                }),
                typeAndSend: async () => ({ ok: true }),
            },
        });
        await vn.openLatestAvailable('pc');
        const opened = vn.getState().igsUi.activeReader;
        assert.equal(String(opened.snapshot._statusHudLocationScale), expected, `size=${size}`);
        vn.destroy();
    }
});

test('gate:simulation:scene-and-character-aliases-reuse-original-assets-and-layout', async () => {
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: { '旧城': { url: 'https://example.com/old-city.png', words: ['古城'], times: {} } },
                characters: { '爱丽丝': { '平和': 'https://example.com/alice.png' } },
                characterAliases: { '爱丽丝': ['爱丽'] },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        spriteLayouts: { 'pc::爱丽丝::平和': { posX: 14, posY: 78, scale: 126 } },
    }));
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 8,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-scene:古城|下午|晴天]',
                    '[igs-char:爱丽|平和|我们该走了。]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const snapshot = opened.reader.snapshot;
    assert.equal(snapshot.content.backgroundImage, 'https://example.com/old-city.png');
    assert.equal(snapshot.content.spriteImage, 'https://example.com/alice.png');
    assert.equal(snapshot.content.speaker, '爱丽');
    assert.equal(snapshot.content.spriteCharacter, '爱丽丝');
    assert.equal(snapshot.content.spriteMatch.character, '爱丽');
    assert.notEqual(snapshot.content.spriteMatch.source, 'none');
    assert.notEqual(snapshot.content.backgroundMatch.source, 'none');
    const sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(sprite.style.backgroundPosition, '14% 78%');
    assert.equal(sprite.style.backgroundSize, 'auto 126%');
    vn.destroy();
});

test('gate:simulation:mobile-sentence-paging-keeps-current-sprite-dimmed-until-next-dialogue', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sentencePaging: true,
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: {},
                characters: {
                    Alice: { calm: 'https://example.com/alice.png' },
                    Bob: { angry: 'https://example.com/bob.png' },
                },
            },
        }),
    });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 9,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-char:Alice|calm|Start.]',
                    '旁白第一句。旁白第二句。',
                    '[igs-char:Bob|angry|Now.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('mobile');
    const controller = opened.reader.controller;
    let content = vn.getState().igsUi.activeReader.snapshot.content;
    let sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(content.textType, 'dialogue');
    assert.equal(content.spriteImage, 'https://example.com/alice.png');
    assert.equal(sprite.classList.contains('igs-sprite-narration'), false);
    assert.equal(sprite.style.filter, '');
    assert.equal(sprite.style['-webkit-filter'], '');

    await controller.invokeAction('next');
    content = vn.getState().igsUi.activeReader.snapshot.content;
    sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(content.textType, 'narration');
    assert.equal(content.spriteImage, 'https://example.com/alice.png');
    assert.equal(sprite.classList.contains('igs-sprite-narration'), true);
    assert.equal(sprite.style.filter, '');

    await controller.invokeAction('next');
    content = vn.getState().igsUi.activeReader.snapshot.content;
    assert.equal(content.textType, 'narration');
    assert.equal(content.spriteImage, 'https://example.com/alice.png');

    await controller.invokeAction('next');
    content = vn.getState().igsUi.activeReader.snapshot.content;
    sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(content.textType, 'dialogue');
    assert.equal(content.speaker, 'Bob');
    assert.equal(content.spriteImage, 'https://example.com/bob.png');
    assert.equal(sprite.classList.contains('igs-sprite-narration'), false);
    assert.equal(sprite.style.filter, '');
    assert.equal(sprite.style['-webkit-filter'], '');
    vn.destroy();
});

test('gate:simulation:embedded-mobile-narration-keeps-current-sprite-dimmed', async () => {
    const document = createFakeDocument({ innerWidth: 390, innerHeight: 844 });
    const globalObject = document.defaultView;
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sentencePaging: true,
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: {},
                characters: {
                    Alice: { calm: 'https://example.com/alice.png' },
                    Bob: { angry: 'https://example.com/bob.png' },
                },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, dimSpriteOnNarration: true },
    }));
    globalObject.localStorage = storage;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const text = [
        '<now_plot>',
        '<content>',
        '[igs-char:Alice|calm|Start.]',
        '旁白第一句。旁白第二句。',
        '[igs-char:Bob|angry|Now.]',
        '</content>',
        '</now_plot>',
    ].join('\n');
    const element = createFakeMessageElement(document, { messageId: 10, textContent: text });
    chat.appendChild(element);
    const message = { id: 10, text, element };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            getMessageById: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('embedded');
    const controller = opened.reader.controller;
    let sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(sprite.classList.contains('igs-sprite-narration'), false);

    await controller.invokeAction('next');
    let content = vn.getState().igsUi.activeReader.snapshot.content;
    sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(content.textType, 'narration');
    assert.equal(content.spriteImage, 'https://example.com/alice.png');
    assert.equal(sprite.classList.contains('igs-sprite-narration'), true);
    assert.equal(sprite.style.filter, '');

    await controller.invokeAction('next');
    await controller.invokeAction('next');
    content = vn.getState().igsUi.activeReader.snapshot.content;
    sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(content.textType, 'dialogue');
    assert.equal(sprite.classList.contains('igs-sprite-narration'), false);
    assert.equal(sprite.style.filter, '');
    assert.equal(sprite.style['-webkit-filter'], '');
    vn.destroy();
});

test('gate:simulation:scene-assets-sprite-follows-bubble-speaker-across-mixed-segments', async () => {
    const timers = [];
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: {},
                characters: {
                    '小林海斗': { '喜悦': 'https://example.com/joy.png', '默认': 'https://example.com/default.png' },
                    '望月': { '默认': 'https://example.com/mochi.png' },
                },
            },
        }),
    });
    // narration, thought, narration, dialogue — reformatted tags desync the row-based
    // segmentIndex; sprite must still resolve from each bubble's own speaker.
    const message = {
        id: 7,
        text: [
            '<now_plot>',
            '<content>',
            '旁白第一段。',
            '[igs-thought:望月|无语|这家伙的晚饭？]',
            '旁白第二段。',
            '[igs-char:小林海斗|欣喜|まさか。]',
            '</content>',
            '</now_plot>',
        ].join('\n'),
    };
    const vn = bootstrapIGS({
        global: {
            localStorage: storage,
            setTimeout(cb, delay) { timers.push({ cb, delay }); return timers.length; },
            clearTimeout() {},
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    let opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.ok, true);
    // walk segments until we reach the 小林海斗 dialogue bubble
    const ctrl = opened.reader.controller;
    let snap = vn.getState().igsUi.activeReader.snapshot;
    let guard = 0;
    while (snap.content.textType !== 'dialogue' && guard < 30) {
        await ctrl.invokeAction('next');
        snap = vn.getState().igsUi.activeReader.snapshot;
        guard += 1;
    }
    assert.equal(snap.content.textType, 'dialogue');
    assert.equal(snap.content.speaker, '小林海斗');
    // mood 欣喜 reduces to 喜悦 group → joy.png
    assert.equal(snap.content.spriteImage, 'https://example.com/joy.png');

    vn.destroy();
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

test('gate:simulation:stage-cast-off-keeps-single-sprite', async () => {
    const r = await openStageCastReader({ stageCast: false, characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES });
    assert.deepEqual(r.snap.content.castSprites, []);
    assert.equal(r.castEls.length, 0);
    r.vn.destroy();
});

test('gate:simulation:stage-cast-shows-recent-speakers', async () => {
    const pc = await openStageCastReader({ mode: 'pc', characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES });
    assert.equal(pc.snap.content.speaker, 'Cara');
    assert.deepEqual(pc.snap.content.castSprites.map((m) => m.character).sort(), ['Alice', 'Bob']);
    assert.equal(pc.castEls.length, 2);
    pc.vn.destroy();
    const mobile = await openStageCastReader({ mode: 'mobile', characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES });
    assert.equal(mobile.castEls.length, 1);
    mobile.vn.destroy();
});

test('gate:simulation:sprite-enhance-default-off-and-cast-filters', async () => {
    const style = getOriginalReaderStyleText();
    assert.match(style, /#igs-sprite:not\(\.igs-sprite-editing\)[^}]*var\(--igs-sprite-enhance,\)/);
    assert.match(style, /igs-mode-embedded #igs-sprite\.igs-sprite-narration[^}]*var\(--igs-sprite-enhance,\)/);
    assert.match(style, /-webkit-filter:[^}]*var\(--igs-sprite-enhance,\)/);
    const off = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES });
    try {
        const sprite = off.overlay.querySelector('#igs-sprite');
        assert.equal(sprite.style['--igs-sprite-enhance'] || '', '');
        assert.ok(off.castEls.length > 0);
        assert.ok(off.castEls.every((el) => !String(el.style.filter).includes('drop-shadow(')));
    } finally { off.vn.destroy(); }

    const shadow = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES,
        spriteEnhance: { enabled: true, mode: 'shadow', color: '#123456', strength: 10, size: 1.6 } });
    try {
        const expected = 'drop-shadow(0 2px 4px rgba(18,52,86,0.1))';
        assert.equal(shadow.overlay.querySelector('#igs-sprite').style['--igs-sprite-enhance'], expected);
        assert.ok(shadow.castEls.length > 0);
        assert.ok(shadow.castEls.every((el) => el.style.filter.includes(expected) && el.style.filter.includes('brightness(')));
        assert.ok(shadow.castEls.every((el) => el.style['-webkit-filter'] === el.style.filter));
        assert.equal((await shadow.ctrl.invokeAction('sprite-edit')).ok, true);
        const editBar = shadow.overlay.querySelector('#igs-sprite-edit-bar');
        assert.ok(editBar, '多人槽位编辑入口已打开');
        assert.equal(shadow.overlay.querySelector('#igs-sprite').style['--igs-sprite-enhance'] || '', '');
        assert.ok(shadow.castEls.every((el) => !el.style.filter.includes(expected) && el.style.filter.includes('brightness(')));
        assert.ok(shadow.castEls.every((el) => el.style['-webkit-filter'] === el.style.filter));
        editBar.dispatchEvent({ type: 'click', target: { closest: () => ({ getAttribute: () => 'cancel' }) } });
        assert.equal(shadow.overlay.querySelector('#igs-sprite').style['--igs-sprite-enhance'], expected);
        assert.ok(shadow.castEls.every((el) => el.style.filter.includes(expected)));
    } finally { shadow.vn.destroy(); }

    const single = await openStageCastReader({ stageCast: false, characters: STAGE_CAST_CHARACTERS,
        lines: ['[igs-char:Alice|默认|Hi.]'], spriteEnhance: { enabled: true, mode: 'shadow' } });
    try {
        const sprite = single.overlay.querySelector('#igs-sprite');
        const filter = sprite.style['--igs-sprite-enhance'];
        assert.ok(filter && filter.includes('drop-shadow('));
        assert.equal((await single.ctrl.invokeAction('sprite-edit')).ok, true);
        assert.ok(single.overlay.querySelector('#igs-sprite-edit-bar'));
        assert.equal(sprite.style['--igs-sprite-enhance'] || '', '');
        const bar = single.overlay.querySelector('#igs-sprite-edit-bar');
        bar.dispatchEvent({ type: 'click', target: { closest: () => ({ getAttribute: () => 'cancel' }) } });
        assert.equal(sprite.style['--igs-sprite-enhance'], filter);
    } finally { single.vn.destroy(); }

    const outline = await openStageCastReader({ mode: 'mobile', characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES,
        spriteEnhance: { enabled: true, mode: 'outline', color: '#abcdef', strength: 20, size: 0.8 } });
    try {
        const filter = outline.overlay.querySelector('#igs-sprite').style['--igs-sprite-enhance'];
        assert.equal((filter.match(/drop-shadow\(/g) || []).length, 4);
        assert.ok(filter.includes('rgba(171,205,239,0.2)'));
        assert.ok(outline.castEls.every((el) => el.style.filter.includes(filter)));
    } finally { outline.vn.destroy(); }

    const noImage = await openStageCastReader({ stageCast: false, characters: { Alice: {} },
        lines: ['[igs-char:Alice|默认|Hi.]'], spriteEnhance: { enabled: true } });
    try {
        assert.equal(noImage.overlay.querySelector('#igs-sprite').style['--igs-sprite-enhance'] || '', '');
        assert.equal(noImage.castEls.length, 0);
    } finally { noImage.vn.destroy(); }

    const disabledAssets = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES,
        sceneAssetsEnabled: false, spriteEnhance: { enabled: true } });
    try {
        assert.equal(disabledAssets.overlay.querySelector('#igs-sprite').style['--igs-sprite-enhance'] || '', '');
        assert.ok(disabledAssets.castEls.every((el) => !String(el.style.filter).includes('drop-shadow(')));
    } finally { disabledAssets.vn.destroy(); }
});

test('gate:simulation:stage-cast-drops-members-without-image', async () => {
    const characters = { Alice: { 默认: 'https://example.com/alice.png' }, Bob: {}, Cara: { 默认: 'https://example.com/cara.png' } };
    const r = await openStageCastReader({ characters, lines: STAGE_CAST_LINES });
    assert.deepEqual(r.snap.content.castSprites.map((m) => m.character), ['Alice']);
    r.vn.destroy();
});

test('gate:simulation:stage-cast-collapses-on-nsfw', async () => {
    const lines = ['[igs-scene:Room|night|clear|NSFW]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]'];
    const r = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: { statusHud: { enabled: true, showSpriteOnNsfw: false } } });
    assert.deepEqual(r.snap.content.castSprites, []);
    assert.equal(r.castEls.length, 0);
    r.vn.destroy();
});

const ROMANCE_DUO_SETTINGS = { stageCast: { enabled: true, romanceDuo: true }, romanceFx: { enabled: true } };
const romanceCastLines = (tag) => ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', tag, '[igs-char:Bob|默认|Yo.]', '[igs-char:Cara|默认|Hey.]'];

test('gate:simulation:stage-cast-romance-recede-keeps-cast', async () => {
    const r = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: romanceCastLines('[igs-fx:romance|暧昧]'), readerSettings: ROMANCE_DUO_SETTINGS });
    assert.equal(r.snap.content.speaker, 'Cara');
    assert.equal(r.castEls.length, 2);
    assert.equal(r.overlay.querySelector('#igs-stage-motion').getAttribute('data-igs-cast-romance'), 'recede');
    assert.ok(r.castEls.every((el) => !el.hasAttribute('data-igs-cast-focus')));
    r.vn.destroy();
});

test('gate:simulation:stage-cast-romance-rival-pins-and-lights-target', async () => {
    const r = await openStageCastReader({ mode: 'mobile', characters: STAGE_CAST_CHARACTERS, lines: romanceCastLines('[igs-fx:romance|暧昧|Alice]'), readerSettings: ROMANCE_DUO_SETTINGS });
    assert.equal(r.snap.content.speaker, 'Cara');
    assert.equal(r.castEls.length, 1);
    assert.equal(r.castEls[0].getAttribute('data-igs-cast-char'), 'Alice');
    assert.equal(r.castEls[0].getAttribute('data-igs-cast-focus'), '1');
    assert.equal(r.overlay.querySelector('#igs-stage-motion').getAttribute('data-igs-cast-romance'), 'rival');
    r.vn.destroy();
});

test('gate:simulation:stage-cast-romance-recede-lite-on-mobile', async () => {
    const r = await openStageCastReader({ mode: 'mobile', characters: STAGE_CAST_CHARACTERS, lines: romanceCastLines('[igs-fx:romance|暧昧]'), readerSettings: ROMANCE_DUO_SETTINGS });
    assert.equal(r.castEls.length, 1);
    assert.equal(r.overlay.querySelector('#igs-stage-motion').getAttribute('data-igs-cast-romance'), 'recede-lite');
    r.vn.destroy();
});

test('gate:simulation:stage-cast-romance-duo-off-collapses', async () => {
    const r = await openStageCastReader({
        characters: STAGE_CAST_CHARACTERS,
        lines: romanceCastLines('[igs-fx:romance|暧昧|Alice]'),
        readerSettings: { stageCast: { enabled: true }, romanceFx: { enabled: true } },
    });
    assert.equal(r.castEls.length, 0);
    assert.ok(!r.overlay.querySelector('#igs-stage-motion').hasAttribute('data-igs-cast-romance'));
    r.vn.destroy();
});
const CAST_ALIVE_SETTINGS = { stageCast: { enabled: true }, spriteMotion: { enabled: true } };
const castStyleOf = (el, key) => String((el && el.style && (typeof el.style.getPropertyValue === 'function' ? el.style.getPropertyValue(key) : el.style[key])) || '');
const castElOf = (r, name) => r.castEls.find((el) => el.getAttribute('data-igs-cast-char') === name);

test('gate:simulation:stage-cast-alive-breathe-marks-overlay-and-phase', async () => {
    const r = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES, readerSettings: CAST_ALIVE_SETTINGS });
    assert.equal(r.castEls.length, 2);
    assert.ok(r.overlay.hasAttribute('data-igs-cast-breathe'));
    for (const el of r.castEls) {
        assert.match(castStyleOf(el, '--igs-cast-breathe'), /^\d+(\.\d+)?s$/);
        assert.match(castStyleOf(el, '--igs-cast-delay'), /^\d+(\.\d+)?s$/);
        assert.match(castStyleOf(el, '--igs-cast-origin-x'), /^\d+(\.\d+)?%$/);
    }
    r.vn.destroy();
    const off = await openStageCastReader({
        characters: STAGE_CAST_CHARACTERS,
        lines: STAGE_CAST_LINES,
        readerSettings: { stageCast: { enabled: true }, spriteMotion: { enabled: true, castBreathing: false } },
    });
    assert.ok(!off.overlay.hasAttribute('data-igs-cast-breathe'));
    off.vn.destroy();
});

test('gate:simulation:stage-cast-alive-lean-flips-with-speaker-side', async () => {
    // 说话人 Cara 在右槽：中间的 Bob 往右倾。
    const right = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES, readerSettings: CAST_ALIVE_SETTINGS });
    assert.equal(right.snap.content.speaker, 'Cara');
    assert.equal(castStyleOf(castElOf(right, 'Bob'), 'rotate'), '0.8deg');
    right.vn.destroy();
    // 说话人 Alice 在左槽：中间的 Bob 转向左。
    const left = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: [...STAGE_CAST_LINES, '[igs-char:Alice|默认|Again.]'], readerSettings: CAST_ALIVE_SETTINGS });
    assert.equal(left.snap.content.speaker, 'Alice');
    assert.equal(castStyleOf(castElOf(left, 'Bob'), 'rotate'), '-0.8deg');
    left.vn.destroy();
    // 开关关闭：不倾。
    const flat = await openStageCastReader({
        characters: STAGE_CAST_CHARACTERS,
        lines: STAGE_CAST_LINES,
        readerSettings: { stageCast: { enabled: true }, spriteMotion: { enabled: true, castLean: false } },
    });
    assert.equal(castStyleOf(castElOf(flat, 'Bob'), 'rotate'), '');
    flat.vn.destroy();
});

test('gate:simulation:stage-cast-alive-off-without-sprite-motion', async () => {
    const r = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines: STAGE_CAST_LINES });
    assert.equal(r.castEls.length, 2);
    assert.ok(!r.overlay.hasAttribute('data-igs-cast-breathe'));
    assert.ok(r.castEls.every((el) => castStyleOf(el, 'rotate') === ''));
    r.vn.destroy();
});

const CAST_REACT_SETTINGS = { stageCast: { enabled: true, castReact: true } };
const CAST_CALLED_FILTER = 'brightness(0.86) saturate(0.9)';

test('gate:simulation:stage-cast-react-tag-reaches-snapshot-and-called-lights', async () => {
    const lines = ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-fx:react|Bob|害羞]', '[igs-char:Cara|默认|Alice, look.]'];
    const r = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: CAST_REACT_SETTINGS });
    assert.equal(r.snap.content.speaker, 'Cara');
    assert.deepEqual(r.snap.content.fx.reacts, [{ target: 'Bob', emotion: '害羞' }]);
    const alice = castElOf(r, 'Alice');
    const bob = castElOf(r, 'Bob');
    assert.ok(alice && bob);
    assert.equal(String(alice.style.filter || ''), CAST_CALLED_FILTER);
    assert.notEqual(String(bob.style.filter || ''), CAST_CALLED_FILTER);
    r.vn.destroy();
});

test('gate:simulation:stage-cast-react-off-keeps-dim', async () => {
    const lines = ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-char:Cara|默认|Alice, look.]'];
    const r = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: { stageCast: { enabled: true } } });
    assert.equal(r.castEls.length, 2);
    assert.ok(r.castEls.every((el) => String(el.style.filter || '') !== CAST_CALLED_FILTER));
    r.vn.destroy();
});

const CAST_STAGE_SETTINGS = { stageCast: { enabled: true, castStage: true } };
const castPosXOf = (el) => parseFloat(String((el && el.style && el.style.backgroundPosition) || '').split(/\s+/)[0]);

test('gate:simulation:stage-cast-pose-turn-flips-cast', async () => {
    const lines = ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-fx:stage|背对|Bob]', '[igs-char:Cara|默认|Hey.]'];
    const on = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: CAST_STAGE_SETTINGS });
    assert.equal(on.snap.content.speaker, 'Cara');
    assert.equal(castElOf(on, 'Bob').getAttribute('data-igs-cast-flip'), '1');
    assert.equal(castElOf(on, 'Alice').getAttribute('data-igs-cast-flip'), null);
    on.vn.destroy();
    const off = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: { stageCast: { enabled: true } } });
    assert.equal(castElOf(off, 'Bob').getAttribute('data-igs-cast-flip'), null);
    off.vn.destroy();
});

test('gate:simulation:stage-cast-pose-leave-then-return', async () => {
    const gone = await openStageCastReader({
        characters: STAGE_CAST_CHARACTERS,
        lines: ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-fx:stage|离开|Bob]', '[igs-char:Cara|默认|Hey.]'],
        readerSettings: CAST_STAGE_SETTINGS,
    });
    assert.deepEqual(gone.castEls.map((el) => el.getAttribute('data-igs-cast-char')), ['Alice']);
    gone.vn.destroy();
    const back = await openStageCastReader({
        characters: STAGE_CAST_CHARACTERS,
        lines: ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-fx:stage|离开|Bob]', '[igs-char:Bob|默认|Back.]', '[igs-char:Cara|默认|Hey.]'],
        readerSettings: CAST_STAGE_SETTINGS,
    });
    assert.ok(castElOf(back, 'Bob'));
    back.vn.destroy();
});

test('gate:simulation:stage-cast-pose-near-closes-gap', async () => {
    const lines = ['[igs-scene:Room|day|clear]', '[igs-char:Alice|默认|Hi.]', '[igs-char:Bob|默认|Yo.]', '[igs-fx:stage|靠近|Alice|Bob]', '[igs-char:Cara|默认|Hey.]'];
    const gap = (r) => castPosXOf(castElOf(r, 'Bob')) - castPosXOf(castElOf(r, 'Alice'));
    const off = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: { stageCast: { enabled: true } } });
    const offGap = gap(off);
    off.vn.destroy();
    const on = await openStageCastReader({ characters: STAGE_CAST_CHARACTERS, lines, readerSettings: CAST_STAGE_SETTINGS });
    const onGap = gap(on);
    on.vn.destroy();
    assert.ok(Number.isFinite(offGap) && Number.isFinite(onGap), `${offGap} ${onGap}`);
    assert.ok(onGap < offGap, `${onGap} < ${offGap}`);
});

test('gate:simulation:thought-theme-applies-thought-style-and-speaker-divider-visible', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: 'rule',
                scenes: {},
                characters: {
                    Hero: {
                        calm: 'https://example.com/hero-calm.png',
                        tense: 'https://example.com/hero-tense.png',
                    },
                },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.2',
        vnTheme: {
            preset: 'custom',
            nameColor: '#ffffff',
            nameFont: 'Arial,sans-serif',
            textColor: '#00ff00',
            textFont: 'Georgia,serif',
            thoughtColor: '#0000ff',
            thoughtFont: 'Courier New,monospace',
            narrationColor: '#cccccc',
            narrationFont: 'Times New Roman,serif',
            dividerSymbol: 'gradient',
            dividerColor: '#ff00ff',
        },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 1,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-char:Hero|calm|Hello.]',
                    '[igs-thought:Hero|tense|Think.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    let textEl = overlay.querySelector('#igs-text');
    let speakerEl = overlay.querySelector('#igs-speaker');
    let dividerEl = overlay.querySelector('#igs-divider');
    let dialogEl = overlay.querySelector('#igs-dialog');

    assert.equal(opened.reader.snapshot.content.textType, 'dialogue');
    assert.equal(speakerEl.style.display, 'block');
    assert.equal(dialogEl.style.paddingTop, '');
    assert.equal(dividerEl.style.display, 'block');
    assert.equal(textEl.style.color, '#00ff00');
    assert.equal(textEl.style.fontFamily, 'Georgia,serif');

    await opened.reader.controller.invokeAction('next');
    const thoughtSnapshot = vn.getState().igsUi.activeReader.snapshot;
    textEl = document.getElementById('igs-overlay').querySelector('#igs-text');
    speakerEl = document.getElementById('igs-overlay').querySelector('#igs-speaker');
    dividerEl = document.getElementById('igs-overlay').querySelector('#igs-divider');
    dialogEl = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(thoughtSnapshot.content.textType, 'thought');
    assert.equal(thoughtSnapshot.content.speaker, 'Hero');
    assert.equal(speakerEl.style.display, 'block');
    assert.equal(dialogEl.style.paddingTop, '');
    assert.equal(dividerEl.style.display, 'block');
    assert.equal(textEl.style.color, '#0000ff');
    assert.equal(textEl.style.fontFamily, 'Courier New,monospace');

    vn.destroy();
});

test('gate:simulation:default-dialog-adds-five-pixels-only-for-nameless-narration', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: createMemoryStorage() },
        autoAttachMagicWand: false,
        config: {
            sceneAssets: {
                enabled: true,
                promptRule: 'rule',
                scenes: {},
                characters: { Hero: { default: '' } },
                characterAliases: { Hero: [] },
                moodGroups: [],
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 1,
                text: [
                    '<now_plot>',
                    '<content>',
                    '无姓名旁白。',
                    '[igs-char:Hero|calm|有姓名对白。]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    let dialog = document.getElementById('igs-dialog');
    assert.equal(opened.reader.snapshot.content.speaker, '');
    assert.equal(dialog.getAttribute('data-igs-narration'), '1');
    await opened.reader.controller.invokeAction('next');
    dialog = document.getElementById('igs-dialog');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.speaker, 'Hero');
    assert.equal(dialog.getAttribute('data-igs-narration'), null);
    vn.destroy();
});

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
        assert.equal(savedStorage._v, '0.5.6');
        assert.equal(Object.hasOwn(savedStorage, 'emptyBackgroundColor'), false);
        assert.equal(savedStorage.glassBackdropFilter, true);
    } finally {
        vn.destroy();
    }
});

test('gate:illustration:image-settings-render-and-persist-roundtrip', () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = vn.openSettings({ tab: 'image', mode: 'pc' });
        assert.equal(opened.ok, true);
        const initial = opened.controller.getSnapshot();
        const auto = initial.draft.bridge.autoIllustration;
        assert.equal(auto.nsfwEnabled, false);
        assert.equal(auto.interludeEnabled, false);
        assert.equal(auto.interludeMaxCount, 1);
        assert.equal(auto.assets.maxPerFloor, 2);
        assert.equal(auto.llm.source, 'tavern');
        assert.equal(auto.nai.transport, 'direct');
        assert.equal(initial.imageSubTab, 'source');
        assert.match(initial.html, /data-image-subtab="source"[^>]*aria-selected="true"/);
        assert.match(initial.html, /data-segment-path="bridge\.imageApi\.mode" data-segment-value="nai"/);
        assert.match(initial.html, /data-segment-value="dbgen"[^>]*>[\s\S]*?数据库生图插件/);
        assert.match(initial.html, /data-segment-value="extension"[^>]*>[\s\S]*?智绘姬/);
        assert.match(initial.html, /data-path="bridge\.autoIllustration\.nai\.scale"[^>]*step="any"/);
        assert.doesNotMatch(initial.html, /data-path="bridge\.imageApi\.apiKey"/, '不再有第二套 NAI Key');
        assert.doesNotMatch(initial.html, /data-switch="bridge\.autoIllustration\.nsfwEnabled"/);
        const content = opened.controller.switchImageSubTab('auto').snapshot;
        assert.equal(content.imageSubTab, 'auto');
        assert.match(content.html, /data-image-feature="nsfw" hidden/, '分类页只露 NSFW 开关，张数在开启后才显示');
        assert.match(content.html, /data-switch="bridge.autoIllustration.nsfwEnabled"/);
        assert.match(content.html, /data-switch="bridge.autoIllustration.interludeEnabled"/);
        assert.doesNotMatch(content.html, /data-image-feature="llm"[\s>]/, '副 LLM 单独成页，不在分类里');
        assert.match(content.html, /data-image-feature="llm-warn" hidden/, '沿用酒馆 API 时不提醒');
        // 分类页自带分区画师串面板，旧「提示词」子页已并入。
        assert.match(content.html, /data-switch="bridge.autoIllustration.nai.artistByKind.enabled"/);
        const llmPane = opened.controller.switchImageSubTab('llm').snapshot;
        assert.equal(llmPane.imageSubTab, 'llm');
        assert.match(llmPane.html, /data-image-feature="llm"(?![^>]*\shidden)/);
        assert.match(llmPane.html, /data-path="bridge\.autoIllustration\.llm\.endpoint"[^>]*disabled/);
        assert.equal(opened.controller.switchImageSubTab('prompts').snapshot.imageSubTab, 'auto', '旧的「提示词」子页并入分类');
        const rendered = initial.html + content.html + llmPane.html;
        for (const path of initial.activeContract.requiredPaths.filter((item) => item.startsWith('bridge.autoIllustration.'))) {
            assert.ok(rendered.includes(`data-path="${path}"`) || rendered.includes(`data-switch="${path}"`), `Missing image field: ${path}`);
        }
        assert.equal(opened.controller.switchImageSubTab('other').snapshot.imageSubTab, 'source', '旧的「其他生图」子页并入图像来源');
        opened.controller.switchImageSubTab('auto');
        assert.equal(opened.controller.toggle('bridge.autoIllustration.nsfwEnabled').ok, true);
        assert.match(opened.controller.getSnapshot().html, /data-image-feature="nsfw"(?![^>]*\shidden)/);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.nsfwCount', '2').ok, true);
        assert.equal(opened.controller.toggle('bridge.autoIllustration.interludeEnabled').ok, true);
        assert.match(opened.controller.getSnapshot().html, /data-image-feature="interlude"(?![^>]*\shidden)/);
        assert.ok(/data-path="bridge\.autoIllustration\.interludeMaxCount"[^>]*max="16"/.test(opened.controller.getSnapshot().html));
        assert.ok(/data-path="bridge\.autoIllustration\.assets\.maxPerFloor"[^>]*max="16"/.test(opened.controller.getSnapshot().html));
        assert.equal(opened.controller.setValue('bridge.autoIllustration.interludeMaxCount', '16').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.assets.maxPerFloor', '16').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.interludeProbability', '45').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.llm.source', 'openai').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.llm.endpoint', 'https://example.com/v1').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.llm.apiKey', 'test-llm-secret').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.nai.apiKey', 'test-nai-secret').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.nai.scale', '5.5').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.nai.transport', 'st-proxy').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.assets.templates.background', '{tags}, custom scene').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.assets.templates.backgroundNegative', 'no people').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.assets.templates.sprite', '{tags}, custom character').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.assets.templates.spriteNegative', 'no crowd').ok, true);
        assert.equal(opened.controller.setValue('bridge.autoIllustration.assets.templates.nsfwExtra', 'adult scene').ok, true);
        assert.equal(opened.controller.getSnapshot().draft.bridge.autoIllustration.nsfwCount, 2);
        assert.equal(Boolean(vn.getUnifiedSettings({ mode: 'pc' }).bridge.autoIllustration?.nsfwEnabled), false);
        assert.equal(opened.controller.close().ok, true);
        const saved = vn.getUnifiedSettings({ mode: 'pc' }).bridge.autoIllustration;
        assert.equal(saved.nsfwEnabled, true);
        assert.equal(saved.assets.templates.background, '{tags}, custom scene');
        assert.equal(saved.assets.templates.backgroundNegative, 'no people');
        assert.equal(saved.assets.templates.sprite, '{tags}, custom character');
        assert.equal(saved.assets.templates.spriteNegative, 'no crowd');
        assert.equal(saved.assets.templates.nsfwExtra, 'adult scene');
        assert.equal(saved.nsfwCount, 2);
        assert.equal(saved.interludeEnabled, true);
        assert.equal(saved.interludeMaxCount, 16);
        assert.equal(saved.assets.maxPerFloor, 16);
        assert.equal(saved.interludeProbability, 45);
        assert.equal(saved.llm.source, 'openai');
        assert.equal(saved.llm.endpoint, 'https://example.com/v1');
        assert.ok(saved.llm.apiKey === 'test-llm-secret');
        assert.ok(saved.nai.apiKey === 'test-nai-secret');
        assert.equal(saved.nai.scale, 5.5);
        assert.equal(saved.nai.transport, 'st-proxy');
        const reopenedController = vn.openSettings({ tab: 'image', mode: 'pc' }).controller;
        reopenedController.switchImageSubTab('llm');
        const reopened = reopenedController.getSnapshot();
        assert.equal(reopened.draft.bridge.autoIllustration.nsfwCount, 2);
        assert.equal(reopened.draft.bridge.autoIllustration.interludeMaxCount, 16);
        assert.equal(reopened.draft.bridge.autoIllustration.assets.maxPerFloor, 16);
        assert.equal(reopened.draft.bridge.autoIllustration.nai.scale, 5.5);
        assert.ok(/data-path="bridge\.autoIllustration\.llm\.endpoint"[^>]*value="https:\/\/example\.com\/v1"/.test(reopened.html));
        assert.ok(/data-path="bridge\.autoIllustration\.llm\.apiKey"[^>]*type="password"/.test(reopened.html));
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:auto-illustration-llm-fetch-models-and-select', async () => {
    const calls = [];
    const vn = bootstrapIGS({
        global: { fetch: async (url, init) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ data: [{ id: 'planner-a' }, { id: 'planner-b' }] }), { status: 200 });
        } },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    try {
        const controller = vn.openSettings({ tab: 'image', mode: 'pc' }).controller;
        controller.switchImageSubTab('llm');
        controller.toggle('bridge.autoIllustration.nsfwEnabled');
        controller.setValue('bridge.autoIllustration.llm.source', 'openai');
        controller.setValue('bridge.autoIllustration.llm.endpoint', 'https://example.com/v1');
        controller.setValue('bridge.autoIllustration.llm.apiKey', 'fake-key');
        assert.match(controller.getSnapshot().html, /data-action="fetch-llm-models"/);
        const fetched = await controller.invoke('fetch-llm-models');
        assert.equal(fetched.ok, true);
        assert.deepEqual(calls.map(({ url }) => url), ['https://example.com/v1/models']);
        assert.equal(calls[0].init.method, 'GET');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-key');
        const snapshot = controller.getSnapshot();
        assert.match(snapshot.resultText.llmModels, /已拉取 2 个/);
        assert.match(snapshot.html, /<option value="planner-b"/);
        controller.setValue('bridge.autoIllustration.llm.model', 'planner-b');
        controller.close();
        assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).bridge.autoIllustration.llm.model, 'planner-b');
    } finally {
        vn.destroy();
    }
});


test('gate:simulation:legacy-dialog-font-migrates-to-theme-text-font', () => {
    const storage = createMemoryStorage();
    const roundedFont = '"IGS Rounded","Microsoft YaHei",sans-serif';
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        dialogFont: roundedFont,
        dialogSkin: 'default',
    }));
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = vn.openSettings({ tab: 'reader', mode: 'pc' });
        const settings = opened.controller;
        const migrated = settings.getSnapshot().draft.readerSettings;
        assert.equal(Object.hasOwn(migrated, 'dialogFont'), false);
        assert.equal(migrated.vnTheme.textFont, roundedFont);
        assert.equal(migrated.classicVnTheme.textFont, roundedFont);
        settings.setValue('readerSettings.fontSize', 19);
        assert.equal(settings.getSnapshot().draft.readerSettings.fontSize, 19);
        assert.equal(settings.close().ok, true);
        const saved = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
        assert.equal(Object.hasOwn(saved, 'dialogFont'), false);
        assert.equal(saved.vnTheme.textFont, roundedFont);
        assert.equal(saved.classicVnTheme.textFont, roundedFont);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-enter-sends-and-shift-enter-does-not', async () => {
    const latestMessage = readJson('fixtures/tavern/standard-message.json');
    const sent = [];
    const vn = bootstrapIGS({
        global: {},
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async (text) => {
                sent.push(text);
                return { ok: true };
            },
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const controller = opened.reader.controller;
    controller.setInputValue('第一行');
    const shiftResult = await controller.keydown({ key: 'Enter', shiftKey: true, value: '第一行' });
    controller.setInputValue('第二行');
    const enterResult = await controller.keydown({ key: 'Enter', shiftKey: false, value: '第二行' });

    assert.equal(shiftResult.sent, false);
    assert.equal(enterResult.sent, true);
    assert.deepEqual(sent, ['第二行']);

    vn.destroy();
});

test('gate:simulation:igs-ui-background-click-pages-forward-dialog-click-still-pages', async () => {
    const document = createFakeDocument();
    const latestMessage = {
        id: 44,
        text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。\n第三段。',
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const clickLayer = overlay.querySelector('#igs-click-layer');
    const dialog = overlay.querySelector('#igs-dialog');

    assert.equal(opened.reader.snapshot.content.progress, '1 / 3');
    // 单击对话框以外的画面推进到下一页。
    clickLayer.click();
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '2 / 3');

    // 点对话框仍照常翻页（第一下可能先放完打字机）。
    dialog.style.left = '0px';
    dialog.style.width = '200px';
    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 160 });
    if (vn.getState().igsUi.activeReader.snapshot.content.progress !== '3 / 3') dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 160 });
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '3 / 3');

    vn.destroy();
});

test('gate:simulation:right-click-hides-outside-the-dialog-only', async () => {
    const document = createFakeDocument();
    const latestMessage = {
        id: 45,
        text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。',
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const button = overlay.querySelector('button');

    assert.equal(opened.reader.snapshot.content.progress, '1 / 2');
    // 默认关：右键不收起对话框。
    assert.equal(opened.reader.snapshot.readerSettings.dblclickCgOnly, false);
    overlay.dispatchEvent({ type: 'contextmenu', target: overlay });
    assert.equal(overlay.getAttribute('data-igs-cg-only'), null);
    const enable = opened.reader.controller.openSettings('reader').controller;
    enable.setValue('readerSettings.dblclickCgOnly', true);
    assert.equal(enable.close().ok, true);
    const dialog = overlay.querySelector('#igs-dialog');
    dialog.style.left = '0px';
    dialog.style.width = '200px';

    button.dispatchEvent({ type: 'contextmenu', target: button });
    assert.equal(overlay.getAttribute('data-igs-cg-only'), null);

    const text = dialog.querySelector('#igs-text');
    dialog.dispatchEvent({ type: 'click', target: text, clientX: 160, detail: 1 });
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '2 / 2');
    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 160, detail: 2 });
    overlay.dispatchEvent({ type: 'contextmenu', target: text });
    overlay.dispatchEvent({ type: 'contextmenu', target: dialog });
    assert.equal(overlay.getAttribute('data-igs-cg-only'), null);

    overlay.dispatchEvent({ type: 'contextmenu', target: overlay });
    assert.equal(overlay.getAttribute('data-igs-cg-only'), '1');
    assert.equal(overlay.querySelector('#igs-bg').id, 'igs-bg');

    overlay.dispatchEvent({ type: 'contextmenu', target: overlay });
    assert.equal(overlay.getAttribute('data-igs-cg-only'), null);

    assert.equal(vn.getState().igsUi.activeReader.snapshot.readerSettings.dblclickCgOnly, true);
    const settings = opened.reader.controller.openSettings('reader').controller;
    settings.setValue('readerSettings.dblclickCgOnly', false);
    assert.equal(settings.close().ok, true);
    overlay.dispatchEvent({ type: 'contextmenu', target: overlay });
    assert.equal(overlay.getAttribute('data-igs-cg-only'), null);

    // 关掉之后右键不再收起。点对话框仍按左右翻页；已经是最后一页，所以停在 2/2。
    const liveDialog = overlay.querySelector('#igs-dialog');
    liveDialog.style.left = '0px';
    liveDialog.style.width = '200px';
    liveDialog.dispatchEvent({ type: 'click', target: liveDialog, clientX: 160, detail: 1 });
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '2 / 2');

    vn.destroy();
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

for (const [speed, delay] of [['fast', 1500], ['medium', 3000], ['slow', 5000]]) {
    test(`gate:simulation:auto-play:${speed}-reads-shared-settings-on-open`, async () => {
        const { host, timers, opened } = makeAutoPlayReader(undefined, {
            typewriter: { enabled: false, speed },
        });
        try {
            assert.equal(host.getState().activeReader.autoPlay.speed, speed);
            assert.equal(host.getState().activeReader.autoPlay.enabled, false);
            assert.equal(timers.size(), 0);
            await opened.controller.invokeAction('auto-play');
            await timers.advance(delay - 1);
            assert.equal(host.getState().activeReader.index, 0);
            await timers.advance(1);
            assert.equal(host.getState().activeReader.index, 1);
        } finally { host.destroy(); }
        assert.equal(timers.size(), 0);
    });
}

test('gate:simulation:auto-play-toolbar-clicks-toggle-and-stop-at-last-page', async () => {
    const { host, timers, overlay, opened, document } = makeAutoPlayReader();
    try {
        const play = overlay.querySelector('#igs-btn-auto-play');
        assert.ok(play);
        assert.ok(!overlay.querySelector('#igs-btn-auto-speed'));
        assert.equal(play.innerHTML, ORIGINAL_READER_ICONS.play);
        assert.equal(play.getAttribute('aria-pressed'), 'false');
        assert.equal(timers.size(), 0);
        opened.controller.toggleToolbar();
        const click = (button) => overlay.parentNode.dispatchEvent({ type: 'click', target: button });
        await click(play);
        assert.equal(play.getAttribute('aria-pressed'), 'true');
        assert.equal(play.innerHTML, ORIGINAL_READER_ICONS.stop);
        assert.match(play.getAttribute('aria-label'), /停止/);
        await timers.advance(2999);
        assert.equal(host.getState().activeReader.index, 0);
        await timers.advance(1);
        assert.equal(host.getState().activeReader.index, 1);
        document.dispatchEvent({ type: 'keydown', key: ' ', target: play });
        assert.equal(host.getState().activeReader.index, 1);
        await timers.advance(3000);
        assert.equal(host.getState().activeReader.index, 2);
        assert.equal(host.getState().activeReader.autoPlay.enabled, false);
        assert.equal(play.getAttribute('aria-pressed'), 'false');
        assert.equal(play.innerHTML, ORIGINAL_READER_ICONS.play);
        assert.equal(timers.size(), 0);
        assert.equal(overlay.classList.contains('igs-options-visible'), false);
        await opened.controller.invokeAction('first-page');
        await click(play);
        await timers.advance(0);
        await click(play);
        await timers.advance(10000);
        assert.equal(host.getState().activeReader.index, 0);
        assert.equal(timers.size(), 0);
        await click(play);
        assert.equal(opened.controller.close().ok, true);
        assert.equal(timers.size(), 0);
    } finally { host.destroy(); }
});

test('gate:simulation:auto-play-waits-for-typewriter-and-stage-pause-and-cleans-up', async () => {
    const { host, timers, overlay, opened } = makeAutoPlayReader();
    try {
        const text = overlay.querySelector('#igs-text');
        text.dataset = {};
        text.nodeType = 1;
        text.childNodes = [{ nodeType: 3, nodeValue: '第一段。', childNodes: [] }];
        const animation = { cancel() { this.oncancel?.(); } };
        applyTypewriterEffect(text, { enabled: true, speed: 'slow', key: 'auto-play-wait',
            reducedMotion: false, animate: () => animation });
        await opened.controller.invokeAction('auto-play');
        await timers.advance(6000);
        assert.equal(host.getState().activeReader.index, 0);
        assert.equal(text.dataset.igsTypewriter, 'running');
        animation.onfinish();
        await timers.advance(200);
        await timers.advance(1000);
        setStagePauseReason(overlay, 'panel:settings', true);
        await timers.advance(6000);
        assert.equal(host.getState().activeReader.index, 0);
        setStagePauseReason(overlay, 'panel:settings', false);
        await timers.advance(200);
        await timers.advance(2999);
        assert.equal(host.getState().activeReader.index, 0);
        await timers.advance(1);
        assert.equal(host.getState().activeReader.index, 1);
        assert.equal(opened.controller.close().ok, true);
        assert.equal(timers.size(), 0);
        await timers.advance(10000);
        assert.equal(host.getState().activeReader, null);
    } finally { host.destroy(); }
});

test('gate:simulation:auto-play-button-management-filters-removed-speed-from-old-settings', async () => {
    const { host, opened, overlay } = makeAutoPlayReader(undefined, {
        pinnedBtns: ['auto-speed', 'auto-play'], hiddenBtns: ['auto-speed', 'next'], btnOrder: ['next', 'auto-speed', 'auto-play'],
    });
    try {
        const play = overlay.querySelector('#igs-btn-auto-play');
        assert.ok(!overlay.querySelector('#igs-btn-auto-speed'));
        assert.equal(play.parentNode.id, 'igs-bar-pinned');
        assert.equal(overlay.querySelector('#igs-btn-next').style.display, 'none');
        const normalized = host.getState().activeReader.snapshot.readerSettings;
        for (const key of ['pinnedBtns', 'hiddenBtns', 'btnOrder']) {
            assert.ok(!normalized[key].includes('auto-speed'), `${key} must filter the removed speed action`);
        }
        assert.deepEqual(normalized.btnOrder.slice(0, 2), ['next', 'auto-play']);
        const settings = opened.controller.openSettings('reader').controller;
        settings.switchReaderSubTab('interface');
        const html = settings.getSnapshot().html;
        assert.ok(html.includes('自动播放'));
        assert.ok(!html.includes('auto-speed'));
        assert.ok(html.includes('toggle-toolbar-pin:auto-play'));
        assert.equal(settings.close().ok, true);
    } finally { host.destroy(); }
});

test('gate:simulation:auto-play-settings-segments-save-reopen-and-update-running-speed-with-typewriter-off', async () => {
    const { host, timers, opened, document, getSavedSettings } = makeAutoPlayReader();
    try {
        await opened.controller.invokeAction('auto-play');
        await timers.advance(1000);
        for (const [speed, delay] of [['slow', 5000], ['fast', 1500], ['medium', 3000]]) {
            const settings = opened.controller.openSettings('reader').controller;
            settings.switchReaderSubTab('performance');
            const html = settings.getSnapshot().html;
            const buttons = html.match(/<button[^>]*data-segment-path="readerSettings\.typewriter\.speed"[^>]*>[\s\S]*?<\/button>/g) || [];
            assert.equal(buttons.length, 3);
            assert.ok(html.includes('播放速度') && html.includes('自动播放与打字机共用'));
            assert.equal(settings.getSnapshot().draft.readerSettings.typewriter.enabled, false);
            assert.ok(!html.includes('readerSettings.typewriter.mode'));
            for (const [index, value] of ['fast', 'medium', 'slow'].entries()) {
                assert.ok(buttons[index].includes('igs-segmented-btn'));
                assert.ok(buttons[index].includes('igs-segmented-btn-label'));
                assert.ok(buttons[index].includes(`data-segment-value="${value}"`));
                assert.ok(buttons[index].includes('role="radio"'));
            }
            const buttonHtml = buttons.find((value) => value.includes(`data-segment-value="${speed}"`));
            const button = document.createElement('button');
            for (const [, name, value] of buttonHtml.matchAll(/([\w-]+)="([^"]*)"/g)) button.setAttribute(name, value);
            const settingsRoot = document.getElementById('igs-unified-settings').parentNode;
            settingsRoot.appendChild(button);
            await settingsRoot.dispatchEvent({ type: 'click', target: button });
            assert.equal(settings.getSnapshot().draft.readerSettings.typewriter.speed, speed);
            assert.notEqual(getSavedSettings().readerSettings.typewriter?.speed, speed);
            await timers.advance(6000);
            assert.equal(host.getState().activeReader.index, 0);
            assert.equal(settings.close().ok, true);
            assert.equal(getSavedSettings().readerSettings.typewriter.speed, speed);
            assert.equal(host.getState().activeReader.autoPlay.speed, speed);
            assert.equal(host.getState().activeReader.autoPlay.enabled, true);
            assert.equal(host.getState().activeReader.snapshot.readerSettings.typewriter.enabled, false);
            const reopened = opened.controller.openSettings('reader').controller;
            reopened.switchReaderSubTab('performance');
            assert.equal(reopened.getSnapshot().draft.readerSettings.typewriter.speed, speed);
            const selected = reopened.getSnapshot().html.match(/<button[^>]*data-segment-path="readerSettings\.typewriter\.speed"[^>]*>/g)
                .find((value) => value.includes(`data-segment-value="${speed}"`));
            assert.ok(selected.includes('is-active') && selected.includes('aria-checked="true"'));
            assert.equal(reopened.close().ok, true);
            await timers.advance(0);
            await timers.advance(delay - 1);
            assert.equal(host.getState().activeReader.index, 0);
            await timers.advance(1);
            assert.equal(host.getState().activeReader.index, 1);
            await opened.controller.invokeAction('first-page');
        }
        assert.equal(opened.controller.close().ok, true);
        assert.equal(timers.size(), 0);
        const reopened = host.openReader({ messageId: 881, raw: '第一段。\n第二段。' }, { mode: 'pc' });
        assert.equal(reopened.ok, true);
        assert.equal(host.getState().activeReader.autoPlay.speed, 'medium');
        assert.equal(host.getState().activeReader.autoPlay.enabled, false);
    } finally { host.destroy(); }
    assert.equal(timers.size(), 0);
});

test('gate:simulation:auto-play-reveals-chat-messages-before-leaving-the-page', async () => {
    const raw = '<content>\n[igs-chat:爱丽丝]\n[igs-msg:爱丽丝|在吗？]\n[igs-msg:小明|在的。]\n[igs-msg:爱丽丝|放学后见。]\n[igs-chat-end]\n她收起手机。\n</content>';
    const { host, timers, overlay, opened } = makeAutoPlayReader(raw, {
        chatShow: { enabled: true, frame: 'none', pace: 'click', sound: { enabled: false } },
    });
    try {
        assert.equal(host.getState().activeReader.snapshot.content.textType, 'chat');
        assert.equal(getChatRevealState(overlay).revealed, 1);
        await opened.controller.invokeAction('auto-play');
        await timers.advance(3000);
        assert.equal(host.getState().activeReader.index, 0);
        assert.equal(getChatRevealState(overlay).revealed, 2);
        await timers.advance(3000);
        assert.equal(host.getState().activeReader.index, 0);
        assert.equal(getChatRevealState(overlay).revealed, 3);
        await timers.advance(2999);
        assert.equal(host.getState().activeReader.index, 0);
        await timers.advance(1);
        assert.equal(host.getState().activeReader.index, 1);
        assert.equal(host.getState().activeReader.autoPlay.enabled, false);
        assert.equal(timers.size(), 0);
    } finally { host.destroy(); }
});

test('gate:simulation:typewriter-first-forward-completes-text-and-second-forward-pages', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        typewriter: { enabled: true, speed: 'slow' },
    }));
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 440,
                text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。',
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const dialog = overlay.querySelector('#igs-dialog');
    const textEl = overlay.querySelector('#igs-text');
    const textNode = { nodeType: 3, nodeValue: '第一段。', childNodes: [] };
    textEl.nodeType = 1;
    textEl.childNodes = [textNode];
    const animation = {
        cancelled: false,
        cancel() {
            this.cancelled = true;
            this.oncancel?.();
        },
    };
    applyTypewriterEffect(textEl, {
        enabled: true,
        speed: 'slow',
        key: 'host-page-1',
        reducedMotion: false,
        animate() {
            return animation;
        },
    });

    assert.equal(textNode.nodeValue, '第一段。');
    assert.equal(opened.reader.snapshot.content.progress, '1 / 2');
    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 160 });
    assert.equal(textNode.nodeValue, '第一段。');
    assert.equal(animation.cancelled, true);
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '1 / 2');
    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 160 });
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '2 / 2');
    vn.destroy();
});

test('gate:simulation:igs-ui-option-bubble-waits-for-final-page-forward-click-and-excludes-toolbar-and-input', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ optionFontSize: 20 }));
    const latestMessage = {
        id: 45,
        text: '[角色: 艾莉]\n艾莉: 最后一段。',
    };
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return {
                        sheet_options: {
                            uid: 'sheet_options',
                            name: '选项表',
                            orderNo: 1,
                            content: [
                                ['row_id', '选项'],
                                ['1', '留在广场'],
                                ['2', '前往酒店'],
                            ],
                        },
                    };
                },
            },
        },
        autoAttachMagicWand: false,
        config: {
            optionBubble: {
                enabled: true,
                position: 'top-left',
                clickAction: 'fill',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const clickLayer = overlay.querySelector('#igs-click-layer');
    const dialog = overlay.querySelector('#igs-dialog');
    const input = overlay.querySelector('#igs-input');
    const toolbar = overlay.querySelector('#igs-ctrl-bar');
    const optionBubbles = overlay.querySelector('#igs-option-bubbles');

    assert.equal(opened.reader.snapshot.content.progress, '1 / 1');
    assert.equal(optionBubbles.hasAttribute('hidden'), true);
    dialog.dispatchEvent({ type: 'click', target: input, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    toolbar.dispatchEvent({ type: 'click', target: toolbar, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), false);
    assert.equal(optionBubbles.style['--igs-option-font-size'], '20px');
    assert.equal(optionBubbles.querySelectorAll('.igs-option-bubble').length, 2);
    // 默认（未开启随文本）气泡宽度跟随对话框。
    assert.equal(optionBubbles.getAttribute('data-igs-width'), 'dialog');

    clickLayer.click();
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    vn.destroy();
});

test('gate:simulation:igs-ui-option-bubble-dice-command-resolves-through-acudice', async () => {
    const document = createFakeDocument();
    const latestMessage = { id: 7, text: '[角色: 林夏]\n林夏: 最后一段。' };
    const diceCalls = [];
    const vn = bootstrapIGS({
        global: {
            document,
            SillyTavern: { getContext: () => ({ name1: '陈屿', chat: [] }) },
            AcuDice: {
                getAttributeValue: (name, attribute) => ({ '<user>.照顾': 62, '<user>.理智': 44, '林夏.察言观色': 70 })[`${name}.${attribute}`] ?? null,
                async checkByCharacter(params) { diceCalls.push(['check', params]); return { roll: 17 }; },
                async contest(params) { diceCalls.push(['contest', params]); return { left: { roll: 38 }, right: { roll: 12 } }; },
            },
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return {
                        sheet_check: {
                            uid: 'sheet_check',
                            name: '检定建议表',
                            orderNo: 1,
                            content: [
                                ['row_id', '展示文本', '骰子命令'],
                                ['1', '把伞往她那边偏了一点', '检定 <user> 照顾 难度=困难'],
                                ['2', '假装没听出她话里的试探', '对抗 <user> 理智 vs 林夏 察言观色'],
                                ['3', '陪她走到街口', '无'],
                                ['4', '替她整理被风吹乱的围巾', '检定 <user> 厨艺'],
                            ],
                        },
                    };
                },
            },
        },
        autoAttachMagicWand: false,
        config: { optionBubble: { enabled: true, position: 'top-left', clickAction: 'fill' } },
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const optionBubbles = overlay.querySelector('#igs-option-bubbles');
    const input = overlay.querySelector('#igs-input');
    const clickBubble = async (index) => {
        optionBubbles.setAttribute('hidden', '');
        overlay.querySelector('#igs-click-layer').click();
        const bubbles = optionBubbles.querySelectorAll('.igs-option-bubble');
        assert.equal(bubbles.length, 4);
        bubbles[index].click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return input.value;
    };

    assert.equal(await clickBubble(0), '把伞往她那边偏了一点。 <meta:检定结果>\n元叙事：陈屿发起了【照顾】检定，1d100=17，需≤31，【困难成功】。\n</meta:检定结果>');
    assert.deepEqual(diceCalls[0], ['check', { name: '<user>', attribute: '照顾', diceType: '1d100', successCriteria: 'lte' }]);
    assert.match(await clickBubble(1), /结果：林夏胜出（普通成功 vs 极难成功）/);
    assert.equal(await clickBubble(2), '陪她走到街口。');
    // 属性不存在时不编造骰点，按原命令文本降级。
    assert.equal(await clickBubble(3), '替她整理被风吹乱的围巾 检定 <user> 厨艺');
    assert.match(overlay.querySelector('#igs-toast').textContent, /未找到 陈屿 的属性「厨艺」/);

    vn.destroy();
});

test('gate:simulation:igs-ui-option-bubble-width-follows-text-and-top-right-position', async () => {
    const document = createFakeDocument();
    const latestMessage = { id: 7, text: '[角色: 艾莉]\n艾莉: 最后一段。' };
    const vn = bootstrapIGS({
        global: {
            document,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return {
                        sheet_options: {
                            uid: 'sheet_options',
                            name: '选项表',
                            orderNo: 1,
                            content: [['row_id', '选项'], ['1', '甲'], ['2', '乙']],
                        },
                    };
                },
            },
        },
        autoAttachMagicWand: false,
        config: {
            optionBubble: {
                enabled: true,
                position: 'top-right',
                clickAction: 'fill',
                widthFollowsText: true,
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const optionBubbles = overlay.querySelector('#igs-option-bubbles');
    optionBubbles.setAttribute('hidden', '');
    overlay.querySelector('#igs-click-layer').click();

    assert.equal(optionBubbles.hasAttribute('hidden'), false);
    assert.equal(optionBubbles.getAttribute('data-igs-width'), 'text');
    assert.equal(optionBubbles.getAttribute('data-igs-pos'), 'top-right');

    vn.destroy();
});

test('gate:simulation:igs-ui-toolbar-dock-top-fixes-bar-and-supports-collapse', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'top', dialogSkin: 'western-classic' }));
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白一。 旁白二。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.reader.snapshot.readerSettings.toolbarDock, 'top');

    const overlay = document.getElementById('igs-overlay');
    const toolbar = overlay.querySelector('#igs-ctrl-bar');
    const collapsible = overlay.querySelector('#igs-bar-btns');

    assert.equal(overlay.classList.contains('igs-toolbar-top'), true);
    assert.equal(toolbar.getAttribute('data-igs-toolbar-dock'), 'top');
    assert.equal(vn.getState().igsUi.activeReader.toolbarCollapsed, true);
    assert.equal(collapsible.style.display, 'none');

    const toggleResult = await opened.reader.controller.invokeAction('toggle-bar');
    assert.equal(toggleResult.collapsed, false);
    assert.equal(collapsible.style.display, 'flex');

    // 顶部固定模式：设置键移入固定区、退出键固定在 ctrl-bar 直属；默认分两截，翻页键在对话框快捷栏，其余留在横滚按钮区。
    const pinned = overlay.querySelector('#igs-bar-pinned');
    const settingsBtn = overlay.querySelector('#igs-btn-settings');
    const closeBtn = toolbar.querySelector('[data-act="close"]');
    assert.equal(settingsBtn.parentNode, pinned);
    assert.equal(closeBtn.parentNode, toolbar);
    assert.equal(overlay.querySelector('#igs-btn-next').parentNode.id, 'igs-dialog-bar');
    assert.equal(overlay.querySelector('#igs-btn-first-page').parentNode, collapsible);
    assert.equal(overlay.querySelector('#igs-btn-db-panel'), null);

    vn.destroy();
});

test('gate:simulation:igs-ui-default-skin-unifies-dialog-and-toolbar-with-embedded-chrome', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'top' }));
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白一。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const toolbar = overlay.querySelector('#igs-ctrl-bar');
    const collapsible = overlay.querySelector('#igs-bar-btns');
    const pinned = overlay.querySelector('#igs-bar-pinned');
    assert.equal(opened.reader.snapshot.readerSettings.toolbarDock, 'top');
    assert.equal(overlay.classList.contains('igs-default-reader-chrome'), true);
    assert.equal(overlay.classList.contains('igs-toolbar-top'), true);
    assert.equal(toolbar.getAttribute('data-igs-toolbar-dock'), 'top');
    assert.equal(toolbar.style.transformOrigin, '');
    assert.equal(collapsible.style.gap, '2px');
    assert.equal(pinned.style.gap, '2px');

    opened.reader.controller.toggleToolbar();
    assert.equal(overlay.querySelector('#igs-btn-settings').parentNode, pinned);
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome \.igs-dialog\{[^}]*display:flex[^}]*overflow:hidden[^}]*padding:9px 18px 14px/);
    assert.doesNotMatch(css, /#igs-overlay\.igs-default-reader-chrome #igs-toolbar-layer\{inset:14px/);
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome \.igs-ctrl-bar\{[^}]*gap:1\.5px[^}]*padding:0[^}]*background:transparent[^}]*border:0[^}]*box-shadow:none/);
    assert.match(css, /#igs-overlay\.igs-toolbar-top \.igs-ctrl-bar\{[^}]*background:transparent[^}]*border:0[^}]*box-shadow:none[^}]*backdrop-filter:none/);
    assert.match(css, /#igs-overlay\.igs-toolbar-top \.igs-ctrl-bar \.igs-icon-btn svg\{width:11px;height:11px;transform:scale\(1\.2\);transform-origin:center;\}/);
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome \.igs-ctrl-bar \.igs-icon-btn svg\{width:11px;height:11px;transform:scale\(1\.2\);transform-origin:center;\}/);
    // 按钮换行成两排时工具栏层会撑满可用宽度，按钮必须保持靠右，不能退回左上角。
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome:not\(\.igs-toolbar-top\) \.igs-ctrl-bar,[^{]*\{justify-content:flex-end;\}/);
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome:not\(\.igs-toolbar-top\) #igs-bar-btns\{justify-content:flex-end;\}/);
    // 悬浮栏按钮约 8 个一行提前换行、左对齐；收纳 / 关闭与按钮第一行顶部对齐。
    assert.match(css, /#igs-bar-btns\{display:flex;align-items:center;flex-wrap:wrap;[^}]*max-width:min\(336px,calc\(100vw - 112px\)\)[^}]*justify-content:flex-start/);
    assert.match(css, /\.igs-ctrl-bar\{position:absolute;top:-50px;right:0;display:flex;align-items:flex-start;/);
    vn.destroy();
});

test('gate:simulation:igs-ui-toolbar-top-has-option-bubble-avoidance-css', () => {
    // 顶部固定模式：选项气泡须有 top 避让规则，防止向上生长被顶部工具栏遮挡/截断。
    const css = getOriginalReaderStyleText();
    assert.match(
        css,
        /#igs-overlay\.igs-toolbar-top #igs-option-bubbles\[data-igs-pos\]\{[^}]*top:calc\(var\(--igs-toolbar-h/,
    );
});

test('gate:simulation:igs-ui-toolbar-top-wraps-early-without-clipping-rows', () => {
    // 顶部固定栏按钮换行而不是横向滚动；不限高、不裁切，窄屏第三行也完整显示。
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*flex-wrap:wrap[^}]*overflow:visible/);
    assert.doesNotMatch(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*max-height/);
    assert.doesNotMatch(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*overflow-x:auto/);
    assert.doesNotMatch(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*space-evenly/);
});

test('gate:simulation:igs-ui-toolbar-dock-invalid-falls-back-to-top', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'bogus' }));
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const toolbar = overlay.querySelector('#igs-ctrl-bar');
    assert.equal(opened.reader.snapshot.readerSettings.toolbarDock, 'top');
    assert.equal(overlay.classList.contains('igs-default-reader-chrome'), true);
    assert.equal(overlay.classList.contains('igs-toolbar-top'), true);
    assert.equal(toolbar.getAttribute('data-igs-toolbar-dock'), 'top');
    assert.equal(toolbar.style.transformOrigin, '', '顶部固定不缩放');

    vn.destroy();
});

test('gate:simulation:igs-ui-gradient-veil-toolbar-dock-follows-the-setting', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'top', dialogSkin: 'gradient-veil' }));
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const toolbar = overlay.querySelector('#igs-ctrl-bar');
    assert.equal(opened.reader.snapshot.readerSettings.toolbarDock, 'top');
    assert.equal(overlay.classList.contains('igs-gradient-veil-active'), true);
    assert.equal(overlay.classList.contains('igs-default-reader-chrome'), true);
    assert.equal(overlay.classList.contains('igs-toolbar-top'), true);
    assert.equal(toolbar.getAttribute('data-igs-toolbar-dock'), 'top');

    vn.destroy();
});

test('gate:simulation:igs-ui-toolbar-actions-open-settings-toggle-and-close', async () => {
    const latestMessage = {
        id: 8,
        text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。',
    };
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const controller = opened.reader.controller;
    assert.equal(opened.reader.snapshot.content.progress, '1 / 2');
    assert.deepEqual(opened.reader.snapshot.readerSettings.pinnedBtns, []);
    assert.equal(vn.getState().igsUi.activeReader.toolbarCollapsed, true);

    const settingsResult = await controller.invokeAction('settings');
    assert.equal(settingsResult.ok, true);
    assert.equal(vn.getState().igsUi.activeSettings.tab, 'basic');

    const modeResult = settingsResult.controller.setValue('bridge.openMode', 'mobile');
    assert.equal(modeResult.ok, true);
    assert.equal(settingsResult.controller.getSnapshot().draft.bridge.openMode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.mode, 'pc');
    assert.equal(settingsResult.controller.close().ok, true);
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');

    const toggleResult = await controller.invokeAction('toggle-bar');
    assert.equal(toggleResult.ok, true);
    assert.equal(toggleResult.collapsed, false);

    const hideResult = await controller.invokeAction('hide');
    assert.equal(hideResult.ok, true);
    assert.equal(hideResult.hidden, true);

    const nextResult = await controller.invokeAction('next');
    assert.equal(nextResult.ok, true);
    assert.equal(nextResult.moved, true);
    assert.equal(nextResult.progress, '2 / 2');

    const prevTurnResult = await controller.invokeAction('prev-turn');
    const closeResult = await controller.invokeAction('close');
    const finalState = vn.getState();

    assert.equal(prevTurnResult.ok, true);
    assert.equal(prevTurnResult.reason, 'turn-switch-host-required');
    assert.equal(closeResult.ok, true);
    assert.equal(finalState.igsUi.activeReader, null);
    assert.equal(finalState.igsUi.activeSettings, null);

    vn.destroy();
});

test('gate:simulation:reader-settings-shared-across-modes', async () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白一句。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;

    settings.setValue('readerSettings.fontSize', 24);
    assert.notEqual(vn.getUnifiedSettings({ mode: 'pc' }).readerSettings.fontSize, 24);
    assert.equal(settings.close().ok, true);
    const bucket = JSON.parse(storage.getItem('igs-reader-settings-v9-default') || '{}');
    assert.equal(bucket.fontSize, 24, 'writes to default bucket');

    // same settings readable regardless of mode
    assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).readerSettings.fontSize, 24);
    assert.equal(vn.getUnifiedSettings({ mode: 'mobile' }).readerSettings.fontSize, 24);

    vn.destroy();
});

test('gate:simulation:unified-settings-merge-and-copy-isolation', () => {
    const storage = createMemoryStorage();
    storage.setItem('igs_bridge_config', JSON.stringify({ sceneAssets: { enabled: false, generated: { expressionNotes: { 角色: { 开心: { positive: 'old' } } } } }, imageApi: { marker: 'legacy' } }));
    storage.setItem('igs-reader-settings-v9-pc', JSON.stringify({ fontSize: 19 }));
    const vn = bootstrapIGS({
        global: { localStorage: storage }, autoAttachMagicWand: false,
        config: { imageApi: { marker: 'config' } },
    });
    try {
        assert.equal(vn.getUnifiedSettings().bridge.imageApi.marker, 'config', 'current config wins over historical bridge');
        const payload = {
            bridge: { sceneAssets: { enabled: true, generated: { expressionNotes: { 角色: { 开心: { positive: 'new' } } } } }, imageApi: { marker: 'payload' } },
            readerSettings: { fontSize: 24, nested: { marker: 'reader' } },
        };
        const settings = vn.openSettings({ mode: 'pc' }).controller;
        settings.setValue('bridge.sceneAssets', payload.bridge.sceneAssets, { liveInput: true });
        settings.setValue('bridge.imageApi', payload.bridge.imageApi, { liveInput: true });
        settings.setValue('readerSettings.fontSize', payload.readerSettings.fontSize, { liveInput: true });
        settings.setValue('readerSettings.nested', payload.readerSettings.nested, { liveInput: true });
        assert.equal(settings.close().ok, true);
        const saved = vn.getUnifiedSettings();
        assert.equal(saved.bridge.sceneAssets.generated.expressionNotes.角色.开心.positive, 'new');
        assert.equal(saved.bridge.imageApi.marker, 'payload');
        assert.equal(saved.readerSettings.fontSize, 24);
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-pc')).fontSize, 19, 'historical bucket survives shared-default save');
        payload.bridge.sceneAssets.generated.expressionNotes.角色.开心.positive = 'mutated input';
        payload.bridge.imageApi.marker = 'mutated input';
        payload.readerSettings.nested.marker = 'mutated input';
        saved.bridge.sceneAssets.generated.expressionNotes.角色.开心.positive = 'mutated return';
        saved.imageApi.marker = 'mutated return';
        saved.readerSettings.nested.marker = 'mutated return';
        const again = vn.getUnifiedSettings({ mode: 'mobile' });
        assert.equal(again.bridge.sceneAssets.generated.expressionNotes.角色.开心.positive, 'new');
        assert.equal(again.bridge.imageApi.marker, 'payload');
        assert.equal(again.imageApi.marker, 'payload');
        assert.equal(again.readerSettings.nested.marker, 'reader');
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-pc')).fontSize, 19);
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).nested.marker, 'reader');
        again.bridge.sceneAssets.generated.expressionNotes.角色.开心.positive = 'mutated snapshot';
        again.readerSettings.nested.marker = 'mutated snapshot';
        assert.equal(vn.getUnifiedSettings().bridge.sceneAssets.generated.expressionNotes.角色.开心.positive, 'new');
        assert.equal(vn.getUnifiedSettings().readerSettings.nested.marker, 'reader');
        assert.equal(JSON.parse(storage.getItem('igs_bridge_config')).sceneAssets.generated.expressionNotes, undefined, 'expressionNotes stripped from storage');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:storage-slim-bridge-strips-expressionNotes', () => {
    const storage = createMemoryStorage();
    const bridge = {
        sceneAssets: {
            enabled: true,
            scenes: { 教室: { url: 'room.png' } },
            generated: {
                scenes: { 工厂: { url: 'igs-gen:bg1' } },
                characters: { 冬月: { 默认: 'igs-gen:a' } },
                characterAliases: {},
                expressionNotes: { 冬月: { 喜悦: { positive: 'smile', negative: 'sad' } } },
            },
        },
        imageApi: { provider: 'test' },
    };
    const result = writeLegacyIgsSettings(storage, {
        bridge,
        displayMode: 'pc',
        readerMode: 'pc',
        readerSettings: {},
        readerSettingsByMode: { pc: {}, mobile: {}, default: {} },
    });
    assert.equal(result.ok, true);
    // 返回的 legacy 对象保持完整
    assert.equal(result.legacy.bridge.sceneAssets.generated.expressionNotes.冬月.喜悦.positive, 'smile',
        'legacy return retains expressionNotes');
    // localStorage 中的 bridge 不含 expressionNotes
    const stored = JSON.parse(storage.getItem('igs_bridge_config'));
    assert.equal(stored.sceneAssets.generated.expressionNotes, undefined,
        'expressionNotes stripped from localStorage');
    // 其他 generated 字段保留
    assert.equal(stored.sceneAssets.generated.scenes.工厂.url, 'igs-gen:bg1');
    assert.equal(stored.sceneAssets.generated.characters.冬月.默认, 'igs-gen:a');
    // 非 generated 字段不受影响
    assert.equal(stored.sceneAssets.scenes.教室.url, 'room.png');
});


test('gate:simulation:default-dialog-height-controls-floating-box', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    let pluginIframeHeight = 500;
    document.defaultView.__IGS_PLUGIN_VIEWPORT__ = {
        source: 'loader-iframe',
        initialHeight: pluginIframeHeight,
        getHeight: () => pluginIframeHeight,
    };
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '默认框高度测试。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    let settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const apply = (path, value) => {
        settings.setValue(path, value);
        assert.equal(settings.close().ok, true);
        settings = opened.reader.controller.openSettings('reader').controller;
    };
    let dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    const controls = document.getElementById('igs-overlay').querySelector('.igs-controls');

    assert.equal(dialog.style.height, 'auto');
    assert.equal(dialog.style.minHeight, '0');
    assert.equal(dialog.style.maxHeight, '464px');
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-overlay\.igs-floating \.igs-dialog\{[^}]*max-height:none/);
    assert.match(css, /#igs-overlay\.igs-floating-mobile \.igs-dialog\{[^}]*max-height:none/);
    apply('readerSettings.dialogHeight', 0.05);
    assert.equal(dialog.style.height, '25px', 'ratio uses bridged plugin iframe height, not parent window');
    assert.equal(dialog.style.maxHeight, 'none');
    assert.equal(controls.style.display, '');
    document.defaultView.innerHeight = 900;
    pluginIframeHeight = 900;
    apply('readerSettings.fontSize', 20);
    assert.equal(dialog.style.height, '25px', 'same reader keeps frozen plugin iframe ratio height');
    apply('readerSettings.dialogHeight', 0.18);
    assert.equal(dialog.style.height, '162px', 'changing ratio recalculates from current plugin iframe height');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.readerSettings.dialogHeight, 0.18);
    // 历史 px 设置继续按原像素值读取。
    apply('readerSettings.dialogHeight', 300);
    dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.style.height, '300px');
    apply('readerSettings.dialogHeight', null);
    assert.equal(dialog.style.height, 'auto');
    assert.equal(dialog.style.minHeight, '0');
    assert.equal(dialog.style.maxHeight, '464px');
    assert.equal(controls.style.display, '');
    vn.destroy();
});

test('gate:simulation:default-dialog-height-controls-all-reader-modes', async () => {
    const cases = [
        { mode: 'pc', document: createFakeDocument({ innerWidth: 1280, innerHeight: 720 }), iframeHeight: 500, expected: '75px' },
        { mode: 'mobile', document: createFakeDocument({ innerWidth: 390, innerHeight: 844 }), iframeHeight: 600, expected: '90px' },
        { mode: 'web', document: createFakeDocument({ innerWidth: 1280, innerHeight: 720 }), iframeHeight: 700, expected: '105px' },
        { mode: 'fullscreen', document: createFakeDocument({ innerWidth: 1280, innerHeight: 720 }), iframeHeight: 800, expected: '120px' },
    ];

    for (const item of cases) {
        const globalObject = item.document.defaultView;
        globalObject.__IGS_PLUGIN_VIEWPORT__ = {
            source: 'loader-iframe',
            initialHeight: item.iframeHeight,
            getHeight: () => item.iframeHeight,
        };
        if (item.mode === 'fullscreen') {
            item.document.documentElement.requestFullscreen = () => {
                item.document.fullscreenElement = item.document.documentElement;
                return Promise.resolve();
            };
        }
        const vn = bootstrapIGS({
            global: globalObject,
            autoAttachMagicWand: false,
            hostAdapter: {
                getCurrentMessage: async () => ({ id: 1, text: '五模式高度测试。' }),
                typeAndSend: async () => ({ ok: true }),
            },
        });
        const opened = await vn.openLatestAvailable(item.mode);
        const settings = opened.reader.controller.openSettings('reader').controller;
        const dialog = item.document.getElementById('igs-overlay').querySelector('#igs-dialog');

        settings.setValue('readerSettings.dialogHeight', 0.15);
        assert.equal(settings.close().ok, true);
        assert.equal(dialog.style.height, item.expected, item.mode);
        const reset = opened.reader.controller.openSettings('reader').controller;
        reset.setValue('readerSettings.dialogHeight', null);
        assert.equal(reset.close().ok, true);
        assert.equal(dialog.style.height, 'auto', item.mode);
        assert.equal(dialog.style.minHeight, '0', item.mode);
        vn.destroy();
    }

    const document = createFakeDocument({ innerWidth: 1000, innerHeight: 800 });
    const globalObject = document.defaultView;
    globalObject.__IGS_PLUGIN_VIEWPORT__ = {
        source: 'loader-iframe',
        initialHeight: 640,
        getHeight: () => 640,
    };
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const element = createFakeMessageElement(document, { messageId: 51, textContent: '内嵌模式高度测试。' });
    chat.appendChild(element);
    const message = { id: 51, text: '内嵌模式高度测试。', element };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            getMessageById: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('embedded');
    const settings = opened.reader.controller.openSettings('reader').controller;
    const dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');

    settings.setValue('readerSettings.dialogHeight', 0.12);
    assert.equal(settings.close().ok, true);
    assert.equal(dialog.style.height, '77px', 'embedded');
    const reset = opened.reader.controller.openSettings('reader').controller;
    reset.setValue('readerSettings.dialogHeight', null);
    assert.equal(reset.close().ok, true);
    assert.equal(dialog.style.height, 'auto', 'embedded');
    assert.equal(dialog.style.minHeight, '0', 'embedded');
    vn.destroy();
});

test('gate:simulation:classic-dialog-settings-roundtrip-keeps-default', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.4',
        dialogSkin: 'default',
        dialogHeight: 300,
        glassOpacity: 0.74,
        toolbarScale: 80,
        vnTheme: {
            preset: 'custom',
            narrationColor: '#abcdef',
        },
    }));
    const document = createFakeDocument({ innerWidth: 880, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '古典对话框测试旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    let dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), null);

    let settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const commit = () => {
        assert.equal(settings.close().ok, true);
        settings = opened.reader.controller.openSettings('reader').controller;
    };
    let result = settings.setValue('readerSettings.dialogSkin', 'western-classic');
    assert.equal(result.ok, true);
    settings.setValue('readerSettings.classicDialogWidthPercent', 60);
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), null);
    commit();
    dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'western-classic');
    assert.equal(dialog.style.width, 'max(280px,calc(60% - 14.4px))');
    assert.equal(dialog.style.marginLeft, 'auto');
    assert.equal(dialog.style.marginRight, 'auto');

    settings.setValue('readerSettings.classicVnTheme.narrationColor', '#123456');
    settings.setValue('readerSettings.fontSize', 22);
    commit();
    let active = vn.getState().igsUi.activeReader.snapshot;
    let overlay = document.getElementById('igs-overlay');
    let textEl = overlay.querySelector('#igs-text');
    assert.equal(active.readerSettings.fontSize, 22);
    assert.equal(active.readerSettings.dialogHeight, 300);
    assert.equal(active.readerSettings.glassOpacity, 0.74);
    assert.equal(active.readerSettings.toolbarScale, 80);
    assert.equal(textEl.style.color, '#123456');

    const roundedFont = '"IGS Rounded","Microsoft YaHei",sans-serif';
    assert.equal(Object.hasOwn(active.readerSettings, 'dialogFont'), false);
    settings.setValue('readerSettings.classicVnTheme.narrationFont', roundedFont);
    commit();
    assert.equal(textEl.style.fontFamily, roundedFont);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).classicVnTheme.narrationFont, roundedFont);
    settings.setValue('readerSettings.classicVnTheme.narrationFont', 'inherit');
    commit();
    assert.match(textEl.style.fontFamily, /Source Han Serif CN/);

    // 文字增强是开关：关着只露开关，开了才出现种类和三个参数。
    let textSettings = settings.switchReaderSubTab('text');
    assert.match(textSettings.snapshot.html, /data-segment-path="readerSettings\.dialogTextEffect" data-segment-value="outline" aria-pressed="false"/);
    assert.doesNotMatch(textSettings.snapshot.html, /readerSettings\.dialogTextEffectColor/);
    settings.setValue('readerSettings.dialogTextEffect', 'outline');
    textSettings = { snapshot: settings.getSnapshot() };
    for (const path of ['dialogTextEffect', 'dialogTextEffectColor', 'dialogTextEffectStrength', 'dialogTextEffectSize']) {
        assert.ok(textSettings.snapshot.html.includes(`readerSettings.${path}`), path);
    }
    settings.setValue('readerSettings.dialogTextEffect', 'off');
    assert.match(textSettings.snapshot.html, /igs-reader-text-effect-options[\s\S]*readerSettings\.dialogTextEffectColor[\s\S]*readerSettings\.dialogTextEffectStrength[\s\S]*readerSettings\.dialogTextEffectSize[\s\S]*<\/div>/);
    assert.match(textSettings.snapshot.html, /硬描边/);
    assert.match(textSettings.snapshot.html, /投影式/);
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffect, 'off');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffectSize, 0.8);
    assert.equal(textEl.style.textShadow || '', '');
    assert.equal(textEl.style.webkitTextStroke || '', '');
    assert.equal(textEl.style.paintOrder || '', '');
    settings.setValue('readerSettings.dialogTextEffect', 'outline');
    settings.setValue('readerSettings.dialogTextEffectColor', '#123456');
    settings.setValue('readerSettings.dialogTextEffectStrength', '10');
    settings.setValue('readerSettings.dialogTextEffectSize', '1.6');
    commit();
    assert.equal(overlay.querySelector('#igs-text').style.webkitTextStroke, '3.2px rgba(18,52,86,0.1)');
    assert.equal(overlay.querySelector('#igs-text').style.paintOrder, 'stroke fill', 'fill covers the inside half of the outline');
    assert.equal(overlay.querySelector('#igs-text').style.textShadow, 'none', 'hard outline suppresses skin shadow');
    assert.deepEqual([JSON.parse(storage.getItem('igs-reader-settings-v9-default')).dialogTextEffect, JSON.parse(storage.getItem('igs-reader-settings-v9-default')).dialogTextEffectColor, JSON.parse(storage.getItem('igs-reader-settings-v9-default')).dialogTextEffectStrength, JSON.parse(storage.getItem('igs-reader-settings-v9-default')).dialogTextEffectSize], ['outline', '#123456', 10, 1.6]);
    assert.equal(overlay.querySelector('#igs-speaker').style.webkitTextStroke || '', '');
    assert.equal(overlay.querySelector('#igs-ctrl-bar').style.textShadow || '', '');
    settings.setValue('readerSettings.dialogTextEffect', 'shadow');
    commit();
    assert.equal(overlay.querySelector('#igs-text').style.textShadow, '0 2px 4px rgba(18,52,86,0.1)');
    assert.equal(overlay.querySelector('#igs-text').style.webkitTextStroke, '');
    assert.equal(overlay.querySelector('#igs-text').style.paintOrder, '');
    settings.setValue('readerSettings.dialogTextEffect', 'off');
    commit();
    assert.equal(overlay.querySelector('#igs-text').style.textShadow, '');
    assert.equal(overlay.querySelector('#igs-text').style.webkitTextStroke, '');
    assert.equal(overlay.querySelector('#igs-text').style.paintOrder, '');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffect, 'off');
    settings.setValue('readerSettings.dialogTextEffect', 'invalid');
    settings.setValue('readerSettings.dialogTextEffectColor', 'red; background: url(bad)');
    settings.setValue('readerSettings.dialogTextEffectStrength', 999);
    settings.setValue('readerSettings.dialogTextEffectSize', 'invalid');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffect, 'off');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffectColor, '#000000');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffectStrength, 50);
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogTextEffectSize, 0.8);

    settings.setValue('readerSettings.dialogFontWeight', '700');
    commit();
    overlay = document.getElementById('igs-overlay');
    textEl = overlay.querySelector('#igs-text');
    const speakerEl = overlay.querySelector('#igs-speaker');
    assert.equal(textEl.style.fontWeight, '700');
    // No font-weight is written to surrounding controls or other reader layers.
    assert.equal(overlay.querySelector('#igs-dialog').style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-ctrl-bar').style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-input').style.fontWeight || '', '');
    settings.setValue('readerSettings.dialogFontWeight', 'null');
    commit();
    assert.equal(overlay.querySelector('#igs-text').style.fontWeight, '');

    // A page with a speaker applies the same weight only to its name and text.
    // The no-speaker page above must not invent a name when the setting changes.
    assert.equal(speakerEl.style.fontWeight || '', '');

    settings.setValue('readerSettings.dialogSkin', 'default');
    commit();
    dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), null);

    settings.setValue('readerSettings.dialogSkin', 'western-classic');
    assert.equal(settings.close().ok, true);
    const saved = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.equal(saved.dialogSkin, 'western-classic');
    assert.equal(saved.classicDialogWidthPercent, 60);
    assert.equal(saved.vnTheme.narrationColor, '#abcdef');
    assert.equal(saved.classicVnTheme.narrationColor, '#123456');
    assert.equal(saved.fontSize, 22);
    vn.destroy();

    const reopenedDocument = createFakeDocument({ innerWidth: 880, innerHeight: 720 });
    const reopened = bootstrapIGS({
        global: { document: reopenedDocument, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '古典对话框测试旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    await reopened.openLatestAvailable('pc');
    dialog = reopenedDocument.getElementById('igs-overlay').querySelector('#igs-dialog');
    textEl = reopenedDocument.getElementById('igs-overlay').querySelector('#igs-text');
    active = reopened.getState().igsUi.activeReader.snapshot;
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'western-classic');
    assert.equal(dialog.style.width, 'max(280px,calc(60% - 14.4px))');
    assert.equal(active.readerSettings.classicDialogWidthPercent, 60);
    assert.equal(textEl.style.color, '#123456');
    assert.equal(active.readerSettings.fontSize, 22);
    reopened.destroy();
});

test('gate:simulation:classic-dialog-width-percent-keeps-mobile-full-width', async () => {
    const document = createFakeDocument({ innerWidth: 420, innerHeight: 760 });
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.4',
        dialogSkin: 'western-classic',
        classicDialogWidthPercent: 60,
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '手机端宽度保持原样。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    await vn.openLatestAvailable('mobile');
    const dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.style.width, '');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.readerSettings.classicDialogWidthPercent, 60);
    vn.destroy();
});

test('gate:simulation:classic-dialog-nameplate-uses-existing-speaker', async () => {
    const document = createFakeDocument({ innerWidth: 880, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: true, promptRule: 'rule', scenes: {}, characters: {} },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.4',
        dialogSkin: 'western-classic',
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 1,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-char:Hero|calm|Hello.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const dialog = overlay.querySelector('#igs-dialog');
    const speaker = overlay.querySelector('#igs-speaker');
    const divider = overlay.querySelector('#igs-divider');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'western-classic');
    assert.equal(dialog.getAttribute('data-igs-has-speaker'), '1');
    assert.equal(speaker.textContent, 'Hero');
    assert.equal(speaker.style.display, 'block');
    assert.equal(speaker.style.color, '#2e2218');
    assert.equal(divider.style.display, 'none');
    vn.destroy();
});

test('gate:simulation:reader-settings-save-preserves-current-explicit-mode', async () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        config: { openMode: 'pc' },
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白一段。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('mobile');
    assert.equal(opened.reader.snapshot.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const result = settings.setValue('readerSettings.fontSize', 24);

    assert.equal(result.ok, true);
    assert.equal(settings.getSnapshot().draft.readerSettings.fontSize, 24);
    assert.equal(settings.close().ok, true);
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.readerSettings.fontSize, 24);

    vn.destroy();
});

test('gate:simulation:tag-filter-input-stays-draft-until-settings-close', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument();
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '标签输入测试。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const settings = opened.reader.controller.openSettings('regex').controller;
    const root = document.getElementById('igs-unified-settings').parentNode;
    let renderedHtml = root.innerHTML;
    let rebuilds = 0;
    let clears = 0;
    Object.defineProperty(root, 'innerHTML', {
        configurable: true,
        get() { return renderedHtml; },
        set(value) { if (value) rebuilds++; else clears++; renderedHtml = value; },
    });
    const originalSetItem = storage.setItem.bind(storage);
    const legacyWrites = [];
    storage.setItem = (key, value) => {
        if (key === 'igs_bridge_config' || key.startsWith('igs-reader-settings-v9-')) legacyWrites.push(key);
        originalSetItem(key, value);
    };
    const original = storage.getItem('igs_bridge_config');
    const tags = {
        textIncludeTags: 'content', textExcludeTags: 'thinking', imageIncludeTags: 'image\ntext_to_image',
    };
    for (const [name, value] of Object.entries(tags)) {
        const path = `bridge.sourceFilter.${name}`;
        assert.ok(settings.getSnapshot().html.includes(`data-path="${path}"`));
        const input = document.createElement('textarea');
        input.setAttribute('data-path', path);
        root.appendChild(input);
        document.activeElement = input;
        input.value = value;
        root.dispatchEvent({ type: 'input', target: input });
        root.dispatchEvent({ type: 'input', target: input });
        assert.ok(root.contains(input), 'typing must keep the input node mounted');
        assert.ok(document.activeElement === input, 'typing must preserve focus');
        assert.equal(settings.getSnapshot().draft.bridge.sourceFilter[name], value);
        assert.equal(storage.getItem('igs_bridge_config'), original, 'typing must not save');
    }
    assert.equal(rebuilds, 0, 'six input events do not replace the settings page');
    assert.deepEqual(legacyWrites, [], 'six input events do not write legacy settings');
    const external = settings.getSnapshot();
    external.draft.bridge.sourceFilter.textIncludeTags = 'tampered';
    assert.equal(settings.getSnapshot().draft.bridge.sourceFilter.textIncludeTags, 'content', 'public snapshots do not alias the draft');
    assert.equal(settings.setValue('readerSettings.fontSize', 21).ok, true);
    assert.equal(rebuilds, 1, 'one non-live change loads the settings page once');
    assert.equal(clears, 1, 'a full redraw first clears the existing DOM');
    assert.deepEqual(legacyWrites, [], 'non-live change still waits for close before saving');
    assert.equal(settings.close().ok, true);
    assert.equal(legacyWrites.filter((key) => key === 'igs_bridge_config').length, 1);
    assert.equal(legacyWrites.filter((key) => key === 'igs-reader-settings-v9-default').length, 1);
    const saved = JSON.parse(storage.getItem('igs_bridge_config')).sourceFilter;
    for (const [name, value] of Object.entries(tags)) assert.equal(saved[name], value);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).fontSize, 21);
    vn.destroy();
});

test('gate:simulation:large-settings-draft-typing-does-not-copy-or-persist-per-character', (t) => {
    const generatedNotes = {};
    for (let index = 0; index < 500; index++) {
        generatedNotes[`角色${index}`] = { 常态: { positive: 'prompt '.repeat(96), negative: '' } };
    }
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({ sceneAssets: { generated: { expressionNotes: generatedNotes } } }),
    });
    const document = createFakeDocument();
    const vn = bootstrapIGS({ global: { document, localStorage: storage }, autoAttachMagicWand: false });
    let originalStringify;
    try {
        const settings = vn.openSettings({ tab: 'image' }).controller;
        // 副 LLM 单独成页：先确认 Key 输入框在副 LLM 页，再回到生图内容页测模板输入。
        assert.equal(settings.switchImageSubTab('llm').ok, true);
        assert.ok(settings.getSnapshot().html.includes('data-path="bridge.autoIllustration.llm.apiKey"'));
        assert.equal(settings.switchImageSubTab('prompts').ok, true);
        const root = document.getElementById('igs-unified-settings').parentNode;
        let html = root.innerHTML;
        let rebuilds = 0;
        let clears = 0;
        Object.defineProperty(root, 'innerHTML', {
            configurable: true,
            get() { return html; },
            set(value) { if (value) rebuilds++; else clears++; html = value; },
        });
        const legacyWrites = [];
        const setItem = storage.setItem.bind(storage);
        storage.setItem = (key, value) => {
            if (key === 'igs_bridge_config' || key.startsWith('igs-reader-settings-v9-')) {
                assert.ok(storage.getItem(key) !== value, 'unchanged legacy value must not be rewritten');
                legacyWrites.push(key);
            }
            setItem(key, value);
        };
        const keyPath = 'bridge.autoIllustration.llm.apiKey';
        const promptPath = 'bridge.autoIllustration.assets.templates.background';
        assert.ok(settings.getSnapshot().html.includes(`data-path="${promptPath}"`));
        const input = document.createElement('input');
        input.setAttribute('data-path', keyPath);
        input.type = 'password';
        root.appendChild(input);
        const promptInput = document.createElement('textarea');
        promptInput.setAttribute('data-path', promptPath);
        root.appendChild(promptInput);
        document.activeElement = input;
        const secret = 'test-only-credential-'.repeat(16);
        const prompt = '{tags} ' + 'long prompt '.repeat(1200);
        let serialized = 0;
        originalStringify = JSON.stringify;
        JSON.stringify = (...args) => { serialized++; return originalStringify(...args); };
        const liveStart = performance.now();
        for (let length = 1; length <= 12; length++) {
            input.value = secret.slice(0, length);
            root.dispatchEvent({ type: 'input', target: input });
            assert.ok(root.contains(input), 'live typing keeps the same DOM input');
            assert.ok(document.activeElement === input, 'live typing retains focus');
        }
        assert.ok(settings.getSnapshot().draft.bridge.autoIllustration.llm.apiKey === secret.slice(0, 12), 'input events update the key draft before direct controller edits');
        assert.equal(settings.setValue(keyPath, secret, { liveInput: true }).ok, true);
        document.activeElement = promptInput;
        promptInput.value = prompt;
        root.dispatchEvent({ type: 'input', target: promptInput });
        assert.ok(root.contains(promptInput) && document.activeElement === promptInput, 'long prompt typing retains its input and focus');
        assert.ok(settings.getSnapshot().draft.bridge.autoIllustration.assets.templates.background === prompt, 'prompt input event updates the draft before direct controller edits');
        assert.equal(settings.setValue('bridge.sceneAssets.generated.expressionNotes.角色0.常态.positive', prompt, { liveInput: true }).ok, true);
        const liveMs = performance.now() - liveStart;
        JSON.stringify = originalStringify;
        originalStringify = null;
        assert.equal(serialized, 0, 'live edits must not stringify the large draft');
        assert.equal(rebuilds, 0, 'live edits must not rebuild the settings DOM');
        assert.equal(clears, 0);
        assert.equal(legacyWrites.length, 0, 'live edits must not write settings');
        const redrawStart = performance.now();
        assert.equal(settings.setValue('readerSettings.fontSize', 21).ok, true);
        const redrawMs = performance.now() - redrawStart;
        assert.equal(rebuilds, 1);
        assert.equal(clears, 1);
        assert.equal(legacyWrites.length, 0);
        const saveStart = performance.now();
        assert.equal(settings.close().ok, true);
        const saveMs = performance.now() - saveStart;
        const saved = JSON.parse(storage.getItem('igs_bridge_config'));
        assert.equal(saved.sceneAssets.generated.expressionNotes, undefined,
            'expressionNotes stripped from storage for size (large draft)');
        const mem = vn.getUnifiedSettings();
        assert.equal(mem.bridge.sceneAssets.generated.expressionNotes.角色0.常态.positive, prompt);
        assert.equal(mem.bridge.sceneAssets.generated.expressionNotes.角色499.常态.positive.length > 0, true);
        assert.ok(saved.autoIllustration.llm.apiKey === secret, 'latest key is saved without exposing its value in failure output');
        assert.ok(saved.autoIllustration.assets.templates.background === prompt.trim(), 'asset template is saved in its existing normalized form');
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).fontSize, 21);
        assert.equal(legacyWrites.filter((key) => key === 'igs_bridge_config').length, 1);
        assert.equal(legacyWrites.filter((key) => key === 'igs-reader-settings-v9-default').length, 1);
        assert.equal(new Set(legacyWrites).size, legacyWrites.length, 'no legacy key is written twice on close');
        const writesOnFirstClose = legacyWrites.length;
        const reopened = vn.openSettings({ tab: 'image' }).controller;
        assert.equal(reopened.close().ok, true);
        assert.equal(legacyWrites.length, writesOnFirstClose, 'closing an unchanged large draft does not rewrite storage');
        t.diagnostic(`large draft: live=${liveMs.toFixed(1)}ms redraw=${redrawMs.toFixed(1)}ms close=${saveMs.toFixed(1)}ms; live JSON=${serialized}, DOM rebuilds=${rebuilds}, legacy writes=${legacyWrites.length}`);
    } finally {
        if (originalStringify) JSON.stringify = originalStringify;
        vn.destroy();
    }
});


test('gate:simulation:open-mode-setting-still-switches-active-reader', async () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        config: { openMode: 'pc' },
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: 'plain page.' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const result = settings.setValue('bridge.openMode', 'mobile');

    assert.equal(result.ok, true);
    assert.equal(vn.getState().igsUi.activeReader.mode, 'pc');
    assert.equal(settings.close().ok, true);
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.mode, 'mobile');

    vn.destroy();
});

test('gate:simulation:sprite-layout-save-survives-mode-mismatch', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            openMode: 'pc',
            sceneAssets: {
                enabled: true,
                promptRule: 'rule',
                scenes: {},
                characters: {
                    Hero: { calm: 'https://example.com/hero-calm.png' },
                },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.2',
        spriteLayouts: {
            'mobile::Hero::calm': { posX: 12, posY: 34, scale: 156 },
            'pc::Hero::calm': { posX: 78, posY: 90, scale: 111 },
        },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 1,
                text: [
                    '<now_plot>',
                    '<content>',
                    '[igs-char:Hero|calm|Hello.]',
                    '</content>',
                    '</now_plot>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('mobile');
    let sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(opened.reader.snapshot.mode, 'mobile');
    assert.equal(sprite.style.backgroundSize, 'auto 156%');
    assert.equal(sprite.style.backgroundPosition, '12% 34%');

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.setValue('readerSettings.fontSize', 26);

    sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.mode, 'mobile');
    assert.equal(sprite.style.backgroundSize, 'auto 156%');
    assert.equal(sprite.style.backgroundPosition, '12% 34%');

    vn.destroy();
});

test('gate:simulation:sprite-height-follows-gender-character-setting-and-manual-layout', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            openMode: 'pc',
            sceneAssets: {
                enabled: true,
                promptRule: 'rule',
                scenes: {},
                characters: { Alice: { calm: 'https://example.com/alice-calm.png' } },
                characterDna: { Alice: { identity: '1girl, silver hair' } },
            },
        }),
    });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '<now_plot>\n<content>\n[igs-char:Alice|calm|Hello.]\n</content>\n</now_plot>' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const spriteSize = () => document.getElementById('igs-overlay').querySelector('#igs-sprite').style.backgroundSize;

    const opened = await vn.openLatestAvailable('pc');
    // 旧存档没有新设置：性别区分默认关，保持基准高度 100%。
    assert.equal(spriteSize(), 'auto 100%');

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.setValue('readerSettings.spriteGenderScale.enabled', true);
    settings.setValue('readerSettings.spriteGenderScale.female', 84);
    settings.close();
    assert.equal(spriteSize(), 'auto 84%');

    const reopened = (await opened.reader.controller.invokeAction('settings')).controller;
    await reopened.invoke(`char-height:${encodeURIComponent('Alice')}:128`);
    reopened.close();
    assert.equal(spriteSize(), 'auto 128%');

    // 「调整立绘」存下的位置仍然优先。
    const manual = (await opened.reader.controller.invokeAction('settings')).controller;
    manual.setValue('readerSettings.spriteLayouts', { 'pc::Alice::calm': { posX: 50, posY: 100, scale: 140 } });
    manual.close();
    assert.equal(spriteSize(), 'auto 140%');

    vn.destroy();
});

test('gate:simulation:reader-settings-saved-in-mobile-mode-read-back', async () => {
    // 回归锁：saveUnifiedSettings 曾按 readerMode 分桶存、却固定读 default 桶，
    // 导致移动端保存（含 spriteLayouts）读不回。统一到 default 桶后，
    // 在 mobile 模式打开 reader、保存设置，必须能读回。
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白一句。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('mobile');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.setValue('readerSettings.fontSize', 28);
    assert.notEqual(vn.getUnifiedSettings({ mode: 'mobile' }).readerSettings.fontSize, 28);
    assert.equal(settings.close().ok, true);

    // default 桶被写入，且任意模式读回一致
    const bucket = JSON.parse(storage.getItem('igs-reader-settings-v9-default') || '{}');
    assert.equal(bucket.fontSize, 28, 'writes to default bucket even in mobile mode');
    assert.equal(vn.getUnifiedSettings({ mode: 'mobile' }).readerSettings.fontSize, 28);
    assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).readerSettings.fontSize, 28);

    vn.destroy();
});

test('gate:simulation:legacy-mode-bucket-migrates-to-default-read', () => {
    // 回归锁：老用户数据只存在旧的 mobile/pc 分桶、default 桶为空时，
    // getUnifiedSettings 必须回退读到旧桶（含 spriteLayouts），不能因 default 为 {} 而丢设置。
    const layouts = { 'mobile::小林海斗': { posX: 30, posY: 80, scale: 120 } };
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({}));
    storage.setItem('igs-reader-settings-v9-mobile', JSON.stringify({ fontSize: 22, spriteLayouts: layouts }));
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => ({ id: 1, text: 'x' }), typeAndSend: async () => ({ ok: true }) },
    });

    const rs = vn.getUnifiedSettings({ mode: 'mobile' }).readerSettings;
    assert.equal(rs.fontSize, 22, 'falls back to mobile bucket when default empty');
    assert.deepEqual(rs.spriteLayouts, layouts);

    vn.destroy();
});

test('gate:simulation:legacy-reader-settings-render-after-open', async () => {
    const layouts = { 'mobile::Hero': { posX: 24, posY: 76, scale: 135 } };
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({}));
    storage.setItem('igs-reader-settings-v9-mobile', JSON.stringify({
        fontSize: 22,
        dialogHeight: 300,
        spriteLayouts: layouts,
    }));
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        config: { openMode: 'mobile' },
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: 'plain page.' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('mobile');

    assert.equal(opened.reader.snapshot.readerSettings.fontSize, 22);
    assert.equal(opened.reader.snapshot.readerSettings.dialogHeight, 300);
    assert.deepEqual(opened.reader.snapshot.readerSettings.spriteLayouts, layouts);

    vn.destroy();
});

test('gate:simulation:scene-sub-tab-switches-pane', async () => {
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '规则',
                scenes: { '旧城': { url: '', words: ['古城'], times: {} } },
                characters: { '爱丽丝': { '默认': '' } },
                characterAliases: { '爱丽丝': ['爱丽'] },
            },
        }),
    });
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('scene');

    // 素材页一层页签：角色 / 场景 / 待确认 / 规则。衣柜提示词在规则页。
    const rulesView = settings.switchSceneSubTab('rules');
    assert.equal(rulesView.snapshot.sceneSubTab, 'rules');
    assert.match(rulesView.snapshot.html, /data-scene-settings-pane="rules"/);
    assert.match(rulesView.snapshot.html, /data-action="save-prompt-rule"[^>]*>保存</);
    assert.match(rulesView.snapshot.html, /衣柜提示词/);
    assert.match(rulesView.snapshot.html, /data-mood-section/);
    assert.match(rulesView.snapshot.html, /data-switch="bridge\.sceneAssets\.moodAutoClassify"/);
    assert.match(rulesView.snapshot.html, /自动归类/);
    assert.doesNotMatch(rulesView.snapshot.html, /背景场景/);
    assert.equal(settings.switchSceneSubTab('wardrobe').snapshot.sceneSubTab, 'rules', '旧的衣柜页签落到规则');

    const reviewView = settings.switchSceneSubTab('review');
    // 待确认页固定三块：服装词、情绪词、刚生成的图，没东西时也在，只剩一行标题。
    assert.deepEqual([...reviewView.snapshot.html.matchAll(/data-review-card="([a-z]+)"/g)].map((m) => m[1]), ['outfit', 'mood', 'generated']);
    assert.match(reviewView.snapshot.html, /刚生成的图/);
    assert.match(reviewView.snapshot.html, /data-action="asset-card-import"/);

    const assetsView = settings.switchSceneSubTab('scenes');
    assert.match(assetsView.snapshot.html, /data-scene-settings-pane="assets"/);
    // 「严格匹配场景素材」从生图页迁到场景子页：跟随背景列表，不在生图页出现。
    assert.match(assetsView.snapshot.html, /data-switch="bridge\.autoIllustration\.assets\.strictMatch"/);
    assert.match(assetsView.snapshot.html, /严格匹配场景素材/);
    const scenesView = await settings.invoke(`scene-toggle-bg:${encodeURIComponent('旧城')}`);
    assert.match(scenesView.snapshot.html, /背景场景/);
    assert.match(scenesView.snapshot.html, /场景别名/);
    assert.match(scenesView.snapshot.html, /古城/);
    const charsView = settings.switchSceneSubTab('characters');
    assert.match(charsView.snapshot.html, /统一角色立绘位置/);
    assert.match(charsView.snapshot.html, /data-path="readerSettings\.spriteDisplayScale"/);
    assert.match(charsView.snapshot.html, /立绘全局缩放/);
    assert.match(charsView.snapshot.html, /立绘基准高度/);
    assert.doesNotMatch(charsView.snapshot.html, /调过位置的立绘也一起变|调过位置的立绘不受影响/);
    assert.match(charsView.snapshot.html, /data-switch="bridge\.sceneAssets\.spriteEnhance\.enabled" aria-pressed="false"/);
    assert.match(charsView.snapshot.html, /立绘增强<small class="igs-switch-note">手机较耗电<\/small>/);
    assert.doesNotMatch(charsView.snapshot.html, /data-path="bridge\.sceneAssets\.spriteEnhance\.mode"/);
    assert.doesNotMatch(charsView.snapshot.html, />角色别名<\/div>/);
    // 头像地址在毛笔打开的「角色设定」里；头部的头像本身是上传按钮。
    assert.match(charsView.snapshot.html, /class="igs-char-avatar" data-action="status-avatar-pick:/);
    assert.doesNotMatch(charsView.snapshot.html, /data-status-avatar-char=/);
    assert.match(charsView.snapshot.html, /爱丽/);

    settings.setValue('bridge.sceneAssets.spriteEnhance.enabled', true);
    let enabledView = settings.switchSceneSubTab('characters');
    assert.match(enabledView.snapshot.html, /data-switch="bridge\.sceneAssets\.spriteEnhance\.enabled" aria-pressed="true"/);
    for (const key of ['mode', 'color', 'strength', 'size']) {
        assert.ok(enabledView.snapshot.html.includes(`data-path="bridge.sceneAssets.spriteEnhance.${key}"`), key);
    }
    settings.setValue('bridge.sceneAssets.spriteEnhance.mode', 'shadow');
    settings.setValue('bridge.sceneAssets.spriteEnhance.color', '#123456');
    settings.setValue('bridge.sceneAssets.spriteEnhance.strength', '10');
    settings.setValue('bridge.sceneAssets.spriteEnhance.size', '1.6');
    assert.equal(settings.close().ok, true);
    const savedEnhance = JSON.parse(storage.getItem('igs_bridge_config')).sceneAssets.spriteEnhance;
    assert.deepEqual(savedEnhance, { enabled: true, mode: 'shadow', color: '#123456', strength: 10, size: 1.6 });
    const reopened = opened.reader.controller.openSettings('scene').controller;
    enabledView = reopened.switchSceneSubTab('characters');
    assert.match(enabledView.snapshot.html, /data-switch="bridge\.sceneAssets\.spriteEnhance\.enabled" aria-pressed="true"/);
    reopened.setValue('bridge.sceneAssets.spriteEnhance.enabled', false);
    assert.doesNotMatch(reopened.switchSceneSubTab('characters').snapshot.html, /data-path="bridge\.sceneAssets\.spriteEnhance\.mode"/);
    assert.equal(reopened.close().ok, true);

    vn.destroy();
});

test('gate:simulation:settings-theme-cycle-persists-all-four-themes', async () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 3, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const initial = settings.getSnapshot();
    assert.equal(initial.settingsTheme, 'cream');
    assert.match(initial.html, /data-igs-settings-theme="cream"/);
    for (const theme of ['cream', 'light', 'landmine', 'dark']) {
        assert.match(initial.html, new RegExp(`data-action="set-settings-theme:${theme}"`));
    }
    assert.match(initial.html, /igs-settings-theme-option is-active"[^>]*data-theme="cream"/);
    assert.match(initial.html, /data-theme="landmine"[^>]*><svg[^>]*viewBox="0 0 20 20"[^>]*><rect[^>]*fill="#2b2b2b"[^>]*\/><rect[^>]*fill="#ffc4d4"/);

    for (const theme of ['landmine', 'dark', 'light', 'cream', 'landmine']) {
        const picked = await settings.invoke(`set-settings-theme:${theme}`);
        assert.equal(picked.snapshot.settingsTheme, theme);
        assert.match(picked.snapshot.html, new RegExp(`data-igs-settings-theme="${theme}"`));
        assert.match(picked.snapshot.html, new RegExp(`is-active"[^>]*data-theme="${theme}"`));
        assert.equal(JSON.parse(storage.getItem('igs_bridge_config') || '{}').settingsTheme, theme);
    }
    assert.equal(settings.close().ok, true);
    const bridge = JSON.parse(storage.getItem('igs_bridge_config'));
    assert.equal(bridge.settingsTheme, 'landmine');

    const reopened = opened.reader.controller.openSettings('basic');
    assert.equal(reopened.snapshot.settingsTheme, 'landmine');
    vn.destroy();
});

test('gate:simulation:reader-sub-tab-switches-functional-pages', async () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 2, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');

    const dialogView = settings.switchReaderSubTab('dialog');
    assert.equal(dialogView.snapshot.readerSubTab, 'dialog');
    assert.match(dialogView.snapshot.html, /data-reader-pane="dialog"/);
    assert.match(dialogView.snapshot.html, /风格/);
    assert.match(dialogView.snapshot.html, /尺寸/);
    assert.match(dialogView.snapshot.html, /面板玻璃/);
    assert.match(dialogView.snapshot.html, /对话框宽度/);
    assert.match(dialogView.snapshot.html, /对话框风格/);
    assert.doesNotMatch(dialogView.snapshot.html, /文字排版|外观细节|角色名|分隔线/);
    assert.doesNotMatch(dialogView.snapshot.html, /按钮管理|<span>打字机<\/span>/);

    settings.setValue('readerSettings.dialogSkin', 'gradient-veil');
    const gradientDialogView = settings.switchReaderSubTab('dialog');
    assert.ok(gradientDialogView.snapshot.html.indexOf('对话框风格') < gradientDialogView.snapshot.html.indexOf('黑幕颜色'));
    assert.match(gradientDialogView.snapshot.html, /igs-gradient-veil-settings/);

    const textView = settings.switchReaderSubTab('text');
    assert.match(textView.snapshot.html, /data-reader-pane="text"/);
    assert.match(textView.snapshot.html, /角色名/);
    assert.match(textView.snapshot.html, /台词/);
    assert.match(textView.snapshot.html, /旁白/);
    assert.match(textView.snapshot.html, /心里话/);
    assert.match(textView.snapshot.html, /分隔线/);

    const performanceView = settings.switchReaderSubTab('performance');
    assert.match(performanceView.snapshot.html, /data-reader-pane="performance"/);
    assert.match(performanceView.snapshot.html, /<span>打字机<\/span>/);
    assert.match(performanceView.snapshot.html, /播放速度/);
    assert.match(performanceView.snapshot.html, /自动播放与打字机共用/);
    assert.doesNotMatch(performanceView.snapshot.html, /演出方式/);
    assert.match(performanceView.snapshot.html, /旁白时压暗立绘/);
    assert.match(performanceView.snapshot.html, /data-segment-path="readerSettings\.statusHud\.nsfwSpriteMode" data-segment-value="shade"/);
    assert.match(performanceView.snapshot.html, /亲密演出/);
    assert.doesNotMatch(performanceView.snapshot.html, /读取 igs-fx/);

    const interfaceView = settings.switchReaderSubTab('interface');
    assert.match(interfaceView.snapshot.html, /data-reader-pane="interface"/);
    assert.match(interfaceView.snapshot.html, /背景图/);
    assert.doesNotMatch(interfaceView.snapshot.html, /检测图像数量/, '挪到了 基础 › 标签解析');
    assert.match(interfaceView.snapshot.html, /图像显示模式/);
    assert.match(interfaceView.snapshot.html, /图片亮度/);
    assert.match(interfaceView.snapshot.html, /选项字体大小/);
    assert.match(interfaceView.snapshot.html, /启用选项气泡/);
    assert.match(interfaceView.snapshot.html, /工具栏位置/);
    assert.match(interfaceView.snapshot.html, /工具栏大小/);
    assert.match(interfaceView.snapshot.html, /按钮管理/);
    assert.match(interfaceView.snapshot.html, /显示状态栏/);

    settings.setValue('readerSettings.typewriter.enabled', true);
    settings.setValue('readerSettings.typewriter.speed', 'slow');
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.typewriter, { enabled: true, speed: 'slow', mode: 'soft', punctuationPause: false, prosody: false, sound: { enabled: true, volume: 0.5, dialogueVolume: 0.5, narrationVolume: 0.5, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false } });
    assert.notEqual(JSON.parse(storage.getItem('igs-reader-settings-v9-default') || '{}').typewriter?.speed, 'slow');

    let enabledView = settings.switchReaderSubTab('performance');
    assert.doesNotMatch(enabledView.snapshot.html, /演出方式/, '细项默认收起');
    await settings.invoke(`ui-toggle-open:${encodeURIComponent('perf-typewriter')}`);
    enabledView = settings.switchReaderSubTab('performance');
    assert.match(enabledView.snapshot.html, /播放速度/);
    assert.match(enabledView.snapshot.html, /快[\s\S]*中[\s\S]*慢/);
    assert.match(enabledView.snapshot.html, /演出方式/);
    assert.doesNotMatch(enabledView.snapshot.html, /启用打字音效|台词音色|旁白音色/);

    settings.setValue('readerSettings.typewriter.mode', 'classic');
    const classicView = settings.switchReaderSubTab('performance');
    assert.match(classicView.snapshot.html, /启用打字音效/);
    assert.match(classicView.snapshot.html, /台词音色/);
    assert.match(classicView.snapshot.html, /旁白音色/);
    assert.match(classicView.snapshot.html, /心里话音色[\s\S]*跟随台词/);
    assert.match(classicView.snapshot.html, /老式打字机/);
    assert.match(classicView.snapshot.html, /按角色区分音高/);
    assert.match(classicView.snapshot.html, /data-action="typewriter-preview-sound"/);
    assert.match(classicView.snapshot.html, /type="range" min="0" max="1" step="0\.05"/);
    assert.match(classicView.snapshot.html, />50%</);

    settings.setValue('readerSettings.typewriter.sound.enabled', false);
    const mutedView = settings.switchReaderSubTab('performance');
    assert.match(mutedView.snapshot.html, /启用打字音效/);
    assert.doesNotMatch(mutedView.snapshot.html, /台词音色|旁白音色/);
    assert.equal(settings.getSnapshot().draft.readerSettings.typewriter.sound.enabled, false);

    settings.setValue('readerSettings.typewriter.sound.enabled', true);
    settings.setValue('readerSettings.typewriter.sound.dialogueVolume', 0.35);
    assert.equal(settings.getSnapshot().draft.readerSettings.typewriter.sound.dialogueVolume, 0.35);
    settings.setValue('readerSettings.typewriter.sound.narrationPreset', 'pencil');
    assert.deepEqual((await settings.invoke('typewriter-preview-sound')).previewed, ['dududu', 'pencil']);
    settings.setValue('readerSettings.typewriter.sound.speakerPitch', 'true');
    assert.equal(settings.getSnapshot().draft.readerSettings.typewriter.sound.speakerPitch, true);
    settings.setValue('readerSettings.typewriter.sound.speakerPitch', false);
    settings.setValue('readerSettings.typewriter.sound.narrationPreset', 'keyboard');

    settings.setValue('readerSettings.typewriter.mode', 'soft');
    const softView = settings.switchReaderSubTab('performance');
    assert.doesNotMatch(softView.snapshot.html, /启用打字音效|台词音色|旁白音色/);
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.typewriter.sound, { enabled: true, volume: 0.5, dialogueVolume: 0.35, narrationVolume: 0.5, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false });

    settings.setValue('readerSettings.dialogSkin', 'western-classic');
    const classicDialogView = settings.switchReaderSubTab('dialog');
    assert.equal((classicDialogView.snapshot.html.match(/对话框风格/g) || []).length, 1);
    assert.ok(classicDialogView.snapshot.html.indexOf('对话框宽度') < classicDialogView.snapshot.html.indexOf('电脑端宽度'));
    assert.ok(classicDialogView.snapshot.html.indexOf('电脑端宽度') < classicDialogView.snapshot.html.indexOf('readerSettings.skinDialogScale'));
    assert.doesNotMatch(classicDialogView.snapshot.html, /西欧古典请在「主题」页按比例调整|当前风格使用固定 184px|按阅读器可用宽度自动计算|不影响素材对话框，仍作用于工具栏、选项和数据库。|当前编辑西欧古典风格的文字外观；默认风格配置会保留。|姓名牌风格不显示额外分隔线。/);

    settings.setValue('readerSettings.dialogFontWeight', '700');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogFontWeight, 700);
    assert.notEqual(JSON.parse(storage.getItem('igs-reader-settings-v9-default') || '{}').dialogFontWeight, 700);
    settings.setValue('readerSettings.dialogFontWeight', 'null');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogFontWeight, null);
    settings.setValue('readerSettings.dialogFontWeight', 'not-a-weight');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogFontWeight, null);
    assert.match(classicDialogView.snapshot.html, /data-path="readerSettings\.classicDialogWidthPercent"/);
    assert.match(classicDialogView.snapshot.html, /60%/);
    const roundedFont = '"IGS Rounded","Microsoft YaHei",sans-serif';

    settings.setValue('readerSettings.classicVnTheme.nameFont', roundedFont);
    assert.equal(settings.getSnapshot().draft.readerSettings.classicVnTheme.nameFont, roundedFont);
    assert.equal(settings.close().ok, true);
    const savedTypewriter = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.deepEqual(savedTypewriter.typewriter.sound, { enabled: true, volume: 0.5, dialogueVolume: 0.35, narrationVolume: 0.5, dialoguePreset: 'dududu', thoughtPreset: 'follow', narrationPreset: 'keyboard', speakerPitch: false });
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).classicVnTheme.nameFont, roundedFont);

    vn.destroy();
});

test('gate:simulation:igs-ui-one-line-or-paragraph-per-page', async () => {
    const messages = [
        {
            id: 30,
            text: '[角色: 艾莉]\n艾莉: 第一句。 第二句。',
        },
        {
            id: 31,
            text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。',
        },
    ];
    const vn = bootstrapIGS({
        global: {},
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => messages[0],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const singleLine = await vn.openLatestAvailable('pc');
    const paragraph = await vn.openViewerFromMessage(31, 'pc');
    const nextParagraph = await paragraph.reader.controller.invokeAction('next');

    assert.equal(singleLine.ok, true);
    assert.deepEqual(singleLine.reader.snapshot.content.segments, ['第一句。 第二句。']);
    assert.equal(singleLine.reader.snapshot.content.progress, '1 / 1');
    assert.equal(paragraph.ok, true);
    assert.deepEqual(paragraph.reader.snapshot.content.segments, ['第一段。', '第二段。']);
    assert.equal(paragraph.reader.snapshot.content.progress, '1 / 2');
    assert.equal(nextParagraph.ok, true);
    assert.equal(nextParagraph.progress, '2 / 2');

    vn.destroy();
});

test('gate:simulation:igs-ui-inline-modes-keep-original-floating-geometry', async () => {
    const document = createFakeDocument({ innerWidth: 1600, innerHeight: 1200 });
    const globalObject = document.defaultView;
    const latestMessage = {
        id: 18,
        text: '[角色: 艾莉]\n艾莉: 第一段。 第二段。',
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    await vn.openLatestAvailable('pc');
    let overlay = document.getElementById('igs-overlay');
    assert.equal(overlay.style.width, '900px');
    assert.equal(overlay.style.height, '540px');
    assert.equal(overlay.style.borderRadius, '18px');
    assert.equal(overlay.style.boxShadow, '0 20px 64px rgba(0,0,0,0.42)');
    assert.match(overlay.className, /igs-floating/);

    await vn.openLatestAvailable('mobile');
    overlay = document.getElementById('igs-overlay');
    assert.equal(overlay.style.width, '480px');
    assert.equal(overlay.style.height, '680px');
    assert.equal(overlay.style.borderRadius, '22px');
    assert.match(overlay.className, /igs-floating-mobile/);

    vn.destroy();
});

test('gate:simulation:igs-ui-embedded-toolbar-floats-top-right-as-bare-icons', () => {
    const css = getOriginalReaderStyleText();
    assert.match(css, /\.igs-mode-embedded #igs-toolbar-layer\{inset:14px 14px auto auto;width:auto;height:auto;transform:none;\}/);
    assert.match(css, /\.igs-mode-embedded \.igs-ctrl-bar\{[^}]*position:static[^}]*gap:1\.5px[^}]*padding:0[^}]*background:transparent[^}]*border:0[^}]*box-shadow:none[^}]*backdrop-filter:none/);
    assert.match(css, /\.igs-mode-embedded \.igs-ctrl-bar \.igs-icon-btn\{[^}]*width:32px[^}]*height:32px[^}]*border:0[^}]*background:transparent[^}]*color:rgba\(255,255,255,\.32\)/);
    assert.match(css, /\.igs-mode-embedded \.igs-ctrl-bar \.igs-icon-btn svg\{width:11px;height:11px;transform:scale\(1\.2\);transform-origin:center;\}/);
    assert.match(css, /\.igs-mode-embedded \.igs-dialog\{[^}]*padding:9px 18px 14px;\}/);
    assert.match(css, /\.igs-mode-embedded \.igs-ctrl-bar \.igs-icon-btn:hover\{[^}]*background:transparent[^}]*border-color:transparent[^}]*color:rgba\(255,255,255,\.52\)/);
    assert.match(css, /\.igs-mode-embedded #igs-option-bubbles\[data-igs-pos\]\{top:calc\(14px \+ var\(--igs-toolbar-h,32px\) \+ 8px\);bottom:calc\(14px \+ var\(--igs-dialog-h,220px\) \+ 10px\);max-height:none;overflow-y:auto;overscroll-behavior:contain;\}/);
});

test('gate:simulation:igs-ui-embedded-keeps-compact-expanded-toolbar-when-top-dock-is-saved', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'top' }));
    const document = createFakeDocument({ innerWidth: 1000, innerHeight: 800 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const element = createFakeMessageElement(document, { messageId: 49, textContent: '楼层正文。' });
    chat.appendChild(element);
    const message = { id: 49, text: '楼层正文。', element };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            getMessageById: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('embedded');
    const overlay = document.getElementById('igs-overlay');
    const toolbar = overlay.querySelector('#igs-ctrl-bar');
    const collapsible = overlay.querySelector('#igs-bar-btns');
    assert.equal(opened.reader.snapshot.readerSettings.toolbarDock, 'top');
    assert.equal(overlay.classList.contains('igs-toolbar-top'), false);
    assert.equal(toolbar.getAttribute('data-igs-toolbar-dock'), 'float');
    assert.equal(toolbar.style.transformOrigin, 'right top');
    assert.equal(collapsible.style.display, 'none');

    opened.reader.controller.toggleToolbar();
    assert.equal(collapsible.style.display, 'flex');
    assert.equal(overlay.querySelector('#igs-btn-next').parentNode.id, 'igs-dialog-bar');
    assert.equal(overlay.querySelector('#igs-btn-first-page').parentNode, collapsible);
    assert.equal(overlay.querySelector('#igs-btn-settings').parentNode, collapsible);
    assert.match(opened.reader.snapshot.source.styleText, /\.igs-mode-embedded \.igs-ctrl-bar \.igs-icon-btn svg\{width:11px;height:11px;transform:scale\(1\.2\);transform-origin:center;\}/);
    vn.destroy();
});

test('gate:simulation:igs-ui-embedded-mounts-beside-latest-message-and-restores-source', async () => {
    const document = createFakeDocument({ innerWidth: 1000, innerHeight: 800 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const element = createFakeMessageElement(document, {
        messageId: 50,
        textContent: '艾莉：楼层正文。',
    });
    chat.appendChild(element);
    const message = { id: 50, text: '艾莉：楼层正文。', element };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            getMessageById: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('embedded');
    const mesText = element.querySelector('.mes_text');
    const host = element.querySelector('[data-igs-embedded-host="1"]');
    const overlay = document.getElementById('igs-overlay');

    assert.equal(opened.ok, true);
    assert.ok(host);
    assert.equal(host.parentNode, mesText.parentNode);
    assert.equal(mesText.textContent, '艾莉：楼层正文。');
    assert.equal(mesText.style.display, 'none');
    assert.equal(mesText.getAttribute('aria-hidden'), 'true');
    assert.equal(mesText.getAttribute('data-igs-embedded-hidden'), '1');
    assert.ok(host.contains(overlay));
    assert.equal(overlay.querySelector('#igs-ctrl-bar').style.transformOrigin, 'right top');
    assert.equal(overlay.querySelector('.igs-controls').style.display, 'none');
    assert.match(overlay.className, /igs-mode-embedded/);

    const sendResult = await opened.reader.controller.submit('继续');
    assert.equal(sendResult.ok, true);
    assert.equal(host.getAttribute('data-igs-embedded-loading'), '1');
    assert.equal(opened.reader.controller.getSnapshot().content.displayText.includes('继续'), false);
    assert.equal(host.querySelector('.igs-embedded-loading') !== null, true);
    assert.equal(opened.reader.controller.getSnapshot().mode, 'embedded');

    opened.reader.controller.close();
    assert.equal(element.querySelector('[data-igs-embedded-host="1"]'), null);
    assert.equal(mesText.style.display, '');
    assert.equal(mesText.getAttribute('aria-hidden'), null);

    vn.destroy();
});

test('gate:simulation:igs-ui-embedded-stream-hides-new-floor-and-finishes-on-host-event', async () => {
    const document = createFakeDocument({ innerWidth: 1000, innerHeight: 800 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const initialElement = createFakeMessageElement(document, { messageId: 70, textContent: '上一轮正文。' });
    chat.appendChild(initialElement);
    const messages = new Map();
    let currentMessage = { id: 70, text: '上一轮正文。', visibleText: '上一轮正文。', element: initialElement };
    messages.set(70, currentMessage);

    const eventListeners = new Map();
    const eventSource = {
        on(name, handler) {
            if (!eventListeners.has(name)) eventListeners.set(name, []);
            eventListeners.get(name).push(handler);
        },
        off(name, handler) {
            eventListeners.set(name, (eventListeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name) {
            for (const handler of eventListeners.get(name) || []) handler();
        },
    };
    const mutationObservers = [];
    globalObject.MutationObserver = class {
        constructor(handler) { this.handler = handler; mutationObservers.push(this); }
        observe() { this.observed = true; }
        disconnect() { this.disconnected = true; }
    };
    const timers = new Map();
    let timerId = 0;
    globalObject.setTimeout = (handler, delay) => {
        timerId += 1;
        timers.set(timerId, { handler, delay });
        return timerId;
    };
    globalObject.clearTimeout = (id) => timers.delete(id);
    globalObject.SillyTavern = {
        getContext: () => ({
            eventSource,
            event_types: {
                GENERATION_STARTED: 'generation_started',
                GENERATION_ENDED: 'generation_ended',
                GENERATION_STOPPED: 'generation_stopped',
            },
        }),
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => currentMessage,
            getMessageById: async (id) => messages.get(Number(id)) || null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('embedded');
    assert.equal(opened.ok, true);
    // 流式观察器与内嵌正文守护（v0.33.8 起）都挂在 #chat 上；模拟宿主变更时通知全部观察器。
    assert.ok(mutationObservers.length >= 1);
    const notifyChat = (records) => { for (const observer of mutationObservers) observer.handler(records); };
    eventSource.emit('generation_started');

    const streamingElement = createFakeMessageElement(document, { messageId: 71, textContent: '流式中的楼层字样。' });
    const streamingText = streamingElement.querySelector('.mes_text');
    chat.appendChild(streamingElement);
    currentMessage = { id: 71, text: '流式中的楼层字样。', visibleText: '流式中的楼层字样。', element: streamingElement };
    messages.set(71, currentMessage);
    notifyChat([{ target: chat, addedNodes: [streamingElement], removedNodes: [] }]);

    const streamHost = streamingElement.querySelector('[data-igs-embedded-host="1"]');
    assert.ok(streamHost);
    assert.equal(initialElement.querySelector('.mes_text').style.display, '');
    assert.equal(initialElement.querySelector('.mes_text').textContent, '上一轮正文。');
    assert.equal(streamingText.style.display, 'none');
    assert.equal(streamingText.textContent, '流式中的楼层字样。');
    assert.equal(streamHost.getAttribute('data-igs-embedded-loading'), '1');
    assert.ok(streamHost.querySelector('.igs-embedded-loading'));

    streamingText.textContent = '生成完成后的最终正文。';
    streamingText.innerText = streamingText.textContent;
    currentMessage = { id: 71, text: '生成完成后的最终正文。', visibleText: '生成完成后的最终正文。', element: streamingElement };
    messages.set(71, currentMessage);
    eventSource.emit('generation_ended');
    const stableTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 800);
    assert.ok(stableTimer);
    timers.delete(stableTimer[0]);
    stableTimer[1].handler();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(streamHost.getAttribute('data-igs-embedded-loading'), null);
    assert.equal(streamHost.querySelector('.igs-embedded-loading'), null);
    assert.notEqual(document.getElementById('igs-overlay').style.display, 'none');
    assert.match(opened.reader.controller.getSnapshot().content.displayText, /生成完成后的最终正文/);

    notifyChat([{ target: streamingText, addedNodes: [], removedNodes: [] }]);
    assert.equal(streamHost.querySelector('.igs-embedded-loading'), null);
    vn.destroy();
    assert.equal(streamingText.style.display, '');
});

test('gate:simulation:igs-ui-fullscreen-shows-reply-wait-and-opens-the-new-floor', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const initialElement = createFakeMessageElement(document, { messageId: 80, textContent: '上一轮正文。' });
    chat.appendChild(initialElement);
    let currentMessage = { id: 80, text: '上一轮正文。', visibleText: '上一轮正文。', element: initialElement };
    const messages = new Map([[80, currentMessage]]);
    const eventListeners = new Map();
    const eventSource = {
        on(name, handler) {
            if (!eventListeners.has(name)) eventListeners.set(name, []);
            eventListeners.get(name).push(handler);
        },
        off(name, handler) {
            eventListeners.set(name, (eventListeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name) {
            for (const handler of eventListeners.get(name) || []) handler();
        },
    };
    const mutationObservers = [];
    globalObject.MutationObserver = class {
        constructor(handler) { this.handler = handler; mutationObservers.push(this); }
        observe() {}
        disconnect() {}
    };
    const timers = new Map();
    let timerId = 0;
    globalObject.setTimeout = (handler, delay) => {
        timerId += 1;
        timers.set(timerId, { handler, delay });
        return timerId;
    };
    globalObject.clearTimeout = (id) => timers.delete(id);
    globalObject.SillyTavern = {
        getContext: () => ({
            eventSource,
            event_types: {
                GENERATION_STARTED: 'generation_started',
                GENERATION_ENDED: 'generation_ended',
                GENERATION_STOPPED: 'generation_stopped',
            },
        }),
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => currentMessage,
            getMessageById: async (id) => messages.get(Number(id)) || null,
            typeAndSend: async () => {
                eventSource.emit('generation_started');
                return { ok: true };
            },
        },
    });

    const opened = await vn.openLatestAvailable('fullscreen');
    const overlay = document.getElementById('igs-overlay');
    assert.equal(opened.ok, true);
    assert.match(opened.reader.snapshot.source.styleText, /#igs-overlay\.igs-awaiting-reply #igs-send-status\{display:flex/);

    const sent = await opened.reader.controller.submit('下一句');
    assert.equal(sent.ok, true);
    assert.equal(overlay.classList.contains('igs-awaiting-reply'), true);
    assert.equal(overlay.querySelector('#igs-send-status-text').textContent, '正在生成…');
    assert.equal(overlay.querySelector('#igs-toast').textContent, '');

    const nextElement = createFakeMessageElement(document, { messageId: 81, textContent: '生成完成后的最终正文。' });
    chat.appendChild(nextElement);
    currentMessage = { id: 81, text: '生成完成后的最终正文。', visibleText: '生成完成后的最终正文。', element: nextElement };
    messages.set(81, currentMessage);
    for (const observer of mutationObservers) observer.handler([{ target: chat, addedNodes: [nextElement], removedNodes: [] }]);
    eventSource.emit('generation_ended');
    const stableTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 800);
    assert.ok(stableTimer);
    timers.delete(stableTimer[0]);
    stableTimer[1].handler();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(overlay.classList.contains('igs-awaiting-reply'), false);
    assert.match(opened.reader.controller.getSnapshot().content.displayText, /生成完成后的最终正文/);
    vn.destroy();
});

test('gate:simulation:igs-ui-web-mode-shows-reply-wait-and-opens-the-new-floor', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const initialElement = createFakeMessageElement(document, { messageId: 80, textContent: '上一轮正文。' });
    chat.appendChild(initialElement);
    let currentMessage = { id: 80, text: '上一轮正文。', visibleText: '上一轮正文。', element: initialElement };
    const messages = new Map([[80, currentMessage]]);
    const eventListeners = new Map();
    const eventSource = {
        on(name, handler) {
            if (!eventListeners.has(name)) eventListeners.set(name, []);
            eventListeners.get(name).push(handler);
        },
        off(name, handler) {
            eventListeners.set(name, (eventListeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name) {
            for (const handler of eventListeners.get(name) || []) handler();
        },
    };
    const mutationObservers = [];
    globalObject.MutationObserver = class {
        constructor(handler) { this.handler = handler; mutationObservers.push(this); }
        observe() {}
        disconnect() {}
    };
    const timers = new Map();
    let timerId = 0;
    globalObject.setTimeout = (handler, delay) => {
        timerId += 1;
        timers.set(timerId, { handler, delay });
        return timerId;
    };
    globalObject.clearTimeout = (id) => timers.delete(id);
    globalObject.SillyTavern = {
        getContext: () => ({
            eventSource,
            event_types: {
                GENERATION_STARTED: 'generation_started',
                GENERATION_ENDED: 'generation_ended',
                GENERATION_STOPPED: 'generation_stopped',
            },
        }),
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => currentMessage,
            getMessageById: async (id) => messages.get(Number(id)) || null,
            typeAndSend: async () => {
                eventSource.emit('generation_started');
                return { ok: true };
            },
        },
    });

    const opened = await vn.openLatestAvailable('web');
    const overlay = document.getElementById('igs-overlay');
    assert.equal(opened.ok, true);
    assert.match(opened.reader.snapshot.source.styleText, /#igs-overlay\.igs-awaiting-reply #igs-send-status\{display:flex/);

    const sent = await opened.reader.controller.submit('下一句');
    assert.equal(sent.ok, true);
    assert.equal(overlay.classList.contains('igs-awaiting-reply'), true);
    assert.equal(overlay.querySelector('#igs-send-status-text').textContent, '正在生成…');
    assert.equal(overlay.querySelector('#igs-toast').textContent, '');

    const nextElement = createFakeMessageElement(document, { messageId: 81, textContent: '生成完成后的最终正文。' });
    chat.appendChild(nextElement);
    currentMessage = { id: 81, text: '生成完成后的最终正文。', visibleText: '生成完成后的最终正文。', element: nextElement };
    messages.set(81, currentMessage);
    for (const observer of mutationObservers) observer.handler([{ target: chat, addedNodes: [nextElement], removedNodes: [] }]);
    eventSource.emit('generation_ended');
    const stableTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 800);
    assert.ok(stableTimer);
    timers.delete(stableTimer[0]);
    stableTimer[1].handler();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(overlay.classList.contains('igs-awaiting-reply'), false);
    assert.match(opened.reader.controller.getSnapshot().content.displayText, /生成完成后的最终正文/);
    vn.destroy();
});

test('gate:simulation:igs-ui-comic-mode-keeps-reply-wait-after-hiding-input', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const initialElement = createFakeMessageElement(document, { messageId: 80, textContent: '上一轮正文。' });
    chat.appendChild(initialElement);
    let currentMessage = { id: 80, text: '上一轮正文。', visibleText: '上一轮正文。', element: initialElement };
    const messages = new Map([[80, currentMessage]]);
    const eventListeners = new Map();
    const eventSource = {
        on(name, handler) {
            if (!eventListeners.has(name)) eventListeners.set(name, []);
            eventListeners.get(name).push(handler);
        },
        off(name, handler) {
            eventListeners.set(name, (eventListeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name) {
            for (const handler of eventListeners.get(name) || []) handler();
        },
    };
    const mutationObservers = [];
    globalObject.MutationObserver = class {
        constructor(handler) { this.handler = handler; mutationObservers.push(this); }
        observe() {}
        disconnect() {}
    };
    const timers = new Map();
    let timerId = 0;
    globalObject.setTimeout = (handler, delay) => {
        timerId += 1;
        timers.set(timerId, { handler, delay });
        return timerId;
    };
    globalObject.clearTimeout = (id) => timers.delete(id);
    globalObject.SillyTavern = {
        getContext: () => ({
            eventSource,
            event_types: {
                GENERATION_STARTED: 'generation_started',
                GENERATION_ENDED: 'generation_ended',
                GENERATION_STOPPED: 'generation_stopped',
            },
        }),
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => currentMessage,
            getMessageById: async (id) => messages.get(Number(id)) || null,
            typeAndSend: async () => {
                eventSource.emit('generation_started');
                return { ok: true };
            },
        },
    });

    const opened = await vn.openLatestAvailable('fullscreen');
    const overlay = document.getElementById('igs-overlay');
    assert.equal(opened.ok, true);
    assert.match(opened.reader.snapshot.source.styleText, /#igs-overlay\.igs-awaiting-reply #igs-send-status\{display:flex/);

    const comicSettings = opened.reader.controller.openSettings('reader').controller;
    comicSettings.setValue('readerSettings.comicMode.enabled', true);
    assert.equal(comicSettings.close().ok, true);
    const sent = await opened.reader.controller.submit('下一句');
    assert.equal(sent.ok, true);
    assert.equal(overlay.classList.contains('igs-awaiting-reply'), true);
    assert.equal(overlay.querySelector('#igs-send-status-text').textContent, '正在生成…');
    // 漫画模式：输入框收起只靠标记 + 样式，等待提示那一行仍在输入栏里显示。
    const controls = overlay.querySelector('.igs-controls');
    assert.equal(controls.getAttribute('data-igs-comic-sent'), '1');
    assert.notEqual(controls.style.display, 'none');
    assert.match(opened.reader.snapshot.source.styleText + document.head.textContent, /:not\(\.igs-awaiting-reply\) #igs-dialog \.igs-controls\[data-igs-comic-sent="1"\]\{display:none!important;\}/);
    assert.equal(overlay.querySelector('#igs-toast').textContent, '');

    vn.destroy();
});

test('gate:simulation:igs-ui-fullscreen-send-keeps-the-current-page-until-the-new-floor', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const floorText = '第一页。\n第二页。';
    const initialElement = createFakeMessageElement(document, { messageId: 90, textContent: floorText });
    chat.appendChild(initialElement);
    let currentMessage = { id: 90, text: floorText, visibleText: floorText, element: initialElement };
    const messages = new Map([[90, currentMessage]]);
    const eventListeners = new Map();
    const eventSource = {
        on(name, handler) {
            if (!eventListeners.has(name)) eventListeners.set(name, []);
            eventListeners.get(name).push(handler);
        },
        off(name, handler) {
            eventListeners.set(name, (eventListeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name) {
            for (const handler of eventListeners.get(name) || []) handler();
        },
    };
    const mutationObservers = [];
    globalObject.MutationObserver = class {
        constructor(handler) { this.handler = handler; mutationObservers.push(this); }
        observe() {}
        disconnect() {}
    };
    const timers = new Map();
    let timerId = 0;
    globalObject.setTimeout = (handler, delay) => {
        timerId += 1;
        timers.set(timerId, { handler, delay });
        return timerId;
    };
    globalObject.clearTimeout = (id) => timers.delete(id);
    globalObject.SillyTavern = {
        getContext: () => ({
            eventSource,
            event_types: {
                GENERATION_STARTED: 'generation_started',
                GENERATION_ENDED: 'generation_ended',
                GENERATION_STOPPED: 'generation_stopped',
            },
        }),
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => currentMessage,
            getMessageById: async (id) => messages.get(Number(id)) || null,
            typeAndSend: async () => {
                eventSource.emit('generation_started');
                return { ok: true };
            },
        },
    });

    const opened = await vn.openLatestAvailable('fullscreen');
    const overlay = document.getElementById('igs-overlay');
    assert.equal(opened.ok, true);
    assert.equal(opened.reader.controller.getSnapshot().content.segments.length >= 2, true);
    await opened.reader.controller.invokeAction('next');
    assert.equal(opened.reader.controller.getSnapshot().content.currentIndex, 1);
    assert.match(opened.reader.controller.getSnapshot().content.displayText, /第二页/);

    const sent = await opened.reader.controller.submit('下一句');
    assert.equal(sent.ok, true);
    assert.equal(overlay.classList.contains('igs-awaiting-reply'), true);
    assert.equal(overlay.querySelector('#igs-send-status-text').textContent, '正在生成…');
    assert.equal(opened.reader.controller.getSnapshot().content.currentIndex, 1);

    currentMessage = { ...currentMessage, visibleText: `${floorText}\n` };
    messages.set(90, currentMessage);
    for (const observer of mutationObservers) observer.handler([{ target: chat, addedNodes: [initialElement], removedNodes: [] }]);
    const idleTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 10000);
    assert.ok(idleTimer);
    timers.delete(idleTimer[0]);
    idleTimer[1].handler();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(overlay.classList.contains('igs-awaiting-reply'), true);
    assert.equal(opened.reader.controller.getSnapshot().content.currentIndex, 1);
    assert.match(opened.reader.controller.getSnapshot().content.displayText, /第二页/);

    eventSource.emit('generation_ended');
    const stableTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 800);
    assert.ok(stableTimer);
    timers.delete(stableTimer[0]);
    stableTimer[1].handler();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(overlay.classList.contains('igs-awaiting-reply'), false);
    assert.equal(opened.reader.controller.getSnapshot().content.currentIndex, 1);
    assert.match(opened.reader.controller.getSnapshot().content.displayText, /第二页/);
    vn.destroy();
});

test('gate:simulation:igs-ui-embedded-turn-navigation-keeps-latest-host-and-does-not-jump', async () => {
    const document = createFakeDocument({ innerWidth: 1000, innerHeight: 800 });
    const globalObject = document.defaultView;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const latestElement = createFakeMessageElement(document, { messageId: 61, textContent: '最新正文。' });
    chat.appendChild(latestElement);
    const messages = [
        { id: 60, text: '上一轮正文。' },
        { id: 61, text: '最新正文。', element: latestElement },
    ];
    const jumped = [];
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => messages[1],
            getMessageById: async (id) => messages.find((item) => item.id === Number(id)) || null,
            getAdjacentMessage: async (id, delta) => {
                const index = messages.findIndex((item) => item.id === Number(id));
                return index < 0 ? null : messages[index + (delta < 0 ? -1 : 1)] || null;
            },
            jumpToMessage: async (id) => { jumped.push(Number(id)); return { ok: true }; },
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('embedded');
    const hostBefore = latestElement.querySelector('[data-igs-embedded-host="1"]');
    const overlayBefore = document.getElementById('igs-overlay');
    const previous = await opened.reader.controller.invokeAction('prev-turn');
    const hostAfter = latestElement.querySelector('[data-igs-embedded-host="1"]');
    const overlayAfter = document.getElementById('igs-overlay');

    assert.equal(previous.ok, true);
    assert.equal(previous.reader.snapshot.messageId, 60);
    assert.equal(hostAfter, hostBefore);
    assert.equal(overlayAfter, overlayBefore);
    assert.deepEqual(jumped, []);
    assert.equal(overlayAfter.querySelector('#igs-progress').textContent, '');
    assert.equal(overlayAfter.querySelector('#igs-progress').style.display, 'none');
    assert.doesNotMatch(opened.reader.snapshot.source.styleText, /\.igs-mode-embedded \.igs-progress\{display:none;\}/);

    vn.destroy();
});

test('gate:simulation:igs-ui-embedded-inline-progress-toggle-shows-pages-and-hides-again', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument({ innerWidth: 1000, innerHeight: 800 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const text = Array.from({ length: 11 }, (_, index) => `第${index + 1}段。`).join('\n');
    const element = createFakeMessageElement(document, { messageId: 62, textContent: text });
    chat.appendChild(element);
    const message = { id: 62, text, element };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            getMessageById: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('embedded');
        assert.equal(opened.ok, true);
        assert.equal(opened.reader.snapshot.readerSettings.showStatusLine, false);
        const progress = document.getElementById('igs-progress');
        assert.equal(progress.style.display, 'none');
        assert.equal(progress.textContent, '');

        let settings = opened.reader.controller.openSettings('reader').controller;
        settings.setValue('readerSettings.showStatusLine', true);
        assert.equal(settings.close().ok, true);
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).showStatusLine, true);
        assert.equal(progress.style.display, 'block');
        assert.match(progress.textContent, /^1\s*\/\s*11(?:\s|$)/);

        for (let index = 1; index < 11; index += 1) {
            assert.equal((await opened.reader.controller.invokeAction('next')).ok, true);
        }
        assert.match(progress.textContent, /^11\s*\/\s*11(?:\s|$)/);
        assert.equal(progress.style.display, 'block');

        settings = opened.reader.controller.openSettings('reader').controller;
        settings.setValue('readerSettings.showStatusLine', false);
        assert.equal(settings.close().ok, true);
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).showStatusLine, false);
        assert.equal(progress.style.display, 'none');
        assert.equal(progress.textContent, '');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-pc-inline-progress-uses-same-default-off-toggle', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument({ innerWidth: 1200, innerHeight: 800 });
    const globalObject = document.defaultView;
    globalObject.localStorage = storage;
    const message = { id: 63, text: '第一页。\n第二页。' };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        assert.equal(opened.ok, true);
        const progress = document.getElementById('igs-progress');
        assert.equal(progress.style.display, 'none');
        assert.equal(progress.textContent, '');

        let settings = opened.reader.controller.openSettings('reader').controller;
        settings.setValue('readerSettings.showStatusLine', true);
        assert.equal(settings.close().ok, true);
        assert.equal(progress.style.display, 'block');
        assert.equal(progress.textContent, '1 / 2');

        settings = opened.reader.controller.openSettings('reader').controller;
        settings.setValue('readerSettings.showStatusLine', false);
        assert.equal(settings.close().ok, true);
        assert.equal(progress.style.display, 'none');
        assert.equal(progress.textContent, '');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-floating-window-drag', async () => {
    const document = createFakeDocument({ innerWidth: 1600, innerHeight: 1200 });
    const globalObject = document.defaultView;
    const latestMessage = {
        id: 32,
        text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。',
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const clickLayer = overlay.querySelector('#igs-click-layer');
    const beforeLeft = overlay.style.left;
    const beforeTop = overlay.style.top;

    clickLayer.dispatchEvent({
        type: 'pointerdown',
        button: 0,
        pointerId: 1,
        clientX: 800,
        clientY: 760,
    });
    document.dispatchEvent({
        type: 'pointermove',
        pointerId: 1,
        clientX: 872,
        clientY: 828,
        cancelable: true,
    });
    document.dispatchEvent({
        type: 'pointerup',
        pointerId: 1,
        clientX: 872,
        clientY: 828,
    });

    assert.equal(opened.ok, true);
    assert.notEqual(overlay.style.left, beforeLeft);
    assert.notEqual(overlay.style.top, beforeTop);
    assert.equal(overlay.style.transform, 'none');
    assert.equal(vn.getState().igsUi.activeReader.floatingState.dragged, true);

    const progressBeforeClick = vn.getState().igsUi.activeReader.snapshot.content.progress;
    clickLayer.click();
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, progressBeforeClick);

    globalObject.dispatchEvent({ type: 'resize' });
    assert.equal(overlay.style.transform, 'none');

    vn.destroy();
});

test('gate:simulation:igs-ui-web-mode-locks-scroll-and-restores-on-close', async () => {
    const document = createFakeDocument({
        innerWidth: 1280,
        innerHeight: 720,
        scrollY: 128,
        visualViewport: {
            width: 1280,
            height: 640,
            offsetLeft: 0,
            offsetTop: 0,
        },
    });
    const globalObject = document.defaultView;
    const latestMessage = {
        id: 19,
        text: '[角色: 艾莉]\n艾莉: 第一段。 第二段。',
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('web');
    const overlay = document.getElementById('igs-overlay');

    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(document.body.style.position, 'fixed');
    assert.equal(document.body.style.width, '100%');
    assert.equal(document.body.style.top, '-128px');
    assert.equal(document.documentElement.style.overflow, 'hidden');
    assert.equal(overlay.style.height, '640px');

    await opened.reader.controller.invokeAction('close');
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.body.style.position, '');
    assert.equal(document.body.style.width, '');
    assert.equal(document.body.style.top, '');
    assert.equal(document.documentElement.style.overflow, '');
    assert.equal(globalObject.scrollY, 128);

    vn.destroy();
});

test('gate:simulation:igs-ui-fullscreen-mode-requests-browser-fullscreen-and-exits-only-on-close', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    let requested = 0;
    let exited = 0;
    document.documentElement.requestFullscreen = () => {
        requested += 1;
        document.fullscreenElement = document.documentElement;
        return Promise.resolve();
    };
    document.exitFullscreen = () => {
        exited += 1;
        document.fullscreenElement = null;
        return Promise.resolve();
    };
    const latestMessage = {
        id: 20,
        text: '[角色: 艾莉]\n艾莉: 第一段。 第二段。',
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('fullscreen');
    assert.equal(requested, 1);
    assert.equal(document.fullscreenElement, document.documentElement);

    await opened.reader.controller.invokeAction('next');
    assert.ok(vn.getState().igsUi.activeReader, 'advancing a segment must not close the reader');
    assert.equal(requested, 1, 'rerender must not re-request fullscreen');

    document.fullscreenElement = null;
    document.dispatchEvent({ type: 'fullscreenchange' });
    assert.ok(vn.getState().igsUi.activeReader, 'exiting browser fullscreen must not close the reader');
    document.fullscreenElement = document.documentElement;

    await opened.reader.controller.invokeAction('close');
    assert.equal(vn.getState().igsUi.activeReader, null);
    assert.equal(exited, 1, 'closing the reader must exit browser fullscreen');

    vn.destroy();
});

test('gate:simulation:igs-ui-settings-follows-visual-viewport-in-web-and-fullscreen', async () => {
    for (const mode of ['web', 'fullscreen']) {
        const document = createFakeDocument({
            innerWidth: 1280,
            innerHeight: 720,
            visualViewport: {
                width: 980,
                height: 540,
                offsetLeft: 36,
                offsetTop: 22,
            },
        });
        const globalObject = document.defaultView;
        if (mode === 'fullscreen') {
            document.documentElement.requestFullscreen = () => {
                document.fullscreenElement = document.documentElement;
                return Promise.resolve();
            };
        }
        const vn = bootstrapIGS({
            global: globalObject,
            autoAttachMagicWand: false,
            hostAdapter: {
                getCurrentMessage: async () => ({
                    id: 20,
                    text: '[角色: 艾莉]\n艾莉: 第一段。 第二段。',
                }),
                typeAndSend: async () => ({ ok: true }),
            },
        });

        const opened = await vn.openLatestAvailable(mode);
        const settingsResult = await opened.reader.controller.invokeAction('settings');
        const overlay = document.getElementById('igs-unified-settings');

        assert.equal(settingsResult.ok, true);
        assert.ok(overlay, `${mode} should mount settings overlay`);
        assert.ok(overlay.querySelector('.igs-settings-shell'));
        assert.ok(overlay.querySelector('.igs-settings-head'));
        assert.equal(overlay.querySelectorAll('.igs-settings-tab').length, 4);
        assert.ok(overlay.querySelector('.igs-settings-body'));
        assert.equal(overlay.style['--igs-settings-vleft'], '36px');
        assert.equal(overlay.style['--igs-settings-vtop'], '18px');
        assert.equal(overlay.style['--igs-settings-vw'], '980px');
        assert.equal(overlay.style['--igs-settings-vh'], '548px');

        globalObject.visualViewport.offsetLeft = 48;
        globalObject.visualViewport.offsetTop = 40;
        globalObject.visualViewport.width = 920;
        globalObject.visualViewport.height = 500;
        globalObject.visualViewport.dispatchEvent({ type: 'scroll' });

        assert.equal(overlay.style['--igs-settings-vleft'], '48px');
        assert.equal(overlay.style['--igs-settings-vtop'], '36px');
        assert.equal(overlay.style['--igs-settings-vw'], '920px');
        assert.equal(overlay.style['--igs-settings-vh'], '508px');

        settingsResult.controller.close();
        assert.equal(document.getElementById('igs-unified-settings'), null);
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-hidden-state-can-be-restored-and-toast-shows-boundary-feedback', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const globalObject = document.defaultView;
    const latestMessage = {
        id: 21,
        text: '[角色: 艾莉]\n艾莉: 第一段。 第二段。',
    };
    const vn = bootstrapIGS({
        global: globalObject,
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    await opened.reader.controller.invokeAction('hide');
    let overlay = document.getElementById('igs-overlay');
    let dialog = overlay.querySelector('#igs-dialog');
    let toolbar = overlay.querySelector('#igs-ctrl-bar');
    let optionBubbles = overlay.querySelector('#igs-option-bubbles');
    let clickLayer = overlay.querySelector('#igs-click-layer');

    assert.equal(dialog.parentNode && dialog.parentNode.id, 'igs-dialog-layer');
    const toast = overlay.querySelector('#igs-toast');
    assert.equal(toast.parentNode && toast.parentNode.id, 'igs-overlay');
    assert.equal(toolbar.parentNode && toolbar.parentNode.id, 'igs-toolbar-layer');
    assert.equal(optionBubbles.parentNode && optionBubbles.parentNode.id, 'igs-option-layer');
    assert.ok(overlay.querySelector('#igs-db-layer'));
    assert.equal(dialog.classList.contains('igs-hidden'), true);
    assert.equal(toolbar.classList.contains('igs-hidden'), true);
    clickLayer.click();

    overlay = document.getElementById('igs-overlay');
    dialog = overlay.querySelector('#igs-dialog');
    toolbar = overlay.querySelector('#igs-ctrl-bar');
    assert.equal(vn.getState().igsUi.activeReader.hidden, false);
    assert.equal(dialog.classList.contains('igs-hidden'), false);
    assert.equal(toolbar.classList.contains('igs-hidden'), false);

    await opened.reader.controller.invokeAction('prev');
    assert.match(overlay.querySelector('#igs-toast').textContent, /第一段/);

    const prevTurnResult = await opened.reader.controller.invokeAction('prev-turn');
    assert.equal(prevTurnResult.reason, 'turn-switch-host-required');
    assert.match(document.getElementById('igs-overlay').querySelector('#igs-toast').textContent, /楼层切换需要宿主消息列表/);

    vn.destroy();
});

test('gate:simulation:igs-ui-turn-navigation-switches-message-and_keeps_original_entry_mode', async () => {
    const messages = [
        { id: 7, text: '[角色: 艾莉]\n艾莉: 上一轮第一句。\n上一轮第二句。' },
        { id: 8, text: '[角色: 艾莉]\n艾莉: 当前第一句。\n当前第二句。' },
        { id: 9, text: '[角色: 艾莉]\n艾莉: 下一轮第一句。\n下一轮第二句。' },
    ];
    const jumped = [];
    const vn = bootstrapIGS({
        global: {},
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => messages[1],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            getAdjacentMessage: async (messageId, delta) => {
                const index = messages.findIndex((message) => message.id === Number(messageId));
                return index < 0 ? null : messages[index + (delta < 0 ? -1 : 1)] || null;
            },
            jumpToMessage: async (messageId) => {
                jumped.push(Number(messageId));
                return { ok: true, messageId: Number(messageId) };
            },
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const nextTurnResult = await opened.reader.controller.invokeAction('next-turn');
    const prevTurnResult = await nextTurnResult.reader.controller.invokeAction('prev-turn');
    const state = vn.getState();

    assert.equal(opened.reader.snapshot.messageId, 8);
    assert.equal(nextTurnResult.ok, true);
    assert.equal(nextTurnResult.moved, true);
    assert.equal(nextTurnResult.reader.snapshot.messageId, 9);
    assert.equal(nextTurnResult.reader.snapshot.content.progress, '1 / 2');
    assert.equal(prevTurnResult.ok, true);
    assert.equal(prevTurnResult.moved, true);
    assert.equal(prevTurnResult.reader.snapshot.messageId, 8);
    assert.equal(prevTurnResult.reader.snapshot.content.progress, '1 / 2');
    assert.deepEqual(jumped, []);
    assert.equal(state.igsUi.activeReader.snapshot.messageId, 8);

    vn.destroy();
});

test('gate:simulation:igs-ui-turn-navigation-skips-user-messages', async () => {
    const messages = [
        { id: 7, text: '[角色: 艾莉]\n艾莉: 上一轮第一句。' , isUser: false, isSystem: false, isHidden: false },
        { id: 8, text: '玩家插话。', role: 'user', isUser: true, isSystem: false, isHidden: false },
        { id: 9, text: '[角色: 艾莉]\n艾莉: 下一轮第一句。', isUser: false, isSystem: false, isHidden: false },
    ];
    const jumped = [];
    const vn = bootstrapIGS({
        global: {},
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => messages[2],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            listMessages: async () => messages,
            jumpToMessage: async (messageId) => {
                jumped.push(Number(messageId));
                return { ok: true, messageId: Number(messageId) };
            },
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const prevTurnResult = await opened.reader.controller.invokeAction('prev-turn');
    const nextTurnResult = await prevTurnResult.reader.controller.invokeAction('next-turn');

    assert.equal(opened.reader.snapshot.messageId, 9);
    assert.equal(prevTurnResult.ok, true);
    assert.equal(prevTurnResult.reader.snapshot.messageId, 7);
    assert.equal(nextTurnResult.ok, true);
    assert.equal(nextTurnResult.reader.snapshot.messageId, 9);
    assert.deepEqual(jumped, []);

    vn.destroy();
});

test('gate:simulation:igs-ui-collects-provider-images-and-save-returns-downloadable-url', async () => {
    const document = createFakeDocument();
    const message = {
        id: 20,
        text: '[角色: 玉子]\n玉子: 看看这张图。',
        element: createFakeMessageElement(document, {
            imageUrls: [
                'https://example.com/scene-1.png',
                'https://example.com/scene-2.png',
            ],
        }),
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const saveResult = await opened.reader.controller.invokeAction('save');

    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.imageCount, 2);
    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/scene-1.png');
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/scene-1.png');
    assert.equal(saveResult.ok, true);
    assert.equal(saveResult.url, 'https://example.com/scene-1.png');
    assert.equal(saveResult.filename, 'igs-20-1.png');

    vn.destroy();
});

test('gate:simulation:igs-ui-regen-gives-pending-feedback-and-reports-thrown-errors', async () => {
    const document = createFakeDocument();
    let release;
    let calls = 0;
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: {} }),
        regenerateImage: () => {
            calls += 1;
            return new Promise((resolve, reject) => { release = { resolve, reject }; });
        },
    });
    const opened = host.openReader({ messageId: 7, message: { id: 7, text: '一段。' }, raw: '一段。' }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const pending = opened.controller.invokeAction('regen');
    await Promise.resolve();
    // 出图中不再盖常驻提示：对话框顶边的生成细线亮起，线上方弹一下小字。
    const strip = document.getElementById('igs-overlay').querySelector('#igs-gen-strip');
    assert.ok(strip);
    assert.equal(strip.getAttribute('data-state'), 'busy');
    assert.equal(strip.hasAttribute('hidden'), false);
    assert.equal(strip.querySelector('.igs-gen-tip').textContent, '生图中…');
    assert.notEqual(host.getState().activeReader.toastMessage, '生图中');
    const again = await opened.controller.invokeAction('regen');
    assert.equal(again.reason, 'regen-pending');
    assert.equal(calls, 1);
    release.reject(new Error('NAI 鉴权失败（401）'));
    const result = await pending;
    assert.equal(result.ok, false);
    assert.match(host.getState().activeReader.generationTip, /重新生图失败：NAI 鉴权失败/);
    const retry = opened.controller.invokeAction('regen');
    await Promise.resolve();
    release.resolve({ ok: false, reason: 'provider-not-enabled' });
    await retry;
    assert.match(host.getState().activeReader.generationTip, /当前图像来源无法重画/);
    host.destroy();
});

test('gate:simulation:igs-ui-regen-polls-external-provider-and-updates-background', async () => {
    const document = createFakeDocument();
    const messageRoot = createFakeMessageElement(document, {
        imageUrls: ['https://example.com/old-scene.png'],
    });
    const message = {
        id: 21,
        text: '[角色: 玉子]\n玉子: 重新画一张。',
        element: messageRoot,
    };
    const button = createFakeRegenerateButton(() => {
        messageRoot.__images[0].currentSrc = 'https://example.com/new-scene.png';
        messageRoot.__images[0].src = 'https://example.com/new-scene.png';
    });
    messageRoot.__regenButtons.push(button);

    const vn = bootstrapIGS({
        global: { document, setTimeout },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                pollIntervalMs: 1,
                pollAttempts: 3,
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const regenResult = await opened.reader.controller.invokeAction('regen');
    const state = vn.getState();

    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/old-scene.png');
    assert.equal(regenResult.ok, true);
    assert.equal(regenResult.reason, 'external-image-updated');
    assert.equal(regenResult.imageState.currentUrl, 'https://example.com/new-scene.png');
    assert.equal(state.igsUi.activeReader.snapshot.content.currentImageUrl, 'https://example.com/new-scene.png');
    assert.equal(state.igsUi.activeReader.snapshot.content.backgroundImage, 'https://example.com/new-scene.png');
    assert.equal(button.clickCount, 1);

    vn.destroy();
});

test('gate:simulation:auto-illustration-nai-fetch-models-and-select', async () => {
    let calls = 0;
    const vn = bootstrapIGS({
        global: { fetch: async () => { calls += 1; throw new Error('unexpected'); } },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    try {
        const controller = vn.openSettings({ tab: 'image', mode: 'pc' }).controller;
        controller.toggle('bridge.autoIllustration.nsfwEnabled');
        assert.match(controller.getSnapshot().html, /data-action="fetch-nai-models"/);
        const fetched = await controller.invoke('fetch-nai-models');
        assert.equal(fetched.ok, true);
        assert.equal(calls, 0);
        const snapshot = controller.getSnapshot();
        assert.match(snapshot.resultText.naiModels, /已载入内置 6 个/);
        assert.match(snapshot.html, /<option value="nai-diffusion-4-full">/);
        controller.setValue('bridge.autoIllustration.nai.model', 'nai-diffusion-4-full');
        controller.close();
        assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).bridge.autoIllustration.nai.model, 'nai-diffusion-4-full');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-image-settings-fetch-models-and-test-nai-use-real-service-chain', async () => {
    const document = createFakeDocument();
    const message = {
        id: 34,
        text: '[角色: 玉子]\n玉子: 帮我生成一张夜景。',
    };
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Zq4cAAAAASUVORK5CYII=';
    const calls = [];
    const vn = bootstrapIGS({
        global: {
            document,
            fetch: async (url, options = {}) => {
                calls.push({ url, options });
                if (String(url).endsWith('/models')) {
                    return new Response(JSON.stringify({
                        data: [
                            { id: 'nai-diffusion-3' },
                            { name: 'nai-diffusion-4-curated-preview' },
                        ],
                    }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    });
                }
                return new Response(JSON.stringify({
                    data: [{ b64_json: base64Image }],
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
            setTimeout(callback) {
                callback();
                return 1;
            },
            clearTimeout() {},
        },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'nai',
                endpoint: 'https://example.com/v1',
                apiKey: 'demo-token',
                model: 'nai-diffusion-3',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const settings = vn.openSettings({ tab: 'image', mode: 'pc' });
    const testResult = await settings.controller.invoke('test-image');
    const snapshot = settings.controller.getSnapshot();

    assert.equal(testResult.ok, true);
    assert.doesNotMatch(snapshot.html, /data-action="fetch-image-models"/);
    assert.match(snapshot.resultText.image, /图像 API 真实生成测试成功/);
    assert.equal(calls[0].url, 'https://example.com/v1/images/generations');
    settings.controller.close();

    vn.destroy();
});

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

test('gate:simulation:igs-ui-builtin-nai-empty-endpoint-tests-and-regenerates-via-official-api', async () => {
    const official = 'https://image.novelai.net/ai/generate-image';
    const server = createStrictNaiServer(official);
    const document = createFakeDocument();
    const message = { id: 30, text: '[角色: 玉子]\n玉子: 画一张。', element: createFakeMessageElement(document, { imageUrls: [] }) };
    const vn = bootstrapIGS({
        global: { document, fetch: server.fetch },
        autoAttachMagicWand: false,
        config: { imageApi: { mode: 'nai', endpoint: '', apiKey: 'pst-fake', model: '', size: '830x1210' } },
        hostAdapter: { getCurrentMessage: async () => message, getMessageById: async () => message, typeAndSend: async () => ({ ok: true }) },
    });
    try {
        const settings = vn.openSettings({ tab: 'image', mode: 'pc' });
        assert.ok(settings.controller.getSnapshot().draft.bridge.autoIllustration.nai.apiKey === 'pst-fake', '旧「其他生图」的 NAI Key 迁移到统一设置');
        const tested = await settings.controller.invoke('test-image');
        assert.equal(tested.ok, true);
        assert.match(settings.controller.getSnapshot().resultText.image, /真实生成测试成功/);
        settings.controller.close();

        const opened = await vn.openLatestAvailable('pc');
        assert.equal(opened.ok, true);
        const regen = await opened.reader.controller.invokeAction('regen');
        assert.equal(regen.ok, true, regen.reason);
        const reader = vn.getState().igsUi.activeReader;
        assert.match(reader.snapshot.content.backgroundImage, /^data:image\/png;base64,/);
        assert.match(reader.generationTip, /背景图已更新/);
        assert.equal(server.calls.length, 2);
        assert.ok(server.calls.every(({ url }) => url === official));
        const body = JSON.parse(server.calls[1].init.body);
        assert.equal(body.model, 'nai-diffusion-4-5-full');
        assert.equal(body.parameters.width, 832);
        assert.equal(body.parameters.height, 1216);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-builtin-nai-reports-auth-failure-and-relay-endpoint', async () => {
    const relay = 'https://relay.example.com/ai/generate-image';
    const server = createStrictNaiServer(relay);
    const vn = bootstrapIGS({
        global: { document: createFakeDocument(), fetch: server.fetch },
        autoAttachMagicWand: false,
        config: { imageApi: { mode: 'nai', endpoint: relay, apiKey: 'pst-wrong' } },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    try {
        const settings = vn.openSettings({ tab: 'image', mode: 'pc' });
        await settings.controller.invoke('test-image');
        assert.match(settings.controller.getSnapshot().resultText.image, /鉴权失败（401）/);
        assert.equal(server.calls[0].url, relay);
        settings.controller.setValue('bridge.autoIllustration.nai.apiKey', 'pst-fake');
        settings.controller.setValue('bridge.autoIllustration.nai.transport', 'st-proxy');
        await settings.controller.invoke('test-image');
        assert.equal(server.calls[1].url, `/proxy/${relay}`);
        assert.equal(server.calls[1].init.headers.Authorization, 'Bearer pst-fake', '面板里刚改的 Key 要立即生效');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:auto-illustration-nai-client-passes-strict-official-server', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const server = createStrictNaiServer('https://image.novelai.net/ai/generate-image');
    const client = createNaiOfficialClient({ fetch: server.fetch });
    const result = await client.generate({ scene: '1girl, classroom', chars: [{ tags: 'girl, smile', x: 0.4, y: 0.5 }] }, { apiKey: 'pst-fake', model: 'nai-diffusion-5-full' });
    assert.equal(result.ok, true, result.error);
    assert.match(result.dataUrl, /^data:image\/png;base64,/);
});

test('gate:simulation:igs-ui-auto-llm-fetch-models-and-select', async () => {
    const calls = [];
    let fail = false;
    const vn = bootstrapIGS({
        global: { document: createFakeDocument(), fetch: async (url, init) => {
            calls.push({ url, init });
            return fail
                ? new Response('unauthorized', { status: 401 })
                : new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), { status: 200 });
        } },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    try {
        const settings = vn.openSettings({ tab: 'image', mode: 'pc' });
        const controller = settings.controller;
        controller.switchImageSubTab('llm');
        controller.toggle('bridge.autoIllustration.nsfwEnabled');
        controller.setValue('bridge.autoIllustration.llm.source', 'openai');
        controller.setValue('bridge.autoIllustration.llm.endpoint', 'https://example.com/v1');
        controller.setValue('bridge.autoIllustration.llm.apiKey', 'fake-secret');
        assert.match(controller.getSnapshot().html, /data-action="fetch-llm-models"/);
        const result = await controller.invoke('fetch-llm-models');
        assert.equal(result.ok, true);
        assert.equal(calls[0].url, 'https://example.com/v1/models');
        assert.equal(calls[0].init.method, 'GET');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-secret');
        assert.match(result.snapshot.html, /data-model-sync="bridge\.autoIllustration\.llm\.model"/);
        assert.match(result.snapshot.html, /<option value="model-b">model-b<\/option>/);
        assert.match(result.snapshot.resultText.llmModels, /已拉取 2 个副 LLM 模型/);
        controller.setValue('bridge.autoIllustration.llm.model', 'model-b');
        fail = true;
        const failed = await controller.invoke('fetch-llm-models');
        assert.equal(failed.ok, true);
        assert.match(failed.snapshot.resultText.llmModels, /401/);
        assert.equal(failed.snapshot.resultText.llmModels.includes('fake-secret'), false);
        assert.match(failed.snapshot.html, /<option value="model-b" selected>/);
        controller.close();
        assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).bridge.autoIllustration.llm.model, 'model-b');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-ui-collects-iframe-data-src-images-and-finds-regen-buttons', async () => {
    const document = createFakeDocument();
    const frameImage = createFakeMediaNode({
        ownerDocument: document,
        tagName: 'IMG',
        dataSrc: 'https://example.com/frame-scene-old.png',
    });
    const frameButton = createFakeRegenerateButton(() => {
        frameImage.setAttribute('data-src', 'https://example.com/frame-scene-new.png');
    });
    const iframeDoc = createFakeScopedRoot({
        'img[data-src]': [frameImage],
        'button.image-tag-button': [frameButton],
    });
    const message = {
        id: 36,
        text: '[角色: 玉子]\n玉子: 这张图在 iframe 里。',
        element: createFakeMessageElement(document, {
            frameDocuments: [iframeDoc],
        }),
    };
    const vn = bootstrapIGS({
        global: {
            document,
            setTimeout(callback) {
                callback();
                return 1;
            },
            clearTimeout() {},
        },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'auto',
                pollIntervalMs: 1,
                pollAttempts: 3,
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const regenResult = await opened.reader.controller.invokeAction('regen');

    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/frame-scene-old.png');
    assert.equal(opened.reader.snapshot.content.imageCount, 1);
    assert.equal(regenResult.ok, true);
    assert.equal(regenResult.reason, 'external-image-updated');
    assert.equal(regenResult.imageState.currentUrl, 'https://example.com/frame-scene-new.png');
    assert.equal(frameButton.clickCount, 1);

    vn.destroy();
});

test('gate:simulation:igs-ui-image-slot-binding-keeps-third-image-on-third-segment-and-regens-matching-slot', async () => {
    const document = createFakeDocument();
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source });
    const targetSlot = payload.imageSlots[2];
    const providerImage = createFakeMediaNode({
        ownerDocument: document,
        tagName: 'IMG',
        src: 'https://example.com/slot-3-old.png',
        attributes: {
            'data-location-hash': targetSlot.locationHash,
            'data-image-id': 'slot-3',
            'data-slot-index': '2',
            'data-image-index': '2',
        },
    });
    const button = createFakeRegenerateButton(() => {
        providerImage.currentSrc = 'https://example.com/slot-3-new.png';
        providerImage.src = 'https://example.com/slot-3-new.png';
    }, {
        attributes: {
            'data-location-hash': targetSlot.locationHash,
            'data-image-id': 'slot-3',
            'data-button-index': '2',
            'data-slot-index': '2',
        },
    });
    const message = {
        id: 37,
        text: source,
        element: createFakeMessageElement(document, {
            imageNodes: [providerImage],
            regenButtons: [button],
        }),
    };
    const vn = bootstrapIGS({
        global: {
            document,
            setTimeout(callback) {
                callback();
                return 1;
            },
            clearTimeout() {},
        },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'chatu8',
                pollIntervalMs: 1,
                pollAttempts: 3,
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            getMessageById: async (messageId) => Number(messageId) === 37 ? message : null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openViewerFromMessage(37, 'pc', { startAtEnd: true });
    const regenResult = await opened.reader.controller.invokeAction('regen');
    const snapshot = vn.getState().igsUi.activeReader.snapshot.content;

    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.progress, '3 / 3   [图位 3/6，已绑定 1/6]');
    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/slot-3-old.png');
    assert.equal(opened.reader.snapshot.content.currentSlotImageUrl, 'https://example.com/slot-3-old.png');
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/slot-3-old.png');
    assert.equal(opened.reader.snapshot.content.imageSlots[2].title, '望月的不甘与动摇');
    assert.equal(opened.reader.snapshot.content.imageSlots.filter((slot) => slot.url).length, 1);
    assert.equal(regenResult.ok, true);
    assert.equal(regenResult.reason, 'external-image-updated');
    assert.equal(regenResult.imageState.currentIndex, 2);
    assert.equal(regenResult.imageState.currentUrl, 'https://example.com/slot-3-new.png');
    assert.equal(snapshot.progress, '3 / 3   [图位 3/6，已绑定 1/6]');
    assert.equal(snapshot.currentImageUrl, 'https://example.com/slot-3-new.png');
    assert.equal(snapshot.currentSlotImageUrl, 'https://example.com/slot-3-new.png');
    assert.equal(snapshot.backgroundImage, 'https://example.com/slot-3-new.png');
    assert.equal(button.clickCount, 1);

    vn.destroy();
});

test('gate:simulation:igs-ui-slot-scope-blocks-outside-message-images-and-injects-placeholders', async () => {
    const document = createFakeDocument();
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const roleCardImage = createFakeMediaNode({
        ownerDocument: document,
        tagName: 'IMG',
        src: 'https://example.com/role-card-cover.png',
    });
    const messageRoot = createFakeMessageElement(document, {
        messageId: 40,
        textContent: source,
        outsideGenericNodes: [roleCardImage],
    });
    const message = {
        id: 40,
        text: source,
        element: messageRoot,
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'auto',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const mesText = messageRoot.querySelector('.mes_text');
    const placeholders = mesText.querySelectorAll('[data-igs-image-placeholder="1"], .igs-image-placeholder');

    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.imageCount, 6);
    assert.equal(opened.reader.snapshot.content.currentImageUrl, '');
    assert.equal(opened.reader.snapshot.content.currentSlotImageUrl, '');
    assert.equal(opened.reader.snapshot.content.backgroundImage, '');
    assert.equal(placeholders.length, 6);
    assert.match(placeholders[0].textContent, /image###slot-1###/);
    assert.match(placeholders[5].textContent, /image###slot-6###/);
    assert.equal(placeholders[0].getAttribute('data-igs-image-slot'), '0');
    assert.equal(placeholders[5].getAttribute('data-igs-image-slot'), '5');
    assert.equal(roleCardImage.closest('.mes_text'), null);

    vn.destroy();
});

test('gate:simulation:igs-ui-single-unnumbered-latest-image-does-not-pretend-to-be-first-image-slot', async () => {
    const document = createFakeDocument();
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const message = {
        id: 41,
        text: source,
        element: createFakeMessageElement(document, {
            genericNodes: [
                createFakeMediaNode({
                    ownerDocument: document,
                    tagName: 'IMG',
                    src: 'https://example.com/last-generated-visible.png',
                }),
            ],
        }),
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'auto',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const content = opened.reader.snapshot.content;

    assert.equal(opened.ok, true);
    assert.equal(content.imageCount, 6);
    assert.equal(content.imageBoundCount, 0);
    assert.equal(content.imageUnboundCount, 1);
    assert.equal(content.progress, '1 / 3   [当前图位未生成，已绑定 0/6，未匹配 1]');
    assert.equal(content.currentImageUrl, '');
    assert.equal(content.backgroundImage, '');
    assert.equal(content.unboundImages[0].url, 'https://example.com/last-generated-visible.png');

    vn.destroy();
});

test('gate:simulation:igs-ui-plain-generate-image-button-regens-and-binds-current-slot', async () => {
    const document = createFakeDocument();
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const image = createFakeMediaNode({
        ownerDocument: document,
        tagName: 'IMG',
        src: 'https://example.com/current-plugin-image-old.png',
    });
    const button = createFakeRegenerateButton(() => {
        image.currentSrc = 'https://example.com/current-plugin-image-new.png';
        image.src = 'https://example.com/current-plugin-image-new.png';
    }, {
        textContent: '生成图片',
    });
    const message = {
        id: 42,
        text: source,
        element: createFakeMessageElement(document, {
            genericNodes: [image],
            regenButtons: [button],
        }),
    };
    const vn = bootstrapIGS({
        global: {
            document,
            setTimeout(callback) {
                callback();
                return 1;
            },
            clearTimeout() {},
        },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'auto',
                pollIntervalMs: 1,
                pollAttempts: 3,
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const regenResult = await opened.reader.controller.invokeAction('regen');
    const content = vn.getState().igsUi.activeReader.snapshot.content;

    assert.equal(opened.reader.snapshot.content.currentImageUrl, '');
    assert.equal(regenResult.ok, true);
    assert.equal(regenResult.imageState.currentUrl, 'https://example.com/current-plugin-image-new.png');
    assert.equal(content.currentImageUrl, 'https://example.com/current-plugin-image-new.png');
    assert.equal(content.currentSlotImageUrl, 'https://example.com/current-plugin-image-new.png');
    assert.equal(content.progress, '1 / 3   [图位 1/6，已绑定 1/6]');
    assert.equal(button.clickCount, 1);

    vn.destroy();
});

test('gate:simulation:igs-ui-image-slot-binding-falls-back-to-scan-order-when-image-tags-disabled', async () => {
    const document = createFakeDocument();
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const message = {
        id: 38,
        text: source,
        element: createFakeMessageElement(document, {
            imageNodes: [
                createFakeMediaNode({
                    ownerDocument: document,
                    tagName: 'IMG',
                    src: 'https://example.com/fallback-scene.png',
                }),
            ],
        }),
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        config: {
            sourceFilter: {
                imageIncludeTags: '',
            },
            imageApi: {
                mode: 'extension',
                externalAdapter: 'chatu8',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');

    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.imageCount, 1);
    assert.equal(opened.reader.snapshot.content.progress, '1 / 3   [1/1 图]');
    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/fallback-scene.png');

    vn.destroy();
});

test('gate:simulation:igs-ui-database-img-marker-selects-provider-image', async () => {
    const document = createFakeDocument();
    const source = '<content>第一段。\n<IMG>1</IMG>\n第二段。\n<IMG>2</IMG>\n第三段。</content>';
    const imageOne = createFakeMediaNode({
        ownerDocument: document,
        tagName: 'IMG',
        src: 'https://example.com/database-image-1.png',
    });
    const imageTwo = createFakeMediaNode({
        ownerDocument: document,
        tagName: 'IMG',
        src: 'https://example.com/database-image-2.png',
    });
    const message = {
        id: 43,
        text: source,
        element: createFakeMessageElement(document, {
            textContent: source,
            genericNodes: [imageOne, imageTwo],
        }),
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'dbgen',
                externalAdapter: 'auto',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const next = await opened.reader.controller.invokeAction('next');
    const middleContent = vn.getState().igsUi.activeReader.snapshot.content;
    const nextAgain = await opened.reader.controller.invokeAction('next');
    const content = vn.getState().igsUi.activeReader.snapshot.content;

    assert.equal(opened.ok, true);
    assert.deepEqual(opened.reader.snapshot.content.segments, ['第一段。', '第二段。', '第三段。']);
    // v0.33.8 起：当前句显示它之后的下一张；翻过最后一张后保持最后一张。
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/database-image-1.png');
    assert.equal(next.ok, true);
    assert.equal(middleContent.backgroundImage, 'https://example.com/database-image-2.png');
    assert.equal(nextAgain.ok, true);
    assert.equal(content.backgroundImage, 'https://example.com/database-image-2.png');

    vn.destroy();
});


test('gate:simulation:igs-ui-generic-message-images-follow-image-tags-while-paging', async () => {
    const document = createFakeDocument();
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const message = {
        id: 39,
        text: source,
        element: createFakeMessageElement(document, {
            genericNodes: Array.from({ length: 6 }, (_, index) => createFakeMediaNode({
                ownerDocument: document,
                tagName: 'IMG',
                src: `https://example.com/prism-generated-${index + 1}.png`,
            })),
        }),
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'auto',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');

    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.imageCount, 6);
    assert.equal(opened.reader.snapshot.content.progress, '1 / 3   [图位 1/6，已绑定 6/6]');
    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/prism-generated-1.png');
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/prism-generated-1.png');

    const nextResult = await opened.reader.controller.invokeAction('next');
    const snapshot = vn.getState().igsUi.activeReader.snapshot.content;

    assert.equal(nextResult.ok, true);
    assert.equal(snapshot.progress, '2 / 3   [图位 2/6，已绑定 6/6]');
    assert.equal(snapshot.currentImageUrl, 'https://example.com/prism-generated-2.png');
    assert.equal(snapshot.backgroundImage, 'https://example.com/prism-generated-2.png');

    vn.destroy();
});

test('gate:simulation:host-adapter-hide-state-keeps-hidden-ai-turns-readable-in-real-bootstrap', async () => {
    const document = createFakeDocument();
    const jumps = [];
    const messages = [
        { message_id: 0, mes: '玩家发言', is_user: true },
        { message_id: 1, mes: '第一条 AI 楼层' },
        { message_id: 2, mes: '隐藏楼层' },
        { message_id: 3, mes: '第二条 AI 楼层' },
    ];
    const vn = bootstrapIGS({
        global: {
            document,
            TavernHelper: {
                getLastMessageId: () => 3,
                getChatMessages(_range, options = {}) {
                    if (options.hide_state === 'hidden') return [messages[2]];
                    return messages;
                },
                triggerSlash: async (command) => {
                    jumps.push(command);
                    return { ok: true };
                },
            },
        },
        autoAttachMagicWand: false,
    });

    const opened = await vn.openLatestAvailable('pc');
    const prevTurn = await opened.reader.controller.invokeAction('prev-turn');

    assert.equal(opened.reader.snapshot.messageId, 3);
    assert.equal(prevTurn.ok, true);
    // 隐藏只是不发给模型，剧情照读：上一轮进到被隐藏的第 2 楼，玩家楼仍跳过。
    assert.equal(prevTurn.messageId, 2);
    // 切轮不再让酒馆跳楼。
    assert.deepEqual(jumps, []);

    vn.destroy();
});

test('gate:simulation:host-adapter-opens-reader-from-sillytavern-context-without-tavernhelper', async () => {
    const document = createFakeDocument();
    const vn = bootstrapIGS({
        global: {
            document,
            SillyTavern: {
                getContext() {
                    return {
                        chat: [
                            { mes: '玩家发言', is_user: true },
                            { mes: '第一条 AI 楼层' },
                            { mes: '第二条 AI 楼层' },
                        ],
                    };
                },
            },
        },
        autoAttachMagicWand: false,
    });

    const opened = await vn.openLatestAvailable('pc');

    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.messageId, 2);
    assert.match(opened.reader.snapshot.content.text, /第二条 AI 楼层/);

    vn.destroy();
});

test('gate:simulation:igs-ui-long-text-scrolls-not-overlaps-input', async () => {
    const latestMessage = {
        id: 33,
        text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。\n第三段。\n第四段。',
    };
    const vn = bootstrapIGS({
        global: {},
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => latestMessage,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const styleText = opened.reader.snapshot.source.styleText;

    assert.match(styleText, /#igs-overlay,#igs-overlay \*\{scrollbar-width:none;-ms-overflow-style:none;\}/);
    assert.match(styleText, /#igs-overlay ::-webkit-scrollbar\{display:none;width:0;height:0;\}/);
    assert.match(styleText, /#igs-overlay\.igs-floating \.igs-text\{min-height:0;overflow-y:auto;margin-bottom:12px;flex:1 1 auto;\}/);
    assert.match(styleText, /#igs-overlay\.igs-floating \.igs-controls\{flex-shrink:0;\}/);
    assert.match(styleText, /#igs-overlay\.igs-mode-web \.igs-dialog,#igs-overlay\.igs-mode-fullscreen \.igs-dialog\{[^}]*display:flex;flex-direction:column[^}]*overflow:hidden;\}/);
    assert.match(styleText, /#igs-overlay\.igs-mode-web \.igs-text,#igs-overlay\.igs-mode-fullscreen \.igs-text\{min-height:0;overflow-y:auto;flex:1 1 auto;\}/);
    assert.match(styleText, /\.igs-mode-embedded \.igs-dialog\{[^}]*left:12px[^}]*right:12px[^}]*bottom:14px[^}]*width:auto[^}]*height:auto[^}]*min-height:0[^}]*max-height:calc\(100% - 28px\)[^}]*overflow:hidden/);
    assert.match(styleText, /\.igs-mode-embedded \.igs-text\{min-height:0;overflow-y:auto;margin-bottom:12px;flex:1 1 auto;\}/);
    assert.match(styleText, /\.igs-mode-embedded \.igs-controls\{display:none;\}/);

    const settingsCss = getSettingsStyleText();
    assert.match(settingsCss, /#igs-unified-settings,#igs-unified-settings \*\{scrollbar-width:none;-ms-overflow-style:none\}/);
    assert.match(settingsCss, /#igs-unified-settings ::-webkit-scrollbar\{display:none;width:0;height:0\}/);

    vn.destroy();
});

test('gate:simulation:text-preset-pipeline-refresh', async () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const textFormatPreset = readJson('fixtures/text/text-format-preset.json');
    const sceneRegexPreset = readJson('fixtures/text/scene-regex-preset.json');
    const rendered = [];
    const vn = bootstrapIGS({
        global: {},
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
        layers: {
            dialogue: {
                render(stage) {
                    rendered.push(stage);
                },
            },
        },
    });

    const result = await vn.refresh({
        textFilterPreset,
        textFormatPreset,
        sceneRegexPreset,
        backgroundRules: [
            { id: 'bg.library.rain', priority: 20, match: { location: ['图书馆'], time: ['夜晚'], weather: ['雨'] } },
        ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.scene.speaker, '玉子');
    assert.equal(result.scene.emotion, '开心');
    assert.equal(result.scene.location, '图书馆');
    assert.equal(result.scene.time, '夜晚');
    assert.equal(result.scene.weather, '雨');
    assert.equal(result.scene.text, '你好，欢迎来到图书馆。');
    assert.equal(result.scene.background.id, 'bg.library.rain');
    assert.equal(result.scene.textPipelineErrors.length, 0);
    assert.equal(result.render.stage.layers.dialogue.text, '你好，欢迎来到图书馆。');
    assert.equal(rendered[0].layers.dialogue.speaker, '玉子');

    vn.destroy();
});

test('gate:simulation:preset-registry-current-drives-refresh', async () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const snapshot = readJson('fixtures/presets/preset-registry-snapshot.json');
    const storage = createMemoryStorage({
        [PRESET_STORE_KEY]: JSON.stringify(snapshot),
    });
    const rendered = [];
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
        layers: {
            dialogue: {
                render(stage) {
                    rendered.push(stage);
                },
            },
        },
    });

    const result = await vn.refresh({
        backgroundRules: [
            { id: 'bg.library.rain', priority: 20, match: { location: ['图书馆'], time: ['夜晚'], weather: ['雨'] } },
        ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.scene.speaker, '玉子');
    assert.equal(result.scene.text, '你好，欢迎来到图书馆。');
    assert.equal(result.scene.location, '图书馆');
    assert.equal(result.scene.textPipelineErrors.length, 0);
    assert.equal(result.render.stage.layers.dialogue.speaker, '玉子');
    assert.equal(rendered.length, 1);

    vn.destroy();
});

test('gate:simulation:bad-import-keeps-last-working-refresh', async () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const snapshot = readJson('fixtures/presets/preset-registry-snapshot.json');
    const badBundle = readJson('fixtures/presets/bad-current-overwrite-bundle.json');
    const storage = createMemoryStorage({
        [PRESET_STORE_KEY]: JSON.stringify(snapshot),
    });
    const presetRegistry = createPresetRegistry({ storage });
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        presetRegistry,
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const importResult = presetRegistry.importBundle(badBundle);
    const result = await vn.refresh({
        backgroundRules: [
            { id: 'bg.library.rain', priority: 20, match: { location: ['图书馆'], time: ['夜晚'], weather: ['雨'] } },
        ],
    });

    assert.equal(importResult.ok, false);
    assert.equal(importResult.rejected.length, 1);
    assert.equal(presetRegistry.snapshot().current['text-format-preset'], 'preset.text-format.bubble-line');
    assert.equal(result.ok, true);
    assert.equal(result.scene.speaker, '玉子');
    assert.equal(result.scene.text, '你好，欢迎来到图书馆。');
    assert.equal(result.scene.textPipelineErrors.length, 0);

    vn.destroy();
});

test('gate:simulation:db-panel renders editable empty cells on td and scrollable flex layout', () => {
    const state = {
        status: 'ready',
        activeUid: 'sheet_1',
        errorMsg: '',
        externalPending: false,
        tables: [{
            uid: 'sheet_1',
            name: '主角信息表',
            columns: ['row_id', '名称', '数量'],
            // 第二行为新增空行（除 row_id 外全空）——问题4 的真实场景
            rows: [['1', '望月', '5'], ['2', '', '']],
        }],
    };
    const html = renderDbPanelInner(state);

    // 空格子的 data-db-edit 必须挂在 <td> 上（不是内层 span）——否则空 span 塌缩成 0×0 点不到
    assert.match(html, /<td data-db-edit="1:1"><span class="igs-shujuku-cell"><\/span><\/td>/);
    assert.match(html, /<td data-db-edit="1:2"><span class="igs-shujuku-cell"><\/span><\/td>/);
    // row_id 列只读，不可编辑
    assert.match(html, /<td class="igs-db-ro-cell"><span class="igs-shujuku-cell igs-db-ro">2<\/span><\/td>/);
    // 删除操作传 shujuku 需要的 rowIndex，row_id 只用于确认提示。
    assert.match(html, /data-db-row-index="1" data-db-row-id="2"/);
    // 不再有中间 wrap 层，body 直接包 table（方案A：body 为唯一滚动容器）
    assert.doesNotMatch(html, /igs-shujuku-table-wrap/);

    const css = getDbPanelStyles();
    // inner 必须是填满面板的 flex 列，否则 body 的 flex:1+min-height:0 无父级高度约束、表格撑破面板
    assert.match(css, /#igs-db-inner\{[^}]*flex:1[^}]*min-height:0[^}]*flex-direction:column/);
    // body 为纵向滚动容器且 min-height:0
    assert.match(css, /\.igs-shujuku-body\{[^}]*flex:1[^}]*min-height:0[^}]*overflow-y:auto/);
    // 面板默认关闭背景滤镜，避免重新出现磨砂层；需要时由阅读器开关写入 --igs-db-blur。
    assert.match(css, /#igs-db-panel\{[^}]*backdrop-filter:var\(--igs-db-blur,none\)/);
    assert.match(css, /\.igs-shujuku-table th\{[^}]*backdrop-filter:var\(--igs-db-head-blur,var\(--igs-db-blur,none\)\)/);
    assert.match(css, /#igs-db-panel\{[^}]*box-shadow:var\(--igs-db-shadow,0 12px 48px rgba\(0,0,0,\.50\)\)/);
    assert.match(css, /#igs-db-panel\{[^}]*pointer-events:auto/);
    assert.match(css, /\.igs-shujuku-tabs\{[^}]*width:100%[^}]*max-width:100%[^}]*overflow-x:auto[^}]*overflow-y:hidden/);
    assert.match(css, /#igs-db-panel,#igs-db-panel \*\{scrollbar-width:none;-ms-overflow-style:none;\}/);
    assert.match(css, /#igs-db-panel ::-webkit-scrollbar\{display:none;width:0;height:0;\}/);
    assert.doesNotMatch(css, /--igs-db-head-bg,rgba\(20,20,22,\.92\)/);
});

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('gate:simulation:map-viewport-uses-bundled-city-map-when-demo-source-is-chosen', () => {
    const document = createFakeDocument();
    const loaded = [];
    let failImage = false;
    document.defaultView.Image = class {
        naturalWidth = 1672;
        naturalHeight = 941;
        set src(value) { loaded.push(value); if (failImage) this.onerror?.(); else this.onload?.(); }
    };
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const rows = [
        ['street', '', '临河街道', '.5', '.5', '', '', '1', ''],
        ['square', '', '广场', '.3', '.4', '', '', '2', ''],
    ];
    const api = { exportTableAsJson: () => ({ sheet_map: { uid: 'sheet_map', name: '城市地图', content: [
        ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序', '地图底图'], ...rows,
    ] } }) };
    const store = new Map([['igs-map-basemap-source', 'demo']]);
    const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
    const panel = createMapPanelController(document, { AutoCardUpdaterAPI: api, localStorage }, async () => ({ ok: true }));
    const html = () => document.getElementById('igs-map-panel').innerHTML;
    const basemap = () => html().match(/<img class="igs-map-basemap" src="([^"]+)"/)?.[1];
    for (const [time, file] of [
        ['清晨', 'map-demo-clean-dawn.png'], ['白天', 'map-demo-day.png'],
        ['傍晚', 'map-demo-clean-dusk.png'], ['夜晚', 'map-demo-clean-night.png'],
        ['深夜', 'map-demo-clean-minight.png'],
    ]) {
        panel.open(overlay, {}, '临河街道', time);
        assert.equal(panel.getState().basemapState, 'ready');
        assert.ok(basemap().endsWith(`/${file}`), `${time} should use ${file}`);
        panel.close();
    }
    assert.equal(loaded.length, 5);

    rows[0][8] = 'https://example.com/custom-map.webp';
    rows[1][8] = rows[0][8];
    panel.open(overlay, {}, '临河街道', '深夜');
    assert.equal(basemap(), rows[0][8], 'a valid table basemap takes priority');
    panel.close();

    rows[0][8] = 'javascript:alert(1)';
    rows[1][8] = '';
    panel.open(overlay, {}, '临河街道', '白天');
    assert.ok(basemap().endsWith('/map-demo-day.png'));
    assert.match(html(), /底图地址不可用，已使用内置地图/);
    assert.doesNotMatch(html(), /javascript:alert/);
    panel.close();

    rows[0][8] = 'https://example.com/one.png';
    rows[1][8] = 'https://example.com/two.png';
    panel.open(overlay, {}, '临河街道', '夜晚');
    assert.equal(panel.getState().basemapState, 'conflict');
    assert.equal(basemap(), undefined);
    assert.match(html(), /本层底图配置不一致/);
    panel.close();

    rows[0][8] = rows[1][8] = '';
    failImage = true;
    panel.open(overlay, {}, '临河街道', '夜晚');
    assert.equal(panel.getState().basemapState, 'failed');
    assert.equal(basemap(), undefined);
    assert.match(html(), /底图加载失败，已回退为坐标平面/);
    panel.close();

    document.defaultView.Image = null;
    panel.open(overlay, {}, '临河街道', '夜晚');
    assert.equal(panel.getState().basemapState, 'none');
    assert.equal(basemap(), undefined);
    panel.close();
});

test('gate:simulation:map-viewport-generates-a-per-chat-city-and-lights-it-by-time-and-weather', async () => {
    const document = createFakeDocument();
    document.defaultView.Image = class {
        naturalWidth = 1600;
        naturalHeight = 900;
        set src(value) { this.onload?.(); }
    };
    const canvasOps = { count: 0 };
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (key === 'createPattern') return () => ({});
            return () => { canvasOps.count++; };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    const baseCreate = document.createElement.bind(document);
    let canvases = 0;
    document.createElement = tag => {
        if (String(tag).toLowerCase() !== 'canvas') return baseCreate(tag);
        canvases++;
        return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => `data:image/png;base64,generated-${canvases}` };
    };
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const rows = [
        ['street', '', '临河街道', '.5', '.5', '沿河的主路', '', '1', ''],
        ['school', '', '樱丘高中', '.3', '.3', '', '', '2', ''],
        ['home', '', '我家', '.2', '.7', '', '', '3', ''],
        ['floor', 'home', '一楼', '.5', '.5', '', '', '1', ''],
        ['floor2', 'home', '二楼', '.5', '.3', '', '', '2', ''],
    ];
    const api = { exportTableAsJson: () => ({ sheet_map: { uid: 'sheet_map', name: '城市地图', content: [
        ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序', '地图底图'], ...rows,
    ] } }) };
    const store = new Map();
    const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
    let chatId = 'chat-a';
    const panel = createMapPanelController(document, { AutoCardUpdaterAPI: api, localStorage }, async () => ({ ok: true }), { getChatId: () => chatId });
    const html = () => document.getElementById('igs-map-panel').innerHTML;
    const basemap = () => html().match(/<img class="igs-map-basemap" src="([^"]+)"/)?.[1];
    const settle = async () => { for (let i = 0; i < 600 && panel.getState().generation.status === 'pending'; i++) await new Promise(r => setTimeout(r, 5)); };
    const act = async (action, id = '') => {
        assert.match(html(), new RegExp(`data-map-act="${action}"${id ? ` data-map-id="${id}"` : ''}`), `${action} control should be rendered`);
        const target = document.createElement('button');
        target.setAttribute('data-map-act', action);
        target.setAttribute('data-map-id', id);
        const root = document.getElementById('igs-map-panel');
        root.appendChild(target);
        await root.dispatchEvent({ type: 'click', target });
        target.remove();
    };

    panel.open(overlay, { weatherFx: { enabled: true } }, '临河街道', '21:30', '小雨');
    assert.equal(panel.getState().basemapSource, 'auto', 'generated maps are the default when the table has no basemap');
    assert.equal(panel.getState().generation.status, 'pending');
    assert.match(html(), /正在生成地图/);
    await settle();
    const first = panel.getState().generation;
    assert.equal(first.status, 'ready');
    assert.equal(first.scale, 'city');
    assert.match(basemap(), /^data:image\/png;base64,generated-/);
    assert.match(html(), /data-map-act="basemap-source" data-map-id="auto" aria-pressed="true">生成地图/);
    assert.match(html(), /data-map-act="basemap-source" data-map-id="builtin" aria-pressed="false">自带底图/);
    assert.match(html(), /已固定 · 第 1 张/);
    assert.doesNotMatch(html(), /data-map-act="reroll-back"/, 'no previous map before the first reroll');
    assert.match(html(), /igs-map-light-tint/, 'night tints the generated map');
    assert.match(html(), /igs-map-light-lamps/, 'night turns on generated street lights');
    assert.match(html(), /igs-map-light-clouds/, 'rain adds cloud shadows');
    assert.match(html(), /class="igs-map-basemap"[^>]*style="filter:brightness/);
    assert.ok(canvasOps.count > 1000, 'the city is drawn on canvas');
    panel.close();

    panel.open(overlay, {}, '临河街道', '12:00', '');
    assert.equal(panel.getState().generation.status, 'ready', 'reopening reuses the cached map immediately');
    assert.equal(panel.getState().generation.key, first.key);
    assert.doesNotMatch(html(), /igs-map-light-lamps|igs-map-light-tint/, 'noon has no night grading');
    await act('reroll');
    await settle();
    const rerolled = panel.getState().generation.key;
    assert.notEqual(rerolled, first.key, 'reroll produces another city for this chat');
    assert.match(html(), /已固定 · 第 2 张/);
    await act('reroll-back');
    assert.equal(panel.getState().generation.key, first.key, 'going back restores the previous city from cache');
    await act('reroll');
    await settle();
    panel.close();

    chatId = 'chat-b';
    panel.open(overlay, {}, '临河街道', '12:00', '');
    await settle();
    assert.notEqual(panel.getState().generation.key, rerolled, 'another conversation gets its own city');
    assert.notEqual(panel.getState().generation.key, first.key);
    panel.close();

    chatId = 'chat-a';
    panel.open(overlay, {}, '临河街道', '12:00', '');
    assert.equal(panel.getState().generation.key, rerolled, 'the reroll is remembered per conversation');
    await act('basemap-source', 'builtin');
    assert.equal(panel.getState().basemapSource, 'builtin');
    assert.match(html(), /款式：都市/);
    assert.doesNotMatch(html(), /已固定/);
    assert.ok(basemap().endsWith('/map-demo-day.png'), 'the bundled demo map follows a clock time');
    assert.doesNotMatch(html(), /igs-map-light-tint/, 'bundled time art is not graded twice');
    await act('basemap-source', 'auto');
    assert.equal(panel.getState().basemapSource, 'auto');
    assert.equal(panel.getState().generation.key, rerolled, 'switching back keeps the pinned city');
    panel.close();

    panel.open(overlay, {}, '一楼', '12:00', '');
    assert.equal(panel.getState().generation.scale, 'interior');
    assert.equal(panel.getState().generation.status, 'skipped', 'interior floors keep the neutral plane');
    assert.equal(basemap(), undefined);
    panel.close();

    rows[0][8] = rows[1][8] = rows[2][8] = 'https://example.com/day.webp';
    panel.open(overlay, {}, '临河街道', '深夜', '');
    for (let i = 0; i < 50 && !/igs-map-light-lamps/.test(html()); i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(basemap(), 'https://example.com/day.webp', 'a table basemap still wins over generation');
    assert.match(html(), /igs-map-light-tint/, 'user day art is graded to night');
    assert.match(html(), /igs-map-light-lamps/, 'user art gets lights around the pins');
    panel.dispose();
    assert.equal(panel.isOpen(), false);
});

test('gate:simulation:map-custom-basemap-accepts-url-and-rejects-bad-input', async () => {
    const document = createFakeDocument();
    const loaded = [];
    document.defaultView.Image = class {
        naturalWidth = 800; naturalHeight = 600;
        set src(value) { loaded.push(value); this.onload?.(); }
    };
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const rows = [['street', '', '临河街道', '.5', '.5', '沿河主路', '', '1', '']];
    const api = { exportTableAsJson: () => ({ sheet_map: { uid: 'sheet_map', name: '城市地图', content: [
        ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序', '地图底图'], ...rows,
    ] } }) };
    const store = new Map();
    const localStorage = {
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key),
    };
    const panel = createMapPanelController(document, { AutoCardUpdaterAPI: api, localStorage }, async () => ({ ok: true }), { getChatId: () => 'chat-a' });
    const html = () => document.getElementById('igs-map-panel').innerHTML;
    const basemap = () => html().match(/<img class="igs-map-basemap" src="([^"]+)"/)?.[1];
    const status = () => html().match(/class="igs-map-status"[^>]*>([^<]*)</)?.[1] || '';
    const act = async (action, id = '') => {
        const target = document.createElement('button');
        target.setAttribute('data-map-act', action);
        target.setAttribute('data-map-id', id);
        const root = document.getElementById('igs-map-panel');
        root.appendChild(target);
        await root.dispatchEvent({ type: 'click', target });
        target.remove();
    };

    panel.open(overlay, {}, '临河街道', '白天');
    assert.match(html(), /data-map-act="basemap-source" data-map-id="custom"/, 'the custom source tab is offered');
    await act('basemap-source', 'custom');
    assert.equal(panel.getState().basemapSource, 'custom');
    assert.match(html(), /data-map-act="custom-upload"/, 'custom source offers an upload button');
    assert.match(html(), /data-map-act="custom-url"/, 'custom source offers a url button');
    assert.match(html(), /未设置/, 'nothing is set yet');
    assert.doesNotMatch(html(), /data-map-act="custom-clear"/, 'no clear button before anything is set');

    document.defaultView.prompt = () => 'https://example.com/my-map.webp';
    await act('custom-url');
    assert.equal(basemap(), 'https://example.com/my-map.webp', 'a filled url becomes the basemap');
    assert.match(html(), /已设网址/);
    assert.match(html(), /data-map-act="custom-clear"/, 'a clear button appears once set');
    assert.ok(store.has('igs-map-custom:chat-a:sheet_map:-'), 'the custom url is remembered per chat/table/layer');

    document.defaultView.prompt = () => 'javascript:alert(1)';
    await act('custom-url');
    assert.match(status(), /网址无效/, 'script urls are rejected');
    assert.equal(basemap(), 'https://example.com/my-map.webp', 'the rejected url does not replace the good one');

    await act('custom-clear');
    assert.ok(!store.has('igs-map-custom:chat-a:sheet_map:-'), 'clearing removes the stored url');
    assert.match(status(), /已清除自定义底图/);
    assert.ok(basemap().endsWith('/map-demo-day.png'), 'cleared custom falls back to the bundled map');

    document.defaultView.prompt = null;
    await act('custom-url');
    assert.match(status(), /当前环境不支持输入网址/, 'without prompt the user is pointed at upload');

    panel.dispose();
    assert.equal(panel.isOpen(), false);
});


test('gate:simulation:map-panel-navigates-read-only-sheets-refreshes-and-cleans-up', async () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const overlay = document.createElement('div');
    const layer = document.createElement('div');
    layer.id = 'igs-db-layer';
    overlay.appendChild(layer);
    document.body.appendChild(overlay);
    let restoredFocus = 0;
    document.activeElement = { focus() { restoredFocus++; } };
    const columns = ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序'];
    const home = ['home', '', '我家', '.2', '.7', '屋子 <安全>', '甲', '1'];
    const floor = ['floor', 'home', '一楼', '', '', '无平面点', '', '1'];
    let rows = [home, floor, ['room', 'floor', '卧室', '.5', '.5', '窗边', '乙', '1']];
    const callbacks = new Set();
    let reads = 0;
    let writes = 0;
    const api = {
        exportTableAsJson() {
            reads++;
            return { sheet_map: { uid: 'sheet_map', name: '家庭地图', content: [columns, ...rows] },
                sheet_other: { uid: 'sheet_other', name: '人物', content: [columns, ['x', '', '无关', '', '', '', '', '']] } };
        },
        registerTableUpdateCallback(callback) { callbacks.add(callback); },
        unregisterTableUpdateCallback(callback) { callbacks.delete(callback); },
        updateCell() { writes++; },
    };
    const panel = createMapPanelController(document, { AutoCardUpdaterAPI: api }, async () => ({ ok: false, reason: 'draft-not-empty' }));
    const act = async (action, id = '') => {
        const target = document.createElement('button');
        target.setAttribute('data-map-act', action);
        target.setAttribute('data-map-id', id);
        const root = document.getElementById('igs-map-panel');
        root.appendChild(target);
        await root.dispatchEvent({ type: 'click', target });
        target.remove();
    };
    assert.equal(panel.open(overlay, {}, '我家').ok, true);
    assert.equal(panel.getState().currentId, 'sheet_map:home');
    assert.equal(panel.getState().selectedId, null);
    assert.equal(panel.getState().model.tables.length, 1);
    assert.equal(panel.open(overlay, {}, '我家').reason, 'already-open');
    assert.equal(callbacks.size, 1);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /屋子 &lt;安全&gt;/);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /left:320px;top:630px/);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /stroke="currentColor"/);
    await act('select', 'sheet_map:home');
    await act('enter', 'sheet_map:home');
    assert.equal(panel.getState().parentId, 'sheet_map:home');
    // 无坐标地点不再堆成列表卡片，而是以示意针排布在图上并在无障碍名称中注明。
    assert.doesNotMatch(document.getElementById('igs-map-panel').innerHTML, /igs-map-list|未标注坐标的地点/);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /igs-map-marker igs-map-auto/);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /查看一楼，位置为示意/);
    await act('select', 'sheet_map:floor');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /表格未记录坐标，图上位置仅为示意/);
    await act('enter', 'sheet_map:floor');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /left:800px;top:450px/);
    await act('select', 'sheet_map:room');
    await act('travel');
    assert.match(panel.getState().message, /未覆盖/);
    assert.equal(writes, 0);
    rows = [home, floor, ['room', 'floor', '新房间', '.5', '.5', '', '', '1']];
    callbacks.forEach(callback => callback());
    assert.equal(panel.getState().model.tables[0].locations[2].name, '新房间');
    await act('back');
    assert.equal(panel.getState().parentId, 'sheet_map:home');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /igs-map-levels[\s\S]*data-map-act="level" data-map-id=""[\s\S]*aria-current="page">我家</);
    assert.doesNotMatch(document.getElementById('igs-map-panel').innerHTML, /igs-map-overlay-top"><button/, 'level navigation lives in the detail panel, not over the map');
    await act('level', 'sheet_map:room');
    assert.equal(panel.getState().parentId, 'sheet_map:home', 'level jumps only go up the current path');
    await act('level', '');
    assert.equal(panel.getState().parentId, null);
    assert.doesNotMatch(document.getElementById('igs-map-panel').innerHTML, /igs-map-levels/, 'top layer has no breadcrumb');
    panel.close();
    // 当前地点在子层（新房间）时，顶层标出包含它的“我家”，详情默认展示它并可直接进入。
    assert.equal(panel.open(overlay, {}, '新房间').ok, true);
    assert.equal(panel.getState().parentId, 'sheet_map:floor');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /aria-current="page">一楼/);
    await act('level', '');
    const top = document.getElementById('igs-map-panel').innerHTML;
    assert.match(top, /igs-map-marker igs-map-current[\s\S]*你在这里 · 新房间/);
    assert.match(top, /查看我家（你在这里 · 新房间）/);
    assert.match(top, /data-map-act="enter" data-map-id="sheet_map:home"/);
    await act('enter', 'sheet_map:home');
    assert.equal(panel.getState().parentId, 'sheet_map:home');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /你在这里 · 新房间/, 'the floor containing the room is marked too');
    panel.close();
    assert.equal(callbacks.size, 0);
    assert.equal(document.getElementById('igs-map-panel'), null);
    assert.equal(restoredFocus, 2);
    assert.equal(panel.open(overlay, {}, '').ok, true);
    assert.equal(callbacks.size, 1);
    assert.ok(reads >= 2);
    const backdrop = document.getElementById('igs-map-panel');
    await backdrop.dispatchEvent({ type: 'click', target: backdrop });
    assert.equal(callbacks.size, 0);
    assert.equal(restoredFocus, 3);
    assert.equal(document.getElementById('igs-map-panel'), null);
});

test('gate:simulation:place-map-reads-live-character-locations-without-using-presence', () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const callbacks = new Set();
    let location = '咖啡馆';
    let writes = 0;
    const api = {
        exportTableAsJson() {
            return {
                place: { uid: 'sheet_chang_jing_di_dian_biao', name: '场景地点表', content: [
                    ['row_id', '地点名称', '场景描述', '上级地点ID', 'x', 'y'],
                    [1, '咖啡馆', '临街小店', '', '.2', '.3'],
                    [2, '图书馆', '阅读室', '', '.7', '.8'],
                ] },
                chars: { uid: 'sheet_zhong_yao_jue_se_biao', name: '重要角色表', content: [
                    ['row_id', '姓名', '所在地点', '在场状态'], [1, '<爱丽丝>', location, '离场'],
                ] },
            };
        },
        registerTableUpdateCallback(callback) { callbacks.add(callback); },
        unregisterTableUpdateCallback(callback) { callbacks.delete(callback); },
        updateCell() { writes++; },
    };
    const panel = createMapPanelController(document, { AutoCardUpdaterAPI: api }, async () => ({ ok: true }));
    assert.equal(panel.open(overlay, {}, '咖啡馆').ok, true);
    let root = document.getElementById('igs-map-panel');
    assert.equal(panel.getState().currentId, 'sheet_chang_jing_di_dian_biao:1');
    assert.match(root.innerHTML, /位于此处的角色/);
    assert.match(root.innerHTML, /&lt;爱丽丝&gt;/);
    assert.doesNotMatch(root.innerHTML, /<爱丽丝>/);
    location = '图书馆';
    callbacks.forEach(callback => callback());
    assert.deepEqual(panel.getState().model.tables[0].locations.map(item => item.characters), [[], ['<爱丽丝>']]);
    assert.doesNotMatch(root.innerHTML, /位于此处的角色/);
    assert.equal(writes, 0);
    panel.close();
    assert.equal(callbacks.size, 0);
});

test('gate:simulation:relationship-page-displays-important-character-profiles-not-networks', () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    let writes = 0;
    const api = {
        exportTableAsJson() {
            return {
                chars: { uid: 'sheet_zhong_yao_jue_se_biao', name: '重要角色表', content: [
                    ['row_id', '姓名', '角色类型', '一句话介绍', '所在地点', '人际关系'],
                    [1, '爱丽丝', '恋爱对象', '<图书管理员>', '图书馆', '木下:同学'],
                    [2, '木下', '配角', '咖啡馆员工', '咖啡馆', '爱丽丝:同学'],
                ] },
                network: { uid: 'sheet_guan_xi_wang_luo_biao', name: '关系网络表', content: [
                    ['row_id', '名称', '立场'], [1, '学生会', '友好'],
                ] },
            };
        },
        updateCell() { writes++; },
    };
    const panel = createRecordPanelController(document, { AutoCardUpdaterAPI: api });
    assert.equal(panel.open(overlay, {}, 'relationships').ok, true);
    const root = document.getElementById('igs-record-panel');
    assert.equal(panel.getState().activeUid, 'sheet_zhong_yao_jue_se_biao');
    assert.match(root.innerHTML, /<h2>爱丽丝<\/h2><span class="igs-record-tag">恋爱对象<\/span>/);
    assert.match(root.innerHTML, /&lt;图书管理员&gt;/);
    assert.match(root.innerHTML, /同学/);
    assert.doesNotMatch(root.innerHTML, /学生会|<图书管理员>/);
    assert.equal(writes, 0);
    panel.close();
});


test('gate:simulation:map-hud-entry-does-not-open-while-collapsed-and-only-fills-reader-draft', async () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({
        sceneAssets: { enabled: true, promptRule: 'rule', scenes: { '我家': { url: '' } }, characters: {}, characterAliases: {}, moodGroups: [] },
    }) });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ statusHud: { enabled: true, showLocation: true, tables: [] } }));
    const vn = bootstrapIGS({ global: { document, localStorage: storage }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-scene:我家|夜晚|晴天]', '旁白。', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => { throw Error('map must never send'); } } });
    const opened = await vn.openLatestAvailable('pc');
    const hud = document.getElementById('igs-status-hud');
    assert.equal(hud.querySelector('[data-act="map"]').tagName, 'BUTTON');
    assert.equal(hud.querySelector('.igs-map-avatar-entry'), null);
    const controller = opened.reader.controller;
    assert.equal((await controller.invokeAction('map')).ok, true);
    const panel = document.getElementById('igs-map-panel');
    assert.ok(panel);
    assert.match(panel.innerHTML, /地图读取失败：missing-api/);
    assert.equal(document.getElementById('igs-input').value, '');
    const docStyle = getOriginalReaderStyleText();
    assert.match(docStyle, /#igs-map-panel .igs-map-viewport/);
    const page = vn.getState().igsUi.activeReader.index;
    document.dispatchEvent({ type: 'keydown', key: 'ArrowRight', target: panel });
    document.dispatchEvent({ type: 'keydown', key: ' ', target: panel });
    assert.equal(vn.getState().igsUi.activeReader.index, page);
    assert.ok(document.getElementById('igs-map-panel'));
    document.dispatchEvent({ type: 'keydown', key: 'Escape', target: panel });
    assert.equal(document.getElementById('igs-map-panel'), null);
    assert.ok(vn.getState().igsUi.activeReader);
    assert.equal((await controller.invokeAction('map')).ok, true);
    controller.close();
    assert.equal(document.getElementById('igs-map-panel'), null);
    const again = await vn.openLatestAvailable('pc');
    document.getElementById('igs-overlay').classList.add('igs-options-visible');
    assert.equal((await again.reader.controller.invokeAction('map')).reason, 'record-entry-not-visible');
    document.getElementById('igs-overlay').classList.remove('igs-options-visible');
    await again.reader.controller.invokeAction('toggle-status-hud');
    assert.equal(document.getElementById('igs-status-hud').classList.contains('igs-hud-collapsed'), true);
    assert.equal((await again.reader.controller.invokeAction('map')).reason, 'record-entry-not-visible');
    vn.destroy();
});

test('gate:simulation:record-entry-keeps-keyboard-and-hud-actions-separated', async () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({
        sceneAssets: { enabled: true, promptRule: 'rule', scenes: {}, characters: { Alice: {} },
            characterAliases: {}, moodGroups: [], statusAvatars: { Alice: 'data:image/png;base64,AAA' } },
    }) });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ statusHud: { enabled: true, showLocation: true, tables: [] } }));
    const vn = bootstrapIGS({ global: { document, localStorage: storage }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => ({ id: 21, text: '<content>[igs-char:Alice|平静|你好。]</content>' }),
            typeAndSend: async () => { throw Error('map must not send'); } } });
    const opened = await vn.openLatestAvailable('pc');
    const controller = opened.reader.controller;
    const hud = document.getElementById('igs-status-hud');
    const entry = hud.querySelector('.igs-hud-entry-arrow');
    const toggle = hud.querySelector('.igs-hud-toggle');
    assert.equal(entry.tagName, 'BUTTON');
    assert.equal(entry.getAttribute('aria-label'), '打开资料菜单');
    assert.equal(entry.getAttribute('aria-expanded'), 'false');
    assert.equal(entry.parentNode.className, 'igs-hud-entry-anchor');
    assert.equal(toggle.parentNode, hud);
    assert.match(entry.innerHTML, /<svg/);
    assert.equal(toggle.getAttribute('data-act'), 'toggle-status-hud');
    assert.equal(hud.querySelector('.igs-map-avatar-entry'), null);
    assert.equal(hud.querySelectorAll('.igs-hud-metric').length, 0);
    assert.equal(hud.classList.contains('igs-hud-character-emotion-only'), true);
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-status-hud \.igs-hud-identity\{display:contents;\}/);
    assert.match(css, /#igs-status-hud \.igs-hud-toggle\{z-index:0;\}/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-arrow\{[^}]*flex:none;width:14px;height:20px;[^}]*pointer-events:auto;/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-arrow\[aria-expanded="true"\] svg\{[^}]*rotate\(-90deg\)/);
    assert.match(css, /#igs-status-hud \.igs-hud-avatar-frame\{[^}]*grid-column:1;grid-row:1;align-self:center;/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-anchor\{[^}]*grid-column:2;grid-row:1;[^}]*display:flex;align-items:center;/);
    assert.match(css, /#igs-status-hud \.igs-hud-avatar-empty\{[^}]*background:rgba\(255,255,255,\.16\);/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-menu\{[^}]*flex-direction:row;[^}]*border-left:1px solid/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-item\{[^}]*background:transparent;/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-item svg\{width:12\.4px;height:12\.4px;flex:none;\}/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-item\{[^}]*font-size:13px;/);
    assert.match(css, /#igs-status-hud \.igs-hud-location-icon\{[^}]*width:calc\(16px \* var\(--igs-hud-scale,1\)\)/);
    assert.match(css, /#igs-status-hud\.igs-hud-suppressed \.igs-hud-entry-anchor\{[^}]*visibility:hidden;/);
    const before = vn.getState().igsUi.activeReader.index;
    let stopped = false;
    document.dispatchEvent({ type: 'keydown', key: ' ', target: entry,
        stopPropagation() { stopped = true; } });
    assert.equal(vn.getState().igsUi.activeReader.index, before);
    assert.equal(stopped, false);
    const readerRoot = document.getElementById('igs-overlay').parentNode;
    await readerRoot.dispatchEvent({ type: 'click', target: entry,
        stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(entry.getAttribute('aria-expanded'), 'true');
    const menu = hud.querySelector('#igs-hud-record-menu');
    assert.equal(menu.hasAttribute('hidden'), false);
    assert.equal(menu.querySelectorAll('.igs-hud-entry-item').length, 4);
    const mapItem = menu.querySelector('[data-act="map"]');
    assert.ok(mapItem);
    assert.ok(menu.querySelector('[data-act="diary"]'));
    assert.ok(menu.querySelector('[data-act="inventory"]'));
    assert.ok(menu.querySelector('[data-act="relationships"]'));
    assert.equal(mapItem.querySelector('span'), null);
    assert.equal(mapItem.getAttribute('aria-label'), '地图');
    assert.equal(mapItem.getAttribute('title'), '地图');
    assert.match(mapItem.innerHTML, /<svg/);
    await readerRoot.dispatchEvent({ type: 'click', target: mapItem });
    assert.ok(document.getElementById('igs-map-panel'));
    assert.equal(menu.hasAttribute('hidden'), true);
    assert.equal(entry.getAttribute('aria-expanded'), 'false');
    assert.equal(hud.classList.contains('igs-hud-collapsed'), false);
    stopped = false;
    document.dispatchEvent({ type: 'keydown', key: 'ArrowRight', target: entry,
        stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(vn.getState().igsUi.activeReader.index, before);
    document.dispatchEvent({ type: 'keydown', key: 'Escape', target: entry });
    assert.equal(document.getElementById('igs-map-panel'), null);
    assert.ok(vn.getState().igsUi.activeReader);
    await readerRoot.dispatchEvent({ type: 'click', target: toggle });
    assert.equal(hud.classList.contains('igs-hud-collapsed'), true);
    assert.equal((await controller.invokeAction('map')).reason, 'record-entry-not-visible');
    vn.destroy();
});

test('gate:simulation:record-panel-reads-diary-inventory-and-relationships-safely', async () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const overlay = document.createElement('div');
    const layer = document.createElement('div');
    layer.id = 'igs-db-layer';
    overlay.appendChild(layer);
    document.body.appendChild(overlay);
    let restoredFocus = 0;
    document.activeElement = { focus() { restoredFocus++; } };
    const callbacks = new Set();
    let reads = 0;
    let writes = 0;
    const api = {
        exportTableAsJson() {
            reads++;
            return {
                sheet_diary: { uid: 'sheet_diary', name: '恋爱日记表', content: [['写作角色', '发生时间', '正文'],
                    ['晚', '2024-03-02', '<img src=x onerror=alert(1)>'], ['早', '2024-03-01', '第一天']] },
                sheet_items: { uid: 'sheet_items', name: '随身物品', content: [['row_id', '物品名称', '数量', '描述'],
                    [1, '钥匙', 2, '<安全>'], [2, '未知物', 1, '无法识别'], [3, '空墨水瓶', 0, '用完了'], [4, '黄铜钥匙圈', '', '来历不明']] },
                sheet_rel: { uid: 'sheet_rel', name: '商会势力', content: [['名称', '关系'], ['商会', '<敌视>']] },
            };
        },
        registerTableUpdateCallback(callback) { callbacks.add(callback); },
        unregisterTableUpdateCallback(callback) { callbacks.delete(callback); },
        updateCell() { writes++; },
    };
    const panel = createRecordPanelController(document, { AutoCardUpdaterAPI: api });
    assert.equal(panel.open(overlay, {}, 'diary').ok, true);
    assert.equal(callbacks.size, 1);
    assert.equal(overlay.classList.contains('igs-record-screen-open'), true);
    let root = document.getElementById('igs-record-panel');
    assert.match(root.innerHTML, /珍藏心事/);
    assert.doesNotMatch(root.innerHTML, /恋爱日记表/);
    assert.match(root.innerHTML, /igs-record-bookshelf/);
    assert.equal(root.querySelector('.igs-record-diary-detail'), null);
    assert.ok(root.innerHTML.indexOf('早') < root.innerHTML.indexOf('晚'));
    const diaryEntry = document.createElement('button');
    diaryEntry.setAttribute('data-record-act', 'select');
    diaryEntry.setAttribute('data-record-id', 'sheet_diary:0');
    root.appendChild(diaryEntry);
    await root.dispatchEvent({ type: 'click', target: diaryEntry });
    diaryEntry.remove();
    assert.match(root.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(root.innerHTML, /igs-record-diary-detail/);
    // 心事动作：选册清空篇章，篇章选择定位到对应册，前后篇在单篇册边界保持不动。
    assert.match(root.innerHTML, /data-record-act="book"/);
    assert.match(root.innerHTML, /data-record-act="prev-entry" disabled/);
    assert.match(root.innerHTML, /data-record-act="next-entry" disabled/);
    assert.equal(panel.getState().selectedId, 'sheet_diary:0');
    const prevButton = document.createElement('button');
    prevButton.setAttribute('data-record-act', 'prev-entry');
    root.appendChild(prevButton);
    await root.dispatchEvent({ type: 'click', target: prevButton });
    prevButton.remove();
    assert.equal(panel.getState().selectedId, 'sheet_diary:0');
    assert.match(root.innerHTML, /未署名册|<span>晚<\/span>/);
    callbacks.forEach(callback => callback());
    assert.equal(reads, 2);
    panel.close();
    assert.equal(callbacks.size, 0);
    assert.equal(overlay.classList.contains('igs-record-screen-open'), false);
    assert.equal(restoredFocus, 1);
    assert.equal(document.getElementById('igs-record-panel'), null);

    assert.equal(panel.open(overlay, {}, 'inventory').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.equal(overlay.classList.contains('igs-record-screen-open'), true);
    const recordCss = getOriginalReaderStyleText();
    // 液态磨玻璃：资料页整页只有一层 backdrop 模糊，格位/卡片无描边，标题两侧不再画线。
    assert.match(recordCss, /#igs-record-panel,#igs-map-panel\{[^}]*--igs-rp-text:#eceae6/);
    assert.match(recordCss, /#igs-record-panel \.igs-rp-page::before\{[^}]*background:var\(--igs-rp-lift\),var\(--igs-rp-backdrop\);[^}]*backdrop-filter:[^;}]*blur\(/);
    assert.match(recordCss, /prefers-reduced-transparency:reduce/);
    assert.doesNotMatch(recordCss, /\.igs-rp-title::before/);
    assert.match(recordCss, /#igs-record-panel \.igs-rp-back,#igs-map-panel \.igs-rp-back\{[^}]*min-width:44px;min-height:44px/);
    assert.match(recordCss, /\.igs-record-slots button\{[^}]*border:0;[^}]*background:var\(--igs-rp-fill\)/);
    assert.match(recordCss, /\.igs-record-slot-icon svg\{[^}]*stroke-width:1\.3/);
    assert.match(recordCss, /\.igs-record-slot-name\{[^}]*font-size:12px/);
    assert.doesNotMatch(recordCss, /125,92,54|57,39,27/);
    assert.match(recordCss, /\.igs-record-slot-quantity\{position:absolute;/);
    assert.match(root.innerHTML, /你的背包/);
    assert.doesNotMatch(root.innerHTML, /随身物品/);
    assert.match(root.innerHTML, /钥匙/);
    assert.match(root.innerHTML, /未知物/);
    assert.match(root.innerHTML, /×2/);
    assert.doesNotMatch(root.innerHTML, /&lt;安全&gt;/);
    assert.doesNotMatch(root.innerHTML, /row_id|物品名称/);
    const item = document.createElement('button');
    item.setAttribute('data-record-act', 'select');
    item.setAttribute('data-record-id', 'sheet_items:0');
    root.appendChild(item);
    await root.dispatchEvent({ type: 'click', target: item });
    item.remove();
    assert.equal(panel.getState().selectedId, 'sheet_items:0');
    assert.match(root.innerHTML, /&lt;安全&gt;/);
    // 新契约：选中物品名称保留，不隐藏。
    assert.match(root.innerHTML, /class="igs-record-slot-name">钥匙<\/span>/);
    // 数量语义：0 如实显示 ×0；详情头数量只出现一次。
    assert.match(root.innerHTML, /×0/);
    assert.match(root.innerHTML, /数量：×2/);
    // 缺数量：格位无角标，详情写“数量未记录”。
    assert.doesNotMatch(root.innerHTML, /黄铜钥匙圈<\/span><small/);
    const missingQty = document.createElement('button');
    missingQty.setAttribute('data-record-act', 'select');
    missingQty.setAttribute('data-record-id', 'sheet_items:3');
    root.appendChild(missingQty);
    await root.dispatchEvent({ type: 'click', target: missingQty });
    missingQty.remove();
    assert.match(root.innerHTML, /数量未记录/);
    assert.doesNotMatch(root.innerHTML, /data-record-act="refresh"/);
    panel.close();

    assert.equal(panel.open(overlay, {}, 'relationships').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.match(root.innerHTML, /igs-record-relationships/);
    assert.match(root.innerHTML, /igs-record-relationship-stage/);
    assert.match(root.innerHTML, /igs-record-people/);
    assert.match(root.innerHTML, /aria-label="人物索引"/);
    assert.match(root.innerHTML, /igs-record-relationship-graph/);
    assert.match(root.innerHTML, /igs-record-relationship-detail/);
    assert.match(root.innerHTML, /&lt;敌视&gt;/);
    assert.doesNotMatch(root.innerHTML, /<aside class="igs-record-people"/);
    assert.doesNotMatch(root.innerHTML, /igs-record-person-avatar-large/);
    assert.doesNotMatch(root.innerHTML, /相关人员/);
    assert.doesNotMatch(root.innerHTML, /<table>/);
    assert.equal(panel.getState().relationshipPersonId, 'sheet_rel:0');
    assert.equal(writes, 0);
    panel.close();
    assert.equal(restoredFocus, 3);
});

test('gate:simulation:record-panel-follows-settings-theme-and-trims-repeated-details', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 800 });
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const api = {
        exportTableAsJson() {
            return {
                sheet_diary: { uid: 'sheet_diary', name: '恋爱日记表', content: [['row_id', '写作角色', '关联角色', '日记内容', '发生时间'],
                    [1, '林夏', '陈屿', '今天下雨了。我在书店等到很晚，他没有来。', '2024-03-01'],
                    [2, '林夏', '', '只有一句话的日记。', '2024-03-02'],
                    [3, '陈屿', '', '这是一段非常非常长而且并没有在二十四个字以内结束的第一句话。后面还有。', '2024-03-03']] },
                sheet_items: { uid: 'sheet_items', name: '物品表', content: [['row_id', '物品名称', '数量', '描述', '状态'],
                    [1, '旧钥匙', 1, '刻痕已经磨浅', '已使用']] },
                sheet_chars: { uid: 'sheet_chars', name: '重要角色表', content: [
                    ['row_id', '姓名', '角色类型', '性别', '年龄', '一句话介绍', '外貌特征', '穿着打扮', '所在地点', '人际关系', '当下想法', '过往经历'],
                    [1, '林夏', '恋爱对象', '女', '17', '书店常客', '黑色长发', '白色连衣裙', '书店', '陈屿:同学,旧识', '想见他', '在书店长大']] },
            };
        },
    };
    const saved = [];
    const localStorage = createMemoryStorage({});
    const panel = createRecordPanelController(document, { AutoCardUpdaterAPI: api, localStorage }, null, { getTheme: () => 'cream', setTheme: theme => saved.push(theme) });
    let root = null;
    const act = async (action, id = '') => {
        const target = document.createElement('button');
        target.setAttribute('data-record-act', action);
        target.setAttribute('data-record-id', id);
        root.appendChild(target);
        await root.dispatchEvent({ type: 'click', target });
        target.remove();
    };

    assert.equal(panel.open(overlay, {}, 'diary').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.equal(root.getAttribute('data-rp-theme'), 'cream');
    assert.equal((root.innerHTML.match(/class="igs-rp-theme-option/g) || []).length, 4);
    assert.match(root.innerHTML, /igs-rp-theme-option is-active"[^>]*data-record-id="cream"/);
    await act('theme', 'dark');
    assert.equal(root.getAttribute('data-rp-theme'), 'dark');
    assert.deepEqual(saved, ['dark']);
    assert.match(root.innerHTML, /igs-rp-theme-option is-active"[^>]*data-record-id="dark"/);

    // 每页各记一种字体：选中即写到外壳字体变量，“默认”恢复黑体界面 + 宋体正文。
    assert.match(root.innerHTML, /<select data-record-input="font" aria-label="日记字体"><option value="inherit" selected>默认<\/option>/);
    const fontSelect = { value: '"KaiTi","STKaiti",serif', getAttribute: name => (name === 'data-record-input' ? 'font' : null) };
    await root.dispatchEvent({ type: 'change', target: fontSelect });
    assert.equal(root.style['--igs-rp-font-body'], '"KaiTi","STKaiti",serif');
    assert.equal(root.style['--igs-rp-font-ui'], '"KaiTi","STKaiti",serif');
    assert.deepEqual(JSON.parse(localStorage.getItem('igs_record_fonts')), { diary: '"KaiTi","STKaiti",serif' });
    await act('diary-view', 'books');
    assert.match(root.innerHTML, /<option value="&quot;KaiTi&quot;,&quot;STKaiti&quot;,serif" selected>楷体<\/option>/);
    await root.dispatchEvent({ type: 'change', target: { ...fontSelect, value: 'not-a-font' } });
    assert.equal(root.style['--igs-rp-font-body'], '');
    assert.equal(panel.getState().font, 'inherit');
    await root.dispatchEvent({ type: 'change', target: fontSelect });

    // 无篇名：首句升为标题，正文从第二句开始，不再重复首句。
    await act('select', 'sheet_diary:0');
    assert.match(root.innerHTML, /<h3>今天下雨了<\/h3><p class="igs-record-body">我在书店等到很晚，他没有来。<\/p>/);
    assert.doesNotMatch(root.innerHTML, /今天下雨了。我在/);
    await act('select', 'sheet_diary:1');
    assert.doesNotMatch(root.innerHTML, /<h3>/);
    assert.match(root.innerHTML, /<p class="igs-record-body is-lead">只有一句话的日记。<\/p>/);
    await act('select', 'sheet_diary:2');
    assert.doesNotMatch(root.innerHTML, /<h3>/);
    // 时间线目录：头像已给出写作角色首字，标题下不再重复人名。
    await act('diary-view', 'timeline');
    assert.match(root.innerHTML, /igs-record-timeline-copy"><strong>[^<]+<\/strong><\/span>/);
    await act('diary-view', 'books');
    panel.close();

    assert.equal(panel.open(overlay, {}, 'inventory').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.equal(root.getAttribute('data-rp-theme'), 'cream');
    assert.equal(panel.getState().font, 'inherit');
    assert.equal(root.style['--igs-rp-font-body'], '');
    await act('select', 'sheet_items:0');
    assert.match(root.innerHTML, /<span>数量：×1<\/span><span class="igs-record-tag">已使用<\/span>/);
    assert.doesNotMatch(root.innerHTML, /igs-record-slot-quantity">×1</);
    assert.doesNotMatch(root.innerHTML, /<dt>状态<\/dt>/);
    panel.close();

    assert.equal(panel.open(overlay, {}, 'relationships').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.match(root.innerHTML, /<h2>林夏<\/h2><span class="igs-record-tag">恋爱对象<\/span><span class="igs-record-tag">17岁<\/span>/);
    assert.match(root.innerHTML, /<dt>外貌<\/dt><dd>黑色长发<\/dd>/);
    assert.match(root.innerHTML, /<dt>打扮<\/dt><dd>白色连衣裙<\/dd>/);
    assert.match(root.innerHTML, /<dt>过往经历<\/dt><dd>在书店长大<\/dd>/);
    // 当下想法做名下引语；同一对人物的多条关系合并成一个标签。
    assert.match(root.innerHTML, /<\/header><p class="igs-record-thought" aria-label="当下想法">想见他<\/p>/);
    assert.doesNotMatch(root.innerHTML, /<dt>当下想法<\/dt>/);
    assert.match(root.innerHTML, />同学·旧识<\/span>/);
    assert.equal((root.innerHTML.match(/<path d="M 50 /g) || []).length, 1);
    assert.doesNotMatch(root.innerHTML, /书店常客|所在地点|igs-record-relationship-links/);
    panel.close();
});

test('gate:simulation:map-embedded-only-fills-empty-host-draft', async () => {
    const document = createFakeDocument({ innerWidth: 320, innerHeight: 600 });
    const globalObject = document.defaultView;
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({
        sceneAssets: { enabled: true, promptRule: 'rule', scenes: { '我家': { url: '' } }, characters: {},
            characterAliases: {}, moodGroups: [] },
    }) });
    globalObject.localStorage = storage;
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ statusHud: { enabled: true, showLocation: true, tables: [] } }));
    const columns = ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序'];
    globalObject.AutoCardUpdaterAPI = { exportTableAsJson: () => ({ sheet_map: { uid: 'sheet_map', name: '家庭地图',
        content: [columns, ['p', '', '<房间 & 门>', '.5', '.5', '', '', '1']] } }) };
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.appendChild(chat);
    const text = '<now_plot>\n<content>\n[igs-scene:我家|夜晚|晴天]\n旁白。\n</content>\n</now_plot>';
    const element = createFakeMessageElement(document, { messageId: 22, textContent: text });
    chat.appendChild(element);
    const message = { id: 22, text, element };
    let draft = '';
    let fills = 0;
    const vn = bootstrapIGS({ global: globalObject, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => message, getMessageById: async () => message,
            fillEmptyInputText: async value => { fills++; if (draft) return { ok: false, reason: 'draft-not-empty' }; draft = value; return { ok: true }; },
            typeAndSend: async () => { throw Error('map must not send'); } } });
    const opened = await vn.openLatestAvailable('embedded');
    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.mode, 'embedded');
    assert.equal((await opened.reader.controller.invokeAction('map')).ok, true);
    const root = document.getElementById('igs-map-panel');
    assert.ok(root);
    const act = async (action, id = '') => {
        const target = document.createElement('button');
        target.setAttribute('data-map-act', action);
        target.setAttribute('data-map-id', id);
        root.appendChild(target);
        await root.dispatchEvent({ type: 'click', target });
        target.remove();
    };
    await act('select', 'sheet_map:p');
    await act('travel');
    assert.equal(draft, '前往<房间 & 门>地点');
    await act('travel');
    assert.equal(draft, '前往<房间 & 门>地点');
    assert.equal(fills, 2);
    assert.match(root.innerHTML, /未覆盖/);
    vn.destroy();
    assert.equal(document.getElementById('igs-map-panel'), null);
});

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

test('gate:simulation:status-hud-settings-collapse-when-disabled-without-reading-db', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    let dbReads = 0;
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: createMemoryStorage(),
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    dbReads += 1;
                    return { sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任'], ['1', 'A', '50%']] } };
                },
            },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 2, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');
    const html = settings.switchReaderSubTab('interface').snapshot.html;

    assert.match(html, /data-status-hud/);
    assert.match(html, /显示状态栏/);
    assert.doesNotMatch(html, /状态栏大小/);
    assert.doesNotMatch(html, /头像圆角/);
    assert.doesNotMatch(html, /data-status-hud-tables/);
    assert.equal(dbReads, 0);

    vn.destroy();
});

test('gate:simulation:status-hud-settings-expand-and-persist-table-selection', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
    global: {
            document,
            localStorage: storage,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return {
                        sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任'], ['1', 'A', '50%']] },
                        sheet_quest: { uid: 'sheet_quest', name: '任务表', orderNo: 2, content: [['row_id', '任务名称', '进度'], ['1', '主线', '30%']] },
                    };
                },
            },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 2, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');

    settings.setValue('readerSettings.statusHud.enabled', true);
    settings.setValue('readerSettings.statusHud.showLocation', true);
    const enabled = settings.switchReaderSubTab('interface').snapshot.html;
    assert.match(enabled, /显示状态栏/);
    assert.match(enabled, /显示情绪标签/);
    assert.match(enabled, /显示地点栏（仅旁白）/);
    assert.match(enabled, /显示更多的场景信息/);
    assert.match(enabled, /显示状态栏[\s\S]*显示情绪标签[\s\S]*显示地点栏（仅旁白）[\s\S]*显示更多的场景信息/);
    assert.doesNotMatch(enabled, /毛玻璃模糊|旁白时压暗立绘|显示NSFW场景下的人物立绘/);
    assert.match(enabled, /头像圆角/);
    assert.match(enabled, /状态栏大小/);
    assert.match(enabled, /data-segment-path="readerSettings\.statusHud\.background"/);
    assert.doesNotMatch(enabled, /<select data-path="readerSettings\.statusHud\.background"/);
    assert.match(enabled, /无背景/);
    assert.match(enabled, /跟随对话框/);
    assert.match(enabled, /HUD条配色/);
    assert.match(enabled, /彩色/);
    assert.match(enabled, /灰白/);
    assert.match(enabled, /data-status-hud-tables/);
    assert.match(enabled, /角色数值表/);
    assert.match(enabled, /任务表/);
    assert.match(enabled, /data-action="status-hud-toggle-table:sheet_stats:%E8%A7%92%E8%89%B2%E6%95%B0%E5%80%BC%E8%A1%A8"/);
    assert.match(enabled, /<div class="igs-settings-field"><span>显示的表格<\/span><div class="igs-status-hud-tables"/);
    assert.doesNotMatch(enabled, /<label class="igs-settings-field"><span>显示的表格<\/span>/);

    const performance = settings.switchReaderSubTab('performance').snapshot.html;
    assert.match(performance, /<span>打字机<\/span>/);
    assert.match(performance, /旁白按句号分页[\s\S]*旁白时压暗立绘[\s\S]*显示立绘[\s\S]*隐藏立绘[\s\S]*仅露脸剪影/);
    assert.match(performance, /<span>黑幕强度<\/span>/);
    assert.doesNotMatch(performance, /NSFW场景立绘|NSFW黑幕强度|NSFW 场景立绘与黑幕/);
    // 立绘三档、黑幕强度、裸体头像各自是一行的行头，不能挤进同一个横排行头。
    assert.match(performance, /<div class="igs-perf-item-head"><div class="igs-settings-field"><div class="igs-segmented" role="radiogroup" aria-label="NSFW 场景立绘"/);
    assert.match(performance, /<div class="igs-perf-item-head"><label class="igs-settings-field"><span>黑幕强度<\/span>/);
    assert.match(performance, /<div class="igs-perf-item-head"><button type="button" class="igs-switch[^"]*" data-switch="readerSettings\.statusHud\.nsfwCgPortrait"/);
    const dialog = settings.switchReaderSubTab('dialog').snapshot.html;
    assert.match(dialog, /毛玻璃模糊/);
    assert.match(dialog, /显示对话框内状态行/);

    settings.setValue('readerSettings.statusHud.showLocation', true);
    assert.equal(settings.getSnapshot().draft.readerSettings.statusHud.showLocation, true);
    settings.setValue('readerSettings.statusHud.showLocationDetails', true);
    assert.equal(settings.getSnapshot().draft.readerSettings.statusHud.showLocationDetails, true);
    settings.setValue('readerSettings.statusHud.background', 'dialog');
    assert.equal(settings.getSnapshot().draft.readerSettings.statusHud.background, 'dialog');
    settings.setValue('readerSettings.statusHud.barColor', 'grayscale');
    assert.equal(settings.getSnapshot().draft.readerSettings.statusHud.barColor, 'grayscale');
    settings.invoke('status-hud-toggle-table:sheet_quest:%E4%BB%BB%E5%8A%A1%E8%A1%A8');
    settings.invoke('status-hud-toggle-table:sheet_stats:%E8%A7%92%E8%89%B2%E6%95%B0%E5%80%BC%E8%A1%A8');
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.statusHud.tables.map((t) => t.uid), ['sheet_quest', 'sheet_stats']);
    settings.switchReaderSubTab('interface');
    assert.equal((settings.getSnapshot().html.match(/class="igs-table-pick is-on"/g) || []).length, 2);

    settings.invoke('status-hud-toggle-table:sheet_quest:%E4%BB%BB%E5%8A%A1%E8%A1%A8');
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.statusHud.tables.map((t) => t.uid), ['sheet_stats']);

    assert.equal(settings.close().ok, true);
    const persisted = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.equal(persisted.statusHud.enabled, true);
    assert.equal(persisted.statusHud.showLocation, true);
    assert.equal(persisted.statusHud.showLocationDetails, true);
    assert.equal(persisted.statusHud.background, 'dialog');
    assert.equal(persisted.statusHud.barColor, 'grayscale');
    assert.deepEqual(persisted.statusHud.tables.map((t) => t.uid), ['sheet_stats']);


    // 关闭总开关后：顶部 UI 的状态栏子设置隐藏，其他分类互不受影响。
    opened.reader.controller.openSettings('reader');
    settings.setValue('readerSettings.statusHud.enabled', false);
    const disabled = settings.switchReaderSubTab('interface').snapshot.html;
    assert.match(disabled, /显示状态栏/);
    assert.doesNotMatch(disabled, /显示情绪标签/);
    assert.doesNotMatch(disabled, /显示地点栏/);
    assert.doesNotMatch(disabled, /显示更多的场景信息/);
    assert.doesNotMatch(disabled, /毛玻璃模糊|旁白时压暗立绘|显示NSFW场景下的人物立绘/);
    assert.match(settings.switchReaderSubTab('performance').snapshot.html, /旁白时压暗立绘/);
    assert.match(settings.switchReaderSubTab('dialog').snapshot.html, /显示对话框内状态行/);

    vn.destroy();
});

test('gate:simulation:status-hud-position-switch-device-commit-reset-and-apply', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ statusHud: { enabled: true } }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 2, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const hud = document.getElementById('igs-status-hud');
    assert.equal(hud.hasAttribute('data-igs-hud-pos'), false, '没挪过位置的状态栏不挂属性');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');
    let html = settings.switchReaderSubTab('interface').snapshot.html;
    assert.match(html, /显示状态栏[\s\S]*状态栏大小[\s\S]*data-hud-pos="pc"[\s\S]*显示的表格/, '位置栏排在大小 / 圆角之后、表格之前');
    assert.match(html, /data-hud-pos-reset disabled>/);

    settings.setValue('readerSettings.statusHud.position.pc.x', '87.6', { liveInput: true });
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.statusHud.position.pc, { x: 88, y: 0 });
    await settings.invoke('status-hud-pos-device:mobile');
    html = settings.getSnapshot().html;
    assert.match(html, /data-hud-pos="mobile"/);
    assert.match(html, /data-path="readerSettings\.statusHud\.position\.mobile\.y" data-hud-pos-axis="y" min="0" max="100" step="1" value="0"/);
    settings.setValue('readerSettings.statusHud.position.mobile.y', 64, { liveInput: true });
    await settings.invoke('status-hud-pos-device:pc');
    assert.match(settings.getSnapshot().html, /data-path="readerSettings\.statusHud\.position\.pc\.x" data-hud-pos-axis="x" min="0" max="100" step="1" value="88"/);
    await settings.invoke('status-hud-pos-reset:pc');
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.statusHud.position, { pc: { x: 0, y: 0 }, mobile: { x: 0, y: 64 } });
    assert.equal((await settings.invoke('status-hud-pos-device:tablet')).ok, false);

    assert.equal(settings.close().ok, true);
    const persisted = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.deepEqual(persisted.statusHud.position, { pc: { x: 0, y: 0 }, mobile: { x: 0, y: 64 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(hud.hasAttribute('data-igs-hud-pos'), true, '关面板后阅读器按新位置挂上变量');
    assert.equal(hud.style['--igs-hud-my'], '64');
    assert.equal(hud.style['--igs-hud-x'], '0');

    vn.destroy();
});


test('gate:simulation:status-hud-snapshot-keeps-raw-emotion-and-skips-narration', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: 'rule',
                scenes: { '旧城': { url: '' } },
                characters: { 'H': { default: '', '喜悦': 'https://example.com/happy.png', '平和': 'https://example.com/calm.png' } },
                characterAliases: { 'H': [] },
                moodGroups: [],
                statusAvatars: { 'H': 'data:image/png;base64,AAA' },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, size: 'medium', showEmotion: true, showLocation: true, avatarRadius: 'circle', background: 'none', tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
    }));
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return { sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任', '好感'], ['1', 'H', '72%', '54%']] } };
                },
            },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 1,
                text: ['<now_plot>', '<content>', '[igs-scene:旧城|夜晚|晴天]', '[igs-char:H|喜悦|Hello.]', '</content>', '</now_plot>'].join('\n'),
  }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const content = opened.reader.snapshot.content;
    assert.equal(content.statusEmotion, '喜悦');
    assert.equal(content.statusHud.character, 'H');
    assert.equal(content.statusHud.emotion, '喜悦');
    assert.equal(content.statusHud.location, '');
    assert.equal(content.sceneLocation, '旧城');
    assert.equal(content.sceneTime, '夜晚');
    assert.equal(content.sceneWeather, '晴天');
    assert.equal(content.statusHud.avatar, 'data:image/png;base64,AAA');
    assert.equal(content.statusHud.metrics.length, 2);
    assert.equal(content.statusHud.metrics[0].label, '信任');
    assert.equal(content.statusHud.metrics[0].percent, 72);

    vn.destroy();
});

test('gate:simulation:status-hud-subscription-registers-once-and-tears-down', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const registered = [];
    const unregistered = [];
    let dbReads = 0;
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: createMemoryStorage(),
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    dbReads += 1;
                    return { sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任'], ['1', 'H', '72%']] } };
                },
                registerTableUpdateCallback(cb) { registered.push(cb); },
                unregisterTableUpdateCallback(cb) { unregistered.push(cb); },
            },
        },
        autoAttachMagicWand: false,
        config: { sceneAssets: { enabled: true, promptRule: 'rule', scenes: {}, characters: { H: { default: '' } }, characterAliases: { H: [] }, moodGroups: [] } },
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '[igs-char:H|喜悦|Hello.]' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    assert.equal(registered.length, 0);
    assert.equal(dbReads, 0);

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');
    settings.setValue('readerSettings.statusHud.enabled', true);
    settings.invoke('status-hud-toggle-table:sheet_stats:%E8%A7%92%E8%89%B2%E6%95%B0%E5%80%BC%E8%A1%A8');
    settings.close();

    vn.destroy();
    assert.equal(registered.length <= 1, true);
    assert.equal(unregistered.length, registered.length);
});


test('gate:simulation:status-hud-dom-renders-avatar-emotion-and-caps-at-four', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: 'rule',
                scenes: { '旧城': { url: '' } },
                characters: { H: { default: '' } },
                characterAliases: { H: [] },
                moodGroups: [],
                statusAvatars: { H: 'data:image/png;base64,AAA' },
            },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, size: 'large', showEmotion: true, showLocation: true, avatarRadius: 'medium', background: 'dialog', barColor: 'grayscale', tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
    }));
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return { sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任', '好感', '了解', '体力', '精神'], ['1', 'H', '72%', '54%', '83%', '60%', '70%']] } };
                },
            },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-scene:旧城|夜晚|晴天]', '[igs-char:H|紧张|Hello.]', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const host = document.getElementById('igs-status-hud');
    assert.equal(host.hasAttribute('hidden'), false);
    assert.equal(host.classList.contains('igs-hud-bg-dialog'), true);
    assert.equal(host.classList.contains('igs-hud-character-emotion-with-metrics'), true);
    const entry = host.querySelector('.igs-hud-entry-arrow');
    const menu = host.querySelector('#igs-hud-record-menu');
    assert.equal(entry.getAttribute('aria-expanded'), 'true');
    assert.equal(menu.hasAttribute('hidden'), false);

    const avatar = host.querySelector('.igs-hud-avatar');
    assert.ok(avatar, 'avatar node should exist');
    assert.equal(avatar.getAttribute('src'), 'data:image/png;base64,AAA');
    assert.equal(avatar.style.borderRadius, 'calc(16px * var(--igs-hud-scale,1))');

    const chip = host.querySelector('.igs-hud-emotion');
    assert.equal(chip.textContent, '紧张');
    assert.equal(host.querySelector('.igs-hud-location'), null);

    assert.equal(host.querySelectorAll('.igs-hud-metric').length, 4);
    const fills = host.querySelectorAll('.igs-hud-fill');
    assert.equal(fills.length, 4);
    assert.equal(fills[0].style.backgroundImage, 'linear-gradient(90deg, rgba(255,255,255,.46), rgba(255,255,255,.86))');
    const overflow = host.querySelector('.igs-hud-overflow');
    assert.equal(overflow.textContent, '+1');
    const metricsCss = getOriginalReaderStyleText();
    assert.match(metricsCss, /#igs-status-hud \.igs-hud-metrics\{grid-column:1 \/ 3;grid-row:2;display:grid;grid-template-columns:max-content minmax\(0,1fr\) auto;/);

    const labels = Array.from(host.querySelectorAll('.igs-hud-metric-label')).map((node) => node.textContent);
    assert.deepEqual(labels, ['信任', '好感', '了解', '体力']);
    const overlay = document.getElementById('igs-overlay');
    const readerRoot = overlay.parentNode;
    assert.ok(readerRoot);
    await readerRoot.dispatchEvent({ type: 'click', target: entry,
        stopPropagation() {} });
    assert.equal(entry.getAttribute('aria-expanded'), 'false');
    assert.equal(menu.hasAttribute('hidden'), true);
    await readerRoot.dispatchEvent({ type: 'click', target: entry,
        stopPropagation() {} });
    assert.equal(entry.getAttribute('aria-expanded'), 'true');
    assert.equal(menu.hasAttribute('hidden'), false);
    let hudToggle = host.querySelector('[data-act="toggle-status-hud"]');
    assert.ok(hudToggle);

    await readerRoot.dispatchEvent({ type: 'click', target: hudToggle });
    assert.equal(host.classList.contains('igs-hud-collapsed'), true);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).statusHud.collapsed, true);

    hudToggle = host.querySelector('[data-act="toggle-status-hud"]');
    assert.ok(hudToggle);
    await readerRoot.dispatchEvent({ type: 'click', target: hudToggle });
    assert.equal(host.classList.contains('igs-hud-collapsed'), false);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).statusHud.collapsed, false);

    const toolbarExpanded = await opened.reader.controller.invokeAction('toggle-bar');
    assert.equal(toolbarExpanded.collapsed, false);
    assert.equal(host.classList.contains('igs-hud-collapsed'), true);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).statusHud.collapsed, false);

    const hudExpanded = await opened.reader.controller.invokeAction('toggle-status-hud');
    assert.equal(hudExpanded.collapsed, false);
    assert.equal(vn.getState().igsUi.activeReader.toolbarCollapsed, true);
    assert.equal(host.classList.contains('igs-hud-collapsed'), false);

    vn.destroy();
});

test('gate:simulation:status-hud-dom-hidden-when-disabled-and-placeholder-without-avatar', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: true, promptRule: 'rule', scenes: {}, characters: { H: { default: '' } }, characterAliases: { H: [] }, moodGroups: [] },
    }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, size: 'small', showEmotion: true, avatarRadius: 'square', background: 'none', tables: [] },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-char:H|平和|Hello.]', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    await vn.openLatestAvailable('pc');
    const host = document.getElementById('igs-status-hud');
    assert.equal(host.hasAttribute('hidden'), false);
    assert.equal(host.classList.contains('igs-hud-bg-dialog'), false);
    assert.equal(host.querySelector('.igs-hud-avatar-empty') != null, true);
    assert.equal(host.querySelector('.igs-hud-emotion').textContent, '平和');
    assert.equal(host.querySelectorAll('.igs-hud-metric').length, 0);
    assert.equal(host.style['--igs-hud-scale'] != null, true);

    vn.destroy();
});

test('gate:simulation:status-hud-location-occupies-identity-slot-without-character', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: true, promptRule: 'rule', scenes: { '旧城': { url: '' } }, characters: {}, characterAliases: {}, moodGroups: [] },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, showEmotion: true, showLocation: true, tables: [] },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-scene:旧城|夜晚|晴天]', '风吹过街道。', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const host = document.getElementById('igs-status-hud');
    assert.equal(opened.reader.snapshot.content.statusHud.character, '');
    assert.equal(opened.reader.snapshot.content.statusHud.location, '旧城');
    assert.equal(host.hasAttribute('hidden'), false);
    assert.equal(host.querySelector('.igs-hud-avatar'), null);
    assert.equal(host.querySelector('.igs-hud-emotion'), null);
    assert.equal(host.querySelector('.igs-hud-location-label').textContent, '旧城');
    assert.equal(host.querySelector('.igs-hud-location').tagName, 'DIV');
    assert.equal(host.querySelector('.igs-hud-location').getAttribute('data-act'), null);
    assert.ok(host.querySelector('#igs-hud-record-menu').querySelector('[data-act="map"]'));
    assert.ok(host.querySelector('.igs-hud-location-icon'));
    assert.match(host.querySelector('.igs-hud-location-icon').innerHTML, /<svg/);
    assert.equal(host.querySelectorAll('.igs-hud-metric').length, 0);

    const styleText = getOriginalReaderStyleText();
    const locationStyle = styleText.match(/\.igs-hud-location-label\{([^}]*)\}/);
    assert.ok(locationStyle);
    assert.doesNotMatch(locationStyle[1], /background|border-radius|padding/);

    vn.destroy();
});

test('gate:simulation:bgm-bars-sit-left-of-location-and-reveal-title-on-click', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: true, promptRule: 'rule', scenes: { '学校天台': { url: '' } }, characters: {}, characterAliases: {}, moodGroups: [] },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, showEmotion: true, showLocation: true, tables: [] },
        bgm: {
            enabled: true, volume: 0.5, tracks: [
                { id: 'a', name: '雨のように', credit: '魔王魂', url: 'https://x/a.mp3', keywords: [], moods: ['sad'] },
                { id: 'b', name: 'To tomorrow', credit: '魔王魂', url: 'https://x/b.mp3', keywords: [], moods: ['sad'] },
            ],
        },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-scene:学校天台|黄昏|小雨]', '[igs-fx:bgm|悲]', '风吹过天台。', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const location = document.getElementById('igs-status-hud').querySelector('.igs-hud-location');
    const bars = location.querySelector('.igs-hud-bgm-bars');
    assert.ok(bars, 'two-bar mark sits in the location row');
    // 顺序：竖线（左描边）→ 曲名 → 图钉 → 地点。
    const order = location.children.map((child) => child.className);
    assert.deepEqual(order.slice(0, 2), ['igs-hud-bgm-bars', 'igs-hud-bgm']);
    assert.ok(order.indexOf('igs-hud-bgm') < order.indexOf('igs-hud-location-label'), 'music on the left, place on the right');
    assert.equal(bars.querySelectorAll('i').length, 2);
    assert.equal(location.classList.contains('is-bgm-open'), false, 'title hidden until clicked');
    const first = location.querySelector('.igs-hud-bgm-title').textContent;
    assert.match(first, /· 魔王魂$/);

    assert.equal((await opened.reader.controller.invokeAction('bgm-note')).expanded, true);
    assert.equal(location.classList.contains('is-bgm-open'), true);
    const next = await opened.reader.controller.invokeAction('bgm-next');
    assert.equal(next.ok, true);
    const now = document.getElementById('igs-status-hud').querySelector('.igs-hud-bgm-title').textContent;
    assert.notEqual(now, first, 'skip plays the other track in the sad pool');
    assert.equal(document.getElementById('igs-status-hud').querySelector('.igs-hud-location').classList.contains('is-bgm-open'), true);
    assert.equal((await opened.reader.controller.invokeAction('bgm-note')).expanded, false);

    vn.destroy();
});

test('gate:simulation:status-hud-location-details-render-on-narration', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: true, promptRule: 'rule', scenes: { '旧城': { url: '' } }, characters: {}, characterAliases:{}, moodGroups: [] },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, showLocation: true, showLocationDetails: true, tables: [] },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-scene:旧城|深夜|小雨]', '风吹过街道。', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const content = opened.reader.snapshot.content;
    const host = document.getElementById('igs-status-hud');
    assert.equal(content.textType, 'narration');
    assert.equal(content.statusHud.character, '');
    assert.equal(content.statusHud.location, '旧城');
    assert.equal(content.statusHud.time, '深夜');
    assert.equal(content.statusHud.weather, '小雨');
    assert.equal(host.querySelector('.igs-hud-location-label').textContent, '小雨 · 深夜 の 旧城');
    assert.equal(host.querySelector('.igs-hud-location').getAttribute('data-act'), null);
    assert.ok(host.querySelector('.igs-hud-location-icon'));

    vn.destroy();
});

test('gate:simulation:status-hud-keeps-default-avatar-when-selected-table-has-no-character-row', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: { enabled: true, promptRule: 'rule', scenes: {}, characters: { H: { default: '' } }, characterAliases: { H: [] }, moodGroups: [] },
        }),
    });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        statusHud: { enabled: true, size: 'small', showEmotion: false, avatarRadius: 'circle', background: 'none', tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
    }));
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return { sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任'], ['1', 'B', '50%']] } };
                },
            },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: ['<now_plot>', '<content>', '[igs-char:H|平和|Hello.]', '</content>', '</now_plot>'].join('\n') }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const host = document.getElementById('igs-status-hud');
    assert.equal(opened.reader.snapshot.content.statusHud.loadState, 'no-data');
    assert.equal(opened.reader.snapshot.content.statusHud.character, 'H');
    assert.equal(opened.reader.snapshot.content.statusHud.emotion, '');
    assert.deepEqual(opened.reader.snapshot.content.statusHud.metrics, []);
    assert.equal(host.hasAttribute('hidden'), false);
    assert.equal(host.querySelector('.igs-hud-avatar-empty') != null, true);
    assert.equal(host.querySelector('.igs-hud-emotion'), null);
    assert.equal(host.querySelectorAll('.igs-hud-metric').length, 0);

    vn.destroy();
});


test('gate:simulation:stage-shake-settings-and-raw-emotion-drive-igs-stage-only', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 77,
                text: '[igs-scene:旧城|夜晚|晴天]\n[igs-char:H|震撼|台词内容]',
            }),
            typeAndSend: async () => ({ ok: true }),
        },
        config: {
            sceneAssets: { enabled: true, scenes: {}, characters: {}, characterAliases: {}, moodGroups: [] },
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');
    const disabled = settings.switchReaderSubTab('performance').snapshot.html;
    assert.match(disabled, /画面震动/);
    assert.doesNotMatch(disabled, /震动强度/);
    settings.setValue('readerSettings.stageShake.enabled', true);
    // 细项默认收起，点 › 展开。
    await settings.invoke(`ui-toggle-open:${encodeURIComponent('perf-stage-shake')}`);
    const enabled = settings.switchReaderSubTab('performance').snapshot.html;
    assert.match(enabled, /震动强度/);
    assert.match(enabled, /触发情绪/);
    settings.invoke('stage-shake-remove-emotion:%E9%9C%87%E6%92%BC');
    const adding = settings.invoke('stage-shake-add-emotion');
    answerSettingsDialog(document, '震撼');
    assert.equal((await adding).ok, true);
    assert.equal(settings.close().ok, true);
    const persisted = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.equal(persisted.stageShake.enabled, true);
    assert.equal(persisted.stageShake.intensity, 'medium');

    const overlay = document.getElementById('igs-overlay');
    const stage = overlay.querySelector('#igs-stage-motion');
    assert.ok(stage);
    assert.equal(stage.getAttribute('data-igs-stage-shake'), '1');
    assert.equal(stage.getAttribute('data-igs-stage-shake-intensity'), 'medium');
    assert.equal(overlay.getAttribute('data-igs-stage-shake'), null);

    vn.destroy();
});


test('gate:simulation:chat-show-pops-bubbles-per-click-then-pages-and-replays-fully-on-return', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        chatShow: { enabled: true, frame: 'none', contacts: { 爱丽丝: { aliases: ['alice_cat'], side: 'left', color: '#ffb3d1' } } },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage, SillyTavern: { getContext: () => ({ name1: '小明' }) } },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 91,
                text: '<content>\n[igs-scene:教室|下午|晴天]\n她低头看手机。\n[igs-chat:爱丽丝]\n[igs-msg:alice_cat|在吗？]\n[igs-msg:小明|在的。放学后见。]\n[igs-msg:alice_cat|好！]\n[igs-chat-end]\n她笑了。\n</content>',
            }),
            typeAndSend: async () => ({ ok: true }),
        },
        config: {
            sceneAssets: { enabled: true, scenes: {}, characters: {}, characterAliases: {}, moodGroups: [] },
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const reader = opened.reader.controller;
        const overlay = document.getElementById('igs-overlay');
        const content = () => vn.getState().igsUi.activeReader.snapshot.content;
        assert.equal(content().chatPage, false);
        await reader.invokeAction('next');
        assert.equal(content().chatPage, true);
        assert.equal(content().textType, 'chat');
        assert.equal(content().displayText, '');
        assert.deepEqual(content().chat.messages.map((m) => [m.displayName, m.side]), [['爱丽丝', 'left'], ['小明', 'right'], ['爱丽丝', 'left']]);
        assert.equal(overlay.classList.contains('igs-chat-page'), true);
        const layer = overlay.querySelector('#igs-chat-layer');
        assert.equal(layer.hidden, false);
        assert.equal(layer.getAttribute('data-igs-chat-frame'), 'none');
        const rows = () => layer.querySelector('.igs-chat-list').children;
        const visible = () => rows().filter((row) => !row.hidden).length;
        assert.equal(rows().length, 3);
        assert.equal(visible(), 1);
        assert.equal(rows()[0].children[0].children[0].style.background, '#ffb3d1');
        assert.equal((await reader.invokeAction('next')).reason, 'chat-revealed');
        assert.equal(visible(), 2);
        await reader.invokeAction('next');
        assert.equal(visible(), 3);
        await reader.invokeAction('next');
        assert.equal(content().chatPage, false);
        assert.equal(overlay.classList.contains('igs-chat-page'), false);
        assert.equal(layer.hidden, true);
        await reader.invokeAction('prev');
        assert.equal(content().chatPage, true);
        assert.equal(visible(), 3);
        layer.getBoundingClientRect = () => ({ left: 0, width: 1000 });
        layer.dispatchEvent({ type: 'click', target: layer, clientX: 100 });
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(content().chatPage, false);
        assert.equal(content().currentIndex, 0);
        await reader.invokeAction('next');
        assert.equal(content().chatPage, true);
        layer.dispatchEvent({ type: 'click', target: layer, clientX: 900 });
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(content().chatPage, false);
        assert.equal(content().currentIndex, 2);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:chat-show-options-wait-for-an-extra-forward-action-after-the-final-message', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ chatShow: { enabled: true, frame: 'none' } }));
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            AutoCardUpdaterAPI: {
                exportTableAsJson() {
                    return {
                        sheet_options: {
                            uid: 'sheet_options',
                            name: '选项表',
                            orderNo: 1,
                            content: [['row_id', '选项'], ['1', '回复她']],
                        },
                    };
                },
            },
        },
        autoAttachMagicWand: false,
        config: {
            optionBubble: {
                enabled: true,
                position: 'top-left',
                clickAction: 'fill',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 911,
                text: '[igs-chat:爱丽丝]\n[igs-msg:爱丽丝|在吗？]\n[igs-msg:<user>|在。]\n[igs-chat-end]',
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const reader = opened.reader.controller;
        const overlay = document.getElementById('igs-overlay');
        const rows = overlay.querySelector('#igs-chat-layer').querySelector('.igs-chat-list').children;
        const optionBubbles = overlay.querySelector('#igs-option-bubbles');
        const visibleCount = () => rows.filter((row) => !row.hidden).length;

        assert.equal(opened.reader.snapshot.content.progress, '1 / 1');
        assert.equal(visibleCount(), 1);
        assert.equal(optionBubbles.hasAttribute('hidden'), true);

        const completedChat = await reader.invokeAction('next');
        assert.equal(completedChat.reason, 'chat-revealed');
        assert.equal(visibleCount(), 2);
        assert.equal(optionBubbles.hasAttribute('hidden'), true);

        const revealedOptions = await reader.invokeAction('next');
        assert.equal(revealedOptions.reason, 'option-bubbles-toggled');
        assert.equal(optionBubbles.hasAttribute('hidden'), false);
        assert.equal(overlay.classList.contains('igs-options-visible'), true);
        assert.ok(CHAT_LAYER_STYLE_TEXT.includes('#igs-overlay.igs-options-visible #igs-chat-layer{display:none;}'));
        assert.equal(optionBubbles.querySelectorAll('.igs-option-bubble').length, 1);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:chat-show-disabled-falls-back-to-plain-transcript-page', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: createMemoryStorage() },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 92, text: '[igs-chat:A]\n[igs-msg:A|hi]\n[igs-msg:B|yo]\n[igs-chat-end]' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        await vn.openLatestAvailable('pc');
        const content = vn.getState().igsUi.activeReader.snapshot.content;
        assert.equal(content.chatPage, false);
        assert.equal(content.displayText, 'A：hi\nB：yo');
        assert.doesNotMatch(content.displayText, /igs-/);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:chat-show-auto-mode-schedules-and-next-reveals-all', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ chatShow: { enabled: true, revealMode: 'auto' } }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 93, text: '[igs-msg:A|1]\n[igs-msg:B|2]\n[igs-msg:A|3]' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const overlay = document.getElementById('igs-overlay');
        const rows = overlay.querySelector('#igs-chat-layer').querySelector('.igs-chat-list').children;
        assert.equal(rows.filter((row) => !row.hidden).length, 0);
        assert.equal((await opened.reader.controller.invokeAction('next')).reason, 'chat-revealed');
        assert.equal(rows.filter((row) => !row.hidden).length, 3);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:chat-show-settings-edit-contacts-and-inject-prompt-rule', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    const injected = [];
    const answers = ['爱丽丝', 'alice_cat'];
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            prompt: () => answers.shift() || '',
            SillyTavern: { getContext: () => ({ setExtensionPrompt: (id, text) => injected.push([id, text]) }) },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 94, text: '正文' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const settings = withSettingsDialogs(document, (await opened.reader.controller.invokeAction('settings')).controller, () => answers.shift() || '');
        settings.switchTab('reader');
        const disabled = settings.switchReaderSubTab('performance').snapshot.html;
        assert.match(disabled, /<span>线上交流<\/span>/);
        assert.doesNotMatch(disabled, /聊天外框/);
        settings.setValue('readerSettings.chatShow.enabled', true);
        await settings.invoke('chat-show-add-contact');
        await settings.invoke(`chat-show-add-alias:${encodeURIComponent('爱丽丝')}`);
        settings.setValue('readerSettings.chatShow.contacts.爱丽丝.side', 'right');
        await settings.invoke(`ui-toggle-open:${encodeURIComponent('perf-chat-show')}`);
        const enabled = settings.switchReaderSubTab('performance').snapshot.html;
        assert.match(enabled, /聊天外框/);
        assert.match(enabled, /alice_cat/);
        assert.match(enabled, /data-chat-prompt-draft/);
        assert.match(enabled, /返回看过的聊天页/);
        assert.match(enabled, /水泡/);
        settings.setValue('readerSettings.chatShow.sound.preset', 'water');
        assert.equal((await settings.invoke('chat-show-preview-sound')).previewed, 'water');
        assert.match(enabled, /正在使用默认提示词/);
        const draftBox = { tagName: 'TEXTAREA', value: '  自定义聊天规则：用 [igs-msg] 输出消息  ', getAttribute: (name) => (name === 'data-chat-prompt-draft' ? '1' : null) };
        document.getElementById('igs-unified-settings').parentNode.dispatchEvent({ type: 'input', target: draftBox });
        await settings.invoke('chat-show-save-prompt');
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).chatShow.promptRule, '自定义聊天规则：用 [igs-msg] 输出消息');
        assert.match(String(injected.filter(([id]) => id === 'igs-scene-assets-format-rule').at(-1)[1]), /自定义聊天规则/);
        assert.doesNotMatch(String(injected.filter(([id]) => id === 'igs-scene-assets-format-rule').at(-1)[1]), /\[igs-chat:会话标题\]/);
        assert.match(settings.switchReaderSubTab('performance').snapshot.html, /自定义提示词已保存/);
        await invokeConfirmed(settings, document, 'chat-show-reset-prompt');
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).chatShow.promptRule, '');
        assert.equal(settings.close().ok, true);
        const persisted = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
        assert.equal(persisted.chatShow.enabled, true);
        assert.deepEqual(persisted.chatShow.contacts, { 爱丽丝: { aliases: ['alice_cat'], color: '', side: 'right' } });
        // 恢复默认后聊天块回到按需：主注入只留索引行，完整写法等触发时再附。
        const lastMain = String(injected.filter(([id]) => id === 'igs-scene-assets-format-rule').at(-1)[1]);
        assert.match(lastMain, /【按需】.*线上聊天/);
        assert.doesNotMatch(lastMain, /自定义聊天规则/);
    } finally {
        vn.destroy();
    }
});


test('gate:simulation:chat-layer-typing-indicator-message-types-and-theme-vars', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const root = document.createElement('div');
    root.id = 'igs-overlay';
    document.body.appendChild(root);
    const timers = [];
    const ctx = {
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimeout: () => {},
    };
    const runNext = () => timers.shift().fn();
    const settings = normalizeChatShowSettings({ enabled: true, revealMode: 'auto', showAvatars: true, followTheme: true, sound: { enabled: false } });
    const chat = buildChatPageModel({ title: 'A', messages: [
        { kind: 'time', text: '昨天 22:14' },
        { kind: 'msg', sender: 'A', text: '看！', type: '图片' },
        { kind: 'msg', sender: 'A', text: '晚安晚安晚安晚安', type: '语音' },
        { kind: 'msg', sender: '{{user}}', text: '（猫猫点头）', type: '表情包' },
        { kind: 'msg', sender: 'A', text: '', type: '撤回' },
    ] }, settings, { userName: '小明', theme: resolveChatTheme('cute-pink') });
    applyChatToDom(root, { messageId: 1, content: { chatPage: true, chat, currentIndex: 0 }, readerSettings: { chatShow: settings } }, ctx);
    const layer = root.querySelector('#igs-chat-layer');
    const list = layer.querySelector('.igs-chat-list');
    const visible = () => list.children.filter((row) => !row.hidden && !row.className.includes('is-typing'));
    const typing = () => list.children.some((row) => row.className.includes('is-typing'));

    assert.equal(layer.getAttribute('data-igs-chat-theme'), 'cute-pink');
    assert.equal(layer.style['--igs-chat-shell'], '#fff0f5');
    assert.ok(layer.style['--igs-chat-font']);
    assert.equal(timers[0].ms, 250);
    runNext();
    assert.equal(visible().length, 1);
    assert.equal(visible()[0].className.includes('is-time'), true);

    assert.equal(timers[0].ms < 900, true);
    runNext();
    assert.equal(typing(), true);
    assert.equal(visible().length, 1);
    runNext();
    assert.equal(typing(), false);
    assert.equal(visible().length, 2);
    const imageRow = visible()[1];
    assert.equal(imageRow.className.includes('has-avatar'), true);
    assert.equal(imageRow.children[0].className, 'igs-chat-avatar is-initial');
    const imageBubble = imageRow.children[1].children[0];
    assert.equal(imageBubble.className, 'igs-chat-bubble is-image');
    assert.equal(imageBubble.children[1].textContent, '看！');

    assert.equal(timers[0].ms, 570);
    runNext();
    assert.equal(typing(), false);
    const voiceBody = visible()[2].children[1];
    assert.equal(voiceBody.children[0].className, 'igs-chat-bubble is-voice');
    assert.equal(voiceBody.children[0].children[1].textContent, "2''");
    assert.equal(voiceBody.children[1].textContent, '晚安晚安晚安晚安');

    runNext();
    assert.equal(typing(), false);
    const stickerRow = visible()[3];
    assert.equal(stickerRow.className.includes('is-right'), true);
    assert.equal(stickerRow.children[1].children[0].className, 'igs-chat-sticker');

    assert.equal(advanceChatReveal(root), true);
    assert.equal(visible().length, 5);
    assert.equal(visible()[4].children[0].textContent, 'A撤回了一条消息');
    assert.equal(getChatRevealState(root).typing, false);
    assert.equal(cancelChatShow(root), true);
});


test('gate:simulation:system-role-lines-use-own-style-and-hide-speaker-and-sprite', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ systemRole: { color: '#33ccff', align: 'center' } }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage, prompt: () => '【公告】' },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 95, text: '[igs-scene:Room|晚上|晴天]\n[igs-char:Alice|平和|你好。]\n[igs-char:【系统】|平静|任务已更新。]\n[igs-msg:系统|获得道具：钥匙]' }),
            typeAndSend: async () => ({ ok: true }),
        },
        config: {
            sceneAssets: { enabled: true, scenes: {}, characters: { Alice: { 平和: 'https://example.com/alice.png' } }, characterAliases: {}, moodGroups: [] },
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const content = () => vn.getState().igsUi.activeReader.snapshot.content;
        assert.equal(content().textType, 'dialogue');
        assert.equal(content().speaker, 'Alice');
        await opened.reader.controller.invokeAction('next');
        assert.equal(content().textType, 'system');
        assert.equal(content().speaker, '');
        assert.equal(content().displayText, '任务已更新。');
        assert.match(String(content().spriteImage || ''), /alice\.png/);
        assert.equal(content().statusHud.character || '', '');
        const overlay = document.getElementById('igs-overlay');
        assert.equal(overlay.querySelector('.igs-dialog').getAttribute('data-igs-text-type'), 'system');
        assert.equal(overlay.querySelector('#igs-text').style.color, '#33ccff');
        await opened.reader.controller.invokeAction('next');
        assert.equal(content().chatPage, false);
        assert.equal(content().textType, 'system');
        assert.equal(content().displayText, '获得道具：钥匙');
        await opened.reader.controller.invokeAction('prev');

        const settings = withSettingsDialogs(document, (await opened.reader.controller.invokeAction('settings')).controller, () => '【公告】');
        settings.switchTab('reader');
        const html = settings.switchReaderSubTab('text').snapshot.html;
        assert.match(html, /系统角色/);
        assert.match(html, /角色词池/);
        await settings.invoke('system-role-add-word');
        await settings.invoke(`system-role-remove-word:${encodeURIComponent('系统')}`);
        settings.setValue('readerSettings.systemRole.showName', true);
        await settings.invoke('system-role-follow-color');
        assert.equal(settings.close().ok, true);
        const persisted = JSON.parse(storage.getItem('igs-reader-settings-v9-default')).systemRole;
        assert.equal(persisted.words.includes('公告'), true);
        assert.equal(persisted.words.includes('系统'), false);
        assert.equal(persisted.showName, true);
        assert.equal(persisted.color, '');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:chat-return-modes-full-replay-restart', () => {
    for (const [returnMode, expectVisible, expectTimer] of [['full', 3, false], ['replay', 0, true], ['restart', 1, false]]) {
        const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
        const root = document.createElement('div');
        root.id = 'igs-overlay';
        document.body.appendChild(root);
        const timers = [];
        const ctx = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} };
        const settings = normalizeChatShowSettings({ enabled: true, returnMode, sound: { enabled: false } });
        const chat = buildChatPageModel({ messages: ['1', '2', '3'].map((text) => ({ kind: 'msg', sender: 'A', text })) }, settings, {});
        const page = (index) => ({ messageId: 7, content: index === 0 ? { chatPage: true, chat, currentIndex: 0 } : { chatPage: false, currentIndex: 1 }, readerSettings: { chatShow: settings } });
        applyChatToDom(root, page(0), ctx);
        advanceChatReveal(root);
        advanceChatReveal(root);
        applyChatToDom(root, page(1), ctx);
        applyChatToDom(root, page(0), ctx);
        const state = getChatRevealState(root);
        assert.equal(state.revealed, expectVisible, returnMode);
        assert.equal(state.pending, expectTimer, returnMode);
        if (returnMode === 'replay') {
            while (timers.length) timers.shift().fn();
            assert.equal(getChatRevealState(root).revealed, 3);
            assert.equal(getChatRevealState(root).typing, false);
        }
        cancelChatShow(root);
    }
});


test('gate:simulation:gradient-veil-applies-settings-and-clears-on-skin-switch', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        dialogSkin: 'gradient-veil',
        gradientVeil: {
            color: '#112233',
            heightPercent: 70,
            opacity: 0.55,
            speakerStyle: 'plain-text',
        },
    }));
    const document = createFakeDocument({ innerWidth: 880, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 1,
                text: '[igs-scene:Room|晚上|晴天]\n[igs-char:Alice|平和|台词]',
            }),
            typeAndSend: async () => ({ ok: true }),
        },
        config: {
            sceneAssets: {
                enabled: true,
                scenes: {},
                characters: { Alice: { 平和: 'sprite' } },
                characterAliases: {},
                moodGroups: [],
            },
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const dialog = overlay.querySelector('#igs-dialog');
    const veil = overlay.querySelector('#igs-gradient-veil');
    const readStyle = (name) => typeof overlay.style.getPropertyValue === 'function'
        ? overlay.style.getPropertyValue(name)
        : overlay.style[name];
    assert.equal(veil.parentNode.id, 'igs-dialog-layer');
    assert.equal(veil.hidden, false);
    assert.equal(veil.style.display, 'block');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'gradient-veil');
    assert.equal(dialog.getAttribute('data-igs-speaker-style'), 'plain-text');
    assert.equal(readStyle('--igs-gradient-veil-height'), '70%');
    assert.equal(readStyle('--igs-gradient-veil-color'), 'rgba(17,34,51,0.55)');
    assert.equal(readStyle('--igs-dialog-bg'), 'rgba(17,34,51,0.55)');

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.switchTab('reader');
    const dialogView = settings.switchReaderSubTab('dialog');
    assert.match(dialogView.snapshot.html, /渐变黑幕/);
    assert.match(dialogView.snapshot.html, /data-path="readerSettings\.gradientVeil\.heightPercent"/);
    assert.match(dialogView.snapshot.html, /纯文字/);
    settings.setValue('readerSettings.dialogSkin', 'default');
    assert.equal(veil.hidden, false);
    assert.equal(settings.close().ok, true);
    assert.equal(veil.hidden, true);
    assert.equal(veil.style.display, 'none');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), null);
    assert.equal(dialog.getAttribute('data-igs-speaker-style'), null);
    assert.equal(overlay.classList.contains('igs-gradient-veil-active'), false);
    const saved = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.deepEqual(saved.gradientVeil, {
        color: '#112233',
        heightPercent: 70,
        opacity: 0.55,
        speakerStyle: 'plain-text',
    });
    vn.destroy();
});

test('gate:simulation:illustrated-dialog-skins-roundtrip-through-reader', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ dialogSkin: 'plant-coffee' }));
    const document = createFakeDocument({ innerWidth: 880, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '[igs-char:Alice|平和|植物咖啡测试]' }),
            typeAndSend: async () => ({ ok: true }),
        },
        config: {
            sceneAssets: { enabled: true, scenes: {}, characters: {}, characterAliases: {}, moodGroups: [] },
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    const overlay = document.getElementById('igs-overlay');
    const dialog = overlay.querySelector('#igs-dialog');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'plant-coffee');
    let settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const commit = () => {
        assert.equal(settings.close().ok, true);
        settings = opened.reader.controller.openSettings('reader').controller;
    };
    const name = overlay.querySelector('#igs-speaker');
    const text = overlay.querySelector('#igs-text');
    assert.equal(Object.hasOwn(settings.getSnapshot().draft.readerSettings, 'dialogFont'), false);
    assert.equal(name.style.display, 'block');
    assert.equal(name.style.fontWeight || '', '');
    assert.equal(text.style.fontWeight || '', '');
    settings.setValue('readerSettings.dialogTextEffect', 'outline');
    commit();
    assert.equal(text.style.textShadow, 'none', 'hard outline replaces illustrated skin shadow');
    assert.match(text.style.webkitTextStroke, /^1\.6px rgba\(0,0,0,0\.2\)$/);
    assert.equal(text.style.paintOrder, 'stroke fill');
    settings.setValue('readerSettings.dialogTextEffect', 'off');
    commit();
    assert.equal(text.style.textShadow, '', 'off restores skin CSS');
    assert.equal(text.style.webkitTextStroke, '');
    assert.equal(text.style.paintOrder, '');
    settings.setValue('readerSettings.dialogFontWeight', '700');
    commit();
    assert.equal(name.style.fontWeight, '', 'skin nameplate keeps its own weight');
    assert.equal(text.style.fontWeight, '700');
    assert.equal(dialog.style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-input').style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-ctrl-bar').style.fontWeight || '', '');
    settings.setValue('readerSettings.vnTheme.nameFont', '"IGS Rounded","Microsoft YaHei",sans-serif');
    commit();
    assert.doesNotMatch(name.style.fontFamily, /IGS Rounded/, 'skin nameplate keeps its own font');
    settings.setValue('readerSettings.vnTheme.textFont', '"IGS Rounded","Microsoft YaHei",sans-serif');
    commit();
    assert.match(text.style.fontFamily, /IGS Rounded/);
    settings.setValue('readerSettings.dialogFontWeight', 'null');
    commit();
    assert.equal(name.style.fontWeight, '');
    assert.equal(text.style.fontWeight, '');
    settings.switchTab('reader');
    const dialogView = settings.switchReaderSubTab('dialog');
    assert.match(dialogView.snapshot.html, /植物咖啡/);
    assert.match(dialogView.snapshot.html, /黑白漫画/);
    assert.match(dialogView.snapshot.html, /超可爱粉/);
    for (const label of ['复古日式', '冒险旅途', '日间简约', '温暖绘本', '优雅欧式']) assert.match(dialogView.snapshot.html, new RegExp(label));
    settings.setValue('readerSettings.dialogSkin', 'black-white-manga');
    commit();
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'black-white-manga');
    settings.setValue('readerSettings.dialogSkin', 'cute-pink');
    assert.equal(settings.close().ok, true);
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'cute-pink');
    const saved = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.equal(saved.dialogSkin, 'cute-pink');
    vn.destroy();
});

test('gate:illustration:image-log-subtab-renders-and-clears', async () => {
    const { createImageJobLog } = await import('../src/generated-images/image-job-log.js');
    const storage = createMemoryStorage();
    const imageJobLog = createImageJobLog({ storage });
    const vn = bootstrapIGS({
        imageJobLog,
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        imageJobLog.add('error', '第 3 楼插图规划失败，未发送生图请求：副 LLM 请求失败：<CORS>');
        const opened = vn.openSettings({ tab: 'image', mode: 'pc' });
        const logs = opened.controller.switchImageSubTab('logs').snapshot;
        assert.match(logs.html, /data-image-pane="logs"/);
        assert.match(logs.html, /data-path="bridge\.imageJobLog\.retainDays"/);
        assert.match(logs.html, /data-action="image-log-clear"/);
        assert.match(logs.html, /未发送生图请求/);
        assert.match(logs.html, /&lt;CORS&gt;/);
        await opened.controller.invoke('image-log-clear');
        assert.equal(imageJobLog.list().length, 0);
        assert.match(opened.controller.getSnapshot().html, /已清空 1 条日志/);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:igs-fx-tag-next-to-dialogue-lands-on-its-page', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = [
        '[igs-scene:Room|day|clear]',
        '[igs-char:Alice|默认|先说一句。]',
        '[igs-fx:sfx|砰]',
        '[igs-char:Alice|默认|再说一句。]',
        '[igs-fx:sfx|嗒]',
        '[igs-thought:Alice|默认|心里想着。]',
        '[igs-fx:sfx|咚]',
        '[igs-char:Alice|默认|最后一句。]',
    ].join('\n');
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: { sceneAssets: { enabled: true, scenes: {}, characters: { Alice: { 默认: 'https://example.com/alice.png' } } } },
            readerSettings: { fxTags: { enabled: true }, fxSound: { enabled: false } },
        }),
    });
    try {
        const opened = host.openReader({ messageId: 42, message: { id: 42, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        const pages = [];
        for (let guard = 0; guard < 12; guard += 1) {
            const content = host.getState().activeReader.snapshot.content;
            pages.push({
                text: String(content.segments[content.currentIndex] || ''),
                sfx: content.fx.instants.filter((item) => item.kind === 'sfx').map((item) => item.text),
            });
            if (content.currentIndex >= content.segments.length - 1) break;
            opened.controller.invokeAction('next');
        }
        const at = (needle) => pages.find((page) => page.text.includes(needle)) || { text: '', sfx: ['<page-missing>'] };
        assert.deepEqual(at('先说一句').sfx, []);
        assert.deepEqual(at('再说一句').sfx, ['砰']);
        assert.deepEqual(at('心里想着').sfx, ['嗒']);
        assert.deepEqual(at('最后一句').sfx, ['咚']);
    } finally {
        host.destroy();
    }
});

test('gate:simulation:igs-fx-tags-stay-out-of-text-and-drive-page-fx', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '[igs-scene:Room|night|clear]\n[igs-fx:flashback]\n[igs-fx:sfx|砰]一段。\n[igs-fx:call|Alice]\n二段。\n[igs-fx:flashback-end][igs-fx:call-end]\n三段。';
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerSettings: { fxTags: { enabled: true }, fxSound: { enabled: false } },
        }),
    });
    const opened = host.openReader({ messageId: 41, message: { id: 41, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const first = host.getState().activeReader.snapshot.content;
    assert.ok(first.segments.length >= 3);
    assert.ok(first.segments.every((segment) => !segment.includes('[igs-fx')));
    assert.deepEqual(first.fx.instants, [{ kind: 'sfx', text: '砰' }]);
    assert.equal(first.fx.flashback, true);
    const motion = document.getElementById('igs-stage-motion');
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), '1');
    opened.controller.invokeAction('next');
    const second = host.getState().activeReader.snapshot.content;
    assert.deepEqual(second.fx.instants, [{ kind: 'call', name: 'Alice', dir: 'in', mode: 'voice' }]);
    assert.equal(second.fx.call.name, 'Alice');
    assert.equal(second.fx.call.mode, 'voice');
    assert.equal(motion.getAttribute('data-igs-fx-call'), 'voice');
    opened.controller.invokeAction('next');
    const third = host.getState().activeReader.snapshot.content;
    assert.deepEqual(third.fx.instants, [{ kind: 'call-end', reason: 'end', name: 'Alice', dir: 'in', mode: 'voice' }]);
    assert.equal(third.fx.flashback, false);
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), null);
    host.destroy();
});

test('gate:simulation:ancient-era-filters-modern-fx-from-prompt-and-reader', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage();
    const injected = [];
    const vn = bootstrapIGS({
        global: {
            document,
            localStorage: storage,
            prompt: () => '',
            confirm: () => true,
            SillyTavern: { getContext: () => ({ setExtensionPrompt: (id, text) => injected.push([id, text]) }) },
        },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 95, text: '[igs-fx:call|师兄]\n一段。\n[igs-fx:flashback]\n二段。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        // 设置在关闭面板时落盘，落盘后重新注入提示词。
        const openSettings = async () => withSettingsDialogs(document, (await opened.reader.controller.invokeAction('settings')).controller, (kind) => (kind === 'confirm' ? true : names.shift() || ''));
        let settings = await openSettings();
        settings.setValue('readerSettings.fxTags.enabled', true);
        settings.setValue('readerSettings.dailyFx.enabled', true);
        settings.setValue('readerSettings.chatShow.enabled', true);
        settings.setValue('bridge.sceneAssets.promptAdaptive', false);
        assert.equal(settings.close().ok, true);
        const mainPrompt = () => String(injected.filter(([id]) => id === 'igs-scene-assets-format-rule').at(-1)[1]);
        const modernPrompt = mainPrompt();
        assert.match(modernPrompt, /igs-fx:call\|/);
        assert.match(modernPrompt, /igs-fx:photo\|/);
        assert.match(modernPrompt, /igs-chat/);
        assert.doesNotMatch(modernPrompt, /igs时代背景/);

        settings = await openSettings();
        settings.switchTab('scene');
        settings.setValue('bridge.sceneAssets.enabled', true);
        // 时代只在一键档位条的「适配世界」下拉里切换，场景素材页不再有勾选框。
        assert.doesNotMatch(settings.getSnapshot().html, /data-path="bridge\.sceneAssets\.ancient"/);
        await invokeConfirmed(settings, document, 'worldview:ancient');
        assert.equal(settings.close().ok, true);
        const ancientPrompt = mainPrompt();
        assert.match(ancientPrompt, /igs时代背景/);
        assert.match(ancientPrompt, /一炷香后/);
        assert.match(ancientPrompt, /igs-fx:flashback/, 'eras keep universal tags');
        assert.match(ancientPrompt, /igs-fx:timeskip\|/);
        assert.doesNotMatch(ancientPrompt, /igs-fx:call\|/);
        assert.doesNotMatch(ancientPrompt, /igs-fx:photo\|/);
        assert.doesNotMatch(ancientPrompt, /igs-fx:tv\|/);
        // 聊天换成书信往来、通知换成家仆通报：标签不变，只换说法。
        assert.match(ancientPrompt, /【书信往来】/);
        assert.match(ancientPrompt, /\[igs-msg:写信人\|信的内容\]/);
        assert.doesNotMatch(ancientPrompt, /【线上聊天】/);
        assert.doesNotMatch(ancientPrompt, /表情包/);
        assert.match(ancientPrompt, /igs-fx:notify\|来人\|/);
        assert.doesNotMatch(ancientPrompt, /手机弹出/);
        // 开关不改存档里的演出设置，关掉古代背景后原样恢复。
        const saved = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
        assert.notEqual(saved.fxTags.call, false);
        assert.notEqual(saved.dailyFx.photo, false);
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:ancient-era-reader-strips-and-skips-modern-fx', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = '[igs-scene:Room|night|clear]\n[igs-fx:call|师兄]\n[igs-fx:flashback]\n一段。';
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: { sceneAssets: { enabled: true, ancient: true, scenes: {}, characters: {} } },
            readerSettings: { fxTags: { enabled: true }, fxSound: { enabled: false } },
        }),
    });
    const opened = host.openReader({ messageId: 42, message: { id: 42, text: raw }, raw }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const content = host.getState().activeReader.snapshot.content;
    assert.ok(content.segments.every((segment) => !segment.includes('[igs-fx')));
    // 快照里是原始解析结果；按开关过滤在播放时进行，古代模式下 call 开关已被拨成关。
    assert.equal(host.getState().activeReader.snapshot.readerSettings.fxTags.call, false);
    const motion = document.getElementById('igs-stage-motion');
    assert.equal(motion.getAttribute('data-igs-fx-call'), null);
    assert.equal(motion.querySelector('.igs-fx-call-screen'), null);
    assert.equal(motion.getAttribute('data-igs-fx-flashback'), '1');
    host.destroy();
});

test('gate:simulation:ancient-era-chat-renders-as-vertical-letters', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const root = document.createElement('div');
    root.id = 'igs-overlay';
    document.body.appendChild(root);
    const timers = [];
    const ctx = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} };
    const settings = normalizeChatShowSettings({ enabled: true, revealMode: 'auto', frame: 'phone', showAvatars: true, sound: { enabled: false } });
    const chat = buildChatPageModel({ title: '致师兄', messages: [
        { kind: 'time', text: '三日后' },
        { kind: 'msg', sender: 'A', text: '见字如面。', type: '' },
        { kind: 'msg', sender: 'A', text: '院中梅花', type: '图片' },
        { kind: 'msg', sender: '{{user}}', text: '安好，勿念。', type: '' },
    ] }, settings, { userName: '小明' });
    applyChatToDom(root, { messageId: 3, content: { chatPage: true, chat, currentIndex: 0 }, readerSettings: { chatShow: settings, _ancientEra: true } }, ctx);
    const layer = root.querySelector('#igs-chat-layer');
    assert.equal(layer.getAttribute('data-igs-chat-era'), 'ancient');
    assert.equal(layer.getAttribute('data-igs-chat-frame'), 'letter', 'phone frame is not used for letters');
    while (timers.length) timers.shift().fn();
    const rows = layer.querySelector('.igs-chat-list').children.filter((row) => !row.hidden);
    assert.equal(rows.length, 4);
    assert.equal(rows[0].className.includes('is-time'), true);
    const letter = rows[1];
    assert.equal(letter.className.includes('is-letter'), true);
    assert.equal(letter.querySelector('.igs-chat-avatar'), null, 'letters have no avatars');
    assert.equal(letter.querySelector('.igs-chat-letter-text').textContent, '见字如面。');
    assert.equal(letter.querySelector('.igs-chat-letter-sign').textContent, 'A');
    assert.equal(rows[2].querySelector('.igs-chat-letter-text').textContent, '〔附画〕院中梅花');
    assert.equal(rows[3].className.includes('is-right'), true);
    assert.match(CHAT_LAYER_STYLE_TEXT, /\.igs-chat-letter\{[^}]*writing-mode:vertical-rl/);
    // 关掉古代背景后同一页重绘回手机聊天。
    applyChatToDom(root, { messageId: 3, content: { chatPage: true, chat, currentIndex: 0 }, readerSettings: { chatShow: settings } }, ctx);
    assert.equal(layer.getAttribute('data-igs-chat-frame'), 'phone');
    assert.equal(layer.querySelector('.igs-chat-letter'), null);
    // 换皮世界观：手机聊天框另挂 data-igs-chat-world，era 仍为 modern、外框不变；古代与现代不挂。
    for (const id of ['fantasy', 'scifi', 'apocalypse', 'taisho']) {
        applyChatToDom(root, { messageId: 3, content: { chatPage: true, chat, currentIndex: 0 }, readerSettings: { chatShow: settings, _worldview: id } }, ctx);
        assert.equal(layer.getAttribute('data-igs-chat-era'), 'modern', id);
        assert.equal(layer.getAttribute('data-igs-chat-world'), id, id);
        assert.equal(layer.getAttribute('data-igs-chat-frame'), 'phone', id);
        assert.ok(CHAT_LAYER_STYLE_TEXT.includes(`#igs-chat-layer[data-igs-chat-world="${id}"] .igs-chat-head{`), id);
    }
    applyChatToDom(root, { messageId: 3, content: { chatPage: true, chat, currentIndex: 0 }, readerSettings: { chatShow: settings, _ancientEra: true, _worldview: 'ancient' } }, ctx);
    assert.equal(layer.getAttribute('data-igs-chat-era'), 'ancient');
    assert.equal(layer.getAttribute('data-igs-chat-world'), null, 'ancient carries no world skin');
    applyChatToDom(root, { messageId: 3, content: { chatPage: true, chat, currentIndex: 0 }, readerSettings: { chatShow: settings } }, ctx);
    assert.equal(layer.getAttribute('data-igs-chat-world'), null, 'modern carries no world skin');

});

test('gate:assets:reader-cg-and-asset-buttons-are-independent', async () => {
    const document = createFakeDocument();
    const raw = '[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。';
    const assetCalls = [];
    const cgCalls = [];
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: {} }),
        getIllustrationSource: () => ({ chatId: 'chat-1', messageId: 39, swipeId: 0, isAi: true, isLatest: true, text: raw }),
        generatedAssets: { async processMessage(...args) { assetCalls.push(args); return { ok: true, reason: 'done', count: 1 }; } },
        illustrations: { async processMessage(...args) { cgCalls.push(args); return { ok: true, reason: 'done', count: 2 }; } },
    });
    try {
        const opened = host.openReader({ messageId: 39, message: { id: 39, text: raw }, raw }, { mode: 'pc' });
        const overlay = document.getElementById('igs-overlay');
        assert.ok(overlay.querySelector('[data-act="regen"]'));
        const clearCgButton = overlay.querySelector('[data-act="clear-cg"]');
        assert.ok(clearCgButton);
        assert.equal(clearCgButton.disabled, true, '没有当前 CG 时清扫按钮必须禁用');
        assert.ok(overlay.querySelector('[data-act="generate-assets"]'));
        assert.equal((await opened.controller.invokeAction('regen')).count, 2);
        assert.deepEqual([cgCalls.length, assetCalls.length], [1, 0], '画 CG 不应顺带补素材');
        assert.match(host.getState().activeReader.generationTip, /插图完成：已生成 2 张/);
        await opened.controller.invokeAction('generate-assets');
        assert.deepEqual([cgCalls.length, assetCalls.length], [1, 1], '补全素材不应顺带画 CG');
    } finally { host.destroy(); }
});

test('gate:settings:advanced-fields-collapse-and-remember-open-state', () => {
    const document = createFakeDocument();
    const vn = bootstrapIGS({ global: { document }, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'image', mode: 'pc' }).controller;
        controller.setValue('bridge.imageApi.mode', 'nai');
        const root = document.getElementById('igs-unified-settings').parentNode;
        let html = controller.getSnapshot().html;
        assert.match(html, /<details[^>]*data-advanced="nai"(?![^>]*\sopen)[^>]*>[\s\S]*?data-path="bridge\.autoIllustration\.nai\.steps"/, '采样参数默认收在高级里');
        assert.match(html, /data-path="bridge\.autoIllustration\.nai\.apiKey"/);
        root.dispatchEvent({ type: 'toggle', target: { open: true, getAttribute: (name) => (name === 'data-advanced' ? 'nai' : null) } });
        controller.setValue('bridge.autoIllustration.nai.model', 'nai-diffusion-4-full');
        assert.match(controller.getSnapshot().html, /data-advanced="nai" open/, '重渲染后保持展开');
        controller.switchImageSubTab('auto');
        html = controller.getSnapshot().html;
        assert.match(html, /data-image-feature="asset-options" hidden/, '素材开关都关着时不显示数量与尺寸');
        assert.match(html, /data-path="bridge\.imageApi\.cgModel"/, '剧情 CG 模型跟着 CG 卡片');
        assert.match(html, /data-path="bridge\.imageApi\.itemModel"/, '物品模型跟着场景与物品卡片');
        controller.toggle('bridge.autoIllustration.assets.backgroundEnabled');
        html = controller.getSnapshot().html;
        assert.doesNotMatch(html, /data-image-feature="asset-options" hidden/);
        assert.match(html, /需先在「素材」页开启场景素材模式/);
    } finally { vn.destroy(); }
});


test('gate:simulation:asset-folders-stay-local-and-do-not-touch-scene-assets', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument();
    const answers = ['学校'];
    const vn = bootstrapIGS({
        global: { document, localStorage: storage, prompt: () => answers.shift() || '', confirm: () => true, alert: () => {} },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '文件夹测试。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const settings = withSettingsDialogs(document, opened.reader.controller.openSettings('scene').controller, (kind) => (kind === 'confirm' ? true : answers.shift() || ''));
        const before = JSON.stringify(settings.getSnapshot().draft.bridge.sceneAssets);

        await settings.invoke('asset-folder-add:scenes');
        await settings.invoke('asset-folder-move:scenes:' + encodeURIComponent('教室') + ':' + encodeURIComponent('学校'));
        await settings.invoke('asset-view:scenes:grid');

        const saved = JSON.parse(storage.getItem('igs-asset-folders-v1'));
        const scope = Object.values(saved.scopes)[0];
        assert.deepEqual(scope.scenes.folders, ['学校']);
        assert.equal(scope.scenes.assign['教室'], '学校');
        assert.equal(scope.scenes.view, 'grid');
        assert.equal(JSON.stringify(settings.getSnapshot().draft.bridge.sceneAssets), before);

        // 缩略图模式下点「修改」：切回列表、展开所在文件夹，归属与素材草稿都不变。
        await settings.invoke('asset-folder-toggle:scenes:' + encodeURIComponent('学校'));
        assert.deepEqual(Object.values(JSON.parse(storage.getItem('igs-asset-folders-v1')).scopes)[0].scenes.collapsed, ['学校']);
        await settings.invoke('asset-edit:scenes:' + encodeURIComponent('教室'));
        const edited = Object.values(JSON.parse(storage.getItem('igs-asset-folders-v1')).scopes)[0];
        assert.equal(edited.scenes.view, 'list');
        assert.deepEqual(edited.scenes.collapsed, []);
        assert.equal(edited.scenes.assign['教室'], '学校');
        assert.equal(JSON.stringify(settings.getSnapshot().draft.bridge.sceneAssets), before);

    } finally {
        vn.destroy?.();
    }
});

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

test('gate:simulation:outfit-paging-inherits-switches-resets-and-isolates-layout-keys', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const storage = createMemoryStorage({ igs_bridge_config: outfitBridgeConfig() });
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        spriteLayouts: {
            'pc::小林海斗::喜悦': { posX: 11, posY: 71, scale: 111 },
            'pc::小林海斗': { posX: 22, posY: 72, scale: 122 },
            'pc::小林海斗|泳装::喜悦': { posX: 33, posY: 73, scale: 133 },
        },
        spriteHeads: { '小林海斗::喜悦': { x: 0.1, top: 0.1, w: 0.2 }, 小林海斗: { x: 0.2, top: 0.2, w: 0.2 }, '小林海斗|泳装::喜悦': { x: 0.3, top: 0.3, w: 0.2 } },
    }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({
                id: 30,
                text: [
                    '<content>',
                    '[igs-char:小林海斗|喜悦|制服|早上好。]',
                    '旁白一。',
                    '[igs-char:小林|喜悦|泳装|去海边吧。]',
                    '旁白二。',
                    '[igs-char:小林海斗|喜悦|浪花好大。]',
                    '[igs-char:小林海斗|喜悦|默认|换回来了。]',
                    '[igs-char:小林海斗|喜悦|未登记|这句是对白。]',
                    '</content>',
                ].join('\n'),
            }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const { resolveSpriteHead } = await import('../src/visual/igs-ui/fx-anchor.js');
    try {
        const opened = await vn.openLatestAvailable('pc');
        const controller = opened.reader.controller;
        const content = () => vn.getState().igsUi.activeReader.snapshot.content;
        const sprite = () => document.getElementById('igs-overlay').querySelector('#igs-sprite');
        const heads = () => vn.getState().igsUi.activeReader.snapshot.readerSettings.spriteHeads;
        const expectPage = (textType, url, outfit, position, head) => {
            const c = content();
            assert.equal(c.textType, textType, c.displayText);
            assert.equal(c.spriteImage, url, c.displayText);
            assert.equal(c.spriteOutfit, outfit, c.displayText);
            assert.equal(sprite().style.backgroundPosition, position, c.displayText);
            assert.deepEqual(resolveSpriteHead(heads(), c.spriteCharacter, c.spriteMood, c.spriteOutfit), head, c.displayText);
        };
        const base = ['https://example.com/base-joy.png', '', '11% 71%', { x: 0.1, top: 0.1, w: 0.2 }];
        // 服装未单独调过位置 / 标定时沿用角色整体值，不借用原有立绘的单表情值。
        const school = ['https://example.com/school-joy.png', '校服', '22% 72%', { x: 0.2, top: 0.2, w: 0.2 }];
        const swim = ['https://example.com/swim-joy.png', '泳装', '33% 73%', { x: 0.3, top: 0.3, w: 0.2 }];

        const ghost = () => document.getElementById('igs-overlay').querySelector('#igs-sprite-ghost');
        expectPage('dialogue', ...school);
        assert.doesNotMatch(content().displayText, /制服|\|/);
        assert.equal(ghost(), null, 'first sprite has no swap');
        await controller.invokeAction('next');
        expectPage('narration', ...school);
        assert.equal(ghost(), null, 'same outfit has no swap');
        await controller.invokeAction('next');
        expectPage('dialogue', ...swim);
        assert.doesNotMatch(content().displayText, /泳装/);
        assert.equal(ghost(), null, 'same character outfit change cuts directly');
        assert.equal(sprite().classList.contains('igs-sprite-outfit-in'), false);

        await controller.invokeAction('next');
        expectPage('narration', ...swim);
        await controller.invokeAction('next');
        expectPage('dialogue', ...swim);
        await controller.invokeAction('next');
        expectPage('dialogue', ...base);
        // 未登记的服装栏：丢掉该栏，照常按表情显示原装立绘，并记入待确认服装词。
        await controller.invokeAction('next');
        expectPage('dialogue', ...base);
        assert.equal(content().displayText, '这句是对白。');
        assert.deepEqual(JSON.parse(storage.getItem('igs:outfit-review:v1')).items, [{ character: '小林海斗', word: '未登记' }]);
    } finally {
        vn.destroy();
    }
    assert.equal(document.getElementById('igs-overlay'), null);
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
        assert.equal(opened.reader.snapshot.content.spriteOutfit, '');
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
    assert.deepEqual(await run(null, ''), ['', 'https://example.com/base-joy.png']);
});

test('gate:simulation:outfit-settings-add-slot-url-persist-reopen-and-custom-rule-hint', async () => {
    const storage = createMemoryStorage({ igs_bridge_config: outfitBridgeConfig({ characterOutfits: {} }) });
    const document = createFakeDocument();
    const answers = [];
    const vn = bootstrapIGS({
        global: { document, localStorage: storage, prompt: () => answers.shift() || '', confirm: () => true, alert: () => {} },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '[igs-char:小林海斗|喜悦|泳装|看我的新衣服。]' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const c = encodeURIComponent('小林海斗');
    const o = encodeURIComponent('泳装');
    try {
        const opened = await vn.openLatestAvailable('pc');
        // 未登记的服装栏：丢掉该栏，照常显示对白与原有立绘，并记入待确认服装词。
        assert.equal(opened.reader.snapshot.content.textType, 'dialogue');
        assert.equal(opened.reader.snapshot.content.displayText, '看我的新衣服。');
        assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/base-joy.png');
        assert.deepEqual(JSON.parse(storage.getItem('igs:outfit-review:v1')).items, [{ character: '小林海斗', word: '泳装' }]);
        const respond = (kind) => (kind === 'confirm' ? true : answers.shift() || '');
        let settings = withSettingsDialogs(document, opened.reader.controller.openSettings('scene').controller, respond);
        // 待确认服装词在「待确认」页，页签上带数字；新建之后回到角色页看这套服装。
        let html = settings.switchSceneSubTab('review').snapshot.html;
        assert.match(html, /data-review-card="outfit"[\s\S]*?outfit-review-dismiss:/);
        assert.match(html, /data-scene-subtab="review"[^>]*>待确认<span class="igs-scene-subtab-count">\d+<\/span>/);
        html = settings.switchSceneSubTab('characters').snapshot.html;
        assert.doesNotMatch(html, /data-review-card=/);
        // 角色平时只占一行；新建服装后会自动展开到那套。
        assert.doesNotMatch(html, /data-outfit-tabs="小林海斗"/);

        await settings.invoke(`outfit-review-create:${c}:${o}`);
        assert.match(settings.switchSceneSubTab('review').snapshot.html, /class="igs-review-card is-empty" data-review-card="outfit"/);
        html = settings.switchSceneSubTab('characters').snapshot.html;
        assert.match(html, /data-outfit-panel="泳装"/, 'created outfit opens as the active tab');
        assert.match(html, /data-outfit-fallback="喜悦">.*?回落原装「默认」/);
        answers.push('比基尼');

        await settings.invoke(`scene-add-outfit-word:${c}:${o}`);
        await settings.invoke(`scene-add-outfit-mood:${c}:${o}:${encodeURIComponent('喜悦')}`);
        assert.doesNotMatch(settings.getSnapshot().html, /data-outfit-fallback="喜悦"/);
        const root = document.getElementById('igs-unified-settings').parentNode;

        assert.match(settings.getSnapshot().html, /data-scene-outfit-char="小林海斗" data-scene-outfit="泳装" data-scene-outfit-mood="喜悦" value=""/);
        const input = document.createElement('input');
        input.setAttribute('data-scene-outfit-char', '小林海斗');
        input.setAttribute('data-scene-outfit', '泳装');
        input.setAttribute('data-scene-outfit-mood', '喜悦');
        root.appendChild(input);
        const savedBefore = storage.getItem('igs_bridge_config');
        input.value = 'https://example.com/swim-new.png';
        root.dispatchEvent({ type: 'input', target: input });
        assert.equal(storage.getItem('igs_bridge_config'), savedBefore, 'typing must not save');

        settings.switchSceneSubTab('rules');
        assert.match(settings.getSnapshot().html, /data-result="prompt-rule-outfit">当前为自定义规则，未包含服装栏说明/);
        assert.equal(settings.close().ok, true);

        const saved = JSON.parse(storage.getItem('igs_bridge_config')).sceneAssets.characterOutfits;
        assert.deepEqual(saved, { 小林海斗: { 泳装: { words: ['比基尼'], moods: { 喜悦: 'https://example.com/swim-new.png' } } } });

        settings = withSettingsDialogs(document, opened.reader.controller.openSettings('scene').controller, respond);
        settings.switchSceneSubTab('characters');
        await settings.invoke(`scene-outfit-tab:${c}:${o}`);
        assert.match(settings.getSnapshot().html, /data-scene-outfit="泳装" data-scene-outfit-mood="喜悦" value="https:\/\/example\.com\/swim-new\.png"/);
        assert.match(settings.getSnapshot().html, />泳装<span class="igs-outfit-tab-count">1<\/span>/);
        await invokeConfirmed(settings, document, 'reset-prompt-rule');
        settings.switchSceneSubTab('rules');
        assert.doesNotMatch(settings.getSnapshot().html, /data-result="prompt-rule-outfit"/);
        settings.close();
    } finally {
        vn.destroy();
    }

    const reopened = bootstrapIGS({
        global: { document: createFakeDocument(), localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '[igs-char:小林海斗|喜悦|比基尼|看我的新衣服。]' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await reopened.openLatestAvailable('pc');
        assert.equal(opened.reader.snapshot.content.spriteOutfit, '泳装');
        assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/swim-new.png');
    } finally {
        reopened.destroy();
    }
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
        assert.equal(content().spriteOutfit, '');
        assert.equal(content().spriteImage, 'https://example.com/base-joy.png');
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:romance-nsfw-curve-ramps-and-falls-across-real-pages', () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const raw = [
        '[igs-scene:Room|night|clear]',
        '[igs-fx:romance|暧昧]',
        '[igs-fx:confess]',
        '前奏。',
        '[igs-scene:Room|night|clear|NSFW]',
        '一段。',
        '二段。',
        '三段。',
        '四段。',
        '[igs-scene:Room|morning|clear]',
        '[igs-fx:romance-end]',
        '翌朝。',
    ].join('\n');
    const host = createIgsReaderHost({
        global: { document },
        getUnifiedSettings: () => ({
            bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerSettings: { romanceFx: { enabled: true, confess: true }, statusHud: { nsfwSpriteMode: 'show' } },
        }),
    });
    try {
        const opened = host.openReader({ messageId: 52, message: { id: 52, text: raw }, raw }, { mode: 'pc' });
        assert.equal(opened.ok, true);
        const stage = document.getElementById('igs-overlay').querySelector('#igs-stage-motion');
        const content = () => host.getState().activeReader.snapshot.content;
        const pages = [];
        for (let i = 0; i < content().segments.length; i += 1) {
            if (i) opened.controller.invokeAction('next');
            pages.push({ text: content().text, level: stage.getAttribute('data-igs-rm-level'), span: content().nsfwSpan, backlight: stage.style['--igs-rm-backlight'] || '' });
        }
        assert.ok(content().segments.every((segment) => !/igs-fx:/.test(segment)));
        assert.deepEqual(pages.map((p) => p.level), ['1', '3', '3', '3', '3', null]);
        assert.equal(pages[0].span, null);
        assert.deepEqual(pages.slice(1, 5).map((p) => p.span && p.span.index), [0, 1, 2, 3]);
        // 渐强 0.55 → 0.8，末两页回落 0.8 → 0.6（中档 3 档逆光基准为 1）。
        assert.deepEqual(pages.slice(1, 5).map((p) => p.backlight), ['0.55', '0.8', '0.8', '0.6']);
    } finally {
        host.destroy();
    }
});


test('gate:simulation:onboarding-invite-guide-skip-and-no-repeat', async () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage();
    const raw = '[igs-scene:教室|白天|晴]\n新手引导测试。';
    const saves = [];
    const host = createIgsReaderHost({
        global: { document, localStorage: storage },
        getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {} } }, readerSettings: {} }),
        saveUnifiedSettings: (payload) => { saves.push(JSON.stringify(payload)); return { ok: true }; },
    });
    const open = () => host.openReader({ messageId: 1, message: { id: 1, text: raw }, raw }, { mode: 'pc' });
    try {
        assert.equal(open().ok, true);
        assert.ok(document.getElementById('igs-overlay').querySelector('#igs-onboarding-invite'), '首次打开应出现邀请条');
        assert.equal(open().ok, true, '换楼层重开');
        assert.ok(document.getElementById('igs-overlay').querySelector('#igs-onboarding-invite'), '未回应的邀请原样补挂');

        const settings = host.openSettings({ tab: 'basic', mode: 'pc' }).controller;
        const draftBefore = JSON.stringify(settings.getSnapshot().draft);
        await settings.invoke('onboarding-start');
        assert.equal(host.getState().activeSettings.tab, 'basic');
        assert.ok(document.getElementById('igs-onboarding-card'), '引导卡挂在设置面板内');
        // 第二步是快速配置演出问卷：只点选项、不点「应用」时不写草稿，「下一步」直接跳过。
        await settings.invoke('onboarding-next');
        assert.ok(String(document.getElementById('igs-onboarding-card').innerHTML).includes('data-action="onboarding-quiz:types:battle"'), '问卷选项在引导卡里');
        await settings.invoke('onboarding-quiz:types:battle');
        for (let i = 0; i < 4; i += 1) await settings.invoke('onboarding-next');
        assert.equal(host.getState().activeSettings.tab, 'reader');
        settings.switchTab('reader');
        assert.ok(document.getElementById('igs-onboarding-card'), '面板重绘后引导卡仍在');
        await settings.invoke('onboarding-skip');
        assert.equal(document.getElementById('igs-onboarding-card'), null);
        assert.equal(JSON.parse(storage.getItem('igs-onboarding')).status, 'dismissed');
        assert.equal(JSON.stringify(settings.getSnapshot().draft), draftBefore, '引导不得改写设置草稿');
        const closed = settings.close();
        assert.equal(closed.ok, true, `关闭设置失败：${closed.reason || ''}`);

        assert.equal(open().ok, true);
        assert.equal(document.getElementById('igs-overlay').querySelector('#igs-onboarding-invite'), null, '跳过后不再邀请');
    } finally {
        host.destroy();
    }
});

test('gate:simulation:onboarding-read-error-does-not-block-reader', () => {
    const document = createFakeDocument();
    const storage = createMemoryStorage({ 'igs-onboarding': '{bad' });
    const raw = '读取失败测试。';
    const host = createIgsReaderHost({
        global: { document, localStorage: storage },
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: {} }),
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(host.openReader({ messageId: 2, message: { id: 2, text: raw }, raw }, { mode: 'pc' }).ok, true);
        assert.equal(document.getElementById('igs-overlay').querySelector('#igs-onboarding-invite'), null);
        assert.equal(storage.getItem('igs-onboarding'), '{bad');
    } finally {
        console.warn = originalWarn;
        host.destroy();
    }
});


test('gate:simulation:settings-search-go-to-setting-opens-performance-group', async () => {
    const document = createFakeDocument({ innerWidth: 1280, innerHeight: 720 });
    const vn = bootstrapIGS({
        global: { document, localStorage: createMemoryStorage() },
        autoAttachMagicWand: false,
        config: { sceneAssets: { enabled: true, promptRule: 'rule', scenes: {}, characters: { H: { default: '' } }, characterAliases: { H: [] }, moodGroups: [] } },
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '[igs-char:H|喜悦|Hello.]' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    try {
        const opened = await vn.openLatestAvailable('pc');
        const settings = (await opened.reader.controller.invokeAction('settings')).controller;
        assert.deepEqual(settings.goToSetting('no-such-setting'), { ok: false, reason: 'unknown-setting' });
        const jumped = settings.goToSetting('camera-impact');
        assert.notEqual(jumped && jumped.ok, false);
        const html = settings.switchReaderSubTab('performance').snapshot.html;
        assert.match(html, /<details data-advanced="perf-group-stage" open>/);
        assert.match(html, /<b>画面<\/b>/);
        assert.match(html, /data-settings-search/);
        settings.close();
    } finally {
        vn.destroy();
    }
});

test('gate:simulation:reading-progress-resume-modal-and-turn-index-panel', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reading:chat-ti', JSON.stringify({ last: { id: 2, page: 1, at: 1 }, far: { id: 2, page: 1, at: 1 } }));
    const document = createFakeDocument();
    const messages = [0, 2, 4].map((id) => ({ id, text: `[角色: 艾莉]\n艾莉: 第${id}楼第一句。\n第${id}楼第二句。` }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        illustrationMessageHost: { ...createIllustrationMessageHost({ document }), getChatId: () => 'chat-ti' },
        hostAdapter: {
            getCurrentMessage: async () => messages[2],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            getAdjacentMessage: async (messageId, delta) => {
                const index = messages.findIndex((message) => message.id === Number(messageId));
                return index < 0 ? null : messages[index + (delta < 0 ? -1 : 1)] || null;
            },
            listTurns: async () => messages,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('pc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    let overlay = document.getElementById('igs-overlay');
    for (let i = 0; i < 20 && !document.querySelector('.igs-page-modal'); i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const modal = document.querySelector('.igs-page-modal');
    assert.ok(modal, '停在最新楼且上次读到别处时弹续读窗');
    const modalText = modal.querySelector('.igs-page-modal-msg').textContent;
    assert.match(modalText, /上次读到 2 楼 · 第 2 页/);
    assert.match(modalText, /后面还有 1 楼没读/);
    assert.equal(modal.querySelector('[data-igs-modal="ok"]').textContent, '续读 2 楼');
    assert.equal(modal.querySelector('[data-igs-modal="cancel"]').textContent, '最新一层');
    modal.dispatchEvent({ type: 'click', target: { closest: () => ({ getAttribute: () => 'cancel' }) } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelector('.igs-page-modal'), null, '选「最新一层」后弹窗收起、留在最新楼');

    const opening = opened.reader.controller.invokeAction('first-turn');
    await opening;
    overlay = document.getElementById('igs-overlay');
    const panel = overlay.querySelector('#igs-turn-index');
    assert.ok(panel, '目录按钮打开目录面板');
    assert.match(panel.innerHTML, /最新 4 楼/);
    assert.match(panel.innerHTML, /续读/);

    await opened.reader.controller.invokeAction('first-turn');
    assert.equal(document.getElementById('igs-overlay').querySelector('#igs-turn-index'), null, '再点一次关闭目录');

    const saved = await opened.reader.controller.invokeAction('quick-save');
    assert.equal(saved.ok, true);
    assert.equal(JSON.parse(storage.getItem('igs-reading:chat-ti')).quick.id, 4);
    vn.destroy();
});

test('gate:simulation:reading-progress-latest-chaser-sees-no-resume-bar', async () => {
    const storage = createMemoryStorage();
    // 上次读完了 2 楼，之后只多出最新的 4 楼：已追平，不该弹续读提示。
    storage.setItem('igs-reading:chat-chase', JSON.stringify({ last: { id: 2, page: 1, at: 1 }, far: { id: 2, page: 1, at: 1 }, read: '0-2' }));
    const document = createFakeDocument();
    const messages = [0, 2, 4].map((id) => ({ id, text: `[角色: 艾莉]\n艾莉: 第${id}楼第一句。\n第${id}楼第二句。` }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        illustrationMessageHost: { ...createIllustrationMessageHost({ document }), getChatId: () => 'chat-chase' },
        hostAdapter: {
            getCurrentMessage: async () => messages[2],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            getAdjacentMessage: async () => null,
            listTurns: async () => messages,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    await vn.openLatestAvailable('pc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelector('.igs-page-modal'), null);
    vn.destroy();
});

test('gate:simulation:reading-progress-offers-old-floor-after-jumping-back', async () => {
    const storage = createMemoryStorage();
    // 读到过最新的 4 楼，又跳回 2 楼后退出：中间都读过，但仍要问回 2 楼还是看最新。
    storage.setItem('igs-reading:chat-back', JSON.stringify({ last: { id: 2, page: 1, at: 2 }, far: { id: 4, page: 1, at: 1 }, read: '0-4' }));
    const document = createFakeDocument();
    const messages = [0, 2, 4].map((id) => ({ id, text: `[角色: 艾莉]
艾莉: 第${id}楼第一句。
第${id}楼第二句。` }));
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        illustrationMessageHost: { ...createIllustrationMessageHost({ document }), getChatId: () => 'chat-back' },
        hostAdapter: {
            getCurrentMessage: async () => messages[2],
            getMessageById: async (messageId) => messages.find((message) => message.id === Number(messageId)) || null,
            getAdjacentMessage: async () => null,
            listTurns: async () => messages,
            typeAndSend: async () => ({ ok: true }),
        },
    });
    await vn.openLatestAvailable('pc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 20 && !document.querySelector('.igs-page-modal'); i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const modal = document.querySelector('.igs-page-modal');
    assert.ok(modal, '跳回旧楼后退出，下次打开要问');
    assert.equal(modal.querySelector('[data-igs-modal="ok"]').textContent, '续读 2 楼');
    modal.dispatchEvent({ type: 'click', target: { closest: () => ({ getAttribute: () => 'ok' }) } });
    const shownId = () => {
        const reader = vn.getState().igsUi.activeReader;
        return reader ? Number(reader.contentMessageId != null ? reader.contentMessageId : reader.snapshot.messageId) : NaN;
    };
    for (let i = 0; i < 40 && shownId() !== 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(shownId(), 2, '选「续读」回到 2 楼');
    vn.destroy();
});

test('gate:simulation:toolbar-split-moves-nav-buttons-under-dialog', async () => {
    const storage = createMemoryStorage();
    const document = createFakeDocument();
    const vn = bootstrapIGS({
        global: { document, localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 8, text: '[角色: 艾莉]\n艾莉: 第一段。\n第二段。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });
    const opened = await vn.openLatestAvailable('fullscreen');
    const overlay = () => document.getElementById('igs-overlay');
    const parentOf = (id) => overlay().querySelector(`#igs-btn-${id}`).parentNode.id;
    assert.equal(opened.reader.snapshot.readerSettings.toolbarSplit, 'split');
    for (const id of ['first-turn', 'prev', 'next', 'auto-play', 'quick-save', 'quick-load']) assert.equal(parentOf(id), 'igs-dialog-bar', id);
    assert.notEqual(parentOf('regen'), 'igs-dialog-bar');
    assert.equal(overlay().querySelector('#igs-dialog-bar').hasAttribute('hidden'), false);

    const settings = await opened.reader.controller.invokeAction('settings');
    settings.controller.setValue('readerSettings.toolbarSplit', 'top');
    await settings.controller.save?.();
    vn.closeSettings?.();
    const top = await vn.openLatestAvailable('fullscreen');
    assert.equal(top.reader.snapshot.readerSettings.toolbarSplit, 'top');
    assert.notEqual(parentOf('next'), 'igs-dialog-bar');
    assert.equal(overlay().querySelector('#igs-btn-quick-save').style.display, 'none', '只用顶栏时快速存读档不挤进顶栏');
    assert.equal(overlay().querySelector('#igs-dialog-bar').hasAttribute('hidden'), true);
    vn.destroy();
});
