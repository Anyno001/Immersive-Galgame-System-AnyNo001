import { normalizeEmotionList } from './stage-shake-runtime.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';
import { normalizeItemFxSettings } from './fx-item-model.js';
import { STAGE_DIRECTION_NORMALIZERS, STAGE_DIRECTION_WORD_LIST_PATHS } from './stage-direction-settings.js';
import { normalizeUiSoundSettings } from './ui-sfx.js';
import { normalizeAudioMasterSettings } from './audio-bus.js';
import { DANMAKU_SETTINGS_NORMALIZERS, DANMAKU_WORD_LIST_PATHS } from './danmaku-settings.js';
import { normalizeAmbientSoundSettings, normalizeBgmSettings } from './scene-audio.js';
import { normalizeTextFxSettings } from './text-fx.js';
import { normalizeBilingualSettings } from './bilingual-text.js';
import { normalizeClickWaitMarkSettings } from './click-wait-mark.js';
import { normalizeDailyFxSettings } from './fx-daily-model.js';
import { normalizeBattleFxSettings } from './fx-battle-model.js';
import { normalizeRomanceFxSettings } from './romance-settings.js';
import { normalizeMetaFxSettings } from './meta-settings.js';
import { normalizeResultFxSettings } from './fx-result-model.js';
import { COMIC_WORD_LIST_PATHS, normalizeComicModeSettings } from './comic-settings.js';
import { MANGA_BACK_WORD_LIST_PATHS, normalizeMangaBackSettings } from './manga-back.js';
import { normalizeCrowdFxSettings } from './crowd-fx.js';

// 情绪命中按此顺序取第一个符号：同一个词出现在多个词表里时，排在前面的符号优先。
export const MANGA_SYMBOL_KINDS = Object.freeze([
    'anger', 'sweat', 'heart', 'surprise', 'silence', 'gloom', 'sparkle',
    'bulb', 'note', 'zzz', 'heartbreak', 'sigh', 'dizzy', 'fire', 'frost',
    'drool', 'chomp', 'munch', 'gulp', 'bloom', 'blush', 'spicy', 'steam', 'sour', 'aah', 'full', 'bubbles',
    'soul', 'raincloud', 'glint', 'darkface', 'tears', 'sweatfly', 'nosebleed',
]);
export const MANGA_SYMBOL_LABELS = Object.freeze({
    anger: '青筋（怒）', sweat: '汗滴', heart: '爱心', surprise: '!?', silence: '……', gloom: '阴沉竖线', sparkle: '闪光',
    bulb: '灯泡（灵光）', note: '音符', zzz: 'Zzz（困）', heartbreak: '心碎', sigh: '叹气白烟', dizzy: '晕眩螺旋', fire: '火焰（燃）', frost: '寒气（发凉）',
    drool: '口水（嘴馋）', chomp: '啊呜（咬一口）', munch: '嚼嚼（咀嚼）', gulp: '咕咚（吞咽）', bloom: '小花（满足）', blush: '红晕', spicy: '喷火（辣）',
    steam: '哈气（烫）', sour: '皱巴线（酸）', aah: '「啊～」（喂食）', full: '满足白烟（饱）', bubbles: '咕嘟气泡（喝）',
    soul: '灵魂出窍', raincloud: '头顶乌云', glint: '眼镜反光', darkface: '脸上发黑', tears: '瀑布泪', sweatfly: '汗珠乱飞', nosebleed: '鼻血',
});
// split 为语音通话斜切分屏（默认），avatar 为右上角头像小窗。
export const FX_CALL_SPRITE_MODES = Object.freeze(['split', 'avatar', 'hide', 'show']);
export const FX_TAG_LABELS = Object.freeze({
    call: '来电 / 通话', notify: '通知横幅', flashback: '回忆滤镜', dream: '梦境滤镜', letterbox: '电影黑边', sfx: '拟声音效', eye: '睁眼 / 闭眼',
    whisper: '悄悄话', nickname: '称呼变化', voicemail: '语音留言', contact: '交换联系方式', cutin: '脸部特写切入', promise: '约定',
    movie: '看电影', light: '关灯', umbrella: '撑伞',
});
// 后加的标签类型需显式勾选：旧存档里「演出标签」已开启的用户不会突然收到新语法。
const FX_TAG_OPT_IN = new Set(['whisper', 'nickname', 'voicemail', 'contact', 'cutin', 'promise', 'movie', 'light', 'umbrella']);

const freezeList = (list) => Object.freeze(list.slice());

