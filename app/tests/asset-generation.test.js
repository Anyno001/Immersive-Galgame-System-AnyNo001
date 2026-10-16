import { createAssetGenerationService } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeLlmHost } from './helpers/fake-llm-host.js';

import { classifySceneKey, lookupSceneBackground } from '../src/scene/scene-directives.js';
import {
    resolveBackgroundAsset, resolveSpriteAsset, collectAssetNeeds,
    addGeneratedAssetToLibrary, bindGeneratedSprite, fileGeneratedHoldings, renameGeneratedLibraryEntry, removeGeneratedLibraryEntry, normalizeGeneratedLibrary,
} from '../src/scene/asset-match.js';
import { parseAssetPlan, buildAssetSlot, buildDictionaryAssetItems, ASSET_PLANNER_SYSTEM_PROMPT } from '../src/generated-images/illustration/asset-prompt.js';
import { buildItemSlot } from '../src/generated-images/illustration/item-prompt.js';
import { looksLikeRefusal, requestWithSoftRetry, applyTemplate } from '../src/generated-images/illustration/prompt-kit.js';
import { buildNaiV4Request, supportsNaiTransparentBackground } from '../src/generated-images/request-builders/nai-v4-builder.js';
import { normalizeAutoIllustrationSettings, isStrictBackgroundMatch } from '../src/generated-images/illustration/auto-illustration-settings.js';
import { createAlphaMatte, hasTransparentBorder, matteSolidBackground, findOpaqueBounds } from '../src/media/alpha-matte.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { characterViewsFixture, characterWriteFixture, spriteDataReply } from './helpers/prompt-provenance.js';
import { prepareCharacterCaption } from '../src/generated-images/character-caption.js';
import { pngFixture, imageZipFixture } from './helpers/png-fixture.js';
import { deflateRawSync } from 'node:zlib';

function imageTaskInput(request) {
    const inputs = request.messages.flatMap(message => {
        try { const value = JSON.parse(message.content); return value?.outputs?.format ? [value] : []; }
        catch { return []; }
    });
    assert.equal(inputs.length, 1, '请求必须包含唯一任务资料');
    return inputs[0];
}

const USER_ASSETS = {
    enabled: true,
    scenes: { 学校天台: { url: 'roof.png', times: {} }, 教室: { url: 'class.png', times: {} }, 默认: { url: 'default.png', times: {} } },
    characters: { 艾莉: { 默认: 'ally.png' }, 空槽角色: { 默认: '' } },
    characterOutfits: { 艾莉: { 常服: { moods: { 平和: 'ally.png' } } } },
    characterDefaultOutfits: { 艾莉: { version: 1, outfitName: '常服' } },
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
    assert.deepEqual(needs[1], { type: 'sprite', name: '神秘少女' }, '旧调用不追加空衣装字段');
    const tagged = collectAssetNeeds({ characters: ['神秘少女', '陌生青年', '神秘少女', '艾莉'],
        characterTriggers: [
            { character: '神秘少女', unknownOutfit: '蓝外套' },
            { character: '陌生青年', outfit: '白衬衣' },
            { character: '神秘少女', unknownOutfit: '晚礼服' },
            { character: '艾莉', outfit: '校服' },
        ] }, ctx, { sprite: true });
    assert.deepEqual(tagged, [
        { type: 'sprite', name: '神秘少女', outfitName: '蓝外套' },
        { type: 'sprite', name: '陌生青年', outfitName: '白衬衣' },
    ], '一人一张，冻结触发标签原名；已有正式立绘不补图');
    assert.deepEqual(collectAssetNeeds({ characters: ['神秘少女'], characterTriggers: [
        { character: '神秘少女' }, { character: '神秘少女', unknownOutfit: '晚礼服' },
    ] }, ctx, { sprite: true }), [{ type: 'sprite', name: '神秘少女' }],
    '首次触发没有衣装栏时，不借后续标签衣装');
});

test('gate:assets:auto-sprite-outfit-binding-is-scoped-and-preserves-description', async () => {
    const { bindAutoSpriteOutfitNames } = await import('../src/generated-images/illustration/character-prompt-task.js');
    const entry = { slotId: 2, characterMeta: { version: 1, characters: [
        { characterKey: 'Alice', outfit: { name: 'Model name', description: 'wears a blue coat' } },
        { characterKey: 'Bob', outfit: { name: 'Bob outfit', description: 'wears a white shirt' } },
    ] } };
    const before = structuredClone(entry);
    const names = [{ slotId: 1, characterKey: 'Alice', name: '晚礼服' },
        { slotId: 2, characterKey: 'Alice', name: '蓝外套' }];
    const bound = bindAutoSpriteOutfitNames(entry, { purpose: 'sprite' }, names);
    assert.deepEqual(bound.characterMeta.characters[0].outfit,
        { name: '蓝外套', description: 'wears a blue coat' });
    assert.deepEqual(bound.characterMeta.characters[1], before.characterMeta.characters[1]);
    assert.deepEqual(entry, before, '绑定不修改原回复');
    assert.equal(bindAutoSpriteOutfitNames(entry, { purpose: 'sprite' }).characterMeta, entry.characterMeta);
    assert.equal(bindAutoSpriteOutfitNames(undefined, { purpose: 'sprite' }, names), undefined);
    assert.equal(bindAutoSpriteOutfitNames(entry, { purpose: 'sprite' }, names.slice(0, 1))
        .characterMeta.characters[0].outfit.name, 'Model name', '不同图号不借用名称');
    assert.equal(bindAutoSpriteOutfitNames(entry, { purpose: 'derived' }, names), entry,
        '自动补图之外的任务保持原校验');
    assert.equal(bindAutoSpriteOutfitNames(entry, { purpose: 'sprite' }, [...names, names[1]])
        .characterMeta.characters[0].outfit.name, 'Model name', '歧义绑定不猜选');
    for (const withMetadata of [false, true]) {
        const store = createMemoryGeneratedAssetStore();
        const floor = { chatId: 'legacy', messageId: 3, swipeId: 0, isAi: true, isLatest: true,
            text: '[igs-thought:Alice|平和|蓝外套|她想了想。]\n[igs-char:Alice|平和|晚礼服|晚上好。]' };
        const service = createAssetGenerationService({ store, minBodyChars: 0,
            messageHost: { getChatId: () => floor.chatId, readFloor: () => floor,
                readPreviousAiTexts: () => [] },
            getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true } },
                sceneAssets: { enabled: true, characters: {} } }),
            nai: {
                describe: () => ({ mode: 'dbgen', via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
                async generate(_slot, _settings, meta) {
                    assert.equal(meta.characterContext[0].outfit.name, '蓝外套');
                    assert.deepEqual(meta.autoSpriteOutfitNames,
                        [{ slotId: 1, characterKey: 'Alice', name: '蓝外套' }]);
                    return { ok: true, dataUrl: 'data:image/png;base64,FAKE',
                        ...(withMetadata && { characterMeta: { version: 1, characters: [{
                            characterKey: 'Alice', outfit: { name: 'Model name', description: 'wears a blue coat' },
                        }] } }) };
                },
            },
        });
        const result = await service.processMessage(3);
        assert.deepEqual([result.ok, result.count], [true, 1]);
        const record = await service.readRecord('legacy|char|Alice');
        assert.equal(record.outfitName, '蓝外套');
        assert.equal(record.outfitSnapshot, undefined, '旧入口不伪造生成快照');
        const image = await store.getImage(record.imageId);
        if (withMetadata) {
            assert.deepEqual(image.characterMeta.characters[0].outfit,
                { name: '蓝外套', description: 'wears a blue coat' });
            assert.deepEqual(record.characterMeta, image.characterMeta);
        } else assert.equal(image.characterMeta, undefined, '不补造模型未提供的元数据');
    }
});

