import { normalizeEmotionList } from './stage-shake-runtime.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';

export const MANGA_SYMBOL_KINDS = Object.freeze(['anger', 'sweat', 'heart', 'surprise', 'silence', 'gloom', 'sparkle']);
export const MANGA_SYMBOL_LABELS = Object.freeze({
    anger: '青筋（怒）', sweat: '汗滴', heart: '爱心', surprise: '!?', silence: '……', gloom: '阴沉竖线', sparkle: '闪光',
});
export const FX_TAG_LABELS = Object.freeze({
    call: '来电 / 通话', notify: '通知横幅', flashback: '回忆滤镜', dream: '梦境滤镜', letterbox: '电影黑边', sfx: '拟声词', eye: '睁眼 / 闭眼',
});

const freezeList = (list) => Object.freeze(list.slice());

export const MANGA_FX_DEFAULT_SYMBOLS = Object.freeze({
    anger: freezeList(['生气', '愤怒', '恼火', '气愤', '暴怒', '恼怒', '发火', '不爽']),
    sweat: freezeList(['尴尬', '无奈', '窘迫', '心虚', '慌张', '汗颜', '局促']),
    heart: freezeList(['心动', '喜欢', '爱慕', '陶醉', '着迷', '甜蜜', '痴迷']),
    surprise: freezeList(['疑惑', '困惑', '惊疑', '不解', '纳闷', '讶异']),
    silence: freezeList(['无语', '沉默', '语塞', '冷淡', '呆滞', '发呆']),
    gloom: freezeList(['阴沉', '郁闷', '沮丧', '失落', '绝望', '消沉', '黑脸']),
    sparkle: freezeList(['兴奋', '期待', '得意', '雀跃', '憧憬', '自豪']),
});
export const MANGA_FX_DEFAULT_SPEED_LINES = freezeList(['震惊', '震撼', '惊骇', '骇然', '决然', '坚决', '激昂']);
export const HEARTBEAT_FX_DEFAULT_LOVE = freezeList(['心动', '害羞', '脸红', '羞涩', '心跳加速', '小鹿乱撞']);
export const HEARTBEAT_FX_DEFAULT_TENSE = freezeList(['紧张', '害怕', '恐惧', '不安', '惊恐', '焦虑']);
export const FLASH_FX_DEFAULT_EMOTIONS = freezeList(['崩溃', '恍然大悟', '茫然', '眩晕', '晕眩', '呆住']);

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export const TITLE_CARD_SPEEDS = Object.freeze(['fast', 'medium', 'slow']);

export function normalizeTitleCardSettings(value) {
    const src = plain(value);
    const speed = TITLE_CARD_SPEEDS.includes(src.speed) ? src.speed : 'medium';
    return { enabled: src.enabled === true, onLocation: src.onLocation !== false, onTime: src.onTime !== false, speed };
}

export function normalizeMangaFxSettings(value) {
    const src = plain(value);
    const symbolsSrc = plain(src.symbols);
    const symbols = {};
    for (const kind of MANGA_SYMBOL_KINDS) symbols[kind] = normalizeEmotionList(symbolsSrc[kind], MANGA_FX_DEFAULT_SYMBOLS[kind]);
    return { enabled: src.enabled === true, symbols, speedLines: normalizeEmotionList(src.speedLines, MANGA_FX_DEFAULT_SPEED_LINES) };
}

export function normalizeHeartbeatFxSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        love: normalizeEmotionList(src.love, HEARTBEAT_FX_DEFAULT_LOVE),
        tense: normalizeEmotionList(src.tense, HEARTBEAT_FX_DEFAULT_TENSE),
    };
}

export function normalizeFlashFxSettings(value) {
    const src = plain(value);
    return { enabled: src.enabled === true, emotions: normalizeEmotionList(src.emotions, FLASH_FX_DEFAULT_EMOTIONS) };
}

export function normalizeFavorToastSettings(value) {
    return { enabled: plain(value).enabled === true };
}

