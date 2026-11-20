import { LOG_SPEEDS } from './log-reader-settings.js';
import { FLOW_FADE_MS, FLOW_STEP_MS, PAUSE_CHARS, TYPE_PAUSE_MS, TYPE_STEP_MS, splitChars } from './log-reader-layer.js';
import { VOICE_ICON } from './voice-icon.js';
import { FORUM_PALETTE_KEYS, forumPaletteColors } from './forum-reader-palettes.js';

// 论坛体阅读模式的 DOM 层：在 #igs-dialog-layer 里挂 #igs-forum-reader，一个 PO 主楼一块，楼之间夹点缀回帖。
// 取数、翻批、朗读由 reader-host 负责，这里只认传进来的 view。
const states = new WeakMap();
const REPLAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';
const LIVE_PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.2" r="1" fill="currentColor"/><path d="M10 7.2 15 10l-5 2.8z" fill="currentColor"/></svg>';
const FADE_MS = 320;

function stateOf(overlay) {
    let s = states.get(overlay);
    if (!s) states.set(overlay, (s = { sig: '', rendered: 0, reveal: null, view: null, sceneRow: -1 }));
    return s;
}

function el(doc, tag, cls) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    return node;
}

function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function winOf(node) {
    return (node && node.ownerDocument && node.ownerDocument.defaultView) || globalThis;
}

function reducedMotion(overlay) {
    const win = winOf(overlay);
    return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureRoot(overlay) {
    const found = overlay.querySelector('#igs-forum-reader');
    if (found) return found;
    const layer = overlay.querySelector('#igs-dialog-layer');
    if (!layer) return null;
    const root = el(overlay.ownerDocument, 'div');
    root.id = 'igs-forum-reader';
    root.innerHTML = '<div class="igs-fm-bar"></div><div class="igs-fm-scroll"><div class="igs-fm-list"></div></div>';
    layer.insertBefore(root, layer.firstChild);
    bindRoot(overlay, root);
    return root;
}

function bindRoot(overlay, root) {
    const s = stateOf(overlay);
    root.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target : null;
        if (!target) return;
        const replay = target.closest('.igs-fm-replay');
        if (replay) {
            event.stopPropagation();
            const solo = replay.closest('.igs-fm-solo');
            if (solo && s.view && s.view.onReplay) s.view.onReplay(Number(solo.dataset.index));
            return;
        }
        const play = target.closest('.igs-fm-play');
        if (play) {
            event.stopPropagation();
            const line = play.closest('[data-index]');
            if (line && s.view && s.view.onPlay) s.view.onPlay([Number(line.dataset.index)]);
            return;
        }
        if (target.closest('.igs-fm-live')) {
            event.stopPropagation();
            if (s.view && s.view.onLiveRoom) s.view.onLiveRoom();
            return;
        }
        if (!target.closest('.igs-fm-scroll')) return;
        if (s.view && s.view.onTap) s.view.onTap();
    });
    const scroll = root.querySelector('.igs-fm-scroll');
    let frame = 0;
    scroll.addEventListener('scroll', () => {
        if (frame) return;
        frame = winOf(overlay).requestAnimationFrame(() => { frame = 0; reportSceneRow(overlay, scroll); });
    }, { passive: true });
}

function reportSceneRow(overlay, scroll) {
    const s = stateOf(overlay);
    if (!s.view || !s.view.onSceneRow) return;
    if (Date.now() < Number(scroll.dataset.autoUntil || 0)) return;
    const rows = scroll.querySelectorAll('[data-index]');
    if (!rows.length) return;
    let index = Number(rows[rows.length - 1].dataset.index);
    if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 4) {
        const box = scroll.getBoundingClientRect();
        const mid = box.top + box.height / 2;
        index = Number(rows[0].dataset.index);
        for (const row of rows) {
            if (row.getBoundingClientRect().top > mid) break;
            index = Number(row.dataset.index);
        }
    }
    if (index !== s.sceneRow) { s.sceneRow = index; s.view.onSceneRow(index); }
}

function scrollEnd(root, smooth) {
    const scroll = root.querySelector('.igs-fm-scroll');
    if (!scroll) return;
    scroll.dataset.autoUntil = String(Date.now() + (smooth ? 800 : 50));
    if (smooth && typeof scroll.scrollTo === 'function') scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
    else scroll.scrollTop = scroll.scrollHeight;
}

function syncLiveButton(overlay, root, view) {
    let btn = root.querySelector('.igs-fm-live');
    const room = view.liveRoom;
    if (!room) { if (btn) btn.remove(); return; }
    if (!btn) {
        btn = el(overlay.ownerDocument, 'button', 'igs-fm-live');
        btn.type = 'button';
        btn.innerHTML = LIVE_PHONE_SVG;
        root.appendChild(btn);
    }
    const label = `进入直播间${room.name ? `：${room.name}` : ''}`;
    if (btn.getAttribute('aria-label') !== label) { btn.setAttribute('aria-label', label); btn.title = label; }
}

