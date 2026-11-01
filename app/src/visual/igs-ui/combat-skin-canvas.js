// 风格化皮肤的固定画布：战斗中画面照搬概念稿的 DOM 与样式（竖屏 390×844、横屏 1280×720），整体按面板尺寸等比缩放。
// 本文件放各套共用的部分：控制器与演出要找的节点（两种 DOM 共用的选择器）、画布方向与缩放、手牌摊开与敌人圆环的数值、选中目标的判定。
import { isItemSelection, isSkillSelection, selectedItemView, selectedSkillView } from './combat-panel-model.js';

// 已照搬概念稿的皮肤（由 combat-skin-registry.js 登记）；其余皮肤仍走原有标记。
const CANVAS_SKINS = new Set();
export const markCanvasSkin = (skin) => { CANVAS_SKINS.add(String(skin)); };
export const isCanvasSkin = (skin) => CANVAS_SKINS.has(String(skin || ''));

export const CANVAS_SIZE = Object.freeze({ port: { w: 390, h: 844 }, land: { w: 1280, h: 720 } });

// 面板宽高比大于 1 用横屏画布；缩放取宽高两向中较小的一个，画布居中。
export function canvasFit(width, height) {
    const orient = width > height ? 'land' : 'port';
    const { w, h } = CANVAS_SIZE[orient];
    const scale = width > 0 && height > 0 ? Math.min(width / w, height / h) : 1;
    return { orient, scale: Number(scale.toFixed(4)) };
}

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

// 结束回合是否要按住确认（用户 11-01 定）：还有能量且手里有能出的牌时防误触，否则一点即结束。各皮肤据此给按钮加 data-hold，控制器统一处理按住。
export const needsHold = (b) => Boolean(b && !b.outcome && b.energy > 0 && b.hand.some((c) => c.playable));
