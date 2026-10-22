import { createReaderImageService } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createInputChannel } from '../src/host/input-channel.js';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { findOptionTable, extractOptionTexts, readOptionItems, OPTION_TABLE_NAMES } from '../src/choices/option-table.js';
import { parseDiceCommand, successLevel, rollD100, resolveDiceCommand, formatCheckMessage, findAcuDice } from '../src/choices/dice-check.js';
import {
    buildIgsTextPayload,
    cleanNarrativeSource,
    DEFAULT_SOURCE_FILTER,
    DEFAULT_VIRTUAL_REGEX,
    normalizeVirtualRegex,
} from '../src/scene/message-source.js';
import {
    buildNarrativeSegments,
    buildSegmentImageMap,
    parseImageSlots,
} from '../src/scene/image-slots.js';
import { parseSceneText } from '../src/scene/text-parser.js';
import { applyAlignStyle, pinEmbeddedHostFrame, syncEmbeddedHostFrame, watchEmbeddedFrameResize } from '../src/visual/igs-ui/reader-dom-render.js';
import { applySpriteDisplayScale, resolveSpriteLayout, resolveActiveTheme, renderDialogueHtml, spriteStoredScale } from '../src/visual/igs-ui/settings-normalize.js';
import {
    DIALOG_SKIN_BLACK_WHITE_MANGA,
    DIALOG_SKIN_CUTE_PINK,
    DIALOG_SKIN_GRADIENT_VEIL,
    DIALOG_SKIN_PLANT_COFFEE,
    normalizeDialogSkin,
} from '../src/visual/igs-ui/classic-dialog-skin.js';
import { normalizeGradientVeil } from '../src/visual/igs-ui/gradient-veil-dialog-skin.js';
import { runTextPipeline } from '../src/scene/text-pipeline.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { resolveScene } from '../src/scene/scene-resolver.js';
import { getResponsiveLayout } from '../src/visual/responsive-layout.js';
import { createReaderState } from '../src/visual/reader-state.js';
import { createStageModel } from '../src/visual/stage-model.js';
import { resolveVisualMode, VISUAL_MODES } from '../src/visual/visual-mode.js';
import { createPromptAdapter } from '../src/prompts/adapters/prompt-adapter.js';
import { naiRequestBuilder } from '../src/generated-images/request-builders/nai-builder.js';
import { fetchModels as fetchImageModels, generateImage as generateImageFromApi } from '../src/generated-images/image-api-client.js';

import { createPublicApi, attachPublicApi } from '../src/api/public-api.js';
import { createIgsCompatApi } from '../src/api/igs-compat.js';
import {
    createTavernHelperAdapter,
    ensureMessageImagePlaceholders,
} from '../src/host/tavern-helper-adapter.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { syncSpriteTextWait } from '../src/visual/igs-ui/reader-dom-render.js';
import { createPromptInjector } from '../src/host/prompt-injector.js';
import {
    extractSceneDirectives,
    lookupSceneAssetUrls,
    resolveSceneStateAtIndex,
} from '../src/scene/scene-directives.js';
import {
    DEFAULT_MOOD_GROUPS,
    buildMoodGroupsText,
    normalizeMoodGroups,
    resolveMoodGroup,
    fuzzyResolveMoodGroup,
} from '../src/scene/mood-groups.js';
import { loadMoodReview, recordMoodReview, MOOD_REVIEW_LIMIT } from '../src/scene/mood-review-store.js';
import { applyMoodAssignments, parseMoodClassification } from '../src/scene/mood-classify.js';
import { renderMoodReviewList } from '../src/visual/igs-ui/settings-fields.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { getNextSettingsTheme, normalizeSettingsTheme } from '../src/visual/igs-ui/settings-theme.js';
import { renderCharacterAssetList, renderSceneAssetList, tableMultiSelect } from '../src/visual/igs-ui/settings-fields.js';
import { DEFAULT_SCENE_PROMPT_RULE, normalizeScenePromptRule } from '../src/visual/igs-ui/reader-host-constants.js';
import { PUBLIC_READER_MODES, getReaderModeLabel, isEmbeddedReaderMode, normalizePublicReaderMode } from '../src/schemas/reader-mode.js';
import { collapseBlankShells, ensureEmbeddedHost, findStorySpan, hideEmbeddedSourceText, isEmbeddedEditTrigger, isStoryHidden, resolveHostEditFinish, restoreBlankShells, restoreEmbeddedSourceText, resolveEmbeddedHostParent, storyEdgeLines, storyLines } from '../src/visual/igs-ui/embedded-reader-runtime.js';
import { buildReaderSourceSignature, createReaderSourceCache } from '../src/visual/igs-ui/reader-source-cache.js';
import { createChatStreamObserver } from '../src/host/chat-stream-observer.js';
import { INVENTORY_GROUP_ORDER, RECORD_ICONS, inventoryGroupLabel, inventoryIconKey } from '../src/visual/igs-ui/record-icons.js';
import { autoPlaceMapPoints, centerMapCamera } from '../src/visual/igs-ui/map-viewport.js';
import { parseLooseDate } from '../src/data/shujuku/record-model.js';
import { createCharacterMetricsLookup } from '../src/data/shujuku/character-metrics.js';

