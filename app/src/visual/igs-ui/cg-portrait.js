import { normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';

// NSFW 挂 CG 时对话框左侧的裸体头像：快照装配层已按说话人和表情解析好 content.nsfwCgPortrait（旁白页为空）。
// 取景用立绘透明通道探测出的头位：头顶略上方起，到锁骨下一点止；下缘与左右两侧用渐变遮罩淡出，不硬切。
// 遮罩只用 linear-gradient，不用 mask-image:url(立绘)，外部图床缺 CORS 也不会露出整张。
// 头宽为单位的取景框：宽 2.5 头宽、高 2 头宽（框比例 5:4），头顶上方留 0.18 头宽。
const CROP_W = 2.5;
const CROP_H = 2;
const HEAD_ROOM = 0.18;
const MIN_W = 72;
const MAX_W = 200;
const WIDTH_RATIO = 0.24;
const FADE_MS = 260;

export const CG_PORTRAIT_STYLE_TEXT = `
#igs-overlay #igs-cg-portrait{position:absolute;left:0;bottom:0;width:var(--igs-cgp-w,160px);aspect-ratio:5/4;overflow:hidden;pointer-events:none;z-index:1;opacity:0;transition:opacity ${FADE_MS}ms ease;
-webkit-mask-image:linear-gradient(to bottom,#000 70%,transparent),linear-gradient(to right,transparent,#000 12%,#000 88%,transparent);-webkit-mask-composite:source-in;
mask-image:linear-gradient(to bottom,#000 70%,transparent),linear-gradient(to right,transparent,#000 12%,#000 88%,transparent);mask-composite:intersect;}
#igs-overlay #igs-dialog[data-igs-cgp] > #igs-cg-portrait{opacity:1;}
#igs-overlay #igs-cg-portrait > img{position:absolute;max-width:none;height:auto;opacity:0;transition:opacity ${FADE_MS}ms ease;user-select:none;-webkit-user-drag:none;}
#igs-overlay #igs-cg-portrait > img.is-in{opacity:1;}
#igs-overlay #igs-dialog[data-igs-cgp] #igs-text,#igs-overlay #igs-dialog[data-igs-cgp] #igs-speaker{margin-left:calc(var(--igs-cgp-w,160px) - 14px);}
`;

// 取景框在原图上的位置换算成 <img> 相对框的百分比（宽、左按框宽，上按框高）。
export function computeCgPortraitCrop(info, { shift = 0, zoom = 100 } = {}) {
    if (!info || !(info.naturalW > 0) || !(info.naturalH > 0) || !info.head) return null;
    const z = Math.max(0.5, Number(zoom) / 100 || 1);
    const head = info.head.w * info.naturalW;
    const cropW = CROP_W * head / z;
    const cropH = CROP_H * head / z;
    const left = info.head.x * info.naturalW - cropW / 2;
    const top = info.head.top * info.naturalH - HEAD_ROOM * head / z + (Number(shift) || 0) / 100 * head;
    return {
        width: info.naturalW / cropW * 100,
        left: -left / cropW * 100,
        top: -top / cropH * 100,
    };
}

function clearPortrait(dialog) {
    if (dialog.hasAttribute('data-igs-cgp')) dialog.removeAttribute('data-igs-cgp');
    if (dialog.hasAttribute('data-igs-cgp-src')) dialog.removeAttribute('data-igs-cgp-src');
    const box = dialog.querySelector('#igs-cg-portrait');
    if (box) box.dataset.key = '';
}

function ensureBox(dialog) {
    let box = dialog.querySelector('#igs-cg-portrait');
    if (!box) {
        box = dialog.ownerDocument.createElement('div');
        box.id = 'igs-cg-portrait';
        box.setAttribute('aria-hidden', 'true');
        dialog.insertBefore(box, dialog.firstChild);
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
    const opts = { shift: hud.nsfwCgPortraitShift, zoom: hud.nsfwCgPortraitZoom };
    const width = Math.round(Math.max(MIN_W, Math.min(MAX_W, (dialog.clientWidth || 0) * WIDTH_RATIO)));
    dialog.style.setProperty('--igs-cgp-w', `${width}px`);
    // 先占位让文字让开，图在头位探测完后淡入；同一张图同一取景不重建。
    dialog.setAttribute('data-igs-cgp', '');
    const box = ensureBox(dialog);
    const key = `${url}|${opts.shift}|${opts.zoom}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const place = (info) => {
        if (box.dataset.key !== key || !box.isConnected) return;
        const crop = computeCgPortraitCrop(info, opts);
        if (crop) showImage(box, url, crop);
        else clearPortrait(dialog);
    };
    const known = peekSpriteHead(url);
    if (known) place(known);
    else probeSpriteHead(url, dialog.ownerDocument).then(place, () => place(null));
}
