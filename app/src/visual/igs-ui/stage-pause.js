// 舞台暂停开关：按 #igs-overlay 记录暂停原因（offscreen / hidden / panel:*），任一成立即暂停。
// 暂停时 overlay 挂 data-igs-paused，舞台层 CSS 动画停住；粒子循环不再排帧，恢复时由 onStageResume 重新拉起。
export const STAGE_PAUSED_ATTR = 'data-igs-paused';

const OVERLAY_ID = 'igs-overlay';
const states = new WeakMap();

// 只列舞台层；对话层（打字机、点击等待）、工具栏、资料页 / 地图 / CG 库与设置面板都不在内。
// 粒子循环也按这张表认舞台，面板里的画布（如地图自带的天气层）不受暂停影响。
const STAGE_LAYERS = '#igs-bg-blur,#igs-bg,#igs-sprite,#igs-cast,#igs-effect-layer,#igs-effect-front-layer,#igs-fx-stage,#igs-fx-front,.igs-dfx-sky,.igs-grade-layer,.igs-rm-back,.igs-sd-ghost,.igs-sd-curtain';
const PAUSED = `#${OVERLAY_ID}[${STAGE_PAUSED_ATTR}] :is(${STAGE_LAYERS})`;

export const STAGE_PAUSE_STYLE_TEXT = `${[PAUSED, `${PAUSED}::before`, `${PAUSED}::after`, `${PAUSED} *`, `${PAUSED} *::before`, `${PAUSED} *::after`].join(',')}{animation-play-state:paused!important;}`;

function overlayOf(target) {
    if (!target) return null;
    if (target.id === OVERLAY_ID) return target;
    const layer = typeof target.closest === 'function' ? target.closest(STAGE_LAYERS) : null;
    return layer && typeof layer.closest === 'function' ? layer.closest(`#${OVERLAY_ID}`) : null;
}

function stateOf(overlay) {
    let state = states.get(overlay);
    if (!state) {
        state = { reasons: new Set(), resumers: new Set() };
        states.set(overlay, state);
    }
    return state;
}

export function setStagePauseReason(target, reason, on) {
    const overlay = overlayOf(target);
    if (!overlay || !reason) return false;
    const state = stateOf(overlay);
    const was = state.reasons.size > 0;
    if (on) state.reasons.add(reason);
    else state.reasons.delete(reason);
    const paused = state.reasons.size > 0;
    if (paused) {
        if (typeof overlay.setAttribute === 'function') overlay.setAttribute(STAGE_PAUSED_ATTR, Array.from(state.reasons).join(' '));
        return true;
    }
    if (typeof overlay.removeAttribute === 'function') overlay.removeAttribute(STAGE_PAUSED_ATTR);
    if (was) {
        for (const resume of Array.from(state.resumers)) {
            try {
                resume();
            } catch {
                // 单个订阅方出错不影响其他循环恢复。
            }
        }
    }
    return false;
}

export function isStagePaused(target) {
    const overlay = overlayOf(target);
    const state = overlay && states.get(overlay);
    return Boolean(state && state.reasons.size);
}

export function onStageResume(target, callback) {
    const overlay = overlayOf(target);
    if (!overlay || typeof callback !== 'function') return () => {};
    const { resumers } = stateOf(overlay);
    resumers.add(callback);
    return () => resumers.delete(callback);
}

// 阅读器挂载期间的自动驱动：页面隐藏 → hidden；内嵌模式滚出视口 → offscreen。返回解绑函数。
export function watchStagePause(overlay, options = {}) {
    if (!overlayOf(overlay)) return () => {};
    const doc = overlay.ownerDocument;
    const view = doc && doc.defaultView;
    const syncHidden = () => setStagePauseReason(overlay, 'hidden', Boolean(doc.hidden));
    if (doc && typeof doc.addEventListener === 'function') {
        syncHidden();
        doc.addEventListener('visibilitychange', syncHidden);
    }
    let observer = null;
    const root = options.root || overlay;
    if (options.offscreen && view && typeof view.IntersectionObserver === 'function') {
        observer = new view.IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (entry) setStagePauseReason(overlay, 'offscreen', !entry.isIntersecting);
        });
        observer.observe(root);
    }
    return () => {
        if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', syncHidden);
        if (observer) observer.disconnect();
        observer = null;
        setStagePauseReason(overlay, 'hidden', false);
        setStagePauseReason(overlay, 'offscreen', false);
    };
}
