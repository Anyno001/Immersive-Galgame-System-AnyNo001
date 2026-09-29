import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';

const PRESET_KEY = 'igs:scene-presets:v1';
const outfits = () => ({ 小林海斗: { 泳装: { words: ['比基尼'], moods: { 喜悦: 'swim.png' } } } });

function createCtx({ importFile } = {}) {
    const storage = createMemoryStorage();
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                scenes: {},
                characters: { 小林海斗: { 喜悦: 'base.png' } },
                characterAliases: { 小林海斗: [] },
                characterOutfits: outfits(),
                moodGroups: [],
            },
        },
        readerSettings: { spriteLayouts: { 'pc::小林海斗|泳装::喜悦': { posX: 1, posY: 2, scale: 3 } }, spriteHeads: {} },
    };
    const prompts = [];
    const downloads = [];
    const doc = {
        body: { appendChild() {}, removeChild() {} },
        createElement(tag) {
            const el = { tag, click() {
                if (tag === 'input' && importFile) { el.files = [{ name: 'shared.json', text: JSON.stringify(importFile) }]; queueMicrotask(() => el.onchange()); }
                if (tag === 'a') downloads.push(el.href);
            } };
            return el;
        },
    };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { scenePresetName: '服装预设', expandedSpriteSlots: new Set() } } },
        options: { global: { localStorage: storage, document: doc, prompt: () => prompts.shift() || '', confirm: () => true, alert: () => {} } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, storage, prompts, downloads, sa: () => draft.bridge.sceneAssets, stored: () => JSON.parse(storage.getItem(PRESET_KEY)) };
}

test('gate:outfits:preset-save-apply-keeps-outfits-and-legacy-presets-do-not-clear', async () => {
    const t = createCtx();
    await handleSettingsAction('scene-preset-save', t.ctx);
    assert.deepEqual(t.stored().presets['服装预设'].characterOutfits, outfits());

    t.sa().characterOutfits = {};
    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('服装预设'), t.ctx);
    assert.deepEqual(t.sa().characterOutfits, outfits());

    const stored = t.stored();
    stored.presets['旧预设'] = { scenes: {}, characters: { 小林海斗: { 喜悦: 'base.png' } }, characterAliases: {} };
    stored.presets['空服装'] = { ...stored.presets['旧预设'], characterOutfits: {} };
    stored.presets['脏数据'] = { ...stored.presets['旧预设'], characterOutfits: { 小林海斗: { 默认: {}, 'a|b': {}, 睡衣: { words: ['睡衣', '睡裙'], moods: { 默认: 'x', 平和: 'p.png' } } } } };
    t.storage.setItem(PRESET_KEY, JSON.stringify(stored));

    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('旧预设'), t.ctx);
    assert.deepEqual(t.sa().characterOutfits, outfits(), 'legacy preset without the field keeps current outfits');
    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('脏数据'), t.ctx);
    assert.deepEqual(t.sa().characterOutfits, { 小林海斗: { 睡衣: { words: ['睡裙'], moods: { 平和: 'p.png' } } } });
    await handleSettingsAction('scene-preset-apply:' + encodeURIComponent('空服装'), t.ctx);
    assert.deepEqual(t.sa().characterOutfits, {}, 'explicit empty object applies as-is');
});

test('gate:outfits:preset-export-import-round-trip', async () => {
    const exporter = createCtx();
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
    assert.deepEqual(exported.characterOutfits, outfits());
    assert.deepEqual(exported.spriteLayouts, { 'pc::小林海斗|泳装::喜悦': { posX: 1, posY: 2, scale: 3 } });

    const originalReader = globalThis.FileReader;
    globalThis.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
    try {
        const importer = createCtx({ importFile: { ...exported, characterOutfits: { ...exported.characterOutfits, __proto__: null } } });
        importer.sa().characterOutfits = {};
        importer.prompts.push('导入的');
        await handleSettingsAction('scene-preset-import', importer.ctx);
        assert.deepEqual(importer.sa().characterOutfits, outfits());
        assert.deepEqual(importer.stored().presets['导入的'].characterOutfits, outfits());

        const { characterOutfits, ...legacyFile } = exported;
        const legacy = createCtx({ importFile: legacyFile });
        legacy.prompts.push('旧文件');
        await handleSettingsAction('scene-preset-import', legacy.ctx);
        assert.deepEqual(legacy.sa().characterOutfits, outfits(), 'legacy file without the field keeps current outfits');
        assert.equal(Object.hasOwn(legacy.stored().presets['旧文件'], 'characterOutfits'), false);
    } finally {
        globalThis.FileReader = originalReader;
    }
});
