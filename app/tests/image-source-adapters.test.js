import test from 'node:test';
import assert from 'node:assert/strict';
import { pngFixture } from './helpers/png-fixture.js';


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
    for (const newline of ['\n', '\r\n']) {
        const empty = parseCaptionSlots(['#1', 'scene: wears a blue coat', 'char: ', 'uc: text',
            '#2', '\tscene：\t', 'char: smiles.', 'uc:'].join(newline));
        assert.equal(empty.ok, true);
        assert.deepEqual(empty.captions.map(item => item.slotId), [1, 2]);
        const [first, second] = empty.captions;
        assert.equal(first.caption.v4_prompt.caption.base_caption, 'wears a blue coat');
        assert.deepEqual(first.caption.v4_prompt.caption.char_captions, []);
        assert.equal(first.caption.v4_negative_prompt.caption.base_caption, 'text');
        assert.equal(second.caption.v4_prompt.caption.base_caption, '');
        assert.equal(second.caption.v4_prompt.caption.char_captions[0].char_caption, 'smiles.');
        assert.equal(second.caption.v4_negative_prompt.caption.base_caption, '');
    }
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
        floorPromptWait: { timeoutMs: 30, intervalMs: 10, sleep: () => sleep(context) },
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

function chatu8Backend({ mes = '', settings = {}, sleep = async () => {} } = {}) {
    const chat = [];
    chat[3] = { mes };
    const context = { chat, extensionSettings: { 'st-chatu8': settings } };
    const prompts = [];
    const backend = createImageBackend({
        global: { SillyTavern: { getContext: () => context } },
        getBridge: () => ({ imageApi: { mode: 'extension' }, autoIllustration: { nai: {} } }),
        nai: { async generate() { return { ok: true, dataUrl: 'data:image/png;base64,NAI' }; } },
        chatu8: { findHost: () => ({ win: {}, eventSource: {} }), async request(host, prompt) { prompts.push(prompt); return { ok: true, imageData: 'data:image/png;base64,C8' }; } },
        floorPromptWait: { timeoutMs: 30, intervalMs: 10, sleep: () => sleep(context) },
    });
    return { backend, prompts };
}

test('gate:chatu8:story-cg-uses-chatu8-floor-tags', async () => {
    const mes = '正文\n\n<image>image###1girl, 阿黛尔, cafe###</image>\n后文\n\n<image>image###2girls, rooftop###</image>';
    const { backend, prompts } = chatu8Backend({ mes });
    await backend.generate(slot, { size: '1216x832' }, { messageId: 3, slot: 2 });
    assert.equal(prompts[0], '2girls, rooftop');
    await backend.generate(slot, { size: '1216x832' }, { messageId: 3, slot: 3 });
    assert.equal(prompts[1], 'cafe, afternoon light, 1girl, silver hair');
});

test('gate:chatu8:waits-only-when-it-writes-back', async () => {
    let naps = 0;
    const settings = { scriptEnabled: 'true', autoLLMImageGen: 'true', insertOriginalText: 'true', startTag: 'pic<<', endTag: '>>' };
    const { backend, prompts } = chatu8Backend({ mes: '短正文', settings, sleep: async (context) => { naps += 1; if (naps === 2) context.chat[3].mes += '<image>pic<<1girl, later>></image>'; } });
    await backend.generate(slot, { size: '1216x832' }, { messageId: 3, slot: 1 });
    assert.equal(prompts[0], '1girl, later');
    const off = chatu8Backend({ mes: '短正文', settings: { ...settings, insertOriginalText: 'false' }, sleep: async () => { throw new Error('不该等'); } });
    await off.backend.generate(slot, { size: '1216x832' }, { messageId: 3, slot: 1 });
    assert.equal(off.prompts[0], 'cafe, afternoon light, 1girl, silver hair');
});

test('gate:image-backend:kind-models-override-nai-and-dbgen', async () => {
    const naiCalls = [];
    const dbgenCalls = [];
    let mode = 'nai';
    const imageApi = () => ({ mode, cgModel: 'nai-diffusion-5-full', spriteModel: 'nai-diffusion-4-full', backgroundModel: '', itemModel: 'nai-diffusion-4-5-curated' });
    const backend = createImageBackend({
        global: { NaiDbGen: { async generate(req) { dbgenCalls.push(req); return { ok: true, value: [{ blob: 'data:image/png;base64,DB' }] }; } } },
        getBridge: () => ({ imageApi: imageApi(), autoIllustration: { nai: { apiKey: 'k', model: 'nai-diffusion-4-5-full', size: '832x1216' } } }),
        nai: { async generate(slot, settings) { naiCalls.push(settings); return { ok: true, dataUrl: 'data:image/png;base64,NAI' }; } },
    });
    await backend.generate({ scene: '1girl' }, { model: 'nai-diffusion-4-5-full' }, { imageKind: 'sprite' });
    await backend.generate({ scene: 'room' }, { model: 'nai-diffusion-4-5-full' }, { imageKind: 'background' });
    await backend.generate({ scene: 'apple' }, { model: 'nai-diffusion-4-5-full' }, { imageKind: 'item' });
    await backend.generate({ scene: 'cg' }, { model: 'nai-diffusion-4-5-full' }, {});
    await backend.generate({ scene: 'cg' }, { model: 'nai-diffusion-4-5-full' }, { imageKind: 'cg' });
    assert.deepEqual(naiCalls.map((s) => s.model), ['nai-diffusion-4-full', 'nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-5-full', 'nai-diffusion-5-full']);

    mode = 'dbgen';
    const caption = { v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } } };
    await backend.generateDbgenCaption({ caption, imageKind: 'sprite' });
    await backend.generateDbgenCaption({ caption, imageKind: 'background' });
    await backend.generateDbgenCaption({ caption, imageKind: 'cg' });
    assert.equal(dbgenCalls[0].params.model, 'nai-diffusion-4-full');
    assert.equal(dbgenCalls[1].params, undefined);
    assert.equal(dbgenCalls[2].params.model, 'nai-diffusion-5-full');
});

