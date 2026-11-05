import { CANVAS_SIZE, canvasFit } from './combat-skin-canvas.js';
import { portraitSilhouetteSvg } from './combat-card-art.js';
import { COMBAT_STAGE_FX_BASE_CSS, COMBAT_STAGE_FX_STYLE_CSS } from './combat-stage-fx-style.js';
import { COMBAT_STAGE_FX_POLISH_CSS } from './combat-stage-fx-polish.js';
import { RESULT_SKINS, RESULT_SKINS_CSS } from './combat-result-skins.js';

// 战斗大节点演出（风格化皮肤）：开战黑屏对撞、技能切入、觉醒两段式、结算。照搬设计稿 fx.js / fx3.js 的节点与几何，样式见 combat-stage-fx-style.js（由设计稿 CSS 生成）。
// 演出画在固定画布（竖屏 390×844、横屏 1280×720）里，整体按面板尺寸等比缩放（--cx-scale）；宽度随面板伸展（--cw = fit.w），画布外的留边由外层铺底。
// 初始方案（initial）不走本模块。纯 DOM 构造，不含计时；节点上的 .hit / .out 类由调用方按 COMBAT_STAGE_TIMING 到点添加。
// 名字、台词、招式名只经 textContent 写入；立绘地址由调用方经 safePortraitUrl 过滤后传入。

// 皮肤键 → 演出风格；initial 与未知键没有演出风格。
const STYLE_OF = Object.freeze({ comic: 'comic', veil: 'veil', ink: 'ink', tech: 'tech', mystic: 'mystic', 'soft-a': 'soft', 'soft-c': 'soft', 'dark-a': 'dark', 'dark-b': 'dark' });
export const stageFxStyle = (skin) => STYLE_OF[String(skin || '')] || '';
// VS 字样：水墨用单字「战」。
const VS_TEXT = Object.freeze({ ink: '战' });
// 特色层空节点数（花瓣、碎片等按序号 .d0…取用）。
const DECO_N = 12;

// 入场时间轴（毫秒，未乘演出倍速）：撞击、拉开、移除；DONE 为战斗演出可以开始的时刻。
export const COMBAT_STAGE_TIMING = Object.freeze({ hit: 480, out: 1800, end: 2300, open: 2100 });

