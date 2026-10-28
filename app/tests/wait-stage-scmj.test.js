import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl } from './helpers/fake-dom.js';
import { penaltyBrief, startMahjong } from '../src/visual/igs-ui/wait-stage-mahjong.js';
import { WAIT_STAGE_GAME_LABELS } from '../src/visual/igs-ui/wait-stage-games.js';
import { greedyDecide } from '../scripts/scmj-players.mjs';
import {
    MAHJONG_MODE_KEY,
    SCMJ_SAVE_KEY,
    SCMJ_STYLE,
    createScmjMatch,
    forgetScmjTable,
    openScmjTable,
    readScmjSave,
    restoreScmj,
    runScmj,
    scmjCue,
    scmjLiveMatch,
    scmjPenaltyTargets,
    scmjResultLabels,
    scmjHuShape,
    tileSuit,
    writeMahjongMode,
} from '../src/visual/igs-ui/wait-stage-scmj.js';

import { voiceKeys } from '../src/visual/igs-ui/wait-stage-mahjong-voice.js';

const RIICHI_SAVE_KEY = 'igs-wait-mahjong-v1';
const MODEL = {
    names: ['绫', '凛', '咲'],
    art: { sprites: [
        { character: '绫', url: 'data:image/svg+xml,aya', mood: '笑' },
        { character: '凛', url: 'data:image/svg+xml,rin', mood: '静' },
        { character: '咲', url: 'data:image/svg+xml,saki', mood: '怒' },
    ], pictures: [] },
};

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
    };
}

function fakeDoc() {
    return { createElement(tag) {
        const node = new FakeEl(this, tag);
        node.classList = { add(value) { node.className += ` ${value}`; } };
        return node;
    } };
}

function stage() {
    const doc = fakeDoc();
    const board = doc.createElement('div');
    const storage = memoryStorage();
    const voices = [];
    const ctx = {
        doc,
        board,
        storage,
        model: MODEL,
        setNote() {},
        requestClose() { board.innerHTML = ''; },
        onVoice(payload) { voices.push(payload); },
    };
    return { board, storage, ctx, voices };
}

function clickText(board, text) {
    const node = board.querySelectorAll('button').find((item) => item.textContent === text);
    assert.ok(node, text);
    node.fire('click');
    return node;
}

function sameSuit(board) {
    const groups = [[], [], []];
    for (const node of board.querySelectorAll('.igs-scmj-tile')) {
        if (node.tagName !== 'button') continue;
        groups[tileSuit(Number(node.getAttribute('data-tile')))].push(node);
    }
    return groups.sort((left, right) => right.length - left.length);
}

test('gate:scmj:mode-switch-opens-chengdu-and-keeps-the-riichi-label', () => {
    forgetScmjTable();
    assert.equal(WAIT_STAGE_GAME_LABELS.mahjong, '麻将');
    const { board, storage, ctx } = stage();
    storage.setItem(RIICHI_SAVE_KEY, '{"marker":1}');
    startMahjong(ctx);
    assert.match(board.textContent, /立直麻将/);
    assert.match(board.textContent, /成都麻将/);
    clickText(board, '成都麻将');
    assert.equal(storage.getItem(MAHJONG_MODE_KEY), 'scmj');
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    clickText(board, '开始这局');
    assert.match(board.textContent, /成都麻将 · 血战到底/);
    assert.match(board.textContent, /庄/);
    assert.equal(storage.getItem(RIICHI_SAVE_KEY), '{"marker":1}');
    const confirm = board.querySelector('.igs-scmj-confirm');
    assert.equal(confirm.disabled, true);
    const groups = sameSuit(board);
    const other = groups.find((list) => list !== groups[0] && list.length);
    groups[0][0].fire('click');
    other[0].fire('click');
    assert.equal(other[0].getAttribute('aria-pressed'), 'true');
    assert.equal(groups[0][0].getAttribute('aria-pressed'), 'false');
    groups[0][0].fire('click');
    groups[0][1].fire('click');
    assert.equal(confirm.disabled, true);
    groups[0][2].fire('click');
    assert.equal(confirm.disabled, false);
    confirm.fire('click');
    assert.equal(board.querySelectorAll('.igs-scmj-tip').length, 0);
    assert.match(board.textContent, /对家换牌|下家换牌|上家换牌/);
    assert.equal(board.querySelectorAll('.igs-scmj-que').length, 0);
    clickText(board, board.querySelector('.is-hint').textContent);
    assert.equal(board.querySelectorAll('.igs-scmj-que').length, 4);
    const view = scmjLiveMatch().view();
    if (view.pending === 'turn') {
        const legal = new Set(view.legal);
        for (const node of board.querySelectorAll('.igs-scmj-tile')) {
            const id = Number(node.getAttribute('data-tile'));
            if (node.className.includes('is-locked')) assert.equal(legal.has(id), false);
            else assert.equal(legal.has(id), true);
        }
    }
    forgetScmjTable();
});

