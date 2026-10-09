// 分区画师串：开关打开后，每类图用自己的画师正负面替换全局画师串；这一类留空就退回全局。
// 内置 NAI 把这一对拼到提示词前面。数据库生图作为画师串对象传给插件。智绘姬、柏宝绘不改画师串。

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