const WRAP_CSS = `
#igs-overlay .igs-sfx{position:absolute;inset:0;z-index:7;overflow:hidden;pointer-events:none;color:var(--text);font:13px/1.5 var(--display);}
#igs-overlay .igs-sfx *{box-sizing:border-box;}
#igs-overlay .igs-sfx.is-clash{background:var(--edge);}
#igs-overlay .igs-sfx.is-clash.out{background:transparent;transition:background 300ms;}
#igs-overlay .igs-sfx .sfx-canvas{position:absolute;left:50%;top:50%;width:var(--cw);height:var(--ch);margin:calc(var(--ch) / -2) 0 0 calc(var(--cw) / -2);transform:scale(var(--cx-scale,1));transform-origin:50% 50%;}
#igs-overlay .igs-sfx-result{position:absolute;inset:0;z-index:1;pointer-events:none;}
#igs-overlay .igs-sfx-result .rs-ui{position:absolute;z-index:5;right:14px;top:600px;width:226px;display:flex;flex-direction:column;gap:10px;pointer-events:auto;}
#igs-overlay .igs-sfx-result.land .rs-ui{right:120px;top:560px;width:380px;}
#igs-combat-panel:not([data-igs-combat-result-in]) .igs-sfx-result :is(.veil,.hband,.fig,.plate,.big,.grade,.row){animation-duration:0s;animation-delay:0s;}
#igs-combat-panel[data-igs-combat-reduced] .igs-sfx-result :is(.veil,.hband,.fig,.plate,.big,.grade,.row){animation-duration:0s;animation-delay:0s;}
/* VS 对撞站位：两边镜像，主战者等大（3:4 框）、头顶同高，同伴在外侧身后、略小压暗；竖屏我方偏上、敌方偏下，按接缝斜向错开 */
#igs-overlay .igs-sfx .clash .half .fig.lead{left:-24px;right:auto;top:96px;bottom:auto;width:330px;height:440px;}
#igs-overlay .igs-sfx .clash .half .fig.mate{left:-84px;right:auto;top:40px;bottom:auto;width:250px;height:333px;}
#igs-overlay .igs-sfx .clash .half .fig.foe1{right:-24px;left:auto;top:308px;bottom:auto;width:330px;height:440px;}
#igs-overlay .igs-sfx .clash .half .fig.foe2{right:-84px;left:auto;top:252px;bottom:auto;width:250px;height:333px;filter:brightness(.55) saturate(.8);}
#igs-overlay .igs-sfx .clash .name.h{left:24px;right:auto;top:auto;bottom:196px;}
#igs-overlay .igs-sfx .clash .name.f{right:24px;left:auto;top:200px;bottom:auto;}
#igs-overlay .igs-sfx.land .clash .half .fig.lead{left:40px;top:36px;width:510px;height:680px;}
#igs-overlay .igs-sfx.land .clash .half .fig.mate{left:-120px;top:0;width:400px;height:533px;}
#igs-overlay .igs-sfx.land .clash .half .fig.foe1{right:40px;top:36px;width:510px;height:680px;}
#igs-overlay .igs-sfx.land .clash .half .fig.foe2{right:-120px;top:0;width:400px;height:533px;}
#igs-overlay .igs-sfx.land .clash .name.h{left:110px;bottom:150px;}
#igs-overlay .igs-sfx.land .clash .name.f{right:110px;top:150px;}
#igs-overlay .igs-sfx .fig img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 0;}
#igs-overlay .igs-sfx .fig .igs-combat-art{position:absolute;inset:0;}
#igs-overlay .igs-sfx .fig-sil{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;color:var(--text,#fff);opacity:.14;}
#igs-overlay .igs-sfx .fig-sil svg{width:auto;height:100%;max-width:100%;}
#igs-overlay .igs-sfx .fig-char{position:absolute;inset:0;display:grid;place-items:center;color:var(--text);font:900 min(60%,180px)/1 var(--display);opacity:.45;}
`;
export const COMBAT_STAGE_FX_STYLE_TEXT = `${COMBAT_STAGE_FX_BASE_CSS}\n${Object.values(COMBAT_STAGE_FX_STYLE_CSS).join('\n')}\n${WRAP_CSS}\n${COMBAT_STAGE_FX_POLISH_CSS}
${RESULT_SKINS_CSS}`;

const cssUrl = (url) => `url("${String(url).replace(/[\r\n]/g, '').replace(/["\\]/g, (ch) => `\\${ch}`)}")`;
const NS = 'http://www.w3.org/2000/svg';

