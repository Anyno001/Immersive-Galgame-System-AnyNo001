
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractSceneDirectives,
    stripIllustrationMarkers,
    resolveIllustrationAtSourceOffset,
} from '../src/scene/scene-directives.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';

test('gate:illustration:marker-does-not-shift-scene-directives', () => {
    const plain = '[igs-scene:卧室|夜晚|晴]\n[igs-char:小雪|开心|你好]\n一\n二';
    const withMarker = plain.replace('一\n', '一\n[igs-img:1]\n');
    const before = extractSceneDirectives(plain);
    const after = extractSceneDirectives(withMarker);
    assert.deepEqual(after.directives, before.directives);
    assert.equal(after.illustrationMarkers.length, 1);
    assert.equal(after.illustrationMarkers[0].slot, 1);
});

test('gate:illustration:database-img-marker-is-compatible-with-igs-marker', () => {
    const source = '[igs-scene:卧室|夜晚|晴]\n第一段。<IMG>1</IMG>\n第二段。';
    const extracted = extractSceneDirectives(source);
    assert.deepEqual(extracted.illustrationMarkers.map((marker) => marker.slot), [1]);
    assert.equal(stripIllustrationMarkers(source).includes('<IMG>'), false);
    assert.deepEqual(resolveIllustrationAtSourceOffset(source, source.indexOf('第二段')), { slot: 1, offset: source.indexOf('<IMG>') });
});

test('gate:illustration:broken-marker-does-not-hang', () => {
    assert.deepEqual(extractSceneDirectives('正文[igs-img:\n下一行[igs-img:x]').illustrationMarkers, []);
});

test('gate:illustration:strip-removes-own-line-and-inline', () => {
    assert.equal(stripIllustrationMarkers('a\n[igs-img:1]\nb[igs-img:2]c'), 'a\nbc');
});

test('gate:illustration:resolve-stops-at-next-scene', () => {
    const src = '[igs-scene:A|夜|晴]\n一\n[igs-img:1]\n二\n[igs-scene:B|夜|晴]\n三';
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('二')).slot, 1);
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('三')), null);
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('一')), null);
});

test('gate:illustration:payload-keeps-raw-marker-but-hides-from-segments', () => {
    const payload = buildIgsTextPayload({ text: '<content>[igs-scene:A|夜|晴]\n一\n[igs-img:1]\n二</content>' });
    assert.ok(payload.raw.includes('[igs-img:1]'));
    assert.equal(payload.textSegments.some((segment) => segment.includes('igs-img')), false);
});

test('gate:illustration:nai-v4-request-shape', async () => {
    const { buildNaiV4Request, NAI_DEFAULT_NEGATIVE } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    const p = buildNaiV4Request({ scene: 'indoors, night', sceneUc: 'text', chars: [{ x: 0.33, y: 0.5, tags: '1girl, long hair', uc: 'bad hands' }] }, {}, () => 0).parameters;
    assert.equal(p.v4_prompt.use_coords, true);
    assert.equal(p.v4_prompt.use_order, true);
    assert.equal(p.v4_negative_prompt.legacy_uc, false);
    assert.deepEqual(p.v4_prompt.caption.char_captions[0].centers[0], { x: 0.3, y: 0.5 });
    assert.ok(p.negative_prompt.startsWith(NAI_DEFAULT_NEGATIVE));
    assert.ok(p.negative_prompt.includes('text'));
    assert.equal(p.seed, 0);
    assert.equal(p.width, 832);
});

test('gate:illustration:nai-v4-no-chars-disables-coords', async () => {
    const { buildNaiV4Request } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    const p = buildNaiV4Request({ scene: 'room', chars: [] }).parameters;
    assert.equal(p.use_coords, false);
    assert.equal(p.v4_prompt.use_coords, false);
    assert.deepEqual(p.v4_prompt.caption.char_captions, []);
});

test('gate:illustration:nai-artist-prefix-first', async () => {
    const { buildNaiV4Request } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    assert.ok(buildNaiV4Request({ scene: 'room' }, { artistPrefix: 'artist:foo' }).input.startsWith('artist:foo, '));
});

