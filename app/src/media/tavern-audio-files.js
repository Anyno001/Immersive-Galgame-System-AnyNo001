// 用户上传的背景音乐存进酒馆本地 user/files/igs-bgm-*（/api/files/upload），设置里只记路径，不把音频塞进浏览器存储。
// 与酒馆同源，播放不受跨域限制。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

export const BGM_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
const EXTENSIONS = Object.freeze(['mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wav', 'flac', 'webm']);
const PATH_RE = /^\/?user\/files\/igs-bgm-[\w.-]+$/;

function extensionOf(file) {
    const fromName = String(file && file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    if (fromName && EXTENSIONS.includes(fromName[1])) return fromName[1];
    const fromType = String(file && file.type || '').toLowerCase().match(/^audio\/(?:x-)?([a-z0-9]+)/);
    if (!fromType) return '';
    const type = fromType[1] === 'mpeg' ? 'mp3' : fromType[1] === 'mp4' ? 'm4a' : fromType[1];
    return EXTENSIONS.includes(type) ? type : '';
}

function base64Of(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return globalThis.btoa(binary);
}

export function isTavernAudioPath(value) {
    return typeof value === 'string' && PATH_RE.test(value);
}

// 让用户选一个本地音频文件；取消返回 null。
export function pickAudioFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = `audio/*,${EXTENSIONS.map((ext) => `.${ext}`).join(',')}`;
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

// 返回 { ok, path, name } 或 { ok: false, reason }；reason 供设置页直接提示。
export async function uploadTavernAudio(globalObject, file) {
    const ext = extensionOf(file);
    if (!ext) return { ok: false, reason: '只支持 mp3、ogg、m4a、wav、flac 等音频文件。' };
    if (!(file.size > 0) || file.size > BGM_UPLOAD_MAX_BYTES) return { ok: false, reason: '音频文件需小于 30MB。' };
    const ctx = getSillyTavernContext(globalObject);
    const headers = ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    if (!headers || typeof globalObject.fetch !== 'function') return { ok: false, reason: '没连上酒馆，无法上传；可以改用音频直链。' };
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
        const res = await globalObject.fetch('/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: `igs-bgm-${stamp}.${ext}`, data: base64Of(bytes) }),
        });
        if (!res || !res.ok) return { ok: false, reason: '酒馆拒绝了这次上传。' };
        const path = String(((await res.json().catch(() => null)) || {}).path || '').replace(/\\/g, '/');
        if (!isTavernAudioPath(path)) return { ok: false, reason: '酒馆没有返回文件路径。' };
        return { ok: true, path: path.startsWith('/') ? path : `/${path}`, name: String(file.name || '').replace(/\.[^.]+$/, '') };
    } catch {
        return { ok: false, reason: '上传失败，请稍后再试。' };
    }
}

// 删除曲目时顺手删掉酒馆里的文件；失败不影响删除曲目本身。
export async function deleteTavernAudio(globalObject, path) {
    if (!isTavernAudioPath(path)) return false;
    const ctx = getSillyTavernContext(globalObject);
    const headers = ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    if (!headers || typeof globalObject.fetch !== 'function') return false;
    try {
        const res = await globalObject.fetch('/api/files/delete', { method: 'POST', headers, body: JSON.stringify({ path: path.replace(/^\//, '') }) });
        return Boolean(res && res.ok);
    } catch {
        return false;
    }
}
