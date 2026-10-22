import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createImageBackend } from '../src/generated-images/image-backend.js';
import { createCharacterDnaStore } from '../src/core/character-dna-store.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { normalizeBridgeConfig } from '../src/visual/igs-ui/settings-host-normalize.js';
import { bootstrapIGS } from '../src/index.js';
import { createMemoryIllustrationStore, floorKeyOf } from '../src/media/illustration-store.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';
import { createStoryOutfitService } from '../src/generated-images/illustration/story-outfit-service.js';
import { editCharacterDnaField, normalizeCharacterDna } from '../src/scene/character-dna.js';
import { migrateSpriteSystem } from '../src/scene/sprite-system-migration.js';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';

const caption = { v4_prompt: { caption: { base_caption: 'plugin composition',
    char_captions: [{ char_caption: 'plugin complete character, sitting', centers: [{ x: 0.2, y: 0.8 }] }] } },
    v4_negative_prompt: { caption: { base_caption: 'plugin negative', char_captions: [{ char_caption: '' }] } } };

function fixture(t, options = {}) {
    const bridge = { imageApi: { mode: 'dbgen', externalSpriteDna: options.enabled !== false },
        autoIllustration: { retry: { enabled: false }, assets: { spriteEnabled: true, backgroundEnabled: false } },
        sceneAssets: { enabled: true, characters: { Alice: {} },
            ...(options.dna && { characterDna: { Alice: structuredClone(options.dna) } }) } };
    const order = [], writes = [], paints = [];
    const h = builtinImageHarness({ bridge, ...options, afterWrite: input => { order.push('dna'); options.afterWrite?.(input); } });
    let context = {}, chatId = 'chat-A', failSave = false;
    const text = options.text || '[igs-char:Alice|平和|Alice 正在说话。]';
    const messageHost = { getChatId: () => chatId, readPreviousAiTexts: () => [], readCharacterLore: async names =>
        names.map(name => ({ name, description: 'Adult woman, silver hair, gentle personality.' })),
        readFloor: id => ({ chatId, messageId: id, swipeId: 0, isAi: true, isLatest: true, text }),
        on: () => () => {} };
    const dnaStore = createCharacterDnaStore({ readAssets: () => bridge.sceneAssets, readContext: () => context,
        saveAssets(next) {
            if (failSave) return { ok: false };
            bridge.sceneAssets = structuredClone(next); order.push('save'); options.afterSave?.(); return { ok: true };
        } });
    const api = { async generateSinglePrompt(request) {
        assert.ok(Object.keys(request).every(key => ['description', 'messageId', 'skipRecall', 'signal'].includes(key)));
        writes.push(request); order.push('plugin-write');
        options.onPluginWrite?.();
        return { ok: true, value: { caption: structuredClone(caption), captions: Array.from({ length: options.spriteCount || 1 },
            (_, index) => ({ slotId: index + 1, caption: structuredClone(caption) })) } };
    }, async generate(request) {
        assert.deepEqual(request.caption, caption, '外部返回完整提示词不得被 DNA 覆盖');
        assert.equal(request.replaceCharacterKeywords, true, '保留 DBGen 自己的关键词替换');
        paints.push(request); order.push('plugin-paint');
        if (options.pluginFailure?.()) return { ok: false, error: { code: 'FIXTURE_PAINT_FAILED', message: 'fixture' } };
        return { ok: true, value: [{ blob: new Blob(['fixture'], { type: 'image/png' }) }] };
    } };
    const backend = createImageBackend({ global: { NaiDbGen: api, btoa }, llm: h.llm,
        taskRuntime: h.runtime, getBridge: () => bridge });
    const store = createMemoryGeneratedAssetStore();
    const service = createAssetGenerationService({ llm: h.llm, nai: backend, store, getSettings: () => bridge,
        captureSpriteGenerationTarget: name => dnaStore.capture(name),
        captureCharacterDnaTarget: name => dnaStore.capture(name),
        messageHost, minBodyChars: 0, matte: async url => url });
    t.after(() => { service.stop(); h.dispose(); });
    return { h, bridge, order, writes, paints, service, store, dnaStore, api, messageHost,
        setContext(value) { context = value; }, setChat(value) { chatId = value; },
        failSave(value = true) { failSave = value; } };
}
async function writing(h, count = 1) {
    for (let i = 0; i < 100 && h.writes.length < count; i++) await setImmediate();
    assert.equal(h.writes.length, count);
}

function batchDnaReply(input) {
    return input.outputs.rows.slice().reverse().map(({ slotId, characterKey }) => [
        `slotid: ${slotId}`, `character: ${characterKey}`, 'personality: calm',
        `outfit_name: ${characterKey}日常装`, 'outfit_description: wears a blue cotton dress',
        ...['full_body', 'half_body', 'portrait'].map(view => `dna_${view}: ${characterKey}, an adult woman with silver hair,`),
    ].join('\n')).join('\n---\n');
}

