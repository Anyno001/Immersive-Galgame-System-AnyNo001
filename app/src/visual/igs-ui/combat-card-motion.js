// 战斗面板抽卡与弃卡动画（参考杀戮尖塔 2 弧线甩牌与弹性落位）及复用各皮肤原位「抽牌 / 弃牌」文字的左右分置与点击查看牌堆：
// 纯视觉演出，只挂在面板演出层（.igs-combat-fx）与皮肤原有牌堆文字节点，不另增底部占高条，不改战斗结算。
// 覆盖默认与九套画布皮肤，自动适配 1x/2x 演出速度、低画质与减少动态效果。

export const COMBAT_CARD_MOTION = Object.freeze({
    drawMs: 560,
    drawStaggerMs: 95,
    drawMaxSpanMs: 440,
    discardMs: 480,
    discardEndTurnMs: 430,
    discardStaggerMs: 70,
    discardMaxSpanMs: 320,
    transferMs: 540,
    afterDiscardGapMs: 140,
    pileBumpMs: 360,
});

export const CARD_INCOMING_ATTR = 'data-igs-card-incoming';
export const PILE_BUMP_ATTR = 'data-igs-pile-bump';
export const PILE_DOCKS_ATTR = 'data-igs-pile-docks';

const C = '#igs-combat-panel';
const CX = '#igs-overlay #igs-combat-panel #igs-cx-canvas';

