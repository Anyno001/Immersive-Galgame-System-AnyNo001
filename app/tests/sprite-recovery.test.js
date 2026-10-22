import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createLocalImageCache } from '../src/media/tavern-image-cache.js';
import { createMemoryAssetThumbStore } from '../src/media/asset-thumb-store.js';
import { pixel, settleMedia } from './helpers/fake-media-server.js';

function fixture(t, { thumbs = false } = {}) {
    let time = 0, image = pixel('white'), error = null, reads = 0;
    const cache = createLocalImageCache({}, { now: () => time });
    const signals = new EventTarget(), notifications = [];
    const global = { addEventListener: signals.addEventListener.bind(signals), removeEventListener: signals.removeEventListener.bind(signals) };
    const service = createAssetGenerationService({
        global, mediaCache: cache, getSettings: () => ({}),
        messageHost: { getChatId: () => 'chat', on: () => () => {} },
        store: { getImage: async () => { reads++; if (error) throw error; return image ? { dataUrl: image } : null; } },
        events: { emit: (_name, detail) => notifications.push(detail) },
        ...(thumbs ? { thumbStore: createMemoryAssetThumbStore({ mediaCache: cache }), makeThumb: async () => pixel('thumb') } : {}),
    });
    t.after(async () => { service.stop(); await cache.destroy(); });
    return { service, cache, signals, notifications, setImage: value => { image = value; }, setError: value => { error = value; }, advance: value => { time += value; }, reads: () => reads };
}

test('gate:sprite:registered-empty-original-does-not-block-the-same-character-library', () => {
    const sceneAssets = { characters: { 白墨: {} }, characterAliases: { 白墨: ['陛下'] } };
    for (const name of ['白墨', '陛下']) {
        const hit = resolveSpriteAsset(name, '惊艳', { sceneAssets, generatedAssets: { characters: { 白墨: { 平和: 'igs-gen:library' } } } });
        assert.equal(hit.url, 'igs-gen:library'); assert.equal(hit.character, '白墨'); assert.equal(hit.source, 'library'); assert.equal(hit.needsGeneration, false);
    }
});

test('gate:sprite:unavailable-original-continues-to-library-and-chat-fallbacks', () => {
    const sceneAssets = { characters: { 白墨: { 默认: 'igs-gen:lost' } } };
    const ctx = { sceneAssets, isMissingImage: url => url === 'igs-gen:lost' };
    assert.equal(resolveSpriteAsset('白墨', '惊艳', { ...ctx, generatedAssets: { characters: { 白墨: { 默认: 'igs-gen:library' } } } }).url, 'igs-gen:library');
    assert.equal(resolveSpriteAsset('白墨', '惊艳', { ...ctx, tempSprite: name => name === '白墨' ? 'igs-gen:chat' : '' }).url, 'igs-gen:chat');
});
