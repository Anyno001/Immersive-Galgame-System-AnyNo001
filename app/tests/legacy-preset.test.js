import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSettingsAction, assetEditTarget } from '../src/visual/igs-ui/settings-actions.js';
import { assetOwnerKey, draftAssetLibrary, effectiveSceneAssets } from '../src/scene/asset-scope.js';
import { LEGACY_PRESET_KEY, isLegacyPresetData, legacyPresetToPack, loadLegacyPresets, mergeLegacyLibrary, storeLegacyPresets } from '../src/scene/legacy-preset.js';
import { loadAssetFolders, saveAssetFolders, normalizeAssetFolders } from '../src/visual/igs-ui/asset-folders.js';

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// 和旧版「现代」预设导出文件同样的结构（字段取自用户的 现代(6).json）。
function oldPreset() {
    return {
        scenes: { 卧室: { url: 'https://img/bedroom', times: {}, words: ['家中主卧'] }, 拉面馆: { url: 'https://img/ramen', times: {} } },
        characters: { 敖丙: { 默认: 'https://img/ao', 自信: 'https://img/ao-proud' }, 洛斯莉: { 默认: 'https://img/ros' } },
        characterAliases: { 敖丙: ['丙'], 洛斯莉: [] },
        characterDna: {},
        characterOutfits: { 敖丙: { 校服: { words: ['制服'], moods: { 默认: '', 自信: 'https://img/ao-uniform' } } } },
        moodGroups: [{ label: '自信', words: ['自信', '得意'] }],
        timeGroups: [{ label: '夜晚', words: ['夜晚', '深夜'] }],
        weatherGroups: [],
        ancient: false,
        spriteLayouts: { 'embedded::敖丙::默认': { x: 10 } },
        spriteHeads: { 洛斯莉: { y: 0.2 } },
        statusAvatars: { 洛斯莉: 'https://img/ros-avatar' },
    };
}

function makeCtx({ card = '小雪', confirms = [], prompts = [], sceneAssets = {} } = {}) {
    const storage = memoryStorage();
    const draft = { bridge: { sceneAssets: { enabled: true, ...sceneAssets } }, readerSettings: {} };
    const alerts = [];
    const global = {
        localStorage: storage,
        alert: (text) => alerts.push(text),
        SillyTavern: card ? { getContext: () => ({ characterId: 0, characters: [{ name: card }], name2: card }) } : undefined,
    };
    const answers = [...confirms];
    const typed = [...prompts];
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global },
        dialogs: { confirm: async () => (answers.length ? answers.shift() : true), prompt: async () => (typed.length ? typed.shift() : '') },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, draft, storage, alerts };
}

test('legacy preset: 旧版预设文件能认出来，转换后一样不少', () => {
    const data = oldPreset();
    assert.equal(isLegacyPresetData(data), true);
    assert.equal(isLegacyPresetData({ format: 'igs-card-pack', scenes: {} }), false);
    assert.equal(isLegacyPresetData([]), false);
    const pack = legacyPresetToPack(data);
    assert.deepEqual(pack.library.scenes, data.scenes);
    assert.deepEqual(pack.library.characters, data.characters);
    assert.deepEqual(pack.library.characterAliases, data.characterAliases);
    assert.deepEqual(pack.library.statusAvatars, data.statusAvatars);
    assert.equal(pack.library.characterOutfits.敖丙.校服.moods.自信, 'https://img/ao-uniform');
    assert.deepEqual(pack.spriteLayouts, data.spriteLayouts);
    assert.equal(pack.worldview, 'modern', '只有 ancient:false 的旧文件按现代');
});

test('legacy preset: 合并只换同名，原有其他条目保留', () => {
    const target = { scenes: { 教室: { url: 'mine' }, 卧室: { url: 'old' } }, characters: { 林: { 默认: 'lin' } } };
    mergeLegacyLibrary(target, legacyPresetToPack(oldPreset()));
    assert.equal(target.scenes.教室.url, 'mine');
    assert.equal(target.scenes.卧室.url, 'https://img/bedroom');
    assert.deepEqual(Object.keys(target.characters).sort(), ['林', '敖丙', '洛斯莉'].sort());
});

test('legacy preset: 浏览器里留着的旧预设能读出来，旧配置带的预设能存回去', () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: oldPreset(), 坏的: 5 }, active: '现代' }));
    assert.deepEqual(Object.keys(loadLegacyPresets(storage)), ['现代']);
    assert.deepEqual(storeLegacyPresets(storage, { 古风: { scenes: { 庭院: { url: 'y' } } } }), { ok: true, count: 1 });
    assert.deepEqual(Object.keys(loadLegacyPresets(storage)).sort(), ['古风', '现代'].sort());
    assert.equal(JSON.parse(storage.getItem(LEGACY_PRESET_KEY)).active, '现代');
});