function headHtml({ id, no, time, po, newbie }) {
    const idText = po ? `<span class="igs-fm-po">ID:${esc(id)}</span>(PO主)` : `ID:${esc(id)}`;
    return `<span class="igs-fm-nm">无名氏</span>${time ? ` ${esc(time)}` : ''} ${idText} No.${esc(no)}`;
}

function playButton(doc) {
    const play = el(doc, 'button', 'igs-fm-play');
    play.type = 'button';
    play.title = '重听';
    play.setAttribute('aria-label', '重听');
    play.innerHTML = VOICE_ICON;
    return play;
}

function cardNode(doc, card, live) {
    const node = el(doc, 'div', 'igs-fm-card' + (live ? '' : ' is-in'));
    const head = el(doc, 'b');
    head.textContent = card.head;
    const name = el(doc, 'em');
    name.textContent = card.name;
    node.append(head, name);
    if (card.note) {
        const note = el(doc, 'span');
        note.textContent = card.note;
        node.append(note);
    }
    return node;
}

// 一个 PO 主楼：楼头 + 正文；首楼前加帖子头（板块、标题）。
function ensurePost(overlay, list, plan, postIndex, view, live, fades) {
    const doc = overlay.ownerDocument;
    let node = list.querySelector(`.igs-fm-post[data-post="${postIndex}"]`);
    if (node) return node;
    if (postIndex === 0 && view.head) {
        const head = el(doc, 'div', 'igs-fm-thread' + (live ? '' : ' is-in'));
        const title = el(doc, 'h1');
        title.textContent = view.head.title;
        head.append(title);
        list.append(head);
        fades.push(head);
    } else if (postIndex === 0 && view.retitle) {
        const note = el(doc, 'div', 'igs-fm-retitle' + (live ? '' : ' is-in'));
        note.textContent = `PO主修改了标题：${view.retitle}`;
        list.append(note);
        fades.push(note);
    }
    const post = plan[postIndex];
    node = el(doc, 'div', 'igs-fm-post' + (live ? '' : ' is-in'));
    node.dataset.post = String(postIndex);
    const meta = el(doc, 'div', 'igs-fm-meta');
    meta.innerHTML = headHtml({ id: post.id, no: post.no, time: post.time, po: true });
    const body = el(doc, 'div', 'igs-fm-body');
    node.append(meta, body);
    list.append(node);
    fades.push(node);
    return node;
}

function replyNode(doc, reply, view, live) {
    const node = el(doc, 'div', 'igs-fm-reply' + (live ? '' : ' is-in'));
    const meta = el(doc, 'div', 'igs-fm-meta');
    meta.innerHTML = headHtml({ id: reply.id, no: reply.no, time: reply.time, po: reply.po === true });
    const body = el(doc, 'div', 'igs-fm-body');
    let html = '';
    if (reply.quote) html += `<div class="igs-fm-gt">&gt;${esc(reply.quote)}</div>`;
    if (reply.ref) html += `<div class="igs-fm-ref">&gt;&gt;No.${esc(reply.ref)}</div>`;
    html += `<div>${esc(reply.text)}</div>`;
    body.innerHTML = html;
    node.append(meta, body);
    return node;
}

// 建一行，挂进它所在的楼；该楼最后一行到齐后再接点缀回帖。
function buildRow(overlay, list, i, view, live) {
    const doc = overlay.ownerDocument;
    const row = view.rows[i];
    const fades = [];
    if (row.hidden) return { fades, text: null };
    const postIndex = view.plan.findIndex((p) => i >= p.start && i <= p.end);
    if (postIndex < 0) return { fades, text: null };
    const post = ensurePost(overlay, list, view.plan, postIndex, view, live, fades);
    const body = post.querySelector('.igs-fm-body');
    if (row.scene) {
        const scene = el(doc, 'div', 'igs-fm-scene');
        scene.dataset.index = String(row.index);
        scene.textContent = row.scene;
        body.append(scene);
    }
    if (row.solo) {
        const node = el(doc, 'div', 'igs-fm-solo');
        node.dataset.index = String(row.index);
        const btn = el(doc, 'button', 'igs-fm-replay');
        btn.type = 'button';
        btn.innerHTML = `${REPLAY_SVG}<span></span>`;
        btn.querySelector('span').textContent = row.replay || '重播';
        node.append(btn);
        body.append(node);
        return { fades, text: null, post, postIndex };
    }
    const html = view.htmlOf ? view.htmlOf(row) : esc(row.text);
    const line = el(doc, 'p', `igs-fm-line${row.kind === 'thought' ? ' is-thought' : ''}${row.kind === 'narr' ? ' is-narr' : ''}`);
    line.dataset.index = String(row.index);
    let inner = html;
    if (row.kind === 'dialogue') inner = `<span class="igs-fm-who">${esc(row.who)}${view.settings.showMood && row.mood ? `（${esc(row.mood)}）` : ''}：</span>${html}`;
    else if (row.kind === 'thought') inner = `<span class="igs-fm-who">${esc(row.who)}</span>（${html}）`;
    else if (row.label) inner = `<span class="igs-fm-who">${esc(row.label)}：</span>${html}`;
    line.dataset.html = inner;
    if (!live) line.innerHTML = inner;
    if (view.canSpeak && view.canSpeak(row) && row.kind !== 'narr') line.append(playButton(doc));
    body.append(line);
    for (const card of (view.cardsOf ? view.cardsOf(row) : []) || []) body.append(cardNode(doc, card, !live));
    return { fades, text: line, post, postIndex, row };
}

