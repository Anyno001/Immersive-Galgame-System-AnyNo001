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
import { applyAlignStyle, syncEmbeddedHostFrame } from '../src/visual/igs-ui/reader-dom-render.js';
import { resolveSpriteLayout, resolveActiveTheme, renderDialogueHtml } from '../src/visual/igs-ui/settings-normalize.js';
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
import { createReaderImageService } from '../src/generated-images/reader-image-service.js';
import { createPublicApi, attachPublicApi } from '../src/api/public-api.js';
import { createIgsCompatApi } from '../src/api/igs-compat.js';
import {
    createTavernHelperAdapter,
    ensureMessageImagePlaceholders,
} from '../src/host/tavern-helper-adapter.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
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

test('gate:visual:inventory-icons-use-static-tabler-whitelist-and-longest-match', () => {
    assert.equal(inventoryIconKey('黄铜钥匙圈'), 'key');
    assert.equal(inventoryIconKey('门禁卡'), 'key');
    assert.equal(inventoryIconKey('药瓶'), 'potion');
    assert.equal(inventoryIconKey('空墨水瓶'), 'bottle');
    assert.equal(inventoryIconKey('弓箭'), 'bow');
    assert.equal(inventoryIconKey('铁剑'), 'weapon');
    assert.equal(inventoryIconKey('苹果'), 'food');
    assert.equal(inventoryIconKey('钻石'), 'gem');
    assert.equal(inventoryIconKey('工具箱'), 'tool');
    assert.equal(inventoryIconKey('宝箱'), 'box');
    assert.equal(inventoryIconKey('指南针'), 'compass');
    assert.equal(inventoryIconKey('未知物'), 'generic');
    assert.equal(inventoryIconKey({ title: '普通物品', description: '钥匙' }), 'generic');
    assert.equal(inventoryIconKey('<script>钥匙</script>'), 'key');
    assert.equal(inventoryIconKey('车票'), 'ticket');
    assert.equal(inventoryIconKey('便笺'), 'note');
    assert.equal(inventoryIconKey('手电筒'), 'flashlight');
    assert.equal(inventoryIconKey('怀表'), 'watch');
    assert.equal(inventoryIconKey('信封'), 'envelope');
    assert.equal(inventoryIconKey('笔记本'), 'notebook');
    assert.equal(inventoryIconKey('钱包'), 'wallet');
    assert.equal(inventoryIconKey('书包'), 'bag');
    assert.equal(inventoryIconKey('信用卡'), 'card');
    assert.equal(inventoryGroupLabel('车票'), '文书');
    assert.equal(inventoryGroupLabel('门禁卡'), '钥匙证件');
    assert.equal(inventoryGroupLabel('未知物'), '其他');
    assert.ok(INVENTORY_GROUP_ORDER.includes('其他'));
    for (const key of ['key', 'book', 'potion', 'bottle', 'bow', 'food', 'weapon', 'armor', 'money', 'tool', 'gem', 'box', 'candle', 'dice', 'crown', 'compass', 'ticket', 'note', 'flashlight', 'watch', 'envelope', 'notebook', 'generic']) {
        assert.match(RECORD_ICONS[key], /viewBox="0 0 24 24"/);
        // 细线图标：统一描边、不填充，粗细由样式层控制。
        assert.match(RECORD_ICONS[key], /fill="none" stroke="currentColor" stroke-width="1\.3"/);
        assert.doesNotMatch(RECORD_ICONS[key], /fill="currentColor"|<script|onerror|黄铜钥匙圈/);
    }
});

test('gate:visual:map-auto-layout-and-focus-are-deterministic', () => {
    const fixed = [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.6 }];
    const first = autoPlaceMapPoints(fixed, 3, 16 / 9);
    assert.deepEqual(first, autoPlaceMapPoints(fixed, 3, 16 / 9));
    assert.equal(first.length, 3);
    for (const point of first) {
        assert.ok(point.x >= 0.14 && point.x <= 0.86 && point.y >= 0.2 && point.y <= 0.8);
        for (const other of fixed) assert.ok(Math.hypot((point.x - other.x) * 16 / 9, point.y - other.y) > 0.1);
    }
    assert.equal(new Set(first.map(point => `${point.x},${point.y}`)).size, 3);
    assert.deepEqual(autoPlaceMapPoints(fixed, 0), []);
    const camera = centerMapCamera({ k: 1, tx: 0, ty: 0 }, 400, 800, 1600, 900, 100, 100);
    assert.deepEqual(camera, { k: 1, tx: 0, ty: 0 }, 'clamps at the world edge');
    const middle = centerMapCamera({ k: 1, tx: 0, ty: 0 }, 400, 800, 1600, 900, 800, 450);
    assert.equal(middle.tx, -600);
    assert.equal(middle.ty, -50);
});

test('gate:data:loose-dates-and-character-metrics-read-explicit-values', () => {
    assert.equal(parseLooseDate('2024-06-18').label, '06.18');
    assert.equal(parseLooseDate('2024年6月8日 傍晚').label, '06.08');
    assert.equal(parseLooseDate('6月8日 20:30').label, '06.08');
    assert.ok(parseLooseDate('2024-06-18 09:00').key > parseLooseDate('2024-06-18').key);
    assert.ok(parseLooseDate('2024-06-18').key > parseLooseDate('2024-05-30').key);
    assert.equal(parseLooseDate('第三天傍晚'), null);
    assert.equal(parseLooseDate('13月2日'), null);
    const readResult = { ok: true, data: {
        metrics: { uid: 'sheet_metrics', name: '角色数值表', content: [['row_id', '角色姓名', '好感度', '信任度', '已知秘密', '关系阶段'],
            [1, '林夏', '72', '65/100', '她会弹琴', '暧昧'], [2, '陈屿', '120', '', '', '']] },
        other: { uid: 'sheet_other', name: '物品表', content: [['row_id', '物品名称', '数量'], [1, '林夏', '3']] },
    } };
    const lookup = createCharacterMetricsLookup(readResult);
    const linxia = lookup('林夏');
    assert.deepEqual(linxia.metrics.map(item => [item.label, item.percent]), [['好感度', 72], ['信任度', 65]]);
    assert.deepEqual(linxia.stages, [{ label: '关系阶段', value: '暧昧' }]);
    assert.deepEqual(lookup('陈屿').metrics, [], 'out-of-range plain values are not shown');
    assert.deepEqual(lookup('无名').metrics, []);
    assert.deepEqual(createCharacterMetricsLookup({ ok: false, reason: 'x' })('林夏'), { metrics: [], stages: [] });
    const picked = createCharacterMetricsLookup(readResult, { selectedTables: [{ uid: 'sheet_other', name: '物品表' }] })('林夏');
    assert.deepEqual(picked.metrics.map(item => item.label), ['好感度', '信任度']);
});

test('gate:igs-ui:reader-mode-schema-is-single-source-with-embedded', () => {
    assert.deepEqual(Array.from(PUBLIC_READER_MODES), ['pc', 'mobile', 'web', 'fullscreen', 'embedded']);
    assert.equal(getReaderModeLabel('mobile'), '窄屏模式');
    assert.equal(getReaderModeLabel('embedded'), '楼层内嵌');
    assert.equal(isEmbeddedReaderMode('embedded'), true);
    assert.equal(isEmbeddedReaderMode('pc'), false);
    assert.equal(normalizePublicReaderMode('embedded'), 'embedded');
    assert.equal(normalizePublicReaderMode('nope'), 'pc');
});

test('gate:igs-ui:embedded-source-cache-parses-once-per-signature', () => {
    const cache = createReaderSourceCache({ parse: (input) => ({ value: input.mark }) });
    const signature = buildReaderSourceSignature({
        messageId: 7,
        rawText: 'line one\nline two',
        visibleText: 'line one\nline two',
        sourceFilter: { enabled: true },
        virtualRegex: { enabled: true, pattern: 'x', flags: 'g', replacement: 'y' },
        sceneAssetsEnabled: false,
        sentencePaging: false,
    });
    for (let index = 0; index < 100; index += 1) cache.get(signature, { mark: index });
    const hit = cache.get(signature, { mark: 999 });
    assert.equal(cache.getParseCount(), 1);
    assert.equal(hit.hit, true);
    assert.equal(hit.value.value, 0);

    const pagingSignature = buildReaderSourceSignature({
        messageId: 7,
        rawText: 'line one\nline two',
        visibleText: 'line one\nline two',
        sourceFilter: { enabled: true },
        virtualRegex: { enabled: true, pattern: 'x', flags: 'g', replacement: 'y' },
        sceneAssetsEnabled: false,
        sentencePaging: true,
    });
    cache.get(pagingSignature, { mark: 2 });
    assert.equal(cache.getParseCount(), 2);
});

test('gate:igs-ui:embedded-source-cache-tolerates-circular-host-objects', () => {
    const circular = { name: 'config' };
    circular.self = circular;
    const signature = buildReaderSourceSignature({
        messageId: 1,
        rawText: 'text',
        visibleText: 'text',
        sourceFilter: circular,
        virtualRegex: null,
        sceneAssetsEnabled: false,
        sentencePaging: false,
    });
    assert.equal(typeof signature, 'string');
    assert.ok(signature.length > 0);
});

test('gate:igs-ui:embedded-cache-evicts-oldest-beyond-limit', () => {
    const cache = createReaderSourceCache({ limit: 2, parse: (input) => input.mark });
    cache.get('a', { mark: 1 });
    cache.get('b', { mark: 2 });
    cache.get('c', { mark: 3 });
    assert.equal(cache.size(), 2);
    const reparse = cache.get('a', { mark: 4 });
    assert.equal(reparse.hit, false);
});

test('gate:igs-ui:embedded-frame-locks-configured-size', () => {
    const host = () => ({
        style: {},
        attrs: {},
        getAttribute(key) { return this.attrs[key] || null; },
        setAttribute(key, value) { this.attrs[key] = value; },
        removeAttribute(key) { delete this.attrs[key]; },
    });
    const landscape = host();
    syncEmbeddedHostFrame({ className: 'igs-mode-embedded', closest: () => landscape }, '1216x832');
    assert.equal(landscape.style.aspectRatio, '1216 / 832');
    assert.equal(landscape.getAttribute('data-igs-frame'), 'size');
    const portrait = host();
    syncEmbeddedHostFrame({ className: 'igs-mode-embedded', closest: () => portrait }, '832x1216');
    assert.equal(portrait.style.aspectRatio, '832 / 1216');
});

test('gate:igs-ui:embedded-host-mounts-beside-mes-text-and-restores', () => {
    const makeNode = (className = '') => {
        const node = {
            className,
            children: [],
            attributes: new Map(),
            style: { display: '' },
            parentNode: null,
            get classList() {
                const names = String(node.className || '').split(/\s+/).filter(Boolean);
                return {
                    contains: (name) => names.includes(name),
                    add: (name) => { node.className = String(node.className || '').split(/\s+/).filter(Boolean).concat(name).join(' '); },
                    remove: (name) => { node.className = String(node.className || '').split(/\s+/).filter(Boolean).filter((item) => item !== name).join(' '); },
                };
            },
            appendChild(child) {
                child.parentNode = node;
                node.children.push(child);
                return child;
            },
            insertBefore(child, reference) {
                const index = node.children.indexOf(reference);
                child.parentNode = node;
                if (index < 0) node.children.push(child);
                else node.children.splice(index, 0, child);
                return child;
            },
            setAttribute(name, value) { node.attributes.set(name, String(value)); },
            getAttribute(name) { return node.attributes.has(name) ? node.attributes.get(name) : null; },
            removeAttribute(name) { node.attributes.delete(name); },
            querySelector(selector) {
                return node.querySelectorAll(selector)[0] || null;
            },
            querySelectorAll(selector) {
                return selector === '.mes_text' ? node.children.filter((child) => child.className === '.mes_text'.slice(1)) : [];
            },
        };
        return node;
    };
    const parent = makeNode();
    const mesText = makeNode('mes_text');
    mesText.className = 'mes_text';
    mesText.style.display = '';
    const messageElement = makeNode();
    messageElement.appendChild(mesText);
    parent.appendChild(messageElement);

    const resolved = resolveEmbeddedHostParent(messageElement);
    assert.equal(resolved.parent, messageElement);
    assert.equal(resolved.mesText, mesText);

    const doc = { createElement: () => makeNode(), querySelector: () => null };
    const host = ensureEmbeddedHost(resolved.parent, doc, null);
    assert.ok(host);
    assert.equal(host.getAttribute('data-igs-embedded-host'), '1');
    assert.equal(host.getAttribute('data-igs-internal-reader'), '1');
    assert.equal(messageElement.children.indexOf(host), messageElement.children.indexOf(mesText) - 1);
    assert.equal(mesText.style.display, '');

    hideEmbeddedSourceText(mesText);
    assert.equal(mesText.style.display, 'none');
    restoreEmbeddedSourceText(mesText);
    assert.equal(mesText.style.display, '');
    assert.equal(mesText.getAttribute('aria-hidden'), null);
});

test('gate:igs-ui:embedded-edit-pencil-only-matches-mounted-floor', () => {
    const mesText = { id: 'mounted-text' };
    const otherText = { id: 'other-text' };
    const message = { closest: (sel) => (sel === '.mes' ? message : null), contains: (n) => n === mesText };
    const otherMessage = { closest: (sel) => (sel === '.mes' ? otherMessage : null), contains: (n) => n === otherText };
    const pencil = { closest: (sel) => (sel === '.mes_edit' ? pencil : sel === '.mes' ? message : null) };
    const icon = { closest: (sel) => (sel === '.mes_edit' ? pencil : null) };
    const otherPencil = { closest: (sel) => (sel === '.mes_edit' ? otherPencil : sel === '.mes' ? otherMessage : null) };
    const plain = { closest: () => null };
    assert.equal(isEmbeddedEditTrigger(pencil, mesText), true, '点挂载楼层的小铅笔');
    assert.equal(isEmbeddedEditTrigger(icon, mesText), true, '点铅笔内部图标同样命中');
    assert.equal(isEmbeddedEditTrigger(otherPencil, mesText), false, '其他楼层的铅笔不关阅读器');
    assert.equal(isEmbeddedEditTrigger(plain, mesText), false, '非铅笔点击不命中');
    assert.equal(isEmbeddedEditTrigger(null, mesText), false);
    assert.equal(isEmbeddedEditTrigger(pencil, null), false);
});

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

test('gate:igs-ui:story-span-is-first-sentence-through-last-sentence', () => {
    const raw = '<phone>界面</phone>\n<content>\n第一句正文。\n中间还有一句。\n最后一句正文。\n</content>\n<status>另一块界面</status>';
    const edges = storyEdgeLines(raw, 'content');
    assert.equal(edges.first, '第一句正文。');
    assert.equal(edges.last, '最后一句正文。');
    const rendered = '界面第一句正文。中间还有一句。最后一句正文。另一块界面';
    const span = findStorySpan(rendered, edges.first, edges.last);
    assert.equal(rendered.slice(span.start, span.end), '第一句正文。中间还有一句。最后一句正文。');
    assert.equal(rendered.slice(0, span.start), '界面');
    assert.equal(rendered.slice(span.end), '另一块界面');
});

test('gate:igs-ui:story-span-skips-a-last-line-missing-on-the-page', () => {
    const raw = '<content>\n[igs-scene:星见占星馆内室|傍晚|晴天|NSFW]\n第一句正文。\n最后一句正文。\n[igs-img:3]\n</content>';
    const lines = storyLines(raw, 'content');
    const rendered = '界面[igs-scene:星见占星馆内室|傍晚|晴天|NSFW]第一句正文。最后一句正文。另一块界面';
    const span = findStorySpan(rendered, lines);
    assert.equal(rendered.slice(span.start, span.end), '[igs-scene:星见占星馆内室|傍晚|晴天|NSFW]第一句正文。最后一句正文。');
    assert.equal(rendered.slice(0, span.start), '界面');
    assert.equal(rendered.slice(span.end), '另一块界面');
});

test('gate:igs-ui:blank-shells-collapse-and-regex-ui-stays', () => {
    const make = (className, text) => ({
        className,
        textContent: text,
        nodeType: 1,
        children: [],
        attributes: new Map(),
        style: { display: '' },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        querySelector() { return null; },
    });
    const mesText = make('', '');
    const empty = make('', '');
    const ui = make('TH-render', '');
    mesText.children = [empty, ui];
    mesText.querySelectorAll = (selector) => (
        selector === '[data-igs-blank-shell="1"]' ? mesText.children.filter((node) => node.getAttribute('data-igs-blank-shell') === '1') : []
    );
    collapseBlankShells(mesText);
    assert.equal(empty.style.display, 'none');
    assert.equal(ui.style.display, '');
    restoreBlankShells(mesText);
    assert.equal(empty.style.display, '');
    assert.equal(empty.getAttribute('data-igs-blank-shell'), null);
});

test('gate:igs-ui:story-hide-is-gone-after-the-message-is-redrawn', () => {
    const hidden = { getAttribute: (name) => (name === 'data-igs-story-hidden' ? '1' : null) };
    assert.equal(isStoryHidden({ querySelector: (selector) => (selector === '[data-igs-story-hidden="1"]' ? hidden : null) }), true);
    assert.equal(isStoryHidden({ querySelector: () => null }), false);
});

test('gate:igs-ui:embedded-chat-observer-only-starts-when-asked', () => {
    const created = [];
    const globalObject = {
        setTimeout: () => 1,
        clearTimeout: () => {},
        MutationObserver: class {
            constructor(handler) { this.handler = handler; created.push(this); }
            observe() { this.observed = true; }
            disconnect() { this.disconnected = true; }
        },
    };
    const document = { querySelector: () => ({}) };
    const observer = createChatStreamObserver({ global: globalObject, document, onStable: () => {} });
    assert.equal(observer.isActive(), false);
    const started = observer.start();
    assert.equal(started.ok, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].observed, true);
    observer.stop();
    assert.equal(observer.isActive(), false);
    assert.equal(created[0].disconnected, true);
});

test('gate:igs-ui:embedded-chat-observer-uses-generation-end-and-ignores-late-dom-noise', async () => {
    const timers = new Map();
    const listeners = new Map();
    const created = [];
    let timerId = 0;
    const eventSource = {
        on(name, handler) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(handler);
        },
        off(name, handler) {
            listeners.set(name, (listeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name) {
            for (const handler of listeners.get(name) || []) handler();
        },
    };
    const globalObject = {
        setTimeout(handler, delay) {
            timerId += 1;
            timers.set(timerId, { handler, delay });
            return timerId;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        MutationObserver: class {
            constructor(handler) { this.handler = handler; created.push(this); }
            observe() { this.observed = true; }
            disconnect() { this.disconnected = true; }
        },
    };
    const document = { querySelector: () => ({}), defaultView: globalObject };
    let activityCount = 0;
    let stableCount = 0;
    const observer = createChatStreamObserver({
        global: globalObject,
        document,
        eventSource,
        eventTypes: {
            GENERATION_STARTED: 'generation_started',
            GENERATION_ENDED: 'generation_ended',
            GENERATION_STOPPED: 'generation_stopped',
        },
        onActivity: () => { activityCount += 1; },
        onStable: () => { stableCount += 1; return true; },
    });

    const started = observer.start();
    assert.equal(started.lifecycle, true);
    eventSource.emit('generation_started');
    assert.equal(activityCount, 0);
    created[0].handler([{ target: {} }]);
    assert.equal(activityCount, 1);
    assert.equal(stableCount, 0);

    eventSource.emit('generation_ended');
    eventSource.emit('generation_started');
    const stableTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 800);
    assert.ok(stableTimer);
    timers.delete(stableTimer[0]);
    stableTimer[1].handler();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(stableCount, 1);

    eventSource.emit('generation_ended');
    created[0].handler([{ target: {} }]);
    assert.equal(activityCount, 1);
    assert.equal(stableCount, 1);
    observer.stop();
    assert.equal(created[0].disconnected, true);
});

test('gate:igs-ui:embedded-chat-observer-ignores-quiet-and-dry-run-generations', async () => {
    const timers = new Map();
    const listeners = new Map();
    const created = [];
    let timerId = 0;
    const eventSource = {
        on(name, handler) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(handler);
        },
        off(name, handler) {
            listeners.set(name, (listeners.get(name) || []).filter((item) => item !== handler));
        },
        emit(name, ...args) {
            for (const handler of listeners.get(name) || []) handler(...args);
        },
    };
    const globalObject = {
        setTimeout(handler, delay) {
            timerId += 1;
            timers.set(timerId, { handler, delay });
            return timerId;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        MutationObserver: class {
            constructor(handler) { this.handler = handler; created.push(this); }
            observe() {}
            disconnect() {}
        },
    };
    let activityCount = 0;
    let stableCount = 0;
    const observer = createChatStreamObserver({
        global: globalObject,
        document: { querySelector: () => ({}), defaultView: globalObject },
        eventSource,
        eventTypes: { GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended' },
        onActivity: () => { activityCount += 1; },
        onStable: () => { stableCount += 1; return true; },
    });
    observer.start();

    eventSource.emit('generation_started', 'normal', {}, true);
    created[0].handler([{ target: {} }]);
    eventSource.emit('generation_started', 'quiet', { quiet_prompt: 'plugin' }, false);
    created[0].handler([{ target: {} }]);
    assert.equal(activityCount, 0);
    assert.equal(timers.size, 0);

    eventSource.emit('generation_started', 'normal', {}, false);
    created[0].handler([{ target: {} }]);
    assert.equal(activityCount, 1);
    const idleTimer = Array.from(timers.entries()).find(([, timer]) => timer.delay === 10000);
    assert.ok(idleTimer);
    timers.delete(idleTimer[0]);
    idleTimer[1].handler();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(stableCount, 1);
    observer.stop();
});

const appRoot = path.resolve(import.meta.dirname, '..');

test('gate:host:input-channel rejects empty text and sends valid text', async () => {
    const sent = [];
    const channel = createInputChannel({
        typeAndSend: async (text) => {
            sent.push(text);
            return { ok: true };
        },
    });

    assert.equal((await channel.typeAndSend('')).ok, false);
    assert.deepEqual(await channel.typeAndSend('继续'), { ok: true });
    assert.deepEqual(sent, ['继续']);
});

test('gate:scene:parses tags and resolves background and character rules', () => {
    const textScene = parseSceneText('[角色: 艾莉]\n[情绪: 微笑]\n[时间: 夜晚]\n[天气: 雨]\n[地点: 图书馆]\n我们到了。', { messageId: 1 });
    const scene = resolveScene({
        textScene,
        backgroundRules: [
            { id: 'bg.library', priority: 10, match: { location: ['图书馆'], time: ['夜晚'], weather: ['雨'] } },
        ],
        characterRules: [
            { id: 'char.eli.smile', character: '艾莉', emotion: '微笑' },
        ],
    });

    assert.equal(scene.messageId, 1);
    assert.equal(scene.speaker, '艾莉');
    assert.equal(scene.background.id, 'bg.library');
    assert.equal(scene.character.id, 'char.eli.smile');
});

test('gate:presets:registry-registers-and-lists-text-presets', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const registry = createPresetRegistry();
    const result = registry.importBundle(bundle);

    assert.equal(result.ok, true);
    assert.equal(result.accepted.length, 3);
    assert.equal(registry.list('text-filter-preset').length, 1);
    assert.equal(registry.list('text-format-preset').length, 1);
    assert.equal(registry.list('scene-regex-preset').length, 1);
    assert.equal(registry.get('text-format-preset', 'preset.text-format.bubble-line').name, 'Bubble 转对话行');
});

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

test('gate:presets:bad-preset-does-not-overwrite-current', () => {
    const bundle = readJson('fixtures/presets/text-presets-import-bundle.json');
    const badBundle = readJson('fixtures/presets/bad-current-overwrite-bundle.json');
    const registry = createPresetRegistry();

    registry.importBundle(bundle);
    registry.setCurrent('text-format-preset', 'preset.text-format.bubble-line');
    const before = registry.getCurrent('text-format-preset');
    const result = registry.importBundle(badBundle);
    const after = registry.getCurrent('text-format-preset');

    assert.equal(result.ok, false);
    assert.equal(result.rejected.length, 1);
    assert.equal(before.id, after.id);
    assert.equal(after.data.pattern, '@bubble:([^|\\n]+)\\|([^|\\n]+)\\|([^\\n]+)');
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

test('gate:scene:text-filter-preset:extracts-content', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const scene = parseSceneText(message.text, {
        messageId: message.id,
        textFilterPreset,
    });

    assert.equal(scene.messageId, 12);
    assert.equal(scene.text.includes('不要进入正文'), false);
    assert.equal(scene.text.includes('prompt://ignore-me'), false);
    assert.equal(scene.text.includes('@bubble:玉子|开心|你好，欢迎来到图书馆。'), true);
    assert.equal(scene.sourceKind, 'tagged-content');
    assert.deepEqual(scene.textPipelineErrors, []);
});

test('gate:scene:text-filter-preset:extracts-content-with-attributes', () => {
    // 真机回归：content 带属性（<content data-igs-formatted="1">）时，
    // 此前 text-pipeline 正则不容忍属性 → 匹配失败 → 兜底吐出含思考草稿的全文。
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const raw = [
        '<!-- begin_of_Subtext_think -->',
        'Atri: 大段思考草稿，不应进入正文。',
        '<!-- end_of_Subtext_think -->',
        '</thinking>',
        '### 正文',
        '<now_plot>',
        '<content data-igs-formatted="1">',
        '[igs-scene:白府偏房|早晨|晴天]',
        '正文第一句。',
        '正文第二句。',
        '</content>',
        '</now_plot>',
    ].join('\n');
    const scene = parseSceneText(raw, { messageId: 1, textFilterPreset });

    assert.equal(scene.sourceKind, 'tagged-content');
    assert.equal(scene.text.includes('大段思考草稿'), false);
    assert.equal(scene.text.includes('</thinking>'), false);
    assert.equal(scene.text.includes('### 正文'), false);
    assert.equal(scene.text.includes('now_plot'), false);
    assert.equal(scene.text.includes('正文第一句。'), true);
    assert.equal(scene.text.includes('正文第二句。'), true);
});

test('gate:scene:text-format-preset:applies-replacement', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const textFormatPreset = readJson('fixtures/text/text-format-preset.json');
    const pipeline = runTextPipeline(message.text, {
        textFilterPreset,
        textFormatPreset,
    });

    assert.equal(pipeline.ok, true);
    assert.match(pipeline.formattedText, /玉子（开心）：你好，欢迎来到图书馆。/);
    assert.equal(pipeline.formatSourceKind, 'regex-replace');
});

test('gate:scene:scene-regex-preset:extracts-fields', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const textFormatPreset = readJson('fixtures/text/text-format-preset.json');
    const sceneRegexPreset = readJson('fixtures/text/scene-regex-preset.json');
    const pipeline = runTextPipeline(message.text, {
        textFilterPreset,
        textFormatPreset,
        sceneRegexPreset,
    });

    assert.equal(pipeline.ok, true);
    assert.equal(pipeline.scenePatch.location, '图书馆');
    assert.equal(pipeline.scenePatch.time, '夜晚');
    assert.equal(pipeline.scenePatch.weather, '雨');
    assert.equal(pipeline.scenePatch.speaker, '玉子');
    assert.equal(pipeline.scenePatch.emotion, '开心');
});

