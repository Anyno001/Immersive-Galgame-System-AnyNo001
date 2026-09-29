import { prefersReducedMotion } from './reduced-motion.js';
import { ensureFxLayers } from './fx-layer.js';
import { MANGA_SYMBOL_SVG } from './fx-symbols.js';
import { normalizeRomanceFxSettings } from './romance-settings.js';
import { playFxSfx } from './fx-sfx.js';

// 亲密演出的瞬时时刻：关系变化卡、告白、恋爱回忆、修罗场心碎符号。
// 关系卡按「角色 → 关系」记基线：首次见到只记录不弹卡，文字变化才弹；同页重绘与翻回旧页不重播（基线已更新）。
// 告白与回忆按页记忆，基线、记忆与计时器在关闭阅读器时由 closeRomanceMoments 清空。
const CARD_LIFE_MS = 2600;
const CARD_LIFE_REDUCED_MS = 2200;
const TOAST_LIFE_MS = 2400;
const SYMBOL_LIFE_MS = 1000;
const BASELINE_LIMIT = 64;
const SEEN_LIMIT = 200;
// 告白：告白页起连续同一说话人最多 3 页为告白段；紧接其后的第一页（回答）文字出现前停顿一拍。
const CONFESS_SPAN = 3;
export const CONFESS_ANSWER_PAUSE_MS = 600;
const SLOWER_SPEED = Object.freeze({ fast: 'medium', medium: 'slow', slow: 'slow' });
const CONFESS_ATTR = 'data-igs-rm-confess';

const relationBaseline = new Map();
const states = new WeakMap();

function text(value) {
    return String(value == null ? '' : value).trim();
}

function remember(set, key) {
    if (set.has(key)) return false;
    set.add(key);
    while (set.size > SEEN_LIMIT) set.delete(set.values().next().value);
    return true;
}

export function diffRelation(baseline, character, relation) {
    const name = text(character);
    const next = text(relation);
    if (!name || !next) return null;
    const previous = baseline.get(name);
    baseline.delete(name);
    baseline.set(name, next);
    while (baseline.size > BASELINE_LIMIT) baseline.delete(baseline.keys().next().value);
    return previous != null && previous !== next ? { character: name, from: previous, to: next } : null;
}

// 纯函数：根据告白记忆判断当前页角色。memory.confess 为 { messageId, start, end, speaker } 或 null。
// 返回 'confess'（告白段内）、'answer'（告白段后第一页）或 ''。
export function planConfess(memory, { messageId, index, speaker, confess }) {
    const i = Number(index);
    const who = text(speaker);
    if (confess) {
        const current = memory.confess;
        if (!current || current.messageId !== messageId || i < current.start || i > current.end) {
            memory.confess = { messageId, start: i, end: i, speaker: who };
        }
        return 'confess';
    }
    const c = memory.confess;
    if (!c || c.messageId !== messageId || !Number.isFinite(i)) return '';
    if (i >= c.start && i <= c.end) return 'confess';
    if (i === c.end + 1) {
        if (who && who === c.speaker && i - c.start < CONFESS_SPAN) {
            c.end = i;
            return 'confess';
        }
        return 'answer';
    }
    return '';
}

export function slowerTypewriterSpeed(speed) {
    return SLOWER_SPEED[speed] || 'slow';
}

function getState(stage) {
    let state = states.get(stage);
    if (!state) {
        state = { timers: new Set(), nodes: new Set(), memory: { confess: null }, seen: new Set() };
        states.set(stage, state);
    }
    return state;
}

function removeNode(node) {
    if (node && typeof node.remove === 'function') node.remove();
    else if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function line(doc, className, value) {
    const el = doc.createElement('div');
    el.className = className;
    el.textContent = value;
    return el;
}

// 挂一个限时节点：到时或 dismiss 时移除；返回 dismiss。
function spawn(state, layer, el, lifeMs, ctx) {
    const schedule = typeof ctx.schedule === 'function' ? ctx.schedule : setTimeout;
    const clear = typeof ctx.clear === 'function' ? ctx.clear : clearTimeout;
    let timer = null;
    const dismiss = () => {
        if (timer != null) { clear(timer); state.timers.delete(timer); }
        state.nodes.delete(el);
        removeNode(el);
    };
    layer.appendChild(el);
    state.nodes.add(el);
    timer = schedule(dismiss, lifeMs);
    state.timers.add(timer);
    return dismiss;
}

function showRelationCard(layers, state, change, ctx) {
    const { doc, front } = layers;
    const card = doc.createElement('div');
    card.className = 'igs-rm-relation-card';
    card.appendChild(line(doc, 'igs-rm-relation-title', '关系变化'));
    card.appendChild(line(doc, 'igs-rm-relation-name', change.character));
    card.appendChild(line(doc, 'igs-rm-relation-value', `${change.from} → ${change.to}`));
    const dismiss = spawn(state, front, card, ctx.reduced ? CARD_LIFE_REDUCED_MS : CARD_LIFE_MS, ctx);
    // 点击卡片提前关闭；卡片挂在前层（对话层之上），点击不会落到翻页层。
    if (typeof card.addEventListener === 'function') {
        card.addEventListener('click', (event) => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            dismiss();
        });
    }
}

// 回忆拍照读取当前舞台的背景与立绘（与日常演出拍照同形的 shot，交给宿主写入相册）。
function readStageShot(motion) {
    const pick = (el) => (el && el.style ? {
        image: el.style.backgroundImage || '',
        size: el.style.backgroundSize || '',
        position: el.style.backgroundPosition || '',
        visible: el.style.display !== 'none' && Boolean(el.style.backgroundImage),
    } : null);
    const rect = typeof motion.getBoundingClientRect === 'function' ? motion.getBoundingClientRect() : null;
    const sprite = pick(motion.querySelector('#igs-sprite'));
    return {
        bg: pick(motion.querySelector('#igs-bg')),
        sprite: sprite && sprite.visible ? sprite : null,
        aspect: rect && rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9,
    };
}

