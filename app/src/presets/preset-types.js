import {
    normalizeSceneRegexPreset,
    normalizeTextFilterPreset,
    validateSceneRegexPreset,
    validateTextFormatPreset,
} from './text-presets.js';

export const PRESET_TYPES = Object.freeze([
    'theme-preset',
    'css-preset',
    'ui-skin-preset',
    'ui-layout-preset',
    'scene-regex-preset',
    'text-filter-preset',
    'text-format-preset',
    'prompt-preset',
    'image-provider-preset',
    'image-request-builder-preset',
    'workflow-preset',
    'background-rule-preset',
    'choice-parser-preset',
    'visual-mode-preset',
]);

export const TEXT_PRESET_TYPES = Object.freeze([
    'scene-regex-preset',
    'text-filter-preset',
    'text-format-preset',
]);

export const PRESET_TYPE_TO_API_GROUP = Object.freeze({
    'theme-preset': 'themePresets',
    'css-preset': 'themePresets',
    'ui-skin-preset': 'uiSkins',
    'ui-layout-preset': 'uiSkins',
    'scene-regex-preset': 'sceneRegexPresets',
    'text-filter-preset': 'textFilterPresets',
    'text-format-preset': 'textFormatPresets',
    'prompt-preset': 'promptPresets',
    'image-provider-preset': null,
    'image-request-builder-preset': null,
    'workflow-preset': null,
    'background-rule-preset': null,
    'choice-parser-preset': null,
    'visual-mode-preset': null,
});

export const PRESET_TYPE_TO_CONFIG_KEY = Object.freeze({
    'scene-regex-preset': 'sceneRegexPreset',
    'text-filter-preset': 'textFilterPreset',
    'text-format-preset': 'textFormatPreset',
    'prompt-preset': 'promptPreset',
    'image-provider-preset': 'imageProviderPreset',
    'image-request-builder-preset': 'imageRequestBuilderPreset',
    'workflow-preset': 'workflowPreset',
    'theme-preset': 'themePreset',
    'css-preset': 'cssPreset',
    'ui-skin-preset': 'uiSkinPreset',
    'ui-layout-preset': 'uiLayoutPreset',
    'background-rule-preset': 'backgroundRulePreset',
    'choice-parser-preset': 'choiceParserPreset',
    'visual-mode-preset': 'visualModePreset',
});

const MANIFEST_FIELDS = new Set(['format', 'type', 'id', 'name', 'version', 'data']);
const PRESET_TYPE_SET = new Set(PRESET_TYPES);

export function normalizePresetManifest(preset) {
    const source = isPlainObject(preset) ? preset : {};
    const type = normalizeString(source.type, '');
    const id = normalizeString(source.id, '');
    const name = normalizeString(source.name, id || type || 'preset');
    const format = normalizeString(source.format, 'igs_preset_v1');
    const version = normalizePositiveInteger(source.version, 1);
    const data = source.data && isPlainObject(source.data)
        ? cloneData(source.data)
        : collectInlineData(source);

    return Object.freeze({
        format,
        type,
        id,
        name,
        version,
        data,
    });
}

export function validatePresetManifest(preset) {
    const normalized = normalizePresetManifest(preset);
    const errors = [];

    if (!normalized.type) {
        errors.push(createPresetError('', 'type', 'missing-type', 'Preset type is required.'));
    } else if (!PRESET_TYPE_SET.has(normalized.type)) {
        errors.push(createPresetError(normalized.type, 'type', 'unsupported-type', `Unsupported preset type: ${normalized.type}`));
    }

    if (!normalized.id) {
        errors.push(createPresetError(normalized.type, 'id', 'missing-id', 'Preset id is required.'));
    }

    return Object.freeze({
        ok: errors.length === 0,
        normalized,
        errors,
    });
}

export function validatePresetByType(preset) {
    const manifestResult = validatePresetManifest(preset);
    const errors = [...manifestResult.errors];

    if (!manifestResult.ok) {
        return Object.freeze({
            ok: false,
            normalized: manifestResult.normalized,
            errors,
        });
    }

    const normalized = manifestResult.normalized;
    let normalizedData = cloneData(normalized.data);

    if (normalized.type === 'text-filter-preset') {
        normalizedData = normalizeTextFilterPreset(normalized);
    } else if (normalized.type === 'text-format-preset') {
        const result = validateTextFormatPreset(normalized);
        normalizedData = result.preset;
        errors.push(...result.errors.map(cloneData));
    } else if (normalized.type === 'scene-regex-preset') {
        const result = validateSceneRegexPreset(normalized);
        normalizedData = result.preset;
        errors.push(...result.errors.map(cloneData));
    }

    return Object.freeze({
        ok: errors.length === 0,
        normalized: Object.freeze({
            ...normalized,
            data: normalizedData,
        }),
        errors,
    });
}

function collectInlineData(source) {
    const data = {};

    for (const [key, value] of Object.entries(source)) {
        if (MANIFEST_FIELDS.has(key)) continue;
        data[key] = cloneData(value);
    }

    return data;
}

function createPresetError(presetType, field, reason, message) {
    return Object.freeze({
        presetType,
        field,
        reason,
        message,
    });
}

function normalizeString(value, fallback) {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizePositiveInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) return fallback;
    return number;
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
