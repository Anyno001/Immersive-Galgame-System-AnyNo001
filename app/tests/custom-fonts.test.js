import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
import { DIALOG_FONT_CHILL_ROUND } from '../src/visual/igs-ui/dialog-theme-typography.js';
import { isGlobalSettingKey } from '../src/storage/tavern-settings-file.js';
import { renderCustomFontManager } from '../src/visual/igs-ui/settings-fields.js';
import { createMemoryAssetThumbStore } from '../src/media/asset-thumb-store.js';

const appRoot = path.resolve(import.meta.dirname, '..');

function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('gate:fonts:chill-round-bundled-with-license-and-slices', () => {
    assert.ok(DIALOG_FONT_OPTIONS.some(([stack, label]) => stack === DIALOG_FONT_CHILL_ROUND && label === '寒蝉全圆体'));
    const build = fs.readFileSync(path.join(appRoot, 'scripts', 'build.js'), 'utf8');
    for (const file of ['ChillRoundFRegular.otf', 'ChillRoundFBold.otf', 'ChillRoundF-OFL.txt']) {
        assert.ok(build.includes(file), `build.js 登记 ${file}`);
        assert.ok(fs.existsSync(path.join(appRoot, 'src', 'visual', 'igs-ui', 'assets', 'fonts', file)), `${file} 在源码字体目录`);
    }
    for (const name of ['ChillRoundFRegular', 'ChillRoundFBold']) {
        assert.ok(fs.existsSync(path.join(appRoot, 'src', 'visual', 'igs-ui', 'assets', 'font-slices', `${name}.json`)), `${name} 已切片`);
    }
});

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
    assert.match(html, /data-action="custom-font-upload"/);
    assert.match(html, /data-action="custom-font-remove:a1"/);
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
    assert.match(calls[0].body.name, /^igs-font-[a-z0-9]+\.woff2$/);
    assert.match(ok.font.path, /^\/user\/files\/igs-font-/);
    assert.equal(ok.font.label, '圆圆体');
    assert.match(ok.font.family, /^IGSUserFont-/);
    const offline = await uploadFontFile({}, file('a.ttf'));
    assert.equal(offline.ok, false);
});

test('gate:fonts:register-once-per-document-and-retry-on-failure', async () => {
    const added = [];
    let fail = true;
    class FakeFace {
        constructor(family, src) { this.family = family; this.src = src; }
        load() { return fail ? Promise.reject(new Error('404')) : Promise.resolve(this); }
    }
    const doc = { defaultView: { FontFace: FakeFace }, fonts: { add: (f) => added.push(f), delete: () => {} } };
    const fonts = [{ id: 'a', label: 'A', family: 'IGSUserFont-A-a', path: '/user/files/igs-font-a.ttf', format: 'ttf' }];
    registerCustomFonts(doc, fonts);
    registerCustomFonts(doc, fonts);
    assert.equal(added.length, 1, '加载中不重复注册');
    await new Promise((r) => setTimeout(r, 0));
    fail = false;
    registerCustomFonts(doc, fonts);
    assert.equal(added.length, 2, '加载失败后下次重试');
    assert.equal(added[1].src, 'url("/user/files/igs-font-a.ttf")');
});

test('gate:assets:purge-asset-cache-clears-thumbnails', async () => {
    const thumbs = createMemoryAssetThumbStore();
    await thumbs.put('x', 'data:image/webp;base64,AA');
    await thumbs.clear();
    assert.equal(await thumbs.get('x'), '');
    const actions = fs.readFileSync(path.join(appRoot, 'src', 'visual', 'igs-ui', 'settings-actions.js'), 'utf8');
    assert.match(actions, /'purge-asset-cache'/);
    const tabs = fs.readFileSync(path.join(appRoot, 'src', 'visual', 'igs-ui', 'settings-tabs.js'), 'utf8');
    assert.match(tabs, /data-action="purge-asset-cache"[^>]*>清除素材缓存</);
});
