// 牌区（桌垫、三家的牌墙和副露、四家牌河、中间计分板）画在一张 canvas 上。
// 透视按原来的 perspective(90) rotateX(24deg) 自己算，整张一次画完：重画只换像素，
// 不会像 DOM 3D 那样每次改动都重新栅格化一层层元素，手机上不抖。
// 单位都是 16:9 基准宽的百分之一（和样式里的 cqi 同一把尺子），牌区 100 × 56.25 居中。
const TILT = (24 * Math.PI) / 180;
const COS = Math.cos(TILT);
const SIN = Math.sin(TILT);
const DEPTH = 90;
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
const BACK = '#e2546d';
const BACK_DEEP = '#b3304b';
const DPR_CAP = 2.5;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SCORE_FONT = '"DIN Alternate","Bahnschrift","Roboto Condensed",sans-serif';
const UI_FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif';
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
            tz: tile.tw * 0.11,
            turn: rot + (tile.side ? -90 : 0),
        });
    }
}

function pondTiles(pond) {
    const tw = POND_TW;
    const th = tw * 4 / 3;
    const out = [];
    let top = PQ / 2 + 0.8;
    for (const list of [pond.slice(0, 6), pond.slice(6, 12), pond.slice(12)]) {
        if (!list.length) continue;
        const sizes = list.map((tile) => (tile.side ? [th, tw] : [tw, th]));
        const rowH = Math.max(...sizes.map((size) => size[1]));
        let x = -3 * tw;
        list.forEach((tile, index) => {
            const [w, h] = sizes[index];
            out.push({ ...tile, tw, x, y: top + (rowH - h) / 2, w, h });
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
    if (hand.zimo) add({ code: hand.zimo }, 0.08 + 1.4);
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
    }

    function drawTile(tile) {
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
            if (rel && seat.hand) placeGroup(tiles, rails[rel][0], rails[rel][1], railTiles(seat.hand, seat.melds));
            if (seat.pond && seat.pond.length) placeGroup(tiles, [50, CY], ROT[rel], pondTiles(seat.pond));
        });
        // 远的先画，近的后画：近处牌的厚度要盖住远处那张。
        return tiles.sort((a, b) => (a.y + a.h) - (b.y + b.h) || a.x - b.x);
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
        for (const tile of layout()) drawTile(tile);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    return {
        node: canvas,
        draw(next) {
            scene = next;
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
