import { chatRevealDelayMs, normalizeChatShowSettings } from './chat-show-runtime.js';
import { chatSfxKindForSide, playChatSfx } from './chat-sfx.js';

const FIRST_AUTO_DELAY_MS = 250;
const SEEN_LIMIT = 64;
const states = new WeakMap();
const seenByRoot = new WeakMap();
const boundLayers = new WeakSet();

function hasReducedMotion() {
    return typeof globalThis.matchMedia === 'function'
        && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function clearChildren(node) {
    for (const child of Array.from(node.children || [])) child.remove();
}

export function ensureChatLayer(root) {
    const existing = root.querySelector('#igs-chat-layer');
    if (existing) return existing;
    const doc = root.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const layer = el(doc, 'div', 'igs-chat-layer');
    layer.id = 'igs-chat-layer';
    layer.hidden = true;
    const shell = el(doc, 'div', 'igs-chat-shell');
    shell.appendChild(el(doc, 'div', 'igs-chat-head'));
    shell.appendChild(el(doc, 'div', 'igs-chat-list'));
    layer.appendChild(shell);
    const dialogLayer = root.querySelector('#igs-dialog-layer');
    const parent = (dialogLayer && dialogLayer.parentNode) || root.querySelector('#igs-stage-motion') || root;
    if (dialogLayer && dialogLayer.parentNode === parent) parent.insertBefore(layer, dialogLayer);
    else parent.appendChild(layer);
    return layer;
}

function renderRows(layer, chat) {
    const doc = layer.ownerDocument;
    const head = layer.querySelector('.igs-chat-head');
    const list = layer.querySelector('.igs-chat-list');
    head.textContent = chat.title || '';
    head.hidden = !chat.title;
    clearChildren(list);
    return chat.messages.map((m) => {
        if (m.kind === 'note') {
            const row = el(doc, 'div', 'igs-chat-row is-note');
            row.appendChild(el(doc, 'span', 'igs-chat-note', m.text));
            row.hidden = true;
            list.appendChild(row);
            return row;
        }
        const row = el(doc, 'div', `igs-chat-row is-${m.side === 'right' ? 'right' : 'left'}`);
        if (m.showName) row.appendChild(el(doc, 'div', 'igs-chat-name', m.displayName));
        const bubble = el(doc, 'div', 'igs-chat-bubble', m.text);
        bubble.style.background = m.color;
        bubble.style.color = m.textColor;
        row.appendChild(bubble);
        row.hidden = true;
        list.appendChild(row);
        return row;
    });
}

function markSeen(root, key) {
    let seen = seenByRoot.get(root);
    if (!seen) seenByRoot.set(root, (seen = new Set()));
    seen.delete(key);
    seen.add(key);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value);
}

function clearTimer(state) {
    if (state && state.timer != null) {
        (state.clear || clearTimeout)(state.timer);
        state.timer = null;
    }
}

function revealTo(state, count, { animate = true, sound = true } = {}) {
    const target = Math.min(state.rows.length, count);
    const from = state.revealed;
    if (target <= from) return false;
    const pop = animate && !hasReducedMotion();
    for (let i = from; i < target; i += 1) {
        state.rows[i].hidden = false;
        if (pop) state.rows[i].classList.add('igs-chat-pop');
    }
    state.revealed = target;
    const list = state.layer.querySelector('.igs-chat-list');
    if (list) list.scrollTop = list.scrollHeight || 0;
    const settings = state.settings;
    if (sound && settings.sound.enabled) {
        const last = state.chat.messages.slice(from, target).reverse().find((m) => m.kind === 'msg');
        if (last) playChatSfx(chatSfxKindForSide(last.side), { volume: settings.sound.volume });
    }
    if (target >= state.rows.length) markSeen(state.root, state.key);
    return true;
}

