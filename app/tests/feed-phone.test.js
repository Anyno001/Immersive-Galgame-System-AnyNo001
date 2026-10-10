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

test('gate:feed:phone-platform-raises-with-post-text', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('路人甲', '今天 #热搜# 太离谱了', '热搜词', [{ author: '乙', text: '笑死' }])] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, FEED_ON), opts(c));
    const stage = motion.querySelector('.igs-feed-stage');
    assert.ok(stage.classList.contains('igs-live-stage'));
    assert.equal(stage.getAttribute('data-platform'), 'weibo');
    assert.equal(stage.getAttribute('data-model'), 'full');
    const phone = stage.querySelector('.igs-live-phone');
    assert.ok(phone.querySelector('.igs-phone-status'));
    assert.equal(phone.querySelector('.igs-feed-app').textContent, '微博');
    assert.equal(phone.querySelector('.igs-feed-name').textContent, '路人甲');
    assert.equal(phone.querySelector('.igs-feed-text').textContent, '今天 #热搜# 太离谱了');
    assert.equal(phone.querySelector('.igs-feed-hl').textContent, '#热搜#');
    assert.equal(phone.querySelector('.igs-feed-extra-text').textContent, '热搜词');
    assert.equal(phone.querySelector('.igs-feed-rtext').textContent, '笑死');
    assert.equal(phone.style.get('--igs-live-h'), '648px');
    assert.equal(stage.style.get('--fp-accent'), '#ff8200');
});

test('gate:feed:paper-platform-has-no-phone-shell', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'notice', posts: [post('官府', '三日后开城门', '东城门')] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, FEED_ON), opts(c));
    const stage = motion.querySelector('.igs-feed-stage');
    assert.equal(stage.getAttribute('data-skin'), 'paper');
    assert.equal(motion.querySelector('.igs-live-phone'), null);
    assert.equal(motion.querySelector('.igs-phone-status'), null);
    assert.equal(stage.querySelector('.igs-feed-paper-title').textContent, '告示');
    assert.equal(stage.querySelector('.igs-feed-text').textContent, '三日后开城门');
    assert.notEqual(stage.style.get('--igs-feed-max'), undefined);
});

test('gate:feed:keeps-root-across-pages-and-appends-posts', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const a = post('甲', '第一条');
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { feed: { platform: 'tieba', posts: [a] } } }, FEED_ON), opts(c));
    const stage = motion.querySelector('.igs-feed-stage');
    const firstNode = stage.querySelector('.igs-feed-post');
    const b = post('乙', '第二条');
    const a2 = { ...a, fresh: false, replies: [{ author: '丙', text: '前排' }] };
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: { platform: 'tieba', posts: [a2, b] } } }, FEED_ON), opts(c));
    assert.equal(motion.querySelector('.igs-feed-stage'), stage);
    const posts = stage.querySelectorAll('.igs-feed-post');
    assert.equal(posts.length, 2);
    assert.equal(posts[0], firstNode, 'existing post node kept');
    assert.equal(posts[1].getAttribute('data-fresh'), '1');
    assert.equal(posts[0].querySelectorAll('.igs-feed-reply').length, 1);
    assert.equal(posts[0].querySelector('.igs-feed-floor').textContent, '1楼');
    assert.equal(posts[1].querySelector('.igs-feed-floor').textContent, '2楼');
    assert.equal(posts[0].querySelector('.igs-feed-owner').hidden, false);
    assert.equal(posts[1].querySelector('.igs-feed-owner').hidden, true);
});

test('gate:feed:news-structure-title-byline-and-hot-comments', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'news', posts: [post('本地晚报', '学院食堂今日起延长营业', '社会', [{ author: '网友', text: '终于' }])] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, FEED_ON), opts(c));
    const stage = motion.querySelector('.igs-feed-stage');
    assert.equal(stage.getAttribute('data-platform'), 'news');
    assert.equal(stage.querySelector('.igs-feed-chip').textContent, '社会');
    const card = stage.querySelector('.igs-feed-post');
    assert.equal(card.getAttribute('data-kind'), 'news');
    assert.equal(card.querySelector('.igs-feed-text').textContent, '学院食堂今日起延长营业');
    assert.match(card.querySelector('.igs-feed-byline').textContent, /^本地晚报 · 社会 · \d+评$/);
    assert.ok(card.querySelector('.igs-feed-thumb'));
    assert.equal(card.querySelector('.igs-feed-replies').hidden, false);
    assert.match(FEED_STYLE_TEXT, /content:"热评"/);
});

