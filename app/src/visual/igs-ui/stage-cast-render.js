import { normalizeRomanceFxSettings, resolveRomanceLevel, resolveRomanceRivalTarget } from './romance-settings.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { SPRITE_ACTION_KINDS, normalizeCameraSettings, normalizeSpriteActionSettings, normalizeSpriteMotionSettings, normalizeStageCastSettings, pickCloseUp } from './stage-direction-settings.js';
import { MANGA_SYMBOL_KINDS, normalizeMangaFxSettings } from './fx-settings.js';
import { findCalledCast } from '../../scene/stage-cast.js';
import { CAST_CALLED_FRAME, CAST_DIM_FRAME, CAST_FOCUS_FRAME, CAST_HANDOFF_MS, CAST_LIT_FRAME, CAST_MOVE_MS, CAST_SLIDE_PCT, castSideOf } from './stage-cast-motion.js';
import { playSpriteAction } from './sprite-actions.js';
import { decodeSpriteImage } from './stage-direction-runtime.js';
import { peekSpriteHead, spriteBackgroundSize, spriteWidthPercent } from './fx-anchor.js';

const NARROW_MODES = new Set(['mobile', 'embedded']);
const NARROW_STAGE_WIDTH = 768;
// background-position 百分比是「图上该比例点对齐容器该比例点」，不是中心坐标。
const SLOT_POS_X = Object.freeze({ 2: Object.freeze([18, 82]), 3: Object.freeze([6, 50, 94]) });
const FADE_MS = 220;
const SWAP_FADE_MS = 180;

export const STAGE_CAST_STYLE_TEXT = `
#igs-cast{position:absolute;inset:0;z-index:2;pointer-events:none;}
#igs-cast .igs-cast-sprite{position:absolute;inset:0;background-repeat:no-repeat;pointer-events:none;transform-origin:var(--igs-cast-origin-x,50%) 100%;}
#igs-cast .igs-cast-sprite:not([data-igs-cast-ghost]){transition:rotate .6s ease;}
#igs-overlay[data-igs-cast-breathe]:not([data-igs-quality="low"]) #igs-cast .igs-cast-sprite:not([data-igs-cast-leaving]):not([data-igs-cast-ghost]){animation:igs-sd-breathe var(--igs-cast-breathe,5.2s) ease-in-out var(--igs-cast-delay,0s) infinite;}
#igs-overlay[data-igs-sd-parallax] #igs-cast{translate:calc(var(--igs-sd-px,0) * -12px) calc(var(--igs-sd-py,0) * -5px);transition:translate .6s cubic-bezier(.2,.7,.3,1);}
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-cast,
#igs-stage-motion[data-igs-fx-call="video"] #igs-cast,
#igs-stage-motion[data-igs-fx-call-remote] #igs-cast,
#igs-overlay.igs-record-screen-open #igs-cast{visibility:hidden!important;}
#igs-stage-motion[data-igs-fx-flashback] #igs-cast{filter:sepia(.55) saturate(.55) brightness(.92) contrast(.95);}
#igs-stage-motion[data-igs-fx-dream] #igs-cast{filter:saturate(.78) brightness(1.02) contrast(.96);}
#igs-stage-motion[data-igs-cast-romance="recede"]:not([data-igs-fx-flashback]):not([data-igs-fx-dream]) #igs-cast{filter:var(--igs-grade-sprite,) blur(2px) brightness(.8);-webkit-filter:var(--igs-grade-sprite,) blur(2px) brightness(.8);transition:filter 1.2s ease,translate .6s cubic-bezier(.2,.7,.3,1);}
#igs-stage-motion[data-igs-cast-romance="recede-lite"]:not([data-igs-fx-flashback]):not([data-igs-fx-dream]) #igs-cast{filter:var(--igs-grade-sprite,) brightness(.75);-webkit-filter:var(--igs-grade-sprite,) brightness(.75);transition:filter 1.2s ease,translate .6s cubic-bezier(.2,.7,.3,1);}
@media (prefers-reduced-motion: reduce){#igs-cast .igs-cast-sprite{animation:none!important;rotate:none!important;transition:none!important;}}
#igs-cast-edit-surface{position:absolute;inset:0;z-index:3;cursor:grab;touch-action:none;}
#igs-stage-motion[data-igs-cast-editing] #igs-cast .igs-cast-sprite:not(.igs-cast-editing),#igs-stage-motion[data-igs-cast-editing] #igs-sprite:not(.igs-cast-editing){opacity:.45;}
`.trim();