test('gate:scene:text-pipeline:bad-regex-does-not-throw', () => {
    const message = readJson('fixtures/text/tagged-content-message.json');
    const textFilterPreset = readJson('fixtures/text/text-filter-preset.json');
    const badTextFormatPreset = readJson('fixtures/text/bad-text-format-preset.json');

    const scene = parseSceneText(message.text, {
        messageId: message.id,
        textFilterPreset,
        textFormatPreset: badTextFormatPreset,
    });

    assert.equal(scene.messageId, 12);
    assert.match(scene.text, /@bubble:玉子\|开心\|你好，欢迎来到图书馆。/);
    assert.equal(scene.textPipelineErrors.length > 0, true);
    assert.equal(scene.textPipelineErrors[0].presetType, 'text-format-preset');
});

test('gate:scene:igs-message-source:extracts-readable-text-from-host-ui-html', () => {
    const message = readJson('fixtures/tavern/host-ui-leak-message.json');
    const payload = buildIgsTextPayload(message);

    assert.equal(payload.formattedText.includes('API Connections'), false);
    assert.equal(payload.formattedText.includes('rightNavHolder'), false);
    assert.equal(payload.formattedText.includes('<div'), false);
    assert.equal(payload.formattedText.includes('<button'), false);
    assert.match(payload.formattedText, /玉子: 今晚我们先从这里开始。/);
    assert.equal(payload.usedFallback, true);
});

test('gate:scene:igs-message-source:excludes-adjacent-tagged-text', () => {
    const payload = buildIgsTextPayload({
        text: '<content>第一句。<THINKING data-role="hidden">不能显示</THINKING>第二句。</content>',
    }, { sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' } });

    assert.equal(payload.formattedText, '第一句。第二句。');
    assert.equal(payload.textSegments.join(''), '第一句。第二句。');
});

test('gate:scene:igs-message-source:excludes-parent-before-including-nested-content', () => {
    const payload = buildIgsTextPayload({
        text: '<thinking><content>绝不能从排除块中取正文。</content></thinking><content>保留正文。</content>',
    }, { sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' } });

    assert.equal(payload.formattedText, '保留正文。');
    assert.equal(payload.textSegments.join(''), '保留正文。');
});

test('gate:scene:igs-message-source:filters-visible-tag-when-raw-has-no-excluded-block', () => {
    const payload = buildIgsTextPayload({ text: '<content>保留正文。</content>', visibleText: '保留正文。<thinking>不要显示</thinking>' }, {
        sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' },
    });
    assert.equal(payload.formattedText, '保留正文。');
    assert.equal(payload.textSegments.join(''), '保留正文。');
});

test('gate:scene:igs-message-source:does-not-resurrect-excluded-only-content', () => {
    const payload = buildIgsTextPayload({
        text: '<content><thinking>不能显示</thinking></content>',
        visibleText: '不能显示',
    }, { sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' } });

    assert.equal(payload.formattedText, '');
    assert.deepEqual(payload.textSegments, []);
});

test('gate:scene:igs-message-source:empty-included-block-does-not-fall-back-to-outside-text', () => {
    const payload = buildIgsTextPayload({
        text: '<content><thinking>不能显示</thinking></content>标签之外也不是正文',
        visibleText: '不能显示标签之外也不是正文',
    }, { sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' } });

    assert.equal(payload.formattedText, '');
    assert.deepEqual(payload.textSegments, []);
    assert.equal(payload.usedDomOverride, false);
});

test('gate:scene:igs-message-source:excluded-content-cannot-return-via-dom-or-untagged-fallback', () => {
    const body = '这是一段完整且正常的正文，应该始终保留在阅读器中。';
    const raw = `${body}<thinking>不能显示</thinking>结尾。`;
    const filter = { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' };
    const withDom = buildIgsTextPayload({ text: `<content>${raw}</content>`, visibleText: `${body}不能显示结尾。` }, { sourceFilter: filter });
    const untagged = buildIgsTextPayload({ text: raw, visibleText: `${body}不能显示结尾。` }, { sourceFilter: filter });

    for (const payload of [withDom, untagged]) {
        assert.equal(payload.formattedText.includes('不能显示'), false);
        assert.equal(payload.textSegments.join('').includes('不能显示'), false);
        assert.equal(payload.usedDomOverride, false);
        assert.match(payload.formattedText, /结尾。/);
    }
});

test('gate:igs-ui:excluded-yuan-with-invisible-boundaries-does-not-add-pages', () => {
    const raw = '\u2063\u2062\u2063[igs-scene:李家主宅卧室|早晨|晴]醒来。\n\u2063\u2064\u2063\u2060\n'
        + '<yuan>\u2063\u200c[igs-thought:哪吒|怪訝|*日本語*]日本語。</yuan>\n'
        + '\u2063\u200c\u2063\u2061\u2063\u2062\u2063\n[igs-thought:哪吒|纳闷|*怎么回事？*]又醒了。';
    const sourceFilter = { ...DEFAULT_SOURCE_FILTER, textIncludeTags: '', textExcludeTags: 'yuan' };
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            bridge: { openMode: 'pc', sourceFilter, sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerMode: 'pc', readerSettings: {},
        }),
    });
    const opened = host.openReader({ message: { text: raw }, sourceFilter }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const segments = opened.snapshot.content.segments;
    assert.deepEqual(segments, ['醒来。', '**怎么回事？**', '又醒了。']);
    assert.equal(segments.some((segment) => segment.includes('日本語') || segment.includes('yuan')), false);
    assert.equal(segments.some((segment) => /[\u2060-\u2064]/.test(segment)), false);
    assert.equal(segments[0], '醒来。');
    assert.equal(segments[2], '又醒了。');
    host.destroy();
});

test('gate:igs-ui:excluded-yuan-with-default-include-and-untagged-source-keeps-readable-pages', () => {
    const raw = '\u2063\u2062\u2063[igs-scene:李家主宅卧室|早晨|晴]醒来。'
        + '\u2063\u2064\u2063\u2060<yuan>[igs-thought:哪吒|怪訝|日本語]日本語。</yuan>'
        + '\u2063\u200c\u2063\u2061\u2063\u2062\u2063[igs-thought:哪吒|纳闷|怎么回事？]继续。';
    const sourceFilter = { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'yuan' };
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            bridge: { openMode: 'pc', sourceFilter, sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerMode: 'pc', readerSettings: {},
        }),
    });
    const opened = host.openReader({ message: { text: raw }, sourceFilter }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const segments = opened.snapshot.content.segments;
    assert.equal(segments.length > 0, true);
    assert.equal(segments.join('').includes('醒来。'), true);
    assert.equal(segments.join('').includes('继续。'), true);
    assert.equal(segments.join('').includes('日本語'), false);
    assert.equal(segments.every((segment) => /[^\s\u200B-\u200D\u2060-\u2064]/u.test(segment)), true);
    assert.equal(segments.join('').includes('李家主宅卧室|早晨|晴]'), false);
    host.destroy();
});

test('gate:igs-ui:excluded-yuan-inline-formatting-controls-do-not-create-blank-pages', () => {
    const raw = '<content>\u2063\u2062\u2063[igs-scene:李家主宅卧室|早晨|晴]醒来。'
        + '\u2063\u2064\u2063\u2060<yuan>\u2063[igs-thought:哪吒|怪訝|*日本語*]日本語。</yuan>'
        + '\u2063\u200c\u2063\u2061\u2063\u2062\u2063[igs-thought:哪吒|纳闷|*怎么回事？*]又醒了。</content>';
    const sourceFilter = { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'yuan' };
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            bridge: { openMode: 'pc', sourceFilter, sceneAssets: { enabled: true, scenes: {}, characters: {} }, sentencePaging: true },
            readerMode: 'pc', readerSettings: {},
        }),
    });
    const opened = host.openReader({ message: { text: raw }, sourceFilter }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const segments = opened.snapshot.content.segments;
    assert.equal(segments.length, 2);
    assert.equal(segments.join('').includes('日本語'), false);
    assert.equal(segments.join('').includes('李家主宅卧室|早晨|晴]'), false);
    assert.equal(segments.every((segment) => /[^\s\u200B-\u200D\u2060-\u2064]/u.test(segment)), true);
    assert.equal(segments.join('').includes('醒来。'), true);
    assert.equal(segments.join('').includes('又醒了。'), true);
    host.destroy();
});

test('gate:igs-ui:excluded-yuan-leaves-only-invisible-text-without-reader-page', () => {
    const host = createIgsReaderHost({ global: {} });
    const result = host.openReader({
        message: { text: '<content>\u2063\u2064<yuan>日本語。</yuan>\u2060\u2061\u200c</content>' },
        sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'yuan' },
    }, { mode: 'pc' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-readable-text');
    assert.equal(host.getState().activeReader, null);
    host.destroy();
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

test('gate:igs-ui:saving-exclusion-filter-reparses-open-reader', () => {
    const bridge = { sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: '' } };
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({ bridge, readerMode: 'pc', readerSettings: {} }),
        saveUnifiedSettings: (settings) => {
            bridge.sourceFilter = settings.bridge.sourceFilter;
            return { ok: true };
        },
    });
    const opened = host.openReader({
        message: { text: '<content>保留正文。<thinking>不能显示</thinking></content>' },
        sourceFilter: bridge.sourceFilter,
        textSegments: ['保留正文。', '不能显示'],
        formattedText: '保留正文。不能显示',
    }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    assert.equal(opened.snapshot.content.segments.some((segment) => segment.includes('不能显示')), true);

    const settings = host.openSettings({ tab: 'regex' });
    assert.equal(settings.ok, true);
    assert.equal(settings.controller.setValue('bridge.sourceFilter.textExcludeTags', 'thinking').ok, true);
    assert.equal(host.getState().activeReader.snapshot.content.segments.some((segment) => segment.includes('不能显示')), true);
    assert.equal(settings.controller.close().ok, true);
    const refreshed = host.getState().activeReader.snapshot.content;
    assert.equal(refreshed.segments.some((segment) => segment.includes('不能显示')), false);
    assert.equal(refreshed.displayText.includes('不能显示'), false);
    assert.equal(refreshed.segments.join(''), '保留正文。');
    host.destroy();
});

test('gate:igs-ui:saving-exclusion-filter-closes-reader-with-no-readable-text', () => {
    const bridge = { sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: '' } };
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({ bridge, readerMode: 'pc', readerSettings: {} }),
        saveUnifiedSettings: (settings) => {
            bridge.sourceFilter = settings.bridge.sourceFilter;
            return { ok: true };
        },
    });
    const opened = host.openReader({
        message: { text: '<content><thinking>不能显示</thinking></content>' },
        sourceFilter: bridge.sourceFilter,
    }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const settings = host.openSettings({ tab: 'regex' });
    assert.equal(settings.controller.setValue('bridge.sourceFilter.textExcludeTags', 'thinking').ok, true);
    assert.notEqual(host.getState().activeReader, null);
    assert.equal(settings.controller.close().ok, true);
    assert.equal(host.getState().activeReader, null);
    assert.equal(host.getState().activeSettings, null);
    host.destroy();
});

test('gate:igs-ui:replace-reader-rejects-excluded-only-source-without-blank-page', () => {
    const host = createIgsReaderHost({ global: {} });
    const opened = host.openReader({ message: { text: '<content>保留正文。</content>' } }, { mode: 'pc' });
    assert.equal(opened.ok, true);
    const replaced = host.replaceReader({
        message: { text: '<content><thinking>不能显示</thinking></content>' },
        sourceFilter: { ...DEFAULT_SOURCE_FILTER, textExcludeTags: 'thinking' },
    }, { mode: 'pc' });
    assert.equal(replaced.ok, false);
    assert.equal(replaced.reason, 'no-readable-text');
    assert.equal(host.getState().activeReader.snapshot.content.segments.join(''), '保留正文。');
    host.destroy();
});

test('gate:scene:igs-message-source:prefers-dom-text-when-keyword-filter-rewrites-word', () => {
    const dataLayer = '<content>这一步迈出去，好像就真的踏进了那个名为“自相残杀”的怪圈里。</content>';
    const domVisible = '这一步迈出去，好像就真的踏进了那个名为“互相杀”的怪圈里。';
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible });

    assert.equal(payload.usedDomOverride, true);
    assert.match(payload.formattedText, /互相杀/);
    assert.equal(payload.formattedText.includes('自相残杀'), false);
});

test('gate:scene:igs-message-source:keeps-data-text-when-dom-is-different-content', () => {
    const dataLayer = '<content>玉子站在门口，犹豫着要不要敲门。</content>';
    const domVisible = '完全不相干的另一段文字，长度也明显不同，理应判定为不同内容而保留原文。';
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible });

    assert.equal(Boolean(payload.usedDomOverride), false);
    assert.match(payload.formattedText, /犹豫着要不要敲门/);
});

test('gate:scene:igs-message-source:keeps-data-directives-when-dom-strips-igs-tags', () => {
    // 守卫场景：若宿主真的把 [igs-*:] 标签从渲染层清洗掉（DOM 无标签），即便长度量级接近，
    // 也不能用 DOM 覆盖，否则全部对白/心理话标签丢失。此时回落数据层 strict 解析。
    const dataLayer = [
        '<content>',
        '[igs-scene:厢房|早晨|晴天]',
        '他烦躁地拨弄着头发。',
        '[igs-thought:哪吒|烦躁|什么破头发，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
        '</content>',
    ].join('\n');
    const domVisible = '他烦躁地拨弄着头发。\n什么破头发，剪了算了。\n吒儿姐姐，起了么？';
    const sceneAssets = {
        enabled: true,
        promptRule: 'r',
        characters: { 哪吒: { 烦躁: 'u' }, 白墨: { 玩味: 'u' } },
    };
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, { sceneAssets });

    assert.equal(Boolean(payload.usedDomOverride), false);
    assert.notEqual(payload.sourceKind, 'dom-visible-override');
    assert.match(payload.formattedText, /\*什么破头发，剪了算了。\*/);
    assert.match(payload.formattedText, /\[白墨\]：吒儿姐姐，起了么？/);
    const thoughts = payload.sceneDirectives.filter((d) => d.type === 'thought');
    const chars = payload.sceneDirectives.filter((d) => d.type === 'char');
    assert.equal(thoughts.length, 1);
    assert.equal(chars.length, 1);
});

test('gate:scene:igs-message-source:dom-override-applies-veridis-replacements-when-host-strips-igs-tags', () => {
    // Veridis 真机场景：宿主把 [igs-*:] 从 DOM 清洗掉 + Veridis 替换了正文词。
    // 修复前：domClobbersDirectiveTags=true 阻断整个 DOM override，阅读器显示原词。
    // 修复后：文本覆盖照常生效（Veridis 替换词进阅读器），指令从数据层提取（不丢失）。
    const dataLayer = [
        '<content>',
        '[igs-scene:厢房|早晨|晴天]',
        '他烦躁地拨弄着头发。',
        '[igs-thought:哪吒|烦躁|什么破头发，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
        '</content>',
    ].join('\n');
    // 宿主清洗了 [igs-*:] 标签，Veridis 把"头发"替换成了"鬓发"
    const domVisible = '他烦躁地拨弄着鬓发。\n什么破鬓发，剪了算了。\n吒儿姐姐，起了么？';
    const sceneAssets = {
        enabled: true,
        promptRule: 'r',
        characters: { 哪吒: { 烦躁: 'u' }, 白墨: { 玩味: 'u' } },
    };
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, { sceneAssets });

    assert.equal(payload.usedDomOverride, true);
    assert.match(payload.formattedText, /鬓发/);
    assert.equal(payload.formattedText.includes('头发'), false);
    // 指令从数据层提取，不丢失
    const thoughts = payload.sceneDirectives.filter((d) => d.type === 'thought');
    const chars = payload.sceneDirectives.filter((d) => d.type === 'char');
    assert.equal(thoughts.length, 1);
    assert.equal(chars.length, 1);
});

test('gate:scene:igs-message-source:dom-override-formats-igs-tags-into-bubbles', () => {
    // 真机场景：宿主 DOM .mes_text 仍保留原始 [igs-char/thought:] 标签，且与数据层有词级差异
    // 触发 DOM override。override 必须对 DOM 文本跑正文格式化，把标签转成 [名]：… 与 *…*，
    // 否则阅读器把整段当旁白、角色名/分割线/标签心理话全部丢失。
    const dataLayer = [
        '<content>',
        '[igs-thought:哪吒|烦躁|什么破头发，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
        '</content>',
    ].join('\n');
    // DOM 文本含原始标签，但某个词被关键词插件改过（破头发→破头毛），构成词级差异。
    const domVisible = [
        '[igs-thought:哪吒|烦躁|什么破头毛，剪了算了。]',
        '[igs-char:白墨|玩味|吒儿姐姐，起了么？]',
    ].join('\n');
    const sceneAssets = {
        enabled: true,
        promptRule: 'r',
        characters: { 哪吒: { 烦躁: 'u' }, 白墨: { 玩味: 'u' } },
    };
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, { sceneAssets });

    assert.equal(payload.usedDomOverride, true);
    // DOM 文本里的标签被格式化成气泡/心理话形态，而非保留原始 [igs-*:] 标签。
    assert.match(payload.formattedText, /\*什么破头毛，剪了算了。\*/);
    assert.match(payload.formattedText, /\[白墨\]：吒儿姐姐，起了么？/);
    assert.equal(payload.formattedText.includes('[igs-thought:'), false);
    assert.equal(payload.formattedText.includes('[igs-char:'), false);
});

test('gate:scene:igs-message-source:still-overrides-dom-when-both-sides-have-igs-tags', () => {
    // 数据层和 DOM 都含 igs 标签（插件只改了标签内的词），守卫不触发，DOM override 照常生效。
    const dataLayer = '<content>[igs-char:哪吒|平静|这一步迈进了自相残杀的怪圈。]</content>';
    const domVisible = '[igs-char:哪吒|平静|这一步迈进了互相杀的怪圈。]';
    const payload = buildIgsTextPayload({ text: dataLayer, visibleText: domVisible }, {
        sceneAssets: { enabled: true, promptRule: 'r', characters: { 哪吒: { 平静: 'u' } } },
    });

    assert.equal(payload.usedDomOverride, true);
    assert.match(payload.formattedText, /互相杀/);
    assert.equal(payload.formattedText.includes('自相残杀'), false);
    // 标签被格式化为对白气泡，不残留原始 igs 标签。
    assert.match(payload.formattedText, /\[哪吒\]：/);
    assert.equal(payload.formattedText.includes('[igs-char:'), false);
});

test('gate:scene:igs-message-source:reader-segments-skip-scene-tags', () => {
    const payload = buildIgsTextPayload({
        text: '[角色: 艾莉]\n艾莉: 第一句。 第二句。',
    });

    assert.deepEqual(payload.textSegments, ['第一句。 第二句。']);
    assert.deepEqual(payload.segmentImageSlots, []);
});

test('gate:scene:image-slots:parses-image-tags-in-order', () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const slots = parseImageSlots(source, source, DEFAULT_SOURCE_FILTER);

    assert.equal(slots.length, 6);
    assert.deepEqual(slots.map((slot) => slot.title), [
        '望月的抗拒背影',
        '海斗的冷静观察',
        '望月的不甘与动摇',
        '致命的诱惑：海斗的笔记',
        '海斗的离去与望月的注视',
        '海斗的笔记本与指尖',
    ]);
    assert.deepEqual(slots.map((slot) => slot.promptText), [
        'image###slot-1###',
        'image###slot-2###',
        'image###slot-3###',
        'image###slot-4###',
        'image###slot-5###',
        'image###slot-6###',
    ]);
});

test('gate:scene:image-slots:maps-reader-segments-to-slot-indexes', () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const mapped = buildSegmentImageMap(source, payload.textSegments, payload.imageSlots);

    assert.deepEqual(payload.textSegments, ['第一段正文。', '第二段正文。', '第三段正文。']);
    assert.deepEqual(mapped, [0, 1, 2]);
    assert.deepEqual(payload.segmentImageSlots, [0, 1, 2]);
});

test('gate:scene:sentence-paging-splits-all-body-by-period-when-scene-assets-off', () => {
    const source = '今天天气很好。我们一起去图书馆。她笑了。';
    const off = buildIgsTextPayload({ text: source });
    const on = buildIgsTextPayload({ text: source }, { sentencePaging: true });

    assert.equal(off.textSegments.length, 1);
    assert.deepEqual(on.textSegments, ['今天天气很好。', '我们一起去图书馆。', '她笑了。']);
});

test('gate:scene:sentence-paging-only-splits-narration-when-scene-assets-on', () => {
    const source = '旁白第一句。旁白第二句。\n[玉子]：你好呀。请坐。';
    const payload = buildIgsTextPayload({ text: source }, {
        sentencePaging: true,
        sceneAssets: { enabled: true },
    });

    assert.deepEqual(payload.textSegments, ['旁白第一句。', '旁白第二句。', '[玉子]：你好呀。请坐。']);
});

test('gate:igs-ui:apply-align-style-maps-left-center-indent', () => {
    const makeEl = () => ({ style: {} });
    const left = makeEl();
    applyAlignStyle(left, 'left');
    assert.equal(left.style.textAlign, 'left');
    assert.equal(left.style.textIndent, '');

    const center = makeEl();
    applyAlignStyle(center, 'center');
    assert.equal(center.style.textAlign, 'center');
    assert.equal(center.style.textIndent, '');

    const indent = makeEl();
    applyAlignStyle(indent, 'indent');
    assert.equal(indent.style.textAlign, 'left');
    assert.equal(indent.style.textIndent, '2em');
});

test('gate:igs-ui:dialog-font-merge-keeps-inline-thought-font-from-theme', () => {
    const theme = { thoughtFont: '"KaiTi",serif', thoughtColor: '#c8c8dc' };
    const previous = renderDialogueHtml('hello *think*', theme, true);
    assert.match(previous, /font-family:'KaiTi',serif/);
    const merged = renderDialogueHtml('hello *think*', theme, true);
    assert.match(merged, /font-family:'KaiTi',serif/);
    assert.match(merged, /color:#c8c8dc/);
    assert.match(merged, /hello <span class="igs-thought"/);
});

test('gate:igs-ui:resolve-active-theme-exposes-align-fields', () => {
    const genshin = resolveActiveTheme({ readerSettings: { _vnTheme: { preset: 'genshin' } } });
    assert.equal(genshin.nameAlign, 'center');
    assert.equal(genshin.textAlign, 'left');
    assert.equal(genshin.narrationAlign, 'left');
    assert.equal(genshin.thoughtAlign, 'left');

    const custom = resolveActiveTheme({ readerSettings: { _vnTheme: { preset: 'custom', textAlign: 'indent', thoughtAlign: 'center' } } });
    assert.equal(custom.textAlign, 'indent');
    assert.equal(custom.thoughtAlign, 'center');
    assert.equal(custom.narrationAlign, 'left');
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

test('gate:scene:igs-message-source:formats-default-bubble-body', () => {
    const payload = buildIgsTextPayload({
        text: '<content>[igs-char:玉子|开心|欢迎来到图书馆。]</content>',
    }, {
        virtualRegex: DEFAULT_VIRTUAL_REGEX,
    });

    assert.equal(payload.formattedText, '[玉子]：欢迎来到图书馆。');
    assert.equal(payload.virtualRegexChanged, true);
});

test('gate:scene:igs-message-source:splits-narration-after-directive-close', () => {
    // 回归：[igs-char] 与旁白写在同一段时，旁白曾被粘进台词一起渲染成气泡。
    // 契约：必须以指令闭合 "]" 为分界，旁白独立成段，不得并进对话正文。
    const payload = buildIgsTextPayload({
        text: '<content>[igs-char:爱丽丝|平和|你好]她转身看向窗外。</content>',
    }, {
        virtualRegex: DEFAULT_VIRTUAL_REGEX,
    });

    assert.equal(payload.formattedText, '[爱丽丝]：你好\n她转身看向窗外。');
    const segments = buildNarrativeSegments(payload.formattedText);
    assert.deepEqual(segments, ['[爱丽丝]：你好', '她转身看向窗外。']);
    // 旁白段不得被识别为对话行（否则仍会被当台词渲染）。
    assert.equal(/^\[[^\]]+\]\s*[:：]/.test(segments[1]), false);
});

test('gate:scene:igs-message-source:thought-and-scene-alias-boundaries', () => {
    // 心理标签同段旁白：旁白必须独立；*…* 行仍按心理话处理。
    const thought = buildIgsTextPayload({
        text: '<content>[igs-thought:爱丽丝|平和|真麻烦]她叹了口气。</content>',
    }, { virtualRegex: DEFAULT_VIRTUAL_REGEX });
    assert.deepEqual(
        buildNarrativeSegments(thought.formattedText),
        ['*真麻烦*', '她叹了口气。'],
    );

    // 场景指令同段旁白：指令保留为独立行，不再吞掉后面的旁白。
    const scene = buildIgsTextPayload({
        text: '<content>[igs-scene:古城|下午|晴天]阳光很好。</content>',
    }, { virtualRegex: DEFAULT_VIRTUAL_REGEX });
    assert.deepEqual(
        buildNarrativeSegments(scene.formattedText),
        ['[igs-scene:古城|下午|晴天]', '阳光很好。'],
    );

    // 非 igs 方括号文本不得被改写。
    const plain = buildIgsTextPayload({
        text: '<content>[普通标题]正文。</content>',
    }, { virtualRegex: DEFAULT_VIRTUAL_REGEX });
    assert.equal(plain.formattedText, '[普通标题]正文。');
});


test('gate:host:prompt-injector-registers-scene-rule-as-in-chat-extension-prompt', () => {
    const extensionPrompts = {};
    const calls = [];
    const globalObject = {
        TavernHelper: {
            injectPrompts() {
                throw new Error('TavernHelper fallback should not be used when SillyTavern context exists');
            },
        },
        SillyTavern: {
            getContext() {
                return {
                    extensionPrompts,
                    setExtensionPrompt(key, value, position, depth, scan, role) {
                        calls.push({ key, value, position, depth, scan, role });
                        extensionPrompts[key] = { value, position, depth, scan, role };
                    },
                };
            },
        },
    };
    const injector = createPromptInjector(globalObject);
    const result = injector.inject('rule: @igs-scene');

    assert.deepEqual(result, { ok: true, method: 'extension-prompt', verified: true, placement: 'depth0' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].position, 1);
    assert.equal(calls[0].role, 0);
    assert.equal(extensionPrompts['igs-scene-assets-format-rule'].value, 'rule: @igs-scene');
    assert.equal(extensionPrompts['igs-scene-assets-format-rule'].position, 1);
    assert.equal(injector.isActive(), true);

    injector.clear();
    assert.equal(Object.hasOwn(extensionPrompts, 'igs-scene-assets-format-rule'), false);
    assert.equal(injector.isActive(), false);
});

test('gate:scene:scene-assets-resolves-by-exact-match-and-default-key-only', () => {
    // exact match: scene key = 'B班教室', mood = '平静'
    const assets1 = lookupSceneAssetUrls({
        scene: 'B班教室', time: '', weather: '',
        character: '小林海斗', mood: '平静',
    }, {
        scenes: { 'B班教室': { url: 'https://example.com/classroom.png', times: {} } },
        characters: { '小林海斗': { '平静': 'https://example.com/kaito.png' } },
    });
    assert.deepEqual(assets1, { backgroundUrl: 'https://example.com/classroom.png', spriteUrl: 'https://example.com/kaito.png', spriteSlot: '平静', spriteQuality: 'exact', spriteCharacter: '小林海斗' });

    // '默认' fallback when scene name doesn't match
    const assets2 = lookupSceneAssetUrls({
        scene: '走廊', time: '', weather: '',
        character: '小林海斗', mood: '随和',
    }, {
        scenes: { '默认': { url: 'https://example.com/default.png', times: {} } },
        characters: { '小林海斗': { '默认': 'https://example.com/kaito.png' } },
    });
    assert.deepEqual(assets2, { backgroundUrl: 'https://example.com/default.png', spriteUrl: 'https://example.com/kaito.png', spriteSlot: '默认', spriteQuality: 'default', spriteCharacter: '小林海斗' });

    // no scene fallback when only non-matching named key exists, but character still matches exactly
    const assets3 = lookupSceneAssetUrls({
        scene: '走廊', time: '', weather: '',
        character: '小林海斗', mood: '随和',
    }, {
        scenes: { '场景1': { url: 'https://example.com/classroom.png', times: {} } },
        characters: { '小林海斗': { '随和': 'https://example.com/kaito.png' } },
    });
    assert.deepEqual(assets3, { backgroundUrl: null, spriteUrl: 'https://example.com/kaito.png', spriteSlot: '随和', spriteQuality: 'exact', spriteCharacter: '小林海斗' });
});

test('gate:scene:scene-and-character-aliases-reuse-original-assets', () => {
    const resolved = lookupSceneAssetUrls({
        scene: '古城', time: '', weather: '',
        character: '爱丽', mood: '平和',
    }, {
        scenes: { '旧城': { url: 'https://example.com/old-city.png', words: ['古城'], times: {} } },
        characters: { '爱丽丝': { '平和': 'https://example.com/alice.png' } },
        characterAliases: { '爱丽丝': ['爱丽'] },
    });
    assert.deepEqual(resolved, {
        backgroundUrl: 'https://example.com/old-city.png',
        spriteUrl: 'https://example.com/alice.png',
        spriteSlot: '平和',
        spriteQuality: 'exact',
        spriteCharacter: '爱丽丝',
    });
});

test('gate:scene:mood-groups-resolve-fine-word-to-group-label', () => {
    assert.equal(resolveMoodGroup('欣喜', DEFAULT_MOOD_GROUPS), '喜悦');
    assert.equal(resolveMoodGroup('喜悦', DEFAULT_MOOD_GROUPS), '喜悦');
    assert.equal(resolveMoodGroup('慌张', DEFAULT_MOOD_GROUPS), '紧张');
    assert.equal(resolveMoodGroup('不存在的词', DEFAULT_MOOD_GROUPS), null);
    assert.equal(resolveMoodGroup('', DEFAULT_MOOD_GROUPS), null);
});

test('gate:scene:mood-fuzzy-uses-only-group-distinctive-chars', () => {
    const groups = [
        { label: '嫌弃', words: ['嫌弃', '嘲讽', '冷漠'] },
        { label: '平和', words: ['平静', '冷静'] },
        { label: '悲伤', words: ['心酸', '心痛'] },
        { label: '爱恋', words: ['心动'] },
    ];
    assert.equal(fuzzyResolveMoodGroup('嘲弄', groups), '嫌弃');
    assert.equal(fuzzyResolveMoodGroup('嘲笑', groups), '嫌弃');
    // 「冷」「心」跨组出现，不作依据
    assert.equal(fuzzyResolveMoodGroup('冷笑', groups), null);
    assert.equal(fuzzyResolveMoodGroup('心碎', groups), null);
    // 有效字指向不同组视为冲突
    assert.equal(fuzzyResolveMoodGroup('嘲静', groups), null);
    assert.equal(fuzzyResolveMoodGroup('', groups), null);
});

test('gate:scene:mood-fuzzy-sprite-lookup-is-opt-in-and-graded', () => {
    const assets = {
        characters: { '爱丽丝': { '嫌弃': 'https://example.com/scorn.png', '默认': 'https://example.com/default.png' } },
        moodGroups: [{ label: '嫌弃', words: ['嫌弃', '嘲讽'] }, { label: '平和', words: ['平静'] }],
    };
    const off = lookupSceneAssetUrls({ character: '爱丽丝', mood: '嘲弄' }, assets);
    assert.equal(off.spriteSlot, '默认');
    assert.equal(off.spriteQuality, 'default');
    const on = lookupSceneAssetUrls({ character: '爱丽丝', mood: '嘲弄' }, { ...assets, moodFuzzyMatch: true });
    assert.equal(on.spriteUrl, 'https://example.com/scorn.png');
    assert.equal(on.spriteQuality, 'fuzzy');
    const group = lookupSceneAssetUrls({ character: '爱丽丝', mood: '嘲讽' }, { ...assets, moodFuzzyMatch: true });
    assert.equal(group.spriteQuality, 'group');
});

function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, writes: () => map.size };
}