export const COMBAT_CARD_MOTION_STYLE_TEXT = `
${C} :is(.igs-combat-card,.cx-hand .card)[${CARD_INCOMING_ATTR}]{opacity:0 !important;pointer-events:none;}
${C} .igs-combat-fx .igs-card-motion-ghost{position:absolute;z-index:6;margin:0;min-height:0;pointer-events:none;transform-origin:50% 50%;will-change:transform,opacity;filter:drop-shadow(0 10px 18px rgba(0,0,0,.48));}
${C} .igs-combat-fx .igs-card-motion-ghost.is-draw-ghost{filter:drop-shadow(0 0 10px rgba(255,238,200,.24)) drop-shadow(0 12px 20px rgba(0,0,0,.5));}
${C} .igs-combat-fx .igs-card-motion-ghost.is-discard-ghost{filter:drop-shadow(0 8px 14px rgba(0,0,0,.55));}
#igs-overlay ${C} .igs-combat-fx .igs-cx-ghost.igs-card-motion-ghost>.hand{width:calc(100% / var(--ghost-scale,var(--cx-scale,1)));height:calc(100% / var(--ghost-scale,var(--cx-scale,1)));transform:scale(var(--ghost-scale,var(--cx-scale,1)));transform-origin:0 0;}
#igs-overlay ${C} .igs-combat-fx .igs-cx-ghost.igs-card-motion-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;scale:none;}
${C} .igs-combat-fx .igs-pile-transfer-card{position:absolute;z-index:6;width:54px;height:74px;border-radius:7px;background:linear-gradient(155deg,#2d364d,#161a26);border:1.5px solid rgba(242,212,155,.72);box-shadow:0 8px 18px rgba(0,0,0,.58),0 0 10px rgba(242,212,155,.28);pointer-events:none;transform-origin:50% 50%;will-change:transform,opacity;}

/* 复用各皮肤原本位于手牌行内的「抽牌 / 弃牌」纯文字入口：横屏拆到左右两头（不占底部空间、不撑高界面），竖屏沿用原位两头，点击可查看牌堆 */
${C}[${PILE_DOCKS_ATTR}] [data-combat-pile]{pointer-events:auto !important;cursor:pointer;border-radius:6px;transition:background-color .16s ease,color .16s ease,filter .16s ease;}
${C}[${PILE_DOCKS_ATTR}] [data-combat-pile]:hover,${C}[${PILE_DOCKS_ATTR}] [data-combat-pile]:focus-visible{background:rgba(255,255,255,.1);outline:none;filter:brightness(1.18);}
${CX}[data-cx="veil"].land .piles{width:auto;white-space:nowrap;}
${CX}[data-cx="veil"].land .piles.pile-r{left:auto;right:calc(max(24px,calc(var(--L) - 80px)) + 168px);justify-content:flex-end;}
${CX}:is([data-cx="comic"],[data-cx="tech"]).land .piles{width:calc(var(--cx-w,1280px) - var(--hl) - var(--ll) - 180px);justify-content:space-between;gap:0;}
${CX}:is([data-cx="ink"],[data-cx="mystic"]).land .pdk-t{flex:1;justify-content:space-between;margin-right:16px;}
${CX}:is([data-cx="soft-a"],[data-cx="soft-c"]).land .pile-x{left:auto;right:calc(var(--L) + 128px);}
${CX}:is([data-cx="dark-a"],[data-cx="dark-b"]).land .pcnt{width:calc(min(var(--cx-w,1280px) - 24px,var(--ll) + var(--lw) + 110px) - 176px - var(--hl));justify-content:space-between;gap:0;}

/* 牌堆查看浮层列表 */
${C} .igs-pile-sheet{z-index:12;}
${C} .igs-pile-sheet-list{display:flex;flex-direction:column;gap:6px;max-height:min(56vh,360px);overflow-y:auto;padding-right:2px;}
${C} .igs-pile-sheet-item{display:grid;grid-template-columns:auto auto auto minmax(0,1fr);align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);font-size:12px;line-height:1.4;color:var(--igs-cb-ink,#eef0f6);}
${C} .igs-pile-sheet-cost{min-width:28px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums;color:#f5dba2;}
${C} .igs-pile-sheet-tag{padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(255,255,255,.1);color:#dfe3ee;}
${C} .igs-pile-sheet-item[data-card-type="attack"] .igs-pile-sheet-tag{background:rgba(235,96,96,.24);color:#ffb3b3;}
${C} .igs-pile-sheet-item[data-card-type="skill"] .igs-pile-sheet-tag{background:rgba(92,168,240,.24);color:#b8dcff;}
${C} .igs-pile-sheet-item[data-card-type="power"] .igs-pile-sheet-tag{background:rgba(176,132,245,.24);color:#dcc4ff;}
${C} .igs-pile-sheet-name{font-weight:700;white-space:nowrap;}
${C} .igs-pile-sheet-text{color:var(--igs-cb-ink-soft,rgba(235,238,246,.76));overflow-wrap:anywhere;}
${C} .igs-pile-sheet-empty{padding:20px 10px;text-align:center;color:var(--igs-cb-ink-faint,rgba(235,238,246,.55));font-size:13px;}

${C} [${PILE_BUMP_ATTR}="draw"]{animation:igs-pile-bump-draw ${COMBAT_CARD_MOTION.pileBumpMs}ms cubic-bezier(.22,1,.36,1) both;}
${C} [${PILE_BUMP_ATTR}="discard"]{animation:igs-pile-bump-discard ${COMBAT_CARD_MOTION.pileBumpMs}ms cubic-bezier(.22,1,.36,1) both;}
@keyframes igs-pile-bump-draw{0%{scale:1;}35%{scale:1.16;filter:brightness(1.26);}100%{scale:1;filter:none;}}
@keyframes igs-pile-bump-discard{0%{scale:1;}35%{scale:1.16;filter:brightness(1.26);}100%{scale:1;filter:none;}}
${C}[data-igs-combat-reduced] :is(.igs-combat-card,.cx-hand .card)[${CARD_INCOMING_ATTR}]{opacity:1 !important;pointer-events:auto;}
${C}[data-igs-combat-reduced] [${PILE_BUMP_ATTR}]{animation:none;}
#igs-overlay[data-igs-quality="low"] ${C} [${PILE_BUMP_ATTR}]{animation:none;}
@media (prefers-reduced-motion:reduce){${C} :is(.igs-combat-card,.cx-hand .card)[${CARD_INCOMING_ATTR}]{opacity:1 !important;pointer-events:auto;}${C} [${PILE_BUMP_ATTR}]{animation:none;}}
`;

