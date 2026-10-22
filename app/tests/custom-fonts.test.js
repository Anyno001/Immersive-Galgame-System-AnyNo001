import { createMemoryAssetThumbStore } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CUSTOM_FONT_STORE_KEY,
    customFontStack,
    fontOptionsWith,
    loadCustomFonts,
    normalizeCustomFonts,
    registerCustomFonts,
    saveCustomFonts,
    uploadFontFile,
} from '../src/media/custom-fonts.js';
import { DIALOG_FONT_OPTIONS } from '../src/visual/igs-ui/reader-host-constants.js';
import { isGlobalSettingKey } from '../src/storage/tavern-settings-file.js';
import { renderCustomFontManager } from '../src/visual/igs-ui/settings-fields.js';



function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('gate:fonts:custom-font-store-normalize-and-options', () => {
    const g = { localStorage: memoryStorage() };
    assert.deepEqual(loadCustomFonts(g), []);
    const good = { id: 'a1', label: '我的字体', family: 'IGSUserFont-我的字体-a1', path: '/user/files/igs-font-a1.woff2', format: 'woff2' };
    saveCustomFonts(g, [good, { id: 'bad', family: 'X', path: '/etc/passwd' }, { ...good, id: 'dup' }]);
    const loaded = loadCustomFonts(g);
    assert.deepEqual(loaded, [good], '非法路径与重名字体被丢弃');
    assert.ok(isGlobalSettingKey(CUSTOM_FONT_STORE_KEY), '字体清单随全局配置同步');
    const options = fontOptionsWith(DIALOG_FONT_OPTIONS, loaded);
    assert.equal(options.length, DIALOG_FONT_OPTIONS.length + 1);
    assert.deepEqual(options.at(-1), [customFontStack(good), '我的字体（已上传）']);
    assert.equal(fontOptionsWith(DIALOG_FONT_OPTIONS, []), DIALOG_FONT_OPTIONS);
    assert.equal(normalizeCustomFonts('garbage').length, 0);
    const html = renderCustomFontManager(loaded, '已上传');
});

test('gate:fonts:upload-validates-and-posts-to-tavern-files', async () => {
    const calls = [];
    const g = {
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF': 't' }) }) },
        fetch: async (url, init) => {
            calls.push({ url, body: JSON.parse(init.body) });
            return { ok: true, json: async () => ({ path: `user/files/${JSON.parse(init.body).name}` }) };
        },
    };
    const file = (name, size = 10) => ({ name, size, type: '', arrayBuffer: async () => new Uint8Array(size).buffer });
    assert.equal((await uploadFontFile(g, file('a.exe'))).ok, false);
    assert.equal((await uploadFontFile(g, file('a.ttf', 40 * 1024 * 1024))).ok, false);
    const ok = await uploadFontFile(g, file('圆圆体.woff2'));
    assert.equal(ok.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/files/upload');
    assert.equal(ok.font.label, '圆圆体');
    const controller = new AbortController();
    const offline = uploadFontFile({}, file('a.ttf'), { signal: controller.signal });
    controller.abort();
    assert.equal((await offline).cancelled, true);
});

test('gate:fonts:register-once-per-document-and-recover-without-render', async () => {
    const added = [];
    let fail = true;
    let loaded;
    const ready = new Promise(resolve => { loaded = resolve; });
    class FakeFace {
        constructor(family, src) { this.family = family; this.src = src; }
        load() { if (fail) return Promise.reject(new Error('temporary-network-error')); loaded(); return Promise.resolve(this); }
    }
    const doc = { defaultView: { FontFace: FakeFace }, fonts: { add: (f) => added.push(f), delete: () => {} } };
    const fonts = [{ id: 'a', label: 'A', family: 'IGSUserFont-A-a', path: '/user/files/igs-font-a.ttf', format: 'ttf' }];
    registerCustomFonts(doc, fonts);
    registerCustomFonts(doc, fonts);
    assert.equal(added.length, 0, '先完成读取，加载中不注册失败的 FontFace');
    await new Promise((r) => setTimeout(r, 0));
    fail = false;
    await ready;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(added.length, 1, '读取恢复后只注册成功的 FontFace，无需重绘');
    assert.equal(added[0].src, 'url("/user/files/igs-font-a.ttf")');
});

test('gate:assets:purge-asset-cache-clears-thumbnails', async () => {
    const thumbs = createMemoryAssetThumbStore();
    await thumbs.put('x', 'data:image/webp;base64,AA');
    await thumbs.clear();
    assert.equal(await thumbs.get('x'), '');
});
