import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { prepareReaderFloor } from '../src/visual/igs-ui/reader-floor-plan.js';
import { prepareReaderFloorAssets } from '../src/visual/igs-ui/reader-floor-assets.js';
import { normalizeLive2dConfig, saveLive2dConfig } from '../src/visual/igs-ui/live2d-config.js';
import { syncLive2dStage, disposeLive2dStage } from '../src/visual/igs-ui/live2d-stage.js';

const binding = { url: 'https://example.com/fixture/model3.json', moods: { 喜悦: { expression: 'joy' }, 愤怒: { expression: 'angry' } } };
const config = (enabled = true, bindings = { 爱音: binding }) => normalizeLive2dConfig({ enabled, bindings });
function prepared(raw, sceneAssets, live2d) {
    const extracted = buildIgsTextPayload(raw, { sceneAssets });
    const readerSettings = { _sceneAssets: sceneAssets, _live2d: live2d, stageCast: { enabled: true } }, payload = { raw };
    const floor = prepareReaderFloor({ text: extracted.formattedText, segments: extracted.textSegments, extracted, payload, scene: {}, readerSettings });
    const tableData = { revision: 0, prepareCharacters() {}, outfitClues: null };
    const assets = () => prepareReaderFloorAssets(floor, { payload, readerSettings, tableData, assetMatchCtx: { sceneAssets, live2dConfig: readerSettings._live2d } });
    return { floor, readerSettings, assets };
}

test('live2d:upgrade:same-floor-cache-rebuilds-on-enable-disable-remove-and-alias-change', () => {
    const sceneAssets = { enabled: true, characters: { 爱音: { 喜悦: 'joy.png', 默认: 'base.png' } }, characterAliases: { 爱音: ['小音'] } };
    const initial = structuredClone(sceneAssets), r = prepared('[igs-char:小音|喜悦|你好。]', sceneAssets, config(false));
    const first = r.assets(); assert.ok(first.urls.includes('joy.png'));
    r.readerSettings._live2d = config();
    const enabled = r.assets(); assert.notEqual(enabled, first);
    assert.equal(enabled.sprite('小音', '喜悦').source, 'live2d'); assert.deepEqual(enabled.urls, []);
    r.readerSettings._live2d = config(false);
    const disabled = r.assets(); assert.notEqual(disabled, enabled);
    assert.equal(disabled.sprite('小音', '喜悦').url, 'joy.png'); assert.ok(disabled.urls.includes('joy.png'));
    r.readerSettings._live2d = config(true, {}); assert.equal(r.assets().sprite('小音', '喜悦').url, 'joy.png');
    r.readerSettings._live2d = config(); assert.deepEqual(r.assets().urls, []);
    r.readerSettings._live2d = config(true, { 新别名: binding });
    const unaliased = r.assets(); assert.equal(unaliased.sprite('爱音', '喜悦').url, 'joy.png');
    sceneAssets.characterAliases = { 爱音: ['小音', '新别名'] };
    const aliased = r.assets(); assert.notEqual(aliased, unaliased);
    assert.equal(aliased.sprite('爱音', '喜悦').source, 'live2d'); assert.deepEqual(aliased.urls, []);
    sceneAssets.characterAliases = initial.characterAliases; assert.deepEqual(sceneAssets, initial, '启停和绑定不写回原静态素材');
});

test('live2d:upgrade:model-only-names-participate-in-alias-focus-pronouns-and-leaving', () => {
    const sceneAssets = { enabled: true, characters: { 白墨: { 默认: 'bai.png' } }, characterAliases: { 爱音: ['小音'] }, characterDna: { 爱音: { triggerWords: '1girl' }, 白墨: { triggerWords: '1boy' } } };
    const before = structuredClone(sceneAssets);
    const r = prepared('[igs-char:白墨|平和|你好。]\n小音推开门。\n她恼怒地皱眉。\n她转身离开了房间。', sceneAssets, config());
    assert.equal(r.floor.pages[1].spriteChar, '爱音');
    assert.equal(r.floor.pages[2].spriteChar, '爱音'); assert.equal(r.floor.pages[2].spriteMood, '愤怒');
    assert.equal(r.floor.pages[3].narrationDroppedKey, '爱音');
    assert.deepEqual(sceneAssets, before); assert.equal(Object.hasOwn(sceneAssets.characters, '爱音'), false);
});

