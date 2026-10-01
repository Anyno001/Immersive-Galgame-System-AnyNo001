import { createRandom, createNoise2D } from './seed-random.js';
import { getMapTheme, hexToRgb, shadeColor } from './themes.js';
import { polylineAngle, pointInPolygon } from './geometry.js';
import { drawLandmark, drawCourt, drawParking, drawBoat, drawCar } from './render-landmarks.js';

const TAU = Math.PI * 2;
const BATCH = 400;
// 统一光源：左上方。屋顶受光面、投影方向、水岸内阴影都按它算。
const LIGHT = [-0.55, -0.83];
const Z = { WATER: 1, SAND: 2, PARK: 3, GROVE: 4, FOREST: 5, DENSE: 6, SUBURB: 7, VILLAGE: 8, RURAL: 9 };

export { shadeColor };

const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };

export function strokePolyline(ctx, points) {
    if (!points || points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
}

function tracePolyline(ctx, points) {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
}

function offsetPolyline(points, offset) {
    return points.map((point, i) => {
        const angle = polylineAngle(points, i);
        const d = typeof offset === 'function' ? offset(i) : offset;
        return [point[0] - Math.sin(angle) * d, point[1] + Math.cos(angle) * d];
    });
}

function tracePolygon(ctx, polygon) {
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
    ctx.closePath();
}

// 分步渲染：每个 yield 是一个可让出主线程的切点；调用方按时间预算推进。
function* renderCitySteps(ctx, scene, options = {}) {
    const W = scene.width;
    const H = scene.height;
    const scale = options.scale || 1;
    const pal = getMapTheme(scene.theme, options.palette);
    const seed = options.seed || 1;
    const rng = createRandom(seed).fork('render');
    const createCanvas = typeof options.createCanvas === 'function' ? options.createCanvas : null;
    const world = () => ctx.setTransform(scale, 0, 0, scale, 0, 0);
    world();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    drawGround(ctx, scene, pal, createNoise2D(createRandom(seed).fork('relief').seed), createCanvas);
    drawTufts(ctx, scene, pal, rng.fork('tufts'));
    drawFields(ctx, scene, pal);
    yield 'ground';

    drawWater(ctx, scene, pal, rng.fork('water'));
    for (const boat of scene.boats || []) { world(); drawBoat(ctx, pal, boat); }
    world();
    yield 'water';

    for (const court of scene.courts || []) { world(); drawCourt(ctx, pal, court); }
    for (const lot of scene.parking || []) { world(); drawParking(ctx, pal, lot); }
    world();
    drawBridgeUnderlay(ctx, scene);
    drawRoads(ctx, scene, pal);
    drawRails(ctx, scene, pal);
    drawBridgeRails(ctx, scene, pal);
    for (const car of scene.cars || []) { world(); drawCar(ctx, pal, car); }
    world();
    yield 'roads';

    drawShadows(ctx, scene, pal, scale, createCanvas);
    world();
    yield 'shadows';

    const roofs = pal.roofs.map(base => hexToRgb(base));
    for (let i = 0; i < scene.buildings.length; i++) {
        drawBuilding(ctx, scene.buildings[i], roofs, pal, scale);
        if (i % BATCH === BATCH - 1) yield 'buildings';
    }
    world();
    yield 'buildings';

    drawTrees(ctx, scene.trees, pal);
    yield 'trees';

    for (const landmark of scene.landmarks) {
        world();
        ctx.translate(landmark.x, landmark.y);
        ctx.rotate(landmark.angle);
        drawLandmark(ctx, pal, landmark);
    }
    world();
    yield 'landmarks';

    drawFinish(ctx, W, H, rng.fork('finish'), createCanvas, pal);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    yield 'finish';
}

// ---------- 地面 ----------

// 地面在网格分辨率的小画布上逐格着色（分区底色 + 地势明暗），再平滑放大：分区交界自然晕开。
function drawGround(ctx, scene, pal, relief, createCanvas) {
    const W = scene.width;
    const H = scene.height;
    const ground = scene.ground;
    ctx.fillStyle = pal.paving;
    ctx.fillRect(0, 0, W, H);
    if (!ground) return;
    const { cols, rows, zone, urban } = ground;
    const cell = scene.cell;
    const c = key => hexToRgb(pal[key]);
    const colors = {
        [Z.WATER]: c('bankGround'), [Z.SAND]: c('sand'), [Z.GROVE]: c('forestFloor'), [Z.FOREST]: c('forestFloor'),
        [Z.DENSE]: c('paving'),
    };
    const lawn = [c('lawn'), c('lawnAlt')];
    const suburb = c('suburb');
    const paving = c('paving');
    const meadow = [c('meadow'), c('meadowAlt')];
    const pixel = new Array(cols * rows);
    for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
            const i = r * cols + q;
            const x = q * cell + cell / 2;
            const y = r * cell + cell / 2;
            const z = zone[i];
            const u = urban[i];
            const mottle = relief(x * 0.011 + 40, y * 0.011);
            let rgb;
            if (z === Z.PARK) rgb = mixRgb(lawn[0], lawn[1], 0.5 + mottle * 0.5);
            else if (z === Z.SUBURB) rgb = mixRgb(suburb, paving, smooth(0.34, 0.9, u) * 0.6);
            else if (z === Z.VILLAGE) rgb = mixRgb(meadow[0], suburb, 0.45);
            else if (z === Z.RURAL) rgb = mixRgb(meadow[0], meadow[1], 0.5 + mottle * 0.5);
            else rgb = colors[z] || paving;
            // 地势：同一张噪声取左上与右下两点之差，得到朝左上光源的坡面明暗；城区铺装上减弱。
            const h1 = relief.fbm((x - 10) * 0.0032, (y - 10) * 0.0032, 3);
            const h2 = relief.fbm((x + 10) * 0.0032, (y + 10) * 0.0032, 3);
            const slope = (h1 - h2) * (z === Z.DENSE ? 0 : z === Z.SUBURB ? 0.25 : 1.3);
            const k = 1 + Math.max(-0.055, Math.min(0.055, slope)) + (hash2(q, r) - 0.5) * 0.02;
            pixel[i] = rgb.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
        }
    }
    const small = createCanvas ? createCanvas(cols, rows) : null;
    const sctx = small?.getContext?.('2d');
    if (!sctx) {
        for (let i = 0; i < pixel.length; i++) {
            ctx.fillStyle = `rgb(${pixel[i].join(',')})`;
            ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
        }
        return;
    }
    const image = typeof sctx.createImageData === 'function' ? sctx.createImageData(cols, rows) : null;
    if (image?.data) {
        for (let i = 0; i < pixel.length; i++) {
            image.data[i * 4] = pixel[i][0];
            image.data[i * 4 + 1] = pixel[i][1];
            image.data[i * 4 + 2] = pixel[i][2];
            image.data[i * 4 + 3] = 255;
        }
        sctx.putImageData(image, 0, 0);
    } else {
        for (let i = 0; i < pixel.length; i++) {
            sctx.fillStyle = `rgb(${pixel[i].join(',')})`;
            sctx.fillRect(i % cols, Math.floor(i / cols), 1, 1);
        }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, cols * cell, rows * cell);
}

