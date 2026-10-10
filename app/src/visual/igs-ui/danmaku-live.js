import { applyPhoneLook } from './my-phone.js';
import { LIVE_ICONS, buildPhoneStatus, setPhoneStatus } from './danmaku-icons.js';
import { isStagePaused } from './stage-pause.js';
import { DANMAKU_SPEED_SECONDS, LIVE_DENSITY, LIVE_FONT_SCALE, normalizeLivePortrait } from './danmaku-settings.js';
import { estimateTextWidth, occupyTrack, pickScrollTrack } from './danmaku-lanes.js';
import { faceVars, liveFaceBox, moveFaceBox, resizeFaceBox } from './live-face.js';
import { LIVE_BAN_SUB, LIVE_BAN_TITLE, LIVE_WARN_CARD_MS, LIVE_WARN_FLY_PAUSE_MS, LIVE_WARN_MEME_DELAY_MS, LIVE_WARN_TITLE, warningCardText, warningCooldownOk } from './live-warning.js';
import { peekSpriteHead, probeSpriteHead } from './fx-anchor.js';
import {
    LIVE_AMBIENT_GIFTS,
    LIVE_AMBIENT_LINES,
    LIVE_GUARD_LINES,
    LIVE_HOST_AMBIENT_LINES,
    LIVE_SC_LINES,
    LIVE_TONE_WARN,
    LIVE_WARN_MEME_LINES,
    fanMedalName,
    randomItem,
    stableHash,
} from './danmaku-pools.js';
import { liveEconomy, liveUserName, medalLevelBias, planLiveChatter, resolveFanMedal } from './live-chatter.js';

// 「掏出手机」看 B 站竖屏直播：舞台压暗、手机从下方抬起停在画面正中，直播结束时收回。整台手机只有一个驱动计时器：每拍吐一条弹幕（AI 弹幕优先，其余由本地词池补），
// 顺带推人气、走时钟、飘点赞；隐藏、页面不可见、舞台暂停（面板打开等）时空转不写 DOM。文字一律 textContent，图标只用静态 SVG。
// 滚动评论保留条数：手机观众视角与全屏 5 条，主播视角 7 条（LIVE_LIST_LIMIT 是上限）。
export const LIVE_LIST_LIMIT = 7;
// 头部（头像 / 网名 / 热度 / 人数 / 图标）底边到手机顶的高度：评论区与横飞区的上限都从它往下算（样式里同名变量 --igs-live-head）。
export const LIVE_HEAD_H = 76;
export function liveListLimit(layout, view) {
    return layout !== 'full' && view === 'host' ? 7 : 5;
}
const HEART_LIMIT = 6;
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
    // 「调整立绘」里才出现的防挡脸区域（虚线椭圆 + 角上缩放手柄）。
    const faceEdit = el(doc, 'div', 'igs-live-faceguard');
    faceEdit.hidden = true;
    faceEdit.appendChild(el(doc, 'i', 'igs-live-faceguard-handle'));
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
    const close = icon(doc, 'close', 'igs-live-icon igs-live-close');
    const viewBtn = layout === 'phone' ? viewSwitchButton(doc, live.view, 'igs-live-icon igs-live-view') : null;
    if (viewBtn) tools.append(viewers, viewBtn, close);
    else tools.append(viewers, close);
    top.append(anchor, tools);
    // 全屏形态对齐 B 站竖屏直播间：前三名榜单、热门/人气榜胶囊、「N 人正在看」与右下角榜单名次卡。
    let watchingText = null;
    let extras = [];
    if (layout === 'full') {
        // 头部只留「N 人正在看」，前三名榜单与热门 / 人气榜胶囊太挤，去掉。
        const chips = el(doc, 'div', 'igs-live-chips');
        const watching = el(doc, 'span', 'igs-live-chip igs-live-watching');
        watchingText = el(doc, 'span', '', '0');
        watching.append(watchingText, el(doc, 'span', '', ' 人正在看'));
        chips.appendChild(watching);
        extras = [chips];
    }
    // 右侧人气榜名次卡（小广告）：全屏在输入行上方、手机在底栏上方右侧，两种形态都显示。
    const seed = stableHash(`${live.name}|${live.title}`);
    const card = el(doc, 'div', 'igs-live-rankcard');
    card.append(
        el(doc, 'b', 'igs-live-rankcard-title', '人气榜'),
        el(doc, 'span', 'igs-live-rankcard-sub', live.title || `${live.name}的直播间`),
        el(doc, 'span', 'igs-live-rankcard-place', `第 ${1 + (seed % 30)} 名`),
        el(doc, 'span', 'igs-live-rankcard-gap', `距上一名 ${50 + (seed % 900)}`),
    );
    extras.push(card);

    // 头部只留头像、网名、热度、关注、人数、视角图标、收起：不再画「直播中 / LIVE」徽标与标题行。
    // 开播时长（主播视角的计时）仍由 clockEl 记录，但不显示。
    const clockEl = el(doc, 'span', 'igs-live-clock', '');
    clockEl.hidden = true;

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
    // 关停画面：被封后先把主播画面打上马赛克加灰度，再整屏黑底。
    const ban = el(doc, 'div', 'igs-live-ban');
    ban.appendChild(icon(doc, 'ban', 'igs-live-icon igs-live-ban-icon'));
    ban.append(el(doc, 'div', 'igs-live-ban-title', LIVE_BAN_TITLE), el(doc, 'div', 'igs-live-ban-sub', LIVE_BAN_SUB));
    phone.append(top, ...extras, sc, gifts, guard, list, fly, hearts, bar, faceEdit, ban);
    return { ban, tools, faceEdit, root, phone, status, cover, portrait, initial, cg, avatar, popText, viewersText, watchingText, close, viewBtn, clockEl, sc, gifts, guard, list, fly, hearts };
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
    const hash = stableHash(user);
    let level = (hash % 20) + 1;
    if (state.tier) {
        const bias = medalLevelBias(state.tier);
        level = bias.min + Math.floor((bias.max - bias.min + 1) * (((hash % 1000) / 1000) ** bias.skew) * 0.999999);
    }
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
    const limit = state.listLimit || liveListLimit(state.layout, state.view);
    while (list.children.length > limit) list.children[0].remove();
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

