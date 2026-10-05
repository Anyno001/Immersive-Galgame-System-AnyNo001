import { spriteStoredScale } from './settings-normalize.js';
import { esc } from './reader-value-utils.js';
import { peekSpriteHead, probeSpriteHead, spriteBackgroundSize } from './fx-anchor.js';
import { enterSpriteEditMode, spriteDragPosition } from './sprite-edit.js';
import { spriteEnhanceFilter } from './sprite-enhance.js';

const SCALE_MIN = -500;
const SCALE_MAX = 500;
const EDITING_ATTR = 'data-igs-cast-editing';

function targetEl(overlay, entry) {
    if (entry.speaker) return overlay.querySelector('#igs-sprite');
    const layer = overlay.querySelector('#igs-cast');
    return layer ? Array.from(layer.children || []).find((el) => el.getAttribute('data-igs-cast-char') === entry.character) || null : null;
}

function renderBar(work, selected) {
    const chips = work.map((w, i) => `<button data-cse="pick:${i}" type="button" aria-pressed="${i === selected ? 'true' : 'false'}"${i === selected ? ' class="is-on"' : ''}>${esc(w.character)}${w.speaker ? '（说话）' : ''}</button>`).join('');
    return '<span class="igs-se-hint">选人后拖动调整，滚轮缩放</span>'
        + chips
        + '<button data-cse="smaller" type="button">缩小</button>'
        + '<button data-cse="bigger" type="button">放大</button>'
        + '<button data-cse="reset" type="button">还原自动</button>'
        + '<button data-cse="single" type="button">单人位置</button>'
        + '<button data-cse="cancel" type="button">取消</button>'
        + '<button data-cse="save" class="igs-se-save" type="button">保存</button>';
}

function paint(el, value) {
    if (!el) return;
    el.style.backgroundSize = spriteBackgroundSize(value.scale);
    el.style.backgroundPosition = `${value.posX}% ${value.posY}%`;
}

// 多人同屏时的立绘编辑：每人按「模式::人数::槽位::身份」单独保存到 castSlotLayouts，不影响单人位置。
// 返回 false 表示当前不是多人同屏，调用方改走单人编辑。
export function enterCastSlotEdit(overlay, current, ctx = {}) {
    if (!overlay || !current || current.spriteEditMode) return false;
    const stage = current.castStage;
    const entries = stage && Array.isArray(stage.entries) ? stage.entries.filter((e) => e.key && targetEl(overlay, e)) : [];
    if (entries.length < 2) return false;
    if (typeof ctx.closeSettings === 'function') ctx.closeSettings();
    const doc = overlay.ownerDocument;
    const motion = overlay.querySelector('#igs-stage-motion') || overlay;
    const work = entries.map((e) => ({
        ...e,
        orig: { posX: e.posX, posY: e.posY, scale: e.scale },
        cur: { posX: e.posX, posY: e.posY, scale: e.scale },
        dirty: false,
        reset: false,
    }));
    let selected = Math.max(0, work.findIndex((w) => w.speaker));
    const sceneAssets = current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings._sceneAssets;
    const enhance = spriteEnhanceFilter(sceneAssets && sceneAssets.enabled === true ? sceneAssets.spriteEnhance : null);
    const originalFilters = new Map();
    const originalEnhance = new Map();
    if (enhance) {
        for (const w of work) {
            const el = targetEl(overlay, w);
            if (!el) continue;
            if (w.speaker) {
                const value = typeof el.style.getPropertyValue === 'function'
                    ? el.style.getPropertyValue('--igs-sprite-enhance')
                    : (el.style['--igs-sprite-enhance'] || '');
                originalEnhance.set(el, value);
                el.style.removeProperty('--igs-sprite-enhance');
                continue;
            }
            if (!String(el.style.filter).endsWith(enhance)) continue;
            originalFilters.set(el, el.style.filter);
            const baseFrame = el.style.filter.slice(0, -enhance.length).trimEnd();
            el.style.filter = baseFrame;
            el.style.setProperty('-webkit-filter', baseFrame);
        }
    }
    const clickLayer = overlay.querySelector('#igs-click-layer');
    if (clickLayer) clickLayer.style.pointerEvents = 'none';
    const surface = doc.createElement('div');
    surface.id = 'igs-cast-edit-surface';
    motion.appendChild(surface);
    const editBar = doc.createElement('div');
    editBar.id = 'igs-sprite-edit-bar';
    overlay.appendChild(editBar);
    motion.setAttribute(EDITING_ATTR, '1');
    const em = { kind: 'cast', editBar, surface, clickLayer, motion, work, originalFilters, originalEnhance };
    current.spriteEditMode = em;

    const mark = () => {
        work.forEach((w, i) => {
            const el = targetEl(overlay, w);
            if (el && el.classList) el.classList.toggle('igs-cast-editing', i === selected);
        });
        editBar.innerHTML = renderBar(work, selected);
    };
    const touch = (w) => {
        w.dirty = true;
        w.reset = false;
        paint(targetEl(overlay, w), w.cur);
    };
    const zoom = (factor) => {
        for (const person of work) {
            person.cur.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, person.cur.scale * factor));
            person.scaleDirty = true;
            paint(targetEl(overlay, person), person.cur);
        }
    };
    mark();

    editBar.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-cse]') : null;
        if (!btn) return;
        const act = btn.getAttribute('data-cse');
        const w = work[selected];
        if (act.startsWith('pick:')) {
            selected = Math.min(work.length - 1, Math.max(0, Number(act.slice(5)) || 0));
            mark();
        } else if (act === 'bigger') {
            zoom(1.1);
        } else if (act === 'smaller') {
            zoom(0.91);
        } else if (act === 'reset') {
            w.cur = { ...(w.auto || w.orig) };
            w.reset = true;
            w.dirty = false;
            paint(targetEl(overlay, w), w.cur);
        } else if (act === 'single') {
            exitCastSlotEdit(overlay, current, false, ctx);
            enterSpriteEditMode(overlay, current, ctx);
        } else if (act === 'cancel') {
            exitCastSlotEdit(overlay, current, false, ctx);
        } else if (act === 'save') {
            exitCastSlotEdit(overlay, current, true, ctx);
        }
    });

    let drag = null;
    surface.addEventListener('pointerdown', (event) => {
        const w = work[selected];
        const info = peekSpriteHead(w.url);
        if (!info) probeSpriteHead(w.url, doc).catch(() => null);
        drag = { x: event.clientX, y: event.clientY, posX: w.cur.posX, posY: w.cur.posY };
        if (typeof surface.setPointerCapture === 'function') {
            try { surface.setPointerCapture(event.pointerId); } catch { /* 捕获失败不影响拖动 */ }
        }
    });
    surface.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const w = work[selected];
        const rect = motion.getBoundingClientRect();
        const info = peekSpriteHead(w.url);
        const next = spriteDragPosition({
            posX: drag.posX,
            posY: drag.posY,
            dx: event.clientX - drag.x,
            dy: event.clientY - drag.y,
            stageW: rect.width,
            stageH: rect.height,
            scale: w.cur.scale,
            naturalW: info ? info.naturalW : 0,
            naturalH: info ? info.naturalH : 0,
        });
        w.cur.posX = next.posX;
        w.cur.posY = next.posY;
        touch(w);
    });
    const endDrag = () => { drag = null; };
    surface.addEventListener('pointerup', endDrag);
    surface.addEventListener('pointercancel', endDrag);
    surface.addEventListener('wheel', (event) => {
        event.preventDefault();
        zoom(event.deltaY < 0 ? 1.1 : 0.91);
    }, { passive: false });
    return true;
}

