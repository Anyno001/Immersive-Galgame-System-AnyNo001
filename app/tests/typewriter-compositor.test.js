import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevealBands, startCompositedReveal } from '../src/visual/igs-ui/typewriter-compositor.js';
import { measureClassicReveal } from '../src/visual/igs-ui/typewriter-classic.js';

// 三行六个字，行间留空：每行两字，第二字右沿 40。
const BOXES = [
    { top: 0, bottom: 20, left: 0, right: 20 }, { top: 0, bottom: 20, left: 20, right: 40 },
    { top: 30, bottom: 50, left: 0, right: 20 }, { top: 30, bottom: 50, left: 20, right: 40 },
    { top: 60, bottom: 80, left: 0, right: 20 }, { top: 60, bottom: 80, left: 20, right: 40 },
].map((box) => ({ ...box, width: box.right - box.left, height: box.bottom - box.top }));

function measuredRoot() {
    const node = { nodeType: 3, nodeValue: '一二三四五六', childNodes: [] };
    const root = { nodeType: 1, childNodes: [node], dataset: {} };
    root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 90, width: 100, height: 90 });
    root.ownerDocument = { createRange() {
        let start = 0;
        return { setStart(_n, offset) { start = offset; }, setEnd() {}, getClientRects: () => [BOXES[start]] };
    } };
    return root;
}

const pct = (value) => Number(String(value).replace('%', ''));

function polygonShows(clipPath, x, y, bounds) {
    if (clipPath === 'inset(0 0 0 0)') return true;
    const pts = clipPath.slice('polygon('.length, -1).split(',').map((p) => p.trim().split(/\s+/).map(pct));
    const top = pts[2][1] / 100 * bounds.height;
    const right = pts[3][0] / 100 * bounds.width;
    const bottom = pts[4][1] / 100 * bounds.height;
    if (bottom === 0) return false;
    return y < top || (y <= bottom && x <= right);
}

function bandShows(bands, offset, x, y) {
    const band = bands.findLast((b) => y >= b.top) || bands[0];
    let visible = 0;
    for (const stop of band.stops) if (stop.offset <= offset) visible = stop.x;
    return x <= visible;
}

test('gate:typewriter:composited-bands-reveal-the-same-glyphs-as-the-clip-mask-at-every-step', () => {
    const classic = measureClassicReveal(measuredRoot(), 40, {});
    const bands = buildRevealBands(classic.layout);
    assert.equal(bands.length, 3);
    assert.deepEqual(bands.map((b) => [b.top, b.height]), [[0, 30], [30, 30], [60, 30]]);
    const bounds = { width: 100, height: 90 };
    const centers = BOXES.map((box) => [(box.left + box.right) / 2, (box.top + box.bottom) / 2]);
    for (const frame of classic.frames.slice(0, -1)) {
        const mask = centers.map(([x, y]) => polygonShows(frame.clipPath, x, y, bounds));
        const composited = centers.map(([x, y]) => bandShows(bands, frame.offset, x, y));
        assert.deepEqual(composited, mask, `offset ${frame.offset}`);
    }
    for (const band of bands) assert.deepEqual(band.stops.at(-1), { offset: 1, x: 100 });
});

test('gate:typewriter:composited-bands-refuse-out-of-order-lines', () => {
    assert.equal(buildRevealBands({ width: 100, height: 60, lines: [{ top: 30 }, { top: 0 }], steps: [] }), null);
    assert.equal(buildRevealBands({ width: 0, height: 60, lines: [{ top: 0 }], steps: [] }), null);
});

function fakeStyle() {
    const map = new Map();
    return {
        map,
        setProperty(name, value, priority = '') { map.set(name, [String(value), priority]); },
        getPropertyValue(name) { return map.has(name) ? map.get(name)[0] : ''; },
        getPropertyPriority(name) { return map.has(name) ? map.get(name)[1] : ''; },
        removeProperty(name) { map.delete(name); },
    };
}

function fakeDom() {
    const animations = [];
    const doc = { timeline: { currentTime: 1234 }, defaultView: {} };
    const makeEl = (tag) => {
        const el = {
            tag, style: fakeStyle(), childNodes: [], parentNode: null, attrs: new Map(),
            get nextSibling() { const kids = el.parentNode ? el.parentNode.childNodes : []; return kids[kids.indexOf(el) + 1] || null; },
            setAttribute(k, v) { el.attrs.set(k, String(v)); },
            getAttribute(k) { return el.attrs.has(k) ? el.attrs.get(k) : null; },
            removeAttribute(k) { el.attrs.delete(k); },
            appendChild(child) { child.parentNode = el; el.childNodes.push(child); return child; },
            insertBefore(child, ref) {
                child.parentNode = el;
                const i = ref ? el.childNodes.indexOf(ref) : -1;
                if (i < 0) el.childNodes.push(child); else el.childNodes.splice(i, 0, child);
                return child;
            },
            remove() { if (el.parentNode) el.parentNode.childNodes = el.parentNode.childNodes.filter((c) => c !== el); el.parentNode = null; },
            animate(frames, timing) {
                const listeners = {};
                const animation = {
                    el, frames, timing, startTime: null, cancelled: false,
                    cancel() { animation.cancelled = true; },
                    addEventListener(type, fn) { listeners[type] = fn; },
                    fire(type) { listeners[type]?.(); },
                };
                animations.push(animation);
                return animation;
            },
        };
        return el;
    };
    doc.createElement = makeEl;
    const dialog = makeEl('dialog');
    const text = makeEl('text');
    text.id = 'igs-text';
    text.ownerDocument = doc;
    Object.assign(text, { offsetWidth: 200, offsetHeight: 90, offsetLeft: 26, offsetTop: 40, scrollTop: 0, scrollLeft: 0 });
    text.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 45 });
    text.cloneNode = () => { const copy = makeEl('face'); copy.id = text.id; return copy; };
    dialog.appendChild(text);
    const after = dialog.appendChild(makeEl('controls'));
    text.offsetParent = dialog;
    return { doc, dialog, text, after, animations };
}

