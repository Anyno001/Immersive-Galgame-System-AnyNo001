// 牌区（桌垫、三家的牌墙和副露、四家牌河、中间计分板）画在一张 canvas 上。
// 透视按原来的 perspective(90) rotateX(24deg) 自己算，整张一次画完：重画只换像素，
// 不会像 DOM 3D 那样每次改动都重新栅格化一层层元素，手机上不抖。
// 单位都是 16:9 基准宽的百分之一（和样式里的 cqi 同一把尺子），牌区 100 × 56.25 居中。
const TILT = (38 * Math.PI) / 180;
const COS = Math.cos(TILT);
const SIN = Math.sin(TILT);
const DEPTH = 80;
const BASE_W = 100;
const BASE_H = 56.25;
const ORIGIN_Y = BASE_H * 0.44;
const CY = 24.6;
const PQ = 15.5;
const TY = -1.4;
const SX = 13;
const MAT = { left: 9, top: -5, right: 91, bottom: BASE_H - 1.5, radius: 1.6 };
const POND_TW = 2.85;
const RAIL_TW = 2.35;
const ROT = [0, -90, 180, 90];
// 立牌的牌厚（按牌宽计）。
const STAND_DEPTH = 0.72;
const BACK = '#e2546d';
const BACK_DEEP = '#b3304b';
const DPR_CAP = 2.5;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SCORE_FONT = '"DIN Alternate","Bahnschrift","Roboto Condensed",sans-serif';
const UI_FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif';
const FLIGHT_MS = 720;
// 自己的手牌在 DOM 里，胡牌飞过去落在手牌右段上方。
const SELF_LANDING = { x: 72, y: 47.5 };
const ALL_FACES = ['back', ...['m', 'p', 's'].flatMap((suit) => Array.from({ length: 10 }, (_, n) => suit + n)), ...Array.from({ length: 7 }, (_, n) => `z${n + 1}`)];

const faces = new Map();

function faceKey(code) {
    return code === 'back' ? 'back' : String(code || '').replace(/[_*+=-]/g, '');
}