// 草地细纹：草甸、公园、林下零星短笔触，打破大面积平涂。
function drawTufts(ctx, scene, pal, rng) {
    const ground = scene.ground;
    if (!ground) return;
    const { cols, zone } = ground;
    const cell = scene.cell;
    ctx.lineWidth = 0.9;
    for (const [color, alpha, zones] of [[pal.forestFloor, 0.5, [Z.RURAL, Z.VILLAGE, Z.PARK]], ['#ffffff', 0.22, [Z.RURAL, Z.PARK, Z.VILLAGE]]]) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let i = 0; i < zone.length; i++) {
            if (!zones.includes(zone[i]) || !rng.chance(0.28)) continue;
            const x = (i % cols) * cell + rng.range(0, cell);
            const y = Math.floor(i / cols) * cell + rng.range(0, cell);
            ctx.moveTo(x, y);
            ctx.lineTo(x + rng.range(-1, 1), y - rng.range(1.4, 2.6));
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawFields(ctx, scene, pal) {
    for (const f of scene.fields || []) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle + (f.rows ? Math.PI / 2 : 0));
        const w = f.rows ? f.h : f.w;
        const h = f.rows ? f.w : f.h;
        const base = pal.fields[f.tone % pal.fields.length];
        ctx.fillStyle = base;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = pal.fieldLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = -w / 2 + f.spacing / 2; x < w / 2; x += f.spacing) { ctx.moveTo(x, -h / 2 + 1.5); ctx.lineTo(x, h / 2 - 1.5); }
        ctx.stroke();
        ctx.strokeStyle = shadeColor(base, -0.14);
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
    }
}