const FLY_MIN_GAP_MS = 250;
const FLY_TEXT_MAX = 14;
// 横飞只飞前 14 个全角字（半角按半个字算），超出加省略号；评论列表保留全文。
export function flyClip(value) {
    const chars = Array.from(String(value || ''));
    let units = 0;
    for (let i = 0; i < chars.length; i += 1) {
        units += chars[i].charCodeAt(0) > 0xff ? 1 : 0.55;
        if (units > FLY_TEXT_MAX) return `${chars.slice(0, i).join('')}…`;
    }
    return chars.join('');
}

// 横飞模式：聊天弹幕沿轨道从右往左穿过画面；满轨时路人弹幕丢弃，AI 弹幕随机挤进一条轨道。
function spawnFlyer(state, msg, extraClass = '') {
    const geo = state.flyGeo;
    const { fly } = state.els;
    if (!geo || !msg.text || fly.children.length >= (LIVE_DENSITY[state.density] || LIVE_DENSITY.medium).cap + (msg.ai ? 4 : 0)) return;
    const now = state.now();
    if (now < state.flyPausedUntil) return;
    // 全局最小发射间隔：避免同一刻多条同时起飞挤成一团。
    if (now - (state.lastFlyAt || 0) < FLY_MIN_GAP_MS) {
        const tries = Number(msg.tries) || 0;
        if (tries < (msg.ai ? 8 : 3)) later(state, () => spawnFlyer(state, { ...msg, tries: tries + 1 }, extraClass), FLY_MIN_GAP_MS + Math.floor(state.rng() * 120));
        return;
    }
    const duration = (DANMAKU_SPEED_SECONDS[state.speed] || DANMAKU_SPEED_SECONDS.medium) * 1000;
    const flyText = flyClip(msg.text);
    const width = estimateTextWidth(flyText, geo.fontSize);
    let lane = pickScrollTrack(state.tracks, geo.lanes, now, width, geo.w, duration);
    // 没有空轨道：路人弹幕丢弃，AI 弹幕排队稍后再试（最多 8 次），不再硬挤进已占用的轨道叠在一起。
    if (lane < 0) {
        const tries = Number(msg.tries) || 0;
        if (msg.ai && tries < 8) later(state, () => spawnFlyer(state, { ...msg, tries: tries + 1 }, extraClass), 500);
        return;
    }
    occupyTrack(state.tracks, lane, now, width, geo.w, duration);
    state.lastFlyAt = now;
    const node = el(state.doc, 'div', `igs-live-flyer${extraClass}`, flyText);
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
    const msg = { ...raw, user: raw.user || liveUserName(state.rng, { tone: state.tone, tier: state.tier, emoji: state.emoji !== false, host: state.hostName }) };
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

// 这些来源的弹幕靠 delay 在批次内错开发出（刷屏潮、复读、房管与回应）；其余的放进缓冲区，每个 tick 取一条。
const TIMED_CHATTER = /^(wave|repeat|keeper|keeperRebut|admin|banReact|defend|answer)/;
const GUARD_NAME = Object.freeze({ captain: '舰长', admiral: '提督', governor: '总督' });

function rememberName(state, user) {
    if (!user) return;
    state.recentNames.push(user);
    if (state.recentNames.length > 20) state.recentNames.shift();
}

function emitChatter(state, entry) {
    rememberName(state, entry.user);
    renderLiveMessage(state, { type: entry.type === 'admin' ? 'admin' : 'text', user: entry.user, text: entry.text });
}

// 缓冲区空了就按本页场合规划一批；需要定时的补发走调度器，其余按 tick 一条一条取。
function planChatterBatch(state) {
    const ch = state.chatCtx;
    const fresh = state.chatFresh;
    state.chatFresh = false;
    const batch = planLiveChatter({
        title: ch.title, text: ch.text, pageInLive: state.pageInLive, ending: ch.ending, hour: ch.hour, mood: ch.mood,
        aiLines: fresh ? ch.aiLines : [], hostSaid: fresh ? ch.hostSaid : '', userName: ch.userName, hostName: ch.hostName, hostGender: ch.hostGender,
        tone: ch.tone, tier: ch.tier, emoji: ch.emoji, custom: ch.custom, recentNames: state.recentNames,
    }, state.rng);
    const gen = state.chatGen;
    for (const entry of batch) {
        if (TIMED_CHATTER.test(entry.src) || entry.type === 'admin') {
            later(state, () => {
                if (gen === state.chatGen && state.visible && !state.banned && state.doc.hidden !== true && !isStagePaused(state.els.root)) emitChatter(state, entry);
            }, Math.max(0, entry.delay));
        } else state.chatBuf.push(entry);
    }
}

function nextChatter(state) {
    if (!state.chatCtx) {
        const pool = state.view === 'host' && state.rng() < 0.35 ? LIVE_HOST_AMBIENT_LINES : LIVE_AMBIENT_LINES;
        return { type: 'text', text: randomItem(pool, state.rng) };
    }
    if (!state.chatBuf.length) planChatterBatch(state);
    const entry = state.chatBuf.shift();
    if (!entry) return null;
    rememberName(state, entry.user);
    return { type: 'text', user: entry.user, text: entry.text };
}

function ambientMessage(state) {
    const eco = state.tier ? liveEconomy(state.tier) : null;
    // 有规模信息时本地也会出醒目留言和上舰（AI 写的 SC 照常优先，在队列里）。
    if (eco) {
        if (state.rng() < eco.scRate) return { type: 'sc', text: randomItem(LIVE_SC_LINES, state.rng), extra: String(randomItem(eco.scAmounts, state.rng)) };
        const levels = Object.entries(eco.guardLevels);
        if (levels.length && state.rng() < eco.guardRate) {
            let pick = state.rng() * levels.reduce((sum, [, weight]) => sum + weight, 0);
            const [key] = levels.find(([, weight]) => (pick -= weight) <= 0) || levels[0];
            return { type: 'guard', text: randomItem(LIVE_GUARD_LINES, state.rng), extra: GUARD_NAME[key] || '舰长' };
        }
    }
    const roll = state.rng();
    if (roll < 0.15) return null;
    if (roll < 0.25) return { type: 'enter' };
    if (roll < 0.25 + (eco ? eco.giftRate : 0.07)) return { type: 'gift', text: randomItem(LIVE_AMBIENT_GIFTS, state.rng), extra: String(1 + Math.floor(state.rng() * 9)) };
    return nextChatter(state);
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
    if (!state.els.root.isConnected || state.banned) {
        stopState(state);
        return;
    }
    // 页面隐藏：不再排下一拍，改等 visibilitychange 回来续上（省掉后台空转唤醒）。
    if (state.doc.hidden === true) {
        if (!sleepUntilVisible(state)) arm(state);
        return;
    }
    if (state.visible && !isStagePaused(state.els.root)) {
        // AI 弹幕与本地氛围弹幕混播：队列里有 AI 弹幕时也随机插一条本地的，不先把 AI 一股脑排空。
        const msg = state.queue.length
            ? (state.rng() < 0.55 ? (ambientMessage(state) || state.queue.shift()) : state.queue.shift())
            : ambientMessage(state);
        if (msg) renderLiveMessage(state, msg);
        state.beat += 1;
        bump(state, Math.round((state.rng() - 0.35) * 40));
        // 规模变了：人气平滑过渡到新基数。
        if (state.popTarget != null) bump(state, Math.round((state.popTarget - state.popularity) * 0.08));
        state.els.viewersText.textContent = formatPopularity(Math.round(state.popularity / 9));
        if (state.els.watchingText) state.els.watchingText.textContent = formatPopularity(Math.round(state.popularity / 40));
        if (state.view === 'host') state.els.clockEl.textContent = clock(state.now() - state.startedAt);
        if (!state.reduced && state.view === 'watch' && state.beat % 3 === 0) spawnHeart(state);
    }
    arm(state);
}

function sleepUntilVisible(state) {
    const doc = state.doc;
    if (!doc || typeof doc.addEventListener !== 'function') return false;
    if (state.onVisible) return true;
    state.onVisible = () => {
        if (doc.hidden === true) return;
        wakeFromSleep(state);
        if (!state.timer && state.els.root.isConnected && !state.banned) arm(state, 400);
    };
    doc.addEventListener('visibilitychange', state.onVisible);
    return true;
}

function wakeFromSleep(state) {
    if (!state.onVisible) return;
    if (typeof state.doc.removeEventListener === 'function') state.doc.removeEventListener('visibilitychange', state.onVisible);
    state.onVisible = null;
}

function arm(state, delay) {
    if (state.timer) state.clear(state.timer);
    const density = state.tier ? liveEconomy(state.tier).densityMul : 1;
    const wait = delay != null ? delay
        : state.queue.length ? 250 + state.rng() * 150
            : (1100 + state.rng() * 1300) * (state.reduced ? 1.6 : 1) / density * (LIVE_DENSITY[state.density] || LIVE_DENSITY.medium).wait;
    state.timer = state.schedule(() => tick(state), wait);
}

function stopState(state) {
    wakeFromSleep(state);
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
        state.faceKey = '';
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
    let carried = null;
    if (state && state.key !== key) {
        // 只是切视角 / 版式（同一主播同一标题）：未播完的 AI 弹幕带给新状态，不丢。
        if (live && state.baseKey === `${live.name}|${live.title}`) carried = state.queue;
        retire(state, ctx && !ctx.reduced ? ctx.schedule : null);
        lives.delete(host);
        state = null;
    }
    if (!live) return null;
    if (!state) {
        const now = ctx.now || Date.now;
        const els = buildPhone(ctx.doc, live, now, layout);
        state = {
            key, baseKey: `${live.name}|${live.title}`, view: live.view, layout, chat: '', tracks: [], flyGeo: null, inset: -1, speed: 'medium', lastFlyAt: 0, listLimit: 0,
            doc: ctx.doc, els, queue: carried || [], timers: new Set(), timer: null, beat: 0,
            schedule: ctx.schedule, clear: ctx.clear, rng: ctx.rng || Math.random, now,
            medal: fanMedalName(live.name),
            popularity: 800 + (stableHash(live.name) % 48000),
            hostName: live.name, tone: 'modern', tier: null, emoji: true, popTarget: null,
            pageInLive: -1, chatPage: '', chatSig: '', chatBuf: [], chatGen: 0, chatFresh: false, chatCtx: null, recentNames: [],
            startedAt: now() - (stableHash(`${live.name}${live.title}`) % 1800) * 1000,
            visible: true, banned: false, warnAt: 0, flyPausedUntil: 0, faceGuard: true, faceBox: null, faceKey: '', faceDims: null, faceStage: null, faceProbing: new Set(), reduced: false, coverUrl: '', cgUrl: '', portraitUrl: '', avatarUrl: '', fit: null, model: '', size: '',
        };
        syncChatterContext(state, ctx.chatter, true);
        els.popText.textContent = formatPopularity(state.popularity);
        host.appendChild(els.root);
        lives.set(host, state);
        arm(state, 400);
        // 右上角关闭：本场直播先收起手机回舞台，换一场直播（主播 / 标题 / 视角变了）再弹出。
        const own = state;
        if (els.viewBtn) {
            els.viewBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (typeof own.onPickView === 'function') own.onPickView(otherLiveView(own.view));
            });
        }
        els.close.addEventListener('click', (event) => {
            event.stopPropagation();
            own.dismissed = true;
            own.visible = false;
            own.els.root.hidden = true;
            // 立刻重算：舞台立绘回来、互动壳与视角切换一并收掉。
            if (typeof own.onDismiss === 'function') own.onDismiss();
        });
    }
    state.schedule = ctx.schedule;
    state.clear = ctx.clear;
    syncChatterContext(state, ctx.chatter, false);
    state.faceGuard = ctx.faceGuard !== false;
    state.speed = ctx.speed || 'medium';
    state.density = ctx.density || 'medium';
    const fontScale = LIVE_FONT_SCALE[ctx.fontSize] || 1;
    if (state.fontScale !== fontScale) {
        state.fontScale = fontScale;
        state.els.root.style.setProperty('--igs-live-fs', String(fontScale));
    }
    state.onDismiss = typeof ctx.onDismiss === 'function' ? ctx.onDismiss : null;
    state.onPickView = typeof ctx.onPickView === 'function' ? ctx.onPickView : null;
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
    const sub = layout === 'full' && ctx.fullText === 'subtitle';
    if (state.sub !== sub) {
        state.sub = sub;
        if (sub) state.els.root.setAttribute('data-sub', '1');
        else state.els.root.removeAttribute('data-sub');
    }
    state.els.root.setAttribute('data-interact', ctx.interact ? '1' : '0');
    // 状态栏跟剧情：时间、低电量、无服务（全屏形态没有状态栏）。
    if (state.els.status && ctx.status) setPhoneStatus(state.els.status, ctx.status);
    state.visible = ctx.visible !== false && !state.dismissed;
    if (state.els.root.hidden !== !state.visible) state.els.root.hidden = !state.visible;
    setImage(state, 'coverUrl', ctx.coverUrl || '');
    setImage(state, 'cgUrl', ctx.cg ? ctx.coverUrl || '' : '');
    if (ctx.portraitUrl) setImage(state, 'portraitUrl', ctx.portraitUrl);
    setImage(state, 'avatarUrl', ctx.avatarUrl || '');
    applyLiveTheme(state, ctx.theme || null);
    state.onPortraitMove = typeof ctx.onPortraitMove === 'function' ? ctx.onPortraitMove : null;
    // 编辑中重渲染：保留未保存的取景。
    if (!state.editing) setPortraitFrame(state, normalizeLivePortrait(ctx.portrait));
    refreshFace(state);
    return state;
}