test('DNA 空回复：连续为空结束整楼任务，释放锁后能正常再次生成', { timeout: 5000 }, async t => {
    let empty = true;
    const f = fixture(t, { reply: input => empty ? ' \n ' : batchDnaReply(input), spriteCount: 2,
        text: '[igs-char:Alice|平和|Alice 正在说话。]\n[igs-char:Bob|平和|Bob 正在说话。]' });
    f.bridge.sceneAssets.characters = {};
    const failed = await f.service.processMessage(1, { manual: true });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'recovery-exhausted');
    assert.match(failed.error, /3 次.*正文为空/);
    assert.equal(f.h.writes.length, 3, '外层恢复不得重新发起一轮补 DNA');
    assert.equal(f.bridge.sceneAssets.characterDna, undefined);
    assert.equal(f.writes.length + f.paints.length, 0);
    const floor = await f.store.getFloor(floorKeyOf(f.messageHost.readFloor(1)));
    assert.equal(floor.status, 'failed');
    assert.match(floor.error, /正文为空/);
    for (const request of f.h.writes) assert.deepEqual(request.input.outputs.rows.map(row => row.characterKey), ['Alice', 'Bob']);
    empty = false;
    assert.equal((await f.service.processMessage(1, { manual: true })).ok, true);
    assert.equal(f.h.writes.length, 4);
    assert.equal(f.paints.length, 2);
});

test('DNA 空回复：实际设置控制器返回明确错误，原按钮操作不会留在恢复等待', { timeout: 5000 }, async t => {
    let empty = true;
    const f = fixture(t, { reply: input => empty ? '' : batchDnaReply(input) });
    const alerts = [];
    const context = { extensionPrompts: {}, getWorldInfoPrompt: async () => ({ worldInfoString: '' }) };
    const global = { localStorage: createMemoryStorage(), btoa, NaiDbGen: f.api,
        alert: message => alerts.push(message), confirm: () => true, prompt: () => '',
        Image: class { set src(value) { if (value) { this.naturalWidth = 32; this.naturalHeight = 48; queueMicrotask(() => this.onload?.()); } } },
        SillyTavern: { getContext: () => context } };
    const app = bootstrapIGS({ global, config: f.bridge, secondaryLlm: f.h.llm, autoAttachMagicWand: false,
        generatedAssetStore: createMemoryGeneratedAssetStore(), illustrationStore: createMemoryIllustrationStore(), alphaMatte: async url => url,
        illustrationMessageHost: { ...f.messageHost, onImageFloorReady: () => () => {}, destroy() {},
            attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }) },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
        fetch() { assert.fail('不应请求真实网络'); } });
    t.after(() => app.shutdown());
    const opened = app.openSettings({ page: 'source' });
    const failed = await opened.controller.invoke('char-generate-sprite:Alice');
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'recovery-exhausted');
    assert.equal(f.h.writes.length, 3);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /3 次.*正文为空/);
    empty = false;
    assert.equal((await opened.controller.invoke('char-generate-sprite:Alice')).ok, true);
    assert.equal(f.h.writes.length, 4, '失败动作已经释放，同一入口可以开始新操作');
    assert.equal(f.paints.length, 1);
});

test('自动缺图先建档，同角色并发楼层只请求一次 DNA', async t => {
    const f = fixture(t);
    f.bridge.sceneAssets.characters = {};
    f.h.waitWriting();
    const one = f.service.processMessage(1, { manual: true });
    const two = f.service.processMessage(2, { manual: true });
    await writing(f.h);
    f.h.release();
    const results = await Promise.all([one, two]);
    for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.h.writes.length, 1);
    assert.equal(f.order[0], 'dna');
    assert.equal(f.order[1], 'save');
    assert.equal(f.paints.length, 2);
});

test('共享 DNA 保存交接时首个楼层取消，另一楼复用已保存资料而不误判为编辑冲突', async t => {
    const controller = new AbortController();
    const f = fixture(t, { reply: batchDnaReply, afterSave: () => controller.abort() });
    f.h.waitWriting();
    const first = f.service.prepareExternalSpriteDna({ name: 'Alice', signal: controller.signal });
    await writing(f.h);
    const second = f.service.prepareExternalSpriteDna({ name: 'Alice' });
    await setImmediate();
    f.h.release();
    assert.equal((await first).ok, false);
    const result = await second;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.shouldStart(), true);
    assert.equal(f.h.writes.length, 1);
    assert.ok(f.bridge.sceneAssets.characterDna.Alice.views.half_body.subject);
});

function settingsFixture(f, confirmed, saveFails = false) {
    const questions = [], alerts = [];
    const state = { activeSettings: { draft: { bridge: normalizeBridgeConfig(structuredClone(f.bridge)), readerSettings: {} }, asyncState: {} } };
    const global = { localStorage: createMemoryStorage(), SillyTavern: { getContext: () => ({}) }, alert: text => alerts.push(text) };
    return { questions, alerts, state,
        ctx: { state, options: { global, generatedAssets: f.service }, rerenderSettings: () => ({ ok: true }),
            dialogs: { confirm: async text => { questions.push(text); return confirmed; }, prompt: async () => '', alert: async text => alerts.push(text) },
            persistSettingsDraft() {
                if (saveFails && state.activeSettings.draft.bridge.sceneAssets.characterDna?.Alice?.version === 2) return { ok: false };
                Object.assign(f.bridge, structuredClone(state.activeSettings.draft.bridge));
                return { ok: true };
            } } };
}