// ---------- 水 ----------

function riverPolygon(river) {
    const left = offsetPolyline(river.points, i => river.halfs[i]);
    const right = offsetPolyline(river.points, i => -river.halfs[i]);
    return [...left, ...right.reverse()];
}

// 水体统一管线：岸线（浅岸 + 描边）→ 水面 → 浅水带 → 深水 → 岸下内阴影 → 浪花线。
function waterBody(ctx, pal, trace, deep) {
    ctx.beginPath();
    trace();
    ctx.strokeStyle = pal.bank;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = pal.bankEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = pal.water;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (deep) deep();
    ctx.beginPath();
    trace();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = pal.shallow;
    ctx.lineWidth = 20;
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 8;
    ctx.strokeStyle = shadeColor(pal.shallow, 0.18);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.translate(2.4, 3.4);
    ctx.beginPath();
    trace();
    ctx.strokeStyle = 'rgba(18,48,86,.26)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.translate(-2.4, -3.4);
    ctx.beginPath();
    trace();
    ctx.strokeStyle = pal.foam;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
}

function drawWater(ctx, scene, pal, rng) {
    if (scene.sea) {
        ctx.strokeStyle = pal.sand;
        ctx.lineWidth = scene.sea.beach ? 56 : 20;
        strokePolyline(ctx, scene.sea.coast);
        ctx.strokeStyle = pal.sandWet;
        ctx.lineWidth = 12;
        strokePolyline(ctx, scene.sea.coast);
    }
    for (const river of scene.rivers) {
        const polygon = riverPolygon(river);
        waterBody(ctx, pal, () => tracePolygon(ctx, polygon), () => {
            ctx.strokeStyle = pal.waterDeep;
            ctx.globalAlpha = 0.45;
            for (const k of [1.1, 0.55]) {
                for (let i = 0; i < river.points.length - 1; i++) {
                    ctx.lineWidth = river.halfs[i] * k;
                    ctx.beginPath();
                    ctx.moveTo(river.points[i][0], river.points[i][1]);
                    ctx.lineTo(river.points[i + 1][0], river.points[i + 1][1]);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        });
        ctx.save();
        ctx.beginPath();
        tracePolygon(ctx, polygon);
        ctx.clip();
        drawRipples(ctx, river.points, river.halfs, rng, 1);
        ctx.restore();
    }
    for (const lake of [...scene.lakes, ...(scene.ponds || [])]) {
        waterBody(ctx, pal, () => tracePolygon(ctx, lake.polygon), () => {
            if (!ctx.createRadialGradient) return;
            const g = ctx.createRadialGradient(lake.x, lake.y, 0, lake.x, lake.y, (lake.r || 40) * 1.1);
            g.addColorStop(0, pal.waterDeep);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.globalAlpha = 0.7;
            ctx.fillRect(lake.x - 200, lake.y - 200, 400, 400);
            ctx.globalAlpha = 1;
        });
        ctx.save();
        ctx.beginPath();
        tracePolygon(ctx, lake.polygon);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.lineWidth = 1.1;
        for (let k = 0; k < Math.max(1, Math.round((lake.r || 30) / 16)); k++) {
            const x = lake.x + rng.range(-0.5, 0.5) * lake.r;
            const y = lake.y + rng.range(-0.4, 0.4) * lake.r;
            ctx.beginPath();
            ctx.arc(x, y + 6, 7, -Math.PI * 0.72, -Math.PI * 0.28);
            ctx.stroke();
        }
        ctx.restore();
    }
    if (scene.sea) drawSea(ctx, scene, pal, rng);
}

function drawSea(ctx, scene, pal, rng) {
    const { sea, width: W, height: H } = scene;
    const coast = sea.coast;
    const toSea = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[sea.side];
    waterBody(ctx, pal, () => tracePolygon(ctx, sea.polygon), () => {
        if (!ctx.createLinearGradient) return;
        const mean = coast.reduce((sum, p) => [sum[0] + p[0] / coast.length, sum[1] + p[1] / coast.length], [0, 0]);
        const far = [mean[0] + toSea[0] * 260, mean[1] + toSea[1] * 260];
        const g = ctx.createLinearGradient(mean[0], mean[1], far[0], far[1]);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, pal.waterDeep);
        ctx.fillStyle = g;
        ctx.fillRect(-50, -50, W + 100, H + 100);
    });
    // 等深浪线：与海岸平行的几道细线，越远越淡，是手绘地图常见的海面写法。
    const probe = offsetPolyline(coast, 10)[Math.floor(coast.length / 2)];
    const sign = pointInPolygon(probe[0], probe[1], sea.polygon) ? 1 : -1;
    ctx.save();
    ctx.beginPath();
    tracePolygon(ctx, sea.polygon);
    ctx.clip();
    ctx.strokeStyle = '#ffffff';
    for (const [d, alpha, dash] of [[16, 0.42, [18, 7]], [34, 0.28, [26, 12]], [60, 0.18, [34, 18]], [96, 0.1, [40, 26]]]) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.3;
        ctx.setLineDash?.(dash);
        ctx.lineDashOffset = rng.range(0, 40);
        strokePolyline(ctx, offsetPolyline(coast, d * sign));
    }
    ctx.setLineDash?.([]);
    ctx.globalAlpha = 1;
    ctx.restore();
}

