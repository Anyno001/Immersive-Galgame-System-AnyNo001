import { worldSkinOf } from '../../scene/worldview.js';

// 战斗演出 DOM 层：遭遇、出招、结算挂在 fx 前层（对话层之上），对手名牌与战斗暗角挂在 fx 后层。
// 同一身份（消息|swipe|页）重绘不重播；名牌、暗角与黑边跟随当前页的战斗区间状态；计时器与立绘动画统一回收。
// 演出播放期间前层铺一块透明点击层：点一下跳到结算，这次点击不翻页。
import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { battleFxIdentity, resolveImpactPoint, BATTLE_SKIP_RESULT_MS } from './fx-battle-model.js';
import { measureStage, peekSpriteHead } from './fx-anchor.js';
import { spriteGeometry } from './fx-runtime.js';

const SHOW_ATTR = 'data-igs-fx-battle-show';
const SHAKE_ATTR = 'data-igs-fx-battle-shake';
const MOTION_ATTR = 'data-igs-fx-battle-motion';
const LETTERBOX_ATTR = 'data-igs-fx-battle-letterbox';
const MOTION_ATTRS = Object.freeze([SHOW_ATTR, SHAKE_ATTR, MOTION_ATTR, LETTERBOX_ATTR]);
const SHAKE_MS = 420;
const EVENT_CLASSES = '.igs-fx-battle-encounter, .igs-fx-battle-hit, .igs-fx-battle-result, .igs-fx-battle-skip, .igs-fx-battle-foe';
// 古代背景（readerSettings._ancientEra）：时间轴与音效不变，节点加 is-ancient，换成水墨剑光、书法招式名与朱砂印。
const ANCIENT_HIT_LABELS = Object.freeze({ hit: '命中', crit: '暴击', miss: '闪避', guard: '格挡', ko: '击倒', heal: '疗伤' });
const ANCIENT_RESULT_GLYPHS = Object.freeze({ win: '胜', lose: '败', escape: '遁' });
const eraClass = (className, ancient) => (ancient ? `${className} is-ancient` : className);
// 换皮世界观（worldSkinOf）：在现代节点上追加 is-<id> 换皮，时间轴、文案与音效不变。
const SHIELD_SVG = '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" stroke="currentColor" stroke-width="4"/><polygon points="50,18 78,34 78,66 50,82 22,66 22,34" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2" stroke-opacity=".7"/></svg>';

// 立绘受击反应：与舞台调度的立绘动作一样以 composite:add 叠加，不覆盖立绘自身的 transform / filter。
const SPRITE_REACTIONS = Object.freeze({
    hit: [{ frames: ['translate(0,0)', 'translate(1.6%,-0.4%) rotate(1deg)', 'translate(0,0)'], prop: 'transform', duration: 380 },
        { frames: ['brightness(1.9)', 'brightness(1)'], prop: 'filter', duration: 260 }],
    crit: [{ frames: ['translate(0,0)', 'translate(3.2%,-0.8%) rotate(2deg)', 'translate(-0.6%,0)', 'translate(0,0)'], prop: 'transform', duration: 520 },
        { frames: ['brightness(2.6)', 'brightness(1)'], prop: 'filter', duration: 360 }],
    guard: [{ frames: ['translate(0,0)', 'translate(0.8%,0)', 'translate(0,0)'], prop: 'transform', duration: 300 }],
    miss: [{ frames: ['translate(0,0)', 'translate(-3.5%,0) rotate(-1.5deg)', 'translate(0,0)'], prop: 'transform', duration: 460 }],
    heal: [{ frames: ['brightness(1.35) saturate(1.25)', 'brightness(1) saturate(1)'], prop: 'filter', duration: 800 }],
    ko: [{ frames: ['translate(0,0) rotate(0deg)', 'translate(1.6%,-1%) rotate(2deg)', 'translate(0.6%,5%) rotate(0.5deg)'], prop: 'transform', duration: 900, fill: 'forwards' },
        { frames: ['brightness(2.2)', 'brightness(0.55) saturate(0.4)'], prop: 'filter', duration: 900, fill: 'forwards' },
        { frames: [1, 1, 0.4], prop: 'opacity', duration: 900, fill: 'forwards', composite: 'replace' }],
});
const states = new WeakMap();