function pickNativePile(root, kind) {
    if (!root?.querySelectorAll) return null;
    const list = NATIVE_PILE_SELECTORS[kind === 'discard' ? 'discard' : 'draw'];
    let fallback = null;
    for (const sel of list) {
        const nodes = root.querySelectorAll(sel);
        for (const el of nodes || []) {
            if (!fallback) fallback = el;
            if (isVisibleRect(el?.getBoundingClientRect?.())) return el;
        }
    }
    return fallback;
}

function bindPileInteractive(el, kind, label, count) {
    if (!el) return null;
    el.setAttribute?.('data-combat-pile', kind);
    el.setAttribute?.('data-combat-act', 'pile-view');
    el.setAttribute?.('data-combat-id', kind);
    el.setAttribute?.('role', 'button');
    el.setAttribute?.('tabindex', '0');
    el.setAttribute?.('aria-label', `查看${label}堆（${count} 张）`);
    return el;
}

function unbindPileInteractive(el) {
    if (!el) return;
    el.removeAttribute?.('data-combat-pile');
    if (el.getAttribute?.('data-combat-act') === 'pile-view') {
        el.removeAttribute?.('data-combat-act');
        el.removeAttribute?.('data-combat-id');
    }
    el.removeAttribute?.('tabindex');
}

// 为当前皮肤原有的「抽牌 / 弃牌」文字节点绑定点击查看与动画锚点属性，不另建底部占位条。
export function syncPileDocks(doc, root, piles) {
    if (!root) return null;
    if (!piles) {
        root.removeAttribute?.(PILE_DOCKS_ATTR);
        for (const el of root.querySelectorAll?.('[data-combat-pile]') || []) unbindPileInteractive(el);
        return null;
    }
    root.setAttribute?.(PILE_DOCKS_ATTR, '');
    const drawN = Math.max(0, Number(piles.draw) || 0);
    const discN = Math.max(0, Number(piles.discard) || 0);
    const draw = bindPileInteractive(pickNativePile(root, 'draw'), 'draw', '抽牌', drawN);
    const discard = bindPileInteractive(pickNativePile(root, 'discard'), 'discard', '弃牌', discN);
    return draw || discard ? { draw, discard } : null;
}