test('gate:image-backend:dbgen-refuses-empty-caption', async () => {
    let paints = 0;
    const backend = createImageBackend({
        global: {
            NaiDbGen: {
                async generate() { paints += 1; return { ok: true, value: [{ blob: 'data:image/png;base64,DB' }] }; },
            },
        },
        getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
    });
    const empty = {
        v4_prompt: { caption: { base_caption: '', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const result = await backend.generateDbgenCaption({
        caption: empty,
        userPrompts: { positive: '1girl, solo', negative: 'lowres' },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /不是生图提示词/);
    assert.equal(paints, 0);
});


test('gate:dna-template:dbgen-workbench-to-igs-preserves-template-and-candidate', async () => {
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    const promptTask = { version: 1, mode: 'dna_template', purpose: 'sprite',
        characters: [{ characterKey: 'Alice', token: 'rA7', framing: 'half_body' }] };
    const characterContext = [{ characterKey: 'Alice', dna: {} }];
    const reply = ['slotid: 6', 'prompt_mode: dna_template', 'scene: One woman in a half-body composition.',
        'char: 0.3,0.5 | <<dna:rA7>> wears a blue coat and waves toward Bob.',
        'char_uc: <<dna_uc:rA7>>, closed eyes', 'meta_kind: 0 | named', 'meta_key: 0 | Alice',
        'meta_token: 0 | rA7', 'meta_frame: 0 | half_body', 'meta_outfit_name: 0 | Coat',
        'meta_outfit_description: 0 | A blue coat.',
        'meta_dna_full_body: 0 | Alice, a tall adult woman with silver hair, blue eyes and a silver ring on her left hand,',
        'meta_dna_half_body: 0 | Alice, an adult woman with silver hair, blue eyes and a silver ring on her left hand,',
        'meta_dna_portrait: 0 | Alice, an adult woman with silver hair and blue eyes,'].join('\n');
    const p = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
    const requests = [];
    const api = { async generate() { assert.fail('写词交接不得调用生图'); },
        async generateSinglePrompt(req) {
        requests.push(req);
        return p.workbench.writePrompt({ mode: 'floor', skipRecall: true,
            naturalLanguage: req.description, characterContext: req.characterContext, promptTask: req.promptTask });
    } };
    const backend = createImageBackend({ global: { NaiDbGen: api }, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    const written = await backend.writeDbgenPrompt({ description: '画 Alice 的半身立绘', characterContext, promptTask });
    assert.equal(written.ok, true, written.error);
    assert.deepEqual(requests[0].promptTask, promptTask);
    assert.equal(written.captions[0].slotId, 6);
    assert.deepEqual(written.promptRecipe.caption, written.caption);
    assert.equal(written.promptRecipe.bindings[0].characterKey, 'Alice');
    assert.deepEqual(Object.keys(written.dnaCandidates.characters[0].views), ['full_body', 'half_body', 'portrait']);
    assert.match(written.dnaCandidates.characters[0].views.half_body.subject, /silver ring/);
    assert.equal(written.caption.v4_prompt.caption.char_captions[0].centers[0].x, 0.3);
    assert.match(written.caption.v4_prompt.caption.char_captions[0].char_caption, /toward Bob/);
    assert.match(p.llmCalls[0].messages.at(-1).content, /rA7/);
    assert.match(p.llmCalls[0].messages.at(-1).content, /meta_dna_portrait/);
    assert.equal(p.llmCalls.length, 1);
    assert.equal(p.naiCalls.length, 0);
    const rejected = await backend.writeDbgenPrompt({ description: '画 Alice 的 CG', characterContext,
        promptTask: { ...promptTask, purpose: 'cg' } });
    assert.equal(rejected.ok, false);
    assert.equal(p.naiCalls.length, 0);
});


function dnaTemplateFixture() {
    const caption = { v4_prompt: { caption: { base_caption: 'Alice and Alicia meet in a corridor.', char_captions: [
        { char_caption: '<<dna:rA7>> wears a blue coat and reaches toward Alicia.', centers: [{ x: 0.23, y: 0.51 }] },
        { char_caption: '<<dna:rB9>> wears a red coat and looks toward Alice.', centers: [{ x: 0.77, y: 0.49 }] },
    ] } }, v4_negative_prompt: { caption: { base_caption: 'closed eyes', char_captions: [
        { char_caption: '<<dna_uc:rA7>>, blurry hands' }, { char_caption: '<<dna_uc:rB9>>' },
    ] } } };
    const bindings = [{ kind: 'named', characterKey: 'Alice', captionIndex: 0, token: 'rA7', framing: 'half_body' },
        { kind: 'named', characterKey: 'Alicia', captionIndex: 1, token: 'rB9', framing: 'portrait' }];
    const characterContext = [
        { characterKey: 'Alice', dna: { version: 2, views: { half_body: { subject: 'Alice, with 1.2::silver hair:: and a $5 hair clip,', negative: 'glasses' } } } },
        { characterKey: 'Alicia', dna: { version: 2, views: { portrait: { subject: 'Alicia, with black hair and green eyes,', negative: '' } } } },
    ];
    return { caption, promptRecipe: { version: 1, mode: 'dna_template', caption: structuredClone(caption), bindings },
        characterContext, characterMeta: { version: 1, characters: bindings.map((b) => ({ characterKey: b.characterKey,
            captionIndex: b.captionIndex, identityAnchor: '', signatureDetails: '', outfit: { name: '', description: '' },
            centers: structuredClone(caption.v4_prompt.caption.char_captions[b.captionIndex].centers), positionExplicit: true })) } };
}

test('gate:dna-template:自身展开保真且缺景别、重复或跨角色令牌失败关闭', async () => {
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const fixture = dnaTemplateFixture(), before = structuredClone(fixture);
    const result = prepareCharacterCaption(fixture);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.caption.v4_prompt.caption.base_caption, fixture.caption.v4_prompt.caption.base_caption);
    assert.equal(result.caption.v4_prompt.caption.char_captions[0].char_caption,
        'Alice, with 1.2::silver hair:: and a $5 hair clip, wears a blue coat and reaches toward Alicia.');
    assert.equal(result.caption.v4_negative_prompt.caption.char_captions[1].char_caption, '');
    assert.deepEqual(result.caption.v4_prompt.caption.char_captions[0].centers, [{ x: 0.23, y: 0.51 }]);
    assert.deepEqual(fixture, before);
    assert.equal(Object.isFrozen(result.dnaSnapshot.characters[0].profile), true);
    const missing = dnaTemplateFixture(); missing.characterContext[0].dna.views = { portrait: { subject: 'Alice,' } };
    assert.equal(prepareCharacterCaption(missing).reason, 'DNA_VIEW_MISSING');
    const absent = dnaTemplateFixture(); absent.characterContext[0].dna = {};
    assert.equal(prepareCharacterCaption(absent).reason, 'DNA_MISSING');
    for (const text of ['<<dna:rB9>> waves.', '<<dna:rA7>> <<dna:rA7>> waves.', '<<dna:unknown>> waves.']) {
        const invalid = dnaTemplateFixture(); invalid.caption.v4_prompt.caption.char_captions[0].char_caption = text;
        assert.equal(prepareCharacterCaption(invalid).ok, false);
    }
    const recursive = dnaTemplateFixture(); recursive.characterContext[0].dna.views.half_body.subject = '<<dna:rB9>>';
    assert.equal(prepareCharacterCaption(recursive).ok, false);
    assert.equal(prepareCharacterCaption({ caption: fixture.caption, captionMode: 'final' }).reason, 'DNA_TEMPLATE_UNRESOLVED');
    const promptTask = { version: 1, mode: 'dna_template', purpose: 'cg',
        characters: fixture.promptRecipe.bindings.map(({ characterKey, token, framing }) => ({ characterKey, token, framing })) };
    assert.equal(prepareCharacterCaption({ ...fixture, promptTask }).ok, true);
    const finalCaption = result.caption;
    assert.equal(prepareCharacterCaption({ caption: finalCaption, promptTask }).reason, 'PROMPT_MODE_CONFLICT');
    assert.equal(prepareCharacterCaption({ ...fixture, caption: finalCaption, captionMode: 'final' }).reason, 'PROMPT_MODE_CONFLICT');
    assert.equal(prepareCharacterCaption({ ...fixture, promptTask: { ...promptTask, purpose: 'unknown' } }).reason, 'PROMPT_MODE_CONFLICT');
    assert.equal(prepareCharacterCaption({ ...fixture, dnaCandidates: { version: 1, characters: [] } }).reason, 'PROMPT_MODE_CONFLICT');
    const duplicate = dnaTemplateFixture(); duplicate.characterContext.push(duplicate.characterContext[0]);
    assert.equal(prepareCharacterCaption(duplicate).reason, 'DNA_TEMPLATE_BINDING');
    const reference = dnaTemplateFixture(); reference.promptRecipe.bindings[1].kind = 'reference';
    reference.characterMeta.characters.pop();
    assert.equal(prepareCharacterCaption(reference).reason, 'PROMPT_MODE_CONFLICT');
    assert.equal(prepareCharacterCaption({ caption: finalCaption, captionMode: 'final' }).ok, true);
    assert.deepEqual(prepareCharacterCaption({ caption: finalCaption }), { ok: true, caption: finalCaption });
});

test('gate:dna-template:普通CG当次身份与严格任务边界', async () => {
    const { prepareCharacterCaption, readCaptionIdentity } = await import('../src/generated-images/character-caption.js');
    const { promptProvenance } = await import('../src/generated-images/generation-prompt.js');
    const fixture = dnaTemplateFixture();
    fixture.promptTask = { version: 1, mode: 'dna_template', purpose: 'cg',
        characters: fixture.promptRecipe.bindings.map(({ characterKey, token }) => ({ characterKey, token })) };
    fixture.characterContext[0].dna = {};
    fixture.characterMeta.characters[0].identityAnchor = 'Alice, an adult woman with silver hair and a star hair clip,';
    fixture.characterMeta.characters[0].signatureDetails = 'star hair clip';
    const before = structuredClone(fixture), result = prepareCharacterCaption(fixture);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.dnaSnapshot.characters[0].source, 'scene');
    assert.equal(result.dnaSnapshot.characters[0].dnaVersion, 0);
    assert.deepEqual(promptProvenance(result).dnaSnapshot, result.dnaSnapshot);
    assert.deepEqual(fixture, before);
    for (const purpose of ['derived', 'consistency']) {
        assert.equal(prepareCharacterCaption({ ...fixture, promptTask: { ...fixture.promptTask, purpose } }).reason, 'DNA_MISSING');
    }
    const metadata = fixture.characterMeta.characters[0];
    assert.equal(readCaptionIdentity({ identity: 'Alice,' }, 'portrait', 'cg', metadata).source, 'scene');
    for (const dna of [{ version: 9 }, { version: 2, views: { portrait: { subject: '<<dna:bad>>' } } }]) {
        assert.equal(readCaptionIdentity(dna, 'portrait', 'cg', metadata).reason, 'DNA_VIEW_INVALID');
    }
    assert.equal(readCaptionIdentity({}, 'portrait', 'cg', { ...metadata, identityAnchor: '<<dna:other>>' }).reason, 'DNA_TEMPLATE_UNRESOLVED');
    const wrong = structuredClone(fixture);
    wrong.promptRecipe.bindings[0].characterKey = 'Alicia';
    assert.equal(prepareCharacterCaption(wrong).ok, false);
    const recursive = structuredClone(fixture);
    recursive.characterMeta.characters[0].identityAnchor = '<<dna:rB9>>';
    assert.equal(prepareCharacterCaption(recursive).reason, 'DNA_TEMPLATE_UNRESOLVED');
    assert.throws(() => promptProvenance({ dnaSnapshot: { version: 1,
        characters: [{ ...result.dnaSnapshot.characters[0], source: 'scene', dnaVersion: 2 }] } }), /PROMPT_PROVENANCE_INVALID/);
});

test('gate:appearance-correction:归档保真且非法来源拒收', async () => {
    const { consistencyProvenanceFixture } = await import('./helpers/prompt-provenance.js');
    const { promptProvenance } = await import('../src/generated-images/generation-prompt.js');
    const consistencyPrompt = consistencyProvenanceFixture({ appearanceCorrection: true });
    const before = structuredClone(consistencyPrompt);
    assert.deepEqual(promptProvenance({ consistencyPrompt }).consistencyPrompt, before);
    const round = consistencyPrompt.rounds[0];
    assert.equal(Object.hasOwn(round.dnaSnapshot.characters[0], 'correction'), false);
    for (const mutate of [
        r => { delete r.sentPrompt; },
        r => { r.sentPrompt.action = 'generate'; },
        r => { delete r.dnaSnapshot; },
        r => { delete r.dnaSnapshot.characters[0].application; },
        r => { r.dnaSnapshot.characters[0].application = 'unknown'; },
        r => { r.dnaSnapshot.characters[0].subject = 'different identity'; },
        r => { r.dnaSnapshot.characters[0].negative = 'different negative'; },
        r => { r.dnaSnapshot.characters[0].source = 'candidate'; },
        r => { r.dnaSnapshot.characters[0].token = 'other'; },
        r => { r.dnaSnapshot.characters.pop(); },
        r => { r.dnaSnapshot.characters[1] = structuredClone(r.dnaSnapshot.characters[0]); },
        r => { r.promptRecipe.bindings[0].correction.subject = '<<dna:other>>'; },
        r => { r.promptRecipe.identityMode = 'unknown'; },
    ]) {
        const bad = structuredClone(consistencyPrompt);
        mutate(bad.rounds[0]);
        assert.throws(() => promptProvenance({ consistencyPrompt: bad }), /PROMPT_PROVENANCE_INVALID/);
    }
    assert.throws(() => promptProvenance({ promptRecipe: round.promptRecipe }), /PROMPT_PROVENANCE_INVALID/);
    const legacy = consistencyProvenanceFixture();
    assert.deepEqual(promptProvenance({ consistencyPrompt: legacy }).consistencyPrompt, legacy);
    assert.equal(Object.hasOwn(legacy.rounds[0].promptRecipe, 'identityMode'), false);
    assert.ok(legacy.rounds[0].dnaSnapshot.characters.every(c => !Object.hasOwn(c, 'application')));
    assert.deepEqual(consistencyPrompt, before);
});



test('gate:dna-template:内置 NAI 最终 wire 仅展开加画师且快照同源', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const fixture = dnaTemplateFixture(), wires = [];
    const nai = createNaiOfficialClient({ fetch: async (_url, init) => {
        wires.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ images: [{ image: 'data:image/png;base64,AAAA' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    const bridge = { imageApi: { mode: 'nai' }, autoIllustration: { nai: {
        apiKey: 'fake-key', model: 'nai-diffusion-5-full', artistPrefix: 'artist:global', negativePrompt: 'OLD-AUTO-UC',
    } } };
    const before = structuredClone(bridge);
    const backend = createImageBackend({ getBridge: () => bridge, nai });
    for (const artist of [undefined, null, { positivePrompt: 'artist:local', negativePrompt: 'artist-uc' }]) {
        const result = await backend.generateDbgenCaption({ ...fixture, ...(artist !== undefined && { artist }) });
        assert.equal(result.ok, true, result.error);
        const wire = wires.at(-1), prefix = artist === undefined ? 'artist:global' : artist?.positivePrompt;
        assert.equal(wire.input, (prefix ? prefix + ', ' : '') + fixture.caption.v4_prompt.caption.base_caption);
        assert.equal(wire.parameters.negative_prompt, (artist?.negativePrompt ? artist.negativePrompt + ', ' : '') + 'closed eyes');
        assert.deepEqual(result.sentPrompt.caption.v4_prompt.caption, wire.parameters.v4_prompt.caption);
        assert.deepEqual(result.sentPrompt.caption.v4_negative_prompt.caption, wire.parameters.v4_negative_prompt.caption);
        assert.deepEqual(wire.parameters.v4_prompt.caption.char_captions[0].centers, [{ x: 0.23, y: 0.51 }]);
        assert.equal(wire.parameters.qualityToggle, false);
        assert.equal(wire.parameters.tag_hint_qt, 0);
        assert.equal(wire.parameters.tag_hint_uc_preset, 0);
        assert.equal(JSON.stringify(result.sentPrompt).includes('fake-key'), false);
        assert.equal(JSON.stringify(wire).includes('<<dna:'), false);
        assert.equal(result.prompt.caption.v4_prompt.caption.base_caption, fixture.caption.v4_prompt.caption.base_caption);
    }
    const count = wires.length;
    const failed = await backend.generateDbgenCaption({ ...fixture, userPrompts: { positive: 'SHOULD-NOT-APPEND' } });
    assert.equal(failed.reason, 'PROMPT_MODE_CONFLICT');
    assert.equal(wires.length, count);
    assert.deepEqual(bridge, before);
});

test('gate:dna-template:内置局部重绘定稿 wire 和取消与快照同源', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const wires = [];
    const nai = createNaiOfficialClient({ fetch: async (_url, init) => {
        wires.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    const backend = createImageBackend({ nai, getBridge: () => ({ imageApi: { mode: 'nai' },
        autoIllustration: { nai: { apiKey: 'fake-key', model: 'nai-diffusion-4-5-full', artistPrefix: 'artist:global' } } }) });
    const png = pngFixture(64, 128);
    const request = { ...dnaTemplateFixture(), sourceDataUrl: png.dataUrl,
        maskDataUrl: png.dataUrl, width: 64, height: 128 };
    const before = structuredClone(request);
    for (const artist of [undefined, null, { positivePrompt: 'artist:local', negativePrompt: 'local-uc' }]) {
        const result = await backend.edit({ ...request, ...(artist !== undefined && { artist }) });
        assert.equal(result.ok, true, result.error);
        const wire = wires.at(-1);
        const prefix = artist === undefined ? 'artist:global' : artist?.positivePrompt;
        assert.equal(wire.input, (prefix ? prefix + ', ' : '') + request.caption.v4_prompt.caption.base_caption);
        assert.equal(wire.parameters.negative_prompt, (artist?.negativePrompt ? artist.negativePrompt + ', ' : '') + 'closed eyes');
        assert.deepEqual(result.sentPrompt.caption.v4_prompt.caption, wire.parameters.v4_prompt.caption);
        assert.deepEqual(result.sentPrompt.caption.v4_negative_prompt.caption, wire.parameters.v4_negative_prompt.caption);
        assert.equal(result.sentPrompt.action, 'infill');
        assert.equal(result.sentPrompt.model, wire.model);
        assert.equal(wire.parameters.image, png.base64);
        assert.equal(wire.parameters.mask, png.base64);
        assert.equal(wire.parameters.qualityToggle, false);
        assert.equal(wire.parameters.ucPreset, 4);
        assert.equal(JSON.stringify(result.sentPrompt).includes(png.base64), false);
    }
    const count = wires.length;
    for (const extra of [{ signal: AbortSignal.abort() }, { shouldStart: () => false }, { promptRecipe: undefined, promptTask: { version: 1 } }]) {
        assert.equal((await backend.edit({ ...request, ...extra })).ok, false);
    }
    assert.equal(wires.length, count);
    assert.deepEqual(request, before);
});

test('gate:dna-template:IGS 到 DBGen 直连、阅读器和局部重绘使用实际 wire', async () => {
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    const { createImageGenService } = await import('../../../nai-dbgen/src/application/image-gen.service.js');
    const { createNaiGateway } = await import('../../../nai-dbgen/src/adapters/nai/nai.gateway.js');
    const { createDirectTransport } = await import('../../../nai-dbgen/src/adapters/nai/transport/direct.js');
    const { defaultPluginSettings } = await import('../../../nai-dbgen/src/domain/model/plugin-settings.js');
    const fixture = dnaTemplateFixture(), wires = [], writes = [], paints = [];
    const promptTask = { version: 1, mode: 'dna_template', purpose: 'cg', characters:
        fixture.promptRecipe.bindings.map(({ characterKey, token, framing }) => ({ characterKey, token, framing })) };
    const reply = ['slotid: 6', 'prompt_mode: dna_template', 'scene: ' + fixture.caption.v4_prompt.caption.base_caption,
        'scene_uc: closed eyes', ...fixture.promptRecipe.bindings.flatMap((b) => [
            `char: ${fixture.caption.v4_prompt.caption.char_captions[b.captionIndex].centers[0].x},0.5 | ${fixture.caption.v4_prompt.caption.char_captions[b.captionIndex].char_caption}`,
            `char_uc: ${fixture.caption.v4_negative_prompt.caption.char_captions[b.captionIndex].char_caption}`,
            `meta_kind: ${b.captionIndex} | named`, `meta_key: ${b.captionIndex} | ${b.characterKey}`,
            `meta_token: ${b.captionIndex} | ${b.token}`, `meta_frame: ${b.captionIndex} | ${b.framing}`,
            `meta_outfit_name: ${b.captionIndex} | Coat`, `meta_outfit_description: ${b.captionIndex} | A coat.`,
        ])].join('\n');
    const p = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
    const settings = { ...defaultPluginSettings(), activeNaiConfigId: 'fake' };
    settings.naiParams = { ...settings.naiParams, model: 'nai-diffusion-5-full', width: 64, height: 128 };
    const gateway = createNaiGateway({ transports: { direct: createDirectTransport({ fetch: async (_url, init) => {
        wires.push(JSON.parse(init.body));
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } }) }, decoders: { 'json-base64': { decode: async () => Ok([{ blob: new Blob(['fake'], { type: 'image/png' }), mimeType: 'image/png' }]) } } });

    settings.activeArtistId = 'artist';
    const inherited = { positivePrompt: 'artist:global', negativePrompt: 'global-uc' };
    const service = createImageGenService({ imageGenPort: gateway, loadSettings: () => settings,
        naiConfigRepo: { get: async () => Ok({ id: 'fake', baseUrl: 'https://example.invalid', apiKey: 'fake-key', transport: 'direct', decoder: 'json' }) },
        artistRepo: { get: async () => Ok(inherited) }, newTraceId: () => 'igs-wire-test' });
    const api = { getPromptCapabilities: () => ({ finalCaption: 1, promptSnapshot: 1 }),
        describeInfill: () => service.describeInfill(),
        async generate(req) { paints.push(req); return service.generate(req); },
        async generateSinglePrompt(req) {
            writes.push(req);
            return p.workbench.writePrompt({ mode: 'floor', skipRecall: true,
                naturalLanguage: req.description, characterContext: req.characterContext, promptTask: req.promptTask });
        } };
    const backend = createImageBackend({ global: { NaiDbGen: api }, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    const checkWire = (result, action) => {
       assert.equal(result.ok, true, result.error);
        const wire = wires.at(-1);
        assert.equal(wire.action, action);
        assert.equal(wire.input, 'artist:global, ' + fixture.caption.v4_prompt.caption.base_caption);
        assert.equal(wire.parameters.negative_prompt, 'global-uc, closed eyes');
        assert.deepEqual(result.sentPrompt.caption.v4_prompt.caption, wire.parameters.v4_prompt.caption);
        assert.deepEqual(result.sentPrompt.caption.v4_negative_prompt.caption, wire.parameters.v4_negative_prompt.caption);
        assert.equal(result.sentPrompt.model, wire.model);
        assert.equal(result.sentPrompt.action, action);
        assert.equal(JSON.stringify(wire).includes('<<dna'), false);
        assert.equal(JSON.stringify(result.sentPrompt).includes('fake-key'), false);
        assert.equal(paints.at(-1).replaceCharacterKeywords, false);
        assert.equal(paints.at(-1).captionMode, 'final');
        assert.equal(paints.at(-1).capturePrompt, true);
    };
    try {
        const direct = await backend.generate({}, {}, { description: '两位朋友在走廊见面', skipRecall: true,
            promptTask, characterContext: fixture.characterContext });
        checkWire(direct, 'generate');
        assert.deepEqual(writes[0].promptTask, promptTask);
        assert.equal(writes[0].skipRecall, true);
        assert.equal(p.llmCalls.length, 1);
        assert.equal(writes.length, 1);
        assert.equal(wires.length, 1);
        checkWire(await backend.generate({ ...fixture }, {}), 'generate');
        assert.equal(writes.length, 1);

        const reader = await backend.generateForReader(fixture, { imageApi: { mode: 'dbgen' } });
        checkWire(reader, 'generate');
        assert.match(reader.url, /^data:image\/png;base64,/);
        assert.equal(reader.providerId, 'vn.provider.dbgen');
        const png = pngFixture(64, 128).dataUrl;
        checkWire(await backend.edit({ ...fixture, sourceDataUrl: png, maskDataUrl: png, width: 64, height: 128 }), 'infill');
        const count = wires.length;
        const missing = dnaTemplateFixture(); missing.characterContext[0].dna = {};
        assert.equal((await backend.generateDbgenCaption(missing)).reason, 'DNA_MISSING');
        assert.equal((await backend.generate({}, {}, { promptRecipe: fixture.promptRecipe })).reason, 'PROMPT_MODE_CONFLICT');
        assert.equal((await backend.generateForReader(fixture, { imageApi: { mode: 'nai' } })).reason, 'PROMPT_MODE_CONFLICT');
        assert.equal((await backend.generateDbgenCaption({ caption: direct.caption, promptTask })).reason, 'PROMPT_MODE_CONFLICT');
        assert.equal(wires.length, count);
        assert.equal(writes.length, 1);
        assert.equal(p.llmCalls.length, 1);
        for (const mode of ['baibai', 'extension']) {
            const isolated = createImageBackend({ global: { NaiDbGen: api }, getBridge: () => ({ imageApi: { mode } }),
                nai: { async generate() { assert.fail('其他来源不能降级至内置 NAI'); } } });
            assert.equal((await isolated.generate(fixture, {})).reason, 'PROMPT_MODE_CONFLICT');
            assert.equal((await isolated.generateDbgenCaption(fixture)).reason, 'PROMPT_MODE_CONFLICT');
            assert.equal((await isolated.generateDbgenCaption({ caption: direct.caption, promptTask })).reason, 'PROMPT_MODE_CONFLICT');
        }
        assert.equal(wires.length, count);
    } finally { service.dispose(); }
});

function templateWritingFixture(candidate = false) {
    const subject = 'Alice, an adult woman with 1.2::silver hair:: and blue eyes,';
    const views = Object.fromEntries(['full_body', 'half_body', 'portrait']
        .map((frame) => [frame, { subject, negative: '' }]));
    const promptTask = { version: 1, mode: 'dna_template', purpose: candidate ? 'sprite' : 'cg',
        characters: [{ characterKey: 'Alice', token: 'rA7', framing: 'half_body' }] };
    const characterContext = [{ characterKey: 'Alice', dna: candidate ? {} : { version: 2, views } }];
    const reply = ['slotid: 6', 'prompt_mode: dna_template', 'size: 832x1216',
        'scene: One woman stands against a transparent background in soft light. masterpiece',
        'scene_uc: blurry', 'char: 0.23,0.51 | <<dna:rA7>> wears a blue coat and waves toward Bob.',
        'char_uc: <<dna_uc:rA7>>, closed eyes', 'meta_kind: 0 | named', 'meta_key: 0 | Alice',
        'meta_token: 0 | rA7', 'meta_frame: 0 | half_body', 'meta_outfit_name: 0 | Coat',
        'meta_outfit_description: 0 | A blue coat.',
        ...(candidate ? Object.entries(views).map(([frame, view]) => `meta_dna_${frame}: 0 | ${view.subject}`) : [])].join('\n');
    return { reply, promptTask, characterContext, subject };
}

test('gate:dna-template:拒绝诊断只含字段原因和位置且不回显模型正文', async () => {
    const { parseTemplateCaptionSlots } = await import('../src/generated-images/illustration/template-caption-parser.js');
    const fixture = templateWritingFixture();
    const before = structuredClone(fixture);
    const cases = [
        ['```text\n' + fixture.reply + '\n```', 'response_format', 'invalid', 1],
        ['~~~\n' + fixture.reply + '\n~~~', 'response_format', 'invalid', 1],
        ['secret response text\n' + fixture.reply, 'meta_fields', 'invalid', 1],
        [fixture.reply + '\nsecret_key: private content', 'meta_fields', 'invalid'],
        [fixture.reply.replace('meta_key: 0 | Alice', 'meta_key: Alice'), 'meta_key', 'invalid'],
        [fixture.reply.replace('meta_token: 0 | rA7', 'meta_token: rA7'), 'meta_token', 'invalid'],
        [fixture.reply.replace('meta_frame: 0 | half_body', 'meta_frame: half_body'), 'meta_frame', 'invalid'],
        [fixture.reply + '\nreference: private content', 'meta_fields', 'invalid'],
        [fixture.reply + '\nreference_uc:', 'meta_fields', 'invalid'],
        [fixture.reply + '\nreference inset', 'meta_fields', 'invalid'],
        [fixture.reply + '\n---\nscene: private content', 'slotid', 'missing'],
        [fixture.reply + '\nmeta_token: 0 | secret-token', 'meta_token', 'duplicate'],
        [fixture.reply.replace(/^meta_outfit_description:.*(?:\n|$)/m, ''), 'meta_outfit_description', 'missing'],
        [fixture.reply.replace('char_uc: <<dna_uc:rA7>>, closed eyes\n', ''), 'char_uc', 'mismatch'],
        [fixture.reply.replace('meta_kind: 0 | named', 'meta_kind: 1 | named')
            .replaceAll(': 0 |', ': 1 |'), 'meta_rows', 'missing'],
        [fixture.reply.replace('0.23,0.51 |', 'Alice | 0.23,0.51 |'), 'char', 'invalid'],
        [fixture.reply.replace('832x1216', '833x1216'), 'size', 'invalid'],
        [fixture.reply + '\nslotid: 6', 'slotid', 'duplicate'],
    ];
    for (const [reply, field, issue, lineNumber] of cases) {
        const result = parseTemplateCaptionSlots(reply, fixture);
        assert.equal(result.ok, false, field);
        assert.equal(result.diagnostic.stage, 'prompt-parse');
        assert.equal(result.diagnostic.field, field);
        assert.equal(result.diagnostic.issue, issue);
        if (lineNumber) assert.equal(result.diagnostic.lineNumber, lineNumber);
        assert.match(result.error, /已停止写词交接.*字段=/);
        assert.doesNotMatch(JSON.stringify(result), /secret|private content|rA7|Alice|blue coat/);
    }
    const metaCases = [
        [fixture.reply.replace('meta_key: 0 | Alice', 'meta_key: 0 | private character'),
            'character-meta-binding', 'binding.characterKey', 'mismatch', 'meta_key'],
        [fixture.reply.replace('meta_key: 0 | Alice', 'meta_key: 0 | ' + 'x'.repeat(129)),
            'character-meta-key', 'binding.characterKey', 'invalid', 'meta_key'],
        [fixture.reply + '\nmeta_identity: 0 | ' + 'x'.repeat(4097),
            'character-meta-text', 'meta_identity', 'invalid', 'meta_identity', 'text-too-long'],
        [fixture.reply + '\nmeta_signature: 0 | ' + 'x'.repeat(4097),
            'character-meta-text', 'meta_signature', 'invalid', 'meta_signature', 'text-too-long'],
        [fixture.reply.replace('meta_outfit_name: 0 | Coat', 'meta_outfit_name: 0 | ' + 'x'.repeat(129)),
            'character-meta-text', 'meta_outfit_name', 'invalid', 'meta_outfit_name', 'text-too-long'],
        [fixture.reply.replace('meta_outfit_description: 0 | A blue coat.', 'meta_outfit_description: 0 | ' + 'x'.repeat(4097)),
            'character-meta-text', 'meta_outfit_description', 'invalid', 'meta_outfit_description', 'text-too-long'],
        [fixture.reply + '\nmeta_region: 0 | 0.9,0.2,0.2,0.3',
            'character-meta-region', 'meta_region', 'invalid', 'meta_region'],
    ];
    for (const [reply, code, field, issue, sourceField, detail] of metaCases) {
        const result = parseTemplateCaptionSlots(reply, fixture);
        const lineNumber = reply.split('\n').findIndex(line => line.startsWith(sourceField + ':')) + 1;
        assert.equal(result.ok, false);
        assert.equal(result.reason, code);
        assert.deepEqual(result.diagnostic, { code, field, issue, captionIndex: 0,
            ...(detail && { detail }), stage: 'prompt-parse', slotId: 6, lineNumber });
        assert.match(result.error, /角色资料无法可靠绑定.*字段=.*slotId=6.*lineNumber=/);
        assert.doesNotMatch(JSON.stringify(result), /private character|rA7|Alice|blue coat|xxxxx/);
    }
    assert.deepEqual(fixture, before);
    assert.equal(parseTemplateCaptionSlots(fixture.reply, fixture).ok, true);
    const outputs = { selection: 'numbered-text', paragraphCount: 2 };
    let contextReads = 0;
    const characterContextForEntry = entry => {
        contextReads++;
        assert.ok([1, 2].includes(entry.at));
        return fixture.characterContext;
    };
    for (const [value, issue] of [[undefined, 'missing'], ['', 'invalid'],
        ['0', 'invalid'], ['3', 'invalid'], ['1.5', 'invalid'], ['private content', 'invalid']]) {
        const reply = fixture.reply + (value === undefined ? '' : `\nat: ${value}`);
        const rejected = parseTemplateCaptionSlots(reply, { ...fixture, outputs, characterContextForEntry });
        assert.equal(rejected.ok, false);
        assert.equal(rejected.diagnostic.field, 'at');
        assert.equal(rejected.diagnostic.issue, issue);
        assert.equal(rejected.diagnostic.slotId, 6);
        assert.equal(contextReads, 0, '无效段号不得读取生成点衣装快照');
        assert.doesNotMatch(JSON.stringify(rejected), /private content|rA7|Alice|blue coat/);
    }
    const missing = parseTemplateCaptionSlots(fixture.reply, { ...fixture, outputs });
    assert.equal(missing.diagnostic.issue, 'missing', '无回调的编号任务同样要求段号');
    const callbackOnly = parseTemplateCaptionSlots(fixture.reply, { ...fixture, characterContextForEntry });
    assert.equal(callbackOnly.diagnostic.issue, 'missing');
    assert.equal(contextReads, 0);
    for (const at of [1, 2]) {
        const parsed = parseTemplateCaptionSlots(fixture.reply + `\nat: ${at}`,
            { ...fixture, outputs, characterContextForEntry });
        assert.equal(parsed.ok, true, parsed.error);
        assert.equal(parsed.captions[0].at, at);
    }
    assert.equal(contextReads, 2);
});

test('gate:dna-template:内置单次写词经真实解析和发送保留正文与候选', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    for (const candidate of [false, true]) {
        const fixture = templateWritingFixture(candidate), calls = [], wires = [];
        const nai = createNaiOfficialClient({ fetch: async (_url, init) => {
            wires.push(JSON.parse(init.body));
            return new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
                { status: 200, headers: { 'Content-Type': 'application/json' } });
        } });
        const backend = createImageBackend({ nai,
            getBridge: () => ({ imageApi: { mode: 'nai' }, autoIllustration: { nai: {
                apiKey: 'fake-key', model: 'nai-diffusion-5-full', artistPrefix: 'artist:global' } } }),
            llm: { async request(messages) { calls.push(messages); return fixture.reply; } } });
        const request = { description: '只画任务 6 的半身人物', promptTask: fixture.promptTask,
            characterContext: fixture.characterContext, userPrompts: { positive: 'soft light', negative: 'blurry' },
            writingRequirements: { transparent: true, quality: 'masterpiece' } };
        const before = structuredClone(request);
        const written = await backend.writeDbgenPrompt(request);
        assert.equal(written.ok, true, written.error);
        assert.equal(calls.length, 1);
        assert.equal(wires.length, 0);
        assert.match(calls[0].system, /不等待发送层补词/);
        assert.match(calls[0].system, /字段分为稳定身份、独立衣装、当次动态三层/);
        assert.match(calls[0].system, /制服、军用战斗服、护甲、鞋帽、武器、战术耳机/);
        assert.match(calls[0].system, /meta_dna_\* 不是完整立绘提示词/);

        assert.match(calls[0].user, /writingRequirements/);
        assert.match(calls[0].user, /rA7/);
        assert.equal(written.captions[0].slotId, 6);
        assert.equal(written.width, 832);
        assert.equal(Boolean(written.dnaCandidates), candidate);
        assert.deepEqual(written.promptRecipe.caption, written.caption);
        const painted = await backend.generateDbgenCaption({ ...written,
            characterContext: fixture.characterContext, transparent: true, size: '832x1216' });
        assert.equal(painted.ok, true, painted.error);
        assert.equal(wires.length, 1);
        assert.equal(wires[0].input, 'artist:global, ' + written.caption.v4_prompt.caption.base_caption);
        assert.equal(wires[0].parameters.v4_prompt.caption.char_captions[0].char_caption,
            fixture.subject + ' wears a blue coat and waves toward Bob.');
        assert.deepEqual(wires[0].parameters.v4_prompt.caption.char_captions[0].centers, [{ x: 0.23, y: 0.51 }]);
        assert.deepEqual(painted.sentPrompt.caption.v4_prompt.caption, wires[0].parameters.v4_prompt.caption);
        assert.equal(painted.dnaSnapshot.characters[0].source, candidate ? 'candidate' : 'saved');
        assert.equal(calls.length, 1);
        assert.deepEqual(request, before);
    }
});

test('gate:dna-template:内置非法回复不重试且其他来源不接管任务', async () => {
    const fixture = templateWritingFixture(true);
    for (const reply of ['', '抱歉，无法生成', fixture.reply + '\nmeta_token: 0 | rA7',
        fixture.reply + '\nmeta_unknown: 0 | x', fixture.reply.replace('prompt_mode: dna_template', ''),
        fixture.reply.replace('meta_frame: 0 | half_body', ''), fixture.reply.replace('char_uc: <<dna_uc:rA7>>, closed eyes', '')]) {
        const calls = [];
        const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'nai' } }),
            llm: { async request(messages) { calls.push(messages); return reply; } },
            nai: { async generate() { assert.fail('非法写词不得发送图片'); } } });
        assert.equal((await backend.writeDbgenPrompt({ ...fixture, description: '任务 6' })).ok, false);
        assert.equal(calls.length, 1);
    }
    for (const mode of ['baibai', 'extension']) {
        const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode } }),
            llm: { async request() { assert.fail('其他来源不得接管模板写词'); } } });
        assert.equal((await backend.writeDbgenPrompt({ ...fixture, description: '任务 6' })).reason, 'PROMPT_MODE_CONFLICT');
    }
    const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'nai' } }),
        llm: { async request() { return fixture.reply; } } });
    assert.equal((await backend.writeDbgenPrompt({ ...fixture, description: '任务 6',
        promptTask: { ...fixture.promptTask, purpose: 'cg' } })).reason, 'PROMPT_MODE_CONFLICT');
});

