import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootstrapIGS, createMemoryStorage, createPresetRegistry, PRESET_STORE_KEY } from '../src/index.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { createDbTabClickGuard, toShujukuApiRowIndex } from '../src/shujuku-panel/panel-controller.js';
import { renderDbPanelInner, getDbPanelStyles } from '../src/shujuku-panel/panel-render.js';
import { createImageResourceCache, createResourceCache } from '../src/media/resource-cache.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';
import { createMapPanelController } from '../src/visual/igs-ui/map-panel.js';
import { createRecordPanelController } from '../src/visual/igs-ui/record-panel.js';
import { getSettingsStyleText } from '../src/visual/igs-ui/settings-style.js';
import { LEGACY_DEFAULT_SCENE_PROMPT_RULE } from '../src/visual/igs-ui/reader-host-constants.js';
import { applyTypewriterEffect } from '../src/visual/igs-ui/typewriter-runtime.js';
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
                promptRule: LEGACY_DEFAULT_SCENE_PROMPT_RULE,
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
    assert.match(injected.value, /\[igs-scene:场景名\|时间\|天气\|NSFW\]/);
    assert.doesNotMatch(injected.value, /\{\{mood_groups\}\}/);
    assert.match(injected.value, /喜悦组：/);

    const opened = await vn.openLatestAvailable('pc');
    assert.equal(opened.ok, true);
    assert.equal(opened.reader.snapshot.content.backgroundImage, 'https://example.com/classroom.png');
    assert.equal(opened.reader.snapshot.content.spriteImage, 'https://example.com/kaito.png');

    vn.destroy();
    assert.equal(Object.hasOwn(extensionPrompts, 'igs-scene-assets-format-rule'), false);
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
    vn.destroy();
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
    const sprite = document.getElementById('igs-overlay').querySelector('#igs-sprite');
    assert.equal(sprite.style.backgroundPosition, '14% 78%');
    assert.equal(sprite.style.backgroundSize, '126%');
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
    assert.equal(sprite.style.filter, 'brightness(0.86) saturate(0.86)');
    assert.equal(sprite.style['-webkit-filter'], 'brightness(0.86) saturate(0.86)');

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
    assert.equal(sprite.style.filter, 'brightness(0.86) saturate(0.86)');
    assert.equal(sprite.style['-webkit-filter'], 'brightness(0.86) saturate(0.86)');

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
        const current = vn.getUnifiedSettings({ mode: 'mobile' });
        const savedStorage = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));

        assert.equal(updated.ok, true);
        assert.equal(optionSize.ok, true);
        assert.equal(toggled.ok, true);
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