// 按操作前后牌堆与事件流，归类需要播放弃牌、抽牌和牌堆间转移（如弃牌堆放回抽牌堆顶）的手牌实例。
export function planCardMotions(beforeBattle, afterBattle, action, events = [], { start = false } = {}) {
    const heroId = afterBattle?.controlledId || beforeBattle?.controlledId || '';
    const empty = { discarded: [], drawn: [], drawSource: new Map(), transfers: [], endTurn: false };
    if (!heroId || !afterBattle?.piles?.[heroId]) return empty;
    const afterHand = Array.isArray(afterBattle.piles[heroId].hand) ? afterBattle.piles[heroId].hand : [];
    const drawSource = new Map();
    if (start || !beforeBattle?.piles?.[heroId]) {
        for (const inst of afterHand) drawSource.set(inst, 'draw');
        return { discarded: [], drawn: afterHand.slice(), drawSource, transfers: [], endTurn: false };
    }
    const beforeHand = Array.isArray(beforeBattle.piles[heroId].hand) ? beforeBattle.piles[heroId].hand : [];
    const beforeSet = new Set(beforeHand);
    const afterSet = new Set(afterHand);
    const afterDiscard = new Set(afterBattle.piles[heroId].discard || []);
    const list = Array.isArray(events) ? events : [];
    const heroEvents = list.filter((e) => e && e.unitId === heroId);
    const isEndTurn = action?.type === 'end-turn' || heroEvents.some((e) => e.type === 'turn-end');
    const transfers = [];

    for (const e of heroEvents) {
        if (e.type === 'fetch' && e.to === 'hand' && e.from === 'discard' && e.inst) drawSource.set(e.inst, 'discard');
        if (e.type === 'fetch' && e.from === 'discard' && e.to === 'draw' && e.inst) transfers.push({ inst: e.inst, from: 'discard', to: 'draw' });
    }

    if (isEndTurn) {
        const exhausted = new Set(heroEvents.filter((e) => e.type === 'exhaust' && e.inst).map((e) => e.inst));
        const reshuffled = heroEvents.some((e) => e.type === 'reshuffle');
        let turnStartIdx = -1;
        for (let i = list.length - 1; i >= 0; i -= 1) {
            if (list[i]?.type === 'turn-start' && list[i].unitId === heroId) { turnStartIdx = i; break; }
        }
        const afterStartEvents = turnStartIdx >= 0 ? list.slice(turnStartIdx + 1) : heroEvents;
        let newCount = 0;
        for (const e of afterStartEvents) {
            if (e.unitId !== heroId) continue;
            if (e.type === 'draw') newCount += Number(e.count) || 0;
            else if (e.type === 'card-created' && e.to === 'hand') newCount += 1;
            else if (e.type === 'fetch' && e.to === 'hand') newCount += 1;
        }
        const retained = new Set();
        let keptPrefix = 0;
        if (reshuffled && newCount > 0) {
            keptPrefix = Math.max(0, afterHand.length - newCount);
            for (let i = 0; i < keptPrefix; i += 1) {
                if (beforeSet.has(afterHand[i])) retained.add(afterHand[i]);
            }
        } else {
            for (const inst of afterHand) {
                if (beforeSet.has(inst)) retained.add(inst);
            }
            keptPrefix = retained.size;
        }
        const discarded = beforeHand.filter((inst) => !retained.has(inst) && !exhausted.has(inst)).reverse();
        const drawn = afterHand.filter((inst, idx) => (reshuffled && newCount > 0 ? idx >= keptPrefix : !retained.has(inst)));
        for (const inst of drawn) if (!drawSource.has(inst)) drawSource.set(inst, 'draw');
        return { discarded, drawn, drawSource, transfers, endTurn: true };
    }

    const playedInst = action?.type === 'play' ? action.inst : null;
    const discardEvs = new Set(heroEvents.filter((e) => e.type === 'discard' && e.inst).map((e) => e.inst));
    const discarded = beforeHand.filter((inst) => inst !== playedInst && (discardEvs.has(inst) || (!afterSet.has(inst) && afterDiscard.has(inst)))).reverse();
    const hasDrawOrGain = heroEvents.some((e) => e.type === 'draw' || (e.type === 'fetch' && e.to === 'hand') || (e.type === 'card-created' && e.to === 'hand'));
    const drawn = hasDrawOrGain
        ? afterHand.filter((inst) => !beforeSet.has(inst) || discardEvs.has(inst))
        : [];
    for (const inst of drawn) if (!drawSource.has(inst)) drawSource.set(inst, 'draw');
    return { discarded, drawn, drawSource, transfers, endTurn: false };
}

const NATIVE_PILE_SELECTORS = Object.freeze({
    draw: [
        '.pdk.draw',
        '.pile-d',
        '.piles .pl.dr',
        '.pcnt .pl[title="抽牌堆"]',
        '.igs-combat-piles > span:first-child',
        '.pdk-t > span:first-child',
    ],
    discard: [
        '.pdk.disc',
        '.pile-x',
        '.pile-r',
        '.piles .pl.dc',
        '.pcnt .pl[title="弃牌堆"]',
        '.igs-combat-piles > span:last-child',
        '.pdk-t > span:last-child',
    ],
});

const PILE_SELECTORS = Object.freeze({
    draw: ['[data-combat-pile="draw"]', ...NATIVE_PILE_SELECTORS.draw],
    discard: ['[data-combat-pile="discard"]', ...NATIVE_PILE_SELECTORS.discard],
});

function isVisibleRect(rect) {
    return Boolean(rect && rect.width > 0 && rect.height > 0);
}

