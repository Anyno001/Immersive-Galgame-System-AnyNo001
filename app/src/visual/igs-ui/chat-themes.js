import { DIALOG_FONT_SANS, getReferenceDialogTypography } from './dialog-theme-typography.js';

// 跟随对话框主题时，手机框、标题栏与未单独设色的气泡取主题配色；联系人自设颜色仍优先。
const palette = (shell, head, headInk, frame, sub, left, right, border = 'transparent') => Object.freeze({ shell, head, headInk, frame, sub, left, right, border });

export const CHAT_THEME_PALETTES = Object.freeze({
    default: palette('#ededed', '#f7f7f7', '#1f1f1f', '#1c1c1f', '#8a8a8a', '#ffffff', '#95ec69'),
    'western-classic': palette('#efe4cc', '#3b2a1c', '#f2e5c4', '#2e2218', '#8a7456', '#fbf3df', '#d8b979'),
    'elegant-european': palette('#f4efe6', '#2b2a3a', '#e8dcc2', '#1f1e2b', '#8b8577', '#ffffff', '#dccba8'),
    'gradient-veil': palette('#1d1d22', '#111114', '#eeeeee', '#000000', '#9a9aa6', '#34343d', '#4a6cf7'),
    'day-minimal': palette('#f5f7fa', '#ffffff', '#222222', '#d0d5dd', '#8b93a1', '#ffffff', '#cfe3ff'),
    'warm-picturebook': palette('#fbf1df', '#f3d9ae', '#5a3e2b', '#8a5a3b', '#9a7a5c', '#fffaf0', '#f6c98a'),
    'plant-coffee': palette('#f3ecdf', '#7f8a55', '#f6ecd9', '#5b4643', '#8d7b6f', '#fffaf2', '#c8d49a'),
    'black-white-manga': palette('#ffffff', '#171412', '#ffffff', '#171412', '#5e5750', '#ffffff', '#e6e6e6', '#171412'),
    'cute-pink': palette('#fff0f5', '#ffb6cf', '#ffffff', '#ff8fb4', '#c47f98', '#ffffff', '#ffc4d9'),
    'retro-japanese': palette('#f1e6d2', '#8e2c2c', '#f8eedc', '#3a2a22', '#8c7560', '#fffaf0', '#e6c9a1'),
    'adventure-journey': palette('#e9dfc7', '#4b5b3a', '#f3ead2', '#3b2f22', '#7e7258', '#fbf5e6', '#d8c38e'),
});

export function resolveChatTheme(dialogSkin) {
    const key = Object.hasOwn(CHAT_THEME_PALETTES, dialogSkin) ? dialogSkin : 'default';
    const typography = getReferenceDialogTypography(key) || {};
    return { key, ...CHAT_THEME_PALETTES[key], font: typography.textFont || DIALOG_FONT_SANS };
}