export function castSlotKey(mode, count, index, identity) {
    return `${mode}::${count}::${index}::${identity}`;
}

export function resolveCastCapacity(mode, stage = {}) {
    if (NARROW_MODES.has(mode)) return 2;
    if (mode === 'web' || mode === 'fullscreen') {
        const width = Number(stage.width) || 0;
        const height = Number(stage.height) || 0;
        if (width > 0 && (width < NARROW_STAGE_WIDTH || (height > width))) return 2;
    }
    return 3;
}

// 说话人有图时必定上台，其余按最近开口截断；上台的人按本场景首次开口顺序从左到右排。
// pin 是必须保留的陪衬（修罗场的恋爱对象）：截断时先留它，再按最近开口补位；不在 members 里时忽略。
// 只剩一人时返回 multi=false，调用方走原有单人布局。
export function layoutCastSlots({ members = [], speakerOrder = null, hasSpeaker = false, capacity = 3, pin = '' } = {}) {
    const seats = Math.max(1, Math.min(3, Math.floor(Number(capacity)) || 1));
    const pinned = pin ? members.filter((m) => m && m.character === pin) : [];
    const ranked = pinned.length ? [...pinned, ...members.filter((m) => !m || m.character !== pin)] : members;
    const kept = ranked.slice(0, hasSpeaker ? seats - 1 : seats);
    const onStage = kept.map((m) => ({ ...m, speaker: false }));
    if (hasSpeaker) onStage.push({ speaker: true, order: Number.isFinite(speakerOrder) ? speakerOrder : Number.MAX_SAFE_INTEGER });
    if (onStage.length < 2) {
        return { multi: false, speakerPosX: null, speakerSlot: null, count: onStage.length, members: kept.map((m) => ({ ...m, posX: null, slotIndex: null })) };
    }
    onStage.sort((a, b) => a.order - b.order);
    const slots = SLOT_POS_X[onStage.length];
    let speakerPosX = null;
    let speakerSlot = null;
    const placed = [];
    onStage.forEach(({ speaker, ...m }, index) => {
        if (speaker) {
            speakerPosX = slots[index];
            speakerSlot = index;
        } else {
            placed.push({ ...m, posX: slots[index], slotIndex: index });
        }
    });
    return { multi: true, speakerPosX, speakerSlot, count: onStage.length, members: placed };
}

// 特写、NSFW、HTML 卡片与单人立绘编辑都只围绕说话人，这些情况收成单人；恋爱演出按 resolveCastRomanceMode 决定。
export function isCastCollapsed(snapshot, { spriteEditMode = false } = {}) {
    const content = (snapshot && snapshot.content) || {};
    const reader = (snapshot && snapshot.readerSettings) || {};
    if (spriteEditMode || content.sceneNsfw === true || content.htmlCardPage === true) return true;
    if (resolveCastRomanceMode(snapshot) === 'collapse') return true;
    return pickCloseUp(content.statusEmotion, normalizeCameraSettings(reader.camera));
}

// 修罗场对象：对象栏写了人、不是说话人、且在陪衬名单（content.castSprites）里时返回其角色名，否则 ''。
export function resolveCastRomanceTarget(snapshot) {
    const content = (snapshot && snapshot.content) || {};
    const reader = (snapshot && snapshot.readerSettings) || {};
    const assets = reader._sceneAssets && typeof reader._sceneAssets === 'object' ? reader._sceneAssets : {};
    const keyOf = (name) => {
        const raw = String(name || '').trim();
        return raw ? resolveCharacterKey(assets.characters, assets.characterAliases, raw) || raw : '';
    };
    const target = resolveRomanceRivalTarget(content.fx, keyOf(content.spriteCharacter || content.speaker), keyOf);
    if (!target) return '';
    const cast = Array.isArray(content.castSprites) ? content.castSprites : [];
    return cast.some((m) => m && m.character === target) ? target : '';
}

// 恋爱演出下的同屏模式：
// 'none' 无恋爱档位；'recede' 暧昧档且非修罗场，保留陪衬、整层退到背景；
// 'rival' 暧昧或亲密档且对象在台上、不是说话人，保留陪衬、对象提亮；
// 'collapse' 亲密档非修罗场 / NSFW，收成单人。子开关 stageCast.romanceDuo 关闭时，有档位即 'collapse'（与旧行为一致）。
export function resolveCastRomanceMode(snapshot) {
    const content = (snapshot && snapshot.content) || {};
    const reader = (snapshot && snapshot.readerSettings) || {};
    const pageKind = content.textType === 'chat' ? 'chat' : 'text';
    const level = resolveRomanceLevel({
        settings: normalizeRomanceFxSettings(reader.romanceFx), fx: content.fx || null, nsfw: content.sceneNsfw === true, pageKind,
    });
    if (!level) return 'none';
    if (level === 3 || !normalizeStageCastSettings(reader.stageCast).romanceDuo) return 'collapse';
    if (resolveCastRomanceTarget(snapshot)) return 'rival';
    return level === 1 ? 'recede' : 'collapse';
}

