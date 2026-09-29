import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DIALOG_FONT_SERIF,
    DIALOG_FONT_WENKAI,
    DIALOG_FONT_YOZAI,
    DIALOG_TYPESETTING_STYLE_TEXT,
    getReferenceDialogTypography,
    preloadDialogFonts,
    primaryFontFamily,
    resolveDialogFontMetrics,
} from '../src/visual/igs-ui/dialog-theme-typography.js';

test('gate: dialog font metrics follow the primary family of the stack', () => {
    assert.equal(primaryFontFamily(DIALOG_FONT_WENKAI), 'LXGW WenKai');
    assert.equal(primaryFontFamily('inherit'), '');
    assert.deepEqual(resolveDialogFontMetrics(DIALOG_FONT_YOZAI), { scale: 1.07, leading: 1.06 });
    assert.deepEqual(resolveDialogFontMetrics('inherit'), { scale: 1, leading: 1 });
    assert.deepEqual(resolveDialogFontMetrics('"Unknown Font",serif'), { scale: 1, leading: 1 });
    for (const skin of ['plant-coffee', 'cute-pink', 'retro-japanese', 'warm-picturebook']) {
        const metrics = resolveDialogFontMetrics(getReferenceDialogTypography(skin).textFont);
        assert.ok(metrics.scale > 1 && metrics.scale < 1.1, skin);
    }
});

test('gate: dialog fonts preload once per family and skip generics', async () => {
    const calls = [];
    const doc = { fonts: { load: (font) => { calls.push(font); return Promise.resolve([]); } } };
    preloadDialogFonts(doc, [DIALOG_FONT_SERIF, DIALOG_FONT_SERIF, 'inherit', 'serif', '"IGS Test Family",serif']);
    preloadDialogFonts(doc, ['"IGS Test Family",serif']);
    assert.deepEqual(calls, ['16px "Source Han Serif CN"', '16px "IGS Test Family"']);
    preloadDialogFonts({}, [DIALOG_FONT_SERIF]);
    const failing = { fonts: { load: () => Promise.reject(new Error('404')) } };
    preloadDialogFonts(failing, ['"IGS Missing Family"']);
    await new Promise(resolve => setTimeout(resolve, 0));
    preloadDialogFonts(doc, ['"IGS Missing Family"']);
    assert.equal(calls.at(-1), '16px "IGS Missing Family"');
});

test('gate: dialog typesetting css is scoped to reader text', () => {
    assert.match(DIALOG_TYPESETTING_STYLE_TEXT, /#igs-overlay #igs-text\{[^}]*line-break:strict/);
    assert.match(DIALOG_TYPESETTING_STYLE_TEXT, /text-autospace:normal/);
});
