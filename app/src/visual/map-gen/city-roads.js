import { dist, nearestOnPolyline, polylineAngle } from './geometry.js';

// 道路网：张量场 + 流线追踪。
// 场由“种子决定的整体朝向（缓慢旋转）”与“沿河岸 / 海岸 / 湖岸的切向”加权合成；
// 主干道与街道都是这张场的流线（主方向族 0、垂直族 1），所以全城街道朝向连续、交叉近似直角，
// 不会出现各街区各转各的小网格与断头短路。场只依赖种子与水系，不依赖地点：新增地点不牵动远处路网。

const FIELD_STEP = 20;

export function createTensorField(W, H, rng, noise, scene) {
    const cols = Math.ceil(W / FIELD_STEP) + 3;
    const rows = Math.ceil(H / FIELD_STEP) + 3;
    const ta = new Float32Array(cols * rows);
    const tb = new Float32Array(cols * rows);
    const base = rng.range(-0.4, 0.4);
    const swirl = rng.range(0.55, 1.05);
    const off = rng.range(0, 100);
    const radial = rng.chance(0.35) ? { x: W * rng.range(0.3, 0.7), y: H * rng.range(0.3, 0.7), r: rng.range(170, 280) } : null;
    const shores = [...scene.rivers.map(river => river.points), ...(scene.sea ? [scene.sea.coast] : [])];
    const scale = Math.min(W, H) / 900;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = (c - 1) * FIELD_STEP;
            const y = (r - 1) * FIELD_STEP;
            const theta = base + noise.fbm(x * 0.0008 + off, y * 0.0008 - off, 2) * swirl;
            let a = Math.cos(2 * theta);
            let b = Math.sin(2 * theta);
            for (const points of shores) {
                const near = nearestOnPolyline(x, y, points);
                if (near.distance > 340 * scale) continue;
                const w = 2.6 * Math.exp(-((near.distance / (135 * scale)) ** 2));
                const t = polylineAngle(points, near.index);
                a += w * Math.cos(2 * t);
                b += w * Math.sin(2 * t);
            }
            for (const lake of [...scene.lakes, ...(scene.ponds || [])]) {
                const d = Math.max(0, dist(x, y, lake.x, lake.y) - (lake.r || 50));
                const w = 1.8 * Math.exp(-((d / (90 * scale)) ** 2));
                const t = Math.atan2(y - lake.y, x - lake.x) + Math.PI / 2;
                a += w * Math.cos(2 * t);
                b += w * Math.sin(2 * t);
            }
            if (radial) {
                const w = 1.5 * Math.exp(-((dist(x, y, radial.x, radial.y) / radial.r) ** 2));
                const t = Math.atan2(y - radial.y, x - radial.x);
                a += w * Math.cos(2 * t);
                b += w * Math.sin(2 * t);
            }
            ta[r * cols + c] = a;
            tb[r * cols + c] = b;
        }
    }
    const sample = (x, y) => {
        const fx = Math.min(cols - 1.001, Math.max(0, x / FIELD_STEP + 1));
        const fy = Math.min(rows - 1.001, Math.max(0, y / FIELD_STEP + 1));
        const c = Math.floor(fx);
        const r = Math.floor(fy);
        const u = fx - c;
        const v = fy - r;
        const i = r * cols + c;
        const lerp2 = arr => (arr[i] * (1 - u) + arr[i + 1] * u) * (1 - v) + (arr[i + cols] * (1 - u) + arr[i + cols + 1] * u) * v;
        return 0.5 * Math.atan2(lerp2(tb), lerp2(ta));
    };
    return {
        angle: sample,
        dir(x, y, family) {
            const t = sample(x, y) + (family ? Math.PI / 2 : 0);
            return [Math.cos(t), Math.sin(t)];
        },
    };
}