test('gate:feed:zhihu-structure-question-identity-and-agree', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'zhihu', posts: [post('林医生，三甲医院急诊科', '先说结论，别硬扛。', '半夜胸闷怎么办？')] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, FEED_ON), opts(c));
    const card = motion.querySelector('.igs-feed-post');
    assert.equal(card.getAttribute('data-kind'), 'zhihu');
    assert.equal(card.children[0].textContent, '半夜胸闷怎么办？', 'question first');
    assert.equal(card.querySelector('.igs-feed-name').textContent, '林医生');
    assert.equal(card.querySelector('.igs-feed-identity').textContent, '三甲医院急诊科');
    assert.match(card.querySelector('.igs-feed-agree').textContent, /^赞同 \d+/);
    assert.ok(motion.querySelector('.igs-feed-search'));
});

test('gate:feed:review-star-parsing-work-bar-and-card-stars', () => {
    assert.equal(starsOf('《某书》4星'), 4);
    assert.equal(starsOf('《某书》5分'), 5);
    assert.equal(starsOf('★★★'), 3);
    assert.equal(starsOf('《某书》'), 0);
    assert.equal(workOf('《某书》4星'), '某书');
    assert.equal(workOf('某书 3星'), '某书');
    assert.deepEqual(splitAuthor('甲，路人'), ['甲', '路人']);
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'review', posts: [post('读者甲', '节奏很好', '《星河》4星'), post('读者乙', '一般', '《星河》2星')] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, FEED_ON), opts(c));
    const bar = motion.querySelector('.igs-feed-work');
    assert.equal(bar.querySelector('.igs-feed-work-title').textContent, '星河');
    assert.equal(bar.querySelectorAll('.igs-feed-star').length, 5);
    assert.equal(bar.querySelectorAll('.is-on').length, 4);
    const cards = motion.querySelectorAll('.igs-feed-post');
    assert.equal(cards[0].querySelectorAll('.is-on').length, 4);
    assert.equal(cards[1].querySelectorAll('.is-on').length, 2);
});

test('gate:feed:null-feed-and-platform-change-retire-the-phone', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { feed: { platform: 'moments', posts: [post('甲', '晒图')] } } }, FEED_ON), opts(c));
    const stage = motion.querySelector('.igs-feed-stage');
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: { platform: 'xhs', posts: [post('乙', '种草')] } } }, FEED_ON), opts(c));
    assert.equal(stage.getAttribute('data-leaving'), '1');
    const next = motion.querySelectorAll('.igs-feed-stage').find((n) => n !== stage);
    assert.equal(next.getAttribute('data-platform'), 'xhs');
    c.run(500);
    assert.equal(stage.parentNode, null);
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { feed: null } }, FEED_ON), opts(c));
    assert.equal(next.getAttribute('data-leaving'), '1');
    c.run(500);
    assert.equal(motion.querySelector('.igs-feed-stage'), null);
    assert.equal(cancelDanmaku(root), true);
});

test('gate:feed:live-phone-yields-while-feed-is-open', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const live = { name: '爱丽丝', title: '深夜杂谈', view: 'watch' };
    const settings = { liveFx: { enabled: true }, ...FEED_ON };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { live } }, settings), opts(c));
    const liveStage = motion.querySelector('.igs-live-stage');
    assert.equal(liveStage.hidden, false);
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { live, feed: { platform: 'weibo', posts: [post('甲', '看直播吗')] } } }, settings), opts(c));
    assert.equal(liveStage.hidden, true, 'live phone hidden while feed is up');
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { live, feed: null } }, settings), opts(c));
    assert.equal(liveStage.hidden, false, 'live phone back after the feed closes');
});

test('gate:feed:muted-on-nsfw-dream-and-chat-pages', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '热闹')] };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, sceneNsfw: true, fx: { feed } }, FEED_ON), opts(c));
    assert.equal(motion.querySelector('.igs-feed-stage'), null);
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed, dream: true } }, FEED_ON), opts(c));
    assert.equal(motion.querySelector('.igs-feed-stage'), null);
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, chatPage: true, fx: { feed } }, FEED_ON), opts(c));
    assert.equal(motion.querySelector('.igs-feed-stage'), null);
});

