import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFxToDom, cancelFxEffects } from '../src/visual/igs-ui/fx-runtime.js';
import { renderDailyFx, cancelDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-style.js';
import { FakeEl, makeStage, makeTimers } from './helpers/fake-dom.js';

// 顶部通知卡在场期间暂隐左上状态栏，右上工具栏只留关闭键；卡片退场或翻页后恢复。

const motionOf = (root) => root.querySelector('#igs-stage-motion');

// 公用假 DOM 没有 classList；fx-runtime 的 spawn 要用，这里按 className 补一个。
if (!Object.getOwnPropertyDescriptor(FakeEl.prototype, 'classList')) {
    Object.defineProperty(FakeEl.prototype, 'classList', { get() {
        const el = this;
        const list = () => String(el.className).split(/\s+/).filter(Boolean);
        return {
            add: (...names) => { el.className = [...new Set([...list(), ...names])].join(' '); },
            remove: (...names) => { el.className = list().filter((n) => !names.includes(n)).join(' '); },
            contains: (name) => list().includes(name),
            toggle: (name, on) => { const has = list().includes(name); const want = on === undefined ? !has : on; if (want !== has) el.className = want ? [...list(), name].join(' ') : list().filter((n) => n !== name).join(' '); return want; },
        };
    } });
}
const notifyPage = (index = 0) => ({
    messageId: 7, mode: 'embedded', readerSettings: { fxTags: { enabled: true } },
    content: { currentIndex: index, fx: { instants: [{ kind: 'notify', sender: '林小雨', text: '到楼下了，快出来' }] } },
});

test('notify card raises the notice flag until it leaves', () => {
    const root = makeStage({ hud: true });
    const timers = makeTimers();
    const result = applyFxToDom(root, notifyPage(), { schedule: timers.schedule, clear: timers.clear, playSfx: () => {} });
    assert.ok(result.played.includes('notify'), JSON.stringify(result.played));
    assert.equal(motionOf(root).getAttribute('data-igs-fx-notice'), '1');
    timers.advance(60000);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-notice'), null);
    cancelFxEffects(root);
});

test('turning the page drops the notice flag with the card', () => {
    const root = makeStage({ hud: true });
    const timers = makeTimers();
    const opts = { schedule: timers.schedule, clear: timers.clear, playSfx: () => {} };
    applyFxToDom(root, notifyPage(0), opts);
    applyFxToDom(root, { ...notifyPage(1), content: { currentIndex: 1, fx: { instants: [] } } }, opts);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-notice'), null);
    cancelFxEffects(root);
});

test('daily broadcast banner raises its own notice flag', () => {
    const root = makeStage({ hud: true });
    const timers = makeTimers();
    const snapshot = { messageId: 3, readerSettings: { dailyFx: { enabled: true } },
        content: { currentIndex: 0, fx: { daily: [{ type: 'broadcast', text: '本店将于十分钟后打烊' }] } } };
    const result = renderDailyFx(root, snapshot, { schedule: timers.schedule, clear: timers.clear, playSfx: () => {}, reducedMotion: true });
    assert.ok(result.played.includes('broadcast'), JSON.stringify(result.played));
    assert.equal(motionOf(root).getAttribute('data-igs-dfx-notice'), '1');
    timers.advance(60000);
    assert.equal(motionOf(root).getAttribute('data-igs-dfx-notice'), null);
    cancelDailyFx(root);
});

test('style hides the status bar and every toolbar child except close', () => {
    assert.match(FX_STYLE_TEXT, /#igs-stage-motion:is\(\[data-igs-fx-notice\],\[data-igs-dfx-notice\]\) #igs-status-hud,/);
    assert.match(FX_STYLE_TEXT, /#igs-ctrl-bar>:not\(\[data-act="close"\]\)\{display:none!important;\}/);
});