// 点哈希：按格存线上采样点，用于“同族流线保持间距”与“断头就近接入”。
export function createPointHash(W, H, size = 16) {
    const pad = 64;
    const cols = Math.ceil((W + pad * 2) / size);
    const rows = Math.ceil((H + pad * 2) / size);
    const cells = new Array(cols * rows);
    const key = (x, y) => {
        const c = Math.floor((x + pad) / size);
        const r = Math.floor((y + pad) / size);
        return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
    };
    return {
        add(x, y, line, family, extra = 0) {
            const k = key(x, y);
            if (k < 0) return;
            (cells[k] ||= []).push(x, y, line, family, extra);
        },
        // visit(x, y, line, family, extra, d) 返回 true 时提前结束。
        each(x, y, radius, visit) {
            const c0 = Math.floor((x - radius + pad) / size);
            const c1 = Math.floor((x + radius + pad) / size);
            const r0 = Math.floor((y - radius + pad) / size);
            const r1 = Math.floor((y + radius + pad) / size);
            for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
                for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
                    const list = cells[r * cols + c];
                    if (!list) continue;
                    for (let i = 0; i < list.length; i += 5) {
                        const d = Math.hypot(list[i] - x, list[i + 1] - y);
                        if (d <= radius && visit(list[i], list[i + 1], list[i + 2], list[i + 3], list[i + 4], d)) return;
                    }
                }
            }
        },
        near(x, y, radius, family) {
            let hit = false;
            this.each(x, y, radius, (px, py, line, fam) => (hit = fam === family));
            return hit;
        },
    };
}

const aligned = (d, px, py) => (d[0] * px + d[1] * py < 0 ? [-d[0], -d[1]] : d);

// 追踪一层流线。options:
//   field, W, H, step, maxSteps, minLength, dsep(x,y), testRatio,
//   blocked(x,y) → 'water'（可架桥的河）| 'still'（湖海）| 'wild' | '' ；bridgeMax（可跨越的水面长度，0 表示不架桥），
//   hash（本层）、avoid（上层哈希，同族也要让开）、candidates（候选种子，已按种子顺序排好）、queue（优先种子）。
export function traceLevel(options) {
    const { field, W, H, step, maxSteps, minLength, dsep, testRatio, blocked, bridgeMax = 0, hash, avoid = [], idBase = 0 } = options;
    const lines = [];
    const collides = (x, y, family, radius) => hash.near(x, y, radius, family) || avoid.some(h => h.near(x, y, radius, family));
    const inside = (x, y) => x >= 0 && y >= 0 && x <= W && y <= H;

    function integrate(x0, y0, family, sign) {
        const pts = [];
        let [dx, dy] = field.dir(x0, y0, family);
        dx *= sign; dy *= sign;
        let x = x0;
        let y = y0;
        let bridges = 0;
        let stop = 'max';
        for (let k = 0; k < maxSteps; k++) {
            const a = aligned(field.dir(x, y, family), dx, dy);
            const b = aligned(field.dir(x + a[0] * step * 0.5, y + a[1] * step * 0.5, family), a[0], a[1]);
            if (b[0] * dx + b[1] * dy < 0.82) { stop = 'turn'; break; }
            const nx = x + b[0] * step;
            const ny = y + b[1] * step;
            if (nx < -step * 3 || ny < -step * 3 || nx > W + step * 3 || ny > H + step * 3) { pts.push([nx, ny]); stop = 'edge'; break; }
            const block = blocked(nx, ny);
            if (block) {
                if (block !== 'water' || !bridgeMax || bridges >= 2) { stop = block; break; }
                // 架桥：沿当前方向直穿水面，对岸落地后继续追踪。
                let L = step;
                while (L <= bridgeMax && inside(x + b[0] * L, y + b[1] * L) && blocked(x + b[0] * L, y + b[1] * L) === 'water') L += 4;
                if (L > bridgeMax || !inside(x + b[0] * L, y + b[1] * L) || blocked(x + b[0] * L, y + b[1] * L)) { stop = 'water'; break; }
                L += 10;
                for (let t = step; t <= L; t += step) pts.push([x + b[0] * t, y + b[1] * t]);
                x += b[0] * L; y += b[1] * L;
                dx = b[0]; dy = b[1];
                bridges++;
                continue;
            }
            if (collides(nx, ny, family, dsep(nx, ny) * testRatio)) { stop = 'hit'; break; }
            pts.push([nx, ny]);
            x = nx; y = ny;
            dx = b[0]; dy = b[1];
        }
        return { pts, stop };
    }

    function tryLine(x, y, family) {
        if (!inside(x, y) || blocked(x, y)) return;
        if (collides(x, y, family, dsep(x, y) * 0.92)) return;
        const back = integrate(x, y, family, -1);
        const fwd = integrate(x, y, family, 1);
        const points = [...back.pts.reverse(), [x, y], ...fwd.pts];
        if ((points.length - 1) * step < minLength) return;
        const id = idBase + lines.length;
        const rounded = points.map(([px, py]) => [Math.round(px * 10) / 10, Math.round(py * 10) / 10]);
        lines.push({ id, family, points: rounded, stops: [back.stop, fwd.stop] });
        for (const [px, py] of rounded) hash.add(px, py, id, family);
        const every = Math.max(2, Math.round(dsep(x, y) * 0.9 / step));
        for (let i = every; i < rounded.length - 1; i += every) queue.push([rounded[i][0], rounded[i][1], 1 - family]);
    }

    const queue = [...(options.queue || [])];
    let qi = 0;
    let ci = 0;
    const candidates = options.candidates || [];
    while (qi < queue.length || ci < candidates.length) {
        if (qi < queue.length) {
            const [x, y, family] = queue[qi++];
            tryLine(x, y, family);
        } else {
            const [x, y] = candidates[ci];
            tryLine(x, y, ci % 2);
            ci++;
        }
    }
    return lines;
}

