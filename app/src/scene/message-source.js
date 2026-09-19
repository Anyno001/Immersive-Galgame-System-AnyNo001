import {
    buildNarrativeSegments,
    buildSegmentImageMap,
    parseImageSlots,
} from './image-slots.js';
import { extractSceneDirectives } from './scene-directives.js';
import { parseSceneText } from './text-parser.js';

export const DEFAULT_SOURCE_FILTER = Object.freeze({
    enabled: true,
    stripHtmlComments: true,
    allowUntaggedFallback: false,
    textIncludeTags: 'content',
    textExcludeTags: 'thinking\nSubtext_think\nStatus_block\ntext_to_image\nparallel_world\naftertalk\nimage',
    imageIncludeTags: 'image\ntext_to_image',
    imageExcludeTags: '',
});

export const DEFAULT_VIRTUAL_REGEX = Object.freeze({
    enabled: true,
    pattern: '\\[igs-char:([^|\\]]+)\\|[^|\\]]+\\|([^\\]]+)\\]',
    flags: 'gm',
    replacement: '[$1]：$2',
});

const SENTENCE_PAGING_TERMINATOR = '。';

const THOUGHT_RE_GLOBAL = /\[igs-thought:([^|\]]+)\|[^|\]]+\|([^\]]+)\]/gm;

// 数据层正文里是否含 IGS 场景标签（给 AI 看的格式标记）。宿主前端会用正则把这些
// 标签从渲染层 .mes_text 隐藏，所以「数据层有标签、DOM 无标签」是渲染清洗造成的
// 结构性差异，绝不能当成关键词插件改词而用 DOM 覆盖数据层。
const IGS_DIRECTIVE_TAG_RE = /\[igs-(?:scene|char|thought):/;
const IGS_DIRECTIVE_LINE_RE = /^\[igs-(?:scene|char|thought):[^\]]*\]/;

function hasIgsDirectiveTags(text) {
    return IGS_DIRECTIVE_TAG_RE.test(String(text || ''));
}

const HOST_UI_HTML_MARKERS = Object.freeze([
    'api connections',
    'rightnavholder',
    'drawer-opener',
    'sys-settings-button',
    'menu_button',
    'flex-container',
    'extensionsmenubutton',
    'send_textarea',
    'right-nav',
]);

const MESSAGE_TEXT_KEYS = Object.freeze([
    'rawHtml',
    'html',
    'mes_html',
    'message_html',
    'text',
    'message',
    'content',
    'mes',
]);

