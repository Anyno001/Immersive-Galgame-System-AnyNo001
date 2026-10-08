import { normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';

// NSFW 挂 CG 时对话框左侧的裸体头像：快照装配层已按说话人和表情解析好 content.nsfwCgPortrait（旁白页为空）。
// 取景用立绘透明通道探测出的头位：头顶略上方起，到锁骨下一点止；下缘与左右两侧用渐变遮罩淡出，不硬切。
// 遮罩只用 linear-gradient，不用 mask-image:url(立绘)，外部图床缺 CORS 也不会露出整张。
// 头宽为单位的取景框：宽 2.5 头宽、高 3.125 头宽（框比例 4:5），头顶上方留 0.18 头宽。框贴对话框底边，可以往上超出对话框。
const CROP_W = 2.5;
const CROP_H = 3.125;
const HEAD_ROOM = 0.18;
const MIN_W = 110;
const MAX_W = 300;
const WIDTH_RATIO = 0.32;
const FADE_MS = 260;

export const CG_PORTRAIT_STYLE_TEXT = `
#igs-overlay #igs-cg-portrait{position:absolute;left:0;bottom:0;width:var(--igs-cgp-w,160px);aspect-ratio:4/5;overflow:hidden;pointer-events:none;z-index:1;opacity:0;transition:opacity ${FADE_MS}ms ease;
-webkit-mask-image:linear-gradient(to bottom,#000 70%,transparent),linear-gradient(to right,transparent,#000 12%,#000 88%,transparent);-webkit-mask-composite:source-in;
mask-image:linear-gradient(to bottom,#000 70%,transparent),linear-gradient(to right,transparent,#000 12%,#000 88%,transparent);mask-composite:intersect;}
#igs-overlay #igs-dialog[data-igs-cgp] > #igs-cg-portrait{opacity:1;}
#igs-overlay #igs-cg-portrait.is-editing{pointer-events:auto;cursor:grab;touch-action:none;outline:2px dashed rgba(255,255,255,.5);outline-offset:-2px;}
#igs-overlay #igs-cg-portrait.is-dragging{cursor:grabbing;}
#igs-overlay #igs-cg-portrait > img{position:absolute;max-width:none;height:auto;opacity:0;transition:opacity ${FADE_MS}ms ease;transform-origin:50% 30%;user-select:none;-webkit-user-drag:none;}
#igs-overlay #igs-cg-portrait > img.is-in{opacity:1;}
#igs-overlay #igs-dialog[data-igs-cgp] #igs-text,#igs-overlay #igs-dialog[data-igs-cgp] #igs-speaker{margin-left:calc(var(--igs-cgp-w,160px) - 14px);}
`;

// 取景框在原图上的位置换算成 <img> 相对框的百分比（宽、左按框宽，上按框高）。
export function computeCgPortraitCrop(info, { shift = 0, shiftX = 0, zoom = 100 } = {}) {
    if (!info || !(info.naturalW > 0) || !(info.naturalH > 0) || !info.head) return null;
    const z = Math.max(0.5, Number(zoom) / 100 || 1);
    const head = info.head.w * info.naturalW;
    const cropW = CROP_W * head / z;
    const cropH = CROP_H * head / z;
    const left = info.head.x * info.naturalW - cropW / 2 + (Number(shiftX) || 0) / 100 * head;
    const top = info.head.top * info.naturalH - HEAD_ROOM * head / z + (Number(shift) || 0) / 100 * head;
    return {
        width: info.naturalW / cropW * 100,
        left: -left / cropW * 100,
        top: -top / cropH * 100,
    };
}

function clearPortrait(dialog) {
    const editing = dialog.querySelector('#igs-cg-portrait.is-editing');
    if (editing && typeof editing.igsEditDone === 'function') editing.igsEditDone(false);
    if (dialog.hasAttribute('data-igs-cgp')) dialog.removeAttribute('data-igs-cgp');
    if (dialog.hasAttribute('data-igs-cgp-src')) dialog.removeAttribute('data-igs-cgp-src');
    const box = dialog.querySelector('#igs-cg-portrait');
    if (box) box.dataset.key = '';
}

// 按当前 igsDrag 取景重排框里的图（编辑中本地预览，不存设置）。
function reframe(box) {
    const drag = box.igsDrag;
    const crop = drag && computeCgPortraitCrop(drag.info, drag);
    if (!crop) return;
    for (const img of Array.from(box.children)) {
        img.style.width = `${crop.width}%`;
        img.style.left = `${crop.left}%`;
        img.style.top = `${crop.top}%`;
        img.style.transform = '';
    }
}

// 和「调整立绘」一样：只在编辑态下能改取景。单指/鼠标拖动平移，双指捏合或滚轮缩放，手势中整张图跟手预览，
// 松手按头宽折算成偏移、缩放先留在本地，点「保存」才交给 onMove 存设置。编辑态下头像上的点击不往下传。
function bindDrag(box) {
    const stop = (event) => { if (box.classList.contains('is-editing')) event.stopPropagation(); };
    for (const type of ['click', 'mousedown', 'touchstart', 'contextmenu']) box.addEventListener(type, stop);
    const points = new Map();
    let gesture = null;
    const save = (dx, dy, scale) => {
        const drag = box.igsDrag;
        const headPx = (box.clientWidth || 0) * drag.zoom / 100 / CROP_W;
        if (!(headPx > 0)) return;
        // 框宽 = CROP_W 个头宽 / 缩放，图往下拖 = 取景框上移。限幅与设置归一化一致。
        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
        drag.shift = clamp(drag.shift - dy / headPx * 100, -120, 120);
        drag.shiftX = clamp(drag.shiftX - dx / headPx * 100, -120, 120);
        drag.zoom = clamp(drag.zoom * scale, 50, 250);
        reframe(box);
    };
    const preview = (dx, dy, scale) => {
        for (const img of Array.from(box.children)) img.style.transform = `translate(${dx}px,${dy}px) scale(${scale})`;
    };
    const spread = () => {
        const [a, b] = Array.from(points.values());
        return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const center = () => {
        const list = Array.from(points.values());
        return { x: list.reduce((n, p) => n + p.x, 0) / list.length, y: list.reduce((n, p) => n + p.y, 0) / list.length };
    };
    // 手指数变化时把已走的位移、缩放累计下来，从新的中心和指距重新起算。
    const restart = () => {
        const c = center();
        gesture = { dx: gesture ? gesture.curDx : 0, dy: gesture ? gesture.curDy : 0, scale: gesture ? gesture.curScale : 1, x0: c.x, y0: c.y, d0: spread() };
        gesture.curDx = gesture.dx;
        gesture.curDy = gesture.dy;
        gesture.curScale = gesture.scale;
    };
    box.addEventListener('pointerdown', (event) => {
        const drag = box.igsDrag;
        if (!drag || !box.classList.contains('is-editing') || event.button > 0) return;
        event.stopPropagation();
        event.preventDefault();
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (typeof box.setPointerCapture === 'function') box.setPointerCapture(event.pointerId);
        box.classList.add('is-dragging');
        restart();
    });
    box.addEventListener('pointermove', (event) => {
        if (!gesture || !points.has(event.pointerId)) return;
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const c = center();
        gesture.curDx = gesture.dx + c.x - gesture.x0;
        gesture.curDy = gesture.dy + c.y - gesture.y0;
        if (gesture.d0 > 0) gesture.curScale = Math.max(0.3, Math.min(4, gesture.scale * spread() / gesture.d0));
        preview(gesture.curDx, gesture.curDy, gesture.curScale);
    });
    const end = (event) => {
        if (!points.delete(event.pointerId) || !gesture) return;
        if (points.size) return restart();
        const { curDx: dx, curDy: dy, curScale: scale } = gesture;
        gesture = null;
        box.classList.remove('is-dragging');
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && Math.abs(scale - 1) < 0.03) return preview(0, 0, 1);
        save(dx, dy, scale);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    let wheelTimer = 0;
    let wheelScale = 1;
    box.addEventListener('wheel', (event) => {
        const drag = box.igsDrag;
        if (!drag || !box.classList.contains('is-editing')) return;
        event.stopPropagation();
        event.preventDefault();
        wheelScale = Math.max(0.3, Math.min(4, wheelScale * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
        preview(0, 0, wheelScale);
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { const scale = wheelScale; wheelScale = 1; save(0, 0, scale); }, 300);
    }, { passive: false });
}

// 「调整立绘」挂 CG 头像时进这里：出和立绘同款的编辑条，保存才写设置，取消恢复进入前的取景。没有头像返回 false。
export function enterCgPortraitEdit(overlay, ctx = {}) {
    const box = overlay && overlay.querySelector('#igs-dialog[data-igs-cgp] > #igs-cg-portrait');
    const drag = box && box.igsDrag;
    if (!drag || !drag.info) return false;
    if (box.classList.contains('is-editing')) return true;
    if (typeof ctx.closeSettings === 'function') ctx.closeSettings();
    const orig = { shift: drag.shift, shiftX: drag.shiftX, zoom: drag.zoom };
    const bar = overlay.ownerDocument.createElement('div');
    bar.id = 'igs-sprite-edit-bar';
    bar.innerHTML = '<span class="igs-se-hint">拖动调整头像，滚轮/双指缩放</span>'
        + '<button data-se="reset" type="button">还原</button>'
        + '<button data-se="cancel" type="button">取消</button>'
        + '<button data-se="save" class="igs-se-save" type="button">保存</button>';
    const clickLayer = overlay.querySelector('#igs-click-layer');
    if (clickLayer) clickLayer.style.pointerEvents = 'none';
    box.classList.add('is-editing');
    overlay.appendChild(bar);
    const done = (keep) => {
        box.igsEditDone = null;
        box.classList.remove('is-editing', 'is-dragging');
        bar.remove();
        if (clickLayer) clickLayer.style.pointerEvents = '';
        const now = box.igsDrag;
        if (!keep) {
            Object.assign(now, orig);
            reframe(box);
        } else if (typeof now.onMove === 'function') now.onMove({ shift: now.shift, shiftX: now.shiftX, zoom: now.zoom });
    };
    box.igsEditDone = done;
    bar.addEventListener('click', (event) => {
        event.stopPropagation();
        const btn = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-se]') : null;
        const act = btn ? btn.dataset.se : '';
        if (act === 'reset') {
            Object.assign(box.igsDrag, { shift: 0, shiftX: 0, zoom: 100 });
            reframe(box);
        } else if (act === 'cancel' || act === 'save') done(act === 'save');
    });
    return true;
}

function ensureBox(dialog) {
    let box = dialog.querySelector('#igs-cg-portrait');
    if (!box) {
        box = dialog.ownerDocument.createElement('div');
        box.id = 'igs-cg-portrait';
        box.setAttribute('aria-hidden', 'true');
        dialog.insertBefore(box, dialog.firstChild);
        bindDrag(box);
    }
    return box;
}

function showImage(box, url, crop) {
    const doc = box.ownerDocument;
    const img = doc.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.style.width = `${crop.width}%`;
    img.style.left = `${crop.left}%`;
    img.style.top = `${crop.top}%`;
    const reveal = () => {
        img.classList.add('is-in');
        // 换表情：新图淡入后再撤掉旧图，两张叠着过渡。
        for (const old of Array.from(box.children)) {
            if (old !== img) setTimeout(() => old.remove(), FADE_MS);
        }
    };
    img.onload = () => requestAnimationFrame(reveal);
    img.onerror = () => img.remove();
    img.src = url;
    box.appendChild(img);
}

export function applyCgPortrait(root, snapshot, ctx = {}) {
    const dialog = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-dialog') : null;
    if (!dialog) return;
    const content = (snapshot && snapshot.content) || {};
    const raw = String(content.nsfwCgPortrait || '').trim();
    const url = raw && typeof ctx.resolveAssetUrl === 'function' ? String(ctx.resolveAssetUrl(raw) || '').trim() : raw;
    if (!url) {
        // 本地图解码前解析结果会暂时为空。已经挂上的头像先留着，否则对话框边距和头像会反复淡入淡出。
        if (raw && dialog.getAttribute('data-igs-cgp-src') === raw) return;
        clearPortrait(dialog);
        return;
    }
    if (typeof dialog.setAttribute === 'function') dialog.setAttribute('data-igs-cgp-src', raw);
    const hud = normalizeStatusHudSettings(snapshot.readerSettings && snapshot.readerSettings.statusHud);
    const opts = { shift: hud.nsfwCgPortraitShift, shiftX: hud.nsfwCgPortraitShiftX, zoom: hud.nsfwCgPortraitZoom };
    const width = Math.round(Math.max(MIN_W, Math.min(MAX_W, (dialog.clientWidth || 0) * WIDTH_RATIO)));
    dialog.style.setProperty('--igs-cgp-w', `${width}px`);
    // 先占位让文字让开，图在头位探测完后淡入；同一张图同一取景不重建。
    dialog.setAttribute('data-igs-cgp', '');
    const box = ensureBox(dialog);
    const onMove = typeof ctx.onMove === 'function' ? (next) => ctx.onMove({ ...hud, nsfwCgPortraitShift: next.shift, nsfwCgPortraitShiftX: next.shiftX, nsfwCgPortraitZoom: next.zoom }) : null;
    // 编辑中重渲染：保留未保存的取景，只换存设置的回调。
    if (box.classList.contains('is-editing') && box.igsDrag) {
        box.igsDrag.onMove = onMove;
        return;
    }
    const key = `${url}|${opts.shift}|${opts.shiftX}|${opts.zoom}`;
    // 同一张图同一取景：沿用已探测到的头位，否则「调整立绘」会当成没有头像。
    const keepInfo = box.dataset.key === key && box.igsDrag ? box.igsDrag.info : null;
    box.igsDrag = { ...opts, info: keepInfo, onMove };
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const place = (info) => {
        if (box.dataset.key !== key || !box.isConnected) return;
        if (box.igsDrag) box.igsDrag.info = info;
        const crop = computeCgPortraitCrop(info, opts);
        if (crop) showImage(box, url, crop);
        else clearPortrait(dialog);
    };
    const known = peekSpriteHead(url);
    if (known) place(known);
    else probeSpriteHead(url, dialog.ownerDocument).then(place, () => place(null));
}
