import { feedStableCount, FEED_REPLY_MAX } from '../../scene/feed-platforms.js';
import { PEEK_BUILDERS } from './peek-phone.js';
import { isDmLine } from './feed-extras.js';
import { shopExtraOf, starsOf, workOf } from '../../scene/feed-extra.js';

// 手机社区各平台的页面构建：帖子卡片（POST_BUILDERS）与顶栏下的平台专属区（SUB_BUILDERS）。
// 由 feed-phone.js 按 data-platform 调用；这里只建节点，不碰舞台根、滚动与翻页。文字一律 textContent，图标只用静态 SVG。
const AVATAR_COLORS = Object.freeze(['#f2a65a', '#6fb7a8', '#8aa4e0', '#e08aa4', '#a58ae0', '#7fb069', '#d9a441', '#6c9bbf']);
const RICH_RE = /(#[^#\n]{1,24}#|@[^\s@:：,，]{1,16})/;
const CONFESS_TAG_RE = /^[#＃]?(捞人|表白|吐槽|树洞|求助|寻物|告白)/;

// 本次同步里认得的角色（作者名 → 头像地址），构建节点时读取；同步是同步代码，用完即清。
let know = null;
export function setKnow(fn) {
    know = fn;
}

// 本次同步里的玩家名：正文或评论里 @玩家、写明「私信」的那一行打上 is-dm 标记，feed-phone 在手机皮肤下接点击；null 表示不标。
let dmUser = null;
export function setDmUser(name) {
    dmUser = name == null ? null : String(name);
}

function markDm(node, author, body) {
    if (dmUser !== null && isDmLine({ author, text: body }, dmUser)) {
        node.className += ' is-dm';
        node.setAttribute('data-dm', '1');
    }
    return node;
}

// 配图晚到：构建时没有地址的位置先登记，之后第一次拿到地址由 fillLatePic 补一次。
let lateOn = false;
let lateSlots = [];

function svg(body) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const FEED_ICONS = Object.freeze({
    like: svg('<path d="M12 20.2s-7.4-4.5-7.4-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.4 2.7c0 5.6-7.4 10.1-7.4 10.1z"/>'),
    comment: svg('<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.6a1.5 1.5 0 0 1-1.5 1.5h-7.2L8 20.3v-3.2H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>'),
    repost: svg('<path d="M5 10V8.5A1.5 1.5 0 0 1 6.5 7H18M15 4l3 3-3 3M19 14v1.5a1.5 1.5 0 0 1-1.5 1.5H6M9 20l-3-3 3-3"/>'),
    back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
    more: svg('<circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"/>'),
    anon: svg('<circle cx="12" cy="9" r="3.6" fill="currentColor" stroke="none"/><path d="M5.2 20c.7-3.7 3.4-5.6 6.8-5.6s6.1 1.9 6.8 5.6z" fill="currentColor" stroke="none"/>'),
    star: svg('<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8z" fill="currentColor" stroke="none"/>'),
    search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>'),
    flame: svg('<path d="M12 21.4c3.5 0 5.9-2.3 5.9-5.7 0-2.6-1.5-4.5-2.9-6.1-.4 1.5-1.2 2.5-2.3 2.9.5-2.9-.6-6-3.1-8.3-.2 3.1-1.8 4.9-3.1 6.5-1.2 1.4-2.3 3-2.3 5 0 3.4 2.4 5.7 5.8 5.7z" fill="currentColor" stroke="none"/>'),
    bag: svg('<path d="M6 8.5h12l-.9 10.2a1.5 1.5 0 0 1-1.5 1.3H8.4a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10.5V7.8a3 3 0 0 1 6 0v2.7"/>'),
    up: svg('<path d="M12 5 5.5 14h4v5h5v-5h4z" fill="currentColor" stroke="none"/>'),
    forward: svg('<path d="M15 4.5 20 9.5l-5 5"/><path d="M20 9.5H9.5A5.5 5.5 0 0 0 4 15v4.5"/>'),
    thumb: svg('<path d="M7 10.5v10"/><path d="M15 5.9 14 10.5h5.8a2 2 0 0 1 1.9 2.5l-2.2 7a2 2 0 0 1-1.9 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5h2.3a2 2 0 0 0 1.8-1.1L12 3a3 3 0 0 1 3 2.9z"/>'),
    chevron: svg('<path d="M6 9.5l6 6 6-6"/>'),
});

export function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export function icon(doc, name, className = 'igs-feed-icon') {
    const node = el(doc, 'span', className);
    node.innerHTML = FEED_ICONS[name] || '';
    return node;
}
// #话题# 与 @某人 拆成带 class 的片段，其余文字原样；全部 textContent。
function richText(doc, parent, text) {
    for (const part of String(text).split(RICH_RE)) {
        if (!part) continue;
        if (RICH_RE.test(part)) parent.appendChild(el(doc, 'span', part[0] === '@' ? 'igs-feed-hl is-at' : 'igs-feed-hl', part));
        else parent.appendChild(doc.createTextNode ? doc.createTextNode(part) : el(doc, 'span', '', part));
    }
}

export function clearChildren(node) {
    for (const child of Array.from(node.children)) child.remove();
}

// 星级、作品名与价格销量的拆法和公开接口共用一份（scene/feed-extra.js）。
export { starsOf, workOf };

// 知乎答主「名字，身份介绍」。
export function splitAuthor(author) {
    const text = String(author || '');
    const i = text.search(/[，,]/);
    return i < 0 ? [text.trim(), ''] : [text.slice(0, i).trim() || text.trim(), text.slice(i + 1).trim()];
}

export function nameOf(platformId, author) {
    return platformId === 'zhihu' ? splitAuthor(author)[0] : author;
}

function titleOf(text) {
    const first = String(text).split(/[。！？!?\n]/)[0].trim() || String(text).trim();
    return Array.from(first).slice(0, 22).join('');
}

export function seedOf(post, tag) {
    return `${post.author}${post.text}#${tag}`;
}

export function minutesAgo(post) {
    return feedStableCount(seedOf(post, 'min'), 2, 58);
}

function isAnon(platformId, author) {
    return platformId === 'confess' && /匿名|墙/.test(author);
}

function put(parent, ...nodes) {
    for (const node of nodes) if (node) parent.appendChild(node);
}

// 熟人：名字能对上卡内角色（拿得到头像）。朋友圈叫好友，其余平台叫已关注。
function friendTag(doc, platformId, author) {
    if (!know || isAnon(platformId, author) || !know(author)) return null;
    return el(doc, 'span', 'igs-feed-friend', platformId === 'moments' ? '好友' : '已关注');
}

export function avatarFor(doc, platformId, author) {
    const anon = isAnon(platformId, author);
    const avatar = el(doc, 'div', 'igs-feed-avatar');
    const face = !anon && know ? know(author) : '';
    if (anon) {
        avatar.setAttribute('data-anon', '1');
        avatar.appendChild(icon(doc, 'anon'));
    } else if (face) {
        avatar.setAttribute('data-friend', '1');
        const img = el(doc, 'img', 'igs-feed-avatar-img');
        img.src = face;
        img.alt = '';
        avatar.appendChild(img);
    } else {
        avatar.textContent = Array.from(author)[0] || '?';
        avatar.style.setProperty('--fp-av', AVATAR_COLORS[feedStableCount(`${author}#av`, 0, AVATAR_COLORS.length - 1)]);
    }
    return avatar;
}

function starRow(doc, n, className = 'igs-feed-stars') {
    const row = el(doc, 'span', className);
    for (let i = 0; i < 5; i += 1) row.appendChild(icon(doc, 'star', i < n ? 'igs-feed-star is-on' : 'igs-feed-star'));
    return row;
}
// 会涨的数字：先放一个空节点登记基数，updatePost 按楼层差写入文字。
function counterSpan(doc, counters, base, fmt = String, replies = false) {
    const node = el(doc, 'span', '', '');
    counters.push({ node, base, fmt, replies });
    return node;
}

function statCounter(doc, counters, iconName, base, fmt) {
    const node = el(doc, 'span', 'igs-feed-stat');
    node.append(icon(doc, iconName), counterSpan(doc, counters, base, fmt));
    return node;
}

function likeBase(post) {
    return feedStableCount(seedOf(post, 'like'), 3, 2400);
}

function commentStat(doc, counters, post, fmt) {
    const node = el(doc, 'span', 'igs-feed-stat');
    node.append(icon(doc, 'comment'), counterSpan(doc, counters, feedStableCount(seedOf(post, 'cmt'), 0, 40), fmt, true));
    return node;
}

function textBlock(doc, post, className = 'igs-feed-text') {
    const node = el(doc, 'div', className);
    richText(doc, node, post.text);
    return markDm(node, post.author, post.text);
}

// 配图：全平台最多一张。post.pics 可以是地址数组（AI 写多张只取第一张）。
export function feedPicOf(post) {
    const list = Array.isArray(post && post.pics) ? post.pics : [];
    return list.find((u) => typeof u === 'string' && u) || '';
}

// 正文提到照片 / 图 / 晒 / 拍 / 自拍 / 合影的帖子，以及小红书、相册的每条帖才配图（配图地址 = 本楼 CG，没有就用场景背景）。
const PIC_TEXT_RE = /照片|相片|图片|配图|截图|晒|拍[了下到的照]|自拍|合影|合照|美图/;
const PIC_ALWAYS = Object.freeze(['xhs', 'album']);
const PIC_NEVER = Object.freeze(['shop', 'search', 'memo', 'chats']);

export function feedWantsPic(platformId, post) {
    if (PIC_NEVER.includes(platformId)) return false;
    return PIC_ALWAYS.includes(platformId) || PIC_TEXT_RE.test(String(post && post.text));
}

function picBox(doc, url) {
    if (!url && !lateOn) return null;
    const box = el(doc, 'div', 'igs-feed-pics');
    const img = el(doc, 'img', 'igs-feed-pic');
    img.alt = '';
    if (url) img.src = url;
    else {
        box.hidden = true;
        lateSlots.push({ box, img });
    }
    box.appendChild(img);
    return box;
}

// 铺满占位块（新闻缩略图、小红书封面、相册格子）的配图。
function fillPic(doc, holder, url) {
    const img = el(doc, 'img', 'igs-feed-pic-fill');
    img.alt = '';
    if (!url) {
        if (lateOn) lateSlots.push({ holder, img });
        return;
    }
    img.src = url;
    holder.appendChild(img);
    holder.setAttribute('data-img', '1');
}
// 回复者名牌：写了回复对象时是「作者 回复 对象」，末尾冒号由样式补；聊天列表、购物的评论不显示回复对象。
const NO_REPLY_TO = Object.freeze(['shop', 'chats']);

function replyHead(doc, platformId, reply) {
    const to = String(reply.to || '').trim();
    if (!to || NO_REPLY_TO.includes(platformId)) return el(doc, 'span', 'igs-feed-rname', reply.author);
    const head = el(doc, 'span', 'igs-feed-rname is-to');
    head.append(el(doc, 'span', 'igs-feed-rfrom', reply.author), el(doc, 'span', 'igs-feed-rarrow', '回复'), el(doc, 'span', 'igs-feed-rtarget', to));
    return head;
}

// 回复：缩进的浅底块；虎扑带「亮了 N」且最亮的一条标「亮评」。
function fillReplies(doc, platformId, post, box) {
    clearChildren(box);
    const list = (post.replies || []).slice(0, FEED_REPLY_MAX);
    const lights = list.map((r) => feedStableCount(`${r.author}${r.text}`, 2, 480));
    const top = platformId === 'hupu' && list.length ? lights.indexOf(Math.max(...lights)) : -1;
    list.forEach((reply, index) => {
        const row = markDm(el(doc, 'div', 'igs-feed-reply'), reply.author, reply.text);
        if (index === top) {
            row.setAttribute('data-top', '1');
            row.appendChild(el(doc, 'span', 'igs-feed-badge', '亮评'));
        }
        put(row, friendTag(doc, platformId, reply.author));
        row.appendChild(replyHead(doc, platformId, reply));
        const body = el(doc, 'span', 'igs-feed-rtext');
        richText(doc, body, reply.text);
        row.appendChild(body);
        if (platformId === 'hupu') row.appendChild(el(doc, 'span', 'igs-feed-hot', `亮了 ${lights[index]}`));
        box.appendChild(row);
    });
}

// 各平台的帖子卡片。返回 { node, replies, counters, fill? ... }；pic = 本帖配图地址（可为空）。
export const POST_BUILDERS = {
    news(doc, id, post, pic) {
        const node = el(doc, 'article', 'igs-feed-post');
        const col = el(doc, 'div', 'igs-feed-body');
        col.appendChild(textBlock(doc, post));
        const parts = [post.author, post.extra].filter(Boolean);
        const by = el(doc, 'div', 'igs-feed-byline');
        const counters = [];
        const count = counterSpan(doc, counters, feedStableCount(seedOf(post, 'cmt'), 0, 40), (n) => ` · ${n}评`, true);
        by.append(el(doc, 'span', '', parts.join(' · ')), count);
        col.appendChild(by);
        const top = el(doc, 'div', 'igs-feed-news-row');
        const thumb = el(doc, 'div', 'igs-feed-thumb');
        fillPic(doc, thumb, pic);
        top.append(col, thumb);
        const replies = el(doc, 'div', 'igs-feed-replies');
        node.append(top, replies);
        return { node, replies, counters };
    },
    zhihu(doc, id, post, pic) {
        const node = el(doc, 'article', 'igs-feed-post');
        if (post.extra) node.appendChild(el(doc, 'div', 'igs-feed-question', post.extra));
        const [name, identity] = splitAuthor(post.author);
        const who = el(doc, 'div', 'igs-feed-who');
        const info = el(doc, 'div', 'igs-feed-info');
        info.appendChild(el(doc, 'span', 'igs-feed-name', name));
        if (identity) info.appendChild(el(doc, 'span', 'igs-feed-identity', identity));
        put(who, avatarFor(doc, id, name), info, friendTag(doc, id, name));
        const meta = el(doc, 'div', 'igs-feed-meta');
        const counters = [];
        const agree = el(doc, 'span', 'igs-feed-agree');
        agree.append(icon(doc, 'up'), counterSpan(doc, counters, likeBase(post), (n) => `赞同 ${n}`));
        meta.append(agree, commentStat(doc, counters, post, String));
        const replies = el(doc, 'div', 'igs-feed-replies');
        node.append(who, textBlock(doc, post));
        put(node, picBox(doc, pic));
        node.append(meta, replies);
        return { node, replies, counters };
    },
    review(doc, id, post, pic) {
        const node = el(doc, 'article', 'igs-feed-post');
        const who = el(doc, 'div', 'igs-feed-who');
        const info = el(doc, 'div', 'igs-feed-info');
        info.appendChild(el(doc, 'span', 'igs-feed-name', post.author));
        const stars = starsOf(post.extra);
        if (stars) info.appendChild(starRow(doc, stars));
        put(who, avatarFor(doc, id, post.author), info, friendTag(doc, id, post.author));
        const meta = el(doc, 'div', 'igs-feed-meta');
        const counters = [];
        meta.append(statCounter(doc, counters, 'like', likeBase(post)), commentStat(doc, counters, post, String));
        const replies = el(doc, 'div', 'igs-feed-replies');
        node.append(who, textBlock(doc, post));
        put(node, picBox(doc, pic));
        node.append(meta, replies);
        return { node, replies, counters };
    },
    xhs(doc, id, post, pic) {
        const node = el(doc, 'article', 'igs-feed-post');
        const cover = el(doc, 'div', 'igs-feed-cover-block');
        cover.appendChild(el(doc, 'span', 'igs-feed-cover-title', post.extra || titleOf(post.text)));
        fillPic(doc, cover, pic);
        const title = textBlock(doc, post, 'igs-feed-text');
        const foot = el(doc, 'div', 'igs-feed-foot');
        const small = avatarFor(doc, id, post.author);
        small.classList.add('is-small');
        const counters = [];
        put(foot, small, el(doc, 'span', 'igs-feed-name', post.author), friendTag(doc, id, post.author), statCounter(doc, counters, 'like', likeBase(post)));
        const replies = el(doc, 'div', 'igs-feed-replies');
        node.append(cover, title, foot, replies);
        return { node, replies, counters };
    },
    // 贴吧：头像在左；右列依次是「名字 + 楼主 + 楼层号」、正文、「时间 + 回复」、楼中楼（灰蓝底，末行「共 N 条回复」）。
    tieba(doc, id, post, pic) {
        const node = el(doc, 'article', 'igs-feed-post');
        const body = el(doc, 'div', 'igs-feed-body');
        const head = el(doc, 'div', 'igs-feed-floorbar');
        const floor = el(doc, 'span', 'igs-feed-floor', '1楼');
        const owner = el(doc, 'span', 'igs-feed-owner', '楼主');
        put(head, el(doc, 'span', 'igs-feed-name', post.author), friendTag(doc, id, post.author), owner, floor);
        const foot = el(doc, 'div', 'igs-feed-tb-foot');
        const counters = [];
        const reply = el(doc, 'span', 'igs-feed-stat');
        reply.append(icon(doc, 'comment'), counterSpan(doc, counters, feedStableCount(seedOf(post, 'cmt'), 0, 40), (n) => (n === '0' ? '回复' : n), true));
        foot.append(el(doc, 'span', 'igs-feed-time', `${minutesAgo(post)}分钟前`), reply);
        const replies = el(doc, 'div', 'igs-feed-replies');
        body.append(head, textBlock(doc, post));
        put(body, picBox(doc, pic));
        body.append(foot, replies);
        node.append(avatarFor(doc, id, post.author), body);
        return { node, replies, counters, floor, owner, fill: fillTieba };
    },
    // 购物：商品图占位（购物袋）、两行标题、红色价格、销量与店铺。
    shop(doc, id, post) {
        const node = el(doc, 'article', 'igs-feed-post');
        const img = el(doc, 'div', 'igs-feed-shop-img');
        img.appendChild(icon(doc, 'bag', 'igs-feed-icon igs-feed-shop-bag'));
        const { price, sales } = shopExtraOf(post.extra);
        const row = el(doc, 'div', 'igs-feed-shop-row');
        if (price) row.appendChild(el(doc, 'span', 'igs-feed-price', price));
        if (sales) row.appendChild(el(doc, 'span', 'igs-feed-sales', sales));
        const replies = el(doc, 'div', 'igs-feed-replies');
        node.append(img, textBlock(doc, post, 'igs-feed-text igs-feed-shop-title'), row, el(doc, 'div', 'igs-feed-shop-name', post.author), replies);
        return { node, replies, counters: [] };
    },
    search: (doc, id, post) => PEEK_BUILDERS.search(doc, id, post, PEEK_KIT),
    memo: (doc, id, post) => PEEK_BUILDERS.memo(doc, id, post, PEEK_KIT),
    // 相册：灰色占位格；拿到配图（本楼 CG 或场景背景）就铺满格子，拿不到保留灰占位。
    album(doc, id, post, pic) {
        const built = PEEK_BUILDERS.album(doc, id, post, PEEK_KIT);
        const photo = built.node.children[0];
        if (photo) fillPic(doc, photo, pic);
        return built;
    },
    chats: (doc, id, post) => PEEK_BUILDERS.chats(doc, id, post, PEEK_KIT),
    douban(doc, id, post, pic) {
        const node = el(doc, 'article', 'igs-feed-post');
        const counters = [];
        const commentCount = counterSpan(doc, counters, feedStableCount(seedOf(post, 'cmt'), 0, 40), (n) => ` · ${n}回应`, true);
        const by = el(doc, 'div', 'igs-feed-byline');
        const small = avatarFor(doc, id, post.author);
        small.classList.add('is-small');
        put(by, small, el(doc, 'span', 'igs-feed-name', post.author), friendTag(doc, id, post.author), el(doc, 'span', 'igs-feed-time', `${minutesAgo(post)}分钟前`), commentCount);
        const body = textBlock(doc, post);
        const replies = el(doc, 'div', 'igs-feed-replies');
        node.append(el(doc, 'div', 'igs-feed-title', titleOf(post.text)), by, body);
        put(node, picBox(doc, pic));
        node.append(replies);
        return { node, replies, counters };
    },
};
// 微博：照手机 App 信息流——通栏白卡，帖头（头像 + 昵称 + 时间来源 + 下拉箭头）、通栏正文、配图、转评赞三格、热评两条。
const WB_DEVICES = Object.freeze(['iPhone 15 Pro', 'Xiaomi 14', 'HUAWEI Mate 60', 'OPPO Find X7']);
const WB_PLACES = Object.freeze(['北京', '上海', '广东', '浙江', '四川', '江苏']);
const WB_VERIFY_RE = /官方|老师|教授|导师|博主|主播|编辑|记者|医生|校长|学生会|学院|协会|大V|新闻|频道/;
const WB_FULL_AT = 120;
const WB_FULL_KEEP = 108;
const WB_HOT_MAX = 2;

function wbCount(label) {
    return (text) => (text === '0' ? label : text);
}

function wbSubLine(post) {
    const when = `${minutesAgo(post)}分钟前`;
    return feedStableCount(seedOf(post, 'wbs'), 0, 1) === 0
        ? `${when} 来自 ${WB_DEVICES[feedStableCount(seedOf(post, 'wbd'), 0, WB_DEVICES.length - 1)]}`
        : `${when} · 发布于 ${WB_PLACES[feedStableCount(seedOf(post, 'wbp'), 0, WB_PLACES.length - 1)]}`;
}

function wbText(doc, post) {
    const node = el(doc, 'div', 'igs-feed-text');
    const chars = Array.from(String(post.text));
    if (chars.length <= WB_FULL_AT) {
        richText(doc, node, post.text);
        return markDm(node, post.author, post.text);
    }
    richText(doc, node, `${chars.slice(0, WB_FULL_KEEP).join('')}...`);
    node.appendChild(el(doc, 'span', 'igs-feed-hl igs-feed-full', '全文'));
    return markDm(node, post.author, post.text);
}

function fillWbReplies(doc, id, post, box) {
    const rows = box.children[0];
    clearChildren(rows);
    for (const reply of (post.replies || []).slice(0, WB_HOT_MAX)) {
        const row = markDm(el(doc, 'div', 'igs-feed-reply'), reply.author, reply.text);
        row.appendChild(replyHead(doc, id, reply));
        const body = el(doc, 'span', 'igs-feed-rtext');
        richText(doc, body, reply.text);
        row.appendChild(body);
        rows.appendChild(row);
    }
}
POST_BUILDERS.weibo = (doc, id, post, pic) => {
    const node = el(doc, 'article', 'igs-feed-post');
    const counters = [];
    const face = el(doc, 'div', 'igs-feed-wb-face');
    face.appendChild(avatarFor(doc, id, post.author));
    if (WB_VERIFY_RE.test(post.author)) {
        const badge = el(doc, 'span', 'igs-feed-vbadge');
        badge.innerHTML = '<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#ffc000"/><path d="M4 5.3 7 10l3-4.7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        face.appendChild(badge);
    }
    const who = el(doc, 'div', 'igs-feed-wb-who');
    const nameRow = el(doc, 'div', 'igs-feed-wb-name');
    put(nameRow, el(doc, 'span', 'igs-feed-name', post.author), friendTag(doc, id, post.author));
    who.append(nameRow, el(doc, 'div', 'igs-feed-sub-line', wbSubLine(post)));
    const head = el(doc, 'div', 'igs-feed-wb-head');
    head.append(face, who, icon(doc, 'chevron', 'igs-feed-icon igs-feed-wb-more'));
    const meta = el(doc, 'div', 'igs-feed-meta');
    const cmt = el(doc, 'span', 'igs-feed-stat');
    cmt.append(icon(doc, 'comment'), counterSpan(doc, counters, feedStableCount(seedOf(post, 'cmt'), 0, 40), wbCount('评论'), true));
    meta.append(
        statCounter(doc, counters, 'forward', feedStableCount(seedOf(post, 'rp'), 0, 600), wbCount('转发')),
        cmt,
        statCounter(doc, counters, 'thumb', likeBase(post), wbCount('赞')),
    );
    const replies = el(doc, 'div', 'igs-feed-replies');
    const more = el(doc, 'div', 'igs-feed-wb-more-line');
    // 总数与评论格同基数同增长，数字一致。
    counters.push({ node: more, base: feedStableCount(seedOf(post, 'cmt'), 0, 40), fmt: (t) => `共${t}条评论 >`, replies: true });
    replies.append(el(doc, 'div', 'igs-feed-wb-rows'), more);
    put(node, head, wbText(doc, post), picBox(doc, pic));
    if (post.extra) {
        const extra = el(doc, 'div', 'igs-feed-extra');
        extra.appendChild(el(doc, 'span', 'igs-feed-extra-text', post.extra));
        node.appendChild(extra);
    }
    put(node, meta, replies);
    return { node, replies, counters, fill: fillWbReplies };
};

// 朋友圈：头像在左，右列是 蓝色昵称、正文（长文折叠加「全文」）、定位、「时间 + 菜单」、灰底评论框（顶上小三角，先点赞行再评论）。
const MM_FULL_AT = 110;

function fillMoments(doc, id, post, box) {
    clearChildren(box);
    const list = (post.replies || []).slice(0, FEED_REPLY_MAX);
    if (!list.length) return;
    const names = Array.from(new Set(list.map((r) => String(r.author || '').trim()).filter(Boolean)));
    if (names.length) {
        const likes = el(doc, 'div', 'igs-feed-mm-likes');
        likes.append(icon(doc, 'like'), el(doc, 'span', '', names.join('，')));
        box.appendChild(likes);
    }
    for (const reply of list) {
        const row = markDm(el(doc, 'div', 'igs-feed-reply'), reply.author, reply.text);
        put(row, friendTag(doc, id, reply.author));
        row.appendChild(replyHead(doc, id, reply));
        const text = el(doc, 'span', 'igs-feed-rtext');
        richText(doc, text, reply.text);
        row.appendChild(text);
        box.appendChild(row);
    }
}
function fillTieba(doc, id, post, box) {
    fillReplies(doc, id, post, box);
    const n = (post.replies || []).slice(0, FEED_REPLY_MAX).length;
    if (n) box.appendChild(el(doc, 'div', 'igs-feed-tb-more', `共${n}条回复 >`));
}

POST_BUILDERS.moments = (doc, id, post, pic) => {
    const node = el(doc, 'article', 'igs-feed-post');
    const body = el(doc, 'div', 'igs-feed-body');
    const who = el(doc, 'div', 'igs-feed-who');
    put(who, el(doc, 'span', 'igs-feed-name', post.author), friendTag(doc, id, post.author));
    body.append(who, textBlock(doc, post));
    if (Array.from(String(post.text)).length > MM_FULL_AT) body.appendChild(el(doc, 'span', 'igs-feed-mm-full', '全文'));
    put(body, picBox(doc, pic));
    if (post.extra) body.appendChild(el(doc, 'div', 'igs-feed-mm-place', post.extra));
    const foot = el(doc, 'div', 'igs-feed-mm-foot');
    const menu = el(doc, 'span', 'igs-feed-mm-menu');
    menu.appendChild(icon(doc, 'more'));
    foot.append(el(doc, 'span', 'igs-feed-time', `${minutesAgo(post)}分钟前`), menu);
    const replies = el(doc, 'div', 'igs-feed-replies');
    body.append(foot, replies);
    node.append(avatarFor(doc, id, post.author), body);
    return { node, replies, counters: [], fill: fillMoments };
};

const PEEK_KIT = { avatarFor, seedOf, minutesAgo };

// 通用卡片：头像 + 名字 + 正文 + 互动；微博 / 虎扑 / 表白墙 / 星网 / 纸面共用，差异在 data-platform 样式与少量附加节点。
function buildStandardPost(doc, id, post, pic) {
    const node = el(doc, 'article', 'igs-feed-post');
    const body = el(doc, 'div', 'igs-feed-body');
    const who = el(doc, 'div', 'igs-feed-who');
    put(who, el(doc, 'span', 'igs-feed-name', post.author), friendTag(doc, id, post.author));
    body.appendChild(who);
    if (id === 'starnet') {
        const d = feedStableCount(seedOf(post, 'd'), 1, 28);
        const m = feedStableCount(seedOf(post, 'm'), 1, 12);
        const hh = feedStableCount(seedOf(post, 'h'), 0, 23);
        const mm = feedStableCount(seedOf(post, 'mm'), 0, 59);
        const pad = (n) => String(n).padStart(2, '0');
        body.appendChild(el(doc, 'div', 'igs-feed-stamp', `${2300 + feedStableCount(seedOf(post, 'y'), 0, 180)}.${pad(m)}.${pad(d)} ${pad(hh)}:${pad(mm)}`));
    }
    const tag = id === 'confess' ? (post.text.match(CONFESS_TAG_RE) || [])[1] : '';
    if (tag) body.appendChild(el(doc, 'span', 'igs-feed-notetag', `#${tag}#`));
    body.appendChild(textBlock(doc, post));
    put(body, picBox(doc, pic));
    // 附加：朋友圈是定位 + 时间，其余平台是标签；虎扑的板块已在顶栏。
    if (post.extra && id !== 'hupu') {
        const extra = el(doc, 'div', 'igs-feed-extra');
        extra.appendChild(el(doc, 'span', 'igs-feed-extra-text', post.extra));
        if (id === 'moments') extra.appendChild(el(doc, 'span', 'igs-feed-time', `${minutesAgo(post)}分钟前`));
        body.appendChild(extra);
    }
    const meta = el(doc, 'div', 'igs-feed-meta');
    const counters = [];
    meta.append(commentStat(doc, counters, post, String), statCounter(doc, counters, 'like', likeBase(post)));
    body.appendChild(meta);
    const replies = el(doc, 'div', 'igs-feed-replies');
    body.appendChild(replies);
    // 纸面皮肤没有头像与互动数，由样式隐藏；节点结构共用一套。
    node.append(avatarFor(doc, id, post.author), body);
    return { node, replies, counters };
}

// pic = 本帖配图地址（由 feed-phone 按平台与正文决定，可为空）。
// wantLate：该帖需要配图但此刻没有地址，配图位置先登记，之后由 fillLatePic 补一次。
export function buildPost(doc, id, post, pic, review, wantLate = false) {
    lateOn = wantLate === true && !pic;
    lateSlots = [];
    let rec;
    try {
        rec = (POST_BUILDERS[id] || buildStandardPost)(doc, id, post, pic);
    } finally {
        lateOn = false;
    }
    rec.late = lateSlots.length ? lateSlots : null;
    lateSlots = [];
    rec.node.setAttribute('data-kind', id);
    if (post.fresh && !review) rec.node.setAttribute('data-fresh', '1');
    rec.n = -1;
    rec.floorKey = null;
    return rec;
}

// 配图地址晚到：第一次拿到地址时补进登记过的位置，只补一次，之后不再改 src。
export function fillLatePic(rec, url) {
    if (!rec.late || !url) return false;
    for (const slot of rec.late) {
        slot.img.src = url;
        if (slot.box) slot.box.hidden = false;
        else {
            slot.holder.appendChild(slot.img);
            slot.holder.setAttribute('data-img', '1');
        }
    }
    rec.late = null;
    return true;
}

export function fillPostReplies(doc, id, rec, post) {
    (rec.fill || fillReplies)(doc, id, post, rec.replies);
}

// 搜索框一条（知乎、购物、搜索记录共用）：图标 + 空白胶囊。
function searchBar(doc) {
    const node = el(doc, 'div', 'igs-feed-search');
    node.append(icon(doc, 'search'), el(doc, 'span', 'igs-feed-search-pill', ''));
    return { node, update() {} };
}

// 顶栏下面的平台专属区（热搜条、栏目条、封面、作品条……）：返回 { node, update(posts, ctx) }。
export const SUB_BUILDERS = {
    news(doc) {
        const node = el(doc, 'div', 'igs-feed-strip');
        let last = '';
        return {
            node,
            update(posts) {
                const cols = Array.from(new Set(posts.map((p) => p.extra).filter(Boolean))).slice(0, 3);
                const key = cols.join('|');
                if (key === last) return;
                last = key;
                clearChildren(node);
                cols.forEach((c, i) => node.appendChild(el(doc, 'span', i === 0 ? 'igs-feed-chip is-on' : 'igs-feed-chip', c)));
                node.hidden = cols.length === 0;
            },
        };
    },
    weibo(doc) {
        const node = el(doc, 'div', 'igs-feed-hotbar');
        const text = el(doc, 'span', '', '');
        node.append(icon(doc, 'flame'), el(doc, 'b', '', '热搜'), text);
        return {
            node,
            update(posts) {
                const topic = (posts.find((p) => p.extra) || {}).extra || '';
                if (text.textContent !== topic) text.textContent = topic;
                node.hidden = !topic;
            },
        };
    },
    zhihu: searchBar,
    shop: searchBar,
    search: searchBar,
    review(doc) {
        const node = el(doc, 'div', 'igs-feed-work');
        const title = el(doc, 'span', 'igs-feed-work-title', '');
        const stars = el(doc, 'span', 'igs-feed-work-stars');
        node.append(title, stars);
        let last = '';
        return {
            node,
            update(posts) {
                const src = posts.find((p) => /《/.test(p.extra || '')) || posts.find((p) => starsOf(p.extra)) || posts.find((p) => p.extra);
                const name = src ? workOf(src.extra) : '';
                const n = src ? starsOf(src.extra) : 0;
                const key = `${name}|${n}`;
                if (key === last) return;
                last = key;
                title.textContent = name;
                clearChildren(stars);
                if (n) stars.appendChild(starRow(doc, n, 'igs-feed-stars is-big'));
                node.hidden = !name && !n;
            },
        };
    },
    moments(doc) {
        const node = el(doc, 'div', 'igs-feed-cover');
        const who = el(doc, 'div', 'igs-feed-cover-who');
        const name = el(doc, 'span', 'igs-feed-name', '');
        node.appendChild(who);
        let last = '';
        let cover = null;
        return {
            node,
            update(posts, ctx) {
                const url = ctx.coverUrl || '';
                if (url !== cover) {
                    cover = url;
                    node.style.backgroundImage = url ? `url("${String(url).replace(/"/g, '%22')}")` : '';
                    node.setAttribute('data-img', url ? '1' : '0');
                }
                const author = posts[0] ? posts[0].author : '';
                if (author === last) return;
                last = author;
                clearChildren(who);
                name.textContent = author;
                who.append(name, avatarFor(doc, 'moments', author));
            },
        };
    },
};
