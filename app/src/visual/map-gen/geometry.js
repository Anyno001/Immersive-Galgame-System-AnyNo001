export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 返回到折线的最近距离与所在点序号，便于读取该处的河宽等逐点属性。
export function nearestOnPolyline(px, py, points) {
    let best = Infinity;
    let index = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const d = distToSegment(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
        if (d < best) { best = d; index = i; }
    }
    return { distance: best, index };
}

// Catmull-Rom 平滑后按固定步长重采样，折线点间距均匀，逐点属性可以直接按序号取。
export function smoothPath(control, step = 10) {
    if (control.length < 2) return control.map(point => [...point]);
    const pts = [control[0], ...control, control[control.length - 1]];
    const dense = [];
    for (let i = 1; i < pts.length - 2; i++) {
        const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
        const segments = Math.max(4, Math.ceil(dist(p1[0], p1[1], p2[0], p2[1]) / 4));
        for (let s = 0; s < segments; s++) {
            const t = s / segments;
            const t2 = t * t;
            const t3 = t2 * t;
            dense.push([0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
                + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
        }
    }
    dense.push([...control[control.length - 1]]);
    return resample(dense, step);
}

export function resample(points, step) {
    if (points.length < 2) return points.map(point => [...point]);
    const output = [[...points[0]]];
    let carry = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[i + 1];
        const len = dist(ax, ay, bx, by);
        let t = step - carry;
        while (t <= len) {
            output.push([ax + (bx - ax) * t / len, ay + (by - ay) * t / len]);
            t += step;
        }
        carry = len - (t - step);
    }
    const last = points[points.length - 1];
    const tail = output[output.length - 1];
    // 终点必须精确保留：道路要真正连到地点，河道要真正出界。
    if (dist(tail[0], tail[1], last[0], last[1]) > step * 0.3) output.push([...last]);
    else output[output.length - 1] = [...last];
    return output;
}

export function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// 折线在第 i 点的切线方向角。
export function polylineAngle(points, i) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

// 噪声扰动的圆形轮廓（湖、池塘）；squash 压扁纵向，俯视时更像水面。
export function blobPolygon(x, y, radius, squash, phase, noise, count = 36) {
    const polygon = [];
    for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2;
        const r = radius * (1 + 0.2 * noise(Math.cos(angle) * 1.3 + phase, Math.sin(angle) * 1.3));
        polygon.push([Math.round((x + Math.cos(angle) * r) * 10) / 10, Math.round((y + Math.sin(angle) * r * squash) * 10) / 10]);
    }
    return polygon;
}