// #igs-stage-motion 上 data-igs-cast-romance 的取值：暧昧退场在手机与楼层内嵌上只压暗不模糊；无需标记时返回 ''。
export function castRomanceAttr(mode, romanceMode) {
    if (romanceMode === 'recede') return NARROW_MODES.has(mode) ? 'recede-lite' : 'recede';
    return romanceMode === 'rival' ? 'rival' : '';
}

export const CAST_LEAN_DEG = 0.8;

// 陪衬朝向说话人：返回独立 rotate 属性的角度（原点在脚底，正值头部向右）。
// 陪衬在说话人左边往右倾，在右边往左倾；没有说话人、坐标无效或同一位置时不倾。
export function castLeanOf(memberX, speakerX) {
    if (memberX == null || speakerX == null) return 0;
    const m = Number(memberX);
    const s = Number(speakerX);
    if (!Number.isFinite(m) || !Number.isFinite(s) || m === s) return 0;
    return m < s ? CAST_LEAN_DEG : -CAST_LEAN_DEG;
}

// 陪衬呼吸相位：按角色名做 FNV-1a 哈希，同一角色每次得到相同的周期（4.8～5.8s）和延迟（0～2s），不同角色错开。
export function castBreathePhase(name) {
    const raw = String(name == null ? '' : name);
    let h = 0x811c9dc5;
    for (let i = 0; i < raw.length; i += 1) {
        h ^= raw.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return {
        period: Math.round((4.8 + (h % 1001) / 1000) * 100) / 100,
        delay: Math.round((((h >>> 10) % 2001) / 1000) * 100) / 100,
    };
}

// lean：{ speakerX, keep } 或 null（由调用方在关闭 / 暧昧退场 / 减少动效时传 null）；keep 为旁白页，维持上一页朝向。
function applyLean(el, lean, posX) {
    if (!lean) {
        setStyleProp(el, 'rotate', '');
        el._igsCastLean = 0;
        return;
    }
    if (lean.keep && el._igsCastLean !== undefined) return;
    const deg = castLeanOf(posX, lean.speakerX);
    el._igsCastLean = deg;
    setStyleProp(el, 'rotate', deg ? `${deg}deg` : '');
}

export function isStageCastEnabled(snapshot) {
    return normalizeStageCastSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.stageCast).enabled;
}

export function isCastAlignEnabled(snapshot) {
    return normalizeStageCastSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.stageCast).alignHeads;
}

export function isCastRomanceDuoEnabled(snapshot) {
    return normalizeStageCastSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.stageCast).romanceDuo;
}

// 陪衬朝向说话人：spriteMotion.enabled 与 spriteMotion.castLean 同时开启才生效。
export function isCastLeanEnabled(snapshot) {
    const motion = normalizeSpriteMotionSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.spriteMotion);
    return motion.enabled && motion.castLean;
}

function stopAnim(el) {
    for (const key of ['_igsCastAnim', '_igsCastSlide', '_igsCastEnter']) {
        if (!el[key]) continue;
        try { el[key].cancel(); } catch { /* 已结束 */ }
        el[key] = null;
    }
}

function play(el, frames, duration, fill, done) {
    if (typeof el.animate !== 'function') {
        if (done) done();
        return null;
    }
    const anim = el.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.3,1)', fill });
    if (done) anim.onfinish = done;
    return anim;
}

function cssUrl(url) {
    return `url("${String(url).replace(/"/g, '&quot;')}")`;
}

// 同一角色换图直接切。入场仍等图片解码完再显示，避免空一帧。
function swapImage(layer, el, image, instant) {
    const prev = el.style.backgroundImage;
    if (prev === image) return;
    const doc = layer.ownerDocument;
    if (prev && !instant && doc && typeof doc.createElement === 'function') {
        const ghost = doc.createElement('div');
        ghost.className = 'igs-cast-sprite';
        ghost.setAttribute('data-igs-cast-ghost', '1');
        ghost.style.backgroundImage = prev;
        ghost.style.backgroundSize = el.style.backgroundSize;
        ghost.style.backgroundPosition = el.style.backgroundPosition;
        setStyleProp(ghost, '--igs-cast-origin-x', getStyleProp(el, '--igs-cast-origin-x'));
        setStyleProp(ghost, 'rotate', getStyleProp(el, 'rotate'));
        setStyleProp(ghost, 'scale', getStyleProp(el, 'scale'));
        ghost.style.filter = CAST_DIM_FRAME;
        ghost.style.setProperty('-webkit-filter', CAST_DIM_FRAME);
        layer.appendChild(ghost);
        play(ghost, [{ opacity: 1 }, { opacity: 0 }], SWAP_FADE_MS, 'forwards', () => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); });
    }
    el.style.backgroundImage = image;
}

