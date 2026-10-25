import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTurnIndexPanel } from '../src/visual/igs-ui/turn-index-panel.js';
import { createReadingProgress } from '../src/visual/igs-ui/reading-progress.js';

function setup(extra = {}) {
    const dom = new JSDOM('<!doctype html><div id="host"></div>');
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

test('回想：朗读没开不显示重播键；没有头像显示首字', async () => {
    const { doc, panel, host } = setup({ ttsOn: () => false, avatarOf: () => null });
    await panel.open(host);
    assert.equal(doc.querySelectorAll('.igs-ti-log-voice').length, 0);
    assert.equal(doc.querySelector('.igs-ti-log-entry.is-dialogue .igs-ti-log-face').textContent, '艾');
    panel.close();
});
