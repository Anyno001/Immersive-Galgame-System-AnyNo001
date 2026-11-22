export const STICKER_FREQS = Object.freeze(['low', 'mid', 'high']);
// 论坛可选的表情套组（线上聊天固定呆猫八条）；套组清单与素材见 sticker-catalog.js。
export const STICKER_SET_CHOICES = Object.freeze(['daimao', 'nga']);
const DISABLED_MAX = 600;
const OVERRIDES_MAX = 1000;
const OVERRIDE_EMOTIONS_MAX = 8;
const EMOTION_NAME_MAX = 12;
const DESC_MAX = 80;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeOverrides(value) {
    const out = {};
    let count = 0;
    for (const [rawKey, raw] of Object.entries(plain(value))) {
        const key = String(rawKey).trim().slice(0, 120);
        if (!key || key === '__proto__' || count >= OVERRIDES_MAX) continue;
        const src = plain(raw);
        const entry = {};
        if (Array.isArray(src.emotions)) {
            entry.emotions = [...new Set(src.emotions
                .filter((e) => typeof e === 'string')
                .map((e) => e.replace(/[[\]【】［］|\s]+/g, '').slice(0, EMOTION_NAME_MAX))
                .filter(Boolean))].slice(0, OVERRIDE_EMOTIONS_MAX);
        }
        const desc = typeof src.desc === 'string' ? src.desc.replace(/\s+/g, ' ').trim().slice(0, DESC_MAX) : '';
        if (desc) entry.desc = desc;
        if (!('emotions' in entry) && !desc) continue;
        out[key] = entry;
        count += 1;
    }
    return out;
}

// 内置表情包：on 总开关（只影响提示词注入；已有标签仍照常显示），freq 少 / 适中 / 多，
// disabled 是停用的图（文件名），挑图时跳过；set 是论坛使用的套组；
// overrides 是用户改过的图 { 文件名: { emotions: [情绪 id 或新情绪名], desc } }，只存差异。
export function normalizeStickerSettings(value) {
    const src = plain(value);
    const disabled = Array.isArray(src.disabled)
        ? [...new Set(src.disabled.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim().slice(0, 120)))].slice(0, DISABLED_MAX)
        : [];
    return {
        on: src.on !== false,
        freq: STICKER_FREQS.includes(src.freq) ? src.freq : 'low',
        disabled,
        set: STICKER_SET_CHOICES.includes(src.set) ? src.set : 'daimao',
        overrides: normalizeOverrides(src.overrides),
    };
}
