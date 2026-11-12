// 选脸窗口：在底图上拖动、缩放一个椭圆，标出表情差分只重绘的脸部范围。
import { FACE_PROBE_W, scanFaceFromAlpha } from './fx-anchor.js';
import { faceBoxFromScan, normalizeFaceBox } from '../../generated-images/illustration/face-edit-plan.js';

export const FACE_PICKER_STYLE_TEXT = `
#igs-unified-settings .igs-face-picker{position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;gap:10px;padding:14px 16px;box-sizing:border-box;background:var(--igs-settings-panel);color:var(--igs-settings-ink);pointer-events:auto}
#igs-unified-settings .igs-face-picker-tip{font-size:13px;line-height:1.6}
#igs-unified-settings .igs-face-picker-wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control);overflow:hidden}
#igs-unified-settings .igs-face-picker-stage{position:relative;max-width:100%;max-height:100%;touch-action:none;user-select:none;line-height:0}
#igs-unified-settings .igs-face-picker-img{display:block;max-width:100%;max-height:100%;pointer-events:none;-webkit-user-drag:none}
#igs-unified-settings .igs-face-picker-ellipse{position:absolute;left:calc(var(--fx) * 100%);top:calc(var(--fy) * 100%);width:calc(var(--fw) * 100%);height:calc(var(--fh) * 100%);transform:translate(-50%,-50%);border-radius:50%;background:var(--igs-settings-accent);opacity:.38;cursor:move;touch-action:none}
#igs-unified-settings .igs-face-picker-handle{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--igs-settings-accent);touch-action:none}
#igs-unified-settings .igs-face-picker-handle[data-sx="-1"]{left:calc((var(--fx) - var(--fw) / 2) * 100%)}
#igs-unified-settings .igs-face-picker-handle[data-sx="0"]{left:calc(var(--fx) * 100%)}
#igs-unified-settings .igs-face-picker-handle[data-sx="1"]{left:calc((var(--fx) + var(--fw) / 2) * 100%)}
#igs-unified-settings .igs-face-picker-handle[data-sy="-1"]{top:calc((var(--fy) - var(--fh) / 2) * 100%)}
#igs-unified-settings .igs-face-picker-handle[data-sy="0"]{top:calc(var(--fy) * 100%)}
#igs-unified-settings .igs-face-picker-handle[data-sy="1"]{top:calc((var(--fy) + var(--fh) / 2) * 100%)}
#igs-unified-settings .igs-face-picker-actions{display:flex;gap:8px;justify-content:flex-end}
#igs-unified-settings .igs-face-picker-actions [data-face="redetect"]{margin-right:auto}
#igs-unified-settings .igs-face-picker-actions [data-face="ok"]{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
`;

const MIN_R = 0.01;
const HANDLES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

function detect(img) {
    const w = FACE_PROBE_W, ow = img.naturalWidth || img.width, oh = img.naturalHeight || img.height;
    const h = Math.max(1, Math.round(w * oh / ow));
    const canvas = img.ownerDocument.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let scan = null;
    try { ctx.drawImage(img, 0, 0, w, h); scan = scanFaceFromAlpha(ctx.getImageData(0, 0, w, h).data, w, h); } catch { scan = null; }
    return faceBoxFromScan(scan, ow, oh);
}

// 返回 Promise<{cx,cy,rx,ry}|null>；host 为设置器根节点，imageUrl 为底图地址，initial 为已存的脸框。
export function pickFaceBox({ host, imageUrl, initial = null, title = '拖动椭圆框住脸部，拖动圆点调整大小。' } = {}) {
    const doc = host && host.ownerDocument;
    if (!doc || !imageUrl) return Promise.resolve(null);
    return new Promise((resolve) => {
        const root = doc.createElement('div');
        root.className = 'igs-face-picker';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '调整脸部位置');
        const tip = doc.createElement('div'); tip.className = 'igs-face-picker-tip'; tip.textContent = title;
        const wrap = doc.createElement('div'); wrap.className = 'igs-face-picker-wrap';
        const stage = doc.createElement('div'); stage.className = 'igs-face-picker-stage';
        const img = doc.createElement('img'); img.className = 'igs-face-picker-img'; img.alt = '底图';
        const ellipse = doc.createElement('div'); ellipse.className = 'igs-face-picker-ellipse';
        stage.append(img, ellipse);
        const handles = HANDLES.map(([sx, sy]) => {
            const el = doc.createElement('div');
            el.className = 'igs-face-picker-handle';
            el.dataset.sx = String(sx); el.dataset.sy = String(sy);
            stage.appendChild(el);
            return el;
        });
        wrap.appendChild(stage);
        const actions = doc.createElement('div'); actions.className = 'igs-face-picker-actions';
        const button = (key, label) => {
            const b = doc.createElement('button');
            b.type = 'button'; b.className = 'igs-settings-action'; b.dataset.face = key; b.textContent = label;
            actions.appendChild(b);
            return b;
        };
        const redetect = button('redetect', '重新识别');
        const cancel = button('cancel', '取消');
        const ok = button('ok', '确认');
        root.append(tip, wrap, actions);

        let box = normalizeFaceBox(initial);
        const apply = () => {
            stage.style.setProperty('--fx', String(box.cx));
            stage.style.setProperty('--fy', String(box.cy));
            stage.style.setProperty('--fw', String(box.rx * 2));
            stage.style.setProperty('--fh', String(box.ry * 2));
        };
        const finish = (value) => { root.remove(); resolve(value); };
        const drag = (el, sx, sy) => {
            el.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                const rect = stage.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const start = { ...box }, x0 = event.clientX, y0 = event.clientY;
                el.setPointerCapture?.(event.pointerId);
                const move = (e) => {
                    const dx = (e.clientX - x0) / rect.width, dy = (e.clientY - y0) / rect.height;
                    let { cx, cy, rx, ry } = start;
                    if (sx === null) { cx += dx; cy += dy; }
                    else {
                        let left = start.cx - start.rx, right = start.cx + start.rx, top = start.cy - start.ry, bottom = start.cy + start.ry;
                        if (sx > 0) right = Math.max(left + 2 * MIN_R, right + dx); else if (sx < 0) left = Math.min(right - 2 * MIN_R, left + dx);
                        if (sy > 0) bottom = Math.max(top + 2 * MIN_R, bottom + dy); else if (sy < 0) top = Math.min(bottom - 2 * MIN_R, top + dy);
                        cx = (left + right) / 2; rx = (right - left) / 2; cy = (top + bottom) / 2; ry = (bottom - top) / 2;
                    }
                    box = normalizeFaceBox({ cx, cy, rx, ry }) || box;
                    apply();
                };
                const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
                el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
            });
        };
        drag(ellipse, null, null);
        handles.forEach((el) => drag(el, Number(el.dataset.sx), Number(el.dataset.sy)));
        ok.addEventListener('click', () => finish(box));
        cancel.addEventListener('click', () => finish(null));
        redetect.addEventListener('click', () => { box = detect(img); apply(); });
        root.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(null); });
        img.addEventListener('load', () => { if (!box) box = detect(img); apply(); });
        img.addEventListener('error', () => finish(null));
        host.appendChild(root);
        img.src = imageUrl;
    });
}
