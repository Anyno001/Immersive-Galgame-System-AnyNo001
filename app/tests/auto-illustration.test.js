
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
    const { buildNaiV4Request } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    const p = buildNaiV4Request({ scene: 'indoors, night', sceneUc: 'text', chars: [{ x: 0.33, y: 0.5, tags: '1girl, long hair', uc: 'bad hands' }] }, {}, () => 0).parameters;
    assert.equal(p.v4_prompt.use_coords, true);
    assert.equal(p.v4_prompt.use_order, true);
    assert.equal(p.v4_negative_prompt.legacy_uc, false);
    assert.deepEqual(p.v4_prompt.caption.char_captions[0].centers[0], { x: 0.3, y: 0.5 });
    assert.equal(p.negative_prompt, 'text', '请求构建器保留调用方 UC，不追加旧通用负面词');
    assert.equal(p.v4_negative_prompt.caption.base_caption, p.negative_prompt);
    assert.equal(p.v4_negative_prompt.caption.char_captions[0].char_caption, 'bad hands');
    assert.equal(p.seed, 0);
    for (const seed of [0, 42, 4294967295]) {
        assert.equal(buildNaiV4Request({ scene: 'room' }, { seed }, () => { throw new Error('不得重抽'); }).parameters.seed, seed);
    }
    for (const seed of [undefined, -1, 0.5, 4294967296, '42']) {
        assert.equal(buildNaiV4Request({ scene: 'room' }, { seed }, () => 0.5).parameters.seed, 2147483647);
    }
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

test('gate:illustration:anchors-in-one-paragraph-keep-the-paragraph-intact-and-order-points', async () => {
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
    assert.ok(result.indexOf('[igs-img:4]') > result.indexOf('后文。'));
    assert.ok(result.indexOf('[igs-img:3]') > thumb);
    assert.equal(result, `${raw}\n[igs-img:4]\n[igs-img:3]`);
});

test('gate:illustration:insert-marker-after-complete-paragraph', async () => {
    const { numberParagraphs, insertMarkers } = await import('../src/generated-images/illustration/marker-placer.js');
    const raw = '[igs-scene:A|夜|晴]\n一\n二\n三';
    const result = insertMarkers(raw, numberParagraphs(raw).paragraphs, [{ slot: 1, at: 2 }, { slot: 2, at: 3 }]);
    assert.ok(result.includes('一\n二\n[igs-img:1]\n三\n[igs-img:2]'));
});

test('gate:illustration:insert-marker-on-own-line-after-leading-scene-and-body', async () => {
    const { numberParagraphs, insertMarkers } = await import('../src/generated-images/illustration/marker-placer.js');
    const raw = '[igs-scene:A|夜|晴]正文';
    const result = insertMarkers(raw, numberParagraphs(raw).paragraphs, [{ slot: 1, at: 1 }]);
    assert.equal(result, '[igs-scene:A|夜|晴]正文\n[igs-img:1]');
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

test('gate:illustration:cg-planner-includes-today-outfit-as-reference', async () => {
    const { summarizeFloorOutfits } = await import('../src/generated-images/illustration/floor-outfit-reference.js');
    const { buildPlannerUserPrompt } = await import('../src/generated-images/illustration/planner-prompt.js');
    const { bindCharacterDnaToSlots } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const sceneAssets = {
        characters: { 爱丽丝: {} },
        characterAliases: { 爱丽丝: ['爱丽'] },
        characterOutfits: {
            爱丽丝: {
                校服: { words: [], moods: {}, wardrobe: '夏日校服' },
                睡衣: { words: [], moods: {} },
            },
        },
        wardrobe: {
            夏日校服: { prompt: 'white shirt, blue pleated skirt' },
            睡衣: { prompt: 'nightgown' },
        },
    };
    const worn = summarizeFloorOutfits(['爱丽'], sceneAssets, {
        floorText: '[igs-scene:教室|白天|晴]\n[igs-char:爱丽|微笑|校服|早啊]\n她走进教室。',
        previousTexts: ['[igs-char:爱丽|平静|睡衣|昨晚]'],
    });
    assert.equal(worn.length, 1);
    assert.equal(worn[0].name, '爱丽丝');
    assert.equal(worn[0].segments.length, 1);
    assert.equal(worn[0].segments[0].outfit, '校服');
    assert.equal(worn[0].segments[0].prompt, 'white shirt, blue pleated skirt');

    const prompt = buildPlannerUserPrompt({
        numberedText: '1. 早啊', scenes: [], characters: ['爱丽'], want: 1, exact: false,
        characterDna: [{ name: '爱丽丝', identity: 'silver hair', defaultAppearance: 'school uniform' }],
        outfits: worn,
    });
    assert.ok(prompt.includes('【今天的穿着】'));
    assert.ok(prompt.includes('不是必须画成这样'));
    assert.ok(prompt.includes('今天穿着「校服」'));
    assert.ok(prompt.includes('提示词：white shirt, blue pleated skirt'));
    assert.ok(prompt.includes('写了【今天的穿着】的角色按那一套'));
    assert.ok(prompt.includes('正文写了变化都按正文'));

    const inherited = summarizeFloorOutfits(['爱丽'], sceneAssets, {
        floorText: '[igs-char:爱丽|微笑|早啊]',
        previousTexts: ['[igs-char:爱丽|平静|睡衣|昨晚]'],
    });
    assert.equal(inherited[0].segments[0].outfit, '睡衣');
    assert.equal(inherited[0].segments[0].prompt, 'nightgown');

    const changed = summarizeFloorOutfits(['爱丽'], sceneAssets, {
        floorText: '[igs-char:爱丽|微笑|校服|早]\n她走着。\n[igs-char:爱丽|害羞|睡衣|换好了]',
        previousTexts: [],
    });
    assert.deepEqual(changed[0].segments.map((segment) => segment.outfit), ['校服', '睡衣']);
    assert.ok(changed[0].segments[1].from > 1);
    const changedPrompt = buildPlannerUserPrompt({ numberedText: '1. 早', want: 1, exact: false, outfits: changed });
    assert.ok(changedPrompt.includes('从第'));
    assert.ok(changedPrompt.includes('换成「睡衣」'));
    assert.ok(changedPrompt.includes('nightgown'));

    const bound = bindCharacterDnaToSlots(
        [{ slot: 1, chars: [{ name: '爱丽', tags: 'smile', uc: '' }] }],
        { ...sceneAssets, characterDna: { 爱丽丝: { identity: 'silver hair', defaultAppearance: 'school uniform' } } },
        ['爱丽'],
    );
    assert.equal(bound.slots[0].chars[0].tags.includes('white shirt'), false);
    assert.equal(bound.slots[0].chars[0].tags.includes('school uniform'), false);

    const beachOnly = {
        ...sceneAssets,
        characterOutfits: { 爱丽丝: { 泳衣: { words: [], moods: {}, scenes: ['海边'] } } },
        wardrobe: { 泳衣: { prompt: 'swimsuit' } },
    };
    const dropped = summarizeFloorOutfits(['爱丽'], beachOnly, {
        floorText: '[igs-scene:教室|白天|晴]\n[igs-char:爱丽|微笑|早啊]',
        previousTexts: ['[igs-char:爱丽|开心|泳衣|海边见]'],
    });
    assert.equal(dropped.length, 0);
    const kept = summarizeFloorOutfits(['爱丽'], beachOnly, {
        floorText: '[igs-scene:教室|白天|晴]\n[igs-char:爱丽|微笑|泳衣|就穿这个]',
        previousTexts: [],
    });
    assert.equal(kept[0].segments[0].outfit, '泳衣');
    assert.equal(kept[0].segments[0].prompt, 'swimsuit');
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

test('gate:illustration:secondary-llm-native-url-and-body', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    let url;
    let body;
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: async (target, init) => {
        url = target;
        body = JSON.parse(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    } });
    assert.equal(await llm.request({ system: 'sys', user: 'usr' }, { source: 'openai', endpoint: 'https://x.com/v1', model: 'm' }), 'ok');
    assert.equal(url, '/api/backends/chat-completions/generate');
    assert.equal(body.custom_url, 'https://x.com/v1');
    assert.equal(body.messages[0].role, 'system');
    assert.deepEqual(body, { chat_completion_source: 'custom', custom_url: 'https://x.com/v1',
        custom_include_headers: JSON.stringify({ Authorization: '' }), model: 'm', stream: false,
        use_sysprompt: true, messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }] });
});

test('gate:illustration:secondary-llm-dbg-custom-private-config-and-no-resend', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const calls = [];
    let rejected = false;
    const Service = {
        sendRequest() { assert.fail('不得调用宿主主连接服务'); },
    };
    const host = { SillyTavern: { getContext: () => ({ ChatCompletionService: Service,
        getRequestHeaders: () => ({ 'X-CSRF-Token': 'fixture-csrf' }) }) } };
    const llm = createSecondaryLlm(host, { fetch: async (url, init) => {
        assert.equal(url, '/api/backends/chat-completions/generate');
        assert.equal(init.credentials, 'same-origin');
        assert.equal(init.headers['X-CSRF-Token'], 'fixture-csrf');
        calls.push({ data: JSON.parse(init.body), signal: init.signal });
        return new Response(JSON.stringify(rejected ? { error: 'secret upstream body' }
            : { choices: [{ message: { content: '<think>private reasoning</think>scene: A room.' } }] }),
        { status: rejected ? 422 : 200 });
    } });
    const request = { messages: [{ role: 'system', content: '框架' }, { role: 'system', content: '任务' },
        { role: 'assistant', content: '示例' }, { role: 'user', content: '输出' }] };
    const before = structuredClone(request);
    for (const endpoint of ['https://fake.test', 'https://fake.test/v1/', 'https://fake.test/v1/chat/completions']) {
        assert.equal(await llm.request(request, { source: 'openai', endpoint, apiKey: 'fixture-key', model: 'private-model' }), 'scene: A room.');
        const call = calls.at(-1);
        assert.deepEqual(call.data, { stream: false, messages: request.messages, model: 'private-model',
            chat_completion_source: 'custom', custom_url: 'https://fake.test/v1', use_sysprompt: true,
            custom_include_headers: JSON.stringify({ Authorization: 'Bearer fixture-key' }) });
        assert.ok(call.signal instanceof AbortSignal);
    }
    assert.deepEqual(request, before);
    rejected = true;
    await assert.rejects(llm.request(request, { source: 'openai', endpoint: 'https://fake.test', model: 'm' }), error => {
        assert.equal(error.status, 422);
        assert.equal(error.reason, 'secondary-llm-http-failed');
        assert.deepEqual(error.diagnostic, { stage: 'secondary-llm', transport: 'st-backend', status: 422 });
        assert.doesNotMatch(error.message, /secret|upstream body/);
        return true;
    });
    assert.equal(calls.length, 4);
});

test('gate:illustration:secondary-llm-direct-422-safe-diagnostic-and-thinking', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    let calls = 0;
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: async () => {
        calls++;
        return new Response(JSON.stringify({ detail: [{ loc: ['body', 'messages', 0, 'content'],
            msg: 'secret prompt', input: 'fixture-key' }] }), { status: 422 });
    } });
    await assert.rejects(llm.request({ system: 's', user: 'u' }, { source: 'openai', endpoint: 'https://fake.test', model: 'm' }), error => {
        assert.equal(error.status, 422);
        assert.equal(error.diagnostic.field, 'messages');
        assert.match(error.message, /HTTP 422.*messages.*未自动补发/);
        assert.doesNotMatch(JSON.stringify(error), /secret|fixture-key/);
        return true;
    });
    assert.equal(calls, 1);
    for (const [content, expected] of [['<think>private</think>ok', 'ok'], ['<think>unfinished', '']]) {
        const successful = createSecondaryLlm(fakeLlmHost(), { fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })) });
        assert.equal(await successful.request({ system: 's', user: 'u' }, { source: 'openai', endpoint: 'https://fake.test', model: 'm' }), expected);
    }
});

test('gate:illustration:secondary-llm-custom-model-list-and-cancellation', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    let sent, modelCalls = 0, abortSeen = false;
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: async (url, init) => {
        sent = { url, init };
        if (url.endsWith('/status')) {
            modelCalls++;
            return new Response(JSON.stringify({ data: [{ id: 'm' }] }));
        }
        assert.equal(url, '/api/backends/chat-completions/generate');
        return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => {
            abortSeen = true; reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        }, { once: true }));
    } });
    assert.deepEqual((await llm.fetchModels({ endpoint: 'https://fake.test/v1', apiKey: 'fixture-key' })).models, ['m']);
    assert.equal(sent.url, '/api/backends/chat-completions/status');
    assert.equal(sent.init.headers['X-CSRF-Token'], 'fake-csrf');
    assert.deepEqual(JSON.parse(sent.init.body), { chat_completion_source: 'custom', custom_url: 'https://fake.test/v1',
        custom_include_headers: JSON.stringify({ Authorization: 'Bearer fixture-key' }) });
    const controller = new AbortController();
    const job = llm.request({ system: 's', user: 'u' }, { source: 'openai', endpoint: 'https://fake.test', model: 'm', signal: controller.signal });
    controller.abort();
    await assert.rejects(job, { reason: 'request-stale' });
    assert.equal(abortSeen, true);
    assert.equal(modelCalls, 1);
});

test('gate:illustration:secondary-llm-fetch-models', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const calls = [];
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: async (url, init) => {
        calls.push({ url, method: init.method, auth: JSON.parse(JSON.parse(init.body).custom_include_headers).Authorization });
        return new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-a' }] }), { status: 200 });
    } });
    const result = await llm.fetchModels({ endpoint: 'https://example.com/v1', apiKey: 'fake-key' });
    assert.deepEqual(result.models, ['model-a', 'model-b']);
    assert.deepEqual(calls, [{ url: '/api/backends/chat-completions/status', method: 'POST', auth: 'Bearer fake-key' }]);
    const empty = createSecondaryLlm(fakeLlmHost(), { fetch: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) });
    await assert.rejects(empty.fetchModels({ endpoint: 'https://example.com/v1' }), /未返回可用模型/);
    let count = 0;
    const missing = createSecondaryLlm(fakeLlmHost(), { fetch: async () => { count += 1; throw new Error('unexpected'); } });
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
    const { isBackgroundGenerationActive } = await import('../src/host/background-generation.js');
    let finish;
    const upstream = new Promise(resolve => { finish = resolve; });
    const llm = createSecondaryLlm({ TavernHelper: { generateRaw: () => upstream } });
    try {
        await assert.rejects(llm.request({ system: 'sys', user: 'usr' }, { timeoutMs: 20 }), { reason: 'request-timeout' });
        assert.equal(isBackgroundGenerationActive(), true, '超时不等于宿主任务已经结束');
    } finally {
        // 结束本用例的宿主任务，避免后台守卫污染后续事件测试。
        finish('late result');
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(isBackgroundGenerationActive(), false, '宿主结束后释放后台守卫');
});
test('gate:illustration:secondary-llm-ordered-messages-wire', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const messages = [
        { role: 'system', content: '框架\n' }, { role: 'system', content: '任务' },
        { role: 'user', content: '资料 {{未知}}' }, { role: 'assistant', content: '示例' },
        { role: 'user', content: '输出' },
    ];
    const request = { messages: structuredClone(messages) };
    const wires = [];
    const openai = createSecondaryLlm(fakeLlmHost(), { fetch: async (_, init) => {
        wires.push(JSON.parse(init.body).messages);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    } });
    const tavern = createSecondaryLlm({ TavernHelper: { generateRaw: async (value) => {
        wires.push(value.ordered_prompts); return 'ok';
    } } });
    await openai.request(request, { source: 'openai', endpoint: 'https://fake.test/v1', model: 'fake' });
    await tavern.request(request);
    assert.deepEqual(wires, [messages, messages]);
    wires[1][0].content = '宿主改动';
    assert.deepEqual(request, { messages });
});

test('gate:illustration:secondary-llm-message-validation-and-legacy-host', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const calls = [];
    const llm = createSecondaryLlm({ SillyTavern: { getContext: () => ({
        generateRaw: async (value) => { calls.push(value); return 'ok'; },
    }) } });
    await llm.request({ system: 'sys', user: 'usr' }, { jailbreakHead: 'HEAD', jailbreakTail: 'TAIL' });
    assert.deepEqual(calls, [{ systemPrompt: 'HEAD\n\nsys', prompt: 'usr\n\nTAIL' }]);
    const ordered = [{ role: 'system', content: 's' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'u' }];
    await assert.rejects(llm.request({ messages: ordered }), { reason: 'ordered-messages-unsupported' });
    for (const request of [{ messages: [] }, { messages: undefined },
        { messages: ordered, system: undefined }, { messages: [{ role: 'tool', content: 'x' }] },
        { messages: [{ role: 'user', content: 1 }] }, { messages: [{ role: 'user', content: 'x', extra: true }] }]) {
        await assert.rejects(llm.request(request), { reason: 'invalid-llm-messages' });
    }
    assert.equal(calls.length, 1, '拒绝发生在宿主调用之前');
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

test('gate:illustration:message-host-final-floor-and-late-event-boundaries', async () => {
    const { EventEmitter } = await import('node:events');
    const { createIllustrationMessageHost } = await import('../src/host/illustration-message-host.js');
    const { runBackgroundGeneration } = await import('../src/host/background-generation.js');
    const names = ['GENERATION_STARTED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED'];
    const eventSource = new EventEmitter();
    const ctx = { chatId: 'c1', chat: [{ mes: 'user', is_user: true }, { mes: 'partial' }],
        eventSource, eventTypes: Object.fromEntries(names.map(name => [name, name])) };
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx } });
    const delivered = [];
    const off = host.onImageFloorReady(id => delivered.push([id, host.readFloor(id).text]));
    const emit = (name, ...args) => eventSource.emit(name, ...args);
    try {
        emit('GENERATION_STARTED', 'normal', {}, false);
        emit('CHARACTER_MESSAGE_RENDERED', 1);
        emit('CHARACTER_MESSAGE_RENDERED', 1);
        assert.deepEqual(delivered, [], '流式渲染不提前启动');
        ctx.chat[1].mes = 'final';
        emit('GENERATION_ENDED', 1);
        await Promise.resolve();
        assert.deepEqual(delivered, [[1, 'final']], '结束后合并并读取最终正文');
        emit('GENERATION_STARTED', 'normal', {}, false);
        emit('GENERATION_ENDED', 1);
        emit('GENERATION_STOPPED');
        emit('CHARACTER_MESSAGE_RENDERED', 1);
        emit('GENERATION_ENDED', 1);
        await Promise.resolve();
        assert.equal(delivered.length, 1, '停止使待交付与迟到事件失效');
        emit('GENERATION_STARTED', 'normal', {}, false);
        emit('GENERATION_ENDED', 1);
        ctx.chatId = 'c2'; emit('CHAT_CHANGED');
        emit('CHARACTER_MESSAGE_RENDERED', 1);
        await Promise.resolve();
        assert.equal(delivered.length, 1, '换聊天拒收旧轮次');
        for (const type of ['quiet', 'impersonate']) {
            emit('GENERATION_STARTED', type, {}, false);
            emit('CHARACTER_MESSAGE_RENDERED', 1);
            emit('GENERATION_ENDED', 1);
        }
        await runBackgroundGeneration(async () => {
            emit('GENERATION_STARTED', 'normal', {}, false);
            emit('CHARACTER_MESSAGE_RENDERED', 1);
            emit('GENERATION_ENDED', 1);
        });
        assert.equal(delivered.length, 1, '后台生成不得启动生图');
        emit('GENERATION_STARTED', 'normal', {}, true);
        emit('GENERATION_STARTED', 'quiet', { quietToLoud: true }, false);
        ctx.chat[1].mes = 'next final';
        emit('GENERATION_ENDED');
        await Promise.resolve();
        assert.deepEqual(delivered.at(-1), [1, 'next final'], 'dryRun 不悬挂；quietToLoud 按正文处理');
        emit('GENERATION_STARTED', 'normal', {}, false);
        emit('GENERATION_STARTED', 'quiet', {}, false);
        emit('GENERATION_ENDED', 1);
        assert.equal(delivered.length, 2, '后台结束不提前结束主生成');
        ctx.chat[1].mes = 'nested final';
        emit('GENERATION_ENDED', 1);
        await Promise.resolve();
        assert.deepEqual(delivered.at(-1), [1, 'nested final']);
        emit('GENERATION_STARTED', 'normal', {}, false);
        emit('GENERATION_ENDED', 1);
        off();
        await Promise.resolve();
        assert.equal(delivered.length, 3, '卸载撤销排队交付');
        assert.ok(names.every(name => eventSource.listenerCount(name) === 0));
    } finally { off(); host.destroy(); }
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const store = createMemoryIllustrationStore();
    const fake = makeFakes({ text: NSFW_TEXT });
    const result = await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(result.reason, 'disabled');
    assert.equal(fake.calls.llm + fake.calls.nai + fake.calls.writes.length, 0);
    assert.equal(await store.getFloor('c1|5|0'), null);
});

test('gate:illustration:service-skips-non-latest-floor', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, isLatest: false, settings: { nsfwEnabled: true } });
    assert.equal((await createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() }).processMessage(5)).reason, 'not-eligible');
    assert.equal(fake.calls.llm + fake.calls.nai, 0);
});

test('gate:illustration:service-nsfw-generates-and-writes-marker', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { ILLUSTRATION_UPDATED_EVENT } = await import('../src/generated-images/illustration/auto-illustration-service.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const store = createMemoryIllustrationStore();
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true, nsfwCount: 1 } });
    const service = createAutoIllustrationService({ ...fake, store });
    assert.equal((await service.processMessage(5)).reason, 'done');
    assert.ok(fake.calls.writes[0].includes('\n二段。\n[igs-img:1]'));
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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

    assert.equal(calls.floor[0].skipRecall, undefined);
    assert.equal(calls.paint.length, 1);
    assert.deepEqual(calls.paint[0].caption, { ...caption, slot: 1 });
    assert.equal(calls.paint[0].size, '1216x832');
    assert.ok(current.includes('[igs-img:1]'));
    assert.ok(current.indexOf('二段。') < current.indexOf('[igs-img:1]'));
    assert.ok(current.indexOf('[igs-img:1]') < current.indexOf('三段。'));
    assert.equal(service.getIllustrationUrl({ messageId: 5, slot: 1 }), 'data:image/png;base64,Q0c=');
});

test('gate:illustration:service-nsfw-off-never-rolls-interlude', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { interludeEnabled: true, interludeProbability: 100 } });
    await createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore(), random: () => 0 }).processMessage(5);
    assert.equal(fake.calls.llm + fake.calls.nai, 0);
});

test('gate:illustration:service-interlude-probability-gate', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    for (const [probability, selected] of [[30, false], [60, true]]) {
        const store = createMemoryIllustrationStore();
        const fake = makeFakes({ text: SFW_TEXT, settings: { interludeEnabled: true, interludeProbability: probability } });
        await createAutoIllustrationService({ ...fake, store, random: () => 0.5 }).processMessage(5);
        assert.equal(fake.calls.llm, selected ? 1 : 0);
        if (!selected) assert.equal((await store.getFloor('c1|5|0')).kind, 'none');
    }
});

test('gate:illustration:service-none-decision-reuses-and-refreshes-inputs', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const config = { interludeEnabled: true, interludeProbability: 30 };
    const fake = makeFakes({ text: SFW_TEXT, settings: config });
    const store = createMemoryIllustrationStore();
    let rolls = 0;
    const service = createAutoIllustrationService({ ...fake, store, random: () => { rolls++; return 0.999999; } });
    assert.equal((await service.processMessage(5)).reason, 'not-selected');
    assert.equal((await service.processMessage(5)).reason, 'already-decided');
    assert.equal(rolls, 1, '相同决策不重复掷概率');
    config.interludeProbability = 100;
    assert.equal((await service.processMessage(5)).ok, true);
    assert.equal(fake.calls.nai, 1, '概率改为 100 后重评并出图');
    await service.processMessage(5);
    assert.equal(fake.calls.nai, 1, '已有图不重复生成');
    const presetFake = makeFakes({ text: '[igs-cg:预置]\n' + SFW_TEXT,
        settings: { interludeEnabled: true, interludeProbability: 100 } });
    let eventCgs = { 预置: { url: 'preset.png', keywords: [] } };
    const presetService = createAutoIllustrationService({ ...presetFake, store: createMemoryIllustrationStore(),
        getSceneAssets: () => ({ eventCgs }), random: () => 0.9 });
    assert.equal((await presetService.processMessage(5)).reason, 'not-selected');
    assert.equal((await presetService.processMessage(5)).reason, 'already-decided');
    eventCgs = {};
    assert.equal((await presetService.processMessage(5)).ok, true);
    assert.equal(presetFake.calls.nai, 1, '预置 CG 解除后不能被旧 none 封死');
});

