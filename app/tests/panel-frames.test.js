import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEM_FRAME_SKINS, getDialogThemePanelFrameStyleText } from '../src/visual/igs-ui/dialog-theme-item-frames.js';
import { getDialogSkinStyleText } from '../src/visual/igs-ui/dialog-skin-style.js';
import { BEATS_BUILDERS } from '../src/visual/igs-ui/fx-beats-build.js';
import { BEATS_STYLE_TEXT } from '../src/visual/igs-ui/fx-beats-style.js';
import { PLACES_BUILDERS } from '../src/visual/igs-ui/fx-places-render.js';
import { RITES_BUILDERS } from '../src/visual/igs-ui/fx-daily-rites.js';
import { makeStage } from './helpers/fake-dom.js';

const envOf = (ancient) => {
    const root = makeStage();
    return { root, doc: root.ownerDocument, reduced: true, hold: 1, ancient, worldview: ancient ? 'ancient' : 'modern' };
};

test('all 21 popup skins cover system, result and quest while documents keep their approved paper', () => {
    for (const skin of ITEM_FRAME_SKINS) {
        const css = getDialogThemePanelFrameStyleText(skin);
        assert.ok(getDialogSkinStyleText(skin).includes(css), skin);
        for (const part of ['.igs-bt-panel-wrap .igs-panel', '.igs-bt-count .igs-bt-count-card', '.igs-pl-q .igs-pl-q-paper', '.igs-fx-result']) assert.ok(css.includes(part), `${skin}: ${part}`);
        assert.match(css, /pointer-events:none/);
        assert.doesNotMatch(css, /animation:|writing-mode:/, 'preserve performance lifecycle and ancient vertical text');
        assert.match(css, /igs-panel-row.is-good/);
        assert.match(css, /igs-panel-row.is-bad/);
        assert.ok(css.includes(`data-igs-dialog-skin="${skin}"`));
    }
    assert.equal(getDialogThemePanelFrameStyleText('unknown'), '');
    assert.match(getDialogThemePanelFrameStyleText('default'), /#igs-overlay:not\(\[data-igs-dialog-skin\]\)/);
});

test('system panels keep escaped data and signed result semantics, with readable chip inside the shared card', () => {
    for (const ancient of [false, true]) for (const kind of ['system', 'notice', 'quest', 'result', 'breakthrough']) {
        const built = BEATS_BUILDERS.panel({ kind, title: '<img src=x>', rows: ['金币：+30', '耐久：-5', '<script>bad()</script>'] }, envOf(ancient));
        const card = built.node.querySelector('.igs-panel');
        assert.equal(card.querySelector('.igs-bt-panel-chip').parentNode, card);
        assert.equal(card.getAttribute('role'), 'status');
        assert.match(card.innerHTML, /&lt;img src=x&gt;/);
        assert.match(card.innerHTML, /&lt;script&gt;/);
        assert.match(card.innerHTML, /is-good/);
        assert.match(card.innerHTML, /is-bad/);
        assert.equal(built.layer, 'front');
        assert.equal(built.life, 5100);
        assert.deepEqual(built.sounds, ['bt-chime']);
        assert.equal(built.node.querySelector('.igs-fx-item-card'), null, 'must not enter inventory click semantics');
        assert.equal(card.getAttribute('aria-modal'), null, 'performance remains nonblocking');
    }
});

test('quest retains take/done/fail labels, rewards, sound and escaping for ancient and modern worlds', () => {
    for (const ancient of [false, true]) for (const [state, label] of [['take', '已接取'], ['done', '已完成'], ['fail', '已失败']]) {
        const built = PLACES_BUILDERS.quest({ title: '<任务>', reward: '500 & 符', state }, envOf(ancient));
        assert.match(built.node.innerHTML, new RegExp(label));
        assert.match(built.node.innerHTML, /&lt;任务&gt;/);
        assert.match(built.node.innerHTML, /500 &amp; 符/);
        assert.ok(built.node.innerHTML.includes(ancient ? '悬赏榜' : '委托板'));
        assert.deepEqual(built.sounds, [`pl-quest-${state}`]);
        assert.equal(built.life, 3600);
    }
});


test('reference screenshot regression: score 150 to 0 keeps -150 while the number card follows every skin', () => {
    for (const ancient of [false, true]) {
        const built = BEATS_BUILDERS.count({ label: '积分', from: 150, to: 0, unit: '分' }, envOf(ancient));
        assert.equal(built.node.querySelector('.igs-bt-count-num').textContent, '0');
        assert.equal(built.node.querySelector('.igs-bt-count-delta').textContent, '-150');
        assert.equal(built.node.querySelector('.igs-bt-count-unit').textContent, '分');
        assert.equal(built.node.querySelector('.igs-bt-count-card').getAttribute('aria-label'), '积分 0分');
        assert.equal(built.life, 3600);
        assert.deepEqual(built.sounds, ['bt-tick']);
    }
    assert.match(BEATS_STYLE_TEXT, /grid-template-columns:minmax\(0,1fr\) auto/);
    assert.doesNotMatch(BEATS_STYLE_TEXT, /count-card.is-down\{border-color/);
    assert.doesNotMatch(BEATS_STYLE_TEXT, /:is\(\.igs-bt-count-num,\.igs-bt-count-delta\)\{color/);
    for (const skin of ITEM_FRAME_SKINS) {
        const css = getDialogThemePanelFrameStyleText(skin);
        assert.match(css, /igs-bt-count-card:is\(\.is-up,\.is-down,\.is-flat\) \.igs-bt-count-num/);
        assert.match(css, /igs-bt-count-card.is-down \.igs-bt-count-delta/);
    }
});


test('cloud shoulders match the approved light paper across skins and keep all curves inside fixed slices', () => {
    for (const skin of ITEM_FRAME_SKINS) {
        const css = getDialogThemePanelFrameStyleText(skin);
        const frame = css.split('\n').find((rule) => rule.includes('border-image:'));
        assert.ok(frame, skin);
        assert.match(frame, /igs-bt.is-ancient/);
        assert.match(frame, /::before/);
        assert.match(frame, /transform:none;margin:0/);
        assert.match(frame, /filter:none/);
        assert.ok(frame.includes('%23f6efe0'), 'approved cream paper, independent of dark skin');
        assert.ok(frame.includes('%237c5a3c'), 'approved brown thin outline');
        assert.ok(css.includes('IGS-MaShanZheng'), 'approved brush font');
        assert.match(frame, /-webkit-mask:none;mask:none/);
        assert.doesNotMatch(css, /igs-dfx-omikuji|igs-dfx-edict|igs-dfx-poem|igs-dfx-letter/);
    }
});
