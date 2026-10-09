import { COMIC_GAP_LEVELS, COMIC_LINE_LEVELS, normalizeComicModeSettings } from './comic-settings.js';
import { resolveComicTone } from './text-tone.js';
import { applyColumnBreaks, planVerticalColumns, prefersHorizontal, readPlainText, sliceRichText, splitBubbleChunks } from './comic-typeset.js';
import { bodyPath, fitSuperellipse, hashSeed, linkPath, makeRand, tailPath, thoughtTrail } from './comic-shapes.js';
import { arrangeChain, placeComicGroup, resolveHeadBox, resolveTail } from './comic-layout.js';
import { resolveChatTheme } from './chat-themes.js';
import { normalizeDialogSkin } from './classic-dialog-skin.js';
import { pickFxAccent } from './fx-symbols.js';
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';
import { prefersReducedMotion } from './reduced-motion.js';

// 漫画演出模式运行时：把本页台词排成竖排对话泡，贴在说话人旁、尾巴指向嘴边；黑白模式给整个画面叠网点、加画格。
// #igs-text 保持原样（隐藏），打字机、文字特效的源头不变；泡里的文字是它的排版副本。

const SVG_NS = 'http://www.w3.org/2000/svg';
const SHAPE_OF = Object.freeze({
    speech: 'oval', whisper: 'oval', dark: 'oval', phone: 'oval',
    calm: 'box', system: 'box', narration: 'narration',
    thought: 'thought', shout: 'shout', fear: 'fear', cute: 'cute',
});
// 尖刺、云朵、花边会伸出泡体：摆位按外接尺寸算。
const SHAPE_REACH = Object.freeze({ shout: 1.4, thought: 1.06, cute: 1.05 });
// 指数越大越方：管的是左右两条长边，对白的两侧偏直一点，心里话更方。
const SHAPE_EXP = Object.freeze({ oval: 4, thought: 3.8, shout: 2.2, cute: 2.6, fear: 2.8 });
// 可以用细线相连的泡形；爆炸框、心里话仍然咬合。
// 上下两头的指数：小于 2 收成圆圆的尖头，不写就和两侧一样。
const SHAPE_TIP = Object.freeze({ oval: 1.7, fear: 1.8 });
const LINKED_SHAPES = new Set(['oval', 'cute', 'fear', 'box']);
const FONT_SCALE = Object.freeze({ shout: 1.12, whisper: 0.86, narration: 0.9, system: 0.9, thought: 0.94 });
const SPEECH_LIKE = new Set(['speech', 'whisper', 'dark', 'phone', 'calm', 'thought', 'shout', 'fear', 'cute']);

const states = new WeakMap();

function stateOf(root) {
    let state = states.get(root);
    if (!state) {
        state = { key: '', pageKey: '', group: null, ghost: null, ghostRect: null, prevTone: '', sceneKey: '', revealEnd: 0, last: null, resizeBound: false, paletteKey: '' };
        states.set(root, state);
    }
    return state;
}

function setAttr(el, name, value) {
    if (!el) return;
    if (value == null || value === false) {
        if (el.hasAttribute && el.hasAttribute(name)) el.removeAttribute(name);
    } else if (!el.getAttribute || el.getAttribute(name) !== String(value)) {
        el.setAttribute(name, String(value));
    }
}

function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
}

