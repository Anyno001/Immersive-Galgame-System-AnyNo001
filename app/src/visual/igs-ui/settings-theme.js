import { IGS_UI_EDGE_DAY, IGS_UI_EDGE_NIGHT, IGS_UI_THICKNESS, igsUiSurface } from '../../styles/ui-material.js';

// swatch 是头部色板按钮的预览色：底色取面板本身，点取该主题的高亮色，由 SVG 绘制。
export const SETTINGS_THEME_OPTIONS = Object.freeze([
    Object.freeze({ value: 'cream', label: '奶油风', scheme: 'light', swatch: Object.freeze({ base: '#f7f0e6', accent: '#85a76a' }) }),
    Object.freeze({ value: 'light', label: '浅色', scheme: 'light', swatch: Object.freeze({ base: '#fbfaf6', accent: '#11110f' }) }),
    Object.freeze({ value: 'landmine', label: '地雷色', scheme: 'dark', swatch: Object.freeze({ base: '#2b2b2b', accent: '#ffc4d4' }) }),
    Object.freeze({ value: 'dark', label: '深色', scheme: 'dark', swatch: Object.freeze({ base: '#24292e', accent: '#7fd6ca' }) }),
]);

export const DEFAULT_SETTINGS_THEME = 'cream';

const SETTINGS_THEME_VALUES = new Set(SETTINGS_THEME_OPTIONS.map((theme) => theme.value));
const SETTINGS_THEME_LEGACY_VALUES = Object.freeze({
    night: 'landmine',
    day: 'cream',
});

export function normalizeSettingsTheme(theme) {
    const raw = String(theme || '').trim();
    if (SETTINGS_THEME_LEGACY_VALUES[raw]) return SETTINGS_THEME_LEGACY_VALUES[raw];
    return SETTINGS_THEME_VALUES.has(raw) ? raw : DEFAULT_SETTINGS_THEME;
}

export function getNextSettingsTheme(theme) {
    const current = normalizeSettingsTheme(theme);
    const index = SETTINGS_THEME_OPTIONS.findIndex((option) => option.value === current);
    return SETTINGS_THEME_OPTIONS[(index + 1) % SETTINGS_THEME_OPTIONS.length].value;
}

function renderSettingsThemeSwatch({ base, accent }) {
    return `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x=".5" y=".5" width="19" height="19" rx="4" fill="${base}" stroke="rgba(128,128,128,.34)"/><rect x="10.5" y="10.5" width="6" height="6" rx="1.5" fill="${accent}"/></svg>`;
}

// 资料页复用同一组色板按钮，只换 class 与点击属性。
export function renderSettingsThemeSwitch(theme, { optionClass = 'igs-settings-theme-option', attrs = (value) => `data-action="set-settings-theme:${value}"` } = {}) {
    const current = normalizeSettingsTheme(theme);
    return SETTINGS_THEME_OPTIONS.map((option) => {
        const active = option.value === current;
        return `<button type="button" class="${optionClass}${active ? ' is-active' : ''}" ${attrs(option.value)} data-theme="${option.value}" role="radio" aria-checked="${active}" aria-label="${option.label}" title="${option.label}">${renderSettingsThemeSwatch(option.swatch)}</button>`;
    }).join('');
}