for (const fail of [false, true]) {
    test(`gate:illustration:service-inflight-latest-${fail ? 'failure' : 'success'}`, async () => {
        const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
        const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
        const fake = makeFakes({ text: fail ? NSFW_TEXT : SFW_TEXT, settings: { nsfwEnabled: true } });
        const store = createMemoryIllustrationStore();
        let release, entered, attempts = 0;
        const started = new Promise(resolve => { entered = resolve; });
        if (fail) fake.llm.request = async () => {
            attempts++; entered(); await new Promise(resolve => { release = resolve; }); throw new Error('fixture-failure');
        };
        else {
            const put = store.putFloor.bind(store);
            store.putFloor = async (key, value) => {
                if (value.kind === 'none' && !attempts++) {
                    entered(); await new Promise(resolve => { release = resolve; });
                }
                return put(key, value);
            };
        }
        const service = createAutoIllustrationService({ ...fake, store });
        const first = service.processMessage(5);
        await started;
        fake.messageHost.setText(NSFW_TEXT + '\n正文已经落定。');
        const updated = service.processMessage(5), duplicate = service.processMessage(5);
        release();
        const results = await Promise.all([first, updated, duplicate]);
        assert.ok(results.every(result => result.ok === !fail));
        assert.equal(fake.calls.nai, fail ? 0 : 1);
        if (fail) assert.equal(attempts, 1, '失败不消费在途通知自动重发');
        else {
            assert.equal(fake.calls.llm, 1, '无需求成功结束后按最新正文处理一次');
            await service.processMessage(5);
            assert.equal(fake.calls.nai, 1);
        }
    });
}


test('gate:illustration:service-decided-floor-not-replanned', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() });
    await Promise.all([service.processMessage(5), service.processMessage(5)]);
    assert.equal(fake.calls.llm, 1);
});

test('gate:illustration:service-llm-failure-no-write', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    fake.llm.request = async () => { fake.messageHost.setText('被用户改了'); return REPLY; };
    const store = createMemoryIllustrationStore();
    assert.equal((await createAutoIllustrationService({ ...fake, store }).processMessage(5)).reason, 'stale');
    assert.equal(fake.calls.writes.length, 0);
    assert.equal((await store.getFloor('c1|5|0')).status, 'stale');
});

test('gate:illustration:service-tail-append-during-planning-still-writes', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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

test('gate:illustration:service-nai-failure-marks-slot-failed', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
        messageHost: host, llm: createSecondaryLlm(fakeLlmHost(), { fetch }), store: createMemoryIllustrationStore(),
        nai: { generate: async (slot) => { naiCalls.push(slot); return { ok: true, dataUrl: 'data:image/png;base64,x' }; } },
        getSettings: () => ({ nsfwEnabled: true, llm: { source: 'openai', endpoint: 'https://llm.example/v1', model: 'm', prompts: { illustration: 'CUSTOM' } } }),
        report: (level, message) => reports.push({ level, message }),
        minBodyChars: 0,
    });
    const first = await svc.processMessage(1);
    assert.equal(first.reason, 'plan-failed');
    assert.match(first.error, /发送状态未知，未自动补发/);
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
    const { createNaiOfficialClient, resolveNaiEndpoint, NAI_OFFICIAL_ENDPOINT } = await import('../src/generated-images/nai-official-client.js');
    const urls = [];
    const client = createNaiOfficialClient({ fetch: async (url) => { urls.push(url); return new Response('', { status: 401 }); } });
    const slot = { scene: 'room' };
    const endpoints = [
        ['', NAI_OFFICIAL_ENDPOINT],
        ['https://image.novelai.net/', NAI_OFFICIAL_ENDPOINT],
        ['https://nai.example.com', 'https://nai.example.com/ai/generate-image'],
        [' https://nai.example.com/ ', 'https://nai.example.com/ai/generate-image'],
        ['https://nai.example.com/ai', 'https://nai.example.com/ai/generate-image'],
        ['https://nai.example.com/ai/', 'https://nai.example.com/ai/generate-image'],
        ['https://nai.example.com/?via=fixture', 'https://nai.example.com/ai/generate-image?via=fixture'],
        ['https://nai.example.com/ai/generate-image', 'https://nai.example.com/ai/generate-image'],
        [' https://nai.example.com/custom/generate ', 'https://nai.example.com/custom/generate'],
        ['https://nai.example.com/x', 'https://nai.example.com/x'],
    ];
    for (const [endpoint, expected] of endpoints) {
        assert.equal(resolveNaiEndpoint(endpoint), expected);
        for (const transport of ['direct', 'st-proxy']) {
            const settings = { apiKey: 'fake-key', endpoint, transport }, before = { ...settings };
            await client.generate(slot, settings);
            assert.equal(urls.at(-1), transport === 'st-proxy' ? `/proxy/${expected}` : expected);
            assert.deepEqual(settings, before);
        }
    }
    const { resolveNaiNativeEndpoint } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    assert.equal(resolveNaiNativeEndpoint('https://nai.example.com/'), '', '通用图像接口不因内置 NAI 补全而改判来源');
});

test('gate:illustration:service-retries-database-img-marker-without-replanning', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: SFW_TEXT, settings: { interludeEnabled: true, interludeProbability: 0 } });
    const store = createMemoryIllustrationStore();
    const service = createAutoIllustrationService({ ...fake, store, random: () => 0.99 });
    assert.equal((await service.processMessage(5)).reason, 'not-selected');
    assert.equal((await service.processMessage(5, { manual: true })).reason, 'done');
    assert.equal(fake.calls.llm, 1);
});

test('gate:illustration:slot-count-mismatch-still-generates', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
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

// NSFW 场景翻过本场景的图后不提前挂下一场景的 SFW 图；进 SFW 场景后保持 NSFW 图，直到新 CG 的锚句页接管。
test('gate:illustration:nsfw-lookahead-stops-at-sfw-scene-cg', () => {
    const segments = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。'];
    const src = '[igs-scene:街道|傍晚|晴|NSFW]\n甲。\n[igs-img:1]\n乙。\n[igs-scene:客厅|傍晚|晴]\n丙。\n丁。\n[igs-img:2]\n戊。\n己。';
    assert.deepEqual(cgSlots(src, segments), [1, 1, 1, 2, 2, 2]);
    const offsets = resolveHeldSourceOffsets(src, segments);
    assert.deepEqual(prepareIllustrationPages({ source: src, offsets, segments, holdPages: 2 }).map(hit => hit ? hit.slot : 0), [1, 1, 1, 2, 2, 2]);
});

test('gate:illustration:dbgen-cg-does-not-splice-character-dna', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const text = '[igs-scene:卧室|夜晚|晴|NSFW]\n[igs-char:小雪|开心|一段。]\n二段。\n三段。';
    let current = text;
    const caption = {
        v4_prompt: { caption: { base_caption: 'room', char_captions: [{ char_caption: 'smile', centers: [{ x: 0.5, y: 0.5 }] }] } },
        v4_negative_prompt: { caption: { base_caption: 'bad', char_captions: [] } },
    };
    const paint = [];
    const service = createAutoIllustrationService({
        messageHost: {
            getChatId: () => 'c1',
            readFloor: () => ({ chatId: 'c1', messageId: 5, swipeId: 0, isAi: true, isLatest: true, text: current }),
            readPreviousAiTexts: () => [],
            writeFloor: async (_id, next) => { current = next; return { ok: true }; },
            on: () => () => {}, attachPromptStrip: () => {},
            ensureMarkerRegexes: async () => ({ ok: true }), destroy: () => {},
        },
        llm: { request: async () => '' },
        nai: {
            describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            generate: async () => ({ ok: true }),
            writeDbgenFloorPrompts: async () => ({ ok: true, captions: [{ slotId: 1, caption, anchorSentence: '二段。' }] }),
            generateDbgenCaption: async (req) => { paint.push(req); return { ok: true, dataUrl: 'data:image/png;base64,Q0c=' }; },
        },
        events: { emit() {} },
        store: createMemoryIllustrationStore(),
        getSettings: () => ({ nsfwEnabled: true, nsfwCount: 1 }),
        getSceneAssets: () => ({
            characters: { 小雪: {} },
            characterAliases: {},
            characterDna: { 小雪: { triggerWords: 'xiaoxue', identity: '1girl, white hair', negative: 'short hair' } },
        }),
        minBodyChars: 0,
    });
    assert.equal((await service.processMessage(5)).reason, 'done');
    assert.equal(paint.length, 1);
    assert.equal(paint[0].caption.v4_prompt.caption.char_captions[0].char_caption, 'smile');
    assert.equal(paint[0].caption.v4_negative_prompt.caption.char_captions.length, 0);
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
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const fake = makeFakes({ text: NSFW_TEXT, settings: { nsfwEnabled: true } });
    const head = '<parallel>与此同时，另一边……</parallel>\n';
    fake.llm.request = async () => { fake.messageHost.setText(head + NSFW_TEXT); return REPLY; };
    const store = createMemoryIllustrationStore();
    const result = await createAutoIllustrationService({ ...fake, store }).processMessage(5);
    assert.equal(result.ok, true);
    assert.equal(fake.calls.writes.length, 1);
    assert.ok(fake.calls.writes[0].startsWith(head), '插件插的内容原样保留');
    assert.ok(fake.calls.writes[0].includes('\n二段。\n[igs-img:1]'));
    assert.equal(fake.calls.nai, 1);
});

test('gate:illustration:transplant-markers-follows-context', async () => {
    const { transplantMarkers } = await import('../src/generated-images/illustration/marker-placer.js');
    const moved = transplantMarkers('甲段落一句。\n[igs-img:1]\n乙段落二句。\n丙三。\n[igs-img:2]', '【平行事件】别处。\n甲段落一句。\n乙段落二句改过。\n丙三。\n<状态栏>');
    assert.deepEqual(moved.slots, [1, 2]);
    assert.equal(moved.text, '【平行事件】别处。\n甲段落一句。\n[igs-img:1]\n乙段落二句改过。\n丙三。\n[igs-img:2]\n<状态栏>');
    assert.deepEqual(transplantMarkers('甲。\n[igs-img:1]\n乙。', '完全不同的内容').slots, []);
});

test('gate:illustration:backfill-old-floor-only-when-enabled-and-not-yet-decided', async () => {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const off = makeFakes({ text: NSFW_TEXT, isLatest: false, settings: { nsfwEnabled: true } });
    assert.equal((await createAutoIllustrationService({ ...off, store: createMemoryIllustrationStore() }).processMessage(5, { backfill: true })).reason, 'disabled', '开关默认关');
    assert.equal(off.calls.llm + off.calls.nai, 0);
    const fake = makeFakes({ text: NSFW_TEXT, isLatest: false, settings: { nsfwEnabled: true, nsfwCount: 1, backfillOldFloors: true } });
    const service = createAutoIllustrationService({ ...fake, store: createMemoryIllustrationStore() });
    assert.equal((await service.processMessage(5)).reason, 'not-eligible', '自动出图仍只认最新楼');
    assert.equal((await service.processMessage(5, { backfill: true })).reason, 'done');
    assert.ok(fake.calls.writes[0].includes('[igs-img:1]'));
    assert.equal((await service.processMessage(5, { backfill: true })).reason, 'already-decided', '补过的楼不再画');
    assert.equal(fake.calls.nai, 1);
});

test('gate:cg-bindings:real-slot-ids-and-metadata-survive-generation', async () => {
    for (const count of [2, 3]) {
        const run = await runBoundCgFixture((f) => [
            { slotId: 7, caption: f.caption, characterMeta: f.characterMeta, anchorSentence: '三段。' },
            { slotId: 6, caption: f.caption, characterMeta: f.characterMeta, anchorSentence: '二段。' },
        ], count);
        assert.equal(run.result.ok, true);
        assert.equal(run.writes.length, 1);
        assert.equal(run.writes[0].characterContext.length, count);
        assert.equal(run.fake.calls.llm, 0);
        const records = await run.store.getSlots('c1|5|0');
        assert.deepEqual(records.map((r) => r.slot), [6, 7]);
        assert.deepEqual(records[0].characterMeta, run.paints[0].characterMeta);
        assert.deepEqual(records[0].caption, run.paints[0].caption);
        assert.deepEqual(records[0].originalSize, { width: 1216, height: 832 });
        assert.match(run.fake.calls.writes[0], /\[igs-img:6\]/);
        assert.match(run.fake.calls.writes[0], /\[igs-img:7\]/);
    }
});

test('gate:cg-bindings:missing-duplicate-id-and-invalid-meta-do-not-paint', async () => {
    for (const entries of [
        (f) => [{ caption: f.caption, anchorSentence: '二段。' }],
        (f) => [6, 6].map((slotId) => ({ slotId, caption: f.caption, anchorSentence: '二段。' })),
        (f) => [{ slotId: 6, caption: f.caption, anchorSentence: '二段。', characterMeta: { version: 2 } }],
        (f) => [{ slotId: 6, caption: f.caption, anchorSentence: '' }],
    ]) {
        const run = await runBoundCgFixture(entries);
        assert.equal(run.result.ok, false);
        assert.equal(run.paints.length, 0);
        assert.equal(run.fake.calls.writes.length, 0);
    }
    const legacy = await runBoundCgFixture((f) => [{ slotId: 6, caption: f.caption, anchorSentence: '二段。' }]);
    assert.equal(legacy.result.ok, true);
    assert.equal((await legacy.store.getSlots('c1|5|0'))[0].characterMeta, undefined);
});


test('gate:cg-bindings:outfit-snapshot-follows-anchor-and-nearest-floor', async () => {
    const { cgCharacterState } = await import('../src/generated-images/illustration/cg-character-bindings.js');
    const f = cgBindingFixture();
    f.assets.characterOutfits = { Alice: { Coat: { words: [], moods: {}, wardrobe: 'coat' }, Dress: { words: [], moods: {}, wardrobe: 'dress' } } };
    f.assets.wardrobe = { coat: { prompt: 'A blue coat.' }, dress: { prompt: 'A white dress.' } };
    const text = '[igs-scene:Cafe|day|sunny]\n[igs-char:A|smile|Coat|Hello]\nFirst moment.\n[igs-char:A|smile|Dress|Later]\nSecond moment.';
    const state = cgCharacterState(text, f.names, f.assets);
    assert.equal(state.at(text.indexOf('First moment.') + 13)[0].outfit.name, 'Coat');
    assert.equal(state.at(Infinity)[0].outfit.name, 'Dress');
    const inherited = cgCharacterState('No new outfit.', f.names, f.assets,
        ['[igs-char:A|smile|Coat|Old]', '[igs-char:A|smile|Dress|Recent]']);
    assert.equal(inherited.context[0].outfit.description, 'A white dress.');
    f.assets.characterDna.Alice.defaultAppearance = 'A default hoodie.';
    f.assets.characterDefaultOutfits = { Alice: { version: 1, outfitName: 'Coat' } };
    const changed = cgCharacterState('[igs-char:A|smile|浴衣|Changed]', f.names, f.assets);
    assert.deepEqual(changed.context[0].outfit, { name: '浴衣', description: '' }, '明确新衣装不能回退默认');
    assert.equal(changed.timeline[0].outfit.name, '浴衣');
    const continued = cgCharacterState('Next floor.', f.names, f.assets, ['[igs-char:A|smile|浴衣|Changed]']);
    assert.equal(continued.context[0].outfit.name, '浴衣');
    const registered = cgCharacterState('[igs-char:A|smile|Dress|Saved]', f.names, f.assets);
    assert.deepEqual(registered.context[0].outfit, { name: 'Dress', description: 'A white dress.' });
    const reset = cgCharacterState('[igs-char:A|smile|默认|Reset]', f.names, f.assets);
    assert.deepEqual(reset.context[0].outfit, { name: 'Coat', description: 'A blue coat.' });
    assert.equal(cgCharacterState('No change.', f.names, f.assets).context[0].outfit.description, 'A blue coat.');
    const anchor = (s, offset = 10000) => s.anchorAt(offset, ['A']).characters[0];
    assert.deepEqual(anchor(registered), { characterKey: 'Alice', requestedOutfit: 'Dress', effectiveOutfit: 'Dress',
        requirementSource: 'tag', source: 'tag', reason: '' });
    assert.deepEqual(anchor(continued), { characterKey: 'Alice', requestedOutfit: '浴衣', effectiveOutfit: '浴衣',
        requirementSource: 'inherited', source: 'tag', reason: 'outfit-unregistered' });
    assert.deepEqual(anchor(reset), { characterKey: 'Alice', requestedOutfit: '默认', effectiveOutfit: 'Coat',
        requirementSource: 'tag', source: 'reset', reason: '' });
    const inferred = cgCharacterState('No outfit tag.', f.names, f.assets, [], () => ({ profile: ['Dress'] }));
    assert.deepEqual(anchor(inferred), { characterKey: 'Alice', requestedOutfit: '', effectiveOutfit: 'Dress',
        requirementSource: 'none', source: 'profile', reason: '', inferredOutfit: 'Dress' });
    assert.deepEqual(anchor(cgCharacterState('No change.', f.names, f.assets)), {
        characterKey: 'Alice', requestedOutfit: '', effectiveOutfit: 'Coat',
        requirementSource: 'none', source: 'default', reason: '',
    });
    assert.equal(anchor(state, text.indexOf('First moment.') + 13).effectiveOutfit, 'Coat');
    const { completedCgOutfitAnchor } = await import('../src/generated-images/illustration/cg-character-bindings.js');
    const request = { outfitAnchor: changed.anchorAt(10000, ['A']) };
    const before = structuredClone(request);
    const result = { ok: true, outfitSnapshot: { version: 1, characters: [
        { characterKey: 'Alice', name: '浴衣', description: 'A festival yukata.' },
    ] } };
    const completed = completedCgOutfitAnchor(request, result);
    assert.deepEqual(completed.outfitAnchor.characters[0], { ...before.outfitAnchor.characters[0],
        effectiveOutfit: '浴衣', effectiveSource: 'snapshot' });
    assert.deepEqual(request, before, '完成证据不改写请求锚点');
    assert.deepEqual(completedCgOutfitAnchor({}, result), {}, '旧CG不自动补锚点');
    assert.deepEqual(completedCgOutfitAnchor({ ...request, promptEdited: true }, result), {}, '手改final不重解释');
    assert.deepEqual(completedCgOutfitAnchor(request, { ok: false }), {}, '失败不记录为已采用');
});

test('gate:cg-bindings:parser-default-center-is-not-explicit-position', async () => {
    const { parseIllustrationPlan } = await import('../src/generated-images/illustration/planner-parser.js');
    const parsed = parseIllustrationPlan('scene: Cafe.\nchar: Alice | 0.3,0.5 | Alice smiles.\nchar: Bob smiles.\nchar: Carol | 9,0.5 | Carol smiles.');
    assert.deepEqual(parsed.slots[0].chars.map((c) => c.positionExplicit), [true, false, false]);
});

async function runBoundCgFixture(entries, count = 2) {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryIllustrationStore } = await import('../src/media/illustration-store.js');
    const f = cgBindingFixture(count);
    const fake = makeFakes({ text: NSFW_TEXT + '\n' + f.names.map((name) => `[igs-char:${name}|smile|Hello]`).join('\n'), settings: { nsfwEnabled: true, nsfwCount: 2 } });
    const writes = [], paints = [];
    fake.nai.describe = () => ({ via: 'dbgen', ready: { ok: true } });
    fake.nai.writeDbgenFloorPrompts = async (req) => { writes.push(req); return { ok: true, captions: entries(f) }; };
    fake.nai.generateDbgenCaption = async (req) => { paints.push(req); return { ok: true, dataUrl: 'data:image/png;base64,Q0c=', caption: req.caption, characterMeta: req.characterMeta }; };
    const store = createMemoryIllustrationStore();
    const result = await createAutoIllustrationService({ ...fake, store, getSceneAssets: () => f.assets }).processMessage(5);
    return { result, store, writes, paints, fake };
}

function cgBindingFixture(count = 2) {
    const names = ['Alice', 'Bob', 'Carol'].slice(0, count);
    const caption = { v4_prompt: { caption: { base_caption: 'Friends meet in a cafe.',
        char_captions: names.map((name, i) => ({ char_caption: `${name} smiles.`, centers: [{ x: (i + 1) / (count + 1), y: 0.5 }] })) } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } } };
    const characterMeta = { version: 1, characters: names.map((name, i) => ({ characterKey: name, captionIndex: i,
        identityAnchor: `${name} has fixed features.`, signatureDetails: 'A small mole.',
        outfit: { name: 'Coat', description: 'A blue coat.' },
        centers: caption.v4_prompt.caption.char_captions[i].centers, positionExplicit: true })).reverse() };
    const assets = { characters: Object.fromEntries(names.map((name) => [name, { 默认: `igs-gen:${name}` }])),
        characterAliases: { Alice: ['A'] }, characterDna: Object.fromEntries(names.map((name) => [name, { identity: `${name} identity.`, negative: `${name} wrong identity.` }])) };
    return { names, caption, characterMeta, assets };
}

test('gate:cg-bindings:two-and-three-characters-bind-by-key-not-array-order', async () => {
    const { bindCgCaption } = await import('../src/generated-images/illustration/cg-character-bindings.js');
    const { buildCharacterContext } = await import('../src/scene/character-identity.js');
    for (const count of [2, 3]) {
        const f = cgBindingFixture(count);
        const context = buildCharacterContext(['A', ...f.names], f.assets);
        assert.equal(context.length, count);
        const bound = bindCgCaption(f.caption, f.characterMeta, context, f.assets);
        assert.equal(bound.ok, true);
        for (const binding of bound.characterMeta.characters) {
            assert.equal(binding.identityAnchor, `${binding.characterKey} identity.`);
            assert.match(bound.caption.v4_prompt.caption.char_captions[binding.captionIndex].char_caption, new RegExp(binding.characterKey + ' identity'));
        }
        assert.equal(JSON.stringify(bound.caption).includes('characterKey'), false);
        assert.equal(f.caption.v4_prompt.caption.char_captions[0].char_caption, 'Alice smiles.');
        const bad = structuredClone(f.characterMeta);
        bad.characters[0].characterKey = 'Unknown';
        assert.equal(bindCgCaption(f.caption, bad, context, f.assets).ok, false);
        bad.characters[0] = { ...bad.characters[1] };
        assert.equal(bindCgCaption(f.caption, bad, context, f.assets).ok, false);
        assert.equal(bindCgCaption(f.caption, undefined, context, f.assets).characterMeta, undefined);
    }
});