function luminance(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 1;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const PALETTE_VARS = ['--igs-comic-paper', '--igs-comic-ink', '--igs-comic-text', '--igs-comic-accent', '--igs-comic-gutter', '--igs-comic-family'];

// 彩色模式：纸色、墨色、字色取原对话框皮肤的聊天配色，强调色取主题里最鲜艳的颜色。
function applyPalette(root, readerSettings, comic, theme, state) {
    const palette = comic.palette;
    const skin = normalizeDialogSkin(readerSettings && readerSettings.dialogSkin);
    const ink = comic.inkMode === 'custom' ? comic.inkColor : '';
    const key = `${palette}:${skin}:${ink}`;
    if (state.paletteKey === key) return;
    state.paletteKey = key;
    const style = root.style;
    if (!style || typeof style.setProperty !== 'function') return;
    for (const name of PALETTE_VARS) style.removeProperty(name);
    if (palette === 'color') applyColorPalette(style, skin, theme);
    // 自选描边色只换泡的墨线，字色仍跟随配色。
    if (ink) style.setProperty('--igs-comic-ink', ink);
}

function applyColorPalette(style, skin, theme) {
    const chat = resolveChatTheme(skin);
    const paper = chat.left;
    const dark = luminance(paper) < 0.45;
    const ink = dark ? chat.headInk : chat.frame;
    style.setProperty('--igs-comic-paper', paper);
    style.setProperty('--igs-comic-ink', ink);
    // 字色要够深：浅纸用皮肤主色压到接近黑，深纸用皮肤的浅字色。
    style.setProperty('--igs-comic-text', dark ? chat.headInk : `color-mix(in oklab, ${chat.frame} 28%, #161616)`);
    style.setProperty('--igs-comic-accent', pickFxAccent(theme) || chat.right);
    style.setProperty('--igs-comic-gutter', chat.shell);
    if (chat.font) style.setProperty('--igs-comic-family', chat.font);
    else style.removeProperty('--igs-comic-family');
}

function ensureLayer(motion, doc, id, after) {
    let el = motion.querySelector ? motion.querySelector(`#${id}`) : null;
    if (el) return el;
    el = doc.createElement('div');
    el.id = id;
    el.setAttribute('aria-hidden', 'true');
    if (after && after.parentNode === motion) motion.insertBefore(el, after.nextSibling);
    else motion.appendChild(el);
    return el;
}

// 网点层挂在立绘之后（漫画符号之下），画格挂在对话层之前：泡可以压过画格（破格）。
function syncPageLayers(motion, doc, palette, frame) {
    const sprite = motion.querySelector ? motion.querySelector('#igs-sprite') : null;
    ensureLayer(motion, doc, 'igs-comic-screen', sprite);
    if (frame) {
        const dialogLayer = motion.querySelector ? motion.querySelector('#igs-dialog-layer') : null;
        const el = ensureLayer(motion, doc, 'igs-comic-frame', null);
        if (dialogLayer && dialogLayer.parentNode === motion && el.nextSibling !== dialogLayer) motion.insertBefore(el, dialogLayer);
    } else {
        removeNode(motion.querySelector && motion.querySelector('#igs-comic-frame'));
    }
}

function teardown(root, motion, dialog, state) {
    if (!root.hasAttribute || !root.hasAttribute('data-igs-comic')) return;
    setAttr(root, 'data-igs-comic', null);
    setAttr(root, 'data-igs-comic-frame', null);
    setAttr(root, 'data-igs-comic-input', null);
    if (dialog) setAttr(dialog, 'data-igs-comic-host', null);
    removeNode(state.group);
    removeNode(state.ghost);
    state.group = null;
    state.ghost = null;
    state.key = '';
    state.pageKey = '';
    state.paletteKey = '';
    for (const name of PALETTE_VARS) if (root.style && root.style.removeProperty) root.style.removeProperty(name);
    if (motion && motion.querySelector) {
        removeNode(motion.querySelector('#igs-comic-screen'));
        removeNode(motion.querySelector('#igs-comic-frame'));
    }
}

// 元素相对舞台的矩形（舞台可能被外层 transform 缩放，换回舞台自身像素）。
function rectIn(motion, el) {
    if (!el || typeof el.getBoundingClientRect !== 'function' || typeof motion.getBoundingClientRect !== 'function') return null;
    const r = el.getBoundingClientRect();
    const m = motion.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0) || !(m.width > 0)) return null;
    const k = motion.clientWidth / m.width;
    return { x: (r.left - m.left) * k, y: (r.top - m.top) * k, w: r.width * k, h: r.height * k };
}

function svgEl(doc, tag, attrs) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

// 单个泡的外形尺寸：按文字块各列的首尾角点求最小超椭圆，再加按字号的留白。
function bubbleShape(shape, metric, font) {
    const { w, h, lengths, horizontal } = metric;
    if (shape === 'box' || shape === 'narration') {
        const pad = font * (shape === 'narration' ? 0.7 : 0.8);
        return { a: w / 2 + pad, b: h / 2 + pad, n: 2, tip: 2, dx: 0, dy: 0 };
    }
    const pad = font * 0.92;
    const pts = [];
    if (!horizontal && lengths.length) {
        const pitch = w / lengths.length;
        const longest = Math.max(...lengths);
        const unit = longest > 0 ? h / longest : font;
        lengths.forEach((len, i) => {
            const xc = w / 2 - (i + 0.5) * pitch;
            const y1 = -h / 2 + len * unit;
            pts.push([xc - font / 2, -h / 2], [xc + font / 2, -h / 2], [xc - font / 2, y1], [xc + font / 2, y1]);
        });
    } else {
        pts.push([-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]);
    }
    const n = SHAPE_EXP[shape] || 3.1;
    const tip = SHAPE_TIP[shape] || n;
    const aspect = Math.min(3.2, Math.max(0.62, (h + pad * 2) / (w + pad * 2)));
    // 泡心不一定在文字外框中心：列长参差时把泡心挪向字多的一侧，让四周留白均匀（面积最小）。
    let best = null;
    for (let i = -3; i <= 3; i += 1) {
        for (let j = -3; j <= 3; j += 1) {
            const dx = i * w * 0.04;
            const dy = j * h * 0.04;
            const fit = fitSuperellipse(pts, dx, dy, aspect, n, tip);
            const area = (fit.a + pad) * (fit.b + pad);
            if (!best || area < best.area - 0.5) best = { area, fit, dx, dy };
        }
    }
    return { a: Math.max(font * 1.5, best.fit.a + pad), b: Math.max(font * 1.5, best.fit.b + pad), n, tip, dx: best.dx, dy: best.dy };
}