test('gate:simulation:igs-ui-option-bubble-trigger-excludes-dialog-toolbar-and-input', async () => {
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
    optionBubbles.setAttribute('hidden', '');
    dialog.dispatchEvent({ type: 'click', target: input, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    dialog.dispatchEvent({ type: 'click', target: dialog, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    toolbar.dispatchEvent({ type: 'click', target: toolbar, clientX: 120 });
    assert.equal(optionBubbles.hasAttribute('hidden'), true);

    clickLayer.click();
    assert.equal(optionBubbles.hasAttribute('hidden'), false);
    assert.equal(optionBubbles.style['--igs-option-font-size'], '20px');
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

    // 顶部固定模式：设置键移入固定区、退出键固定在 ctrl-bar 直属，导航键留在横滚按钮区。
    const pinned = overlay.querySelector('#igs-bar-pinned');
    const settingsBtn = overlay.querySelector('#igs-btn-settings');
    const closeBtn = toolbar.querySelector('[data-act="close"]');
    assert.equal(settingsBtn.parentNode, pinned);
    assert.equal(closeBtn.parentNode, toolbar);
    assert.equal(overlay.querySelector('#igs-btn-next').parentNode, collapsible);
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
    assert.equal(overlay.classList.contains('igs-toolbar-top'), false);
    assert.equal(toolbar.getAttribute('data-igs-toolbar-dock'), 'float');
    assert.equal(toolbar.style.transformOrigin, 'right top');
    assert.equal(collapsible.style.gap, '2px');
    assert.equal(pinned.style.gap, '2px');

    opened.reader.controller.toggleToolbar();
    assert.equal(overlay.querySelector('#igs-btn-settings').parentNode, collapsible);
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome \.igs-dialog\{[^}]*display:flex[^}]*overflow:hidden[^}]*padding:9px 18px 14px/);
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome #igs-toolbar-layer\{inset:14px 14px auto auto;width:auto;height:auto;transform:none;\}/);
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome \.igs-ctrl-bar\{[^}]*position:static[^}]*gap:1\.5px[^}]*padding:0[^}]*background:transparent[^}]*border:0[^}]*box-shadow:none/);
    assert.match(css, /#igs-overlay\.igs-default-reader-chrome \.igs-ctrl-bar \.igs-icon-btn svg\{width:11px;height:11px;transform:scale\(1\.2\);transform-origin:center;\}/);
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
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    let dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    const controls = document.getElementById('igs-overlay').querySelector('.igs-controls');

    assert.equal(dialog.style.height, 'auto');
    assert.equal(dialog.style.minHeight, '0');
    assert.equal(dialog.style.maxHeight, '464px');
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-overlay\.igs-floating \.igs-dialog\{[^}]*max-height:none/);
    assert.match(css, /#igs-overlay\.igs-floating-mobile \.igs-dialog\{[^}]*max-height:none/);
    settings.setValue('readerSettings.dialogHeight', 0.05);
    assert.equal(dialog.style.height, '25px', 'ratio uses bridged plugin iframe height, not parent window');
    assert.equal(dialog.style.maxHeight, 'none');
    assert.equal(controls.style.display, '');
    document.defaultView.innerHeight = 900;
    pluginIframeHeight = 900;
    settings.setValue('readerSettings.fontSize', 20);
    assert.equal(dialog.style.height, '25px', 'same reader keeps frozen plugin iframe ratio height');
    settings.setValue('readerSettings.dialogHeight', 0.18);
    assert.equal(dialog.style.height, '162px', 'changing ratio recalculates from current plugin iframe height');
    assert.equal(vn.getState().igsUi.activeReader.snapshot.readerSettings.dialogHeight, 0.18);
    // 历史 px 设置继续按原像素值读取。
    settings.setValue('readerSettings.dialogHeight', 300);
    dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.style.height, '300px');
    settings.setValue('readerSettings.dialogHeight', null);
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
        assert.equal(dialog.style.height, item.expected, item.mode);
        settings.setValue('readerSettings.dialogHeight', null);
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
    assert.equal(dialog.style.height, '77px', 'embedded');
    settings.setValue('readerSettings.dialogHeight', null);
    assert.equal(dialog.style.height, 'auto', 'embedded');
    assert.equal(dialog.style.minHeight, '0', 'embedded');
    vn.destroy();
});

