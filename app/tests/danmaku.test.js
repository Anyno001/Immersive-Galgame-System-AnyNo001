import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { normalizeDanmakuSettings, pickInnerMood } from '../src/visual/igs-ui/danmaku-settings.js';
import { resolveDanmakuPromptRule } from '../src/visual/igs-ui/danmaku-prompt.js';
import { applyDanmakuToDom, cancelDanmaku, createDanmakuMemory, layoutInnerFlight, layoutInnerWords, planDanmakuPage } from '../src/visual/igs-ui/danmaku-runtime.js';
import { LIVE_LIST_LIMIT, formatPopularity, guardLevelOf, scColorOf } from '../src/visual/igs-ui/danmaku-live.js';
import { AUDIENCE_LOG_LIMIT, appendAudienceLog, formatDanmakuTime } from '../src/visual/igs-ui/danmaku-audience.js';
import { pickScrollTrack } from '../src/visual/igs-ui/danmaku-lanes.js';
import { thoughtFragments } from '../src/visual/igs-ui/danmaku-pools.js';
import { getOriginalReaderSource } from '../src/visual/igs-ui/original-reader-source.js';
import { applyPerformancePreset, detectPerformancePreset } from '../src/visual/igs-ui/performance-presets.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { FX_SETTINGS_NORMALIZERS, FX_WORD_LIST_PATHS } from '../src/visual/igs-ui/fx-settings.js';

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
    get nextSibling() {
        const list = this.parentNode ? this.parentNode.children : [];
        return list[list.indexOf(this) + 1] || null;
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
    dispatch(name) {
        const event = { stopped: false, stopPropagation() { this.stopped = true; } };
        for (const fn of this.listeners[name] || []) fn(event);
        return event;
    }
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
    const api = {
        queue,
        schedule(fn, ms) { const timer = { fn, due: t + ms }; queue.push(timer); return timer; },
        clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); },
        now: () => t,
        // 推进时间并按到期先后执行，期间新排的计时器到期也会执行。
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
    return api;
}

const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };

function snapshot(content, readerSettings, messageId = 7) {
    return {
        messageId,
        content: { currentIndex: 0, displayText: '台词', textType: 'dialogue', speaker: '爱丽丝', ...content },
        readerSettings,
    };
}

function fxFor(source, pageText) {
    return resolveFxAtPage(extractFxDirectives(source), source.indexOf(pageText), -1);
}

test('gate:danmaku:parse-live-dm-danmaku-and-reject-bad-args', () => {
    assert.deepEqual(parseFxBody('live|爱丽丝|深夜杂谈|主播'), { kind: 'live', end: false, args: ['爱丽丝', '深夜杂谈', 'host'] });
    assert.deepEqual(parseFxBody('live|爱丽丝'), { kind: 'live', end: false, args: ['爱丽丝', '', 'watch'] });
    assert.deepEqual(parseFxBody('live-end'), { kind: 'live', end: true, args: [] });
    assert.equal(parseFxBody('live'), null);
    assert.deepEqual(parseFxBody('dm|路人|好可爱'), { kind: 'dm', end: false, args: ['路人', '好可爱', 'text', ''] });
    assert.deepEqual(parseFxBody('dm|土豪|冲|醒目留言|100'), { kind: 'dm', end: false, args: ['土豪', '冲', 'sc', '100'] });
    assert.deepEqual(parseFxBody('dm|老板||上舰|提督'), { kind: 'dm', end: false, args: ['老板', '', 'guard', '提督'] });
    assert.deepEqual(parseFxBody('dm|路人||进场'), { kind: 'dm', end: false, args: ['路人', '', 'enter', ''] });
    assert.equal(parseFxBody('dm|路人'), null);
    assert.equal(parseFxBody('dm-end'), null);
    assert.deepEqual(parseFxBody('dm|甲|哈|乱写'), { kind: 'dm', end: false, args: ['甲', '哈', 'text', ''] });
    assert.deepEqual(parseFxBody('danmaku|前方高能/ 别过去 /|TOP'), { kind: 'danmaku', end: false, args: ['前方高能/别过去', 'top'] });
    assert.deepEqual(parseFxBody('danmaku|awsl|glow'), { kind: 'danmaku', end: false, args: ['awsl', 'scroll'] });
    assert.equal(parseFxBody('danmaku| / '), null);
});

test('gate:danmaku:multi-instants-per-page-with-caps-and-live-range', () => {
    const dms = Array.from({ length: 15 }, (_, i) => `[igs-fx:dm|观众${i}|第${i}条]`).join('\n');
    const source = `[igs-fx:live|爱丽丝|杂谈]\n${dms}\n[igs-fx:danmaku|甲/乙]\n[igs-fx:danmaku|丙]\n[igs-fx:sfx|砰]\n[igs-fx:sfx|咚]\n第一页\n[igs-fx:live-end]\n第二页`;
    const first = fxFor(source, '第一页');
    assert.equal(first.dms.length, 12);
    assert.equal(first.dms[0].type, 'text');
    assert.deepEqual(first.danmaku.map((i) => i.lines), [['甲', '乙'], ['丙']]);
    assert.deepEqual(first.instants.map((i) => i.kind), ['sfx']);
    assert.deepEqual(first.live, { name: '爱丽丝', title: '杂谈', view: 'watch' });
    const second = resolveFxAtPage(extractFxDirectives(source), source.indexOf('第二页'), source.indexOf('第一页'));
    assert.equal(second.live, null);
    assert.equal(stripMarkerDirectives(source).includes('igs-fx'), false);
});

