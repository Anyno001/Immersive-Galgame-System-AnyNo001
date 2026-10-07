import test from 'node:test';
import assert from 'node:assert/strict';

import { sceneTimeBucket } from '../src/scene/time-bucket.js';
import { lookupSceneBackground, sceneTimeSlot } from '../src/scene/scene-directives.js';
import { resolveBackgroundAsset, collectAssetNeeds, bindGeneratedBackground } from '../src/scene/asset-match.js';
import { promptTimeBucket, sceneVariantTags } from '../src/generated-images/scene-variant-tags.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';

const GEN_SCENES = { enabled: true, scenes: { 教室: { url: 'igs-gen:base', times: {} }, 天台: { url: 'roof.png', times: {} } }, characters: {} };

test('gate:scene-time-variant:four-buckets-and-prompt-detection', () => {
    assert.deepEqual(['深夜', '晚上', '傍晚', '凌晨', '早上', '下午', '放学后'].map(sceneTimeBucket), ['夜晚', '夜晚', '黄昏', '夜晚', '清晨', '白天', '']);
    assert.equal(promptTimeBucket('classroom, (night), moonlight, desk'), '夜晚');
    assert.equal(promptTimeBucket('sunset, classroom, day'), '黄昏');
    assert.equal(promptTimeBucket('classroom, desk, no humans'), '白天');
    assert.equal(sceneTimeSlot('晚上', [{ label: '夜里', words: ['晚上', '半夜'] }]), '夜里');
    assert.equal(sceneTimeSlot('深夜', []), '夜晚');
    assert.ok(sceneVariantTags('夜晚', '').startsWith('night, night sky'));
});

test('gate:scene-time-variant:same-bucket-slot-is-used-before-grading', () => {
    const assets = { scenes: { 教室: { url: 'day.png', times: { 夜晚: { url: 'night.png', weathers: {} } } } } };
    const hit = lookupSceneBackground({ scene: '教室', time: '深夜' }, assets);
    assert.deepEqual([hit.url, hit.timed], ['night.png', true]);
    assert.equal(lookupSceneBackground({ scene: '教室', time: '下午' }, assets).url, 'day.png');
});

test('gate:scene-time-variant:only-generated-registered-scenes-ask-for-a-variant', () => {
    const night = resolveBackgroundAsset({ scene: '教室', time: '夜晚' }, { sceneAssets: GEN_SCENES });
    assert.equal(night.url, 'igs-gen:base');
    assert.equal(night.needsGeneration, false);
    assert.deepEqual(night.timeVariant, { scene: '教室', time: '夜晚', baseImageId: 'base' });
    assert.equal(resolveBackgroundAsset({ scene: '天台', time: '夜晚' }, { sceneAssets: GEN_SCENES }).timeVariant, undefined);
    assert.equal(resolveBackgroundAsset({ scene: '教室', time: '' }, { sceneAssets: GEN_SCENES }).timeVariant, undefined);

    const shown = resolveBackgroundAsset({ scene: '教室', time: '深夜' }, { sceneAssets: GEN_SCENES, tempSceneTime: (s, t) => (t === '夜晚' ? { url: 'igs-gen:v1' } : null) });
    assert.deepEqual([shown.url, shown.source, shown.timed], ['igs-gen:v1', 'temp', true]);
    const tried = resolveBackgroundAsset({ scene: '教室', time: '夜晚' }, { sceneAssets: GEN_SCENES, tempSceneTime: () => ({ url: '' }) });
    assert.deepEqual([tried.url, tried.timeVariant], ['igs-gen:base', undefined]);

    const needs = collectAssetNeeds({ scenes: [{ scene: '教室', time: '夜晚' }, { scene: '教室', time: '深夜' }, { scene: '天台', time: '夜晚' }] }, { sceneAssets: GEN_SCENES }, { background: true });
    assert.deepEqual(needs, [{ type: 'background', name: '教室', time: '夜晚', weather: '', variantOf: 'base' }]);
});

test('gate:scene-time-variant:accepting-into-a-library-only-scene-keeps-the-base-image', () => {
    const bound = bindGeneratedBackground({ scenes: {} }, { type: 'background', name: '教室', time: '夜晚', imageId: 'v1', variantOf: 'base' }, '教室');
    assert.equal(bound.scenes.教室.url, 'igs-gen:base');
    assert.equal(bound.scenes.教室.times.夜晚.url, 'igs-gen:v1');
});

function variantService(basePrompt, text = '[igs-scene:教室|夜晚|雨]\n灯都关了。') {
    const store = createMemoryGeneratedAssetStore();
    const captions = [];
    let llmCalls = 0;
    let id = 0;
    const floor = { chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { llmCalls += 1; return ''; } },
        nai: {
            describe: () => ({ mode: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            async writeDbgenPrompt() { llmCalls += 1; return { ok: false }; },
            async generateDbgenCaption(meta) { captions.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,NIGHT' }; },
        },
        store,
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true } }, sceneAssets: GEN_SCENES }),
        newId: () => `v${++id}`,
        minBodyChars: 0,
    });
    return { service, store, captions, llmCalls: () => llmCalls, ready: store.putImage({ id: 'base', type: 'background', dataUrl: 'data:,', prompt: { positive: basePrompt, negative: 'lowres' } }) };
}

test('gate:scene-time-variant:service-paints-from-the-stored-prompt-into-review', async () => {
    const { service, captions, llmCalls, ready } = variantService('classroom, day, blue sky, desk, no humans');
    await ready;
    const result = await service.processMessage(3);
    assert.deepEqual([result.ok, result.count, llmCalls()], [true, 1, 0]);
    const base = captions[0].caption.v4_prompt.caption.base_caption;
    assert.ok(base.startsWith('night, night sky'));
    assert.ok(!/\bday\b|blue sky/.test(base) && base.includes('desk'));
    const review = service.listReview('c|3|0');
    assert.deepEqual(review.map((r) => [r.type, r.name, r.time, r.variantOf, r.url]), [['background', '教室', '夜晚', 'base', 'igs-gen:v1']]);
    const shown = resolveBackgroundAsset({ scene: '教室', time: '夜晚' }, { sceneAssets: GEN_SCENES, tempSceneTime: service.tempSceneTime });
    assert.deepEqual([shown.url, shown.timed], ['igs-gen:v1', true]);

    await service.setStatus(review[0].key, 'discarded');
    await service.processMessage(3, { manual: true });
    assert.equal(captions.length, 1);
});

test('gate:scene-time-variant:base-already-in-that-time-paints-nothing', async () => {
    const { service, captions, ready } = variantService('classroom, night, moonlight, desk');
    await ready;
    const result = await service.processMessage(3);
    assert.deepEqual([result.ok, result.count, captions.length], [true, 0, 0]);
    await service.processMessage(3, { manual: true });
    assert.equal(captions.length, 0);
});