// 每次同步带来的路人弹幕上下文：页数在同一场直播里计数；正文变化时清空缓冲区，让新一页的场合马上生效。
// 规模（tier）决定人气基数、节奏、醒目留言和上舰；没有规模信息时一切保持旧行为。
function syncChatterContext(state, ch, creating) {
    if (!ch) return;
    state.chatCtx = ch;
    state.tone = ch.tone || 'modern';
    state.emoji = ch.emoji !== false;
    state.hostName = ch.hostName || state.hostName;
    if (state.chatPage !== ch.pageKey) {
        state.chatPage = ch.pageKey;
        state.pageInLive += 1;
        // 换页：还没播的旧页 AI 弹幕作废（带页标记的才丢）。
        if (state.queue.length) state.queue = state.queue.filter((msg) => !msg.pageKey || msg.pageKey === ch.pageKey);
    }
    if (state.chatSig !== ch.sig) {
        state.chatSig = ch.sig;
        state.chatBuf.length = 0;
        state.chatGen += 1;
        state.chatFresh = true;
    }
    state.medal = resolveFanMedal({ streamer: state.hostName, fromText: ch.fan, customMap: ch.customMap });
    if (ch.tier && ch.tier !== state.tier) {
        const eco = liveEconomy(ch.tier);
        state.tier = ch.tier;
        if (creating) {
            state.popularity = Math.round(eco.basePopularity * (0.85 + (stableHash(state.hostName) % 30) / 100));
            state.popTarget = null;
        } else state.popTarget = eco.basePopularity;
    }
}

