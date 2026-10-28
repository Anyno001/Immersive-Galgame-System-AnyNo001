// 非人角色显示：体型缩放、悬浮、溢出按头部对齐、巨型独立层、对手自动上台的编排。
// 人类的 resolveSpriteLayout / 贴地 / 槽位只在入口分派到这里，人类计算不经过本文件。
// 全部基于立绘图本身；头部与脚的探测结果由 fx-anchor 按图片缓存，本文件不重复测量。
import { FALLBACK_HEAD, HEAD_ASPECT, spriteBackgroundSize } from './fx-anchor.js';
import { CREATURE_TIERS, confirmedCreatureOf, creatureGiantFill, creatureSystemEnabled } from '../../scene/creature-profile.js';
import { foeBaseName, hasGroupSuffix, isFrenzyName, splitFoeNames } from '../../scene/creature-battle.js';

// 体型缩放（百分比，基于立绘基准高度）。巨型不进槽位，这里只记 1。
export const CREATURE_SCALE_DEFAULTS = Object.freeze({ small: 70, medium: 100, large: 135, giant: 100 });
const SCALE_MIN = 30;
const SCALE_MAX = 220;
// 脸（头顶）至少离舞台上沿的距离，占舞台高度；放大溢出时宁可裁脚和尾。
export const CREATURE_FACE_MARGIN = 0.06;
// 悬浮：立绘有效部分（头顶到脚）的中心落在舞台高度的这个位置，偏上，给对话框留出下方空间。
export const CREATURE_FLOAT_CENTER = 0.4;
// 头部识别失败时：脸心落在图上部 25% 处、水平居中。
export const CREATURE_FALLBACK_FACE = Object.freeze({ cx: 0.5, cy: 0.25, top: 0.15 });
// 巨型铺满舞台后再多放的比例，保证边缘不露底。
export const GIANT_OVERFILL = 1.08;
export const GIANT_ID = 'igs-giant';
// 巨型在场时背景压暗的幅度（只压背景层，不压人物）。
export const GIANT_DIM_ALPHA = 0.3;
const GIANT_FADE_MS = 520;

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

// ---- 档案查询（按 characterDna 表缓存，表本身只读，从不原地改） ----
const profileCache = new WeakMap();

// 巨型铺满关闭时按大型处理：同一档案只派生一次。
const largeCopies = new WeakMap();
const asLarge = (profile) => {
    let copy = largeCopies.get(profile);
    if (!copy) { copy = { ...profile, size: 'large' }; largeCopies.set(profile, copy); }
    return copy;
};

export function creatureProfileOf(dnaMap, name) {
    if (!creatureSystemEnabled() || !dnaMap || typeof dnaMap !== 'object' || !name) return null;
    let byName = profileCache.get(dnaMap);
    if (!byName) { byName = new Map(); profileCache.set(dnaMap, byName); }
    if (!byName.has(name)) byName.set(name, Object.hasOwn(dnaMap, name) ? confirmedCreatureOf(dnaMap[name]) : null);
    const profile = byName.get(name);
    return profile && profile.size === 'giant' && !creatureGiantFill() ? asLarge(profile) : profile;
}

// 显示层用：半人形选了半身取景时按人类半身立绘的布局与贴地处理（不缩放、不悬浮），返回 null。
export function creatureDisplayProfileOf(dnaMap, name) {
    const profile = creatureProfileOf(dnaMap, name);
    return profile && profile.framing === 'half' ? null : profile;
}

// 半身取景的档案不当巨型（图本身已是半身，走人类布局）。
export const isGiantCreature = (profile) => Boolean(profile && profile.size === 'giant' && profile.framing !== 'half');

// ---- 体型缩放 ----
// settings 为 readerSettings.creatureDisplay：{ small, medium, large }，在角色页「非人角色」组设置，缺省取默认。
export function creatureScalePercent(profile, settings) {
    if (!profile) return 100;
    const own = settings && typeof settings === 'object' ? Number(settings[profile.size]) : NaN;
    const base = Number.isFinite(own) && own > 0 ? own : CREATURE_SCALE_DEFAULTS[profile.size] || 100;
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, base));
}

