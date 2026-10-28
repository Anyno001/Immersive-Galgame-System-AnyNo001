import test from 'node:test';
import assert from 'node:assert/strict';
import { releasedGeneratedImageIds } from '../src/visual/igs-ui/settings-actions.js';
import { readLegacyPresetsView, LEGACY_PRESET_KEY } from '../src/scene/legacy-preset.js';
import { collectGeneratedImageIds, generatedAssetIdOf, GENERATED_ASSET_URL_PREFIX } from '../src/scene/asset-match.js';

const url = (id) => `${GENERATED_ASSET_URL_PREFIX}${id}`;

function countingStorage(seed = {}) {
    const m = new Map(Object.entries(seed));
    const reads = [];
    return { reads, getItem: (k) => { reads.push(k); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('无图被丢弃时保存不读旧预设与待确认；有图被丢弃时照常释放', () => {
    const assets = { characters: { a: { 平和: url('keep') } } };
    const storage = countingStorage();
    assert.deepEqual(releasedGeneratedImageIds(['keep'], assets, storage), []);
    assert.equal(storage.reads.length, 0, '没有丢弃时不碰存储');
    assert.deepEqual(releasedGeneratedImageIds(['keep', 'gone'], assets, storage), ['gone']);
    assert.ok(storage.reads.includes(LEGACY_PRESET_KEY));
    assert.ok(storage.reads.includes('igs:story-outfit-review:v1'));
    const held = countingStorage({ [LEGACY_PRESET_KEY]: JSON.stringify({ version: 1, presets: { p: { characters: { b: { 平和: url('gone') } } } } }) });
    assert.deepEqual(releasedGeneratedImageIds(['gone'], assets, held), [], '旧预设仍引用的图不释放');
});

test('同一次保存内素材库图 id 只收集一次', () => {
    let walks = 0;
    const assets = new Proxy({ characters: { a: { 平和: url('x') } } }, { ownKeys(t) { walks++; return Reflect.ownKeys(t); } });
    const ids = collectGeneratedImageIds(assets);
    assert.deepEqual(ids, ['x']);
    const before = walks;
    assert.deepEqual(releasedGeneratedImageIds(['x'], assets, countingStorage(), ids), []);
    assert.equal(walks, before, '传入已算好的 id 集合后不再遍历素材库');
});

test('预设串不变时重绘复用解析结果，串变了看到新值', () => {
    const raw = (name) => JSON.stringify({ version: 1, presets: { [name]: { scenes: { s: { url: 'u' } } } } });
    const storage = countingStorage({ [LEGACY_PRESET_KEY]: raw('甲') });
    const first = readLegacyPresetsView(storage);
    const second = readLegacyPresetsView(storage);
    assert.equal(second.presets, first.presets);
    assert.deepEqual(Object.keys(first.presets), ['甲']);
    assert.equal(second.layersOf(second.presets['甲']), first.layersOf(first.presets['甲']), '卡层共用');
    storage.setItem(LEGACY_PRESET_KEY, raw('乙'));
    assert.deepEqual(Object.keys(readLegacyPresetsView(storage).presets), ['乙']);
    storage.setItem(LEGACY_PRESET_KEY, '');
    assert.deepEqual(readLegacyPresetsView(storage).presets, {});
});