test('gate:scene:mood-review-dedupes-by-word-and-caps-length', () => {
    const storage = memoryStorage();
    assert.equal(recordMoodReview(storage, { word: '嘲弄', character: '爱丽丝', quality: 'fuzzy', group: '嫌弃' }), true);
    assert.equal(recordMoodReview(storage, { word: '嘲弄', character: '爱丽丝', quality: 'fuzzy', group: '嫌弃' }), false);
    recordMoodReview(storage, { word: '冷笑', character: '爱丽丝', quality: 'default', group: '默认' });
    const items = loadMoodReview(storage);
    assert.deepEqual(items.map((i) => i.word), ['冷笑', '嘲弄']);
    assert.equal(items[0].group, '');
    for (let i = 0; i < MOOD_REVIEW_LIMIT + 5; i += 1) recordMoodReview(storage, { word: `词${i}`, quality: 'default' });
    assert.equal(loadMoodReview(storage).length, MOOD_REVIEW_LIMIT);
});

test('gate:scene:mood-review-list-renders-one-add-per-word-as-compact-chips', () => {
    const html = renderMoodReviewList([
        { word: '嘲弄', character: '爱丽丝', quality: 'fuzzy', group: '嫌弃' },
        { word: '冷笑', character: '', quality: 'default', group: '' },
    ]);
    assert.match(html, /mood-review-assign:%E5%98%B2%E5%BC%84/);
    assert.match(html, /mood-review-assign:%E5%86%B7%E7%AC%91/);
    assert.equal((html.match(/>加入</g) || []).length, 2);
    // 每个词只有一个「加入」，不再有确认 / 改到其他组等多步按钮，也不用带框的大按钮。
    assert.doesNotMatch(html, /mood-review-accept|确认加入|改到其他组|加入情绪组|igs-settings-action/);
    assert.doesNotMatch(html, /未命中|显示默认立绘|模糊归入|请核对/);
    assert.doesNotMatch(html, /igs-mood-review-who/, '待确认情绪词标签不带所属角色');
    assert.match(html, /class="igs-review-clear" data-action="mood-review-clear"/);
    assert.match(html, /class="igs-mood-review-chip"/);
    assert.match(renderMoodReviewList([]), /暂无/);
});

test('gate:scene:mood-groups-build-text-renders-label-and-words', () => {
    const text = buildMoodGroupsText([
        { label: '喜悦', words: ['开心', '欣喜'] },
        { label: '愤怒', words: ['生气'] },
    ]);
    assert.equal(text, '喜悦组：开心、欣喜\n愤怒组：生气');
});

test('gate:scene:mood-groups-normalize-falls-back-to-default', () => {
    assert.deepEqual(normalizeMoodGroups(null), DEFAULT_MOOD_GROUPS.map((g) => ({ label: g.label, words: g.words.slice() })));
    assert.deepEqual(normalizeMoodGroups([]), DEFAULT_MOOD_GROUPS.map((g) => ({ label: g.label, words: g.words.slice() })));
    assert.deepEqual(
        normalizeMoodGroups([{ label: ' 自定义 ', words: ['词A', '', '词B'] }, { label: '', words: [] }]),
        [{ label: '自定义', words: ['词A', '词B'] }],
    );
});

test('gate:scene:scene-assets-sprite-resolves-by-mood-group-reduction', () => {
    // AI 写细分词「欣喜」，立绘只配了组名槽「喜悦」→ 归约命中
    const reduced = lookupSceneAssetUrls({
        scene: '', time: '', weather: '',
        character: '小林海斗', mood: '欣喜',
    }, {
        characters: { '小林海斗': { '喜悦': 'https://example.com/joy.png', '默认': 'https://example.com/default.png' } },
        moodGroups: DEFAULT_MOOD_GROUPS,
    });
    assert.equal(reduced.spriteUrl, 'https://example.com/joy.png');

    // 自定义细分词槽精确命中优先于归约
    const exact = lookupSceneAssetUrls({
        scene: '', time: '', weather: '',
        character: '小林海斗', mood: '欣喜',
    }, {
        characters: { '小林海斗': { '欣喜': 'https://example.com/exact.png', '喜悦': 'https://example.com/joy.png' } },
        moodGroups: DEFAULT_MOOD_GROUPS,
    });
    assert.equal(exact.spriteUrl, 'https://example.com/exact.png');

    // 归约不到 + 无精确槽 → 默认兜底
    const fallback = lookupSceneAssetUrls({
        scene: '', time: '', weather: '',
        character: '小林海斗', mood: '生造词',
    }, {
        characters: { '小林海斗': { '喜悦': 'https://example.com/joy.png', '默认': 'https://example.com/default.png' } },
        moodGroups: DEFAULT_MOOD_GROUPS,
    });
    assert.equal(fallback.spriteUrl, 'https://example.com/default.png');
});

test('gate:scene:scene-bg-resolves-by-group-reduction-across-three-layers', () => {
    const assets = {
        scenes: {
            '便利店': {
                url: 'https://example.com/store.png',
                words: ['世田谷区某便利店'],
                times: {
                    '夜晚': {
                        url: 'https://example.com/store-night.png',
                        weathers: { '雨天': { url: 'https://example.com/store-night-rain.png' } },
                    },
                },
            },
        },
        timeGroups: [{ label: '夜晚', words: ['深夜', '晚上'] }],
        weatherGroups: [{ label: '雨天', words: ['小雨', '大雨'] }],
    };

    // 场景名归约：AI 写细分词「世田谷区某便利店」→ 命中组「便利店」
    const sceneOnly = lookupSceneAssetUrls({ scene: '世田谷区某便利店', time: '', weather: '' }, assets);
    assert.equal(sceneOnly.backgroundUrl, 'https://example.com/store.png');

    // 时间归约：AI 写「深夜」→ 归约到时间组「夜晚」
    const sceneTime = lookupSceneAssetUrls({ scene: '世田谷区某便利店', time: '深夜', weather: '' }, assets);
    assert.equal(sceneTime.backgroundUrl, 'https://example.com/store-night.png');

    // 天气归约：AI 写「大雨」→ 归约到天气组「雨天」
    const full = lookupSceneAssetUrls({ scene: '便利店', time: '晚上', weather: '大雨' }, assets);
    assert.equal(full.backgroundUrl, 'https://example.com/store-night-rain.png');
});

test('gate:scene:demo-night-background-derives-time-variants', () => {
    const base = 'assets/scene-demo-clean-night.png';
    const assets = { scenes: { '默认': { url: base, times: {} } } };
    const resolve = (time) => lookupSceneAssetUrls({ scene: '未配置场景', time, weather: '' }, assets).backgroundUrl;

    assert.equal(resolve('清晨'), 'assets/scene-demo-clean-dawn.png');
    assert.equal(resolve('白天'), 'assets/scene-demo-clean-day.png');
    assert.equal(resolve('傍晚'), 'assets/scene-demo-clean-dusk.png');
    assert.equal(resolve('夜晚'), 'assets/scene-demo-clean-night.png');
    assert.equal(resolve('深夜'), 'assets/scene-demo-clean-minight.png');
    assert.equal(resolve('未知时间'), base);

    const custom = lookupSceneAssetUrls({ scene: '默认', time: '深夜', weather: '' }, {
        scenes: { '默认': { url: 'https://example.com/background.png', times: {} } },
    });
    assert.equal(custom.backgroundUrl, 'https://example.com/background.png');
});

test('gate:scene:settings-action-set-time-url-survives-colon-in-time-name', async () => {
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: { '便利店': { url: '', times: { '19:45': { url: '', weathers: {} } } } },
                characters: {},
            },
        },
        readerSettings: {},
    };
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    // time name '19:45' contains a colon; encoded by the input handler before invoke
    const enc = (s) => encodeURIComponent(s);
    const action = `scene-set-time-url:${enc('便利店')}:${enc('19:45')}:https://example.com/a.png?x=1:2`;
    const result = await handleSettingsAction(action, ctx);
    assert.equal(result.ok, true);
    assert.equal(draft.bridge.sceneAssets.scenes['便利店'].times['19:45'].url, 'https://example.com/a.png?x=1:2');
    assert.equal(persistCount, 1);
});

test('gate:scene:mood-review-assign-moves-word-into-group-and-clears-entry', async () => {
    const storage = memoryStorage();
    recordMoodReview(storage, { word: '嘲弄', character: '爱丽丝', quality: 'fuzzy', group: '嫌弃' });
    recordMoodReview(storage, { word: '冷笑', character: '爱丽丝', quality: 'default' });
    const draft = {
        bridge: { sceneAssets: { enabled: true, characters: {}, moodGroups: [{ label: '嫌弃', words: ['嘲讽'] }, { label: '平和', words: ['平静'] }] } },
        readerSettings: {},
    };
    let persistCount = 0;
    const answers = ['嫌弃', '平和'];
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { localStorage: storage, prompt: () => answers.shift() || '', alert: () => {} } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    await handleSettingsAction(`mood-review-assign:${encodeURIComponent('嘲弄')}`, ctx);
    assert.deepEqual(draft.bridge.sceneAssets.moodGroups[0].words, ['嘲讽', '嘲弄']);
    await handleSettingsAction(`mood-review-assign:${encodeURIComponent('冷笑')}`, ctx);
    assert.deepEqual(draft.bridge.sceneAssets.moodGroups[1].words, ['平静', '冷笑']);
    assert.equal(persistCount, 2);
    assert.deepEqual(loadMoodReview(storage), []);
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

test('gate:settings:theme-cycle-persists-through-settings-action-and-migrates-legacy-values', async () => {
    assert.equal(normalizeSettingsTheme(), 'cream');
    assert.equal(normalizeSettingsTheme('bogus'), 'cream');
    assert.equal(normalizeSettingsTheme('night'), 'landmine');
    assert.equal(normalizeSettingsTheme('day'), 'cream');
    assert.equal(getNextSettingsTheme('cream'), 'light');
    assert.equal(getNextSettingsTheme('light'), 'landmine');
    assert.equal(getNextSettingsTheme('landmine'), 'dark');
    assert.equal(getNextSettingsTheme('dark'), 'cream');
    const draft = { bridge: { settingsTheme: 'night' }, readerSettings: {} };
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    await handleSettingsAction('toggle-settings-theme', ctx);
    assert.equal(draft.bridge.settingsTheme, 'dark');
    assert.equal(persistCount, 1);
    await handleSettingsAction('set-settings-theme:light', ctx);
    assert.equal(draft.bridge.settingsTheme, 'light');
    assert.equal(persistCount, 2);
    await handleSettingsAction('set-settings-theme:light', ctx);
    assert.equal(persistCount, 2);
    await handleSettingsAction('set-settings-theme:bogus', ctx);
    assert.equal(draft.bridge.settingsTheme, 'cream');
    assert.equal(persistCount, 3);
});

test('gate:settings:generated-asset-actions-manage-library-and-temp-status', async () => {
    const enc = (value) => encodeURIComponent(value);
    const draft = {
        bridge: {
            sceneAssets: {
                generated: {
                    scenes: { '夜景': { url: 'igs-gen:bg-old', words: [], times: {} } },
                    characters: {},
                    characterAliases: {},
                },
            },
        },
        readerSettings: {},
    };
    const persisted = [];
    const deleted = [];
    const statuses = [];
    let promptValue = '';
    let confirmed = true;
    const service = {
        getRecord: (key) => key === 'temp/bg' ? {
            key,
            imageId: 'bg-temp',
            type: 'background',
            name: '临时夜景',
            time: '夜晚',
        } : null,
        setStatus: async (key, status) => {
            statuses.push({ key, status });
            return { ok: true };
        },
        deleteImages: async (ids) => {
            deleted.push(ids);
            return { ok: true };
        },
    };
    let rerenders = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: {
            generatedAssets: service,
            global: {
                prompt: () => promptValue,
                confirm: () => confirmed,
            },
        },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => {
            persisted.push(JSON.parse(JSON.stringify(draft.bridge.sceneAssets.generated)));
            return { ok: true };
        },
        rerenderSettings: () => { rerenders += 1; return { ok: true }; },
        buildRegexPreview: () => '',
    };

    // prompt 取消不得修改库；随后改名必须保留 URL，并用编码名称正确寻址。
    await handleSettingsAction(`gen-lib-rename:background:${enc('夜景')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.generated.scenes['夜景'].url, 'igs-gen:bg-old');
    assert.equal(persisted.length, 0);
    promptValue = '新夜景';
    await handleSettingsAction(`gen-lib-rename:background:${enc('夜景')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.generated.scenes['新夜景'].url, 'igs-gen:bg-old');
    assert.equal(draft.bridge.sceneAssets.generated.scenes['夜景'], undefined);

    // confirm 取消不得删除；确认后先持久化库，再删除其 IndexedDB 图片。
    confirmed = false;
    await handleSettingsAction(`gen-lib-remove:background:${enc('新夜景')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.generated.scenes['新夜景'].url, 'igs-gen:bg-old');
    assert.equal(deleted.length, 0);
    confirmed = true;
    await handleSettingsAction(`gen-lib-remove:background:${enc('新夜景')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.generated.scenes['新夜景'], undefined);
    assert.deepEqual(deleted, [['bg-old']]);

    // 临时背景入库进场景素材，不进生成素材库。
    promptValue = '临时夜景';
    await handleSettingsAction(`gen-temp-accept:${enc('temp/bg')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.scenes['临时夜景'].times['夜晚'].url, 'igs-gen:bg-temp');
    assert.equal(draft.bridge.sceneAssets.generated.scenes['临时夜景'], undefined);
    await handleSettingsAction(`gen-temp-discard:${enc('temp/bg')}`, ctx);
    assert.deepEqual(statuses, [
        { key: 'temp/bg', status: 'library' },
        { key: 'temp/bg', status: 'discarded' },
    ]);
    assert.ok(rerenders >= 6);
});

test('gate:settings:generated-asset-actions-rollback-on-persist-and-service-failure', async () => {
    const enc = (value) => encodeURIComponent(value);
    const makeDraft = () => ({
        bridge: {
            sceneAssets: {
                generated: {
                    scenes: { 旧景: { url: 'igs-gen:old', words: [], times: {} } },
                    characters: {},
                    characterAliases: {},
                },
            },
        },
        readerSettings: {},
    });
    const makeContext = (draft, global, persistSettingsDraft, generatedAssets) => ({
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global, generatedAssets },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft,
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    });

    {
        const draft = makeDraft();
        let persistCount = 0;
        const result = await handleSettingsAction(`gen-lib-rename:background:${enc('旧景')}`, makeContext(
            draft,
            { prompt: () => '新景', alert: () => {} },
            () => { persistCount += 1; return { ok: false, reason: 'persist-failed' }; },
            null,
        ));
        assert.equal(result.reason, 'generated-asset-rename-rollback-failed');
        assert.equal(persistCount, 2);
        assert.equal(draft.bridge.sceneAssets.generated.scenes['旧景'].url, 'igs-gen:old');
        assert.equal(draft.bridge.sceneAssets.generated.scenes['新景'], undefined);
    }

    {
        const draft = makeDraft();
        let persistCount = 0;
        const result = await handleSettingsAction(`gen-lib-remove:background:${enc('旧景')}`, makeContext(
            draft,
            { confirm: () => true, alert: () => {} },
            () => { persistCount += 1; return { ok: true }; },
            { deleteImages: async () => ({ ok: false, reason: 'delete-failed' }) },
        ));
        assert.equal(result.reason, 'generated-asset-remove-images-failed');
        assert.equal(persistCount, 2);
        assert.equal(draft.bridge.sceneAssets.generated.scenes['旧景'].url, 'igs-gen:old');
    }

    {
        const draft = makeDraft();
        let persistCount = 0;
        const result = await handleSettingsAction('gen-temp-accept:temp', makeContext(
            draft,
            { alert: () => {} },
            () => { persistCount += 1; return { ok: true }; },
            {
                getRecord: () => ({ imageId: 'temp-image', type: 'background', name: '临时景' }),
                setStatus: async () => ({ ok: false, reason: 'status-failed' }),
            },
        ));
        assert.equal(result.reason, 'status-failed');
        assert.equal(persistCount, 2);
        assert.equal(draft.bridge.sceneAssets.generated.scenes['临时景'], undefined);
        assert.equal(draft.bridge.sceneAssets.scenes['临时景'], undefined);
    }

    {
        const draft = makeDraft();
        const result = await handleSettingsAction('gen-temp-discard:temp', makeContext(
            draft,
            { confirm: () => true },
            () => ({ ok: true }),
            { setStatus: async () => { throw new Error('status failed'); } },
        ));
        assert.equal(result.reason, 'generated-asset-status-failed');
    }
});

test('gate:settings:generated-asset-download-button-and-action', async () => {
    const { renderGeneratedAssetPane } = await import('../src/visual/igs-ui/settings-fields.js');
    const { sanitizeDownloadName } = await import('../src/visual/igs-ui/settings-actions.js');
    const enc = (value) => encodeURIComponent(value);
    const html = renderGeneratedAssetPane({
        library: {
            scenes: { 夜景: { url: 'igs-gen:bg-lib', words: [], times: {} } },
            characters: { 爱丽丝: { 默认: 'igs-gen:sp-lib' } },
        },
        temp: [
            { key: 'temp/sp', imageId: 'sp-temp', type: 'sprite', name: '若叶睦', status: 'review' },
            { key: 'temp/failed', imageId: '', type: 'sprite', name: '失败', status: 'failed' },
        ],
        resolveUrl: () => '',
    });
    assert.equal(html.includes('gen-asset-prompt:'), false);
    assert.equal(html.includes('gen-asset-download:'), false);
    assert.equal(html.includes('gen-lib-remove:'), false);
    assert.ok(html.includes(`data-action="gen-temp-accept:${enc('temp/sp')}"`));
    assert.ok(html.includes(`data-action="gen-matte-edit:${enc('sp-temp')}"`));
    assert.equal(html.includes('gen-matte-edit:'), true);

    const clicks = [];
    const created = [];
    const revoked = [];
    const alerts = [];
    const doc = {
        body: { appendChild() {}, removeChild() {} },
        createElement: () => { const a = { click() { clicks.push({ href: a.href, download: a.download }); } }; return a; },
    };
    const global = {
        document: doc,
        Blob,
        URL: { createObjectURL: (b) => { created.push(b); return 'blob:igs-test'; }, revokeObjectURL: (u) => revoked.push(u) },
        atob: (s) => Buffer.from(s, 'base64').toString('latin1'),
        alert: (m) => alerts.push(m),
    };
    const pngUrl = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}`;
    const ctx = {
        state: { activeSettings: { draft: { bridge: {}, readerSettings: {} }, readerMode: 'pc', asyncState: {} } },
        options: { global, generatedAssets: { getImageDataUrl: async (id) => (id === 'sp-temp' ? pngUrl : '') } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    const done = await handleSettingsAction(`gen-asset-download:${enc('sp-temp')}:${enc('若叶睦/立绘?.png')}`, ctx);
    assert.equal(done.ok, true);
    assert.equal(done.fileName, '若叶睦_立绘_.png');
    assert.deepEqual(clicks, [{ href: 'blob:igs-test', download: '若叶睦_立绘_.png' }]);
    assert.equal(created[0].type, 'image/png');
    assert.deepEqual(Array.from(new Uint8Array(await created[0].arrayBuffer())), [0x89, 0x50, 0x4e, 0x47], '下载字节与存储一致');
    assert.deepEqual(revoked, ['blob:igs-test']);

    const missing = await handleSettingsAction(`gen-asset-download:${enc('gone')}:${enc('x.png')}`, ctx);
    assert.equal(missing.reason, 'generated-asset-image-missing');
    assert.equal(alerts.length, 1);
    assert.equal(sanitizeDownloadName(''), '素材.png');
    assert.equal(sanitizeDownloadName('a:b'), 'a_b.png');

    const seen = [];
    const promptCtx = {
        ...ctx,
        dialogs: { view: async (text) => { seen.push(text); } },
        options: { ...ctx.options, generatedAssets: { getImagePrompt: async (id) => (id === 'sp-lib' ? { positive: '1girl, solo', negative: 'lowres' } : null) } },
    };
    const shown = await handleSettingsAction(`gen-asset-prompt:${enc('sp-lib')}`, promptCtx);
    assert.equal(shown.ok, true);
    assert.deepEqual(seen, ['正面\n1girl, solo\n\n负面\nlowres']);
    const empty = await handleSettingsAction(`gen-asset-prompt:${enc('old')}`, promptCtx);
    assert.equal(empty.ok, true);
    assert.equal(seen[1], '这条素材没有保存生图提示词。');
});


test('gate:scene:asset-alias-actions-reuse-existing-entries', async () => {
    const storage = createMemoryStorage();
    const prompts = ['爱丽', '古城', '艾莉西亚'];
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: { '旧城': { url: 'bg', words: [], times: {} } },
                characters: { '爱丽丝': { '平和': 'sprite' } },
                characterAliases: { '爱丽丝': [] },
            },
        },
        readerSettings: {},
    };
    const asyncState = { scenePresetName: '别名预设', expandedSpriteSlots: new Set() };
    let persistCount = 0;
    let alerts = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState } },
        options: {
            global: {
                localStorage: storage,
                prompt: () => prompts.shift() || '',
                confirm: () => true,
                alert: () => { alerts += 1; },
            },
        },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };

    await handleSettingsAction(`scene-add-char-alias:${encodeURIComponent('爱丽丝')}`, ctx);
    await handleSettingsAction(`scene-add-bg-word:${encodeURIComponent('旧城')}`, ctx);
    assert.deepEqual(draft.bridge.sceneAssets.characterAliases['爱丽丝'], ['爱丽']);
    assert.deepEqual(draft.bridge.sceneAssets.scenes['旧城'].words, ['古城']);

    await handleSettingsAction(`scene-rename-char:${encodeURIComponent('爱丽丝')}`, ctx);
    assert.deepEqual(draft.bridge.sceneAssets.characterAliases['艾莉西亚'], ['爱丽']);
    assert.equal(draft.bridge.sceneAssets.characterAliases['爱丽丝'], undefined);
    await handleSettingsAction(`scene-remove-char-alias:${encodeURIComponent('艾莉西亚')}:${encodeURIComponent('爱丽')}`, ctx);
    await handleSettingsAction(`scene-remove-bg-word:${encodeURIComponent('旧城')}:${encodeURIComponent('古城')}`, ctx);
    assert.deepEqual(draft.bridge.sceneAssets.characterAliases['艾莉西亚'], []);
    assert.deepEqual(draft.bridge.sceneAssets.scenes['旧城'].words, []);
    assert.equal(alerts, 0);
    assert.ok(persistCount >= 5);
});

