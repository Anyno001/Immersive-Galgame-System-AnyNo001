// 九套画布皮肤（漫画 / 黑幕 / 水墨 / 科技 / 神秘 / 柔和 a c / 暗黑 a b）的出牌演出：照搬设计稿 fx / fx2 / fx3 / fx4 的节点与几何，
// 命中光（光芒 + 光芯 + 光刃）、稀有度横幅、格挡护盾、击倒、敌方回合、爪痕、三种蓄力、治疗柔光、同伴出手。初始方案不创建这些节点。
// 节点挂在演出前层里的「演出画布」（.igs-hx-canvas，与战斗画布同尺寸、同缩放，设计稿坐标原样可用）；治疗光挂在主角单位内。
// 样式在 combat-hit-fx-skin-style.js（由设计稿 CSS 生成）与本文件末尾的补充样式；类名 hx- 前缀、变量 --hx- 前缀。
import { COMBAT_HIT_SKIN_STYLE_TEXT } from './combat-hit-fx-skin-style.js';

export const HX_SKINS = Object.freeze(['comic', 'veil', 'ink', 'tech', 'mystic', 'soft-a', 'soft-c', 'dark-a', 'dark-b']);
export const hxSkin = (skin) => HX_SKINS.includes(String(skin || ''));
// 设计稿时序：稀有度横幅先出 620ms，蓄力 520ms，直冲 300ms（格挡类自身牌 260ms）。
export const HX_BANNER_MS = 620;
export const HX_WINDUP_MS = 520;
export const HX_DASH_MS = 300;
export const HX_GENTLE_MS = 260;
const SIZE = Object.freeze({ port: 390, land: 1280 });
const RAR_LABEL = Object.freeze({ rare: 'RARE', epic: 'EPIC', mythic: 'MYTHIC', signature: 'SIGNATURE' });

// 演出画布：挂在演出前层，方向跟战斗画布（#igs-cx-canvas.land）。
export function hxCanvas(front, canvasEl) {
    const doc = front?.ownerDocument;
    if (!doc?.createElement) return null;
    let c = null;
    for (const n of front.children || []) if (n.classList?.contains('igs-hx-canvas')) c = n;
    if (!c) {
        c = doc.createElement('div');
        c.className = 'igs-hx-canvas';
        c.setAttribute('aria-hidden', 'true');
        front.appendChild(c);
    }
    c.classList.toggle('land', Boolean(canvasEl?.classList?.contains('land')));
    return c;
}

const canvasScale = (c) => {
    const w = c.getBoundingClientRect?.().width;
    return w ? w / (c.classList.contains('land') ? SIZE.land : SIZE.port) : 1;
};
// 视口矩形换成演出画布内的设计稿坐标。
export function hxRel(c, rect) {
    const o = c.getBoundingClientRect();
    const k = canvasScale(c);
    return { x: (rect.left - o.left) / k, y: (rect.top - o.top) / k, w: rect.width / k, h: rect.height / k };
}

function mount(c, cls, html, css, life, schedule, list) {
    const n = c.ownerDocument.createElement('div');
    n.className = cls;
    if (html) n.innerHTML = html;
    if (css) n.style.cssText = css;
    c.appendChild(n);
    (schedule || ((fn, ms) => setTimeout(fn, ms)))(() => n.remove?.(), life);
    list.push(n);
    return n;
}

// ---------- 光：锋利光芒（白在前、金在后）+ 白热光芯 ----------
const rnd = (seed) => { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
function spikes(cx, cy, n, len, base, jitter, seed) {
    const r = rnd(seed);
    let d = '';
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r() - 0.5) * jitter;
        const L = len * (0.55 + r() * 0.55);
        const w = base * (0.7 + r() * 0.6);
        const p = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`;
        d += `M${p(a - w, 40)}L${p(a, L)}L${p(a + w, 40)}Z`;
    }
    return d;
}
let lightSeq = 0;
function lightSvg(cx, cy, reach) {
    const id = `hx-core-${++lightSeq}`;
    return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#fff"/><stop offset=".28" stop-color="#fff6e6"/>`
        + '<stop offset=".55" stop-color="#ffc27a" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient></defs>'
        + `<path class="hx-rays hx-rays2" fill="#ffc27a" d="${spikes(cx, cy, 16, reach * 1.1, 0.05, 0.3, 7)}"/>`
        + `<path class="hx-rays" fill="#fff" d="${spikes(cx, cy, 14, reach * 0.85, 0.032, 0.35, 19)}"/>`
        + `<circle class="hx-core" cx="${cx}" cy="${cy}" r="${(reach * 0.42).toFixed(0)}" fill="url(#${id})"/>`;
}

