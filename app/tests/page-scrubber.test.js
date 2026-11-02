import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { syncPageScrubber } from '../src/visual/igs-ui/page-scrubber.js';
import { normalizeLogReaderSettings } from '../src/visual/igs-ui/log-reader-settings.js';
import { normalizeComicModeSettings } from '../src/visual/igs-ui/comic-settings.js';

function setup() {
    const dom = new JSDOM('<div id="igs-overlay"></div>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    return { dom, overlay };
}

test('页码进度条默认关', () => {
    assert.equal(normalizeLogReaderSettings({}).scrubber, false);
    assert.equal(normalizeComicModeSettings({}).scrubber, false);
    assert.equal(normalizeLogReaderSettings({ scrubber: true }).scrubber, true);
    assert.equal(normalizeComicModeSettings({ scrubber: true }).scrubber, true);
});

test('只有一页或传 null 时隐藏', () => {
    const { overlay } = setup();
    syncPageScrubber(overlay, null);
    assert.equal(overlay.querySelector('#igs-page-scrubber'), null);
    syncPageScrubber(overlay, { index: 0, total: 5, onSeek() {} });
    const el = overlay.querySelector('#igs-page-scrubber');
    assert.equal(el.hidden, false);
    assert.equal(el.querySelector('.igs-ps-tip').textContent, '1 / 5');
    syncPageScrubber(overlay, { index: 0, total: 1, onSeek() {} });
    assert.equal(el.hidden, true);
});

test('拖动只动气泡、松手才跳页，不冒泡到翻页', () => {
    const { dom, overlay } = setup();
    const seeks = [];
    syncPageScrubber(overlay, { index: 0, total: 11, onSeek: (page) => seeks.push(page) });
    const el = overlay.querySelector('#igs-page-scrubber');
    el.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 22 });
    let bubbled = 0;
    overlay.addEventListener('pointerdown', () => { bubbled += 1; });
    const fire = (type, clientX) => {
        const event = new dom.window.MouseEvent(type, { bubbles: true, clientX });
        el.dispatchEvent(event);
    };
    fire('pointerdown', 20);
    fire('pointermove', 80);
    fire('pointermove', 50);
    assert.deepEqual(seeks, [], '拖动中不跳页');
    assert.equal(el.querySelector('.igs-ps-tip').textContent, '6 / 11');
    fire('pointerup', 50);
    assert.deepEqual(seeks, [5]);
    assert.equal(bubbled, 0);
});
