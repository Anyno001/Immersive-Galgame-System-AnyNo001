import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BACKGROUND_PACK } from '../src/backgrounds/default-background-pack.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { loadAssetFolders } from '../src/visual/igs-ui/asset-folders.js';

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function makeCtx({ confirm = true, persistOk = true, scenes = { '我的场景': { url: 'mine', times: {} } } } = {}) {
    const storage = memoryStorage();
    const draft = { bridge: { sceneAssets: { enabled: true, scenes } }, readerSettings: {} };
    const counts = { persist: 0, alerts: 0 };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { scenePresetName: '', expandedSceneSlots: new Set() } } },
        options: { global: { localStorage: storage, prompt: () => '', confirm: () => confirm, alert: () => { counts.alerts += 1; } } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { counts.persist += 1; return persistOk ? { ok: true } : { ok: false, reason: 'quota' }; },
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, draft, storage, counts };
}

test('gate:backgrounds:action-merges-pack-and-files-into-default-folders', async () => {
    const { ctx, draft, storage, counts } = makeCtx();
    await handleSettingsAction('scene-add-default-bg', ctx);
    const scenes = draft.bridge.sceneAssets.scenes;
    assert.equal(scenes['我的场景'].url, 'mine');
    assert.equal(Object.keys(scenes).length, DEFAULT_BACKGROUND_PACK.length + 1);
    assert.equal(counts.persist, 1);
    const folders = loadAssetFolders(storage, '');
    assert.ok(folders.scenes.folders.includes('现代') && folders.scenes.folders.includes('古风'));
    for (const item of DEFAULT_BACKGROUND_PACK) assert.equal(folders.scenes.assign[item.name], item.folder);
    assert.equal(folders.scenes.assign['我的场景'], undefined);
    await handleSettingsAction('scene-add-default-bg', ctx);
    assert.equal(counts.persist, 1, 'second click does not persist again');
    assert.equal(counts.alerts, 1);
});

test('gate:backgrounds:action-cancel-keeps-library-untouched', async () => {
    const { ctx, draft, counts } = makeCtx({ confirm: false });
    await handleSettingsAction('scene-add-default-bg', ctx);
    assert.deepEqual(Object.keys(draft.bridge.sceneAssets.scenes), ['我的场景']);
    assert.equal(counts.persist, 0);
});

test('gate:backgrounds:action-rolls-back-when-persist-fails', async () => {
    const original = { '我的场景': { url: 'mine', times: {} } };
    const { ctx, draft, storage } = makeCtx({ persistOk: false, scenes: original });
    const result = await handleSettingsAction('scene-add-default-bg', ctx);
    assert.equal(result.ok, false);
    assert.equal(draft.bridge.sceneAssets.scenes, original);
    assert.deepEqual(Object.keys(loadAssetFolders(storage, '').scenes.assign), []);
});
