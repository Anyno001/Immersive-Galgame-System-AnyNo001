// DLC 公开接口：IGS.api.uiSkins（对话框皮肤）与 IGS.api.stageFx（演出标签）。
// 数据只存在各自的登记表里（visual/igs-ui/dlc-skin-registry.js、scene/fx-registry.js），这里只做校验、
// 打印警告和转发。接口只增不破：DLC_API_VERSION 往后只升不降，旧字段一直可用。
import { getDlcSkin, listDlcSkins, registerDlcSkin, unregisterDlcSkin } from '../visual/igs-ui/dlc-skin-registry.js';
import { guardDlcCss } from '../visual/igs-ui/dlc-css-guard.js';
import { getDlcFx, listDlcFx, registerDlcFx, unregisterDlcFx } from '../scene/fx-registry.js';

export const DLC_API_VERSION = 1;
export const DLC_QUEUE_KEY = 'IGS_DLC';

function report(kind, result) {
    if (!result || !Array.isArray(result.warnings) || !result.warnings.length) return result;
    try {
        const log = result.ok ? console.warn : console.error;
        for (const line of result.warnings) log(`[IGS DLC] ${kind}：${line}`);
    } catch (_) { /* 没有控制台 */ }
    return result;
}

// 对外只给只读快照，作者拿不到登记表里的函数引用以外的内部状态。
const skinView = (def) => (def ? { id: def.id, label: def.label, base: def.base, inherit: def.inherit, worldviews: [...def.worldviews], accent: def.accent } : null);
const fxView = (def) => (def ? { kind: def.kind, label: def.label, mode: def.mode, layer: def.layer, lifeMs: def.lifeMs } : null);

export function createUiSkinsApi() {
    return {
        register(def) { return report(`皮肤 ${def && def.id}`, registerDlcSkin(def)); },
        unregister(id) { return unregisterDlcSkin(id); },
        get(id) { return skinView(getDlcSkin(id)); },
        list() { return listDlcSkins().map(skinView); },
    };
}

export function createStageFxApi() {
    return {
        register(def) {
            if (!def || typeof def !== 'object') return report('演出', registerDlcFx(def));
            const kind = String(def.kind || '');
            // 演出样式只许写在 .dlc- 开头的类名下（可以带 #igs-overlay 前缀），动画名同样以 dlc- 开头。
            const guarded = guardDlcCss(typeof def.css === 'string' ? def.css : '', {
                allow: (selector) => /^(#igs-overlay\s+)?\.dlc-/.test(selector),
                label: `演出 ${kind}`,
            });
            const result = registerDlcFx({ ...def, cssText: guarded.css });
            if (result.ok) result.warnings = [...guarded.warnings, ...result.warnings];
            return report(`演出 ${kind}`, result);
        },
        unregister(kind) { return unregisterDlcFx(kind); },
        get(kind) { return fxView(getDlcFx(kind)); },
        list() { return listDlcFx().map(fxView); },
    };
}

// window.IGS_DLC 队列：IGS 启动前推进来的回调在这里统一执行；之后把 push 换成立即执行，
// 晚加载的 DLC 也不用关心先后。单个回调出错只记一条，不影响其它 DLC。
export function drainDlcQueue(globalObject, api) {
    if (!globalObject) return 0;
    const run = (callback) => {
        if (typeof callback !== 'function') return;
        try { callback(api); } catch (error) {
            try { console.error('[IGS DLC] 加载回调出错：', error); } catch (_) { /* 没有控制台 */ }
        }
    };
    const pending = Array.isArray(globalObject[DLC_QUEUE_KEY]) ? globalObject[DLC_QUEUE_KEY].slice() : [];
    const queue = [];
    queue.push = (...callbacks) => { callbacks.forEach(run); return queue.length; };
    globalObject[DLC_QUEUE_KEY] = queue;
    pending.forEach(run);
    return pending.length;
}