export function findPileEl(root, kind) {
    if (!root?.querySelectorAll) return null;
    const list = PILE_SELECTORS[kind === 'discard' ? 'discard' : 'draw'];
    for (const sel of list) {
        const nodes = root.querySelectorAll(sel);
        for (const el of nodes || []) {
            if (isVisibleRect(el?.getBoundingClientRect?.())) return el;
        }
    }
    return null;
}

export function pileAnchorRect(root, stage, kind) {
    const el = findPileEl(root, kind);
    if (el) return el.getBoundingClientRect();
    const base = (stage || root)?.getBoundingClientRect?.();
    if (!isVisibleRect(base)) return null;
    const padX = Math.min(44, Math.round(base.width * 0.06));
    const padY = Math.min(36, Math.round(base.height * 0.06));
    const left = kind === 'discard' ? base.right - padX - 24 : base.left + padX;
    return { left, top: base.bottom - padY - 24, width: 24, height: 24 };
}

export function bumpPile(el, kind, { reduced = false, schedule } = {}) {
    if (!el || reduced) return;
    const value = kind === 'discard' ? 'discard' : 'draw';
    el.removeAttribute?.(PILE_BUMP_ATTR);
    void el.offsetWidth;
    el.setAttribute?.(PILE_BUMP_ATTR, value);
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    later(() => {
        if (el.getAttribute?.(PILE_BUMP_ATTR) === value) el.removeAttribute?.(PILE_BUMP_ATTR);
    }, COMBAT_CARD_MOTION.pileBumpMs);
}

export function cardNaturalRotate(cardEl) {
    const win = cardEl?.ownerDocument?.defaultView || globalThis;
    try {
        const tf = typeof win?.getComputedStyle === 'function' ? win.getComputedStyle(cardEl)?.transform : '';
        const m = typeof tf === 'string' && tf.startsWith('matrix(')
            ? tf.slice(7, -1).split(',').map((v) => Number(v.trim()))
            : null;
        if (m && m.length >= 2 && Number.isFinite(m[0]) && Number.isFinite(m[1])) {
            const deg = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
            if (Math.abs(deg) <= 45) return Number(deg.toFixed(2));
        }
    } catch (error) { /* 非浏览器环境回落读内联变量 */ }
    for (const prop of ['--rot', '--fan-r', '--r']) {
        const raw = cardEl?.style?.getPropertyValue?.(prop) || '';
        const match = String(raw).match(/-?\d+(?:\.\d+)?/);
        if (match) return Math.max(-24, Math.min(24, Number(match[0])));
    }
    return 0;
}

function elementOwnScale(el, win) {
    if (!el || typeof win?.getComputedStyle !== 'function') return 1;
    let factor = 1;
    try {
        const cs = win.getComputedStyle(el);
        const tf = cs?.transform;
        if (typeof tf === 'string' && tf.startsWith('matrix(')) {
            const m = tf.slice(7, -1).split(',').map((v) => Number(v.trim()));
            if (m.length >= 2 && Number.isFinite(m[0]) && Number.isFinite(m[1])) {
                const s = Math.hypot(m[0], m[1]);
                if (s > 0.05) factor *= s;
            }
        }
        const rawScale = cs?.scale;
        if (typeof rawScale === 'string' && rawScale && rawScale !== 'none') {
            const first = Number(rawScale.trim().split(/\s+/)[0]);
            if (Number.isFinite(first) && first > 0.05) factor *= first;
        }
    } catch (error) { /* 非浏览器环境回落默认缩放 */ }
    return factor;
}

function effectiveCardScale(cardEl, root) {
    const win = cardEl?.ownerDocument?.defaultView || globalThis;
    const canvas = cardEl?.closest?.('.igs-cx-canvas') || null;
    if (!canvas) return 1;
    let total = 1;
    let sawCanvasMatrix = false;
    let cur = cardEl;
    while (cur && cur !== root) {
        const s = elementOwnScale(cur, win);
        if (cur === canvas && Math.abs(s - 1) > 0.001) sawCanvasMatrix = true;
        total *= s;
        if (cur === canvas) break;
        cur = cur.parentElement || null;
    }
    if (!sawCanvasMatrix) {
        const cx = Number(root?.style?.getPropertyValue?.('--cx-scale')) || 1;
        total *= cx;
    }
    return total > 0.05 ? total : 1;
}

