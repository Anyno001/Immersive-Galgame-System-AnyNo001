import { applyPhoneLook } from './my-phone.js';
import { LIVE_ICONS, buildPhoneStatus, setPhoneStatus } from './danmaku-icons.js';
import { grownCount } from './phone-sense.js';
import { formatPopularity, phoneGeometry, setPhoneSink } from './danmaku-live.js';
import { feedPlatformById, isOwnPhone, FEED_VIEW_MAX } from '../../scene/feed-platforms.js';
import { applyPeekWall, buildPeekOverlay, buildPeekPin, PEEK_DOT_STEP_MS, PEEK_LOCK_MS, peekLookOf } from './peek-phone.js';
import { SUB_BUILDERS, avatarFor, buildPost, clearChildren, el, feedPicOf, feedWantsPic, fillLatePic, fillPostReplies, icon, nameOf, seedOf, setDmUser, setKnow } from './feed-phone-platforms.js';
import { feedDmThread } from './feed-extras.js';

// 手机社区舞台：phone 皮肤复用直播手机的外壳（掏出手机刷平台信息流），paper 皮肤画一张纸面 / 布告。
// 各平台的页面结构（顶栏、卡片、互动区）在 feed-phone-platforms.js，样式在 feed-style.js；这里管舞台根、锁屏、聊天页、翻页与滚动。
// 同一个平台区间跨页保留同一个根节点，只增删帖子；平台变了或 feed 为 null 时收起。
// 文字一律 textContent，图标只用静态 SVG；每页最多 12 条帖子 × 3 条回复，数字由 feedStableCount 按内容生成，
// 再随首见楼层之后经过的楼数增长（首见楼层记在调用方给的 Map 里，只存内存）。
// 手机另有：状态栏跟剧情、夜间深色、首次抬起的锁屏（约 900ms 后上滑解锁）、熟人头像与小标。
// 新帖进来时列表滚到第一条新帖；用户在列表上滚过一次，本页不再自动滚。
export { feedPicOf, splitAuthor, starsOf, workOf } from './feed-phone-platforms.js';

const LEAVE_MS = 420;
const LOCK_MS = 900;
const UNLOCK_MS = 460;
const LOCK_NOTE_CHARS = 20;
const COUNT_CAP = 99999;
// 纸面皮肤（告示、布告）一张纸装不下太多，只取最新几条；手机皮肤取区间内全部（至多 FEED_VIEW_MAX）。
const PAPER_VIEW_MAX = 3;
const SEEN_CAP = 240;
const LIST_STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'wheel', 'contextmenu']);
const USER_SCROLL_EVENTS = Object.freeze(['wheel', 'touchmove']);
const PHONE_MODELS = Object.freeze(['full', 'notch', 'fold', 'tablet']);
// 列表倒序排的平台（最新在上）不自动滚。
const NO_AUTO_SCROLL = Object.freeze(['search']);
// 顶栏标题取帖子附加里的平台。
const TITLE_FROM_EXTRA = Object.freeze(['douban', 'hupu', 'tieba']);

const feeds = new WeakMap();

function postKey(post) {
    return `${post.author}\n${post.text}\n${post.extra || ''}`;
}

function cssUrl(url) {
    return `url("${String(url).replace(/"/g, '%22')}")`;
}

// 配图地址：只有手机皮肤的平台画图；帖子自带 pics 优先，其次正文提到图 / 小红书 / 相册时取本楼 CG → 场景背景。
// 回看里读帖子上盖的 picRef（当时的背景引用），不拿现在这页的背景冒充。
function picFor(platform, post, ctx, review) {
    if (platform.skin !== 'phone') return '';
    const own = feedPicOf(post);
    if (own) return own;
    if (!feedWantsPic(platform.id, post)) return '';
    if (review) return typeof ctx.resolvePic === 'function' ? ctx.resolvePic(post.picRef) || '' : '';
    return ctx.picUrl || '';
}