function el(doc, tag, cls, parent) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    parent?.appendChild(n);
    return n;
}
function text(doc, tag, cls, value, parent) {
    const n = el(doc, tag, cls, parent);
    n.textContent = String(value ?? '');
    return n;
}
// 立绘节点：有图用背景图（背景图写在节点的内联样式上），没有立绘时写名字首字。
function figure(doc, cls, url, name, parent) {
    const f = el(doc, 'i', `fig ${cls}`, parent);
    fillFigure(doc, f, url, name);
    return f;
}
const heroSig = (url, name) => (url ? `u:${url}` : `n:${name || ''}`);
function fillFigure(doc, f, url, name) {
    f.setAttribute?.('data-src', heroSig(url, name));
    if (url) { if (f.style) f.style.backgroundImage = cssUrl(url); }
    else silhouette(doc, f, name);
}
// 就地换内容（不换节点，正在播的动画不重开）。
function clearFigure(f) {
    while (f.firstChild) f.removeChild(f.firstChild);
    if (f.style) f.style.backgroundImage = '';
}
// 缺立绘时画皮肤色的人形剪影（不用首字或破图）。
function silhouette(doc, parent, name) {
    const sil = doc.createElement('span');
    sil.className = 'fig-sil';
    sil.innerHTML = portraitSilhouetteSvg(name);
    parent.appendChild(sil);
}
// 敌人立绘：素材库图 > 通用图集一格 > 首字。
function foeFigure(doc, cls, foe, parent) {
    const f = el(doc, 'i', `fig ${cls}`, parent);
    fillFoeFigure(doc, f, foe);
    return f;
}
const foeSig = (foe) => (foe.url ? `u:${foe.url}` : foe.cell ? `c:${foe.cell.atlas}:${foe.cell.x}:${foe.cell.y}` : `n:${foe.name || ''}`);
function fillFoeFigure(doc, f, foe) {
    f.setAttribute?.('data-src', foeSig(foe));
    if (foe.url) {
        const img = el(doc, 'img', '', f);
        img.setAttribute('src', foe.url);
        img.setAttribute('alt', '');
    } else if (foe.cell) {
        const art = el(doc, 'i', 'igs-combat-art', f);
        art.setAttribute('data-atlas', String(foe.cell.atlas));
        art.style?.setProperty?.('--ea-x', String(foe.cell.x));
        art.style?.setProperty?.('--ea-y', String(foe.cell.y));
    } else silhouette(doc, f, foe.name);
    return f;
}

// 演出外壳：外层铺满面板，内层是按方向取的固定画布。返回 { root, canvas, orient }。
export function buildStageShell(doc, { skin = '', width = 0, height = 0, kind = '' } = {}) {
    const style = stageFxStyle(skin);
    const fit = canvasFit(width, height);
    const size = CANVAS_SIZE[fit.orient];
    const root = el(doc, 'div', `igs-sfx${fit.orient === 'land' ? ' land' : ''}${kind ? ` is-${kind}` : ''}`);
    root.setAttribute('data-sfx', style);
    root.setAttribute('data-skin', String(skin || ''));
    root.setAttribute('aria-hidden', 'true');
    root.style?.setProperty?.('--cw', `${fit.w}px`);
    root.style?.setProperty?.('--ch', `${size.h}px`);
    root.style?.setProperty?.('--cx-scale', String(fit.scale));
    const canvas = el(doc, 'div', 'sfx-canvas', root);
    return { root, canvas, orient: fit.orient, W: fit.w, H: size.h, style };
}

