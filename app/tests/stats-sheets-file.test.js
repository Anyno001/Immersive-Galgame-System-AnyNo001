import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsSheetsFile, mergeSheetMaps } from '../src/storage/stats-sheets-file.js';
import { createSheetStore, SHEET_STORE_KEY } from '../src/scene/stats/stat-sheet-store.js';
import { isGlobalSettingKey } from '../src/storage/tavern-settings-file.js';
import { TRAIT_CODEX_KEY } from '../src/core/stats-trait-runtime.js';

const memoryStorage = (init = {}) => {
    const map = new Map(Object.entries(init));
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null };
};
const row = (at, rank = 'A') => ({ at, sheet: { rank, attributes: {}, skills: {} } });

test('特质图鉴跟着全局配置文件同步', () => {
    assert.equal(isGlobalSettingKey(TRAIT_CODEX_KEY), true);
});

test('角色卡按卡合并，同卡取较新，超出上限按最近使用淘汰', () => {
    const merged = mergeSheetMaps({ a: row(5, 'old'), b: row(1) }, { a: row(9, 'new'), c: row(3), bad: { at: 99 } }, 2);
    assert.deepEqual(Object.keys(merged).sort(), ['a', 'c']);
    assert.equal(merged.a.sheet.rank, 'new');
});

test('启动读回文件写回本机，本机多出的卡再上传', async () => {
    const storage = memoryStorage({ [SHEET_STORE_KEY]: JSON.stringify({ local: row(2) }) });
    const uploads = [];
    const host = {
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({}) }) },
        fetch: async (url, init) => {
            if (String(url).startsWith('/user/files/')) return { ok: true, status: 200, json: async () => ({ sheets: { remote: row(4) } }) };
            uploads.push(JSON.parse(Buffer.from(JSON.parse(init.body).data, 'base64').toString('utf8')));
            return { ok: true };
        },
    };
    const file = createStatsSheetsFile(host, { storage, debounceMs: 1 });
    const res = await file.load();
    assert.equal(res.ok, true);
    assert.deepEqual(Object.keys(JSON.parse(storage.getItem(SHEET_STORE_KEY))).sort(), ['local', 'remote']);
    await file.flush();
    assert.equal(uploads.length, 1);
    assert.deepEqual(Object.keys(uploads[0].sheets).sort(), ['local', 'remote']);
});

test('角色卡写入后通知镜像', () => {
    let n = 0;
    const store = createSheetStore(() => memoryStorage(), () => { n += 1; });
    store.put('卡', '甲', { rank: 'B', attributes: {}, skills: {} });
    assert.equal(n, 1);
});
