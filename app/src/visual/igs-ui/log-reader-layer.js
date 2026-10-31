import { MANGA_SYMBOL_SVG } from './fx-symbols.js';
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';
import { LOG_AVATAR_BOX, LOG_LOOP_LIMIT, clampLogAdjust, isContinuation, logAvatarCrop, logNameHue } from './log-reader-model.js';

// 窄屏阅读模式的 DOM 层：在 #igs-dialog-layer 里挂 #igs-log，按楼增量追加行；出字、情绪符号、点按重播、头像取景编辑都在这里。
// 取数、翻批、朗读由 reader-host 负责，这里只认传进来的 view。
const states = new WeakMap();
const PLAY_SVG = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5.8v6.4L7 4z"/></svg>';
const FLOW_STEP_MS = 18;
const FLOW_FADE_MS = 260;
const TYPE_STEP_MS = 30;
const TYPE_PAUSE_MS = 120;
const FADE_MS = 260;
const ONCE_MS = 1600;
const PAUSE_CHARS = /[，。！？…,.!?]/;

function stateOf(overlay) {
    let s = states.get(overlay);
    if (!s) states.set(overlay, (s = { sig: '', rendered: 0, reveal: null, editing: null, shook: -1, flashed: null, adjustSig: '', view: null, observer: null }));
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

function cssUrl(url) {
    return String(url || '').replace(/["\\\n\r]/g, (c) => `\\${c}`);
}

function timersOf(node) {
    return (node && node.ownerDocument && node.ownerDocument.defaultView) || globalThis;
}

function adjustFor(s, key) {
    const source = s.editing ? s.editing.adjust : (s.view && s.view.settings.adjust) || {};
    return Object.hasOwn(source, key) ? source[key] : null;
}

function ensureLog(overlay) {
    const found = overlay.querySelector('#igs-log');
    if (found) return found;
    const layer = overlay.querySelector('#igs-dialog-layer');
    if (!layer) return null;
    const doc = overlay.ownerDocument;
    const log = el(doc, 'div');
    log.id = 'igs-log';
    log.innerHTML = '<div class="igs-log-flash"></div><div class="igs-log-veil"></div><div class="igs-log-scroll"><div class="igs-log-list"></div></div>';
    layer.insertBefore(log, layer.firstChild);
    bindLog(overlay, log);
    return log;
}
// 点按：符号 / 胶囊重播情绪，▶ 重播朗读，其余交给 host（翻批、隐藏后恢复）。编辑态只吃拖动。
function bindLog(overlay, log) {
    const s = stateOf(overlay);
    log.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target : null;
        if (!target) return;
        const editBtn = target.closest('[data-log-edit]');
        if (editBtn) { event.stopPropagation(); finishEdit(overlay, editBtn.getAttribute('data-log-edit')); return; }
        if (s.editing) return;
        const row = target.closest('.igs-log-row');
        if (row && target.closest('.igs-log-play')) {
            event.stopPropagation();
            if (s.view && s.view.onPlay) s.view.onPlay(Number(row.dataset.index));
            return;
        }
        if (row && target.closest('.igs-fx-symbol,.igs-log-chip')) {
            event.stopPropagation();
            replayMood(overlay, row);
            return;
        }
        if (!target.closest('.igs-log-scroll')) return;
        if (s.view && s.view.onTap) s.view.onTap();
    });
    const pinch = new Map();
    let drag = null;
    const zoomBy = (key, k) => {
        const a = s.editing.adjust[key] || { x: 0, y: 0, z: 1 };
        s.editing.adjust[key] = clampLogAdjust({ ...a, z: a.z * k });
        repaintKey(overlay, key);
    };
    log.addEventListener('pointerdown', (event) => {
        const av = s.editing && event.target.closest && event.target.closest('.igs-log-av[data-url]:not([data-cover])');
        if (!av) return;
        event.preventDefault();
        pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { av.setPointerCapture(event.pointerId); } catch (_) { /* 旧浏览器 */ }
        drag = { key: av.dataset.key, x: event.clientX, y: event.clientY, dist: 0 };
    });
    log.addEventListener('pointermove', (event) => {
        if (!drag || !s.editing || !pinch.has(event.pointerId)) return;
        pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch.size === 2) {
            const [p, q] = [...pinch.values()];
            const dist = Math.hypot(p.x - q.x, p.y - q.y);
            if (drag.dist) zoomBy(drag.key, dist / drag.dist);
            drag.dist = dist;
            return;
        }
        const w = LOG_AVATAR_BOX.card.w;
        const a = s.editing.adjust[drag.key] || { x: 0, y: 0, z: 1 };
        s.editing.adjust[drag.key] = clampLogAdjust({ ...a, x: a.x + (event.clientX - drag.x) / w, y: a.y + (event.clientY - drag.y) / w });
        drag.x = event.clientX;
        drag.y = event.clientY;
        repaintKey(overlay, drag.key);
    });
    const release = (event) => { pinch.delete(event.pointerId); if (!pinch.size) drag = null; else if (drag) drag.dist = 0; };
    log.addEventListener('pointerup', release);
    log.addEventListener('pointercancel', release);
    log.addEventListener('wheel', (event) => {
        const av = s.editing && event.target.closest && event.target.closest('.igs-log-av[data-url]:not([data-cover])');
        if (!av) return;
        event.preventDefault();
        zoomBy(av.dataset.key, event.deltaY < 0 ? 1.06 : 1 / 1.06);
    }, { passive: false });
}

