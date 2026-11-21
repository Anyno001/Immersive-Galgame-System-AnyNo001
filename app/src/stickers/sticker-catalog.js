// 内置表情包清单：IGS 与天音共用同一套情绪名，两边改动时保持同步。
// STICKER_CATALOG 只是 24 个情绪的名字表（images 恒为空）；真正的图在 STICKER_SETS 的素材数据里，
// 由 stickerView(套组, 用户修改) 合成「带图的情绪表 + 全部图的池子」，挑图一律走视图。
// 生成素材数据的脚本（scripts/build-sticker-data.mjs）按 entry('id', '名字', …) 的写法读取情绪名，改格式时一并改。
import { DAIMAO_ITEMS } from './data/daimao.js';
import { NGA_ITEMS } from './data/nga.js';

function entry(id, name, aliases) {
    return Object.freeze({ id, name, aliases: Object.freeze(aliases), images: Object.freeze([]) });
}

export const STICKER_CATALOG = Object.freeze([
    entry('happy', '开心', ['高兴', '嘿嘿', '好耶', '哈哈', '笑死', '爆笑']),
    entry('shy', '害羞', ['脸红', '羞']),
    entry('love', '喜欢', ['爱你', '心动', '比心']),
    entry('smug', '得意', ['骄傲', '哼哼', '叉腰']),
    entry('expect', '期待', ['星星眼', '好奇']),
    entry('wronged', '委屈', ['可怜', '呜呜']),
    entry('cry', '哭哭', ['哭', '大哭', '流泪']),
    entry('angry', '生气', ['气', '哼', '愤怒']),
    entry('speechless', '无语', ['无言', '沉默', '……']),
    entry('shock', '震惊', ['惊', '吓', '啊？']),
    entry('question', '疑问', ['问号', '？', '不懂']),
    entry('awkward', '尴尬', ['汗', '冷汗']),
    entry('guilty', '心虚', ['偷看', '躲']),
    entry('sleepy', '困', ['困了', '打哈欠']),
    entry('night', '晚安', ['睡了', '好梦']),
    entry('hug', '抱抱', ['拥抱', '贴贴']),
    entry('ok', '好的', ['收到', 'OK', '嗯嗯']),
    entry('no', '拒绝', ['不要', '不行', '达咩']),
    entry('cheer', '加油', ['冲', '打气']),
    entry('cute', '卖萌', ['可爱', '撒娇', '装可爱']),
    entry('innocent', '无辜', ['我没有', '眨眼']),
    entry('breakdown', '崩溃', ['抓狂', '破防', '裂开']),
    entry('scared', '害怕', ['发抖', '怕怕', '恐惧']),
    entry('slack', '摆烂', ['躺平', '不想动', '咸鱼']),
]);

// 套组：daimao 呆猫八条（另起一行的大图，线上聊天与论坛默认）；nga AC娘（只在论坛，行内小图，透明底）。
export const STICKER_SETS = Object.freeze({
    daimao: Object.freeze({ id: 'daimao', name: '呆猫八条', inline: false, items: DAIMAO_ITEMS }),
    nga: Object.freeze({ id: 'nga', name: 'NGA AC娘', inline: true, items: NGA_ITEMS }),
});
export const STICKER_SET_IDS = Object.freeze(Object.keys(STICKER_SETS));

// AI 偶尔写成「情绪：开心」「表情包-开心」，先去掉空白与这些前缀再匹配。
function clean(value) {
    return String(value == null ? '' : value).trim().replace(/^(?:表情包?|情绪)\s*[:：\-]\s*/, '').trim();
}

// 先按情绪名，再按近义词，最后按 id（不分大小写）；都不中返回 null。
export function matchSticker(nameOrAlias, catalog = STICKER_CATALOG) {
    const key = clean(nameOrAlias);
    if (!key) return null;
    const lower = key.toLowerCase();
    return catalog.find((s) => s.name === key)
        || catalog.find((s) => s.aliases.some((a) => a.toLowerCase() === lower))
        || catalog.find((s) => s.id === lower)
        || null;
}

