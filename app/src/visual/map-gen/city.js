import { createRandom, createNoise2D } from './seed-random.js';
import { classifyMapPlace, MAP_WATER_CATEGORIES } from './place-semantics.js';
import { dist, nearestOnPolyline, smoothPath, pointInPolygon, polylineAngle, blobPolygon } from './geometry.js';
import { getMapTheme } from './themes.js';
import {
    MAP_GEN_CELL, F_WATER, F_ROAD, F_CLEAR, F_RAIL, F_BANK, F_OUT,
    Z_WATER, Z_SAND, Z_PARK, Z_GROVE, Z_FOREST, Z_DENSE, Z_SUBURB, Z_VILLAGE, Z_RURAL,
    createGrid, cellIndex, cellCenter, flagAt, zoneAt, urbanAt, stamp, stampPath, fineStampPath,
} from './city-grid.js';
import { createTensorField, createPointHash, traceLevel, joinDeadEnds, seedCandidates } from './city-roads.js';
import { planLots, planCars, planBoats } from './city-lots.js';
import { planParks, planWildTrees, planStreetTrees } from './city-green.js';

export { MAP_GEN_CELL };
const ARTERIAL_WIDTH = 14;
const LINK_WIDTH = 9;
const STREET_STEP = 6;

const LANDMARK_CLEARANCE = Object.freeze({
    school: 64, park: 16, shrine: 28, station: 40, tower: 38, castle: 72, hospital: 38,
    public: 40, commercial: 34, residential: 26, generic: 28, sea: 18, river: 18, lake: 0,
});
// 地点对周边建筑密度的加成（只影响建筑，不影响路网，保证新增地点不牵动远处街道）。
const ANCHOR_URBAN = Object.freeze({
    commercial: 0.38, station: 0.4, public: 0.3, hospital: 0.3, tower: 0.32, castle: 0.26, residential: 0.2, school: 0.14, generic: 0.14,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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
    const theme = input.theme || 'modern';
    const anchors = (input.points || []).map((point, index) => ({
        id: String(point.id ?? index),
        name: String(point.name ?? ''),
        x: clamp(Number(point.x) || 0, 0, 1) * W,
        y: clamp(Number(point.y) || 0, 0, 1) * H,
        category: point.category || classifyMapPlace(point.name, point.description),
    }));
    const grid = createGrid(W, H);
    const scene = {
        width: W, height: H, theme, cell: MAP_GEN_CELL,
        sea: null, rivers: [], lakes: [], ponds: [], mainRoads: [], streets: [], lanes: [], paths: [], rails: [], bridges: [],
        ground: null, fields: [], parking: [], courts: [], buildings: [], trees: [], landmarks: [], cars: [], boats: [], lights: [],
    };
    const land = anchors.filter(a => !MAP_WATER_CATEGORIES.includes(a.category));

    planWater(scene, anchors, land, root.fork('water'), noise, W, H);
    yield 'water';
    rasterizeWater(scene, grid);
    yield 'water-grid';
    for (const a of anchors) a.wet = Boolean(flagAt(grid, a.x, a.y) & F_WATER);

    planZones(scene, anchors, grid, root.fork('zones'), noise, getMapTheme(theme));
    planRails(scene, anchors, grid, root.fork('rail'), W, H);
    yield 'zones';

    const field = createTensorField(W, H, root.fork('field'), noise, scene);
    const roads = planRoadNetwork(scene, grid, field, root.fork('roads'), W, H);
    yield 'roads';

    planLandmarks(scene, anchors, grid, field, root.fork('landmarks'));
    const entrances = cutStreets(scene, grid, roads.streets, scene.mainRoads);
    planLinks(scene, anchors, grid, field, root.fork('links'));
    trimParallel(scene, grid);
    finishRoads(scene, grid);
    yield 'links';

    planParks(scene, grid, entrances, root.fork('parks'), noise, field);
    yield 'parks';
    planLots(scene, grid, root.fork('lots'), getMapTheme(theme));
    yield 'lots';
    planStreetTrees(scene, grid, root.fork('street-trees'));
    planWildTrees(scene, grid, root.fork('trees'), noise);
    planCars(scene, grid, root.fork('cars'));
    planBoats(scene, grid, root.fork('boats'));
    planLights(scene, root.fork('lights'));
    scene.ground = { cols: grid.cols, rows: grid.rows, zone: Array.from(grid.zone), urban: Array.from(grid.urban, v => Math.round(v * 100) / 100) };
    return scene;
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
        const baseHalf = rng.range(30, 44) * scale;
        const phase = rng.range(0, 100);
        const halfs = path.map((_, i) => baseHalf * (1 + 0.22 * noise(i * 0.04 + phase, 9.1)));
        let score = rng.next() * 4;
        for (const a of land) {
            const near = nearestOnPolyline(a.x, a.y, path);
            const clearance = halfs[near.index] + 46;
            if (near.distance < clearance) score += 2000 + (clearance - near.distance) * 40;
        }
        for (const a of riverAnchors) {
            const near = nearestOnPolyline(a.x, a.y, path);
            score += Math.abs(near.distance - halfs[near.index] - 10) * 3;
        }
        if (!best || score < best.score) best = { score, path, halfs };
    }
    if (!best) return null;
    // 仍压到陆上锚点时就地收窄为溪流，而不是挪动用户指定的坐标；收窄处前后平滑过渡，不出现突变的豁口。
    const halfs = best.halfs.map((h, i) => {
        const [x, y] = best.path[i];
        let value = h;
        for (const a of land) value = Math.min(value, dist(x, y, a.x, a.y) - 38);
        return Math.max(value, 9);
    });
    const eased = halfs.map((_, i) => {
        let min = Infinity;
        for (let k = -4; k <= 4; k++) {
            const j = clamp(i + k, 0, halfs.length - 1);
            min = Math.min(min, halfs[j] + Math.abs(k) * 2.5);
        }
        return min;
    });
    const narrow = eased.filter(h => h <= 9).length / eased.length;
    if (narrow > 0.25 && !riverAnchors.length) return null;
    return { points: best.path, halfs: eased.map(h => Math.round(h * 10) / 10) };
}