// 头像：立绘头颈肩；没有图时显示姓名首字。破框时立绘画在 .igs-log-cut 上，底板是 ::before。
function avatarNode(doc, row, view) {
    const av = el(doc, 'div', 'igs-log-av');
    av.dataset.key = row.key;
    av.style.setProperty('--igs-log-hue', logNameHue(row.key));
    const found = view.avatarOf ? view.avatarOf(row) : null;
    if (!found || !found.url) {
        av.classList.add('is-letter');
        av.textContent = Array.from(row.speaker)[0] || '';
        return av;
    }
    av.dataset.url = found.url;
    // 取景按角色 + 服装存；状态栏头像本身就是头像，铺满不裁。
    av.dataset.key = found.adjustKey || row.key;
    if (found.cover) av.dataset.cover = '1';
    if (view.settings.avatarShape === 'break') av.append(el(doc, 'div', 'igs-log-cut'));
    return av;
}

function paintAvatar(overlay, av) {
    const s = stateOf(overlay);
    const url = av.dataset.url;
    if (!url || !s.view) return;
    const doc = overlay.ownerDocument;
    const shape = s.view.settings.avatarShape;
    const box = shape === 'break' ? LOG_AVATAR_BOX.break : LOG_AVATAR_BOX.card;
    const target = shape === 'break' ? av.querySelector('.igs-log-cut') || av : av;
    if (av.dataset.cover) {
        target.style.backgroundImage = `url("${cssUrl(url)}")`;
        target.style.backgroundSize = 'cover';
        target.style.backgroundPosition = 'center';
        return;
    }
    const probed = peekSpriteHead(url, doc);
    const aspect = probed && probed.naturalW > 0 ? probed.naturalH / probed.naturalW : 0;
    const crop = logAvatarCrop(probed && probed.head, aspect, box, adjustFor(s, av.dataset.key));
    target.style.backgroundImage = `url("${cssUrl(url)}")`;
    target.style.backgroundSize = `${crop.size}px auto`;
    target.style.backgroundPosition = `${crop.x}px ${crop.y}px`;
    if (!probed && !av.dataset.probing) {
        av.dataset.probing = '1';
        probeSpriteHead(url, doc).then((info) => { if (info && av.isConnected) paintAvatar(overlay, av); }, () => {});
    }
}

function repaintKey(overlay, key) {
    for (const av of overlay.querySelectorAll('#igs-log .igs-log-av[data-url]')) if (!key || av.dataset.key === key) paintAvatar(overlay, av);
}
// 一行（及其前面的换场景分隔线、后面的物品 / 来电小卡片）。live 时正文先留空，由 reveal 出字。
function buildRow(doc, rows, i, view, live) {
    const row = rows[i];
    const frag = doc.createDocumentFragment();
    if (row.scene) {
        const scene = el(doc, 'div', 'igs-log-scene' + (live ? '' : ' is-in'));
        scene.textContent = row.scene;
        frag.append(scene);
    }
    const cont = isContinuation(rows, i);
    const node = el(doc, 'div', 'igs-log-row' + (live ? '' : ' is-in'));
    node.dataset.index = String(row.index);
    const classes = [];
    if (row.kind === 'narr') classes.push('is-narr');
    if (row.thought) classes.push('is-thought');
    if (row.user) classes.push('is-user');
    if (row.user && !view.settings.userAvatar) classes.push('is-noav');
    if (cont) classes.push('is-cont');
    node.classList.add(...classes);
    const symbol = view.symbolOf ? view.symbolOf(row) : '';
    if (symbol) node.dataset.mood = symbol;
    if (row.kind !== 'narr') node.append(avatarNode(doc, row, view));
    const body = el(doc, 'div', 'igs-log-body');
    if (row.kind !== 'narr') {
        const name = el(doc, 'div', 'igs-log-name');
        name.style.setProperty('--igs-log-hue', logNameHue(row.key));
        const b = el(doc, 'b');
        b.textContent = row.speaker;
        name.append(b);
        if (row.mood && view.settings.chip) {
            const chip = el(doc, 'span', 'igs-log-chip');
            if (view.chipKindOf) chip.dataset.kind = view.chipKindOf(row) || '';
            chip.textContent = row.mood;
            name.append(chip);
        }
        body.append(name);
    }
    if (view.canSpeak && view.canSpeak(row)) {
        const play = el(doc, 'button', 'igs-log-play');
        play.type = 'button';
        play.title = '重听这句';
        play.setAttribute('aria-label', '重听这句');
        play.innerHTML = PLAY_SVG;
        node.append(play);
    }
    const text = el(doc, 'div', 'igs-log-text');
    const html = composeHtml(row, view);
    text.dataset.html = html;
    if (!live) text.innerHTML = html;
    body.append(text);
    node.append(body);
    frag.append(node);
    for (const card of (view.cardsOf ? view.cardsOf(row) : []) || []) frag.append(cardNode(doc, card));
    return { frag, node, text };
}

