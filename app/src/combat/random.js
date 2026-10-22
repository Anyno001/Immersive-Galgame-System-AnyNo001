export function hash32(input) {
    const text = String(input ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function hashString(input) {
    return hash32(input).toString(36);
}

export function nextRandom(state) {
    const next = (state + 0x6d2b79f5) >>> 0;
    let r = Math.imul(next ^ (next >>> 15), next | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, state: next };
}

export function randomInt(state, maxExclusive) {
    const { value, state: next } = nextRandom(state);
    return { value: Math.floor(value * Math.max(1, maxExclusive)), state: next };
}
