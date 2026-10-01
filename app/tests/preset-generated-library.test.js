import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { handleSettingsAction, unreferencedGeneratedImageIds } from '../src/visual/igs-ui/settings-actions.js';
import { normalizeGeneratedLibrary } from '../src/scene/asset-match.js';

const PRESET_KEY = 'igs:scene-presets:v1';
const libA = () => ({ scenes: { 教室: { url: 'igs-gen:bg-a', words: [], times: {} } }, characters: { 雪乃: { 默认: 'igs-gen:sp-a' } }, characterAliases: { 雪乃: [] } });
const libB = () => ({ scenes: {}, characters: { 塞拉菲娜: { 默认: 'igs-gen:sp-b' } }, characterAliases: { 塞拉菲娜: [] } });

function createCtx({ importFile, generated = libA(), ancient = false, presetName = '卡A' } = {}) {
    const storage = createMemoryStorage();
    const draft = {
        bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {}, characterAliases: {}, moodGroups: [], ancient, generated } },
        readerSettings: { spriteLayouts: {}, spriteHeads: {} },
    };
    const prompts = [];
    const deleted = [];
    const doc = {
        body: { appendChild() {}, removeChild() {} },
        createElement(tag) {
            const el = { tag, click() {
                if (tag === 'input' && importFile) { el.files = [{ name: 'shared.json', text: JSON.stringify(importFile) }]; queueMicrotask(() => el.onchange()); }
            } };
            return el;
        },
    };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { scenePresetName: presetName, expandedSpriteSlots: new Set() } } },
        options: {
            global: { localStorage: storage, document: doc, prompt: () => prompts.shift() || '', confirm: () => true, alert: () => {} },
            generatedAssets: { deleteImages: async (ids) => { deleted.push(ids); return { ok: true }; } },
        },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, storage, prompts, deleted, sa: () => draft.bridge.sceneAssets, stored: () => JSON.parse(storage.getItem(PRESET_KEY)) };
}

test('gate:preset:generated-library-saved-and-switched-with-preset', async () => {
    const t = createCtx();
    await handleSettingsAction('scene-preset-save', t.ctx);
    assert.deepEqual(t.stored().presets['卡A'].generated, normalizeGeneratedLibrary(libA()));

    t.sa().generated = libB();
    t.ctx.state.activeSettings.asyncState.scenePresetName = '卡B';
    await handleSettingsAction('scene-preset-save', t.ctx);
    assert.deepEqual(t.stored().presets['卡B'].generated, normalizeGeneratedLibrary(libB()));

    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('卡A'), t.ctx);
    assert.deepEqual(t.sa().generated, normalizeGeneratedLibrary(libA()), '切到卡A换成卡A的生成素材库');
    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('卡B'), t.ctx);
    assert.deepEqual(t.sa().generated, normalizeGeneratedLibrary(libB()));

    const stored = t.stored();
    const { generated, ...legacy } = stored.presets['卡A'];
    stored.presets['旧预设'] = legacy;
    t.storage.setItem(PRESET_KEY, JSON.stringify(stored));
    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('旧预设'), t.ctx);
    assert.deepEqual(t.sa().generated, normalizeGeneratedLibrary(libB()), '旧预设没有 generated 字段时保留当前生成素材库');
});

test('gate:preset:remove-generated-keeps-images-still-referenced-by-other-presets', async () => {
    const t = createCtx();
    await handleSettingsAction('scene-preset-save', t.ctx);
    t.ctx.state.activeSettings.asyncState.scenePresetName = '卡B';
    t.sa().generated = { ...libB(), scenes: libA().scenes };
    await handleSettingsAction('scene-preset-save', t.ctx);

    // 教室背景同时被卡A、卡B引用：从当前库删除后图片仍留着。
    await handleSettingsAction(`gen-lib-remove:background:${encodeURIComponent('教室')}`, t.ctx);
    assert.equal(t.sa().generated.scenes['教室'], undefined);
    assert.deepEqual(t.deleted, [[]]);

    // 只有当前库引用、且没有任何预设引用的图片才真正删除。
    t.sa().generated.characters['新角色'] = { 默认: 'igs-gen:sp-new' };
    await handleSettingsAction(`gen-lib-remove:sprite:${encodeURIComponent('新角色')}`, t.ctx);
    assert.deepEqual(t.deleted[1], ['sp-new']);

    assert.deepEqual(unreferencedGeneratedImageIds(['bg-a', 'sp-b', 'x'], {}, t.storage), ['x']);
    assert.deepEqual(unreferencedGeneratedImageIds(['x'], { generated: { characters: { a: { 默认: 'igs-gen:x' } } } }, null), []);
});

test('gate:preset:ancient-survives-export-import', async () => {
    const exporter = createCtx({ ancient: true });
    await handleSettingsAction('scene-preset-save', exporter.ctx);
    const blobs = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:igs'; };
    URL.revokeObjectURL = () => {};
    try {
        assert.deepEqual(await handleSettingsAction('scene-preset-export', exporter.ctx), { ok: true });
    } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
    }
    const exported = JSON.parse(await blobs[0].text());
    assert.equal(exported.ancient, true);
    assert.equal(Object.hasOwn(exported, 'generated'), false, '本 PR 导出不带生成素材库');

    const originalReader = globalThis.FileReader;
    globalThis.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
    try {
        const importer = createCtx({ importFile: exported, ancient: false });
        importer.prompts.push('古风卡');
        await handleSettingsAction('scene-preset-import', importer.ctx);
        assert.equal(importer.sa().ancient, true);
        assert.equal(importer.stored().presets['古风卡'].ancient, true);

        const { ancient, ...legacyFile } = exported;
        const legacy = createCtx({ importFile: legacyFile, ancient: true });
        legacy.prompts.push('旧文件');
        await handleSettingsAction('scene-preset-import', legacy.ctx);
        assert.equal(legacy.sa().ancient, false, '旧文件缺字段按现代背景');
    } finally {
        globalThis.FileReader = originalReader;
    }
});
