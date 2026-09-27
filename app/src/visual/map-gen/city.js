import { createRandom, createNoise2D } from './seed-random.js';
import { classifyMapPlace, MAP_WATER_CATEGORIES } from './place-semantics.js';
import { dist, nearestOnPolyline, smoothPath, pointInPolygon, polylineAngle } from './geometry.js';

export const MAP_GEN_CELL = 8;
const F_WATER = 1;
const F_ROAD = 2;
const F_CLEAR = 4;
const F_BUILT = 8;
const F_PATH = 16;
const F_RAIL = 32;
const F_OUT = 128;
const BLOCKED = F_WATER | F_ROAD | F_CLEAR | F_RAIL;
const MAIN_WIDTH = 16;
const EXTRA_WIDTH = 12;
const STREET_WIDTH = 7;

const LANDMARK_CLEARANCE = Object.freeze({
    school: 64, park: 16, shrine: 28, station: 40, tower: 38, castle: 72, hospital: 38,
    public: 40, commercial: 34, residential: 26, generic: 28, sea: 18, river: 18, lake: 0,
});
const DENSE_CATEGORIES = Object.freeze(['commercial', 'station', 'public', 'hospital', 'tower', 'castle']);
const PARK_CATEGORIES = Object.freeze(['park', 'shrine']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 城市尺度几何：先定指针（锚点），再让水系、道路、街区与建筑绕开锚点生长。
// 输出为纯数据，不含函数与 DOM，渲染器与光照层都只读它。
export function generateCityScene(input) {
    const steps = generateCitySteps(input);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
}

function* generateCitySteps(input) {
    const W = input.width;
    const H = input.height;
    const root = createRandom(input.seed);
    const noise = createNoise2D(root.fork('noise').seed);
    const anchors = (input.points || []).map((point, index) => ({
        id: String(point.id ?? index),
        name: String(point.name ?? ''),
        x: clamp(Number(point.x) || 0, 0, 1) * W,
        y: clamp(Number(point.y) || 0, 0, 1) * H,
        category: point.category || classifyMapPlace(point.name, point.description),
    }));
    const grid = createGrid(W, H);
    const scene = {
        width: W, height: H, theme: input.theme || 'modern', cell: MAP_GEN_CELL,
        sea: null, rivers: [], lakes: [], mainRoads: [], streets: [], rails: [], bridges: [],
        lawn: [], paths: [], plazas: [], pads: [], buildings: [], trees: [], landmarks: [], lights: [],
    };
    const land = anchors.filter(a => !MAP_WATER_CATEGORIES.includes(a.category));

    planWater(scene, anchors, land, root.fork('water'), noise, W, H);
    yield 'water';
    rasterizeWater(scene, grid);
    yield 'water-grid';
    for (const a of anchors) a.wet = Boolean(flagAt(grid, a.x, a.y) & F_WATER);

    planRails(scene, anchors, grid, root.fork('rail'), W, H);
    planMainRoads(scene, anchors, grid, root.fork('roads'), W, H);
    planLandmarks(scene, anchors, grid, root.fork('landmarks'));
    yield 'roads';
    const districts = planDistricts(anchors, grid, root.fork('districts'), noise, scene, W, H);
    yield 'districts';
    planStreetsAndBuildings(scene, districts, grid, root);
    yield 'blocks';
    planParks(scene, districts, grid, root, noise);
    planStreetTrees(scene, grid, root.fork('street-trees'));
    planLights(scene, root.fork('lights'));
    return scene;
}

function createGrid(W, H) {
    const cols = Math.ceil(W / MAP_GEN_CELL);
    const rows = Math.ceil(H / MAP_GEN_CELL);
    return { cols, rows, flags: new Uint8Array(cols * rows), district: new Int16Array(cols * rows).fill(-1) };
}

function cellIndex(grid, x, y) {
    const c = Math.floor(x / MAP_GEN_CELL);
    const r = Math.floor(y / MAP_GEN_CELL);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
    return r * grid.cols + c;
}

function flagAt(grid, x, y) {
    const index = cellIndex(grid, x, y);
    return index < 0 ? F_OUT : grid.flags[index];
}

function districtAt(grid, x, y) {
    const index = cellIndex(grid, x, y);
    return index < 0 ? -1 : grid.district[index];
}

function stamp(grid, x, y, radius, flag) {
    const half = MAP_GEN_CELL / 2;
    const c0 = Math.max(0, Math.floor((x - radius) / MAP_GEN_CELL));
    const c1 = Math.min(grid.cols - 1, Math.floor((x + radius) / MAP_GEN_CELL));
    const r0 = Math.max(0, Math.floor((y - radius) / MAP_GEN_CELL));
    const r1 = Math.min(grid.rows - 1, Math.floor((y + radius) / MAP_GEN_CELL));
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            if (dist(c * MAP_GEN_CELL + half, r * MAP_GEN_CELL + half, x, y) <= radius + half * 0.5) grid.flags[r * grid.cols + c] |= flag;
        }
    }
}

