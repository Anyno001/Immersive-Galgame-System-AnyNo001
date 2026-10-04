// 独处时「想象中的对象」：那个角色的立绘以朦胧的人影浮在画面一侧（背景 / CG 之上、立绘之下），向画面中心渐隐。
// 只用这一层自己的 opacity 与 transform 动画；人影的柔化写在这一小层上，不碰背景、立绘与 CG。
const states = new WeakMap();

function setAttr(el, name, value) {
    if (!el || typeof el.setAttribute !== 'function') return;
    if (value == null || value === false) {
        if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== String(value)) {
        el.setAttribute(name, String(value));
    }
}

function removeNode(node) {
    if (!node) return;
    if (typeof node.remove === 'function') node.remove();
    else if (node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function cssUrl(url) {
    return `url("${String(url).replace(/[\r\n]/g, '').replace(/["\\]/g, '\\$&')}")`;
}

function ensureFigure(state, stage) {
    if (state.el && state.el.parentNode) return state.el;
    const doc = stage.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const el = doc.createElement('div');
    el.className = 'igs-rm-dream';
    el.setAttribute('aria-hidden', 'true');
    const sprite = stage.querySelector('#igs-sprite');
    if (sprite && sprite.parentNode === stage) stage.insertBefore(el, sprite);
    else stage.appendChild(el);
    state.el = el;
    return el;
}

// 淡出后再移除节点；淡出期间又要显示时直接复用。
const FADE_MS = 1900;

export function closeDreamFigure(stage) {
    const state = stage && states.get(stage);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    removeNode(state.el);
    states.delete(stage);
}

// info：{ url, side: 'l' | 'r' }；url 为空时淡出。返回是否在显示。
export function syncDreamFigure(stage, info = {}) {
    if (!stage) return false;
    let state = states.get(stage);
    const url = String(info.url || '');
    if (!url) {
        if (state && state.el) {
            setAttr(state.el, 'data-igs-rm-dream-on', null);
            if (!state.timer) {
                state.timer = setTimeout(() => closeDreamFigure(stage), FADE_MS);
                if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
            }
        }
        return false;
    }
    if (!state) {
        state = { el: null, url: '', timer: null };
        states.set(stage, state);
    }
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }
    const el = ensureFigure(state, stage);
    if (!el) return false;
    if (state.url !== url) {
        state.url = url;
        if (el.style) el.style.backgroundImage = cssUrl(url);
    }
    setAttr(el, 'data-igs-rm-dream-side', info.side === 'l' ? 'l' : 'r');
    setAttr(el, 'data-igs-rm-dream-on', '1');
    return true;
}

export const DREAM_STYLE_TEXT = `
#igs-stage-motion .igs-rm-dream{position:absolute;top:6%;bottom:0;right:-6%;width:44%;pointer-events:none;background-repeat:no-repeat;background-position:center bottom;background-size:contain;opacity:0;transition:opacity 1.8s ease;filter:blur(1.5px) saturate(.5) brightness(1.15);-webkit-mask-image:linear-gradient(270deg,#000 28%,transparent 92%);mask-image:linear-gradient(270deg,#000 28%,transparent 92%);animation:igs-rm-dream 9s ease-in-out infinite alternate;}
#igs-stage-motion .igs-rm-dream[data-igs-rm-dream-side="l"]{right:auto;left:-6%;-webkit-mask-image:linear-gradient(90deg,#000 28%,transparent 92%);mask-image:linear-gradient(90deg,#000 28%,transparent 92%);}
#igs-stage-motion .igs-rm-dream[data-igs-rm-dream-on]{opacity:.3;}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion .igs-rm-dream{filter:none;}
@keyframes igs-rm-dream{from{transform:translate3d(0,1.5%,0);}to{transform:translate3d(0,-1%,0) scale(1.02);}}
@media (pointer: coarse){#igs-stage-motion .igs-rm-dream{filter:none;}}
@media (prefers-reduced-motion: reduce){#igs-stage-motion .igs-rm-dream{animation:none;}}
`;
