import test from 'node:test';
import assert from 'node:assert/strict';

// 事务单测直接注入内置端口；实际 NAI 装配另由 builtinFixture 覆盖。
async function consistencyFixture(count = 2, storeOverride) {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const store = storeOverride || createMemoryIllustrationStore();
    const floor = { chatId: 'fixture-cg', messageId: 5, swipeId: 0, isAi: true, text: '测试正文。\n[igs-img:7]' };
    const key = 'fixture-cg|5|0';
    const image = (width, height, color) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) data.set(color, i);
        return { width, height, data };
    };
    const pixels = new Map([['original', image(128, 64, [12, 24, 36, 255])]]);
    let encoded = 0;
    const codec = { available: true,
        async decodeImage(src) { assert.ok(pixels.has(src), src); return pixels.get(src); },
        async encodePixels(value) { const id = `data:image/png;base64,${Buffer.from(`pixels-${++encoded}`).toString('base64')}`; pixels.set(id, value); return id; },
    };
    const names = ['A', 'B', 'C'].slice(0, count);
    const characters = names.map((characterKey, captionIndex) => ({ characterKey, captionIndex,
        identityAnchor: `old-${characterKey}`, signatureDetails: '', outfit: { name: '冬装', description: `coat-${characterKey}` },
        centers: [{ x: (captionIndex + 0.5) / count, y: 0.5 }], positionExplicit: true,
    }));
    const assets = { characters: {}, characterDna: {} };
    for (const [i, name] of names.entries()) {
        assets.characters[name] = { 默认: `reference-${name}` };
        assets.characterDna[name] = { version: 2, identityInitialized: true, views: Object.fromEntries(
            ['full_body', 'half_body', 'portrait', 'partial'].map((frame) =>
                [frame, { subject: `new-${name}`, negative: `wrong-${name}` }])) };
        pixels.set(`reference-${name}`, image(16, 32, [80 + i * 60, 100, 0, 255]));
    }
    const caption = {
        v4_prompt: { caption: { base_caption: 'Two people interacting in a room.', char_captions: characters.map((c) => ({ char_caption: `${c.characterKey}, ${c.identityAnchor}, ${c.outfit.description}`, centers: c.centers })) } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: characters.map(() => ({ char_caption: '' })) } },
    };
    const template = structuredClone(caption);
    template.v4_prompt.caption.char_captions.forEach((c, i) => { c.char_caption = `<<dna:actor${i}>> wears coat-${names[i]}.`; });
    const promptRecipe = { version: 1, mode: 'dna_template', caption: template,
        bindings: characters.map((c, i) => ({ kind: 'named', characterKey: c.characterKey,
            captionIndex: i, token: `actor${i}`, framing: 'half_body' })) };
    const before = await store.putSlot(key, { slot: 7, status: 'done', dataUrl: 'original', caption, promptRecipe,
        characterMeta: { version: 1, characters: characters.slice().reverse() }, originalSize: { width: 128, height: 64 } });
    const calls = [], references = [], events = [], writes = [];
    const { createImageJobLog } = await import('../src/generated-images/image-job-log.js');
    const logData = new Map(), reports = [];
    const logStorage = { getItem: (key) => logData.get(key), setItem: (key, value) => logData.set(key, value) };
    const jobLog = createImageJobLog({ storage: logStorage });
    const backend = { describeEdit: (_bridge, request = {}) => ({ supported: true, via: 'nai', model: request.model,
        infillImg2imgStrength: 1, appearanceCorrection: 1, infillModelNegotiation: 1, providedPromptContext: 1 }),
        async getEditConfig({ model } = {}) { return { ok: true, version: 1, configToken: 'fixture-config', model, artist: null, isCurrent: () => true }; },
        async writeDbgenPrompt(request) {
            writes.push(request);
            const captions = request.promptTask.slots.map(({ slotId, tokens, identityMode }) => {
                const rows = tokens.map((token) => request.promptTask.characters.find((c) => c.token === token));
                const outfitFor = c => request.characterContext.find(m => m.characterKey === c.characterKey).outfit;
                const ref = rows.find((c) => c.kind === 'reference');
                const caption = {
                    v4_prompt: { caption: { base_caption: ref
                        ? 'The inset shows the same character as an appearance reference. Two people interacting in a room, preserving their original clothing and interaction.'
                        : 'Two people interacting in a room.', char_captions: rows.map((c) => ({
                        char_caption: `<<dna:${c.token}>> ${c.kind === 'reference' ? 'is visible from the shoulders up.' : request.promptTask.outfitMode === 'template' ? `<<outfit:${c.token}>>.` : `wears ${outfitFor(c).description}.`}`,
                        centers: [{ x: 0.5, y: 0.5 }] })) } },
                    v4_negative_prompt: { caption: { base_caption: ref ? 'decorative frame, golden border, split screen, collage, duplicate person' : '', char_captions: rows.map((c) => ({ char_caption: `<<dna_uc:${c.token}>>` })) } },
                };
                return { slotId, caption, promptRecipe: { version: 1, mode: 'dna_template', caption,
                    ...(identityMode !== undefined && { identityMode }),
                    ...(request.promptTask.outfitMode && { outfitMode: request.promptTask.outfitMode }),
                    bindings: rows.map((c, captionIndex) => ({ ...c, captionIndex,
                        ...(identityMode !== undefined && { correction: {
                            subject: `new-${c.characterKey}`, negative: `correction-uc-${c.characterKey}`,
                        } }) })) },
                    characterMeta: { version: 1, characters: rows.flatMap((c, captionIndex) => c.kind === 'reference' ? [] : [{
                        ...structuredClone(characters.find((m) => m.characterKey === c.characterKey)), captionIndex,
                        outfit: structuredClone(outfitFor(c)),
                        centers: [{ x: 0.5, y: 0.5 }], positionExplicit: true }]) } };
            }).reverse();
            return { ok: true, captions };
        },
        async edit(request) {
            calls.push(request);
            const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
            const { promptSnapshotFromBody } = await import('../src/generated-images/final-caption.js');
            const prepared = prepareCharacterCaption(request);
            assert.equal(prepared.ok, true, prepared.error);
            const src = await codec.encodePixels(image(request.width, request.height, [220, calls.length * 50, 20, 255]));
            return { ...prepared, dataUrl: src, sentPrompt: promptSnapshotFromBody({ model: 'nai-diffusion-5-full',
                action: 'infill', parameters: prepared.caption }, null) };
        },
    };
    const igsSettings = {};
    const service = createAutoIllustrationService({ store, nai: backend, imageCodec: codec,
        getSettings: () => igsSettings, getSceneAssets: () => assets,
        report: (level, message) => { reports.push({ level, message }); jobLog.add(level, message); },
        resolveCgReference: async (name, snapshot) => { references.push(name); return snapshot.characters[name]?.默认 || ''; },
        messageHost: { readFloor: () => floor, getChatId: () => floor.chatId, destroy() {} },
        events: { emit: (name, detail) => events.push({ name, detail }) },
    });
    return { store, floor, key, pixels, codec, names, assets, before, calls, writes, references, events, backend, service, reports, jobLog, logStorage, igsSettings,
        query: { chatId: floor.chatId, messageId: 5, swipeId: 0, slot: 7 } };
}