test('gate:assets:generated-library-is-separate-and-renamable', () => {
    const added = addGeneratedAssetToLibrary({}, { type: 'sprite', name: '神秘少女', imageId: 'img1' }, '莉莉');
    assert.equal(added.library.characters.莉莉.默认, 'igs-gen:img1');
    assert.deepEqual(added.library.characterAliases.莉莉, ['神秘少女']);
    const ctx = { sceneAssets: USER_ASSETS, generatedAssets: added.library };
    const before = structuredClone(added.library);
    assert.deepEqual([resolveSpriteAsset('神秘少女', '', ctx).url, resolveSpriteAsset('神秘少女', '', ctx).source], ['', 'none']);
    assert.equal(Object.hasOwn(added.library, 'characterDefaultOutfits'), false, '旧生成图库不推断新默认');
    assert.deepEqual(added.library, before, '读取不迁移或清空旧图槽');
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

test('gate:assets:filing-backgrounds-preserves-legacy-sprites-without-migration', () => {
    const assets = {
        characters: { 莉莉: { 默认: 'igs-gen:img1' } },
        scenes: {},
        generated: {
            characters: { 莉莉: { 默认: 'igs-gen:img1' }, 新角色: { 默认: 'igs-gen:img2', 喜悦: 'igs-gen:img3' } },
            scenes: { 工厂: { url: 'igs-gen:bg1', words: [], times: {} } },
            expressionNotes: { 莉莉: { 喜悦: { positive: 'smile' } } },
        },
    };
    const before = structuredClone(assets);
    fileGeneratedHoldings(assets);
    assert.deepEqual(assets.characters, before.characters);
    assert.deepEqual(assets.generated.characters, before.generated.characters);
    assert.equal(Object.hasOwn(assets, 'characterDefaultOutfits'), false);
    assert.equal(Object.hasOwn(assets, 'characterOutfits'), false);
    assert.equal(assets.scenes.工厂.url, 'igs-gen:bg1');
    assert.equal(assets.generated.scenes.工厂, undefined);
    assert.equal(assets.generated.expressionNotes.莉莉.喜悦.positive, 'smile');
    const filed = structuredClone(assets);
    fileGeneratedHoldings(assets);
    assert.deepEqual(assets, filed, '重复保存不迁移立绘或反复归档');
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
    assert.ok(grey.scene.includes('light grey background'));
    assert.ok(grey.sceneUc.includes('white background'));
    const native = buildAssetSlot(item, { transparent: true });
    assert.ok(native.scene.includes('transparent background') && !native.scene.includes('grey background'));
    const asked = buildAssetSlot(item, { templates: { sprite: '{tags}, 2::transparent background::, {matte}' } });
    assert.ok(asked.scene.includes('2::transparent background::') && !/grey background|simple background|flat color background/.test(asked.scene));
    const viaPrefix = buildAssetSlot(item, { positiveContext: 'artist:foo, transparent background' });
    assert.ok(!viaPrefix.scene.includes('grey background'));
    assert.ok(buildItemSlot('key', { positiveContext: '1.5::transparent background::' }).scene.endsWith('key'));
    assert.ok(buildItemSlot('key').scene.includes('light grey background'));
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

test('gate:assets:templates-and-dictionary-fallback', async () => {
    const { DEFAULT_ASSET_TEMPLATES } = await import('../src/generated-images/illustration/prompt-kit.js');
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
    const previousSpriteDefaults = [
        '{tags}, solo, cowboy shot, standing, facing viewer, looking at viewer, straight-on, arms at sides, centered, {matte}',
        '{tags}, solo, cowboy shot, standing, facing viewer, looking at viewer, straight-on, centered, {matte}',
    ];
    const previousNegative = 'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, close-up, portrait, upper body, full body, feet, head out of frame, cropped arms, scenery, detailed background, white background, gradient background, patterned background, drop shadow, floor, furniture, holding weapon, text, speech bubble, watermark, signature, frame, border';
    for (const sprite of previousSpriteDefaults) {
        const input = { assets: { templates: { sprite, spriteNegative: previousNegative } } };
        const before = structuredClone(input);
        const migrated = normalizeAutoIllustrationSettings(input);
        assert.equal(migrated.assets.templates.sprite, DEFAULT_ASSET_TEMPLATES.sprite);
        assert.equal(migrated.assets.templates.spriteNegative, DEFAULT_ASSET_TEMPLATES.spriteNegative);
        assert.deepEqual(input, before);
        const customized = { sprite: sprite + ', user detail', spriteNegative: previousNegative + ', user exclusion' };
        const kept = normalizeAutoIllustrationSettings({ assets: { templates: customized } });
        assert.equal(kept.assets.templates.sprite, customized.sprite);
        assert.equal(kept.assets.templates.spriteNegative, customized.spriteNegative);
    }
    const fallback = normalizeAutoIllustrationSettings({ assets: { templates: { sprite: 'no placeholder', background: '' } } });
    assert.equal(fallback.assets.templates.sprite, DEFAULT_ASSET_TEMPLATES.sprite);
    assert.equal(fallback.assets.templates.background, DEFAULT_ASSET_TEMPLATES.background);
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

// 透明底上画一个人物：深色描线 + 近黑头发（上半）+ 浅色皮肤（下半），NAI V5 透明底立绘的简化版。
function makeTransparentSprite() {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 10; y < 30; y += 1) {
        for (let x = 10; x < 30; x += 1) {
            const edge = x === 10 || x === 29 || y === 10 || y === 29;
            const [r, g, b] = edge ? [8, 8, 10] : y < 18 ? [12, 10, 16] : [230, 200, 185];
            const i = (y * width + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        }
    }
    return { data, width, height };
}

// 最小假画布：像素按 dataUrl 记在表里，drawImage / getImageData / putImageData / toDataURL 只搬数据。
function createPixelCanvasGlobal() {
    const images = new Map();
    let serial = 0;
    const register = (pixels) => { const url = `data:image/png;base64,fake${serial += 1}`; images.set(url, pixels); return url; };
    class FakeImage {
        set src(url) {
            const pixels = images.get(url);
            this.width = this.naturalWidth = pixels.width;
            this.height = this.naturalHeight = pixels.height;
            this.pixels = pixels;
            setTimeout(() => this.onload(), 0);
        }
    }
    const createCanvas = () => {
        const canvas = { width: 0, height: 0, buffer: null };
        const ensure = () => { if (!canvas.buffer) canvas.buffer = new Uint8ClampedArray(canvas.width * canvas.height * 4); return canvas.buffer; };
        const ctx = {
            drawImage(src, sx = 0, sy = 0, sw, sh) {
                const from = src.pixels || { data: src.buffer, width: src.width, height: src.height };
                const w = sw || from.width;
                const h = sh || from.height;
                const to = ensure();
                for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) for (let k = 0; k < 4; k += 1) {
                    to[(y * canvas.width + x) * 4 + k] = from.data[((y + sy) * from.width + (x + sx)) * 4 + k];
                }
            },
            getImageData: () => ({ data: new Uint8ClampedArray(ensure()), width: canvas.width, height: canvas.height }),
            putImageData(imageData) { ensure().set(imageData.data); },
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        };
        canvas.getContext = () => ctx;
        canvas.toDataURL = () => register({ data: new Uint8ClampedArray(ensure()), width: canvas.width, height: canvas.height });
        return canvas;
    };
    return { global: { Image: FakeImage, document: { createElement: createCanvas } }, register, images };
}

test('gate:assets:matte-keeps-dark-lineart-of-already-transparent-sprite', async () => {
    // 不检测透明度直接洪泛：透明像素 RGB 为黑，近黑描线和头发被当成底色抠掉（这是修之前的表现）。
    const raw = makeTransparentSprite();
    matteSolidBackground(raw);
    let removed = 0;
    for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i] === 0) removed += 1;
    // 40×40 图里背景本来就有 1200 个透明像素，多出来的都是人物被抠掉的部分。
    assert.ok(removed - 1200 > 150, `flood matting eats into the character (${removed - 1200} px)`);

    const sprite = makeTransparentSprite();
    assert.equal(hasTransparentBorder(sprite), true);
    assert.equal(hasTransparentBorder(makeImage(20, 20, () => [200, 200, 200])), false, '纯色底不算透明');

    // 调用方以为是纯色底（智绘姬 / 柏宝绘）：检测到四边已透明，只裁边，人物 400 像素一个不少。
    const env = createPixelCanvasGlobal();
    const matte = createAlphaMatte(env.global);
    const result = await matte(env.register(sprite), { alreadyTransparent: false, detailed: true });
    assert.equal(result.diagnostics.detectedTransparent, true);
    assert.deepEqual(result.diagnostics.crop, { x: 10, y: 10, width: 20, height: 20 });
    const out = env.images.get(result.dataUrl);
    let opaque = 0;
    for (let i = 3; i < out.data.length; i += 4) if (out.data[i] === 255) opaque += 1;
    assert.equal(opaque, 400);

    // 真正的纯色底照旧抠图。
    const grey = makeImage(20, 20, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 20 ? [30, 30, 30] : [200, 200, 200]));
    const greyResult = await matte(env.register(grey), { detailed: true });
    assert.equal(greyResult.diagnostics.detectedTransparent, false);
    assert.deepEqual(greyResult.diagnostics.crop, { x: 5, y: 5, width: 10, height: 15 });
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

// 这些楼层正文都只有十来个字，专测补素材流程的用例传 minBodyChars: 0；「少于 50 字不自动生图」单独测。
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
        minBodyChars: 0,
    });
    const result = await service.processMessage(3);
    assert.deepEqual([result.ok, result.count], [true, 2]);
    assert.deepEqual(naiCalls.map((c) => c.size), ['1216x832', '832x1216']);
    assert.ok(naiCalls[1].slot.scene.includes('white background'));
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

test('gate:assets:review-library-status-invalidates-cached-page-and-hides-card', async () => {
    const store = createMemoryGeneratedAssetStore();
    const record = { key: 'review-1', chatId: 'chat-1', floorKey: 'chat-1|3|0', type: 'sprite', name: '旧名', imageId: 'img-1', status: 'review' };
    await store.putAsset(record);
    const service = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT), store, getSettings: () => ({}),
        llm: {}, nai: {},
    });
    try {
        await service.readRecord(record.key);
        assert.equal(service.listReview(record.floorKey).length, 1);
        const result = await service.setStatus(record.key, 'library');
        assert.equal(result.ok, true);
        assert.equal(service.listReview(record.floorKey).length, 0);
        assert.equal((await store.getAsset(record.key)).status, 'library');
        const page = await store.queryAssets({ chatId: record.chatId, floorKey: record.floorKey, statuses: ['review'] });
        assert.equal(page.records.length, 0);
    } finally { service.destroy?.(); }
});
test('gate:assets:lost-outfit-slots-fall-back-within-the-selected-outfit', () => {
    const isMissingImage = (url) => url === 'igs-gen:lost';
    const sceneAssets = {
        characters: { 雪乃: { 愤怒: 'igs-gen:lost', 默认: 'igs-gen:base' } },
        characterOutfits: { 雪乃: { 校服: { words: [], moods: { 喜悦: 'igs-gen:lost', 平和: 'igs-gen:calm' } } } },
        characterDefaultOutfits: { 雪乃: { version: 1, outfitName: '校服' } },
    };
    const ctx = { sceneAssets, isMissingImage };
    // 默认映射与显式选择都在同一套命名衣装内回退，不借旧原装图槽。
    const original = resolveSpriteAsset('雪乃', '愤怒', ctx);
    assert.equal(original.url, 'igs-gen:calm');
    assert.equal(original.slot, '平和');
    assert.equal(original.needsGeneration, false);
    const outfit = resolveSpriteAsset('雪乃', '喜悦', ctx, '校服');
    assert.equal(outfit.url, 'igs-gen:calm');
    assert.equal(outfit.slot, '平和');
    const gone = resolveSpriteAsset('雪乃', '愤怒', { sceneAssets: { ...sceneAssets,
        characterOutfits: { 雪乃: { 校服: { moods: { 愤怒: 'igs-gen:lost' } } } } }, isMissingImage });
    assert.equal(gone.url, '');
    assert.equal(gone.reason, 'outfit-image-missing');
});



test('gate:assets:service-disabled-makes-no-requests', async t => {
    let requested = false;
    const service = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT),
        llm: { async request() { requested = true; return ''; } },
        nai: { async generate() { requested = true; return { ok: false }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: USER_ASSETS }),
    });
    t.after(() => service.stop());
    assert.equal((await service.processMessage(3)).reason, 'disabled');
    assert.equal(requested, false);
    const off = createAssetGenerationService({
        messageHost: fakeHost(FLOOR_TEXT),
        llm: { async request() { requested = true; return ''; } },
        nai: { async generate() { requested = true; return { ok: false }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true } }, sceneAssets: { ...USER_ASSETS, enabled: false } }),
    });
    t.after(() => off.stop());
    assert.equal((await off.processMessage(3)).reason, 'scene-assets-disabled');
    assert.equal((await off.processMessage(3, { manual: true })).reason, 'scene-assets-disabled');
    assert.equal(requested, false);
});

test('gate:assets:skips-auto-when-body-under-50-chars', async () => {
    let requests = 0;
    let text = `<thinking>${'她在想接下来的剧情该怎么推进。'.repeat(6)}</thinking>\n${FLOOR_TEXT}`;
    const reports = [];
    const service = createAssetGenerationService({
        messageHost: { ...fakeHost(''), readFloor: () => ({ chatId: 'chat-1', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text }) },
        llm: { async request() { requests += 1; return 'id: bg1\ntags: factory, night, rain\nid: ch2\ntags: 1girl, silver hair, black coat'; } },
        nai: { async generate() { requests += 1; return { ok: true, dataUrl: 'data:image/png;base64,AAA' }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true, backgroundEnabled: true, strictMatch: true } }, sceneAssets: USER_ASSETS }),
        report: (level, message) => reports.push(message),
    });
    assert.equal((await service.processMessage(3)).reason, 'body-too-short');
    assert.match(reports.join('\n'), /第 3 楼跳过素材补全：正文只有 12 字，少于 50 字不自动生图/);
    assert.equal(requests, 0, '思考写得再长也不算正文');
    text = `${FLOOR_TEXT}\n${'雨点打在铁皮屋顶上，像无数细小的鼓槌，一下一下敲着她的耐心。'.repeat(2)}`;
    const result = await service.processMessage(3);
    assert.deepEqual([result.reason, result.count], ['done', 2], '跳过不记成已处理，写长后照常补素材');
});

test('gate:assets:service-falls-back-to-dictionary-for-backgrounds', async () => {
    const naiCalls = [];
    const service = createAssetGenerationService({
        messageHost: fakeHost('[igs-scene:学校教室|黄昏|晴]\n放学后。'),
        llm: { async request() { return '抱歉，我无法完成这个请求。'; } },
        nai: { async generate(slot) { naiCalls.push(slot); return { ok: true, dataUrl: 'data:image/png;base64,B' }; } },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true, strictMatch: true } }, sceneAssets: { enabled: true, scenes: {} } }),
        minBodyChars: 0,
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
        minBodyChars: 0,
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
for (const fail of [false, true]) {
    test(`gate:assets:inflight-floor-updates-${fail ? 'failure' : 'success'}`, async () => {
        let text = '[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。\n[igs-char:甲|平静|你好。]\n[igs-char:乙|平静|你好。]', calls = 0, release, entered;
        const started = new Promise(resolve => { entered = resolve; });
        const host = fakeHost('');
        host.readFloor = () => ({ chatId: 'chat-1', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text });
        const store = createMemoryGeneratedAssetStore();
        const assets = structuredClone(USER_ASSETS);
        const before = structuredClone(assets);
        const service = createAssetGenerationService({ messageHost: host, store,
            llm: { async request() { return 'id: bg1\ntags: landscape, night\nid: ch2\ntags: woman\nid: ch3\ntags: man'; } },
            nai: { async generate() {
                calls++;
                if (calls === 1) { entered(); await new Promise(resolve => { release = resolve; }); }
                return fail ? { ok: false, error: 'fixture-failed' } : { ok: true, dataUrl: 'data:image/png;base64,AAA' };
            } },
            matte: async url => url,
            getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true, spriteEnabled: true, strictMatch: true } }, sceneAssets: assets }),
            minBodyChars: 0,
        });
        const first = service.processMessage(3);
        await started;
        text += '\n[igs-scene:地下实验室|夜晚|晴]\n灯亮了。';
        const second = service.processMessage(3), duplicate = service.processMessage(3);
        release();
        const results = await Promise.all([first, second, duplicate]);
        assert.equal(calls, fail ? 3 : 4, '首轮两角色一背景，成功后只补新增场景；失败不在原任务内重发');
        assert.ok(results.every(result => result.ok === !fail));
        assert.equal((await store.getFloor('chat-1|3|0')).status, fail ? 'failed' : 'done');
        assert.deepEqual(assets, before, '未采用素材不能写入衣装、DNA 或默认映射');
        if (!fail) {
            assert.equal((await service.processMessage(3)).reason, 'already-decided');
            assert.equal(calls, 4);
            const review = service.listReview('chat-1|3|0');
            assert.deepEqual(review.map(record => `${record.type}:${record.name}`).sort(),
                ['background:地下实验室', 'background:废弃工厂', 'sprite:乙', 'sprite:甲'].sort());
            assert.equal(resolveSpriteAsset('甲', '', { sceneAssets: assets, tempSprite: service.tempSprite }).url, '');
        }
    });
}

