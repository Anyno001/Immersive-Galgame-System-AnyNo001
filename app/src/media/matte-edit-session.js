// 遮罩编辑会话：只在内存中持有 alpha 与有界历史；不写存储，由调用方在「保存」时提交。
import { applyBrushStroke, createBoundedHistory } from './matte-brush.js';

export const DEFAULT_MATTE_HISTORY_LIMIT = 20;

export function createMatteEditSession({ width, height, alpha, autoAlpha = null, historyLimit = DEFAULT_MATTE_HISTORY_LIMIT } = {}) {
    const w = Math.floor(Number(width) || 0);
    const h = Math.floor(Number(height) || 0);
    if (!w || !h || !alpha || alpha.length !== w * h) return null;
    const initial = new Uint8ClampedArray(alpha);
    const auto = autoAlpha && autoAlpha.length === w * h ? new Uint8ClampedArray(autoAlpha) : null;
    const history = createBoundedHistory(new Uint8ClampedArray(initial), historyLimit);
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const commit = (next) => { history.push(next); return next; };
    return {
        width: w,
        height: h,
        get alpha() { return history.current; },
        // 一次拖动 = 一条历史，避免撤销粒度过细。
        stroke(points, options) {
            const next = new Uint8ClampedArray(history.current);
            applyBrushStroke(next, w, h, points, options);
            if (same(next, history.current)) return history.current;
            return commit(next);
        },
        // 恢复自动抠图的遮罩；没有自动结果时恢复打开时的遮罩。
        resetToAuto() { return commit(new Uint8ClampedArray(auto || initial)); },
        undo: () => history.undo(),
        redo: () => history.redo(),
        canUndo: () => history.canUndo(),
        canRedo: () => history.canRedo(),
        isDirty: () => !same(history.current, initial),
    };
}
