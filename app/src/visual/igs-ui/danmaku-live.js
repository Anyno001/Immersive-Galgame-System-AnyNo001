import { applyPhoneLook } from './my-phone.js';
import { LIVE_ICONS, buildPhoneStatus, setPhoneStatus } from './danmaku-icons.js';
import { isStagePaused } from './stage-pause.js';
import { DANMAKU_SPEED_SECONDS, normalizeLivePortrait } from './danmaku-settings.js';
import { estimateTextWidth, occupyTrack, pickScrollTrack } from './danmaku-lanes.js';
import {
    LIVE_AMBIENT_GIFTS,
    LIVE_AMBIENT_LINES,
    LIVE_HOST_AMBIENT_LINES,
    fanMedalName,
    randomItem,
    randomLiveName,
    stableHash,
} from './danmaku-pools.js';

// 「掏出手机」看 B 站竖屏直播：舞台压暗、手机从下方抬起停在画面正中，直播结束时收回。整台手机只有一个驱动计时器：每拍吐一条弹幕（AI 弹幕优先，其余由本地词池补），
// 顺带推人气、走时钟、飘点赞；隐藏、页面不可见、舞台暂停（面板打开等）时空转不写 DOM。文字一律 textContent，图标只用静态 SVG。
export const LIVE_LIST_LIMIT = 20;
const HEART_LIMIT = 6;
const LIVE_FLY_CAP = 14;
const HEART_COLORS = Object.freeze(['#ff5f8f', '#ff8a5c', '#ffb3c7', '#ff4d6d', '#f78fb3']);
const SC_TIERS = Object.freeze([[2000, '#ab1a32'], [1000, '#e54d4d'], [500, '#e09443'], [100, '#e2b52b'], [50, '#427d9e'], [30, '#2a60b2']]);
const GUARD_LEVELS = Object.freeze({ 舰长: '#4f8cff', 提督: '#b367ff', 总督: '#ff6a3d' });
const LIFE = Object.freeze({ sc: 7000, gift: 2600, guard: 3400, heart: 1600, leave: 420 });

const lives = new WeakMap();
// 机型的屏幕宽高比；放大时最高 820px，宽度至少 240px（舞台够宽时），避免对话框高时手机被挤成窄条。
const LIVE_MODEL_RATIO = Object.freeze({ full: 9 / 18.5, notch: 9 / 17, fold: 6 / 7, tablet: 3 / 4 });
const LIVE_PHONE_MAX_H = 820;
const LIVE_PHONE_MIN_W = 240;

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function icon(doc, name, className = 'igs-live-icon') {
    const node = el(doc, 'span', className);
    node.innerHTML = LIVE_ICONS[name] || '';
    return node;
}

export function formatPopularity(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    return n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : String(n);
}

export function scColorOf(amount) {
    const n = Number(String(amount || '').replace(/[^\d.]/g, '')) || 30;
    const tier = SC_TIERS.find(([min]) => n >= min);
    return { amount: Math.max(30, Math.round(n)), color: tier ? tier[1] : SC_TIERS[SC_TIERS.length - 1][1] };
}

export function guardLevelOf(value) {
    const text = String(value || '');
    return Object.keys(GUARD_LEVELS).find((level) => text.includes(level)) || '舰长';
}

function giftCountOf(value) {
    const n = Number(String(value || '').replace(/[^\d]/g, ''));
    return n > 0 ? Math.min(n, 9999) : 1;
}

