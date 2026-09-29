// 获得物品演出 DOM 层：挂在 fx 前层（立绘之上、对话层之下）。
// 同一身份（消息|swipe|页）重绘不重播；图片后到只在身份仍一致时淡入替换占位；计时器统一回收。
// 流程：（重要物品先走中央大演出）→ 卡片逐张弹出 → 停留（鼠标悬停 / 点开详情时暂停）→ 退场。
// 退场按动作区分：获得的图标飞向 HUD 背包入口并让入口闪一下，失去下坠淡出，使用缩小消散。
import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { itemFxIdentity } from './fx-item-model.js';

const STACK_CLASS = 'igs-fx-item-stack';
const SHOWCASE_CLASS = 'igs-fx-item-showcase';
const FLYER_CLASS = 'igs-fx-item-flyer';
const STAGGER_MS = 420;
const LIFE_MS = 2600;
const RESUME_MS = 1400;
const LEAVE_MS = 420;
const LEAVE_STAGGER_MS = 90;
const FLY_MS = 620;
const PULSE_MS = 700;
const SHOWCASE_MS = 2600;
const SHOWCASE_OUT_MS = 320;
const IMAGE_FADE_MS = 420;
// 古代背景：容器挂 data-igs-era="ancient" 换宣纸卡 + 朱砂印；印文取动作单字。
const ERA_ATTR = 'data-igs-era';
const ANCIENT_SEALS = Object.freeze({ gain: '得', lose: '失', use: '用' });
// 背包入口按可见度依次回退：物品按钮 → 资料菜单箭头 → 整个 HUD；都不可见时原地淡出。
const BAG_TARGETS = ['#igs-status-hud [data-act="inventory"]', '#igs-status-hud .igs-hud-entry-arrow', '#igs-status-hud'];
// 只接受本地生成图的 data URL 与 Blob URL，其余一律按占位处理。
const SAFE_IMAGE_RE = /^(?:data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i;
const PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2M12 11v5M9.5 13.5h5"/></svg>';
const states = new WeakMap();

export function safeItemImageUrl(url) {
    const value = String(url || '');
    return SAFE_IMAGE_RE.test(value) ? value : '';
}

function getState(root, options) {
    let state = states.get(root);
    if (!state) {
        state = { key: '', timers: new Set(), stack: null, showcase: null, flyers: [], pulse: null, expire: null, paused: 0, leaving: false, layers: null, ancient: false };
        states.set(root, state);
    }
    state.schedule = typeof options.schedule === 'function' ? options.schedule : (fn, ms) => setTimeout(fn, ms);
    state.clear = typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer);
    return state;
}

function track(state, fn, ms) {
    const timer = state.schedule(() => { state.timers.delete(timer); fn(); }, ms);
    state.timers.add(timer);
    return timer;
}

function untrack(state, timer) {
    if (timer == null || !state.timers.has(timer)) return;
    state.clear(timer);
    state.timers.delete(timer);
}

function removeNode(node) {
    if (node && typeof node.remove === 'function') node.remove();
}

function clearState(state) {
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    removeNode(state.stack);
    removeNode(state.showcase);
    for (const flyer of state.flyers) removeNode(flyer);
    if (state.pulse && typeof state.pulse.removeAttribute === 'function') state.pulse.removeAttribute('data-igs-item-pulse');
    Object.assign(state, { stack: null, showcase: null, flyers: [], pulse: null, expire: null, paused: 0, leaving: false, layers: null, ancient: false });
}

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function setVar(node, name, value) {
    const style = node && node.style;
    if (!style || typeof style.setProperty !== 'function') return;
    if (value) style.setProperty(name, value);
    else if (typeof style.removeProperty === 'function') style.removeProperty(name);
}

function listen(node, type, handler) {
    if (node && typeof node.addEventListener === 'function') node.addEventListener(type, handler);
}