// 断头路就近接入：端点前方锥形范围内有别的路，就补一段直线接上，形成 T 字路口。
export function joinDeadEnds(lines, hashes, options) {
    const { radius, step, blocked } = options;
    for (const line of lines) {
        for (const end of [0, 1]) {
            if (line.stops[end] !== 'hit' && line.stops[end] !== 'turn' && line.stops[end] !== 'max') continue;
            const pts = line.points;
            if (pts.length < 3) continue;
            const tip = end ? pts[pts.length - 1] : pts[0];
            const prev = end ? pts[pts.length - 3] : pts[2];
            const len = dist(tip[0], tip[1], prev[0], prev[1]) || 1;
            const dx = (tip[0] - prev[0]) / len;
            const dy = (tip[1] - prev[1]) / len;
            let best = null;
            for (const h of hashes) {
                h.each(tip[0], tip[1], radius, (px, py, id, family, extra, d) => {
                    if (id === line.id || d < 1) return false;
                    if (((px - tip[0]) * dx + (py - tip[1]) * dy) / d < 0.62) return false;
                    if (!best || d < best.d) best = { x: px, y: py, d };
                    return false;
                });
            }
            if (!best) continue;
            const n = Math.max(1, Math.round(best.d / step));
            const add = [];
            let ok = true;
            for (let k = 1; k <= n; k++) {
                const x = tip[0] + (best.x - tip[0]) * k / n;
                const y = tip[1] + (best.y - tip[1]) * k / n;
                if (blocked(x, y)) { ok = false; break; }
                add.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
            }
            if (!ok) continue;
            if (end) pts.push(...add);
            else pts.unshift(...add.reverse());
            line.stops[end] = 'joined';
        }
    }
}

// 候选种子：抖动网格，只依赖随机种子；再按种子洗牌，决定路网从哪里开始生长。
export function seedCandidates(W, H, spacing, rng) {
    const list = [];
    for (let gy = 0; gy * spacing < H; gy++) {
        for (let gx = 0; gx * spacing < W; gx++) {
            const local = rng.fork(`seed:${gx}:${gy}`);
            list.push([(gx + local.range(0.2, 0.8)) * spacing, (gy + local.range(0.2, 0.8)) * spacing, local.next()]);
        }
    }
    const cx = W * rng.range(0.4, 0.6);
    const cy = H * rng.range(0.4, 0.6);
    // 从城中心向外生长，边角的零碎流线最后才补。
    list.sort((a, b) => (dist(a[0], a[1], cx, cy) * (0.75 + a[2] * 0.5)) - (dist(b[0], b[1], cx, cy) * (0.75 + b[2] * 0.5)));
    return list.map(([x, y]) => [x, y]);
}
