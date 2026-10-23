import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { createMemoryStorage } from '../src/index.js';

function mountReader(t) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    const win = dom.window;
    const g = { localStorage: createMemoryStorage(), document: win.document, window: win, getComputedStyle: win.getComputedStyle.bind(win),
        requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: (id) => clearTimeout(id) };
    const host = createIgsReaderHost({ global: g, pageRenderGapMs: 0,
        getUnifiedSettings: () => ({ bridge: {}, readerSettings: { titleScreen: false, typewriter: { enabled: false } } }),
        getSettingsRevision: () => 1, getCurrentChatId: () => 'esc-draft-fixture' });
    t.after(() => { host.destroy(); win.close(); });
    const opened = host.openReader({ messageId: 3, raw: '白墨：「早上好。」' }, { mode: 'pc', skipTitle: true });
    assert.equal(opened.ok, true);
    assert.equal(opened.domMounted, true, '阅读器挂进了 jsdom');
    return { host, opened, win, doc: win.document };
}

test('gate:reader:esc-closes-the-reader-without-reaching-tavern-stop-generation', (t) => {
    const { host, win, doc } = mountReader(t);
    let tavernSaw = 0;
    // 酒馆在 document 冒泡阶段把 Esc 当「中止生成」。
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') tavernSaw += 1; });
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(host.getState().activeReader, null, 'Esc 照常退出阅读器');
    assert.equal(tavernSaw, 0, 'Esc 不冒泡到酒馆');
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(tavernSaw, 1, '阅读器关着时 Esc 还给酒馆');
});

test('gate:reader:draft-survives-rerender-and-reopen', (t) => {
    const { host, win, doc } = mountReader(t);
    const input = doc.querySelector('#igs-input');
    assert.ok(input);
    input.value = '我想说';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.equal(host.getState().activeReader.inputValue, '我想说', '打字实时记下草稿');
    // 出图写回、报错等会原地换源重绘。
    host.replaceReader({ messageId: 3, raw: '白墨：「早上好。」\n白墨：「今天也很好。」' });
    assert.equal(doc.querySelector('#igs-input').value, '我想说', '重绘后草稿还在');
    // 开着时重开（切轮、报错后重建）也带上草稿。
    host.openReader({ messageId: 3, raw: '白墨：「早上好。」' }, { mode: 'pc', skipTitle: true });
    assert.equal(doc.querySelector('#igs-input').value, '我想说', '重开后草稿还在');
});