// 手机里立绘的取景：偏移按屏幕宽高的百分比，缩放以立绘底边中点为原点。
function writePortraitVars(state, x, y, zoom) {
    const { style } = state.els.portrait;
    style.setProperty('--igs-lp-x', `${x}%`);
    style.setProperty('--igs-lp-y', `${y}%`);
    style.setProperty('--igs-lp-z', String(zoom / 100));
}

const faceSig = (face) => (face ? `${face.cx},${face.cy},${face.rx},${face.ry}` : '');

function setPortraitFrame(state, frame) {
    const prev = state.frame;
    if (prev && prev.x === frame.x && prev.y === frame.y && prev.zoom === frame.zoom && faceSig(prev.face) === faceSig(frame.face)) return;
    state.frame = { ...frame };
    writePortraitVars(state, frame.x, frame.y, frame.zoom);
    refreshFace(state);
}

// 防挡脸：算出脸的椭圆写进横飞层的 CSS 变量（取景、尺寸、立绘换图、视角、开关变化时才算，不逐帧）。
// 手机形态按手机里的立绘；CG / 封面算不出脸时用默认位置；全屏按舞台上的立绘（fitLiveFace 传入）。手调值优先。
function refreshFace(state) {
    const { fly } = state.els;
    const on = state.faceGuard !== false;
    if (on) fly.setAttribute('data-face-guard', '1');
    else fly.removeAttribute('data-face-guard');
    if (!on && !state.editing) return;
    const manual = state.frame && state.frame.face;
    let box;
    if (state.layout === 'full') {
        const stage = state.faceStage;
        box = liveFaceBox({ w: stage && stage.w, h: stage && stage.h, manual, source: 'stage', rect: stage && stage.rect, head: stage && stage.head });
    } else {
        const dims = state.faceDims;
        const url = state.portraitUrl && !state.cgUrl ? state.portraitUrl : '';
        const probed = url ? peekSpriteHead(url) : null;
        if (url && !probed && !state.faceProbing.has(url)) {
            state.faceProbing.add(url);
            probeSpriteHead(url, state.doc).then(() => { if (state.els.root.isConnected) refreshFace(state); });
        }
        box = liveFaceBox({
            w: dims && dims.w, h: dims && dims.h, manual, source: 'portrait', portrait: state.frame,
            natural: probed ? { w: probed.naturalW, h: probed.naturalH } : null, head: probed ? probed.head : null,
        });
    }
    state.faceBox = box;
    // 探测不到脸（用了默认位置）时不挂遮罩，免得在画面中间白白挖一个洞；手调编辑时保留。
    if (box.source === 'default' && !state.editing) fly.removeAttribute('data-face-guard');
    const key = `${box.cx},${box.cy},${box.rx},${box.ry}`;
    if (state.faceKey === key) return;
    state.faceKey = key;
    for (const [name, value] of Object.entries(faceVars(box))) fly.style.setProperty(name, value);
    if (state.editing) placeFaceEdit(state, box);
}

