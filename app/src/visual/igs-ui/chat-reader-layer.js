import { MANGA_SYMBOL_SVG } from './fx-symbols.js';
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';
import { LOG_LOOP_LIMIT, clampLogAdjust, logAvatarCrop, logNameHue } from './log-reader-model.js';
import { CHAT_AVATAR_BOX, isChatCont } from './chat-reader-model.js';
import { CHAT_READER_GAPS } from './chat-reader-settings.js';
import { chatRevealDelayMs, readableTextColor } from './chat-show-runtime.js';
import { cachedSpriteNameColor, spriteNameColor } from './character-name-color.js';
import { armTextFx, disarmTextFx } from './text-fx.js';
import { LOG_SPEEDS } from './log-reader-settings.js';
import { VOICE_ICON } from './voice-icon.js';
import { chatSfxKindForSide, playChatSfx } from './chat-sfx.js';

// 线上聊天阅读模式的 DOM 层：在 #igs-dialog-layer 里挂 #igs-chat-reader，同一人连着说的话归一组，整条气泡弹出。
// 取数、翻批、朗读由 reader-host 负责，这里只认传进来的 view（形状同纵向的 view，另带 theme）。
const states = new WeakMap();
const REPLAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';
const LIVE_PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.2" r="1" fill="currentColor"/><path d="M10 7.2 15 10l-5 2.8z" fill="currentColor"/></svg>';
const POP_MS = 260;
const ONCE_MS = 1600;
const TFX_POP_MS = 560;
const TYPING_FLOOR_MS = 600;
const CONT_PAUSE_MS = 280;

