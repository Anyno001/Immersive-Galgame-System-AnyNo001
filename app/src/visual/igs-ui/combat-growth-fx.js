import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { growthFxIdentity, growthItemText } from './combat-growth-fx-model.js';
import { normalizeCombatExpansionSettings } from './combat-settings.js';
import { prefersReducedMotion } from './reduced-motion.js';

// 成长演出的 DOM：挂在 #igs-fx-front，不拦截点击。同页重绘不重播；本页晚入库的条目只补播新的那几条。
const HOST_CLASS = 'igs-growth-fx';
const LIFE_MS = 3200;
const LIFE_PER_ITEM_MS = 600;
const states = new WeakMap();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const markOf = (item) => item.ids.join(',');

function clearState(state) {
    if (state.timer != null) { try { state.clear(state.timer); } catch (error) { /* 已触发 */ } }
    state.timer = null;
    state.node?.remove?.();
    state.node = null;
}

// plan 来自 planGrowthFx；options.reducedMotion 为真时静态显示；options.schedule / clear 可注入计时器。
export function applyGrowthFxToDom(root, plan, options = {}) {
    if (!root || !plan || !Array.isArray(plan.items) || !plan.items.length || !plan.identity) return { played: false, reason: 'empty' };
    const key = growthFxIdentity(plan.identity);
    const prev = states.get(root);
    const played = prev && prev.key === key ? prev.played : new Set();
    const fresh = plan.items.filter((item) => !played.has(markOf(item)));
    if (!fresh.length) return { played: false, reason: 'same-page' };
    const layers = ensureFxLayers(root);
    if (!layers || !layers.front) return { played: false, reason: 'no-layer' };
    const schedule = typeof options.schedule === 'function' ? options.schedule : (fn, ms) => setTimeout(fn, ms);
    const clear = typeof options.clear === 'function' ? options.clear : (id) => clearTimeout(id);
    const state = prev || { timer: null, node: null };
    clearState(state);
    Object.assign(state, { key, played, schedule, clear });
    for (const item of fresh) played.add(markOf(item));
    const node = layers.doc.createElement('div');
    node.className = `${HOST_CLASS}${options.reducedMotion === true ? ' is-reduced' : ''}`;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    const overflow = plan.overflow > 0 && !prev ? `<div class="igs-growth-fx-more">另有 ${plan.overflow} 项</div>` : '';
    node.innerHTML = fresh.map((item) => {
        const t = growthItemText(item);
        return `<div class="igs-growth-fx-item" data-growth-kind="${esc(item.kind)}"><span class="igs-growth-fx-cap">${esc(t.cap)}</span><span class="igs-growth-fx-line">${esc(t.line)}</span></div>`;
    }).join('') + overflow;
    layers.front.appendChild(node);
    state.node = node;
    state.timer = schedule(() => { state.timer = null; node.remove?.(); if (state.node === node) state.node = null; }, LIFE_MS + LIFE_PER_ITEM_MS * (fresh.length - 1));
    states.set(root, state);
    return { played: true, count: fresh.length };
}

export function cancelGrowthFx(root) {
    const state = root && states.get(root);
    if (state) { clearState(state); states.delete(root); }
    const layers = root ? findFxLayers(root) : null;
    for (const node of Array.from(layers?.front?.querySelectorAll?.(`.${HOST_CLASS}`) || [])) node.remove();
    return Boolean(state);
}

// 渲染适配：reader-dom-render 每次渲染调用一次。扩展关闭时只清理曾挂过的演出；NSFW、聊天页、卡片页不播。
export function renderGrowthFx(root, snapshot, ctx = {}) {
    if (!root || !snapshot) return { played: false, reason: 'empty' };
    const readerSettings = snapshot.readerSettings || {};
    const content = snapshot.content || {};
    if (!normalizeCombatExpansionSettings(readerSettings.combatExpansion).enabled) {
        if (states.has(root)) cancelGrowthFx(root);
        return { played: false, reason: 'disabled' };
    }
    const plan = content.fx && content.fx.growth;
    if (!plan || content.sceneNsfw === true || content.chatPage === true || content.htmlCardPage === true) return { played: false, reason: 'no-growth' };
    let reducedMotion = false;
    try { reducedMotion = typeof ctx.reducedMotion === 'function' ? ctx.reducedMotion() === true : prefersReducedMotion(); } catch (error) { reducedMotion = false; }
    return applyGrowthFxToDom(root, plan, { reducedMotion, schedule: ctx.schedule, clear: ctx.clear });
}

export const GROWTH_FX_STYLE_TEXT = `
.${HOST_CLASS}{position:absolute;left:50%;top:clamp(48px,14%,120px);z-index:4;display:flex;flex-direction:column;align-items:center;gap:6px;transform:translateX(-50%);pointer-events:none;}
.${HOST_CLASS} .igs-growth-fx-item{display:flex;align-items:baseline;gap:10px;padding:6px 36px;background:linear-gradient(90deg,transparent,rgba(8,9,14,.72) 20%,rgba(8,9,14,.72) 80%,transparent);color:#f4f1ea;text-shadow:0 1px 4px rgba(0,0,0,.75);animation:igs-growth-in .35s ease-out both;}
.${HOST_CLASS} .igs-growth-fx-cap{color:var(--igs-battle-accent,#ffcf5a);font-size:11px;font-weight:700;letter-spacing:.3em;}
.${HOST_CLASS} .igs-growth-fx-line{font-size:15px;letter-spacing:.1em;}
.${HOST_CLASS} [data-growth-kind="level"] .igs-growth-fx-line{font-size:20px;font-weight:700;}
.${HOST_CLASS} [data-growth-kind="pending"]{opacity:.75;}
.${HOST_CLASS} .igs-growth-fx-more{font-size:12px;opacity:.8;}
.${HOST_CLASS}.is-reduced .igs-growth-fx-item{animation:none;}
@keyframes igs-growth-in{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion: reduce){.${HOST_CLASS} .igs-growth-fx-item{animation:none;}}
`;
