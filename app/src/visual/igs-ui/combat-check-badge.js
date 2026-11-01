import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { normalizeCombatExpansionSettings } from './combat-settings.js';
import { prefersReducedMotion } from './reduced-motion.js';

// 正文 d20 判定徽记（v3 §3.9）：只显示 scene/check-rolls.js 的复算结果，挂在 #igs-fx-front，不拦截点击。
// 本页显示期间常驻，同页重绘不重建；换页或本页没有判定时撤下。
const HOST_CLASS = 'igs-check-badge';
const states = new WeakMap();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// 判定按页归位：与成长标签同规则，下标落在 (上一页偏移, 本页偏移] 内归本页，落在最后一页偏移之后归最后一个有效页。
export function checksByPage(results, offsets) {
    const list = Array.isArray(offsets) ? offsets : [];
    const pages = list.map(() => []);
    let last = -1;
    for (let i = 0; i < list.length; i += 1) if (Number.isFinite(Number(list[i])) && Number(list[i]) >= 0) last = i;
    for (const r of Array.isArray(results) ? results : []) {
        let prev = -1;
        let placed = false;
        for (let i = 0; i < list.length; i += 1) {
            const at = Number(list[i]);
            if (Number.isFinite(at) && at >= 0) {
                if (r.index > prev && r.index <= at) { pages[i].push(r); placed = true; break; }
                prev = at;
            }
        }
        if (!placed && last >= 0) pages[last].push(r);
    }
    return pages;
}

export function checkBadgeText(r) {
    return { cap: `${r.label}检定 · DC ${r.dc}`, line: `${r.actor} ${r.die}${signed(r.bonus)}=${r.total}`, tier: r.tier };
}

function clearState(state) {
    state?.node?.remove?.();
    if (state) state.node = null;
}

// plan = { items: 复算结果[], identity: 字符串 }；options.reducedMotion 为真时不做入场动画。
export function applyCheckBadgesToDom(root, plan, options = {}) {
    if (!root || !plan || !Array.isArray(plan.items) || !plan.items.length || !plan.identity) return { shown: false, reason: 'empty' };
    const prev = states.get(root);
    if (prev && prev.key === plan.identity && prev.node) return { shown: false, reason: 'same-page' };
    const layers = ensureFxLayers(root);
    if (!layers || !layers.front) return { shown: false, reason: 'no-layer' };
    clearState(prev);
    const node = layers.doc.createElement('div');
    node.className = `${HOST_CLASS}${options.reducedMotion === true ? ' is-reduced' : ''}`;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = plan.items.map((r) => {
        const t = checkBadgeText(r);
        const kind = r.tier === '大成功' ? 'crit' : r.tier === '大失败' ? 'fumble' : r.success ? 'pass' : 'fail';
        return `<div class="igs-check-badge-item" data-check-result="${kind}"><span class="igs-check-badge-cap">${esc(t.cap)}</span><span class="igs-check-badge-line">${esc(t.line)}</span><span class="igs-check-badge-tier">${esc(t.tier)}</span></div>`;
    }).join('');
    layers.front.appendChild(node);
    states.set(root, { key: plan.identity, node });
    return { shown: true, count: plan.items.length };
}

export function cancelCheckBadges(root) {
    const state = root && states.get(root);
    if (state) { clearState(state); states.delete(root); }
    const layers = root ? findFxLayers(root) : null;
    for (const node of Array.from(layers?.front?.querySelectorAll?.(`.${HOST_CLASS}`) || [])) node.remove();
    return Boolean(state);
}

// 渲染适配：reader-dom-render 每次渲染调用一次。扩展关闭、本页没有判定、NSFW / 聊天页 / 卡片页时撤下。
export function renderCheckBadges(root, snapshot, ctx = {}) {
    if (!root || !snapshot) return { shown: false, reason: 'empty' };
    const readerSettings = snapshot.readerSettings || {};
    const content = snapshot.content || {};
    const plan = content.fx && content.fx.checks;
    const off = !normalizeCombatExpansionSettings(readerSettings.combatExpansion).enabled;
    if (off || !plan || content.sceneNsfw === true || content.chatPage === true || content.htmlCardPage === true) {
        if (states.has(root)) cancelCheckBadges(root);
        return { shown: false, reason: off ? 'disabled' : 'no-checks' };
    }
    let reducedMotion = false;
    try { reducedMotion = typeof ctx.reducedMotion === 'function' ? ctx.reducedMotion() === true : prefersReducedMotion(); } catch (error) { reducedMotion = false; }
    return applyCheckBadgesToDom(root, plan, { reducedMotion });
}

export const CHECK_BADGE_STYLE_TEXT = `
.${HOST_CLASS}{position:absolute;right:clamp(10px,3%,32px);top:clamp(40px,10%,96px);z-index:4;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none;}
.${HOST_CLASS} .igs-check-badge-item{display:flex;align-items:baseline;gap:8px;padding:4px 14px 4px 24px;background:linear-gradient(90deg,transparent,rgba(8,9,14,.72) 24%);color:#f4f1ea;text-shadow:0 1px 3px rgba(0,0,0,.75);animation:igs-check-in .3s ease-out both;}
.${HOST_CLASS} .igs-check-badge-cap{font-size:11px;letter-spacing:.12em;opacity:.8;}
.${HOST_CLASS} .igs-check-badge-line{font-size:13px;font-variant-numeric:tabular-nums;}
.${HOST_CLASS} .igs-check-badge-tier{font-size:14px;font-weight:700;letter-spacing:.1em;}
.${HOST_CLASS} [data-check-result="pass"] .igs-check-badge-tier{color:#8fe3c4;}
.${HOST_CLASS} [data-check-result="fail"] .igs-check-badge-tier{color:#c9c4bb;}
.${HOST_CLASS} [data-check-result="crit"] .igs-check-badge-tier{color:#ffcf5a;}
.${HOST_CLASS} [data-check-result="fumble"] .igs-check-badge-tier{color:#ff7a6b;}
.${HOST_CLASS}.is-reduced .igs-check-badge-item{animation:none;}
@keyframes igs-check-in{from{opacity:0;transform:translateX(8px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion: reduce){.${HOST_CLASS} .igs-check-badge-item{animation:none;}}
`;
