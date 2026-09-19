import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootstrapIGS, createMemoryStorage, createPresetRegistry, PRESET_STORE_KEY } from '../src/index.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { createDbTabClickGuard, toShujukuApiRowIndex } from '../src/shujuku-panel/panel-controller.js';
import { renderDbPanelInner, getDbPanelStyles } from '../src/shujuku-panel/panel-render.js';
import { createResourceCache } from '../src/media/resource-cache.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';
import { VISUAL_MODES } from '../src/visual/visual-mode.js';

const appRoot = path.resolve(import.meta.dirname, '..');

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

    vn.destroy();
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
    assert.deepEqual(result.snapshot.tabs.map((item) => item.label), ['基础', '正文替换', '图像', '场景', '阅读器']);
    assert.equal(result.snapshot.tabs[0].active, true);
    assert.ok(result.snapshot.selectors.includes('#igs-unified-settings'));

    vn.destroy();
});

test('gate:simulation:scene-assets-injects-prompt-and-renders-single-configured-assets', async () => {
    const extensionPrompts = {};
    const timers = [];
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            sceneAssets: {
                enabled: true,
                promptRule: '请严格输出 [igs-scene:场景|时间|天气] [igs-char:角色|情绪|对白]\n情绪池：\n{{mood_groups}}',
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
    assert.equal(injected.position, 1);
    assert.equal(injected.role, 0);
    assert.match(injected.value, /\[igs-scene:/);
    assert.doesNotMatch(injected.value, /\{\{mood_groups\}\}/);
    assert.match(injected.value, /喜悦组：/);

    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/classroom.png');
    assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/kaito.png');

    vn.destroy();
    assert.equal(Object.hasOwn(extensionPrompts, 'igs-scene-assets-format-rule'), false);
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

    assert.equal(opened.reader.snapshot.content.textType, 'dialogue');
    assert.equal(speakerEl.style.display, 'block');
    assert.equal(dividerEl.style.display, 'block');
    assert.equal(textEl.style.color, '#00ff00');
    assert.equal(textEl.style.fontFamily, 'Georgia,serif');

    await opened.reader.controller.invokeAction('next');
    const thoughtSnapshot = vn.getState().igsUi.activeReader.snapshot;
    textEl = document.getElementById('igs-overlay').querySelector('#igs-text');
    speakerEl = document.getElementById('igs-overlay').querySelector('#igs-speaker');
    dividerEl = document.getElementById('igs-overlay').querySelector('#igs-divider');
    assert.equal(thoughtSnapshot.content.textType, 'thought');
    assert.equal(thoughtSnapshot.content.speaker, 'Hero');
    assert.equal(speakerEl.style.display, 'block');
    assert.equal(dividerEl.style.display, 'block');
    assert.equal(textEl.style.color, '#0000ff');
    assert.equal(textEl.style.fontFamily, 'Courier New,monospace');

    vn.destroy();
});

test('gate:simulation:igs-ui-settings-save-updates-reader-state', () => {
    const legacyStorage = readJson('fixtures/igs/legacy-storage.json');
    const storage = createMemoryStorage(legacyStorage);
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    try {
        const opened = vn.openSettings({ tab: 'reader', mode: 'mobile' });
        assert.equal(opened.controller.getSnapshot().draft.readerSettings.glassBackdropFilter, false);
        const updated = opened.controller.setValue('readerSettings.fontSize', 20);
        const toggled = opened.controller.toggle('readerSettings.glassBackdropFilter');
        const current = vn.getUnifiedSettings({ mode: 'mobile' });
        const savedStorage = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));

        assert.equal(updated.ok, true);
        assert.equal(toggled.ok, true);
        assert.equal(current.readerSettings.fontSize, 20);
        assert.equal(current.readerSettings.glassBackdropFilter, true);
        assert.equal(savedStorage.fontSize, 20);
        assert.equal(savedStorage.glassBackdropFilter, true);
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

test('gate:simulation:igs-ui-background-click-does-not-page-dialog-click-still-pages', async () => {
    const document = createFakeDocument();
    const latestMessage = {
        id: 44,
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
    const clickLayer = overlay.querySelector('#igs-click-layer');
    const dialog = overlay.querySelector('#igs-dialog');

    assert.equal(opened.reader.snapshot.content.progress, '1 / 2');
    clickLayer.click();
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '1 / 2');

    dialog.style.left = '0px';
    dialog.style.width = '200px';
    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 160 });
    assert.equal(vn.getState().igsUi.activeReader.snapshot.content.progress, '2 / 2');

    vn.destroy();
});

test('gate:simulation:igs-ui-option-bubble-trigger-excludes-dialog-toolbar-and-input', async () => {
    const document = createFakeDocument();
    const latestMessage = {
        id: 45,
        text: '[角色: 艾莉]\n艾莉: 最后一段。',
    };
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
    optionBubbles.setAttribute('hidden', '');
    dialog.dispatchEvent({ type: 'click', target: input, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    toolbar.dispatchEvent({ type: 'click', target: toolbar, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    clickLayer.click();
    assert.equal(optionBubbles.hasAttribute('hidden'), false);
    assert.equal(optionBubbles.querySelectorAll('.igs-option-bubble').length, 2);
    // 默认（未开启随文本）气泡宽度跟随对话框。
    assert.equal(optionBubbles.getAttribute('data-igs-width'), 'dialog');

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

test('gate:simulation:igs-ui-toolbar-dock-top-fixes-bar-and-keeps-buttons-visible', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'top' }));
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
    // 顶部固定模式下默认折叠态也不收起按钮区。
    assert.equal(vn.getState().igsUi.activeReader.toolbarCollapsed, true);
    assert.equal(collapsible.style.display, 'flex');

    // 顶部固定模式：设置键移入固定区、退出键固定在 ctrl-bar 直属，导航键留在横滚按钮区。
    const pinned = overlay.querySelector('#igs-bar-pinned');
    const settingsBtn = overlay.querySelector('#igs-btn-settings');
    const closeBtn = toolbar.querySelector('[data-act="close"]');
    assert.equal(settingsBtn.parentNode, pinned);
    assert.equal(closeBtn.parentNode, toolbar);
    assert.equal(overlay.querySelector('#igs-btn-next').parentNode, collapsible);
    assert.equal(overlay.querySelector('#igs-btn-db-panel').parentNode, collapsible);

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

test('gate:simulation:igs-ui-toolbar-top-bar-is-horizontally-scrollable', () => {
    // 顶部固定栏按钮放不下时须能横向滚动：触摸端 touch-action:pan-x，溢出态切 flex-start。
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*overflow-x:auto/);
    assert.match(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\{[^}]*touch-action:pan-x/);
    assert.match(css, /#igs-overlay\.igs-toolbar-top #igs-bar-btns\.igs-bar-overflow\{[^}]*justify-content:flex-start/);
});

test('gate:simulation:igs-ui-toolbar-dock-invalid-falls-back-to-float', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({ toolbarDock: 'bogus' }));
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: {
            getCurrentMessage: async () => ({ id: 1, text: '旁白。' }),
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.reader.snapshot.readerSettings.toolbarDock, 'float');

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
    const bucket = JSON.parse(storage.getItem('igs-reader-settings-v9-default') || '{}');
    assert.equal(bucket.fontSize, 24, 'writes to default bucket');

    // same settings readable regardless of mode
    assert.equal(vn.getUnifiedSettings({ mode: 'pc' }).readerSettings.fontSize, 24);
    assert.equal(vn.getUnifiedSettings({ mode: 'mobile' }).readerSettings.fontSize, 24);

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
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.readerSettings.fontSize, 24);

    vn.destroy();
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
    assert.equal(sprite.style.backgroundSize, '156%');
    assert.equal(sprite.style.backgroundPosition, '12% 34%');

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    settings.setValue('readerSettings.fontSize', 26);

    sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(vn.getState().igsUi.activeReader.mode, 'mobile');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.mode, 'mobile');
    assert.equal(sprite.style.backgroundSize, '156%');
    assert.equal(sprite.style.backgroundPosition, '12% 34%');

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
    const storage = createMemoryStorage();
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

    const scenesView = settings.switchSceneSubTab('scenes');
    assert.match(scenesView.snapshot.html, /背景场景/);
    const charsView = settings.switchSceneSubTab('characters');
    assert.match(charsView.snapshot.html, /统一角色立绘位置/);

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
        assert.equal(overlay.querySelectorAll('.igs-settings-tab').length, 5);
        assert.ok(overlay.querySelector('.igs-settings-body'));
        assert.equal(overlay.style['--igs-settings-vleft'], '36px');
        assert.equal(overlay.style['--igs-settings-vtop'], '22px');
        assert.equal(overlay.style['--igs-settings-vw'], '980px');
        assert.equal(overlay.style['--igs-settings-vh'], '540px');

        globalObject.visualViewport.offsetLeft = 48;
        globalObject.visualViewport.offsetTop = 40;
        globalObject.visualViewport.width = 920;
        globalObject.visualViewport.height = 500;
        globalObject.visualViewport.dispatchEvent({ type: 'scroll' });

        assert.equal(overlay.style['--igs-settings-vleft'], '48px');
        assert.equal(overlay.style['--igs-settings-vtop'], '40px');
        assert.equal(overlay.style['--igs-settings-vw'], '920px');
        assert.equal(overlay.style['--igs-settings-vh'], '500px');

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
    assert.deepEqual(jumped, [9, 8]);
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
    assert.deepEqual(jumped, [7, 9]);

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
    const modelsResult = await settings.controller.invoke('fetch-image-models');
    const testResult = await settings.controller.invoke('test-image');
    const snapshot = settings.controller.getSnapshot();

    assert.equal(modelsResult.ok, true);
    assert.equal(testResult.ok, true);
    assert.deepEqual(snapshot.draft.bridge.imageApi.availableModels, [
        'nai-diffusion-3',
        'nai-diffusion-4-curated-preview',
    ]);
    assert.match(snapshot.resultText.imageModels, /已拉取 2 个模型/);
    assert.match(snapshot.resultText.image, /图像 API 真实生成测试成功/);
    assert.equal(calls[0].url, 'https://example.com/v1/models');
    assert.equal(calls[1].url, 'https://example.com/v1/images/generations');

    vn.destroy();
});

test('gate:simulation:igs-ui-external-adapter-filter-and-detection-use-real-provider-counts', async () => {
    const document = createFakeDocument();
    const message = {
        id: 35,
        text: '[角色: 玉子]\n玉子: 看看当前插图。',
        element: createFakeMessageElement(document, {
            imageUrls: ['https://example.com/chatu8-scene.png'],
            chamiImageUrls: ['https://example.com/chami-scene.png'],
            chamiButtons: [createFakeRegenerateButton(() => {})],
        }),
    };
    const vn = bootstrapIGS({
        global: { document },
        autoAttachMagicWand: false,
        config: {
            imageApi: {
                mode: 'extension',
                externalAdapter: 'chami',
            },
        },
        hostAdapter: {
            getCurrentMessage: async () => message,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    const opened = await vn.openLatestAvailable('pc');
    const settings = opened.reader.controller.openSettings('image');
    await settings.controller.invoke('test-image');
    const snapshot = settings.controller.getSnapshot();

    assert.equal(opened.reader.snapshot.content.imageCount, 1);
    assert.equal(opened.reader.snapshot.content.currentImageUrl, 'https://example.com/chami-scene.png');
    assert.match(snapshot.resultText.image, /已检测到 chami 插图扩展/);
    assert.match(snapshot.resultText.image, /图片 1/);

    vn.destroy();
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
        '.tsp-regenerate-btn': [frameButton],
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
            chamiImageNodes: [providerImage],
            chamiButtons: [button],
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
                externalAdapter: 'chami',
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
            chamiImageNodes: [
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
                externalAdapter: 'chami',
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

test('gate:simulation:host-adapter-hide-state-skips-hidden-turns-in-real-bootstrap', async () => {
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
    assert.equal(prevTurn.messageId, 1);
    assert.deepEqual(jumps, ['/chat-jump 1']);

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

    assert.match(styleText, /#igs-overlay\.igs-floating \.igs-text\{min-height:0;overflow-y:auto;margin-bottom:12px;flex:1 1 auto;\}/);
    assert.match(styleText, /#igs-overlay\.igs-floating \.igs-controls\{flex-shrink:0;\}/);

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
    assert.doesNotMatch(css, /--igs-db-head-bg,rgba\(20,20,22,\.92\)/);
});

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
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
    const images = (options.imageUrls || []).map((url) => createFakeMediaNode({
        ownerDocument,
        tagName: 'IMG',
        src: url,
    }));
    const chamiImages = Array.isArray(options.chamiImageNodes)
        ? options.chamiImageNodes
        : (options.chamiImageUrls || []).map((url, index) => createFakeMediaNode({
            ownerDocument,
            tagName: 'IMG',
            src: url,
            attributes: {
                'data-image-id': `image-${Math.random().toString(36).slice(2, 8)}`,
                ...(Array.isArray(options.chamiImageAttributes) ? options.chamiImageAttributes[index] || {} : {}),
            },
        }));
    const genericNodes = Array.isArray(options.genericNodes) ? options.genericNodes : [];
    const outsideGenericNodes = Array.isArray(options.outsideGenericNodes) ? options.outsideGenericNodes : [];
    const regenButtons = Array.isArray(options.regenButtons) ? options.regenButtons : [];
    const chamiButtons = Array.isArray(options.chamiButtons) ? options.chamiButtons : [];
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
    for (const node of chamiImages) attachNodeToFakeParent(node, mesText, ownerDocument);
    for (const node of genericNodes) attachNodeToFakeParent(node, mesText, ownerDocument);
    for (const node of regenButtons) attachNodeToFakeParent(node, mesText, ownerDocument);
    for (const node of chamiButtons) attachNodeToFakeParent(node, mesText, ownerDocument);
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
        if (selector === 'img.st-chatu8-image-tag-image' || selector === '[class*="st-chatu8"] img' || selector === '[class*="chatu8"] img') {
            return images;
        }
        if (selector === 'button.image-tag-button' || selector === 'button[class*="image-tag-button"]' || selector === 'button[class*="st-chatu8-image"]') {
            return regenButtons;
        }
        if (
            selector === '.tsp-generated-image'
            || selector === '.tsp-inline-image'
            || selector === '.tsp-image-slot img'
            || selector === 'img[src*="tsp-images"]'
            || selector === '[data-image-id]'
            || selector === '[data-location-hash]'
            || selector === 'img[data-image-id]'
            || selector === 'img[data-location-hash]'
            || selector === '[data-image-id] img'
            || selector === '[data-location-hash] img'
        ) {
            return chamiImages;
        }
        if (selector === '.tsp-regenerate-btn' || selector === '.tsp-inline-gen-btn') {
            return chamiButtons;
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
    messageRoot.__chamiImages = chamiImages;
    messageRoot.__genericNodes = genericNodes;
    messageRoot.__outsideGenericNodes = outsideGenericNodes;
    messageRoot.__regenButtons = regenButtons;
    messageRoot.__chamiButtons = chamiButtons;
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