function stampPath(grid, points, radius, flag) {
    for (const [x, y] of points) stamp(grid, x, y, radius, flag);
}

// ---------- 水系 ----------

function planWater(scene, anchors, land, rng, noise, W, H) {
    const seaAnchors = anchors.filter(a => a.category === 'sea');
    const riverAnchors = anchors.filter(a => a.category === 'river');
    if (seaAnchors.length) scene.sea = planSea(seaAnchors, land, rng.fork('sea'), noise, W, H);
    const wantRiver = riverAnchors.length > 0 || (scene.sea ? rng.chance(0.3) : rng.chance(0.72));
    if (wantRiver) {
        const river = planRiver(riverAnchors, land, rng.fork('river'), noise, W, H, scene.sea?.side);
        if (river) scene.rivers.push(river);
    }
    for (const lake of anchors.filter(a => a.category === 'lake')) scene.lakes.push(planLake(lake, anchors, rng.fork(`lake:${lake.id}`), noise));
}

const SIDES = Object.freeze(['top', 'bottom', 'left', 'right']);
const BEACH_WORDS = /沙滩|海滩|海边|海岸|浜/;
const depthFromSide = (side, x, y, W, H) => side === 'top' ? y : side === 'bottom' ? H - y : side === 'left' ? x : W - x;

function planSea(seaAnchors, land, rng, noise, W, H) {
    const side = SIDES.map(s => ({ s, d: seaAnchors.reduce((sum, a) => sum + depthFromSide(s, a.x, a.y, W, H), 0) / seaAnchors.length }))
        .sort((a, b) => a.d - b.d)[0].s;
    const span = side === 'top' || side === 'bottom' ? H : W;
    const along = side === 'top' || side === 'bottom' ? W : H;
    // 沙滩、码头类地点落在岸上，泛称“海”的地点落在水面。
    const shoreline = a => depthFromSide(side, a.x, a.y, W, H) + (BEACH_WORDS.test(a.name) || /港|码头|灯塔/.test(a.name) ? -20 : 8);
    const seaDepth = seaAnchors.reduce((sum, a) => sum + shoreline(a), 0) / seaAnchors.length;
    const landDepth = land.length ? Math.min(...land.map(a => depthFromSide(side, a.x, a.y, W, H))) - 50 : Infinity;
    const shore = clamp(Math.min(seaDepth, landDepth), span * 0.1, span * 0.45);
    const amp = rng.range(14, 30);
    const offset = rng.range(0, 100);
    const coast = [];
    for (let t = -40; t <= along + 40; t += 16) {
        const depth = shore + noise.fbm(t * 0.004 + offset, 3.7) * amp;
        coast.push(side === 'top' ? [t, depth] : side === 'bottom' ? [t, H - depth] : side === 'left' ? [depth, t] : [W - depth, t]);
    }
    const far = { top: [[along + 40, -40], [-40, -40]], bottom: [[along + 40, H + 40], [-40, H + 40]],
        left: [[-40, along + 40], [-40, -40]], right: [[W + 40, along + 40], [W + 40, -40]] }[side];
    const beach = seaAnchors.some(a => BEACH_WORDS.test(a.name));
    return { side, coast, polygon: [...coast, ...far], beach };
}