// 命中光：受击立绘中心处光芒 + 光芯 + 两道斜光刃；rank 0–3 按稀有度放大，color 为招式元素色（光刃颜色）。
export function hxHit(c, artRect, { rank = 0, color = '', schedule } = {}) {
    const list = [];
    const a = hxRel(c, artRect);
    const css = `left:${(a.x + a.w / 2).toFixed(1)}px;top:${(a.y + a.h * 0.45).toFixed(1)}px${color ? `;--hx-el:${color}` : ''}`;
    mount(c, `hx-hitfx hx-r${rank}`, `<svg class="hx-fxlight" viewBox="0 0 220 220" style="--hx-ox:110px;--hx-oy:110px;--hx-dur:460ms">${lightSvg(110, 110, 100)}</svg>`
        + '<i class="hx-gleam"></i><i class="hx-gleam hx-g2"></i>', css, 1000, schedule, list);
    return list;
}

// 稀有度横幅（史诗以上）：斜切近黑带 + 档位色边 + 左侧图标 + 档位英文 + 破框牌名。icon 为牌面主图形的 svg 标记（自家生成）。
export function hxBanner(c, { rarity, color, name, icon = '', schedule } = {}) {
    const list = [];
    const bn = mount(c, `hx-rbanner hx-${rarity}`, '<div class="hx-band"><i class="hx-gleam"></i></div>', `--hx-rar:${color}`, 1000, schedule, list);
    if (icon) {
        const ic = c.ownerDocument.createElement('div');
        ic.className = 'hx-ic';
        ic.innerHTML = icon;
        bn.appendChild(ic);
    }
    const nm = c.ownerDocument.createElement('div');
    nm.className = 'hx-nm';
    const small = c.ownerDocument.createElement('small');
    small.textContent = RAR_LABEL[rarity] || '';
    nm.appendChild(small);
    nm.appendChild(c.ownerDocument.createTextNode(String(name || '')));
    bn.appendChild(nm);
    return list;
}

// 蓄力：法术（两圈光环向牌收拢）/ 射击（瞄准细线 + 目标准星）/ 横扫（横向光弧）。from 为牌（或出手单位）的视口矩形，targets 为受击立绘视口矩形。
export function hxWindup(c, kind, from, targets, { schedule } = {}) {
    const list = [];
    const f = hxRel(c, from);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    if (kind === 'cast') mount(c, 'hx-windfx hx-spell', '<i></i><i class="hx-w2"></i>', `left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px`, HX_WINDUP_MS, schedule, list);
    else if (kind === 'shot') {
        for (const t of targets.slice(0, 4)) {
            const r = hxRel(c, t);
            const tx = r.x + r.w / 2;
            const ty = r.y + r.h * 0.45;
            const len = Math.hypot(tx - cx, ty - cy);
            const ang = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
            mount(c, 'hx-windfx hx-shot', '', `left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;width:${len.toFixed(1)}px;transform:rotate(${ang.toFixed(1)}deg)`, HX_WINDUP_MS, schedule, list);
            mount(c, 'hx-reticle', '<i></i>', `left:${tx.toFixed(1)}px;top:${ty.toFixed(1)}px`, HX_WINDUP_MS, schedule, list);
        }
    } else if (kind === 'sweep') mount(c, 'hx-windfx hx-sweep', '', '', HX_WINDUP_MS, schedule, list);
    return list;
}

// 直线冲刺的速度光痕：牌中心到目标中心一道光（视口矩形）。
export function hxTrail(c, from, to, { schedule } = {}) {
    const list = [];
    const a = hxRel(c, from);
    const b = hxRel(c, to);
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const tx = b.x + b.w / 2;
    const ty = b.y + b.h / 2;
    const len = Math.hypot(tx - cx, ty - cy);
    const ang = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
    mount(c, 'hx-trail', '', `left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;width:${len.toFixed(1)}px;transform:rotate(${ang.toFixed(1)}deg)`, 520, schedule, list);
    return list;
}

// 格挡：头像外两圈护盾光闪开。
export function hxGuard(c, faceRect, { schedule } = {}) {
    const list = [];
    const f = hxRel(c, faceRect);
    mount(c, 'hx-shieldfx', '<i></i><i class="hx-s2"></i>', `left:${(f.x + f.w / 2).toFixed(1)}px;top:${(f.y + f.h / 2).toFixed(1)}px`, 900, schedule, list);
    return list;
}

// 击倒：破框「击倒」大字（光刃斜穿）。
export function hxKo(c, artRect, { schedule } = {}) {
    const list = [];
    const a = hxRel(c, artRect);
    const n = mount(c, 'hx-kofx', '', `left:${(a.x + a.w / 2).toFixed(1)}px;top:${(a.y + a.h * 0.35).toFixed(1)}px`, 1200, schedule, list);
    n.textContent = '击倒';
    return list;
}

// 主角头像受三道爪痕光 + 画面边缘泛红。
export function hxClaw(c, faceRect, { schedule } = {}) {
    const list = [];
    const f = hxRel(c, faceRect);
    mount(c, 'hx-clawfx', '<i></i><i></i><i></i>', `left:${(f.x + f.w / 2).toFixed(1)}px;top:${(f.y + f.h / 2).toFixed(1)}px`, 600, schedule, list);
    mount(c, 'hx-hurtveil', '', '', 520, schedule, list);
    return list;
}

