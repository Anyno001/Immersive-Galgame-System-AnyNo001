import { LIVE_ICONS } from './danmaku-icons.js';
import { normalizeDanmakuSettings } from './danmaku-settings.js';
import { pendingMetaEvents, recordMetaEvent } from './meta-digest.js';

// 直播互动：挂在前层（对话层之上）的一层透明壳，与舞台里的手机同位同尺寸，只有底栏与弹出面板可点。
// 观众视角：发弹幕、送礼物、醒目留言、上舰、点赞；主播视角：对观众说话。互动先在手机里本地出效果，
// 再记进待送出事件（与 Meta 互动共用送出 / 清空节奏），下次生成时告诉 AI，让主播与观众接住。
export const LIVE_GIFTS = Object.freeze(['小心心', '辣条', '打call', '牛哇牛哇', '干杯', '小电视', '火箭']);
export const LIVE_SC_AMOUNTS = Object.freeze([30, 50, 100, 500, 1000]);
export const LIVE_GUARDS = Object.freeze(['舰长', '提督', '总督']);
const LIVE_TEXT_MAX = 40;
const DIGEST_MAX = 360;
// 点按、输入都不冒泡到阅读器（不翻页、不触发快捷键）。
const STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu']);

const controls = new WeakMap();

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function button(doc, className, act, text, iconName) {
    const node = el(doc, 'button', className, iconName ? null : text);
    node.type = 'button';
    node.setAttribute('data-act', act);
    if (iconName) {
        node.innerHTML = LIVE_ICONS[iconName] || '';
        node.setAttribute('aria-label', text);
        node.title = text;
    }
    return node;
}

function textField(doc, placeholder) {
    const input = el(doc, 'input', 'igs-live-ctl-field');
    input.type = 'text';
    input.maxLength = LIVE_TEXT_MAX;
    input.placeholder = placeholder;
    input.setAttribute('enterkeyhint', 'send');
    return input;
}

function buildControls(doc, live, layout) {
    const host = live.view === 'host';
    const root = el(doc, 'div', 'igs-live-ctl');
    root.setAttribute('data-layout', layout);
    root.setAttribute('data-view', live.view);
    const bar = el(doc, 'div', 'igs-live-ctl-bar');
    const pill = button(doc, 'igs-live-ctl-pill', 'compose', host ? '和观众说点什么' : '发个弹幕呗~');
    const compose = el(doc, 'div', 'igs-live-ctl-compose');
    const field = textField(doc, host ? '和观众说点什么' : '发个弹幕呗~');
    compose.append(field, button(doc, 'igs-live-ctl-send', 'send-text', '发送'));
    bar.append(pill, compose);
    let panel = null;
    let scField = null;
    if (!host) {
        bar.append(button(doc, 'igs-live-ctl-btn is-gift', 'panel', '打赏', 'gift'), button(doc, 'igs-live-ctl-btn is-like', 'like', '点赞', 'heart'));
        panel = el(doc, 'div', 'igs-live-ctl-panel');
        const tabs = el(doc, 'div', 'igs-live-ctl-tabs');
        for (const [tab, label] of [['gift', '礼物'], ['sc', '醒目留言'], ['guard', '上舰']]) {
            const t = button(doc, 'igs-live-ctl-tab', `tab:${tab}`, label);
            t.setAttribute('data-tab', tab);
            tabs.appendChild(t);
        }
        tabs.appendChild(button(doc, 'igs-live-ctl-close', 'panel-close', '收起', 'close'));
        const gifts = el(doc, 'div', 'igs-live-ctl-body is-gift');
        for (const gift of LIVE_GIFTS) {
            const g = button(doc, 'igs-live-ctl-gift', `gift:${gift}`, null);
            g.innerHTML = LIVE_ICONS.gift || '';
            g.appendChild(el(doc, 'span', '', gift));
            gifts.appendChild(g);
        }
        const sc = el(doc, 'div', 'igs-live-ctl-body is-sc');
        const amounts = el(doc, 'div', 'igs-live-ctl-amounts');
        for (const amount of LIVE_SC_AMOUNTS) {
            const a = button(doc, 'igs-live-ctl-amount', `amount:${amount}`, `￥${amount}`);
            a.setAttribute('data-amount', String(amount));
            amounts.appendChild(a);
        }
        const scRow = el(doc, 'div', 'igs-live-ctl-row');
        scField = textField(doc, '醒目留言内容');
        scRow.append(scField, button(doc, 'igs-live-ctl-send', 'send-sc', '发送'));
        sc.append(amounts, scRow);
        const guard = el(doc, 'div', 'igs-live-ctl-body is-guard');
        for (const level of LIVE_GUARDS) {
            const g = button(doc, 'igs-live-ctl-guard', `guard:${level}`, `开通${level}`);
            g.setAttribute('data-level', level);
            guard.appendChild(g);
        }
        panel.append(tabs, gifts, sc, guard);
        root.appendChild(panel);
    }
    root.appendChild(bar);
    return { root, field, scField, panel };
}