test('gate:cg-reference:canvas-budget-unmasked-inset-and-outside-rgba', async () => {
    const { planReferenceCanvas, buildReferencePixels, composeReferencePixels } = await import('../src/media/cg-reference-canvas.js');
    const image = (width, height, rgba) => ({ width, height, data: new Uint8ClampedArray(Array.from({ length: width * height }, () => rgba).flat()) });
    for (const [width, height] of [[128, 64], [64, 128], [1216, 832]]) {
        const meta = { characters: ['A', 'B'].map((characterKey, i) => ({ characterKey, positionExplicit: true, centers: [{ x: i ? 0.75 : 0.25, y: 0.5 }] })) };
        const plan = planReferenceCanvas(width, height, meta, 'A');
        assert.equal(plan.ok, true);
        assert.equal(plan.size.width % 64 + plan.size.height % 64, 0);
        assert.ok(plan.size.width * plan.size.height <= 1024 * 1024);
        const source = image(width, height, [12, 24, 36, 127]);
        const ref = image(16, 32, [200, 100, 0, 128]);
        const work = buildReferencePixels(source, ref, plan);
        assert.equal(plan.reference.x, Math.floor(plan.size.width * 0.75));
        assert.equal(plan.reference.y, 0);
        assert.equal(plan.reference.x + plan.reference.width, plan.size.width);
        assert.equal(plan.reference.height, plan.size.height);
        let white = 0, soft = 0;
        for (let y = 0; y < plan.size.height; y++) for (let x = 0; x < plan.size.width; x++) {
            const at = (y * plan.size.width + x) * 4;
            const v = work.mask.data[at];
            white += v === 255;
            soft += v > 0 && v < 255;
            assert.deepEqual([...work.mask.data.subarray(at, at + 4)], [v, v, v, 255]);
            assert.ok(v === 0 || v === 255, '输入蒙版只含黑白值，不含羽化或抗锯齿灰度');
            if (x >= plan.reference.x) assert.equal(v, 0, '参考区不遮罩');
            else {
                assert.deepEqual(work.image.data.subarray(at, at + 4), source.data.subarray(0, 4), '工作区留白延续 CG 像素');
                const m = plan.uploadMask;
                const inside = x >= m.x && x < m.right && y >= m.y && y < m.bottom;
                assert.equal(v, inside ? 255 : 0, '上传蒙版仅覆盖对齐后的完整工作网格');
                if (x >= plan.work.width || y >= plan.work.height) assert.equal(v, 0, '取整延展不开放重绘');
            }
        }
        assert.ok(white > 0);
        assert.equal(soft, 0, '输入蒙版没有灰度过渡');
        const generated = image(plan.size.width, plan.size.height, [255, 0, 0, 255]);
        for (let y = 0; y < generated.height; y++) for (let x = plan.reference.x; x < generated.width; x++)
            generated.data.set([0, 255, 255, 255], (y * generated.width + x) * 4);
        const candidate = composeReferencePixels(source, generated, plan);
        assert.deepEqual([candidate.width, candidate.height], [width, height]);
        let changed = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const bounds = plan.rect;
            const outside = x < bounds.x || x >= bounds.right || y < bounds.y || y >= bounds.bottom;
            if (outside) assert.deepEqual(candidate.data.subarray(i, i + 4), source.data.subarray(i, i + 4));
            else changed += candidate.data[i] !== source.data[i];
            assert.ok(candidate.data[i + 1] <= 24, '辅助参考区颜色不进入 CG');
            assert.equal(candidate.data[i + 3], source.data[i + 3]);
        }
        const { rect } = plan;
        for (const [x, y] of [[rect.x, rect.y], [rect.right - 1, rect.y],
            [rect.x, rect.bottom - 1], [rect.right - 1, rect.bottom - 1]]) {
            const i = (y * width + x) * 4;
            assert.deepEqual(candidate.data.subarray(i, i + 4), source.data.subarray(i, i + 4), '圆角不覆盖原矩形角点');
        }
        const edgeArtifact = image(plan.size.width, plan.size.height, [12, 24, 36, 255]);
        for (let at = 0; at < work.mask.data.length; at += 4) {
            if (work.mask.data[at] === 0) edgeArtifact.data.set([255, 220, 160, 255], at);
        }
        const guarded = composeReferencePixels(source, edgeArtifact, plan);
        assert.ok(edgeArtifact.data.some((v, at) => at % 4 === 0 && v === 255),
            '夹具实际包含高对比度边缘伪影');
        assert.deepEqual(guarded.data, source.data,
            '黑色蒙版上下文、取整延展和参考区不贴回 CG');
        const midX = Math.floor((rect.x + rect.right) / 2), midY = Math.floor((rect.y + rect.bottom) / 2);
        const blendFeather = Math.max(1, Math.min(12, Math.min(rect.right - rect.x, rect.bottom - rect.y) * 0.02));
        const edgePaths = [
            (d) => [rect.x + d, midY], (d) => [rect.right - 1 - d, midY],
            (d) => [midX, rect.y + d], (d) => [midX, rect.bottom - 1 - d],
        ];
        for (const pointAt of edgePaths) {
            let previous = 12;
            for (let d = 0; d <= Math.ceil(blendFeather) + 2; d++) {
                const [x, y] = pointAt(d), at = (y * width + x) * 4;
                const red = candidate.data[at];
                assert.ok(red >= previous, '四边从原图向重绘图单调渐变');
                assert.ok(red <= 255);
                assert.equal(candidate.data[at + 3], 127, '混合不改变原透明度');
                previous = red;
            }
            const mixed = Array.from({ length: Math.ceil(blendFeather) + 1 }, (_, d) => {
                const [x, y] = pointAt(d);
                return (y * width + x) * 4;
            }).find((at) => candidate.data[at] > 12 && candidate.data[at] < 255
                && candidate.data[at + 1] > 0 && candidate.data[at + 1] < 24);
            // 最小窄带可能没有分数栅格；其余情况核验实际分数权重。
            if (mixed !== undefined) assert.ok(candidate.data[mixed + 1] > 0 && candidate.data[mixed + 1] < 24);
            else assert.ok(blendFeather <= 1 + 1 / plan.scale, '仅窄带小于采样跨度时允许无分数权重');
            const d = Math.ceil(blendFeather + 1 / plan.scale) + 1;
            const [bx, by] = pointAt(d), insideAt = (by * width + bx) * 4;
            assert.deepEqual([...candidate.data.subarray(insideAt, insideAt + 4)], [255, 0, 0, 127],
                '窄带及采样误差之后完整采用结果，不保留旧宽带成分');
        }
        const centerAt = (midY * width + midX) * 4;
        assert.deepEqual([...candidate.data.subarray(centerAt, centerAt + 4)], [255, 0, 0, 127], '中心不整图降透明度');
        assert.deepEqual([...source.data.subarray(centerAt, centerAt + 4)], [12, 24, 36, 127], '合成不修改输入原图');
        assert.ok(changed > 0);
        assert.equal(planReferenceCanvas(width, height, { characters: [{ characterKey: 'A', centers: [{ x: 0.5, y: 0.5 }] }] }, 'A').ok, false);
    }
    const width = 256, height = 256;
    const source = image(width, height, [12, 24, 36, 127]), ref = image(16, 32, [0, 255, 255, 255]);
    const cases = [
        { region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, bounds: { x: 64, y: 64, right: 192, bottom: 192 } },
        { region: { x: 0.05, y: 0.25, width: 0.5, height: 0.5 }, bounds: { x: 12, y: 64, right: 141, bottom: 192 } },
        { region: { x: 0.45, y: 0.25, width: 0.5, height: 0.5 }, bounds: { x: 115, y: 64, right: 244, bottom: 192 } },
        { region: { x: 0.25, y: 0.05, width: 0.5, height: 0.5 }, bounds: { x: 64, y: 12, right: 192, bottom: 141 } },
        { region: { x: 0.25, y: 0.45, width: 0.5, height: 0.5 }, bounds: { x: 64, y: 115, right: 192, bottom: 244 } },
        { region: { x: 0, y: 0, width: 1, height: 1 }, bounds: { x: 0, y: 0, right: 256, bottom: 256 } },
    ];
    for (const { region, bounds } of cases) {
        const plan = planReferenceCanvas(width, height, { characters: [{ characterKey: 'A', region }] }, 'A');
        assert.equal(plan.ok, true);
        assert.deepEqual(plan.rect, bounds, '重绘和回贴均使用原角色粗区域');
        const margin = Math.ceil(Math.min(width, height) * 0.1);
        assert.deepEqual(plan.crop, { x: Math.max(0, bounds.x - margin), y: Math.max(0, bounds.y - margin),
            right: Math.min(width, bounds.right + margin), bottom: Math.min(height, bounds.bottom + margin),
            width: Math.min(width, bounds.right + margin) - Math.max(0, bounds.x - margin),
            height: Math.min(height, bounds.bottom + margin) - Math.max(0, bounds.y - margin) });
        const work = buildReferencePixels(source, ref, plan);
        const generated = image(plan.size.width, plan.size.height, [255, 0, 0, 255]);
        const edgeArtifact = image(plan.size.width, plan.size.height, [12, 24, 36, 255]);
        for (let at = 0; at < work.mask.data.length; at += 4) {
            if (work.mask.data[at] === 0) edgeArtifact.data.set([255, 220, 160, 255], at);
        }
        assert.deepEqual(composeReferencePixels(source, edgeArtifact, plan).data, source.data,
            '内部与触边规划均隔离黑色蒙版及参考区伪影');
        const candidate = composeReferencePixels(source, generated, plan);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            if (x < bounds.x || x >= bounds.right || y < bounds.y || y >= bounds.bottom)
                assert.deepEqual(candidate.data.subarray(at, at + 4), source.data.subarray(at, at + 4));
            assert.equal(candidate.data[at + 3], 127);
        }
        const midX = Math.floor((bounds.x + bounds.right) / 2), midY = Math.floor((bounds.y + bounds.bottom) / 2);
        for (const [x, y] of [[bounds.x, midY], [bounds.right - 1, midY],
            [midX, bounds.y], [midX, bounds.bottom - 1]]) {
            const at = (y * width + x) * 4;
            assert.deepEqual(candidate.data.subarray(at, at + 4), source.data.subarray(at, at + 4),
                '四侧统一保留边缘原像素，包括真正触及整图边缘的区域');
        }
    }
});

test('gate:cg-reference:统一采样原图条件网格与细区覆盖', async (t) => {
    const { planReferenceCanvas, buildReferencePixels, composeReferencePixels, referenceCanvasCenter } = await import('../src/media/cg-reference-canvas.js');
    const cases = [[128, 64, { x: 0.13, y: 0.17, width: 0.51, height: 0.67 }],
        [64, 128, { x: 0, y: 0, width: 1, height: 1 }],
        [256, 256, { x: 0.49, y: 0.2, width: 1 / 256, height: 0.6 }],
        [1216, 832, { x: 0, y: 0, width: 1, height: 1 }],
        [832, 1216, { x: 0.3, y: 0.2, width: 0.5, height: 0.7 }]];
    const errors = [];
    for (const [width, height, region] of cases) {
        const meta = { characters: [{ characterKey: 'A', region }] }, originalMeta = structuredClone(meta);
        const plan = planReferenceCanvas(width, height, meta, 'A');
        assert.equal(plan.ok, true);
        assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.uploadMask));
        const { crop, work, size, rect, scale, uploadMask: m } = plan;
        assert.ok(size.width * size.height <= 1024 * 1024);
        assert.equal(size.width % 64 + size.height % 64, 0);
        assert.equal([m.x, m.y, m.right, m.bottom, work.width, work.height, plan.reference.x].reduce((sum, v) => sum + v % 8, 0), 0);
        assert.ok(m.right <= work.width && m.bottom <= work.height && work.width <= plan.reference.x && work.height <= size.height);
        const source = { width, height, data: new Uint8ClampedArray(width * height * 4) };
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
            source.data.set([x % 251, y % 251, (x + y) % 251, 127 + x % 128], (y * width + x) * 4);
        const before = new Uint8ClampedArray(source.data);
        const ref = { width: 16, height: 32, data: new Uint8ClampedArray(16 * 32 * 4) };
        for (let i = 3; i < ref.data.length; i += 4) ref.data[i] = 255;
        const built = buildReferencePixels(source, ref, plan);
        let white = 0;
        for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
            const at = (y * size.width + x) * 4, masked = x >= m.x && x < m.right && y >= m.y && y < m.bottom;
            assert.equal(built.mask.data[at], masked ? 255 : 0);
            assert.equal(built.mask.data[at + 1], built.mask.data[at]);
            assert.equal(built.mask.data[at + 2], built.mask.data[at]);
            assert.equal(built.mask.data[at + 3], 255);
            if (masked) white++;
            if (x >= plan.reference.x) continue;
            const sx = Math.min(crop.right - 1, Math.floor(crop.x + (Math.min(x, work.width - 1) + 0.5) / scale));
            const sy = Math.min(crop.bottom - 1, Math.floor(crop.y + (Math.min(y, work.height - 1) + 0.5) / scale));
            const from = (sy * width + sx) * 4;
            for (let k = 0; k < 4; k++) assert.equal(built.image.data[at + k], before[from + k], '蒙版内外均保留同映射原 CG，透明参考不覆盖工作区');
        }
        assert.ok(white >= 64, '细区不能在缩放或网格化时丢失');
        let maxError = 0;
        for (let y = rect.y; y < rect.bottom; y++) for (let x = rect.x; x < rect.right; x++) {
            const wx = Math.floor((x - crop.x + 0.5) * scale), wy = Math.floor((y - crop.y + 0.5) * scale);
            assert.equal(built.mask.data[(wy * size.width + wx) * 4], 255, '原支持区对应的完整工作格均被覆盖');
            const sx = Math.min(crop.right - 1, Math.floor(crop.x + (wx + 0.5) / scale));
            const sy = Math.min(crop.bottom - 1, Math.floor(crop.y + (wy + 0.5) / scale));
            maxError = Math.max(maxError, Math.abs(sx - x), Math.abs(sy - y));
        }
        assert.ok(maxError <= Math.ceil(0.5 / scale + 0.5));
        errors.push({ width, height, scale, maxError });
        const point = { x: (rect.x + rect.right) / 2 / width, y: (rect.y + rect.bottom) / 2 / height };
        const center = referenceCanvasCenter(plan, point);
        assert.ok(center);
        assert.ok(Math.abs(crop.x + center.x * size.width / scale - point.x * width) < 1e-9);
        assert.ok(Math.abs(crop.y + center.y * size.height / scale - point.y * height) < 1e-9);
        assert.equal(referenceCanvasCenter(plan, { x: NaN, y: 0.5 }), null);
        const generated = { ...size, data: new Uint8ClampedArray(built.image.data.length).fill(255) };
        const composed = composeReferencePixels(source, generated, plan);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            assert.equal(composed.data[at + 3], before[at + 3]);
            if (x >= rect.x && x < rect.right && y >= rect.y && y < rect.bottom) continue;
            for (let k = 0; k < 4; k++) assert.equal(composed.data[at + k], before[at + k], '网格扩张不扩大原图回贴范围');
        }
        assert.deepEqual(source.data, before);
        assert.deepEqual(meta, originalMeta);
    }
    assert.ok(errors.some(e => e.maxError > 0), '缩放往返存在实际采样误差，不冒报像素恒等');
    t.diagnostic('原图像素采样往返误差：' + JSON.stringify(errors));
});


test('gate:cg-reference:窄带精确权重薄线与错位轮廓', async () => {
    const { planReferenceCanvas, buildReferencePixels, composeReferencePixels } = await import('../src/media/cg-reference-canvas.js');
    const width = 192, height = 128;
    const plan = planReferenceCanvas(width, height, { characters: [{ characterKey: 'A', region: { x: 0, y: 0, width: 1, height: 1 } }] }, 'A');
    assert.equal(plan.scale, 1, '隔离缩放误差以精确核验回贴权重');
    const source = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
        source.data.set([x === 8 ? 0 : 60 + Math.floor(x / 4), 80 + Math.floor(y / 8), 120, 127], (y * width + x) * 4);
    const baseline = new Uint8ClampedArray(source.data);
    const ref = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(255) };
    const generated = buildReferencePixels(source, ref, plan).image;
    for (let y = 0; y < generated.height; y++) for (let x = 0; x < generated.width; x++)
        generated.data.set(x >= plan.reference.x ? [255, 0, 255, 255]
            : [x === 12 || x === 22 ? 0 : 180 + Math.floor(x / 8), 40 + Math.floor(y / 8), 80, 255], (y * generated.width + x) * 4);
    const generatedBefore = new Uint8ClampedArray(generated.data), result = composeReferencePixels(source, generated, plan);
    const y = height / 2, feather = Math.max(1, Math.min(12, height * 0.02));
    const weight = d => { const t = Math.min(1, Math.max(0, d / feather)); return Math.round(255 * t * t * (3 - 2 * t)) / 255; };
    for (let x = 0; x < 32; x++) {
        const at = (y * width + x) * 4, from = (y * generated.width + x) * 4, blend = weight(x);
        for (let k = 0; k < 3; k++) assert.equal(result.data[at + k], Math.round(baseline[at + k] * (1 - blend) + generated.data[from + k] * blend));
        assert.equal(result.data[at + 3], 127);
    }
    for (const x of [8, 12, 22]) {
        const at = (y * width + x) * 4, from = (y * generated.width + x) * 4;
        assert.deepEqual(result.data.subarray(at, at + 3), generated.data.subarray(from, from + 3), '内区仅采用候选轮廓与一像素细线');
    }
    const oldT = 8 / (height * 0.16), oldBlend = Math.round(255 * oldT * oldT * (3 - 2 * oldT)) / 255;
    const at = (y * width + 8) * 4, from = (y * generated.width + 8) * 4;
    assert.ok(Math.round(baseline[at] * (1 - oldBlend) + generated.data[from] * oldBlend) < result.data[at], '同一候选下，旧宽带会在此内区保留原轮廓成分');
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
        const at = (y * width + x) * 4;
        assert.deepEqual(result.data.subarray(at, at + 4), baseline.subarray(at, at + 4), '原圆角支持范围保持');
    }
    assert.deepEqual(source.data, baseline);
    assert.deepEqual(generated.data, generatedBefore);
    assert.throws(() => composeReferencePixels(source, { ...generated, width: generated.width + 1 }, plan), /cg-result-size-mismatch/);
});



async function consistencyFixture(count = 2, storeOverride) {
    const { createAutoIllustrationService, fixtureMedia } = await import('./helpers/media-fixtures.js');
    const mediaCache = fixtureMedia();
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
        async encodePixels(value) {
            const id = 'data:image/png;base64,' + Buffer.from(`pixels-${++encoded}`).toString('base64');
            pixels.set(id, value);
            return id;
        },
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
    const backend = { describeEdit: (_bridge, request = {}) => ({ supported: true, via: 'dbgen', model: request.model,
        infillImg2imgStrength: 1, appearanceCorrection: 1, infillModelNegotiation: 1 }),
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
    const service = createAutoIllustrationService({ store, nai: backend, imageCodec: codec, mediaCache,
        getSettings: () => igsSettings, getSceneAssets: () => assets,
        report: (level, message) => { reports.push({ level, message }); jobLog.add(level, message); },
        resolveCgReference: async (name, snapshot) => { references.push(name); return snapshot.characters[name]?.默认 || ''; },
        messageHost: { readFloor: () => floor, getChatId: () => floor.chatId, destroy() {} },
        events: { emit: (name, detail) => events.push({ name, detail }) },
    });
    return { store, mediaCache, floor, key, pixels, codec, names, assets, before, calls, writes, references, events, backend, service, reports, jobLog, logStorage, igsSettings,
        query: { chatId: floor.chatId, messageId: 5, swipeId: 0, slot: 7 } };
}

for (const code of ['PROMPT_LLM_UNSET', 'NAI_429', 'WORKBENCH_CAPTION_INVALID', 'DBGEN_PROMPT_EXCEPTION']) {
    test(`gate:cg-consistency:写词失败保留安全诊断-${code}`, async () => {
        const { createImageBackend } = await import('../src/generated-images/image-backend.js');
        const { createImageJobLog } = await import('../src/generated-images/image-job-log.js');
        const f = await consistencyFixture(), requests = [];
        const adapter = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
            global: { NaiDbGen: { getPromptCapabilities: () => ({ providedPromptContext: 1 }),
                async generate() { assert.fail('写词失败不得生图'); },
                async generateSinglePrompt(req) {
                    requests.push(req);
                    if (code === 'DBGEN_PROMPT_EXCEPTION') throw new Error('PRIVATE-REPLY-KEY');
                    return { ok: false, error: { code, message: 'PRIVATE-REPLY-KEY', hint: 'PRIVATE-HINT',
                        traceId: 'trace_safe', context: {
                            stage: code === 'WORKBENCH_CAPTION_INVALID' ? 'prompt-parse' : 'prompt-write',
                            ...(code === 'NAI_429' && { status: 429 }),
                            ...(code === 'WORKBENCH_CAPTION_INVALID' && { field: 'caption', issue: 'invalid' }),
                            rawText: 'PRIVATE-REPLY-KEY', characterKey: 'PRIVATE-NAME',
                        } } };
                } } } });
        f.backend.writeDbgenPrompt = (req) => adapter.writeDbgenPrompt(req);
        const result = await f.service.redrawConsistency(f.query);
        assert.equal(result.ok, false);
        assert.equal(result.reason, code);
        assert.equal(result.diagnostics.slotId, 2);
        assert.equal(requests.length, f.names.length);
        assert.ok(requests.every((req) => req.contextMode === 'provided' && !Object.hasOwn(req, 'messageId')));
        assert.equal(f.calls.length, 0);
        assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
        const recovered = createImageJobLog({ storage: f.logStorage }).list();
        const error = recovered.find((entry) => entry.level === 'error').message;
        assert.ok(error.includes(code), error);
        assert.match(error, /阶段 write.*slotid 2.*原图保持不变/);
        if (code === 'NAI_429') assert.match(error, /HTTP 429.*traceId trace_safe/);
        if (code === 'WORKBENCH_CAPTION_INVALID') assert.match(error, /prompt-parse.*caption.*invalid/);
        assert.doesNotMatch(JSON.stringify(result) + error, /PRIVATE-|rawText|coat-A|new-A/);
    });
}

test('gate:cg-consistency:固定前缀归一与重复准备不改局部模板', async () => {
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const f = await consistencyFixture();
    assert.equal((await f.service.redrawConsistency(f.query)).ok, true);
    const request = f.calls[0];
    const template = structuredClone({ caption: request.caption, promptRecipe: request.promptRecipe,
        promptTask: request.promptTask, characterContext: request.characterContext,
        characterMeta: request.characterMeta, slotId: request.slotId });
    const scene = template.caption.v4_prompt.caption.base_caption;
    const cases = [
        [scene, scene],
        [`reference inset, ${scene}`, scene],
        [`  ReFeReNcE InSeT. ${scene}`, scene],
        [`${scene}, reference inset`, scene],
        [`reference inset; reference inset, ${scene}, reference inset`, scene],
        ['Local content, reference inset, same character.', 'Local content, same character.'],
        ['reference inset', ''],
        ['A reference inset is described in the scene.', 'A reference inset is described in the scene.'],
    ];
    for (const [raw, body] of cases) {
        const input = structuredClone(template);
        input.caption.v4_prompt.caption.base_caption = raw;
        input.promptRecipe.caption = structuredClone(input.caption);
        const before = structuredClone(input);
        const prepared = prepareCharacterCaption(input);
        assert.equal(prepared.ok, true, prepared.error);
        assert.equal(prepared.caption.v4_prompt.caption.base_caption,
            body ? `reference inset, ${body}` : 'reference inset');
        assert.deepEqual(input, before, '只修改发送副本');
        assert.deepEqual(prepared.promptRecipe.caption, before.promptRecipe.caption);
        assert.deepEqual(prepareCharacterCaption(input), prepared, '同模板重复准备保持幂等');
        const final = prepareCharacterCaption({ captionMode: 'final', caption: prepared.caption });
        assert.equal(final.ok, true, final.error);
        assert.deepEqual(final.caption, prepared.caption, '已准备的定稿不重复前置');
        assert.equal(Object.isFrozen(prepared.caption.v4_prompt.caption), true);
    }
    assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
});


test('gate:cg-consistency:固定前缀不影响普通生成与手改定稿', async () => {
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const f = await consistencyFixture();
    const recipe = structuredClone(f.before.promptRecipe);
    const characterContext = f.names.map(characterKey => ({ characterKey,
        dna: f.assets.characterDna[characterKey],
        outfit: f.before.characterMeta.characters.find(c => c.characterKey === characterKey).outfit }));
    for (const purpose of ['cg', 'sprite', 'derived', 'consistency']) {
        const input = { caption: recipe.caption, promptRecipe: recipe, characterContext,
            characterMeta: f.before.characterMeta,
            promptTask: { version: 1, mode: 'dna_template', purpose,
                characters: recipe.bindings.map(({ kind, characterKey, token, framing }) =>
                    ({ kind, characterKey, token, framing })) } };
        const before = structuredClone(input);
        const prepared = prepareCharacterCaption(input);
        assert.equal(prepared.ok, true, prepared.error);
        assert.equal(prepared.caption.v4_prompt.caption.base_caption, recipe.caption.v4_prompt.caption.base_caption);
        assert.doesNotMatch(prepared.caption.v4_prompt.caption.base_caption, /reference inset/i);
        assert.deepEqual(input, before);
        assert.ok(prepared.caption.v4_prompt.caption.char_captions.every(c => !c.char_caption.includes('<<dna:')));
    }
    for (const captionMode of [undefined, 'final']) {
        const caption = structuredClone(f.before.caption);
        caption.v4_prompt.caption.base_caption = 'reference inset, An explicitly saved caption.';
        const before = structuredClone(caption);
        const prepared = prepareCharacterCaption({ caption, ...(captionMode && { captionMode }) });
        assert.equal(prepared.ok, true, prepared.error);
        assert.deepEqual(prepared.caption, before, '旧提示词和手改定稿原样发送');
        assert.deepEqual(caption, before);
    }
});


