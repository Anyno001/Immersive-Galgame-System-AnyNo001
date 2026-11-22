import { LOG_EMOTIONS, LOG_MOOD_SIZES, LOG_PER_TAP_MAX, LOG_PER_TAP_MIN, LOG_SPEEDS } from './log-reader-settings.js';

// 线上聊天阅读模式的设置：与纵向阅读模式互斥并列，取景 adjust 不另存，读写都走 logReader.adjust。
export const CHAT_READER_RADII = Object.freeze([0, 4, 8, 12, 16, 20, 24]);
export const CHAT_READER_DIMS = Object.freeze([0, 0.2, 0.3, 0.45, 0.6]);
export const CHAT_READER_NARRS = Object.freeze(['bar', 'shadow']);
export const CHAT_READER_AVATARS = Object.freeze(['card', 'circle']);
export const CHAT_READER_GAPS = Object.freeze({ compact: 14, normal: 20, wide: 28 });
export const CHAT_READER_FONT_MIN = 13;
export const CHAT_READER_FONT_MAX = 19;

const HEX = /^#[0-9a-f]{6}$/i;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nearest(value, list, fallback) {
    const n = Number(value);
    return list.includes(n) ? n : fallback;
}

export function normalizeChatReaderSettings(value) {
    const src = plain(value);
    const fontSize = Number(src.fontSize);
    return {
        on: src.on === true,
        enabled: src.on === true,
        radius: nearest(src.radius, CHAT_READER_RADII, 16),
        fontSize: Number.isFinite(fontSize) ? Math.round(Math.max(CHAT_READER_FONT_MIN, Math.min(CHAT_READER_FONT_MAX, fontSize))) : 15,
        leftColor: HEX.test(src.leftColor) ? src.leftColor.toLowerCase() : '#ffffff',
        rightColor: HEX.test(src.rightColor) ? src.rightColor.toLowerCase() : '#95ec69',
        followTheme: src.followTheme === true,
        thoughtClear: src.thoughtClear !== false,
        narr: CHAT_READER_NARRS.includes(src.narr) ? src.narr : 'bar',
        typing: src.typing !== false,
        dim: nearest(src.dim, CHAT_READER_DIMS, 0.3),
        avatar: CHAT_READER_AVATARS.includes(src.avatar) ? src.avatar : 'card',
        charAvatar: src.charAvatar !== false,
        userAvatar: src.userAvatar === true,
        groupGap: Object.hasOwn(CHAT_READER_GAPS, src.groupGap) ? src.groupGap : 'normal',
        perTap: Math.round(Math.max(LOG_PER_TAP_MIN, Math.min(LOG_PER_TAP_MAX, Number.isFinite(Number(src.perTap)) ? Number(src.perTap) : 4))),
        chain: src.chain !== false,
        speed: Object.hasOwn(LOG_SPEEDS, src.speed) ? src.speed : 'normal',
        scrubber: src.scrubber === true,
        emotion: LOG_EMOTIONS.includes(src.emotion) ? src.emotion : 'once',
        chip: src.chip !== false,
        moodSize: LOG_MOOD_SIZES.includes(src.moodSize) ? src.moodSize : 'm',
    };
}
