import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildTitleScreenModel, createTitleGate, reduceTitleAction, renderTitleScreen } from '../src/visual/igs-ui/title-screen.js';

test('续读主界面：菜单只有继续（带位置）/ 最新一层 / 设置', () => {
    const gate = createTitleGate({ resume: { label: '18 楼 · 第 74 页' } });
    const model = buildTitleScreenModel({ snapshot: { readerSettings: {}, content: {} }, gate, card: { name: '测试卡' } });
    assert.equal(model.resume.label, '18 楼 · 第 74 页');
    const dom = new JSDOM('<!doctype html><div id="o"></div>');
    const overlay = dom.window.document.getElementById('o');
    renderTitleScreen(overlay, model, { onAction: () => {} });
    const acts = [...overlay.querySelectorAll('.igs-ts-menu [data-ts-act]')].map((btn) => btn.getAttribute('data-ts-act'));
    assert.deepEqual(acts, ['continue', 'latest', 'settings']);
    assert.match(overlay.querySelector('[data-ts-act="continue"]').textContent, /18 楼 · 第 74 页/);
    assert.equal(reduceTitleAction(gate, model, 'latest').effect, 'latest');
});

test('普通主界面不受续读影响', () => {
    const gate = createTitleGate();
    assert.equal(gate.resume, null);
    const model = buildTitleScreenModel({ snapshot: { readerSettings: {}, content: {} }, gate });
    assert.equal(model.resume, null);
});
