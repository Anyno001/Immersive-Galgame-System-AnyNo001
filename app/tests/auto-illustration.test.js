
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractSceneDirectives,
    stripIllustrationMarkers,
    resolveIllustrationAtSourceOffset,
    resolveHeldSourceOffset,
    locateNarrativeOffset,
    resolveHeldSourceOffsets,
    resolveIllustrationForPage,
} from '../src/scene/scene-directives.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { bindCharacterDnaToCaption } from '../src/generated-images/illustration/auto-illustration-service.js';

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

test('gate:illustration:cg-is-the-marker-after-the-current-line', () => {
    const src = '对白1。\n对白2。\n对白3。\n[igs-img:1]\n对白4。\n对白5。\n对白6。\n[igs-img:2]\n对白7。\n对白8。\n对白9。\n[igs-img:3]';
    for (const line of ['对白1。', '对白2。', '对白3。']) {
        assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf(line)).slot, 1);
    }
    for (const line of ['对白4。', '对白5。', '对白6。']) {
        assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf(line)).slot, 2);
    }
    for (const line of ['对白7。', '对白8。', '对白9。']) {
        assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf(line)).slot, 3);
    }
});

test('gate:illustration:current-line-stays-in-the-story-copy', () => {
    const src = '<content>室内。\n[igs-char:星见|高潮|冬装|出してっ！全部。]\n[igs-img:1]\n下一句。</content>\n{"image_guidance":"出してっ！ 全部。"}';
    const segments = ['室内。', '出してっ！ 全部。', '下一句。'];
    const locate = (segment, from) => locateNarrativeOffset(src, segment, from, (slice, start) => {
        const needle = String(segment || '').trim();
        const exact = slice.indexOf(needle, Math.max(0, Number(start) || 0));
        if (exact >= 0) return exact;
        const loose = needle.replace(/[\s*（）\[\]]+/g, '');
        const flat = slice.slice(Math.max(0, Number(start) || 0)).replace(/[\s*（）\[\]]+/g, '');
        const hit = flat.indexOf(loose);
        if (hit < 0) return -1;
        return slice.indexOf('出してっ！', Math.max(0, Number(start) || 0));
    });
    const at = resolveHeldSourceOffset(src, segments, 1, locate);
    assert.ok(at >= 0 && at < src.indexOf('image_guidance'));
    assert.equal(resolveIllustrationAtSourceOffset(src, at).slot, 1);
    assert.equal(resolveIllustrationAtSourceOffset(src, resolveHeldSourceOffset(src, segments, 2, locate)).slot, 1);
});

test('gate:illustration:cg-stays-when-the-next-page-cannot-be-located', () => {
    const src = '前。\n[igs-img:1]\n灯还亮着。\n[igs-char:林小雨|平和|校服|你回来了。]\n她点头。\n[igs-img:2]\n雨停了。';
    const segments = ['前。', '灯还亮着。', '[林小雨]：你回来了。', '她点头。', '雨停了。'];
    const locate = (segment, from) => src.indexOf(String(segment || ''), Math.max(0, Number(from) || 0));
    assert.equal(resolveIllustrationAtSourceOffset(src, resolveHeldSourceOffset(src, segments, 0, locate)).slot, 1);
    assert.equal(resolveIllustrationAtSourceOffset(src, resolveHeldSourceOffset(src, segments, 1, locate)).slot, 2);
    assert.equal(resolveIllustrationAtSourceOffset(src, resolveHeldSourceOffset(src, segments, 2, locate)).slot, 2);
    assert.equal(resolveIllustrationAtSourceOffset(src, resolveHeldSourceOffset(src, segments, 3, locate)).slot, 2);
    assert.equal(resolveIllustrationAtSourceOffset(src, resolveHeldSourceOffset(src, segments, 4, locate)).slot, 2);
});

test('gate:illustration:cg-holds-until-the-next-cg', () => {
    const src = '[igs-scene:A|夜|晴]\n一\n[igs-img:1]\n二\n[igs-scene:B|夜|晴]\n三\n[igs-img:2]\n四';
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('一')).slot, 1);
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('二')).slot, 2);
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('三')).slot, 2);
    assert.equal(resolveIllustrationAtSourceOffset(src, src.indexOf('四')).slot, 2);
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

