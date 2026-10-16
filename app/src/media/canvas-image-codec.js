import { CG_PIXEL_CAP } from '../generated-images/illustration/cg-pixel-cap.js';

// 媒体编解码与显示层分离；超限图片在创建像素画布前拒绝。
export function createCanvasImageCodec(globalObject = globalThis) {
    const doc = globalObject?.document;
    const available = Boolean(doc?.createElement && typeof globalObject.Image === 'function');
    const canvasOf = (width, height) => {
        if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0) || width * height > CG_PIXEL_CAP)
            throw new Error('image-size-invalid');
        const canvas = doc.createElement('canvas');
        canvas.width = width; canvas.height = height;
        return canvas;
    };
    return {
        available,
        async decodeImage(src, { signal } = {}) {
            if (!available) throw new Error('no-canvas');
            const img = await new Promise((resolve, reject) => {
                const image = new globalObject.Image();
                let settled = false;
                const finish = (error) => {
                    if (settled) return;
                    settled = true;
                    (globalObject.clearTimeout || clearTimeout)(timer);
                    signal?.removeEventListener('abort', abort);
                    image.onload = null; image.onerror = null;
                    if (error) { image.src = ''; reject(error); } else resolve(image);
                };
                const abort = () => finish(new Error('image-load-cancelled'));
                const timer = (globalObject.setTimeout || setTimeout)(() => finish(new Error('image-load-timeout')), 30000);
                image.crossOrigin = 'anonymous';
                image.onload = () => finish();
                image.onerror = () => finish(new Error('image-load-failed'));
                if (signal?.aborted) { abort(); return; }
                signal?.addEventListener('abort', abort, { once: true });
                image.src = src;
            });
            if (signal?.aborted) throw new Error('image-load-cancelled');
            const canvas = canvasOf(img.naturalWidth || img.width, img.naturalHeight || img.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error('no-canvas-context');
            ctx.drawImage(img, 0, 0);
            return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
        },
        async encodePixels({ width, height, data }) {
            if (!available || data?.length !== width * height * 4) throw new Error('invalid-pixels');
            const canvas = canvasOf(width, height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('no-canvas-context');
            const pixels = ctx.createImageData(width, height);
            pixels.data.set(data); ctx.putImageData(pixels, 0, 0);
            return canvas.toDataURL('image/png');
        },
    };
}
