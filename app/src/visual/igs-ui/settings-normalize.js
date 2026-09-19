import { LEGACY_READER_MODES, resolveLegacyReaderMode } from '../../storage/legacy-igs.js';
import { buildNarrativeSegments } from '../../scene/image-slots.js';
import { SETTINGS_TAB_DEFS } from './settings-tabs.js';
import { TOOLBAR_ACTIONS, VN_THEME_PRESETS } from './reader-host-constants.js';
import { esc, normalizeFiniteNumber } from './reader-value-utils.js';

export function normalizeReaderMode(mode, bridge) {
    if (mode === 'default') return 'default';
    const resolved = resolveLegacyReaderMode(mode, '', bridge || {});
    return LEGACY_READER_MODES.includes(resolved) ? resolved : 'pc';
}

export function normalizeSettingsTab(tab) {
    const normalized = String(tab || 'basic').trim();
    return SETTINGS_TAB_DEFS.some(([id]) => id === normalized) ? normalized : 'basic';
}

export function normalizeSettingsValue(path, value) {
    if (path === 'readerMode' || path === 'bridge.openMode' || path === 'bridge.imageApi.mode' || path === 'bridge.imageApi.externalAdapter' || path === 'readerSettings.imgMode') {
        return String(value || '');
    }
    if (path.startsWith('readerSettings.')) {
        if (value === 'null') return null;
        if (/fontSize|dialogWidth|dialogHeight|toolbarScale|inputScale|imageCountOverride|imgBrightness/.test(path)) {
            return Number(value);
        }
        if (/glassOpacity/.test(path)) {
            return Number(value);
        }
    }
    if (/^bridge\.imageApi\.(steps|requestTimeoutMs|pollIntervalMs|pollAttempts)$/.test(path)) {
        return Number(value);
    }
    return value;
}

export function getPath(target, path) {
    return String(path || '').split('.').reduce((value, key) => (value == null ? value : value[key]), target);
}

export function setPath(target, path, value) {
    const parts = String(path || '').split('.');
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
}

export function buildTextSegments(text) {
    return buildNarrativeSegments(text);
}

export function normalizePinnedButtons(value) {
    const allowed = new Set(TOOLBAR_ACTIONS.map(([id]) => id));
    const output = [];
    for (const id of Array.isArray(value) ? value : []) {
        const normalized = String(id || '').trim();
        if (!normalized || !allowed.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    return output;
}

export function normalizeHiddenButtons(value) {
    const allowed = new Set(TOOLBAR_ACTIONS.map(([id]) => id));
    const protected_ = new Set(['settings']);
    const output = [];
    for (const id of Array.isArray(value) ? value : []) {
        const normalized = String(id || '').trim();
        if (!normalized || !allowed.has(normalized) || protected_.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    return output;
}

export function normalizeBtnOrder(value) {
    const canonical = TOOLBAR_ACTIONS.map(([id]) => id);
    const allowed = new Set(canonical);
    const output = [];
    for (const id of Array.isArray(value) ? value : []) {
        const normalized = String(id || '').trim();
        if (!normalized || !allowed.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    for (const id of canonical) {
        if (!output.includes(id)) output.push(id);
    }
    return output;
}

export function normalizeSpriteLayouts(value) {
    const def = { posX: 50, posY: 100, scale: 100 };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    for (const key of Object.keys(value)) {
        const src = (typeof value[key] === 'object' && value[key]) ? value[key] : {};
        out[key] = {
            posX: normalizeFiniteNumber(src.posX, def.posX),
            posY: normalizeFiniteNumber(src.posY, def.posY),
            scale: normalizeFiniteNumber(src.scale, def.scale),
        };
    }
    return out;
}

export function resolveSpriteLayout(layouts, mode, character, mood) {
    const def = { posX: 50, posY: 100, scale: 100 };
    if (!layouts) return def;
    if (character) {
        if (mood) {
            const moodKey = `${mode}::${character}::${mood}`;
            if (layouts[moodKey]) return layouts[moodKey];
        }
        const charKey = `${mode}::${character}`;
        if (layouts[charKey]) return layouts[charKey];
    }
    if (layouts[mode]) return layouts[mode];
    return def;
}

export function resolveActiveTheme(snapshot) {
    const vnTheme = snapshot.readerSettings._vnTheme || {};
    const presetName = vnTheme.preset || 'genshin';
    const preset = VN_THEME_PRESETS[presetName] || VN_THEME_PRESETS.genshin;
    if (presetName === 'custom') {
        return {
            nameAlign: vnTheme.nameAlign || preset.nameAlign,
            textAlign: vnTheme.textAlign || preset.textAlign || 'left',
            narrationAlign: vnTheme.narrationAlign || preset.narrationAlign || 'left',
            thoughtAlign: vnTheme.thoughtAlign || preset.thoughtAlign || 'left',
            dividerSymbol: vnTheme.dividerSymbol != null ? vnTheme.dividerSymbol : preset.dividerSymbol,
            nameFont: vnTheme.nameFont || preset.nameFont,
            textFont: vnTheme.textFont || preset.textFont,
            thoughtFont: vnTheme.thoughtFont || preset.thoughtFont,
            narrationFont: vnTheme.narrationFont || preset.narrationFont,
            nameColor: vnTheme.nameColor || preset.nameColor,
            textColor: vnTheme.textColor || preset.textColor,
            thoughtColor: vnTheme.thoughtColor || preset.thoughtColor,
            narrationColor: vnTheme.narrationColor || preset.narrationColor,
            dividerColor: vnTheme.dividerColor || preset.dividerColor,
        };
    }
    return { ...preset };
}

export function renderDialogueHtml(text, theme, sceneAssetsEnabled) {
    const escaped = esc(text);
    if (!sceneAssetsEnabled) return escaped;
    return escaped.replace(/\*([^*]+)\*/g, (_, inner) => {
        const styles = [];
        if (theme.thoughtFont && theme.thoughtFont !== 'inherit') styles.push(`font-family:${cssFontValue(theme.thoughtFont)}`);
        if (theme.thoughtColor) styles.push(`color:${theme.thoughtColor}`);
        const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
        return `<span class="igs-thought"${styleAttr}>${inner}</span>`;
    });
}

function cssFontValue(font) {
    return String(font || '').replace(/"/g, "'");
}