test('gate:cg-consistency:failure-and-cancel-discard-all-partial-results', async () => {
    for (const mode of ['failure', 'cancel']) {
        const f = await consistencyFixture();
        const edit = f.backend.edit;
        f.backend.edit = async (request) => {
            if (f.calls.length === 1) {
                if (mode === 'cancel') f.service.cancelConsistency();
                return { ok: false, reason: 'edit-failed' };
            }
            return edit(request);
        };
        const result = await f.service.redrawConsistency(f.query);
        assert.equal(result.ok, false);
        assert.equal(result.reason, mode === 'cancel' ? 'cancelled' : 'edit-failed');
        assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
        assert.equal(f.events.some((e) => e.name === 'igs:illustration-updated'), false);
        assert.equal((await f.service.acceptConsistency(result.candidateId)).reason, 'candidate-unavailable');
    }
});

test('gate:cg-consistency:late-concurrent-results-cannot-save-or-restart', async () => {
    const f = await consistencyFixture();
    const finishes = []; let started;
    const ready = new Promise((resolve) => { started = resolve; });
    f.backend.edit = (request) => { f.calls.push(request); if (f.calls.length === 2) started(); return new Promise((resolve) => { finishes.push(resolve); }); };
    const controller = new AbortController();
    const pending = f.service.redrawConsistency(f.query, { signal: controller.signal });
    await ready;
    controller.abort();
    assert.equal((await pending).reason, 'cancelled');
    assert.ok(f.calls.every((request) => request.shouldStart() === false));
    finishes.forEach((finish) => finish({ ok: true, dataUrl: 'original' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(f.calls.length, 2);
    assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
});


function codecFixture(mode = 'ok') {
    const images = [], timers = new Map();
    let serial = 0, canvases = 0, written;
    const context = {
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4).fill(127) }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (pixels) => { written = pixels.data; },
    };
    const globalObject = {
        Image: class {
            constructor() { images.push(this); this.naturalWidth = mode === 'large' ? 2048 : 64; this.naturalHeight = mode === 'large' ? 1024 : 64; }
            set src(value) { this.value = value; if (!value || mode === 'stall') return;
                queueMicrotask(() => mode === 'error' ? this.onerror?.() : this.onload?.()); }
        },
        setTimeout(fn) { timers.set(++serial, fn); return serial; },
        clearTimeout(id) { timers.delete(id); },
        document: { createElement() { canvases++; return { getContext: () => mode === 'context' ? null : context,
            toDataURL: () => 'data:image/png;base64,ENCODED' }; } },
    };
    return { globalObject, images, timers, get canvases() { return canvases; }, get written() { return written; } };
}

test('gate:cg-codec:decode-encode-budget-errors-and-cancel-release-handlers', async () => {
    const { createCanvasImageCodec } = await import('../src/media/canvas-image-codec.js');
    const f = codecFixture(), codec = createCanvasImageCodec(f.globalObject);
    const pixels = await codec.decodeImage('fixture');
    assert.deepEqual([pixels.width, pixels.height], [64, 64]);
    assert.equal(f.timers.size, 0);
    assert.equal(f.images[0].onload, null);
    assert.equal(await codec.encodePixels(pixels), 'data:image/png;base64,ENCODED');
    assert.deepEqual(f.written, pixels.data);
    for (const [mode, reason] of [['error', 'image-load-failed'], ['context', 'no-canvas-context'], ['large', 'image-size-invalid']]) {
        const fixture = codecFixture(mode);
        await assert.rejects(createCanvasImageCodec(fixture.globalObject).decodeImage('fixture'), new RegExp(reason));
        if (mode === 'large') assert.equal(fixture.canvases, 0);
        assert.equal(fixture.timers.size, 0);
    }
    for (const timeout of [false, true]) {
        const fixture = codecFixture('stall'), controller = new AbortController();
        const pending = createCanvasImageCodec(fixture.globalObject).decodeImage('fixture', { signal: controller.signal });
        if (timeout) [...fixture.timers.values()][0](); else controller.abort();
        await assert.rejects(pending, new RegExp(timeout ? 'image-load-timeout' : 'image-load-cancelled'));
        assert.equal(fixture.timers.size, 0);
        assert.equal(fixture.images[0].value, '');
        assert.equal(fixture.images[0].onerror, null);
    }
});

// 普通 CG 集成夹具：实际 planner parser、发送 Adapter 与存储事务；外部服务全部隔离。
function consistencyFlatReply(request) {
    const output = JSON.parse(request.description.split('\n').at(-1));
    assert.equal(request.promptTask.slots.length, 1);
    assert.equal(output.slotId, request.promptTask.slots[0].slotId);
    assert.deepEqual(output.rows.map((r) => r.captionIndex), output.rows.map((_, i) => i));
    assert.deepEqual(output.rows.map((r) => r.token), request.promptTask.slots[0].tokens);
    assert.deepEqual(request.characterContext.map((c) => c.characterKey).sort(),
        [...new Set(output.rows.map((r) => r.characterKey))].sort());

    const lines = [`slotid: ${output.slotId}`, 'prompt_mode: dna_template',
        ...(output.identityMode !== undefined ? [`identity_mode: ${output.identityMode}`] : []),
        `size: ${output.size.width}x${output.size.height}`, 'scene: The inset shows the same character. People retain their original pose in a room.', 'scene_uc: blurry'];
    for (const row of output.rows) {
        const i = row.captionIndex, center = row.centers[0];
        if (row.kind === 'reference') assert.deepEqual(row.outfit, { name: '', description: '' });
        lines.push(`char: ${center.x},${center.y} | <<dna:${row.token}>> ${row.kind === 'reference'
            ? 'is visible from the shoulders up.' : `wears ${row.outfit.description}.`}`,
        `char_uc: <<dna_uc:${row.token}>>`, `meta_kind: ${i} | ${row.kind}`,
        `meta_key: ${i} | ${row.characterKey}`, `meta_token: ${i} | ${row.token}`,
        `meta_frame: ${i} | ${row.framing}`, `meta_outfit_name: ${i} | ${row.outfit.name}`,
        `meta_outfit_description: ${i} | ${row.outfit.description}`,
        ...(output.identityMode !== undefined ? [`meta_correction_identity: ${i} | new-${row.characterKey}`,
            `meta_correction_uc: ${i} | correction-uc-${row.characterKey}`] : []));
    }
    return { output, text: lines.join('\n') };
}

async function consistencyBuiltinFixture(count = 2, model = 'nai-diffusion-5-full-inpainting', options = {}) {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { createCgConsistencyService } = await import('../src/generated-images/illustration/cg-consistency-service.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { createMemoryStorage, createPresetRegistry } = await import('../src/index.js');
    const { createBuiltinImageTaskRuntime } = await import('../src/generated-images/builtin-image-task-runtime.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createNaiRequestQueue } = await import('../src/generated-images/nai-request-queue.js');
    const { pngFixture } = await import('./helpers/png-fixture.js');
    const indexedDB = createTransactionalIdb();
    const rawStore = createIndexedDbIllustrationStore({ indexedDB });
    const f = await consistencyFixture(count, rawStore);
    f.assets.characterOutfits = {};
    f.assets.characterDefaultOutfits = {};
    f.assets.characterSeeds = Object.fromEntries(f.names.map((name, i) => [name, i === 0 ? 0 : 42 + i]));
    f.assets.wardrobe = {};
    for (const name of f.names) {
        f.assets.characterOutfits[name] = { 冬装: { wardrobe: name, moods: { 平和: `reference-${name}` } } };
        f.assets.characterDefaultOutfits[name] = { version: 1, outfitName: '冬装' };
        f.assets.wardrobe[name] = { prompt: `coat-${name}` };
    }
    const appearanceListeners = new Set(), referenceRevisions = new Map();
    const appearanceScope = { key: 'fixture-scope', owner: 'fixture-owner' };
    const readReferenceImage = async url => f.pixels.has(url)
        ? { type: 'sprite', dataUrl: url, revision: referenceRevisions.get(url) || 1 } : null;
    const store = options.wrapStore?.(rawStore) || rawStore;
    const bridge = { imageApi: { mode: 'nai' }, autoIllustration: { consistencyModel: model,
        nai: { apiKey: 'fixture-builtin-key', model: 'nai-diffusion-4-full', artistPrefix: 'artist:fixture' } } };
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const runtime = createBuiltinImageTaskRuntime({ readBridge: () => bridge, registry });
    const writes = [], wires = [], edits = [], gates = [];
    let active = 0, maxActive = 0, live = true;
    function encode(value) {
        const stride = value.width * 4 + 1, scanlines = Buffer.alloc(stride * value.height);
        for (let row = 0; row < value.height; row++)
            scanlines.set(value.data.subarray(row * value.width * 4, (row + 1) * value.width * 4), row * stride + 1);
        const png = pngFixture(value.width, value.height, { scanlines });
        f.pixels.set(png.dataUrl, { ...value, data: new Uint8ClampedArray(value.data) });
        return png;
    }
    const codec = { ...f.codec, async encodePixels(value) { return encode(value).dataUrl; } };
    const pause = async () => {
        if (!options.waitPaint) return;
        await new Promise(resolve => gates.push(resolve));
    };

    const llm = createImagePromptLlm({ async request(request, settings) {
        writes.push({ request, settings });

        const input = JSON.parse(request.messages.find(message => message.content.startsWith('{')).content);
        const rows = input.outputs.rows;
        const slot = input.promptTask.slots[0];
        assert.equal(input.outputs.slotIds.length, 1);
        assert.deepEqual(input.outputs.slotIds, [slot.slotId]);
        const reply = [`slotid: ${slot.slotId}`, 'prompt_mode: dna_template',
            ...(input.promptTask.outfitMode === 'template' ? ['outfit_mode: template'] : []),
            ...(slot.identityMode !== undefined ? [`identity_mode: ${slot.identityMode}`] : []),
            'scene: People interacting in a room. The inset is an appearance reference only. High quality illustration.',
            'scene_uc: blurry, decorative frame, duplicate person',
            ...rows.flatMap((row, index) => [
                `char: ${row.centers[0].x},${row.centers[0].y} | <<dna:${row.token}>> ${row.kind === 'reference'
                    ? 'is visible from the shoulders up.' : input.promptTask.outfitMode === 'template'
                        ? `<<outfit:${row.token}>>.` : `wears ${row.outfit.description}.`}`,
                `char_uc: <<dna_uc:${row.token}>>`,
                `meta_kind: ${index} | ${row.kind}`, `meta_key: ${index} | ${row.characterKey}`,
                `meta_token: ${index} | ${row.token}`, `meta_frame: ${index} | ${row.framing}`,
                `meta_outfit_name: ${index} | ${row.outfit.name}`,
                `meta_outfit_description: ${index} | ${row.outfit.description}`,
                ...(slot.identityMode !== undefined ? [`meta_correction_identity: ${index} | new-${row.characterKey}`,
                    `meta_correction_uc: ${index} | wrong-${row.characterKey}`] : []),
            ])].join('\n');
        if (options.waitWrite) await new Promise(resolve => gates.push(resolve));
        return options.transformReply ? options.transformReply(reply, input) : reply;
    } }, registry, runtime);
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), random: () => 0.5,
        fetch: async (_url, init) => {
            assert.equal(init.method, 'POST');
            const body = JSON.parse(init.body);
            wires.push(body); active++; maxActive = Math.max(maxActive, active);
            try {
                await pause();
                const { width, height } = body.parameters;
                const data = new Uint8ClampedArray(width * height * 4);
                for (let i = 0; i < data.length; i += 4) data.set([220, wires.length * 40, 20, 255], i);
                return new Response(encode({ width, height, data }).bytes, { headers: { 'Content-Type': 'image/png' } });
            } finally { active--; }
        } });

    const backend = createImageBackend({ nai: client, global: {}, llm,
        getBridge: () => bridge, taskRuntime: runtime });
    const forbidden = ['numberedText', 'previousText', 'lore', 'characters', 'scenes',
        'messageId', 'skipRecall', 'history', 'characterLibrary', 'tagLibrary'];
    const service = createCgConsistencyService({ store, codec, nai: { ...backend,
        writePrompt(request) {
            for (const key of forbidden) Object.defineProperty(request, key, { enumerable: true,
                get() { assert.fail(`provided 不得读取 ${key}`); } });
            return backend.writePrompt(request);
        },
        edit(request) { edits.push(request); return backend.edit(request); },
    }, getSceneAssets: () => f.assets,
        consistencyModel: () => bridge.autoIllustration.consistencyModel,
        resolveReference: (key, assets) => assets.characters[key].默认,
        readReferenceImage: options.readReferenceImage || readReferenceImage,
        captureAppearanceScope: () => structuredClone(appearanceScope),
        subscribeAppearance(handler) { appearanceListeners.add(handler); return () => appearanceListeners.delete(handler); },
        ...(options.report && { report: options.report }),
        targetStillLive: () => live,
        writingRequirements: () => ({ transparent: false, quality: 'High quality illustration.',
            undesiredContent: 'blurry' }),
        ...(options.onAccepted && { onAccepted: options.onAccepted }) });
    return { ...f, store, rawStore, service, codec, indexedDB, bridge, registry, runtime,
        writes, wires, edits, gates, forbidden, backend, llm,
        appearanceScope, referenceRevisions,
        appearanceChanged(detail = {}) { for (const handler of appearanceListeners) handler(detail); },
        get appearanceSubscriptions() { return appearanceListeners.size; },
        originalAssets: structuredClone(f.assets),
        target: { key: f.key, floor: f.floor, slot: 7 },
        get maxActive() { return maxActive; }, get active() { return active; },
        setLive(value) { live = value; },
        release() { gates.splice(0).forEach(resolve => resolve()); },
        dispose() { gates.splice(0).forEach(resolve => resolve()); runtime.dispose(); } };
}

