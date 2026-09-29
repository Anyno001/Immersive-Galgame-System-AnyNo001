import test from 'node:test';
import assert from 'node:assert/strict';

import { classifySceneKey, lookupSceneBackground } from '../src/scene/scene-directives.js';
import {
    resolveBackgroundAsset, resolveSpriteAsset, collectAssetNeeds,
    addGeneratedAssetToLibrary, renameGeneratedLibraryEntry, removeGeneratedLibraryEntry, normalizeGeneratedLibrary,
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
    for (const name of ['旁白', '阿明', '？？？']) assert.equal(resolveSpriteAsset(name, '', ctx).needsGeneration, false, name);
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
    assert.ok(grey.sceneUc.includes('white background') && grey.sceneUc.includes('loli'));
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
    assert.equal(customSprite.sceneUc, 'no crowd, loli, shota, child, young child, underage, toddler, aged down, extra arms');
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

test('gate:image-backend:extension-mode-falls-back-to-builtin-nai', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    let bridge = { imageApi: { mode: 'extension' }, autoIllustration: {} };
    const calls = [];
    const backend = createImageBackend({ nai: { generate: async (slot, s) => { calls.push(s.apiKey); return { ok: true, dataUrl: 'data:,' }; } }, global: {}, getBridge: () => bridge });
    assert.match(backend.describe().ready.error, /智绘姬无法按需生成/);
    bridge = { imageApi: { mode: 'extension' }, autoIllustration: { nai: { apiKey: 'pst-a' } } };
    assert.equal(backend.describe().ready.ok, true);
    assert.equal((await backend.generate({ scene: 'room' }, { apiKey: 'pst-a' })).ok, true);
    assert.deepEqual(calls, ['pst-a']);
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
    assert.match(metas[0].description, /no humans, scenery/);
    assert.match(metas[0].description, /负面提示词.*1girl/);
    assert.ok(metas[0].userPrompts.positive.includes('no humans'));
    assert.ok(metas[0].userPrompts.negative.includes('1girl'));
});

test('gate:assets:dbgen-sprite-passes-frontend-templates', async () => {
    const { createAssetGenerationService } = await import('../src/generated-images/illustration/asset-generation-service.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const floor = { chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text: '[igs-char:神秘少女|平静|你来了。]' };
    const metas = [];
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { throw new Error('不应请求副 LLM'); } },
        nai: {
            describe: () => ({ mode: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            async generate(slot, settings, meta) { metas.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,AAA' }; },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({
            autoIllustration: { assets: { spriteEnabled: true, templates: { sprite: '{tags}, upper body, red ribbon, {matte}', spriteNegative: 'cowboy shot, hat' } } },
            sceneAssets: { enabled: true, scenes: {}, characters: {} },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.deepEqual([result.ok, result.count], [true, 1]);
    const meta = metas[0];
    assert.ok(!meta.description.includes('全身'), '不再写死全身构图');
    assert.match(meta.description, /神秘少女/);
    assert.match(meta.description, /upper body, red ribbon/);
    assert.match(meta.description, /cowboy shot, hat/);
    assert.ok(!/loli|shota|underage/.test(meta.description), '内置防护词不写进交给写词 LLM 的描述');
    assert.ok(meta.userPrompts.negative.includes('loli'), '内置防护词仍随 userPrompts 进入最终负面');
    assert.ok(meta.userPrompts.positive.startsWith('upper body, red ribbon'));
    assert.ok(meta.userPrompts.negative.startsWith('cowboy shot, hat'));
});

test('gate:image-backend:dbgen-merges-frontend-prompts-into-caption', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
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
    const backend = createImageBackend({ nai: {}, global: globalObject, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
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