test('gate:illustration:nai-client-missing-key-no-request', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    let calls = 0;
    const result = await createNaiOfficialClient({ fetch: async () => { calls++; } }).generate({ scene: 'room' });
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
});

test('gate:illustration:nai-client-proxy-url-and-auth', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    let request;
    const client = createNaiOfficialClient({ fetch: async (...args) => {
        request = args;
        return new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200, headers: { 'Content-Type': 'image/png' } });
    } });
    const result = await client.generate({ scene: 'room' }, { apiKey: 'k', transport: 'st-proxy' });
    assert.equal(request[0], '/proxy/https://image.novelai.net/ai/generate-image');
    assert.equal(request[1].headers.Authorization, 'Bearer k');
    assert.equal(result.ok, true);
    assert.ok(result.dataUrl.startsWith('data:image/'));
});

test('gate:illustration:nai-client-retries-429-once', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    let calls = 0;
    const client = createNaiOfficialClient({ fetch: async () => {
        calls++;
        return calls === 1 ? new Response('', { status: 429 }) : new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200, headers: { 'Content-Type': 'image/png' } });
    }, sleep: async () => {} });
    assert.equal((await client.generate({ scene: 'room' }, { apiKey: 'k' })).ok, true);
    assert.equal(calls, 2);
});

test('gate:illustration:nai-client-error-hides-key', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const result = await createNaiOfficialClient({ fetch: async () => new Response('', { status: 401 }) }).generate({ scene: 'room' }, { apiKey: 'private-key' });
    assert.equal(result.ok, false);
    assert.ok(!result.error.includes('private-key'));
});

test('gate:illustration:number-paragraphs-reads-directives', async () => {
    const { numberParagraphs } = await import('../src/generated-images/illustration/marker-placer.js');
    const result = numberParagraphs('思维链\n<content>\n[igs-scene:卧室|夜晚|晴|NSFW]\n月光洒进来。\n[igs-char:小雪|害羞|别看我……]\n</content>\n状态栏');
    assert.equal(result.paragraphs.length, 2);
    assert.equal(result.paragraphs[1].text, '小雪：「别看我……」');
    assert.equal(result.isNsfw, true);
    assert.ok(result.characters.includes('小雪'));
});

test('gate:illustration:insert-marker-before-paragraph', async () => {
    const { numberParagraphs, insertMarkers } = await import('../src/generated-images/illustration/marker-placer.js');
    const raw = '[igs-scene:A|夜|晴]\n一\n二\n三';
    const result = insertMarkers(raw, numberParagraphs(raw).paragraphs, [{ slot: 1, at: 2 }, { slot: 2, at: 3 }]);
    assert.ok(result.includes('一\n[igs-img:1]\n二\n[igs-img:2]\n三'));
});

test('gate:illustration:insert-marker-after-leading-scene-tag', async () => {
    const { numberParagraphs, insertMarkers } = await import('../src/generated-images/illustration/marker-placer.js');
    const raw = '[igs-scene:A|夜|晴]正文';
    const result = insertMarkers(raw, numberParagraphs(raw).paragraphs, [{ slot: 1, at: 1 }]);
    assert.equal(result, '[igs-scene:A|夜|晴][igs-img:1]正文');
    assert.equal(resolveIllustrationAtSourceOffset(result, result.indexOf('正文')).slot, 1);
});

test('gate:illustration:parse-multi-slot', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    const result = parseIllustrationPlan('slot: 1\nat: 1\nscene: indoors\nchar: 0.33,0.5 | 1girl\nchar_uc: bad hands\nslot: 2\nat: 3\nscene: outdoors', { maxSlots: 2, paragraphCount: 3 });
    assert.equal(result.slots.length, 2);
    assert.equal(result.slots[0].chars[0].x, 0.3);
    assert.equal(result.slots[0].chars[0].uc, 'bad hands');
});