// 河面水纹：顺流方向的短弧线，只在水面剪裁区内绘制。
function drawRipples(ctx, points, halfs, rng, density) {
    ctx.strokeStyle = 'rgba(255,255,255,.26)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 1; i < points.length - 2; i++) {
        if (!rng.chance(0.5 * density)) continue;
        const angle = polylineAngle(points, i);
        const lateral = rng.range(-0.6, 0.6) * halfs[i];
        const len = rng.range(6, 15);
        const x = points[i][0] - Math.sin(angle) * lateral;
        const y = points[i][1] + Math.cos(angle) * lateral;
        const bow = rng.range(-1.2, 1.2);
        ctx.moveTo(x - Math.cos(angle) * len / 2, y - Math.sin(angle) * len / 2);
        ctx.quadraticCurveTo(x - Math.sin(angle) * bow, y + Math.cos(angle) * bow, x + Math.cos(angle) * len / 2, y + Math.sin(angle) * len / 2);
    }
    ctx.stroke();
}

// ---------- 道路 ----------

function drawBridgeUnderlay(ctx, scene) {
    for (const bridge of scene.bridges) {
        ctx.save();
        ctx.translate(3, 5);
        ctx.strokeStyle = 'rgba(14,34,64,.3)';
        ctx.lineWidth = bridge.width + 5;
        strokePolyline(ctx, bridge.points);
        ctx.restore();
    }
}

function strokeAll(ctx, list, color, width) {
    if (!list.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const item of list) if (item.points.length > 1) tracePolyline(ctx, item.points);
    ctx.stroke();
}