test('gate:feed:all-off-costs-nothing-and-news-style-exists', () => {
    const { root, motion } = makeRoot();
    const feed = { platform: 'weibo', posts: [post('甲', '热闹')] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, {}));
    assert.equal(motion.querySelector('#igs-fx-stage'), null);
    assert.equal(cancelDanmaku(root), false);
    assert.match(FEED_STYLE_TEXT, /data-platform="news"/);
    assert.doesNotMatch(FEED_STYLE_TEXT, /backdrop-filter/);
});

test('gate:feed:phone-geometry-matches-live-phone', () => {
    const geo = phoneGeometry({ stageW: 1280, stageH: 720, dialogTop: 560 }, 'full', 'large');
    assert.equal(geo.height, 648);
    assert.equal(geo.top, 22);
    assert.ok(geo.under > 0);
});

// ---- 沉浸感：剧情状态栏 / 锁屏 / 熟人 / 数字记得 / 回看入口 ----
const statusOf = (node) => node.querySelector('.igs-phone-status');
const batteryOf = (bar) => bar.getAttribute('data-battery');

test('gate:feed:story-clock-maps-period-and-clock-to-status-time', () => {
    assert.deepEqual(storyClock('夜晚'), { time: '21:35', night: true });
    assert.deepEqual(storyClock('深夜'), { time: '01:48', night: true });
    assert.deepEqual(storyClock('清晨'), { time: '07:12', night: false });
    assert.deepEqual(storyClock('上午'), { time: '10:24', night: false });
    assert.deepEqual(storyClock('中午'), { time: '12:06', night: false });
    assert.deepEqual(storyClock('下午'), { time: '15:40', night: false });
    assert.deepEqual(storyClock('黄昏'), { time: '18:20', night: false });
    assert.deepEqual(storyClock('下午3点半'), { time: '15:30', night: false });
    assert.deepEqual(storyClock('晚上8:05'), { time: '20:05', night: true });
    assert.equal(storyClock('某年某月'), null);
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '今晚好热闹')] };
    applyDanmakuToDom(root, snapshot({ sceneTime: '夜晚', fx: { feed } }, FEED_ON), opts(c));
    const stage = motion.querySelector('.igs-feed-stage');
    const bar = statusOf(stage);
    assert.equal(bar.children[0].textContent, '21:35');
    assert.equal(stage.getAttribute('data-night'), '1');
    assert.equal(bar.getAttribute('data-night'), '1');
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, sceneTime: '下午', fx: { feed } }, FEED_ON), opts(c));
    assert.equal(bar.children[0].textContent, '15:40');
    assert.equal(stage.getAttribute('data-night'), null);
    assert.match(FEED_STYLE_TEXT, /data-night/);
});

test('gate:feed:low-battery-and-no-service-follow-the-text-and-worldview', () => {
    assert.deepEqual(lowBattery('手机只剩 12% 电了'), { low: true, pct: 12 });
    assert.deepEqual(lowBattery('手机快没电了'), { low: true, pct: 5 });
    assert.equal(lowBattery('电量很足'), null);
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '刷刷')] };
    applyDanmakuToDom(root, snapshot({ displayText: '她手机只剩12%的电了', fx: { feed } }, FEED_ON), opts(c));
    const bar = statusOf(motion.querySelector('.igs-feed-stage'));
    assert.equal(batteryOf(bar), 'low');
    assert.match(bar.children[1].innerHTML, /12%/);
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, displayText: '充上电了', fx: { feed } }, FEED_ON), opts(c));
    assert.equal(batteryOf(bar), 'full');
    assert.doesNotMatch(bar.children[1].innerHTML, /igs-phone-lowbat/);
    assert.doesNotMatch(bar.children[1].innerHTML, /无服务/);
    // 随身手机 + 古代世界观：无服务；现代世界观不受影响。
    const carry = { feedFx: { enabled: true, carryPhone: true }, _worldview: 'ancient' };
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { feed } }, carry), opts(c));
    assert.match(bar.children[1].innerHTML, /无服务/);
    applyDanmakuToDom(root, snapshot({ currentIndex: 3, fx: { feed } }, { ...carry, _worldview: 'modern' }), opts(c));
    assert.doesNotMatch(bar.children[1].innerHTML, /无服务/);
});

test('gate:feed:live-phone-status-also-follows-story-time', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const live = { name: '爱丽丝', title: '深夜杂谈', view: 'watch' };
    applyDanmakuToDom(root, snapshot({ sceneTime: '黄昏', fx: { live } }, { liveFx: { enabled: true } }), opts(c));
    assert.equal(statusOf(motion.querySelector('.igs-live-stage')).children[0].textContent, '18:20');
});

