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

test('初始为未安装，且不会自行发起下载', () => {
    const { manager, calls } = setup();
    assert.equal(manager.status().state, 'missing');
    assert.equal(manager.isInstalled(), false);
    assert.deepEqual(calls, []);
    for (const theme of ENEMY_ATLAS_THEMES) assert.equal(manager.url(theme), '');
});

test('点击下载后依次变为下载中、已安装，先取随 bundle 发布的副本', async () => {
    const { manager, calls, store } = setup();
    const seen = [];
    manager.subscribe(() => seen.push(manager.status().state));
    const done = manager.download();
    assert.equal(manager.status().state, 'downloading');
    const result = await done;
    assert.equal(result.state, 'installed');
    assert.deepEqual(seen, ['downloading', 'installed']);
    assert.deepEqual(calls, ENEMY_ATLAS_THEMES.map(theme => enemyAtlasSources(theme)[0]));
    assert.ok(calls.every(url => /\/assets\/combat-enemy-atlas\/\w+\.webp$/.test(url)));
    assert.equal(manager.url('western'), '/user/images/igs-media/western-hash.webp');
    assert.deepEqual(Object.keys(store.peek().files), [...ENEMY_ATLAS_THEMES]);
});

test('下载地址依次为 bundle 副本、jsDelivr 固定 tag、GitHub raw', () => {
    const list = enemyAtlasSources('urban');
    assert.equal(list.length, 3);
    assert.equal(list[1], enemyAtlasUrl('urban'));
    assert.ok(list[1].includes(`@${ENEMY_ATLAS_TAG}/`) && list[1].startsWith('https://cdn.jsdelivr.net/gh/'));
    assert.ok(list[2].startsWith('https://raw.githubusercontent.com/') && list[2].includes(`/${ENEMY_ATLAS_TAG}/`));
});

test('前面的地址失败时换下一个地址', async () => {
    const { manager, calls } = setup({ fetch: async url => {
        if (url.startsWith('https://raw.githubusercontent.com/')) return okResponse();
        if (url.startsWith('https://cdn.jsdelivr.net/')) throw new Error('blocked');
        return { ok: false, status: 404 };
    } });
    assert.equal((await manager.download()).state, 'installed');
    assert.equal(calls.length, ENEMY_ATLAS_THEMES.length * 3);
});

test('有地址是网络错误时不报找不到文件', async () => {
    const result = await setup({ fetch: async url => {
        if (url.startsWith('https://cdn.jsdelivr.net/')) throw new Error('blocked');
        return { ok: false, status: 404 };
    } }).manager.download();
    assert.equal(result.reason, 'network');
    assert.match(result.detail, /blocked/);
});

test('下载中重复点击共享同一次请求', async () => {
    const { manager, calls } = setup();
    const first = manager.download();
    const second = manager.download();
    assert.equal(first, second);
    await first;
    assert.equal(calls.length, ENEMY_ATLAS_THEMES.length);
});

test('重新加载后从清单恢复为已安装', async () => {
    const { manager, store } = setup();
    await manager.download();
    const again = createEnemyAtlasManager({ fetch: async () => { throw new Error('不应请求'); }, files: mockFiles(), manifestStore: store });
    assert.equal(again.status().state, 'installed');
    assert.equal(again.url('wuxia'), manager.url('wuxia'));
});

test('清单里的路径不合法时视为未安装', () => {
    const store = memoryStore({ tag: 'x', files: { western: '../etc/passwd', urban: 'user/images/igs-media/u.webp', wuxia: 'user/images/igs-media/w.webp' } });
    const { manager } = setup({ store });
    assert.equal(manager.status().state, 'missing');
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

test('网络异常与非 404 状态码都归为网络错误', async () => {
    const thrown = await setup({ fetch: async () => { throw new Error('offline'); } }).manager.download();
    assert.equal(thrown.reason, 'network');
    assert.match(thrown.detail, /offline/);
    const server = await setup({ fetch: async () => ({ ok: false, status: 503 }) }).manager.download();
    assert.equal(server.reason, 'network');
    assert.match(server.detail, /503/);
});

test('下载内容不是 webp 时按网络错误处理', async () => {
    const result = await setup({ fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(16).buffer }) }).manager.download();
    assert.equal(result.state, 'failed');
    assert.equal(result.reason, 'network');
    assert.match(result.detail, /webp/);
});

test('图片存储未返回路径时报存储失败', async () => {
    const result = await setup({ files: mockFiles({ failOn: 'urban' }) }).manager.download();
    assert.equal(result.state, 'failed');
    assert.equal(result.reason, 'storage');
    assert.equal(result.reasonText, '存储失败');
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

test('删除会清空清单、回收文件并回到未安装', async () => {
    const { manager, files, store } = setup();
    await manager.download();
    const result = await manager.remove();
    assert.equal(result.state, 'missing');
    assert.equal(store.peek(), null);
    assert.equal(manager.url('western'), '');
    assert.equal(files.log.dropped.length, ENEMY_ATLAS_THEMES.length);
});

test('删除时文件回收失败不影响状态', async () => {
    const files = mockFiles();
    files.dropUnused = async () => { throw new Error('gc'); };
    const { manager } = setup({ files });
    await manager.download();
    assert.equal((await manager.remove()).state, 'missing');
});

test('CSS 变量随安装与删除写入、移除', async () => {
    const props = new Map();
    const root = { style: { setProperty: (k, v) => props.set(k, v), removeProperty: k => props.delete(k) } };
    const { manager } = setup();
    applyEnemyAtlasVars(root, manager);
    assert.equal(props.size, 0);
    await manager.download();
    applyEnemyAtlasVars(root, manager);
    assert.equal(props.get('--igs-enemy-atlas-western'), 'url("/user/images/igs-media/western-hash.webp")');
    await manager.remove();
    applyEnemyAtlasVars(root, manager);
    assert.equal(props.size, 0);
});

test('设置项按状态渲染，不含内联 style 与中英文间空格', async () => {
    const { manager } = setup({ fetch: async () => ({ ok: false, status: 404 }) });
    const html = {};
    html.missing = renderCombatEnemyAtlasField(manager);
    assert.match(html.missing, />未安装</);
    assert.match(html.missing, /data-action="combat-enemy-atlas-remove"[^>]* disabled/);
    const pending = manager.download();
    html.downloading = renderCombatEnemyAtlasField(manager);
    assert.match(html.downloading, />下载中</);
    assert.match(html.downloading, /data-action="combat-enemy-atlas-download"[^>]* disabled/);
    await pending;
    html.failed = renderCombatEnemyAtlasField(manager);
    assert.match(html.failed, />下载失败</);
    assert.match(html.failed, /所有下载地址都找不到图集文件/);
    assert.match(html.failed, />重新下载</);
    const ok = setup();
    await ok.manager.download();
    html.installed = renderCombatEnemyAtlasField(ok.manager);
    assert.match(html.installed, />已安装</);
    assert.match(html.installed, /data-action="combat-enemy-atlas-download"[^>]* disabled/);
    for (const text of Object.values(html)) {
        assert.doesNotMatch(text, /style=/);
        assert.doesNotMatch(text.replace(/<[^>]+>/g, ''), /[一-龥] [A-Za-z0-9]|[A-Za-z0-9] [一-龥]/);
    }
});
