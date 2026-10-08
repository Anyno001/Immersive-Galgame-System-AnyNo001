import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { withTavernGeneratedAssetFiles } from '../src/media/tavern-image-files.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';

const cap = (t) => ({ v4_prompt: { caption: { base_caption: t, char_captions: [] } }, v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } } });
const flush = async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0)); };

test('gate:expression-prompt:background-migrate-does-not-overwrite-saved-prompt', async () => {
    // 读图时排下的「搬家」拿的是读到那一刻的记录；酒馆上传不可用时它原样写回，
    // 以前只比对图片数据，会把这之间保存的新提示词覆盖成旧的。
    const raw = createMemoryGeneratedAssetStore();
    await raw.putImage({ id: 'a', revision: 1, type: 'sprite', dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: 'old', negative: '' } });
    // 酒馆上传接口慢且失败：搬家在上传期间被用户的保存插队，失败后拿着旧记录准备写回。
    const slowFailingUpload = () => new Promise((resolve) => setTimeout(() => resolve({ ok: false }), 40));
    const host = {
        setTimeout, clearTimeout,
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({}) }) },
        fetch: slowFailingUpload,
    };
    const store = withTavernGeneratedAssetFiles(raw, host);
    const opened = await store.getImage('a');
    assert.equal(opened.prompt.positive, 'old');
    await raw.putImage({ ...opened, prompt: { positive: 'new words', negative: '' }, promptEdited: true });
    await new Promise((r) => setTimeout(r, 120));
    await flush();
    const after = await raw.getImage('a');
    assert.equal(after.prompt.positive, 'new words');
    assert.equal(after.promptEdited, true);
});

test('gate:expression-prompt:edited-prompt-is-kept-and-redrawn-as-is', async () => {
    const paints = [];
    const nai = {
        writeDbgenPrompt: async () => ({ ok: false }),
        generateDbgenCaption: async (meta) => { paints.push(meta); return { ok: true, dataUrl: 'data:image/png;base64,QQ==' }; },
    };
    const store = createMemoryGeneratedAssetStore();
    let seq = 0;
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => 'chat', readFloor: () => null, readPreviousAiTexts: () => [], on: () => () => {} },
        llm: {}, nai, store,
        getSettings: () => ({ autoIllustration: {}, sceneAssets: {} }),
        newId: () => `r-${seq += 1}`,
        matte: async (dataUrl) => dataUrl,
    });
    await store.putImage({ id: 'img', revision: 1, dataUrl: 'data:image/png;base64,QQ==', prompt: { positive: 'smile', negative: '', caption: cap('smile, blue hair') } });
    assert.equal((await service.getImagePrompt('img')).edited, undefined);
    const saved = await service.saveImagePrompt('img', { positive: '', negative: '', caption: cap('my own words, silver hair') });
    assert.equal(saved.ok, true);
    const read = await service.getImagePrompt('img');
    assert.equal(read.edited, true);
    assert.equal(read.caption.v4_prompt.caption.base_caption, 'my own words, silver hair');

    const basePrompt = { positive: '1girl, red hoodie', negative: '', caption: cap('1girl, red hoodie') };
    // 用户改过的词：原样出图，不再补情绪 / 衣服词；新图继续记为改过。
    const exact = await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: read.caption, exact: true, basePrompt });
    assert.equal(paints[0].caption.v4_prompt.caption.base_caption, 'my own words, silver hair');
    const next = await service.getImagePrompt(exact.items[0].imageId);
    assert.equal(next.edited, true);
    // 没改过的词照旧硬合。
    await service.generateExpressionImage({ name: '冬月', mood: '大笑', caption: cap('plain'), basePrompt });
    assert.match(paints[1].caption.v4_prompt.caption.base_caption, /^laughing/);
});