function planLake(anchor, anchors, rng, noise) {
    let radius = rng.range(46, 78);
    for (const other of anchors) if (other !== anchor) radius = Math.min(radius, dist(other.x, other.y, anchor.x, anchor.y) - 40);
    radius = Math.max(radius, 22);
    return { x: anchor.x, y: anchor.y, r: Math.round(radius), polygon: blobPolygon(anchor.x, anchor.y, radius, 0.82, rng.range(0, 100), noise) };
}

// 返回 'river' | 'still'（海、湖）| ''：主干道只架桥跨河，不横穿湖面和海面。
function waterKind(scene, x, y) {
    if (scene.sea && pointInPolygon(x, y, scene.sea.polygon)) return 'still';
    for (const lake of scene.lakes) if (pointInPolygon(x, y, lake.polygon)) return 'still';
    for (const river of scene.rivers) {
        const near = nearestOnPolyline(x, y, river.points);
        if (near.distance < river.halfs[near.index]) return 'river';
    }
    return '';
}

function rasterizeWater(scene, grid) {
    for (let i = 0; i < grid.flags.length; i++) {
        const [x, y] = cellCenter(grid, i);
        const kind = waterKind(scene, x, y);
        if (kind) grid.flags[i] |= F_WATER;
        if (kind === 'still') grid.still[i] = 1;
    }
    markBanks(grid);
}

// 水岸一圈留作河堤 / 护岸：房子不贴水，岸线读起来干净。
function markBanks(grid) {
    for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
            const i = r * grid.cols + c;
            if (grid.flags[i] & F_WATER) continue;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const rr = r + dr;
                    const cc = c + dc;
                    if (rr >= 0 && cc >= 0 && rr < grid.rows && cc < grid.cols && (grid.flags[rr * grid.cols + cc] & F_WATER)) grid.flags[i] |= F_BANK;
                }
            }
        }
    }
}

// ---------- 用地分区 ----------