for (const count of [2, 3]) test(`gate:cg-consistency:${count}-characters-candidate-accept-roundtrip`, async () => {
    const f = await consistencyFixture(count);
    const candidate = await f.service.redrawConsistency(f.query);
    assert.equal(candidate.ok, true, JSON.stringify(candidate));
    assert.equal(candidate.reason, 'candidate');
    assert.equal(f.calls.length, count);
    assert.equal(f.writes.length, count, '仅为局部工作轮次写词');
    assert.ok(f.writes.every((request) => request.contextMode === 'provided' && !Object.hasOwn(request, 'messageId')), '仅使用保存 CG 资料');
    assert.equal(f.writes[0].promptTask.purpose, 'consistency');

    const output = JSON.parse(f.writes[0].description.split('\n').at(-1));
    assert.equal(output.characterKey, f.names[0]);
    assert.deepEqual(output.layout.sourceSize, { width: 128, height: 64 });
    assert.ok(output.layout.crop && output.layout.work && output.layout.reference);

    assert.deepEqual(f.references, f.names);
    assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before, '候选前不写正式记录');
    assert.deepEqual([candidate.width, candidate.height], [128, 64]);
    for (const [i, request] of f.calls.entries()) {
        assert.equal(await request.shouldStart(), true);
        assert.equal(request.strength, 0.6, '一致性每轮显式使用专用重绘强度');
        assert.match(request.caption.v4_prompt.caption.base_caption, /preserving their original clothing and interaction/);
        assert.match(request.caption.v4_prompt.caption.base_caption, /same character/i);
        assert.doesNotMatch(request.caption.v4_prompt.caption.base_caption, /reference inset/i);
        assert.doesNotMatch(request.caption.v4_prompt.caption.base_caption, /frame|border|split screen|collage/i);
        assert.match(request.caption.v4_negative_prompt.caption.base_caption, /decorative frame, golden border, split screen, collage, duplicate person/);
        const chars = request.caption.v4_prompt.caption.char_captions;
        assert.ok(chars.every((c) => c.centers.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)));
        assert.ok(chars.some((c) => c.char_caption.includes(`<<dna:ref${i}>>`)));
        assert.ok(chars.every((c) => !c.char_caption.includes('new-')), '服务不能提前展开身份');
        const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
        const reusable = structuredClone({ caption: request.caption, promptRecipe: request.promptRecipe });
        const prepared = prepareCharacterCaption(request);
        assert.equal(prepared.ok, true, prepared.error);
        const scene = prepared.caption.v4_prompt.caption.base_caption;
        assert.equal(scene, `reference inset, ${request.caption.v4_prompt.caption.base_caption}`);
        assert.equal(scene.match(/reference inset/gi).length, 1);
        assert.deepEqual({ caption: request.caption, promptRecipe: request.promptRecipe }, reusable, '准备发送不能修改局部模板');
        assert.deepEqual(prepared.promptRecipe.caption, request.promptRecipe.caption);
        assert.ok(prepared.caption.v4_prompt.caption.char_captions.some((c) => c.char_caption.includes(`new-${f.names[i]}`)));
        assert.ok(chars.every((c) => !c.char_caption.includes('old-')));
        const source = f.pixels.get(request.sourceDataUrl), mask = f.pixels.get(request.maskDataUrl);
        assert.deepEqual([mask.width, mask.height], [source.width, source.height]);
        assert.ok(source.width * source.height <= 1024 * 1024);
        assert.equal(source.width % 64 + source.height % 64, 0);
    }
    const { planReferenceCanvas } = await import('../src/media/cg-reference-canvas.js');
    const rects = f.before.characterMeta.characters.map((c) => planReferenceCanvas(128, 64, f.before.characterMeta, c.characterKey).rect);
    const result = f.pixels.get(candidate.dataUrl), original = f.pixels.get('original');
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
        if (rects.some((r) => x >= r.x && x < r.right && y >= r.y && y < r.bottom)) continue;
        const i = (y * 128 + x) * 4;
        assert.deepEqual(result.data.subarray(i, i + 4), original.data.subarray(i, i + 4));
    }
    assert.equal(f.events.some((e) => e.name === 'igs:illustration-updated'), false);
    assert.equal((await f.service.redrawConsistency(f.query)).reason, 'consistency-busy');
    assert.equal((await f.service.acceptConsistency(candidate.candidateId)).ok, true);
    const saved = await f.store.getSlotRecord(f.before.key);
    assert.equal(saved.dataUrl, candidate.dataUrl);
    assert.equal(saved.consistencyBaselineDataUrl, 'original');
    assert.equal(saved.revision, f.before.revision + 1);
    assert.deepEqual(saved.characterMeta, f.before.characterMeta);
    assert.deepEqual(saved.caption, f.before.caption);
    assert.deepEqual(saved.promptRecipe, f.before.promptRecipe);
    assert.equal(saved.sentPrompt, undefined, '合成后的正式 CG 没有伪造整图 wire');
    assert.equal(saved.consistencyPrompt.rounds.length, count);
    assert.deepEqual(saved.consistencyPrompt.rounds.map((r) => r.characterKey), f.names);
    assert.ok(saved.consistencyPrompt.rounds.every((r) => r.sentPrompt.action === 'infill'));
    for (const round of saved.consistencyPrompt.rounds) {
        assert.match(round.sentPrompt.caption.v4_prompt.caption.base_caption, /^reference inset, /);
        assert.equal(round.sentPrompt.caption.v4_prompt.caption.base_caption.match(/reference inset/gi).length, 1);
    }
    assert.ok(saved.promptRecipe.bindings.every((b) => b.kind === 'named'));
    assert.equal(saved.caption.v4_prompt.caption.base_caption.includes('reference inset'), false);
    assert.equal(f.service.getIllustrationUrl(f.query), candidate.dataUrl);
    assert.equal(f.events.filter((e) => e.name === 'igs:illustration-updated').length, 1);
    assert.equal((await f.service.acceptConsistency(candidate.candidateId)).reason, 'candidate-unavailable');
});

for (const edited of [false, true]) test(`gate:cg-consistency:保存衣装模板与${edited ? '手改' : '原始'}提示词保真`, async () => {
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const { storedPromptFromResult, promptFromText } = await import('../src/generated-images/generation-prompt.js');
    const f = await consistencyAdapterFixture(2);
    try {
        const recipe = structuredClone(f.before.promptRecipe);
        recipe.outfitMode = 'template';
        for (const b of recipe.bindings) {
            recipe.caption.v4_prompt.caption.char_captions[b.captionIndex].char_caption
                = `<<dna:${b.token}>> <<outfit:${b.token}>> looks over the shoulder.`;
        }
        const context = f.names.map(characterKey => ({ characterKey, dna: f.assets.characterDna[characterKey],
            outfit: f.before.characterMeta.characters.find(c => c.characterKey === characterKey).outfit }));
        const original = prepareCharacterCaption({ ...f.before, caption: recipe.caption, promptRecipe: recipe,
            promptTask: { version: 1, mode: 'dna_template', purpose: 'consistency', outfitMode: 'template',
                characters: recipe.bindings.map(({ kind, characterKey, token, framing }) => ({ kind, characterKey, token, framing })) },
            characterContext: context });
        assert.equal(original.ok, true, original.error);
        const prompt = edited ? { ...storedPromptFromResult(original),
            ...promptFromText('EDITED-CG-LOCAL: holding the reins beside a stone wall.', 'edited-uc') }
            : storedPromptFromResult(original);
        if (edited) delete prompt.caption;
        const before = await f.store.putSlot(f.key, { ...f.before, ...original, prompt,
            ...(edited && { promptEdited: true }) });
        const source = edited ? JSON.stringify(prompt) : JSON.stringify(recipe.caption);
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.equal(f.writes.length, f.names.length);

        for (const [i, request] of f.edits.entries()) {
            const prepared = prepareCharacterCaption(request);
            assert.equal(prepared.ok, true, prepared.error);
            assert.equal(prepared.promptRecipe.outfitMode, 'template');
            for (const b of prepared.promptRecipe.bindings.filter(b => b.kind === 'named')) {
                const saved = context.find(c => c.characterKey === b.characterKey);
                assert.ok(request.caption.v4_prompt.caption.char_captions[b.captionIndex].char_caption.includes(`<<outfit:${b.token}>>`));
                assert.equal(prepared.outfitSnapshot.characters.find(c => c.token === b.token).description, saved.outfit.description);
                assert.ok(f.wires[i].parameters.v4_prompt.caption.char_captions[b.captionIndex].char_caption.includes(saved.outfit.description));
            }
            assert.doesNotMatch(JSON.stringify(f.wires[i]), /<<(?:dna|outfit)/);
        }
        assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
        const saved = await f.store.getSlotRecord(before.key);
        for (const field of ['prompt', 'caption', 'promptRecipe', 'dnaSnapshot', 'outfitSnapshot', 'promptEdited'])
            assert.deepEqual(saved[field], before[field], field);
        assert.equal(saved.consistencyPrompt.rounds.length, f.names.length);
        assert.deepEqual(f.assets, f.originalAssets);
    } finally { f.dispose(); }
});



test('gate:cg-consistency:missing-reference-fails-before-any-request', async () => {
    const f = await consistencyFixture();
    delete f.assets.characters.B.默认;
    assert.equal((await f.service.redrawConsistency(f.query)).reason, 'cg-reference-missing');
    assert.equal(f.calls.length, 0);
    assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
});

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

test('gate:cg-consistency:candidate-cancel-target-change-revision-and-storage-error', async () => {
    for (const mode of ['cancel', 'swipe', 'chat', 'marker', 'revision', 'recreate', 'storage']) {
        const f = await consistencyFixture();
        const candidate = await f.service.redrawConsistency(f.query);
        assert.equal(candidate.ok, true);
        let expected = f.before;
        if (mode === 'cancel') f.service.cancelConsistency(candidate.candidateId);
        if (mode === 'swipe') f.floor.swipeId = 1;
        if (mode === 'chat') f.floor.chatId = 'other-chat';
        if (mode === 'marker') f.floor.text = '挂载点已清扫';
        if (mode === 'revision' || mode === 'recreate') {
            if (mode === 'recreate') await f.store.deleteSlot(f.key, 7);
            expected = await f.store.putSlot(f.key, { ...f.before, dataUrl: 'newer-image' });
        }
        if (mode === 'storage') f.store.updateSlot = async () => { throw new Error('fixture-storage-error'); };
        const result = await f.service.acceptConsistency(candidate.candidateId);
        assert.equal(result.ok, false, mode);
        assert.equal(result.reason, mode === 'cancel' ? 'candidate-unavailable'
            : mode === 'storage' ? 'slot-update-failed'
                : ['revision', 'recreate'].includes(mode) ? 'stale-revision' : 'stale-target');
        assert.deepEqual(await f.store.getSlotRecord(f.before.key), expected, mode);
        assert.equal(f.events.some((e) => e.name === 'igs:illustration-updated'), false);
    }
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
function cgTemplateText(slotId, at, rows = []) {
    return [`slotid: ${slotId}`, ...(at !== undefined ? [`at: ${at}`] : []),
        'prompt_mode: dna_template', 'outfit_mode: template', 'scene: Friends meet in a cafe. High quality illustration.',
        'scene_uc: blurry', ...rows.flatMap(({ key, token, frame = 'half_body', x = 0.3, identity, outfitId = '',
            outfitName = 'Coat', outfitDescription = 'wears a blue coat' }, index) => [
            `char: ${x},0.5 | <<dna:${token}>> <<outfit:${token}>> and waves toward Alice.`,
            `char_uc: <<dna_uc:${token}>>, closed eyes`, `meta_kind: ${index} | named`,
            `meta_key: ${index} | ${key}`, `meta_token: ${index} | ${token}`,
            `meta_frame: ${index} | ${frame}`, `meta_outfit_name: ${index} | ${outfitName}`,
            ...(at !== undefined ? [`meta_outfit_id: ${index} | ${outfitId}`] : []),
            `meta_outfit_description: ${index} | ${outfitDescription}`,
            ...(identity !== undefined ? [`meta_identity: ${index} | ${identity}`,
                `meta_signature: ${index} | silver hair clip`] : []),
        ])].join('\n');
}

for (const fault of ['none', 'foreign', 'empty-description']) test(`gate:cg-catalog:混合来源与跨图引用-${fault}`, async () => {
    const assets = cgTemplateAssets();
    const saved = 'wears a 1.2::navy coat:: with $1 trim';
    assets.characterOutfits = { Alice: { Coat: { wardrobe: 'alice', moods: {} } },
        Bob: { Coat: { wardrobe: 'bob', moods: {} } } };
    assets.wardrobe = { alice: { prompt: saved }, bob: { prompt: 'wears a green coat' } };
    const before = structuredClone(assets);
    const rows = [{ key: 'Alice', token: 'r0', outfitId: fault === 'foreign' ? '2' : '1',
        outfitDescription: fault === 'empty-description' ? '' : 'wears a scene-only coat' },
        { key: 'Bob', token: 'r1', outfitName: 'New shirt', outfitDescription: 'wears a red shirt' }];
    const reply = [cgTemplateText(1, 2, rows), cgTemplateText(2, 3, [rows[0]])].join('\n---\n');
    const run = await cgTemplateRun('nai', reply, assets);
    try {
        assert.equal(run.result.ok, fault === 'none', JSON.stringify(run.result));
        assert.equal(run.llmRequests.length, 1);
        assert.deepEqual(assets, before);
        if (fault !== 'none') {
            assert.equal(run.wires.length, 0);
            assert.equal(run.result.diagnostic.captionIndex, 0);
            return;
        }
        const records = await run.store.getSlots('c1|5|0');
        assert.equal(records.length, 2); assert.equal(run.wires.length, 2);
        for (const record of records) {
            const outfit = record.outfitSnapshot.characters[0];
            assert.equal(outfit.description, saved); assert.equal(outfit.source, 'saved');
            assert.deepEqual(record.promptRecipe.bindings[0].outfit,
                { name: 'Coat', description: saved, source: 'saved' });
            assert.equal(record.sentPrompt.caption.v4_prompt.caption.char_captions[0].char_caption,
                `Alice, half_body saved identity, ${saved} and waves toward Alice.`);
            assert.equal(JSON.stringify(record.promptRecipe).includes('outfitId'), false);
        }
        assert.equal(records[0].outfitSnapshot.characters[1].source, 'candidate');
        assert.equal(records[0].sentPrompt.caption.v4_prompt.caption.char_captions[1].char_caption,
            'Bob, half_body saved identity, wears a red shirt and waves toward Alice.');
        const { consistencyRequirement } = await import('../src/generated-images/illustration/cg-consistency-appearance.js');
        assert.deepEqual(consistencyRequirement(records[0], 'Bob'),
            { ok: true, requestedOutfit: 'New shirt', requirementSource: 'cg-selection' });
    } finally { run.dispose(); }
});

async function cgTemplateRun(mode, reply, assets, count = 2, options = {}) {
    const { createAutoIllustrationService } = await import('./helpers/media-fixtures.js');
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const wires = [], writes = [], llmRequests = [];
    const fake = makeFakes({ text: NSFW_TEXT + '\n' + Object.keys(assets.characters).map((name) =>
        `[igs-char:${name}|smile|Hello]`).join('\n'), settings: { nsfwEnabled: true, nsfwCount: count } });
    const bridge = { imageApi: { mode }, autoIllustration: { nsfwEnabled: true, nsfwCount: count,
        nai: { apiKey: 'fake-key', model: 'nai-diffusion-5-full', artistPrefix: 'artist:test', negativePrompt: 'custom-uc' } } };
    const llm = { request: async (request) => { llmRequests.push(request); return reply; } };
    const nai = createNaiOfficialClient({ fetch: async (_url, init) => {
        wires.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ images: [{ image: 'data:image/png;base64,AAAA' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    let pipeline;
    let dbgenImageService;
    if (mode === 'dbgen') {
        const { createImageGenService } = await import('../../../nai-dbgen/src/application/image-gen.service.js');
        const { createNaiGateway } = await import('../../../nai-dbgen/src/adapters/nai/nai.gateway.js');
        const { createDirectTransport } = await import('../../../nai-dbgen/src/adapters/nai/transport/direct.js');
        const { defaultPluginSettings } = await import('../../../nai-dbgen/src/domain/model/plugin-settings.js');
        const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
        const settings = { ...defaultPluginSettings(), activeNaiConfigId: 'fake', activeArtistId: 'artist' };
        settings.naiParams = { ...settings.naiParams, model: 'nai-diffusion-5-full' };
        const gateway = createNaiGateway({ transports: { direct: createDirectTransport({ fetch: async (_url, init) => {
            wires.push(JSON.parse(init.body));
            return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        } }) }, decoders: { 'json-base64': { decode: async () => Ok([
            { blob: new Blob(['fake'], { type: 'image/png' }), mimeType: 'image/png' },
        ]) } } });
        dbgenImageService = createImageGenService({ imageGenPort: gateway, loadSettings: () => settings,
            naiConfigRepo: { get: async () => Ok({ id: 'fake', baseUrl: 'https://example.invalid',
                apiKey: 'fake-key', transport: 'direct', decoder: 'json' }) },
            artistRepo: { get: async () => Ok({ positivePrompt: 'artist:test', negativePrompt: '' }) },
            newTraceId: () => 'cg-offline-wire' });
    }
    const api = { getPromptCapabilities: () => ({ finalCaption: 1, promptSnapshot: 1 }),
        async generateSinglePrompt(request) {
            writes.push(request);
            const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
            const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
            pipeline = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
            pipeline.host.byId.set(5, { messageId: 5, name: 'Bot', text: fake.messageHost.readFloor(5).text,
                isUser: false, isSystem: false });
            // 召回是隔离端口替身；编号到原句的映射仍经真实 workbench。
            pipeline.tagRecall.recall = async () => Ok({ positions: [
                { slotId: 6, anchorSentence: '二段。', keys: [] },
                { slotId: 7, anchorSentence: '三段。', keys: [] },
            ], unmatchedKeys: [] });
            return pipeline.workbench.writePrompt({ mode: 'floor', messageId: 5,
                naturalLanguage: request.description, characterContext: request.characterContext,
                promptTask: request.promptTask, writingRequirements: request.writingRequirements });
        },
        async generate(request) {
            return dbgenImageService.generate(request);
        },
    };
    const backend = options.backend || createImageBackend({ global: mode === 'dbgen' ? { NaiDbGen: api } : {},
        getBridge: () => bridge, nai, llm });
    const idb = createTransactionalIdb();
    const store = options.store || createIndexedDbIllustrationStore({ indexedDB: idb });
    const service = createAutoIllustrationService({ ...fake, ...options.deps, nai: backend, llm, store,
        getSettings: () => bridge.autoIllustration, getSceneAssets: () => assets });
    const result = await service.processMessage(5);
    return { result, service, store, fake, wires, writes, llmRequests, bridge,
        dispose: () => dbgenImageService?.dispose(), get pipeline() { return pipeline; } };
}

function cgTemplateAssets() {
    const names = ['Alice', 'Bob', 'Carol'];
    return { characters: Object.fromEntries(names.map((key) => [key, {}])),
        characterAliases: { Alice: ['A'] }, characterDna: Object.fromEntries(names.map((key) => [key,
            { version: 2, defaultAppearance: 'DO-NOT-APPEND-OUTFIT', views: Object.fromEntries(
                ['full_body', 'half_body', 'portrait', 'partial'].map((frame) => [frame,
                    { subject: `${key}, ${frame} saved identity,`, negative: `${key} wrong identity` }])) }])) };
}

for (const mode of ['nai', 'dbgen']) {
    test(`gate:scene-only:${mode}:纯场景贯通写词预检发送与重画`, async () => {
        for (const marked of [false, true]) {
            if (mode === 'nai' && !marked) continue;
            const slot = mode === 'nai' ? 1 : 6;
            const reply = [`slotid: ${slot}`, ...(mode === 'nai' ? ['at: 2'] : []),
                ...(marked ? ['prompt_mode: dna_template'] : []),
                'scene: An empty moonlit courtyard.', 'scene_uc: blurry'].join('\n');
            const assets = { characters: {}, characterAliases: {}, characterDna: {} };
            const run = await cgTemplateRun(mode, reply, assets, 1);
            try {
                assert.equal(run.result.ok, true, run.result.error);
                assert.equal(run.result.count, 1);
                assert.equal(run.wires.length, 1);
                assert.deepEqual(run.wires[0].parameters.v4_prompt.caption.char_captions, []);
                assert.equal(run.wires[0].input, mode === 'dbgen' && !marked
                    ? 'artist:test, An empty moonlit courtyard., very aesthetic, masterpiece, no text'
                    : 'artist:test, An empty moonlit courtyard.');
                if (mode === 'dbgen') {
                    assert.equal(Object.hasOwn(run.writes[0], 'promptTask'), false);
                    assert.equal(Object.hasOwn(run.writes[0], 'characterContext'), false);

                }
                assert.equal((await run.store.getSlotRecord(`c1|5|0|${slot}`)).status, 'done');
                const rerolled = await run.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot });
                assert.equal(rerolled.ok, true, rerolled.error);
                assert.equal(run.wires.length, 2);
                assert.equal(run.llmRequests.length + run.writes.length, 1);
                assert.deepEqual(assets, { characters: {}, characterAliases: {}, characterDna: {} });
            } finally { run.dispose(); }
        }
    });
}


for (const mode of ['nai', 'dbgen']) {
    test(`gate:cg-template:${mode}:命名默认衣装保真发送且重画保留原衣装快照`, async () => {
        const assets = cgTemplateAssets();
        const description = 'wears a 1.2::blue coat:: with $1 trim';
        assets.characterOutfits = { Alice: { 常服: { wardrobe: 'coat', moods: {} } } };
        assets.characterDefaultOutfits = { Alice: { version: 1, outfitName: '常服' } };
        assets.wardrobe = { coat: { prompt: description } };
        const before = structuredClone(assets);
        const slot = mode === 'nai' ? 1 : 6;
        const reply = cgTemplateText(slot, mode === 'nai' ? 2 : undefined,
            [{ key: 'Alice', token: 'r0', outfitId: '1' }])
            .replace('meta_outfit_name: 0 | Coat', 'meta_outfit_name: 0 | 常服')
            .replace('meta_outfit_description: 0 | wears a blue coat',
                mode === 'nai' ? 'meta_outfit_description: 0 | wears a coat described for this scene'
                    : 'meta_outfit_description: 0 |');
        const run = await cgTemplateRun(mode, reply, assets, 1);
        try {
            assert.equal(run.result.ok, true, run.result.error);
            assert.equal(run.result.count, 1);
            assert.equal(run.result.failedCount || 0, 0);
            assert.equal(run.wires.length, 1);
            const record = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.equal(record.status, 'done');
            assert.equal(record.outfitSnapshot.characters[0].source, 'saved');
            assert.equal(record.outfitSnapshot.characters[0].name, '常服');
            assert.equal(record.outfitSnapshot.characters[0].description, description);
            if (mode === 'nai') {
                assert.equal(record.outfitAnchor.version, 1);
                assert.ok(Number.isFinite(record.outfitAnchor.offset));
                assert.deepEqual(record.outfitAnchor.characters, [{ characterKey: 'Alice', requestedOutfit: '常服',
                    effectiveOutfit: '常服', requirementSource: 'cg-selection', source: 'cg-selection', reason: '',
                    effectiveSource: 'snapshot' }]);
            } else assert.equal(Object.hasOwn(record, 'outfitAnchor'), false, 'DBG不纳入新锚点链');
            const positive = run.wires[0].parameters.v4_prompt.caption.char_captions[0].char_caption;
            assert.equal(positive, 'Alice, half_body saved identity, ' + description + ' and waves toward Alice.');
            assert.deepEqual(assets, before, 'CG 默认复用不写入角色资料或衣装库');
            assets.characterDna.Alice.defaultAppearance = 'wears a green jacket';
            assets.wardrobe.coat.prompt = 'wears a green jacket';
            const rerolled = await run.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot });
            assert.equal(rerolled.ok, true, rerolled.error);
            assert.equal(run.wires.length, 2);
            assert.equal(run.llmRequests.length + run.writes.length, 1, '重画不重新写词');
            assert.equal(run.wires[1].parameters.v4_prompt.caption.char_captions[0].char_caption, positive);
            assert.equal(assets.characterDna.Alice.defaultAppearance, 'wears a green jacket');
        } finally { run.dispose(); }
    });

    test(`gate:cg-template:${mode}:缺景别使用当次身份且保存真实请求`, async () => {
        const assets = cgTemplateAssets();
        delete assets.characterDna.Bob.views.half_body;
        const before = structuredClone(assets);
        const goodId = mode === 'nai' ? 1 : 6, badId = mode === 'nai' ? 2 : 7;
        const reply = [cgTemplateText(badId, mode === 'nai' ? 3 : undefined,
            [{ key: 'Bob', token: 'r1', identity: 'Bob, an adult man with black hair and a silver hair clip,' }]),
            cgTemplateText(goodId, mode === 'nai' ? 2 : undefined,
            [{ key: 'Alice', token: 'r0', frame: 'portrait', x: 0.7 }])].join('\n---\n');
        const run = await cgTemplateRun(mode, reply, assets);
        try {
            assert.equal(run.result.ok, true, run.result.error);
            assert.equal(run.result.count, 2);
            assert.equal(run.result.failedCount || 0, 0);
            assert.equal(run.wires.length, 2, '当次身份降级不增加写词或补立绘请求');
            assert.equal(run.llmRequests.length, mode === 'nai' ? 1 : 0);
            assert.equal(run.writes.length, mode === 'dbgen' ? 1 : 0);
            if (mode === 'dbgen') {
                assert.equal(run.pipeline.llmCalls.length, 1);
                assert.equal(run.writes[0].skipRecall, undefined);
                assert.equal(run.writes[0].promptTask.purpose, 'cg');
                assert.equal(run.writes[0].promptTask.slots, undefined);
            }
            const records = await run.store.getSlots('c1|5|0');
            const good = records.find((r) => r.slot === goodId), bad = records.find((r) => r.slot === badId);
            const goodWire = run.wires.find((wire) => wire.parameters.v4_prompt.caption.char_captions[0].char_caption.startsWith('Alice,'));
            const badWire = run.wires.find((wire) => wire.parameters.v4_prompt.caption.char_captions[0].char_caption.startsWith('Bob,'));
            assert.ok(goodWire && badWire);
            assert.equal(good.status, 'done');
            assert.equal(bad.status, 'done');
            assert.equal(bad.dnaSnapshot.characters[0].source, 'scene');
            assert.equal(bad.dnaSnapshot.characters[0].dnaVersion, 0);
            assert.equal(bad.dnaSnapshot.characters[0].framing, 'half_body');
            assert.match(bad.sentPrompt.caption.v4_prompt.caption.char_captions[0].char_caption,
                /^Bob, an adult man with black hair and a silver hair clip,/);
            assert.deepEqual(bad.sentPrompt.caption.v4_prompt.caption, badWire.parameters.v4_prompt.caption);
            assert.ok(bad.dataUrl || bad.imageRef);
            assert.equal(good.promptRecipe.bindings[0].characterKey, 'Alice');
            assert.equal(good.dnaSnapshot.characters[0].source, 'saved');
            assert.equal(good.dnaSnapshot.characters[0].framing, 'portrait');
            assert.deepEqual(good.sentPrompt.caption.v4_prompt.caption,
                goodWire.parameters.v4_prompt.caption);
            assert.equal(goodWire.parameters.v4_prompt.caption.char_captions[0].char_caption,
                'Alice, portrait saved identity, wears a blue coat and waves toward Alice.');
            assert.deepEqual(goodWire.parameters.v4_prompt.caption.char_captions[0].centers, [{ x: 0.7, y: 0.5 }]);
            assert.equal(run.wires[0].input, 'artist:test, Friends meet in a cafe. High quality illustration.');
            assert.equal(run.wires[0].parameters.negative_prompt, 'blurry');
            assert.equal(JSON.stringify(run.wires).includes('DO-NOT-APPEND-OUTFIT'), false);
            assert.equal(JSON.stringify(run.wires).includes('<<dna'), false);
            assert.ok(good.promptRecipe.caption.v4_prompt.caption.char_captions[0].char_caption.includes('<<dna:r0>>'));
            assert.equal(good.originalSize.width * good.originalSize.height <= 1024 * 1024, true);
            assert.ok(run.fake.messageHost.readFloor(5).text.includes(`[igs-img:${badId}]`));
            if (mode === 'dbgen') assert.equal(good.anchorSentence, '二段。');
            else assert.equal(good.at, 2);
            assert.deepEqual(assets, before, 'CG 全过程不写回 DNA 或衣装');
        } finally { run.dispose(); }
    });
}

for (const mode of ['nai', 'dbgen']) {
    test(`gate:cg-template:${mode}:普通重画取当前DNA且手改定稿保真`, async () => {
        const assets = cgTemplateAssets(), slot = mode === 'nai' ? 1 : 6;
        const run = await cgTemplateRun(mode, cgTemplateText(slot, mode === 'nai' ? 2 : undefined,
            [{ key: 'Alice', token: 'r0', frame: 'partial' }]), assets, 1);
        try {
            assert.equal(run.result.ok, true, run.result.error);
            const original = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assets.characterDna.Alice.views.partial.subject = 'Alice current hand with a silver ring,';
            const identity = { chatId: 'c1', messageId: 5, swipeId: 0, slot };
            assert.equal((await run.service.rerollSlot(identity)).ok, true);
            const redrawn = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.equal(redrawn.dnaSnapshot.characters[0].subject, 'Alice current hand with a silver ring,');
            assert.equal(original.dnaSnapshot.characters[0].subject, 'Alice, partial saved identity,');
            assert.deepEqual(redrawn.promptRecipe, original.promptRecipe);
            assert.deepEqual(redrawn.characterMeta.characters[0].outfit, original.characterMeta.characters[0].outfit);
            assert.match(run.wires.at(-1).parameters.v4_prompt.caption.char_captions[0].char_caption, /^Alice current hand/);
            const { editedStoredPrompt, promptFromCaption } = await import('../src/generated-images/generation-prompt.js');
            const caption = structuredClone(redrawn.caption);
            caption.v4_prompt.caption.base_caption = 'Exact manual scene.';
            caption.v4_prompt.caption.char_captions[0].char_caption = 'Exact manual character with red hair.';
            const edited = await run.store.updateSlot('c1|5|0', slot, redrawn.revision,
                { caption, prompt: editedStoredPrompt(promptFromCaption(caption), redrawn), promptEdited: true, captionMode: 'final' },
                { expectedToken: redrawn.revisionToken });
            assert.equal(edited.ok, true);
            delete assets.characterDna.Alice;
            assert.equal((await run.service.rerollSlot(identity)).ok, true);
            const final = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.deepEqual(final.caption, caption);
            assert.deepEqual(final.promptRecipe, original.promptRecipe);
            assert.deepEqual(final.dnaSnapshot, redrawn.dnaSnapshot);
            assert.equal(run.wires.at(-1).input, 'artist:test, Exact manual scene.');
            assert.deepEqual(run.wires.at(-1).parameters.v4_prompt.caption.char_captions, caption.v4_prompt.caption.char_captions);
            assert.equal(run.wires.length, 3);
            assert.equal(run.llmRequests.length + run.writes.length, 1, '重画不增加写词调用');
        } finally { run.dispose(); }
    });
}

for (const mode of ['nai', 'dbgen']) {
    test(`gate:cg-template:${mode}:三人乱序绑定按景别展开不按数组猜身份`, async () => {
        const assets = cgTemplateAssets(), before = structuredClone(assets);
        const rows = [{ key: 'Carol', token: 'r2', frame: 'partial', x: 0.9 },
            { key: 'Alice', token: 'r0', frame: 'full_body', x: 0.1 },
            { key: 'Bob', token: 'r1', frame: 'portrait', x: 0.5 }];
        const run = await cgTemplateRun(mode, cgTemplateText(mode === 'nai' ? 1 : 6,
            mode === 'nai' ? 2 : undefined, rows), assets, 1);
        try {
            assert.equal(run.result.ok, true, run.result.error);
            const record = (await run.store.getSlots('c1|5|0'))[0];
            const chars = run.wires[0].parameters.v4_prompt.caption.char_captions;
            rows.forEach((row, index) => {
                assert.equal(record.promptRecipe.bindings[index].characterKey, row.key);
                assert.equal(record.promptRecipe.bindings[index].captionIndex, index);
                assert.equal(record.dnaSnapshot.characters[index].framing, row.frame);
                assert.equal(chars[index].char_caption,
                    `${row.key}, ${row.frame} saved identity, wears a blue coat and waves toward Alice.`);
                assert.deepEqual(chars[index].centers, [{ x: row.x, y: 0.5 }]);
            });
            assert.deepEqual(assets, before);
            assert.equal(run.llmRequests.length + run.writes.length, 1);
        } finally { run.dispose(); }
    });
    test(`gate:cg-template:${mode}:缺身份失败补齐后只重试失败图`, async () => {
        const assets = cgTemplateAssets(), saved = structuredClone(assets.characterDna.Bob);
        delete assets.characterDna.Bob;
        const goodId = mode === 'nai' ? 1 : 6, badId = mode === 'nai' ? 2 : 7;
        const reply = [cgTemplateText(goodId, mode === 'nai' ? 2 : undefined,
            [{ key: 'Alice', token: 'r0' }]), cgTemplateText(badId, mode === 'nai' ? 3 : undefined,
            [{ key: 'Bob', token: 'r1' }])].join('\n---\n');
        const run = await cgTemplateRun(mode, reply, assets);
        try {
            assert.equal(run.result.failedCount, 1);
            assert.equal((await run.store.getSlotRecord(`c1|5|0|${badId}`)).failureReason, 'DNA_MISSING');
            assets.characterDna.Bob = saved;
            const retry = await run.service.processMessage(5);
            assert.equal(retry.ok, true, retry.error);
            assert.equal(retry.count, 1);
            assert.equal(run.wires.length, 2);
            assert.equal(run.llmRequests.length + run.writes.length, 1);
            const recovered = await run.store.getSlotRecord(`c1|5|0|${badId}`);
            assert.equal(recovered.status, 'done');
            assert.equal(recovered.error, null);
            assert.equal(recovered.failureReason, null);
        } finally { run.dispose(); }
    });
    test(`gate:cg-template:${mode}:无DNA当次身份可回读重画且不建档`, async () => {
        const assets = cgTemplateAssets();
        delete assets.characterDna.Bob;
        const before = structuredClone(assets), slot = mode === 'nai' ? 1 : 6;
        const identity = 'Bob, an adult man with black hair, narrow brown eyes and a silver hair clip,';
        const run = await cgTemplateRun(mode, cgTemplateText(slot, mode === 'nai' ? 2 : undefined,
            [{ key: 'Bob', token: 'r1', frame: 'portrait', identity }]), assets, 1);
        try {
            assert.equal(run.result.ok, true, run.result.error);
            const first = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.equal(first.dnaSnapshot.characters[0].source, 'scene');
            assert.equal(first.dnaSnapshot.characters[0].dnaVersion, 0);
            assert.equal(first.characterMeta.characters[0].identityAnchor, identity);
            assert.equal(first.characterMeta.characters[0].signatureDetails, 'silver hair clip');
            assert.equal(first.dnaCandidates, undefined);
            assert.equal(run.wires.length, 1);
            assert.equal((await run.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot })).ok, true);
            const second = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.equal(second.dnaSnapshot.characters[0].source, 'scene');
            assert.equal(second.dnaSnapshot.characters[0].subject, identity);
            assert.equal(run.wires.length, 2);
            assert.equal(run.llmRequests.length + run.writes.length, 1, '重画复用当次描述，不追加写词');
            assets.characterDna.Bob = cgTemplateAssets().characterDna.Bob;
            assert.equal((await run.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot })).ok, true);
            const upgraded = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.equal(upgraded.dnaSnapshot.characters[0].source, 'saved');
            delete assets.characterDna.Bob;
            assert.deepEqual(assets, before, 'CG 与重画不登记或改写角色 DNA');
            assert.equal(run.llmRequests.length + run.writes.length, 1);
        } finally { run.dispose(); }
    });
}