test('gate:feed:lock-screen-plays-once-per-interval-and-skips-reduced-motion', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('路人甲', '今天的瓜实在是太大了太大了太大了太大了太大了', '热搜词')] };
    const bg = { backgroundImage: 'https://img/bg.png' };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, ...bg, fx: { feed } }, FEED_ON), { ...opts(c), resolveAssetUrl: (u) => u });
    const stage = motion.querySelector('.igs-feed-stage');
    const lock = stage.querySelector('.igs-feed-lock');
    assert.ok(lock, 'lock screen raised first');
    assert.equal(stage.getAttribute('data-locked'), '1');
    assert.match(lock.querySelector('.igs-feed-lock-wall').style.backgroundImage, /bg\.png/);
    assert.equal(lock.querySelector('.igs-feed-lock-app').textContent, '微博');
    assert.match(lock.querySelector('.igs-feed-lock-body').textContent, /^路人甲：.{20}…$/);
    assert.ok(lock.querySelector('.igs-feed-lock-time').textContent.length >= 4);
    c.run(950);
    assert.equal(lock.getAttribute('data-unlock'), '1');
    assert.equal(stage.getAttribute('data-locked'), null);
    c.run(600);
    assert.equal(lock.parentNode, null);
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: { platform: 'weibo', posts: [...feed.posts, post('乙', '再来一条')] } } }, FEED_ON), opts(c));
    assert.equal(stage.querySelector('.igs-feed-lock'), null, 'no replay across pages');
    // 减少动态效果：不放锁屏。
    const other = makeRoot();
    applyDanmakuToDom(other.root, snapshot({ fx: { feed } }, FEED_ON), { ...opts(c), reducedMotion: true });
    assert.equal(other.motion.querySelector('.igs-feed-lock'), null);
    assert.equal(other.motion.querySelector('.igs-feed-stage').getAttribute('data-locked'), null);
});

test('gate:feed:known-characters-get-avatar-and-friend-tag', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const rs = { ...FEED_ON, _sceneAssets: { statusAvatars: { 小雪: 'https://img/snow.png' } } };
    const feed = { platform: 'moments', posts: [post('小雪', '今天的云很好看', '', [{ author: '小雪', text: '真的' }, { author: '路人', text: '哇' }]), post('陌生人', '路过')] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, rs), { ...opts(c), resolveAssetUrl: (u) => u });
    const cards = motion.querySelectorAll('.igs-feed-post');
    const av = cards[0].querySelector('.igs-feed-avatar');
    assert.equal(av.getAttribute('data-friend'), '1');
    assert.equal(av.querySelector('.igs-feed-avatar-img').src, 'https://img/snow.png');
    assert.equal(cards[0].querySelectorAll('.igs-feed-friend').length, 2, 'post author and the reply by the same friend');
    assert.equal(cards[0].querySelector('.igs-feed-friend').textContent, '好友');
    assert.equal(cards[1].querySelector('.igs-feed-friend'), null);
    assert.equal(cards[1].querySelector('.igs-feed-avatar').textContent, '陌');
    // 其他平台叫已关注。
    const o = makeRoot();
    applyDanmakuToDom(o.root, snapshot({ fx: { feed: { platform: 'weibo', posts: [post('小雪', '晒猫')] } } }, rs), { ...opts(c), resolveAssetUrl: (u) => u });
    assert.equal(o.motion.querySelector('.igs-feed-friend').textContent, '已关注');
});

test('gate:feed:counts-remember-the-first-floor-and-grow', () => {
    assert.equal(grownCount('s', 100, 7, 7), 100);
    assert.ok(grownCount('s', 100, 7, 12) > grownCount('s', 100, 7, 8));
    assert.ok(grownCount('s', 100, 7, 12) <= 100 * 1.25 ** 5 + 1);
    assert.equal(grownCount('s', 100, 7, 5), 100, 'never shrinks');
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '大新闻', '', [{ author: '乙', text: '真的假的' }])] };
    const numbers = () => motion.querySelector('.igs-feed-post').querySelectorAll('.igs-feed-stat').map((n) => n.children[n.children.length - 1].textContent);
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, FEED_ON, 7), opts(c));
    const first = numbers();
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed } }, FEED_ON, 7), opts(c));
    assert.deepEqual(numbers(), first, 'same floor, same numbers');
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { feed } }, FEED_ON, 13), opts(c));
    const later = numbers();
    assert.notDeepEqual(later, first);
    const like = (list) => Number(list[list.length - 1]);
    assert.ok(like(later) > like(first), `likes grew ${first} -> ${later}`);
});

