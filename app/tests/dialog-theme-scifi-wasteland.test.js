import test from 'node:test';
import assert from 'node:assert/strict';
import { DIALOG_SKIN_SCIFI_HOLO } from '../src/visual/igs-ui/dialog-theme-scifi.js';
import { DIALOG_SKIN_WASTELAND_RUST } from '../src/visual/igs-ui/dialog-theme-wasteland.js';
import { ILLUSTRATED_DIALOG_SKINS, normalizeDialogSkin } from '../src/visual/igs-ui/classic-dialog-skin.js';
import { getDialogSkinStyleText } from '../src/visual/igs-ui/dialog-skin-style.js';
import { dialogSkinLabel } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import { worldviewDialogSkins } from '../src/visual/igs-ui/worldview-skins.js';
import { getReferenceDialogTypography } from '../src/visual/igs-ui/dialog-theme-typography.js';
import { getBattleTheme } from '../src/visual/igs-ui/fx-battle-themes.js';
import { CHAT_THEME_PALETTES, resolveChatTheme } from '../src/visual/igs-ui/chat-themes.js';
import { CLICK_WAIT_MARK_SKINS, CLICK_WAIT_MARK_STYLE_TEXT } from '../src/visual/igs-ui/click-wait-mark.js';
import { ITEM_FRAME_SKINS } from '../src/visual/igs-ui/dialog-theme-item-frames.js';
import { resolveUiSfxFamily } from '../src/visual/igs-ui/ui-sfx.js';

const SKINS = [
    { id: DIALOG_SKIN_SCIFI_HOLO, label: '全息投影', worldview: 'scifi', mark: 'reticle', sfx: 'digital' },
    { id: DIALOG_SKIN_WASTELAND_RUST, label: '废土锈铁', worldview: 'apocalypse', mark: 'hazard', sfx: 'metal' },
];

test('gate:igs-ui:scifi-and-wasteland-skins-fill-every-skin-table', () => {
    for (const skin of SKINS) {
        const { id } = skin;
        assert.equal(normalizeDialogSkin(id), id);
        assert.ok(ILLUSTRATED_DIALOG_SKINS.includes(id), id);
        assert.equal(dialogSkinLabel(id), skin.label);
        assert.equal(worldviewDialogSkins(skin.worldview)[0], id, `${skin.worldview} 默认用 ${id}`);
        assert.ok(getReferenceDialogTypography(id), `${id} typography`);
        assert.ok(getBattleTheme(id), `${id} battle theme`);
        assert.ok(Object.hasOwn(CHAT_THEME_PALETTES, id) && resolveChatTheme(id).key === id, `${id} chat`);
        assert.equal(CLICK_WAIT_MARK_SKINS[id].shape, skin.mark);
        assert.ok(CLICK_WAIT_MARK_STYLE_TEXT.includes(`#igs-overlay[data-igs-dialog-skin="${id}"]{--igs-cw-mask:`), `${id} click mark`);
        assert.ok(ITEM_FRAME_SKINS.includes(id), `${id} item frame`);
        assert.equal(resolveUiSfxFamily(id), skin.sfx);
    }
});

test('gate:igs-ui:scifi-and-wasteland-skin-css-is-self-contained', () => {
    for (const { id } of SKINS) {
        const css = getDialogSkinStyleText(id, { base: 'https://cdn.example/dist/skins/' });
        const overlay = `#igs-overlay[data-igs-dialog-skin="${id}"]`;
        assert.ok(css.includes(`#igs-overlay .igs-dialog[data-igs-dialog-skin="${id}"]{`), `${id} frame`);
        assert.ok(css.includes(`${overlay} .igs-option-bubble{`) && css.includes(`${overlay} .igs-option-bubble:hover{`), `${id} choice`);
        assert.ok(css.includes(`${overlay} #igs-status-hud .igs-hud-emotion{`), `${id} hud`);
        assert.ok(css.includes(`${overlay} .igs-fx-item-card{`), `${id} item card`);
        assert.ok(css.includes(`${overlay} .igs-fx-title-card`), `${id} title card`);
        assert.match(css, /@media \(max-width:640px\)\{/, `${id} 窄屏规则`);
        // 纯 CSS 皮肤：不引用外置素材，也不在对话框上开毛玻璃。
        assert.ok(!css.includes('__IGS_ASSET__') && !css.includes('https://cdn.example/dist/skins/'), `${id} 不引用素材`);
        const frame = css.split('\n').find((line) => line.startsWith(`#igs-overlay .igs-dialog[data-igs-dialog-skin="${id}"]{`));
        assert.match(frame, /backdrop-filter:none/, `${id} 对话框不开毛玻璃`);
        for (const other of SKINS) {
            if (other.id !== id) assert.ok(!css.includes(`data-igs-dialog-skin="${other.id}"`), `${id} leaks ${other.id}`);
        }
    }
});
