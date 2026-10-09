import { PHONE_CASE_PRESETS } from './my-phone.js';
import { feedStableCount } from '../../scene/feed-platforms.js';

// 偷看角色的手机：角色手机外观、锁屏密码点阵、偷看角标，以及搜索记录 / 备忘录 / 相册 / 聊天列表四个偷看专属 App 的排版。
// 文字一律 textContent，图标只用静态 SVG；所有数字由 feedStableCount 按内容稳定生成，不编造文字。
export const PEEK_APPS = Object.freeze(['search', 'memo', 'album', 'chats']);
export const PEEK_DOTS = 4;
// 密码点阵：每颗点亮的间隔与最后一颗点亮后停留的时间，合计约 0.8s 点完、再留一拍解锁。
export const PEEK_DOT_STEP_MS = 200;
export const PEEK_LOCK_MS = PEEK_DOT_STEP_MS * PEEK_DOTS + 220;

const PEEK_MODELS = Object.freeze(['full', 'notch', 'fold']);
const TIME_RE = /\d|分钟|小时|刚刚|昨天|今天|前天|凌晨|深夜|早上|晚上|下午|上午|周|星期/;

function svg(body) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const ICONS = Object.freeze({
    clock: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3 2"/>'),
    close: svg('<path d="m7 7 10 10M17 7 7 17"/>'),
    image: svg('<rect x="4" y="5.5" width="16" height="13" rx="2"/><circle cx="9" cy="10.2" r="1.5"/><path d="m5 17 4.6-4.4 3.2 3 2.4-2.2L19.5 17"/>'),
    eye: svg('<path d="M2.8 12S6.4 5.8 12 5.8 21.2 12 21.2 12 17.6 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    pin: svg('<path d="M9 4.5h6l-.8 5 3 3.2H6.8l3-3.2zM12 12.7V20"/>'),
});

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function icon(doc, name, className = 'igs-feed-icon') {
    const node = el(doc, 'span', className);
    node.innerHTML = ICONS[name] || '';
    return node;
}

// 角色的手机：同一个名字每次都是同一款（机型 × 壳色），并避开玩家当前的机型与壳色；壁纸交给锁屏用头像。
export function peekLookOf(owner, userLook) {
    const mine = userLook || {};
    const total = PEEK_MODELS.length * PHONE_CASE_PRESETS.length;
    let pick = feedStableCount(`${owner}#peek-look`, 0, total - 1);
    const at = (n) => ({ model: PEEK_MODELS[n % PEEK_MODELS.length], caseColor: PHONE_CASE_PRESETS[Math.floor(n / PEEK_MODELS.length) % PHONE_CASE_PRESETS.length][0] });
    let look = at(pick);
    if (look.model === mine.model && look.caseColor === String(mine.caseColor || '').toLowerCase()) {
        pick = (pick + 1) % total;
        look = at(pick);
    }
    return { model: look.model, caseColor: look.caseColor, size: mine.size, wallpaper: 'none' };
}

// 偷看中的小角标与四周暗角（暗角是一张静态径向渐变，不动）。
export function buildPeekOverlay(doc) {
    const badge = el(doc, 'div', 'igs-feed-peek');
    badge.append(icon(doc, 'eye', 'igs-feed-peek-icon'), el(doc, 'span', '', '偷看中'));
    return [el(doc, 'div', 'igs-feed-vignette'), badge];
}

// 锁屏上的密码点阵：返回 { node, dots }，由调用方按 PEEK_DOT_STEP_MS 依次给 dots 写 data-on。
export function buildPeekPin(doc) {
    const node = el(doc, 'div', 'igs-feed-lock-pin');
    const dots = [];
    for (let i = 0; i < PEEK_DOTS; i += 1) {
        const dot = el(doc, 'i', 'igs-feed-lock-pin-dot');
        dots.push(dot);
        node.appendChild(dot);
    }
    return { node, dots };
}

// 锁屏壁纸：角色头像放大做底，再盖一层实色暗层（不用滤镜）。
export function applyPeekWall(doc, wall, avatar) {
    wall.classList.add('is-peek');
    if (avatar) wall.style.backgroundImage = `url("${String(avatar).replace(/"/g, '%22')}")`;
    return el(doc, 'div', 'igs-feed-lock-shade');
}

function plain(doc, id, post, parts) {
    const node = el(doc, 'article', 'igs-feed-post');
    node.append(...parts.filter(Boolean));
    return { node, replies: el(doc, 'div', 'igs-feed-replies'), counters: [], noReplies: true };
}

// 四个偷看 App 的帖子构建器；kit = { avatarFor, seedOf, minutesAgo }（由 feed-phone 提供，避免循环引用）。
export const PEEK_BUILDERS = {
    // 搜索记录：左时钟、中间搜索词、右删除叉（装饰）；作者栏像时间才显示。
    search(doc, id, post) {
        const copy = el(doc, 'div', 'igs-feed-term-copy');
        copy.appendChild(el(doc, 'span', 'igs-feed-term', post.text));
        const when = String(post.author || '').trim();
        if (when && TIME_RE.test(when)) copy.appendChild(el(doc, 'span', 'igs-feed-term-time', when));
        return plain(doc, id, post, [icon(doc, 'clock', 'igs-feed-icon igs-feed-term-clock'), copy, icon(doc, 'close', 'igs-feed-icon igs-feed-term-x')]);
    },
    // 备忘录 / 草稿箱：黄色便签；附加是标题，含「草稿」的标未发送。
    memo(doc, id, post) {
        const extra = String(post.extra || '');
        const draft = extra.includes('草稿');
        const title = extra.replace(/[（(【[]?草稿[）)】\]]?/g, '').trim();
        const head = title || draft ? el(doc, 'div', 'igs-feed-memo-head') : null;
        if (head) {
            if (title) head.appendChild(el(doc, 'span', 'igs-feed-memo-title', title));
            if (draft) head.appendChild(el(doc, 'span', 'igs-feed-draft', '未发送'));
        }
        const built = plain(doc, id, post, [head, el(doc, 'div', 'igs-feed-memo-text', post.text)]);
        if (draft) built.node.setAttribute('data-draft', '1');
        return built;
    },
    // 相册：灰色带图标的占位块（不生成图、点不开），描述与附加在格子下方。
    album(doc, id, post) {
        const photo = el(doc, 'div', 'igs-feed-photo');
        photo.appendChild(icon(doc, 'image', 'igs-feed-icon igs-feed-photo-icon'));
        return plain(doc, id, post, [photo, el(doc, 'div', 'igs-feed-photo-cap', post.text), post.extra ? el(doc, 'div', 'igs-feed-photo-meta', post.extra) : null]);
    },
    // 聊天列表：一个会话 = 头像（未读红点）+ 备注名 + 末条消息 + 右上时间；置顶灰底；reply 是点开后的消息气泡。
    chats(doc, id, post, kit) {
        const node = el(doc, 'article', 'igs-feed-post');
        const extra = String(post.extra || '');
        const pinned = extra.includes('置顶');
        if (pinned) node.setAttribute('data-pinned', '1');
        const time = extra.replace(/置顶/g, '').replace(/^[\s·,，、|]+|[\s·,，、|]+$/g, '');
        const row = el(doc, 'div', 'igs-feed-chat-row');
        const face = el(doc, 'div', 'igs-feed-chat-face');
        face.appendChild(kit.avatarFor(doc, id, post.author));
        const unread = feedStableCount(kit.seedOf(post, 'unread'), 0, 9);
        if (!pinned && unread >= 1 && unread <= 3) face.appendChild(el(doc, 'i', 'igs-feed-unread', String(unread)));
        const copy = el(doc, 'div', 'igs-feed-chat-copy');
        copy.append(el(doc, 'span', 'igs-feed-name', post.author), el(doc, 'span', 'igs-feed-chat-last', post.text));
        const side = el(doc, 'div', 'igs-feed-chat-side');
        side.appendChild(el(doc, 'span', 'igs-feed-chat-time', time || `${kit.minutesAgo(post)}分钟前`));
        if (pinned) side.appendChild(icon(doc, 'pin', 'igs-feed-icon igs-feed-chat-pin'));
        row.append(face, copy, side);
        const replies = el(doc, 'div', 'igs-feed-bubbles');
        node.append(row, replies);
        return { node, replies, counters: [], fill: fillBubbles };
    },
};

// 点开会话后的几条消息：作者是对方备注名的靠左，其余（自己发的）靠右。
function fillBubbles(doc, id, post, box) {
    for (const child of Array.from(box.children)) child.remove();
    for (const reply of (post.replies || [])) {
        const mine = String(reply.author || '').trim() !== String(post.author || '').trim();
        const bubble = el(doc, 'div', 'igs-feed-bubble', reply.text);
        bubble.setAttribute('data-side', mine ? 'self' : 'peer');
        box.appendChild(bubble);
    }
}