function maxColumnLength(shape) {
    if (shape === 'narration') return 13;
    if (shape === 'box') return 12;
    return 12;
}

// 本页的说话人头部：立绘就是说话人时才锚定；探测未完成先用手动标定或默认头位，探测完成后重排一次。
function headFor(motion, opts, content) {
    const sprite = opts.sprite;
    if (!sprite || !sprite.url) return { head: null, pending: false };
    if (!content.speaker || (content.spriteCharacter && content.spriteCharacter !== content.speaker)) return { head: null, pending: false };
    const probed = peekSpriteHead(sprite.url);
    const manual = sprite.head || null;
    const naturalW = probed ? probed.naturalW : 1;
    const naturalH = probed ? probed.naturalH : manual && manual.aspect;
    if (!(naturalW > 0) || !(naturalH > 0)) return { head: null, pending: true };
    const head = manual || (probed && probed.head) || null;
    const geo = { posX: sprite.posX, posY: sprite.posY, scale: sprite.scale, naturalW, naturalH, head: sprite.flip === true && head ? { ...head, x: 1 - Number(head.x) } : head };
    return { head: resolveHeadBox(motion.clientWidth, motion.clientHeight, geo), pending: !probed && !manual };
}

function overlapRatio(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? (w * h) / Math.max(1, b.w * b.h) : 0;
}

function isThoughtOnly(textEl) {
    if (!textEl || !textEl.querySelector || !textEl.querySelector('.igs-thought')) return false;
    const copy = textEl.cloneNode(true);
    for (const el of Array.from(copy.querySelectorAll('.igs-thought'))) el.remove();
    return readPlainText(copy).trim() === '';
}

// 立绘位置在本次渲染之后才定下来（同屏对齐头部要等探测）：按最新位置重排本页的泡，不重播弹出。
export function relayoutComic(root) {
    const state = root ? states.get(root) : null;
    if (!state || !state.last || !state.group) return;
    state.key = '';
    layoutPage(root, state.last.snapshot, state.last.opts, { relayout: true });
}

// 点泡或点空白时先把还在依次弹出的泡一次放完，消费这次点击。
export function finishComicReveal(root) {
    const state = root ? states.get(root) : null;
    if (!state || !state.group || !(state.revealEnd > Date.now())) return false;
    state.revealEnd = 0;
    state.group.classList.add('is-revealed');
    return true;
}

export function isComicGhostTarget(target) {
    return Boolean(target && target.closest && target.closest('.igs-comic-ghost'));
}

function demoteToGhost(state, keep) {
    removeNode(state.ghost);
    state.ghost = null;
    state.ghostRect = null;
    // 拆成几个泡的长台词不留残影：几团淡泡叠在新泡旁边太乱。
    if (keep && state.group && state.groupRect && state.group.querySelectorAll('.igs-comic-bubble').length === 1) {
        state.ghost = state.group;
        state.ghost.classList.remove('is-measuring');
        state.ghost.classList.add('igs-comic-ghost', 'is-revealed');
        const r = state.groupRect;
        state.ghost.style.transformOrigin = `${Math.round(r.x + r.w / 2)}px ${Math.round(r.y + r.h / 2)}px`;
        // 缩小后的残影范围：新泡摆位时要躲开它。
        state.ghostRect = { x: r.x + r.w * 0.06, y: r.y + r.h * 0.06, w: r.w * 0.88, h: r.h * 0.88 };
    } else {
        removeNode(state.group);
    }
    state.group = null;
    state.groupRect = null;
}

