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
    assert.deepEqual(thought.inner.phrases, ['怎么会这样', '他居然全都听见了']);
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
    const opts = { schedule: c.schedule, clear: c.clear, now: c.now, rng: seq([0.9, 0.1, 0.5]), reducedMotion: false };
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
    assert.equal(phone.querySelectorAll('.igs-live-rank').length, 3, 'top-3 ranking avatars');
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
    assert.match(idle.system, /直播 igs-fx:live\/live-end\/dm/);
    assert.doesNotMatch(idle.depth0, /直播间/);
    const hot = buildTagGrammar({ readerSettings: rs, expand: new Set(['live']) });
    assert.match(hot.depth0, /【直播间】/);
});