export function measureCardBox(cardEl, root) {
    const rect = cardEl?.getBoundingClientRect?.();
    if (!isVisibleRect(rect)) return null;
    const rot = cardNaturalRotate(cardEl);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let w = rect.width;
    let h = rect.height;
    let scale = 1;
    const ow = Number(cardEl?.offsetWidth) || 0;
    const oh = Number(cardEl?.offsetHeight) || 0;
    if (ow > 0 && oh > 0) {
        scale = effectiveCardScale(cardEl, root);
        w = ow * scale;
        h = oh * scale;
    }
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, cx, cy, rot, scale };
}

function stepDelay(count, base, maxSpan) {
    if (count <= 1) return 0;
    return Math.min(base, Math.max(18, Math.floor(maxSpan / (count - 1))));
}

function positionGhost(ghost, box, base, cls) {
    const s = ghost.style;
    s?.setProperty?.('left', `${(box.left - base.left).toFixed(2)}px`);
    s?.setProperty?.('top', `${(box.top - base.top).toFixed(2)}px`);
    s?.setProperty?.('width', `${box.width.toFixed(2)}px`);
    s?.setProperty?.('height', `${box.height.toFixed(2)}px`);
    if (Number.isFinite(box.scale) && box.scale > 0) s?.setProperty?.('--ghost-scale', String(Number(box.scale.toFixed(4))));
    ghost.classList?.add?.('igs-card-motion-ghost', cls);
}

export function playDrawCards(stage, items, defaultAnchor, { reduced = false, schedule, onStart, onEach, onLand } = {}) {
    const list = Array.isArray(items) ? items : [];
    const base = stage?.getBoundingClientRect?.();
    if (!list.length || reduced || !stage || !isVisibleRect(base)) {
        for (const item of list) onLand?.(item.inst, item.cardEl);
        return { nodes: [], totalMs: 0 };
    }
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    const stagger = stepDelay(list.length, COMBAT_CARD_MOTION.drawStaggerMs, COMBAT_CARD_MOTION.drawMaxSpanMs);
    const duration = COMBAT_CARD_MOTION.drawMs;
    const nodes = [];
    let maxEnd = 0;

    list.forEach((item, index) => {
        const anchor = item.fromRect || defaultAnchor;
        const to = item.rect;
        const ghost = item.ghost;
        if (!ghost || !isVisibleRect(anchor) || !isVisibleRect(to) || typeof ghost.animate !== 'function') {
            onLand?.(item.inst, item.cardEl);
            return;
        }
        const delay = index * stagger;
        const toCx = to.cx ?? (to.left + to.width / 2);
        const toCy = to.cy ?? (to.top + to.height / 2);
        const dx = Math.round((anchor.left + anchor.width / 2) - toCx);
        const dy = Math.round((anchor.top + anchor.height / 2) - toCy);
        const dist = Math.hypot(dx, dy);
        const arcLift = Math.max(46, Math.min(90, Math.round(dist * 0.22 + 34)));
        const sign = dx <= 0 ? -1 : 1;
        const targetRot = Number.isFinite(to.rot) ? to.rot : cardNaturalRotate(item.cardEl);
        const frames = [
            { transform: `translate(${dx}px,${dy}px) scale(.18) rotate(${sign * 34}deg)`, opacity: 0.2, offset: 0 },
            { transform: `translate(${Math.round(dx * 0.4)}px,${Math.round(Math.min(dy, 0) * 0.35 - arcLift)}px) scale(.9) rotate(${(targetRot + sign * 10).toFixed(2)}deg)`, opacity: 1, offset: 0.38 },
            { transform: `translate(${Math.round(-dx * 0.025)}px,-6px) scale(1.04) rotate(${(targetRot - sign * 2).toFixed(2)}deg)`, opacity: 1, offset: 0.82 },
            { transform: `translate(0px,0px) scale(1) rotate(${targetRot.toFixed(2)}deg)`, opacity: 1, offset: 1 },
        ];
        positionGhost(ghost, to, base, 'is-draw-ghost');
        ghost.style?.setProperty?.('opacity', '0');
        stage.appendChild(ghost);
        nodes.push(ghost);
        maxEnd = Math.max(maxEnd, delay + duration);

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            onLand?.(item.inst, item.cardEl);
            ghost.remove?.();
        };

        const launch = () => {
            if (!ghost.isConnected && ghost.parentNode !== stage) { finish(); return; }
            ghost.style?.removeProperty?.('opacity');
            onEach?.(item, index);
            let anim = null;
            try {
                anim = ghost.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
            } catch (error) {
                finish();
                return;
            }
            let boundFinish = false;
            if (anim && typeof anim === 'object') {
                try { anim.onfinish = finish; boundFinish = typeof anim.finished?.then === 'function'; } catch (error) { /* 测试桩只读时走兜底计时 */ }
            }
            later(finish, boundFinish ? duration + 120 : duration);
        };
        if (delay > 0) later(launch, delay);
        else launch();
    });

    if (nodes.length) onStart?.(nodes.length);
    return { nodes, totalMs: maxEnd };
}