test('gate:scmj:pass-then-discard-keeps-the-action-buttons', () => {
    let board;
    let match;
    for (let seed = 1; seed <= 20; seed += 1) {
        forgetScmjTable();
        const made = stage();
        board = made.board;
        match = openScmjTable(made.ctx, [{ name: '你' }, { name: '绫' }, { name: '凛' }, { name: '咲' }], null, { seed });
        let guard = 0;
        while (!['action', 'result', 'final', 'stop'].includes(match.phase()) && guard < 120) {
            guard += 1;
            match.answer(greedyDecide(match.view()));
        }
        if (match.phase() === 'action') break;
    }
    assert.equal(match.phase(), 'action');
    const first = board.querySelectorAll('.igs-scmj-act');
    assert.ok(first.some((node) => node.textContent === '过'));
    match.onChange();
    const again = board.querySelectorAll('.igs-scmj-act');
    assert.equal(again.length, first.length);
    again.forEach((node, index) => assert.equal(node, first[index]));
    const before = match.controller.calls.length;
    clickText(board, '过');
    const added = match.controller.calls.slice(before).map((call) => call.name);
    assert.equal(added[0], 'guo');
    if (match.phase() === 'turn') {
        const tile = board.querySelectorAll('.igs-scmj-tile').find((node) => node.tagName === 'button');
        assert.ok(tile);
        tile.fire('click');
        assert.ok(match.controller.calls.slice(before).some((call) => call.name === 'chuPai'));
    }
    forgetScmjTable();
});

test('gate:scmj:result-waits-and-penalizes-the-lowest-score', () => {
    forgetScmjTable();
    const { board, ctx } = stage();
    const match = openScmjTable(ctx, [{ name: '你' }, { name: '绫' }, { name: '凛' }, { name: '咲' }], null, { seed: 1 });
    let guard = 0;
    while (match.phase() !== 'result' && match.phase() !== 'final' && guard < 400) {
        guard += 1;
        if (match.phase() === 'stop') break;
        match.answer(greedyDecide(match.view()));
    }
    assert.equal(match.phase(), 'result');
    assert.match(board.textContent, /继续/);
    assert.match(board.textContent, /番/);
    assert.doesNotMatch(board.textContent, /被飞/);
    const rows = board.querySelectorAll('.igs-scmj-row').map((node) => node.textContent);
    assert.ok(rows.some((text) => /七对|碰碰胡|平胡|自摸|胡|查大叫|杠上花|点杠花|抢杠胡|将对/.test(text)));
    if (board.textContent.includes('一场成都麻将血战到底刚刚打完')) {
        assert.match(board.textContent, /由.+动手/);
    }
    const handsBefore = match.hands.length;
    clickText(board, '继续');
    assert.equal(match.hands.length, handsBefore + 1);
    assert.notEqual(match.phase(), 'result');
    forgetScmjTable();
});

test('gate:scmj:a-whole-match-finishes-without-node-buffer', () => {
    const keep = globalThis.Buffer;
    delete globalThis.Buffer;
    try {
        const match = createScmjMatch({ seed: 1, policy: greedyDecide });
        assert.equal(match.phase(), 'final', '浏览器里没有 Buffer，终局存战绩不能卡住结算');
    } finally {
        globalThis.Buffer = keep;
    }
});

