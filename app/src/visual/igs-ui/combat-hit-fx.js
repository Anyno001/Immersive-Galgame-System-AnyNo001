// 战斗面板打击感的 DOM 小件：血条落笔、伤害 / 格挡 / 治疗飘字、受击反馈、出牌飞行卡。
// 只改单位块内少量节点与属性，不重绘面板；数字只经 textContent 写入。减少动态效果时飘字静止、不加受击反馈。
import { cardStrike } from './combat-strike.js';
export const COMBAT_HIT_FLOAT_MS = 1100;
export const COMBAT_HIT_REACT_MS = 420;
export const COMBAT_CARD_FLY_MS = 380;
export const COMBAT_HIT_FLOAT_STAGGER_MS = 120;

function toggleClass(el, name, on) {
    if (el.classList?.toggle) { el.classList.toggle(name, on); return; }
    const list = String(el.className || '').split(/\s+/).filter((c) => c && c !== name);
    if (on) list.push(name);
    el.className = list.join(' ');
}

// 动作前各单位的血量快照（只取数值）：命中落下前按它保持旧血条。
export function hpSnapshot(battle) {
    const out = new Map();
    for (const [id, u] of Object.entries(battle?.units || {})) {
        out.set(id, { hp: Math.max(0, Number(u.hp) || 0), maxHp: Number(u.maxHp) || 0, alive: u.alive !== false });
    }
    return out;
}

// 把一组变化记到暂存血量上（掉血 / 治疗 / 击倒），返回同一对象。
export function applyHitMarks(entry, marks) {
    for (const m of marks || []) {
        if (m.kind === 'damage') entry.hp = Math.max(0, entry.hp - m.amount);
        else if (m.kind === 'heal') entry.hp = entry.maxHp ? Math.min(entry.maxHp, entry.hp + m.amount) : entry.hp + m.amount;
        else if (m.kind === 'ko') { entry.hp = 0; entry.alive = false; }
    }
    return entry;
}

// 单位块落笔：血条宽度变量、数值文字与倒下状态；其余类名保留。
export function paintUnitHp(unitEl, entry) {
    if (!unitEl || !entry) return;
    const pct = entry.maxHp ? Math.round((entry.hp / entry.maxHp) * 100) : 0;
    unitEl.querySelector?.('.igs-combat-hp')?.style?.setProperty?.('--igs-combat-hp', `${pct}%`);
    const value = unitEl.querySelector?.('.igs-combat-hp-value');
    if (value) value.textContent = `${entry.hp}/${entry.maxHp}`;
    toggleClass(unitEl, 'is-down', !entry.alive);
}

const FLOAT_TEXT = Object.freeze({
    damage: (m) => `-${m.amount}`,
    // 鞭尸 / 超杀：打在倒下的敌人身上，样式上与掉血区分。
    overkill: (m) => `-${m.amount}`,
    guard: () => '格挡',
    block: (m) => `+${m.amount} 格挡`,
    heal: (m) => `+${m.amount}`,
    ko: () => '击倒',
});

// 飘字：每条变化一个 span，挂在单位块里、立绘上方，按序号错开上浮（--i）；击倒也写在受击单位上（战斗面板不在画面中间出命中标签）。返回挂上的节点。
export function showHitFloats(doc, unitEl, marks, { reduced = false, schedule, rarity } = {}) {
    if (!unitEl || !doc?.createElement) return [];
    const nodes = [];
    for (const m of marks || []) {
        const text = FLOAT_TEXT[m.kind];
        if (!text) continue;
        const el = doc.createElement('span');
        el.className = `igs-combat-float is-${m.kind}${reduced ? ' is-reduced' : ''}`;
        el.setAttribute?.('aria-hidden', 'true');
        el.style?.setProperty?.('--i', String(nodes.length));
        el.textContent = text(m);
        if (rarity?.rank) {
            el.style?.setProperty('--igs-float-scale', String(rarity.floatScale));
            el.style?.setProperty('--igs-float-color', rarity.color);
        }
        unitEl.appendChild(el);
        nodes.push(el);
    }
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    if (nodes.length) later(() => { for (const n of nodes) n.remove?.(); }, COMBAT_HIT_FLOAT_MS + COMBAT_HIT_FLOAT_STAGGER_MS * (nodes.length - 1));
    return nodes;
}

export const COMBAT_HIT_REACT_ATTR = 'data-igs-combat-react';
const REACT_ORDER = ['ko', 'damage', 'overkill', 'guard', 'heal', 'block'];
const REACT_KIND = Object.freeze({ ko: 'hit', damage: 'hit', overkill: 'hit', guard: 'guard', block: 'guard', heal: 'heal' });

