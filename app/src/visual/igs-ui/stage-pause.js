// 舞台暂停开关：按 #igs-overlay 记录暂停原因（offscreen / hidden / panel:*），任一成立即暂停。
// 另有「静置」（rest）：一段时间没人操作，只停背景类常驻层（缓推、呼吸、天气、氛围），前景演出与亲密演出照常。
// 暂停时 overlay 挂 data-igs-paused，舞台层 CSS 动画停住；粒子循环不再排帧，恢复时由 onStageResume 重新拉起。
export const STAGE_PAUSED_ATTR = 'data-igs-paused';

const OVERLAY_ID = 'igs-overlay';
const states = new WeakMap();

// 只列舞台层；对话层（打字机、点击等待）、工具栏、资料页 / 地图 / CG 库与设置面板都不在内。
// 粒子循环也按这张表认舞台，面板里的画布（如地图自带的天气层）不受暂停影响。
const STAGE_LAYERS = '#igs-bg-blur,#igs-bg,#igs-sprite,#igs-cast,#igs-effect-layer,#igs-effect-front-layer,#igs-fx-stage,#igs-fx-front,.igs-dfx-sky,.igs-grade-layer,.igs-rm-back,.igs-rm-front,.igs-sd-ghost,.igs-sd-curtain';
const PAUSED = `#${OVERLAY_ID}[${STAGE_PAUSED_ATTR}] :is(${STAGE_LAYERS})`;

// 背景被整块盖住（如直播手机亮着）：只停手机背后的背景、立绘、天气与时段层，演出层（直播手机本身）与自动翻页照常。
export const STAGE_COVERED_ATTR = 'data-igs-stage-covered';
export const LIVE_HOST_ATTR = 'data-igs-live-host';
const BACKDROP_LAYERS = '#igs-bg-blur,#igs-bg,#igs-sprite,#igs-cast,#igs-effect-layer,.igs-dfx-sky,.igs-grade-layer,.igs-rm-back,.igs-rm-front,.igs-sd-ghost';
const COVERED = `#${OVERLAY_ID}[${STAGE_COVERED_ATTR}] :is(${BACKDROP_LAYERS})`;

export const STAGE_REST_ATTR = 'data-igs-stage-rest';
const REST_LAYERS = '#igs-bg-blur,#igs-bg,#igs-sprite,#igs-cast,#igs-effect-layer,#igs-effect-front-layer,.igs-dfx-sky,.igs-dfx-amb,.igs-grade-layer,.igs-sd-ghost';
const RESTING = `#${OVERLAY_ID}[${STAGE_REST_ATTR}] :is(${REST_LAYERS})`;

// 静置时界面层的常驻 CSS 动画也停住：对话框皮肤装饰（科幻扫光、恐怖 / 人鱼纹样）、晃动 / 波浪字、点击等待标记、状态栏 BGM 跳条。
// 只停 CSS 动画；打字机走 WAAPI，不受影响（静置要 20 秒无操作，此时一句早已打完）。不进 STAGE_LAYERS，暂停判定与粒子循环不认这些层。
const REST_UI_LAYERS = '#igs-dialog-layer,#igs-status-hud,#igs-toolbar-layer';
const RESTING_UI = `#${OVERLAY_ID}[${STAGE_REST_ATTR}] :is(${REST_UI_LAYERS})`;

const pauseRule = (sel) => `${[sel, `${sel}::before`, `${sel}::after`, `${sel} *`, `${sel} *::before`, `${sel} *::after`].join(',')}{animation-play-state:paused!important;}`;
export const STAGE_PAUSE_STYLE_TEXT = pauseRule(PAUSED) + pauseRule(COVERED) + pauseRule(RESTING) + pauseRule(RESTING_UI);

// 直播手机盖住舞台、且这个角色就是主播时：立绘已收起，他的头顶小字和漫画泡不再画（台词已在手机评论里）。
export function isLiveHostCovered(target, character) {
    const overlay = overlayOf(target) || target;
    if (!overlay || typeof overlay.getAttribute !== 'function' || !character) return false;
    return overlay.getAttribute(STAGE_COVERED_ATTR) === '1' && overlay.getAttribute(LIVE_HOST_ATTR) === String(character);
}

function overlayOf(target) {
    if (!target) return null;
    if (target.id === OVERLAY_ID) return target;
    const layer = typeof target.closest === 'function' ? target.closest(STAGE_LAYERS) : null;
    return layer && typeof layer.closest === 'function' ? layer.closest(`#${OVERLAY_ID}`) : null;
}

function stateOf(overlay) {
    let state = states.get(overlay);
    if (!state) {
        state = { reasons: new Set(), resumers: new Set(), idleListeners: new Set(), covered: false, resting: false, wake: null };
        states.set(overlay, state);
    }
    return state;
}

const idleOf = (state) => Boolean(state.reasons.size || state.covered || state.resting);

// 静置开始 / 结束也走这里：亲密演出等按 isStageIdle(…, { ignoreRest: true }) 自己重新判断。
function notifyIdleChange(state, wasIdle) {
    const idle = idleOf(state);
    if (idle === wasIdle) return;
    const callbacks = [...state.idleListeners, ...(!idle ? state.resumers : [])];
    for (const callback of callbacks) {
        try { callback(idle); } catch { /* 单个演出不能打断其他演出的暂停与恢复。 */ }
    }
}