function setStyleProp(el, name, value) {
    const style = el && el.style;
    if (!style) return;
    if (value) {
        if (typeof style.setProperty === 'function') style.setProperty(name, value);
    } else if (typeof style.removeProperty === 'function') {
        style.removeProperty(name);
    }
}

function getStyleProp(el, name) {
    const style = el && el.style;
    return style && typeof style.getPropertyValue === 'function' ? style.getPropertyValue(name) || '' : '';
}

// 滑入 / 滑出：透明度单独播；位移用 composite:'add' 叠在 CSS 呼吸上，不把呼吸的 transform 盖掉。
function playSlide(el, posX, reduced, entering, duration, fill, done) {
    const side = reduced ? 0 : castSideOf(posX);
    const opacity = entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
    const anim = play(el, opacity, duration, fill, done);
    if (side && anim) {
        const offset = { transform: `translateX(${side * CAST_SLIDE_PCT}%)` };
        const rest = { transform: 'translateX(0)' };
        try {
            el._igsCastSlide = el.animate(entering ? [offset, rest] : [rest, offset], {
                duration, easing: 'cubic-bezier(.2,.7,.3,1)', fill, composite: 'add',
            });
        } catch {
            el._igsCastSlide = null;
        }
    }
    return anim;
}

// 头部对齐等待上限，与立绘解码超时一致；超时后不再等对齐，直接滑入。
export const CAST_ALIGN_WAIT_MS = 1500;

function waitAlign(ready) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, CAST_ALIGN_WAIT_MS);
        Promise.resolve(ready).catch(() => null).then(() => { clearTimeout(timer); resolve(); });
    });
}

