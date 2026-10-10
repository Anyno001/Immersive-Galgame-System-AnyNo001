import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPointer, decideClick, isNewAppearance, phoneIdentity, pointInPhone } from '../src/visual/igs-ui/phone-focus.js';
import { phoneGeometry } from '../src/visual/igs-ui/danmaku-live.js';

test('gate:phone-focus:tap-needs-small-move-and-short-time', () => {
    const start = { x: 100, y: 100, t: 1000 };
    assert.equal(classifyPointer(start, { x: 103, y: 104, t: 1120 }), 'tap');
    assert.equal(classifyPointer(start, { x: 100, y: 130, t: 1120 }), 'swipe');
    assert.equal(classifyPointer(start, { x: 101, y: 100, t: 1400 }), 'swipe');
    assert.equal(classifyPointer({ ...start, multi: true }, { x: 100, y: 100, t: 1050 }), 'swipe');
    assert.equal(classifyPointer(null, start), 'swipe');
});

test('gate:phone-focus:new-appearance-only-when-phone-changes', () => {
    assert.equal(isNewAppearance('', 'feed|weibo|'), true);
    assert.equal(isNewAppearance('feed|weibo|', 'feed|weibo|'), false);
    assert.equal(isNewAppearance('feed|weibo|', 'feed|tieba|'), true);
    assert.equal(isNewAppearance('feed|weibo|', 'storm|weibo|red|t'), true);
    assert.equal(isNewAppearance('feed|weibo|', ''), false);
});

test('gate:phone-focus:identity-prefers-storm-then-feed-then-live', () => {
    const live = { name: '甲', title: '夜聊', view: 'audience' };
    assert.equal(phoneIdentity({ storm: { platform: 'weibo', tone: 'red', topic: 'x' }, feed: { platform: 'weibo' }, live, liveShown: true }), 'storm|weibo|red|x');
    assert.equal(phoneIdentity({ feed: { platform: 'weibo', owner: '' }, live, liveShown: true }), 'feed|weibo|');
    assert.equal(phoneIdentity({ live, liveShown: true }), 'live|甲|夜聊');
    assert.equal(phoneIdentity({ live: { ...live, view: 'host' }, liveShown: true }), 'live|甲|夜聊', 'own view switch is not a new appearance');
    assert.equal(phoneIdentity({ live, liveShown: false }), '');
});

test('gate:phone-focus:click-decisions-never-turn-page', () => {
    const base = { focus: false, inPhone: true, motion: 'tap', phoneControl: false, otherControl: false, editing: false };
    assert.equal(decideClick(base), 'enter');
    assert.equal(decideClick({ ...base, motion: 'swipe' }), 'swallow');
    assert.equal(decideClick({ ...base, inPhone: false }), 'pass');
    assert.equal(decideClick({ ...base, phoneControl: true, otherControl: true }), 'pass');
    assert.equal(decideClick({ ...base, editing: true }), 'pass');
    assert.equal(decideClick({ ...base, focus: true }), 'exit');
    assert.equal(decideClick({ ...base, focus: true, inPhone: false }), 'exit');
    assert.equal(decideClick({ ...base, focus: true, motion: 'swipe' }), 'swallow');
    assert.equal(decideClick({ ...base, focus: true, inPhone: false, otherControl: true }), 'exitPass');
    assert.equal(decideClick({ ...base, focus: true, phoneControl: true, otherControl: true }), 'pass');
});

test('gate:phone-focus:hit-test-ignores-the-sunk-part', () => {
    const rect = { left: 100, right: 300, top: 50, bottom: 650 };
    assert.equal(pointInPhone(rect, 100, 200, 500), true);
    assert.equal(pointInPhone(rect, 100, 200, 580), false);
    assert.equal(pointInPhone(rect, 0, 200, 580), true);
    assert.equal(pointInPhone(null, 0, 1, 1), false);
});

test('gate:phone-focus:geometry-reaches-full-height-when-dialog-fades', () => {
    const sunk = phoneGeometry({ stageW: 390, stageH: 760, dialogTop: 470, topInset: 0 }, 'full', 'fit');
    const focus = phoneGeometry({ stageW: 390, stageH: 760, dialogTop: 760, topInset: 0 }, 'full', 'fit');
    assert.ok(sunk.under > 0);
    assert.equal(focus.under, 0);
    assert.ok(focus.height >= sunk.height);
});

test('gate:phone-focus:full-layout-clicks-always-pass-so-pages-turn', () => {
    const base = { focus: false, inPhone: true, motion: 'tap', phoneControl: false, otherControl: false, editing: false };
    // 直播全屏的「手机」铺满舞台：点哪里都不进焦点、不拦截，交给翻页处理器。
    assert.equal(decideClick({ ...base, fullLayout: true }), 'pass');
    assert.equal(decideClick({ ...base, fullLayout: true, motion: 'swipe' }), 'pass');
    assert.equal(decideClick({ ...base, fullLayout: true, focus: true }), 'pass');
});
