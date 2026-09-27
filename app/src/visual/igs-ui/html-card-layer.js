import { sanitizeHtmlCard } from '../../scene/html-cards.js';

const INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,details,label,audio,video';

// 卡片放进 Shadow DOM：模型输出的样式不外溢到酒馆页面，阅读器样式也不渗进卡片。
// contain + transform 让卡片里违规的 position:fixed 也只能相对卡片定位，撑不出舞台。
const CARD_SHADOW_STYLE = `
:host{all:initial;display:block;contain:layout paint;transform:translateZ(0);color:#222;font-size:14px;line-height:1.6;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
.igs-card-body{width:100%;max-width:100%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;}
.igs-card-body img,.igs-card-body svg,.igs-card-body video,.igs-card-body canvas{max-width:100%;height:auto;}
.igs-card-body table{max-width:100%;}
.igs-card-body *{max-width:100%;box-sizing:border-box;}
`.trim();

export function ensureHtmlCardLayer(root) {
    const existing = root.querySelector('#igs-card-layer');
    if (existing) return existing;
    const doc = root.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const layer = doc.createElement('div');
    layer.id = 'igs-card-layer';
    layer.className = 'igs-card-layer';
    layer.hidden = true;
    const scroller = doc.createElement('div');
    scroller.className = 'igs-card-scroll';
    const host = doc.createElement('div');
    host.className = 'igs-card-host';
    scroller.appendChild(host);
    layer.appendChild(scroller);
    const dialogLayer = root.querySelector('#igs-dialog-layer');
    const parent = (dialogLayer && dialogLayer.parentNode) || root.querySelector('#igs-stage-motion') || root;
    if (dialogLayer && dialogLayer.parentNode === parent) parent.insertBefore(layer, dialogLayer);
    else parent.appendChild(layer);
    return layer;
}

export function applyHtmlCardToDom(root, content, ctx = {}) {
    const active = Boolean(content && content.htmlCardPage);
    if (root.classList) root.classList.toggle('igs-html-card-page', active);
    const layer = active ? ensureHtmlCardLayer(root) : root.querySelector('#igs-card-layer');
    if (!layer) return;
    layer.hidden = !active;
    if (!active) return;
    const html = sanitizeHtmlCard(content.htmlCard);
    if (layer.dataset && layer.dataset.igsCardHtml === html) return;
    if (layer.dataset) layer.dataset.igsCardHtml = html;
    const host = layer.querySelector('.igs-card-host');
    const scroller = layer.querySelector('.igs-card-scroll');
    if (scroller) scroller.scrollTop = 0;
    renderCardHtml(host, html);
    bindCardPaging(layer, ctx);
}

function renderCardHtml(host, html) {
    if (!host) return;
    const markup = `<div class="igs-card-body">${html}</div>`;
    if (typeof host.attachShadow === 'function') {
        const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${CARD_SHADOW_STYLE}</style>${markup}`;
        return;
    }
    host.innerHTML = markup;
}

function bindCardPaging(layer, ctx) {
    if (layer.dataset && layer.dataset.igsBound) return;
    if (layer.dataset) layer.dataset.igsBound = '1';
    layer.addEventListener('click', (event) => {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        if (path.some((node) => node && typeof node.matches === 'function' && node.matches(INTERACTIVE_SELECTOR))) return;
        const selection = layer.ownerDocument && layer.ownerDocument.getSelection && layer.ownerDocument.getSelection();
        if (selection && String(selection).trim()) return;
        const rect = typeof layer.getBoundingClientRect === 'function'
            ? layer.getBoundingClientRect()
            : { left: 0, width: 0 };
        const clientX = Number(event.clientX);
        const action = !Number.isFinite(clientX) || clientX < rect.left + rect.width / 2 ? 'prev' : 'next';
        if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction(action);
    });
}

export const HTML_CARD_LAYER_STYLE_TEXT = `
#igs-card-layer{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:clamp(52px,9%,72px) clamp(10px,4%,32px) clamp(16px,5%,40px);box-sizing:border-box;cursor:pointer;}
#igs-card-layer[hidden]{display:none;}
#igs-card-layer .igs-card-scroll{width:min(720px,100%);max-height:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.45);scrollbar-width:thin;}
#igs-overlay.igs-html-card-page #igs-dialog-layer{visibility:hidden;}
#igs-overlay.igs-record-screen-open #igs-card-layer{display:none!important;}
`.trim();
