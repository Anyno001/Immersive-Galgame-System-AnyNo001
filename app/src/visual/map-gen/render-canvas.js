import { createRandom } from './seed-random.js';
import { getMapTheme } from './themes.js';
import { polylineAngle } from './geometry.js';

const TAU = Math.PI * 2;
const BATCH = 500;

function hexToRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function shadeColor(hex, amount) {
    const rgb = hexToRgb(hex).map(c => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)));
    return `rgb(${rgb.join(',')})`;
}

function strokePolyline(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
}

function offsetPolyline(points, offset) {
    return points.map((point, i) => {
        const angle = polylineAngle(points, i);
        return [point[0] - Math.sin(angle) * offset, point[1] + Math.cos(angle) * offset];
    });
}

function fillPolygon(ctx, polygon) {
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
    ctx.closePath();
}

// 分步渲染：每个 yield 是一个可让出主线程的切点；调用方按时间预算推进。
function* renderCitySteps(ctx, scene, options = {}) {
    const W = scene.width;
    const H = scene.height;
    const scale = options.scale || 1;
    const pal = getMapTheme(scene.theme);
    const rng = createRandom(options.seed || 1).fork('render');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pal.groundAlt;
    for (let k = 0; k < 60; k++) {
        ctx.beginPath();
        ctx.ellipse(rng.range(0, W), rng.range(0, H), rng.range(40, 160), rng.range(30, 110), rng.range(0, Math.PI), 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawLawn(ctx, scene, pal, rng, options.createCanvas);
    yield 'ground';

    drawWater(ctx, scene, pal, rng);
    yield 'water';

    drawPaths(ctx, scene, pal);
    drawBridgeUnderlay(ctx, scene);
    drawRoads(ctx, scene, pal);
    drawRails(ctx, scene, pal);
    drawBridgeRails(ctx, scene);
    yield 'roads';

    ctx.fillStyle = pal.pad;
    for (const pad of scene.pads) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.translate(pad.x, pad.y);
        ctx.rotate(pad.angle);
        ctx.fillRect(-pad.w / 2, -pad.h / 2, pad.w, pad.h);
    }
    ctx.fillStyle = pal.shadow;
    for (let i = 0; i < scene.buildings.length; i++) {
        const b = scene.buildings[i];
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.translate(b.x + 2.4, b.y + 3.2);
        ctx.rotate(b.angle);
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    yield 'shadows';
    const roofs = pal.roofs.map(base => ({ lit: shadeColor(base, 0.14), dark: shadeColor(base, -0.1), edge: shadeColor(base, -0.3), ridge: shadeColor(base, 0.3) }));
    for (let i = 0; i < scene.buildings.length; i++) {
        drawBuilding(ctx, scene.buildings[i], roofs, pal, scale, i);
        if (i % BATCH === BATCH - 1) yield 'buildings';
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    yield 'buildings';

    drawTrees(ctx, scene.trees, pal);
    yield 'trees';

    for (const landmark of scene.landmarks) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.translate(landmark.x, landmark.y);
        ctx.rotate(landmark.angle);
        (LANDMARKS[landmark.kind] || LANDMARKS.generic)(ctx, pal, landmark);
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    yield 'landmarks';

    drawFinish(ctx, W, H, rng, options.createCanvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    yield 'finish';
}

function drawLawn(ctx, scene, pal, rng, createCanvas) {
    if (!scene.lawn.length) return;
    const cols = Math.ceil(scene.width / scene.cell);
    const rows = Math.ceil(scene.height / scene.cell);
    const colors = [pal.lawn, pal.lawnAlt];
    // 在网格分辨率的小画布上逐格着色，再平滑放大：边缘自然柔化，也顺带得到草地明暗斑驳。
    const mask = typeof createCanvas === 'function' ? createCanvas(cols, rows) : null;
    const mctx = mask?.getContext?.('2d');
    if (!mctx) {
        ctx.fillStyle = pal.lawn;
        for (const index of scene.lawn) ctx.fillRect((index % cols) * scene.cell, Math.floor(index / cols) * scene.cell, scene.cell, scene.cell);
        return;
    }
    for (const index of scene.lawn) {
        mctx.fillStyle = colors[rng.chance(0.35) ? 1 : 0];
        mctx.fillRect(index % cols, Math.floor(index / cols), 1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mask, 0, 0, cols * scene.cell, rows * scene.cell);
}

function drawWater(ctx, scene, pal, rng) {
    for (const lake of scene.lakes) {
        ctx.strokeStyle = pal.bank;
        ctx.lineWidth = 8;
        fillPolygon(ctx, lake.polygon);
        ctx.stroke();
        ctx.fillStyle = pal.water;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = pal.waterEdge;
        ctx.lineWidth = 18;
        ctx.stroke();
        ctx.restore();
    }
    for (const river of scene.rivers) {
        const passes = [[pal.bankEdge, 11], [pal.bank, 8], [pal.waterEdge, 0], [pal.water, -0.28], [pal.waterDeep, -0.62]];
        for (const [color, extra] of passes) {
            ctx.strokeStyle = color;
            for (let i = 0; i < river.points.length - 1; i++) {
                const half = river.halfs[i];
                ctx.lineWidth = extra >= 0 ? half * 2 + extra : half * 2 * (1 + extra);
                ctx.beginPath();
                ctx.moveTo(river.points[i][0], river.points[i][1]);
                ctx.lineTo(river.points[i + 1][0], river.points[i + 1][1]);
                ctx.stroke();
            }
        }
        drawRipples(ctx, river.points, river.halfs, rng);
    }
    if (scene.sea) {
        ctx.strokeStyle = pal.sand;
        ctx.lineWidth = scene.sea.beach ? 60 : 22;
        strokePolyline(ctx, scene.sea.coast);
        ctx.strokeStyle = pal.bank;
        ctx.lineWidth = 6;
        if (!scene.sea.beach) strokePolyline(ctx, scene.sea.coast);
        ctx.fillStyle = pal.waterDeep;
        fillPolygon(ctx, scene.sea.polygon);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = pal.water;
        ctx.lineWidth = 90;
        strokePolyline(ctx, scene.sea.coast);
        ctx.strokeStyle = pal.waterEdge;
        ctx.lineWidth = 34;
        strokePolyline(ctx, scene.sea.coast);
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 3;
        strokePolyline(ctx, scene.sea.coast);
        ctx.restore();
        const halfs = scene.sea.coast.map(() => 60);
        drawRipples(ctx, offsetPolyline(scene.sea.coast, 0), halfs, rng, 0.4);
    }
}

function drawRipples(ctx, points, halfs, rng, density = 1) {
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < points.length - 2; i++) {
        if (!rng.chance(0.55 * density)) continue;
        const angle = polylineAngle(points, i);
        const lateral = rng.range(-0.7, 0.7) * halfs[i];
        const len = rng.range(6, 16);
        const x = points[i][0] - Math.sin(angle) * lateral;
        const y = points[i][1] + Math.cos(angle) * lateral;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(angle) * len / 2, y - Math.sin(angle) * len / 2);
        ctx.lineTo(x + Math.cos(angle) * len / 2, y + Math.sin(angle) * len / 2);
        ctx.stroke();
    }
}

function drawPaths(ctx, scene, pal) {
    for (const [color, width] of [[pal.pathEdge, 6], [pal.path, 4]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (const path of scene.paths) strokePolyline(ctx, path.points);
    }
    for (const plaza of scene.plazas) {
        ctx.beginPath();
        ctx.arc(plaza.x, plaza.y, plaza.r, 0, TAU);
        ctx.fillStyle = pal.plaza;
        ctx.fill();
        ctx.strokeStyle = pal.plazaEdge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(plaza.x, plaza.y, plaza.r * 0.3, 0, TAU);
        ctx.fillStyle = pal.waterEdge;
        ctx.fill();
    }
}

function drawBridgeUnderlay(ctx, scene) {
    for (const bridge of scene.bridges) {
        ctx.strokeStyle = 'rgba(10,30,60,.28)';
        ctx.lineWidth = bridge.width + 6;
        ctx.save();
        ctx.translate(4, 6);
        strokePolyline(ctx, bridge.points);
        ctx.restore();
        ctx.fillStyle = 'rgba(40,50,60,.55)';
        for (let i = 1; i < bridge.points.length - 1; i += 3) {
            ctx.beginPath();
            ctx.arc(bridge.points[i][0] + 3, bridge.points[i][1] + 5, bridge.width * 0.28, 0, TAU);
            ctx.fill();
        }
    }
}

function drawRoads(ctx, scene, pal) {
    ctx.strokeStyle = pal.streetEdge;
    ctx.lineWidth = 9;
    for (const street of scene.streets) strokePolyline(ctx, street.points);
    ctx.strokeStyle = pal.roadEdge;
    for (const road of scene.mainRoads) {
        ctx.lineWidth = road.width + 4;
        strokePolyline(ctx, road.points);
    }
    ctx.strokeStyle = pal.street;
    ctx.lineWidth = 6.5;
    for (const street of scene.streets) strokePolyline(ctx, street.points);
    ctx.strokeStyle = pal.road;
    for (const road of scene.mainRoads) {
        ctx.lineWidth = road.width;
        strokePolyline(ctx, road.points);
    }
}

function drawRails(ctx, scene, pal) {
    for (const rail of scene.rails) {
        ctx.strokeStyle = pal.railBed;
        ctx.lineWidth = 15;
        strokePolyline(ctx, rail.points);
        ctx.strokeStyle = pal.tie;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < rail.points.length - 1; i++) {
            for (const t of [0, 0.5]) {
                const x = rail.points[i][0] + (rail.points[i + 1][0] - rail.points[i][0]) * t;
                const y = rail.points[i][1] + (rail.points[i + 1][1] - rail.points[i][1]) * t;
                const angle = rail.angle + Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(x - Math.cos(angle) * 6, y - Math.sin(angle) * 6);
                ctx.lineTo(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
                ctx.stroke();
            }
        }
        ctx.strokeStyle = pal.rail;
        ctx.lineWidth = 1.3;
        for (const side of [-3.2, 3.2]) strokePolyline(ctx, offsetPolyline(rail.points, side));
    }
}

function drawBridgeRails(ctx, scene) {
    ctx.strokeStyle = 'rgba(96,92,84,.9)';
    ctx.lineWidth = 1.4;
    for (const bridge of scene.bridges) {
        for (const side of [-1, 1]) strokePolyline(ctx, offsetPolyline(bridge.points, side * (bridge.width / 2 + 1)));
    }
}

function drawBuilding(ctx, b, roofs, pal, scale, index) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    const x = -b.w / 2;
    const y = -b.h / 2;
    if (b.kind === 'flat') {
        ctx.fillStyle = shadeColor(pal.flat, b.shade * 0.06);
        ctx.fillRect(x, y, b.w, b.h);
        ctx.fillStyle = pal.flatInner;
        ctx.fillRect(x + 3, y + 3, b.w - 6, b.h - 6);
        ctx.fillStyle = shadeColor(pal.flat, -0.18);
        for (let k = 0; k < 1 + (index % 3); k++) ctx.fillRect(x + 6 + ((index * 7 + k * 13) % Math.max(1, b.w - 16)), y + 6 + ((index * 5 + k * 11) % Math.max(1, b.h - 14)), 5, 4);
        ctx.strokeStyle = shadeColor(pal.flat, -0.3);
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x, y, b.w, b.h);
        return;
    }
    const roof = roofs[b.tone % roofs.length];
    // 屋脊沿长边：朝左上的半坡受光，另半坡背光，俯视时形成体积感。
    if (b.w >= b.h) {
        ctx.fillStyle = roof.lit;
        ctx.fillRect(x, y, b.w, b.h / 2);
        ctx.fillStyle = roof.dark;
        ctx.fillRect(x, 0, b.w, b.h / 2);
    } else {
        ctx.fillStyle = roof.lit;
        ctx.fillRect(x, y, b.w / 2, b.h);
        ctx.fillStyle = roof.dark;
        ctx.fillRect(0, y, b.w / 2, b.h);
    }
    ctx.strokeStyle = roof.ridge;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    if (b.w >= b.h) { ctx.moveTo(x + 1.5, 0); ctx.lineTo(-x - 1.5, 0); } else { ctx.moveTo(0, y + 1.5); ctx.lineTo(0, -y - 1.5); }
    ctx.stroke();
    ctx.strokeStyle = roof.edge;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, b.w, b.h);
}

function drawTrees(ctx, trees, pal) {
    ctx.fillStyle = 'rgba(30,50,30,.28)';
    ctx.beginPath();
    for (const t of trees) { ctx.moveTo(t.x + 2 + t.r, t.y + 3); ctx.arc(t.x + 2, t.y + 3, t.r, 0, TAU); }
    ctx.fill();
    for (const [layer, scaleR, dx, dy] of [[0, 1, 0, 0], [1, 0.76, -0.14, -0.14], [2, 0.4, -0.32, -0.34]]) {
        for (let tone = 0; tone < pal.trees.length; tone++) {
            ctx.fillStyle = pal.trees[tone][layer];
            ctx.beginPath();
            for (const t of trees) {
                if (t.tone !== tone) continue;
                const r = t.r * scaleR;
                ctx.moveTo(t.x + t.r * dx + r, t.y + t.r * dy);
                ctx.arc(t.x + t.r * dx, t.y + t.r * dy, r, 0, TAU);
            }
            ctx.fill();
        }
    }
}

function roofRect(ctx, x, y, w, h, base) {
    ctx.fillStyle = shadeColor(base, 0.12);
    ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = shadeColor(base, -0.1);
    ctx.fillRect(x, y + h / 2, w, h / 2);
    ctx.strokeStyle = shadeColor(base, -0.32);
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x, y, w, h);
}

