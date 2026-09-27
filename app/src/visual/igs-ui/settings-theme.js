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

export function getSettingsThemeOption(theme) {
    return SETTINGS_THEME_OPTIONS.find((option) => option.value === normalizeSettingsTheme(theme)) || SETTINGS_THEME_OPTIONS[0];
}

function renderSettingsThemeSwatch({ base, accent }) {
    return `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x=".5" y=".5" width="19" height="19" rx="4" fill="${base}" stroke="rgba(128,128,128,.34)"/><rect x="10.5" y="10.5" width="6" height="6" rx="1.5" fill="${accent}"/></svg>`;
}

export function renderSettingsThemeSwitch(theme) {
    const current = normalizeSettingsTheme(theme);
    return SETTINGS_THEME_OPTIONS.map((option) => {
        const active = option.value === current;
        return `<button type="button" class="igs-settings-theme-option${active ? ' is-active' : ''}" data-action="set-settings-theme:${option.value}" data-theme="${option.value}" role="radio" aria-checked="${active}" aria-label="${option.label}" title="${option.label}">${renderSettingsThemeSwatch(option.swatch)}</button>`;
    }).join('');
}