function composeHtml(row, view) {
    const html = view.htmlOf ? view.htmlOf(row) : esc(row.text);
    return row.label ? `<span class="igs-log-label">${esc(row.label)}：</span>${html}` : html;
}

function cardNode(doc, card) {
    const node = el(doc, 'div', 'igs-log-card');
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

// 同一人连续说话只在组头显示头像：情绪符号挂到组头的头像上。
function headAvatarOf(row) {
    let node = row;
    while (node && node.classList.contains('is-cont')) {
        let prev = node.previousElementSibling;
        while (prev && !prev.classList.contains('igs-log-row')) prev = prev.previousElementSibling;
        node = prev;
    }
    return node ? node.querySelector('.igs-log-av') : null;
}

function placeSymbol(overlay, row, { done = false } = {}) {
    const kind = row.dataset.mood;
    const s = stateOf(overlay);
    if (!kind || !s.view || s.view.settings.emotion === 'off' || !MANGA_SYMBOL_SVG[kind]) return null;
    const av = headAvatarOf(row);
    if (!av) return null;
    av.querySelector('.igs-fx-symbol')?.remove();
    const sym = el(overlay.ownerDocument, 'span', 'igs-fx-symbol');
    sym.dataset.kind = kind;
    sym.innerHTML = MANGA_SYMBOL_SVG[kind];
    if (done) sym.classList.add('is-done');
    av.append(sym);
    return sym;
}

// 情绪：默认播一遍停在静态；循环档只给最新的两枚；关闭时不挂符号。
function refreshLoops(overlay) {
    const s = stateOf(overlay);
    const mode = s.view ? s.view.settings.emotion : 'off';
    const all = [...overlay.querySelectorAll('#igs-log .igs-log-av>.igs-fx-symbol')];
    const timers = timersOf(overlay);
    all.forEach((sym, i) => {
        if (sym.classList.contains('is-once')) return;
        if (mode === 'loop') {
            const loop = i >= all.length - LOG_LOOP_LIMIT;
            sym.classList.toggle('is-loop', loop);
            sym.classList.toggle('is-done', !loop);
            return;
        }
        sym.classList.remove('is-loop');
        if (sym.classList.contains('is-done')) return;
        sym.classList.add('is-once');
        timers.setTimeout(() => { sym.classList.remove('is-once'); sym.classList.add('is-done'); }, ONCE_MS);
    });
}

// 点符号或胶囊：这一行的情绪在组头头像上重播一次（组头已换成后面的情绪时，临时换回本行的）。
function replayMood(overlay, row) {
    const s = stateOf(overlay);
    if (!s.view || s.view.settings.emotion === 'off') return;
    const sym = placeSymbol(overlay, row);
    if (!sym) return;
    sym.classList.add('is-once');
    timersOf(overlay).setTimeout(() => { if (!sym.isConnected) return; sym.classList.remove('is-once'); sym.classList.add('is-done'); refreshLoops(overlay); }, ONCE_MS);
}

function observeRow(overlay, log, node) {
    const s = stateOf(overlay);
    const win = timersOf(overlay);
    if (!s.observer && typeof win.IntersectionObserver === 'function') {
        s.observer = new win.IntersectionObserver((list) => list.forEach((it) => it.target.classList.toggle('is-off', !it.isIntersecting)), { root: log.querySelector('.igs-log-scroll') });
    }
    if (s.observer) s.observer.observe(node);
}
// 把文字节点拆成逐字 span（保留注音、心里话等标签），返回字数。
function splitChars(doc, root, delayOf) {
    const walker = doc.createTreeWalker(root, 4);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue) nodes.push(n);
    let index = 0;
    let at = 0;
    for (const node of nodes) {
        const frag = doc.createDocumentFragment();
        for (const ch of Array.from(node.nodeValue)) {
            const span = el(doc, 'span', 'igs-log-fl');
            span.style.animationDelay = `${at}ms`;
            span.textContent = ch;
            frag.append(span);
            at += delayOf(ch, index++);
        }
        node.parentNode.replaceChild(frag, node);
    }
    return at;
}