function clock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    const h = Math.floor(total / 3600);
    return `${h ? `${pad(h)}:` : ''}${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

function buildPhone(doc, live, now, layout) {
    const host = live.view === 'host';
    const root = el(doc, 'div', 'igs-live-stage');
    root.setAttribute('data-layout', layout);
    root.appendChild(el(doc, 'div', 'igs-live-dim'));
    const phone = el(doc, 'div', 'igs-live-phone');
    root.appendChild(phone);
    phone.setAttribute('data-view', live.view);
    const screen = el(doc, 'div', 'igs-live-screen');
    const cover = el(doc, 'div', 'igs-live-cover');
    const portrait = el(doc, 'img', 'igs-live-portrait');
    portrait.alt = '';
    portrait.hidden = true;
    const initial = el(doc, 'div', 'igs-live-initial', Array.from(live.name)[0] || '?');
    // 直播中出 CG：画面换成 CG，完整显示在屏幕中间，上下由同一张图的模糊放大补满。
    const cg = el(doc, 'img', 'igs-live-cg');
    cg.alt = '';
    cg.hidden = true;
    screen.append(cover, portrait, initial, cg);

    const top = el(doc, 'div', 'igs-live-top');
    const anchor = el(doc, 'div', 'igs-live-anchor');
    const avatar = el(doc, 'div', 'igs-live-avatar', Array.from(live.name)[0] || '?');
    const meta = el(doc, 'div', 'igs-live-meta');
    meta.appendChild(el(doc, 'div', 'igs-live-host', live.name));
    const pop = el(doc, 'div', 'igs-live-pop');
    pop.appendChild(icon(doc, 'flame'));
    const popText = el(doc, 'span', '', '0');
    pop.appendChild(popText);
    meta.appendChild(pop);
    anchor.append(avatar, meta);
    if (!host) {
        const follow = el(doc, 'span', 'igs-live-follow');
        follow.append(icon(doc, 'plus'), el(doc, 'span', '', '关注'));
        anchor.appendChild(follow);
    }
    const tools = el(doc, 'div', 'igs-live-tools');
    const viewers = el(doc, 'span', 'igs-live-viewers');
    viewers.appendChild(icon(doc, 'viewers'));
    const viewersText = el(doc, 'span', '', '0');
    viewers.appendChild(viewersText);
    tools.append(viewers, icon(doc, 'close', 'igs-live-icon igs-live-close'));
    top.append(anchor, tools);
    // 全屏形态对齐 B 站竖屏直播间：前三名榜单、热门/人气榜胶囊、「N 人正在看」与右下角榜单名次卡。
    let watchingText = null;
    let extras = [];
    if (layout === 'full') {
        const ranks = el(doc, 'div', 'igs-live-ranks');
        for (let i = 1; i <= 3; i += 1) {
            const rank = el(doc, 'span', 'igs-live-rank', String(i));
            rank.setAttribute('data-rank', String(i));
            ranks.appendChild(rank);
        }
        tools.insertBefore(ranks, viewers);
        const chips = el(doc, 'div', 'igs-live-chips');
        chips.append(el(doc, 'span', 'igs-live-chip', '热门榜'), el(doc, 'span', 'igs-live-chip', '人气榜'));
        const watching = el(doc, 'span', 'igs-live-chip igs-live-watching');
        watchingText = el(doc, 'span', '', '0');
        watching.append(watchingText, el(doc, 'span', '', ' 人正在看'));
        chips.appendChild(watching);
        const seed = stableHash(`${live.name}|${live.title}`);
        const card = el(doc, 'div', 'igs-live-rankcard');
        card.append(
            el(doc, 'b', 'igs-live-rankcard-title', '人气榜'),
            el(doc, 'span', 'igs-live-rankcard-sub', live.title || `${live.name}的直播间`),
            el(doc, 'span', 'igs-live-rankcard-place', `第 ${1 + (seed % 30)} 名`),
            el(doc, 'span', 'igs-live-rankcard-gap', `距上一名 ${50 + (seed % 900)}`),
        );
        extras = [chips, card];
    }

    const title = el(doc, 'div', 'igs-live-title');
    title.appendChild(el(doc, 'span', 'igs-live-badge', host ? '直播中' : 'LIVE'));
    title.appendChild(el(doc, 'span', 'igs-live-title-text', live.title || `${live.name}的直播间`));
    const clockEl = el(doc, 'span', 'igs-live-clock', '');
    clockEl.hidden = !host;
    title.appendChild(clockEl);

    const sc = el(doc, 'div', 'igs-live-sc');
    const gifts = el(doc, 'div', 'igs-live-gifts');
    const guard = el(doc, 'div', 'igs-live-guard');
    const list = el(doc, 'div', 'igs-live-list');
    const fly = el(doc, 'div', 'igs-live-fly');
    const hearts = el(doc, 'div', 'igs-live-hearts');
    const bar = el(doc, 'div', 'igs-live-bar');
    if (host) {
        for (const name of ['mic', 'beauty', 'flip', 'more']) bar.appendChild(icon(doc, name, 'igs-live-icon igs-live-btn'));
        bar.appendChild(el(doc, 'span', 'igs-live-input', '和观众说点什么'));
    } else {
        bar.appendChild(el(doc, 'span', 'igs-live-input', '发个弹幕呗~'));
        bar.append(icon(doc, 'gift', 'igs-live-icon igs-live-btn is-gift'), icon(doc, 'heart', 'igs-live-icon igs-live-btn is-like'));
    }
    // 全屏形态直接铺在舞台上，没有机身状态栏。
    const status = layout === 'phone' ? buildPhoneStatus(doc, now) : null;
    if (status) phone.append(screen, status);
    else phone.append(screen);
    phone.append(top, ...extras, title, sc, gifts, guard, list, fly, hearts, bar);
    return { root, phone, status, cover, portrait, initial, cg, avatar, popText, viewersText, watchingText, clockEl, sc, gifts, guard, list, fly, hearts };
}

function later(state, fn, ms) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, ms);
    state.timers.add(timer);
}

function transient(state, parent, node, life) {
    parent.appendChild(node);
    later(state, () => node.remove(), life);
}

function medal(state, user) {
    const level = (stableHash(user) % 20) + 1;
    const node = el(state.doc, 'span', 'igs-live-medal');
    node.setAttribute('data-tier', String(Math.min(5, Math.ceil(level / 4))));
    node.appendChild(el(state.doc, 'span', '', state.medal));
    node.appendChild(el(state.doc, 'b', '', String(level)));
    return node;
}

function appendLine(state, line) {
    if (state.chat === 'fly') return;
    const { list } = state.els;
    list.appendChild(line);
    while (list.children.length > LIVE_LIST_LIMIT) list.children[0].remove();
}

function chatLine(state, msg, extraClass = '') {
    const { doc } = state;
    const line = el(doc, 'div', `igs-live-line${extraClass}`);
    line.setAttribute('data-type', msg.type);
    if (msg.ai) line.setAttribute('data-ai', '1');
    if (msg.mine) line.setAttribute('data-mine', '1');
    // 全屏形态在粉丝牌前加 B 站粉丝等级标。
    if (state.layout === 'full' && msg.type !== 'admin' && msg.type !== 'host') line.appendChild(el(doc, 'span', 'igs-live-lv', String((stableHash(`${msg.user}#lv`) % 40) + 1)));
    if (msg.type === 'admin') line.appendChild(el(doc, 'span', 'igs-live-tag', '房管'));
    else if (msg.type === 'host') line.appendChild(el(doc, 'span', 'igs-live-tag is-host', '主播'));
    else if (msg.medal) line.appendChild(medal(state, msg.user));
    line.appendChild(el(doc, 'span', 'igs-live-name', `${msg.user}：`));
    line.appendChild(el(doc, 'span', 'igs-live-text', msg.text));
    return line;
}

