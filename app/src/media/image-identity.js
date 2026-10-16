import { imageSha256 } from './image-sha256.js';
export const IMAGE_FIELDS = ['dataUrl', 'originalDataUrl', 'workingDataUrl', 'alphaMaskDataUrl', 'consistencyBaselineDataUrl'];
export const isImageData = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(value);
export const isImagePath = value => typeof value === 'string' && /^\/?user\/images\/igs-[^?#]+$/.test(value);
export const normalizeImagePath = value => String(value || '').replace(/^\//, '');

export function imageFingerprint(text) {
    let a = 0xdeadbeef, b = 0x41c6ce57, c = 0x9e3779b9, d = 0x85ebca6b;
    for (let i = 0; i < text.length; i += 1) {
        const v = text.charCodeAt(i);
        a = Math.imul(a ^ v, 2654435761); b = Math.imul(b ^ v, 1597334677);
        c = Math.imul(c ^ v, 2246822507); d = Math.imul(d ^ v, 3266489909);
    }
    return [a, b, c, d].map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export async function imageContentId(dataUrl, globalObject = globalThis) {
    const subtle = globalObject.crypto?.subtle || globalThis.crypto?.subtle;
    const binary = (globalObject.atob || globalThis.atob)(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (!subtle) return imageSha256(bytes, globalObject);
    const hash = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return [...hash].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function imagePaths(record) {
    return new Set(IMAGE_FIELDS.map(field => record && record[field]).filter(isImagePath).map(normalizeImagePath));
}

export function dataUrlBytes(value) {
    const comma = value.indexOf(',');
    const body = value.slice(comma + 1);
    return Math.max(0, Math.floor(body.length * 3 / 4) - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0));
}

export function dataUrlBlob(value, globalObject) {
    if (!globalObject.Blob || !globalObject.atob) return null;
    const match = /^data:([^;,]+);base64,/i.exec(value);
    if (!match) return null;
    const binary = globalObject.atob(value.slice(match[0].length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new globalObject.Blob([bytes], { type: match[1] });
}

export async function blobDataUrl(blob, globalObject, { signal, timeoutMs = 15000 } = {}) {
    if (typeof blob === 'string') return blob;
    if (globalObject.FileReader) return new Promise((resolve, reject) => {
        const reader = new globalObject.FileReader();
        let settled = false, timer;
        const finish = (value, error) => {
            if (settled) return;
            settled = true; (globalObject.clearTimeout || clearTimeout)(timer);
            signal?.removeEventListener('abort', abort);
            reader.onload = null; reader.onerror = null; reader.onabort = null;
            if (error) { reader.abort?.(); reject(error); } else resolve(value);
        };
        const abort = () => finish('', new Error('image-read-aborted'));
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        timer = (globalObject.setTimeout || setTimeout)(() => finish('', new Error('image-read-timeout')), timeoutMs); timer?.unref?.();
        reader.onload = () => finish(String(reader.result || ''));
        reader.onerror = () => finish('', new Error('image-read-failed')); reader.onabort = abort;
        try { reader.readAsDataURL(blob); } catch (error) { finish('', error); }
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${blob.type || 'image/png'};base64,${(globalObject.btoa || globalThis.btoa)(binary)}`;
}
