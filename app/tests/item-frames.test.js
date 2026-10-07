import assert from 'node:assert/strict';
import test from 'node:test';
import { getDialogThemeItemFrameStyleText, ITEM_FRAME_SKINS } from '../src/visual/igs-ui/dialog-theme-item-frames.js';
import { getDialogSkinStyleText } from '../src/visual/igs-ui/dialog-skin-style.js';
import { ILLUSTRATED_DIALOG_SKINS } from '../src/visual/igs-ui/dialog-theme-skins.js';

const ALL_SKINS = ['default', 'western-classic', 'gradient-veil', ...ILLUSTRATED_DIALOG_SKINS];

function balanced(css) {
    const pairs = { '{': '}', '(': ')', '[': ']' };
    const stack = [];
    let quote = '';
    for (const ch of css) {
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (pairs[ch]) stack.push(pairs[ch]);
        else if (ch === '}' || ch === ')' || ch === ']') { if (stack.pop() !== ch) return false; }
    }
    return stack.length === 0 && !quote;
}

test('gate: 每个对话框皮肤都有物品卡片框，且带点亮物品名颜色变量', () => {
    for (const skin of ALL_SKINS) {
        const css = getDialogThemeItemFrameStyleText(skin);
        assert.ok(css.length > 200, `${skin} 没有物品卡片框`);
        assert.match(css, /--igs-item-mention-color:#[0-9a-f]{6};/i, `${skin} 缺 --igs-item-mention-color`);
        assert.match(css, /\.igs-fx-item-card/);
        assert.ok(ITEM_FRAME_SKINS.includes(skin));
    }
    assert.equal(ITEM_FRAME_SKINS.length, 18);
});

test('gate: 未知皮肤返回空，皮肤样式总入口带上框', () => {
    assert.equal(getDialogThemeItemFrameStyleText('no-such-skin'), '');
    assert.equal(getDialogThemeItemFrameStyleText(''), '');
    for (const skin of ALL_SKINS) assert.ok(getDialogSkinStyleText(skin).includes('--igs-item-mention-color'), skin);
    assert.ok(getDialogSkinStyleText('').includes('#igs-overlay:not([data-igs-dialog-skin]) .igs-fx-item-card'));
});

test('gate: 物品卡片框 CSS 括号配平，三种动作与稀有都有区分', () => {
    for (const skin of ALL_SKINS) {
        const css = getDialogThemeItemFrameStyleText(skin);
        assert.ok(balanced(css), `${skin} 括号不配平`);
        assert.match(css, /data-igs-item-action="lose"/);
        assert.match(css, /data-igs-item-action="use"/);
        assert.match(css, /data-igs-item-rare/);
    }
});