// 横飞模式：聊天弹幕沿轨道从右往左穿过画面；满轨时路人弹幕丢弃，AI 弹幕随机挤进一条轨道。
function spawnFlyer(state, msg, extraClass = '') {
    const geo = state.flyGeo;
    const { fly } = state.els;
    if (!geo || !msg.text || fly.children.length >= LIVE_FLY_CAP + (msg.ai ? 4 : 0)) return;
    const now = state.now();
    const duration = DANMAKU_SPEED_SECONDS.medium * 1000;
    const width = estimateTextWidth(msg.text, geo.fontSize);
    let lane = pickScrollTrack(state.tracks, geo.lanes, now, width, geo.w, duration);
    if (lane < 0) {
        if (!msg.ai) return;
        lane = Math.floor(state.rng() * geo.lanes);
    }
    occupyTrack(state.tracks, lane, now, width, geo.w, duration);
    const node = el(state.doc, 'div', `igs-live-flyer${extraClass}`, msg.text);
    if (msg.ai) node.setAttribute('data-ai', '1');
    node.style.top = `${geo.top + lane * geo.lineH}px`;
    node.style.setProperty('--igs-dm-run', `${-(geo.w + width)}px`);
    node.style.setProperty('--igs-dm-dur', `${duration}ms`);
    transient(state, fly, node, duration + 60);
}

function bump(state, amount) {
    state.popularity += amount;
    state.els.popText.textContent = formatPopularity(state.popularity);
}