for (const mode of ['nai', 'dbgen']) {
    test(`gate:cg-template:${mode}:缺模板拒发不增加写词`, async () => {
        const assets = cgTemplateAssets();
        const reply = cgTemplateText(mode === 'nai' ? 1 : 6, mode === 'nai' ? 2 : undefined,
            [{ key: 'Alice', token: 'r0' }]).replace('prompt_mode: dna_template\n', '');
        const run = await cgTemplateRun(mode, reply, assets, 1);
        try {
            assert.equal(run.result.ok, false);
            assert.equal(run.wires.length, 0);
            assert.equal(run.llmRequests.length + run.writes.length, 1);
            assert.deepEqual(await run.store.getSlots('c1|5|0'), []);
        } finally { run.dispose(); }
    });
    test(`gate:cg-template:${mode}:重画身份缺失保留原图并报告失败`, async () => {
        const assets = cgTemplateAssets(), slot = mode === 'nai' ? 1 : 6;
        const run = await cgTemplateRun(mode, cgTemplateText(slot, mode === 'nai' ? 2 : undefined,
            [{ key: 'Alice', token: 'r0' }]), assets, 1);
        try {
            assert.equal(run.result.ok, true, run.result.error);
            const old = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            delete assets.characterDna.Alice;
            const failed = await run.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot });
            assert.equal(failed.ok, false);
            assert.equal(failed.count, 0);
            assert.equal(failed.failedCount, 1);
            const kept = await run.store.getSlotRecord(`c1|5|0|${slot}`);
            assert.equal(kept.dataUrl, old.dataUrl);
            assert.deepEqual(kept.caption, old.caption);
            assert.deepEqual(kept.prompt, old.prompt);
            assert.deepEqual(kept.promptRecipe, old.promptRecipe);
            assert.deepEqual(kept.dnaSnapshot, old.dnaSnapshot);
            assert.deepEqual(kept.sentPrompt, old.sentPrompt);
            assert.equal(kept.status, 'done', '已存在原图仍可显示，不表示本次重画成功');
            assert.equal(kept.failureReason, 'DNA_MISSING');
            assert.equal(run.wires.length, 1);
            assert.equal(run.llmRequests.length + run.writes.length, 1);
        } finally { run.dispose(); }
    });
}

// 使用真实 IGS Adapter、DBGen workbench/网关；仅 LLM、网络和像素编解码为隔离端口。
async function consistencyAdapterFixture(count, wrapStore = (store) => store, options = {}) {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { createCgConsistencyService } = await import('../src/generated-images/illustration/cg-consistency-service.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    const { createImageGenService } = await import('../../../nai-dbgen/src/application/image-gen.service.js');
    const { createNaiGateway } = await import('../../../nai-dbgen/src/adapters/nai/nai.gateway.js');
    const { createDirectTransport } = await import('../../../nai-dbgen/src/adapters/nai/transport/direct.js');
    const { defaultPluginSettings } = await import('../../../nai-dbgen/src/domain/model/plugin-settings.js');
    const { createMemoryIdb } = await import('../../../nai-dbgen/src/adapters/storage/memory-idb.js');
    const { createNaiConfigRepo } = await import('../../../nai-dbgen/src/adapters/storage/repos/api-config.repo.js');
    const indexedDB = createTransactionalIdb();
    const rawStore = createIndexedDbIllustrationStore({ indexedDB });
    const f = await consistencyFixture(count, rawStore);
    const store = wrapStore(rawStore);
    const originalAssets = structuredClone(f.assets), wires = [], edits = [], writes = [];
    let serial = 0, pipeline;
    const pipelines = [];
    const png = (pixels) => {
        const bytes = new Uint8Array(36);
        bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
        const header = new DataView(bytes.buffer);
        header.setUint32(16, pixels.width); header.setUint32(20, pixels.height);
        header.setUint32(32, ++serial);
        const url = 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
        f.pixels.set(url, pixels);
        return { url, bytes };
    };
    const codec = { ...f.codec, async encodePixels(pixels) { return png(pixels).url; } };
    const settings = { ...defaultPluginSettings(), activeNaiConfigId: 'fake', activeArtistId: 'artist' };
    settings.naiParams = { ...settings.naiParams, model: options.model || 'nai-diffusion-5-full' };
    const gateway = createNaiGateway({ transports: { direct: createDirectTransport({ fetch: async (_url, init) => {
        wires.push(JSON.parse(init.body));
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } }) }, decoders: { 'json-base64': { decode: async () => {
        const { width, height } = wires.at(-1).parameters;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) data.set([220, wires.length * 40, 20, 255], i);
        return Ok([{ blob: new Blob([png({ width, height, data }).bytes], { type: 'image/png' }), mimeType: 'image/png' }]);
    } } } });
    const configDb = createMemoryIdb(), configRepo = createNaiConfigRepo({ db: configDb});
    const config = { schemaVersion: 1, id: 'fake', name: 'fixture', baseUrl: 'https://example.invalid',
        apiKey: 'fake-key', transport: 'direct', decoder: 'json', createdAt: 't', updatedAt: 't' };
    assert.equal((await configRepo.put(config)).ok, true);
    const otherConfigRepo = createNaiConfigRepo({ db: configDb });
    const imageService = createImageGenService({ imageGenPort: gateway, loadSettings: () => settings,
        naiConfigRepo: configRepo,
        artistRepo: { get: async () => Ok({ positivePrompt: 'artist:test', negativePrompt: 'artist-uc' }), onChanged: () => () => {} },
        newTraceId: () => 'consistency-offline' });

    const api = { getPromptCapabilities: () => ({ finalCaption: 1, promptSnapshot: 1, generationConfig: 1, generationConfigLease: 1, infillImg2imgStrength: 1, appearanceCorrection: 1, infillModelNegotiation: 1, providedPromptContext: 1, spriteData: 1 }),
        getGenerationConfig: () => imageService.getGenerationConfig(),
        isGenerationConfigCurrent: (token) => imageService.isGenerationConfigCurrent(token),
        describeInfill: (request) => imageService.describeInfill(request),
        async generateSinglePrompt(request) {
            writes.push(request);
            const output = await f.backend.writeDbgenPrompt(request);
            const reply = output.captions.map((entry) => {
                if (request.outputs?.format === 'sprite-data') {
                    const meta = entry.characterMeta.characters[0], candidate = entry.dnaCandidates?.characters[0];
                    return [`slotid: ${entry.slotId}`, `character: ${meta.characterKey}`,
                        `outfit_name: ${meta.outfit.name}`, `outfit_description: ${meta.outfit.description}`,
                        'personality:', ...Object.entries(candidate?.views || {}).flatMap(([frame, view]) => [
                            `dna_${frame}: ${view.subject}`, `dna_uc_${frame}: ${view.negative || ''}`,
                        ])].join('\n');
                }
                const pos = entry.caption.v4_prompt.caption, neg = entry.caption.v4_negative_prompt.caption;
                return [`slotid: ${entry.slotId}`, 'prompt_mode: dna_template',
                    ...(entry.promptRecipe.outfitMode === 'template' ? ['outfit_mode: template'] : []),
                    ...(entry.promptRecipe.identityMode !== undefined ? [`identity_mode: ${entry.promptRecipe.identityMode}`] : []),
                    `scene: ${pos.base_caption} High quality illustration.`,
                    `scene_uc: ${['blurry', neg.base_caption].filter(Boolean).join(', ')}`,
                    ...entry.promptRecipe.bindings.flatMap((b) => {
                        const meta = entry.characterMeta.characters.find((c) => c.captionIndex === b.captionIndex);
                        const center = pos.char_captions[b.captionIndex].centers[0];
                        return [`char: ${center.x},${center.y} | ${pos.char_captions[b.captionIndex].char_caption}`,
                            `char_uc: ${neg.char_captions[b.captionIndex].char_caption}`,
                            `meta_kind: ${b.captionIndex} | ${b.kind}`, `meta_key: ${b.captionIndex} | ${b.characterKey}`,
                            `meta_token: ${b.captionIndex} | ${b.token}`, `meta_frame: ${b.captionIndex} | ${b.framing}`,
                            `meta_outfit_name: ${b.captionIndex} | ${meta?.outfit.name || ''}`,
                            ...(b.correction ? [`meta_correction_identity: ${b.captionIndex} | ${b.correction.subject}`,
                                `meta_correction_uc: ${b.captionIndex} | ${b.correction.negative}`] : []),
                            `meta_outfit_description: ${b.captionIndex} | ${meta?.outfit.description || ''}`,
                            ...Object.entries(entry.dnaCandidates?.characters.find((c) => c.characterKey ===b.characterKey)?.views || {})
                                .flatMap(([frame, view]) => [
                                    `meta_dna_${frame}: ${b.captionIndex} | ${view.subject}`,
                                    `meta_dna_uc_${frame}: ${b.captionIndex} | ${view.negative || ''}`,
                                ])];
                    })].join('\n');
            }).join('\n---\n');
            pipeline = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }),
                hostOpts: { aiMessages: [
                    { messageId: 9, name: 'Bot', text: 'Later unrelated scene.', isUser: false, isSystem: false },
                    { messageId: f.floor.messageId, name: 'Bot', text: f.floor.text, isUser: false, isSystem: false },
                ] } });
            pipelines.push(pipeline);
            if (request.contextMode === 'provided') {
                pipeline.characterRepo.listGroups = async () => assert.fail('局部写词不得读取角色库');
                pipeline.tagRepo.listLibraries = async () => assert.fail('局部写词不得读取标签库');
                pipeline.host.getMessages = () => assert.fail('局部写词不得读取剧情正文');
                pipeline.host.getRecentAiMessages = () => assert.fail('局部写词不得读取历史');
            }
            options.preparePipeline?.(pipeline, request);
            return pipeline.workbench.writePrompt({ mode: request.contextMode === 'provided' ? 'entries' : 'floor', contextMode: request.contextMode,
                ...(request.contextMode === 'provided' ? {} : { skipRecall: request.skipRecall, messageId: request.messageId }),
                naturalLanguage: request.description, characterContext: request.characterContext,
                promptTask: request.promptTask, writingRequirements: request.writingRequirements,
                ...(request.outputs && { outputs: request.outputs }) });
        },
        async generate(request) { return imageService.generate(request); },
    };
    const backend = createImageBackend({ global: { NaiDbGen: api },
        getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    const service = createCgConsistencyService({ store, nai: { ...backend,
        async edit(request) { edits.push(request); return backend.edit(request); } }, codec,
        getSceneAssets: () => f.assets,
        consistencyStrength: () => f.igsSettings.autoIllustration?.consistencyStrength,
        consistencyModel: () => f.igsSettings.autoIllustration?.consistencyModel,
        resolveReference: options.resolveReference || ((key, assets) => assets.characters[key].默认),
        ...(options.onAccepted && { onAccepted: options.onAccepted }),
        targetStillLive: () => true, writingRequirements: () => ({ transparent: false,
            quality: 'High quality illustration.', undesiredContent: 'blurry' }) });
    return { ...f, store, rawStore, service, codec, indexedDB, originalAssets, wires, edits, writes, settings,
        api, adapter: backend, config, configRepo, otherConfigRepo, imageService, pipelines,
        target: { key: f.key, floor: f.floor, slot: 7 }, dispose: () => imageService.dispose(),
        get pipeline() { return pipeline; } };
}


for (const model of ['nai-diffusion-5-full', 'nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated',
    'nai-diffusion-4-full', 'nai-diffusion-4-curated-preview', 'nai-diffusion-5-curated'])
for (const selectedModel of [undefined, 'nai-diffusion-4-5-full-inpainting'])
for (const count of [2, 3]) test(`gate:cg-consistency:${model}:${selectedModel || 'default-v5'}:${count}-characters-real-adapter-wire-and-idb`, async () => {
    const infillModel = selectedModel || 'nai-diffusion-5-full-inpainting';
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const { promptSnapshotFromBody } = await import('../src/generated-images/final-caption.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const f = await consistencyAdapterFixture(count, undefined, { model });
    if (selectedModel !== undefined) f.igsSettings.autoIllustration = { consistencyModel: selectedModel };
    const settingsBefore = structuredClone(f.settings);
    try {
        const original = prepareCharacterCaption({ ...f.before, caption: f.before.promptRecipe.caption,
            characterContext: f.names.map((characterKey) => ({ characterKey, dna: f.assets.characterDna[characterKey] })) });
        assert.equal(original.ok, true, original.error);
        const oldWire = promptSnapshotFromBody({ model: 'nai-diffusion-5-full', action: 'generate', parameters: original.caption }, null);
        const before = await f.store.putSlot(f.key, { ...f.before, caption: original.caption,
            dnaSnapshot: original.dnaSnapshot, sentPrompt: oldWire });
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.equal(f.writes.length, count);
        assert.equal(f.pipelines.reduce((sum, p) => sum + p.llmCalls.length, 0), count);
        assert.equal(f.wires.length, count);
        assert.equal(f.edits.length, count);
        assert.equal(f.writes[0].skipRecall, undefined);
        assert.ok(f.writes.every((request) => request.contextMode === 'provided' && !Object.hasOwn(request, 'messageId')));
        for (const pipeline of f.pipelines) {
            assert.equal(pipeline.host.resolveWorldInfoCalls.length, 0);
            const content = JSON.stringify(pipeline.llmCalls[0].messages);
            assert.doesNotMatch(content, /Later unrelated scene|测试正文|WORLD_INFO_TEXT/);
            assert.equal(pipeline.naiCalls.length, 0, '写词路径不发送图片请求');
        }
        assert.equal(f.writes[0].imageDataUrl, undefined, '不向写词模型发送图片定位');
        assert.ok(f.writes.every((request) => request.promptTask.slots.length === 1));
        assert.deepEqual(await f.store.getSlotRecord(before.key), before, '候选期间不写正式记录');
        for (const [i, wire] of f.wires.entries()) {
            const prepared = prepareCharacterCaption(f.edits[i]);
            assert.equal(prepared.ok, true, prepared.error);
            assert.equal(wire.action, 'infill');
            assert.equal(wire.model, infillModel);
            assert.equal(f.edits[i].model, infillModel);
            assert.equal(wire.input, 'artist:test, ' + prepared.caption.v4_prompt.caption.base_caption);
            assert.match(wire.input, /^artist:test, reference inset, .*same character/i);
            assert.equal(wire.input.match(/reference inset/gi).length, 1);
            assert.doesNotMatch(f.edits[i].caption.v4_prompt.caption.base_caption, /reference inset/i);
            assert.doesNotMatch(wire.input, /frame|border|split screen|collage/i);
            assert.equal(wire.parameters.negative_prompt, 'artist-uc, ' + prepared.caption.v4_negative_prompt.caption.base_caption);
            assert.match(wire.parameters.negative_prompt, /decorative frame, golden border, split screen, collage, duplicate person/);
            assert.equal(wire.parameters.inpaintImg2ImgStrength, 0.6, '一致性专用强度透传到最终 wire');
            assert.deepEqual(wire.parameters.img2img, { strength: 0.6, color_correct: true });
            assert.equal(Object.hasOwn(wire.parameters, 'strength'), false);
            assert.equal(wire.parameters.noise, 0);
            assert.deepEqual(wire.parameters.v4_prompt.caption.char_captions, prepared.caption.v4_prompt.caption.char_captions);
            assert.deepEqual(wire.parameters.v4_negative_prompt.caption.char_captions.map((c) => c.char_caption),
                prepared.caption.v4_negative_prompt.caption.char_captions.map((c) => c.char_caption));
            assert.deepEqual(wire.parameters.v4_negative_prompt.caption.char_captions.map((c) => c.centers),
                prepared.caption.v4_prompt.caption.char_captions.map((c) => c.centers),
                '负向缺省坐标按既有 NAI 协议复制正向坐标');
            assert.ok(prepared.dnaSnapshot.characters.some((c) => c.kind === 'reference'
                && c.characterKey === f.names[i] && c.framing === 'portrait'));
            assert.equal(prepared.promptRecipe.identityMode, undefined);
            for (const c of prepared.dnaSnapshot.characters) {
                const binding = prepared.promptRecipe.bindings.find(b => b.captionIndex === c.captionIndex);
                assert.equal(c.application, undefined);
                assert.equal(binding.correction, undefined);
                assert.equal(c.subject, f.assets.characterDna[c.characterKey].views[c.framing].subject);
                assert.equal(c.negative, f.assets.characterDna[c.characterKey].views[c.framing].negative);
                assert.deepEqual(c.profile.views, f.assets.characterDna[c.characterKey].views);
            }
            assert.equal(JSON.stringify(wire).includes('<<dna'), false);
            assert.equal(wire.parameters.width * wire.parameters.height <= 1024 * 1024, true);
        }

        assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
        const saved = await createIndexedDbIllustrationStore({ indexedDB: f.indexedDB }).getSlotRecord(before.key);
        assert.equal(saved.dataUrl, candidate.dataUrl);
        assert.equal(saved.sentPrompt, undefined, '合成 CG 不沿用旧整图 wire');
        assert.equal(saved.prompt.sentPrompt, undefined);
        assert.equal(saved.consistencyPrompt.rounds.length, count);
        assert.deepEqual(saved.consistencyBaselineMeta.sentPrompt, oldWire);
        assert.ok(saved.promptRecipe.bindings.every((b) => b.kind === 'named'));
        assert.equal(Object.hasOwn(saved.promptRecipe, 'identityMode'), false);
        assert.equal(saved.caption.v4_prompt.caption.base_caption.includes('reference inset'), false);
        for (const [i, round] of saved.consistencyPrompt.rounds.entries()) {
            assert.equal(round.slotId, i + 2);
            assert.equal(round.characterKey, f.names[i]);
            assert.equal(round.sentPrompt.action, 'infill');
            assert.equal(round.sentPrompt.model, infillModel);
            assert.deepEqual(round.sentPrompt.caption.v4_prompt.caption, f.wires[i].parameters.v4_prompt.caption);
            assert.deepEqual(round.sentPrompt.caption.v4_negative_prompt.caption, f.wires[i].parameters.v4_negative_prompt.caption);
            assert.ok(round.dnaSnapshot.characters.every((c) => c.source === 'saved'));
            assert.equal(round.promptRecipe.identityMode, undefined);
            assert.ok(round.dnaSnapshot.characters.every(c => c.application === undefined));
            assert.match(round.sentPrompt.caption.v4_prompt.caption.base_caption, /^artist:test, reference inset, .*same character/i);
            assert.equal(round.sentPrompt.caption.v4_prompt.caption.base_caption.match(/reference inset/gi).length, 1);
        }
        assert.deepEqual(f.assets, f.originalAssets, '全过程不写 DNA 或衣装');
        assert.deepEqual(f.settings, settingsBefore, '局部重绘不改变全局模型或配置');
        assert.equal(JSON.stringify(saved.consistencyPrompt).includes('fake-key'), false);
    } finally { f.dispose(); }
});

test('gate:cg-consistency:DNA changes before writing, during edits and at commit preserve original', async () => {
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    for (const phase of ['reference', 'write', 'edit', 'candidate', 'commit']) {
        const store = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
        const f = await consistencyFixture(2, store);
        const mutate = () => { f.assets.characterDna.A.views.half_body.subject = 'changed-A'; };
        if (phase === 'reference') {
            const decode = f.codec.decodeImage;
            f.codec.decodeImage = async (src) => { const result = await decode(src); if (src === 'reference-A') mutate(); return result; };
        }
        if (phase === 'write') {
            const write = f.backend.writeDbgenPrompt;
            f.backend.writeDbgenPrompt = async (req) => { const result = await write(req); mutate(); return result; };
        }
        if (phase === 'edit') {
            const edit = f.backend.edit;
            f.backend.edit = async (req) => { const result = await edit(req); mutate(); return result; };
        }
        const result = await f.service.redrawConsistency(f.query);
        if (['candidate', 'commit'].includes(phase)) {
            assert.equal(result.ok, true, JSON.stringify(result));
            if (phase === 'candidate') mutate();
            else {
                const update = store.updateSlot;
                store.updateSlot = async (...args) => { mutate(); return update(...args); };
            }
            assert.equal((await f.service.acceptConsistency(result.candidateId)).reason, 'stale-dna', phase);
        } else assert.equal(result.reason, 'stale-dna', phase);
        assert.equal(f.writes.length, phase === 'reference' ? 0 : phase === 'write' ? 1 : 2, phase);
        assert.equal(f.calls.length, ['reference', 'write'].includes(phase) ? 0 : phase === 'edit' ? 1 : 2, phase);
        assert.deepEqual(await store.getSlotRecord(f.before.key), f.before, phase);
        assert.equal(f.events.some((e) => e.name === 'igs:illustration-updated'), false, phase);
    }
});

test('gate:cg-consistency:缺轮次错绑和非法来源在发送前拒绝', async () => {
    for (const mode of ['missing', 'duplicate', 'key', 'token', 'frame', 'outfit', 'candidate']) {
        const f = await consistencyFixture();
        const write = f.backend.writeDbgenPrompt;
        f.backend.writeDbgenPrompt = async (request) => {
            const result = await write(request);
            const entry = result.captions.find((c) => c.slotId === 2);
            if (!entry) return result;
            const named = entry.promptRecipe.bindings.find((b) => b.kind === 'named');
            if (mode === 'missing') result.captions.pop();
            if (mode === 'duplicate') result.captions[0].slotId = 1;
            if (mode === 'key') named.characterKey = 'B';
            if (mode === 'token') named.token = 'unknown';
            if (mode === 'frame') named.framing = 'full_body';
            if (mode === 'outfit') entry.characterMeta.characters[0].outfit.description = 'other outfit';
            if (mode === 'candidate') entry.dnaCandidates = { version: 1, characters: [] };
            return result;
        };
        const result = await f.service.redrawConsistency(f.query);
        assert.equal(result.ok, false, mode);
        assert.equal(f.writes.length, 2, mode);
        assert.equal(f.calls.length, 0, mode);
        assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before, mode);
    }
});

test('gate:cg-consistency:真实 Adapter 配置变化停止下一轮或接受', async () => {
    for (const phase of ['write', 'edit', 'candidate']) {
        const f = await consistencyAdapterFixture(2);
        try {
            if (phase === 'write') {
                const write = f.backend.writeDbgenPrompt;
                f.backend.writeDbgenPrompt = async (req) => {
                    const result = await write(req);
                    f.settings.naiParams.scale += 1;
                    return result;
                };
            }
            if (phase === 'edit') {
                const decode = f.codec.decodeImage;
                f.codec.decodeImage = async (src) => {
                    const result = await decode(src);
                    if (String(src).startsWith('data:image/') && f.wires.length > 0) f.settings.naiParams.scale += 1;
                    return result;
                };
            }
            const result = await f.service.run(f.target);
            if (phase === 'candidate') {
                assert.equal(result.ok, true, JSON.stringify(result));
                f.settings.naiParams.scale += 1;
                assert.equal((await f.service.accept(result.candidateId)).reason, 'stale-config');
            } else assert.equal(result.reason, 'stale-config', phase);
            assert.equal(f.writes.length, phase === 'write' ? 1 : 2);
            assert.equal(f.wires.length, phase === 'write' ? 0 : 2);
            assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
            assert.deepEqual(f.assets, f.originalAssets);
        } finally { f.dispose(); }
    }
});


for (const phase of ['preflight', 'transaction', 'transaction-revert']) test(`gate:cg-consistency:接受候选 ${phase} 配置失效保留原记录`, async () => {
    const f = await consistencyAdapterFixture(2);
    try {
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        const change = async () => {
            assert.equal((await f.otherConfigRepo.put({ ...f.config, apiKey: 'fixture-rotated-key' })).ok, true);
            if (phase === 'transaction-revert') assert.equal((await f.otherConfigRepo.put(f.config)).ok, true);
        };
        const update = f.rawStore.updateSlot;
        f.rawStore.updateSlot = async (...args) => {
            if (phase === 'preflight') await change();
            else {
                const options = args[4], preflight = options.beforeCommit;
                args[4] = { ...options, async beforeCommit() {
                    await preflight();
                    await change();
                } };
            }
            return update(...args);
        };
        const result = await f.service.accept(candidate.candidateId);
        assert.equal(result.reason, 'stale-config', JSON.stringify(result));
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
        assert.deepEqual(f.assets, f.originalAssets);
        assert.equal(f.writes.length, 2);
        assert.equal(f.wires.length, 2);
        assert.equal(f.service.isBusy(), false);
    } finally { f.dispose(); }
});

for (const mode of ['missing', 'async', 'false', 'throw']) test(`gate:cg-consistency:租约守卫 ${mode} 在写词前拒绝`, async () => {
    const f = await consistencyAdapterFixture(2);
    try {
        f.api.isGenerationConfigCurrent = mode === 'missing' ? undefined
            : mode === 'async' ? async () => true
            : mode === 'throw' ? () => { throw new Error('fixture-private'); } : () => false;
        const result = await f.service.run(f.target);
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'generation-config-unavailable');
        assert.equal(f.writes.length, 0);
        assert.equal(f.wires.length, 0);
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
    } finally { f.dispose(); }
});


