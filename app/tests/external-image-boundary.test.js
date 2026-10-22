import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageBackend } from '../src/generated-images/image-backend.js';
import { createBuiltinImageTaskRuntime } from '../src/generated-images/builtin-image-task-runtime.js';
import { usesCharacterTemplates } from '../src/generated-images/illustration/character-prompt-task.js';
import { createAssetGenerationService, createAutoIllustrationService } from './helpers/media-fixtures.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';

const caption = {
    v4_prompt: { caption: { base_caption: 'plugin composition, soft light',
        char_captions: [{ char_caption: 'purple hair, sitting, plugin outfit', centers: [{ x: 0.3, y: 0.7 }] }] } },
    v4_negative_prompt: { caption: { base_caption: 'plugin negative',
        char_captions: [{ char_caption: 'plugin character negative' }] } },
};
const dna = { version: 2, views: { half_body: { subject: 'silver hair', negative: 'red hair' } } };

function fixture(t) {
    const writes = [], paints = [];
    const assets = { characters: { Alice: {} }, characterDna: { Alice: structuredClone(dna) },
        characterDefaultOutfits: { Alice: { version: 1, outfitName: '校服' } },
        characterOutfits: { Alice: { 校服: { base: 'old.png', moods: {}, prompt: 'blue uniform' } } } };
    const bridge = { imageApi: { mode: 'dbgen' }, sceneAssets: assets };
    const api = {
        get getPromptCapabilities() { assert.fail('外部生成不得探测内置模板协议'); },
        async generateSinglePrompt(request) {
            writes.push(structuredClone(request));
            assert.ok(Object.keys(request).every(key => ['description', 'messageId', 'skipRecall', 'signal'].includes(key)));
            return { ok: true, value: { caption: structuredClone(caption),
                captions: [{ slotId: 1, caption: structuredClone(caption), anchorSentence: '二段。' }] } };
        },
        async generate(request) {
            paints.push(request);
            assert.deepEqual(request.caption, caption, '插件完整内容、人物和坐标必须保持');
            assert.equal(request.captionMode, undefined);
            assert.equal(request.capturePrompt, undefined);
            return { ok: true, value: [{ blob: new Blob(['fixture'], { type: 'image/png' }) }] };
        },
    };
    const registry = new Proxy({}, { get(_target, key) {
        if (key === 'onImagePromptChanged') return () => () => {};
        assert.fail('DBGen 不依赖 IGS 内置预设内容');
    } });
    const runtime = createBuiltinImageTaskRuntime({ readBridge: () => bridge, registry });
    t.after(() => runtime.dispose());
    const backend = createImageBackend({ global: { NaiDbGen: api, btoa }, taskRuntime: runtime,
        llm: { request() { assert.fail('不得用 IGS 副 LLM 接管 DBGen 写词'); } }, getBridge: () => bridge });
    const store = createMemoryGeneratedAssetStore();
    const service = createAssetGenerationService({ nai: backend, store, getSettings: () => bridge,
        messageHost: { getChatId: () => 'fixture' }, matte: async url => url });
    t.after(() => service.stop());
    return { assets, bridge, backend, service, writes, paints, store };
}

test('外部 DBGen：原有格式仍能交付自身资料，发送文本采用直接的字段用途说明', async t => {
    const h = fixture(t);
    const result = await h.backend.writePrompt({ imagePromptTask: 'sprite', description: '画半身立绘，穿新制服。',
        characterContext: [{ characterKey: 'Legacy', dna: { identity: 'legacy fixed identity',
            defaultAppearance: 'black hair, blue eyes, old coat', negative: 'red hair' },
        outfit: { name: '新制服', description: 'white uniform' } }] });
    assert.equal(result.ok, true);
    for (const value of ['legacy fixed identity', 'black hair, blue eyes, old coat', 'white uniform', 'red hair'])
        assert.equal(h.writes[0].description.split(value).length - 1, 1);
    assert.match(h.writes[0].description, /穿着按本次衣装的名称和说明描写/);
    assert.doesNotMatch(h.writes[0].description, /旧默认|优先于/);
    assert.equal(h.paints.length, 0);
});

test('外部 DBGen：普通写词失败保留错误码与定位，不回显插件私有正文', async () => {
    for (const code of ['PROMPT_LLM_UNSET', 'NAI_429', 'WORKBENCH_CAPTION_INVALID', 'DBGEN_PROMPT_EXCEPTION']) {
        const backend = createImageBackend({ getBridge: () => ({ imageApi: { mode: 'dbgen' } }),
            global: { NaiDbGen: { generate() { assert.fail('写词失败不得出图'); },
                async generateSinglePrompt() { return { ok: false, error: { code,
                    message: 'PRIVATE-MODEL-TEXT', context: { slotId: 2, status: 429, traceId: 'trace_safe', rawText: 'PRIVATE-BODY' } } }; } } } });
        const result = await backend.writeFloorPrompts({ description: '生成剧情 CG' });
        assert.equal(result.ok, false);
        assert.equal(result.reason, code);
        assert.equal(result.diagnostic.slotId, 2);
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|rawText/);
    }
});
