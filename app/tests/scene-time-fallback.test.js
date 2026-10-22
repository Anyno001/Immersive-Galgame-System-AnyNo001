import { createAssetGenerationService } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { sceneTimeBucket, sceneTimeKey } from '../src/scene/time-bucket.js';
import { sceneVariantTags } from '../src/generated-images/scene-variant-tags.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { normalizeAutoIllustrationSettings } from '../src/generated-images/illustration/auto-illustration-settings.js';

test('gate:scene-time-fallback:words-map-into-the-four-buckets', () => {
    const cases = {
        白天: ['上午', '中午', '正午', '晌午', '午后', '下午', '午时', '巳时', '未时', '申时', 'midday', 'afternoon'],
        清晨: ['清晨', '早上', '早晨', '清早', '拂晓', '黎明', '破晓', '天亮', '卯时', '辰时', 'dawn'],
        黄昏: ['傍晚', '黄昏', '日落', '日暮', '暮色', '晚霞', '酉时', 'twilight'],
        夜晚: ['入夜', '晚上', '夜里', '深夜', '午夜', '凌晨', '半夜', '三更半夜', '子时', '丑时', '寅时', '戌时', '亥时', '五更'],
    };
    for (const [bucket, words] of Object.entries(cases)) {
        for (const word of words) assert.equal(sceneTimeBucket(word), bucket, word);
    }
    assert.equal(sceneTimeBucket('放学后'), '');
    assert.equal(sceneTimeBucket(''), '');
    assert.equal(sceneTimeKey('三更半夜'), 'midnight');
});

const NO_SCENES = { enabled: true, scenes: {}, characters: {} };
const dayCaption = { v4_prompt: { caption: { base_caption: 'tavern, day, blue sky, wooden table', char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } };

function setup({ dayFirst = true, canCaption = true, texts = ['[igs-scene:酒馆|夜晚|晴]\n灯亮了。'] } = {}) {
    const store = createMemoryGeneratedAssetStore();
    const calls = [];
    const seeds = [];
    let id = 0;
    const floors = texts.map((text, index) => ({ chatId: 'c', messageId: index + 1, swipeId: 0, isAi: true, isLatest: true, text }));
    const nai = {
        describe: () => ({ mode: 'dbgen', via: 'dbgen', ownPrompts: canCaption, ready: { ok: true } }),
        async writeDbgenPrompt({ description }) { calls.push(['write', description]); return { ok: true, captions: [{ slotId: 1, caption: dayCaption }] }; },
        async generate(slot) { calls.push(['direct', slot.scene]); return { ok: true, dataUrl: 'data:image/png;base64,DIRECT' }; },
        ...(canCaption && {
            async generateDbgenCaption(meta) {
                const base = meta.caption.v4_prompt.caption.base_caption;
                calls.push(['caption', base]);
                seeds.push(meta.seed);
                return { ok: true, dataUrl: 'data:image/png;base64,X', prompt: { positive: base, negative: 'lowres' } };
            },
        }),
    };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: (n) => floors[n - 1], readPreviousAiTexts: () => [] },
        llm: { async request() { return ''; } },
        nai,
        store,
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true, ...(dayFirst !== undefined && { dayFirst }) } }, sceneAssets: NO_SCENES }),
        newId: () => `v${++id}`,
        minBodyChars: 0,
    });
    return { service, calls, seeds };
}