function rectOf(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

function fillIcon(doc, icon, imageUrl, name, { fade = false, state = null } = {}) {
    const url = safeItemImageUrl(imageUrl);
    if (!url) {
        while (icon.firstChild) icon.removeChild(icon.firstChild);
        icon.innerHTML = PLACEHOLDER_SVG;
        icon.setAttribute('data-igs-item-placeholder', '1');
        return false;
    }
    const img = doc.createElement('img');
    img.setAttribute('src', url);
    img.setAttribute('alt', name);
    img.setAttribute('decoding', 'async');
    icon.removeAttribute('data-igs-item-placeholder');
    if (fade && state) {
        // 后到的生图叠在占位上淡入，淡入结束后再移除占位，避免瞬间跳图。
        const stale = Array.from(icon.children || []);
        img.setAttribute('data-igs-item-fade', '1');
        icon.appendChild(img);
        track(state, () => { for (const node of stale) if (node.parentNode === icon) icon.removeChild(node); img.removeAttribute('data-igs-item-fade'); }, IMAGE_FADE_MS);
        return true;
    }
    while (icon.firstChild) icon.removeChild(icon.firstChild);
    icon.innerHTML = '';
    icon.appendChild(img);
    return true;
}

function buildIcon(doc, card, extraClass) {
    const icon = el(doc, 'div', extraClass ? `igs-fx-item-icon ${extraClass}` : 'igs-fx-item-icon');
    icon.setAttribute('data-igs-item-name', card.name);
    fillIcon(doc, icon, card.imageUrl, card.name);
    return icon;
}

function buildSeal(doc, card, extraClass) {
    const seal = el(doc, 'span', extraClass ? `igs-fx-item-seal ${extraClass}` : 'igs-fx-item-seal', ANCIENT_SEALS[card.action] || ANCIENT_SEALS.gain);
    seal.setAttribute('aria-hidden', 'true');
    return seal;
}

function buildCard(doc, card, ancient = false) {
    const node = el(doc, 'div', 'igs-fx-item-card');
    node.setAttribute('data-igs-item-action', card.action);
    node.setAttribute('data-igs-item-name', card.name);
    if (card.rare) node.setAttribute('data-igs-item-rare', '1');
    const body = el(doc, 'div', 'igs-fx-item-text');
    body.appendChild(el(doc, 'span', 'igs-fx-item-action', card.actionLabel));
    body.appendChild(el(doc, 'span', 'igs-fx-item-name', card.name));
    if (card.description) {
        body.appendChild(el(doc, 'span', 'igs-fx-item-desc', card.description));
        node.setAttribute('title', card.description);
    }
    node.appendChild(buildIcon(doc, card));
    node.appendChild(body);
    if (ancient) node.appendChild(buildSeal(doc, card));
    return node;
}

function buildShowcase(doc, card, ancient = false) {
    const node = el(doc, 'div', `${SHOWCASE_CLASS} igs-fx-transient`);
    node.setAttribute('data-igs-item-name', card.name);
    if (ancient) node.setAttribute(ERA_ATTR, 'ancient');
    node.setAttribute('role', 'status');
    node.appendChild(el(doc, 'div', 'igs-fx-item-showcase-rays'));
    const plate = el(doc, 'div', 'igs-fx-item-showcase-plate');
    plate.appendChild(buildIcon(doc, card, 'igs-fx-item-showcase-icon'));
    plate.appendChild(el(doc, 'span', 'igs-fx-item-showcase-label', `${card.actionLabel}了`));
    plate.appendChild(el(doc, 'span', 'igs-fx-item-showcase-name', card.name));
    if (card.description) plate.appendChild(el(doc, 'span', 'igs-fx-item-showcase-desc', card.description));
    if (ancient) plate.appendChild(buildSeal(doc, card, 'igs-fx-item-showcase-seal'));
    node.appendChild(plate);
    return node;
}

function findBagTarget(root) {
    for (const selector of BAG_TARGETS) {
        const node = typeof root.querySelector === 'function' ? root.querySelector(selector) : null;
        const rect = rectOf(node);
        if (rect) return { node, rect };
    }
    return null;
}

// 图标克隆成独立飞行节点：卡片本身照常淡出，飞行坐标换算到前层坐标系（舞台可能被整体缩放）。
function flyToBag(state, layers, card, target) {
    const icon = card.querySelector('.igs-fx-item-icon');
    const from = rectOf(icon);
    const frame = rectOf(layers.front);
    if (!from || !frame) return false;
    const scale = layers.front.offsetWidth > 0 ? frame.width / layers.front.offsetWidth : 1;
    const flyer = el(layers.doc, 'div', `${FLYER_CLASS} igs-fx-transient`);
    if (state.ancient) flyer.setAttribute(ERA_ATTR, 'ancient');
    const img = icon.querySelector('img');
    if (img) {
        const copy = layers.doc.createElement('img');
        copy.setAttribute('src', img.getAttribute('src') || '');
        copy.setAttribute('alt', '');
        flyer.appendChild(copy);
    } else {
        flyer.innerHTML = PLACEHOLDER_SVG;
    }
    const px = (value) => `${Math.round(value / scale)}px`;
    if (flyer.style) {
        flyer.style.left = px(from.left - frame.left);
        flyer.style.top = px(from.top - frame.top);
        flyer.style.width = px(from.width);
        flyer.style.height = px(from.height);
    }
    const dx = (target.rect.left + target.rect.width / 2) - (from.left + from.width / 2);
    const dy = (target.rect.top + target.rect.height / 2) - (from.top + from.height / 2);
    setVar(flyer, '--igs-item-fly-x', px(dx));
    setVar(flyer, '--igs-item-fly-y', px(dy));
    layers.front.appendChild(flyer);
    state.flyers.push(flyer);
    track(state, () => { removeNode(flyer); state.flyers = state.flyers.filter((node) => node !== flyer); }, FLY_MS);
    return true;
}

function pulseBag(state, target) {
    if (!target || !target.node || typeof target.node.setAttribute !== 'function') return;
    target.node.setAttribute('data-igs-item-pulse', '1');
    state.pulse = target.node;
    track(state, () => {
        if (state.pulse === target.node) { target.node.removeAttribute('data-igs-item-pulse'); state.pulse = null; }
    }, PULSE_MS);
}

function leave(state, root, layers, stack) {
    if (state.stack !== stack || state.leaving) return;
    state.leaving = true;
    state.expire = null;
    const cards = Array.from(stack.querySelectorAll('.igs-fx-item-card'));
    const target = cards.some((card) => card.getAttribute('data-igs-item-action') === 'gain') ? findBagTarget(root) : null;
    let flew = false;
    cards.forEach((card, index) => {
        track(state, () => {
            if (state.stack !== stack) return;
            const fly = target && card.getAttribute('data-igs-item-action') === 'gain' && flyToBag(state, layers, card, target);
            if (fly) flew = true;
            card.setAttribute('data-igs-leaving', fly ? 'fly' : '1');
        }, index * LEAVE_STAGGER_MS);
    });
    const more = stack.querySelector('.igs-fx-item-more');
    if (more) more.setAttribute('data-igs-leaving', '1');
    const leaveEnd = Math.max(0, cards.length - 1) * LEAVE_STAGGER_MS + LEAVE_MS;
    track(state, () => {
        if (state.stack !== stack) return;
        removeNode(stack);
        state.stack = null;
        state.leaving = false;
    }, leaveEnd);
    track(state, () => { if (flew) pulseBag(state, target); }, Math.max(leaveEnd, (cards.length - 1) * LEAVE_STAGGER_MS + FLY_MS));
}

function scheduleExpire(state, root, layers, stack, ms) {
    untrack(state, state.expire);
    state.expire = track(state, () => leave(state, root, layers, stack), ms);
}

// 鼠标悬停或点开详情时暂停倒计时；两者都解除后按 RESUME_MS 续上。触屏不触发悬停暂停。
function bindInteraction(state, root, layers, stack, card) {
    const pause = () => {
        if (state.stack !== stack || state.leaving) return;
        state.paused += 1;
        untrack(state, state.expire);
        state.expire = null;
    };
    const resume = () => {
        if (state.stack !== stack || state.leaving) return;
        state.paused = Math.max(0, state.paused - 1);
        if (!state.paused && state.expire == null) scheduleExpire(state, root, layers, stack, RESUME_MS);
    };
    let hovering = false;
    listen(card, 'pointerenter', (event) => { if (event.pointerType === 'mouse' && !hovering) { hovering = true; pause(); } });
    listen(card, 'pointerleave', () => { if (hovering) { hovering = false; resume(); } });
    listen(card, 'click', (event) => {
        // 卡片在前层、不在翻页点击层内；仍拦截冒泡，避免宿主页面把这次点击当成别的操作。
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        if (card.getAttribute('data-igs-item-expanded') === '1') {
            card.removeAttribute('data-igs-item-expanded');
            resume();
        } else {
            card.setAttribute('data-igs-item-expanded', '1');
            pause();
        }
    });
}

function runStack(state, root, layers, plan, options) {
    const { doc, front } = layers;
    const reduced = options.reducedMotion === true;
    const stack = el(doc, 'div', `${STACK_CLASS} igs-fx-transient`);
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    setVar(stack, '--igs-item-accent', options.accent);
    if (reduced) stack.setAttribute('data-igs-fx-static', '1');
    if (state.ancient) stack.setAttribute(ERA_ATTR, 'ancient');
    front.appendChild(stack);
    state.stack = stack;
    const onCard = typeof options.onCard === 'function' ? options.onCard : null;
    plan.cards.forEach((card, index) => {
        const show = () => {
            if (state.stack !== stack) return;
            const node = buildCard(doc, card, state.ancient);
            if (!reduced) bindInteraction(state, root, layers, stack, node);
            stack.appendChild(node);
            // 已在中央大演出播过音效的那件不重复发声。
            if (onCard && !reduced && card !== plan.showcase) { try { onCard(card); } catch (error) { /* 音效失败不影响演出 */ } }
        };
        if (reduced || index === 0) show();
        else track(state, show, index * STAGGER_MS);
    });
    if (plan.overflowText) {
        const more = () => { if (state.stack === stack) stack.appendChild(el(doc, 'div', 'igs-fx-item-more', plan.overflowText)); };
        if (reduced) more();
        else track(state, more, plan.cards.length * STAGGER_MS);
    }
    const life = Number(plan.lifeMs) > 0 ? Number(plan.lifeMs) : LIFE_MS;
    if (reduced) {
        track(state, () => { if (state.stack === stack) { removeNode(stack); state.stack = null; } }, life);
        return;
    }
    scheduleExpire(state, root, layers, stack, plan.cards.length * STAGGER_MS + life);
}

// 中央大演出：压暗舞台、放射光、大图标；点击可提前结束，结束后接着播卡片（该物品随卡片飞进背包）。
function runShowcase(state, root, layers, plan, options, next) {
    const node = buildShowcase(layers.doc, plan.showcase, state.ancient);
    setVar(node, '--igs-item-accent', options.accent);
    layers.front.appendChild(node);
    state.showcase = node;
    if (typeof options.onShowcase === 'function') { try { options.onShowcase(plan.showcase); } catch (error) { /* 音效失败不影响演出 */ } }
    let done = false;
    const finish = () => {
        if (done || state.showcase !== node) return;
        done = true;
        node.setAttribute('data-igs-leaving', '1');
        track(state, () => {
            if (state.showcase !== node) return;
            removeNode(node);
            state.showcase = null;
            next();
        }, SHOWCASE_OUT_MS);
    };
    listen(node, 'click', (event) => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        finish();
    });
    track(state, finish, SHOWCASE_MS);
}