function placeFaceEdit(state, box) {
    const { style } = state.els.faceEdit;
    style.left = `${box.cx - box.rx}%`;
    style.top = `${box.cy - box.ry}%`;
    style.width = `${box.rx * 2}%`;
    style.height = `${box.ry * 2}%`;
}

// 全屏形态由调用方（读过舞台和立绘）传入脸的绘制信息：{ w, h, rect, head }。
export function fitLiveFace(host, info) {
    const state = host && lives.get(host);
    if (!state || state.layout !== 'full') return;
    state.faceStage = info || null;
    refreshFace(state);
}

// 防挡脸区域的手调：整体拖动、角上手柄缩放；预览只写变量，松手才存进取景。
function bindFaceEdit(state) {
    const { faceEdit, phone, fly } = state.els;
    const handle = faceEdit.firstChild;
    let drag = null;
    const preview = (box) => {
        state.faceBox = box;
        state.faceKey = `${box.cx},${box.cy},${box.rx},${box.ry}`;
        for (const [name, value] of Object.entries(faceVars(box))) fly.style.setProperty(name, value);
        placeFaceEdit(state, box);
    };
    faceEdit.addEventListener('pointerdown', (event) => {
        if (!state.editing || event.button > 0) return;
        event.stopPropagation();
        event.preventDefault();
        drag = {
            mode: event.target === handle ? 'resize' : 'move', rect: phone.getBoundingClientRect(),
            x: event.clientX, y: event.clientY, box: { ...state.faceBox }, pointerId: event.pointerId,
        };
        if (typeof faceEdit.setPointerCapture === 'function') faceEdit.setPointerCapture(event.pointerId);
    });
    faceEdit.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const w = drag.rect.width || 1;
        const h = drag.rect.height || 1;
        const next = drag.mode === 'move'
            ? moveFaceBox(drag.box, (event.clientX - drag.x) / w * 100, (event.clientY - drag.y) / h * 100)
            : resizeFaceBox(drag.box, (event.clientX - drag.rect.left) / w * 100, (event.clientY - drag.rect.top) / h * 100);
        if (next) preview(next);
    });
    const end = (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag = null;
        const frame = state.frame || normalizeLivePortrait(null);
        const { cx, cy, rx, ry } = state.faceBox;
        state.frame = { ...frame, face: { cx, cy, rx, ry } };
    };
    faceEdit.addEventListener('pointerup', end);
    faceEdit.addEventListener('pointercancel', end);
    for (const type of ['click', 'mousedown', 'touchstart', 'contextmenu']) faceEdit.addEventListener(type, (event) => { if (state.editing) event.stopPropagation(); });
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
        return { x: f.x + dx / w * 100, y: f.y + dy / h * 100, zoom: f.zoom * scale, face: f.face };
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
    if (!state.faceBound) {
        bindFaceEdit(state);
        state.faceBound = true;
    }
    const orig = { ...state.frame };
    const bar = overlay.ownerDocument.createElement('div');
    bar.id = 'igs-sprite-edit-bar';
    bar.innerHTML = '<span class="igs-se-hint">拖动调整手机里的立绘，滚轮/双指缩放；虚线椭圆是弹幕防挡脸区域，可拖动、拖角缩放</span>'
        + '<button data-se="reset" type="button">还原</button>'
        + '<button data-se="cancel" type="button">取消</button>'
        + '<button data-se="save" class="igs-se-save" type="button">保存</button>';
    const clickLayer = overlay.querySelector('#igs-click-layer');
    if (clickLayer) clickLayer.style.pointerEvents = 'none';
    state.editing = true;
    state.els.root.setAttribute('data-editing', '1');
    state.els.faceEdit.hidden = false;
    state.faceKey = '';
    refreshFace(state);
    if (state.faceBox) placeFaceEdit(state, state.faceBox);
    overlay.appendChild(bar);
    const done = (keep) => {
        state.editing = false;
        state.els.faceEdit.hidden = true;
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
    fontSize = Math.round(fontSize * (state.fontScale || 1));
    const lineH = Math.round(fontSize * 1.6);
    state.flyGeo = { w: Math.round(w), top: Math.round(top), lineH, fontSize, lanes: Math.max(1, Math.floor((bottom - top) / lineH)) };
    state.els.fly.style.setProperty('--igs-live-fly-font', `${fontSize}px`);
}