function drawRoads(ctx, scene, pal) {
    const arterials = scene.mainRoads.filter(road => road.kind !== 'link');
    const links = scene.mainRoads.filter(road => road.kind === 'link');
    strokeAll(ctx, scene.paths, pal.pathEdge, 4.2);
    strokeAll(ctx, scene.paths, pal.path, 2.5);
    strokeAll(ctx, scene.lanes, pal.laneEdge, 5.4);
    strokeAll(ctx, scene.lanes, pal.lane, 3.4);
    ctx.save();
    ctx.translate(0.8, 1.4);
    strokeAll(ctx, [...scene.streets, ...links, ...arterials], 'rgba(40,40,64,.10)', 12);
    ctx.restore();
    strokeAll(ctx, scene.streets, pal.streetEdge, 9.4);
    strokeAll(ctx, links, pal.linkEdge, 12);
    strokeAll(ctx, arterials, pal.roadEdge, 17.5);
    strokeAll(ctx, scene.streets, pal.street, 7);
    strokeAll(ctx, links, pal.link, 9.4);
    strokeAll(ctx, arterials, pal.road, 14);
    ctx.setLineDash?.([6, 7]);
    strokeAll(ctx, arterials, pal.roadLine, 0.9);
    ctx.setLineDash?.([]);
}

function drawRails(ctx, scene, pal) {
    for (const rail of scene.rails) {
        ctx.strokeStyle = shadeColor(pal.railBed, -0.12);
        ctx.lineWidth = 16;
        strokePolyline(ctx, rail.points);
        ctx.strokeStyle = pal.railBed;
        ctx.lineWidth = 13;
        strokePolyline(ctx, rail.points);
        ctx.strokeStyle = pal.tie;
        ctx.lineWidth = 1.5;
        const angle = rail.angle + Math.PI / 2;
        ctx.beginPath();
        for (let i = 0; i < rail.points.length - 1; i++) {
            for (const t of [0, 0.5]) {
                const x = rail.points[i][0] + (rail.points[i + 1][0] - rail.points[i][0]) * t;
                const y = rail.points[i][1] + (rail.points[i + 1][1] - rail.points[i][1]) * t;
                ctx.moveTo(x - Math.cos(angle) * 5.5, y - Math.sin(angle) * 5.5);
                ctx.lineTo(x + Math.cos(angle) * 5.5, y + Math.sin(angle) * 5.5);
            }
        }
        ctx.stroke();
        ctx.strokeStyle = pal.rail;
        ctx.lineWidth = 1.2;
        for (const side of [-3, 3]) strokePolyline(ctx, offsetPolyline(rail.points, side));
    }
}

function drawBridgeRails(ctx, scene, pal) {
    for (const bridge of scene.bridges) {
        for (const side of [-1, 1]) {
            const rail = offsetPolyline(bridge.points, side * (bridge.width / 2 + 1.2));
            ctx.strokeStyle = 'rgba(70,66,60,.85)';
            ctx.lineWidth = 2.2;
            strokePolyline(ctx, rail);
            ctx.strokeStyle = pal.white;
            ctx.lineWidth = 1;
            strokePolyline(ctx, rail);
        }
    }
}

// ---------- 投影 ----------

// 建筑与树的投影先画到半分辨率画布，再整体低透明度叠回：天然柔边，重叠处也不会越叠越黑。
function drawShadows(ctx, scene, pal, scale, createCanvas) {
    const W = scene.width;
    const H = scene.height;
    const k = scale * 0.5;
    const layer = createCanvas ? createCanvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))) : null;
    const sctx = layer?.getContext?.('2d');
    const target = sctx || ctx;
    const base = sctx ? [k, 0, 0, k, 0, 0] : [scale, 0, 0, scale, 0, 0];
    target.setTransform(...base);
    target.fillStyle = sctx ? pal.shadow : 'rgba(38,42,70,.2)';
    for (const b of scene.buildings) {
        const len = b.dense ? 2 + b.level * 2.4 : 2.6;
        for (const t of [0.34, 0.67, 1]) {
            target.setTransform(...base);
            target.translate(b.x - LIGHT[0] * len * t, b.y - LIGHT[1] * len * t);
            target.rotate(b.angle);
            target.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
    }
    target.setTransform(...base);
    target.beginPath();
    for (const t of scene.trees) {
        const x = t.x + t.r * 0.38;
        const y = t.y + t.r * 0.58;
        target.moveTo(x + t.r, y);
        target.arc(x, y, t.r * 0.96, 0, TAU);
    }
    target.fill();
    if (!sctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = pal.shadowAlpha ?? (pal.shadow === '#07090f' ? 0.45 : 0.24);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, 0, 0, W, H);
    ctx.globalAlpha = 1;
}

