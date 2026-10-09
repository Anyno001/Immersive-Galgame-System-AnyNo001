import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDanmakuToDom, cancelDanmaku } from '../src/visual/igs-ui/danmaku-runtime.js';
import { phoneGeometry } from '../src/visual/igs-ui/danmaku-live.js';
import { FEED_STYLE_TEXT } from '../src/visual/igs-ui/feed-style.js';
import { splitAuthor, starsOf, workOf } from '../src/visual/igs-ui/feed-phone.js';
import { grownCount, lowBattery, storyClock } from '../src/visual/igs-ui/phone-sense.js';

class FakeNode {
    constructor(doc, tag) {
        this.ownerDocument = doc;
        this.tagName = tag;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        const styleProps = new Map();
        this.style = { setProperty: (k, v) => styleProps.set(k, v), removeProperty: (k) => styleProps.delete(k), get: (k) => styleProps.get(k) };
        this.hidden = false;
        this.id = '';
        this.className = '';
        this.listeners = {};
        this.innerHTML = '';
        this._text = '';
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientWidth = 0;
        this.clientHeight = 0;
        const node = this;
        this.classList = {
            add(name) { if (!node.classes().includes(name)) node.className = `${node.className} ${name}`.trim(); },
            contains(name) { return node.classes().includes(name); },
        };
    }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get isConnected() {
        let n = this;
        while (n.parentNode) n = n.parentNode;
        return n.isRoot === true;
    }
    classes() { return this.className.split(/\s+/).filter(Boolean); }
    appendChild(child) {
        if (child.parentNode) child.remove();
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    insertBefore(child, ref) {
        if (child.parentNode) child.remove();
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child);
        else this.children.splice(index, 0, child);
        child.parentNode = this;
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
        this.parentNode = null;
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    removeAttribute(name) { this.attrs.delete(name); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    hasAttribute(name) { return this.attrs.has(name); }
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
    matches(selector) {
        return selector.split(',').map((s) => s.trim()).some((s) => (s.includes(' ') ? false : s.startsWith('#') ? this.id === s.slice(1) : this.classList.contains(s.slice(1))));
    }
    querySelectorAll(selector) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (c.matches(selector)) out.push(c); walk(c); } };
        walk(this);
        return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function makeRoot() {
    const doc = { createElement: (tag) => new FakeNode(doc, tag) };
    const root = new FakeNode(doc, 'div');
    root.isRoot = true;
    const motion = root.appendChild(new FakeNode(doc, 'div'));
    motion.id = 'igs-stage-motion';
    motion.clientWidth = 1280;
    motion.clientHeight = 720;
    for (const id of ['igs-bg', 'igs-sprite', 'igs-click-layer', 'igs-dialog-layer']) {
        const el = motion.appendChild(new FakeNode(doc, 'div'));
        el.id = id;
    }
    return { root, motion, doc };
}

function clock() {
    const queue = [];
    let t = 1000;
    return {
        queue,
        schedule(fn, ms) { const timer = { fn, due: t + ms }; queue.push(timer); return timer; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
        now: () => t,
        run(ms) {
            const end = t + ms;
            for (;;) {
                const due = queue.filter((timer) => timer.due <= end).sort((a, b) => a.due - b.due)[0];
                if (!due) break;
                queue.splice(queue.indexOf(due), 1);
                t = Math.max(t, due.due);
                due.fn();
            }
            t = end;
        },
    };
}

function snapshot(content, readerSettings, messageId = 7) {
    return {
        messageId,
        content: { currentIndex: 0, displayText: '台词', textType: 'dialogue', speaker: '爱丽丝', ...content },
        readerSettings,
    };
}

const FEED_ON = { feedFx: { enabled: true } };
const post = (author, text, extra = '', replies = [], fresh = true) => ({ author, text, extra, replies, fresh });
const opts = (c) => ({ schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false });

import { parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { collectFeedPosts, feedPlatformById, isOwnPhone, mentionedFeedPlatforms } from '../src/scene/feed-platforms.js';
import { peekLookOf, PEEK_DOTS } from '../src/visual/igs-ui/peek-phone.js';
import { normalizeMyPhone } from '../src/visual/igs-ui/my-phone.js';
import { feedGrammarBlocks } from '../src/visual/igs-ui/feed-prompt.js';
import { createTurnIndexPanel } from '../src/visual/igs-ui/turn-index-panel.js';

const PEEK_OPTS = (c, extra = {}) => ({ ...opts(c), userName: '林北', resolveAssetUrl: (u) => u, ...extra });
const PEEK_RS = { ...FEED_ON, _sceneAssets: { statusAvatars: { 小雪: 'https://img/snow.png' } } };

function mountPeek(platform, owner, posts, extra = {}, rs = PEEK_RS) {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform, owner, posts };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, rs), PEEK_OPTS(c, extra));
    return { root, motion, c, stage: motion.querySelector('.igs-feed-stage') };
}