export function renderLiveMessage(state, raw) {
    const { doc, els } = state;
    const msg = { ...raw, user: raw.user || randomLiveName(state.rng) };
    if (msg.type === 'enter') {
        const line = el(doc, 'div', 'igs-live-line is-note');
        line.setAttribute('data-type', 'enter');
        line.textContent = `${msg.user} 进入直播间`;
        appendLine(state, line);
        return;
    }
    if (msg.type === 'gift') {
        const gift = msg.text || '小心心';
        const count = giftCountOf(msg.extra);
        const banner = el(doc, 'div', 'igs-live-gift');
        banner.appendChild(icon(doc, 'gift'));
        const body = el(doc, 'div', 'igs-live-gift-body');
        body.appendChild(el(doc, 'div', 'igs-live-gift-user', msg.user));
        body.appendChild(el(doc, 'div', 'igs-live-gift-name', `投喂 ${gift}`));
        banner.appendChild(body);
        banner.appendChild(el(doc, 'b', 'igs-live-gift-count', `×${count}`));
        if (els.gifts.children.length >= 2) els.gifts.children[0].remove();
        transient(state, els.gifts, banner, LIFE.gift);
        const line = el(doc, 'div', 'igs-live-line is-gift');
        line.setAttribute('data-type', 'gift');
        line.textContent = `${msg.user} 投喂 ${gift} ×${count}`;
        appendLine(state, line);
        bump(state, count * 5);
        return;
    }
    if (msg.type === 'guard') {
        const level = guardLevelOf(msg.extra || msg.text);
        const banner = el(doc, 'div', 'igs-live-guard-banner');
        banner.style.setProperty('--igs-live-guard', GUARD_LEVELS[level]);
        banner.appendChild(icon(doc, 'ship'));
        banner.appendChild(el(doc, 'span', '', `欢迎 ${level} ${msg.user} 上船`));
        for (const old of Array.from(els.guard.children)) old.remove();
        transient(state, els.guard, banner, LIFE.guard);
        const line = el(doc, 'div', 'igs-live-line is-guard');
        line.setAttribute('data-type', 'guard');
        line.style.setProperty('--igs-live-guard', GUARD_LEVELS[level]);
        line.textContent = `${msg.user} 开通了${level}${msg.text ? `：${msg.text}` : ''}`;
        appendLine(state, line);
        bump(state, 2000);
        return;
    }
    if (msg.type === 'sc') {
        const { amount, color } = scColorOf(msg.extra);
        const card = el(doc, 'div', 'igs-live-sc-card');
        card.style.setProperty('--igs-live-sc', color);
        const head = el(doc, 'div', 'igs-live-sc-head');
        head.append(el(doc, 'span', '', msg.user), el(doc, 'b', '', `￥${amount}`));
        card.append(head, el(doc, 'div', 'igs-live-sc-text', msg.text));
        for (const old of Array.from(els.sc.children)) old.remove();
        transient(state, els.sc, card, LIFE.sc);
        if (state.chat !== 'roll') spawnFlyer(state, msg, ' is-sc');
        if (state.chat !== 'fly') {
            const line = chatLine(state, { ...msg, medal: true }, ' is-sc');
            line.style.setProperty('--igs-live-sc', color);
            appendLine(state, line);
        }
        bump(state, amount * 10);
        return;
    }
    if (state.chat !== 'roll') spawnFlyer(state, msg, msg.type === 'host' ? ' is-host' : '');
    if (state.chat !== 'fly') appendLine(state, chatLine(state, { ...msg, medal: msg.type !== 'admin' && (msg.ai || state.rng() < 0.5) }));
}

function ambientMessage(state) {
    const roll = state.rng();
    if (roll < 0.28) return null;
    if (roll < 0.4) return { type: 'enter' };
    if (roll < 0.47) return { type: 'gift', text: randomItem(LIVE_AMBIENT_GIFTS, state.rng), extra: String(1 + Math.floor(state.rng() * 9)) };
    const pool = state.view === 'host' && state.rng() < 0.35 ? LIVE_HOST_AMBIENT_LINES : LIVE_AMBIENT_LINES;
    return { type: 'text', text: randomItem(pool, state.rng) };
}

function spawnHeart(state) {
    const { hearts } = state.els;
    if (hearts.children.length >= HEART_LIMIT) return;
    const heart = icon(state.doc, 'heart', 'igs-live-heart');
    heart.style.setProperty('--igs-live-drift', `${Math.round((state.rng() - 0.5) * 36)}px`);
    heart.style.color = randomItem(HEART_COLORS, state.rng);
    transient(state, hearts, heart, LIFE.heart);
}

function tick(state) {
    state.timer = null;
    if (!state.els.root.isConnected) {
        stopState(state);
        return;
    }
    if (state.visible && state.doc.hidden !== true && !isStagePaused(state.els.root)) {
        const msg = state.queue.shift() || ambientMessage(state);
        if (msg) renderLiveMessage(state, msg);
        state.beat += 1;
        bump(state, Math.round((state.rng() - 0.35) * 40));
        state.els.viewersText.textContent = formatPopularity(Math.round(state.popularity / 9));
        if (state.els.watchingText) state.els.watchingText.textContent = formatPopularity(Math.round(state.popularity / 40));
        if (state.view === 'host') state.els.clockEl.textContent = clock(state.now() - state.startedAt);
        if (!state.reduced && state.view === 'watch' && state.beat % 3 === 0) spawnHeart(state);
    }
    arm(state);
}