test('gate:igs-ui:embedded-edit-finish-matches-floor-done-or-cancel', () => {
    const mes = (attrs) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null) });
    const button = (cls, message) => {
        const node = { closest: (sel) => (sel === cls ? node : sel === '.mes' ? message : null) };
        return node;
    };
    const m5 = mes({ mesid: '5' });
    const m6 = mes({ mesid: '6' });
    assert.equal(resolveHostEditFinish(button('.mes_edit_done', m5), 5), 'done', '挂载楼层点完成');
    assert.equal(resolveHostEditFinish(button('.mes_edit_cancel', m5), '5'), 'cancel', '挂载楼层点取消');
    assert.equal(resolveHostEditFinish(button('.mes_edit_done', m6), 5), null, '其他楼层的完成不重开');
    assert.equal(resolveHostEditFinish(button('.mes_edit_done', mes({ 'data-mesid': '5' })), 5), 'done', 'data-mesid 兜底');
    assert.equal(resolveHostEditFinish({ closest: () => null }, 5), null, '非完成 / 取消点击');
    assert.equal(resolveHostEditFinish(button('.mes_edit_done', m5), null), null);
    assert.equal(resolveHostEditFinish(null, 5), null);
});

const appRoot = path.resolve(import.meta.dirname, '..');

test('gate:presets:registry-current-survives-storage-reload', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const storage = createMemoryStorage();
    const registry = createPresetRegistry({ storage });

    registry.importBundle(bundle);
    registry.setCurrent('text-filter-preset', 'preset.text-filter.content-only');
    registry.setCurrent('text-format-preset', 'preset.text-format.bubble-line');
    registry.setCurrent('scene-regex-preset', 'preset.scene-regex.stage-fields');

    const reloaded = createPresetRegistry({ storage });
    assert.equal(reloaded.snapshot().current['text-filter-preset'], 'preset.text-filter.content-only');
    assert.equal(reloaded.snapshot().current['text-format-preset'], 'preset.text-format.bubble-line');
    assert.equal(reloaded.snapshot().current['scene-regex-preset'], 'preset.scene-regex.stage-fields');
    assert.equal(reloaded.getCurrent('text-format-preset').name, 'Bubble 转对话行');
});

test('gate:presets:export-group-keeps-igs-bundle-shape', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const registry = createPresetRegistry();

    registry.importBundle(bundle);
    const exported = registry.exportGroup('text-format-preset');

    assert.equal(exported.type, 'igs-import-bundle');
    assert.equal(exported.items.length, 1);
    assert.equal(exported.items[0].type, 'text-format-preset');
});

test('gate:igs-ui:excluded-only-message-never-renders-from-stale-reader-fallback', () => {
    const filter = { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' };
    const host = createIgsReaderHost({ global: {} });
    const opened = host.openReader({
        message: { text: '<content><thinking>不能显示</thinking></content>', visibleText: '不能显示' },
        sourceFilter: filter,
        visibleText: '不能显示',
        textSegments: ['不能显示'],
        formattedText: '不能显示',
    }, { mode: 'pc' });

    assert.equal(opened.ok, false);
    assert.equal(opened.reason, 'no-readable-text');
    assert.equal(host.getState().activeReader, null);
    host.destroy();
});

test('gate:igs-ui:classic-dialog-active-theme-keeps-default-isolated', () => {
    const theme = resolveActiveTheme({
        readerSettings: {
            dialogSkin: 'western-classic',
            _vnTheme: { preset: 'custom', textColor: '#abcdef' },
            classicVnTheme: { preset: 'custom', textColor: '#123456', nameColor: '#654321' },
        },
    });
    assert.equal(theme.textColor, '#123456');
    assert.equal(theme.nameColor, '#654321');
    assert.equal(theme.narrationColor, '#ddd3b8');
    assert.equal(theme.dividerSymbol, 'none');
});

test('gate:igs-ui:resolve-sprite-layout-keeps-mode-isolated', () => {
    const layouts = {
        pc: { posX: 50, posY: 100, scale: 90 },
        'pc::小林海斗::平和': { posX: 70, posY: 30, scale: 180 },
        mobile: { posX: 50, posY: 100, scale: 110 },
        'mobile::小林海斗::平和': { posX: 40, posY: 90, scale: 200 },
    };
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林海斗', '平和'), { posX: 70, posY: 30, scale: 180 });
    assert.deepEqual(resolveSpriteLayout(layouts, 'mobile', '小林海斗', '平和'), { posX: 40, posY: 90, scale: 200 });
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '没摆过', ''), { posX: 50, posY: 100, scale: 90 });
    // 切到没有该 key 的模式回退默认，不会串用其他模式的数据
    assert.deepEqual(resolveSpriteLayout(layouts, 'web', '小林海斗', '平和'), { posX: 50, posY: 100, scale: 100 });
});