test('gate:illustration:parse-tolerates-garbage', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    const result = parseIllustrationPlan('```\nslot：1\nat：99\nscene：room\nslot：2\nat：1\nscene：street\nslot：3\nat：1\nscene：garden\n```', { maxSlots: 3, paragraphCount: 2 });
    assert.ok(result.slots.length <= 3);
    assert.ok(result.slots.every(({ at }) => at >= 1 && at <= 2));
    assert.equal(new Set(result.slots.map(({ at }) => at)).size, result.slots.length);
});

test('gate:illustration:parse-empty-fails', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    assert.equal(parseIllustrationPlan('抱歉我不能').ok, false);
});

test('gate:illustration:planner-prompt-count-wording', async () => {
    const { buildPlannerUserPrompt } = await import('../src/generated-images/illustration/planner-prompt.js');
    assert.ok(buildPlannerUserPrompt({ want: 2, exact: true }).includes('恰好 2 张'));
    assert.ok(buildPlannerUserPrompt({ want: 3, exact: false }).includes('1 到 3 张'));
});

test('gate:illustration:memory-store-roundtrip', async () => {
    const { floorKeyOf, slotKeyOf, createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const store = createMemoryIllustrationStore();
    const floor = { chatId: 'chat', messageId: 2, swipeId: 1 };
    const key = floorKeyOf(floor);
    assert.equal(key, 'chat|2|1');
    assert.equal(slotKeyOf(floor, 2), `${key}|2`);
    await store.putFloor(key, { kind: 'nsfw', status: 'planning' });
    await store.putSlot(key, { slot: 2, scene: 'room', status: 'done' });
    await store.putSlot(key, { slot: 1, scene: 'hall', status: 'pending' });
    const retrieved = await store.getFloor(key);
    retrieved.status = 'failed';
    assert.equal((await store.getFloor(key)).status, 'planning');
    const slots = await store.getSlots(key);
    assert.deepEqual(slots.map((s) => s.slot), [1, 2]);
    slots[0].scene = 'mutated';
    assert.equal((await store.getSlots(key))[0].scene, 'hall');
});

test('gate:illustration:secondary-llm-openai-url-and-body', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    let url;
    let body;
    const llm = createSecondaryLlm({}, { fetch: async (target, init) => {
        url = target;
        body = JSON.parse(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    } });
    assert.equal(await llm.request({ system: 'sys', user: 'usr' }, { source: 'openai', endpoint: 'https://x.com/v1', model: 'm' }), 'ok');
    assert.equal(url, 'https://x.com/v1/chat/completions');
    assert.equal(body.messages[0].role, 'system');
});

test('gate:illustration:secondary-llm-fetch-models', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const calls = [];
    const llm = createSecondaryLlm({}, { fetch: async (url, init) => {
        calls.push({ url, method: init.method, auth: init.headers.Authorization });
        return new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-a' }] }), { status: 200 });
    } });
    const result = await llm.fetchModels({ endpoint: 'https://example.com/v1', apiKey: 'fake-key' });
    assert.deepEqual(result.models, ['model-a', 'model-b']);
    assert.deepEqual(calls, [{ url: 'https://example.com/v1/models', method: 'GET', auth: 'Bearer fake-key' }]);
    const empty = createSecondaryLlm({}, { fetch: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) });
    await assert.rejects(empty.fetchModels({ endpoint: 'https://example.com/v1' }), /未返回可用模型/);
    let count = 0;
    const missing = createSecondaryLlm({}, { fetch: async () => { count += 1; throw new Error('unexpected'); } });
    await assert.rejects(missing.fetchModels({}), /填写副 LLM 地址/);
    assert.equal(count, 0);
});

test('gate:illustration:secondary-llm-prefers-tavernhelper', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    let captured;
    const llm = createSecondaryLlm({ TavernHelper: { generateRaw: async (value) => { captured = value; return 'r'; } } });
    assert.equal(await llm.request({ system: 'sys', user: 'usr' }, { source: 'tavern' }), 'r');
    assert.equal(captured.ordered_prompts.length, 2);
});

