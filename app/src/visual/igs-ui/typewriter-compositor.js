// 打字机的合成线程揭示：原文字框隐藏（保留排版），每个视觉行一扇「窗」，窗内放一份文字框副本。
// 窗向右平移、副本反向平移同样距离，文字不动而可见右沿逐字推进。只动 transform / opacity，
// 由合成线程推进，翻页时主线程再忙也不会卡字；逐字时刻与原 clip-path 遮罩一致。
// 任一前提不满足（无 WAAPI、文字框不以父节点定位、已滚动、行序异常）返回 null，由调用方退回 clip-path 遮罩。

import { floatKeyframes, floatTiming } from './typewriter-underwater.js';

const STEP = 'steps(1, end)';

// 逐行时间轴：窗口 i 的可见右沿 x——当前字在更下面的行则整行揭开，在本行取该字右沿，在更上面的行则未揭开。
export function buildRevealBands(layout) {
    const { width, height, lines, steps } = layout || {};
    if (!(width > 0) || !(height > 0) || !Array.isArray(lines) || !lines.length || !Array.isArray(steps)) return null;
    for (let i = 1; i < lines.length; i += 1) {
        if (!(lines[i].top >= lines[i - 1].top)) return null;
    }
    return lines.map((line, band) => {
        const top = band === 0 ? 0 : line.top;
        const bottom = band + 1 < lines.length ? lines[band + 1].top : height;
        const stops = [{ offset: 0, x: 0 }];
        let x = 0;
        for (const step of steps) {
            const next = step.line > band ? width : step.line === band ? Math.min(width, Math.max(0, step.right)) : 0;
            if (next === x) continue;
            stops.push({ offset: step.offset, x: next });
            x = next;
        }
        const tail = stops[stops.length - 1];
        if (!(tail.offset === 1 && tail.x === width)) stops.push({ offset: 1, x: width });
        return { top, height: Math.max(0, bottom - top), stops };
    });
}

function bandKeyframes(band, width, sx) {
    const last = band.stops.length - 1;
    const frames = (sign) => band.stops.map((stop, index) => ({
        offset: stop.offset,
        transform: `translateX(${(sign * (stop.x - width) * sx).toFixed(2)}px)`,
        ...(index < last ? { easing: STEP } : {}),
    }));
    return { window: frames(1), face: frames(-1) };
}

function softKeyframes(width) {
    return {
        window: [{ opacity: 0, transform: `translateX(${-width}px)` }, { opacity: 1, transform: 'translateX(0px)' }],
        face: [{ transform: `translateX(${width}px)` }, { transform: 'translateX(0px)' }],
    };
}

function pathOf(root, node) {
    const path = [];
    for (let cur = node; cur && cur !== root; cur = cur.parentNode) {
        const parent = cur.parentNode;
        if (!parent) return null;
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, cur));
    }
    return path;
}

function nodeAt(root, path) {
    let cur = root;
    for (const index of path) {
        cur = cur && cur.childNodes ? cur.childNodes[index] : null;
    }
    return cur;
}

function copyAttribute(from, to, name) {
    if (!to || typeof to.setAttribute !== 'function') return;
    const value = from.getAttribute(name);
    if (value == null) to.removeAttribute(name);
    else to.setAttribute(name, value);
}

function setStyles(el, styles) {
    for (const [name, value] of Object.entries(styles)) el.style.setProperty(name, value);
}

