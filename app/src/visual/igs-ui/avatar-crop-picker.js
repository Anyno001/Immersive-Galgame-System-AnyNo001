// 状态栏头像取景窗口：大圆框里按状态栏同一套算法裁立绘，拖动挪位置、滚轮 / 双指 / 拉杆缩放，旁边一个实际尺寸的小预览。
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';
import { statusHudSpriteCrop } from './reader-dom-render.js';
import { STATUS_HUD_AVATAR_SHIFT_MAX, STATUS_HUD_AVATAR_ZOOM_MAX, STATUS_HUD_AVATAR_ZOOM_MIN, normalizeAvatarCrop } from '../../data/shujuku/status-hud-model.js';

export const AVATAR_CROP_PICKER_STYLE_TEXT = `
#igs-unified-settings .igs-avatar-crop{position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;gap:12px;padding:14px 16px;box-sizing:border-box;background:var(--igs-settings-panel);color:var(--igs-settings-ink);pointer-events:auto}
#igs-unified-settings .igs-avatar-crop-tip{font-size:13px;line-height:1.6}
#igs-unified-settings .igs-avatar-crop-wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
#igs-unified-settings .igs-avatar-crop-box{position:relative;overflow:hidden;flex:none;background:var(--igs-settings-panel);touch-action:none;user-select:none}
#igs-unified-settings .igs-avatar-crop-box>img{position:absolute;max-width:none;height:auto;pointer-events:none;-webkit-user-drag:none}
#igs-unified-settings .igs-avatar-crop-box.is-big{width:min(240px,60vw);height:min(240px,60vw);cursor:grab}
#igs-unified-settings .igs-avatar-crop-box.is-big:active{cursor:grabbing}
#igs-unified-settings .igs-avatar-crop-box.is-small{width:56px;height:56px}
#igs-unified-settings .igs-avatar-crop-zoom{display:flex;align-items:center;gap:10px;font-size:13px}
#igs-unified-settings .igs-avatar-crop-zoom input{flex:1 1 auto;min-width:0}
#igs-unified-settings .igs-avatar-crop-zoom output{min-width:44px;text-align:right;color:var(--igs-settings-ink-3)}
#igs-unified-settings .igs-avatar-crop-actions{display:flex;gap:8px;justify-content:flex-end}
#igs-unified-settings .igs-avatar-crop-actions [data-crop="reset"]{margin-right:auto}
#igs-unified-settings .igs-avatar-crop-actions [data-crop="ok"]{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
`;