test('gate:dna-template:DBGen 两个写词入口透传约束且旧请求形状不变', async () => {
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    for (const method of ['writeDbgenPrompt', 'writeDbgenFloorPrompts']) {
        const fixture = templateWritingFixture(), calls = [];
        const p = buildPipeline({ llmComplete: async () => Ok({ text: fixture.reply, json: null }) });
        const api = {
            async generate() { assert.fail('写词测试不得出图'); },
            async generateSinglePrompt(req) {
            calls.push(req);
            if (!req.promptTask) return Ok({ caption: parseCaptionSlots('scene: Legacy.').captions[0].caption });
            return p.workbench.writePrompt({ mode: 'floor', skipRecall: true,
                naturalLanguage: req.description, characterContext: req.characterContext,
                promptTask: req.promptTask,
                ...(req.userPrompts !== undefined && { userPrompts: req.userPrompts }),
                ...(req.writingRequirements !== undefined && { writingRequirements: req.writingRequirements }) });
        } };
        const backend = createImageBackend({ global: { NaiDbGen: api },
            getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
        const userPrompts = { positive: 'soft light', negative: 'blurry' };
        const writingRequirements = { width: 832, height: 1216, transparent: true, quality: 'masterpiece' };
        const input = { description: 'Alice portrait', promptTask: fixture.promptTask,
            characterContext: fixture.characterContext, userPrompts, writingRequirements };
        const before = structuredClone(input);
        const result = await backend[method](input);
        assert.equal(result.ok, true, result.error);
        assert.deepEqual(calls[0].userPrompts, userPrompts);
        assert.deepEqual(calls[0].writingRequirements, writingRequirements);
        assert.notEqual(calls[0].userPrompts, userPrompts);
        assert.notEqual(calls[0].writingRequirements, writingRequirements);
        const content = p.llmCalls[0].messages.at(-1).content;
        assert.deepEqual(JSON.parse(content.split('本次写词约束：\n')[1].split('\n')[0]),
            { userPrompts, writingRequirements });
        assert.equal(p.llmCalls.length, 1);
        assert.equal(p.naiCalls.length, 0);
        assert.deepEqual(input, before);
        assert.equal((await backend[method]({ description: 'legacy', userPrompts, writingRequirements })).ok, true);
        assert.deepEqual(calls[1], { description: 'legacy',
            ...(method === 'writeDbgenPrompt' && { skipRecall: true }) });
    }
});

test('gate:dna-template:必需角色遗漏失败而 CG 允许池支持逐图子集', async () => {
    const { parseTemplateCaptionSlots } = await import('../src/generated-images/illustration/template-caption-parser.js');
    const fixture = templateWritingFixture();
    const input = { promptTask: { ...fixture.promptTask, characters: [...fixture.promptTask.characters,
        { characterKey: 'Bob', token: 'rB9', framing: 'half_body' }] },
        characterContext: [...fixture.characterContext, { characterKey: 'Bob', dna: {} }] };
    for (const purpose of ['sprite', 'derived']) {
        const parsed = parseTemplateCaptionSlots(fixture.reply,
            { ...input, promptTask: { ...input.promptTask, purpose } });
        assert.equal(parsed.ok, false);
        assert.equal(parsed.reason, 'DNA_TEMPLATE_BINDING');
    }
    const text = fixture.reply + '\n---\n' + fixture.reply.replace('slotid: 6', 'slotid: 9')
        .replace('size: 832x1216', 'size: 1216x832');
    const parsed = parseTemplateCaptionSlots(text, input);
    assert.equal(parsed.ok, true, parsed.error);
    assert.deepEqual(parsed.captions.map((c) => [c.slotId, c.width, c.height]),
        [[6, 832, 1216], [9, 1216, 832]]);
    for (const item of parsed.captions) {
        assert.equal(item.promptRecipe.bindings.length, 1);
        assert.equal(item.promptRecipe.bindings[0].characterKey, 'Alice');
        assert.equal(item.dnaCandidates, undefined);
    }
});

test('gate:dna-template:内置多 slot 同次写词保留独立候选与尺寸', async () => {
    const fixture = templateWritingFixture(true), calls = [];
    const reply = fixture.reply + '\n---\n' + fixture.reply.replace('slotid: 6', 'slotid: 9')
        .replace('size: 832x1216', 'size: 1216x832');
    const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'nai' } }),
        llm: { async request(input) { calls.push(input); return reply; } },
        nai: { async generate() { assert.fail('写词不得出图'); } } });
    const result = await backend.writeDbgenPrompt({ ...fixture, description: '写两份独立立绘模板' });
    assert.equal(result.ok, true, result.error);
    assert.equal(calls.length, 1);
    assert.deepEqual(result.captions.map((c) => [c.slotId, c.width, c.height]),
        [[6, 832, 1216], [9, 1216, 832]]);
    assert.deepEqual(result.captions[0].dnaCandidates, result.captions[1].dnaCandidates);
    assert.notEqual(result.captions[0].dnaCandidates, result.captions[1].dnaCandidates);
    assert.deepEqual(result.captions[0].promptRecipe.caption, result.captions[0].caption);
    assert.deepEqual(result.captions[1].promptRecipe.caption, result.captions[1].caption);
});