test('gate:assets:pending-sprites-deduplicate-without-adoption-and-retry-only-confirmed-loss', async () => {
    const cases = [
        { status: 'review', expected: false }, { status: 'chat', expected: false },
        { status: 'library', expected: true }, { status: 'discarded', expected: true },
        { status: 'failed', expected: true }, { status: 'review', imageId: '', expected: true },
        { status: 'review', chatId: 'other-chat', expected: true },
        { status: 'review', missing: true, expected: true },
        { status: 'review', readError: true, expected: false },
    ];
    for (const fixture of cases) {
        const store = createMemoryGeneratedAssetStore();
        const chatId = fixture.chatId || 'chat-1', imageId = fixture.imageId ?? 'held';
        const candidate = { key: `${chatId}|char|甲`, chatId, floorKey: `${chatId}|3|0`,
            type: 'sprite', name: '甲', status: fixture.status, imageId };
        await store.putAsset(candidate);
        if (!fixture.missing) await store.putImage({ id: 'held', dataUrl: 'data:image/png;base64,KEEP' });
        const getImage = store.getImage;
        if (fixture.readError) store.getImage = async () => { throw new Error('private-store-detail'); };
        const assets = { enabled: true, scenes: {}, characters: {} }, before = structuredClone(assets);
        let writes = 0, paints = 0;
        const reports = [];
        const service = createAssetGenerationService({
            messageHost: fakeHost('[igs-char:甲|平静|你好。]'), store,
            llm: { async request() { writes++; return 'id: ch1\ntags: adult woman'; } },
            nai: { async generate() { paints++; return { ok: true, dataUrl: 'data:image/png;base64,NEW' }; } },
            matte: async url => url, newId: () => 'new-image', minBodyChars: 0,
            getSettings: () => ({ autoIllustration: { assets: { spriteEnabled: true } }, sceneAssets: assets }),
            report: (_level, message) => reports.push(message),
        });
        const result = await service.processMessage(3, { manual: true });
        assert.equal(paints, Number(fixture.expected), JSON.stringify(fixture));
        assert.equal(writes, paints);
        assert.deepEqual(assets, before, '去重与补生均不采用候选或设默认衣装');
        assert.equal(resolveSpriteAsset('甲', '', { sceneAssets: assets, tempSprite: service.tempSprite }).url, '');
        if (fixture.readError) {
            assert.deepEqual([result.ok, result.reason, result.stopGeneration], [false, 'asset-image-read-failed', true]);
            assert.equal((await store.getFloor('chat-1|3|0')).status, 'failed');
            assert.doesNotMatch(JSON.stringify({ result, reports }), /private-store-detail|找不到了/);
        } else assert.equal(result.ok, true, result.error);
        if (!fixture.expected) assert.deepEqual((await store.getAssetsByChat(chatId))[0], candidate);
        store.getImage = getImage;
    }
});



test('gate:assets:registered-generated-image-lost-is-regenerated', async () => {
    let calls = 0;
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 'kept', dataUrl: 'data:image/png;base64,KEEP' });
    const assets = { ...USER_ASSETS, scenes: { ...USER_ASSETS.scenes, 废弃工厂: { url: 'igs-gen:gone', times: {} }, 旧仓库: { url: 'igs-gen:kept', times: { 夜晚: 'igs-gen:kept' } } } };
    const make = (text) => createAssetGenerationService({
        messageHost: fakeHost(text),
        llm: { async request() { return 'id: bg1\ntags: factory, night'; } },
        nai: { async generate() { calls += 1; return { ok: true, dataUrl: 'data:image/png;base64,AAA' }; } },
        store,
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true } }, sceneAssets: assets }),
        minBodyChars: 0,
    });
    assert.equal((await make('[igs-scene:旧仓库|夜晚|雨]\n雨声很大。').processMessage(3, { manual: true })).reason, 'nothing-missing');
    const result = await make('[igs-scene:废弃工厂|夜晚|雨]\n雨声很大。').processMessage(3, { manual: true });
    assert.deepEqual([result.reason, result.count, calls], ['done', 1, 1]);
    assert.equal(resolveBackgroundAsset({ scene: '废弃工厂' }, { sceneAssets: assets }).needsGeneration, false);
});

test('gate:assets:empty-registered-scenes-need-images-without-auto-generating-registered-characters', async () => {
    const { collectAssetNeeds } = await import('../src/scene/asset-match.js');
    const ctx = {
        sceneAssets: { scenes: { 学校天台: { url: '', times: {} } }, characters: { 雪之下雪乃: {} }, characterAliases: {} },
        userName: '我',
    };
    const needs = collectAssetNeeds({
        scenes: [{ scene: '天台', time: '夜晚' }, { scene: '废弃工厂', time: '' }],
        characters: ['雪乃', '八幡', '比企谷八幡', '路人少女'],
    }, ctx, { background: true, sprite: true });
    assert.deepEqual(needs.map((n) => n.name), ['天台', '废弃工厂', '八幡', '比企谷八幡', '路人少女']);
});

test('gate:assets:nai-500-does-not-resend-unknown-request-or-echo-server-payload', async () => {
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
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
    assert.equal(result.reason, 'nai-http-failed');
    assert.match(result.error, /HTTP 500.*发送状态未知.*未自动补发/);
    assert.doesNotMatch(result.error, /Internal server error/);
});

test('gate:assets:nai-response-decode-safe-failure-and-no-resend', async () => {
    const { createNaiOfficialClient } = await import('../src/generated-images/nai-official-client.js');
    const png = pngFixture(1, 1);
    for (const [body, reason] of [
        [imageZipFixture(png.bytes, { method: 8, descriptor: true, compressed: deflateRawSync(png.bytes) }), null],
        [imageZipFixture(png.bytes, { method: 99 }), 'image-zip-method-unsupported'],
        [Buffer.from('secret upstream response'), 'image-response-unrecognized'],
    ]) {
        let calls = 0;
        const client = createNaiOfficialClient({ fetch: async () => {
            calls++;
            return new Response(body, { headers: { 'content-type': reason === 'image-response-unrecognized'
                ? 'application/octet-stream' : 'text/plain' } });
        } });
        const result = await client.generate({ scene: 'fixture scene' }, { apiKey: 'fixture-key' });
        assert.equal(calls, 1);
        if (!reason) assert.equal(result.dataUrl, png.dataUrl);
        else {
            assert.equal(result.reason, reason);
            assert.match(result.error, /解析失败.*未自动补发/);
            assert.doesNotMatch(JSON.stringify(result), /secret|fixture-key/);
        }
    }
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
    const llm = createSecondaryLlm(fakeLlmHost(), { fetch: async () => ({
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
    assert.equal(calls[1][1].replaceCharacterKeywords, false, '无人 caption 不依赖人物库或角色关键字替换');
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
    assert.match(result.error, /数据库生图插件写提示词失败/);
    assert.doesNotMatch(result.error, /召回失败|请检查预设/, '不回显不可信上游正文');
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
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
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

    assert.ok(metas[0].userPrompts.positive.includes('no humans'));
    assert.ok(metas[0].userPrompts.negative.includes('1girl'));
    assert.equal(metas[0].skipRecall, true);
});

test('gate:assets:later-backgrounds-skip-recall-and-already-generated', async () => {
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
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
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 'old', dataUrl: 'data:image/png;base64,OLD' });
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
        store,
        getSettings: () => ({
            autoIllustration: { assets: { backgroundEnabled: true, maxPerFloor: 1, dayFirst: false } },
            sceneAssets: { enabled: true, scenes: {}, characters: {}, generated: library },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.deepEqual([result.ok, result.count, writes.length, paints.length], [true, 2, 1, 2]);

    assert.equal(paints[0].userPrompts.positive.includes('no humans'), true);
});

test('gate:assets:dbgen-sprite-passes-frontend-templates', async () => {
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
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
            writeDbgenPrompt: async (meta) => { writes.push(meta); return characterWriteFixture(meta); },
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
            imageApi: { naiSpriteTransparent: false },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.deepEqual([result.ok, result.count, writes.length, paints.length], [true, 1, 1, 1]);
    assert.equal(writes[0].writingRequirements.transparent, true);
    assert.deepEqual(writes[0].promptTask.slots, [{ slotId: 1, tokens: ['r0'] }]);
    const meta = paints[0];
    assert.equal(meta.userPrompts, undefined, '发送层不再追加写词约束');
    assert.ok(writes[0].userPrompts.positive.startsWith('upper body, red ribbon'));
    assert.ok(writes[0].userPrompts.positive.includes('transparent background'));
    assert.equal(meta.transparent, true);
    assert.ok(writes[0].userPrompts.negative.startsWith('cowboy shot, hat'));
    const saved = await service.getImagePrompt(service.listTemp()[0].imageId);
    assert.deepEqual(saved, { positive: '1girl, solo', negative: 'lowres', revision: 1 });
});

test('gate:assets:dbgen-sprite-white-background-when-transparent-off', async () => {
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
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
            writeDbgenPrompt: async (meta) => { writes.push(meta); return characterWriteFixture(meta); },
            generateDbgenCaption: async (meta) => {
                paints.push(meta);
                return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: '1girl, solo', negative: 'lowres' } };
            },
            generate: async () => { throw new Error('立绘不应逐张写词'); },
        },
        store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({
            autoIllustration: { assets: { spriteEnabled: true } },
            sceneAssets: { enabled: true, scenes: {}, characters: {} },
            imageApi: { dbgenSpriteTransparent: false, naiSpriteTransparent: true },
        }),
    });
    const result = await service.processMessage(3, { manual: true });
    assert.equal(result.ok, true);
    assert.equal(writes[0].writingRequirements.transparent, false);
    assert.match(writes[0].userPrompts.positive, /white background/);
    const meta = paints[0];
    assert.equal(meta.transparent, undefined);
    assert.equal(meta.userPrompts, undefined);
    assert.equal(/transparent background/.test(writes[0].userPrompts.positive), false);
    assert.equal(/grey background/.test(writes[0].userPrompts.positive), false);
    assert.equal(/(^|, )white background(,|$)/.test(writes[0].userPrompts.negative), false);
});