function hashOf(seed) {
    let h = 2166136261;
    const text = String(seed == null ? '' : seed);
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 一张图的稳定键：优先用文件名，没有文件时用 id-序号（序号从 1 起）。停用列表两种写法都认。
export function stickerKeys(sticker, index) {
    const image = sticker.images[index];
    return [image && image.file, `${sticker.id}-${index + 1}`].filter(Boolean);
}

export function isStickerDisabled(sticker, index, disabled) {
    return Array.isArray(disabled) && stickerKeys(sticker, index).some((k) => disabled.includes(k));
}

// 套组视图：把素材数据与用户修改（overrides：{ 文件名: { emotions, desc } }）合成一份。
// catalog：24 个内置情绪 + 用户新增的情绪，每项带 images；pool：套组里的全部图（含没有情绪的「未分类」）。
// 修改里的文件名若已不在素材里，直接忽略。结果按（套组, 修改）缓存。
const VIEW_CACHE = new Map();
const VIEW_CACHE_MAX = 8;

function resolveEmotion(raw) {
    const name = clean(raw);
    if (!name) return null;
    const hit = matchSticker(name);
    return hit ? { id: hit.id, name: hit.name } : { id: `u:${name}`, name };
}

export function stickerView(setId = 'daimao', overrides = {}) {
    const set = STICKER_SETS[setId] || STICKER_SETS.daimao;
    const ov = plain(overrides);
    const key = `${set.id}|${Object.keys(ov).length ? JSON.stringify(ov) : ''}`;
    const cached = VIEW_CACHE.get(key);
    if (cached) return cached;
    const base = new Map(STICKER_CATALOG.map((s) => [s.id, { id: s.id, name: s.name, aliases: s.aliases, custom: false, images: [] }]));
    const customs = new Map();
    const pool = [];
    for (const item of set.items) {
        const o = Object.prototype.hasOwnProperty.call(ov, item.file) ? plain(ov[item.file]) : null;
        const rawEmotions = o && Array.isArray(o.emotions) ? o.emotions : item.emotions || [];
        const emotions = [];
        for (const raw of rawEmotions) {
            const r = resolveEmotion(raw);
            if (!r) continue;
            if (!base.has(r.id) && !customs.has(r.id)) customs.set(r.id, { id: r.id, name: r.name, aliases: [], custom: true, images: [] });
            if (!emotions.includes(r.id)) emotions.push(r.id);
        }
        const descEdited = Boolean(o && typeof o.desc === 'string' && o.desc.trim());
        const image = {
            file: item.file,
            desc: descEdited ? o.desc.trim() : item.desc || '',
            text: item.text || '',
            tags: item.tags || [],
            persona: item.persona || [],
            emotions,
            w: item.w || 0,
            h: item.h || 0,
            edited: Boolean(o && (Array.isArray(o.emotions) || descEdited)),
        };
        pool.push(image);
        for (const id of emotions) (base.get(id) || customs.get(id)).images.push(image);
    }
    const view = { set, inline: set.inline, catalog: [...base.values(), ...customs.values()], pool };
    if (VIEW_CACHE.size >= VIEW_CACHE_MAX) VIEW_CACHE.delete(VIEW_CACHE.keys().next().value);
    VIEW_CACHE.set(key, view);
    return view;
}

// 提示词用：至少有一张未停用的图的情绪（名字表顺序，用户新增的排后面）。
export function stickerLiveEmotions(view, disabled = []) {
    return view.catalog.filter((s) => s.images.some((img, i) => !isStickerDisabled(s, i, disabled)));
}

// ---- 描述匹配：中文字符 bigram 的重合度（按词频倒数加权），加 tags 与情绪命中的加分 ----
export const STICKER_DESC_MIN_SCORE = 0.4;
const PUNCT_RE = /[\s,.，。！？!?、；;：:“”"'‘’（）()[\]【】［］《》~～…·—\-_*|]/g;

function gramsOf(text) {
    const t = String(text == null ? '' : text).toLowerCase().replace(PUNCT_RE, '');
    const out = new Set();
    for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2));
    return out;
}

const DOC_CACHE = new WeakMap();
function docOf(image) {
    let doc = DOC_CACHE.get(image);
    if (!doc) {
        doc = new Set([...gramsOf(image.desc), ...gramsOf(image.text), ...(image.tags || []).flatMap((t) => [...gramsOf(t)])]);
        DOC_CACHE.set(image, doc);
    }
    return doc;
}

const IDF_CACHE = new WeakMap();
function idfFor(pool) {
    let idf = IDF_CACHE.get(pool);
    if (idf) return idf;
    const df = new Map();
    for (const image of pool) for (const g of docOf(image)) df.set(g, (df.get(g) || 0) + 1);
    const n = Math.max(1, pool.length);
    const max = Math.log(1 + n);
    idf = (g) => (df.has(g) ? Math.log(1 + n / df.get(g)) : max);
    IDF_CACHE.set(pool, idf);
    return idf;
}