test('gate:simulation:classic-dialog-settings-roundtrip-keeps-default', async () => {
    const storage = createMemoryStorage();
    storage.setItem('igs-reader-settings-v9-default', JSON.stringify({
        _v: '0.5.4',
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

    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    let result = settings.setValue('readerSettings.dialogSkin', 'western-classic');
    assert.equal(result.ok, true);
    settings.setValue('readerSettings.classicDialogWidthPercent', 60);
    dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'western-classic');
    assert.equal(dialog.style.width, 'max(280px,calc(60% - 14.4px))');
    assert.equal(dialog.style.marginLeft, 'auto');
    assert.equal(dialog.style.marginRight, 'auto');

    settings.setValue('readerSettings.classicVnTheme.narrationColor', '#123456');
    settings.setValue('readerSettings.fontSize', 22);
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
    assert.equal(textEl.style.fontFamily, roundedFont);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).classicVnTheme.narrationFont, roundedFont);
    settings.setValue('readerSettings.classicVnTheme.narrationFont', 'inherit');
    assert.equal(textEl.style.fontFamily || '', '');

    settings.setValue('readerSettings.dialogFontWeight', '700');
    overlay = document.getElementById('igs-overlay');
    textEl = overlay.querySelector('#igs-text');
    const speakerEl = overlay.querySelector('#igs-speaker');
    assert.equal(textEl.style.fontWeight, '700');
    // No font-weight is written to surrounding controls or other reader layers.
    assert.equal(overlay.querySelector('#igs-dialog').style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-ctrl-bar').style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-input').style.fontWeight || '', '');
    settings.setValue('readerSettings.dialogFontWeight', 'null');
    assert.equal(overlay.querySelector('#igs-text').style.fontWeight, '');

    // A page with a speaker applies the same weight only to its name and text.
    // The no-speaker page above must not invent a name when the setting changes.
    assert.equal(speakerEl.style.fontWeight || '', '');

    settings.setValue('readerSettings.dialogSkin', 'default');
    dialog = document.getElementById('igs-overlay').querySelector('#igs-dialog');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), null);

    settings.setValue('readerSettings.dialogSkin', 'western-classic');
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
    assert.equal(speaker.style.color, '#3b2a22');
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

    const rulesView = settings.switchSceneSettingsSubTab('rules');
    assert.equal(rulesView.snapshot.sceneSettingsSubTab, 'rules');
    assert.match(rulesView.snapshot.html, /data-scene-settings-pane="rules"/);
    assert.match(rulesView.snapshot.html, /保存提示词/);
    assert.doesNotMatch(rulesView.snapshot.html, /背景场景/);

    const assetsView = settings.switchSceneSettingsSubTab('assets');
    assert.equal(assetsView.snapshot.sceneSettingsSubTab, 'assets');
    assert.match(assetsView.snapshot.html, /data-scene-settings-pane="assets"/);
    settings.switchSceneSubTab('scenes');
    const scenesView = await settings.invoke(`scene-toggle-bg:${encodeURIComponent('旧城')}`);
    assert.match(scenesView.snapshot.html, /背景场景/);
    assert.match(scenesView.snapshot.html, /场景别名/);
    assert.match(scenesView.snapshot.html, /古城/);
    const charsView = settings.switchSceneSubTab('characters');
    assert.match(charsView.snapshot.html, /统一角色立绘位置/);
    assert.doesNotMatch(charsView.snapshot.html, />角色别名<\/div>/);
    assert.match(charsView.snapshot.html, /data-status-avatar-char=/);
    assert.match(charsView.snapshot.html, /https:\/\/\.\.\. 或 data:image\/\.\.\./);
    assert.match(charsView.snapshot.html, /爱丽/);

    vn.destroy();
});

