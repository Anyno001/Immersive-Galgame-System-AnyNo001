// 窄屏阅读模式的设置。不依赖其他模块，供 fx-settings 登记默认值与整理（与漫画演出模式同一处）。
export const LOG_AVATAR_SHAPES = Object.freeze(['card', 'circle', 'break']);
export const LOG_REVEALS = Object.freeze(['flow', 'type', 'fade']);
export const LOG_EMOTIONS = Object.freeze(['once', 'loop', 'off']);
export const LOG_VEILS = Object.freeze([75, 85, 90]);
export const LOG_PER_TAP_MIN = 3;
export const LOG_PER_TAP_MAX = 5;

const ADJUST_LIMIT = Object.freeze({ x: 1.5, y: 1.5, zMin: 0.5, zMax: 3 });

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// 头像取景按角色（含服装）存：x / y 以头像宽为单位，z 为缩放倍率。
export function clampLogAdjust(item) {
    const src = plain(item);
    return {
        x: clamp(src.x, -ADJUST_LIMIT.x, ADJUST_LIMIT.x, 0),
        y: clamp(src.y, -ADJUST_LIMIT.y, ADJUST_LIMIT.y, 0),
        z: clamp(src.z, ADJUST_LIMIT.zMin, ADJUST_LIMIT.zMax, 1),
    };
}

function normalizeAdjust(value) {
    const out = {};
    for (const [key, raw] of Object.entries(plain(value))) {
        const name = String(key || '').trim().slice(0, 120);
        if (name) out[name] = clampLogAdjust(raw);
    }
    return out;
}

export function normalizeLogReaderSettings(value) {
    const src = plain(value);
    return {
        // 只在窄屏或内嵌长屏生效，默认开。
        enabled: src.enabled !== false,
        userAvatar: src.userAvatar !== false,
        userSide: src.userSide === 'right' ? 'right' : 'same',
        avatarShape: LOG_AVATAR_SHAPES.includes(src.avatarShape) ? src.avatarShape : 'card',
        emotion: LOG_EMOTIONS.includes(src.emotion) ? src.emotion : 'once',
        chip: src.chip !== false,
        reveal: LOG_REVEALS.includes(src.reveal) ? src.reveal : 'flow',
        perTap: Math.round(clamp(src.perTap, LOG_PER_TAP_MIN, LOG_PER_TAP_MAX, 4)),
        veil: LOG_VEILS.includes(Number(src.veil)) ? Number(src.veil) : 85,
        adjust: normalizeAdjust(src.adjust),
    };
}
