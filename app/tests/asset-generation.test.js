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
    const bg = buildAssetSlot({ need: { type: 'background', name: 'y' }, tags: 'factory', uc: '' }, { templates: { background: 'my style, {tags}' } });
    assert.equal(bg.scene, 'my style, factory');
});

test('gate:assets:templates-and-dictionary-fallback', () => {
    assert.equal(applyTemplate('{tags}, , solo', { tags: 'a, b' }), 'a, b, solo');
    const s = normalizeAutoIllustrationSettings({ assets: { templates: { sprite: 'no placeholder', background: '' } } });
    assert.ok(s.assets.templates.sprite.includes('{tags}'));
    assert.ok(s.assets.templates.background.includes('{tags}'));
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
    const off = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT),
        llm: { async request() { requested = true; return ''; } },
        nai: { async generate() { requested = true; return { ok: false }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true } }, sceneAssets: { ...USER_ASSETS, enabled: false } }),
    });
    assert.equal((await off.processMessage(3)).reason, 'scene-assets-disabled');
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
