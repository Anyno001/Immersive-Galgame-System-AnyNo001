import { shadeColor } from './themes.js';

const TAU = Math.PI * 2;

// 双坡屋顶小件：上半受光、下半背光（地标在局部坐标系下绘制，x 轴沿街网方向）。
function roofRect(ctx, x, y, w, h, base) {
    ctx.fillStyle = shadeColor(base, 0.14);
    ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = shadeColor(base, -0.1);
    ctx.fillRect(x, y + h / 2, w, h / 2);
    ctx.strokeStyle = shadeColor(base, 0.34);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h / 2);
    ctx.lineTo(x + w - 1, y + h / 2);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(base, -0.34);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
}

function shadowRect(ctx, pal, x, y, w, h, len = 4) {
    ctx.fillStyle = pal.shadow;
    ctx.globalAlpha = 0.24;
    ctx.fillRect(x + len * 0.6, y + len, w, h);
    ctx.globalAlpha = 1;
}

function tree(ctx, pal, x, y, r) {
    const [dark, mid, light] = pal.trees[0];
    ctx.fillStyle = pal.shadow;
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(x + r * 0.38, y + r * 0.58, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(x - r * 0.14, y - r * 0.16, r * 0.74, 0, TAU); ctx.fill();
    ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.36, r * 0.34, 0, TAU); ctx.fill();
}

function plaza(ctx, pal, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = pal.plaza;
    ctx.fill();
    ctx.strokeStyle = pal.plazaEdge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
}

function paved(ctx, pal, x, y, w, h) {
    ctx.fillStyle = pal.plaza;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = pal.plazaEdge;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
}

