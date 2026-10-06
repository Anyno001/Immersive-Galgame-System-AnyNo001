// CG 库缩略图：把一张原图缩成 320 宽的 JPEG（几十 KB）。网格只放缩略图，原图只在看大图时用。
export const CG_THUMB_WIDTH = 320;
const DECODE_TIMEOUT_MS = 15000;

function decode(globalObject, src) {
    const Image = globalObject && globalObject.Image;
    if (typeof Image !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
        const img = new Image();
        const timer = globalObject.setTimeout(() => resolve(null), DECODE_TIMEOUT_MS);
        img.onload = () => { globalObject.clearTimeout(timer); resolve(img); };
        img.onerror = () => { globalObject.clearTimeout(timer); resolve(null); };
        img.decoding = 'async';
        img.src = src;
    });
}

export function createCgThumbnailer(globalObject = globalThis, { width = CG_THUMB_WIDTH, quality = 0.8 } = {}) {
    return async function makeThumbnail(src) {
        const doc = globalObject && globalObject.document;
        if (!src || !doc || typeof doc.createElement !== 'function') return '';
        const img = await decode(globalObject, src);
        const iw = img && (img.naturalWidth || img.width);
        const ih = img && (img.naturalHeight || img.height);
        if (!iw || !ih) return '';
        const w = Math.min(width, iw);
        const h = Math.max(1, Math.round((ih * w) / iw));
        const canvas = doc.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return '';
        ctx.drawImage(img, 0, 0, w, h);
        try { return canvas.toDataURL('image/jpeg', quality); } catch { return ''; }
    };
}
