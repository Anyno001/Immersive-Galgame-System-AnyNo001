// 非人对手战斗的 DOM 演出：全部作用在舞台上对手立绘元素本身（位移 / 缩放 / 滤镜 / 复制），不画任何色块或剪影。
// 由 fx-battle.js 提供宿主（计时器、动画登记、挂载与回收）；本文件不持有自己的计时器与节点，翻页即由宿主统一回收。
// 减少动效：不位移、不闪光、不震屏，只切档位与淡出；低画质：不做残影、碎片与虚化。
import { creatureSfxKind, disperseKindOf, groupBodyCount } from './creature-battle-model.js';
import { measureStage, peekSpriteHead, spriteDrawRect } from './fx-anchor.js';
import { creatureFace } from './creature-layout.js';

const GHOST_CLASS = 'igs-creature-ghost';
// 碎散的六块：覆盖整张立绘的斜切多边形（裁剪的是立绘本身的复制）。
const SHARDS = Object.freeze([
    { clip: 'polygon(0 0,52% 0,44% 38%,0 30%)', dx: -16, dy: -6, rot: -14 },
    { clip: 'polygon(52% 0,100% 0,100% 34%,44% 38%)', dx: 18, dy: -9, rot: 12 },
    { clip: 'polygon(0 30%,44% 38%,56% 70%,0 66%)', dx: -20, dy: 4, rot: -9 },
    { clip: 'polygon(44% 38%,100% 34%,100% 72%,56% 70%)', dx: 22, dy: 6, rot: 10 },
    { clip: 'polygon(0 66%,56% 70%,48% 100%,0 100%)', dx: -12, dy: 14, rot: -7 },
    { clip: 'polygon(56% 70%,100% 72%,100% 100%,48% 100%)', dx: 14, dy: 16, rot: 8 },
]);

const cssUrl = (url) => `url("${String(url).replace(/"/g, '%22')}")`;
const isImg = (el) => String(el && el.tagName).toUpperCase() === 'IMG';
const imageOf = (el) => (isImg(el) ? el.getAttribute('src') || '' : (el.style && el.style.backgroundImage) || '');
const valueFor = (el, url) => (isImg(el) ? String(url) : cssUrl(url));

function setImage(el, value) {
    if (isImg(el)) el.setAttribute('src', value);
    else el.style.backgroundImage = value;
}

export function createCreatureState() {
    return { swaps: new Map(), groups: new Map(), hitTurn: new Map(), gone: new Set() };
}

// ---- 立绘档位 ----
function recOf(cs, el) {
    let rec = cs.swaps.get(el);
    if (!rec) {
        const cur = imageOf(el);
        rec = { orig: cur, base: cur, last: cur, token: 0 };
        cs.swaps.set(el, rec);
    }
    return rec;
}

// 临时切到某一档姿态图并在 ms 后回到基准图；sticky 为真时把基准改成这一档（二阶段、败北压近）。没有这一档的图返回 false。
function holdTier(host, el, summary, tier, ms, sticky = false) {
    const url = summary && summary.tiers && summary.tiers[tier];
    if (!url || !el) return false;
    const rec = recOf(host.cs, el);
    const value = valueFor(el, url);
    if (imageOf(el) === value && !sticky) return false;
    setImage(el, value);
    rec.last = imageOf(el);
    const token = ++rec.token;
    if (sticky) rec.base = rec.last;
    else host.track(() => { if (rec.token === token && imageOf(el) === rec.last) { setImage(el, rec.base); rec.last = imageOf(el); } }, ms);
    return true;
}

function backToBase(cs, el) {
    const rec = cs.swaps.get(el);
    if (!rec) return;
    rec.token += 1;
    if (imageOf(el) === rec.last) { setImage(el, rec.base); rec.last = imageOf(el); }
}

// 快进：回到各自的基准图（二阶段后的狂暴图保留）；翻页清理：回到最初的图。只改仍是本模块写入的图，读者已换图则不碰。
// 翻页清理（full）：阅读器已经按新一页的档位写好图的元素不再还原（以本场战斗当前档为准）；
// 只有元素上仍是本模块写入的图时才改回：expected(el) 给出新一页应显示的图（css 值，未知返回 null），未知时退回最初的图。
export function settleCreatureTiers(cs, { full = false, expected = null } = {}) {
    for (const [el, rec] of cs.swaps) {
        rec.token += 1;
        if (imageOf(el) !== rec.last) continue;
        let want = full ? rec.orig : rec.base;
        if (full && typeof expected === 'function') {
            const given = expected(el);
            if (given != null && given !== '') want = given;
        }
        if (want !== imageOf(el)) setImage(el, want);
        rec.last = imageOf(el);
    }
    if (full) { cs.swaps.clear(); cs.hitTurn.clear(); cs.gone.clear(); }
}

// ---- 元素定位 ----
const visibleLayer = (el) => Boolean(el && el.style && el.style.display !== 'none' && (isImg(el) || el.style.backgroundImage));

export function foeElementOf(host, name) {
    const who = String(name || '').trim();
    if (!who) return null;
    const { motion, root } = host;
    if (who === host.spriteName) {
        const sprite = motion.querySelector('#igs-sprite');
        if (visibleLayer(sprite)) return sprite;
    }
    const layer = motion.querySelector('#igs-cast');
    const cast = layer ? Array.from(layer.children || []).find((el) => el.getAttribute('data-igs-cast-char') === who && !el.hasAttribute('data-igs-cast-leaving') && !el.hasAttribute('data-igs-cast-ghost')) : null;
    if (cast) return cast;
    const giant = root.querySelector('#igs-giant[data-igs-giant-on]');
    if (giant && giant.getAttribute('data-igs-giant-name') === who) return giant.querySelector('.igs-giant-img');
    return null;
}

