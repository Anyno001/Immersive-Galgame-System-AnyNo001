import { CG_SHOTS, cgShotTransform } from './romance-senses.js';

// CG 镜头缓移：在 #igs-bg（CG 画在背景层上）的 transform 上跑一段慢速运镜，只动 transform，不加滤镜、不改尺寸。
// 状态挂在 #igs-stage-motion：data-igs-cgp 为 1 / 2 交替（换镜头时换动画名，让动画从头播），data-igs-cgp-hold 定格。
// 换镜头时从当前位置接着走（读一次计算样式），不会跳回起点。
const VARS = Object.freeze(['--igs-cgp-a', '--igs-cgp-b', '--igs-cgp-dur', '--igs-cgp-iter']);
const states = new WeakMap();

function setAttr(el, name, value) {
    if (!el || typeof el.setAttribute !== 'function') return;
    if (value == null || value === false) {
        if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== String(value)) {
        el.setAttribute(name, String(value));
    }
}

function setVar(el, name, value) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, String(value));
}

// 当前运镜位置（矩阵字符串）；读不到或没有变换时返回 ''。
function currentTransform(bg) {
    try {
        const view = bg && bg.ownerDocument && bg.ownerDocument.defaultView;
        const value = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(bg).transform : '';
        return value && value !== 'none' ? value : '';
    } catch {
        return '';
    }
}

export function cancelCgPan(stage) {
    if (!stage) return;
    setAttr(stage, 'data-igs-cgp', null);
    setAttr(stage, 'data-igs-cgp-hold', null);
    for (const name of VARS) setVar(stage, name, null);
    states.delete(stage);
}

// info：{ url, shot, hold }；shot 为空表示不运镜。返回实际在跑的镜头名。
export function syncCgPan(stage, info = {}) {
    const spec = info.url ? CG_SHOTS[info.shot] : null;
    if (!stage || !spec) {
        if (stage && states.has(stage)) cancelCgPan(stage);
        return '';
    }
    let state = states.get(stage);
    const fresh = !state;
    if (!state) {
        state = { url: '', shot: '', flip: 0 };
        states.set(stage, state);
    }
    if (state.url !== info.url || state.shot !== info.shot) {
        // 同一张 CG 换镜头：从当前位置接着走；换了一张 CG：从新镜头的起点开始。
        const sameCg = !fresh && state.url === info.url;
        const from = sameCg ? currentTransform(stage.querySelector && stage.querySelector('#igs-bg')) : '';
        state.url = info.url;
        state.shot = info.shot;
        state.flip = state.flip === 1 ? 2 : 1;
        setVar(stage, '--igs-cgp-a', from || cgShotTransform(spec.from));
        setVar(stage, '--igs-cgp-b', cgShotTransform(spec.to));
        setVar(stage, '--igs-cgp-dur', `${spec.dur}s`);
        setVar(stage, '--igs-cgp-iter', spec.loop ? 'infinite' : '1');
        setAttr(stage, 'data-igs-cgp', String(state.flip));
    }
    setAttr(stage, 'data-igs-cgp-hold', info.hold === true ? '1' : null);
    return info.shot;
}
