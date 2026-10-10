import { applyPhoneLook } from './my-phone.js';
import { LIVE_ICONS, buildPhoneStatus } from './danmaku-icons.js';
import { setPhoneSink } from './danmaku-live.js';
import { isStagePaused } from './stage-pause.js';
import { feedPlatformById, feedStableCount, FEED_WORLDVIEW_PLATFORMS } from '../../scene/feed-platforms.js';

// 舆论风暴舞台：手机抬起震几下，顶部热搜条，通知横幅从顶部压下来，转发 / 评论 / 粉丝数字疯涨。
// 文字（热搜词、作者、内容）全部来自 AI 正文且一律 textContent；前端只补数字与界面元素（热搜、沸、爆、条新消息）。
// 同一场风暴（tone + topic 相同）跨页保留同一个根节点与计数，只追加新 mention；tone 或 topic 变了视为新风暴。
// 运动只用 transform / opacity；通知同屏最多 4 条，爱心最多 6 个。
const LEAVE_MS = 420;
const NOTE_MAX = 4;
const NOTE_CHARS = 40;
const NOTE_LEAVE_MS = 320;
const HEART_MAX = 6;
const HEART_LIFE = 2200;
const GROW_MS = 700;
const POOL_MAX = 24;
const PHONE_MODELS = Object.freeze(['full', 'notch', 'fold', 'tablet']);
const TONES = Object.freeze(['red', 'black']);

const storms = new WeakMap();

function svg(body) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const STORM_ICONS = Object.freeze({
    heart: svg('<path d="M12 20.2s-7.4-4.5-7.4-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.4 2.7c0 5.6-7.4 10.1-7.4 10.1z" fill="currentColor" stroke="none"/>'),
    like: svg('<path d="M8 11v8H5v-8zM8 11l3.5-6.5c1.6 0 2.5 1.2 2.1 2.8L13 10h5.2a1.6 1.6 0 0 1 1.6 2l-1.3 5.8a2 2 0 0 1-2 1.7H8" fill="currentColor" stroke="none"/>'),
    flame: svg('<path d="M12 21.4c3.5 0 5.9-2.3 5.9-5.7 0-2.6-1.5-4.5-2.9-6.1-.4 1.5-1.2 2.5-2.3 2.9.5-2.9-.6-6-3.1-8.3-.2 3.1-1.8 4.9-3.1 6.5-1.2 1.4-2.3 3-2.3 5 0 3.4 2.4 5.7 5.8 5.7z" fill="currentColor" stroke="none"/>'),
    bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.2a2 2 0 0 0 4 0" fill="currentColor" stroke="none"/>'),
});

// 热搜条上的裂纹装饰：细线，实色，只在爆黑里显示。
const CRACK_SVG = '<svg viewBox="0 0 120 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M0 4l18 6-6 5 22 3M60 0l-8 9 9 4-7 11M120 6l-24 5 10 5-18 4M84 0l-5 8"/></svg>';

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function icon(doc, name, className) {
    const node = el(doc, 'span', className);
    node.innerHTML = STORM_ICONS[name] || '';
    return node;
}