export function applyComicToDom(root, snapshot, opts = {}) {
    if (!root || !root.querySelector) return { active: false };
    const reader = (snapshot && snapshot.readerSettings) || {};
    const comic = normalizeComicModeSettings(reader.comicMode);
    const motion = root.querySelector('#igs-stage-motion') || root;
    const dialog = opts.dialog || root.querySelector('#igs-dialog');
    const state = stateOf(root);
    if (!comic.enabled || !dialog) {
        teardown(root, motion, dialog, state);
        return { active: false };
    }
    const doc = root.ownerDocument;
    setAttr(root, 'data-igs-comic', comic.palette);
    setAttr(root, 'data-igs-comic-frame', comic.frame ? '1' : null);
    setAttr(root, 'data-igs-comic-input', comic.inputStyle);
    setAttr(dialog, 'data-igs-comic-host', '1');
    applyPalette(root, reader, comic, opts.theme, state);
    syncPageLayers(motion, doc, comic.palette, comic.frame);
    if (!state.resizeBound && doc.defaultView && typeof doc.defaultView.addEventListener === 'function') {
        state.resizeBound = true;
        let queued = false;
        doc.defaultView.addEventListener('resize', () => {
            if (queued || !state.last) return;
            queued = true;
            doc.defaultView.requestAnimationFrame(() => {
                queued = false;
                if (!state.last || !root.isConnected) return;
                state.key = '';
                layoutPage(root, state.last.snapshot, state.last.opts, { relayout: true });
            });
        });
    }
    state.last = { snapshot, opts };
    return layoutPage(root, snapshot, opts, {});
}