for (const phase of ['upload', 'transaction', 'accepted']) test(`gate:cg-consistency:实际接受链路文件上传 ${phase} 配置租约`, async () => {
    const { withTavernIllustrationFiles } = await import('../src/media/tavern-illustrations.js');
    const uploaded = [], deleted = [];
    const backups = new Map();
    let f;
    const globalObject = {
        setTimeout, clearTimeout,
        btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({}) }) },
        async fetch(url, options = {}) {
            if (String(url).startsWith('/user/files/')) {
                const name = String(url).split('/').at(-1).split('?')[0];
                return backups.has(name) ? { ok: true, json: async () => structuredClone(backups.get(name)) }
                    : { ok: false, status: 404 };
            }
            if (url === '/api/files/upload') {
                const body = JSON.parse(options.body);
                backups.set(body.name, JSON.parse(Buffer.from(body.data, 'base64').toString('utf8')));
                return { ok: true };
            }
            if (url === '/api/images/upload') {
                const body = JSON.parse(options.body), path = `user/images/igs-cg/${body.filename}.png`;
                uploaded.push(path);
                if (phase === 'upload') assert.equal((await f.otherConfigRepo.put({ ...f.config, apiKey: 'fixture-upload-rotation' })).ok, true);
                return { ok: true, json: async () => ({ path }) };
            }
            if (url === '/api/images/delete') { deleted.push(JSON.parse(options.body).path); return { ok: true }; }
            return { ok: false, status: 404 };
        },
    };
    f = await consistencyAdapterFixture(2, (raw) => withTavernIllustrationFiles(raw, globalObject));
    try {
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        if (phase === 'transaction') {
            const update = f.rawStore.updateSlot;
            f.rawStore.updateSlot = async (...args) => {
                assert.equal(args[4].beforeCommit, undefined, '上传后复核已由文件层消费');
                assert.equal((await f.otherConfigRepo.put({ ...f.config, apiKey: 'fixture-transaction-rotation' })).ok, true);
                return update(...args);
            };
        }
        const result = await f.service.accept(candidate.candidateId);
        assert.equal(result.ok, phase === 'accepted', JSON.stringify(result));
        await (await import('../src/media/media-file-gc.js')).mediaFileGcFor(globalObject).drain();
        assert.equal(uploaded.length, 1);
        const saved = await f.rawStore.getSlotRecord(f.before.key);
        if (phase === 'accepted') {
            assert.equal(saved.dataUrl, uploaded[0]);
            assert.equal(saved.consistencyPrompt.rounds.length, 2);
            assert.equal(saved.consistencyBaselineDataUrl, f.before.dataUrl);
            assert.equal(saved.sentPrompt, undefined);
            assert.deepEqual(deleted, []);
        } else {
            assert.equal(result.reason, 'stale-config');
            assert.deepEqual(saved, f.before);
            assert.deepEqual(deleted, uploaded);
        }
        assert.equal(f.writes.length, 2);
        assert.equal(f.wires.length, 2);
        assert.equal(f.service.isBusy(), false);
        assert.deepEqual(f.assets, f.originalAssets);
    } finally { f.dispose(); }
});


for (const count of [2, 3]) test(`gate:dna-chain:${count}人采用到CG重画一致性与备份回读`, async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createIndexedDbGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { withTavernIllustrationFiles, CG_RECORDS_FILE } = await import('../src/media/tavern-illustrations.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { prepareSpriteIdentityAdoption } = await import('../src/scene/character-identity.js');
    const { characterWriteFixture } = await import('./helpers/prompt-provenance.js');
    const files = new Map(), deleted = [];
    let backup, sprites, sequence = 0;
    const globalObject = {
        // 只加速备份 debounce，恢复期限必须容纳真实异步存储事务。
        setTimeout: (fn, ms) => setTimeout(fn, ms === 2000 ? 5 : ms), clearTimeout,
        btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
        FileReader: class { readAsDataURL(blob) { blob.text().then((value) => {
            this.result = 'data:image/png;base64,' + value; this.onload();
        }); } },
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({}) }) },
        async fetch(url, options = {}) {
            if (String(url).startsWith(`/user/files/${CG_RECORDS_FILE}`)) return backup
                ? { ok: true, json: async () => structuredClone(backup) } : { ok: false, status: 404 };
            if (url === '/api/files/upload') {
                backup = JSON.parse(Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8'));
                return { ok: true };
            }
            if (url === '/api/images/upload') {
                const body = JSON.parse(options.body), path = `user/images/igs-cg/${body.filename}.png`;
                files.set(path, body.image);
                return { ok: true, json: async () => ({ path }) };
            }
            if (url === '/api/images/delete') {
                const path = JSON.parse(options.body).path; deleted.push(path); files.delete(path);
                return { ok: true };
            }
            const path = String(url).replace(/^\//, '');
            return files.has(path) ? { ok: true, blob: async () => new Blob([files.get(path)]) }
                : { ok: false, status: 404 };
        },
    };
    const f = await consistencyAdapterFixture(count, (raw) => withTavernIllustrationFiles(raw, globalObject), {
        resolveReference: async (key, assets) => (await sprites.readStoredImage(
            assets.characters[key].默认.slice('igs-gen:'.length))).dataUrl,
        preparePipeline(pipeline, request) {
            if (request.promptTask.purpose !== 'cg') return;
            pipeline.host.byId.set(5, { messageId: 5, name: 'Bot', isUser: false, isSystem: false,
                text: NSFW_TEXT + '\n' + ['A', 'B', 'C'].slice(0, count).map((name) =>
                    `[igs-char:${name}|smile|Hello]`).join('\n') });
            pipeline.tagRecall.recall = async () => ({ ok: true, value: {
                positions: [{ slotId: 1, anchorSentence: '二段。', keys: [] }], unmatchedKeys: [] } });
        },
    });

    let cg;
    try {
        f.assets.characterDna = {};
        f.assets.characters = Object.fromEntries(f.names.map((name) => [name, {}]));
        const consistencyWrite = f.backend.writeDbgenPrompt;
        f.backend.writeDbgenPrompt = async (request) => {
            if (request.promptTask.purpose === 'consistency') return consistencyWrite(request);
            const name = request.promptTask.characters[0].characterKey;
            const output = characterWriteFixture(request, { subject: `${name}, an adult with silver hair and blue eyes,`,
                scene: 'Adults meet in a cafe.', action: 'wears a blue coat and waves.' });
            for (const entry of output.captions) {
                // 普通 CG 输入是允许池；本次模拟写词结果显式选择景别。
                if (request.promptTask.purpose === 'cg') {
                    entry.promptRecipe.bindings.forEach((binding) => { binding.framing = 'half_body'; });
                    entry.characterMeta.characters.forEach((meta, index) => {
                        const centers = [{ x: (index + 0.5) / count, y: 0.5 }];
                        meta.centers = centers;
                        entry.caption.v4_prompt.caption.char_captions[index].centers = centers;
                        entry.caption.v4_negative_prompt.caption.char_captions[index].centers = centers;
                    });
                }
                for (const meta of entry.characterMeta.characters) {
                    meta.outfit = { name: '冬装', description: `wears coat-${meta.characterKey}` };
                    entry.caption.v4_prompt.caption.char_captions[meta.captionIndex].char_caption =
                        `<<dna:${entry.promptRecipe.bindings[meta.captionIndex].token}>> <<outfit:${entry.promptRecipe.bindings[meta.captionIndex].token}>>.`;
                }
                for (const candidate of entry.dnaCandidates?.characters || []) {
                    candidate.views.portrait.subject = `${candidate.characterKey}, an adult with silver hair and blue eyes,`;
                }
            }
            return output;
        };
        const assetIdb = createTransactionalIdb();
        const openSprites = () => createAssetGenerationService({ nai: f.adapter, mediaCache: f.mediaCache,
            store: createIndexedDbGeneratedAssetStore({ indexedDB: assetIdb }),
            messageHost: { getChatId: () => 'c1' }, llm: {},
            getSettings: () => ({ autoIllustration: {}, sceneAssets: f.assets }), report() {},
            newId: () => `chain-sprite-${++sequence}`, matte: async (url) => url });
        sprites = openSprites();
        for (const name of f.names) {
            const generated = await sprites.generateCharacterSprite({ name, dna: {} });
            assert.equal(generated.ok, true, JSON.stringify(generated));
            assert.equal(f.assets.characterDna[name], undefined, '生成成功不登记身份');
            const record = await openSprites().readStoredImage(generated.imageId);
            assert.equal(record.sentPrompt.action, 'generate');
            const adoption = prepareSpriteIdentityAdoption(f.assets, name, record.id, record);
            assert.equal(adoption.ok, true, JSON.stringify(adoption));
            Object.assign(f.assets, adoption.patch);
            f.assets.characters[name].默认 = `igs-gen:${record.id}`;
            assert.deepEqual(f.assets.characterDna[name].views, record.dnaCandidates.characters[0].views);
        }
        const adopted = structuredClone(f.assets);
        assert.equal(f.writes.length, count, '每张立绘同次写词产生三景别');
        assert.equal(f.wires.length, count);
        cg = await cgTemplateRun('dbgen', '', f.assets, 1, { store: f.store, backend: f.adapter,
            deps: { mediaCache: f.mediaCache } });
        assert.equal(cg.result.ok, true, JSON.stringify(cg.result));
        assert.equal(f.writes.length, count + 1, '普通 CG 只用一次写词');
        const key = 'c1|5|0|1';
        const original = await f.rawStore.getSlotRecord(key);
        assert.equal(original.characterMeta.characters.length, count);
        assert.ok(original.dnaSnapshot.characters.every((c) => c.source === 'saved'));
        assert.deepEqual(f.assets, adopted, 'CG 不改身份或采用资料');
        const firstName = f.names[0];
        f.assets.characterDna[firstName].views.half_body.subject = `${firstName}, an adult with black hair and blue eyes,`;
        const target = { key: 'c1|5|0', floor: cg.fake.messageHost.readFloor(5), slot: 1 };
        assert.equal((await cg.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot: 1 })).ok, true);
        const redrawn = await f.rawStore.getSlotRecord(key);
        assert.equal(redrawn.dnaSnapshot.characters.find((c) => c.characterKey === firstName).subject,
            f.assets.characterDna[firstName].views.half_body.subject);
        assert.notEqual(original.dnaSnapshot.characters[0].subject, redrawn.dnaSnapshot.characters[0].subject);
        assert.equal(f.writes.length, count + 1, '模板重画不再次写词');
        const currentAssets = structuredClone(f.assets);
        const candidate = await f.service.run(target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.equal(f.writes.length, count * 2 + 1, '立绘与普通 CG 写词后，仅为一致性局部轮次写词');
        assert.equal(f.wires.length, count * 2 + 2, '立绘、CG、重画和逐角色 infill 的实际发送数');
        assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
        const saved = await createIndexedDbIllustrationStore({ indexedDB: f.indexedDB }).getSlotRecord(key);
        assert.equal(saved.consistencyPrompt.rounds.length, count);
        assert.equal(saved.sentPrompt, undefined);
        assert.deepEqual(saved.consistencyBaselineMeta.sentPrompt, redrawn.sentPrompt);
        assert.equal(saved.consistencyBaselineDataUrl, redrawn.dataUrl);
        assert.equal(deleted.includes(redrawn.dataUrl), false);
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.ok(backup?.slots?.[key], '接受后的记录确实上传到备份');
        const fresh = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
        const restored = withTavernIllustrationFiles(fresh, globalObject);
        await restored.listSlotKeys();
        const copy = await fresh.getSlotRecord(key);
        assert.ok(copy, '备份恢复后从权威存储回读记录');
        for (const field of ['prompt', 'promptRecipe', 'dnaSnapshot', 'characterMeta', 'consistencyPrompt', 'consistencyBaselineMeta'])
            assert.deepEqual(copy[field], saved[field], field);
        assert.equal((await restored.getSlots(target.key)).find((r) => r.slot === 1).dataUrl, candidate.dataUrl);
        const { createCgLibrary } = await import('../src/media/cg-library.js');
        const library = createCgLibrary({ illustrationStore: restored, mediaCache: f.mediaCache });
        assert.deepEqual(await library.readFull({ key, kind: 'cg' }),
            { ok: true, dataUrl: candidate.dataUrl }, '图库从恢复后的权威记录读取采用图片');
        assert.deepEqual(f.assets, currentAssets, '一致性及恢复不写 DNA');
        assert.equal(f.service.isBusy(), false);
    } finally { cg?.dispose(); f.dispose(); }
});

for (const mode of ['outfit', 'missing']) test(`gate:cg-consistency:诊断日志 ${mode} 可回读且拒发`, async () => {
    const { createImageJobLog } = await import('../src/generated-images/image-job-log.js');
    const f = await consistencyFixture();
    const write = f.backend.writeDbgenPrompt;
    f.backend.writeDbgenPrompt = async (request) => {
        const reply = await write(request);
        if (!reply.captions.some((entry) => entry.slotId === 2)) return reply;
        if (mode === 'missing') reply.captions.pop();
        else reply.captions.find((entry) => entry.slotId === 2).characterMeta.characters[0].outfit.description = 'PRIVATE-OUTFIT-CONTENT';
        return reply;
    };
    const result = await f.service.redrawConsistency(f.query);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'DNA_TEMPLATE_BINDING');
    assert.equal(result.diagnostics.field, mode === 'outfit' ? 'outfit.description' : 'captions.length');
    assert.match(result.error, mode === 'outfit' ? /slotid 2.*outfit.description/ : /captions.length/);
    if (mode === 'outfit') assert.equal(result.diagnostics.slotId, 2);
    assert.equal(f.calls.length, 0);
    assert.equal(f.writes.length, 2);
    assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
    const recovered = createImageJobLog({ storage: f.logStorage }).list();
    assert.ok(recovered.some((entry) => entry.level === 'error' && entry.message.includes(result.diagnostics.field)));
    assert.ok(recovered.some((entry) => entry.message.includes('DNA_TEMPLATE_BINDING')));
    assert.equal(JSON.stringify(recovered).includes('PRIVATE-OUTFIT-CONTENT'), false);
    assert.equal(JSON.stringify(recovered).includes('new-A'), false);
});

test('gate:cg-consistency:写词约束明确照抄衣装且候选与接受日志可回读', async () => {
    const { createImageJobLog } = await import('../src/generated-images/image-job-log.js');
    const f = await consistencyFixture();
    const candidate = await f.service.redrawConsistency(f.query);
    assert.equal(candidate.ok, true, candidate.error);

    assert.equal(f.writes.length, 2, '各局部工作轮次独立写词');
    const pending = createImageJobLog({ storage: f.logStorage }).list();
    assert.ok(pending.some((entry) => entry.message.includes('候选已生成') && entry.message.includes('尚未保存')));
    assert.equal(pending.some((entry) => entry.message.includes('已接受并保存')), false);
    assert.equal((await f.service.acceptConsistency(candidate.candidateId)).ok, true);
    assert.ok(createImageJobLog({ storage: f.logStorage }).list().some((entry) => entry.message.includes('已接受并保存')));
});

