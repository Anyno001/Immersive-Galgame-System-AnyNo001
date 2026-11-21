import { forumPromptText } from './forum-reader-lines.js';
import { FORUM_MODES, FORUM_PALETTE_IDS } from './forum-reader-palettes.js';
import { LOG_PER_TAP_MAX, LOG_PER_TAP_MIN, LOG_REVEALS, LOG_SPEEDS } from './log-reader-settings.js';

// 论坛体阅读模式的设置：与纵向、线上聊天互斥并列。标题 / 板块 / 代号按聊天存（chatMetadata），不在这里。
export const FORUM_POSTERS = Object.freeze(['auto', 'char', 'witness', 'user', 'pair']);
export const FORUM_THOUGHTS = Object.freeze(['show', 'hide']);
export const FORUM_REPLIES = Object.freeze(['off', 'few', 'normal']);
export const FORUM_MOODS = Object.freeze(['off', 'all', 'random']);
// 台词引号由插件补：原文包住整句的引号在取行时已剥掉，这里按设置统一加回。
export const FORUM_QUOTE_MARKS = Object.freeze({ off: ['', ''], cn: ['“', '”'], jp: ['「', '」'] });
export const FORUM_PER_POST_MIN = 3;
export const FORUM_PER_POST_MAX = 16;
export const FORUM_FONT_MIN = 13;
export const FORUM_FONT_MAX = 19;
export const FORUM_LINE_MIN = 130;
export const FORUM_LINE_MAX = 230;
export const FORUM_GAP_MAX = 16;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback;
}

export function normalizeForumReaderSettings(value) {
    const src = plain(value);
    const out = {
        on: src.on === true,
        enabled: src.on === true,
        poster: FORUM_POSTERS.includes(src.poster) ? src.poster : 'auto',
        posterPair: [0, 1].map((i) => (Array.isArray(src.posterPair) && typeof src.posterPair[i] === 'string' ? src.posterPair[i].trim().slice(0, 80) : '')),
        othersThoughts: FORUM_THOUGHTS.includes(src.othersThoughts) ? src.othersThoughts : 'hide',
        replies: FORUM_REPLIES.includes(src.replies) ? src.replies : 'normal',
        perPost: clampInt(src.perPost, FORUM_PER_POST_MIN, FORUM_PER_POST_MAX, 8),
        fontSize: clampInt(src.fontSize, FORUM_FONT_MIN, FORUM_FONT_MAX, 14),
        lineHeight: clampInt(src.lineHeight, FORUM_LINE_MIN, FORUM_LINE_MAX, 175),
        paraGap: clampInt(src.paraGap, 0, FORUM_GAP_MAX, 5),
        palette: FORUM_PALETTE_IDS.includes(src.palette) ? src.palette : 'classic',
        mode: FORUM_MODES.includes(src.mode) ? src.mode : 'light',
        prompt: src.prompt !== false,
        perTap: Number(src.perTap) === 0 ? 0 : clampInt(src.perTap, LOG_PER_TAP_MIN, LOG_PER_TAP_MAX, 4),
        chain: src.chain !== false,
        speed: Object.hasOwn(LOG_SPEEDS, src.speed) ? src.speed : 'normal',
        scrubber: src.scrubber === true,
        // 情绪标签：off 关 / all 每组都标 / random 随机标一部分。旧版勾选项 showMood 迁移为 all。
        mood: FORUM_MOODS.includes(src.mood) ? src.mood : src.showMood === true ? 'all' : 'off',
        quote: Object.hasOwn(FORUM_QUOTE_MARKS, src.quote) ? src.quote : 'off',
        foldNsfw: src.foldNsfw !== false,
        promptRule: typeof src.promptRule === 'string' ? src.promptRule.trim().slice(0, 4000) : '',
        reveal: LOG_REVEALS.includes(src.reveal) ? src.reveal : 'off',
    };
    if (out.promptRule && out.promptRule === forumPromptText({ ...out, promptRule: '' }, null).trim()) out.promptRule = '';
    return out;
}
