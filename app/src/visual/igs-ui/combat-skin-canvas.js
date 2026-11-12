// 风格化皮肤的固定画布：战斗中画面照搬概念稿的 DOM 与样式（竖屏 390×844、横屏 1280×720），整体按面板尺寸等比缩放。
// 本文件放各套共用的部分：控制器与演出要找的节点（两种 DOM 共用的选择器）、画布方向与缩放、手牌摊开与敌人圆环的数值、选中目标的判定。
import { isItemSelection, isSkillSelection, selectedItemView, selectedSkillView } from './combat-panel-model.js';

// 已照搬概念稿的皮肤（由 combat-skin-registry.js 登记）；其余皮肤仍走原有标记。
const CANVAS_SKINS = new Set();
export const markCanvasSkin = (skin) => { CANVAS_SKINS.add(String(skin)); };
export const isCanvasSkin = (skin) => CANVAS_SKINS.has(String(skin || ''));

export const CANVAS_SIZE = Object.freeze({ port: { w: 390, h: 844 }, land: { w: 1280, h: 720 } });

// 面板宽高比大于 1 用横屏画布；按高度缩放，画布宽度随面板伸展贴满左右（不窄于设计稿，更窄时退回整体等比缩小）。
// 皮肤样式读根节点上的 --cx-w（画布逻辑宽，px），皮肤 JS 读 canvasW(orient)。
let lastFit = null;
export function canvasFit(width, height) {
    const orient = width > height ? 'land' : 'port';
    const { w, h } = CANVAS_SIZE[orient];
    if (!(width > 0 && height > 0)) return { orient, scale: 1, w };
    const byHeight = height / h;
    const scale = width / byHeight >= w ? byHeight : Math.min(width / w, byHeight);
    const fit = { orient, scale: Number(scale.toFixed(4)), w: Math.max(w, Math.floor(width / scale)) };
    lastFit = fit;
    return fit;
}
export const canvasW = (orient) => (lastFit && lastFit.orient === orient ? lastFit.w : CANVAS_SIZE[orient === 'land' ? 'land' : 'port'].w);

// 九套共用的技能、道具图标：两把刀尖交叉、细颈药瓶（细线、跟随 currentColor），各套只换颜色与按钮外形。
export const SKILL_ICON_SVG = '<svg class="cx-skill-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 4l12 12M13 17.5l4.5-4.5M16.5 16.5l3 3"/><path d="M20 4L8 16M11 17.5L6.5 13M7.5 16.5l-3 3"/></svg>';
export const ITEM_ICON_SVG = '<svg class="cx-item-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M9 3h6M10 3v5.5L5.5 17a3 3 0 0 0 2.7 4h7.6a3 3 0 0 0 2.7-4L14 8.5V3M7.5 14h9"/></svg>';

// 两种 DOM 共用的节点选择器：原有标记用 igs-combat-* 类，画布标记用 cx-* 钩子类（不带原有类，避免原有样式套到画布上）。
export const SEL = Object.freeze({
    unit: ':is(.igs-combat-unit,.cx-unit)',
    hand: ':is(.igs-combat-hand,.cx-hand)',
    field: ':is(.igs-combat-field,.cx-field)',
    trait: ':is(.igs-combat-trait,.cx-trait)',
    traitRing: ':is(.igs-combat-trait-ring,.cx-traits)',
    items: ':is(.igs-combat-items,.cx-items)',
    trackDot: ':is(.igs-combat-track-dot,.cx-dot)',
    hp: ':is(.igs-combat-hp,.cx-hp)',
    hpValue: ':is(.igs-combat-hp-value,.cx-hp-value)',
});