// 手机形态的宽高：先保证宽度（占舞台宽 88%），最多允许 38% 的机身沉进对话框；沉进去的部分记为 sink（也叫 under），
// 样式里用 --igs-phone-sink 把机身淡进对话框暗底、内容区留出同高底边。直播、社区、舆论风暴三种手机共用。
export function phoneGeometry(stage, model, size) {
    const ratio = LIVE_MODEL_RATIO[model] || LIVE_MODEL_RATIO.full;
    const top = stage.topInset > 0 ? Math.round(stage.topInset + 8) : Math.round(Math.max(stage.stageH * 0.03, 6));
    const dialogTop = Math.min(stage.dialogTop, stage.stageH);
    const visibleH = Math.max(0, dialogTop - top - 8);
    // 机型 / 大小设置给出的高度上限（适应与放大现在同一个上限，高度由对话框上方的可见区决定）。
    const cap = Math.min(LIVE_PHONE_MAX_H, stage.stageH - top - 4, stage.stageH * 0.9);
    const widthDriven = stage.stageW * 0.88 / ratio;
    const height = Math.round(Math.max(1, Math.min(cap, Math.max(visibleH, Math.min(widthDriven, visibleH / 0.62)))));
    const maxW = stage.stageW * 0.92;
    const width = Math.round(Math.min(maxW, Math.max(height * ratio, Math.min(maxW, LIVE_PHONE_MIN_W))));
    const under = Math.round(Math.max(0, Math.min(height * 0.5, top + height - dialogTop)));
    return { top, height, width, under };
}