// 受击反馈：单位块挂 data-igs-combat-react（hit / guard / heal），样式按它做一次抖动或泛光，到时移除；减少动态效果时不加。返回反馈类别。
export function reactUnit(unitEl, marks, { reduced = false, schedule } = {}) {
    if (!unitEl || reduced) return '';
    const top = REACT_ORDER.find((k) => (marks || []).some((m) => m.kind === k));
    if (!top) return '';
    const react = REACT_KIND[top];
    // 先摘再挂并强制一次回流，连续命中同一单位时动画从头再播。
    unitEl.removeAttribute?.(COMBAT_HIT_REACT_ATTR);
    void unitEl.offsetWidth;
    unitEl.setAttribute?.(COMBAT_HIT_REACT_ATTR, react);
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    later(() => { if (unitEl.getAttribute?.(COMBAT_HIT_REACT_ATTR) === react) unitEl.removeAttribute?.(COMBAT_HIT_REACT_ATTR); }, COMBAT_HIT_REACT_MS);
    return react;
}


// 出牌飞行卡：手牌的影子从原位飞向目标并缩小淡出，挂在面板演出层（.igs-combat-fx，绝对定位）。
// from / to 为视口矩形；舞台量不到尺寸或不支持 WAAPI 时不飞，返回 0（命中照常立即落下）。
export function launchCardGhost(stage, ghost, from, to, { ms = COMBAT_CARD_FLY_MS, schedule, rarity } = {}) {
    const base = stage?.getBoundingClientRect?.();
    if (!stage || !ghost || !base || !from?.width || !to?.width || typeof ghost.animate !== 'function') return 0;
    const dx = Math.round((to.left + to.width / 2) - (from.left + from.width / 2));
    const dy = Math.round((to.top + to.height / 2) - (from.top + from.height / 2));
    const s = ghost.style;
    s?.setProperty?.('left', `${Math.round(from.left - base.left)}px`);
    s?.setProperty?.('top', `${Math.round(from.top - base.top)}px`);
    s?.setProperty?.('width', `${Math.round(from.width)}px`);
    s?.setProperty?.('height', `${Math.round(from.height)}px`);
    stage.appendChild(ghost);
    if (rarity?.trail) {
        ghost.setAttribute('data-igs-rarity-trail', '');
        ghost.style?.setProperty('--rar', rarity.color);
    }
    try {
        ghost.animate([
            { transform: 'translate(0px,0px) scale(1) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.round(dx * 0.7)}px,${Math.round(dy * 0.7)}px) scale(.8) rotate(-6deg)`, opacity: 1, offset: 0.7 },
            { transform: `translate(${dx}px,${dy}px) scale(.42) rotate(-10deg)`, opacity: 0 },
        ], { duration: ms, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' });
    } catch (error) { ghost.remove?.(); return 0; }
    const later = typeof schedule === 'function' ? schedule : (f, t) => setTimeout(f, t);
    later(() => ghost.remove?.(), ms);
    return ms;
}

// 影子卡：复制手牌节点，去掉交互属性与扇形内联样式，只作视觉。
export function cloneCardGhost(cardEl) {
    if (typeof cardEl?.cloneNode !== 'function') return null;
    const ghost = cardEl.cloneNode(true);
    for (const attr of ['data-combat-act', 'data-combat-id', 'aria-label', 'aria-disabled', 'style', 'id', 'title']) ghost.removeAttribute?.(attr);
    ghost.setAttribute?.('aria-hidden', 'true');
    ghost.setAttribute?.('tabindex', '-1');
    ghost.disabled = true;
    const keep = String(cardEl.className || '').split(/\s+/).filter((c) => c && c !== 'is-selected' && c !== 'is-disabled' && c !== 'is-hover');
    ghost.className = [...keep, 'is-flying'].join(' ');
    return ghost;
}
// 稀有度仅控制表现；未知档、普通档与个人卡不追加演出。专属卡（signature）与神话同档，只换颜色。
export const COMBAT_RARITY_COLORS = Object.freeze({ rare: '#ad94f0', epic: '#f2d49b', mythic: '#ef7777', signature: '#ff8a5c' });
// 分档：命中停顿（ms）、定向震屏幅度（px）、命中光效时长（ms）、飘字放大、命中冲击声。
const RARITY_TIERS = Object.freeze({
    rare: Object.freeze({ rank: 1, hold: 50, shake: 3, life: 600, floatScale: 1.2, sfx: 'battle-impact-rare' }),
    epic: Object.freeze({ rank: 2, hold: 90, shake: 5, life: 750, floatScale: 1.35, sfx: 'battle-impact-epic' }),
    mythic: Object.freeze({ rank: 3, hold: 120, shake: 8, life: 900, floatScale: 1.5, sfx: 'battle-impact-mythic' }),
    signature: Object.freeze({ rank: 3, hold: 120, shake: 8, life: 900, floatScale: 1.5, sfx: 'battle-impact-mythic' }),
});
// 减少动态效果：不停顿、不震屏、不放大、不出声，只留静态光晕；低画质：保留停顿与音效，不画拖影、火花与震屏。
export function cardRarityFx(rarity, { reduced = false, low = false } = {}) {
    const tier = Object.hasOwn(RARITY_TIERS, rarity) ? RARITY_TIERS[rarity] : null;
    const rank = tier ? tier.rank : 0;
    const on = Boolean(tier) && !reduced;
    return { rarity, rank, color: COMBAT_RARITY_COLORS[rarity] || '', reduced, low,
        hold: on ? tier.hold : 0,
        banner: on && rank === 3, trail: on && !low,
        particles: on && !low && rank === 3, shake: on && !low ? tier.shake : 0,
        floatScale: on ? tier.floatScale : 1,
        life: on ? tier.life : 0,
        sfx: on ? tier.sfx : '' };
}

// 出手动作的定义（名字与效果）：卡牌查图鉴，技能与人物技能查出手单位，道具查本场道具栏；查不到时只用事件里的名字。
function actionDef(event, battle) {
    const unit = battle?.units?.[event?.unitId];
    if (event?.type === 'card') return battle?.catalog?.[event.unitId]?.[event.cardId] || null;
    if (event?.type === 'skill') return unit?.skills?.find?.((s) => s.id === event.skillId) || { name: event.name };
    // 人物技能与抽到的主动特性同为 hero-skill 事件：按 skillId 先查特性，再落回固有人物技能。
    if (event?.type === 'hero-skill') return (unit?.traits || []).find((t) => t.skill?.id === event.skillId)?.skill || unit?.heroSkill || { name: event.name };
    if (event?.type === 'item') return battle?.items?.list?.find?.((i) => i.itemId === event.itemId) || { name: event.name };
    return null;
}

// 本段打出的最高档卡：带卡名、出牌单位（定向震屏的起点）与命中形态（combat-strike 关键词匹配）。
// 本段没有稀有及以上的卡时取第一个出手动作（卡牌、技能、人物技能、道具）的形态作基础命中：rank 仍为 0，只画形态，不停顿、不震、不出声。
export function playedCardFx(events, battle, options) {
    let best = cardRarityFx('', options);
    let lead = null;
    for (const event of events || []) {
        const def = actionDef(event, battle);
        if (!def) continue;
        if (!lead) lead = { unitId: event.unitId, strike: cardStrike(def) };
        if (event.type !== 'card') continue;
        const fx = cardRarityFx(def.rarity, options);
        if (fx.rank > best.rank) best = { ...fx, name: def.name, unitId: event.unitId, strike: cardStrike(def) };
    }
    return best.rank || !lead ? best : { ...best, ...lead };
}

// 基础命中（rank0：普通卡、个人卡、技能与道具）只在受击单位上画形态主图形，不加光晕、火花、停顿与震屏。
export const COMBAT_BASE_STRIKE_MS = 520;

// 临时光效节点由面板登记。play：画面中间的卡名横幅（面板只在本段没有招式条时调用）；
// hit：受击单位上的形态图形（data-strike，元素配色 --strike）；稀有及以上另加光晕、神话档火花，强度随档位。
// 减少动态效果与低画质：稀有及以上只挂静态光晕，不画形态与火花；基础命中不挂。都不增加时间轴等待。
export function showRarityFx(doc, host, fx, phase, { schedule } = {}) {
    const base = !fx?.rank;
    if (!host || (base ? phase !== 'hit' || !fx?.strike || fx.reduced || fx.low : !(phase === 'hit' || (phase === 'play' && fx.banner)))) return [];
    const life = base ? COMBAT_BASE_STRIKE_MS : fx.life || 600;
    const el = doc.createElement('span');
    el.className = `igs-combat-rarity-fx is-${phase} is-rank-${fx.rank || 0}${fx.reduced ? ' is-still' : ''}${fx.low ? ' is-low' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    if (!base) el.style?.setProperty('--rar', fx.color);
    el.style?.setProperty('--life', `${life}ms`);
    if (phase === 'play') el.textContent = fx.name || '';
    const rich = phase === 'hit' && !fx.reduced && !fx.low;
    if (rich && fx.strike) {
        el.setAttribute('data-strike', fx.strike.form);
        if (fx.strike.element) el.setAttribute('data-element', fx.strike.element);
        el.style?.setProperty('--strike', fx.strike.color);
        const shape = doc.createElement('i');
        shape.className = 'igs-combat-strike';
        el.appendChild(shape);
    }
    if (rich && fx.particles) {
        for (let i = 0; i < 8; i++) {
            const spark = doc.createElement('i');
            spark.className = 'igs-combat-rarity-spark';
            spark.style?.setProperty('--a', `${i * 45}deg`);
            el.appendChild(spark);
        }
    }
    host.appendChild(el);
    const later = schedule || ((fn, ms) => setTimeout(fn, ms));
    later(() => el.remove?.(), life);
    return [el];
}

// 前摇：远程画射击，施法画吟唱法阵（范围攻击更大），近战范围攻击画一道横扫（钝器为冲击波）；单体近战没有前摇。
// ms 为前摇开始到命中落下的间隔；减少动态效果与低画质不画前摇、不增加等待。
export const COMBAT_WINDUP_MS = Object.freeze({ shot: 360, cast: 420, sweep: 340 });
const WINDUP_FADE_MS = 180;
export function windupFx(fx) {
    const s = fx?.strike;
    if (!s || fx.reduced || fx.low) return null;
    const kind = s.delivery === 'spell' ? 'cast' : s.delivery === 'ranged' ? 'shot' : s.aoe ? 'sweep' : '';
    return kind ? { kind, ms: COMBAT_WINDUP_MS[kind], aoe: s.aoe === true, form: s.form, color: s.color, rank: fx.rank || 0 } : null;
}

// 前摇节点挂在演出前层中间；angle 为中间指向受击单位的角度（度），reach 为距离（px，量不到时用样式默认长度）。返回挂上的节点，由面板登记清理。
// 射击分两拍：前半段中间集中线收拢、受击单位上出现锁定准星；后半段开火（枪口闪光，弓箭为弦响波纹），弹丸沿弹道飞向准星，到达时命中落下。
// rays 为每道弹道的 { angle, reach, delay? }：范围攻击一单位一道，多段攻击一段一道、delay 为该段相对第一段的错开时长；没有时单体一道、范围攻击扇形三道。
// --impact 为开始到命中的时长，--fade 为命中后弹道与准星淡出的时长，--life 为节点总时长。
export function showWindupFx(doc, host, windup, { angle = -90, reach = 0, rays = null, schedule } = {}) {
    if (!host || !windup || !doc?.createElement) return [];
    const el = doc.createElement('span');
    el.className = `igs-combat-windup is-${windup.kind}${windup.aoe ? ' is-aoe' : ''} is-rank-${windup.rank}`;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-strike', windup.form);
    el.style?.setProperty('--strike', windup.color);
    // 多段射击各道弹道按段错开，节点总时长加上最晚一道的错开时长。
    const aimed = windup.kind === 'shot' && Array.isArray(rays) ? rays.filter((r) => Number.isFinite(r?.angle)).slice(0, 6) : [];
    const tail = Math.max(0, ...aimed.map((r) => (r.delay > 0 ? Math.round(r.delay) : 0)));
    el.style?.setProperty('--life', `${windup.ms + WINDUP_FADE_MS + tail}ms`);
    el.style?.setProperty('--impact', `${windup.ms}ms`);
    el.style?.setProperty('--fade', `${WINDUP_FADE_MS}ms`);
    el.style?.setProperty('--aim', `${Math.round(angle)}deg`);
    if (reach > 0) el.style?.setProperty('--reach', `${Math.round(reach)}px`);
    if (windup.kind === 'shot') {
        const list = aimed.length ? aimed : (windup.aoe ? [-16, 0, 16] : [0]).map((turn) => ({ turn }));
        for (const r of list) {
            const ray = doc.createElement('i');
            ray.className = 'igs-combat-windup-ray';
            if (Number.isFinite(r.turn)) ray.style?.setProperty('--turn', `${r.turn}deg`);
            if (Number.isFinite(r.angle)) ray.style?.setProperty('--aim', `${Math.round(r.angle)}deg`);
            if (r.reach > 0) ray.style?.setProperty('--reach', `${Math.round(r.reach)}px`);
            if (r.delay > 0) ray.style?.setProperty('--wave', `${Math.round(r.delay)}ms`);
            const lock = doc.createElement('i');
            lock.className = 'igs-combat-windup-lock';
            ray.appendChild(lock);
            el.appendChild(ray);
        }
    }
    host.appendChild(el);
    const later = schedule || ((fn, ms) => setTimeout(fn, ms));
    later(() => el.remove?.(), windup.ms + WINDUP_FADE_MS + tail);
    return [el];
}

