// 立绘变形层构建器：镜中倒影、车窗 / 水面、剪影、监控 / 全息 / 回忆框、异化、局部特写、局部贴片，
// 以及元神出窍。立绘一律经 stage-snapshot 读当前 DOM（跟随服装与表情），不读像素，不用蒙版图。
// 同页最多 1 个变形层：已有变形节点在场时放弃播放。
import { esc } from './reader-value-utils.js';
import { make } from './fx-daily-kit.js';
import { FALLBACK_HEAD, headToMarker, measureStage, peekSpriteHead, spriteDrawRect } from './fx-anchor.js';
import { cloneSpriteLayer, playWarp, readStageBackground, resolveHeadAnchor, resolveRegionCrop, spriteElOf } from './stage-snapshot.js';
import { playSpriteSpec } from './sprite-actions.js';
import { fitCrop, markPlacement } from './fx-transform-model.js';
import { MARK_SYMBOL_SVG } from './fx-symbols.js';

export const TRANSFORM_LIFE_MS = Object.freeze({
    mirror: 3600, reflect: 3400, silhouette: 3200, frame: 3600, warp: 1600, zoom: 2800, mark: 3600, spirit: 3400,
});

const SINK_SPEC = Object.freeze({ duration: 1800, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,1.6%)', 'translate(0,1.6%)', 'translate(0,0)'] });
const GRADE = 'var(--igs-grade-sprite,)';
const FRAME_BLOCKED = new Set(['fantasy', 'magic']);

const round = (n) => Math.round(n * 100) / 100;
const life = (kind, env) => Math.round(TRANSFORM_LIFE_MS[kind] * Math.max(1, env.hold || 1));

function busy(env) {
    const layers = env.layers || {};
    return [layers.front, layers.stage].some((layer) => layer && typeof layer.querySelector === 'function' && layer.querySelector('.igs-xf'));
}

function urlOfBackground(image) {
    const m = String(image || '').match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2].replace(/\\(["\\])/g, '$1') : '';
}

function targetOf(env, who) {
    const name = String(who || '').trim();
    if (!name || name === env.speaker) return env.sprite || null;
    return (env.cast || []).find((m) => m && m.character === name) || null;
}

// 指名角色当前可见立绘的读数：元素、头位（优先用户标定）、原图高宽比、是否被站位翻转。没有可见立绘返回 null。
function spriteView(env, who) {
    const el = spriteElOf(env, who);
    if (!el || !el.style || el.style.display === 'none' || !el.style.backgroundImage) return null;
    const url = urlOfBackground(el.style.backgroundImage);
    const probed = peekSpriteHead(url, el.ownerDocument);
    const target = targetOf(env, who);
    const head = (target && target.head && Number(target.head.w) > 0 ? target.head : null) || (probed && probed.head) || FALLBACK_HEAD;
    const aspect = probed && probed.naturalW > 0 ? probed.naturalH / probed.naturalW : 1.6;
    const flip = typeof el.hasAttribute === 'function' && (el.hasAttribute('data-igs-cast-flip') || el.hasAttribute('data-igs-sprite-flip'));
    const posX = parseFloat(String(el.style.backgroundPosition || '').split(/\s+/)[0]);
    return { el, url, head, aspect, flip, posX: Number.isFinite(posX) ? posX : 50, sprite: { url, head, aspect } };
}

// 头部中心在舞台上的位置：优先按已知立绘矩形与标定头位换算，否则退回 stage-snapshot 的估计。
function anchorOf(env, who, view) {
    const target = targetOf(env, who);
    const motion = env.root.querySelector('#igs-stage-motion');
    const geo = motion ? measureStage(motion) : null;
    const probed = view && view.url ? peekSpriteHead(view.url, env.root.ownerDocument) : null;
    if (target && geo && probed && probed.naturalW > 0) {
        const rect = spriteDrawRect(geo.stageW, geo.stageH, { naturalW: probed.naturalW, naturalH: probed.naturalH, scale: target.scale, posX: target.posX, posY: target.posY });
        if (rect) {
            const head = view.head;
            const marker = headToMarker(view.flip ? { ...head, x: 1 - Number(head.x) } : head, rect);
            return { x: round(marker.cx / geo.stageW * 100), y: round(marker.cy / geo.stageH * 100), d: round(marker.d / geo.stageW * 100) };
        }
    }
    return resolveHeadAnchor(env, who);
}

const stageAspect = (env) => readStageBackground(env.root).aspect || 16 / 9;
const cardWidth = (base, aspect) => (aspect < 1 ? Math.min(46, Math.round(base * 1.6)) : base);

function cloneOf(env, who, options) {
    return cloneSpriteLayer(env.root, who, { speaker: env.speaker, ...options });
}

function dim(node, opacity) {
    node.setAttribute('style', `${node.getAttribute('style')};opacity:${opacity}`);
}

function bgLayer(env, cardX, cardY, cardW, cardRatio, { filter = '', flipY = false } = {}) {
    const snap = readStageBackground(env.root);
    const node = env.doc.createElement('div');
    node.className = 'igs-xf-bg';
    node.setAttribute('aria-hidden', 'true');
    if (snap.bg && snap.bg.image) {
        const cx = round(cardX + cardW / 2);
        const cy = round(cardY + cardW * cardRatio / 2);
        const parts = [`background-image:${snap.bg.image}`, 'background-size:cover', `background-position:${cx}% ${cy}%`];
        if (filter) parts.push(`filter:${filter}`);
        if (flipY) parts.push('transform:scaleY(-1)');
        node.setAttribute('style', parts.join(';'));
    } else {
        node.setAttribute('style', 'background:#1c1c22');
    }
    return node;
}

function wrap(env, className, child) {
    const node = make(env.doc, className);
    if (child) node.appendChild(child);
    return node;
}

function shell(env, kind, cls, html = '') {
    const node = make(env.doc, `igs-dfx igs-xf igs-xf-${kind}${cls ? ` ${cls}` : ''}${env.reduced ? ' is-reduced' : ''}`, html);
    return node;
}

// 卡片的定位：落在立绘对侧；返回 --xf-* 变量串。
function cardVars(view, aspect, { w, ratio, y = 9 }) {
    const width = cardWidth(w, aspect);
    const x = view && view.posX >= 50 ? 8 : 100 - 8 - width;
    return `--xf-x:${x}%;--xf-y:${y}%;--xf-w:${width}%;--xf-ar:1/${ratio}`;
}

function card(env, node, vars, innerHtml, pad = [5, 8]) {
    const frame = make(env.doc, `igs-xf-card${vars.className ? ` ${vars.className}` : ''}`);
    frame.setAttribute('style', vars.style);
    const view = make(env.doc, 'igs-xf-view');
    view.setAttribute('style', `inset:${pad[0]}% ${pad[1]}%`);
    if (innerHtml) view.innerHTML = innerHtml;
    frame.appendChild(view);
    node.appendChild(frame);
    return { frame, view };
}

// ---- 镜子 ----

function buildMirror(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const aspect = stageAspect(env);
    const bronze = env.ancient === true;
    const ratio = bronze ? 1 : 2.1;
    const pad = bronze ? [7, 7] : [5, 8];
    const boxRatio = ratio * (100 - pad[0] * 2) / (100 - pad[1] * 2);
    const crop = bronze ? resolveRegionCrop(view.sprite, 'face', boxRatio, env.root.ownerDocument) : fitCrop(view.aspect, boxRatio);
    const mirrored = !view.flip;
    const clone = cloneOf(env, item.who, {
        crop, flip: mirrored,
        filter: `${GRADE} brightness(.97) saturate(.92)`,
    });
    if (!clone) return null;
    const node = shell(env, 'mirror', '');
    const bw = cardWidth(bronze ? 26 : 24, aspect);
    const bx = view.posX >= 50 ? 8 : 100 - 8 - bw;
    const vars = { className: bronze ? 'is-round' : '', style: cardVars(view, aspect, { w: bronze ? 22 : 17, ratio, y: bronze ? 12 : 8 }) };
    const { view: glass, frame } = card(env, node, vars, '', pad);
    glass.insertBefore(bgLayer(env, bx, bronze ? 12 : 8, bw, ratio), glass.firstChild);
    glass.appendChild(clone);
    glass.appendChild(make(env.doc, 'igs-xf-sheen'));
    return { layer: 'front', life: life('mirror', env), sounds: ['xfglass'], node };
}

// ---- 倒影 ----

function buildReflect(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const aspect = stageAspect(env);
    const water = item.kind === 'water';
    const ratio = water ? 0.66 : 0.72;
    const pad = water ? [8, 8] : [6, 5];
    const boxRatio = ratio * (100 - pad[0] * 2) / (100 - pad[1] * 2);
    const crop = resolveRegionCrop(view.sprite, water ? 'waist' : 'face', boxRatio, env.root.ownerDocument);
    const clone = cloneOf(env, item.who, { crop, flip: !view.flip, filter: water ? `${GRADE} blur(1.2px) saturate(.85)` : `${GRADE} blur(.5px) saturate(.8) brightness(.9)` });
    if (!clone) return null;
    dim(clone, water ? 0.72 : 0.5);
    const node = shell(env, 'reflect', water ? 'is-water' : 'is-window');
    const rw = cardWidth(water ? 36 : 34, aspect);
    const rx = view.posX >= 50 ? 8 : 100 - 8 - rw;
    const ry = water ? 14 : 10;
    const vars = { className: '', style: cardVars(view, aspect, { w: water ? 36 : 34, ratio, y: ry }) };
    const { view: pane } = card(env, node, vars, '', pad);
    pane.insertBefore(bgLayer(env, rx, ry, rw, ratio, water ? { flipY: true, filter: 'saturate(.7) brightness(.85)' } : { filter: 'saturate(.6) brightness(.7)' }), pane.firstChild);
    if (water) {
        const flipped = wrap(env, 'igs-xf-flipwrap', clone);
        pane.appendChild(flipped);
        pane.appendChild(make(env.doc, 'igs-xf-deep'));
        pane.appendChild(make(env.doc, 'igs-xf-ripple'));
        pane.appendChild(make(env.doc, 'igs-xf-ripple is-b'));
    } else {
        pane.appendChild(clone);
        for (const top of [22, 48, 71]) {
            const streak = make(env.doc, 'igs-xf-streak');
            streak.setAttribute('style', `top:${top}%;animation-delay:${top * 12}ms`);
            pane.appendChild(streak);
        }
    }
    return { layer: 'front', life: life('reflect', env), sounds: [water ? 'xfdrop' : 'xfglass'], node };
}

// ---- 剪影 ----

function buildSilhouette(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const aspect = stageAspect(env);
    if (item.mode === 'back') {
        const clone = cloneOf(env, item.who, { filter: 'brightness(0) drop-shadow(0 0 1.1vmin #ffe2a8)' });
        if (!clone) return null;
        const node = shell(env, 'silhouette', 'is-back');
        const glow = make(env.doc, 'igs-xf-glow');
        glow.setAttribute('style', `--xf-gx:${Math.round(view.posX)}%`);
        node.appendChild(glow);
        node.appendChild(clone);
        return { layer: 'stage', life: life('silhouette', env), sounds: ['xffrost'], node };
    }
    const ratio = 1.9;
    const pad = [4, 10];
    const boxRatio = ratio * (100 - pad[0] * 2) / (100 - pad[1] * 2);
    const clone = cloneOf(env, item.who, { crop: fitCrop(view.aspect, boxRatio), filter: 'brightness(0) blur(4px)' });
    if (!clone) return null;
    dim(clone, 0.78);
    const node = shell(env, 'silhouette', 'is-glass');
    const sw = cardWidth(22, aspect);
    const sx = view.posX >= 50 ? 8 : 100 - 8 - sw;
    const { view: pane } = card(env, node, { className: '', style: cardVars(view, aspect, { w: 22, ratio, y: 8 }) }, '', pad);
    pane.insertBefore(bgLayer(env, sx, 8, sw, ratio, { filter: 'blur(5px) brightness(.88) saturate(.75)' }), pane.firstChild);
    pane.appendChild(clone);
    pane.appendChild(make(env.doc, 'igs-xf-fog'));
    pane.appendChild(make(env.doc, 'igs-xf-drops'));
    return { layer: 'front', life: life('silhouette', env), sounds: ['xffrost'], node };
}

// ---- 监控 / 全息 / 回忆框 ----

export function frameStyleFor(style, env) {
    if (env.ancient === true || FRAME_BLOCKED.has(env.worldview)) return 'memory';
    return ['monitor', 'holo', 'memory'].includes(style) ? style : 'monitor';
}

function buildFrame(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const aspect = stageAspect(env);
    const style = frameStyleFor(item.style, env);
    const spec = {
        monitor: { w: 32, ratio: 0.66, pad: [4, 3], region: 'waist', filter: 'grayscale(.85) contrast(1.12) brightness(.92)', sound: 'xfscreen' },
        holo: { w: 24, ratio: 1.5, pad: [5, 7], region: 'full', filter: 'grayscale(1) sepia(1) hue-rotate(150deg) saturate(3.2) brightness(1.1)', sound: 'xfscreen' },
        memory: { w: 28, ratio: 0.9, pad: [7, 7], region: 'face', filter: 'sepia(.55) saturate(.8) brightness(1.05) blur(.4px)', sound: 'xfmemory' },
    }[style];
    const boxRatio = spec.ratio * (100 - spec.pad[0] * 2) / (100 - spec.pad[1] * 2);
    const crop = spec.region === 'full' ? fitCrop(view.aspect, boxRatio) : resolveRegionCrop(view.sprite, spec.region, boxRatio, env.root.ownerDocument);
    const clone = cloneOf(env, item.who, { crop, filter: spec.filter });
    if (!clone) return null;
    if (style === 'holo') dim(clone, 0.88);
    const node = shell(env, 'frame', `is-${style}`);
    const { frame, view: screen } = card(env, node, { className: '', style: cardVars(view, aspect, { w: spec.w, ratio: spec.ratio, y: style === 'holo' ? 10 : 12 }) }, '', spec.pad);
    screen.appendChild(clone);
    if (style === 'monitor') {
        screen.appendChild(make(env.doc, 'igs-xf-scan'));
        screen.appendChild(make(env.doc, 'igs-xf-rec', '<i></i>REC'));
        screen.appendChild(make(env.doc, 'igs-xf-cam', 'CAM 01'));
    } else if (style === 'holo') {
        screen.appendChild(make(env.doc, 'igs-xf-sweep'));
        for (const corner of ['tl', 'tr', 'bl', 'br']) frame.appendChild(make(env.doc, `igs-xf-corner is-${corner}`));
        frame.appendChild(make(env.doc, 'igs-xf-base'));
    }
    return { layer: 'front', life: life('frame', env), sounds: [spec.sound], node };
}

// ---- 异化：作用在真立绘元素上，叠一层错位残影 / 压黑眼 / 威压暗角 ----

const WARP_STILL = Object.freeze({ glitch: 'hue-rotate(70deg) saturate(1.6)', negative: 'invert(1) hue-rotate(180deg)', blackeye: 'brightness(.6) contrast(1.2)', shift: 'hue-rotate(40deg)', tremble: 'brightness(.85)' });

function buildWarp(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const style = Object.hasOwn(WARP_STILL, item.style) ? item.style : 'glitch';
    const node = shell(env, 'warp', `is-${style}${env.worldview === 'horror' ? ' is-horror' : ''}`);
    if (!env.reduced) playWarp(view.el, style, { reduced: false });
    if (style === 'glitch' || style === 'shift') {
        ['', ' is-b'].forEach((suffix, i) => {
            const clone = cloneOf(env, item.who, { filter: `${GRADE} ${i ? 'hue-rotate(-60deg)' : 'hue-rotate(70deg) saturate(2)'}` });
            if (clone) node.appendChild(wrap(env, `igs-xf-ghostwrap${suffix}`, clone));
        });
    } else if (style === 'negative') {
        if (env.reduced) {
            const clone = cloneOf(env, item.who, { filter: WARP_STILL.negative });
            if (clone) node.appendChild(clone);
        } else node.appendChild(make(env.doc, 'igs-xf-flash'));
    } else if (style === 'blackeye') {
        const anchor = anchorOf(env, item.who, view);
        const hh = anchor.d * 1.1 * stageAspect(env);
        for (const s of [-1, 1]) {
            const patch = make(env.doc, 'igs-xf-eyepatch');
            patch.setAttribute('style', `left:${round(anchor.x + s * anchor.d * 0.17)}%;top:${round(anchor.y - hh * 0.02)}%;width:${round(anchor.d * 0.2)}%`);
            node.appendChild(patch);
        }
    } else node.appendChild(make(env.doc, 'igs-xf-pressure'));
    return { layer: 'stage', life: life('warp', env), sounds: ['xfglitch'], node };
}

// ---- 局部特写框 ----

function buildZoom(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const aspect = stageAspect(env);
    const ratio = 0.8;
    const pad = [3, 3];
    const boxRatio = ratio * (100 - pad[0] * 2) / (100 - pad[1] * 2);
    const region = ['hand', 'lip', 'eye', 'neck', 'face', 'waist'].includes(item.region) ? item.region : 'face';
    const clone = cloneOf(env, item.who, { crop: resolveRegionCrop(view.sprite, region, boxRatio, env.root.ownerDocument), filter: GRADE });
    if (!clone) return null;
    const label = { hand: '手', lip: '唇', eye: '眼', neck: '颈', face: '脸', waist: '腰' }[region];
    const node = shell(env, 'zoom', '');
    const { frame, view: lens } = card(env, node, { className: '', style: cardVars(view, aspect, { w: 24, ratio, y: 14 }) }, '', pad);
    lens.appendChild(wrap(env, 'igs-xf-zoomwrap', clone));
    frame.appendChild(make(env.doc, 'igs-xf-ring'));
    frame.appendChild(make(env.doc, 'igs-xf-chip', esc(label)));
    return { layer: 'front', life: life('zoom', env), sounds: ['xfzoom'], node };
}

// ---- 局部贴片（Q1：按头部标定近似叠加，不处理衣领遮挡） ----

const MARK_ART = Object.freeze({
    blush: { w: 0.4, html: '' },
    kiss: { w: 0.3, html: MARK_SYMBOL_SVG.kiss },
    bite: { w: 0.34, html: MARK_SYMBOL_SVG.bite },
    sigil: { w: 0.5, html: '<svg viewBox="0 0 40 40" fill="none" stroke="#ffd36a" stroke-width="1.6" stroke-linejoin="round"><circle cx="20" cy="20" r="17"/><path d="M20 4L33 28H7Z"/><path d="M20 36L7 12H33Z"/><circle cx="20" cy="20" r="3"/></svg>' },
    bruise: { w: 0.4, html: '' },
});

function buildMark(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const art = Object.hasOwn(MARK_ART, item.style) ? MARK_ART[item.style] : MARK_ART.blush;
    const style = Object.hasOwn(MARK_ART, item.style) ? item.style : 'blush';
    const anchor = anchorOf(env, item.who, view);
    const spots = markPlacement(item.part, anchor, stageAspect(env));
    const node = shell(env, 'mark', `is-${style}`);
    spots.forEach((spot, i) => {
        const patch = make(env.doc, `igs-xf-patch is-${style}`, art.html);
        patch.setAttribute('style', `left:${spot.x}%;top:${round(spot.y)}%;width:${round(anchor.d * art.w)}%;animation-delay:${i * 140}ms`);
        node.appendChild(patch);
    });
    return { layer: 'stage', life: life('mark', env), sounds: ['xfmark'], node };
}

// ---- 元神出窍 ----

function buildSpirit(item, env) {
    if (busy(env)) return null;
    const view = spriteView(env, item.who);
    if (!view) return null;
    const node = shell(env, 'spirit', '');
    const glow = `${GRADE} brightness(1.25) saturate(.45) drop-shadow(0 0 1vmin #bfe6ff)`;
    const first = cloneOf(env, item.who, { filter: glow });
    if (!first) return null;
    node.appendChild(wrap(env, 'igs-xf-ghostrise', first));
    const second = env.reduced ? null : cloneOf(env, item.who, { filter: glow });
    if (second) node.appendChild(wrap(env, 'igs-xf-ghostrise is-b', second));
    const anchor = anchorOf(env, item.who, view);
    const ring = make(env.doc, 'igs-xf-spirit-ring');
    ring.setAttribute('style', `left:${anchor.x}%;top:${round(Math.min(94, anchor.y + anchor.d * 1.1 * stageAspect(env) * 3.6))}%`);
    node.appendChild(ring);
    if (!env.reduced) playSpriteSpec(view.el, SINK_SPEC);
    return { layer: 'stage', life: life('spirit', env), sounds: ['xfspirit'], node };
}

export const TRANSFORM_BUILDERS = Object.freeze({
    mirror: buildMirror,
    reflect: buildReflect,
    silhouette: buildSilhouette,
    frame: buildFrame,
    warp: buildWarp,
    zoom: buildZoom,
    mark: buildMark,
    spirit: buildSpirit,
});