test('gate:feed:review-entry-opens-same-page-and-closes', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '大新闻', '热搜词'), post('乙', '后续')] };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { feed } }, FEED_ON), opts(c));
    const front = motion.querySelector('.igs-dm-front');
    assert.equal(front.querySelector('.igs-feed-entry'), null, 'phone is up: no entry yet');
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: null } }, FEED_ON), opts(c));
    c.run(600);
    const entry = front.querySelector('.igs-feed-entry');
    assert.equal(entry.hidden, false);
    assert.equal(entry.getAttribute('data-beside'), '0', 'no audience entry: same spot');
    assert.ok(entry.innerHTML.includes('<svg'));
    assert.equal(entry.querySelector('.igs-feed-entry-dot').style.get('background'), '#ff8200');
    let stopped = 0;
    const ev = (target) => ({ stopPropagation() { stopped += 1; }, target });
    entry.listeners.click[0](ev(entry));
    const overlay = front.querySelector('.igs-feed-review');
    assert.ok(overlay, 'overlay in the clickable front layer');
    assert.equal(overlay.querySelectorAll('.igs-feed-post').length, 2);
    assert.equal(overlay.querySelector('.igs-feed-lock'), null, 'no lock screen on review');
    assert.equal(overlay.querySelector('.igs-feed-text').textContent, '大新闻');
    assert.ok(overlay.listeners.pointerdown.length > 0 && overlay.listeners.wheel.length > 0);
    // 点遮罩关闭
    overlay.listeners.click[0](ev(overlay));
    assert.equal(front.querySelector('.igs-feed-review'), null);
    assert.ok(stopped >= 2, 'events do not bubble to the reader');
    // 右上角关闭
    entry.listeners.click[0](ev(entry));
    front.querySelector('.igs-feed-review').querySelector('.igs-feed-review-close').listeners.click[0](ev(null));
    assert.equal(front.querySelector('.igs-feed-review'), null);
    // 点手机本身不关
    entry.listeners.click[0](ev(entry));
    front.querySelector('.igs-feed-review').listeners.click[0](ev(motion));
    assert.ok(front.querySelector('.igs-feed-review'));
    // 社区手机再次抬起时回看收起；退出时整个移除
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { feed } }, FEED_ON), opts(c));
    assert.equal(front.querySelector('.igs-feed-review'), null);
    assert.equal(front.querySelector('.igs-feed-entry').hidden, true);
    applyDanmakuToDom(root, snapshot({ currentIndex: 3, fx: { feed: null } }, FEED_ON), opts(c));
    assert.equal(front.querySelector('.igs-feed-entry').hidden, false);
    cancelDanmaku(root);
    assert.equal(motion.querySelector('.igs-feed-entry'), null);
});

test('gate:feed:review-entry-sits-beside-the-audience-entry', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '大新闻')] };
    const rs = { ...FEED_ON, danmakuFx: { audience: { enabled: true } } };
    const danmaku = [{ lines: ['哈哈'], style: 'scroll' }];
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { feed } }, rs), opts(c));
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: null, danmaku } }, rs), opts(c));
    const front = motion.querySelector('.igs-dm-front');
    const aud = front.querySelector('.igs-aud-entry');
    const entry = front.querySelector('.igs-feed-entry');
    assert.ok(entry && !entry.hidden);
    assert.equal(entry.getAttribute('data-beside'), aud && !aud.hidden ? '1' : '0');
    assert.match(FEED_STYLE_TEXT, /\.igs-feed-entry\[data-beside="1"\]/);
});

test('gate:feed:review-entry-needs-feed-enabled-and-costs-nothing-off', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const feed = { platform: 'weibo', posts: [post('甲', '大新闻')] };
    applyDanmakuToDom(root, snapshot({ fx: { feed } }, {}), opts(c));
    assert.equal(motion.querySelector('.igs-feed-entry'), null);
    // 社区关、直播开：不出现社区节点，也没有回看入口。
    applyDanmakuToDom(root, snapshot({ fx: { feed, live: { name: '爱丽丝', title: '杂谈', view: 'watch' } } }, { liveFx: { enabled: true } }), opts(c));
    assert.equal(motion.querySelector('.igs-feed-entry'), null);
    assert.equal(motion.querySelector('.igs-feed-stage'), null);
    // NSFW 静音页不出入口。
    applyDanmakuToDom(root, snapshot({ currentIndex: 3, fx: { feed } }, FEED_ON), opts(c));
    applyDanmakuToDom(root, snapshot({ currentIndex: 4, sceneNsfw: true, fx: { feed: null } }, FEED_ON), opts(c));
    const muted = motion.querySelector('.igs-feed-entry');
    assert.ok(!muted || muted.hidden, 'no entry on a muted page');
});