test('gate:simulation:settings-theme-toggle-persists-day-mode', async () => {
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
    assert.equal(initial.settingsTheme, 'night');
    assert.match(initial.html, /data-igs-settings-theme="night"/);
    assert.match(initial.html, /切换到日间模式/);

    const toggled = await settings.invoke('toggle-settings-theme');
    assert.equal(toggled.snapshot.settingsTheme, 'day');
    assert.match(toggled.snapshot.html, /data-igs-settings-theme="day"/);
    assert.match(toggled.snapshot.html, /切换到夜间模式/);
    const bridge = JSON.parse(storage.getItem('igs_bridge_config'));
    assert.equal(bridge.settingsTheme, 'day');

    settings.close();
    const reopened = opened.reader.controller.openSettings('basic');
    assert.equal(reopened.snapshot.settingsTheme, 'day');
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
    assert.match(dialogView.snapshot.html, /对话框样式/);
    assert.match(dialogView.snapshot.html, /文字排版/);
    assert.match(dialogView.snapshot.html, /尺寸与显示/);
    assert.match(dialogView.snapshot.html, /外观细节/);
    assert.match(dialogView.snapshot.html, /对话框宽度/);
    assert.match(dialogView.snapshot.html, /对话框风格/);
    const dialogHeadings = ['对话框样式', '文字排版', '尺寸与显示', '外观细节', '对话框背景', '角色名', '台词', '旁白', '心里话', '分隔线'];
    for (let index = 1; index < dialogHeadings.length; index += 1) {
        assert.ok(dialogView.snapshot.html.indexOf(dialogHeadings[index - 1]) < dialogView.snapshot.html.indexOf(dialogHeadings[index]), `${dialogHeadings[index]} must follow ${dialogHeadings[index - 1]}`);
    }
    assert.doesNotMatch(dialogView.snapshot.html, /对话框字体/);
    assert.ok(dialogView.snapshot.html.indexOf('对话框字重') < dialogView.snapshot.html.indexOf('对话框宽度'));
    assert.match(dialogView.snapshot.html, /角色名/);
    assert.match(dialogView.snapshot.html, /分隔线/);
    assert.doesNotMatch(dialogView.snapshot.html, /按钮管理|启用打字机演出/);

    settings.setValue('readerSettings.dialogSkin', 'gradient-veil');
    const gradientDialogView = settings.switchReaderSubTab('dialog');
    assert.ok(gradientDialogView.snapshot.html.indexOf('对话框风格') < gradientDialogView.snapshot.html.indexOf('黑幕颜色'));
    assert.ok(gradientDialogView.snapshot.html.indexOf('黑幕颜色') < gradientDialogView.snapshot.html.indexOf('文字排版'));
    assert.match(gradientDialogView.snapshot.html, /igs-gradient-veil-settings/);

    const visualView = settings.switchReaderSubTab('visual');
    assert.match(visualView.snapshot.html, /data-reader-pane="visual"/);
    assert.match(visualView.snapshot.html, /检测图像数量/);
    assert.match(visualView.snapshot.html, /图像显示模式/);
    assert.match(visualView.snapshot.html, /图片亮度/);

    const performanceView = settings.switchReaderSubTab('performance');
    assert.match(performanceView.snapshot.html, /data-reader-pane="performance"/);
    assert.match(performanceView.snapshot.html, /启用打字机演出/);
    assert.match(performanceView.snapshot.html, /打字机速度/);
    assert.match(performanceView.snapshot.html, /快[\s\S]*中[\s\S]*慢/);
    assert.match(performanceView.snapshot.html, /启用人物过场滤镜（仅旁白）/);
    assert.match(performanceView.snapshot.html, /显示NSFW场景下的人物立绘/);

    const optionsView = settings.switchReaderSubTab('options');
    assert.match(optionsView.snapshot.html, /data-reader-pane="options"/);
    assert.match(optionsView.snapshot.html, /选项字体大小/);
    assert.match(optionsView.snapshot.html, /启用选项气泡/);

    const interfaceView = settings.switchReaderSubTab('interface');
    assert.match(interfaceView.snapshot.html, /data-reader-pane="interface"/);
    assert.match(interfaceView.snapshot.html, /顶部工具栏/);
    assert.match(interfaceView.snapshot.html, /工具栏大小/);
    assert.match(interfaceView.snapshot.html, /按钮管理/);
    assert.match(interfaceView.snapshot.html, /显示左上角状态栏/);

    settings.setValue('readerSettings.typewriter.enabled', true);
    settings.setValue('readerSettings.typewriter.speed', 'slow');
    assert.deepEqual(settings.getSnapshot().draft.readerSettings.typewriter, { enabled: true, speed: 'slow', mode: 'soft', sound: { enabled: true, volume: 0.5 } });
    const savedTypewriter = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.deepEqual(savedTypewriter.typewriter, { enabled: true, speed: 'slow', mode: 'soft', sound: { enabled: true, volume: 0.5 } });

    const enabledView = settings.switchReaderSubTab('performance');
    assert.match(enabledView.snapshot.html, /演出方式/);
    assert.doesNotMatch(enabledView.snapshot.html, /启用打字音效|打字音效音量/);

    settings.setValue('readerSettings.typewriter.mode', 'classic');
    const classicView = settings.switchReaderSubTab('performance');
    assert.match(classicView.snapshot.html, /启用打字音效/);
    assert.match(classicView.snapshot.html, /打字音效音量/);
    assert.match(classicView.snapshot.html, /type="range" min="0" max="1" step="0\.05"/);
    assert.match(classicView.snapshot.html, />50%</);

    settings.setValue('readerSettings.typewriter.sound.enabled', false);
    const mutedView = settings.switchReaderSubTab('performance');
    assert.match(mutedView.snapshot.html, /启用打字音效/);
    assert.doesNotMatch(mutedView.snapshot.html, /打字音效音量/);
    assert.deepEqual(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).typewriter.sound, { enabled: false, volume: 0.5 });

    settings.setValue('readerSettings.typewriter.sound.enabled', true);
    settings.setValue('readerSettings.typewriter.sound.volume', 0.35);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).typewriter.sound.volume, 0.35);

    settings.setValue('readerSettings.typewriter.mode', 'soft');
    const softView = settings.switchReaderSubTab('performance');
    assert.doesNotMatch(softView.snapshot.html, /启用打字音效|打字音效音量/);
    assert.deepEqual(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).typewriter.sound, { enabled: true, volume: 0.35 });

    settings.setValue('readerSettings.dialogSkin', 'western-classic');
    const classicDialogView = settings.switchReaderSubTab('dialog');
    assert.equal((classicDialogView.snapshot.html.match(/对话框风格/g) || []).length, 1);
    assert.ok(classicDialogView.snapshot.html.indexOf('对话框宽度') < classicDialogView.snapshot.html.indexOf('电脑端宽度'));
    assert.ok(classicDialogView.snapshot.html.indexOf('电脑端宽度') < classicDialogView.snapshot.html.indexOf('对话框高度'));
    assert.doesNotMatch(classicDialogView.snapshot.html, /西欧古典请在「主题」页按比例调整|当前风格使用固定 184px|按阅读器可用宽度自动计算|不影响素材对话框，仍作用于工具栏、选项和数据库。|当前编辑西欧古典风格的文字外观；默认风格配置会保留。|姓名牌风格不显示额外分隔线。/);
    assert.match(classicDialogView.snapshot.html, /data-path="readerSettings\.dialogFontWeight"/);
    assert.match(classicDialogView.snapshot.html, /跟随当前样式/);
    settings.setValue('readerSettings.dialogFontWeight', '700');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogFontWeight, 700);
    assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).dialogFontWeight, 700);
    settings.setValue('readerSettings.dialogFontWeight', 'null');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogFontWeight, null);
    settings.setValue('readerSettings.dialogFontWeight', 'not-a-weight');
    assert.equal(settings.getSnapshot().draft.readerSettings.dialogFontWeight, null);
    assert.match(classicDialogView.snapshot.html, /data-path="readerSettings\.classicDialogWidthPercent"/);
    assert.match(classicDialogView.snapshot.html, /60%/);
    const roundedFont = '"IGS Rounded","Microsoft YaHei",sans-serif';
    assert.match(classicDialogView.snapshot.html, /有爱圆体（内置）/);
    settings.setValue('readerSettings.classicVnTheme.nameFont', roundedFont);
    assert.equal(settings.getSnapshot().draft.readerSettings.classicVnTheme.nameFont, roundedFont);
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
    assert.equal(overlay.querySelector('#igs-btn-next').parentNode, collapsible);
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
    assert.equal(mutationObservers.length, 1);
    eventSource.emit('generation_started');

    const streamingElement = createFakeMessageElement(document, { messageId: 71, textContent: '流式中的楼层字样。' });
    const streamingText = streamingElement.querySelector('.mes_text');
    chat.appendChild(streamingElement);
    currentMessage = { id: 71, text: '流式中的楼层字样。', visibleText: '流式中的楼层字样。', element: streamingElement };
    messages.set(71, currentMessage);
    mutationObservers[0].handler([{ target: chat, addedNodes: [streamingElement], removedNodes: [] }]);

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

    mutationObservers[0].handler([{ target: streamingText, addedNodes: [], removedNodes: [] }]);
    assert.equal(streamHost.querySelector('.igs-embedded-loading'), null);
    vn.destroy();
    assert.equal(streamingText.style.display, '');
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
    assert.match(opened.reader.snapshot.source.styleText, /\.igs-mode-embedded \.igs-progress\{display:none;\}/);

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
    assert.equal(panel.getState().selectedId, 'sheet_map:home');
    assert.equal(panel.getState().model.tables.length, 1);
    assert.equal(panel.open(overlay, {}, '我家').reason, 'already-open');
    assert.equal(callbacks.size, 1);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /屋子 &lt;安全&gt;/);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /left:20%;top:70%/);
    assert.match(document.getElementById('igs-map-panel').innerHTML, /stroke="currentColor"/);
    await act('enter', 'sheet_map:home');
    assert.equal(panel.getState().parentId, 'sheet_map:home');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /未标注坐标的地点/);
    await act('select', 'sheet_map:floor');
    await act('enter', 'sheet_map:floor');
    assert.match(document.getElementById('igs-map-panel').innerHTML, /left:50%;top:50%/);
    await act('select', 'sheet_map:room');
    await act('travel');
    assert.match(panel.getState().message, /未覆盖/);
    assert.equal(writes, 0);
    rows = [home, floor, ['room', 'floor', '新房间', '.5', '.5', '', '', '1']];
    callbacks.forEach(callback => callback());
    assert.equal(panel.getState().model.tables[0].locations[2].name, '新房间');
    await act('back');
    assert.equal(panel.getState().parentId, 'sheet_map:home');
    panel.close();
    assert.equal(callbacks.size, 0);
    assert.equal(document.getElementById('igs-map-panel'), null);
    assert.equal(restoredFocus, 1);
    assert.equal(panel.open(overlay, {}, '').ok, true);
    assert.equal(callbacks.size, 1);
    assert.ok(reads >= 2);
    const backdrop = document.getElementById('igs-map-panel');
    await backdrop.dispatchEvent({ type: 'click', target: backdrop });
    assert.equal(callbacks.size, 0);
    assert.equal(restoredFocus, 2);
    assert.equal(document.getElementById('igs-map-panel'), null);
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
    assert.match(docStyle, /#igs-map-panel .igs-map-plane/);
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
        hostAdapter: { getCurrentMessage: async () => ({ id: 21, text: '<content>[igs-scene:我家|夜晚|晴天]\n[igs-char:Alice|平静|你好。]</content>' }),
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
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-status-hud \.igs-hud-identity\{position:relative;z-index:1;pointer-events:none;/);
    assert.match(css, /#igs-status-hud \.igs-hud-toggle\{z-index:0;\}/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-arrow\{[^}]*width:32px;height:32px;[^}]*pointer-events:auto;/);
    assert.match(css, /#igs-status-hud \.igs-hud-entry-menu\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
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
    assert.equal(mapItem.querySelector('span').textContent, '地图');
    await readerRoot.dispatchEvent({ type: 'click', target: mapItem });
    assert.ok(document.getElementById('igs-map-panel'));
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
                sheet_diary: { uid: 'sheet_diary', name: '恋爱日记表', content: [['标题', '日期', '正文'],
                    ['晚', '2024-03-02', '<img src=x onerror=alert(1)>'], ['早', '2024-03-01', '第一天']] },
                sheet_items: { uid: 'sheet_items', name: '随身物品', content: [['物品名称', '描述'],
                    ['钥匙', '<安全>'], ['未知物', '无法识别']] },
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
    let root = document.getElementById('igs-record-panel');
    assert.match(root.innerHTML, /恋爱日记表/);
    assert.ok(root.innerHTML.indexOf('早') < root.innerHTML.indexOf('晚'));
    assert.match(root.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
    callbacks.forEach(callback => callback());
    assert.equal(reads, 2);
    panel.close();
    assert.equal(callbacks.size, 0);
    assert.equal(restoredFocus, 1);
    assert.equal(document.getElementById('igs-record-panel'), null);

    assert.equal(panel.open(overlay, {}, 'inventory').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.match(root.innerHTML, /随身物品/);
    assert.match(root.innerHTML, /钥匙/);
    assert.match(root.innerHTML, /未知物/);
    assert.match(root.innerHTML, /&lt;安全&gt;/);
    const item = document.createElement('button');
    item.setAttribute('data-record-act', 'select');
    item.setAttribute('data-record-id', 'sheet_items:1');
    root.appendChild(item);
    await root.dispatchEvent({ type: 'click', target: item });
    item.remove();
    assert.equal(panel.getState().selectedId, 'sheet_items:1');
    assert.match(root.innerHTML, /无法识别/);
    panel.close();

    assert.equal(panel.open(overlay, {}, 'relationships').ok, true);
    root = document.getElementById('igs-record-panel');
    assert.match(root.innerHTML, /<table>/);
    assert.match(root.innerHTML, /&lt;敌视&gt;/);
    assert.equal(writes, 0);
    panel.close();
    assert.equal(restoredFocus, 3);
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
    assert.match(html, /显示左上角状态栏/);
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
    assert.match(enabled, /显示左上角状态栏/);
    assert.match(enabled, /显示情绪标签/);
    assert.match(enabled, /显示地点栏（仅旁白）/);
    assert.match(enabled, /显示更多的场景信息/);
    assert.match(enabled, /显示左上角状态栏[\s\S]*显示情绪标签[\s\S]*显示地点栏（仅旁白）[\s\S]*显示更多的场景信息/);
    assert.doesNotMatch(enabled, /启用背景滤镜|启用人物过场滤镜|显示NSFW场景下的人物立绘/);
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
    assert.match(enabled, /<div class="igs-settings-field"><span>读取表格<\/span><div class="igs-status-hud-tables"/);
    assert.doesNotMatch(enabled, /<label class="igs-settings-field"><span>读取表格<\/span>/);

    const performance = settings.switchReaderSubTab('performance').snapshot.html;
    assert.match(performance, /启用打字机演出/);
    assert.match(performance, /启用人物过场滤镜（仅旁白）[\s\S]*按照句号自动分页（仅旁白）[\s\S]*显示NSFW场景下的人物立绘/);
    assert.match(performance, /NSFW黑幕强度/);
    const dialog = settings.switchReaderSubTab('dialog').snapshot.html;
    assert.match(dialog, /启用背景滤镜/);
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

    const persisted = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.equal(persisted.statusHud.enabled, true);
    assert.equal(persisted.statusHud.showLocation, true);
    assert.equal(persisted.statusHud.showLocationDetails, true);
    assert.equal(persisted.statusHud.background, 'dialog');
    assert.equal(persisted.statusHud.barColor, 'grayscale');
    assert.deepEqual(persisted.statusHud.tables.map((t) => t.uid), ['sheet_stats']);


    // 关闭总开关后：顶部 UI 的状态栏子设置隐藏，其他分类互不受影响。
    settings.setValue('readerSettings.statusHud.enabled', false);
    const disabled = settings.switchReaderSubTab('interface').snapshot.html;
    assert.match(disabled, /显示左上角状态栏/);
    assert.doesNotMatch(disabled, /显示情绪标签/);
    assert.doesNotMatch(disabled, /显示地点栏/);
    assert.doesNotMatch(disabled, /显示更多的场景信息/);
    assert.doesNotMatch(disabled, /启用背景滤镜|启用人物过场滤镜|显示NSFW场景下的人物立绘/);
    assert.match(settings.switchReaderSubTab('performance').snapshot.html, /启用人物过场滤镜（仅旁白）/);
    assert.match(settings.switchReaderSubTab('dialog').snapshot.html, /显示对话框内状态行/);

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

    const labels = Array.from(host.querySelectorAll('.igs-hud-metric-label')).map((node) => node.textContent);
    assert.deepEqual(labels, ['信任', '好感', '了解', '体力']);
    const overlay = document.getElementById('igs-overlay');
    const readerRoot = overlay.parentNode;
    assert.ok(readerRoot);
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
    assert.equal(host.querySelector('.igs-hud-location').tagName, 'BUTTON');
    assert.equal(host.querySelector('.igs-hud-location').getAttribute('data-act'), 'map');
    assert.equal(host.querySelector('.igs-hud-location-icon'), null);
    assert.equal(host.querySelectorAll('.igs-hud-metric').length, 0);

    const styleText = getOriginalReaderStyleText();
    const locationStyle = styleText.match(/\.igs-hud-location-label\{([^}]*)\}/);
    assert.ok(locationStyle);
    assert.doesNotMatch(locationStyle[1], /background|border-radius|padding/);

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
    assert.equal(host.querySelector('.igs-hud-location').getAttribute('data-act'), 'map');
    assert.equal(host.querySelector('.igs-hud-location-icon'), null);

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
        global: { document, localStorage: storage, prompt: () => '震撼' },
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
    assert.match(disabled, /启用震动演出/);
    assert.doesNotMatch(disabled, /震动强度/);
    settings.setValue('readerSettings.stageShake.enabled', true);
    const enabled = settings.switchReaderSubTab('performance').snapshot.html;
    assert.match(enabled, /震动强度/);
    assert.match(enabled, /触发情绪/);
    settings.invoke('stage-shake-remove-emotion:%E9%9C%87%E6%92%BC');
    settings.invoke('stage-shake-add-emotion');
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
    const settings = (await opened.reader.controller.invokeAction('settings')).controller;
    const name = overlay.querySelector('#igs-speaker');
    const text = overlay.querySelector('#igs-text');
    assert.equal(Object.hasOwn(settings.getSnapshot().draft.readerSettings, 'dialogFont'), false);
    assert.equal(name.style.display, 'block');
    assert.equal(name.style.fontWeight || '', '');
    assert.equal(text.style.fontWeight || '', '');
    settings.setValue('readerSettings.dialogFontWeight', '700');
    assert.equal(name.style.fontWeight, '700');
    assert.equal(text.style.fontWeight, '700');
    assert.equal(dialog.style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-input').style.fontWeight || '', '');
    assert.equal(overlay.querySelector('#igs-ctrl-bar').style.fontWeight || '', '');
    settings.setValue('readerSettings.vnTheme.nameFont', '"IGS Rounded","Microsoft YaHei",sans-serif');
    assert.match(name.style.fontFamily, /IGS Rounded/);
    settings.setValue('readerSettings.vnTheme.textFont', '"IGS Rounded","Microsoft YaHei",sans-serif');
    assert.match(text.style.fontFamily, /IGS Rounded/);
    settings.setValue('readerSettings.dialogFontWeight', 'null');
    assert.equal(name.style.fontWeight, '');
    assert.equal(text.style.fontWeight, '');
    settings.switchTab('reader');
    const dialogView = settings.switchReaderSubTab('dialog');
    assert.match(dialogView.snapshot.html, /植物咖啡/);
    assert.match(dialogView.snapshot.html, /黑白漫画/);
    assert.match(dialogView.snapshot.html, /超可爱粉/);
    settings.setValue('readerSettings.dialogSkin', 'black-white-manga');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'black-white-manga');
    settings.setValue('readerSettings.dialogSkin', 'cute-pink');
    assert.equal(dialog.getAttribute('data-igs-dialog-skin'), 'cute-pink');
    const saved = JSON.parse(storage.getItem('igs-reader-settings-v9-default'));
    assert.equal(saved.dialogSkin, 'cute-pink');
    vn.destroy();
});