export const MANGA_FX_DEFAULT_SYMBOLS = Object.freeze({
    anger: freezeList(['生气', '愤怒', '恼火', '气愤', '暴怒', '恼怒', '发火', '不爽']),
    sweat: freezeList(['尴尬', '无奈', '窘迫', '心虚', '慌张', '汗颜', '局促']),
    heart: freezeList(['心动', '喜欢', '爱慕', '陶醉', '着迷', '甜蜜', '痴迷']),
    surprise: freezeList(['疑惑', '困惑', '惊疑', '不解', '纳闷', '讶异']),
    silence: freezeList(['无语', '沉默', '语塞', '冷淡', '呆滞', '发呆']),
    gloom: freezeList(['阴沉', '郁闷', '沮丧', '失落', '绝望', '消沉', '黑脸']),
    sparkle: freezeList(['兴奋', '期待', '得意', '雀跃', '憧憬', '自豪']),
    bulb: freezeList(['恍然大悟', '灵光一闪', '灵机一动', '想到了', '明白了', '顿悟', '豁然开朗']),
    note: freezeList(['开心', '愉快', '高兴', '欢快', '轻快', '哼歌', '心情好']),
    zzz: freezeList(['困倦', '犯困', '困', '睡着', '打瞌睡', '睡意', '迷糊']),
    heartbreak: freezeList(['伤心', '心碎', '心痛', '难过', '悲伤', '失恋', '委屈']),
    sigh: freezeList(['叹气', '疲惫', '心累', '无力', '泄气', '放弃', '累']),
    dizzy: freezeList(['头晕', '头昏', '混乱', '晕乎乎', '懵', '转晕', '脑子一团乱']),
    fire: freezeList(['燃起来', '斗志', '热血', '干劲十足', '好胜', '嫉妒', '吃醋']),
    frost: freezeList(['冷汗', '发凉', '背脊发凉', '毛骨悚然', '胆寒', '吓僵', '冷场']),
    drool: freezeList(['嘴馋', '馋', '垂涎', '流口水', '饿', '饥饿', '肚子饿']),
    chomp: freezeList(['大口吃', '狼吞虎咽', '啊呜', '咬一口']),
    munch: freezeList(['咀嚼', '吃东西', '嚼', '津津有味']),
    gulp: freezeList(['吞咽', '咽口水', '一饮而尽']),
    bloom: freezeList(['满足', '美味', '好吃', '幸福', '享受']),
    blush: freezeList(['脸红', '羞红', '红晕', '面红']),
    spicy: freezeList(['辣', '好辣', '辣到']),
    steam: freezeList(['烫', '好烫', '烫嘴']),
    sour: freezeList(['酸', '好酸', '酸涩']),
    aah: freezeList(['喂食', '张嘴', '啊～']),
    full: freezeList(['吃饱', '饱', '撑', '心满意足']),
    bubbles: freezeList(['畅饮', '解渴', '喝']),
    soul: freezeList(['灵魂出窍', '魂飞魄散', '生无可恋', '傻眼']),
    raincloud: freezeList(['倒霉', '运气差', '心情低落', '愁云惨淡']),
    glint: freezeList(['推理', '算计', '看穿', '腹黑', '精明']),
    darkface: freezeList(['阴笑', '怒极反笑', '脸黑', '黑气']),
    tears: freezeList(['大哭', '嚎啕大哭', '泪流满面', '痛哭', '感动落泪']),
    sweatfly: freezeList(['手忙脚乱', '惊慌失措', '手足无措', '急得团团转']),
    // 鼻血只认字面词：AI 写出来才出，不靠联想。
    nosebleed: freezeList(['鼻血', '流鼻血']),
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
    for (const kind of FX_TAG_KINDS) out[kind] = FX_TAG_OPT_IN.has(kind) ? src[kind] === true : src[kind] !== false;
    out.callSprite = FX_CALL_SPRITE_MODES.includes(src.callSprite) ? src.callSprite : 'split';
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
    // 弹幕三件套独立渲染（danmaku-runtime），不进入 FX_FEATURE_KEYS。
    ...DANMAKU_SETTINGS_NORMALIZERS,
    // 获得物品演出独立渲染（fx-item-render），不进入 FX_FEATURE_KEYS。
    itemFx: normalizeItemFxSettings,
    // 战斗演出同样独立渲染（fx-battle-render）。
    battleFx: normalizeBattleFxSettings,
    // 亲密演出独立渲染（romance-runtime）。
    romanceFx: normalizeRomanceFxSettings,
    // Meta 互动独立渲染（meta-runtime），不参与一键档位。
    metaFx: normalizeMetaFxSettings,
    // 舞台调度、场景声音与文字演出各自独立运行，同样不进入 FX_FEATURE_KEYS。
    ...STAGE_DIRECTION_NORMALIZERS,
    bgm: normalizeBgmSettings,
    ambientSound: normalizeAmbientSoundSettings,
    uiSound: normalizeUiSoundSettings,
    audioMaster: normalizeAudioMasterSettings,
    textFx: normalizeTextFxSettings,
    bilingual: normalizeBilingualSettings,
    clickWaitMark: normalizeClickWaitMarkSettings,
    dailyFx: normalizeDailyFxSettings,
    // 结果展示（选项检定掷骰卡）独立渲染（fx-result），不进入 FX_FEATURE_KEYS。
    resultFx: normalizeResultFxSettings,
    // 漫画演出模式独立渲染（comic-bubble），不进入 FX_FEATURE_KEYS。
    comicMode: normalizeComicModeSettings,
    // 漫画背景与特效、人群剪影独立渲染（manga-back / crowd-fx），不进入 FX_FEATURE_KEYS。
    mangaBack: normalizeMangaBackSettings,
    crowdFx: normalizeCrowdFxSettings,
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
    ...STAGE_DIRECTION_WORD_LIST_PATHS,
    'romanceFx.favorWords',
    ...DANMAKU_WORD_LIST_PATHS,
    ...COMIC_WORD_LIST_PATHS,
    ...MANGA_BACK_WORD_LIST_PATHS,
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