export function getMessagePrimaryText(message) {
    if (typeof message === 'string') return message;
    if (!message || typeof message !== 'object') return '';

    for (const key of MESSAGE_TEXT_KEYS) {
        const value = message[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }

    if (typeof message.raw === 'string' && message.raw.trim()) {
        return message.raw;
    }

    if (message.raw && typeof message.raw === 'object' && message.raw !== message) {
        return getMessagePrimaryText(message.raw);
    }

    return '';
}

export function getVisibleMessageTextFromElement(mesElement) {
    if (!mesElement || typeof mesElement.querySelector !== 'function') return '';
    const mesText = mesElement.querySelector('.mes_text') || mesElement;
    if (!mesText || typeof mesText.cloneNode !== 'function') return '';
    const cloneNode = mesText.cloneNode(true);
    if (typeof cloneNode.querySelectorAll === 'function') {
        cloneNode.querySelectorAll('script,style,iframe,button,[role="button"],[data-igs-internal-reader],.igs-img-ph,.igs-image-placeholder,[data-igs-image-placeholder="1"],.mes_buttons,.extraMesButtons').forEach((node) => {
            if (node && typeof node.remove === 'function') node.remove();
        });
    }
    const text = typeof cloneNode.innerText === 'string' && cloneNode.innerText
        ? cloneNode.innerText
        : cloneNode.textContent;
    return normalizeWhitespace(text);
}

export function looksLikeHostUiHtml(text) {
    const source = String(text || '').trim();
    if (!source) return false;
    const lower = source.toLowerCase();
    const htmlLike = /<[^>]+>/.test(source);

    if (HOST_UI_HTML_MARKERS.some((marker) => lower.includes(marker))) {
        return true;
    }

    if (!htmlLike) return false;
    if (/<(?:button|input|textarea|select|nav|header|footer|aside)\b/i.test(source)) {
        return true;
    }
    if (!/<content\b/i.test(source) && /<(?:div|span|section|article|svg|path)\b/i.test(source) && /(class=|data-i18n=|aria-|role=)/i.test(source)) {
        return true;
    }
    return false;
}

export function cleanNarrativeSource(text) {
    let cleaned = String(text || '');
    cleaned = cleaned.replace(/<\/content>\s*<content[^>]*>/gi, '\n\n');
    cleaned = cleaned.replace(/<image[^>]*>[\s\S]*?<\/image>/gi, ' \x00IMG\x00 ');
    cleaned = cleaned.replace(/<imgthink[^>]*>[\s\S]*?<\/imgthink>/gi, '');
    cleaned = cleaned.replace(/image###[\s\S]*?###/gi, '');
    cleaned = cleaned.replace(/<!--([\s\S]*?)-->/g, ' $1 ');
    cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    cleaned = cleaned.replace(/【[^】\n]{0,100}】/g, '');
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    cleaned = cleaned.replace(/\r/g, '');
    return cleaned;
}

export function normalizeSourceFilter(value) {
    const source = isPlainObject(value) ? value : {};
    const merged = { ...DEFAULT_SOURCE_FILTER, ...source };
    return {
        enabled: Boolean(merged.enabled),
        stripHtmlComments: Boolean(merged.stripHtmlComments),
        allowUntaggedFallback: merged.allowUntaggedFallback !== false,
        textIncludeTags: normalizeTagText(merged.textIncludeTags),
        textExcludeTags: normalizeTagText(merged.textExcludeTags),
        imageIncludeTags: normalizeTagText(merged.imageIncludeTags),
        imageExcludeTags: normalizeTagText(merged.imageExcludeTags),
    };
}

export function normalizeVirtualRegex(value) {
    const source = isPlainObject(value) ? value : {};
    const merged = { ...DEFAULT_VIRTUAL_REGEX, ...source };
    return {
        enabled: merged.enabled !== false,
        pattern: String(merged.pattern == null ? DEFAULT_VIRTUAL_REGEX.pattern : merged.pattern),
        flags: String(merged.flags == null ? DEFAULT_VIRTUAL_REGEX.flags : merged.flags).replace(/\s+/g, ''),
        replacement: String(merged.replacement == null ? DEFAULT_VIRTUAL_REGEX.replacement : merged.replacement),
    };
}

export function buildBridgeImageSource(raw, filter) {
    const cfg = normalizeSourceFilter(filter);
    let source = String(raw || '');
    if (!cfg.enabled) return source;
    if (cfg.stripHtmlComments) source = stripHtmlComments(source);
    source = removeTagBlocks(source, cfg.imageExcludeTags);
    const includeTags = parseTagList(cfg.imageIncludeTags);
    if (includeTags.length) {
        const includeLower = includeTags.map((tag) => tag.toLowerCase());
        let searchable = source;
        if (!includeLower.includes('text_to_image')) searchable = removeTagBlocks(searchable, 'text_to_image');
        source = extractTagBlocks(searchable, includeTags, true).join('\n\n');
    }
    source = removeTagBlocks(source, cfg.imageExcludeTags);
    return source.trim();
}

export function applyImmersiveGalgameSystemBodyFormat(raw, rule) {
    const source = String(raw || '');
    const cfg = normalizeVirtualRegex(rule);
    const result = {
        raw: source,
        formattedRaw: source,
        formatSourceKind: cfg.enabled ? 'body-format' : 'raw',
        virtualRegexChanged: false,
        virtualRegexError: '',
    };

    if (!cfg.enabled || !cfg.pattern) {
        result.formatSourceKind = 'raw';
        return result;
    }

    try {
        const regex = new RegExp(cfg.pattern, cfg.flags);
        result.formattedRaw = source.replace(regex, cfg.replacement);
        result.formattedRaw = result.formattedRaw.replace(THOUGHT_RE_GLOBAL, '*$2*');
        result.virtualRegexChanged = result.formattedRaw !== source;
        if (!result.virtualRegexChanged) result.formatSourceKind = 'raw';
    } catch (error) {
        result.formattedRaw = source;
        result.formatSourceKind = 'body-format-error';
        result.virtualRegexError = error instanceof Error ? error.message : String(error);
    }

    return result;
}

export function buildFormattedReaderSource(formattedText, imageSource) {
    const parts = [
        '<now_plot>',
        '<content data-igs-formatted="1">',
        String(formattedText || '').trim(),
        '</content>',
        '</now_plot>',
    ];
    const images = String(imageSource || '').trim();
    if (images) parts.push(images);
    return parts.join('\n');
}

export function applySentencePaging(text, options = {}) {
    const source = String(text || '');
    if (!source.trim()) return source;
    const narrationOnly = Boolean(options.narrationOnly);
    return source
        .split('\n')
        .map((line) => splitSentenceLine(line, narrationOnly))
        .join('\n');
}

function splitSentenceLine(line, narrationOnly) {
    const trimmed = line.trim();
    if (!trimmed) return line;
    // 跳过非旁白行：场景素材模式下，对话([名字]：…)和心理活动(*…*)整行保留，
    // 只在旁白行按句号断页，否则会把对话/心理拆碎、丢失气泡样式和角色名归属。
    if (narrationOnly && !isNarrationLine(trimmed)) return line;
    // \x00IMG\x00 是图片占位，不能被句号切断；保护标签/心理/插图块内部的句号。
    if (/\x00IMG\x00/.test(line) || /image###/i.test(line) || /^\s*\[[^\]]+\]\s*$/.test(trimmed)) return line;
    return line.replace(
        new RegExp(`${SENTENCE_PAGING_TERMINATOR}(?!\\s*$)(?![\\s${SENTENCE_PAGING_TERMINATOR}」』”’）)\\]】])`, 'g'),
        `${SENTENCE_PAGING_TERMINATOR}\n`,
    );
}

function isNarrationLine(trimmed) {
    if (/^\*[\s\S]*\*$/.test(trimmed)) return false;
    if (/^\[[^\]]+\]\s*[:：]/.test(trimmed)) return false;
    if (/^[^:：\n]{1,24}\s*[:：]\s*\S/.test(trimmed) && !trimmed.startsWith('@')) return false;
    return true;
}

export function buildFormattedTextPipeline(raw, sourceFilter, formatRule, options = {}) {
    const cfg = normalizeSourceFilter(sourceFilter);
    const visibleText = typeof options.visibleText === 'string' ? options.visibleText : '';
    const filtered = buildFilteredTextSource(raw, cfg, visibleText);
    const imageSource = buildBridgeImageSource(raw, cfg);
    const directiveResult = options.sceneAssetsEnabled
        ? extractSceneDirectives(filtered.textSource)
        : { directives: [], strippedText: filtered.textSource };
    const formatted = applyImmersiveGalgameSystemBodyFormat(filtered.textSource, formatRule);
    const formattedText = String(formatted.formattedRaw || '').trim();

    return {
        raw: String(raw || ''),
        tagText: filtered.textSource,
        textSource: filtered.textSource,
        formattedText,
        formattedRaw: buildFormattedReaderSource(formattedText, imageSource),
        imageSource,
        sourceKind: filtered.sourceKind,
        expectedTags: filtered.expectedTags || '',
        formatSourceKind: formatted.formatSourceKind,
        virtualRegexChanged: formatted.virtualRegexChanged,
        virtualRegexError: formatted.virtualRegexError,
        sceneDirectives: directiveResult.directives,
    };
}

export function buildIgsTextPayload(message, options = {}) {
    const raw = getMessagePrimaryText(message);
    const sourceFilter = normalizeSourceFilter(options.sourceFilter);
    const virtualRegex = normalizeVirtualRegex(options.virtualRegex);
    const visibleText = resolveVisibleText(message, options.visibleText);
    const sceneAssetsEnabled = Boolean(options.sceneAssets && options.sceneAssets.enabled);
    const sentencePagingEnabled = Boolean(options.sentencePaging);
    const strictPayload = buildFormattedTextPipeline(raw, sourceFilter, virtualRegex, { visibleText, sceneAssetsEnabled });
    const cleanedRaw = normalizeWhitespace(cleanNarrativeSource(raw));
    const warnings = [];
    const errors = [];

    let formattedText = strictPayload.formattedText;
    let sourceKind = strictPayload.sourceKind;
    let formatSourceKind = strictPayload.formatSourceKind;
    let sceneDirectives = strictPayload.sceneDirectives || [];
    let usedFallback = false;
    let usedDomOverride = false;

    if (looksLikeHostUiHtml(raw)) {
        warnings.push({ code: 'host-ui-html-raw', message: 'Raw message looks like host UI HTML.' });
    }

    if (!formattedText || looksLikeHostUiHtml(formattedText)) {
        formattedText = firstNonEmpty(
            !looksLikeHostUiHtml(strictPayload.formattedText) ? strictPayload.formattedText : '',
            visibleText,
            cleanedRaw,
            String(raw || '').trim(),
        );
        sourceKind = formattedText ? 'forced-fallback' : (sourceKind || 'empty-forced');
        formatSourceKind = strictPayload.formattedText ? strictPayload.formatSourceKind : 'forced-fallback';
        usedFallback = formattedText !== strictPayload.formattedText;
    }

    if (looksLikeHostUiHtml(formattedText)) {
        errors.push({ code: 'host-ui-html-leaked', message: 'Extracted text still looks like host UI HTML.' });
        formattedText = firstNonEmpty(
            visibleText,
            cleanedRaw && !looksLikeHostUiHtml(cleanedRaw) ? cleanedRaw : '',
            '',
        );
    }

    formattedText = normalizeWhitespace(formattedText);

    // DOM 差异优先：第三方关键词过滤插件（如 Veridis）会改渲染层 .mes_text，
    // 且在生成结束后写回 chat[n].mes，但回写可能延迟或在历史消息上未触发。
    // 当 DOM 可见文本与数据层纯文本只是局部（词级）不同时，信任 DOM。
    // 指令标签单独处理：宿主前端会把 [igs-scene/char/thought:] 从 .mes_text 清洗掉，
    // 所以"DOM 无标签、数据层有标签"是宿主正常行为，不是插件改词。
    // 文本覆盖和指令来源解耦：
    //   - DOM 文本覆盖照常进行（让 Veridis 替换词进阅读器）
    //   - 场景指令始终从数据层原文提取（DOM 里没有标签，不能从 DOM 重提）
    // 长度比对用 domCompareBase：domClobbersDirectiveTags 时去掉指令行，
    // 避免标签内容撑大数据层长度后被 localizedTextDiffers 误判为"不同内容"。
    const domVisibleText = normalizeWhitespace(visibleText);
    const domClobbersDirectiveTags = hasIgsDirectiveTags(raw) && !hasIgsDirectiveTags(domVisibleText);
    const domCompareBase = domClobbersDirectiveTags
        ? normalizeWhitespace(buildDomCompareBase(formattedText))
        : cleanedRaw;
    if (domVisibleText
        && !looksLikeHostUiHtml(domVisibleText)
        && localizedTextDiffers(domCompareBase, domVisibleText)) {
        // DOM 文本可能仍含 [igs-char/thought:] 原始标签（宿主没清洗）。必须先跑正文格式化，
        // 把标签转成气泡/心理话形态（[名]：… 与 *…*），否则阅读器把整段当旁白、丢失角色名。
        const domFormatted = applyImmersiveGalgameSystemBodyFormat(domVisibleText, virtualRegex);
        formattedText = normalizeWhitespace(domFormatted.formattedRaw || domVisibleText);
        sourceKind = 'dom-visible-override';
        formatSourceKind = 'dom-visible-override';
        usedDomOverride = true;
        // domClobbersDirectiveTags：宿主把指令标签从 DOM 清洗掉了，DOM 里没有标签，
        // 不能从 DOM 重提指令——保留数据层已提取的 sceneDirectives。
        if (!domClobbersDirectiveTags) {
            sceneDirectives = sceneAssetsEnabled
                ? extractSceneDirectives(domVisibleText).directives
                : sceneDirectives;
        }
    }

    if (sceneAssetsEnabled && !sceneDirectives.length) {
        sceneDirectives = extractSceneDirectives(firstNonEmpty(
            formattedText,
            visibleText,
            cleanedRaw,
            String(raw || '').trim(),
        )).directives;
    }
    const readerScene = parseSceneText(formattedText, {});
    const readerText = normalizeReaderSegmentText(firstNonEmpty(
        readerScene.text,
        formattedText,
        visibleText,
        cleanedRaw,
        String(raw || '').trim(),
    ), readerScene.speaker);
    const pagedReaderText = sentencePagingEnabled
        ? applySentencePaging(readerText, { narrationOnly: sceneAssetsEnabled })
        : readerText;
    const textSegments = buildNarrativeSegments(pagedReaderText);
    const imageSlots = parseImageSlots(raw, strictPayload.imageSource, sourceFilter);
    const segmentImageSlots = pagedReaderText
        ? buildSegmentImageMap(raw, textSegments, imageSlots, { sceneAssetsMode: sceneAssetsEnabled })
        : [];

    if (usedFallback) {
        warnings.push({ code: 'forced-fallback', message: 'Fell back to visible text or cleaned raw source.' });
    }
    if (usedDomOverride) {
        warnings.push({ code: 'dom-visible-override', message: 'Used rendered DOM text over stale message data.' });
    }
    if (!formattedText) {
        errors.push({ code: 'empty-igs-text', message: 'No readable Immersive Galgame System text could be extracted.' });
    }

    return {
        raw,
        cleanedRaw,
        visibleText,
        tagText: strictPayload.tagText,
        textSource: formattedText,
        formattedText,
        formattedRaw: buildFormattedReaderSource(formattedText, strictPayload.imageSource),
        imageSource: strictPayload.imageSource,
        imageSlots,
        textSegments,
        segmentImageSlots,
        sceneDirectives,
        sourceKind,
        expectedTags: strictPayload.expectedTags,
        formatSourceKind,
        virtualRegexChanged: strictPayload.virtualRegexChanged,
        virtualRegexError: strictPayload.virtualRegexError,
        usedFallback,
        usedDomOverride,
        warnings,
        errors,
    };
}

function resolveVisibleText(message, fallbackVisibleText) {
    const explicit = normalizeWhitespace(fallbackVisibleText);
    if (explicit) return explicit;
    if (!message || typeof message !== 'object') return '';

    const fromMessage = normalizeWhitespace(message.visibleText);
    if (fromMessage) return fromMessage;

    const element = message.element || message.mesElement || message.domElement || message.node || null;
    return getVisibleMessageTextFromElement(element);
}

function buildFilteredTextSource(raw, filter, fallbackText) {
    const cfg = normalizeSourceFilter(filter);
    const source = String(raw || '');
    const includeTags = parseTagList(cfg.textIncludeTags);
    const hasIncludedTags = cfg.enabled && includeTags.length && hasTagBlocks(source, includeTags);

    if (cfg.enabled && includeTags.length && !hasIncludedTags) {
        return {
            textSource: '',
            sourceKind: 'tag-not-found',
            expectedTags: includeTags.join(', '),
        };
    }

    const taggedText = buildTagFilteredTextSource(source, cfg);
    let textSource = taggedText;
    let sourceKind = textSource ? (cfg.enabled ? 'tagged-content' : 'raw') : '';

    if (!textSource && hasIncludedTags) {
        return {
            textSource: '',
            sourceKind: 'tagged-empty',
            expectedTags: includeTags.join(', '),
        };
    }

    if (!textSource && (!cfg.enabled || !includeTags.length) && /<now_plot\b/i.test(source)) {
        const nowPlotMatch = source.match(/<now_plot\b[^>]*>([\s\S]*?)<\/now_plot>/i);
        if (nowPlotMatch && nowPlotMatch[1]) {
            textSource = removeTagBlocks(
                cfg.stripHtmlComments ? stripHtmlComments(nowPlotMatch[1]) : nowPlotMatch[1],
                cfg.textExcludeTags,
            ).trim();
            sourceKind = textSource ? 'tagged-now-plot' : '';
        }
    }

    if (!textSource && cfg.allowUntaggedFallback && (!cfg.enabled || !includeTags.length)) {
        textSource = String(fallbackText || '').trim() || cleanNarrativeSource(source).trim();
        sourceKind = textSource ? 'untagged-clean-text' : '';
    }

    return {
        textSource: String(textSource || '').trim(),
        sourceKind: sourceKind || 'empty',
        expectedTags: includeTags.join(', '),
    };
}

function buildTagFilteredTextSource(raw, filter) {
    const cfg = normalizeSourceFilter(filter);
    let source = String(raw || '');
    if (!cfg.enabled) return source;
    if (cfg.stripHtmlComments) source = stripHtmlComments(source);
    const includeTags = parseTagList(cfg.textIncludeTags);
    if (includeTags.length) {
        source = extractTagBlocks(source, includeTags).join('\n\n');
        if (!source) return '';
    }
    source = removeTagBlocks(source, cfg.textExcludeTags);
    return source.trim();
}

function parseTagList(text) {
    return String(text || '')
        .split(/[\n,，]+/)
        .map((tag) => tag.trim().replace(/^<+/, '').replace(/^\/+/, '').replace(/>+$/, '').replace(/\/+$/, '').trim())
        .filter(Boolean);
}

function normalizeTagText(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean).join('\n');
    }
    if (value == null) return '';
    return String(value);
}

