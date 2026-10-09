import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDialogSkin } from '../src/visual/igs-ui/classic-dialog-skin.js';
import { dialogSkinLabel } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import { getDialogSkinStyleText } from '../src/visual/igs-ui/dialog-skin-style.js';
import { getReferenceDialogTypography } from '../src/visual/igs-ui/dialog-theme-typography.js';
import { CHAT_THEME_PALETTES } from '../src/visual/igs-ui/chat-themes.js';
import { CLICK_WAIT_MARK_GLYPHS, CLICK_WAIT_MARK_LABELS, CLICK_WAIT_MARK_SKINS } from '../src/visual/igs-ui/click-wait-mark.js';
import { resolveUiSfxFamily } from '../src/visual/igs-ui/ui-sfx.js';
import { sceneDialogSkin } from '../src/visual/igs-ui/worldview-skins.js';
import { normalizeReaderSettings } from '../src/visual/igs-ui/settings-host-normalize.js';

const SKIN = 'mermaid-deep';

test('gate:dialog-skin-mermaid is a built-in skin with frame, options, hud, items, battle and title styles', () => {
    assert.equal(normalizeDialogSkin(SKIN), SKIN);
    assert.equal(dialogSkinLabel(SKIN), '深海人鱼');
    const css = getDialogSkinStyleText(SKIN);
    assert.ok(css.includes(`#igs-overlay .igs-dialog[data-igs-dialog-skin="${SKIN}"]{`));
    assert.ok(css.includes(`#igs-overlay[data-igs-dialog-skin="${SKIN}"]{--igs-skin-plate-rise:`));
    assert.ok(css.includes(`#igs-overlay[data-igs-dialog-skin="${SKIN}"] .igs-option-bubble{`));
    assert.ok(css.includes(`#igs-overlay[data-igs-dialog-skin="${SKIN}"] .igs-option-bubble:hover{`));
    const hud = `#igs-overlay[data-igs-dialog-skin="${SKIN}"] #igs-status-hud`;
    for (const part of ['.igs-hud-bg-dialog{', ' .igs-hud-emotion{', ' .igs-hud-avatar{', ' .igs-hud-track{', ' .igs-hud-fill{']) assert.ok(css.includes(`${hud}${part}`), part);
    assert.match(css, /mermaid-deep[^\n]*igs-fx-title-main::before/);
    assert.ok(!/magic-academy/.test(css), 'does not leak the starry-night skin');
    // 闪光只动透明度，舞台暂停与减少动态时静止。
    assert.match(css, /mermaid-deep"\]::before\{[^}]*animation:igs-mm-glint/);
    assert.match(css, /@keyframes igs-mm-glint\{0%\{opacity:[^}]*\}/);
    assert.match(css, /data-igs-paused\] \.igs-dialog\[data-igs-dialog-skin="mermaid-deep"\]::before\{animation-play-state:paused/);
    assert.equal(getReferenceDialogTypography(SKIN).nameColor, '#f4f8ff');
    assert.ok(CHAT_THEME_PALETTES[SKIN]);
    assert.equal(CLICK_WAIT_MARK_SKINS[SKIN].shape, 'bubbles');
    assert.ok(CLICK_WAIT_MARK_GLYPHS.includes('bubbles') && CLICK_WAIT_MARK_LABELS.bubbles);
    assert.equal(resolveUiSfxFamily(SKIN), 'glass');
});

test('gate:dialog-skin-mermaid switches in automatically underwater and can be turned off', () => {
    assert.equal(normalizeReaderSettings({}).underwaterSkin, true);
    assert.equal(normalizeReaderSettings({ underwaterSkin: false }).underwaterSkin, false);
    for (const worldview of ['', 'ancient', 'magic', 'horror']) {
        assert.equal(sceneDialogSkin({ dialogSkin: 'gradient-veil', _worldview: worldview }, '人鱼王国').dialogSkin, SKIN, worldview);
    }
    assert.equal(sceneDialogSkin({ dialogSkin: 'gradient-veil' }, '海滩').dialogSkin, 'gradient-veil');
    assert.equal(sceneDialogSkin({ dialogSkin: 'gradient-veil' }, '深海潜艇').dialogSkin, 'gradient-veil');
    assert.equal(sceneDialogSkin({ dialogSkin: 'qinglv-shanshui', underwaterSkin: false }, '海底').dialogSkin, 'qinglv-shanshui');
});

test('gate:dialog-skin-mermaid tones: presets, custom pearl color and settings defaults', async () => {
    const { MERMAID_TONES, mermaidToneVars, normalizeMermaidTone } = await import('../src/visual/igs-ui/dialog-theme-mermaid.js');
    assert.deepEqual(MERMAID_TONES.map((tone) => tone.id), ['ocean', 'lagoon', 'moon', 'coral', 'custom']);
    assert.equal(normalizeMermaidTone('nope'), 'ocean');
    assert.equal(mermaidToneVars('ocean')['--igs-mm-veil'], '#0a2148');
    const custom = mermaidToneVars('custom', '#FF8800');
    assert.equal(custom['--igs-mm-line'], '#ff8800');
    assert.equal(custom['--igs-mm-hi'], '#ffc480');
    assert.equal(mermaidToneVars('custom', 'bad')['--igs-mm-line'], '#c8dcf6');
    const settings = normalizeReaderSettings({ mermaidTone: 'moon' });
    assert.equal(settings.mermaidTone, 'moon');
    assert.equal(normalizeReaderSettings({}).mermaidTone, 'ocean');
    // 颜色全走变量，换配色不必重新注入样式。
    const css = getDialogSkinStyleText(SKIN);
    assert.match(css, /var\(--igs-mm-veil,#0a2148\)/);
    assert.match(css, /var\(--igs-mm-line,#c8dcf6\)/);
});
