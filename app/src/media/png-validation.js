// PNG 容器校验与有界压缩数据验证；不记录图像载荷，不依赖 canvas 或 provider。
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const formats = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
// 应用资源边界，不是 PNG 理论上限：1024² RGBA16 扫描行约 8 MiB，
// 留出压缩膨胀、分块及元数据余量；任意冗余编码仍可能被此策略拒绝。
export const MAX_PNG_INPUT_BYTES = 16 * 1024 * 1024;
const maxBase64Length = 4 * Math.ceil(MAX_PNG_INPUT_BYTES / 3);
const fail = reason => ({ ok: false, reason });
const u32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);
function crc32(bytes, from, to) {
    let crc = 0xffffffff;
    for (let i = from; i < to; i++) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPngDataUrl(value, { width, height, maxPixels } = {}) {
    if (typeof value !== 'string' || !/^data:image\/png;base64,/i.test(value)) return fail('invalid-png');
    const start = value.indexOf(',') + 1, length = value.length - start;
    if (length > maxBase64Length) return fail('png-input-limit');
    if (!length || length % 4) return fail('invalid-png');
    const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
    if (length / 4 * 3 - padding > MAX_PNG_INPUT_BYTES) return fail('png-input-limit');
    const base64 = value.slice(start);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return fail('invalid-png');
    let bytes;
    try {
        const raw = atob(base64);
        if (raw.length > MAX_PNG_INPUT_BYTES) return fail('png-input-limit');
        if (btoa(raw) !== base64) return fail('invalid-png');
        bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    } catch { return fail('invalid-png'); }
    if (bytes.length < 57 || !signature.every((v, i) => bytes[i] === v)) return fail('invalid-png');
    let at = 8, header, ended = false, palette = false, dataClosed = false;
    const idat = [];
    while (at + 12 <= bytes.length) {
        const length = u32(bytes, at), end = at + length + 12;
        if (end > bytes.length) return fail('invalid-png');
        const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()
            || crc32(bytes, at + 4, end - 4) !== u32(bytes, end - 4)) return fail('invalid-png');
        if (!header && type !== 'IHDR') return fail('invalid-png');
        if (type === 'IHDR') {
            if (header || length !== 13) return fail('invalid-png');
            header = { width: u32(bytes, at + 8), height: u32(bytes, at + 12),
                depth: bytes[at + 16], color: bytes[at + 17], interlace: bytes[at + 20] };
            if (!header.width || !header.height || !formats[header.color]?.includes(header.depth)
                || bytes[at + 18] || bytes[at + 19] || header.interlace > 1) return fail('invalid-png');
            if (header.width !== width || header.height !== height) return fail('png-dimensions-mismatch');
            if (!Number.isSafeInteger(maxPixels) || header.width * header.height > maxPixels) return fail('png-pixel-limit');

        } else if (type === 'PLTE') {
            if (palette || idat.length || !length || length % 3 || length > 768
                || [0, 4].includes(header.color) || (header.color === 3 && length / 3 > 2 ** header.depth))
                return fail('invalid-png');
            palette = length / 3;
        } else if (type === 'IDAT') {
            if (dataClosed || (header.color === 3 && !palette)) return fail('invalid-png');
            idat.push(bytes.subarray(at + 8, end - 4));
        } else if (type === 'IEND') {
            if (length || !idat.length || end !== bytes.length) return fail('invalid-png');
            ended = true; break;
        } else {
            if (type[0] === type[0].toUpperCase() || type === 'acTL') return fail('unsupported-png');
            if (idat.length) dataClosed = true;
        }
        at = end;
    }
    if (!ended) return fail('invalid-png');
    return { ok: true, base64, ...header, palette, idat };
}

function scanlinePasses(png) {
    const passes = png.interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8],
        [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
    return passes.map(([x, y, dx, dy]) => {
        const width = Math.max(0, Math.ceil((png.width - x) / dx));
        const height = Math.max(0, Math.ceil((png.height - y) / dy));
        return { width, height, stride: Math.ceil(width * channels[png.color] * png.depth / 8) };
    }).filter(pass => pass.width && pass.height);
}

// 检查 zlib 校验、实际扫描行长度及过滤器；解压输出不可超过 IHDR 推导的精确上限。
export async function validatePngEncoding(png) {
    if (!png?.ok) return png || fail('invalid-png');
    if (typeof DecompressionStream !== 'function') return fail('png-decode-unavailable');
    const passes = scanlinePasses(png);
    const expected = passes.reduce((sum, pass) => sum + (pass.stride + 1) * pass.height, 0);
    const output = new Uint8Array(expected);
    let reader, at = 0;
    try {
        reader = new Blob(png.idat).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (at + value.length > expected) { await reader.cancel(); return fail('invalid-png-encoding'); }
            output.set(value, at); at += value.length;
        }
        if (at !== expected) return fail('invalid-png-encoding');
        return validateScanlines(output, passes, png);
    } catch { return fail('invalid-png-encoding'); }
    finally { reader?.releaseLock(); }
}


function paeth(a, b, c) {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
}

function validateScanlines(output, passes, png) {
    const bpp = Math.max(1, Math.ceil(channels[png.color] * png.depth / 8));
    let at = 0;
    for (const pass of passes) {
        let previous = new Uint8Array(pass.stride);
        for (let y = 0; y < pass.height; y++) {
            const filter = output[at++];
            if (filter > 4) return fail('invalid-png-encoding');
            const row = output.subarray(at, at + pass.stride);
            for (let x = 0; x < row.length; x++) {
                const left = x >= bpp ? row[x - bpp] : 0, up = previous[x];
                const upperLeft = x >= bpp ? previous[x - bpp] : 0;
                const prediction = filter === 1 ? left : filter === 2 ? up
                    : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
                row[x] = (row[x] + prediction) & 255;
            }
            if (png.color === 3) {
                const bits = png.depth, mask = (1 << bits) - 1;
                for (let x = 0; x < pass.width; x++) {
                    const offset = x * bits, shift = 8 - bits - (offset % 8);
                    if (((row[Math.floor(offset / 8)] >> shift) & mask) >= png.palette)
                        return fail('invalid-png-encoding');
                }
            }
            at += pass.stride; previous = row;
        }
    }
    return { ok: true };
}