// 人类版 resolveSpriteLayout 已经算出的布局乘上体型。manual：用户在「调整立绘」或角色高度里亲手定过，不再乘。
// 返回新对象，不改入参（布局可能来自共享缓存）。
export function applyCreatureScale(profile, layout, settings, manual = false) {
    if (!profile || !layout || manual || profile.size === 'giant') return layout;
    const percent = creatureScalePercent(profile, settings);
    if (percent === 100) return layout;
    return { ...layout, scale: round2(num(layout.scale, 100) * percent / 100) };
}

// ---- 头部 / 脚 ----
const isFallbackHead = (head) => !head || head === FALLBACK_HEAD
    || (head.x === FALLBACK_HEAD.x && head.top === FALLBACK_HEAD.top && head.w === FALLBACK_HEAD.w);

// 脸在原图里的位置（均为原图比例）：cx 水平中心，top 头顶，cy 脸心。识别失败回落到上部 25% 居中。
export function creatureFace(probed, headOverride = null) {
    const head = headOverride || (probed && probed.head);
    if (isFallbackHead(head)) return { ...CREATURE_FALLBACK_FACE, fallback: true };
    const ratio = probed && probed.naturalW > 0 && probed.naturalH > 0 ? probed.naturalW / probed.naturalH : 0.7;
    return { cx: head.x, top: head.top, cy: head.top + head.w * HEAD_ASPECT * ratio / 2, fallback: false };
}

const feetOf = (probed) => {
    const feet = Number(probed && probed.feet);
    return feet > 0 && feet <= 1 ? feet : 1;
};

// background-position 百分比：让图上 imgPx 处落在舞台 stagePx 处。图与舞台等长时无解，返回 null。
function posFor(stageLen, imgLen, imgPx, stagePx) {
    const room = stageLen - imgLen;
    if (Math.abs(room) < 1) return null;
    return round2((stagePx - imgPx) / room * 100);
}

// 把期望的图顶坐标换成 posY。图高几乎等于舞台高时挪不动，缩 1% 腾出空隙再试，仍不行就沿用原 posY。
function topToPos(stageH, scale, top, fallbackPosY, nudge = false) {
    let s = scale;
    for (let i = 0; i < (nudge ? 2 : 1); i += 1) {
        const h = stageH * s / 100;
        const pos = posFor(stageH, h, 0, top);
        if (pos != null) return { scale: s, posY: pos };
        s = round2(s * 0.99);
    }
    return { scale, posY: fallbackPosY };
}

// 单个非人角色的落位。sprite：{ scale, posX, posY }（scale 已乘体型）；probed：peekSpriteHead 的结果，可为空。
// 返回 { scale, posX, posY }。
// - ground：默认不动 posY（plant 为真或高度溢出舞台时脚贴底）；溢出后头顶低于安全线就整体下移，裁掉脚和尾；
// - float：有效部分居中偏上，不贴地；
// - 横向图宽超过舞台时按脸对齐，否则按槽位中心（centerX）居中。
export function placeCreature({ stageW = 0, stageH = 0, profile, sprite, probed = null, head = null, centerX = null, plant = false } = {}) {
    const base = { scale: num(sprite && sprite.scale, 100), posX: num(sprite && sprite.posX, 50), posY: num(sprite && sprite.posY, 100) };
    if (!(stageH > 0) || !profile) return base;
    const face = creatureFace(probed, head);
    const feet = feetOf(probed);
    const floating = profile.anchor === 'float';
    let h = stageH * base.scale / 100;
    const overflow = h > stageH + 1;
    let top = null;
    if (floating) top = CREATURE_FLOAT_CENTER * stageH - (face.top + feet) / 2 * h;
    else if (plant || overflow) top = stageH - feet * h;
    if (top != null) {
        const minY = CREATURE_FACE_MARGIN * stageH;
        if (top + face.top * h < minY) top = minY - face.top * h;
        const placed = topToPos(stageH, base.scale, top, base.posY, floating);
        base.scale = placed.scale;
        base.posY = placed.posY;
        h = stageH * base.scale / 100;
    }
    if (stageW > 0 && probed && probed.naturalW > 0 && probed.naturalH > 0) {
        const w = h * probed.naturalW / probed.naturalH;
        const cx = centerX == null || centerX === '' ? NaN : Number(centerX);
        const target = (Number.isFinite(cx) ? cx : 50) / 100 * stageW;
        if (w > stageW + 1) {
            const pos = posFor(stageW, w, face.cx * w, target);
            if (pos != null) base.posX = pos;
        } else if (Number.isFinite(cx)) {
            const pos = posFor(stageW, w, w / 2, target);
            if (pos != null) base.posX = pos;
        }
    }
    return base;
}