test('gate:cg-consistency:实际接受同槽替换进入图库刷新并可删除', async () => {
    const { withCgIndexSync } = await import('../src/media/cg-library.js');
    const { createMemoryCgIndexStore } = await import('../src/media/cg-index-store.js');
    const { createMemoryCgGalleryStore } = await import('../src/media/cg-gallery-store.js');
    const { createMemoryPhotoAlbumStore } = await import('../src/media/photo-album.js');
    const { createItemAndCgServices } = await import('../src/core/item-cg-services.js');
    const { createCgLibraryView } = await import('../src/visual/igs-ui/cg-library-view.js');
    const listeners = new Set(), notified = [];
    const events = { on(name, handler) {
        assert.equal(name, 'igs:illustration-updated'); listeners.add(handler);
        return () => listeners.delete(handler);
    }, emit(name, payload) { notified.push({ name, payload }); for (const fn of listeners) fn(payload); } };
    const { fixtureMedia } = await import('./helpers/media-fixtures.js');
    const mediaCache = fixtureMedia();
    const indexStore = createMemoryCgIndexStore({ mediaCache });
    const f = await consistencyAdapterFixture(2, store => withCgIndexSync(store, indexStore), {
        onAccepted(target) { events.emit('igs:illustration-updated', { chatId: target.floor.chatId,
            messageId: target.floor.messageId, swipeId: target.floor.swipeId, slot: target.slot }); },
    });
    let view;
    try {
        const source = await f.codec.encodePixels(f.pixels.get('original'));
        const before = await f.store.putSlot(f.key, { ...f.before, dataUrl: source });
        const thumbOf = src => 'data:image/jpeg;base64,' + Buffer.from(src).toString('base64');
        const globalObject = { setTimeout, clearTimeout,
            Image: class {
                set src(value) {
                    this.source = value;
                    this.naturalWidth = 128; this.naturalHeight = 64;
                    queueMicrotask(() => this.onload());
                }
            },
            document: { createElement(tag) {
                assert.equal(tag, 'canvas');
                let image;
                return { getContext: () => ({ drawImage(value) { image = value; } }),
                    toDataURL: () => thumbOf(image.source) };
            } },
        };
        const { cgGallery } = createItemAndCgServices({ globalObject, events, mediaCache,
            illustrationStore: f.store, cgIndexStore: indexStore, itemImageService: {},
            cgGalleryStore: createMemoryCgGalleryStore(), photoAlbumStore: createMemoryPhotoAlbumStore(),
            clearIllustration: async query => {
                await f.store.deleteSlot(`${query.chatId}|${query.messageId}|${query.swipeId}`, query.slot);
                events.emit('igs:illustration-updated', query);
                return { ok: true };
            } });
        view = createCgLibraryView(cgGallery);
        await view.open(); await view.whenIdle();
        assert.equal(view.state.entries.length, 1);
        assert.equal(view.tileOf(before.key).url, thumbOf(source));
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.equal(notified.length, 0, '候选不刷新正式图库');
        assert.equal((await f.store.getSlotRecord(before.key)).dataUrl, source);
        assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
        await view.whenIdle();
        const entry = view.find(before.key);
        assert.ok(entry?.ready);
        assert.equal(view.state.entries.length, 1, '替换同槽，不额外新建图');
        assert.equal((await f.store.listSlotKeys()).length, 1);
        assert.equal(view.tileOf(entry.key).url, thumbOf(candidate.dataUrl));
        assert.equal((await cgGallery.readFull(entry)).dataUrl, candidate.dataUrl);
        const saved = await f.store.getSlotRecord(before.key);
        assert.equal(saved.consistencyBaselineDataUrl, source);
        assert.equal(entry.revisionToken, saved.revisionToken);
        assert.equal(notified.length, 1);
        assert.equal((await cgGallery.remove(entry)).ok, true);
        await view.whenIdle();
        assert.equal(await f.store.getSlotRecord(before.key), null);
        assert.equal((await indexStore.getAll()).length, 0);
        assert.equal(view.state.entries.length, 0);
    } finally { view?.dispose(); f.dispose(); }
    assert.equal(listeners.size, 0, '图库卸载解除订阅');
});

test('gate:cg-consistency:并发写词重绘同基线且乱序结果固定合成', { timeout: 5000 }, async () => {
    const { planReferenceCanvas, buildReferencePixels, composeReferencePixels } = await import('../src/media/cg-reference-canvas.js');
    const f = await consistencyFixture();
    const meta = structuredClone(f.before.characterMeta);
    meta.characters.forEach((c) => { c.region = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }; });
    await f.store.putSlot(f.key, { ...f.before, characterMeta: meta });
    const writes = [], edits = [], generated = new Map();
    let writingReady, editingReady;
    const writing = new Promise((resolve) => { writingReady = resolve; });
    const editing = new Promise((resolve) => { editingReady = resolve; });
    const write = f.backend.writeDbgenPrompt, edit = f.backend.edit;
    f.backend.writeDbgenPrompt = (req) => new Promise((resolve) => {
        writes.push({ req, resolve }); if (writes.length === 2) writingReady();
    });
    f.backend.edit = (req) => new Promise((resolve) => {
        edits.push({ req, resolve }); if (edits.length === 2) editingReady();
    });
    const pending = f.service.redrawConsistency(f.query);
    await writing;
    assert.equal(f.calls.length, 0, '写词尚未对账，不发送图像请求');
    for (const item of writes.slice().reverse()) item.resolve(await write(item.req));
    await editing;
    const baseline = structuredClone(f.pixels.get('original'));
    for (const item of edits.slice().reverse()) {
        const key = item.req.promptRecipe.bindings.find((b) => b.kind === 'reference').characterKey;
        const plan = planReferenceCanvas(128, 64, meta, key);
        const expected = buildReferencePixels(baseline, f.pixels.get(`reference-${key}`), plan);
        assert.deepEqual(f.pixels.get(item.req.sourceDataUrl), expected.image);
        const result = await edit(item.req);
        generated.set(key, f.pixels.get(result.dataUrl)); item.resolve(result);
    }
    const candidate = await pending;
    assert.equal(candidate.ok, true, JSON.stringify(candidate));
    assert.equal(candidate.originalDataUrl, 'original');
    let expected = baseline;
    for (const key of f.names) expected = composeReferencePixels(expected, generated.get(key), planReferenceCanvas(128, 64, meta, key));
    assert.deepEqual(f.pixels.get(candidate.dataUrl), expected);
    assert.deepEqual(baseline, f.pixels.get('original'), '原图不被修改');
    assert.equal((await f.service.acceptConsistency(candidate.candidateId)).ok, true);
    assert.deepEqual((await f.store.getSlotRecord(f.before.key)).consistencyPrompt.rounds.map((r) => r.characterKey), f.names);
});

test('gate:cg-consistency:强度归一自定义wire和失效门禁', async () => {
    const { normalizeAutoIllustrationSettings } = await import('../src/generated-images/illustration/auto-illustration-settings.js');
    for (const [input, expected] of [[undefined, 0.6], [null, 0.6], ['', 0.6], [0.75, 0.75], ['bad', 'bad'], [-1, -1], [2, 2], ['0.4', 0.4]]) {
        assert.equal(normalizeAutoIllustrationSettings({ consistencyStrength: input }).consistencyStrength, expected);
    }
    const f = await consistencyAdapterFixture(2);
    try {
        f.igsSettings.autoIllustration = { consistencyStrength: 0.4 };
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.ok(f.edits.every((r) => r.strength === 0.4));
        assert.ok(f.wires.every((r) => r.parameters.inpaintImg2ImgStrength === 0.4));
        assert.ok(f.wires.every((r) => r.parameters.img2img.strength === 0.4));
        f.igsSettings.autoIllustration.consistencyStrength = 0.8;
        assert.equal((await f.service.accept(candidate.candidateId)).reason, 'stale-config');
        assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
    } finally { f.dispose(); }
    const changed = await consistencyFixture();
    const write = changed.backend.writeDbgenPrompt;
    changed.backend.writeDbgenPrompt = async (req) => {
        const result = await write(req);
        changed.igsSettings.consistencyStrength = 0.5;
        return result;
    };
    assert.equal((await changed.service.redrawConsistency(changed.query)).reason, 'stale-config');
    assert.equal(changed.calls.length, 0);
});

test('gate:cg-consistency:非法强度与缺能力零请求且不改设置', async () => {
    const f = await consistencyAdapterFixture(1);
    try {
        for (const value of [0, 0.05, -1, 2, NaN, Infinity, 'bad', true, {}]) {
            f.igsSettings.autoIllustration = { consistencyStrength: value };
            const result = await f.service.run(f.target);
            assert.equal(result.reason, 'consistency-strength-invalid');
            assert.equal(f.igsSettings.autoIllustration.consistencyStrength, value);
            assert.equal(f.writes.length, 0);
            assert.equal(f.edits.length, 0);
            assert.equal(f.wires.length, 0);
            assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
        }
        f.igsSettings.autoIllustration = { consistencyStrength: 0.4 };
        const capabilities = f.api.getPromptCapabilities;
        f.api.getPromptCapabilities = () => {
            const { infillImg2imgStrength, ...legacy } = capabilities();
            return legacy;
        };
        assert.equal(Object.hasOwn(f.adapter.describeEdit(), 'infillImg2imgStrength'), false);
        assert.equal((await f.service.run(f.target)).reason, 'dbgen-infill-strength-required');
        f.api.getPromptCapabilities = () => {
            const { providedPromptContext, ...legacy } = capabilities();
            return legacy;
        };
        assert.equal((await f.service.run(f.target)).reason, 'dbgen-provided-context-required');
        assert.equal(f.writes.length, 0);
        assert.equal(f.edits.length, 0);
        assert.equal(f.wires.length, 0);
        f.api.getPromptCapabilities = () => {
            const { appearanceCorrection, ...legacy } = capabilities();
            return legacy;
        };
        assert.equal(Object.hasOwn(f.adapter.describeEdit(), 'appearanceCorrection'), false);
        const request = { description: '校正任务', characterContext: f.names.map(characterKey => ({ characterKey, dna: f.assets.characterDna[characterKey] })),
            promptTask: { version: 1, mode: 'dna_template', purpose: 'consistency', identityMode: 'appearance_correction', characters: [
                { kind: 'reference', characterKey: f.names[0], token: 'ref0', framing: 'portrait' }] } };
        assert.equal((await f.adapter.writeDbgenPrompt(request)).reason, 'dbgen-appearance-correction-required');
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.equal(f.writes.length, 1);
        assert.equal(f.wires.length, 1);
        f.service.cancel(candidate.candidateId);
    } finally { f.dispose(); }
});

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

for (const duplicate of [false, true]) test(`gate:cg-consistency:单轮清单双端真实解析-${duplicate ? '重复拒收' : '同名参考分离'}`, async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { parseTemplateCaptionSlots } = await import('../src/generated-images/illustration/template-caption-parser.js');
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const { Ok } = await import('../../../nai-dbgen/src/infra/result.js');
    const f = await consistencyFixture(), pipelines = [], requests = [];
    const adapter = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
        global: { NaiDbGen: { async generate() { assert.fail('写词不得发送图像请求'); },
            getPromptCapabilities: () => ({ providedPromptContext: 1 }),
            async generateSinglePrompt(req) {
            requests.push(req);
            const { text, output } = consistencyFlatReply(req);
            const reply = duplicate && output.slotId === 2
                ? text + '\nmeta_outfit_description: 0 | PRIVATE-DUPLICATE' : text;
            const igs = parseTemplateCaptionSlots(reply, req);
            assert.equal(igs.ok, !(duplicate && output.slotId === 2));
            const p = buildPipeline({ llmComplete: async () => Ok({ text: reply, json: null }) });
            pipelines.push(p);
            const result = await p.workbench.writePrompt({ contextMode: req.contextMode,
                naturalLanguage: req.description, characterContext: req.characterContext, promptTask: req.promptTask });
            if (result.ok) for (const field of ['caption', 'promptRecipe', 'characterMeta'])
                assert.deepEqual(result.value[field], igs.captions[0][field], field);
            return result;
        } } } });
    f.backend.writeDbgenPrompt = (req) => adapter.writeDbgenPrompt(req);

    try {
        const result = await f.service.redrawConsistency(f.query);
        assert.equal(requests.length, 2);
        assert.ok(pipelines.every((p) => p.naiCalls.length === 0 && p.llmCalls.length === 1));
        if (duplicate) {
            assert.equal(result.ok, false);
            assert.equal(result.reason, 'DNA_TEMPLATE_BINDING');
            assert.equal(result.diagnostics.field, 'meta_outfit_description');
            assert.equal(result.diagnostics.issue, 'duplicate');
            assert.equal(result.diagnostics.slotId, 2);
            assert.equal(result.diagnostics.captionIndex, 0);
            assert.equal(f.calls.length, 0);
            const error = f.reports.find((r) => r.level === 'error').message;
            assert.match(error, /prompt-parse.*meta_outfit_description.*duplicate.*slotid 2.*Char 0/);
            assert.doesNotMatch(error, /PRIVATE-DUPLICATE|coat-A|new-A/);
        } else {
            assert.equal(result.ok, true, JSON.stringify(result));
            assert.equal(f.calls.length, 2);
            for (const request of f.calls) {
                const named = request.promptRecipe.bindings.find((b) => b.kind === 'named');
                const ref = request.promptRecipe.bindings.find((b) => b.kind === 'reference');
                assert.equal(named.characterKey, ref.characterKey);
                assert.notEqual(named.captionIndex, ref.captionIndex);
                assert.notEqual(named.token, ref.token);
            }
            f.service.cancelConsistency(result.candidateId);
        }
        assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
    } finally { for (const p of pipelines) p.imageGen.dispose(); }
});


for (const mode of ['nai', 'dbgen']) {
    for (const fault of ['none', 'save', 'scope', 'owner', 'wire', 'missing', 'revision', 'wardrobe']) {
        test(`gate:cg-outfit:${mode}:${fault}:权威回读与衣装确认门禁`, async () => {
            const { captureOutfitScope, prepareCgOutfitCandidates, prepareStoryOutfitAdoption, savedCharacterOutfits } = await import('../src/scene/outfit-identity.js');
            const { loadStoryOutfitCandidates, saveStoryOutfitCandidates } = await import('../src/scene/outfit-review-store.js');
            const { createMemoryStorage } = await import('../src/index.js');
            const { effectiveSceneAssets } = await import('../src/scene/asset-scope.js');
            const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
            const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
            let root = { ...cgTemplateAssets(), cards: {} }, scope = 'card:Active';
            const assets = effectiveSceneAssets(root, scope), before = structuredClone(root);
            const raw = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
            const reports = [], adopted = [];
            const storage = createMemoryStorage();
            let saves = 0, reads = 0;
            const store = { ...raw, async getSlotRecord(key) {
                const record = await raw.getSlotRecord(key);
                if (record?.status !== 'done') return record;
                reads++;
                if (fault === 'missing') return null;
                if (fault === 'wire') record.sentPrompt.caption.v4_prompt.caption.char_captions[0].char_caption += ' altered';
                if (fault === 'revision') record.revisionToken += '-stale';
                if (fault === 'scope') scope = 'card:Other';
                if (fault === 'owner') root.cards['card:Active'] = { characters: { Alice: {} } };
                if (fault === 'wardrobe') {
                    root.characterOutfits = { Alice: { Coat: { wardrobe: 'changed' } } };
                    root.wardrobe = { changed: { prompt: 'wears a red coat' } };
                }
                return record;
            } };
            const slot = mode === 'nai' ? 1 : 6;
            const run = await cgTemplateRun(mode, cgTemplateText(slot, mode === 'nai' ? 2 : undefined,
                [{ key: 'Alice', token: 'r0' }, { key: 'Bob', token: 'r1', x: 0.7 }]), assets, 1, {
                store, deps: {
                    report: (...args) => reports.push(args),
                    captureCgOutfitScope: keys => captureOutfitScope(root, scope, keys),
                    async stageCgOutfits(record, floor) {
                        adopted.push(record);
                        const prepared = prepareCgOutfitCandidates(root, scope, record, floor);
                        if (!prepared.ok) return prepared;
                        const loaded = loadStoryOutfitCandidates(storage);
                        const fresh = prepared.items.filter(row => !loaded.items.some(old => old.id === row.id));
                        if (!fresh.length) return { ok: true };
                        saves++;
                        await Promise.resolve();
                        if (fault === 'save') return { ok: false, reason: 'settings-save-failed' };
                        return saveStoryOutfitCandidates(storage, fresh);
                    },
                },
            });
            try {
                assert.equal(run.result.ok, true, JSON.stringify(run.result));
                assert.equal(run.wires.length, 1, '登记失败不重复生成');
                assert.equal(run.writes.length + run.llmRequests.length, 1, '候选来自同次写词');
                const record = await raw.getSlotRecord(`c1|5|0|${slot}`);
                assert.equal(record.status, 'done');
                assert.ok(record.dataUrl);
                assert.equal(reads, 1, '采用前权威回读');
                assert.deepEqual(root.characterDna, before.characterDna);
                if (fault === 'none') {
                    assert.equal(saves, 1);
                    assert.equal(adopted.length, 1);
                    assert.equal(adopted[0].revisionToken, record.revisionToken);
                    assert.deepEqual(root, before, 'CG 成功不自动改写衣柜');
                    const rows = loadStoryOutfitCandidates(storage).items;
                    assert.equal(rows.length, 2);
                    for (const row of rows) {
                        const confirmed = prepareStoryOutfitAdoption(root, scope, row);
                        assert.equal(confirmed.ok, true);
                        root = confirmed.sceneAssets;
                    }
                    Object.assign(assets, effectiveSceneAssets(root, scope));
                    for (const name of ['Alice', 'Bob']) assert.deepEqual(savedCharacterOutfits(
                        root, name), [{ name: 'Coat', description: 'wears a blue coat' }]);
                    assert.equal(root.cards['card:Active'], undefined, '全局角色写回冻结的全局归属');
                    assert.equal(reports.some(args => args[0] === 'warn'), false);
                    const saved = structuredClone(root);
                    assert.equal((await run.service.rerollSlot({ chatId: 'c1', messageId: 5, swipeId: 0, slot })).ok, true);
                    assert.equal(run.wires.length, 2);
                    assert.equal(saves, 1, '已有衣装复用不重写');
                    assert.deepEqual(root, saved);
                } else {
                    assert.ok(reports.some(args => args[0] === 'warn' && args[1].includes('衣装候选未暂存')));
                    assert.equal(loadStoryOutfitCandidates(storage).items.length, 0, '暂存失败不留下部分候选');
                    assert.equal(savedCharacterOutfits(root, 'Bob').length, 0,
                        '多人物任一冲突不留下部分登记');
                    if (fault === 'wardrobe') assert.equal(savedCharacterOutfits(root, 'Alice')[0].description, 'wears a red coat');
                    else assert.equal(savedCharacterOutfits(root, 'Alice').length, 0);
                    if (fault === 'save') assert.deepEqual(root, before, '保存失败不替换内存或衣柜');
                }
            } finally { run.dispose(); }
        });
    }
}

for (const model of ['nai-diffusion-5-curated', 'nai-diffusion-3', 'unknown']) {
    test(`gate:cg-consistency:${model}:unsupported-before-writing`, async () => {
        const f = await consistencyAdapterFixture(2);
        f.igsSettings.autoIllustration = { consistencyModel: model };
        try {
            const before = await f.store.getSlotRecord(f.target.key);
            const result = await f.service.run(f.target);
            assert.equal(result.ok, false);
            assert.equal(result.reason, 'consistency-model-invalid');
            assert.equal(f.writes.length, 0);
            assert.equal(f.wires.length, 0);
            assert.deepEqual(await f.store.getSlotRecord(f.target.key), before);
            assert.deepEqual(f.assets, f.originalAssets);
        } finally { f.dispose(); }
    });
}

test('gate:cg-consistency:模型归一与协商拒发保留设置和原图', async () => {
    const { normalizeAutoIllustrationSettings, isConsistencyModelValid } = await import('../src/generated-images/illustration/auto-illustration-settings.js');
    for (const value of [undefined, null, ''])
        assert.equal(normalizeAutoIllustrationSettings({ consistencyModel: value }).consistencyModel, 'nai-diffusion-5-full-inpainting');
    for (const value of ['unknown', true, {}, 5]) {
        assert.equal(normalizeAutoIllustrationSettings({ consistencyModel: value }).consistencyModel, value);
        assert.equal(isConsistencyModelValid(value), false);
    }
    for (const mode of ['legacy', 'mismatch', 'unsupported']) {
        const f = await consistencyAdapterFixture(1);
        try {
            const capabilities = f.api.getPromptCapabilities;
            if (mode === 'legacy') f.api.getPromptCapabilities = () => {
                const { infillModelNegotiation, ...legacy } = capabilities();
                return legacy;
            };
            else f.api.describeInfill = () => mode === 'mismatch'
                ? { supported: true, model: 'nai-diffusion-4-5-full-inpainting', reason: '' }
                : { supported: false, reason: 'infill-model-unsupported' };
            const expected = mode === 'legacy' ? 'dbgen-infill-model-required'
                : mode === 'mismatch' ? 'dbgen-infill-model-mismatch' : 'infill-model-unsupported';
            assert.equal((await f.service.run(f.target)).reason, expected);
            assert.equal(f.writes.length, 0);
            assert.equal(f.edits.length, 0);
            assert.equal(f.wires.length, 0);
            assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before);
            assert.deepEqual(f.assets, f.originalAssets);
        } finally { f.dispose(); }
    }
});


test('gate:cg-consistency:切换独立模型停止发送与候选提交', async () => {
    for (const phase of ['write', 'queued', 'candidate', 'commit']) {
        const f = await consistencyAdapterFixture(2);
        const mutate = () => { f.igsSettings.autoIllustration = { consistencyModel: 'nai-diffusion-4-5-full-inpainting' }; };
        const stable = structuredClone(f.settings);
        try {
            if (phase === 'write') {
                const write = f.backend.writeDbgenPrompt;
                f.backend.writeDbgenPrompt = async (request) => { const result = await write(request); mutate(); return result; };
            }
            if (phase === 'queued') {
                const generate = f.api.generate;
                f.api.generate = async (request) => { mutate(); return generate(request); };
            }
            const result = await f.service.run(f.target);
            if (phase === 'candidate' || phase === 'commit') {
                assert.equal(result.ok, true, JSON.stringify(result));
                if (phase === 'candidate') mutate();
                else {
                    const update = f.store.updateSlot;
                    f.store.updateSlot = async (...args) => { mutate(); return update(...args); };
                }
                assert.equal((await f.service.accept(result.candidateId)).reason, 'stale-config', phase);
            } else assert.equal(result.reason, 'stale-config', phase);
            assert.equal(f.wires.length, ['write', 'queued'].includes(phase) ? 0 : 2, phase);
            assert.deepEqual(f.settings, stable, '独立模型切换不修改全局配置');
            assert.deepEqual(await f.store.getSlotRecord(f.before.key), f.before, phase);
            assert.deepEqual(f.assets, f.originalAssets);
        } finally { f.dispose(); }
    }
});


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

for (const model of ['nai-diffusion-4-5-full-inpainting', 'nai-diffusion-5-full-inpainting']) {
    for (const count of [1, 3]) test(`内置一致性无 DBG：${model} ${count} 人真实写词、infill 与采用`, async t => {
        const f = await consistencyBuiltinFixture(count, model);
        t.after(() => f.dispose());
        const { createGenerationStrip } = await import('../src/visual/igs-ui/generation-strip.js');
        const strip = createGenerationStrip(), phases = [], progressTask = {};
        t.after(() => strip.dispose());
        const cap = f.backend.describeEdit(undefined, { model });
        assert.equal(cap.via, 'nai');
        assert.equal(cap.providedPromptContext, 1);
        const initialOptions = Object.freeze({ onProgress() { assert.fail('生成阶段使用新的进度接收者'); } });
        const ready = await f.service.preflight(f.target, initialOptions);
        assert.equal(ready.reason, 'ready', JSON.stringify(ready));
        const candidate = await f.service.run(f.target, { preflightToken: ready.preflightToken,
            onProgress(detail) {
                phases.push(detail.phase);
                strip.progress(progressTask, detail);
                if (detail.phase !== 'done') {
                    assert.equal(strip.getState().phase, 'busy');
                    assert.match(strip.getState().tip, /一致性重绘：/);
                }
            } });
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.deepEqual([...new Set(phases)], ['prepare', 'reference', 'write', 'paint', 'compose', 'done']);
        assert.equal(strip.getState().jobs, 0);
        assert.equal(strip.getState().phase, 'done');
        assert.equal(candidate.width, 128); assert.equal(candidate.height, 64);
        assert.equal(f.writes.length, count); assert.equal(f.wires.length, count);
        assert.equal(f.edits.length, count); assert.equal(f.maxActive, 1);
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
        for (const { request } of f.writes) {

            const data = JSON.parse(request.messages[2].content);
            assert.deepEqual(data.originalPrompt, f.before.promptRecipe.caption);
            assert.ok(data.layout); assert.ok(data.promptTask); assert.ok(data.characterContext.length);
            const edit = f.edits.find(row => row.slotId === data.outputs.slotIds[0]);
            assert.deepEqual(data.outputs.size, { width: edit.width, height: edit.height });
            assert.equal(data.writingRequirements.size, `${edit.width}x${edit.height}`);
            assert.ok(data.layout.work.width < edit.width, '局部工作区不冒充完整参考画布');
            assert.equal(data.writingRequirements.quality, 'High quality illustration.');
            const placement = data.layout.referenceContent;
            assert.ok(placement);
            const reference = data.outputs.rows.find(row => row.kind === 'reference');
            assert.equal(reference.centers[0].x, (placement.x + placement.width / 2) / f.edits[0].width);
            assert.equal(reference.centers[0].y, (placement.y + placement.height / 2) / f.edits[0].height);
            assert.equal(data.outputs.slotIds.length, 1);
            for (const key of f.forbidden) assert.equal(Object.hasOwn(data, key), false, key);
        }
        for (const wire of f.wires) {
            assert.equal(wire.action, 'infill'); assert.equal(wire.model, model);
            assert.equal(wire.parameters.seed, f.assets.characterSeeds[f.names[0]], '全部局部使用第一个角色种子');
            assert.ok(wire.parameters.image); assert.ok(wire.parameters.mask);
            assert.ok(wire.parameters.width * wire.parameters.height <= 1024 * 1024);
            const prompt = JSON.stringify(wire.parameters.v4_prompt);
            assert.ok(prompt.includes('artist:fixture'));
            assert.equal(prompt.includes('<<dna:'), false);
            assert.equal(prompt.includes('<<outfit:'), false);
        }
        assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
        const saved = await f.rawStore.getSlotRecord(f.before.key);
        assert.equal(saved.consistencyBaselineDataUrl, 'original');
        assert.deepEqual(saved.promptRecipe, f.before.promptRecipe);
        assert.deepEqual(saved.caption, f.before.caption);
        assert.deepEqual(saved.characterMeta, f.before.characterMeta);
        assert.deepEqual(saved.consistencyBaselineMeta.promptRecipe, f.before.promptRecipe);
        assert.equal(saved.consistencyPrompt.rounds.length, count);
        for (const round of saved.consistencyPrompt.rounds) {
            assert.equal(round.sentPrompt.action, 'infill'); assert.equal(round.sentPrompt.model, model);
            assert.equal(round.seed, f.assets.characterSeeds[f.names[0]]);
            assert.ok(round.promptRecipe); assert.ok(round.dnaSnapshot);
            assert.equal(round.appearance.version, 1);
            assert.equal(round.appearance.requestedOutfit, '冬装');
            assert.equal(round.appearance.effectiveOutfit, '冬装');
            assert.equal(round.appearance.selectionSource, 'requested');
            assert.equal(round.appearance.confirmed, false);
            assert.match(round.appearance.reference.sourceId, /^[0-9a-f]{16}$/);
            assert.equal(round.appearance.reference.url, undefined, '外部路径只保留受控来源标识');
        }
        assert.deepEqual(f.assets, f.originalAssets);
    });
}