function stateOf(overlay) {
    let s = states.get(overlay);
    if (!s) states.set(overlay, (s = { sig: '', rendered: 0, reveal: null, editing: null, adjustSig: '', view: null, sceneRow: -1 }));
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

function winOf(node) {
    return (node && node.ownerDocument && node.ownerDocument.defaultView) || globalThis;
}

function reducedMotion(overlay) {
    const win = winOf(overlay);
    return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 取景键沿用纵向：角色(|服装)::情绪组；「统一」开着时只用角色取景。
function isUnified(s) {
    return s.editing ? s.editing.unified : Boolean(s.view && s.view.unified);
}

function avKey(s, av) {
    const base = av.dataset.key || '';
    return isUnified(s) ? base : (av.dataset.group || base);
}

function adjustFor(s, av) {
    const source = s.editing ? s.editing.adjust : (s.view && s.view.settings.adjust) || {};
    const keys = isUnified(s) ? [av.dataset.key] : [av.dataset.group, av.dataset.legacy, av.dataset.key];
    for (const key of keys) if (key && Object.hasOwn(source, key)) return source[key];
    return null;
}

function avatarsOf(overlay, key) {
    const s = stateOf(overlay);
    return [...overlay.querySelectorAll('#igs-chat-reader .igs-cr-av[data-url]')].filter((av) => !key || avKey(s, av) === key);
}

function ensureRoot(overlay) {
    const found = overlay.querySelector('#igs-chat-reader');
    if (found) return found;
    const layer = overlay.querySelector('#igs-dialog-layer');
    if (!layer) return null;
    const root = el(overlay.ownerDocument, 'div');
    root.id = 'igs-chat-reader';
    root.innerHTML = '<div class="igs-cr-scroll"><div class="igs-cr-list"></div></div>';
    layer.insertBefore(root, layer.firstChild);
    bindRoot(overlay, root);
    return root;
}

function groupIndicesOf(group) {
    return [...group.querySelectorAll('.igs-cr-bubble')].map((b) => Number(b.dataset.index));
}

function bindRoot(overlay, root) {
    const s = stateOf(overlay);
    const adjustOfKey = (key) => { const av = avatarsOf(overlay, key)[0]; return (av && adjustFor(s, av)) || { x: 0, y: 0, z: 1 }; };
    const zoomBy = (key, k) => {
        const a = adjustOfKey(key);
        s.editing.adjust[key] = clampLogAdjust({ ...a, z: a.z * k });
        repaintKey(overlay, key);
    };
    const pickAvatar = (key) => {
        if (s.editing.pick === key) return;
        s.editing.pick = key;
        repaintKey(overlay, '');
        for (const btn of root.querySelectorAll('#igs-log-edit-bar [data-log-zoom],#igs-log-edit-bar [data-log-edit="reset"]')) btn.disabled = false;
    };
    root.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target : null;
        if (!target) return;
        const zoomBtn = target.closest('[data-log-zoom]');
        if (zoomBtn) {
            event.stopPropagation();
            if (s.editing && s.editing.pick) zoomBy(s.editing.pick, zoomBtn.getAttribute('data-log-zoom') === 'in' ? 1.06 : 1 / 1.06);
            return;
        }
        const editBtn = target.closest('[data-log-edit]');
        if (editBtn) { event.stopPropagation(); finishEdit(overlay, editBtn.getAttribute('data-log-edit')); return; }
        if (s.editing) return;
        const replay = target.closest('.igs-cr-replay');
        if (replay) {
            event.stopPropagation();
            const solo = replay.closest('.igs-cr-solo');
            if (solo && s.view && s.view.onReplay) s.view.onReplay(Number(solo.dataset.index));
            return;
        }
        const play = target.closest('.igs-cr-play');
        if (play) {
            event.stopPropagation();
            const group = play.closest('.igs-cr-group');
            const narr = play.closest('.igs-cr-narr');
            if (s.view && s.view.onPlay) s.view.onPlay(group ? groupIndicesOf(group) : [Number(narr && narr.dataset.index)]);
            return;
        }
        const mood = target.closest('.igs-fx-symbol,.igs-cr-chip');
        if (mood) {
            event.stopPropagation();
            replayMood(overlay, mood.closest('.igs-cr-group'), mood.closest('.igs-cr-chip'));
            return;
        }
        if (target.closest('.igs-cr-live')) {
            event.stopPropagation();
            if (s.view && s.view.onLiveRoom) s.view.onLiveRoom();
            return;
        }
        if (!target.closest('.igs-cr-scroll')) return;
        if (s.view && s.view.onTap) s.view.onTap();
    });
    const scroll = root.querySelector('.igs-cr-scroll');
    let frame = 0;
    scroll.addEventListener('scroll', () => {
        if (frame) return;
        frame = winOf(overlay).requestAnimationFrame(() => { frame = 0; reportSceneRow(overlay, scroll); });
    }, { passive: true });
    const pinch = new Map();
    let drag = null;
    root.addEventListener('pointerdown', (event) => {
        if (!s.editing) return;
        if (drag && pinch.size === 1 && !(event.target.closest && event.target.closest('#igs-log-edit-bar'))) {
            event.preventDefault();
            pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
            try { root.setPointerCapture(event.pointerId); } catch (_) { /* 旧浏览器 */ }
            drag.dist = 0;
            return;
        }
        const av = event.target.closest && event.target.closest('.igs-cr-av[data-url]:not([data-cover])');
        if (!av) return;
        event.preventDefault();
        pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { av.setPointerCapture(event.pointerId); } catch (_) { /* 旧浏览器 */ }
        drag = { key: avKey(s, av), x: event.clientX, y: event.clientY, dist: 0 };
        pickAvatar(avKey(s, av));
    });
    root.addEventListener('touchmove', (event) => { if (drag && s.editing) event.preventDefault(); }, { passive: false });
    root.addEventListener('pointermove', (event) => {
        if (!drag || !s.editing || !pinch.has(event.pointerId)) return;
        pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch.size === 2) {
            const [p, q] = [...pinch.values()];
            const dist = Math.hypot(p.x - q.x, p.y - q.y);
            if (drag.dist) zoomBy(drag.key, dist / drag.dist);
            drag.dist = dist;
            return;
        }
        const w = CHAT_AVATAR_BOX.w;
        const a = adjustOfKey(drag.key);
        s.editing.adjust[drag.key] = clampLogAdjust({ ...a, x: a.x + (event.clientX - drag.x) / w, y: a.y + (event.clientY - drag.y) / w });
        drag.x = event.clientX;
        drag.y = event.clientY;
        repaintKey(overlay, drag.key);
    });
    const release = (event) => {
        pinch.delete(event.pointerId);
        if (!pinch.size) { drag = null; return; }
        if (!drag) return;
        const [rest] = pinch.values();
        drag.dist = 0;
        drag.x = rest.x;
        drag.y = rest.y;
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('wheel', (event) => {
        const av = s.editing && event.target.closest && event.target.closest('.igs-cr-av[data-url]:not([data-cover])');
        if (!av) return;
        event.preventDefault();
        pickAvatar(avKey(s, av));
        zoomBy(avKey(s, av), event.deltaY < 0 ? 1.06 : 1 / 1.06);
    }, { passive: false });
}