export function playDiscardCards(stage, items, anchorRect, { reduced = false, endTurn = false, schedule, onStart, onArrive } = {}) {
    const list = Array.isArray(items) ? items : [];
    const base = stage?.getBoundingClientRect?.();
    if (!list.length || reduced || !stage || !isVisibleRect(base) || !isVisibleRect(anchorRect)) {
        return { nodes: [], totalMs: 0 };
    }
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    const stagger = stepDelay(list.length, COMBAT_CARD_MOTION.discardStaggerMs, COMBAT_CARD_MOTION.discardMaxSpanMs);
    const duration = endTurn ? COMBAT_CARD_MOTION.discardEndTurnMs : COMBAT_CARD_MOTION.discardMs;
    const nodes = [];
    let maxEnd = 0;
    let arrived = false;

    list.forEach((item, index) => {
        const from = item.rect;
        const ghost = item.ghost;
        if (!ghost || !isVisibleRect(from) || typeof ghost.animate !== 'function') return;
        const delay = index * stagger;
        const fromCx = from.cx ?? (from.left + from.width / 2);
        const fromCy = from.cy ?? (from.top + from.height / 2);
        const startRot = Number.isFinite(from.rot) ? from.rot : 0;
        const dx = Math.round((anchorRect.left + anchorRect.width / 2) - fromCx);
        const dy = Math.round((anchorRect.top + anchorRect.height / 2) - fromCy);
        const dir = dx >= 0 ? 1 : -1;
        const lift = endTurn ? 22 : 30;
        const frames = [
            { transform: `translate(0px,0px) scale(1) rotate(${startRot.toFixed(2)}deg)`, opacity: 1, offset: 0 },
            { transform: `translate(${Math.round(dx * 0.14)}px,${-lift}px) scale(.96) rotate(${(startRot + dir * 12).toFixed(2)}deg)`, opacity: 1, offset: 0.24 },
            { transform: `translate(${Math.round(dx * 0.74)}px,${Math.round(dy * 0.56 - 16)}px) scale(.46) rotate(${(startRot + dir * 32).toFixed(2)}deg)`, opacity: 0.88, offset: 0.74 },
            { transform: `translate(${dx}px,${dy}px) scale(.16) rotate(${(startRot + dir * 44).toFixed(2)}deg)`, opacity: 0, offset: 1 },
        ];
        positionGhost(ghost, from, base, 'is-discard-ghost');
        stage.appendChild(ghost);
        nodes.push(ghost);
        maxEnd = Math.max(maxEnd, delay + duration);

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            ghost.remove?.();
            if (!arrived) { arrived = true; onArrive?.(); }
        };

        const launch = () => {
            if (!ghost.isConnected && ghost.parentNode !== stage) { finish(); return; }
            let anim = null;
            try {
                anim = ghost.animate(frames, { duration, easing: 'cubic-bezier(.45,0,.85,.45)', fill: 'forwards' });
            } catch (error) {
                finish();
                return;
            }
            let boundFinish = false;
            if (anim && typeof anim === 'object') {
                try { anim.onfinish = finish; boundFinish = typeof anim.finished?.then === 'function'; } catch (error) { /* 测试桩只读时走兜底计时 */ }
            }
            later(finish, boundFinish ? duration + 120 : duration);
        };
        if (delay > 0) later(launch, delay);
        else launch();
    });

    if (nodes.length) onStart?.(nodes.length);
    return { nodes, totalMs: maxEnd };
}

