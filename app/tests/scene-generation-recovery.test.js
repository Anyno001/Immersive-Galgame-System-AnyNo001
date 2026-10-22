import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService, createAutoIllustrationService } from './helpers/media-fixtures.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createImageBackend } from '../src/generated-images/image-backend.js';
import { lookupSceneBackground } from '../src/scene/scene-directives.js';
import { resolveBackgroundAsset, bindGeneratedBackground } from '../src/scene/asset-match.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDpYAAAAASUVORK5CYII=';
const caption = text => ({
    v4_prompt: { caption: { base_caption: text, char_captions: [] } },
    v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
});
const state = { scene: '教室', time: '夜晚', weather: '雨' };
const assets = () => ({ enabled: true, scenes: { 教室: { url: 'igs-gen:base', times: {} } }, characters: {} });

function host(text = '[igs-scene:教室|夜晚|雨]\n[igs-char:艾莉|平和|教室里的灯已经熄灭。]') {
    let floor = { chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text };
    return {
        getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [], destroy() {},
        setFloor: value => { floor = { ...floor, ...value }; },
        ensureMarkerRegexes: async () => ({ ok: true }),
        writeFloor: async (id, text) => { floor = { ...floor, text }; return { ok: true }; },
    };
}

function variants(t, { prompt, nai, tempRecord, auto = { backgroundEnabled: true } } = {}) {
    const store = createMemoryGeneratedAssetStore();
    const sceneAssets = assets();
    const messageHost = host('[igs-scene:教室|夜晚|雨]\n教室里的灯已经熄灭。');
    const service = createAssetGenerationService({
        store, nai, messageHost, minBodyChars: 0, newId: () => 'new-image',
        getSettings: () => ({ sceneAssets, autoIllustration: { assets: auto } }),
    });
    t.after(() => service.stop());
    const ready = Promise.all([
        store.putImage({ id: 'base', type: 'background', dataUrl: PNG, ...(prompt && { prompt }) }),
        tempRecord ? store.putAsset({ key: 'c|bg|教室|夜晚', chatId: 'c', floorKey: 'c|3|0', type: 'background', name: '教室', time: '夜晚', imageId: '', ...tempRecord }) : null,
    ]);
    return { service, store, sceneAssets, messageHost, ready };
}

test('gate:scene-recovery:empty-or-unavailable-variants-fall-back-within-the-same-scene', () => {
    const sceneAssets = { scenes: { 教室: { url: 'base.png', times: { 夜晚: { url: 'night.png', weathers: { 雨: { url: '' } } } } } } };
    assert.deepEqual([lookupSceneBackground(state, sceneAssets).url, lookupSceneBackground(state, sceneAssets).timed], ['night.png', true]);
    sceneAssets.scenes.教室.times.夜晚.url = '  ';
    assert.deepEqual([lookupSceneBackground(state, sceneAssets).url, lookupSceneBackground(state, sceneAssets).timed], ['base.png', false]);
    sceneAssets.scenes.教室.times.夜晚 = null;
    assert.equal(lookupSceneBackground(state, sceneAssets).url, 'base.png');
    sceneAssets.scenes.教室.times.夜晚 = { url: 'igs-gen:lost' };
    assert.equal(resolveBackgroundAsset(state, { sceneAssets, isMissingImage: url => url === 'igs-gen:lost' }).url, 'base.png');
});

test('gate:scene-recovery:empty-registration-keeps-library-chat-and-generation-fallbacks', () => {
    const sceneAssets = { scenes: { 教室: { url: '', times: {} } } };
    const generatedAssets = { scenes: { 教室: { url: 'library.png', times: {} } } };
    assert.equal(resolveBackgroundAsset(state, { sceneAssets, generatedAssets }).url, 'library.png');
    assert.equal(resolveBackgroundAsset(state, { sceneAssets, tempBackground: () => 'chat.png' }).url, 'chat.png');
    assert.equal(resolveBackgroundAsset(state, { sceneAssets }).needsGeneration, true);
    sceneAssets.scenes.默认 = { url: 'default.png' };
    const placeholder = resolveBackgroundAsset(state, { sceneAssets });
    assert.deepEqual([placeholder.url, placeholder.source, placeholder.needsGeneration], ['default.png', 'placeholder', true]);
});