// 名字色：资料里设的主色 → 默认立绘取色 → 按名字的固定色。
function hueOf(overlay, row, view) {
    const src = view.nameColorOf ? view.nameColorOf(row) : null;
    if (src && src.color) return src.color;
    if (src && src.url) {
        const hit = cachedSpriteNameColor(src.url);
        if (hit) return hit;
        if (hit === undefined) spriteNameColor(src.url, overlay.ownerDocument).then((color) => { if (color) repaintHue(overlay, row.key, color); }, () => {});
    }
    return logNameHue(row.key);
}

function repaintHue(overlay, key, color) {
    for (const node of overlay.querySelectorAll('#igs-chat-reader [data-hue-key]')) if (node.dataset.hueKey === key) node.style.setProperty('--igs-cr-hue', color);
}

function avatarNode(doc, row, view, hue) {
    const av = el(doc, 'div', 'igs-cr-av');
    av.dataset.key = row.key;
    av.dataset.hueKey = row.key;
    av.style.setProperty('--igs-cr-hue', hue);
    const found = view.avatarOf ? view.avatarOf(row) : null;
    if (!found || !found.url) {
        av.classList.add('is-letter');
        av.textContent = Array.from(row.speaker)[0] || '';
        return av;
    }
    av.dataset.url = found.url;
    av.dataset.key = found.adjustKey || row.key;
    if (found.groupKey) av.dataset.group = found.groupKey;
    if (found.legacyKey) av.dataset.legacy = found.legacyKey;
    if (found.cover) av.dataset.cover = '1';
    return av;
}

function paintAvatar(overlay, av) {
    const s = stateOf(overlay);
    const url = av.dataset.url;
    if (!url || !s.view) return;
    av.toggleAttribute('data-picked', !!(s.editing && s.editing.pick === avKey(s, av)));
    const doc = overlay.ownerDocument;
    const box = CHAT_AVATAR_BOX;
    if (av.dataset.cover) {
        av.style.backgroundImage = `url("${cssUrl(url)}")`;
        av.style.backgroundSize = 'cover';
        av.style.backgroundPosition = 'center';
        return;
    }
    const probed = peekSpriteHead(url, doc);
    const aspect = probed && probed.naturalW > 0 ? probed.naturalH / probed.naturalW : 0;
    const crop = logAvatarCrop(probed && probed.head, aspect, box, adjustFor(s, av));
    av.style.backgroundImage = `url("${cssUrl(url)}")`;
    av.style.backgroundSize = `${crop.size}px auto`;
    av.style.backgroundPosition = `${crop.x}px ${crop.y}px`;
    const head = probed && probed.head;
    if (head && aspect > 0) {
        const x = Math.max(box.w * 0.5, Math.min(box.w + 4, crop.x + (Number(head.x) + Number(head.w) * 0.35) * crop.size));
        const y = Math.max(0, Math.min(box.h * 0.6, crop.y + Number(head.top) * aspect * crop.size));
        av.style.setProperty('--igs-cr-sym-x', `${Math.round(x)}px`);
        av.style.setProperty('--igs-cr-sym-y', `${Math.round(y)}px`);
    }
    if (!probed && !av.dataset.probing) {
        av.dataset.probing = '1';
        probeSpriteHead(url, doc).then((info) => { if (info && av.isConnected) paintAvatar(overlay, av); }, () => {});
    }
}