// 城区强度 urban 与绿意 green 只由种子决定（路网据此加密或放疏）；地点只在分区时额外加成建筑密度、圈出公园与神社林。
function planZones(scene, anchors, grid, rng, noise, pal) {
    const W = grid.W;
    const H = grid.H;
    const reach = 0.5 * Math.hypot(W, H) * (pal.urban || 0.9);
    const cores = [{ x: W * rng.range(0.36, 0.64), y: H * rng.range(0.36, 0.64), r: reach * rng.range(0.85, 1.1) }];
    if (rng.chance(0.65)) cores.push({ x: W * rng.range(0.12, 0.88), y: H * rng.range(0.15, 0.85), r: reach * rng.range(0.35, 0.6) });
    const uo = rng.range(0, 100);
    const go = rng.range(0, 100);
    const discs = [];
    for (const a of anchors) {
        if (a.wet) continue;
        const local = rng.fork(`disc:${a.id}`);
        if (a.category === 'park') discs.push({ x: a.x, y: a.y, r: local.range(80, 125), zone: Z_PARK, phase: local.range(0, 50) });
        if (a.category === 'shrine') discs.push({ x: a.x, y: a.y, r: local.range(58, 84), zone: Z_GROVE, phase: local.range(0, 50) });
        if (a.category === 'castle') discs.push({ x: a.x, y: a.y, r: local.range(86, 104), zone: Z_PARK, phase: local.range(0, 50) });
    }
    const beachBand = scene.sea ? (scene.sea.beach ? 30 : 10) : 0;
    for (let i = 0; i < grid.flags.length; i++) {
        const [x, y] = cellCenter(grid, i);
        let u = 0;
        for (const core of cores) u = Math.max(u, 1.08 - dist(x, y, core.x, core.y) / core.r);
        u = clamp(u + 0.24 * noise.fbm(x * 0.0028 + uo, y * 0.0028 - uo, 3), 0, 1);
        const g = noise.fbm(x * 0.0021 - go, y * 0.0021 + go, 3);
        grid.urban[i] = u;
        grid.green[i] = g;
        if (grid.flags[i] & F_WATER) { grid.zone[i] = Z_WATER; continue; }
        if (beachBand && nearestOnPolyline(x, y, scene.sea.coast).distance < beachBand) { grid.zone[i] = Z_SAND; continue; }
        const disc = discs.find(d => dist(x, y, d.x, d.y) < d.r * (1 + 0.22 * noise(Math.atan2(y - d.y, x - d.x) * 1.2 + d.phase, 3.1)));
        if (disc) { grid.zone[i] = disc.zone; continue; }
        const nearAnchor = anchors.some(a => !a.wet && dist(x, y, a.x, a.y) < 70);
        if (isWild(u, g) && !nearAnchor) { grid.zone[i] = Z_FOREST; continue; }
        if (isCityPark(u, g) || riversideGreen(scene, x, y, u)) { grid.zone[i] = Z_PARK; continue; }
        let v = u;
        for (const a of anchors) {
            const boost = ANCHOR_URBAN[a.category];
            if (boost && !a.wet) v += boost * Math.exp(-((dist(x, y, a.x, a.y) / 170) ** 2));
        }
        grid.zone[i] = v >= 0.72 ? Z_DENSE : v >= 0.34 ? Z_SUBURB : v >= 0.17 ? Z_VILLAGE : Z_RURAL;
    }
}

const isWild = (u, g) => g - 0.62 * u > 0.12;
const isCityPark = (u, g) => u > 0.3 && g - 0.3 * u > 0.16;

function riversideGreen(scene, x, y, u) {
    if (u > 0.86) return false;
    for (const river of scene.rivers) {
        const near = nearestOnPolyline(x, y, river.points);
        if (near.distance - river.halfs[near.index] < 26) return true;
    }
    return false;
}

// ---------- 交通 ----------

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

