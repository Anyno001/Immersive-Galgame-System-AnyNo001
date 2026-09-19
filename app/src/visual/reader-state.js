import { resolveLegacyReaderMode } from '../storage/legacy-igs.js';
import { getResponsiveLayout } from './responsive-layout.js';

const READER_MODES = Object.freeze(['pc', 'mobile', 'web', 'fullscreen']);
const TOOLBAR_LAYOUTS = Object.freeze(['horizontal', 'vertical']);
const TOOLBAR_PLACEMENTS = Object.freeze(['top-left', 'top-right', 'top', 'bottom', 'bottom-right', 'custom']);
const DIALOGUE_STYLES = Object.freeze(['panel', 'subtitle', 'bubble']);

export function createReaderState(input = {}) {
    const legacy = getLegacySettings(input.legacyIgs);
    const mode = resolveReaderMode(input, legacy);
    const isMobile = resolveIsMobile(input, mode);
    const viewport = normalizeViewport(input.viewport);
    const layout = getResponsiveLayout(viewport, { mode, isMobile });
    const mergedSettings = mergeSettings(
        legacy.readerSettingsByMode && legacy.readerSettingsByMode[mode],
        legacy.readerSettings,
        // default 桶为权威，放在旧 mode 桶之后覆盖它（全模式共用一套设置）。
        legacy.readerSettingsByMode && legacy.readerSettingsByMode['default'],
        input.visualSettings,
        input.layoutSettings,
        input.readerSettings,
    );
    const toolbarLayout = normalizeToolbarLayout(
        firstDefined(mergedSettings.toolbarLayout, mergedSettings.toolbarDirection, mergedSettings.toolbarMode),
        isMobile,
    );
    const toolbarPlacement = normalizeToolbarPlacement(
        firstDefined(mergedSettings.toolbarPlacement, mergedSettings.toolbarPosition, mergedSettings.toolbarSlot),
    );
    const dialogueStyle = normalizeDialogueStyle(
        firstDefined(mergedSettings.dialogueStyle, mergedSettings.dialogStyle, mergedSettings.panelStyle),
    );
    const nameplateVisible = normalizeBoolean(
        firstDefined(mergedSettings.nameplateVisible, mergedSettings.showNameplate),
        true,
    );
    const avatarVisible = normalizeBoolean(
        firstDefined(mergedSettings.avatarVisible, mergedSettings.showAvatar),
        false,
    );
    const cssVars = {
        '--igs-dialogue-font-size': normalizePixelValue(
            firstDefined(mergedSettings.dialogueFontSize, mergedSettings.fontSize),
            defaultFontSize(layout),
        ),
        '--igs-dialogue-width': normalizeSizeValue(
            firstDefined(mergedSettings.dialogueWidth, mergedSettings.dialogWidth),
            defaultDialogueWidth(layout),
        ),
        '--igs-dialogue-height': normalizeSizeValue(
            firstDefined(mergedSettings.dialogueHeight, mergedSettings.dialogHeight),
            'auto',
        ),
        '--igs-dialogue-opacity': normalizeOpacity(
            firstDefined(mergedSettings.dialogueOpacity, mergedSettings.dialogOpacity),
            0.72,
        ),
        '--igs-toolbar-placement-x': normalizePixelValue(
            firstDefined(mergedSettings.toolbarPlacementX, mergedSettings.toolbarX, mergedSettings.positionX),
            16,
        ),
        '--igs-toolbar-placement-y': normalizePixelValue(
            firstDefined(mergedSettings.toolbarPlacementY, mergedSettings.toolbarY, mergedSettings.positionY),
            16,
        ),
    };
    const attributes = {
        'data-igs-toolbar-layout': toolbarLayout,
        'data-igs-toolbar-placement': toolbarPlacement,
        'data-igs-dialogue-style': dialogueStyle,
        'data-igs-nameplate-visible': String(nameplateVisible),
        'data-igs-avatar-visible': String(avatarVisible),
    };

    return Object.freeze({
        mode,
        layout,
        isMobile,
        viewport,
        toolbarLayout,
        toolbarPlacement,
        dialogueStyle,
        nameplateVisible,
        avatarVisible,
        cssVars,
        attributes,
        datasetKeys: Object.keys(attributes),
        settings: mergedSettings,
    });
}

function getLegacySettings(legacy) {
    if (!legacy || legacy.ok === false) {
        return {
            readerMode: 'pc',
            displayMode: '',
            bridge: {},
            readerSettings: {},
            readerSettingsByMode: {},
        };
    }
    return legacy;
}

function resolveReaderMode(input, legacy) {
    const requestedMode = firstDefined(
        input.mode,
        input.viewerMode,
        input.readerMode,
        input.readerSettings && input.readerSettings.mode,
        input.layoutSettings && input.layoutSettings.mode,
        input.visualSettings && input.visualSettings.mode,
    );
    const resolved = resolveLegacyReaderMode(requestedMode, legacy.displayMode, legacy.bridge);
    return READER_MODES.includes(resolved) ? resolved : 'pc';
}

function resolveIsMobile(input, mode) {
    if (typeof input.isMobile === 'boolean') return input.isMobile;
    return mode === 'mobile';
}

function normalizeViewport(viewport) {
    const width = Number(viewport && viewport.width);
    const height = Number(viewport && viewport.height);

    return Object.freeze({
        width: Number.isFinite(width) && width > 0 ? width : 0,
        height: Number.isFinite(height) && height > 0 ? height : 0,
    });
}

function mergeSettings(...sources) {
    const merged = {};
    for (const source of sources) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
        Object.assign(merged, cloneData(source));
    }
    return Object.freeze(merged);
}

function normalizeToolbarLayout(value, isMobile) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (TOOLBAR_LAYOUTS.includes(normalized)) return normalized;
    if (normalized === 'auto') return isMobile ? 'vertical' : 'horizontal';
    return isMobile ? 'vertical' : 'horizontal';
}

function normalizeToolbarPlacement(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return TOOLBAR_PLACEMENTS.includes(normalized) ? normalized : 'top-right';
}

function normalizeDialogueStyle(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'box') return 'panel';
    return DIALOGUE_STYLES.includes(normalized) ? normalized : 'panel';
}

function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
    }
    return fallback;
}

function normalizePixelValue(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
    if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) return `${fallback}px`;
        if (/^-?\d+(\.\d+)?$/.test(normalized)) return `${normalized}px`;
        return normalized;
    }
    return `${fallback}px`;
}

function normalizeSizeValue(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
    if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) return fallback;
        if (/^-?\d+(\.\d+)?$/.test(normalized)) return `${normalized}px`;
        return normalized;
    }
    return fallback;
}

function normalizeOpacity(value, fallback) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return String(fallback);
    return String(Math.min(1, Math.max(0, normalized)));
}

function defaultFontSize(layout) {
    if (layout === 'mobile-landscape') return 15;
    if (layout === 'mobile-portrait') return 16;
    return 18;
}

function defaultDialogueWidth(layout) {
    if (layout === 'mobile-portrait') return 'calc(100vw - 24px)';
    return 'min(920px, calc(100vw - 32px))';
}

function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}