test('gate:assets:dbgen-sprites-write-once-then-paint-and-split-past-eight', async () => {
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
    const { createMemoryGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const names = ['甲', '乙', '丙'];
    const outfits = ['蓝外套', '白裙', '红衬衣'];
    const floor = {
        chatId: 'c', messageId: 3, swipeId: 0, isAi: true, isLatest: true,
        text: names.map((name, index) => `[igs-char:${name}|平静|${outfits[index]}|你好。]`).join('\n')
            + '\n[igs-char:甲|平静|晚礼服|再见。]',
    };
    const order = [];
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c', readFloor: () => floor, readPreviousAiTexts: () => [] },
        llm: { async request() { throw new Error('不应请求副 LLM'); } },
        nai: {
            describe: () => ({ mode: 'dbgen', via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
            writeDbgenPrompt: async (meta) => {
                order.push(`write:${meta.promptTask.slots.length}`);

                assert.equal(meta.writingRequirements.transparent, true);
                const output = characterWriteFixture(meta);
                for (const entry of output.captions) {
                    entry.characterMeta.characters[0].outfit.name = 'Model renamed';
                }
                output.captions.reverse();
                return output;
            },
            generateDbgenCaption: async (meta) => {
                order.push(`paint:${meta.characterMeta.characters[0].characterKey}`);
                const index = names.indexOf(meta.characterMeta.characters[0].characterKey);
                assert.equal(meta.characterMeta.characters[0].outfit.name, outfits[index]);
                const prepared = prepareCharacterCaption(meta);
                assert.equal(prepared.ok, true, prepared.reason);
                assert.equal(prepared.outfitSnapshot.characters[0].name, outfits[index]);
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
                const count = meta.promptTask.slots.length;
                splitOrder.push(`write:${count}`);
                assert.equal(meta.promptTask.characters.length, count);
                return characterWriteFixture(meta);
            },
            generateDbgenCaption: async (meta) => {
                splitOrder.push(`paint:${meta.characterMeta.characters[0].characterKey}`);
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
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
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
    const service = createAssetGenerationService({ messageHost: fakeHost(FLOOR_TEXT), llm, nai, store, matte, getSettings, newId: () => `img${++id}`, minBodyChars: 0 });
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
        newId: () => `q${++id2}`, report: (level, message) => reports.push({ level, message }), minBodyChars: 0,
    });
    assert.equal((await quotaService.processMessage(3)).ok, true);
    const degraded = await inner.getImage('q2');
    assert.equal(degraded.dataUrl, 'data:image/png;base64,ORIG#cut');
    assert.equal(Object.prototype.hasOwnProperty.call(degraded, 'originalDataUrl'), false);
    const assets = await inner.getAssetsByChat('chat-1');
    const spriteAsset = assets.find((a) => a.type === 'sprite');
    assert.equal(spriteAsset.status, 'review');
    assert.ok(Number.isInteger(degraded.seed));
    assert.equal(degraded.seed, spriteAsset.seed);
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
            characterOutfits: { 冬月: { 常服: { moods: { 平和: 'igs-gen:def', 喜悦: 'igs-gen:joy' } } } },
            characterDefaultOutfits: { 冬月: { version: 1, outfitName: '常服' } },
            characterAliases: { 冬月: [] },
            moodGroups: [{ label: '喜悦', words: ['开心'] }],
        },
    });
    assert.equal(hit.url, 'igs-gen:joy');
    assert.equal(hit.source, 'user-default-outfit');
});

test('gate:assets:expression-set-writes-once-then-paints-eight-in-order', async () => {
    const { DEFAULT_MOOD_GROUPS, moodTierLabels } = await import('../src/scene/mood-groups.js');
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
            assert.equal(meta.caption, undefined);
            return {
                ok: true,
                caption: captionOf('fuyuko, silver hair, white dress, expr 喜悦'),
                captions: labels.map((label, index) => ({ slotId: index + 1, caption: captionOf(`fuyuko, silver hair, white dress, expr ${label}`) })).reverse(),
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
    assert.equal(painted.length, labels.length);
    assert.equal(new Set(seeds).size, 1, 'one seed for the whole set');
    assert.ok(Number.isInteger(seeds[0]) && seeds[0] >= 0);
    const angryIndex = labels.indexOf('愤怒');
    assert.ok(angryIndex >= 0);
    assert.equal(result.items.length, 8);
    assert.equal(result.items[0].ok, true);
    assert.equal(result.items[0].imageId, 'expr-1');
    assert.equal(result.items[angryIndex].ok, false);
    assert.equal(result.items[angryIndex].mood, '愤怒');
    assert.equal(progress[0].phase, 'write');
    assert.equal(progress[0].done, 0);
    assert.equal(progress[0].total, 8);
    assert.deepEqual(progress.filter((event) => event.phase === 'paint').map((event) => event.mood), labels);
    assert.equal(progress[1].done, 1);
    const retryProgress = [];
    const retry = await service.generateExpressionImage({
        name: '冬月', mood: '愤怒', caption: result.items[angryIndex].caption,
        onProgress: (event) => retryProgress.push(event),
    });
    assert.deepEqual(retryProgress, [{ phase: 'paint', done: 1, total: 1, mood: '愤怒' }]);
    assert.equal(promptCalls, 1, '失败重画只出这一张，不再写提示词');
    assert.equal(retry.items[0].ok, true);
    assert.equal(retry.items[0].imageId, 'expr-8');

    const hit = resolveSpriteAsset('冬月', '开心', {
        sceneAssets: {
            characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } },
            characterOutfits: { 冬月: { 常服: { moods: { 平和: 'igs-gen:def', 喜悦: 'igs-gen:joy' } } } },
            characterDefaultOutfits: { 冬月: { version: 1, outfitName: '常服' } },
            characterAliases: {},
            moodGroups,
        },
    });
    assert.equal(hit.url, 'igs-gen:joy');
    assert.equal(hit.slot, '喜悦');
    assert.equal(hit.source, 'user-default-outfit');

    const uiAssets = {
        characters: { 冬月: { 默认: 'legacy.png' } },
        characterOutfits: { 冬月: { 常服: { moods: { 平和: 'igs-gen:def', 喜悦: 'igs-gen:joy', 愤怒: '' } } } },
        characterDefaultOutfits: { 冬月: { version: 1, outfitName: '常服' } },
    };
    const html = renderCharacterAssetList(uiAssets.characters, {
        characterOutfits: uiAssets.characterOutfits, sceneAssets: uiAssets,
        expressionNotes: { '冬月\u0001常服': { 愤怒: { positive: 'angry face', negative: 'lowres', error: '上游拒绝' } } },
        isOpen: (key) => key === 'char-open:冬月',
    });
    const outfitAction = `%E5%86%AC%E6%9C%88:${encodeURIComponent('常服')}`;
    assert.ok(html.includes(`data-action="outfit-expression-set:${outfitAction}"`));
    assert.ok(html.includes(`data-action="outfit-expression-prompt:${outfitAction}:%E5%96%9C%E6%82%A6"`));
    assert.ok(html.includes(`data-action="outfit-expression-retry:${outfitAction}:%E5%96%9C%E6%82%A6"`));
    assert.ok(html.includes('outfit-expression-retry:'));
    assert.ok(html.includes('重新生成'));
    const changed = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '泳装', words: ['泳衣'], ownImage: false });
    assert.match(changed, /服装「泳装」/);
    assert.match(changed, /泳衣/);
    assert.match(changed, /不要沿用原装的衣服/);
    const written = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '泳装', words: ['泳衣'], ownImage: false, prompt: 'school swimsuit, one-piece' });
    assert.match(written, /服装提示词：\nschool swimsuit, one-piece/);
    assert.match(written, /不要沿用原装的衣服/);
    assert.equal(written.includes('不要回避'), false);
    const spicy = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '泳装', words: ['泳衣'], ownImage: false, prompt: 'school swimsuit, one-piece', nsfwBoost: true });
    assert.match(spicy, /这套是色情服装/);
    assert.match(spicy, /不要回避/);
    assert.match(spicy, /不要改成普通/);
    assert.equal(written.includes('衣服按这些词来画'), false);
    const nude = buildExpressionDiffDescription('冬月', { positive: '1girl' }, ['喜悦'], null, { name: '裸体', words: ['全裸'], ownImage: false, prompt: 'completely nude', nude: true });
    assert.match(nude, /这一套是裸体/);
    assert.match(nude, /不要画任何衣服/);
    assert.equal(nude.includes('服装提示词：'), false);
    assert.equal(nude.includes('completely nude'), false);
    assert.equal(nude.includes('全裸'), false);
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
    assert.ok(pane.includes('存为立绘'));
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
    assert.match(leaned.v4_prompt.caption.char_captions[0].char_caption, /leaning/);
    assert.equal(leaned.v4_prompt.caption.base_caption, '1girl');
    assert.match(leaned.v4_negative_prompt.caption.char_captions[0].char_caption, /dutch angle, from side, profile/);
    assert.equal(leaned.v4_negative_prompt.caption.char_captions[0].char_caption.includes('head tilt'), false);
});

test('gate:assets:expression-set-splits-writes-by-nine', async () => {
    const { splitWriteBatches, splitExpressionWriteBatches } = await import('../src/generated-images/dbgen-prompt.js');
    const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const eighteen = Array.from({ length: 18 }, (_, index) => `m${index + 1}`);
    const nineteen = eighteen.concat('m19');
    // 楼内补立绘仍按 8 份拆成两批。表情差分：9 及以内一批，超过 9 平分 2 批，超过 18 平分 3 批。
    assert.deepEqual(splitWriteBatches(ten), [ten.slice(0, 5), ten.slice(5)]);
    assert.deepEqual(splitExpressionWriteBatches(ten.slice(0, 9)), [ten.slice(0, 9)]);
    assert.deepEqual(splitExpressionWriteBatches(ten), [ten.slice(0, 5), ten.slice(5)]);
    assert.deepEqual(splitExpressionWriteBatches(eighteen), [eighteen.slice(0, 9), eighteen.slice(9)]);
    assert.deepEqual(splitExpressionWriteBatches(nineteen), [nineteen.slice(0, 7), nineteen.slice(7, 13), nineteen.slice(13)]);

    const captionOf = (text) => ({
        v4_prompt: { caption: { base_caption: text, char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    });
    const order = [];
    const nai = {
        writeDbgenPrompt: async ({ description }) => {
            const listed = String(description || '').match(/另写 (\d+) 份：([^。]+)/);
            const names = listed ? listed[2].split('、').map((part) => part.replace(/^\d+\s*/, '')) : [];
            order.push(`write:${names.length}`);
            return { ok: true, captions: names.map((mood, index) => ({ slotId: index + 1, caption: captionOf(`expr ${mood}`) })) };
        },
        generateDbgenCaption: async ({ caption }) => {
            const text = caption.v4_prompt.caption.base_caption;
            const mood = text.match(/expr ([a-j])/)?.[1] || text;
            order.push(`paint:${mood}`);
            return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: text, negative: '' } };
        },
    };
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
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
    assert.deepEqual(order, [
        'write:5',
        ...ten.slice(0, 5).map((mood) => `paint:${mood}`),
        'write:5',
        ...ten.slice(5).map((mood) => `paint:${mood}`),
    ]);
});

