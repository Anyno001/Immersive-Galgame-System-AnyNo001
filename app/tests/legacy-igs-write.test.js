import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { LEGACY_VN_KEYS, LEGACY_READER_MODES, readLegacyIgsSettings, writeLegacyIgsSettings } from '../src/storage/legacy-igs.js';

const keys = [LEGACY_VN_KEYS.bridge, LEGACY_VN_KEYS.displayMode, ...LEGACY_READER_MODES.map((mode) => `${LEGACY_VN_KEYS.readerPrefix}${mode}`)];
const state = (fontSize = 16) => ({ bridge: { openMode: 'pc', sceneAssets: { enabled: true } }, displayMode: 'pc', readerMode: 'default', readerSettings: { fontSize }, readerSettingsByMode: {} });

test('unchanged settings do not rewrite legacy keys', () => {
    const base = createMemoryStorage();
    let writes = 0;
    const storage = { getItem: (key) => base.getItem(key), setItem: (key, value) => { writes++; base.setItem(key, value); }, removeItem: (key) => base.removeItem(key) };
    assert.equal(writeLegacyIgsSettings(storage, state()).ok, true);
    assert.equal(writes, keys.length);
    assert.equal(writeLegacyIgsSettings(storage, state()).ok, true);
    assert.equal(writes, keys.length);
    assert.equal(writeLegacyIgsSettings(storage, state(18)).ok, true);
    assert.equal(writes, keys.length + 1);
    assert.equal(readLegacyIgsSettings(storage, 'default').readerSettings.fontSize, 18);
});

test('partial write failure restores all legacy keys, including a key changed before throwing', () => {
    const base = createMemoryStorage();
    assert.equal(writeLegacyIgsSettings(base, state()).ok, true);
    const before = base.dump();
    let writes = 0;
    const storage = {
        getItem: (key) => base.getItem(key),
        setItem: (key, value) => {
            writes++;
            base.setItem(key, value);
            if (writes === 2) throw new Error('quota');
        },
        removeItem: (key) => base.removeItem(key),
    };
    const next = { ...state(20), bridge: { openMode: 'pc', sceneAssets: { enabled: false } } };
    const result = writeLegacyIgsSettings(storage, next);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'legacy-storage-write-failed');
    assert.equal(result.rollbackFailed, undefined);
    assert.ok(writes >= 4);
    assert.deepEqual(base.dump(), before);
});

test('a newly created key is removed on failure and non-reversible adapters do not start writes', () => {
    const base = createMemoryStorage();
    let calls = 0;
    const storage = { getItem: (key) => base.getItem(key), setItem: (key, value) => { calls++; base.setItem(key, value); if (calls === 2) throw new Error('quota'); }, removeItem: (key) => base.removeItem(key) };
    assert.equal(writeLegacyIgsSettings(storage, state()).ok, false);
    assert.deepEqual(base.dump(), {});
    const nonReversible = { getItem: (key) => base.getItem(key), setItem: () => { calls++; } };
    assert.equal(writeLegacyIgsSettings(nonReversible, state()).ok, false);
    assert.equal(calls, 2);
});

test('a getter failure does not start any writes', () => {
    const base = createMemoryStorage();
    assert.equal(writeLegacyIgsSettings(base, state()).ok, true);
    const before = base.dump();
    let writes = 0;
    const storage = {
        getItem: () => { throw new Error('read failed'); },
        setItem: () => { writes++; },
        removeItem: () => { writes++; },
    };
    const result = writeLegacyIgsSettings(storage, state(20));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'legacy-storage-write-failed');
    assert.equal(writes, 0);
    assert.deepEqual(base.dump(), before);
});

test('a failed compensation is reported rather than treated as an atomic rollback', () => {
    const base = createMemoryStorage();
    assert.equal(writeLegacyIgsSettings(base, state()).ok, true);
    const before = base.dump();
    const storage = {
        getItem: (key) => base.getItem(key),
        setItem: (key, value) => {
            if (value === before[key]) throw new Error('rollback blocked');
            base.setItem(key, value);
            throw new Error('write failed after mutation');
        },
        removeItem: (key) => base.removeItem(key),
    };
    const result = writeLegacyIgsSettings(storage, { ...state(20), bridge: { openMode: 'pc', sceneAssets: { enabled: false } } });
    assert.equal(result.ok, false);
    assert.equal(result.rollbackFailed, true);
    assert.notDeepEqual(base.dump(), before);
});

test('write failure with failed remove compensation reports a partial write', () => {
    const values = new Map();
    const storage = {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, value); throw new Error('write failed after mutation'); },
        removeItem() { throw new Error('remove compensation failed'); },
    };
    const result = writeLegacyIgsSettings(storage, {
        bridge: {}, displayMode: 'default', readerMode: 'default',
        readerSettings: {}, readerSettingsByMode: {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.rollbackFailed, true);
    assert.ok(values.size > 0);
});