// 沉进对话框的高度写成 --igs-phone-sink；有沉入时才打 data-igs-sunk，样式据此给机身加渐隐遮罩。
export function setPhoneSink(phone, sink) {
    const value = Math.max(0, Math.round(sink || 0));
    phone.style.setProperty('--igs-phone-sink', `${value}px`);
    if (value > 0) phone.setAttribute('data-igs-sunk', '1');
    else phone.removeAttribute('data-igs-sunk');
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
        // 全屏字幕：横飞只走舞台高 15% 到 60%，不进字幕区；名牌贴在工具栏下沿 + 8px。
        const sub = state.sub === true;
        // 评论列表占 22% 舞台高（互动开着再抬 56px）：横飞下沿扣到列表顶边之上；列表条数按实际高度 / 行高（约 32px）算。
        const listH = stage.stageH * 0.22;
        const listTop = floor - (state.els.root.getAttribute('data-interact') === '1' ? 56 : 0) - listH;
        const flyBase = sub ? stage.stageH * 0.6 : floor - 8;
        state.listLimit = Math.max(2, Math.min(5, Math.floor(listH / 32)));
        setFlyGeometry(state, stage.stageW, stage.stageH * (sub ? 0.15 : 0.16), state.chat === 'fly' ? flyBase : Math.min(flyBase, listTop - 6), Math.round(Math.max(16, Math.min(22, stage.stageW * 0.022))));
        const nameTop = Math.round((Number(stage.topInset) || 0) + 8);
        if (state.nameTop !== nameTop) {
            state.nameTop = nameTop;
            state.els.phone.style.setProperty('--igs-live-name-top', `${nameTop}px`);
        }
        return { layout: 'full', floor: inset };
    }
    // 底栏、弹幕与点赞整体抬到对话框之上（under）。
    const { top, height, width, under } = phoneGeometry(stage, state.model, state.size);
    // 横飞只走头部下方、滚动评论上方：评论占可见区底部那一截（横飞模式下评论不显示，可用到底栏上方）。
    const vis = height - under;
    const listH = state.chat === 'fly' ? 0 : Math.min(vis * (state.view === 'host' ? 0.4 : 0.3), vis - 58 - LIVE_HEAD_H - 6) + 6;
    state.faceDims = { w: width, h: height };
    refreshFace(state);
    // 手机里有立绘却量不到脸（探测中 / 失败，默认位置不挂遮罩）：横飞退到胸口以下的安全带，不横穿脸。
    const blind = state.faceGuard !== false && state.faceBox && state.faceBox.source === 'default' && state.portraitUrl && !state.cgUrl;
    const flyTop = blind ? Math.max(LIVE_HEAD_H + 8, Math.round(vis * 0.46)) : LIVE_HEAD_H + 8;
    setFlyGeometry(state, width, flyTop, Math.max(flyTop + 22, vis - 58 - listH), 16);
    const fit = { layout: 'phone', top, height, width, under };
    const prev = state.fit;
    if (prev && Math.abs(prev.top - top) < 4 && Math.abs(prev.height - height) < 4 && Math.abs(prev.width - width) < 4 && Math.abs(prev.under - under) < 4) return prev;
    state.fit = fit;
    const { phone } = state.els;
    phone.style.setProperty('--igs-live-h', `${height}px`);
    phone.style.setProperty('--igs-live-top', `${top}px`);
    phone.style.setProperty('--igs-live-w', `${width}px`);
    phone.style.setProperty('--igs-live-under', `${under}px`);
    // 手机里按百分比摆的元素（礼物、上舰、评论、爱心）以可见区（手机高减沉入）为准，沉进对话框后不挤在一起。
    phone.style.setProperty('--igs-live-vis', `${Math.max(0, height - under)}px`);
    setPhoneSink(phone, under);
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

// 视角切换按钮：双箭头小图标，没有文字；点一下换到另一个视角（主播 <-> 观众）。
export function otherLiveView(view) {
    return view === 'host' ? 'watch' : 'host';
}

function viewSwitchLabel(view) {
    return otherLiveView(view) === 'host' ? '切换到主播视角' : '切换到观众视角';
}

