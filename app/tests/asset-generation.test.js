import test from 'node:test';
import assert from 'node:assert/strict';

import { classifySceneKey, lookupSceneBackground } from '../src/scene/scene-directives.js';
import {
    resolveBackgroundAsset, resolveSpriteAsset, collectAssetNeeds,
    addGeneratedAssetToLibrary, bindGeneratedSprite, fileGeneratedHoldings, renameGeneratedLibraryEntry, removeGeneratedLibraryEntry, normalizeGeneratedLibrary,
} from '../src/scene/asset-match.js';
import { parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems, ASSET_PLANNER_SYSTEM_PROMPT } from '../src/generated-images/illustration/asset-prompt.js';
import { looksLikeRefusal, requestWithSoftRetry, applyTemplate } from '../src/generated-images/illustration/prompt-kit.js';
import { buildNaiV4Request, supportsNaiTransparentBackground } from '../src/generated-images/request-builders/nai-v4-builder.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from '../src/generated-images/illustration/auto-illustration-settings.js';
import { matteSolidBackground, findOpaqueBounds } from '../src/media/alpha-matte.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';

const USER_ASSETS = {
    enabled: true,
    scenes: { 学校天台: { url: 'roof.png', times: {} }, 教室: { url: 'class.png', times: {} }, 默认: { url: 'default.png', times: {} } },
    characters: { 艾莉: { 默认: 'ally.png' }, 空槽角色: { 默认: '' } },
    characterAliases: { 艾莉: ['小艾'] },
};

test('gate:assets:scene-key-quality-grades', () => {
    assert.deepEqual(classifySceneKey(USER_ASSETS.scenes, '教室'), { key: '教室', quality: 'exact' });
    assert.equal(classifySceneKey(USER_ASSETS.scenes, '天台').quality, 'fuzzy-strong');
    assert.equal(classifySceneKey(USER_ASSETS.scenes, '音乐教室').quality, 'fuzzy-strong');
    assert.equal(classifySceneKey(USER_ASSETS.scenes, '浴室').quality, 'fuzzy-weak');
    assert.equal(classifySceneKey(USER_ASSETS.scenes, '废弃工厂').quality, 'none');
    assert.equal(lookupSceneBackground({ scene: '废弃工厂' }, USER_ASSETS).quality, 'default');
});

test('gate:assets:strict-mode-keeps-weak-match-only-as-placeholder', () => {
    const loose = resolveBackgroundAsset({ scene: '浴室' }, { sceneAssets: USER_ASSETS });
    assert.equal(loose.source, 'user');
    assert.equal(loose.needsGeneration, false);
    const strict = resolveBackgroundAsset({ scene: '浴室' }, { sceneAssets: USER_ASSETS, strict: true });
    assert.equal(strict.url, 'class.png');
    assert.equal(strict.source, 'placeholder');
    assert.equal(strict.needsGeneration, true);
    const strong = resolveBackgroundAsset({ scene: '天台' }, { sceneAssets: USER_ASSETS, strict: true });
    assert.equal(strong.source, 'user');
    const temp = resolveBackgroundAsset({ scene: '浴室' }, { sceneAssets: USER_ASSETS, strict: true, tempBackground: () => 'igs-gen:t1' });
    assert.deepEqual([temp.url, temp.source], ['igs-gen:t1', 'temp']);
});

test('gate:assets:unnamed-character-detection', () => {
    const ctx = { sceneAssets: USER_ASSETS, userName: '阿明' };
    assert.equal(resolveSpriteAsset('小艾', '', ctx).url, 'ally.png');
    assert.equal(resolveSpriteAsset('空槽角色', '', ctx).needsGeneration, false);
    assert.equal(resolveSpriteAsset('神秘少女', '', ctx).needsGeneration, true);
    assert.equal(resolveSpriteAsset('阿明', '', ctx).needsGeneration, true);
    for (const name of ['旁白', '？？？']) assert.equal(resolveSpriteAsset(name, '', ctx).needsGeneration, false, name);
    const needs = collectAssetNeeds(
        { scenes: [{ scene: '废弃工厂', time: '夜晚' }, { scene: '废弃工厂', time: '夜晚' }], characters: ['神秘少女', '艾莉', '神秘少女'] },
        ctx, { background: true, sprite: true, limit: 4 },
    );
    assert.deepEqual(needs.map((n) => `${n.type}:${n.name}`), ['background:废弃工厂', 'sprite:神秘少女']);
});

test('gate:assets:generated-library-is-separate-and-renamable', () => {
    const added = addGeneratedAssetToLibrary({}, { type: 'sprite', name: '神秘少女', imageId: 'img1' }, '莉莉');
    assert.equal(added.library.characters.莉莉.默认, 'igs-gen:img1');
    assert.deepEqual(added.library.characterAliases.莉莉, ['神秘少女']);
    const ctx = { sceneAssets: USER_ASSETS, generatedAssets: added.library };
    assert.deepEqual([resolveSpriteAsset('神秘少女', '', ctx).url, resolveSpriteAsset('神秘少女', '', ctx).source], ['igs-gen:img1', 'library']);
    const renamed = renameGeneratedLibraryEntry(added.library, 'sprite', '莉莉', '莉莉安');
    assert.ok(renamed.library.characters.莉莉安 && !renamed.library.characters.莉莉);
    assert.ok(renamed.library.characterAliases.莉莉安.includes('莉莉'));
    const bg = addGeneratedAssetToLibrary({}, { type: 'background', name: '废弃工厂', time: '夜晚', imageId: 'img2' }, '工厂');
    assert.equal(bg.library.scenes.工厂.times.夜晚.url, 'igs-gen:img2');
    assert.deepEqual(bg.library.scenes.工厂.words, ['废弃工厂']);
    const removed = removeGeneratedLibraryEntry(bg.library, 'background', '工厂');
    assert.deepEqual(removed.imageIds, ['img2']);
    assert.equal(removed.library.scenes.工厂, undefined);
});

test('gate:assets:filing-generated-holdings-leaves-one-reference', () => {
    const assets = {
        characters: { 莉莉: { 默认: 'igs-gen:img1' } },
        scenes: {},
        generated: {
            characters: { 莉莉: { 默认: 'igs-gen:img1' }, 新角色: { 默认: 'igs-gen:img2', 喜悦: 'igs-gen:img3' } },
            scenes: { 工厂: { url: 'igs-gen:bg1', words: [], times: {} } },
            expressionNotes: { 莉莉: { 喜悦: { positive: 'smile' } } },
        },
    };
    fileGeneratedHoldings(assets);
    assert.equal(assets.characters.莉莉.默认, 'igs-gen:img1');
    assert.equal(assets.characters.新角色.默认, 'igs-gen:img2');
    assert.equal(assets.characters.新角色.喜悦, 'igs-gen:img3');
    assert.equal(assets.scenes.工厂.url, 'igs-gen:bg1');
    assert.equal(assets.generated.characters.莉莉, undefined);
    assert.equal(assets.generated.characters.新角色, undefined);
    assert.equal(assets.generated.scenes.工厂, undefined);
    assert.equal(assets.generated.expressionNotes.莉莉.喜悦.positive, 'smile');
});

test('gate:assets:generated-library-normalizes-buckets', () => {
    assert.deepEqual(normalizeGeneratedLibrary({
        scenes: { 教室: { url: 'igs-gen:bg1' } },
        characters: [],
        characterAliases: null,
        ignored: 'legacy',
    }), {
        scenes: { 教室: { url: 'igs-gen:bg1' } },
        characters: {},
        characterAliases: {},
        expressionNotes: {},
    });
});

test('gate:assets:planner-prompt-and-parser', () => {
    assert.ok(ASSET_PLANNER_SYSTEM_PROMPT.includes('成年人'));
    const needs = [{ type: 'background', name: '废弃工厂', time: '夜晚' }, { type: 'sprite', name: '神秘少女' }];
    const plan = parseAssetPlan('```\nid: ch2\ntags: 1girl, silver hair\nid: bg1\ntags: factory, night\nuc: people\n```', needs);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.items.map((i) => i.need.type), ['background', 'sprite']);
    assert.equal(plan.items[0].uc, 'people');
    assert.equal(parseAssetPlan('抱歉，我无法完成。', needs).ok, false);
});

test('gate:assets:sprite-slot-uses-light-grey-matte-or-native-transparency', () => {
    const item = { need: { type: 'sprite', name: 'x' }, tags: '1girl, red hair', uc: '' };
    const grey = buildAssetSlot(item);
    assert.ok(grey.scene.startsWith('1girl, red hair, solo, cowboy shot'));
    assert.ok(grey.scene.includes('light grey background'));
    assert.ok(grey.sceneUc.includes('white background'));
    const native = buildAssetSlot(item, { transparent: true });
    assert.ok(native.scene.includes('transparent background') && !native.scene.includes('grey background'));
    assert.equal(supportsNaiTransparentBackground('nai-diffusion-4-5-full'), false);
    assert.equal(supportsNaiTransparentBackground('nai-diffusion-5-full'), true);
    const v5 = buildNaiV4Request(native, { model: 'nai-diffusion-5-full' }, () => 0);
    assert.equal(v5.parameters.straight_alpha, true);
    const v45 = buildNaiV4Request(native, { model: 'nai-diffusion-4-5-full' }, () => 0);
    assert.equal(v45.parameters.straight_alpha, undefined);
    const bg = buildAssetSlot({ need: { type: 'background', name: 'y' }, tags: 'factory', uc: '' }, { templates: { background: 'my style, {tags}', backgroundNegative: 'no people' } });
    assert.equal(bg.scene, 'my style, factory');
    assert.equal(bg.sceneUc, 'no people');
    const customSprite = buildAssetSlot({ need: { type: 'sprite', name: 'x' }, tags: '1girl, blue hair', uc: 'extra arms' }, { templates: { sprite: '{tags}, custom pose, {matte}', spriteNegative: 'no crowd', nsfwExtra: 'adult' } });
    assert.match(customSprite.scene, /^1girl, blue hair, custom pose/);
    assert.equal(customSprite.sceneUc, 'no crowd, extra arms');
    assert.ok(!customSprite.sceneUc.includes('child'));
});