function descScore(q, qGrams, image, idf, emotionById) {
    const doc = docOf(image);
    let total = 0;
    let hit = 0;
    for (const g of qGrams) {
        const w = idf(g);
        total += w;
        if (doc.has(g)) hit += w;
    }
    let score = total ? hit / total : 0;
    let tagBonus = 0;
    for (const t of image.tags || []) {
        const tag = String(t).toLowerCase().replace(PUNCT_RE, '');
        if (tag.length >= 2 && (q.includes(tag) || (q.length >= 2 && tag.includes(q)))) tagBonus += 0.25;
    }
    score += Math.min(0.5, tagBonus);
    for (const id of image.emotions) {
        const e = emotionById.get(id);
        if (!e) continue;
        if ([e.name, ...e.aliases].some((n) => String(n).length >= 2 && q.includes(String(n).toLowerCase()))) { score += 0.15; break; }
    }
    return score;
}

// 在 pool 里按描述找最像的一张；低于阈值返回 null。同分按种子稳定地挑（persona 相符的优先）。
// idfPool：算词频倒数用的全集（缺省就是 pool 自己；pool 是剔除了停用图的子集时传完整的那份，免得每次重算）。
export function matchStickerByDesc(query, pool, { persona = [], seed = '', catalog = STICKER_CATALOG, idfPool = pool, minScore = STICKER_DESC_MIN_SCORE } = {}) {
    const text = clean(query).toLowerCase().replace(PUNCT_RE, '');
    if (!pool.length || text.length < 2) return null;
    const qGrams = gramsOf(text);
    const idf = idfFor(idfPool);
    const emotionById = new Map(catalog.map((s) => [s.id, s]));
    let best = -1;
    let top = [];
    for (const image of pool) {
        const score = descScore(text, qGrams, image, idf, emotionById);
        if (score > best + 1e-9) { best = score; top = [image]; } else if (Math.abs(score - best) <= 1e-9) top.push(image);
    }
    if (best < minScore || !top.length) return null;
    const want = Array.isArray(persona) ? persona.filter(Boolean) : [];
    const fit = want.length ? top.filter((img) => Array.isArray(img.persona) && img.persona.some((p) => want.includes(p))) : [];
    const ties = fit.length ? fit : top;
    return ties[hashOf(seed) % ties.length];
}

// 挑图：先认情绪（名字、近义词、id），再按画面描述找；都不中返回 null（调用方静默丢弃）。
// 套组由 set + overrides 决定（缺省呆猫八条）；也可直接传 catalog（带图的情绪表）与 pool（全部图）。
// 情绪认出来但没有可用的图（这个套组没有这个情绪的图，或全部停用）时返回 null，不再退回描述匹配。
// 认出情绪后：去掉停用的图，优先挑 persona 与人物相符的，否则按 seed（人物名 + 楼号）哈希挑一张，同一楼重读结果不变。
export function pickSticker(query, { persona = [], seed = '', disabled = [], catalog, pool, set, overrides } = {}) {
    let useCatalog = catalog;
    let usePool = pool;
    if (!useCatalog) {
        const view = stickerView(set, overrides);
        useCatalog = view.catalog;
        usePool = usePool || view.pool;
    }
    const text = clean(query);
    if (!text) return null;
    const off = Array.isArray(disabled) ? disabled : [];
    const want = Array.isArray(persona) ? persona.filter(Boolean) : [];
    const emotion = matchSticker(text, useCatalog);
    if (emotion) {
        const live = emotion.images.filter((img, i) => !isStickerDisabled(emotion, i, off));
        if (!live.length) return null;
        const fit = want.length ? live.filter((img) => Array.isArray(img.persona) && img.persona.some((p) => want.includes(p))) : [];
        const group = fit.length ? fit : live;
        const image = group[hashOf(seed) % group.length];
        return { id: emotion.id, name: emotion.name, image, index: emotion.images.indexOf(image) };
    }
    if (!usePool) usePool = [...new Map(useCatalog.flatMap((s) => s.images).map((img) => [img.file || img, img])).values()];
    const live = off.length ? usePool.filter((img) => !off.includes(img.file)) : usePool;
    const image = matchStickerByDesc(text, live, { persona: want, seed, catalog: useCatalog, idfPool: usePool });
    if (!image) return null;
    return { id: (image.emotions && image.emotions[0]) || '', name: image.desc || text, image, index: -1 };
}

// 内置的 24 个情绪名（不含用户新增的，也不看有没有图）。
export function stickerNames() {
    return STICKER_CATALOG.map((s) => s.name);
}