// plan 来自 planItemFx；options.reducedMotion 为真时一次性静态显示（不播大演出、不飞行）；
// options.onCard(card) / options.onShowcase(card) 供音效挂接；options.accent 为主题强调色；options.ancient 为真时换古代宣纸皮。
export function applyItemFxToDom(root, plan, options = {}) {
    if (!root || !plan || !Array.isArray(plan.cards) || !plan.cards.length || !plan.identity) return { played: false, reason: 'empty' };
    const key = itemFxIdentity(plan.identity);
    const existing = states.get(root);
    if (existing && existing.key === key) return { played: false, reason: 'same-page' };
    const layers = ensureFxLayers(root);
    if (!layers || !layers.front) return { played: false, reason: 'no-layer' };
    const state = getState(root, options);
    clearState(state);
    state.key = key;
    state.layers = layers;
    state.ancient = options.ancient === true;
    const reduced = options.reducedMotion === true;
    const start = () => runStack(state, root, layers, plan, options);
    if (plan.showcase && !reduced) runShowcase(state, root, layers, plan, options, start);
    else start();
    return { played: true, count: plan.cards.length, showcase: Boolean(plan.showcase && !reduced) };
}

// 图片后到：身份仍一致才替换占位（卡片与中央大演出都算），已翻页或已换 swipe 时不写回。
export function refreshItemFxImages(root, identity, resolveImage) {
    const state = root && states.get(root);
    if (!state || (!state.stack && !state.showcase) || !identity || state.key !== itemFxIdentity(identity)) return 0;
    const doc = root.ownerDocument;
    let replaced = 0;
    const icons = [state.showcase, state.stack].filter(Boolean).flatMap((host) => Array.from(host.querySelectorAll('.igs-fx-item-icon')));
    for (const icon of icons) {
        if (icon.getAttribute('data-igs-item-placeholder') !== '1') continue;
        const name = icon.getAttribute('data-igs-item-name') || '';
        let url = '';
        try { url = typeof resolveImage === 'function' ? resolveImage(name) : ''; } catch (error) { url = ''; }
        if (!safeItemImageUrl(url)) continue;
        if (fillIcon(doc, icon, url, name, { fade: true, state })) replaced += 1;
    }
    return replaced;
}

