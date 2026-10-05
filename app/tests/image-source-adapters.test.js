import test from 'node:test';
import assert from 'node:assert/strict';

import { createImageBackend } from '../src/generated-images/image-backend.js';
import { parseCaptionSlots } from '../src/generated-images/illustration/caption-writer.js';

function fakeBaibai({ supportsCharacters = false, fail = null } = {}) {
    const calls = [];
    return {
        calls,
        apiVersion: 1,
        getBackendStatus: () => ({ configured: true, supportsCharacters, reason: '' }),
        async generate(request) {
            calls.push(request);
            if (fail) throw Object.assign(new Error(fail), { code: 'backend_error' });
            return { dataUrl: 'data:image/png;base64,AAAA' };
        },
    };
}

function backendWith(api, { apiKey = '' } = {}) {
    const naiCalls = [];
    const backend = createImageBackend({
        global: { STBaiBaiImage: api },
        getBridge: () => ({ imageApi: { mode: 'baibai' }, autoIllustration: { nai: { apiKey } } }),
        nai: { async generate(slot) { naiCalls.push(slot); return { ok: true, dataUrl: 'data:image/png;base64,NAI' }; } },
    });
    return { backend, naiCalls };
}

const slot = { scene: 'cafe, afternoon light', sceneUc: 'lowres', chars: [{ name: '阿黛尔', tags: '1girl, silver hair' }] };

test('gate:baibai:joins-chars-and-skips-gallery', async () => {
    const api = fakeBaibai();
    const { backend } = backendWith(api);
    assert.equal(backend.describe().via, 'baibai');
    const result = await backend.generate(slot, { size: '1216x832' });
    assert.equal(result.ok, true);
    assert.equal(result.via, 'baibai');
    assert.deepEqual(api.calls[0], { prompt: 'cafe, afternoon light, 1girl, silver hair', negative: 'lowres', size: 'landscape', save: false });
});

test('gate:baibai:splits-characters-when-supported', async () => {
    const api = fakeBaibai({ supportsCharacters: true });
    const { backend } = backendWith(api);
    await backend.generate(slot, { size: '832x1216' });
    assert.equal(api.calls[0].prompt, 'cafe, afternoon light');
    assert.deepEqual(api.calls[0].characters, [{ name: '阿黛尔', tag: '1girl, silver hair' }]);
    assert.equal(api.calls[0].size, 'portrait');
});

test('gate:baibai:falls-back-to-nai-or-reports', async () => {
    const withKey = backendWith(fakeBaibai({ fail: 'boom' }), { apiKey: 'k' });
    const fallback = await withKey.backend.generate(slot, { apiKey: 'k' });
    assert.equal(fallback.via, 'nai');
    assert.equal(withKey.naiCalls.length, 1);

    const missing = backendWith(null);
    assert.equal(missing.backend.describe().ready.ok, false);
    const failed = await missing.backend.generate(slot, {});
    assert.equal(failed.ok, false);
    assert.match(failed.error, /未检测到柏宝绘/);
});

function llmBackend(mode, { llmSettings = {}, reply = '', api = fakeBaibai() } = {}) {
    const llmCalls = [];
    const naiCalls = [];
    const backend = createImageBackend({
        global: { STBaiBaiImage: api },
        getBridge: () => ({ imageApi: { mode }, autoIllustration: { llm: llmSettings, nai: { apiKey: 'k', size: '832x1216' } } }),
        nai: { async generate(slot, settings) { naiCalls.push({ slot, settings }); return { ok: true, dataUrl: 'data:image/png;base64,NAI' }; } },
        llm: { async request(messages) { llmCalls.push(messages); return reply; } },
    });
    return { backend, llmCalls, naiCalls, api };
}

test('gate:caption-writer:parses-numbered-slots', () => {
    const parsed = parseCaptionSlots('```\n#1\nscene: 1girl, cowboy shot\nchar: smile\nuc: lowres\n#2\nscene: 1girl\nchar: angry\n```');
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.captions.map((item) => item.slotId), [1, 2]);
    assert.equal(parsed.captions[0].caption.v4_prompt.caption.base_caption, '1girl, cowboy shot');
    assert.equal(parsed.captions[0].caption.v4_prompt.caption.char_captions[0].char_caption, 'smile');
    assert.equal(parsed.captions[0].caption.v4_negative_prompt.caption.base_caption, 'lowres');
    const clothes = parseCaptionSlots('scene: school uniform, pleated skirt\nchar:');
    assert.deepEqual(clothes.captions[0].caption.v4_prompt.caption.char_captions, []);
});