test('gate:danmaku:settings-default-off-and-prompt-only-for-enabled', () => {
    const s = normalizeDanmakuSettings(null);
    assert.equal(s.live.enabled || s.audience.enabled || s.inner.enabled, false);
    assert.equal(s.audience.persona, 'melon');
    assert.equal(s.live.muteOnNsfw && s.audience.muteOnNsfw, true);
    for (const key of ['liveFx', 'audienceFx', 'innerFx']) assert.equal(typeof FX_SETTINGS_NORMALIZERS[key], 'function', key);
    assert.ok(FX_WORD_LIST_PATHS.includes('innerFx.love'));
    assert.equal(resolveDanmakuPromptRule(null), '');
    assert.equal(resolveDanmakuPromptRule({ innerFx: { enabled: true } }), '');
    const live = resolveDanmakuPromptRule({ liveFx: { enabled: true } });
    assert.match(live, /\[igs-fx:live\|主播名\|直播间标题\|视角\] … \[igs-fx:live-end\]/);
    assert.match(live, /\[igs-fx:dm\|观众名\|弹幕内容\]/);
    assert.doesNotMatch(live, /igs-fx:danmaku/);
    const audience = resolveDanmakuPromptRule({ audienceFx: { enabled: true, persona: 'custom', customPersona: '侦探迷' } });
    assert.match(audience, /\[igs-fx:danmaku\|弹幕1\/弹幕2\|样式\]：屏幕外观众（侦探迷）/);
    assert.equal(pickInnerMood('害羞', { ...s.inner, enabled: true }), 'love');
    assert.equal(pickInnerMood('害羞', s.inner), '');
});

test('gate:danmaku:plan-inner-once-audience-ambient-and-nsfw-mute', () => {
    const memory = createDanmakuMemory();
    const settings = normalizeDanmakuSettings({ innerFx: { enabled: true }, audienceFx: { enabled: true, density: 'medium' }, liveFx: { enabled: true } });
    const fx = { danmaku: [{ lines: ['好甜'], style: 'scroll' }], dms: [{ user: '甲', text: '来了', type: 'text', extra: '' }], live: null };
    const plan = planDanmakuPage(snapshot({ statusEmotion: '害羞', fx }), memory, settings, () => 0.5);
    assert.equal(plan.inner.mood, 'love');
    assert.equal(plan.audience[0].ai, true);
    assert.equal(plan.audience[1].ai, false);
    assert.equal(plan.audience[1].lines.length, 3);
    assert.deepEqual(plan.dms, [], 'dm outside a live range is ignored');
    assert.equal(plan.audienceVisible, true);
    const again = planDanmakuPage(snapshot({ statusEmotion: '害羞', fx }), memory, settings, () => 0.5);
    assert.equal(again.inner, null);
    assert.deepEqual(again.audience, []);
    const nsfw = planDanmakuPage(snapshot({ currentIndex: 2, sceneNsfw: true, fx: { ...fx, live: { name: '甲', title: '', view: 'watch' } } }), memory, settings, () => 0.5);
    assert.equal(nsfw.live, null);
    assert.deepEqual(nsfw.audience, []);
    assert.equal(nsfw.audienceVisible, false);
    const thought = planDanmakuPage(snapshot({ currentIndex: 3, textType: 'thought', statusEmotion: '慌张', text: '怎么会这样，他居然全都听见了！' }), memory, settings, () => 0.9);
    assert.deepEqual(thought.inner.real, ['怎么会这样', '他居然全都听见了']);
    const realHits = thought.inner.phrases.filter((p) => thought.inner.real.includes(p)).length;
    assert.ok(realHits / thought.inner.phrases.length >= 0.55 && realHits < thought.inner.phrases.length, 'real thoughts take the majority, pool fills the rest');
    const paren = planDanmakuPage(snapshot({ currentIndex: 7, textType: 'dialogue', statusEmotion: '慌张', text: '没事。（糟了，被发现了）' }), memory, settings, () => 0.5);
    assert.ok(paren.inner.real.includes('被发现了'));
    const plain = planDanmakuPage(snapshot({ currentIndex: 8, textType: 'dialogue', statusEmotion: '慌张', text: '没事。' }), memory, settings, () => 0.5);
    assert.deepEqual(plain.inner.real, []);
    const live = planDanmakuPage(snapshot({ currentIndex: 4, fx: { ...fx, live: { name: '甲', title: '', view: 'watch' } } }), memory, settings, () => 0.9);
    assert.equal(live.dms.length, 1);
    assert.equal(live.audienceVisible, false, 'audience entry yields to the live phone');
    const dream = planDanmakuPage(snapshot({ currentIndex: 5, fx: { dream: true, live: { name: '甲', title: '', view: 'watch' } } }), memory, settings, () => 0.9);
    assert.equal(dream.liveVisible, false, 'phone is put away inside a dream');
    const unmuted = normalizeDanmakuSettings({ audienceFx: { enabled: true, muteOnNsfw: false } });
    assert.equal(planDanmakuPage(snapshot({ currentIndex: 6, sceneNsfw: true }), memory, unmuted, () => 0.9).audienceVisible, true);
});

test('gate:danmaku:all-off-costs-nothing', () => {
    const { root, motion } = makeRoot();
    const result = applyDanmakuToDom(root, snapshot({}, { fxTags: { enabled: true } }));
    assert.deepEqual(result, { live: false, audience: 0, inner: false });
    assert.equal(motion.querySelector('#igs-fx-stage'), null);
    assert.equal(cancelDanmaku(root), false);
});