test('gate:assets:wardrobe-prompt-writes-once-and-does-not-paint', async () => {
    let paints = 0;
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async () => {
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
    const spicy = await service.writeWardrobePrompt({ character: '', outfit: '情趣内衣', nsfwBoost: true });
    assert.equal(spicy.ok, true);
});

test('gate:assets:wardrobe-reference-paints-the-saved-prompt', async () => {
    let writes = 0;
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async () => { writes += 1; return { ok: false, error: '不该写词' }; },
        generateDbgenCaption: async (meta) => {
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
    const spicyPaint = await service.paintWardrobeReference({ prompt: 'yukata, floral pattern', nsfwBoost: true });
    assert.equal(spicyPaint.ok, true);
    assert.equal(writes, 0);
    assert.equal(await service.resolveUrl('igs-gen:ref-1'), 'data:image/png;base64,QQ==');
});

test('gate:assets:character-sprite-writes-from-dna-then-paints-default', async () => {
    const { renderCharacterAssetList, renderDnaOnlyCharacterList } = await import('../src/visual/igs-ui/settings-fields.js');

    const caption = {
        v4_prompt: { caption: { base_caption: '1girl, silver hair', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const order = [];
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async () => {
            order.push('write');
            return { ok: true, caption };
        },
        generateDbgenCaption: async (meta) => {
            order.push('paint');
            assert.equal(meta.transparent, true);
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
    const result = await service.generateCharacterSprite({ name: '冬月', dna: { identity: '银发' }, note: '站姿放松' });
    assert.deepEqual([result.ok, result.imageId], [true, 'sprite-1']);
    assert.deepEqual(order, ['write', 'paint']);

    const html = renderCharacterAssetList({ 冬月: { 默认: '' } }, { isOpen: () => true });
    assert.ok(html.includes('data-action="char-generate-sprite:%E5%86%AC%E6%9C%88"'));
    assert.ok(html.includes('生成立绘'));
    const dnaOnly = renderDnaOnlyCharacterList({ 路人甲: { identity: '' } }, {});
    assert.ok(dnaOnly.includes('data-action="char-generate-sprite:%E8%B7%AF%E4%BA%BA%E7%94%B2"'));
});

test('gate:assets:character-sprite-honors-nai-and-extension-image-source', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [{ char_caption: 'silver hair', centers: [{ x: 0.5, y: 0.5 }] }] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    for (const mode of ['nai', 'extension']) {
        const calls = [];
        const store = createMemoryGeneratedAssetStore();
        const service = createAssetGenerationService({
            messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
            llm: {}, store, matte: async (url, options) => { calls.push(['matte', options.alreadyTransparent]); return url; },
            nai: {
                describe: () => ({ mode, via: mode === 'extension' ? 'chatu8' : 'nai', ready: { ok: true } }),
                writeDbgenPrompt: async (meta) => {
                    calls.push(['write', meta.description]);
                    return mode === 'nai' ? characterWriteFixture(meta) : { ok: true, caption };
                },
                generate: () => { throw new Error('立绘必须先写提示词，不能拿现成词直接出图'); },
                generateDbgenCaption: async (meta) => {
                    if (meta.promptRecipe) {
                        const prepared = prepareCharacterCaption(meta);
                        assert.equal(prepared.ok, true, prepared.error);
                        meta = { ...meta, ...prepared };
                    }
                    calls.push(['paint', meta.caption]);
                    return { ok: true, dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: 'sprite', negative: '' } };
                },
            },
            getSettings: () => ({ imageApi: { mode }, autoIllustration: {}, sceneAssets: {} }),
            newId: () => `sprite-${mode}`,
        });
        const result = await service.generateCharacterSprite({ name: '冬月', dna: { identity: 'silver hair' }, note: '穿白裙' });
        assert.equal(result.ok, true);
        assert.equal(calls[0][0], 'write');
        assert.equal(calls[1][0], 'paint');
        assert.match(calls[1][1].v4_prompt.caption.char_captions[0].char_caption, /silver hair/);
        assert.equal(calls[2][0], 'matte');
        assert.equal((await store.getImage(result.imageId)).dataUrl, 'data:image/png;base64,QQ==');
    }
});


test('gate:assets:default-sprite-extension-failure-falls-back-through-image-backend', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const calls = [];
    const bridge = { imageApi: { mode: 'extension' }, autoIllustration: { nai: { apiKey: 'test-key' }, retry: { enabled: false } } };
    const image = 'data:image/png;base64,QQ==';
    const backend = createImageBackend({
        global: {}, getBridge: () => bridge,
        llm: { request: async ({ user }) => {
            calls.push(['llm', user]);
            return '#1\nscene: 1girl, cowboy shot\nchar: silver hair\nuc: lowres';
        } },
        nai: { generate: async (slot, config) => {
            calls.push(['nai', slot, config.apiKey]);
            return { ok: true, dataUrl: image };
        } },
        chatu8: { findHost: () => ({ win: {} }), request: async () => {
            calls.push(['chatu8']);
            return { ok: false, error: '绘图失败' };
        } },
    });
    const store = createMemoryGeneratedAssetStore();
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat' }, llm: {}, nai: backend, store,
        getSettings: () => ({ autoIllustration: bridge.autoIllustration, sceneAssets: {} }),
        matte: async (url, options) => { calls.push(['matte', options.alreadyTransparent]); return url; },
        newId: () => 'fallback-sprite',
    });
    const result = await service.generateCharacterSprite({ name: '冬月', dna: { identity: 'silver hair' } });
    assert.deepEqual([result.ok, result.imageId], [true, 'fallback-sprite']);
    assert.deepEqual(calls.map(([name]) => name), ['llm', 'chatu8', 'nai', 'matte']);
    assert.equal(calls[2][2], 'test-key');
    assert.match([calls[2][1].scene, ...(calls[2][1].chars || []).map((item) => item.tags)].join(', '), /silver hair/);
    assert.equal(calls[3][1], false, '智绘姬失败后的 NAI 图片按非透明底抠图');
    assert.equal((await store.getImage(result.imageId)).dataUrl, image);
});

test('gate:asset-upload:stored-records-hydrate-in-a-new-service-and-report-failure', async () => {
    const image = 'data:image/png;base64,QQ==';
    const store = createMemoryGeneratedAssetStore();
    let next = 0;
    const makeService = (assetStore = store) => createAssetGenerationService({
        messageHost: { getChatId: () => 'chat' }, llm: {}, nai: {}, store: assetStore,
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => `manual-${++next}`,
    });
    const first = makeService();
    for (const type of ['sprite', 'background']) {
        const imported = await first.importAssetImage(image, type);
        assert.equal(imported.ok, true);
        const record = await store.getImage(imported.imageId);
        assert.equal(record.type, type);
        assert.equal(record.dataUrl, image);
        assert.equal(await first.getImageDataUrl(imported.imageId), image);
        if (type === 'sprite') {
            assert.equal(record.originalDataUrl, image);
            assert.equal((await first.readStoredImage(imported.imageId)).revision, 1);
        }
        const reopened = makeService();
        const ref = `igs-gen:${imported.imageId}`;
        assert.equal(reopened.resolveUrl(ref), '', '新实例初次读取等待存储异步恢复');
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(reopened.resolveUrl(ref), image);
    }
    for (const bad of ['data:text/html;base64,QQ==', 'data:image/svg+xml;base64,QQ==', 'data:image/png;base64,???']) {
        assert.equal((await first.importAssetImage(bad, 'sprite')).ok, false);
    }
    assert.equal((await first.importAssetImage(image, 'other')).ok, false);
    const brokenStore = { ...store, async putImage() { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); } };
    const failed = await makeService(brokenStore).importAssetImage(image, 'background');
    assert.equal(failed.ok, false);
    assert.match(failed.error, /空间不足/);
    assert.equal(await store.getImage('manual-3'), null);
    const deletionsFail = makeService({ ...store, async deleteImage() { throw new Error('blocked'); } });
    assert.equal((await deletionsFail.deleteImages(['manual-1'])).reason, 'image-delete-failed');
    assert.equal((await store.getImage('manual-1')).dataUrl, image);
});


test('gate:assets:expression-mood-tags-beat-copied-neutral-face-and-dna-pose', async () => {
    const { applyMoodToCaption } = await import('../src/generated-images/dbgen-prompt.js');
    const { composeSpriteCaption } = await import('../src/generated-images/sprite-prompt-composition.js');
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
    const merged = composeSpriteCaption(applyMoodToCaption(caption, '喜悦'), dna);
    const positive = merged.v4_prompt.caption.base_caption;
    assert.equal(positive, 'smile, happy, black hair, red eyes, red hoodie');
    assert.doesNotMatch(positive, /expressionless|light smile|closed mouth|arms at sides|hands on hips/);
    assert.equal(merged.v4_negative_prompt.caption.base_caption.includes('smile'), false);

    assert.equal(buildAssetSlot({ need: { type: 'sprite', name: '冬月' }, tags: '1girl', uc: '' }).scene.includes('arms at sides'), false);
    const legacy = '{tags}, solo, cowboy shot, standing, facing viewer, looking at viewer, straight-on, arms at sides, centered, {matte}';
    assert.equal(normalizeAutoIllustrationSettings({ assets: { templates: { sprite: legacy } } }).assets.templates.sprite.includes('arms at sides'), false);
    assert.equal(normalizeAutoIllustrationSettings({ assets: { templates: { sprite: '{tags}, arms at sides' } } }).assets.templates.sprite, '{tags}, arms at sides');
});

test('gate:assets:expression-look-keeps-clothes-from-one-source', async () => {
    const { expressionLookTags, expressionPaintDna, applyLookToCaption } = await import('../src/generated-images/dbgen-prompt.js');
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
});

test('gate:assets:reroll-paints-the-slot-prompt-with-a-fresh-seed-and-no-rewrite', async () => {
    const cap = (t) => ({ v4_prompt: { caption: { base_caption: t, char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } });
    const writes = [];
    const paints = [];
    const nai = {
        writeDbgenPrompt: async (meta) => { writes.push(meta.description); return { ok: true, caption: cap('fresh'), captions: [1, 2].map((slotId) => ({ slotId, caption: cap('fresh') })) }; },
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
    const basePrompt = { positive: '1girl, red hoodie', negative: '', caption: cap('1girl, red hoodie, expressionless') };
    const old = cap('old pose, expressionless, closed mouth');
    await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: old, exact: true, basePrompt });
    await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: old, exact: true, basePrompt });
    assert.equal(writes.length, 0, 'reroll paints straight away, no slow prompt writing');
    const text = paints[0].caption.v4_prompt.caption.base_caption;
    assert.equal(text, old.v4_prompt.caption.base_caption);
    assert.doesNotMatch(text, /laughing, open mouth/);
    assert.ok(Number.isInteger(paints[0].seed) && Number.isInteger(paints[1].seed));
    assert.notEqual(paints[0].seed, paints[1].seed, 'each reroll gets a new seed');
    await service.generateExpressionSet({ name: '冬月', basePrompt, moods: ['喜悦', '愤怒'] });
    await service.generateExpressionSet({ name: '冬月', basePrompt, moods: ['喜悦', '愤怒'] });
    assert.equal(paints[2].seed, paints[3].seed, 'one batch shares a seed');
    assert.notEqual(paints[2].seed, paints[4].seed, 'deleting and redoing gets a new seed');
});

test('gate:dbgen:plugin-calls-time-out-instead-of-hanging', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const never = () => new Promise(() => {});
    const NaiDbGen = { generate: never, generateSinglePrompt: never };
    const backend = createImageBackend({ global: { NaiDbGen }, getBridge: () => ({ imageApi: { mode: 'dbgen' } }), dbgenTimeouts: { write: 20, paint: 20 } });
    const caption = { v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } } };
    const painted = await backend.generateDbgenCaption({ caption });
    assert.equal(painted.ok, false);
    assert.match(painted.error, /没有返回，已放弃等待/);
    const written = await backend.writeDbgenPrompt({ description: '画一张' });
    assert.equal(written.ok, false);
    assert.equal(written.reason, 'DBGEN_PROMPT_TIMEOUT');
    assert.match(written.error, /等待超时，插件可能仍在运行/);
});