const isGiantEl = (el) => Boolean(el && el.classList && el.classList.contains('igs-giant-img'));

// 前景立绘（对手之外的主立绘与陪衬）：压暗、后撤用。
function foregroundEls(host, except = null) {
    const out = [];
    const sprite = host.motion.querySelector('#igs-sprite');
    if (visibleLayer(sprite) && sprite !== except) out.push(sprite);
    const layer = host.motion.querySelector('#igs-cast');
    if (layer) for (const el of Array.from(layer.children || [])) if (el !== except && visibleLayer(el) && !el.hasAttribute('data-igs-cast-ghost') && !el.hasAttribute('data-igs-cast-leaving')) out.push(el);
    return out;
}

// ---- 立绘复制（残影 / 碎片 / 烟 / 多身影）：复刻元素自身的背景图、尺寸、位置与翻转 ----
function makeGhost(host, el, extraClass = '') {
    const doc = host.doc;
    const node = doc.createElement('div');
    node.className = `${GHOST_CLASS}${extraClass ? ` ${extraClass}` : ''}`;
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('data-igs-cast-ghost', '1');
    const st = node.style;
    st.backgroundImage = imageOf(el);
    st.backgroundSize = el.style.backgroundSize || '';
    st.backgroundPosition = el.style.backgroundPosition || '';
    const originX = el.style.getPropertyValue('--igs-cast-origin-x');
    if (originX) st.transformOrigin = `${originX} 100%`;
    // 翻转（背对）、偏移与旋转都写在元素的行内样式里：整套复制，复制品与本体重合。
    for (const name of ['scale', 'translate', 'rotate', 'transform']) {
        const value = el.style.getPropertyValue(name);
        if (value) st.setProperty(name, value);
    }
    if (el.style.transformOrigin) st.transformOrigin = el.style.transformOrigin;
    return node;
}

function placeGhost(el, node, before = true) {
    const parent = el.parentNode;
    if (!parent) return false;
    parent.insertBefore(node, before ? el : el.nextSibling);
    return true;
}

// ---- 动画 ----
function fx(host, el, prop, frames, duration, extra = {}) {
    if (host.reduced || !el) return null;
    return host.anim(el, frames.map((value, i) => (typeof value === 'object' ? { [prop]: value.v, offset: value.o } : { [prop]: value, ...(extra.offsets ? { offset: extra.offsets[i] } : {}) })), {
        duration, easing: extra.easing || 'cubic-bezier(.2,.8,.3,1)', fill: extra.fill || 'none', composite: extra.composite || 'add', delay: extra.delay || 0,
    });
}
const kf = (v, o) => ({ v, o });
const ms = (host, value) => Math.round(value * (host.pace || 1));

// ---- 遭遇：威吓档、暗处推近显形 / 巨型升起 ----
function enterFoe(host, summary, life) {
    const el = foeElementOf(host, summary.name);
    if (!el) return false;
    holdTier(host, el, summary, 'menace', life);
    host.sfx(creatureSfxKind('roar', summary.size));
    if (host.reduced) return true;
    if (isGiantEl(el)) {
        const rise = ms(host, 1500);
        fx(host, el, 'transform', ['translateY(18%)', 'translateY(0)'], rise, { easing: 'cubic-bezier(.16,.8,.3,1)' });
        fx(host, el, 'filter', [kf('brightness(.35)', 0), kf('brightness(1)', 1)], rise, { easing: 'ease-out' });
        // 低频震动：4 Hz 上下小幅摇晃，持续到升起结束；其余前景压暗再回亮。
        if (host.motion && !host.low) {
            const wobble = [];
            const steps = 10;
            for (let i = 0; i <= steps; i += 1) wobble.push(kf(i === 0 || i === steps ? '0 0' : `${i % 2 ? 2 : -2}px ${i % 2 ? 3 : -2}px`, i / steps));
            fx(host, host.motion, 'translate', wobble, rise, { composite: 'replace', easing: 'linear' });
        } else host.shake('light');
        for (const other of foregroundEls(host, el)) fx(host, other, 'filter', [kf('brightness(1)', 0), kf('brightness(.72)', 0.35), kf('brightness(.72)', 0.75), kf('brightness(1)', 1)], ms(host, Math.max(life, 1600)), { easing: 'ease-in-out' });
        return true;
    }
    const dur = Math.round(life * 0.74);
    fx(host, el, 'opacity', [kf(0, 0), kf(1, 0.3), kf(1, 1)], dur, { composite: 'replace', easing: 'ease-out' });
    fx(host, el, 'filter', [kf('brightness(0)', 0), kf('brightness(.25)', 0.4), kf('brightness(1)', 1)], dur, { easing: 'ease-out' });
    fx(host, el, 'transform', [kf('translateY(2.5%) scale(.84)', 0), kf('translateY(0) scale(1.02)', 0.82), kf('none', 1)], dur, { easing: 'cubic-bezier(.2,.7,.3,1)' });
    return true;
}

