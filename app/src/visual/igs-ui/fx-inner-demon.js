// 心魔 / 与自己对话：本人的黑影。黑影是本体当前立绘的复刻（跟随服装与表情），压暗、由实到虚渐变消隐、左右翻转，站在本体对侧。
// 不画任何图形；样式见文件末尾的 INNER_DEMON_STYLE_TEXT。进退规则见 scene/inner-demon.js 的 stepInnerDemon。
import { layerStyle } from './stage-snapshot.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { createDemonState, demonOffset, parseInnerDemonName, resolveDemonOwner, spriteCenter, stepInnerDemon } from '../../scene/inner-demon.js';

const states = new WeakMap();
const ENTER_DELAY_MS = 30;
export const DEMON_LEAVE_MS = Object.freeze({ drift: 1300, reduced: 450 });

const text = (value) => String(value == null ? '' : value).trim();

function stateOf(root, options = {}) {
    let state = states.get(root);
    if (!state) {
        state = { demon: createDemonState(), look: new Map(), node: null, sprite: null, sig: '', timers: new Set(), pending: null };
        states.set(root, state);
    }
    state.schedule = typeof options.schedule === 'function' ? options.schedule : (fn, ms) => setTimeout(fn, ms);
    state.clear = typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer);
    return state;
}

function later(state, fn, ms) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, ms);
    state.timers.add(timer);
    return timer;
}

function pickLayer(el) {
    if (!el || !el.style) return null;
    const image = el.style.backgroundImage || '';
    if (!image || el.style.display === 'none') return null;
    const flip = typeof el.hasAttribute === 'function' && (el.hasAttribute('data-igs-cast-flip') || el.hasAttribute('data-igs-sprite-flip'));
    return { image, size: el.style.backgroundSize || '', position: el.style.backgroundPosition || '', flip };
}

// 本体当前立绘：说话人立绘节点只在它就是本体时才采信，否则在同屏陪衬里按名字找。
function readBodyLayer(root, body, spriteKey) {
    if (spriteKey && spriteKey === body) return pickLayer(root.querySelector('#igs-sprite'));
    const hit = Array.from(root.querySelectorAll('.igs-cast-sprite')).find((el) => el.getAttribute('data-igs-cast-char') === body);
    return hit ? pickLayer(hit) : null;
}

const layerSig = (layer) => `${layer.image}|${layer.size}|${layer.position}|${layer.flip ? 1 : 0}`;

function spriteStyle(layer) {
    // 与本体相反的朝向：本体翻转过就翻回来。
    const parts = ['position:absolute', 'inset:0', 'background-repeat:no-repeat', 'pointer-events:none', layerStyle({ ...layer, flip: !layer.flip })];
    return parts.filter(Boolean).join(';').replace(/&quot;/g, '"');
}

function build(doc, layer, { reduced }) {
    const node = doc.createElement('div');
    node.className = `igs-demon is-pending${reduced ? ' is-reduced' : ''}`;
    node.setAttribute('aria-hidden', 'true');
    const float = doc.createElement('div');
    float.className = 'igs-demon-float';
    const sprite = doc.createElement('div');
    sprite.className = 'igs-demon-sprite';
    sprite.setAttribute('style', spriteStyle(layer));
    float.appendChild(sprite);
    node.appendChild(float);
    return { node, sprite };
}

function setDx(node, layer) {
    const dx = demonOffset(spriteCenter(layer.position, layer.size));
    if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty('--igs-demon-dx', `${dx}%`);
}

function removeNode(state) {
    if (state.node && state.node.parentNode) state.node.parentNode.removeChild(state.node);
    state.node = null;
    state.sprite = null;
    state.sig = '';
}

function leave(state, root, reduced) {
    const node = state.node;
    if (!node) return;
    node.classList.remove('is-on', 'is-lit', 'is-pending');
    node.classList.add('is-leaving');
    state.node = null;
    state.sprite = null;
    state.sig = '';
    later(state, () => { if (node.parentNode) node.parentNode.removeChild(node); }, reduced ? DEMON_LEAVE_MS.reduced : DEMON_LEAVE_MS.drift);
}

