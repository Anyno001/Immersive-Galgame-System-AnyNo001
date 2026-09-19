import { runTextPipeline } from './text-pipeline.js';

const TAG_ALIASES = Object.freeze({
    speaker: ['speaker', '角色', '说话人'],
    emotion: ['emotion', '情绪'],
    time: ['time', '时间'],
    weather: ['weather', '天气'],
    location: ['location', '地点', '位置'],
    generatedImage: ['generatedImage', '生图', '插图'],
});

export function parseSceneText(text = '', options = {}) {
    const rawText = String(text || '');
    const pipeline = shouldUseTextPipeline(options)
        ? runTextPipeline(rawText, options)
        : createDefaultPipeline(rawText);
    const scene = {
        messageId: options.messageId == null ? null : options.messageId,
        text: '',
        textSource: pipeline.textSource,
        formattedText: pipeline.formattedText,
        sourceKind: pipeline.sourceKind,
        formatSourceKind: pipeline.formatSourceKind,
        textPipelineWarnings: pipeline.warnings,
        textPipelineErrors: pipeline.errors,
    };
    const body = [];
    const explicitKeys = new Set();

    for (const line of String(pipeline.formattedText || '').split(/\r?\n/)) {
        const tag = parseTag(line);
        if (tag) {
            const appliedKey = applyTag(scene, tag);
            if (appliedKey) explicitKeys.add(appliedKey);
            continue;
        }
        body.push(line);
    }

    scene.text = body.join('\n').trim();
    parseSpeakerPrefix(scene);
    applyScenePatch(scene, pipeline.scenePatch, {
        explicitKeys,
        overrideExplicitTags: pipeline.overrideExplicitTags,
    });
    return scene;
}

function parseTag(line) {
    const match = String(line).match(/^\s*\[([^:\]：]+)\s*[:：]\s*(.*?)\]\s*$/);
    if (!match) return null;
    return {
        key: match[1].trim(),
        value: match[2].trim(),
    };
}

function applyTag(scene, tag) {
    const normalizedKey = normalizeKey(tag.key);
    if (!normalizedKey) return null;
    if (normalizedKey === 'generatedImage') {
        scene.generatedImage = tag.value ? { source: 'text-tag', value: tag.value } : null;
        return normalizedKey;
    }
    scene[normalizedKey] = tag.value;
    return normalizedKey;
}

function normalizeKey(key) {
    return Object.entries(TAG_ALIASES).find(([, aliases]) => aliases.includes(key))?.[0] || null;
}

function parseSpeakerPrefix(scene) {
    if (scene.speaker || !scene.text) return;
    const match = scene.text.match(/^([^:：\n]{1,24})\s*[:：]\s*(.+)$/s);
    if (!match) return;
    if (match[1].trim().startsWith('@')) return;
    scene.speaker = match[1].trim();
    scene.text = match[2].trim();
}

function applyScenePatch(scene, patch = {}, options = {}) {
    for (const [key, value] of Object.entries(patch)) {
        if (!hasSceneValue(value)) continue;
        if (options.overrideExplicitTags !== true && options.explicitKeys && options.explicitKeys.has(key)) {
            continue;
        }
        scene[key] = key === 'generatedImage'
            ? normalizeGeneratedImage(value)
            : value;
    }
}

function normalizeGeneratedImage(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        return {
            source: 'scene-regex-preset',
            value,
        };
    }
    return {
        ...value,
        source: value.source || 'scene-regex-preset',
    };
}

function hasSceneValue(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'object' && 'value' in value) {
        return String(value.value || '').trim().length > 0;
    }
    return true;
}

function shouldUseTextPipeline(options = {}) {
    return Boolean(
        options.textFilterPreset
        || options.textFormatPreset
        || options.sceneRegexPreset,
    );
}

function createDefaultPipeline(rawText) {
    const normalizedText = String(rawText || '').trim();
    return {
        ok: true,
        raw: rawText,
        textSource: normalizedText,
        formattedText: normalizedText,
        imageSource: '',
        scenePatch: {},
        sourceKind: 'raw-text',
        formatSourceKind: 'raw-text',
        expectedTags: [],
        warnings: [],
        errors: [],
        overrideExplicitTags: false,
    };
}