async function waitBuiltinGate(f, count = 1) {
    const deadline = Date.now() + 3000;
    while (f.gates.length < count && Date.now() < deadline)
        await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.gates.length >= count, '隔离端口未到达预期等待点');
}

for (const phase of ['waitWrite', 'waitPaint']) {
    test(`内置一致性取消：${phase} 拒收迟到结果且排队零发送`, async t => {
        let accepted = 0;
        const f = await consistencyBuiltinFixture(3, undefined, { [phase]: true,
            onAccepted: () => accepted++ });
        t.after(() => f.dispose());
        const pending = f.service.run(f.target);
        await waitBuiltinGate(f, phase === 'waitWrite' ? 3 : 1);
        const sent = f.wires.length;
        assert.equal(sent, phase === 'waitPaint' ? 1 : 0);
        assert.equal(f.service.cancel().ok, true);
        const stopped = await pending;
        assert.equal(stopped.ok, false); assert.equal(stopped.reason, 'cancelled');
        f.release();
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(f.wires.length, sent);
        assert.equal(f.active, 0); assert.equal(accepted, 0);
        assert.equal(f.service.isBusy(), false);
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
    });
}

for (const change of ['model', 'nai', 'preset']) {
    test(`内置一致性候选失效：${change} 变化后零提交`, async t => {
        let accepted = 0;
        const f = await consistencyBuiltinFixture(1, undefined, { onAccepted: () => accepted++ });
        t.after(() => f.dispose());
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        if (change === 'model') f.bridge.autoIllustration.consistencyModel = 'nai-diffusion-4-5-full-inpainting';
        else if (change === 'nai') f.bridge.autoIllustration.nai.artistPrefix = 'artist:changed';
        else {
            const current = f.registry.getCurrent('prompt-preset');
            const edited = structuredClone(current);
            edited.data.prompts[0].content += '\n只处理明确提供的资料。';
            assert.equal(f.registry.savePromptPreset(edited, current.data.revision).ok, true);
        }
        const result = await f.service.accept(candidate.candidateId);
        assert.equal(result.ok, false); assert.equal(result.reason, 'stale-config');
        assert.equal(accepted, 0);
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
    });
}


for (const phase of ['waitWrite', 'waitPaint']) {
    test(`内置一致性在途配置变化：${phase} 停止等待且拒收迟到结果`, async t => {
        const f = await consistencyBuiltinFixture(3, undefined, { [phase]: true });
        t.after(() => f.dispose());
        const pending = f.service.run(f.target);
        await waitBuiltinGate(f, phase === 'waitWrite' ? 3 : 1);
        const sent = f.wires.length;
        f.bridge.autoIllustration.nai.artistPrefix = 'artist:changed';
        f.runtime.refresh();
        const stopped = await pending;
        assert.equal(stopped.ok, false);
        assert.equal(stopped.reason, 'stale-config');
        f.release();
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(f.wires.length, sent);
        assert.equal(f.active, 0);
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
    });
}

for (const conflict of ['config', 'revision']) {
    test(`内置一致性提交事务：${conflict} 在异步复核后变化仍拒写`, async t => {
        let f, concurrent, accepted = 0;
        f = await consistencyBuiltinFixture(1, undefined, {
            onAccepted: () => accepted++,
            wrapStore: raw => ({ ...raw, async updateSlot(...args) {
                const options = args[4];
                args[4] = { ...options, async beforeCommit() {
                    await options.beforeCommit();
                    if (conflict === 'config') {
                        f.bridge.autoIllustration.nai.artistPrefix = 'artist:transaction';
                        f.runtime.refresh();
                    } else concurrent = await raw.putSlot(f.key, { ...f.before, error: 'concurrent-update' });
                } };
                return raw.updateSlot(...args);
            } }),
        });
        t.after(() => f.dispose());
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        const rejected = await f.service.accept(candidate.candidateId);
        assert.equal(rejected.ok, false);
        assert.equal(rejected.reason, conflict === 'config' ? 'stale-config' : 'stale-revision');
        assert.equal(accepted, 0);
        assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), concurrent || f.before);
    });
}


for (const edited of [false, true]) {
    test(`内置一致性保真采用：${edited ? '手改定稿' : '原始双 DNA 模板'}与基线快照不变`, async t => {
        const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
        const { storedPromptFromResult, promptFromText } = await import('../src/generated-images/generation-prompt.js');
        const { prefixFinalArtist, promptSnapshotFromBody } = await import('../src/generated-images/final-caption.js');
        const f = await consistencyBuiltinFixture(2);
        t.after(() => f.dispose());
        const recipe = structuredClone(f.before.promptRecipe);
        recipe.outfitMode = 'template';
        for (const b of recipe.bindings) recipe.caption.v4_prompt.caption.char_captions[b.captionIndex].char_caption
            = `<<dna:${b.token}>> <<outfit:${b.token}>> looks over the shoulder.`;
        const context = f.names.map(characterKey => ({ characterKey, dna: f.assets.characterDna[characterKey],
            outfit: f.before.characterMeta.characters.find(c => c.characterKey === characterKey).outfit }));
        const prepared = prepareCharacterCaption({ ...f.before, caption: recipe.caption, promptRecipe: recipe,
            promptTask: { version: 1, mode: 'dna_template', purpose: 'consistency', outfitMode: 'template',
                characters: recipe.bindings.map(({ kind, characterKey, token, framing }) => ({ kind, characterKey, token, framing })) },
            characterContext: context });
        assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const artist = { positivePrompt: 'artist:original', negativePrompt: '' };
        const original = { ...prepared, sentPrompt: promptSnapshotFromBody({ model: 'nai-diffusion-4-full',
            action: 'generate', parameters: prefixFinalArtist(prepared.caption, artist) }, artist) };
        const prompt = edited ? { ...storedPromptFromResult(original),
            ...promptFromText('EDITED-CG: holding the reins beside a stone wall.', 'edited-uc') }
            : storedPromptFromResult(original);
        if (edited) delete prompt.caption;
        const before = await f.rawStore.putSlot(f.key, { ...f.before, ...original, prompt,
            ...(edited && { promptEdited: true, captionMode: 'final' }) });
        const candidate = await f.service.run(f.target);
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        for (const { request } of f.writes) {
            const input = JSON.parse(request.messages[2].content);
            assert.deepEqual(input.originalPrompt, edited ? prompt : recipe.caption);
            assert.equal(input.promptTask.outfitMode, 'template');
            assert.equal(Object.hasOwn(input.promptTask, 'identityMode'), false);
            assert.equal(input.promptTask.slots[0].identityMode, 'appearance_correction');
        }
        assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
        const saved = await f.rawStore.getSlotRecord(before.key);
        const savedPrompt = structuredClone(before.prompt);
        delete savedPrompt.sentPrompt;
        delete savedPrompt.consistencyPrompt;
        assert.deepEqual(saved.prompt, savedPrompt, '正式 prompt 保真且清除旧发送来源');
        assert.deepEqual(saved.consistencyBaselineMeta.prompt, before.prompt, '基线保留完整旧来源');
        for (const field of ['caption', 'promptRecipe', 'dnaSnapshot', 'outfitSnapshot',
            'characterMeta', 'originalSize', 'captionMode', 'promptEdited']) {
            assert.deepEqual(saved[field], before[field], field);
            assert.deepEqual(saved.consistencyBaselineMeta[field], before[field], `baseline.${field}`);
        }
        assert.equal(saved.sentPrompt, undefined, '合成 CG 不伪造整图发送来源');
        assert.equal(saved.consistencyBaselineDataUrl, before.dataUrl);
        assert.deepEqual(saved.consistencyBaselineMeta.sentPrompt, before.sentPrompt);
        for (const round of saved.consistencyPrompt.rounds) {
            assert.equal(round.promptRecipe.outfitMode, 'template');
            assert.equal(round.promptRecipe.identityMode, 'appearance_correction');
            assert.equal(round.promptRecipe.bindings.filter(b => b.kind === 'reference').length, 1);
            assert.equal(round.sentPrompt.action, 'infill');
            assert.match(round.sentPrompt.caption.v4_prompt.caption.base_caption, /reference inset, /);
            for (const b of round.promptRecipe.bindings.filter(b => b.kind === 'named')) {
                const outfit = context.find(c => c.characterKey === b.characterKey).outfit;
                assert.equal(round.outfitSnapshot.characters.find(c => c.token === b.token).description, outfit.description);
                assert.ok(round.sentPrompt.caption.v4_prompt.caption.char_captions[b.captionIndex].char_caption.includes(outfit.description));
            }
        }
        assert.deepEqual(f.assets, f.originalAssets);
    });
}


for (const mode of ['cancel', 'confirm']) test(`衣装预检：多人集中回退-${mode}`, async t => {
    const f = await consistencyBuiltinFixture(2);
    t.after(() => f.dispose());
    for (const name of f.names) {
        f.assets.characterOutfits[name].夏装 = f.assets.characterOutfits[name].冬装;
        f.assets.characterDefaultOutfits[name].outfitName = '夏装';
        f.assets.characterOutfits[name].冬装 = { wardrobe: name, moods: {} };
    }
    const ready = await f.service.preflight(f.target);
    assert.equal(ready.reason, 'needs-confirmation', JSON.stringify(ready));
    assert.equal(ready.confirmations.length, 2);
    assert.equal(f.writes.length, 0); assert.equal(f.wires.length, 0);
    if (mode === 'cancel') {
        f.service.cancel(ready.preflightToken);
        assert.equal(f.service.isBusy(), false);
        assert.equal(f.appearanceSubscriptions, 0);
        assert.equal(f.writes.length, 0); assert.equal(f.wires.length, 0);
        const next = await f.service.preflight(f.target);
        assert.equal(next.ok, true);
        f.service.cancel(next.preflightToken);
    } else {
        assert.equal((await f.service.run(f.target, { preflightToken: ready.preflightToken })).reason, 'confirmation-required');
        const candidate = await f.service.run(f.target, { preflightToken: ready.preflightToken, confirmed: true });
        assert.equal(candidate.ok, true, JSON.stringify(candidate));
        assert.equal(f.writes.length, 2); assert.equal(f.wires.length, 2);
        f.service.cancel(candidate.candidateId);
    }
    assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
});

for (const change of ['default', 'wardrobe', 'scope', 'image', 'target'])
test(`衣装预检：来源失效不可复活-${change}`, async t => {
    const f = await consistencyBuiltinFixture(1);
    t.after(() => f.dispose());
    const ready = await f.service.preflight(f.target);
    assert.equal(ready.reason, 'ready', JSON.stringify(ready));
    if (change === 'image') f.referenceRevisions.set('reference-A', 2);
    else if (change === 'target') f.appearanceChanged({ targetChanged: true });
    else {
        const object = change === 'default' ? f.assets.characterDefaultOutfits.A
            : change === 'scope' ? f.appearanceScope : f.assets.wardrobe.A;
        const field = change === 'default' ? 'outfitName' : change === 'scope' ? 'owner' : 'prompt';
        const old = object[field]; object[field] = 'changed'; f.appearanceChanged();
        object[field] = old; f.appearanceChanged();
    }
    const rejected = await f.service.run(f.target, { preflightToken: ready.preflightToken });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.stopGeneration, true);
    assert.equal(f.writes.length, 0); assert.equal(f.wires.length, 0);
    assert.equal(f.service.isBusy(), false); assert.equal(f.appearanceSubscriptions, 0);
    assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
});


for (const mode of ['missing', 'read-error', 'decode-error', 'same-outfit', 'no-default'])
test(`衣装预检：图片状态-${mode}`, async t => {
    const f = await consistencyBuiltinFixture(1, undefined, mode === 'read-error'
        ? { readReferenceImage: async () => { throw new Error('read-failed'); } } : {});
    t.after(() => f.dispose());
    if (mode === 'missing') f.pixels.delete('reference-A');
    if (mode === 'decode-error') f.codec.decodeImage = async () => { throw new Error('decode-failed'); };
    if (mode === 'no-default') {
        delete f.assets.characterDefaultOutfits.A;
        f.assets.characterOutfits.A.冬装.moods = {};
    }
    if (mode === 'same-outfit') f.assets.characterOutfits.A.冬装.moods.平和 = 'missing-reference';
    if (mode === 'same-outfit') f.assets.characterOutfits.A.冬装.moods.微笑 = 'reference-A';
    const ready = await f.service.preflight(f.target);
    assert.equal(ready.ok, mode === 'same-outfit', JSON.stringify(ready));
    if (mode === 'same-outfit') {
        assert.equal(ready.reason, 'ready');
        assert.deepEqual(ready.confirmations, []);
        f.service.cancel(ready.preflightToken);
    } else {
        assert.equal(ready.reason, { missing: 'outfit-image-missing', 'read-error': 'outfit-image-read-error',
            'decode-error': 'outfit-image-decode-error', 'no-default': 'default-outfit-unset' }[mode]);
    }
    assert.equal(f.writes.length, 0); assert.equal(f.wires.length, 0);
    assert.equal(f.service.isBusy(), false); assert.equal(f.appearanceSubscriptions, 0);
    assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
});


for (const change of ['image', 'wardrobe', 'scope']) test(`衣装预检：候选接受前复核-${change}`, async t => {
    const f = await consistencyBuiltinFixture(1);
    t.after(() => f.dispose());
    const candidate = await f.service.run(f.target);
    assert.equal(candidate.ok, true, JSON.stringify(candidate));
    if (change === 'image') f.referenceRevisions.set('reference-A', 2);
    else if (change === 'wardrobe') f.assets.wardrobe.A.prompt = 'changed';
    else f.appearanceScope.owner = 'other';
    const result = await f.service.accept(candidate.candidateId);
    assert.equal(result.reason, 'stale-appearance', JSON.stringify(result));
    assert.equal(result.stopGeneration, true);
    assert.equal(f.service.isBusy(), false); assert.equal(f.appearanceSubscriptions, 0);
    assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
});

for (const phase of ['waitWrite', 'waitPaint']) test(`衣装预检：在途来源失效立即停止-${phase}`, async t => {
    const f = await consistencyBuiltinFixture(3, undefined, { [phase]: true });
    t.after(() => f.dispose());
    const pending = f.service.run(f.target);
    await waitBuiltinGate(f, phase === 'waitWrite' ? 3 : 1);
    const sent = f.wires.length;
    const old = f.assets.wardrobe.A.prompt;
    f.assets.wardrobe.A.prompt = 'changed'; f.appearanceChanged();
    f.assets.wardrobe.A.prompt = old; f.appearanceChanged();
    const result = await pending;
    assert.equal(result.reason, 'stale-appearance', JSON.stringify(result));
    assert.equal(result.stopGeneration, true);
    f.release();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(f.wires.length, sent);
    assert.equal(f.service.isBusy(), false); assert.equal(f.appearanceSubscriptions, 0);
    assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
});


for (const mode of ['exact', 'empty'])
test(`目标衣装契约：换衣采用保留原快照和永久身份-${mode}`, async t => {
    const { normalizeCharacterDna } = await import('../src/scene/character-dna.js');
    const f = await consistencyBuiltinFixture(1, undefined, { transformReply(reply) {
        return mode === 'empty'
            ? reply.replace(/^meta_outfit_description: 0 \|.*$/m, 'meta_outfit_description: 0 |') : reply;
    } });
    t.after(() => f.dispose());
    f.assets.characterOutfits.A.夏装 = { wardrobe: 'summer', moods: { 平和: 'reference-A' } };
    const description = 'wears a 1.2::light-blue cotton summer shirt:: with silver $& embroidery,';
    f.assets.wardrobe.summer = { prompt: description };
    f.assets.characterOutfits.A.冬装.moods = {};
    f.assets.characterDefaultOutfits.A.outfitName = '夏装';
    const assetsBefore = structuredClone(f.assets);
    const ready = await f.service.preflight(f.target);
    assert.equal(ready.reason, 'needs-confirmation');
    const candidate = await f.service.run(f.target, { preflightToken: ready.preflightToken, confirmed: true });
    assert.equal(candidate.ok, true, JSON.stringify(candidate));
    assert.equal(f.edits[0].characterMeta.characters[0].outfit.description, description);
    assert.ok(f.wires[0].parameters.v4_prompt.caption.char_captions[0].char_caption.includes(description),
        '冻结说明的权重、美元符号及尾逗号原样进入实际请求');
    assert.equal((await f.service.accept(candidate.candidateId)).ok, true);
    const saved = await f.rawStore.getSlotRecord(f.before.key);
    assert.deepEqual(saved.characterMeta, f.before.characterMeta);
    assert.deepEqual(saved.promptRecipe, f.before.promptRecipe);
    for (const round of saved.consistencyPrompt.rounds) {
        assert.equal(round.promptRecipe.identityMode, 'appearance_correction');
        assert.equal(round.outfitSnapshot.characters[0].name, '夏装');
        assert.equal(round.outfitSnapshot.characters[0].description, f.assets.wardrobe.summer.prompt);
        for (const identity of round.dnaSnapshot.characters) {
            assert.equal(identity.application, 'appearance_correction');
            assert.deepEqual(identity.profile, normalizeCharacterDna(f.assets.characterDna.A));
        }
    }
    assert.deepEqual(f.assets, assetsBefore);
});

for (const defect of ['outfit', 'token', 'duplicate', 'recursive', 'identity-mode', 'missing-identity-mode',
    'missing-reference-uc', 'empty-reference-identity', 'parallel-first-failure',
    'outfit-description', 'outfit-punctuation', 'missing-outfit-description'])
test(`目标衣装契约：非法回复零绘图-${defect}`, async t => {
    const reports = [];
    const parallel = defect === 'parallel-first-failure';
    let firstCanStart;
    const f = await consistencyBuiltinFixture(parallel ? 2 : 1, undefined, { report: (level, message) => reports.push({ level, message }),
        async transformReply(reply, input) {
        if (parallel) {
            if (input.promptTask.slots[0].slotId === 3)
                return reply.replace('char_uc: <<dna_uc:ref1>>\n', '');
            const deadline = Date.now() + 3000;
            while (firstCanStart() && Date.now() < deadline)
                await new Promise(resolve => setImmediate(resolve));
            assert.equal(firstCanStart(), false, '同组首错后停止其他分支交接');
            return reply;
        }
        if (defect === 'missing-reference-uc') return reply.replace('char_uc: <<dna_uc:ref0>>\n', '');
        if (defect === 'outfit-description')
            return reply.replace(/^meta_outfit_description: 0 \|.*$/m, 'meta_outfit_description: 0 | wears another coat');
        if (defect === 'outfit-punctuation')
            return reply.replace(/^(meta_outfit_description: 0 \|.*),$/m, '$1');
        if (defect === 'missing-outfit-description')
            return reply.replace(/^meta_outfit_description: 0 \|.*\n/m, '');
        if (defect === 'empty-reference-identity')
            return reply.replace('meta_correction_identity: 1 | new-A', 'meta_correction_identity: 1 |');
        if (defect === 'outfit') return reply.replace('meta_outfit_name: 0 | 冬装', 'meta_outfit_name: 0 | 错装');
        if (defect === 'token') return reply.replace('meta_token: 0 | actor0', 'meta_token: 0 | wrong');
        if (defect === 'duplicate') return reply + '\nmeta_key: 0 | A';
        if (defect === 'recursive') return reply.replace('meta_correction_identity: 0 | new-A', 'meta_correction_identity: 0 | <<dna:actor0>>');
        if (defect === 'missing-identity-mode') return reply.replace('identity_mode: appearance_correction\n', '');
        return reply.replace('identity_mode: appearance_correction', 'identity_mode: unknown');
    } });
    t.after(() => f.dispose());
    if (defect === 'outfit-punctuation') f.assets.wardrobe.A.prompt = 'wears a dark-navy cotton coat,';
    if (parallel) {
        const write = f.backend.writePrompt;
        f.backend.writePrompt = request => {
            if (request.promptTask.slots[0].slotId === 2) firstCanStart = request.shouldStart;
            return write(request);
        };
    }
    const result = await f.service.run(f.target);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(f.wires.length, 0);
    if (['outfit-description', 'outfit-punctuation'].includes(defect)) {
        assert.equal(result.reason, 'OUTFIT_TEMPLATE_INVALID');
        assert.equal(result.diagnostics.field, 'outfit.description');
        assert.equal(result.diagnostics.issue, 'preserved');
    }
    if (parallel) {
        assert.equal(f.writes.length, 2);
        assert.equal(result.reason, 'DNA_TEMPLATE_BINDING');
        assert.equal(result.diagnostics.slotId, 3);
        assert.equal(result.diagnostics.field, 'char_uc');
        assert.equal(result.diagnostics.issue, 'mismatch');
        assert.doesNotMatch(JSON.stringify(reports), /stale-config/);
    }
    if (defect === 'missing-identity-mode') {
        assert.equal(result.diagnostics.field, 'promptRecipe.identityMode');
        assert.equal(result.diagnostics.issue, 'mismatch');
        assert.equal(result.diagnostics.expectedIdentityMode, 'appearance_correction');
        assert.equal(result.diagnostics.actualIdentityMode, 'absent');
        assert.ok(reports.some(row => /身份模式要求 appearance_correction，回复 absent/.test(row.message)));
    }
    assert.doesNotMatch(JSON.stringify(reports), /new-A|wrong-A|<<dna|fixture-builtin-key/);
    assert.deepEqual(await f.rawStore.getSlotRecord(f.before.key), f.before);
});

for (const [rw, rh] of [[16, 48], [48, 16]]) test(`完整参考几何：透明边与上下部-${rw}x${rh}`, async () => {
    const { planReferenceCanvas, buildReferencePixels } = await import('../src/media/cg-reference-canvas.js');
    const ref = { width: rw, height: rh, data: new Uint8ClampedArray(rw * rh * 4),
        referenceCrop: { x: 0, y: 0, width: rw, height: 1 } };
    for (let y = 2; y < rh - 2; y++) for (let x = 2; x < rw - 2; x++)
        ref.data.set(y < rh / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * rw + x) * 4);
    const meta = { characters: [{ characterKey: 'A', region: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 } }] };
    const plan = planReferenceCanvas(256, 128, meta, 'A', ref);
    assert.equal(plan.ok, true);
    const p = plan.referenceContent;
    assert.deepEqual(p.crop, { x: 2, y: 2, width: rw - 4, height: rh - 4 });
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.crop));
    assert.ok(Math.abs(p.width - p.crop.width * p.scale) < 1);
    assert.ok(Math.abs(p.height - p.crop.height * p.scale) < 1);
    assert.ok(p.x >= plan.reference.x && p.x + p.width <= plan.size.width);
    assert.ok(p.y >= 0 && p.y + p.height <= plan.size.height);
    const source = { width: 256, height: 128, data: new Uint8ClampedArray(256 * 128 * 4).fill(255) };
    const built = buildReferencePixels(source, ref, plan);
    const x = p.x + Math.floor(p.width / 2);
    for (const [y, color] of [[p.y, [255, 0, 0, 255]], [p.y + p.height - 1, [0, 0, 255, 255]]]) {
        const at = (y * plan.size.width + x) * 4;
        assert.deepEqual([...built.image.data.subarray(at, at + 4)], color);
    }
    for (let y = 0; y < plan.size.height; y++) for (let x = plan.reference.x; x < plan.size.width; x++)
        assert.equal(built.mask.data[(y * plan.size.width + x) * 4], 0);
    assert.ok(plan.size.width * plan.size.height <= 1024 * 1024);
    assert.equal(plan.size.width % 64 + plan.size.height % 64, 0);
    const empty = { ...ref, data: new Uint8ClampedArray(ref.data.length) };
    assert.equal(planReferenceCanvas(256, 128, meta, 'A', empty).ok, false);
});