function planRiver(riverAnchors, land, rng, noise, W, H, seaSide) {
    const scale = Math.min(W, H) / 900;
    let best = null;
    for (let c = 0; c < 28; c++) {
        // 有海时河道垂直于海岸、流入大海，而不是与海岸平行。
        const horizontal = seaSide ? seaSide === 'left' || seaSide === 'right' : rng.chance(W >= H ? 0.68 : 0.32);
        let start = horizontal ? [-60, rng.range(0.12, 0.88) * H] : [rng.range(0.12, 0.88) * W, -60];
        let end = horizontal ? [W + 60, rng.range(0.12, 0.88) * H] : [rng.range(0.12, 0.88) * W, H + 60];
        if (seaSide === 'top' || seaSide === 'left') [start, end] = [end, start];
        const control = [start];
        const through = riverAnchors.length && rng.chance(0.6) ? rng.pick(riverAnchors) : null;
        for (let k = 1; k <= 3; k++) {
            const t = k / 4;
            const bx = start[0] + (end[0] - start[0]) * t;
            const by = start[1] + (end[1] - start[1]) * t;
            const swing = rng.range(-0.2, 0.2) * (horizontal ? H : W);
            control.push(horizontal ? [bx, clamp(by + swing, 0.06 * H, 0.94 * H)] : [clamp(bx + swing, 0.06 * W, 0.94 * W), by]);
        }
        if (through) {
            const k = 1 + Math.round(clamp(horizontal ? through.x / W : through.y / H, 0, 1) * 2);
            const shift = rng.chance(0.5) ? 1 : -1;
            control[k] = horizontal ? [through.x, through.y + shift * 60 * scale] : [through.x + shift * 60 * scale, through.y];
        }
        control.push(end);
        const path = smoothPath(control, 12);
        const baseHalf = rng.range(34, 50) * scale;
        const phase = rng.range(0, 100);
        const halfs = path.map((_, i) => baseHalf * (1 + 0.28 * noise(i * 0.045 + phase, 9.1)));
        let score = rng.next() * 4;
        for (const a of land) {
            const near = nearestOnPolyline(a.x, a.y, path);
            const clearance = halfs[near.index] + 42;
            if (near.distance < clearance) score += 2000 + (clearance - near.distance) * 40;
        }
        for (const a of riverAnchors) {
            const near = nearestOnPolyline(a.x, a.y, path);
            score += Math.abs(near.distance - halfs[near.index] - 10) * 3;
        }
        if (!best || score < best.score) best = { score, path, halfs };
    }
    if (!best) return null;
    // 仍压到陆上锚点时就地收窄为溪流，而不是挪动用户指定的坐标。
    for (let i = 0; i < best.path.length; i++) {
        const [x, y] = best.path[i];
        for (const a of land) best.halfs[i] = Math.min(best.halfs[i], dist(x, y, a.x, a.y) - 34);
        best.halfs[i] = Math.max(best.halfs[i], 9);
    }
    const narrow = best.halfs.filter(h => h <= 9).length / best.halfs.length;
    if (narrow > 0.25 && !riverAnchors.length) return null;
    return { points: best.path, halfs: best.halfs.map(h => Math.round(h * 10) / 10) };
}

function planLake(anchor, anchors, rng, noise) {
    let radius = rng.range(46, 78);
    for (const other of anchors) if (other !== anchor) radius = Math.min(radius, dist(other.x, other.y, anchor.x, anchor.y) - 40);
    radius = Math.max(radius, 22);
    const phase = rng.range(0, 100);
    const polygon = [];
    for (let k = 0; k < 32; k++) {
        const angle = (k / 32) * Math.PI * 2;
        const r = radius * (1 + 0.22 * noise(Math.cos(angle) * 1.3 + phase, Math.sin(angle) * 1.3));
        polygon.push([anchor.x + Math.cos(angle) * r, anchor.y + Math.sin(angle) * r * 0.82]);
    }
    return { x: anchor.x, y: anchor.y, polygon };
}

function rasterizeWater(scene, grid) {
    const half = MAP_GEN_CELL / 2;
    for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
            const x = c * MAP_GEN_CELL + half;
            const y = r * MAP_GEN_CELL + half;
            let wet = Boolean(scene.sea && pointInPolygon(x, y, scene.sea.polygon));
            for (const river of scene.rivers) {
                if (wet) break;
                const near = nearestOnPolyline(x, y, river.points);
                wet = near.distance < river.halfs[near.index];
            }
            for (const lake of scene.lakes) if (!wet) wet = pointInPolygon(x, y, lake.polygon);
            if (wet) grid.flags[r * grid.cols + c] |= F_WATER;
        }
    }
}

// ---------- 交通 ----------

function waterFraction(grid, ax, ay, bx, by) {
    let wet = 0;
    for (let k = 1; k < 16; k++) if (flagAt(grid, ax + (bx - ax) * k / 16, ay + (by - ay) * k / 16) & F_WATER) wet++;
    return wet / 15;
}

function splitBridges(scene, points, width, grid, kind) {
    let run = null;
    for (let i = 0; i <= points.length; i++) {
        const wet = i < points.length && Boolean(flagAt(grid, points[i][0], points[i][1]) & F_WATER);
        if (wet && run === null) run = i;
        if (!wet && run !== null) {
            const from = Math.max(0, run - 1);
            const to = Math.min(points.length - 1, i);
            scene.bridges.push({ points: points.slice(from, to + 1), width, kind });
            run = null;
        }
    }
}