const LANDMARKS = {
    school(ctx, pal) {
        paved(ctx, pal, -44, -48, 88, 50);
        ctx.fillStyle = pal.field;
        ctx.fillRect(-42, 4, 84, 44);
        ctx.strokeStyle = shadeColor(pal.field, -0.18);
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-42, 4, 84, 44);
        ctx.strokeStyle = pal.track;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(0, 26, 30, 14, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = 0.6;
        for (const r of [-2, 2]) { ctx.beginPath(); ctx.ellipse(0, 26, 30 + r, 14 + r, 0, 0, TAU); ctx.stroke(); }
        // 泳池
        ctx.fillStyle = '#7fc8e6';
        ctx.fillRect(-40, -8, 14, 9);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-40, -8, 14, 9);
        shadowRect(ctx, pal, -38, -44, 76, 16);
        shadowRect(ctx, pal, -38, -44, 16, 40);
        shadowRect(ctx, pal, 22, -44, 16, 40);
        roofRect(ctx, -38, -44, 76, 16, pal.brick);
        roofRect(ctx, -38, -28, 16, 24, pal.brick);
        roofRect(ctx, 22, -28, 16, 24, pal.brick);
        tree(ctx, pal, 0, -18, 5);
        tree(ctx, pal, -10, -16, 4);
        tree(ctx, pal, 10, -15, 4.4);
    },
    park(ctx, pal) {
        plaza(ctx, pal, 10);
        ctx.fillStyle = pal.shallow;
        ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.stroke();
    },
    shrine(ctx, pal) {
        ctx.fillStyle = pal.plaza;
        ctx.fillRect(-14, -28, 28, 26);
        ctx.fillRect(-3.5, -4, 7, 38);
        shadowRect(ctx, pal, -11, -25, 22, 18, 3);
        roofRect(ctx, -11, -25, 22, 18, '#5a4a45');
        ctx.fillStyle = '#d9b44a';
        ctx.fillRect(-1, -17, 2, 2);
        ctx.fillStyle = pal.torii;
        ctx.fillRect(-10, 20, 20, 2.6);
        ctx.fillRect(-8, 24, 16, 1.8);
        ctx.fillRect(-7, 20, 2.4, 8);
        ctx.fillRect(4.6, 20, 2.4, 8);
    },
    station(ctx, pal) {
        paved(ctx, pal, -30, -60, 60, 24);
        shadowRect(ctx, pal, -58, -13, 116, 8, 3);
        shadowRect(ctx, pal, -58, 5, 116, 8, 3);
        roofRect(ctx, -58, -13, 116, 8, '#cfcabe');
        roofRect(ctx, -58, 5, 116, 8, '#cfcabe');
        shadowRect(ctx, pal, -22, -38, 44, 20);
        roofRect(ctx, -22, -38, 44, 20, '#8a95a6');
        ctx.fillStyle = pal.shallow;
        ctx.beginPath(); ctx.arc(0, -50, 3.5, 0, TAU); ctx.fill();
        tree(ctx, pal, -20, -50, 4);
        tree(ctx, pal, 20, -50, 4);
    },
    tower(ctx, pal) {
        plaza(ctx, pal, 30);
        ctx.strokeStyle = pal.plazaEdge;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.stroke();
        for (let k = 0; k < 8; k++) tree(ctx, pal, Math.cos(k * TAU / 8) * 25, Math.sin(k * TAU / 8) * 25, 3.4);
        shadowRect(ctx, pal, -7, -7, 14, 14, 8);
        const base = '#8a7b6c';
        const tri = (color, pts) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.closePath(); ctx.fill(); };
        tri(shadeColor(base, 0.22), [[-7, -7], [7, -7]]);
        tri(shadeColor(base, 0.06), [[-7, -7], [-7, 7]]);
        tri(shadeColor(base, -0.12), [[7, -7], [7, 7]]);
        tri(shadeColor(base, -0.24), [[-7, 7], [7, 7]]);
    },
    castle(ctx, pal) {
        ctx.strokeStyle = pal.water;
        ctx.lineWidth = 7;
        ctx.strokeRect(-48, -48, 96, 96);
        ctx.fillStyle = pal.lawn;
        ctx.fillRect(-40, -40, 80, 80);
        ctx.strokeStyle = pal.stone;
        ctx.lineWidth = 5;
        ctx.strokeRect(-40, -40, 80, 80);
        ctx.fillStyle = pal.stone;
        for (const [cx, cy] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
            ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill();
            ctx.strokeStyle = shadeColor(pal.stone, -0.3);
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }
        shadowRect(ctx, pal, -17, -15, 34, 30, 7);
        roofRect(ctx, -17, -15, 34, 30, '#6e7a8e');
        roofRect(ctx, -8, -8, 16, 16, '#7d899d');
    },
    hospital(ctx, pal) {
        paved(ctx, pal, -30, 12, 60, 18);
        shadowRect(ctx, pal, -26, -8, 52, 16, 6);
        shadowRect(ctx, pal, -8, -26, 16, 52, 6);
        ctx.fillStyle = pal.white;
        ctx.fillRect(-26, -8, 52, 16);
        ctx.fillRect(-8, -26, 16, 52);
        ctx.strokeStyle = 'rgba(80,80,90,.5)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(-26, -8, 52, 16);
        ctx.strokeRect(-8, -26, 16, 52);
        ctx.fillStyle = '#d64a3c';
        ctx.fillRect(-1.5, -5, 3, 10);
        ctx.fillRect(-5, -1.5, 10, 3);
    },
    public(ctx, pal) {
        paved(ctx, pal, -26, 14, 52, 20);
        tree(ctx, pal, -20, 26, 4);
        tree(ctx, pal, 20, 26, 4);
        shadowRect(ctx, pal, -28, -20, 56, 34, 6);
        roofRect(ctx, -28, -20, 56, 34, '#b3ada1');
        ctx.fillStyle = shadeColor('#b3ada1', -0.2);
        ctx.fillRect(-6, -4, 12, 6);
    },
    commercial(ctx, pal) {
        paved(ctx, pal, -28, 12, 56, 14);
        shadowRect(ctx, pal, -22, -16, 44, 28, 6);
        roofRect(ctx, -22, -16, 44, 28, '#d08a5b');
        // 条纹遮阳篷
        for (let k = 0; k < 8; k++) {
            ctx.fillStyle = k % 2 ? '#ffffff' : '#c9503f';
            ctx.fillRect(-20 + k * 5, 12, 5, 3.2);
        }
    },
    residential(ctx, pal) {
        ctx.fillStyle = pal.lawn;
        ctx.fillRect(-18, -14, 36, 30);
        ctx.strokeStyle = shadeColor(pal.lawn, -0.3);
        ctx.lineWidth = 0.9;
        ctx.strokeRect(-18, -14, 36, 30);
        ctx.fillStyle = pal.path;
        ctx.fillRect(-2, 4, 4, 12);
        shadowRect(ctx, pal, -11, -10, 20, 14, 3);
        roofRect(ctx, -11, -10, 20, 14, pal.accent);
        tree(ctx, pal, 12, 9, 5);
        tree(ctx, pal, -12, 10, 4);
    },
    generic(ctx, pal) {
        plaza(ctx, pal, 18);
        shadowRect(ctx, pal, -12, -9, 24, 18, 5);
        roofRect(ctx, -12, -9, 24, 18, '#8d99ab');
    },
    pier(ctx, pal) {
        ctx.fillStyle = pal.shadow;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(2, -2, 58, 10);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#b08f68';
        ctx.fillRect(0, -4, 58, 8);
        ctx.fillRect(40, -12, 6, 24);
        ctx.strokeStyle = '#7d6547';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let k = 4; k < 58; k += 3.5) { ctx.moveTo(k, -4); ctx.lineTo(k, 4); }
        ctx.stroke();
        ctx.strokeRect(0, -4, 58, 8);
    },
    shore(ctx, pal) {
        plaza(ctx, pal, 11);
        ctx.fillStyle = '#e7a13d';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    },
};