function layoutPage(root, snapshot, opts, { relayout = false }) {
    const reader = snapshot.readerSettings || {};
    const comic = normalizeComicModeSettings(reader.comicMode);
    const motion = root.querySelector('#igs-stage-motion') || root;
    const dialog = opts.dialog || root.querySelector('#igs-dialog');
    const textEl = opts.textEl || root.querySelector('#igs-text');
    const state = stateOf(root);
    const doc = root.ownerDocument;
    const content = snapshot.content || {};
    const stageW = motion.clientWidth;
    const stageH = motion.clientHeight;
    const plain = textEl ? readPlainText(textEl) : '';
    const pageKey = String(opts.renderKey || '');
    const sceneKey = String(content.sceneLocation || '');
    if (!(stageW > 0) || !(stageH > 0) || !plain.trim() || !pageKey) {
        demoteToGhost(state, false);
        removeNode(state.ghost);
        state.ghost = null;
        state.key = '';
        state.pageKey = pageKey;
        return { active: true };
    }
    // 角色台词整句包在 *…* 里（渲染成 .igs-thought）也是心里话。
    const textType = opts.textType === 'dialogue' && isThoughtOnly(textEl) ? 'thought' : opts.textType;
    const tone = resolveComicTone({
        textType, text: content.text, emotion: content.statusEmotion,
        tones: comic.tones, whisper: opts.whisper === true, phone: opts.phone === true,
    });
    const shape = SHAPE_OF[tone] || 'oval';
    const computed = doc.defaultView && typeof doc.defaultView.getComputedStyle === 'function' && textEl ? doc.defaultView.getComputedStyle(textEl) : null;
    const baseFont = (computed && parseFloat(computed.fontSize)) || 18;
    const font = Math.round(baseFont * (FONT_SCALE[tone] || 1) * 10) / 10;
    const { head, pending } = headFor(motion, opts, content);
    const headKey = head ? `${Math.round(head.cx)},${Math.round(head.top)},${Math.round(head.w)}` : 'none';
    const key = [pageKey, stageW, stageH, font, comic.palette, comic.line, comic.gap, comic.tail ? 1 : 0, tone, headKey, opts.isLastPage ? 1 : 0].join('|');
    if (state.key === key && state.group && state.group.isConnected) return { active: true, tone };
    if (pending && opts.sprite && opts.sprite.url) {
        probeSpriteHead(opts.sprite.url, doc).then(() => {
            if (state.pageKey !== pageKey || !state.last) return;
            state.key = '';
            layoutPage(root, state.last.snapshot, state.last.opts, { relayout: true });
        }, () => null);
    }
    const newPage = state.pageKey !== pageKey;
    if (newPage) {
        // 上一句留作淡化残影：同一场景、上一句是台词或心里话、本页不是旁白时才留。
        const keep = comic.keepPrev && SPEECH_LIKE.has(state.prevTone) && state.sceneKey === sceneKey && tone !== 'narration' && tone !== 'system';
        demoteToGhost(state, keep);
    } else {
        removeNode(state.group);
        state.group = null;
    }
    state.key = key;
    state.pageKey = pageKey;
    state.prevTone = tone;
    state.sceneKey = sceneKey;

    const group = doc.createElement('div');
    group.className = 'igs-comic-group is-measuring';
    group.setAttribute('data-tone', tone);
    group.setAttribute('data-shape', shape);
    group.setAttribute('data-head', headKey);
    group.style.setProperty('--igs-comic-font', `${font}px`);
    if (relayout || !newPage) group.classList.add('is-revealed');
    dialog.appendChild(group);

    const horizontal = prefersHorizontal(plain);
    const chunks = splitBubbleChunks(plain, { limit: shape === 'narration' ? 54 : 30, maxParts: 3 });
    const items = chunks.map(([a, b]) => {
        const bubble = doc.createElement('div');
        bubble.className = 'igs-comic-bubble';
        const text = doc.createElement('div');
        text.className = horizontal ? 'igs-comic-text is-h' : 'igs-comic-text';
        text.appendChild(sliceRichText(textEl, a, b, doc));
        let lengths = [];
        if (!horizontal) {
            const plan = planVerticalColumns(readPlainText(text), { maxLen: maxColumnLength(shape) });
            applyColumnBreaks(text, plan, doc);
            lengths = plan.lengths;
        }
        bubble.appendChild(text);
        group.appendChild(bubble);
        return { bubble, text, lengths, chars: b - a };
    });
    const metrics = items.map((item) => ({ w: item.text.offsetWidth, h: item.text.offsetHeight, lengths: item.lengths, horizontal }));
    const shapes = metrics.map((m) => bubbleShape(shape, m, font));
    const reach = SHAPE_REACH[shape] || 1;
    const line = Math.max(1, font * 0.12 * (COMIC_LINE_LEVELS[comic.line] || 1));
    const sizes = shapes.map((s) => ({ ax: s.a * reach + line, by: s.b * reach + line }));

    const margin = 14;
    const avoid = [];
    const toolbar = root.querySelector('#igs-ctrl-bar');
    const hud = root.querySelector('#igs-status-hud');
    const controls = dialog.querySelector('.igs-controls');
    // 首次使用的邀请条也在顶部，泡要躲开它。
    const invite = root.querySelector('#igs-onboarding-invite');
    for (const el of [toolbar, hud, invite]) {
        const r = rectIn(motion, el);
        if (r) avoid.push(r);
    }
    const controlsRect = opts.isLastPage ? rectIn(motion, controls) : null;
    if (state.ghostRect) avoid.push(state.ghostRect);
    // 同屏其他角色的脸不能被泡挡住。
    for (const member of Array.isArray(opts.cast) ? opts.cast : []) {
        if (!member || member.character === content.speaker) continue;
        const probed = peekSpriteHead(member.url);
        const box = probed ? resolveHeadBox(stageW, stageH, { ...member, naturalW: probed.naturalW, naturalH: probed.naturalH, head: member.head || probed.head }) : null;
        if (box) avoid.push({ x: box.cx - box.w * 0.6, y: box.top - box.h * 0.05, w: box.w * 1.2, h: box.h * 1.15, weight: 6 });
    }
    // 上一句的残影若盖住了（换站位后的）脸，就不留了。
    if (state.ghost && state.ghostRect) {
        const faces = avoid.filter((r) => r.weight);
        if (head) faces.push({ x: head.cx - head.w * 0.6, y: head.top, w: head.w * 1.2, h: head.h });
        if (faces.some((f) => overlapRatio(state.ghostRect, f) > 0.12)) {
            removeNode(state.ghost);
            state.ghost = null;
            avoid.splice(avoid.indexOf(state.ghostRect), 1);
            state.ghostRect = null;
        }
    }
    const safe = { left: margin, top: margin, right: stageW - margin, bottom: stageH - margin - (controlsRect ? controlsRect.h + 10 : 0) };
    const anchored = Boolean(head) && shape !== 'narration' && tone !== 'system';
    const kind = shape === 'narration' ? 'narration' : (tone === 'system' ? 'system' : (anchored ? (tone === 'thought' ? 'thought' : 'speech') : 'offscreen'));
    const offSide = hashSeed(content.speaker || '') % 2 ? 'left' : 'right';
    const maxChainW = (stageW - margin * 2) * 0.92;
    // 细连线不是每处都有：按页随机（同一页每次重排结果一样），其余的接缝照旧咬合。
    const links = sizes.map((_, i) => i > 0 && LINKED_SHAPES.has(shape) && hashSeed(`${pageKey}:link:${i}`) % 2 === 0);
    const chains = sizes.length > 1 ? [arrangeChain(sizes, maxChainW, 'auto', links), arrangeChain(sizes, maxChainW, 'column', links)] : [arrangeChain(sizes, maxChainW)];
    const placed = placeComicGroup({ stageW, stageH, safe, head, kind, chains, avoid, offSide, gap: COMIC_GAP_LEVELS[comic.gap] });
    // 没有立绘的心里话（多半是主角）：云朵不拖尾巴。
    const tail = !comic.tail || (kind === 'offscreen' && tone === 'thought') ? null : resolveTail({ kind, head, centers: placed.centers, sizes, stageW, offSide });

    const seed = hashSeed(`${pageKey}:${content.speaker || ''}`);
    const rand = makeRand(seed);
    const svg = svgEl(doc, 'svg', { class: 'igs-comic-svg', width: stageW, height: stageH, viewBox: `0 0 ${stageW} ${stageH}`, 'aria-hidden': 'true' });
    svg.style.setProperty('--igs-comic-line', `${line}px`);
    const reduced = prefersReducedMotion(doc.defaultView);
    let delay = 0;
    // 三层各画各的：先全部阴影、再全部墨线、最后全部纸色。后填的纸色盖掉泡与泡相叠处的墨线，整串只留外轮廓。
    const layers = (comic.palette === 'color' ? ['shade', 'ink', 'paper'] : ['ink', 'paper']).map((name) => {
        const layer = svgEl(doc, 'g', { class: `igs-comic-l-${name}` });
        svg.appendChild(layer);
        return { name, layer };
    });
    const bodies = shapes.map((s, i) => ({ cx: placed.centers[i][0], cy: placed.centers[i][1], a: s.a, b: s.b, n: s.n, tip: s.tip }));
    items.forEach((item, i) => {
        const [cx, cy] = placed.centers[i];
        const s = shapes[i];
        const body = bodies[i];
        const parts = [bodyPath(shape, body, rand)];
        if (links[i]) parts.push(linkPath(bodies[i - 1], body, font * 0.34));
        if (tail && tail.index === i) {
            if (tone === 'thought') parts.push(...thoughtTrail(body, tail.tip));
            else parts.push(tailPath(tone === 'shout' ? 'shout' : (tone === 'phone' ? 'phone' : 'speech'), body, tail.tip, rand));
        }
        for (const { name, layer } of layers) {
            const g = svgEl(doc, 'g', { class: 'igs-comic-b' });
            g.style.transformOrigin = `${Math.round(cx)}px ${Math.round(cy)}px`;
            g.style.setProperty('--igs-comic-delay', `${delay}ms`);
            for (const d of parts) g.appendChild(svgEl(doc, 'path', { class: `igs-comic-${name}`, d }));
            layer.appendChild(g);
        }
        const m = metrics[i];
        item.bubble.style.left = `${Math.round(cx - s.dx - m.w / 2)}px`;
        item.bubble.style.top = `${Math.round(cy - s.dy - m.h / 2)}px`;
        item.bubble.style.setProperty('--igs-comic-delay', `${delay}ms`);
        item.text.setAttribute('data-igs-tfx-armed', '1');
        item.text.style.setProperty('--igs-tfx-delay', `${delay + 140}ms`);
        if (!reduced) delay += Math.min(1100, Math.max(280, item.chars * 42));
    });
    group.insertBefore(svg, group.firstChild);
    // 画外音的名牌：没有立绘可指时，在第一个泡上方标出说话人。
    if (kind === 'offscreen' && content.speaker && tone !== 'thought') {
        const tag = doc.createElement('div');
        tag.className = 'igs-comic-name';
        tag.textContent = content.speaker;
        const [cx, cy] = placed.centers[0];
        tag.style.left = `${Math.round(cx)}px`;
        tag.style.top = `${Math.round(cy - shapes[0].b * reach - 4)}px`;
        group.appendChild(tag);
    }
    group.classList.remove('is-measuring');
    state.group = group;
    state.groupRect = { x: placed.x, y: placed.y, w: placed.w, h: placed.h };
    state.revealEnd = group.classList.contains('is-revealed') ? 0 : Date.now() + delay;
    return { active: true, tone };
}