// first = 首见楼层，floor = 当前楼层：数字 = 基数 + 随相隔楼数增长；评论数另加当前回复条数。
function updatePost(doc, id, rec, post, index, first, floor) {
    const n = (post.replies || []).length;
    const floorKey = `${first}>${floor}`;
    if (rec.n !== n || rec.floorKey !== floorKey) {
        if (rec.n !== n) {
            rec.n = n;
            if (!rec.noReplies) {
                fillPostReplies(doc, id, rec, post);
                rec.replies.hidden = n === 0;
            }
        }
        rec.floorKey = floorKey;
        const seed = seedOf(post, 'grow');
        for (const c of rec.counters) {
            const total = grownCount(`${seed}${c.base}`, c.base, first, floor, COUNT_CAP) + (c.replies ? n : 0);
            const text = c.fmt(formatPopularity(total));
            if (c.node.textContent !== text) c.node.textContent = text;
        }
    }
    // 贴吧楼层按当前位置编号，第一楼标楼主。
    if (rec.floor && rec.floorAt !== index) {
        rec.floorAt = index;
        rec.floor.textContent = `${index + 1}楼`;
        rec.owner.hidden = index !== 0;
    }
}
// 锁屏：壁纸 + 大号时间日期 + 一张通知卡（平台色点、平台名、第一条帖子作者与正文前几个字）；约 900ms 后整屏上滑解锁。
function buildLock(doc, platform, first, ctx, peek) {
    const lock = el(doc, 'div', 'igs-feed-lock');
    const wall = el(doc, 'div', 'igs-feed-lock-wall');
    const shade = peek ? applyPeekWall(doc, wall, peek.avatar) : null;
    if (!peek && ctx.wallpaperUrl) wall.style.backgroundImage = cssUrl(ctx.wallpaperUrl);
    const d = new Date((ctx.now || Date.now)());
    const clock = el(doc, 'div', 'igs-feed-lock-clock');
    if (peek) clock.appendChild(el(doc, 'div', 'igs-feed-lock-owner', `${peek.owner}的手机`));
    clock.append(
        el(doc, 'div', 'igs-feed-lock-time', ctx.status ? ctx.status.time : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`),
        el(doc, 'div', 'igs-feed-lock-date', `${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`),
    );
    const note = el(doc, 'div', 'igs-feed-lock-note');
    const head = el(doc, 'div', 'igs-feed-lock-app');
    head.append(el(doc, 'i', 'igs-feed-lock-dot'), el(doc, 'span', '', platform.name));
    note.appendChild(head);
    if (first) {
        const chars = Array.from(String(first.text || '').replace(/\s+/g, ' ').trim());
        const brief = chars.slice(0, LOCK_NOTE_CHARS).join('') + (chars.length > LOCK_NOTE_CHARS ? '…' : '');
        note.appendChild(el(doc, 'div', 'igs-feed-lock-body', `${nameOf(platform.id, first.author)}：${brief}`));
    }
    lock.append(wall);
    if (shade) lock.appendChild(shade);
    lock.appendChild(clock);
    const pin = peek ? buildPeekPin(doc) : null;
    if (pin) lock.appendChild(pin.node);
    lock.appendChild(note);
    return { lock, dots: pin ? pin.dots : [] };
}

function hasClass(node, name) {
    return !!node && typeof node.className === 'string' && node.className.split(/\s+/).includes(name);
}

function findIn(node, name) {
    if (hasClass(node, name)) return node;
    for (const child of Array.from(node.children || [])) {
        const hit = findIn(child, name);
        if (hit) return hit;
    }
    return null;
}
// 整页对话（顶栏 返回 + 备注名，气泡左对方右自己，底部一条静态输入栏）。
// 聊天列表点开时内容取自该行已生成的节点，不另存数据；其他平台的私信行点开走 show，只显示正文里写了的几句。
function buildChatPage(doc, list) {
    const page = el(doc, 'div', 'igs-feed-chatpage');
    page.hidden = true;
    const bar = el(doc, 'div', 'igs-feed-chatbar');
    const back = el(doc, 'button', 'igs-feed-chatback');
    back.type = 'button';
    back.setAttribute('aria-label', '返回');
    back.appendChild(icon(doc, 'back'));
    const title = el(doc, 'span', 'igs-feed-chattitle', '');
    bar.append(back, title, icon(doc, 'more'));
    const body = el(doc, 'div', 'igs-feed-chatbody');
    const input = el(doc, 'div', 'igs-feed-chatinput');
    input.appendChild(el(doc, 'span', 'igs-feed-chatfield', ''));
    page.append(bar, body, input);
    for (const name of LIST_STOP_EVENTS) page.addEventListener(name, (event) => event.stopPropagation());
    back.addEventListener('click', () => { page.hidden = true; });
    const show = (head, stamp, face, items) => {
        title.textContent = head;
        clearChildren(body);
        if (stamp) body.appendChild(el(doc, 'div', 'igs-feed-chatstamp', stamp));
        const add = (side, text) => {
            const row = el(doc, 'div', 'igs-feed-msg');
            row.setAttribute('data-side', side);
            let av;
            if (side === 'peer' && face && typeof face.cloneNode === 'function') av = face.cloneNode(true);
            else if (side === 'peer') av = avatarFor(doc, 'chats', title.textContent);
            else {
                av = el(doc, 'div', 'igs-feed-avatar', '我');
                av.style.setProperty('--fp-av', '#8aa4e0');
            }
            const bubble = el(doc, 'div', 'igs-feed-bubble', text);
            bubble.setAttribute('data-side', side);
            row.append(av, bubble);
            body.appendChild(row);
        };
        for (const item of items) add(item.side, item.text);
        page.hidden = false;
        body.scrollTop = 0;
    };
    const open = (node) => {
        const name = findIn(node, 'igs-feed-name');
        const last = findIn(node, 'igs-feed-chat-last');
        const time = findIn(node, 'igs-feed-chat-time');
        const box = findIn(node, 'igs-feed-bubbles');
        const items = [];
        if (last && last.textContent) items.push({ side: 'peer', text: last.textContent });
        for (const b of Array.from(box ? box.children : [])) items.push({ side: b.getAttribute('data-side') === 'self' ? 'self' : 'peer', text: b.textContent });
        show(name ? name.textContent : '', time && time.textContent ? time.textContent : '', findIn(node, 'igs-feed-avatar'), items);
    };
    if (list) {
        list.addEventListener('click', (event) => {
            let n = event.target;
            while (n && n !== list && !hasClass(n, 'igs-feed-chat-row')) n = n.parentNode;
            if (n && n !== list && n.parentNode) open(n.parentNode);
        });
    }
    return { page, show };
}
function buildRoot(doc, platform, ctx, model, first, peek) {
    const now = ctx.now || Date.now;
    const paper = platform.skin === 'paper';
    const root = el(doc, 'div', paper ? 'igs-feed-stage' : 'igs-live-stage igs-feed-stage');
    root.setAttribute('data-platform', platform.id);
    root.setAttribute('data-skin', platform.skin);
    root.style.setProperty('--fp-accent', platform.accent);
    root.appendChild(el(doc, 'div', 'igs-live-dim'));
    const list = el(doc, 'div', 'igs-feed-list');
    // 舞台里的手机挂在 pointer-events:none 的弹幕层下，列表要自己开回 auto 才滑得动；事件不再冒泡，手指在手机上滑不会触到阅读器。
    if (!paper) for (const name of LIST_STOP_EVENTS) list.addEventListener(name, (event) => event.stopPropagation());
    if (paper) {
        const card = el(doc, 'div', 'igs-feed-paper');
        const head = el(doc, 'div', 'igs-feed-paper-head');
        head.appendChild(el(doc, 'span', 'igs-feed-paper-title', platform.name));
        head.appendChild(el(doc, 'span', 'igs-feed-seal', Array.from(platform.name)[0] || ''));
        card.append(head, list);
        root.appendChild(card);
        return { root, list, phone: null, openDm: null, update() {} };
    }
    root.setAttribute('data-layout', 'phone');
    applyPhoneLook(root, { ...(peek ? peek.look : ctx.look || {}), model });
    if (peek) root.setAttribute('data-peek', '1');
    const phone = el(doc, 'div', 'igs-live-phone');
    const screen = el(doc, 'div', 'igs-feed-screen');
    const head = el(doc, 'div', 'igs-feed-head');
    const app = el(doc, 'span', 'igs-feed-app', platform.name);
    if (platform.id === 'weibo') {
        // 微博顶栏：推荐 / 关注两个页签 + 右侧放大镜；平台名留在隐藏节点里。
        const tabs = el(doc, 'div', 'igs-feed-wb-tabs');
        tabs.append(el(doc, 'span', 'igs-feed-wb-tab is-on', '推荐'), el(doc, 'span', 'igs-feed-wb-tab', '关注'));
        head.append(app, tabs, icon(doc, 'search'));
    } else {
        head.append(icon(doc, 'back'), app);
        if (platform.id === 'tieba') head.appendChild(el(doc, 'span', 'igs-feed-follow', '关注'));
        else head.appendChild(icon(doc, 'more'));
    }
    // 与直播右上角同款的收起按钮（回看里已有自己的关闭，不再放）。
    let close = null;
    if (ctx.review !== true) {
        close = el(doc, 'button', 'igs-feed-close');
        close.type = 'button';
        close.setAttribute('aria-label', '收起');
        close.title = '收起';
        close.innerHTML = LIVE_ICONS.close;
        head.appendChild(close);
    }
    screen.appendChild(head);
    const subBuild = SUB_BUILDERS[platform.id];
    const sub = subBuild ? subBuild(doc) : null;
    if (sub) screen.appendChild(sub.node);
    screen.appendChild(list);
    const chatPage = platform.id === 'chats' ? buildChatPage(doc, list) : null;
    if (chatPage) screen.appendChild(chatPage.page);
    // 其他平台的私信行点开：第一次用到才建对话页，内容只取正文里写了的几句。
    let dmPage = null;
    const openDm = (thread) => {
        if (!dmPage) {
            dmPage = buildChatPage(doc, null);
            screen.appendChild(dmPage.page);
        }
        dmPage.show(thread.peer, '', null, thread.items);
    };
    let chatKey = '';
    const statusBar = buildPhoneStatus(doc, now, ctx.status || null);
    phone.append(screen);
    // 每个平台区间第一次抬起先过一遍锁屏（减少动态效果、回看都跳过）；同区间跨页保留根节点，不再重放。
    if (ctx.review !== true && !ctx.reduced && typeof ctx.schedule === 'function') {
        const { lock, dots } = buildLock(doc, platform, first, ctx, peek);
        phone.appendChild(lock);
        root.setAttribute('data-locked', '1');
        // 偷看：先依次点亮四位密码再解锁。
        dots.forEach((dot, i) => ctx.schedule(() => dot.setAttribute('data-on', '1'), PEEK_DOT_STEP_MS * (i + 1)));
        ctx.schedule(() => {
            root.removeAttribute('data-locked');
            lock.setAttribute('data-unlock', '1');
            ctx.schedule(() => lock.remove(), UNLOCK_MS);
        }, peek ? PEEK_LOCK_MS : LOCK_MS);
    }
    if (peek) phone.append(...buildPeekOverlay(doc));
    phone.appendChild(statusBar);
    root.appendChild(phone);
    const fromExtra = TITLE_FROM_EXTRA.includes(platform.id);
    return {
        root, list, phone, close, openDm,
        update(posts, ctx) {
            if (ctx.status) {
                setPhoneStatus(statusBar, ctx.status);
                if (ctx.status.night) root.setAttribute('data-night', '1');
                else root.removeAttribute('data-night');
            }
            if (fromExtra) {
                const name = (posts.find((p) => p.extra) || {}).extra || platform.name;
                if (app.textContent !== name) app.textContent = name;
            }
            if (sub) sub.update(posts, ctx);
            // 翻页换了会话就收起已打开的对话，免得停在上一页的聊天里。
            if (chatPage || dmPage) {
                const key = posts.map(postKey).join('|');
                if (key !== chatKey) {
                    chatKey = key;
                    if (chatPage) chatPage.page.hidden = true;
                    if (dmPage) dmPage.page.hidden = true;
                }
            }
        },
    };
}

function retire(state, schedule) {
    const { root } = state.els;
    if (typeof schedule !== 'function' || root.hidden) {
        root.remove();
        return;
    }
    root.setAttribute('data-leaving', '1');
    schedule(() => root.remove(), LEAVE_MS);
}
// 滚到本页第一条新帖：新帖的节点位置减去首条帖的位置，列表倒序排的平台与纸面不滚；用户滚过一次本页就不抢。
// 由 fitFeedPhone 在写完几何之后调用，只在出现新的第一条新帖时做一次读取与写入。
function flushScroll(state) {
    const key = state.scrollTo;
    if (!key) return;
    state.scrollTo = '';
    if (state.userScrolled || state.dismissed || !state.els.phone) return;
    const { list } = state.els;
    const rec = state.posts.get(key);
    const head = list.firstElementChild;
    if (!rec || rec.node.parentNode !== list || !head) return;
    const to = Math.max(0, rec.node.offsetTop - head.offsetTop);
    if (Math.abs(list.scrollTop - to) > 1) list.scrollTop = to;
}

// feed 为 null（或平台认不出）时收起；同一平台跨页保留同一个根节点，只增删帖子。
export function syncFeedPhone(host, feed, ctx) {
    let state = feeds.get(host);
    const platform = feed ? feedPlatformById(feed.platform) : null;
    // 偷看别人的手机：主人是角色名（不是玩家自己）且平台是手机皮肤；换主人当作换了一台手机。
    const owner = platform && platform.skin === 'phone' && feed && !isOwnPhone(feed.owner, ctx && ctx.userName) ? String(feed.owner).trim() : '';
    const key = platform ? `${platform.id}|${owner}` : '';
    if (state && state.key !== key) {
        retire(state, ctx && !ctx.reduced ? ctx.schedule : null);
        feeds.delete(host);
        state = null;
    }
    if (!platform) return null;
    const doc = ctx.doc;
    const userLook = ctx.look || { model: ctx.model, size: ctx.size };
    const look = owner ? peekLookOf(owner, userLook) : userLook;
    const model = PHONE_MODELS.includes(look.model) ? look.model : 'full';
    if (!state) {
        const peek = owner ? { owner, look, avatar: typeof ctx.avatarOf === 'function' ? ctx.avatarOf(owner) || '' : '' } : null;
        const els = buildRoot(doc, platform, ctx, model, (feed.posts || []).filter(Boolean)[0], peek);
        state = { key, platform, owner, els, posts: new Map(), model, size: 'large', fit: null, max: -1, doc, pageKey: '', userScrolled: false, scrolledKey: '', scrollTo: '' };
        host.appendChild(els.root);
        feeds.set(host, state);
        // 手指 / 滚轮在列表上动过，本页不再自动滚（切页时在 syncFeedPhone 里复位）。
        const own = state;
        if (els.phone) for (const name of USER_SCROLL_EVENTS) els.list.addEventListener(name, () => { own.userScrolled = true; }, { passive: true });
        // 私信行（@玩家 / 写明私信）点开对话页；点击在列表上统一接，按帖子节点找回帖子数据。
        if (els.openDm) els.list.addEventListener('click', (event) => openDmFrom(own, event.target));
        // 收起：本平台区间的手机先退回回看入口，换平台（或换主人）再弹出；同一区间重绘不会重新弹出。
        if (els.close) {
            els.close.addEventListener('click', (event) => {
                event.stopPropagation();
                own.dismissed = true;
                own.els.root.hidden = true;
                if (typeof own.onDismiss === 'function') own.onDismiss();
            });
        }
    }
    state.onDismiss = typeof ctx.onDismiss === 'function' ? ctx.onDismiss : null;
    state.size = look.size === 'fit' ? 'fit' : 'large';
    state.model = model;
    if (state.els.phone) applyPhoneLook(state.els.root, { ...look, model });
    const review = ctx.review === true;
    state.userName = String(ctx.userName || '');
    const wanted = (feed.posts || []).filter(Boolean).slice(-(platform.skin === 'paper' ? PAPER_VIEW_MAX : FEED_VIEW_MAX));
    const seen = new Set();
    const floors = ctx.firstSeen instanceof Map ? ctx.firstSeen : (state.localSeen = state.localSeen || new Map());
    const cache = new Map();
    // 换了一页：这页的手动滚动记录作废，新页出现新帖时重新允许自动滚。
    if (!review && (ctx.pageKey || '') !== state.pageKey) {
        state.pageKey = ctx.pageKey || '';
        state.userScrolled = false;
    }
    state.knowFn = typeof ctx.avatarOf === 'function'
        ? (name) => {
            if (!cache.has(name)) cache.set(name, ctx.avatarOf(name) || '');
            return cache.get(name);
        }
        : null;
    setKnow(state.knowFn);
    if (platform.skin === 'phone') setDmUser(state.userName);
    try {
        wanted.forEach((post, index) => {
            const id = postKey(post);
            seen.add(id);
            let rec = state.posts.get(id);
            if (!rec) {
                const pic = picFor(platform, post, ctx, review);
                // 要配图但此刻没有地址（场景背景还没到）：登记位置，之后第一次拿到地址再补。
                rec = buildPost(doc, platform.id, post, pic, review, !review && platform.skin === 'phone' && !pic && feedWantsPic(platform.id, post));
                state.posts.set(id, rec);
            } else if (rec.late && !review) {
                fillLatePic(rec, picFor(platform, post, ctx, review));
            }
            rec.post = post;
            // 首见楼层：键 = 平台 + 作者 + 内容，只存内存；回看时只读不写。
            const seenKey = `${platform.id}\n${postKey(post)}`;
            let first = floors.get(seenKey);
            if (first === undefined) {
                first = ctx.messageId;
                if (!review) {
                    floors.set(seenKey, first);
                    if (floors.size > SEEN_CAP) floors.delete(floors.keys().next().value);
                }
            }
            updatePost(doc, platform.id, rec, post, index, first, ctx.messageId);
            // 顺序对就不动，避免重新插入时动画重播。
            const at = state.els.list.children[index] || null;
            if (at !== rec.node) state.els.list.insertBefore(rec.node, at);
        });
        for (const [id, rec] of Array.from(state.posts)) {
            if (seen.has(id)) continue;
            rec.node.remove();
            state.posts.delete(id);
        }
        state.els.list.setAttribute('data-n', String(wanted.length));
        state.els.update(wanted, ctx);
    } finally {
        setKnow(null);
        setDmUser(null);
    }
    // 出现了新的第一条新帖：记下来，等 fitFeedPhone 写完几何后滚过去（这里不读布局）。
    if (!review && !NO_AUTO_SCROLL.includes(platform.id)) {
        const fresh = wanted.find((p) => p.fresh === true);
        const freshKey = fresh ? postKey(fresh) : '';
        if (freshKey && freshKey !== state.scrolledKey) {
            state.scrolledKey = freshKey;
            state.scrollTo = freshKey;
        }
    }
    return state.dismissed ? null : state;
}
// 点在私信行上：找到所在帖子，把正文里写了的几句交给对话页。头像此刻才取，沿用本次同步的熟人查询。
function openDmFrom(state, target) {
    const list = state.els.list;
    let mark = target;
    while (mark && mark !== list && !(typeof mark.getAttribute === 'function' && mark.getAttribute('data-dm') === '1')) mark = mark.parentNode;
    if (!mark || mark === list) return;
    let postNode = mark;
    while (postNode && postNode.parentNode !== list) postNode = postNode.parentNode;
    if (!postNode) return;
    let post = null;
    for (const rec of state.posts.values()) if (rec.node === postNode) post = rec.post;
    const thread = post ? feedDmThread(post, state.userName) : null;
    if (!thread) return;
    setKnow(state.knowFn);
    try {
        state.els.openDm(thread);
    } finally {
        setKnow(null);
    }
}
// 由调用方在每页唯一一次几何读取后传入；手机宽高沿用直播手机，纸面只限制最大高度（停在对话框上方）。
function fitState(state, stage) {
    if (!state.els.phone) {
        const floor = Math.min(stage.dialogTop, stage.stageH) - 10;
        const max = Math.max(160, Math.round(floor - stage.stageH * 0.05));
        if (Math.abs(state.max - max) >= 4) {
            state.max = max;
            state.els.root.style.setProperty('--igs-feed-max', `${max}px`);
        }
        return { layout: 'paper', max };
    }
    const geo = phoneGeometry(stage, state.model, state.size);
    const fit = { layout: 'phone', ...geo };
    const prev = state.fit;
    if (prev && Math.abs(prev.height - geo.height) < 4 && Math.abs(prev.width - geo.width) < 4 && Math.abs(prev.under - geo.under) < 4 && Math.abs(prev.top - geo.top) < 4) return prev;
    state.fit = fit;
    const { phone } = state.els;
    phone.style.setProperty('--igs-live-h', `${geo.height}px`);
    phone.style.setProperty('--igs-live-top', `${geo.top}px`);
    phone.style.setProperty('--igs-live-w', `${geo.width}px`);
    setPhoneSink(phone, geo.under);
    return fit;
}

export function fitFeedPhone(host, stage) {
    const state = feeds.get(host);
    if (!state || !stage) return null;
    const fit = fitState(state, stage);
    flushScroll(state);
    return fit;
}

export function stopFeedPhone(host) {
    const state = host && feeds.get(host);
    if (!state) return false;
    retire(state, null);
    feeds.delete(host);
    return true;
}