test('gate:dna-template:批量 slot 显式角色映射贯通解析与唯一准备入口', async () => {
    const { parseTemplateCaptionSlots } = await import('../src/generated-images/illustration/template-caption-parser.js');
    const { checkPromptTask } = await import('../src/schemas/prompt-recipe.js');
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const fixture = templateWritingFixture(true);
    const task = { ...fixture.promptTask, characters: [...fixture.promptTask.characters,
        { characterKey: 'Bob', token: 'r1', framing: 'half_body' }],
        slots: [{ slotId: 6, tokens: ['rA7'] }, { slotId: 9, tokens: ['r1'] }] };
    const context = [...fixture.characterContext, { characterKey: 'Bob', dna: {} }];
    const before = structuredClone(task);
    const bob = fixture.reply.replace('slotid: 6', 'slotid: 9').replaceAll('Alice', 'Bob').replaceAll('rA7', 'r1');
    const reply = bob + '\n---\n' + fixture.reply;
    const parsed = parseTemplateCaptionSlots(reply, { promptTask: task, characterContext: context });
    assert.equal(parsed.ok, true, parsed.error);
    assert.deepEqual(parsed.captions.map((c) => [c.slotId, c.characterMeta.characters[0].characterKey]), [[9, 'Bob'], [6, 'Alice']]);
    assert.deepEqual(parsed.captions.map(c => c.promptRecipe.bindings.map(b => [b.captionIndex, b.token])),
        [[[0, 'r1']], [[0, 'rA7']]], '独立单人图的局部索引均为 0，不从 token 推导');
    for (const item of parsed.captions) {
        const prepared = prepareCharacterCaption({ ...item, promptTask: task, characterContext: context });
        assert.equal(prepared.ok, true, prepared.error);
        assert.equal(prepared.dnaSnapshot.characters.length, 1);
        assert.equal(prepared.dnaSnapshot.characters[0].characterKey, item.characterMeta.characters[0].characterKey);
        assert.equal(prepareCharacterCaption({ ...item, slotId: 8, promptTask: task, characterContext: context }).ok, false);
    }
    for (const bad of [reply.replace('slotid: 9', 'slotid: 8'),
        bob.replace('slotid: 9', 'slotid: 6')])
        assert.equal(parseTemplateCaptionSlots(bad, { promptTask: task, characterContext: context }).ok, false);
    for (const [badBob, issue] of [
        [bob.replaceAll(': 0 |', ': 1 |'), 'missing'],
        [bob.replace(/^(meta_dna_\w+): 0 \|/gm, '$1: 1 |'), 'mismatch'],
    ]) {
        const rejected = parseTemplateCaptionSlots(fixture.reply + '\n---\n' + badBob,
            { promptTask: task, characterContext: context });
        assert.equal(rejected.ok, false);
        assert.deepEqual([rejected.diagnostic.field, rejected.diagnostic.issue, rejected.diagnostic.slotId],
            ['meta_rows', issue, 9], '错误索引不自动修正，也不交接部分成功批次');
    }
    const pairTask = { ...task, slots: [{ slotId: 12, tokens: ['r1', 'rA7'] }] };
    const personLines = text => text.split('\n').filter(line => /^(?:char(?:_uc)?|meta_\w+):/.test(line));
    const header = fixture.reply.split('\n').filter(line => !/^(?:char(?:_uc)?|meta_\w+):/.test(line));
    const pairReply = [...header, ...personLines(bob),
        ...personLines(fixture.reply).map(line => line.replace(': 0 |', ': 1 |'))]
        .join('\n').replace('slotid: 6', 'slotid: 12');
    const pair = parseTemplateCaptionSlots(pairReply, { promptTask: pairTask, characterContext: context });
    assert.equal(pair.ok, true, pair.error);
    assert.deepEqual(pair.captions[0].promptRecipe.bindings.map(b => [b.captionIndex, b.token, b.characterKey]),
        [[0, 'r1', 'Bob'], [1, 'rA7', 'Alice']], '双人图按本图 Char 顺序从 0 编号');
    assert.equal(prepareCharacterCaption({ ...pair.captions[0], promptTask: pairTask,
        characterContext: context }).ok, true);
    assert.equal(checkPromptTask({ ...task, slots: [task.slots[0]] }, context).ok, false);
    assert.deepEqual(task, before);
});

test('gate:dna-template:普通 CG 写词诊断区分 DBGen 和 IGS 拒绝且只传受控字段', async () => {
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    for (const method of ['writeDbgenPrompt', 'writeDbgenFloorPrompts']) {
        const fixture = templateWritingFixture();
        const input = { description: 'Alice CG', characterContext: [{ characterKey: 'Alice', dna: {} }],
            promptTask: { ...fixture.promptTask, characters: [{ characterKey: 'Alice', token: 'rA7', kind: 'named' }] } };
        const reply = fixture.reply.replace('meta_frame: 0 | half_body', '');
        const p = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
        let calls = 0;
        const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
            global: { NaiDbGen: { async generate() { assert.fail('写词不得出图'); },
                async generateSinglePrompt(req) {
                calls++;
                return p.workbench.writePrompt({ mode: 'floor', skipRecall: true, traceId: 'trace_diag_1',
                    naturalLanguage: req.description, characterContext: req.characterContext, promptTask: req.promptTask });
            } } } });
        const failed = await backend[method](input);
        assert.equal(failed.ok, false);
        assert.equal(failed.reason, 'DNA_TEMPLATE_BINDING');
        assert.deepEqual(failed.diagnostic, { code: 'DNA_TEMPLATE_BINDING', stage: 'prompt-parse',
            field: 'meta_frame', issue: 'missing', slotId: 6, captionIndex: 0, traceId: 'trace_diag_1' });
        assert.match(failed.error, /DBGen 回复解析.*DNA_TEMPLATE_BINDING.*meta_frame.*slotId=6.*captionIndex=0/);
        assert.doesNotMatch(JSON.stringify(failed), /Alice|rA7|blue coat|rawText/);
        assert.equal(calls, 1);
        assert.equal(p.llmCalls.length, 1);
        assert.equal(p.naiCalls.length, 0);
        const rejected = await backend[method]({ ...input, promptTask: { ...input.promptTask,
            characters: [{ characterKey: 'Alice', token: 'invalid token' }] } });
        assert.equal(rejected.reason, 'DNA_TEMPLATE_BINDING');
        assert.deepEqual(rejected.diagnostic, { code: 'DNA_TEMPLATE_BINDING', stage: 'igs-prompt-input',
            field: 'promptTask.characters.token', issue: 'invalid', characterIndex: 0 });
        assert.equal(calls, 1);
    }
});

test('gate:dna-template:景别诊断双入口白名单透传且不回显上游正文', async () => {
    const secret = 'private identity <<dna:private_token>>';
    for (const method of ['writePrompt', 'writeFloorPrompts']) {
        for (const safe of [true, false]) {
            let calls = 0;
            const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
                global: { NaiDbGen: {
                    async generate() { assert.fail('诊断失败不得绘图'); },
                    async generateSinglePrompt() {
                        calls++;
                        return { ok: false, reason: 'DNA_VIEW_INVALID', error: secret,
                            diagnostic: { stage: 'prompt-parse', slotId: 6, captionIndex: 0,
                                field: safe ? 'dna.views.portrait.subject' : secret,
                                issue: 'invalid', detail: safe ? 'empty-subject' : secret,
                                lineNumber: safe ? 14 : -1, rawText: secret, subject: secret } };
                    },
                } } });
            const result = await backend[method]({ description: 'Fixture sprite' });
            assert.equal(result.ok, false);
            assert.equal(result.reason, 'DNA_VIEW_INVALID');
            assert.deepEqual(result.diagnostic, { code: 'DNA_VIEW_INVALID', stage: 'prompt-parse',
                ...(safe && { field: 'dna.views.portrait.subject', detail: 'empty-subject', lineNumber: 14 }),
                issue: 'invalid', slotId: 6, captionIndex: 0 });
            if (safe) assert.match(result.error, /dna.views.portrait.subject.*empty-subject.*lineNumber=14/);
            assert.doesNotMatch(JSON.stringify(result), /private|<<dna|rawText|"subject"/);
            assert.equal(calls, 1);
        }
    }
});