// ---- 设计稿 fx.js 的几何：接缝拐点（百分比）、星形尖、刀刃金牌、一组光 ----
const KEYS = {
    port: [[78, 0], [58, 30], [66, 38], [34, 64], [42, 70], [22, 100]],
    land: [[60, 0], [52, 30], [57, 40], [45, 62], [49, 70], [40, 100]],
};
// 按皮肤换接缝（百分比点列，自上而下）与撞点。没列的皮肤用 KEYS，撞点取第 3、4 点的中点。
const line = (x0, x1) => [0, 30, 50, 70, 100].map((y) => [x0 + (x1 - x0) * y / 100, y]);
// 平滑曲线：从 x0 斜到 x1，叠一段正弦（amp 振幅、waves 周期数）；撞点取 y=50 处。
const curve = (x0, x1, amp, waves) => Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    return [+(x0 + (x1 - x0) * t + amp * Math.sin(t * Math.PI * 2 * waves)).toFixed(2), t * 100];
});
const SEAM_KEYS = {
    'dark-a': { port: line(62, 38), land: line(56, 44) },
    'dark-b': { port: line(50, 50), land: line(50, 50) },
    ink: { port: line(66, 34), land: line(57, 43) },
    veil: { port: line(64, 36), land: line(56, 44) },
    // 科技：直角台阶 + 一段 45° 斜冲，折角硬；星辉：星座连线式的直线折段（节点处有星点）。
    tech: { port: [[70, 0], [70, 24], [60, 34], [60, 44], [40, 56], [40, 66], [30, 76], [30, 100]], land: [[58, 0], [58, 22], [54, 34], [54, 44], [46, 56], [46, 66], [42, 78], [42, 100]] },
    mystic: { port: [[76, 0], [63, 22], [69, 36], [41, 62], [47, 74], [28, 100]], land: [[60, 0], [53, 22], [57, 38], [44, 62], [47, 76], [40, 100]] },
    'soft-a': { port: curve(60, 40, 5, 1.5), land: curve(55, 45, 3, 1.5) },
    'soft-c': { port: curve(60, 40, 5, 1.5), land: curve(55, 45, 3, 1.5) },
};
const seamOf = (skin, orient) => {
    const pts = (SEAM_KEYS[skin] || KEYS)[orient];
    if (!SEAM_KEYS[skin]) return { pts, at: [(pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2] };
    const i = pts.findIndex(([, y]) => y >= 50);
    const [x0, y0] = pts[i - 1] || pts[i], [x1, y1] = pts[i];
    return { pts, at: [y1 === y0 ? x1 : x0 + (x1 - x0) * (50 - y0) / (y1 - y0), 50] };
};
const poly = (pts) => `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
const rnd = (seed) => { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
function spikes(cx, cy, n, len, base, jitter, seed) {
    const r = rnd(seed); let d = '';
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r() - 0.5) * jitter, L = len * (0.55 + r() * 0.55), w = base * (0.7 + r() * 0.6);
        const p = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`;
        d += `M${p(a - w, 40)}L${p(a, L)}L${p(a + w, 40)}Z`;
    }
    return d;
}
// 锋利碎片形底牌（0–100 坐标，拉伸铺满）：外形 + 上半一块亮面。
const PLATE = '0,100 9,10 57,4 53,15 100,0 91,90 46,96 50,85';
const PLATE_HI = '9,14 57,8 54,18 97,4 95,30 7,40';
const plateSvg = () => `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon class="p-shadow" points="${PLATE}"/><polygon class="p-gold" points="${PLATE}"/><polygon class="p-hi" points="${PLATE_HI}"/></svg>`;
let uid = 0;
// 一组光：锋利光芒（白在前、金在后）+ 白热光芯；cx/cy 为中心像素。
function lightSvg(cx, cy, reach, id) {
    return `<defs><radialGradient id="core-${id}"><stop offset="0" stop-color="#fff"/><stop offset=".28" stop-color="#fff6e6"/>`
        + `<stop offset=".55" stop-color="#ffc27a" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient></defs>`
        + `<path class="rays rays2" fill="#ffc27a" d="${spikes(cx, cy, 16, reach * 1.1, 0.05, 0.3, 7)}"/>`
        + `<path class="rays" fill="#fff" d="${spikes(cx, cy, 14, reach * 0.85, 0.032, 0.35, 19)}"/>`
        + `<circle class="core" cx="${cx}" cy="${cy}" r="${(reach * 0.42).toFixed(0)}" fill="url(#core-${id})"/>`;
}
// 内部 HTML 只拼数字与程序常量；名字等文本在拼好后用 textContent 写入。

// 我方名字旁的小头像行：可操控的角色不止一个时才画；已有的先去掉再画（战前数据到达后补画用）。
function pickRow(doc, nameEl, heroes) {
    nameEl.querySelector?.('.pickrow')?.remove?.();
    const picks = heroes.filter((h) => h.id && h.controllable);
    if (picks.length < 2) return;
    const row = el(doc, 'span', 'pickrow', nameEl);
    for (const h of picks) {
        const b = el(doc, 'button', 'pick', row);
        b.setAttribute('type', 'button');
        b.setAttribute('data-combat-act', 'pick');
        b.setAttribute('data-combat-id', String(h.id));
        b.setAttribute('aria-pressed', h.picked ? 'true' : 'false');
        b.setAttribute('aria-label', String(h.name || ''));
        b.setAttribute('title', String(h.name || ''));
        if (h.url) { if (b.style) b.style.backgroundImage = cssUrl(h.url); } else b.textContent = Array.from(String(h.name || ''))[0] || '';
    }
}