export function setStagePauseReason(target, reason, on) {
    const overlay = overlayOf(target);
    if (!overlay || !reason) return false;
    const state = stateOf(overlay);
    const wasIdle = idleOf(state);
    if (on) state.reasons.add(reason);
    else state.reasons.delete(reason);
    const paused = state.reasons.size > 0;
    if (paused) {
        const value = Array.from(state.reasons).join(' ');
        if (overlay.getAttribute?.(STAGE_PAUSED_ATTR) !== value) overlay.setAttribute?.(STAGE_PAUSED_ATTR, value);
    } else if (overlay.getAttribute?.(STAGE_PAUSED_ATTR) != null) overlay.removeAttribute?.(STAGE_PAUSED_ATTR);
    notifyIdleChange(state, wasIdle);
    return paused;
}

export function isStagePaused(target) {
    const overlay = overlayOf(target);
    const state = overlay && states.get(overlay);
    return Boolean(state && state.reasons.size);
}

// 背景层的逐帧循环（天气 / 日常粒子、时段闪光）用这个判断：暂停、被盖住或静置都不排帧。
// 前景演出（如亲密律动）不跟静置停，传 ignoreRest。
export function isStageIdle(target, { ignoreRest = false } = {}) {
    const overlay = overlayOf(target);
    const state = overlay && states.get(overlay);
    return Boolean(state && (state.reasons.size || state.covered || (!ignoreRest && state.resting)));
}

export function setStageResting(target, on) {
    const overlay = overlayOf(target);
    if (!overlay) return;
    const state = stateOf(overlay);
    const next = Boolean(on);
    if (state.resting === next) return;
    const wasIdle = idleOf(state);
    state.resting = next;
    if (next) overlay.setAttribute?.(STAGE_REST_ATTR, '1');
    else overlay.removeAttribute?.(STAGE_REST_ATTR);
    notifyIdleChange(state, wasIdle);
}

export function setStageCovered(target, on) {
    const overlay = overlayOf(target);
    if (!overlay) return;
    const state = stateOf(overlay);
    const next = Boolean(on);
    if (state.covered === next) return;
    const wasIdle = idleOf(state);
    state.covered = next;
    if (next) {
        if (typeof overlay.setAttribute === 'function') overlay.setAttribute(STAGE_COVERED_ATTR, '1');
    } else if (typeof overlay.removeAttribute === 'function') overlay.removeAttribute(STAGE_COVERED_ATTR);
    notifyIdleChange(state, wasIdle);
}

export function onStageIdleChange(target, callback) {
    const overlay = overlayOf(target);
    if (!overlay || typeof callback !== 'function') return () => {};
    const { idleListeners } = stateOf(overlay);
    idleListeners.add(callback);
    return () => idleListeners.delete(callback);
}

export function onStageResume(target, callback) {
    const overlay = overlayOf(target);
    if (!overlay || typeof callback !== 'function') return () => {};
    const { resumers } = stateOf(overlay);
    resumers.add(callback);
    return () => resumers.delete(callback);
}

// 阅读器挂载期间的自动驱动：页面隐藏 → hidden；内嵌模式滚出视口 → offscreen；
// 一段时间没点、没按键、没翻页 → 静置（背景缓推、呼吸、氛围层、天气粒子停住，手机不再空烧），任一操作或翻页立即恢复。返回解绑函数。
export const STAGE_REST_MS = 20000;
const REST_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

// 翻页 / 换图时由阅读器调用，算一次活动。
export function markStageActive(target) {
    const overlay = overlayOf(target);
    const state = overlay && states.get(overlay);
    if (state && typeof state.wake === 'function') state.wake();
}

export function watchStagePause(overlay, options = {}) {
    if (!overlayOf(overlay)) return () => {};
    const doc = overlay.ownerDocument;
    const view = doc && doc.defaultView;
    const syncHidden = () => setStagePauseReason(overlay, 'hidden', Boolean(doc.hidden));
    if (doc && typeof doc.addEventListener === 'function') {
        syncHidden();
        doc.addEventListener('visibilitychange', syncHidden);
    }
    const restMs = Number.isFinite(options.restMs) ? options.restMs : STAGE_REST_MS;
    const timers = view && typeof view.setTimeout === 'function' ? view : globalThis;
    let restTimer = 0;
    const state = stateOf(overlay);
    const wake = () => {
        if (restTimer) timers.clearTimeout(restTimer);
        restTimer = restMs > 0 ? timers.setTimeout(() => { restTimer = 0; setStageResting(overlay, true); }, restMs) : 0;
        if (state.resting) setStageResting(overlay, false);
    };
    state.wake = wake;
    if (doc && typeof doc.addEventListener === 'function') {
        for (const type of REST_EVENTS) doc.addEventListener(type, wake, { capture: true, passive: true });
    }
    wake();
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
        if (doc && typeof doc.removeEventListener === 'function') {
            doc.removeEventListener('visibilitychange', syncHidden);
            for (const type of REST_EVENTS) doc.removeEventListener(type, wake, { capture: true });
        }
        if (restTimer) timers.clearTimeout(restTimer);
        restTimer = 0;
        if (state.wake === wake) state.wake = null;
        if (observer) observer.disconnect();
        observer = null;
        setStagePauseReason(overlay, 'hidden', false);
        setStagePauseReason(overlay, 'offscreen', false);
        setStageResting(overlay, false);
    };
}