// 主干道与街道都沿张量场追踪：主干道间距大、可以架桥过河；街道按城区强度加密，遇水与野林止步。
function planRoadNetwork(scene, grid, field, rng, W, H) {
    const scale = Math.min(W, H) / 900;
    const wild = (x, y) => {
        const i = cellIndex(grid, x, y);
        return i >= 0 && isWild(grid.urban[i], grid.green[i]);
    };
    // 图外没有栅格，改用水系几何判断：河道在图外还延伸一段，不能让道路从那里穿过去。
    const water = (x, y) => {
        const i = cellIndex(grid, x, y);
        if (i < 0) return waterKind(scene, x, y);
        return !(grid.flags[i] & F_WATER) ? '' : grid.still[i] ? 'still' : 'river';
    };
    const wet = (x, y) => Boolean(water(x, y));
    const arterialHash = createPointHash(W, H, 24);
    const arterialSep = 250 * scale;
    const arterials = traceLevel({
        field, W, H, step: 8, maxSteps: 420, minLength: 160 * scale, dsep: () => arterialSep, testRatio: 0.55,
        blocked: (x, y) => { const kind = water(x, y); return kind === 'river' ? 'water' : kind; }, bridgeMax: 150 * scale, hash: arterialHash,
        candidates: seedCandidates(W, H, 230 * scale, rng.fork('arterial-seeds')),
    });
    if (!arterials.length) {
        // 退化：水面占满或场过于扭曲时，至少留一条横穿全图的主路。
        const points = [];
        for (let x = -20; x <= W + 20; x += 8) points.push([x, H / 2]);
        arterials.push({ id: 0, family: 0, points, stops: ['edge', 'edge'] });
        for (const [x, y] of points) arterialHash.add(x, y, 0, 0);
    }
    for (const line of arterials) {
        scene.mainRoads.push({ points: line.points, width: ARTERIAL_WIDTH, kind: 'arterial' });
        splitBridges(scene, line.points, ARTERIAL_WIDTH, grid, 'road');
    }
    const streetHash = createPointHash(W, H, 16);
    const dsep = (x, y) => (50 + 88 * (1 - smooth(0.12, 0.9, urbanAt(grid, x, y)))) * scale;
    const queue = [];
    for (const line of arterials) {
        for (let i = 4; i < line.points.length - 4; i += 6) queue.push([line.points[i][0], line.points[i][1], 1 - line.family]);
    }
    const streets = traceLevel({
        field, W, H, step: STREET_STEP, maxSteps: 150, minLength: 36 * scale, dsep, testRatio: 0.56,
        blocked: (x, y) => (wet(x, y) || (flagAt(grid, x, y) & F_BANK) ? 'water' : wild(x, y) ? 'wild' : ''), hash: streetHash, avoid: [arterialHash],
        candidates: seedCandidates(W, H, 46 * scale, rng.fork('street-seeds')), queue, idBase: 10000,
    });
    joinDeadEnds(streets, [streetHash, arterialHash], { radius: 64 * scale, step: STREET_STEP, blocked: (x, y) => wet(x, y) || Boolean(flagAt(grid, x, y) & F_BANK) });
    return { arterials, streets };
}

// 街道裁切：地标净空、公园 / 神社林 / 野林内部、与铁路或主干道平行重叠的段落删去；公园边的断点记为入口。
function cutStreets(scene, grid, lines, mainRoads) {
    const W = grid.W;
    const H = grid.H;
    const mainHash = createPointHash(W, H, 24);
    mainRoads.forEach((road, id) => road.points.forEach((p, i) => mainHash.add(p[0], p[1], id, 0, polylineAngle(road.points, i))));
    const railAngle = scene.rails[0]?.angle;
    const entrances = [];
    for (const line of lines) {
        const keep = line.points.map((p, i) => {
            const flags = flagAt(grid, p[0], p[1]);
            if (flags & F_OUT) return !waterKind(scene, p[0], p[1]);
            if (flags & (F_CLEAR | F_WATER | F_BANK)) return false;
            const zone = zoneAt(grid, p[0], p[1]);
            if (zone === Z_PARK || zone === Z_GROVE || zone === Z_FOREST || zone === Z_SAND) return false;
            const angle = polylineAngle(line.points, i);
            if ((flags & F_RAIL) && Math.abs(Math.sin(angle - railAngle)) < 0.6) return false;
            let parallel = false;
            mainHash.each(p[0], p[1], ARTERIAL_WIDTH / 2 + 7, (x, y, id, fam, a) => (parallel = Math.abs(Math.sin(angle - a)) < 0.45));
            return !parallel;
        });
        let start = -1;
        for (let i = 0; i <= line.points.length; i++) {
            if (i < line.points.length && keep[i]) { if (start < 0) start = i; continue; }
            if (start >= 0) {
                const run = line.points.slice(start, i);
                // 不足 24px 的碎段（多是铁路、地标边的残余）直接丢掉。
                if (run.length >= 5) {
                    scene.streets.push({ key: `${line.id}`, offset: start * STREET_STEP, points: run });
                    for (const [edge, next] of [[start, start - 1], [i - 1, i]]) {
                        const p = line.points[next];
                        const zone = p ? zoneAt(grid, p[0], p[1]) : 0;
                        if (zone === Z_PARK) entrances.push({ x: line.points[edge][0], y: line.points[edge][1], cell: cellIndex(grid, p[0], p[1]) });
                    }
                }
                start = -1;
            }
        }
    }
    // 城区强度低的街道画成田间小路。
    const streets = [];
    for (const street of scene.streets) {
        const u = street.points.reduce((sum, p) => sum + urbanAt(grid, p[0], p[1]), 0) / street.points.length;
        const rural = street.points.filter(p => zoneAt(grid, p[0], p[1]) === Z_RURAL).length / street.points.length;
        if (u < 0.17 || rural > 0.6) scene.lanes.push(street);
        else streets.push(street);
    }
    scene.streets = streets;
    return entrances;
}