function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, writes: () => map.size };
}

test('gate:scene:mood-review-ai-classify-restores-draft-when-settings-save-throws', async () => {
    const storage = memoryStorage();
    recordMoodReview(storage, { word: '迟疑' });
    const draft = { bridge: { sceneAssets: { moodGroups: [{ label: '思考', words: [] }] } } };
    const ctx = { state: { activeSettings: { draft, asyncState: {} } },
        options: { global: { localStorage: storage, alert: () => {} }, requestMoodClassification: async () => '{"assignments":[{"word":"迟疑","group":"思考"}]}' },
        persistSettingsDraft: () => { throw new Error('storage full'); }, rerenderSettings: () => ({ ok: true }),
    };
    const result = await handleSettingsAction('mood-review-ai-classify', ctx);
    assert.equal(result.reason, 'mood-classification-failed');
    assert.deepEqual(draft.bridge.sceneAssets.moodGroups, [{ label: '思考', words: [] }]);
    assert.deepEqual(loadMoodReview(storage).map((item) => item.word), ['迟疑']);
});



test('gate:scene:prompt-rule-draft-only-persists-on-explicit-save', async () => {
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                promptRule: '旧规则',
                scenes: {},
                characters: {},
            },
        },
        readerSettings: {},
    };
    const asyncState = { promptRuleDraft: '新规则' };
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState } },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true, status: asyncState.promptRuleStatus }),
        buildRegexPreview: () => '',
    };

    assert.equal(draft.bridge.sceneAssets.promptRule, '旧规则');
    assert.equal(persistCount, 0);
    const saved = await handleSettingsAction('save-prompt-rule', ctx);
    assert.equal(saved.ok, true);
    assert.equal(draft.bridge.sceneAssets.promptRule, '新规则');
    assert.equal(persistCount, 1);
    assert.equal(asyncState.promptRuleStatus, '提示词已保存并更新注入规则。');

    await handleSettingsAction('reset-prompt-rule', ctx);
    assert.equal(draft.bridge.sceneAssets.promptRule, DEFAULT_SCENE_PROMPT_RULE);
    assert.equal(asyncState.promptRuleDraft, DEFAULT_SCENE_PROMPT_RULE);
    assert.equal(persistCount, 2);
});

test('gate:scene:empty-prompt-uses-default-saved-rule-stays', () => {
    assert.equal(normalizeScenePromptRule(''), DEFAULT_SCENE_PROMPT_RULE);
    assert.equal(normalizeScenePromptRule('自定义规则'), '自定义规则');
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /NSFW场景加第4栏大写NSFW/);
    // NSFW 只规定格式与触发条件，不解释前端用途。
    assert.doesNotMatch(DEFAULT_SCENE_PROMPT_RULE, /前端隐藏人物视觉/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /\[igs-char:角色名\|表情\|服装\|对白\]/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /不写家具摆设/);
});

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function buildStoredZip(filename, bytes) {
    const nameBytes = Buffer.from(String(filename || ''), 'utf8');
    const dataBytes = Buffer.from(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(dataBytes.length, 18);
    header.writeUInt32LE(dataBytes.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, nameBytes, dataBytes]);
}

function createFakeImageNode(url) {
    return {
        tagName: 'IMG',
        src: url,
        currentSrc: url,
        ownerDocument: null,
        className: '',
        style: {
            backgroundImage: '',
        },
        getAttribute() {
            return null;
        },
        closest() {
            return null;
        },
        querySelector() {
            return null;
        },
    };
}

