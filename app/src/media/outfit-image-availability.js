// 人物立绘可用性检查：只读取已登记图，不生成图片或改变素材资料。
import { outfitSpriteSlots } from '../scene/character-appearance.js';

function readableImage(src, global, signal) {
    return new Promise((resolve) => {
        if (typeof global.Image !== 'function') { resolve(false); return; }
        const image = new global.Image();
        let settled = false;
        const finish = ok => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            image.onload = null; image.onerror = null;
            if (!ok) image.src = '';
            resolve(ok);
        };
        const abort = () => finish(false);
        const timer = setTimeout(abort, 15000);
        image.onload = () => finish((image.naturalWidth || image.width) > 0 && (image.naturalHeight || image.height) > 0);
        image.onerror = abort;
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        image.src = src;
    });
}

export async function inspectOutfitImages(entry, { readStoredImage, global = globalThis, signal } = {}) {
    const states = Object.create(null);
    for (const url of new Set(Object.values(outfitSpriteSlots(entry)))) {
        if (signal?.aborted) { states[url] = { status: 'read-error' }; continue; }
        try {
            let src = url, revision;
            if (url.startsWith('igs-gen:')) {
                if (typeof readStoredImage !== 'function') { states[url] = { status: 'read-error' }; continue; }
                const id = url.slice(8);
                const record = await readStoredImage(id);
                if (!record) { states[url] = { status: 'missing' }; continue; }
                if (record.id !== id || record.type !== 'sprite' || !record.dataUrl) {
                    states[url] = { status: 'read-error' }; continue;
                }
                src = record.dataUrl;
                revision = record.revisionToken ?? record.revision ?? record.updatedAt;
            }
            const ok = await readableImage(src, global, signal);
            states[url] = { status: ok ? 'available' : 'read-error',
                ...(ok && revision !== undefined && { revision }) };
        } catch { states[url] = { status: 'read-error' }; }
    }
    return states;
}