function faceImage(win, faceSvg, code) {
    const key = faceKey(code);
    let item = faces.get(key);
    if (item) return item;
    item = { img: null, ready: false, waiters: new Set() };
    faces.set(key, item);
    if (!win || typeof win.Image !== 'function' || typeof win.XMLSerializer !== 'function') return item;
    const svg = faceSvg(key);
    svg.setAttribute('width', '120');
    svg.setAttribute('height', '160');
    let markup = new win.XMLSerializer().serializeToString(svg);
    if (!/xmlns=/.test(markup)) markup = markup.replace('<svg', `<svg xmlns="${SVG_NS}"`);
    const img = new win.Image();
    img.onload = () => {
        item.ready = true;
        for (const wake of item.waiters) wake();
        item.waiters.clear();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    item.img = img;
    return item;
}

function turn(rot, x, y) {
    const a = (rot * Math.PI) / 180;
    const c = Math.round(Math.cos(a));
    const s = Math.round(Math.sin(a));
    return [x * c - y * s, x * s + y * c];
}

// 一组牌在自己的坐标里横排，origin / rot 把它摆到桌上；落到桌面上的外框总是正的，厚度一律朝玩家（桌面 +y）。
function placeGroup(out, origin, rot, tiles) {
    for (const tile of tiles) {
        const [ax, ay] = turn(rot, tile.x, tile.y);
        const [bx, by] = turn(rot, tile.x + tile.w, tile.y + tile.h);
        const th = tile.tw * 4 / 3;
        out.push({
            ...tile,
            x: origin[0] + Math.min(ax, bx),
            y: origin[1] + Math.min(ay, by),
            w: Math.abs(bx - ax),
            h: Math.abs(by - ay),
            th,
            tz: tile.tw * 0.27 * SIN,
            turn: rot + (tile.side ? -90 : 0),
        });
    }
}

// 立直照规矩每行 6 张、第三行往右接；成都一人能打二十多张，perRow 给 8，打满三行再把每行加宽，不往外伸第四行（会压到别家的手牌）。
// 各家牌河从自己左手边起排，转成风车形，加宽了也不会和左右两家的牌河叠在一起。
function pondTiles(pond, perRow = 0) {
    const tw = POND_TW;
    const th = tw * 4 / 3;
    const out = [];
    let top = PQ / 2 + 0.8;
    const width = perRow ? Math.max(perRow, Math.ceil(pond.length / 3)) : 6;
    const rows = [pond.slice(0, width), pond.slice(width, width * 2), pond.slice(width * 2)];
    for (const list of rows) {
        if (!list.length) continue;
        const sizes = list.map((tile) => (tile.side ? [th, tw] : [tw, th]));
        const rowH = Math.max(...sizes.map((size) => size[1]));
        let x = -3 * tw;
        list.forEach((tile, index) => {
            const [w, h] = sizes[index];
            out.push({ ...tile, tw, x, y: top + (rowH - h) / 2, w, h, pondAt: out.length });
            x += w + 0.08;
        });
        top += rowH + 0.5;
    }
    return out;
}

function railTiles(hand, melds) {
    const tw = RAIL_TW;
    const th = tw * 4 / 3;
    const row = [];
    let x = 0;
    const add = (tile, gap) => {
        const [w, h] = tile.side ? [th, tw] : [tw, th];
        if (row.length) x += gap;
        row.push({ ...tile, tw, x, w, h });
        x += w;
    };
    for (let i = 0; i < (hand.backs || 0); i += 1) add({ code: 'back', back: true }, 0.08);
    for (const code of hand.tiles || []) add({ code }, 0.08);
    if (hand.zimo) add({ code: hand.zimo, fresh: Boolean(hand.won), huTile: Boolean(hand.won) }, 0.08 + 1.4);
    let firstMeld = true;
    for (const meld of melds || []) {
        meld.forEach((tile, index) => add(tile, index ? 0.04 : (firstMeld ? 1.2 : 0.8)));
        firstMeld = false;
    }
    const height = Math.max(0, ...row.map((tile) => tile.h));
    return row.map((tile) => ({ ...tile, x: tile.x - x / 2, y: height / 2 - tile.h }));
}

function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
}

// 桌面上的圆角矩形按点投影，边是真透视，不靠局部仿射近似。
function feltRoundRect(l, t, r, b, rad) {
    const points = [];
    const corners = [[r - rad, t + rad, -90], [r - rad, b - rad, 0], [l + rad, b - rad, 90], [l + rad, t + rad, 180]];
    for (const [cx, cy, start] of corners) {
        for (let i = 0; i <= 6; i += 1) {
            const a = ((start + i * 15) * Math.PI) / 180;
            points.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
        }
    }
    return points;
}