function repaintKey(overlay, key) {
    for (const av of avatarsOf(overlay, key)) paintAvatar(overlay, av);
}

function composeHtml(row, view) {
    const html = view.htmlOf ? view.htmlOf(row) : esc(row.text);
    return row.label ? `<span class="igs-cr-label">${esc(row.label)}：</span>${html}` : html;
}

function playButton(doc) {
    const play = el(doc, 'button', 'igs-cr-play');
    play.type = 'button';
    play.title = '重听';
    play.setAttribute('aria-label', '重听');
    play.innerHTML = VOICE_ICON;
    return play;
}

function chipNode(doc, row, view) {
    const chip = el(doc, 'span', 'igs-cr-chip');
    if (view.chipKindOf) chip.dataset.kind = view.chipKindOf(row) || '';
    chip.textContent = row.mood;
    return chip;
}

function cardNode(doc, card, live) {
    const node = el(doc, 'div', 'igs-cr-card' + (live ? '' : ' is-in'));
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

function typingBubble(doc) {
    const node = el(doc, 'span', 'igs-cr-dots');
    for (let i = 0; i < 3; i += 1) node.append(el(doc, 'i'));
    return node;
}

function appendCards(doc, list, view, row, live, fades) {
    for (const card of (view.cardsOf ? view.cardsOf(row) : []) || []) {
        const node = cardNode(doc, card, live);
        list.append(node);
        fades.push(node);
    }
}

// 建一行：组头新开一组（头像 + 名字），续行挂到上一组里；旁白、场景分隔、卡片按序追加。
// fades 是这一行要淡入的节点（分隔线、旁白、卡片），say 行的气泡自己弹出。
function buildRow(overlay, list, rows, i, view, live) {
    const doc = overlay.ownerDocument;
    const row = rows[i];
    const fades = [];
    if (row.scene) {
        const scene = el(doc, 'div', 'igs-cr-time igs-cr-item' + (live ? '' : ' is-in'));
        scene.dataset.index = String(row.index);
        scene.textContent = row.scene;
        list.append(scene);
        fades.push(scene);
    }
    if (row.solo) {
        const node = el(doc, 'div', 'igs-cr-solo igs-cr-item' + (live ? '' : ' is-in'));
        node.dataset.index = String(row.index);
        const btn = el(doc, 'button', 'igs-cr-replay');
        btn.type = 'button';
        btn.innerHTML = `${REPLAY_SVG}<span></span>`;
        btn.querySelector('span').textContent = row.replay || '重播';
        node.append(btn);
        list.append(node);
        return { kind: 'solo', fades, text: null };
    }
    const html = composeHtml(row, view);
    if (row.kind === 'narr') {
        const node = el(doc, 'div', 'igs-cr-narr igs-cr-item' + (row.thought ? ' is-thought' : '') + (live ? '' : ' is-in'));
        node.dataset.index = String(row.index);
        const text = el(doc, 'div', 'igs-cr-text');
        text.dataset.html = html;
        if (!live) text.innerHTML = html;
        node.append(text);
        if (view.canSpeak && view.canSpeak(row)) node.append(playButton(doc));
        list.append(node);
        fades.push(node);
        appendCards(doc, list, view, row, live, fades);
        return { kind: 'narr', fades, text };
    }
    const cont = isChatCont(rows, i);
    const groups = list.querySelectorAll('.igs-cr-group');
    let group = cont ? groups[groups.length - 1] || null : null;
    const right = Boolean(row.user);
    const isNew = !group;
    if (isNew) {
        const showAv = right ? view.settings.userAvatar : view.settings.charAvatar;
        group = el(doc, 'div', `igs-cr-group is-${right ? 'right' : 'left'}${showAv ? '' : ' is-noav'}`);
        const hue = hueOf(overlay, row, view);
        const symbol = view.symbolOf ? view.symbolOf(row) : '';
        if (symbol) group.dataset.mood = symbol;
        if (showAv) group.append(avatarNode(doc, row, view, hue));
        const head = el(doc, 'div', 'igs-cr-col');
        if (!right) {
            const name = el(doc, 'div', 'igs-cr-name');
            const dot = el(doc, 'i', 'igs-cr-dot');
            dot.dataset.hueKey = row.key;
            dot.style.setProperty('--igs-cr-hue', hue);
            const b = el(doc, 'b');
            b.textContent = row.speaker;
            name.append(dot, b);
            if (row.mood && view.settings.chip) name.append(chipNode(doc, row, view));
            if (view.canSpeak && view.canSpeak(row)) name.append(playButton(doc));
            head.append(name);
        }
        group.append(head);
        list.append(group);
    }
    const col = group.querySelector('.igs-cr-col');
    const bubble = el(doc, 'div', 'igs-cr-bubble igs-cr-item' + (isNew ? ' is-first' : '') + (row.thought ? ' is-thought' : ''));
    bubble.dataset.index = String(row.index);
    const text = el(doc, 'div', 'igs-cr-text');
    text.dataset.html = html;
    if (!live) text.innerHTML = html;
    bubble.append(text);
    if (isNew && right && view.canSpeak && view.canSpeak(row)) bubble.append(playButton(doc));
    col.append(bubble);
    appendCards(doc, list, view, row, live, fades);
    return { kind: 'say', fades, text, bubble, group, cont: !isNew, right };
}

function placeSymbol(overlay, group, kind, { done = false } = {}) {
    const s = stateOf(overlay);
    if (!kind || !s.view || s.view.settings.emotion === 'off' || !MANGA_SYMBOL_SVG[kind]) return null;
    const av = group && group.querySelector('.igs-cr-av');
    if (!av) return null;
    av.querySelector('.igs-fx-symbol')?.remove();
    const sym = el(overlay.ownerDocument, 'span', 'igs-fx-symbol');
    sym.dataset.kind = kind;
    sym.innerHTML = MANGA_SYMBOL_SVG[kind];
    if (done) sym.classList.add('is-done');
    av.append(sym);
    return sym;
}

function refreshLoops(overlay) {
    const s = stateOf(overlay);
    const mode = s.view ? s.view.settings.emotion : 'off';
    const all = [...overlay.querySelectorAll('#igs-chat-reader .igs-cr-av>.igs-fx-symbol')];
    const win = winOf(overlay);
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
        win.setTimeout(() => { sym.classList.remove('is-once'); sym.classList.add('is-done'); }, ONCE_MS);
    });
}

