import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_THEMED_DIALOG_SKINS } from '../src/visual/igs-ui/fx-battle-themes.js';
import { getDialogThemeTitleCardStyleText } from '../src/visual/igs-ui/fx-title-themes.js';
import { getDialogSkinStyleText } from '../src/visual/igs-ui/dialog-skin-style.js';
import { cameraGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';

test('gate:fx-title-themes:every-themed-skin-styles-the-scene-title-card', () => {
    for (const skin of BATTLE_THEMED_DIALOG_SKINS) {
        const css = getDialogThemeTitleCardStyleText(skin);
        assert.ok(css.includes(`#igs-overlay[data-igs-dialog-skin="${skin}"] .igs-fx-title-card:not(.is-ancient){`), skin);
        assert.doesNotMatch(css, /undefined|NaN/, skin);
        assert.ok(getDialogSkinStyleText(skin).includes('.igs-fx-title-card:not(.is-ancient)'), skin);
    }
    assert.equal(getDialogThemeTitleCardStyleText('default'), '');
    // 卡片皮肤收掉上下细线、改成居中实底卡片。
    assert.match(getDialogThemeTitleCardStyleText('warm-picturebook'), /::after\{display:none;\}/);
    assert.match(getDialogThemeTitleCardStyleText('qinglv-shanshui'), /#b23a2a/);
});

test('gate:fx-prompt:camera-grammar-only-when-ai-shots-on', () => {
    assert.deepEqual(cameraGrammarLines(undefined), []);
    assert.deepEqual(cameraGrammarLines({ enabled: false }), []);
    assert.deepEqual(cameraGrammarLines({ enabled: true, aiShots: false }), []);
    assert.match(cameraGrammarLines({ enabled: true })[0], /^cam\|镜头/);
});