// 同屏规划（planCastLayouts 的分派点）：对一个带 creature 档案的条目做落位，含 auto 副本。
// entry：{ url, scale, posX, posY, centerX?, locked?, auto?, head?, creature }；返回 { entry, pending }。
// 锁定的条目（用户手摆）保持原位置；没有探测数据时先按已知信息摆，并要求调用方探测后重排。
export function planCreatureEntry({ stageW = 0, stageH = 0, align = false, entry, probed = null }) {
    const e = entry || {};
    const sized = stageW > 0 && stageH > 0;
    const heightScale = num(e.scale, 100);
    const next = { ...e, heightScale };
    if (!sized) return { entry: next, pending: false };
    const pending = !probed && Boolean(e.url);
    if (e.locked !== true) {
        const placed = placeCreature({ stageW, stageH, profile: e.creature, sprite: e, probed, head: e.head || null, centerX: e.centerX, plant: align });
        next.posX = placed.posX; next.posY = placed.posY; next.scale = placed.scale;
    }
    if (e.auto) {
        const placed = placeCreature({ stageW, stageH, profile: e.creature, sprite: e.auto, probed, head: e.head || null, centerX: e.centerX, plant: align });
        next.auto = { posX: placed.posX, posY: placed.posY, scale: placed.scale };
    }
    return { entry: next, pending };
}

// ---- 窄舞台防遮挡 ----
// 头部圆：中心与半径（舞台像素）。读不到探测结果返回 null。
function headCircle(stageW, stageH, entry, probed) {
    if (!probed || !(probed.naturalW > 0) || !(probed.naturalH > 0)) return null;
    const h = stageH * num(entry.scale, 100) / 100;
    const w = h * probed.naturalW / probed.naturalH;
    const left = (stageW - w) * num(entry.posX, 50) / 100;
    const top = (stageH - h) * num(entry.posY, 100) / 100;
    const head = entry.head || probed.head;
    const face = creatureFace(probed, entry.head || null);
    const r = (isFallbackHead(head) ? 0.15 : Math.max(0.04, num(head.w, 0.3)) / 2) * w;
    return { x: left + face.cx * w, y: top + face.cy * h, r };
}

