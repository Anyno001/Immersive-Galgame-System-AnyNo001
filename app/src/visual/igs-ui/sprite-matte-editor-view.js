// 遮罩修复编辑器视图：Canvas 编解码、棋盘底预览、Pointer Events 画笔（鼠标与触控）。
// 编辑只在会话内存中进行，点「保存」才经控制层按 revision 提交。

export const MATTE_EDITOR_STYLE_TEXT = `
#igs-matte-editor{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:rgba(10,12,18,.92);color:#fff;font-size:13px}
.igs-matte-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
.igs-matte-toolbar button{min-height:36px;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;cursor:pointer}
.igs-matte-toolbar button.is-active{background:rgba(92,170,255,.35);border-color:rgba(92,170,255,.8)}
.igs-matte-toolbar button:disabled{opacity:.4;cursor:not-allowed}
.igs-matte-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto;padding:10px}
.igs-matte-canvas{max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;background-color:#ccc;background-image:linear-gradient(45deg,#999 25%,transparent 25%),linear-gradient(-45deg,#999 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#999 75%),linear-gradient(-45deg,transparent 75%,#999 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.igs-matte-message{padding:6px 10px;min-height:20px;opacity:.85}
.igs-matte-candidate{max-width:45%;max-height:100%;margin-right:8px;border:1px solid rgba(92,170,255,.8)}
.igs-matte-candidate[hidden]{display:none}
.igs-matte-toolbar input[type=text]{min-height:32px;min-width:0;flex:1 1 140px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.25);color:inherit}
`;

// decodeImage(dataUrl) -> { width, height, data }；encodePixels({ width, height, data }) -> PNG dataUrl。
export function createCanvasImageCodec(globalObject = globalThis) {
    const doc = globalObject && globalObject.document;
    const available = Boolean(doc && typeof doc.createElement === 'function' && typeof globalObject.Image === 'function');
    const canvasOf = (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
    return {
        available,
        async decodeImage(dataUrl) {
            if (!available) throw new Error('no-canvas');
            const img = await new Promise((resolve, reject) => {
                const i = new globalObject.Image();
                i.onload = () => resolve(i);
                i.onerror = () => reject(new Error('image-load-failed'));
                i.src = dataUrl;
            });
            const c = canvasOf(img.naturalWidth || img.width, img.naturalHeight || img.height);
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
        },
        async encodePixels({ width, height, data }) {
            if (!available) throw new Error('no-canvas');
            const c = canvasOf(width, height);
            const ctx = c.getContext('2d');
            const img = ctx.createImageData(width, height);
            img.data.set(data);
            ctx.putImageData(img, 0, 0);
            return c.toDataURL('image/png');
        },
    };
}
