import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

// jsDelivr 拒绝 GitHub 上超过 20MB 的单文件；超过 5MB 的 CJK 字体一律切片，首屏只拉用到的分片。
export const SPLIT_FONT_MIN_BYTES = 5 * 1024 * 1024;
export const JSDELIVR_FILE_LIMIT_BYTES = 20 * 1024 * 1024;

export function fontSliceName(file) {
    return path.basename(file).replace(/\.[^.]+$/, '');
}

export function fontSliceManifestPath(manifestDir, file) {
    return path.join(manifestDir, `${fontSliceName(file)}.json`);
}

export function parseSliceCss(css) {
    const slices = [];
    for (const rule of String(css).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const url = rule[1].match(/url\(\s*["']?\.\/([^"')]+)["']?\s*\)/);
        const range = rule[1].match(/unicode-range\s*:\s*([^;}]+)/);
        if (!url || !range) continue;
        slices.push({ file: url[1], unicodeRange: range[1].trim().replace(/\s+/g, '') });
    }
    return slices;
}

export function renderSliceFontFaces({ family, weight, style }, slices) {
    return slices.map(({ file, unicodeRange }) => `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url("./${file}") format("woff2");unicode-range:${unicodeRange};}`).join('\n') + '\n';
}

// 截断的字体签名完好，浏览器却整体拒收并静默回退到下一个字体；按表目录核对每张表都落在文件内。
export function findTruncatedFontTables(buf) {
    const signature = buf.toString('latin1', 0, 4);
    if (signature === 'wOF2') return buf.length < buf.readUInt32BE(8) ? ['wOF2'] : [];
    const numTables = buf.readUInt16BE(4);
    if (buf.length < 12 + numTables * 16) return ['tableDirectory'];
    const truncated = [];
    for (let i = 0; i < numTables; i += 1) {
        const entry = 12 + i * 16;
        if (buf.readUInt32BE(entry + 8) + buf.readUInt32BE(entry + 12) > buf.length) truncated.push(buf.toString('latin1', entry, entry + 4));
    }
    return truncated;
}

export function contentHash(text, length = 8) {
    return createHash('sha256').update(text).digest('hex').slice(0, length);
}

export function readSliceManifest(manifestDir, file) {
    const target = fontSliceManifestPath(manifestDir, file);
    if (!fs.existsSync(target)) return null;
    const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!Array.isArray(manifest.slices) || !manifest.slices.length) throw new Error(`Font slice manifest is empty: ${target}`);
    return manifest;
}

function readBase128(buf, pos) {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
        const byte = buf[pos];
        pos += 1;
        value = value * 128 + (byte & 0x7f);
        if (!(byte & 0x80)) return [value, pos];
    }
    throw new Error('Invalid WOFF2 UIntBase128.');
}

// cn-font-split 的 brotli 档位偏低；只重压数据流，表结构与字形原样保留。
export function rebrotliWoff2(buf) {
    if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 font.');
    const numTables = buf.readUInt16BE(12);
    const compressedLength = buf.readUInt32BE(20);
    if (buf.readUInt32BE(32) || buf.readUInt32BE(40) || buf.toString('latin1', 4, 8) === 'ttcf') return buf;
    let pos = 48;
    for (let i = 0; i < numTables; i += 1) {
        const flags = buf[pos];
        pos += 1;
        const tagIndex = flags & 0x3f;
        const version = flags >> 6;
        if (tagIndex === 63) pos += 4;
        [, pos] = readBase128(buf, pos);
        const transformed = tagIndex === 10 || tagIndex === 11 ? version === 0 : version !== 0;
        if (transformed) [, pos] = readBase128(buf, pos);
    }
    const raw = zlib.brotliDecompressSync(buf.subarray(pos, pos + compressedLength));
    const next = zlib.brotliCompressSync(raw, {
        params: {
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_FONT,
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
    });
    if (next.length >= compressedLength) return buf;
    const length = (pos + next.length + 3) & ~3;
    const out = Buffer.alloc(length);
    buf.copy(out, 0, 0, pos);
    next.copy(out, pos);
    out.writeUInt32BE(length, 8);
    out.writeUInt32BE(next.length, 20);
    return out;
}
