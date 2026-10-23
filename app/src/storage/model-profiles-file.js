import { mediaRequest } from '../media/tavern-media-http.js';
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';
// 模型预设存酒馆本地 user/files/igs-model-profiles.json（/api/files/upload），不进浏览器存储。
// 格式：{ version:1, profiles:[{ id, name, kind:'image'|'llm', savedAt, values }] }。
export const MODEL_PROFILES_FILE_NAME = 'igs-model-profiles.json';
const MODEL_PROFILES_URL = `/user/files/${MODEL_PROFILES_FILE_NAME}`;
const KINDS = new Set(['image', 'llm']);

function utf8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return globalThis.btoa(binary);
}

export function normalizeModelProfiles(file) {
    const list = Array.isArray(file?.profiles) ? file.profiles : [];
    return list.filter((item) => item && typeof item === 'object' && KINDS.has(item.kind)
        && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name
        && item.values && typeof item.values === 'object' && !Array.isArray(item.values))
        .map((item) => ({ id: item.id, name: item.name, kind: item.kind, savedAt: Number(item.savedAt) || 0, values: { ...item.values } }));
}

export function createModelProfilesStore(globalObject = globalThis, { now = () => Date.now() } = {}) {
    async function read() {
        const res = await mediaRequest(globalObject, `${MODEL_PROFILES_URL}?t=${now()}`, { cache: 'no-store', recover: false }, 8000);
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
        let file;
        try { file = await res.json(); } catch { throw new Error('预设文件格式无效'); }
        return normalizeModelProfiles(file);
    }
    async function write(profiles) {
        const ctx = getSillyTavernContext(globalObject);
        const headers = ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
        if (!headers) throw new Error('酒馆连接尚未就绪');
        const text = JSON.stringify({ version: 1, profiles });
        const res = await mediaRequest(globalObject, '/api/files/upload', {
            method: 'POST', headers, body: JSON.stringify({ name: MODEL_PROFILES_FILE_NAME, data: utf8Base64(text) }),
        });
        if (!res || !res.ok) throw new Error(`写入失败${res?.status ? `（HTTP ${res.status}）` : ''}`);
        return profiles;
    }
    // 读改写以文件最新内容为准；同类型同名覆盖。
    async function save({ name, kind, values }) {
        const cleanName = String(name || '').trim();
        if (!cleanName || !KINDS.has(kind)) throw new Error('预设名称无效');
        const profiles = await read();
        const existing = profiles.find((item) => item.kind === kind && item.name === cleanName);
        const entry = { id: existing ? existing.id : `mp-${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            name: cleanName, kind, savedAt: now(), values: { ...values } };
        return write(existing ? profiles.map((item) => (item === existing ? entry : item)) : [...profiles, entry]);
    }
    async function remove(id) {
        const profiles = await read();
        return write(profiles.filter((item) => item.id !== id));
    }
    return { read, save, remove };
}