// 出字：流水展开（每字淡入、错开 18ms）/ 打字机 / 整句淡入。播完换回原 HTML，长列表里不留逐字节点。
function reveal(overlay, text, mode) {
    const s = stateOf(overlay);
    const doc = overlay.ownerDocument;
    const timers = timersOf(overlay);
    const html = text.dataset.html || '';
    text.innerHTML = html;
    let total = FADE_MS;
    if (mode === 'fade') text.classList.add('igs-log-fade');
    else if (mode === 'type') {
        total = splitChars(doc, text, (ch) => (PAUSE_CHARS.test(ch) ? TYPE_PAUSE_MS : TYPE_STEP_MS));
        for (const span of text.querySelectorAll('.igs-log-fl')) span.style.animationDuration = '1ms';
    } else total = splitChars(doc, text, () => FLOW_STEP_MS) + FLOW_FADE_MS;
    return new Promise((resolve) => {
        const finish = () => {
            if (s.reveal !== job) return;
            s.reveal = null;
            timers.clearTimeout(job.timer);
            text.classList.remove('igs-log-fade');
            text.innerHTML = html;
            resolve();
        };
        const job = { finish, timer: timers.setTimeout(finish, total) };
        s.reveal = job;
    });
}

function scrollEnd(log, smooth) {
    const scroll = log.querySelector('.igs-log-scroll');
    if (!scroll) return;
    if (smooth && typeof scroll.scrollTo === 'function') scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
    else scroll.scrollTop = scroll.scrollHeight;
}

function applyLogAttrs(overlay, log, view) {
    const set = (name, value, node = log) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    set('data-igs-log-skin', view.skin, overlay);
    set('data-tone', view.tone);
    set('data-shape', view.settings.avatarShape);
    set('data-user-side', view.settings.userSide);
    set('data-veil', String(view.settings.veil));
    if (view.hidden) set('data-hidden', ''); else log.removeAttribute('data-hidden');
    const fonts = view.fonts || {};
    for (const [prop, value] of [['--igs-log-font', fonts.text], ['--igs-log-name-font', fonts.name], ['--igs-log-narr-font', fonts.narration], ['--igs-log-fs', fonts.size]]) {
        if (value) log.style.setProperty(prop, value); else log.style.removeProperty(prop);
    }
    const dialog = overlay.querySelector('#igs-dialog');
    const foot = dialog && dialog.offsetHeight > 0 ? `${dialog.offsetHeight}px` : '';
    if (foot) log.style.setProperty('--igs-log-foot', foot);
}

