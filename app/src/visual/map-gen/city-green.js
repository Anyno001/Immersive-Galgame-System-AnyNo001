import { dist, smoothPath, polylineAngle, blobPolygon, pointInPolygon } from './geometry.js';
import {
    MAP_GEN_CELL, F_WATER, F_ROAD, F_CLEAR, F_PATH, F_RAIL, F_BANK, F_OUT,
    Z_PARK, Z_GROVE, Z_FOREST, Z_DENSE, Z_SUBURB, Z_VILLAGE, Z_RURAL,
    cellCenter, flagAt, zoneAt, stampPath, fineStampPath, fineFree, discFits, discStamp, rectFits, rectStamp,
} from './city-grid.js';

const TREE_BLOCK = F_WATER | F_BANK | F_CLEAR | F_RAIL | F_OUT;
const TREE_LIMIT = 8000;
export const ACCENT_TONE = 4;
const r1 = value => Math.round(value * 10) / 10;

// 树：默认检查并占用细网格（院子、行道树、公园），林地里的树允许彼此重叠成片（stamp=false）。
export function addTree(scene, grid, x, y, r, tone, rng, stamp = true) {
    if (scene.trees.length >= TREE_LIMIT) return false;
    if (flagAt(grid, x, y) & TREE_BLOCK) return false;
    if (stamp ? !discFits(grid, x, y, r * 0.75) : !fineFree(grid, x, y)) return false;
    // 点缀色（秋叶 / 樱花）只给院子与公园里的单株，林地保持整片常绿。
    const accent = stamp && rng && rng.chance(0.022);
    scene.trees.push({ x: r1(x), y: r1(y), r: r1(r), tone: accent ? ACCENT_TONE : tone });
    if (stamp) discStamp(grid, x, y, r);
    return true;
}

// ---------- 公园 ----------

function labelComponents(grid, zones) {
    const comp = new Int32Array(grid.zone.length).fill(-1);
    const list = [];
    for (let start = 0; start < grid.zone.length; start++) {
        if (comp[start] >= 0 || !zones.has(grid.zone[start])) continue;
        const id = list.length;
        const cells = [start];
        comp[start] = id;
        for (let k = 0; k < cells.length; k++) {
            const i = cells[k];
            const c = i % grid.cols;
            const r = Math.floor(i / grid.cols);
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const cc = c + dc;
                const rr = r + dr;
                if (cc < 0 || rr < 0 || cc >= grid.cols || rr >= grid.rows) continue;
                const j = rr * grid.cols + cc;
                if (comp[j] < 0 && grid.zone[j] === grid.zone[start]) { comp[j] = id; cells.push(j); }
            }
        }
        list.push({ id, cells, zone: grid.zone[start], first: start });
    }
    return { comp, list };
}

function isEdgeCell(grid, i, zone) {
    const c = i % grid.cols;
    const r = Math.floor(i / grid.cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= grid.cols || rr >= grid.rows) continue;
        if (grid.zone[rr * grid.cols + cc] !== zone) return true;
    }
    return false;
}

// 公园：草坪 + 从街道断点（入口）出发、按最小生成树连起来的弯曲园路；大公园再配池塘、球场与成团的树。
// 不画环形步道和放射状十字，避免草地上出现“麦田怪圈”。
export function planParks(scene, grid, entrances, rng, noise, field) {
    const { comp, list } = labelComponents(grid, new Set([Z_PARK, Z_GROVE]));
    for (const park of list) {
        const local = rng.fork(`park:${park.first}`);
        if (park.zone === Z_GROVE) { planGrove(scene, grid, park, local); continue; }
        let cx = 0;
        let cy = 0;
        for (const i of park.cells) { const [x, y] = cellCenter(grid, i); cx += x; cy += y; }
        cx /= park.cells.length;
        cy /= park.cells.length;
        const extent = Math.sqrt(park.cells.length) * MAP_GEN_CELL;
        if (park.cells.length >= 24) planParkPaths(scene, grid, park, comp, entrances, local, cx, cy, extent);
        if (park.cells.length >= 140 && local.chance(0.55)) planPond(scene, grid, park, local, noise, extent);
        if (park.cells.length >= 200 && local.chance(0.5)) planCourt(scene, grid, park, local, field);
        const phase = local.range(0, 100);
        for (const i of park.cells) {
            const [x0, y0] = cellCenter(grid, i);
            const x = x0 + local.range(-3, 3);
            const y = y0 + local.range(-3, 3);
            const clump = noise(x * 0.017 + phase, y * 0.017 - phase);
            const edge = isEdgeCell(grid, i, Z_PARK);
            const p = edge ? 0.5 : clump > 0.12 ? 0.62 : clump > -0.1 ? 0.12 : 0.03;
            if (local.chance(p)) addTree(scene, grid, x, y, local.range(5, 9), local.int(0, 2), local);
        }
    }
}

