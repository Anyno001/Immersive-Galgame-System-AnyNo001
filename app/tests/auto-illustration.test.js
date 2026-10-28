
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeLlmHost } from './helpers/fake-llm-host.js';
import {
    extractSceneDirectives,
    stripIllustrationMarkers,
    resolveIllustrationAtSourceOffset,
    resolveHeldSourceOffset,
    locateNarrativeOffset,
    resolveHeldSourceOffsets,
    prepareIllustrationPages,
    resolveIllustrationForPage,
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

test('gate:illustration:standalone-cg-writes-and-paints-without-a-floor', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: SFW_TEXT, settings: { nsfwEnabled: true } });
    const caption = { v4_prompt: { caption: { base_caption: '1girl, mahjong table', char_captions: [] } } };
    const seen = {};
    fake.nai = {
        describe: () => ({ mode: 'baibai', via: 'baibai', ready: { ok: true } }),
        writePrompt: async (meta) => { seen.write = meta; return { ok: true, caption, captions: [{ slotId: 1, caption }] }; },
        generateCaption: async (meta) => { seen.paint = meta; return { ok: true, dataUrl: 'data:image/png;base64,CG' }; },
    };
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store,
        getSceneAssets: () => ({ characterOutfits: { 凛: { 礼服: { base: 'rin.png' } } } }) });
    const result = await service.paintStandaloneCg({ characters: ['凛'], nude: ['凛'], nsfw: true, description: '凛垫底，罚她学猫叫' });
    assert.equal(result.ok, true);
    assert.equal(result.dataUrl, 'data:image/png;base64,CG');
    assert.match(result.request, /衣装：凛全裸出镜/);
    assert.equal(seen.write.imagePromptTask, 'cg');
    assert.match(seen.write.description, /罚她学猫叫/);
    assert.equal(seen.write.characterContext[0].characterKey, '凛');
    assert.equal(seen.write.characterContext[0].outfit.name, '裸体');
    assert.equal(seen.paint.caption, caption);
    assert.equal(seen.paint.imageKind, 'cg');
    assert.equal(seen.paint.promptKind, 'nsfwCg');
    assert.equal(fake.calls.writes.length, 0);
    assert.deepEqual(await store.listSlotKeys?.() || [], []);
});

test('gate:illustration:standalone-cg-dresses-the-picked-outfit-and-fits-the-table', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: SFW_TEXT, settings: { nsfwEnabled: false } });
    const caption = { v4_prompt: { caption: { base_caption: 'mahjong table', char_captions: [] } } };
    const seen = {};
    const read = [];
    fake.nai = {
        describe: () => ({ mode: 'baibai', via: 'baibai', ready: { ok: true } }),
        writePrompt: async (meta) => { seen.write = meta; return { ok: true, caption, captions: [{ slotId: 1, caption }] }; },
        generateCaption: async (meta) => { seen.paint = meta; return { ok: true, dataUrl: 'data:image/png;base64,CG', prompt: { positive: 'best quality, 1girl', negative: 'lowres' } }; },
    };
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore(),
        readSpritePrompt: async (url) => {
            read.push(url);
            return { positive: 'whole', caption: { v4_prompt: { caption: { base_caption: 'white background', char_captions: [{ char_caption: 'rin, black hair, red evening dress' }] } } } };
        },
        getSceneAssets: () => ({
            characterOutfits: { 凛: { 便服: { moods: { 平和: 'igs-gen:casual' } }, 礼服: { moods: { 喜悦: 'igs-gen:dress-joy', 平和: 'igs-gen:dress-calm' } } } },
            wardrobe: { 礼服: { prompt: 'red evening dress' } },
        }) });
    const result = await service.paintStandaloneCg({ characters: ['凛'], outfits: { 凛: '礼服' }, description: '凛罚我捏肩', aspect: { width: 1600, height: 900 } });
    assert.equal(result.ok, true);
    assert.deepEqual(read, ['igs-gen:dress-calm']);
    assert.deepEqual(seen.write.characterContext[0].outfit, { name: '礼服', description: 'red evening dress' });
    assert.match(seen.write.description, /衣装：凛穿「礼服」/);
    assert.match(seen.write.description, /凛（礼服）：rin, black hair, red evening dress/);
    const [width, height] = seen.paint.size.split('x').map(Number);
    assert.ok(Math.abs(width / height - 16 / 9) < 0.05, seen.paint.size);
    assert.ok(width * height <= 1024 * 1024 && width % 64 === 0 && height % 64 === 0, seen.paint.size);
    assert.equal(result.size, seen.paint.size);
    assert.deepEqual(result.prompt, { positive: 'best quality, 1girl', negative: 'lowres' });
});

test('gate:illustration:standalone-cg-respects-the-nsfw-switch-and-needs-a-request', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: SFW_TEXT, settings: { nsfwEnabled: false } });
    let calls = 0;
    fake.nai = {
        describe: () => ({ mode: 'baibai', via: 'baibai', ready: { ok: true } }),
        writePrompt: async () => { calls++; return { ok: false }; },
        generateCaption: async () => { calls++; return { ok: false }; },
    };
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() });
    assert.deepEqual(service.standaloneCgStatus(), { ok: true, nsfw: false });
    assert.equal((await service.paintStandaloneCg({ characters: ['凛'], nsfw: true, description: '罚她' })).reason, 'nsfw-disabled');
    assert.equal((await service.paintStandaloneCg({ characters: ['凛'], description: '  ' })).reason, 'empty-description');
    assert.equal(calls, 0);
});

test('gate:illustration:automatic-floor-settles-before-the-next-floor-prompt', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: SFW_TEXT, settings: { nsfwEnabled: false, interludeEnabled: false } });
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() });
    const pending = service.whenFloorSettled(5);
    assert.equal(service.floorCgStatus(5), null);
    assert.equal((await service.processMessage(5)).reason, 'disabled');
    assert.deepEqual(await pending, { status: 'none' });
    assert.deepEqual(service.floorCgStatus(5), { status: 'none' });
});

test('gate:illustration:service-concurrent-calls-share-lock', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() });
    await Promise.all([service.processMessage(5), service.processMessage(5)]);
    assert.equal(fake.calls.llm, 1);
});

test('gate:illustration:service-stale-text-aborts', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    fake.llm.request = async () => { fake.messageHost.setText('被用户改了'); return REPLY; };
    const store = createMemoryIllustrationStore();
    assert.equal((await createAutoIllustrationService({ ...fake, store }).processMessage(5)).reason, 'stale');
    assert.equal(fake.calls.writes.length, 0);
    assert.equal((await store.getFloor('c1|5|0')).status, 'stale');
});

test('gate:illustration:service-stale-when-new-floor-arrives-during-planning', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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

function cgSlots(src, segments, opts = {}) {
    const offsets = resolveHeldSourceOffsets(src, segments);
    return segments.map((_, index) => {
        const hit = resolveIllustrationForPage({ source: src, offsets, segments, index, holdPages: 2, ...opts });
        return hit ? hit.slot : 0;
    });
}