function tree(ctx, pal, x, y, r) {
    const [dark, mid, light] = pal.trees[0];
    ctx.fillStyle = 'rgba(30,50,30,.28)';
    ctx.beginPath(); ctx.arc(x + 2, y + 3, r, 0, TAU); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(x - r * 0.14, y - r * 0.14, r * 0.76, 0, TAU); ctx.fill();
    ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.4, 0, TAU); ctx.fill();
}

function plaza(ctx, pal, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = pal.plaza;
    ctx.fill();
    ctx.strokeStyle = pal.plazaEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// 地标图元在局部坐标系下绘制（原点为指针位置，x 轴沿最近道路方向）。
const LANDMARKS = {
    school(ctx, pal) {
        ctx.fillStyle = pal.field;
        ctx.fillRect(-40, 4, 80, 44);
        ctx.strokeStyle = pal.track;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(0, 26, 30, 14, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(0, 26, 30, 14, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-38 + 3, -42 + 4, 76, 16);
        ctx.fillRect(-38 + 3, -42 + 4, 16, 40);
        ctx.fillRect(22 + 3, -42 + 4, 16, 40);
        roofRect(ctx, -38, -42, 76, 16, pal.brick);
        roofRect(ctx, -38, -26, 16, 24, pal.brick);
        roofRect(ctx, 22, -26, 16, 24, pal.brick);
    },
    park(ctx, pal) {
        plaza(ctx, pal, 11);
        ctx.fillStyle = pal.waterEdge;
        ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
    },
    shrine(ctx, pal) {
        ctx.fillStyle = pal.plaza;
        ctx.fillRect(-4, -4, 8, 34);
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-11 + 2, -24 + 3, 22, 18);
        roofRect(ctx, -11, -24, 22, 18, '#5a4a45');
        ctx.fillStyle = pal.torii;
        ctx.fillRect(-10, 20, 20, 2.6);
        ctx.fillRect(-8, 24, 16, 1.8);
        ctx.fillRect(-7, 20, 2.4, 8);
        ctx.fillRect(4.6, 20, 2.4, 8);
    },
    station(ctx, pal) {
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-58 + 3, -13 + 4, 116, 8);
        ctx.fillRect(-58 + 3, 5 + 4, 116, 8);
        roofRect(ctx, -58, -13, 116, 8, '#c9c4b8');
        roofRect(ctx, -58, 5, 116, 8, '#c9c4b8');
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-22 + 3, -38 + 4, 44, 20);
        roofRect(ctx, -22, -38, 44, 20, '#8a95a6');
        ctx.fillStyle = pal.plaza;
        ctx.fillRect(-16, -52, 32, 12);
    },
    tower(ctx, pal) {
        plaza(ctx, pal, 30);
        ctx.strokeStyle = pal.plazaEdge;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke();
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-7 + 4, -7 + 5, 14, 14);
        const base = '#8a7b6c';
        const tri = (color, pts) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.closePath(); ctx.fill(); };
        tri(shadeColor(base, 0.2), [[-7, -7], [7, -7]]);
        tri(shadeColor(base, 0.05), [[-7, -7], [-7, 7]]);
        tri(shadeColor(base, -0.12), [[7, -7], [7, 7]]);
        tri(shadeColor(base, -0.22), [[-7, 7], [7, 7]]);
    },
    castle(ctx, pal) {
        ctx.fillStyle = pal.lawn;
        ctx.fillRect(-40, -40, 80, 80);
        ctx.strokeStyle = pal.stone;
        ctx.lineWidth = 6;
        ctx.strokeRect(-40, -40, 80, 80);
        ctx.fillStyle = pal.stone;
        for (const [cx, cy] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) { ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); }
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-17 + 3, -15 + 4, 34, 30);
        roofRect(ctx, -17, -15, 34, 30, '#6e7a8e');
    },
    hospital(ctx, pal) {
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-26 + 3, -8 + 4, 52, 16);
        ctx.fillRect(-8 + 3, -26 + 4, 16, 52);
        ctx.fillStyle = pal.white;
        ctx.fillRect(-26, -8, 52, 16);
        ctx.fillRect(-8, -26, 16, 52);
        ctx.fillStyle = '#d64a3c';
        ctx.fillRect(-1.5, -5, 3, 10);
        ctx.fillRect(-5, -1.5, 10, 3);
    },
    public(ctx, pal) {
        ctx.fillStyle = pal.plaza;
        ctx.fillRect(-24, 14, 48, 20);
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-28 + 3, -20 + 4, 56, 34);
        roofRect(ctx, -28, -20, 56, 34, '#b3ada1');
    },
    commercial(ctx, pal) {
        ctx.fillStyle = pal.plaza;
        ctx.fillRect(-26, 12, 52, 14);
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-22 + 3, -16 + 4, 44, 28);
        roofRect(ctx, -22, -16, 44, 28, '#d08a5b');
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        for (let k = -18; k < 20; k += 8) ctx.fillRect(k, 9, 4, 3);
    },
    residential(ctx, pal) {
        ctx.fillStyle = pal.lawn;
        ctx.fillRect(-18, -14, 36, 30);
        ctx.strokeStyle = shadeColor(pal.lawn, -0.25);
        ctx.lineWidth = 1;
        ctx.strokeRect(-18, -14, 36, 30);
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-11 + 2.5, -10 + 3, 20, 14);
        roofRect(ctx, -11, -10, 20, 14, pal.accent);
        tree(ctx, pal, 12, 9, 5);
        tree(ctx, pal, -12, 10, 4);
    },
    generic(ctx, pal) {
        plaza(ctx, pal, 20);
        ctx.fillStyle = pal.shadow;
        ctx.fillRect(-12 + 3, -9 + 4, 24, 18);
        roofRect(ctx, -12, -9, 24, 18, '#8d99ab');
    },
    pier(ctx) {
        ctx.fillStyle = 'rgba(20,40,60,.3)';
        ctx.fillRect(2, -3, 56, 9);
        ctx.fillStyle = '#a88b67';
        ctx.fillRect(0, -4, 56, 8);
        ctx.strokeStyle = '#7d6547';
        ctx.lineWidth = 0.7;
        for (let k = 4; k < 56; k += 4) { ctx.beginPath(); ctx.moveTo(k, -4); ctx.lineTo(k, 4); ctx.stroke(); }
    },
    shore(ctx, pal) {
        plaza(ctx, pal, 12);
    },
};

function drawFinish(ctx, W, H, rng, createCanvas) {
    const light = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, W, H) : null;
    if (light) {
        light.addColorStop(0, 'rgba(255,248,230,.10)');
        light.addColorStop(0.6, 'rgba(255,248,230,0)');
        light.addColorStop(1, 'rgba(20,24,40,.08)');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, W, H);
    }
    // 纸面颗粒：小噪点贴图平铺，打散大面积纯色的“电脑感”。
    const tile = typeof createCanvas === 'function' ? createCanvas(96, 96) : null;
    const tctx = tile?.getContext?.('2d');
    if (!tctx || !ctx.createPattern) return;
    for (let k = 0; k < 900; k++) {
        const v = rng.chance(0.5) ? 255 : 0;
        tctx.fillStyle = `rgba(${v},${v},${v},${rng.range(0.05, 0.16)})`;
        tctx.fillRect(rng.int(0, 95), rng.int(0, 95), 1, 1);
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