function setTurn(root, turn) {
    if (turn) root.setAttribute('data-igs-demon-turn', turn);
    else root.removeAttribute('data-igs-demon-turn');
}

export function cancelInnerDemon(root) {
    const state = root && states.get(root);
    if (!state) return false;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    removeNode(state);
    for (const el of Array.from(root.querySelectorAll ? root.querySelectorAll('.igs-demon') : [])) el.remove();
    setTurn(root, '');
    states.delete(root);
    return true;
}

function knownOf(assets) {
    const aliases = assets.characterAliases && typeof assets.characterAliases === 'object' ? assets.characterAliases : {};
    return Object.keys(assets.characters || {}).map((key) => ({ key, names: Array.isArray(aliases[key]) ? aliases[key] : [] }));
}

// 每次渲染调用（同页重复调用幂等）。返回播放过的路线名数组，供 applyFxToDom 汇总。
export function playInnerDemon(ctx, settings) {
    const { snapshot, options, root, layers, reduced, plan, state: runtime } = ctx;
    if (!settings || settings.enabled !== true) return cancelInnerDemon(root) ? ['demon:off'] : [];
    const content = (snapshot && snapshot.content) || {};
    const state = stateOf(root, { schedule: runtime && runtime.schedule, clear: runtime && runtime.clear });
    const reader = (snapshot && snapshot.readerSettings) || {};
    const assets = reader._sceneAssets || {};
    // 聊天页、卡片页与 NSFW 页不演：在场的黑影收掉。
    if (content.chatPage === true || content.htmlCardPage === true || content.sceneNsfw === true) {
        if (state.demon.active) {
            state.demon = { ...state.demon, active: false, body: '', quiet: 0, turn: '' };
            leave(state, root, reduced);
            setTurn(root, '');
            return ['demon:leave'];
        }
        return [];
    }
    const known = knownOf(assets);
    const keyOf = (name) => resolveCharacterKey(assets.characters || {}, assets.characterAliases, name) || '';
    const speakerName = text(content.speaker);
    const parsed = parseInnerDemonName(speakerName, known);
    const userName = text(options && options.userName);
    const spriteKey = text(content.spriteCharacter) ? keyOf(content.spriteCharacter) || text(content.spriteCharacter) : '';
    // 阅读器已把心魔页的立绘解析到本体（reader-floor-plan），两边按同一规则算；这里取不到时以页面立绘角色为准。
    const owner = parsed ? resolveDemonOwner(parsed, { known, lastBody: state.demon.lastBody, userNames: userName ? [userName] : [] }) || spriteKey : '';
    const speaker = parsed ? '' : (speakerName ? keyOf(speakerName) || speakerName : '');
    const step = stepInnerDemon(state.demon, { pageKey: plan.pageKey, scene: text(content.sceneLocation), parsed, owner, speaker });
    state.demon = step.state;
    // 缓存本体当前立绘外观：本体在场时读 DOM，本体不在台上（只剩心魔台词页）时沿用上一次。
    const watch = owner || (!parsed && speaker) || state.demon.body;
    if (watch) {
        const trust = !parsed && speaker ? (spriteKey || speaker) : spriteKey;
        const layer = readBodyLayer(root, watch, trust);
        if (layer) state.look.set(watch, layer);
    }
    if (step.action === 'keep' && !step.state.active && !state.node) { setTurn(root, ''); return []; }
    const played = [];
    if (step.action === 'leave') {
        leave(state, root, reduced);
        played.push('demon:leave');
    } else if (step.state.active && (step.action === 'enter' || step.action === 'switch' || !state.node)) {
        const layer = state.look.get(step.state.body);
        if (layer && layers && layers.stage) {
            if (state.node) leave(state, root, reduced);
            const built = build(layers.doc, layer, { reduced });
            setDx(built.node, layer);
            layers.stage.appendChild(built.node);
            state.node = built.node;
            state.sprite = built.sprite;
            state.sig = layerSig(layer);
            const node = built.node;
            later(state, () => {
                node.classList.remove('is-pending');
                node.classList.add('is-on');
                if (state.demon.turn === 'demon') node.classList.add('is-lit');
            }, ENTER_DELAY_MS);
            played.push(`demon:${step.action === 'enter' ? 'enter' : 'switch'}`);
        }
    } else if (state.node && step.state.active) {
        // 在场期间本体换了衣服或表情：黑影跟着换。
        const layer = state.look.get(step.state.body);
        if (layer && layerSig(layer) !== state.sig && state.sprite) {
            state.sprite.setAttribute('style', spriteStyle(layer));
            setDx(state.node, layer);
            state.sig = layerSig(layer);
        }
    }
    if (state.node && !state.node.classList.contains('is-pending')) state.node.classList.toggle('is-lit', step.turn === 'demon');
    setTurn(root, state.node || step.state.active ? step.turn : '');
    return played;
}