test('gate:illustration:secondary-llm-timeout', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const llm = createSecondaryLlm({ TavernHelper: { generateRaw: () => new Promise(() => {}) } });
    await assert.rejects(llm.request({ system: 'sys', user: 'usr' }, { timeoutMs: 20 }), /超时/);
});

test('gate:illustration:message-host-write-fallback', async () => {
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    let called = false;
    let saved = false;
    const ctx = { chat: [{ mes: 'a', swipe_id: 0, swipes: ['a'] }], updateMessageBlock() { called = true; }, async saveChat() { saved = true; } };
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx } });
    assert.equal((await host.writeFloor(0, 'b')).ok, true);
    assert.equal(ctx.chat[0].mes, 'b');
    assert.equal(ctx.chat[0].swipes[0], 'b');
    assert.ok(called && saved);
});

test('gate:illustration:message-host-rejects-stale-floor-before-helper-write', async () => {
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    const ctx = {
        chatId: 'chat-1',
        chat: [{ mes: 'original', is_user: false, swipe_id: 0 }],
    };
    let writes = 0;
    const host = createIllustrationMessageHost({
        SillyTavern: { getContext: () => ctx },
        TavernHelper: { setChatMessages: async () => { writes++; } },
    });
    const expected = host.readFloor(0);
    ctx.chat.push({ mes: 'next', is_user: false });
    assert.equal((await host.writeFloor(0, 'updated', expected)).reason, 'stale');
    ctx.chat.pop();
    ctx.chat[0].swipe_id = 1;
    assert.equal((await host.writeFloor(0, 'updated', expected)).reason, 'stale');
    ctx.chat[0].swipe_id = 0;
    ctx.chatId = 'chat-2';
    assert.equal((await host.writeFloor(0, 'updated', expected)).reason, 'stale');
    assert.equal(writes, 0);
    assert.equal(ctx.chat[0].mes, 'original');
});

const NSFW_TEXT = '[igs-scene:卧室|夜晚|晴|NSFW]\n一段。\n二段。\n三段。';
const SFW_TEXT = '[igs-scene:街道|白天|晴]\n一段。\n二段。';
const REPLY = 'slot: 1\nat: 2\nscene: 1girl, bedroom\nchar: 0.5,0.5 | 1girl, black hair';

test('gate:illustration:prompt-ready-strips-markers', async () => {
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    const handlers = new Map();

    const ctx = { eventTypes: { CHAT_COMPLETION_PROMPT_READY: 'ready' }, eventSource: { on: (key, fn) => handlers.set(key, fn), off: (key) => handlers.delete(key) } };
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx } });
    host.attachPromptStrip();
    const payload = { chat: [{ role: 'assistant', content: 'a\n[igs-img:1]\nb' }] };
    handlers.get('ready')(payload);
    assert.equal(payload.chat[0].content, 'a\nb');
    const databasePayload = { chat: [{ role: 'assistant', content: 'a\n<IMG>1</IMG>\nb' }] };
    handlers.get('ready')(databasePayload);
    assert.equal(databasePayload.chat[0].content, 'a\nb');
    host.destroy();
});

test('gate:illustration:regex-install-idempotent', async () => {
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    let scripts = [{ id: 'user', destination: { display: true, prompt: true } }];
    const helper = {
        getTavernRegexes: () => scripts,
        replaceTavernRegexes: async (next) => { scripts = next; },
    };
    const regexHost = createIllustrationMessageHost({ TavernHelper: helper });
    assert.equal((await regexHost.ensureMarkerRegexes()).ok, true);
    assert.equal((await regexHost.ensureMarkerRegexes()).ok, true);
    assert.equal(scripts.length, 3);
    assert.ok(scripts.some(({ id }) => id === 'user'));
    assert.equal(scripts.some(({ destination }) => !destination.display && !destination.prompt), false);
    assert.ok(scripts.find(({ id }) => id === 'igs-illustration-marker-display').find_regex.includes('<IMG>'));
});