// members: [{ character, url, posX, posY, scale }]；同一角色复用元素，按角色名对比前后两次：
// 新上台从近侧滑入，换槽位的平移过去，下台的往近侧滑出后移除。
// 新图先解码再换上或滑入，解码期间保留旧图；同一角色换图时旧图淡出。
// motion.reduced 时只淡入淡出；motion.handoff.demoted 直接出现并由亮转暗，motion.handoff.promoted 立即移除（由 #igs-sprite 接手）。
export function applyCastToDom(root, members = [], motion = {}) {
    const layer = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-cast') : null;
    if (!layer) return { count: 0 };
    const doc = layer.ownerDocument;
    const reduced = motion.reduced === true;
    const focus = String(motion.focus || '');
    const handoff = motion.handoff || {};
    const lean = motion.lean || null;
    const entrances = motion.entrances && typeof motion.entrances === 'object' ? motion.entrances : {};
    // ready：头部对齐重排完成的信号（探测未就绪时由渲染层传入）；只有新上台的陪衬等它，超时兜底后照常滑入。
    const ready = motion.ready && typeof motion.ready.then === 'function' ? motion.ready : null;
    const existing = new Map();
    for (const el of Array.from(layer.children || [])) {
        const key = el.getAttribute && el.getAttribute('data-igs-cast-char');
        if (key != null) existing.set(key, el);
    }
    for (const m of members) {
        let el = existing.get(m.character);
        existing.delete(m.character);
        const leaving = Boolean(el) && el.hasAttribute('data-igs-cast-leaving');
        const fromX = el && !leaving ? el._igsCastX : null;
        if (!el) {
            if (!doc || typeof doc.createElement !== 'function') continue;
            el = doc.createElement('div');
            el.className = 'igs-cast-sprite';
            el.setAttribute('data-igs-cast-char', m.character);
            layer.appendChild(el);
        }
        if (leaving) el.removeAttribute('data-igs-cast-leaving');
        const image = cssUrl(m.url);
        const entering = fromX == null;
        const demotedIn = entering && m.character === handoff.demoted && !reduced;
        const pendingSame = Boolean(el._igsCastPending) && el._igsCastPending.url === m.url;
        // 退下来的说话人图片刚在 #igs-sprite 上显示过，不必再等解码。
        const decode = pendingSame || demotedIn || el.style.backgroundImage === image ? null : decodeSpriteImage(doc, m.url);
        // 新上台且对齐未就绪：等对齐重排后再滑入，避免先按未对齐的样子出现再跳。
        const wait = entering && ready && !pendingSame && !demotedIn ? Promise.all([decode, waitAlign(ready)]) : decode;
        if (!pendingSame) el._igsCastPending = null;
        el.style.backgroundSize = spriteBackgroundSize(m.scale);
        el.style.backgroundPosition = `${m.posX}% ${m.posY}%`;
        const focused = Boolean(focus) && m.character === focus;
        const baseFrame = focused ? CAST_FOCUS_FRAME : (m.called === true || m.front === true) ? CAST_CALLED_FRAME : CAST_DIM_FRAME;
        const enhance = typeof motion.spriteEnhance === 'string' ? motion.spriteEnhance : '';
        const frame = enhance ? `${baseFrame} ${enhance}` : baseFrame;
        const prevFrame = el.style.filter;
        el.style.filter = frame;
        el.style.setProperty('-webkit-filter', frame);
        if (focused) el.setAttribute('data-igs-cast-focus', '1');
        else el.removeAttribute('data-igs-cast-focus');
        if (!entering && !reduced && prevFrame && prevFrame !== frame) play(el, [{ filter: prevFrame }, { filter: frame }], CAST_HANDOFF_MS, 'backwards');
        el._igsCastX = m.posX;
        // 背对（第四批）：整张立绘水平翻转，用空闲的独立属性 scale；原点移到图的中心，镜像不整体平移。
        const flipped = m.flip === true;
        const host = el.parentNode;
        const probed = peekSpriteHead(m.url);
        const widthPct = spriteWidthPercent(host && host.clientWidth, host && host.clientHeight, { posX: m.posX, posY: m.posY, scale: m.scale, naturalW: probed && probed.naturalW, naturalH: probed && probed.naturalH });
        setStyleProp(el, '--igs-cast-origin-x', `${flipped ? castFlipOriginX(m.posX, widthPct) : m.posX}%`);
        setStyleProp(el, 'scale', flipped ? '-1 1' : '');
        if (flipped) el.setAttribute('data-igs-cast-flip', '1');
        else el.removeAttribute('data-igs-cast-flip');
        // 呼吸由根节点 data-igs-cast-breathe（舞台调度写入）控制；相位变量常驻，开关切换时不重新起步。
        const phase = castBreathePhase(m.character);
        setStyleProp(el, '--igs-cast-breathe', `${phase.period}s`);
        setStyleProp(el, '--igs-cast-delay', `${phase.delay}s`);
        applyLean(el, lean, m.posX);
        const show = () => {
            swapImage(layer, el, image, true);
            if (!entering) return;
            stopAnim(el);
            el._igsCastAnim = demotedIn
                ? play(el, [{ filter: CAST_LIT_FRAME }, { filter: CAST_DIM_FRAME }], CAST_HANDOFF_MS, 'backwards')
                : playEntrance(el, m.posX, reduced, entrances[m.character] || '');
        };
        if (wait) {
            const pending = { url: m.url };
            el._igsCastPending = pending;
            wait.then(() => {
                if (el._igsCastPending !== pending) return;
                el._igsCastPending = null;
                if (el.parentNode && !el.hasAttribute('data-igs-cast-leaving')) show();
            });
        } else if (!pendingSame) {
            show();
        }
        if (!entering && Number(fromX) !== Number(m.posX) && !reduced) {
            stopAnim(el);
            el._igsCastAnim = play(el, [{ backgroundPosition: `${fromX}% ${m.posY}%` }, { backgroundPosition: `${m.posX}% ${m.posY}%` }], CAST_MOVE_MS, 'backwards');
        }
    }
    for (const [character, el] of existing) {
        if (el.hasAttribute('data-igs-cast-leaving')) continue;
        stopAnim(el);
        stopBeat(el);
        el._igsCastPending = null;
        if (character === handoff.promoted) {
            if (el.parentNode) el.parentNode.removeChild(el);
            continue;
        }
        el.setAttribute('data-igs-cast-leaving', '1');
        el._igsCastAnim = playSlide(el, el._igsCastX, reduced, false, FADE_MS, 'forwards', () => {
            if (el.hasAttribute('data-igs-cast-leaving') && el.parentNode) el.parentNode.removeChild(el);
        });
    }
    layer.style.display = Array.from(layer.children || []).length ? '' : 'none';
    return { count: members.length };
}