// ---------- 建筑 ----------

const faceLight = (angle, nx, ny) => {
    const wx = nx * Math.cos(angle) - ny * Math.sin(angle);
    const wy = nx * Math.sin(angle) + ny * Math.cos(angle);
    return wx * LIGHT[0] + wy * LIGHT[1];
};
const tone = (rgb, amount) => `rgb(${rgb.map(c => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))).join(',')})`;

function drawBuilding(ctx, b, roofs, pal, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    if (b.kind === 'flat') drawFlat(ctx, b, pal);
    else drawHouse(ctx, b, roofs[b.tone % roofs.length], pal);
}

function drawHouse(ctx, b, rgb, pal) {
    const { w, h, detail } = b;
    const x = -w / 2;
    const y = -h / 2;
    const shade = b.shade * 0.05;
    // 附屋：约三成房子在一端带一间矮一截的平顶附屋，打破“一排同样的小方块”。
    const annex = detail % 10 < 3 && w > 10.5;
    const mw = annex ? w * 0.7 : w;
    if (annex) {
        ctx.fillStyle = tone(hexToRgb(pal.flats[detail % pal.flats.length]), -0.04);
        ctx.fillRect(x + mw, y + h * 0.15, w - mw, h * 0.7);
        ctx.strokeStyle = 'rgba(60,56,52,.45)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x + mw, y + h * 0.15, w - mw, h * 0.7);
    }
    const hip = detail % 3 === 0 && Math.max(mw, h) / Math.min(mw, h) < 1.35;
    if (hip) {
        const inset = Math.min(mw, h) * 0.32;
        const cx = x + mw / 2;
        const faces = [
            [[x, y], [x + mw, y], [cx + mw / 2 - inset, 0], [cx - mw / 2 + inset, 0], 0, -1],
            [[x, y + h], [x + mw, y + h], [cx + mw / 2 - inset, 0], [cx - mw / 2 + inset, 0], 0, 1],
            [[x, y], [x, y + h], [cx - mw / 2 + inset, 0], null, -1, 0],
            [[x + mw, y], [x + mw, y + h], [cx + mw / 2 - inset, 0], null, 1, 0],
        ];
        for (const [a, bb, c, d, nx, ny] of faces) {
            ctx.fillStyle = tone(rgb, faceLight(b.angle, nx, ny) * 0.22 + shade);
            ctx.beginPath();
            ctx.moveTo(...a); ctx.lineTo(...bb); ctx.lineTo(...c); if (d) ctx.lineTo(...d);
            ctx.closePath();
            ctx.fill();
        }
        ctx.strokeStyle = tone(rgb, 0.35);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx - mw / 2 + inset, 0); ctx.lineTo(cx + mw / 2 - inset, 0);
        ctx.stroke();
    } else {
        const alongU = mw >= h;
        const lit = faceLight(b.angle, alongU ? 0 : -1, alongU ? -1 : 0);
        const a = tone(rgb, 0.04 + lit * 0.2 + shade);
        const c = tone(rgb, 0.04 - lit * 0.2 + shade);
        ctx.fillStyle = a;
        if (alongU) ctx.fillRect(x, y, mw, h / 2); else ctx.fillRect(x, y, mw / 2, h);
        ctx.fillStyle = c;
        if (alongU) ctx.fillRect(x, 0, mw, h / 2); else ctx.fillRect(x + mw / 2, y, mw / 2, h);
        ctx.strokeStyle = tone(rgb, 0.36);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        if (alongU) { ctx.moveTo(x + 1, 0); ctx.lineTo(x + mw - 1, 0); } else { ctx.moveTo(x + mw / 2, y + 1); ctx.lineTo(x + mw / 2, y + h - 1); }
        ctx.stroke();
        if (detail % 9 === 4 && alongU && mw > 9) {
            // 太阳能板：铺在受光的半坡上。
            const py = lit > 0 ? y + 1.2 : 1.2;
            ctx.fillStyle = pal.solar;
            ctx.fillRect(x + 2, py, mw * 0.5, h / 2 - 2.4);
            ctx.strokeStyle = 'rgba(255,255,255,.35)';
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            for (let k = 1; k < 3; k++) { ctx.moveTo(x + 2 + mw * 0.5 * k / 3, py); ctx.lineTo(x + 2 + mw * 0.5 * k / 3, py + h / 2 - 2.4); }
            ctx.stroke();
        }
    }
    if (detail % 4 === 1) {
        ctx.fillStyle = tone(rgb, -0.4);
        ctx.fillRect(x + mw * 0.72, y + h * 0.18, 1.8, 1.8);
    }
    ctx.strokeStyle = tone(rgb, -0.38);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x, y, mw, h);
}