function arm(state, delay) {
    if (state.timer) state.clear(state.timer);
    const wait = delay != null ? delay
        : state.queue.length ? 450 + state.rng() * 450
            : (1100 + state.rng() * 1300) * (state.reduced ? 1.6 : 1);
    state.timer = state.schedule(() => tick(state), wait);
}

function stopState(state) {
    if (state.timer) state.clear(state.timer);
    state.timer = null;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
}

function setImage(state, key, url) {
    if (state[key] === url) return;
    state[key] = url;
    const { root, cover, portrait, initial, cg, avatar } = state.els;
    if (key === 'cgUrl') {
        if (url) cg.src = url;
        cg.hidden = !url;
        root.setAttribute('data-cg', url ? '1' : '0');
    } else if (key === 'coverUrl') {
        cover.style.backgroundImage = url ? `url("${String(url).replace(/"/g, '%22')}")` : '';
    } else if (key === 'portraitUrl') {
        if (url) portrait.src = url;
        portrait.hidden = !url;
        initial.hidden = Boolean(url);
    } else if (key === 'avatarUrl') {
        avatar.style.backgroundImage = url ? `url("${String(url).replace(/"/g, '%22')}")` : '';
        avatar.setAttribute('data-img', url ? '1' : '0');
        // 没有立绘时，画面中间的首字占位改用同一张头像。
        initial.style.backgroundImage = avatar.style.backgroundImage;
        initial.setAttribute('data-img', url ? '1' : '0');
    }
}

// live 为 null 时收起手机；同一场直播（主播 + 标题 + 视角）跨页保持同一台手机与计时。
export function syncLivePhone(host, live, ctx) {
    let state = lives.get(host);
    const layout = ctx && ctx.layout === 'full' ? 'full' : 'phone';
    const key = live ? `${live.name}|${live.title}|${live.view}|${layout}` : '';
    if (state && state.key !== key) {
        retire(state, ctx && !ctx.reduced ? ctx.schedule : null);
        lives.delete(host);
        state = null;
    }
    if (!live) return null;
    if (!state) {
        const now = ctx.now || Date.now;
        const els = buildPhone(ctx.doc, live, now, layout);
        state = {
            key, view: live.view, layout, chat: '', tracks: [], flyGeo: null, inset: -1,
            doc: ctx.doc, els, queue: [], timers: new Set(), timer: null, beat: 0,
            schedule: ctx.schedule, clear: ctx.clear, rng: ctx.rng || Math.random, now,
            medal: fanMedalName(live.name),
            popularity: 800 + (stableHash(live.name) % 48000),
            startedAt: now() - (stableHash(`${live.name}${live.title}`) % 1800) * 1000,
            visible: true, reduced: false, coverUrl: '', cgUrl: '', portraitUrl: '', avatarUrl: '', fit: null, model: '', size: '',
        };
        els.popText.textContent = formatPopularity(state.popularity);
        host.appendChild(els.root);
        lives.set(host, state);
        arm(state, 400);
    }
    state.schedule = ctx.schedule;
    state.clear = ctx.clear;
    state.reduced = ctx.reduced === true;
    // 减少动态效果时横飞退回翻滚列表；both 时左下翻滚与横飞并存。
    const chat = state.reduced ? 'roll' : (ctx.chat === 'fly' || ctx.chat === 'both' ? ctx.chat : 'roll');
    if (state.chat !== chat) {
        state.chat = chat;
        state.els.root.setAttribute('data-chat', chat);
    }
    const look = ctx.look || { model: ctx.model, size: ctx.size };
    const model = LIVE_MODEL_RATIO[look.model] ? look.model : 'full';
    state.model = model;
    applyPhoneLook(state.els.root, { ...look, model });
    state.size = look.size === 'fit' ? 'fit' : 'large';
    state.els.root.setAttribute('data-interact', ctx.interact ? '1' : '0');
    // 状态栏跟剧情：时间、低电量、无服务（全屏形态没有状态栏）。
    if (state.els.status && ctx.status) setPhoneStatus(state.els.status, ctx.status);
    state.visible = ctx.visible !== false;
    if (state.els.root.hidden !== !state.visible) state.els.root.hidden = !state.visible;
    setImage(state, 'coverUrl', ctx.coverUrl || '');
    setImage(state, 'cgUrl', ctx.cg ? ctx.coverUrl || '' : '');
    if (ctx.portraitUrl) setImage(state, 'portraitUrl', ctx.portraitUrl);
    setImage(state, 'avatarUrl', ctx.avatarUrl || '');
    applyLiveTheme(state, ctx.theme || null);
    state.onPortraitMove = typeof ctx.onPortraitMove === 'function' ? ctx.onPortraitMove : null;
    // 编辑中重渲染：保留未保存的取景。
    if (!state.editing) setPortraitFrame(state, normalizeLivePortrait(ctx.portrait));
    return state;
}