// ---- 杂兵多身影 ----
// 战斗期间对手立绘旁复制 1–2 个错位、缩放、虚化的身影（身影数与已倒下的数量见 groupBodyCount / summary.down）。
// 间距按立绘实际绘制宽度收拢，并整体收进舞台可视区：贴右边就都排在左边，贴左边就都排在右边，居中则一左一右；
// 后排身影更小、更虚、位置更靠上（前后纵深），头部落在对话框之上。换图、换尺寸、倒下数量变化时按新的立绘重建。
const BODY_SLOTS = Object.freeze([
    { scale: 0.88, blur: 1.4, light: 0.86, lift: 0.05 },
    { scale: 0.8, blur: 2.4, light: 0.78, lift: 0.09 },
]);
const urlOfCss = (image) => {
    const text = String(image || '');
    const start = text.indexOf('url(');
    if (start < 0) return '';
    let inner = text.slice(start + 4, text.lastIndexOf(')'));
    if (inner.startsWith('"') || inner.startsWith("'")) inner = inner.slice(1, -1);
    return inner;
};

// 立绘绘制中心与主体宽度（舞台像素）；探测结果没缓存时返回 null。
function drawnBox(host, el) {
    const geo = measureStage(host.motion);
    if (!geo) return null;
    const probed = peekSpriteHead(urlOfCss(imageOf(el)), host.doc);
    if (!probed || !(probed.naturalW > 0)) return null;
    const size = parseFloat(String(el.style.backgroundSize || '').split(' ')[1]);
    const pos = String(el.style.backgroundPosition || '').split(' ').map(parseFloat);
    const rect = spriteDrawRect(geo.stageW, geo.stageH, { naturalW: probed.naturalW, naturalH: probed.naturalH, scale: Number.isFinite(size) ? size : 100, posX: Number.isFinite(pos[0]) ? pos[0] : 50, posY: Number.isFinite(pos[1]) ? pos[1] : 100 });
    if (!rect) return null;
    const face = creatureFace(probed, null);
    const originX = parseFloat(el.style.getPropertyValue('--igs-cast-origin-x'));
    const headW = !face.fallback && probed.head && probed.head.w > 0 ? probed.head.w : 0.3;
    return {
        cx: rect.left + rect.w / 2, w: rect.w * 0.55, stageW: geo.stageW, stageH: geo.stageH,
        hx: rect.left + face.cx * rect.w, hy: rect.top + face.cy * rect.h, r: headW / 2 * rect.w,
        ox: Number.isFinite(originX) ? originX / 100 * geo.stageW : geo.stageW / 2,
        dialogTop: Number(geo.dialogTop) > 0 ? geo.dialogTop : geo.stageH,
    };
}

// n 个身影的目标中心（舞台像素）：以原身可见部分的中心为准（立绘很大、一半在舞台外时取舞台内的那一侧），
// 先按立绘主体宽度排间距，再整体收进 [8%, 92%] 的舞台范围：贴右就都排在左边，贴左就都排在右边，居中则一左一右。
export function groupBodyTargets(box, n) {
    const lo = box.stageW * 0.08;
    const hi = box.stageW * 0.92;
    const c = Math.min(Math.max(box.cx, box.stageW * 0.2), box.stageW * 0.8);
    const step = Math.min(box.w, box.stageW * 0.34) * 0.62;
    const fits = (list) => list.every((x) => x >= lo && x <= hi);
    const left = [c - step, c - step * 2].slice(0, n);
    const right = [c + step, c + step * 2].slice(0, n);
    const both = n === 1 ? [c + step] : [c - step, c + step];
    const pick = (n === 1 ? [right, left] : [both, left, right]).find(fits);
    if (pick) return pick;
    // 放不下就压缩间距：向房间更大的一侧排。
    const dir = hi - c >= c - lo ? 1 : -1;
    const room = Math.max(0, dir > 0 ? hi - c : c - lo);
    return Array.from({ length: n }, (_, i) => c + dir * Math.min(step * (i + 1), room * (i + 1) / n));
}

// ---- 头部遮挡：每个身影的头部区域被前排（原身、更靠前的身影、对话框）盖住的比例 ----
const GROUP_COVER_LIMIT = 1 / 3;
function coverage(head, rects) {
    const l = head.x - head.r, r = head.x + head.r, t = head.y - head.r, b = head.y + head.r;
    let covered = 0;
    for (const q of rects) {
        const w = Math.min(r, q.r) - Math.max(l, q.l);
        const h = Math.min(b, q.b) - Math.max(t, q.t);
        if (w > 0 && h > 0) covered += w * h;
    }
    return Math.min(1, covered / ((r - l) * (b - t)));
}

// configs：从近到远的身影配置 [{ target, lift }]（target 为身影中心的舞台横坐标，lift 为上抬占舞台高度的比例）。返回最差的头部被遮挡比例。
export function groupBodyCover(box, configs) {
    const main = { l: box.cx - box.w / 2, r: box.cx + box.w / 2, t: box.hy - box.r, b: box.stageH };
    const rects = [main, { l: -1e9, r: 1e9, t: box.dialogTop, b: 1e9 }, ...(Array.isArray(box.others) ? box.others : [])];
    let worst = 0;
    configs.forEach((config, i) => {
        const slot = BODY_SLOTS[i];
        const head = { x: config.target + (box.hx - box.cx) * slot.scale, y: box.stageH + (box.hy - box.stageH) * slot.scale - config.lift * box.stageH, r: box.r * slot.scale };
        // 头部必须整个在舞台内，再看被前排、同屏人物与对话框遮挡的比例。
        worst = Math.max(worst, head.x - head.r < 0 || head.x + head.r > box.stageW ? 1 : coverage(head, rects));
        rects.push({ l: config.target - box.w * slot.scale / 2, r: config.target + box.w * slot.scale / 2, t: head.y - head.r, b: box.stageH });
    });
    return worst;
}

