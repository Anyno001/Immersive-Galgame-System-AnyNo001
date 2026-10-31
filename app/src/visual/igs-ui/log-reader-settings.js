// 窄屏阅读模式的设置。不依赖其他模块，供 fx-settings 登记默认值与整理（与漫画演出模式同一处）。
export const LOG_AVATAR_SHAPES = Object.freeze(['card', 'circle', 'break']);
export const LOG_REVEALS = Object.freeze(['flow', 'type', 'fade']);
export const LOG_EMOTIONS = Object.freeze(['once', 'loop', 'off']);
// 情绪符号与胶囊的大小：大 = 与名字同高，小 = 名字的一半。
export const LOG_MOOD_SIZES = Object.freeze(['l', 'm', 's']);
export const LOG_EDGES = Object.freeze(['flush', 'normal', 'wide']);
// 渐变高度（占画面高度）与渐变浓度（整层不透明度）共用一组档位：50%～100%，每档 5%。
export const LOG_PERCENTS = Object.freeze([50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
export const LOG_PER_TAP_MIN = 1;
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
        // 只在窄屏或内嵌长屏生效，默认关。v0.37.61 默认开时存下的 enabled 不算数：开关改写 on，enabled 只是读出的别名。
        on: src.on === true,
        enabled: src.on === true,
        userAvatar: src.userAvatar !== false,
        userSide: src.userSide === 'right' ? 'right' : 'same',
        avatarShape: LOG_AVATAR_SHAPES.includes(src.avatarShape) ? src.avatarShape : 'card',
        emotion: LOG_EMOTIONS.includes(src.emotion) ? src.emotion : 'once',
        chip: src.chip !== false,
        // 连续播放：开着时点一下出一批（每次显示几条），逐条出字、念完接着出下一条；关了点一下只出一条。
        chain: src.chain !== false,
        moodSize: LOG_MOOD_SIZES.includes(src.moodSize) ? src.moodSize : 'm',
        // 离屏幕边缘：贴边 / 标准 / 宽松。
        edge: LOG_EDGES.includes(src.edge) ? src.edge : 'normal',
        reveal: LOG_REVEALS.includes(src.reveal) ? src.reveal : 'flow',
        perTap: Math.round(clamp(src.perTap, LOG_PER_TAP_MIN, LOG_PER_TAP_MAX, 4)),
        veil: LOG_PERCENTS.includes(Number(src.veil)) ? Number(src.veil) : 85,
        density: LOG_PERCENTS.includes(Number(src.density)) ? Number(src.density) : 100,
        adjust: normalizeAdjust(src.adjust),
    };
}