function makeFakes({ text, isLatest = true, llmReply = REPLY, naiResult, settings = {} }) {
    const calls = { llm: 0, nai: 0, writes: [], events: [] };
    let current = text;
    const messageHost = {
        getChatId: () => 'c1',
        readFloor: () => ({ chatId: 'c1', messageId: 5, swipeId: 0, isAi: true, isLatest, text: current }),
        readPreviousAiTexts: () => [],
        writeFloor: async (id, next) => { calls.writes.push(next); current = next; return { ok: true }; },
        on: () => () => {}, attachPromptStrip: () => {},
        ensureMarkerRegexes: async () => ({ ok: true }), destroy: () => {},
        setText: (textValue) => { current = textValue; },
    };
    const llm = { request: async () => {
        calls.llm++;
        if (llmReply instanceof Error) throw llmReply;
        return llmReply;
    } };
    const nai = { generate: async () => { calls.nai++; return naiResult || { ok: true, dataUrl: 'data:image/png;base64,AAAA' }; } };
    const events = { emit: (type, payload) => calls.events.push({ type, payload }) };
    return { calls, messageHost, llm, nai, events, getSettings: () => settings };
}

test('gate:illustration:service-disabled-makes-no-calls', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const store = createMemoryIllustrationStore();
    const fake = makeFakes({ text: NSFW_TEXT });
    const result = await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(result.reason, 'disabled');
    assert.equal(fake.calls.llm + fake.calls.nai + fake.calls.writes.length, 0);
    assert.equal(await store.getFloor('c1|5|0'), null);
});

test('gate:illustration:service-skips-non-latest-floor', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, isLatest: false, settings: { nsfwEnabled: true } });
    assert.equal((await createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() }).processMessage(5)).reason, 'not-eligible');
    assert.equal(fake.calls.llm + fake.calls.nai, 0);
});

test('gate:illustration:service-nsfw-generates-and-writes-marker', async () => {
    const { createAutoIllustrationService, ILLUSTRATION_UPDATED_EVENT } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const store = createMemoryIllustrationStore();
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true, nsfwCount: 1 } });
    const service = createAutoIllustrationService({ ...fake, store });
    assert.equal((await service.processMessage(5)).reason, 'done');
    assert.ok(fake.calls.writes[0].includes('\n[igs-img:1]\n二段。'));
    assert.equal(fake.calls.nai, 1);
    assert.equal((await store.getSlots('c1|5|0'))[0].status, 'done');
    assert.ok(fake.calls.events.some(({ type }) => type === ILLUSTRATION_UPDATED_EVENT));
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'data:image/png;base64,AAAA');
});

test('gate:illustration:service-nsfw-off-never-rolls-interlude', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { interludeEnabled: true, interludeProbability: 100 } });
    await createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore(), random: () => 0 }).processMessage(5);
    assert.equal(fake.calls.llm + fake.calls.nai, 0);
});

test('gate:illustration:service-interlude-probability-gate', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    for (const [probability, selected] of [[30, false], [60, true]]) {
        const store = createMemoryIllustrationStore();
        const fake = makeFakes({ text: SFW_TEXT, settings: { interludeEnabled: true, interludeProbability: probability } });
        await createAutoIllustrationService({ ...fake, store, random: () => 0.5 }).processMessage(5);
        assert.equal(fake.calls.llm, selected ? 1 : 0);
        if (!selected) assert.equal((await store.getFloor('c1|5|0')).kind, 'none');
    }
});

test('gate:illustration:service-decided-floor-not-replanned', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store });
    await service.processMessage(5);
    await service.processMessage(5);
    await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(fake.calls.llm, 1);
});

test('gate:illustration:service-concurrent-calls-share-lock', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() });
    await Promise.all([service.processMessage(5), service.processMessage(5)]);
    assert.equal(fake.calls.llm, 1);
});

test('gate:illustration:service-llm-failure-no-write', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true }, llmReply: new Error('x') });
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store });
    assert.equal((await service.processMessage(5)).reason, 'plan-failed');
    assert.equal(fake.calls.writes.length, 0);
    assert.equal((await store.getFloor('c1|5|0')).status, 'failed');
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), '');
});

