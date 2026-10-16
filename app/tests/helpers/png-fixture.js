import { deflateSync } from 'node:zlib';

// 真实 PNG 夹具：正确 CRC、zlib 与扫描行；可单独破坏容器或编码测试拒发。
export function pngChunk(type, data = Buffer.alloc(0)) {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, body, tail]);
}
export function pngFixture(width = 64, height = 128, options = {}) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
    const depth = options.depth || 8;
    header[8] = depth; header[9] = 6; header[12] = options.interlace || 0;
    const passes = header[12] === 1 ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8],
        [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
    const length = passes.reduce((sum, [x, y, dx, dy]) => {
        const w = Math.max(0, Math.ceil((width - x) / dx));
        const h = Math.max(0, Math.ceil((height - y) / dy));
        return sum + (w && h ? (w * 4 * depth / 8 + 1) * h : 0);
    }, 0);
    const pixels = options.scanlines || Buffer.alloc(length);
    const compressed = options.idat || deflateSync(pixels, options.deflate);
    const chunks = [];
    const step = options.idatChunkSize || Math.max(1, compressed.length);
    for (let at = 0; at < compressed.length; at += step)
        chunks.push(pngChunk('IDAT', compressed.subarray(at, at + step)));
    if (!chunks.length) chunks.push(pngChunk('IDAT'));
    const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header), ...chunks, pngChunk('IEND')]);
    const base64 = bytes.toString('base64');
    return { bytes, base64, dataUrl: 'data:image/png;base64,' + base64 };
}

// ZIP 响应夹具含中央目录，可模拟流式封装的 data descriptor。
export function imageZipFixture(bytes, { method = 0, descriptor = false, name = 'image_0.png', compressed } = {}) {
    const original = Buffer.from(bytes), filename = Buffer.from(name);
    const body = compressed ? Buffer.from(compressed) : original;
    let crc = 0xffffffff;
    for (const byte of original) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(descriptor ? 8 : 0, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(descriptor ? 0 : crc, 14);
    local.writeUInt32LE(descriptor ? 0 : body.length, 18);
    local.writeUInt32LE(descriptor ? 0 : original.length, 22); local.writeUInt16LE(filename.length, 26);
    const tail = descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (descriptor) {
        tail.writeUInt32LE(0x08074b50, 0); tail.writeUInt32LE(crc, 4);
        tail.writeUInt32LE(body.length, 8); tail.writeUInt32LE(original.length, 12);
    }
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(descriptor ? 8 : 0, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(original.length, 24); central.writeUInt16LE(filename.length, 28);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + filename.length, 12);
    end.writeUInt32LE(local.length + filename.length + body.length + tail.length, 16);
    return Buffer.concat([local, filename, body, tail, central, filename, end]);
}
