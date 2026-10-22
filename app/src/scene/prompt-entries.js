// 按需提示词块的世界书式条目：每块 启用/常驻/关键词，可改注入位置与深度、正文。
// 默认值等于改版前的行为：关键词触发、扫用户输入 + AI 上 1 楼、跟随全局注入位置。

import { FX_PACKS_ACTIVE, FX_PACK_BLOCK_KEYS, packBlockKey } from './fx-packs.js';

export const PROMPT_ENTRY_KEYS = Object.freeze(['chat', 'daily', 'wardrobe', 'play', 'courtesy', 'campus', ...FX_PACK_BLOCK_KEYS, 'battle', 'creature', 'romance', 'live', 'feed', 'camera']);

export const PROMPT_ENTRY_LABELS = Object.freeze({
    chat: '线上聊天',
    daily: '日常',
    wardrobe: '换装登场',
    play: '玩乐',
    courtesy: '体贴礼仪',
    campus: '校园',
    ...Object.fromEntries(FX_PACKS_ACTIVE.map((pack) => [packBlockKey(pack.id), pack.label])),
    battle: '战斗',
    creature: '非人角色',
    romance: '亲密',
    live: '直播',
    feed: '社区',
    camera: '镜头',
});

export const PROMPT_ENTRY_MODES = Object.freeze(['auto', 'always', 'off']);
// 注入位置：空串 = 跟随全局 promptPlacement；system 系统说明区；depth0 聊天末尾；depth 指定深度（@D，倒数第 N 条消息处）。
export const PROMPT_ENTRY_POSITIONS = Object.freeze(['', 'system', 'depth0', 'depth']);
export const PROMPT_ENTRY_DEPTH_MAX = 99;
export const PROMPT_ENTRY_DEPTH_DEFAULT = 4;
export const PROMPT_ENTRY_TEXT_MAX = 6000;

// 排除词、次要词、黏性、冷却、扫描范围的界面已移除：旧存档里的这些值在规范化时丢弃，按「无排除、无次要、不黏、不冷却、扫用户输入 + AI 上 1 楼」运行。
export const DEFAULT_PROMPT_ENTRY = Object.freeze({ mode: 'auto', keys: '', position: '', depth: PROMPT_ENTRY_DEPTH_DEFAULT, text: '' });

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
        position: PROMPT_ENTRY_POSITIONS.includes(v.position) ? v.position : '',
        depth: clampInt(v.depth, 0, PROMPT_ENTRY_DEPTH_MAX, PROMPT_ENTRY_DEPTH_DEFAULT),
        // 正文覆盖：只给没有 readerSettings.fxPrompts 对应项的块用（换装、玩乐、校园、题材包）；空 = 用内置写法。
        text: typeof v.text === 'string' ? v.text.slice(0, PROMPT_ENTRY_TEXT_MAX) : '',
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

// 一条的实际注入位置：未写位置时返回 null（走全局通道：常驻进主段，命中的块进聊天末尾）。
export function resolveEntryPlacement(entry) {
    if (!entry || !entry.position) return null;
    if (entry.position === 'depth') return { position: 'depth', depth: clampInt(entry.depth, 0, PROMPT_ENTRY_DEPTH_MAX, PROMPT_ENTRY_DEPTH_DEFAULT) };
    return { position: entry.position, depth: 0 };
}

export const PROMPT_POSITION_LABELS = Object.freeze({ system: '系统说明区', depth0: '聊天末尾', depth: '指定深度' });
