const SCENE_REGEX_FIELDS = Object.freeze([
    'speaker',
    'emotion',
    'time',
    'weather',
    'location',
    'generatedImage',
]);

export const DEFAULT_TEXT_FILTER_PRESET = Object.freeze({
    enabled: true,
    stripHtmlComments: true,
    allowUntaggedFallback: false,
    textIncludeTags: 'content',
    textExcludeTags: 'thinking\nSubtext_think\nStatus_block\ntext_to_image\nparallel_world\naftertalk',
    imageIncludeTags: 'image\ntext_to_image',
    imageExcludeTags: '',
});

export const DEFAULT_TEXT_FORMAT_PRESET = Object.freeze({
    enabled: false,
    pattern: '',
    flags: '',
    replacement: '',
});

export const DEFAULT_SCENE_REGEX_PRESET = Object.freeze({
    enabled: false,
    overrideExplicitTags: false,
    speaker: Object.freeze({ pattern: '', flags: '' }),
    emotion: Object.freeze({ pattern: '', flags: '' }),
    time: Object.freeze({ pattern: '', flags: '' }),
    weather: Object.freeze({ pattern: '', flags: '' }),
    location: Object.freeze({ pattern: '', flags: '' }),
    generatedImage: Object.freeze({ pattern: '', flags: '' }),
});

export function normalizeTextFilterPreset(presetOrData) {
    const data = getPresetData(presetOrData);

    return Object.freeze({
        enabled: normalizeBoolean(data.enabled, DEFAULT_TEXT_FILTER_PRESET.enabled),
        stripHtmlComments: normalizeBoolean(data.stripHtmlComments, DEFAULT_TEXT_FILTER_PRESET.stripHtmlComments),
        allowUntaggedFallback: normalizeBoolean(data.allowUntaggedFallback, DEFAULT_TEXT_FILTER_PRESET.allowUntaggedFallback),
        textIncludeTags: normalizeTagValue(data.textIncludeTags, DEFAULT_TEXT_FILTER_PRESET.textIncludeTags),
        textExcludeTags: normalizeTagValue(data.textExcludeTags, DEFAULT_TEXT_FILTER_PRESET.textExcludeTags),
        imageIncludeTags: normalizeTagValue(data.imageIncludeTags, DEFAULT_TEXT_FILTER_PRESET.imageIncludeTags),
        imageExcludeTags: normalizeTagValue(data.imageExcludeTags, DEFAULT_TEXT_FILTER_PRESET.imageExcludeTags),
    });
}

export function normalizeTextFormatPreset(presetOrData) {
    const data = getPresetData(presetOrData);

    return Object.freeze({
        enabled: normalizeBoolean(data.enabled, DEFAULT_TEXT_FORMAT_PRESET.enabled),
        pattern: normalizeString(data.pattern, DEFAULT_TEXT_FORMAT_PRESET.pattern),
        flags: normalizeRegexFlags(data.flags, DEFAULT_TEXT_FORMAT_PRESET.flags),
        replacement: typeof data.replacement === 'string'
            ? data.replacement
            : data.replacement == null
                ? DEFAULT_TEXT_FORMAT_PRESET.replacement
                : String(data.replacement),
    });
}

export function normalizeSceneRegexPreset(presetOrData) {
    const data = getPresetData(presetOrData);
    const patterns = isPlainObject(data.patterns) ? data.patterns : {};
    const normalized = {
        enabled: normalizeBoolean(data.enabled, DEFAULT_SCENE_REGEX_PRESET.enabled),
        overrideExplicitTags: normalizeBoolean(data.overrideExplicitTags, DEFAULT_SCENE_REGEX_PRESET.overrideExplicitTags),
    };

    for (const field of SCENE_REGEX_FIELDS) {
        normalized[field] = normalizeRegexEntry(
            data[field] != null ? data[field] : patterns[field],
        );
    }

    return Object.freeze(normalized);
}

export function validateTextFormatPreset(presetOrData) {
    const preset = normalizeTextFormatPreset(presetOrData);
    const errors = [];
    let regex = null;

    if (preset.enabled && preset.pattern) {
        try {
            regex = new RegExp(preset.pattern, preset.flags);
        } catch (error) {
            errors.push(createRegexError('text-format-preset', 'pattern', error));
        }
    }

    return Object.freeze({
        ok: errors.length === 0,
        preset,
        regex,
        errors,
    });
}

export function validateSceneRegexPreset(presetOrData) {
    const preset = normalizeSceneRegexPreset(presetOrData);
    const compiled = {};
    const errors = [];

    for (const field of SCENE_REGEX_FIELDS) {
        const entry = preset[field];
        if (!entry.pattern || !preset.enabled) {
            compiled[field] = null;
            continue;
        }

        try {
            compiled[field] = new RegExp(entry.pattern, entry.flags);
        } catch (error) {
            compiled[field] = null;
            errors.push(createRegexError('scene-regex-preset', field, error));
        }
    }

    return Object.freeze({
        ok: errors.length === 0,
        preset,
        compiled: Object.freeze(compiled),
        errors,
    });
}

function getPresetData(presetOrData) {
    if (!isPlainObject(presetOrData)) return {};
    if (isPlainObject(presetOrData.data)) return presetOrData.data;
    return presetOrData;
}

function normalizeRegexEntry(value) {
    if (typeof value === 'string') {
        return Object.freeze({
            pattern: value.trim(),
            flags: '',
        });
    }

    if (!isPlainObject(value)) {
        return Object.freeze({
            pattern: '',
            flags: '',
        });
    }

    return Object.freeze({
        pattern: normalizeString(value.pattern ?? value.regex, ''),
        flags: normalizeRegexFlags(value.flags, ''),
    });
}

function normalizeString(value, fallback) {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizeTagValue(value, fallback) {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join('\n');
    }
    return normalizeString(value, fallback);
}

function normalizeRegexFlags(value, fallback) {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, '');
    if (!text) return fallback;

    const seen = new Set();
    let flags = '';

    for (const char of text) {
        if (seen.has(char)) continue;
        seen.add(char);
        flags += char;
    }

    return flags;
}

function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
}

function createRegexError(presetType, field, error) {
    return Object.freeze({
        presetType,
        field,
        message: error instanceof Error ? error.message : String(error),
    });
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
