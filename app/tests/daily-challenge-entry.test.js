import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { combatEntryHtml, syncCombatEntry } from '../src/visual/igs-ui/combat-entry.js';

const entry = { kind: 'challenge', key: 'ch|c|3|0|h|0', messageId: 3, event: '终面', domain: '话术', tier: '普通', allowEscape: true };

function mount(extra = {}) {
    const dom = new JSDOM('<div id="overlay"></div>');
    const overlay = dom.window.document.getElementById('overlay');
    const actions = [];
    syncCombatEntry(overlay, entry, { onOpen: () => actions.push('open'), onAction: (kind) => actions.push(kind), ...extra });
    const click = (name) => overlay.querySelector(`[data-combat-entry="${name}"]`).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    return { overlay, actions, click, button: (name) => overlay.querySelector(`[data-combat-entry="${name}"]`) };
}

test('日常挑战入口：点「交给托管」直接交给 onAction，点主按钮只打开面板', () => {
    const { actions, click } = mount();
    click('auto');
    assert.deepEqual(actions, ['auto']);
    click('open');
    assert.deepEqual(actions, ['auto', 'open']);
});

test('日常挑战入口：「放弃」第一次点只改成「确认放弃」，第二次点才执行', () => {
    const { actions, click, button } = mount();
    click('abandon');
    assert.deepEqual(actions, []);
    assert.equal(button('abandon').textContent, '确认放弃');
    click('abandon');
    assert.deepEqual(actions, ['abandon']);
});

test('不允许放弃时入口没有「放弃」按钮', () => {
    assert.doesNotMatch(combatEntryHtml({ ...entry, allowEscape: false }), /data-combat-entry="abandon"/);
});

test('阅读器渲染日常挑战入口时把入口按钮的动作交给面板处理', () => {
    const source = fs.readFileSync(new URL('../src/visual/igs-ui/reader-host.js', import.meta.url), 'utf8');
    const call = /syncCombatEntry\(overlay, entry, {[^\n]*}\)/.exec(source)?.[0] || '';
    assert.match(call, /onAction: \(kind\) => openCombatPanel\(current, entry, { then: kind }\)/);
});