test('gate:peek:app-tag-parses-optional-owner-and-folds-it', () => {
    assert.deepEqual(parseFxBody('app|聊天列表|小雪'), { kind: 'app', end: false, args: ['chats', '小雪'] });
    assert.deepEqual(parseFxBody('app|微博'), { kind: 'app', end: false, args: ['weibo'] });
    assert.deepEqual(parseFxBody('app|相册|'), { kind: 'app', end: false, args: ['album'] });
    const text = '[igs-fx:app|搜索记录|小雪][igs-fx:post|昨天|怎么才能不被发现|][igs-fx:app-end][igs-fx:app|微博][igs-fx:post|甲|嗯|]';
    const posts = collectFeedPosts(text);
    assert.deepEqual(posts.map((p) => p.owner), ['小雪', '']);
    const directives = [...text.matchAll(/\[igs-fx:([^\]]*)\]/g)].map((m) => ({ ...parseFxBody(m[1]), offset: m.index }));
    assert.equal(resolveFxAtPage(directives, directives[1].offset, -1).feed.owner, '小雪');
});

test('gate:peek:own-phone-judgement', () => {
    for (const own of ['', '  ', '{{user}}', '我', '玩家', '林北']) assert.equal(isOwnPhone(own, '林北'), true, own);
    assert.equal(isOwnPhone('小雪', '林北'), false);
    assert.equal(isOwnPhone('林北', ''), false, 'unknown player name: a real name is a character');
});

test('gate:peek:character-phone-look-is-stable-and-differs-from-mine', () => {
    const mine = normalizeMyPhone({});
    const a = peekLookOf('小雪', mine);
    assert.deepEqual(peekLookOf('小雪', mine), a);
    assert.notEqual(`${a.model}|${a.caseColor}`, `${mine.model}|${mine.caseColor}`);
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
        const look = peekLookOf(`角色${i}`, mine);
        assert.notEqual(`${look.model}|${look.caseColor}`, `${mine.model}|${mine.caseColor}`);
        assert.equal(look.wallpaper, 'none');
        seen.add(`${look.model}|${look.caseColor}`);
    }
    assert.ok(seen.size > 3, 'several different phones');
});

test('gate:peek:own-phone-has-no-peek-chrome', () => {
    for (const owner of ['', '我', '{{user}}', '林北']) {
        const { stage } = mountPeek('weibo', owner, [post('甲', '内容')]);
        assert.equal(stage.getAttribute('data-peek'), null, owner);
        assert.equal(stage.querySelector('.igs-feed-peek'), null);
        assert.equal(stage.querySelector('.igs-feed-lock-owner'), null);
        assert.equal(stage.style.get('--igs-phone-case'), '#111215', 'my phone look kept');
    }
});