export function startCompositedReveal(target, reveal, timing) {
    const doc = target && target.ownerDocument;
    const view = doc && doc.defaultView;
    const parent = target && target.parentNode;
    if (!view || !parent || typeof parent.insertBefore !== 'function' || typeof target.cloneNode !== 'function'
        || typeof target.animate !== 'function' || typeof doc.createElement !== 'function' || typeof target.getBoundingClientRect !== 'function') return null;
    if (target.offsetParent !== parent || target.scrollTop || target.scrollLeft) return null;
    const rect = target.getBoundingClientRect();
    const width = target.offsetWidth;
    const height = target.offsetHeight;
    if (!(width > 0 && height > 0 && rect.width > 0 && rect.height > 0)) return null;
    // 测量是屏幕像素；对话框缩放时换算回文字框自身的 CSS 像素。
    const sx = width / rect.width;
    const sy = height / rect.height;
    const bands = reveal && reveal.layout ? buildRevealBands(reveal.layout) : [{ top: 0, height: rect.height, stops: null }];
    if (!bands) return null;

    const overlay = doc.createElement('div');
    overlay.className = 'igs-tw-reveal';
    overlay.setAttribute('aria-hidden', 'true');
    setStyles(overlay, {
        position: 'absolute', left: `${target.offsetLeft}px`, top: `${target.offsetTop}px`, width: `${width}px`, height: `${height}px`,
        margin: '0', padding: '0', border: '0', 'pointer-events': 'none', visibility: 'visible',
    });
    const faces = [];
    const animations = [];
    const floats = [];
    let bandTop = 0;
    bands.forEach((band, index) => {
        const top = index === 0 ? 0 : Math.round(band.top * sy);
        const bottom = index + 1 < bands.length ? Math.round(bands[index + 1].top * sy) : height;
        bandTop = top;
        const win = doc.createElement('div');
        setStyles(win, {
            position: 'absolute', left: '0', top: `${top}px`, width: `${width}px`, height: `${Math.max(0, bottom - top)}px`,
            margin: '0', padding: '0', border: '0', overflow: 'hidden',
        });
        const face = target.cloneNode(true);
        setStyles(face, {
            position: 'absolute', left: '0', top: `${-bandTop}px`, width: `${width}px`, height: `${height}px`,
            margin: '0', 'box-sizing': 'border-box', 'min-height': '0', 'max-height': 'none', visibility: 'visible',
        });
        win.appendChild(face);
        overlay.appendChild(win);
        faces.push(face);
        const frames = band.stops ? bandKeyframes(band, rect.width, sx) : softKeyframes(width);
        animations.push([win, frames.window], [face, frames.face]);
        // 水下：这一行被揭开的那一刻起，副本叠加一段从下往上的浮起（composite add，不影响逐字推进）。
        if (reveal && reveal.float) {
            const first = band.stops ? band.stops.find((stop) => stop.x > 0) : null;
            floats.push([face, (timing.delay || 0) + (first ? first.offset : 0) * timing.duration]);
        }
    });

    const prevVisibility = target.style.getPropertyValue('visibility');
    const prevPriority = target.style.getPropertyPriority('visibility');
    parent.insertBefore(overlay, target.nextSibling);
    target.style.setProperty('visibility', 'hidden', 'important');

    const listeners = { finish: new Set(), cancel: new Set() };
    let ended = false;
    let cleaned = false;
    let mutations = null;
    let resize = null;
    const running = [];
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        mutations?.disconnect();
        resize?.disconnect();
        overlay.remove();
        if (prevVisibility) target.style.setProperty('visibility', prevVisibility, prevPriority);
        else target.style.removeProperty('visibility');
    };
    const end = (type) => {
        if (ended) { cleanup(); return; }
        ended = true;
        if (type === 'cancel') for (const animation of running) animation.cancel();
        cleanup();
        for (const fn of Array.from(listeners[type])) fn();
    };
    const facade = {
        composited: true,
        cancel() { end('cancel'); },
        finish() { end('finish'); },
        addEventListener(type, fn) { listeners[type]?.add(fn); },
        removeEventListener(type, fn) { listeners[type]?.delete(fn); },
    };

    try {
        for (const [el, frames] of animations) running.push(el.animate(frames, timing));
        // 同一时刻起跑，窗与副本的平移才能逐帧抵消。
        const now = doc.timeline && doc.timeline.currentTime;
        if (now != null) for (const animation of running) animation.startTime = now;
        // 浮起动画排在逐字推进之后，running[0] 仍是第一扇窗的揭示；浮起失败不影响揭示。
        for (const [face, start] of floats) {
            try { running.push(face.animate(floatKeyframes(), floatTiming(start))); } catch { /* 不支持 composite 时不浮 */ }
        }
    } catch {
        for (const animation of running) animation.cancel?.();
        cleanup();
        return null;
    }
    running[0].addEventListener('finish', () => end('finish'), { once: true });

    // 揭示期间原文字框的属性变化（如文字演出武装、弹出延时）同步给副本；正文被替换则立即整页显示。
    if (typeof view.MutationObserver === 'function') {
        mutations = new view.MutationObserver((records) => {
            for (const record of records) {
                if (record.type !== 'attributes') { end('cancel'); return; }
                if (record.target === target && (record.attributeName === 'style' || record.attributeName === 'id')) continue;
                const path = pathOf(target, record.target);
                if (!path) continue;
                for (const face of faces) copyAttribute(record.target, nodeAt(face, path), record.attributeName);
            }
        });
        mutations.observe(target, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    // 文字框尺寸变化（窗口缩放、换皮肤）会让副本错位：直接收尾显示全文。
    if (typeof view.ResizeObserver === 'function') {
        let first = true;
        resize = new view.ResizeObserver(() => {
            if (first) { first = false; return; }
            end('cancel');
        });
        resize.observe(target);
    }
    return facade;
}