// 身影布局：横屏按间距排 2–3 个；窄舞台（竖屏）要求每个身影头部被遮挡不超过 1/3，排不下就降为 1 个后排身影，
// 并加大错位（更高、更靠边）。返回 [{ target, lift }]，长度可能小于 want。
export function planGroupBodies(box, want, narrow) {
    const lifts = narrow ? [0.1, 0.18] : [0.05, 0.09];
    const base = groupBodyTargets(box, want).map((target, i) => ({ target, lift: lifts[i] }));
    if (!narrow || !want || groupBodyCover(box, base) <= GROUP_COVER_LIMIT) return base;
    const lo = box.stageW * 0.08;
    const hi = box.stageW * 0.92;
    const c = Math.min(Math.max(box.cx, box.stageW * 0.2), box.stageW * 0.8);
    const xs = Array.from({ length: 13 }, (_, k) => lo + (hi - lo) * k / 12).sort((a, b) => Math.abs(b - c) - Math.abs(a - c));
    let best = null;
    for (const lift of [0.1, 0.14, 0.18, 0.22, 0.26, 0.3]) {
        for (const target of xs) {
            const config = [{ target, lift }];
            const cover = groupBodyCover(box, config);
            if (cover <= GROUP_COVER_LIMIT) return config;
            if (!best || cover < best.cover) best = { config, cover };
        }
    }
    return best.config;
}

// 本页应显示的对手基准图（css 值）：二阶段后的狂暴档、否则对手立绘本身；元素不是计划里的对手时返回 null。
export function expectedFoeImage(host, plan) {
    const foes = plan && plan.creature ? plan.creature.foes : [];
    if (!foes.length) return null;
    return (el) => {
        for (const foe of foes) {
            if (foeElementOf(host, foe.name) !== el) continue;
            const url = foe.frenzy && foe.tiers && foe.tiers.frenzy ? foe.tiers.frenzy : foe.image;
            return url ? valueFor(el, url) : null;
        }
        return null;
    };
}

export function syncGroupBodies(host, plan) {
    const cs = host.cs;
    const live = new Set();
    const foes = plan && plan.creature && (plan.plate || (plan.events && plan.events.length)) ? plan.creature.foes : [];
    for (const summary of foes) {
        if (summary.group !== true) continue;
        const el = foeElementOf(host, summary.name);
        if (!el || isGiantEl(el)) continue;
        live.add(summary.name);
        const down = Math.max(0, Number(summary.down) || 0);
        const total = groupBodyCount(summary);
        let rec = cs.groups.get(summary.name);
        // 测量缓存：签名由舞台尺寸与参与立绘（对手 + 前景）的图片、尺寸、位置组成，签名不变就不再测量；舞台尺寸变化（resize）时自然失效。
        const layerSig = (node) => [imageOf(node), node.style.backgroundSize, node.style.backgroundPosition, peekSpriteHead(urlOfCss(imageOf(node)), host.doc) ? 1 : 0].join('~');
        const sig = [host.motion.clientWidth, host.motion.clientHeight, total, down, layerSig(el), ...foregroundEls(host, el).map(layerSig)].join('|');
        if (rec && rec.el === el && rec.sig === sig && rec.nodes.every((n) => n.node.parentNode)) continue;
        const box = drawnBox(host, el);
        // 同屏的其他立绘（说话人、陪衬）同样会盖住后排身影：取它们的主体范围一并算遮挡。
        if (box) box.others = foregroundEls(host, el).map((other) => drawnBox(host, other)).filter(Boolean).map((o) => ({ l: o.cx - o.w / 2, r: o.cx + o.w / 2, t: o.hy - o.r, b: o.stageH }));
        // 本页倒下的身影已移除：同一页重排时保留；换页（倒下数量变了）按数据重新算。
        const dead = rec && rec.down === down ? rec.dead : 0;
        if (rec) for (const body of rec.nodes) body.node.remove();
        rec = { el, sig, dead, down, nodes: [] };
        const want = Math.max(0, Math.min(BODY_SLOTS.length, total - 1 - down - dead));
        const wide = host.motion.clientWidth || 400;
        const narrow = wide < (host.motion.clientHeight || 600);
        const layout = want ? (box ? planGroupBodies(box, want, narrow) : Array.from({ length: want }, (_, i) => ({ target: wide * (i ? 0.72 : 0.28), lift: i ? 0.09 : 0.05 }))) : [];
        // 缩放绕元素自己的变换原点：先算缩放后原身中心的落点，再平移到目标位置。
        const originX = parseFloat(el.style.getPropertyValue('--igs-cast-origin-x'));
        const ox = Number.isFinite(originX) ? originX / 100 * wide : wide / 2;
        const cx = box ? box.cx : wide / 2;
        const tall = box ? box.stageH : (host.motion.clientHeight || 600);
        // 远的在后：从最远的开始插入，最近的身影紧贴原身之后。
        for (let i = layout.length - 1; i >= 0; i -= 1) {
            const slot = BODY_SLOTS[i];
            const ghost = makeGhost(host, el, 'is-body');
            const dx = layout[i].target - (ox + (cx - ox) * slot.scale);
            ghost.style.setProperty('translate', Math.round(dx) + 'px ' + Math.round(-layout[i].lift * tall) + 'px');
            ghost.style.setProperty('scale', el.hasAttribute('data-igs-cast-flip') ? (-slot.scale) + ' ' + slot.scale : String(slot.scale));
            ghost.style.filter = host.low ? 'brightness(' + slot.light + ')' : 'blur(' + slot.blur + 'px) brightness(' + slot.light + ')';
            if (!placeGhost(el, ghost, true)) continue;
            rec.nodes.unshift({ node: ghost, slot });
        }
        cs.groups.set(summary.name, rec);
    }
    for (const [name, rec] of cs.groups) {
        if (live.has(name)) continue;
        for (const body of rec.nodes) body.node.remove();
        cs.groups.delete(name);
    }
}

