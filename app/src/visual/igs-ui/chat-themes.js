import { DIALOG_FONT_SANS, getReferenceDialogTypography } from './dialog-theme-typography.js';
import { dlcBorrowSkin } from './dlc-skin-registry.js';

// 跟随对话框主题时，手机框、标题栏与未单独设色的气泡取主题配色；联系人自设颜色仍优先。
const palette = (shell, head, headInk, frame, sub, left, right, border = 'transparent') => Object.freeze({ shell, head, headInk, frame, sub, left, right, border });

export const CHAT_THEME_PALETTES = Object.freeze({
    default: palette('#ededed', '#f7f7f7', '#1f1f1f', '#1c1c1f', '#8a8a8a', '#ffffff', '#95ec69'),
    'western-classic': palette('#efe4cc', '#3b2a1c', '#f2e5c4', '#2e2218', '#8a7456', '#fbf3df', '#d8b979'),
    'magic-academy': palette('#141a3a', '#1c2248', '#f3e2b6', '#0c0f26', '#a99b78', '#f1e3c0', '#d9b45a', 'rgba(217,180,90,.6)'),
    'mermaid-deep': palette('#0b1a33', '#102446', '#e6effb', '#050d1c', '#8296b4', '#eaf1fb', '#a9c6f0', 'rgba(169,198,240,.55)'),
    'horror-gore': palette('#141010', '#0a0a0a', '#f3ece4', '#0a0a0a', '#8a8280', '#f3ece4', '#e8636a', 'rgba(209,18,27,.6)'),
    'horror-psych': palette('#fdf3f8', '#f8dbe8', '#6b4a5c', '#e0779d', '#a48c99', '#ffffff', '#f4c3d6', 'rgba(244,163,192,.5)'),
    'fairy-tale': palette('#f6f1e2', '#e9e6cf', '#4a4034', '#5e5444', '#9a9380', '#fffcf3', '#d9e3bf', 'rgba(122,138,82,.3)'),
    'qinglv-shanshui': palette('#f1ede2', '#e8e3d5', '#26332f', '#2b3532', '#8c958f', '#fbf9f3', '#cfe0d6', 'rgba(47,93,124,.3)'),
    'xianxia-ink': palette('#f0ece3', '#e6e1d4', '#1f2523', '#2a302e', '#8b938d', '#faf8f2', '#d4dcd8', 'rgba(95,127,134,.3)'),
    'elegant-european': palette('#f4efe6', '#2b2a3a', '#e8dcc2', '#1f1e2b', '#8b8577', '#ffffff', '#dccba8'),
    'gradient-veil': palette('#1d1d22', '#111114', '#eeeeee', '#000000', '#9a9aa6', '#34343d', '#4a6cf7'),
    'day-minimal': palette('#f5f7fa', '#ffffff', '#222222', '#d0d5dd', '#8b93a1', '#ffffff', '#cfe3ff'),
    'warm-picturebook': palette('#fbf1df', '#f3d9ae', '#5a3e2b', '#8a5a3b', '#9a7a5c', '#fffaf0', '#f6c98a'),
    'plant-coffee': palette('#f3ecdf', '#7f8a55', '#f6ecd9', '#5b4643', '#8d7b6f', '#fffaf2', '#c8d49a'),
    'black-white-manga': palette('#ffffff', '#171412', '#ffffff', '#171412', '#5e5750', '#ffffff', '#e6e6e6', '#171412'),
    'cute-pink': palette('#fff0f5', '#ffb6cf', '#ffffff', '#ff8fb4', '#c47f98', '#ffffff', '#ffc4d9'),
    'retro-japanese': palette('#f1e6d2', '#8e2c2c', '#f8eedc', '#3a2a22', '#8c7560', '#fffaf0', '#e6c9a1'),
    'adventure-journey': palette('#e9dfc7', '#4b5b3a', '#f3ead2', '#3b2f22', '#7e7258', '#fbf5e6', '#d8c38e'),
    'scifi-holo': palette('#0b1424', '#0f1d33', '#bff4ff', '#060e1c', '#7d93aa', '#e6f7fc', '#9fe8f5', 'rgba(95,227,255,.4)'),
    'wasteland-rust': palette('#2a2722', '#3b372f', '#ece3cf', '#1b1915', '#8f826b', '#ece3cf', '#e3ae2f', 'rgba(150,72,30,.5)'),
});

export function resolveChatTheme(dialogSkin) {
    const borrow = dlcBorrowSkin(dialogSkin);
    const key = Object.hasOwn(CHAT_THEME_PALETTES, borrow) ? borrow : 'default';
    const typography = getReferenceDialogTypography(dialogSkin) || getReferenceDialogTypography(key) || {};
    return { key, ...CHAT_THEME_PALETTES[key], font: typography.textFont || DIALOG_FONT_SANS };
}