test('gate:assets:templates-and-dictionary-fallback', () => {
    assert.equal(applyTemplate('{tags}, , solo', { tags: 'a, b' }), 'a, b, solo');
    const s = normalizeAutoIllustrationSettings({ assets: { templates: {
        background: '{tags}, custom scene', backgroundNegative: 'no people',
        sprite: '{tags}, custom character', spriteNegative: 'no crowd', nsfwExtra: 'adult scene',
    } } });
    assert.equal(s.assets.templates.background, '{tags}, custom scene');
    assert.equal(s.assets.templates.backgroundNegative, 'no people');
    assert.equal(s.assets.templates.sprite, '{tags}, custom character');
    assert.equal(s.assets.templates.spriteNegative, 'no crowd');
    assert.equal(s.assets.templates.nsfwExtra, 'adult scene');
    const fallback = normalizeAutoIllustrationSettings({ assets: { templates: { sprite: 'no placeholder', background: '' } } });
    assert.ok(fallback.assets.templates.sprite.includes('{tags}'));
    assert.ok(fallback.assets.templates.background.includes('{tags}'));
    assert.equal(isStrictBackgroundMatch({ assets: { strictMatch: true } }), false);
    assert.equal(isStrictBackgroundMatch({ assets: { strictMatch: true, backgroundEnabled: true } }), true);
    const items = buildDictionaryAssetItems([{ type: 'background', name: '学校教室', time: '黄昏', weather: '雨' }, { type: 'sprite', name: 'x' }, { type: 'background', name: '异次元' }]);
    assert.equal(items.length, 1);
    assert.ok(items[0].tags.includes('classroom') && items[0].tags.includes('sunset') && items[0].tags.includes('rain'));
});

test('gate:assets:soft-retry-on-refusal', async () => {
    const calls = [];
    const llm = { async request(msg) { calls.push(msg.system); return calls.length === 1 ? "I'm sorry, I can't help with that." : 'id: bg1\ntags: room'; } };
    const parse = (t) => (t.includes('tags:') ? { ok: true, text: t } : { ok: false });
    const result = await requestWithSoftRetry(llm, { system: 'A', softSystem: 'B', user: 'u', parse }, {});
    assert.deepEqual([result.ok, result.soft, calls], [true, true, ['A', 'B']]);
    assert.equal(looksLikeRefusal('slot: 1\nscene: 1girl'), false);
    assert.equal(looksLikeRefusal('抱歉，我无法生成'), true);
    const noSoft = await requestWithSoftRetry({ async request() { return 'garbage'; } }, { system: 'A', softSystem: 'B', user: 'u', parse }, {});
    assert.equal(noSoft.ok, false);
});

function makeImage(width, height, paint) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [r, g, b] = paint(x, y);
            const i = (y * width + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        }
    }
    return { data, width, height };
}

test('gate:assets:matte-removes-connected-grey-and-keeps-inner-white', () => {
    const img = makeImage(20, 20, (x, y) => {
        if (x >= 5 && x < 15 && y >= 5 && y < 20) {
            if (x === 5 || x === 14 || y === 5) return [30, 30, 30];
            return [255, 255, 255];
        }
        return [200, 200, 200];
    });
    matteSolidBackground(img);
    const alpha = (x, y) => img.data[(y * 20 + x) * 4 + 3];
    assert.equal(alpha(0, 0), 0);
    assert.equal(alpha(19, 10), 0);
    assert.equal(alpha(10, 10), 255);
    assert.equal(alpha(5, 10), 255);
    assert.deepEqual(findOpaqueBounds(img), { x: 5, y: 5, width: 10, height: 15 });
});

function fakeHost(text, chatId = 'chat-1') {
    const handlers = {};
    return {
        getChatId: () => chatId,
        getUserName: () => '阿明',
        readFloor: () => ({ chatId, messageId: 3, swipeId: 0, isAi: true, isLatest: true, text }),
        readPreviousAiTexts: () => [],
        on: (name, fn) => { handlers[name] = fn; return () => { delete handlers[name]; }; },
        handlers,
    };
}

const FLOOR_TEXT = '[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。\n[igs-char:神秘少女|平静|你来了。]\n[igs-char:艾莉|惊讶|是谁？]';

test('gate:assets:service-generates-missing-assets-and-reviews', async () => {
    const store = createMemoryGeneratedAssetStore();
    const emitted = [];
    const naiCalls = [];
    let id = 0;
    const service = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT),
        llm: { async request() { return 'id: bg1\ntags: factory, night, rain\nid: ch2\ntags: 1girl, silver hair, black coat'; } },
        nai: { async generate(slot, settings) { naiCalls.push({ slot, size: settings.size }); return { ok: true, dataUrl: 'data:image/png;base64,AAA' }; } },
        store,
        matte: async (url) => `${url}#matte`,
        getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true, backgroundEnabled: true, strictMatch: true } }, sceneAssets: USER_ASSETS }),
        events: { emit: (name, detail) => emitted.push(detail.reason) },
        newId: () => `img${++id}`,
    });
    const result = await service.processMessage(3);
    assert.deepEqual([result.ok, result.count], [true, 2]);
    assert.deepEqual(naiCalls.map((c) => c.size), ['1216x832', '832x1216']);
    assert.ok(naiCalls[1].slot.scene.includes('light grey background'));
    assert.equal((await store.getImage('img2')).dataUrl, 'data:image/png;base64,AAA#matte');
    assert.equal((await store.getImage('img1')).dataUrl, 'data:image/png;base64,AAA');
    const review = service.listReview('chat-1|3|0');
    assert.deepEqual(review.map((r) => `${r.type}:${r.name}`), ['background:废弃工厂', 'sprite:神秘少女']);
    assert.equal(service.tempSprite('神秘少女'), 'igs-gen:img2');
    assert.equal(service.tempBackground('废弃工厂', '夜晚'), 'igs-gen:img1');
    assert.equal(service.resolveUrl('igs-gen:img2'), 'data:image/png;base64,AAA#matte');
    assert.equal((await service.processMessage(3)).reason, 'already-decided');

    await service.setStatus(review[1].key, 'chat');
    await service.setStatus(review[0].key, 'discarded');
    assert.equal(service.listReview('chat-1|3|0').length, 0);
    assert.equal(service.tempSprite('神秘少女'), 'igs-gen:img2');
    assert.equal(service.tempBackground('废弃工厂', '夜晚'), '');
    assert.equal(await store.getImage('img1'), null);
    assert.ok(emitted.includes('generated'));
});

test('gate:assets:service-disabled-makes-no-requests', async () => {
    let requested = false;
    const service = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT),
        llm: { async request() { requested = true; return ''; } },
        nai: { async generate() { requested = true; return { ok: false }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: USER_ASSETS }),
    });
    assert.equal((await service.processMessage(3)).reason, 'disabled');
    assert.equal((await service.processMessage(3, { manual: true })).reason, 'disabled');
    const off = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT),
        llm: { async request() { requested = true; return ''; } },
        nai: { async generate() { requested = true; return { ok: false }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true } }, sceneAssets: { ...USER_ASSETS, enabled: false } }),
    });
    assert.equal((await off.processMessage(3)).reason, 'scene-assets-disabled');
    assert.equal((await off.processMessage(3, { manual: true })).reason, 'scene-assets-disabled');
    assert.equal(requested, false);
});

test('gate:assets:service-falls-back-to-dictionary-for-backgrounds', async () => {
    const naiCalls = [];
    const service = createAssetGenerationService({
        messageHost: fakeHost('[igs-scene:学校教室|黄昏|晴]\n放学后。'),
        llm: { async request() { return '抱歉，我无法完成这个请求。'; } },
        nai: { async generate(slot) { naiCalls.push(slot); return { ok: true, dataUrl: 'data:image/png;base64,B' }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true, strictMatch: true } }, sceneAssets: { enabled: true, scenes: {} } }),
    });
    const result = await service.processMessage(3);
    assert.equal(result.count, 1);
    assert.ok(naiCalls[0].scene.includes('classroom') && naiCalls[0].scene.includes('no humans'));
});

test('gate:assets:failed-generation-does-not-settle-floor', async () => {
    let calls = 0;
    const store = createMemoryGeneratedAssetStore();
    const service = createAssetGenerationService({
        messageHost: fakeHost('[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。'),
        llm: { async request() { return 'id: bg1\ntags: factory, night'; } },
        nai: { async generate() {
            calls += 1;
            return calls === 1 ? { ok: false, error: 'NAI 请求失败' }
                : { ok: true, dataUrl: 'data:image/png;base64,AAA' };
        } },
        store,
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true } }, sceneAssets: USER_ASSETS }),
    });
    const first = await service.processMessage(3);
    assert.equal(first.ok, false);
    assert.equal((await store.getFloor('chat-1|3|0')).status, 'failed');
    const retry = await service.processMessage(3);
    assert.equal(retry.count, 1);
    assert.equal(calls, 2);
});

test('gate:assets:manual-retries-settled-floor-without-regenerating-existing-assets', async () => {
    let calls = 0;
    const store = createMemoryGeneratedAssetStore();
    await store.putFloor('chat-1|3|0', { status: 'done', count: 0 });
    const service = createAssetGenerationService({
        messageHost: fakeHost('[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。'),
        llm: { async request() { return 'id: bg1\ntags: factory, night'; } },
        nai: { async generate() {
            calls += 1;
            return { ok: true, dataUrl: 'data:image/png;base64,AAA' };
        } },
        store,
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true } }, sceneAssets: USER_ASSETS }),
    });
    assert.equal((await service.processMessage(3)).reason, 'already-decided');
    assert.equal(calls, 0);
    const retry = await service.processMessage(3, { manual: true });
    assert.deepEqual([retry.ok, retry.reason, retry.count], [true, 'done', 1]);
    assert.equal(calls, 1);
    assert.equal((await store.getFloor('chat-1|3|0')).status, 'done');
    assert.equal((await service.processMessage(3, { manual: true })).reason, 'nothing-missing');
    assert.equal(calls, 1);
});