test('gate:illustration:later-scene-nsfw-still-triggers', async () => {
    const { numberParagraphs } = await import('../src/generated-images/illustration/marker-placer.js');
    const split = [
        '<content>',
        '[igs-scene:教室|白天|晴]',
        '上课。',
        '</content>',
        '<content>',
        '[igs-scene:卧室|夜晚|晴|NSFW]',
        '她关上门。',
        '</content>',
    ].join('\n');
    const afterClose = '<content>\n[igs-scene:教室|白天|晴]\n上课。\n</content>\n[igs-scene:卧室|夜晚|晴|NSFW]\n她关上门。';
    for (const text of [split, afterClose]) {
        const result = numberParagraphs(text);
        assert.equal(result.isNsfw, true);
        assert.deepEqual(result.scenes.map((scene) => scene.scene), ['教室', '卧室']);
    }
});

test('gate:illustration:anchor-uses-the-same-match-as-dbgen', async () => {
    const { numberParagraphs, paragraphNoForAnchor } = await import('../src/generated-images/illustration/marker-placer.js');
    const raw = [
        '[igs-scene:卧室|夜晚|晴|NSFW]',
        '她推开门，看见灯还亮着。',
        '[igs-char:林小雨|平和|校服|你回来了。]',
        '林小雨把外套脱在椅背上，换上了睡衣。',
        '窗外的雨忽然大了。',
    ].join('\n');
    const numbered = numberParagraphs(raw);
    assert.equal(paragraphNoForAnchor(raw, numbered.paragraphs, '她推开门，看见灯还亮着。'), 1);
    assert.equal(paragraphNoForAnchor(raw, numbered.paragraphs, '你回来了'), 2);
    assert.equal(paragraphNoForAnchor(raw, numbered.paragraphs, '“换上了睡衣”'), 3);
    assert.equal(paragraphNoForAnchor(raw, numbered.paragraphs, '结尾改写了，窗外的雨忽然大了，前面也改了'), 4);
    assert.equal(paragraphNoForAnchor(raw, numbered.paragraphs, '完全对不上的另一段话'), 0);
});

test('gate:illustration:anchors-in-one-paragraph-stay-on-their-own-sentences', async () => {
    const { insertMarkersAtAnchors } = await import('../src/generated-images/illustration/marker-placer.js');
    const raw = '前文。黒いエナメルの長い耳が、彼女の頭上でピンと立っている。中文。親指の腹で、張り詰めた乳頭をそっと転がす。后文。';
    const result = insertMarkersAtAnchors(raw, [
        { slot: 4, anchorSentence: '黒いエナメルの長い耳が、彼女の頭上でピンと立っている。' },
        { slot: 3, anchorSentence: '親指の腹で、張り詰めた乳頭をそっと転がす。' },
    ]);
    const ear = result.indexOf('立っている。');
    const thumb = result.indexOf('転がす。');
    assert.ok(ear >= 0 && thumb > ear);
    assert.ok(result.indexOf('[igs-img:4]') > ear);
    assert.ok(result.indexOf('[igs-img:4]') < thumb);
    assert.ok(result.indexOf('[igs-img:3]') > thumb);
    assert.equal(result.includes('[igs-img:4]\n[igs-img:3]'), false);
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

test('gate:illustration:parse-crowded-tail-keeps-count', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    const result = parseIllustrationPlan('slot: 1\nat: 10\nscene: a\nslot: 2\nat: 10\nscene: b\nslot: 3\nat: 10\nscene: c', { maxSlots: 3, paragraphCount: 10 });
    assert.equal(result.slots.length, 3);
    assert.deepEqual(result.slots.map(({ at }) => at), [8, 9, 10]);
});

test('gate:illustration:parse-empty-fails', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    assert.equal(parseIllustrationPlan('抱歉我不能').ok, false);
});