test('gate:scene-only:DBGen 双入口接受无人场景及非身份主体，不放过人物或身份槽', async () => {
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const scene = 'slotid: 6\nscene: An empty moonlit courtyard.\nscene_uc: blurry';
    const fixture = templateWritingFixture();
    for (const method of ['writeDbgenPrompt', 'writeDbgenFloorPrompts']) {
        for (const reply of [scene, scene + '\nprompt_mode: dna_template',
            scene + '\nprompt_mode: dna_template\nchar: A stone statue.\nchar_uc: broken\nmeta_kind: 0 | object']) {
            const requests = [];
            const p = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
            const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
                global: { NaiDbGen: { async generate() { assert.fail('写词不出图'); },
                    async generateSinglePrompt(req) {
                        requests.push(req);
                        return p.workbench.writePrompt({ mode: 'floor', skipRecall: true,
                            naturalLanguage: req.description });
                    } } } });
            const result = await backend[method]({ description: '无人庭院背景' });
            assert.equal(result.ok, true, result.error);
            assert.equal(Object.hasOwn(requests[0], 'promptTask'), false);
            assert.equal(Object.hasOwn(requests[0], 'characterContext'), false);
            for (const entry of result.captions) {
                const prepared = prepareCharacterCaption(entry);
                assert.equal(prepared.ok, true, prepared.error);
                assert.deepEqual(prepared.caption, entry.caption);
            }
            assert.equal(p.llmCalls.length, 1);
            assert.equal(p.naiCalls.length, 0);
        }
        for (const reply of [fixture.reply, scene.replace('An empty moonlit courtyard.', '<<dna:rA7>>')
            + '\nprompt_mode: dna_template']) {
            const p = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
            const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
                global: { NaiDbGen: { async generate() { assert.fail('拒绝后不得出图'); },
                    async generateSinglePrompt() { return p.workbench.writePrompt({ mode: 'floor',
                        skipRecall: true, naturalLanguage: '背景' }); } } } });
            assert.equal((await backend[method]({ description: '背景' })).ok, false);
            assert.equal(p.naiCalls.length, 0);
        }
    }
});


for (const method of ['writeDbgenPrompt', 'writeDbgenFloorPrompts']) {
    test(`gate:prompt-diagnostic:${method}:失败异常超时只返回受控诊断`, async () => {
        const fixture = templateWritingFixture(), requests = [];
        const secret = 'PRIVATE-REPLY-KEY';
        for (const fault of ['http', 'plural', 'throw', 'timeout', 'empty']) {
            const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
                dbgenTimeouts: { write: 10 },
                global: { NaiDbGen: { async generate() { assert.fail('写词失败不得出图'); },
                    async generateSinglePrompt(req) {
                        requests.push(req);
                        if (fault === 'throw') throw new Error(secret);
                        if (fault === 'timeout') return new Promise(() => {});
                        if (fault === 'empty') return undefined;
                        const diagnostic = { stage: 'prompt-write', status: 429, traceId: 'trace_safe',
                            field: 'caption', issue: 'missing', rawText: secret };
                        return fault === 'plural'
                            ? { ok: false, reason: 'NAI_429', diagnostics: diagnostic, error: secret }
                            : { ok: false, error: { code: 'NAI_429', message: secret, hint: secret,
                                traceId: 'trace_safe', context: diagnostic } };
                    } } } });
            const result = await backend[method]({ ...fixture, description: 'fixture', messageId: 5 });
            assert.equal(result.ok, false);
            assert.equal(requests.at(-1).messageId, 5);
            assert.equal(result.reason, { throw: 'DBGEN_PROMPT_EXCEPTION', timeout: 'DBGEN_PROMPT_TIMEOUT',
                empty: 'DBGEN_PROMPT_EMPTY' }[fault] || 'NAI_429');
            assert.equal(result.diagnostic.stage, 'prompt-write');
            if (fault === 'http' || fault === 'plural') {
                assert.equal(result.diagnostic.status, 429);
                assert.equal(result.diagnostic.traceId, 'trace_safe');
                assert.equal(result.diagnostic.field, 'caption');
            }
            assert.doesNotMatch(JSON.stringify(result), /PRIVATE-REPLY-KEY|rawText|Alice|blue coat/);
        }
    });
}


test('gate:image-backend:来源中立入口与旧名称同源，内置生成不探测 DBG', async () => {
    const calls = [], input = { description: '画一间安静的咖啡馆。' };
    const globalObject = {};
    Object.defineProperty(globalObject, 'NaiDbGen', { get() { throw new Error('不应探测 DBG'); } });
    const backend = createImageBackend({
        global: globalObject,
        getBridge: () => ({ imageApi: { mode: 'nai' }, autoIllustration: { nai: { apiKey: 'fake' } } }),
        llm: { async request(request) { calls.push(request); return '#1\nscene: A quiet cafe.\nuc: blurry'; } },
        nai: { async generate() { return { ok: true, dataUrl: 'data:image/png;base64,FAKE' }; } },
    });
    for (const [name, legacy] of [['writePrompt', 'writeDbgenPrompt'], ['writeFloorPrompts', 'writeDbgenFloorPrompts'],
        ['generateCaption', 'generateDbgenCaption']]) assert.equal(backend[name], backend[legacy]);
    const written = await backend.writePrompt(input);
    assert.equal(written.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(input, { description: '画一间安静的咖啡馆。' });
    assert.equal((await backend.generateCaption({ caption: written.caption })).ok, true);
});

test('gate:image-backend:旧注入后端转发保留接收者和参数，新入口优先', async () => {
    const { imageBackendMethod } = await import('../src/generated-images/backend-methods.js');
    const input = { description: 'fixture' }, extra = {}, result = { ok: true }, calls = [];
    for (const [name, legacy] of [['writePrompt', 'writeDbgenPrompt'], ['writeFloorPrompts', 'writeDbgenFloorPrompts'],
        ['generateCaption', 'generateDbgenCaption']]) {
        const backend = { [legacy](...args) { assert.equal(this, backend); calls.push(args); return result; } };
        assert.equal(await imageBackendMethod(backend, name)(input, extra), result);
        assert.equal(calls.at(-1)[0], input);
        assert.equal(calls.at(-1)[1], extra);
        backend[name] = function (...args) { assert.equal(this, backend); assert.deepEqual(args, [input]); return 'neutral'; };
        assert.equal(imageBackendMethod(backend, name)(input), 'neutral');
        assert.equal(imageBackendMethod({}, name), null);
        assert.equal(imageBackendMethod(null, name), null);
    }
});



test('gate:image-preset:内置楼层写词保留挂载编号且从不探测DBG', async () => {
    const { createPresetRegistry } = await import('../src/presets/preset-registry.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const calls = [], globalObject = {};
    Object.defineProperty(globalObject, 'NaiDbGen', { get() { assert.fail('内置楼层写词不能探测 DBG'); } });
    const llm = createImagePromptLlm({ async request(request) {
        calls.push(structuredClone(request));
        return 'slotid: 1\nprompt_mode: dna_template\nat: 2\nscene: A quiet cafe.\nscene_uc: text';
    } }, createPresetRegistry());
    const backend = createImageBackend({ llm, global: globalObject,
        getBridge: () => ({ imageApi: { mode: 'nai' }, autoIllustration: { nai: { apiKey: 'fake' } } }) });
    const input = { description: '1. 清晨。\n2. 咖啡馆。', imagePromptTask: 'cg',
        promptTask: { version: 1, mode: 'dna_template', purpose: 'cg', characters: [] },
        characterContext: [], outputs: { maxSlots: 1, paragraphCount: 2 } };
    const before = structuredClone(input);
    const result = await backend.writeFloorPrompts(input);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.captions[0].at, 2);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]), ['messages']);
    const data = JSON.parse(calls[0].messages[2].content);
    assert.equal(data.outputs.format, 'dna-template');
    assert.equal(data.outputs.selection, 'numbered-text');
    assert.equal(data.outputs.paragraphCount, 2);
    assert.deepEqual(data.promptTask, input.promptTask);
    assert.deepEqual(input, before);
    const invalid = await backend.writeFloorPrompts({ description: '未声明任务' });
    assert.equal(invalid.reason, 'PROMPT_MODE_CONFLICT');
    assert.equal(calls.length, 1);
});

// S6：只用隔离传输，计数不记录凭据或图像载荷。
const imageTick = () => new Promise(resolve => setImmediate(resolve));
const imageDeferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject };
};
const imageResponse = () => new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });

 test('gate:image-runtime:普通生成与infill同凭据串行，异凭据并行', { timeout: 3000 }, async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    const queue = createNaiRequestQueue(), releases = [], actions = [];
    let active = 0, peak = 0;
    const client = createNaiOfficialClient({ queue, fetch: async (_, init) => {
        actions.push(JSON.parse(init.body).action);
        active++; peak = Math.max(peak, active);
        const gate = imageDeferred(); releases.push(gate);
        await gate.promise; active--; return imageResponse();
    } });
    const png = pngFixture(64, 128).dataUrl;
    const edit = { prompt: 'A quiet room.', sourceDataUrl: png, maskDataUrl: png, width: 64, height: 128 };
    const first = client.generate({ scene: 'room' }, { apiKey: 'fixture-a' });
    const second = client.edit(edit, { apiKey: 'fixture-a' });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(releases.length, 1);
    releases[0].resolve(); assert.equal((await first).ok, true);
    await imageTick();
    assert.equal(releases.length, 2); releases[1].resolve();
    assert.equal((await second).ok, true); assert.equal(peak, 1);
    assert.deepEqual(actions, ['generate', 'infill']);
    const third = client.generate({ scene: 'room' }, { apiKey: 'fixture-a' });
    const fourth = client.generate({ scene: 'room' }, { apiKey: 'fixture-b' });
    await imageTick(); assert.equal(releases.length, 4); assert.equal(peak, 2);
    releases[2].resolve(); releases[3].resolve();
    assert.equal((await third).ok, true); assert.equal((await fourth).ok, true);
});


test('gate:image-runtime:排队取消零发送，在途取消拒收且实际结束前保留凭据锁', { timeout: 3000 }, async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    const gates = [], signals = [];
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (_, init) => {
        signals.push(init.signal);
        const gate = imageDeferred(); gates.push(gate);
        await gate.promise; return imageResponse();
    } });
    const running = new AbortController(), queued = new AbortController();
    const first = client.generate({ scene: 'room' }, { apiKey: 'fixture-a', signal: running.signal });
    await imageTick();
    const second = client.generate({ scene: 'room' }, { apiKey: 'fixture-a', signal: queued.signal });
    queued.abort(); assert.equal((await second).reason, 'request-stale');
    running.abort(); assert.equal((await first).reason, 'request-stale');
    assert.equal(signals[0].aborted, true);
    const third = client.generate({ scene: 'room' }, { apiKey: 'fixture-a' });
    await imageTick(); assert.equal(gates.length, 1, '忽略 abort 的传输尚未结束，不得双发');
    gates[0].resolve(); await imageTick();
    assert.equal(gates.length, 2); gates[1].resolve();
    assert.equal((await third).ok, true);
});

test('gate:image-runtime:异常释放队列且错误不回显载荷', { timeout: 3000 }, async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    let sends = 0;
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async () => {
        if (++sends === 1) throw new Error('fixture-a SECRET PAYLOAD');
        return imageResponse();
    } });
    const results = await Promise.all([1, 2].map(() => client.generate({ scene: 'room' }, { apiKey: 'fixture-a' })));
    assert.equal(results[0].reason, 'nai-transport-unknown');
    assert.equal(results[1].ok, true); assert.equal(sends, 2);
    assert.equal(JSON.stringify(results[0]).includes('SECRET'), false);
    assert.equal(JSON.stringify(results[0]).includes('fixture-a'), false);
});

test('gate:image-runtime:429遵守Retry-After且每次重试复核守卫', { timeout: 3000 }, async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    for (const invalidate of [false, true]) {
        let sends = 0, current = true, checks = 0;
        const waits = [];
        const client = createNaiOfficialClient({ queue: createNaiRequestQueue(),
            fetch: async () => ++sends === 1 ? new Response('', { status: 429,
                headers: { 'Retry-After': '7' } }) : imageResponse(),
            sleep: async ms => { waits.push(ms); if (invalidate) current = false; } });
        const result = await client.generate({ scene: 'room' }, { apiKey: 'fixture-a',
            shouldStart: () => { checks++; return current; } });
        assert.deepEqual(waits, [7000]);
        assert.equal(sends, invalidate ? 1 : 2);
        assert.equal(result.ok, !invalidate); assert.ok(checks >= 5);
    }
    for (const [status, retryAfter, expected, count] of [
        [429, '0', 'nai-rate-limited', 3], [429, '31', 'nai-retry-budget-exhausted', 1],
        [408, null, 'nai-http-failed', 1], [500, null, 'nai-http-failed', 1],
        [504, null, 'nai-http-failed', 1],
    ]) {
        let sends = 0;
        const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), sleep: async () => {},
            fetch: async () => { sends++; return new Response('', { status,
                ...(retryAfter !== null && { headers: { 'Retry-After': retryAfter } }) }); } });
        const result = await client.generate({ scene: 'room' }, { apiKey: 'fixture-a' });
        assert.equal(result.reason, expected); assert.equal(sends, count);
    }
});

test('gate:image-runtime:超时未知不补发，迟到响应不释放前序锁之外的任务', { timeout: 3000 }, async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    const gates = [];
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async () => {
        const gate = imageDeferred(); gates.push(gate); await gate.promise; return imageResponse();
    } });
    const first = await client.generate({ scene: 'room' }, { apiKey: 'fixture-a', timeoutMs: 15 });
    assert.equal(first.reason, 'request-timeout'); assert.equal(gates.length, 1);
    const second = client.generate({ scene: 'room' }, { apiKey: 'fixture-a' });
    await imageTick(); assert.equal(gates.length, 1);
    gates[0].resolve(); await imageTick(); assert.equal(gates.length, 2);
    gates[1].resolve(); assert.equal((await second).ok, true); assert.equal(first.ok, false);
});

