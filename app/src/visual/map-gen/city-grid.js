import { distToSegment } from './geometry.js';

// 两级栅格：8px 粗网格记录水、路、净空与用地分区；2px 细网格只记占用，用来精确判断地块能否落下（紧邻的楼只隔 1–2px）。
export const MAP_GEN_CELL = 8;
export const FINE_CELL = 2;
export const F_WATER = 1;
export const F_ROAD = 2;
export const F_CLEAR = 4;
export const F_BUILT = 8;
export const F_PATH = 16;
export const F_RAIL = 32;
export const F_BANK = 64;
export const F_OUT = 128;

// 用地分区（每格一个）：渲染地面底色、决定建筑密度与绿化方式。
export const Z_WATER = 1;
export const Z_SAND = 2;
export const Z_PARK = 3;
export const Z_GROVE = 4;
export const Z_FOREST = 5;
export const Z_DENSE = 6;
export const Z_SUBURB = 7;
export const Z_VILLAGE = 8;
export const Z_RURAL = 9;

export function createGrid(W, H) {
    const cols = Math.ceil(W / MAP_GEN_CELL);
    const rows = Math.ceil(H / MAP_GEN_CELL);
    const fcols = Math.ceil(W / FINE_CELL);
    const frows = Math.ceil(H / FINE_CELL);
    return {
        W, H, cols, rows, fcols, frows,
        flags: new Uint8Array(cols * rows), zone: new Uint8Array(cols * rows), still: new Uint8Array(cols * rows),
        urban: new Float32Array(cols * rows), green: new Float32Array(cols * rows),
        fine: new Uint8Array(fcols * frows),
    };
}

export function cellIndex(grid, x, y) {
    const c = Math.floor(x / MAP_GEN_CELL);
    const r = Math.floor(y / MAP_GEN_CELL);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
    return r * grid.cols + c;
}

export const cellCenter = (grid, index) => [(index % grid.cols) * MAP_GEN_CELL + MAP_GEN_CELL / 2, Math.floor(index / grid.cols) * MAP_GEN_CELL + MAP_GEN_CELL / 2];

export function flagAt(grid, x, y) {
    const index = cellIndex(grid, x, y);
    return index < 0 ? F_OUT : grid.flags[index];
}

export function zoneAt(grid, x, y) {
    const index = cellIndex(grid, x, y);
    return index < 0 ? 0 : grid.zone[index];
}

export function urbanAt(grid, x, y) {
    const index = cellIndex(grid, Math.min(grid.W - 1, Math.max(0, x)), Math.min(grid.H - 1, Math.max(0, y)));
    return index < 0 ? 0 : grid.urban[index];
}

export function stamp(grid, x, y, radius, flag) {
    const half = MAP_GEN_CELL / 2;
    const c0 = Math.max(0, Math.floor((x - radius) / MAP_GEN_CELL));
    const c1 = Math.min(grid.cols - 1, Math.floor((x + radius) / MAP_GEN_CELL));
    const r0 = Math.max(0, Math.floor((y - radius) / MAP_GEN_CELL));
    const r1 = Math.min(grid.rows - 1, Math.floor((y + radius) / MAP_GEN_CELL));
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            if (Math.hypot(c * MAP_GEN_CELL + half - x, r * MAP_GEN_CELL + half - y) <= radius + half * 0.5) grid.flags[r * grid.cols + c] |= flag;
        }
    }
}

// 按线段而不是按采样点盖章：宽度处处一致，不会在折线点之间漏格。
function stampSegment(values, cols, rows, size, ax, ay, bx, by, radius, value) {
    const half = size / 2;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius) / size));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + radius) / size));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - radius) / size));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + radius) / size));
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            if (distToSegment(c * size + half, r * size + half, ax, ay, bx, by) <= radius) values[r * cols + c] |= value;
        }
    }
}

