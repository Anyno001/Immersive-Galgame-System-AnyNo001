// 楼层内嵌模式的纯函数边界：只决定宿主 DOM 定位、即时样式与载入态，
// 不触碰阅读器内部 DOM、不读取消息数据，便于单测与宿主环境隔离。

export const EMBEDDED_HOST_ATTR = 'data-igs-embedded-host';
export const EMBEDDED_HOST_SELECTOR = '[data-igs-embedded-host="1"]';
export const EMBEDDED_TEXT_HIDDEN_ATTR = 'data-igs-embedded-hidden';
const PREVIOUS_DISPLAY_ATTR = 'data-igs-embedded-prev-display';
const PREVIOUS_DISPLAY_PRIORITY_ATTR = 'data-igs-embedded-prev-display-priority';
const PREVIOUS_ARIA_ATTR = 'data-igs-embedded-prev-aria';
const MISSING_VALUE = '__igs_missing__';

export function resolveEmbeddedHostParent(messageElement) {
    if (!messageElement || typeof messageElement.querySelector !== 'function') return null;
    const mesText = messageElement.querySelector('.mes_text');
    if (!mesText || !mesText.parentNode) return null;
    return { parent: mesText.parentNode, mesText };
}

export function findEmbeddedHost(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    return doc.querySelector(EMBEDDED_HOST_SELECTOR);
}

export function ensureEmbeddedHost(parent, doc, hostRef) {
    if (!parent || !doc || typeof doc.createElement !== 'function') return null;
    if (hostRef && hostRef.parentNode === parent) return hostRef;
    let host = hostRef;
    if (!host) {
        host = doc.createElement('div');
        host.setAttribute(EMBEDDED_HOST_ATTR, '1');
        host.setAttribute('data-igs-internal-reader', '1');
        host.className = 'igs-embedded-host';
    }
    const children = parent.children ? Array.from(parent.children) : [];
    const mesText = children.find((node) => node && node.classList && node.classList.contains('mes_text'));
    const mesIndex = mesText ? children.indexOf(mesText) : -1;
    const next = mesIndex >= 0 ? children[mesIndex + 1] : null;
    if (next && next !== host && typeof parent.insertBefore === 'function') parent.insertBefore(host, next);
    else if (host.parentNode !== parent && typeof parent.appendChild === 'function') parent.appendChild(host);
    return host;
}

export function hideEmbeddedSourceText(mesText) {
    if (!mesText || typeof mesText.setAttribute !== 'function') return;
    if (typeof mesText.getAttribute === 'function' && mesText.getAttribute(EMBEDDED_TEXT_HIDDEN_ATTR) === '1') {
        setDisplayStyle(mesText.style, 'none', 'important');
        mesText.setAttribute('aria-hidden', 'true');
        return;
    }
    const display = readDisplayValue(mesText.style);
    const priority = readDisplayPriority(mesText.style);
    const aria = typeof mesText.getAttribute === 'function' ? mesText.getAttribute('aria-hidden') : null;
    mesText.setAttribute(EMBEDDED_TEXT_HIDDEN_ATTR, '1');
    mesText.setAttribute(PREVIOUS_DISPLAY_ATTR, display);
    mesText.setAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTR, priority);
    mesText.setAttribute(PREVIOUS_ARIA_ATTR, aria == null ? MISSING_VALUE : String(aria));
    setDisplayStyle(mesText.style, 'none', 'important');
    mesText.setAttribute('aria-hidden', 'true');
}

export function restoreEmbeddedSourceText(mesText) {
    if (!mesText || typeof mesText.removeAttribute !== 'function') return;
    const display = typeof mesText.getAttribute === 'function' ? mesText.getAttribute(PREVIOUS_DISPLAY_ATTR) : '';
    const priority = typeof mesText.getAttribute === 'function' ? mesText.getAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTR) : '';
    const aria = typeof mesText.getAttribute === 'function' ? mesText.getAttribute(PREVIOUS_ARIA_ATTR) : MISSING_VALUE;
    restoreDisplayStyle(mesText.style, display, priority);
    if (aria === MISSING_VALUE || aria == null) mesText.removeAttribute('aria-hidden');
    else mesText.setAttribute('aria-hidden', aria);
    mesText.removeAttribute(EMBEDDED_TEXT_HIDDEN_ATTR);
    mesText.removeAttribute(PREVIOUS_DISPLAY_ATTR);
    mesText.removeAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTR);
    mesText.removeAttribute(PREVIOUS_ARIA_ATTR);
}

function readDisplayValue(style) {
    if (!style) return '';
    if (typeof style.getPropertyValue === 'function') return String(style.getPropertyValue('display') || '');
    return String(style.display || '');
}

function readDisplayPriority(style) {
    return style && typeof style.getPropertyPriority === 'function' ? String(style.getPropertyPriority('display') || '') : '';
}

function setDisplayStyle(style, value, priority) {
    if (!style) return;
    if (typeof style.setProperty === 'function') style.setProperty('display', value, priority);
    else style.display = value;
}

function restoreDisplayStyle(style, value, priority) {
    if (!style) return;
    if (!value && typeof style.removeProperty === 'function') style.removeProperty('display');
    else setDisplayStyle(style, value || '', priority || '');
}

export function buildEmbeddedLoadingHtml() {
    return `<div class="igs-embedded-loading" role="status" aria-live="polite"><span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-text">正在生成…</span></div>`;
}

export function resolveEmbeddedStreamPhase(previousPhase, event, constants = {}) {
    const phase = previousPhase || 'idle';
    const generationStart = constants.generationStart || 'generation-start';
    const generationComplete = constants.generationComplete || 'generation-complete';
    const generationAbort = constants.generationAbort || 'generation-abort';
    if (event === generationStart) return 'streaming';
    if (event === generationComplete) return 'finalizing';
    if (event === generationAbort) return 'aborted';
    return phase;
}

export function shouldShowEmbeddedLoading(phase) {
    return phase === 'streaming' || phase === 'finalizing';
}
