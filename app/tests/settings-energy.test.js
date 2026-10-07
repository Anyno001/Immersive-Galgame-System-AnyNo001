import test from 'node:test';
import assert from 'node:assert/strict';
import { getSettingsStyleText } from '../src/visual/igs-ui/settings-style.js';
import { bootstrapIGS } from '../src/index.js';

function memoryStorage(seed = {}) {
    const m = new Map(Object.entries(seed));
    return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// 遮罩铺满全屏：模糊半径减半，水波纹只在触屏上铺且不再循环动画；省电画质和系统要求减少透明度时换实心底。
test('settings-energy: 遮罩模糊减半、水波纹静止、省电画质换实心底', () => {
    const css = getSettingsStyleText();
    assert.match(css, /#igs-unified-settings\{[^}]*-webkit-backdrop-filter:blur\(14px\) saturate\(150%\);backdrop-filter:blur\(14px\) saturate\(150%\)\}/);
    assert.doesNotMatch(css, /blur\(28px\)/);
    assert.ok(css.includes('#igs-unified-settings::before{animation:none;will-change:auto}'));
    assert.doesNotMatch(css, /@keyframes igs-ui-liquid/, '设置器里不再需要水波纹动画的关键帧');
    assert.match(css, /#igs-unified-settings\[data-igs-quality="low"\]\{-webkit-backdrop-filter:none;backdrop-filter:none;background:/);
    assert.match(css, /#igs-unified-settings\[data-igs-settings-theme="dark"\]\[data-igs-quality="low"\]\{background:/);
    assert.ok(css.includes('#igs-unified-settings[data-igs-quality="low"]::before{content:none}'));
});

test('settings-energy: 阅读器选了省电画质时，设置器根节点带上 data-igs-quality="low"', () => {
    const open = (quality) => {
        const storage = memoryStorage({ 'igs-reader-settings-v9-default': JSON.stringify({ performance: { quality } }) });
        const vn = bootstrapIGS({ global: { localStorage: storage }, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
        try {
            return vn.openSettings({ tab: 'basic', mode: 'pc' }).controller.getSnapshot().html;
        } finally {
            vn.destroy();
        }
    };
    assert.match(open('low'), /<div id="igs-unified-settings"[^>]* data-igs-quality="low">/);
    assert.doesNotMatch(open('normal'), /data-igs-quality=/);
});