test('gate:danmaku:live-phone-raises-plays-ai-first-and-caps-list', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    // rng 固定高值（≥0.55）：本测验只验证 AI 弹幕按序播放 + 特殊弹幕渲染，不让本地弹幕插播（交错混播另有专测）。
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false };
    const live = { name: '爱丽丝', title: '深夜杂谈', view: 'watch' };
    const dm = (text, type = 'text', extra = '') => ({ user: '甲', text, type, extra });
    const fx = { dms: [dm('第一条'), dm('冲', 'sc', '520'), dm('辣条', 'gift', '×10'), dm('', 'guard', '总督')], live };
    const result = applyDanmakuToDom(root, snapshot({ fx }, { liveFx: { enabled: true } }), opts);
    assert.equal(result.live, true);
    const stage = motion.querySelector('.igs-live-stage');
    const phone = stage.querySelector('.igs-live-phone');
    assert.equal(phone.getAttribute('data-view'), 'watch');
    assert.equal(phone.querySelector('.igs-live-rankcard'), null, 'phone layout unchanged');
    assert.equal(phone.style.get('--igs-live-h'), '648px', 'capped at 90% of the stage');
    c.run(4 * 950);
    const list = phone.querySelector('.igs-live-list');
    assert.deepEqual(list.children.slice(0, 4).map((n) => n.getAttribute('data-type')), ['text', 'sc', 'gift', 'guard']);
    assert.equal(list.children[0].getAttribute('data-ai'), '1');
    assert.equal(phone.querySelector('.igs-live-sc-card').style.get('--igs-live-sc'), scColorOf(520).color);
    assert.match(phone.querySelector('.igs-live-guard-banner').textContent, /总督/);
    c.run(120000);
    assert.ok(list.children.length <= LIVE_LIST_LIMIT);
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { live: null } }, { liveFx: { enabled: true } }), opts);
    assert.equal(stage.getAttribute('data-leaving'), '1');
    c.run(500);
    assert.equal(stage.parentNode, null);
    assert.equal(cancelDanmaku(root), true);
    assert.equal(motion.querySelector('.igs-dm-root'), null);
});

test('gate:danmaku:live-phone-interleaves-local-danmaku-while-ai-queued', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    // rng 可调：先锁 0.5（＜0.55，队列有 AI 时也插本地），再抬到 0.9 让 AI 排出。
    let r = 0.5;
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: () => r, reducedMotion: false };
    const live = { name: '爱丽丝', title: '深夜杂谈', view: 'watch' };
    const fx = { dms: [{ user: '甲', text: '第一条', type: 'text', extra: '' }, { user: '甲', text: '第二条', type: 'text', extra: '' }], live };
    applyDanmakuToDom(root, snapshot({ fx }, { liveFx: { enabled: true } }), opts);
    const phone = motion.querySelector('.igs-live-phone');
    const list = phone.querySelector('.igs-live-list');
    c.run(3000);
    // AI 弹幕还排着队，本地闲聊已经先冒出来——不是先把 AI 一股脑排空。
    assert.ok(list.children.length > 0, '本地弹幕已插播');
    assert.equal(list.children.filter((n) => n.getAttribute('data-ai') === '1').length, 0, 'AI 弹幕没有抢在本地前面');
    assert.equal(list.children.some((n) => n.textContent.includes('第一条')), false);
    r = 0.9;
    c.run(5000);
    // 抬高 rng 后 AI 两条都排出，按原顺序。
    const aiTexts = list.children.filter((n) => n.getAttribute('data-ai') === '1').map((n) => n.textContent);
    assert.ok(aiTexts.some((t) => t.includes('第一条')) && aiTexts.some((t) => t.includes('第二条')), 'AI 弹幕最终都播出');
    assert.ok(aiTexts.findIndex((t) => t.includes('第一条')) < aiTexts.findIndex((t) => t.includes('第二条')), 'AI 弹幕保持原顺序');
});

test('gate:danmaku:live-helpers', () => {
    const defaults = normalizeDanmakuSettings(null).live;
    assert.equal(defaults.layout, 'phone', 'old settings keep the phone');
    assert.equal(defaults.chat, 'roll');
    assert.equal(formatPopularity(12345), '1.2万');
    assert.equal(formatPopularity(20000), '2万');
    assert.equal(formatPopularity(876), '876');
    assert.equal(scColorOf('30').color, '#2a60b2');
    assert.equal(scColorOf('￥1000').color, '#e54d4d');
    assert.equal(scColorOf('').amount, 30);
    assert.equal(guardLevelOf('提督'), '提督');
    assert.equal(guardLevelOf(''), '舰长');
});

test('gate:danmaku:live-full-screen-layout-and-fly-chat', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false };
    const live = { name: '爱丽丝', title: '深夜杂谈', view: 'watch' };
    const fx = { dms: [{ user: '甲', text: '全屏好爽', type: 'text', extra: '' }], live };
    applyDanmakuToDom(root, snapshot({ fx }, { liveFx: { enabled: true, layout: 'full', chat: 'fly' } }), opts);
    const stage = motion.querySelector('.igs-live-stage');
    assert.equal(stage.getAttribute('data-layout'), 'full');
    assert.equal(stage.getAttribute('data-chat'), 'fly');
    const phone = stage.querySelector('.igs-live-phone');
    assert.equal(phone.querySelector('.igs-phone-status'), null, 'no phone status bar in full screen');
    assert.equal(phone.querySelectorAll('.igs-live-rank').length, 0, 'header trimmed: no top-3 ranking avatars');
    assert.ok(phone.querySelector('.igs-live-chips'), 'hot / popularity chips');
    assert.ok(phone.querySelector('.igs-live-rankcard'), 'ranking card bottom right');
    c.run(1000);
    const flyer = phone.querySelector('.igs-live-flyer');
    assert.ok(flyer, 'AI chat flies across');
    assert.equal(flyer.getAttribute('data-ai'), '1');
    assert.equal(flyer.textContent, '全屏好爽');
    assert.equal(phone.querySelector('.igs-live-list').children.length, 0, 'roll list stays empty in fly mode');
    c.run(60000);
    assert.ok(phone.querySelector('.igs-live-fly').children.length <= 18);
    const reduced = applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { live } }, { liveFx: { enabled: true, layout: 'full', chat: 'fly' } }), { ...opts, reducedMotion: true });
    assert.equal(reduced.live, true);
    assert.equal(stage.getAttribute('data-chat'), 'roll', 'reduced motion falls back to the roll list');
    c.run(8000);
    const rolled = phone.querySelector('.igs-live-list').children.filter((n) => n.getAttribute('data-type') === 'text');
    assert.ok(rolled.length > 0 && rolled[0].querySelector('.igs-live-lv'), 'full-screen chat lines carry a fan level badge');
    cancelDanmaku(root);
});