test('live2d:upgrade:same-host-reprepares-model-roster-without-settings-revision-or-reimport', t => {
    const storage = createMemoryStorage(), sceneAssets = { enabled: true, characters: { 白墨: { 默认: 'bai.png' } }, characterAliases: { 爱音: ['小音'] } };
    saveLive2dConfig(storage, '', config(false));
    const host = createIgsReaderHost({ global: { localStorage: storage }, pageRenderGapMs: 0, getUnifiedSettings: () => ({ bridge: { sceneAssets }, readerSettings: { titleScreen: false, typewriter: { enabled: false } } }) });
    t.after(() => host.destroy());
    const payload = { messageId: 60, raw: '[igs-char:白墨|平和|你好。]\n爱音推开门。' };
    const opened = host.openReader(payload, { mode: 'pc', skipTitle: true }), current = () => host.getState().activeReader.snapshot.content;
    opened.controller.invokeAction('next'); assert.equal(current().spriteLive2d, null);
    saveLive2dConfig(storage, '', config()); host.replaceReader(payload);
    opened.controller.invokeAction('next'); assert.equal(current().spriteLive2d.character, '爱音');
    saveLive2dConfig(storage, '', config(false)); host.replaceReader(payload);
    opened.controller.invokeAction('next'); assert.equal(current().spriteLive2d, null);
    saveLive2dConfig(storage, '', config(true, {})); host.replaceReader(payload);
    opened.controller.invokeAction('next'); assert.equal(current().spriteLive2d, null);
    assert.equal(Object.hasOwn(sceneAssets.characters, '爱音'), false);
});

test('live2d:upgrade:bound-speaker-does-not-remove-an-unbound-static-companion', () => {
    const sceneAssets = { enabled: true, characters: { 白墨: { 默认: 'bai.png' }, 爱音: { 默认: 'ainon.png' } } };
    const r = prepared('[igs-char:白墨|平和|我在这里。]\n[igs-char:爱音|喜悦|你好。]', sceneAssets, config()), lookup = r.assets();
    assert.ok(r.floor.pages[1].cast.some(person => person.character === '白墨'));
    assert.ok(lookup.urls.includes('bai.png')); assert.equal(lookup.urls.includes('ainon.png'), false);
    assert.equal(lookup.sprite('白墨', '平和').url, 'bai.png');
});

function classes() {
    const set = new Set();
    return { add: name => set.add(name), remove: name => set.delete(name), contains: name => set.has(name), toggle(name, enabled) { if (enabled) set.add(name); else set.delete(name); } };
}
test('live2d:upgrade:covered-rest-hidden-and-legacy-pause-reach-the-existing-frame-and-clean-up', () => {
    const sent = [], events = new Map(), docEvents = new Map(), attrs = new Set();
    let observed, notify, disconnected = false, removed = false, cleared = 0;
    const view = { crypto: { randomUUID: () => 'upgrade-test' }, setTimeout: () => 1, clearTimeout: () => cleared++,
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
        MutationObserver: class { constructor(fn) { notify = fn; } observe(_root, options) { observed = options; } disconnect() { disconnected = true; } } };
    const frame = { style: {}, setAttribute() {}, contentWindow: { postMessage: data => sent.push(data) }, remove() { removed = true; } };
    const doc = { hidden: false, defaultView: view, createElement: () => frame, addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: name => docEvents.delete(name) };
    const sprite = { ownerDocument: doc, classList: classes(), style: {}, append() {} }, root = { hasAttribute: name => attrs.has(name), classList: classes(), querySelector: () => null }, current = {}, model = { ...binding, action: {}, runtime: {} };
    syncLive2dStage(root, sprite, current, model, {});
    events.get('message')({ source: frame.contentWindow, data: { channel: 'igs-live2d-upgrade-test', type: 'boot' } });
    assert.equal(sent.at(-1).state.paused, false);
    for (const attr of ['data-igs-paused', 'data-igs-stage-covered', 'data-igs-stage-rest']) {
        assert.ok(observed.attributeFilter.includes(attr)); attrs.add(attr); notify(); assert.equal(sent.at(-1).state.paused, true);
        attrs.delete(attr); notify(); assert.equal(sent.at(-1).state.paused, false);
    }
    doc.hidden = true; docEvents.get('visibilitychange')(); assert.equal(sent.at(-1).state.paused, true);
    doc.hidden = false; root.classList.add('igs-hidden'); notify(); assert.equal(sent.at(-1).state.paused, true);
    root.classList.remove('igs-hidden'); syncLive2dStage(root, sprite, current, model, {});
    assert.equal(current.live2dStage.frame, frame); assert.equal(sent.at(-1).state.paused, false);
    disposeLive2dStage(current); assert.equal(removed, true); assert.equal(disconnected, true); assert.ok(cleared > 0);
    assert.equal(events.size, 0); assert.equal(docEvents.size, 0); assert.equal(current.live2dStage, null);
});