// 数字显示：<1 万原样，之后「3.2万」「1.5亿」；badge 用 999+ 封顶。
export function formatStormCount(value, cap = 0) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (cap && n > cap) return `${cap}+`;
    if (n < 10000) return String(n);
    const unit = n >= 100000000 ? [100000000, '亿'] : [10000, '万'];
    const v = Math.floor((n / unit[0]) * 10) / 10;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit[1]}`;
}

// 平台兜底：认不出时按世界观取第一个（现代优先微博）。
function resolvePlatform(id, worldview) {
    const hit = id ? feedPlatformById(id) : null;
    if (hit) return hit;
    const list = FEED_WORLDVIEW_PLATFORMS[worldview] || FEED_WORLDVIEW_PLATFORMS.modern;
    return feedPlatformById(list.includes('weibo') ? 'weibo' : list[0]) || feedPlatformById('weibo');
}

function mentionKey(m) {
    return `${m.author}\n${m.text}`;
}

function clip(text) {
    const chars = Array.from(String(text == null ? '' : text));
    return chars.length > NOTE_CHARS ? `${chars.slice(0, NOTE_CHARS).join('')}…` : chars.join('');
}

function buildStat(doc, label, key) {
    const cell = el(doc, 'div', 'igs-storm-stat');
    cell.setAttribute('data-stat', key);
    const value = el(doc, 'b', 'igs-storm-num', '0');
    cell.append(value, el(doc, 'span', 'igs-storm-label', label));
    return { cell, value };
}

function buildRoot(doc, state, platform, model) {
    const { tone, topic } = state;
    const root = el(doc, 'div', 'igs-live-stage igs-storm-stage');
    root.setAttribute('data-tone', tone);
    root.setAttribute('data-platform', platform.id);
    root.setAttribute('data-layout', 'phone');
    applyPhoneLook(root, { ...(state.look || {}), model });
    root.style.setProperty('--sn-accent', platform.accent);
    root.appendChild(el(doc, 'div', 'igs-live-dim'));
    const phone = el(doc, 'div', 'igs-live-phone');
    const screen = el(doc, 'div', 'igs-storm-screen');
    if (!state.reduced) screen.setAttribute('data-shake', '1');
    // 热搜条
    const hot = el(doc, 'div', 'igs-storm-hot');
    hot.append(icon(doc, 'flame', 'igs-storm-flame'), el(doc, 'span', 'igs-storm-hot-label', '热搜'), el(doc, 'span', 'igs-storm-topic', topic));
    hot.appendChild(el(doc, 'span', 'igs-storm-tag', tone === 'red' ? '爆' : '沸'));
    // 与直播右上角同款的收起按钮。
    const close = el(doc, 'button', 'igs-storm-close');
    close.type = 'button';
    close.setAttribute('aria-label', '收起');
    close.title = '收起';
    close.innerHTML = LIVE_ICONS.close;
    hot.appendChild(close);
    if (tone === 'black') {
        const crack = el(doc, 'span', 'igs-storm-crack');
        crack.innerHTML = CRACK_SVG;
        hot.appendChild(crack);
    }
    // 角标行 + 数字
    const badgeRow = el(doc, 'div', 'igs-storm-badge');
    const badgeNum = el(doc, 'b', 'igs-storm-badge-num', '0');
    badgeRow.append(icon(doc, 'bell', 'igs-storm-bell'), badgeNum, el(doc, 'span', 'igs-storm-badge-text', '条新消息'));
    const stats = el(doc, 'div', 'igs-storm-stats');
    const repost = buildStat(doc, '转发', 'repost');
    const comment = buildStat(doc, '评论', 'comment');
    const fans = buildStat(doc, '粉丝', 'fans');
    stats.append(repost.cell, comment.cell, fans.cell);
    const notes = el(doc, 'div', 'igs-storm-notes');
    screen.append(hot, badgeRow, stats, notes);
    const hearts = el(doc, 'div', 'igs-storm-hearts');
    screen.appendChild(hearts);
    phone.appendChild(screen);
    let vignette = null;
    if (tone === 'black') {
        vignette = el(doc, 'div', 'igs-storm-vignette');
        phone.appendChild(vignette);
    }
    phone.appendChild(buildPhoneStatus(doc, state.now, null));
    root.appendChild(phone);
    return { root, phone, screen, notes, hearts, vignette, close, badgeNum, nums: { badge: badgeNum, repost: repost.value, comment: comment.value, fans: fans.value } };
}

function paintNums(state) {
    const { nums } = state.els;
    const { counts } = state;
    nums.badge.textContent = formatStormCount(counts.badge, 999);
    nums.badge.setAttribute('data-n', String(counts.badge));
    for (const key of ['repost', 'comment', 'fans']) {
        nums[key].textContent = formatStormCount(counts[key]);
        nums[key].setAttribute('data-n', String(counts[key]));
    }
}

function later(state, fn, ms) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, ms);
    state.timers.add(timer);
    return timer;
}

function spawnHeart(state) {
    const { hearts } = state.els;
    if (state.reduced || hearts.children.length >= HEART_MAX) return;
    const heart = icon(state.doc, state.rng() < 0.7 ? 'heart' : 'like', 'igs-storm-heart');
    heart.style.setProperty('--sn-drift', `${Math.round((state.rng() - 0.5) * 70)}px`);
    heart.style.setProperty('--sn-x', `${Math.round(10 + state.rng() * 80)}%`);
    hearts.appendChild(heart);
    later(state, () => heart.remove(), HEART_LIFE);
}

// 数字按节拍增长：red 粉丝涨；black 粉丝掉、评论暴涨。
function grow(state) {
    const { counts, rng, tone } = state;
    const r = (min, max) => Math.round(min + rng() * (max - min));
    counts.badge += r(2, 10);
    if (tone === 'red') {
        counts.repost += r(40, 180);
        counts.comment += r(20, 90);
        counts.fans += r(80, 500);
    } else {
        counts.repost += r(30, 120);
        counts.comment += r(120, 600);
        counts.fans = Math.max(0, counts.fans - r(20, 200));
    }
    paintNums(state);
    state.beat += 1;
    if (tone === 'red' && state.beat % 3 === 0) spawnHeart(state);
}

function active(state) {
    return state.doc.hidden !== true && !isStagePaused(state.els.root);
}

function growTick(state) {
    state.growTimer = null;
    if (!state.els.root.isConnected) {
        stopState(state);
        return;
    }
    if (active(state)) grow(state);
    state.growTimer = state.schedule(() => growTick(state), GROW_MS);
}

function buildNote(state, mention) {
    const doc = state.doc;
    const note = el(doc, 'div', 'igs-storm-note');
    const head = el(doc, 'div', 'igs-storm-note-head');
    head.append(el(doc, 'i', 'igs-storm-dot'), el(doc, 'span', 'igs-storm-plat', state.platform.name), el(doc, 'span', 'igs-storm-at', '@你'), el(doc, 'span', 'igs-storm-author', String(mention.author == null ? '' : mention.author)));
    note.append(head, el(doc, 'div', 'igs-storm-note-text', clip(mention.text)));
    return note;
}

// 新的在上；同屏（不含正在淡出的）超过 4 条时最旧的淡出后移除。
function showNote(state, mention) {
    const { notes } = state.els;
    const note = buildNote(state, mention);
    notes.insertBefore(note, notes.children[0] || null);
    const live = Array.from(notes.children).filter((n) => n.getAttribute('data-leaving') !== '1');
    for (const old of live.slice(NOTE_MAX)) {
        old.setAttribute('data-leaving', '1');
        later(state, () => old.remove(), state.reduced ? 0 : NOTE_LEAVE_MS);
    }
}

function nextMention(state) {
    if (state.queue.length) return state.queue.shift();
    if (!state.pool.length) return null;
    state.cursor = (state.cursor + 1) % state.pool.length;
    return state.pool[state.cursor];
}

function step(state) {
    const m = nextMention(state);
    if (m) {
        showNote(state, m);
        state.counts.badge += 1;
    }
}

function tick(state) {
    state.timer = null;
    if (!state.els.root.isConnected) {
        stopState(state);
        return;
    }
    if (active(state)) step(state);
    arm(state);
}

// 间隔 1.8s~2.6s（减少动态效果时放慢）；没有可播的内容时仍空转，等下一页追加。
function arm(state, delay) {
    if (state.timer) state.clear(state.timer);
    const wait = delay != null ? delay : (1800 + state.rng() * 800) * (state.reduced ? 1.6 : 1);
    state.timer = state.schedule(() => tick(state), wait);
}

function stopState(state) {
    if (state.timer) state.clear(state.timer);
    state.timer = null;
    if (state.growTimer) state.clear(state.growTimer);
    state.growTimer = null;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
}

function retire(state, schedule) {
    stopState(state);
    const { root } = state.els;
    if (typeof schedule !== 'function') {
        root.remove();
        return;
    }
    root.setAttribute('data-leaving', '1');
    schedule(() => root.remove(), LEAVE_MS);
}

function addMentions(state, list) {
    let queued = 0;
    for (const m of list) {
        if (!m || typeof m !== 'object' || !m.text) continue;
        const key = mentionKey(m);
        if (state.known.has(key)) continue;
        state.known.add(key);
        const rec = { author: m.author, text: m.text };
        state.pool.push(rec);
        if (state.pool.length > POOL_MAX) state.pool.shift();
        if (m.fresh) {
            state.queue.push(rec);
            queued += 1;
        }
    }
    return queued;
}

// storm 为 null 时收起；tone 或 topic 变化视为新风暴。
export function syncStorm(host, storm, ctx) {
    let state = storms.get(host);
    const tone = storm && TONES.includes(storm.tone) ? storm.tone : 'red';
    const topic = storm ? String(storm.topic == null ? '' : storm.topic) : '';
    const key = storm ? `${tone}\n${topic}` : '';
    const reduced = Boolean(ctx && ctx.reduced);
    if (state && state.key !== key) {
        retire(state, ctx && !reduced ? ctx.schedule : null);
        storms.delete(host);
        state = null;
    }
    if (!storm) return null;
    const doc = ctx.doc;
    const look = ctx.look || { model: ctx.model, size: ctx.size };
    const model = PHONE_MODELS.includes(look.model) ? look.model : 'full';
    const platform = resolvePlatform(storm.platform, ctx.worldview);
    if (state) state.onDismiss = typeof ctx.onDismiss === 'function' ? ctx.onDismiss : null;
    if (!state) {
        const seed = `${platform.id}\n${topic}`;
        state = {
            key, tone, topic, platform, doc, model, reduced, look,
            schedule: ctx.schedule || ((fn, ms) => setTimeout(fn, ms)),
            clear: ctx.clear || ((t) => clearTimeout(t)),
            now: ctx.now || Date.now,
            rng: ctx.rng || Math.random,
            size: 'large', fit: null, beat: 0, cursor: -1,
            known: new Set(), pool: [], queue: [], timers: new Set(), timer: null, growTimer: null,
            counts: {
                badge: feedStableCount(`${seed}\nbadge`, 12, 90),
                repost: feedStableCount(`${seed}\nrepost`, 800, 9000),
                comment: feedStableCount(`${seed}\ncomment`, 600, 8000),
                fans: feedStableCount(`${seed}\nfans`, 20000, 900000),
            },
        };
        state.els = buildRoot(doc, state, platform, model);
        if (typeof ctx.coverUrl === 'string' && /^(https?:|data:image\/|blob:|\/)[^"')\s]*$/.test(ctx.coverUrl)) {
            state.els.screen.style.setProperty('--sn-cover', `url("${ctx.coverUrl}")`);
            state.els.root.setAttribute('data-cover', '1');
        }
        host.appendChild(state.els.root);
        storms.set(host, state);
        // 收起：本场风暴的手机先退回舞台，tone 或 topic 变了（新风暴）再弹出。
        const own = state;
        state.els.close.addEventListener('click', (event) => {
            event.stopPropagation();
            own.dismissed = true;
            own.els.root.hidden = true;
            if (typeof own.onDismiss === 'function') own.onDismiss();
        });
        paintNums(state);
        if (state.els.vignette) later(state, () => state.els.vignette.setAttribute('data-on', '1'), 30);
        addMentions(state, storm.mentions || []);
        if (active(state)) step(state);
        state.growTimer = state.schedule(() => growTick(state), GROW_MS);
        arm(state);
        state.onDismiss = typeof ctx.onDismiss === 'function' ? ctx.onDismiss : null;
        return state;
    }
    state.size = look.size === 'fit' ? 'fit' : 'large';
    state.reduced = reduced;
    state.model = model;
    applyPhoneLook(state.els.root, { ...look, model });
    if (state.platform.id !== platform.id) {
        state.platform = platform;
        state.els.root.setAttribute('data-platform', platform.id);
        state.els.root.style.setProperty('--sn-accent', platform.accent);
    }
    // 跨页：只追加新 mention，有新的先播
    if (addMentions(state, storm.mentions || []) && active(state)) arm(state, 300);
    return state.dismissed ? null : state;
}

// 几何由主控读取后传入（phoneGeometry 的结果），这里只写 CSS 变量。
export function fitStorm(host, stage, geometry) {
    const state = host && storms.get(host);
    if (!state || !geometry) return null;
    const prev = state.fit;
    if (prev && Math.abs(prev.height - geometry.height) < 4 && Math.abs(prev.width - geometry.width) < 4 && Math.abs(prev.under - geometry.under) < 4) return prev;
    state.fit = { ...geometry };
    const { phone } = state.els;
    phone.style.setProperty('--igs-live-h', `${geometry.height}px`);
    phone.style.setProperty('--igs-live-top', `${geometry.top}px`);
    phone.style.setProperty('--igs-live-w', `${geometry.width}px`);
    phone.style.setProperty('--igs-live-under', `${geometry.under || 0}px`);
    setPhoneSink(phone, geometry.under);
    return state.fit;
}

export function stopStorm(host) {
    const state = host && storms.get(host);
    if (!state) return false;
    retire(state, null);
    storms.delete(host);
    return true;
}