// 手机里立绘的取景：偏移按屏幕宽高的百分比，缩放以立绘底边中点为原点。
function writePortraitVars(state, x, y, zoom) {
    const { style } = state.els.portrait;
    style.setProperty('--igs-lp-x', `${x}%`);
    style.setProperty('--igs-lp-y', `${y}%`);
    style.setProperty('--igs-lp-z', String(zoom / 100));
}

function setPortraitFrame(state, frame) {
    const prev = state.frame;
    if (prev && prev.x === frame.x && prev.y === frame.y && prev.zoom === frame.zoom) return;
    state.frame = { ...frame };
    writePortraitVars(state, frame.x, frame.y, frame.zoom);
}

// 和「调整立绘」一样：拖动平移、滚轮 / 双指缩放，手势中整张图跟手预览，松手折算成百分比。
function bindPortraitDrag(state) {
    const screen = state.els.portrait.parentNode;
    const points = new Map();
    let gesture = null;
    const size = () => ({ w: screen.clientWidth || 1, h: screen.clientHeight || 1 });
    const framed = (dx, dy, scale) => {
        const { w, h } = size();
        const f = state.frame;
        return { x: f.x + dx / w * 100, y: f.y + dy / h * 100, zoom: f.zoom * scale };
    };
    const commit = (dx, dy, scale) => {
        const next = normalizeLivePortrait(framed(dx, dy, scale));
        state.frame = null;
        setPortraitFrame(state, next);
    };
    const preview = (dx, dy, scale) => {
        const next = framed(dx, dy, scale);
        writePortraitVars(state, next.x, next.y, next.zoom);
    };
    const center = () => {
        const list = Array.from(points.values());
        return { x: list.reduce((n, p) => n + p.x, 0) / list.length, y: list.reduce((n, p) => n + p.y, 0) / list.length };
    };
    const spread = () => {
        const [a, b] = Array.from(points.values());
        return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    // 手指数变化时把已走的位移、缩放累计下来，从新的中心和指距重新起算。
    const restart = () => {
        const c = center();
        gesture = { dx: gesture ? gesture.curDx : 0, dy: gesture ? gesture.curDy : 0, scale: gesture ? gesture.curScale : 1, x0: c.x, y0: c.y, d0: spread() };
        gesture.curDx = gesture.dx;
        gesture.curDy = gesture.dy;
        gesture.curScale = gesture.scale;
    };
    for (const type of ['click', 'mousedown', 'touchstart', 'contextmenu']) screen.addEventListener(type, (event) => { if (state.editing) event.stopPropagation(); });
    screen.addEventListener('pointerdown', (event) => {
        if (!state.editing || event.button > 0) return;
        event.stopPropagation();
        event.preventDefault();
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (typeof screen.setPointerCapture === 'function') screen.setPointerCapture(event.pointerId);
        restart();
    });
    screen.addEventListener('pointermove', (event) => {
        if (!gesture || !points.has(event.pointerId)) return;
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const c = center();
        gesture.curDx = gesture.dx + c.x - gesture.x0;
        gesture.curDy = gesture.dy + c.y - gesture.y0;
        if (gesture.d0 > 0) gesture.curScale = gesture.scale * spread() / gesture.d0;
        preview(gesture.curDx, gesture.curDy, gesture.curScale);
    });
    const end = (event) => {
        if (!points.delete(event.pointerId) || !gesture) return;
        if (points.size) return restart();
        const { curDx, curDy, curScale } = gesture;
        gesture = null;
        commit(curDx, curDy, curScale);
    };
    screen.addEventListener('pointerup', end);
    screen.addEventListener('pointercancel', end);
    let wheelTimer = 0;
    let wheelScale = 1;
    screen.addEventListener('wheel', (event) => {
        if (!state.editing) return;
        event.stopPropagation();
        event.preventDefault();
        wheelScale *= event.deltaY < 0 ? 1.08 : 1 / 1.08;
        preview(0, 0, wheelScale);
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { const scale = wheelScale; wheelScale = 1; commit(0, 0, scale); }, 300);
    }, { passive: false });
}