// 战前数据（我方名单、可操控角色）晚于对撞过场到达时：就地更新我方名字、首字与头像行，不重播过场。
export function updateClashHeroes(doc, root, heroes = []) {
    const nameEl = root?.querySelector?.('.name.h');
    if (!nameEl) return;
    const lead = heroes[0], mate = heroes[1];
    const first = nameEl.firstChild;
    if (first && first.nodeType === 3) first.nodeValue = String(lead?.name || '');
    const and = nameEl.querySelector('.and');
    if (and) { if (mate?.name) and.textContent = `& ${mate.name}`; else and.remove(); } else if (mate?.name) { const sp = doc.createElement('span'); sp.className = 'and'; sp.textContent = `& ${mate.name}`; nameEl.insertBefore(sp, first?.nextSibling || null); }
    pickRow(doc, nameEl, heroes);
}

// 立绘晚于对撞过场到达（战前名单、素材库读回）：就地换我方与敌方立绘框的内容，地址没变的框不动。
export function updateClashFigures(doc, root, { heroes = [], foes = [] } = {}) {
    const heroSide = root?.querySelector?.('.half.hero-side');
    const foeSide = root?.querySelector?.('.half.foe-side');
    if (!heroSide || !foeSide) return;
    // 主位（lead/foe1）总在；副位（mate/foe2）按有无增删，插在主位前面以保持原有叠放次序。
    const slot = (side, cls, mainCls, data, sig, fill) => {
        let f = side.querySelector(`.fig.${cls}`);
        if (!data) { if (cls !== mainCls) f?.remove?.(); return; }
        if (!f) {
            f = doc.createElement('i');
            f.className = `fig ${cls}`;
            side.insertBefore(f, side.querySelector(`.fig.${mainCls}`) || null);
        } else if (f.getAttribute?.('data-src') === sig) return;
        clearFigure(f);
        fill(f, data);
    };
    const lead = heroes[0] || { name: '' }, mate = heroes[1];
    const heroFill = (f, h) => fillFigure(doc, f, h.url, h.name);
    slot(heroSide, 'lead', 'lead', lead, heroSig(lead.url, lead.name), heroFill);
    slot(heroSide, 'mate', 'lead', mate, mate ? heroSig(mate.url, mate.name) : '', heroFill);
    const f1 = foes[0] || { name: '' }, f2 = foes[1];
    const foeFill = (f, foe) => fillFoeFigure(doc, f, foe);
    slot(foeSide, 'foe1', 'foe1', f1, foeSig(f1), foeFill);
    slot(foeSide, 'foe2', 'foe1', f2, f2 ? foeSig(f2) : '', foeFill);
}

