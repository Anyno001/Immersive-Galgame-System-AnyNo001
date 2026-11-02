import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { combatEntryHtml, syncCombatEntry } from '../src/visual/igs-ui/combat-entry.js';

const entry = { kind: 'challenge', key: 'ch|c|3|0|h|0', messageId: 3, event: '终面', domain: '话术', tier: '普通', allowEscape: true };

function mount(extra = {}, target = entry, seen = new Set()) {
    const dom = new JSDOM('<div id="overlay"></div>');
    const overlay = dom.window.document.getElementById('overlay');
    const actions = [];
    const auto = syncCombatEntry(overlay, target, { seen, onOpen: () => { actions.push('open'); return extra.result; }, ...extra });
    const click = () => overlay.querySelector('[data-combat-entry="open"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    return { overlay, actions, click, auto };
}

test('入口卡降级为回头路：只有一个「返回挑战」小标签，点击重新打开对阵界面', () => {
    const { overlay, actions, click } = mount();
    assert.equal(overlay.querySelectorAll('[data-combat-entry]').length, 1);
    assert.equal(overlay.querySelector('[data-combat-entry="open"]').textContent, '返回挑战');
    click();
    assert.deepEqual(actions, ['open']);
});

test('普通战斗的回头路标签是「返回战斗」', () => {
    assert.match(combatEntryHtml({ key: 'k', encounter: '山道', tier: 'normal', enemies: [] }), />返回战斗</);
});

test('开战标签（战斗与日常挑战相同）没自动打开过时要求自动打开，记入 seen 后不再要求', () => {
    assert.equal(mount().auto, true);
    assert.equal(mount({}, entry, new Set([entry.key])).auto, false);
});

test('打开失败（ok:false）时交给 onFail', () => {
    const fails = [];
    const { click } = mount({ result: { ok: false, reason: 'panel-open' }, onFail: (r) => fails.push(r.reason) });
    click();
    assert.deepEqual(fails, ['panel-open']);
});

test('阅读器渲染入口时：自动打开、失败提示，关闭未选择时留返回标签', () => {
    const source = fs.readFileSync(new URL('../src/visual/igs-ui/reader-host.js', import.meta.url), 'utf8');
    const call = /syncCombatEntry\(overlay, showTag, {[^\n]*}\)/.exec(source)?.[0] || '';
    assert.match(call, /onOpen: \(\) => openCombatPanel\(current, entry\)/);
    assert.match(call, /onFail:/);
    assert.match(source, /onClose: \(\{ dismissed \}\)/);
});

test('对撞定格上的操作层：准备中只有小字与关闭，准备完成换成按钮，阻断给原因与重试', async () => {
    const { combatIntroUiHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');
    const wait = combatIntroUiHtml({ status: 'idle', pending: 'prepare' });
    assert.match(wait, /正在准备战斗/);
    assert.doesNotMatch(wait, /data-combat-act="start"/);
    assert.match(wait, /data-combat-act="close"/);
    assert.match(combatIntroUiHtml({ status: 'idle', pending: 'prepare', challenge: true }), /正在准备挑战/);
    const lobby = { allies: [], enemies: [], canEscape: true };
    const normal = combatIntroUiHtml({ status: 'lobby', lobby });
    assert.match(normal, /开始战斗/);
    assert.match(normal, /跳过战斗/);
    const challenge = combatIntroUiHtml({ status: 'lobby', lobby: { ...lobby, challenge: true } });
    assert.match(challenge, /迎接挑战/);
    assert.match(challenge, /交给托管/);
    assert.match(challenge, />放弃</);
    assert.match(combatIntroUiHtml({ status: 'lobby', lobby: { ...lobby, challenge: true }, abandonArmed: true }), /确认放弃/);
    const blocked = combatIntroUiHtml({ status: 'blocked', reason: 'combat-table-missing' });
    assert.match(blocked, /data-combat-act="retry-prepare"/);
});