test('gate:typewriter:composited-reveal-mounts-one-window-per-line-and-restores-on-finish', () => {
    const { dialog, text, after, animations } = fakeDom();
    text.style.setProperty('visibility', 'visible');
    const layout = { width: 100, height: 45, lines: [{ top: 0 }, { top: 22.4 }], steps: [{ line: 0, right: 50, offset: 0.5 }, { line: 1, right: 25, offset: 1 }] };
    const timing = { duration: 400, easing: 'linear', fill: 'both' };
    const reveal = startCompositedReveal(text, { layout }, timing);
    assert.ok(reveal && reveal.composited);
    const overlay = dialog.childNodes[1];
    assert.equal(dialog.childNodes[2], after, 'overlay sits right after the text box');
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(overlay.style.getPropertyValue('left'), '26px');
    assert.deepEqual([text.style.getPropertyValue('visibility'), text.style.getPropertyPriority('visibility')], ['hidden', 'important']);
    assert.equal(overlay.childNodes.length, 2);
    // 屏幕像素 ×2 换算回 CSS 像素：第二行窗口从 45px 开始，副本上移同样距离。
    const [w0, w1] = overlay.childNodes;
    assert.deepEqual([w0.style.getPropertyValue('top'), w0.style.getPropertyValue('height')], ['0px', '45px']);
    assert.deepEqual([w1.style.getPropertyValue('top'), w1.style.getPropertyValue('height')], ['45px', '45px']);
    assert.equal(w1.childNodes[0].style.getPropertyValue('top'), '-45px');
    assert.equal(w1.style.getPropertyValue('overflow'), 'hidden');
    assert.equal(animations.length, 4);
    assert.ok(animations.every((a) => a.timing === timing && a.startTime === 1234), 'all layers start together');
    const [winAnim, faceAnim] = animations;
    assert.deepEqual(winAnim.frames.map((f) => f.transform), ['translateX(-200.00px)', 'translateX(-100.00px)', 'translateX(0.00px)']);
    assert.deepEqual(faceAnim.frames.map((f) => f.transform), ['translateX(200.00px)', 'translateX(100.00px)', 'translateX(0.00px)']);
    assert.deepEqual(winAnim.frames.map((f) => f.easing), ['steps(1, end)', 'steps(1, end)', undefined]);
    let finished = 0;
    reveal.addEventListener('finish', () => { finished += 1; });
    winAnim.fire('finish');
    assert.equal(finished, 1);
    assert.equal(dialog.childNodes.includes(overlay), false);
    assert.equal(text.style.getPropertyValue('visibility'), 'visible');
    reveal.cancel();
    assert.equal(finished, 1, 'cancel after finish only cleans up');
});

test('gate:typewriter:composited-soft-reveal-and-cancel-show-full-text', () => {
    const { dialog, text, animations } = fakeDom();
    const reveal = startCompositedReveal(text, { soft: true }, { duration: 600, easing: 'ease-out', fill: 'both' });
    assert.equal(animations.length, 2);
    assert.deepEqual(animations[0].frames, [{ opacity: 0, transform: 'translateX(-200px)' }, { opacity: 1, transform: 'translateX(0px)' }]);
    assert.deepEqual(animations[1].frames.map((f) => f.transform), ['translateX(200px)', 'translateX(0px)']);
    let cancelled = 0;
    reveal.addEventListener('cancel', () => { cancelled += 1; });
    reveal.cancel();
    assert.equal(cancelled, 1);
    assert.ok(animations.every((a) => a.cancelled));
    assert.equal(dialog.childNodes.length, 2);
    assert.equal(text.style.getPropertyValue('visibility'), '');
});

test('gate:typewriter:composited-reveal-falls-back-when-geometry-is-unsafe', () => {
    const scrolled = fakeDom();
    scrolled.text.scrollTop = 12;
    assert.equal(startCompositedReveal(scrolled.text, { soft: true }, {}), null);
    const detached = fakeDom();
    detached.text.offsetParent = null;
    assert.equal(startCompositedReveal(detached.text, { soft: true }, {}), null);
    assert.equal(detached.dialog.childNodes.length, 2, 'nothing mounted on fallback');
});