export function createMahjongFelt(doc, { faceSvg } = {}) {
    const win = doc && (doc.defaultView || globalThis);
    const canvas = doc.createElement('canvas');
    canvas.className = 'igs-mj-felt';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '牌桌');
    // 走 CPU 画布：GPU 画布在 Chrome 里单独成合成层，上面的气泡、按钮一出一收就重排图层，安卓上整张桌面会闪一帧；
    // CPU 画布像图片一样画进牌桌所在的层，上面怎么变都不碰它。
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d', { willReadFrequently: true }) : null;
    let scene = null;
    let placed = [];
    let flights = [];
    let queued = 0;
    let dead = false;
    let view = null;
    const raf = (win && win.requestAnimationFrame) ? win.requestAnimationFrame.bind(win) : (fn) => setTimeout(fn, 16);
    const wake = () => {
        if (queued || dead) return;
        queued = raf(() => {
            queued = 0;
            render();
        });
    };
    const face = (code) => (typeof faceSvg === 'function' ? faceImage(win, faceSvg, code) : { ready: false, waiters: new Set() });
    if (ctx) ALL_FACES.forEach(face);
    const observer = ctx && win && typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => render()) : null;
    if (observer) observer.observe(canvas);

    function project(x, y) {
        const yr = y - ORIGIN_Y;
        const k = DEPTH / (DEPTH - yr * SIN);
        return [(view.ox + 50 + (x - 50) * k) * view.u, (view.oy + ORIGIN_Y + yr * COS * k) * view.u];
    }

    // 局部坐标 (lx, ly) 在桌面上是 origin + lx·a + ly·b；在 origin 附近用中心差分得出仿射，再乘设备像素比。
    function frame(x, y, rot, span = 2) {
        const [ax, ay] = turn(rot, 1, 0);
        const [bx, by] = turn(rot, 0, 1);
        const h = span / 2;
        const p0 = project(x, y);
        const pa = project(x + ax * h, y + ay * h);
        const pa2 = project(x - ax * h, y - ay * h);
        const pb = project(x + bx * h, y + by * h);
        const pb2 = project(x - bx * h, y - by * h);
        const d = view.dpr;
        const m = [(pa[0] - pa2[0]) / span, (pa[1] - pa2[1]) / span, (pb[0] - pb2[0]) / span, (pb[1] - pb2[1]) / span];
        ctx.setTransform(m[0] * d, m[1] * d, m[2] * d, m[3] * d, p0[0] * d, p0[1] * d);
        return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) * d;
    }

    function polygon(points) {
        const d = view.dpr;
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ctx.beginPath();
        points.forEach(([x, y], index) => {
            const [px, py] = project(x, y);
            if (index) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
        });
        ctx.closePath();
    }

    function text(value, x, y, size, weight, family, color, glow, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.1, 0.1);
        ctx.font = `${weight} ${size * 10}px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        if (glow) {
            ctx.shadowColor = glow;
            ctx.shadowBlur = size * 0.4 * scale;
        }
        ctx.fillText(value, 0, 0);
        ctx.restore();
    }

    function drawMat() {
        const { left, top, right, bottom, radius } = MAT;
        const outline = feltRoundRect(left, top, right, bottom, radius);
        polygon(outline);
        ctx.fillStyle = 'rgba(10,16,48,.26)';
        ctx.fill();
        const [cx, cy] = project(50, CY + 4);
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 44 * view.u);
        glow.addColorStop(0, 'rgba(150,180,255,.09)');
        glow.addColorStop(1, 'rgba(150,180,255,0)');
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(214,226,255,.26)';
        ctx.stroke();
        polygon(feltRoundRect(left + 1.3, top + 1.3, right - 1.3, bottom - 1.3, radius * 0.6));
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(214,226,255,.1)';
        ctx.stroke();
    }

    function drawPlaque() {
        const half = PQ / 2;
        const [l, t, r, b] = [50 - half, CY - half, 50 + half, CY + half];
        polygon(feltRoundRect(l - 0.5, t - 0.5, r + 0.5, b + 0.5, 2.1));
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur = 2.4 * view.u * view.dpr;
        ctx.shadowOffsetY = 1.4 * view.u * view.dpr;
        ctx.fillStyle = '#0a0c12';
        ctx.fill();
        ctx.restore();
        polygon(feltRoundRect(l - 0.22, t - 0.22, r + 0.22, b + 0.22, 1.82));
        ctx.fillStyle = '#4a5368';
        ctx.fill();
        polygon(feltRoundRect(l, t, r, b, 1.6));
        const [gx0, gy0] = project(l, t);
        const [gx1, gy1] = project(r, b);
        const panel = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        panel.addColorStop(0, '#363d50');
        panel.addColorStop(0.42, '#191d28');
        panel.addColorStop(1, '#0d1017');
        ctx.fillStyle = panel;
        ctx.fill();

        const inset = PQ * 0.29;
        const core = feltRoundRect(l + inset, t + inset, r - inset, b - inset, 0.9);
        polygon(core);
        const [cx, cy] = project(50, CY - PQ * 0.06);
        const coreFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, PQ * 0.36 * view.u);
        coreFill.addColorStop(0, '#123a44');
        coreFill.addColorStop(1, '#081a21');
        ctx.fillStyle = coreFill;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.lineWidth = 1.6 * view.u;
        ctx.strokeStyle = 'rgba(70,200,215,.16)';
        ctx.stroke();
        ctx.lineWidth = 0.28 * view.u;
        ctx.strokeStyle = 'rgba(80,210,220,.55)';
        ctx.stroke();
        ctx.restore();

        const scale = frame(50, CY, 0, PQ * 0.42);
        const left = scene.left;
        const roundY = left == null ? 0 : -0.8;
        text(scene.round, 0, roundY, 1.75, 800, UI_FONT, '#9ff7f2', 'rgba(110,240,235,.7)', scale);
        if (left != null) text(`余 ${left}`, 0, 1.03, 1.3, 400, UI_FONT, '#d8f7f4', null, scale);

        scene.seats.forEach((seat, rel) => drawSide(seat, rel));
    }

    function drawSide(seat, rel) {
        const half = PQ / 2;
        const mid = half - 1.7;
        const [dx, dy] = turn(ROT[rel], 0, mid);
        const scale = frame(50 + dx, CY + dy, ROT[rel], PQ);
        const bottom = 1.7;
        if (seat.turn) {
            ctx.save();
            ctx.shadowColor = 'rgba(255,200,60,.9)';
            ctx.shadowBlur = 0.8 * scale;
            ctx.fillStyle = '#ffd54f';
            roundRectPath(ctx, -half + PQ * 0.27, bottom - 0.42, PQ * 0.46, 0.3, 0.15);
            ctx.fill();
            ctx.restore();
        }
        text(String(seat.score), 0, bottom - 0.55 - 0.8, 1.6, 700, SCORE_FONT, seat.turn ? '#ffe187' : '#f4f1e8', seat.turn ? 'rgba(255,210,80,.75)' : null, scale);
        if (seat.riichi) {
            const top = bottom - 0.55 - 1.6 - 0.25 - 0.55;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,.45)';
            ctx.shadowBlur = 0.2 * scale;
            ctx.shadowOffsetY = 0.1 * scale;
            const stick = ctx.createLinearGradient(0, top, 0, top + 0.55);
            stick.addColorStop(0, '#ffffff');
            stick.addColorStop(1, '#e4dccb');
            ctx.fillStyle = stick;
            roundRectPath(ctx, -3, top, 6, 0.55, 0.275);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = '#d8202f';
            ctx.beginPath();
            ctx.arc(0, top + 0.275, 0.21, 0, Math.PI * 2);
            ctx.fill();
        }
        const wx = -half + 0.45;
        const wy = bottom - 0.45 - 2;
        if (seat.dealer) {
            const badge = ctx.createLinearGradient(wx, wy, wx + 2, wy + 2);
            badge.addColorStop(0, '#ff6a6a');
            badge.addColorStop(1, '#c21d38');
            ctx.fillStyle = badge;
        } else {
            ctx.fillStyle = '#2a3142';
        }
        roundRectPath(ctx, wx, wy, 2, 2, 0.45);
        ctx.fill();
        ctx.lineWidth = 0.1;
        ctx.strokeStyle = 'rgba(255,255,255,.18)';
        roundRectPath(ctx, wx + 0.05, wy + 0.05, 1.9, 1.9, 0.4);
        ctx.stroke();
        text(seat.wind, wx + 1, wy + 1.05, 1.2, 800, UI_FONT, seat.dealer ? '#fff' : '#e9e4d6', null, scale);
        if (seat.que) text(seat.que, wx + 1, wy - 0.15, 0.85, 700, UI_FONT, '#ffd36a', null, scale);
        if (seat.hued) text(seat.huMark || '胡', half - 1.3, wy + 1.05, 0.9, 800, UI_FONT, '#ffb4b4', null, scale);
    }

    // 立着的牌按桌面同一台相机算：方块八个角各自带高度投影，三家和桌子永远一个视角。
    function project3(x, y, z) {
        const yr = y - ORIGIN_Y;
        const k = DEPTH / (DEPTH - yr * SIN - z * COS);
        return [(view.ox + 50 + (x - 50) * k) * view.u, (view.oy + ORIGIN_Y + (yr * COS - z * SIN) * k) * view.u];
    }

    function face3(points, fill, stroke) {
        ctx.beginPath();
        points.forEach(([x, y, z], index) => {
            const [px, py] = project3(x, y, z);
            if (index) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
    }

    // 牌背那层只占牌厚的一部分，朝桌心；其余是米白牌身。
    function drawBox(tile) {
        const d = view.dpr;
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ctx.lineWidth = 0.8;
        ctx.lineJoin = 'round';
        const { tw } = tile;
        const deep = tw * STAND_DEPTH;
        const tall = tw * 4 / 3;
        const band = deep * 0.36;
        const cx = tile.x + tile.w / 2;
        const cy = tile.y + tile.h / 2;
        const across = !tile.upright;
        const hx = across ? deep / 2 : tile.w / 2;
        const hy = across ? tile.h / 2 : deep / 2;
        const [x0, x1, y0, y1] = [cx - hx, cx + hx, cy - hy, cy + hy];
        const body = '#f3ead6';
        const bodySide = '#ddd0b4';
        const backLine = 'rgba(70,6,22,.55)';
        const bodyLine = 'rgba(120,98,66,.45)';
        const pad = tw * 0.06;
        face3([[x0 - pad, y0, 0], [x1 + pad, y0, 0], [x1 + pad, y1 + pad * 2, 0], [x0 - pad, y1 + pad * 2, 0]], 'rgba(0,0,0,.28)');
        const sideX = cx < 50 ? x1 : x0;
        const side = [[sideX, y0, 0], [sideX, y1, 0], [sideX, y1, tall], [sideX, y0, tall]];
        const front = [[x0, y1, 0], [x1, y1, 0], [x1, y1, tall], [x0, y1, tall]];
        if (across) {
            const backX = tile.lean > 0 ? x1 : x0;
            const bandX = tile.lean > 0 ? x1 - band : x0 + band;
            if (sideX === backX) face3(side, BACK, backLine);
            else face3(side, bodySide, bodyLine);
            face3(front, bodySide, bodyLine);
            face3([[bandX, y1, 0], [backX, y1, 0], [backX, y1, tall], [bandX, y1, tall]], BACK_DEEP);
            face3([[x0, y0, tall], [x1, y0, tall], [x1, y1, tall], [x0, y1, tall]], body, bodyLine);
            face3([[bandX, y0, tall], [backX, y0, tall], [backX, y1, tall], [bandX, y1, tall]], BACK, backLine);
        } else {
            face3(side, bodySide, bodyLine);
            face3([[sideX, y1 - band, 0], [sideX, y1, 0], [sideX, y1, tall], [sideX, y1 - band, tall]], BACK_DEEP);
            face3(front, BACK, backLine);
            face3([[x0, y0, tall], [x1, y0, tall], [x1, y1, tall], [x0, y1, tall]], body, bodyLine);
            face3([[x0, y1 - band, tall], [x1, y1 - band, tall], [x1, y1, tall], [x0, y1, tall]], BACK, backLine);
        }
    }

    function drawTile(tile) {
        if (tile.lean || tile.upright) {
            drawBox(tile);
            return;
        }
        const scale = frame(tile.x + tile.w / 2, tile.y + tile.h / 2, 0, Math.max(tile.w, tile.h));
        const { w, h, tw, th, tz } = tile;
        const x0 = -w / 2;
        const y0 = -h / 2;
        const r = tw * 0.13;
        const back = tile.back || tile.code === 'back';
        // 落影用两层半透明圆角块代替模糊：CPU 画布上 shadowBlur 太贵。
        ctx.fillStyle = 'rgba(0,0,0,.16)';
        roundRectPath(ctx, x0 - 0.6 * tz, y0 + 0.6 * tz, w + 1.2 * tz, h + 2.6 * tz, r + 0.6 * tz);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        roundRectPath(ctx, x0 - 0.2 * tz, y0 + 0.8 * tz, w + 0.4 * tz, h + 2.1 * tz, r + 0.2 * tz);
        ctx.fill();
        ctx.fillStyle = back ? '#f1e8d4' : BACK;
        roundRectPath(ctx, x0, y0, w, h + 2.1 * tz, r);
        ctx.fill();
        ctx.fillStyle = back ? BACK_DEEP : '#e3d7bf';
        roundRectPath(ctx, x0, y0, w, h + tz, r);
        ctx.fill();

        ctx.save();
        roundRectPath(ctx, x0, y0, w, h, r);
        ctx.clip();
        ctx.rotate((tile.turn * Math.PI) / 180);
        const shade = ctx.createLinearGradient(-tw * 0.17, -th / 2, tw * 0.17, th / 2);
        if (back) {
            shade.addColorStop(0, '#f57e93');
            shade.addColorStop(0.46, BACK);
            shade.addColorStop(1, BACK_DEEP);
        } else {
            shade.addColorStop(0, '#ffffff');
            shade.addColorStop(0.52, '#fbf7ee');
            shade.addColorStop(1, '#ece3d1');
        }
        ctx.fillStyle = shade;
        ctx.fillRect(-tw / 2, -th / 2, tw, th);
        const img = face(back ? 'back' : tile.code);
        if (img.ready) ctx.drawImage(img.img, -tw / 2, -th / 2, tw, th);
        else img.waiters.add(wake);
        ctx.restore();
        const line = Math.max(1 / scale, tw * 0.03);
        ctx.lineWidth = line;
        ctx.strokeStyle = back ? 'rgba(110,16,36,.4)' : 'rgba(150,128,96,.3)';
        roundRectPath(ctx, x0 + line / 2, y0 + line / 2, w - line, h - line, r);
        ctx.stroke();

        if (tile.spent) {
            ctx.fillStyle = 'rgba(22,30,70,.45)';
            roundRectPath(ctx, x0, y0, w, h + 2.1 * tz, r);
            ctx.fill();
        }
        if (tile.fresh) {
            ctx.save();
            ctx.shadowColor = 'rgba(255,214,90,.8)';
            ctx.shadowBlur = 1 * scale;
            ctx.lineWidth = 0.18;
            ctx.strokeStyle = '#ffd65a';
            roundRectPath(ctx, x0 - 0.09, y0 - 0.09, w + 0.18, h + 0.18, r + 0.09);
            ctx.stroke();
            ctx.restore();
        }
    }

    function layout() {
        const tiles = [];
        const rails = { 1: [[100 - SX, CY], -90], 2: [[50, TY], 180], 3: [[SX, CY], 90] };
        scene.seats.forEach((seat, rel) => {
            if (rel && seat.hand) {
                const from = tiles.length;
                placeGroup(tiles, rails[rel][0], rails[rel][1], railTiles(seat.hand, seat.melds));
                for (let i = from; i < tiles.length; i += 1) {
                    tiles[i].rel = rel;
                    if (!tiles[i].back) continue;
                    if (rel === 2) tiles[i].upright = true;
                    else tiles[i].lean = rel === 1 ? -1 : 1;
                }
            }
            if (seat.pond && seat.pond.length) {
                const from = tiles.length;
                placeGroup(tiles, [50, CY], ROT[rel], pondTiles(seat.pond, scene.pondRow));
                for (let i = from; i < tiles.length; i += 1) tiles[i].pondOf = rel;
            }
        });
        // 远的先画，近的后画：近处牌的厚度要盖住远处那张。
        return tiles.sort((a, b) => (a.y + a.h) - (b.y + b.h) || Math.abs(b.x + b.w / 2 - 50) - Math.abs(a.x + a.w / 2 - 50));
    }

    function render() {
        if (!ctx || dead || !scene) return;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (!cw || !ch) return;
        const dpr = Math.min(DPR_CAP, (win && win.devicePixelRatio) || 1);
        const pw = Math.round(cw * dpr);
        const ph = Math.round(ch * dpr);
        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
        }
        const u = Math.min(cw / BASE_W, ch / BASE_H);
        view = { u, dpr: pw / cw, ox: (cw / u - BASE_W) / 2, oy: (ch / u - BASE_H) / 2 };
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pw, ph);
        drawMat();
        drawPlaque();
        const now = clock();
        flights = flights.filter((flight) => now - flight.t0 < FLIGHT_MS);
        const landing = new Set(flights.map((flight) => flight.rel));
        for (const tile of layout()) if (!(tile.huTile && landing.has(tile.rel))) drawTile(tile);
        for (const flight of flights) drawFlight(flight, (now - flight.t0) / FLIGHT_MS);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (flights.length) wake();
    }

    function clock() {
        return win && win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now();
    }

    // 胡的那张从点炮的牌河（自摸就是自己手边）抛起来，落到胡牌那家手牌右边。
    function drawFlight(flight, t) {
        const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        const { from, to } = flight;
        const lift = Math.sin(Math.PI * t) * 5;
        const grow = 1 + Math.sin(Math.PI * t) * 0.45;
        const w = (from.w + (to.w - from.w) * e) * grow;
        const h = (from.h + (to.h - from.h) * e) * grow;
        const cx = from.x + from.w / 2 + (to.x + to.w / 2 - from.x - from.w / 2) * e;
        const cy = from.y + from.h / 2 + (to.y + to.h / 2 - from.y - from.h / 2) * e - lift;
        const tw = Math.min(w, h);
        ctx.save();
        if (flight.self && t > 0.8) ctx.globalAlpha = (1 - t) / 0.2;
        drawTile({ code: flight.code, x: cx - w / 2, y: cy - h / 2, w, h, tw, th: tw * 4 / 3, tz: tw * 0.27 * SIN, turn: e < 0.5 ? from.turn : to.turn, fresh: t > 0.85 });
        ctx.restore();
    }

    function launch(prevScene, prevTiles, next, nextTiles) {
        if (!prevScene || !prevScene.seats || !next.seats) return;
        const shrunk = next.seats.findIndex((seat, rel) => {
            const was = prevScene.seats[rel];
            return was && was.pond && seat.pond && seat.pond.length === was.pond.length - 1;
        });
        next.seats.forEach((seat, rel) => {
            const was = prevScene.seats[rel];
            if (!seat.hand || !seat.hand.won || !was || (was.hand && was.hand.won)) return;
            const code = seat.hand.zimo || '';
            const target = rel
                ? nextTiles.find((tile) => tile.huTile && tile.rel === rel)
                : { x: SELF_LANDING.x - RAIL_TW / 2, y: SELF_LANDING.y, w: RAIL_TW, h: RAIL_TW * 4 / 3, turn: 0 };
            if (!target || !code) return;
            let source = shrunk >= 0
                ? prevTiles.filter((tile) => tile.pondOf === shrunk).sort((a, b) => b.pondAt - a.pondAt)[0]
                : null;
            if (!source) source = { ...target, y: target.y + (rel === 2 ? 3 : -3) };
            flights.push({ rel, code, self: !rel, from: source, to: target, t0: clock() });
        });
    }

    return {
        node: canvas,
        draw(next) {
            const prevScene = scene;
            const prevTiles = placed;
            scene = next;
            if (ctx) {
                placed = layout();
                launch(prevScene, prevTiles, next, placed);
            }
            const scores = next.seats.map((seat) => `${seat.wind}${seat.score}`).join(' ');
            canvas.setAttribute('aria-label', `牌桌 ${next.round}${next.left == null ? '' : ` 余${next.left}张`} ${scores}`);
            render();
        },
        destroy() {
            dead = true;
            if (observer) observer.disconnect();
        },
    };
}