function getState(root, options) {
    let state = states.get(root);
    if (!state) {
        state = { key: '', timers: new Set(), nodes: new Set(), anims: new Set(), plate: null, vignette: null, motion: null, shows: 0, skip: null };
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

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function setVar(node, name, value) {
    if (node && node.style && typeof node.style.setProperty === 'function') node.style.setProperty(name, value);
}

function stopTimers(state) {
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
}

function stopAnims(state, finish = false) {
    for (const anim of state.anims) {
        try { if (finish && anim.effect && anim.effect.getTiming && anim.effect.getTiming().fill === 'forwards') anim.finish(); else anim.cancel(); } catch { /* 已结束 */ }
    }
    if (!finish) state.anims.clear();
}

function clearEvents(state) {
    stopTimers(state);
    stopAnims(state);
    for (const node of state.nodes) node.remove();
    state.nodes.clear();
    state.shows = 0;
    state.skip = null;
    if (state.motion) {
        state.motion.removeAttribute(SHOW_ATTR);
        state.motion.removeAttribute(SHAKE_ATTR);
    }
}

function mount(state, parent, node, lifeMs) {
    parent.appendChild(node);
    state.nodes.add(node);
    track(state, () => { node.remove(); state.nodes.delete(node); }, lifeMs);
    return node;
}

// 遭遇与结算是整屏演出：播放期间隐藏状态 HUD，最后一张整屏演出结束才恢复。
function holdShow(state, ms) {
    state.shows += 1;
    state.motion.setAttribute(SHOW_ATTR, '1');
    track(state, () => {
        state.shows = Math.max(0, state.shows - 1);
        if (!state.shows) state.motion.removeAttribute(SHOW_ATTR);
    }, ms);
}

function shake(state, level) {
    state.motion.setAttribute(SHAKE_ATTR, level);
    track(state, () => state.motion.removeAttribute(SHAKE_ATTR), SHAKE_MS);
}

function reactSprite(state, spriteEl, result) {
    const steps = SPRITE_REACTIONS[result];
    if (!steps || !spriteEl || typeof spriteEl.animate !== 'function') return;
    for (const step of steps) {
        try {
            const anim = spriteEl.animate(step.frames.map((value) => ({ [step.prop]: value })), {
                duration: step.duration, easing: 'cubic-bezier(.2,.8,.3,1)', fill: step.fill || 'none', composite: step.composite || 'add',
            });
            state.anims.add(anim);
            if (step.fill !== 'forwards' && anim && 'onfinish' in anim) anim.onfinish = () => state.anims.delete(anim);
        } catch { /* 不支持叠加合成的环境跳过立绘反应 */ }
    }
}

function portraitImg(doc, className, url, name) {
    const img = el(doc, 'img', className);
    img.setAttribute('src', url);
    img.setAttribute('alt', name || '');
    img.setAttribute('decoding', 'async');
    img.setAttribute('draggable', 'false');
    return img;
}

// 对手不是当前立绘角色时，出招期间临时登场在对话框下层，受击反应走 CSS，招式结束随演出退场。
function buildFoe(doc, event) {
    const node = el(doc, 'div', 'igs-fx-battle-foe igs-fx-transient');
    node.setAttribute('data-igs-battle-result', event.result);
    node.appendChild(portraitImg(doc, 'igs-fx-battle-foe-body', event.portrait, event.target));
    return node;
}

function buildEncounter(doc, event, ancient) {
    const node = el(doc, 'div', eraClass('igs-fx-battle-encounter igs-fx-transient', ancient));
    node.appendChild(el(doc, 'div', 'igs-fx-battle-wipe is-a'));
    node.appendChild(el(doc, 'div', 'igs-fx-battle-wipe is-b'));
    if (event.portrait) node.appendChild(portraitImg(doc, 'igs-fx-battle-vs-portrait', event.portrait, event.foe));
    const vs = el(doc, 'div', 'igs-fx-battle-vs');
    vs.appendChild(el(doc, 'span', 'igs-fx-battle-vs-cap', ancient ? '狭路相逢' : 'ENCOUNTER'));
    if (event.foe) {
        const foe = el(doc, 'span', 'igs-fx-battle-vs-foe', event.foe);
        vs.appendChild(foe);
        // 古代：对手名是大字墨书，右上角钤一方朱砂「战」印。
        if (ancient) foe.appendChild(el(doc, 'span', 'igs-fx-battle-seal', '战'));
    }
    if (event.title) vs.appendChild(el(doc, 'span', 'igs-fx-battle-vs-title', event.title));
    node.appendChild(vs);
    return node;
}

function buildImpact(doc, event, ancient) {
    const impact = el(doc, 'div', 'igs-fx-battle-impact');
    const onPlayer = event.targetKind === 'player';
    if (event.result === 'guard') {
        const shield = el(doc, 'div', 'igs-fx-battle-shield');
        shield.innerHTML = SHIELD_SVG;
        impact.appendChild(shield);
    } else if (event.result === 'heal') {
        for (let i = 0; i < 6; i += 1) {
            const spark = el(doc, 'span', 'igs-fx-battle-spark');
            setVar(spark, '--i', String(i));
            impact.appendChild(spark);
        }
    } else if (!onPlayer || event.result === 'miss') {
        impact.appendChild(el(doc, 'span', 'igs-fx-battle-slash is-main'));
        if (event.result === 'crit') impact.appendChild(el(doc, 'span', 'igs-fx-battle-slash is-cross'));
    }
    const pop = el(doc, 'div', 'igs-fx-battle-pop');
    const label = ancient ? ANCIENT_HIT_LABELS[event.result] : event.label;
    if (label) pop.appendChild(el(doc, 'span', 'igs-fx-battle-pop-label', label));
    if (event.diceLabel) pop.appendChild(el(doc, 'span', 'igs-fx-battle-pop-dice', event.diceLabel));
    if (event.target && !onPlayer) pop.appendChild(el(doc, 'span', 'igs-fx-battle-pop-target', event.target));
    if (pop.children.length) impact.appendChild(pop);
    return impact;
}

function buildHit(doc, event, ancient) {
    const node = el(doc, 'div', eraClass('igs-fx-battle-hit igs-fx-transient', ancient));
    node.setAttribute('data-igs-battle-result', event.result);
    node.setAttribute('data-igs-battle-target', event.targetKind || 'stage');
    if (event.skill || event.attacker) {
        const banner = el(doc, 'div', 'igs-fx-battle-skill');
        if (event.attacker) banner.appendChild(el(doc, 'span', 'igs-fx-battle-skill-who', event.attacker));
        banner.appendChild(el(doc, 'span', 'igs-fx-battle-skill-name', event.skill || '攻击'));
        node.appendChild(banner);
    }
    // 主角受击是第一人称：屏幕边缘闪红，不在画面中间劈一刀。
    if (event.targetKind === 'player' && ['hit', 'crit', 'ko'].includes(event.result)) node.appendChild(el(doc, 'div', 'igs-fx-battle-hurt'));
    else if (event.result === 'crit' || event.result === 'ko') node.appendChild(el(doc, 'div', 'igs-fx-battle-flash'));
    node.appendChild(buildImpact(doc, event, ancient));
    return node;
}

function buildResult(doc, event, ancient) {
    const node = el(doc, 'div', eraClass('igs-fx-battle-result igs-fx-transient', ancient));
    node.setAttribute('data-igs-battle-result', event.result);
    node.appendChild(el(doc, 'div', 'igs-fx-battle-result-veil'));
    const ribbon = el(doc, 'div', 'igs-fx-battle-ribbon');
    ribbon.appendChild(el(doc, 'span', 'igs-fx-battle-ribbon-title', (ancient && ANCIENT_RESULT_GLYPHS[event.result]) || event.title));
    ribbon.appendChild(el(doc, 'span', 'igs-fx-battle-ribbon-text', event.text));
    node.appendChild(ribbon);
    return node;
}

function castTargetOf(cast, character) {
    return (Array.isArray(cast) ? cast : []).find((c) => c.character === character) || null;
}

function castElOf(motion, character) {
    const layer = motion.querySelector('#igs-cast');
    return layer ? Array.from(layer.children || []).find((el) => el.getAttribute('data-igs-cast-char') === character) || null : null;
}

function placeImpact(node, event, motion, sprite) {
    if ((event.targetKind !== 'sprite' && event.targetKind !== 'cast') || !sprite || !sprite.url) return;
    const geo = measureStage(motion);
    const point = geo && resolveImpactPoint(geo, spriteGeometry(sprite, peekSpriteHead(sprite.url)));
    const impact = point && node.querySelector('.igs-fx-battle-impact');
    if (!impact) return;
    impact.style.left = `${point.x}px`;
    impact.style.top = `${point.y}px`;
}

function syncPlate(state, layers, plan, ancient, worldSkin = '') {
    const plate = plan.plate;
    if (plan.letterbox) layers.motion.setAttribute(LETTERBOX_ATTR, '1');
    else layers.motion.removeAttribute(LETTERBOX_ATTR);
    if (!plate) {
        if (state.plate) state.plate.remove();
        if (state.vignette) state.vignette.remove();
        state.plate = null;
        state.vignette = null;
        setVar(layers.motion, '--igs-bt-hud-gap', null);
        return;
    }
    const { doc, front, stage } = layers;
    if (!state.vignette || state.vignette.parentNode !== stage) {
        state.vignette = el(doc, 'div', 'igs-fx-battle-vignette');
        stage.appendChild(state.vignette);
    }
    if (!state.plate || state.plate.parentNode !== front) {
        state.plate = el(doc, 'div', 'igs-fx-battle-plate');
        state.plate.setAttribute('aria-hidden', 'true');
        front.appendChild(state.plate);
    }
    const skin = worldSkin ? ` is-${worldSkin}` : '';
    const vignetteClass = eraClass('igs-fx-battle-vignette', ancient) + skin;
    if (state.vignette.className !== vignetteClass) state.vignette.className = vignetteClass;
    const label = [plate.foe || '战斗中', plate.title].filter(Boolean).join(' · ');
    const era = ancient ? 'ancient' : (worldSkin || 'modern');
    if (state.plate.getAttribute('data-igs-battle-label') !== label || state.plate.getAttribute('data-igs-battle-era') !== era) {
        state.plate.setAttribute('data-igs-battle-label', label);
        state.plate.setAttribute('data-igs-battle-era', era);
        state.plate.className = eraClass('igs-fx-battle-plate', ancient) + skin;
        state.plate.textContent = '';
        state.plate.appendChild(el(doc, 'span', 'igs-fx-battle-plate-mark', ancient ? '战' : 'VS'));
        state.plate.appendChild(el(doc, 'span', 'igs-fx-battle-plate-name', label));
    }
    clearHud(layers.motion, state.plate, stage);
}

// 名牌碰到左上角状态栏或右上角工具栏时，整体移到这两条下方（技能横幅跟着下移）。
function clearHud(motion, plate, stage) {
    const doc = stage.ownerDocument;
    const byId = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const measurable = (node) => node && typeof node.getBoundingClientRect === 'function';
    setVar(motion, '--igs-bt-hud-gap', null);
    if (!measurable(plate) || !measurable(stage)) return;
    const box = stage.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    if (!box || !p || !(p.width > 0)) return;
    // 只算贴在舞台顶部、看得见的条。
    const bars = [byId('igs-status-hud'), byId('igs-ctrl-bar')]
        .filter((node) => measurable(node) && !node.hidden)
        .map((node) => node.getBoundingClientRect())
        .filter((r) => r && r.width > 0 && r.height > 0 && r.bottom > box.top && r.top < box.top + box.height / 3);
    if (!bars.some((r) => r.right > p.left && r.left < p.right && r.top < p.bottom && r.bottom > p.top)) return;
    setVar(motion, '--igs-bt-hud-gap', `${Math.ceil(Math.max(...bars.map((r) => r.bottom)) - box.top)}px`);
}

// plan 来自 planBattleFx；options：reducedMotion（不震屏、不闪光、无立绘反应、静态显示）、onEvent(event) 供音效挂接、
// sprite（当前立绘几何，用于冲击点定位）、motion（'smooth' | 'snappy'）、accent（主题强调色）、ancient（古代背景水墨换皮）。
export function applyBattleFxToDom(root, plan, options = {}) {
    if (!root || !plan) return { played: false, reason: 'empty' };
    const existing = states.get(root);
    if (!plan.plate && !plan.events.length && !existing) return { played: false, reason: 'empty' };
    const layers = ensureFxLayers(root);
    if (!layers || !layers.front || !layers.stage) return { played: false, reason: 'no-layer' };
    const state = getState(root, options);
    state.motion = layers.motion;
    if (options.accent) setVar(layers.motion, '--igs-battle-accent', options.accent);
    if (options.motion === 'snappy') layers.motion.setAttribute(MOTION_ATTR, 'snappy');
    else layers.motion.removeAttribute(MOTION_ATTR);
    const ancient = options.ancient === true;
    const worldSkin = ancient ? '' : worldSkinOf(options.worldview);
    syncPlate(state, layers, plan, ancient, worldSkin);
    const key = plan.identity ? battleFxIdentity(plan.identity) : '';
    if (key && state.key === key) return { played: false, reason: 'same-page' };
    // 换页即收掉上一页未播完的出招，即使本页没有新演出。
    if (key) { clearEvents(state); state.key = key; }
    if (!plan.events.length || !key) return { played: false, reason: plan.plate ? 'plate-only' : 'no-events' };
    const reduced = options.reducedMotion === true;
    const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    const { doc, front, motion } = layers;
    const spriteEl = motion.querySelector('#igs-sprite');
    const shown = new Set();
    const play = (event, lifeOverride) => {
        if (state.key !== key || shown.has(event)) return;
        shown.add(event);
        const life = lifeOverride || event.life;
        let node;
        if (event.type === 'encounter') node = buildEncounter(doc, event, ancient);
        else if (event.type === 'hit') node = buildHit(doc, event, ancient);
        else node = buildResult(doc, event, ancient);
        setVar(node, '--igs-battle-life', `${life}ms`);
        if (worldSkin) node.className = `${node.className} is-${worldSkin}`;
        if (reduced) node.setAttribute('data-igs-fx-static', '1');
        if (event.type !== 'hit') holdShow(state, life);
        if (event.type === 'hit' && event.targetKind === 'foe' && event.portrait) {
            const foe = buildFoe(doc, event);
            setVar(foe, '--igs-battle-life', `${life}ms`);
            if (reduced) foe.setAttribute('data-igs-fx-static', '1');
            mount(state, layers.stage, foe, life);
        }
        mount(state, front, node, life);
        if (event.type === 'hit') {
            placeImpact(node, event, motion, event.targetKind === 'cast' ? castTargetOf(options.cast, event.targetChar) : options.sprite);
            if (!reduced) {
                const heavy = event.result === 'crit' || event.result === 'ko' || (event.targetKind === 'player' && event.result === 'hit');
                if (event.result !== 'miss' && event.result !== 'heal') shake(state, heavy ? 'heavy' : 'light');
                if (event.targetKind === 'sprite') reactSprite(state, spriteEl, event.result);
                else if (event.targetKind === 'cast') reactSprite(state, castElOf(motion, event.targetChar), event.result);
            }
        }
        if (onEvent && !reduced) { try { onEvent(event); } catch (error) { /* 音效失败不影响演出 */ } }
    };
    // 点击快进：收掉进行中的出招与遭遇，立绘停在最终姿态，直接亮出结算（没有结算就只收场）。
    const skip = el(doc, 'div', 'igs-fx-battle-skip igs-fx-transient');
    skip.setAttribute('title', '点击跳过战斗演出');
    const onSkip = (event) => {
        if (event) {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
        if (state.key !== key || state.skip !== skip) return;
        stopTimers(state);
        stopAnims(state, true);
        for (const node of state.nodes) node.remove();
        state.nodes.clear();
        state.shows = 0;
        state.skip = null;
        motion.removeAttribute(SHOW_ATTR);
        motion.removeAttribute(SHAKE_ATTR);
        const result = plan.events.find((e) => e.type === 'result' && !shown.has(e));
        if (result) play(result, BATTLE_SKIP_RESULT_MS);
    };
    if (typeof skip.addEventListener === 'function') skip.addEventListener('click', onSkip);
    skip.skipBattle = onSkip;
    // 只有单独一招时演出很短，不拦截翻页点击。
    if (plan.events.length > 1 || plan.events[0].type !== 'hit') {
        state.skip = skip;
        mount(state, front, skip, plan.totalMs);
    }
    for (const event of plan.events) {
        if (event.at <= 0) play(event);
        else track(state, () => play(event), event.at);
    }
    return { played: true, count: plan.events.length };
}

export function skipBattleFx(root) {
    const state = root && states.get(root);
    if (!state || !state.skip) return false;
    state.skip.skipBattle();
    return true;
}

export function cancelBattleFx(root) {
    const state = root && states.get(root);
    if (state) {
        clearEvents(state);
        if (state.plate) state.plate.remove();
        if (state.vignette) state.vignette.remove();
        states.delete(root);
    }
    const layers = root ? findFxLayers(root) : null;
    if (layers) {
        for (const layer of [layers.front, layers.stage]) {
            if (!layer) continue;
            for (const node of Array.from(layer.querySelectorAll(`.igs-fx-battle-plate, .igs-fx-battle-vignette, ${EVENT_CLASSES}`))) node.remove();
        }
        if (layers.motion) for (const name of MOTION_ATTRS) layers.motion.removeAttribute(name);
    }
    return Boolean(state);
}

export const BATTLE_FX_STYLE_TEXT = `
#igs-stage-motion{--igs-battle-accent:#ffd76a;}
#igs-stage-motion[data-igs-fx-battle-show="1"] #igs-status-hud{visibility:hidden!important;}
#igs-stage-motion[data-igs-fx-battle-letterbox] .igs-fx-letterbox-bar{transform:scaleY(1);}
#igs-stage-motion[data-igs-fx-battle-shake="light"]{animation:igs-battle-shake-light .3s ease-out both;}
#igs-stage-motion[data-igs-fx-battle-shake="heavy"]{animation:igs-battle-shake-heavy .42s ease-out both;}
@keyframes igs-battle-shake-light{0%,100%{transform:none}25%{transform:translate3d(5px,-2px,0)}50%{transform:translate3d(-4px,2px,0)}75%{transform:translate3d(2px,0,0)}}
@keyframes igs-battle-shake-heavy{0%,100%{transform:none}12%{transform:translate3d(12px,-5px,0)}28%{transform:translate3d(-11px,4px,0)}44%{transform:translate3d(8px,3px,0)}60%{transform:translate3d(-6px,-2px,0)}78%{transform:translate3d(3px,1px,0)}}
.igs-fx-battle-skip{position:absolute;inset:0;z-index:8;pointer-events:auto;cursor:pointer;background:transparent;}
.igs-fx-battle-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(120,10,20,.28) 100%);animation:igs-battle-fade-in .6s ease-out both;}
.igs-fx-battle-plate,.igs-fx-battle-encounter,.igs-fx-battle-hit,.igs-fx-battle-result{--igs-bt-veil:rgba(8,9,14,.68);--igs-bt-rule:color-mix(in srgb,var(--igs-battle-accent) 70%,transparent);--igs-bt-ink:#f4f1ea;--igs-bt-halo:0 1px 4px rgba(0,0,0,.75);--igs-bt-title-halo:0 0 18px color-mix(in srgb,var(--igs-battle-accent) 40%,transparent),0 2px 4px rgba(0,0,0,.55);--igs-bt-lose:#ff6a6a;--igs-bt-escape:#cfe3f5;--igs-bt-wipe:rgba(6,7,12,.9);}
.igs-fx-battle-plate{position:absolute;left:50%;top:calc(clamp(8px,2.5%,22px) + var(--igs-bt-hud-gap,0px));transform:translateX(-50%);display:flex;align-items:baseline;gap:10px;max-width:min(460px,82%);box-sizing:border-box;padding:5px 44px 6px;background:linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left bottom/100% 1px no-repeat,linear-gradient(90deg,transparent,var(--igs-bt-veil) 20%,var(--igs-bt-veil) 80%,transparent);color:var(--igs-bt-ink);text-shadow:var(--igs-bt-halo);font-size:13px;letter-spacing:.16em;white-space:nowrap;animation:igs-battle-drop .5s cubic-bezier(.2,.8,.3,1) both;}
.igs-fx-battle-plate-mark{flex:none;color:var(--igs-battle-accent);font-size:11px;font-weight:700;letter-spacing:.2em;}
.igs-fx-battle-plate-name{overflow:hidden;text-overflow:ellipsis;}
.igs-fx-battle-encounter{position:absolute;inset:0;overflow:hidden;z-index:6;}
.igs-fx-battle-wipe{position:absolute;left:-30%;right:-30%;height:36%;background:linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left 16%/100% 1px no-repeat,linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left 84%/100% 1px no-repeat,linear-gradient(180deg,transparent,var(--igs-bt-wipe) 16%,var(--igs-bt-wipe) 84%,transparent);transform:skewY(-8deg) translateX(-110%);}
.igs-fx-battle-wipe.is-a{top:13%;animation:igs-battle-wipe-a var(--igs-battle-life,1.9s) cubic-bezier(.7,0,.2,1) both;}
.igs-fx-battle-wipe.is-b{top:49%;animation:igs-battle-wipe-b var(--igs-battle-life,1.9s) cubic-bezier(.7,0,.2,1) both;}
.igs-fx-battle-vs-portrait{position:absolute;right:4%;bottom:0;height:94%;max-width:52%;object-fit:contain;object-position:bottom;pointer-events:none;animation:igs-battle-portrait-in var(--igs-battle-life,1.9s) ease-out both;}
.igs-fx-battle-foe{position:absolute;left:50%;bottom:0;height:78%;transform:translateX(-50%);display:flex;align-items:flex-end;justify-content:center;pointer-events:none;animation:igs-battle-foe-life var(--igs-battle-life,1.3s) ease-out both;}
.igs-fx-battle-foe-body{height:100%;width:auto;max-width:70vw;object-fit:contain;object-position:bottom;animation:igs-battle-foe-hit .42s .08s cubic-bezier(.2,.8,.3,1) both;}
.igs-fx-battle-foe[data-igs-battle-result="crit"] .igs-fx-battle-foe-body{animation-name:igs-battle-foe-crit;animation-duration:.56s;}
.igs-fx-battle-foe[data-igs-battle-result="guard"] .igs-fx-battle-foe-body{animation-name:igs-battle-foe-guard;animation-duration:.3s;}
.igs-fx-battle-foe[data-igs-battle-result="miss"] .igs-fx-battle-foe-body{animation-name:igs-battle-foe-dodge;animation-duration:.46s;}
.igs-fx-battle-foe[data-igs-battle-result="heal"] .igs-fx-battle-foe-body{animation-name:igs-battle-foe-heal;animation-duration:.8s;}
.igs-fx-battle-foe[data-igs-battle-result="ko"] .igs-fx-battle-foe-body{animation-name:igs-battle-foe-ko;animation-duration:.9s;animation-fill-mode:forwards;}
.igs-fx-battle-vs{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--igs-bt-ink);text-align:center;white-space:nowrap;animation:igs-battle-vs var(--igs-battle-life,1.9s) ease-out both;}
.igs-fx-battle-vs-cap{font-size:12px;font-weight:600;letter-spacing:.5em;text-indent:.5em;color:var(--igs-battle-accent);text-shadow:var(--igs-bt-halo);}
.igs-fx-battle-vs-foe{font-size:clamp(26px,6vw,46px);font-weight:800;letter-spacing:.14em;text-indent:.14em;text-shadow:var(--igs-bt-halo),0 0 26px rgba(255,70,70,.35);}
.igs-fx-battle-vs-title{font-size:13px;opacity:.8;letter-spacing:.3em;text-indent:.3em;text-shadow:var(--igs-bt-halo);}
.igs-fx-battle-hit{position:absolute;inset:0;z-index:5;}
.igs-fx-battle-skill{position:absolute;left:50%;top:calc(clamp(46px,11%,90px) + var(--igs-bt-hud-gap,0px));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1px;box-sizing:border-box;min-width:min(260px,64%);max-width:84%;padding:7px 56px 8px;background:linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left top/100% 1px no-repeat,linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left bottom/100% 1px no-repeat,linear-gradient(90deg,transparent,var(--igs-bt-veil) 20%,var(--igs-bt-veil) 80%,transparent);color:var(--igs-bt-ink);text-shadow:var(--igs-bt-halo);text-align:center;animation:igs-battle-skill var(--igs-battle-life,1.3s) ease-out both;}
.igs-fx-battle-skill-who{font-size:11px;opacity:.72;letter-spacing:.3em;text-indent:.3em;}
.igs-fx-battle-skill-name{font-size:20px;font-weight:700;letter-spacing:.24em;text-indent:.24em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;}
.igs-fx-battle-impact{position:absolute;left:50%;top:40%;height:56%;max-height:340px;aspect-ratio:1/1;transform:translate(-50%,-50%);}
.igs-fx-battle-hit[data-igs-battle-target="sprite"] .igs-fx-battle-impact{height:44%;}
.igs-fx-battle-slash{position:absolute;left:-10%;right:-10%;top:50%;height:10px;margin-top:-5px;border-radius:50%;background:linear-gradient(90deg,transparent,#fff 45%,#fff 55%,transparent);box-shadow:0 0 14px 4px var(--igs-battle-accent);transform:rotate(-32deg) scaleX(0);animation:igs-battle-slash .5s cubic-bezier(.2,.9,.3,1) both;}
.igs-fx-battle-slash.is-cross{transform:rotate(32deg) scaleX(0);animation-name:igs-battle-slash-cross;animation-delay:.12s;}
.igs-fx-battle-hit[data-igs-battle-result="ko"] .igs-fx-battle-slash{height:16px;margin-top:-8px;box-shadow:0 0 22px 8px rgba(255,60,60,.85);}
.igs-fx-battle-hit[data-igs-battle-result="miss"] .igs-fx-battle-slash{opacity:.45;box-shadow:none;animation-name:igs-battle-slash-miss;}
.igs-fx-battle-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(255,255,240,.95),rgba(255,230,150,.5) 45%,transparent 75%);animation:igs-battle-flash .45s ease-out both;}
.igs-fx-battle-hit[data-igs-battle-result="ko"] .igs-fx-battle-flash{background:radial-gradient(circle at 50% 40%,rgba(255,240,240,.9),rgba(200,20,30,.55) 50%,rgba(80,0,0,.35) 100%);animation-duration:.8s;}
.igs-fx-battle-hurt{position:absolute;inset:0;box-shadow:inset 0 0 12vmin 3vmin rgba(210,0,20,.75);background:radial-gradient(ellipse at center,transparent 45%,rgba(160,0,10,.45) 100%);animation:igs-battle-hurt .7s ease-out both;}
.igs-fx-battle-hit[data-igs-battle-result="crit"] .igs-fx-battle-hurt,.igs-fx-battle-hit[data-igs-battle-result="ko"] .igs-fx-battle-hurt{animation-duration:1.1s;box-shadow:inset 0 0 18vmin 5vmin rgba(230,0,20,.85);}
.igs-fx-battle-shield{position:absolute;inset:14%;color:#8fd8ff;filter:drop-shadow(0 0 10px rgba(120,200,255,.9));animation:igs-battle-shield .9s ease-out both;}
.igs-fx-battle-spark{position:absolute;left:calc(22% + var(--i,0) * 11%);bottom:22%;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle,#fff,#7dffb0 45%,transparent 70%);animation:igs-battle-spark 1.1s ease-out both;animation-delay:calc(var(--i,0) * .07s);}
.igs-fx-battle-pop{position:absolute;left:50%;top:60%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;white-space:nowrap;animation:igs-battle-pop calc(var(--igs-battle-life,1.3s) * .85) cubic-bezier(.2,1.5,.4,1) both;animation-delay:.1s;}
.igs-fx-battle-pop-label{font-size:clamp(24px,5vw,38px);font-weight:800;font-style:italic;letter-spacing:.08em;color:#fff;text-shadow:0 0 1px rgba(0,0,0,.9),0 2px 12px rgba(0,0,0,.6);}
.igs-fx-battle-pop-dice{margin-bottom:4px;padding:0 6px 2px;background:linear-gradient(90deg,transparent,var(--igs-bt-rule),transparent) left bottom/100% 1px no-repeat;color:var(--igs-battle-accent);font-size:11px;font-weight:600;letter-spacing:.24em;text-shadow:0 1px 3px rgba(0,0,0,.85);}
.igs-fx-battle-pop-target{margin-top:2px;color:rgba(255,255,255,.84);font-size:12px;letter-spacing:.16em;text-shadow:0 1px 3px rgba(0,0,0,.85);}
.igs-fx-battle-hit[data-igs-battle-result="crit"] .igs-fx-battle-pop-label{color:var(--igs-battle-accent);font-size:clamp(30px,6.5vw,48px);}
.igs-fx-battle-hit[data-igs-battle-result="miss"] .igs-fx-battle-pop-label{color:#c8d0e0;}
.igs-fx-battle-hit[data-igs-battle-result="guard"] .igs-fx-battle-pop-label{color:#8fd8ff;}
.igs-fx-battle-hit[data-igs-battle-result="ko"] .igs-fx-battle-pop-label{color:#ff5a5a;}
.igs-fx-battle-hit[data-igs-battle-result="heal"] .igs-fx-battle-pop-label{color:#7dffb0;}
.igs-fx-battle-hit[data-igs-battle-target="player"]:not([data-igs-battle-result="heal"]):not([data-igs-battle-result="miss"]):not([data-igs-battle-result="guard"]) .igs-fx-battle-pop-label{color:#ff6a6a;}
.igs-fx-battle-hit[data-igs-battle-target="sprite"] .igs-fx-battle-pop{top:50%;}
.igs-fx-battle-result{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;}
.igs-fx-battle-result-veil{position:absolute;inset:0;background:rgba(0,0,0,.35);animation:igs-battle-veil var(--igs-battle-life,3s) ease-in-out both;}
.igs-fx-battle-result[data-igs-battle-result="lose"] .igs-fx-battle-result-veil{background:rgba(40,0,6,.55);backdrop-filter:grayscale(.85);-webkit-backdrop-filter:grayscale(.85);}
.igs-fx-battle-ribbon{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;box-sizing:border-box;min-width:min(460px,80%);padding:16px 64px 14px;background:linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left top/100% 1px no-repeat,linear-gradient(90deg,transparent,var(--igs-bt-rule) 28%,var(--igs-bt-rule) 72%,transparent) left bottom/100% 1px no-repeat,linear-gradient(90deg,transparent,var(--igs-bt-veil) 18%,var(--igs-bt-veil) 82%,transparent);color:var(--igs-bt-ink);text-align:center;animation:igs-battle-ribbon var(--igs-battle-life,3s) cubic-bezier(.2,1,.3,1) both;}
.igs-fx-battle-ribbon-title{font-size:clamp(30px,7vw,54px);font-weight:800;font-style:italic;letter-spacing:.16em;text-indent:.16em;line-height:1.15;color:var(--igs-battle-accent);text-shadow:var(--igs-bt-title-halo);}
.igs-fx-battle-ribbon-text{font-size:14px;letter-spacing:.5em;text-indent:.5em;opacity:.88;text-shadow:var(--igs-bt-halo);}
.igs-fx-battle-result[data-igs-battle-result="lose"]{--igs-bt-rule:color-mix(in srgb,var(--igs-bt-lose) 70%,transparent);}
.igs-fx-battle-result[data-igs-battle-result="lose"] .igs-fx-battle-ribbon-title{color:var(--igs-bt-lose);}
.igs-fx-battle-result[data-igs-battle-result="escape"]{--igs-bt-rule:color-mix(in srgb,var(--igs-bt-escape) 70%,transparent);}
.igs-fx-battle-result[data-igs-battle-result="escape"] .igs-fx-battle-ribbon-title{color:var(--igs-bt-escape);}
.igs-fx-battle-vignette.is-fantasy{background:radial-gradient(ellipse at center,transparent 50%,rgba(40,24,8,.45) 100%);}
.igs-fx-battle-vignette.is-scifi{background:radial-gradient(ellipse at center,transparent 50%,rgba(4,30,46,.5) 100%);}
.igs-fx-battle-vignette.is-apocalypse{background:radial-gradient(ellipse at center,transparent 45%,rgba(30,24,16,.55) 100%);}
.igs-fx-battle-plate.is-fantasy{--igs-bt-veil:rgba(36,24,12,.72);--igs-bt-rule:rgba(201,164,106,.8);--igs-bt-ink:#f1e4c6;--igs-bt-wipe:rgba(36,24,12,.9);font-family:Georgia,"Times New Roman",serif;}
.igs-fx-battle-encounter.is-fantasy,.igs-fx-battle-hit.is-fantasy,.igs-fx-battle-result.is-fantasy{--igs-bt-veil:rgba(36,24,12,.72);--igs-bt-rule:rgba(201,164,106,.8);--igs-bt-ink:#f1e4c6;--igs-bt-wipe:rgba(36,24,12,.9);}
.igs-fx-battle-plate.is-scifi{--igs-bt-veil:rgba(4,20,32,.72);--igs-bt-rule:rgba(80,220,255,.75);--igs-bt-ink:#d8fbff;--igs-bt-wipe:rgba(4,20,32,.9);--igs-bt-halo:0 0 8px rgba(60,200,255,.55),0 1px 3px rgba(0,0,0,.8);}
.igs-fx-battle-encounter.is-scifi,.igs-fx-battle-hit.is-scifi,.igs-fx-battle-result.is-scifi{--igs-bt-veil:rgba(4,20,32,.72);--igs-bt-rule:rgba(80,220,255,.75);--igs-bt-ink:#d8fbff;--igs-bt-wipe:rgba(4,20,32,.9);--igs-bt-halo:0 0 8px rgba(60,200,255,.55),0 1px 3px rgba(0,0,0,.8);}
.igs-fx-battle-plate.is-apocalypse{--igs-bt-veil:rgba(38,32,24,.72);--igs-bt-rule:rgba(200,150,80,.6);--igs-bt-ink:#e8dfcf;--igs-bt-wipe:rgba(38,32,24,.9);font-family:"Courier New",monospace;}
.igs-fx-battle-encounter.is-apocalypse,.igs-fx-battle-hit.is-apocalypse,.igs-fx-battle-result.is-apocalypse{--igs-bt-veil:rgba(38,32,24,.72);--igs-bt-rule:rgba(200,150,80,.6);--igs-bt-ink:#e8dfcf;--igs-bt-wipe:rgba(38,32,24,.9);}
.igs-fx-battle-encounter.is-fantasy .igs-fx-battle-vs,.igs-fx-battle-hit.is-fantasy .igs-fx-battle-skill,.igs-fx-battle-result.is-fantasy .igs-fx-battle-ribbon{font-family:Georgia,"Times New Roman",serif;}
.igs-fx-battle-encounter.is-scifi .igs-fx-battle-vs,.igs-fx-battle-hit.is-scifi .igs-fx-battle-skill,.igs-fx-battle-result.is-scifi .igs-fx-battle-ribbon{letter-spacing:.08em;filter:drop-shadow(0 0 8px rgba(60,200,255,.7));}
.igs-fx-battle-encounter.is-apocalypse .igs-fx-battle-vs,.igs-fx-battle-hit.is-apocalypse .igs-fx-battle-skill,.igs-fx-battle-result.is-apocalypse .igs-fx-battle-ribbon{font-family:"Courier New",monospace;filter:sepia(.35) saturate(.8);}
.igs-fx-battle-vignette.is-taisho{background:radial-gradient(ellipse at center,transparent 50%,rgba(50,16,12,.45) 100%);}
.igs-fx-battle-plate.is-taisho{--igs-bt-veil:rgba(40,16,14,.72);--igs-bt-rule:rgba(192,87,79,.75);--igs-bt-ink:#f4ead6;--igs-bt-wipe:rgba(40,16,14,.9);font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
.igs-fx-battle-encounter.is-taisho,.igs-fx-battle-hit.is-taisho,.igs-fx-battle-result.is-taisho{--igs-bt-veil:rgba(40,16,14,.72);--igs-bt-rule:rgba(192,87,79,.75);--igs-bt-ink:#f4ead6;--igs-bt-wipe:rgba(40,16,14,.9);}
.igs-fx-battle-encounter.is-taisho .igs-fx-battle-vs,.igs-fx-battle-hit.is-taisho .igs-fx-battle-skill,.igs-fx-battle-result.is-taisho .igs-fx-battle-ribbon{font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;filter:sepia(.25);}
.igs-fx-battle-vignette.is-horror{background:radial-gradient(ellipse at center,transparent 40%,rgba(40,0,4,.72) 100%);}
.igs-fx-battle-plate.is-horror{--igs-bt-veil:rgba(14,10,10,.8);--igs-bt-rule:rgba(150,16,24,.75);--igs-bt-ink:#e4dad4;--igs-bt-wipe:rgba(10,6,6,.92);--igs-bt-halo:0 1px 3px rgba(0,0,0,.95);}
.igs-fx-battle-encounter.is-horror,.igs-fx-battle-hit.is-horror,.igs-fx-battle-result.is-horror{--igs-bt-veil:rgba(14,10,10,.8);--igs-bt-rule:rgba(150,16,24,.75);--igs-bt-ink:#e4dad4;--igs-bt-wipe:rgba(10,6,6,.92);--igs-bt-halo:0 1px 3px rgba(0,0,0,.95);}
.igs-fx-battle-plate.is-horror,.igs-fx-battle-encounter.is-horror .igs-fx-battle-vs,.igs-fx-battle-hit.is-horror .igs-fx-battle-skill,.igs-fx-battle-result.is-horror .igs-fx-battle-ribbon{font-family:"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif;}
.igs-fx-battle-hit.is-horror .igs-fx-battle-slash{height:5px;margin-top:-2.5px;background:linear-gradient(90deg,transparent,rgba(120,8,14,.9) 25%,#d1121b 50%,rgba(120,8,14,.9) 75%,transparent);box-shadow:0 0 14px 4px rgba(160,10,18,.6);}
.igs-fx-battle-vignette.is-magic{background:radial-gradient(ellipse at center,transparent 48%,rgba(10,14,46,.55) 100%);}
.igs-fx-battle-plate.is-magic{--igs-bt-veil:rgba(14,18,42,.72);--igs-bt-rule:rgba(201,162,74,.85);--igs-bt-ink:#f3e2b6;--igs-bt-wipe:rgba(14,18,42,.9);--igs-bt-halo:0 0 8px rgba(255,214,120,.45),0 1px 3px rgba(0,0,0,.85);font-family:"IM Fell English",Georgia,"Times New Roman",serif;}
.igs-fx-battle-encounter.is-magic,.igs-fx-battle-hit.is-magic,.igs-fx-battle-result.is-magic{--igs-bt-veil:rgba(14,18,42,.72);--igs-bt-rule:rgba(201,162,74,.85);--igs-bt-ink:#f3e2b6;--igs-bt-wipe:rgba(14,18,42,.9);--igs-bt-halo:0 0 8px rgba(255,214,120,.45),0 1px 3px rgba(0,0,0,.85);}
.igs-fx-battle-encounter.is-magic .igs-fx-battle-vs,.igs-fx-battle-hit.is-magic .igs-fx-battle-skill,.igs-fx-battle-result.is-magic .igs-fx-battle-ribbon{font-family:"IM Fell English",Georgia,"Times New Roman",serif;filter:drop-shadow(0 0 8px rgba(255,214,120,.55));}
.igs-fx-battle-hit.is-magic .igs-fx-battle-slash{height:6px;margin-top:-3px;background:linear-gradient(90deg,transparent,rgba(255,236,170,.9) 30%,#fff 50%,rgba(170,210,255,.9) 70%,transparent);box-shadow:0 0 16px 5px rgba(255,214,120,.75),0 0 34px 10px rgba(140,180,255,.35);}
.igs-fx-battle-hit.is-magic[data-igs-battle-result="guard"] .igs-fx-battle-slash{background:linear-gradient(90deg,transparent,rgba(190,225,255,.9) 35%,#fff 50%,rgba(190,225,255,.9) 65%,transparent);box-shadow:0 0 18px 6px rgba(150,200,255,.75);}
.igs-fx-battle-hit.is-magic[data-igs-battle-result="heal"] .igs-fx-battle-slash{background:linear-gradient(90deg,transparent,rgba(170,255,190,.9) 35%,#fff 50%,rgba(170,255,190,.9) 65%,transparent);box-shadow:0 0 18px 6px rgba(120,240,160,.7);}
.igs-fx-battle-vignette.is-ancient{background:radial-gradient(ellipse at center,transparent 50%,rgba(26,18,12,.42) 100%);}
.igs-fx-battle-plate.is-ancient{padding:4px 16px 4px 5px;border:1px solid rgba(43,29,18,.8);border-radius:2px;background:linear-gradient(180deg,#f6ecd4,#e9dab4);color:#1a120c;box-shadow:0 3px 12px rgba(26,18,12,.35);font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;font-size:16px;letter-spacing:.12em;}
.igs-fx-battle-plate.is-ancient .igs-fx-battle-plate-mark{padding:1px 4px;border-radius:2px;background:#b8452f;color:#f6ecd4;font-size:13px;font-weight:400;font-style:normal;box-shadow:inset 0 0 0 1px rgba(246,236,212,.7);}
.igs-fx-battle-plate.is-ancient .igs-fx-battle-plate-name{text-shadow:none;}
.igs-fx-battle-encounter.is-ancient .igs-fx-battle-wipe{background:radial-gradient(ellipse at 28% 40%,rgba(150,110,60,.14),transparent 55%),radial-gradient(ellipse at 76% 70%,rgba(150,110,60,.1),transparent 50%),linear-gradient(180deg,#e6d5ae,#f6ecd4 16%,#f6ecd4 84%,#e6d5ae);box-shadow:0 10px 30px rgba(26,18,12,.45);}
.igs-fx-battle-encounter.is-ancient .igs-fx-battle-vs-portrait{animation-name:igs-battle-portrait-ink;}
.igs-fx-battle-encounter.is-ancient .igs-fx-battle-vs{gap:2px;color:#1a120c;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
.igs-fx-battle-encounter.is-ancient .igs-fx-battle-vs-cap{font-size:16px;font-weight:400;letter-spacing:.6em;color:#b8452f;text-shadow:none;}
.igs-fx-battle-encounter.is-ancient .igs-fx-battle-vs-foe{position:relative;font-size:clamp(42px,9vw,80px);font-weight:400;letter-spacing:.14em;line-height:1.15;color:#1a120c;text-shadow:0 0 1px #1a120c,2px 2px 0 rgba(26,18,12,.18),3px 4px 8px rgba(26,18,12,.25);}
.igs-fx-battle-encounter.is-ancient .igs-fx-battle-vs-title{font-size:16px;opacity:1;letter-spacing:.32em;color:#2b1d12;text-shadow:none;}
.igs-fx-battle-seal{position:absolute;left:100%;top:.05em;display:inline-flex;align-items:center;justify-content:center;width:1.5em;height:1.5em;border-radius:3px;background:#b8452f;color:#f6ecd4;font-size:clamp(14px,2.4vw,20px);letter-spacing:0;line-height:1;text-shadow:none;box-shadow:inset 0 0 0 2px #b8452f,inset 0 0 0 3.5px rgba(246,236,212,.75);transform:rotate(-6deg);opacity:.92;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-skill{z-index:1;top:clamp(30px,8%,76px);min-width:0;padding:0 .4em;border:0;background:none;box-shadow:none;color:#1a120c;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;transform:translateX(-50%) rotate(-5deg);animation-name:igs-battle-brush;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-skill::before{content:"";position:absolute;left:-22%;right:-22%;top:-14%;bottom:-8%;z-index:-1;background:radial-gradient(ellipse at 50% 58%,rgba(246,236,212,.94) 28%,rgba(246,236,212,.6) 55%,transparent 71%);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-skill-who{font-size:15px;opacity:1;letter-spacing:.3em;color:#b8452f;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-skill-name{font-size:clamp(40px,8.5vw,76px);font-weight:400;letter-spacing:.1em;line-height:1.1;text-shadow:0 0 1px #1a120c,2px 3px 0 rgba(26,18,12,.2),0 0 12px rgba(246,236,212,.9);}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="crit"] .igs-fx-battle-skill-name,.igs-fx-battle-hit.is-ancient[data-igs-battle-result="ko"] .igs-fx-battle-skill-name{color:#8f2616;text-shadow:0 0 1px #8f2616,2px 3px 0 rgba(26,18,12,.25),0 0 12px rgba(246,236,212,.9);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-slash{--igs-slash-rot:28deg;left:-95%;right:-95%;height:26px;margin-top:-13px;border-radius:0;background:none;box-shadow:none;filter:drop-shadow(0 0 4px rgba(246,236,212,.85));transform:rotate(var(--igs-slash-rot));animation:igs-battle-ink-slash .62s ease-out both;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-slash::before,.igs-fx-battle-hit.is-ancient .igs-fx-battle-slash::after{content:"";position:absolute;transform-origin:0 50%;animation:igs-battle-ink-sweep .2s cubic-bezier(.5,0,.2,1) both;animation-delay:inherit;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-slash::before{inset:0;background:linear-gradient(90deg,rgba(26,18,12,0),rgba(26,18,12,.85) 22%,#1a120c 62%,rgba(26,18,12,.7) 90%,rgba(26,18,12,0));clip-path:polygon(0 56%,24% 26%,64% 0,92% 34%,100% 50%,92% 60%,64% 100%,24% 74%);-webkit-mask:repeating-linear-gradient(180deg,#000 0 3px,rgba(0,0,0,.5) 3px 4px,#000 4px 7px);mask:repeating-linear-gradient(180deg,#000 0 3px,rgba(0,0,0,.5) 3px 4px,#000 4px 7px);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-slash::after{left:10%;right:8%;top:43%;height:14%;border-radius:50%;background:linear-gradient(90deg,transparent,rgba(255,253,244,.9) 30%,#fff 70%,transparent);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-slash.is-cross{--igs-slash-rot:-24deg;animation-delay:.12s;}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="crit"] .igs-fx-battle-slash{height:34px;margin-top:-17px;}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="crit"] .igs-fx-battle-slash.is-cross::before,.igs-fx-battle-hit.is-ancient[data-igs-battle-result="ko"] .igs-fx-battle-slash::before{background:linear-gradient(90deg,rgba(143,38,22,0),rgba(143,38,22,.9) 22%,#b8452f 55%,#5a160c 88%,rgba(90,22,12,0));}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="ko"] .igs-fx-battle-slash{height:40px;margin-top:-20px;box-shadow:none;}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="miss"] .igs-fx-battle-slash{--igs-slash-shift:-40px;opacity:.45;animation-name:igs-battle-ink-slash;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-flash{background:radial-gradient(circle at 50% 40%,rgba(255,252,240,.9),rgba(246,236,212,.45) 45%,transparent 75%);}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="ko"] .igs-fx-battle-flash{background:radial-gradient(circle at 50% 40%,rgba(246,236,212,.85),rgba(184,69,47,.45) 50%,rgba(26,18,12,.45) 100%);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-hurt{box-shadow:inset 0 0 12vmin 3vmin rgba(143,38,22,.7);background:radial-gradient(ellipse at center,transparent 45%,rgba(26,18,12,.45) 100%);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-shield{color:#e9d9ae;filter:drop-shadow(0 0 3px #1a120c) drop-shadow(0 0 10px rgba(246,236,212,.7));}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-spark{background:radial-gradient(circle,#fffbe8,#9fd4a8 45%,transparent 70%);}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-pop{gap:4px;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-pop-label{writing-mode:vertical-rl;padding:6px 4px;border-radius:3px;background:#b8452f;color:#f6ecd4!important;font-size:22px;font-weight:400;font-style:normal;line-height:1.05;letter-spacing:0;-webkit-text-stroke:0;text-shadow:none;box-shadow:inset 0 0 0 2px #b8452f,inset 0 0 0 3.5px rgba(246,236,212,.75),0 3px 8px rgba(26,18,12,.4);transform:rotate(-4deg);}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="crit"] .igs-fx-battle-pop-label,.igs-fx-battle-hit.is-ancient[data-igs-battle-result="ko"] .igs-fx-battle-pop-label{background:#9a2c1a;font-size:28px;box-shadow:inset 0 0 0 2px #9a2c1a,inset 0 0 0 4px rgba(246,236,212,.8),0 3px 10px rgba(26,18,12,.5);}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="miss"] .igs-fx-battle-pop-label,.igs-fx-battle-hit.is-ancient[data-igs-battle-result="guard"] .igs-fx-battle-pop-label,.igs-fx-battle-hit.is-ancient[data-igs-battle-result="heal"] .igs-fx-battle-pop-label{background:#f6ecd4;color:#2b1d12!important;box-shadow:inset 0 0 0 1.5px #2b1d12,0 3px 8px rgba(26,18,12,.4);}
.igs-fx-battle-hit.is-ancient[data-igs-battle-result="heal"] .igs-fx-battle-pop-label{color:#2f6b45!important;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-pop-dice{padding:0 8px;border:1px solid #b8452f;border-radius:1px;background:#f6ecd4;color:#b8452f;font-weight:400;letter-spacing:.3em;}
.igs-fx-battle-hit.is-ancient .igs-fx-battle-pop-target{padding:1px 10px;border-radius:1px;background:rgba(246,236,212,.92);color:#1a120c;font-size:14px;letter-spacing:.2em;text-shadow:none;}
.igs-fx-battle-result.is-ancient .igs-fx-battle-result-veil{background:rgba(26,18,12,.38);}
.igs-fx-battle-result.is-ancient[data-igs-battle-result="lose"] .igs-fx-battle-result-veil{background:rgba(26,18,12,.58);}
.igs-fx-battle-result.is-ancient .igs-fx-battle-ribbon{flex-direction:row;justify-content:center;gap:20px;min-width:min(420px,80%);padding:6px 80px;border:0;background:radial-gradient(ellipse at 30% 30%,rgba(150,110,60,.12),transparent 50%),linear-gradient(90deg,transparent,rgba(246,236,212,.96) 16%,rgba(246,236,212,.96) 84%,transparent);color:#1a120c;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
.igs-fx-battle-result.is-ancient .igs-fx-battle-ribbon-title{font-size:clamp(70px,14vw,124px);font-weight:400;font-style:normal;letter-spacing:0;line-height:1.1;color:#1a120c;text-shadow:0 0 1px #1a120c,3px 3px 0 rgba(26,18,12,.18),4px 6px 10px rgba(26,18,12,.25);}
.igs-fx-battle-result.is-ancient .igs-fx-battle-ribbon-text{writing-mode:vertical-rl;padding:8px 5px;border-radius:3px;background:#b8452f;color:#f6ecd4;font-size:19px;letter-spacing:.18em;text-shadow:none;box-shadow:inset 0 0 0 2px #b8452f,inset 0 0 0 3.5px rgba(246,236,212,.75);transform:rotate(-3deg);}
.igs-fx-battle-result.is-ancient[data-igs-battle-result="lose"] .igs-fx-battle-ribbon-title{color:#6e1f14;text-shadow:0 0 1px #6e1f14,3px 3px 0 rgba(26,18,12,.2),4px 6px 10px rgba(26,18,12,.3);}
.igs-fx-battle-result.is-ancient[data-igs-battle-result="lose"] .igs-fx-battle-ribbon-text{background:#2b1d12;box-shadow:inset 0 0 0 2px #2b1d12,inset 0 0 0 3.5px rgba(246,236,212,.6);}
.igs-fx-battle-result.is-ancient[data-igs-battle-result="escape"] .igs-fx-battle-ribbon-title{color:rgba(43,29,18,.72);text-shadow:0 0 1px rgba(43,29,18,.6),6px 0 8px rgba(43,29,18,.2);}
.igs-fx-battle-result.is-ancient[data-igs-battle-result="escape"] .igs-fx-battle-ribbon-text{background:#4f5d63;box-shadow:inset 0 0 0 2px #4f5d63,inset 0 0 0 3.5px rgba(246,236,212,.6);}
#igs-stage-motion[data-igs-fx-battle-motion="snappy"] .igs-fx-battle-vs,#igs-stage-motion[data-igs-fx-battle-motion="snappy"] .igs-fx-battle-skill,#igs-stage-motion[data-igs-fx-battle-motion="snappy"] .igs-fx-battle-pop,#igs-stage-motion[data-igs-fx-battle-motion="snappy"] .igs-fx-battle-ribbon,#igs-stage-motion[data-igs-fx-battle-motion="snappy"] .igs-fx-battle-plate{animation-timing-function:steps(4,end);}
#igs-stage-motion[data-igs-fx-battle-motion="snappy"] .igs-fx-battle-wipe{animation-timing-function:steps(6,end);}
#igs-stage-motion[data-igs-fx-battle-motion="snappy"][data-igs-fx-battle-shake]{animation-timing-function:steps(3,end);}
[data-igs-fx-static] .igs-fx-battle-wipe,[data-igs-fx-static] .igs-fx-battle-slash,[data-igs-fx-static] .igs-fx-battle-spark,[data-igs-fx-static] .igs-fx-battle-hurt,[data-igs-fx-static] .igs-fx-battle-flash{display:none;}
[data-igs-fx-static] *{animation:none!important;}
@keyframes igs-battle-portrait-in{0%{opacity:0;transform:translateX(24%);filter:brightness(0)}22%{opacity:1;transform:none;filter:brightness(0) drop-shadow(0 0 14px rgba(255,60,60,.85))}46%{filter:brightness(1) drop-shadow(0 0 16px rgba(255,60,60,.55))}82%{opacity:1}100%{opacity:0}}
@keyframes igs-battle-foe-life{0%{opacity:0;transform:translateX(-46%)}14%{opacity:1;transform:translateX(-50%)}84%{opacity:1}100%{opacity:0}}
@keyframes igs-battle-foe-hit{0%{transform:none;filter:none}35%{transform:translateX(3%) rotate(1.5deg);filter:brightness(2)}100%{transform:none;filter:none}}
@keyframes igs-battle-foe-crit{0%{transform:none;filter:none}30%{transform:translateX(6%) rotate(3deg);filter:brightness(2.8)}60%{transform:translateX(-1%)}100%{transform:none;filter:none}}
@keyframes igs-battle-foe-guard{0%,100%{transform:none}40%{transform:translateX(1.5%)}}
@keyframes igs-battle-foe-dodge{0%,100%{transform:none}45%{transform:translateX(-9%) rotate(-2deg)}}
@keyframes igs-battle-foe-heal{0%{filter:brightness(1.4) saturate(1.3)}100%{filter:none}}
@keyframes igs-battle-foe-ko{0%{transform:none;filter:brightness(2.2)}25%{transform:translateX(3%) rotate(2deg)}100%{transform:translate(1%,8%) rotate(1deg);filter:brightness(.5) saturate(.4);opacity:.35}}
@keyframes igs-battle-fade-in{from{opacity:0}to{opacity:1}}
@keyframes igs-battle-drop{from{opacity:0;transform:translate(-50%,-14px)}to{opacity:1;transform:translateX(-50%)}}
@keyframes igs-battle-wipe-a{0%{transform:skewY(-8deg) translateX(-110%)}28%,72%{transform:skewY(-8deg) translateX(0)}100%{transform:skewY(-8deg) translateX(110%)}}
@keyframes igs-battle-wipe-b{0%{transform:skewY(-8deg) translateX(110%)}28%,72%{transform:skewY(-8deg) translateX(0)}100%{transform:skewY(-8deg) translateX(-110%)}}
@keyframes igs-battle-vs{0%,20%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}32%{opacity:1;transform:translate(-50%,-50%) scale(1)}74%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.1)}}
@keyframes igs-battle-skill{0%{opacity:0;transform:translate(-50%,-8px)}14%{opacity:1;transform:translateX(-50%)}80%{opacity:1}100%{opacity:0}}
@keyframes igs-battle-slash{0%{transform:rotate(-32deg) scaleX(0);opacity:1}40%{transform:rotate(-32deg) scaleX(1);opacity:1}100%{transform:rotate(-32deg) scaleX(1.05) scaleY(.1);opacity:0}}
@keyframes igs-battle-slash-cross{0%{transform:rotate(32deg) scaleX(0);opacity:1}40%{transform:rotate(32deg) scaleX(1);opacity:1}100%{transform:rotate(32deg) scaleX(1.05) scaleY(.1);opacity:0}}
@keyframes igs-battle-slash-miss{0%{transform:rotate(-32deg) translateY(-40px) scaleX(0)}50%{transform:rotate(-32deg) translateY(-40px) scaleX(1);opacity:.45}100%{transform:rotate(-32deg) translateY(-40px) scaleX(1);opacity:0}}
@keyframes igs-battle-flash{0%{opacity:0}15%{opacity:1}100%{opacity:0}}
@keyframes igs-battle-hurt{0%{opacity:0}12%{opacity:1}30%{opacity:.55}45%{opacity:.9}100%{opacity:0}}
@keyframes igs-battle-shield{0%{opacity:0;transform:scale(.4)}25%{opacity:1;transform:scale(1.08)}40%{transform:scale(1)}100%{opacity:0;transform:scale(1.15)}}
@keyframes igs-battle-spark{0%{opacity:0;transform:translateY(0) scale(.4)}25%{opacity:1}100%{opacity:0;transform:translateY(-140px) scale(1.2)}}
@keyframes igs-battle-pop{0%{opacity:0;transform:translate(-50%,16px) scale(.6)}25%{opacity:1;transform:translate(-50%,0) scale(1.08)}35%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-12px)}}
@keyframes igs-battle-veil{0%{opacity:0}12%,85%{opacity:1}100%{opacity:0}}
@keyframes igs-battle-ribbon{0%{opacity:0;transform:scaleX(.1)}14%{opacity:1;transform:scaleX(1)}86%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1.05)}}
@keyframes igs-battle-portrait-ink{0%{opacity:0;transform:translateX(24%);filter:grayscale(1) brightness(.12)}22%{opacity:1;transform:none;filter:grayscale(1) brightness(.12) drop-shadow(0 0 12px rgba(26,18,12,.7))}46%{filter:sepia(.3) drop-shadow(0 0 10px rgba(26,18,12,.45))}82%{opacity:1}100%{opacity:0}}
@keyframes igs-battle-brush{0%{opacity:0;transform:translateX(-50%) rotate(-5deg) scale(1.2);clip-path:inset(-20% 100% -20% -20%);filter:blur(2px)}16%{opacity:1;transform:translateX(-50%) rotate(-5deg) scale(1);clip-path:inset(-20% -20% -20% -20%);filter:none}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) rotate(-5deg) scale(1.03);clip-path:inset(-20% -20% -20% -20%)}}
@keyframes igs-battle-ink-slash{0%,55%{opacity:1;transform:rotate(var(--igs-slash-rot,28deg)) translateY(var(--igs-slash-shift,0px))}100%{opacity:0;transform:rotate(var(--igs-slash-rot,28deg)) translateY(var(--igs-slash-shift,0px)) translateX(3%) scaleY(.35)}}
@keyframes igs-battle-ink-sweep{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion: reduce){#igs-stage-motion[data-igs-fx-battle-shake]{animation:none!important;}.igs-fx-battle-wipe,.igs-fx-battle-slash,.igs-fx-battle-spark,.igs-fx-battle-flash,.igs-fx-battle-hurt{display:none!important;}}
`;