test('gate:assets:registered-characters-and-scenes-are-not-generated', async () => {
    const { collectAssetNeeds } = await import('../src/scene/asset-match.js');
    const ctx = {
        sceneAssets: { scenes: { 学校天台: { url: '', times: {} } }, characters: { 雪之下雪乃: {} }, characterAliases: {} },
        knownCharacters: ['比企谷八幡'],
        userName: '我',
    };
    const needs = collectAssetNeeds({
        scenes: [{ scene: '天台', time: '夜晚' }, { scene: '废弃工厂', time: '' }],
        characters: ['雪乃', '八幡', '比企谷八幡', '路人少女'],
    }, ctx, { background: true, sprite: true });
    assert.deepEqual(needs.map((n) => n.name), ['废弃工厂', '路人少女']);
});

test('gate:assets:nai-500-retries-and-reports-server-detail', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    let calls = 0;
    const sleeps = [];
    const client = createNaiOfficialClient({
        fetch: async () => {
            calls += 1;
            return { ok: false, status: 500, headers: { get: () => null }, text: async () => '{"statusCode":500,"message":"Internal server error"}' };
        },
        sleep: async (ms) => { sleeps.push(ms); },
    });
    const result = await client.generate({ scene: '1girl' }, { apiKey: 'k' });
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [2000, 4000]);
    assert.match(result.error, /HTTP 500.*Internal server error/);
});

test('gate:assets:nai-request-drops-smea-and-invalid-sampler', async () => {
    const { buildNaiV4Request } = await import('../src/generated-images/request-builders/nai-v4-builder.js');
    const body = buildNaiV4Request({ scene: '1girl' }, { model: 'nai-diffusion-5-full', sampler: 'euler a', noiseSchedule: 'native' });
    assert.equal('sm' in body.parameters, false);
    assert.equal(body.parameters.sampler, 'k_euler_ancestral');
    assert.equal(body.parameters.noise_schedule, 'karras');
});

test('gate:assets:secondary-llm-accepts-sse-reply', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const llm = createSecondaryLlm({}, { fetch: async () => ({
        ok: true, status: 200,
        text: async () => 'data: {"choices":[{"delta":{"content":"id: "}}]}\n\ndata: {"choices":[{"delta":{"content":"bg1"}}]}\n\ndata: [DONE]\n',
    }) });
    assert.equal(await llm.request({ system: 's', user: 'u' }, { source: 'openai', endpoint: 'https://x/v1', model: 'm' }), 'id: bg1');
});

test('gate:assets:tavern-secondary-llm-does-not-arm-stream-observer', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const { isBackgroundGenerationActive } = await import('../src/host/background-generation.js');
    let seen = null;
    let during = null;
    const llm = createSecondaryLlm({ TavernHelper: { generateRaw: async (req) => { seen = req; during = isBackgroundGenerationActive(); return 'ok'; } } });
    assert.equal(await llm.request({ system: 's', user: 'u' }, {}), 'ok');
    assert.equal(seen.should_silence, true);
    assert.equal(during, true);
    assert.equal(isBackgroundGenerationActive(), false);
});

test('gate:image-backend:dbgen-writes-prompt-and-generates', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
    const globalObject = {
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        NaiDbGen: {
            async generateSinglePrompt(req) { calls.push(['prompt', req]); return { ok: true, value: { caption: { v4_prompt: { caption: { base_caption: 'x', char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } } } } }; },
            async generate(req) { calls.push(['gen', req]); return { ok: true, value: [{ blob: new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }), mimeType: 'image/png' }] }; },
        },
    };
    const nai = { generate: async () => { throw new Error('不应走内置 NAI'); } };
    const backend = createImageBackend({ nai, global: globalObject, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    assert.deepEqual([backend.describe().ready.ok, backend.describe().ownPrompts], [true, true]);
    const result = await backend.generate({ scene: 'ignored' }, {}, { messageId: 7, description: '她推开门', size: '1216x832' });
    assert.equal(result.ok, true);
    assert.equal(result.dataUrl, 'data:image/png;base64,AQID');
    assert.deepEqual(calls[0], ['prompt', { description: '她推开门', messageId: 7 }]);
    assert.equal(calls[1][1].replaceCharacterKeywords, true);
    assert.deepEqual(calls[1][1].params, { width: 1216, height: 832 });
    assert.deepEqual(result.prompt, {
        positive: 'x',
        negative: '',
        caption: {
            v4_prompt: { caption: { base_caption: 'x', char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
        },
    });
    const sprite = await backend.generate({}, {}, { description: '画角色「甲」的立绘。', size: '832x1216', transparent: true });
    assert.equal(sprite.ok, true);
    assert.equal(calls[3][0], 'gen');
    assert.deepEqual(calls[3][1].params, { width: 832, height: 1216, straight_alpha: true, tag_hint_transparent_background: true });
    assert.equal(calls[3][1].params.model, undefined);
    assert.equal(calls[0][1].skipRecall, undefined);
    assert.equal(calls[2][1].skipRecall, undefined);
    const background = await backend.generate({ scene: 'ignored' }, {}, { description: '画场景「教室」的背景图。', skipRecall: true });
    assert.equal(background.ok, true);
    assert.equal(calls[4][1].skipRecall, true);
    const prompted = await backend.writeDbgenPrompt({ description: '写表情差分' });
    assert.equal(prompted.ok, true);
    assert.equal(calls.at(-1)[1].skipRecall, true);
    const floorPrompt = await backend.writeDbgenFloorPrompts({ description: '为本楼生成1张CG', messageId: 5 });
    assert.equal(floorPrompt.ok, true);
    assert.equal(calls.at(-1)[1].skipRecall, undefined);
    assert.equal(calls.at(-1)[1].messageId, 5);
    assert.equal(sprite.prompt.positive, 'x');
    assert.equal(sprite.prompt.caption.v4_prompt.caption.base_caption, 'x');
});

test('gate:image-backend:dbgen-missing-and-errors-are-readable', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const missing = createImageBackend({ nai: {}, global: {}, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    assert.match(missing.describe().ready.error, /未检测到数据库生图插件/);
    const failing = createImageBackend({
        nai: {},
        global: { NaiDbGen: { generate: async () => ({}), generateSinglePrompt: async () => ({ ok: false, error: { message: '召回失败', hint: '请检查预设' } }) } },
        getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
    });
    const result = await failing.generate({}, {}, { description: '一段' });
    assert.match(result.error, /写提示词失败：召回失败：请检查预设/);
});

test('gate:image-backend:extension-mode-uses-chatu8-with-nai-fallback', async () => {
    const { createImageBackend, buildChatu8Prompt } = await import('../src/generated-images/image-backend.js');
    let bridge = { imageApi: { mode: 'extension' }, autoIllustration: {} };
    const naiCalls = [];
    const nai = { generate: async (slot, s) => { naiCalls.push(s.apiKey); return { ok: true, dataUrl: 'data:image/png;base64,TkFJ' }; } };
    let host = null;
    const prompts = [];
    let chatu8Result = { ok: true, imageData: 'data:image/png;base64,Q0hBVFU4' };
    const backend = createImageBackend({
        nai, global: {}, getBridge: () => bridge,
        chatu8: { findHost: () => host, request: async (h, prompt) => { prompts.push(prompt); return chatu8Result; } },
    });

    // 没装智绘姬也没填 Key：不就绪，并提示可填 Key 兜底。
    assert.match(backend.describe().ready.error, /未检测到智绘姬/);
    // 没装智绘姬但填了 Key：内置 NAI 兜底。
    bridge = { imageApi: { mode: 'extension' }, autoIllustration: { nai: { apiKey: 'pst-a' } } };
    assert.equal(backend.describe().via, 'nai');
    assert.equal((await backend.generate({ scene: 'room' }, { apiKey: 'pst-a' })).via, 'nai');
    assert.deepEqual(naiCalls, ['pst-a']);

    // 装了智绘姬：无需 NAI Key，场景与角色 tag 合并为一段提示词交给智绘姬。
    bridge = { imageApi: { mode: 'extension' }, autoIllustration: {} };
    host = { eventSource: {}, win: {} };
    assert.deepEqual([backend.describe().ready.ok, backend.describe().via], [true, 'chatu8']);
    const slot = { scene: 'classroom, sunset,', chars: [{ tags: 'girl, red hair' }, { tags: '' }] };
    assert.equal(buildChatu8Prompt(slot), 'classroom, sunset, girl, red hair');
    const ok = await backend.generate(slot, {});
    assert.deepEqual([ok.ok, ok.via, ok.dataUrl], [true, 'chatu8', 'data:image/png;base64,Q0hBVFU4']);
    assert.deepEqual(prompts, ['classroom, sunset, girl, red hair']);
    assert.equal(naiCalls.length, 1, '智绘姬成功时不调用 NAI');

    // 智绘姬失败：没 Key 按失败上报，有 Key 退回 NAI。
    chatu8Result = { ok: false, error: '智绘姬出图失败：队列已满' };
    const failed = await backend.generate(slot, {});
    assert.equal(failed.ok, false);
    assert.match(failed.error, /队列已满/);
    const fellBack = await backend.generate(slot, { apiKey: 'pst-b' });
    assert.deepEqual([fellBack.ok, fellBack.via], [true, 'nai']);
    assert.deepEqual(naiCalls, ['pst-a', 'pst-b']);
});

test('gate:chatu8-client:pairs-response-by-id-and-cleans-up', async () => {
    const { requestChatu8Image, findChatu8Host, CHATU8_REQUEST_EVENT, CHATU8_RESPONSE_EVENT } = await import('../src/generated-images/chatu8-client.js');
    function createFakeEventSource() {
        const listeners = new Map();
        return {
            listeners,
            emitted: [],
            on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
            removeListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter((f) => f !== fn)); },
            async emit(name, data) { this.emitted.push({ name, data }); for (const fn of [...(listeners.get(name) || [])]) await fn(data); },
        };
    }
    const timers = [];
    const fakeTimers = { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} };
    const responseCount = (es) => (es.listeners.get(CHATU8_RESPONSE_EVENT) || []).length;

    const es = createFakeEventSource();
    const pending = requestChatu8Image({ eventSource: es }, ' 1girl, smile ', { id: 'req-1', ...fakeTimers });
    assert.deepEqual(es.emitted[0], { name: CHATU8_REQUEST_EVENT, data: { id: 'req-1', prompt: '1girl, smile' } });
    await es.emit(CHATU8_RESPONSE_EVENT, { id: 'other', success: true, imageData: 'data:image/png;base64,WA==' });
    await es.emit(CHATU8_RESPONSE_EVENT, { id: 'req-1', success: true, imageData: 'data:image/png;base64,T0s=' });
    assert.deepEqual(await pending, { ok: true, imageData: 'data:image/png;base64,T0s=' });
    assert.equal(responseCount(es), 0, '收到回执后解绑监听');

    const es2 = createFakeEventSource();
    const video = requestChatu8Image({ eventSource: es2 }, 'x', { id: 'v', ...fakeTimers });
    await es2.emit(CHATU8_RESPONSE_EVENT, { id: 'v', success: true, isVideo: true, imageData: 'blob:x' });
    assert.equal((await video).reason, 'chatu8-video');

    const es3 = createFakeEventSource();
    const slow = requestChatu8Image({ eventSource: es3 }, 'x', { id: 't', timeoutMs: 5000, ...fakeTimers });
    timers[timers.length - 1]();
    const timedOut = await slow;
    assert.deepEqual([timedOut.ok, timedOut.reason], [false, 'chatu8-timeout']);
    assert.equal(responseCount(es3), 0, '超时后解绑监听');

    const eventSource = createFakeEventSource();
    assert.equal(findChatu8Host({ SillyTavern: { getContext: () => ({ eventSource }) } }), null, '没装智绘姬不认');
    const win = { showChatuSettingsPanel() {}, SillyTavern: { getContext: () => ({ eventSource }) } };
    assert.equal(findChatu8Host({ parent: win, top: win }).eventSource, eventSource);
});