function planRails(scene, anchors, grid, rng, W, H) {
    const station = anchors.find(a => a.category === 'station' && !a.wet);
    if (!station) return;
    let best = null;
    for (let k = 0; k < 12; k++) {
        const angle = (k / 12) * Math.PI + rng.range(-0.05, 0.05);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const reach = Math.hypot(W, H);
        const points = [];
        for (let t = -reach; t <= reach; t += 10) {
            const x = station.x + dx * t;
            const y = station.y + dy * t;
            if (x >= -30 && x <= W + 30 && y >= -30 && y <= H + 30) points.push([x, y]);
        }
        let score = Math.abs(Math.sin(angle)) * 30 + rng.next() * 5;
        for (const a of anchors) if (a !== station && nearestOnPolyline(a.x, a.y, points).distance < 44) score += 400;
        for (const [x, y] of points) if (flagAt(grid, x, y) & F_WATER) score += 3;
        if (!best || score < best.score) best = { score, points, angle };
    }
    scene.rails.push({ points: best.points, angle: best.angle });
    splitBridges(scene, best.points, 12, grid, 'rail');
    stampPath(grid, best.points, 10, F_RAIL);
}

function planMainRoads(scene, anchors, grid, rng, W, H) {
    const nodes = anchors.filter(a => !a.wet).map(a => ({ key: a.id, x: a.x, y: a.y }));
    const seaSide = scene.sea?.side;
    const sides = SIDES.filter(side => side !== seaSide);
    const exitCount = rng.int(3, 5);
    for (let k = 0; k < exitCount; k++) {
        const side = rng.pick(sides);
        const t = rng.range(0.15, 0.85);
        const point = side === 'top' ? { x: t * W, y: -30 } : side === 'bottom' ? { x: t * W, y: H + 30 }
            : side === 'left' ? { x: -30, y: t * H } : { x: W + 30, y: t * H };
        if (!(flagAt(grid, clamp(point.x, 1, W - 1), clamp(point.y, 1, H - 1)) & F_WATER)) nodes.push({ ...point, key: `exit:${k}`, exit: true });
    }
    if (nodes.filter(n => !n.exit).length === 0) nodes.push({ key: 'center', x: W * rng.range(0.4, 0.6), y: H * rng.range(0.4, 0.6) });
    const cost = (a, b) => dist(a.x, a.y, b.x, b.y) * (1 + 6 * waterFraction(grid, a.x, a.y, b.x, b.y));
    const inTree = new Set([0]);
    const edges = [];
    while (inTree.size < nodes.length) {
        let best = null;
        for (const i of inTree) {
            for (let j = 0; j < nodes.length; j++) {
                if (inTree.has(j)) continue;
                const value = cost(nodes[i], nodes[j]);
                if (!best || value < best.value) best = { i, j, value };
            }
        }
        inTree.add(best.j);
        edges.push([best.i, best.j, MAIN_WIDTH]);
    }
    const linked = new Set(edges.map(([i, j]) => `${Math.min(i, j)}:${Math.max(i, j)}`));
    for (let i = 0; i < nodes.length; i++) {
        // 每个节点、每条边各用独立子流：新增地点不会改变其他道路的走向与弯曲。
        if (nodes[i].exit || !rng.fork(`extra:${nodes[i].key}`).chance(0.45)) continue;
        let near = null;
        for (let j = 0; j < nodes.length; j++) {
            if (i === j || linked.has(`${Math.min(i, j)}:${Math.max(i, j)}`)) continue;
            const d = dist(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            if (d < 0.5 * Math.max(W, H) && (!near || d < near.d)) near = { j, d };
        }
        if (near) {
            linked.add(`${Math.min(i, near.j)}:${Math.max(i, near.j)}`);
            edges.push([i, near.j, EXTRA_WIDTH]);
        }
    }
    for (const [i, j, width] of edges) {
        const a = nodes[i];
        const b = nodes[j];
        const len = dist(a.x, a.y, b.x, b.y);
        const nx = -(b.y - a.y) / (len || 1);
        const ny = (b.x - a.x) / (len || 1);
        const bend = rng.fork(`bend:${[a.key, b.key].sort().join('|')}`).range(-0.09, 0.09) * len;
        const points = smoothPath([[a.x, a.y], [(a.x + b.x) / 2 + nx * bend, (a.y + b.y) / 2 + ny * bend], [b.x, b.y]], 8);
        scene.mainRoads.push({ points, width });
        splitBridges(scene, points, width, grid, 'road');
        stampPath(grid, points, width / 2 + 4, F_ROAD);
    }
}

// ---------- 地标 ----------

function roadAngleNear(scene, x, y, fallback) {
    let best = null;
    for (const road of [...scene.rails, ...scene.mainRoads]) {
        const near = nearestOnPolyline(x, y, road.points);
        if (near.distance < 220 && (!best || near.distance < best.distance)) best = { distance: near.distance, angle: polylineAngle(road.points, near.index) };
    }
    return best ? best.angle : fallback;
}

function planLandmarks(scene, anchors, grid, rng) {
    for (const a of anchors) {
        const local = rng.fork(`landmark:${a.id}`);
        if (a.category === 'lake' || a.wet) continue;
        const kind = a.category === 'sea' || a.category === 'river'
            ? (/港|码头|渡口/.test(a.name) ? 'pier' : 'shore') : a.category;
        const angle = kind === 'station' ? (scene.rails[0]?.angle ?? 0) : roadAngleNear(scene, a.x, a.y, local.range(0, Math.PI));
        const landmark = { kind, id: a.id, x: a.x, y: a.y, angle, variant: local.int(0, 2) };
        if (kind === 'pier') landmark.angle = pierAngle(grid, a.x, a.y);
        scene.landmarks.push(landmark);
        const clearance = LANDMARK_CLEARANCE[a.category] ?? LANDMARK_CLEARANCE.generic;
        if (clearance) stamp(grid, a.x, a.y, clearance, F_CLEAR);
    }
}

function pierAngle(grid, x, y) {
    let best = { angle: 0, wet: -1 };
    for (let k = 0; k < 16; k++) {
        const angle = (k / 16) * Math.PI * 2;
        let wet = 0;
        for (let d = 10; d <= 60; d += 10) if (flagAt(grid, x + Math.cos(angle) * d, y + Math.sin(angle) * d) & F_WATER) wet++;
        if (wet > best.wet) best = { angle, wet };
    }
    return best.angle;
}

// ---------- 街区 ----------

function planDistricts(anchors, grid, rng, noise, scene, W, H) {
    const seeds = [];
    for (const a of anchors) {
        if (a.wet) continue;
        const kind = PARK_CATEGORIES.includes(a.category) ? 'park' : DENSE_CATEGORIES.includes(a.category) ? 'dense' : 'residential';
        seeds.push({ key: `a:${a.id}`, x: a.x, y: a.y, kind, angle: roadAngleNear(scene, a.x, a.y, noise(a.x * 0.0015, a.y * 0.0015) * Math.PI * 0.5) });
    }
    // 填充种子取自只依赖随机种子的抖动网格：新增锚点只会剔除它附近的填充点，远处街区保持不变。
    const step = 190;
    for (let gy = 0; gy * step < H + step; gy++) {
        for (let gx = 0; gx * step < W + step; gx++) {
            const local = rng.fork(`filler:${gx}:${gy}`);
            const x = (gx + local.range(0.15, 0.85)) * step - step * 0.3;
            const y = (gy + local.range(0.15, 0.85)) * step - step * 0.3;
            if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
            if (flagAt(grid, clamp(x, 1, W - 1), clamp(y, 1, H - 1)) & F_WATER) continue;
            if (anchors.some(a => dist(a.x, a.y, x, y) < 120)) continue;
            const green = noise(x * 0.0022 + 17, y * 0.0022 - 4);
            const central = dist(x, y, W / 2, H / 2) < Math.min(W, H) * 0.32;
            const kind = green > 0.5 ? 'park' : central && local.chance(0.55) ? 'dense' : 'residential';
            seeds.push({ key: `f:${gx}:${gy}`, x, y, kind, angle: noise(x * 0.0015, y * 0.0015) * Math.PI * 0.5 + local.range(-0.1, 0.1) });
        }
    }
    const half = MAP_GEN_CELL / 2;
    for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
            const index = r * grid.cols + c;
            if (grid.flags[index] & F_WATER) continue;
            const x = c * MAP_GEN_CELL + half;
            const y = r * MAP_GEN_CELL + half;
            const wx = x + noise(x * 0.012, y * 0.012 + 50) * 24;
            const wy = y + noise(x * 0.012 - 50, y * 0.012) * 24;
            let best = -1;
            let bestD = Infinity;
            for (let s = 0; s < seeds.length; s++) {
                const d = (seeds[s].x - wx) ** 2 + (seeds[s].y - wy) ** 2;
                if (d < bestD) { bestD = d; best = s; }
            }
            grid.district[index] = best;
        }
    }
    return seeds.map((seed, index) => {
        const local = rng.fork(`district:${seed.key}`);
        const dense = seed.kind === 'dense';
        return {
            ...seed, index, rng: local,
            sx: dense ? local.range(66, 86) : local.range(58, 74),
            sy: dense ? local.range(46, 60) : local.range(40, 50),
            cos: Math.cos(seed.angle), sin: Math.sin(seed.angle),
        };
    });
}