// 幼麟牌号：0-8 筒、9-17 条、18-26 万。
test('gate:scmj:hu-shape-names-the-special-hands-and-matches-youlin-fan', () => {
    const seat = (holds, extra = {}) => ({ index: 1, holds, pengs: [], angangs: [], diangangs: [], wangangs: [], ...extra });
    const sevens = scmjHuShape(seat([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]), { zimo: true, button: 0, discards: 9 });
    assert.deepEqual(sevens.patterns, ['七对', '清一色']);
    assert.equal(sevens.fan, 4, '七对 2 + 清一色 2 + 门清 1，封顶 4');
    const dragon = scmjHuShape(seat([1, 1, 1, 1, 10, 10, 12, 12, 20, 20, 22, 22, 24, 24]), { button: 0, discards: 9 });
    assert.deepEqual(dragon.patterns, ['龙七对']);
    const hook = scmjHuShape(seat([22, 22], { pengs: [1, 4, 10, 13] }), { kind: 'gangpao', button: 0, discards: 20 });
    assert.deepEqual(hook.patterns, ['杠上炮', '将对', '金钩胡']);
    const sea = scmjHuShape(seat([0, 1, 2, 10, 11, 12, 19, 20, 21, 4, 4, 4, 7, 7], { index: 0 }), { zimo: true, left: 0, button: 0, discards: 30 });
    assert.deepEqual(sea.patterns, ['海底']);
    assert.deepEqual(scmjHuShape(seat([0, 1, 2, 10, 11, 12, 19, 20, 21, 4, 4, 4, 7, 7], { index: 0 }), { zimo: true, button: 0, discards: 0 }).patterns, ['天胡']);
    assert.deepEqual(scmjHuShape(seat([0, 1, 2, 10, 11, 12, 19, 20, 21, 4, 4, 4, 7, 7]), { button: 0, from: 0, discards: 1 }).patterns, ['地胡']);
});

test('gate:scmj:lines-cues-and-thirty-restore-points', () => {
    const played = runScmj(1, greedyDecide);
    const events = new Set(played.lines.map((line) => line.event));
    const hasAny = (...names) => names.some((name) => events.has(name));
    const list = [...events].join(',');
    assert.ok(hasAny('peng', 'gang.an', 'gang.dian', 'gang.wan'), `碰杠：${list}`);
    assert.ok([...events].some((name) => /^(win\.|pattern\.)/.test(name)), `胡牌：${list}`);
    assert.ok([...events].some((name) => /^dealIn/.test(name)), `点炮：${list}`);
    assert.ok(events.has('open.first'), '第一局有人打招呼');
    const keys = voiceKeys('chengdu');
    for (const line of played.lines) {
        assert.ok(keys[line.event], `成都没有这个时机：${line.event}`);
        assert.doesNotMatch(line.text, /立直|荣和|放铳|默听|役满|宝牌/, line.text);
        if (line.index === 0) assert.equal(line.declared, true, '玩家只喊宣言');
    }
    assert.ok(played.cues.includes('dealin'));
    assert.equal(played.cues.includes('riichi'), false);
    assert.ok(played.cues.includes('call') || played.cues.includes('kan'));
    assert.ok(played.cues.includes('win') || played.cues.includes('lose'));
    assert.equal(scmjCue('peng'), 'call');
    assert.equal(scmjCue('gang'), 'kan');
    assert.equal(scmjCue('hu', { self: true }), 'win');
    for (const hand of played.hands) assert.equal(hand.reduce((sum, score) => sum + score, 0), 0);
    const wanted = ['huan', 'dingque', 'turn', 'action', 'computer', 'result'];
    const cuts = [];
    for (const phase of wanted) {
        const found = played.snapshots.find((shot) => shot.phase === phase);
        if (found) cuts.push(found);
    }
    for (let index = 0; cuts.length < 30 && index < played.snapshots.length; index += 1) {
        if (!cuts.includes(played.snapshots[index]) && cuts.length < 30) cuts.push(played.snapshots[index]);
    }
    assert.equal(cuts.length, 30);
    assert.ok(cuts.some((shot) => shot.phase === 'result' && shot.hold === 'result'));
    for (const shot of cuts) {
        const back = restoreScmj(1, shot.decisions, shot.hold);
        assert.equal(back.phase(), shot.phase);
        assert.deepEqual(back.publicState(), shot.state);
    }
    const rushing = played.snapshots.find((shot) => shot.state.seats[0].hued && shot.phase !== 'result' && shot.phase !== 'final');
    assert.ok(rushing, '自己胡了之后还没到结算，应该能快进');
    const rush = stage();
    openScmjTable(rush.ctx, [{ name: '你' }, { name: '绫' }, { name: '凛' }, { name: '咲' }], {
        seed: 1,
        decisions: rushing.decisions,
        hold: rushing.hold,
    });
    assert.equal(rush.voices.length, 0);
    forgetScmjTable();
    const fresh = stage();
    openScmjTable(fresh.ctx, [{ name: '你' }, { name: '绫' }, { name: '凛' }, { name: '咲' }], null, { seed: 1 });
    assert.deepEqual(scmjLiveMatch().lines.map((line) => line.event), ['open.first'], '新开一桌停着等换牌时也先打招呼');
    assert.equal(fresh.voices.length, 1);
    forgetScmjTable();
    openScmjTable(rush.ctx, [{ name: '你' }, { name: '绫' }, { name: '凛' }, { name: '咲' }], {
        seed: 1,
        decisions: rushing.decisions,
        hold: rushing.hold,
    });
    clickText(rush.board, '快进');
    assert.equal(scmjLiveMatch().fast, true);
    forgetScmjTable();
    const done = restoreScmj(1, played.decisions);
    const finalShot = played.snapshots[played.snapshots.length - 1];
    assert.equal(done.phase(), 'final');
    assert.deepEqual(done.publicState().totals, finalShot.state.totals);
    assert.equal(done.lines.length, 0);
    assert.equal(done.cues.length, 0);
});