test('gate:image-backend:legacy-nai-key-merges-into-unified-settings', async () => {
    const { mergeLegacyNaiSettings } = await import('../src/generated-images/image-backend.js');
    const merged = mergeLegacyNaiSettings({ nsfwEnabled: true }, { apiKey: 'pst-old', endpoint: '', transport: 'st-proxy', model: 'nai-diffusion-4-5-full' });
    assert.deepEqual([merged.nai.apiKey, merged.nai.transport, merged.nai.model, merged.nsfwEnabled], ['pst-old', 'st-proxy', 'nai-diffusion-4-5-full', true]);
    assert.equal(mergeLegacyNaiSettings({ nai: { apiKey: 'pst-new' } }, { apiKey: 'pst-old' }).nai.apiKey, 'pst-new');
    assert.equal(mergeLegacyNaiSettings({}, { apiKey: 'sk-openai', endpoint: 'https://api.example.com/v1' }).nai, undefined, 'OpenAI 兼容接口的 Key 不能当 NAI Key');
});

test('gate:assets:dbgen-source-skips-secondary-llm', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const floor = { chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text: '[igs-scene:废弃工厂|夜晚|雨]\n雨声。' };
    let llmCalls = 0;
    const metas = [];
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { llmCalls += 1; return ''; } },
        nai: {
            describe: () => ({ mode: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            async generate(slot, settings, meta) { metas.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,AAA' }; },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true } }, sceneAssets: { enabled: true, scenes: {}, characters: {} } }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.deepEqual([result.ok, result.count, llmCalls], [true, 1, 0]);
    assert.match(metas[0].description, /废弃工厂」（夜晚、雨）的背景图/);
    assert.equal(metas[0].description.includes('无背景'), false);
    assert.equal(metas[0].description.includes('透明底'), false);
    assert.ok(!metas[0].description.includes('必须原样写入'));
    assert.ok(!metas[0].description.includes('no humans'));
    assert.ok(metas[0].userPrompts.positive.includes('no humans'));
    assert.ok(metas[0].userPrompts.negative.includes('1girl'));
    assert.equal(metas[0].skipRecall, true);
});

test('gate:assets:later-backgrounds-skip-recall-and-already-generated', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { addGeneratedAssetToLibrary } = await import('../src/scene/asset-match.js');
    const text = [
        '<content>',
        '[igs-scene:教室|白天|晴]',
        '上课。',
        '</content>',
        '<content>',
        '[igs-scene:卧室|夜晚|晴]',
        '她回到卧室。',
        '[igs-scene:走廊|夜晚|晴]',
        '她走过走廊。',
        '</content>',
    ].join('\n');
    const library = addGeneratedAssetToLibrary({}, { type: 'background', name: '教室', time: '白天', imageId: 'old' }, '教室').library;
    const writes = [];
    const paints = [];
    const caption = {
        v4_prompt: { caption: { base_caption: 'room', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
    };
    const service = createAssetGenerationService({
        messageHost: {
            getChatId: () => 'c',
            readFloor: () => ({ chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text }),
            readPreviousAiTexts: () => [],
        },
        llm: { async request() { throw new Error('不应请求副 LLM'); } },
        nai: {
            describe: () => ({ mode: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            writeDbgenPrompt: async (meta) => {
                writes.push(meta);
                return { ok: true, caption, captions: [{ slotId: 1, caption }, { slotId: 2, caption }] };
            },
            generateDbgenCaption: async (meta) => {
                paints.push(meta);
                return { ok: true, dataUrl: 'data:image/png;base64,AAA' };
            },
            generate: async () => { throw new Error('背景不应逐张走召回'); },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({
            autoIllustration: { assets: { backgroundEnabled: true, maxPerFloor: 1 } },
            sceneAssets: { enabled: true, scenes: {}, characters: {}, generated: library },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.deepEqual([result.ok, result.count, writes.length, paints.length], [true, 2, 1, 2]);
    assert.match(writes[0].description, /2张背景/);
    assert.match(writes[0].description, /卧室/);
    assert.match(writes[0].description, /走廊/);
    assert.equal(writes[0].description.includes('教室'), false);
    assert.match(writes[0].description, /不要写生成点/);
    assert.equal(paints[0].userPrompts.positive.includes('no humans'), true);
});

test('gate:assets:dbgen-sprite-passes-frontend-templates', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const floor = { chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text: '[igs-char:神秘少女|平静|你来了。]' };
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl, solo', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const writes = [];
    const paints = [];
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { throw new Error('不应请求副 LLM'); } },
        nai: {
            describe: () => ({ mode: 'dbgen', via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            writeDbgenPrompt: async (meta) => { writes.push(meta); return { ok: true, captions: [{ slotId: 1, caption }] }; },
            generateDbgenCaption: async (meta) => {
                paints.push(meta);
                return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: '1girl, solo', negative: 'lowres' } };
            },
            generate: async () => { throw new Error('立绘不应逐张写词'); },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({
            autoIllustration: { assets: { spriteEnabled: true, templates: { sprite: '{tags}, upper body, red ribbon, {matte}', spriteNegative: 'cowboy shot, hat' } } },
            sceneAssets: { enabled: true, scenes: {}, characters: {} },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.deepEqual([result.ok, result.count, writes.length, paints.length], [true, 1, 1, 1]);
    const description = writes[0].description;
    assert.ok(!description.includes('全身'), '不再写死全身构图');
    assert.match(description, /神秘少女/);
    assert.match(description, /无背景，透明底/);
    assert.match(description, /slotid 从 1 数到 1/);
    assert.ok(!description.includes('必须原样写入'));
    assert.ok(!description.includes('upper body'));
    assert.ok(!description.includes('cowboy shot'));
    assert.ok(!description.includes('楼层'));
    assert.ok(!/loli|shota|underage/.test(description));
    const meta = paints[0];
    assert.ok(meta.userPrompts.positive.startsWith('upper body, red ribbon'));
    assert.ok(meta.userPrompts.positive.includes('transparent background'));
    assert.equal(meta.transparent, true);
    assert.ok(meta.userPrompts.negative.startsWith('cowboy shot, hat'));
    const saved = await service.getImagePrompt(service.listTemp()[0].imageId);
    assert.deepEqual(saved, { positive: '1girl, solo', negative: 'lowres' });
});

test('gate:assets:dbgen-sprites-write-once-then-paint-and-split-past-eight', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const names = ['甲', '乙', '丙'];
    const floor = {
        chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true,
        text: names.map((name) => `[igs-char:${name}|平静|你好。]`).join('\n'),
    };
    const captionOf = (text) => ({
        v4_prompt: { caption: { base_caption: text, char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    });
    const order = [];
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { throw new Error('不应请求副 LLM'); } },
        nai: {
            describe: () => ({ mode: 'dbgen', via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            writeDbgenPrompt: async (meta) => {
                order.push(`write:${(meta.description.match(/写(\d+)张立绘/) || [])[1]}`);
                assert.match(meta.description, /1\. 甲\n2\. 乙\n3\. 丙/);
                assert.match(meta.description, /无背景，透明底/);
                return {
                    ok: true,
                    captions: names.map((name, index) => ({ slotId: index + 1, caption: captionOf(name) })).reverse(),
                };
            },
            generateDbgenCaption: async (meta) => {
                order.push(`paint:${meta.caption.v4_prompt.caption.base_caption}`);
                return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: '1girl', negative: 'lowres' } };
            },
            generate: async () => { throw new Error('立绘不应逐张写词'); },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({
            autoIllustration: { assets: { spriteEnabled: true, maxPerFloor: 8 } },
            sceneAssets: { enabled: true, scenes: {}, characters: {} },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.equal(result.ok, true);
    assert.equal(result.count, 3);
    assert.deepEqual(order, ['write:3', 'paint:甲', 'paint:乙', 'paint:丙']);

    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const manyFloor = {
        chatId: 'c2', messageId: 4, swipeId: 0, isAi: true, isLatest: true,
        text: many.map((name) => `[igs-char:${name}|平静|你好。]`).join('\n'),
    };
    const splitOrder = [];
    const split = createAssetGenerationService({
        messageHost: { getChatId: () => 'c2', readFloor: () => manyFloor, readPreviousAiTexts: () => [] },
        llm: {},
        nai: {
            describe: () => ({ mode: 'dbgen', via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            writeDbgenPrompt: async (meta) => {
                const count = Number((meta.description.match(/写(\d+)张立绘/) || [])[1]);
                splitOrder.push(`write:${count}`);
                const listed = meta.description.split('\n').filter((line) => /^\d+\. /.test(line)).map((line) => line.replace(/^\d+\. /, ''));
                return { ok: true, captions: listed.map((name, index) => ({ slotId: index + 1, caption: captionOf(name) })) };
            },
            generateDbgenCaption: async (meta) => {
                splitOrder.push(`paint:${meta.caption.v4_prompt.caption.base_caption}`);
                return { ok: true, dataUrl: 'data:image/png;base64,AAA' };
            },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({
            autoIllustration: { assets: { spriteEnabled: true, maxPerFloor: 16 } },
            sceneAssets: { enabled: true, scenes: {}, characters: {} },
        }),
    });
    const splitResult = await split.processMessage(4, { manual: true });
    assert.equal(splitResult.count, 10);
    const secondWrite = splitOrder.lastIndexOf('write:5');
    assert.equal(splitOrder.indexOf('paint:e') < secondWrite, true);
    assert.equal(splitOrder.indexOf('paint:f') > secondWrite, true);
    assert.deepEqual(splitOrder.filter((item) => item.startsWith('write')), ['write:5', 'write:5']);
});

test('gate:image-backend:dbgen-merges-frontend-prompts-into-caption', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
    const logs = [];
    const globalObject = {
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        NaiDbGen: {
            async generateSinglePrompt(req) {
                calls.push(['prompt', req]);
                return { ok: true, value: { caption: {
                    v4_prompt: { caption: { base_caption: '1girl, full body, blonde hair', char_captions: [{ char_caption: 'full body, smile', centers: [{ x: 0.5, y: 0.5 }] }] } },
                    v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [{ char_caption: '', centers: [{ x: 0.5, y: 0.5 }] }] } },
                } } };
            },
            async generate(req) { calls.push(['gen', req]); return { ok: true, value: [{ blob: new Blob([Uint8Array.from([1])], { type: 'image/png' }), mimeType: 'image/png' }] }; },
        },
    };
    const backend = createImageBackend({ nai: {}, global: globalObject, getBridge: () => ({ imageApi: { mode: 'dbgen' } }), report: (level, message) => logs.push([level, message]) });
    const result = await backend.generate({}, {}, {
        messageId: 7, description: '画角色', size: '832x1216',
        userPrompts: { positive: 'cowboy shot, 1.2::grey background::', negative: 'Full Body, feet' },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls[0][1], { description: '画角色', messageId: 7 });
    const caption = calls[1][1].caption;
    assert.equal(caption.v4_prompt.caption.base_caption, '1girl, blonde hair, cowboy shot, 1.2::grey background::');
    assert.deepEqual(caption.v4_prompt.caption.char_captions, [{ char_caption: 'smile', centers: [{ x: 0.5, y: 0.5 }] }]);
    assert.equal(caption.v4_negative_prompt.caption.base_caption, 'lowres, Full Body, feet');
    assert.deepEqual(caption.v4_negative_prompt.caption.char_captions, [{ char_caption: '', centers: [{ x: 0.5, y: 0.5 }] }]);
    assert.equal(result.prompt.positive, '1girl, blonde hair, cowboy shot, 1.2::grey background::\nsmile');
    assert.equal(result.prompt.negative, 'lowres, Full Body, feet');
    const { formatStoredPrompt } = await import('../src/generated-images/generation-prompt.js');
    assert.equal(formatStoredPrompt(result.prompt), [
        '场景',
        '正面：1girl, blonde hair, cowboy shot, 1.2::grey background::',
        '负面：lowres, Full Body, feet',
        '',
        '角色1',
        '正面：smile',
        '位置：0.50, 0.50',
    ].join('\n'));
    const logged = logs.map((entry) => entry[1]).join('\n');
    assert.match(logged, /拼之前/);
    assert.match(logged, /1girl, full body, blonde hair/);
    assert.match(logged, /要拼的模板/);
    assert.match(logged, /cowboy shot, 1\.2::grey background::/);
    assert.match(logged, /发出去/);
    assert.match(logged, /1girl, blonde hair, cowboy shot, 1\.2::grey background::/);
});

test('gate:llm:user-head-and-tail-wrap-requests-and-default-empty', async () => {
    const { createSecondaryLlm } = await import('../src/host/secondary-llm.js');
    const { normalizeAutoIllustrationSettings } = await import('../src/generated-images/illustration/auto-illustration-settings.js');
    const defaults = normalizeAutoIllustrationSettings({}).llm;
    assert.deepEqual([defaults.jailbreakHead, defaults.jailbreakTail], ['', ''], '插件不内置任何附加词');
    const bodies = [];
    const llm = createSecondaryLlm({}, { fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '{"choices":[{"message":{"content":"ok"}}]}' }; } });
    const base = { source: 'openai', endpoint: 'https://x/v1', model: 'm' };
    await llm.request({ system: 'SYS', user: 'USR' }, base);
    await llm.request({ system: 'SYS', user: 'USR' }, { ...base, jailbreakHead: 'HEAD', jailbreakTail: 'TAIL' });
    assert.deepEqual(bodies[0].messages.map((m) => m.content), ['SYS', 'USR']);
    assert.deepEqual(bodies[1].messages.map((m) => m.content), ['HEAD\n\nSYS', 'USR\n\nTAIL']);
});


test('gate:alpha-matte:keeps-png-text-chunks-after-crop', async () => {
    const { default: zlib } = await import('node:zlib');
    const { preservePngTextChunks, extractPngTextChunks } = await import('../src/media/alpha-matte.js');
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const png = (extra) => {
        const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
        return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), ...extra, chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
    };
    const toUrl = (b) => `data:image/png;base64,${b.toString('base64')}`;
    const texts = ['Comment\0{"prompt":"1girl"}', 'Software\0NovelAI'];
    const source = png(texts.map((t) => chunk('tEXt', Buffer.from(t, 'latin1'))));
    const cropped = png([]);
    const out = Buffer.from(preservePngTextChunks(toUrl(source), toUrl(cropped)).split(',')[1], 'base64');
    const got = extractPngTextChunks(new Uint8Array(out)).map((c) => Buffer.from(c).toString('latin1', 8, c.length - 4));
    assert.deepEqual(got, texts, '裁边输出保留原图文本块');
    assert.equal(out.toString('latin1', 12, 16), 'IHDR');
    assert.equal(out.toString('latin1', 37, 41), 'tEXt', '文本块紧跟 IHDR');
    assert.equal(preservePngTextChunks(toUrl(cropped), toUrl(cropped)), toUrl(cropped), '源图无元数据时输出不变');
    assert.equal(preservePngTextChunks('data:image/png;base64,@@', toUrl(cropped)), toUrl(cropped), '源图损坏时输出不变');
});

test('gate:generated-assets:get-image-data-url-for-download', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 'img-1', dataUrl: 'data:image/png;base64,AAAA', type: 'sprite', createdAt: 1 });
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: { async request() { throw new Error('unused'); } },
        nai: { async generate() { return { ok: false }; } },
        store,
        getSettings: () => ({}),
        report: () => {},
        matte: async (d) => d,
    });
    assert.equal(await service.getImageDataUrl('img-1'), 'data:image/png;base64,AAAA');
    assert.equal(await service.getImageDataUrl('missing'), '');
    assert.equal(await service.getImageDataUrl(''), '');
});


test('gate:assets:sprite-record-keeps-original-mask-and-quota-fallback', async () => {
    const llm = { async request() { return 'id: bg1\ntags: factory, night\nid: ch2\ntags: 1girl, silver hair'; } };
    const nai = { async generate() { return { ok: true, dataUrl: 'data:image/png;base64,ORIG' }; } };
    const getSettings = () => ({ autoIllustration: { assets: { spriteEnabled: true, backgroundEnabled: true, strictMatch: true } }, sceneAssets: USER_ASSETS });
    const matte = async (url, opts) => (opts && opts.detailed
        ? { dataUrl: `${url}#cut`, alphaMaskDataUrl: 'data:image/png;base64,MASK', diagnostics: {} }
        : `${url}#cut`);

    const store = createMemoryGeneratedAssetStore();
    let id = 0;
    const service = createAssetGenerationService({ messageHost: fakeHost(FLOOR_TEXT), llm, nai, store, matte, getSettings, newId: () => `img${++id}` });
    assert.equal((await service.processMessage(3)).ok, true);
    const sprite = await store.getImage('img2');
    assert.equal(sprite.schemaVersion, 2);
    assert.equal(sprite.originalDataUrl, 'data:image/png;base64,ORIG');
    assert.equal(sprite.dataUrl, 'data:image/png;base64,ORIG#cut');
    assert.equal(sprite.alphaMaskDataUrl, 'data:image/png;base64,MASK');
    assert.equal(sprite.workingDataUrl, '');
    assert.equal(sprite.revision, 1);
    const background = await store.getImage('img1');
    assert.equal(background.dataUrl, 'data:image/png;base64,ORIG');
    assert.equal(Object.prototype.hasOwnProperty.call(background, 'originalDataUrl'), false);
    assert.equal(service.resolveUrl('igs-gen:img2'), 'data:image/png;base64,ORIG#cut');

    // 额度不足：只保存透明结果，记录可诊断，立绘不丢失。
    const inner = createMemoryGeneratedAssetStore();
    const quotaStore = {
        ...inner,
        async putImage(value) {
            if (value.originalDataUrl) { const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err; }
            return inner.putImage(value);
        },
    };
    const reports = [];
    let id2 = 0;
    const quotaService = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT), llm, nai, store: quotaStore, matte, getSettings,
        newId: () => `q${++id2}`, report: (level, message) => reports.push({ level, message }),
    });
    assert.equal((await quotaService.processMessage(3)).ok, true);
    const degraded = await inner.getImage('q2');
    assert.equal(degraded.dataUrl, 'data:image/png;base64,ORIG#cut');
    assert.equal(Object.prototype.hasOwnProperty.call(degraded, 'originalDataUrl'), false);
    const assets = await inner.getAssetsByChat('chat-1');
    const spriteAsset = assets.find((a) => a.type === 'sprite');
    assert.equal(spriteAsset.status, 'review');
    assert.equal(spriteAsset.sourceUnavailable, 'quota');
    assert.ok(reports.some((r) => r.level === 'warn' && r.message.includes('source-unavailable: quota')));
});

test('gate:media:update-image-checks-revision-and-keeps-original', async () => {
    const { applyGeneratedImageUpdate } = await import('../src/media/generated-asset-store.js');
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 'v2', schemaVersion: 2, type: 'sprite', originalDataUrl: 'orig', workingDataUrl: '', dataUrl: 'cut', alphaMaskDataUrl: 'mask', revision: 1 });
    await store.putImage({ id: 'old', type: 'sprite', dataUrl: 'legacy-cut' });

    assert.deepEqual(await store.updateImage('missing', 1, { dataUrl: 'x' }), { ok: false, reason: 'not-found' });
    assert.equal((await store.updateImage('old', 1, { dataUrl: 'x' })).reason, 'source-unavailable');
    assert.equal((await store.getImage('old')).dataUrl, 'legacy-cut');

    const stale = await store.updateImage('v2', 5, { dataUrl: 'x' });
    assert.equal(stale.ok, false);
    assert.equal(stale.reason, 'stale-revision');
    assert.equal(stale.revision, 1);
    assert.equal((await store.getImage('v2')).dataUrl, 'cut');

    // 原图与 id 不可被补丁改写；revision 递增。
    const ok = await store.updateImage('v2', 1, { dataUrl: 'fixed', alphaMaskDataUrl: 'mask2', originalDataUrl: 'hacked', id: 'other' }, 't1');
    assert.equal(ok.ok, true);
    const saved = await store.getImage('v2');
    assert.equal(saved.revision, 2);
    assert.equal(saved.dataUrl, 'fixed');
    assert.equal(saved.alphaMaskDataUrl, 'mask2');
    assert.equal(saved.originalDataUrl, 'orig');
    assert.equal(saved.id, 'v2');
    assert.equal(saved.updatedAt, 't1');
    assert.equal(await store.getImage('other'), null);

    // 旧 revision 再次提交被拒绝，不覆盖已接受的结果。
    assert.equal((await store.updateImage('v2', 1, { dataUrl: 'late' })).reason, 'stale-revision');
    assert.equal((await store.getImage('v2')).dataUrl, 'fixed');

    assert.equal(applyGeneratedImageUpdate({ id: 'e', originalDataUrl: 'o', dataUrl: '', revision: 1 }, 1, {}).reason, 'empty-result');
});


test('gate:assets:service-matte-edit-read-save-and-stale-guard', async () => {
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 'v2', schemaVersion: 2, type: 'sprite', originalDataUrl: 'orig', workingDataUrl: '', dataUrl: 'cut', alphaMaskDataUrl: 'mask', revision: 1 });
    await store.putImage({ id: 'old', type: 'sprite', dataUrl: 'legacy-cut' });
    const emitted = [];
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store,
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        events: { emit: (name, detail) => emitted.push(detail) },
        now: () => 't-save',
    });
    assert.equal((await service.getEditableImage('missing')).reason, 'not-found');
    const legacy = await service.getEditableImage('old');
    assert.equal(legacy.ok, true);
    assert.equal(legacy.editable, false);
    assert.equal(legacy.record.originalDataUrl, '');
    assert.equal((await service.saveMatteEdit('old', 1, { dataUrl: 'x' })).reason, 'source-unavailable');

    const editable = await service.getEditableImage('v2');
    assert.equal(editable.editable, true);
    assert.equal(editable.record.revision, 1);
    const saved = await service.saveMatteEdit('v2', 1, { dataUrl: 'fixed', alphaMaskDataUrl: 'mask2' });
    assert.deepEqual(saved, { ok: true, revision: 2 });
    assert.equal(service.resolveUrl('igs-gen:v2'), 'fixed');
    assert.ok(emitted.some((d) => d.reason === 'matte-edited' && d.imageId === 'v2' && d.revision === 2));
    const after = await store.getImage('v2');
    assert.equal(after.originalDataUrl, 'orig');
    assert.equal(after.updatedAt, 't-save');

    // 另一会话持有旧 revision：拒绝，不覆盖已接受结果，也不发事件。
    const before = emitted.length;
    assert.equal((await service.saveMatteEdit('v2', 1, { dataUrl: 'late' })).reason, 'stale-revision');
    assert.equal((await store.getImage('v2')).dataUrl, 'fixed');
    assert.equal(emitted.length, before);

    const noUpdate = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store: { getImage: async () => null },
        getSettings: () => ({}),
    });
    assert.equal((await noUpdate.saveMatteEdit('v2', 1, { dataUrl: 'x' })).reason, 'update-unsupported');
});