export function clearCastDom(root) {
    const layer = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-cast') : null;
    if (!layer) return;
    for (const el of Array.from(layer.children || [])) {
        stopAnim(el);
        stopBeat(el);
        layer.removeChild(el);
    }
    layer.style.display = 'none';
}

function stopBeat(el) {
    if (!el || !el._igsCastBeat) return;
    try { el._igsCastBeat.cancel(); } catch { /* 已结束 */ }
    el._igsCastBeat = null;
}

// 陪衬情绪动作（react 标签、全员小跳）：beats = [{ character, kind }]，kind 为 SPRITE_ACTION_FRAMES 的键。
// 先取消所有陪衬上一轮的动作（sink 为 fill:'forwards'，不取消会一直沉着），再对在台且未离场的陪衬播放；
// 同一角色只播第一条。返回实际播放的 [{ character, kind }]。
export function playCastBeats(root, beats = [], { reduced = false } = {}) {
    const layer = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-cast') : null;
    if (!layer) return [];
    const els = new Map();
    for (const el of Array.from(layer.children || [])) {
        stopBeat(el);
        const key = el.getAttribute && el.getAttribute('data-igs-cast-char');
        if (key != null && !el.hasAttribute('data-igs-cast-leaving')) els.set(key, el);
    }
    const played = [];
    for (const beat of Array.isArray(beats) ? beats : []) {
        const el = beat && els.get(beat.character);
        if (!el || el._igsCastBeat) continue;
        const anim = playSpriteAction(el, beat.kind, { reduced });
        if (!anim) continue;
        el._igsCastBeat = anim;
        played.push({ character: beat.character, kind: beat.kind });
    }
    return played;
}

export const CAST_REACT_ALL = '全员';

// 陪衬反应规划（纯函数）：reacts 为 fx.reacts（[{ target, emotion }]），members 为在台陪衬（[{ character }]）。
// symbols / actions 为已规范化的漫画符号词表（mangaFx.symbols）与动作词表（spriteActions），只读词表不看各自总开关。
// 情绪词命中符号与动作时两者都播；都不中只小跳；目标写「全员」时作用于全部陪衬，不在台上的目标丢弃。
// 说话人情绪命中 surprise 符号词表时，所有尚无动作的陪衬再小跳一次。同一角色的符号与动作各只取第一条。
export function planCastReacts({ reacts = [], members = [], keyOf = (name) => name, symbols = {}, actions = {}, speakerEmotion = '' } = {}) {
    const onStage = (Array.isArray(members) ? members : []).map((m) => String((m && m.character) || '')).filter(Boolean);
    const listHas = (map, kind, word) => Boolean(map) && Array.isArray(map[kind]) && map[kind].includes(word);
    const symbolOf = (word) => (word ? MANGA_SYMBOL_KINDS.find((kind) => listHas(symbols, kind, word)) || '' : '');
    const actionOf = (word) => (word ? SPRITE_ACTION_KINDS.find((kind) => listHas(actions, kind, word)) || '' : '');
    const beats = [];
    const marks = [];
    const hasBeat = new Set();
    const hasMark = new Set();
    for (const react of Array.isArray(reacts) ? reacts : []) {
        const raw = String((react && react.target) || '').trim();
        if (!raw) continue;
        const emotion = String((react && react.emotion) || '').trim();
        const key = raw === CAST_REACT_ALL ? '' : String(keyOf(raw) || raw);
        const targets = raw === CAST_REACT_ALL ? onStage : onStage.filter((c) => c === key);
        const symbol = symbolOf(emotion);
        const action = actionOf(emotion) || (symbol ? '' : 'hop');
        for (const character of targets) {
            if (symbol && !hasMark.has(character)) {
                hasMark.add(character);
                marks.push({ character, kind: symbol });
            }
            if (action && !hasBeat.has(character)) {
                hasBeat.add(character);
                beats.push({ character, kind: action });
            }
        }
    }
    const speaker = String(speakerEmotion || '').trim();
    if (speaker && listHas(symbols, 'surprise', speaker)) {
        for (const character of onStage) {
            if (hasBeat.has(character)) continue;
            hasBeat.add(character);
            beats.push({ character, kind: 'hop' });
        }
    }
    return { beats, marks };
}