export function clearGroupBodies(cs) {
    for (const rec of cs.groups.values()) for (const body of rec.nodes) body.node.remove();
    cs.groups.clear();
}

// 被命中 / 击倒的身影：轮流点名存活的身影；击倒先倒身后的，原身最后一个倒。
function bodyFor(host, summary, el, ko) {
    const rec = summary.group === true ? host.cs.groups.get(summary.name) : null;
    if (!rec || !rec.nodes.length || rec.el !== el) return { node: el, ghost: null, last: true };
    const alive = rec.nodes;
    if (ko) {
        const body = alive[alive.length - 1];
        return { node: body.node, ghost: body, rec, last: false };
    }
    const turn = host.cs.hitTurn.get(summary.name) || 0;
    host.cs.hitTurn.set(summary.name, turn + 1);
    const pool = [{ node: el, ghost: null }, ...alive.map((body) => ({ node: body.node, ghost: body }))];
    const pick = pool[turn % pool.length];
    return { node: pick.node, ghost: pick.ghost, rec, last: false };
}

// ---- 我方打怪 ----
const HIT_SPEC = Object.freeze({
    hit: { dur: 460, flash: 'brightness(2.4) saturate(.25)', lean: ['translate(2.2%,-.7%) rotate(2.4deg) scale(.985)', 'translate(.8%,0) rotate(.8deg)'] },
    crit: { dur: 700, flash: 'brightness(3.2) saturate(.1)', lean: ['translate(1.2%,-.3%) rotate(1.2deg)', 'translate(5.4%,-1.4%) rotate(4.2deg) scale(.97)'] },
});

function hurtFoe(host, summary, event, el) {
    const target = bodyFor(host, summary, el, false).node;
    const result = event.result;
    const tierMs = ms(host, 900);
    if (result === 'hit' || result === 'crit') {
        holdTier(host, el, summary, 'wounded', tierMs);
        host.sfx(creatureSfxKind('hurt', summary.size));
        if (host.reduced) return true;
        const spec = HIT_SPEC[result];
        const dur = ms(host, spec.dur);
        const giantK = isGiantEl(el) ? 0.5 : 1;
        if (result === 'crit') {
            // 顿帧：白闪与受力姿态在 12%–32% 之间停住，再大幅后仰、回落。
            fx(host, target, 'filter', [kf('brightness(1)', 0), kf(spec.flash, 0.12), kf(spec.flash, 0.32), kf('brightness(1)', 1)], dur, { easing: 'ease-out' });
            fx(host, target, 'transform', [kf('none', 0), kf(spec.lean[0], 0.12), kf(spec.lean[0], 0.32), kf(spec.lean[1], 0.52), kf('translate(-.8%,0)', 0.78), kf('none', 1)], dur, { easing: 'ease-out' });
        } else {
            fx(host, target, 'filter', [kf('brightness(1)', 0), kf(spec.flash, 0.16), kf('brightness(1)', 1)], dur, { easing: 'ease-out' });
            fx(host, target, 'transform', [kf('none', 0), kf(spec.lean[0], 0.24), kf(spec.lean[1], 0.55), kf('none', 1)], dur, { easing: 'ease-out' });
        }
        if (giantK < 1) host.shake(result === 'crit' ? 'heavy' : 'light');
        return true;
    }
    if (result === 'guard') {
        if (host.reduced) return true;
        fx(host, target, 'transform', [kf('none', 0), kf('translateY(1.6%) scale(1.045)', 0.3), kf('scale(.992)', 0.62), kf('none', 1)], ms(host, 400), { easing: 'ease-out' });
        return true;
    }
    if (result === 'miss') {
        if (host.reduced) return true;
        const pos = parseFloat(String(target.style.backgroundPosition || '').split(/\s+/)[0]);
        const dir = Number.isFinite(pos) && pos > 50 ? -1 : 1;
        const dur = ms(host, 520);
        // 横向闪身：本体滑开再回位，原位留一道立绘复制的残影，向反方向淡去。
        if (!host.low) {
            const ghost = makeGhost(host, target, 'is-after');
            ghost.style.opacity = '0.55';
            if (placeGhost(target, ghost, true)) {
                host.keep(ghost, dur + 60);
                fx(host, ghost, 'opacity', [kf(0.55, 0), kf(0, 1)], dur, { composite: 'replace', easing: 'ease-out' });
                fx(host, ghost, 'transform', [kf('none', 0), kf(`translateX(${-dir * 2}%)`, 1)], dur, { easing: 'ease-out' });
            }
        }
        fx(host, target, 'transform', [kf('none', 0), kf(`translateX(${dir * 10}%) rotate(${dir * 3}deg)`, 0.36), kf(`translateX(${dir * 10}%) rotate(${dir * 3}deg)`, 0.55), kf('none', 1)], dur, { easing: 'cubic-bezier(.2,.8,.3,1)' });
        return true;
    }
    return false;
}

