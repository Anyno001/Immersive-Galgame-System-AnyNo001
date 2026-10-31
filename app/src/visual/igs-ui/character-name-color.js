import { paletteFromPixels } from './title-cover-color.js';

// 角色名字色：资料里手动设的主色（sceneAssets.characterNameColors，按主名记，所有衣服通用）优先；
// 没设时从该角色的默认立绘取色，算法与开场封面同一套（挑「又多又鲜」的色相）；读不到像素时由调用方用固定色兜底。
const HEX = /^#[0-9a-f]{6}$/i;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

export function normalizeCharacterNameColors(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, value] of Object.entries(raw)) {
        const name = String(key || '').trim();
        if (!name || FORBIDDEN.has(name) || !HEX.test(String(value || ''))) continue;
        out[name] = String(value).toLowerCase();
    }
    return out;
}

export function manualNameColor(sceneAssets, name) {
    const map = sceneAssets && sceneAssets.characterNameColors;
    const value = map && typeof map === 'object' && Object.hasOwn(map, name) ? map[name] : '';
    return HEX.test(String(value || '')) ? String(value).toLowerCase() : '';
}

const SAMPLE = 32;
const cache = new Map();
const pending = new Map();

export function cachedSpriteNameColor(url) {
    const key = String(url || '');
    return key && cache.has(key) ? cache.get(key) : undefined;
}

// 立绘 → 名字色（取色块那一档）；同一地址只算一次，最近 48 张。读不到（跨域、透明图全空）记 ''。
export function spriteNameColor(url, doc) {
    const key = String(url || '');
    if (!key || !doc || !doc.defaultView) return Promise.resolve('');
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const job = new Promise((resolve) => {
        const img = new doc.defaultView.Image();
        img.decoding = 'async';
        try { if (new URL(key, doc.baseURI).origin !== doc.defaultView.location.origin) img.crossOrigin = 'anonymous'; } catch (_) { /* data: / blob: 同源 */ }
        img.onload = () => {
            let color = '';
            try {
                const canvas = doc.createElement('canvas');
                canvas.width = SAMPLE;
                canvas.height = SAMPLE;
                const g = canvas.getContext('2d', { willReadFrequently: true });
                if (g) {
                    g.drawImage(img, 0, 0, SAMPLE, SAMPLE);
                    const palette = paletteFromPixels(g.getImageData(0, 0, SAMPLE, SAMPLE).data);
                    color = palette ? palette.block : '';
                }
            } catch (_) { color = ''; }
            resolve(color);
        };
        img.onerror = () => resolve('');
        img.src = key;
    }).then((color) => {
        pending.delete(key);
        cache.set(key, color);
        if (cache.size > 48) cache.delete(cache.keys().next().value);
        return color;
    });
    pending.set(key, job);
    return job;
}
