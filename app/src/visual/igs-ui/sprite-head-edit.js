import { HEAD_ASPECT, markerToHead, headToMarker, measureStage, resolveSymbolPlacement, spriteDrawRect } from './fx-anchor.js';

const PREVIEW_KINDS = Object.freeze(['anger', 'surprise']);
const MIN_D = 12;

function make(doc, className) {
    const el = doc.createElement('div');
    el.className = className;
    return el;
}

// 头部标定层：盖住舞台接管指针。单指拖动 / 轻点定位，双指或滚轮调大小；实时预览青筋与 !? 的落点。
// sprite 为 { posX, posY, scale, naturalW, naturalH }，坐标一律换算为舞台 CSS 像素。
export function startHeadEdit({ motion, sprite, head, onChange }) {
    const doc = motion.ownerDocument;
    const layer = make(doc, 'igs-head-edit-layer');
    const marker = make(doc, 'igs-head-marker');
    const preview = PREVIEW_KINDS.map((kind) => {
        const el = make(doc, 'igs-fx-symbol is-preview');
        el.setAttribute('data-kind', kind);
        return el;
    });
    layer.appendChild(marker);
    for (const el of preview) layer.appendChild(el);
    motion.appendChild(layer);

    const stage = () => measureStage(motion);
    const rect = () => {
        const geo = stage();
        return geo ? spriteDrawRect(geo.stageW, geo.stageH, sprite) : null;
    };
    let m = { cx: 0, cy: 0, d: 40 };

    function render() {
        const geo = stage();
        if (!geo) return;
        m.d = Math.max(MIN_D, Math.min(Math.min(geo.stageW, geo.stageH), m.d));
        const h = m.d * HEAD_ASPECT;
        Object.assign(marker.style, { left: `${m.cx - m.d / 2}px`, top: `${m.cy - h / 2}px`, width: `${m.d}px`, height: `${h}px` });
        const r = rect();
        if (!r) return;
        const current = markerToHead(m, r);
        preview.forEach((el, i) => {
            const p = resolveSymbolPlacement(PREVIEW_KINDS[i], { ...geo, sprite: { ...sprite, head: current } });
            if (!p) return;
            el.style.left = `${p.x}px`;
            el.style.top = `${p.y}px`;
            el.style.setProperty('--igs-fx-size', `${p.size}px`);
            el.toggleAttribute('data-flip', p.flip);
        });
    }

    function setHead(next) {
        const r = rect();
        if (!r || !next) return;
        m = headToMarker(next, r);
        render();
    }

    function changed() {
        render();
        if (typeof onChange === 'function') onChange();
    }

    function toStage(event) {
        const box = layer.getBoundingClientRect();
        const ratio = box.width > 0 ? layer.clientWidth / box.width : 1;
        return { x: (event.clientX - box.left) * ratio, y: (event.clientY - box.top) * ratio, ratio };
    }

    const pointers = new Map();
    let drag = null;
    let pinch = null;
    layer.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { layer.setPointerCapture(event.pointerId); } catch { /* 旧浏览器不支持捕获 */ }
        if (pointers.size === 1) {
            drag = { x: event.clientX, y: event.clientY, cx: m.cx, cy: m.cy, moved: false, at: toStage(event) };
        } else if (pointers.size === 2) {
            drag = null;
            const [a, b] = [...pointers.values()];
            pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, d: m.d };
        }
    });
    layer.addEventListener('pointermove', (event) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (drag && pointers.size === 1) {
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 4) return;
            drag.moved = true;
            m.cx = drag.cx + dx * drag.at.ratio;
            m.cy = drag.cy + dy * drag.at.ratio;
            changed();
        } else if (pinch && pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            m.d = pinch.d * (Math.hypot(b.x - a.x, b.y - a.y) / pinch.dist);
            changed();
        }
    });
    const end = (event) => {
        if (drag && !drag.moved && pointers.size === 1) {
            m.cx = drag.at.x;
            m.cy = drag.at.y;
            changed();
        }
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 0) drag = null;
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', (event) => { if (drag) drag.moved = true; end(event); });
    layer.addEventListener('wheel', (event) => {
        event.preventDefault();
        m.d *= event.deltaY < 0 ? 1.08 : 0.93;
        changed();
    }, { passive: false });

    setHead(head);
    return {
        getHead() {
            const r = rect();
            return r ? markerToHead(m, r) : null;
        },
        setHead,
        destroy() { layer.remove(); },
    };
}