// 点符号或胶囊：在组头头像上重播一次（点的是组内换了情绪的胶囊时，临时换成那个情绪）。
function replayMood(overlay, group, chip) {
    const s = stateOf(overlay);
    if (!group || !s.view || s.view.settings.emotion === 'off') return;
    const kind = (chip && chip.dataset.kind) || group.dataset.mood;
    const sym = placeSymbol(overlay, group, kind);
    if (!sym) return;
    sym.classList.add('is-once');
    winOf(overlay).setTimeout(() => { if (!sym.isConnected) return; sym.classList.remove('is-once'); sym.classList.add('is-done'); refreshLoops(overlay); }, ONCE_MS);
}

function playPopSound(view, built, row) {
    const sound = view.sound;
    if (!sound || sound.enabled === false || !(sound.volume > 0)) return;
    try { playChatSfx(chatSfxKindForSide(built.right ? 'right' : 'left'), { volume: sound.volume, preset: sound.preset }); } catch { /* 无音频环境 */ }
}

// 出现：角色台词先插「正在输入」三点（组头第一条；续行只停一小会儿），再原地换成正文并弹出；旁白、分隔线、卡片淡入。
// 返回的 promise 在弹出完成后 resolve；s.reveal.finish 可把整条立即补完。
function reveal(overlay, built, view, row) {
    const s = stateOf(overlay);
    const win = winOf(overlay);
    const k = LOG_SPEEDS[view.settings.speed] || 1;
    const calm = reducedMotion(overlay);
    const html = built.text ? built.text.dataset.html || '' : '';
    const fadeIn = () => { for (const n of built.fades) n.classList.add('is-in'); };
    if (built.kind !== 'say') {
        if (built.text) built.text.innerHTML = html;
        win.requestAnimationFrame(fadeIn);
        return Promise.resolve();
    }
    win.requestAnimationFrame(fadeIn);
    const { bubble, text } = built;
    let wait = 0;
    let dots = false;
    if (!calm && !built.right) {
        if (built.cont) wait = CONT_PAUSE_MS * k;
        else if (view.settings.typing) { dots = true; wait = Math.max(TYPING_FLOOR_MS, chatRevealDelayMs(row.text, 'medium') * 0.4) * k; }
    }
    return new Promise((resolve) => {
        let done = false;
        let hold = null;
        let tail = null;
        const finish = () => {
            if (done) return;
            done = true;
            if (s.reveal === job) s.reveal = null;
            win.clearTimeout(hold);
            win.clearTimeout(tail);
            bubble.classList.remove('is-typing', 'is-pop');
            bubble.hidden = false;
            disarmTextFx(text);
            text.innerHTML = html;
            resolve();
        };
        const show = () => {
            if (done) return;
            bubble.classList.remove('is-typing');
            text.innerHTML = html;
            bubble.hidden = false;
            bubble.classList.add('is-pop');
            playPopSound(view, built, row);
            armTextFx(text, () => 0);
            let total = POP_MS;
            if (text.querySelector('.igs-tfx-big,.igs-tfx-roar')) total = Math.max(total, TFX_POP_MS);
            tail = win.setTimeout(finish, total);
        };
        const job = { finish };
        s.reveal = job;
        if (dots) {
            bubble.classList.add('is-typing');
            text.textContent = '';
            text.append(typingBubble(overlay.ownerDocument));
            hold = win.setTimeout(show, wait);
        } else if (wait > 0) {
            bubble.hidden = true;
            hold = win.setTimeout(show, wait);
        } else show();
    });
}

