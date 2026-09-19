export function buildNarrativeSegments(text) {
    const source = String(text || '').trim();
    if (!source) return [''];
    const segments = source
        .split(/\n+/)
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    return segments.length ? segments : [''];
}

export function parseImageSlots(raw, imageSource, sourceFilter = {}) {
    if (!isImageSlotBindingEnabled(sourceFilter)) return [];
    const source = String(imageSource || raw || '').trim();
    if (!source) return [];
    return extractImageBlocks(source).map((block, index) => {
        const title = normalizeImageSlotTitle(block, index);
        const promptText = extractPromptText(block);
        return {
            slotIndex: index,
            title,
            tagName: block.tagName,
            rawBlock: block.rawBlock,
            promptText,
            locationHash: buildImageSlotHash(promptText || block.rawBlock),
            source: block.source,
        };
    });
}

export function extractImageBlocks(source) {
    const sourceText = String(source || '');
    const output = [];
    const seen = new Set();

    function add(rawBlock, tagName, sourceKind) {
        const normalized = String(rawBlock || '').trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        output.push({
            rawBlock: normalized,
            tagName: tagName || 'image',
            source: sourceKind || 'image-tag',
        });
    }

    const imageRegex = /<image\b[^>]*>[\s\S]*?<\/image>/gi;
    let match = null;
    while ((match = imageRegex.exec(sourceText)) !== null) {
        add(match[0], 'image', 'image-tag');
    }

    const imageRemainder = sourceText.replace(imageRegex, '\n');
    const promptRegex = /image###[\s\S]*?###/gi;
    while ((match = promptRegex.exec(imageRemainder)) !== null) {
        add(match[0], 'image-prompt', 'image-prompt');
    }

    return output;
}

export function buildSegmentImageMap(raw, segmentTexts = [], imageSlots = []) {
    const segments = Array.isArray(segmentTexts) ? segmentTexts : [];
    const totalImageCount = Array.isArray(imageSlots) ? imageSlots.length : 0;
    if (!segments.length || totalImageCount <= 0) return [];

    const sentenceMappings = buildSentenceImageMappings(raw, totalImageCount);
    if (!sentenceMappings.length) {
        return spreadImageSlots(segments.length, totalImageCount);
    }

    if (sentenceMappings.length === segments.length) {
        return sentenceMappings.map((item) => clampImageIndex(item.imgIdx, totalImageCount));
    }

    return segments.map((_, index) => {
        const mappedIndex = Math.min(
            sentenceMappings.length - 1,
            Math.floor(index * sentenceMappings.length / Math.max(segments.length, 1)),
        );
        return clampImageIndex(sentenceMappings[mappedIndex].imgIdx, totalImageCount);
    });
}

export function normalizeImageSlotTitle(block, index = 0) {
    const source = String(block && block.rawBlock || block || '').trim();
    const lines = source
        .replace(/<image\b[^>]*>/i, '')
        .replace(/<\/image>/i, '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    for (const line of lines) {
        const titleMatch = line.match(/^\[([^\]\r\n]+)\]$/);
        if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
    }
    return `图 ${index + 1}`;
}

export function buildImageSlotHash(text) {
    const source = normalizeSlotHashSource(text);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `slot-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function isImageSlotBindingEnabled(sourceFilter = {}) {
    if (sourceFilter && sourceFilter.enabled === false) return false;
    return parseTagList(sourceFilter && sourceFilter.imageIncludeTags).length > 0;
}

function extractPromptText(block) {
    const source = String(block && block.rawBlock || '').trim();
    const promptMatch = source.match(/image###[\s\S]*?###/i);
    return promptMatch ? promptMatch[0].trim() : '';
}

function buildSentenceImageMappings(raw, totalImageCount) {
    const source = String(raw || '');
    if (!source.trim()) return [];

    let cleaned = source.replace(/<\/content>\s*<content[^>]*>/gi, '\n\n');
    cleaned = cleaned.replace(/<image\b[^>]*>[\s\S]*?<\/image>/gi, ' \x00IMG\x00 ');
    cleaned = cleaned.replace(/<imgthink[^>]*>[\s\S]*?<\/imgthink>/gi, '');
    cleaned = cleaned.replace(/image###[\s\S]*?###/gi, '');
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    cleaned = cleaned.replace(/【[^】\n]{0,100}】/g, '');
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    cleaned = cleaned.replace(/\r/g, '');

    const sentences = [];
    let imageCount = 0;
    const lines = cleaned.split(/\n+/);
    for (const line of lines) {
        const parts = line.split('\x00IMG\x00');
        for (let index = 0; index < parts.length; index += 1) {
            const text = parts[index].replace(/\s+/g, ' ').trim();
            if (text) sentences.push({ text, imgIdx: imageCount });
            if (index < parts.length - 1) imageCount += 1;
        }
    }

    if (!sentences.length) return [];
    if (!imageCount && totalImageCount > 0) {
        return sentences.map((sentence, index) => ({
            ...sentence,
            imgIdx: Math.min(totalImageCount - 1, Math.floor(index * totalImageCount / sentences.length)),
        }));
    }
    return sentences.map((sentence) => ({
        ...sentence,
        imgIdx: clampImageIndex(sentence.imgIdx, totalImageCount),
    }));
}

function spreadImageSlots(segmentCount, totalImageCount) {
    if (segmentCount <= 0 || totalImageCount <= 0) return [];
    return Array.from({ length: segmentCount }, (_, index) => {
        return Math.min(totalImageCount - 1, Math.floor(index * totalImageCount / segmentCount));
    });
}

function clampImageIndex(value, totalImageCount) {
    if (totalImageCount <= 0) return 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.max(0, Math.min(totalImageCount - 1, Math.floor(numeric)));
}

function normalizeSlotHashSource(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .replace(/\n+/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function parseTagList(text) {
    return String(text || '')
        .split(/[\n,，]+/)
        .map((tag) => tag.trim().replace(/^<+/, '').replace(/^\/+/, '').replace(/>+$/, '').replace(/\/+$/, '').trim())
        .filter(Boolean);
}