function createTestMesTextRoot() {
    const children = [];
    return {
        ownerDocument: {
            createElement() {
                return createTestElement();
            },
        },
        children,
        appendChild(node) {
            node.parentNode = this;
            node.parentElement = this;
            children.push(node);
            return node;
        },
        dispatchEvent() {
            return true;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const owned = children.filter((child) => {
                const hasOwnedClass = String(child.className || '').split(/\s+/).includes('igs-image-placeholder');
                const hasOwnedAttr = child.getAttribute && child.getAttribute('data-igs-image-placeholder') === '1';
                const hasLegacyClass = String(child.className || '').split(/\s+/).includes('igs-img-ph');
                return selector === '[data-igs-image-placeholder="1"], .igs-image-placeholder'
                    ? hasOwnedClass || hasOwnedAttr
                    : selector === '.igs-img-ph'
                        ? hasLegacyClass
                        : false;
            });
            return owned;
        },
    };
}

function createTestElement() {
    const attributes = new Map();
    return {
        className: '',
        style: {},
        textContent: '',
        parentNode: null,
        parentElement: null,
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
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

function createAcuDiceMock(attributes, rolls = []) {
    const calls = [];
    const queue = [...rolls];
    const lookup = (name, attribute) => {
        const key = `${name}.${attribute}`;
        return Object.prototype.hasOwnProperty.call(attributes, key) ? attributes[key] : null;
    };
    return {
        calls,
        getAttributeValue(name, attribute) { calls.push(['getAttributeValue', name, attribute]); return lookup(name, attribute); },
        async checkByCharacter(params) {
            calls.push(['checkByCharacter', params]);
            return { success: true, roll: queue.shift(), target: lookup(params.name, params.attribute) };
        },
        async contest(params) {
            calls.push(['contest', params]);
            return { left: { roll: queue.shift() }, right: { roll: queue.shift() }, winner: 'left' };
        },
    };
}

import {
    STATUS_HUD_DEFAULTS,
    buildStatusHudModel,
    listStatusHudTables,
    normalizeStatusHudSettings,
    parseMetricCell,
    resolveStatusHudScale,
    resolveStatusHudLocationScale,
} from '../src/data/shujuku/status-hud-model.js';

function createSceneInheritanceApp(floors) {
    const captured = { payload: null };
    return {
        captured,
        getState: () => ({ config: { sceneAssets: { enabled: true } } }),
        hostAdapter: {
            async getMessageById(id) {
                return floors.find((m) => m.id === Number(id)) || null;
            },
            async getAdjacentMessage(id, delta) {
                const idx = floors.findIndex((m) => m.id === Number(id));
                if (idx < 0) return null;
                return floors[idx + (Number(delta) < 0 ? -1 : 1)] || null;
            },
        },
        refresh: async () => ({ ok: true, render:{}, scene: {} }),
        igsUi: {
            openReader(payload) {
                captured.payload = payload;
                return { ok: true };
            },
        },
    };
}

function createFakeMatteDom() {
    const fakeEl = (tag) => {
        const n = {
            tagName: String(tag).toUpperCase(), children: [], attrs: {}, listeners: {}, parentNode: null, textContent: '', disabled: false, id: '',
            classList: { set: new Set(), toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); } },
            appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
            append(...cs) { cs.forEach((c) => n.appendChild(c)); },
            removeChild(c) { n.children = n.children.filter((x) => x !== c); c.parentNode = null; },
            setAttribute(k, v) { n.attrs[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; },
            addEventListener(t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); },
            fire(t, e = {}) { for (const f of n.listeners[t] || []) f({ stopPropagation() {}, preventDefault() {}, ...e }); },
        };
        if (n.tagName === 'CANVAS') {
            n.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData(img) { n.lastImage = img; } });
            n.getBoundingClientRect = () => ({ left: 0, top: 0, width: n.width, height: n.height });
            n.setPointerCapture = () => {};
        }
        return n;
    };
    const find = (node, id) => {
        if (node.id === id) return node;
        for (const c of node.children) { const hit = find(c, id); if (hit) return hit; }
        return null;
    };
    const win = { confirmAnswer: true, confirm() { return win.confirmAnswer; } };
    const doc = { head: fakeEl('head'), body: fakeEl('body'), createElement: fakeEl, defaultView: win };
    doc.getElementById = (id) => find(doc.head, id) || find(doc.body, id);
    return { doc, win };
}
