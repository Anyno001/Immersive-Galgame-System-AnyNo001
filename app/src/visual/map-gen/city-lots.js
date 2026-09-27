import { dist, polylineAngle, nearestOnPolyline } from './geometry.js';
import {
    F_WATER, F_CLEAR, Z_DENSE, Z_SUBURB, Z_VILLAGE, Z_RURAL,
    flagAt, zoneAt, rectFits, rectStamp,
} from './city-grid.js';
import { addTree } from './city-green.js';

// 沿街临街布置地块：房子、写字楼、停车场、农田都是“贴着路边一排”的矩形，朝向跟随道路切线。
// 地块按沿路绝对里程切成 96px 的段，每段一条独立随机子流、地块不跨段：
// 某处因新地点让路而少放一栋，不会让整条街后面的房子全部错位。
const CHUNK = 96;
const SPECS = {
    [Z_DENSE]: { kind: 'flat', w: [14, 26], d: [12, 20], gap: [1.2, 2.6], set: [1.2, 2.4], p: 0.92 },
    [Z_SUBURB]: { kind: 'house', w: [10.5, 15], d: [9, 12], gap: [4, 10], set: [3, 5.5], p: 0.76, tree: 0.5 },
    [Z_VILLAGE]: { kind: 'house', w: [10, 14], d: [8.5, 11.5], gap: [12, 34], set: [4, 9], p: 0.5, tree: 0.8 },
    [Z_RURAL]: { kind: 'field', w: [34, 84], d: [30, 66], gap: [2.5, 4.5], set: [2.5, 4], p: 0.9 },
};
const BUILT_ZONES = new Set([Z_DENSE, Z_SUBURB, Z_VILLAGE, Z_RURAL]);
const FIELD_ZONES = new Set([Z_RURAL, Z_VILLAGE]);
const r1 = value => Math.round(value * 10) / 10;

function walker(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]));
    return {
        length: cum[cum.length - 1],
        at(s) {
            let i = 0;
            while (i < cum.length - 2 && cum[i + 1] < s) i++;
            const seg = (cum[i + 1] - cum[i]) || 1;
            const t = Math.min(1, Math.max(0, (s - cum[i]) / seg));
            const [ax, ay] = points[i];
            const [bx, by] = points[i + 1] || points[i];
            return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle: Math.atan2(by - ay, bx - ax) };
        },
    };
}

export function planLots(scene, grid, rng, pal) {
    const roofCount = pal.roofs.length;
    const flatCount = pal.flats.length;
    const roads = [
        ...scene.streets.map(road => ({ road, half: 4.7, key: `s${road.key}` })),
        ...scene.lanes.map(road => ({ road, half: 2.8, key: `s${road.key}` })),
        ...scene.mainRoads.map((road, i) => ({ road, half: road.width / 2 + 1.8, key: road.kind === 'link' ? `l${road.id}` : `a${i}` })),
    ];
    for (const { road, half, key } of roads) {
        if (road.points.length < 2) continue;
        const walk = walker(road.points);
        const offset = road.offset || 0;
        for (const side of [-1, 1]) {
            for (let k = Math.floor(offset / CHUNK); k * CHUNK < offset + walk.length; k++) {
                const local = rng.fork(`${key}:${side}:${k}`);
                const favored = [local.int(0, roofCount - 1), local.int(0, roofCount - 1)];
                const end = Math.min((k + 1) * CHUNK, offset + walk.length);
                let s = Math.max(k * CHUNK, offset) + local.range(0.5, 4);
                while (s < end) {
                    const probe = walk.at(s - offset + 4);
                    const nx = -Math.sin(probe.angle) * side;
                    const ny = Math.cos(probe.angle) * side;
                    const zone = zoneAt(grid, probe.x + nx * (half + 9), probe.y + ny * (half + 9));
                    const spec = SPECS[zone];
                    if (!spec) { s += 8; continue; }
                    let kind = spec.kind;
                    let w = local.range(...spec.w);
                    let d = local.range(...spec.d);
                    const roll = local.next();
                    if (zone === Z_DENSE && roll < 0.07) { kind = 'parking'; w = local.range(22, 32); d = local.range(14, 20); }
                    if (zone === Z_SUBURB && roll < 0.06) { kind = 'flat'; w = local.range(16, 22); d = local.range(11, 14); }
                    if (zone === Z_RURAL && roll < 0.05) { kind = 'house'; w = local.range(10, 13); d = local.range(8.5, 10.5); }
                    const gap = kind === spec.kind ? local.range(...spec.gap) : local.range(3, 6);
                    const set = local.range(...spec.set);
                    if (s + w > end) break;
                    if (!local.chance(spec.p)) { s += w + gap; continue; }
                    let placed = false;
                    for (const shrink of kind === 'field' ? [1, 0.62] : [1, 0.82]) {
                        const lw = w * shrink;
                        const ld = d * shrink;
                        const c = walk.at(s - offset + lw / 2);
                        const off = half + set + ld / 2;
                        const cx = c.x - Math.sin(c.angle) * side * off;
                        const cy = c.y + Math.cos(c.angle) * side * off;
                        const allow = kind === 'field' ? z => FIELD_ZONES.has(z) : z => BUILT_ZONES.has(z);
                        if (!rectFits(grid, cx, cy, lw, ld, c.angle, allow)) continue;
                        const item = { x: r1(cx), y: r1(cy), w: r1(lw), h: r1(ld), angle: Math.round(c.angle * 1000) / 1000 };
                        if (kind === 'field') {
                            scene.fields.push({ ...item, tone: local.int(0, pal.fields.length - 1), rows: local.chance(0.6) ? 0 : 1, spacing: r1(local.range(3.2, 5)) });
                            rectStamp(grid, cx, cy, lw, ld, c.angle, 1);
                            if (local.chance(0.35)) hedgerow(scene, grid, local, cx, cy, lw, ld, c.angle, side);
                        } else if (kind === 'parking') {
                            scene.parking.push({ ...item, cars: local.int(0, 999) });
                            rectStamp(grid, cx, cy, lw, ld, c.angle);
                        } else {
                            const dense = kind === 'flat';
                            scene.buildings.push({
                                ...item, kind, dense,
                                tone: dense ? local.int(0, flatCount - 1) : (local.chance(0.7) ? local.pick(favored) : local.int(0, roofCount - 1)),
                                level: dense ? (zone === Z_DENSE ? local.int(2, 5) : 2) : 1,
                                detail: local.int(0, 999),
                                shade: Math.round(local.range(-1, 1) * 100) / 100,
                            });
                            rectStamp(grid, cx, cy, lw, ld, c.angle);
                            // 后院一棵树：房子退到路边，院子里的树把街区内部填绿。
                            const treeChance = zone === Z_RURAL ? 0.8 : spec.tree || 0.05;
                            if (local.chance(treeChance)) {
                                const r = local.range(4.2, 6.8);
                                const back = ld / 2 + r + local.range(1, 4);
                                const along = local.range(-lw / 3, lw / 3);
                                addTree(scene, grid,
                                    cx - Math.sin(c.angle) * side * back + Math.cos(c.angle) * along,
                                    cy + Math.cos(c.angle) * side * back + Math.sin(c.angle) * along, r, local.int(0, 3), local);
                            }
                        }
                        s += lw + gap;
                        placed = true;
                        break;
                    }
                    if (!placed) s += 5;
                }
            }
        }
    }
}