// 开战黑屏对撞：我方（主战者 + 同伴）与敌方（前排 + 后排）沿锯齿接缝对撞，撞点光芒、光环、火花，名字与破框 VS 砸入。
// heroes：[{ name, url }]（第一个是主战者）；foes：[{ name, url, cell }]；title：关卡名。low：低画质省去火花与光痕。
export function buildStageClash(doc, { skin = '', width = 0, height = 0, heroes = [], foes = [], title = '', low = false } = {}) {
    const sh = buildStageShell(doc, { skin, width, height, kind: 'clash' });
    const { canvas, W, H, orient, style } = sh;
    const clash = el(doc, 'div', 'clash', canvas);
    const { pts: key, at: [ix, iy] } = seamOf(skin, orient);
    const cx = ix / 100 * W, cy = iy / 100 * H;
    const seam = key.map(([x, y]) => `${(x / 100 * W).toFixed(1)},${(y / 100 * H).toFixed(1)}`).join(' ');
    const land = orient === 'land';
    const reach = Math.min(W, H) * (land ? 0.62 : 0.78), R = Math.min(W, H) * 0.55;
    clash.style?.setProperty?.('--ix', `${ix}%`);
    clash.style?.setProperty?.('--iy', `${iy}%`);
    const shake = el(doc, 'div', 'shake', clash);
    const heroSide = el(doc, 'div', 'half hero-side', shake);
    heroSide.style?.setProperty?.('clip-path', poly([[0, 0], ...key, [0, 100]]));
    const foeSide = el(doc, 'div', 'half foe-side', shake);
    foeSide.style?.setProperty?.('clip-path', poly([...key, [100, 100], [100, 0]]));
    const lead = heroes[0] || { name: '' }, mate = heroes[1];
    if (mate) figure(doc, 'mate', mate.url, mate.name, heroSide);
    figure(doc, 'lead', lead.url, lead.name, heroSide);
    const f1 = foes[0] || { name: '' }, f2 = foes[1];
    if (f2) foeFigure(doc, 'foe2', f2, foeSide);
    foeFigure(doc, 'foe1', f1, foeSide);
    const id = `clash-${(uid += 1)}`;
    const svgWrap = doc.createElement('div');
    svgWrap.innerHTML = `<svg xmlns="${NS}" class="fxsvg seam" viewBox="0 0 ${W} ${H}"><polyline class="ink" points="${seam}"/><polyline class="gold" points="${seam}"/><polyline class="hot" points="${seam}"/></svg>`
        + `<svg xmlns="${NS}" class="fxsvg light" viewBox="0 0 ${W} ${H}" style="--ox:${cx}px;--oy:${cy}px;--R:${R.toFixed(0)}px">${lightSvg(cx, cy, reach, id)}`
        + `<circle class="ring" cx="${cx}" cy="${cy}" r="10"/><circle class="ring r2" cx="${cx}" cy="${cy}" r="10"/></svg>`;
    while (svgWrap.firstChild) shake.appendChild(svgWrap.firstChild);
    if (!low) {
        el(doc, 'i', 'flare', shake);
        for (let i = 0; i < 14; i++) {
            const sp = el(doc, 'i', 'spark', shake);
            sp.style?.setProperty?.('--a', `${(i / 14) * 360 + ((i * 53) % 20)}deg`);
            sp.style?.setProperty?.('--d', `${(reach * (0.55 + ((i * 37) % 10) / 16)).toFixed(0)}px`);
            sp.style?.setProperty?.('--s', `${30 + (i * 13) % 40}px`);
        }
    }
    // 各套特色层：空节点，形状与时序全由 combat-stage-fx-polish.js 按皮肤给出，没有规则的皮肤不显示。
    const deco = el(doc, 'div', 'sfx-deco', shake);
    for (let i = 0; i < DECO_N; i++) el(doc, 'i', `d${i}`, deco);
    el(doc, 'div', 'flash', shake);
    const nameOf = (cls, a, b, small) => {
        const n = el(doc, 'div', `name ${cls}`, shake);
        n.appendChild(doc.createTextNode(String(a?.name || '')));
        if (b?.name) text(doc, 'span', 'and', `& ${b.name}`, n);
        if (small) text(doc, 'small', '', small, n);
        el(doc, 'i', '', n);
        return n;
    };
    nameOf('f', f1, f2, title);
    const heroName = nameOf('h', lead, mate, '');
    // 多人且可操控时，我方名字旁给小头像：点头像切换操控角色（data-combat-act="pick"，由面板控制器处理）。
    pickRow(doc, heroName, heroes);
    const vs = el(doc, 'div', 'vs', shake);
    vs.innerHTML = plateSvg();
    el(doc, 'i', 'blade', vs);
    el(doc, 'i', 'blade b2', vs);
    text(doc, 'b', '', VS_TEXT[style] || 'VS', vs);
    return { root: sh.root, clash };
}

