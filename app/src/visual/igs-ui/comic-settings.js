import { normalizeEmotionList } from './stage-shake-runtime.js';

// 漫画演出模式：普通对话改成悬浮在说话人旁的竖排对话泡；mono 时整个画面变黑白漫画页，color 时泡跟随对话框皮肤配色。
export const COMIC_PALETTES = Object.freeze(['mono', 'color']);
// 泡的墨线粗细（相对字号的倍率）与离说话人头部的距离（相对头宽）。
export const COMIC_LINE_LEVELS = Object.freeze({ thin: 0.6, medium: 1, bold: 1.6 });
export const COMIC_GAP_LEVELS = Object.freeze({ near: 0.22, medium: 0.55, far: 1 });
const HEX = /^#[0-9a-fA-F]{6}$/;

// 对话泡的情绪外形。词表只做精确匹配（与漫画符号一致），按此顺序取第一个命中的外形。
export const COMIC_TONE_KINDS = Object.freeze(['shout', 'fear', 'dark', 'cute', 'calm']);
export const COMIC_TONE_LABELS = Object.freeze({
    shout: '爆炸框（喊叫）',
    fear: '颤抖框（害怕）',
    dark: '黑底白字（阴沉、威胁）',
    cute: '花边软泡（撒娇、开心）',
    calm: '方角框（冷静、正式）',
});

const freezeList = (list) => Object.freeze(list.slice());

export const COMIC_TONE_DEFAULT_WORDS = Object.freeze({
    shout: freezeList(['怒吼', '大喊', '尖叫', '咆哮', '吼', '喊', '大叫', '怒喝', '惊叫', '呐喊', '狂怒']),
    fear: freezeList(['害怕', '恐惧', '颤抖', '发抖', '惊恐', '畏惧', '战栗', '哆嗦']),
    dark: freezeList(['阴冷', '威胁', '杀意', '阴森', '冷笑', '病娇', '黑化', '危险']),
    cute: freezeList(['撒娇', '卖萌', '开心', '欢喜', '雀跃', '甜甜', '可爱']),
    calm: freezeList(['冷静', '平静', '严肃', '正式', '淡然', '机械', '公事公办']),
});

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeComicModeSettings(value) {
    const src = plain(value);
    const wordsSrc = plain(src.tones);
    const tones = {};
    for (const kind of COMIC_TONE_KINDS) tones[kind] = normalizeEmotionList(wordsSrc[kind], COMIC_TONE_DEFAULT_WORDS[kind]);
    return {
        enabled: src.enabled === true,
        palette: COMIC_PALETTES.includes(src.palette) ? src.palette : 'mono',
        frame: src.frame !== false,
        keepPrev: src.keepPrev !== false,
        // 尾巴默认不画：泡贴在说话人头旁，位置本身就说明是谁在说。
        tail: src.tail === true,
        line: Object.hasOwn(COMIC_LINE_LEVELS, src.line) ? src.line : 'medium',
        // 描边颜色：auto 跟随黑白 / 皮肤配色，custom 用自选颜色。
        inkMode: src.inkMode === 'custom' ? 'custom' : 'auto',
        inkColor: HEX.test(src.inkColor) ? src.inkColor : '#141414',
        gap: Object.hasOwn(COMIC_GAP_LEVELS, src.gap) ? src.gap : 'medium',
        // 输入框：comic 漫画框，plain 普通对话框样式。
        inputStyle: src.inputStyle === 'plain' ? 'plain' : 'comic',
        tones,
    };
}

export const COMIC_WORD_LIST_PATHS = Object.freeze(COMIC_TONE_KINDS.map((kind) => `comicMode.tones.${kind}`));

export function isComicModeActive(readerSettings) {
    const comic = readerSettings && readerSettings.comicMode;
    return Boolean(comic && comic.enabled === true);
}

// 漫画模式发送后收起输入框，正文变了（新回复到了）再出来。用本楼分页数与末页内容判断「变了」。
export function comicContentKey(snapshot) {
    const segs = snapshot && snapshot.content && Array.isArray(snapshot.content.segments) ? snapshot.content.segments : [];
    const last = segs.length ? segs[segs.length - 1] : '';
    return `${segs.length}|${typeof last === 'string' ? last : JSON.stringify(last)}`;
}

export function comicPaletteOf(readerSettings) {
    const comic = readerSettings && readerSettings.comicMode;
    return comic && comic.palette === 'color' ? 'color' : 'mono';
}

// 漫画模式下对话框本体按默认外观渲染：皮肤素材、九宫格、渐变幕都不挂，泡的配色另从原皮肤取。
export function dialogRenderSettings(readerSettings) {
    if (!isComicModeActive(readerSettings)) return readerSettings;
    return { ...readerSettings, dialogSkin: 'default' };
}