test('gate:scene:settings-action-mood-groups-toggle-and-reset', async () => {
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: { '小林': { '喜悦': '' } }, moodGroups: [{ label: '自定义', words: ['词A'] }] } }, readerSettings: {} };
    const asyncState = {};
    let rerenders = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState } },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => { rerenders += 1; return { ok: true }; },
        buildRegexPreview: () => '',
    };
    await handleSettingsAction(`scene-toggle-mood:${encodeURIComponent('小林')}:${encodeURIComponent('喜悦')}`, ctx);
    assert.ok(asyncState.expandedSpriteSlots instanceof Set);
    assert.equal(asyncState.expandedSpriteSlots.size, 1);
    await handleSettingsAction(`scene-toggle-mood:${encodeURIComponent('小林')}:${encodeURIComponent('喜悦')}`, ctx);
    assert.equal(asyncState.expandedSpriteSlots.size, 0);
    await handleSettingsAction('reset-mood-groups', ctx);
    assert.equal(draft.bridge.sceneAssets.moodGroups.length, DEFAULT_MOOD_GROUPS.length);
    assert.ok(rerenders >= 3);
});

test('gate:scene:mood-create-group-auto-first-word-and-blocks-dup', async () => {
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {}, moodGroups: [{ label: '喜悦', words: ['开心'] }] } }, readerSettings: {} };
    let alerts = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { alert: () => { alerts += 1; } } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    // 新建组：组名自动作为第一个词
    await handleSettingsAction(`mood-create-group:${encodeURIComponent('愤怒')}`, ctx);
    const created = draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '愤怒');
    assert.ok(created);
    assert.deepEqual(created.words, ['愤怒']);
    // 组名撞名：阻止 + alert
    const before = draft.bridge.sceneAssets.moodGroups.length;
    await handleSettingsAction(`mood-create-group:${encodeURIComponent('喜悦')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.moodGroups.length, before);
    assert.equal(alerts, 1);
});

test('gate:scene:mood-add-word-dup-confirm-moves-word', async () => {
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {}, moodGroups: [{ label: '喜悦', words: ['开心', '愉悦'] }, { label: '平和', words: ['平静'] }] } }, readerSettings: {} };
    let confirmed = true;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { prompt: () => '开心', confirm: () => confirmed } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    // 向「平和」加「开心」（已在喜悦组）→ confirm 后从喜悦删、加到平和
    await handleSettingsAction(`mood-add-word:${encodeURIComponent('平和')}`, ctx);
    const joy = draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '喜悦');
    const calm = draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '平和');
    assert.equal(joy.words.includes('开心'), false);
    assert.equal(calm.words.includes('开心'), true);
});

test('gate:scene:rename-mood-blocks-dup-and-syncs-group-label', async () => {
    const make = (prompt) => {
        const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: { A: { 喜悦: 'u1', 平和: 'u2' }, B: { 喜悦: 'u3' } }, moodGroups: [{ label: '喜悦', words: ['喜悦', '开心'] }, { label: '平和', words: ['平静'] }] } }, readerSettings: {} };
        let alerts = 0;
        const ctx = {
            state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
            options: { global: { prompt: () => prompt, alert: () => { alerts += 1; } } },
            closeSettings: () => ({ ok: true }),
            persistSettingsDraft: () => ({ ok: true }),
            rerenderSettings: () => ({ ok: true }),
            buildRegexPreview: () => '',
        };
        return { draft, ctx, getAlerts: () => alerts };
    };

    // 撞该角色已有的槽名「平和」→ 阻止，不动数据
    const blocked = make('平和');
    await handleSettingsAction(`scene-rename-mood:${encodeURIComponent('A')}:${encodeURIComponent('喜悦')}`, blocked.ctx);
    assert.equal(blocked.getAlerts(), 1);
    assert.equal('喜悦' in blocked.draft.bridge.sceneAssets.characters.A, true);

    // 改成全新名「欢喜」→ 角色槽名 + 词库组名 + 其他角色同名槽 一起改
    const ok = make('欢喜');
    await handleSettingsAction(`scene-rename-mood:${encodeURIComponent('A')}:${encodeURIComponent('喜悦')}`, ok.ctx);
    assert.equal('欢喜' in ok.draft.bridge.sceneAssets.characters.A, true);
    assert.equal('喜悦' in ok.draft.bridge.sceneAssets.characters.A, false);
    assert.equal('欢喜' in ok.draft.bridge.sceneAssets.characters.B, true);
    const group = ok.draft.bridge.sceneAssets.moodGroups.find((g) => g.label === '欢喜');
    assert.ok(group);
    assert.equal(group.words.includes('欢喜'), true);
    assert.equal(group.words.includes('喜悦'), false);
});

test('gate:scene:extracts-directives-with-trailing-translation-tail', () => {
    // [igs-char] / [igs-thought] lines often carry a translation tail like *（…）*
    // after the closing bracket; the directive must still be extracted (no end anchor).
    const { directives } = extractSceneDirectives([
        '[igs-char:小林海斗|淡然|まさか。]*（怎么可能。）*',
        '[igs-thought:望月|疑惑|这家伙晚饭？]*（…）*',
    ].join('\n'));
    assert.equal(directives.length, 2);
    assert.equal(directives[0].type, 'char');
    assert.equal(directives[0].character, '小林海斗');
    assert.equal(directives[0].mood, '淡然');
    assert.equal(directives[1].type, 'thought');
    assert.equal(directives[1].mood, '疑惑');
});

test('gate:scene:scene-assets-state-follows-current-reader-segment', () => {
    const { directives } = extractSceneDirectives([
        'Opening narration.',
        '[igs-scene:Room|morning|sunny]',
        '[igs-char:Alice|calm|Hello.]',
        'Alice keeps working.',
        '[igs-char:Bob|annoyed|Move faster.]',
        'Bob leaves later.',
    ].join('\n'));

    // directive lines don't count toward segmentIndex — only non-directive lines do
    assert.deepEqual(directives.map((d) => d.segmentIndex), [1, 1, 2]);
    const empty = { scene: '', time: '', weather: '', nsfw: false, character: '', mood: '', dialogue: '', thought: '', lastDirectiveType: '' };
    assert.deepEqual(resolveSceneStateAtIndex(directives, 0), empty);
    assert.deepEqual(resolveSceneStateAtIndex(directives, 1), { scene: 'Room', time: 'morning', weather: 'sunny', nsfw: false, character: 'Alice', mood: 'calm', dialogue: 'Hello.', thought: '', lastDirectiveType: 'char' });
    assert.deepEqual(resolveSceneStateAtIndex(directives, 2), { scene: 'Room', time: 'morning', weather: 'sunny', nsfw: false, character: 'Bob', mood: 'annoyed', dialogue: 'Move faster.', thought: '', lastDirectiveType: 'char' });
});

test('gate:scene:nsfw-scene-state-resets-on-next-scene', () => {
    const { directives } = extractSceneDirectives([
        '[igs-scene:Room|night|rain|NSFW]',
        '[igs-char:Alice|calm|Stay.]',
        'The door closes.',
        '[igs-scene:Street|night|rain]',
        'The story continues.',
    ].join('\n'));

    assert.equal(directives[0].nsfw, true);
    assert.equal(resolveSceneStateAtIndex(directives, 0).nsfw, true);
    assert.equal(resolveSceneStateAtIndex(directives, 1).nsfw, false);
});

test('gate:scene:inline-multi-scene-directives-follow-segment-and-revert', () => {
    // 行内混排：指令与正文同段时，A 段用 A 场景、B 段用 B 场景，倒回仍回 A。
    const inline = extractSceneDirectives([
        '[igs-scene:A|night|rain]A 段正文。',
        '[igs-scene:B|day|sunny]B 段正文。',
    ].join('\n')).directives;
    assert.deepEqual(inline.map((d) => [d.scene, d.segmentIndex]), [['A', 0], ['B', 1]]);
    assert.equal(resolveSceneStateAtIndex(inline, 0).scene, 'A');
    assert.equal(resolveSceneStateAtIndex(inline, 1).scene, 'B');
    assert.equal(resolveSceneStateAtIndex(inline, 0).scene, 'A');

    // 段首独立行指令与段末预告指令都生效于下一段。
    const headLine = extractSceneDirectives([
        '[igs-scene:A|night|rain]',
        'A 段正文。',
        '[igs-scene:B|day|sunny]',
        'B 段正文。',
    ].join('\n')).directives;
    assert.deepEqual(headLine.map((d) => [d.scene, d.segmentIndex]), [['A',0], ['B', 1]]);

    const tailLine = extractSceneDirectives([
        '前段正文。',
        '[igs-scene:C|dawn|fog]',
        '后段正文。',
    ].join('\n')).directives;
    assert.deepEqual(tailLine.map((d) => [d.scene, d.segmentIndex]), [['C', 1]]);
    assert.equal(resolveSceneStateAtIndex(tailLine, 1).scene, 'C');
});


test('gate:igs-ui:scene-assets-keeps-sprite-with-existing-background', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: {
                openMode: 'pc',
                sceneAssets: {
                    enabled: true,
                    scenes: {
                        Room: 'https://example.com/room.png',
                    },
                    characters: {
                        Kaito: {
                            calm: 'https://example.com/kaito.png',
                        },
                    },
                },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        message: {
            text: '[igs-scene:Room|morning|sunny]\n[igs-char:Kaito|calm|Ready.]\nKaito keeps working.',
        },
        render: {
            stage: {
                layers: {
                    background: {
                        resource: {
                            url: 'https://example.com/generated-background.png',
                        },
                    },
                },
            },
        },
    }, { mode: 'pc' });

    assert.equal(opened.snapshot.content.backgroundImage, 'https://example.com/room.png');
    assert.equal(opened.snapshot.content.spriteImage, 'https://example.com/kaito.png');
    assert.match(opened.snapshot.html, /id="igs-sprite"/);
    assert.equal(opened.snapshot.styles['#igs-sprite'].display, 'block');

    host.destroy();
});

test('gate:igs-ui:settings-repaints-thumbs-when-generated-images-arrive', () => {
    let notify = () => {};
    const images = new Map();
    const timers = [];
    const host = createIgsReaderHost({
        global: { setTimeout: (fn) => { timers.push(fn); return timers.length; } },
        onGeneratedAssetUpdated: (handler) => { notify = handler; return () => {}; },
        generatedAssets: { resolveUrl: (url) => images.get(String(url)) || '' },
        getUnifiedSettings: () => ({
            version: '0.33.7',
            bridge: {
                openMode: 'pc',
                sceneAssets: {
                    enabled: true,
                    scenes: {},
                    characters: { Kaito: { 默认: 'igs-gen:abc' } },
                },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true }),
    });
    host.openReader({ message: { text: '旁白。' } }, { mode: 'pc' });
    const opened = host.openSettings({ tab: 'scene' });
    opened.controller.switchSceneSubTab('characters');
    opened.controller.invoke(`ui-toggle-open:${encodeURIComponent('char-open:Kaito')}`);
    assert.equal(opened.controller.getSnapshot().html.includes('data:image/png;base64,aaa'), false);
    images.set('igs-gen:abc', 'data:image/png;base64,aaa');
    notify({ reason: 'image-loaded', imageId: 'abc' });
    assert.equal(timers.length, 1);
    timers[0]();
    assert.match(opened.controller.getSnapshot().html, /data:image\/png;base64,aaa/);
    host.destroy();
});

test('gate:igs-ui:sprite-slot-expand-shows-thumbnail-and-words', async () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: {
                openMode: 'pc',
                sceneAssets: {
                    enabled: true,
                    scenes: {},
                    characters: { Kaito: { 喜悦: 'https://example.com/k.png' } },
                    characterAliases: { Kaito: ['海斗'] },
                    moodGroups: [{ label: '喜悦', words: ['开心', '欣喜'] }],
                },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });
    host.openReader({ message: { text: '旁白。' } }, { mode: 'pc' });
    const opened = host.openSettings({ tab: 'scene' });
    const controller = opened.controller;
    controller.switchTab('scene');
    controller.switchSceneSubTab('characters');
    // 角色平时只有一行，先展开 Kaito 才看得到情绪槽。
    await controller.invoke(`ui-toggle-open:${encodeURIComponent('char-open:Kaito')}`);

    // 折叠态：不含缩略图
    const snap = controller.getSnapshot();
    assert.equal(/igs-sprite-thumb/.test(snap.html), false);
    assert.doesNotMatch(snap.html, />角色别名<\/div>/);
    assert.match(snap.html, /海斗/);

    // 展开后：含缩略图和该情绪组的词
    const after = await controller.invoke(`scene-toggle-mood:${encodeURIComponent('Kaito')}:${encodeURIComponent('喜悦')}`);
    assert.match(after.snapshot.html, /igs-sprite-thumb/);
    assert.match(after.snapshot.html, /开心/);

    host.destroy();
});

test('gate:igs-ui:toolbar-first-last-page-jump', async () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({ version: '0.4.9', bridge: { openMode: 'pc', sceneAssets: { enabled: false } }, readerMode: 'pc', readerSettings: {} }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });
    const opened = host.openReader({ message: { text: '第一段。\n第二段。\n第三段。' } }, { mode: 'pc' });
    const controller = opened.controller;
    assert.equal(opened.snapshot.content.segments.length, 3);
    assert.equal(opened.snapshot.content.currentIndex, 0);

    await controller.invokeAction('last-page');
    assert.equal(host.getState().activeReader.index, 2);
    await controller.invokeAction('first-page');
    assert.equal(host.getState().activeReader.index, 0);

    host.destroy();
});

test('gate:igs-ui:scene-assets-classifies-dialogue-vs-narration-per-segment', () => {
    const makeHost = () => createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: {
                openMode: 'pc',
                sceneAssets: { enabled: true, scenes: {}, characters: {} },
            },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    // dialogue segment: name stripped from body, shown as speaker, textType=dialogue
    const host1 = makeHost();
    const dlg = host1.openReader({
        message: { text: '<content>[igs-char:小林海斗|平静|これは台詞です。]</content>' },
    }, { mode: 'pc' });
    assert.equal(dlg.snapshot.content.textType, 'dialogue');
    assert.equal(dlg.snapshot.content.speaker, '小林海斗');
    assert.equal(dlg.snapshot.content.displayText, 'これは台詞です。');
    assert.equal(dlg.snapshot.content.displayText.includes('['), false);
    host1.destroy();

    // narration segment: no speaker, no name, textType=narration
    const host2 = makeHost();
    const narr = host2.openReader({
        message: { text: '<content>小林海斗静静地看着窗外。</content>' },
    }, { mode: 'pc' });
    assert.equal(narr.snapshot.content.textType, 'narration');
    assert.equal(narr.snapshot.content.speaker, '');
    assert.equal(narr.snapshot.content.displayText, '小林海斗静静地看着窗外。');
    host2.destroy();

    // 强制兜底：整条消息没有任何 [igs-*:] 指令时，即使长得像“[名字]：台词”也按旁白。
    const host3 = makeHost();
    const untagged = host3.openReader({
        message: { text: '<content>[小林海斗]：这段没有 IGS 标签。</content>' },
    }, { mode: 'pc' });
    assert.equal(untagged.snapshot.content.textType, 'narration');
    assert.equal(untagged.snapshot.content.speaker, '');
    host3.destroy();

    // 角色台词被成对引号包裹时，前端剥掉引号；thought/旁白不受影响。
    const quotedCases = [
        ['“これは台詞です。”', 'これは台詞です。'],
        ['"これは台詞です。"', 'これは台詞です。'],
        ['「これは台詞です。」', 'これは台詞です。'],
        ['『これは台詞です。』', 'これは台詞です。'],
        ["'これは台詞です。'", 'これは台詞です。'],
    ];
    for (const [raw, expected] of quotedCases) {
        const host = makeHost();
        const res = host.openReader({
            message: { text: `<content>[igs-char:小林海斗|平静|${raw}]</content>` },
        }, { mode: 'pc' });
        assert.equal(res.snapshot.content.textType, 'dialogue');
        assert.equal(res.snapshot.content.displayText, expected);
        host.destroy();
    }
});

test('gate:igs-ui:scene-assets-keeps-narration-out-of-dialogue-and-thought-pages', async () => {
    const pagesOf = async (body, sentencePaging = false) => {
        const host = createIgsReaderHost({
            global: {},
            getUnifiedSettings: () => ({
                version: '0.4.9',
                bridge: { openMode: 'pc', sentencePaging, sceneAssets: { enabled: true, scenes: {}, characters: {} } },
                readerMode: 'pc',
                readerSettings: {},
            }),
            saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
        });
        const opened = host.openReader({ message: { text: `<content>${body}</content>` } }, { mode: 'pc' });
        const pages = [];
        for (let index = 0; index < opened.snapshot.content.segments.length; index += 1) {
            if (index) await opened.controller.invokeAction('next');
            const { content } = host.getState().activeReader.snapshot;
            pages.push([content.textType, content.speaker, content.displayText]);
        }
        host.destroy();
        return pages;
    };

    // 短台词「……」不得认领以它开头的旁白，也不得让独立的「……」旁白认领含它的台词。
    assert.deepEqual(await pagesOf('[igs-scene:教室|傍晚|晴]\n[igs-char:小雪|沉默|……]\n……空气安静得只能听见钟表声。\n……\n[igs-char:小雪|害羞|其实……我等你很久了。]'), [
        ['dialogue', '小雪', '……'],
        ['narration', '', '……空气安静得只能听见钟表声。'],
        ['narration', '', '……'],
        ['dialogue', '小雪', '其实……我等你很久了。'],
    ]);
    // AI 的斜体旁白 *…* 不对应任何心里话指令，不进入心理活动页。
    assert.deepEqual((await pagesOf('[igs-char:小雪|微笑|你来了。]\n*她把书合上，抬头看向门口。*\n[igs-thought:小雪|紧张|要冷静]')).map(([type]) => type), ['dialogue', 'narration', 'thought']);
    // 首段「xx：」旁白不被当成说话人前缀剥掉。
    assert.deepEqual((await pagesOf('她小声嘀咕：真是的。\n[igs-char:小雪|微笑|你来了。]', true))[0], ['narration', '', '她小声嘀咕：真是的。']);
    // 漏写 "]" 的台词只到行尾，不吞并后文旁白与心里话指令。
    assert.deepEqual(await pagesOf('[igs-char:小雪|微笑|你来了。\n她笑着迎上来。\n[igs-thought:小雪|期待|他会不会注意到呢]'), [
        ['dialogue', '小雪', '你来了。'],
        ['narration', '', '她笑着迎上来。'],
        ['thought', '小雪', '*他会不会注意到呢*'],
    ]);
    // 省略表情栏的两栏写法按「没写表情」的台词/心里话处理，不再整句消失。
    assert.deepEqual(await pagesOf('[igs-char:小雪|你来了。]\n旁白五。\n[igs-thought:小雪|他会来吗]'), [
        ['dialogue', '小雪', '你来了。'],
        ['narration', '', '旁白五。'],
        ['thought', '小雪', '*他会来吗*'],
    ]);
});

test('gate:scene:directive-extraction-survives-malformed-tags-and-legacy-format-rule-migrates', () => {
    const { directives } = extractSceneDirectives('[igs-char:小雪|你来了。]\n[igs-char:小雪|微笑|等你好久了\n[igs-char:\n旁白。');
    assert.deepEqual(directives.map((d) => [d.type, d.character, d.mood, d.dialogue]), [
        ['char', '小雪', '', '你来了。'],
        ['char', '小雪', '微笑', '等你好久了'],
    ]);
    const legacy = normalizeVirtualRegex({ pattern: String.raw`\[igs-char:([^|\]]+)\|[^|\]]+\|([^\]]+)\]` });
    assert.equal(legacy.pattern, DEFAULT_VIRTUAL_REGEX.pattern);
    assert.equal(normalizeVirtualRegex({ pattern: '^@bubble:(.+)$' }).pattern, '^@bubble:(.+)$');
});

test('gate:scene:text-pipeline:virtual-regex-rules-run-in-order-and-keep-legacy-fields', async () => {
    const { applyImmersiveGalgameSystemBodyFormat, normalizeVirtualRegex } = await import('../src/scene/message-source.js');
    const legacy = applyImmersiveGalgameSystemBodyFormat('foo foo', {
        enabled: true,
        pattern: 'foo',
        flags: 'g',
        replacement: 'bar',
    });
    assert.equal(legacy.formattedRaw, 'bar bar');

    const ordered = applyImmersiveGalgameSystemBodyFormat('foo foo', {
        enabled: true,
        pattern: 'foo',
        flags: 'g',
        replacement: 'bar',
        rules: [
            { pattern: 'bar', flags: 'g', replacement: 'baz' },
            { pattern: '', flags: 'g', replacement: 'ignored' },
        ],
    });
    assert.equal(ordered.formattedRaw, 'baz baz');
    assert.deepEqual(normalizeVirtualRegex({
        pattern: 'foo',
        flags: ' g ',
        rules: [{ pattern: 'bar', flags: ' i ', replacement: 2 }, null],
    }).rules, [
        { pattern: 'bar', flags: 'i', replacement: '2' },
        { pattern: '', flags: '', replacement: '' },
    ]);
});

test('gate:scene:settings:set-path-writes-virtual-regex-array-items', async () => {
    const { setPath } = await import('../src/visual/igs-ui/settings-normalize.js');
    const target = { bridge: { virtualRegex: { rules: [{}] } } };
    setPath(target, 'bridge.virtualRegex.rules.0.pattern', 'foo');
    setPath(target, 'bridge.virtualRegex.rules.0.flags', 'g');
    setPath(target, 'bridge.virtualRegex.rules.0.replacement', 'bar');
    assert.ok(Array.isArray(target.bridge.virtualRegex.rules));
    assert.deepEqual(target.bridge.virtualRegex.rules[0], { pattern: 'foo', flags: 'g', replacement: 'bar' });
});


test('gate:igs-ui:reader-host-skips-empty-dialogue-pages', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9',
            bridge: { openMode: 'pc', sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerMode: 'pc', readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });
    const opened = host.openReader({
        message: { text: '<content>[igs-char:小林海斗|平静|你好。]</content>' },
        textSegments: ['[小林海斗]：你好。', '  ', '\u2063\u2062\u2063', '\u2064\u2060', '\u2061', '\u200c', '\u200b', '[小林海斗]：\u2060\u2064', '[小林海斗]： ', '[小林海斗]：「」', '[小林海斗]：👩\u200d👩\u200d👧\u200d👦', '[小林海斗]：再见。'],
    }, { mode: 'pc' });
    assert.deepEqual(opened.snapshot.content.segments, ['[小林海斗]：你好。', '[小林海斗]：👩\u200d👩\u200d👧\u200d👦', '[小林海斗]：再见。']);
    assert.equal(opened.snapshot.content.progress.includes('/ 3'), true);
    host.destroy();
});

test('gate:igs-ui:reader-host-strips-quotes-from-ai-char-directive', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.4.9', bridge: { openMode: 'pc', sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerMode: 'pc', readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });
    const opened = host.openReader({
        message: { text: '\u2063\u2062\u2063[igs-char:哪吒|震怒|「喂……开什么玩笑？！小爷的身体到底怎么了！」]' },
    }, { mode: 'pc' });
    assert.equal(opened.snapshot.content.speaker, '哪吒');
    assert.equal(opened.snapshot.content.textType, 'dialogue');
    assert.equal(opened.snapshot.content.segments.length, 1);
    assert.equal(opened.snapshot.content.displayText, '喂……开什么玩笑？！小爷的身体到底怎么了！');
    host.destroy();
});

test('gate:scene:igs-message-source:extracts-scene-directives-from-fallback-text', () => {
    const payload = buildIgsTextPayload({
        text: '[igs-scene:B班教室|下午|晴天]\n[igs-char:小林海斗|平静|できるもん！]',
    }, {
        sceneAssets: { enabled: true },
    });

    assert.equal(payload.sceneDirectives.length, 2);
    assert.equal(payload.sceneDirectives[0].type, 'scene');
    assert.equal(payload.sceneDirectives[0].scene, 'B班教室');
    assert.equal(payload.sceneDirectives[1].type, 'char');
    assert.equal(payload.sceneDirectives[1].character, '小林海斗');
    assert.equal(payload.sceneDirectives[1].mood, '平静');
});

test('gate:igs-ui:reader-host-skips-empty-scene-text-and-falls-back-to-readable-text', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.3.20',
            bridge: { openMode: 'pc', showToasts: true },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        messageId: 99,
        scene: {
            speaker: '艾莉',
            text: '',
        },
        formattedText: '可读正文',
    }, { mode: 'pc' });

    assert.equal(opened.ok, true);
    assert.equal(opened.snapshot.content.text, '可读正文');
    assert.equal(opened.snapshot.content.displayText, '艾莉: 可读正文');
    host.destroy();
});

test('gate:igs-ui:reader-host-keeps-one-line-multi-sentence-on-a-single-page', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.3.20',
            bridge: { openMode: 'pc', showToasts: true },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        messageId: 100,
        scene: {
            speaker: '艾莉',
            text: '第一句。 第二句。',
        },
    }, { mode: 'pc' });

    assert.equal(opened.ok, true);
    assert.deepEqual(opened.snapshot.content.segments, ['第一句。 第二句。']);
    assert.equal(opened.snapshot.content.progress, '1 / 1');
    host.destroy();
});

test('gate:igs-ui:reader-host-splits-single-newline-paragraphs-into-multiple-pages', () => {
    const host = createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            version: '0.3.20',
            bridge: { openMode: 'pc', showToasts: true },
            readerMode: 'pc',
            readerSettings: {},
        }),
        saveUnifiedSettings: () => ({ ok: true, legacy: {}, unified: {} }),
    });

    const opened = host.openReader({
        messageId: 101,
        scene: {
            speaker: '艾莉',
            text: '第一段。\n第二段。',
        },
    }, { mode: 'pc' });

    assert.equal(opened.ok, true);
    assert.deepEqual(opened.snapshot.content.segments, ['第一段。', '第二段。']);
    assert.equal(opened.snapshot.content.progress, '1 / 2');
    host.destroy();
});

test('gate:scene:igs-message-source:clean-narrative-source-strips-host-ui-tags', () => {
    const cleaned = cleanNarrativeSource(readJson('fixtures/tavern/host-ui-leak-message.json').text);

    assert.equal(cleaned.includes('<div'), false);
    assert.equal(cleaned.includes('<button'), false);
    assert.equal(cleaned.includes('API Connections'), true);
});

test('gate:visual:generated image scene selects generated-first mode', () => {
    const mode = resolveVisualMode({ generatedImage: { value: 'placeholder://image' } });
    assert.equal(mode, VISUAL_MODES.GENERATED_FIRST);
});

test('gate:visual-reader-state:normalizes-settings', () => {
    const fixture = {
        mode: 'web',
        isMobile: true,
        viewport: { width: 844, height: 390 },
        readerSettings: {
            fontSize: 15,
            toolbarPlacement: 'bottom-right',
            toolbarDirection: 'auto',
            showAvatar: true,
        },
    };

    const state = createReaderState(fixture);
    assert.equal(state.layout, 'mobile-landscape');
    assert.equal(state.toolbarLayout, 'vertical');
    assert.equal(state.toolbarPlacement, 'bottom-right');
    assert.equal(state.avatarVisible, true);
    assert.equal(state.cssVars['--igs-dialogue-font-size'], '15px');
    assert.equal(state.attributes['data-igs-dialogue-style'], 'panel');
});

test('gate:visual-responsive-layout:desktop-portrait-landscape', () => {
    assert.equal(getResponsiveLayout({ width: 1280, height: 720 }, { mode: 'pc' }), 'desktop');
    assert.equal(getResponsiveLayout({ width: 390, height: 844 }, { mode: 'web', isMobile: true }), 'mobile-portrait');
    assert.equal(getResponsiveLayout({ width: 844, height: 390 }, { mode: 'fullscreen', isMobile: true }), 'mobile-landscape');
});

test('gate:visual-stage-model:exposes-stable-stage-shape', () => {
    const readerState = createReaderState({
        mode: 'pc',
        viewport: { width: 1280, height: 720 },
        readerSettings: { fontSize: 18, toolbarDirection: 'horizontal' },
    });
    const stage = createStageModel({
        speaker: '艾莉',
        text: '我们到了。',
        background: { id: 'bg.library' },
        character: { id: 'char.eli.smile' },
        visualMode: 'background-character',
    }, readerState);

    assert.equal(stage.type, 'igs-stage-model');
    assert.equal(stage.layers.background.visible, true);
    assert.equal(stage.layers.generated.visible, false);
    assert.equal(stage.layers.dialogue.text, '我们到了。');
    assert.equal(stage.layers.hud.toolbar.layout, 'horizontal');
});

test('gate:prompts:nai request builder renders prompt context', () => {
    const adapter = createPromptAdapter({ nai: naiRequestBuilder });
    const context = adapter.createPromptContext({ speaker: '艾莉', location: '图书馆' });
    const result = adapter.buildRequest(
        'nai',
        context,
        { data: { prompt: '{{speaker}} in {{location}}', negativePrompt: 'low quality' } },
        { data: { model: 'nai-diffusion-test' } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.request.prompt, '艾莉 in 图书馆');
    assert.equal(result.request.model, 'nai-diffusion-test');
});

test('gate:api:public api attaches stable global aliases', async () => {
    const globalObject = {};
    const api = createPublicApi({
        version: '0.3.20',
        refresh: async () => ({ ok: true }),
        typeAndSend: async () => ({ ok: true }),
        getState: () => ({ config: { mode: 'test' } }),
        destroy: () => ({ ok: true }),
    });

    attachPublicApi(globalObject, api);
    assert.equal(globalObject.IGS, api);
    assert.equal(globalObject.ImmersiveGalgameSystem, api);
    assert.equal(api.api.imageProviders.register({ id: 'provider.fake' }).ok, true);
    assert.equal(api.api.imageProviders.list().length, 1);
    assert.equal(api.api.textFilterPresets.register(readJson('fixtures/text/text-filter-preset.json')).ok, true);
    assert.equal(typeof api.api.textFilterPresets.setCurrent, 'function');
    assert.equal(api.api.textFilterPresets.setCurrent('preset.text-filter.content-only').ok, true);
    assert.equal(api.api.textFilterPresets.getCurrent().id, 'preset.text-filter.content-only');
    assert.equal(api.api.textFilterPresets.exportAll().type, 'igs-import-bundle');
    assert.equal(api.ensureMagicWandEntry().reason, 'magic-wand-entry-not-mounted');
});

test('gate:host:tavern-helper-adapter-detects-user-messages-from-role-flags-and-dom', async () => {
    const domUserMessage = {
        getAttribute(name) {
            if (name === 'is_user') return 'true';
            return null;
        },
    };
    const messages = [
        { id: 1, text: '玩家发言', role: 'user' },
        { id: 2, text: '玩家发言 2', is_user: 'true' },
        { id: 3, text: '玩家发言 3', element: domUserMessage },
        { id: 4, text: '旁白发言' },
    ];
    const adapter = createTavernHelperAdapter({
        TavernHelper: {
            getLastMessageId: () => 4,
            getChatMessages: () => messages,
        },
        document: {
            querySelectorAll: () => [],
        },
    });

    const normalized = await adapter.listMessages();

    assert.equal(normalized[0].isUser, true);
    assert.equal(normalized[1].isUser, true);
    assert.equal(normalized[2].isUser, true);
    assert.equal(normalized[3].isUser, false);
});

test('gate:generated-images:image-api-client-fetch-models-parses-nested-payload', async () => {
    const calls = [];
    const result = await fetchImageModels({
        endpoint: 'https://example.com/v1',
        apiKey: 'demo-token',
    }, {
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            return new Response(JSON.stringify({
                data: [
                    { id: 'nai-diffusion-3' },
                    { name: 'nai-diffusion-4-curated-preview' },
                ],
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        },
    });

    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.deepEqual(result.models, ['nai-diffusion-3', 'nai-diffusion-4-curated-preview']);
    assert.equal(calls[0].url, 'https://example.com/v1/models');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer demo-token');
});

test('gate:generated-images:image-api-client-generates-and-polls-pending-task', async () => {
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Zq4cAAAAASUVORK5CYII=';
    const calls = [];
    const result = await generateImageFromApi({
        prompt: 'moon lake',
    }, {
        endpoint: 'https://example.com/v1',
        apiKey: 'demo-token',
        mode: 'nai',
        pollIntervalMs: 1,
        pollAttempts: 2,
    }, {
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            if (String(url).endsWith('/images/generations')) {
                return new Response(JSON.stringify({
                    status: 'pending',
                    status_url: '/tasks/1',
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(JSON.stringify({
                data: [
                    { b64_json: base64Image },
                ],
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
    });

    assert.ok(result.url.startsWith('data:image/png;base64,'));
    assert.equal(calls[0].url, 'https://example.com/v1/images/generations');
    assert.equal(calls[1].url, 'https://example.com/tasks/1');
});

test('gate:generated-images:image-api-client-parses-zip-image-response', async () => {
    const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f0005fe02fea57d7fa60000000049454e44ae426082', 'hex');
    const zipBytes = buildStoredZip('scene.png', pngBytes);
    const result = await generateImageFromApi({
        prompt: 'zip image',
    }, {
        endpoint: 'https://example.com/v1',
        mode: 'nai',
    }, {
        fetch: async () => new Response(zipBytes, {
            status: 200,
            headers: { 'content-type': 'application/zip' },
        }),
    });

    assert.ok(result.url.startsWith('data:image/png;base64,'));
});

test('gate:generated-images:reader-image-service-prefers-slot-binding-over-scan-order', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.slot-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [{
                        url: 'https://example.com/slot-3.png',
                        slotIndex: 2,
                    }];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 77,
        message: { id: 77, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 2,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.count, 6);
    assert.equal(imageState.currentIndex, 2);
    assert.equal(imageState.displayUrl, 'https://example.com/slot-3.png');
    assert.equal(imageState.slots[2].url, 'https://example.com/slot-3.png');
    assert.equal(imageState.slots.filter((slot) => slot.url).length, 1);
    assert.equal(imageState.unboundImages.length, 0);
});

test('gate:generated-images:reader-image-service-keeps-single-unnumbered-image-unbound-with-image-tags', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.unnumbered-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [{
                        url: 'https://example.com/latest-visible-image.png',
                    }];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 80,
        message: { id: 80, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.count, 6);
    assert.equal(imageState.currentIndex, 0);
    assert.equal(imageState.currentUrl, '');
    assert.equal(imageState.displayUrl, '');
    assert.equal(imageState.boundCount, 0);
    assert.equal(imageState.unboundCount, 1);
    assert.equal(imageState.availableCount, 1);
    assert.equal(imageState.slots.filter((slot) => slot.url).length, 0);
    assert.equal(imageState.unboundImages[0].url, 'https://example.com/latest-visible-image.png');
});

test('gate:generated-images:reader-image-service-orders-multiple-unkeyed-provider-images-into-slots', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.unkeyed-multi-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [
                        { url: 'https://example.com/chami-a.png', order: 1 },
                        { url: 'https://example.com/chami-b.png', order: 2 },
                    ];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 81,
        message: { id: 81, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.boundCount, 2);
    assert.equal(imageState.slots[0].url, 'https://example.com/chami-a.png');
    assert.equal(imageState.slots[1].url, 'https://example.com/chami-b.png');
    assert.equal(imageState.unboundCount, 0);
});

test('gate:generated-images:reader-image-service-does-not-show-later-slot-on-first-segment', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const service = createReaderImageService({
        providers: [
            {
                id: 'test.slot-provider',
                async detect() {
                    return true;
                },
                extractImages() {
                    return [{
                        url: 'https://example.com/slot-6.png',
                        slotIndex: 5,
                    }];
                },
            },
        ],
    });

    const imageState = await service.collect({
        messageId: 78,
        message: { id: 78, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.count, 6);
    assert.equal(imageState.currentIndex, 0);
    assert.equal(imageState.currentUrl, '');
    assert.equal(imageState.displayUrl, '');
    assert.equal(imageState.slots[5].url, 'https://example.com/slot-6.png');
});

test('gate:generated-images:reader-image-service-keeps-global-generic-images-out-when-message-scope-is-required', async () => {
    const source = readText('fixtures/igs/image-slot-binding-message.txt');
    const payload = buildIgsTextPayload({ text: source }, {
        sourceFilter: DEFAULT_SOURCE_FILTER,
    });
    const leakedImage = createFakeImageNode('https://example.com/role-card.png');
    const globalDocument = {
        querySelectorAll(selector) {
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
                return [leakedImage];
            }
            return [];
        },
    };
    const service = createReaderImageService({
        global: {
            document: globalDocument,
        },
    });

    const imageState = await service.collect({
        messageId: 79,
        message: { id: 79, text: source },
        imageSlots: payload.imageSlots,
        preferredImageIndex: 0,
    });

    assert.equal(imageState.ok, true);
    assert.equal(imageState.scopeKind, 'message');
    assert.equal(imageState.scopeOk, false);
    assert.equal(imageState.reason, 'message-scope-not-found');
    assert.equal(imageState.currentUrl, '');
    assert.equal(imageState.displayUrl, '');
    assert.equal(imageState.unboundImages.length, 0);
    assert.equal(imageState.diagnostics.providerCounts.generic, 0);
});

test('gate:host:ensure-message-image-placeholders-reuses-owned-placeholder', () => {
    const mesText = createTestMesTextRoot();
    const message = {
        element: {
            getAttribute() {
                return null;
            },
            querySelector(selector) {
                return selector === '.mes_text' ? mesText : null;
            },
        },
    };
    const slots = [
        { rawBlock: '<image>[图 1]\nimage###one###</image>' },
        { rawBlock: '<image>[图 2]\nimage###two###</image>' },
    ];

    const first = ensureMessageImagePlaceholders(message, slots);
    const second = ensureMessageImagePlaceholders(message, slots);

    assert.equal(first.ok, true);
    assert.equal(first.reason, 'placeholder-injected');
    assert.equal(second.ok, true);
    assert.equal(second.reason, 'placeholder-present');
    assert.equal(mesText.children.length, 2);
    assert.equal(mesText.children[0].getAttribute('data-igs-image-placeholder'), '1');
    assert.equal(mesText.children[0].getAttribute('data-igs-image-slot'), '0');
    assert.equal(mesText.children[1].getAttribute('data-igs-image-slot'), '1');
    assert.match(mesText.children[0].textContent, /image###one###/);
    assert.match(mesText.children[1].textContent, /image###two###/);
});

test('gate:host:tavern-helper-adapter-uses-hide-state-fallback-for-hidden-messages', async () => {
    const messages = [
        { id: 0, text: '玩家', role: 'user' },
        { id: 1, text: '隐藏楼层' },
        { id: 2, text: '可见楼层' },
    ];
    const adapter = createTavernHelperAdapter({
        TavernHelper: {
            getLastMessageId: () => 2,
            getChatMessages(_range, options = {}) {
                if (options.hide_state === 'hidden') {
                    return [{ message_id: 1 }];
                }
                return messages;
            },
        },
        document: {
            querySelectorAll: () => [],
        },
    });

    const normalized = await adapter.listMessages();
    const current = await adapter.getCurrentMessage();

    assert.equal(normalized[1].isHidden, true);
    assert.equal(current.id, 2);
});

test('gate:host:tavern-helper-adapter-falls-back-to-sillytavern-context-chat', async () => {
    const adapter = createTavernHelperAdapter({
        SillyTavern: {
            getContext() {
                return {
                    chat: [
                        { mes: '玩家发言', is_user: true },
                        { mes: '第一条 AI 楼层' },
                        { mes: '隐藏楼层', is_hidden: true },
                        { mes: '第二条 AI 楼层' },
                    ],
                };
            },
        },
        document: {
            querySelectorAll: () => [],
        },
    });

    const current = await adapter.getCurrentMessage();
    const hidden = await adapter.getMessageById(2);

    assert.equal(current.id, 3);
    assert.equal(current.text, '第二条 AI 楼层');
    assert.equal(hidden.isHidden, true);
});

test('gate:host:tavern-helper-adapter-fills-host-input-without-sending', async () => {
    const events = [];
    let clicks = 0;
    const textarea = {
        tagName: 'TEXTAREA',
        value: '',
        focus() { this.focused = true; },
        dispatchEvent(event) { events.push(event.type); return true; },
    };
    const doc = {
        querySelector(selector) {
            if (selector === '#send_textarea') return textarea;
            if (selector === '#send_but') return { click() { clicks += 1; } };
            return null;
        },
        querySelectorAll: () => [],
    };
    const adapter = createTavernHelperAdapter({
        TavernHelper: { triggerSlash: () => {} },
        document: doc,
    });

    const result = await adapter.setInputText('填入酒馆输入框');

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'host-dom-fill');
    assert.equal(textarea.value, '填入酒馆输入框');
    assert.equal(textarea.focused, true);
    assert.equal(clicks, 0);
    assert.ok(events.includes('input'));
});

test('gate:host:tavern-helper-adapter-type-and-send-falls-back-to-host-dom', async () => {
    const events = [];
    let sentValue = null;
    const textarea = {
        tagName: 'TEXTAREA',
        value: '',
        dispatchEvent(event) { events.push(event.type); return true; },
    };
    const sendButton = {
        click() { sentValue = textarea.value; },
    };
    const doc = {
        querySelector(selector) {
            if (selector === '#send_textarea') return textarea;
            if (selector === '#send_but') return sendButton;
            return null;
        },
        querySelectorAll: () => [],
    };
    const adapter = createTavernHelperAdapter({
        TavernHelper: { triggerSlash: () => {} },
        document: doc,
    });

    const result = await adapter.typeAndSend('选择：继续调查');

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'host-dom-send');
    assert.equal(sentValue, '选择：继续调查');
    assert.ok(events.includes('input'));
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

test('gate:choices:option-table finds 同名表 and extracts text column', () => {
    const tables = [
        { uid: 'sheet_1', name: '主角信息表', columns: ['row_id', '名称'], rows: [['1', '望月']] },
        { uid: 'sheet_2', name: '选项表', columns: ['row_id', '选项内容'], rows: [['1', '报警'], ['2', '找工具'], ['3', '报警'], ['4', '']] },
    ];
    const table = findOptionTable(tables);
    assert.ok(table);
    assert.equal(table.name, '选项表');
    const items = extractOptionTexts(table);
    // 跳过 row_id 列、去空、去重（两个"报警"只保留一个）；返回 {display,send} 对象
    assert.deepEqual(items, [{ display: '报警', send: '报警' }, { display: '找工具', send: '找工具' }]);
});

test('gate:choices:option-table extracts wide option rows', () => {
    const table = {
        uid: 'sheet_2',
        name: '选项表',
        columns: ['row_id', '选项一', '选项二', '选项三', '选项四'],
        rows: [['1', '报警', '找工具', '原地等待', '离开']],
    };
    assert.deepEqual(extractOptionTexts(table), [
        { display: '报警', send: '报警' },
        { display: '找工具', send: '找工具' },
        { display: '原地等待', send: '原地等待' },
        { display: '离开', send: '离开' },
    ]);
});

test('gate:choices:option-table 检定建议表 only extracts 展示文本 column', () => {
    const table = {
        uid: 'sheet_3',
        name: '检定建议表',
        columns: ['row_id', '展示文本', '对抗', '角色', '属性'],
        rows: [
            ['1', '力量对抗试试看', '对抗', '哪吒', '力量'],
            ['2', '用话术周旋', '对抗', '白墨', '话术'],
        ],
    };
    // 多业务字段表只取「展示文本」列，display===send（无骰子命令列）。
    assert.deepEqual(extractOptionTexts(table), [
        { display: '力量对抗试试看', send: '力量对抗试试看' },
        { display: '用话术周旋', send: '用话术周旋' },
    ]);
});

test('gate:choices:option-table 检定建议表 appends 骰子命令 to send', () => {
    const table = {
        uid: 'sheet_4',
        name: '检定建议表',
        columns: ['row_id', '展示文本', '骰子命令'],
        rows: [
            ['1', '力量对抗试试看', '对抗 哪吒 力量 vs 白墨 力量'],
            ['2', '用话术周旋', '检定 白墨 话术 [难度=困难]'],
            ['3', '静观其变', ''],
        ],
    };
    // 有骰子命令列时 send = 展示文本 + 空格 + 骰子命令；骰子命令为空时 send===display。
    assert.deepEqual(extractOptionTexts(table), [
        { display: '力量对抗试试看', send: '力量对抗试试看 对抗 哪吒 力量 vs 白墨 力量', dice: '对抗 哪吒 力量 vs 白墨 力量' },
        { display: '用话术周旋', send: '用话术周旋 检定 白墨 话术 [难度=困难]', dice: '检定 白墨 话术 [难度=困难]' },
        { display: '静观其变', send: '静观其变', dice: '' },
    ]);
});

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

test('gate:choices:dice parses 检定/对抗/必成/必败/无 with bracketed params', () => {
    assert.deepEqual(parseDiceCommand('检定 <user> 照顾'), { kind: 'check', name: '<user>', attribute: '照顾', difficulty: 0, bonus: 0, penalty: 0 });
    assert.deepEqual(parseDiceCommand('检定 白墨 话术 [难度=困难]'), { kind: 'check', name: '白墨', attribute: '话术', difficulty: 1, bonus: 0, penalty: 0 });
    assert.deepEqual(parseDiceCommand('检定：<user> 话术 奖惩=惩罚1'), { kind: 'check', name: '<user>', attribute: '话术', difficulty: 0, bonus: 0, penalty: 1 });
    assert.deepEqual(parseDiceCommand('检定　<user>　沟通　难度=极难　奖惩=奖励2'), { kind: 'check', name: '<user>', attribute: '沟通', difficulty: 2, bonus: 2, penalty: 0 });
    const contest = parseDiceCommand('对抗 <user> 理智 VS 林夏 察言观色');
    assert.equal(contest.kind, 'contest');
    assert.deepEqual(contest.left, { name: '<user>', attribute: '理智' });
    assert.deepEqual(contest.right, { name: '林夏', attribute: '察言观色' });
    assert.equal(contest.tieRule, 'initiator_lose');
    assert.deepEqual(parseDiceCommand('必成'), { kind: 'fixed', success: true });
    assert.deepEqual(parseDiceCommand('必败'), { kind: 'fixed', success: false });
    assert.deepEqual(parseDiceCommand('无'), { kind: 'none' });
    assert.equal(parseDiceCommand('检定 <user>').kind, 'invalid');
    assert.equal(parseDiceCommand('对抗 <user> 理智 vs 她').kind, 'invalid');
    assert.equal(parseDiceCommand('随便写的').kind, 'invalid');
});

test('gate:choices:dice success levels match AcuDice d100 tiers', () => {
    assert.equal(successLevel(3, 60).name, '大成功');
    assert.equal(successLevel(12, 60).name, '极难成功');
    assert.equal(successLevel(30, 60).name, '困难成功');
    assert.equal(successLevel(60, 60).name, '普通成功');
    assert.equal(successLevel(61, 60).name, '失败');
    assert.equal(successLevel(96, 90).name, '大失败');
});

test('gate:choices:dice bonus/penalty dice pick min/max tens', () => {
    // unit=7，十位依次 2、5 → 27 / 57
    const seq = (values) => { const q = [...values]; return () => q.shift() / 10; };
    assert.deepEqual(rollD100({ bonus: 1 }, seq([7, 2, 5])), { value: 27, totals: [27, 57] });
    assert.deepEqual(rollD100({ penalty: 1 }, seq([7, 2, 5])), { value: 57, totals: [27, 57] });
    assert.deepEqual(rollD100({}, seq([0, 0])), { value: 100, totals: [100] });
});

test('gate:choices:dice normal check rolls through AcuDice and applies difficulty', async () => {
    const acu = createAcuDiceMock({ '<user>.沟通': 60 }, [40]);
    const result = await resolveDiceCommand('检定 <user> 沟通 难度=困难', acu, { userName: '陈屿' });
    assert.equal(result.ok, true);
    assert.equal(result.success, false);
    assert.equal(result.line, '元叙事：陈屿发起了【沟通】检定，1d100=40，需≤30，【失败（普通成功，未达困难）】。');
    assert.deepEqual(acu.calls[1], ['checkByCharacter', { name: '<user>', attribute: '沟通', diceType: '1d100', successCriteria: 'lte' }]);

    const easy = await resolveDiceCommand('检定 <user> 沟通', createAcuDiceMock({ '<user>.沟通': 60 }, [25]), { userName: '陈屿' });
    assert.equal(easy.success, true);
    assert.match(easy.line, /1d100=25，需≤60，【困难成功】/);
});

test('gate:choices:dice 奖惩 uses AcuDice attribute but local roll', async () => {
    const acu = createAcuDiceMock({ '<user>.话术': 50 });
    const seq = [0.7, 0.2, 0.5];
    const result = await resolveDiceCommand('检定 <user> 话术 奖惩=惩罚1', acu, { random: () => seq.shift(), userName: '陈屿' });
    assert.equal(result.ok, true);
    assert.match(result.line, /1d100\(惩罚骰1\)=57，需≤50，【失败】/);
    assert.equal(acu.calls.some((call) => call[0] === 'checkByCharacter'), false);
});

test('gate:choices:dice contest compares tiers through AcuDice', async () => {
    const acu = createAcuDiceMock({ '<user>.理智': 44, '林夏.察言观色': 70 }, [38, 12]);
    const result = await resolveDiceCommand('对抗 <user> 理智 vs 林夏 察言观色', acu, { userName: '陈屿' });
    assert.equal(result.ok, true);
    assert.equal(result.winner, 'right');
    assert.equal(result.line, '元叙事：陈屿以【理智】对抗林夏的【察言观色】，1d100=38/12，目标=44/70，结果：林夏胜出（普通成功 vs 极难成功）。');
    assert.equal(acu.calls.find((call) => call[0] === 'contest')[1].rule, 'initiator_lose');
});

test('gate:choices:dice fixed/none/missing data never fabricate rolls', async () => {
    assert.deepEqual(await resolveDiceCommand('必成', null), { ok: true, success: true, line: '元叙事：无需投骰，【必定成功】。' });
    assert.deepEqual(await resolveDiceCommand('无', null), { ok: true, line: '' });
    assert.deepEqual(await resolveDiceCommand('检定 <user> 照顾', null), { ok: false, reason: '骰子系统未就绪' });
    const missing = await resolveDiceCommand('检定 林夏 厨艺', createAcuDiceMock({}), {});
    assert.equal(missing.ok, false);
    assert.match(missing.reason, /未找到 林夏 的属性「厨艺」/);
    assert.equal((await resolveDiceCommand('乱写', createAcuDiceMock({}))).ok, false);
});

test('gate:choices:dice formats message like AcuDice and finds it on top window', () => {
    assert.equal(formatCheckMessage('把伞往她那边偏了一点', '元叙事：X'), '把伞往她那边偏了一点。 <meta:检定结果>\n元叙事：X\n</meta:检定结果>');
    assert.equal(formatCheckMessage('静观其变！', ''), '静观其变！');
    const acu = createAcuDiceMock({});
    assert.equal(findAcuDice({ top: { AcuDice: acu } }), acu);
    assert.equal(findAcuDice({ AcuDice: { getAttributeValue() {} } }), null);
    const crossOrigin = {};
    Object.defineProperty(crossOrigin, 'top', { get() { throw new Error('SecurityError'); } });
    assert.equal(findAcuDice(crossOrigin), null);
});

test('gate:scene:tag filters match CJK-named tags such as meta:检定结果', () => {
    const payload = buildIgsTextPayload('<content>正文<meta:检定结果>\n骰点\n</meta:检定结果>结束</content>', {
        sourceFilter: { textIncludeTags: 'content', textExcludeTags: 'meta:检定结果' },
    });
    assert.equal(payload.hasExcludedTextBlocks, true);
    assert.equal(payload.textSource, '正文结束');
});

test('gate:choices:option-table accepts 选项/行动选项 aliases', () => {
    assert.deepEqual(OPTION_TABLE_NAMES, ['选项', '选项表', '行动选项', '检定建议表']);
    for (const name of ['选项', '行动选项', '检定建议表']) {
        const t = findOptionTable([{ uid: 'sheet_1', name, columns: ['row_id', 'x'], rows: [['1', 'A']] }]);
        assert.ok(t, `应命中表名 ${name}`);
    }
    assert.equal(findOptionTable([{ uid: 'sheet_1', name: '其他表', columns: [], rows: [] }]), null);
});

test('gate:choices:readOptionItems returns empty when api/table missing', () => {
    assert.deepEqual(readOptionItems(null), []);
    const noApiClient = { readTables: () => ({ ok: false, reason: 'missing-api' }) };
    assert.deepEqual(readOptionItems(noApiClient), []);
    const noTableClient = { readTables: () => ({ ok: true, data: { sheet_1: { uid: 'sheet_1', name: '别的表', content: [['row_id']] } } }) };
    assert.deepEqual(readOptionItems(noTableClient), []);
});


import {
    STATUS_HUD_DEFAULTS,
    buildStatusHudModel,
    listStatusHudTables,
    normalizeStatusHudSettings,
    parseMetricCell,
    resolveStatusHudScale,
    resolveStatusHudLocationScale,
} from '../src/data/shujuku/status-hud-model.js';

test('gate:simulation:status-hud-settings-normalize-defaults-and-invalid', () => {
    assert.deepEqual(normalizeStatusHudSettings(null), { ...STATUS_HUD_DEFAULTS });
    const legacy = normalizeStatusHudSettings({ enabled: true, collapsed: true, size: 'huge', showEmotion: 'yes', avatarRadius: 'blob', background: 'solid', barColor: 'sepia', tables: 'nope' });
    const legacyWithBadVeil = normalizeStatusHudSettings({ nsfwVeilLevel: 'extreme' });
    assert.equal(legacy.enabled, true);
    assert.equal(legacy.collapsed, true);
    assert.equal(legacy.size, 'medium');
    assert.equal(legacy.showEmotion, true);
    assert.equal(legacy.showLocation, false);
    assert.equal(legacy.showLocationDetails, false);
    assert.equal(legacy.showSpriteOnNsfw, true);
    assert.equal(legacy.nsfwVeilLevel, 'medium');
    assert.equal(legacyWithBadVeil.nsfwVeilLevel, 'medium');
    assert.equal(legacy.dimSpriteOnNarration, true);
    assert.equal(legacy.avatarRadius, 'circle');
    assert.equal(legacy.background, 'none');
    assert.equal(legacy.barColor, 'color');
    assert.deepEqual(legacy.tables, []);
    assert.equal(normalizeStatusHudSettings({ showLocation: true }).showLocation, true);
    assert.equal(normalizeStatusHudSettings({ showLocationDetails: true }).showLocationDetails, true);
    assert.equal(normalizeStatusHudSettings({ collapsed: 'yes' }).collapsed, false);
    assert.equal(normalizeStatusHudSettings({ barColor: 'grayscale' }).barColor, 'grayscale');
});

test('gate:simulation:status-hud-table-selection-order-dedupe-and-listing', () => {
    const settings = normalizeStatusHudSettings({
        enabled: true,
        tables: [
            { uid: 'sheet_b', name: '角色数值表' },
            { uid: 'sheet_a', name: '任务表' },
            { uid: 'sheet_b', name: '重复项' },
            { name: '仅名称表' },
            { uid: '', name: '' },
        ],
    });
    assert.deepEqual(settings.tables.map((t) => t.uid || t.name), ['sheet_b', 'sheet_a', '仅名称表']);

    const listed = listStatusHudTables({
        ok: true,
        data: {
            sheet_b: { uid: 'sheet_b', name: '角色数值表', orderNo: 2, content: [['row_id', '姓名', '信任']] },
            sheet_a: { uid: 'sheet_a', name: '任务表', orderNo: 1, content: [['row_id', '任务名称', '进度']] },
        },
    });
    assert.deepEqual(listed.tables.map((t) => t.uid), ['sheet_a', 'sheet_b']);
    assert.equal(listStatusHudTables({ ok: false, reason: 'missing-api' }).ok, false);
});

test('gate:simulation:status-hud-table-picker-wires-actions-and-only-highlights-selected-table', () => {
    const html = tableMultiSelect(
        'readerSettings.statusHud.tables',
        [{ uid: 'sheet_stats', name: '角色数值表' }],
        [
            { uid: 'sheet_global', name: '全局状态表' },
            { uid: 'sheet_stats', name: '角色数值表' },
        ],
        { note: '仅读取勾选的表；留空则不读取任何表。' },
    );
    assert.match(html, /data-path="readerSettings\.statusHud\.tables"/);
    assert.match(html, /data-action="status-hud-toggle-table:sheet_global:%E5%85%A8%E5%B1%80%E7%8A%B6%E6%80%81%E8%A1%A8"[^>]*aria-pressed="false"/);
    assert.match(html, /class="igs-table-pick is-on"[^>]*data-action="status-hud-toggle-table:sheet_stats:%E8%A7%92%E8%89%B2%E6%95%B0%E5%80%BC%E8%A1%A8"[^>]*aria-pressed="true"/);
    assert.equal((html.match(/class="igs-table-pick is-on"/g) || []).length, 1);
    assert.match(html, /<em>仅读取勾选的表；留空则不读取任何表。<\/em>/);
});

test('gate:scene:character-assets-render-status-avatar-row', () => {
    const html = renderCharacterAssetList(
        { H: { 默认: '' } },
        { aliases: { H: [] }, moodGroups: [], statusAvatars: { H: 'data:image/png;base64,AAA' }, isOpen: () => true },
    );
    // 头像本身就是上传按钮；地址和清除在毛笔打开的「角色设定」里。
    assert.match(html, /<button type="button" class="igs-char-avatar" data-action="status-avatar-pick:H"/);
    assert.match(renderCharacterAssetList({ H: { 默认: '' } }, { statusAvatars: { H: 'x' } }), /^(?![\s\S]*status-avatar-url)/);
    assert.match(html, /class="igs-scene-url-input igs-status-avatar-url"[^>]*data-status-avatar-char="H"[^>]*value="data:image\/png;base64,AAA"/);
    assert.match(html, /data-action="status-avatar-pick:H"/);
    assert.match(html, /data-action="status-avatar-clear:H"/);
    assert.match(html, /class="igs-status-avatar-thumb"[^>]*src="data:image\/png;base64,AAA"/);
});

test('gate:scene:scene-assets-indent-without-horizontal-overflow', () => {
    const html = renderSceneAssetList({
        旧城: {
            url: '',
            times: {
                夜晚: { url: '', weathers: { 雨天: { url: '' } } },
            },
        },
    });
    assert.match(html, /class="igs-scene-char-group igs-scene-time-group"/);
    assert.match(html, /class="igs-btn-mgr-row igs-scene-mood-row igs-scene-weather-row"/);
    assert.doesNotMatch(html, /style="margin-left:(?:16|32)px"/);
});

test('gate:simulation:status-hud-metric-parsing-positive-and-negative', () => {
    assert.deepEqual(parseMetricCell('信任:72%', '信任'), [{ label: '信任', percent: 72, display: '72%' }]);
    assert.deepEqual(parseMetricCell('好感 54/100', '好感'), [{ label: '好感', percent: 54, display: '54/100' }]);
    const multi = parseMetricCell('信任:72%;好感:54%;了解:83%', '综合');
    assert.equal(multi.length, 3);
    assert.equal(multi[2].percent, 83);
    assert.equal(parseMetricCell('10:30', '时间'), null);
    assert.equal(parseMetricCell('2026-09-20', '日期'), null);
    assert.equal(parseMetricCell('3/4', '默认'), null);
    assert.equal(parseMetricCell('信任:300%', '信任'), null);
});

test('gate:simulation:status-hud-model-matches-alias-row-and-caps-at-four', () => {
    const model = buildStatusHudModel({
        settings: { enabled: true, size: 'medium', showEmotion: true, showLocation: true, avatarRadius: 'circle', background: 'none', tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
        sceneAssets: {
            characters: { '天之音': { default: '' } },
            characterAliases: { '天之音': ['天音'] },
            statusAvatars: { '天之音': 'data:image/png;base64,AAA' },
        },
        character: '天音',
        emotion: '紧张',
        location: '旧城',
        readResult: {
            ok: true,
            data: {
                sheet_stats: {
                    uid: 'sheet_stats',
                    name: '角色数值表',
                    orderNo: 1,
                    content: [
                        ['row_id', '姓名', '信任', '好感', '了解', '体力', '精神', '运气'],
                        ['1', '天音', '72%', '54/100', '了解:83%', '60%', '70%', '80%'],
                        ['2', '其它角色', '10%', '20%', '30%', '40%', '50%', '60%'],
                    ],
                },
            },
        },
    });
    assert.equal(model.character, '天之音');
    assert.equal(model.emotion, '紧张');
    assert.equal(model.location, '');
    assert.equal(model.time, '');
    assert.equal(model.weather, '');
    assert.equal(model.avatar, 'data:image/png;base64,AAA');
    assert.equal(model.barColor, 'color');
    assert.equal(model.metrics.length, 4);
    assert.equal(model.hiddenCount, 2);
    assert.equal(model.metrics[0].colorKey, 'trust');
    assert.equal(model.metrics[1].colorKey, 'like');
    assert.equal(model.metrics[2].colorKey, 'know');
    assert.equal(model.loadState, 'ready');
});

test('gate:hud:unregistered-character-still-shows-identity-and-emotion', () => {
    // 未在场景素材注册的角色：仍用原始名显示身份/情绪，只是取不到自定义头像。
    const model = buildStatusHudModel({
        settings: { enabled: true, showEmotion: true, showLocation: true },
        sceneAssets: { characters: {}, characterAliases: {}, statusAvatars: {} },
        character: '殷哪吒',
        emotion: '恼火',
        isNarration: false,
    });
    assert.equal(model.character, '殷哪吒');
    assert.equal(model.emotion, '恼火');
    assert.equal(model.avatar, '');
    assert.equal(model.enabled, true);
});

test('gate:hud:location-only-on-narration-without-character', () => {
    const base = {
        settings: { enabled: true, showEmotion: true, showLocation: true },
        sceneAssets: { characters: {}, characterAliases: {}, statusAvatars: {} },
        location: '艺术楼402教研室',
    };
    // 旁白页（无角色）显示地点栏。
    assert.equal(buildStatusHudModel({ ...base, character: '', isNarration: true }).location, '艺术楼402教研室');
    // 内心页与对白页同为角色页，不显示地点栏。
    assert.equal(buildStatusHudModel({ ...base, character: '殷哪吒', isNarration: true }).location, '');
    assert.equal(buildStatusHudModel({ ...base, character: '殷哪吒', isNarration: false }).location, '');
});


test('gate:simulation:status-hud-model-disabled-and-narration-do-not-inherit', () => {
    const disabled = buildStatusHudModel({ settings: { enabled: false }, sceneAssets: { characters: { A: {} } }, character: 'A', emotion: '喜' });
    assert.equal(disabled.enabled, false);
    assert.deepEqual(disabled.metrics, []);

    const narration = buildStatusHudModel({
        settings: { enabled: true, showLocation: true, showLocationDetails: true, tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
        sceneAssets: { characters: { A: {} }, statusAvatars: { A: 'https://example.com/a.png' } },
        character: '',
        emotion: '紧张',
        location: '旧城',
        time: '深夜',
        weather: '小雨',
        isNarration: true,
        readResult: { ok: true, data: {} },
    });
    assert.equal(narration.character, '');
    assert.equal(narration.emotion, '');
    assert.equal(narration.location, '旧城');
    assert.equal(narration.time, '深夜');
    assert.equal(narration.weather, '小雨');
    assert.equal(narration.showLocationDetails, true);
    assert.equal(narration.avatar, '');
});



test('gate:simulation:status-hud-sprite-toggles-defaults-and-normalize', () => {
    assert.equal(STATUS_HUD_DEFAULTS.showSpriteOnNsfw, true);
    assert.equal(STATUS_HUD_DEFAULTS.dimSpriteOnNarration, true);
    assert.equal(normalizeStatusHudSettings({}).showSpriteOnNsfw, true);
    assert.equal(normalizeStatusHudSettings({}).dimSpriteOnNarration, true);
    assert.equal(normalizeStatusHudSettings({ showSpriteOnNsfw: false }).showSpriteOnNsfw, false);
    assert.equal(normalizeStatusHudSettings({ dimSpriteOnNarration: true }).dimSpriteOnNarration, true);
    assert.equal(normalizeStatusHudSettings({ showSpriteOnNsfw: true }).showSpriteOnNsfw, true);
    assert.equal(normalizeStatusHudSettings({ showSpriteOnNsfw: 'no' }).showSpriteOnNsfw, true);
});

test('gate:simulation:status-hud-location-scale-tiers', () => {
    assert.equal(resolveStatusHudLocationScale('small'), 1.2);
    assert.equal(resolveStatusHudLocationScale('medium'), 1.45);
    assert.equal(resolveStatusHudLocationScale('large'), 1.7);
    assert.equal(resolveStatusHudLocationScale('huge'), 1.45);
    assert.equal(resolveStatusHudLocationScale(undefined), 1.45);
});


test('gate:simulation:status-hud-model-failure-is-diagnostic-not-zero', () => {
    const failed = buildStatusHudModel({
        settings: { enabled: true, tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
        sceneAssets: { characters: { A: {} }, statusAvatars: { A: 'https://example.com/a.png' } },
        character: 'A',
        emotion: '焦虑',
        readResult: { ok: false, reason: 'missing-api' },
    });
    assert.equal(failed.loadState, 'error');
    assert.deepEqual(failed.metrics, []);
    assert.equal(failed.loadReason, 'missing-api');
    assert.equal(failed.character, 'A');
    assert.equal(failed.emotion, '焦虑');
    assert.equal(failed.avatar, 'https://example.com/a.png');

    const missingRow = buildStatusHudModel({
        settings: { enabled: true, tables: [{ uid: 'sheet_stats', name: '角色数值表' }] },
        sceneAssets: { characters: { A: {} } },
        character: 'A',
        emotion: '平静',
        readResult: { ok: true, data: { sheet_stats: { uid: 'sheet_stats', name: '角色数值表', orderNo: 1, content: [['row_id', '姓名', '信任'], ['1', 'B', '50%']] } } },
    });
    assert.equal(missingRow.loadState, 'no-data');
    assert.deepEqual(missingRow.metrics, []);
    assert.equal(missingRow.character, 'A');
    assert.equal(missingRow.emotion, '平静');
    assert.equal(missingRow.avatar, '');
});

test('gate:simulation:status-hud-responsive-scale-is-clamped-and-ordered', () => {
    assert.ok(Math.abs(resolveStatusHudScale('small', 900, 600) - 0.688) < 1e-9);
    assert.ok(Math.abs(resolveStatusHudScale('medium', 900, 600) - 0.8) < 1e-9);
    assert.ok(Math.abs(resolveStatusHudScale('large', 900, 600) - 0.928) < 1e-9);
    assert.ok(resolveStatusHudScale('small', 900, 600) < resolveStatusHudScale('medium', 900, 600));
    assert.ok(resolveStatusHudScale('large', 900, 600) > resolveStatusHudScale('medium', 900, 600));
    assert.ok(Math.abs(resolveStatusHudScale('medium', 10, 10) - 0.624) < 1e-9);
    assert.ok(Math.abs(resolveStatusHudScale('large', 4000, 4000) - 1.024) < 1e-9);
});

test('gate:scene:status-avatar-lifecycle-upload-clear-rename-remove', async () => {
    const storage = createMemoryStorage();
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: {},
                characters: { '爱丽丝': { '平和': 'sprite' }, '白墨': { '默认': '' } },
                characterAliases: { '爱丽丝': ['爱丽'] },
                statusAvatars: { '爱丽丝': 'data:image/png;base64,AAA' },
            },
        },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: {
            global: {
                localStorage: storage,
                document: { createElement: () => ({ click() {}, set onchange(v) { this._on = v; } }) },
                prompt: (message, fallback) => (String(message || '').includes('重命名角色') ? '艾莉西亚' : fallback),
                alert: () => {},
            },
        },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };

    await handleSettingsAction('status-avatar-set-url:' + encodeURIComponent('白墨') + ':' + encodeURIComponent('https://example.com/avatar.png'), ctx);
    assert.equal(draft.bridge.sceneAssets.statusAvatars['白墨'], 'https://example.com/avatar.png');

    await handleSettingsAction('status-avatar-clear:' + encodeURIComponent('白墨'), ctx);
    assert.deepEqual(Object.keys(draft.bridge.sceneAssets.statusAvatars), ['爱丽丝']);

    await handleSettingsAction('status-avatar-clear:' + encodeURIComponent('爱丽丝'), ctx);
    assert.deepEqual(Object.keys(draft.bridge.sceneAssets.statusAvatars), []);

    await handleSettingsAction('scene-rename-char:' + encodeURIComponent('爱丽丝'), ctx);
    assert.equal(draft.bridge.sceneAssets.characters['艾莉西亚'] != null, true);
    assert.equal(draft.bridge.sceneAssets.characterAliases['艾莉西亚'][0], '爱丽');

    draft.bridge.sceneAssets.statusAvatars = { '白墨': 'data:image/png;base64,BBB' };
    await handleSettingsAction('scene-remove-char:' + encodeURIComponent('白墨'), ctx);
    assert.equal(draft.bridge.sceneAssets.characters['白墨'], undefined);
    assert.equal(draft.bridge.sceneAssets.statusAvatars['白墨'], undefined);
});

test('gate:scene:status-avatar-rename-migrates-avatar-key', async () => {
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: {},
                characters: { '爱丽丝': { '平和': 'sprite' } },
                characterAliases: { '爱丽丝': [] },
                statusAvatars: { '爱丽丝': 'data:image/png;base64,AAA' },
            },
        },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { prompt: (m, f) => '艾莉西亚', alert: () => {} } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    await handleSettingsAction('scene-rename-char:' + encodeURIComponent('爱丽丝'), ctx);
    assert.equal(draft.bridge.sceneAssets.statusAvatars['艾莉西亚'], 'data:image/png;base64,AAA');
    assert.equal(draft.bridge.sceneAssets.statusAvatars['爱丽丝'], undefined);
});

test('gate:igs-ui:gradient-veil-normalizes-values-and-shares-default-theme', () => {
    assert.equal(normalizeDialogSkin(DIALOG_SKIN_GRADIENT_VEIL), DIALOG_SKIN_GRADIENT_VEIL);
    assert.deepEqual(normalizeGradientVeil({
        color: 'invalid',
        heightPercent: -10,
        opacity: 2,
        speakerStyle: 'invalid',
    }), {
        color: '#000000',
        heightPercent: 20,
        opacity: 1,
        speakerStyle: 'default',
    });
    assert.deepEqual(normalizeGradientVeil({
        color: '#AABBCC',
        heightPercent: 70.4,
        opacity: '0.55',
        speakerStyle: 'plain-text',
    }), {
        color: '#aabbcc',
        heightPercent: 70,
        opacity: 0.55,
        speakerStyle: 'plain-text',
    });
    const theme = resolveActiveTheme({
        readerSettings: {
            dialogSkin: DIALOG_SKIN_GRADIENT_VEIL,
            _vnTheme: { preset: 'custom', textColor: '#abcdef' },
            classicVnTheme: { preset: 'custom', textColor: '#123456' },
        },
    });
    assert.equal(theme.textColor, '#abcdef');
});

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

test('gate:igs-scene-inheritance:reuses-latest-scene-tag-within-three-ai-floors', async () => {
    const floors = [
        { id: 0, text: '<content>[igs-scene:厢房|早晨|晴天]开场。</content>' },
        { id: 1, text: '<content>第二楼正文，没有场景标签。</content>' },
        { id: 2, text: '<content>第三楼正文，也没有场景标签。</content>' },
        { id: 3, text: '<content>第四楼正文，仍然没有场景标签。</content>' },
    ];
    const app = createSceneInheritanceApp(floors);
    const api = createIgsCompatApi(app);
    const result = await api.openViewerFromMessage(3, 'pc');
    assert.equal(result.ok, true);
    const inherited = app.captured.payload && app.captured.payload.inheritedSceneState;
    assert.ok(inherited, '三层内的最近场景标签应被继承');
    assert.equal(inherited.scene, '厢房');
    assert.equal(inherited.time, '早晨');
    assert.equal(inherited.weather, '晴天');
    assert.equal(inherited.inheritedFromMessageId, 0);
});

test('gate:igs-scene-inheritance:own-scene-tag-wins-over-inheritance', async () => {
    const floors = [
        { id: 0, text: '<content>[igs-scene:厢房|早晨|晴天]开场。</content>' },
        { id: 1, text: '<content>[igs-scene:花园|下午|阴天]本楼自己带了场景标签。</content>' },
    ];
    const app = createSceneInheritanceApp(floors);
    const api = createIgsCompatApi(app);
    const result = await api.openViewerFromMessage(1, 'pc');
    assert.equal(result.ok, true);
    // 始终计算追溯结果：标签之后的段落由消费点用本楼场景，
    // 这里的继承值供标签之前的段落回退。
    const inherited = app.captured.payload.inheritedSceneState;
    assert.ok(inherited, '本楼有标签时仍应计算追溯结果供楼内前段回退');
    assert.equal(inherited.scene, '厢房');
});

test('gate:igs-scene-inheritance:text-before-own-tag-falls-back-to-inherited-scene', async () => {
    // 「正文—标签—正文」楼层：标签前的段落没有本楼场景可归属，
    // 应能拿到上一楼的继承场景，不再黑屏。
    const floors = [
        { id: 0, text: '<content>[igs-scene:厢房|早晨|晴天]开场。</content>' },
        { id: 1, text: '<content>先写了一段正文。[igs-scene:花园|下午|阴天]然后才是标签后的正文。</content>' },
    ];
    const app = createSceneInheritanceApp(floors);
    const api = createIgsCompatApi(app);
    const result = await api.openViewerFromMessage(1, 'pc');
    assert.equal(result.ok, true);
    const payload = app.captured.payload;
    assert.ok(payload.sceneDirectives.some((d) => d.type === 'scene' && d.scene === '花园'),
        '本楼标签应正常解析');
    assert.equal(payload.inheritedSceneState.scene, '厢房');
    assert.equal(payload.inheritedSceneState.inheritedFromMessageId, 0);
});

test('gate:igs-scene-inheritance:does-not-reach-beyond-three-ai-floors', async () => {
    const floors = [
        { id: 0, text: '<content>[igs-scene:厢房|早晨|晴天]开场。</content>' },
        { id: 1, text: '<content>无标签一楼。</content>' },
        { id: 2, text: '<content>无标签二楼。</content>' },
        { id: 3, text: '<content>无标签三楼。</content>' },
        { id: 4, text: '<content>无标签四楼。</content>' },
    ];
    const app = createSceneInheritanceApp(floors);
    const api = createIgsCompatApi(app);
    const result = await api.openViewerFromMessage(4, 'pc');
    assert.equal(result.ok, true);
    assert.equal(app.captured.payload.inheritedSceneState, null);
});

test('gate:igs-ui:illustrated-dialog-skins-normalize-and-share-default-theme', () => {
    for (const skin of [DIALOG_SKIN_PLANT_COFFEE, DIALOG_SKIN_BLACK_WHITE_MANGA, DIALOG_SKIN_CUTE_PINK]) {
        assert.equal(normalizeDialogSkin(skin), skin);
        const theme = resolveActiveTheme({
            readerSettings: {
                dialogSkin: skin,
                _vnTheme: { preset: 'custom', textColor: '#abcdef', nameColor: '#123456' },
            },
        });
        assert.equal(theme.textColor, '#abcdef');
        assert.equal(theme.nameColor, '#123456');
    }
});


test('gate:igs-ui:reference-typography-applies-to-material-themes-only', () => {
    const expected = {
        'western-classic': { nameColor: '#2e2218', textColor: '#f2e5c4', nameAlign: 'center', textFont: /^"Source Han Serif CN"/, nameFont: /^"Cinzel"/ },
        'plant-coffee': { nameColor: '#f6ecd9', textColor: '#5b4643', nameAlign: 'center', textFont: /^"LXGW WenKai Lite"/, nameFont: /^"Quicksand"/ },
        'black-white-manga': { nameColor: '#171412', textColor: '#231f1c', nameAlign: 'left', textFont: /^"Source Han Sans CN"/, nameFont: /^"Smiley Sans"/ },
        'cute-pink': { nameColor: '#ffffff', textColor: '#5d3a4a', nameAlign: 'center', textFont: /^"Yozai"/, nameFont: /^"ZCOOL KuaiLe"/ },
        'retro-japanese': { nameColor: '#f6e6c4', textColor: '#2f2119', nameAlign: 'center', textFont: /^"LXGW WenKai"/, nameFont: /^"Huiwen Mincho"/ },
        'adventure-journey': { nameColor: '#f0dcb8', textColor: '#45372d', nameAlign: 'center', textFont: /^"LXGW Neo ZhiSong"/, nameFont: /^"Cinzel"/ },
        'day-minimal': { nameColor: '#f7f5ee', textColor: '#3a3935', nameAlign: 'left', textFont: /^"LXGW Neo XiHei"/, nameFont: /^"Cormorant Garamond"/ },
        'warm-picturebook': { nameColor: '#f4efe9', textColor: '#4f4a45', nameAlign: 'center', textFont: /^"LXGW WenKai"/, nameFont: /^"Yozai"/ },
        'elegant-european': { nameColor: '#ffffff', textColor: '#eeeaf3', nameAlign: 'left', textFont: /^"Source Han Serif CN"/, nameFont: /^"Great Vibes"/ },
    };
    for (const [skin, values] of Object.entries(expected)) {
        const theme = resolveActiveTheme({ readerSettings: { dialogSkin: skin } });
        assert.equal(theme.nameColor, values.nameColor);
        assert.equal(theme.textColor, values.textColor);
        assert.equal(theme.nameAlign, values.nameAlign);
        assert.match(theme.textFont, values.textFont);
        assert.match(theme.nameFont, values.nameFont);
    }
    const defaultTheme = resolveActiveTheme({ readerSettings: { dialogSkin: 'default' } });
    const veilTheme = resolveActiveTheme({ readerSettings: { dialogSkin: 'gradient-veil' } });
    assert.equal(defaultTheme.nameColor, '#ffeeb8');
    assert.equal(veilTheme.nameColor, '#ffeeb8');
});


test('character dna: normalize map rejects prototype keys and keeps only known fields', async () => {
    const { normalizeCharacterDnaMap } = await import('../src/scene/character-dna.js');
    assert.deepEqual(normalizeCharacterDnaMap(null), {});
    assert.deepEqual(normalizeCharacterDnaMap(['x']), {});
    const raw = JSON.parse('{"__proto__":{"identity":"x"},"爱丽丝":{"identity":"  银发 ","extra":1},"白墨":{}}');
    const map = normalizeCharacterDnaMap(raw);
    assert.deepEqual(Object.keys(map), ['爱丽丝', '白墨']);
    assert.deepEqual(map['爱丽丝'], { identity: '银发', defaultAppearance: '', negative: '', triggerWords: '' });
    assert.equal(Object.prototype.hasOwnProperty.call(map, '__proto__'), false);
    assert.equal({}.identity, undefined);
});

test('character dna: resolve via injected alias resolver, rename guard and remove', async () => {
    const { resolveCharacterDna, renameCharacterDna, removeCharacterDna } = await import('../src/scene/character-dna.js');
    const map = { 爱丽丝: { identity: '银发' }, 白墨: { identity: '黑发' } };
    const alias = (n) => (n === '爱丽' ? '爱丽丝' : n);
    assert.equal(resolveCharacterDna(map, '爱丽', alias).name, '爱丽丝');
    assert.equal(resolveCharacterDna(map, '爱丽', alias).dna.identity, '银发');
    assert.equal(resolveCharacterDna(map, '路人', alias), null);
    const blocked = renameCharacterDna(map, '爱丽丝', '白墨');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'name-exists');
    const renamed = renameCharacterDna(map, '爱丽丝', '艾莉西亚');
    assert.equal(renamed.ok, true);
    assert.deepEqual(Object.keys(renamed.map), ['艾莉西亚', '白墨']);
    assert.equal(renameCharacterDna(map, '爱丽丝', '__proto__').ok, false);
    assert.deepEqual(Object.keys(removeCharacterDna(map, '白墨')), ['爱丽丝']);
    assert.deepEqual(Object.keys(map), ['爱丽丝', '白墨']);
});

test('character dna: prompt tags keep weight groups, dedupe case-insensitively and follow fixed order', async () => {
    const { splitPromptTags, mergePromptTags, buildCharacterDnaPromptParts } = await import('../src/scene/character-dna.js');
    assert.deepEqual(splitPromptTags('(silver hair, long:1.2), blue eyes，smile\nsolo'), ['(silver hair, long:1.2)', 'blue eyes', 'smile', 'solo']);
    assert.equal(mergePromptTags('Blue Eyes, solo', 'blue  eyes, 1girl', ''), 'Blue Eyes, solo, 1girl');
    const dna = { triggerWords: 'alice_v2', identity: 'silver hair, blue eyes', defaultAppearance: 'school uniform', negative: 'glasses' };
    assert.deepEqual(buildCharacterDnaPromptParts(dna), { positive: 'alice_v2, silver hair, blue eyes', negative: 'glasses' });
    assert.equal(buildCharacterDnaPromptParts(dna, { includeDefaultAppearance: true }).positive, 'alice_v2, silver hair, blue eyes, school uniform');
    assert.deepEqual(buildCharacterDnaPromptParts({}), { positive: '', negative: '' });
});


test('gate:scene:character-dna-lifecycle', async () => {
    const storage = createMemoryStorage();
    const dnaAlice = { identity: 'silver hair', defaultAppearance: 'uniform', negative: 'glasses', triggerWords: 'alice_v2' };
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: {},
                characters: { '爱丽丝': { '平和': 'sprite-a' }, '白墨': { '平和': 'sprite-b' } },
                characterAliases: { '爱丽丝': ['爱丽'], '白墨': [] },
                characterDna: { '爱丽丝': dnaAlice, '白墨': { identity: 'black hair' }, '路人甲': { identity: 'brown hair' } },
                moodGroups: [],
            },
        },
        readerSettings: {},
    };
    const prompts = [];
    let alerts = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { scenePresetName: 'DNA预设', expandedSpriteSlots: new Set() } } },
        options: { global: { localStorage: storage, prompt: () => prompts.shift() || '', confirm: () => true, alert: () => { alerts += 1; } } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    const sa = () => draft.bridge.sceneAssets;

    prompts.push('艾莉西亚');
    await handleSettingsAction('scene-rename-char:' + encodeURIComponent('爱丽丝'), ctx);
    assert.equal(sa().characterDna['艾莉西亚'].identity, 'silver hair');
    assert.equal(sa().characterDna['爱丽丝'], undefined);
    assert.deepEqual(Object.keys(sa().characterDna), ['艾莉西亚', '白墨', '路人甲']);

    // 目标名已是 DNA-only 角色：阻止改名，角色与 DNA 均不变。
    const alertsBefore = alerts;
    prompts.push('路人甲');
    await handleSettingsAction('scene-rename-char:' + encodeURIComponent('白墨'), ctx);
    assert.equal(alerts, alertsBefore + 1);
    assert.ok(sa().characters['白墨']);
    assert.equal(sa().characters['路人甲'], undefined);
    assert.equal(sa().characterDna['路人甲'].identity, 'brown hair');
    assert.equal(sa().characterDna['白墨'].identity, 'black hair');

    await handleSettingsAction('scene-remove-char:' + encodeURIComponent('白墨'), ctx);
    assert.equal(sa().characterDna['白墨'], undefined);
    assert.equal(sa().characterDna['路人甲'].identity, 'brown hair');
});

test('gate:igs-ui:character-dna-editor-renders-escaped-name-and-values', async () => {
    const { renderCharacterAssetList, renderCharacterDnaEditor } = await import('../src/visual/igs-ui/settings-fields.js');
    const empty = renderCharacterDnaEditor('白墨', null);
    assert.ok(empty.includes('角色 DNA（未填写）'));
    assert.equal((empty.match(/data-dna-field="/g) || []).length, 4);
    // 角色卡上 DNA 平时只是名字旁的星星画笔（已填时高亮），点开才出编辑区。
    const closed = renderCharacterAssetList({ 'A.<b>': { '默认': '' } }, {
        characterDna: { 'A.<b>': { identity: 'silver hair', triggerWords: 'alice_v2' } },
    });
    assert.match(closed, /class="igs-btn-mgr-icon igs-char-dna-btn is-on" data-action="scene-toggle-dna:A.%3Cb%3E"[^>]*aria-expanded="false"/);
    assert.ok(!closed.includes('data-dna-field='));
    const html = renderCharacterAssetList({ 'A.<b>': { '默认': '' } }, {
        characterDna: { 'A.<b>': { identity: 'silver hair', triggerWords: 'alice_v2' } },
        isOpen: (key) => key === 'char-dna:A.<b>',
    });
    assert.ok(html.includes('aria-expanded="true"'));
    assert.ok(html.includes('data-dna-char="A.&lt;b&gt;"'));
    assert.ok(!html.includes('data-dna-char="A.<b>"'));
    assert.ok(html.includes('data-dna-field="identity" placeholder='));
    assert.ok(html.includes('>silver hair</textarea>'));
    assert.ok(html.includes('>alice_v2</textarea>'));
    assert.ok(!html.includes('角色 DNA（未填写）'));
    assert.ok(!/data-path="[^"]*characterDna/.test(html));
});


test('gate:scene:dna-only-character-add-rename-remove-and-list', async () => {
    const { renderDnaOnlyCharacterList } = await import('../src/visual/igs-ui/settings-fields.js');
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: {},
                characters: { '爱丽丝': { '平和': 'sprite-a' } },
                characterAliases: { '爱丽丝': ['爱丽'] },
                characterDna: { '爱丽丝': { identity: 'silver hair' } },
                moodGroups: [],
            },
        },
        readerSettings: {},
    };
    const prompts = [];
    let alerts = 0;
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { expandedSpriteSlots: new Set() } } },
        options: { global: { prompt: () => prompts.shift() || '', confirm: () => true, alert: () => { alerts += 1; } } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    const sa = () => draft.bridge.sceneAssets;

    prompts.push('路人甲');
    await handleSettingsAction('scene-add-dna-char', ctx);
    assert.deepEqual(sa().characterDna['路人甲'], { identity: '', defaultAppearance: '', negative: '', triggerWords: '' });
    assert.equal(sa().characters['路人甲'], undefined);
    assert.equal(persistCount, 1);

    // 别名与已有 DNA 均拒绝，且不落盘。
    prompts.push('爱丽');
    await handleSettingsAction('scene-add-dna-char', ctx);
    prompts.push('路人甲');
    await handleSettingsAction('scene-add-dna-char', ctx);
    assert.equal(alerts, 2);
    assert.equal(persistCount, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(sa().characterDna, '爱丽'), false);

    // 改名撞上已有立绘的角色被拒绝；正常改名保序迁移。
    prompts.push('爱丽丝');
    await handleSettingsAction('scene-rename-dna-char:' + encodeURIComponent('路人甲'), ctx);
    assert.equal(alerts, 3);
    assert.ok(sa().characterDna['路人甲']);
    prompts.push('路人乙');
    await handleSettingsAction('scene-rename-dna-char:' + encodeURIComponent('路人甲'), ctx);
    assert.deepEqual(Object.keys(sa().characterDna), ['爱丽丝', '路人乙']);

    // 有立绘的角色不能走 DNA-only 改名入口。
    prompts.push('新名');
    await handleSettingsAction('scene-rename-dna-char:' + encodeURIComponent('爱丽丝'), ctx);
    assert.ok(sa().characterDna['爱丽丝']);
    assert.equal(sa().characterDna['新名'], undefined);

    const html = renderDnaOnlyCharacterList(sa().characterDna, sa().characters);
    assert.ok(html.includes('data-action="scene-rename-dna-char:' + encodeURIComponent('路人乙') + '"'));
    assert.ok(!html.includes('scene-remove-dna-char:' + encodeURIComponent('爱丽丝')));
    assert.ok(html.includes('data-action="scene-add-dna-char"'));

    await handleSettingsAction('scene-remove-dna-char:' + encodeURIComponent('路人乙'), ctx);
    assert.deepEqual(Object.keys(sa().characterDna), ['爱丽丝']);
    // 没有只有 DNA 的角色时整块不出现，入口在「角色立绘」标题旁。
    assert.equal(renderDnaOnlyCharacterList(sa().characterDna, sa().characters), '');
});


test('gate:generated-images:sprite-slot-merges-character-dna-in-fixed-order', async () => {
    const { buildAssetSlot, buildAssetPlannerUserPrompt } = await import('../src/generated-images/illustration/asset-prompt.js');
    const { attachCharacterDna } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const templates = { sprite: '{tags}, {matte}', spriteNegative: 'NEG_TPL' };
    const base = { need: { type: 'sprite', name: '爱丽丝' }, tags: '1girl, Blue Eyes, smile', uc: 'extra arms' };

    // 无 DNA：与旧版逐字一致。
    const plain = buildAssetSlot(base, { templates });
    assert.equal(plain.scene.startsWith('1girl, Blue Eyes, smile, '), true);
    assert.equal(plain.sceneUc.startsWith('NEG_TPL, '), true);

    const dna = { triggerWords: 'alice_v2', identity: 'silver hair, blue eyes', defaultAppearance: 'school uniform', negative: 'zz_no_glasses' };
    const withDna = buildAssetSlot({ ...base, need: { ...base.need, dna } }, { templates });
    assert.equal(withDna.scene.startsWith('alice_v2, silver hair, blue eyes, school uniform, 1girl, smile, '), true);
    assert.equal((withDna.scene.match(/blue eyes/gi) || []).length, 1);
    assert.equal(withDna.sceneUc.startsWith('NEG_TPL, zz_no_glasses, '), true);
    assert.equal(withDna.sceneUc.replace(', zz_no_glasses', ''), plain.sceneUc);
    assert.equal(withDna.sceneUc.endsWith('extra arms'), true);

    // 别名归约到主名；空 DNA 不挂；背景不受影响；无 DNA 映射时原样返回。
    const sceneAssets = {
        characters: { '爱丽丝': { '默认': '' } },
        characterAliases: { '爱丽丝': ['爱丽'] },
        characterDna: { '爱丽丝': dna, '白墨': { identity: '  ' }, '路人甲': { identity: 'brown hair' } },
    };
    const needs = [
        { type: 'sprite', name: '爱丽' },
        { type: 'sprite', name: '白墨' },
        { type: 'sprite', name: '路人甲' },
        { type: 'background', name: '爱丽丝' },
    ];
    attachCharacterDna(needs, sceneAssets);
    assert.equal(needs[0].dna.identity, 'silver hair, blue eyes');
    assert.equal(Object.prototype.hasOwnProperty.call(needs[1], 'dna'), false);
    assert.equal(needs[2].dna.identity, 'brown hair');
    assert.equal(Object.prototype.hasOwnProperty.call(needs[3], 'dna'), false);
    const untouched = [{ type: 'sprite', name: '爱丽' }];
    assert.equal(attachCharacterDna(untouched, { characters: {} }), untouched);
    assert.equal(Object.prototype.hasOwnProperty.call(untouched[0], 'dna'), false);

    const prompt = buildAssetPlannerUserPrompt({ needs: [needs[0], needs[3]], readableText: '正文' });
    assert.ok(prompt.includes('固定身份：silver hair, blue eyes'));
    assert.ok(prompt.includes('默认外观：school uniform'));
    assert.ok(prompt.includes('【角色 DNA】'));
    const plainPrompt = buildAssetPlannerUserPrompt({ needs: [{ type: 'sprite', name: '爱丽' }], readableText: '正文' });
    assert.ok(!plainPrompt.includes('【角色 DNA】'));
    assert.ok(!plainPrompt.includes('固定身份'));
});


test('gate:generated-images:cg-planner-binds-character-dna-safely', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    const { buildPlannerUserPrompt, PLANNER_SYSTEM_PROMPT } = await import('../src/generated-images/illustration/planner-prompt.js');
    const { bindCharacterDnaToSlots, summarizeCharacterDna } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    assert.ok(PLANNER_SYSTEM_PROMPT.includes('char: 角色名 | x,y |'));

    // 具名格式带 name；旧格式解析结果与旧版一致、不带 name。
    const plan = parseIllustrationPlan('slot: 1\nat: 1\nscene: 2girls, classroom\nchar: 爱丽 | 0.3,0.5 | smile, waving\nchar_uc: frown\nchar: 0.7,0.5 | 1girl, sitting', { maxSlots: 1, paragraphCount: 3 });
    assert.equal(plan.ok, true);
    const [named, legacy] = plan.slots[0].chars;
    assert.equal(named.name, '爱丽');
    assert.equal(named.tags, 'smile, waving');
    assert.equal(named.uc, 'frown');
    assert.equal(Number(named.x), 0.3);
    assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'name'), false);
    assert.equal(legacy.tags, '1girl, sitting');
    assert.equal(Number(legacy.x), 0.7);

    const dna = { triggerWords: 'alice_v2', identity: 'silver hair, blue eyes', defaultAppearance: 'school uniform', negative: 'zz_no_glasses' };
    const sceneAssets = {
        characters: { '爱丽丝': { '默认': '' }, '白墨': { '默认': '' } },
        characterAliases: { '爱丽丝': ['爱丽'], '白墨': [] },
        characterDna: { '爱丽丝': dna, '白墨': { identity: 'black hair' } },
    };
    const slots = [
        { slot: 1, scene: 'x', chars: [{ name: '爱丽', x: 0.5, y: 0.5, tags: 'smile, Silver Hair', uc: 'frown' }] },
        { slot: 2, scene: 'y', chars: [{ x: 0.5, y: 0.5, tags: 'sitting', uc: '' }] },
        { slot: 3, scene: 'z', chars: [{ x: 0.3, y: 0.5, tags: 'a', uc: '' }, { x: 0.7, y: 0.5, tags: 'b', uc: '' }] },
    ];
    const single = bindCharacterDnaToSlots(slots, sceneAssets, ['爱丽']);
    assert.equal(single.slots[0].chars[0].tags, 'alice_v2, silver hair, blue eyes, smile');
    assert.equal(single.slots[0].chars[0].uc, 'zz_no_glasses, frown');
    assert.ok(!single.slots[0].chars[0].tags.includes('school uniform'));
    assert.equal(single.slots[1].chars[0].tags, 'alice_v2, silver hair, blue eyes, sitting');
    assert.deepEqual(single.slots[2].chars, slots[2].chars);
    assert.equal(single.warnings.length, 1);
    assert.equal(slots[0].chars[0].tags, 'smile, Silver Hair');

    // 上下文多人时无名单人角色不猜人。
    const multi = bindCharacterDnaToSlots([slots[1]], sceneAssets, ['爱丽', '白墨']);
    assert.equal(multi.slots[0].chars[0].tags, 'sitting');
    assert.equal(multi.warnings.length, 1);

    // 无 DNA 映射：原样返回，无 warning。
    const none = bindCharacterDnaToSlots(slots, { characters: {} }, ['爱丽']);
    assert.equal(none.slots, slots);
    assert.equal(none.warnings.length, 0);

    const summary = summarizeCharacterDna(['爱丽', '爱丽丝', '路人'], sceneAssets);
    assert.deepEqual(summary, [{ name: '爱丽丝', identity: 'silver hair, blue eyes', defaultAppearance: 'school uniform' }]);
    const withDna = buildPlannerUserPrompt({ numberedText: '1. 正文', scenes: [], characters: ['爱丽'], want: 1, exact: false, characterDna: summary });
    assert.ok(withDna.includes('【角色 DNA】'));
    assert.ok(withDna.includes('爱丽丝｜固定身份：silver hair, blue eyes｜默认外观：school uniform'));
    const plain = buildPlannerUserPrompt({ numberedText: '1. 正文', scenes: [], characters: ['爱丽'], want: 1, exact: false });
    assert.ok(!plain.includes('【角色 DNA】'));
});

test('gate:scene:dna-candidate-accept-does-not-overwrite-and-dismiss-clears', async () => {
    const { renderDnaCandidateBar } = await import('../src/visual/igs-ui/settings-fields.js');
    assert.equal(renderDnaCandidateBar(null), '');
    assert.equal(renderDnaCandidateBar({ name: '  ' }), '');
    const bar = renderDnaCandidateBar({ name: 'A<b>', tags: '1girl, <x>' });
    assert.ok(bar.includes('data-dna-candidate="A&lt;b&gt;"'));
    assert.ok(bar.includes('1girl, &lt;x&gt;'));
    assert.ok(bar.includes('data-action="scene-accept-dna-candidate"'));
    assert.ok(bar.includes('data-action="scene-dismiss-dna-candidate"'));

    const draft = {
        bridge: { sceneAssets: { enabled: true, scenes: {}, characters: { '爱丽丝': { '默认': 'igs-gen:a' } }, characterAliases: { '爱丽丝': [] }, characterDna: { '爱丽丝': { defaultAppearance: 'user uniform' } } } },
        readerSettings: {},
    };
    const asyncState = { expandedSpriteSlots: new Set(), dnaCandidate: { name: '爱丽丝', tags: '1girl, maid outfit' } };
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState } },
        options: { global: { alert: () => {} } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    const sa = () => draft.bridge.sceneAssets;

    // 已填写的默认外观不被候选覆盖。
    await handleSettingsAction('scene-accept-dna-candidate', ctx);
    assert.equal(sa().characterDna['爱丽丝'].defaultAppearance, 'user uniform');
    assert.equal(asyncState.dnaCandidate, null);
    assert.equal(persistCount, 1);

    // 新角色：采用时才建 DNA 并写入候选 tag。
    asyncState.dnaCandidate = { name: '路人甲', tags: '1boy, black coat' };
    assert.equal(Object.prototype.hasOwnProperty.call(sa().characterDna, '路人甲'), false);
    await handleSettingsAction('scene-accept-dna-candidate', ctx);
    assert.equal(sa().characterDna['路人甲'].defaultAppearance, '1boy, black coat');
    assert.equal(sa().characterDna['路人甲'].identity, '');

    // 忽略：不写 DNA、不落盘。
    asyncState.dnaCandidate = { name: '白墨', tags: 'x' };
    await handleSettingsAction('scene-dismiss-dna-candidate', ctx);
    assert.equal(asyncState.dnaCandidate, null);
    assert.equal(Object.prototype.hasOwnProperty.call(sa().characterDna, '白墨'), false);
    assert.equal(persistCount, 2);

    // 原型污染名被丢弃。
    asyncState.dnaCandidate = { name: '__proto__', tags: 'x' };
    await handleSettingsAction('scene-accept-dna-candidate', ctx);
    assert.equal(asyncState.dnaCandidate, null);
    assert.equal(persistCount, 2);
});


test('gate:igs-ui:image-settings-open-character-dna-jumps-without-copying-data', async () => {
    const tabsSource = fs.readFileSync(new URL('../src/visual/igs-ui/settings-tabs.js', import.meta.url), 'utf8');
    assert.ok(tabsSource.includes('data-action="open-character-dna"'));
    const dna = { '爱丽丝': { identity: 'silver hair' } };
    const draft = { bridge: { sceneAssets: { enabled: true, characters: {}, characterAliases: {}, characterDna: dna } }, readerSettings: {} };
    const settingsState = { tab: 'image', draft, readerMode: 'pc', asyncState: { sceneSubTab: 'scenes' } };
    let persistCount = 0;
    const ctx = {
        state: { activeSettings: settingsState },
        options: { global: {} },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persistCount += 1; return { ok: true }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    await handleSettingsAction('open-character-dna', ctx);
    assert.equal(settingsState.tab, 'scene');
    assert.equal(settingsState.asyncState.sceneSubTab, 'characters');
    assert.equal(draft.bridge.sceneAssets.characterDna, dna);
    assert.equal(persistCount, 0);
});


test('gate:media:generated-image-record-normalize-legacy-and-mask-pixels', async () => {
    const { normalizeGeneratedImageRecord, isLegacyGeneratedImage, isQuotaError, GENERATED_IMAGE_SCHEMA_VERSION } = await import('../src/media/generated-asset-store.js');
    const { buildAlphaMaskPixels, createAlphaMatte } = await import('../src/media/alpha-matte.js');
    assert.equal(normalizeGeneratedImageRecord(null), null);
    assert.equal(normalizeGeneratedImageRecord({ dataUrl: 'x' }), null);

    // 旧记录只有 dataUrl：按 legacy 读取，不伪造原图。
    const legacy = normalizeGeneratedImageRecord({ id: 'a', dataUrl: 'data:image/png;base64,AAA', type: 'sprite' });
    assert.equal(legacy.schemaVersion, 1);
    assert.equal(legacy.originalDataUrl, '');
    assert.equal(legacy.dataUrl, 'data:image/png;base64,AAA');
    assert.equal(isLegacyGeneratedImage(legacy), true);
    assert.equal(legacy.revision, 1);

    const v2 = normalizeGeneratedImageRecord({ id: 'b', dataUrl: 'cut', originalDataUrl: 'orig', revision: 3 });
    assert.equal(v2.schemaVersion, GENERATED_IMAGE_SCHEMA_VERSION);
    assert.equal(v2.originalDataUrl, 'orig');
    assert.equal(v2.revision, 3);
    assert.equal(isLegacyGeneratedImage(v2), false);
    assert.equal(normalizeGeneratedImageRecord({ id: 'c', originalDataUrl: 'o', revision: -2 }).revision, 1);

    assert.equal(isQuotaError({ name: 'QuotaExceededError' }), true);
    assert.equal(isQuotaError({ code: 22 }), true);
    assert.equal(isQuotaError(new Error('boom')), false);
    assert.equal(isQuotaError(null), false);

    const mask = buildAlphaMaskPixels(new Uint8ClampedArray([10, 20, 30, 0, 1, 2, 3, 128, 4, 5, 6, 255]));
    assert.deepEqual(Array.from(mask), [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);

    // 无 canvas：fail-open，字符串调用保持旧契约，detailed 返回空遮罩与诊断。
    const matte = createAlphaMatte({});
    assert.equal(await matte('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
    const detailed = await matte('data:image/png;base64,AAA', { detailed: true });
    assert.equal(detailed.dataUrl, 'data:image/png;base64,AAA');
    assert.equal(detailed.alphaMaskDataUrl, '');
    assert.equal(detailed.diagnostics.fallback, 'no-canvas');
});


test('gate:media:matte-brush-modes-compose-mapping-and-bounded-history', async () => {
    const { applyBrushDab, applyBrushStroke, composeMattedPixels, readAlphaFromMaskPixels, mapPointerToImage, createBoundedHistory } = await import('../src/media/matte-brush.js');
    const w = 9; const h = 9;
    const at = (a, x, y) => a[y * w + x];

    const keep = new Uint8ClampedArray(w * h);
    applyBrushDab(keep, w, h, 4, 4, { mode: 'keep', radius: 2 });
    assert.equal(at(keep, 4, 4), 255);
    assert.equal(at(keep, 6, 4), 255);
    assert.equal(at(keep, 7, 4), 0);
    assert.equal(at(keep, 0, 0), 0);

    const erase = new Uint8ClampedArray(w * h).fill(255);
    applyBrushDab(erase, w, h, 4, 4, { mode: 'erase', radius: 1 });
    assert.equal(at(erase, 4, 4), 0);
    assert.equal(at(erase, 4, 6), 255);

    // soft：中心接近满值，边缘只部分提升，不越界。
    const soft = new Uint8ClampedArray(w * h);
    applyBrushDab(soft, w, h, 4, 4, { mode: 'soft', radius: 4, strength: 1 });
    assert.equal(at(soft, 4, 4), 255);
    assert.ok(at(soft, 6, 4) > 0 && at(soft, 6, 4) < 255);
    assert.equal(at(soft, 0, 0), 0);

    // 未知模式不改像素；画布外坐标不抛错。
    const same = new Uint8ClampedArray(w * h);
    applyBrushDab(same, w, h, 4, 4, { mode: 'bogus', radius: 3 });
    assert.ok(same.every((v) => v === 0));
    applyBrushDab(same, w, h, -20, 50, { mode: 'keep', radius: 2 });
    assert.ok(same.every((v) => v === 0));

    // 快速拖动：两端点之间插值，笔画连续。
    const line = new Uint8ClampedArray(w * h);
    applyBrushStroke(line, w, h, [{ x: 0, y: 4 }, { x: 8, y: 4 }], { mode: 'keep', radius: 1 });
    for (let x = 0; x < w; x += 1) assert.equal(at(line, x, 4), 255);

    const rgba = new Uint8ClampedArray([10, 20, 30, 99, 40, 50, 60, 99]);
    assert.deepEqual(Array.from(composeMattedPixels(rgba, new Uint8ClampedArray([0, 200]))), [10, 20, 30, 0, 40, 50, 60, 200]);
    assert.deepEqual(Array.from(readAlphaFromMaskPixels(new Uint8ClampedArray([7, 7, 7, 255, 250, 250, 250, 255]))), [7, 250]);

    // 显示尺寸与原像素分离。
    assert.deepEqual(mapPointerToImage(150, 60, { left: 100, top: 10, width: 100, height: 200 }, 1000, 2000), { x: 500, y: 500 });
    assert.equal(mapPointerToImage(90, 60, { left: 100, top: 10, width: 100, height: 200 }, 1000, 2000), null);
    assert.equal(mapPointerToImage(1, 1, { left: 0, top: 0, width: 0, height: 0 }, 10, 10), null);

    const history = createBoundedHistory('s0', 2);
    history.push('s1'); history.push('s2'); history.push('s3');
    assert.equal(history.size(), 2);
    assert.equal(history.undo(), 's2');
    assert.equal(history.undo(), 's1');
    assert.equal(history.canUndo(), false);
    assert.equal(history.undo(), 's1');
    assert.equal(history.redo(), 's2');
    history.push('s4');
    assert.equal(history.canRedo(), false);
    assert.equal(history.current, 's4');
});


test('gate:media:matte-edit-session-history-dirty-and-reset', async () => {
    const { createMatteEditSession } = await import('../src/media/matte-edit-session.js');
    assert.equal(createMatteEditSession({ width: 0, height: 4, alpha: new Uint8ClampedArray(0) }), null);
    assert.equal(createMatteEditSession({ width: 4, height: 4, alpha: new Uint8ClampedArray(3) }), null);

    const w = 5; const h = 5;
    const opened = new Uint8ClampedArray(w * h);
    const auto = new Uint8ClampedArray(w * h).fill(9);
    const session = createMatteEditSession({ width: w, height: h, alpha: opened, autoAlpha: auto, historyLimit: 3 });
    assert.equal(session.isDirty(), false);
    assert.equal(session.canUndo(), false);

    // 一次拖动一条历史；传入的遮罩不被修改。
    session.stroke([{ x: 2, y: 2 }, { x: 3, y: 2 }], { mode: 'keep', radius: 1 });
    assert.equal(session.alpha[2 * w + 2], 255);
    assert.equal(opened[2 * w + 2], 0);
    assert.equal(session.isDirty(), true);
    assert.equal(session.canUndo(), true);

    // 无改动的笔画不进历史。
    session.stroke([{ x: 2, y: 2 }], { mode: 'keep', radius: 1 });
    session.undo();
    assert.equal(session.alpha[2 * w + 2], 0);
    assert.equal(session.isDirty(), false);
    assert.equal(session.canUndo(), false);
    session.redo();
    assert.equal(session.alpha[2 * w + 2], 255);

    session.resetToAuto();
    assert.ok(Array.from(session.alpha).every((v) => v === 9));
    session.undo();
    assert.equal(session.alpha[2 * w + 2], 255);

    // 无自动结果时恢复打开时的遮罩。
    const plain = createMatteEditSession({ width: w, height: h, alpha: opened });
    plain.stroke([{ x: 1, y: 1 }], { mode: 'keep', radius: 1 });
    plain.resetToAuto();
    assert.equal(plain.isDirty(), false);
});


test('gate:igs-ui:sprite-matte-editor-mode-and-save-errors', async () => {
    const { resolveMatteEditorMode, describeMatteSaveError } = await import('../src/visual/igs-ui/sprite-matte-editor-state.js');
    assert.equal(resolveMatteEditorMode(null).mode, 'missing');
    assert.equal(resolveMatteEditorMode({ ok: false, reason: 'not-found' }).mode, 'missing');

    // legacy：只读，不提供恢复入口。
    const legacy = resolveMatteEditorMode({ ok: true, editable: false, record: { dataUrl: 'cut' } });
    assert.equal(legacy.mode, 'readonly');
    assert.equal(legacy.reason, 'source-unavailable');
    assert.equal(Boolean(legacy.canRematte), false);

    const noMask = resolveMatteEditorMode({ ok: true, editable: true, record: { originalDataUrl: 'o', alphaMaskDataUrl: '' } });
    assert.equal(noMask.reason, 'mask-missing');
    assert.equal(noMask.canRematte, true);

    const record = { originalDataUrl: 'o', alphaMaskDataUrl: 'm', matteCrop: { x: 10, y: 20, width: 30, height: 40 } };
    const fit = resolveMatteEditorMode({ ok: true, editable: true, record }, { maskSize: { width: 30, height: 40 }, originalSize: { width: 100, height: 100 } });
    assert.equal(fit.mode, 'edit');
    assert.deepEqual(fit.crop, { x: 10, y: 20, width: 30, height: 40 });
    const mismatch = resolveMatteEditorMode({ ok: true, editable: true, record }, { maskSize: { width: 31, height: 40 }, originalSize: { width: 100, height: 100 } });
    assert.equal(mismatch.reason, 'mask-size-mismatch');
    const overflow = resolveMatteEditorMode({ ok: true, editable: true, record }, { maskSize: { width: 30, height: 40 }, originalSize: { width: 35, height: 100 } });
    assert.equal(overflow.reason, 'mask-size-mismatch');
    // 无裁边信息：遮罩须与原图同尺寸。
    const noCrop = { originalDataUrl: 'o', alphaMaskDataUrl: 'm' };
    assert.equal(resolveMatteEditorMode({ ok: true, editable: true, record: noCrop }, { maskSize: { width: 50, height: 50 }, originalSize: { width: 50, height: 50 } }).mode, 'edit');
    assert.equal(resolveMatteEditorMode({ ok: true, editable: true, record: noCrop }, { maskSize: { width: 40, height: 50 }, originalSize: { width: 50, height: 50 } }).mode, 'readonly');

    assert.ok(describeMatteSaveError('stale-revision').includes('已在别处被修改'));
    assert.ok(describeMatteSaveError('unknown').includes('仍保留在编辑器中'));

    const { renderGeneratedAssetPane } = await import('../src/visual/igs-ui/settings-fields.js');
    const pane = renderGeneratedAssetPane({
        library: { scenes: { '旧城': { url: 'igs-gen:bg1' } }, characters: { '爱丽丝': { '默认': 'igs-gen:sp1' } } },
        temp: [{ key: 'k1', type: 'sprite', name: '路人', imageId: 'sp2' }, { key: 'k2', type: 'background', name: '街道', imageId: 'bg2' }],
        resolveUrl: () => '',
    });
    assert.ok(!pane.includes('gen-matte-edit:sp1'));
    assert.ok(pane.includes('data-action="gen-matte-edit:sp2"'));
    assert.ok(!pane.includes('gen-matte-edit:bg1'));
    assert.ok(!pane.includes('gen-matte-edit:bg2'));
});

test('gate:igs-ui:sprite-matte-editor-load-align-preview-and-save', async () => {
    const { loadMatteEditor } = await import('../src/visual/igs-ui/sprite-matte-editor.js');
    const orig = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) orig.data.set([x * 10, y * 10, 7, 255], (y * 4 + x) * 4);
    const mask = { width: 2, height: 2, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]) };
    const decodeImage = async (url) => { if (url === 'orig') return orig; if (url === 'mask') return mask; throw new Error('bad'); };
    const encoded = [];
    const encodePixels = async (img) => { encoded.push(img); return `enc:${img.width}x${img.height}:${encoded.length}`; };
    const record = { originalDataUrl: 'orig', workingDataUrl: '', alphaMaskDataUrl: 'mask', matteCrop: { x: 1, y: 1, width: 2, height: 2 }, revision: 3 };
    const saves = [];
    let nextResult = { ok: true, revision: 4 };
    const service = {
        getEditableImage: async () => ({ ok: true, editable: true, record }),
        saveMatteEdit: async (id, revision, patch) => { saves.push({ id, revision, patch }); return nextResult; },
    };

    const editor = await loadMatteEditor(service, 'sp1', { decodeImage, encodePixels });
    assert.equal(editor.mode, 'edit');
    // 预览按裁边对齐原图：遮罩 (0,0) 对应原图 (1,1)。
    const before = editor.preview().data;
    assert.deepEqual(Array.from(before.subarray(0, 8)), [10, 10, 7, 0, 20, 10, 7, 255]);
    editor.session.stroke([{ x: 0, y: 0 }], { mode: 'keep', radius: 0.5 });
    assert.equal(editor.preview().data[3], 255);
    assert.equal(editor.session.isDirty(), true);

    // 重复点击复用同一次提交。
    const p1 = editor.save();
    const p2 = editor.save();
    assert.equal(p1, p2);
    assert.deepEqual(await p1, { ok: true, revision: 4 });
    assert.equal(saves.length, 1);
    assert.equal(saves[0].id, 'sp1');
    assert.equal(saves[0].revision, 3);
    assert.ok(saves[0].patch.dataUrl.startsWith('enc:2x2:'));
    assert.ok(saves[0].patch.alphaMaskDataUrl.startsWith('enc:2x2:'));
    assert.equal(editor.revision, 4);
    // 遮罩编码只存 alpha：RGB 等于 alpha、自身不透明。
    assert.deepEqual(Array.from(encoded[1].data.subarray(0, 4)), [255, 255, 255, 255]);

    nextResult = { ok: false, reason: 'stale-revision' };
    const stale = await editor.save();
    assert.equal(stale.ok, false);
    assert.ok(stale.message.includes('已在别处被修改'));
    assert.equal(saves[1].revision, 4);
    assert.equal(editor.revision, 4);

    const legacy = await loadMatteEditor({ getEditableImage: async () => ({ ok: true, editable: false, record: { dataUrl: 'cut' } }) }, 'old', { decodeImage, encodePixels });
    assert.equal(legacy.mode, 'readonly');
    assert.equal(legacy.reason, 'source-unavailable');
    assert.equal(legacy.save, undefined);

    const broken = await loadMatteEditor({ getEditableImage: async () => ({ ok: true, editable: true, record: { ...record, alphaMaskDataUrl: 'nope' } }) }, 'x', { decodeImage, encodePixels });
    assert.equal(broken.reason, 'decode-failed');
    assert.equal((await loadMatteEditor(null, 'x', {})).reason, 'no-service');

    // 设置页动作：未注入编辑器时明确失败；注入后按 imageId 打开。
    const opened = [];
    const baseCtx = (extra) => ({
        state: { activeSettings: { draft: { bridge: { sceneAssets: {} }, readerSettings: {} }, readerMode: 'pc', asyncState: {} } },
        options: { global: { alert: () => {} }, ...extra },
        closeSettings: () => ({ ok: true }), persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }), buildRegexPreview: () => '',
    });
    const missing = await handleSettingsAction('gen-matte-edit:' + encodeURIComponent('sp1'), baseCtx({}));
    assert.equal(missing.reason, 'matte-editor-unavailable');
    const ok = await handleSettingsAction('gen-matte-edit:' + encodeURIComponent('sp1'), baseCtx({ openMatteEditor: async (id) => { opened.push(id); return { ok: true }; } }));
    assert.equal(ok.ok, true);
    assert.deepEqual(opened, ['sp1']);
});

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

test('gate:igs-ui:sprite-matte-editor-mount-readonly-draw-cancel-and-save', async () => {
    const { mountMatteEditor } = await import('../src/visual/igs-ui/sprite-matte-editor-mount.js');
    const { createMatteEditSession } = await import('../src/media/matte-edit-session.js');
    const { composeMattedPixels } = await import('../src/media/matte-brush.js');
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const button = (root, label) => root.children[0].children.find((c) => c.tagName === 'BUTTON' && c.textContent === label);

    // 只读：只显示说明与关闭；关闭不写资产，只移除弹层。
    const { doc, win } = createFakeMatteDom();
    let closedCount = 0;
    const ro = mountMatteEditor(doc, { mode: 'readonly', message: '旧版本立绘无法恢复' }, { onClose: () => { closedCount += 1; } });
    assert.equal(doc.body.children.includes(ro.root), true);
    assert.equal(ro.root.children[1].textContent, '旧版本立绘无法恢复');
    assert.deepEqual(ro.root.children[0].children.map((c) => c.textContent), ['关闭']);
    button(ro.root, '关闭').fire('click');
    assert.equal(doc.body.children.includes(ro.root), false);
    assert.equal(closedCount, 1);

    const makeEditor = (saveResult, saves) => {
        const session = createMatteEditSession({ width: 2, height: 2, alpha: new Uint8ClampedArray(4) });
        const src = new Uint8ClampedArray(16).fill(100);
        return {
            mode: 'edit', session,
            preview: () => ({ width: 2, height: 2, data: composeMattedPixels(src, session.alpha) }),
            save: async () => { saves.push(1); return saveResult(); },
        };
    };

    // 画笔：指针坐标映射回原像素，一次拖动写一条历史。
    const saves = [];
    let result = { ok: false, reason: 'stale-revision', message: '已在别处被修改' };
    const editor = makeEditor(() => result, saves);
    const saved = [];
    const mounted = mountMatteEditor(doc, editor, { onSaved: (r) => saved.push(r) });
    assert.equal(doc.head.children.filter((c) => c.id === 'igs-matte-editor-style').length, 1);
    const canvas = mounted.root.children[2].children[0];
    assert.equal(canvas.tagName, 'CANVAS');
    assert.equal(button(mounted.root, '撤销').disabled, true);
    canvas.fire('pointerdown', { clientX: 0.5, clientY: 0.5, pointerId: 1 });
    canvas.fire('pointerup', {});
    assert.ok(Array.from(editor.session.alpha).every((v) => v === 255));
    assert.equal(button(mounted.root, '撤销').disabled, false);
    assert.equal(canvas.lastImage.data[3], 255);

    // 取消：有改动且用户不确认时不关闭；确认后关闭，不调用保存。
    win.confirmAnswer = false;
    button(mounted.root, '取消').fire('click');
    assert.equal(doc.body.children.includes(mounted.root), true);

    // 保存失败：保留编辑内容与弹层，按钮恢复可用。
    button(mounted.root, '保存').fire('click');
    await flush(); await flush();
    assert.equal(saves.length, 1);
    assert.equal(mounted.root.children[1].textContent, '已在别处被修改');
    assert.equal(doc.body.children.includes(mounted.root), true);
    assert.equal(button(mounted.root, '保存').disabled, false);
    assert.equal(editor.session.isDirty(), true);

    // 保存成功：通知并关闭。
    result = { ok: true, revision: 2 };
    button(mounted.root, '保存').fire('click');
    await flush(); await flush();
    assert.deepEqual(saved, [{ ok: true, revision: 2 }]);
    assert.equal(doc.body.children.includes(mounted.root), false);

    // 另一个会话：确认取消后关闭，未发生保存。
    const saves2 = [];
    const other = mountMatteEditor(doc, makeEditor(() => ({ ok: true }), saves2));
    other.root.children[2].children[0].fire('pointerdown', { clientX: 1, clientY: 1, pointerId: 2 });
    other.root.children[2].children[0].fire('pointerup', {});
    win.confirmAnswer = true;
    button(other.root, '取消').fire('click');
    assert.equal(doc.body.children.includes(other.root), false);
    assert.equal(saves2.length, 0);
});

test('gate:generated-images:image-edit-capability-never-falls-back-to-generate', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    let generateCalls = 0;
    const edits = [];
    const naiWithEdit = {
        async generate() { generateCalls += 1; return { ok: true, dataUrl: 'whole' }; },
        async edit(request) { edits.push(request); return { ok: true, dataUrl: 'data:image/png;base64,EDIT' }; },
    };
    const naiNoEdit = { async generate() { generateCalls += 1; return { ok: true, dataUrl: 'whole' }; } };
    const bridge = (mode, apiKey = 'k') => ({ imageApi: { mode }, autoIllustration: { nai: { apiKey } } });

    const backend = createImageBackend({ nai: naiWithEdit, getBridge: () => bridge('nai') });
    assert.equal(backend.describeEdit(bridge('extension')).reason, 'image-edit-unsupported');
    assert.equal(backend.describeEdit(bridge('dbgen')).reason, 'image-edit-unsupported');
    assert.equal(backend.describeEdit(bridge('nai', '')).reason, 'backend-unavailable');
    assert.equal(backend.describeEdit(bridge('nai')).supported, true);
    assert.equal(createImageBackend({ nai: naiNoEdit, getBridge: () => bridge('nai') }).describeEdit().reason, 'image-edit-unsupported');

    const unsupported = await createImageBackend({ nai: naiNoEdit, getBridge: () => bridge('nai') }).edit({ sourceDataUrl: 's', maskDataUrl: 'm' });
    assert.equal(unsupported.ok, false);
    assert.equal(unsupported.reason, 'image-edit-unsupported');
    assert.equal((await backend.edit({ sourceDataUrl: 's', maskDataUrl: 'm' }, bridge('dbgen'))).reason, 'image-edit-unsupported');
    assert.equal((await backend.edit({ sourceDataUrl: 's' })).reason, 'invalid-edit-request');

    const ok = await backend.edit({ sourceDataUrl: 's', maskDataUrl: 'm', prompt: 'silver hair' });
    assert.deepEqual(ok, { ok: true, dataUrl: 'data:image/png;base64,EDIT' });
    assert.equal(edits.length, 1);
    assert.equal(edits[0].maskDataUrl, 'm');

    const throwing = createImageBackend({ nai: { ...naiWithEdit, async edit() { throw new Error('timeout'); } }, getBridge: () => bridge('nai') });
    const failed = await throwing.edit({ sourceDataUrl: 's', maskDataUrl: 'm' });
    assert.equal(failed.reason, 'edit-failed');
    assert.ok(!('dataUrl' in failed));
    assert.equal(generateCalls, 0);
});

test('gate:generated-images:nai-inpaint-request-shape-and-unsupported-models', async () => {
    const { buildNaiInpaintRequest, resolveNaiInpaintModel } = await import('../src/generated-images/request-builders/nai-inpaint-builder.js');
    assert.equal(resolveNaiInpaintModel('nai-diffusion-4-5-full'), 'nai-diffusion-4-5-full-inpainting');
    assert.equal(resolveNaiInpaintModel('nai-diffusion-5-full'), '');
    assert.equal(resolveNaiInpaintModel('__proto__'), '');
    const req = { sourceDataUrl: 'data:image/png;base64,SRC', maskDataUrl: 'data:image/png;base64,MSK', prompt: 'silver hair', negative: 'glasses', width: 832, height: 1216 };
    const settings = { model: 'nai-diffusion-4-5-full', apiKey: 'SECRET-KEY', artistPrefix: 'artist:x' };
    const built = buildNaiInpaintRequest(req, settings, () => 0.5);
    assert.equal(built.ok, true);
    const body = built.body;
    assert.equal(body.action, 'infill');
    assert.equal(body.model, 'nai-diffusion-4-5-full-inpainting');
    assert.equal(body.parameters.image, 'SRC');
    assert.equal(body.parameters.mask, 'MSK');
    assert.equal(body.parameters.width, 832);
    assert.equal(body.parameters.height, 1216);
    assert.equal(body.parameters.strength, 0.7);
    assert.equal(body.parameters.add_original_image, true);
    assert.ok(body.input.includes('silver hair'));
    assert.ok(body.parameters.negative_prompt.includes('glasses'));
    // 请求体不携带 Key。
    assert.equal(JSON.stringify(body).includes('SECRET-KEY'), false);

    assert.equal(buildNaiInpaintRequest(req, { model: 'nai-diffusion-5-full' }).reason, 'image-edit-unsupported');
    assert.equal(buildNaiInpaintRequest({ ...req, maskDataUrl: 'not-a-data-url' }, settings).reason, 'invalid-edit-request');
    assert.equal(buildNaiInpaintRequest({ ...req, width: 830 }, settings).reason, 'invalid-size');
    assert.equal(buildNaiInpaintRequest({ ...req, prompt: '  ' }, settings).reason, 'empty-prompt');
    assert.equal(buildNaiInpaintRequest({ ...req, strength: 5 }, settings).body.parameters.strength, 1);
});

test('gate:generated-images:nai-client-edit-uses-infill-and-hides-key', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url, init });
        return { ok: false, status: 400, text: async () => 'bad request', headers: { get: () => null } };
    };
    const client = createNaiOfficialClient({ fetch, sleep: async () => {}, random: () => 0.5 });
    const req = { sourceDataUrl: 'data:image/png;base64,SRC', maskDataUrl: 'data:image/png;base64,MSK', prompt: 'silver hair', width: 832, height: 1216 };

    assert.equal(client.supportsEdit({ model: 'nai-diffusion-4-5-full' }), true);
    assert.equal(client.supportsEdit({ model: 'nai-diffusion-5-full' }), false);
    assert.equal((await client.edit(req, { model: 'nai-diffusion-4-5-full', apiKey: '' })).ok, false);
    assert.equal((await client.edit(req, { model: 'nai-diffusion-5-full', apiKey: 'SECRET-KEY' })).reason, 'image-edit-unsupported');
    assert.equal(calls.length, 0);

    const failed = await client.edit(req, { model: 'nai-diffusion-4-5-full', apiKey: 'SECRET-KEY' });
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 400);
    assert.equal(calls.length, 1);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.action, 'infill');
    assert.equal(sent.model, 'nai-diffusion-4-5-full-inpainting');
    assert.equal(calls[0].init.body.includes('SECRET-KEY'), false);
    assert.equal(String(failed.error).includes('SECRET-KEY'), false);

    // 后端能力协商：V5 模型判定为不支持，不发请求。
    const bridge = (model) => ({ imageApi: { mode: 'nai' }, autoIllustration: { nai: { apiKey: 'SECRET-KEY', model } } });
    const backend = createImageBackend({ nai: client, getBridge: () => bridge('nai-diffusion-5-full') });
    assert.equal(backend.describeEdit().reason, 'image-edit-unsupported');
    assert.equal((await backend.edit(req)).reason, 'image-edit-unsupported');
    assert.equal(calls.length, 1);
    assert.equal(backend.describeEdit(bridge('nai-diffusion-4-5-full')).supported, true);
});

test('gate:generated-images:inpaint-transaction-preview-accept-cancel-and-stale', async () => {
    const { createInpaintTransaction, buildInpaintPrompt } = await import('../src/generated-images/illustration/inpaint-transaction.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 'sp', schemaVersion: 2, type: 'sprite', originalDataUrl: 'data:image/png;base64,ORIG', workingDataUrl: '', dataUrl: 'cut0', alphaMaskDataUrl: 'mask0', revision: 1 });
    await store.putImage({ id: 'old', type: 'sprite', dataUrl: 'legacy' });
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store, getSettings: () => ({}), now: () => 't',
    });
    const edits = [];
    let supported = true;
    let editResult = { ok: false, reason: 'edit-failed', error: 'timeout' };
    const backend = {
        describeEdit: () => (supported ? { supported: true } : { supported: false, reason: 'image-edit-unsupported', message: '不支持' }),
        async edit(req) { edits.push(req); return editResult; },
    };
    const matte = async (url) => ({ dataUrl: `${url}#cut`, alphaMaskDataUrl: `mask:${url}`, diagnostics: { crop: { x: 0, y: 0, width: 64, height: 64 } } });
    const tx = createInpaintTransaction({ service, backend, matte });
    const opts = { maskDataUrl: 'data:image/png;base64,M', width: 64, height: 64, prompt: 'fix hair', dna: { identity: 'silver hair', negative: 'glasses' } };

    supported = false;
    assert.equal((await tx.preview('sp', opts)).reason, 'image-edit-unsupported');
    supported = true;
    assert.equal((await tx.preview('old', opts)).reason, 'source-unavailable');
    assert.equal(edits.length, 0);

    assert.equal((await tx.preview('sp', opts)).ok, false);
    assert.equal((await tx.accept()).reason, 'no-candidate');

    // 重复点击只发一次；预览不写存储。
    editResult = { ok: true, dataUrl: 'data:image/png;base64,AI1' };
    const p1 = tx.preview('sp', opts);
    const p2 = tx.preview('sp', opts);
    assert.equal(p1, p2);
    assert.deepEqual(await p1, { ok: true, candidateDataUrl: 'data:image/png;base64,AI1' });
    assert.equal(edits.length, 2);
    assert.equal(edits[1].sourceDataUrl, 'data:image/png;base64,ORIG');
    assert.ok(edits[1].prompt.startsWith('silver hair, fix hair, same character'));
    assert.equal(edits[1].negative, 'glasses');
    let current = await store.getImage('sp');
    assert.equal(current.revision, 1);
    assert.equal(current.dataUrl, 'cut0');

    tx.cancel();
    assert.equal((await tx.accept()).reason, 'no-candidate');
    assert.equal((await store.getImage('sp')).revision, 1);

    await tx.preview('sp', opts);
    assert.deepEqual(await tx.accept(), { ok: true, revision: 2 });
    current = await store.getImage('sp');
    assert.equal(current.workingDataUrl, 'data:image/png;base64,AI1');
    assert.equal(current.dataUrl, 'data:image/png;base64,AI1#cut');
    assert.equal(current.alphaMaskDataUrl, 'mask:data:image/png;base64,AI1');
    assert.equal(current.originalDataUrl, 'data:image/png;base64,ORIG');
    assert.deepEqual(current.matteCrop, { x: 0, y: 0, width: 64, height: 64 });

    // 后续预览基于最近接受的工作原图；期间另一会话保存导致过期，接受被拒绝且不覆盖。
    editResult = { ok: true, dataUrl: 'data:image/png;base64,AI2' };
    await tx.preview('sp', opts);
    assert.equal(edits[edits.length - 1].sourceDataUrl, 'data:image/png;base64,AI1');
    await service.saveMatteEdit('sp', 2, { dataUrl: 'manual' });
    assert.equal((await tx.accept()).reason, 'stale-revision');
    current = await store.getImage('sp');
    assert.equal(current.dataUrl, 'manual');
    assert.equal(current.workingDataUrl, 'data:image/png;base64,AI1');
    assert.equal((await tx.accept()).reason, 'no-candidate');

    const restored = await tx.restoreOriginal('sp');
    assert.deepEqual(restored, { ok: true, revision: 4 });
    current = await store.getImage('sp');
    assert.equal(current.workingDataUrl, '');
    assert.equal(current.dataUrl, 'data:image/png;base64,ORIG#cut');
    assert.equal(current.originalDataUrl, 'data:image/png;base64,ORIG');
    assert.equal((await tx.restoreOriginal('old')).reason, 'source-unavailable');
    assert.deepEqual(buildInpaintPrompt({ prompt: 'x' }).negative, '');
});