function districtCells(grid, index) {
    const cells = [];
    for (let i = 0; i < grid.district.length; i++) if (grid.district[i] === index) cells.push(i);
    return cells;
}

const toWorld = (d, u, v) => [d.x + u * d.cos - v * d.sin, d.y + u * d.sin + v * d.cos];

function frameBounds(d, grid, cells) {
    const half = MAP_GEN_CELL / 2;
    let umin = Infinity; let umax = -Infinity; let vmin = Infinity; let vmax = -Infinity;
    for (const index of cells) {
        const x = (index % grid.cols) * MAP_GEN_CELL + half - d.x;
        const y = Math.floor(index / grid.cols) * MAP_GEN_CELL + half - d.y;
        const u = x * d.cos + y * d.sin;
        const v = -x * d.sin + y * d.cos;
        umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    return { umin: umin - MAP_GEN_CELL, umax: umax + MAP_GEN_CELL, vmin: vmin - MAP_GEN_CELL, vmax: vmax + MAP_GEN_CELL };
}

function streetRuns(d, grid, fixed, isU, from, to) {
    const runs = [];
    let run = [];
    for (let t = from; t <= to + 0.001; t += 6) {
        const [x, y] = isU ? toWorld(d, fixed, t) : toWorld(d, t, fixed);
        const ok = districtAt(grid, x, y) === d.index && !(flagAt(grid, x, y) & (F_WATER | F_RAIL | F_CLEAR));
        if (ok) run.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
        if (!ok || t + 6 > to + 0.001) {
            if (run.length >= 5) runs.push(run);
            run = [];
        }
    }
    return runs;
}

function lotFits(grid, d, u, v, w, h) {
    for (const [du, dv] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const [x, y] = toWorld(d, u + du * w, v + dv * h);
        if (districtAt(grid, x, y) !== d.index || (flagAt(grid, x, y) & (BLOCKED | F_OUT))) return false;
    }
    return true;
}

function addTree(scene, grid, x, y, r, tone) {
    if (flagAt(grid, x, y) & (BLOCKED | F_OUT | F_PATH)) return false;
    scene.trees.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r * 10) / 10, tone });
    const index = cellIndex(grid, x, y);
    if (index >= 0) grid.flags[index] |= F_BUILT;
    return true;
}