// ---- 击倒：用「受创」图去色后按形态消散，随后离场 ----
function disperseBody(host, summary, el, body, delay = 0) {
    const kind = disperseKindOf(summary);
    const node = body.node;
    if (host.cs.gone.has(node)) return;
    host.cs.gone.add(node);
    const run = () => {
        host.sfx(creatureSfxKind('fade', summary.size));
        if (body.ghost) { /* 多身影：复制身影无档位图，沿用当前图 */ } else holdTier(host, el, summary, 'wounded', 0, true);
        const finish = () => {
            if (!body.ghost) return;
            body.node.remove();
            if (body.rec) { body.rec.nodes = body.rec.nodes.filter((item) => item !== body.ghost); body.rec.dead += 1; }
        };
        if (host.reduced) {
            fx(host, node, 'opacity', [kf(1, 0), kf(0, 1)], ms(host, 520), { composite: 'replace', fill: 'forwards', easing: 'ease-out' });
            host.track(finish, ms(host, 540));
            return;
        }
        const big = summary.size === 'large' || summary.size === 'giant';
        const dur = ms(host, kind === 'sink' ? 1350 : kind === 'smoke' ? 1250 : 1100);
        const gray = 'grayscale(1) brightness(.82)';
        if (kind === 'shatter' && !host.low) {
            const parent = node.parentNode;
            const shardLife = ms(host, 980);
            fx(host, node, 'opacity', [kf(1, 0), kf(0, 0.02), kf(0, 1)], dur, { composite: 'replace', fill: 'forwards', easing: 'linear' });
            for (const shard of SHARDS) {
                const piece = makeGhost(host, node, 'is-shard');
                piece.style.clipPath = shard.clip;
                piece.style.webkitClipPath = shard.clip;
                piece.style.filter = gray;
                if (!parent) break;
                parent.insertBefore(piece, node.nextSibling);
                host.keep(piece, shardLife + 80);
                fx(host, piece, 'transform', [kf('none', 0), kf(`translate(${shard.dx * 0.55}%,${shard.dy * 0.4 - 3}%) rotate(${shard.rot * 0.6}deg)`, 0.38), kf(`translate(${shard.dx}%,${shard.dy + 18}%) rotate(${shard.rot * 1.5}deg)`, 1)], shardLife, { easing: 'cubic-bezier(.25,.6,.4,1)', composite: 'replace' });
                fx(host, piece, 'opacity', [kf(1, 0), kf(1, 0.45), kf(0, 1)], shardLife, { composite: 'replace', easing: 'ease-in' });
            }
            host.track(finish, ms(host, 1000));
            return;
        }
        if (kind === 'sink') {
            fx(host, node, 'filter', [kf('grayscale(0) brightness(1)', 0), kf(gray, 0.2), kf('grayscale(1) brightness(.5)', 1)], dur, { fill: 'forwards', easing: 'ease-in' });
            fx(host, node, 'transform', [kf('none', 0), kf('translateY(2%)', 0.2), kf(`translateY(${big ? 30 : 24}%)`, 1)], dur, { fill: 'forwards', easing: 'cubic-bezier(.5,0,.8,.6)' });
            fx(host, node, 'opacity', [kf(1, 0), kf(1, 0.62), kf(0, 1)], dur, { composite: 'replace', fill: 'forwards', easing: 'ease-in' });
            host.shake('light');
            host.track(finish, dur);
            return;
        }
        // 化烟：去色、虚化、上浮淡出；另放两道立绘复制的虚影，错开时间上浮。
        fx(host, node, 'filter', [kf('grayscale(0) brightness(1) blur(0px)', 0), kf(`${gray} blur(1px)`, 0.2), kf(`${gray} blur(${host.low ? 0 : 12}px)`, 1)], dur, { fill: 'forwards', easing: 'ease-in' });
        fx(host, node, 'transform', [kf('none', 0), kf('translateY(-7%) scale(1.08)', 1)], dur, { fill: 'forwards', easing: 'ease-out' });
        fx(host, node, 'opacity', [kf(1, 0), kf(0.85, 0.4), kf(0, 1)], dur, { composite: 'replace', fill: 'forwards', easing: 'ease-in' });
        if (!host.low) {
            for (let i = 0; i < 2; i += 1) {
                const puff = makeGhost(host, node, 'is-puff');
                puff.style.filter = `${gray} blur(${7 + i * 3}px)`;
                puff.style.opacity = '0';
                if (!node.parentNode) break;
                node.parentNode.insertBefore(puff, node.nextSibling);
                host.keep(puff, dur + 400);
                fx(host, puff, 'transform', [kf('translateY(0) scale(1)', 0), kf(`translateY(${-9 - i * 5}%) scale(${1.14 + i * 0.1})`, 1)], dur, { composite: 'replace', delay: 120 + i * 220, easing: 'ease-out' });
                fx(host, puff, 'opacity', [kf(0, 0), kf(0.5, 0.25), kf(0, 1)], dur, { composite: 'replace', delay: 120 + i * 220, easing: 'ease-out' });
            }
        }
        host.track(finish, dur);
    };
    if (delay > 0) host.track(run, delay);
    else run();
}