// 敌方回合：一条斜带标题。
export function hxTurnBand(c, { schedule } = {}) {
    const list = [];
    const n = mount(c, 'hx-turnband', '<span></span>', '', 900, schedule, list);
    n.firstChild.textContent = '敌方回合';
    return list;
}

// 同伴出手：斜切带从左切入，带里是同伴的眼部特写 + 招式名。url 已过协议过滤，没有立绘时只留名字。
export function hxCallout(c, { who, move, url = '', schedule } = {}) {
    const list = [];
    const doc = c.ownerDocument;
    const n = mount(c, 'hx-callout', '<div class="hx-band"><div class="hx-eyes"></div><div class="hx-stripe"></div></div><div class="hx-txt"><div class="hx-who"></div><b class="hx-move"></b></div>', '', 1250, schedule, list);
    n.querySelector('.hx-who').textContent = String(who || '');
    n.querySelector('.hx-move').textContent = String(move || '');
    const eyes = n.querySelector('.hx-eyes');
    if (url) eyes.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
    else eyes.remove();
    void doc;
    return list;
}

// 治疗：头像后一道柔光上升 + 轻环 + 少量光点（挂在主角单位内、头像之下），血条回涨由原有血条落笔负责。
export function hxHeal(unitEl, { schedule } = {}) {
    const doc = unitEl?.ownerDocument;
    if (!doc?.createElement) return [];
    const fx = doc.createElement('div');
    fx.className = 'hx-heal-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.innerHTML = '<div class="hx-bloom"></div><div class="hx-col"></div><div class="hx-ring"></div>'
        + [8, 18, 30, 40, 50].map((x, i) => `<i class="hx-mote" style="left:${x}px;animation-delay:${80 + i * 90}ms"></i>`).join('');
    unitEl.insertBefore(fx, unitEl.firstChild);
    unitEl.classList.add('hx-healing');
    (schedule || ((fn, ms) => setTimeout(fn, ms)))(() => { fx.remove?.(); unitEl.classList.remove('hx-healing'); }, 1500);
    return [fx];
}

const SCOPE = '#igs-overlay #igs-combat-panel:not([data-igs-combat-skin="initial"])';
const EXTRA = `
#igs-overlay #igs-combat-panel .igs-hx-canvas{position:absolute;left:50%;top:50%;width:${SIZE.port}px;height:844px;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;pointer-events:none;overflow:visible;}
#igs-overlay #igs-combat-panel .igs-hx-canvas.land{width:${SIZE.land}px;height:720px;}
#igs-overlay #igs-combat-panel .igs-hx-canvas>*{pointer-events:none;}
@keyframes hx-sweep{0%{transform:scaleX(0);opacity:1;}60%{transform:scaleX(1);opacity:1;}100%{transform:scaleX(1);opacity:0;}}
@keyframes hx-hurt{0%{filter:brightness(2.2) saturate(0);}30%{transform:translateX(10px) rotate(2deg);filter:brightness(1.35) saturate(.5);}60%{transform:translateX(-6px);filter:none;}100%{filter:none;}}
@keyframes hx-struck{0%{filter:brightness(1.8) saturate(.4);}30%{transform:translateX(-8px);filter:brightness(1.3);}60%{transform:translateX(5px);filter:none;}100%{filter:none;}}
${SCOPE} .foe[data-igs-combat-react="hit"] .art{animation:hx-hurt 320ms cubic-bezier(.3,1.6,.5,1);}
${SCOPE} :is(.lead,.mate)[data-igs-combat-react="hit"] :is(.face,.mface){animation:hx-struck 300ms cubic-bezier(.3,1.6,.5,1);}
${SCOPE} .foe.hx-falling .art .cx-art-img{filter:grayscale(1) brightness(.55);transition:filter 300ms;}
${SCOPE} .hx-rbanner .hx-ic{color:var(--hx-rar);}
${SCOPE} .igs-combat-rarity-fx.is-hit{inset:-30% -45% -10%;mix-blend-mode:screen;filter:brightness(1.35) saturate(1.2);}
${SCOPE} .igs-combat-rarity-spark{width:5px;height:26px;box-shadow:0 0 10px var(--rar);}
${SCOPE} .igs-combat-float.hx-gainfx{font-size:34px;}
${SCOPE} .lead .igs-combat-float{left:60px;top:-14px;translate:0 0;}
#igs-overlay[data-igs-quality="low"] #igs-combat-panel .igs-hx-canvas :is(.hx-hitfx,.hx-windfx,.hx-reticle,.hx-trail){display:none;}
@media(prefers-reduced-motion:reduce){#igs-overlay #igs-combat-panel .igs-hx-canvas{display:none;}}
`;
export const COMBAT_HIT_FX_SKIN_STYLE_TEXT = `${COMBAT_HIT_SKIN_STYLE_TEXT}${EXTRA}`;