function viewSwitchButton(doc, view, className) {
    const btn = el(doc, 'button', className);
    btn.type = 'button';
    btn.innerHTML = LIVE_ICONS.swap || '';
    btn.setAttribute('data-view', otherLiveView(view));
    btn.setAttribute('aria-label', viewSwitchLabel(view));
    btn.title = viewSwitchLabel(view);
    return btn;
}

// 全屏形态没有手机壳：视角切换缩成右上角工具栏下方的一个小图标（手机形态的在顶栏里，见 buildPhone）。
export function syncLiveSwitch(front, live, opts = {}) {
    let sw = front ? front.querySelector('.igs-live-switch') : null;
    if (!live || opts.layout !== 'full') {
        if (sw) sw.remove();
        return null;
    }
    if (!sw) {
        sw = el(opts.doc, 'div', 'igs-live-switch');
        sw.setAttribute('data-layout', 'full');
        sw.appendChild(viewSwitchButton(opts.doc, live.view, 'igs-live-switch-btn'));
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
    if (opts.sub) sw.setAttribute('data-sub', '1');
    else sw.removeAttribute('data-sub');
    switchPicks.set(sw, opts.onPick);
    const btn = sw.children[0];
    if (btn) {
        btn.setAttribute('data-view', otherLiveView(live.view));
        btn.setAttribute('aria-label', viewSwitchLabel(live.view));
        btn.title = viewSwitchLabel(live.view);
    }
    return sw;
}

// 小图标贴在工具栏下沿 + 8px（舞台量出的 topInset）。
export function fitLiveSwitch(front, stage) {
    const sw = front ? front.querySelector('.igs-live-switch') : null;
    if (!sw || !stage) return;
    sw.style.setProperty('--igs-live-view-top', `${Math.round((Number(stage.topInset) || 0) + 8)}px`);
}

// 超管警告演出：warn 弹红卡并刷系统消息；ban 进入关停画面（同一场直播内一直停着，换一场直播才恢复）。
// 返回 'warn' | 'ban' | 'cooldown' | null。
export function triggerLiveWarning(host, warning) {
    const state = host && lives.get(host);
    if (!state || !warning || state.banned || state.dismissed) return null;
    if (warning.level === 'ban') {
        state.banned = true;
        const { root, popText, viewersText, watchingText } = state.els;
        root.setAttribute('data-banned', '1');
        state.els.phone.setAttribute('data-banned', '1');
        state.popularity = 0;
        popText.textContent = '0';
        viewersText.textContent = '0';
        if (watchingText) watchingText.textContent = '0';
        state.queue.length = 0;
        stopState(state);
        return 'ban';
    }
    const now = state.now();
    if (!warningCooldownOk(state.warnAt, now)) return 'cooldown';
    state.warnAt = now;
    const { phone } = state.els;
    const card = el(state.doc, 'div', 'igs-live-warn');
    const mark = icon(state.doc, 'shield', 'igs-live-icon igs-live-warn-icon');
    const body = el(state.doc, 'div', 'igs-live-warn-body');
    body.append(el(state.doc, 'div', 'igs-live-warn-title', LIVE_WARN_TITLE), el(state.doc, 'div', 'igs-live-warn-text', warningCardText(warning.reason)));
    card.append(mark, body);
    transient(state, phone, card, LIVE_WARN_CARD_MS);
    // 系统消息：滚动评论里一条醒目的红色超管消息；横飞暂停约 2 秒；减少动态效果时不抖。
    if (state.chat !== 'fly') {
        const line = chatLine(state, { type: 'admin', user: '超管', text: '直播内容涉嫌违规，请立即整改' }, ' is-warn');
        appendLine(state, line);
    }
    state.flyPausedUntil = now + LIVE_WARN_FLY_PAUSE_MS;
    if (!state.reduced) {
        phone.setAttribute('data-warn-shake', '1');
        later(state, () => phone.removeAttribute('data-warn-shake'), 520);
    }
    // 弹完约 1.5 秒后刷一波反应。
    const memePool = (state.tone !== 'modern' && LIVE_TONE_WARN[state.tone]) || LIVE_WARN_MEME_LINES;
    const memes = [];
    for (let guard = 0; memes.length < 5 && guard < 20; guard += 1) {
        const line = randomItem(memePool, state.rng);
        if (!memes.includes(line)) memes.push(line);
    }
    memes.forEach((line, index) => {
        later(state, () => { if (!state.banned && state.visible) renderLiveMessage(state, { type: 'text', text: line }); }, LIVE_WARN_MEME_DELAY_MS + index * 260);
    });
    return 'warn';
}

export function pushLiveMessages(host, messages) {
    const state = lives.get(host);
    if (!state || !messages.length || state.banned) return;
    const wasIdle = !state.queue.length;
    state.queue.push(...messages.map((msg) => ({ ...msg, ai: true, pageKey: state.chatPage })));
    if (wasIdle) arm(state, 280);
}

export function stopLivePhone(host) {
    const state = host && lives.get(host);
    if (!state) return false;
    retire(state, null);
    lives.delete(host);
    return true;
}