test('gate:igs-ui:matte-editor-ai-repair-maps-selection-by-crop', async () => {
    const { loadMatteEditor } = await import('../src/visual/igs-ui/sprite-matte-editor.js');
    const orig = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(200) };
    const mask = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) };
    const decodeImage = async (url) => (url === 'mask' ? mask : orig);
    const encoded = [];
    const encodePixels = async (img) => { encoded.push(img); return `enc${encoded.length}`; };
    const record = { originalDataUrl: 'orig', workingDataUrl: '', alphaMaskDataUrl: 'mask', matteCrop: { x: 1, y: 1, width: 2, height: 2 }, revision: 5 };
    const service = { getEditableImage: async () => ({ ok: true, editable: true, record }), saveMatteEdit: async () => ({ ok: true, revision: 6 }) };
    const previews = [];
    let acceptResult = { ok: true, revision: 6 };
    const inpaint = {
        preview: async (id, opts) => { previews.push({ id, opts }); return { ok: true, candidateDataUrl: 'cand' }; },
        accept: async () => acceptResult,
        cancel() { this.cancelled = true; },
    };
    const dna = { identity: 'silver hair' };
    const editor = await loadMatteEditor(service, 'sp', { decodeImage, encodePixels, inpaint, dna });
    assert.equal(editor.aiAvailable, true);
    const selection = new Uint8ClampedArray([255, 0, 0, 0]);
    assert.deepEqual(await editor.aiRepair(selection, 'fix hair'), { ok: true, candidateDataUrl: 'cand' });
    assert.equal(previews.length, 1);
    assert.equal(previews[0].id, 'sp');
    assert.equal(previews[0].opts.width, 4);
    assert.equal(previews[0].opts.height, 4);
    assert.equal(previews[0].opts.prompt, 'fix hair');
    assert.equal(previews[0].opts.dna, dna);
    const m = encoded[encoded.length - 1];
    assert.equal(m.width, 4);
    const white = (x, y) => m.data[(y * 4 + x) * 4] === 255;
    assert.equal(white(1, 1), true);
    assert.equal(white(0, 0), false);
    assert.equal(white(2, 1), false);
    assert.ok(Array.from(m.data).every((v, i) => i % 4 !== 3 || v === 255));

    assert.deepEqual(await editor.acceptAi(), { ok: true, revision: 6 });
    assert.equal(editor.revision, 6);
    acceptResult = { ok: false, reason: 'no-candidate' };
    assert.ok((await editor.acceptAi()).message.includes('没有可接受'));
    acceptResult = { ok: false, reason: 'stale-revision' };
    assert.ok((await editor.acceptAi()).message.includes('已在别处被修改'));
    editor.cancelAi();
    assert.equal(inpaint.cancelled, true);

    const noAi = await loadMatteEditor(service, 'sp', { decodeImage, encodePixels, aiUnavailableReason: '智绘姬不支持局部重绘' });
    assert.equal(noAi.aiAvailable, false);
    assert.equal(noAi.aiUnavailableReason, '智绘姬不支持局部重绘');
    const blocked = await noAi.aiRepair(selection, '');
    assert.equal(blocked.reason, 'image-edit-unsupported');
    assert.equal(blocked.message, '智绘姬不支持局部重绘');
});