test('gate:scmj:fold-resume-and-dissolve-keep-the-two-saves-apart', () => {
    forgetScmjTable();
    const { board, storage, ctx } = stage();
    storage.setItem(RIICHI_SAVE_KEY, '{"marker":1}');
    writeMahjongMode(storage, 'scmj');
    startMahjong(ctx);
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    clickText(board, '开始这局');
    const live = scmjLiveMatch();
    const root = board.querySelector('.igs-scmj');
    board.querySelector('[aria-label="收起牌桌，这一局留着"]').fire('click');
    assert.equal(board.querySelector('.igs-scmj'), null);
    assert.equal(scmjLiveMatch(), live);
    const folded = ctx.doc.createElement('div');
    startMahjong({ ...ctx, board: folded });
    assert.equal(folded.querySelector('.igs-scmj'), root);
    writeMahjongMode(storage, 'riichi');
    const riichiBoard = ctx.doc.createElement('div');
    startMahjong({ ...ctx, board: riichiBoard });
    assert.match(riichiBoard.textContent, /选择对手/);
    assert.match(riichiBoard.textContent, /立直麻将/);
    assert.equal(storage.getItem(SCMJ_SAVE_KEY) != null, true);
    writeMahjongMode(storage, 'scmj');
    const resumed = ctx.doc.createElement('div');
    startMahjong({ ...ctx, board: resumed });
    assert.match(resumed.textContent, /成都麻将 · 血战到底/);
    resumed.querySelector('[aria-label="结束这局（进度不留）"]').fire('click');
    assert.equal(storage.getItem(SCMJ_SAVE_KEY), null);
    assert.equal(scmjLiveMatch(), null);
    assert.equal(storage.getItem(RIICHI_SAVE_KEY), '{"marker":1}');
    const after = ctx.doc.createElement('div');
    startMahjong({ ...ctx, board: after });
    assert.match(after.textContent, /选择对手/);
    forgetScmjTable();
});

