// 开发工具：生成 src/styles/assets/caustic-art.png 与 src/styles/ui-caustic-art.js（不进 bundle）。用法：node scripts/caustic-art.mjs
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

// 经典水底焦散迭代：多次正余弦干涉叠加，亮处收窄成有机光网；分子用常数代替坐标，保证严格可平铺。
function causticLayer(periods, time, seed, ridgeRadius, ridgeGain) {
    const TAU = Math.PI * 2;
    const offset = -250 + seed;
    const out = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const px = (x / SIZE) * TAU * periods + offset;
            const py = (y / SIZE) * TAU * periods + offset;
            let ix = px;
            let iy = py;
            let c = 1;
            const inten = 0.005;
            for (let n = 0; n < 5; n++) {
                const t = time * (1 - 3.5 / (n + 1));
                const nx = px + Math.cos(t - ix) + Math.sin(t + iy);
                const ny = py + Math.sin(t - iy) + Math.cos(t + ix);
                ix = nx;
                iy = ny;
                c += 1 / Math.hypot(offset / (Math.sin(ix + t) / inten), offset / (Math.cos(iy + t) / inten));
            }
            c /= 5;
            c = 1.17 - Math.pow(c, 1.4);
            out[y * SIZE + x] = Math.min(1, Math.pow(Math.abs(c), 8));
        }
    }
    return ridge(out, ridgeRadius, ridgeGain);
}

function blur(src, radius) {
    const tmp = new Float32Array(SIZE * SIZE);
    const out = new Float32Array(SIZE * SIZE);
    const span = radius * 2 + 1;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let sum = 0;
            for (let d = -radius; d <= radius; d++) sum += src[y * SIZE + ((x + d + SIZE) % SIZE)];
            tmp[y * SIZE + x] = sum / span;
        }
    }
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let sum = 0;
            for (let d = -radius; d <= radius; d++) sum += tmp[((y + d + SIZE) % SIZE) * SIZE + x];
            out[y * SIZE + x] = sum / span;
        }
    }
    return out;
}

// 高通取脊：场减去自身模糊只剩细亮线；再乘原亮度，亮处线粗、暗处线细且淡。
function ridge(field, radius, gain) {
    const soft = blur(blur(field, radius), radius);
    return field.map((v, k) => Math.min(1, Math.max(0, v - soft[k]) * gain * (0.35 + v)));
}

function caustic() {
    const broad = causticLayer(1, 1.7, 0, 5, 4.2);
    const fine = causticLayer(2, 4.1, 3, 3, 3.2);
    const mask = periodicNoise(3, 41);
    const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const alpha = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const k = y * SIZE + x;
            const presence = 0.25 + 0.75 * smoothstep(0.25, 0.7, mask(x, y));
            alpha[k] = Math.min(1, (broad[k] + fine[k] * 0.5) * presence);
        }
    }
    const halo = blur(blur(alpha, 5), 5);
    for (let k = 0; k < alpha.length; k++) alpha[k] = Math.min(1, alpha[k] * 1.25 + halo[k] * 0.9);
    const random = rng(51);
    for (let n = 0; n < 70; n++) {
        const cx = Math.floor(random() * SIZE);
        const cy = Math.floor(random() * SIZE);
        if (alpha[cy * SIZE + cx] < 0.4) continue;
        const r = 0.7 + random() * 1.8;
        for (let dy = -7; dy <= 7; dy++) {
            for (let dx = -7; dx <= 7; dx++) {
                const k = ((cy + dy + SIZE) % SIZE) * SIZE + ((cx + dx + SIZE) % SIZE);
                const d = Math.hypot(dx, dy);
                alpha[k] = Math.min(1, alpha[k] + Math.exp(-((d / r) ** 2)) * 0.85 + Math.exp(-d / (r * 2.5)) * 0.1);
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
const stylesDir = path.resolve(import.meta.dirname, '..', 'src', 'styles');
fs.mkdirSync(path.join(stylesDir, 'assets'), { recursive: true });
fs.writeFileSync(path.join(stylesDir, 'assets', 'caustic-art.png'), image);
const artExpression = "`url(\"${new URL('./assets/caustic-art.png', import.meta.url).href}\")`";
fs.writeFileSync(path.join(stylesDir, 'ui-caustic-art.js'), `// 由 scripts/caustic-art.mjs 生成，勿手改；调参数改脚本后重新生成。纹理在 assets/caustic-art.png，构建时外置到 dist/ui/。\nexport const IGS_CAUSTIC_TILE_SIZE = ${SIZE};\nexport const IGS_CAUSTIC_ART = ${artExpression};\n`);
if (process.argv.includes('--png')) fs.writeFileSync(path.resolve(import.meta.dirname, '..', '.tmp', 'restyle', 'caustic.png'), image);
console.log('caustic art written', `${(image.length / 1024).toFixed(1)}KB png`);