function scheduleAuto(state) {
    clearTimer(state);
    if (state.revealed >= state.rows.length) return;
    const previous = state.revealed > 0 ? state.chat.messages[state.revealed - 1] : null;
    const delay = previous ? chatRevealDelayMs(previous.text, state.settings.autoSpeed) : FIRST_AUTO_DELAY_MS;
    state.timer = (state.schedule || setTimeout)(() => {
        state.timer = null;
        if (states.get(state.layer) !== state) return;
        revealTo(state, state.revealed + 1);
        scheduleAuto(state);
    }, delay);
}

function bindLayer(layer, ctx) {
    if (boundLayers.has(layer)) return;
    boundLayers.add(layer);
    layer.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction('next');
    });
}

export function cancelChatShow(root) {
    const layer = root && root.querySelector && root.querySelector('#igs-chat-layer');
    const state = layer && states.get(layer);
    if (!state) return false;
    clearTimer(state);
    states.delete(layer);
    return true;
}

// 同一聊天页因设置刷新重绘时保留已冒出的条数；翻回已看完的聊天页直接完整显示。
export function applyChatToDom(root, snapshot, ctx = {}) {
    const content = (snapshot && snapshot.content) || {};
    const active = Boolean(content.chatPage && content.chat);
    if (root.classList) root.classList.toggle('igs-chat-page', active);
    const layer = active ? ensureChatLayer(root) : root.querySelector('#igs-chat-layer');
    if (!layer) return;
    layer.hidden = !active;
    if (!active) {
        cancelChatShow(root);
        return;
    }
    const settings = normalizeChatShowSettings(snapshot.readerSettings && snapshot.readerSettings.chatShow);
    const chat = content.chat;
    layer.setAttribute('data-igs-chat-frame', settings.frame);
    layer.style.setProperty('--igs-chat-dim', String(settings.dim));
    bindLayer(layer, ctx);
    const key = [snapshot.messageId, content.currentIndex, JSON.stringify(chat.messages.map((m) => [m.kind, m.displayName || '', m.text]))].join(':');
    const renderSig = JSON.stringify([settings.frame, chat]);
    const previous = states.get(layer);
    if (previous && previous.key === key) {
        previous.settings = settings;
        if (previous.renderSig !== renderSig) {
            previous.chat = chat;
            previous.renderSig = renderSig;
            const revealed = previous.revealed;
            previous.rows = renderRows(layer, chat);
            previous.revealed = 0;
            revealTo(previous, revealed, { animate: false, sound: false });
        }
        return;
    }
    if (previous) clearTimer(previous);
    const state = {
        root, layer, key, renderSig, chat, settings,
        rows: renderRows(layer, chat),
        revealed: 0,
        timer: null,
        schedule: ctx.setTimeout,
        clear: ctx.clearTimeout,
    };
    states.set(layer, state);
    const seen = seenByRoot.get(root);
    if (seen && seen.has(key)) {
        revealTo(state, state.rows.length, { animate: false, sound: false });
    } else if (settings.revealMode === 'auto') {
        scheduleAuto(state);
    } else {
        revealTo(state, 1);
    }
}

// 聊天页未冒完时，「下一页」先推进气泡：点击模式冒一条，自动模式直接冒完。
export function advanceChatReveal(root) {
    const layer = root && root.querySelector && root.querySelector('#igs-chat-layer');
    const state = layer && !layer.hidden && states.get(layer);
    if (!state || state.revealed >= state.rows.length) return false;
    if (state.settings.revealMode === 'auto') {
        clearTimer(state);
        return revealTo(state, state.rows.length);
    }
    return revealTo(state, state.revealed + 1);
}

export function getChatRevealState(root) {
    const layer = root && root.querySelector && root.querySelector('#igs-chat-layer');
    const state = layer && states.get(layer);
    return state ? { revealed: state.revealed, total: state.rows.length, pending: state.timer != null } : null;
}