// 选中后可点的单位：要选目标的牌 / 技能 / 道具为可选目标；不选目标的为承受方（点其中任一个确认）。与原有标记同一判定。
export function battlePick(v) {
    const b = v.battle;
    const skill = isSkillSelection(v.selected);
    const item = isItemSelection(v.selected);
    const picked = skill ? selectedSkillView(b, v.selected) : item ? selectedItemView(b, v.selected)
        : v.selected ? b.hand.find((c) => c.inst === v.selected) : null;
    const targets = new Set(picked ? (picked.targets?.length ? picked.targets : picked.affects || []) : []);
    return { picked, skill, item, card: Boolean(picked) && !skill && !item, targets, pickable: (u) => !b.outcome && u.alive && targets.has(u.id) };
}

// 手牌摊开：照搬概念稿 layout()。H 为该方向的手牌常数，w 为手牌区宽度；返回每张牌的 left / 层序 / 下沉 / 旋转（像素与角度）。
export function handLayout(n, sel, H, w) {
    // H.over（可选）：步距上限为窄签宽度的倍数，手牌少时也保持交叠，整手居中。
    const fit = n > 1 ? (w - H.vis) / (n - 1) : 0;
    const step = H.over ? Math.min(fit, H.vis * H.over) : fit;
    const x0 = n > 1 ? (w - H.vis - step * (n - 1)) / 2 : 0;
    return Array.from({ length: n }, (_, i) => {
        const o = i - (n - 1) / 2, cx = x0 + i * step + H.vis / 2;
        const left = i === sel ? Math.max(H.minL ?? 2, Math.min(H.maxL ?? (w - 112 * H.fs - 2), cx - 56 * H.fs)) : x0 + i * step;
        return { left: Math.round(left), z: i === sel ? 50 : i + 1, tx: Math.round(H.drop + o * o * H.arc), rot: (o * H.rot).toFixed(2) };
    });
}
// 手牌区的变量（窄签露出宽度、缩放、放大牌尺寸）。
export const handVars = (H) => `--vis:${H.vis}px;--ts:${H.ts};--fs:${H.fs};--cw:${H.vis}px;--ch:${H.ch}px;--sw:${112 * H.fs}px;--sh:${176 * H.fs}px`;

// 敌人圆环：照搬概念稿 place()。L 为该方向的圆环常数；i 为序号、f 为正前方序号。
export function ringVars(i, f, n, L) {
    const t = ((i - f) * 2 * Math.PI) / Math.max(n, 3), d = (1 + Math.cos(t)) / 2;
    const style = `--w:${L.w}px;--fx:${(L.rx * Math.sin(t)).toFixed(1)}px;--fb:${(L.lift * (1 - d)).toFixed(1)}px;--fs:${(L.back + (1 - L.back) * d).toFixed(3)};`
        + `--fz:${Math.round(d * 100)};--fl:${(L.dim + (1 - L.dim) * d * d).toFixed(3)};--fsat:${(0.5 + 0.5 * d).toFixed(3)};--fi:${Math.max(0, (d - 0.75) / 0.25).toFixed(3)};--fp:${(0.45 + 0.55 * d).toFixed(3)}`;
    return { style, front: i === f, rear: d < 0.9 };
}

// 出牌影子：画布里的牌复制到演出层时套一层同皮肤的容器，保留手牌变量与方向，影子按画布缩放显示。
export function canvasGhostWrap(doc, cardEl) {
    const canvas = cardEl?.closest?.('.igs-cx-canvas');
    const hand = cardEl?.closest?.('.cx-hand');
    if (!canvas || !hand || typeof doc?.createElement !== 'function') return null;
    const wrap = doc.createElement('div');
    wrap.className = `igs-cx-ghost${canvas.classList.contains('land') ? ' land' : ''}`;
    wrap.setAttribute('data-cx', canvas.getAttribute('data-cx') || '');
    wrap.setAttribute('aria-hidden', 'true');
    const inner = doc.createElement('div');
    inner.className = 'hand';
    inner.setAttribute('style', hand.getAttribute('style') || '');
    wrap.appendChild(inner);
    return { wrap, inner };
}

