import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleTypewriterAudio } from '../src/visual/igs-ui/typewriter-audio.js';
import { UNDERWATER_TYPEWRITER, isUnderwaterScene, shapeUnderwaterNotes, spawnTypingBubbles } from '../src/visual/igs-ui/typewriter-underwater.js';

const events = Array.from({ length: 24 }, (_, i) => ({ text: '字', timeMs: i * 90 }));

test('gate:typewriter-underwater only for underwater places, any worldview', () => {
    assert.equal(isUnderwaterScene({ sceneLocation: '深海' }, {}), true);
    assert.equal(isUnderwaterScene({ sceneLocation: '龙宫' }, { _worldview: 'ancient' }), true);
    assert.equal(isUnderwaterScene({ sceneLocation: '海边' }, {}), false);
    assert.equal(isUnderwaterScene({ sceneLocation: '海底捞' }, {}), false);
    assert.equal(isUnderwaterScene({}, {}), false);
});

test('gate:typewriter-underwater notes drop in pitch, bubbles are seeded and end with a gurgle', () => {
    const notes = events.map((e) => ({ timeMs: e.timeMs, pitch: 1, gain: 1, hold: 1, glide: 0, jitter: 0.02 }));
    const a = shapeUnderwaterNotes(notes);
    const b = shapeUnderwaterNotes(notes);
    assert.deepEqual(a, b, 'same sentence, same bubbles');
    assert.ok(a.notes.every((n) => n.pitch === UNDERWATER_TYPEWRITER.pitch));
    assert.ok(a.bubbles.length <= UNDERWATER_TYPEWRITER.maxBubbles);
    const last = notes.at(-1).timeMs;
    assert.deepEqual(a.bubbles.slice(-3).map((x) => x.timeMs), UNDERWATER_TYPEWRITER.tail.map((o) => last + o));
    assert.ok(a.bubbles.length > 3, 'some bubbles between characters too');
    assert.deepEqual(shapeUnderwaterNotes([]), { notes: [], bubbles: [] });
});

test('gate:typewriter-underwater scheduler receives bubbles only when underwater', () => {
    const calls = [];
    const audioScheduler = (info) => { calls.push(info); return { stop() {} }; };
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler, underwater: true });
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler });
    assert.equal(calls[0].underwater, true);
    assert.ok(calls[0].bubbles.length > 3);
    assert.ok(calls[0].notes.every((n) => n.pitch < 1));
    assert.equal('bubbles' in calls[1], false);
});

function fakeTarget({ low = false } = {}) {
    const style = () => ({ setProperty() {} });
    const kids = [];
    const doc = { createElement: (tag) => ({ tag, style: style(), children: [], setAttribute() {}, appendChild(c) { this.children.push(c); }, animate() { return {}; } }) };
    const parent = { childNodes: kids, insertBefore(c) { kids.push(c); c.parentNode = parent; }, removeChild(c) { kids.splice(kids.indexOf(c), 1); c.parentNode = null; } };
    const target = { ownerDocument: doc, parentNode: parent, offsetWidth: 300, offsetLeft: 10, offsetTop: 20, nextSibling: null, closest: (sel) => (low && sel.includes('low') ? {} : null) };
    return { target, kids };
}

test('gate:typewriter-underwater bubbles mount once, can be removed and skip power-saving mode', () => {
    const { target, kids } = fakeTarget();
    const handle = spawnTypingBubbles(target, { duration: 800 });
    assert.equal(kids.length, 1);
    assert.equal(kids[0].children.length, 5);
    handle.remove();
    assert.equal(kids.length, 0);
    assert.equal(spawnTypingBubbles(fakeTarget({ low: true }).target, { duration: 800 }), null);
});