// ---- 技能切入（设计稿 fx3.js skill）：斜带 + 立绘从带里冲出 + 招式大字（有台词时加台词条）+ 属性光火星 ----
export function buildStageSkill(doc, { skin = '', width = 0, height = 0, name = '', skill = '', line = '', url = '' } = {}) {
    const sh = buildStageShell(doc, { skin, width, height, kind: 'cut' });
    const cut = el(doc, 'div', 'cut', sh.canvas);
    el(doc, 'div', 'dim', cut);
    const band = el(doc, 'div', 'band', cut);
    [18, 46, 74, 104, 128].forEach((y, i) => {
        const s = el(doc, 'i', 'streak', band);
        s.style?.setProperty?.('top', `${y}px`);
        s.style?.setProperty?.('animation-delay', `${-i * 110}ms`);
    });
    for (let i = 0; i < 14; i++) {
        const e = el(doc, 'i', 'ember', band);
        e.style?.setProperty?.('left', `${20 + (i * 53) % 340}px`);
        e.style?.setProperty?.('top', `${30 + (i * 37) % 100}px`);
        e.style?.setProperty?.('--dx', `${60 + (i * 29) % 90}px`);
        e.style?.setProperty?.('--dy', `${-30 - (i * 17) % 50}px`);
        e.style?.setProperty?.('animation-delay', `${120 + i * 50}ms`);
    }
    figure(doc, '', url, name, cut);
    if (line) text(doc, 'span', '', line, el(doc, 'div', 'line', cut));
    const move = el(doc, 'div', 'move', cut);
    text(doc, 'small', '', `${name} · 技能`, move);
    move.appendChild(doc.createTextNode(String(skill || name || '')));
    return { root: sh.root };
}

// ---- 觉醒两段式（设计稿 fx3.js awaken）：先眼部斜切特写，再白闪、光柱、全身立绘升起、台词、刀刃金牌 +「觉醒」压在下半身 ----
export function buildStageAwaken(doc, { skin = '', width = 0, height = 0, name = '', awakenType = '', skill = '', line = '', url = '' } = {}) {
    const sh = buildStageShell(doc, { skin, width, height, kind: 'awaken' });
    const aw = el(doc, 'div', 'awaken', sh.canvas);
    el(doc, 'div', 'veil', aw);
    el(doc, 'div', 'aw-tint', aw);
    el(doc, 'div', 'aw-cross', aw);
    el(doc, 'div', 'aw-cross c2', aw);
    [120, 210, 300, 420, 520, 640].forEach((y, i) => {
        const s = el(doc, 'i', 'aw-streak', aw);
        s.style?.setProperty?.('top', `${y}px`);
        s.style?.setProperty?.('animation-delay', `${800 + i * 60}ms`);
    });
    for (let i = 0; i < 16; i++) {
        const e = el(doc, 'i', 'aw-ember', aw);
        e.style?.setProperty?.('left', `${(i * 47) % 100}%`);
        e.style?.setProperty?.('bottom', `${(i * 31) % 200}px`);
        e.style?.setProperty?.('--rise', `${220 + (i * 37) % 260}px`);
        e.style?.setProperty?.('animation-delay', `${820 + i * 40}ms`);
    }
    if (url) {
        const eye = el(doc, 'div', 'eye', aw);
        const strip = el(doc, 'i', '', eye);
        if (strip.style) strip.style.backgroundImage = cssUrl(url);
        el(doc, 'i', 'gleam', eye);
        const f = el(doc, 'div', 'fig', aw);
        if (f.style) f.style.backgroundImage = cssUrl(url);
    }
    if (line) text(doc, 'span', '', `「${line}」`, el(doc, 'div', 'line', aw));
    const plate = el(doc, 'div', 'plate', aw);
    plate.innerHTML = plateSvg();
    el(doc, 'i', 'aw-plate-gleam', aw);
    const big = el(doc, 'div', 'big', aw);
    big.appendChild(doc.createTextNode('觉醒'));
    text(doc, 'small', '', [skill || awakenType, name].filter(Boolean).join(' · '), big);
    el(doc, 'div', 'flash', aw);
    return { root: sh.root };
}

