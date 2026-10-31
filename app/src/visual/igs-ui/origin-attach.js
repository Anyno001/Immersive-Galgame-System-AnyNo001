// 随身系统接入点（Origin 系统 原作 vicliaaa，经授权移植）。
// 核心在 app/src/scene/origin/origin-engine.js（createOriginEngine / getSharedOriginEngine）。宿主建好引擎后调用一次：
//   const detach = attachOriginEngine(engine, {
//       settings: () => bridge.origin,                 // 必填：读当前 bridge.origin（未规范化也可）
//       notice: (level, text) => igsUi.showImageNotice('note', text),  // 阅读器细线提示，不弹 toastr
//       openSettings: () => igsUi.openSettings({ tab: 'origin' }),     // 可选：窗口头部的「设置」键
//       saveSetting: (key, value) => { ... },          // 可选：窗口里改设置项（如「结果进剧情」）
//   });
// 接上后：阅读器入口坞出现入口（总开关开着时），设置页「本聊天」「存档」按钮可用。detach() 撤下。
// 本模块不碰 DOM，也不引用界面文件，设置页与阅读器都从这里读。
import { normalizeOriginSettings } from './origin-settings.js';

let attached = null;

export function attachOriginEngine(engine, hooks = {}) {
    if (!engine || typeof engine.getState !== 'function' || typeof engine.subscribe !== 'function' || typeof engine.dispatch !== 'function') {
        throw new TypeError('attachOriginEngine: engine 需提供 getState / subscribe / dispatch');
    }
    const entry = { engine, hooks: hooks && typeof hooks === 'object' ? hooks : {} };
    attached = entry;
    return () => {
        if (attached === entry) attached = null;
    };
}

export function getAttachedOrigin() {
    return attached;
}

// 设置页「本聊天」一行用：{ hasChat, paused, blocked, legacy }；没接引擎时返回 null。
export function originChatStatus() {
    if (!attached) return null;
    const { engine } = attached;
    let state = null;
    try { state = engine.getState(); } catch (error) { state = null; }
    let blocked = null;
    try { blocked = typeof engine.isBlocked === 'function' ? engine.isBlocked() : null; } catch (error) { blocked = null; }
    let legacy = false;
    try { legacy = typeof engine.legacyDetected === 'function' ? Boolean(engine.legacyDetected()) : false; } catch (error) { legacy = false; }
    return { hasChat: Boolean(state), paused: Boolean(state && state.paused), blocked: blocked || null, legacy, world: state ? String(state.world || '') : '' };
}

// 设置页的存档操作：recalc / reset / pause / resume / import / dismiss-legacy / world（payload 为新世界名）。
export async function runAttachedOriginOp(kind, payload) {
    if (!attached) return { ok: false, reason: 'origin-engine-missing' };
    const { engine } = attached;
    switch (kind) {
    case 'recalc': return engine.recalcAll();
    case 'reset': return engine.dispatch({ type: 'reset' });
    case 'pause': return engine.dispatch({ type: 'pause' });
    case 'resume': return engine.dispatch({ type: 'resume' });
    case 'import': return typeof engine.importLegacy === 'function' ? engine.importLegacy() : { ok: false, reason: 'origin-op-unknown' };
    case 'world': return engine.dispatch({ type: 'setWorld', value: String(payload == null ? '' : payload).trim() });
    case 'dismiss-legacy': return typeof engine.dismissLegacy === 'function' ? engine.dismissLegacy() : { ok: false, reason: 'origin-op-unknown' };
    default: return { ok: false, reason: 'origin-op-unknown' };
    }
}

// 阅读器侧：登记了引擎、读得到设置且总开关开着时，给出 resolveOriginBinding 需要的原始对象；否则 null。
export function attachedOriginBinding() {
    if (!attached) return null;
    const { engine, hooks } = attached;
    let raw = null;
    try { raw = typeof hooks.settings === 'function' ? hooks.settings() : null; } catch (error) { raw = null; }
    if (!raw || !normalizeOriginSettings(raw).enabled) return null;
    return {
        engine,
        settings: raw,
        modal: hooks.modal,
        notice: hooks.notice,
        openSettings: hooks.openSettings,
        saveSetting: hooks.saveSetting,
    };
}