// 窄舞台（宽/高 < 1）同屏：放大的非人条目，其头部锚点不得被相邻人物的头部区域盖住。
// 冲突时缩回到不冲突的最大缩放（不低于 100%）；仍冲突则保持 100% 并移到远离对方的边槽。人类条目不动。
export function relieveCreatureCrowding({ stageW = 0, stageH = 0, align = false, speaker = null, members = [], pending = [], peek = () => null } = {}) {
    const out = { speaker, members, pending };
    if (!(stageW > 0) || !(stageH > 0) || stageW / stageH >= 1) return out;
    const all = [speaker, ...members].filter(Boolean);
    const circle = (e) => (e && e.url ? headCircle(stageW, stageH, e, peek(e.url)) : null);
    const conflictOf = (target, c) => all.some((o) => {
        if (o === target) return false;
        const oc = circle(o);
        return oc && Math.hypot(c.x - oc.x, c.y - oc.y) < oc.r + c.r * 0.6;
    });
    const replace = (old, next) => {
        if (old === out.speaker) out.speaker = next;
        else out.members = out.members.map((m) => (m === old ? next : m));
        const at = all.indexOf(old);
        if (at >= 0) all[at] = next;
    };
    for (const entry of [...all]) {
        if (!entry.creature || entry.locked === true || num(entry.scale, 100) <= 100 || !Number.isFinite(Number(entry.centerX))) continue;
        const probed = peek(entry.url);
        const c = circle(entry);
        if (!probed || !c || !conflictOf(entry, c)) continue;
        const trial = (scale, centerX) => {
            const placed = placeCreature({ stageW, stageH, profile: entry.creature, sprite: { scale, posX: entry.posX, posY: 100 }, probed, head: entry.head || null, centerX, plant: true });
            return { ...entry, centerX, posX: placed.posX, posY: placed.posY, scale: placed.scale };
        };
        let chosen = null;
        for (let s = Math.floor(num(entry.scale, 100) / 5) * 5; s >= 100 && !chosen; s -= 5) {
            const next = trial(s, entry.centerX);
            if (!conflictOf(entry, circle(next))) chosen = next;
        }
        if (!chosen) {
            const near = all.filter((o) => o !== entry).map(circle).filter(Boolean).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
            chosen = trial(100, near && near.x < stageW / 2 ? 82 : 18);
        }
        replace(entry, chosen);
    }
    return out;
}

// 窄舞台上巨型怪在场：前景只留一位人物，站到与巨型怪头部相反的一侧（82% / 18%）；巨型怪头部随之偏到对侧约 36% / 64%。
export function giantAsideCenter({ stageW = 0, stageH = 0, probed = null, head = null } = {}) {
    const spot = placeGiant({ stageW, stageH, probed, head });
    if (!spot) return 82;
    const h = stageH * spot.scale / 100;
    const w = h * probed.naturalW / probed.naturalH;
    const left = (stageW - w) * spot.posX / 100;
    const face = creatureFace(probed, head);
    return (left + face.cx * w) / stageW <= 0.5 ? 82 : 18;
}

// 图中心落在舞台 centerPct% 处所需的 posX；读不到图或图宽等于舞台宽时返回 null。
export function posXForCenterPct(stageW, stageH, scale, probed, centerPct) {
    if (!(stageW > 0) || !probed || !(probed.naturalW > 0) || !(probed.naturalH > 0)) return null;
    const h = stageH * num(scale, 100) / 100;
    const w = h * probed.naturalW / probed.naturalH;
    return posFor(stageW, w, w / 2, stageW * centerPct / 100);
}

// ---- 悬浮动画开关 ----
// 悬浮的角色元素带 data-igs-creature-float，由样式表里的 CSS 动画上下浮动；减少动效 / 低画质时不动。
export function setCreatureFloat(el, on) {
    if (!el || typeof el.setAttribute !== 'function') return;
    const has = typeof el.hasAttribute === 'function' && el.hasAttribute('data-igs-creature-float');
    if (on && !has) el.setAttribute('data-igs-creature-float', '1');
    else if (!on && has) el.removeAttribute('data-igs-creature-float');
}

// 同屏层里各角色元素按档案同步悬浮标记（只遍历在场的几个元素）。
export function syncCastFloat(root, isFloat) {
    const layer = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-cast') : null;
    if (!layer) return;
    for (const el of Array.from(layer.children || [])) {
        const name = el.getAttribute && el.getAttribute('data-igs-cast-char');
        if (name != null) setCreatureFloat(el, Boolean(isFloat(name)));
    }
}