function playMemory(layers, state, name, snapshot, ctx) {
    if (!remember(state.seen, `memory:${snapshot.messageId}:${name}`)) return false;
    if (typeof ctx.onMemory === 'function') {
        try {
            ctx.onMemory({ messageId: snapshot.messageId, caption: name, ...readStageShot(layers.motion) });
        } catch { /* 相册写入失败不影响演出 */ }
    }
    spawn(state, layers.front, line(layers.doc, 'igs-rm-memory-toast', `已记下回忆：${name}`), TOAST_LIFE_MS, ctx);
    return true;
}

// 修罗场心碎符号：位置由 romance-runtime 按头部算好（舞台像素），每个页面入口只弹一次。
export function playRivalSymbol(root, placement, pageKey, ctx = {}) {
    const layers = ensureFxLayers(root);
    if (!layers || !placement) return false;
    const state = getState(layers.motion);
    if (!remember(state.seen, `rival:${pageKey}`)) return false;
    const el = layers.doc.createElement('div');
    el.className = 'igs-fx-symbol igs-rm-rival-symbol';
    el.setAttribute('data-kind', 'heartbreak');
    el.innerHTML = MANGA_SYMBOL_SVG.heartbreak || '';
    el.style.left = `${placement.x}px`;
    el.style.top = `${placement.y}px`;
    el.style.setProperty('--igs-fx-size', `${placement.size}px`);
    el.style.setProperty('--igs-fx-life', `${SYMBOL_LIFE_MS}ms`);
    if (placement.flip) el.setAttribute('data-flip', '1');
    spawn(state, layers.stage, el, SYMBOL_LIFE_MS, ctx);
    return true;
}

// 返回 { played, typewriter }；typewriter 为 { speed?, delay? }，由 reader-dom-render 叠加到打字机参数上。
export function applyRomanceMoments(root, snapshot, ctx = {}) {
    const content = (snapshot && snapshot.content) || {};
    const settings = normalizeRomanceFxSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.romanceFx);
    const result = { played: [], typewriter: null };
    const stage = (root && typeof root.querySelector === 'function' && root.querySelector('#igs-stage-motion')) || null;
    const textPage = content.htmlCardPage !== true && content.textType !== 'chat';
    if (!stage || !settings.enabled || !textPage) {
        if (stage && stage.hasAttribute && stage.hasAttribute(CONFESS_ATTR)) stage.removeAttribute(CONFESS_ATTR);
        return result;
    }
    const reduced = ctx.reducedMotion === true || (ctx.reducedMotion !== false && prefersReducedMotion());
    const fx = content.fx || {};
    const env = { ...ctx, reduced };

    // 关系卡：NSFW 场景的状态栏快照不带角色，这里自然不会更新基线。
    if (settings.relationCard) {
        const hud = content.statusHud || {};
        const change = diffRelation(relationBaseline, hud.character, hud.relation);
        const layers = change ? ensureFxLayers(root) : null;
        if (layers) {
            showRelationCard(layers, getState(layers.motion), change, env);
            result.played.push({ type: 'relation', ...change });
        }
    }

    const state = getState(stage);
    const role = settings.confess && content.sceneNsfw !== true
        ? planConfess(state.memory, { messageId: snapshot.messageId, index: content.currentIndex, speaker: content.speaker, confess: fx.confess === true })
        : '';
    if (role === 'confess') {
        // 进入告白段时心跳一次（跟随「演出音效」），段内翻页与同页重绘不重播。
        if (!stage.hasAttribute(CONFESS_ATTR)) {
            const sfx = playFxSfx('heartbeat', snapshot.readerSettings && snapshot.readerSettings.fxSound, { audioScheduler: ctx.audioScheduler });
            if (sfx) result.played.push({ type: 'confess-heartbeat' });
        }
        stage.setAttribute(CONFESS_ATTR, '1');
        ensureFxLayers(root);
        const speed = snapshot.readerSettings && snapshot.readerSettings.typewriter && snapshot.readerSettings.typewriter.speed;
        result.typewriter = { speed: slowerTypewriterSpeed(speed || 'medium') };
    } else if (stage.hasAttribute(CONFESS_ATTR)) {
        stage.removeAttribute(CONFESS_ATTR);
    }
    if (role === 'answer' && !reduced) result.typewriter = { delay: CONFESS_ANSWER_PAUSE_MS };
    if (role) result.played.push({ type: role });

    // 回忆：NSFW 场景即使出现标签也不拍。
    if (settings.memories && fx.memory && content.sceneNsfw !== true) {
        const layers = ensureFxLayers(root);
        if (layers && playMemory(layers, state, text(fx.memory), snapshot, env)) result.played.push({ type: 'memory', name: text(fx.memory) });
    }
    return result;
}

export function closeRomanceMoments(root) {
    const stage = (root && typeof root.querySelector === 'function' && root.querySelector('#igs-stage-motion')) || root;
    const state = stage ? states.get(stage) : null;
    if (state) {
        for (const timer of state.timers) clearTimeout(timer);
        for (const node of state.nodes) removeNode(node);
        states.delete(stage);
    }
    if (stage && typeof stage.removeAttribute === 'function') stage.removeAttribute(CONFESS_ATTR);
    relationBaseline.clear();
}