function koFoe(host, summary, event, el) {
    if (host.cs.gone.has(el) && !(summary.group === true && host.cs.groups.has(summary.name))) return true;
    const body = bodyFor(host, summary, el, true);
    // 多身影：最后一个（原身）倒下前身影已逐个消散；原身直接用立绘元素本身。
    if (summary.group === true && body.ghost) disperseBody(host, summary, el, body);
    else disperseBody(host, summary, el, { node: el, ghost: null });
    return true;
}

// ---- 怪打我方 / 怪治疗 ----
function lungeFoe(host, summary, event, el) {
    const target = bodyFor(host, summary, el, false).node;
    holdTier(host, el, summary, 'menace', ms(host, 1000));
    host.sfx(creatureSfxKind('roar', summary.size));
    if (host.reduced) return true;
    const giant = isGiantEl(el);
    const dur = ms(host, 780);
    const big = giant ? 1.12 : summary.size === 'small' ? 1.34 : 1.26;
    fx(host, target, 'transform', [kf('none', 0), kf('translateY(1.2%) scale(.97)', 0.22), kf(`translateY(${giant ? 3 : 6}%) scale(${big})`, 0.5), kf(`translateY(${giant ? 1.6 : 3}%) scale(${1 + (big - 1) * 0.55})`, 0.72), kf('none', 1)], dur, { easing: 'cubic-bezier(.3,.7,.3,1)' });
    fx(host, target, 'filter', [kf('brightness(1)', 0), kf('brightness(.85)', 0.22), kf('brightness(1.25) contrast(1.1)', 0.5), kf('brightness(1)', 1)], dur, { easing: 'ease-out' });
    host.track(() => host.shake('heavy'), Math.round(dur * 0.5));
    return true;
}

function healFoe(host, summary, event, el) {
    backToBase(host.cs, el);
    if (host.reduced) return true;
    const glow = 'drop-shadow(0 0 0px rgba(150,255,190,0))';
    fx(host, el, 'filter', [kf(`brightness(1.75) saturate(1.3) ${glow}`, 0), kf('brightness(1.35) saturate(1.2) drop-shadow(0 0 22px rgba(150,255,190,.95))', 0.4), kf(`brightness(1) saturate(1) ${glow}`, 1)], ms(host, 1100), { easing: 'ease-out' });
    return true;
}

// ---- 二阶段：膨胀、发光、震屏，之后用狂暴档 ----
function phaseFoe(host, summary, life) {
    const el = foeElementOf(host, summary.name);
    if (!el) return false;
    host.sfx(creatureSfxKind('roar', summary.size));
    const dur = Math.round(life * 0.88);
    host.track(() => holdTier(host, el, summary, 'frenzy', 0, true), Math.round(dur * 0.38));
    if (host.reduced) return true;
    fx(host, el, 'transform', [kf('none', 0), kf('scale(.94) translateY(1%)', 0.18), kf('scale(1.22) translateY(1%)', 0.4), kf('scale(1.09)', 0.72), kf('none', 1)], dur, { easing: 'cubic-bezier(.3,.7,.3,1)' });
    fx(host, el, 'filter', [kf('brightness(1)', 0), kf('brightness(.6)', 0.18), kf('brightness(2.6) drop-shadow(0 0 28px rgba(255,70,40,.95))', 0.4), kf('brightness(1.35) drop-shadow(0 0 16px rgba(255,90,40,.7))', 0.75), kf('brightness(1)', 1)], dur, { easing: 'ease-out' });
    host.track(() => host.shake('heavy'), Math.round(dur * 0.4));
    host.track(() => host.shake('light'), Math.round(dur * 0.7));
    if (!host.low && !isGiantEl(el)) {
        const aura = makeGhost(host, el, 'is-aura');
        aura.style.filter = 'brightness(1.6) drop-shadow(0 0 20px rgba(255,80,40,.9))';
        aura.style.opacity = '0';
        if (el.parentNode) {
            el.parentNode.insertBefore(aura, el);
            host.keep(aura, dur + 100);
            fx(host, aura, 'transform', [kf('scale(1)', 0), kf('scale(1.34)', 1)], dur, { composite: 'replace', delay: Math.round(dur * 0.36), easing: 'ease-out' });
            fx(host, aura, 'opacity', [kf(0, 0), kf(0.55, 0.2), kf(0, 1)], dur, { composite: 'replace', delay: Math.round(dur * 0.36), easing: 'ease-out' });
        }
    }
    return true;
}

