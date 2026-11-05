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

export const STATS_TEMPLATE_PRESET_NAME = STATS_TEMPLATE_FILE.replace(/^TavernDB_template_|\.json$/g, '');

function sheetNames(template) {
    if (!template || typeof template !== 'object') return [];
    return Object.keys(template).filter((key) => key.startsWith('sheet_'))
        .map((key) => String(template[key] && template[key].name || '').trim()).filter(Boolean);
}

export async function fetchStatsTemplate(url = statsTemplateUrl(), { fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') return { ok: false, reason: 'stats-template-no-fetch' };
    try {
        const response = await fetchImpl(url);
        if (!response.ok) return { ok: false, reason: 'stats-template-fetch-failed', message: `HTTP ${response.status}` };
        const data = await response.json();
        if (!data || typeof data !== 'object' || !sheetNames(data).length) return { ok: false, reason: 'stats-template-invalid' };
        return { ok: true, data };
    } catch (error) {
        return { ok: false, reason: 'stats-template-fetch-failed', message: String(error && error.message || error) };
    }
}

// 应用到当前聊天前的预检：宿主按整份快照导入，当前聊天有而模板没有的表会被隐藏。
export function statsTemplateChatDiff(current, template) {
    const next = new Set(sheetNames(template));
    return { hidden: sheetNames(current).filter((name) => !next.has(name)) };
}

// scope='global' 存进数据库的模板预设库，不动当前聊天；scope='chat' 替换当前聊天的模板，已有数据按 seed 保留。
export async function importStatsTemplate(client, template, scope = 'global') {
    const result = await client.importTemplate(template, { scope, presetName: STATS_TEMPLATE_PRESET_NAME, dataMode: 'seed' });
    if (!result.ok) return result;
    if (scope === 'chat' && result.result && result.result.runtimeReady === false) return { ok: false, reason: 'stats-template-runtime-not-ready' };
    return { ok: true, scope };
}