test('gate:assets:bind-generated-sprite-to-character-default', () => {
    const kept = bindGeneratedSprite(
        { characters: { 冬月星見: { 默认: 'https://user.example/keep.png' } }, characterAliases: { 冬月星見: ['星見'] }, characterDna: { 冬月星見: { identity: '银发' } } },
        '星見',
        'igs-gen:def',
    );
    assert.equal(kept.ok, true);
    assert.equal(kept.created, false);
    assert.equal(kept.name, '冬月星見');
    assert.equal(kept.characters.冬月星見.默认, 'https://user.example/keep.png');
    const replaced = bindGeneratedSprite(
        { characters: { 冬月星見: { 默认: 'https://user.example/keep.png' } }, characterAliases: { 冬月星見: ['星見'] } },
        '星見',
        'igs-gen:def',
        { replace: true },
    );
    assert.equal(replaced.characters.冬月星見.默认, 'igs-gen:def');

    const created = bindGeneratedSprite(
        { characters: {}, characterAliases: {}, characterDna: { 冬月星見: { identity: '银发' } } },
        '冬月星見',
        'igs-gen:def',
    );
    assert.equal(created.created, true);
    assert.deepEqual(created.characters.冬月星見, { 默认: 'igs-gen:def' });
    assert.deepEqual(created.characterAliases.冬月星見, []);

    const hit = resolveSpriteAsset('冬月', '开心', {
        sceneAssets: {
            characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } },
            characterAliases: { 冬月: [] },
            moodGroups: [{ label: '喜悦', words: ['开心'] }],
        },
    });
    assert.equal(hit.url, 'igs-gen:joy');
    assert.equal(hit.source, 'user');
});