async function waitBuiltinGate(f, count = 1) {
    const deadline = Date.now() + 3000;
    while (f.gates.length < count && Date.now() < deadline)
        await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.gates.length >= count, '隔离端口未到达预期等待点');
}

test('自动恢复：接受 CG 时存储中断和修订推进，续存同一候选并保留其它字段', async () => {
    const f = await consistencyFixture();
    const candidate = await f.service.redrawConsistency(f.query);
    assert.equal(candidate.ok, true, JSON.stringify(candidate));
    const paintCount = f.calls.length;
    const update = f.store.updateSlot.bind(f.store);
    let attempts = 0;
    f.store.updateSlot = async (...args) => {
        attempts++;
        if (attempts === 1) throw new Error('temporary-storage');
        if (attempts === 2) {
            const current = await f.store.getSlotRecord(f.before.key);
            await f.store.putSlot(f.key, { ...current, userNote: 'saved-during-accept' });
            return { ok: false, reason: 'stale-revision' };
        }
        return update(...args);
    };
    const result = await f.service.acceptConsistency(candidate.candidateId);
    assert.equal(result.ok, true, JSON.stringify(result));
    const saved = await f.store.getSlotRecord(f.before.key);
    assert.equal(saved.dataUrl, candidate.dataUrl);
    assert.equal(saved.userNote, 'saved-during-accept');
    assert.equal(f.calls.length, paintCount);
    assert.equal(attempts, 3);
});
