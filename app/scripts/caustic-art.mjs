// 开发工具：生成 src/styles/ui-caustic-art.js（不进 bundle）。用法：node scripts/caustic-art.mjs
// 水底焦散：域扭曲后的 Voronoi 细胞边缘 = 光网；大网主纹 + 小网副纹，线宽随噪声粗细交错，
// 低频遮罩让部分区域自然暗下去，再加柔光晕与少量闪点。整张图按周期生成，可无缝平铺。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 640;

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function periodicNoise(cells, seed) {
    const random = rng(seed);
    const lattice = Array.from({ length: cells * cells }, () => random());
    const at = (i, j) => lattice[((j % cells) + cells) % cells * cells + ((i % cells) + cells) % cells];
    const fade = t => t * t * (3 - 2 * t);
    return (x, y) => {
        const fx = x / SIZE * cells;
        const fy = y / SIZE * cells;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        const u = fade(fx - i);
        const v = fade(fy - j);
        const top = at(i, j) + u * (at(i + 1, j) - at(i, j));
        const bottom = at(i, j + 1) + u * (at(i + 1, j + 1) - at(i, j + 1));
        return top + v * (bottom - top);
    };
}

function periodicWorley(cells, seed) {
    const random = rng(seed);
    const size = SIZE / cells;
    const points = Array.from({ length: cells * cells }, () => [0.15 + random() * 0.7, 0.15 + random() * 0.7]);
    return (x, y) => {
        const ci = Math.floor(x / size);
        const cj = Math.floor(y / size);
        let f1 = Infinity;
        let f2 = Infinity;
        for (let dj = -2; dj <= 2; dj++) {
            for (let di = -2; di <= 2; di++) {
                const i = ci + di;
                const j = cj + dj;
                const p = points[((j % cells) + cells) % cells * cells + ((i % cells) + cells) % cells];
                const d = Math.hypot((i + p[0]) * size - x, (j + p[1]) * size - y);
                if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
            }
        }
        return f2 - f1;
    };
}

function caustic() {
    const warpX = periodicNoise(4, 11);
    const warpY = periodicNoise(4, 12);
    const fineWarpX = periodicNoise(10, 13);
    const fineWarpY = periodicNoise(10, 14);
    const main = periodicWorley(5, 21);
    const fine = periodicWorley(11, 22);
    const widthNoise = periodicNoise(8, 31);
    const mask = periodicNoise(3, 41);
    const alpha = new Float32Array(SIZE * SIZE);
    const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const wx = x + (warpX(x, y) - 0.5) * 70 + (fineWarpX(x, y) - 0.5) * 16;
            const wy = y + (warpY(x, y) - 0.5) * 70 + (fineWarpY(x, y) - 0.5) * 16;
            const sx = ((wx % SIZE) + SIZE) % SIZE;
            const sy = ((wy % SIZE) + SIZE) % SIZE;
            const w = 0.7 + 4.6 * Math.pow(widthNoise(x, y), 2.2);
            const edge = main(sx, sy);
            const line = Math.pow(Math.max(0, 1 - edge / w), 1.6);
            const glow = Math.exp(-edge / (w * 3.2)) * 0.22;
            const fineEdge = fine(sx, sy);
            const fineLine = Math.pow(Math.max(0, 1 - fineEdge / (0.5 + w * 0.3)), 1.4) * 0.42;
            const presence = 0.3 + 0.7 * smoothstep(0.28, 0.72, mask(x, y));
            alpha[y * SIZE + x] = Math.min(1, (line + glow + fineLine) * presence);
        }
    }
    const random = rng(51);
    for (let n = 0; n < 90; n++) {
        const cx = random() * SIZE;
        const cy = random() * SIZE;
        if (alpha[Math.floor(cy) * SIZE + Math.floor(cx)] < 0.35) continue;
        const r = 0.8 + random() * 2.2;
        for (let dy = -8; dy <= 8; dy++) {
            for (let dx = -8; dx <= 8; dx++) {
                const x = ((Math.floor(cx) + dx) % SIZE + SIZE) % SIZE;
                const y = ((Math.floor(cy) + dy) % SIZE + SIZE) % SIZE;
                const d = Math.hypot(dx, dy);
                const k = y * SIZE + x;
                alpha[k] = Math.min(1, alpha[k] + Math.exp(-((d / r) ** 2)) * 0.9 + Math.exp(-d / (r * 2.5)) * 0.12);
            }
        }
    }
    return alpha;
}

function png(alpha) {
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(data.length, 0);
        head.write(type, 4, 'ascii');
        const tail = Buffer.alloc(4);
        tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
        return Buffer.concat([head, data, tail]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;
    ihdr[9] = 4;
    const raw = Buffer.alloc(SIZE * (SIZE * 2 + 1));
    for (let y = 0; y < SIZE; y++) {
        raw[y * (SIZE * 2 + 1)] = 0;
        for (let x = 0; x < SIZE; x++) {
            const o = y * (SIZE * 2 + 1) + 1 + x * 2;
            raw[o] = 255;
            raw[o + 1] = Math.round(alpha[y * SIZE + x] * 63) * 4;
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const image = png(caustic());
const out = path.resolve(import.meta.dirname, '..', 'src', 'styles', 'ui-caustic-art.js');
fs.writeFileSync(out, `// 由 scripts/caustic-art.mjs 生成，勿手改；调参数改脚本后重新生成。\nexport const IGS_CAUSTIC_TILE_SIZE = ${SIZE};\nexport const IGS_CAUSTIC_ART = 'url("data:image/png;base64,${image.toString('base64')}")';\n`);
if (process.argv.includes('--png')) fs.writeFileSync(path.resolve(import.meta.dirname, '..', '.tmp', 'restyle', 'caustic.png'), image);
console.log('caustic art written', `${(image.length / 1024).toFixed(1)}KB png`);