test('gate:assets:expression-set-writes-once-then-paints-eight-in-order', async () => {
    const { DEFAULT_MOOD_GROUPS, moodTierLabels, moodPresetTags } = await import('../src/scene/mood-groups.js');
    const { renderCharacterAssetList, renderGeneratedAssetPane } = await import('../src/visual/igs-ui/settings-fields.js');
    const { buildExpressionDiffDescription, uprightSpriteCaption } = await import('../src/generated-images/dbgen-prompt.js');
    const labels = moodTierLabels(8);
    const moodGroups = DEFAULT_MOOD_GROUPS;
    const captionOf = (text) => ({
        v4_prompt: { caption: { base_caption: text, char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    });
    let promptCalls = 0;
    let active = 0;
    let maxActive = 0;
    let angryFailed = false;
    const seeds = [];
    const painted = [];
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async (meta) => {
            promptCalls += 1;
            assert.match(meta.description, /8 份立绘表情差分/);
            assert.match(meta.description, /表情依据该角色的性格、脾气与行为习惯分别撰写/);
            assert.match(meta.description, /固定身份：\n银发，说话很冲/);
            assert.match(meta.description, /默认外观：\n白裙/);
            assert.match(meta.description, /触发词：\nfuyuko/);
            assert.match(meta.description, /不要出现：\nextra fingers/);
            assert.equal(meta.description.includes('楼层'), false);
            assert.match(meta.description, /无背景，透明底/);
            assert.match(meta.description, /规格：大腿以上（cowboy shot）。朝向正面，直立，平视。禁止全身，禁止露出脚，禁止侧身，禁止倾斜构图。/);
            assert.match(meta.description, /情绪须写入肢体：手势、肩线、重心随该情绪变化。禁止仅替换面部。/);
            assert.equal(meta.description.includes('表情只改脸'), false);
            assert.equal(meta.description.includes('站姿不要变'), false);
            assert.equal(meta.description.includes('已有立绘正面'), false);
            assert.equal(meta.description.includes('v4_prompt'), false);
            assert.match(meta.description, /slotid: 1\nscene: 1girl, silver hair\nscene_uc: lowres\nchar: 0\.5,0\.5 \| silver hair\nchar_uc: blonde hair/);
            assert.equal(meta.caption, undefined);
            assert.match(meta.description, /下面这份是已有立绘，外貌和构图按它画。这不是要回写的图。\nslotid: 1\nscene: 1girl, silver hair/);
            assert.match(meta.description, /按 slotid 1 到 8 的顺序另写 8 份：1 喜悦、2 愤怒、3 悲伤、4 平和、5 害羞、6 爱恋、7 嫌弃、8 紧张/);
            assert.ok(meta.description.indexOf('下面这份是已有立绘') < meta.description.indexOf('按 slotid 1 到 8'));
            return {
                ok: true,
                caption: captionOf('expr 喜悦'),
                captions: labels.map((label, index) => ({ slotId: index + 1, caption: captionOf(`expr ${label}`) })).reverse(),
            };
        },
        generateDbgenCaption: async (meta) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            const text = meta.caption.v4_prompt.caption.base_caption;
            painted.push(text);
            seeds.push(meta.seed);
            await Promise.resolve();
            active -= 1;
            assert.equal(meta.transparent, true);
            assert.equal(meta.size, '832x1216');
            assert.match(meta.userPrompts.positive, /transparent background/);
            assert.match(meta.userPrompts.positive, /cowboy shot/);
            assert.equal(meta.userPrompts.positive.includes('full body'), false);
            assert.equal(meta.userPrompts.positive.includes('arms at sides'), false);
            assert.match(meta.userPrompts.negative, /full body/);
            assert.match(meta.userPrompts.negative, /feet/);
            if (text.includes('愤怒') && !angryFailed) {
                angryFailed = true;
                return { ok: false, error: '上游拒绝', prompt: { positive: 'angry face', negative: 'lowres' } };
            }
            return { ok: true, dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: text, negative: 'lowres' } };
        },
    };
    const store = createMemoryGeneratedAssetStore();
    let seq = 0;
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai, store,
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => `expr-${seq += 1}`,
        matte: async (dataUrl) => dataUrl,
    });
    const dna = { identity: '银发，说话很冲', defaultAppearance: '白裙', negative: 'extra fingers', triggerWords: 'fuyuko' };
    const baseCaption = captionOf('1girl, silver hair');
    baseCaption.v4_prompt.caption.char_captions = [{ char_caption: 'silver hair', centers: [{ x: 0.5, y: 0.5 }] }];
    baseCaption.v4_negative_prompt.caption.char_captions = [{ char_caption: 'blonde hair' }];
    const progress = [];
    const result = await service.generateExpressionSet({
        name: '冬月',
        basePrompt: { positive: '1girl, silver hair', negative: 'lowres', caption: baseCaption },
        moods: labels,
        dna,
        onProgress: (event) => progress.push({ ...event }),
    });
    assert.equal(dna.identity, '银发，说话很冲');
    assert.equal(promptCalls, 1);
    assert.equal(maxActive, 1);
    assert.deepEqual(painted, labels.map((label) => `fuyuko, ${moodPresetTags(label)}, silver hair, expr ${label}, cowboy shot, standing, facing viewer, straight-on`));
    assert.equal(new Set(seeds).size, 1, 'one seed for the whole set');
    assert.ok(Number.isInteger(seeds[0]) && seeds[0] >= 0);
    assert.equal(result.items.length, 8);
    assert.equal(result.items[0].ok, true);
    assert.equal(result.items[0].imageId, 'expr-1');
    assert.equal(result.items[1].ok, false);
    assert.equal(result.items[1].mood, '愤怒');
    assert.equal(result.items[1].caption.v4_prompt.caption.base_caption, `fuyuko, ${moodPresetTags('愤怒')}, silver hair, expr 愤怒, cowboy shot, standing, facing viewer, straight-on`);
    assert.equal(progress[0].phase, 'write');
    assert.equal(progress[0].done, 0);
    assert.equal(progress[0].total, 8);
    assert.deepEqual(progress.filter((event) => event.phase === 'paint').map((event) => event.mood), labels);
    assert.equal(progress[1].done, 1);
    const retryProgress = [];
    const retry = await service.generateExpressionImage({
        name: '冬月', mood: '愤怒', caption: result.items[1].caption,
        onProgress: (event) => retryProgress.push(event),
    });
    assert.deepEqual(retryProgress, [{ phase: 'paint', done: 1, total: 1, mood: '愤怒' }]);
    assert.equal(promptCalls, 1, '失败重画只出这一张，不再写提示词');
    assert.equal(retry.items[0].ok, true);
    assert.equal(retry.items[0].imageId, 'expr-8');

    const hit = resolveSpriteAsset('冬月', '开心', {
        sceneAssets: {
            characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } },
            characterAliases: {},
            moodGroups,
        },
    });
    assert.equal(hit.url, 'igs-gen:joy');
    assert.equal(hit.slot, '喜悦');
    assert.equal(hit.source, 'user');

    const html = renderCharacterAssetList({
        冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy', 愤怒: '' },
    }, {
        expressionNotes: { 冬月: { 愤怒: { positive: 'angry face', negative: 'lowres', error: '上游拒绝' } } },
        isOpen: (key) => key === 'char-open:冬月',
    });
    assert.ok(html.includes('data-action="char-expression-set:%E5%86%AC%E6%9C%88"'));
    assert.ok(html.includes('data-action="char-expression-prompt:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6"'));
    assert.ok(html.includes('data-action="char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6"'));
    assert.ok(html.includes('char-expression-retry:'));
    assert.ok(html.includes('重新生成'));
    const changed = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '泳装', words: ['泳衣'], ownImage: false });
    assert.match(changed, /服装「泳装」/);
    assert.match(changed, /泳衣/);
    assert.match(changed, /不要沿用原装的衣服/);
    const written = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '泳装', words: ['泳衣'], ownImage: false, prompt: 'school swimsuit, one-piece' });
    assert.match(written, /服装提示词：\nschool swimsuit, one-piece/);
    assert.match(written, /不要沿用原装的衣服/);
    assert.equal(written.includes('衣服按这些词来画'), false);
    const own = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '泳装', words: ['泳衣'], ownImage: true });
    assert.match(own, /不要画成别的衣服/);
    assert.equal(own.includes('不要沿用原装的衣服'), false);
    const outfitHtml = renderCharacterAssetList({
        冬月: { 默认: 'igs-gen:def' },
    }, {
        characterOutfits: { 冬月: { 泳装: { words: ['泳衣'], moods: { 愤怒: '', 喜悦: 'igs-gen:joy' } } } },
        outfitTabs: { 冬月: '泳装' },
        expressionNotes: { '冬月\u0001泳装': { 愤怒: { error: '上游拒绝' } } },
        isOpen: () => true,
    });
    assert.ok(outfitHtml.includes('data-action="outfit-expression-set:%E5%86%AC%E6%9C%88:%E6%B3%B3%E8%A3%85"'));
    assert.equal(outfitHtml.includes('char-expression-set:'), false);
    assert.ok(outfitHtml.includes('outfit-expression-retry:'));
    assert.ok(outfitHtml.includes('data-action="outfit-expression-prompt:%E5%86%AC%E6%9C%88:%E6%B3%B3%E8%A3%85:%E5%96%9C%E6%82%A6"'));
    assert.ok(outfitHtml.includes('data-action="outfit-expression-retry:%E5%86%AC%E6%9C%88:%E6%B3%B3%E8%A3%85:%E5%96%9C%E6%82%A6"'));
    const pane = renderGeneratedAssetPane({
        temp: [{ key: 'k1', type: 'sprite', name: '冬月', imageId: 'def' }],
        resolveUrl: () => '',
    });
    assert.ok(pane.includes('入库到角色'));
    assert.ok(pane.includes('修复抠图'));
    assert.equal(pane.includes('绑定到角色'), false);
    assert.equal(pane.includes('提示词'), false);
    assert.equal(pane.includes('下载'), false);
    assert.equal(pane.includes('表情差分'), false);
    assert.equal(pane.includes('igs-expression-cell'), false);
    const leaned = uprightSpriteCaption({
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [{ char_caption: 'silver hair, leaning', centers: [{ x: 0.5, y: 0.5 }] }] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [{ char_caption: 'blonde hair' }] } },
    });
    assert.match(leaned.v4_prompt.caption.char_captions[0].char_caption, /cowboy shot, standing, facing viewer, straight-on/);
    assert.match(leaned.v4_negative_prompt.caption.base_caption, /full body, feet/);
    assert.match(leaned.v4_prompt.caption.char_captions[0].char_caption, /leaning/);
    assert.equal(leaned.v4_prompt.caption.base_caption, '1girl');
    assert.match(leaned.v4_negative_prompt.caption.char_captions[0].char_caption, /dutch angle, from side, profile/);
    assert.equal(leaned.v4_negative_prompt.caption.char_captions[0].char_caption.includes('head tilt'), false);
});