// ---- 巨型层 ----
// 铺满舞台并溢出：先按「盖住舞台」定高度，再让脸（头顶）落在安全线以内，同时不露出底部与左右空隙。
export function placeGiant({ stageW = 0, stageH = 0, probed = null, head = null, headX = 0.5 } = {}) {
    if (!(stageW > 0) || !(stageH > 0) || !probed || !(probed.naturalW > 0) || !(probed.naturalH > 0)) return null;
    const ratio = probed.naturalW / probed.naturalH;
    const cover = Math.max(1, stageW / (stageH * ratio));
    const scale = round2(cover * GIANT_OVERFILL * 100);
    const h = stageH * scale / 100;
    const w = h * ratio;
    const face = creatureFace(probed, head);
    const minY = CREATURE_FACE_MARGIN * stageH;
    // 脸尽量居中偏上；图能盖住舞台的范围内取值，再保证头顶在安全线内（头顶优先，宁可露一点底）。
    let top = 0.34 * stageH - face.cy * h;
    top = Math.max(stageH - h, Math.min(0, top));
    if (top + face.top * h < minY) top = minY - face.top * h;
    let left = stageW * headX - face.cx * w;
    left = Math.max(stageW - w, Math.min(0, left));
    const roomX = stageW - w;
    const roomY = stageH - h;
    return {
        scale,
        posX: Math.abs(roomX) < 1 ? 50 : round2(left / roomX * 100),
        posY: Math.abs(roomY) < 1 ? 100 : round2(top / roomY * 100),
    };
}

const cssUrl = (url) => `url("${String(url).replace(/"/g, '&quot;')}")`;

function giantLayer(root, create) {
    if (!root || typeof root.querySelector !== 'function') return null;
    const existing = root.querySelector(`#${GIANT_ID}`);
    if (existing || !create) return existing || null;
    const doc = root.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const anchor = root.querySelector('#igs-cast') || root.querySelector('#igs-sprite');
    const parent = (anchor && anchor.parentNode) || root.querySelector('#igs-stage-motion') || root;
    const layer = doc.createElement('div');
    layer.id = GIANT_ID;
    layer.className = 'igs-giant-layer';
    const dim = doc.createElement('div');
    dim.className = 'igs-giant-dim';
    const img = doc.createElement('div');
    img.className = 'igs-giant-img';
    layer.appendChild(dim);
    layer.appendChild(img);
    parent.insertBefore(layer, anchor && anchor.parentNode === parent ? anchor : null);
    return layer;
}