test('gate:peek:character-phone-look-badge-vignette-and-pin-lock', () => {
    const { stage, c } = mountPeek('weibo', '小雪', [post('甲', '内容')]);
    assert.equal(stage.getAttribute('data-peek'), '1');
    const look = peekLookOf('小雪', normalizeMyPhone({}));
    assert.equal(stage.getAttribute('data-model'), look.model);
    assert.equal(stage.style.get('--igs-phone-case'), look.caseColor);
    assert.equal(stage.getAttribute('data-wall'), 'none');
    assert.equal(stage.querySelector('.igs-feed-peek').textContent, '偷看中');
    assert.ok(stage.querySelector('.igs-feed-vignette'));
    const lock = stage.querySelector('.igs-feed-lock');
    assert.equal(lock.querySelector('.igs-feed-lock-owner').textContent, '小雪的手机');
    const wall = lock.querySelector('.igs-feed-lock-wall');
    assert.ok(wall.classList.contains('is-peek'));
    assert.match(wall.style.backgroundImage, /snow\.png/);
    assert.ok(lock.querySelector('.igs-feed-lock-shade'));
    const dots = lock.querySelectorAll('.igs-feed-lock-pin-dot');
    assert.equal(dots.length, PEEK_DOTS);
    assert.equal(dots.filter((d) => d.getAttribute('data-on')).length, 0);
    c.run(450);
    assert.equal(dots.filter((d) => d.getAttribute('data-on')).length, 2, 'dots light one by one');
    assert.equal(lock.getAttribute('data-unlock'), null, 'still locked while dots light');
    c.run(400);
    assert.equal(dots.filter((d) => d.getAttribute('data-on')).length, PEEK_DOTS);
    c.run(400);
    assert.equal(lock.getAttribute('data-unlock'), '1');
    assert.equal(stage.getAttribute('data-locked'), null);
    c.run(600);
    assert.equal(lock.parentNode, null);
    assert.ok(stage.querySelector('.igs-feed-peek'), 'badge stays after unlock');
});

test('gate:peek:reduced-motion-skips-pin-lock-but-keeps-badge', () => {
    const { stage } = mountPeek('memo', '小雪', [post('', '写给他的话', '草稿')], { reducedMotion: true });
    assert.equal(stage.querySelector('.igs-feed-lock'), null);
    assert.equal(stage.getAttribute('data-locked'), null);
    assert.ok(stage.querySelector('.igs-feed-peek'));
});

test('gate:peek:different-owner-is-a-different-phone', () => {
    const { root, motion, c } = mountPeek('weibo', '小雪', [post('甲', '内容')]);
    const first = motion.querySelector('.igs-feed-stage');
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: { platform: 'weibo', owner: '小雪', posts: [post('甲', '内容')] } } }, PEEK_RS), PEEK_OPTS(c));
    assert.equal(motion.querySelector('.igs-feed-stage'), first, 'same owner keeps the root');
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { feed: { platform: 'weibo', owner: '阿宁', posts: [post('甲', '内容')] } } }, PEEK_RS), PEEK_OPTS(c));
    c.run(600);
    const now = motion.querySelectorAll('.igs-feed-stage').filter((s) => !s.getAttribute('data-leaving'));
    assert.equal(now.length, 1);
    assert.notEqual(now[0], first);
});

test('gate:peek:search-history-list', () => {
    const { stage } = mountPeek('search', '小雪', [post('昨天 23:40', '怎么才能忘记一个人'), post('', '<img src=x onerror=1> 失眠怎么办')]);
    assert.equal(stage.getAttribute('data-platform'), 'search');
    const rows = stage.querySelectorAll('.igs-feed-post');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].getAttribute('data-kind'), 'search');
    assert.equal(rows[0].querySelector('.igs-feed-term').textContent, '怎么才能忘记一个人');
    assert.equal(rows[0].querySelector('.igs-feed-term-time').textContent, '昨天 23:40');
    assert.ok(rows[0].querySelector('.igs-feed-term-clock'));
    assert.ok(rows[0].querySelector('.igs-feed-term-x'));
    assert.equal(rows[1].querySelector('.igs-feed-term-time'), null, 'no time, nothing invented');
    assert.equal(rows[1].querySelector('.igs-feed-term').textContent, '<img src=x onerror=1> 失眠怎么办', 'plain text only');
    assert.equal(rows[1].children.length, 3);
    assert.match(FEED_STYLE_TEXT, /data-platform="search"\] \.igs-feed-list\{flex-direction:column-reverse/);
});