test('gate:assets:expression-set-writes-all-moods-in-one-request', async () => {
    const { splitExpressionMoodBatches } = await import('../src/generated-images/dbgen-prompt.js');
    const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    // 楼内补立绘仍按 8 份拆批；表情差分走 generateExpressionSet，不再用这个函数。
    assert.deepEqual(splitExpressionMoodBatches(ten), [ten.slice(0, 5), ten.slice(5)]);

    const captionOf = (text) => ({
        v4_prompt: { caption: { base_caption: text, char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    });
    const order = [];
    const nai = {
        writeDbgenPrompt: async ({ description }) => {
            order.push(`write:${description.includes('写 10 份') ? 10 : 0}`);
            return { ok: true, captions: ten.map((mood, index) => ({ slotId: index + 1, caption: captionOf(`expr ${mood}`) })) };
        },
        generateDbgenCaption: async ({ caption }) => {
            const text = caption.v4_prompt.caption.base_caption;
            order.push(`paint:${text.replace('expr ', '')}`);
            return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: text, negative: '' } };
        },
    };
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c1', getUserName: () => '', readPreviousAiTexts: () => [] },
        llm: null, nai, store: createMemoryGeneratedAssetStore(), getSettings: () => ({}), events: null, matte: async (dataUrl) => dataUrl,
    });
    const result = await service.generateExpressionSet({
        name: '冬月',
        basePrompt: { positive: '1girl' },
        moods: ten,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.items.map((item) => item.mood), ten);
    assert.deepEqual(order.filter((step) => step.startsWith('write')), ['write:10']);
});

test('gate:assets:wardrobe-prompt-writes-once-and-does-not-paint', async () => {
    let paints = 0;
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async (meta) => {
            assert.match(meta.description, /浴衣/);
            assert.match(meta.description, /一套衣服，而不是角色，没有角色/);
            assert.match(meta.description, /从上到下写完整/);
            assert.match(meta.description, /不要只写其中一件/);
            assert.equal(meta.description.includes('冬月'), false);
            assert.equal(meta.description.includes('楼层'), false);
            return {
                ok: true,
                caption: {
                    v4_prompt: { caption: { base_caption: 'yukata, floral pattern', char_captions: [] } },
                    v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
                },
            };
        },
        generateDbgenCaption: async () => { paints += 1; return { ok: true, dataUrl: 'data:image/png;base64,QQ==' }; },
    };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai, store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
    });
    const written = await service.writeWardrobePrompt({ character: '冬月', outfit: '浴衣' });
    assert.deepEqual(written, { ok: true, prompt: 'yukata, floral pattern' });
    assert.equal(paints, 0);
});

test('gate:assets:wardrobe-reference-paints-the-saved-prompt', async () => {
    let writes = 0;
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async () => { writes += 1; return { ok: false, error: '不该写词' }; },
        generateDbgenCaption: async (meta) => {
            assert.equal(meta.caption.v4_prompt.caption.base_caption, 'yukata, floral pattern');
            assert.equal(meta.transparent, true);
            return { ok: true, dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: 'yukata, floral pattern', negative: '' } };
        },
    };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai, store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => 'ref-1',
    });
    const painted = await service.paintWardrobeReference({ prompt: 'yukata, floral pattern' });
    assert.deepEqual(painted, { ok: true, imageId: 'ref-1' });
    assert.equal(writes, 0);
    assert.equal(await service.resolveUrl('igs-gen:ref-1'), 'data:image/png;base64,QQ==');
});

