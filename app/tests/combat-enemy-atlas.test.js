import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ENEMY_ATLAS_THEMES, ENEMY_ATLAS_TAG, applyEnemyAtlasVars, createEnemyAtlasManager, enemyAtlasSources, enemyAtlasUrl,
    renderCombatEnemyAtlasField,
} from '../src/visual/igs-ui/combat-enemy-atlas.js';

const webp = () => {
    const bytes = new Uint8Array(16);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    return bytes;
};
const okResponse = () => ({ ok: true, status: 200, arrayBuffer: async () => webp().buffer });

function memoryStore(initial = null) {
    let value = initial;
    return { load: () => value, save: v => { value = v; }, clear: () => { value = null; }, peek: () => value };
}
function mockFiles({ failOn = null } = {}) {
    const log = { offload: [], release: [], dropped: [] };
    return {
        log,
        async offload(record, key) {
            log.offload.push(key);
            if (failOn === key) return record;
            return { dataUrl: `user/images/igs-media/${key}-hash.webp` };
        },
        async release(record) { log.release.push(record.dataUrl); },
        async dropUnused(old) { log.dropped.push(old.dataUrl); },
    };
}
function setup({ fetch = async () => okResponse(), files = mockFiles(), store = memoryStore() } = {}) {
    const calls = [];
    const manager = createEnemyAtlasManager({ fetch: async (url, init) => { calls.push(url); return fetch(url, init); }, files, manifestStore: store, globalObject: globalThis });
    return { manager, files, store, calls };
}

test('下载中重复点击共享同一次请求', async () => {
    const { manager, calls } = setup();
    const first = manager.download();
    const second = manager.download();
    assert.equal(first, second);
    await first;
    assert.equal(calls.length, ENEMY_ATLAS_THEMES.length);
});

test('全部地址 404 报明确原因，并回滚已写入的文件', async () => {
    const files = mockFiles();
    const { manager, store } = setup({ files, fetch: async url => (url.endsWith('/wuxia.webp') ? { ok: false, status: 404 } : okResponse()) });
    const result = await manager.download();
    assert.equal(result.state, 'failed');
    assert.equal(result.reason, 'cdn-404');
    assert.equal(result.reasonText, '所有下载地址都找不到图集文件');
    assert.equal(store.peek(), null);
    assert.equal(manager.isInstalled(), false);
    assert.deepEqual(files.log.dropped.sort(), ['user/images/igs-media/urban-hash.webp', 'user/images/igs-media/western-hash.webp']);
    assert.equal(files.log.release.length, 2);
});

test('清单写入失败同样报存储失败，且不留下已安装状态', async () => {
    const store = { ...memoryStore(), save() { throw new Error('quota'); } };
    const { manager, files } = setup({ store });
    const result = await manager.download();
    assert.equal(result.reason, 'storage');
    assert.equal(manager.isInstalled(), false);
    assert.equal(files.log.dropped.length, ENEMY_ATLAS_THEMES.length);
});

test('失败后可以重试并成功', async () => {
    let offline = true;
    const { manager } = setup({ fetch: async () => { if (offline) throw new Error('offline'); return okResponse(); } });
    assert.equal((await manager.download()).state, 'failed');
    offline = false;
    assert.equal((await manager.download()).state, 'installed');
});

