// 分区画师串：开关打开后，每类图用自己的画师正负面替换全局画师串；这一类留空就退回全局。
// 外来提示词（数据库生图 / 柏宝绘 / 智绘姬写的）里的 artist: 标签先摘掉，再换成这一类的。
import { splitTags } from './dbgen-prompt.js';

export const PROMPT_KINDS = Object.freeze([
    ['sprite', '立绘'],
    ['expression', '表情差分'],
    ['avatar', 'Q 版头像'],
    ['wardrobe', '衣柜'],
    ['background', '背景'],
    ['item', '物品'],
    ['cg', 'CG'],
    ['nsfwCg', 'NSFW CG'],
]);
const KIND_IDS = new Set(PROMPT_KINDS.map(([id]) => id));

const text = (value) => (typeof value === 'string' ? value : '');

export function normalizeArtistByKind(value) {
    const src = value && typeof value === 'object' ? value : {};
    const kinds = src.kinds && typeof src.kinds === 'object' ? src.kinds : {};
    const out = {};
    for (const id of KIND_IDS) {
        const entry = kinds[id] && typeof kinds[id] === 'object' ? kinds[id] : {};
        out[id] = { positive: text(entry.positive), negative: text(entry.negative) };
    }
    return { enabled: src.enabled === true, kinds: out };
}

export function promptKindOf(meta) {
    const kind = meta && (meta.promptKind || meta.imageKind);
    return KIND_IDS.has(kind) ? kind : 'cg';
}

// 开关关着或这一类两栏都空 → null（照旧用全局）。
export function kindArtist(artistByKind, meta) {
    const conf = normalizeArtistByKind(artistByKind);
    if (!conf.enabled) return null;
    const entry = conf.kinds[promptKindOf(meta)];
    const positive = entry.positive.trim();
    const negative = entry.negative.trim();
    return positive || negative ? { positive, negative } : null;
}

// 只认 artist: 写法（含 1.2::artist:xx:: 加权、{artist:xx}、(artist:xx:1.1)）。没写前缀的画师名分不出来，留着。
const ARTIST_TAG_RE = /^[\s{([]*(?:-?\d*\.?\d+::)?\s*artist\s*:/i;
export function stripArtistTags(value) {
    const kept = [];
    const removed = [];
    for (const tag of splitTags(value)) (ARTIST_TAG_RE.test(tag) ? removed : kept).push(tag);
    return { text: kept.join(', '), removed };
}

const join = (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join(', ');

// 一段提示词换画师：摘掉原有 artist: 标签，把这一类的画师串放最前。
export function replaceArtist(prompt, artist) {
    const { text: rest, removed } = stripArtistTags(prompt);
    return { text: join(artist, rest), removed };
}