async function committedImageHarness() {
    const { bootstrapIGS, createMemoryStorage, createPresetRegistry } = await import('../src/index.js');
    const { createEventBus } = await import('../src/core/event-bus.js');
    const { createBuiltinImageTaskRuntime } = await import('../src/generated-images/builtin-image-task-runtime.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    const storage = createMemoryStorage({ igs_bridge_config: JSON.stringify({ imageApi: { mode: 'nai' },
        autoIllustration: { nai: { apiKey: 'fixture-a', model: 'nai-diffusion-4-5-full' } } }) });
    const events = createEventBus(), registry = createPresetRegistry({ storage });
    const app = bootstrapIGS({ global: { localStorage: storage }, events, presetRegistry: registry, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    let runtime;
    try {
    const readBridge = () => app.getUnifiedSettings().bridge;
    const save = ({ bridge }) => {
        const opened = app.openSettings({ tab: 'image' });
        if (!opened.ok) return opened;
        for (const [key, value] of Object.entries(bridge)) {
            const updated = opened.controller.setValue(`bridge.${key}`, value);
            if (!updated.ok) return updated;
        }
        return opened.controller.close();
    };
    runtime = createBuiltinImageTaskRuntime({ readBridge, registry,
        subscribeSettings: handler => events.on('igs:legacy-settings-updated', handler) });
    const calls = [], gates = [];
    let waitImages = false, waitWriting = false;
    const llm = createImagePromptLlm({ async request() {
        if (waitWriting) { const gate = imageDeferred(); gates.push(gate); await gate.promise; }
        return '#1\nscene: A quiet room.\nchar:\nuc: text';
    } }, registry, runtime);
    const nai = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (_url, init) => {
        calls.push({ action: JSON.parse(init.body).action, signal: init.signal });
        if (waitImages) { const gate = imageDeferred(); gates.push(gate); await gate.promise; }
        return imageResponse();
    } });
    const backend = createImageBackend({ nai, llm, taskRuntime: runtime, getBridge: readBridge, global: {} });
    return { app, registry, runtime, backend, storage, calls, gates, readBridge, save,
        waitImages: () => { waitImages = true; }, waitWriting: () => { waitWriting = true; },
        close() { gates.forEach(gate => gate.resolve()); runtime.dispose(); app.destroy(); } };
    } catch (error) {
        runtime?.dispose(); app.destroy(); throw error;
    }
}

// S9：来源切换必须失效旧任务；DBG 的配置 token 不属于 IGS。
for (const method of ['writePrompt', 'writeFloorPrompts', 'generateCaption', 'generate', 'edit', 'generateForReader', 'testForReader']) {
    test(`gate:source-switch:DBG-${method}在途切换并切回拒收`, { timeout: 5000 }, async () => {
        const h = await committedImageHarness(), gate = imageDeferred(), requests = [];
        const caption = { v4_prompt: { caption: { base_caption: 'A quiet room.', char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: 'text', char_captions: [] } } };
        const api = {
            getPromptCapabilities: () => ({ generationConfig: 1, generationConfigLease: 1 }),
            getGenerationConfig: async () => ({ ok: true, value: { version: 1, configToken: 'dbg-token', artist: null } }),
            isGenerationConfigCurrent: token => token === 'dbg-token',
            describeInfill: () => ({ supported: true }),
            async generateSinglePrompt(request) {
                requests.push(request); await gate.promise;
                return { ok: true, value: { caption, captions: [{ slotId: 1, caption }] } };
            },
            async generate(request) {
                requests.push(request); await gate.promise;
                return { ok: true, value: [{ blob: 'data:image/png;base64,QQ==' }] };
            },
        };
        const backend = createImageBackend({ global: { NaiDbGen: api }, getBridge: h.readBridge, taskRuntime: h.runtime });
        try {
            assert.equal(h.save({ bridge: { imageApi: { mode: 'dbgen' } } }).ok, true);
            const baseline = structuredClone(h.readBridge());
            const config = await backend.getEditConfig();
            assert.equal(config.ok, true); assert.equal(config.configToken, 'dbg-token');
            const png = pngFixture(64, 128).dataUrl;
            const pending = method === 'generate' ? backend.generate({}, {}, { description: 'room' })
                : ['generateForReader', 'testForReader'].includes(method)
                    ? backend[method]({ prompt: 'room' }, { imageApi: { mode: 'dbgen' } })
                : method === 'edit' ? backend.edit({ caption, sourceDataUrl: png, maskDataUrl: png,
                    width: 64, height: 128, expectedConfigToken: config.configToken })
                : backend[method](method === 'generateCaption' ? { caption } : { description: 'room' });
            await imageTick(); assert.equal(requests.length, 1);
            if (method === 'edit') assert.equal(requests[0].expectedConfigToken, 'dbg-token', '插件令牌原样传递');
            assert.equal(h.save({ bridge: { imageApi: { mode: 'nai' } } }).ok, true);
            assert.equal(h.save({ bridge: { imageApi: { mode: 'dbgen' } } }).ok, true);
            assert.equal(config.isCurrent(), false, '切回不得复活 DBG 编辑租约');
            const result = await pending;
            assert.equal(result.ok, false); assert.equal(result.reason, 'stale-config');
            assert.equal(result.stopGeneration, true, '上游未结束也停止等待');
            gate.resolve(); await imageTick(); await imageTick();
            assert.equal(requests.length, 1); assert.equal(h.calls.length, 0);
            assert.equal(requests[0].signal.aborted, true);
            assert.deepEqual(h.readBridge().autoIllustration, baseline.autoIllustration, '不互写配置');
        } finally { gate.resolve(); h.close(); }
    });
}

for (const phase of ['writing', 'painting', 'handoff']) {
    test(`gate:source-switch:NAI-${phase}切到DBG再切回不复活`, { timeout: 5000 }, async () => {
        const h = await committedImageHarness();
        try {
            assert.equal(h.save({ bridge: { imageApi: { mode: 'nai' } } }).ok, true);
            const baseline = structuredClone(h.readBridge());
            const config = await h.backend.getEditConfig();
            let pending, queued, written;
            if (phase === 'painting') {
                h.waitImages();
                pending = h.backend.generate({ scene: 'room' }, baseline.autoIllustration.nai);
                await imageTick();
                queued = h.backend.generate({ scene: 'room' }, baseline.autoIllustration.nai);
            } else {
                if (phase === 'writing') h.waitWriting();
                pending = h.backend.writePrompt({ description: '画无人房间', imagePromptTask: 'background' });
                if (phase === 'handoff') { written = await pending; assert.equal(written.ok, true); }
            }
            await imageTick();
            assert.equal(h.save({ bridge: { imageApi: { mode: 'dbgen' } } }).ok, true);
            assert.equal(h.save({ bridge: { imageApi: { mode: 'nai' } } }).ok, true);
            assert.equal(config.isCurrent(), false);
            const result = phase === 'handoff'
                ? await h.backend.generateCaption({ caption: written.caption, imageKind: 'background' })
                : await pending;
            assert.equal(result.reason, 'stale-config'); assert.equal(result.stopGeneration, true);
            if (queued) assert.equal((await queued).reason, 'stale-config');
            h.gates.forEach(gate => gate.resolve()); await imageTick(); await imageTick();
            assert.equal(h.calls.length, phase === 'painting' ? 1 : 0, '切换后不补发或双发');
            if (phase === 'painting') assert.equal(h.calls[0].signal.aborted, true);
            assert.deepEqual(h.readBridge().autoIllustration, baseline.autoIllustration, '来源切换不互写配置');
        } finally { h.close(); }
    });
}

async function externalSourceHarness(mode, phase, fail = false) {
    const h = await committedImageHarness(), gate = imageDeferred();
    const requests = [], naiCalls = [], reads = [], waits = [];
    const context = { chat: [{ mes: '正文' }], extensionSettings: {
        baibai_image: { enabled: true, autoTag: { enabled: true } },
        'st-chatu8': { scriptEnabled: true, autoLLMImageGen: true, insertOriginalText: true },
    } };
    const globalObject = { SillyTavern: { getContext: () => context },
        STBaiBaiImage: { apiVersion: 1, getBackendStatus: () => ({ configured: true }),
            async generate(request) {
                requests.push(request);
                if (phase === 'request') await gate.promise;
                if (fail) throw new Error('fixture-failure');
                return { dataUrl: 'data:image/png;base64,QQ==' };
            } },
        async fetch(url) {
            reads.push(url); await gate.promise;
            if (fail) throw new Error('fixture-image-read-failure');
            return { ok: true, blob: async () => new Blob(['fixture'], { type: 'image/png' }) };
        },
    };
    const backend = createImageBackend({ global: globalObject, getBridge: h.readBridge, taskRuntime: h.runtime,
        nai: { async generate(input) { naiCalls.push(input); return { ok: true, dataUrl: 'data:image/png;base64,TkFJ' }; } },
        chatu8: { findHost: () => ({ win: globalObject, eventSource: {} }),
            async request(_host, prompt) {
                requests.push(prompt);
                if (phase === 'request') await gate.promise;
                if (fail && phase !== 'image') return { ok: false, error: 'fixture-failure' };
                return { ok: true, imageData: phase === 'image' ? '/fixture-image' : 'data:image/png;base64,QQ==' };
            } },
        floorPromptWait: { timeoutMs: 1, intervalMs: 1, async sleep() {
            waits.push(true); await gate.promise;
            context.chat[0].mes = '<bbi_image>room</bbi_image><image>image###room###</image>';
        } },
    });
    assert.equal(h.save({ bridge: { imageApi: { mode } } }).ok, true);
    return { ...h, backend, gate, requests, naiCalls, reads, waits,
        close() { gate.resolve(); h.close(); } };
}


for (const mode of ['baibai', 'extension']) {
    for (const phase of mode === 'extension' ? ['floor', 'request', 'image'] : ['floor', 'request']) {
        for (const fail of [false, true]) {
            test(`gate:source-switch:external-${mode}-${phase}-${fail ? 'failure' : 'success'}切回不复活`, { timeout: 5000 }, async () => {
                const h = await externalSourceHarness(mode, phase, fail);
                try {
                    const baseline = structuredClone(h.readBridge());
                    const pending = h.backend.generate({ scene: 'room' }, baseline.autoIllustration.nai,
                        phase === 'floor' ? { messageId: 0, slot: 1 } : {});
                    await imageTick();
                    assert.equal(phase === 'floor' ? h.waits.length : phase === 'image' ? h.reads.length : h.requests.length, 1);
                    assert.equal(h.save({ bridge: { imageApi: { mode: 'nai' } } }).ok, true);
                    assert.equal(h.save({ bridge: { imageApi: { mode } } }).ok, true);
                    const result = await pending;
                    assert.equal(result.ok, false); assert.equal(result.reason, 'stale-config');
                    assert.equal(result.stopGeneration, true); assert.equal(result.dataUrl, undefined);
                    h.gate.resolve(); await imageTick(); await imageTick();
                    assert.equal(h.requests.length, phase === 'floor' ? 0 : 1, '失效后不继续外部请求');
                    assert.equal(h.naiCalls.length, 0, '迟到失败或图片读取失败不启动 NAI 兜底');
                    assert.deepEqual(h.readBridge().autoIllustration, baseline.autoIllustration);
                } finally { h.close(); }
            });
        }
    }
}

for (const method of ['generateForReader', 'testForReader', 'generateCaption']) {
    test(`gate:source-switch:external-baibai-${method}保留停止原因`, { timeout: 5000 }, async () => {
        const h = await externalSourceHarness('baibai', 'request', true);
        try {
            const pending = method === 'generateCaption'
                ? h.backend.generateCaption({ caption: { v4_prompt: { caption: { base_caption: 'room', char_captions: [] } },
                    v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } } } })
                : h.backend[method]({ prompt: 'room' }, { unifiedSettings: { bridge: h.readBridge() } });
            await imageTick(); assert.equal(h.requests.length, 1);
            assert.equal(h.save({ bridge: { imageApi: { mode: 'nai' } } }).ok, true);
            assert.equal(h.save({ bridge: { imageApi: { mode: 'baibai' } } }).ok, true);
            const result = await pending;
            assert.equal(result.reason, 'stale-config'); assert.equal(result.stopGeneration, true);
            assert.equal(result.url, undefined); assert.equal(result.dataUrl, undefined);
            h.gate.resolve(); await imageTick(); await imageTick();
            assert.equal(h.naiCalls.length, 0);
        } finally { h.close(); }
    });
}




test('gate:image-runtime:真实设置失败保存不失效，服装资料保存不误取消', { timeout: 3000 }, async () => {
    const h = await committedImageHarness();
    try {
        const config = await h.backend.getEditConfig({ imageKind: 'cg' });
        assert.equal(config.ok, true); assert.equal(config.isCurrent(), true);
        const before = structuredClone(h.readBridge()), originalWrite = h.storage.setItem;
        h.storage.setItem = () => { throw new Error('隔离保存失败'); };
        assert.equal(h.save({ bridge: { autoIllustration: { nai: { apiKey: 'fixture-b' } } } }).ok, false);
        assert.deepEqual(h.readBridge(), before); assert.equal(config.isCurrent(), true);
        h.storage.setItem = originalWrite;
        assert.equal(h.save({ bridge: { autoIllustration: before.autoIllustration, sceneAssets: {
            wardrobe: { fixture: { prompt: 'A white dress.' } } } } }).ok, true);
        assert.equal(config.isCurrent(), true);
        assert.equal((await h.backend.generate({ scene: 'room' }, before.autoIllustration.nai,
            { expectedConfigToken: config.configToken })).ok, true);
        assert.equal(h.calls.length, 1);
        assert.equal(JSON.stringify(config).includes('fixture-a'), false);
    } finally { h.close(); }
});

for (const field of ['apiKey', 'endpoint', 'transport', 'model', 'artistPrefix', 'writing']) {
    test(`gate:image-runtime:成功提交${field}后改回仍拒绝旧写词交接与配置令牌`, { timeout: 3000 }, async () => {
        const h = await committedImageHarness();
        try {
            const config = await h.backend.getEditConfig({ imageKind: 'cg' });
            const written = await h.backend.writePrompt({ description: '画无人房间', imagePromptTask: 'background' });
            assert.equal(written.ok, true, written.error);
            const baseline = structuredClone(h.readBridge().autoIllustration);
            const changed = structuredClone(baseline);
            if (field === 'writing') {
                changed.llm = { ...changed.llm, jailbreakHead: 'Fixture writing requirement.' };
            } else changed.nai[field] = { apiKey: 'fixture-b', endpoint: 'https://fixture.test/ai/generate-image',
                transport: 'st-proxy', model: 'nai-diffusion-5-full', artistPrefix: 'artist:fixture' }[field];
            assert.equal(h.save({ bridge: { autoIllustration: changed } }).ok, true);
            assert.equal(config.isCurrent(), false);
            assert.equal(h.save({ bridge: { autoIllustration: baseline } }).ok, true);
            assert.equal(config.isCurrent(), false, '改回原值不得复活旧租约');
            const handoff = await h.backend.generateCaption({ caption: written.caption, imageKind: 'background' });
            assert.equal(handoff.ok, false);
            const token = await h.backend.generate({ scene: 'room' }, baseline.nai,
                { expectedConfigToken: config.configToken });
            assert.equal(token.reason, 'stale-config');
            assert.equal(h.calls.length, 0);
        } finally { h.close(); }
    });
}