test('gate:illustration:planner-prompt-count-wording', async () => {
    const { buildPlannerUserPrompt } = await import('../src/generated-images/illustration/planner-prompt.js');
    assert.ok(buildPlannerUserPrompt({ want: 2, exact: true }).includes('恰好 2 张'));
    assert.ok(buildPlannerUserPrompt({ want: 1, exact: true, frame: '画面是竖的，宽832，高1216。构图按竖屏写，不要写成横屏。' }).includes('【画面】画面是竖的，宽832，高1216。'));
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
    ctx.chat.push({ mes: 'next', is_user: true });
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
    // 这批用例的正文都只有几个字，专测流程；「少于 50 字不自动生图」单独测。
    return { calls, messageHost, llm, nai, events, getSettings: () => settings, minBodyChars: 0 };
}

const LONG_LINE = '她靠在窗边，看着外面的雨一点点停下来，城市的灯光一盏接一盏地亮起。';

test('gate:illustration:skips-auto-when-body-under-50-chars', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const reports = [];
    const fakes = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const service = createAutoIllustrationService({ ...fakes, minBodyChars: undefined, store: createMemoryIllustrationStore(), report: (level, msg) => reports.push(msg) });
    assert.equal((await service.processMessage(5)).reason, 'body-too-short');
    assert.match(reports.join('\n'), /第 5 楼跳过：正文只有 9 字，少于 50 字不自动生图/);
    // 思考、状态栏写得再长也不算正文。
    fakes.messageHost.setText(`<thinking>${LONG_LINE.repeat(3)}</thinking>\n${NSFW_TEXT}`);
    assert.equal((await service.processMessage(5)).reason, 'body-too-short');
    fakes.messageHost.setText(`<content>\n${NSFW_TEXT}\n</content>\n<Status_block>${LONG_LINE.repeat(3)}</Status_block>`);
    assert.equal((await service.processMessage(5)).reason, 'body-too-short');
    assert.equal(fakes.calls.llm, 0, '正文只有几个字时不规划、不生图');
    // 跳过不记成已处理：同一楼「继续」写长后照常规划。
    fakes.messageHost.setText(`${NSFW_TEXT}\n${LONG_LINE.repeat(2)}`);
    assert.notEqual((await service.processMessage(5)).reason, 'body-too-short');
    assert.ok(fakes.calls.llm > 0, '正文够长照常规划');
    const manual = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    await createAutoIllustrationService({ ...manual, minBodyChars: undefined, store: createMemoryIllustrationStore() }).processMessage(5, { manual: true });
    assert.ok(manual.calls.llm > 0, '手动生成不看字数');
});

test('gate:illustration:body-length-follows-reader-source-filter', async () => {
    const { floorBodyLength } = await import('../src/generated-images/illustration/floor-body-length.js');
    // 台词 / 心理只数说出口的那句，角色名、表情、服装栏和指令不算。
    assert.equal(floorBodyLength('[igs-scene:卧室|夜晚|晴]\n[igs-char:艾莉|微笑|你好。]\n[igs-thought:艾莉|平静|校服|好困。]\n[igs-fx:shake]\n她笑了。'), 10);
    assert.equal(floorBodyLength('【igs-char：艾莉｜微笑｜你好。】\n[igs-img:1]\n<IMG>2</IMG>'), 3);
    // 保留标签在就只数里面；在但为空就是 0；整楼没有保留标签时退回去掉排除块后的全文。
    assert.equal(floorBodyLength(`<thinking>${LONG_LINE}</thinking>\n<content>\n短。\n</content>\n<Status_block>${LONG_LINE}</Status_block>`), 2);
    assert.equal(floorBodyLength(`<content>\n\n</content>\n${LONG_LINE}`), 0);
    assert.equal(floorBodyLength(`<thinking>${LONG_LINE}</thinking>\n短。`), 2);
    assert.equal(floorBodyLength(`<bbi_image>1girl, rain</bbi_image>\nimage###1girl###\n短。`), 2);
    // 用户改过正文过滤规则时跟着改。
    assert.equal(floorBodyLength(`<story>短。</story>\n${LONG_LINE}`, { textIncludeTags: 'story' }), 2);
    assert.equal(floorBodyLength(`<thinking>${LONG_LINE}</thinking>`, { enabled: false }), LONG_LINE.length);
});

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