// 地点接入：沿张量场朝最近的主干道 / 街道追一段，得到与街网同向的支路；追不到再直连。
function planLinks(scene, anchors, grid, field, rng) {
    const W = grid.W;
    const H = grid.H;
    const targets = createPointHash(W, H, 16);
    const list = [];
    const addTarget = (x, y, weight) => { targets.add(x, y, list.length, 0, weight); list.push([x, y, weight]); };
    for (const road of scene.mainRoads) for (const p of road.points) addTarget(p[0], p[1], 1);
    for (const street of [...scene.streets, ...scene.lanes]) for (let i = 0; i < street.points.length; i += 2) addTarget(street.points[i][0], street.points[i][1], 1.3);
    const wet = (x, y) => Boolean(flagAt(grid, x, y) & F_WATER);
    for (const a of anchors) {
        if (a.wet || a.category === 'lake') continue;
        let best = null;
        for (const [x, y, weight] of list) {
            const d = dist(a.x, a.y, x, y);
            if (!best || d * weight < best.cost) best = { x, y, d, cost: d * weight };
        }
        let points = null;
        if (!best) {
            points = [[a.x, a.y], [a.x + 1, a.y]];
        } else if (best.d < 3) {
            points = [[a.x, a.y], [best.x, best.y]];
        } else {
            const want = [(best.x - a.x) / best.d, (best.y - a.y) / best.d];
            const options = [];
            for (const family of [0, 1]) {
                const d = field.dir(a.x, a.y, family);
                for (const sign of [1, -1]) {
                    const dot = (d[0] * want[0] + d[1] * want[1]) * sign;
                    if (dot > 0.35) options.push({ family, sign, dot });
                }
            }
            options.sort((p, q) => q.dot - p.dot);
            for (const option of options.slice(0, 2)) {
                const traced = traceLink(a, option, field, targets, wet, Math.ceil(best.d * 1.7 / STREET_STEP) + 4);
                if (traced && (!points || traced.length < points.length)) points = traced;
            }
            if (!points) {
                const len = best.d;
                const bend = rng.fork(`bend:${a.id}`).range(-0.08, 0.08) * len;
                const nx = -(best.y - a.y) / len;
                const ny = (best.x - a.x) / len;
                points = smoothPath([[a.x, a.y], [(a.x + best.x) / 2 + nx * bend, (a.y + best.y) / 2 + ny * bend], [best.x, best.y]], STREET_STEP);
            }
        }
        points = points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
        points[0] = [a.x, a.y];
        scene.mainRoads.push({ points, width: LINK_WIDTH, kind: 'link', id: a.id });
        splitBridges(scene, points, LINK_WIDTH, grid, 'road');
        for (const p of points) addTarget(p[0], p[1], 1);
    }
}

function traceLink(a, option, field, targets, wet, maxSteps) {
    const pts = [[a.x, a.y]];
    let [dx, dy] = field.dir(a.x, a.y, option.family);
    dx *= option.sign; dy *= option.sign;
    let x = a.x;
    let y = a.y;
    for (let k = 0; k < maxSteps; k++) {
        let d = field.dir(x, y, option.family);
        if (d[0] * dx + d[1] * dy < 0) d = [-d[0], -d[1]];
        if (d[0] * dx + d[1] * dy < 0.8) return null;
        x += d[0] * STREET_STEP;
        y += d[1] * STREET_STEP;
        dx = d[0]; dy = d[1];
        if (wet(x, y)) return null;
        let hit = null;
        if (k > 1) targets.each(x, y, 7, (px, py, id, fam, w, dd) => { if (!hit || dd < hit.d) hit = { x: px, y: py, d: dd }; return false; });
        pts.push([x, y]);
        if (hit) { pts.push([hit.x, hit.y]); return pts; }
    }
    return null;
}