function reportSceneRow(overlay, scroll) {
    const s = stateOf(overlay);
    if (!s.view || !s.view.onSceneRow) return;
    if (Date.now() < Number(scroll.dataset.autoUntil || 0)) return;
    const rows = scroll.querySelectorAll('.igs-cr-item');
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
    const scroll = root.querySelector('.igs-cr-scroll');
    if (!scroll) return;
    scroll.dataset.autoUntil = String(Date.now() + (smooth ? 800 : 50));
    if (smooth && typeof scroll.scrollTo === 'function') scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
    else scroll.scrollTop = scroll.scrollHeight;
}

function syncLiveButton(overlay, root, view) {
    let btn = root.querySelector('.igs-cr-live');
    const room = view.liveRoom;
    if (!room) { if (btn) btn.remove(); return; }
    if (!btn) {
        btn = el(overlay.ownerDocument, 'button', 'igs-cr-live');
        btn.type = 'button';
        btn.innerHTML = LIVE_PHONE_SVG;
        root.appendChild(btn);
    }
    const label = `进入直播间${room.name ? `：${room.name}` : ''}`;
    if (btn.getAttribute('aria-label') !== label) { btn.setAttribute('aria-label', label); btn.title = label; }
}

// 心里话「浅色实底」档：气泡色往白里提亮，预先算成实色。
function softOf(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#f1eef6';
    const n = parseInt(m[1], 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.55).toString(16).padStart(2, '0');
    return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

function applyAttrs(overlay, root, view) {
    const set = (name, value, node = root) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const st = view.settings;
    set('data-igs-log-skin', view.skin, overlay);
    set('data-igs-log-edge', 'normal', overlay);
    set('data-narr', st.narr);
    set('data-thought', st.thoughtClear ? 'clear' : 'solid');
    set('data-av', st.avatar);
    set('data-mood-size', st.moodSize);
    if (view.hidden) set('data-hidden', ''); else root.removeAttribute('data-hidden');
    const theme = st.followTheme && view.theme ? view.theme : null;
    const left = theme ? theme.left : st.leftColor;
    const right = theme ? theme.right : st.rightColor;
    const fonts = view.fonts || {};
    const fx = view.textEffect || {};
    const vars = [
        ['--igs-cr-left', left], ['--igs-cr-left-ink', readableTextColor(left)], ['--igs-cr-left-soft', softOf(left)],
        ['--igs-cr-right', right], ['--igs-cr-right-ink', readableTextColor(right)], ['--igs-cr-right-soft', softOf(right)],
        ['--igs-cr-radius', `${st.radius}px`], ['--igs-cr-fs', `${st.fontSize}px`], ['--igs-cr-dim', String(st.dim)],
        ['--igs-cr-gap', `${CHAT_READER_GAPS[st.groupGap]}px`], ['--igs-cr-font', (theme && theme.font) || fonts.text || ''],
        ['--igs-cr-name-font', fonts.name || ''], ['--igs-cr-narr-font', fonts.narration || ''], ['--igs-cr-shadow', fx.shadow || ''],
    ];
    for (const [prop, value] of vars) if (value) root.style.setProperty(prop, value); else root.style.removeProperty(prop);
    const dialog = overlay.querySelector('#igs-dialog');
    const foot = dialog && dialog.offsetHeight > 0 ? `${dialog.offsetHeight}px` : '';
    if (foot) { root.style.setProperty('--igs-log-foot', foot); overlay.style.setProperty('--igs-log-foot', foot); }
}

// view：{ floorKey, rows, upto（含）, batchStart, live（这次要出现的行号，-1 表示瞬间补齐）, settings（normalizeChatReaderSettings 加 adjust）, skin, tone,
//   theme（跟随皮肤时的 { left, right, font }）, fonts, textEffect, hidden, avatarOf, nameColorOf, symbolOf, chipKindOf, htmlOf, canSpeak, cardsOf,
//   onTap, onPlay, onReplay, onSceneRow, onSaveAdjust, liveRoom, onLiveRoom }
// 返回 { revealing }：live 行弹出完成时 resolve。
export function syncChatReader(overlay, view) {
    if (!overlay) return { revealing: null };
    if (!view) {
        overlay.removeAttribute('data-igs-chat-reader');
        overlay.removeAttribute('data-igs-log-reader');
        return { revealing: null };
    }
    const root = ensureRoot(overlay);
    if (!root) return { revealing: null };
    // 立绘隐藏、对话框换皮、页码进度条这些共用规则认纵向的开关属性：聊天模式同时挂上。调用方先收起未启用的那一个、再同步启用的。
    if (overlay.getAttribute('data-igs-chat-reader') !== 'on') overlay.setAttribute('data-igs-chat-reader', 'on');
    if (overlay.getAttribute('data-igs-log-reader') !== 'on') overlay.setAttribute('data-igs-log-reader', 'on');
    const s = stateOf(overlay);
    s.view = view;
    applyAttrs(overlay, root, view);
    syncLiveButton(overlay, root, view);
    const list = root.querySelector('.igs-cr-list');
    const st = view.settings;
    const sig = JSON.stringify([view.floorKey, st.avatar, st.charAvatar, st.userAvatar, st.chip, st.emotion, view.skin, view.nameColorSig || '']);
    if (sig !== s.sig || view.upto + 1 < s.rendered) {
        if (s.reveal) s.reveal.finish();
        list.textContent = '';
        s.rendered = 0;
        s.sceneRow = -1;
        s.sig = sig;
    }
    const adjustSig = JSON.stringify([st.adjust, Boolean(view.unified)]);
    if (adjustSig !== s.adjustSig) { s.adjustSig = adjustSig; repaintKey(overlay, ''); }
    let revealing = null;
    const before = s.rendered;
    for (let i = s.rendered; i <= view.upto && i < view.rows.length; i++) {
        const live = i === view.live;
        const built = buildRow(overlay, list, view.rows, i, view, live);
        if (built.kind === 'say') {
            for (const av of built.group.querySelectorAll('.igs-cr-av[data-url]')) paintAvatar(overlay, av);
            if (!built.cont) placeSymbol(overlay, built.group, built.group.dataset.mood, { done: !live });
        }
        if (live && built.kind !== 'solo') revealing = reveal(overlay, built, view, view.rows[i]);
        s.rendered = i + 1;
    }
    refreshLoops(overlay);
    if (s.rendered !== before) scrollEnd(root, Boolean(revealing));
    return { revealing };
}

export function finishChatReveal(overlay) {
    const s = overlay ? states.get(overlay) : null;
    if (!s || !s.reveal) return false;
    s.reveal.finish();
    return true;
}

export function isChatEditing(overlay) {
    const s = overlay ? states.get(overlay) : null;
    return Boolean(s && s.editing);
}

export function toggleChatEdit(overlay) {
    const s = overlay ? states.get(overlay) : null;
    const root = overlay && overlay.querySelector('#igs-chat-reader');
    if (!s || !root || !s.view) return false;
    if (s.editing) { finishEdit(overlay, 'save'); return true; }
    s.editing = { adjust: JSON.parse(JSON.stringify(s.view.settings.adjust || {})), unified: Boolean(s.view.unified) };
    root.setAttribute('data-editing', '');
    const bar = el(overlay.ownerDocument, 'div');
    bar.id = 'igs-log-edit-bar';
    bar.innerHTML = `<span>拖动取景</span><button type="button" data-log-edit="unify" aria-pressed="${s.editing.unified}" title="同一角色的所有情绪共用一个取景，与立绘设置的「统一角色立绘位置」同步">统一</button><button type="button" data-log-zoom="out" disabled aria-label="缩小">－</button><button type="button" data-log-zoom="in" disabled aria-label="放大">＋</button><button type="button" data-log-edit="reset" disabled>重置</button><button type="button" data-log-edit="cancel">取消</button><button type="button" data-log-edit="save">保存</button>`;
    root.append(bar);
    return true;
}

function finishEdit(overlay, kind) {
    const s = stateOf(overlay);
    if (!s.editing) return;
    if (kind === 'unify') {
        s.editing.unified = !s.editing.unified;
        s.editing.pick = '';
        const bar = overlay.querySelector('#igs-log-edit-bar');
        if (bar) {
            bar.querySelector('[data-log-edit="unify"]')?.setAttribute('aria-pressed', String(s.editing.unified));
            for (const btn of bar.querySelectorAll('[data-log-zoom],[data-log-edit="reset"]')) btn.disabled = true;
        }
        repaintKey(overlay, '');
        return;
    }
    if (kind === 'reset') {
        const av = s.editing.pick ? avatarsOf(overlay, s.editing.pick)[0] : null;
        if (!av) return;
        const keys = s.editing.unified ? [av.dataset.key] : [av.dataset.group, av.dataset.legacy, av.dataset.key];
        const hit = keys.find((key) => key && Object.hasOwn(s.editing.adjust, key));
        if (hit) delete s.editing.adjust[hit];
        repaintKey(overlay, '');
        return;
    }
    const adjust = s.editing.adjust;
    const unified = s.editing.unified;
    s.editing = null;
    const root = overlay.querySelector('#igs-chat-reader');
    if (root) { root.removeAttribute('data-editing'); root.querySelector('#igs-log-edit-bar')?.remove(); }
    repaintKey(overlay, '');
    if (kind === 'save' && s.view && s.view.onSaveAdjust) s.view.onSaveAdjust(adjust, unified);
}