function drawFlat(ctx, b, pal) {
    const { w, h, detail } = b;
    const x = -w / 2;
    const y = -h / 2;
    const rgb = hexToRgb(pal.flats[b.tone % pal.flats.length]);
    ctx.fillStyle = tone(rgb, b.shade * 0.05 + b.level * 0.015);
    ctx.fillRect(x, y, w, h);
    // 女儿墙：外圈亮边 + 内侧一道暗线，俯视时读作有厚度的屋面。
    ctx.strokeStyle = tone(rgb, 0.3);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = tone(rgb, -0.12);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x + 2.2, y + 2.2, w - 4.4, h - 4.4);
    if (detail % 7 === 0 && w > 16 && h > 14) {
        ctx.fillStyle = pal.roofGarden;
        ctx.fillRect(x + 3.5, y + 3.5, w - 7, h - 7);
        ctx.fillStyle = shadeColor(pal.roofGarden, -0.25);
        for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(x + 5 + ((detail * (k + 3)) % Math.max(1, w - 10)), y + 5 + ((detail * (k + 7)) % Math.max(1, h - 10)), 1.8, 0, TAU);
            ctx.fill();
        }
    } else {
        const units = 1 + (detail % 3);
        for (let k = 0; k < units; k++) {
            const ux = x + 4 + ((detail * (k * 7 + 3)) % Math.max(1, w - 11));
            const uy = y + 4 + ((detail * (k * 5 + 11)) % Math.max(1, h - 10));
            const uw = 3 + ((detail + k) % 3);
            const uh = 2.6 + ((detail + k * 2) % 2);
            ctx.fillStyle = 'rgba(40,44,60,.22)';
            ctx.fillRect(ux + 0.8, uy + 1, uw, uh);
            ctx.fillStyle = tone(rgb, -0.2);
            ctx.fillRect(ux, uy, uw, uh);
            ctx.fillStyle = tone(rgb, 0.12);
            ctx.fillRect(ux, uy, uw, 0.8);
        }
        if (detail % 11 === 5 && w > 14) {
            ctx.fillStyle = tone(rgb, -0.16);
            ctx.beginPath();
            ctx.arc(x + w - 5, y + 5, 2.4, 0, TAU);
            ctx.fill();
        }
    }
    ctx.strokeStyle = tone(rgb, -0.36);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x, y, w, h);
}

// ---------- 树 ----------