// 支路与街道平行重叠时去掉街道那段，避免两条路叠画成一条粗线。
function trimParallel(scene, grid) {
    const links = scene.mainRoads.filter(road => road.kind === 'link');
    if (!links.length) return;
    const hash = createPointHash(grid.W, grid.H, 16);
    links.forEach((road, id) => road.points.forEach((p, i) => hash.add(p[0], p[1], id, 0, polylineAngle(road.points, i))));
    for (const key of ['streets', 'lanes']) {
        const out = [];
        for (const street of scene[key]) {
            let run = [];
            let runStart = 0;
            const flush = end => {
                if (run.length >= 4) out.push({ ...street, offset: street.offset + runStart * STREET_STEP, points: run });
                run = [];
                runStart = end + 1;
            };
            street.points.forEach((p, i) => {
                const angle = polylineAngle(street.points, i);
                let parallel = false;
                hash.each(p[0], p[1], LINK_WIDTH / 2 + 6, (x, y, id, fam, a) => (parallel = Math.abs(Math.sin(angle - a)) < 0.5));
                if (parallel) flush(i);
                else run.push(p);
            });
            flush(street.points.length);
        }
        scene[key] = out;
    }
}

function finishRoads(scene, grid) {
    for (const road of scene.mainRoads) {
        stampPath(grid, road.points, road.width / 2 + 3, F_ROAD);
        fineStampPath(grid, road.points, road.width / 2 + 1.8);
    }
    // 细网格按路面外沿（含路缘描边）盖章，临街地块从这里起算退线。
    for (const street of scene.streets) { stampPath(grid, street.points, 5, F_ROAD); fineStampPath(grid, street.points, 4.7); }
    for (const lane of scene.lanes) { stampPath(grid, lane.points, 3.5, F_ROAD); fineStampPath(grid, lane.points, 2.8); }
    for (const rail of scene.rails) fineStampPath(grid, rail.points, 10);
}

// ---------- 地标 ----------

function planLandmarks(scene, anchors, grid, field, rng) {
    for (const a of anchors) {
        const local = rng.fork(`landmark:${a.id}`);
        if (a.category === 'lake' || a.wet) continue;
        const kind = a.category === 'sea' || a.category === 'river'
            ? (/港|码头|渡口/.test(a.name) ? 'pier' : 'shore') : a.category;
        const angle = kind === 'station' ? (scene.rails[0]?.angle ?? 0) : field.angle(a.x, a.y);
        const landmark = { kind, id: a.id, x: a.x, y: a.y, angle: Math.round(angle * 1000) / 1000, variant: local.int(0, 2) };
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

// ---------- 灯光（供夜间光照层使用） ----------

function planLights(scene, rng) {
    const push = (x, y, r, a) => scene.lights.push({ x: Math.round(x), y: Math.round(y), r, a });
    for (const road of scene.mainRoads) {
        for (let i = 0; i < road.points.length; i += road.kind === 'link' ? 5 : 3) {
            const angle = polylineAngle(road.points, i);
            const side = (i % 2) ? 1 : -1;
            const off = road.width / 2 + 1;
            push(road.points[i][0] - Math.sin(angle) * off * side, road.points[i][1] + Math.cos(angle) * off * side, 14, 0.75);
        }
    }
    for (const street of scene.streets) {
        for (let i = 3; i < street.points.length; i += 8) push(street.points[i][0], street.points[i][1], 10, 0.5);
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
        if (rng.chance(building.dense ? 0.5 : 0.28)) push(building.x + rng.range(-2, 2), building.y + rng.range(-2, 2), rng.range(4, 7), building.dense ? 0.7 : 0.55);
    }
    for (const landmark of scene.landmarks) {
        for (let k = 0; k < 4; k++) {
            const angle = landmark.angle + (k / 4) * Math.PI * 2 + Math.PI / 4;
            push(landmark.x + Math.cos(angle) * 24, landmark.y + Math.sin(angle) * 24, 14, 0.7);
        }
    }
}

export { generateCitySteps };
