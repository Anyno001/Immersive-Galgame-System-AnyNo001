// 结果展示组件的 DOM 层：卡片挂在 #igs-fx-front（对话层与选项之上）。
// 滚动数字预先整列写入 DOM，播放期只用 CSS 阶梯动画位移，不逐帧改写文本节点。
import { ensureFxLayers } from './fx-layer.js';
import { esc } from './reader-value-utils.js';
import { rollingFrames } from './fx-result-model.js';

const FADE_MS = 360;
// 结果定格后再停一小段才通知调用方继续（如发送输入），保证玩家看清结论。
const SETTLE_MS = 500;
const ROLL_FRAMES = 8;
const states = new WeakMap();

function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
}

function clear(root) {
    const state = states.get(root);
    if (!state) return;
    for (const timer of state.timers) {
        try { state.cancel(timer); } catch (error) { /* ignore */ }
    }
    removeNode(state.node);
    if (state.resolve) {
        const resolve = state.resolve;
        state.resolve = null;
        resolve(false);
    }
    states.delete(root);
}

export function cancelResultFx(root) {
    if (root) clear(root);
}

function reelHtml(reel, frames) {
    const count = frames.length;
    const style = count > 1
        ? `animation-timing-function:steps(${count - 1},end);--igs-fx-result-shift:${-(count - 1) * 1.2}em`
        : 'animation:none';
    const strip = frames.map((value) => `<span>${esc(value)}</span>`).join('');
    return `<div class="igs-fx-result-reel"><div class="igs-fx-result-label">${esc(reel.label)}</div>`
        + `<div class="igs-fx-result-window"><div class="igs-fx-result-strip" style="${style}">${strip}</div></div>`
        + `<div class="igs-fx-result-sub">${esc(reel.sub)}</div></div>`;
}

// 返回 { node, settled }：settled 在结论显示后 resolve(true)，被取消时 resolve(false)。
// plan 为空或舞台不可用时返回 null，调用方照常继续。
export function playResultFx(root, plan, options = {}) {
    if (!plan || !Array.isArray(plan.reels)) return null;
    const layers = ensureFxLayers(root);
    if (!layers || !layers.front) return null;
    clear(root);
    const reduced = options.reducedMotion === true;
    const rollMs = reduced ? 0 : Math.max(0, Number(plan.rollMs) || 0);
    const holdMs = Math.max(0, Number(plan.holdMs) || 0);
    const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms));
    const cancel = options.cancel || ((timer) => clearTimeout(timer));
    const random = options.random || Math.random;
    const reels = plan.reels
        .map((reel) => reelHtml(reel, rollMs > 0 ? rollingFrames(reel.value, ROLL_FRAMES, random) : [reel.value]))
        .join('');
    const node = layers.doc.createElement('div');
    node.className = `igs-fx-result is-${plan.tone || 'neutral'}${reduced ? ' is-reduced' : ''}`;
    node.setAttribute('data-igs-fx-result', String(plan.type || 'result'));
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-label', `${plan.title || ''} ${plan.verdict || ''}`.trim());
    if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty('--igs-fx-result-roll', `${rollMs}ms`);
    node.innerHTML = `<div class="igs-fx-result-title">${esc(plan.title)}</div>`
        + (reels ? `<div class="igs-fx-result-reels">${reels}</div>` : '')
        + `<div class="igs-fx-result-verdict">${esc(plan.verdict)}</div>`;
    layers.front.appendChild(node);
    const state = { node, timers: [], cancel, resolve: null };
    states.set(root, state);
    const settled = new Promise((resolve) => { state.resolve = resolve; });
    state.timers.push(schedule(() => {
        if (!state.resolve) return;
        const resolve = state.resolve;
        state.resolve = null;
        resolve(true);
    }, rollMs + (reduced ? 0 : SETTLE_MS)));
    state.timers.push(schedule(() => {
        node.className = `${node.className} is-leaving`;
    }, rollMs + holdMs));
    state.timers.push(schedule(() => {
        if (states.get(root) !== state) return;
        removeNode(node);
        states.delete(root);
    }, rollMs + holdMs + FADE_MS));
    return { node, settled };
}

export const RESULT_FX_STYLE_TEXT = `
.igs-fx-result{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);min-width:min(240px,70%);max-width:88%;box-sizing:border-box;padding:14px 22px 12px;border-radius:14px;background:rgba(18,18,24,.84);color:#fff;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.35);font-variant-numeric:tabular-nums;animation:igs-fx-result-in .22s ease-out both;}
.igs-fx-result.is-leaving{animation:igs-fx-result-out .36s ease-in forwards;}
.igs-fx-result-title{font-size:.9em;opacity:.82;margin-bottom:6px;}
.igs-fx-result-reels{display:flex;gap:22px;justify-content:center;}
.igs-fx-result-label,.igs-fx-result-sub{font-size:.75em;opacity:.72;}
.igs-fx-result-window{height:1.2em;line-height:1.2em;overflow:hidden;font-size:2.2em;font-weight:700;}
.igs-fx-result-strip{animation:igs-fx-result-roll var(--igs-fx-result-roll,0ms) forwards;}
.igs-fx-result-strip span{display:block;height:1.2em;}
.igs-fx-result-verdict{margin-top:8px;font-size:1.15em;font-weight:700;letter-spacing:.08em;animation:igs-fx-result-verdict .28s ease-out both;animation-delay:var(--igs-fx-result-roll,0ms);}
.igs-fx-result.is-crit .igs-fx-result-verdict{color:#ffd66b;}
.igs-fx-result.is-success .igs-fx-result-verdict{color:#8fe3a6;}
.igs-fx-result.is-fail .igs-fx-result-verdict{color:#ff9f9f;}
.igs-fx-result.is-fumble .igs-fx-result-verdict{color:#ff5c5c;}
.igs-fx-result.is-tie .igs-fx-result-verdict{color:#cfd6ff;}
@keyframes igs-fx-result-in{from{opacity:0;transform:translate(-50%,-44%) scale(.92);}to{opacity:1;transform:translate(-50%,-50%) scale(1);}}
@keyframes igs-fx-result-out{to{opacity:0;transform:translate(-50%,-56%);}}
@keyframes igs-fx-result-roll{from{transform:translateY(0);}to{transform:translateY(var(--igs-fx-result-shift,0));}}
@keyframes igs-fx-result-verdict{from{opacity:0;transform:scale(1.4);}to{opacity:1;transform:scale(1);}}
@media (prefers-reduced-motion: reduce){.igs-fx-result,.igs-fx-result.is-leaving,.igs-fx-result-strip,.igs-fx-result-verdict{animation:none!important;}}
`;