export const CHAT_LAYER_STYLE_TEXT = `
#igs-chat-layer{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:clamp(52px,9%,72px) clamp(10px,4%,32px) clamp(16px,5%,40px);box-sizing:border-box;background:rgba(0,0,0,var(--igs-chat-dim,.45));cursor:pointer;}
#igs-chat-layer[hidden]{display:none;}
#igs-chat-layer .igs-chat-shell{display:flex;flex-direction:column;width:min(640px,100%);max-height:100%;min-height:0;box-sizing:border-box;}
#igs-chat-layer .igs-chat-head{align-self:center;flex:none;margin-bottom:10px;padding:4px 14px;border-radius:999px;background:rgba(0,0,0,.38);color:#fff;font-size:13px;line-height:1.5;letter-spacing:.04em;}
#igs-chat-layer .igs-chat-head[hidden]{display:none;}
#igs-chat-layer .igs-chat-list{display:flex;flex-direction:column;gap:10px;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:4px 2px;}
#igs-chat-layer .igs-chat-list::-webkit-scrollbar{display:none;}
#igs-chat-layer .igs-chat-row{display:flex;flex-direction:column;max-width:78%;}
#igs-chat-layer .igs-chat-row[hidden]{display:none;}
#igs-chat-layer .igs-chat-row.is-left{align-self:flex-start;align-items:flex-start;}
#igs-chat-layer .igs-chat-row.is-right{align-self:flex-end;align-items:flex-end;}
#igs-chat-layer .igs-chat-row.is-note{align-self:center;max-width:90%;}
#igs-chat-layer .igs-chat-name{margin:0 6px 3px;color:rgba(255,255,255,.82);font-size:12px;text-shadow:0 1px 2px rgba(0,0,0,.5);}
#igs-chat-layer .igs-chat-bubble{padding:9px 13px;border-radius:16px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;box-shadow:0 2px 8px rgba(0,0,0,.18);}
#igs-chat-layer .igs-chat-row.is-left .igs-chat-bubble{border-bottom-left-radius:5px;}
#igs-chat-layer .igs-chat-row.is-right .igs-chat-bubble{border-bottom-right-radius:5px;}
#igs-chat-layer .igs-chat-note{padding:3px 10px;border-radius:8px;background:rgba(0,0,0,.3);color:rgba(255,255,255,.78);font-size:12px;line-height:1.5;text-align:center;}
#igs-chat-layer .igs-chat-row.is-left.igs-chat-pop{transform-origin:left bottom;animation:igs-chat-pop .24s cubic-bezier(.34,1.56,.64,1) both;}
#igs-chat-layer .igs-chat-row.is-right.igs-chat-pop{transform-origin:right bottom;animation:igs-chat-pop .24s cubic-bezier(.34,1.56,.64,1) both;}
#igs-chat-layer .igs-chat-row.is-note.igs-chat-pop{animation:igs-chat-fade .2s ease-out both;}
@keyframes igs-chat-pop{from{opacity:0;transform:translateY(6px) scale(.6);}to{opacity:1;transform:none;}}
@keyframes igs-chat-fade{from{opacity:0;}to{opacity:1;}}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-shell{width:min(420px,100%);height:100%;max-height:min(760px,100%);border-radius:28px;border:6px solid #1c1c1f;background:#ededed;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-head{align-self:stretch;margin:0;padding:12px 16px 10px;border-radius:0;background:#f7f7f7;border-bottom:1px solid rgba(0,0,0,.08);color:#1f1f1f;font-size:15px;font-weight:600;text-align:center;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-head[hidden]{display:block;visibility:hidden;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-list{flex:1;padding:12px 12px 16px;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-name{color:#8a8a8a;text-shadow:none;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-note{background:rgba(0,0,0,.08);color:#8a8a8a;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-bubble{box-shadow:0 1px 1px rgba(0,0,0,.08);}
#igs-overlay.igs-chat-page #igs-dialog-layer{visibility:hidden;}
#igs-overlay.igs-record-screen-open #igs-chat-layer{display:none!important;}
@media (prefers-reduced-motion: reduce){#igs-chat-layer .igs-chat-row.igs-chat-pop{animation:none!important;}}
`.trim();