export function exitCastSlotEdit(overlay, current, save, ctx = {}) {
    const em = current && current.spriteEditMode;
    if (!em || em.kind !== 'cast') return;
    current.spriteEditMode = null;
    if (em.clickLayer) em.clickLayer.style.pointerEvents = '';
    if (em.editBar && em.editBar.parentNode) em.editBar.parentNode.removeChild(em.editBar);
    if (em.surface && em.surface.parentNode) em.surface.parentNode.removeChild(em.surface);
    if (em.motion) em.motion.removeAttribute(EDITING_ATTR);
    for (const [el, value] of em.originalEnhance || []) {
        if (!el.parentNode) continue;
        if (value) el.style.setProperty('--igs-sprite-enhance', value);
        else el.style.removeProperty('--igs-sprite-enhance');
    }
    for (const [el, frame] of em.originalFilters || []) {
        if (!el.parentNode) continue;
        el.style.filter = frame;
        el.style.setProperty('-webkit-filter', frame);
    }
    for (const w of em.work) {
        const el = targetEl(overlay, w);
        if (el && el.classList) el.classList.remove('igs-cast-editing');
        if (!save) paint(el, w.orig);
    }
    if (!save) return;
    const mode = current.snapshot && current.snapshot.mode;
    const unified = typeof ctx.resolveUnifiedSettings === 'function' ? ctx.resolveUnifiedSettings({ mode }) : { readerSettings: {} };
    const layouts = { ...((unified.readerSettings && unified.readerSettings.castSlotLayouts) || {}) };
    const patch = {};
    let changed = false;
    let scale = null;
    const globalScale = current.snapshot && current.snapshot.readerSettings && current.snapshot.readerSettings.spriteDisplayScale;
    for (const w of em.work) {
        if (w.reset) {
            delete layouts[w.key];
            changed = true;
        } else if (w.dirty) {
            layouts[w.key] = { posX: w.cur.posX, posY: w.cur.posY, scale: spriteStoredScale(w.cur.scale, globalScale) };
            changed = true;
        }
        if (w.scaleDirty) scale = spriteStoredScale(w.cur.scale, globalScale);
    }
    if (changed) patch.castSlotLayouts = layouts;
    if (scale != null && mode) {
        const spriteLayouts = { ...((unified.readerSettings && unified.readerSettings.spriteLayouts) || {}) };
        const prev = spriteLayouts[mode] || { posX: 50, posY: 100, scale: 100 };
        spriteLayouts[mode] = {
            posX: Number.isFinite(Number(prev.posX)) ? Number(prev.posX) : 50,
            posY: Number.isFinite(Number(prev.posY)) ? Number(prev.posY) : 100,
            scale,
        };
        patch.spriteLayouts = spriteLayouts;
    }
    if (Object.keys(patch).length && typeof ctx.saveReaderSettingsPatch === 'function') ctx.saveReaderSettingsPatch(patch);
}
