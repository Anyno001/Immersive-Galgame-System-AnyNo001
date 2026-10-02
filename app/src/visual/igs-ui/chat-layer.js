import { worldSkinOf } from '../../scene/worldview.js';

import { prefersReducedMotion } from './reduced-motion.js';
import { chatRevealDelayMs, normalizeChatShowSettings } from './chat-show-runtime.js';
import { chatSfxKindForSide, playChatSfx } from './chat-sfx.js';

const FIRST_AUTO_DELAY_MS = 250;
const FIRST_TYPING_DELAY_MS = 900;
const TYPING_MIN_DELAY_MS = 600;
const TYPING_LEAD_RATIO = 0.4;
const SEEN_LIMIT = 64;
const THEME_VARS = Object.freeze(['shell', 'head', 'headInk', 'frame', 'sub', 'border']);
const states = new WeakMap();
const seenByRoot = new WeakMap();
const boundLayers = new WeakSet();

function hasReducedMotion() {
    return prefersReducedMotion();
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

function renderAvatar(doc, m) {
    if (m.avatar) {
        const img = el(doc, 'img', 'igs-chat-avatar');
        img.src = m.avatar;
        img.alt = m.displayName || '';
        return img;
    }
    const badge = el(doc, 'div', 'igs-chat-avatar is-initial', m.initial);
    badge.style.background = m.avatarColor || m.color;
    badge.style.color = '#ffffff';
    return badge;
}

function renderBubble(doc, m) {
    if (m.type === 'sticker') return el(doc, 'div', 'igs-chat-sticker', m.text);
    const bubble = el(doc, 'div', `igs-chat-bubble is-${m.type || 'text'}`);
    bubble.style.background = m.color;
    bubble.style.color = m.textColor;
    if (m.type === 'image') {
        bubble.appendChild(el(doc, 'div', 'igs-chat-image'));
        bubble.appendChild(el(doc, 'div', 'igs-chat-image-caption', m.text));
    } else if (m.type === 'voice') {
        bubble.appendChild(el(doc, 'span', 'igs-chat-voice-wave'));
        bubble.appendChild(el(doc, 'span', 'igs-chat-voice-sec', `${m.seconds}''`));
        bubble.style.minWidth = `${Math.min(200, 64 + m.seconds * 6)}px`;
    } else {
        bubble.textContent = m.text;
    }
    return bubble;
}

// 古代背景的书信往来：每条消息是一张竖排信笺，正文之后落款写信人；没有头像，
// 图片、语音、表情包都按文字写进信里。
const LETTER_TYPE_PREFIX = Object.freeze({ image: '〔附画〕' });

function renderLetterRow(doc, m) {
    const side = m.side === 'right' ? 'right' : 'left';
    const row = el(doc, 'div', `igs-chat-row is-${side} is-letter`);
    const letter = el(doc, 'div', 'igs-chat-letter');
    letter.appendChild(el(doc, 'div', 'igs-chat-letter-text', `${LETTER_TYPE_PREFIX[m.type] || ''}${m.text || ''}`));
    if (m.displayName) letter.appendChild(el(doc, 'div', 'igs-chat-letter-sign', m.displayName));
    row.appendChild(letter);
    return row;
}

function renderRow(doc, m, ancient = false) {
    if (ancient && m.kind === 'msg') return renderLetterRow(doc, m);
    if (m.kind === 'time') {
        const row = el(doc, 'div', 'igs-chat-row is-time');
        row.appendChild(el(doc, 'span', 'igs-chat-time', m.text));
        return row;
    }
    if (m.kind === 'system') {
        const row = el(doc, 'div', 'igs-chat-row is-note is-system');
        row.appendChild(el(doc, 'span', 'igs-chat-note igs-chat-system', m.text));
        return row;
    }
    if (m.kind !== 'msg') {
        const row = el(doc, 'div', 'igs-chat-row is-note');
        row.appendChild(el(doc, 'span', 'igs-chat-note', m.text));
        return row;
    }
    const side = m.side === 'right' ? 'right' : 'left';
    const row = el(doc, 'div', `igs-chat-row is-${side}${m.initial ? ' has-avatar' : ''}`);
    if (m.initial) row.appendChild(renderAvatar(doc, m));
    const body = el(doc, 'div', 'igs-chat-body');
    if (m.showName) body.appendChild(el(doc, 'div', 'igs-chat-name', m.displayName));
    body.appendChild(renderBubble(doc, m));
    if (m.type === 'voice' && m.text) body.appendChild(el(doc, 'div', 'igs-chat-voice-text', m.text));
    row.appendChild(body);
    return row;
}

function applyTheme(layer, theme) {
    layer.setAttribute('data-igs-chat-theme', theme ? theme.key : '');
    for (const name of THEME_VARS) {
        const prop = `--igs-chat-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
        if (theme) layer.style.setProperty(prop, theme[name]);
        else layer.style.removeProperty(prop);
    }
    if (theme) layer.style.setProperty('--igs-chat-font', theme.font);
    else layer.style.removeProperty('--igs-chat-font');
}

function renderRows(layer, chat, ancient = false) {
    const doc = layer.ownerDocument;
    const head = layer.querySelector('.igs-chat-head');
    const list = layer.querySelector('.igs-chat-list');
    head.textContent = chat.title || '';
    head.hidden = !chat.title;
    clearChildren(list);
    applyTheme(layer, chat.theme || null);
    return chat.messages.map((m) => {
        const row = renderRow(doc, m, ancient);
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

function hideTyping(state) {
    if (state.typingRow) {
        state.typingRow.remove();
        state.typingRow = null;
    }
}

function showTyping(state, message) {
    hideTyping(state);
    const doc = state.layer.ownerDocument;
    const list = state.layer.querySelector('.igs-chat-list');
    if (!doc || !list) return;
    if (state.ancient) {
        const row = el(doc, 'div', 'igs-chat-row is-left is-letter is-typing');
        row.appendChild(el(doc, 'div', 'igs-chat-letter is-typing', '提笔中……'));
        list.appendChild(row);
        state.typingRow = row;
        list.scrollTop = list.scrollHeight || 0;
        return;
    }
    const row = el(doc, 'div', `igs-chat-row is-left is-typing${message.initial ? ' has-avatar' : ''}`);
    if (message.initial) row.appendChild(renderAvatar(doc, message));
    const body = el(doc, 'div', 'igs-chat-body');
    const bubble = el(doc, 'div', 'igs-chat-bubble igs-chat-typing');
    bubble.style.background = message.color;
    bubble.style.color = message.textColor;
    for (let i = 0; i < 3; i += 1) bubble.appendChild(el(doc, 'i', 'igs-chat-dot'));
    body.appendChild(bubble);
    row.appendChild(body);
    list.appendChild(row);
    state.typingRow = row;
    list.scrollTop = list.scrollHeight || 0;
}

function revealTo(state, count, { animate = true, sound = true } = {}) {
    const target = Math.min(state.rows.length, count);
    const from = state.revealed;
    if (target <= from) return false;
    hideTyping(state);
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
        if (last) playChatSfx(chatSfxKindForSide(last.side), { volume: settings.sound.volume, preset: state.ancient ? 'paper' : settings.sound.preset });
    }
    if (target >= state.rows.length) markSeen(state.root, state.key);
    return true;
}

// 自动连发：对方消息先显示「正在输入」再冒出；自己发的与系统行不显示。
function scheduleAuto(state) {
    clearTimer(state);
    if (state.revealed >= state.rows.length) return;
    const schedule = state.schedule || setTimeout;
    const previous = state.revealed > 0 ? state.chat.messages[state.revealed - 1] : null;
    const next = state.chat.messages[state.revealed];
    const typing = state.settings.typingIndicator && !state.replay && next.kind === 'msg' && next.side === 'left' && !hasReducedMotion();
    const delay = previous
        ? chatRevealDelayMs(state.replay ? '' : previous.text, state.settings.autoSpeed)
        : typing ? FIRST_TYPING_DELAY_MS : FIRST_AUTO_DELAY_MS;
    const fire = () => {
        state.timer = null;
        if (states.get(state.layer) !== state) return;
        revealTo(state, state.revealed + 1);
        scheduleAuto(state);
    };
    if (!typing || delay < TYPING_MIN_DELAY_MS) {
        state.timer = schedule(fire, delay);
        return;
    }
    const lead = Math.round(delay * TYPING_LEAD_RATIO);
    state.timer = schedule(() => {
        if (states.get(state.layer) !== state) return;
        showTyping(state, next);
        state.timer = schedule(fire, delay - lead);
    }, lead);
}

function bindLayer(layer, ctx) {
    if (boundLayers.has(layer)) return;
    boundLayers.add(layer);
    // 与对话框、卡片页一致：左半区上一页，右半区推进气泡/下一页。
    layer.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        const rect = typeof layer.getBoundingClientRect === 'function' ? layer.getBoundingClientRect() : { left: 0, width: 0 };
        const clientX = Number(event && event.clientX);
        const action = Number.isFinite(clientX) && rect.width > 0 && clientX < rect.left + rect.width / 2 ? 'prev' : 'next';
        if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction(action);
    });
}

export function cancelChatShow(root) {
    const layer = root && root.querySelector && root.querySelector('#igs-chat-layer');
    const state = layer && states.get(layer);
    if (!state) return false;
    clearTimer(state);
    hideTyping(state);
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
    // 古代背景：手机框换成书信，外框设置不再生效。
    const ancient = Boolean(snapshot.readerSettings && snapshot.readerSettings._ancientEra === true);
    layer.setAttribute('data-igs-chat-era', ancient ? 'ancient' : 'modern');
    // 西幻 / 科幻 / 末日：在现代聊天框上另挂 data-igs-chat-world 换配色字体，era 仍为 modern，结构与外框设置不变。
    const world = String((snapshot.readerSettings && snapshot.readerSettings._worldview) || '');
    if (!ancient && worldSkinOf(world)) layer.setAttribute('data-igs-chat-world', world);
    else layer.removeAttribute('data-igs-chat-world');
    layer.setAttribute('data-igs-chat-frame', ancient ? 'letter' : settings.frame);
    layer.style.setProperty('--igs-chat-dim', String(settings.dim));
    // 气泡圆角由用户设置；无有效数值时移除变量，样式表回落 16px。
    if (Number.isFinite(settings.bubbleRadius)) layer.style.setProperty('--igs-chat-radius', `${settings.bubbleRadius}px`);
    else layer.style.removeProperty('--igs-chat-radius');
    bindLayer(layer, ctx);
    const key = [snapshot.messageId, content.currentIndex, JSON.stringify(chat.messages.map((m) => [m.kind, m.displayName || '', m.text]))].join(':');
    const renderSig = JSON.stringify([settings.frame, ancient, chat]);
    const previous = states.get(layer);
    if (previous && previous.key === key) {
        previous.settings = settings;
        previous.ancient = ancient;
        if (previous.renderSig !== renderSig) {
            const revealed = previous.revealed;
            const typing = Boolean(previous.typingRow);
            hideTyping(previous);
            previous.chat = chat;
            previous.renderSig = renderSig;
            previous.rows = renderRows(layer, chat, ancient);
            previous.revealed = 0;
            revealTo(previous, revealed, { animate: false, sound: false });
            if (typing && previous.revealed < previous.rows.length) showTyping(previous, chat.messages[previous.revealed]);
        }
        return;
    }
    if (previous) {
        clearTimer(previous);
        hideTyping(previous);
    }
    const state = {
        root, layer, key, renderSig, chat, settings, ancient,
        rows: renderRows(layer, chat, ancient),
        revealed: 0,
        timer: null,
        typingRow: null,
        auto: settings.revealMode === 'auto',
        replay: false,
        schedule: ctx.setTimeout,
        clear: ctx.clearTimeout,
    };
    states.set(layer, state);
    // 返回看过的聊天页：一次平铺 / 自动逐条重播 / 按冒泡节奏重新来一遍。
    const seen = seenByRoot.get(root);
    const returning = Boolean(seen && seen.has(key));
    if (returning && settings.returnMode === 'full') {
        revealTo(state, state.rows.length, { animate: false, sound: false });
    } else if (returning && settings.returnMode === 'replay') {
        state.auto = true;
        state.replay = true;
        scheduleAuto(state);
    } else if (state.auto) {
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
    if (state.auto) {
        clearTimer(state);
        return revealTo(state, state.rows.length);
    }
    return revealTo(state, state.revealed + 1);
}

export function getChatRevealState(root) {
    const layer = root && root.querySelector && root.querySelector('#igs-chat-layer');
    const state = layer && states.get(layer);
    return state ? { revealed: state.revealed, total: state.rows.length, pending: state.timer != null, typing: Boolean(state.typingRow) } : null;
}

export const CHAT_LAYER_STYLE_TEXT = `
#igs-chat-layer{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:clamp(52px,9%,72px) clamp(10px,4%,32px) clamp(16px,5%,40px);box-sizing:border-box;background:rgba(0,0,0,var(--igs-chat-dim,.45));cursor:pointer;font-family:var(--igs-chat-font,inherit);}
#igs-chat-layer[hidden]{display:none;}
#igs-overlay.igs-options-visible #igs-chat-layer{display:none;}
#igs-chat-layer .igs-chat-shell{display:flex;flex-direction:column;width:min(640px,100%);max-height:100%;min-height:0;box-sizing:border-box;}
#igs-chat-layer .igs-chat-head{align-self:center;flex:none;margin-bottom:10px;padding:4px 14px;border-radius:999px;background:rgba(0,0,0,.38);color:#fff;font-size:13px;line-height:1.5;letter-spacing:.04em;}
#igs-chat-layer .igs-chat-head[hidden]{display:none;}
#igs-chat-layer .igs-chat-list{display:flex;flex-direction:column;gap:10px;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:4px 2px;}
#igs-chat-layer .igs-chat-list::-webkit-scrollbar{display:none;}
#igs-chat-layer .igs-chat-row{display:flex;align-items:flex-start;gap:8px;max-width:78%;}
#igs-chat-layer .igs-chat-row[hidden]{display:none;}
#igs-chat-layer .igs-chat-row.is-left{align-self:flex-start;}
#igs-chat-layer .igs-chat-row.is-right{align-self:flex-end;flex-direction:row-reverse;}
#igs-chat-layer .igs-chat-row.is-note,#igs-chat-layer .igs-chat-row.is-time{align-self:center;max-width:90%;}
#igs-chat-layer .igs-chat-body{display:flex;flex-direction:column;min-width:0;}
#igs-chat-layer .igs-chat-row.is-left .igs-chat-body{align-items:flex-start;}
#igs-chat-layer .igs-chat-row.is-right .igs-chat-body{align-items:flex-end;}
#igs-chat-layer .igs-chat-avatar{flex:none;width:36px;height:36px;border-radius:8px;object-fit:cover;box-shadow:0 1px 3px rgba(0,0,0,.2);}
#igs-chat-layer .igs-chat-avatar.is-initial{display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;text-shadow:0 1px 1px rgba(0,0,0,.15);}
#igs-chat-layer .igs-chat-name{margin:0 6px 3px;color:rgba(255,255,255,.82);font-size:12px;text-shadow:0 1px 2px rgba(0,0,0,.5);}
#igs-chat-layer .igs-chat-bubble{padding:9px 13px;border-radius:var(--igs-chat-radius,16px);border:1.5px solid var(--igs-chat-border,transparent);font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;box-shadow:0 2px 8px rgba(0,0,0,.18);box-sizing:border-box;}
#igs-chat-layer .igs-chat-row.is-left .igs-chat-bubble{border-top-left-radius:min(5px,var(--igs-chat-radius,16px));}
#igs-chat-layer .igs-chat-row.is-right .igs-chat-bubble{border-top-right-radius:min(5px,var(--igs-chat-radius,16px));}
#igs-chat-layer .igs-chat-bubble.is-image{padding:6px;width:180px;max-width:100%;}
#igs-chat-layer .igs-chat-image{position:relative;aspect-ratio:4/3;border-radius:10px;background:linear-gradient(135deg,rgba(0,0,0,.06),rgba(0,0,0,.16));}
#igs-chat-layer .igs-chat-image::before{content:"";position:absolute;left:50%;top:50%;width:34px;height:26px;margin:-13px 0 0 -17px;border:2.5px solid currentColor;border-radius:5px;opacity:.45;}
#igs-chat-layer .igs-chat-image::after{content:"";position:absolute;left:50%;top:50%;width:0;height:0;margin:-2px 0 0 -9px;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:10px solid currentColor;opacity:.45;}
#igs-chat-layer .igs-chat-image-caption{padding:6px 4px 2px;font-size:12px;line-height:1.45;opacity:.72;}
#igs-chat-layer .igs-chat-bubble.is-voice{display:flex;align-items:center;gap:8px;}
#igs-chat-layer .igs-chat-row.is-right .igs-chat-bubble.is-voice{flex-direction:row-reverse;}
#igs-chat-layer .igs-chat-voice-wave{width:14px;height:16px;flex:none;background:linear-gradient(currentColor,currentColor) 0 50%/3px 6px no-repeat,linear-gradient(currentColor,currentColor) 5px 50%/3px 10px no-repeat,linear-gradient(currentColor,currentColor) 10px 50%/3px 15px no-repeat;opacity:.75;}
#igs-chat-layer .igs-chat-row.is-right .igs-chat-voice-wave{transform:scaleX(-1);}
#igs-chat-layer .igs-chat-voice-sec{font-size:14px;}
#igs-chat-layer .igs-chat-voice-text{margin:4px 6px 0;padding:5px 9px;border-radius:8px;background:rgba(255,255,255,.88);color:#333;font-size:12px;line-height:1.5;}
#igs-chat-layer .igs-chat-sticker{padding:10px 14px;border:2px dashed rgba(255,255,255,.7);border-radius:14px;color:#fff;font-size:22px;line-height:1.3;text-shadow:0 1px 3px rgba(0,0,0,.45);}
#igs-chat-layer .igs-chat-typing{display:flex;align-items:center;gap:4px;padding:13px 14px;}
#igs-chat-layer .igs-chat-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:igs-chat-dot 1s ease-in-out infinite;}
#igs-chat-layer .igs-chat-dot:nth-child(2){animation-delay:.16s;}
#igs-chat-layer .igs-chat-dot:nth-child(3){animation-delay:.32s;}
@keyframes igs-chat-dot{0%,80%,100%{opacity:.3;transform:translateY(0);}40%{opacity:.85;transform:translateY(-3px);}}
#igs-chat-layer .igs-chat-note{padding:3px 10px;border-radius:8px;background:rgba(0,0,0,.3);color:rgba(255,255,255,.78);font-size:12px;line-height:1.5;text-align:center;}
#igs-chat-layer .igs-chat-system{font-weight:600;letter-spacing:.02em;}
#igs-chat-layer .igs-chat-time{color:rgba(255,255,255,.7);font-size:12px;line-height:1.5;text-shadow:0 1px 2px rgba(0,0,0,.5);}
#igs-chat-layer .igs-chat-row.is-left.igs-chat-pop{transform-origin:left bottom;animation:igs-chat-pop .24s cubic-bezier(.34,1.56,.64,1) both;}
#igs-chat-layer .igs-chat-row.is-right.igs-chat-pop{transform-origin:right bottom;animation:igs-chat-pop .24s cubic-bezier(.34,1.56,.64,1) both;}
#igs-chat-layer .igs-chat-row.is-note.igs-chat-pop,#igs-chat-layer .igs-chat-row.is-time.igs-chat-pop{animation:igs-chat-fade .2s ease-out both;}
@keyframes igs-chat-pop{from{opacity:0;transform:translateY(6px) scale(.6);}to{opacity:1;transform:none;}}
@keyframes igs-chat-fade{from{opacity:0;}to{opacity:1;}}
/* 手机框按 iPhone 比例（9:19.5）竖长：高度撑满可用区，宽度由比例推出；窄屏时宽度封顶、比例放宽。
   细黑边框 + 金属外沿 + 灵动岛 + 底部横条，标题栏让出灵动岛的高度。 */
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-shell{position:relative;width:auto;height:100%;max-height:min(820px,100%);aspect-ratio:9/19.5;max-width:100%;border-radius:clamp(30px,11%,48px)/clamp(30px,5%,48px);border:8px solid var(--igs-chat-frame,#1c1c1f);background:var(--igs-chat-shell,#ededed);box-shadow:0 0 0 2px #45454b,0 18px 50px rgba(0,0,0,.5);overflow:hidden;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-shell::before{content:"";position:absolute;top:8px;left:50%;z-index:2;width:32%;max-width:110px;height:24px;border-radius:999px;background:#0b0b0d;transform:translateX(-50%);pointer-events:none;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-shell::after{content:"";position:absolute;bottom:7px;left:50%;z-index:2;width:36%;height:4px;border-radius:999px;background:rgba(0,0,0,.35);transform:translateX(-50%);pointer-events:none;}
#igs-chat-layer[data-igs-chat-frame="phone"][data-igs-chat-theme="gradient-veil"] .igs-chat-shell::after{background:rgba(255,255,255,.4);}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-head{align-self:stretch;margin:0;padding:40px 16px 10px;border-radius:0;background:var(--igs-chat-head,#f7f7f7);border-bottom:1px solid rgba(0,0,0,.08);color:var(--igs-chat-head-ink,#1f1f1f);font-size:15px;font-weight:600;text-align:center;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-head[hidden]{display:block;visibility:hidden;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-list{flex:1;padding:12px 12px 22px;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-name,#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-time{color:var(--igs-chat-sub,#8a8a8a);text-shadow:none;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-note{background:rgba(0,0,0,.08);color:var(--igs-chat-sub,#8a8a8a);}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-bubble{box-shadow:0 1px 1px rgba(0,0,0,.08);}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-sticker{border-color:var(--igs-chat-sub,#b5b5b5);color:var(--igs-chat-sub,#6b6b6b);text-shadow:none;}
#igs-chat-layer[data-igs-chat-frame="phone"] .igs-chat-voice-text{background:rgba(0,0,0,.06);}
#igs-chat-layer[data-igs-chat-frame="phone"][data-igs-chat-theme="gradient-veil"] .igs-chat-voice-text{background:rgba(255,255,255,.1);color:#ddd;}
/* 古代背景 · 书信往来：竖排信笺从右往左书写，朱红界栏按列对齐；正文之后落款写信人并盖小印。 */
#igs-chat-layer[data-igs-chat-era="ancient"]{background:rgba(22,12,4,var(--igs-chat-dim,.45));font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-shell{width:min(760px,100%);}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-head{border-radius:2px;padding:5px 18px;background:#f3e6c8;color:#5a1d12;border:1px solid #b8452f;box-shadow:0 2px 8px rgba(0,0,0,.35);font-size:15px;letter-spacing:.3em;}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-list{gap:16px;padding:6px 4px;}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-row{max-width:92%;}
#igs-chat-layer .igs-chat-letter{--igs-letter-col:30px;writing-mode:vertical-rl;height:clamp(150px,34vh,240px);max-width:100%;overflow-x:auto;scrollbar-width:none;padding:16px 12px;box-sizing:border-box;border:1px solid rgba(120,70,30,.35);border-radius:2px;background:repeating-linear-gradient(to left,transparent 0 calc(var(--igs-letter-col) - 1px),rgba(178,62,40,.3) calc(var(--igs-letter-col) - 1px) var(--igs-letter-col)) right top/100% 100% content-box,#f6ecd4;color:#2b1d12;font-size:17px;line-height:var(--igs-letter-col);letter-spacing:.08em;white-space:pre-wrap;box-shadow:0 3px 12px rgba(0,0,0,.35);}
#igs-chat-layer .igs-chat-letter::-webkit-scrollbar{display:none;}
#igs-chat-layer .igs-chat-row.is-right .igs-chat-letter{background-color:#efe2c2;}
#igs-chat-layer .igs-chat-letter-sign{padding-top:1.4em;text-align:end;color:#7a2a1a;font-size:14px;}
#igs-chat-layer .igs-chat-letter-sign::after{content:"";display:inline-block;width:.9em;height:.9em;margin-top:.35em;border-radius:2px;background:#b8452f;vertical-align:middle;}
#igs-chat-layer .igs-chat-letter.is-typing{height:auto;padding:12px 10px;background:#f6ecd4;color:#7a5a3a;font-size:14px;}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-time{color:rgba(243,230,200,.85);letter-spacing:.2em;}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-note{background:rgba(243,230,200,.16);color:rgba(243,230,200,.85);}
#igs-chat-layer[data-igs-chat-era="ancient"] .igs-chat-row.is-letter.igs-chat-pop{transform-origin:right center;animation:igs-chat-unfold .45s ease-out both;}
@keyframes igs-chat-unfold{from{opacity:0;transform:scaleX(.15);}60%{opacity:1;}to{opacity:1;transform:none;}}
/* 世界观换皮（西幻羊皮纸 / 科幻全息青光 / 末日旧纸锈边）：只改标题、时间、系统行与气泡描边；气泡底色仍由角色配色内联决定。 */
#igs-chat-layer[data-igs-chat-world="fantasy"]{font-family:Georgia,"Times New Roman",serif;}
#igs-chat-layer[data-igs-chat-world="fantasy"] .igs-chat-head{background:#efe2c2;color:#3a2614;border:1px solid #9c7a46;}
#igs-chat-layer[data-igs-chat-world="fantasy"] .igs-chat-bubble{box-shadow:0 0 0 1px rgba(156,122,70,.55);}
#igs-chat-layer[data-igs-chat-world="scifi"] .igs-chat-head{background:rgba(8,24,36,.9);color:#d8fbff;border:1px solid rgba(80,220,255,.7);box-shadow:0 0 12px rgba(60,200,255,.4);letter-spacing:.08em;}
#igs-chat-layer[data-igs-chat-world="scifi"] .igs-chat-bubble{box-shadow:0 0 0 1px rgba(80,220,255,.55),0 0 8px rgba(60,200,255,.3);}
#igs-chat-layer[data-igs-chat-world="scifi"] .igs-chat-time,#igs-chat-layer[data-igs-chat-world="scifi"] .igs-chat-note{color:#8fd8e8;}
#igs-chat-layer[data-igs-chat-world="apocalypse"]{font-family:"Courier New",monospace;}
#igs-chat-layer[data-igs-chat-world="apocalypse"] .igs-chat-head{background:rgba(48,40,32,.93);color:#e8dfcf;border:1px dashed rgba(200,150,80,.6);}
#igs-chat-layer[data-igs-chat-world="apocalypse"] .igs-chat-bubble{box-shadow:0 0 0 1px rgba(200,150,80,.45);}
#igs-chat-layer[data-igs-chat-world="magic"]{font-family:"IM Fell English",Georgia,"Times New Roman",serif;}
#igs-chat-layer[data-igs-chat-world="magic"] .igs-chat-head{background:#1c2248;color:#f3e2b6;border:1px solid rgba(201,162,74,.8);}
#igs-chat-layer[data-igs-chat-world="magic"] .igs-chat-bubble{box-shadow:0 0 0 1px rgba(201,162,74,.55),0 0 10px rgba(255,214,120,.18);}
#igs-chat-layer[data-igs-chat-world="taisho"]{font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
#igs-chat-layer[data-igs-chat-world="taisho"] .igs-chat-head{background:#f4ead6;color:#2a1c18;border:1px solid #7b2e2a;}
#igs-chat-layer[data-igs-chat-world="taisho"] .igs-chat-bubble{box-shadow:0 0 0 1px rgba(123,46,42,.5);}
#igs-overlay.igs-chat-page #igs-dialog-layer{visibility:hidden;}
#igs-overlay.igs-record-screen-open #igs-chat-layer{display:none!important;}
@media (prefers-reduced-motion: reduce){#igs-chat-layer .igs-chat-row.igs-chat-pop,#igs-chat-layer .igs-chat-dot{animation:none!important;}}
`.trim();