// 本页陪衬反应（stageCast.castReact）：点名提亮名单、陪衬动作与符号。子开关关闭或没有陪衬时返回空计划。
export function resolveCastReactPage(snapshot, members = []) {
    const empty = { called: [], beats: [], marks: [] };
    const reader = (snapshot && snapshot.readerSettings) || {};
    const cast = normalizeStageCastSettings(reader.stageCast);
    if (!cast.enabled || !cast.castReact || !Array.isArray(members) || !members.length) return empty;
    const content = (snapshot && snapshot.content) || {};
    const assets = reader._sceneAssets && typeof reader._sceneAssets === 'object' ? reader._sceneAssets : {};
    const keyOf = (name) => {
        const raw = String(name || '').trim();
        return raw ? resolveCharacterKey(assets.characters, assets.characterAliases, raw) || raw : '';
    };
    const plan = planCastReacts({
        reacts: (content.fx && Array.isArray(content.fx.reacts)) ? content.fx.reacts : [],
        members,
        keyOf,
        symbols: normalizeMangaFxSettings(reader.mangaFx).symbols,
        actions: normalizeSpriteActionSettings(reader.spriteActions),
        speakerEmotion: content.sceneNsfw === true ? '' : content.statusEmotion,
    });
    return { called: findCalledCast(content.displayText, members, assets.characterAliases), ...plan };
}

// 给点名命中的陪衬条目打上 called 标记，其余原样返回。
export function markCalledCast(members = [], called = []) {
    if (!Array.isArray(called) || !called.length) return members;
    return members.map((m) => (m && called.includes(m.character) ? { ...m, called: true } : m));
}


// 入场方式（第四批 stage 标签，只在该角色上台那一页生效）：跑进来 = 侧滑 + 两下弹跳；探头 = 先探出一截、停一下再走到槽位；慢慢走进来 = 900ms 侧滑。
export const CAST_ENTRANCE_SLOW_MS = 900;
export const CAST_ENTRANCE_PEEK_MS = 1100;
const CAST_PEEK_PCT = 20;

function playEntrance(el, posX, reduced, kind) {
    if (reduced || !kind) return playSlide(el, posX, reduced, true, reduced ? FADE_MS : FADE_MS + 120, 'backwards');
    if (kind === 'slow') return playSlide(el, posX, false, true, CAST_ENTRANCE_SLOW_MS, 'backwards');
    if (kind === 'peek') {
        const side = castSideOf(posX) || -1;
        const anim = play(el, [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 1 }], CAST_ENTRANCE_PEEK_MS, 'backwards');
        if (anim) {
            const out = { transform: `translateX(${side * CAST_PEEK_PCT}%)` };
            try {
                el._igsCastSlide = el.animate([{ ...out, offset: 0 }, { ...out, offset: 0.45 }, { transform: 'translateX(0)', offset: 1 }], {
                    duration: CAST_ENTRANCE_PEEK_MS, easing: 'ease-in-out', fill: 'backwards', composite: 'add',
                });
            } catch {
                el._igsCastSlide = null;
            }
        }
        return anim;
    }
    const anim = playSlide(el, posX, false, true, FADE_MS + 120, 'backwards');
    if (kind === 'run') el._igsCastEnter = playSpriteAction(el, 'hop');
    return anim;
}

export function isCastStageEnabled(snapshot) {
    const cast = normalizeStageCastSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.stageCast);
    return cast.enabled && cast.castStage;
}

// 角色名 / 别名 → 主名，与宿主同屏名单（reader-host castKeyOf）同源；战斗目标匹配复用。
export function castKeyOfSnapshot(snapshot) {
    const reader = (snapshot && snapshot.readerSettings) || {};
    const assets = reader._sceneAssets && typeof reader._sceneAssets === 'object' ? reader._sceneAssets : {};
    return (name) => {
        const raw = String(name || '').trim();
        return raw ? resolveCharacterKey(assets.characters, assets.characterAliases, raw) || raw : '';
    };
}

// 本页入场方式：{ 角色主名: 'run' | 'peek' | 'slow' }；castStage 关闭时为空。
export function castStageEntrances(snapshot) {
    if (!isCastStageEnabled(snapshot)) return {};
    const fx = (snapshot.content && snapshot.content.fx) || {};
    const keyOf = castKeyOfSnapshot(snapshot);
    const out = {};
    for (const [name, kind] of Object.entries(fx.entrances && typeof fx.entrances === 'object' ? fx.entrances : {})) {
        const key = keyOf(name);
        if (key && !out[key]) out[key] = kind;
    }
    return out;
}