function setTab(state, tab) {
    state.tab = tab;
    state.els.root.setAttribute('data-tab', tab);
    for (const t of Array.from(state.els.root.querySelectorAll('.igs-live-ctl-tab'))) t.setAttribute('aria-pressed', t.getAttribute('data-tab') === tab ? 'true' : 'false');
}

function setAmount(state, amount) {
    state.amount = amount;
    for (const a of Array.from(state.els.root.querySelectorAll('.igs-live-ctl-amount'))) a.setAttribute('aria-pressed', a.getAttribute('data-amount') === String(amount) ? 'true' : 'false');
}

function setOpen(state, key, open) {
    if (open) state.els.root.setAttribute(`data-${key}`, '1');
    else state.els.root.removeAttribute(`data-${key}`);
}

function emit(state, action) {
    if (typeof state.onAction === 'function') state.onAction(action);
}

function sendText(state) {
    const value = String(state.els.field.value || '').trim().slice(0, LIVE_TEXT_MAX);
    if (!value) return;
    state.els.field.value = '';
    setOpen(state, 'compose', false);
    emit(state, { kind: state.view === 'host' ? 'host' : 'text', text: value });
}

function sendSc(state) {
    const value = String(state.els.scField.value || '').trim().slice(0, LIVE_TEXT_MAX);
    if (!value) return;
    state.els.scField.value = '';
    setOpen(state, 'panel', false);
    emit(state, { kind: 'sc', text: value, extra: String(state.amount) });
}

function onAct(state, act) {
    if (act === 'compose') {
        setOpen(state, 'panel', false);
        setOpen(state, 'compose', true);
        try { state.els.field.focus({ preventScroll: true }); } catch (error) { /* */ }
    } else if (act === 'send-text') sendText(state);
    else if (act === 'send-sc') sendSc(state);
    else if (act === 'panel') {
        setOpen(state, 'compose', false);
        setOpen(state, 'panel', !state.els.root.hasAttribute('data-panel'));
    } else if (act === 'panel-close') setOpen(state, 'panel', false);
    else if (act === 'like') emit(state, { kind: 'like' });
    else if (act.startsWith('tab:')) setTab(state, act.slice(4));
    else if (act.startsWith('amount:')) setAmount(state, Number(act.slice(7)));
    else if (act.startsWith('gift:')) emit(state, { kind: 'gift', text: act.slice(5), extra: '1' });
    else if (act.startsWith('guard:')) {
        setOpen(state, 'panel', false);
        emit(state, { kind: 'guard', extra: act.slice(6) });
    }
}

function bind(state) {
    const { root } = state.els;
    for (const type of STOP_EVENTS) {
        root.addEventListener(type, (event) => {
            event.stopPropagation();
            if (type === 'click') {
                const target = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
                if (target) onAct(state, target.getAttribute('data-act'));
            } else if (type === 'keydown' && event.target && event.target.tagName === 'INPUT') {
                if (event.key === 'Enter' && !event.isComposing) {
                    event.preventDefault();
                    if (event.target === state.els.scField) sendSc(state);
                    else sendText(state);
                } else if (event.key === 'Escape') {
                    setOpen(state, 'compose', false);
                    setOpen(state, 'panel', false);
                }
            }
        });
    }
}

// live 为 null 时移除；同一场直播（主播 + 标题 + 视角 + 形态）跨页保留同一层，正在输入的内容不丢。
export function syncLiveControls(front, live, opts = {}) {
    if (!front) return null;
    let state = controls.get(front);
    const layout = opts.layout === 'full' ? 'full' : 'phone';
    const key = live ? `${live.name}|${live.title}|${live.view}|${layout}` : '';
    if (state && state.key !== key) {
        state.els.root.remove();
        controls.delete(front);
        state = null;
    }
    if (!live) return null;
    if (!state) {
        const els = buildControls(opts.doc || front.ownerDocument, live, layout);
        state = { key, view: live.view, els, tab: 'gift', amount: LIVE_SC_AMOUNTS[0], onAction: null };
        bind(state);
        if (els.panel) {
            setTab(state, 'gift');
            setAmount(state, state.amount);
        }
        front.appendChild(els.root);
        controls.set(front, state);
    }
    state.onAction = opts.onAction || null;
    return state;
}