export function stampPath(grid, points, radius, flag) {
    if (points.length === 1) { stamp(grid, points[0][0], points[0][1], radius, flag); return; }
    for (let i = 0; i < points.length - 1; i++) {
        stampSegment(grid.flags, grid.cols, grid.rows, MAP_GEN_CELL, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], radius + MAP_GEN_CELL * 0.25, flag);
    }
}

export function fineStampPath(grid, points, radius) {
    for (let i = 0; i < points.length - 1; i++) {
        stampSegment(grid.fine, grid.fcols, grid.frows, FINE_CELL, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], radius, 1);
    }
}

export function fineFree(grid, x, y) {
    const c = Math.floor(x / FINE_CELL);
    const r = Math.floor(y / FINE_CELL);
    if (c < 0 || r < 0 || c >= grid.fcols || r >= grid.frows) return false;
    return !grid.fine[r * grid.fcols + c];
}

// 旋转矩形的采样点（含四边），用于占位检查。
function* rectSamples(x, y, w, h, angle, step) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nu = Math.max(1, Math.ceil(w / step));
    const nv = Math.max(1, Math.ceil(h / step));
    for (let i = 0; i <= nu; i++) {
        const u = -w / 2 + (w * i) / nu;
        for (let j = 0; j <= nv; j++) {
            const v = -h / 2 + (h * j) / nv;
            yield [x + u * cos - v * sin, y + u * sin + v * cos];
        }
    }
}

const LOT_BLOCK = F_WATER | F_BANK | F_RAIL | F_CLEAR | F_OUT;

// 检查范围向内收 0.5px：相邻地块可以贴边，但不能叠压。
export function rectFits(grid, x, y, w, h, angle, allowZone) {
    for (const [px, py] of rectSamples(x, y, w - 1, h - 1, angle, FINE_CELL)) {
        if (!fineFree(grid, px, py)) return false;
        if (flagAt(grid, px, py) & LOT_BLOCK) return false;
        if (allowZone && !allowZone(zoneAt(grid, px, py))) return false;
    }
    return true;
}

// 精确盖章：遍历包围盒内的细格，格心落在（外扩 margin 的）旋转矩形内才占用。
export function rectStamp(grid, x, y, w, h, angle, margin = 0.6) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w / 2 + margin;
    const hh = h / 2 + margin;
    const reach = Math.hypot(hw, hh);
    const c0 = Math.max(0, Math.floor((x - reach) / FINE_CELL));
    const c1 = Math.min(grid.fcols - 1, Math.floor((x + reach) / FINE_CELL));
    const r0 = Math.max(0, Math.floor((y - reach) / FINE_CELL));
    const r1 = Math.min(grid.frows - 1, Math.floor((y + reach) / FINE_CELL));
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            const dx = c * FINE_CELL + FINE_CELL / 2 - x;
            const dy = r * FINE_CELL + FINE_CELL / 2 - y;
            if (Math.abs(dx * cos + dy * sin) <= hw && Math.abs(-dx * sin + dy * cos) <= hh) grid.fine[r * grid.fcols + c] = 1;
        }
    }
    const index = cellIndex(grid, x, y);
    if (index >= 0) grid.flags[index] |= F_BUILT;
}

export function discFits(grid, x, y, r) {
    if (!fineFree(grid, x, y)) return false;
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        if (!fineFree(grid, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7)) return false;
    }
    return true;
}

export function discStamp(grid, x, y, r) {
    const c0 = Math.max(0, Math.floor((x - r) / FINE_CELL));
    const c1 = Math.min(grid.fcols - 1, Math.floor((x + r) / FINE_CELL));
    const r0 = Math.max(0, Math.floor((y - r) / FINE_CELL));
    const r1 = Math.min(grid.frows - 1, Math.floor((y + r) / FINE_CELL));
    for (let rr = r0; rr <= r1; rr++) {
        for (let c = c0; c <= c1; c++) {
            if (Math.hypot(c * FINE_CELL + FINE_CELL / 2 - x, rr * FINE_CELL + FINE_CELL / 2 - y) <= r * 0.8) grid.fine[rr * grid.fcols + c] = 1;
        }
    }
}
