export const DEFAULT_HTML_CARD_TAGS = 'htm1fenge';

// 占位行不能写成 [key:value]：parseSceneText 会把这类整行当场景标签吞掉。
const CARD_MARKER_RE = /^\s*\[igs-card#(\d+)\]\s*$/;

export function buildHtmlCardMarker(index) {
    return `[igs-card#${index}]`;
}

export function parseHtmlCardMarker(segment) {
    const match = String(segment == null ? '' : segment).match(CARD_MARKER_RE);
    return match ? Number(match[1]) : -1;
}

// 卡片块整块抠出、原位换成独占一行的占位符，让它单独成页且不被分页/格式化/清洗拆碎。
// 流式输出时闭合标签还没到，未闭合的块也先占位，避免把半截 HTML 当正文显示。
export function extractHtmlCards(raw, tags = []) {
    let text = String(raw || '');
    const cards = [];
    const tagList = (Array.isArray(tags) ? tags : []).filter(Boolean);
    if (!tagList.length) return { text, cards };
    const replaceBlock = (_match, inner) => {
        cards.push(String(inner || '').trim());
        return `\n${buildHtmlCardMarker(cards.length - 1)}\n`;
    };
    for (const tag of tagList) {
        const name = escapeRegExp(tag);
        text = text.replace(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'gi'), replaceBlock);
        text = text.replace(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*)$`, 'i'), replaceBlock);
    }
    return { text, cards };
}

const BLOCKED_ELEMENTS_RE = /<(script|iframe|frame|frameset|object|embed|applet|base|meta|link|form|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const BLOCKED_VOID_RE = /<(?:script|iframe|frame|object|embed|applet|base|meta|link|form|noscript)\b[^>]*\/?>/gi;
const EVENT_ATTR_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URL_RE = /\s+(href|src|xlink:href|action|formaction)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:text\/html)[^"'\s>]*\2/gi;

export function sanitizeHtmlCard(html) {
    return String(html || '')
        .replace(BLOCKED_ELEMENTS_RE, '')
        .replace(BLOCKED_VOID_RE, '')
        .replace(EVENT_ATTR_RE, '')
        .replace(SCRIPT_URL_RE, '');
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
