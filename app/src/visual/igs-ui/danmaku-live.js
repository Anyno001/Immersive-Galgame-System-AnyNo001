import { LIVE_ICONS, buildPhoneStatus } from './danmaku-icons.js';
import { isStagePaused } from './stage-pause.js';
import { DANMAKU_SPEED_SECONDS } from './danmaku-settings.js';
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
    screen.append(cover, portrait, initial);

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
    if (layout === 'phone') phone.append(screen, buildPhoneStatus(doc, now));
    else phone.append(screen);
    phone.append(top, ...extras, title, sc, gifts, guard, list, fly, hearts, bar);
    return { root, phone, cover, portrait, initial, avatar, popText, viewersText, watchingText, clockEl, sc, gifts, guard, list, fly, hearts };
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
    const { cover, portrait, initial, avatar } = state.els;
    if (key === 'coverUrl') {
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
            visible: true, reduced: false, coverUrl: '', portraitUrl: '', avatarUrl: '', height: 0,
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
    state.visible = ctx.visible !== false;
    if (state.els.root.hidden !== !state.visible) state.els.root.hidden = !state.visible;
    setImage(state, 'coverUrl', ctx.coverUrl || '');
    if (ctx.portraitUrl) setImage(state, 'portraitUrl', ctx.portraitUrl);
    setImage(state, 'avatarUrl', ctx.avatarUrl || '');
    applyLiveTheme(state, ctx.theme || null);
    return state;
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

// 手机高度、全屏弹幕区下沿都跟随对话框顶边，保证弹幕不被对话框挡住；由调用方在每页唯一一次几何读取后传入。
export function fitLivePhone(host, stage) {
    const state = lives.get(host);
    if (!state || !stage) return;
    const floor = Math.min(stage.dialogTop, stage.stageH) - 10;
    if (state.layout === 'full') {
        const inset = Math.round(Math.max(0, stage.stageH - floor));
        if (state.inset !== inset) {
            state.inset = inset;
            state.els.phone.style.setProperty('--igs-live-floor', `${inset}px`);
        }
        setFlyGeometry(state, stage.stageW, stage.stageH * 0.16, floor - 8, Math.round(Math.max(16, Math.min(26, stage.stageH * 0.034))));
        return;
    }
    const top = stage.stageH * 0.03;
    const height = Math.round(Math.max(stage.stageH * 0.45, Math.min(stage.stageH * 0.9, floor - top)));
    setFlyGeometry(state, Math.min(height * 9 / 18.5, stage.stageW * 0.92), 120, height - 70, 14);
    if (Math.abs(height - state.height) < 4) return;
    state.height = height;
    state.els.phone.style.setProperty('--igs-live-h', `${height}px`);
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