function fadeGiant(layer, from, to, ms) {
    if (!layer || typeof layer.animate !== 'function') return;
    try { layer.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out' }); } catch { /* 无动画能力时直接到位 */ }
}

// 渲染巨型层。giant：{ character, url } 或 null；probe：(url) => Promise<探测结果>，peek：(url) => 已缓存结果。
// 同一张图同一舞台尺寸只摆一次；换图等探测（含解码）完成后再换上，后来者取代前者；去掉时淡出后移除图。
export function applyGiantLayer(root, giant, { stageW = 0, stageH = 0, reduced = false, head = null, headX = 0.5, peek, probe, schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
    const layer = giantLayer(root, Boolean(giant && giant.url));
    if (!layer) return;
    const state = layer._igsGiantState || (layer._igsGiantState = { url: '', key: '', token: 0 });
    const imgEl = layer.querySelector('.igs-giant-img');
    if (!giant || !giant.url) {
        state.token += 1;
        if (!state.url) return;
        state.url = ''; state.key = '';
        const token = state.token;
        const done = () => {
            if (state.token !== token) return;
            if (imgEl) imgEl.style.backgroundImage = '';
            layer.style.display = 'none';
            layer.removeAttribute('data-igs-giant-on');
        };
        if (reduced) { done(); return; }
        fadeGiant(layer, 1, 0, GIANT_FADE_MS / 2);
        layer.style.opacity = '0';
        schedule(done, GIANT_FADE_MS / 2);
        return;
    }
    const key = `${giant.url}|${Math.round(stageW)}x${Math.round(stageH)}|${headX}`;
    if (state.key === key) return;
    const sameImage = state.url === giant.url;
    state.key = key;
    state.token += 1;
    const token = state.token;
    const place = (probed) => {
        if (state.token !== token) return;
        const spot = placeGiant({ stageW, stageH, probed, head, headX });
        if (!spot) return;
        const firstShow = !state.url || layer.style.display === 'none';
        state.url = giant.url;
        if (imgEl) {
            imgEl.style.backgroundImage = cssUrl(giant.url);
            imgEl.style.backgroundSize = spriteBackgroundSize(spot.scale);
            imgEl.style.backgroundPosition = `${spot.posX}% ${spot.posY}%`;
        }
        layer.style.display = 'block';
        layer.style.opacity = '1';
        layer.setAttribute('data-igs-giant-on', '1');
        if (!sameImage) layer.setAttribute('data-igs-giant-name', String(giant.character || ''));
        if (!reduced && (firstShow || !sameImage)) fadeGiant(layer, 0, 1, GIANT_FADE_MS);
    };
    const cached = typeof peek === 'function' ? peek(giant.url) : null;
    if (cached) { place(cached); return; }
    if (typeof probe === 'function') {
        Promise.resolve(probe(giant.url)).then((probed) => { if (probed) place(probed); else if (state.token === token) state.key = ''; }, () => { if (state.token === token) state.key = ''; });
    }
}

export function clearGiantLayer(root) {
    const layer = giantLayer(root, false);
    if (!layer) return;
    const state = layer._igsGiantState;
    if (state) { state.token += 1; state.url = ''; state.key = ''; }
    const imgEl = layer.querySelector('.igs-giant-img');
    if (imgEl) imgEl.style.backgroundImage = '';
    layer.style.display = 'none';
    layer.removeAttribute('data-igs-giant-on');
}

// ---- 战斗对手（单个或多个）：按名取档案与立绘 ----
const TIER_MOOD = Object.freeze(Object.fromEntries(CREATURE_TIERS.map((tier) => [tier.id, tier.mood])));
// 同屏最多的槽位对手数（巨型另算，最多一只）。
export const CREATURE_FOE_SLOTS = 2;

// raw：战斗对手原文（可含「、」分隔）；canonical(名)：别名归一；spriteOf(名, 情绪)：取立绘 { url, character }；resolve(url)：转成可显示地址。
// frenzy：已进入二阶段的名单，二阶段后的页面基准立绘用狂暴档；phases：本页发生的二阶段（本页开头仍是原档位，由演出切换）。
// 对手名带「们 / 群 / 众」时先按原名查，再按去掉后缀的本名查（哥布林们 → 哥布林）。只返回已确认的非人对手。
export function resolveCreatureFoes({ raw, dnaMap, canonical = (name) => name, spriteOf, resolve = (url) => url, frenzy = [], phases = [], withTiers = false } = {}) {
    const names = splitFoeNames(raw);
    const phased = (Array.isArray(phases) ? phases : []).map((p) => String((p && p.name) || '')).filter(Boolean);
    const out = [];
    for (const rawName of names) {
        let name = String(canonical(rawName) || rawName);
        let profile = creatureProfileOf(dnaMap, name);
        let lookup = rawName;
        if (!profile && hasGroupSuffix(rawName)) {
            lookup = foeBaseName(rawName);
            name = String(canonical(lookup) || lookup);
            profile = creatureProfileOf(dnaMap, name);
        }
        if (!profile || typeof spriteOf !== 'function') continue;
        const baseFrenzy = isFrenzyName(frenzy, rawName, names) && !phased.some((n) => isFrenzyName([n], rawName, names));
        const hit = spriteOf(lookup, baseFrenzy ? TIER_MOOD.frenzy : '');
        const image = hit && hit.url ? resolve(hit.url) : '';
        const item = { raw: rawName, name: hit && hit.character ? hit.character : name, profile, hit, image };
        if (withTiers) {
            const tiers = {};
            for (const tier of ['menace', 'wounded', 'frenzy']) {
                const tierHit = spriteOf(lookup, TIER_MOOD[tier]);
                const url = tierHit && tierHit.url ? resolve(tierHit.url) : '';
                if (url && url !== image) tiers[tier] = url;
            }
            item.tiers = tiers;
        }
        out.push(item);
    }
    return out;
}

// ---- 同屏编排：巨型取代、对手自动上台 ----
const FOE_ORDER = Number.MAX_SAFE_INTEGER - 1;

// speaker：主立绘 { character, image, mood, outfit, order } 或 null；members：同屏陪衬；
// giants：已识别出的巨型候选（先后顺序即出场顺序，最后一个取代前面的）；
// foe：战斗中的非人对手 { character, image, mood, outfit }（非巨型，没有图则为 null）。
// 巨型不占槽位：说话人是巨型时，第一位陪衬补上主立绘，免得陪衬因为凑不满两人而不显示。
// 返回 { speaker, members, giant, pin }：pin 是需要保证留在台上的对手名。
// foes：多对手时的槽位对手（最多 CREATURE_FOE_SLOTS 个，非巨型），与单个 foe 二选一；有多个时 pin 返回名字数组。
export function composeCreatureStage({ speaker = null, members = [], giants = [], foe = null, foes = [], castOn = true } = {}) {
    const giant = giants.length ? giants[giants.length - 1] : null;
    let main = speaker;
    let list = Array.isArray(members) ? members : [];
    let pin = '';
    if (foe && foe.image) {
        const inMembers = list.some((m) => m && m.character === foe.character);
        if (!main) main = { character: foe.character, image: foe.image, mood: foe.mood || '', outfit: foe.outfit || '', order: null, foe: true };
        else if (main.character === foe.character) { /* 对手自己就是主立绘 */ } else if (castOn) {
            if (!inMembers) list = [...list, { character: foe.character, mood: foe.mood || '', outfit: foe.outfit || '', image: foe.image, order: FOE_ORDER }];
            pin = foe.character;
        }
    }
    if (Array.isArray(foes) && foes.length) {
        const pins = [];
        for (const f of foes.filter((item) => item && item.image).slice(0, CREATURE_FOE_SLOTS)) {
            if (!main) { main = { character: f.character, image: f.image, mood: f.mood || '', outfit: f.outfit || '', order: null, foe: true }; continue; }
            if (main.character === f.character || !castOn) continue;
            if (!list.some((m) => m && m.character === f.character)) list = [...list, { character: f.character, mood: f.mood || '', outfit: f.outfit || '', image: f.image, order: FOE_ORDER }];
            pins.push(f.character);
        }
        if (pins.length) pin = pins;
    }
    if (giant && !main && list.length) {
        const [first, ...rest] = list;
        main = { character: first.character, image: first.image, mood: first.mood || '', outfit: first.outfit || '', order: first.order };
        list = rest;
    }
    return { speaker: main, members: list, giant, pin };
}

export const CREATURE_LAYOUT_STYLE_TEXT = `
#igs-giant{position:absolute;inset:0;z-index:1;pointer-events:none;display:none;}
#igs-giant .igs-giant-dim{position:absolute;inset:0;background:rgba(6,8,12,${GIANT_DIM_ALPHA});}
#igs-giant .igs-giant-img{position:absolute;inset:0;background-repeat:no-repeat;will-change:opacity;}
#igs-overlay[data-igs-cg-only="1"] #igs-giant,#igs-overlay[data-igs-stage-covered] #igs-giant,#igs-overlay.igs-record-screen-open #igs-giant,#igs-stage-motion[data-igs-fx-presentation="1"] #igs-giant,#igs-stage-motion[data-igs-fx-call="video"] #igs-giant,#igs-stage-motion[data-igs-fx-call-remote] #igs-giant{visibility:hidden!important;}
@keyframes igs-creature-float{0%,100%{translate:0 0;}50%{translate:0 -1.6%;}}
#igs-overlay:not([data-igs-quality="low"]) #igs-stage-motion [data-igs-creature-float]:not(.igs-sprite-editing):not([data-igs-cast-leaving]){animation:igs-creature-float 6.4s ease-in-out infinite;will-change:translate;}
@media (prefers-reduced-motion: reduce){#igs-overlay [data-igs-creature-float]{animation:none!important;}#igs-giant{transition:none!important;}}
`.trim();
