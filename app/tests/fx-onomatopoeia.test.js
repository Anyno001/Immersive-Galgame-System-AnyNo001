import test from 'node:test';
import assert from 'node:assert/strict';
import { ONOMATOPOEIA_PARTIALS, playFxSfx, resolveOnomatopoeia } from '../src/visual/igs-ui/fx-sfx.js';

test('gate: onomatopoeia maps the first matching character to a sound family', () => {
    const cases = {
        砰: 'impact', 轰隆: 'impact', 咚咚: 'impact', 啪: 'crack', 咔嚓: 'crack', 叮: 'ring', 铛: 'ring',
        唰: 'whoosh', 嗖: 'whoosh', 哗啦: 'whoosh', 啪砰: 'crack',
    };
    for (const [text, family] of Object.entries(cases)) assert.equal(resolveOnomatopoeia(text), family, text);
});

test('gate: unknown onomatopoeia falls back to thud or impact by emphasis and length', () => {
    assert.equal(resolveOnomatopoeia('噗'), 'thud');
    assert.equal(resolveOnomatopoeia('噗！'), 'impact');
    assert.equal(resolveOnomatopoeia('咕噜噜'), 'impact');
    assert.equal(resolveOnomatopoeia(''), 'thud');
    assert.equal(resolveOnomatopoeia(null), 'thud');
});

test('gate: every onomatopoeia family is short, audible and uses known partial shapes', () => {
    for (const [family, partials] of Object.entries(ONOMATOPOEIA_PARTIALS)) {
        assert.ok(partials.length > 0, family);
        const end = Math.max(...partials.map((q) => q.start + q.duration));
        assert.ok(end > 0.04 && end <= 1.2, `${family} duration ${end}`);
        for (const q of partials) {
            assert.ok(['sine', 'triangle', 'noise'].includes(q.wave), family);
            assert.ok(q.gain > 0 && q.gain <= 1, family);
            assert.ok(q.from > 0 && q.to > 0, family);
        }
    }
});

test('gate: onomatopoeia reaches the scheduler with its family and respects mute', () => {
    const jobs = [];
    const audioScheduler = (job) => { jobs.push(job); return { stop() {} }; };
    playFxSfx('onomatopoeia', { enabled: true, volume: 0.5 }, { audioScheduler, text: '叮' });
    assert.equal(jobs[0].kind, 'onomatopoeia:ring');
    assert.equal(jobs[0].partials, ONOMATOPOEIA_PARTIALS.ring);
    assert.equal(playFxSfx('onomatopoeia', { enabled: false, volume: 0.5 }, { audioScheduler, text: '砰' }), null);
    assert.equal(playFxSfx('onomatopoeia', { enabled: true, volume: 0 }, { audioScheduler, text: '砰' }), null);
    assert.equal(jobs.length, 1);
});
