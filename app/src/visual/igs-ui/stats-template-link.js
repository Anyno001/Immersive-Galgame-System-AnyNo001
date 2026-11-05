// IGS 数值系统适配版表格模板的下载地址（§8C 第 5 条）。
// 发布包里 bundle 位于 dist/ 根目录，build.js 把模板复制到 dist/templates/，因此按 ./templates/ 相对解析。
import { STATS_TEMPLATE_FILE } from '../../data/shujuku/stats-template-adapt.js';

const REPOSITORY = 'Anyno001/Immersive-Galgame-System-AnyNo001';
const TEMPLATE_REF = 'main';

export function statsTemplateUrl(base = import.meta.url) {
    return new URL(`./templates/${encodeURIComponent(STATS_TEMPLATE_FILE)}`, base).href;
}

// 与战斗敌人图集同一套取法：先取随 bundle 发布的副本，再退回 jsDelivr、GitHub raw（跟随 main，提示词修订即时生效）。
export function statsTemplateSources(ref = TEMPLATE_REF) {
    const file = `app/dist/templates/${encodeURIComponent(STATS_TEMPLATE_FILE)}`;
    let bundled = '';
    try { bundled = statsTemplateUrl(); } catch { bundled = ''; }
    const list = [bundled, `https://cdn.jsdelivr.net/gh/${REPOSITORY}@${ref}/${file}`, `https://raw.githubusercontent.com/${REPOSITORY}/${ref}/${file}`];
    return [...new Set(list.filter(Boolean))];
}

function sourceList(url) {
    return Array.isArray(url) ? url : [url];
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
// url 可传单个地址或地址列表，按顺序尝试；全部取不到时退回最后一个直链（CDN 地址）。
export async function downloadStatsTemplate(doc, url = statsTemplateSources(), { fetchImpl = globalThis.fetch, urlApi = globalThis.URL } = {}) {
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return { ok: false, reason: 'stats-template-no-document' };
    const urls = sourceList(url);
    const fallback = urls[urls.length - 1];
    if (typeof fetchImpl === 'function' && urlApi && typeof urlApi.createObjectURL === 'function') {
        let lastError = null;
        for (const candidate of urls) {
            try {
                const response = await fetchImpl(candidate);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const href = urlApi.createObjectURL(await response.blob());
                try { clickDownload(doc, href); } finally { setTimeout(() => urlApi.revokeObjectURL(href), 1000); }
                return { ok: true, url: candidate, via: 'blob' };
            } catch (error) {
                lastError = error;
            }
        }
        clickDownload(doc, fallback);
        return { ok: true, url: fallback, via: 'link', fetchError: String(lastError && lastError.message || lastError) };
    }
    clickDownload(doc, fallback);
    return { ok: true, url: fallback, via: 'link' };
}

export const STATS_TEMPLATE_PRESET_NAME = STATS_TEMPLATE_FILE.replace(/^TavernDB_template_|\.json$/g, '');

function sheetNames(template) {
    if (!template || typeof template !== 'object') return [];
    return Object.keys(template).filter((key) => key.startsWith('sheet_'))
        .map((key) => String(template[key] && template[key].name || '').trim()).filter(Boolean);
}

export async function fetchStatsTemplate(url = statsTemplateSources(), { fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') return { ok: false, reason: 'stats-template-no-fetch' };
    let last = { ok: false, reason: 'stats-template-fetch-failed' };
    for (const candidate of sourceList(url)) {
        try {
            const response = await fetchImpl(candidate);
            if (!response.ok) { last = { ok: false, reason: 'stats-template-fetch-failed', message: `HTTP ${response.status}` }; continue; }
            const data = await response.json();
            if (!data || typeof data !== 'object' || !sheetNames(data).length) { last = { ok: false, reason: 'stats-template-invalid' }; continue; }
            return { ok: true, data };
        } catch (error) {
            last = { ok: false, reason: 'stats-template-fetch-failed', message: String(error && error.message || error) };
        }
    }
    return last;
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
