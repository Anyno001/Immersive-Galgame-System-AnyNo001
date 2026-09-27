export const SETTINGS_THEME_OPTIONS = Object.freeze([
    Object.freeze({ value: 'landmine', label: '地雷色', scheme: 'dark' }),
    Object.freeze({ value: 'cream', label: '奶油风', scheme: 'light' }),
    Object.freeze({ value: 'light', label: '浅色', scheme: 'light' }),
    Object.freeze({ value: 'dark', label: '深色', scheme: 'dark' }),
]);

const SETTINGS_THEME_VALUES = new Set(SETTINGS_THEME_OPTIONS.map((theme) => theme.value));
const SETTINGS_THEME_LEGACY_VALUES = Object.freeze({
    night: 'landmine',
    day: 'cream',
});

export function normalizeSettingsTheme(theme) {
    const raw = String(theme || '').trim();
    if (SETTINGS_THEME_LEGACY_VALUES[raw]) return SETTINGS_THEME_LEGACY_VALUES[raw];
    return SETTINGS_THEME_VALUES.has(raw) ? raw : 'landmine';
}

export function getNextSettingsTheme(theme) {
    const current = normalizeSettingsTheme(theme);
    const index = SETTINGS_THEME_OPTIONS.findIndex((option) => option.value === current);
    return SETTINGS_THEME_OPTIONS[(index + 1) % SETTINGS_THEME_OPTIONS.length].value;
}

export function getSettingsThemeLabel(theme) {
    const next = SETTINGS_THEME_OPTIONS.find((option) => option.value === getNextSettingsTheme(theme));
    return `切换到${next ? next.label : '地雷色'}`;
}

export function getSettingsThemeOption(theme) {
    return SETTINGS_THEME_OPTIONS.find((option) => option.value === normalizeSettingsTheme(theme)) || SETTINGS_THEME_OPTIONS[0];
}