function stripHtmlComments(raw) {
    return String(raw || '').replace(/<!--[\s\S]*?-->/g, '');
}

function extractTagBlocks(raw, tags, keepWrapper = false) {
    const source = String(raw || '');
    const parts = [];
    for (const tag of parseTagList(tags)) {
        const regex = new RegExp(`(^|[\\s>])(<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>)`, 'gi');
        let match = null;
        while ((match = regex.exec(source)) !== null) {
            parts.push(keepWrapper ? (match[2] || '') : (match[3] || ''));
        }
    }
    return parts;
}

function removeTagBlocks(raw, tags) {
    let output = String(raw || '');
    for (const tag of parseTagList(tags)) {
        const regex = new RegExp(`(^|[\\s>])<${escapeRegExp(tag)}\\b[^>]*>[\\s\\S]*?<\\/${escapeRegExp(tag)}>`, 'gi');
        output = output.replace(regex, (match, prefix) => prefix || '');
    }
    return output;
}

function hasTagBlocks(raw, tags) {
    const source = String(raw || '');
    return parseTagList(tags).some((tag) => {
        const regex = new RegExp(`(^|[\\s>])<${escapeRegExp(tag)}\\b[^>]*>[\\s\\S]*?<\\/${escapeRegExp(tag)}>`, 'i');
        return regex.test(source);
    });
}

