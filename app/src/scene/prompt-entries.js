// 按需提示词块的世界书式条目：每块 常驻/关键词/关闭，可改关键词、次要词、排除词、扫描范围、黏性、冷却。
// 默认值等于改版前的行为：关键词触发、扫用户输入 + AI 上 1 楼、无次要词与排除词、不黏、不冷却。

export const PROMPT_ENTRY_KEYS = Object.freeze(['chat', 'daily', 'battle', 'romance', 'live', 'feed', 'camera']);

export const PROMPT_ENTRY_LABELS = Object.freeze({
    chat: '线上聊天',
    daily: '日常',
    battle: '战斗',
    romance: '亲密',
    live: '直播',
    feed: '社区',
    camera: '镜头',
});

export const PROMPT_ENTRY_MODES = Object.freeze(['auto', 'always', 'off']);
export const PROMPT_ENTRY_SCAN_MAX = 5;
export const PROMPT_ENTRY_STICKY_MAX = 10;
export const PROMPT_ENTRY_COOLDOWN_MAX = 10;

export const DEFAULT_PROMPT_ENTRY = Object.freeze({ mode: 'auto', keys: '', secondary: '', exclude: '', scan: 1, sticky: 0, cooldown: 0 });

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizePromptEntry(value) {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        mode: PROMPT_ENTRY_MODES.includes(v.mode) ? v.mode : 'auto',
        keys: String(v.keys || '').trim(),
        secondary: String(v.secondary || '').trim(),
        exclude: String(v.exclude || '').trim(),
        scan: clampInt(v.scan, 0, PROMPT_ENTRY_SCAN_MAX, DEFAULT_PROMPT_ENTRY.scan),
        sticky: clampInt(v.sticky, 0, PROMPT_ENTRY_STICKY_MAX, 0),
        cooldown: clampInt(v.cooldown, 0, PROMPT_ENTRY_COOLDOWN_MAX, 0),
    };
}

// 只保留认识的块，返回新对象，入参不被改动。
export function normalizePromptEntries(value) {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(PROMPT_ENTRY_KEYS.map((key) => [key, normalizePromptEntry(v[key])]));
}

export function isPromptEntryKey(key) {
    return PROMPT_ENTRY_KEYS.includes(key);
}

// 关键词按 、，, 或换行分隔；/.../ 写法当正则，正则内的逗号不拆。
export function parsePromptKeywords(text) {
    const tokens = String(text || '').match(/\/(?:\\.|[^/\n])+\/[a-z]*|[^,，、\n]+/g) || [];
    return tokens.map((t) => t.trim()).filter(Boolean);
}

export function joinPromptKeywords(words) {
    return (Array.isArray(words) ? words : []).join('、');
}

// 把关键词编成匹配器：返回命中的那个词，未命中返回 ''。英文按不区分大小写比较。
export function compileKeywordMatcher(words) {
    const items = (Array.isArray(words) ? words : []).map((word) => {
        const re = word.match(/^\/(.+)\/([a-z]*)$/);
        if (re) {
            try { return { word, regex: new RegExp(re[1], re[2].replace(/[gy]/g, '')) }; } catch (error) { return { word, literal: word.toLowerCase() }; }
        }
        return { word, literal: word.toLowerCase() };
    });
    return (text) => {
        const source = String(text || '');
        if (!source || !items.length) return '';
        const lower = source.toLowerCase();
        for (const item of items) {
            if (item.regex) {
                const m = source.match(item.regex);
                if (m) return m[0];
            } else if (lower.includes(item.literal)) {
                return item.word;
            }
        }
        return '';
    };
}