// 田埂树篱：沿田块远端一条边稀疏种一排树。
function hedgerow(scene, grid, rng, cx, cy, w, h, angle, side) {
    const back = h / 2 + 2.5;
    const bx = cx - Math.sin(angle) * side * back;
    const by = cy + Math.cos(angle) * side * back;
    for (let t = -w / 2; t <= w / 2; t += rng.range(7, 12)) {
        if (!rng.chance(0.7)) continue;
        addTree(scene, grid, bx + Math.cos(angle) * t, by + Math.sin(angle) * t, rng.range(3.4, 5.2), 3, rng);
    }
}

// 主干道上的车：沿右侧车道稀疏分布，只为画面添一点生气。
export function planCars(scene, grid, rng) {
    scene.mainRoads.forEach((road, index) => {
        if (road.kind !== 'arterial') return;
        const local = rng.fork(`road:${index}`);
        const walk = walker(road.points);
        for (let s = local.range(10, 60); s < walk.length; s += local.range(34, 110)) {
            const p = walk.at(s);
            const side = local.chance(0.5) ? 1 : -1;
            const x = p.x - Math.sin(p.angle) * side * 3.3;
            const y = p.y + Math.cos(p.angle) * side * 3.3;
            if (x < 4 || y < 4 || x > grid.W - 4 || y > grid.H - 4 || (flagAt(grid, x, y) & F_CLEAR)) continue;
            scene.cars.push({ x: r1(x), y: r1(y), angle: Math.round((p.angle + (side < 0 ? Math.PI : 0)) * 100) / 100, tone: local.int(0, 5), len: r1(local.range(5.6, 7.2)) });
        }
    });
}

// 小船：河心够宽处一两条，海面上三五条（离岸一段距离、远离桥）。
export function planBoats(scene, grid, rng) {
    const bridgePoints = scene.bridges.flatMap(bridge => bridge.points);
    const farFromBridges = (x, y) => bridgePoints.every(p => dist(p[0], p[1], x, y) > 40);
    const inside = (x, y, m) => x > m && y > m && x < grid.W - m && y < grid.H - m;
    scene.rivers.forEach((river, index) => {
        const local = rng.fork(`river:${index}`);
        const count = local.int(0, 2);
        for (let tries = 0, placed = 0; tries < 12 && placed < count; tries++) {
            const i = local.int(2, river.points.length - 3);
            const [x, y] = river.points[i];
            if (river.halfs[i] < 16 || !inside(x, y, 30) || !farFromBridges(x, y)) continue;
            const angle = polylineAngle(river.points, i);
            const lateral = local.range(-0.4, 0.4) * river.halfs[i];
            scene.boats.push({ x: r1(x - Math.sin(angle) * lateral), y: r1(y + Math.cos(angle) * lateral), angle: Math.round(angle * 100) / 100, len: r1(local.range(10, 14)), kind: 'boat' });
            placed++;
        }
    });
    if (scene.sea) {
        const local = rng.fork('sea');
        const count = local.int(3, 6);
        for (let tries = 0, placed = 0; tries < 40 && placed < count; tries++) {
            const x = local.range(30, grid.W - 30);
            const y = local.range(30, grid.H - 30);
            if (!(flagAt(grid, x, y) & F_WATER) || !inside(x, y, 30)) continue;
            const shore = nearestOnPolyline(x, y, scene.sea.coast).distance;
            if (shore < 46 || shore > 240 || !farFromBridges(x, y)) continue;
            if (scene.boats.some(b => dist(b.x, b.y, x, y) < 60)) continue;
            scene.boats.push({ x: r1(x), y: r1(y), angle: Math.round(local.range(0, Math.PI * 2) * 100) / 100, len: r1(local.range(12, 20)), kind: local.chance(0.45) ? 'sail' : 'boat' });
            placed++;
        }
    }
}