// 「调整立绘」：手机形态、手机可见且屏幕里正显示立绘（没挂 CG）时进这里，出和立绘同款的编辑条，保存才写设置。没有可调的立绘返回 false。
export function enterLivePortraitEdit(overlay, ctx = {}) {
    const host = overlay && overlay.querySelector('.igs-dm-root');
    const state = host && lives.get(host);
    if (!state || state.layout !== 'phone' || state.els.root.hidden || !state.portraitUrl || state.cgUrl) return false;
    if (state.editing) return true;
    if (typeof ctx.closeSettings === 'function') ctx.closeSettings();
    if (!state.dragBound) {
        bindPortraitDrag(state);
        state.dragBound = true;
    }
    const orig = { ...state.frame };
    const bar = overlay.ownerDocument.createElement('div');
    bar.id = 'igs-sprite-edit-bar';
    bar.innerHTML = '<span class="igs-se-hint">拖动调整手机里的立绘，滚轮/双指缩放</span>'
        + '<button data-se="reset" type="button">还原</button>'
        + '<button data-se="cancel" type="button">取消</button>'
        + '<button data-se="save" class="igs-se-save" type="button">保存</button>';
    const clickLayer = overlay.querySelector('#igs-click-layer');
    if (clickLayer) clickLayer.style.pointerEvents = 'none';
    state.editing = true;
    state.els.root.setAttribute('data-editing', '1');
    overlay.appendChild(bar);
    const done = (keep) => {
        state.editing = false;
        state.els.root.removeAttribute('data-editing');
        bar.remove();
        if (clickLayer) clickLayer.style.pointerEvents = '';
        if (!keep) {
            state.frame = null;
            setPortraitFrame(state, orig);
        } else if (state.onPortraitMove) state.onPortraitMove({ ...state.frame });
    };
    bar.addEventListener('click', (event) => {
        event.stopPropagation();
        const btn = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-se]') : null;
        const act = btn ? btn.dataset.se : '';
        if (act === 'reset') {
            state.frame = null;
            setPortraitFrame(state, normalizeLivePortrait(null));
        } else if (act === 'cancel' || act === 'save') done(act === 'save');
    });
    return true;
}

const LIVE_THEME_KEYS = Object.freeze(['head', 'headInk', 'frame', 'sub', 'right', 'font']);

// 跟随对话框主题：只在主题变化时写一次 CSS 变量，样式里按 data-theme 取用。
function applyLiveTheme(state, theme) {
    const key = theme ? theme.key : '';
    if (state.themeKey === key) return;
    state.themeKey = key;
    const { root } = state.els;
    if (!theme) {
        root.removeAttribute('data-theme');
        for (const name of LIVE_THEME_KEYS) root.style.removeProperty(`--igs-live-t-${name}`);
        return;
    }
    root.setAttribute('data-theme', key);
    for (const name of LIVE_THEME_KEYS) if (theme[name]) root.style.setProperty(`--igs-live-t-${name}`, theme[name]);
}

function setFlyGeometry(state, w, top, bottom, fontSize) {
    const lineH = Math.round(fontSize * 1.4);
    state.flyGeo = { w: Math.round(w), top: Math.round(top), lineH, fontSize, lanes: Math.max(2, Math.floor((bottom - top) / lineH)) };
    state.els.fly.style.setProperty('--igs-live-fly-font', `${fontSize}px`);
}

// 手机形态的宽高：放大时占舞台九成高，压在对话框后面的部分记为 under；适应时整台手机停在对话框上沿。社区手机共用。
export function phoneGeometry(stage, model, size) {
    const floor = Math.min(stage.dialogTop, stage.stageH) - 10;
    const top = Math.round(stage.stageH * 0.03);
    const room = floor - top;
    const height = Math.round(Math.min(LIVE_PHONE_MAX_H, size === 'fit'
        ? Math.max(stage.stageH * 0.45, Math.min(stage.stageH * 0.9, room))
        : stage.stageH * 0.9));
    const maxW = stage.stageW * 0.92;
    const width = Math.round(Math.min(maxW, Math.max(height * (LIVE_MODEL_RATIO[model] || LIVE_MODEL_RATIO.full), Math.min(maxW, LIVE_PHONE_MIN_W))));
    const under = Math.round(Math.max(0, Math.min(height * 0.5, top + height - floor)));
    return { top, height, width, under };
}