// 跟随舞台里手机的实际尺寸（fitLivePhone 的结果），全屏形态跟随对话框上沿。
export function fitLiveControls(front, fit) {
    const state = front ? controls.get(front) : null;
    if (!state || !fit) return;
    const { style } = state.els.root;
    if (fit.layout === 'full') {
        style.setProperty('--igs-live-floor', `${fit.floor}px`);
        return;
    }
    style.setProperty('--igs-live-h', `${fit.height}px`);
    style.setProperty('--igs-live-top', `${fit.top}px`);
    style.setProperty('--igs-live-w', `${fit.width}px`);
    style.setProperty('--igs-live-under', `${fit.under}px`);
}

export function stopLiveControls(front) {
    const state = front ? controls.get(front) : null;
    if (!state) return false;
    state.els.root.remove();
    controls.delete(front);
    return true;
}

// 互动转成手机里的一条弹幕（点赞返回 null，由调用方冒爱心）。
export function liveActionMessage(action, live, userName = '') {
    const user = String(userName || '').trim() || '我';
    const base = { user, mine: true, extra: action.extra || '' };
    if (action.kind === 'text') return { ...base, type: 'text', text: action.text };
    if (action.kind === 'host') return { ...base, type: 'host', user: live.name, text: action.text };
    if (action.kind === 'gift') return { ...base, type: 'gift', text: action.text };
    if (action.kind === 'sc') return { ...base, type: 'sc', text: action.text };
    if (action.kind === 'guard') return { ...base, type: 'guard', text: '' };
    return null;
}

export function recordLiveAction(action, live) {
    recordMetaEvent({ type: 'live', kind: action.kind, text: action.text || '', extra: action.extra || '', streamer: live.name, view: live.view });
}

function describe(event) {
    if (event.kind === 'text') return `发弹幕「${event.text}」`;
    if (event.kind === 'host') return `以主播身份对观众说「${event.text}」`;
    if (event.kind === 'gift') return `送出${event.text}×${event.extra || 1}`;
    if (event.kind === 'sc') return `发了￥${event.extra}的醒目留言「${event.text}」`;
    if (event.kind === 'guard') return `开通了${event.extra || '舰长'}`;
    return '';
}

// 同一礼物合并计数、点赞只记次数；超长时保留最近的操作。
export function summarizeLiveEvents(events) {
    const list = (Array.isArray(events) ? events : []).filter((e) => e && e.type === 'live');
    if (!list.length) return '';
    const merged = [];
    let likes = 0;
    for (const event of list) {
        if (event.kind === 'like') {
            likes += 1;
            continue;
        }
        const prev = merged[merged.length - 1];
        if (event.kind === 'gift' && prev && prev.kind === 'gift' && prev.text === event.text) {
            prev.extra = String((Number(prev.extra) || 1) + (Number(event.extra) || 1));
            continue;
        }
        merged.push({ ...event });
    }
    const parts = merged.map(describe).filter(Boolean);
    if (likes) parts.push(`点赞 ${likes} 次`);
    let text = '';
    for (let i = parts.length - 1; i >= 0; i -= 1) {
        const next = text ? `${parts[i]}；${text}` : parts[i];
        if (next.length > DIGEST_MAX) break;
        text = next;
    }
    const streamer = String(list[list.length - 1].streamer || '').trim();
    return streamer ? `在「${streamer}」的直播间里：${text}` : text;
}

export function buildLiveDigestRule(summary) {
    const text = String(summary || '').trim();
    if (!text) return '';
    return `[igs直播间]\n以下是{{user}}本轮在直播间里的操作，下一段直播里主播与观众要自然接住（主播念弹幕、感谢礼物 / 醒目留言 / 上舰，观众跟着起哄，可用 dm 写出），不要逐条复述，也不要提及「阅读界面」：\n（${text}）`;
}

// 直播间与直播互动都开、且有待送出的互动时才返回规则。
export function resolveLiveDigestRule(readerSettings) {
    const s = normalizeDanmakuSettings(readerSettings);
    if (!s.live.enabled || !s.live.interact) return '';
    return buildLiveDigestRule(summarizeLiveEvents(pendingMetaEvents()));
}