test('gate:feed:review-keeps-every-post-of-the-run-and-storm-takes-over', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const a = post('甲', '一'), b = post('乙', '二'), d = post('丙', '三'), e = post('丁', '四');
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx: { feed: { platform: 'weibo', posts: [a, b, d] } } }, FEED_ON), opts(c));
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { feed: { platform: 'weibo', posts: [b, d, e] } } }, FEED_ON), opts(c));
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { feed: null } }, FEED_ON), opts(c));
    c.run(600);
    const front = motion.querySelector('.igs-dm-front');
    const entry = front.querySelector('.igs-feed-entry');
    entry.listeners.click[0]({ stopPropagation() {}, target: entry });
    assert.equal(front.querySelector('.igs-feed-review').querySelectorAll('.igs-feed-post').length, 4, 'review keeps posts beyond the 3 on screen');
    // 风暴优先：社区与直播手机让位。
    const storm = { platform: 'weibo', tone: 'black', topic: '#塌房#', mentions: [{ author: '路人', text: '@你 出来解释', fresh: true }] };
    const live = { name: '爱丽丝', title: 't', view: 'watch' };
    applyDanmakuToDom(root, snapshot({ currentIndex: 3, fx: { storm, feed: { platform: 'weibo', posts: [a] }, live } }, { ...FEED_ON, liveFx: { enabled: true } }), opts(c));
    assert.ok(motion.querySelector('.igs-storm-stage'), 'storm phone up');
    assert.equal(motion.querySelector('.igs-feed-stage:not(.igs-storm-stage)'), null);
    cancelDanmaku(root);
    assert.equal(motion.querySelector('.igs-storm-stage'), null);
});

test('gate:feed:phone-geometry-sinks-at-most-38-percent-and-keeps-width', () => {
    // 对话框占下半截：宽度优先，机身最多沉进 38%。
    const a = phoneGeometry({ stageW: 390, stageH: 760, dialogTop: 470, topInset: 40 }, 'full', 'fit');
    assert.equal(a.top, 48);
    assert.ok(a.width >= 390 * 0.88 * 0.9 || a.height <= 760 * 0.9);
    assert.ok(a.under <= a.height * 0.38 + 1);
    assert.equal(a.under, Math.round(Math.max(0, a.top + a.height - 470)));
    assert.ok(a.height >= 470 - 48 - 8);
    // 对话框隐藏（dialogTop = 舞台底边）：不下沉。
    const b = phoneGeometry({ stageW: 390, stageH: 760, dialogTop: 760, topInset: 0 }, 'full', 'fit');
    assert.equal(b.under, 0);
    // 横屏宽舞台：被 820 / 九成高上限卡住，不会撑爆。
    const c = phoneGeometry({ stageW: 1920, stageH: 900, dialogTop: 700, topInset: 0 }, 'full', 'fit');
    assert.ok(c.height <= 810 && c.height <= 900 - c.top - 4);
});

test('gate:feed:close-button-dismisses-phone-until-platform-changes', async () => {
    const { syncFeedPhone } = await import('../src/visual/igs-ui/feed-phone.js');
    const { root, motion } = makeRoot();
    void motion;
    const host = root.ownerDocument.createElement('div');
    root.appendChild(host);
    const doc = root.ownerDocument;
    const ctx = { doc, reduced: true, schedule: () => 1, now: () => 0, look: {}, status: null, messageId: 1, userName: '', firstSeen: new Map(), avatarOf: () => '' };
    const feed = { platform: 'weibo', owner: '', posts: [{ author: '甲', text: '一二三', extra: '' }] };
    let dismissed = 0;
    const state = syncFeedPhone(host, feed, { ...ctx, onDismiss: () => { dismissed += 1; } });
    assert.ok(state && state.els.close);
    state.els.close.listeners.click[0]({ stopPropagation() {} });
    assert.equal(dismissed, 1);
    assert.equal(syncFeedPhone(host, feed, ctx), null);
    const other = syncFeedPhone(host, { ...feed, platform: 'tieba' }, ctx);
    assert.ok(other && other !== state);
});
