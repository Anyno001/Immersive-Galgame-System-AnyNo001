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

test('全局配置同步持续失败：三次后停止，保留本机配置，恢复后可完成同步', { timeout: 3000 }, async t => {
    const storage = new FakeStorage({ igs_bridge_config: 'keep-local' });
    let uploads = 0, fail = true;
    const global = {
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        fetch: async url => {
            if (String(url).startsWith('/user/files/')) return { ok: false, status: 404 };
            uploads++;
            return { ok: !fail, status: fail ? 500 : 200 };
        },
    };
    const sync = createTavernSettingsSync(global, { storage, debounceMs: 1 });
    t.after(() => sync.stop());
    assert.equal((await sync.start()).ok, false);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(uploads, 3);
    assert.equal(sync.diagnostics().retryPaused, true);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(uploads, 3);
    assert.equal(storage.getItem('igs_bridge_config'), 'keep-local');
    fail = false;
    assert.equal(await sync.flush(), true);
    assert.equal(uploads, 4);
    assert.equal(sync.diagnostics().retryPaused, false);
});

function fakeGlobal(fileJson) {
    const uploads = [];
    const global = {
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        async fetch(url, init) {
            if (String(url).startsWith('/user/files/igs-settings.json')) {
                return fileJson ? { ok: true, status: 200, json: async () => fileJson } : { ok: false, status: 404, json: async () => null };
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
