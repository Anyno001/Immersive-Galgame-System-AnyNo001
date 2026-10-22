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

function classes() {
    const set = new Set();
    return { add: name => set.add(name), remove: name => set.delete(name), contains: name => set.has(name), toggle(name, enabled) { if (enabled) set.add(name); else set.delete(name); } };
}