function appendReplies(overlay, list, postIndex, view, live) {
    const plan = view.plan[postIndex];
    const post = list.querySelector(`.igs-fm-post[data-post="${postIndex}"]`);
    if (!plan || !post || post.dataset.replies === '1') return [];
    post.dataset.replies = '1';
    const out = [];
    let anchor = post;
    for (const reply of plan.replies) {
        const node = replyNode(overlay.ownerDocument, reply, view, live);
        anchor.after(node);
        anchor = node;
        out.push(node);
    }
    return out;
}

function reveal(overlay, built, view) {
    const s = stateOf(overlay);
    const win = winOf(overlay);
    const doc = overlay.ownerDocument;
    const fade = () => { for (const n of built.fades) n.classList.add('is-in'); };
    const line = built.text;
    const html = line ? line.dataset.html || '' : '';
    const k = LOG_SPEEDS[view.settings.speed] || 1;
    const calm = reducedMotion(overlay);
    const mode = calm ? 'off' : view.settings.reveal;
    const setHtml = () => {
        const play = line.querySelector('.igs-fm-play');
        line.innerHTML = html;
        if (play) line.append(play);
    };
    // 文字先同步写进去，随后的滚到底才量得到这一句的高度；否则滚到空行处，文字补上后落在屏幕外。
    if (line) setHtml();
    // 直接显示：整句、新楼、回帖当场出现，不走淡入过渡。
    if (mode === 'off') {
        for (const n of built.fades) { n.style.transition = 'none'; n.classList.add('is-in'); }
        return Promise.resolve();
    }
    // 打字机 / 流水展开：逐字出现；整句淡入：整行淡入。
    let total = FADE_MS * k;
    if (line && (mode === 'type' || mode === 'flow')) {
        total = mode === 'type'
            ? splitChars(doc, line, (ch) => (PAUSE_CHARS.test(ch) ? TYPE_PAUSE_MS : TYPE_STEP_MS) * k, 'igs-fm-fl')
            : splitChars(doc, line, () => FLOW_STEP_MS * k, 'igs-fm-fl') + FLOW_FADE_MS;
        if (mode === 'type') for (const span of line.querySelectorAll('.igs-fm-fl')) span.style.animationDuration = '1ms';
    }
    return new Promise((resolve) => {
        let done = false;
        let timer = null;
        const finish = () => {
            if (done) return;
            done = true;
            if (s.reveal === job) s.reveal = null;
            win.clearTimeout(timer);
            if (line) { line.classList.remove('igs-fm-fade'); setHtml(); }
            fade();
            resolve();
        };
        const job = { finish };
        s.reveal = job;
        if (mode === 'type' || mode === 'flow') {
            fade();
        } else if (mode === 'fade') {
            if (line) line.classList.add('igs-fm-fade');
            win.requestAnimationFrame(() => { if (!done) fade(); });
        }
        timer = win.setTimeout(finish, total);
    });
}