function normalizeWhitespace(text) {
    return String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function firstNonEmpty(...values) {
    for (const value of values) {
        const text = normalizeWhitespace(value);
        if (text) return text;
    }
    return '';
}

function compactForCompare(text) {
    return String(text || '')
        .replace(/\x00IMG\x00/g, '')
        .replace(/\s+/g, '')
        .trim();
}

// 判断 DOM 可见文本相对数据层纯文本是否只是"词级"差异（关键词过滤插件改词）。
// 返回 true 才允许用 DOM 覆盖。两者长度量级接近且高度相似才认定为同一段被改词的正文，
// 避免把"不同消息 / 被截断的 DOM / 宿主 UI 噪声"误判成改后正文。
function localizedTextDiffers(dataText, domText) {
    const dataCompact = compactForCompare(dataText);
    const domCompact = compactForCompare(domText);
    if (!domCompact || domCompact === dataCompact) return false;
    if (!dataCompact) return false;

    const longer = Math.max(dataCompact.length, domCompact.length);
    const shorter = Math.min(dataCompact.length, domCompact.length);
    // 长度差超过 40% 视为结构性差异（截断/不同消息），不覆盖。
    if (shorter / longer < 0.6) return false;

    const distance = boundedLevenshtein(dataCompact, domCompact, Math.ceil(longer * 0.5));
    if (distance < 0) return false;
    // 改动字符占比超过 50% 视为内容不同，不覆盖。
    return distance / longer <= 0.5;
}

function boundedLevenshtein(a, b, maxDistance) {
    const lenA = a.length;
    const lenB = b.length;
    if (Math.abs(lenA - lenB) > maxDistance) return -1;
    let prev = new Array(lenB + 1);
    let curr = new Array(lenB + 1);
    for (let j = 0; j <= lenB; j++) prev[j] = j;
    for (let i = 1; i <= lenA; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        const charA = a.charCodeAt(i - 1);
        for (let j = 1; j <= lenB; j++) {
            const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > maxDistance) return -1;
        const swap = prev;
        prev = curr;
        curr = swap;
    }
    return prev[lenB];
}

function normalizeReaderSegmentText(text, speaker = '') {
    let normalized = normalizeWhitespace(String(text || '').replace(/\x00IMG\x00/g, ' '));
    const speakerName = normalizeWhitespace(speaker);
    if (!speakerName || !normalized) return normalized;
    const escaped = escapeRegExp(speakerName);
    normalized = normalized.replace(new RegExp(`^${escaped}\\s*[:：]\\s*`), '');
    return normalizeWhitespace(normalized);
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripIgsDirectiveLines(text) {
    return String(text || '').split('\n')
        .filter(line => !IGS_DIRECTIVE_LINE_RE.test(line.trim()))
        .join('\n');
}

// domClobbersDirectiveTags 时的对比基准：从已格式化文本去掉 [igs-scene:] 行，
// 并把 *心理话* 和 [名字]：对白 还原为纯内容，使其与 DOM（宿主隐藏标签后的纯文本）
// 结构对齐——只剩词级差异，让 localizedTextDiffers 正确判断 Veridis 是否改过词。
function buildDomCompareBase(formattedText) {
    return String(formattedText || '').split('\n')
        .filter(line => !IGS_DIRECTIVE_LINE_RE.test(line.trim()))
        .map(line => {
            const s = line.trim();
            const thoughtMatch = s.match(/^\*([\s\S]*)\*$/);
            if (thoughtMatch) return thoughtMatch[1];
            const dialogueMatch = s.match(/^\[[^\]]+\]\s*[:：]\s*([\s\S]*)$/);
            if (dialogueMatch) return dialogueMatch[1];
            return line;
        })
        .join('\n');
}
