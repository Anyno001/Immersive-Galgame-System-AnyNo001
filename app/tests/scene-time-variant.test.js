import { createAssetGenerationService } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { sceneTimeBucket } from '../src/scene/time-bucket.js';
import { lookupSceneBackground, sceneTimeSlot } from '../src/scene/scene-directives.js';
import { resolveBackgroundAsset, collectAssetNeeds, bindGeneratedBackground } from '../src/scene/asset-match.js';
import { promptTimeBucket, sceneVariantTags } from '../src/generated-images/scene-variant-tags.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';


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