// ---- 战斗结束 ----
function resultFoes(host, event, life) {
    const list = event.creatures || [];
    if (!list.length) return;
    const els = list.map((summary) => ({ summary, el: foeElementOf(host, summary.name) })).filter((item) => item.el);
    if (event.result === 'win') {
        // 胜利：还没倒下的非人对手逐个消散离场（已被 hit 击倒的跳过）。
        els.forEach(({ summary, el }, index) => {
            if (host.cs.gone.has(el)) return;
            const group = summary.group === true && host.cs.groups.get(summary.name);
            if (group && group.nodes.length) {
                [...group.nodes].reverse().forEach((ghost, i) => disperseBody(host, summary, el, { node: ghost.node, ghost, rec: group }, (index + i) * 260));
                disperseBody(host, summary, el, { node: el, ghost: null }, (index + group.nodes.length) * 260);
            } else disperseBody(host, summary, el, { node: el, ghost: null }, index * 260);
        });
        return;
    }
    if (event.result === 'lose') {
        // 败北：怪保持威吓，立绘缓缓压近镜头并停在那里。
        els.forEach(({ summary, el }) => {
            holdTier(host, el, summary, 'menace', 0, true);
            host.sfx(creatureSfxKind('roar', summary.size));
            if (host.reduced) return;
            fx(host, el, 'transform', [kf('none', 0), kf(`scale(${isGiantEl(el) ? 1.06 : 1.12}) translateY(2%)`, 1)], ms(host, 1100), { fill: 'forwards', easing: 'cubic-bezier(.2,.7,.3,1)' });
        });
        return;
    }
    if (event.result === 'escape' && !host.reduced && els.length) {
        // 撤退：怪留在场上，镜头后撤，前景立绘整体缩小一档。
        const keep = new Set(els.map((item) => item.el));
        for (const target of [...foregroundEls(host), ...keep]) {
            if (isGiantEl(target)) continue;
            fx(host, target, 'transform', [kf('none', 0), kf('scale(.9)', 1)], ms(host, 1500), { fill: 'forwards', easing: 'ease-in-out' });
        }
    }
}

// ---- 入口：每个事件调用一次。返回 true 表示已处理命中目标的立绘反应（宿主不再叠加人类版的立绘反应与临时登场）。 ----
export function playCreatureEvent(host, event, life) {
    const list = Array.isArray(event.creatures) ? event.creatures : [];
    if (!list.length) return false;
    if (event.type === 'encounter') {
        list.forEach((summary, index) => { if (index < 3) enterFoe(host, summary, life); });
        return false;
    }
    if (event.type === 'phase') {
        list.forEach((summary) => phaseFoe(host, summary, life));
        return false;
    }
    if (event.type === 'result') {
        resultFoes(host, event, life);
        return false;
    }
    if (event.type !== 'hit') return false;
    let handled = false;
    for (const summary of list) {
        const el = foeElementOf(host, summary.name);
        if (!el) continue;
        if (summary.role === 'target') {
            if (event.result === 'ko') { host.sfx(creatureSfxKind('hurt', summary.size)); handled = koFoe(host, summary, event, el) || handled; }
            else handled = hurtFoe(host, summary, event, el) || handled;
        } else if (summary.role === 'attacker') handled = lungeFoe(host, summary, event, el) || handled;
        else if (summary.role === 'heal') handled = healFoe(host, summary, event, el) || handled;
    }
    return handled;
}

// ---- 收服 / 封印（神话包 subdue）：作用在立绘本身，缩小并被吸入法器位置 ----
// el：对手立绘元素；vessel：法器位置（舞台宽高百分比）；origin：立绘元素的变换原点（舞台百分比，默认横向取头部位置、纵向取底边）。
// 缩小、位移、旋转在 15%–55% 的时间里连续完成，随后保持消失（fill: forwards），不再现身；返回动画数组，调用方在翻页时取消。
export function absorbCreatureSprite(el, vessel, { life = 3000, origin = null, reduced = false } = {}) {
    if (!el || typeof el.animate !== 'function') return [];
    const ox = origin && Number.isFinite(origin.x) ? origin.x : 50;
    const oy = origin && Number.isFinite(origin.y) ? origin.y : 100;
    const dx = Math.round((vessel.x - ox) * 10) / 10;
    const dy = Math.round((vessel.y - oy) * 10) / 10;
    const part = (k) => Math.round(k * 10) / 10;
    try {
        if (reduced) return [el.animate([{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 0, offset: 1 }], { duration: life, composite: 'replace', fill: 'forwards' })];
        return [
            el.animate([
                { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
                { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0.15 },
                { transform: `translate(${part(dx * 0.35)}%,${part(dy * 0.3)}%) scale(.62) rotate(14deg)`, offset: 0.35 },
                { transform: `translate(${dx}%,${dy}%) scale(.04) rotate(40deg)`, offset: 0.55 },
                { transform: `translate(${dx}%,${dy}%) scale(.04) rotate(40deg)`, offset: 1 },
            ], { duration: life, easing: 'ease-in-out', composite: 'add', fill: 'forwards' }),
            el.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.58 }, { opacity: 0, offset: 1 }], { duration: life, easing: 'linear', composite: 'replace', fill: 'forwards' }),
        ];
    } catch { return []; }
}

export const CREATURE_BATTLE_STYLE_TEXT = `
.igs-creature-ghost{position:absolute;inset:0;background-repeat:no-repeat;pointer-events:none;transform-origin:50% 100%;}
.igs-creature-ghost.is-body{will-change:filter;}
.igs-creature-tame-note{position:absolute;left:50%;bottom:calc(var(--igs-dialog-top-gap,30%) + 6px);transform:translateX(-50%);max-width:80%;padding:5px 18px 6px;background:linear-gradient(90deg,transparent,rgba(10,10,16,.7) 18%,rgba(10,10,16,.7) 82%,transparent);color:#f4f1ea;font-size:12px;letter-spacing:.14em;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.8);animation:igs-creature-note 3s ease-out both;pointer-events:none;}
@keyframes igs-creature-note{0%,30%{opacity:0}42%,86%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion: reduce){.igs-creature-ghost:not(.is-body){display:none!important;}}
#igs-overlay[data-igs-quality="low"] .igs-creature-ghost.is-puff,#igs-overlay[data-igs-quality="low"] .igs-creature-ghost.is-aura{display:none;}
`.trim();