export function normalizeFxTagsSettings(value) {
    const src = plain(value);
    const out = { enabled: src.enabled === true };
    for (const kind of FX_TAG_KINDS) out[kind] = src[kind] !== false;
    return out;
}

export const FX_MOTION_STYLES = Object.freeze(['smooth', 'snappy']);
export const FX_HOLD_LEVELS = Object.freeze(['short', 'medium', 'long']);
export const FX_HOLD_SCALE = Object.freeze({ short: 0.65, medium: 1, long: 1.6 });

export function normalizeFxStyleSettings(value) {
    const src = plain(value);
    return {
        motion: FX_MOTION_STYLES.includes(src.motion) ? src.motion : 'smooth',
        hold: FX_HOLD_LEVELS.includes(src.hold) ? src.hold : 'medium',
        replay: src.replay === true,
    };
}

export function normalizeFxSoundSettings(value) {
    const src = plain(value);
    const volume = Number(src.volume);
    return { enabled: src.enabled !== false, volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.5 };
}

export const FX_SETTINGS_NORMALIZERS = Object.freeze({
    titleCard: normalizeTitleCardSettings,
    mangaFx: normalizeMangaFxSettings,
    heartbeatFx: normalizeHeartbeatFxSettings,
    flashFx: normalizeFlashFxSettings,
    favorToast: normalizeFavorToastSettings,
    fxTags: normalizeFxTagsSettings,
    fxSound: normalizeFxSoundSettings,
    fxStyle: normalizeFxStyleSettings,
});

export const FX_FEATURE_KEYS = Object.freeze(['titleCard', 'mangaFx', 'heartbeatFx', 'flashFx', 'favorToast', 'fxTags']);

export function normalizeFxReaderSettings(reader) {
    const src = plain(reader);
    const out = {};
    for (const [key, normalize] of Object.entries(FX_SETTINGS_NORMALIZERS)) out[key] = normalize(src[key]);
    return out;
}

export function enabledFxTagKinds(settings) {
    const fxTags = normalizeFxTagsSettings(settings);
    return fxTags.enabled ? FX_TAG_KINDS.filter((kind) => fxTags[kind]) : [];
}

// 可编辑词表的设置路径白名单：设置动作只接受这些路径，防止任意写入。
export const FX_WORD_LIST_PATHS = Object.freeze([
    ...MANGA_SYMBOL_KINDS.map((kind) => `mangaFx.symbols.${kind}`),
    'mangaFx.speedLines',
    'heartbeatFx.love',
    'heartbeatFx.tense',
    'flashFx.emotions',
]);

function emotionOf(value) {
    return String(value == null ? '' : value).trim();
}

// 以下 pick* 接收已规范化的设置，供每次渲染只规范化一次的运行时直接调用。
export function pickMangaSymbol(target, manga) {
    if (!manga.enabled || !target) return '';
    return MANGA_SYMBOL_KINDS.find((kind) => manga.symbols[kind].includes(target)) || '';
}

export function pickSpeedLines(target, manga) {
    return manga.enabled && Boolean(target) && manga.speedLines.includes(target);
}

export function pickHeartbeat(target, heartbeat) {
    if (!heartbeat.enabled || !target) return '';
    if (heartbeat.love.includes(target)) return 'love';
    if (heartbeat.tense.includes(target)) return 'tense';
    return '';
}

export function pickFlash(target, flash) {
    return flash.enabled && Boolean(target) && flash.emotions.includes(target);
}

export function matchMangaSymbol(emotion, settings) {
    return pickMangaSymbol(emotionOf(emotion), normalizeMangaFxSettings(settings));
}

export function matchSpeedLines(emotion, settings) {
    return pickSpeedLines(emotionOf(emotion), normalizeMangaFxSettings(settings));
}

export function matchHeartbeat(emotion, settings) {
    return pickHeartbeat(emotionOf(emotion), normalizeHeartbeatFxSettings(settings));
}

export function matchFlash(emotion, settings) {
    return pickFlash(emotionOf(emotion), normalizeFlashFxSettings(settings));
}