test('gate:danmaku:live-host-auto-view-say-both-and-theme', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false, userName: '小林' };
    const settings = { liveFx: { enabled: true, chat: 'both', followTheme: true }, dialogSkin: 'cute-pink' };
    applyDanmakuToDom(root, snapshot({ speaker: '小林', displayText: '大家晚上好', fx: { live: { name: '小林', title: '开播', view: 'watch' } } }, settings), opts);
    const stage = motion.querySelector('.igs-live-stage');
    const phone = stage.querySelector('.igs-live-phone');
    assert.equal(phone.getAttribute('data-view'), 'host', 'streamer named after the user switches to host view');
    assert.equal(stage.getAttribute('data-chat'), 'both');
    assert.equal(stage.getAttribute('data-theme'), 'cute-pink');
    c.run(1000);
    const hostLine = phone.querySelector('.igs-live-list').children.find((n) => n.getAttribute('data-type') === 'host');
    assert.ok(hostLine, 'host words show in the roll list');
    assert.match(hostLine.textContent, /主播/);
    assert.match(hostLine.textContent, /大家晚上好/);
    assert.ok(phone.querySelectorAll('.igs-live-flyer').some((n) => n.classList.contains('is-host')), 'both mode also flies the host line');
    cancelDanmaku(root);
    const other = makeRoot();
    applyDanmakuToDom(other.root, snapshot({ fx: { live: { name: '爱丽丝', title: '', view: 'watch' } } }, settings), opts);
    assert.equal(other.motion.querySelector('.igs-live-phone').getAttribute('data-view'), 'watch', 'other streamers keep the watch view');
    cancelDanmaku(other.root);
});

test('gate:danmaku:audience-entry-follows-hud-only-while-hud-covers-its-corner', () => {
    const { root, motion, doc } = makeRoot();
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false };
    const settings = { audienceFx: { enabled: true, ambient: false } };
    motion.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 });
    const hud = root.appendChild(new FakeNode(doc, 'div'));
    hud.id = 'igs-status-hud';
    let rect = { left: 14, top: 14, width: 121, height: 59 };
    hud.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height });
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx: { danmaku: [{ lines: ['好甜'], style: 'scroll' }] } }, settings), opts);
    const entry = motion.querySelector('.igs-aud-entry');
    assert.equal(entry.style.get('--igs-aud-top'), '81px', '状态栏在左上角时入口贴它下缘');
    rect = { left: 1145, top: 14, width: 121, height: 59 };
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: { danmaku: [{ lines: ['锁死'], style: 'scroll' }] } }, settings), opts);
    assert.equal(entry.style.get('--igs-aud-top'), '14px', '状态栏挪到右上角后入口留在左上角');
    rect = { left: 14, top: 330, width: 121, height: 59 };
    applyDanmakuToDom(root, snapshot({ currentIndex: 3, fx: { danmaku: [{ lines: ['awsl'], style: 'scroll' }] } }, settings), opts);
    assert.equal(entry.style.get('--igs-aud-top'), '14px', '挪到左侧中间时不再把入口拽下去');
    cancelDanmaku(root);
});

test('gate:danmaku:audience-entry-badge-open-close-and-floor-reset', () => {
    const { root, motion } = makeRoot();
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.9, reducedMotion: false };
    const settings = { audienceFx: { enabled: true, ambient: false } };
    applyDanmakuToDom(root, snapshot({}, settings), opts);
    const entry = motion.querySelector('.igs-aud-entry');
    assert.equal(entry.hidden, true, 'no comments yet, no entry');
    const fx = { danmaku: [{ lines: ['好甜', '锁死'], style: 'scroll' }] };
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx }, settings), opts);
    assert.equal(entry.hidden, false);
    assert.equal(entry.querySelector('.igs-aud-badge').textContent, '2');
    assert.equal(entry.getAttribute('data-pulse'), '1');
    assert.equal(entry.style.get('--igs-aud-top'), '14px');
    assert.equal(entry.dispatch('click').stopped, true);
    const viewer = motion.querySelector('.igs-aud-stage');
    assert.ok(viewer);
    assert.equal(viewer.querySelectorAll('.igs-aud-row').length, 2);
    assert.equal(entry.querySelector('.igs-aud-badge').hidden, true);
    const more = { danmaku: [{ lines: ['前方高能'], style: 'top' }] };
    applyDanmakuToDom(root, snapshot({ currentIndex: 2, fx: more }, settings), opts);
    assert.equal(viewer.querySelectorAll('.igs-aud-row').length, 3);
    viewer.querySelector('.igs-aud-back').dispatch('click');
    assert.equal(viewer.getAttribute('data-leaving'), '1');
    c.run(500);
    assert.equal(viewer.parentNode, null);
    applyDanmakuToDom(root, snapshot({ currentIndex: 0 }, settings, 8), opts);
    assert.equal(entry.hidden, true, 'new floor starts empty');
    cancelDanmaku(root);
    assert.equal(motion.querySelector('.igs-dm-front'), null);
});