// 牌堆间飞牌（如从弃牌堆选卡放回抽牌堆顶）：从起始牌堆弧线飞向目标牌堆。
export function playPileTransfers(doc, stage, count, fromRect, toRect, { reduced = false, schedule, onStart, onArrive } = {}) {
    const n = Math.max(0, Number(count) || 0);
    const base = stage?.getBoundingClientRect?.();
    if (!n || reduced || !stage || !doc?.createElement || !isVisibleRect(base) || !isVisibleRect(fromRect) || !isVisibleRect(toRect)) {
        return { nodes: [], totalMs: 0 };
    }
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    const duration = COMBAT_CARD_MOTION.transferMs;
    const nodes = [];
    let arrived = false;
    const fromCx = fromRect.left + fromRect.width / 2;
    const fromCy = fromRect.top + fromRect.height / 2;
    const toCx = toRect.left + toRect.width / 2;
    const toCy = toRect.top + toRect.height / 2;
    const dx = Math.round(toCx - fromCx);
    const dy = Math.round(toCy - fromCy);
    const arcLift = Math.max(70, Math.min(140, Math.round(Math.abs(dx) * 0.18 + 56)));

    for (let i = 0; i < n; i += 1) {
        const el = doc.createElement('i');
        el.className = 'igs-pile-transfer-card';
        el.setAttribute('aria-hidden', 'true');
        el.style.setProperty('left', `${Math.round(fromCx - base.left - 27)}px`);
        el.style.setProperty('top', `${Math.round(fromCy - base.top - 37)}px`);
        if (typeof el.animate !== 'function') continue;
        stage.appendChild(el);
        nodes.push(el);
        const delay = i * 55;
        const frames = [
            { transform: 'translate(0px,0px) scale(.3) rotate(18deg)', opacity: 0.4, offset: 0 },
            { transform: `translate(${Math.round(dx * 0.5)}px,${Math.round(dy * 0.5 - arcLift)}px) scale(.95) rotate(-8deg)`, opacity: 1, offset: 0.48 },
            { transform: `translate(${dx}px,${dy}px) scale(.28) rotate(-26deg)`, opacity: 0.15, offset: 1 },
        ];
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            el.remove?.();
            if (!arrived) { arrived = true; onArrive?.(); }
        };
        const launch = () => {
            if (!el.isConnected && el.parentNode !== stage) { finish(); return; }
            let anim = null;
            try { anim = el.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }); } catch (error) { finish(); return; }
            let boundFinish = false;
            if (anim && typeof anim === 'object') {
                try { anim.onfinish = finish; boundFinish = typeof anim.finished?.then === 'function'; } catch (error) { /* 测试桩 */ }
            }
            later(finish, boundFinish ? duration + 120 : duration);
        };
        if (delay > 0) later(launch, delay);
        else launch();
    }
    if (nodes.length) onStart?.(nodes.length);
    return { nodes, totalMs: nodes.length ? (nodes.length - 1) * 55 + duration : 0 };
}