const DEFAULT_CROP = Object.freeze({ x: 0, y: 0, zoom: 100 });
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// 返回 Promise<{x,y,zoom}|null>；radius 跟状态栏头像圆角设置一致。
export function pickAvatarCrop({ host, imageUrl, initial = null, radius = '50%', title = '' } = {}) {
    const doc = host && host.ownerDocument;
    if (!doc || !imageUrl) return Promise.resolve(null);
    return new Promise((resolve) => {
        const el = (tag, cls) => { const node = doc.createElement(tag); if (cls) node.className = cls; return node; };
        const root = el('div', 'igs-avatar-crop');
        root.setAttribute('data-igs-transient', '');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '调整状态栏头像');
        const tip = el('div', 'igs-avatar-crop-tip');
        tip.textContent = title || '拖动大图调整位置，滚轮、双指或下方拉杆缩放。右边是状态栏里的实际大小。';
        const wrap = el('div', 'igs-avatar-crop-wrap');
        const frames = ['is-big', 'is-small'].map((size) => {
            const box = el('div', `igs-avatar-crop-box ${size}`);
            box.style.borderRadius = typeof radius === 'number' ? `${size === 'is-big' ? radius * 240 / 56 : radius}px` : radius;
            const img = el('img');
            img.alt = '';
            box.appendChild(img);
            wrap.appendChild(box);
            return { box, img };
        });
        const big = frames[0].box;
        const zoomRow = el('label', 'igs-avatar-crop-zoom');
        const zoomLabel = el('span'); zoomLabel.textContent = '缩放';
        const zoomInput = el('input');
        zoomInput.type = 'range'; zoomInput.min = String(STATUS_HUD_AVATAR_ZOOM_MIN); zoomInput.max = String(STATUS_HUD_AVATAR_ZOOM_MAX); zoomInput.step = '1';
        zoomInput.setAttribute('aria-label', '头像缩放');
        const zoomOut = el('output');
        zoomRow.append(zoomLabel, zoomInput, zoomOut);
        const actions = el('div', 'igs-avatar-crop-actions');
        const button = (key, label) => {
            const b = el('button', 'igs-settings-action');
            b.type = 'button'; b.dataset.crop = key; b.textContent = label;
            actions.appendChild(b);
            return b;
        };
        const reset = button('reset', '复位');
        const cancel = button('cancel', '取消');
        const ok = button('ok', '确认');
        root.append(tip, wrap, zoomRow, actions);

        let crop = { ...DEFAULT_CROP, ...(normalizeAvatarCrop(initial) || {}) };
        let probe = peekSpriteHead(imageUrl, doc);
        const apply = () => {
            const at = statusHudSpriteCrop(probe, crop);
            for (const { img } of frames) {
                img.style.width = `${at.width}%`;
                img.style.left = `${at.left}%`;
                img.style.top = `${at.top}%`;
            }
            zoomInput.value = String(crop.zoom);
            zoomOut.textContent = `${crop.zoom}%`;
        };
        const setCrop = (next) => {
            crop = {
                x: Math.round(clamp(next.x, -STATUS_HUD_AVATAR_SHIFT_MAX, STATUS_HUD_AVATAR_SHIFT_MAX)),
                y: Math.round(clamp(next.y, -STATUS_HUD_AVATAR_SHIFT_MAX, STATUS_HUD_AVATAR_SHIFT_MAX)),
                zoom: Math.round(clamp(next.zoom, STATUS_HUD_AVATAR_ZOOM_MIN, STATUS_HUD_AVATAR_ZOOM_MAX)),
            };
            apply();
        };
        const finish = (value) => { root.remove(); resolve(value); };

        // 单指拖动挪位置；两指捏合缩放。偏移单位是框宽的百分比，与状态栏一致。
        const pointers = new Map();
        let gesture = null;
        const startGesture = () => {
            const pts = [...pointers.values()];
            const size = big.getBoundingClientRect().width || 1;
            gesture = pts.length >= 2
                ? { pinch: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, start: { ...crop } }
                : pts.length === 1 ? { x0: pts[0].x, y0: pts[0].y, size, start: { ...crop } } : null;
        };
        big.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            big.setPointerCapture?.(event.pointerId);
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            startGesture();
        });
        big.addEventListener('pointermove', (event) => {
            if (!pointers.has(event.pointerId) || !gesture) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const pts = [...pointers.values()];
            if (gesture.pinch && pts.length >= 2) {
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                setCrop({ ...gesture.start, zoom: gesture.start.zoom * dist / gesture.pinch });
            } else if (!gesture.pinch) {
                setCrop({ ...gesture.start, x: gesture.start.x + (event.clientX - gesture.x0) / gesture.size * 100, y: gesture.start.y + (event.clientY - gesture.y0) / gesture.size * 100 });
            }
        });
        const lift = (event) => { pointers.delete(event.pointerId); startGesture(); };
        big.addEventListener('pointerup', lift);
        big.addEventListener('pointercancel', lift);
        big.addEventListener('wheel', (event) => {
            event.preventDefault();
            setCrop({ ...crop, zoom: crop.zoom * (event.deltaY < 0 ? 1.06 : 1 / 1.06) });
        }, { passive: false });
        zoomInput.addEventListener('input', () => setCrop({ ...crop, zoom: Number(zoomInput.value) }));
        reset.addEventListener('click', () => setCrop(DEFAULT_CROP));
        ok.addEventListener('click', () => finish({ ...crop }));
        cancel.addEventListener('click', () => finish(null));
        root.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(null); });
        frames[0].img.addEventListener('error', () => finish(null));
        for (const { img } of frames) img.src = imageUrl;
        apply();
        if (!probe) probeSpriteHead(imageUrl, doc).then((found) => { if (found && root.isConnected) { probe = found; apply(); } }, () => {});
        host.appendChild(root);
    });
}
