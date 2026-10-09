// DLC 演出播放：读 content.fx.dlc（本页瞬时）与 content.fx.dlcRanges（开着的区间），调作者的 play(ctx)。
// 隔离：play 抛错只停用这一个演出（本次会话），阅读器照常翻页；翻页、离开区间、关阅读器时统一清理。
// 作者节点挂在 #igs-fx-front / #igs-fx-stage 里，舞台暂停（打开面板等）时 CSS 动画随之暂停。
import { ensureStyleTag } from './reader-dom-utils.js';
import { dlcFxVersion, getDlcFx, isDlcFxEnabled, listDlcFx, normalizeDlcFxSettings } from '../../scene/fx-registry.js';
import { getDlcSkin } from './dlc-skin-registry.js';

export const DLC_FX_STYLE_ID = 'igs-dlc-fx-style';
const states = new WeakMap();
const crashed = new Set();
let styleCache = { version: -1, text: '' };

function warn(kind, message, error) {
    try { console.warn(`[IGS DLC] 演出 ${kind}：${message}`, error || ''); } catch (_) { /* 没有控制台 */ }
}

function stateOf(root) {
    let state = states.get(root);
    if (!state) {
        state = { pageKey: '', played: new Set(), instants: new Set(), ranges: new Map() };
        states.set(root, state);
    }
    return state;
}

function syncStyle(doc) {
    const version = dlcFxVersion();
    if (styleCache.version !== version) styleCache = { version, text: listDlcFx().map((def) => def.cssText).filter(Boolean).join('\n') };
    if (styleCache.text || (doc && doc.getElementById && doc.getElementById(DLC_FX_STYLE_ID))) ensureStyleTag(doc, DLC_FX_STYLE_ID, styleCache.text);
}

// 一次播放的句柄：作者返回的清理函数、ctx.spawn 挂上的节点、abort 信号、到期计时器一并收掉。
function launch(def, args, env, autoStopMs = 0) {
    const { doc, layers } = env;
    const view = (doc && doc.defaultView) || globalThis;
    const layer = def.layer === 'stage' ? layers.stage : layers.front;
    const controller = typeof view.AbortController === 'function' ? new view.AbortController() : null;
    const nodes = new Set();
    const timers = new Set();
    let cleanup = null;
    let done = false;
    const handle = {
        stop() {
            if (done) return;
            done = true;
            for (const timer of timers) view.clearTimeout(timer);
            if (controller) controller.abort();
            if (typeof cleanup === 'function') {
                try { cleanup(); } catch (error) { warn(def.kind, '清理函数出错', error); }
            }
            for (const el of nodes) { try { el.remove(); } catch (_) { /* 已被移除 */ } }
            nodes.clear();
        },
    };
    const ctx = {
        kind: def.kind,
        mode: def.mode,
        args: Array.from(args || []),
        doc,
        layer,
        reduced: env.reduced === true,
        skin: env.skin,
        worldview: env.worldview,
        // 当前是 DLC 皮肤时用作者给皮肤定的主色，否则用对话主题里最鲜艳的颜色。
        accent: (getDlcSkin(env.skin) && getDlcSkin(env.skin).accent) || env.accent || '',
        pageKey: env.pageKey,
        signal: controller ? controller.signal : null,
        spawn(el, ms) {
            if (!el || done) return el;
            if (el.classList) el.classList.add('igs-dlc-fx');
            layer.appendChild(el);
            nodes.add(el);
            const life = Number(ms);
            if (Number.isFinite(life) && life > 0) {
                const timer = view.setTimeout(() => { timers.delete(timer); nodes.delete(el); el.remove(); }, life);
                timers.add(timer);
            }
            return el;
        },
    };
    // 瞬时演出到期自动收：计时器归句柄所有，提前清理时一并取消。
    if (autoStopMs > 0) {
        const timer = view.setTimeout(() => { timers.delete(timer); handle.stop(); }, autoStopMs);
        timers.add(timer);
    }
    try {
        cleanup = def.play(ctx);
    } catch (error) {
        crashed.add(def.kind);
        warn(def.kind, 'play 出错，本次会话已停用这个演出', error);
        handle.stop();
        return null;
    }
    return handle;
}

export function hasDlcFx(snapshot) {
    const fx = snapshot && snapshot.content && snapshot.content.fx;
    return Boolean(fx && ((Array.isArray(fx.dlc) && fx.dlc.length) || (fx.dlcRanges && Object.keys(fx.dlcRanges).length)));
}

export function syncDlcFx(root, snapshot, layers, env = {}) {
    if (!root || !layers) return [];
    const fx = (snapshot && snapshot.content && snapshot.content.fx) || {};
    const settings = normalizeDlcFxSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.dlcFx);
    const usable = (kind) => isDlcFxEnabled(kind, settings) && !crashed.has(kind);
    const state = stateOf(root);
    const doc = layers.doc || root.ownerDocument;
    syncStyle(doc);
    const base = { ...env, doc, layers };
    // 翻页：上一页的瞬时演出全部收掉，同一页重绘不重播。
    if (state.pageKey !== env.pageKey) {
        for (const handle of state.instants) handle.stop();
        state.instants.clear();
        state.played.clear();
        state.pageKey = env.pageKey;
    }
    const played = [];
    for (const item of Array.isArray(fx.dlc) ? fx.dlc : []) {
        const def = getDlcFx(item && item.kind);
        if (!def || def.mode !== 'instant' || !usable(def.kind)) continue;
        const key = `${def.kind}:${JSON.stringify(item.args || [])}`;
        if (state.played.has(key)) continue;
        state.played.add(key);
        const handle = launch(def, item.args, base, def.lifeMs);
        if (!handle) continue;
        state.instants.add(handle);
        played.push(def.kind);
    }
    // 区间：想要的集合与正在播的对比，参数变了就重开。
    const wanted = new Map();
    for (const [kind, args] of Object.entries(fx.dlcRanges || {})) {
        const def = getDlcFx(kind);
        if (def && def.mode === 'range' && usable(kind)) wanted.set(kind, { def, args, key: JSON.stringify(args || []) });
    }
    for (const [kind, running] of state.ranges) {
        const next = wanted.get(kind);
        if (!next || next.key !== running.key || getDlcFx(kind) !== running.def) {
            running.handle.stop();
            state.ranges.delete(kind);
        }
    }
    for (const [kind, next] of wanted) {
        if (state.ranges.has(kind)) continue;
        const handle = launch(next.def, next.args, base);
        if (handle) {
            state.ranges.set(kind, { handle, key: next.key, def: next.def });
            played.push(kind);
        }
    }
    return played;
}

export function cancelDlcFx(root) {
    const state = root && states.get(root);
    if (!state) return false;
    for (const handle of state.instants) handle.stop();
    for (const { handle } of state.ranges.values()) handle.stop();
    states.delete(root);
    return true;
}

// 仅供测试。
export function resetDlcFxRuntimeForTest() {
    crashed.clear();
    styleCache = { version: -1, text: '' };
}