// 四套界面配色的唯一来源：设置器与资料页都从这里生成 CSS 变量。
// backdrop 是全屏遮罩底色（贴近面板本身，只靠阴影分层），solid 是不支持模糊/减少透明度时的回退。
const SETTINGS_THEME_PALETTES = Object.freeze({
    landmine: Object.freeze({
        scheme: 'dark', backdrop: 'rgba(34,33,36,.86)', backdropSolid: 'rgba(34,33,36,.96)', shellSolid: '#2b2b2b', ripple: .2,
        tokens: Object.freeze({ 'shell-bg': igsUiSurface(IGS_UI_THICKNESS.thick), 'shell-shadow': `0 8px 24px rgba(0,0,0,.45),${IGS_UI_EDGE_NIGHT}`, paper: 'rgba(255,196,212,.08)', panel: '#2b2b2b', surface: 'rgba(255,196,212,.08)', field: 'rgba(255,196,212,.1)', line: 'transparent', 'line-strong': 'transparent', ink: '#fff', 'ink-2': 'rgba(255,255,255,.7)', 'ink-3': 'rgba(255,255,255,.5)', 'ink-4': 'rgba(255,255,255,.34)', accent: '#ffc4d4', 'accent-2': '#ffd9e4', 'on-accent': '#2b2b2b', danger: '#d96c6c', highlight: 'rgba(255,196,212,.12)', raised: 'rgba(255,255,255,.16)', knob: '#ffd9e4', ripple: '#ff6f9c' }),
    }),
    cream: Object.freeze({
        scheme: 'light', backdrop: 'rgba(243,233,218,.93)', backdropSolid: 'rgba(243,233,218,.97)', shellSolid: '#f7f0e6', ripple: .22,
        tokens: Object.freeze({ 'shell-bg': igsUiSurface(IGS_UI_THICKNESS.thick, 'day'), 'shell-shadow': `0 8px 24px rgba(92,70,44,.1),${IGS_UI_EDGE_DAY}`, paper: '#efe4d7', panel: '#f7f0e6', surface: 'rgba(116,91,62,.06)', field: 'rgba(116,91,62,.08)', line: 'rgba(116,91,62,.12)', 'line-strong': 'rgba(116,91,62,.18)', ink: '#514638', 'ink-2': '#735f4a', 'ink-3': '#9a8268', 'ink-4': 'rgba(154,130,104,.7)', accent: '#85a76a', 'accent-2': '#738f5b', 'on-accent': '#fcf8f1', danger: '#a76561', highlight: 'rgba(116,91,62,.08)', raised: 'rgba(255,255,255,.62)', knob: '#fcf8f1', ripple: '#6cb33f' }),
    }),
    light: Object.freeze({
        scheme: 'light', backdrop: 'rgba(240,238,232,.9)', backdropSolid: 'rgba(240,238,232,.97)', shellSolid: '#f8f5ee', ripple: .07,
        tokens: Object.freeze({ 'shell-bg': '#fbfaf6', 'shell-shadow': `0 12px 32px rgba(23,23,20,.12),${IGS_UI_EDGE_DAY}`, paper: '#ebe9e3', panel: '#f8f5ee', surface: 'rgba(17,17,15,.045)', field: 'rgba(17,17,15,.07)', line: 'rgba(23,23,20,.06)', 'line-strong': 'rgba(23,23,20,.1)', ink: '#11110f', 'ink-2': '#46443d', 'ink-3': '#77736a', 'ink-4': 'rgba(119,115,106,.72)', accent: '#11110f', 'accent-2': '#2d2b26', 'on-accent': '#fbfaf7', danger: '#95514b', highlight: 'rgba(17,17,15,.07)', raised: 'rgba(255,255,255,.72)', knob: '#fbfaf7', ripple: '#11110f' }),
    }),
    dark: Object.freeze({
        scheme: 'dark', backdrop: 'rgba(33,38,43,.9)', backdropSolid: 'rgba(33,38,43,.97)', shellSolid: '#1f2428', ripple: .16,
        tokens: Object.freeze({ 'shell-bg': '#24292e', 'shell-shadow': `0 18px 48px rgba(1,4,9,.36),${IGS_UI_EDGE_NIGHT}`, paper: '#2d343b', panel: '#1f2428', surface: 'rgba(201,209,217,.055)', field: 'rgba(201,209,217,.08)', line: 'rgba(205,217,229,.08)', 'line-strong': 'rgba(205,217,229,.14)', ink: '#f0f3f6', 'ink-2': '#c9d1d9', 'ink-3': '#8b949e', 'ink-4': 'rgba(139,148,158,.72)', accent: '#7fd6ca', 'accent-2': '#69c7bc', 'on-accent': '#1f2428', danger: '#d07a74', highlight: 'rgba(201,209,217,.08)', raised: 'rgba(201,209,217,.12)', knob: '#f0f3f6', ripple: '#1fe0c6' }),
    }),
});

// 地雷色是无属性时的基底；其余三套按属性覆盖。
export const SETTINGS_THEME_BASE = 'landmine';

export function getSettingsThemePalette(theme) {
    return SETTINGS_THEME_PALETTES[normalizeSettingsTheme(theme)] || SETTINGS_THEME_PALETTES[SETTINGS_THEME_BASE];
}

export function settingsThemeVars(theme, prefix = '--igs-settings-') {
    return Object.entries(getSettingsThemePalette(theme).tokens).map(([key, value]) => `${prefix}${key}:${value};`).join('');
}
