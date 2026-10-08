// 用户上传的字体：本体存进酒馆 user/files/igs-font-*（/api/files/upload），元数据记在 localStorage。
// 字体用 FontFace API 注册到宿主页面的 document 上，再把 font-family 栈写进对话框 / 记录页的字体设置，
// 渲染链路不用改。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

export const CUSTOM_FONT_STORE_KEY = 'igs-custom-fonts-v1';
export const FONT_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
export const CUSTOM_FONT_LIMIT = 12;
const EXTENSIONS = Object.freeze(['ttf', 'otf', 'woff', 'woff2']);
const PATH_RE = /^\/?user\/files\/igs-font-[\w.-]+$/;
const FORMAT_OF = Object.freeze({ ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' });

function extensionOf(file) {
    const fromName = String((file && file.name) || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    if (fromName && EXTENSIONS.includes(fromName[1])) return fromName[1];
    const fromType = String((file && file.type) || '').toLowerCase().match(/^font\/(?:x-)?([a-z0-9]+)/);
    const type = fromType && (fromType[1] === 'ttf' ? 'ttf' : fromType[1] === 'vnd.ms-opentype' ? 'otf' : fromType[1]);
    return type && EXTENSIONS.includes(type) ? type : '';
}

function base64Of(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return globalThis.btoa(binary);
}

export function isTavernFontPath(value) {
    return typeof value === 'string' && PATH_RE.test(value);
}

function storageOf(globalObject) {
    try {
        return (globalObject && globalObject.localStorage) || null;
    } catch (error) {
        // 隐私模式下 localStorage 会抛异常；没有存储就当没有自定义字体。
        return null;
    }
}

// 归一化后的字体项：{ id, label, family, path, format }。坏数据一律丢弃。
export function normalizeCustomFonts(value) {
    const list = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const path = String(item.path || '');
        const family = String(item.family || '').trim();
        if (!isTavernFontPath(path) || !family || seen.has(family)) continue;
        seen.add(family);
        out.push({
            id: String(item.id || family),
            label: String(item.label || family).trim() || family,
            family,
            path,
            format: EXTENSIONS.includes(item.format) ? item.format : 'truetype',
        });
        if (out.length >= CUSTOM_FONT_LIMIT) break;
    }
    return out;
}

export function loadCustomFonts(globalObject) {
    const storage = storageOf(globalObject);
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
        return normalizeCustomFonts(JSON.parse(storage.getItem(CUSTOM_FONT_STORE_KEY) || '[]'));
    } catch (error) {
        return [];
    }
}

export function saveCustomFonts(globalObject, fonts) {
    const storage = storageOf(globalObject);
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
        storage.setItem(CUSTOM_FONT_STORE_KEY, JSON.stringify(normalizeCustomFonts(fonts)));
        return true;
    } catch (error) {
        return false;
    }
}

// 字体名带上上传时间，避免同名文件在浏览器字体表里互相覆盖。
export function customFontFamily(label, stamp) {
    const slug = String(label || 'font').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'font';
    return `IGSUserFont-${slug}-${stamp}`;
}

export function customFontStack(font) {
    return `"${String(font && font.family ? font.family : '')}","Source Han Serif CN",serif`;
}

// 让用户选一个本地字体文件；取消返回 null。
export function pickFontFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = `${EXTENSIONS.map((ext) => `.${ext}`).join(',')},font/*`;
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(value);
        };
        input.onchange = () => finish(input.files && input.files[0] ? input.files[0] : null);
        const timer = setTimeout(() => finish(null), 300000);
        input.click();
    });
}

// 返回 { ok, font } 或 { ok: false, reason }；reason 供设置页直接提示。
export async function uploadFontFile(globalObject, file) {
    const ext = extensionOf(file);
    if (!ext) return { ok: false, reason: '只支持 ttf、otf、woff、woff2 字体文件。' };
    if (!(file.size > 0) || file.size > FONT_UPLOAD_MAX_BYTES) return { ok: false, reason: '字体文件需小于 32MB。' };
    const ctx = getSillyTavernContext(globalObject);
    const headers = ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    if (!headers || typeof globalObject.fetch !== 'function') return { ok: false, reason: '没连上酒馆，无法上传字体。' };
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
        const name = `igs-font-${stamp}.${ext}`;
        const res = await globalObject.fetch('/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, data: base64Of(bytes) }),
        });
        if (!res || !res.ok) return { ok: false, reason: '酒馆拒绝了这次上传。' };
        const path = String(((await res.json().catch(() => null)) || {}).path || '').replace(/\\/g, '/');
        if (!isTavernFontPath(path)) return { ok: false, reason: '酒馆没有返回文件路径。' };
        const label = String(file.name || '自定义字体').replace(/\.[^.]+$/, '').trim().slice(0, 24) || '自定义字体';
        return {
            ok: true,
            font: {
                id: stamp,
                label,
                family: customFontFamily(label, stamp),
                path: path.startsWith('/') ? path : `/${path}`,
                format: ext,
            },
        };
    } catch (error) {
        return { ok: false, reason: '上传失败，请稍后再试。' };
    }
}

export async function deleteTavernFont(globalObject, path) {
    if (!isTavernFontPath(path)) return false;
    const ctx = getSillyTavernContext(globalObject);
    const headers = ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    if (!headers || typeof globalObject.fetch !== 'function') return false;
    try {
        const res = await globalObject.fetch('/api/files/delete', { method: 'POST', headers, body: JSON.stringify({ path: path.replace(/^\//, '') }) });
        return Boolean(res && res.ok);
    } catch (error) {
        return false;
    }
}

const registered = new WeakMap();

// 把上传的字体注册进宿主 document 的字体表；同一文档只注册一次，失败的下次渲染再试。
export function registerCustomFonts(doc, fonts) {
    const list = normalizeCustomFonts(fonts);
    if (!doc || !list.length) return [];
    const FontFaceCtor = (doc.defaultView && doc.defaultView.FontFace) || (typeof FontFace === 'function' ? FontFace : null);
    if (!FontFaceCtor || !doc.fonts || typeof doc.fonts.add !== 'function') return [];
    let done = registered.get(doc);
    if (!done) {
        done = new Set();
        registered.set(doc, done);
    }
    for (const font of list) {
        if (done.has(font.family)) continue;
        // 加载中也算已登记，避免加载完成前的每次重绘都再建一份 FontFace。
        done.add(font.family);
        try {
            const face = new FontFaceCtor(font.family, `url("${font.path}")`, { display: 'swap', style: 'normal' });
            doc.fonts.add(face);
            // 渲染不等加载；加载失败时撤掉登记，下一次渲染重新尝试。
            if (typeof face.load === 'function') {
                Promise.resolve().then(() => face.load()).catch(() => {
                    done.delete(font.family);
                    try { if (typeof doc.fonts.delete === 'function') doc.fonts.delete(face); } catch (error) { /* */ }
                });
            }
        } catch (error) {
            done.delete(font.family);
        }
    }
    return list;
}

// 内置选项 + 上传字体：设置页与记录页的字体下拉共用同一份。
export function fontOptionsWith(builtinOptions, fonts) {
    const list = normalizeCustomFonts(fonts);
    if (!list.length) return builtinOptions;
    return builtinOptions.concat(list.map((font) => [customFontStack(font), `${font.label}（已上传）`]));
}