// 新角色代号小卡片：贴在列表上方，一个角色一行，输入代号后确定，或沿用自动代号。
function syncAliasCard(overlay, root, view) {
    const doc = overlay.ownerDocument;
    const items = Array.isArray(view.pendingAlias) ? view.pendingAlias : [];
    let card = root.querySelector('.igs-fm-alias');
    const sig = JSON.stringify(items);
    if (!items.length) { if (card) card.remove(); return; }
    if (card && card.dataset.sig === sig) return;
    if (!card) { card = el(doc, 'div', 'igs-fm-alias'); root.append(card); }
    card.dataset.sig = sig;
    card.textContent = '';
    for (const item of items.slice(0, 3)) {
        const row = el(doc, 'div', 'igs-fm-alias-row');
        const label = el(doc, 'span', 'igs-fm-alias-name');
        label.textContent = `${item.label} 首次出场，登记代号`;
        const input = el(doc, 'input', 'igs-fm-alias-input');
        input.type = 'text';
        input.maxLength = 24;
        input.value = item.code;
        const ok = el(doc, 'button', 'igs-fm-alias-ok');
        ok.type = 'button';
        ok.textContent = '确定';
        const submit = () => { if (view.onAlias) view.onAlias(item.key, input.value); };
        ok.addEventListener('click', (event) => { event.stopPropagation(); submit(); });
        input.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') submit(); });
        input.addEventListener('click', (event) => event.stopPropagation());
        row.append(label, input, ok);
        card.append(row);
    }
}

function applyAttrs(overlay, root, view) {
    const set = (name, value, node = root) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const st = view.settings;
    overlay.removeAttribute('data-igs-log-skin');
    if (view.hidden) set('data-hidden', ''); else root.removeAttribute('data-hidden');
    root.style.setProperty('--igs-fm-fs', `${st.fontSize}px`);
    const colors = forumPaletteColors(st.palette, st.mode, overlay.ownerDocument.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
    for (const key of FORUM_PALETTE_KEYS) root.style.setProperty('--igs-fm-' + key, colors[key]);
    const fonts = view.fonts || {};
    if (fonts.text) root.style.setProperty('--igs-fm-font', fonts.text); else root.style.removeProperty('--igs-fm-font');
    if (st.barColor) overlay.style.setProperty('--igs-fm-bar', st.barColor); else overlay.style.removeProperty('--igs-fm-bar');
    const bar = root.querySelector('.igs-fm-bar');
    if (bar && bar.textContent !== view.board) bar.textContent = view.board || '';
    const dialog = overlay.querySelector('#igs-dialog');
    const foot = dialog && dialog.offsetHeight > 0 ? `${dialog.offsetHeight}px` : '';
    if (foot) { root.style.setProperty('--igs-log-foot', foot); overlay.style.setProperty('--igs-log-foot', foot); }
}

// view：{ floorKey, rows（已改写代号）, plan（forumPlan 结果）, head（{ title } 或 null）, board, upto（含）, live, settings, fonts, hidden,
//   htmlOf, canSpeak, cardsOf, onTap, onPlay, onReplay, onSceneRow, liveRoom, onLiveRoom, sig（改变即重建） }
// 返回 { revealing }：live 行出现完成时 resolve。
export function syncForumReader(overlay, view) {
    if (!overlay) return { revealing: null };
    if (!view) {
        overlay.removeAttribute('data-igs-forum-reader');
        overlay.style.removeProperty('--igs-fm-bar');
        overlay.removeAttribute('data-igs-log-reader');
        return { revealing: null };
    }
    const root = ensureRoot(overlay);
    if (!root) return { revealing: null };
    // 立绘隐藏、对话框收起、输入框换皮、页码进度条这些共用规则认纵向的开关属性：论坛同时挂上。调用方先收起未启用的那一个、再同步启用的。
    if (overlay.getAttribute('data-igs-forum-reader') !== 'on') overlay.setAttribute('data-igs-forum-reader', 'on');
    if (overlay.getAttribute('data-igs-log-reader') !== 'on') overlay.setAttribute('data-igs-log-reader', 'on');
    const s = stateOf(overlay);
    s.view = view;
    applyAttrs(overlay, root, view);
    syncLiveButton(overlay, root, view);
    syncAliasCard(overlay, root, view);
    const list = root.querySelector('.igs-fm-list');
    const sig = JSON.stringify([view.floorKey, view.sig || '']);
    if (sig !== s.sig || view.upto + 1 < s.rendered) {
        if (s.reveal) s.reveal.finish();
        list.textContent = '';
        s.rendered = 0;
        s.sceneRow = -1;
        s.sig = sig;
    }
    let revealing = null;
    const before = s.rendered;
    for (let i = s.rendered; i <= view.upto && i < view.rows.length; i++) {
        const live = i === view.live;
        const built = buildRow(overlay, list, i, view, live);
        const last = built.postIndex != null && i === view.plan[built.postIndex].end;
        const extra = last ? appendReplies(overlay, list, built.postIndex, view, live) : [];
        if (live && extra.length) built.fades.push(...extra);
        if (live && built.post) revealing = reveal(overlay, built, view);
        s.rendered = i + 1;
    }
    if (s.rendered !== before) scrollEnd(root, Boolean(revealing));
    return { revealing };
}

export function finishForumReveal(overlay) {
    const s = overlay ? states.get(overlay) : null;
    if (!s || !s.reveal) return false;
    s.reveal.finish();
    return true;
}
