import fs from 'node:fs';
import path from 'node:path';

export const SKIN_ASSET_TOKEN_RE = /__IGS_ASSET__([a-z0-9-]+)\/([a-z0-9-]+)\.(png|webp)__/g;
// 线稿与花纹素材的肉眼阈值：预乘 alpha 后任一通道最大偏差超过 4/255 就保留 PNG。
export const MAX_WEBP_CHANNEL_DELTA = 4;
const WEBP_OPTIONS = Object.freeze({ nearLossless: true, quality: 60, effort: 6 });

async function loadSharp() {
    try {
        return (await import('sharp')).default;
    } catch (error) {
        throw new Error('Build needs the sharp dev dependency; run `pnpm install` in app/ first.');
    }
}

async function rgba(sharp, bytes) {
    return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export function maxPremultipliedDelta(a, b) {
    if (a.length !== b.length) return Infinity;
    let max = 0;
    for (let i = 0; i < a.length; i += 4) {
        const aa = a[i + 3] / 255;
        const ba = b[i + 3] / 255;
        for (let c = 0; c < 3; c += 1) max = Math.max(max, Math.abs(a[i + c] * aa - b[i + c] * ba));
        max = Math.max(max, Math.abs(a[i + 3] - b[i + 3]));
    }
    return max;
}

export async function encodeSkinImage(pngBytes, { maxDelta = MAX_WEBP_CHANNEL_DELTA } = {}) {
    const sharp = await loadSharp();
    const webp = await sharp(pngBytes).webp(WEBP_OPTIONS).toBuffer();
    if (webp.length >= pngBytes.length) return { ext: 'png', bytes: pngBytes, delta: 0 };
    const [ref, out] = await Promise.all([rgba(sharp, pngBytes), rgba(sharp, webp)]);
    const sameSize = ref.info.width === out.info.width && ref.info.height === out.info.height;
    const delta = sameSize ? maxPremultipliedDelta(ref.data, out.data) : Infinity;
    return delta > maxDelta ? { ext: 'png', bytes: pngBytes, delta } : { ext: 'webp', bytes: webp, delta };
}

async function emit(source, targetBase, report) {
    if (!fs.existsSync(source)) throw new Error(`Skin image is missing: ${source}`);
    const png = fs.readFileSync(source);
    if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Skin image is not a PNG: ${source}`);
    const result = await encodeSkinImage(png);
    fs.mkdirSync(path.dirname(targetBase), { recursive: true });
    fs.writeFileSync(`${targetBase}.${result.ext}`, result.bytes);
    report.push({ file: path.basename(targetBase), png: png.length, out: result.bytes.length, ext: result.ext, delta: Math.round(result.delta * 10) / 10 });
    return result.ext;
}

function replaceOnce(text, from, to) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`Expected exactly one asset base literal ${from}, found ${count}.`);
    return text.replace(from, to);
}

// 皮肤素材按主题输出到 dist/skins/<theme>/，焦散纹理输出到 dist/ui/；运行时相对 bundle 的 import.meta.url 取址。
export async function externalizeSkinAssets(bundle, { srcRoot, distRoot }) {
    const themeDir = path.join(srcRoot, 'visual', 'igs-ui', 'assets', 'dialog-themes');
    const skinsDir = path.join(distRoot, 'skins');
    const uiDir = path.join(distRoot, 'ui');
    fs.rmSync(skinsDir, { recursive: true, force: true });
    fs.rmSync(uiDir, { recursive: true, force: true });
    const report = [];
    const exts = new Map();
    for (const [, theme, part] of bundle.matchAll(SKIN_ASSET_TOKEN_RE)) {
        const key = `${theme}/${part}`;
        if (exts.has(key)) continue;
        exts.set(key, await emit(path.join(themeDir, theme, `${part}.png`), path.join(skinsDir, theme, part), report));
    }
    if (!exts.size) throw new Error('No dialog skin asset placeholders found in bundle.');
    let result = bundle.replace(SKIN_ASSET_TOKEN_RE, (_match, theme, part) => `__IGS_ASSET__${theme}/${part}.${exts.get(`${theme}/${part}`)}__`);
    result = replaceOnce(result, "new URL('./assets/dialog-themes/', import.meta.url)", "new URL('./skins/', import.meta.url)");
    const causticExt = await emit(path.join(srcRoot, 'styles', 'assets', 'caustic-art.png'), path.join(uiDir, 'caustic-art'), report);
    result = replaceOnce(result, "new URL('./assets/caustic-art.png', import.meta.url)", `new URL('./ui/caustic-art.${causticExt}', import.meta.url)`);
    return { bundle: result, report };
}

export function verifySkinAssets(bundle, distRoot) {
    const missing = [];
    for (const [, theme, part, ext] of bundle.matchAll(SKIN_ASSET_TOKEN_RE)) {
        const file = path.join(distRoot, 'skins', theme, `${part}.${ext}`);
        if (!fs.existsSync(file) || fs.statSync(file).size === 0) missing.push(`${theme}/${part}.${ext}`);
    }
    if (missing.length) throw new Error(`Skin assets referenced by bundle are missing: ${missing.join(', ')}`);
}
