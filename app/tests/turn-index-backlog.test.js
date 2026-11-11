import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTurnIndexPanel } from '../src/visual/igs-ui/turn-index-panel.js';
import { createReadingProgress } from '../src/visual/igs-ui/reading-progress.js';

function setup(extra = {}) {
    const dom = new JSDOM('<!doctype html><div id="host"></div>', { url: 'https://example.test/' });
    const doc = dom.window.document;
    const progress = createReadingProgress({ storage: null });
    const jumps = [];
    const spoken = [];
    const panel = createTurnIndexPanel(doc, {
        progress,
        listTurns: async () => [{ id: 2 }, { id: 4 }],
        snippetOf: () => '开头',
        currentId: () => 4,
        currentPage: () => 1,
        linesOf: (turn) => (turn.id === 4 ? [
            { textType: 'narration', speaker: '', text: '夜色<b>渐深</b>。', page: 0 },
            { textType: 'dialogue', speaker: '艾琳', text: '「你来了。」', page: 1 },
            { textType: 'thought', speaker: '艾琳', text: '*他会留下吗*', page: 2 },
        ] : []),
        avatarOf: (name) => (name === '艾琳' ? { url: 'data:image/png;base64,AAAA', crop: { size: 300, x: 50, y: 10 } } : null),
        ttsOn: () => true,
        speak: (line) => { spoken.push(line); return { ok: true }; },
        onJump: (target) => { jumps.push(target); },
        ...extra,
    });
    return { doc, panel, jumps, spoken, host: doc.getElementById('host') };
}

// 自动朗读：假 host，speak 返回可控的 done。
function autoSetup({ outcomes = {}, extra = {} } = {}) {
    const calls = [];
    const cancels = [];
    const pending = [];
    const data = { 1: [10, 11], 2: [20], 3: [30, 31] };
    const base = {
        listTurns: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
        linesOf: (turn) => (data[turn.id] || []).map((page) => ({ textType: 'dialogue', speaker: '艾琳', text: `台词${page}`, page })),
        currentId: () => 1,
        currentPage: () => 10,
        ttsOn: () => true,
        speak: (line) => {
            calls.push(line.page);
            const outcome = outcomes[line.page] || 'completed';
            if (outcome === 'error') return { ok: false, error: '没声音' };
            if (outcome === 'hang') {
                let resolve;
                const done = new Promise((r) => { resolve = r; });
                pending.push(resolve);
                return { ok: true, done, cancel: () => { cancels.push(line.page); resolve({ cancelled: true }); } };
            }
            return { ok: true, done: Promise.resolve({ completed: outcome === 'completed', failed: outcome === 'failed', cancelled: outcome === 'cancelled' }), cancel: () => cancels.push(line.page) };
        },
        ...extra,
    };
    const s = setup(base);
    return { ...s, calls, cancels, pending };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('自动朗读：结果 cancelled 整体停止', async () => {
    const { panel, host, calls } = autoSetup({ outcomes: { 10: 'cancelled' } });
    await panel.open(host);
    await panel.act('auto-read');
    await panel.whenAutoReadIdle();
    assert.deepEqual(calls, [10]);
    assert.equal(panel.getState().autoReading, false);
    panel.close();
});

test('自动朗读：连续三次失败停止并提示，成功会清零计数', async () => {
    const a = autoSetup({ outcomes: { 10: 'failed', 11: 'error', 20: 'failed' } });
    await a.panel.open(a.host);
    await a.panel.act('auto-read');
    await a.panel.whenAutoReadIdle();
    assert.deepEqual(a.calls, [10, 11, 20]);
    assert.match(a.panel.getState().notice, /连续朗读失败/);
    a.panel.close();
    const b = autoSetup({ outcomes: { 10: 'failed', 11: 'failed', 20: 'completed', 30: 'failed' } });
    await b.panel.open(b.host);
    await b.panel.act('auto-read');
    await b.panel.whenAutoReadIdle();
    assert.deepEqual(b.calls, [10, 11, 20, 30, 31]);
    b.panel.close();
});

test('自动朗读：isTurnHidden 的楼整楼跳过', async () => {
    const { panel, host, calls } = autoSetup({ extra: { isTurnHidden: (id) => id === 2 } });
    await panel.open(host);
    await panel.act('auto-read');
    await panel.whenAutoReadIdle();
    assert.deepEqual(calls, [10, 11, 30, 31]);
    panel.close();
});

test('自动朗读：done 缺失视为不支持，提示并停止', async () => {
    const { panel, host, calls } = autoSetup({ extra: { speak: (line) => { calls.push?.(line.page); return { ok: true }; } } });
    await panel.open(host);
    await panel.act('auto-read');
    await panel.whenAutoReadIdle();
    assert.match(panel.getState().notice, /不支持/);
    assert.equal(panel.getState().autoReading, false);
    panel.close();
});

test('目录：内嵌换宿主后保留已选楼层，关闭时移除面板', async () => {
    const { doc, panel, host } = setup();
    await panel.open(host);
    const selected = panel.getState().selectedId;
    const element = doc.querySelector('#igs-turn-index');
    const next = doc.createElement('div');
    doc.body.appendChild(next);
    host.remove();
    await panel.open(next);
    assert.equal(doc.querySelector('#igs-turn-index'), element);
    assert.equal(element.parentNode, next);
    assert.equal(panel.getState().selectedId, selected);
    panel.close();
    assert.equal(doc.querySelector('#igs-turn-index'), null);
});

test('目录：打开后新增的楼层也能通过最新按钮跳转', async () => {
    const turns = [{ id: 4, text: '原来的最新楼。' }];
    const { panel, host, jumps } = setup({ listTurns: async () => turns.slice() });
    await panel.open(host);
    turns.push({ id: 6, text: '刚生成的新楼。' });
    await panel.act('latest');
    assert.deepEqual(jumps.at(-1), { id: 6, page: 0 });
});
