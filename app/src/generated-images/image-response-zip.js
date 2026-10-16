// 解析 ZIP 原始字节；中央目录提供 data descriptor 条目的真实长度。
const fail = (reason, message) => { throw Object.assign(new Error(message), { reason }); };
const truncated = () => fail('image-zip-truncated', 'ZIP 响应不完整');

function directory(view) {
    let end = -1;
    for (let p = view.byteLength - 22; p >= Math.max(0, view.byteLength - 65557); p--) {
        if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === view.byteLength) {
            end = p; break;
        }
    }
    if (end < 0) return null; // 保留既有不含目录、长度明确的本地头响应兼容。
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)
        || view.getUint16(end + 8, true) !== view.getUint16(end + 10, true)) {
        fail('image-zip-unsupported', '不支持分卷 ZIP');
    }
    const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true);
    const start = view.getUint32(end + 16, true), entries = [];
    if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) fail('image-zip-unsupported', '不支持 ZIP64');
    if (start + size > end) truncated();
    let p = start;
    for (let i = 0; i < count; i++) {
        if (p + 46 > start + size || view.getUint32(p, true) !== 0x02014b50) truncated();
        const nameLength = view.getUint16(p + 28, true);
        const next = p + 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
        if (next > start + size) truncated();
        entries.push({ offset: view.getUint32(p + 42, true), method: view.getUint16(p + 10, true),
            flags: view.getUint16(p + 8, true), size: view.getUint32(p + 20, true),
            unpacked: view.getUint32(p + 24, true), limit: start });
        p = next;
    }
    return entries;
}

function localEntry(view, offset, central) {
    if (offset + 30 > view.byteLength || view.getUint32(offset, true) !== 0x04034b50) truncated();
    const flags = view.getUint16(offset + 6, true), method = view.getUint16(offset + 8, true);
    if (flags & 1) fail('image-zip-unsupported', '不支持加密 ZIP');
    if ((flags & 8) && !central) fail('image-zip-directory-required', 'ZIP 数据描述符缺少中央目录');
    if (central && (central.method !== method || central.flags !== flags)) truncated();
    const size = central ? central.size : view.getUint32(offset + 18, true);
    const nameStart = offset + 30, nameLength = view.getUint16(offset + 26, true);
    const start = nameStart + nameLength + view.getUint16(offset + 28, true);
    if (start + size > (central?.limit ?? view.byteLength)) truncated();
    return { start, size, method, nameStart, nameLength,
        unpacked: central ? central.unpacked : view.getUint32(offset + 22, true) };
}

export async function readZipImage(blob) {
    const buffer = await blob.arrayBuffer(), view = new DataView(buffer);
    const entries = directory(view);
    const decode = async entry => {
        const name = new TextDecoder().decode(new Uint8Array(buffer, entry.nameStart, entry.nameLength));
        if (name && !/\.(png|jpe?g|webp)$/i.test(name)) return null;
        if (!entry.size) return null;
        let bytes = new Uint8Array(buffer, entry.start, entry.size);
        if (entry.method === 8) {
            let decompressor;
            try { decompressor = new DecompressionStream('deflate-raw'); }
            catch { fail('image-zip-deflate-unavailable', '当前浏览器不支持 ZIP deflate 解压'); }
            const reader = new Blob([bytes]).stream().pipeThrough(decompressor).getReader();
            const chunks = []; let size = 0;
            try {
                while (true) {
                    const item = await reader.read();
                    if (item.done) break;
                    size += item.value.length;
                    if (size > entry.unpacked) {
                        await reader.cancel();
                        truncated();
                    }
                    chunks.push(item.value);
                }
            } catch (error) {
                if (error?.reason === 'image-zip-truncated') throw error;
                fail('image-zip-deflate-failed', 'ZIP deflate 数据损坏或不完整');
            } finally { reader.releaseLock(); }
            if (size !== entry.unpacked) truncated();
            bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        } else if (entry.method !== 0) {
            fail('image-zip-method-unsupported', 'ZIP 压缩方式不受支持');
        } else if (bytes.length !== entry.unpacked) truncated();
        const extension = (name.match(/\.(png|jpe?g|webp)$/i) || [])[1] || 'png';
        const type = extension.toLowerCase().startsWith('jp') ? 'image/jpeg' : `image/${extension.toLowerCase()}`;
        return new Blob([bytes], { type });
    };
    if (entries) {
        for (const central of entries) {
            const image = await decode(localEntry(view, central.offset, central));
            if (image) return image;
        }
    } else {
        let offset = 0;
        while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === 0x04034b50) {
            const entry = localEntry(view, offset);
            const image = await decode(entry);
            if (image) return image;
            offset = entry.start + entry.size;
        }
    }
    fail('image-zip-no-images', 'ZIP 响应中没有图片');
}