test('gate:assets:stopped-expression-set-keeps-captions-and-resume-paints-without-rewriting', async () => {
    const moods = ['喜悦', '愤怒', '悲伤'];
    const captionOf = (text) => ({
        v4_prompt: { caption: { base_caption: text, char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    });
    let writes = 0;
    const painted = [];
    const signal = { aborted: false };
    const nai = {
        writeDbgenPrompt: async () => {
            writes += 1;
            return { ok: true, captions: moods.map((mood, index) => ({ slotId: index + 1, caption: captionOf(`expr ${mood}`) })) };
        },
        generateDbgenCaption: async ({ caption }) => {
            painted.push(JSON.stringify(caption));
            signal.aborted = true; // 画完第一张就按停止
            return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: 'x', negative: '' } };
        },
    };
    const { createAssetGenerationService } = await import('./helpers/media-fixtures.js');
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'c1', getUserName: () => '', readPreviousAiTexts: () => [] },
        llm: null, nai, store: createMemoryGeneratedAssetStore(), getSettings: () => ({}), events: null, matte: async (dataUrl) => dataUrl,
    });
    const first = await service.generateExpressionSet({ name: '冬月', basePrompt: { positive: '1girl' }, moods, signal });
    assert.equal(first.stopped, true);
    const left = first.items.filter((item) => item.error === '已停止');
    assert.deepEqual(left.map((item) => item.mood), ['愤怒', '悲伤']);
    assert.ok(left.every((item) => item.caption));

    const { pendingExpressionCaptions } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const notes = {
        愤怒: { error: '已停止', caption: left[0].caption },
        悲伤: { error: '已停止', caption: left[1].caption },
        害羞: { error: '出图失败', caption: captionOf('expr 害羞') },
        被删: { error: '出图失败', caption: captionOf('expr 被删') },
    };
    const pending = pendingExpressionCaptions(notes, { 默认: 'igs-gen:a', 喜悦: 'igs-gen:b', 害羞: '' });
    assert.deepEqual(pending.map((item) => item.mood), ['愤怒', '悲伤', '害羞']);

    signal.aborted = false;
    nai.generateDbgenCaption = async ({ caption }) => {
        painted.push(JSON.stringify(caption));
        return { ok: true, dataUrl: 'data:image/png;base64,AAA', prompt: { positive: 'x', negative: '' } };
    };
    const resumed = await service.paintExpressionCaptions({ name: '冬月', items: pending, basePrompt: { positive: '1girl' }, signal });
    assert.equal(resumed.ok, true);
    assert.deepEqual(resumed.items.map((item) => item.ok), [true, true, true]);
    assert.equal(writes, 1, '继续生图不重写词');
    assert.match(painted.at(-1), /expr 害羞/);
});

test('gate:assets:resume-button-shows-only-when-captions-wait-for-paint', async () => {
    const { renderCharacterSlotTabs } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const caption = { v4_prompt: { caption: { base_caption: 'x', char_captions: [] } } };
    const outfits = { 常服: { moods: { 平和: 'igs-gen:a' } } };
    const base = { charName: '冬月', baseMoods: ['平和'], baseListHtml: '', outfits, activeOutfit: '', icons: {} };
    const sceneAssets = { characters: { 冬月: { 默认: 'legacy.png' } }, characterOutfits: { 冬月: outfits },
        characterDefaultOutfits: { 冬月: { version: 1, outfitName: '常服' } } };
    const idle = renderCharacterSlotTabs({ ...base, sceneAssets, expressionNotes: {} });
    assert.equal(idle.includes('expression-resume'), false);
    const waiting = renderCharacterSlotTabs({ ...base, sceneAssets, expressionNotes: { '冬月\u0001常服': { 愤怒: { error: '已停止', caption } } } });
    assert.ok(waiting.includes(`data-action="outfit-expression-resume:%E5%86%AC%E6%9C%88:${encodeURIComponent('常服')}"`));
    assert.ok(waiting.includes('继续生图（1）'));
});