test('gate:illustration:service-stale-text-aborts', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    fake.llm.request = async () => { fake.messageHost.setText('被用户改了'); return REPLY; };
    const store = createMemoryIllustrationStore();
    assert.equal((await createAutoIllustrationService({ ...fake, store }).processMessage(5)).reason, 'stale');
    assert.equal(fake.calls.writes.length, 0);
    assert.equal((await store.getFloor('c1|5|0')).status, 'stale');
});

test('gate:illustration:service-stale-when-new-floor-arrives-during-planning', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const originalReadFloor = fake.messageHost.readFloor;
    let latest = true;
    fake.messageHost.readFloor = (...args) => ({ ...originalReadFloor(...args), isLatest: latest });
    fake.llm.request = async () => { latest = false; return REPLY; };
    const store = createMemoryIllustrationStore();
    const result = await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(result.reason, 'stale');
    assert.equal(fake.calls.writes.length, 0);
    assert.equal(fake.calls.nai, 0);
    assert.equal((await store.getFloor('c1|5|0')).status, 'stale');
});

test('gate:illustration:service-stale-during-regex-setup-skips-write-and-nai', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const ctx = { chatId: 'c1', chat: Array.from({ length: 5 }, () => ({ is_user: true, mes: 'user' })) };
    ctx.chat.push({ mes: NSFW_TEXT, is_user: false, swipe_id: 0 });
    let writes = 0;
    let naiCalls = 0;
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx }, TavernHelper: {
        setChatMessages: async () => { writes++; },
    } });
    host.ensureMarkerRegexes = async () => {
        ctx.chat.push({ mes: 'new message', is_user: true });
        return { ok: true };
    };
    const store = createMemoryIllustrationStore();
    const result = await createAutoIllustrationService({ messageHost: host, store,
        llm: { request: async () => REPLY }, nai: { generate: async () => { naiCalls++; } },
        getSettings: () => ({ nsfwEnabled: true }),
    }).processMessage(5);
    assert.equal(result.reason, 'stale');
    assert.equal((await store.getFloor('c1|5|0')).status, 'stale');
    assert.equal(writes + naiCalls, 0);
});

test('gate:illustration:service-nai-failure-marks-slot-failed', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true }, naiResult: { ok: false, error: 'x' } });
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store });
    await service.processMessage(5);
    assert.equal(fake.calls.writes.length, 1);
    assert.equal((await store.getSlots('c1|5|0'))[0].status, 'failed');
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), '');
});

test('gate:illustration:get-url-hydrates-from-store', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT });
    const store = createMemoryIllustrationStore();
    await store.putSlot('c1|5|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,AAAA' });
    const service = createAutoIllustrationService({ ...fake, store });
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), '');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'data:image/png;base64,AAAA');
    assert.equal(fake.calls.events.length, 1);
});

test('gate:illustration:settings-normalize-clamps', async () => {
    const { normalizeAutoIllustrationSettings } = await import('../src/generated-images/illustration/auto-illustration-settings.js');
    const settings = normalizeAutoIllustrationSettings({ nsfwEnabled: 'true', nsfwCount: 9, interludeProbability: -5, llm: { source: 'x' } });
    assert.equal(settings.nsfwEnabled, true);
    assert.equal(settings.nsfwCount, 4);
    assert.equal(settings.interludeProbability, 0);
    assert.equal(settings.llm.source, 'tavern');
    assert.equal(normalizeAutoIllustrationSettings({}).nsfwEnabled, false);
    assert.equal(normalizeAutoIllustrationSettings({}).interludeEnabled, false);
});

test('gate:illustration:settings-value-types', async () => {
    const { normalizeSettingsValue } = await import('../src/visual/igs-ui/settings-normalize.js');
    assert.equal(normalizeSettingsValue('bridge.autoIllustration.nsfwEnabled', 'true'), true);
    assert.equal(normalizeSettingsValue('bridge.autoIllustration.interludeEnabled', 'false'), false);
    assert.equal(normalizeSettingsValue('bridge.autoIllustration.interludeProbability', '45'), 45);
    assert.equal(normalizeSettingsValue('bridge.autoIllustration.nai.scale', '5.5'), 5.5);
    assert.equal(normalizeSettingsValue('bridge.autoIllustration.llm.source', 'openai'), 'openai');
});