test('gate:danmaku:audience-log-and-track-helpers', () => {
    const log = new Map();
    const big = [{ lines: Array.from({ length: AUDIENCE_LOG_LIMIT + 20 }, (_, i) => `#${i}`), ai: false, style: 'scroll' }];
    appendAudienceLog(log, 1, 0, big);
    assert.equal(log.get('1').length, AUDIENCE_LOG_LIMIT);
    for (let id = 2; id <= 6; id += 1) appendAudienceLog(log, id, 0, [{ lines: ['x'], ai: true, style: 'scroll' }]);
    assert.equal(log.size, 4);
    assert.equal(formatDanmakuTime(9), '01:12');
    const tracks = [{ freeAt: 500, exitAt: 8000 }];
    assert.equal(pickScrollTrack(tracks, 2, 100, 100, 1000, 7000), 1, 'busy lane skipped');
    assert.equal(pickScrollTrack(tracks, 1, 100, 100, 1000, 7000), -1);
    assert.equal(pickScrollTrack([{ freeAt: 500, exitAt: 6500 }], 1, 600, 100, 1000, 7000), 0);
    assert.equal(pickScrollTrack([{ freeAt: 500, exitAt: 9000 }], 1, 600, 400, 1000, 7000), -1, 'faster long line would rear-end');
});

test('gate:danmaku:inner-words-stay-on-stage-and-ramp-up', () => {
    const anchor = { stageW: 1280, stageH: 720, cx: 640, cy: 250, rx: 300, ry: 140, floor: 480 };
    const words = layoutInnerWords(anchor, ['好喜欢', '心跳好快'], 16, seq([0.1, 0.7, 0.4]));
    assert.equal(words.length, 16);
    for (const w of words) {
        assert.ok(w.x >= 0 && w.x <= 1280 && w.y >= 0 && w.y <= 480, JSON.stringify(w));
        assert.ok(w.delay < 2600);
    }
    assert.ok(words[15].scale > words[0].scale);
    assert.deepEqual(thoughtFragments('啊……！'), []);
});

test('gate:danmaku:inner-fly-style-defaults-burst-and-lanes-stay-above-dialog', () => {
    assert.equal(normalizeDanmakuSettings(null).inner.style, 'burst', 'old settings keep the burst style');
    assert.equal(normalizeDanmakuSettings({ innerFx: { style: 'fly' } }).inner.style, 'fly');
    assert.equal(normalizeDanmakuSettings({ innerFx: { style: '乱写' } }).inner.style, 'burst');
    const anchor = { stageW: 1280, stageH: 720, cx: 640, cy: 250, rx: 300, ry: 140, floor: 480 };
    const words = layoutInnerFlight(anchor, ['好喜欢', '心跳好快'], 16, 24, seq([0.1, 0.7, 0.4]));
    assert.ok(words.length >= 8 && words.length <= 16, String(words.length));
    const lanes = new Map();
    for (const w of words) {
        assert.ok(w.y >= 0 && w.y + 24 <= anchor.floor, JSON.stringify(w));
        assert.ok(w.run <= -1280, 'flies fully across the stage');
        if (!lanes.has(w.y)) lanes.set(w.y, []);
        lanes.get(w.y).push(w);
    }
    assert.ok(lanes.size >= 2, 'spread over several lanes');
    for (const list of lanes.values()) {
        for (let i = 1; i < list.length; i += 1) assert.ok(list[i].delay > list[i - 1].delay, 'same lane launches in order');
    }
});

test('gate:danmaku:style-wired-and-phone-ui-has-no-emoji', () => {
    const source = getOriginalReaderSource('test');
    const css = JSON.stringify(source);
    for (const selector of ['.igs-live-phone', '.igs-aud-entry', '.igs-dm-word']) assert.ok(css.includes(selector), selector);
    const dir = path.resolve(import.meta.dirname, '../src/visual/igs-ui');
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
    for (const name of fs.readdirSync(dir).filter((f) => f.startsWith('danmaku-'))) {
        assert.doesNotMatch(fs.readFileSync(path.join(dir, name), 'utf8'), emoji, name);
    }
});

test('gate:danmaku:presets-era-and-adaptive-grammar', () => {
    const reader = {};
    applyPerformancePreset(reader, 'standard');
    assert.equal(reader.liveFx.enabled || reader.audienceFx.enabled || reader.innerFx.enabled, false, 'danmaku only in the full tier');
    assert.equal(detectPerformancePreset(reader), 'standard');
    applyPerformancePreset(reader, 'full');
    assert.equal(reader.liveFx.enabled && reader.audienceFx.enabled && reader.innerFx.enabled, true);
    const ancient = applyFxEra({ liveFx: { enabled: true }, audienceFx: { enabled: true } }, true);
    assert.equal(ancient.liveFx.enabled, false, 'no live streams in ancient settings');
    assert.equal(ancient.audienceFx.enabled, true);
    assert.ok(detectPromptTriggers({ userText: '今晚她要开播' }).has('live'));
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:live|甲|杂谈]\n还没结束'] }).has('live'), 'unclosed live keeps grammar');
    assert.equal(detectPromptTriggers({ recentAiTexts: ['[igs-fx:live|甲]', '[igs-fx:live-end]', '', '', ''] }).has('live'), false);
    const rs = { liveFx: { enabled: true }, audienceFx: { enabled: true } };
    const idle = buildTagGrammar({ readerSettings: rs });
    assert.match(idle.system, /观众弹幕/);
    assert.match(idle.system, /【按需】.*直播/);
    assert.doesNotMatch(idle.depth0, /直播间/);
    const hot = buildTagGrammar({ readerSettings: rs, expand: new Set(['live']) });
    assert.match(hot.depth0, /【直播间】/);
});

