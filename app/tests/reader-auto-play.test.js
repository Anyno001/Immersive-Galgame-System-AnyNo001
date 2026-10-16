import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_PLAY_SPEEDS, createReaderAutoPlay } from '../src/visual/igs-ui/reader-auto-play.js';
import { createAutoPlayClock } from './helpers/auto-play-clock.js';
import { ORIGINAL_READER_ICONS, getOriginalReaderHtml, getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';

function fixture() {
    const timers = createAutoPlayClock();
    const status = { page: 0, blocked: false, busy: false, last: false };
    const calls = [];
    const player = createReaderAutoPlay({ timers, read: () => status,
        advance: () => { calls.push(timers.now()); status.page += 1; return { ok: true, moved: true }; },
    });
    return { timers, status, calls, player };
}

for (const [speed, delay] of Object.entries(AUTO_PLAY_SPEEDS)) {
    test(`gate:auto-play:${speed}-uses-its-real-delay-and-stops-cleanly`, async () => {
        const { player, timers, calls } = fixture();
        try {
            assert.equal(player.setSpeed(speed).speed, speed);
            assert.equal(timers.size(), 0);
            player.toggle();
            await timers.advance(delay - 1);
            assert.equal(calls.length, 0);
            await timers.advance(1);
            assert.deepEqual(calls, [delay]);
            assert.ok(timers.size() <= 1);
            player.toggle();
            await timers.advance(10000);
            assert.equal(calls.length, 1);
            assert.equal(timers.size(), 0);
        } finally { player.stop(); }
    });
}

test('gate:auto-play:waits-for-text-and-panel-before-counting-a-full-delay', async () => {
    const { player, timers, status, calls } = fixture();
    try {
        status.busy = true;
        player.toggle();
        await timers.advance(10000);
        assert.equal(calls.length, 0);
        status.busy = false;
        status.blocked = true;
        await timers.advance(10000);
        assert.equal(calls.length, 0);
        status.blocked = false;
        await timers.advance(200);
        await timers.advance(2999);
        assert.equal(calls.length, 0);
        await timers.advance(1);
        assert.equal(calls.length, 1);
    } finally { player.stop(); }
});

test('gate:auto-play:toolbar-only-keeps-play-and-stop-in-existing-icon-language', () => {
    for (const svg of [ORIGINAL_READER_ICONS.play, ORIGINAL_READER_ICONS.stop]) {
        assert.match(svg, /^<svg /);
        assert.match(svg, /viewBox="0 0 24 24"/);
        assert.match(svg, /stroke="currentColor" stroke-width="2"/);
        assert.doesNotMatch(svg, /<text|<span|[快中慢]/);
    }
    assert.match(ORIGINAL_READER_ICONS.stop, /<rect /);
    const html = getOriginalReaderHtml();
    assert.ok(html.includes(ORIGINAL_READER_ICONS.play));
    assert.doesNotMatch(html, /auto-speed/);
    assert.doesNotMatch(getOriginalReaderStyleText(), /\.igs-icon-btn\[data-act="auto-speed"\]/);
});
test('gate:auto-play:set-speed-normalizes-invalid-values-and-keeps-unchanged-countdown', async () => {
    const { player, timers, calls } = fixture();
    try {
        assert.equal(player.setSpeed('fast').speed, 'fast');
        assert.equal(player.setSpeed('invalid').speed, 'medium');
        assert.equal(player.setSpeed('toString').speed, 'medium');
        assert.equal(player.setSpeed(undefined).speed, 'medium');
        player.toggle();
        await timers.advance(2000);
        player.setSpeed('medium');
        assert.equal(timers.size(), 1);
        await timers.advance(999);
        assert.equal(calls.length, 0);
        await timers.advance(1);
        assert.deepEqual(calls, [3000]);
    } finally { player.stop(); }
});


test('gate:auto-play:manual-page-refresh-and-speed-change-reset-the-countdown', async () => {
    const { player, timers, status, calls } = fixture();
    try {
        player.toggle();
        await timers.advance(2000);
        status.page += 1;
        player.refresh();
        player.setSpeed('slow');
        assert.equal(player.getState().speed, 'slow');
        await timers.advance(4999);
        assert.equal(calls.length, 0);
        await timers.advance(1);
        assert.equal(calls.length, 1);
        status.last = true;
        await timers.advance(200);
        assert.equal(player.getState().enabled, false);
        assert.equal(timers.size(), 0);
    } finally { player.stop(); }
});