test('gate:illustration:embedded-cg-uses-host-box-not-window', async () => {
    const { readCgViewport, cgSizeForMode } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const host = { getBoundingClientRect: () => ({ width: 818, height: 511 }) };
    const globalObject = {
        innerWidth: 865,
        innerHeight: 962,
        document: { querySelector: (selector) => (selector === '.igs-embedded-host' ? host : null) },
    };
    const viewport = readCgViewport(globalObject);
    assert.deepEqual(viewport, { width: 818, height: 511 });
    assert.equal(cgSizeForMode('1216x832', 'embedded', viewport), '1216x832');
    assert.deepEqual(readCgViewport({ innerWidth: 865, innerHeight: 962, document: { querySelector: () => null } }), { width: 865, height: 962 });
    assert.deepEqual(readCgViewport(globalObject, 'fullscreen'), { width: 865, height: 962 });
    assert.deepEqual(readCgViewport({
        innerWidth: 400,
        innerHeight: 800,
        visualViewport: { width: 844, height: 390 },
        document: { querySelector: () => host },
    }, 'fullscreen'), { width: 844, height: 390 });
});

test('gate:illustration:cg-size-swaps-on-mobile', async () => {
    const { cgSizeForMode, cgFramePrompt } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    assert.equal(cgFramePrompt('1216x832'), '画面是横的，宽1216，高832。构图按横屏写，不要写成竖屏。');
    assert.equal(cgFramePrompt('832x1216'), '画面是竖的，宽832，高1216。构图按竖屏写，不要写成横屏。');
    assert.equal(cgSizeForMode('1216x832', 'pc'), '1216x832');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen'), '1216x832');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { width: 390, height: 844 }), '640x1408');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { width: 844, height: 390 }), '1408x640');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { width: 390, height: 220 }), '1344x768');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { portrait: true, width: 900, height: 1600 }), '768x1344');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { width: 1280, height: 720 }), '1344x768');
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { width: 1920, height: 1080 }), '1344x768');
    assert.equal(cgSizeForMode('640x640', 'fullscreen', { width: 1920, height: 1080 }), '832x448');
    const pixels = (size) => size.split('x').map(Number).reduce((a, b) => a * b, 1);
    assert.equal(cgSizeForMode('1216x832', 'fullscreen', { width: 1728, height: 576 }), '1728x576');
    assert.equal(pixels(cgSizeForMode('1216x832', 'fullscreen', { width: 1728, height: 576 })), 995328);
    assert.ok(pixels(cgSizeForMode('1920x1088', 'fullscreen', { width: 3440, height: 1440 })) <= 1048576);
    assert.ok(pixels(cgSizeForMode('1920x1088', 'fullscreen')) <= 1048576);
    assert.ok(pixels(cgSizeForMode('2048x2048', 'fullscreen', { width: 21, height: 9 })) <= 1048576);
    assert.equal(cgSizeForMode('1216x832', 'web'), '1216x832');
    assert.equal(cgSizeForMode('1216x832', 'mobile'), '832x1216');
    assert.ok(pixels(cgSizeForMode('1920x1088', 'pc')) <= 1048576);
    assert.ok(pixels(cgSizeForMode('1920x1088', 'web')) <= 1048576);
    assert.ok(pixels(cgSizeForMode('1920x1088', 'mobile')) <= 1048576);
    assert.ok(pixels(cgSizeForMode('2048x1536', 'embedded', { width: 1280, height: 720 })) <= 1048576);
    const { buildNaiV4Request } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    for (const size of ['1920x1088', '1536x1024', '2048x2048', '832x1216']) {
        const body = buildNaiV4Request({ scene: 'room' }, { size });
        assert.ok(body.parameters.width * body.parameters.height <= 1048576, size);
    }
    assert.equal(cgSizeForMode('', 'mobile'), '832x1216');
    assert.equal(cgSizeForMode('1216x832', 'embedded', { width: 390, height: 844 }), '832x1216');
    assert.equal(cgSizeForMode('1216x832', 'embedded', { width: 390, height: 220 }), '832x1216');
    assert.equal(cgSizeForMode('1216x832', 'embedded', { width: 1280, height: 720 }), '1216x832');
    assert.equal(cgSizeForMode('1216x832', 'embedded', { width: 818, height: 511 }), '1216x832');
});