test('gate:danmaku:live-interact-switch-view-and-digest', async () => {
    const { buildLiveDigestRule, summarizeLiveEvents } = await import('../src/visual/igs-ui/danmaku-interact.js');
    const { clearMetaDigest, pendingMetaEvents } = await import('../src/visual/igs-ui/meta-digest.js');
    clearMetaDigest();
    const { root, motion } = makeRoot();
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9, 0.1, 0.5]), reducedMotion: false, userName: '小明' };
    const fx = { live: { name: '爱丽丝', title: '深夜杂谈', view: 'watch' } };
    applyDanmakuToDom(root, snapshot({ fx }, { liveFx: { enabled: true } }), opts);
    const ctl = motion.querySelector('.igs-live-ctl');
    assert.ok(ctl, 'interact shell on front layer');
    const gift = ctl.querySelectorAll('.igs-live-ctl-gift')[0];
    for (const fn of ctl.listeners.click) fn({ target: { closest: () => gift }, stopPropagation() {} });
    for (const fn of ctl.listeners.click) fn({ target: { closest: () => gift }, stopPropagation() {} });
    const like = ctl.querySelector('.igs-live-ctl-btn');
    assert.ok(like);
    c.run(2000);
    const list = motion.querySelector('.igs-live-list');
    assert.ok(list.children.some((n) => n.getAttribute('data-type') === 'gift'), 'my gift shows in the phone');
    const digest = summarizeLiveEvents(pendingMetaEvents());
    assert.match(digest, /爱丽丝/);
    assert.match(digest, /小心心×2/);
    assert.match(buildLiveDigestRule(digest), /^\[igs直播间\]/);
    // 视角切换：点「主播」换成主播后台。
    assert.equal(motion.querySelector('.igs-live-switch'), null, 'phone layout has no loose switch on the front layer');
    const viewBtn = motion.querySelector('.igs-live-view');
    assert.ok(viewBtn, 'view switch is an icon in the phone top bar');
    assert.equal(viewBtn.getAttribute('data-view'), 'host');
    assert.equal(viewBtn.title, '切换到主播视角');
    assert.equal(viewBtn.textContent, '');
    for (const fn of viewBtn.listeners.click) fn({ stopPropagation() {} });
    c.run(600);
    assert.equal(motion.querySelector('.igs-live-phone').getAttribute('data-view'), 'host');
    assert.equal(motion.querySelector('.igs-live-ctl').getAttribute('data-view'), 'host');
    // 翻页后保持所选视角。
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx }, { liveFx: { enabled: true } }), opts);
    assert.equal(motion.querySelector('.igs-live-phone').getAttribute('data-view'), 'host');
    clearMetaDigest();
    cancelDanmaku(root);
    assert.equal(motion.querySelector('.igs-live-ctl'), null);
});

test('gate:danmaku:live-portrait-edit-saves-frame', async () => {
    const { enterLivePortraitEdit } = await import('../src/visual/igs-ui/danmaku-live.js');
    const { root, motion, doc } = makeRoot();
    doc.createElement = (tag) => new FakeNode(doc, tag);
    root.ownerDocument = doc;
    const c = clock();
    const saved = [];
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9]), reducedMotion: false, sprite: { url: 'a.png' }, onLivePortraitMove: (liveFx) => saved.push(liveFx) };
    const settings = { liveFx: { enabled: true, portrait: { x: 10, y: -5, zoom: 120 } } };
    applyDanmakuToDom(root, snapshot({ fx: { live: { name: '爱丽丝', title: 't', view: 'watch' } } }, settings), opts);
    const portrait = motion.querySelector('.igs-live-portrait');
    assert.equal(portrait.style.get('--igs-lp-x'), '10%');
    assert.equal(portrait.style.get('--igs-lp-z'), '1.2');
    assert.equal(enterLivePortraitEdit(root), true);
    const bar = root.children.find((n) => n.id === 'igs-sprite-edit-bar');
    assert.ok(bar);
    const save = { dataset: { se: 'save' } };
    for (const fn of bar.listeners.click) fn({ target: { closest: () => save }, stopPropagation() {} });
    assert.deepEqual(saved[0].portrait, { x: 10, y: -5, zoom: 120, face: null });
    assert.equal(saved[0].enabled, true);
    cancelDanmaku(root);
});

test('gate:danmaku:live-close-restores-stage-sprite-and-removes-front-buttons', () => {
    const { root, motion } = makeRoot();
    root.id = 'igs-overlay';
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9, 0.1, 0.5]), reducedMotion: false, userName: '小明' };
    const fx = { live: { name: '爱丽丝', title: '深夜杂谈', view: 'watch' } };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx }, { liveFx: { enabled: true, interact: true } }), opts);
    assert.equal(root.getAttribute('data-igs-stage-covered'), '1');
    assert.equal(root.getAttribute('data-igs-live-host'), '爱丽丝');
    const close = motion.querySelector('.igs-live-close');
    assert.ok(close);
    for (const fn of close.listeners.click) fn({ stopPropagation() {} });
    assert.equal(root.getAttribute('data-igs-stage-covered'), null, 'sprite comes back right away');
    assert.equal(root.getAttribute('data-igs-live-host'), null);
    assert.equal(motion.querySelector('.igs-live-ctl'), null, 'front buttons are gone too');
    // 同一场直播翻页后仍然收着。
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx }, { liveFx: { enabled: true, interact: true } }), opts);
    assert.equal(root.getAttribute('data-igs-stage-covered'), null);
    cancelDanmaku(root);
});

test('gate:stage-pause:host-bubbles-hidden-only-while-host-sprite-is-covered', async () => {
    const { isLiveHostCovered } = await import('../src/visual/igs-ui/stage-pause.js');
    const { root } = makeRoot();
    assert.equal(isLiveHostCovered(root, '爱丽丝'), false);
    root.setAttribute('data-igs-stage-covered', '1');
    root.setAttribute('data-igs-live-host', '爱丽丝');
    assert.equal(isLiveHostCovered(root, '爱丽丝'), true);
    assert.equal(isLiveHostCovered(root, '鲍勃'), false, 'other characters keep their bubbles');
    root.removeAttribute('data-igs-stage-covered');
    assert.equal(isLiveHostCovered(root, '爱丽丝'), false, 'full layout or dismissed phone shows them again');
});

