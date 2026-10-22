// IGS 数值系统适配版表格模板的下载地址（§8C 第 5 条）。
// 发布包里 bundle 位于 dist/ 根目录，build.js 把模板复制到 dist/templates/，因此按 ./templates/ 相对解析。
import { STATS_TEMPLATE_FILE } from '../../data/shujuku/stats-template-adapt.js';

export function statsTemplateUrl(base = import.meta.url) {
    return new URL(`./templates/${encodeURIComponent(STATS_TEMPLATE_FILE)}`, base).href;
}

// 用临时 <a download> 触发下载；没有可用 document 时返回原因，不抛错。
export function downloadStatsTemplate(doc, url = statsTemplateUrl()) {
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return { ok: false, reason: 'stats-template-no-document' };
    const a = doc.createElement('a');
    a.href = url;
    a.download = STATS_TEMPLATE_FILE;
    a.rel = 'noopener';
    doc.body.appendChild(a);
    try { a.click(); } finally { a.remove ? a.remove() : doc.body.removeChild(a); }
    return { ok: true, url };
}