test('gate:illustration:dbgen-cg-calls-only-the-plugin-prompt-and-generate-apis', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const calls = { llm: 0, generate: 0, floor: [], paint: [] };
    let current = NSFW_TEXT;
    const caption = { v4_prompt: { caption: { base_caption: 'cg', char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } } };
    const messageHost = {
        getChatId: () => 'c1',
        readFloor: () => ({ chatId: 'c1', messageId: 5, swipeId: 0, isAi: true, isLatest: true, text: current }),
        readPreviousAiTexts: () => [],
        writeFloor: async (_id, next) => { current = next; return { ok: true }; },
        on: () => () => {}, attachPromptStrip: () => {},
        ensureMarkerRegexes: async () => ({ ok: true }), destroy: () => {},
    };
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        generate: async () => { calls.generate += 1; return { ok: true }; },
        writeDbgenFloorPrompts: async (req) => {
            calls.floor.push(req);
            return { ok: true, captions: [{ slotId: 1, caption, anchorSentence: '二段。' }, { slotId: 2, caption, anchorSentence: '三段。' }] };
        },
        generateDbgenCaption: async (req) => { calls.paint.push(req); return { ok: true, dataUrl: 'data:image/png;base64,Q0c=' }; },
    };
    const llm = { request: async () => { calls.llm += 1; return REPLY; } };
    const service = createAutoIllustrationService({
        messageHost, llm, nai, events: { emit() {} },
        store: createMemoryIllustrationStore(),
        getSettings: () => ({ nsfwEnabled: true, nsfwCount: 1 }),
        minBodyChars: 0,
    });
    const result = await service.processMessage(5);
    assert.equal(result.reason, 'done');
    assert.equal(calls.llm, 0);
    assert.equal(calls.generate, 0);
    assert.equal(calls.floor.length, 1);
    assert.equal(calls.floor[0].messageId, 5);
    assert.equal(calls.floor[0].description, '为本楼生成1张CG，CG点自行选择。slotid从1开始数。挂载点只从剧情正文里逐字摘原句，提示词、出图指导、标签和正文以外的内容不要拿来当挂载点，也不要画进CG。\n画面是横的，宽1216，高832。构图按横屏写，不要写成竖屏。');
    assert.equal(calls.floor[0].skipRecall, undefined);
    assert.equal(calls.paint.length, 1);
    assert.equal(calls.paint[0].caption, caption);
    assert.equal(calls.paint[0].size, '1216x832');
    assert.ok(current.includes('[igs-img:1]'));
    assert.ok(current.indexOf('二段。') < current.indexOf('[igs-img:1]'));
    assert.ok(current.indexOf('[igs-img:1]') < current.indexOf('三段。'));
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'data:image/png;base64,Q0c=');
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

test('gate:illustration:service-tail-append-during-planning-still-writes', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const tail = '\n\n<parallel>与此同时，另一边……</parallel>';
    fake.llm.request = async () => { fake.messageHost.setText(NSFW_TEXT + tail); return REPLY; };
    const store = createMemoryIllustrationStore();
    const result = await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(result.ok, true);
    assert.equal(fake.calls.writes.length, 1);
    assert.ok(fake.calls.writes[0].includes('[igs-img:1]'));
    assert.ok(fake.calls.writes[0].endsWith(tail), '追加的平行事件原样保留在末尾');
    assert.ok(fake.calls.writes[0].indexOf('[igs-img:1]') < fake.calls.writes[0].indexOf('<parallel>'));
});