// 手机高度、全屏弹幕区下沿都跟随对话框顶边，保证弹幕不被对话框挡住；由调用方在每页唯一一次几何读取后传入。
export function fitLivePhone(host, stage) {
    const state = lives.get(host);
    if (!state || !stage) return null;
    const floor = Math.min(stage.dialogTop, stage.stageH) - 10;
    if (state.layout === 'full') {
        const inset = Math.round(Math.max(0, stage.stageH - floor));
        if (state.inset !== inset) {
            state.inset = inset;
            state.els.phone.style.setProperty('--igs-live-floor', `${inset}px`);
        }
        setFlyGeometry(state, stage.stageW, stage.stageH * 0.16, floor - 8, Math.round(Math.max(16, Math.min(26, stage.stageH * 0.034))));
        return { layout: 'full', floor: inset };
    }
    // 底栏、弹幕与点赞整体抬到对话框之上（under）。
    const { top, height, width, under } = phoneGeometry(stage, state.model, state.size);
    setFlyGeometry(state, width, 120, height - under - 70, 14);
    const fit = { layout: 'phone', top, height, width, under };
    const prev = state.fit;
    if (prev && Math.abs(prev.height - height) < 4 && Math.abs(prev.width - width) < 4 && Math.abs(prev.under - under) < 4) return prev;
    state.fit = fit;
    const { phone } = state.els;
    phone.style.setProperty('--igs-live-h', `${height}px`);
    phone.style.setProperty('--igs-live-w', `${width}px`);
    phone.style.setProperty('--igs-live-under', `${under}px`);
    return fit;
}

// 玩家点赞：一次冒一小串爱心并推人气，减少动态效果时只推人气。
export function likeLive(host, count = 4) {
    const state = lives.get(host);
    if (!state) return false;
    bump(state, count * 3);
    if (!state.reduced) for (let i = 0; i < count; i += 1) later(state, () => spawnHeart(state), i * 120);
    return true;
}

// 收起手机：停掉计时器，播完下滑动画再移除；没有调度器（关闭阅读器）时立即移除。
function retire(state, schedule) {
    stopState(state);
    const { root } = state.els;
    if (typeof schedule !== 'function' || root.hidden) {
        root.remove();
        return;
    }
    root.setAttribute('data-leaving', '1');
    schedule(() => root.remove(), LIFE.leave);
}

// 视角切换（挂在前层才点得到）：手机顶端灵动岛位置的「主播 / 观众」分段按钮；live 为 null 时移除。
const switchPicks = new WeakMap();
const LIVE_SWITCH_VIEWS = Object.freeze([['host', '主播'], ['watch', '观众']]);

export function syncLiveSwitch(front, live, opts = {}) {
    let sw = front ? front.querySelector('.igs-live-switch') : null;
    if (!live) {
        if (sw) sw.remove();
        return null;
    }
    if (!sw) {
        sw = el(opts.doc, 'div', 'igs-live-switch');
        for (const [view, label] of LIVE_SWITCH_VIEWS) {
            const btn = el(opts.doc, 'button', 'igs-live-switch-btn', label);
            btn.type = 'button';
            btn.setAttribute('data-view', view);
            sw.appendChild(btn);
        }
        // 点按钮不翻页：按下、点击都不冒泡到阅读器。
        for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
            sw.addEventListener(type, (event) => {
                event.stopPropagation();
                if (type !== 'click') return;
                const btn = event.target && event.target.closest ? event.target.closest('[data-view]') : null;
                const pick = switchPicks.get(sw);
                if (btn && pick) pick(btn.getAttribute('data-view'));
            });
        }
        front.appendChild(sw);
    }
    switchPicks.set(sw, opts.onPick);
    sw.setAttribute('data-layout', opts.layout === 'full' ? 'full' : 'phone');
    for (const btn of Array.from(sw.children)) btn.setAttribute('aria-pressed', btn.getAttribute('data-view') === live.view ? 'true' : 'false');
    return sw;
}

export function pushLiveMessages(host, messages) {
    const state = lives.get(host);
    if (!state || !messages.length) return;
    const wasIdle = !state.queue.length;
    state.queue.push(...messages.map((msg) => ({ ...msg, ai: true })));
    if (wasIdle) arm(state, 280);
}

export function stopLivePhone(host) {
    const state = host && lives.get(host);
    if (!state) return false;
    retire(state, null);
    lives.delete(host);
    return true;
}
