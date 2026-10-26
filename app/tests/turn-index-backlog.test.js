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

test('回想：当前楼逐句列出头像、名字、台词，当前页高亮', async () => {
    const { doc, panel, host } = setup();
    await panel.open(host);
    const entries = [...doc.querySelectorAll('.igs-ti-log-entry')];
    assert.equal(entries.length, 3);
    assert.ok(entries[0].classList.contains('is-narration'));
    assert.equal(entries[0].querySelector('.igs-ti-log-name'), null);
    assert.equal(entries[0].querySelector('.igs-ti-log-text').textContent, '夜色渐深。');
    assert.equal(entries[1].querySelector('.igs-ti-log-name').textContent, '艾琳');
    assert.match(entries[1].querySelector('.igs-ti-log-face').getAttribute('style'), /background-size:300%/);
    assert.equal(entries[1].getAttribute('aria-current'), 'true');
    assert.equal(entries[2].querySelector('.igs-ti-log-text').textContent, '他会留下吗');
    panel.close();
});

test('回想：重播念那一句，点台词跳到那一页', async () => {
    const { doc, panel, host, jumps, spoken } = setup();
    await panel.open(host);
    doc.querySelectorAll('.igs-ti-log-voice')[1].click();
    await panel.whenIdle();
    assert.equal(spoken[0].speaker, '艾琳');
    doc.querySelectorAll('.igs-ti-log-copy')[2].click();
    await panel.whenIdle();
    assert.deepEqual(jumps[0], { id: 4, page: 2 });
});

test('回想：朗读没开时重播键置灰不可点；没有头像显示首字', async () => {
    const { doc, panel, host } = setup({ ttsOn: () => false, avatarOf: () => null });
    await panel.open(host);
    const voices = [...doc.querySelectorAll('.igs-ti-log-voice')];
    assert.equal(voices.length, 3);
    assert.ok(voices.every((btn) => btn.disabled));
    assert.equal(doc.querySelector('.igs-ti-log-entry.is-dialogue .igs-ti-log-face').textContent, '艾');
    panel.close();
});

test('回想：不朗读的句子单独置灰', async () => {
    const { doc, panel, host } = setup({ canSpeak: (line) => line.textType !== 'narration' });
    await panel.open(host);
    const voices = [...doc.querySelectorAll('.igs-ti-log-voice')];
    assert.deepEqual(voices.map((btn) => btn.disabled), [true, false, false]);
    panel.close();
});

test('窄屏抽屉：「≡」打开楼层列表，选楼或点遮罩收起', async () => {
    const { doc, panel, host } = setup();
    await panel.open(host);
    const root = doc.getElementById('igs-turn-index');
    doc.querySelector('.igs-ti-drawer-btn').click();
    await panel.whenIdle();
    assert.ok(root.classList.contains('igs-ti-drawer-open'));
    doc.querySelector('.igs-ti-scrim').click();
    await panel.whenIdle();
    assert.ok(!root.classList.contains('igs-ti-drawer-open'));
    await panel.act('drawer');
    await panel.act('select', '2');
    assert.ok(!root.classList.contains('igs-ti-drawer-open'));
    assert.match(doc.querySelector('.igs-ti-drawer-btn').textContent, /2 楼/);
    panel.close();
});

test('目录分组：切到每 10 楼并记住；字号步进', async () => {
    const { doc, panel, host } = setup();
    await panel.open(host);
    const select = doc.querySelector('[data-ti-input="group"]');
    select.value = 'ten';
    select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    assert.match(doc.querySelector('.igs-ti-chapter').textContent, /第 0–9 楼/);
    assert.equal(JSON.parse(doc.defaultView.localStorage.getItem('igs_turn_index_prefs')).group, 'ten');
    doc.querySelector('[data-ti-act="log-size"][data-ti-value="1"]').click();
    await panel.whenIdle();
    assert.equal(doc.getElementById('igs-turn-index').style.getPropertyValue('--igs-ti-log-size'), '16px');
    panel.close();
});

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

test('自动朗读：跨楼连续读到最后一楼并停止，高亮随句切换', async () => {
    const { doc, panel, host, calls } = autoSetup();
    await panel.open(host);
    await panel.act('auto-read');
    assert.equal(doc.querySelector('[data-ti-auto]').textContent, '停止');
    await panel.whenAutoReadIdle();
    assert.deepEqual(calls, [10, 11, 20, 30, 31]);
    assert.equal(panel.getState().autoReading, false);
    assert.equal(panel.getState().selectedId, 3);
    assert.equal(doc.querySelector('.is-reading'), null);
    assert.equal(doc.querySelector('[data-ti-auto]').textContent, '自动朗读');
    panel.close();
});

test('自动朗读：运行中高亮当前句，停止时取消当前句', async () => {
    const { doc, panel, host, calls, cancels } = autoSetup({ outcomes: { 11: 'hang' } });
    await panel.open(host);
    await panel.act('auto-read');
    await tick();
    assert.deepEqual(calls, [10, 11]);
    assert.equal(doc.querySelector('.is-reading').getAttribute('data-ti-line'), '11');
    await panel.act('auto-read');
    await panel.whenAutoReadIdle();
    assert.deepEqual(cancels, [11]);
    assert.deepEqual(calls, [10, 11]);
    assert.equal(doc.querySelector('.is-reading'), null);
    panel.close();
});

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

test('自动朗读：canSpeak 为假的行跳过，整楼不可读直接下一楼', async () => {
    const { panel, host, calls } = autoSetup({ extra: { canSpeak: (line) => line.page !== 11 && line.page !== 20 } });
    await panel.open(host);
    await panel.act('auto-read');
    await panel.whenAutoReadIdle();
    assert.deepEqual(calls, [10, 30, 31]);
    panel.close();
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

test('自动朗读：运行中点别行重播键从该行重来，手动选楼与关闭会停止', async () => {
    const { doc, panel, host, calls, cancels } = autoSetup({ outcomes: { 10: 'hang', 11: 'hang' } });
    await panel.open(host);
    await panel.act('auto-read');
    await tick();
    assert.deepEqual(calls, [10]);
    doc.querySelectorAll('.igs-ti-log-voice')[1].click();
    await panel.whenIdle();
    await tick();
    assert.deepEqual(cancels, [10]);
    assert.deepEqual(calls, [10, 11]);
    assert.equal(panel.getState().autoReading, true);
    await panel.act('select-step', '1');
    await panel.whenAutoReadIdle();
    assert.deepEqual(cancels, [10, 11]);
    assert.equal(panel.getState().autoReading, false);
    await panel.act('auto-read');
    await tick();
    panel.close();
    await panel.whenAutoReadIdle();
    assert.equal(panel.getState().autoReading, false);
});