test('gate:illustration:appended-tail-only-accepts-pure-append', async () => {
    const { appendedTail, reattachTail } = await import('../src/generated-images/illustration/marker-placer.js');
    assert.equal(appendedTail('甲\n乙', '甲\n乙'), '');
    assert.equal(appendedTail('甲\n乙', '甲\n乙\n丙'), '\n丙');
    assert.equal(appendedTail('甲\n乙\n', '甲\n乙\n\n丙'), '\n\n丙', '原文结尾空白被改写也算追加');
    assert.equal(appendedTail('甲\n乙', '甲\n改\n丙'), null);
    assert.equal(appendedTail('甲\n乙', '前\n甲\n乙'), null);
    assert.equal(appendedTail('', '丙'), null);
    assert.equal(reattachTail('[igs-img:1]\n甲\n', '\n丙'), '[igs-img:1]\n甲\n丙');
    assert.equal(reattachTail('甲', ''), '甲');
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
        getSettings: () => ({ nsfwEnabled: true }), minBodyChars: 0,
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
    const settings = normalizeAutoIllustrationSettings({ nsfwEnabled: 'true', nsfwCount: 9, interludeProbability: -5, interludeMaxCount: '16', assets: { maxPerFloor: '16' }, llm: { source: 'x' } });
    assert.equal(settings.nsfwEnabled, true);
    assert.equal(settings.nsfwCount, 9);
    assert.equal(normalizeAutoIllustrationSettings({ nsfwCount: 2 }).nsfwCount, 2);
    assert.equal(normalizeAutoIllustrationSettings({ nsfwCount: 99 }).nsfwCount, 16);
    assert.equal(settings.interludeMaxCount, 16);
    assert.equal(settings.assets.maxPerFloor, 16);
    const capped = normalizeAutoIllustrationSettings({ interludeMaxCount: 99, assets: { maxPerFloor: 99 } });
    assert.deepEqual([capped.interludeMaxCount, capped.assets.maxPerFloor], [16, 16]);
    const defaults = normalizeAutoIllustrationSettings({});
    assert.deepEqual([defaults.interludeMaxCount, defaults.assets.maxPerFloor], [1, 2]);
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
        minBodyChars: 0,
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

function cgSlots(src, segments, opts = {}) {
    const offsets = resolveHeldSourceOffsets(src, segments);
    return segments.map((_, index) => {
        const hit = resolveIllustrationForPage({ source: src, offsets, segments, index, holdPages: 2, ...opts });
        return hit ? hit.slot : 0;
    });
}

test('gate:illustration:sfw-cg-enters-at-anchor-and-leaves-after-hold', () => {
    const segments = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。', '庚。'];
    const src = '[igs-scene:教室|午后|晴]\n甲。\n乙。\n[igs-img:1]\n丙。\n丁。\n戊。\n己。\n庚。';
    // 锚句「乙」所在页切入，不提前；无人开口时最长保持 holdPages*2 页。
    assert.deepEqual(cgSlots(src, segments), [0, 1, 1, 1, 1, 0, 0]);
});

test('gate:illustration:sfw-cg-leaves-when-a-new-speaker-talks', () => {
    const segments = ['甲。', '[小雪]：嗯。', '丙。', '[小雪]：好。', '[林]：喂。', '丁。'];
    const src = '[igs-scene:教室|午后|晴]\n甲。\n[igs-char:小雪|开心|嗯。]\n[igs-img:1]\n丙。\n[igs-char:小雪|开心|好。]\n[igs-char:林|平和|喂。]\n丁。';
    assert.deepEqual(cgSlots(src, segments), [0, 1, 1, 1, 0, 0]);
});

test('gate:illustration:sfw-cg-leaves-on-scene-change-and-next-cg-takes-over', () => {
    const segments = ['甲。', '乙。', '丙。', '丁。', '戊。'];
    const src = '[igs-scene:教室|午后|晴]\n甲。\n[igs-img:1]\n[igs-scene:走廊|午后|晴]\n乙。\n丙。\n[igs-img:2]\n丁。\n戊。';
    assert.deepEqual(cgSlots(src, segments), [1, 0, 2, 2, 2]);
});

test('gate:illustration:nsfw-cg-keeps-floor-wide-behaviour', () => {
    const segments = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。', '庚。'];
    const src = '[igs-scene:卧室|夜晚|晴|NSFW]\n甲。\n乙。\n[igs-img:1]\n丙。\n丁。\n戊。\n己。\n庚。';
    assert.deepEqual(cgSlots(src, segments), [1, 1, 1, 1, 1, 1, 1]);
    // 本楼没写场景时沿用上一楼的 NSFW 状态。
    assert.deepEqual(cgSlots(src.replace(/^.*\n/, ''), segments, { inheritedNsfw: true }), [1, 1, 1, 1, 1, 1, 1]);
});

test('数据库生图 CG：单人且上下文唯一角色时 DNA 并进 char caption，多人不注入', () => {
    const assets = { characters: { 小雪: {} }, characterAliases: {}, characterDna: { 小雪: { triggerWords: 'xiaoxue', identity: '1girl, white hair', negative: 'short hair' } } };
    const caption = (n) => ({
        v4_prompt: { caption: { base_caption: 'room', char_captions: Array.from({ length: n }, () => ({ char_caption: 'smile', centers: [{ x: 0.5, y: 0.5 }] })) } },
        v4_negative_prompt: { caption: { base_caption: 'bad', char_captions: [] } },
    });
    const single = bindCharacterDnaToCaption(caption(1), assets, ['小雪'], 1);
    assert.equal(single.caption.v4_prompt.caption.char_captions[0].char_caption, 'xiaoxue, 1girl, white hair, smile');
    assert.equal(single.caption.v4_negative_prompt.caption.char_captions[0].char_caption, 'short hair');
    assert.deepEqual(single.caption.v4_negative_prompt.caption.char_captions[0].centers, [{ x: 0.5, y: 0.5 }]);
    const pair = bindCharacterDnaToCaption(caption(2), assets, ['小雪'], 2);
    assert.equal(pair.caption.v4_prompt.caption.char_captions[0].char_caption, 'smile');
    assert.equal(pair.warnings.length, 1);
});

// 平行事件插件在 AI 楼后面另插一条（隐藏的系统消息或旁白楼）：这楼仍算最新楼，立绘、场景、CG 照常生成；用户发言后才不算。
test('gate:illustration:message-host-latest-ignores-plugin-floors-after-ai', async () => {
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    const ctx = { chatId: 'c1', chat: [{ mes: 'u', is_user: true }, { mes: 'ai', is_user: false }, { mes: '平行事件', is_user: false, is_system: true }, { mes: '旁白', is_user: false }] };
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx } });
    assert.equal(host.readFloor(1).isLatest, true);
    ctx.chat.push({ mes: '下一句', is_user: true });
    assert.equal(host.readFloor(1).isLatest, false);
});