function planParkPaths(scene, grid, park, comp, entrances, rng, cx, cy, extent) {
    let doors = entrances.filter(e => e.cell >= 0 && comp[e.cell] === park.id);
    doors.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    if (doors.length > 6) {
        const step = doors.length / 6;
        doors = Array.from({ length: 6 }, (_, k) => doors[Math.floor(k * step)]);
    }
    const nodes = doors.map(d => [d.x, d.y]);
    const waypoints = park.cells.length > 320 ? 2 : 1;
    for (let k = 0, tries = 0; k < waypoints && tries < 20; tries++) {
        const [x, y] = cellCenter(grid, rng.pick(park.cells));
        if (dist(x, y, cx, cy) > extent * 0.42) continue;
        nodes.push([x, y]);
        k++;
    }
    if (nodes.length < 2) return;
    const inTree = new Set([0]);
    const edges = [];
    while (inTree.size < nodes.length) {
        let best = null;
        for (const i of inTree) {
            for (let j = 0; j < nodes.length; j++) {
                if (inTree.has(j)) continue;
                const d = dist(nodes[i][0], nodes[i][1], nodes[j][0], nodes[j][1]);
                if (!best || d < best.d) best = { i, j, d };
            }
        }
        inTree.add(best.j);
        edges.push(best);
    }
    for (const { i, j, d } of edges) {
        const [ax, ay] = nodes[i];
        const [bx, by] = nodes[j];
        const nx = -(by - ay) / (d || 1);
        const ny = (bx - ax) / (d || 1);
        const bend = rng.range(-0.28, 0.28) * d;
        const wiggle = rng.range(-0.12, 0.12) * d;
        const curve = smoothPath([
            [ax, ay],
            [ax + (bx - ax) * 0.33 + nx * (bend + wiggle), ay + (by - ay) * 0.33 + ny * (bend + wiggle)],
            [ax + (bx - ax) * 0.66 + nx * (bend - wiggle), ay + (by - ay) * 0.66 + ny * (bend - wiggle)],
            [bx, by],
        ], 4);
        let run = [];
        const flush = () => {
            if (run.length >= 3) {
                scene.paths.push({ points: run });
                stampPath(grid, run, 2, F_PATH);
                fineStampPath(grid, run, 3);
            }
            run = [];
        };
        for (const p of curve) {
            const zone = zoneAt(grid, p[0], p[1]);
            const flags = flagAt(grid, p[0], p[1]);
            if ((zone === Z_PARK || (flags & F_ROAD)) && !(flags & F_WATER)) run.push([r1(p[0]), r1(p[1])]);
            else flush();
        }
        flush();
    }
}

function planPond(scene, grid, park, rng, noise, extent) {
    const radius = Math.min(40, 12 + extent * 0.12) * rng.range(0.75, 1);
    for (let tries = 0; tries < 16; tries++) {
        const [x, y] = cellCenter(grid, rng.pick(park.cells));
        const polygon = blobPolygon(x, y, radius, rng.range(0.6, 0.9), rng.range(0, 100), noise, 28);
        const ok = polygon.every(([px, py]) => zoneAt(grid, px, py) === Z_PARK && fineFree(grid, px, py)) && fineFree(grid, x, y);
        if (!ok) continue;
        scene.ponds.push({ x: r1(x), y: r1(y), r: Math.round(radius), polygon });
        const reach = radius + 6;
        for (let yy = y - reach; yy <= y + reach; yy += 4) {
            for (let xx = x - reach; xx <= x + reach; xx += 4) {
                if (pointInPolygon(xx, yy, polygon)) discStamp(grid, xx, yy, 5);
            }
        }
        return;
    }
}