// ---- 结算（设计稿 fx3.js result）：左侧队伍立绘升起，右侧刀刃金牌 +「胜利」破框、回合数大字、战绩逐条斜切滑入；战利品与按钮放在下方可点区 ----
// 返回 HTML 字符串，由结算画面直接写入面板：e 为 endView，pics 为立绘地址表，ui 为战利品与按钮的现成 HTML（已转义）。
const ENGLISH = Object.freeze({ victory: 'VICTORY', defeat: 'DEFEAT', escape: 'ESCAPE' });
export function resultStageHtml({ skin = '', orient = 'port', end = {}, order = [], pics = {}, ui = '', esc = (s) => String(s ?? '') } = {}) {
    const style = stageFxStyle(skin);
    const size = CANVAS_SIZE[orient === 'land' ? 'land' : 'port'];
    const won = end.outcome === 'victory';
    const heroes = order.length ? order : (end.allies || []).map((a) => a.name);
    const own = RESULT_SKINS[skin];
    const args = { skin, orient, end, order, pics, ui, esc, style, size, won, heroes, english: ENGLISH[end.outcome] || '', cssUrl, plateSvg };
    const custom = own?.html?.(args);
    if (custom) return custom;
    const fig = (cls, n) => (n ? `<i class="fig ${cls}"${pics[n] ? ` style="background-image:${esc(cssUrl(pics[n]))}"` : ''}>${pics[n] ? '' : `<b class="fig-char">${esc(Array.from(n)[0] || '')}</b>`}</i>` : '');
    // 行上带种类（战功 / 队员）、伤情冷暖与头像，供要画行首图标、数值配色的皮肤取用；其余皮肤不读这些属性。
    const tone = (v) => (/重创|濒死|倒下|力竭/.test(v) ? 'bad' : /无伤|轻伤|从容/.test(v) ? 'good' : '');
    const rows = [...(end.feats || []).map((f) => ['战功', f.title || '', 'feat']), ...(end.allies || []).map((a) => [a.name, a.injury || '', 'ally'])].slice(0, 3)
        .map(([h, v, kind], i) => {
            const pic = kind === 'ally' && pics[h] ? `;--pic:${esc(cssUrl(pics[h]))}` : '';
            return `<div class="row" data-kind="${kind}" data-tone="${tone(v)}" data-ch="${esc(Array.from(h)[0] || '')}" style="--d:${1050 + i * 140}ms${pic}"><span>${esc(h)}</span><b>${esc(v)}</b></div>`;
        }).join('');
    return `<section class="igs-sfx igs-sfx-result${orient === 'land' ? ' land' : ''}" data-sfx="${esc(style)}" data-skin="${esc(skin)}" data-outcome="${esc(end.outcome || '')}" style="--cw:var(--cx-w,${size.w}px);--ch:${size.h}px">`
        + `<div class="sfx-canvas"><div class="result${won ? '' : ' lose'}"><div class="veil"></div><div class="hband"></div>${own?.decor?.(args) || ''}${fig('mate', heroes[1])}${fig('lead', heroes[0])}`
        + `<div class="plate">${plateSvg()}</div><div class="big">${esc(end.label || '')}<small>${esc(ENGLISH[end.outcome] || '')}</small></div>`
        + `<div class="grade"><small>回合</small>${esc(end.turn ?? '')}</div><div class="rows">${rows}</div>`
        + `<div class="rs-ui">${ui}</div></div></div></section>`;
}
