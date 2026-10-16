import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyGlobalSettings, collectGlobalSettings, createTavernSettingsSync, isGlobalSettingKey, resolveSyncAction, SETTINGS_SYNC_META_KEY,
} from '../src/storage/tavern-settings-file.js';

class FakeStorage {
    constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
    get length() { return this.map.size; }
    key(i) { return Array.from(this.map.keys())[i] ?? null; }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
}

function fakeGlobal(fileJson) {
    const uploads = [];
    const global = {
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        async fetch(url, init) {
            if (String(url).startsWith('/user/files/igs-settings.json')) {
                return fileJson ? { ok: true, json: async () => fileJson } : { ok: false, json: async () => null };
            }
            if (url === '/api/files/upload') {
                const body = JSON.parse(init.body);
                uploads.push({ name: body.name, file: JSON.parse(Buffer.from(body.data, 'base64').toString('utf8')) });
                return { ok: true };
            }
            return { ok: false };
        },
    };
    return { global, uploads };
}

test('gate: settings sync only mirrors global config keys', () => {
    assert.equal(isGlobalSettingKey('igs_bridge_config'), true);
    assert.equal(isGlobalSettingKey('igs-reader-settings-v9-default'), true);
    assert.equal(isGlobalSettingKey('igs:scene-presets:v1'), true);
    assert.equal(isGlobalSettingKey('igs_image_job_log'), false);
    assert.equal(isGlobalSettingKey('igs:settings-last-page:v1'), false);
    assert.equal(isGlobalSettingKey('igs-map-gen-salt:chat1'), false);
    const storage = new FakeStorage({ igs_bridge_config: '{"a":1}', igs_image_job_log: '[]', other: 'x' });
    assert.deepEqual(collectGlobalSettings(storage), { igs_bridge_config: '{"a":1}' });
});

test('gate: settings sync restores newer file, uploads unsynced local edits', () => {
    const file = { savedAt: 200, settings: {} };
    assert.equal(resolveSyncAction(file, { syncedAt: 0, changedAt: 0 }, true), 'restore');
    assert.equal(resolveSyncAction(file, { syncedAt: 200, changedAt: 0 }, true), 'none');
    assert.equal(resolveSyncAction(file, { syncedAt: 200, changedAt: 300 }, true), 'upload');
    assert.equal(resolveSyncAction(file, { syncedAt: 100, changedAt: 150 }, true), 'restore');
    assert.equal(resolveSyncAction(null, { syncedAt: 0, changedAt: 0 }, true), 'upload');
    assert.equal(resolveSyncAction(null, { syncedAt: 0, changedAt: 0 }, false), 'none');
});

test('gate: applying file settings never deletes local-only keys', () => {
    const storage = new FakeStorage({ igs_bridge_config: 'old', 'igs-map-gen-palette': 'keep' });
    assert.equal(applyGlobalSettings(storage, { igs_bridge_config: 'new', igs_image_job_log: 'no' }), 1);
    assert.equal(storage.getItem('igs_bridge_config'), 'new');
    assert.equal(storage.getItem('igs-map-gen-palette'), 'keep');
    assert.equal(storage.getItem('igs_image_job_log'), null);
});

test('gate: settings sync restores from tavern file on a fresh device', async () => {
    const storage = new FakeStorage();
    const { global, uploads } = fakeGlobal({ version: 1, savedAt: 500, settings: { igs_bridge_config: '{"x":1}' } });
    let restored = 0;
    const sync = createTavernSettingsSync(global, { storage, onRestored: () => { restored += 1; } });
    const result = await sync.start();
    sync.stop();
    assert.equal(result.action, 'restore');
    assert.equal(storage.getItem('igs_bridge_config'), '{"x":1}');
    assert.equal(restored, 1);
    assert.equal(uploads.length, 0);
    assert.equal(JSON.parse(storage.getItem(SETTINGS_SYNC_META_KEY)).syncedAt, 500);
});

test('gate: settings sync uploads local edits after debounce and unhooks on stop', async () => {
    const storage = new FakeStorage({ igs_bridge_config: '{"x":1}' });
    const proto = Object.getPrototypeOf(storage);
    const originalSet = proto.setItem;
    const { global, uploads } = fakeGlobal(null);
    let t = 1000;
    const sync = createTavernSettingsSync(global, { storage, debounceMs: 5, now: () => ++t });
    await sync.start();
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].name, 'igs-settings.json');
    storage.setItem('igs_image_job_log', '[1]');
    storage.setItem('igs_bridge_config', '{"x":2}');
    await new Promise((resolve) => setTimeout(resolve, 30));
    await sync.flush();
    assert.equal(uploads.length, 2);
    assert.deepEqual(uploads[1].file.settings, { igs_bridge_config: '{"x":2}' });
    assert.equal(JSON.parse(storage.getItem(SETTINGS_SYNC_META_KEY)).changedAt, 0);
    sync.stop();
    assert.equal(proto.setItem, originalSet);
});

test('gate: settings sync stays off without a tavern connection', async () => {
    const storage = new FakeStorage({ igs_bridge_config: '{}' });
    const sync = createTavernSettingsSync({ fetch: async () => ({ ok: false }) }, { storage });
    assert.equal((await sync.start()).reason, 'no-tavern');
});