test('gate:image-runtime:配置变更取消排队与在途任务，迟到成功不交付', { timeout: 3000 }, async () => {
    const h = await committedImageHarness();
    try {
        h.waitImages();
        const baseline = structuredClone(h.readBridge().autoIllustration);
        const first = h.backend.generate({ scene: 'room' }, baseline.nai);
        await imageTick();
        assert.equal(h.calls.length, 1);
        const second = h.backend.generate({ scene: 'room' }, baseline.nai);
        await imageTick();
        const changed = structuredClone(baseline); changed.nai.artistPrefix = 'artist:fixture';
        assert.equal(h.save({ bridge: { autoIllustration: changed } }).ok, true);
        assert.equal(h.save({ bridge: { autoIllustration: baseline } }).ok, true);
        assert.equal((await first).reason, 'stale-config');
        assert.equal((await second).reason, 'stale-config');
        assert.equal(h.calls[0].signal.aborted, true);
        h.gates[0].resolve(); await imageTick();
        assert.equal(h.calls.length, 1);
    } finally { h.close(); }
});

test('gate:image-runtime:current切换后改回不复活，草稿与失败保存不改变有效租约', { timeout: 3000 }, async () => {
    const h = await committedImageHarness();
    try {
        const config = await h.backend.getEditConfig({ imageKind: 'cg' });
        const current = h.registry.getCurrent('prompt-preset');
        const epoch = h.registry.getImagePromptEpoch();
        const other = structuredClone(current); other.id = 'fixture-image-preset';
        assert.equal(h.registry.savePromptPreset(other, null).ok, true);
        assert.equal(h.registry.savePromptDraft(current.id, current,
            { expectedRevision: current.data.revision }).ok, true);
        assert.equal(h.registry.getImagePromptEpoch(), epoch);
        assert.equal(config.isCurrent(), true);
        const write = h.storage.setItem;
        h.storage.setItem = (key, value) => {
            if (key === h.registry.store.key) throw new Error('隔离预设写入失败');
            return write(key, value);
        };
        // 只阻断预设存储，不影响设置页记忆和其他写口。
        const failed = h.registry.activateImagePromptPreset(other.id, h.registry.get('prompt-preset', other.id).data.revision);
        assert.equal(failed.ok, false);
        assert.equal(config.isCurrent(), true);
        h.storage.setItem = write;
        assert.equal(h.registry.activateImagePromptPreset(other.id, h.registry.get('prompt-preset', other.id).data.revision).ok, true);
        assert.equal(config.isCurrent(), false);
        assert.equal(h.registry.activateImagePromptPreset(current.id, current.data.revision).ok, true);
        assert.equal(config.isCurrent(), false);
        assert.ok(h.registry.getImagePromptEpoch() > epoch);
        assert.equal((await h.backend.generate({ scene: 'room' }, h.readBridge().autoIllustration.nai,
            { expectedConfigToken: config.configToken })).reason, 'stale-config');
        assert.equal(h.calls.length, 0);
    } finally { h.close(); }
});

for (const stop of ['settings', 'preset', 'abort', 'dispose']) {
    test(`gate:image-runtime:写词期间${stop}停止等待并拒收迟到回复`, { timeout: 3000 }, async () => {
        const h = await committedImageHarness(), controller = new AbortController();
        try {
            h.waitWriting();
            const writing = h.backend.writePrompt({ description: '画无人房间', imagePromptTask: 'background',
                signal: controller.signal });
            await imageTick(); assert.equal(h.gates.length, 1);
            if (stop === 'settings') {
                const changed = structuredClone(h.readBridge().autoIllustration);
                changed.nai.artistPrefix = 'artist:fixture';
                assert.equal(h.save({ bridge: { autoIllustration: changed } }).ok, true);
            } else if (stop === 'preset') {
                const current = h.registry.getCurrent('prompt-preset');
                current.data.prompts.find(block => block.identifier === 'igs-image-framework').content += '\nFixture instruction.';
                assert.equal(h.registry.savePromptPreset(current, current.data.revision).ok, true);
            } else if (stop === 'abort') controller.abort();
            else h.runtime.dispose();
            const result = await writing;
            assert.equal(result.reason, 'stale-config');
            assert.equal(result.stopGeneration, true); assert.equal(result.caption, undefined);
            h.gates[0].resolve(); await imageTick(); assert.equal(h.calls.length, 0);
        } finally { h.close(); }
    });
}

test('gate:image-runtime:最终请求使用租约私有配置且保留任务覆写', { timeout: 3000 }, async () => {
    const h = await committedImageHarness();
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    try {
        const old = structuredClone(h.readBridge().autoIllustration.nai);
        const auto = structuredClone(h.readBridge().autoIllustration);
        Object.assign(auto.nai, { apiKey: 'fixture-b', endpoint: 'https://fixture.test/ai/generate-image',
            transport: 'st-proxy', model: 'nai-diffusion-4-full', steps: 17, artistPrefix: 'artist:current' });
        assert.equal(h.save({ bridge: { autoIllustration: auto,
            imageApi: { ...h.readBridge().imageApi, cgModel: 'nai-diffusion-5-full' } } }).ok, true);
        const wires = [];
        const nai = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (url, init) => {
            wires.push({ url, init, body: JSON.parse(init.body) }); return imageResponse();
        } });
        const backend = createImageBackend({ nai, taskRuntime: h.runtime, getBridge: h.readBridge, global: {} });
        assert.equal((await backend.generate({ scene: 'room' }, old,
            { imageKind: 'cg', size: '640x640' })).ok, true);
        assert.equal(wires[0].init.headers.Authorization === 'Bearer fixture-b', true);
        assert.equal(wires[0].url, '/proxy/https://fixture.test/ai/generate-image');
        assert.equal(wires[0].body.model, 'nai-diffusion-5-full');
        assert.equal(wires[0].body.parameters.steps, 17);
        assert.equal(wires[0].body.parameters.width, 640);
        assert.equal(wires[0].body.input, 'artist:current, room');
        const png = pngFixture(64, 128).dataUrl;
        const result = await backend.edit({ prompt: 'room', sourceDataUrl: png, maskDataUrl: png,
            width: 64, height: 128, model: 'nai-diffusion-4-5-full-inpainting' });
        assert.equal(result.ok, true, result.error);
        assert.equal(wires[1].body.model, 'nai-diffusion-4-5-full-inpainting');
        assert.equal(wires[1].init.headers.Authorization === 'Bearer fixture-b', true);
        const reader = await backend.generateForReader({ prompt: 'room', size: '640x640' },
            { unifiedSettings: { bridge: h.readBridge() } });
        assert.ok(reader.url); assert.equal(wires[2].body.model, 'nai-diffusion-5-full');
        assert.equal(JSON.stringify(wires.map(w => w.body)).includes('fixture-b'), false);
    } finally { h.close(); }
});


test('gate:image-runtime:画师三态与重绘配置来自同一租约快照', { timeout: 5000 }, async () => {
    const h = await committedImageHarness();
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    try {
        const stale = structuredClone(h.readBridge());
        stale.autoIllustration.nai.artistPrefix = 'artist:stale';
        const auto = structuredClone(h.readBridge().autoIllustration);
        auto.nai.artistPrefix = 'artist:global';
        auto.nai.artistByKind = { enabled: true, kinds: { cg: { positive: 'artist:snapshot', negative: 'snapshot-uc' } } };
        assert.equal(h.save({ bridge: { autoIllustration: auto,
            imageApi: { ...h.readBridge().imageApi, cgModel: 'nai-diffusion-5-full' } } }).ok, true);
        const wires = [];
        const nai = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (_url, init) => {
            wires.push(JSON.parse(init.body)); return imageResponse();
        } });
        const backend = createImageBackend({ nai, taskRuntime: h.runtime, getBridge: () => stale, global: {} });
        assert.equal((await backend.generate({ scene: 'room', sceneUc: 'text' }, stale.autoIllustration.nai,
            { imageKind: 'cg' })).ok, true);
        assert.equal(wires[0].input, 'artist:snapshot, room');
        assert.equal(wires[0].parameters.negative_prompt, 'snapshot-uc, text');
        const caption = parseCaptionSlots('scene: A quiet room.\nchar:\nuc: text').captions[0].caption;
        const original = structuredClone(caption), png = pngFixture(64, 128).dataUrl;
        for (const artist of [undefined, null, { positivePrompt: 'artist:override', negativePrompt: 'override-uc' }]) {
            const meta = { imageKind: 'cg', ...(artist !== undefined && { artist }) };
            const config = await backend.getEditConfig(meta);
            assert.equal(config.ok, true); assert.equal(config.model, 'nai-diffusion-5-full');
            const expected = artist === undefined
                ? { positivePrompt: 'artist:snapshot', negativePrompt: 'snapshot-uc' } : artist;
            assert.deepEqual(config.artist, expected);
            const result = await backend.generateCaption({ ...meta, caption, captionMode: 'final' });
            assert.equal(result.ok, true, result.error);
            assert.equal(wires.at(-1).input, (expected?.positivePrompt ? expected.positivePrompt + ', ' : '') + 'A quiet room.');
            assert.equal(wires.at(-1).parameters.negative_prompt, (expected?.negativePrompt ? expected.negativePrompt + ', ' : '') + 'text');

            const edited = await backend.edit({ ...meta, caption, captionMode: 'final',
                sourceDataUrl: png, maskDataUrl: png, width: 64, height: 128,
                expectedConfigToken: config.configToken });
            assert.equal(edited.ok, true, edited.error);
            assert.equal(wires.at(-1).model, 'nai-diffusion-5-full-inpainting');
            assert.equal(wires.at(-1).action, 'infill');
            assert.equal(wires.at(-1).input, (expected?.positivePrompt ? expected.positivePrompt + ', ' : '') + 'A quiet room.');
            assert.equal(wires.at(-1).parameters.negative_prompt, (expected?.negativePrompt ? expected.negativePrompt + ', ' : '') + 'text');
            assert.deepEqual(edited.sentPrompt.artist, expected);
            assert.equal(config.isCurrent(), true);
        }
        assert.deepEqual(caption, original);
        const explicit = await backend.getEditConfig({ imageKind: 'cg', model: 'nai-diffusion-4-5-full-inpainting' });
        assert.equal(explicit.ok, true); assert.equal(explicit.model, 'nai-diffusion-4-5-full-inpainting');
        assert.equal(JSON.stringify(wires).includes('artist:stale'), false);
    } finally { h.close(); }
});


async function snapshotWritingHarness(entry, failure) {
    const h = await committedImageHarness();
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const { writeCaptionsWithLlm, writeTemplateCaptionsWithLlm } = await import('../src/generated-images/illustration/caption-writer.js');
    const { requestWithSoftRetry } = await import('../src/generated-images/illustration/prompt-kit.js');
    const calls = [], gate = imageDeferred();
    let waiting = false;
    const reply = ['slotid: 6', 'prompt_mode: dna_template', 'scene: One woman in a half-body composition.',
        'char: 0.3,0.5 | <<dna:rA7>> wears a blue coat and waves.',
        'char_uc: <<dna_uc:rA7>>, closed eyes', 'meta_kind: 0 | named', 'meta_key: 0 | Alice',
        'meta_token: 0 | rA7', 'meta_frame: 0 | half_body', 'meta_outfit_name: 0 | Coat',
        'meta_outfit_description: 0 | A blue coat.',
        'meta_dna_full_body: 0 | Alice, a tall adult woman with silver hair and blue eyes,',
        'meta_dna_half_body: 0 | Alice, an adult woman with silver hair and blue eyes,',
        'meta_dna_portrait: 0 | Alice, an adult woman with silver hair and blue eyes,'].join('\n');
    const llm = createImagePromptLlm({ async request(request, settings) {
        calls.push({ request, settings });
        if (waiting) await gate.promise;
        if (failure) throw failure;
        return entry === 'template' ? reply : '#1\nscene: A quiet room.\nchar:\nuc: text';
    } }, h.registry, h.runtime);
    const old = { source: 'openai', endpoint: '', model: '' };
    const meta = { description: '画 Alice 的半身立绘', imagePromptTask: 'sprite',
        promptTask: { version: 1, mode: 'dna_template', purpose: 'sprite',
            characters: [{ characterKey: 'Alice', token: 'rA7', framing: 'half_body' }] },
        characterContext: [{ characterKey: 'Alice', dna: {} }] };
    const write = () => entry === 'template' ? writeTemplateCaptionsWithLlm(llm, old, meta)
        : entry === 'caption' ? writeCaptionsWithLlm(llm, old, '画无人房间', { imagePromptTask: 'background' })
        : requestWithSoftRetry(llm, { system: 'fixture', user: '画无人房间', parse: parseCaptionSlots,
            imagePrompt: { task: 'background', input: { description: '画无人房间', outputs: { format: 'caption-slots' } } } }, old);
    return { h, calls, write, wait: () => { waiting = true; }, close() { gate.resolve(); h.close(); } };
}

for (const entry of ['caption', 'template', 'soft']) {
    test(`gate:image-runtime:${entry}写词透传422诊断且不补发`, async () => {
        const { secondaryLlmHttpError } = await import('../src/host/secondary-llm-result.js');
        const failure = secondaryLlmHttpError(422, 'st-backend');
        const fixture = await snapshotWritingHarness(entry, failure);
        try {
            const auto = structuredClone(fixture.h.readBridge().autoIllustration);
            auto.llm = { ...auto.llm, source: 'openai', endpoint: 'https://fixture.test/v1', model: 'fixture-model' };
            assert.equal(fixture.h.save({ bridge: { autoIllustration: auto } }).ok, true);
            const result = await fixture.write();
            assert.equal(result.ok, false);
            assert.equal(result.reason, 'secondary-llm-http-failed');
            assert.equal(result.status, 422);
            assert.deepEqual(result.diagnostic, { stage: 'secondary-llm', transport: 'st-backend', status: 422 });
            assert.match(result.error, /HTTP 422.*未自动补发/);
            assert.equal(fixture.calls.length, 1);
        } finally { fixture.close(); }
    });
}


