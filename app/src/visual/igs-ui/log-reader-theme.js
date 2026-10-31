import { normalizeDialogSkin } from './classic-dialog-skin.js';
import { dlcBorrowSkin, isDlcSkinId } from './dlc-skin-registry.js';
import { getReferenceDialogTypography } from './dialog-theme-typography.js';

// 窄屏阅读模式逐皮肤配色：veil 渐变底色、ink 台词、narr 旁白、thought 心里话、sub 次要字、line 分割线、plate 头像底板与胶囊底。
// 全部实色；深色底用近黑，不用棕。强调色（旁白段首符号、批末符号）取句末等待符号的 --igs-cw-color。
export const LOG_READER_THEMES = Object.freeze({
    'gradient-veil': { tone: 'dark', veil: '#121214', ink: '#f4f1f6', narr: '#d9d3e0', thought: '#c9bfe0', sub: '#a9a3b2', line: '#34323a', plate: '#26242b' },
    default: { tone: 'dark', veil: '#1c1c1e', ink: '#f2f2f4', narr: '#d6d6db', thought: '#c4cbe0', sub: '#9e9ea6', line: '#38383c', plate: '#2c2c2f' },
    'western-classic': { tone: 'dark', veil: '#121212', ink: '#f2e5c4', narr: '#ddd3b8', thought: '#c9b98f', sub: '#a39a86', line: '#33302a', plate: '#24221e' },
    'elegant-european': { tone: 'dark', veil: '#1f1e2b', ink: '#eeeaf3', narr: '#d4cfdc', thought: '#c3b4e6', sub: '#a29fb3', line: '#3a3850', plate: '#2c2a3e' },
    // 魔法星夜两套：星银（默认与各学院色）用靛蓝夜空，墨夜用微冷近黑。
    'magic-academy': { tone: 'dark', veil: '#16173a', ink: '#ecebf7', narr: '#c9c7dd', thought: '#b8c3ff', sub: '#9a9cc4', line: '#2c2e5a', plate: '#212350' },
    'magic-academy-obsidian': { tone: 'dark', veil: '#121319', ink: '#ecebf5', narr: '#cbc9d8', thought: '#c9c0e8', sub: '#9d9cb0', line: '#2b2c3a', plate: '#20212c' },
    'mermaid-deep': { tone: 'dark', veil: '#0b1a33', ink: '#eaf1fb', narr: '#c2cde0', thought: '#b6cdf4', sub: '#8fa3c2', line: '#1f3558', plate: '#142844' },
    'xianxia-ink': { tone: 'dark', veil: '#121212', ink: '#eae2d1', narr: '#c4bcae', thought: '#9fc0c8', sub: '#9a958c', line: '#33322f', plate: '#242423' },
    'wuxia-ink': { tone: 'dark', veil: '#121212', ink: '#ece7dd', narr: '#c7c1b6', thought: '#a39e95', sub: '#98948c', line: '#33322f', plate: '#242423' },
    'scifi-holo': { tone: 'dark', veil: '#0b1424', ink: '#e2f6ff', narr: '#a3b8cc', thought: '#8fdcf0', sub: '#7f97ad', line: '#1d3048', plate: '#132238' },
    'wasteland-rust': { tone: 'dark', veil: '#1c1c1e', ink: '#ece3cf', narr: '#b9ad94', thought: '#e3ae2f', sub: '#9a9488', line: '#38383a', plate: '#2c2c2e' },
    'horror-gore': { tone: 'dark', veil: '#121212', ink: '#f3ece4', narr: '#b3aaa4', thought: '#ff5a62', sub: '#948d88', line: '#332e2e', plate: '#242121' },
    'retro-japanese': { tone: 'light', veil: '#f1e6d2', ink: '#2f2119', narr: '#6b5645', thought: '#2f6e58', sub: '#9a8a76', line: '#ddd0b8', plate: '#e6d9c0' },
    'qinglv-shanshui': { tone: 'light', veil: '#f1ede2', ink: '#26332f', narr: '#56625d', thought: '#2f5d7c', sub: '#8c958f', line: '#d6d9cc', plate: '#dfe6dc' },
    'adventure-journey': { tone: 'light', veil: '#e9dfc7', ink: '#45372d', narr: '#6c5b4d', thought: '#9a6a2c', sub: '#94866f', line: '#d5c8a8', plate: '#ded2b6' },
    'plant-coffee': { tone: 'light', veil: '#f3ecdf', ink: '#5b4643', narr: '#7a6660', thought: '#7f8a55', sub: '#a0908a', line: '#e0d5c4', plate: '#e8dfcf' },
    'warm-picturebook': { tone: 'light', veil: '#fbf1df', ink: '#4f4a45', narr: '#706861', thought: '#4f9a92', sub: '#9c938a', line: '#ecdcc0', plate: '#f2e4ca' },
    'fairy-tale': { tone: 'light', veil: '#f6f1e2', ink: '#4a4034', narr: '#776c5c', thought: '#6f8250', sub: '#9a9380', line: '#e0d8c0', plate: '#e9e6cf' },
    'day-minimal': { tone: 'light', veil: '#f5f7fa', ink: '#3a3935', narr: '#5f5d55', thought: '#b0503f', sub: '#93918a', line: '#e1e4ea', plate: '#e8ebf0' },
    'black-white-manga': { tone: 'light', veil: '#ffffff', ink: '#231f1c', narr: '#2f2925', thought: '#5e5750', sub: '#8a847e', line: '#dedad6', plate: '#eeebe8' },
    'cute-pink': { tone: 'light', veil: '#fff0f5', ink: '#5d3a4a', narr: '#7d6070', thought: '#c65f86', sub: '#c47f98', line: '#f5cddc', plate: '#ffd9e6' },
    'horror-psych': { tone: 'light', veil: '#fdf3f8', ink: '#6b4a5c', narr: '#8f7a86', thought: '#8c72c4', sub: '#a8939f', line: '#efdde6', plate: '#f4e4ec' },
});

function luminance(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

// 皮肤 → 配色表的键。DLC 借用内置皮肤；借不到时按正文亮度判断深浅（浅字配深底）。
export function resolveLogSkin(skinId) {
    const skin = normalizeDialogSkin(skinId);
    if (Object.hasOwn(LOG_READER_THEMES, skin)) return skin;
    if (isDlcSkinId(skin)) {
        const borrowed = dlcBorrowSkin(skin);
        if (borrowed && Object.hasOwn(LOG_READER_THEMES, borrowed)) return borrowed;
        const text = (getReferenceDialogTypography(skin) || {}).textColor;
        if (text) return luminance(text) > 0.5 ? 'gradient-veil' : 'day-minimal';
    }
    return 'gradient-veil';
}

function rgbOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function logThemeStyleText() {
    return Object.entries(LOG_READER_THEMES).map(([id, t]) => `#igs-overlay[data-igs-log-skin="${id}"]{--igs-log-veil:${rgbOf(t.veil)};--igs-log-ink:${t.ink};--igs-log-narr:${t.narr};--igs-log-thought:${t.thought};--igs-log-sub:${t.sub};--igs-log-line:${t.line};--igs-log-plate:${t.plate};}`).join('');
}
