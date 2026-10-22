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


const USER_ASSETS = {
    enabled: true,
    scenes: { 学校天台: { url: 'roof.png', times: {} }, 教室: { url: 'class.png', times: {} }, 默认: { url: 'default.png', times: {} } },
    characters: { 艾莉: { 默认: 'ally.png' }, 空槽角色: { 默认: '' } },
    characterAliases: { 艾莉: ['小艾'] },
};

test('图片持续读取失败：只自动读取三次，网络恢复后重新读取', { timeout: 6000 }, async t => {
    const target = new EventTarget();
    let reads = 0, working = false, service;
    const ref = 'igs-gen:failed-image', image = 'data:image/png;base64,QQ==';
    const global = { addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) };
    service = createAssetGenerationService({ global,
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {},
        store: { async getImage() { reads++; if (!working) throw new Error('network-unavailable'); return { dataUrl: image }; } },
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        events: { emit(_name, detail) { if (detail.reason === 'image-retry-ready') service.resolveUrl(ref); } },
    });
    t.after(() => service.stop());
    service.start(); service.resolveUrl(ref);
    await new Promise(resolve => setTimeout(resolve, 2400));
    assert.equal(reads, 3);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(reads, 3);
    working = true; target.dispatchEvent(new Event('online'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(service.resolveUrl(ref), image);
    assert.equal(reads, 4);
});

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
    assert.equal(added.library.characters.莉莉.平和, 'igs-gen:img1');
    assert.equal(added.library.characters.莉莉.默认, undefined);
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

test('gate:image-backend:legacy-nai-key-merges-into-unified-settings', async () => {
    const { mergeLegacyNaiSettings } = await import('../src/generated-images/image-backend.js');
    const merged = mergeLegacyNaiSettings({ nsfwEnabled: true }, { apiKey: 'pst-old', endpoint: '', transport: 'st-proxy', model: 'nai-diffusion-4-5-full' });
    assert.deepEqual([merged.nai.apiKey, merged.nai.transport, merged.nai.model, merged.nsfwEnabled], ['pst-old', 'st-proxy', 'nai-diffusion-4-5-full', true]);
    assert.equal(mergeLegacyNaiSettings({ nai: { apiKey: 'pst-new' } }, { apiKey: 'pst-old' }).nai.apiKey, 'pst-new');
    assert.equal(mergeLegacyNaiSettings({}, { apiKey: 'sk-openai', endpoint: 'https://api.example.com/v1' }).nai, undefined, 'OpenAI 兼容接口的 Key 不能当 NAI Key');
});

test('gate:assets:service-matte-edit-read-save-and-refresh-revision', async () => {
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

    // 旧修订自动接到当前记录，完成本次修改并通知。
    const before = emitted.length;
    assert.deepEqual(await service.saveMatteEdit('v2', 1, { dataUrl: 'late' }), { ok: true, revision: 3 });
    assert.equal((await store.getImage('v2')).dataUrl, 'late');
    assert.equal(emitted.length, before + 1);

    const noUpdate = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai: {}, store: { getImage: async () => null },
        getSettings: () => ({}),
    });
    assert.equal((await noUpdate.saveMatteEdit('v2', 1, { dataUrl: 'x' })).reason, 'update-unsupported');
});

test('gate:assets:wardrobe-reference-paints-the-saved-prompt', async () => {
    let writes = 0;
    const nai = {
        describe: () => ({ via: 'dbgen', ownPrompts: true, ready: { ok: true } }),
        writeDbgenPrompt: async () => { writes += 1; return { ok: false, error: '不该写词' }; },
        generateDbgenCaption: async (meta) => {
            const caption = meta.caption.v4_prompt.caption.base_caption;
            const spicy = caption.includes('不要回避');
            if (spicy) {
                assert.match(caption, /^yukata, floral pattern\n/);
                assert.match(caption, /这是色情服装/);
            } else {
                assert.equal(caption, 'yukata, floral pattern');
            }
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
