// cyrb53 截断为 32 位；同一文本与种子永远得到同一整数。
export function hashString(text, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    const source = String(text ?? '');
    for (let i = 0; i < source.length; i++) {
        const ch = source.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
}

export function createRandom(seed) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        seed: seed >>> 0,
        next,
        range: (min, max) => min + next() * (max - min),
        int: (min, max) => Math.floor(min + next() * (max - min + 1)),
        chance: p => next() < p,
        pick: list => list[Math.floor(next() * list.length)],
        // 子流只依赖父种子与标签，调整某个子系统的取数次数不会牵动其他子系统。
        fork: label => createRandom(hashString(label, seed >>> 0)),
    };
}

const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function createNoise2D(seed) {
    const random = createRandom(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(random.next() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const corner = (x, y, g) => {
        let t = 0.5 - x * x - y * y;
        if (t < 0) return 0;
        t *= t;
        const grad = GRAD[g & 7];
        return t * t * (grad[0] * x + grad[1] * y);
    };
    const noise = (xin, yin) => {
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - (i - t);
        const y0 = yin - (j - t);
        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;
        const ii = i & 255;
        const jj = j & 255;
        return 70 * (corner(x0, y0, perm[ii + perm[jj]])
            + corner(x0 - i1 + G2, y0 - j1 + G2, perm[ii + i1 + perm[jj + j1]])
            + corner(x0 - 1 + 2 * G2, y0 - 1 + 2 * G2, perm[ii + 1 + perm[jj + 1]]));
    };
    noise.fbm = (x, y, octaves = 3) => {
        let sum = 0;
        let amp = 1;
        let freq = 1;
        let norm = 0;
        for (let o = 0; o < octaves; o++) {
            sum += amp * noise(x * freq, y * freq);
            norm += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return sum / norm;
    };
    return noise;
}