test('gate:danmaku:live-full-marks-stage-and-clears-on-dismiss', () => {
    const { root, motion } = makeRoot();
    root.id = 'igs-overlay';
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9, 0.1, 0.5]), reducedMotion: false, userName: '小明' };
    const fx = { live: { name: '爱丽丝', title: '深夜杂谈', view: 'watch' } };
    const rs = { liveFx: { enabled: true, layout: 'full' } };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx, speaker: '爱丽丝' }, rs), opts);
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    assert.equal(root.getAttribute('data-igs-live-sub'), 'host');
    applyDanmakuToDom(root, snapshot({ currentIndex: 1, fx, speaker: '鲍勃' }, rs), opts);
    assert.equal(root.getAttribute('data-igs-live-sub'), 'other');
    // 直播收起：标记立刻清掉，对话框和状态栏恢复。
    const close = motion.querySelector('.igs-live-close');
    for (const fn of close.listeners.click) fn({ stopPropagation() {} });
    assert.equal(root.getAttribute('data-igs-live-full'), null);
    cancelDanmaku(root);
    assert.equal(root.getAttribute('data-igs-live-full'), null);
});

test('gate:danmaku:live-phone-layout-never-marks-full', () => {
    const { root } = makeRoot();
    root.id = 'igs-overlay';
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9, 0.1, 0.5]), reducedMotion: false, userName: '小明' };
    const fx = { live: { name: '爱丽丝', title: '深夜杂谈', view: 'watch' } };
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx }, { liveFx: { enabled: true, layout: 'phone' } }), opts);
    assert.equal(root.getAttribute('data-igs-live-full'), null);
    cancelDanmaku(root);
});

test('gate:danmaku:live-phone-form-lays-out-above-dialog-and-never-uses-full-rules', async () => {
    const { fitLivePhone, syncLivePhone, phoneGeometry } = await import('../src/visual/igs-ui/danmaku-live.js');
    const { root, motion, doc } = makeRoot();
    root.id = 'igs-overlay';
    const host = doc.createElement('div');
    motion.appendChild(host);
    const c = clock();
    const live = { name: '爱丽丝', title: '夜聊', view: 'watch' };
    syncLivePhone(host, live, { doc, schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.5, reduced: true, layout: 'phone', visible: true, look: { model: 'full', size: 'fit' } });
    const stage = { stageW: 390, stageH: 760, dialogTop: 470, topInset: 40 };
    const fit = fitLivePhone(host, stage);
    const geo = phoneGeometry(stage, 'full', 'fit');
    const phone = host.querySelector('.igs-live-phone');
    assert.equal(fit.layout, 'phone');
    // 沉入量不超过 38%，底栏与评论抬到对话框之上，按可见区（高减沉入）摆放。
    assert.ok(geo.under <= geo.height * 0.38 + 1);
    assert.equal(phone.style.get('--igs-live-under'), `${geo.under}px`);
    assert.equal(phone.style.get('--igs-live-vis'), `${geo.height - geo.under}px`);
    assert.ok(geo.top + geo.height - geo.under <= stage.dialogTop + 1, 'visible area ends at the dialog top');
    // 手机形态不带任何全屏标记 / 名牌变量。
    assert.equal(root.getAttribute('data-igs-live-full'), null);
    assert.equal(phone.style.get('--igs-live-name-top'), undefined);
    assert.equal(phone.getAttribute('data-sub'), null);
    // 横飞范围在手机可见区之内。
    assert.ok(geo.height - geo.under - 70 > 120);
});

test('gate:danmaku:live-list-limits-and-entry-placement-avoid-phone', async () => {
    const { liveListLimit } = await import('../src/visual/igs-ui/danmaku-live.js');
    const { entryPlacement } = await import('../src/visual/igs-ui/danmaku-runtime.js');
    assert.equal(liveListLimit('phone', 'watch'), 5);
    assert.equal(liveListLimit('phone', 'host'), 7);
    assert.equal(liveListLimit('full', 'host'), 5);
    // 手机形态：入口收进手机顶栏，不在手机外另找位置；全屏：名牌右边 8px、与名牌同一行垂直居中；量不到名牌退回工具栏下方。
    assert.deepEqual(entryPlacement({ stageW: 390 }, { layout: 'phone', width: 350, top: 48 }, 14), { left: 14, top: 14 });
    assert.deepEqual(entryPlacement({ stageW: 1280, topInset: 40 }, { layout: 'full', floor: 100 }, 20, { right: 200, cy: 60 }), { left: 14, top: 82 });
    assert.deepEqual(entryPlacement({ stageW: 1280, topInset: 40 }, { layout: 'full', floor: 100 }, 20, null), { left: 14, top: 82 });
    assert.deepEqual(entryPlacement({ stageW: 1280 }, null, 14), { left: 14, top: 14 });
});

test('gate:danmaku:live-full-click-turns-page-and-entry-docks-into-phone-top-bar', async () => {
    const { dockAudienceEntry } = await import('../src/visual/igs-ui/danmaku-audience.js');
    const { root, motion } = makeRoot();
    root.id = 'igs-overlay';
    const c = clock();
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9, 0.1, 0.5]), reducedMotion: false, userName: '小明' };
    const fx = { live: { name: '爱丽丝', title: '深夜杂谈', view: 'watch' } };
    // 全屏：根节点上没有拦点击的焦点类；头部没有「直播中 / LIVE」徽标与标题行。
    applyDanmakuToDom(root, snapshot({ currentIndex: 0, fx }, { liveFx: { enabled: true, layout: 'full' } }), opts);
    assert.equal(root.classList.contains('igs-phone-focus'), false);
    assert.equal(motion.querySelector('.igs-live-title'), null);
    assert.equal(motion.querySelector('.igs-live-badge'), null);
    cancelDanmaku(root);
    // 没有观众弹幕入口时停靠是空操作。
    assert.doesNotThrow(() => dockAudienceEntry({}, null, null));
});