export function drawLandmark(ctx, pal, landmark) {
    (LANDMARKS[landmark.kind] || LANDMARKS.generic)(ctx, pal, landmark);
}

export function drawCourt(ctx, pal, court) {
    ctx.translate(court.x, court.y);
    ctx.rotate(court.angle);
    const { w, h } = court;
    if (court.kind === 'pitch') {
        for (let k = 0; k < 6; k++) {
            ctx.fillStyle = k % 2 ? '#86bd5d' : '#7cb455';
            ctx.fillRect(-w / 2 + (w / 6) * k, -h / 2, w / 6 + 0.2, h);
        }
    } else {
        ctx.fillStyle = '#c67a5a';
        ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
        ctx.fillStyle = '#5f9a7a';
        ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 + 1);
    ctx.lineTo(0, h / 2 - 1);
    ctx.stroke();
    if (court.kind === 'pitch') { ctx.beginPath(); ctx.arc(0, 0, h * 0.18, 0, TAU); ctx.stroke(); }
}

export function drawParking(ctx, pal, lot) {
    ctx.translate(lot.x, lot.y);
    ctx.rotate(lot.angle);
    const { w, h } = lot;
    ctx.fillStyle = pal.parking;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = pal.parkingLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = -w / 2 + 4; x < w / 2 - 1; x += 4) {
        ctx.moveTo(x, -h / 2 + 0.8); ctx.lineTo(x, -h / 2 + 5.5);
        ctx.moveTo(x, h / 2 - 0.8); ctx.lineTo(x, h / 2 - 5.5);
    }
    ctx.stroke();
    let seed = lot.cars;
    for (let x = -w / 2 + 2; x < w / 2 - 3; x += 4) {
        for (const row of [-1, 1]) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            if (seed % 100 > 55) continue;
            ctx.fillStyle = pal.cars[seed % pal.cars.length];
            ctx.fillRect(x + 0.6, row < 0 ? -h / 2 + 1.2 : h / 2 - 5.2, 2.6, 4);
        }
    }
    ctx.strokeStyle = shadeColor(pal.parking, -0.2);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
}

export function drawCar(ctx, pal, car) {
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const l = car.len;
    ctx.fillStyle = 'rgba(30,30,40,.25)';
    ctx.fillRect(-l / 2 + 0.6, -1.3, l, 3.2);
    ctx.fillStyle = pal.cars[car.tone % pal.cars.length];
    ctx.fillRect(-l / 2, -1.6, l, 3.2);
    ctx.fillStyle = 'rgba(40,52,70,.7)';
    ctx.fillRect(l * 0.08, -1.2, l * 0.2, 2.4);
}

export function drawBoat(ctx, pal, boat) {
    ctx.translate(boat.x, boat.y);
    ctx.rotate(boat.angle);
    const l = boat.len;
    const w = l * 0.32;
    // 船尾拖出的两道 V 形尾迹
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-l / 2, 0); ctx.lineTo(-l * 1.6, -w * 1.4);
    ctx.moveTo(-l / 2, 0); ctx.lineTo(-l * 1.6, w * 1.4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,30,60,.25)';
    ctx.beginPath();
    ctx.ellipse(1, 1.5, l / 2, w / 2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.boat;
    ctx.beginPath();
    ctx.moveTo(l / 2, 0);
    ctx.quadraticCurveTo(l * 0.1, -w / 2, -l / 2, -w / 2);
    ctx.lineTo(-l / 2, w / 2);
    ctx.quadraticCurveTo(l * 0.1, w / 2, l / 2, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,70,90,.55)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (boat.kind === 'sail') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(l * 0.15, 0); ctx.lineTo(-l * 0.3, -w * 1.1); ctx.lineTo(-l * 0.3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillStyle = '#c96a4f';
        ctx.fillRect(-l * 0.25, -w * 0.25, l * 0.3, w * 0.5);
    }
}