test('gate:illustration:failed-floor-retries-and-reports-real-error', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const chat = [{ is_user: true, mes: 'hi' }, { mes: '[igs-scene:卧室|夜晚|晴|nsfw]\n她走进房间。', swipe_id: 0 }];
    const host = {
        readFloor: (id) => ({ chatId: 'c', messageId: id, swipeId: 0, isAi: true, isLatest: id === chat.length - 1, text: chat[id].mes }),
        readPreviousAiTexts: () => [], writeFloor: async (id, text) => { chat[id].mes = text; return { ok: true }; },
        ensureMarkerRegexes: async () => ({ ok: true }), getChatId: () => 'c',
    };
    let online = false;
    const fetch = async () => {
        if (!online) throw new TypeError('Failed to fetch');
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'slot: 1\nat: 1\nscene: 1girl, bedroom' } }] }) };
    };
    const reports = [];
    const naiCalls = [];
    const svc = createAutoIllustrationService({
        messageHost: host, llm: createSecondaryLlm({}, { fetch }), store: createMemoryIllustrationStore(),
        nai: { generate: async (slot) => { naiCalls.push(slot); return { ok: true, dataUrl: 'data:image/png;base64,x' }; } },
        getSettings: () => ({ nsfwEnabled: true, llm: { source: 'openai', endpoint: 'https://llm.example/v1', model: 'm', prompts: { illustration: 'CUSTOM' } } }),
        report: (level, message) => reports.push({ level, message }),
    });
    const first = await svc.processMessage(1);
    assert.equal(first.reason, 'plan-failed');
    assert.match(first.error, /CORS/);
    assert.ok(reports.some((r) => r.level === 'error' && /未发送生图请求/.test(r.message)));
    online = true;
    const second = await svc.processMessage(1);
    assert.equal(second.reason, 'done');
    assert.equal(naiCalls.length, 1);
    assert.equal((await svc.processMessage(1)).reason, 'already-decided');
});

test('gate:illustration:custom-llm-prompt-used-and-empty-falls-back', async () => {
    const { normalizeAutoIllustrationSettings, DEFAULT_LLM_PROMPTS } = await import('../src/generated-images/illustration/auto-illustration-settings.js');
    const s = normalizeAutoIllustrationSettings({ llm: { prompts: { illustration: ' mine ', asset: '   ' } } });
    assert.equal(s.llm.prompts.illustration, 'mine');
    assert.equal(s.llm.prompts.asset, DEFAULT_LLM_PROMPTS.asset);
    assert.equal(s.llm.prompts.illustrationSoft, DEFAULT_LLM_PROMPTS.illustrationSoft);
});

test('gate:illustration:image-job-log-retention-and-clear', async () => {
    const { createImageJobLog, IMAGE_JOB_LOG_STORAGE_KEY } = await import('../src/generated-images/image-job-log.js');
    const store = new Map();
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    let clock = Date.UTC(2026, 0, 10);
    let settings = { retainDays: 1, maxEntries: 50 };
    const log = createImageJobLog({ storage, now: () => clock, getSettings: () => settings });
    let changes = 0;
    log.onChange(() => { changes += 1; });
    log.add('error', 'old');
    clock += 2 * 24 * 60 * 60 * 1000;
    log.add('info', 'new');
    assert.deepEqual(log.list().map((e) => e.message), ['new']);
    for (let i = 0; i < 60; i += 1) log.add('info', `n${i}`);
    assert.equal(log.list().length, 50);
    assert.equal(log.list()[0].message, 'n59');
    const reloaded = createImageJobLog({ storage, now: () => clock, getSettings: () => settings });
    assert.equal(reloaded.list().length, 50);
    settings = { retainDays: 0, maxEntries: 50 };
    assert.equal(log.clear().removed, 50);
    assert.equal(JSON.parse(store.get(IMAGE_JOB_LOG_STORAGE_KEY)).length, 0);
    assert.ok(changes > 0);
});