function planStreetsAndBuildings(scene, districts, grid, root) {
    for (const d of districts) {
        if (d.kind === 'park') continue;
        const cells = districtCells(grid, d.index);
        if (!cells.length) continue;
        const b = frameBounds(d, grid, cells);
        const rng = root.fork(`blocks:${d.key}`);
        const i0 = Math.floor(b.umin / d.sx);
        const i1 = Math.ceil(b.umax / d.sx);
        const j0 = Math.floor(b.vmin / d.sy);
        const j1 = Math.ceil(b.vmax / d.sy);
        for (let i = i0; i <= i1; i++) for (const run of streetRuns(d, grid, i * d.sx, true, b.vmin, b.vmax)) scene.streets.push({ points: run });
        for (let j = j0; j <= j1; j++) for (const run of streetRuns(d, grid, j * d.sy, false, b.umin, b.umax)) scene.streets.push({ points: run });
        const inset = STREET_WIDTH / 2 + 3;
        for (let i = i0; i < i1; i++) {
            for (let j = j0; j < j1; j++) {
                const u0 = i * d.sx + inset;
                const u1 = (i + 1) * d.sx - inset;
                const v0 = j * d.sy + inset;
                const v1 = (j + 1) * d.sy - inset;
                const bw = u1 - u0;
                const bh = v1 - v0;
                const roll = rng.next();
                if (d.kind === 'residential' && roll < 0.09) {
                    for (let k = rng.int(2, 4); k > 0; k--) {
                        const [x, y] = toWorld(d, rng.range(u0 + 6, u1 - 6), rng.range(v0 + 6, v1 - 6));
                        if (districtAt(grid, x, y) === d.index) addTree(scene, grid, x, y, rng.range(5, 8), rng.int(0, 2));
                    }
                    continue;
                }
                if (d.kind === 'dense' && roll < 0.3) {
                    const w = bw - 2;
                    const h = bh - 2;
                    const cu = (u0 + u1) / 2;
                    const cv = (v0 + v1) / 2;
                    if (lotFits(grid, d, cu, cv, w, h)) {
                        pushBuilding(scene, grid, d, cu, cv, w, h, 'flat', rng);
                        pushPad(scene, d, [[cu - w / 2, cv - h / 2, cu + w / 2, cv + h / 2]]);
                    }
                    continue;
                }
                const cols = d.kind === 'dense' ? rng.int(2, 4) : rng.int(3, 5);
                const placed = [];
                const lotW = bw / cols;
                const lotH = bh / 2;
                for (let row = 0; row < 2; row++) {
                    for (let col = 0; col < cols; col++) {
                        if (d.kind === 'residential' && rng.chance(0.06)) continue;
                        const gap = d.kind === 'dense' ? rng.range(1.2, 2.4) : rng.range(1.8, 3.2);
                        const w = (lotW - gap) * rng.range(0.86, 1);
                        const h = (lotH - gap) * (d.kind === 'dense' ? rng.range(0.9, 1) : rng.range(0.78, 0.96));
                        const cu = u0 + (col + 0.5) * lotW;
                        const cv = row === 0 ? v0 + h / 2 + 0.5 : v1 - h / 2 - 0.5;
                        if (w > 6 && h > 6 && lotFits(grid, d, cu, cv, w, h)) {
                            pushBuilding(scene, grid, d, cu, cv, w, h, 'house', rng);
                            placed.push([cu - w / 2, cv - h / 2, cu + w / 2, cv + h / 2]);
                        }
                    }
                }
                if (placed.length) pushPad(scene, d, placed);
                if (d.kind === 'residential' && rng.chance(0.5)) {
                    const [x, y] = toWorld(d, (u0 + u1) / 2 + rng.range(-bw / 4, bw / 4), (v0 + v1) / 2);
                    if (districtAt(grid, x, y) === d.index) addTree(scene, grid, x, y, rng.range(4.5, 7), rng.int(0, 2));
                }
            }
        }
    }
}