// 规划期间正文开头 / 中间被插了内容：标记按前后文搬到新正文，照常出图；对不上的那张丢掉。
test('gate:illustration:service-mid-edit-during-planning-transplants-markers', async () => {
    const { createAutoIllustrationService } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const head = '<parallel>与此同时，另一边……</parallel>\n';
    fake.llm.request = async () => { fake.messageHost.setText(head + NSFW_TEXT); return REPLY; };
    const store = createMemoryIllustrationStore();
    const result = await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(result.ok, true);
    assert.equal(fake.calls.writes.length, 1);
    assert.ok(fake.calls.writes[0].startsWith(head), '插件插的内容原样保留');
    assert.ok(fake.calls.writes[0].includes('\n[igs-img:1]\n二段。'));
    assert.equal(fake.calls.nai, 1);
});

test('gate:illustration:transplant-markers-follows-context', async () => {
    const { transplantMarkers } = await import('../src/generated-images/illustration/marker-placer.js');
    const moved = transplantMarkers('甲段落一句。\n[igs-img:1]\n乙段落二句。\n丙三。\n[igs-img:2]', '【平行事件】别处。\n甲段落一句。\n乙段落二句改过。\n丙三。\n<状态栏>');
    assert.deepEqual(moved.slots, [1, 2]);
    assert.equal(moved.text, '【平行事件】别处。\n甲段落一句。\n[igs-img:1]\n乙段落二句改过。\n丙三。\n[igs-img:2]\n<状态栏>');
    assert.deepEqual(transplantMarkers('甲。\n[igs-img:1]\n乙。', '完全不同的内容').slots, []);
});
