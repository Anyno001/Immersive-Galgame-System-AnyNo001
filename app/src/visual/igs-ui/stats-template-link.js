// IGS 数值系统适配版表格模板的下载地址（§8C 第 5 条）。
// 发布包里 bundle 位于 dist/ 根目录，build.js 把模板复制到 dist/templates/，因此按 ./templates/ 相对解析。
import { STATS_TEMPLATE_FILE } from '../../data/shujuku/stats-template-adapt.js';

export function statsTemplateUrl(base = import.meta.url) {
    return new URL(`./templates/${encodeURIComponent(STATS_TEMPLATE_FILE)}`, base).href;
}

function clickDownload(doc, href) {
    const a = doc.createElement('a');
    a.href = href;
    a.download = STATS_TEMPLATE_FILE;
    a.rel = 'noopener';
    doc.body.appendChild(a);
    try { a.click(); } finally { a.remove ? a.remove() : doc.body.removeChild(a); }
}

// 模板在 CDN 上，跨域链接的 download 属性会被浏览器忽略，所以先取回内容转成本地 blob 再下载；取不到时退回直链。
export async function downloadStatsTemplate(doc, url = statsTemplateUrl(), { fetchImpl = globalThis.fetch, urlApi = globalThis.URL } = {}) {
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return { ok: false, reason: 'stats-template-no-document' };
    if (typeof fetchImpl === 'function' && urlApi && typeof urlApi.createObjectURL === 'function') {
        try {
            const response = await fetchImpl(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const href = urlApi.createObjectURL(await response.blob());
            try { clickDownload(doc, href); } finally { setTimeout(() => urlApi.revokeObjectURL(href), 1000); }
            return { ok: true, url, via: 'blob' };
        } catch (error) {
            clickDownload(doc, url);
            return { ok: true, url, via: 'link', fetchError: String(error && error.message || error) };
        }
    }
    clickDownload(doc, url);
    return { ok: true, url, via: 'link' };
}