test('gate:peek:memo-sticky-notes-and-draft-badge', () => {
    const { stage } = mountPeek('memo', '小雪', [post('', '对不起，其实我一直都', '给他的草稿'), post('', '周三交报告', '待办')]);
    const notes = stage.querySelectorAll('.igs-feed-post');
    assert.equal(notes[0].querySelector('.igs-feed-memo-title').textContent, '给他的');
    assert.equal(notes[0].querySelector('.igs-feed-draft').textContent, '未发送');
    assert.equal(notes[0].getAttribute('data-draft'), '1');
    assert.equal(notes[0].querySelector('.igs-feed-memo-text').textContent, '对不起，其实我一直都');
    assert.equal(notes[1].querySelector('.igs-feed-memo-title').textContent, '待办');
    assert.equal(notes[1].querySelector('.igs-feed-draft'), null);
});

test('gate:peek:album-grid-placeholders-with-captions', () => {
    const { stage } = mountPeek('album', '小雪', [post('', '和他在天台看日落', '天台 去年夏天'), post('', '一只猫')]);
    const cells = stage.querySelectorAll('.igs-feed-post');
    assert.equal(cells.length, 2);
    assert.ok(cells[0].querySelector('.igs-feed-photo'));
    assert.ok(cells[0].querySelector('.igs-feed-photo-icon'));
    assert.equal(cells[0].querySelector('.igs-feed-photo-cap').textContent, '和他在天台看日落');
    assert.equal(cells[0].querySelector('.igs-feed-photo-meta').textContent, '天台 去年夏天');
    assert.equal(cells[1].querySelector('.igs-feed-photo-meta'), null);
    assert.equal(cells[0].querySelector('img'), null, 'no generated image');
    assert.match(FEED_STYLE_TEXT, /data-platform="album"\] \.igs-feed-post\{[^}]*pointer-events:none/);
});

test('gate:peek:chat-list-rows-pinned-and-bubbles', () => {
    const { stage } = mountPeek('chats', '小雪', [
        post('小雪的闺蜜', '今晚还去吗', '置顶', [{ author: '小雪的闺蜜', text: '在吗' }, { author: '我', text: '去' }]),
        post('老妈', '早点回家', '18:20'),
        post('林北', '晚安', '昨天'),
    ]);
    const rows = stage.querySelectorAll('.igs-feed-post');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].getAttribute('data-pinned'), '1');
    assert.equal(rows[0].querySelector('.igs-feed-name').textContent, '小雪的闺蜜');
    assert.equal(rows[0].querySelector('.igs-feed-chat-last').textContent, '今晚还去吗');
    assert.match(rows[0].querySelector('.igs-feed-chat-time').textContent, /^\d+分钟前$/, 'pinned without a time falls back to a stable one');
    assert.ok(rows[0].querySelector('.igs-feed-avatar'));
    assert.equal(rows[0].querySelector('.igs-feed-unread'), null, 'pinned row has no red dot');
    assert.equal(rows[1].getAttribute('data-pinned'), null);
    assert.equal(rows[1].querySelector('.igs-feed-chat-time').textContent, '18:20');
    assert.equal(rows[2].querySelector('.igs-feed-chat-time').textContent, '昨天');
    const bubbles = rows[0].querySelectorAll('.igs-feed-bubble');
    assert.deepEqual(bubbles.map((b) => b.textContent), ['在吗', '去']);
    assert.deepEqual(bubbles.map((b) => b.getAttribute('data-side')), ['peer', 'self']);
    assert.equal(rows[1].querySelectorAll('.igs-feed-bubble').length, 0);
    // 红点只由内容稳定决定：同样的会话换一台挂载结果一致。
    const again = mountPeek('chats', '小雪', [post('老妈', '早点回家', '18:20')]).stage.querySelector('.igs-feed-post');
    assert.equal(Boolean(again.querySelector('.igs-feed-unread')), Boolean(rows[1].querySelector('.igs-feed-unread')));
});