// 说话人背对：#igs-sprite 的 transform / scale 已被呼吸、特写、逼近、压扁占用，改用空闲的独立属性 rotate（绕 y 轴 180°，无透视时即水平镜像）。
export function applySpeakerFlip(spriteEl, flip, posX, scale) {
    if (!spriteEl || !spriteEl.style) return false;
    const on = flip === true;
    setStyleProp(spriteEl, 'rotate', on ? 'y 180deg' : '');
    setStyleProp(spriteEl, 'transform-origin', on ? `${castFlipOriginX(posX, scale)}% 100%` : '');
    if (typeof spriteEl.setAttribute === 'function') {
        if (on) spriteEl.setAttribute('data-igs-sprite-flip', '1');
        else if (typeof spriteEl.removeAttribute === 'function') spriteEl.removeAttribute('data-igs-sprite-flip');
    }
    return on;
}

// 站位姿态（第四批，stageCast.castStage）：靠近 / 拉开每人移动 CAST_POSE_SHIFT（约为槽位间距的 25%），上前放大 6%。
export const CAST_POSE_SHIFT = 12;
export const CAST_POSE_FRONT_SCALE = 1.06;

// plan 为 planCastLayouts 的结果；speakerKey 为说话人主名（说话人条目本身不带 character）。
// poses / links 来自 fx（键可为别名，经 keyOf 归一）；返回新 plan，条目带 flip / front，posX / scale 已套用姿态。
// 靠近 / 拉开的方向按两人当前的左右关系决定；任一方不在台上时忽略该对。
export function applyCastPoses(plan, { poses = {}, links = [], speakerKey = '', keyOf = (name) => name } = {}) {
    if (!plan) return plan;
    const canon = (name) => String(keyOf(String(name || '').trim()) || name || '').trim();
    const entries = [];
    if (plan.speaker) entries.push({ character: canon(speakerKey), ref: { ...plan.speaker }, speaker: true });
    for (const m of plan.members || []) entries.push({ character: canon(m.character), ref: { ...m }, speaker: false });
    const byChar = new Map(entries.filter((e) => e.character).map((e) => [e.character, e]));
    const pose = new Map();
    for (const [name, value] of Object.entries(poses && typeof poses === 'object' ? poses : {})) {
        const key = canon(name);
        if (key && value) pose.set(key, value);
    }
    const shift = new Map();
    for (const link of Array.isArray(links) ? links : []) {
        const a = byChar.get(canon(link && link.a));
        const b = byChar.get(canon(link && link.b));
        if (!a || !b || a === b) continue;
        const [left, right] = Number(a.ref.posX) <= Number(b.ref.posX) ? [a, b] : [b, a];
        const dir = link.kind === 'apart' ? -1 : 1;
        shift.set(left, (shift.get(left) || 0) + dir * CAST_POSE_SHIFT);
        shift.set(right, (shift.get(right) || 0) - dir * CAST_POSE_SHIFT);
    }
    for (const e of entries) {
        const p = pose.get(e.character) || {};
        if (shift.has(e)) e.ref.posX = Math.round((Number(e.ref.posX) + shift.get(e)) * 100) / 100;
        e.ref.flip = p.flip === true;
        e.ref.front = p.front === true;
        if (e.ref.front) e.ref.scale = Math.round(Number(e.ref.scale) * CAST_POSE_FRONT_SCALE * 100) / 100;
    }
    return {
        ...plan,
        speaker: plan.speaker ? entries[0].ref : null,
        members: entries.filter((e) => !e.speaker).map((e) => e.ref),
    };
}

// 站位姿态接入：stageCast.enabled 且 castStage 开启时把 fx.poses / fx.links 套到布局上，否则原样返回。
export function resolveCastPosePlan(snapshot, plan, speakerKey = '') {
    if (!plan) return plan;
    const reader = (snapshot && snapshot.readerSettings) || {};
    const cast = normalizeStageCastSettings(reader.stageCast);
    if (!cast.enabled || !cast.castStage) return plan;
    const fx = (snapshot && snapshot.content && snapshot.content.fx) || {};
    const assets = reader._sceneAssets && typeof reader._sceneAssets === 'object' ? reader._sceneAssets : {};
    const keyOf = (name) => {
        const raw = String(name || '').trim();
        return raw ? resolveCharacterKey(assets.characters, assets.characterAliases, raw) || raw : '';
    };
    return applyCastPoses(plan, { poses: fx.poses, links: fx.links, speakerKey, keyOf });
}

// 翻转时的横向原点（百分比）：立绘元素铺满舞台、靠 background-position 摆位，绕图的中心镜像才不会整体平移。
export function castFlipOriginX(posX, scale) {
    const x = Number(posX);
    const s = Number(scale);
    if (!Number.isFinite(x) || !Number.isFinite(s)) return 50;
    return Math.round((x + s * (50 - x) / 100) * 100) / 100;
}