test('gate:danmaku:live-warning-card-cooldown-and-ban-persist-until-new-live', async () => {
    const { syncLivePhone, triggerLiveWarning } = await import('../src/visual/igs-ui/danmaku-live.js');
    const { root, motion, doc } = makeRoot();
    const host = doc.createElement('div');
    motion.appendChild(host);
    const c = clock();
    const ctx = { doc, schedule: c.schedule, clear: c.clear, now: c.now, rng: () => 0.5, reduced: false, layout: 'phone', visible: true, look: { model: 'full', size: 'large' } };
    const live = { name: '爱丽丝', title: '夜聊', view: 'watch' };
    syncLivePhone(host, live, ctx);
    assert.equal(triggerLiveWarning(host, { level: 'warn', reason: '' }), 'warn');
    assert.ok(host.querySelector('.igs-live-warn'), 'warning card is shown');
    assert.equal(triggerLiveWarning(host, { level: 'warn', reason: '' }), 'cooldown', 'no repeat within 60s');
    c.run(4800);
    assert.equal(host.querySelector('.igs-live-warn'), null, 'card fades after 4.5s');
    // 封禁：关停画面一直停着，再来警告也不动；同一场直播翻页后仍然是封禁。
    assert.equal(triggerLiveWarning(host, { level: 'ban', reason: '' }), 'ban');
    assert.equal(host.querySelector('.igs-live-phone').getAttribute('data-banned'), '1');
    assert.equal(triggerLiveWarning(host, { level: 'warn', reason: '' }), null);
    syncLivePhone(host, live, ctx);
    assert.equal(host.querySelector('.igs-live-phone').getAttribute('data-banned'), '1');
    // 换一场直播（视角变了）恢复正常。
    syncLivePhone(host, { ...live, view: 'host' }, ctx);
    const phones = host.querySelectorAll('.igs-live-phone');
    assert.equal(phones[phones.length - 1].getAttribute('data-banned'), null);
});

// ---- 路人弹幕接进直播：刷屏潮、规模、粉丝牌 ----
function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

async function runChatterLive({ tier, seed, custom = {}, fan = '', seconds = 90 }) {
    const { syncLivePhone } = await import('../src/visual/igs-ui/danmaku-live.js');
    const { root, motion, doc } = makeRoot();
    void root;
    const host = doc.createElement('div');
    motion.appendChild(host);
    const c = clock();
    const rng = lcg(seed);
    const chatter = {
        sig: 'p1|10', pageKey: 'p1', title: '深夜杂谈', text: '她拿着麦克风对着镜头聊天。', aiLines: [], hostSaid: '', userName: '小明', hostName: '爱丽丝', hostGender: null,
        tone: 'modern', mood: '', hour: 23, ending: false, emoji: true, custom: {}, customMap: custom, tier, fan,
    };
    const ctx = { doc, schedule: c.schedule, clear: c.clear, now: c.now, rng, reduced: false, layout: 'phone', visible: true, chat: 'roll', look: { model: 'full', size: 'large' }, chatter };
    const state = syncLivePhone(host, { name: '爱丽丝', title: '深夜杂谈', view: 'watch' }, ctx);
    let scCount = 0;
    const sc = host.querySelector('.igs-live-sc');
    const rawAppend = sc.appendChild.bind(sc);
    sc.appendChild = (node) => { scCount += 1; return rawAppend(node); };
    const seen = [];
    const list = host.querySelector('.igs-live-list');
    const rawList = list.appendChild.bind(list);
    list.appendChild = (node) => {
        seen.push({ user: (node.querySelector('.igs-live-name') || { textContent: '' }).textContent, text: (node.querySelector('.igs-live-text') || { textContent: '' }).textContent, medal: (node.querySelector('.igs-live-medal') || null) });
        return rawList(node);
    };
    c.run(seconds * 1000);
    return { state, scCount, seen };
}

test('gate:danmaku:live-chatter-bursts-use-different-names-over-a-live', async () => {
    const { seen } = await runChatterLive({ tier: null, seed: 7, seconds: 240 });
    assert.ok(seen.length > 20, 'chatter keeps coming');
    const byText = new Map();
    for (const line of seen) {
        const set = byText.get(line.text) || new Set();
        set.add(line.user);
        byText.set(line.text, set);
    }
    assert.ok(Array.from(byText.values()).some((names) => names.size >= 3), 'one short line repeated by 3+ different names (a spam wave)');
});

test('gate:danmaku:live-huge-scale-gets-more-superchats-than-tiny', async () => {
    const huge = await runChatterLive({ tier: 'huge', seed: 11 });
    const tiny = await runChatterLive({ tier: 'tiny', seed: 11 });
    assert.ok(huge.scCount > tiny.scCount, `huge ${huge.scCount} vs tiny ${tiny.scCount}`);
    assert.ok(huge.state.popularity > tiny.state.popularity);
    // 没有规模信息：保持旧行为（不出本地 SC）。
    const none = await runChatterLive({ tier: null, seed: 11 });
    assert.equal(none.scCount, 0);
});

test('gate:danmaku:live-fan-medal-priority-custom-then-text-then-auto', async () => {
    const { resolveFanMedal } = await import('../src/visual/igs-ui/live-chatter.js');
    const auto = resolveFanMedal({ streamer: '爱丽丝' });
    assert.ok(auto);
    assert.equal(resolveFanMedal({ streamer: '爱丽丝', fromText: '茶会' }), '茶会');
    assert.equal(resolveFanMedal({ streamer: '爱丽丝', fromText: '茶会', customMap: { 爱丽丝: '兔子洞' } }), '兔子洞');
    const live = await runChatterLive({ tier: null, seed: 3, custom: { 爱丽丝: '兔子洞' }, fan: '茶会' });
    assert.equal(live.state.medal, '兔子洞');
    const fromText = await runChatterLive({ tier: null, seed: 3, fan: '茶会' });
    assert.equal(fromText.state.medal, '茶会');
});