// 翻到没有物品的页时调用：若卡片仍因悬停 / 点开详情而暂停，收起详情并按 RESUME_MS 退场，不让它跨页常驻。
export function settleItemFx(root, identity) {
    const state = root && states.get(root);
    if (!state || !state.stack || !state.layers || state.leaving || !identity || state.key === itemFxIdentity(identity)) return false;
    if (!state.paused) return false;
    state.paused = 0;
    for (const card of Array.from(state.stack.querySelectorAll('.igs-fx-item-card'))) card.removeAttribute('data-igs-item-expanded');
    scheduleExpire(state, root, state.layers, state.stack, RESUME_MS);
    return true;
}

export function cancelItemFx(root) {
    const state = root && states.get(root);
    if (state) { clearState(state); states.delete(root); }
    const layers = root ? findFxLayers(root) : null;
    if (layers && layers.front) {
        for (const node of Array.from(layers.front.querySelectorAll(`.${STACK_CLASS}, .${SHOWCASE_CLASS}, .${FLYER_CLASS}`))) node.remove();
    }
    return Boolean(state);
}

// 颜色走变量：--igs-item-bg / --igs-item-ink / --igs-item-accent，对话框皮肤在 dialog-theme-hud 里按 HUD 面板换装。
export const ITEM_FX_STYLE_TEXT = `
.igs-fx-item-stack{--igs-item-accent-c:var(--igs-item-accent,#ffcf5a);position:absolute;right:clamp(12px,4%,36px);top:clamp(56px,12%,96px);display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;z-index:3;}
.igs-fx-item-card{position:relative;display:flex;align-items:center;gap:10px;max-width:min(320px,70vw);padding:8px 14px 8px 12px;border-radius:12px;background:var(--igs-item-bg,rgba(18,18,22,.8));color:var(--igs-item-ink,#fff);box-shadow:0 4px 16px rgba(0,0,0,.35);overflow:hidden;pointer-events:auto;cursor:pointer;animation:igs-fx-item-in .36s cubic-bezier(.2,.9,.3,1.2) both;}
.igs-fx-item-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--igs-item-accent-c);}
.igs-fx-item-card[data-igs-item-action="lose"]::before{background:#8a8f99;}
.igs-fx-item-card[data-igs-item-action="use"]::before{background:color-mix(in oklab,var(--igs-item-accent-c) 45%,#7fd3ff);}
.igs-fx-item-card[data-igs-item-rare]{box-shadow:0 0 0 1.5px var(--igs-item-accent-c),0 0 18px color-mix(in srgb,var(--igs-item-accent-c) 55%,transparent),0 4px 16px rgba(0,0,0,.35);}
.igs-fx-item-icon{position:relative;flex:none;width:52px;height:52px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);color:currentColor;overflow:hidden;}
.igs-fx-item-icon img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}
.igs-fx-item-icon img[data-igs-item-fade]{animation:igs-fx-item-img-in .42s ease-out both;}
.igs-fx-item-icon[data-igs-item-placeholder]{padding:10px;box-sizing:border-box;opacity:.75;}
.igs-fx-item-text{display:flex;flex-direction:column;min-width:0;line-height:1.35;}
.igs-fx-item-action{font-size:11px;opacity:.7;}
.igs-fx-item-name{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-fx-item-desc{font-size:12px;opacity:.8;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
.igs-fx-item-card[data-igs-item-expanded] .igs-fx-item-desc{display:block;-webkit-line-clamp:unset;}
.igs-fx-item-card[data-igs-item-expanded] .igs-fx-item-name{white-space:normal;}
.igs-fx-item-more{font-size:12px;color:var(--igs-item-ink,#fff);padding:2px 10px;border-radius:999px;background:var(--igs-item-bg,rgba(18,18,22,.6));animation:igs-fx-item-in .36s ease-out both;}
/* 获得：图标弹跳放大 + 高光扫过 */
.igs-fx-item-card[data-igs-item-action="gain"] .igs-fx-item-icon{animation:igs-fx-item-pop .5s cubic-bezier(.2,.9,.3,1.4) .08s both;}
.igs-fx-item-card[data-igs-item-action="gain"] .igs-fx-item-icon::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.7) 48%,transparent 66%);transform:translateX(-120%);animation:igs-fx-item-shine .7s ease-out .3s both;pointer-events:none;}
/* 失去：整卡褪色、名称划掉、图标抖动后下坠变淡 */
.igs-fx-item-card[data-igs-item-action="lose"]{filter:grayscale(.85);}
.igs-fx-item-card[data-igs-item-action="lose"] .igs-fx-item-name{text-decoration:line-through;text-decoration-thickness:1.5px;}
.igs-fx-item-card[data-igs-item-action="lose"] .igs-fx-item-icon{animation:igs-fx-item-crack .7s ease-in .15s both;}
/* 使用：图标脉冲光环后缩小消耗 */
.igs-fx-item-card[data-igs-item-action="use"] .igs-fx-item-icon{animation:igs-fx-item-consume .9s ease-in-out .1s both;}
.igs-fx-item-card[data-igs-item-action="use"] .igs-fx-item-icon::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 2px var(--igs-item-accent-c);animation:igs-fx-item-ring .7s ease-out .1s both;pointer-events:none;}
/* 退场 */
.igs-fx-item-card[data-igs-leaving],.igs-fx-item-more[data-igs-leaving]{pointer-events:none;animation:igs-fx-item-out .42s ease-in both;}
.igs-fx-item-card[data-igs-leaving="fly"] .igs-fx-item-icon{visibility:hidden;}
.igs-fx-item-card[data-igs-item-action="lose"][data-igs-leaving]{animation-name:igs-fx-item-out-drop;}
.igs-fx-item-card[data-igs-item-action="use"][data-igs-leaving]{animation-name:igs-fx-item-out-shrink;}
.igs-fx-item-flyer{position:absolute;z-index:4;border-radius:8px;overflow:hidden;pointer-events:none;color:var(--igs-item-ink,#fff);box-shadow:0 0 14px color-mix(in srgb,var(--igs-item-accent,#ffcf5a) 70%,transparent);animation:igs-fx-item-fly .62s cubic-bezier(.5,0,.75,.4) both;}
.igs-fx-item-flyer img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}
.igs-fx-item-flyer svg{width:100%;height:100%;padding:10px;box-sizing:border-box;}
#igs-status-hud [data-igs-item-pulse]{animation:igs-fx-item-bag .7s ease-out both;}
/* 重要物品：中央大演出 */
.igs-fx-item-showcase{--igs-item-accent-c:var(--igs-item-accent,#ffcf5a);position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 46%,rgba(0,0,0,.25),rgba(0,0,0,.72));pointer-events:auto;cursor:pointer;animation:igs-fx-item-fade-in .32s ease-out both;}
.igs-fx-item-showcase[data-igs-leaving]{animation:igs-fx-item-fade-out .32s ease-in both;}
.igs-fx-item-showcase-rays{position:absolute;left:50%;top:44%;width:min(140vmin,1100px);aspect-ratio:1;margin:calc(min(140vmin,1100px) / -2) 0 0 calc(min(140vmin,1100px) / -2);background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--igs-item-accent-c) 38%,transparent) 0 6deg,transparent 6deg 18deg);-webkit-mask:radial-gradient(circle,#000 8%,transparent 62%);mask:radial-gradient(circle,#000 8%,transparent 62%);animation:igs-fx-item-rays 9s linear infinite;}
.igs-fx-item-showcase-plate{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(420px,82%);padding:18px 26px 16px;border-radius:16px;background:var(--igs-item-bg,rgba(18,18,22,.82));color:var(--igs-item-ink,#fff);box-shadow:0 0 0 2px var(--igs-item-accent-c),0 0 40px color-mix(in srgb,var(--igs-item-accent-c) 50%,transparent);text-align:center;animation:igs-fx-item-plate .56s cubic-bezier(.2,.9,.3,1.3) .06s both;}
.igs-fx-item-showcase-icon{width:min(34vmin,180px);height:min(34vmin,180px);border-radius:14px;margin-top:calc(min(34vmin,180px) * -.45);background:radial-gradient(circle,color-mix(in srgb,var(--igs-item-accent-c) 35%,transparent),transparent 70%);animation:igs-fx-item-pop .6s cubic-bezier(.2,.9,.3,1.4) .18s both;}
.igs-fx-item-showcase-icon::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.75) 48%,transparent 66%);transform:translateX(-120%);animation:igs-fx-item-shine .8s ease-out .6s both;pointer-events:none;}
.igs-fx-item-showcase-label{font-size:13px;letter-spacing:.3em;color:var(--igs-item-accent-c);}
.igs-fx-item-showcase-name{font-size:22px;font-weight:700;letter-spacing:.06em;}
.igs-fx-item-showcase-desc{font-size:13px;opacity:.82;line-height:1.5;}
.igs-fx-item-stack[data-igs-fx-static] .igs-fx-item-card,.igs-fx-item-stack[data-igs-fx-static] .igs-fx-item-card *,.igs-fx-item-stack[data-igs-fx-static] .igs-fx-item-card *::after,.igs-fx-item-stack[data-igs-fx-static] .igs-fx-item-more{animation:none!important;}
.igs-fx-item-stack[data-igs-fx-static] .igs-fx-item-card{pointer-events:none;}
/* 古代背景：宣纸卡 + 朱砂双线框 + 楷体 + 方形朱印（印文为动作单字）；:not(#igs-era-x) 抬高优先级，压过对话框皮肤的换装 */
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x),.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x){--igs-item-accent-c:#b8452f;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-card{gap:10px;padding:8px 10px 8px 10px;border:1px solid #b8452f;border-radius:2px;outline:none;background:radial-gradient(ellipse at 18% 0%,rgba(255,255,255,.55),transparent 62%),repeating-linear-gradient(90deg,rgba(120,70,30,.035) 0 1px,transparent 1px 5px),#f6ecd4;color:#2b1d12;text-shadow:none;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;box-shadow:inset 0 0 0 2px #f6ecd4,inset 0 0 0 3px rgba(184,69,47,.55),0 3px 10px rgba(40,20,5,.35);-webkit-backdrop-filter:none;backdrop-filter:none;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-card::before{display:none;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-card[data-igs-item-rare]{outline:1px solid rgba(184,69,47,.6);outline-offset:2px;box-shadow:inset 0 0 0 2px #f6ecd4,inset 0 0 0 3px rgba(184,69,47,.55),0 0 14px rgba(184,69,47,.35),0 3px 10px rgba(40,20,5,.35);}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-icon{border-radius:2px;background:rgba(120,70,30,.07);box-shadow:inset 0 0 0 1px rgba(120,70,30,.35);color:#7a2a1a;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-icon[data-igs-item-placeholder],.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-icon[data-igs-item-placeholder]{background:rgba(120,70,30,.07);box-shadow:inset 0 0 0 1px rgba(120,70,30,.35);color:#7a2a1a;opacity:.85;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-action{display:none;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-name{color:#2b1d12;font-size:16px;letter-spacing:.04em;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-desc{color:#6b5139;opacity:1;}
.igs-fx-item-seal{flex:none;align-self:flex-start;display:flex;align-items:center;justify-content:center;width:24px;height:24px;margin-left:auto;border-radius:3px;background:#b8452f;color:#f6ecd4;box-shadow:inset 0 0 0 1.5px #b8452f,inset 0 0 0 2.5px rgba(246,236,212,.85);font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;font-size:15px;font-weight:700;line-height:1;transform:rotate(-6deg);opacity:.92;}
.igs-fx-item-card[data-igs-item-action="lose"] .igs-fx-item-seal{background:#8a5a4a;box-shadow:inset 0 0 0 1.5px #8a5a4a,inset 0 0 0 2.5px rgba(246,236,212,.85);}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-card[data-igs-item-action="lose"]{filter:grayscale(.45) sepia(.2);}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-card:not([data-igs-leaving]) .igs-fx-item-seal{animation:igs-fx-item-stamp .42s cubic-bezier(.3,1.4,.5,1) .28s both;}
.igs-fx-item-stack[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-more{border:1px solid rgba(120,70,30,.35);border-radius:2px;background:#f6ecd4;color:#7a2a1a;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
.igs-fx-item-flyer[data-igs-era="ancient"]{border-radius:2px;color:#7a2a1a;background:#f6ecd4;box-shadow:0 0 0 1px #b8452f,0 0 12px rgba(184,69,47,.45);}
/* 古代背景重要物品：卷轴式宣纸长卷（上下木轴）+ 大印；放射光换成淡金 */
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-rays{background:repeating-conic-gradient(from 0deg,rgba(232,196,120,.28) 0 6deg,transparent 6deg 18deg);}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-plate{min-width:min(240px,70%);padding:22px 34px 22px;border:0;border-radius:0;outline:none;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.55),transparent 65%),repeating-linear-gradient(90deg,rgba(120,70,30,.035) 0 1px,transparent 1px 5px),#f6ecd4;color:#2b1d12;text-shadow:none;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;box-shadow:inset 0 0 0 6px #f6ecd4,inset 0 0 0 7px rgba(184,69,47,.6),inset 0 0 0 10px #f6ecd4,inset 0 0 0 11px rgba(184,69,47,.35),0 10px 30px rgba(20,10,0,.55);-webkit-backdrop-filter:none;backdrop-filter:none;}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-plate::before,.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-plate::after{content:"";position:absolute;left:-14px;right:-14px;height:12px;border-radius:6px;background:linear-gradient(180deg,#8a5a34,#4a2c17 55%,#2e1a0c);box-shadow:0 2px 4px rgba(0,0,0,.4);}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-plate::before{top:-8px;}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-plate::after{bottom:-8px;}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-icon{border-radius:4px;margin-top:4px;width:min(26vmin,140px);height:min(26vmin,140px);background:radial-gradient(circle,rgba(232,196,120,.35),transparent 70%);}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-label{color:#7a2a1a;letter-spacing:.4em;}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-name{color:#2b1d12;font-size:26px;letter-spacing:.12em;}
.igs-fx-item-showcase[data-igs-era="ancient"]:not(#igs-era-x) .igs-fx-item-showcase-desc{color:#6b5139;opacity:1;}
.igs-fx-item-showcase-seal{position:absolute;right:16px;bottom:18px;width:40px;height:40px;margin:0;font-size:26px;border-radius:4px;box-shadow:inset 0 0 0 2px #b8452f,inset 0 0 0 4px rgba(246,236,212,.85);animation:igs-fx-item-stamp .5s cubic-bezier(.3,1.4,.5,1) .7s both;}
@keyframes igs-fx-item-stamp{0%{opacity:0;transform:scale(1.8) rotate(-6deg);}100%{opacity:.92;transform:scale(1) rotate(-6deg);}}
@keyframes igs-fx-item-in{from{opacity:0;transform:translateX(28px) scale(.96);}to{opacity:1;transform:none;}}
@keyframes igs-fx-item-out{to{opacity:0;transform:translateX(18px);}}
@keyframes igs-fx-item-out-drop{to{opacity:0;transform:translateY(14px) rotate(-2deg);}}
@keyframes igs-fx-item-out-shrink{to{opacity:0;transform:scale(.86);}}
@keyframes igs-fx-item-pop{0%{transform:scale(.55);opacity:0;}60%{transform:scale(1.14);opacity:1;}100%{transform:scale(1);}}
@keyframes igs-fx-item-shine{to{transform:translateX(120%);}}
@keyframes igs-fx-item-crack{0%,100%{transform:none;}12%{transform:translateX(-3px) rotate(-4deg);}24%{transform:translateX(3px) rotate(4deg);}36%{transform:translateX(-2px) rotate(-2deg);}60%{transform:translateY(0);opacity:1;}100%{transform:translateY(6px) scale(.9);opacity:.4;}}
@keyframes igs-fx-item-consume{0%{transform:scale(1);}30%{transform:scale(1.12);}100%{transform:scale(.78);opacity:.5;}}
@keyframes igs-fx-item-ring{0%{opacity:.9;transform:scale(1);}100%{opacity:0;transform:scale(1.5);}}
@keyframes igs-fx-item-img-in{from{opacity:0;transform:scale(.9);}to{opacity:1;transform:none;}}
@keyframes igs-fx-item-fly{0%{transform:none;opacity:1;}55%{transform:translate(calc(var(--igs-item-fly-x,0px) * .5),calc(var(--igs-item-fly-y,0px) * .5 - 36px)) scale(.8);opacity:1;}100%{transform:translate(var(--igs-item-fly-x,0px),var(--igs-item-fly-y,0px)) scale(.28);opacity:.2;}}
@keyframes igs-fx-item-bag{0%{transform:scale(1);filter:none;}35%{transform:scale(1.25);filter:drop-shadow(0 0 6px var(--igs-item-accent,#ffcf5a));}100%{transform:scale(1);filter:none;}}
@keyframes igs-fx-item-fade-in{from{opacity:0;}to{opacity:1;}}
@keyframes igs-fx-item-fade-out{to{opacity:0;}}
@keyframes igs-fx-item-plate{0%{opacity:0;transform:translateY(24px) scale(.8);}100%{opacity:1;transform:none;}}
@keyframes igs-fx-item-rays{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.igs-fx-item-card,.igs-fx-item-card *,.igs-fx-item-card *::after,.igs-fx-item-showcase,.igs-fx-item-showcase *,.igs-fx-item-flyer{animation:none!important;}}
`;