// 地块底：取本街区已落成建筑的包围盒外扩 2px，让同一街区读作一个整体。
function pushPad(scene, d, rects) {
    const u0 = Math.min(...rects.map(r => r[0])) - 2;
    const v0 = Math.min(...rects.map(r => r[1])) - 2;
    const u1 = Math.max(...rects.map(r => r[2])) + 2;
    const v1 = Math.max(...rects.map(r => r[3])) + 2;
    const [x, y] = toWorld(d, (u0 + u1) / 2, (v0 + v1) / 2);
    scene.pads.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round((u1 - u0) * 10) / 10, h: Math.round((v1 - v0) * 10) / 10, angle: Math.round(d.angle * 1000) / 1000 });
}

function pushBuilding(scene, grid, d, u, v, w, h, kind, rng) {
    const [x, y] = toWorld(d, u, v);
    scene.buildings.push({
        x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10,
        angle: Math.round(d.angle * 1000) / 1000, kind, tone: rng.int(0, 5), shade: Math.round(rng.range(-1, 1) * 100) / 100,
        dense: d.kind === 'dense',
    });
    const index = cellIndex(grid, x, y);
    if (index >= 0) grid.flags[index] |= F_BUILT;
}

// ---------- 绿地 ----------

function planParks(scene, districts, grid, root, noise) {
    const half = MAP_GEN_CELL / 2;
    for (const d of districts) {
        if (d.kind !== 'park') continue;
        const cells = districtCells(grid, d.index).filter(index => !(grid.flags[index] & (F_WATER | F_ROAD | F_RAIL)));
        if (!cells.length) continue;
        const rng = root.fork(`park:${d.key}`);
        scene.lawn.push(...cells);
        let cx = 0; let cy = 0;
        for (const index of cells) { cx += (index % grid.cols) * MAP_GEN_CELL + half; cy += Math.floor(index / grid.cols) * MAP_GEN_CELL + half; }
        cx /= cells.length; cy /= cells.length;
        const extent = Math.sqrt(cells.length) * MAP_GEN_CELL;
        const rx = extent * rng.range(0.28, 0.36);
        const ry = rx * rng.range(0.55, 0.8);
        const tilt = rng.range(0, Math.PI);
        const loop = [];
        for (let k = 0; k <= 64; k++) {
            const t = (k / 64) * Math.PI * 2;
            const ex = Math.cos(t) * rx;
            const ey = Math.sin(t) * ry;
            loop.push([cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)]);
        }
        const cross = [];
        for (let k = -8; k <= 8; k++) cross.push([cx + Math.cos(tilt + 1.2) * extent * 0.05 * k, cy + Math.sin(tilt + 1.2) * extent * 0.05 * k]);
        for (const path of [loop, cross]) {
            let run = [];
            for (const point of path) {
                const ok = districtAt(grid, point[0], point[1]) === d.index && !(flagAt(grid, point[0], point[1]) & (F_WATER | F_RAIL | F_CLEAR));
                if (ok) run.push(point.map(value => Math.round(value * 10) / 10));
                if (!ok || point === path[path.length - 1]) {
                    if (run.length >= 4) { scene.paths.push({ points: run }); stampPath(grid, run, 3, F_PATH); }
                    run = [];
                }
            }
        }
        if (rng.chance(0.55)) scene.plazas.push({ x: Math.round(cx), y: Math.round(cy), r: Math.round(rng.range(12, 20)) });
        if (rng.chance(0.55)) stamp(grid, cx, cy, 20, F_PATH);
        for (const index of cells) {
            const x = (index % grid.cols) * MAP_GEN_CELL + half + rng.range(-3, 3);
            const y = Math.floor(index / grid.cols) * MAP_GEN_CELL + half + rng.range(-3, 3);
            const clump = noise(x * 0.02 + 31, y * 0.02);
            if (clump > 0.02 && rng.chance(0.34 + clump * 0.4)) addTree(scene, grid, x, y, rng.range(5.5, 9.5), rng.int(0, 2));
        }
    }
}