for (const entry of ['caption', 'template', 'soft']) {
    test(`gate:image-runtime:${entry}写词使用私有LLM配置并拒收变更后的回复`, { timeout: 5000 }, async () => {
        const fixture = await snapshotWritingHarness(entry), { h, calls } = fixture;
        try {
            const auto = structuredClone(h.readBridge().autoIllustration);
            auto.llm = { ...auto.llm, source: 'openai', endpoint: 'https://fixture.test/v1',
                model: 'snapshot-model', apiKey: 'fixture-writing-key', jailbreakHead: 'Fixture requirement.' };
            assert.equal(h.save({ bridge: { autoIllustration: auto } }).ok, true);
            const first = await fixture.write();
            assert.equal(first.ok, true, first.error);
            assert.equal(calls.length, 1);
            for (const key of ['source', 'endpoint', 'model', 'apiKey', 'jailbreakHead'])
                assert.equal(calls[0].settings[key] === auto.llm[key], true, key);
            assert.ok(Array.isArray(calls[0].request.messages));
            assert.equal(JSON.stringify(calls[0].request).includes('fixture-writing-key'), false);
            fixture.wait();
            const pending = fixture.write();
            await imageTick();
            assert.equal(calls.length, 2);
            assert.equal(calls[1].settings.model, 'snapshot-model');
            const changed = structuredClone(auto); changed.llm.model = 'next-model';
            assert.equal(h.save({ bridge: { autoIllustration: changed } }).ok, true);
            const stopped = await pending;
            assert.equal(stopped.reason, 'stale-config');
            assert.equal(stopped.stopGeneration, true);
            assert.equal(stopped.caption, undefined);
            assert.equal(calls[1].settings.signal.aborted, true);
            assert.equal(h.calls.length, 0);
        } finally { fixture.close(); }
        await imageTick();
        assert.equal(calls.length, 2, '迟到回复不得追加写词请求');
    });
}


test('gate:image-runtime:草稿试图冻结配置且与正式生成共享凭据队列', { timeout: 5000 }, async () => {
    const h = await committedImageHarness();
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    const gate = imageDeferred(), wires = [];
    let active = 0, maxActive = 0;
    try {
        const baseline = structuredClone(h.readBridge());
        const draft = structuredClone(baseline);
        Object.assign(draft.autoIllustration.nai, { endpoint: 'https://fixture.test/ai/generate-image',
            transport: 'st-proxy', model: 'nai-diffusion-5-full', artistPrefix: 'artist:draft' });
        const nai = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (url, init) => {
            active++; maxActive = Math.max(maxActive, active);
            wires.push({ url, init, body: JSON.parse(init.body) });
            try { if (wires.length === 1) await gate.promise; return imageResponse(); }
            finally { active--; }
        } });
        const backend = createImageBackend({ nai, taskRuntime: h.runtime, getBridge: h.readBridge, global: {} });
        const config = await backend.getEditConfig();
        const formal = backend.generate({ scene: 'formal room' }, baseline.autoIllustration.nai);
        await imageTick(); assert.equal(wires.length, 1);
        const preview = backend.testForReader({ prompt: 'draft room' }, { unifiedSettings: { bridge: draft } });
        draft.autoIllustration.nai.artistPrefix = 'artist:late';
        draft.autoIllustration.nai.endpoint = 'https://late.test/ai/generate-image';
        await imageTick(); assert.equal(wires.length, 1);
        gate.resolve();
        assert.equal((await formal).ok, true);
        assert.ok((await preview).url);
        assert.equal(maxActive, 1); assert.equal(wires.length, 2);
        assert.equal(wires[1].url, '/proxy/https://fixture.test/ai/generate-image');
        assert.equal(wires[1].body.model, 'nai-diffusion-5-full');
        assert.equal(wires[1].body.input, 'artist:draft, draft room');
        assert.deepEqual(h.readBridge(), baseline); assert.equal(config.isCurrent(), true);
        assert.equal((await backend.generate({ scene: 'formal room' }, draft.autoIllustration.nai)).ok, true);
        assert.equal(wires[2].body.model, baseline.autoIllustration.nai.model);
        assert.equal(wires[2].body.input, 'formal room');
        assert.equal(JSON.stringify(wires.map(w => w.body)).includes('fixture-a'), false);
    } finally { gate.resolve(); h.close(); }
});


for (const phase of ['queued', 'inflight']) {
    for (const stop of ['abort', 'settings', 'dispose']) {
        test(`gate:image-runtime:草稿试图${phase}-${stop}拒发或拒收迟到结果`, { timeout: 5000 }, async () => {
            const h = await committedImageHarness();
            const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
            const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
            const gate = imageDeferred(), calls = [], controller = new AbortController();
            let formal;
            try {
                const baseline = structuredClone(h.readBridge());
                const nai = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (_url, init) => {
                    calls.push(init); await gate.promise; return imageResponse();
                } });
                const backend = createImageBackend({ nai, taskRuntime: h.runtime, getBridge: h.readBridge, global: {} });
                if (phase === 'queued') {
                    formal = backend.generate({ scene: 'formal room' }, baseline.autoIllustration.nai);
                    await imageTick(); assert.equal(calls.length, 1);
                }
                const preview = backend.testForReader({ prompt: 'draft room', signal: controller.signal },
                    { unifiedSettings: { bridge: baseline } });
                await imageTick(); assert.equal(calls.length, 1);
                if (stop === 'abort') controller.abort();
                else if (stop === 'dispose') h.runtime.dispose();
                else {
                    const auto = structuredClone(baseline.autoIllustration);
                    auto.nai.artistPrefix = 'artist:changed';
                    assert.equal(h.save({ bridge: { autoIllustration: auto } }).ok, true);
                }
                const stopped = await preview;
                assert.equal(stopped.reason, 'stale-config');
                assert.equal(stopped.stopGeneration, true);
                assert.equal(stopped.url, undefined);
                if (phase === 'inflight' || stop !== 'abort') assert.equal(calls[0].signal.aborted, true);
                gate.resolve();
                if (formal) {
                    const result = await formal;
                    assert.equal(result.ok, stop === 'abort');
                }
                await imageTick(); assert.equal(calls.length, 1, '排队取消零发送，在途迟到不补发');
                if (stop === 'dispose') {
                    assert.equal((await backend.testForReader({ prompt: 'room' },
                        { unifiedSettings: { bridge: baseline } })).reason, 'stale-config');
                    assert.equal(calls.length, 1);
                }
            } finally { gate.resolve(); h.close(); if (formal) await formal; }
        });
    }
}


const providedForbiddenFields = ['numberedText', 'previousText', 'lore', 'characters', 'scenes',
    'messageId', 'skipRecall', 'history', 'characterLibrary', 'tagLibrary'];
function forbidProvidedReads(input) {
    for (const field of providedForbiddenFields) Object.defineProperty(input, field,
        { enumerable: true, get() { assert.fail(`provided 不得读取 ${field}`); } });
    return input;
}

test('gate:provided:白名单先于复制且保留控制字段，旧输入对象不变', async () => {
    const { imageWritingContext } = await import('../src/generated-images/image-prompt-context.js');
    const { PROVIDED_PROMPT_DATA_FIELDS } = await import('../src/presets/prompt-preset.js');
    const signal = new AbortController().signal;
    const input = forbidProvidedReads({ contextMode: 'provided', imagePromptTask: 'consistency',
        systemPrompt: 'system', signal, shouldStart: () => true, expectedConfigToken: 'fixture-token',
        ...Object.fromEntries(PROVIDED_PROMPT_DATA_FIELDS.map(field => [field, { field }])) });
    const filtered = imageWritingContext(input);
    assert.equal(filtered.ok, true);
    for (const field of [...PROVIDED_PROMPT_DATA_FIELDS, 'contextMode', 'imagePromptTask',
        'systemPrompt', 'signal', 'shouldStart', 'expectedConfigToken'])
        assert.equal(filtered.value[field], input[field], field);
    for (const field of providedForbiddenFields) assert.equal(Object.hasOwn(filtered.value, field), false);
    const legacy = { description: '旧调用', numberedText: '旧正文', messageId: 8 };
    assert.equal(imageWritingContext(legacy).value, legacy);
    assert.deepEqual(legacy, { description: '旧调用', numberedText: '旧正文', messageId: 8 });
    const invalid = { contextMode: 'unknown', get description() { assert.fail('未知模式不得读资料'); } };
    assert.equal(imageWritingContext(invalid).reason, 'PROMPT_CONTEXT_MODE');
});

test('gate:provided:渲染器拒收禁止的必需字段和未知模式', async () => {
    const { renderImagePromptPreset } = await import('../src/presets/prompt-preset-renderer.js');
    const { createDefaultImagePromptPreset } = await import('../src/generated-images/image-prompt-defaults.js');
    const preset = createDefaultImagePromptPreset();
    const input = forbidProvidedReads({ contextMode: 'provided', description: '明确资料 {{任务资料}}',
        promptTask: { purpose: 'consistency' }, characterContext: [{ characterKey: 'A' }],
        userPrompts: { positive: 'provided-positive' }, writingRequirements: { quality: 'provided-quality' },
        originalPrompt: { caption: 'original' }, layout: { crop: { x: 0 } }, outputs: { format: 'dna-template' } });
    const restricted = structuredClone(preset.data);
    restricted.modules.find(module => module.task === 'consistency').requiredFields.push('numberedText');
    const rejected = renderImagePromptPreset(restricted, 'consistency', input);
    assert.equal(rejected.reason, 'missing-prompt-data');
    assert.deepEqual(rejected.errors, [{ field: 'numberedText', reason: 'required' }]);
    assert.equal(renderImagePromptPreset(preset.data, 'consistency', { contextMode: 'unknown' }).reason, 'PROMPT_CONTEXT_MODE');
});

test('gate:provided:未知模式在内置与 DBG 来源分支前零调用', async () => {
    for (const mode of ['nai', 'dbgen']) {
        const backend = createImageBackend({ global: { get NaiDbGen() { assert.fail('未知模式不能读取 DBG'); } },
            getBridge: () => ({ imageApi: { mode } }),
            llm: { request() { assert.fail('未知模式不能写词'); } } });
        const result = await backend.writePrompt({ contextMode: 'unknown',
            get promptTask() { assert.fail('未知模式不能校验任务'); } });
        assert.equal(result.reason, 'PROMPT_CONTEXT_MODE');
    }
});

test('gate:provided:过滤与任务归一复制保留私有租约，配置变化后零写词', async () => {
    const h = await committedImageHarness();
    const { imageWritingContext } = await import('../src/generated-images/image-prompt-context.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    let calls = 0;
    try {
        const meta = forbidProvidedReads({ contextMode: 'provided', imagePromptTask: 'sprite', description: '画 Alice',
            promptTask: { version: 1, mode: 'dna_template', purpose: 'sprite',
                characters: [{ characterKey: 'Alice', token: 'rA7', framing: 'half_body' }] },
            characterContext: [{ characterKey: 'Alice', dna: {} }] });
        const lease = h.runtime.capture(meta);
        assert.equal(lease.ok, true); lease.bind(meta); lease.release();
        const filtered = imageWritingContext(meta).value;
        const inherited = h.runtime.capture(filtered);
        assert.equal(inherited.ok, true); assert.equal(inherited.token, lease.token); inherited.release();
        const auto = structuredClone(h.readBridge().autoIllustration);
        auto.nai.artistPrefix = 'artist:changed';
        assert.equal(h.save({ bridge: { autoIllustration: auto } }).ok, true);
        const llm = createImagePromptLlm({ request() { calls++; assert.fail('旧租约不得开始写词'); } }, h.registry, h.runtime);
        const backend = createImageBackend({ global: {}, llm, taskRuntime: h.runtime, getBridge: h.readBridge });
        const result = await backend.writePrompt(meta);
        assert.equal(result.reason, 'stale-config'); assert.equal(result.stopGeneration, true);
        assert.equal(calls, 0); assert.equal(h.calls.length, 0);
    } finally { h.close(); }
});


test('gate:image-worldinfo:扫描失败或期间失效均阻止写词发送', async () => {
    const { createPresetRegistry } = await import('../src/presets/preset-registry.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const { requestWithSoftRetry } = await import('../src/generated-images/illustration/prompt-kit.js');
    for (const mode of ['failure', 'cancel', 'preset-change']) {
        const registry = createPresetRegistry();
        const controller = new AbortController();
        let scans = 0, writes = 0;
        const llm = createImagePromptLlm({ async request() { writes++; throw new Error('不得发送'); } },
            registry, undefined, async () => {
                scans++;
                if (mode === 'failure') return { ok: false, reason: 'WORLDINFO_RESOLVE_FAILED', stopGeneration: true };
                if (mode === 'cancel') controller.abort();
                else {
                    const current = registry.getCurrent('prompt-preset');
                    current.name = '已变更';
                    assert.equal(registry.savePromptPreset(current, current.data.revision).ok, true);
                }
                return { ok: true, text: '' };
            });
        const result = await requestWithSoftRetry(llm, { system: '', user: '', signal: controller.signal,
            imagePrompt: { task: 'background', input: { description: '本次任务', outputs: { format: 'asset-plan' } } },
            parse() { assert.fail('停发后不得解析'); } }, {});
        assert.equal(result.reason, mode === 'failure' ? 'WORLDINFO_RESOLVE_FAILED' : 'stale-config');
        assert.equal(result.stopGeneration, true);
        assert.equal(scans, 1); assert.equal(writes, 0);
    }
});

test('gate:image-worldinfo:provided与关闭参考块均不读取宿主或世界书getter', async () => {
    const { createPresetRegistry } = await import('../src/presets/preset-registry.js');
    const { createDefaultImagePromptPreset } = await import('../src/generated-images/image-prompt-defaults.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const registry = createPresetRegistry();
    const llm = createImagePromptLlm({}, registry, undefined, () => assert.fail('禁止扫描'));
    const input = { contextMode: 'provided', description: '明确资料', outputs: { format: 'dna-template' } };
    Object.defineProperty(input, 'worldInfo', { enumerable: true, get() { assert.fail('禁止读取'); } });
    assert.equal((await llm.prepareImagePrompt('consistency', input)).ok, true);
    const preset = createDefaultImagePromptPreset();
    preset.data.prompts.find(block => block.identifier === 'igs-image-world').enabled = false;
    assert.equal(registry.savePromptPreset(preset, 1).ok, true);
    assert.equal((await llm.prepareImagePrompt('background', {
        description: '本次任务', outputs: { format: 'asset-plan' } })).ok, true);
});
