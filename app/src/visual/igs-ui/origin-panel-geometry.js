// 随身系统悬浮窗的几何：纯函数，坐标与尺寸都是舞台 CSS 像素，不读 DOM。
export const ORIGIN_MIN_W = 240;
export const ORIGIN_MIN_H = 200;
const MARGIN = 8;

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// 夹进舞台：尺寸先限在 [最小, 舞台 - 边距]，再把左上角限在可见范围内。
export function clampRect(rect, stage) {
    const sw = num(stage && stage.w, 0);
    const sh = num(stage && stage.h, 0);
    const r = rect || {};
    const width = clamp(Math.round(num(r.width, 320)), ORIGIN_MIN_W, sw - MARGIN * 2);
    const height = clamp(Math.round(num(r.height, 420)), ORIGIN_MIN_H, sh - MARGIN * 2);
    return {
        left: Math.round(clamp(num(r.left, MARGIN), MARGIN, sw - width - MARGIN)),
        top: Math.round(clamp(num(r.top, MARGIN), MARGIN, sh - height - MARGIN)),
        width,
        height,
    };
}

// 默认落点：入口坞右侧、顶边与入口坞对齐；手机窄屏居中偏上。
export function defaultRect(stage, dock) {
    const sw = num(stage && stage.w, 0);
    const sh = num(stage && stage.h, 0);
    // 默认：电脑 360×600；手机宽度取满（留边距），高度取屏高 75%、上限 640。
    const narrow = sw <= 640;
    const width = Math.min(360, sw - MARGIN * 2);
    const height = Math.min(narrow ? Math.min(640, Math.round(sh * 0.75)) : 600, sh - MARGIN * 2);
    const left = narrow ? (sw - width) / 2 : num(dock && dock.right, 52) + 10;
    const top = narrow ? Math.max(MARGIN, num(dock && dock.top, 14) + 36) : num(dock && dock.top, 14);
    return clampRect({ left, top, width, height }, stage);
}

// 拖动标题栏：整体平移。
export function moveRect(start, dx, dy, stage) {
    return clampRect({ ...start, left: start.left + dx, top: start.top + dy }, stage);
}

// 四角拖尺寸：对角固定。corner 取 nw / ne / sw / se。
export function resizeRect(start, corner, dx, dy, stage) {
    const west = corner.includes('w');
    const north = corner.includes('n');
    const right = start.left + start.width;
    const bottom = start.top + start.height;
    const sw = num(stage && stage.w, 0);
    const sh = num(stage && stage.h, 0);
    let left = start.left;
    let top = start.top;
    let width;
    let height;
    if (west) {
        left = clamp(start.left + dx, MARGIN, right - ORIGIN_MIN_W);
        width = right - left;
    } else width = clamp(start.width + dx, ORIGIN_MIN_W, sw - MARGIN - start.left);
    if (north) {
        top = clamp(start.top + dy, MARGIN, bottom - ORIGIN_MIN_H);
        height = bottom - top;
    } else height = clamp(start.height + dy, ORIGIN_MIN_H, sh - MARGIN - start.top);
    return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
}

const KEY = 'igs:origin-panel:';

// 位置尺寸记在本机（按模式分开）；读到的值夹进当前舞台。
export function readStoredRect(storage, mode, stage) {
    try {
        const raw = storage && storage.getItem(KEY + mode);
        const data = raw ? JSON.parse(raw) : null;
        if (!data || typeof data !== 'object') return null;
        return clampRect(data, stage);
    } catch (error) {
        return null;
    }
}

export function writeStoredRect(storage, mode, rect) {
    try {
        if (storage) storage.setItem(KEY + mode, JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
    } catch (error) {
        // 存储满或被禁用：本次会话内仍生效。
    }
}