test('gate:illustration:nai-provider-official-url-uses-builtin-models', async () => {
    const { naiProvider } = await import('../src/generated-images/providers/nai-provider.js');
    const { NAI_OFFICIAL_MODELS } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    let count = 0;
    const result = await naiProvider.fetchModels({}, {
        unifiedSettings: { bridge: { imageApi: { mode: 'nai', apiUrl: 'https://image.novelai.net/ai/generate-image' } } },
        fetch: async () => { count += 1; throw new Error('unexpected'); },
    });
    assert.equal(count, 0);
    assert.deepEqual(result.models, [...NAI_OFFICIAL_MODELS]);
});

test('gate:illustration:nai-client-uses-custom-endpoint-or-official', async () => {
    const { createNaiOfficialClient, NAI_OFFICIAL_ENDPOINT } = await import('../src/generated-images/nai-official-client.js');
    const urls = [];
    const client = createNaiOfficialClient({ fetch: async (url) => { urls.push(url); return new Response('', { status: 401 }); } });
    const slot = { scene: 'room' };
    await client.generate(slot, { apiKey: 'fake-key' });
    await client.generate(slot, { apiKey: 'fake-key', endpoint: ' https://nai.example.com/custom/generate ' });
    await client.generate(slot, { apiKey: 'fake-key', endpoint: 'https://nai.example.com/x', transport: 'st-proxy' });
    assert.deepEqual(urls, [NAI_OFFICIAL_ENDPOINT, 'https://nai.example.com/custom/generate', '/proxy/https://nai.example.com/x']);
});

test('gate:illustration:service-retries-database-img-marker-without-replanning', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({
        text: NSFW_TEXT.replace('[igs-scene:卧室|夜晚|晴|NSFW]\n', '[igs-scene:卧室|夜晚|晴|NSFW]\n<IMG>1</IMG>\n'),
        settings: { nsfwEnabled: true, nsfwCount: 1 },
    });
    const store = createMemoryIllustrationStore();
    await store.putFloor('c1|5|0', { kind: 'nsfw', want: 1, status: 'failed' });
    await store.putSlot('c1|5|0', { slot: 1, scene: 'room', status: 'failed' });
    const service = createAutoIllustrationService({ ...fake, store });
    const result = await service.processMessage(5);
    assert.equal(result.reason, 'done');
    assert.equal(fake.calls.llm, 0);
    assert.equal(fake.calls.writes.length, 0);
    assert.equal(fake.calls.nai, 1);
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'data:image/png;base64,AAAA');
});


test('gate:illustration:failed-slot-retries-without-replanning', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true, nsfwCount: 1 }, naiResult: { ok: false, error: 'NAI 服务端错误（HTTP 500）' } });
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store });
    const first = await service.processMessage(5);
    assert.equal(first.reason, 'generation-failed');
    assert.match(first.error, /HTTP 500/);
    assert.equal((await store.getFloor('c1|5|0')).status, 'failed');
    fake.nai.generate = async () => { fake.calls.nai++; return { ok: true, dataUrl: 'data:image/png;base64,BBBB' }; };
    const retry = await service.processMessage(5, { manual: true });
    assert.deepEqual([retry.reason, fake.calls.llm, fake.calls.writes.length], ['done', 1, 1]);
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'data:image/png;base64,BBBB');
    assert.equal((await service.processMessage(5, { manual: true })).reason, 'nothing-missing');
});

test('gate:illustration:manual-interlude-ignores-probability', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: SFW_TEXT, settings: { interludeEnabled: true, interludeProbability: 0 } });
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store, random: () => 0.99 });
    assert.equal((await service.processMessage(5)).reason, 'not-selected');
    assert.equal((await service.processMessage(5, { manual: true })).reason, 'done');
    assert.equal(fake.calls.llm, 1);
});

test('gate:illustration:slot-count-mismatch-still-generates', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true, nsfwCount: 2 } });
    const result = await createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() }).processMessage(5);
    assert.equal(result.reason, 'done');
    assert.equal(fake.calls.nai, 1);
});