// view：{ floorKey, rows, upto（含）, batchStart, live（这次要出字的行号，-1 表示瞬间补齐）, running, more（本楼还有没出的行）,
//   settings, skin, tone, fonts, hidden, avatarOf, symbolOf, chipKindOf, htmlOf, canSpeak, cardsOf, onTap, onPlay, onSaveAdjust }
// 返回 { revealing }：live 行出字完成时 resolve。
export function syncLogReader(overlay, view) {
    if (!overlay) return { revealing: null };
    if (!view) { overlay.removeAttribute('data-igs-log-reader'); return { revealing: null }; }
    const log = ensureLog(overlay);
    if (!log) return { revealing: null };
    if (overlay.getAttribute('data-igs-log-reader') !== 'on') overlay.setAttribute('data-igs-log-reader', 'on');
    const s = stateOf(overlay);
    s.view = view;
    applyLogAttrs(overlay, log, view);
    const list = log.querySelector('.igs-log-list');
    const sig = JSON.stringify([view.floorKey, view.settings.avatarShape, view.settings.userAvatar, view.settings.chip, view.settings.emotion, view.skin]);
    // 换楼、换头像样式等：清空重建；往回退批：删掉多出的行。
    if (sig !== s.sig || view.upto + 1 < s.rendered) {
        if (s.reveal) s.reveal.finish();
        list.textContent = '';
        s.rendered = 0;
        s.sig = sig;
        s.shook = -1;
    }
    const adjustSig = JSON.stringify(view.settings.adjust);
    if (adjustSig !== s.adjustSig) { s.adjustSig = adjustSig; repaintKey(overlay, ''); }
    const doc = overlay.ownerDocument;
    let revealing = null;
    for (let i = s.rendered; i <= view.upto && i < view.rows.length; i++) {
        const live = i === view.live;
        const built = buildRow(doc, view.rows, i, view, live);
        list.append(built.frag);
        for (const av of built.node.querySelectorAll('.igs-log-av[data-url]')) paintAvatar(overlay, av);
        observeRow(overlay, log, built.node);
        placeSymbol(overlay, built.node, { done: !live });
        if (live) {
            const node = built.node;
            const scene = node.previousElementSibling && node.previousElementSibling.classList.contains('igs-log-scene') ? node.previousElementSibling : null;
            timersOf(overlay).requestAnimationFrame(() => { node.classList.add('is-in'); if (scene) scene.classList.add('is-in'); });
            revealing = reveal(overlay, built.text, view.settings.reveal);
        }
        s.rendered = i + 1;
    }
    for (const row of list.querySelectorAll('.igs-log-row')) row.classList.toggle('is-old', Number(row.dataset.index) < view.batchStart);
    refreshLoops(overlay);
    syncStageEcho(overlay, log, list, view);
    list.querySelector('.igs-log-caret')?.remove();
    if (!view.running && view.more) {
        const texts = list.querySelectorAll('.igs-log-row .igs-log-text');
        if (texts.length) texts[texts.length - 1].append(el(doc, 'span', 'igs-log-caret'));
    }
    scrollEnd(log, Boolean(revealing));
    return { revealing };
}

// 震屏只抖当前这一行；闪白只闪背景（列表之下）。
function syncStageEcho(overlay, log, list, view) {
    const s = stateOf(overlay);
    const stage = overlay.querySelector('#igs-stage-motion');
    if (stage && stage.classList.contains('igs-stage-shake-active') && s.shook !== view.upto) {
        s.shook = view.upto;
        const row = list.querySelector(`.igs-log-row[data-index="${view.upto}"]`);
        if (row) { row.classList.remove('is-shake'); void row.offsetWidth; row.classList.add('is-shake'); }
    }
    const flash = overlay.querySelector('#igs-fx-front .igs-fx-flash');
    if (flash && s.flashed !== flash) {
        s.flashed = flash;
        const layer = log.querySelector('.igs-log-flash');
        layer.classList.remove('is-on');
        void layer.offsetWidth;
        layer.classList.add('is-on');
    }
}

// 批次中再点一下：当前出字直接补完。
export function finishLogReveal(overlay) {
    const s = overlay ? states.get(overlay) : null;
    if (!s || !s.reveal) return false;
    s.reveal.finish();
    return true;
}

export function isLogEditing(overlay) {
    const s = overlay ? states.get(overlay) : null;
    return Boolean(s && s.editing);
}

// 调整立绘：头像可拖动、滚轮 / 双指缩放；保存才落盘，取消回到进入前。
export function toggleLogEdit(overlay) {
    const s = overlay ? states.get(overlay) : null;
    const log = overlay && overlay.querySelector('#igs-log');
    if (!s || !log || !s.view) return false;
    if (s.editing) { finishEdit(overlay, 'cancel'); return true; }
    s.editing = { adjust: JSON.parse(JSON.stringify(s.view.settings.adjust || {})) };
    log.setAttribute('data-editing', '');
    const bar = el(overlay.ownerDocument, 'div');
    bar.id = 'igs-log-edit-bar';
    bar.innerHTML = '<span>拖动头像调整取景，滚轮或双指缩放</span><button type="button" data-log-edit="reset">重置</button><button type="button" data-log-edit="cancel">取消</button><button type="button" data-log-edit="save">保存</button>';
    log.append(bar);
    return true;
}

function finishEdit(overlay, kind) {
    const s = stateOf(overlay);
    if (!s.editing) return;
    if (kind === 'reset') { s.editing.adjust = {}; repaintKey(overlay, ''); return; }
    const adjust = s.editing.adjust;
    s.editing = null;
    const log = overlay.querySelector('#igs-log');
    if (log) { log.removeAttribute('data-editing'); log.querySelector('#igs-log-edit-bar')?.remove(); }
    repaintKey(overlay, '');
    if (kind === 'save' && s.view && s.view.onSaveAdjust) s.view.onSaveAdjust(adjust);
}
