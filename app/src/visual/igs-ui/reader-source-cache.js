// 阅读源解析缓存：把与页码无关的正文解析结果按消息 + 输入签名缓存，
// 让普通翻页不再重复执行整楼正文过滤、正则、标签解析、分页与图位映射。

export const DEFAULT_SOURCE_CACHE_LIMIT = 8;

export function buildReaderSourceSignature(input = {}) {
    return [
        String(input.messageId == null ? '' : input.messageId),
        hashText(input.rawText),
        hashText(input.visibleText),
        hashText(input.sourceFilter),
        hashText(input.virtualRegex),
        input.sceneAssetsEnabled ? '1' : '0',
        input.sentencePaging ? '1' : '0',
    ].join('|');
}

export function createReaderSourceCache(options = {}) {
    const limit = Number(options.limit) > 0 ? Number(options.limit) : DEFAULT_SOURCE_CACHE_LIMIT;
    const parse = typeof options.parse === 'function' ? options.parse : null;
    const entries = new Map();
    let parseCount = 0;

    function get(signature, parseInput) {
        if (entries.has(signature)) {
            const hit = entries.get(signature);
            entries.delete(signature);
            entries.set(signature, hit);
            return { value: hit, hit: true };
        }
        if (!parse) return { value: null, hit: false };
        const value = parse(parseInput);
        parseCount += 1;
        entries.set(signature, value);
        while (entries.size > limit) {
            const oldest = entries.keys().next();
            if (oldest.done) break;
            entries.delete(oldest.value);
        }
        return { value, hit: false };
    }

    function invalidate(signature) {
        if (signature == null) entries.clear();
        else entries.delete(signature);
    }

    return { get, invalidate, size: () => entries.size, getParseCount: () => parseCount };
}

function hashText(value) {
    const text = typeof value === 'string' ? value : safeStringify(value);
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return `${text.length}:${hash >>> 0}`;
}

// 设置对象可能引用宿主 DOM（如 message.element -> defaultView -> document），
// 直接 JSON.stringify 会因为循环引用抛错。这里只序列化解析真正相关的纯值，
// 遇到循环或 DOM 节点时返回稳定占位符，绝不让签名计算影响阅读器主流程。
function safeStringify(value, seen = new Set()) {
    if (value == null) return '';
    const type = typeof value;
    if (type === 'string') return value;
    if (type === 'number' || type === 'boolean') return String(value);
    if (type === 'function') return '[fn]';
    if (type !== 'object') return String(value);
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return '[' + value.map((item) => safeStringify(item, seen)).join(',') + ']';
        }
        if (typeof value.nodeType === 'number' || typeof value.querySelector === 'function') {
            return '[dom]';
        }
        return '{' + Object.keys(value).sort()
            .map((key) => `${key}:${safeStringify(value[key], seen)}`)
            .join(',') + '}';
    } finally {
        seen.delete(value);
    }
}
