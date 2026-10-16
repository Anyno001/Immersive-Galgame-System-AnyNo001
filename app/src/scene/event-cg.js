// 事件 CG 库：作者预置的 CG，按正文关键词或 [igs-cg:名字] 标签出现，停留几页。
// 结构：{ 名字: { url, keywords: [词], nsfw?: true } }，url 可以是 igs-gen 编号或网址。
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
export const EVENT_CG_TAG_RE = /\[igs-cg:\s*([^\]|]+?)\s*\]/gi;

export function normalizeEventCgs(value) {
    const out = {};
    for (const [rawName, entry] of Object.entries(plain(value) || {})) {
        const name = String(rawName || '').trim();
        const src = plain(entry);
        if (!name || BLOCKED.has(name) || !src) continue;
        const keywords = Array.from(new Set((Array.isArray(src.keywords) ? src.keywords : String(src.keywords || '').split(/[,，、\s]+/))
            .map((w) => String(w || '').trim()).filter((w) => Array.from(w).length >= 2)));
        out[name] = { url: String(src.url || '').trim(), keywords };
        if (src.nsfw === true) out[name].nsfw = true;
    }
    return out;
}

// 整楼有没有命中（出图服务用：命中就不再生成过场图）。
export function floorHasEventCg(text, eventCgs) {
    const source = String(text || '');
    const map = normalizeEventCgs(eventCgs);
    if (Array.from(source.matchAll(EVENT_CG_TAG_RE)).some((m) => map[m[1]] && map[m[1]].url)) return true;
    return Object.values(map).some((entry) => entry.url && entry.keywords.some((w) => source.includes(w)));
}

// 第 index 页该显示哪张：往前 holdPages 页内最近一次触发的那张。标签按它后面第一页算触发页。
export function resolveEventCgForPage({ source, segments, index, holdPages = 4, eventCgs } = {}) {
    const map = normalizeEventCgs(eventCgs);
    const names = Object.keys(map).filter((name) => map[name].url);
    if (!names.length || !Array.isArray(segments) || !segments.length) return null;
    const pages = segments.map((s) => String(s || ''));
    const triggers = new Map();
    const text = String(source || '');
    for (const m of text.matchAll(EVENT_CG_TAG_RE)) {
        if (!map[m[1]] || !map[m[1]].url) continue;
        const after = m.index + m[0].length;
        let page = pages.findIndex((seg) => { const at = text.indexOf(seg.slice(0, 12), after); return seg && at >= 0 && at - after < 400; });
        if (page < 0) page = pages.length - 1;
        if (!triggers.has(page)) triggers.set(page, m[1]);
    }
    pages.forEach((seg, page) => {
        if (triggers.has(page)) return;
        const name = names.find((n) => map[n].keywords.some((w) => seg.includes(w)));
        if (name) triggers.set(page, name);
    });
    const hold = Math.max(1, Number(holdPages) || 4);
    for (let page = index; page >= 0 && page > index - hold; page -= 1) {
        if (triggers.has(page)) { const name = triggers.get(page); return { name, ...map[name] }; }
    }
    return null;
}
