import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { halo } from '../src/visual/igs-ui/dialog-skin-frame.js';
import { ILLUSTRATED_DIALOG_STYLE_TEXT } from '../src/visual/igs-ui/dialog-theme-skins.js';

// 正文与姓名只允许 1px 实描边和无模糊投影；带模糊半径的光晕会让字边发虚。
const BLURRED = /(?:^|,)\s*-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+[1-9]\d*(?:\.\d+)?px/;

function shadowsOf(selectorPart) {
    const rules = ILLUSTRATED_DIALOG_STYLE_TEXT.split('\n').filter((line) => line.includes(selectorPart));
    return rules.map((line) => (line.match(/text-shadow:([^;}]+)/) || [])[1]).filter(Boolean);
}

test('dialog-legibility:halo-is-solid-1px-stroke-without-blur', () => {
    const css = halo('#f5ead3', 5);
    assert.match(css, /^text-shadow:1px 0 0 #f5ead3,/);
    assert.doesNotMatch(css, /0 0 [1-9]\d*px/);
});

test('dialog-legibility:sliced-and-css-skin-text-has-no-blurred-glow', () => {
    for (const part of ['.igs-text{', '.igs-speaker{']) {
        const shadows = shadowsOf(part);
        assert.ok(shadows.length > 0, part);
        for (const shadow of shadows) {
            const value = shadow.replace(/calc\([^)]*\)/g, '1px');
            assert.doesNotMatch(value, BLURRED, `${part} ${shadow}`);
        }
    }
});

test('dialog-legibility:retro-japanese-body-text-is-darker', () => {
    const typo = readFileSync(new URL('../src/visual/igs-ui/dialog-theme-typography.js', import.meta.url), 'utf8');
    assert.match(typo, /'retro-japanese': Object\.freeze\(\{[^}]*textColor: '#2f2119'/);
});

test('dialog-legibility:shaped-dialogs-show-only-one-height-option', () => {
    const host = readFileSync(new URL('../src/visual/igs-ui/settings-host-render.js', import.meta.url), 'utf8');
    assert.match(host, /dialogHeightField: classicDialog \|\| illustratedDialog \? '' : field\('readerSettings\.dialogHeight'/);
    assert.match(host, /skinDialogScaleField: classicDialog \|\| illustratedDialog \? field\('readerSettings\.skinDialogScale', '对话框高度'/);
});
