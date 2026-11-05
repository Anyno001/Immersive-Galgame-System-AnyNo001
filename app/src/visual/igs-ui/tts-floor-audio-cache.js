const MAX_BYTES = 32 * 1024 * 1024;
let current = null;

export function beginTtsFloorAudioCache(identity = '') {
    if (identity && current?.identity === identity) return current;
    current = { identity, entries: new Map(), bytes: 0 };
    return current;
}

export function clearTtsFloorAudioCache(cache = current) {
    if (cache === current) current = null;
}

export function getTtsFloorAudio(key) {
    return current?.entries.get(key) || null;
}

export function forgetTtsFloorAudio(key) {
    const entry = current?.entries.get(key);
    if (entry) { current.entries.delete(key); current.bytes -= entry.bytes.byteLength; }
}

export function rememberTtsFloorAudio(cache, key, bytes, rate) {
    if (!cache || cache !== current || bytes.byteLength > MAX_BYTES) return;
    const previous = cache.entries.get(key);
    cache.bytes += bytes.byteLength - (previous?.bytes.byteLength || 0);
    cache.entries.delete(key);
    cache.entries.set(key, { bytes: bytes.slice(0), rate });
    // 当前楼的压缩音频单独保留，避免预生成后半楼挤掉前半楼；解码后的 PCM 不进这里。
    while (cache.bytes > MAX_BYTES) {
        const [oldKey, old] = cache.entries.entries().next().value;
        cache.entries.delete(oldKey);
        cache.bytes -= old.bytes.byteLength;
    }
}
