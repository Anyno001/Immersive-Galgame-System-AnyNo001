import {
    normalizeTextFilterPreset,
    validateSceneRegexPreset,
    validateTextFormatPreset,
} from '../presets/text-presets.js';

const REGEX_CAPTURE_FIELDS = Object.freeze([
    'speaker',
    'emotion',
    'time',
    'weather',
    'location',
    'generatedImage',
]);

export function parseTagList(text) {
    const source = Array.isArray(text) ? text.join('\n') : String(text || '');
    return source
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function extractTagBlocks(raw, tags, options = {}) {
    const text = String(raw || '');
    const tagList = parseTagList(tags);
    const blocks = [];

    for (const tag of tagList) {
        const regex = new RegExp(`<${escapeRegex(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`, 'gi');
        for (const match of text.matchAll(regex)) {
            const block = options.trim === false ? match[1] : normalizeMultiline(match[1]);
            if (block) blocks.push(block);
        }
    }

    return blocks;
}

export function removeTagBlocks(raw, tags) {
    let text = String(raw || '');

    for (const tag of parseTagList(tags)) {
        const regex = new RegExp(`<${escapeRegex(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`, 'gi');
        text = text.replace(regex, '');
    }

    return normalizeMultiline(text);
}

export function buildFilteredTextSource(raw, filterPreset, options = {}) {
    const preset = normalizeTextFilterPreset(filterPreset);
    const baseRaw = String(raw || '');
    const strippedRaw = preset.stripHtmlComments ? stripHtmlComments(baseRaw) : baseRaw;
    const textIncludeTags = parseTagList(preset.textIncludeTags);
    const textExcludeTags = parseTagList(preset.textExcludeTags);
    const imageIncludeTags = parseTagList(preset.imageIncludeTags);
    const imageExcludeTags = parseTagList(preset.imageExcludeTags);
    const warnings = [];
    const errors = [];

    if (!preset.enabled) {
        return {
            ok: true,
            textSource: normalizeMultiline(strippedRaw),
            imageSource: '',
            sourceKind: 'raw-text',
            expectedTags: textIncludeTags,
            warnings,
            errors,
            rawTextSource: normalizeMultiline(strippedRaw),
        };
    }

    const includedBlocks = extractTagBlocks(strippedRaw, textIncludeTags, options);
    const rawTextSource = includedBlocks.length > 0
        ? normalizeMultiline(includedBlocks.join('\n'))
        : normalizeMultiline(strippedRaw);
    let textSource = '';
    let sourceKind = 'tagged-content';

    if (includedBlocks.length > 0) {
        textSource = normalizeMultiline(
            includedBlocks
                .map((block) => removeTagBlocks(block, textExcludeTags))
                .filter(Boolean)
                .join('\n'),
        );
    } else if (preset.allowUntaggedFallback) {
        textSource = removeTagBlocks(strippedRaw, textExcludeTags);
        sourceKind = 'untagged-fallback';
        if (textIncludeTags.length > 0) {
            warnings.push({
                code: 'missing-include-tags',
                message: `Missing include tags: ${textIncludeTags.join(', ')}`,
            });
        }
    } else {
        sourceKind = 'missing-include-tags';
        warnings.push({
            code: 'missing-include-tags',
            message: `Missing include tags: ${textIncludeTags.join(', ')}`,
        });
    }

    const imageBlocks = extractTagBlocks(
        removeTagBlocks(strippedRaw, imageExcludeTags),
        imageIncludeTags,
        options,
    );
    const imageSource = normalizeMultiline(imageBlocks.join('\n'));

    return {
        ok: errors.length === 0,
        textSource,
        imageSource,
        sourceKind,
        expectedTags: textIncludeTags,
        warnings,
        errors,
        rawTextSource,
    };
}

export function applyTextFormatPreset(text, formatPreset) {
    const sourceText = String(text || '');
    const validation = validateTextFormatPreset(formatPreset);
    const warnings = [];
    const errors = validation.errors.map(cloneIssue);

    if (!validation.preset.enabled || !validation.preset.pattern) {
        return {
            ok: errors.length === 0,
            text: normalizeMultiline(sourceText),
            sourceKind: 'format-disabled',
            warnings,
            errors,
        };
    }

    if (!validation.ok || !validation.regex) {
        return {
            ok: false,
            text: normalizeMultiline(sourceText),
            sourceKind: 'invalid-format-regex',
            warnings,
            errors,
        };
    }

    const formatted = sourceText.replace(validation.regex, validation.preset.replacement);
    return {
        ok: true,
        text: normalizeMultiline(formatted),
        sourceKind: formatted === sourceText ? 'regex-noop' : 'regex-replace',
        warnings,
        errors,
    };
}

export function applySceneRegexPreset(text, regexPreset) {
    const sourceText = String(text || '');
    const validation = validateSceneRegexPreset(regexPreset);
    const warnings = [];
    const errors = validation.errors.map(cloneIssue);
    const scenePatch = {};

    if (!validation.preset.enabled) {
        return {
            ok: errors.length === 0,
            scenePatch,
            warnings,
            errors,
            overrideExplicitTags: validation.preset.overrideExplicitTags,
        };
    }

    for (const field of REGEX_CAPTURE_FIELDS) {
        const regex = validation.compiled[field];
        if (!regex) continue;
        regex.lastIndex = 0;
        const match = regex.exec(sourceText);
        if (!match) continue;

        const value = normalizeMultiline(getFirstCapture(match));
        if (!value) continue;

        scenePatch[field] = field === 'generatedImage'
            ? { source: 'scene-regex-preset', value }
            : value;
    }

    return {
        ok: errors.length === 0,
        scenePatch,
        warnings,
        errors,
        overrideExplicitTags: validation.preset.overrideExplicitTags,
    };
}

export function runTextPipeline(raw, options = {}) {
    const filtered = buildFilteredTextSource(raw, options.textFilterPreset, options);
    const formatted = applyTextFormatPreset(filtered.textSource, options.textFormatPreset);
    const regexResult = applySceneRegexPreset(
        formatted.text,
        options.sceneRegexPreset,
    );

    return {
        ok: filtered.ok && formatted.ok && regexResult.ok,
        raw: String(raw || ''),
        textSource: filtered.textSource,
        formattedText: formatted.text,
        imageSource: filtered.imageSource,
        scenePatch: regexResult.scenePatch,
        sourceKind: filtered.sourceKind,
        formatSourceKind: formatted.sourceKind,
        expectedTags: filtered.expectedTags,
        warnings: [...filtered.warnings, ...formatted.warnings, ...regexResult.warnings],
        errors: [...filtered.errors, ...formatted.errors, ...regexResult.errors],
        overrideExplicitTags: regexResult.overrideExplicitTags,
    };
}

function getFirstCapture(match) {
    for (let index = 1; index < match.length; index += 1) {
        if (match[index]) return match[index];
    }
    return match[0] || '';
}

function stripHtmlComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, '');
}

function normalizeMultiline(text) {
    return String(text || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cloneIssue(issue) {
    return issue && typeof issue === 'object' ? { ...issue } : issue;
}