// 结算三选一的候选牌：用本皮肤手牌的放大牌标记，去掉绝对定位与扇形，改成 pick-card 按钮（不带 data-combat-act="card"，不会被当成出牌）。
// html 是皮肤 cardHtml 以「已选中、费用足够」状态渲染的整张牌；这里只改根节点：去内联位置、换动作与标签、加已选 / 跳过 / 待定态。
export function rewardCardMarkup(html, { index, chosen, dim, pending }) {
    let out = String(html).replace(/^(<[a-z]+ [^>]*?) style="[^"]*"/, '$1');
    out = out.replace(/data-combat-act="card" data-combat-id="[^"]*"/, `data-combat-act="pick-card" data-combat-id="${index}"`)
        .replace(/^(<[a-z]+ [^>]*?)class="card /, `$1class="card rw-card${chosen ? ' is-chosen' : ''}${dim ? ' is-dim' : ''} `)
        .replace(/ aria-label="/, ` aria-label="选择 `)
        .replace(/ aria-disabled="true"/, '');
    if (chosen) out = out.replace(/ aria-label="([^"]*)"/, ' aria-label="$1（已选定）"');
    if (pending) out = out.replace(/^(<[a-z]+ )/, '$1aria-disabled="true" ');
    return out;
}
// 候选牌排布容器：套皮肤的影子作用域（igs-cx-ghost 带 data-cx，吃到该皮肤的牌面样式，面板控制器的画布点击 / 拖拽只认 igs-cx-canvas，不会碰到），一行静态排布。
// size 是放大牌的设计宽高；窄屏按可用宽度等比缩小（--rw-k 由 zoom 吃掉）。
export function rewardRowMarkup(key, orient, cards, size, vars = '') {
    const land = orient === 'land';
    const avail = size.avail?.[orient] ?? (land ? 460 : Math.max(240, canvasW(orient) - 56));
    const n = Math.max(1, cards.length);
    const k = Math.min(1, avail / (n * size.w + (n - 1) * 8));
    return `<div class="igs-cx-ghost igs-cx-rw${land ? ' land' : ''}" data-cx="${key}" style="--rw-k:${k.toFixed(3)}"><div class="hand cx-rw-hand" style="${vars}--rw-w:${size.w}px;--rw-h:${size.h}px">${cards.join('')}</div></div>`;
}
export const REWARD_ROW_CSS = `
#igs-overlay .igs-cx-ghost.igs-cx-rw{position:relative;left:auto;top:auto;pointer-events:auto;z-index:auto;display:flex;justify-content:center;width:auto;max-width:100%;zoom:var(--rw-k,1);touch-action:auto;flex-direction:row;align-items:flex-start;gap:0;padding:0;margin:0;min-height:0;background:none;}
#igs-overlay .igs-cx-ghost.igs-cx-rw *{touch-action:auto;}
#igs-overlay .igs-sfx-result .rs-ui:has(.igs-combat-loot-choices.is-full){left:14px;right:14px;width:auto;}
#igs-overlay .igs-sfx-result.land .rs-ui:has(.igs-combat-loot-choices.is-full){left:auto;right:120px;width:560px;}
#igs-overlay .igs-combat-loot:has(>.igs-combat-loot-choices.is-full)>.igs-combat-loot-row:not(.igs-combat-loot-choices):not(.ink-keep){display:none;}
#igs-overlay .igs-cx-ghost.igs-cx-rw>.hand{position:static;display:flex;flex-wrap:nowrap;justify-content:center;align-items:flex-start;gap:8px;left:auto;top:auto;width:auto;height:auto;transform:none;}
#igs-overlay .igs-cx-ghost.igs-cx-rw>.hand>.card.card.card.card.card{position:relative;flex:none;left:auto;top:auto;bottom:auto;right:auto;width:var(--rw-w);height:var(--rw-h);margin:0;transform:none;rotate:none;opacity:1;filter:none;cursor:pointer;z-index:auto;}
#igs-overlay .igs-cx-ghost.igs-cx-rw>.hand>.card.card.card.card.card.is-dim{opacity:.55;}
#igs-overlay .igs-cx-ghost.igs-cx-rw>.hand>.card.card.card.card.card.is-chosen{transform:translateY(-4px);}
`;