test('gate:asset-gen:visible-page-uses-the-shared-cache-count-budget', async () => {
    const { createLocalImageCache } = await import('../src/media/tavern-image-cache.js');
    let t = 0;
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store: { getImage: async (id) => ({ dataUrl: `data:image/png;base64,${id}` }) },
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        clock: () => t,
        mediaCache: createLocalImageCache({}, { maxCount: 80 }),
    });
    const refs = Array.from({ length: 80 }, (_, i) => `igs-gen:p${i}`);
    const missing = () => refs.filter((ref) => !service.resolveUrl(ref)).length;
    assert.equal(missing(), 80);
    await new Promise((resolve) => setImmediate(resolve));
    t += 120;
    assert.equal(missing(), 0, '一页 80 张缩略图读回后不能被上限挤掉再闪载入中');
    t += 10000;
    for (let i = 0; i < 5; i++) service.resolveUrl(`igs-gen:other${i}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.resolveUrl('igs-gen:p0'), '', '离开页面后旧图按上限回收');

    let state = 'read-error', reads = 0;
    const recovery = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store: { getImage: async () => {
            reads += 1;
            if (state === 'read-error') throw new Error('idb-unavailable');
            return state === 'missing' ? null : { dataUrl: 'data:image/png;base64,RECOVERED' };
        } },
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
    });
    const ref = 'igs-gen:recover';
    assert.equal(recovery.imageAvailability(ref).status, 'unverified');
    assert.equal(recovery.resolveUrl(ref), '');
    assert.equal(recovery.imageAvailability(ref).status, 'loading');
    recovery.resolveUrl(ref);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1, '并发渲染共用一次存储读取');
    assert.equal(recovery.imageAvailability(ref).status, 'read-error', '读取失败不是图片丢失');
    recovery.resolveUrl(ref);
    assert.equal(reads, 1, '失败不触发无限自动重读');
    state = 'missing';
    recovery.retryImageRead(ref);
    assert.equal(recovery.imageAvailability(ref).status, 'loading');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(recovery.imageAvailability(ref).status, 'missing');
    state = 'available';
    recovery.retryImageRead(ref);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(recovery.imageAvailability(ref).status, 'available');
    assert.equal(recovery.resolveUrl(ref), 'data:image/png;base64,RECOVERED');
    assert.equal(reads, 3, '显式重试能清除读取失败和缺图状态');
    state = 'read-error';
    recovery.resolveUrl('igs-gen:another');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(recovery.imageAvailability('igs-gen:another').status, 'read-error');
    recovery.clearImageReadFailures();
    assert.equal(reads, 4, '清理失败状态不批量读取');
    assert.equal(recovery.imageAvailability('igs-gen:another').status, 'unverified');
    assert.equal(recovery.imageAvailability(ref).status, 'available', '可用资源缓存保持');
    recovery.resolveUrl('igs-gen:another');
    recovery.clearImageReadFailures();
    assert.equal(recovery.imageAvailability('igs-gen:another').status, 'loading', '保留在途读取');

});

test('gate:asset-gen:settings-thumbs-use-short-blob-urls-and-revoke-on-delete', async () => {
    const created = [];
    const revoked = [];
    const store = createMemoryGeneratedAssetStore();
    await store.putImage({ id: 't1', dataUrl: 'data:image/png;base64,QUJD' });
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store,
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        urlApi: { createObjectURL: () => { created.push(`blob:t${created.length}`); return created[created.length - 1]; }, revokeObjectURL: (url) => revoked.push(url) },
        Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts.type; } },
    });
    assert.equal(service.resolveThumbUrl('igs-gen:t1'), '', '未读回时等待异步恢复');
    await new Promise((resolve) => setImmediate(resolve));
    const thumb = service.resolveThumbUrl('igs-gen:t1');
    assert.equal(thumb, 'blob:t0');
    assert.equal(service.resolveThumbUrl('igs-gen:t1'), thumb, '重绘复用同一个短地址，浏览器不重载不闪');
    assert.equal(service.resolveUrl('igs-gen:t1'), thumb, '舞台和设置页共用同一份 Blob 与对象 URL');
    assert.equal(service.resolveThumbUrl('https://example.com/a.png'), 'https://example.com/a.png');
    await service.deleteImages(['t1']);
    assert.deepEqual(revoked, ['blob:t0']);
});

test('gate:assets:dna-composition-reaches-final-dbgen-caption-and-saved-prompt', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const pipeline = buildPipeline();
    pipeline.patchSettings({ naiParams: { ...pipeline.settings.naiParams, model: 'nai-diffusion-5-full' } });
    const requests = [], writes = [];
    const dna = { triggerWords: 'alice_tag, 1girl', identity: 'silver hair, blue eyes',
        defaultAppearance: 'red hoodie', negative: 'extra fingers' };
    const assets = { characterOutfits: { Alice: { 常服: { wardrobe: 'hoodie', moods: {} } } },
        characterDefaultOutfits: { Alice: { version: 1, outfitName: '常服' } },
        wardrobe: { hoodie: { prompt: 'wears a red hoodie' } } };
    const backend = createImageBackend({ nai: {}, global: {
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        NaiDbGen: {
            getPromptCapabilities: () => ({ finalCaption: 1, promptSnapshot: 1, spriteData: 1 }),
            async generateSinglePrompt(req) {
                writes.push(req);
                return { ok: true, value: { format: req.outputs.format, text: spriteDataReply(req, {
                    subject: 'Alice, alice_tag, 1girl, silver hair, blue eyes,',
                }) } };
            },
            async generate(req) {
                requests.push(req);
                return pipeline.imageGen.generate(req);
            },
        },
    }, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    const store = createMemoryGeneratedAssetStore();
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'fixture', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: backend, store, getSettings: () => ({ autoIllustration: {}, sceneAssets: assets }),
        newId: () => 'dna-wire', matte: async (src) => src,
    });
    const result = await service.generateCharacterSprite({ name: 'Alice', dna });
    assert.equal(result.ok, true, result.error);
    assert.equal(requests.length, 1);
    const wire = requests[0];
    const role = wire.caption.v4_prompt.caption.char_captions[0];
    assert.equal(writes.length, 1);
    assert.equal(role.char_caption, 'Alice, alice_tag, 1girl, silver hair, blue eyes, ' + assets.wardrobe.hoodie.prompt + ' calm, relaxed, closed mouth');
    assert.deepEqual(role.centers, [{ x: 0.5, y: 0.5 }]);
    const positive = JSON.stringify(wire.caption.v4_prompt);
    assert.doesNotMatch(positive, /black hair|brown hair|green eyes|maid outfit/);
    assert.equal((positive.match(/silver hair/g) || []).length, 1);
    assert.equal(wire.replaceCharacterKeywords, false);
    assert.equal(wire.captionMode, 'final');
    assert.deepEqual((await store.getImage(result.imageId)).prompt.caption, wire.caption);
    assert.equal(pipeline.naiCalls.length, 1);
    assert.deepEqual(result.sentPrompt.caption.v4_prompt.caption, pipeline.naiCalls[0].payload.parameters.v4_prompt.caption);
    assert.deepEqual(result.sentPrompt.caption.v4_negative_prompt.caption,
        pipeline.naiCalls[0].payload.parameters.v4_negative_prompt.caption);
    assert.deepEqual(dna, { triggerWords: 'alice_tag, 1girl', identity: 'silver hair, blue eyes', defaultAppearance: 'red hoodie', negative: 'extra fingers' });
    pipeline.imageGen.dispose();
});

test('gate:assets:dna-composition-keeps-current-pose-and-independent-outfit', async () => {
    const { composeSpriteCaption } = await import('../src/generated-images/sprite-prompt-composition.js');
    const { expressionLookTags } = await import('../src/generated-images/dbgen-prompt.js');
    const caption = { v4_prompt: { caption: { base_caption: 'solo', char_captions: [{ char_caption: 'brown hair, maid outfit, smile, hand in pocket, adjusting hair', centers: [{ x: 0.5, y: 0.5 }] }] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } };
    const dna = { triggerWords: '1girl', identity: 'silver hair, blue eyes', defaultAppearance: 'red hoodie' };
    const look = expressionLookTags({ caption }, { name: '礼服', prompt: 'white dress', ownImage: true }, dna);
    assert.equal(look, 'white dress');
    const composed = composeSpriteCaption(caption, dna, { outfit: look });
    const role = composed.v4_prompt.caption.char_captions[0].char_caption;
    assert.equal(role, '1girl, silver hair, blue eyes, smile, hand in pocket, adjusting hair, white dress');
    assert.doesNotMatch(role, /brown hair|maid outfit|red hoodie/);
    assert.equal(expressionLookTags({ caption }, null, dna), '');

    assert.equal(composeSpriteCaption(caption, { identity: '银发', triggerWords: 'alice_tag' }), caption, '中文资料使用同次写词的英文结果，不再部分拼接');
});

test('gate:assets:nude-sprite-uses-request-dna-view-without-changing-saved-clothing', async () => {
    const writes = [], paints = [];
    const dna = { triggerWords: '1girl', identity: 'silver hair', defaultAppearance: 'red hoodie' };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'fixture', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {
            async writeDbgenPrompt(meta) { writes.push(meta); return { ok: true, caption: { v4_prompt: { caption: { base_caption: 'brown hair, red hoodie, smile', char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } } }; },
            async generateDbgenCaption(meta) { paints.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,QQ==' }; },
        }, store: createMemoryGeneratedAssetStore(), getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => 'nude-fixture', matte: async (src) => src,
    });
    const result = await service.generateCharacterSprite({ name: 'Alice', dna, nude: true });
    assert.equal(result.ok, true, result.error);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].characterContext[0].dna.defaultAppearance, '');

    const positive = paints[0].caption.v4_prompt.caption.base_caption;
    assert.match(positive, /1girl, silver hair/);
    assert.match(positive, /nude/);
    assert.doesNotMatch(positive, /brown hair|red hoodie/);
    assert.equal(dna.defaultAppearance, 'red hoodie');
});

test('gate:assets:景别 DNA 与当次衣装进入写词，模板续画不重新写词', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const cap = (text) => ({ v4_prompt: { caption: { base_caption: 'solo', char_captions: [{ char_caption: text, centers: [{ x: 0.5, y: 0.5 }] }] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } });
    const cases = [
        { dna: { identity: '银发', defaultAppearance: '白裙' }, outfit: undefined, text: 'silver hair, white dress, smile' },
        { dna: { identity: 'silver hair', defaultAppearance: 'red hoodie' }, outfit: { name: '礼服', prompt: '白色礼服' }, text: 'silver hair, white dress, smile' },
        { dna: { identity: 'silver hair', defaultAppearance: 'red hoodie' }, outfit: { name: '礼服', words: ['white dress'], prompt: '' }, text: 'silver hair, white dress, smile' },
    ];
    for (const fixture of cases) {
        fixture.dna = { ...fixture.dna, version: 2, views: characterViewsFixture() };
        const pipeline = buildPipeline();
        pipeline.patchSettings({ naiParams: { ...pipeline.settings.naiParams, model: 'nai-diffusion-5-full' } });
        const writes = [], paints = [];
        const backend = createImageBackend({ nai: {}, global: {
            btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
            NaiDbGen: {
                getPromptCapabilities: () => ({ finalCaption: 1, promptSnapshot: 1, spriteData: 1 }),
                async generateSinglePrompt(req) {
                    writes.push(req);
                    return { ok: true, value: { format: req.outputs.format, text: spriteDataReply(req, {
                        outfitDescription: fixture.outfit?.prompt || 'wears a white dress' }) } };
                },
                async generate(req) { paints.push(req); return pipeline.imageGen.generate(req); },
            },
        }, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
        const store = createMemoryGeneratedAssetStore();
        let seq = 0;
        const assets = { characterOutfits: { Alice: { 常服: { wardrobe: 'dress', moods: {} } } },
            characterDefaultOutfits: { Alice: { version: 1, outfitName: '常服' } },
            wardrobe: { dress: { prompt: 'wears a white dress' } } };
        const service = createAssetGenerationService({
            messageHost: { getChatId: () => 'fixture', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
            llm: {}, nai: backend, store, getSettings: () => ({ autoIllustration: {}, sceneAssets: assets }),
            newId: () => `translated-${++seq}`, matte: async (src) => src,
        });
        const before = structuredClone(fixture.dna);
        const old = cap('brown hair, maid outfit, smile');
        const result = await service.generateExpressionSet({ name: 'Alice', moods: ['喜悦'],
            basePrompt: { caption: old }, dna: fixture.dna, outfit: fixture.outfit, note: '本次需重新写词',
            async onOutfitDna(clothing) {
                const { prepareOutfitDnaSave } = await import('../src/scene/outfit-identity.js');
                const saved = prepareOutfitDnaSave(assets, 'Alice', clothing.name, clothing.description);
                if (saved.ok) Object.assign(assets, saved.patch);
                return saved;
            } });
        assert.equal(result.ok, true, result.error);
        assert.equal(result.items[0].ok, true, result.items[0].error);

        const writeCount = fixture.outfit && !fixture.outfit.prompt ? 2 : 1;
        assert.equal(writes.length, writeCount);

        assert.equal(writes[0].promptTask.purpose, 'derived');
        assert.equal(writes[0].promptTask.characters[0].framing, 'half_body');
        assert.deepEqual(writes[0].characterContext[0].outfit.words, fixture.outfit?.words);

        assert.equal(paints.length, 1);
        const wire = paints[0];
        const positive = JSON.stringify(wire.caption.v4_prompt);
        assert.match(positive, /silver hair/);
        const clothing = fixture.outfit ? fixture.outfit.prompt || 'wears a white dress' : assets.wardrobe.dress.prompt;
        assert.ok(positive.includes(clothing));
        assert.doesNotMatch(positive, /brown hair|maid outfit|red hoodie/);
        assert.equal(wire.replaceCharacterKeywords, false);
        assert.deepEqual((await store.getImage(result.items[0].imageId)).prompt.caption, wire.caption);
        assert.deepEqual(fixture.dna, before);
        const saved = await service.getImagePrompt(result.items[0].imageId);
        const resumed = await service.paintExpressionCaptions({ name: 'Alice',
            items: [{ mood: '喜悦', ...saved }], basePrompt: { caption: old },
            dna: fixture.dna, outfit: fixture.outfit });
        assert.equal(resumed.items[0].ok, true, resumed.items[0].error);
        assert.equal(writes.length, writeCount, '继续生图复用已写好的表情片段');
        assert.deepEqual(paints[1].caption.v4_prompt, paints[0].caption.v4_prompt, '续画保留实际衣装正文');
        assert.doesNotMatch(JSON.stringify(paints[1].caption.v4_prompt), /brown hair|maid outfit|red hoodie/);
        pipeline.imageGen.dispose();
    }
});

test('gate:assets:translated-default-redraw-uses-current-dna-and-nude-view', async () => {
    const cap = (text) => ({ v4_prompt: { caption: { base_caption: text, char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } });
    for (const nude of [false, true]) {
        const writes = [], paints = [];
        const dna = { identity: '银发', defaultAppearance: '白裙', triggerWords: 'alice_tag' };
        const before = structuredClone(dna);
        let failWrite = false;
        const store = createMemoryGeneratedAssetStore();
        const service = createAssetGenerationService({
            messageHost: { getChatId: () => 'fixture', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
            llm: {}, nai: {
                async writeDbgenPrompt(meta) {
                    writes.push(meta);
                    return failWrite ? { ok: false, error: 'fixture-translation-failed' }
                        : { ok: true, caption: cap(nude ? 'alice_tag, silver hair, nude, smile' : 'alice_tag, silver hair, white dress, smile') };
                },
                async generateDbgenCaption(meta) { paints.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,QQ==' }; },
            }, store, getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
            newId: () => 'translated-default', matte: async (src) => src,
        });
        const old = cap('brown hair, maid outfit, smile');
        const result = await service.generateCharacterSprite({ name: 'Alice', dna, caption: old, nude });
        assert.equal(result.ok, true, result.error);
        assert.equal(writes.length, 1);

        assert.equal(writes[0].characterContext[0].dna.defaultAppearance, nude ? '' : '白裙');
        const text = paints[0].caption.v4_prompt.caption.base_caption;
        assert.match(text, /alice_tag, silver hair/);
        assert.match(text, nude ? /nude/ : /white dress/);
        assert.doesNotMatch(text, /brown hair|maid outfit/);
        if (nude) assert.doesNotMatch(text, /white dress/);
        assert.equal(paints[0].replaceCharacterKeywords, false);
        assert.deepEqual((await store.getImage(result.imageId)).prompt.caption, paints[0].caption);
        assert.deepEqual(dna, before);
        failWrite = true;
        const failed = await service.generateCharacterSprite({ name: 'Alice', dna, caption: old, nude });
        assert.equal(failed.ok, false);
        assert.match(failed.error, /fixture-translation-failed/);
        assert.equal(paints.length, 1, '转译失败不能退回旧外貌出图');
    }
});

test('gate:dna-avatar:portrait 实际 Adapter、快照与失败关闭', async () => {
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { buildPipeline } = await import('../../../nai-dbgen/tests/application/_fakes.js');
    const pipeline = buildPipeline(), writes = [], requests = [];
    const dna = { version: 2, views: characterViewsFixture(), defaultAppearance: 'red hoodie' };
    dna.views.portrait.subject = 'Alice, an adult woman with silver hair, blue eyes and a silver hair clip,';
    const before = structuredClone(dna);
    const assets = { characterOutfits: { Alice: { 常服: { wardrobe: 'collar', moods: {} } } },
        characterDefaultOutfits: { Alice: { version: 1, outfitName: '常服' } },
        wardrobe: { collar: { prompt: 'wears a red collar' } } };
    let cancelAfterWriting = false;
    const controller = new AbortController();
    const backend = createImageBackend({ global: { NaiDbGen: {
        getPromptCapabilities: () => ({ finalCaption: 1, promptSnapshot: 1 }),
        async generateSinglePrompt(req) {
            writes.push(req);
            const result = characterWriteFixture(req, { scene: 'Chibi head and shoulders on a pale background.',
                action: 'wears a red collar and smiles.', outfitDescription: 'wears a red collar' });
            if (cancelAfterWriting) controller.abort();
            return { ok: true, value: result };
        },
        async generate(req) { requests.push(req); return pipeline.imageGen.generate(req); },
    } }, getBridge: () => ({ imageApi: { mode: 'dbgen' } }) });
    const service = createAssetGenerationService({ nai: backend, store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ autoIllustration: {}, sceneAssets: assets }),
        messageHost: { getChatId: () => 'fixture' }, llm: {} });
    try {
        const result = await service.generateCharacterAvatar({ name: 'Alice', dna });
        assert.equal(result.ok, true, result.error);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].promptTask.purpose, 'derived');
        assert.equal(writes[0].promptTask.characters[0].framing, 'portrait');
        assert.deepEqual(writes[0].promptTask.slots, [{ slotId: 1, tokens: ['r0'] }]);
        assert.equal(writes[0].writingRequirements.size, '1024x1024');
        assert.match(writes[0].userPrompts.positive, /chibi/);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].captionMode, 'final');
        assert.equal(requests[0].replaceCharacterKeywords, false);
        assert.equal(requests[0].caption.v4_prompt.caption.char_captions[0].char_caption,
            dna.views.portrait.subject + ' ' + assets.wardrobe.collar.prompt + ' and smiles.');
        assert.equal(result.dnaSnapshot.characters[0].framing, 'portrait');
        assert.equal(result.dnaSnapshot.characters[0].source, 'saved');
        assert.equal(result.dnaCandidates, undefined);
        assert.deepEqual(result.sentPrompt.caption.v4_prompt.caption,
            pipeline.naiCalls[0].payload.parameters.v4_prompt.caption);
        assert.deepEqual(dna, before);
        assert.equal((await service.generateCharacterAvatar({ name: 'Alice', dna: {} })).reason, 'DNA_MISSING');
        assert.equal((await service.generateCharacterAvatar({ name: 'Alice', dna: { identity: 'silver hair' } })).reason, 'DNA_VIEW_MISSING');
        const missing = structuredClone(dna); delete missing.views.portrait;
        assert.equal((await service.generateCharacterAvatar({ name: 'Alice', dna: missing })).reason, 'DNA_VIEW_MISSING');
        const aborted = new AbortController(); aborted.abort();
        assert.equal((await service.generateCharacterAvatar({ name: 'Alice', dna, signal: aborted.signal })).ok, false);
        assert.equal(writes.length, 1);
        assert.equal(requests.length, 1);
        cancelAfterWriting = true;
        assert.equal((await service.generateCharacterAvatar({ name: 'Alice', dna, signal: controller.signal })).ok, false);
        assert.equal(writes.length, 2);
        assert.equal(requests.length, 1, '写词后取消不得发送绘图请求');
    } finally { pipeline.imageGen.dispose(); }
});

test('gate:image-preset:背景预设拒绝不能被词典兜底绕过', async () => {
    const store = createMemoryGeneratedAssetStore();
    let writes = 0, paints = 0;
    const service = createAssetGenerationService({
        messageHost: fakeHost('[igs-scene:学校教室|黄昏|晴]\n放学后。'),
        llm: { prepareImagePrompt() { return { ok: false, reason: 'preset-store-unreadable', error: '预设读取失败' }; },
            async request() { writes += 1; assert.fail('拒绝后不能请求写词'); } },
        nai: { async generate() { paints += 1; assert.fail('拒绝后不能用词典出图'); } },
        store, minBodyChars: 0,
        getSettings: () => ({ autoIllustration: { assets: { backgroundEnabled: true, strictMatch: true } },
            sceneAssets: { enabled: true, scenes: {} } }),
    });
    const result = await service.processMessage(3);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'preset-store-unreadable');
    assert.deepEqual([writes, paints], [0, 0]);
    assert.equal((await store.getFloor('chat-1|3|0')).status, 'failed');
    assert.deepEqual(await store.getAssetsByChat('chat-1'), []);
});

test('gate:image-preset:内置自动立绘同次承接资料并保存身份候选，读取失败零请求', async () => {
    const { createPresetRegistry } = await import('../src/presets/preset-registry.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const { promptSnapshotFromBody, prefixFinalArtist } = await import('../src/generated-images/final-caption.js');
    for (const [unreadable, renamed, inherited] of [
        [false, false, false], [true, false, false], [false, true, false], [false, false, true]]) {
        const store = createMemoryGeneratedAssetStore(), inputs = [], paints = [];
        const lore = [{ name: 'Alice', text: '银发蓝眼，穿蓝色外套。' }];
        const bridge = { imageApi: { mode: 'nai' }, autoIllustration: {
            assets: { spriteEnabled: true }, nai: { apiKey: 'fake' },
            llm: { prompts: { asset: '用户自定义写词要求' } },
        }, sceneAssets: { enabled: true, characters: {}, characterDna: {} } };
        const llm = createImagePromptLlm({ async request(request) {
            const data = imageTaskInput(request);
            inputs.push(data);
            const c = data.promptTask.characters[0];
            return ['slotid: 1', `character: ${c.characterKey}`, 'personality: reserved',
                `outfit_name: ${renamed ? 'Blue coat' : '蓝色外套'}`,
                'outfit_description: wears a blue coat',
                ...['full_body', 'half_body', 'portrait'].map(frame =>
                    `dna_${frame}: Alice, an adult woman with silver hair and blue eyes,`),
            ].join('\n');
        } }, createPresetRegistry());
        const backend = createImageBackend({ llm, global: {}, getBridge: () => bridge,
            nai: { async generate(slot, settings) {
                paints.push(slot);
                const artist = settings.finalArtist;
                return { ok: true, dataUrl: 'data:image/png;base64,FAKE',
                    sentPrompt: promptSnapshotFromBody({ model: settings.model, action: 'generate',
                        parameters: prefixFinalArtist(slot.caption, artist) }, artist) };
            } } });
        const service = createAssetGenerationService({ llm, nai: backend, store,
            messageHost: { ...fakeHost(inherited ? '[igs-char:Alice|平静|你好。]'
                : '[igs-char:Alice|平静|蓝色外套|你好。]\n[igs-char:Alice|平静|晚礼服|晚上好。]'),
                readPreviousAiTexts: () => inherited
                    ? ['[igs-char:Alice|平静|蓝色外套|她走进房间。]'] : ['她走进房间。'],
                async readCharacterLore(names) {
                    assert.deepEqual(names, ['Alice']);
                    if (unreadable) throw new Error('fake-lore-read');
                    return lore;
                } }, getSettings: () => bridge, minBodyChars: 0,
            matte: async url => url, newId: () => 'builtin-sprite' });
        const result = await service.processMessage(3);
        if (unreadable) {
            assert.equal(result.ok, false);
            assert.deepEqual([inputs.length, paints.length], [0, 0]);
            continue;
        }
        assert.equal(result.ok, true, result.error);
        assert.deepEqual([inputs.length, paints.length], [1, 1]);
        assert.deepEqual(inputs[0].lore, lore);
        assert.match(inputs[0].numberedText, /你好/);
        assert.match(inputs[0].previousText, /她走进房间/);
        assert.equal(inputs[0].userPrompts.writing, '用户自定义写词要求');
        const image = await store.getImage('builtin-sprite');
        assert.equal(image.dnaCandidates.characters[0].characterKey, 'Alice');
        assert.ok(image.identityContext);
        assert.ok(image.outfitContext);
        assert.equal(image.outfitContext[0].outfit.name, '蓝色外套', '首次出场衣装不被楼末换装覆盖');
        assert.equal(image.outfitSnapshot.characters[0].name, '蓝色外套');
        assert.equal(image.characterMeta.characters[0].outfit.name, '蓝色外套',
            '模型改名不改变触发标签的程序绑定名');
        assert.equal(image.outfitSnapshot.characters[0].description, 'wears a blue coat');
        const record = await service.readRecord('chat-1|char|Alice');
        assert.equal(record.status, 'review');
        assert.deepEqual(record.outfitSnapshot, image.outfitSnapshot);
        assert.equal(service.tempSpriteForOutfit('Alice', '蓝色外套'), 'igs-gen:builtin-sprite');
        assert.equal(service.tempSpriteForOutfit('Alice', '晚礼服'), '');
        assert.equal(image.promptRecipe.mode, 'dna_template');
        assert.ok(image.sentPrompt);
        assert.deepEqual(bridge.sceneAssets.characterDna, {}, '生成候选尚未采用，不提前登记 DNA');
    }
});

test('gate:image-preset:剧情服装DNA传入正文，缺资料和过期结果拒绝交接', async () => {
    const { createPresetRegistry } = await import('../src/presets/preset-registry.js');
    const { createImagePromptLlm } = await import('../src/generated-images/image-prompt-runtime.js');
    const { createImageBackend } = await import('../src/generated-images/image-backend.js');
    const requests = [];
    let finish, onRequest;
    let requested = new Promise(resolve => { onRequest = resolve; });
    const llm = createImagePromptLlm({ request(request, settings) {
        requests.push({ request: structuredClone(request), settings });
        const response = new Promise(resolve => { finish = resolve; });
        onRequest();
        return response;
    } }, createPresetRegistry());
    const bridge = { imageApi: { mode: 'nai' }, autoIllustration: { nai: { apiKey: 'fake' } } };
    const backend = createImageBackend({ llm, global: {}, getBridge: () => bridge });
    const service = createAssetGenerationService({ llm, nai: backend,
        messageHost: fakeHost(''), store: createMemoryGeneratedAssetStore(), getSettings: () => bridge });
    const sourceText = 'Alice 换上蓝色外套，铜色纽扣反射着灯光。';
    const controller = new AbortController();
    const pending = service.writeWardrobePrompt({ character: 'Alice', outfit: '外套',
        messageId: 3, sourceText, signal: controller.signal, shouldStart: () => true });
    await requested;
    assert.equal(requests.length, 1);
    const data = imageTaskInput(requests[0].request);
    assert.equal(data.numberedText, sourceText);
    assert.deepEqual(data.outputs, { purpose: 'outfit-dna', slotIds: [1], format: 'caption-slots' });

    assert.equal(requests[0].settings.signal, controller.signal);
    finish('#1\nscene: wears a blue coat with brass buttons\nchar:\nuc:');
    assert.deepEqual(await pending, { ok: true, prompt: 'wears a blue coat with brass buttons' });
    assert.equal((await service.writeWardrobePrompt({ outfit: '外套', messageId: 3 })).reason, 'outfit-source-unavailable');
    assert.equal((await service.writeWardrobePrompt({ outfit: '外套', messageId: 3,
        sourceText, shouldStart: () => false })).reason, 'request-stale');
    assert.equal(requests.length, 1);
    let current = true;
    requested = new Promise(resolve => { onRequest = resolve; });
    const late = service.writeWardrobePrompt({ outfit: '外套', messageId: 3,
        sourceText, shouldStart: () => current });
    await requested;
    current = false;
    finish('#1\nscene: wears another coat\nchar:\nuc:');
    assert.equal((await late).reason, 'request-stale');
    assert.equal(requests.length, 2, '迟到回复不触发重试');
});

test('gate:image-preset:指定衣装使用换装模块，默认差分使用表情模块', async () => {
    const writes = [];
    const service = createAssetGenerationService({ llm: {},
        nai: { describe: () => ({ mode: 'nai', ready: { ok: true } }),
            async writePrompt(input) { writes.push(input); return { ok: false, error: 'fake-write-stop' }; },
            async generateCaption() { assert.fail('本测试只核对写词任务，不能出图'); } },
        messageHost: fakeHost(''), store: createMemoryGeneratedAssetStore(),
        getSettings: () => ({ sceneAssets: {
            characterOutfits: { Alice: { 常服: { wardrobe: 'dress', moods: {} } } },
            characterDefaultOutfits: { Alice: { version: 1, outfitName: '常服' } },
            wardrobe: { dress: { prompt: 'wears a white dress' } },
        }, autoIllustration: {} }) });
    const dna = { version: 2, views: characterViewsFixture() };
    for (const [outfit, expected] of [[undefined, 'expression'],
        [{ name: '外套', prompt: 'wears a blue coat' }, 'outfit'], [{ nude: true }, 'outfit']]) {
        const result = await service.generateExpressionSet({ name: 'Alice', dna, outfit, moods: ['喜悦'] });
        assert.equal(result.ok, false);
        assert.equal(writes.at(-1).imagePromptTask, expected);
        assert.equal(writes.at(-1).promptTask.purpose, 'derived');
    }
});

for (const indexed of [false, true]) test(`gate:assets:删除边界复核迟到引用-${indexed ? 'IDB' : 'memory'}`, async () => {
    const { createIndexedDbGeneratedAssetStore } = await import('../src/media/generated-asset-store.js');
    const { withTavernGeneratedAssetFiles } = await import('../src/media/tavern-generated-assets.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const raw = indexed ? createIndexedDbGeneratedAssetStore({ indexedDB: createTransactionalIdb() }) : createMemoryGeneratedAssetStore();
    await raw.putImage({ id: 'late', dataUrl: 'data:image/png;base64,QQ==' });
    let referenced = false;
    const getImage = raw.getImage;
    const store = withTavernGeneratedAssetFiles({ ...raw, async getImage(id) {
        const image = await getImage(id);
        referenced = true;
        return image;
    } }, {});
    const service = createAssetGenerationService({ store, llm: {}, nai: {},
        messageHost: { getChatId: () => 'chat' }, getSettings: () => ({ sceneAssets: {} }),
        readProtectedImageIds: async () => referenced ? ['late'] : [] });
    assert.deepEqual(await service.deleteImages(['late']), { ok: true, retainedIds: ['late'], retained: ['late'] });
    assert.ok(await raw.getImage('late'));
});

test('gate:assets:丢弃候选保留仍被衣柜引用的图片', async () => {
    const store = createMemoryGeneratedAssetStore();
    const record = { key: 'review', chatId: 'chat', floorKey: 'chat|3|0', status: 'temp', imageId: 'held' };
    await store.putAsset(record);
    await store.putImage({ id: 'held', dataUrl: 'data:image/png;base64,QQ==' });
    const service = createAssetGenerationService({ store, llm: {}, nai: {},
        messageHost: { getChatId: () => 'chat' }, getSettings: () => ({ sceneAssets: {
            characterOutfits: { Alice: { Coat: { moods: { 平和: 'igs-gen:held' } } } } } }) });
    service.listReview('chat|3|0');
    await new Promise(resolve => setImmediate(resolve));
    const result = await service.setStatus(record.key, 'discarded');
    assert.equal(result.ok, true);
    assert.equal(result.record.imageId, 'held');
    assert.equal(result.record.status, 'discarded');
    assert.ok(await store.getImage('held'));
});