test('gate:peek:shop-product-cards', () => {
    const { stage } = mountPeek('shop', '', [post('小熊旗舰店', '【爆款】猫咪同款睡衣加厚保暖', '¥29.9 月销1万+', [{ author: '买家', text: '追评：质量不错' }])]);
    assert.equal(stage.getAttribute('data-platform'), 'shop');
    assert.equal(stage.getAttribute('data-peek'), null, 'shop is an ordinary platform');
    const card = stage.querySelector('.igs-feed-post');
    assert.equal(card.getAttribute('data-kind'), 'shop');
    assert.ok(card.querySelector('.igs-feed-shop-img').querySelector('.igs-feed-shop-bag'));
    assert.equal(card.querySelector('.igs-feed-shop-title').textContent, '【爆款】猫咪同款睡衣加厚保暖');
    assert.equal(card.querySelector('.igs-feed-price').textContent, '¥29.9');
    assert.equal(card.querySelector('.igs-feed-sales').textContent, '月销1万+');
    assert.equal(card.querySelector('.igs-feed-shop-name').textContent, '小熊旗舰店');
    assert.equal(card.querySelector('.igs-feed-rtext').textContent, '追评：质量不错');
    assert.ok(stage.querySelector('.igs-feed-search'), 'search bar under the orange header');
    assert.match(FEED_STYLE_TEXT, /content:"宝贝评价"/);
    assert.equal(feedPlatformById('shop').accent, '#ff5000');
});

test('gate:peek:registry-and-prompt-expand-only-when-mentioned', () => {
    for (const id of ['search', 'memo', 'album', 'chats']) {
        const p = feedPlatformById(id);
        assert.equal(p.skin, 'phone');
        assert.match(p.prompt, /只在偷看别人手机时用/);
    }
    assert.deepEqual(mentionedFeedPlatforms(['淘宝上又买了东西']), ['shop']);
    const fx = (lines) => lines.join('\n');
    const base = { enabled: true, worldview: 'modern' };
    const [quiet] = feedGrammarBlocks({ feedFx: { ...base, mentioned: [] } }, (title, lines) => fx(lines));
    assert.match(quiet.full, /app\|平台\|主人/);
    assert.match(quiet.full, /其他可用平台：.*搜索记录、备忘录、相册、聊天列表/);
    assert.doesNotMatch(quiet.full, /只在偷看别人手机时用/);
    const [open] = feedGrammarBlocks({ feedFx: { ...base, mentioned: ['chats'] } }, (title, lines) => fx(lines));
    assert.match(open.full, /聊天列表（附加写时间或置顶）：只在偷看别人手机时用/);
});

test('gate:peek:turn-index-marks-other-peoples-phones', async () => {
    const listeners = {};
    const attrs = {};
    const dom = {
        id: '', innerHTML: '',
        classList: { add() { }, remove() { }, toggle() { } },
        setAttribute: (k, v) => { attrs[k] = String(v); },
        removeAttribute: (k) => { delete attrs[k]; },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: (type) => { delete listeners[type]; },
        querySelector: () => null,
        getBoundingClientRect: () => ({ width: 1000, height: 700 }),
        remove() { },
    };
    const docLike = { activeElement: null, createElement: () => dom };
    const container = { appendChild() { }, classList: { toggle() { } }, setAttribute() { }, removeAttribute() { } };
    const texts = [
        '[igs-fx:app|聊天列表|小雪][igs-fx:post|老妈|早点回家|18:20][igs-fx:app-end]',
        '[igs-fx:app|微博|林北][igs-fx:post|甲|自己的手机|][igs-fx:app-end][igs-fx:app|微博][igs-fx:post|乙|也是自己的|][igs-fx:app-end]',
        '[igs-fx:app|搜索记录|<b>坏</b>][igs-fx:post||搜索|][igs-fx:app-end]',
    ];
    const panel = createTurnIndexPanel(docLike, {
        progress: { getFarthest: () => null, getLast: () => null, floorState: () => 'unread', chapterAt: () => '', listSlots: () => [], getQuick: () => null },
        tab: 'feed',
        userName: '林北',
        listTurns: async () => texts.map((text, i) => ({ id: i, text })),
        snippetOf: () => '',
        rawOf: (turn) => turn.text,
        currentId: () => null,
        onJump() { },
    });
    await panel.open(container);
    const html = dom.innerHTML;
    assert.match(html, /<b class="igs-ti-peek">小雪的手机<\/b>聊天列表 · 老妈/);
    assert.equal((html.match(/igs-ti-peek"/g) || []).length, 2, 'own phones carry no tag');
    assert.doesNotMatch(html, /<b>坏<\/b>/, 'owner is escaped');
    assert.match(html, /&lt;b&gt;坏&lt;\/b&gt;的手机/);
});