function planCourt(scene, grid, park, rng, field) {
    const pitch = park.cells.length > 420 && rng.chance(0.5);
    const w = pitch ? 44 : 26;
    const h = pitch ? 28 : 14;
    for (let tries = 0; tries < 14; tries++) {
        const [x, y] = cellCenter(grid, rng.pick(park.cells));
        const angle = field ? field.angle(x, y) : 0;
        if (!rectFits(grid, x, y, w + 6, h + 6, angle, z => z === Z_PARK)) continue;
        scene.courts.push({ x: r1(x), y: r1(y), w, h, angle: Math.round(angle * 1000) / 1000, kind: pitch ? 'pitch' : 'tennis' });
        rectStamp(grid, x, y, w, h, angle, 2);
        return;
    }
}

// 神社林：参道留空，其余密植深色常绿树。
function planGrove(scene, grid, park, rng) {
    for (const i of park.cells) {
        const [x0, y0] = cellCenter(grid, i);
        if (rng.chance(0.92)) addTree(scene, grid, x0 + rng.range(-3, 3), y0 + rng.range(-3, 3), rng.range(6.5, 10), rng.chance(0.6) ? 3 : 1, null, false);
    }
}

// ---------- 林地、田野与零散树 ----------

export function planWildTrees(scene, grid, rng, noise) {
    const phase = rng.range(0, 100);
    const scatter = { [Z_DENSE]: 0.015, [Z_SUBURB]: 0.07, [Z_VILLAGE]: 0.08, [Z_RURAL]: 0.02 };
    for (let i = 0; i < grid.zone.length; i++) {
        const zone = grid.zone[i];
        const [x0, y0] = cellCenter(grid, i);
        if (zone === Z_FOREST) {
            const local = rng.fork(`f:${i}`);
            if (local.chance(0.9)) addTree(scene, grid, x0 + local.range(-3.5, 3.5), y0 + local.range(-3.5, 3.5), local.range(7, 11.5), local.pick([0, 1, 3, 3]), local, false);
            if (local.chance(0.3)) addTree(scene, grid, x0 + local.range(-4, 4), y0 + local.range(-4, 4), local.range(4.5, 7), local.int(0, 2), local, false);
            continue;
        }
        const p = scatter[zone];
        if (!p) continue;
        const clump = noise(x0 * 0.02 + phase, y0 * 0.02);
        const local = rng.fork(`t:${i}`);
        if (local.chance(clump > 0.4 ? p * 5 : p)) addTree(scene, grid, x0 + local.range(-3, 3), y0 + local.range(-3, 3), local.range(4.2, 7.5), local.int(0, 3), local);
    }
}

export function planStreetTrees(scene, grid, rng) {
    scene.mainRoads.forEach((road, index) => {
        const local = rng.fork(`road:${index}`);
        const every = road.kind === 'link' ? 3 : 2;
        const p = road.kind === 'link' ? 0.4 : 0.78;
        for (let i = 1; i < road.points.length - 1; i += every) {
            const angle = polylineAngle(road.points, i);
            for (const side of [-1, 1]) {
                const off = road.width / 2 + 7;
                const x = road.points[i][0] - Math.sin(angle) * off * side;
                const y = road.points[i][1] + Math.cos(angle) * off * side;
                if (local.chance(p)) addTree(scene, grid, x, y, local.range(4, 5.4), 0, null);
            }
        }
    });
    scene.rivers.forEach((river, index) => {
        const local = rng.fork(`river:${index}`);
        for (let i = 0; i < river.points.length; i += 2) {
            const angle = polylineAngle(river.points, i);
            for (const side of [-1, 1]) {
                const off = river.halfs[i] + local.range(12, 20);
                const x = river.points[i][0] - Math.sin(angle) * off * side;
                const y = river.points[i][1] + Math.cos(angle) * off * side;
                if (zoneAt(grid, x, y) === Z_PARK && local.chance(0.75)) addTree(scene, grid, x, y, local.range(5, 7.5), 1, local);
            }
        }
    });
}
