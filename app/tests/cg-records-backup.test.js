import test from 'node:test';
import assert from 'node:assert/strict';

import { withTavernIllustrationFiles, CG_RECORDS_FILE } from '../src/media/tavern-image-files.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';

// 假酒馆：user/files 下的 JSON 与 user/images/igs-cg 的文件名列表，记录上传。
function fakeTavern({ backup = null, names = [] } = {}) {
    const state = { backup, uploads: [] };
    const globalObject = {
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
        clearTimeout,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        async fetch(url, options = {}) {
            if (String(url).startsWith(`/user/files/${CG_RECORDS_FILE}`)) {
                return state.backup ? { ok: true, status: 200, json: async () => state.backup } : { ok: false, status: 404 };
            }
            if (url === '/api/files/upload') {
                const body = JSON.parse(options.body);
                state.backup = JSON.parse(Buffer.from(body.data, 'base64').toString('utf8'));
                state.uploads.push(body.name);
                return { ok: true };
            }
            if (url === '/api/images/list') return { ok: true, json: async () => names };
            return { ok: false, status: 404 };
        },
    };
    return { globalObject, state };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('gate:cg-backup:records-are-mirrored-and-restored-after-cache-clear', async () => {
    const { globalObject, state } = fakeTavern();
    const first = withTavernIllustrationFiles(createMemoryIllustrationStore(), globalObject);
    await first.putSlot('角色 - 2026|3|0', { slot: 1, status: 'done', caption: 'rain', dataUrl: 'user/images/igs-cg/a.png' });
    await wait(30);
    assert.deepEqual(state.uploads, [CG_RECORDS_FILE]);
    assert.equal(state.backup.slots['角色 - 2026|3|0|1'].caption, 'rain');

    // 清缓存：换一个空的本地库，备份文件还在。
    const fresh = createMemoryIllustrationStore();
    const second = withTavernIllustrationFiles(fresh, globalObject);
    assert.deepEqual(await second.listSlotKeys(), ['角色 - 2026|3|0|1']);
    const raw = await fresh.getSlotRecord('角色 - 2026|3|0|1');
    assert.equal(raw.dataUrl, 'user/images/igs-cg/a.png', '记录补回本地，图仍指向酒馆文件');

    await second.deleteSlot('角色 - 2026|3|0', 1);
    await wait(30);
    assert.deepEqual(Object.keys(state.backup.slots), [], '删除同步进备份');
});

test('gate:cg-backup:existing-local-records-seed-the-backup-and-network-errors-never-overwrite-it', async () => {
    const store = createMemoryIllustrationStore();
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/x.png' });
    await store.putSlot('chat|2|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,AAAA' });
    const { globalObject, state } = fakeTavern();
    await withTavernIllustrationFiles(store, globalObject).listSlotKeys();
    await wait(30);
    assert.deepEqual(Object.keys(state.backup.slots), ['chat|1|0|1'], '只备份已搬进酒馆文件夹的');

    const broken = fakeTavern({ backup: { version: 1, slots: { 'old|1|0|1': { slot: 1, dataUrl: 'user/images/igs-cg/o.png' } } } });
    const realFetch = broken.globalObject.fetch;
    broken.globalObject.fetch = async (url, options) => (String(url).startsWith('/user/files/') ? Promise.reject(new Error('net')) : realFetch(url, options));
    const wrapped = withTavernIllustrationFiles(createMemoryIllustrationStore(), broken.globalObject);
    await wrapped.putSlot('chat|9|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/n.png' });
    await wait(30);
    assert.deepEqual(broken.state.uploads, [], '读不到备份时不上传，免得盖掉');
});

test('gate:cg-backup:floor-images-from-before-the-backup-are-recognised-by-file-name', async () => {
    const { globalObject } = fakeTavern({ names: ['chat_5_0_1@@dataUrl@0123456789abcdef.png', 'chat_5_0_2@@dataUrl@fedcba9876543210.webp', 'chat_50_0_1@@dataUrl@aaaaaaaaaaaaaaaa.png'] });
    const wrapped = withTavernIllustrationFiles(createMemoryIllustrationStore(), globalObject);
    globalObject.fetch = ((inner) => async (url, options) => (String(url).startsWith('/user/images/') ? { ok: true, blob: async () => new Blob(['x']) } : inner(url, options)))(globalObject.fetch);
    globalObject.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,eA=='; this.onload(); } };
    const slots = await wrapped.getSlots('chat|5|0');
    assert.deepEqual(slots.map((s) => [s.slot, s.status]), [[1, 'done'], [2, 'done']], '只认这一楼的，第 50 楼的不算');
});
