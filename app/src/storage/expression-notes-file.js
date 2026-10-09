// 立绘 / 表情的生图提示词（sceneAssets.generated.expressionNotes）存到酒馆本地 user/files/igs-expression-notes.json。
// localStorage 为省容量不存这一段，清缓存或重开后提示词会丢；这里单独落文件，启动时读回补进运行时配置。
// 运行时内存里的条目优先，文件只补缺；内容变了才防抖上传。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

export const EXPRESSION_NOTES_FILE_NAME = 'igs-expression-notes.json';
const FILE_URL = `/user/files/${EXPRESSION_NOTES_FILE_NAME}`;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function utf8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

// 文件里的条目补进 notes：按「角色 → 表情」两层合并，已有的不覆盖。返回是否补进了内容。
export function fillExpressionNotes(notes, fromFile) {
    let changed = false;
    for (const [name, moods] of Object.entries(plain(fromFile) || {})) {
        if (!plain(moods)) continue;
        const own = plain(notes[name]) || {};
        for (const [mood, note] of Object.entries(moods)) {
            if (Object.hasOwn(own, mood) || !plain(note)) continue;
            own[mood] = note;
            changed = true;
        }
        notes[name] = own;
    }
    return changed;
}

export function createExpressionNotesFile(globalObject, { debounceMs = 2000 } = {}) {
    let timer = null;
    let lastUploaded = '';
    let pending = null;
    let loaded = false;
    const headers = () => {
        const ctx = getSillyTavernContext(globalObject);
        return ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    };

    async function load() {
        if (typeof globalObject.fetch !== 'function') return null;
        try {
            const res = await globalObject.fetch(`${FILE_URL}?t=${Date.now()}`, { cache: 'no-store' });
            loaded = true;
            if (!res.ok) return null;
            const file = await res.json();
            const notes = plain(file && file.notes);
            if (notes) lastUploaded = JSON.stringify(notes);
            return notes;
        } catch { return null; }
    }

    async function upload() {
        timer = null;
        const h = headers();
        const body = pending;
        if (!h || body == null || body === lastUploaded) return;
        const text = `{"version":1,"savedAt":${Date.now()},"notes":${body}}`;
        try {
            const res = await globalObject.fetch('/api/files/upload', {
                method: 'POST', headers: h, body: JSON.stringify({ name: EXPRESSION_NOTES_FILE_NAME, data: utf8Base64(text) }),
            });
            if (res && res.ok) lastUploaded = body;
        } catch { /* 下次保存再试 */ }
    }

    // 文件读回之前不上传：避免启动时用不全的内容覆盖掉文件。读回之后清空也照写，删掉的不会再被补回。
    function save(notes) {
        const src = plain(notes);
        if (!src || !loaded) return;
        pending = JSON.stringify(src);
        if (pending === lastUploaded) return;
        clearTimeout(timer);
        timer = setTimeout(() => { void upload(); }, debounceMs);
    }

    function flush() {
        if (timer) { clearTimeout(timer); void upload(); }
    }

    return { load, save, flush };
}