test('gate:caption-writer:non-dbgen-writes-with-llm-and-paints-with-source', async () => {
    const { backend, llmCalls, api } = llmBackend('baibai', { reply: '#1\nscene: 1girl, cowboy shot\nchar: silver hair, smile' });
    const written = await backend.writeDbgenPrompt({ description: '为角色「阿黛尔」写 1 份立绘表情差分。' });
    assert.equal(written.ok, true);
    assert.equal(llmCalls.length, 1);
    assert.match(llmCalls[0].user, /阿黛尔/);
    const painted = await backend.generateDbgenCaption({ caption: written.caption, size: '832x1216', userPrompts: { positive: 'grey background', negative: 'bad hands' } });
    assert.equal(painted.ok, true);
    assert.equal(painted.via, 'baibai');
    assert.match(api.calls[0].prompt, /grey background/);
    assert.match(api.calls[0].prompt, /silver hair, smile/);
    assert.match(api.calls[0].negative, /bad hands/);
    assert.equal(api.calls[0].size, 'portrait');
});

test('gate:caption-writer:reminds-when-llm-not-connected', async () => {
    const { backend, llmCalls } = llmBackend('nai', { llmSettings: { source: 'openai', endpoint: '', model: '' } });
    const written = await backend.writeDbgenPrompt({ description: '画角色「阿黛尔」的立绘。' });
    assert.equal(written.ok, false);
    assert.match(written.error, /还没接副 LLM/);
    assert.match(written.error, /生图 → 副 LLM/);
    assert.equal(llmCalls.length, 0);
});

test('gate:caption-writer:nai-source-paints-caption-as-slot', async () => {
    const { backend, naiCalls } = llmBackend('nai');
    const caption = parseCaptionSlots('scene: 1girl\nchar: smile\nuc: blurry').captions[0].caption;
    const painted = await backend.generateDbgenCaption({ caption, size: '1024x1024', transparent: true });
    assert.equal(painted.ok, true);
    assert.equal(naiCalls[0].settings.size, '1024x1024');
    assert.equal(naiCalls[0].slot.transparent, true);
    assert.deepEqual(naiCalls[0].slot.chars, [{ tags: 'smile', uc: '', x: 0.5, y: 0.5 }]);
    assert.equal(naiCalls[0].slot.sceneUc, 'blurry');
});

function floorBackend(api, { mes = '', autoTag = false, sleep = async () => {} } = {}) {
    const chat = [];
    chat[5] = { mes };
    const context = { chat, extensionSettings: { baibai_image: { enabled: true, autoTag: { enabled: autoTag } } } };
    const naiCalls = [];
    const backend = createImageBackend({
        global: { STBaiBaiImage: api, SillyTavern: { getContext: () => context } },
        getBridge: () => ({ imageApi: { mode: 'baibai' }, autoIllustration: { nai: {} } }),
        nai: { async generate(s) { naiCalls.push(s); return { ok: true, dataUrl: 'data:image/png;base64,NAI' }; } },
        baibaiFloorWait: { timeoutMs: 30, intervalMs: 10, sleep: () => sleep(context) },
    });
    return { backend, context, naiCalls };
}

test('gate:baibai:story-cg-uses-baibai-floor-tags', async () => {
    const api = fakeBaibai({ supportsCharacters: true });
    const mes = '正文<bbi_image>1girl, cafe</bbi_image>中间<bbi_image>2girls, rooftop, silver hair<nl>Two girls on a rooftop.</nl></bbi_image>';
    const { backend } = floorBackend(api, { mes });
    await backend.generate(slot, { size: '1216x832' }, { messageId: 5, slot: 2 });
    assert.equal(api.calls[0].prompt, '2girls, rooftop, silver hair');
    assert.equal(api.calls[0].nl, 'Two girls on a rooftop.');
    assert.equal(api.calls[0].characters, undefined);
    assert.equal(api.calls[0].negative, 'lowres');
});

test('gate:baibai:falls-back-to-igs-tags-without-floor-tags', async () => {
    const api = fakeBaibai();
    const { backend } = floorBackend(api, { mes: '正文<bbi_image>1girl, cafe</bbi_image>' });
    await backend.generate(slot, { size: '1216x832' }, { messageId: 5, slot: 2 });
    assert.equal(api.calls[0].prompt, 'cafe, afternoon light, 1girl, silver hair');
    await backend.generate(slot, { size: '1216x832' });
    assert.equal(api.calls[1].prompt, 'cafe, afternoon light, 1girl, silver hair');
});

test('gate:baibai:waits-for-baibai-auto-tagging', async () => {
    const api = fakeBaibai();
    let naps = 0;
    const { backend } = floorBackend(api, { mes: '正文', autoTag: true, sleep: async (context) => { naps += 1; if (naps === 2) context.chat[5].mes += '<bbi_image>1girl, written later</bbi_image>'; } });
    await backend.generate(slot, { size: '1216x832' }, { messageId: 5, slot: 1 });
    assert.equal(api.calls[0].prompt, '1girl, written later');
});