function planStreetTrees(scene, grid, rng) {
    for (const road of scene.mainRoads) {
        for (let i = 0; i < road.points.length; i += 3) {
            const angle = polylineAngle(road.points, i);
            for (const side of [-1, 1]) {
                const off = road.width / 2 + 8;
                const x = road.points[i][0] - Math.sin(angle) * off * side;
                const y = road.points[i][1] + Math.cos(angle) * off * side;
                if (!(flagAt(grid, x, y) & F_BUILT) && rng.chance(0.8)) addTree(scene, grid, x, y, rng.range(4.5, 6), 0);
            }
        }
    }
    for (const river of scene.rivers) {
        for (let i = 0; i < river.points.length; i += 2) {
            const angle = polylineAngle(river.points, i);
            for (const side of [-1, 1]) {
                const off = river.halfs[i] + 13;
                const x = river.points[i][0] - Math.sin(angle) * off * side;
                const y = river.points[i][1] + Math.cos(angle) * off * side;
                if (!(flagAt(grid, x, y) & F_BUILT) && rng.chance(0.85)) addTree(scene, grid, x, y, rng.range(5, 7), 1);
            }
        }
    }
}

// ---------- 灯光（供夜间光照层使用） ----------

function planLights(scene, rng) {
    const push = (x, y, r, a) => scene.lights.push({ x: Math.round(x), y: Math.round(y), r, a });
    for (const road of scene.mainRoads) {
        for (let i = 0; i < road.points.length; i += 4) {
            const angle = polylineAngle(road.points, i);
            const side = (i / 4) % 2 ? 1 : -1;
            const off = road.width / 2 + 1;
            push(road.points[i][0] - Math.sin(angle) * off * side, road.points[i][1] + Math.cos(angle) * off * side, 14, 0.75);
        }
    }
    for (const street of scene.streets) {
        for (let i = 3; i < street.points.length; i += 9) push(street.points[i][0], street.points[i][1], 10, 0.5);
    }
    for (const bridge of scene.bridges) {
        for (let i = 0; i < bridge.points.length; i += 3) {
            const angle = polylineAngle(bridge.points, i);
            for (const side of [-1, 1]) {
                const off = bridge.width / 2 + 2;
                push(bridge.points[i][0] - Math.sin(angle) * off * side, bridge.points[i][1] + Math.cos(angle) * off * side, 14, 0.9);
            }
        }
    }
    for (const building of scene.buildings) {
        if (rng.chance(building.dense ? 0.45 : 0.22)) push(building.x + rng.range(-2, 2), building.y + rng.range(-2, 2), rng.range(4, 7), building.dense ? 0.7 : 0.55);
    }
    for (const landmark of scene.landmarks) {
        for (let k = 0; k < 4; k++) {
            const angle = landmark.angle + (k / 4) * Math.PI * 2 + Math.PI / 4;
            push(landmark.x + Math.cos(angle) * 24, landmark.y + Math.sin(angle) * 24, 14, 0.7);
        }
    }
}


export { generateCitySteps };