test('gate:scmj:final-card-can-start-again-or-return-to-the-picker', () => {
    forgetScmjTable();
    const played = runScmj(2, greedyDecide);
    const { board, ctx } = stage();
    let opened = 0;
    const match = openScmjTable(ctx, [{ name: '你' }, { name: '绫' }, { name: '凛' }, { name: '咲' }], {
        seed: 2,
        decisions: played.decisions,
        hold: '',
    }, { onPicker() { opened += 1; board.textContent = '麻将 · 选择对手'; } });
    assert.equal(match.phase(), 'final');
    assert.match(board.textContent, /再来一局/);
    assert.match(board.textContent, /换对手/);
    assert.match(board.textContent, /自摸/);
    assert.match(board.textContent, /点炮/);
    clickText(board, '换对手');
    assert.equal(opened, 1);
    assert.equal(readScmjSave(ctx.storage), null);
    forgetScmjTable();
});

test('gate:scmj:penalty-and-style-do-not-reuse-riichi-busts-or-motion', () => {
    const targets = scmjPenaltyTargets([
        { id: '你', score: -1 },
        { id: '绫', score: 8 },
        { id: '凛', score: -6 },
        { id: '咲', score: -1 },
    ]);
    assert.deepEqual(targets.losers, ['你', '凛', '咲'], '负分都罚，不只罚最低的那一家');
    assert.equal(targets.punisher, '绫');
    assert.deepEqual(scmjPenaltyTargets([{ id: '你', score: 0 }, { id: '绫', score: 4 }, { id: '凛', score: 0 }]).losers, [], '没有负分不罚');
    assert.deepEqual(scmjPenaltyTargets([{ id: '你', score: 0 }, { id: '绫', score: 0 }]).losers, []);
    const chengdu = penaltyBrief({
        targets: targets.losers,
        punisher: targets.punisher,
        rules: 'chengdu',
        present: ['你', '绫', '凛', '咲'],
        request: '罚她们跪好',
        outfits: { 绫: '校服', 凛: '礼服', 咲: '泳装' },
    });
    assert.match(chengdu.description, /一场成都麻将血战到底刚刚打完/);
    assert.match(chengdu.description, /这一局分数都为负/);
    assert.match(chengdu.description, /受惩罚的是凛、咲/);
    assert.match(chengdu.description, /旁观的是没有/);
    assert.match(chengdu.description, /绫在画面里动手执行惩罚/);
    assert.match(chengdu.description, /最大化地细化/);
    assert.match(chengdu.description, /不要另画一张意思相近的图/);
    assert.deepEqual(chengdu.characters, ['绫', '凛', '咲']);
    assert.deepEqual(chengdu.outfits, { 绫: '校服', 凛: '礼服', 咲: '泳装' });
    const watching = penaltyBrief({
        targets: ['凛'],
        punisher: '你',
        rules: 'chengdu',
        present: ['你', '绫', '凛', '咲'],
        request: '罚她唱歌',
        nsfw: true,
    });
    assert.deepEqual(watching.characters, ['凛', '绫', '咲']);
    assert.deepEqual(watching.strip, ['凛']);
    assert.match(watching.description, /受惩罚的是凛/);
    assert.match(watching.description, /旁观的是绫、咲/);
    const riichi = penaltyBrief({ targets: ['绫'], punisher: '你' });
    assert.match(riichi.description, /立直麻将的一局刚刚打完/);
    const labels = scmjResultLabels({ pattern: 'duidui', actions: [{ type: 'chadajiao' }, { type: 'zimo' }], numofgen: 2, fan: 4 });
    assert.deepEqual(labels, ['碰碰胡', '查大叫', '自摸', '根×2']);
    for (const name of ['igs-scmj-banner', 'igs-scmj-act', 'igs-scmj-tile', 'igs-scmj-say', 'igs-scmj-que', 'igs-scmj-hued']) {
        const rules = SCMJ_STYLE.match(new RegExp(`\\.${name}(\\.is-hint|\\.is-locked)?\\{[^}]*\\}`, 'g')) || [];
        assert.ok(rules.length, name);
        for (const rule of rules) assert.doesNotMatch(rule, /transition|animation|transform/);
    }
});
