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