// 黑影：本体立绘的复刻，压暗、下半身与边缘由实到虚地消隐；颜色与时长走 #igs-overlay 上的变量，跟随皮肤可覆盖。
export const INNER_DEMON_STYLE_TEXT = `
#igs-overlay{--igs-demon-tone:brightness(.34) saturate(.5) contrast(1.05);--igs-demon-tone-lit:brightness(.5) saturate(.55) contrast(1.05);--igs-demon-op:.62;--igs-demon-op-lit:.9;--igs-demon-ms:.9s;--igs-demon-leave-ms:1.2s;--igs-demon-body-dim:brightness(.82) saturate(.9);}
.igs-demon{position:absolute;inset:0;pointer-events:none;opacity:0;transform:none;-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 36%,transparent 88%);mask-image:linear-gradient(180deg,#000 0%,#000 36%,transparent 88%);transition:transform var(--igs-demon-ms) cubic-bezier(.2,.7,.2,1),opacity var(--igs-demon-ms) ease;}
.igs-demon.is-on{transform:translateX(var(--igs-demon-dx,30%));opacity:var(--igs-demon-op);}
.igs-demon.is-on.is-lit{opacity:var(--igs-demon-op-lit);}
.igs-demon.is-leaving{transform:translate(var(--igs-demon-dx,30%),-4%);opacity:0;transition-duration:var(--igs-demon-leave-ms);}
.igs-demon-float{position:absolute;inset:0;animation:igs-demon-float 6s ease-in-out infinite;}
.igs-demon-sprite{filter:var(--igs-grade-sprite,) var(--igs-demon-tone);-webkit-filter:var(--igs-grade-sprite,) var(--igs-demon-tone);transition:filter var(--igs-demon-ms) ease;}
.igs-demon.is-lit .igs-demon-sprite{filter:var(--igs-grade-sprite,) var(--igs-demon-tone-lit);-webkit-filter:var(--igs-grade-sprite,) var(--igs-demon-tone-lit);}
.igs-demon.is-leaving .igs-demon-sprite{filter:var(--igs-grade-sprite,) grayscale(1) brightness(.5) blur(2px);-webkit-filter:var(--igs-grade-sprite,) grayscale(1) brightness(.5) blur(2px);transition-duration:var(--igs-demon-leave-ms);}
.igs-demon.is-reduced{transition:opacity .4s ease;}
.igs-demon.is-reduced.is-on,.igs-demon.is-reduced.is-leaving{transform:translateX(var(--igs-demon-dx,30%));}
.igs-demon.is-reduced .igs-demon-float{animation:none;}
.igs-demon.is-reduced .igs-demon-sprite{transition:none;}
#igs-overlay[data-igs-demon-turn="demon"] #igs-sprite:not(.igs-sprite-editing){--igs-sprite-dim:var(--igs-demon-body-dim);}
#igs-overlay[data-igs-quality="low"] .igs-demon-sprite{transition:none;}
@keyframes igs-demon-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2%)}}
@media (prefers-reduced-motion: reduce){.igs-demon,.igs-demon-float{animation:none!important;}.igs-demon.is-on,.igs-demon.is-leaving{transform:translateX(var(--igs-demon-dx,30%));}}
`.trim();
