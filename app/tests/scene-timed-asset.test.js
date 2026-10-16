import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookupSceneBackground } from '../src/scene/scene-directives.js';
import { resolveSceneGradePlan } from '../src/visual/igs-ui/scene-grade.js';

test('scene-timed-asset:time-variant-hit-marks-background-timed', () => {
    const assets = { scenes: { '教室': { url: 'day.png', times: { '夜晚': 'night.png' } } } };
    const night = lookupSceneBackground({ scene: '教室', time: '夜晚' }, assets);
    assert.equal(night.url, 'night.png');
    assert.equal(night.timed, true);
    const plain = lookupSceneBackground({ scene: '教室' }, assets);
    assert.equal(plain.url, 'day.png');
    assert.equal(plain.timed, false);
    // 没有时段变体的普通素材：仍要叠时段调色。
    const flat = lookupSceneBackground({ scene: '走廊', time: '夜晚' }, { scenes: { '走廊': 'hall.png' } });
    assert.equal(flat.url, 'hall.png');
    assert.equal(flat.timed, false);
    // 内置示例图按时段替换文件名，同样视为自带时段光照。
    const demo = lookupSceneBackground({ scene: '河畔', time: '夜晚' }, { scenes: { '河畔': 'a/scene-demo-clean.webp' } });
    assert.equal(demo.url, 'a/scene-demo-clean-night.webp');
    assert.equal(demo.timed, true);
    const miss = lookupSceneBackground({ scene: '不存在', time: '夜晚' }, { scenes: {} });
    assert.equal(miss.timed, false);
});

test('scene-timed-asset:timed-background-skips-time-grade', () => {
    const base = { settings: { enabled: true, strength: 'medium' }, time: 'night', location: '街道' };
    const graded = resolveSceneGradePlan(base);
    assert.ok(graded, 'night grade should apply to plain background');
    assert.equal(graded.time, 'night');
    const timed = resolveSceneGradePlan({ ...base, timedAsset: true });
    assert.ok(!timed || timed.time === '', 'time grade must be skipped for timed asset');
});

test('scene-timed-asset:background-no-longer-dimmed-by-default', () => {
    const reader = readFileSync(new URL('../src/visual/igs-ui/original-reader-source.js', import.meta.url), 'utf8');
    assert.match(reader, /#igs-bg\{[^}]*filter:brightness\(1\);\}/);
    assert.match(reader, /#igs-bg::after\{[^}]*rgba\(0,0,0,\.35\) 0%/);
    const render = readFileSync(new URL('../src/visual/igs-ui/reader-dom-render.js', import.meta.url), 'utf8');
    assert.match(render, /Number\.isFinite\(brightness\) \? brightness : 100\)/);
    assert.match(render, /timedAsset: Boolean\(snapshot\.content && snapshot\.content\.backgroundTimed === true/);
});

test('scene-timed-asset:chat-bubble-tail-sits-at-top-beside-avatar', () => {
    const chat = readFileSync(new URL('../src/visual/igs-ui/chat-layer.js', import.meta.url), 'utf8');
    assert.match(chat, /\.igs-chat-row\.is-left \.igs-chat-bubble\{border-top-left-radius:min\(5px,var\(--igs-chat-radius,16px\)\);\}/);
    assert.match(chat, /\.igs-chat-row\.is-right \.igs-chat-bubble\{border-top-right-radius:min\(5px,var\(--igs-chat-radius,16px\)\);\}/);
    assert.match(chat, /\.igs-chat-bubble\{[^}]*border-radius:var\(--igs-chat-radius,16px\)/);
    assert.doesNotMatch(chat, /\.igs-chat-bubble\{border-bottom-(left|right)-radius:5px;\}/);
});