// 每棵树是 3 个错位圆瓣拼成的团状树冠：暗底 → 中间色（向光源偏移）→ 高光；
// 同色一次性填充，相邻树冠自然融成一片林冠。
function drawTrees(ctx, trees, pal) {
    const palettes = [...pal.trees, pal.accentTrees];
    const lobes = trees.map(t => {
        const a0 = hash2(t.x, t.y) * TAU;
        return [0, 1, 2].map(k => [t.x + Math.cos(a0 + k * 2.1) * t.r * 0.34, t.y + Math.sin(a0 + k * 2.1) * t.r * 0.34]);
    });
    const passes = [[0, 0.66, 0, 0, 0.84], [1, 0.54, -0.14, -0.17, 0.66], [2, 0.26, -0.3, -0.36, 0.28]];
    for (const [layer, lobeR, dx, dy, coreR] of passes) {
        for (let p = 0; p < palettes.length; p++) {
            ctx.fillStyle = palettes[p][layer];
            ctx.beginPath();
            trees.forEach((t, i) => {
                if (Math.min(t.tone, palettes.length - 1) !== p) return;
                const ox = t.r * dx;
                const oy = t.r * dy;
                ctx.moveTo(t.x + ox + t.r * coreR, t.y + oy);
                ctx.arc(t.x + ox, t.y + oy, t.r * coreR, 0, TAU);
                if (layer === 2) return;
                for (const [lx, ly] of lobes[i]) {
                    ctx.moveTo(lx + ox + t.r * lobeR, ly + oy);
                    ctx.arc(lx + ox, ly + oy, t.r * lobeR, 0, TAU);
                }
            });
            ctx.fill();
        }
    }
}

// ---------- 收尾 ----------

// 收尾层默认值即原暮色版；调色板可用 finish 覆盖（明亮版去掉暗角与深色颗粒）。
const CLASSIC_FINISH = Object.freeze({ glow: 'rgba(255,246,222,.12)', dusk: 'rgba(24,28,48,.07)', vignette: 'rgba(30,30,50,.14)', grainLight: 0.5, grainMin: 0.04, grainMax: 0.12 });

function drawFinish(ctx, W, H, rng, createCanvas, pal) {
    const fx = pal?.finish || CLASSIC_FINISH;
    if (ctx.createLinearGradient) {
        const light = ctx.createLinearGradient(0, 0, W, H);
        light.addColorStop(0, fx.glow);
        light.addColorStop(0.55, 'rgba(255,246,222,0)');
        light.addColorStop(1, fx.dusk);
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, W, H);
    }
    if (ctx.createRadialGradient) {
        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.6);
        vignette.addColorStop(0, 'rgba(30,30,50,0)');
        vignette.addColorStop(1, fx.vignette);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
    }
    // 纸面颗粒：小噪点贴图平铺，打散大面积纯色的“电脑感”。
    const tile = createCanvas ? createCanvas(128, 128) : null;
    const tctx = tile?.getContext?.('2d');
    if (!tctx || !ctx.createPattern) return;
    for (let k = 0; k < 1400; k++) {
        const v = rng.chance(fx.grainLight) ? 255 : 0;
        tctx.fillStyle = `rgba(${v},${v},${v},${rng.range(fx.grainMin, fx.grainMax)})`;
        tctx.fillRect(rng.int(0, 127), rng.int(0, 127), 1, 1);
    }
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
}

// 夜间灯光图：黑底 + 叠加光斑，由光照层以 screen 混合叠到底图上。
export function renderLightSteps(ctx, lights, width, height, options = {}) {
    const scale = options.scale || 1;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const sprite = typeof options.createCanvas === 'function' ? options.createCanvas(64, 64) : null;
    const sctx = sprite?.getContext?.('2d');
    if (sctx && sctx.createRadialGradient) {
        const gradient = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,236,190,1)');
        gradient.addColorStop(0.12, 'rgba(255,210,140,.75)');
        gradient.addColorStop(0.4, 'rgba(255,180,100,.16)');
        gradient.addColorStop(1, 'rgba(255,160,80,0)');
        sctx.fillStyle = gradient;
        sctx.fillRect(0, 0, 64, 64);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const light of lights) {
        ctx.globalAlpha = light.a;
        if (sctx) ctx.drawImage(sprite, light.x - light.r, light.y - light.r, light.r * 2, light.r * 2);
        else { ctx.fillStyle = 'rgba(255,200,130,.35)'; ctx.fillRect(light.x - light.r / 3, light.y - light.r / 3, light.r * 0.66, light.r * 0.66); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export { renderCitySteps };