test('gate:assets:character-sprite-writes-from-dna-then-paints-default', async () => {
    const { buildCharacterSpriteDescription } = await import('../src/generated-images/dbgen-prompt.js');
    const { renderCharacterAssetList, renderDnaOnlyCharacterList } = await import('../src/visual/igs-ui/settings-fields.js');
    const text = buildCharacterSpriteDescription('冬月', {
        identity: '银发', defaultAppearance: '白裙', negative: 'extra fingers', triggerWords: 'fuyuko',
    });
    assert.match(text, /画角色「冬月」的立绘/);
    assert.match(text, /固定身份：\n银发/);
    assert.match(text, /默认外观：\n白裙/);
    assert.match(text, /无背景，透明底/);
    assert.match(text, /只写一份，slotid 为 1/);
    assert.equal(text.includes('楼层'), false);
    assert.equal(text.includes('正文'), false);
    const bare = buildCharacterSpriteDescription('路人甲', null);
    assert.match(bare, /按这个角色补一个日常样子/);
    assert.equal(bare.includes('固定身份'), false);
    assert.match(text, /以下面的设定为准，优先于上下文、世界书和角色库/);
    assert.equal(bare.includes('优先于上下文'), false);

    const caption = {
        v4_prompt: { caption: { base_caption: '1girl, silver hair', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const order = [];
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async (meta) => {
            order.push('write');
            assert.match(meta.description, /冬月/);
            return { ok: true, caption };
        },
        generateDbgenCaption: async (meta) => {
            order.push('paint');
            assert.equal(meta.transparent, true);
            assert.match(meta.caption.v4_prompt.caption.base_caption, /cowboy shot/);
            return { ok: true, dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: '1girl', negative: 'lowres' } };
        },
    };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai, store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => 'sprite-1',
        matte: async (dataUrl) => dataUrl,
    });
    const result = await service.generateCharacterSprite({ name: '冬月', dna: { identity: '银发' } });
    assert.deepEqual([result.ok, result.imageId], [true, 'sprite-1']);
    assert.deepEqual(order, ['write', 'paint']);

    const html = renderCharacterAssetList({ 冬月: { 默认: '' } }, { isOpen: () => true });
    assert.ok(html.includes('data-action="char-generate-sprite:%E5%86%AC%E6%9C%88"'));
    assert.ok(html.includes('生成立绘'));
    const dnaOnly = renderDnaOnlyCharacterList({ 路人甲: { identity: '' } }, {});
    assert.ok(dnaOnly.includes('data-action="char-generate-sprite:%E8%B7%AF%E4%BA%BA%E7%94%B2"'));
});

test('gate:assets:floor-sprite-descriptions-carry-dna', async () => {
    const { buildDbgenSpriteBatchDescription, buildDbgenAssetDescription } = await import('../src/generated-images/dbgen-prompt.js');
    const alice = { type: 'sprite', name: '爱丽丝', dna: { identity: '', defaultAppearance: 'black hair, blue eyes', negative: 'blonde hair', triggerWords: '' } };
    const plain = { type: 'sprite', name: '路人甲' };
    const batch = buildDbgenSpriteBatchDescription([plain, alice]);
    assert.match(batch, /第 2 份：\n「爱丽丝」的长相以下面的设定为准/);
    assert.match(batch, /默认外观：\nblack hair, blue eyes/);
    assert.match(batch, /不要出现：\nblonde hair/);
    assert.equal(batch.includes('第 1 份'), false);
    assert.equal(buildDbgenSpriteBatchDescription([plain]).includes('长相按设定写'), false);
    const single = buildDbgenAssetDescription(alice);
    assert.match(single, /默认外观：\nblack hair, blue eyes/);
    assert.equal(buildDbgenAssetDescription(plain).includes('默认外观'), false);
});

test('gate:assets:expression-mood-tags-beat-copied-neutral-face-and-dna-pose', async () => {
    const { applyMoodToCaption, applyCharacterDnaToCaption, buildExpressionDiffDescription, buildCharacterSpriteDescription, buildDbgenSpriteBatchDescription } = await import('../src/generated-images/dbgen-prompt.js');
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl, black hair, expressionless, closed mouth, arms at sides, red hoodie', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
    };
    const laugh = applyMoodToCaption(caption, '大笑').v4_prompt.caption.base_caption;
    assert.match(laugh, /^laughing, open mouth/);
    assert.doesNotMatch(laugh, /expressionless|closed mouth|arms at sides/);
    assert.match(laugh, /red hoodie/);
    assert.equal(applyMoodToCaption(caption, '默认'), caption);
    assert.equal(applyMoodToCaption(caption, '自建组'), caption);
    const withChar = { ...caption, v4_prompt: { caption: { base_caption: 'solo', char_captions: [{ char_caption: '1girl, expressionless', centers: [{ x: 0.5, y: 0.5 }] }] } } };
    const charOut = applyMoodToCaption(withChar, '哭泣').v4_prompt.caption;
    assert.equal(charOut.base_caption, 'solo');
    assert.match(charOut.char_captions[0].char_caption, /^crying, tears/);
    assert.doesNotMatch(charOut.char_captions[0].char_caption, /expressionless/);
    const dna = { defaultAppearance: 'black hair, red eyes, expressionless, light smile, closed mouth, arms at sides, hands on hips, red hoodie', negative: 'smile' };
    const merged = applyCharacterDnaToCaption(applyMoodToCaption(caption, '喜悦'), dna);
    const positive = merged.v4_prompt.caption.base_caption;
    assert.match(positive, /^black hair, red eyes, red hoodie, smile, happy/);
    assert.doesNotMatch(positive, /expressionless|light smile|closed mouth|arms at sides|hands on hips/);
    assert.equal(merged.v4_negative_prompt.caption.base_caption.includes('smile'), false);
    const text = buildExpressionDiffDescription('冬月', { caption }, ['大笑'], null, null);
    assert.match(text, /表情和动作不要沿用/);
    assert.match(buildCharacterSpriteDescription('冬月', null), /轻量的日常小动作/);
    assert.match(buildDbgenSpriteBatchDescription([{ name: '冬月' }]), /轻量的日常小动作/);
    assert.equal(buildAssetSlot({ need: { type: 'sprite', name: '冬月' }, tags: '1girl', uc: '' }).scene.includes('arms at sides'), false);
    const legacy = '{tags}, solo, cowboy shot, standing, facing viewer, looking at viewer, straight-on, arms at sides, centered, {matte}';
    assert.equal(normalizeAutoIllustrationSettings({ assets: { templates: { sprite: legacy } } }).assets.templates.sprite.includes('arms at sides'), false);
    assert.equal(normalizeAutoIllustrationSettings({ assets: { templates: { sprite: '{tags}, arms at sides' } } }).assets.templates.sprite, '{tags}, arms at sides');
});

test('gate:assets:expression-look-keeps-clothes-from-one-source', async () => {
    const { expressionLookTags, expressionPaintDna, applyLookToCaption } = await import('../src/generated-images/dbgen-prompt.js');
    const { expressionSeed } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const base = { caption: {
        v4_prompt: { caption: { base_caption: 'solo', char_captions: [{ char_caption: '1girl, black hair, red hoodie, shorts, expressionless, closed mouth, arms at sides, cowboy shot, standing, transparent background' }] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } },
    } };
    assert.equal(expressionLookTags(base, null), '1girl, black hair, red hoodie, shorts');
    assert.equal(expressionLookTags(base, { name: '泳装', prompt: 'white bikini, 白色泳衣, sun hat', ownImage: false }), 'white bikini, sun hat');
    assert.equal(expressionLookTags(base, { name: '泳装', prompt: '', ownImage: false }), '', 'old clothes must not leak into a new outfit');
    assert.equal(expressionLookTags(base, { name: '泳装', prompt: '', ownImage: true }), '1girl, black hair, red hoodie, shorts');
    assert.equal(expressionLookTags({ positive: '1girl, maid outfit, smile' }, null), '1girl, maid outfit');
    const dna = { identity: 'black hair', defaultAppearance: 'red hoodie' };
    assert.equal(expressionPaintDna(dna, null), dna);
    assert.deepEqual(expressionPaintDna(dna, { name: '泳装' }), { identity: 'black hair', defaultAppearance: '' });
    const caption = { v4_prompt: { caption: { base_caption: 'laughing, red jacket', char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: '', char_captions: [] } } };
    assert.equal(applyLookToCaption(caption, 'red hoodie, shorts').v4_prompt.caption.base_caption, 'red hoodie, shorts, laughing, red jacket');
    assert.equal(applyLookToCaption(caption, ''), caption);
    assert.equal(expressionSeed('冬月', ''), expressionSeed('冬月', ''));
    assert.notEqual(expressionSeed('冬月', ''), expressionSeed('冬月', '泳装'));
});

test('gate:assets:regenerating-a-filled-expression-rewrites-with-a-fresh-seed', async () => {
    const cap = (t) => ({ v4_prompt: { caption: { base_caption: t, char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } });
    const writes = [];
    const paints = [];
    const nai = {
        writeDbgenPrompt: async (meta) => { writes.push(meta.description); return { ok: true, caption: cap('fresh'), captions: [{ slotId: 1, caption: cap('fresh') }] }; },
        generateDbgenCaption: async (meta) => { paints.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: 'x', negative: '' } }; },
    };
    let seq = 0;
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai, store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => `r-${seq += 1}`,
        matte: async (dataUrl) => dataUrl,
    });
    const basePrompt = { positive: '1girl, red hoodie', negative: '', caption: cap('1girl, red hoodie') };
    await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: cap('old, expressionless'), basePrompt, reseed: true });
    await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: cap('old, expressionless'), basePrompt, reseed: true });
    assert.equal(writes.length, 2, 'filled slot is rewritten, not repainted from the old prompt');
    assert.match(paints[0].caption.v4_prompt.caption.base_caption, /^laughing/);
    assert.doesNotMatch(paints[0].caption.v4_prompt.caption.base_caption, /old/);
    assert.ok(Number.isInteger(paints[0].seed) && Number.isInteger(paints[1].seed));
    await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: cap('noted') });
    assert.equal(writes.length, 2, 'failed empty slot repaints its saved caption');
    const { expressionSeed } = await import('../src/generated-images/illustration/asset-generation-service.js');
    assert.equal(paints[2].seed, expressionSeed('冬月', ''));
});
