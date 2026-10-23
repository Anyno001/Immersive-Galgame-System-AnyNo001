import test from 'node:test';
import assert from 'node:assert/strict';
import { pngFixture } from './helpers/png-fixture.js';

import { createImageBackend } from '../src/generated-images/image-backend.js';
import { parseCaptionSlots } from '../src/generated-images/illustration/caption-writer.js';
import { recoverOperation, subscribeRecoveries } from '../src/storage/automatic-recovery.js';

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

test('gate:image-runtime:柏宝绘计时保留结果，主动取消可结束忽略信号的插件调用', { timeout: 3000 }, async () => {
    const { requestBaibaiImage } = await import('../src/generated-images/baibai-client.js');
    const resultGate = imageDeferred(), slow = imageDeferred();
    let calls = 0;
    const api = { async generate() { calls++; return resultGate.promise; } };
    const pending = requestBaibaiImage(api, { scene: 'room' }, { timeoutMs: 10, onSlow: slow.resolve });
    await slow.promise;
    assert.equal(calls, 1);
    resultGate.resolve({ dataUrl: 'data:image/png;base64,QQ==' });
    assert.equal((await pending).ok, true);
    const stopped = new AbortController(); stopped.abort();
    assert.equal((await requestBaibaiImage(api, { scene: 'room' }, { signal: stopped.signal })).reason, 'request-stale');
    assert.equal(calls, 1, '主动取消后不再调用插件');
    const live = new AbortController();
    const active = requestBaibaiImage({ generate: () => new Promise(() => {}) }, { scene: 'room' }, { signal: live.signal });
    live.abort();
    assert.equal((await active).reason, 'request-stale');
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
    const owner = { localStorage: storage };
    const app = bootstrapIGS({ global: owner, events, presetRegistry: registry, autoAttachMagicWand: false,
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
    runtime = createBuiltinImageTaskRuntime({ readBridge, registry, global: owner,
        subscribeSettings: handler => events.on('igs:legacy-settings-updated', handler) });
    const calls = [], gates = [];
    let waitImages = false, waitWriting = false, reply;
    const writingCalls = [];
    const llm = createImagePromptLlm({ async request(request, settings) {
        writingCalls.push({ request: structuredClone(request), model: settings?.model });
        if (waitWriting) { const gate = imageDeferred(); gates.push(gate); await gate.promise; }
        if (reply) return reply(request, settings);
        return '#1\nscene: A quiet room.\nchar:\nuc: text';
    } }, registry, runtime);
    const nai = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (_url, init) => {
        calls.push({ action: JSON.parse(init.body).action, signal: init.signal });
        if (waitImages) { const gate = imageDeferred(); gates.push(gate); await gate.promise; }
        return imageResponse();
    } });
    const backend = createImageBackend({ nai, llm, taskRuntime: runtime, getBridge: readBridge, global: owner });
    return { app, registry, runtime, backend, llm, owner, storage, calls, gates, readBridge, save, writingCalls,
        setReply: next => { reply = next; },
        waitImages: () => { waitImages = true; }, waitWriting: () => { waitWriting = true; },
        close() { gates.forEach(gate => gate.resolve()); runtime.dispose(); app.destroy(); } };
    } catch (error) {
        runtime?.dispose(); app.destroy(); throw error;
    }
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


test('初始配置恢复：现有设置保存后原 NAI 请求和原副模型写词继续完成', { timeout: 5000 }, async t => {
    const h = await committedImageHarness();
    t.after(() => h.close());
    const original = structuredClone(h.readBridge().autoIllustration);
    assert.equal(h.save({ bridge: { autoIllustration: { ...original,
        nai: { ...original.nai, apiKey: '' },
        llm: { ...original.llm, source: 'openai', endpoint: '', model: '' } } } }).ok, true);
    const painting = h.backend.generate({ scene: 'room' }, {}, { imageKind: 'background' });
    const writing = h.backend.writePrompt({ description: '画无人房间', imagePromptTask: 'background' });
    await imageTick();
    assert.deepEqual([h.calls.length, h.writingCalls.length], [0, 0]);
    assert.equal(h.save({ bridge: { autoIllustration: { ...original,
        llm: { ...original.llm, source: 'openai', endpoint: 'https://fixture.invalid/v1', model: 'fixed-model' } } } }).ok, true);
    assert.equal((await painting).ok, true);
    const written = await writing;
    assert.equal(written.ok, true, written.error);
    assert.equal((await h.backend.generateCaption({ caption: written.caption, imageKind: 'background' })).ok, true);
    assert.deepEqual([h.calls.length, h.writingCalls.length], [2, 1]);
    assert.equal(h.writingCalls[0].model, 'fixed-model');
});

test('gate:image-runtime:真实设置失败保存不失效，服装资料保存不误取消', { timeout: 3000 }, async () => {
    const h = await committedImageHarness();
    try {
        const config = await h.backend.getEditConfig({ imageKind: 'cg' });
        assert.equal(config.ok, true); assert.equal(config.isCurrent(), true);
        const before = structuredClone(h.readBridge()), originalWrite = h.storage.setItem;
        h.storage.setItem = (key, value) => {
            if (key === 'igs_bridge_config') throw new Error('隔离保存失败');
            return originalWrite(key, value);
        };
        const saving = h.save({ bridge: { autoIllustration: { nai: { apiKey: 'fixture-b' } } } });
        assert.equal(saving.pending, true);
        assert.deepEqual(h.readBridge(), before); assert.equal(config.isCurrent(), true);
        h.storage.setItem = originalWrite;
        assert.equal((await saving.completion).ok, true);
        assert.equal(h.save({ bridge: { autoIllustration: before.autoIllustration, sceneAssets: {
            wardrobe: { fixture: { prompt: 'A white dress.' } } } } }).ok, true);
        assert.equal(config.isCurrent(), true);
        assert.equal((await h.backend.generate({ scene: 'room' }, before.autoIllustration.nai,
            { expectedConfigToken: config.configToken })).ok, true);
        assert.equal(h.calls.length, 1);
        assert.equal(JSON.stringify(config).includes('fixture-a'), false);
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




const providedForbiddenFields = ['numberedText', 'previousText', 'lore', 'characters', 'scenes',
    'messageId', 'skipRecall', 'history', 'characterLibrary', 'tagLibrary'];
function forbidProvidedReads(input) {
    for (const field of providedForbiddenFields) Object.defineProperty(input, field,
        { enumerable: true, get() { assert.fail(`provided 不得读取 ${field}`); } });
    return input;
}

test('中转地址单人图把角色词并入场景段，官方地址与多人图保持分段', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const wires = [];
    const nai = createNaiOfficialClient({ fetch: async (_url, init) => {
        wires.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    const solo = { scene: 'solo, standing', sceneUc: 'text', chars: [{ tags: '1girl, black_hair', uc: 'white_hair', x: 0.5, y: 0.5 }] };
    const duo = { ...solo, chars: [...solo.chars, { tags: '1boy', uc: '', x: 0.7, y: 0.5 }] };
    const relay = { apiKey: 'k', endpoint: 'https://my-relay.example.com/ai/generate-image' };
    assert.equal((await nai.generate(solo, relay)).ok, true);
    let wire = wires.at(-1);
    assert.equal(wire.input, 'solo, standing, 1girl, black_hair');
    assert.equal(wire.parameters.v4_prompt.caption.base_caption, 'solo, standing, 1girl, black_hair');
    assert.equal(wire.parameters.negative_prompt, 'text, white_hair');
    assert.equal(wire.parameters.v4_prompt.caption.char_captions[0].char_caption, '1girl, black_hair');
    await nai.generate(duo, relay);
    assert.equal(wires.at(-1).input, 'solo, standing');
    await nai.generate(solo, { apiKey: 'k' });
    assert.equal(wires.at(-1).input, 'solo, standing');
    await nai.generate(solo, { apiKey: 'k', endpoint: 'https://image.novelai.net/ai/generate-image' });
    assert.equal(wires.at(-1).input, 'solo, standing');
});
