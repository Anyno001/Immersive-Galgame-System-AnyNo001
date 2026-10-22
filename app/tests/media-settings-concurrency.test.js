import test from 'node:test';
import assert from 'node:assert/strict';
import { createTavernSettingsSync, collectGlobalSettings } from '../src/storage/tavern-settings-file.js';
import { mapImageRepositoryFor } from '../src/media/tavern-map-images.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { flushMediaJournals } from '../src/media/media-record-journal.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { LEGACY_PRESET_KEY } from '../src/scene/legacy-preset.js';
import { fakeMediaServer, pixel } from './helpers/fake-media-server.js';

test('gate:media:map-tombstone-overrides-legacy-settings-and-old-reference-delays-file-deletion', async () => {
    const server = fakeMediaServer(), host = server.host(), maps = mapImageRepositoryFor(host), key = 'igs-map-custom:c:t:l';
    const saved = await maps.set(key, pixel('old'));
    server.files.set('igs-settings.json', { version: 1, savedAt: 100, settings: { [key]: saved.url, igs_bridge_config: '{}' } });
    await maps.remove(key); await flushMediaJournals(host);
    const freshHost = server.host(), fresh = mapImageRepositoryFor(freshHost);
    const sync = createTavernSettingsSync(freshHost, { storage: freshHost.localStorage, debounceMs: 10000 });
    await Promise.all([fresh.restore(), sync.start()]);
    assert.equal(freshHost.localStorage.getItem(key), null);
    assert.equal((await mediaFileGcFor(freshHost).drain()).protected, 1); assert.equal(server.images.size, 1);
    freshHost.localStorage.setItem('igs-map-gen-palette', 'bright'); await sync.flush(); sync.stop();
    assert.equal(Object.hasOwn(collectGlobalSettings(freshHost.localStorage), key), false);
    await mediaFileGcFor(freshHost).drain(); assert.equal(server.images.size, 0);
});
